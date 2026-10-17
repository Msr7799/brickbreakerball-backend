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
});
test('original MCP tools and Tavily search remain registered and auditable',()=>{
 const mcp=read('app/api/mcp/route.ts');
 assert.equal((mcp.match(/server\.registerTool\(/g)||[]).length,16);
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
