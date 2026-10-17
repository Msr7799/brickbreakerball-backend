import type {Db} from "mongodb";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
type Counter={_id:string;version:number;minuteStart:number;minuteCount:number;minuteTokens:number;dayKey:string;dayCount:number;nextAt:number;cooldownUntil:number;dailyBlockedDay?:string};
export class QuotaWait extends Error{constructor(readonly retryAfterMs:number,readonly daily=false){super(daily?"انتهت الحصة اليومية لهذا النموذج. حاول بعد إعادة تعيين Google للحصة.":"الطلبات كثيرة الآن. انتظر قليلًا ثم أعد المحاولة.");}}
const numberEnv=(name:string,fallback:number)=>{const n=Number(process.env[name]);return Number.isFinite(n)&&n>0?Math.floor(n):fallback;};
export function quotaLimits(model:string){const lane=/lite/i.test(model)?"LITE":"FLASH";return {rpm:numberEnv(`GEMINI_${lane}_RPM`,lane==="LITE"?4:3),rpd:numberEnv(`GEMINI_${lane}_RPD`,lane==="LITE"?80:60),tpm:numberEnv(`GEMINI_${lane}_TPM`,30000),intervalMs:numberEnv(`GEMINI_${lane}_MIN_INTERVAL_MS`,lane==="LITE"?16000:20000)};}
const pacificDay=(now:number)=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
export async function reserveGemini(model:string,estimatedTokens:number):Promise<void>{
 const collection=(await db()).collection<Counter>("assistant_gemini_quota");const lim=quotaLimits(model);const estimate=Math.max(1,Math.ceil(estimatedTokens));
 const deadline=Date.now()+12000;
 if(estimate>lim.tpm)throw new Error("المرفقات أو سياق المحادثة يتجاوز حد التوكنات المحلي لهذا النموذج.");
 for(let attempt=0;attempt<12;attempt++){
  const now=Date.now(),dayKey=pacificDay(now),old=await collection.findOne({_id:model});
  const state=old??{_id:model,version:0,minuteStart:now,minuteCount:0,minuteTokens:0,dayKey,dayCount:0,nextAt:0,cooldownUntil:0};
  const resetMinute=now-state.minuteStart>=60000;
  const minuteStart=resetMinute?now:state.minuteStart;
  const minuteCount=resetMinute?0:state.minuteCount;
  const minuteTokens=resetMinute?0:state.minuteTokens;
  const dayCount=state.dayKey===dayKey?state.dayCount:0;
  if(state.dailyBlockedDay===dayKey)throw new QuotaWait(0,true);
  if(dayCount>=lim.rpd)throw new QuotaWait(3600000,true);
  const wait=Math.max(state.cooldownUntil-now,state.nextAt-now,minuteCount>=lim.rpm||minuteTokens+estimate>lim.tpm?minuteStart+60000-now:0);
  if(wait>0){if(wait<=8000&&Date.now()+wait<deadline){await new Promise(resolve=>setTimeout(resolve,wait+30));continue;}throw new QuotaWait(Math.max(1000,wait));}
  const next={version:state.version+1,minuteStart,minuteCount:minuteCount+1,minuteTokens:minuteTokens+estimate,dayKey,dayCount:dayCount+1,nextAt:now+lim.intervalMs,cooldownUntil:state.cooldownUntil};
  if(old){const result=await collection.updateOne({_id:model,version:old.version},{$set:next});if(result.modifiedCount)return;}
  else{try{await collection.insertOne({...state,...next});return;}catch(e){if((e as {code?:number}).code!==11000)throw e;}}
 }
 throw new QuotaWait(2000);
}
export async function coolGemini(model:string,ms:number,daily=false){
 if(daily){await (await db()).collection<Counter>("assistant_gemini_quota").updateOne({_id:model},{$set:{dailyBlockedDay:pacificDay(Date.now())}});return;}
 const until=Date.now()+Math.max(1000,Math.min(ms,3600000));
 await (await db()).collection<Counter>("assistant_gemini_quota").updateOne({_id:model},{$max:{cooldownUntil:until}});
}
export async function reserveTavily(){
 const cap=numberEnv("TAVILY_MONTHLY_SEARCH_CAP",800),month=new Date().toISOString().slice(0,7),collection=(await db()).collection<{_id:string;count:number}>("assistant_tavily_quota");
 const result=await collection.findOneAndUpdate({_id:month,count:{$lt:cap}},{$inc:{count:1}},{returnDocument:"after"});
 if(result)return;
 try{await collection.insertOne({_id:month,count:1});}catch(e){if((e as {code?:number}).code===11000)throw new QuotaWait(60000);throw e;}
}
