import {NextRequest} from "next/server";
import {controlAuthorized,controlOriginMatches,noCache} from "../../../../src/lib/mcp-auth";
import {checkService,serviceIds} from "../../../../src/lib/mcp-control";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=30;
export async function POST(request:NextRequest){
 if(!controlAuthorized(request))return Response.json({error:"Unauthorized"},{status:401,headers:noCache});
 if(!controlOriginMatches(request))return Response.json({error:"Invalid origin"},{status:403,headers:noCache});
 try{const raw=await request.text();if(raw.length>1000)throw Error("Too large");const body=JSON.parse(raw);if(!serviceIds.includes(body.service))return Response.json({error:"Invalid service"},{status:400,headers:noCache});return Response.json({ok:true,result:await checkService(body.service)},{headers:noCache});}
 catch{return Response.json({error:"Invalid request"},{status:400,headers:noCache});}
}
