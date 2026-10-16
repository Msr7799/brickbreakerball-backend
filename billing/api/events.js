const {db}=require('../lib/db');
const {isAdmin}=require('../lib/auth');
const {json,requireMethod}=require('../lib/http');
const {publicEvent}=require('../lib/event');
const FILTER_TYPES=['all','test','product','subscription','voided','refund_review'];
const FILTER_STATUS=['all','test','verified_purchase','verified_active','not_configured','awaiting_verification','verification_error','pending','canceled','voided','needs_attention','other_state'];
module.exports=async(req,res)=>{
  if(!requireMethod(req,res,'GET'))return;
  if(!isAdmin(req))return json(res,401,{ok:false,error:'Not signed in'});
  try {
    const database=await db();
    const type=String(req.query.type||'all'), status=String(req.query.status||'all');
    const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1));
    const limit=25;
    if(!FILTER_TYPES.includes(type)||!FILTER_STATUS.includes(status))return json(res,400,{ok:false,error:'Invalid filters'});
    const query={};if(type!=='all')query.type=type;if(status!=='all')query.status=status;
    const [items,total] = await Promise.all([
      database.collection('events').find(query,{projection:{encryptedToken:0,tokenHash:0}}).sort({receivedAt:-1}).skip((page-1)*limit).limit(limit).toArray(),
      database.collection('events').countDocuments(query)
    ]);
    return json(res,200,{ok:true,items:items.map(publicEvent),page,limit,total});
  }catch(e){console.error('events:',e?.name);return json(res,503,{ok:false,error:'Cannot load events'});}
};
