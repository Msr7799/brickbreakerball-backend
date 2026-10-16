const crypto = require('node:crypto');
const COOKIE = 'bbb_admin';
function safeEqual(a,b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function hmac(data) { return crypto.createHmac('sha256',process.env.SESSION_SECRET || 'missing').update(data).digest('base64url'); }
function issueSession(res) {
  const payload = Buffer.from(JSON.stringify({v:1,exp:Date.now()+12*60*60*1000})).toString('base64url');
  const token = `${payload}.${hmac(payload)}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
}
function clearSession(res) { res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`); }
function isAdmin(req) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return false;
  const raw = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  if (!raw) return false;
  const [payload, signature, extra] = raw.slice(COOKIE.length+1).split('.');
  if (!payload || !signature || extra || !safeEqual(signature,hmac(payload))) return false;
  try { const data=JSON.parse(Buffer.from(payload,'base64url').toString()); return data.v===1 && Number.isFinite(data.exp) && data.exp>Date.now(); } catch { return false; }
}
function passwordCorrect(str) { return !!process.env.ADMIN_PASSWORD && safeEqual(str || '',process.env.ADMIN_PASSWORD); }
module.exports = {issueSession,clearSession,isAdmin,passwordCorrect,safeEqual};
