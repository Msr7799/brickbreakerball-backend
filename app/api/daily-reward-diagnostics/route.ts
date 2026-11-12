import {NextRequest} from 'next/server';
import {controlAuthorized,controlOriginMatches,noCache} from '../../../src/lib/mcp-auth';
import {configurationReport,runDailyRewardDiagnostics} from '../../../src/lib/daily-reward-diagnostics';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;

export function GET(request:NextRequest):Response {
  if(!controlAuthorized(request))return Response.json({error:'Unauthorized'},{status:401,headers:noCache});
  return Response.json(configurationReport(),{headers:noCache});
}

export async function POST(request:NextRequest):Promise<Response> {
  if(!controlAuthorized(request))return Response.json({error:'Unauthorized'},{status:401,headers:noCache});
  if(!controlOriginMatches(request))return Response.json({error:'Invalid origin'},{status:403,headers:noCache});
  try {return Response.json(await runDailyRewardDiagnostics(),{headers:noCache});}
  catch {
    return Response.json({error:'Diagnostic service unavailable'},{status:503,headers:noCache});
  }
}
