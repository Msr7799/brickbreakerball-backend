"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import "./statistics.css";

type State="ready"|"empty"|"error";
type Source<T>={status:State;error?:string;updatedAt?:string}&Partial<T>;
type Metric={activeUsers:number|null;newUsers:number|null;sessions:number|null;events:number|null};
type Daily={date:string;activeUsers:number;newUsers:number;sessions:number;events:number};
type CrashSummary={events:number|null;impactedUsers:number|null;sessions:number|null;totalUsers:number|null;totalSessions:number|null;crashFreeUsers:number|null;crashFreeSessions:number|null};
type MoneyRow={date:string;earnings:number|null;impressions:number|null;clicks:number|null};
type Money={account:string;periodDays:number;currency:string|null;totals:{earnings:number;impressions:number;clicks:number}|null;daily:MoneyRow[];apps?:{name:string;approval:string}[];sites?:{url:string;state:string}[]};
type Grouped={name:string;count:number;errors?:number};
type Stats={
 generatedAt:string;range:{days:number;startDate:string;endDate:string;timezone:string};
 catalog:{total:number;read:number;write:number;services:{id:string;name:string;total:number;writes:number;configured:boolean;latest:{status:string;at:string|null;detail:string}|null}[];tools:{id:string;title:string;service:string;mode:"read"|"write";uses:number|null;errors:number|null}[]};
 ga4:Source<{totals:Metric;daily:Daily[];topEvents:{name:string;count:number;users:number}[];versions:{name:string;users:number;events:number}[];androidOnly:boolean;propertyId:string;timezone:string}>;
 crashes:Source<{summary:CrashSummary|null;issues:{id:string;title:string;subtitle:string;type:string;state:string;firstVersion:string;lastVersion:string;events:number|null;users:number|null;url:string|null}[];versions:{name:string;events:number|null;users:number|null}[]}>;
 admob:Source<Money>;adsense:Source<Money>;
 operations:Source<{total:number;success:number;errors:number;daily:{date:string;total:number;success:number;errors:number}[];tools:Grouped[];services:Grouped[]}>;
 purchases:Source<{total:number;daily:{date:string;count:number}[];types:Grouped[];statuses:Grouped[]}>;
};

const int=(value:number|null|undefined)=>value===null||value===undefined?"—":new Intl.NumberFormat("en-US").format(value);
const pct=(value:number|null|undefined)=>value===null||value===undefined?"—":`${value.toFixed(2)}%`;
const money=(value:number|null|undefined,currency:string|null|undefined)=>value===null||value===undefined?"—":`${new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:3}).format(value)} ${currency||""}`;
const date=(value:string)=>new Intl.DateTimeFormat("ar-BH",{day:"numeric",month:"short"}).format(new Date(value+"T12:00:00Z"));
const fullDate=(value:string)=>new Intl.DateTimeFormat("ar-BH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bahrain"}).format(new Date(value));
const failure=(source:{status:State;error?:string}|undefined)=>source?.status==="error";

function SourceBadge({name,state}:{name:string;state:State|"pending"}){
 return <span className={`st-source-badge st-${state}`}><i/>{name}<small>{state==="ready"?"متصل":state==="empty"?"بلا سجلات":state==="error"?"تعذر الجلب":"ينتظر"}</small></span>;
}
function Kpi({label,value,detail,tone="normal"}:{label:string;value:string;detail:string;tone?:"normal"|"green"|"red"|"gold"}){
 return <article className={`st-kpi st-kpi-${tone}`}><div className="st-kpi-label">{label}<span aria-hidden="true">↗</span></div><div className="st-kpi-value" dir="ltr">{value}</div><p>{detail}</p></article>;
}
function Chart({title,subtitle,data,first,second,firstName,secondName,firstColor="lime",secondColor="teal"}:{title:string;subtitle:string;data:Record<string,number|string|null>[];first:string;second?:string;firstName:string;secondName?:string;firstColor?:string;secondColor?:string}){
 const largest=Math.max(1,...data.map(x=>Math.max(Number(x[first]||0),second?Number(x[second]||0):0)));
 return <div className="st-chart-card"><div className="st-panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div><div className="st-chart-legend"><span><i className={`st-color-${firstColor}`}/>{firstName}</span>{second&&<span><i className={`st-color-${secondColor}`}/>{secondName}</span>}</div></div>
  {data.length?<div className="st-chart-scroll"><div className="st-chart-grid" style={{minWidth:`${Math.max(530,data.length*24)}px`}}>
   <div className="st-chart-axis"><span>{int(largest)}</span><span>{int(Math.round(largest/2))}</span><span>0</span></div>
   <div className="st-chart-columns">{data.map((item,i)=><div key={`${item.date}-${i}`} className="st-chart-day" title={`${item.date}: ${firstName} ${int(Number(item[first]||0))}${second?` · ${secondName} ${int(Number(item[second]||0))}`:""}`}>
    <div className="st-chart-bars"><span className={`st-color-${firstColor}`} style={{height:`${Math.max(0,Number(item[first]||0)/largest*100)}%`}}/>{second&&<span className={`st-color-${secondColor}`} style={{height:`${Math.max(0,Number(item[second]||0)/largest*100)}%`}}/>}</div>
    <small>{i===0||i===data.length-1||i%Math.ceil(data.length/8)===0?date(String(item.date)):""}</small>
   </div>)}</div>
  </div></div>:<div className="st-empty">ما وصلت سجلات للفترة المختارة.</div>}
 </div>;
}
function Ranked({title,subtitle,items,valueKey="count",unit=""}:{title:string;subtitle:string;items:Record<string,string|number>[];valueKey?:string;unit?:string}){
 const max=Math.max(1,...items.map(x=>Number(x[valueKey]||0)));
 return <article className="st-panel"><div className="st-panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div></div>
  {items.length?<div className="st-ranked">{items.slice(0,12).map((item,i)=><div className="st-rank" key={String(item.name)+i}><div className="st-rank-heading"><span dir="auto">{String(item.name)}</span><strong>{int(Number(item[valueKey]||0))} {unit}</strong></div><div className="st-rank-track"><span style={{width:`${Number(item[valueKey]||0)/max*100}%`}}/></div></div>)}</div>:<div className="st-empty">ما فيه تفاصيل لهالفترة.</div>}
 </article>;
}
function SourceError({label,source}:{label:string;source:{status:State;error?:string}|undefined}){
 if(!source||source.status==="ready")return null;
 return <div className={`st-source-note ${source.status==="error"?"st-warn":""}`}><b>{label}:</b> {source.status==="empty"?"الاتصال نجح لكن التقرير ما رجّع سجلات للفترة.":source.error||"الخدمة غير متاحة مؤقتاً"}</div>;
}
function Finance({title,source,label}:{title:string;source:Source<Money>;label:string}){
 const total=source.totals,rows=source.daily||[];
 return <article className="st-panel st-finance"><div className="st-panel-title"><div><h3>{title}</h3><p>{label} · بيانات حساب الناشر، إذا وافقت Google على جلبها</p></div><SourceBadge name={title} state={source.status}/></div>
  <div className="st-finance-kpis"><div><span>الأرباح التقديرية</span><b>{money(total?.earnings,source.currency)}</b></div><div><span>مرات الظهور</span><b>{int(total?.impressions)}</b></div><div><span>النقرات</span><b>{int(total?.clicks)}</b></div></div>
  {rows.length?<Chart title="التوزيع اليومي" subtitle={`آخر ${source.periodDays||"—"} يوم · ${source.currency||"العملة غير محددة"}`} data={rows} first="impressions" firstName="ظهور الإعلان" firstColor="gold"/>:<SourceError label={title} source={source}/>}
  {source.apps?.length?<div className="st-status-list"><h4>حالة تطبيقات AdMob</h4>{source.apps.map((a,i)=><div key={i}><span>{a.name}</span><b className={a.approval==="READY"?"st-positive":"st-attention"}>{a.approval}</b></div>)}</div>:null}
  {source.sites?.length?<div className="st-status-list"><h4>مواقع AdSense</h4>{source.sites.map((a,i)=><div key={i}><span>{a.url}</span><b>{a.state}</b></div>)}</div>:null}
 </article>;
}
export default function StatisticsPage(){
 const [days,setDays]=useState<7|30|90>(7),[stats,setStats]=useState<Stats|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[unauthorized,setUnauthorized]=useState(false);
 const [toolSearch,setToolSearch]=useState(""),[toolMode,setToolMode]=useState("all");
 const load=useCallback(async(period:7|30|90)=>{
  setLoading(true);setError("");
  try{
   const response=await fetch(`/api/mcp-control/statistics?days=${period}`,{cache:"no-store",credentials:"same-origin"});
   if(response.status===401){setUnauthorized(true);setStats(null);return;}
   if(!response.ok)throw Error(`تعذّر تحميل الإحصائيات (HTTP ${response.status})`);
   setStats(await response.json() as Stats);setUnauthorized(false);
  }catch(e){setError(e instanceof Error?e.message:"تعذر جلب البيانات");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load(days);},[days,load]);
 const eventRows=useMemo(()=>stats?.ga4.topEvents?.map(x=>({name:x.name,count:x.count}))||[],[stats]);
 const versionRows=useMemo(()=>stats?.ga4.versions?.map(x=>({name:x.name,count:x.users}))||[],[stats]);
 const filteredTools=useMemo(()=>stats?.catalog.tools.filter(x=>(toolMode==="all"||x.mode===toolMode)&&`${x.title} ${x.id} ${x.service}`.toLowerCase().includes(toolSearch.toLowerCase()))||[],[stats,toolMode,toolSearch]);
 if(unauthorized)return <main className="st-gate" dir="rtl"><div><span className="st-logo">✦</span><h1>لوحة الإحصائيات خاصة بالأدمن</h1><p>سجّل دخولك من لوحة ForgePulse، وبعدين افتح الإحصائيات مرة ثانية.</p><a href="/mcp-dashboard">دخول الإدارة ←</a></div></main>;
 const ga4=stats?.ga4,crash=stats?.crashes,operations=stats?.operations,purchases=stats?.purchases;
 return <div className="st-shell" dir="rtl"><div className="st-container">
  <header className="st-header"><div className="st-identity"><span className="st-logo">✦</span><div><strong>ForgePulse <em>Intelligence</em></strong><small>BRICK BREAKER BALL / ADMIN CONTROL</small></div></div><nav><a href="/mcp-dashboard">لوحة التحكم</a><a href="/mcp-dashboard/chat">المساعد</a><a className="st-nav-active" href="/mcp-dashboard/statistics">الإحصائيات</a></nav><span className="st-admin-tag">● PRIVATE ADMIN</span></header>
  <section className="st-intro"><div><span className="st-overline">ANALYTICS COMMAND CENTER · LIVE SOURCES</span><h1>الصورة الكاملة<br/><span>لأداء لعبتك.</span></h1><p>اللاعبون، الزيارات داخل اللعبة، إصدارات التطبيق، الأعطال، الإعلانات، المشتريات، وأداء أدوات MCP — بتواريخ فعلية ومن مصادرها الأصلية.</p></div><div className="st-controls"><div className="st-periods" role="group" aria-label="فترة التقرير">{([7,30,90] as const).map(period=><button className={days===period?"active":""} key={period} onClick={()=>setDays(period)} aria-pressed={days===period}>{period} أيام</button>)}</div><button className="st-refresh" disabled={loading} onClick={()=>void load(days)}>{loading?"جارٍ الجلب…":"↻ تحديث البيانات"}</button><small>{stats?`آخر تحديث: ${fullDate(stats.generatedAt)}`:"جاري الاتصال بمصادر البيانات"}</small></div></section>
  {error&&<div className="st-error" role="alert">{error}<button onClick={()=>void load(days)}>إعادة المحاولة</button></div>}
  {loading&&!stats&&<div className="st-loader"><span/><p>نجمع البيانات من GA4 وCrashlytics وGoogle وMongoDB…</p></div>}
  {stats&&<>
   <div className="st-live-bar"><div><span className="st-live-dot"/> تقرير من {stats.range.startDate} إلى {stats.range.endDate} <span>· توقيت البحرين</span></div><div>55 أداة MCP مسجلة <strong>{stats.catalog.read} قراءة / {stats.catalog.write} تعديل</strong></div></div>
   <section className="st-kpi-grid"><Kpi label="المستخدمون النشطون" value={int(ga4?.totals?.activeUsers)} detail="أفراد فريدون بالفترة — GA4" tone="green"/><Kpi label="جلسات اللعبة" value={int(ga4?.totals?.sessions)} detail="عدد الجلسات — وليس زيارات الموقع"/><Kpi label="المستخدمون الجدد" value={int(ga4?.totals?.newUsers)} detail="أول نشاط حسب Firebase" tone="gold"/><Kpi label="نسبة المستخدمين بلا أعطال" value={pct(crash?.summary?.crashFreeUsers)} detail="Crashlytics / مستخدمون" tone="green"/><Kpi label="وقوعات الأعطال" value={int(crash?.summary?.events)} detail="Fatal + Non-fatal + ANR حسب التقرير" tone="red"/><Kpi label="أحداث اللعبة" value={int(ga4?.totals?.events)} detail="جميع الأحداث المسجلة في GA4"/></section>
   <section className="st-section"><div className="st-section-title"><div><span>01 / AUDIENCE</span><h2>حركة اللاعبين والتفاعل</h2><p>بيانات Firebase Analytics الخاصة بنسخة Android فقط.</p></div><SourceBadge name="Google Analytics 4" state={ga4?.status||"pending"}/></div><SourceError label="GA4" source={ga4}/>
    <div className="st-two"><Chart title="نشاط اللاعبين يومًا بيوم" subtitle="مقارنة الجلسات بالمستخدمين النشطين، العمود يمثل اليوم" data={ga4?.daily||[]} first="sessions" second="activeUsers" firstName="الجلسات" secondName="المستخدمون"/><Chart title="التفاعل داخل اللعبة" subtitle="عدد الأحداث والمستخدمين الجدد على مدار الفترة" data={ga4?.daily||[]} first="events" second="newUsers" firstName="الأحداث" secondName="الجدد" firstColor="gold" secondColor="teal"/></div>
    <div className="st-two"><Ranked title="أكثر أحداث اللعبة" subtitle="screen_view · session_start · app_exception وغيرها" items={eventRows}/><Ranked title="انتشار إصدارات اللعبة" subtitle="عدد المستخدمين الفريدين بحسب إصدار Android" items={versionRows}/></div>
   </section>
   <section className="st-section"><div className="st-section-title"><div><span>02 / RELIABILITY</span><h2>الأعطال واستقرار اللعبة</h2><p>بلاغات Crashlytics الحقيقية، مع الإصدار والتأثير ورابط التفاصيل.</p></div><SourceBadge name="Firebase Crashlytics" state={crash?.status||"pending"}/></div><SourceError label="Crashlytics" source={crash}/>
    <div className="st-crash-highlights"><div><small>مستخدمون متأثرون</small><b>{int(crash?.summary?.impactedUsers)}</b></div><div><small>جلسات بلا أعطال</small><b>{pct(crash?.summary?.crashFreeSessions)}</b></div><div><small>إجمالي جلسات Crashlytics</small><b>{int(crash?.summary?.totalSessions)}</b></div><div><small>بلاغات الأعطال المعروضة</small><b>{int(crash?.issues?.length)}</b></div></div>
    <article className="st-panel st-issues"><div className="st-panel-title"><div><h3>أكثر الأعطال تأثيرًا</h3><p>رتّبها Crashlytics حسب عدد مرات الوقوع</p></div><span className="st-tip">اضغط لفتح البلاغ في Firebase</span></div>
     {crash?.issues?.length?<div className="st-issues-table"><div className="st-issue-head"><span>العطل</span><span>الإصدار</span><span>الوقوعات</span><span>المتأثرون</span><span>الحالة</span></div>{crash.issues.map(issue=><div className="st-issue-row" key={issue.id}><div><b>{issue.url?<a href={issue.url} target="_blank" rel="noopener noreferrer">{issue.title} ↗</a>:issue.title}</b><small>{issue.subtitle}</small></div><span>{issue.lastVersion||issue.firstVersion||"—"}</span><strong>{int(issue.events)}</strong><strong>{int(issue.users)}</strong><span className={`st-issue-state ${issue.type==="FATAL"?"st-fatal":""}`}>{issue.type} · {issue.state}</span></div>)}</div>:<div className="st-empty">لا توجد أعطال مُدرجة في التقرير لهذه الفترة.</div>}
    </article>
   </section>
   <section className="st-section"><div className="st-section-title"><div><span>03 / MONETIZATION</span><h2>الإعلانات والعائدات</h2><p>لا نخلط عملات AdMob وAdSense، ولا نفترض أرباحًا إذا رجعت التقارير فارغة.</p></div></div><div className="st-two"><Finance title="AdMob" source={stats.admob} label="إعلانات تطبيق Android"/><Finance title="AdSense" source={stats.adsense} label="إعلانات مواقع الويب"/></div>
   </section>
   <section className="st-section"><div className="st-section-title"><div><span>04 / BACKEND</span><h2>المشتريات وعمليات الخادم</h2><p>سجل إشعارات Google Play وأداء عمليات MCP المخزّن في MongoDB.</p></div><SourceBadge name="MongoDB" state={operations?.status||"pending"}/></div><SourceError label="عمليات MCP" source={operations}/><SourceError label="إشعارات الشراء" source={purchases}/>
    <div className="st-backend-kpis"><div><small>جميع عمليات MCP</small><b>{int(operations?.total)}</b></div><div><small>عمليات ناجحة</small><b>{int(operations?.success)}</b></div><div><small>عمليات فاشلة</small><b>{int(operations?.errors)}</b></div><div><small>إشعارات مشتريات</small><b>{int(purchases?.total)}</b></div></div>
    <div className="st-two"><Chart title="طلبات MCP حسب اليوم" subtitle="الناجحة والفاشلة من سجل التدقيق" data={operations?.daily||[]} first="success" second="errors" firstName="ناجحة" secondName="فاشلة" firstColor="lime" secondColor="coral"/><Chart title="إشعارات الشراء اليومية" subtitle="إشعارات مستلمة، ولا تمثل بالضرورة مبيعات مدفوعة" data={purchases?.daily||[]} first="count" firstName="الإشعارات" firstColor="teal"/></div>
    <div className="st-two"><Ranked title="أكثر أدوات MCP استخدامًا" subtitle="تشمل القراءات والتشخيص والتعديلات المسجلة" items={operations?.tools||[]}/><Ranked title="أنواع إشعارات الشراء" subtitle="منتج · اشتراك · إلغاء · اختبار" items={purchases?.types||[]}/></div>
   </section>
   <section className="st-section"><div className="st-section-title"><div><span>05 / CONNECTIVITY</span><h2>تغطية الأدوات والخدمات</h2><p>عدد أدوات كل خدمة وحالة آخر فحص محفوظ؛ وجود الصلاحيات لا يضمن أن Google تسمح بكل API.</p></div><span className="st-tool-total">{stats.catalog.total} أداة / {stats.catalog.services.length} خدمات</span></div><div className="st-service-grid">{stats.catalog.services.map(service=><article key={service.id} className="st-service-card"><div><strong>{service.name}</strong><span className={`st-mini-state ${service.latest?.status||"pending"}`}>{service.latest?.status==="connected"?"متصل":service.latest?.status==="error"?"فشل آخر فحص":!service.configured?"يحتاج إعداد":"لم يُفحص حديثًا"}</span></div><p><b>{service.total}</b> أداة <small>· {service.writes} تعديل</small></p><small>{service.latest?.detail||"ما فيه فحص محفوظ"}</small></article>)}</div>
    <article className="st-panel st-catalog"><div className="st-panel-title"><div><h3>سجل الأدوات الـ55 بالتفصيل</h3><p>استعمال كل أداة وأخطاؤها خلال {days} أيام، حسب سجل MongoDB. بعض الأدوات قد لا تكون شُغّلت من قبل.</p></div></div><div className="st-catalog-filters"><input aria-label="ابحث عن أداة" placeholder="ابحث باسم أداة أو خدمة…" value={toolSearch} onChange={e=>setToolSearch(e.target.value)}/><select aria-label="نوع الأداة" value={toolMode} onChange={e=>setToolMode(e.target.value)}><option value="all">كل الأدوات</option><option value="read">قراءة</option><option value="write">تعديل</option></select><span>{filteredTools.length} / {stats.catalog.total}</span></div><div className="st-catalog-scroll"><div className="st-catalog-table"><div className="st-catalog-head"><span>الأداة</span><span>الخدمة</span><span>النوع</span><span>الاستعمال</span><span>الأخطاء</span></div>{filteredTools.map(t=><div className="st-catalog-row" key={t.id}><div><strong>{t.title}</strong><small>{t.id}</small></div><span>{t.service}</span><span className={t.mode==="write"?"st-catalog-write":"st-catalog-read"}>{t.mode==="write"?"تعديل":"قراءة"}</span><b>{int(t.uses)}</b><b>{int(t.errors)}</b></div>)}</div></div></article>
   </section>
   <aside className="st-disclaimer"><strong>ملاحظات دقة البيانات</strong><p>GA4 هني يحسب نشاط مستخدمي لعبة Android، مو زيارات موقع Vercel. عشان نقيس زيارات الموقع نفسه نحتاج Web Analytics مفعّل له. الأرقام من كل خدمة لها تعريف ونطاق مختلف: لا تجمع مستخدمي GA4 يومياً للحصول على عدد فريد، ولا تعتبر إشعارات المشتريات إيرادات. إحصائيات Crashlytics تشمل نطاق أنواع الأخطاء اللي ترجعها Google، والبيانات الحديثة قد تتأخر في الظهور.</p></aside>
   <footer className="st-footer"><span>ForgePulse Intelligence · Private Analytics</span><span>Read-only reporting · No sample values · {fullDate(stats.generatedAt)}</span></footer>
  </>}
 </div></div>;
}
