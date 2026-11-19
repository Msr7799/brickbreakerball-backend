/** Read-only, source-labelled statistics for the private ForgePulse dashboard. */
import {analyticsReport,crashlyticsGetReport} from "./game-insights";
import {credentialsReady,humanError,serviceIds,serviceLabels,toolsMeta} from "./mcp-control";
import {ga4Rows,crashSummary,crashIssues,admobReport,adsenseReport} from "./statistics-parsers";
import {googleGet,googleRequest,oauthToken} from "./google";
import {dateObject} from "./security";
import type {Db} from "mongodb";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
const publisherAccount=/^accounts\/pub-\d{10,20}$/;
const errorText=(error:unknown)=>humanError(error);
const asObject=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};

type SectionResult<T>=({status:"ready"|"empty";updatedAt:string}&T)|{status:"error";error:string};
async function section<T extends object>(work:()=>Promise<T>,isEmpty?:(value:T)=>boolean):Promise<SectionResult<T>>{
 try{const value=await work();return {status:isEmpty?.(value)?"empty":"ready",updatedAt:new Date().toISOString(),...value};}
 catch(error){return {status:"error",error:errorText(error)};}
}
function firstAccount(payload:unknown,field:string){
 const accounts=asObject(payload)[field];
 if(!Array.isArray(accounts)||!accounts.length)throw Error("No publisher account returned by Google");
 if(accounts.length>1)throw Error("Multiple publisher accounts are connected; configure a specific account before combining reports");
 const account=asObject(accounts[0]).name;
 if(typeof account!=="string"||!publisherAccount.test(account))throw Error("Invalid publisher account from Google");
 return account;
}

async function ga4Statistics(days:number){
 const responses=await Promise.allSettled([
  analyticsReport("summary",days,1),analyticsReport("overview",days,90),
  analyticsReport("events",days,25),analyticsReport("versions",days,25)
 ]);
 const failure=responses.find(x=>x.status==="rejected");
 if(failure?.status==="rejected")throw failure.reason;
 const [summary,daily,events,versions]=responses.map(x=>x.status==="fulfilled"?x.value:null);
 if(!summary||!daily||!events||!versions)throw Error("GA4 did not return all reports");
 const summaryRow=ga4Rows(summary.data)[0];
 const dates=ga4Rows(daily.data).map(x=>({
  date:`${x.label.slice(0,4)}-${x.label.slice(4,6)}-${x.label.slice(6)}`,
  activeUsers:x.values.activeUsers??0,newUsers:x.values.newUsers??0,
  sessions:x.values.sessions??0,events:x.values.eventCount??0
 })).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
 return {propertyId:summary.propertyId,androidOnly:summary.scopedToAndroidStream,
  timezone:(asObject(asObject(daily.data).metadata).timeZone as string)||"Asia/Bahrain",
  totals:{activeUsers:summaryRow?.values.activeUsers??null,newUsers:summaryRow?.values.newUsers??null,
   sessions:summaryRow?.values.sessions??null,events:summaryRow?.values.eventCount??null},
  daily:dates,
  topEvents:ga4Rows(events.data).filter(x=>x.label).map(x=>({name:x.label,count:x.values.eventCount??0,users:x.values.activeUsers??0})),
  versions:ga4Rows(versions.data).filter(x=>x.label).map(x=>({name:x.label,users:x.values.activeUsers??0,events:x.values.eventCount??0}))
 };
}
async function crashStatistics(days:number){
 const hours=days*24;
 const [summary,issues,versions]=await Promise.all([
  crashlyticsGetReport({reportId:"appSummary",hours,pageSize:10}),
  crashlyticsGetReport({reportId:"topIssues",hours,pageSize:30}),
  crashlyticsGetReport({reportId:"topVersions",hours,pageSize:30})
 ]);
 const metrics=crashSummary(summary);
 const versionRows=(Array.isArray(asObject(versions).groups)?asObject(versions).groups as unknown[]:[]).map(x=>{
  const item=asObject(x),version=asObject(item.version),m=crashSummary({groups:[x]});
  return {name:String(version.displayName||version.version||"—"),events:m?.events??null,users:m?.impactedUsers??null};
 });
 return {summary:metrics,issues:crashIssues(issues),versions:versionRows};
}
async function admobStatistics(days:number,startDate:string,endDate:string){
 const token=await oauthToken("admob");
 const account=firstAccount(await googleGet("https://admob.googleapis.com/v1/accounts",token),"account");
 const [report,apps]=await Promise.all([
  googleRequest(`https://admob.googleapis.com/v1/${account}/networkReport:generate`,token,"POST",{
   reportSpec:{dateRange:{startDate:dateObject(startDate),endDate:dateObject(endDate)},dimensions:["DATE"],metrics:["ESTIMATED_EARNINGS","IMPRESSIONS","CLICKS"]}
  }),
  googleGet(`https://admob.googleapis.com/v1/${account}/apps`,token,{pageSize:100})
 ]);
 const parsed=admobReport(report);
 return {account,periodDays:days,currency:parsed.currency,
  totals:parsed.rows.length?{
   earnings:parsed.rows.reduce((a,b)=>a+(b.earnings||0),0),
   impressions:parsed.rows.reduce((a,b)=>a+(b.impressions||0),0),clicks:parsed.rows.reduce((a,b)=>a+(b.clicks||0),0)
  }:null,
  daily:parsed.rows.sort((a,b)=>a.date.localeCompare(b.date)),
  apps:(Array.isArray(asObject(apps).app)?asObject(apps).app as unknown[]:[]).map(x=>{
   const app=asObject(x);return {name:String(app.displayName||"Unknown"),approval:String(app.appApprovalState||"UNKNOWN")};
  })
 };
}
async function adsenseStatistics(days:number){
 const token=await oauthToken("adsense");
 const account=firstAccount(await googleGet("https://adsense.googleapis.com/v2/accounts",token),"accounts");
 const effectiveDays=Math.min(days,30);
 const url=new URL(`https://adsense.googleapis.com/v2/${account}/reports:generate`);
 url.searchParams.set("dateRange",effectiveDays<=7?"LAST_7_DAYS":"LAST_30_DAYS");
 ["ESTIMATED_EARNINGS","CLICKS","IMPRESSIONS"].forEach(m=>url.searchParams.append("metrics",m));
 url.searchParams.append("dimensions","DATE");
 const [report,sites]=await Promise.all([
  googleGet(url.toString(),token),googleGet(`https://adsense.googleapis.com/v2/${account}/sites`,token,{pageSize:100})
 ]);
 const parsed=adsenseReport(report);
 return {account,periodDays:effectiveDays,currency:parsed.currency,
  totals:parsed.rows.length?{
   earnings:parsed.rows.reduce((a,b)=>a+(b.earnings||0),0),
   impressions:parsed.rows.reduce((a,b)=>a+(b.impressions||0),0),clicks:parsed.rows.reduce((a,b)=>a+(b.clicks||0),0)
  }:null,daily:parsed.rows.sort((a,b)=>a.date.localeCompare(b.date)),
  sites:(Array.isArray(asObject(sites).sites)?asObject(sites).sites as unknown[]:[]).map(x=>{
   const site=asObject(x);return {url:String(site.domain||site.name||"—"),state:String(site.state||"UNKNOWN")};
  })};
}
async function mongoStatistics(start:Date){
 const database=await db(),audit=database.collection("mcp_audit"),events=database.collection("events");
 const [operationDays,byTool,byService,totalOperations,successful,failed,purchaseDays,purchaseTypes,purchaseStatuses,purchaseTotal,checks]=await Promise.all([
  audit.aggregate([{$match:{at:{$gte:start}}},{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$at",timezone:"Asia/Bahrain"}},total:{$sum:1},success:{$sum:{$cond:[{$eq:["$success",true]},1,0]}},errors:{$sum:{$cond:[{$eq:["$success",false]},1,0]}}}},{$sort:{_id:1}}]).toArray(),
  audit.aggregate([{$match:{at:{$gte:start}}},{$group:{_id:"$action",count:{$sum:1},errors:{$sum:{$cond:[{$eq:["$success",false]},1,0]}}}},{$sort:{count:-1}},{$limit:55}]).toArray(),
  audit.aggregate([{$match:{at:{$gte:start}}},{$group:{_id:"$service",count:{$sum:1},errors:{$sum:{$cond:[{$eq:["$success",false]},1,0]}}}},{$sort:{count:-1}}]).toArray(),
  audit.countDocuments({at:{$gte:start}}),audit.countDocuments({at:{$gte:start},success:true}),audit.countDocuments({at:{$gte:start},success:false}),
  events.aggregate([{$match:{receivedAt:{$gte:start}}},{$group:{_id:{$dateToString:{format:"%Y-%m-%d",date:"$receivedAt",timezone:"Asia/Bahrain"}},count:{$sum:1}}},{$sort:{_id:1}}]).toArray(),
  events.aggregate([{$match:{receivedAt:{$gte:start}}},{$group:{_id:"$type",count:{$sum:1}}},{$sort:{count:-1}}]).toArray(),
  events.aggregate([{$match:{receivedAt:{$gte:start}}},{$group:{_id:"$status",count:{$sum:1}}},{$sort:{count:-1}}]).toArray(),
  events.countDocuments({receivedAt:{$gte:start}}),
  database.collection("mcp_checks").find({},{projection:{_id:0,service:1,status:1,at:1,detail:1}}).toArray()
 ]);
 return {
  operations:{total:totalOperations,success:successful,errors:failed,
   daily:operationDays.map(x=>({date:String(x._id),total:x.total,success:x.success,errors:x.errors})),
   tools:byTool.map(x=>({name:String(x._id||"unknown"),count:x.count,errors:x.errors})),
   services:byService.map(x=>({name:String(x._id||"unknown"),count:x.count,errors:x.errors}))},
  purchases:{total:purchaseTotal,daily:purchaseDays.map(x=>({date:String(x._id),count:x.count})),
   types:purchaseTypes.map(x=>({name:String(x._id||"unknown"),count:x.count})),
   statuses:purchaseStatuses.map(x=>({name:String(x._id||"unknown"),count:x.count}))},
  checks:checks.map(x=>({service:String(x.service||""),status:String(x.status||"pending"),at:x.at instanceof Date?x.at.toISOString():null,detail:String(x.detail||"")}))
 };
}

export async function operationsStatistics(days:7|30|90){
 const endDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Bahrain",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const first=new Date(endDate+"T00:00:00Z");first.setUTCDate(first.getUTCDate()-(days-1));
 const startDate=first.toISOString().slice(0,10),start=new Date(startDate+"T00:00:00+03:00");
 const [ga4,crashes,admob,adsense,mongo]=await Promise.all([
  section(()=>ga4Statistics(days)),section(()=>crashStatistics(days),x=>!x.summary),
  credentialsReady("admob")?section(()=>admobStatistics(days,startDate,endDate),x=>!x.daily.length):Promise.resolve({status:"error" as const,error:"AdMob is not configured"}),
  credentialsReady("adsense")?section(()=>adsenseStatistics(days),x=>!x.daily.length):Promise.resolve({status:"error" as const,error:"AdSense is not configured"}),
  section(()=>mongoStatistics(start))
 ]);
 const checks=mongo.status!=="error"?mongo.checks:[];
 const toolsByService=serviceIds.map(id=>({id,name:serviceLabels[id],total:toolsMeta.filter(t=>t.service===id).length,
  writes:toolsMeta.filter(t=>t.service===id&&t.mode==="write").length,
  configured:credentialsReady(id),
  latest:checks.find(x=>x.service===id)||null
 }));
 const toolUsage=mongo.status!=="error"?mongo.operations.tools:[];
 const catalogTools=toolsMeta.map(t=>{
  const usage=toolUsage.find(x=>x.name===t.id);
  return {id:t.id,title:t.title,service:t.service,mode:t.mode==="write"?"write":"read",
   uses:mongo.status==="error"?null:usage?.count??0,errors:mongo.status==="error"?null:usage?.errors??0};
 });
 return {generatedAt:new Date().toISOString(),range:{days,startDate,endDate,timezone:"Asia/Bahrain"},
  catalog:{total:toolsMeta.length,read:toolsMeta.filter(x=>x.mode!=="write").length,write:toolsMeta.filter(x=>x.mode==="write").length,services:toolsByService,tools:catalogTools},
  ga4,crashes,admob,adsense,operations:mongo.status==="error"?{status:"error" as const,error:mongo.error}:{status:"ready" as const,...mongo.operations},
  purchases:mongo.status==="error"?{status:"error" as const,error:mongo.error}:{status:"ready" as const,...mongo.purchases}
 };
}
