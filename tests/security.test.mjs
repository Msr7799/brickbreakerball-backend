import test from 'node:test';
import assert from 'node:assert/strict';
import {safeDatabasePath,tokenMatches,getBearer,validateDateRange,validateResource} from '../src/lib/security.ts';
const secret='abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
test('token check fails closed and checks a real token',()=>{
 assert.equal(tokenMatches(secret,secret),true);
 assert.equal(tokenMatches('bad',secret),false);
 assert.equal(tokenMatches(secret,undefined),false);
 assert.equal(tokenMatches(secret,'abc'),false);
});
test('bearer authentication uses strict syntax',()=>{
 assert.equal(getBearer(new Request('https://example.org',{headers:{Authorization:'Bearer '+secret}})),secret);
 assert.equal(getBearer(new Request('https://example.org',{headers:{Authorization:'Basic abc'}})),null);
});
test('firebase path cannot escape /mcp root',()=>{
 assert.equal(safeDatabasePath('mcp/items','/mcp'),'/mcp/items');
 assert.equal(safeDatabasePath('/mcp','/mcp'),'/mcp');
 assert.throws(()=>safeDatabasePath('/users/private','/mcp'));
 assert.throws(()=>safeDatabasePath('/mcp/../users','/mcp'));
 assert.throws(()=>safeDatabasePath('/mcp/a#b','/mcp'));
});
test('report date ranges are bounded',()=>{
 validateDateRange('2026-09-01','2026-09-30');
 assert.throws(()=>validateDateRange('2026-02-30','2026-03-05'));
 assert.throws(()=>validateDateRange('2026-10-01','2026-09-01'));
 assert.throws(()=>validateDateRange('2026-01-01','2026-10-01'));
});
test('accounts cannot inject URL paths',()=>{
 assert.equal(validateResource('admob','accounts/pub-1234567890123456'),'accounts/pub-1234567890123456');
 assert.throws(()=>validateResource('admob','accounts/pub-1234567890123456/../../foo'));
});
