const { randomUUID } = require('node:crypto');

const JOB_TTL_SECONDS = 24 * 60 * 60;
// Hotel payloads can be large. Upstash rejects a single MGET response above
// 10 MB, which previously made the browser look stuck near completion even
// while queued code checks were still running.
const RESULT_READ_BATCH_SIZE = 2;

function keyForJob(id) {
  return `ritz:search-job:${id}`;
}

function keyForResult(id, code) {
  return `${keyForJob(id)}:result:${encodeURIComponent(code)}`;
}

function keyForLock(id) {
  return `${keyForJob(id)}:lock`;
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

function fallback() {
  if (!globalThis.__ritzWeaseltonJobStore) globalThis.__ritzWeaseltonJobStore = new Map();
  return globalThis.__ritzWeaseltonJobStore;
}

async function command(parts) {
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

async function readJson(key) {
  if (!hasRedis()) return fallback().get(key) || null;
  const value = await command(['GET', key]);
  return value ? JSON.parse(value) : null;
}

async function readJsonMany(keys) {
  if (!keys.length) return [];
  if (!hasRedis()) return keys.map((key) => fallback().get(key) || null);
  const keyBatches = [];
  for (let index = 0; index < keys.length; index += RESULT_READ_BATCH_SIZE) {
    keyBatches.push(keys.slice(index, index + RESULT_READ_BATCH_SIZE));
  }
  // Each request stays below Upstash's response limit, while parallel reads
  // keep the progress endpoint well inside its function duration.
  const batches = await Promise.all(keyBatches.map((batch) => command(['MGET', ...batch])));
  const values = batches.flatMap((batch) => batch || []);
  return values.map((value) => value ? JSON.parse(value) : null);
}

async function writeJson(key, value, ttl = JOB_TTL_SECONDS) {
  if (!hasRedis()) {
    fallback().set(key, value);
    return;
  }
  await command(['SET', key, JSON.stringify(value), 'EX', String(ttl)]);
}

function normalizeCodes(codes) {
  return [...new Set((codes || []).map((code) => String(code || '').trim().toUpperCase()).filter(Boolean))];
}

function serialize(job, resultEntries) {
  const results = job.codeOrder
    .map((code) => resultEntries.get(code))
    .filter(Boolean);
  const failedCodes = job.codeOrder.filter((code) => job.codeStates[code]?.status === 'failed');
  const completedCodes = job.codeOrder.filter((code) => {
    const status = job.codeStates[code]?.status;
    return status === 'completed' || status === 'failed';
  }).length;
  const successfulCodes = job.codeOrder.filter((code) => job.codeStates[code]?.status === 'completed').length;

  return {
    id: job.id,
    status: job.status,
    message: job.message,
    error: job.error || null,
    debug: false,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null,
    sourceJobId: null,
    params: job.params,
    progress: {
      totalCodes: job.codeOrder.length,
      completedCodes,
      successfulCodes,
      failedCodes: failedCodes.length,
      runningCodes: job.codeOrder.filter((code) => job.codeStates[code]?.status === 'running'),
      queuedCodes: job.codeOrder.filter((code) => job.codeStates[code]?.status === 'queued').length,
      workerLimit: job.workerLimit || 1,
    },
    failedCodes,
    codeStates: job.codeStates,
    results,
  };
}

async function hydrate(job) {
  const completedCodes = job.codeOrder.filter((code) => ['completed', 'failed'].includes(job.codeStates[code]?.status));
  const values = await readJsonMany(completedCodes.map((code) => keyForResult(job.id, code)));
  const resultEntries = new Map(completedCodes.map((code, index) => [code, values[index]]).filter(([, value]) => Boolean(value)));
  return serialize(job, resultEntries);
}

async function createJob(params) {
  const codeOrder = normalizeCodes(params.codes);
  const now = new Date().toISOString();
  const id = randomUUID();
  const job = {
    id,
    status: 'queued',
    message: 'Queued',
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    params: { ...params, codes: codeOrder },
    workerLimit: 1,
    codeOrder,
    codeStates: Object.fromEntries(codeOrder.map((code) => [code, { status: 'queued', attempts: 0, error: null }])),
  };
  await writeJson(keyForJob(id), job);
  return hydrate(job);
}

async function getJob(id) {
  const job = await readJson(keyForJob(id));
  return job ? hydrate(job) : null;
}

async function getJobRecord(id) {
  return readJson(keyForJob(id));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withJobLock(id, action) {
  // Queue deliveries for a job run in parallel. A small Redis lock keeps the
  // read-modify-write job record atomic so one code cannot erase another
  // code's status update. The result payloads themselves remain independent.
  if (!hasRedis()) return action();

  const lockKey = keyForLock(id);
  const token = randomUUID();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const acquired = await command(['SET', lockKey, token, 'NX', 'PX', '10000']);
    if (acquired === 'OK') {
      try {
        return await action();
      } finally {
        // Only delete our own lock; a timed-out lock may have been replaced.
        await command(['EVAL', "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", '1', lockKey, token]);
      }
    }
    await wait(25 + Math.floor(Math.random() * 50));
  }
  throw new Error('Search job is busy. Please retry.');
}

async function updateJob(id, updater) {
  return withJobLock(id, async () => {
    const job = await readJson(keyForJob(id));
    if (!job) throw new Error('Search job not found');
    const next = updater(job) || job;
    next.updatedAt = new Date().toISOString();
    await writeJson(keyForJob(id), next);
    return next;
  });
}

async function markRunning(id, code, attempts) {
  return updateJob(id, (job) => {
    if (job.status === 'cancelled' || job.codeStates[code]?.status === 'completed') return job;
    job.status = 'running';
    job.message = `Checking ${code}`;
    job.codeStates[code] = { status: 'running', attempts, error: null };
    return job;
  });
}

async function claimNextCode(id) {
  let claimed = null;
  await updateJob(id, (job) => {
    if (job.status === 'cancelled' || job.status === 'completed') return job;
    const code = job.codeOrder.find((value) => job.codeStates[value]?.status === 'queued');
    if (!code) return job;
    const attempts = (job.codeStates[code]?.attempts || 0) + 1;
    job.status = 'running';
    job.message = `Checking ${code}`;
    job.codeStates[code] = { status: 'running', attempts, error: null };
    claimed = { id: job.id, code, attempts, params: { ...job.params, codes: [code] } };
    return job;
  });
  return claimed;
}

async function storeResult(id, result) {
  await writeJson(keyForResult(id, result.code), result);
  return updateJob(id, (job) => {
    if (job.status === 'cancelled') return job;
    const failed = !result.success && result.error !== 'NO_RESULTS';
    job.codeStates[result.code] = {
      status: failed ? 'failed' : 'completed',
      attempts: job.codeStates[result.code]?.attempts || 1,
      error: failed ? result.error || 'Unknown error' : null,
    };
    const hasActive = job.codeOrder.some((code) => ['queued', 'running'].includes(job.codeStates[code]?.status));
    if (!hasActive) {
      job.status = 'completed';
      job.message = 'Complete';
      job.completedAt = new Date().toISOString();
    } else {
      job.status = 'running';
      job.message = failed ? `${result.code} failed` : `Processed ${result.code}`;
    }
    return job;
  });
}

async function cancelJob(id) {
  const job = await updateJob(id, (value) => {
    if (value.status === 'completed') return value;
    value.status = 'cancelled';
    value.message = 'Cancelled';
    value.completedAt = new Date().toISOString();
    return value;
  });
  return hydrate(job);
}

async function resetFailed(id) {
  const job = await updateJob(id, (value) => {
    const failed = value.codeOrder.filter((code) => value.codeStates[code]?.status === 'failed');
    if (!failed.length) throw new Error('This search has no failed codes to retry');
    for (const code of failed) value.codeStates[code] = { status: 'queued', attempts: 0, error: null };
    value.status = 'queued';
    value.message = `Retrying ${failed.length} failed codes`;
    value.completedAt = null;
    return value;
  });
  return { job: await hydrate(job), codes: job.codeOrder.filter((code) => job.codeStates[code]?.status === 'queued') };
}

module.exports = {
  JOB_TTL_SECONDS,
  createJob,
  getJob,
  getJobRecord,
  claimNextCode,
  markRunning,
  storeResult,
  cancelJob,
  resetFailed,
  hasRedis,
  readJsonMany,
};
