import {oauthEnabled,oauthOrigin,OAUTH_SCOPE,OAUTH_WRITE_SCOPE} from "../../../src/lib/mcp-oauth-helpers";
import {oauthHeaders} from "../../../src/lib/mcp-oauth";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(){
 if(!oauthEnabled())return Response.json({error:"Not found"},{status:404,headers:oauthHeaders});
 const issuer=oauthOrigin();
 return Response.json({
  issuer,authorization_endpoint:issuer+"/oauth/authorize",token_endpoint:issuer+"/oauth/token",
  response_types_supported:["code"],grant_types_supported:["authorization_code","refresh_token"],
  token_endpoint_auth_methods_supported:["none"],code_challenge_methods_supported:["S256"],
  scopes_supported:[OAUTH_SCOPE,OAUTH_WRITE_SCOPE],client_id_metadata_document_supported:true,
  authorization_response_iss_parameter_supported:true
 },{headers:{...oauthHeaders,"Access-Control-Allow-Origin":"*"}});
}
export function OPTIONS(){return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS"}});}
