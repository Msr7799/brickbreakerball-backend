import {NextRequest} from "next/server";
import {controlAuthorized,controlOriginMatches,noCache} from "../../../../src/lib/mcp-auth";
import {playEditId,playLanguage,playImageType,playUploadImage} from "../../../../src/lib/play-admin";
import {recordMcpWriteIntent,writeAudit,humanError} from "../../../../src/lib/mcp-control";
import {getAssistantSettings,allowedTool} from "../../../../src/lib/assistant-settings";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

export async function POST(request:NextRequest){
 if(!controlAuthorized(request))return Response.json({error:"Unauthorized"},{status:401,headers:noCache});
 if(!controlOriginMatches(request))return Response.json({error:"Invalid origin"},{status:403,headers:noCache});
 const started=Date.now();
 try{
  if(process.env.MCP_WRITE_ENABLED!=="true")throw new Error("MCP write operations are disabled");
  if(!allowedTool("play_upload_store_image",await getAssistantSettings()))throw new Error("Image upload tool is disabled in ForgePulse");
  const length=Number(request.headers.get("content-length")||0);
  if(length>Math.floor(4.3*1024*1024))throw new Error("Upload exceeds Vercel 4 MB image limit");
  const data=await request.formData();
  if(data.get("confirm")!=="CONFIRM")throw new Error("Explicit CONFIRM required");
  const editId=playEditId.parse(data.get("editId"));
  const language=playLanguage.parse(data.get("language"));
  const imageType=playImageType.parse(data.get("imageType"));
  const file=data.get("image");
  if(!(file instanceof File))throw new Error("Select a PNG or JPEG image file");
  if(file.size>4*1024*1024||file.size<8)throw new Error("Image must be smaller than 4 MB");
  await recordMcpWriteIntent("play_upload_store_image",`edit ${editId} ${language}/${imageType} (${file.size} bytes)`,"dashboard");
  const result=await playUploadImage(editId,language,imageType,Buffer.from(await file.arrayBuffer()),file.type);
  await writeAudit({source:"dashboard",action:"play_upload_store_image",service:"play",success:true,durationMs:Date.now()-started,detail:`Uploaded image in edit ${editId} (${language}/${imageType})`});
  return Response.json({ok:true,result},{headers:noCache});
 }catch(error){
  await writeAudit({source:"dashboard",action:"play_upload_store_image",service:"play",success:false,durationMs:Date.now()-started,detail:humanError(error)});
  return Response.json({ok:false,error:humanError(error)},{status:400,headers:noCache});
 }
}
