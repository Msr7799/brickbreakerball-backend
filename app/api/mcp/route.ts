import {createMcpHandler} from "mcp-handler";
import {z} from "zod";
import {getBearer,tokenMatches,assertEnv,validateDateRange,dateObject,validateResource} from "../../../src/lib/security";
import {firebaseRead} from "../../../src/lib/firebase";
import {googleGet,googleRequest,googleToken,oauthToken} from "../../../src/lib/google";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

const cloud=()=>assertEnv("GOOGLE_CLOUD_PROJECT_ID");
const appId=()=>assertEnv("ANDROID_PACKAGE_NAME");
const playRoot=()=>`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(appId())}`;
const pubsubRoot=()=>`https://pubsub.googleapis.com/v1/projects/${encodeURIComponent(cloud())}`;
const result=async(fn:()=>Promise<unknown>)=>{
 try{const value=await fn();const data=JSON.stringify(value,null,2);return {content:[{type:"text" as const,text:data.length>40000?data.slice(0,40000)+"\n[TRUNCATED]":data}]};}
 catch(e){return {isError:true,content:[{type:"text" as const,text:e instanceof Error?e.message:"Unknown error"}]};}
};
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"Use YYYY-MM-DD");
const account=z.string().regex(/^accounts\/pub-\d{10,20}$/);
const handler=createMcpHandler((server)=>{
 server.registerTool("gateway_status",{description:"Show which of the five providers have their required settings configured. No secret values are returned.",inputSchema:z.object({})},async()=>result(async()=>({
  readOnly:true,
  firebase:!!(process.env.FIREBASE_DATABASE_URL&&(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_SERVICE_ACCOUNT_JSON)),
  play:!!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON&&process.env.ANDROID_PACKAGE_NAME),
  cloud:!!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON&&process.env.GOOGLE_CLOUD_PROJECT_ID),
  admob:!!((process.env.GOOGLE_ADMOB_REFRESH_TOKEN||process.env.GOOGLE_OAUTH_REFRESH_TOKEN)&&process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  adsense:!!((process.env.GOOGLE_ADSENSE_REFRESH_TOKEN||process.env.GOOGLE_OAUTH_REFRESH_TOKEN)&&process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  note:"Configured does not guarantee Google granted API access. Run account-list tools to verify."
 })));

 server.registerTool("firebase_read",{description:"Read a bounded Firebase Realtime Database subtree. Restricted to FIREBASE_ALLOWED_PREFIX; read-only.",inputSchema:z.object({path:z.string().min(1).default("/mcp"),maxChildren:z.number().int().min(1).max(100).default(20)})},async({path,maxChildren})=>result(()=>firebaseRead(path,maxChildren)));

 server.registerTool("play_list_reviews",{description:"Read Google Play app reviews for configured ANDROID_PACKAGE_NAME.",inputSchema:z.object({maxResults:z.number().int().min(1).max(100).default(20),pageToken:z.string().max(1000).optional()})},async({maxResults,pageToken})=>result(async()=>googleGet(`${playRoot()}/reviews`,await googleToken("play"),{maxResults,token:pageToken})));
 server.registerTool("play_list_one_time_products",{description:"List one-time in-app purchases (such as gem packs) on Google Play, including product setup.",inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(50),pageToken:z.string().max(1000).optional()})},async({pageSize,pageToken})=>result(async()=>googleGet(`${playRoot()}/oneTimeProducts`,await googleToken("play"),{pageSize,pageToken})));
 server.registerTool("play_list_subscriptions",{description:"List subscription products in the Google Play Console app.",inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(50),pageToken:z.string().max(1000).optional()})},async({pageSize,pageToken})=>result(async()=>googleGet(`${playRoot()}/subscriptions`,await googleToken("play"),{pageSize,pageToken})));

 server.registerTool("cloud_get_project",{description:"Get metadata for the configured Google Cloud project.",inputSchema:z.object({})},async()=>result(async()=>googleGet(`https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(cloud())}`,await googleToken("cloud"))));
 server.registerTool("cloud_list_pubsub_topics",{description:"List Pub/Sub topics under the configured Google Cloud project, without reading messages.",inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(30)})},async({pageSize})=>result(async()=>googleGet(`${pubsubRoot()}/topics`,await googleToken("cloud"),{pageSize})));
 server.registerTool("cloud_list_pubsub_subscriptions",{description:"List Pub/Sub subscriptions under the configured Google Cloud project. Useful for purchase notification setup.",inputSchema:z.object({pageSize:z.number().int().min(1).max(100).default(30)})},async({pageSize})=>result(async()=>googleGet(`${pubsubRoot()}/subscriptions`,await googleToken("cloud"),{pageSize})));

 server.registerTool("admob_list_accounts",{description:"List AdMob publisher account(s) visible through the authorized Google OAuth account.",inputSchema:z.object({})},async()=>result(async()=>googleGet("https://admob.googleapis.com/v1/accounts",await oauthToken("admob"))));
 server.registerTool("admob_list_apps",{description:"List apps registered in an AdMob publisher account.",inputSchema:z.object({account})},async({account})=>result(async()=>googleGet(`https://admob.googleapis.com/v1/${validateResource("admob",account)}/apps`,await oauthToken("admob"),{pageSize:100})));
 server.registerTool("admob_list_ad_units",{description:"List advertising units in an AdMob account.",inputSchema:z.object({account})},async({account})=>result(async()=>googleGet(`https://admob.googleapis.com/v1/${validateResource("admob",account)}/adUnits`,await oauthToken("admob"),{pageSize:100})));
 server.registerTool("admob_network_report",{description:"AdMob Network earnings and activity (read-only) for a custom date range. Earnings are in micro units of account currency.",inputSchema:z.object({account,startDate:date,endDate:date,dimensions:z.array(z.enum(["DATE","APP","COUNTRY","AD_UNIT"])).min(1).max(2).default(["DATE"]),metrics:z.array(z.enum(["ESTIMATED_EARNINGS","CLICKS","IMPRESSIONS","AD_REQUESTS","MATCHED_REQUESTS"])).min(1).max(5).default(["ESTIMATED_EARNINGS","IMPRESSIONS"])})},async({account,startDate,endDate,dimensions,metrics})=>result(async()=>{
  validateDateRange(startDate,endDate);return googleRequest(`https://admob.googleapis.com/v1/${validateResource("admob",account)}/networkReport:generate`,await oauthToken("admob"),"POST",{reportSpec:{dateRange:{startDate:dateObject(startDate),endDate:dateObject(endDate)},dimensions,metrics}});
 }));

 server.registerTool("adsense_list_accounts",{description:"List AdSense accounts accessible through the authorized Google OAuth account.",inputSchema:z.object({})},async()=>result(async()=>googleGet("https://adsense.googleapis.com/v2/accounts",await oauthToken("adsense"))));
 server.registerTool("adsense_list_sites",{description:"List sites and Google AdSense approval states (READY, GETTING_READY, NEEDS_ATTENTION, etc).",inputSchema:z.object({account})},async({account})=>result(async()=>googleGet(`https://adsense.googleapis.com/v2/${validateResource("adsense",account)}/sites`,await oauthToken("adsense"),{pageSize:100})));
 server.registerTool("adsense_report",{description:"Read AdSense estimated earnings, impressions and clicks for a standard date range.",inputSchema:z.object({account,dateRange:z.enum(["TODAY","YESTERDAY","LAST_7_DAYS","LAST_30_DAYS","MONTH_TO_DATE"]).default("LAST_7_DAYS")})},async({account,dateRange})=>result(async()=>{const url=new URL(`https://adsense.googleapis.com/v2/${validateResource("adsense",account)}/reports:generate`);url.searchParams.set("dateRange",dateRange);for(const metric of ["ESTIMATED_EARNINGS","CLICKS","IMPRESSIONS"])url.searchParams.append("metrics[]",metric);url.searchParams.append("dimensions[]","DATE");return googleGet(url.toString(),await oauthToken("adsense"));}));
});

async function authorized(request:Request):Promise<Response>{
 const configured=process.env.MCP_BEARER_TOKEN;
 if(!configured||configured.length<32||configured.startsWith("REPLACE_"))return Response.json({error:"MCP_BEARER_TOKEN is not configured securely"},{status:503});
 if(!tokenMatches(getBearer(request),configured))return Response.json({error:"Unauthorized"},{status:401,headers:{"WWW-Authenticate":"Bearer"}});
 try{return await handler(request);}catch{return Response.json({error:"MCP handler failed. Check deployment logs."},{status:500});}
}
export const POST=authorized;
export const GET=authorized;
export const DELETE=authorized;
