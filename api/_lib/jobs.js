const { createJob, getJob, cancelJob, resetFailed, hasRedis } = require('./job-store');
const { enqueueCode } = require('./search-queue');
// The queue transport is deliberately started in a small pool. Sending a
// large burst from the request handler can exhaust its 60-second budget
// before a job ID reaches the browser; workers keep this pool full after the
// immediate response.
const WORKER_CONCURRENCY = 1;

function assertConfigured() {
  if (process.env.VERCEL && !hasRedis()) {
    throw new Error('Search storage is not configured. Connect Vercel Redis before running live comparisons.');
  }
}

async function startSearch(params) {
  assertConfigured();
  const job = await createJob(params);
  // Queue one durable first task only. This keeps the browser-facing request
  // independent of a large queue publish burst; each worker queues the next
  // pending code after it records its result.
  await enqueueCode({ jobId: job.id, code: job.params.codes[0], index: 0 });
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
