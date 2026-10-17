import {NextRequest} from "next/server";
import {controlAuthorized,controlOriginMatches,noCache} from "../../../src/lib/mcp-auth";
import {getAssistantSettings,saveAssistantSettings} from "../../../src/lib/assistant-settings";
import {getConversation,listConversations,deleteConversation,sendChat,probeAssistant,probeMcpToModel,getAssistantStatus} from "../../../src/lib/assistant-chat";
import {toolsMeta} from "../../../src/lib/mcp-control";
import {QuotaWait,quotaLimits} from "../../../src/lib/assistant-quota";

export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
const unauthorized=()=>Response.json({error:"Unauthorized"},{status:401,headers:noCache});
const ready=(name:string)=>!!process.env[name]?.trim()&&!process.env[name]?.startsWith("REPLACE_");
function failed(error:unknown){const status=error instanceof QuotaWait?429:400;const wait=error instanceof QuotaWait&&!error.daily?Math.ceil(error.retryAfterMs/1000):undefined;return Response.json({error:error instanceof Error?error.message:"حدث خطأ غير متوقع",retryAfterSeconds:wait},{status,headers:{...noCache,...(wait?{"Retry-After":String(wait)}:{})}});}
export async function GET(request:NextRequest){
 if(!controlAuthorized(request))return unauthorized();
 try{const id=request.nextUrl.searchParams.get("id");if(id){if(!/^[a-f0-9-]{36}$/.test(id))return failed(new Error("معرّف غير صالح"));const conversation=await getConversation(id);return Response.json({conversation},{headers:noCache});}
  const settings=await getAssistantSettings();return Response.json({settings,conversations:await listConversations(),tools:toolsMeta,status:await getAssistantStatus(),configured:{gemini:ready("GEMINI_API_KEY"),tavily:ready("TAVILY_API_KEY"),mcp:ready("MCP_BEARER_TOKEN")},limits:{lite:quotaLimits("gemini-2.5-flash-lite"),flash:quotaLimits("gemini-2.5-flash")}}, {headers:noCache});
 }catch(e){return failed(e);}
}
export async function PATCH(request:NextRequest){
 if(!controlAuthorized(request))return unauthorized();if(!controlOriginMatches(request))return Response.json({error:"Invalid origin"},{status:403,headers:noCache});
 try{const raw=await request.text();if(raw.length>5000)throw new Error("الطلب كبير جدًا");const body=JSON.parse(raw);return Response.json({settings:await saveAssistantSettings(body)}, {headers:noCache});}catch(e){return failed(e);}
}
export async function DELETE(request:NextRequest){
 if(!controlAuthorized(request))return unauthorized();if(!controlOriginMatches(request))return Response.json({error:"Invalid origin"},{status:403,headers:noCache});
 try{const id=request.nextUrl.searchParams.get("id")||"";if(!/^[a-f0-9-]{36}$/.test(id))throw new Error("معرّف غير صالح");await deleteConversation(id);return Response.json({ok:true},{headers:noCache});}catch(e){return failed(e);}
}
export async function POST(request:NextRequest){
 if(!controlAuthorized(request))return unauthorized();if(!controlOriginMatches(request))return Response.json({error:"Invalid origin"},{status:403,headers:noCache});
 try{
  const length=Number(request.headers.get("content-length")||0);if(length>3.5*1024*1024)return Response.json({error:"حجم الطلب يتجاوز 3.5MB؛ صغّر الملف ثم أعد إرساله."},{status:413,headers:noCache});
  const form=await request.formData();if(form.get("action")==="probe")return Response.json({ok:true,result:await probeAssistant()},{headers:noCache});if(form.get("action")==="probe_mcp")return Response.json({ok:true,result:await probeMcpToModel()},{headers:noCache});
  const files=form.getAll("files").filter((f):f is File=>f instanceof File&&f.size>0);
  if(files.length>3||files.reduce((n,f)=>n+f.size,0)>2.5*1024*1024)throw new Error("يمكن إرفاق 3 ملفات بحد إجمالي 2.5MB.");
  for(const f of files)if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(f.type))throw new Error("الملفات المسموحة: PDF و JPG و PNG و WebP.");
  const message=String(form.get("message")||"");if(message.length>4000)throw new Error("الرسالة طويلة جدًا.");
  const id=String(form.get("id")||"");if(id&&!/^[a-f0-9-]{36}$/.test(id))throw new Error("معرّف المحادثة غير صالح.");
  const result=await sendChat({id:id||undefined,message,files,search:form.get("search")==="true",mcp:form.get("mcp")==="true",toolId:String(form.get("toolId")||"")||undefined});
  return Response.json({ok:true,...result},{headers:noCache});
 }catch(e){return failed(e);}
}
