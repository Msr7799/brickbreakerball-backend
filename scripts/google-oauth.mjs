/** Run LOCALLY only. Authorizes Google AdMob and AdSense read-only scopes. No tokens are persisted. */
import { OAuth2Client } from "google-auth-library";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";

const mode=process.argv.includes("--admob")?"admob":process.argv.includes("--adsense")?"adsense":"both";
const id=process.env.GOOGLE_OAUTH_CLIENT_ID;
const secret=process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if(!id||!secret){console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET before running npm run oauth");process.exit(1);}
const port=8765;
const redirect=`http://127.0.0.1:${port}/callback`;
const oauth=new OAuth2Client(id,secret,redirect);
const state=randomBytes(24).toString("hex");
const url=oauth.generateAuthUrl({
 access_type:"offline",prompt:"consent",state,
 scope:mode==="admob"?["https://www.googleapis.com/auth/admob.readonly"]:mode==="adsense"?["https://www.googleapis.com/auth/adsense.readonly"]:["https://www.googleapis.com/auth/admob.readonly","https://www.googleapis.com/auth/adsense.readonly"]
});
const server=createServer(async(req,res)=>{
 try {
  const parsed=new URL(req.url||"/",redirect);
  if(parsed.pathname!=="/callback"){res.writeHead(404).end("Not found");return;}
  if(parsed.searchParams.get("state")!==state)throw new Error("OAuth state mismatch");
  if(parsed.searchParams.has("error"))throw new Error(parsed.searchParams.get("error")||"Authorization denied");
  const code=parsed.searchParams.get("code");if(!code)throw new Error("Google did not return a code");
  const {tokens}=await oauth.getToken(code);
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}).end("<h2>Google authorization complete</h2><p>Return to your terminal. Keep your refresh token private.</p>");
  if(!tokens.refresh_token)console.error("No refresh token returned. Revoke old consent, verify app consent screen, retry.");
  else console.log("\n"+(mode==="both"?"GOOGLE_OAUTH_REFRESH_TOKEN":mode==="admob"?"GOOGLE_ADMOB_REFRESH_TOKEN":"GOOGLE_ADSENSE_REFRESH_TOKEN")+"="+tokens.refresh_token+"\nCopy ONLY to .env.local / Vercel secret settings. NEVER share this token.\n");
 }catch(err){res.writeHead(400).end("OAuth failed. Check terminal.");console.error(err instanceof Error?err.message:err);}
 finally{server.close();}
});
server.listen(port,"127.0.0.1",()=>{
 console.log("\nOpen this URL in your browser while signed into the Google account with AdMob + AdSense access:\n");
 console.log(url+"\n");
 console.log("Local callback listening at "+redirect+"\n");
});
