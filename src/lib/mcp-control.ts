/** Live authenticated dashboard probes, bounded management tools, and audit records. */
import {googleGet,googleRequest,googleToken,oauthToken} from "./google";
import {firebaseRead,firebaseProbe} from "./firebase";
import {assertEnv,validateDateRange,dateObject,validateResource} from "./security";
import {z} from "zod";
import {searchTavily} from "./tavily";
import {crashlyticsListReports,crashlyticsGetReport,crashlyticsGetIssue,crashlyticsListEvents,analyticsReport,crashlyticsListNotes,crashlyticsUpdateIssue,crashlyticsCreateNote,crashlyticsDeleteNote,analyticsListKeyEvents,analyticsCreateKeyEvent,analyticsUpdateKeyEvent,analyticsDeleteKeyEvent} from "./game-insights";
import type {Db} from "mongodb";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
export type ServiceId="mongodb"|"vercel"|"firebase"|"cloud"|"play"|"admob"|"adsense"|"tavily"|"crashlytics"|"analytics";
export type ServiceState="connected"|"pending"|"not_configured"|"error";
/**
 * توضيح أنواع MongoDB:
 * نحن نخزن اسم الخدمة نفسه في _id (نص مثل firebase أو cloud)، مو ObjectId.
 * تعريف نوع المستند هنا يحمي القراءة والتحديث من التحويلات الخاطئة.
 */
type ConnectionCheck={
 _id:ServiceId;
 service:ServiceId;
 status:ServiceState;
 at:Date;
 latencyMs:number;
 detail:string;
};
export const serviceIds:ServiceId[]=["firebase","crashlytics","analytics","cloud","play","admob","adsense","tavily","mongodb","vercel"];
export const serviceLabels:Record<ServiceId,string>={mongodb:"MongoDB",vercel:"Vercel Runtime",firebase:"Firebase",crashlytics:"Firebase Crashlytics",analytics:"Google Analytics 4",cloud:"Google Cloud",play:"Google Play RTDN",admob:"AdMob",adsense:"AdSense",tavily:"Tavily Search"};
const packageName=()=>assertEnv("ANDROID_PACKAGE_NAME");
const cloudId=()=>assertEnv("GOOGLE_CLOUD_PROJECT_ID");
const playUrl=()=>`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName())}`;
const projectUrl=()=>`https://pubsub.googleapis.com/v1/projects/${encodeURIComponent(cloudId())}`;
export const credentialsReady=(id:ServiceId):boolean=>{
 const e=process.env,has=(k:string)=>!!e[k]?.trim()&&!e[k]?.startsWith("REPLACE_")&&!e[k]?.includes("YOUR_");
 switch(id){
  case "mongodb":return has("MONGODB_URI")&&has("MONGODB_DB");
  case "vercel":return true;
  case "tavily":return has("TAVILY_API_KEY");
  case "firebase":return has("FIREBASE_DATABASE_URL")&&has("FIREBASE_SERVICE_ACCOUNT_JSON");
  case "cloud":return has("GOOGLE_CLOUD_PROJECT_ID")&&has("GOOGLE_SERVICE_ACCOUNT_JSON");
  case "crashlytics":return (has("FIREBASE_SERVICE_ACCOUNT_JSON")||has("GOOGLE_SERVICE_ACCOUNT_JSON"))&&has("ANDROID_PACKAGE_NAME");
  case "analytics":return (has("FIREBASE_SERVICE_ACCOUNT_JSON")||has("GOOGLE_SERVICE_ACCOUNT_JSON"))&&has("ANDROID_PACKAGE_NAME");
  case "play":return has("PUBSUB_PUSH_SERVICE_ACCOUNT")&&has("PUBSUB_AUDIENCE")&&has("GOOGLE_PLAY_PACKAGE_NAME");
  case "admob":return has("GOOGLE_OAUTH_CLIENT_ID")&&has("GOOGLE_OAUTH_CLIENT_SECRET")&&(has("GOOGLE_ADMOB_REFRESH_TOKEN")||has("GOOGLE_OAUTH_REFRESH_TOKEN"));
  case "adsense":return has("GOOGLE_OAUTH_CLIENT_ID")&&has("GOOGLE_OAUTH_CLIENT_SECRET")&&(has("GOOGLE_ADSENSE_REFRESH_TOKEN")||has("GOOGLE_OAUTH_REFRESH_TOKEN"));
 }
};
function humanError(err:unknown){
 let msg=err instanceof Error?err.message:"Unexpected error";
 msg=msg.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi,"[redacted database URI]").replace(/Bearer\s+[^\s]+/gi,"Bearer [redacted]").replace(/"private_key"\s*:\s*"[^"]*"/gi,'"private_key":"[redacted]"');
 return msg.slice(0,240);
}
export async function writeAudit(input:{source:"mcp"|"dashboard";action:string;service?:string;success:boolean;durationMs:number;detail?:string}){
 try{
  const database=await db();
  await database.collection("mcp_audit").insertOne({at:new Date(),source:input.source,action:input.action,service:input.service||"gateway",success:input.success,durationMs:Math.round(input.durationMs),detail:(input.detail||"").slice(0,240)});
 }catch(e){console.warn("MCP audit unavailable",e instanceof Error?e.name:"unknown");}
}
/** Fail closed before Google mutations: a durable intent record is mandatory. */
export async function recordMcpWriteIntent(action:string,subject:string,source:"mcp"|"dashboard"="mcp"){
 const service=toolsMeta.find(t=>t.id===action)?.service||"gateway";
 await (await db()).collection("mcp_audit").insertOne({at:new Date(),source,action,service,success:false,durationMs:0,detail:`Authorized write intent (pending): ${subject.slice(0,100)}`});
}
export async function latestActivity(limit=30){
 const database=await db();
 return database.collection("mcp_audit").find({}, {projection:{_id:0,at:1,source:1,action:1,service:1,success:1,durationMs:1,detail:1}}).sort({at:-1}).limit(limit).toArray();
}
async function probe(id:ServiceId):Promise<string>{
 switch(id){
  case "mongodb":await (await db()).command({ping:1});return "MongoDB responded to ping";
  case "vercel":return "Next.js server route is responding (not a Vercel account API check)";
  case "tavily":await searchTavily("Brick Breaker Ball game");return "Tavily search API responded";
  case "firebase":{
   const data=await firebaseProbe();return `Realtime Database accessible under ${data.path}; node ${data.exists?"exists":"is empty or absent"}`;
  }
  case "crashlytics":{
   const data=await crashlyticsListReports() as {reports?:unknown[]};
   return `Crashlytics API accessible: ${data.reports?.length??0} report types`;
  }
  case "analytics":{
   const data=await analyticsReport("overview",1,1);
   return `GA4 Data API accessible for property ${data.propertyId}; Android stream ${data.scopedToAndroidStream?"filtered":"unavailable"}`;
  }
  case "cloud":{
   const resp=await googleGet(`https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(cloudId())}`,await googleToken("cloud")) as {projectId?:string};
   return `Project API accessible: ${resp.projectId||cloudId()}`;
  }
  case "play":{
   const database=await db();const count=await database.collection("events").countDocuments({type:"test"});
   if(!count)throw new Error("No Google Play test RTDN received yet. Send a test notification first.");
   return `${count} Google Play test notification(s) recorded; real purchase verification not tested`;
  }
  case "admob":{
   const response=await googleGet("https://admob.googleapis.com/v1/accounts",await oauthToken("admob")) as {account?:unknown[]};
   return `AdMob API accessible: ${response.account?.length??0} account(s) returned`;
  }
  case "adsense":{
   const response=await googleGet("https://adsense.googleapis.com/v2/accounts",await oauthToken("adsense")) as {accounts?:unknown[]};
   return `AdSense API accessible: ${response.accounts?.length??0} account(s) returned`;
  }
 }
}
export async function checkService(id:ServiceId){
 const started=Date.now();
 if(!credentialsReady(id)){
  const record={service:id,status:"not_configured" as ServiceState,at:new Date(),latencyMs:0,detail:"Required environment variables have not been set"};
  return record;
 }
 try{
  const detail=await probe(id),latencyMs=Date.now()-started;
  const record={service:id,status:"connected" as ServiceState,at:new Date(),latencyMs,detail};
  await saveCheck(record);await writeAudit({source:"dashboard",action:"check_connection",service:id,success:true,durationMs:latencyMs,detail});
  return record;
 }catch(err){
  const detail=humanError(err),latencyMs=Date.now()-started;
  const record={service:id,status:"error" as ServiceState,at:new Date(),latencyMs,detail};
  await saveCheck(record);await writeAudit({source:"dashboard",action:"check_connection",service:id,success:false,durationMs:latencyMs,detail});
  return record;
 }
}
async function saveCheck(record:{service:ServiceId;status:ServiceState;at:Date;latencyMs:number;detail:string}){
 try{const database=await db();await database.collection<ConnectionCheck>("mcp_checks").updateOne({_id:record.service},{$set:record},{upsert:true});}
 catch(e){console.warn("Cannot save MCP connection check",e instanceof Error?e.name:"unknown");}
}
export async function dashboardOverview(){
 const database=await db();
 const [checks,activity,events,successful,failed]=await Promise.all([
  database.collection<ConnectionCheck>("mcp_checks").find({}).toArray(),latestActivity(80),database.collection("events").countDocuments({}),
  database.collection("mcp_audit").countDocuments({success:true}),database.collection("mcp_audit").countDocuments({success:false})
 ]);
 // كل _id نص يمثل ServiceId، لذلك لا نحتاج تحويل ObjectId غير آمن.
 const map=new Map<ServiceId,ConnectionCheck>(checks.map((check):[ServiceId,ConnectionCheck]=>[check._id,check]));
 const services=serviceIds.map(id=>{
  const latest=map.get(id),ready=credentialsReady(id);
  const last=latest?.at?new Date(latest.at):null;
  // لا نستخدم latest قبل التأكد من وجود فحص محفوظ لهذه الخدمة.
  const fresh=last!==null && Date.now()-last.getTime()<30*60*1000;
  const status:ServiceState=!ready?"not_configured":fresh && latest?latest.status:"pending";
  return {id,name:serviceLabels[id],configured:ready,status,lastCheckedAt:last?.toISOString()||null,detail:!ready?"Settings incomplete":latest?.detail||"Not checked yet",latencyMs:latest?.latencyMs??null};
 });
 return {ok:true,services,activity,metrics:{checksPassed:successful,checksFailed:failed,mcpOperations:await database.collection("mcp_audit").countDocuments({source:"mcp"}),eventsReceived:events},tools:toolsMeta};
}
const d=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const account=z.string().regex(/^accounts\/pub-\d{10,20}$/);
const toolSchemas={
 gateway_status:z.object({}),firebase_read:z.object({path:z.string().min(1).max(200).default("/mcp"),maxChildren:z.coerce.number().int().min(1).max(100).default(20)}),
 tavily_search:z.object({query:z.string().min(3).max(500)}),
 play_list_reviews:z.object({maxResults:z.coerce.number().int().min(1).max(100).default(20)}),
 play_list_one_time_products:z.object({pageSize:z.coerce.number().int().min(1).max(100).default(50)}),
 play_list_subscriptions:z.object({pageSize:z.coerce.number().int().min(1).max(100).default(50)}),
 cloud_get_project:z.object({}),cloud_list_pubsub_topics:z.object({pageSize:z.coerce.number().int().min(1).max(100).default(30)}),cloud_list_pubsub_subscriptions:z.object({pageSize:z.coerce.number().int().min(1).max(100).default(30)}),
 admob_list_accounts:z.object({}),admob_list_apps:z.object({account}),admob_list_ad_units:z.object({account}),
 admob_network_report:z.object({account,startDate:d,endDate:d}),
 crashlytics_list_reports:z.object({}),
 crashlytics_get_report:z.object({reportId:z.string().min(1).max(120),hours:z.coerce.number().int().min(1).max(2160).default(24),version:z.string().max(80).optional(),pageSize:z.coerce.number().int().min(1).max(100).default(25),pageToken:z.string().max(1200).optional()}),
 crashlytics_get_issue:z.object({issueId:z.string().min(1).max(120)}),
 crashlytics_list_events:z.object({issueId:z.string().min(1).max(120),hours:z.coerce.number().int().min(1).max(2160).default(24),version:z.string().max(80).optional(),pageSize:z.coerce.number().int().min(1).max(100).default(10),pageToken:z.string().max(1200).optional()}),
 analytics_overview:z.object({days:z.coerce.number().int().min(1).max(90).default(7)}),
 analytics_top_events:z.object({days:z.coerce.number().int().min(1).max(90).default(7),limit:z.coerce.number().int().min(1).max(100).default(20)}),
 analytics_app_versions:z.object({days:z.coerce.number().int().min(1).max(90).default(7),limit:z.coerce.number().int().min(1).max(100).default(20)}),
 crashlytics_list_notes:z.object({issueId:z.string().min(1).max(120),pageSize:z.coerce.number().int().min(1).max(100).default(30)}),
 crashlytics_update_issue:z.object({issueId:z.string().min(1).max(120),state:z.enum(["OPEN","CLOSED","MUTED"]),confirm:z.literal("CONFIRM")}),
 crashlytics_create_note:z.object({issueId:z.string().min(1).max(120),body:z.string().trim().min(1).max(3000),confirm:z.literal("CONFIRM")}),
 crashlytics_delete_note:z.object({issueId:z.string().min(1).max(120),noteId:z.string().min(1).max(120),confirm:z.literal("CONFIRM")}),
 analytics_list_key_events:z.object({pageSize:z.coerce.number().int().min(1).max(200).default(50)}),
 analytics_create_key_event:z.object({eventName:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),countingMethod:z.enum(["ONCE_PER_EVENT","ONCE_PER_SESSION"]),confirm:z.literal("CONFIRM")}),
 analytics_update_key_event:z.object({keyEventId:z.string().min(1).max(120),countingMethod:z.enum(["ONCE_PER_EVENT","ONCE_PER_SESSION"]),confirm:z.literal("CONFIRM")}),
 analytics_delete_key_event:z.object({keyEventId:z.string().min(1).max(120),confirm:z.literal("CONFIRM")}),
 adsense_list_accounts:z.object({}),adsense_list_sites:z.object({account}),adsense_report:z.object({account,dateRange:z.enum(["TODAY","YESTERDAY","LAST_7_DAYS","LAST_30_DAYS","MONTH_TO_DATE"]).default("LAST_7_DAYS")})
} as const;
export type ToolId=keyof typeof toolSchemas;
export const toolsMeta:{id:ToolId;service:ServiceId;title:string;description:string;mode?:"write";args:{key:string;label:string;hint?:string}[]}[]=[
 {id:"tavily_search",service:"tavily",title:"بحث Tavily",description:"بحث ويب مباشر مع روابط المصادر",args:[{key:"query",label:"عبارة البحث",hint:"اكتب ما تريد البحث عنه"}]},
 {id:"gateway_status",service:"vercel",title:"حالة بوابة MCP",description:"يعرض التهيئة من غير أي أسرار",args:[]},
 {id:"firebase_read",service:"firebase",title:"قراءة Firebase",description:"قراءة محدودة من المسار المسموح فقط",args:[{key:"path",label:"المسار",hint:"/mcp"},{key:"maxChildren",label:"أقصى عدد",hint:"20"}]},
 {id:"crashlytics_list_reports",service:"crashlytics",title:"أنواع تقارير Crashlytics",description:"عرض التقارير المتاحة رسمياً للتطبيق",args:[]},
 {id:"crashlytics_get_report",service:"crashlytics",title:"تقرير أعطال Crashlytics",description:"تقرير الأعطال حسب الساعات وإصدار اللعبة",args:[{key:"reportId",label:"معرّف التقرير",hint:"topIssues"},{key:"hours",label:"الساعات السابقة",hint:"24"},{key:"version",label:"إصدار اللعبة اختياري",hint:"2.9.0 (26)"}]},
 {id:"crashlytics_get_issue",service:"crashlytics",title:"تفاصيل عطل",description:"قراءة تفاصيل Issue محدد من Crashlytics",args:[{key:"issueId",label:"معرّف العطل"}]},
 {id:"crashlytics_list_events",service:"crashlytics",title:"أحداث العطل",description:"استعراض أحدث وقوعات عطل محدد",args:[{key:"issueId",label:"معرّف العطل"},{key:"hours",label:"الساعات السابقة",hint:"24"}]},
 {id:"analytics_overview",service:"analytics",title:"تحليلات اللاعبين",description:"المستخدمون النشطون والجدد والجلسات والأحداث يومياً",args:[{key:"days",label:"عدد الأيام",hint:"7"}]},
 {id:"analytics_top_events",service:"analytics",title:"أحداث اللعبة",description:"أكثر أحداث Firebase Analytics تكراراً",args:[{key:"days",label:"عدد الأيام",hint:"7"},{key:"limit",label:"العدد",hint:"20"}]},
 {id:"analytics_app_versions",service:"analytics",title:"إصدارات اللعبة",description:"المستخدمون والأحداث حسب إصدار التطبيق",args:[{key:"days",label:"عدد الأيام",hint:"7"},{key:"limit",label:"العدد",hint:"20"}]},
 {id:"crashlytics_list_notes",service:"crashlytics",title:"ملاحظات الأعطال",description:"عرض الملاحظات الموجودة على العطل",args:[{key:"issueId",label:"معرّف العطل"}]},
 {id:"crashlytics_update_issue",service:"crashlytics",mode:"write",title:"تغيير حالة العطل",description:"فتح / إغلاق / كتم العطل — يحتاج تأكيد",args:[{key:"issueId",label:"معرّف العطل"},{key:"state",label:"الحالة",hint:"CLOSED"},{key:"confirm",label:"اكتب CONFIRM للتأكيد"}]},
 {id:"crashlytics_create_note",service:"crashlytics",mode:"write",title:"إضافة ملاحظة للعطل",description:"إضافة ملاحظة رسمية على بلاغ العطل",args:[{key:"issueId",label:"معرّف العطل"},{key:"body",label:"نص الملاحظة"},{key:"confirm",label:"اكتب CONFIRM للتأكيد"}]},
 {id:"crashlytics_delete_note",service:"crashlytics",mode:"write",title:"حذف ملاحظة",description:"حذف ملاحظة Crashlytics نهائياً",args:[{key:"issueId",label:"معرّف العطل"},{key:"noteId",label:"معرّف الملاحظة"},{key:"confirm",label:"اكتب CONFIRM للتأكيد"}]},
 {id:"analytics_list_key_events",service:"analytics",title:"الأحداث المهمة GA4",description:"عرض Key Events الحالية",args:[]},
 {id:"analytics_create_key_event",service:"analytics",mode:"write",title:"إنشاء حدث مهم",description:"إضافة Key Event لخاصية GA4 كلها",args:[{key:"eventName",label:"اسم الحدث",hint:"level_complete"},{key:"countingMethod",label:"طريقة العد",hint:"ONCE_PER_EVENT"},{key:"confirm",label:"اكتب CONFIRM للتأكيد"}]},
 {id:"analytics_update_key_event",service:"analytics",mode:"write",title:"تعديل طريقة العد",description:"تغيير طريقة عد Key Event",args:[{key:"keyEventId",label:"معرّف Key Event"},{key:"countingMethod",label:"طريقة العد",hint:"ONCE_PER_SESSION"},{key:"confirm",label:"اكتب CONFIRM للتأكيد"}]},
 {id:"analytics_delete_key_event",service:"analytics",mode:"write",title:"حذف حدث مهم",description:"حذف Key Event على مستوى خاصية GA4",args:[{key:"keyEventId",label:"معرّف Key Event"},{key:"confirm",label:"اكتب CONFIRM للتأكيد"}]},
 {id:"play_list_reviews",service:"play",title:"مراجعات Google Play",description:"استعراض تقييمات اللعبة",args:[]},
 {id:"play_list_one_time_products",service:"play",title:"منتجات الجواهر",description:"استعراض منتجات الشراء لمرة واحدة",args:[]},
 {id:"play_list_subscriptions",service:"play",title:"الاشتراكات",description:"استعراض اشتراكات اللعبة",args:[]},
 {id:"cloud_get_project",service:"cloud",title:"معلومات مشروع Cloud",description:"التحقق من تفاصيل مشروع Google Cloud",args:[]},
 {id:"cloud_list_pubsub_topics",service:"cloud",title:"مواضيع Pub/Sub",description:"عرض مواضيع الإشعارات",args:[]},
 {id:"cloud_list_pubsub_subscriptions",service:"cloud",title:"اشتراكات Pub/Sub",description:"عرض اشتراكات إشعارات المشتريات",args:[]},
 {id:"admob_list_accounts",service:"admob",title:"حسابات AdMob",description:"جلب الحسابات المصرّح لها",args:[]},
 {id:"admob_list_apps",service:"admob",title:"تطبيقات AdMob",description:"عرض التطبيقات الإعلانية",args:[{key:"account",label:"معرّف الحساب",hint:"accounts/pub-..."}]},
 {id:"admob_list_ad_units",service:"admob",title:"وحدات AdMob",description:"عرض الوحدات الإعلانية",args:[{key:"account",label:"معرّف الحساب",hint:"accounts/pub-..."}]},
 {id:"admob_network_report",service:"admob",title:"تقرير شبكة AdMob",description:"تقرير للأرباح والظهور",args:[{key:"account",label:"معرّف الحساب",hint:"accounts/pub-..."},{key:"startDate",label:"تاريخ البداية",hint:"2026-10-01"},{key:"endDate",label:"تاريخ النهاية",hint:"2026-10-17"}]},
 {id:"adsense_list_accounts",service:"adsense",title:"حسابات AdSense",description:"جلب حسابات الناشر",args:[]},
 {id:"adsense_list_sites",service:"adsense",title:"مواقع AdSense",description:"عرض حالات قبول المواقع",args:[{key:"account",label:"معرّف الحساب",hint:"accounts/pub-..."}]},
 {id:"adsense_report",service:"adsense",title:"تقارير AdSense",description:"قراءة إحصائيات الأرباح",args:[{key:"account",label:"معرّف الحساب",hint:"accounts/pub-..."},{key:"dateRange",label:"الفترة",hint:"LAST_7_DAYS"}]}
];
export async function runReadTool(name:string,args:unknown,source:"dashboard"|"mcp"="dashboard"){
 const started=Date.now();
 const schema=toolSchemas[name as ToolId];if(!schema)throw new Error("Unknown or disabled MCP tool");
 try{
  const p=schema.parse(args??{}) as Record<string,any>;
  const isWrite=toolsMeta.find(t=>t.id===name)?.mode==="write";
  if(isWrite){
   if(process.env.MCP_WRITE_ENABLED!=="true")throw new Error("MCP write operations are disabled by MCP_WRITE_ENABLED");
   // This entrypoint is restricted to an authenticated, same-origin admin dashboard.
   if(p.confirm!=="CONFIRM")throw new Error("Explicit CONFIRM is required");
   await recordMcpWriteIntent(name,JSON.stringify(Object.fromEntries(Object.entries(p).filter(([key])=>!["body","confirm"].includes(key)))).slice(0,120),source);
  }
  let output:unknown;
  switch(name){
   case "gateway_status":output={readOnly:true,services:serviceIds.map(id=>({id,configured:credentialsReady(id)})),note:"Configuration is not proof of successful API connectivity"};break;
   case "tavily_search":output=await searchTavily(p.query);break;
   case "firebase_read":output=await firebaseRead(p.path,p.maxChildren);break;
   case "crashlytics_list_reports":output=await crashlyticsListReports();break;
   case "crashlytics_get_report":output=await crashlyticsGetReport({reportId:p.reportId,hours:p.hours,version:p.version,pageSize:p.pageSize,pageToken:p.pageToken});break;
   case "crashlytics_get_issue":output=await crashlyticsGetIssue(p.issueId);break;
   case "crashlytics_list_events":output=await crashlyticsListEvents({issueId:p.issueId,hours:p.hours,version:p.version,pageSize:p.pageSize,pageToken:p.pageToken});break;
   case "analytics_overview":output=await analyticsReport("overview",p.days,90);break;
   case "analytics_top_events":output=await analyticsReport("events",p.days,p.limit);break;
   case "analytics_app_versions":output=await analyticsReport("versions",p.days,p.limit);break;
   case "crashlytics_list_notes":output=await crashlyticsListNotes(p.issueId,p.pageSize);break;
   case "crashlytics_update_issue":output=await crashlyticsUpdateIssue(p.issueId,p.state);break;
   case "crashlytics_create_note":output=await crashlyticsCreateNote(p.issueId,p.body);break;
   case "crashlytics_delete_note":output=await crashlyticsDeleteNote(p.issueId,p.noteId);break;
   case "analytics_list_key_events":output=await analyticsListKeyEvents(p.pageSize);break;
   case "analytics_create_key_event":output=await analyticsCreateKeyEvent(p.eventName,p.countingMethod);break;
   case "analytics_update_key_event":output=await analyticsUpdateKeyEvent(p.keyEventId,p.countingMethod);break;
   case "analytics_delete_key_event":output=await analyticsDeleteKeyEvent(p.keyEventId);break;
   case "play_list_reviews":output=await googleGet(`${playUrl()}/reviews`,await googleToken("play"),{maxResults:p.maxResults});break;
   case "play_list_one_time_products":output=await googleGet(`${playUrl()}/oneTimeProducts`,await googleToken("play"),{pageSize:p.pageSize});break;
   case "play_list_subscriptions":output=await googleGet(`${playUrl()}/subscriptions`,await googleToken("play"),{pageSize:p.pageSize});break;
   case "cloud_get_project":output=await googleGet(`https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(cloudId())}`,await googleToken("cloud"));break;
   case "cloud_list_pubsub_topics":output=await googleGet(`${projectUrl()}/topics`,await googleToken("cloud"),{pageSize:p.pageSize});break;
   case "cloud_list_pubsub_subscriptions":output=await googleGet(`${projectUrl()}/subscriptions`,await googleToken("cloud"),{pageSize:p.pageSize});break;
   case "admob_list_accounts":output=await googleGet("https://admob.googleapis.com/v1/accounts",await oauthToken("admob"));break;
   case "admob_list_apps":output=await googleGet(`https://admob.googleapis.com/v1/${validateResource("admob",p.account)}/apps`,await oauthToken("admob"),{pageSize:100});break;
   case "admob_list_ad_units":output=await googleGet(`https://admob.googleapis.com/v1/${validateResource("admob",p.account)}/adUnits`,await oauthToken("admob"),{pageSize:100});break;
   case "admob_network_report":validateDateRange(p.startDate,p.endDate);output=await googleRequest(`https://admob.googleapis.com/v1/${validateResource("admob",p.account)}/networkReport:generate`,await oauthToken("admob"),"POST",{reportSpec:{dateRange:{startDate:dateObject(p.startDate),endDate:dateObject(p.endDate)},dimensions:["DATE"],metrics:["ESTIMATED_EARNINGS","IMPRESSIONS"]}});break;
   case "adsense_list_accounts":output=await googleGet("https://adsense.googleapis.com/v2/accounts",await oauthToken("adsense"));break;
   case "adsense_list_sites":output=await googleGet(`https://adsense.googleapis.com/v2/${validateResource("adsense",p.account)}/sites`,await oauthToken("adsense"),{pageSize:100});break;
   case "adsense_report":{const u=new URL(`https://adsense.googleapis.com/v2/${validateResource("adsense",p.account)}/reports:generate`);u.searchParams.set("dateRange",p.dateRange);["ESTIMATED_EARNINGS","CLICKS","IMPRESSIONS"].forEach(m=>u.searchParams.append("metrics[]",m));u.searchParams.append("dimensions[]","DATE");output=await googleGet(u.toString(),await oauthToken("adsense"));break;}
  }
  await writeAudit({source,action:name,service:toolsMeta.find(t=>t.id===name)?.service,success:true,durationMs:Date.now()-started,detail:isWrite?"Admin-approved write completed":"Read-only operation completed"});
  return output??{};
 }catch(err){await writeAudit({source,action:name,service:toolsMeta.find(t=>t.id===name)?.service,success:false,durationMs:Date.now()-started,detail:humanError(err)});throw err;}
}
export {humanError};
