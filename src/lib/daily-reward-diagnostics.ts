/** Admin-only, read-only checks for the Play Games -> Firebase -> daily reward path. */
import {gameFirebaseAuth} from './game-firebase-auth';
import {probeDailyRewardDatabase} from './daily-rewards';
import {randomUUID} from 'node:crypto';

const EXPECTED_PLAY_CLIENT = '6148685744-2gql3gj9l1q6d9167j47h4a4qtbvndnr.apps.googleusercontent.com';
const EXPECTED_FIREBASE_PROJECT = 'brick-breaker-ball-8e4f5';
export type CheckState = 'passed'|'failed'|'pending';
export type Check = {id:string;title:string;state:CheckState;code:string;detail:string;hint:string;latencyMs:number|null};
export type DiagnosticReport = {checkedAt:string;checks:Check[];scope:string;runId:string|null};

function checked(id:string,title:string,state:CheckState,code:string,detail:string,hint='',latencyMs:number|null=null):Check {
  return {id,title,state,code,detail,hint,latencyMs};
}
function configuration():Check[] {
  const oauthReady=process.env.PLAY_GAMES_SERVER_CLIENT_ID===EXPECTED_PLAY_CLIENT && !!process.env.PLAY_GAMES_SERVER_CLIENT_SECRET?.trim();
  let firebaseReady=false;
  try {
    const raw=process.env.GAME_FIREBASE_SERVICE_ACCOUNT_JSON;
    if(raw) {
      const key=JSON.parse(raw) as {project_id?:string;client_email?:string;private_key?:string};
      firebaseReady=key.project_id===EXPECTED_FIREBASE_PROJECT && !!key.client_email && !!key.private_key;
    }
  } catch {/* Invalid JSON is reported only as a configuration failure. */}
  const storeReady=!!process.env.MONGODB_URI?.trim() && !!process.env.MONGODB_DB?.trim();
  return [
    checked('play_configuration','إعداد Play Games',oauthReady?'passed':'failed',oauthReady?'configured':'play_oauth_configuration',oauthReady?'معرّف عميل Game Server والسر مضبوطان.':'معرّف Game Server أو السر ناقص أو لا يطابق الربط.','راجع PLAY_GAMES_SERVER_CLIENT_ID وPLAY_GAMES_SERVER_CLIENT_SECRET في Vercel.'),
    checked('firebase_configuration','إعداد Firebase للعبة',firebaseReady?'passed':'failed',firebaseReady?'configured':'firebase_configuration',firebaseReady?`حساب الخدمة يخص ${EXPECTED_FIREBASE_PROJECT}.`:'حساب الخدمة مفقود أو ملفه غير صالح أو يخص مشروعاً آخر.','راجع GAME_FIREBASE_SERVICE_ACCOUNT_JSON ومشروع Firebase الخاص بتطبيق Android.'),
    checked('store_configuration','إعداد مخزن المكافآت',storeReady?'passed':'failed',storeReady?'configured':'mongo_configuration',storeReady?'عنوان MongoDB واسم قاعدة البيانات مضبوطان.':'إعداد MongoDB ناقص.','راجع MONGODB_URI وMONGODB_DB في Vercel.'),
  ];
}
function pendingChecks():Check[] {return [
  checked('play_oauth','تبادل رمز Play Games','pending','not_checked','لم يُفحص قبول عميل Google OAuth بعد.','اضغط «تشغيل الفحص».'),
  checked('firebase_auth','صلاحية Firebase Auth','pending','not_checked','لم يُفحص الوصول الفعلي إلى Firebase Auth بعد.','اضغط «تشغيل الفحص».'),
  checked('daily_store','قاعدة الديلي ريوورد','pending','not_checked','لم يُفحص اتصال MongoDB الفعلي بعد.','اضغط «تشغيل الفحص».'),
  checked('player_flow','دخول اللاعب والمطالبة من الهاتف','pending','device_required','فحص السيرفر لا يثبت وصول رمز لاعب حقيقي أو استلام المكافأة في التطبيق.','اختبر نسخة QA على الهاتف بعد نجاح فحوصات السيرفر.'),
];}
export function configurationReport():DiagnosticReport {
  return {checkedAt:new Date().toISOString(),scope:'configuration_only',runId:null,checks:[...configuration(),...pendingChecks()]};
}
async function timed(id:string,title:string,operation:()=>Promise<string>,failureCode:string,failureDetail:string,hint:string):Promise<Check> {
  const start=Date.now();
  try {const detail=await operation();return checked(id,title,'passed','live_response',detail,'',Date.now()-start);}
  catch(error) {
    const code=(error as {code?:string}).code;
    // Error messages can contain account or transport details; send only a bounded classification.
    const safeCode=typeof code==='string' && (/^auth\/[a-z-]+$/.test(code) || ['invalid_client','oauth_unexpected_response'].includes(code))?code:failureCode;
    return checked(id,title,'failed',safeCode,failureDetail,hint,Date.now()-start);
  }
}
async function probeGoogleOAuth():Promise<string> {
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:process.env.PLAY_GAMES_SERVER_CLIENT_ID!,client_secret:process.env.PLAY_GAMES_SERVER_CLIENT_SECRET!,code:'brickbreaker-diagnostic-invalid-code',grant_type:'authorization_code',redirect_uri:''}),
    cache:'no-store',signal:AbortSignal.timeout(8000),
  });
  const body=await response.json().catch(()=>({})) as {error?:string};
  if(response.status===400 && body.error==='invalid_grant')
    return 'Google قبل بيانات العميل ورفض رمز الاختبار غير الصالح كما هو متوقع.';
  if(body.error==='invalid_client') throw Object.assign(new Error('Client rejected'),{code:'invalid_client'});
  throw Object.assign(new Error('Unexpected OAuth response'),{code:'oauth_unexpected_response'});
}
export async function runDailyRewardDiagnostics():Promise<DiagnosticReport> {
  const configs=configuration();
  const [oauth,firebase,store]=await Promise.all([
    configs[0].state==='passed'
      ? timed('play_oauth','تبادل رمز Play Games',probeGoogleOAuth,'oauth_unavailable','تعذر تأكيد قبول Google لعميل Game Server.','راجع العميل والسر واتصال Vercel بخدمة Google OAuth.')
      : Promise.resolve(checked('play_oauth','تبادل رمز Play Games','failed','blocked_by_configuration','فحص Google متوقف لأن إعداد Play Games غير صحيح.','أصلح إعداد Play Games أولاً.')),
    configs[1].state==='passed'
      ? timed('firebase_auth','صلاحية Firebase Auth',async()=>{await gameFirebaseAuth().listUsers(1);return `Firebase Auth في ${EXPECTED_FIREBASE_PROJECT} استجاب لطلب قراءة محدود.`;},'firebase_unavailable','تعذر الوصول إلى Firebase Auth بحساب خدمة اللعبة.','راجع صلاحية firebaseauth.viewer وحساب الخدمة واتصال Vercel.')
      : Promise.resolve(checked('firebase_auth','صلاحية Firebase Auth','failed','blocked_by_configuration','فحص Firebase متوقف لأن حساب الخدمة غير مضبوط.','أصلح إعداد Firebase أولاً.')),
    configs[2].state==='passed'
      ? timed('daily_store','قاعدة الديلي ريوورد',async()=>{await probeDailyRewardDatabase();return 'قاعدة البيانات المستخدمة فعلياً في مطالبة الديلي ريوورد ردّت على ping.';},'mongo_unavailable','تعذر اتصال خدمة الديلي ريوورد بقاعدة MongoDB.','راجع MONGODB_URI وصلاحيات الشبكة واسم قاعدة البيانات.')
      : Promise.resolve(checked('daily_store','قاعدة الديلي ريوورد','failed','blocked_by_configuration','فحص قاعدة البيانات متوقف لأن إعداد MongoDB ناقص.','أصلح إعداد MongoDB أولاً.')),
  ]);
  const runId=randomUUID();
  const report={checkedAt:new Date().toISOString(),scope:'server_live_checks',runId,checks:[...configs,oauth,firebase,store,pendingChecks()[3]]};
  console.info('daily_reward_diagnostic',JSON.stringify({runId,checks:report.checks.map(c=>({id:c.id,state:c.state,code:c.code}))}));
  return report;
}
