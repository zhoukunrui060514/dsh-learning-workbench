/** Restrict the custom route, which is outside DSH's own /api token gate. */
export function allowedRequest(req, origin) {
  if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)) return false;
  if (req.headers.host !== new URL(origin).host) return false;
  if (req.headers.origin && req.headers.origin !== origin) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return req.method === 'GET' || req.headers['x-learning-workbench'] === '1';
}
