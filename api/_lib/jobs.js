const { createJob, getJob, cancelJob, resetFailed, hasRedis } = require('./job-store');
const WORKER_CONCURRENCY = 4;

function assertConfigured() {
  if (process.env.VERCEL && !hasRedis()) {
    throw new Error('Search storage is not configured. Connect Vercel Redis before running live comparisons.');
  }
}

async function startSearch(params) {
  assertConfigured();
  return createJob(params);
}

async function retryFailed(id) {
  assertConfigured();
  const { job, codes } = await resetFailed(id);
  return job;
}

module.exports = { startSearch, getJob, cancelJob, retryFailed, WORKER_CONCURRENCY };
