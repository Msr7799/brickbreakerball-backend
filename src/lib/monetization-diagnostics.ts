/** Bounded read-only monetization readiness audit for the owner's authenticated MCP session.
 * No banking, tax, account passwords, OAuth tokens, private keys or write requests.
 */
import {googleGet,oauthToken} from "./google";

const safeError=(e:unknown)=>e instanceof Error?e.message.slice(0,350):"Google API request failed";
type AuditRead={ok:true;data:unknown}|{ok:false;error:string};
async function read(url:string,token:string,params?:Record<string,string|number>):Promise<AuditRead>{
 try{return {ok:true,data:await googleGet(url,token,params)};}
 catch(e){return {ok:false,error:safeError(e)};}
}
type Account={name:string;state?:string;displayName?:string};
const accountName=(name:string)=>/^accounts\/pub-\d{10,20}$/.test(name);
function readData<T>(x:AuditRead):T|null{return x.ok?x.data as T:null;}
function readErr(x:AuditRead):string|undefined{return x.ok?undefined:x.error;}
/** Explicitly never calls any Google mutation endpoints. */
export async function monetizationReadinessAudit(){
 const summary:{
  adsense:{account?:string;state?:string;error?:string;sites?:unknown[];siteCheckError?:string;alerts?:unknown[];alertCheckError?:string;policyIssues?:unknown[];policyCheckError?:string;adClients?:unknown[];clientCheckError?:string;additionalPolicyPages?:boolean};
  admob:{account?:string;error?:string;apps?:unknown[];appCheckError?:string;additionalAppPages?:boolean};
  scopeLimitations:string[];
 }={
  adsense:{},admob:{},
  scopeLimitations:[
   "AdMob API reports appApprovalState, not detailed Policy center rejection messages.",
   "AdSense policyIssues may be empty when the publisher has no AFC ad client in READY or GETTING_READY state.",
   "Site review feedback and payments identity/tax verification may require the Google console.",
  ],
 };
 const [adsenseResult,admobResult]=await Promise.all([
  (async()=>{
   try{
    const token=await oauthToken("adsense");
    const list=await read("https://adsense.googleapis.com/v2/accounts",token);
    if(!list.ok){summary.adsense.error=list.error;return;}
    const accounts=readData<{accounts?:Account[]}>(list)?.accounts||[];
    const account=accounts.find(a=>accountName(a.name));
    if(!account){summary.adsense.error="No authorized AdSense account";return;}
    summary.adsense.account=account.name;summary.adsense.state=account.state;
    const base=`https://adsense.googleapis.com/v2/${account.name}`;
    const [sites,alerts,issues,clients]=await Promise.all([
     read(base+"/sites",token,{pageSize:50}),
     read(base+"/alerts",token,{languageCode:"en"}),
     read(base+"/policyIssues",token,{pageSize:50}),
     read(base+"/adclients",token,{pageSize:50}),
    ]);
    const siteData=readData<{sites?:Array<{domain?:string;state?:string;autoAdsEnabled?:boolean}>}>(sites);
    if(siteData)summary.adsense.sites=(siteData.sites||[]).slice(0,25).map(x=>({domain:x.domain,state:x.state,autoAdsEnabled:x.autoAdsEnabled}));
    summary.adsense.siteCheckError=readErr(sites);
    const alertData=readData<{alerts?:Array<{severity?:string;type?:string;message?:string}>}>(alerts);
    if(alertData)summary.adsense.alerts=(alertData.alerts||[]).slice(0,25).map(x=>({severity:x.severity,type:x.type,message:(x.message||"").replace(/<[^>]+>/g," ").slice(0,650)}));
    summary.adsense.alertCheckError=readErr(alerts);
    const issueData=readData<{policyIssues?:Array<{entityType?:string;site?:string;uri?:string;policyTopics?:unknown[];action?:string;adRequestCount?:string}>;nextPageToken?:string}>(issues);
    if(issueData){summary.adsense.policyIssues=(issueData.policyIssues||[]).slice(0,50).map(x=>({entityType:x.entityType,site:x.site,uri:x.uri,action:x.action,policyTopics:x.policyTopics,adRequestCount:x.adRequestCount}));summary.adsense.additionalPolicyPages=!!issueData.nextPageToken;}
    summary.adsense.policyCheckError=readErr(issues);
    const clientData=readData<{adClients?:Array<{productCode?:string;state?:string;name?:string}>}>(clients);
    if(clientData)summary.adsense.adClients=(clientData.adClients||[]).slice(0,20).map(x=>({productCode:x.productCode,state:x.state}));
    summary.adsense.clientCheckError=readErr(clients);
   }catch(e){summary.adsense.error=safeError(e);}
  })(),
  (async()=>{
   try{
    const token=await oauthToken("admob");
    const list=await read("https://admob.googleapis.com/v1/accounts",token);
    if(!list.ok){summary.admob.error=list.error;return;}
    const accounts=readData<{account?:Account[]}>(list)?.account||[];
    const account=accounts.find(a=>accountName(a.name));
    if(!account){summary.admob.error="No authorized AdMob account";return;}
    summary.admob.account=account.name;
    const apps=await read(`https://admob.googleapis.com/v1/${account.name}/apps`,token,{pageSize:100});
    const appData=readData<{apps?:Array<{appId?:string;appApprovalState?:string;manualAppInfo?:{displayName?:string};linkedAppInfo?:{appStoreId?:string;displayName?:string}}>;nextPageToken?:string}>(apps);
    if(appData){summary.admob.apps=(appData.apps||[]).slice(0,50).map(x=>({appId:x.appId,displayName:x.linkedAppInfo?.displayName||x.manualAppInfo?.displayName,appStoreId:x.linkedAppInfo?.appStoreId,appApprovalState:x.appApprovalState}));summary.admob.additionalAppPages=!!appData.nextPageToken;}
    summary.admob.appCheckError=readErr(apps);
   }catch(e){summary.admob.error=safeError(e);}
  })(),
 ]);
 void adsenseResult;void admobResult;
 return summary;
}
