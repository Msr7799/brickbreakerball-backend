/** Pure parsers for third-party analytics. Missing data stays missing, never becomes fabricated zero. */
type UnknownRecord=Record<string,unknown>;
const record=(value:unknown):UnknownRecord=>value&&typeof value==="object"&&!Array.isArray(value)?value as UnknownRecord:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const str=(value:unknown)=>typeof value==="string"?value:"";
const number=(value:unknown):number|null=>{
 if(typeof value!=="string"&&typeof value!=="number")return null;
 if(value==="")return null;
 const parsed=Number(value);
 return Number.isFinite(parsed)?parsed:null;
};
export function dateFromCompact(value:string):string|null{
 if(!/^\d{8}$/.test(value))return null;
 const date=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6)}`;
 const parsed=new Date(date+"T00:00:00Z");
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
}
export function ga4Rows(report:unknown):Array<{label:string;values:Record<string,number>}>{
 const data=record(report);
 const metrics=list(data.metricHeaders).map(x=>str(record(x).name));
 return list(data.rows).map(row=>{
  const item=record(row),label=str(record(list(item.dimensionValues)[0]).value);
  const values:Record<string,number>={};
  list(item.metricValues).forEach((v,i)=>{const n=number(record(v).value);if(metrics[i]&&n!==null)values[metrics[i]]=n;});
  return {label,values};
 });
}
export function crashSummary(report:unknown){
 const group=record(list(record(report).groups)[0]);
 const metrics=record(list(group.metrics)[0]);
 if(!Object.keys(metrics).length)return null;
 return {
  events:number(metrics.eventsCount),impactedUsers:number(metrics.impactedUsersCount),
  sessions:number(metrics.sessionsCount),impactedSessions:number(metrics.impactedSessionsCount),
  totalUsers:number(metrics.totalUsersCount),totalSessions:number(metrics.totalSessionsCount),
  crashFreeUsers:number(metrics.crashFreeUsersPercentage),crashFreeSessions:number(metrics.crashFreeSessionsPercentage)
 };
}
export function crashIssues(report:unknown){
 return list(record(report).groups).map(group=>{
  const entry=record(group),issue=record(entry.issue),metrics=record(list(entry.metrics)[0]);
  const url=str(issue.uri);
  return {
   id:str(issue.id),title:str(issue.title),subtitle:str(issue.subtitle),type:str(issue.errorType),state:str(issue.state),
   firstVersion:str(issue.firstSeenVersion),lastVersion:str(issue.lastSeenVersion),
   events:number(metrics.eventsCount),users:number(metrics.impactedUsersCount),
   url:url.startsWith("https://console.firebase.google.com/")?url:null
  };
 }).filter(x=>x.id&&x.title);
}
export function admobReport(value:unknown){
 const items=list(value),header=record(items.find(x=>record(x).header));
 const currency=str(record(record(header.header).localizationSettings).currencyCode)||null;
 const rows=items.flatMap(entry=>{
  const row=record(record(entry).row);
  if(!Object.keys(row).length)return [];
  const date=dateFromCompact(str(record(record(row.dimensionValues).DATE).value));
  if(!date)return [];
  const metrics=record(row.metricValues);
  const earning=number(record(metrics.ESTIMATED_EARNINGS).microsValue);
  return [{date,earnings:earning===null?null:earning/1e6,impressions:number(record(metrics.IMPRESSIONS).integerValue),clicks:number(record(metrics.CLICKS).integerValue)}];
 });
 return {currency,rows};
}
export function adsenseReport(value:unknown){
 const report=record(value);
 const headers=list(report.headers).map(x=>str(record(x).name));
 const rows=list(report.rows).flatMap(row=>{
  const values=list(record(row).cells).map(x=>str(record(x).value));
  const cells=Object.fromEntries(headers.map((header,index)=>[header,values[index]||""]));
  const date=cells.DATE;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  return [{date,earnings:number(cells.ESTIMATED_EARNINGS),impressions:number(cells.IMPRESSIONS),clicks:number(cells.CLICKS)}];
 });
 return {currency:str(record(report.metadata).currencyCode)||null,rows};
}
