import {createHash,timingSafeEqual} from "node:crypto";

/** Constant-time comparison of fixed-size SHA-256 digests. Fails closed on unset config. */
export function tokenMatches(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected || expected.length < 32 || expected.startsWith("REPLACE_")) return false;
  const candidate=createHash("sha256").update(received).digest();
  const reference=createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidate,reference);
}
export function getBearer(request: Request): string | null {
  const header=request.headers.get("authorization");
  if (!header || !/^Bearer\s+\S+$/i.test(header)) return null;
  return header.replace(/^Bearer\s+/i,"");
}
/** Only Firebase subtree paths explicitly enabled by the server operator. */
export function safeDatabasePath(requested:string, allowedPrefix:string):string {
  function canonical(value:string):string {
    if (!value.startsWith("/")) value="/"+value;
    const parts=value.split("/").filter(Boolean);
    if (parts.some(segment => segment === "." || segment === ".." || /[.#$\[\]\u0000-\u001f\u007f]/.test(segment))) {
      throw new Error("Invalid Firebase database path");
    }
    return "/"+parts.join("/");
  }
  const path=canonical(requested);
  const prefix=canonical(allowedPrefix || "/mcp");
  if (prefix !== "/" && path !== prefix && !path.startsWith(prefix+"/")) {
    throw new Error(`Database path is outside allowed prefix ${prefix}`);
  }
  return path;
}
export function assertEnv(name:string):string {
 const value=process.env[name];
 if (!value || value.trim().length===0 || value.startsWith("YOUR_")) throw new Error(`Missing server configuration: ${name}`);
 return value;
}
export function validateDateRange(start:string,end:string,maxDays=93):void {
 const parse=(v:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error("Dates must be YYYY-MM-DD");
  const d=new Date(v+"T00:00:00Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)throw new Error("Invalid calendar date");
  return d.getTime();
 };
 const a=parse(start),b=parse(end);
 if(b<a || (b-a)/86400000>maxDays)throw new Error(`Date range must be positive and <= ${maxDays} days`);
}
export function dateObject(value:string) {const [year,month,day]=value.split("-").map(Number);return {year,month,day};}
export function validateResource(type:"admob"|"adsense",value:string):string {
 const re=type==="admob"?/^accounts\/pub-\d{10,20}$/:/^accounts\/pub-\d{10,20}$/;
 if(!re.test(value))throw new Error(`Account must look like accounts/pub-1234567890123456`);
 return value;
}
