const {verifyPurchase} = require('./google');
const {decrypt} = require('./crypto');
async function checkPurchase(event) {
  if (!['product','subscription'].includes(event.type) || !event.encryptedToken) return null;
  const token=decrypt(event.encryptedToken);
  try { return await verifyPurchase(event.type,event.packageName,token); }
  catch (error) { return {state:'verification_error',verifiedAt:new Date(),note:String(error.message).slice(0,120)}; }
}
function statusFor(record,verification) {
  if (!verification) return record.status;
  if (record.type==='product' && record.status==='canceled') return 'canceled';
  return verification.state;
}
module.exports={checkPurchase,statusFor};
