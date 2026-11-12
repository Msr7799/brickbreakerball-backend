import {NextRequest} from 'next/server';
import {firebaseTokenForPlayGamesCode, InvalidPlayGamesCode} from '../../../../src/lib/play-games-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  if (Number(request.headers.get('content-length') || 0) > 4096)
    return Response.json({ok: false, error: 'invalid_request'}, {status: 413});
  try {
    const body = await request.json() as {authCode?: unknown};
    if (typeof body.authCode !== 'string' || body.authCode.length < 8 || body.authCode.length > 2048)
      return Response.json({ok: false, error: 'invalid_request'}, {status: 400});
    const firebaseCustomToken = await firebaseTokenForPlayGamesCode(body.authCode);
    return Response.json({ok: true, firebaseCustomToken}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ok: false, error: 'invalid_request'}, {status: 400});
    if (error instanceof InvalidPlayGamesCode)
      return Response.json({ok: false, error: 'invalid_play_games_code'}, {status: 401, headers: {'Cache-Control': 'no-store'}});
    console.error('Play Games authentication failed:', error instanceof Error ? error.name : 'Error');
    return Response.json({ok: false, error: 'service_unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
}
