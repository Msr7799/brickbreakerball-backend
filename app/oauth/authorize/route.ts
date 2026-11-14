import {NextRequest} from "next/server";
import {controlAuthorized} from "../../../src/lib/mcp-auth";
import {parseAuthorizationInput,oauthEnabled,consentOriginAllowed} from "../../../src/lib/mcp-oauth-helpers";
import {createConsent,renewConsent,completeConsent,verifyChatGptClient,csrfCookie,readCsrfCookie,oauthHeaders,noLeaksEqual} from "../../../src/lib/mcp-oauth";

export const runtime="nodejs";export const dynamic="force-dynamic";
const PAGE_HEADERS={...oauthHeaders,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'","X-Frame-Options":"DENY"};
function page(request:NextRequest,id:string,csrf:string,scope:string):Response{
 const write=scope.split(/\s+/).includes("mcp:write");
 const authenticated=controlAuthorized(request);
 const href="/oauth/authorize?request_id="+encodeURIComponent(id);
 const authActions=authenticated?
  '<form action="/oauth/authorize" method="POST"><input type="hidden" name="request_id" value="'+id+'"><input type="hidden" name="csrf_token" value="'+csrf+'"><button class="approve" type="submit" name="decision" value="approve">'+(write?"الموافقة على القراءة والتعديل":"السماح بالقراءة وربط ChatGPT")+'</button><button class="deny" type="submit" name="decision" value="deny">رفض الوصول</button></form>':
  '<p>يجب أولاً تسجيل الدخول بكلمة مرور لوحة ForgePulse في تبويب منفصل، وبعدها اضغط متابعة من هني.</p><a class="btn" href="/mcp-dashboard" target="_blank" rel="noopener noreferrer">افتح لوحة ForgePulse وسجّل الدخول</a><a class="btn" href="'+href+'">متابعة بعد تسجيل الدخول</a>';
 const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ForgePulse - OAuth Consent</title><style>*{box-sizing:border-box}body{background:#101725;color:#f4f6f9;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:20px}.card{max-width:550px;width:100%;background:#1b2535;border:1px solid #3d4a60;border-radius:18px;padding:32px;line-height:1.8}h1{font-size:24px}p{color:#c7d1df}button,.btn{display:block;width:100%;border:0;border-radius:9px;margin-top:15px;padding:13px;text-align:center;font:inherit;text-decoration:none;cursor:pointer}.approve,.btn{background:#147c68;color:white}.deny{background:#354155;color:white}small{color:#d0d7e2}</style></head><body><main class="card"><h1>تأكيد ربط ChatGPT</h1><p>ChatGPT يطلب صلاحية '+(write?"قراءة وتعديل محدد":"قراءة") + ' بيانات ForgePulse من مشروع Brick Breaker Ball، وتشمل معلومات Google Cloud وFirebase وGoogle Play وAdMob وAdSense حسب الصلاحيات المفعّلة.</p><p><strong>الصلاحية:</strong> '+(write?"قراءة وتعديل Crashlytics issues/notes وGA4 Key Events فقط. كل تعديل يحتاج تأكيداً صريحاً، ويمكن تعطيل كل أدوات الكتابة من السيرفر.":"قراءة فقط، من دون أي تعديل.")+'</p><small>الاتصال محمي بموافقتك ويمكن إيقافه بتعطيل MCP OAuth من إعدادات السيرفر.</small>'+authActions+'</main></body></html>';
 return new Response(html,{status:200,headers:PAGE_HEADERS});
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
 // Firefox/privacy-protected browsers may omit Origin for same-origin form POSTs.
 // Reject a conflicting Origin or Fetch Metadata, while requiring both a one-time
 // server-issued CSRF form value and its SameSite=Strict HttpOnly cookie.
 if(!consentOriginAllowed(request.headers))return fail("Invalid origin",403);
 if(!controlAuthorized(request))return fail("ForgePulse admin session required",401);
 if(!(request.headers.get("content-type")||"").startsWith("application/x-www-form-urlencoded"))return fail("Invalid content type",415);
 if(Number(request.headers.get("content-length")||0)>2048)return fail("Request too large",413);
 try{
  const raw=await request.text();if(raw.length>2048)return fail("Request too large",413);
  const body=new URLSearchParams(raw);
  if(["request_id","decision","csrf_token"].some(key=>body.getAll(key).length!==1))return fail("Invalid approval");
  const id=body.get("request_id"),decision=body.get("decision"),submittedCsrf=body.get("csrf_token")||"";
  const cookieCsrf=readCsrfCookie(request.headers.get("cookie"));
  if(!submittedCsrf||!cookieCsrf||!noLeaksEqual(submittedCsrf,cookieCsrf))return fail("CSRF check failed",403);
  if(!id||!["approve","deny"].includes(decision||""))return fail("Invalid approval");
  const result=await completeConsent(id,submittedCsrf,decision==="approve");
  if(!result)return fail("Authorization expired or CSRF check failed",403);
  const response=new Response(null,{status:303,headers:{...oauthHeaders,Location:result.redirect}});
  response.headers.set("Set-Cookie","forgepulse_oauth_csrf=; Path=/oauth/authorize; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
  return response;
 }catch{return fail("Authorization unavailable",503);}
}
