import {createHash,timingSafeEqual} from "node:crypto";

export const OAUTH_SCOPE="mcp:read";
const DEFAULT_ORIGIN="https://brickbreakerball-backend.vercel.app";
const CLIENT_ID_PATTERN=/^\/oauth\/(?:[A-Za-z0-9_-]+\/)?client\.json$/;
const CALLBACK_PATTERN=/^\/connector\/oauth\/[A-Za-z0-9_-]+$/;

export function oauthOrigin():string {
 const input=process.env.MCP_OAUTH_BASE_URL||DEFAULT_ORIGIN;
 let url:URL;
 try{url=new URL(input);}catch{throw new Error("Invalid MCP_OAUTH_BASE_URL");}
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")
  throw new Error("MCP_OAUTH_BASE_URL must be an HTTPS origin without a path");
 return url.origin;
}
export function oauthResource():string{return oauthOrigin()+"/api/mcp";}
export function oauthEnabled():boolean{return process.env.MCP_OAUTH_ENABLED==="true";}
export function isChatGptClientId(value:string):boolean{
 try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="chatgpt.com"&&u.port===""&&!u.search&&!u.hash&&!u.username&&!u.password&&CLIENT_ID_PATTERN.test(u.pathname);}
 catch{return false;}
}
export function isChatGptRedirect(value:string):boolean{
 try{const u=new URL(value);return u.protocol==="https:"&&u.hostname==="chatgpt.com"&&u.port===""&&!u.search&&!u.hash&&!u.username&&!u.password&&(u.pathname==="/connector_platform_oauth_redirect"||CALLBACK_PATTERN.test(u.pathname));}
 catch{return false;}
}
export function validateClientMetadata(clientId:string,redirectUri:string,data:unknown):boolean {
 if(!isChatGptClientId(clientId)||!isChatGptRedirect(redirectUri)||!data||typeof data!=="object")return false;
 const doc=data as {client_id?:unknown;redirect_uris?:unknown;token_endpoint_auth_methods_supported?:unknown;token_endpoint_auth_method?:unknown};
 if(doc.client_id!==clientId||!Array.isArray(doc.redirect_uris)||!doc.redirect_uris.includes(redirectUri))return false;
 const methods=doc.token_endpoint_auth_methods_supported;
 return Array.isArray(methods)?methods.includes("none"):doc.token_endpoint_auth_method==="none";
}
export type AuthorizationInput={clientId:string;redirectUri:string;state:string;challenge:string;scope:string;resource:string};
export function parseAuthorizationInput(params:URLSearchParams):AuthorizationInput {
 const read=(key:string)=>{const values=params.getAll(key);if(values.length!==1)throw new Error("Invalid or duplicated OAuth parameter: "+key);return values[0];};
 const clientId=read("client_id"),redirectUri=read("redirect_uri"),state=read("state");
 const challenge=read("code_challenge"),method=read("code_challenge_method");
 const resource=read("resource"),responseType=read("response_type");
 const scope=params.has("scope")?read("scope"):OAUTH_SCOPE;
 if(!isChatGptClientId(clientId)||!isChatGptRedirect(redirectUri)||responseType!=="code"||method!=="S256"||
    !/^[A-Za-z0-9_-]{43}$/.test(challenge)||state.length<8||state.length>512||
    scope!==OAUTH_SCOPE||resource!==oauthResource())throw new Error("Invalid OAuth request");
 return {clientId,redirectUri,state,challenge,scope,resource};
}
/** Require a non-conflicting origin signal; missing/null Origin is permitted only
 * because the POST additionally requires a same-site cookie + one-time form CSRF. */
export function consentOriginAllowed(headers:Headers):boolean{
 const reported=headers.get("origin");
 return (!reported||reported==="null"||reported===oauthOrigin())&&headers.get("sec-fetch-site")!=="cross-site";
}
export function sha256(value:string):string{return createHash("sha256").update(value).digest("hex");}
export function verifyPkce(challenge:string,verifier:string):boolean{
 if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!/^[A-Za-z0-9_-]{43}$/.test(challenge))return false;
 const actual=createHash("sha256").update(verifier).digest("base64url");
 return timingSafeEqual(Buffer.from(actual),Buffer.from(challenge));
}
export function matchExactSecret(actual:string,expected:string):boolean{
 if(!actual||!expected)return false;
 return timingSafeEqual(Buffer.from(sha256(actual)),Buffer.from(sha256(expected)));
}
