const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { URL } = require('node:url');

const ROOT = __dirname;
loadLocalEnv();

const STATIC_ROOT = fs.existsSync(path.join(ROOT, 'dist')) ? path.join(ROOT, 'dist') : ROOT;
const PORT = Number(process.env.PORT || 3001);

const routes = {
  '/api/apple-maps-token': require('./api/apple-maps-token'),
  '/api/bootstrap': require('./api/bootstrap'),
  '/api/search-jobs': require('./api/search-jobs'),
};

const dynamicRouteMatchers = [
  {
    match: (pathname) => pathname.match(/^\/api\/search-jobs\/([^/]+)$/),
    load: () => require('./api/search-job'),
    queryFromMatch: (match) => ({ id: match[1] }),
  },
  {
    match: (pathname) => pathname.match(/^\/api\/search-jobs\/([^/]+)\/retry-failed$/),
    load: () => require('./api/retry-failed'),
    queryFromMatch: (match) => ({ id: match[1] }),
  },
];

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const LEGACY_PATHS = new Set(['/settings', '/settings.html', '/logos.html']);

function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;

  const source = fs.readFileSync(envPath, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveStaticPath(pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const requested = cleanPath.endsWith('/') ? `${cleanPath}index.html` : cleanPath;
  const candidates = [requested];

  if (!path.extname(requested)) {
    candidates.push(`${requested}.html`);
  }

  for (const candidate of candidates) {
    const resolved = path.normalize(path.join(STATIC_ROOT, candidate));
    if (!resolved.startsWith(STATIC_ROOT)) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (LEGACY_PATHS.has(pathname)) {
    res.statusCode = 302;
    res.setHeader('Location', '/');
    res.end();
    return;
  }

  if (routes[pathname]) {
    req.query = Object.fromEntries(url.searchParams.entries());
    return routes[pathname](req, res);
  }

  for (const matcher of dynamicRouteMatchers) {
    const match = matcher.match(pathname);
    if (!match) continue;
    req.query = matcher.queryFromMatch(match);
    return matcher.load()(req, res);
  }

  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    if (!pathname.startsWith('/api/')) {
      const indexPath = path.join(STATIC_ROOT, 'index.html');
      res.setHeader('Content-Type', MIME_TYPES['.html']);
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Ritz-Weaselton hosted server at http://localhost:${PORT}`);
});
