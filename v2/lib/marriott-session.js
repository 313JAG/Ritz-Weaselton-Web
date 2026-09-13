const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Proxy } = require('http-mitm-proxy');

const SESSION_TTL_MS = 12 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.ceil(SESSION_TTL_MS / 1000);
const BOOTSTRAP_TIMEOUT_MS = 90000;
const VIRTUAL_TIME_BUDGET_MS = 40000;
const GRAPHQL_PATH = '/mi/query/phoenixShopDatedSearchByDestinationQuery';
const SESSION_REDIS_KEY = 'ritz:marriott-session';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

function sessionStore() {
  if (!globalThis.__ritzMarriottSession) {
    globalThis.__ritzMarriottSession = { value: null, bootstrapping: null };
  }
  return globalThis.__ritzMarriottSession;
}

function redisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || '';
}

function redisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || '';
}

function hasRedis() {
  return Boolean(redisUrl() && redisToken());
}

async function redisCommand(parts) {
  if (!hasRedis()) return null;
  const response = await fetch(`${redisUrl().replace(/\/$/, '')}/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parts),
  });
  if (!response.ok) throw new Error(`Redis request failed (${response.status})`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

async function readSharedSession() {
  if (!hasRedis()) return null;
  const value = await redisCommand(['GET', SESSION_REDIS_KEY]);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.cookie && parsed.expiresAt > Date.now()) return parsed;
  } catch {}
  return null;
}

async function writeSharedSession(session) {
  if (!hasRedis()) return;
  await redisCommand(['SET', SESSION_REDIS_KEY, JSON.stringify(session), 'EX', String(SESSION_TTL_SECONDS)]);
}

async function clearSharedSession() {
  if (!hasRedis()) return;
  await redisCommand(['DEL', SESSION_REDIS_KEY]);
}

function formatDateForUrl(dateStr) {
  const [year, month, day] = String(dateStr).split('-');
  return `${month}/${day}/${year}`;
}

function buildBootstrapUrl(params = {}) {
  const checkIn = params.checkIn || futureDate(14);
  const checkOut = params.checkOut || futureDate(15);
  const city = params.city || 'Detroit';
  const country = params.country || 'US';
  const [inYear, inMonth, inDay] = checkIn.split('-').map(Number);
  const [outYear, outMonth, outDay] = checkOut.split('-').map(Number);
  const nights = Math.max(
    1,
    Math.ceil(
      (new Date(outYear, outMonth - 1, outDay) - new Date(inYear, inMonth - 1, inDay)) /
        (1000 * 60 * 60 * 24)
    )
  );
  let url = `https://www.marriott.com/search/findHotels.mi?fromDate=${formatDateForUrl(checkIn)}&toDate=${formatDateForUrl(checkOut)}&lengthOfStay=${nights}&destinationAddress.city=${encodeURIComponent(city)}`;
  if (country) url += `&destinationAddress.country=${encodeURIComponent(country)}`;
  url += '&view=list&deviceType=desktop-web';
  return url;
}

function futureDate(offsetDays) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function findLocalChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function resolveChromePath() {
  // On Vercel, always use the packaged Chromium binary.
  if (!process.env.VERCEL) {
    const local = findLocalChrome();
    if (local) return { executablePath: local, args: [] };
  }
  const chromium = require('@sparticuz/chromium');
  if (typeof chromium.setGraphicsMode === 'function') {
    chromium.setGraphicsMode(false);
  }
  const rawArgs = Array.isArray(chromium.args) ? chromium.args : [];
  // Drop packaged headless flags; we always pass --headless=new ourselves.
  const args = rawArgs.filter((arg) => !String(arg).startsWith('--headless'));
  return {
    executablePath: await chromium.executablePath(),
    args,
  };
}

function startMitmProxy() {
  return new Promise((resolve, reject) => {
    const proxy = new Proxy();
    const sslCaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritz-mitm-ca-'));
    let captured = null;

    proxy.onError(() => {});
    proxy.onRequest((ctx, callback) => {
      const req = ctx.clientToProxyRequest;
      const host = req.headers.host || '';
      if (host.includes('marriott.com') && (req.url || '').includes(GRAPHQL_PATH) && req.method === 'POST') {
        const cookie = req.headers.cookie || '';
        if (cookie.includes('_abck') || cookie.includes('bm_sz')) {
          captured = {
            cookie,
            userAgent: req.headers['user-agent'] || DEFAULT_USER_AGENT,
            capturedAt: Date.now(),
          };
        }
      }
      return callback();
    });

    proxy.listen({ port: 0, host: '127.0.0.1', sslCaDir, silent: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        port: proxy.httpPort,
        getCaptured: () => captured,
        close: () =>
          new Promise((closeResolve) => {
            try {
              proxy.close();
            } catch {}
            fs.rmSync(sslCaDir, { recursive: true, force: true });
            closeResolve();
          }),
      });
    });
  });
}

function runChromeDump({ executablePath, chromeArgs, proxyPort, userDataDir, url }) {
  return new Promise((resolve) => {
    const args = [
      ...chromeArgs,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--user-data-dir=${userDataDir}`,
      '--disable-blink-features=AutomationControlled',
      `--proxy-server=127.0.0.1:${proxyPort}`,
      // Keep Google/CDN chatter off the MITM path so bootstrap stays fast.
      '--proxy-bypass-list=<-loopback>;*.google.com;*.googleapis.com;*.gstatic.com;*.googleadservices.com;*.doubleclick.net;*.facebook.net;*.facebook.com;*.youtube.com;*.ytimg.com;*.adobedtm.com;*.demdex.net;*.branch.io;*.cloudfront.net;*.googletagmanager.com',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--allow-insecure-localhost',
      `--virtual-time-budget=${VIRTUAL_TIME_BUDGET_MS}`,
      '--dump-dom',
      url,
    ];

    const child = spawn(executablePath, args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, HOME: userDataDir },
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ timedOut: true });
    }, BOOTSTRAP_TIMEOUT_MS);

    child.on('exit', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ timedOut: false });
    });
  });
}

async function bootstrapSession(params = {}) {
  const { executablePath, args: chromeArgs } = await resolveChromePath();
  const mitm = await startMitmProxy();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritz-chrome-'));
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    await runChromeDump({
      executablePath,
      chromeArgs,
      proxyPort: mitm.port,
      userDataDir,
      url: buildBootstrapUrl(params),
    });
    const captured = mitm.getCaptured();
    if (!captured?.cookie) {
      throw new Error('Could not establish a Marriott browsing session');
    }
    const session = {
      cookie: captured.cookie,
      userAgent: captured.userAgent || DEFAULT_USER_AGENT,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    await writeSharedSession(session);
    return session;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    await mitm.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function getMarriottSession(params = {}, { forceRefresh = false } = {}) {
  const store = sessionStore();
  if (!forceRefresh && store.value && store.value.expiresAt > Date.now()) {
    return store.value;
  }

  if (!forceRefresh) {
    const shared = await readSharedSession();
    if (shared) {
      store.value = shared;
      return shared;
    }
  }

  if (store.bootstrapping) return store.bootstrapping;

  store.bootstrapping = bootstrapSession(params)
    .then((session) => {
      store.value = session;
      return session;
    })
    .finally(() => {
      store.bootstrapping = null;
    });

  return store.bootstrapping;
}

async function invalidateMarriottSession() {
  const store = sessionStore();
  store.value = null;
  await clearSharedSession();
}

module.exports = {
  getMarriottSession,
  invalidateMarriottSession,
  buildBootstrapUrl,
};
