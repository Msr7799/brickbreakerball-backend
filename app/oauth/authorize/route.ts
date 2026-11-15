import {NextRequest} from "next/server";
import {controlAuthorized} from "../../../src/lib/mcp-auth";
import {POST as loginPost} from "../../api/login/route";
import {parseAuthorizationInput,oauthEnabled,consentOriginAllowed} from "../../../src/lib/mcp-oauth-helpers";
import {createConsent,renewConsent,completeConsent,verifyChatGptClient,csrfCookie,readCsrfCookie,oauthHeaders,noLeaksEqual} from "../../../src/lib/mcp-oauth";

export const runtime="nodejs";export const dynamic="force-dynamic";
const PAGE_HEADERS={...oauthHeaders,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'","X-Frame-Options":"DENY"};
function page(request:NextRequest,id:string,csrf:string,scope:string,error=""):Response{
 const write=scope.split(/\\s+/).includes("mcp:write");
 const authenticated=controlAuthorized(request);
 const approvalLabel=write?"تسجيل الدخول والموافقة على القراءة والتعديل":"تسجيل الدخول والموافقة والعودة إلى ChatGPT";
 const formFields='<input type="hidden" name="request_id" value="'+id+'"><input type="hidden" name="csrf_token" value="'+csrf+'">';
 const errorHtml=error?'<p role="alert" class="error">'+error+'</p>':"";
 const authActions=authenticated?
  '<form action="/oauth/authorize" method="POST">'+formFields+'<button class="approve" type="submit" name="decision" value="approve">'+(write?"الموافقة على القراءة والتعديل والعودة إلى ChatGPT":"الموافقة والعودة إلى ChatGPT")+'</button><button class="deny" type="submit" name="decision" value="deny">رفض الوصول</button></form>':
  '<p>سجّل دخولك ووافق على الصلاحيات بضغطة وحدة، وعقبها بنرجّعك إلى ChatGPT تلقائياً.</p><form action="/oauth/authorize" method="POST">'+formFields+'<label for="fp-password">كلمة مرور لوحة ForgePulse</label><input id="fp-password" name="password" type="password" required maxlength="1000" autocomplete="current-password"><button class="approve" type="submit" name="decision" value="approve">'+approvalLabel+'</button><button class="deny" type="submit" name="decision" value="deny" formnovalidate>رفض الوصول</button></form>';
 const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ForgePulse - OAuth Consent</title><style>*{box-sizing:border-box}body{background:#101725;color:#f4f6f9;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}.card{max-width:550px;width:100%;background:#1b2535;border:1px solid #3d4a60;border-radius:18px;padding:32px;line-height:1.8}h1{font-size:24px}p{color:#c7d1df}label{display:block;margin-top:16px}input[type=password]{width:100%;padding:13px;border-radius:9px;background:#101725;color:#fff;border:1px solid #67758b;margin-top:8px;font:inherit}button{display:block;width:100%;border:0;border-radius:9px;margin-top:15px;padding:13px;text-align:center;font:inherit;cursor:pointer}.approve{background:#147c68;color:white}.deny{background:#354155;color:white}small{color:#d0d7e2}.error{color:#ffb4b4}</style></head><body><main class="card"><h1>تأكيد ربط ChatGPT</h1><p>ChatGPT يطلب صلاحية '+(write?"قراءة وتعديل محدد":"قراءة") + ' بيانات ForgePulse من مشروع Brick Breaker Ball، وتشمل معلومات Google Cloud وFirebase وGoogle Play وAdMob وAdSense حسب الصلاحيات المفعّلة.</p><p><strong>الصلاحية:</strong> '+(write?"قراءة وتعديل محدود حسب الأدوات المفعّلة، وكل تعديل يحتاج تأكيداً صريحاً.":"قراءة فقط، من دون أي تعديل.")+'</p><small>الاتصال محمي بموافقتك ويمكن إيقافه بتعطيل MCP OAuth من إعدادات السيرفر.</small>'+errorHtml+authActions+'</main></body></html>';
 return new Response(html,{status:error?401:200,headers:PAGE_HEADERS});
}
function fail(message:string,status=400):Response{
 return new Response(message,{status,headers:{...oauthHeaders,"Content-Type":"text/plain; charset=utf-8"}});
}
export async function GET(request:NextRequest):Promise<Response>{
 if(!oauthEnabled())return fail("OAuth is not enabled",404);
 try{
  const id=request.nextUrl.searchParams.get("request_id");
  let grant:{id:string;csrf:string}|null=null;
  let grantedScope="mcp:read";
  if(id){
   const row=await renewConsent(id);
   if(row){grant={id,csrf:row.csrf};grantedScope=row.doc.scope;}
  }else{
   const input=parseAuthorizationInput(request.nextUrl.searchParams);
   if(!await verifyChatGptClient(input.clientId,input.redirectUri))return fail("ChatGPT client metadata could not be verified",403);
   grant=await createConsent(input);grantedScope=input.scope;
  }
  if(!grant)return fail("OAuth authorization request expired. Restart connection.",400);
  const response=page(request,grant.id,grant.csrf,grantedScope);
  response.headers.set("Set-Cookie",csrfCookie(grant.csrf));
  return response;
 }catch(e){return fail(e instanceof Error&&e.message.startsWith("Invalid")?e.message:"Authorization unavailable",e instanceof Error&&e.message.startsWith("Invalid")?400:503);}
}
export async function POST(request:NextRequest):Promise<Response>{
 if(!oauthEnabled())return fail("OAuth is not enabled",404);
 // Require same-origin form submission and a one-time CSRF value bound to a Strict cookie.
 if(!consentOriginAllowed(request.headers))return fail("Invalid origin",403);
 if(!(request.headers.get("content-type")||"").startsWith("application/x-www-form-urlencoded"))return fail("Invalid content type",415);
 if(Number(request.headers.get("content-length")||0)>2048)return fail("Request too large",413);
 try{
  const raw=await request.text();if(raw.length>2048)return fail("Request too large",413);
  const body=new URLSearchParams(raw);
  if(["request_id","decision","csrf_token"].some(key=>body.getAll(key).length!==1)||body.getAll("password").length>1)return fail("Invalid approval");
  const id=body.get("request_id"),decision=body.get("decision"),submittedCsrf=body.get("csrf_token")||"";
  const cookieCsrf=readCsrfCookie(request.headers.get("cookie"));
  if(!submittedCsrf||!cookieCsrf||!noLeaksEqual(submittedCsrf,cookieCsrf))return fail("CSRF check failed",403);
  if(!id||!["approve","deny"].includes(decision||""))return fail("Invalid approval");

  // Reuse the existing admin login endpoint, including its IP rate limit,
  // password check and signed HttpOnly session cookie. Do not duplicate auth logic.
  let adminCookie:string|null=null;
  if(decision==="approve"&&!controlAuthorized(request)){
   const password=body.get("password");
   if(typeof password!=="string"||password.length>1000)return fail("Password required",400);
   const headers=new Headers(request.headers);
   headers.set("content-type","application/json");
   headers.delete("content-length");
   headers.delete("x-forwarded-host");
   headers.set("host",request.nextUrl.host);
   headers.set("origin",request.nextUrl.origin);
   const loginRequest=new NextRequest(new URL("/api/login",request.url),{
    method:"POST",headers,body:JSON.stringify({password})
   });
   const loginResponse=await loginPost(loginRequest);
   if(!loginResponse.ok){
    const message=loginResponse.status===429?"محاولات كثيرة. جرّب عقب 15 دقيقة.":loginResponse.status===401?"كلمة المرور غير صحيحة. حاول مرة ثانية.":"تعذّر تسجيل الدخول حالياً. جرّب مرة ثانية.";
    const pending=await renewConsent(id);
    if(!pending)return fail("OAuth authorization request expired. Restart connection.",400);
    const response=page(request,id,pending.csrf,pending.doc.scope,message);
    response.headers.set("Set-Cookie",csrfCookie(pending.csrf));
    return response;
   }
   adminCookie=loginResponse.headers.get("set-cookie");
   if(!adminCookie||!adminCookie.startsWith("bbb_admin="))return fail("Login session unavailable",503);
  }
  const result=await completeConsent(id,submittedCsrf,decision==="approve");
  if(!result)return fail("Authorization expired or CSRF check failed",403);
  const response=new Response(null,{status:303,headers:{...oauthHeaders,Location:result.redirect}});
  if(adminCookie)response.headers.append("Set-Cookie",adminCookie);
  response.headers.append("Set-Cookie","forgepulse_oauth_csrf=; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
  return response;
 }catch{return fail("Authorization unavailable",503);}
}
