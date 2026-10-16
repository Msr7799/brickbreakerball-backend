const {clearSession}=require('../lib/auth');
const {json,requireMethod,postSameOrigin}=require('../lib/http');
module.exports=(req,res)=>{
  if (!requireMethod(req,res,'POST') || !postSameOrigin(req,res)) return;
  clearSession(res); return json(res,200,{ok:true});
};
