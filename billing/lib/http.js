function json(res, status, data) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.status(status).json(data);
}
function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  json(res, 405, {ok:false, error:'Method not allowed'});
  return false;
}
function postSameOrigin(req, res) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin) {
    try { if (new URL(origin).host === host) return true; } catch {}
    json(res,403,{ok:false,error:'Origin mismatch'});
    return false;
  }
  // Non-browser requests must not bypass CSRF checks when authenticated with cookies.
  if (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) {
    json(res,403,{ok:false,error:'Cross-site request blocked'});
    return false;
  }
  return true;
}
module.exports = {json, requireMethod, postSameOrigin};
