const { createJob, getJob, cancelJob, resetFailed, hasRedis } = require('./job-store');
const { enqueueCode } = require('./search-queue');
const WORKER_CONCURRENCY = 3;

function assertConfigured() {
  if (process.env.VERCEL && !hasRedis()) {
    throw new Error('Search storage is not configured. Connect Vercel Redis before running live comparisons.');
  }
}

async function startSearch(params) {
  assertConfigured();
  const job = await createJob(params);
  await Promise.all(job.params.codes.slice(0, WORKER_CONCURRENCY).map((code, index) =>
    enqueueCode({ jobId: job.id, code, index })
  ));
  return job;
}

async function retryFailed(id) {
  assertConfigured();
  const { job, codes } = await resetFailed(id);
  const firstCode = codes[0];
  await enqueueCode({
    jobId: job.id,
    code: firstCode,
    index: job.params.codes.indexOf(firstCode),
    retryToken: `retry-${Date.now()}`,
  });
  return job;
}

module.exports = { startSearch, getJob, cancelJob, retryFailed, WORKER_CONCURRENCY };
