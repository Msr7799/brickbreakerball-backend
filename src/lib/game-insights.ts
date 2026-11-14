/** Scoped Firebase Crashlytics and GA4 Data/Admin API adapters. */
import {assertEnv} from "./security";
import {googleGet,googleRequest} from "./google";
import {GoogleAuth} from "google-auth-library";

/** The Firebase Analytics/Crashlytics project may differ from the Google Play RTDN Cloud project. */
function firebaseCredentials():{project_id?:string;client_email?:string;[key:string]:unknown}{
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON||assertEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
 try{
  const value=JSON.parse(raw) as Record<string,unknown>;
  if(!value||typeof value!=="object"||typeof value.client_email!=="string")throw Error("missing service-account identity");
  return value as {project_id?:string;client_email?:string};
 }catch{throw new Error("Invalid Firebase service-account JSON");}
}
const project=()=>{
 const id=process.env.FIREBASE_INSIGHTS_PROJECT_ID||process.env.FIREBASE_PROJECT_ID||firebaseCredentials().project_id||assertEnv("GOOGLE_CLOUD_PROJECT_ID");
 if(!/^[a-z][a-z0-9-]{3,62}$/.test(id))throw new Error("Invalid Firebase insights project ID");
 return id;
};
async function insightsToken(service:"firebase"|"analytics"|"analyticsEdit"):Promise<string>{
 const scopes=service==="firebase"?["https://www.googleapis.com/auth/cloud-platform"]:service==="analyticsEdit"?["https://www.googleapis.com/auth/analytics.edit"]:["https://www.googleapis.com/auth/analytics.readonly"];
 const auth=new GoogleAuth({credentials:firebaseCredentials(),scopes});
 const client=await auth.getClient(),access=await client.getAccessToken();
 if(!access.token)throw new Error("Could not get Firebase insights read token");
 return access.token;
}
const packageName=()=>assertEnv("ANDROID_PACKAGE_NAME");
const safeId=(id:string,kind:string)=>{
 if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id))throw new Error(`Invalid ${kind} identifier`);
 return id;
};
function configAppId(){
 const id=process.env.FIREBASE_ANDROID_APP_ID?.trim();
 if(id&&!/^1:\d+:android:[a-zA-Z0-9]+$/.test(id))throw new Error("Invalid FIREBASE_ANDROID_APP_ID");
 return id;
}
/** Use an explicit Firebase App ID or discover the Android app matching our package. */
async function androidAppId():Promise<string>{
 const explicit=configAppId();if(explicit)return explicit;
 const token=await insightsToken("firebase");
 let pageToken:string|undefined;
 for(let page=0;page<10;page++){
  const payload=await googleGet(`https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(project())}/androidApps`,token,{pageSize:100,pageToken}) as {
   apps?:Array<{appId:string;packageName:string}>;nextPageToken?:string
  };
  const selected=payload.apps?.find(app=>app.packageName===packageName());
  if(selected?.appId)return selected.appId;
  pageToken=payload.nextPageToken;if(!pageToken)break;
 }
 throw new Error("Firebase Android app not found. Set FIREBASE_ANDROID_APP_ID for this package.");
}
async function crashRoot(){
 const id=await androidAppId();
 return `https://firebasecrashlytics.googleapis.com/v1alpha/projects/${encodeURIComponent(project())}/apps/${encodeURIComponent(id)}`;
}
function crashFilter(hours:number,version?:string){
 const now=Date.now(),url=new URL("https://example.invalid/");
 url.searchParams.set("filter.interval.startTime",new Date(now-hours*3600000).toISOString());
 url.searchParams.set("filter.interval.endTime",new Date(now).toISOString());
 if(version?.trim())url.searchParams.append("filter.version.displayNames",version.trim());
 return url.searchParams;
}
export async function crashlyticsListReports(){
 return googleGet(`${await crashRoot()}/reports`,await insightsToken("firebase"));
}
export async function crashlyticsGetReport(input:{reportId:string;hours:number;version?:string;pageSize:number;pageToken?:string}){
 const root=await crashRoot();
 const url=new URL(`${root}/reports/${safeId(input.reportId,"Crashlytics report")}`);
 for(const [k,v] of crashFilter(input.hours,input.version))url.searchParams.append(k,v);
 url.searchParams.set("pageSize",String(input.pageSize));
 if(input.pageToken)url.searchParams.set("pageToken",input.pageToken);
 return googleGet(url.toString(),await insightsToken("firebase"));
}
export async function crashlyticsGetIssue(issueId:string){
 return googleGet(`${await crashRoot()}/issues/${safeId(issueId,"Crashlytics issue")}`,await insightsToken("firebase"));
}
export async function crashlyticsListEvents(input:{issueId:string;hours:number;version?:string;pageSize:number;pageToken?:string}){
 const url=new URL(`${await crashRoot()}/events`);
 for(const [k,v] of crashFilter(input.hours,input.version))url.searchParams.append(k,v);
 url.searchParams.set("filter.issue.id",safeId(input.issueId,"Crashlytics issue"));
 url.searchParams.set("pageSize",String(input.pageSize));
 if(input.pageToken)url.searchParams.set("pageToken",input.pageToken);
 return googleGet(url.toString(),await insightsToken("firebase"));
}
type AnalyticsDetails={analyticsProperty?:{id?:string};streamMappings?:Array<{app?:string;streamId?:string}>};
async function analyticsContext():Promise<{propertyId:string;streamId?:string}>{
 const details=await googleGet(
  `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(project())}/analyticsDetails`,
  await insightsToken("firebase")
 ) as AnalyticsDetails;
 const id=(process.env.GA4_PROPERTY_ID||details.analyticsProperty?.id||"").replace(/^properties\//,"");
 if(!/^\d{5,30}$/.test(id))throw new Error("GA4 property not linked or GA4_PROPERTY_ID is invalid");
 const app=await androidAppId();
 const mapping=details.streamMappings?.find(x=>x.app?.endsWith(`/androidApps/${app}`));
 const streamId=process.env.GA4_ANDROID_STREAM_ID||mapping?.streamId;
 if(!streamId||!/^\d{1,30}$/.test(streamId))throw new Error("GA4 Android stream not found. Set GA4_ANDROID_STREAM_ID to avoid mixing other app data.");
 return {propertyId:id,streamId};
}
/** Restrict Data API queries to the Firebase Android stream where mapping is available. */
export async function analyticsReport(kind:"overview"|"events"|"versions",days:number,limit=20){
 const {propertyId,streamId}=await analyticsContext();
 const dimensions=kind==="overview"?["date"]:kind==="events"?["eventName"]:["appVersion"];
 const metrics=kind==="overview"?["activeUsers","newUsers","sessions","eventCount"]:kind==="events"?["eventCount","activeUsers"]:["activeUsers","eventCount"];
 const body:Record<string,unknown>={
  dateRanges:[{startDate:`${days-1}daysAgo`,endDate:"today"}],
  dimensions:dimensions.map(name=>({name})),
  metrics:metrics.map(name=>({name})),
  limit:String(limit),
  keepEmptyRows:false
 };
 if(streamId)body.dimensionFilter={filter:{fieldName:"streamId",stringFilter:{matchType:"EXACT",value:streamId}}};
 if(kind!=="overview")body.orderBys=[{metric:{metricName:kind==="events"?"eventCount":"activeUsers"},desc:true}];
 const data=await googleRequest(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,await insightsToken("analytics"),"POST",body);
 return {propertyId,scopedToAndroidStream:!!streamId,report:kind,data};
}

/** Restrict all mutations to the configured Firebase Android app; identifiers cannot override the project or app. */
async function crashIssueRoot(issueId:string){
 return `${await crashRoot()}/issues/${safeId(issueId,"Crashlytics issue")}`;
}
export async function crashlyticsUpdateIssue(issueId:string,state:"OPEN"|"CLOSED"|"MUTED"){
 const name=await crashIssueRoot(issueId);
 return googleRequest(`${name}?updateMask=state`,await insightsToken("firebase"),"PATCH",{state});
}
export async function crashlyticsListNotes(issueId:string,pageSize=30,pageToken?:string){
 return googleGet(`${await crashIssueRoot(issueId)}/notes`,await insightsToken("firebase"),{pageSize,pageToken});
}
export async function crashlyticsCreateNote(issueId:string,body:string){
 if(body.trim().length<1||body.length>3000)throw new Error("Crashlytics note must be 1-3000 characters");
 return googleRequest(`${await crashIssueRoot(issueId)}/notes`,await insightsToken("firebase"),"POST",{body:body.trim()});
}
export async function crashlyticsDeleteNote(issueId:string,noteId:string){
 return googleRequest(`${await crashIssueRoot(issueId)}/notes/${safeId(noteId,"Crashlytics note")}`,await insightsToken("firebase"),"DELETE");
}
/** GA4 Key Events are PROPERTY-wide, not Android-stream-only. Confirm before changes. */
async function analyticsKeyEventRoot(){
 const {propertyId}=await analyticsContext(); // validates the Firebase project and matching Android app
 return `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/keyEvents`;
}
export async function analyticsListKeyEvents(pageSize=50,pageToken?:string){
 return googleGet(await analyticsKeyEventRoot(),await insightsToken("analytics"),{pageSize,pageToken});
}
export async function analyticsCreateKeyEvent(eventName:string,countingMethod:"ONCE_PER_EVENT"|"ONCE_PER_SESSION"){
 if(!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(eventName))throw new Error("Invalid GA4 event name");
 return googleRequest(await analyticsKeyEventRoot(),await insightsToken("analyticsEdit"),"POST",{eventName,countingMethod});
}
export async function analyticsUpdateKeyEvent(keyEventId:string,countingMethod:"ONCE_PER_EVENT"|"ONCE_PER_SESSION"){
 const root=await analyticsKeyEventRoot(),name=`${root}/${safeId(keyEventId,"GA4 key event")}`;
 return googleRequest(`${name}?updateMask=counting_method`,await insightsToken("analyticsEdit"),"PATCH",{countingMethod});
}
export async function analyticsDeleteKeyEvent(keyEventId:string){
 return googleRequest(`${await analyticsKeyEventRoot()}/${safeId(keyEventId,"GA4 key event")}`,await insightsToken("analyticsEdit"),"DELETE");
}
