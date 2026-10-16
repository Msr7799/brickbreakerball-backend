const {ObjectId}=require('mongodb');
const {db}=require('../lib/db');
const {isAdmin}=require('../lib/auth');
const {json,requireMethod,postSameOrigin}=require('../lib/http');
const {checkPurchase,statusFor}=require('../lib/verify-event');
module.exports=async(req,res)=>{
  if(!requireMethod(req,res,'POST')||!postSameOrigin(req,res))return;
  if(!isAdmin(req))return json(res,401,{ok:false,error:'Not signed in'});
  let data; try {data=typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{};} catch{return json(res,400,{ok:false,error:'Invalid JSON'});}
  if(typeof data.id!=='string'||!ObjectId.isValid(data.id))return json(res,400,{ok:false,error:'Invalid event ID'});
  try {
    const database=await db();
    const col=database.collection('events');
    const item=await col.findOne({_id:new ObjectId(data.id)});
    if(!item)return json(res,404,{ok:false,error:'Event not found'});
    if(!['product','subscription'].includes(item.type))return json(res,400,{ok:false,error:'No purchase to verify'});
    if(!item.encryptedToken)return json(res,400,{ok:false,error:'Purchase token not available'});
    const verification=await checkPurchase(item);
    await col.updateOne({_id:item._id},{$set:{googleVerification:verification,status:statusFor(item,verification),verifiedAt:verification?.verifiedAt||null,error:verification?.state==='verification_error'?verification.note:null}});
    return json(res,200,{ok:true,state:verification?.state});
  }catch(e){console.error('recheck:',e?.name);return json(res,503,{ok:false,error:'Verification unavailable'});}
};
