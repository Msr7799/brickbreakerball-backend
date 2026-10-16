import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {adaptBilling} from '../src/lib/billing-adapter.ts';
const require=createRequire(import.meta.url);
const legacyHealth=require('../billing/api/health.js');
const legacyLogout=require('../billing/api/logout.js');
const legacySession=require('../billing/api/session.js');

test('CommonJS billing handler returns JSON through Next route adapter',async()=>{
 const response=await adaptBilling(legacyHealth)(new Request('https://example.org/api/health'));
 assert.equal(response.status,200);
 assert.equal((await response.json()).ok,true);
});
test('billing dashboard session defaults to unauthenticated',async()=>{
 const response=await adaptBilling(legacySession)(new Request('https://example.org/api/session'));
 assert.equal(response.status,200);
 assert.equal((await response.json()).authenticated,false);
});
test('billing cookie deletion is preserved in Next route adapter',async()=>{
 const response=await adaptBilling(legacyLogout)(new Request('https://example.org/api/logout',{method:'POST',headers:{origin:'https://example.org','content-type':'application/json'},body:'{}'}));
 assert.equal(response.status,200);
 assert.match(response.headers.get('set-cookie')||'',/bbb_admin=;/);
});
test('billing adapter rejects malformed JSON before handler',async()=>{
 const response=await adaptBilling(legacyLogout)(new Request('https://example.org/api/logout',{method:'POST',body:'{bad'}));
 assert.equal(response.status,400);
});
test('billing adapter rejects oversized request bodies',async()=>{
 const response=await adaptBilling(legacyLogout)(new Request('https://example.org/api/logout',{method:'POST',body:'x'.repeat(131000)}));
 assert.equal(response.status,413);
});
