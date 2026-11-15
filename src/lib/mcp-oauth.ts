import {randomBytes} from "node:crypto";
import type {Db} from "mongodb";
import {isChatGptClientId,oauthEnabled,oauthOrigin,oauthResource,OAUTH_SCOPE,matchExactSecret,sha256,validateClientMetadata,verifyPkce,consentTokenSelector,consentReplayAllowed} from "./mcp-oauth-helpers";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
const REQUEST_MINUTES=20;
const CONSENT_REPLAY_SECONDS=90;
const ACCESS_SECONDS=3600;
const REFRESH_DAYS=30;
export const oauthHeaders={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
export type ConsentRequest={
 _id:string;clientId:string;redirectUri:string;state:string;challenge:string;scope:string;resource:string;
 csrfHash:string;csrfHashes?:string[];expiresAt:Date;
 completedAt?:Date;completedDecision?:"approve"|"deny";completedCode?:string;replayUntil?:Date;
};
type OAuthCode={_id:string;clientId:string;redirectUri:string;scope:string;challenge:string;resource:string;expiresAt:Date};
type OAuthToken={_id:string;type:"access"|"refresh";clientId:string;scope:string;resource:string;expiresAt:Date};
export function newSecret():string{return randomBytes(32).toString("base64url");}
export function oauthError(error:string,status=400):Response{
 return Response.json({error},{status,headers:oauthHeaders});
}
export async function verifyChatGptClient(clientId:string,redirectUri:string):Promise<boolean>{
 if(!isChatGptClientId(clientId))return false;
 try{
  const response=await fetch(clientId,{method:"GET",redirect:"error",cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(4500)});
  if(!response.ok||Number(response.headers.get("content-length")||0)>16384)return false;
  const raw=await response.text();
  if(raw.length>16384)return false;
  return validateClientMetadata(clientId,redirectUri,JSON.parse(raw));
 }catch{return false;}
}
export async function createConsent(input:Omit<ConsentRequest,"_id"|"csrfHash"|"expiresAt">):Promise<{id:string;csrf:string}>{
 const id="r:"+newSecret(),csrf=newSecret();
 const doc:ConsentRequest={...input,_id:id,csrfHash:sha256(csrf),expiresAt:new Date(Date.now()+REQUEST_MINUTES*60_000)};
 await (await db()).collection<ConsentRequest>("mcp_oauth_consents").insertOne(doc);
 console.info("[forgepulse-oauth] Consent created",{flow:sha256(id.slice(2)).slice(0,12),ttlMinutes:REQUEST_MINUTES});
 return {id:id.slice(2),csrf};
}
export async function renewConsent(id:string):Promise<{doc:ConsentRequest;csrf:string}|null>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(id))return null;
 const csrf=newSecret(),doc=await (await db()).collection<ConsentRequest>("mcp_oauth_consents").findOneAndUpdate(
  {_id:"r:"+id,expiresAt:{$gt:new Date()},completedAt:{$exists:false}},{$addToSet:{csrfHashes:sha256(csrf)}},{returnDocument:"after"});
 return doc?{doc,csrf}:null;
}
function completedConsentRedirect(row:ConsentRequest):{redirect:string}|null{
 const redirect=new URL(row.redirectUri);
 redirect.searchParams.set("state",row.state);
 redirect.searchParams.set("iss",oauthOrigin());
 if(row.completedDecision==="deny")redirect.searchParams.set("error","access_denied");
 else if(row.completedDecision==="approve"&&row.completedCode)redirect.searchParams.set("code",row.completedCode);
 else return null;
 return {redirect:redirect.toString()};
}
export async function completeConsent(id:string,csrf:string,approve:boolean):Promise<{redirect:string}|null>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(id)||!/^[A-Za-z0-9_-]{43}$/.test(csrf))return null;
 const database=await db(),consents=database.collection<ConsentRequest>("mcp_oauth_consents");
 const now=new Date(),selector=consentTokenSelector(id,csrf,now),flow=sha256(id).slice(0,12);
 const row=await consents.findOne(selector);
 if(!row){
  const remaining=await consents.findOne({_id:"r:"+id},{projection:{expiresAt:1,completedAt:1}});
  const reason=!remaining?"record_missing_or_ttl_expired":remaining.expiresAt<=now?"expired":remaining.completedAt?"already_completed":"invalid_form_token";
  console.warn("[forgepulse-oauth] Consent unavailable",{flow,reason});
  return null;
 }
 if(row.completedAt){
  if(consentReplayAllowed(row,approve,now)){
   console.info("[forgepulse-oauth] Replayed completed consent",{flow});
   return completedConsentRedirect(row);
  }
  console.warn("[forgepulse-oauth] Consent replay rejected",{flow,reason:"decision_mismatch_or_replay_expired"});
  return null;
 }
 // Create the code BEFORE atomically finalizing the consent. If inserting the code
 // fails, the consent stays pending and is safe to retry.
 const codes=database.collection<OAuthCode>("mcp_oauth_codes"), completedAt=new Date();
 const replayUntil=new Date(completedAt.getTime()+CONSENT_REPLAY_SECONDS*1000);
 const decision=approve?"approve":"deny";
 let code:string|undefined,codeRow:OAuthCode|undefined;
 if(approve){
  code=newSecret();
  codeRow={
   _id:"c:"+sha256(code),clientId:row.clientId,redirectUri:row.redirectUri,
   scope:row.scope,challenge:row.challenge,resource:row.resource,
   expiresAt:new Date(completedAt.getTime()+120_000)
  };
  await codes.insertOne(codeRow);
 }
 // A single compare-and-set decides the winner across Vercel instances.
 // Keep the receipt for 90s so mobile/webview duplicate POSTs receive the
 // same redirect. The authorization code remains single-use in exchangeCode.
 const accepted=await consents.findOneAndUpdate(
  {...consentTokenSelector(id,csrf,new Date()),completedAt:{$exists:false}},
  {$set:{completedAt,completedDecision:decision,...(code?{completedCode:code}:{}),replayUntil,expiresAt:replayUntil}},
  {returnDocument:"after"}
 );
 if(accepted){
  console.info("[forgepulse-oauth] Consent completed",{flow,decision});
  return completedConsentRedirect(accepted);
 }
 // Another request won, or the request expired while this one was processing.
 // Remove only the unexposed losing code; never make a second valid grant.
 if(codeRow)await codes.deleteOne({_id:codeRow._id});
 const winner=await consents.findOne(consentTokenSelector(id,csrf,new Date()));
 if(consentReplayAllowed(winner,approve)){
  console.info("[forgepulse-oauth] Concurrent consent retry",{flow});
  return completedConsentRedirect(winner!);
 }
 console.warn("[forgepulse-oauth] Consent unavailable",{flow,reason:"expired_or_conflicting_decision"});
 return null;
}
async function mintTokens(record:{clientId:string;scope:string;resource:string}):Promise<Record<string,unknown>>{
 const access=newSecret(),refresh=newSecret();
 const database=await db(),now=Date.now();
 await database.collection<OAuthToken>("mcp_oauth_tokens").insertMany([
  {_id:"a:"+sha256(access),type:"access",clientId:record.clientId,scope:record.scope,resource:record.resource,expiresAt:new Date(now+ACCESS_SECONDS*1000)},
  {_id:"f:"+sha256(refresh),type:"refresh",clientId:record.clientId,scope:record.scope,resource:record.resource,expiresAt:new Date(now+REFRESH_DAYS*86400_000)}
 ]);
 return {access_token:access,token_type:"Bearer",expires_in:ACCESS_SECONDS,refresh_token:refresh,scope:record.scope};
}
export async function exchangeCode(params:URLSearchParams):Promise<Record<string,unknown>|null>{
 const code=params.get("code"),clientId=params.get("client_id"),redirectUri=params.get("redirect_uri"),verifier=params.get("code_verifier");
 if(!code||!clientId||!redirectUri||!verifier||!params.has("resource")||params.get("resource")!==oauthResource())return null;
 if(!/^[A-Za-z0-9_-]{43}$/.test(code))return null;
 const database=await db();
 const record=await database.collection<OAuthCode>("mcp_oauth_codes").findOneAndDelete({
  _id:"c:"+sha256(code),clientId,redirectUri,resource:oauthResource(),expiresAt:{$gt:new Date()}
 });
 if(!record||!verifyPkce(record.challenge,verifier))return null;
 return mintTokens(record);
}
export async function refreshAccess(params:URLSearchParams):Promise<Record<string,unknown>|null>{
 const refresh=params.get("refresh_token"),clientId=params.get("client_id");
 if(!refresh||!clientId||(params.has("resource")&&params.get("resource")!==oauthResource()))return null;
 if(!/^[A-Za-z0-9_-]{43}$/.test(refresh))return null;
 const database=await db();
 const record=await database.collection<OAuthToken>("mcp_oauth_tokens").findOneAndDelete({
  _id:"f:"+sha256(refresh),type:"refresh",clientId,resource:oauthResource(),expiresAt:{$gt:new Date()}
 });
 return record?mintTokens(record):null;
}
export async function verifyMcpOauthAccess(token:string|null,requiredScope:"mcp:read"|"mcp:write"="mcp:read"):Promise<boolean>{
 if(!oauthEnabled()||!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return false;
 const row=await (await db()).collection<OAuthToken>("mcp_oauth_tokens").findOne({
  _id:"a:"+sha256(token),type:"access",resource:oauthResource(),expiresAt:{$gt:new Date()}
 });
 return !!row&&row.scope.split(/\s+/).includes(requiredScope);
}
export function oauthChallenge():string{
 const scopes=process.env.MCP_WRITE_ENABLED==="true"?`${OAUTH_SCOPE} mcp:write`:OAUTH_SCOPE;
 return 'Bearer resource_metadata="'+oauthOrigin()+'/.well-known/oauth-protected-resource", scope="'+scopes+'"';
}
export function safeOauthResponse(data:Record<string,unknown>):Response{
 return Response.json(data,{headers:{...oauthHeaders,"Pragma":"no-cache"}});
}
export function csrfCookie(value:string):string{
 return "forgepulse_oauth_csrf="+value+"; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Lax; Max-Age="+REQUEST_MINUTES*60;
}
export function readCsrfCookie(cookie:string|null):string{
 const match=(cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("forgepulse_oauth_csrf="));
 return match?match.slice("forgepulse_oauth_csrf=".length):"";
}
export function noLeaksEqual(a:string,b:string):boolean{return matchExactSecret(a,b);}
