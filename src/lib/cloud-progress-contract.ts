/** Versioned, lossless preferences checkpoint; never a currency grant API. */
export const MAX_PROGRESS_BYTES = 1024 * 1024;
export const PROGRESS_SECTIONS = ['progress','wallet','items','transactions','cosmetics','guide','pendingRewards','controls'] as const;
export type ProgressEntry = {key:string;type:'s'|'b'|'i'|'l'|'f';value:string};
export type ProgressSnapshot = {schema:1;sections:{name:string;entries:ProgressEntry[]}[]};
export type ProgressCommand = {baseRevision:number;saveId:string;snapshot:ProgressSnapshot};
export class InvalidProgress extends Error {}

export function parseProgressCommand(value:unknown):ProgressCommand {
  const fail=():never=>{throw new InvalidProgress('Invalid progress checkpoint');};
  if(!value || typeof value!=='object') return fail();
  const body=value as Record<string,unknown>;
  if(Object.keys(body).some(k=>!['baseRevision','saveId','snapshot'].includes(k))) return fail();
  if(!Number.isSafeInteger(body.baseRevision) || (body.baseRevision as number)<0 || (body.baseRevision as number)>=Number.MAX_SAFE_INTEGER) return fail();
  if(typeof body.saveId!=='string' || !/^[a-f0-9]{32}$/.test(body.saveId)) return fail();
  const snap=body.snapshot as ProgressSnapshot;
  if(!snap || snap.schema!==1 || Object.keys(snap).some(k=>!['schema','sections'].includes(k)) || !Array.isArray(snap.sections) || snap.sections.length<PROGRESS_SECTIONS.length-1 || snap.sections.length>PROGRESS_SECTIONS.length) return fail();
  const names=new Set<string>(); let total=0;
  for(const section of snap.sections){
    if(!section || typeof section!=='object' || Object.keys(section).some(k=>!['name','entries'].includes(k)) || !PROGRESS_SECTIONS.includes(section.name as typeof PROGRESS_SECTIONS[number]) || names.has(section.name) || !Array.isArray(section.entries)) return fail();
    names.add(section.name); const keys=new Set<string>();
    for(const entry of section.entries){
      if(++total>12000 || !entry || typeof entry!=='object' || Object.keys(entry).some(k=>!['key','type','value'].includes(k)) || typeof entry.key!=='string' || entry.key.length<1 || entry.key.length>1024 || /[\u0000-\u001f]/.test(entry.key) || keys.has(entry.key) || typeof entry.value!=='string' || entry.value.length>262144) return fail();
      keys.add(entry.key);
      switch(entry.type){
        case 's':break;
        case 'b':if(!['true','false'].includes(entry.value)) return fail();break;
        case 'i':case 'l':{
          if(!/^-?\d{1,19}$/.test(entry.value)) return fail();
          const n=BigInt(entry.value),min=entry.type==='i'?-2147483648n:-9223372036854775808n,max=entry.type==='i'?2147483647n:9223372036854775807n;
          if(n<min || n>max) return fail();break;
        }
        case 'f':if(!entry.value.trim() || !Number.isFinite(Number(entry.value)) || Math.abs(Number(entry.value))>3.4028235e38) return fail();break;
        default:return fail();
      }
    }
  }
  if(PROGRESS_SECTIONS.some(name=>name!=='controls' && !names.has(name))) return fail();
  if(Buffer.byteLength(JSON.stringify(body))>MAX_PROGRESS_BYTES) return fail();
  return body as ProgressCommand;
}
