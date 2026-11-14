/** Isolated real-Mongo CAS fixture. Uses local environment credentials without printing them. */
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {MongoClient} from 'mongodb';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/lib/cloud-progress.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,require:()=>({}),console});
const {writeCheckpoint}=module.exports;
assert.ok(process.env.MONGODB_URI && process.env.MONGODB_DB,'MongoDB environment is required');
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000,maxPoolSize:2});
const id='cloud-progress-fixture-'+randomUUID();
let collection;
try{
  await client.connect();
  collection=client.db(process.env.MONGODB_DB).collection('cloud_progress_fixtures_v1');
  const snapshot={schema:1,sections:['progress','wallet','items','transactions','cosmetics','guide','pendingRewards'].map(name=>({name,entries:name==='wallet'?[{key:'coins',type:'i',value:'432'},{key:'receipt',type:'b',value:'true'}]:[]}))};
  const initial={baseRevision:0,saveId:'a'.repeat(32),snapshot};
  assert.equal((await writeCheckpoint(collection,id,initial)).conflict,false);
  assert.equal((await writeCheckpoint(collection,id,initial)).record.revision,1);
  const races=await Promise.all(['b','c'].map(letter=>writeCheckpoint(collection,id,{baseRevision:1,saveId:letter.repeat(32),snapshot})));
  assert.equal(races.filter(r=>r.conflict).length,1);
  const record=await collection.findOne({_id:id});
  assert.equal(record.revision,2);assert.equal(record.previous.revision,1);
  assert.equal(record.snapshot.sections.find(s=>s.name==='wallet').entries[0].value,'432');
  assert.equal((await writeCheckpoint(collection,id,{...initial,saveId:'d'.repeat(32)})).conflict,true);
  console.log('REAL_MONGO_CLOUD_PROGRESS_OK: atomic creation, receipt checkpoint, retry idempotence, two-device CAS and stale-write rejection');
}finally{
  if(collection){
    assert.ok(id.startsWith('cloud-progress-fixture-'));
    await collection.deleteOne({_id:id});
    assert.equal(await collection.countDocuments({_id:id}),0);
    console.log('REAL_MONGO_FIXTURE_CLEANUP_OK');
  }
  await client.close();
}
