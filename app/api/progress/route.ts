import {NextRequest} from 'next/server';
import {cloudProgressResponse} from '../../../src/lib/cloud-progress';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:NextRequest)=>cloudProgressResponse(request,false);
export const PUT=(request:NextRequest)=>cloudProgressResponse(request,true);
