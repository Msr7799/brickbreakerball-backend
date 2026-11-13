/**
 * Turn Google token-exchange failures into actionable messages without exposing
 * response bodies, refresh tokens, OAuth client secrets, or upstream stack traces.
 */
export type AdsProvider = "admob" | "adsense";
type ApiError = {
  message?: unknown;
  code?: unknown;
  response?: {data?: {error?: unknown}};
};

export function oauthErrorCode(error:unknown):"invalid_grant"|"invalid_client"|"unauthorized_client"|null {
  const candidate = error && typeof error === "object" ? error as ApiError : {};
  const values = [candidate.response?.data?.error,candidate.code,candidate.message,error];
  for(const value of values){
    if(typeof value !== "string")continue;
    const match = value.match(/\b(invalid_grant|invalid_client|unauthorized_client)\b/i);
    if(match)return match[1].toLowerCase() as "invalid_grant"|"invalid_client"|"unauthorized_client";
  }
  return null;
}

export function safeOAuthFailureMessage(provider:AdsProvider,envKey:string,error:unknown):string {
  const label=provider==="admob"?"AdMob":"AdSense";
  const code=oauthErrorCode(error);
  if(code==="invalid_grant"){
    return `Google ${label} OAuth refresh token rejected (invalid_grant). Re-authorize the Google account locally with pnpm run oauth, replace ${envKey} in Vercel Production, and redeploy. Check whether the OAuth consent screen is still in Testing mode.`;
  }
  if(code==="invalid_client"||code==="unauthorized_client"){
    return `Google ${label} OAuth client rejected (${code}). Verify GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET belong to the same OAuth client used to issue ${envKey}.`;
  }
  return `Google ${label} OAuth access token refresh failed. Verify the OAuth client, Google account authorization and API availability; no credentials were logged.`;
}
