import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/lib/daily-reward-diagnostics.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const clientId='6148685744-2gql3gj9l1q6d9167j47h4a4qtbvndnr.apps.googleusercontent.com';
function diagnostics({fetch,auth,store,env}){
  const module={exports:{}};
  vm.runInNewContext(javascript,{module,exports:module.exports,URLSearchParams,AbortSignal,Date,
    process:{env},console:{info:()=>{}},require:(name)=>{
      if(name==='node:crypto')return {randomUUID:()=> 'diagnostic-id'};
      if(name==='./game-firebase-auth')return {gameFirebaseAuth:()=>auth};
      if(name==='./daily-rewards')return {probeDailyRewardDatabase:store};
      throw new Error(name);
    },fetch});
  return module.exports;
}
const env={PLAY_GAMES_SERVER_CLIENT_ID:clientId,PLAY_GAMES_SERVER_CLIENT_SECRET:'private-test-secret',
  GAME_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'brick-breaker-ball-8e4f5',client_email:'test@example.com',private_key:'private-key'}),
  MONGODB_URI:'mongodb://secret-host',MONGODB_DB:'test-db'};

test('live diagnostics prove server services but leave a real player claim unverified',async()=>{
  let googleCalls=0,firebaseCalls=0,storeCalls=0;
  const tool=diagnostics({env,
    fetch:async (_url,options)=>{googleCalls++;assert.equal(options.body.get('code'),'brickbreaker-diagnostic-invalid-code');return {status:400,json:async()=>({error:'invalid_grant'})};},
    auth:{listUsers:async limit=>{firebaseCalls++;assert.equal(limit,1);}},
    store:async()=>{storeCalls++;}});
  const report=await tool.runDailyRewardDiagnostics();
  assert.equal(googleCalls,1);assert.equal(firebaseCalls,1);assert.equal(storeCalls,1);
  assert.equal(report.runId,'diagnostic-id');
  assert.equal(report.checks.find(c=>c.id==='play_oauth').state,'passed');
  assert.equal(report.checks.find(c=>c.id==='firebase_auth').state,'passed');
  assert.equal(report.checks.find(c=>c.id==='daily_store').state,'passed');
  assert.equal(report.checks.find(c=>c.id==='player_flow').state,'pending');
  assert.doesNotMatch(JSON.stringify(report),/private-test-secret|private-key|secret-host/);
});

test('bad OAuth credentials are reported as failure without exposing the secret',async()=>{
  const tool=diagnostics({env,
    fetch:async()=>({status:401,json:async()=>({error:'invalid_client',error_description:'private-test-secret'})}),
    auth:{listUsers:async()=>{}},store:async()=>{}});
  const check=(await tool.runDailyRewardDiagnostics()).checks.find(c=>c.id==='play_oauth');
  assert.equal(check.state,'failed');assert.equal(check.code,'invalid_client');
  assert.doesNotMatch(JSON.stringify(check),/private-test-secret/);
});

test('wrong Firebase project blocks its live probe',async()=>{
  let called=false;
  const tool=diagnostics({env:{...env,GAME_FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'brickbreakerball-508820',client_email:'test@example.com',private_key:'private-key'})},
    fetch:async()=>({status:400,json:async()=>({error:'invalid_grant'})}),
    auth:{listUsers:async()=>{called=true;}},store:async()=>{}});
  const check=(await tool.runDailyRewardDiagnostics()).checks.find(c=>c.id==='firebase_auth');
  assert.equal(check.state,'failed');assert.equal(check.code,'blocked_by_configuration');assert.equal(called,false);
});
