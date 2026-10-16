// Lazy-loading lets unit tests run before npm install; Vercel installs this dependency.
let authClient;
function getAuthLibrary() { return require('google-auth-library'); }
async function verifyPushJwt(authHeader) {
  const audience=process.env.PUBSUB_AUDIENCE;
  const email=process.env.PUBSUB_PUSH_SERVICE_ACCOUNT;
  if (!audience || !email || !/^Bearer [A-Za-z0-9._-]+$/i.test(authHeader||'')) throw new Error('Missing Pub/Sub authorization');
  if (!authClient) authClient=new (getAuthLibrary().OAuth2Client)();
  const ticket=await authClient.verifyIdToken({idToken:authHeader.slice(7),audience});
  const claims=ticket.getPayload();
  if (!claims || claims.email!==email || claims.email_verified!==true || !['accounts.google.com','https://accounts.google.com'].includes(claims.iss)) throw new Error('Unexpected Pub/Sub caller');
  return claims;
}
function googleCredentials() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  const json=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (json.type!=='service_account'||!json.client_email||!json.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must contain a service account JSON');
  return json;
}
async function verifyPurchase(type,packageName,token) {
  const credentials=googleCredentials();
  if (!credentials) return {state:'not_configured',verifiedAt:new Date(),note:'Google Play Developer API credentials not configured'};
  if (!token) return {state:'not_applicable',verifiedAt:new Date(),note:'No purchase token'};
  const auth=new (getAuthLibrary().GoogleAuth)({credentials,scopes:['https://www.googleapis.com/auth/androidpublisher']});
  const client=await auth.getClient();
  const headers=await client.getRequestHeaders();
  const bearer=typeof headers.get==='function' ? headers.get('Authorization') : (headers.Authorization || headers.authorization);
  if (!bearer) throw new Error('Could not obtain Google Play access token');
  const urlRoot=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;
  const path=type==='subscription'?'purchases/subscriptionsv2/tokens':'purchases/productsv2/tokens';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  let response;
  try { response=await fetch(`${urlRoot}/${path}/${encodeURIComponent(token)}`,{headers:{Authorization:bearer},signal:controller.signal}); }
  finally {clearTimeout(timeout);}
  if (!response.ok) {
    // Do not log or store response bodies: they can contain purchase identifiers.
    throw new Error(`Google Play API responded HTTP ${response.status}`);
  }
  const value=await response.json();
  const state=type==='subscription'?value.subscriptionState:value.purchaseStateContext?.purchaseState;
  return {
    state:type==='subscription'?(state==='SUBSCRIPTION_STATE_ACTIVE'?'verified_active':'other_state'):(state==='PURCHASED'?'verified_purchase':state==='PENDING'?'pending':state==='CANCELLED'?'canceled':'other_state'),
    playState:state||'UNKNOWN',verifiedAt:new Date(),
    orderId:value.orderId||null,
    products:type==='subscription'?(value.lineItems||[]).map(x=>x.productId).filter(Boolean):(value.productLineItem||[]).map(x=>x.productId).filter(Boolean),
    acknowledged:value.acknowledgementState||null,
    test:!!(value.testPurchaseContext||value.testPurchase)
  };
}
module.exports={verifyPushJwt,verifyPurchase,googleCredentials};
