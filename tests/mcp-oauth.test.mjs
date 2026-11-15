import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {OAUTH_SCOPE,oauthOrigin,oauthResource,isChatGptClientId,isChatGptRedirect,validateClientMetadata,parseAuthorizationInput,verifyPkce,consentOriginAllowed,consentCsrfAllowed,consentTokenSelector,consentReplayAllowed,matchExactSecret} from "../src/lib/mcp-oauth-helpers.ts";

const clientId="https://chatgpt.com/oauth/client.json";
const redirectUri="https://chatgpt.com/connector_platform_oauth_redirect";
const challenge=createHash("sha256").update("v".repeat(50)).digest("base64url");
function params(){return new URLSearchParams({response_type:"code",client_id:clientId,redirect_uri:redirectUri,state:"test-state-123456",code_challenge:challenge,code_challenge_method:"S256",scope:OAUTH_SCOPE,resource:oauthResource()});}
test("resource audience is a fixed HTTPS endpoint",()=>{assert.equal(oauthOrigin(),"https://brickbreakerball-backend.vercel.app");assert.equal(oauthResource(),"https://brickbreakerball-backend.vercel.app/api/mcp");});
test("client ID only permits official ChatGPT CIMD documents",()=>{
 assert.equal(isChatGptClientId(clientId),true);
 assert.equal(isChatGptClientId("https://chatgpt.com/oauth/6hDz8npO8PPP/client.json"),true);
 for(const evil of ["https://chatgpt.com.evil.org/oauth/client.json","http://chatgpt.com/oauth/client.json","https://chatgpt.com/oauth/client.json?redirect=https://evil.org","https://evil.org/oauth/client.json"])assert.equal(isChatGptClientId(evil),false);
});
test("redirect allowlist accepts only documented ChatGPT endpoints",()=>{
 assert.equal(isChatGptRedirect(redirectUri),true);
 assert.equal(isChatGptRedirect("https://chatgpt.com/connector/oauth/6hDz8npO8PPP"),true);
 for(const evil of ["https://evil.example/callback","https://chatgpt.com.evil.example/connector_platform_oauth_redirect","https://chatgpt.com/redirect","https://chatgpt.com/connector_platform_oauth_redirect?x=1"])assert.equal(isChatGptRedirect(evil),false);
});
test("client metadata matches exact client ID, redirect URI, and public-client token mode",()=>{
 const ok={client_id:clientId,redirect_uris:[redirectUri],token_endpoint_auth_methods_supported:["none","private_key_jwt"]};
 assert.equal(validateClientMetadata(clientId,redirectUri,ok),true);
 assert.equal(validateClientMetadata(clientId,redirectUri,{...ok,client_id:"https://evil.example"}),false);
 assert.equal(validateClientMetadata(clientId,redirectUri,{...ok,redirect_uris:["https://evil.example/cb"]}),false);
 assert.equal(validateClientMetadata(clientId,redirectUri,{...ok,token_endpoint_auth_methods_supported:["private_key_jwt"]}),false);
});
test("authorization validates PKCE, resource audience, scope, and non-repeated fields",()=>{
 assert.equal(parseAuthorizationInput(params()).scope,OAUTH_SCOPE);
 const writeParams=params();writeParams.set("scope","mcp:read mcp:write");assert.equal(parseAuthorizationInput(writeParams).scope,"mcp:read mcp:write");
 const badResource=params();badResource.set("resource","https://another.example/api/mcp");assert.throws(()=>parseAuthorizationInput(badResource));
 const badScope=params();badScope.set("scope","mcp:write");assert.throws(()=>parseAuthorizationInput(badScope));
 const badMethod=params();badMethod.set("code_challenge_method","plain");assert.throws(()=>parseAuthorizationInput(badMethod));
 const badRedirect=params();badRedirect.set("redirect_uri","https://evil.example/callback");assert.throws(()=>parseAuthorizationInput(badRedirect));
 const duplicated=params();duplicated.append("state","other-state");assert.throws(()=>parseAuthorizationInput(duplicated));
});
test("PKCE verifier is compared securely and uses SHA256 not plain text",()=>{
 assert.equal(verifyPkce(challenge,"v".repeat(50)),true);
 assert.equal(verifyPkce(challenge,"x".repeat(50)),false);
 assert.equal(verifyPkce(challenge,"short"),false);
});


test("consent handles privacy browsers without Origin but rejects cross-site submissions",()=>{
 const h=(headers)=>new Headers(headers);
 assert.equal(consentOriginAllowed(h({})),true);
 assert.equal(consentOriginAllowed(h({"sec-fetch-site":"same-origin"})),true);
 assert.equal(consentOriginAllowed(h({origin:"null"})),true);
 assert.equal(consentOriginAllowed(h({origin:"https://brickbreakerball-backend.vercel.app"})),true);
 assert.equal(consentOriginAllowed(h({origin:"https://attacker.example"})),false);
 assert.equal(consentOriginAllowed(h({"sec-fetch-site":"cross-site"})),false);
 assert.equal(consentOriginAllowed(h({origin:"null","sec-fetch-site":"cross-site"})),false);
});
test("CSRF form token must match same-site cookie value exactly",()=>{
 const token="Z".repeat(43);
 assert.equal(matchExactSecret(token,token),true);
 assert.equal(matchExactSecret(token,""),false);
 assert.equal(matchExactSecret(token,"Y".repeat(43)),false);
});

test("mobile and desktop consent rejects forged CSRF and accepts trusted no-cookie flows",()=>{
 const token="T".repeat(43),other="Q".repeat(43);
 const sameOrigin=new Headers({origin:oauthOrigin(),"sec-fetch-site":"same-origin"});
 const privacyWebview=new Headers({"sec-fetch-site":"same-origin"});
 const crossSite=new Headers({origin:"https://attacker.example","sec-fetch-site":"cross-site"});
 const unsafeUnknown=new Headers({});
 assert.equal(consentCsrfAllowed(token,token,sameOrigin),true);
 // A stale cookie from another OAuth tab does not invalidate the server-held form secret.
 assert.equal(consentCsrfAllowed(token,other,sameOrigin),true);
 assert.equal(consentCsrfAllowed(token,other,unsafeUnknown),false);
 assert.equal(consentCsrfAllowed(token,"",sameOrigin),true);
 assert.equal(consentCsrfAllowed(token,"",privacyWebview),true);
 assert.equal(consentCsrfAllowed(token,"",crossSite),false);
 assert.equal(consentCsrfAllowed(token,"",unsafeUnknown),false);
 assert.equal(consentCsrfAllowed("invalid","",sameOrigin),false);
 assert.equal(consentCsrfAllowed(token,"",new Headers({origin:"null","sec-fetch-site":"cross-site"})),false);
});

// A refreshed login page must not invalidate a still-open earlier form.
test("consent token selector accepts both initial and refreshed server-stored hashes",()=>{
 const id="R".repeat(43),token="Z".repeat(43),now=new Date("2026-11-16T00:00:00.000Z");
 const selector=consentTokenSelector(id,token,now);
 const hash=createHash("sha256").update(token).digest("hex");
 assert.deepEqual(selector,{_id:"r:"+id,expiresAt:{$gt:now},$or:[{csrfHash:hash},{csrfHashes:hash}]});
 assert.equal(selector.$or.length,2);
});
test("a mismatch from an unrelated site cannot use a stale cookie to bypass CSRF",()=>{
 const token="T".repeat(43),other="Q".repeat(43);
 const outsider=new Headers({origin:"https://attacker.example","sec-fetch-site":"cross-site"});
 assert.equal(consentOriginAllowed(outsider),false);
 assert.equal(consentCsrfAllowed(token,other,outsider),false);
 assert.equal(consentCsrfAllowed(token,"",outsider),false);
});

test("a completed approval is idempotent for 90s without minting another code",()=>{
 const now=new Date("2026-11-16T00:00:00Z");
 const code="C".repeat(43),fresh=new Date(now.getTime()+90_000),expired=new Date(now.getTime()-1);
 assert.equal(consentReplayAllowed({completedDecision:"approve",completedCode:code,replayUntil:fresh},true,now),true);
 assert.equal(consentReplayAllowed({completedDecision:"approve",completedCode:code,replayUntil:fresh},false,now),false);
 assert.equal(consentReplayAllowed({completedDecision:"approve",completedCode:code,replayUntil:expired},true,now),false);
 assert.equal(consentReplayAllowed({completedDecision:"approve",completedCode:"",replayUntil:fresh},true,now),false);
 assert.equal(consentReplayAllowed({completedDecision:"deny",replayUntil:fresh},false,now),true);
 assert.equal(consentReplayAllowed({completedDecision:"deny",replayUntil:fresh},true,now),false);
 assert.equal(consentReplayAllowed(null,true,now),false);
});
