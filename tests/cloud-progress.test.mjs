import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name,mocks={}){
  const source=fs.readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(js,{module,exports:module.exports,require:name=>mocks[name]??{},Buffer,Response,console,
    process:{env:{MONGODB_URI:'test-only',MONGODB_DB:'test-only'}}});
  return module.exports;
}
const contract=load('cloud-progress-contract');
function snapshot(stars=3){return {schema:1,sections:contract.PROGRESS_SECTIONS.map(name=>({name,entries:name==='progress'?[{key:'volley_stars_1',type:'i',value:String(stars)}]:name==='wallet'?[{key:'coins',type:'i',value:'432'},{key:'server-daily:receipt',type:'b',value:'true'}]:[]}))};}
const command=(revision,id='a',stars=3)=>({baseRevision:revision,saveId:id.repeat(32),snapshot:snapshot(stars)});
class MemoryCollection{
  records=new Map();
  async findOne({_id}){return structuredClone(this.records.get(_id)??null);}
  async insertOne(record){if(this.records.has(record._id))throw Object.assign(new Error('duplicate'),{code:11000});this.records.set(record._id,structuredClone(record));}
  async replaceOne(filter,record){const old=this.records.get(filter._id);if(old?.revision!==filter.revision)return {matchedCount:0};this.records.set(record._id,structuredClone(record));return {matchedCount:1};}
}
function service(col=new MemoryCollection()){
  return {...load('cloud-progress',{
    './cloud-progress-contract':contract,
    './game-firebase-auth':{gameFirebaseAuth:()=>({verifyIdToken:async(token,revoked)=>{assert.equal(revoked,true);if(token==='invalid')throw new Error('bad');return {uid:token};}})},
    mongodb:{MongoClient:class{async connect(){return {db:()=>({collection:()=>col})};}}},
  }),col};
}
test('validates typed checkpoint and preserves 64-bit values as decimal strings',()=>{
  const body=command(0);body.snapshot.sections[0].entries.push({key:'long',type:'l',value:'9223372036854775807'});
  assert.equal(contract.parseProgressCommand(body),body);
  body.snapshot.sections[0].entries.at(-1).value='9223372036854775808';
  assert.throws(()=>contract.parseProgressCommand(body),contract.InvalidProgress);
});
test('rejects unknown stores, duplicate keys, unknown types, extra account IDs and invalid numbers',()=>{
  for(const mutate of [b=>b.uid='another-player',b=>b.baseRevision=-1,b=>b.snapshot.sections[0].name='auth',
    b=>b.snapshot.sections[0].entries.push(b.snapshot.sections[0].entries[0]),
    b=>b.snapshot.sections[0].entries[0].type='object',b=>b.snapshot.sections[0].entries[0].value='NaN']){
    const body=command(0);mutate(body);assert.throws(()=>contract.parseProgressCommand(body),contract.InvalidProgress);
  }
});
test('new save, reinstall restore and account isolation keep wallet and receipts together',async()=>{
  const {writeCheckpoint,publicCheckpoint,col}=service();
  await writeCheckpoint(col,'player-A',command(0));
  const restored=publicCheckpoint(await col.findOne({_id:'player-A'}));
  assert.equal(JSON.stringify(restored.snapshot),JSON.stringify(snapshot()));
  assert.equal(restored.revision,1);
  assert.equal(publicCheckpoint(await col.findOne({_id:'player-B'})).snapshot,null);
});
test('a timed-out response can retry the same save without advancing its revision',async()=>{
  const {writeCheckpoint,col}=service();const body=command(0);
  await writeCheckpoint(col,'player',body);
  const retry=await writeCheckpoint(col,'player',body);
  assert.equal(retry.conflict,false);assert.equal(retry.record.revision,1);
});
test('concurrent devices cannot overwrite a checkpoint using a stale revision',async()=>{
  const {writeCheckpoint,col}=service();await writeCheckpoint(col,'player',command(0));
  const results=await Promise.all([writeCheckpoint(col,'player',command(1,'b',2)),writeCheckpoint(col,'player',command(1,'c',1))]);
  assert.equal(results.filter(r=>r.conflict).length,1);
  const saved=await col.findOne({_id:'player'});assert.equal(saved.revision,2);assert.equal(saved.previous.revision,1);
  const stale=await writeCheckpoint(col,'player',command(0,'d',0));assert.equal(stale.conflict,true);assert.equal(stale.record.revision,2);
});
test('HTTP boundary requires a revocation-checked token and scopes writes to that UID',async()=>{
  const api=service();
  for(const token of [null,'invalid']){
    const request=new Request('https://game.test/api/progress',{headers:token?{Authorization:`Bearer ${token}`}:{}});
    assert.equal((await api.cloudProgressResponse(request,false)).status,401);
  }
  const put=new Request('https://game.test/api/progress',{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(command(0))});
  assert.equal((await api.cloudProgressResponse(put,true)).status,200);
  assert.equal(api.col.records.size,1);assert.ok(api.col.records.has('owner'));
  const other=await api.cloudProgressResponse(new Request('https://game.test/api/progress',{headers:{Authorization:'Bearer other'}}),false);
  assert.equal((await other.json()).snapshot,null);
});
test('HTTP body limits apply even without a content-length header',async()=>{
  const api=service();const request=new Request('https://game.test/api/progress',{method:'PUT',headers:{Authorization:'Bearer owner'},body:' '.repeat(contract.MAX_PROGRESS_BYTES+1)});
  assert.equal((await api.cloudProgressResponse(request,true)).status,400);
  assert.equal(api.col.records.size,0);
});
