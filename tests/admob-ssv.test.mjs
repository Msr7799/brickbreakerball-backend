import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {generateKeyPairSync,sign} from 'node:crypto';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const env={MONGODB_URI:'mock://memory',MONGODB_DB:'ssv_test',ADMOB_SSV_REVIVE_REWARD_ITEM:'Revive',ADMOB_SSV_REVIVE_REWARD_AMOUNT:'1',ADMOB_SSV_ORB_REWARD_ITEM:'Orb Reward Pack',ADMOB_SSV_ORB_REWARD_AMOUNT:'1'};
function load(name,mocks={}){
  const source=fs.readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(js,{module:mod,exports:mod.exports,require:id=>id in mocks?mocks[id]:require(id),process:{env},console,Buffer,Response,URLSearchParams,Date,AbortSignal,fetch});
  return mod.exports;
}
const contract=load('admob-ssv-contract');
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const now=Date.now();
const uid='firebase-player-a',requestId='ad-11111111-1111-4111-8111-111111111111';
const customData='v1.revive.'+'a'.repeat(43);
function query(changes={},key=privateKey){
  const fields={ad_network:'5450213213286189855',ad_unit:'1402410648',custom_data:customData,reward_amount:'1',reward_item:'Revive',timestamp:String(now),transaction_id:'abc123def4567890abc123def4567890',user_id:uid,...changes};
  // Match URI.getQuery() in Google's Tink verifier: percent-decode once, preserve literal '+'.
  const content=Object.entries(fields).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${content}&signature=${sign('sha256',Buffer.from(decodeURIComponent(content)),key).toString('base64url')}&key_id=7`;
}
function checked(raw=query()){return contract.verifyCallback(contract.parseCallback(raw),publicKey,contract.rewardPolicies(env),now);}
test('valid ECDSA DER/SHA256 matches Google URI.getQuery percent decoding',()=>{
  assert.equal(checked().uid,uid);
  assert.equal(checked(query({reward_item:'Revive'})).policy.placement,'revive');
  const policy=[{placement:'orb',adUnit:'3630339929',item:'orb + point',amount:1}];
  const parsed=contract.parseCallback(query({ad_unit:'3630339929',reward_item:'orb + point'}));
  assert.match(parsed.signedContent,/orb \+ point/);
  assert.equal(contract.verifyCallback(parsed,publicKey,policy,now).policy.placement,'orb');
});
test('the actual Orb Reward Pack diagnostic accepts percent-encoded spaces with a decoded signature',()=>{
  const raw=query({ad_unit:'3630339929',reward_item:'Orb Reward Pack',user_id:'ssv-diagnostic',custom_data:'ssv-diagnostic-v1'});
  assert.match(raw,/reward_item=Orb%20Reward%20Pack/);
  assert.equal(checked(raw).policy.placement,'orb');
});
test('literal plus has URI semantics and encoded delimiters cannot change signed field boundaries',()=>{
  const raw=query({reward_item:'orb + point'});
  const policy=[{placement:'revive',adUnit:'1402410648',item:'orb + point',amount:1}];
  assert.equal(contract.verifyCallback(contract.parseCallback(raw.replace('%2B','+')),publicKey,policy,now).policy.item,'orb + point');
  // A signer of one value must not authorize a different set of query fields.
  assert.throws(()=>contract.parseCallback(query({custom_data:'safe&reward_amount=2'})),/ambiguous_query/);
  assert.throws(()=>contract.parseCallback(query({custom_data:'safe=value'})),/ambiguous_query/);
  assert.throws(()=>checked(query().replace('custom_data=','custom_data=%2526')),/invalid_signature/);
});
test('tampering, wrong signing key, duplicate fields and signature reordering are rejected',()=>{
  assert.throws(()=>checked(query().replace('reward_amount=1','reward_amount=2')),/invalid_signature/);
  const attacker=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  assert.throws(()=>checked(query({},attacker.privateKey)),/invalid_signature/);
  assert.throws(()=>contract.parseCallback(query().replace('&reward_amount=1','&reward_amount=1&reward_amount=1')),/ambiguous_query/);
  assert.throws(()=>contract.parseCallback(query()+'&user_id=someone'),/invalid_signature_fields/);
  assert.throws(()=>contract.parseCallback(query().replace('signature=','signature=%ZZ')),/invalid_query/);
});
test('a signed callback cannot substitute the unit, reward amount, item, UID shape or clock',()=>{
  for(const fields of [{ad_unit:'1043011477'},{reward_amount:'2'},{reward_item:'coins'},{timestamp:String(now+301000)},{timestamp:String(now-86400001)},{timestamp:'150777823'},{transaction_id:'../forged'}]) assert.throws(()=>checked(query(fields)));
  assert.throws(()=>contract.rewardPolicies({}),/reward_policy_not_configured/);
});
test('Google millisecond and microsecond timestamps share the same strict freshness window',()=>{
  assert.equal(checked(query({timestamp:String(now*1000+999)})).timestamp,now);
  for(const value of [(now+301000)*1000,(now-86400001)*1000,Math.floor(now/1000),now*1000000]) {
    assert.throws(()=>checked(query({timestamp:String(value)})),/invalid_timestamp/);
  }
});
test('unknown key content cannot become a trusted key set',()=>{
  assert.throws(()=>contract.parseGoogleKeys({keys:[]}));
  assert.throws(()=>contract.parseGoogleKeys({keys:[{keyId:7,pem:'bad'}]}));
  assert.equal(contract.parseGoogleKeys({keys:[{keyId:7,pem:publicKey.export({type:'spki',format:'pem'})}]}).size,1);
});

// Deterministic database adapter: exercises actual HTTP handlers without starting a server/database.
function fakeDatabase(){
  const collections=new Map();let lock=Promise.resolve();
  const matches=(row,filter)=>Object.entries(filter).every(([key,value])=>{
    if(value && typeof value==='object'){
      if('$exists' in value)return (key in row)===value.$exists;
      if('$in' in value)return value.$in.includes(row[key]);
      if('$lt' in value)return row[key]<value.$lt;
    }
    return row[key]===value;
  });
  const db={collection(name){
    if(!collections.has(name))collections.set(name,new Map());
    const rows=collections.get(name);
    return {
      async createIndex(){return 'test_index';},
      async findOne(filter){const row=[...rows.values()].find(r=>matches(r,filter));return row?structuredClone(row):null;},
      find(filter){return {toArray:async()=>[...rows.values()].filter(r=>matches(r,filter)).map(r=>structuredClone(r))};},
      async insertOne(row){if(rows.has(row._id))throw Object.assign(new Error('duplicate'),{code:11000});rows.set(row._id,structuredClone(row));return {};},
      async updateOne(filter,update,options={}){
        let row=[...rows.values()].find(r=>matches(r,filter));
        const fresh=!row;
        if(fresh && !options.upsert)return {matchedCount:0,modifiedCount:0};
        if(fresh){if(rows.has(filter._id))throw Object.assign(new Error('duplicate'),{code:11000});row={_id:filter._id};}
        Object.assign(row,update.$set??{},fresh?update.$setOnInsert??{}:{});
        for(const [k,value]of Object.entries(update.$inc??{}))row[k]=(row[k]??0)+value;
        rows.set(row._id,row);return {matchedCount:1,modifiedCount:1};
      },
      async findOneAndUpdate(filter,update,options){await this.updateOne(filter,update,options);return this.findOne({_id:filter._id});}
    };
  }};
  class MongoClient{
    async connect(){return this;}db(){return db;}async close(){}
    startSession(){return {async withTransaction(action){
      const previous=lock;let unlock;lock=new Promise(r=>{unlock=r;});await previous;
      const snapshots=[...collections.values()].map(rows=>[rows,structuredClone([...rows.entries()])]);
      try{return await action();}catch(error){for(const [rows,snapshot]of snapshots){rows.clear();for(const [k,v]of snapshot)rows.set(k,v);}throw error;}finally{unlock();}
    },async endSession(){}};}
  }
  return {MongoClient,collections};
}
function handlers(){
  const store=fakeDatabase();
  const api=load('admob-ssv',{
    './admob-ssv-contract':contract,
    './admob-ssv-keys':{googleRewardKey:async id=>{if(id!=='7')throw new contract.SsvError('unknown_key',403);return publicKey;}},
    './game-firebase-auth':{gameFirebaseAuth:()=>({verifyIdToken:async(token,revocation)=>{assert.equal(revocation,true);if(!['playerA','playerB'].includes(token))throw new Error('bad token');return {uid:token==='playerA'?uid:'firebase-player-b'};}})},
    mongodb:{MongoClient:store.MongoClient}
  });
  return {api,...store};
}
const request=(body,token='playerA')=>new Request('https://server/api/rewards/ads/test',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
const callback=raw=>new Request(`https://server/api/admob/ssv?${raw}`);
async function prepared(api){const res=await api.opportunityResponse(request({requestId,placement:'revive',context:'run-a:revive:0'}));assert.equal(res.status,200);return res.json();}
test('Firebase auth binds opportunity/status/delivery; invalid payloads never create tickets',async()=>{
  const {api,collections}=handlers();
  assert.equal((await api.opportunityResponse(request({},'invalid'))).status,401);
  assert.equal((await api.opportunityResponse(request({requestId,placement:'revive',context:'run',uid:'forged'}))).status,400);
  const ticket=await prepared(api);assert.equal(ticket.userId,uid);assert.equal(ticket.mode,'observe');
  assert.equal((await prepared(api)).customData,ticket.customData);
  const other=await api.statusResponse(request({requestIds:[requestId]},'playerB'));
  assert.equal((await other.json()).opportunities.length,0);
  await api.deliveryResponse(request({requestId,state:'delivered',outcome:'revive'},'playerB'));
  assert.equal([...collections.get('admob_opportunities_v1').values()][0].clientDeliveredAt,undefined);
});
test('concurrent duplicate callbacks create one entitlement; another transaction cannot reuse a ticket',async()=>{
  const {api,collections}=handlers(),ticket=await prepared(api);
  const raw=query({custom_data:ticket.customData});
  const responses=await Promise.all(Array.from({length:8},()=>api.callbackResponse(callback(raw))));
  assert.ok(responses.every(r=>r.status===200));
  const results=await Promise.all(responses.map(r=>r.json()));
  assert.equal(results.filter(r=>!r.duplicate).length,1);
  assert.ok(results.every(r=>r.rewardGranted===false));
  assert.equal(collections.get('admob_entitlements_v1').size,1);
  const reused=await api.callbackResponse(callback(query({custom_data:ticket.customData,transaction_id:'f'.repeat(32)})));
  assert.equal(reused.status,409);
  assert.equal(collections.get('admob_entitlements_v1').size,1);
});
test('server-issued nonce, placement, UID and opportunity time are all bound',async()=>{
  const {api,collections}=handlers(),ticket=await prepared(api);
  for(const changes of [{user_id:'firebase-player-b'},{custom_data:'v1.revive.forged'},{ad_unit:'3630339929',reward_item:'Orb Reward Pack'}]){
    assert.equal((await api.callbackResponse(callback(query({custom_data:ticket.customData,...changes})))).status,403);
  }
  const row=[...collections.get('admob_opportunities_v1').values()][0];row.createdAt=now-3*3600000;
  assert.equal((await api.callbackResponse(callback(query({custom_data:ticket.customData})))).status,403);
  assert.equal(collections.get('admob_entitlements_v1').size,0);
});
test('SDK delivery telemetry cannot verify a reward; late Google confirmation cannot grant twice',async()=>{
  const {api,collections}=handlers(),ticket=await prepared(api);
  await api.deliveryResponse(request({requestId,state:'sdk_earned'}));
  await api.deliveryResponse(request({requestId,state:'delivered',outcome:'revive'}));
  let status=await (await api.statusResponse(request({requestIds:[requestId]}))).json();
  assert.equal(status.opportunities[0].verified,false);assert.equal(status.opportunities[0].delivered,true);
  assert.equal((await api.callbackResponse(callback(query({custom_data:ticket.customData})))).status,200);
  status=await (await api.statusResponse(request({requestIds:[requestId]}))).json();
  assert.equal(status.opportunities[0].verified,true);assert.equal(status.opportunities[0].delivered,true);
  assert.equal(collections.get('admob_entitlements_v1').size,1);
});
test('Verify URL diagnostic verifies Google signature but creates no player entitlement',async()=>{
  const {api,collections}=handlers();
  const response=await api.callbackResponse(callback(query({user_id:'ssv-diagnostic',custom_data:'ssv-diagnostic-v1'})));
  assert.equal(response.status,200);assert.equal((await response.json()).diagnostic,true);
  assert.equal(collections.get('admob_ssv_diagnostics_v1').size,1);
  assert.equal(collections.get('admob_entitlements_v1')?.size??0,0);
});
test('Orb Verify URL diagnostic accepts the actual percent-encoded reward item without granting',async()=>{
  const {api,collections}=handlers();
  const response=await api.callbackResponse(callback(query({ad_unit:'3630339929',reward_item:'Orb Reward Pack',user_id:'ssv-diagnostic',custom_data:'ssv-diagnostic-v1',timestamp:String(now*1000)})));
  assert.equal(response.status,200);
  assert.equal((await response.json()).rewardGranted,false);
  assert.equal(collections.get('admob_ssv_diagnostics_v1').size,1);
  assert.equal(collections.get('admob_entitlements_v1')?.size??0,0);
  const forged=await api.callbackResponse(callback(query({ad_unit:'3630339929',reward_item:'Orb Reward Pack',user_id:'ssv-diagnostic',custom_data:'ssv-diagnostic-v1'}).replace('Orb%20Reward%20Pack','Forged')));
  assert.equal(forged.status,403);
});
test('opportunity issuance quota is atomic and leaves other players independent',async()=>{
  const {api}=handlers();
  for(let i=0;i<15;i++){
    const id=`ad-${String(i).padStart(8,'0')}-1111-4111-8111-111111111111`;
    assert.equal((await api.opportunityResponse(request({requestId:id,placement:'orb',context:'orb'}))).status,200);
  }
  const body={requestId,placement:'revive',context:'run-a:revive:0'};
  assert.equal((await api.opportunityResponse(request(body))).status,429);
  assert.equal((await api.opportunityResponse(request(body,'playerB'))).status,200);
});
