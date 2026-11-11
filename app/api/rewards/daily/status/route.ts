import {NextRequest} from 'next/server';
import {dailyRewardResponse} from '../../../../../src/lib/daily-rewards';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request:NextRequest) => dailyRewardResponse(request,false);
