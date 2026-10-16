const {isAdmin}=require('../lib/auth');
const {json,requireMethod}=require('../lib/http');
module.exports=(req,res)=>{if(!requireMethod(req,res,'GET'))return;json(res,200,{ok:true,authenticated:isAdmin(req)});};
