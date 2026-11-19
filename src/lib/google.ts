import {GoogleAuth,OAuth2Client} from "google-auth-library";
import {assertEnv} from "./security";

const serviceScopes={
 firebase:["https://www.googleapis.com/auth/firebase.database","https://www.googleapis.com/auth/userinfo.email"],
 play:["https://www.googleapis.com/auth/androidpublisher"],
 cloud:["https://www.googleapis.com/auth/cloud-platform"],
 analytics:["https://www.googleapis.com/auth/analytics.readonly"]
} as const;

/** Non-secret identity of the exact service account used by Google Play/Cloud calls. */
export function googleServiceAccountIdentity():{clientEmail:string;projectId:string;source:"GOOGLE_SERVICE_ACCOUNT_JSON"}{
 let credentials:unknown;
 try{credentials=JSON.parse(assertEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));}
 catch{throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON: expected a service-account JSON object");}
 const account=credentials as {client_email?:unknown;project_id?:unknown}|null;
 if(!account||typeof account!=="object"||typeof account.client_email!=="string"||!account.client_email.endsWith(".gserviceaccount.com")){
  throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON has no valid service-account email");
 }
 return {clientEmail:account.client_email,projectId:typeof account.project_id==="string"?account.project_id:"unknown",source:"GOOGLE_SERVICE_ACCOUNT_JSON"};
}

/** Retain only Google error fields needed for permission diagnosis; never return tokens or raw details. */
export function googleApiErrorMessage(httpStatus:number,payload:unknown,fallback:string):string{
 const response=payload as {error?:{message?:unknown;status?:unknown;errors?:Array<{reason?:unknown;domain?:unknown}>;details?:Array<{reason?:unknown;domain?:unknown;metadata?:{permission?:unknown;service?:unknown;method?:unknown}}>}}|null;
 const error=response?.error;
 const safe=(value:unknown,limit=100)=>typeof value==="string"?value.slice(0,limit).replace(/Bearer\s+\S+|ya29\.[A-Za-z0-9._-]+|-----BEGIN[^\n]*PRIVATE KEY-----/gi,"[redacted]"):"";
 const status=safe(error?.status,70);
 const message=safe(error?.message,700)||safe(fallback,100);
 const legacyReasons=Array.isArray(error?.errors)?error.errors:[];
 const detailedReasons=Array.isArray(error?.details)?error.details:[];
 const reasons=[...legacyReasons.map(e=>safe(e?.reason,100)),...detailedReasons.map(d=>safe(d?.reason,100))].filter(Boolean);
 const firstDetail=detailedReasons.find(d=>d&&typeof d.reason==="string");
 const metadata=firstDetail?.metadata;
 const context=[metadata?.permission?`permission=${safe(metadata.permission)}`:"",metadata?.service?`service=${safe(metadata.service)}`:"",metadata?.method?`method=${safe(metadata.method)}`:""].filter(Boolean);
 return `Google API HTTP ${httpStatus}${status?` (${status})`:""}: ${message}${reasons.length?`; reasons: ${[...new Set(reasons)].slice(0,4).join(", ")}`:""}${context.length?`; ${context.join(", ")}`:""}`;
}

export async function googleToken(service:"play"|"cloud"|"analytics"):Promise<string> {
 const raw=assertEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
 let credentials:object;
 try {credentials=JSON.parse(raw);} catch {throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_JSON: must be full JSON on one environment variable");}
 const auth=new GoogleAuth({credentials,scopes:[...serviceScopes[service]]});
 const client=await auth.getClient();
 const access=await client.getAccessToken();
 if(!access.token)throw new Error(`Unable to obtain Google ${service} service-account access token`);
 return access.token;
}
export async function oauthToken(service:"admob"|"adsense"):Promise<string> {
 const client=new OAuth2Client(assertEnv("GOOGLE_OAUTH_CLIENT_ID"),assertEnv("GOOGLE_OAUTH_CLIENT_SECRET"));
 const name=service==="admob"?"GOOGLE_ADMOB_REFRESH_TOKEN":"GOOGLE_ADSENSE_REFRESH_TOKEN";
 const refresh=process.env[name]||assertEnv("GOOGLE_OAUTH_REFRESH_TOKEN");
 client.setCredentials({refresh_token:refresh});
 const access=await client.getAccessToken();
 if(!access.token)throw new Error("Google OAuth refresh token did not produce an access token");
 return access.token;
}

/** URLs are fixed by code, not supplied by an AI. The token never appears in the URL. */
export async function googleGet(endpoint:string,token:string,params?:Record<string,string|number|undefined>):Promise<unknown>{
 return googleRequest(endpoint,token,"GET",undefined,params);
}
export async function googleRequest(endpoint:string,token:string,method:"GET"|"POST"|"PATCH"|"DELETE"|"PUT",body?:unknown,params?:Record<string,string|number|undefined>):Promise<unknown>{
 const url=new URL(endpoint);
 if(url.protocol!=="https:"||!url.hostname.endsWith(".googleapis.com"))throw new Error("Disallowed Google API host");
 for(const [k,v] of Object.entries(params||{})){if(v!==undefined)url.searchParams.set(k,String(v));}
 const controller=new AbortController();
 // The AdSense policy-issues endpoint may require a longer read window than other Google APIs.
 // Keep the extended timeout scoped to this read-only endpoint, not OAuth or writes.
 const timeoutMs=method==="GET"&&url.hostname==="adsense.googleapis.com"&&url.pathname.endsWith("/policyIssues")?28000:15000;
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 let result:Response;
 try{
  result=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(body!==undefined?{"Content-Type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",signal:controller.signal});
 }finally{clearTimeout(timeout);}
 const raw=await result.text();
 let data:unknown;
 try{data=JSON.parse(raw);}catch{data={message:raw.slice(0,1000)};}
 if(!result.ok)throw new Error(googleApiErrorMessage(result.status,data,result.statusText));
 return data;
}
