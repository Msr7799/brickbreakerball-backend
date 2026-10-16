const crypto = require('node:crypto');
const {validAesKey} = require('./config');
function tokenDigest(token) { return token ? crypto.createHash('sha256').update(token).digest('hex') : null; }
function key() { if (!validAesKey()) throw new Error('TOKEN_ENCRYPTION_KEY invalid'); return Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'base64'); }
function encrypt(token) {
  if (!token) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm',key(),iv);
  const body = Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64url')).join('.');
}
function decrypt(packed) {
  if (!packed) return null;
  const [iv,tag,body] = packed.split('.').map(x=>Buffer.from(x,'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm',key(),iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');
}
module.exports = {tokenDigest,encrypt,decrypt};
