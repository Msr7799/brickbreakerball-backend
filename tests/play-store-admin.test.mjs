import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

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
