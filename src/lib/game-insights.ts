/** Audited MCP read-only adapters for Firebase Crashlytics and GA4 Data API. */
import {assertEnv} from "./security";
import {googleGet,googleRequest,googleToken} from "./google";

const project=()=>assertEnv("GOOGLE_CLOUD_PROJECT_ID");
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
 const token=await googleToken("cloud");
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
 return googleGet(`${await crashRoot()}/reports`,await googleToken("cloud"));
}
export async function crashlyticsGetReport(input:{reportId:string;hours:number;version?:string;pageSize:number;pageToken?:string}){
 const root=await crashRoot();
 const url=new URL(`${root}/reports/${safeId(input.reportId,"Crashlytics report")}`);
 for(const [k,v] of crashFilter(input.hours,input.version))url.searchParams.append(k,v);
 url.searchParams.set("pageSize",String(input.pageSize));
 if(input.pageToken)url.searchParams.set("pageToken",input.pageToken);
 return googleGet(url.toString(),await googleToken("cloud"));
}
export async function crashlyticsGetIssue(issueId:string){
 return googleGet(`${await crashRoot()}/issues/${safeId(issueId,"Crashlytics issue")}`,await googleToken("cloud"));
}
export async function crashlyticsListEvents(input:{issueId:string;hours:number;version?:string;pageSize:number;pageToken?:string}){
 const url=new URL(`${await crashRoot()}/events`);
 for(const [k,v] of crashFilter(input.hours,input.version))url.searchParams.append(k,v);
 url.searchParams.set("filter.issue.id",safeId(input.issueId,"Crashlytics issue"));
 url.searchParams.set("pageSize",String(input.pageSize));
 if(input.pageToken)url.searchParams.set("pageToken",input.pageToken);
 return googleGet(url.toString(),await googleToken("cloud"));
}
type AnalyticsDetails={analyticsProperty?:{id?:string};streamMappings?:Array<{app?:string;streamId?:string}>};
async function analyticsContext():Promise<{propertyId:string;streamId?:string}>{
 const details=await googleGet(
  `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(project())}/analyticsDetails`,
  await googleToken("cloud")
 ) as AnalyticsDetails;
 const id=(process.env.GA4_PROPERTY_ID||details.analyticsProperty?.id||"").replace(/^properties\//,"");
 if(!/^\d{5,30}$/.test(id))throw new Error("GA4 property not linked or GA4_PROPERTY_ID is invalid");
 const app=await androidAppId();
 const mapping=details.streamMappings?.find(x=>x.app?.endsWith(`/androidApps/${app}`));
 return {propertyId:id,streamId:mapping?.streamId};
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
 const data=await googleRequest(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,await googleToken("analytics"),"POST",body);
 return {propertyId,scopedToAndroidStream:!!streamId,report:kind,data};
}
