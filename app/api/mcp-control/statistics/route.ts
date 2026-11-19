import {NextRequest} from "next/server";
import {controlAuthorized,noCache} from "../../../../src/lib/mcp-auth";
import {operationsStatistics} from "../../../../src/lib/operations-statistics";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;

export async function GET(request:NextRequest){
 if(!controlAuthorized(request))return Response.json({error:"Unauthorized"},{status:401,headers:noCache});
 const raw=new URL(request.url).searchParams.get("days")||"7";
 if(!["7","30","90"].includes(raw))return Response.json({error:"Choose 7, 30 or 90 days"},{status:400,headers:noCache});
 try{return Response.json(await operationsStatistics(Number(raw) as 7|30|90),{headers:noCache});}
 catch{return Response.json({error:"Statistics are temporarily unavailable"},{status:503,headers:noCache});}
}
