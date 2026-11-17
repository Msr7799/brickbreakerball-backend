import type {NextRequest} from 'next/server';
import {statusResponse} from '../../../../../src/lib/admob-ssv';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=(request:NextRequest)=>statusResponse(request);
