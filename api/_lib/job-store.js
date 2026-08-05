const { randomUUID } = require('node:crypto');

const JOB_TTL_SECONDS = 24 * 60 * 60;

function keyForJob(id) {
  return `ritz:search-job:${id}`;
}

function keyForResult(id, code) {
  return `${keyForJob(id)}:result:${encodeURIComponent(code)}`;
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
    },
    failedCodes,
    results,
  };
}

async function hydrate(job) {
  const resultEntries = new Map();
  for (const code of job.codeOrder) {
    const state = job.codeStates[code];
    if (state?.status === 'completed' || state?.status === 'failed') {
      const value = await readJson(keyForResult(job.id, code));
      if (value) resultEntries.set(code, value);
    }
  }
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

async function updateJob(id, updater) {
  const job = await readJson(keyForJob(id));
  if (!job) throw new Error('Search job not found');
  const next = updater(job) || job;
  next.updatedAt = new Date().toISOString();
  await writeJson(keyForJob(id), next);
  return next;
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
  markRunning,
  storeResult,
  cancelJob,
  resetFailed,
  hasRedis,
};
