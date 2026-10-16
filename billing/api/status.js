const {db}=require('../lib/db');
const {isAdmin}=require('../lib/auth');
const {json,requireMethod}=require('../lib/http');
const {missing,validAesKey}=require('../lib/config');
module.exports=async(req,res)=>{
  if(!requireMethod(req,res,'GET'))return;
  if(!isAdmin(req))return json(res,401,{ok:false,error:'Not signed in'});
  try {
    const database=await db();
    const col=database.collection('events');
    const [total,tests,purchases,voided,verified,errors,latest] = await Promise.all([
      col.countDocuments({}), col.countDocuments({type:'test'}), col.countDocuments({type:'product'}),col.countDocuments({type:'voided'}),
      col.countDocuments({status:{$in:['verified_purchase','verified_active']}}),
      col.countDocuments({status:{$in:['verification_error','needs_attention']}}),
      col.find({},{projection:{receivedAt:1}}).sort({receivedAt:-1}).limit(1).next()
    ]);
    return json(res,200,{
      ok:true,summary:{total,tests,purchases,voided,verified,errors,lastReceivedAt:latest?.receivedAt||null},
      setup:{
        database:true,packageName:process.env.GOOGLE_PLAY_PACKAGE_NAME||null,
        pushIdentityConfigured:!!(process.env.PUBSUB_PUSH_SERVICE_ACCOUNT&&process.env.PUBSUB_AUDIENCE),
        playApiConfigured:!!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
        tokenEncryptionConfigured:validAesKey(),
        environmentReady:missing().length===0,
        // We cannot check Google's Pub/Sub subscription from here. Seeing a test event proves delivery.
        verifiedDelivery:tests>0||total>0
      }
    });
  } catch (e) {return json(res,503,{ok:false,error:'Database not ready'});}
};
