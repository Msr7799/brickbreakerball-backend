import {NextRequest} from "next/server";
const {isAdmin}=require("../../billing/lib/auth.js") as {isAdmin:(request:{headers:{cookie:string}})=>boolean};
export function controlAuthorized(request:NextRequest):boolean{return isAdmin({headers:{cookie:request.headers.get("cookie")||""}});}
export function controlOriginMatches(request:NextRequest){
 const origin=request.headers.get("origin");
 return !!origin&&origin===new URL(request.url).origin;
}
export const noCache={"Cache-Control":"no-store"};
