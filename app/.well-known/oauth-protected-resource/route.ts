import {oauthEnabled,oauthOrigin,oauthResource,OAUTH_SCOPE} from "../../../src/lib/mcp-oauth-helpers";
import {oauthHeaders} from "../../../src/lib/mcp-oauth";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(){
 if(!oauthEnabled())return Response.json({error:"Not found"},{status:404,headers:oauthHeaders});
 return Response.json({resource:oauthResource(),authorization_servers:[oauthOrigin()],scopes_supported:[OAUTH_SCOPE]},
  {headers:{...oauthHeaders,"Access-Control-Allow-Origin":"*"}});
}
export function OPTIONS(){
 return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}});
}
