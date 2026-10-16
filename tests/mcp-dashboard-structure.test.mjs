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
test('all fifteen original MCP tools still registered and auditable',()=>{
 const mcp=read('app/api/mcp/route.ts');
 assert.equal((mcp.match(/server\.registerTool\(/g)||[]).length,15);
 assert.match(mcp,/writeAudit/);
 assert.match(read('src/lib/mcp-control.ts'),/writeAudit/);
});
test('UI does not fake connection successes',()=>{
 const controls=read('src/lib/mcp-control.ts');
 assert.match(controls,/case "firebase"/);assert.match(controls,/firebaseProbe/);
 assert.match(controls,/case "admob"/);assert.match(controls,/oauthToken\("admob"\)/);
 assert.match(controls,/case "adsense"/);assert.match(controls,/oauthToken\("adsense"\)/);
 assert.match(controls,/fresh\?latest\.status:"pending"/);
});
