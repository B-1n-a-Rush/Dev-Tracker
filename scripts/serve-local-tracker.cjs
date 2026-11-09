const http = require('node:http');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = 4208;
const latest = '/__trackside/infrastructure/latest';
const types = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function createServer(tracker = root, listenPort = port) {
  const authority = host + ':' + listenPort;
  const report = path.join(tracker, 'work', 'infrastructure-refresh', 'latest.json');
  const runtime = path.resolve(tracker, 'outputs');
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.host !== authority || !['GET', 'HEAD'].includes(req.method)) return res.writeHead(403).end();

    try {
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return res.writeHead(400).end();
      const url = new URL(req.url, 'http://' + authority);
      if (url.pathname === latest) {
        // The loopback server only exports review summaries from public source data.
        if (req.headers['x-trackside-review'] !== '1' ||
            (req.headers.origin && req.headers.origin !== 'http://' + authority)) return res.writeHead(403).end();
        const { version, source, reportId, baselineAt, checkedAt, sourceUpdated, records, changes } =
          JSON.parse(await fs.readFile(report, 'utf8'));
        const summary = JSON.stringify({ version, source, reportId, baselineAt, checkedAt, sourceUpdated, records, changes });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(summary) });
        return res.end(req.method === 'HEAD' ? undefined : summary);
      }

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
      res.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 500).end();
    }
  });
}

if (require.main === module) {
  createServer().listen(port, host, () => console.log('Trackside ATL local tracker at http://' + host + ':' + port + '/'));
}

module.exports = { createServer };

