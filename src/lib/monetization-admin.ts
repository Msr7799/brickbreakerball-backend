/** Narrow, audited management adapters. No arbitrary project/account URLs or payment-method changes. */
import {assertEnv,validateResource} from "./security";
import {googleGet,googleRequest,googleToken,oauthToken} from "./google";

const id=(value:string,label:string)=>{if(!/^[a-zA-Z][a-zA-Z0-9-]{2,75}$/.test(value))throw new Error("Invalid "+label);return value;};
const publisher=(account:string,product:"admob"|"adsense")=>validateResource(product,account);
const cloudProject=()=>{const p=assertEnv("GOOGLE_CLOUD_PROJECT_ID");if(!/^[a-z][a-z0-9-]{4,62}$/.test(p))throw new Error("Invalid Google Cloud project");return p;};
const ownedName=(name:string)=>id(name,"ForgePulse Pub/Sub resource").startsWith("forgepulse-")?name:(()=>{throw new Error("New Pub/Sub resources must start with forgepulse-");})();
const cloudResource=(kind:"topics"|"subscriptions",name:string)=>`https://pubsub.googleapis.com/v1/projects/${cloudProject()}/${kind}/${ownedName(name)}`;
export async function pubsubCreateTopic(topicId:string){
 return googleRequest(cloudResource("topics",topicId),await googleToken("cloud"),"PUT",{});
}
export async function pubsubCreatePullSubscription(subscriptionId:string,topicId:string,ackDeadlineSeconds:number){
 if(!Number.isInteger(ackDeadlineSeconds)||ackDeadlineSeconds<10||ackDeadlineSeconds>600)throw new Error("Ack deadline must be 10 to 600 seconds");
 return googleRequest(cloudResource("subscriptions",subscriptionId),await googleToken("cloud"),"PUT",{
  topic:`projects/${cloudProject()}/topics/${ownedName(topicId)}`,ackDeadlineSeconds
 });
}
export async function pubsubUpdatePullAckDeadline(subscriptionId:string,ackDeadlineSeconds:number){
 if(!Number.isInteger(ackDeadlineSeconds)||ackDeadlineSeconds<10||ackDeadlineSeconds>600)throw new Error("Ack deadline must be 10 to 600 seconds");
 const url=cloudResource("subscriptions",subscriptionId);
 const token=await googleToken("cloud");
 // Never alter a push subscription or Google Play RTDN delivery route.
 const current=await googleGet(url,token) as {pushConfig?:{pushEndpoint?:string};topic?:string};
 if(current.pushConfig?.pushEndpoint)throw new Error("This tool does not modify push subscriptions");
 if(!current.topic?.startsWith(`projects/${cloudProject()}/topics/forgepulse-`))throw new Error("Only subscriptions using ForgePulse-prefixed topics can be updated");
 return googleRequest(url,token,"PATCH",{subscription:{name:`projects/${cloudProject()}/subscriptions/${subscriptionId}`,ackDeadlineSeconds},updateMask:"ackDeadlineSeconds"});
}
const validAccount=(account:string)=>{if(!/^accounts\/pub-\d{10,20}$/.test(account))throw new Error("Invalid publisher account");return account;};
async function ensureAdmobAccount(account:string){
 validAccount(account);
 const out=await googleGet("https://admob.googleapis.com/v1/accounts",await oauthToken("admob")) as {account?:Array<{name:string}>};
 if(!out.account?.some(x=>x.name===account))throw new Error("AdMob account is not in the authorized account list");
 return account;
}
export async function admobCreateAdUnit(input:{account:string;appId:string;displayName:string;adFormat:"BANNER"|"INTERSTITIAL"|"NATIVE"|"APP_OPEN"|"REWARDED"|"REWARDED_INTERSTITIAL";rewardAmount?:number;rewardItem?:string}){
 const account=await ensureAdmobAccount(input.account);
 if(!/^ca-app-pub-\d{10,20}~\d{5,30}$/.test(input.appId))throw new Error("Invalid AdMob app ID");
 if(!input.appId.startsWith("ca-app-"+account.slice("accounts/".length)))throw new Error("App publisher ID must match AdMob account");
 if(input.displayName.trim().length<2||input.displayName.length>80)throw new Error("Ad unit name must be 2-80 characters");
 const body:Record<string,unknown>={appId:input.appId,displayName:input.displayName.trim(),adFormat:input.adFormat};
 if(input.adFormat==="REWARDED"){
  if(!Number.isInteger(input.rewardAmount)||!input.rewardAmount||input.rewardAmount<1||input.rewardAmount>10000||!input.rewardItem||input.rewardItem.length>60)throw new Error("Rewarded ads require a bounded reward amount and item");
  body.rewardSettings={unitAmount:String(input.rewardAmount),unitType:input.rewardItem};
 }else if(input.rewardAmount||input.rewardItem)throw new Error("Reward settings apply only to rewarded ads");
 // Monetization endpoint is a restricted-access AdMob API. Google may reject unapproved accounts.
 return googleRequest(`https://admob.googleapis.com/v1beta/${account}/adUnits`,await oauthToken("admob"),"POST",body);
}
async function ensureAdsenseAccount(account:string){
 validAccount(account);
 const out=await googleGet("https://adsense.googleapis.com/v2/accounts",await oauthToken("adsense")) as {accounts?:Array<{name:string}>};
 if(!out.accounts?.some(x=>x.name===account))throw new Error("AdSense account not found in authorized account list");
 return account;
}
export async function adsenseListAlerts(account:string){
 await ensureAdsenseAccount(account);
 return googleGet(`https://adsense.googleapis.com/v2/${account}/alerts`,await oauthToken("adsense"));
}
export async function adsenseListPolicyIssues(account:string){
 await ensureAdsenseAccount(account);
 return googleGet(`https://adsense.googleapis.com/v2/${account}/policyIssues`,await oauthToken("adsense"),{pageSize:50});
}
export async function adsenseListPayments(account:string){
 await ensureAdsenseAccount(account);
 return googleGet(`https://adsense.googleapis.com/v2/${account}/payments`,await oauthToken("adsense"));
}
export async function adsenseListAdClients(account:string){
 await ensureAdsenseAccount(account);
 return googleGet(`https://adsense.googleapis.com/v2/${account}/adclients`,await oauthToken("adsense"),{pageSize:50});
}
export async function adsenseCreateDisplayAdUnit(account:string,adclient:string,displayName:string){
 await ensureAdsenseAccount(account);
 if(!/^ca-pub-\d{10,20}$/.test(adclient)&&!/^ca-[a-zA-Z0-9-]{4,80}$/.test(adclient))throw new Error("Invalid AdSense ad client ID");
 if(displayName.trim().length<2||displayName.length>80)throw new Error("Ad unit name must be 2-80 characters");
 // Google restricts this API method to AdSense for Platforms projects.
 const body={displayName:displayName.trim(),state:"ACTIVE",contentAdsSettings:{size:"1x3",type:"DISPLAY"}};
 return googleRequest(`https://adsense.googleapis.com/v2/${account}/adclients/${adclient}/adunits`,await oauthToken("adsense"),"POST",body);
}
