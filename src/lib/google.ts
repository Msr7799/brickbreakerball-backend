import {GoogleAuth,OAuth2Client} from "google-auth-library";
import {assertEnv} from "./security";

const serviceScopes={
 firebase:["https://www.googleapis.com/auth/firebase.database","https://www.googleapis.com/auth/userinfo.email"],
 play:["https://www.googleapis.com/auth/androidpublisher"],
 cloud:["https://www.googleapis.com/auth/cloud-platform"]
} as const;

export async function googleToken(service:"play"|"cloud"):Promise<string> {
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
export async function googleRequest(endpoint:string,token:string,method:"GET"|"POST",body?:unknown,params?:Record<string,string|number|undefined>):Promise<unknown>{
 const url=new URL(endpoint);
 if(url.protocol!=="https:"||!url.hostname.endsWith(".googleapis.com"))throw new Error("Disallowed Google API host");
 for(const [k,v] of Object.entries(params||{})){if(v!==undefined)url.searchParams.set(k,String(v));}
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),15000);
 let result:Response;
 try{
  result=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,Accept:"application/json",...(body!==undefined?{"Content-Type":"application/json"}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",signal:controller.signal});
 }finally{clearTimeout(timeout);}
 const raw=await result.text();
 let data:unknown;
 try{data=JSON.parse(raw);}catch{data={message:raw.slice(0,1000)};}
 if(!result.ok){const error=data as {error?:{message?:string;status?:string}};
  throw new Error(`Google API HTTP ${result.status}: ${error?.error?.message?.slice(0,700)||result.statusText}`);
 }
 return data;
}
