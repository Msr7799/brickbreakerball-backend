const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {normalize,publicEvent}=require('../lib/event');
const {decrypt}=require('../lib/crypto');
const {statusFor}=require('../lib/verify-event');
process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
function envelope(messageId='hello'){return {message:{messageId,publishTime:'2026-10-16T12:34:56Z'}};}
test('normalizes purchased notification without exposing token publicly',()=>{
  const event=normalize({packageName:'com.forgepulse.brickbreakerball',eventTimeMillis:'1792150000000',oneTimeProductNotification:{notificationType:1,sku:'buy-80-gems',purchaseToken:'PRIVATE_PURCHASE_TOKEN'}},envelope());
  assert.equal(event.type,'product');
  assert.equal(event.status,'awaiting_verification');
  assert.equal(event.productId,'buy-80-gems');
  assert.equal(decrypt(event.encryptedToken),'PRIVATE_PURCHASE_TOKEN');
  assert.equal(publicEvent(event).encryptedToken,undefined);
  assert.equal(publicEvent(event).tokenHash,undefined);
  assert.equal(event.details.purchaseToken,undefined);
  assert.equal(event.tokenHash.length,64);
});
test('test notifications do not count as purchases',()=>{
 const item=normalize({packageName:'com.forgepulse.brickbreakerball',testNotification:{version:'1.0'}},envelope('test'));
 assert.equal(item.type,'test');assert.equal(item.status,'test');assert.equal(item.encryptedToken,null);
});
test('canceled product notifications stay canceled even when older API status says purchased',()=>{
 const item=normalize({packageName:'com.forgepulse.brickbreakerball',oneTimeProductNotification:{notificationType:2,sku:'buy-80-gems',purchaseToken:'t'}},envelope('canceled'));
 assert.equal(item.status,'canceled');
 assert.equal(statusFor(item,{state:'verified_purchase'}),'canceled');
});
test('voided events are captured without storing raw purchase token',()=>{
 const item=normalize({packageName:'com.forgepulse.brickbreakerball',voidedPurchaseNotification:{purchaseToken:'secret',orderId:'GPA.1234',productType:2,refundType:1}},envelope('void'));
 assert.equal(item.type,'voided');assert.equal(item.status,'voided');assert.equal(item.details.orderId,'GPA.1234');
 assert.ok(!JSON.stringify(publicEvent(item)).includes('secret'));
});
test('rejects events with multiple mutually exclusive notification categories',()=>{
 assert.throws(()=>normalize({testNotification:{version:'1.0'},oneTimeProductNotification:{notificationType:1}},envelope()),/ambiguous/);
});
