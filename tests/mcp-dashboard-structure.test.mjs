import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('existing billing webhook and dashboard retained',()=>{
 assert.match(read('app/api/webhook/route.ts'),/adaptBilling/);
 assert.match(read('public/dashboard.html'),/app\.js/);
 assert.match(read('public/dashboard.html'),/mcp-dashboard/);
});
test('new console enforces session and same-origin for actions',()=>{
 for(const p of ['check','run']){
  const src=read(`app/api/mcp-control/${p}/route.ts`);
  assert.match(src,/controlAuthorized/);assert.match(src,/controlOriginMatches/);
 }
 for(const p of ['overview','activity'])assert.match(read(`app/api/mcp-control/${p}/route.ts`),/controlAuthorized/);
 const diagnostics=read('app/api/daily-reward-diagnostics/route.ts');
 assert.match(diagnostics,/controlAuthorized/);
 assert.match(diagnostics,/controlOriginMatches/);
});
test('original MCP tools and Tavily search remain registered and auditable',()=>{
 const mcp=read('app/api/mcp/route.ts');
 assert.equal((mcp.match(/server\.registerTool\(/g)||[]).length,40);\n assert.match(mcp,/writeContext\.getStore\(\)/);\n assert.match(mcp,/recordMcpWriteIntent/);
 assert.match(mcp,/server\.registerTool\("tavily_search"/);
 assert.match(mcp,/writeAudit/);
 assert.match(read('src/lib/mcp-control.ts'),/writeAudit/);
});
test('UI does not fake connection successes',()=>{
 const controls=read('src/lib/mcp-control.ts');
 assert.match(controls,/case "firebase"/);assert.match(controls,/firebaseProbe/);
 assert.match(controls,/case "admob"/);assert.match(controls,/oauthToken\("admob"\)/);
 assert.match(controls,/case "adsense"/);assert.match(controls,/oauthToken\("adsense"\)/);
 // فحص النوع الصريح لـ MongoDB يمنع خطأ TS2352.
 assert.match(controls,/collection<ConnectionCheck>\("mcp_checks"\)/);
 // فحص وجود latest يمنع خطأ TS18048 بدون تعطيل strict.
 assert.match(controls,/fresh\s*&&\s*latest\s*\?\s*latest\.status\s*:\s*"pending"/);
});

test('AdSense and Pub/Sub management is guarded, read and write separated',()=>{
 const mcp=read('app/api/mcp/route.ts');
 const adapter=read('src/lib/monetization-admin.ts');
 for(const name of ['adsense_list_alerts','adsense_list_payments','adsense_list_policy_issues','adsense_list_adclients',
  'pubsub_create_topic','pubsub_create_pull_subscription','pubsub_update_pull_ack_deadline','admob_create_ad_unit','adsense_create_display_ad_unit']){
  assert.match(mcp,new RegExp('server\\.registerTool\\("'+name+'"'));
 }
 assert.match(adapter,/forgepulse-/);
 assert.match(adapter,/pushConfig\\?\\.pushEndpoint/);
 assert.match(adapter,/productCode!=="AFC"/);
 assert.match(mcp,/mcp:write/);
 assert.match(mcp,/recordMcpWriteIntent/);
});
