import {createHash, createPublicKey, verify, type KeyObject} from 'node:crypto';

export type AdPlacement = 'revive' | 'orb';
export type RewardPolicy = {placement:AdPlacement; adUnit:string; item:string; amount:number};
export class SsvError extends Error {
  constructor(public readonly code:string, public readonly status=400) { super(code); }
}
export const CALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CLOCK_SKEW_MS = 5 * 60 * 1000;
export const OPPORTUNITY_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const hashId = (value:string) => createHash('sha256').update(value).digest('hex');
export const opportunityId = (uid:string, requestId:string) => hashId(`${uid}\0${requestId}`);
export const isRequestId = (value:unknown):value is string => typeof value==='string' && /^ad-[a-f0-9-]{36}$/.test(value);

/** Policy is server configuration, never a reward amount supplied by Android. */
export function rewardPolicies(env:NodeJS.ProcessEnv=process.env):RewardPolicy[] {
  return (['revive','orb'] as const).map(placement => {
    const suffix=placement.toUpperCase();
    const item=env[`ADMOB_SSV_${suffix}_REWARD_ITEM`];
    const raw=env[`ADMOB_SSV_${suffix}_REWARD_AMOUNT`];
    if(!item || item.length>128 || !raw || !/^[1-9]\d{0,5}$/.test(raw)) throw new SsvError('reward_policy_not_configured',503);
    return {placement, item, amount:Number(raw), adUnit:placement==='revive'?'1402410648':'3630339929'};
  });
}
export type VerifiedReward = {
  transactionId:string; uid:string; customData:string; timestamp:number; policy:RewardPolicy; digest:string;
};
export type ParsedCallback = {wireContent:string; signedContent:string; signature:Buffer; keyId:string; params:URLSearchParams};

/** Keep transport bytes and one URL-form decoding; never reorder or reserialize fields. */
export function parseCallback(rawQuery:string):ParsedCallback {
  if(!rawQuery || rawQuery.length>8192 || /[^\x21-\x7e]/.test(rawQuery) || /%(?![a-fA-F0-9]{2})/.test(rawQuery)) throw new SsvError('invalid_query');
  const marker=rawQuery.indexOf('&signature=');
  if(marker<1) throw new SsvError('missing_signature');
  const rawContent=rawQuery.slice(0,marker);
  // Decoded delimiters would make two different field layouts share a signed message.
  // Our issued nonces and configured reward names never require '&', '=' or '%' in values.
  // Reject nested escapes too, so wire/decoded signatures cannot authorize a second decoding.
  if(/%(?:25|26|3d)/i.test(rawContent)) throw new SsvError('ambiguous_query');
  let signedContent:string;
  try{signedContent=decodeURIComponent(rawContent.replace(/\+/g,'%20'));}catch{throw new SsvError('invalid_query');}
  const tail=/^signature=([A-Za-z0-9_-]{80,200}={0,2})&key_id=(\d{1,16})$/.exec(rawQuery.slice(marker+1));
  if(!tail) throw new SsvError('invalid_signature_fields');
  const params=new URLSearchParams(rawQuery);
  const seen=new Set<string>();
  for(const [key,value] of params){
    if(seen.has(key) || !/^[a-z_]+$/.test(key) || value.length>2048 || /[\u0000-\u001f\u007f\ufffd]/.test(value)) throw new SsvError('ambiguous_query');
    seen.add(key);
  }
  for(const key of ['ad_network','ad_unit','custom_data','reward_amount','reward_item','timestamp','transaction_id','user_id']) {
    if(!params.get(key)) throw new SsvError('missing_reward_fields');
  }
  return {wireContent:rawContent,signedContent, signature:Buffer.from(tail[1],'base64url'),keyId:tail[2],params};
}
export function verifySignature(parsed:ParsedCallback,key:KeyObject):'wire'|'decoded' {
  if(key.asymmetricKeyType!=='ec') throw new SsvError('invalid_signature',403);
  // Wire-encoded and decoded transports both require a valid Google ECDSA signature.
  // In particular, URL-form '+' spaces must be decoded together with percent escapes.
  if(verify('sha256',Buffer.from(parsed.wireContent,'utf8'),{key,dsaEncoding:'der'},parsed.signature)) return 'wire';
  if(parsed.signedContent!==parsed.wireContent && verify('sha256',Buffer.from(parsed.signedContent,'utf8'),{key,dsaEncoding:'der'},parsed.signature)) return 'decoded';
  throw new SsvError('invalid_signature',403);
}
function callbackTimestamp(rawTime:string,now:number):number {
  const eventTime=Number(rawTime);
  const timestamp=rawTime.length===16?Math.floor(eventTime/1000):eventTime;
  if(!/^(?:\d{13}|\d{16})$/.test(rawTime) || !Number.isSafeInteger(eventTime) || timestamp>now+CLOCK_SKEW_MS || timestamp<now-CALLBACK_MAX_AGE_MS) throw new SsvError('invalid_timestamp',403);
  return timestamp;
}

/** URL verification is a signed connectivity probe, never a player entitlement. */
export function verifyDiagnosticCallback(parsed:ParsedCallback,key:KeyObject,policies:RewardPolicy[],now=Date.now()) {
  const p=parsed.params;
  if(p.get('user_id')!=='ssv-diagnostic' || p.get('custom_data')!=='ssv-diagnostic-v1') return null;
  const signatureEncoding=verifySignature(parsed,key);
  const timestamp=callbackTimestamp(p.get('timestamp')!,now);
  const adUnit=p.get('ad_unit')!,transactionId=p.get('transaction_id')!,item=p.get('reward_item')!,amount=p.get('reward_amount')!;
  // Google dashboard probes may contain sample unit/reward/transaction values. Accept them
  // ONLY for this fixed diagnostic identity, with a valid Google signature and fresh time.
  if(!/^(?:\d{1,20}|ca-app-pub-\d{16}\/\d{10})$/.test(adUnit) || !/^[a-fA-F0-9]{1,256}$/.test(transactionId) ||
      !/^[1-9]\d{0,5}$/.test(amount) || item.length>128 || !/^\d{1,30}$/.test(p.get('ad_network')!)) throw new SsvError('invalid_diagnostic');
  const configuredRewardMatched=policies.some(rule=>(adUnit===rule.adUnit || adUnit===`ca-app-pub-2259594031936212/${rule.adUnit}`) && item===rule.item && amount===String(rule.amount));
  return {adUnit,transactionId,timestamp,signatureEncoding,configuredRewardMatched,digest:hashId(parsed.signedContent)};
}
export function verifyCallback(parsed:ParsedCallback,key:KeyObject,policies:RewardPolicy[],now=Date.now()):VerifiedReward {
  verifySignature(parsed,key);
  const p=parsed.params;
  const unit=p.get('ad_unit')!;
  const policy=policies.find(rule=>unit===rule.adUnit || unit===`ca-app-pub-2259594031936212/${rule.adUnit}`);
  if(!policy || p.get('reward_item')!==policy.item || p.get('reward_amount')!==String(policy.amount)) throw new SsvError('unexpected_reward',403);
  const rawTime=p.get('timestamp')!;
  // Google describes milliseconds but also publishes a 16-digit microsecond example.
  // Normalize these two explicit formats only; retain the same freshness/skew limits.
  const timestamp=callbackTimestamp(rawTime,now);
  const transactionId=p.get('transaction_id')!;
  const uid=p.get('user_id')!;
  if(!/^[a-fA-F0-9]{16,256}$/.test(transactionId) || uid.length>128) throw new SsvError('invalid_reward_identity');
  return {transactionId,uid,customData:p.get('custom_data')!,timestamp,policy,digest:hashId(parsed.signedContent)};
}
export function parseGoogleKeys(body:unknown):Map<string,KeyObject> {
  const keys=(body as {keys?:unknown[]})?.keys;
  if(!Array.isArray(keys) || keys.length<1 || keys.length>20) throw new SsvError('key_service_unavailable',503);
  const result=new Map<string,KeyObject>();
  for(const entry of keys){
    const item=entry as {keyId?:unknown;pem?:unknown};
    if(!Number.isSafeInteger(item.keyId) || typeof item.pem!=='string' || item.pem.length>4096) throw new SsvError('key_service_unavailable',503);
    const key=createPublicKey(item.pem);
    if(key.asymmetricKeyType!=='ec') throw new SsvError('key_service_unavailable',503);
    result.set(String(item.keyId),key);
  }
  return result;
}
