import {NextRequest} from "next/server";
import {controlAuthorized,noCache} from "../../../../src/lib/mcp-auth";
import {dashboardOverview} from "../../../../src/lib/mcp-control";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 if(!controlAuthorized(request))return Response.json({error:"Unauthorized"},{status:401,headers:noCache});
 try{return Response.json(await dashboardOverview(),{headers:noCache});}
 catch{return Response.json({error:"Database unavailable"},{status:503,headers:noCache});}
}
