const { MarriottApiRunner } = require('../../v2/lib/marriott-api-runner');
const { getJobRecord, markRunning, storeResult } = require('./job-store');
const { enqueueCode } = require('./search-queue');

const MAX_ATTEMPTS = 3;
const WORKER_CONCURRENCY = 1;
const TRANSIENT_ERRORS = new Set(['TIMEOUT', 'NETWORK_ERROR']);

function shouldRetry(result, attempts) {
  return !result.success && TRANSIENT_ERRORS.has(result.error) && attempts < MAX_ATTEMPTS;
}

async function enqueueNext(job, currentIndex) {
  const nextIndex = job.codeOrder.findIndex((code) => job.codeStates[code]?.status === 'queued');
  const nextCode = job.codeOrder[nextIndex];
  if (!nextCode) return;
  await enqueueCode({ jobId: job.id, code: nextCode, index: nextIndex });
}

async function processSearchCodeMessage(message, metadata = {}) {
  const job = await getJobRecord(message.jobId);
  if (!job || job.status === 'cancelled' || job.status === 'completed') return;
  const current = job.params.codes[message.index];
  if (!current || current !== message.code || !['queued', 'running'].includes(job.codeStates[current]?.status)) {
    return;
  }

  const attempts = Number(metadata.deliveryCount || 1);
  await markRunning(job.id, current, attempts);
  const runner = new MarriottApiRunner({ concurrency: 1 });
  const [result] = await runner.runSearch({ ...job.params, codes: [current] });

  if (shouldRetry(result, attempts)) {
    throw new Error(result.error);
  }

  const stored = await storeResult(job.id, result);
  if (stored.status !== 'cancelled') {
    await enqueueNext(stored, message.index);
  }
}

module.exports = { MAX_ATTEMPTS, processSearchCodeMessage, shouldRetry };
