import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");

test("Google Play MCP and dashboard expose the same safe, staged store workflow",()=>{
 const mcp=read("../app/api/mcp/route.ts");
 const dashboard=read("../src/lib/mcp-control.ts");
 const core=read("../src/lib/play-admin.ts");
 const ids=["play_access_diagnostic","play_begin_edit","play_list_store_listings","play_get_store_listing","play_get_app_details","play_list_store_images","play_list_tracks","play_get_track","play_update_store_listing","play_update_app_details","play_upload_store_image","play_delete_store_image","play_validate_edit","play_commit_edit","play_reply_review"];
 for(const id of ids){
  assert.match(mcp,new RegExp(`registerTool\\("${id}"`),`MCP missing ${id}`);
  assert.match(dashboard,new RegExp(`id:"${id}"`),`Dashboard missing ${id}`);
 }
 assert.match(core,/ERROR_IF_IN_REVIEW/);
 assert.match(core,/validatedAt/);
 assert.match(core,/mcp_play_edits/);
 assert.match(core,/4\*1024\*1024/);
 assert.doesNotMatch(core,/process\.env\.[A-Z_]*PRIVATE_KEY/);
});

test("Image uploads and request history are protected in the admin UI",()=>{
 const upload=read("../app/api/mcp-control/upload/route.ts");
 const page=read("../app/mcp-dashboard/page.tsx");
 const audit=read("../src/lib/mcp-control.ts");
 assert.match(upload,/controlAuthorized\(request\)/);
 assert.match(upload,/controlOriginMatches\(request\)/);
 assert.match(upload,/recordMcpWriteIntent/);
 assert.match(page,/new FormData\(\)/);
 assert.match(page,/historyStatus/);
 assert.match(audit,/requestId:crypto\.randomUUID/);
});

test("Google Play credential identity and structured Google error reasons are diagnostic but secret-safe",()=>{
 const google=read("../src/lib/google.ts");
 const mcp=read("../app/api/mcp/route.ts");
 assert.match(google,/function googleServiceAccountIdentity\(/);
 assert.match(google,/client_email/);
 assert.match(google,/function googleApiErrorMessage\(/);
 assert.match(google,/error\?\.details/);
 assert.match(google,/error\?\.errors/);
 assert.match(google,/\[redacted\]/);
 assert.match(mcp,/playCaller:/);
 assert.match(mcp,/playPermissions:/);
 assert.doesNotMatch(mcp,/private_key/);
});

test("Play Console permission audit reads only current Play caller and protects an active edit",()=>{
 const core=read("../src/lib/play-admin.ts");
 assert.match(core,/function playCallerPermissions\(/);
 assert.match(core,/GOOGLE_PLAY_DEVELOPER_ID/);
 assert.match(core,/identity\.clientEmail\.toLowerCase\(\)/);
 assert.match(core,/CAN_MANAGE_PERMISSIONS_GLOBAL/);
 assert.match(core,/CAN_MANAGE_PUBLIC_LISTING_GLOBAL/);
 assert.match(core,/An active Google Play edit is being preserved/);
});

test("Google API permission errors expose structured reasons but redact bearer tokens",()=>{
 const source=read("../src/lib/google.ts");
 const functionSource=source.slice(source.indexOf("export function googleApiErrorMessage"),source.indexOf("export async function googleToken"));
 const compiled=ts.transpileModule(functionSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:{}};
 runInNewContext(compiled,context);
 const format=context.exports.googleApiErrorMessage;
 const error=format(403,{error:{status:"PERMISSION_DENIED",message:"The caller does not have permission",errors:[{reason:"forbidden"}],details:[{reason:"IAM_PERMISSION_DENIED",metadata:{permission:"androidpublisher.edits.validate",service:"androidpublisher.googleapis.com"}}]}},"Forbidden");
 assert.match(error,/403 \(PERMISSION_DENIED\)/);
 assert.match(error,/forbidden/);
 assert.match(error,/IAM_PERMISSION_DENIED/);
 assert.match(error,/androidpublisher\.edits\.validate/);
 assert.doesNotMatch(format(403,{error:{message:"Bearer ya29.SUPERSECRET"}},"Denied"),/SUPERSECRET/);
 assert.match(format(403,{error:{message:"Denied",details:{invalid:true}}},"Denied"),/Denied/);
});
