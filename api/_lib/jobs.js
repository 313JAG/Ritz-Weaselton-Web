const { createJob, getJob, cancelJob, resetFailed, hasRedis } = require('./job-store');
const { enqueueCode } = require('./search-queue');

function assertConfigured() {
  if (process.env.VERCEL && !hasRedis()) {
    throw new Error('Search storage is not configured. Connect Vercel Redis before running live comparisons.');
  }
}

async function startSearch(params) {
  assertConfigured();
  const job = await createJob(params);
  const firstCode = job.params.codes[0];
  await enqueueCode({ jobId: job.id, code: firstCode, index: 0 });
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

module.exports = { startSearch, getJob, cancelJob, retryFailed };
