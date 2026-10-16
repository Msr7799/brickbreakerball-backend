/** Adapt existing Vercel Node req/res functions for Next App Router HTTP handlers.
 * Keep billing logic unchanged, including its session cookies and push OIDC validation.
 */
import type {NextRequest} from "next/server";

type LegacyReq={method:string;query:Record<string,string>;headers:Record<string,string>;body?:unknown;socket:{remoteAddress:string}};
type LegacyRes={setHeader:(name:string,value:string)=>LegacyRes;status:(status:number)=>LegacyRes;json:(data:unknown)=>LegacyRes;end:(data?:string)=>LegacyRes};
type LegacyHandler=(req:LegacyReq,res:LegacyRes)=>unknown|Promise<unknown>;
const MAX_BODY_BYTES=130_000;
export function adaptBilling(handler:LegacyHandler) {
 return async function route(request:NextRequest):Promise<Response> {
  const url=new URL(request.url);
  const headers=Object.fromEntries(request.headers.entries());
  // WHATWG Request often omits Host; legacy CSRF protection requires it.
  if (!headers.host) headers.host=url.host;
  // Limit payload before parsing for login, recheck and webhook alike.
  let body:unknown;
  if (!["GET","HEAD"].includes(request.method)) {
   let raw="";
   try { raw=await request.text(); }
   catch {return Response.json({ok:false,error:"Cannot read request body"},{status:400});}
   if (Buffer.byteLength(raw,"utf8")>MAX_BODY_BYTES)
    return Response.json({ok:false,error:"Request body too large"},{status:413});
   try {body=raw?JSON.parse(raw):{};}
   catch {return Response.json({ok:false,error:"Invalid JSON body"},{status:400});}
  }
  const req:LegacyReq={
   method:request.method,
   query:Object.fromEntries(url.searchParams.entries()),
   headers,body,
   socket:{remoteAddress:headers["x-vercel-forwarded-for"]||headers["x-forwarded-for"]||"unknown"}
  };
  let status=200;let content="";
  const responseHeaders=new Headers();
  const res:LegacyRes={
   setHeader(name,value){responseHeaders.set(name,value);return res;},
   status(value){status=value;return res;},
   json(value){content=JSON.stringify(value);if(!responseHeaders.has("content-type"))responseHeaders.set("content-type","application/json; charset=utf-8");return res;},
   end(value){content=value||"";return res;}
  };
  try{await handler(req,res);}
  catch(error){console.error("Billing route failed",error instanceof Error?error.name:"Unknown error");return Response.json({ok:false,error:"Internal server error"},{status:500});}
  responseHeaders.set("Cache-Control","no-store");
  return new Response(content,{status,headers:responseHeaders});
 };
}
