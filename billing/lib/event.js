const {tokenDigest,encrypt} = require('./crypto');
const TYPES = {
  1:'تم شراء منتج',2:'أُلغيت عملية شراء'
};
function normalize(data, envelope) {
  if (!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Invalid event format');
  const keys=['testNotification','oneTimeProductNotification','subscriptionNotification','voidedPurchaseNotification','pendingRefundReviewNotification'].filter(k=>data[k]);
  if (keys.length!==1) throw new Error('Unsupported or ambiguous event type');
  const key=keys[0];
  const obj=data[key];
  if (typeof obj!=='object' || Array.isArray(obj)) throw new Error('Invalid details');
  const eventTime = Number(data.eventTimeMillis);
  const eventDate=Number.isSafeInteger(eventTime) && eventTime>0 ? new Date(eventTime) : null;
  const details={};
  let status='notification_only', type='other', label='إشعار آخر', productId=null;
  if (key==='oneTimeProductNotification') {
    type='product'; productId=String(obj.sku||'').slice(0,180);
    label=TYPES[obj.notificationType] || 'تحديث منتج';
    status=Number(obj.notificationType)===2?'canceled':'awaiting_verification';
    details.notificationType=obj.notificationType;
  } else if (key==='subscriptionNotification') {
    type='subscription'; productId=String(obj.subscriptionId||'').slice(0,180);
    label='تحديث اشتراك'; status='awaiting_verification'; details.notificationType=obj.notificationType;
  } else if (key==='voidedPurchaseNotification') {
    type='voided'; label='إلغاء / استرداد'; status='voided'; details.refundType=obj.refundType; details.productType=obj.productType;
    details.orderId=String(obj.orderId||'').slice(0,120);
  } else if (key==='pendingRefundReviewNotification') {
    type='refund_review'; label='مراجعة استرداد'; status='needs_attention';
    details.notificationType=obj.notificationType;
  } else {
    type='test'; label='إشعار اختباري من Google Play'; status='test';
  }
  const token=typeof obj.purchaseToken==='string'?obj.purchaseToken:null;
  return {
    messageId:String(envelope.message.messageId || envelope.message.message_id || '').slice(0,200),
    publishTime:envelope.message.publishTime ? new Date(envelope.message.publishTime):null,
    receivedAt:new Date(), eventTime:eventDate,
    packageName:String(data.packageName||''), type,label,status,
    productId,tokenHash:tokenDigest(token),encryptedToken:encrypt(token),
    details,googleVerification:null,
    verifiedAt:null, error:null,
    // No raw purchase token or personal player details stored in plaintext.
    schemaVersion:1
  };
}
function publicEvent(record) {
  const {_id,messageId,receivedAt,eventTime,type,label,status,productId,details,googleVerification,verifiedAt,error,packageName} = record;
  return {id:String(_id),messageId,receivedAt,eventTime,type,label,status,productId,details,googleVerification,verifiedAt,error,packageName};
}
module.exports={normalize,publicEvent};
