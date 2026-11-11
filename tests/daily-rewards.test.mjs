import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const src=fs.readFileSync(new URL('../src/lib/daily-rewards.ts',import.meta.url),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
vm.runInNewContext(js,{module:mod,exports:mod.exports,require:()=>({}),process:{env:{}},console});
const {rewardDay,nextStreak,dayReward}=mod.exports;
test('Bahrain server day changes at 00:00 UTC+03',()=>{
  assert.equal(rewardDay(Date.parse('2026-10-20T21:00:00Z')),rewardDay(Date.parse('2026-10-20T20:59:59Z'))+1);
});
test('Streak wraps after day 14 and resets if the player missed a day',()=>{
  assert.equal(nextStreak(100,14,101),1);
  assert.equal(nextStreak(100,5,102),1);
  assert.equal(nextStreak(100,4,101),5);
});
test('All 14 rewards match Android economy',()=>{
  const expected=[[150,1],[180,1],[210,2],[240,1],[270,1],[300,2],[1500,25],[360,0],[390,0],[0,5],[450,0],[480,0],[0,7],[2500,40]];
  for(let day=1;day<=14;day++){const r=dayReward(day);assert.deepEqual([r.coins,r.gems],expected[day-1]);}
});
