const http = require('node:http');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { reviewStore } = require('./check-infrastructure-source.cjs');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = 4208;
const reviewPath = '/__trackside/infrastructure/';
const types = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

async function requireAdmin(tracker, authorization, request) {
  if (!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization || '')) return false;
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(tracker, 'outputs', 'supabase-config.js'), 'utf8'), context, { timeout: 100 });
  const config = context.window.TRACKSIDE_SUPABASE_CONFIG;
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port) {
    throw new Error('Tracker Supabase configuration is invalid.');
  }
  const headers = { apikey: config.publishableKey, Authorization: authorization };
  const get = endpoint => request(new URL(endpoint, url.origin), { headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
  const user = await get('/auth/v1/user');
  if ([401, 403].includes(user.status)) return false;
  if (!user.ok) throw new Error('Supabase authentication is unavailable.');
  const { id } = await user.json();
  if (!id) return false;
  const membership = await get('/rest/v1/admin_users?' + new URLSearchParams({ select: 'user_id', user_id: 'eq.' + id }));
  if ([401, 403].includes(membership.status)) return false;
  if (!membership.ok) throw new Error('Supabase administrator verification is unavailable.');
  const rows = await membership.json();
  return Array.isArray(rows) && rows.length === 1 && rows[0].user_id === id;
}

async function reviewBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16000) throw Object.assign(new Error('Review selection is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Review selection is invalid.'), { status: 400 }); }
}

function sendJson(res, status, payload, head = false) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(head ? undefined : body);
}

function createServer(tracker = root, listenPort = port, request = fetch) {
  const authority = host + ':' + listenPort;
  const origin = 'http://' + authority;
  const store = reviewStore(tracker);
  const runtime = path.resolve(tracker, 'outputs');
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.host !== authority) return res.writeHead(403).end();

    try {
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return res.writeHead(400).end();
      const url = new URL(req.url, 'http://' + authority);
      if (url.pathname.startsWith(reviewPath)) {
        if (req.headers['x-trackside-review'] !== '1' ||
            (req.headers.origin && req.headers.origin !== origin)) return res.writeHead(403).end();
        const action = url.pathname.slice(reviewPath.length);
        if (action === 'latest' && ['GET', 'HEAD'].includes(req.method)) {
          const { report, attempt } = store.latest();
          return sendJson(res, 200, { ...report, attempt }, req.method === 'HEAD');
        }
        if (!['preview', 'apply'].includes(action) || req.method !== 'POST' ||
            req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
          return res.writeHead(403).end();
        }
        if (!await requireAdmin(tracker, req.headers.authorization, request)) {
          return sendJson(res, 403, { message: 'An active tracker administrator session is required.' });
        }
        const body = await reviewBody(req);
        if (action === 'preview') return sendJson(res, 200, store.preview(body));
        const { appliedLocally } = await store.apply(body);
        return sendJson(res, 200, { appliedLocally });
      }

      if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(403).end();
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return res.writeHead(404).end();
      const staticRoot = await fs.realpath(runtime);
      const file = await fs.realpath(path.resolve(staticRoot, '.' + (pathname === '/' ? '/index.html' : pathname)));
      if (!file.startsWith(staticRoot + path.sep)) return res.writeHead(404).end();
      const info = await fs.stat(file);
      if (!info.isFile()) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file);
      stream.on('error', error => res.destroy(error));
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy(error);
      if (req.url?.startsWith(reviewPath)) {
        return sendJson(res, error.status || 503, { message: error.status ? error.message :
          'The local review service could not complete the request. Check the tracker server and your connection, then try again.' });
      }
      res.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 500).end();
    }
  });
}

if (require.main === module) {
  createServer().listen(port, host, () => console.log('Trackside ATL local tracker at http://' + host + ':' + port + '/'));
}

module.exports = { createServer };

