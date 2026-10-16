const {json,requireMethod}=require('../lib/http');
const {verifyPushJwt}=require('../lib/google');
const {db}=require('../lib/db');
const {normalize}=require('../lib/event');
const {checkPurchase,statusFor}=require('../lib/verify-event');
const {configured}=require('../lib/config');

module.exports = async function webhook(req,res) {
  if (!requireMethod(req,res,'POST')) return;
  if (!configured()) return json(res,503,{ok:false,error:'Backend configuration incomplete'});
  try { await verifyPushJwt(req.headers.authorization); }
  catch { return json(res,401,{ok:false,error:'Unauthorized Pub/Sub push'}); }
  try {
    const raw = typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if (!raw || raw.length>120_000) return json(res,400,{ok:false,error:'Invalid message size'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if (!body?.message?.data || typeof body.message.data!=='string') return json(res,400,{ok:false,error:'Missing Pub/Sub message'});
    if (!body.message.messageId && !body.message.message_id) return json(res,400,{ok:false,error:'Missing message ID'});
    const decoded=Buffer.from(body.message.data,'base64').toString('utf8');
    const data=JSON.parse(decoded);
    if (data.packageName!==process.env.GOOGLE_PLAY_PACKAGE_NAME) return json(res,400,{ok:false,error:'Unexpected Android package'});
    const event=normalize(data,body);
    const database=await db();
    let result;
    try { result=await database.collection('events').insertOne(event); }
    catch (e) {
      if (e?.code===11000) return json(res,200,{ok:true,duplicate:true});
      throw e;
    }
    // Persist before acknowledging. If Google Play API fails, show status in dashboard.
    if (event.type==='product'||event.type==='subscription') {
      const googleVerification=await checkPurchase(event);
      if (googleVerification) {
        await database.collection('events').updateOne({_id:result.insertedId},{$set:{googleVerification,status:statusFor(event,googleVerification),verifiedAt:googleVerification.verifiedAt||null,error:googleVerification.state==='verification_error'?googleVerification.note:null}});
      }
    }
    return json(res,200,{ok:true,received:true});
  } catch (error) {
    // DB failures need retry, so respond non-2xx. Avoid logging potentially sensitive tokens.
    console.error('RTDN processing error:',error?.name||'Error');
    return json(res,503,{ok:false,error:'Temporary processing failure'});
  }
};
