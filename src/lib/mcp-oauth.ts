import {randomBytes} from "node:crypto";
import type {Db} from "mongodb";
import {isChatGptClientId,oauthEnabled,oauthOrigin,oauthResource,OAUTH_SCOPE,matchExactSecret,sha256,validateClientMetadata,verifyPkce} from "./mcp-oauth-helpers";

const {db}=require("../../billing/lib/db.js") as {db:()=>Promise<Db>};
const REQUEST_MINUTES=10;
const ACCESS_SECONDS=3600;
const REFRESH_DAYS=30;
export const oauthHeaders={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
export type ConsentRequest={
 _id:string;clientId:string;redirectUri:string;state:string;challenge:string;scope:string;resource:string;
 csrfHash:string;expiresAt:Date;
};
type OAuthCode={_id:string;clientId:string;redirectUri:string;scope:string;challenge:string;resource:string;expiresAt:Date};
type OAuthToken={_id:string;type:"access"|"refresh";clientId:string;scope:string;resource:string;expiresAt:Date};
export function newSecret():string{return randomBytes(32).toString("base64url");}
export function oauthError(error:string,status=400):Response{
 return Response.json({error},{status,headers:oauthHeaders});
}
export async function verifyChatGptClient(clientId:string,redirectUri:string):Promise<boolean>{
 if(!isChatGptClientId(clientId))return false;
 try{
  const response=await fetch(clientId,{method:"GET",redirect:"error",cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(4500)});
  if(!response.ok||Number(response.headers.get("content-length")||0)>16384)return false;
  const raw=await response.text();
  if(raw.length>16384)return false;
  return validateClientMetadata(clientId,redirectUri,JSON.parse(raw));
 }catch{return false;}
}
export async function createConsent(input:Omit<ConsentRequest,"_id"|"csrfHash"|"expiresAt">):Promise<{id:string;csrf:string}>{
 const id="r:"+newSecret(),csrf=newSecret();
 const doc:ConsentRequest={...input,_id:id,csrfHash:sha256(csrf),expiresAt:new Date(Date.now()+REQUEST_MINUTES*60_000)};
 await (await db()).collection<ConsentRequest>("mcp_oauth_consents").insertOne(doc);
 return {id:id.slice(2),csrf};
}
export async function renewConsent(id:string):Promise<{doc:ConsentRequest;csrf:string}|null>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(id))return null;
 const csrf=newSecret(),doc=await (await db()).collection<ConsentRequest>("mcp_oauth_consents").findOneAndUpdate(
  {_id:"r:"+id,expiresAt:{$gt:new Date()}},{$set:{csrfHash:sha256(csrf)}},{returnDocument:"after"});
 return doc?{doc,csrf}:null;
}
export async function completeConsent(id:string,csrf:string,approve:boolean):Promise<{redirect:string}|null>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(id)||!/^[A-Za-z0-9_-]{43}$/.test(csrf))return null;
 const row=await (await db()).collection<ConsentRequest>("mcp_oauth_consents").findOneAndDelete({
  _id:"r:"+id,csrfHash:sha256(csrf),expiresAt:{$gt:new Date()}
 });
 if(!row)return null;
 const redirect=new URL(row.redirectUri);
 redirect.searchParams.set("state",row.state);
 redirect.searchParams.set("iss",oauthOrigin());
 if(!approve){redirect.searchParams.set("error","access_denied");return {redirect:redirect.toString()};}
 const code=newSecret();
 const codeRow:OAuthCode={
  _id:"c:"+sha256(code),clientId:row.clientId,redirectUri:row.redirectUri,scope:row.scope,
  challenge:row.challenge,resource:row.resource,expiresAt:new Date(Date.now()+120_000)
 };
 await (await db()).collection<OAuthCode>("mcp_oauth_codes").insertOne(codeRow);
 redirect.searchParams.set("code",code);
 return {redirect:redirect.toString()};
}
async function mintTokens(record:{clientId:string;scope:string;resource:string}):Promise<Record<string,unknown>>{
 const access=newSecret(),refresh=newSecret();
 const database=await db(),now=Date.now();
 await database.collection<OAuthToken>("mcp_oauth_tokens").insertMany([
  {_id:"a:"+sha256(access),type:"access",clientId:record.clientId,scope:record.scope,resource:record.resource,expiresAt:new Date(now+ACCESS_SECONDS*1000)},
  {_id:"f:"+sha256(refresh),type:"refresh",clientId:record.clientId,scope:record.scope,resource:record.resource,expiresAt:new Date(now+REFRESH_DAYS*86400_000)}
 ]);
 return {access_token:access,token_type:"Bearer",expires_in:ACCESS_SECONDS,refresh_token:refresh,scope:record.scope};
}
export async function exchangeCode(params:URLSearchParams):Promise<Record<string,unknown>|null>{
 const code=params.get("code"),clientId=params.get("client_id"),redirectUri=params.get("redirect_uri"),verifier=params.get("code_verifier");
 if(!code||!clientId||!redirectUri||!verifier||!params.has("resource")||params.get("resource")!==oauthResource())return null;
 if(!/^[A-Za-z0-9_-]{43}$/.test(code))return null;
 const database=await db();
 const record=await database.collection<OAuthCode>("mcp_oauth_codes").findOneAndDelete({
  _id:"c:"+sha256(code),clientId,redirectUri,resource:oauthResource(),expiresAt:{$gt:new Date()}
 });
 if(!record||!verifyPkce(record.challenge,verifier))return null;
 return mintTokens(record);
}
export async function refreshAccess(params:URLSearchParams):Promise<Record<string,unknown>|null>{
 const refresh=params.get("refresh_token"),clientId=params.get("client_id");
 if(!refresh||!clientId||!params.has("resource")||params.get("resource")!==oauthResource())return null;
 if(!/^[A-Za-z0-9_-]{43}$/.test(refresh))return null;
 const database=await db();
 const record=await database.collection<OAuthToken>("mcp_oauth_tokens").findOneAndDelete({
  _id:"f:"+sha256(refresh),type:"refresh",clientId,resource:oauthResource(),expiresAt:{$gt:new Date()}
 });
 return record?mintTokens(record):null;
}
export async function verifyMcpOauthAccess(token:string|null):Promise<boolean>{
 if(!oauthEnabled()||!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return false;
 const row=await (await db()).collection<OAuthToken>("mcp_oauth_tokens").findOne({
  _id:"a:"+sha256(token),type:"access",scope:OAUTH_SCOPE,resource:oauthResource(),expiresAt:{$gt:new Date()}
 });
 return !!row;
}
export function oauthChallenge():string{
 return 'Bearer resource_metadata="'+oauthOrigin()+'/.well-known/oauth-protected-resource", scope="'+OAUTH_SCOPE+'"';
}
export function safeOauthResponse(data:Record<string,unknown>):Response{
 return Response.json(data,{headers:{...oauthHeaders,"Pragma":"no-cache"}});
}
export function csrfCookie(value:string):string{
 return "forgepulse_oauth_csrf="+value+"; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Strict; Max-Age=600";
}
export function readCsrfCookie(cookie:string|null):string{
 const match=(cookie||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("forgepulse_oauth_csrf="));
 return match?match.slice("forgepulse_oauth_csrf=".length):"";
}
export function noLeaksEqual(a:string,b:string):boolean{return matchExactSecret(a,b);}
