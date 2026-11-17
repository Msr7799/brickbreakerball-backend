import type {NextRequest} from 'next/server';
import {callbackResponse} from '../../../../src/lib/admob-ssv';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:NextRequest)=>callbackResponse(request);
