import {randomBytes} from 'node:crypto';
import {MongoClient, type Db} from 'mongodb';
import type {NextRequest} from 'next/server';
import {gameFirebaseAuth} from './game-firebase-auth';
import {googleRewardKey,probeGoogleRewardKeys} from './admob-ssv-keys';
import {CLOCK_SKEW_MS, OPPORTUNITY_LIFETIME_MS, SsvError, hashId, isRequestId, opportunityId, parseCallback, rewardPolicies, verifyCallback, verifySignature, type AdPlacement, type VerifiedReward} from './admob-ssv-contract';

type Opportunity={_id:string;uid:string;requestId:string;placement:AdPlacement;context:string;customData:string;createdAt:number;transactionId?:string;verifiedAt?:number;sdkEarnedAt?:number;clientDeliveredAt?:number;outcome?:string};
type Receipt={_id:string;transactionId:string;opportunityId:string;uid:string;placement:AdPlacement;timestamp:number;verifiedAt:number;digest:string;mode:'observe';entitlement:{kind:'revive'|'standard_orb_and_upgrade_point';quantity:1}};
let connection:Promise<{client:MongoClient;db:Db}>|undefined;
const HEADERS={'Cache-Control':'private, no-store'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:HEADERS});
async function database(){
  if(!connection){
    const uri=process.env.MONGODB_URI,name=process.env.MONGODB_DB;
    if(!uri || !name) throw new SsvError('storage_not_configured',503);
    const client=new MongoClient(uri,{maxPoolSize:5,serverSelectionTimeoutMS:6000});
    connection=client.connect().then(async c=>{
      const db=c.db(name);
      await db.collection('admob_opportunities_v1').createIndex({customData:1},{unique:true});
      await db.collection('admob_entitlements_v1').createIndex({uid:1,verifiedAt:-1});
      await db.collection('admob_issuance_v1').createIndex({expiresAt:1},{expireAfterSeconds:0});
      return {client:c,db};
    }).catch(error=>{connection=undefined;void client.close();throw error;});
  }
  return connection;
}
async function uidFor(request:NextRequest){
  const bearer=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('authorization')||'');
  if(!bearer) throw new SsvError('authentication_required',401);
  const auth=gameFirebaseAuth();
  try{return (await auth.verifyIdToken(bearer[1],true)).uid;}
  catch{throw new SsvError('authentication_required',401);}
}
async function bodyFor(request:NextRequest):Promise<Record<string,unknown>>{
  if(Number(request.headers.get('content-length')||0)>4096) throw new SsvError('body_too_large',413);
  if(!request.body) throw new SsvError('invalid_request');
  const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new SsvError('body_too_large',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  let value:unknown;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new SsvError('invalid_request');}
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new SsvError('invalid_request');
  return value as Record<string,unknown>;
}
function responseError(error:unknown){
  if(error instanceof SsvError) return json({ok:false,error:error.code},error.status);
  // Never log callback URLs, tokens, custom data, UIDs or database credentials.
  console.error('AdMob SSV service failed',error instanceof Error?error.name:'Error');
  return json({ok:false,error:'service_unavailable'},503);
}

/** Creates no spendable reward. Only a signed Google callback creates a verified entitlement. */
export async function opportunityResponse(request:NextRequest){
  try{
    const uid=await uidFor(request),body=await bodyFor(request);
    const {requestId,placement,context}=body;
    if(Object.keys(body).some(k=>!['requestId','placement','context'].includes(k)) || !isRequestId(requestId) || !['revive','orb'].includes(String(placement)) || typeof context!=='string' || !/^[A-Za-z0-9:_-]{1,180}$/.test(context)) throw new SsvError('invalid_request');
    rewardPolicies(); // Fail closed for SSV preparation; Android keeps its existing SDK reward path.
    const {db}=await database();const col=db.collection<Opportunity>('admob_opportunities_v1');
    const id=opportunityId(uid,requestId),now=Date.now();
    const previous=await col.findOne({_id:id});
    if(previous){
      if(previous.context!==context || previous.placement!==placement || previous.createdAt+OPPORTUNITY_LIFETIME_MS<now) throw new SsvError('opportunity_conflict',409);
      return json({ok:true,mode:'observe',userId:uid,customData:previous.customData,requestId,expiresAt:previous.createdAt+OPPORTUNITY_LIFETIME_MS});
    }
    // Bounded atomic per-player issuance quota; a failed creation may consume quota, never grant.
    const quotaId=hashId(`${uid}:${Math.floor(now/300_000)}`);
    const quota=db.collection<{_id:string;count:number;expiresAt:Date}>('admob_issuance_v1');
    try{
      const q=await quota.findOneAndUpdate({_id:quotaId,count:{$lt:15}},{$inc:{count:1},$setOnInsert:{expiresAt:new Date(now+3600_000)}},{upsert:true,returnDocument:'after'});
      if(!q) throw new SsvError('rate_limited',429);
    }catch(error){if((error as {code?:number}).code===11000) throw new SsvError('rate_limited',429);throw error;}
    const row:Opportunity={_id:id,uid,requestId,placement:placement as AdPlacement,context,customData:`v1.${placement}.${randomBytes(32).toString('base64url')}`,createdAt:now};
    try{await col.insertOne(row);}catch(error){if((error as {code?:number}).code!==11000)throw error;const existing=await col.findOne({_id:id});if(!existing || existing.context!==context || existing.placement!==placement)throw new SsvError('opportunity_conflict',409);row.customData=existing.customData;row.createdAt=existing.createdAt;}
    return json({ok:true,mode:'observe',userId:uid,customData:row.customData,requestId,expiresAt:row.createdAt+OPPORTUNITY_LIFETIME_MS});
  }catch(error){return responseError(error);}
}

/** Exact binding to an authenticated, server-issued opportunity and its event time. */
export function validateOpportunity(row:Opportunity|null,reward:VerifiedReward){
  if(!row || row.uid!==reward.uid || row.customData!==reward.customData || row.placement!==reward.policy.placement) throw new SsvError('opportunity_mismatch',403);
  if(reward.timestamp<row.createdAt-CLOCK_SKEW_MS || reward.timestamp>row.createdAt+OPPORTUNITY_LIFETIME_MS) throw new SsvError('opportunity_expired',403);
  if(row.transactionId && row.transactionId!==reward.transactionId) throw new SsvError('opportunity_already_used',409);
}

export async function callbackResponse(request:NextRequest){
  try{
    const raw=request.url.split('?',2)[1]||'';
    const parsed=parseCallback(raw);
    const key=await googleRewardKey(parsed.keyId);
    verifySignature(parsed,key); // Reject forged requests even while reward policy is unconfigured.
    const reward=verifyCallback(parsed,key,rewardPolicies());
    const {client,db}=await database();
    // AdMob Verify URL can use these explicit diagnostic values. Never creates player rewards.
    if(reward.uid==='ssv-diagnostic' && reward.customData==='ssv-diagnostic-v1'){
      await db.collection('admob_ssv_diagnostics_v1').updateOne({_id:hashId(reward.transactionId) as never},{$setOnInsert:{verifiedAt:Date.now(),adUnit:reward.policy.adUnit,digest:reward.digest}},{upsert:true});
      return json({ok:true,diagnostic:true,rewardGranted:false});
    }
    const opportunities=db.collection<Opportunity>('admob_opportunities_v1');
    const receipts=db.collection<Receipt>('admob_entitlements_v1');
    const session=client.startSession();let duplicate=false;
    try{await session.withTransaction(async()=>{
      const old=await receipts.findOne({_id:hashId(reward.transactionId)},{session});
      if(old){
        if(old.uid!==reward.uid || old.digest!==reward.digest) throw new SsvError('transaction_conflict',409);
        duplicate=true;return;
      }
      const row=await opportunities.findOne({uid:reward.uid,customData:reward.customData},{session});
      validateOpportunity(row,reward);
      const verifiedAt=Date.now();
      await receipts.insertOne({_id:hashId(reward.transactionId),transactionId:reward.transactionId,opportunityId:row!._id,uid:reward.uid,placement:reward.policy.placement,timestamp:reward.timestamp,verifiedAt,digest:reward.digest,mode:'observe',entitlement:{kind:reward.policy.placement==='revive'?'revive':'standard_orb_and_upgrade_point',quantity:1}},{session});
      const updated=await opportunities.updateOne({_id:row!._id,transactionId:{$exists:false}},{$set:{transactionId:reward.transactionId,verifiedAt}},{session});
      if(updated.modifiedCount!==1) throw new SsvError('opportunity_already_used',409);
    },{writeConcern:{w:'majority'},readConcern:{level:'snapshot'}});}finally{await session.endSession();}
    // Google retries non-200. Replays are acknowledged but never create another entitlement.
    return json({ok:true,duplicate,mode:'observe',rewardGranted:false});
  }catch(error){
    // A reason code is sufficient for production diagnosis. Never log the signed URL,
    // signature, custom data, player identity or request headers.
    if(error instanceof SsvError) console.warn('AdMob SSV callback rejected',error.code);
    return responseError(error);
  }
}

export async function statusResponse(request:NextRequest){
  try{
    const uid=await uidFor(request),body=await bodyFor(request);
    if(Object.keys(body).some(k=>k!=='requestIds') || !Array.isArray(body.requestIds) || body.requestIds.length>20 || body.requestIds.some(id=>!isRequestId(id))) throw new SsvError('invalid_request');
    const {db}=await database();
    const rows=await db.collection<Opportunity>('admob_opportunities_v1').find({_id:{$in:body.requestIds.map(id=>opportunityId(uid,id))},uid},{projection:{requestId:1,placement:1,context:1,verifiedAt:1,clientDeliveredAt:1}}).toArray();
    return json({ok:true,mode:'observe',opportunities:rows.map(row=>({requestId:row.requestId,placement:row.placement,context:row.context,verified:!!row.verifiedAt,delivered:!!row.clientDeliveredAt}))});
  }catch(error){return responseError(error);}
}
export async function deliveryResponse(request:NextRequest){
  try{
    const uid=await uidFor(request),body=await bodyFor(request);
    const {requestId,state,outcome}=body;
    if(Object.keys(body).some(k=>!['requestId','state','outcome'].includes(k)) || !isRequestId(requestId) || !['sdk_earned','delivered'].includes(String(state)) || (outcome!==undefined && !['revive','orb_and_point','point_orb_pending','already_applied'].includes(String(outcome)))) throw new SsvError('invalid_request');
    const {db}=await database();const field=state==='sdk_earned'?'sdkEarnedAt':'clientDeliveredAt';
    // This is untrusted delivery telemetry, deliberately separate from Google verification.
    await db.collection<Opportunity>('admob_opportunities_v1').updateOne({_id:opportunityId(uid,requestId),uid,[field]:{$exists:false}},{$set:{[field]:Date.now(),...(outcome?{outcome:String(outcome)}:{})}});
    return json({ok:true,mode:'observe'});
  }catch(error){return responseError(error);}
}

/** Public readiness contains only booleans, never player, database or credential details. */
export async function healthResponse(){
  let policyReady=false,keysReady=false,databaseReady=false,googleCallbackVerified=false;
  try{rewardPolicies();policyReady=true;}catch{/* Fail closed until actual unit settings are supplied. */}
  await Promise.all([
    probeGoogleRewardKeys().then(()=>{keysReady=true;}).catch(()=>{}),
    database().then(async({db})=>{
      await db.command({ping:1});
      const topology=await db.command({hello:1});
      databaseReady=!!topology.setName || topology.msg==='isdbgrid';
      googleCallbackVerified=!!(await db.collection('admob_ssv_diagnostics_v1').findOne({},{projection:{_id:1}})) ||
        !!(await db.collection('admob_entitlements_v1').findOne({},{projection:{_id:1}}));
    }).catch(()=>{})
  ]);
  const ready=policyReady && keysReady && databaseReady;
  return json({ok:ready,service:'admob-ssv',version:1,mode:'observe',policyReady,keysReady,databaseReady,deviceVerified:false,googleCallbackVerified},ready?200:503);
}
