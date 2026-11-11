import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {OAUTH_SCOPE,oauthOrigin,oauthResource,isChatGptClientId,isChatGptRedirect,validateClientMetadata,parseAuthorizationInput,verifyPkce} from "../src/lib/mcp-oauth-helpers.ts";

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
