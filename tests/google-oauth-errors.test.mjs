import test from "node:test";
import assert from "node:assert/strict";
import {oauthErrorCode,safeOAuthFailureMessage} from "../src/lib/google-oauth-errors.ts";

test("recognizes Google invalid_grant from nested API response and message",()=>{
  assert.equal(oauthErrorCode({response:{data:{error:"invalid_grant"}}}),"invalid_grant");
  assert.equal(oauthErrorCode(new Error("invalid_grant")),"invalid_grant");
});
test("distinguishes invalid_client and unknown failures",()=>{
  assert.equal(oauthErrorCode({response:{data:{error:"invalid_client"}}}),"invalid_client");
  assert.equal(oauthErrorCode(new Error("ETIMEDOUT")),null);
});
test("safe errors identify the correct provider and env key without leaking token contents",()=>{
  const secret="not-for-logs-abc123456";
  const message=safeOAuthFailureMessage("admob","GOOGLE_ADMOB_REFRESH_TOKEN",new Error("invalid_grant "+secret));
  assert.match(message,/AdMob/);
  assert.match(message,/GOOGLE_ADMOB_REFRESH_TOKEN/);
  assert.match(message,/invalid_grant/);
  assert.equal(message.includes(secret),false);
  const other=safeOAuthFailureMessage("adsense","GOOGLE_OAUTH_REFRESH_TOKEN",{response:{data:{error:"invalid_client",error_description:secret}}});
  assert.match(other,/AdSense/);
  assert.match(other,/GOOGLE_OAUTH_CLIENT_ID/);
  assert.equal(other.includes(secret),false);
});
