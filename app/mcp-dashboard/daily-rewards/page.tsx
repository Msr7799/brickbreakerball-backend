'use client';
import {useCallback,useEffect,useState} from 'react';
import './diagnostics.css';

type Check={id:string;title:string;state:'passed'|'failed'|'pending';code:string;detail:string;hint:string;latencyMs:number|null};
type Report={checkedAt:string;scope:'configuration_only'|'server_live_checks';runId:string|null;checks:Check[]};
const labels={passed:'ناجح',failed:'يحتاج إصلاح',pending:'لم يثبت بعد'};
const stamp=(value:string)=>new Intl.DateTimeFormat('ar-BH',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
async function request(method:'GET'|'POST'):Promise<Report>{
  const response=await fetch('/api/daily-reward-diagnostics',{method,credentials:'same-origin',cache:'no-store'});
  if(response.status===401)throw Object.assign(new Error('سجّل دخول لوحة الإدارة أولاً.'),{unauthorized:true});
  if(!response.ok)throw new Error(`فشل فحص السيرفر (HTTP ${response.status}). حاول مرة ثانية.`);
  return response.json() as Promise<Report>;
}
export default function DailyRewardDiagnostics(){
  const [report,setReport]=useState<Report|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [unauthorized,setUnauthorized]=useState(false);
  const [copied,setCopied]=useState(false);
  const load=useCallback(async()=>{try{setReport(await request('GET'));setUnauthorized(false);}catch(e){setUnauthorized(!!(e as {unauthorized?:boolean}).unauthorized);setError((e as Error).message);}},[]);
  useEffect(()=>{void load();},[load]);
  async function run(){setBusy(true);setError('');setCopied(false);try{setReport(await request('POST'));}catch(e){setUnauthorized(!!(e as {unauthorized?:boolean}).unauthorized);setError((e as Error).message);}finally{setBusy(false);}}
  async function copy(){if(!report)return;try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));setCopied(true);}catch{setError('تعذر النسخ من المتصفح.');}}
  const live=report?.scope==='server_live_checks';
  const server=report?.checks.filter(c=>c.id!=='player_flow')||[];
  const failed=server.filter(c=>c.state==='failed').length;
  const passed=server.filter(c=>c.state==='passed').length;
  return <main className="dr-shell" dir="rtl">
    <div className="dr-container">
      <header className="dr-top"><a href="/mcp-dashboard">← لوحة ForgePulse</a><span>BRICK BREAKER BALL · SERVER DIAGNOSTICS</span></header>
      <section className="dr-hero"><div><span className="dr-kicker">PLAY GAMES → FIREBASE → DAILY REWARD</span><h1>تشخيص اتصال الديلي ريوورد</h1><p>دليل واضح لكل حلقة في الربط، مع رمز مشكلة وخطوة إصلاح. الفحص يقرأ حالة الخدمات ولا يمنح مكافأة أو يستخدم بيانات لاعب.</p></div><button type="button" onClick={run} disabled={busy||unauthorized}>{busy?'جارٍ فحص Google وFirebase وMongoDB...':'↻ تشغيل فحص الاتصال'}</button></section>
      {error&&<div className="dr-error" role="alert">{error} {unauthorized&&<a href="/mcp-dashboard">تسجيل الدخول ←</a>}</div>}
      <section className="dr-summary" aria-live="polite"><div><small>الحالة</small><strong className={live?(failed?'dr-bad':'dr-good'):'dr-wait'}>{!report?'جارٍ التحميل':!live?'الإعدادات فقط':failed?'يوجد خلل في السيرفر':'فحوصات السيرفر ناجحة'}</strong></div><div><small>نجح / إجمالي فحوصات السيرفر</small><strong>{live?`${passed} / ${server.length}`:'—'}</strong></div><div><small>آخر فحص مباشر</small><strong>{live&&report?stamp(report.checkedAt):'لم يُجرَ بعد'}</strong></div></section>
      {report?.runId&&<p className="dr-run">معرّف الفحص للبحث في سجلات Vercel: <code dir="ltr">{report.runId}</code></p>}
      <p className="dr-scope">{live?'هذه نتيجة استجابات مباشرة من السيرفر في الوقت المعروض. فحص Google يستخدم رمز اختبار غير صالح عمداً؛ رفضه بنوع invalid_grant يثبت قبول بيانات عميل OAuth فقط.':'المعروض حالياً يثبت وجود الإعدادات وتطابق المشاريع فقط. اضغط زر الفحص لتجربة الاتصال الفعلي.'}</p>
      <div className="dr-grid">{report?.checks.map(check=><article key={check.id} className={`dr-card dr-${check.state}`}><div className="dr-card-top"><h2>{check.title}</h2><span>{labels[check.state]}</span></div><p>{check.detail}</p><div className="dr-meta"><code dir="ltr">{check.code}</code>{check.latencyMs!==null&&<small>{check.latencyMs} ms</small>}</div>{check.hint&&<div className="dr-hint"><b>خطوة التشخيص</b><p>{check.hint}</p></div>}</article>)}</div>
      <section className="dr-next"><div><h2>تأكيد العمل من الهاتف</h2><p>حتى لو نجحت كل فحوصات السيرفر، يبقى تسجيل دخول Play Games الحقيقي وتبادل رمز Firebase واستلام مكافأة اليوم غير مثبتة إلى أن تُختبر على نسخة QA. بعد التجربة راقب خطأ التطبيق وطلبات <code dir="ltr">/api/auth/play-games</code> و<code dir="ltr">/api/rewards/daily/status</code> و<code dir="ltr">/api/rewards/daily/claim</code> في سجلات Vercel.</p></div><button type="button" onClick={copy} disabled={!report}>{copied?'تم نسخ تقرير التشخيص':'نسخ تقرير التشخيص'}</button></section>
    </div>
  </main>;
}
