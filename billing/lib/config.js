const REQUIRED = ['MONGODB_URI', 'MONGODB_DB', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'TOKEN_ENCRYPTION_KEY', 'GOOGLE_PLAY_PACKAGE_NAME', 'PUBSUB_PUSH_SERVICE_ACCOUNT', 'PUBSUB_AUDIENCE'];
function missing() { return REQUIRED.filter((key) => !process.env[key] || process.env[key].startsWith('REPLACE_') || process.env[key].includes('YOUR-VERCEL-DOMAIN')); }
function configured() { return missing().length === 0 && process.env.ADMIN_PASSWORD.length >= 12 && !!validAesKey(); }
function validAesKey() {
  const str = process.env.TOKEN_ENCRYPTION_KEY || '';
  try { return /^[A-Za-z0-9+/]{43}=$/.test(str) && Buffer.from(str, 'base64').length === 32; } catch { return false; }
}
module.exports = { missing, configured, validAesKey };
