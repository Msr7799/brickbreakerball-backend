const crypto = require('node:crypto');
console.log('SESSION_SECRET=' + crypto.randomBytes(48).toString('hex'));
console.log('TOKEN_ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('base64'));
