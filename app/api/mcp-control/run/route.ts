import {NextRequest} from "next/server";
import {controlAuthorized,controlOriginMatches,noCache} from "../../../../src/lib/mcp-auth";
import {runReadTool,humanError} from "../../../../src/lib/mcp-control";
import {getAssistantSettings,allowedTool} from "../../../../src/lib/assistant-settings";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function POST(request:NextRequest){
 if(!controlAuthorized(request))return Response.json({error:"Unauthorized"},{status:401,headers:noCache});
 if(!controlOriginMatches(request))return Response.json({error:"Invalid origin"},{status:403,headers:noCache});
 try{const raw=await request.text();if(raw.length>5000)return Response.json({error:"Request too large"},{status:413,headers:noCache});const data=JSON.parse(raw);if(typeof data.tool!=="string")throw Error("Invalid tool");
  const settings=await getAssistantSettings();if(!allowedTool(data.tool,settings))throw Error("MCP tool is disabled in ForgePulse controls");
  const result=await runReadTool(data.tool,data.args||{});const txt=JSON.stringify(result);return Response.json({ok:true,result:txt.length>30000?JSON.parse(JSON.stringify({truncated:true,preview:txt.slice(0,25000)})):result},{headers:noCache});
 }catch(e){return Response.json({ok:false,error:humanError(e)},{status:400,headers:noCache});}
}
