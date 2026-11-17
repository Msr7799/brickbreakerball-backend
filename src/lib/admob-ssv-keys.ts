import type {KeyObject} from 'node:crypto';
import {parseGoogleKeys, SsvError} from './admob-ssv-contract';

// Fixed HTTPS origin: callbacks cannot select a key URL or supply their own public key.
const KEY_URL='https://www.gstatic.com/admob/reward/verifier-keys.json';
const MAX_CACHE_MS=23*60*60*1000;
let cache:{keys:Map<string,KeyObject>;fetchedAt:number}|undefined;
let pending:Promise<void>|undefined;
async function refresh(){
  if(!pending) pending=(async()=>{
    const response=await fetch(KEY_URL,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw new SsvError('key_service_unavailable',503);
    const text=await response.text();
    if(text.length>32768) throw new SsvError('key_service_unavailable',503);
    cache={keys:parseGoogleKeys(JSON.parse(text)),fetchedAt:Date.now()};
  })().finally(()=>{pending=undefined;});
  await pending;
}
export async function googleRewardKey(keyId:string):Promise<KeyObject>{
  if(!cache || Date.now()-cache.fetchedAt>=MAX_CACHE_MS) await refresh();
  if(!cache!.keys.has(keyId) && Date.now()-cache!.fetchedAt>=60_000) await refresh();
  const key=cache!.keys.get(keyId);
  if(!key) throw new SsvError('unknown_key',403);
  return key;
}
export async function probeGoogleRewardKeys():Promise<void>{
  if(!cache || Date.now()-cache.fetchedAt>=MAX_CACHE_MS) await refresh();
}
