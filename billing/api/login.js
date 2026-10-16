const crypto=require('node:crypto');
const {db}=require('../lib/db');
const {json,requireMethod,postSameOrigin}=require('../lib/http');
const {issueSession,passwordCorrect}=require('../lib/auth');
const {configured}=require('../lib/config');
module.exports=async function login(req,res) {
  if (!requireMethod(req,res,'POST') || !postSameOrigin(req,res)) return;
  if (!configured()) return json(res,503,{ok:false,error:'Missing environment variables'});
  let password;
  try {password=(typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{}).password;}
  catch {return json(res,400,{ok:false,error:'Invalid JSON'});}
  if (typeof password!=='string'||password.length>1000) return json(res,400,{ok:false,error:'Invalid password format'});
  try {
    const database=await db();
    const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').slice(0,80);
    const key=crypto.createHash('sha256').update(ip+process.env.SESSION_SECRET).digest('hex');
    const col=database.collection('login_attempts');
    const entry=await col.findOne({_id:key});
    const now=new Date();
    if (entry?.lockedUntil && new Date(entry.lockedUntil)>now) return json(res,429,{ok:false,error:'محاولات كثيرة. جرّب بعد 15 دقيقة.'});
    if (!passwordCorrect(password)) {
      const count=(entry?.firstAt && now-new Date(entry.firstAt)<15*60_000 ? entry.attempts:0)+1;
      const lockedUntil=count>=5?new Date(now.getTime()+15*60_000):null;
      await col.updateOne({_id:key},{$set:{attempts:count,firstAt:count===1?now:(entry?.firstAt||now),lockedUntil,expiresAt:new Date(now.getTime()+60*60_000)}},{upsert:true});
      return json(res,401,{ok:false,error:lockedUntil?'تم إيقاف المحاولات مؤقتاً.':'كلمة المرور غير صحيحة'});
    }
    await col.deleteOne({_id:key});
    issueSession(res);
    return json(res,200,{ok:true});
  } catch(e) { console.error('login:',e?.name); return json(res,503,{ok:false,error:'Unable to reach database'}); }
};
