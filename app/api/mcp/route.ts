import {createMcpHandler} from "mcp-handler";
import {AsyncLocalStorage} from "node:async_hooks";
import {z} from "zod";
import {getBearer,tokenMatches,assertEnv,validateDateRange,dateObject,validateResource} from "../../../src/lib/security";
import {firebaseRead} from "../../../src/lib/firebase";
import {googleGet,googleRequest,googleToken,oauthToken} from "../../../src/lib/google";
import {writeAudit,toolsMeta} from "../../../src/lib/mcp-control";
import {getAssistantSettings,allowedTool} from "../../../src/lib/assistant-settings";
import {searchTavily} from "../../../src/lib/tavily";
import {analyticsCredentialIdentity,crashlyticsListReports,crashlyticsGetReport,crashlyticsGetIssue,crashlyticsListEvents,analyticsReport,crashlyticsListNotes,crashlyticsUpdateIssue,crashlyticsCreateNote,crashlyticsDeleteNote,analyticsListKeyEvents,analyticsCreateKeyEvent,analyticsUpdateKeyEvent,analyticsDeleteKeyEvent} from "../../../src/lib/game-insights";
import {oauthEnabled} from "../../../src/lib/mcp-oauth-helpers";
import {verifyMcpOauthAccess,oauthChallenge} from "../../../src/lib/mcp-oauth";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const cloud=()=>assertEnv("GOOGLE_CLOUD_PROJECT_ID");
const appId=()=>assertEnv("ANDROID_PACKAGE_NAME");
const playRoot=()=>`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(appId())}`;
const pubsubRoot=()=>`https://pubsub.googleapis.com/v1/projects/${encodeURIComponent(cloud())}`;
const writeContext=new AsyncLocalStorage<boolean>();
const result=async(name:string,fn:()=>Promise<unknown>,write=false,subject="")=>{
 const started=Date.now();
 try{const settings=await getAssistantSettings();if(!allowedTool(name,settings))throw new Error("This MCP tool is disabled in ForgePulse controls.");
  if(write){if(process.env.MCP_WRITE_ENABLED!=="true"||writeContext.getStore()!==true)throw new Error("Write operation requires explicit mcp:write OAuth approval and MCP_WRITE_ENABLED=true");
   // Fail closed: persist write intent before calling an external Google mutation.
   const {recordMcpWriteIntent}=await import("../../../src/lib/mcp-control");await recordMcpWriteIntent(name,subject);
  }
  const value=await fn();const data=JSON.stringify(value??{},null,2);
  await writeAudit({source:"mcp",action:name,service:toolsMeta.find(t=>t.id===name)?.service,success:true,durationMs:Date.now()-started,detail:write?`Write completed: ${subject}`:"Read-only operation completed"});
  return {content:[{type:"text" as const,text:data.length>40000?data.slice(0,40000)+"\n[TRUNCATED]":data}]};}
 catch(e){await writeAudit({source:"mcp",action:name,service:toolsMeta.find(t=>t.id===name)?.service,success:false,durationMs:Date.now()-started,detail:e instanceof Error?e.name:"Unknown error"});
  return {isError:true,content:[{type:"text" as const,text:e instanceof Error?e.message:"Unknown error"}]};}
};
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"Use YYYY-MM-DD");
const account=z.string().regex(/^accounts\/pub-\d{10,20}$/);
const hours=z.number().int().min(1).max(2160).default(24);
const days=z.number().int().min(1).max(90).default(7);
const version=z.string().max(80).optional();
const handler=createMcpHandler((server)=>{
 server.registerTool("tavily_search",{description:"Search the web with Tavily and return source URLs. Read-only; uses Tavily credits.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({query:z.string().min(3).max(500)})},async({query})=>result("tavily_search",()=>searchTavily(query)));
 server.registerTool("gateway_status",{description:"Show configured providers and a bounded live Google Analytics API check. No secret values are returned.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({})},async()=>result("gateway_status",async()=>({
  readOnly:process.env.MCP_WRITE_ENABLED!=="true",
  writeEnabled:process.env.MCP_WRITE_ENABLED==="true",
  firebase:!!(process.env.FIREBASE_DATABASE_URL&&(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_SERVICE_ACCOUNT_JSON)),
  play:!!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON&&process.env.ANDROID_PACKAGE_NAME),
  cloud:!!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON&&process.env.GOOGLE_CLOUD_PROJECT_ID),
  admob:!!((process.env.GOOGLE_ADMOB_REFRESH_TOKEN||process.env.GOOGLE_OAUTH_REFRESH_TOKEN)&&process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  adsense:!!((process.env.GOOGLE_ADSENSE_REFRESH_TOKEN||process.env.GOOGLE_OAUTH_REFRESH_TOKEN)&&process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  tavily:!!process.env.TAVILY_API_KEY,
  analyticsCaller:(()=>{try{return analyticsCredentialIdentity();}catch{return {error:"Firebase insights credentials unavailable"};}})(),
  crashlytics:!!((process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_SERVICE_ACCOUNT_JSON)&&process.env.ANDROID_PACKAGE_NAME),
  analytics:!!((process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_SERVICE_ACCOUNT_JSON)&&process.env.ANDROID_PACKAGE_NAME),
  ga4LiveProbe:await (async()=>{
   try{
    const report=await analyticsReport("overview",1,1);
    return {ok:true,propertyId:report.propertyId,scopedToAndroidStream:report.scopedToAndroidStream};
   }catch(e){
    return {ok:false,error:e instanceof Error?e.message.slice(0,350):"Unknown GA4 error"};
   }
  })(),
  note:"Configured does not guarantee Google granted API access; ga4LiveProbe confirms GA4 Data API reachability."
 })));

 server.registerTool("firebase_read",{description:"Read a bounded Firebase Realtime Database subtree. Restricted to FIREBASE_ALLOWED_PREFIX; read-only.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({path:z.string().min(1).default("/mcp"),maxChildren:z.number().int().min(1).max(100).default(20)})},async({path,maxChildren})=>result("firebase_read",()=>firebaseRead(path,maxChildren)));

 server.registerTool("crashlytics_list_reports",{description:"List available Firebase Crashlytics reports for the configured Android app (read-only).",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({})},async()=>result("crashlytics_list_reports",()=>crashlyticsListReports()));
 server.registerTool("crashlytics_get_report",{description:"Read a Crashlytics report filtered by last N hours and optional version (e.g. 2.9.0 (26)). First list report names with crashlytics_list_reports.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({reportId:z.string().min(1).max(120),hours,version,pageSize:z.number().int().min(1).max(100).default(25),pageToken:z.string().max(1200).optional()})},async(p)=>result("crashlytics_get_report",()=>crashlyticsGetReport(p)));
 server.registerTool("crashlytics_get_issue",{description:"Read one Crashlytics issue by ID (read-only).",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({issueId:z.string().min(1).max(120)})},async({issueId})=>result("crashlytics_get_issue",()=>crashlyticsGetIssue(issueId)));
 server.registerTool("crashlytics_list_events",{description:"List recent events for a Crashlytics issue, limited by hours and app version.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({issueId:z.string().min(1).max(120),hours,version,pageSize:z.number().int().min(1).max(100).default(10),pageToken:z.string().max(1200).optional()})},async(p)=>result("crashlytics_list_events",()=>crashlyticsListEvents(p)));
 server.registerTool("analytics_overview",{description:"GA4 active/new users, sessions and event counts per day for the Firebase Android app.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({days})},async({days})=>result("analytics_overview",()=>analyticsReport("overview",days,90)));
 server.registerTool("analytics_top_events",{description:"List most frequent Firebase Analytics game events and active users.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({days,limit:z.number().int().min(1).max(100).default(20)})},async({days,limit})=>result("analytics_top_events",()=>analyticsReport("events",days,limit)));
 server.registerTool("analytics_app_versions",{description:"Analyze users and events by Android game app version.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({days,limit:z.number().int().min(1).max(100).default(20)})},async({days,limit})=>result("analytics_app_versions",()=>analyticsReport("versions",days,limit)));
 const writeMeta={securitySchemes:[{type:"oauth2" as const,scopes:["mcp:write"]}]};
 const confirmation=z.literal(true).describe("Must be true only after explicit user approval of this exact change");
 const issueId=z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
 const noteId=z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
 const keyEventId=z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
 const countingMethod=z.enum(["ONCE_PER_EVENT","ONCE_PER_SESSION"]);
 server.registerTool("crashlytics_list_notes",{description:"List existing notes for a Crashlytics issue (read-only).",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({issueId,pageSize:z.number().int().min(1).max(100).default(30)})},async({issueId,pageSize})=>result("crashlytics_list_notes",()=>crashlyticsListNotes(issueId,pageSize)));
 server.registerTool("crashlytics_update_issue",{description:"WRITE: change the state of a Crashlytics issue (OPEN, CLOSED, MUTED) after explicit user approval. Does not repair app code.",_meta:writeMeta,inputSchema:z.object({issueId,state:z.enum(["OPEN","CLOSED","MUTED"]),confirm:confirmation})},async({issueId,state})=>result("crashlytics_update_issue",()=>crashlyticsUpdateIssue(issueId,state),true,`issue ${issueId} -> ${state}`));
 server.registerTool("crashlytics_create_note",{description:"WRITE: add a developer note to one Crashlytics issue, only with explicit user approval.",_meta:writeMeta,inputSchema:z.object({issueId,body:z.string().trim().min(1).max(3000),confirm:confirmation})},async({issueId,body})=>result("crashlytics_create_note",()=>crashlyticsCreateNote(issueId,body),true,`issue ${issueId} note added`));
 server.registerTool("crashlytics_delete_note",{description:"WRITE/DELETE: permanently delete one Crashlytics issue note only after explicit user approval.",_meta:writeMeta,inputSchema:z.object({issueId,noteId,confirm:confirmation})},async({issueId,noteId})=>result("crashlytics_delete_note",()=>crashlyticsDeleteNote(issueId,noteId),true,`issue ${issueId} note ${noteId} removed`));
 server.registerTool("analytics_list_key_events",{description:"List GA4 Key Events configured for the Firebase-linked property (read-only).",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({pageSize:z.number().int().min(1).max(200).default(50)})},async({pageSize})=>result("analytics_list_key_events",()=>analyticsListKeyEvents(pageSize)));
 server.registerTool("analytics_create_key_event",{description:"WRITE: create a GA4 Key Event for the ENTIRE Firebase-linked GA4 property (not only one Android stream). Ask for explicit approval.",_meta:writeMeta,inputSchema:z.object({eventName:z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),countingMethod,confirm:confirmation})},async({eventName,countingMethod})=>result("analytics_create_key_event",()=>analyticsCreateKeyEvent(eventName,countingMethod),true,`GA4 key event created: ${eventName}`));
 server.registerTool("analytics_update_key_event",{description:"WRITE: change counting method for one GA4 Key Event across the entire property, after approval.",_meta:writeMeta,inputSchema:z.object({keyEventId,countingMethod,confirm:confirmation})},async({keyEventId,countingMethod})=>result("analytics_update_key_event",()=>analyticsUpdateKeyEvent(keyEventId,countingMethod),true,`GA4 key event ${keyEventId} -> ${countingMethod}`));
 server.registerTool("analytics_delete_key_event",{description:"WRITE/DELETE: remove one GA4 Key Event from the whole property, only with explicit user approval.",_meta:writeMeta,inputSchema:z.object({keyEventId,confirm:confirmation})},async({keyEventId})=>result("analytics_delete_key_event",()=>analyticsDeleteKeyEvent(keyEventId),true,`GA4 key event ${keyEventId} deleted`));


 server.registerTool("play_list_reviews",{description:"Read Google Play app reviews for configured ANDROID_PACKAGE_NAME.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({maxResults:z.number().int().min(1).max(100).default(20),pageToken:z.string().max(1000).optional()})},async({maxResults,pageToken})=>result("play_list_reviews",async()=>googleGet(`${playRoot()}/reviews`,await googleToken("play"),{maxResults,token:pageToken})));
 server.registerTool("play_list_one_time_products",{description:"List one-time in-app purchases (such as gem packs) on Google Play, including product setup.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(50),pageToken:z.string().max(1000).optional()})},async({pageSize,pageToken})=>result("play_list_one_time_products",async()=>googleGet(`${playRoot()}/oneTimeProducts`,await googleToken("play"),{pageSize,pageToken})));
 server.registerTool("play_list_subscriptions",{description:"List subscription products in the Google Play Console app.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(50),pageToken:z.string().max(1000).optional()})},async({pageSize,pageToken})=>result("play_list_subscriptions",async()=>googleGet(`${playRoot()}/subscriptions`,await googleToken("play"),{pageSize,pageToken})));

 server.registerTool("cloud_get_project",{description:"Get metadata for the configured Google Cloud project.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({})},async()=>result("cloud_get_project",async()=>googleGet(`https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(cloud())}`,await googleToken("cloud"))));
 server.registerTool("cloud_list_pubsub_topics",{description:"List Pub/Sub topics under the configured Google Cloud project, without reading messages.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(30)})},async({pageSize})=>result("cloud_list_pubsub_topics",async()=>googleGet(`${pubsubRoot()}/topics`,await googleToken("cloud"),{pageSize})));
 server.registerTool("cloud_list_pubsub_subscriptions",{description:"List Pub/Sub subscriptions under the configured Google Cloud project. Useful for purchase notification setup.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(30)})},async({pageSize})=>result("cloud_list_pubsub_subscriptions",async()=>googleGet(`${pubsubRoot()}/subscriptions`,await googleToken("cloud"),{pageSize})));

 server.registerTool("admob_list_accounts",{description:"List AdMob publisher account(s) visible through the authorized Google OAuth account.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({})},async()=>result("admob_list_accounts",async()=>googleGet("https://admob.googleapis.com/v1/accounts",await oauthToken("admob"))));
 server.registerTool("admob_list_apps",{description:"List apps registered in an AdMob publisher account.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({account})},async({account})=>result("admob_list_apps",async()=>googleGet(`https://admob.googleapis.com/v1/${validateResource("admob",account)}/apps`,await oauthToken("admob"),{pageSize:100})));
 server.registerTool("admob_list_ad_units",{description:"List advertising units in an AdMob account.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({account})},async({account})=>result("admob_list_ad_units",async()=>googleGet(`https://admob.googleapis.com/v1/${validateResource("admob",account)}/adUnits`,await oauthToken("admob"),{pageSize:100})));
 server.registerTool("admob_network_report",{description:"AdMob Network earnings and activity (read-only) for a custom date range. Earnings are in micro units of account currency.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({account,startDate:date,endDate:date,dimensions:z.array(z.enum(["DATE","APP","COUNTRY","AD_UNIT"])).min(1).max(2).default(["DATE"]),metrics:z.array(z.enum(["ESTIMATED_EARNINGS","CLICKS","IMPRESSIONS","AD_REQUESTS","MATCHED_REQUESTS"])).min(1).max(5).default(["ESTIMATED_EARNINGS","IMPRESSIONS"])})},async({account,startDate,endDate,dimensions,metrics})=>result("admob_network_report",async()=>{
  validateDateRange(startDate,endDate);return googleRequest(`https://admob.googleapis.com/v1/${validateResource("admob",account)}/networkReport:generate`,await oauthToken("admob"),"POST",{reportSpec:{dateRange:{startDate:dateObject(startDate),endDate:dateObject(endDate)},dimensions,metrics}});
 }));

 server.registerTool("adsense_list_accounts",{description:"List AdSense accounts accessible through the authorized Google OAuth account.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({})},async()=>result("adsense_list_accounts",async()=>googleGet("https://adsense.googleapis.com/v2/accounts",await oauthToken("adsense"))));
 server.registerTool("adsense_list_sites",{description:"List sites and Google AdSense approval states (READY, GETTING_READY, NEEDS_ATTENTION, etc).",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({account})},async({account})=>result("adsense_list_sites",async()=>googleGet(`https://adsense.googleapis.com/v2/${validateResource("adsense",account)}/sites`,await oauthToken("adsense"),{pageSize:100})));
 server.registerTool("adsense_report",{description:"Read AdSense estimated earnings, impressions and clicks for a standard date range.",_meta:{securitySchemes:[{type:"oauth2",scopes:["mcp:read"]}]},inputSchema:z.object({account,dateRange:z.enum(["TODAY","YESTERDAY","LAST_7_DAYS","LAST_30_DAYS","MONTH_TO_DATE"]).default("LAST_7_DAYS")})},async({account,dateRange})=>result("adsense_report",async()=>{const url=new URL(`https://adsense.googleapis.com/v2/${validateResource("adsense",account)}/reports:generate`);url.searchParams.set("dateRange",dateRange);for(const metric of ["ESTIMATED_EARNINGS","CLICKS","IMPRESSIONS"])url.searchParams.append("metrics[]",metric);url.searchParams.append("dimensions[]","DATE");return googleGet(url.toString(),await oauthToken("adsense"));}));
});

async function authorized(request:Request):Promise<Response>{
 const configured=process.env.MCP_BEARER_TOKEN;
 const staticReady=!!configured&&configured.length>=32&&!configured.startsWith("REPLACE_");
 if(!staticReady&&!oauthEnabled())return Response.json({error:"MCP authentication is not configured"},{status:503});
 const bearer=getBearer(request);
 const legacyAuth=staticReady&&tokenMatches(bearer,configured);
 let oauthAuth=false;
 if(!legacyAuth&&oauthEnabled())try{oauthAuth=await verifyMcpOauthAccess(bearer);}catch{return Response.json({error:"OAuth token verification unavailable"},{status:503});}
 if(!legacyAuth&&!oauthAuth)return Response.json({error:"Unauthorized"},{status:401,headers:{"WWW-Authenticate":oauthEnabled()?oauthChallenge():"Bearer"}});
 try{const settings=await getAssistantSettings();if(!settings.enabled||!settings.mcpEnabled)return Response.json({error:"MCP is disabled in ForgePulse controls"},{status:503});}catch{return Response.json({error:"MCP settings unavailable"},{status:503});}
 try{const writeAllowed=!legacyAuth&&oauthAuth&&await verifyMcpOauthAccess(bearer,"mcp:write");return await writeContext.run(writeAllowed,()=>handler(request));}catch{return Response.json({error:"MCP handler failed. Check deployment logs."},{status:500});}
}
export const POST=authorized;
export const GET=authorized;
export const DELETE=authorized;
