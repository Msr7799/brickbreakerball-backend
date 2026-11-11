import {oauthEnabled} from "../../../src/lib/mcp-oauth-helpers";
import {exchangeCode,refreshAccess,oauthError,safeOauthResponse} from "../../../src/lib/mcp-oauth";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){
 if(!oauthEnabled())return oauthError("invalid_request",404);
 if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/x-www-form-urlencoded"))return oauthError("invalid_request",415);
 if(Number(request.headers.get("content-length")||0)>8192)return oauthError("invalid_request",413);
 try{
  const raw=await request.text();if(raw.length>8192)return oauthError("invalid_request",413);
  const p=new URLSearchParams(raw),keys=["grant_type","client_id","resource","code","redirect_uri","code_verifier","refresh_token"];
  if(keys.some(k=>p.getAll(k).length>1))return oauthError("invalid_request");
  const grant=p.get("grant_type");
  if(grant!=="authorization_code"&&grant!=="refresh_token")return oauthError("unsupported_grant_type");
  const result=grant==="authorization_code"?await exchangeCode(p):await refreshAccess(p);
  return result?safeOauthResponse(result):oauthError("invalid_grant");
 }catch{return oauthError("server_error",503);}
}
