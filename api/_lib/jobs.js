const { randomUUID } = require('node:crypto');
const { MarriottApiRunner, normalizeCode } = require('../../v2/lib/marriott-api-runner');
const { SearchJobManager } = require('../../v2/lib/search-jobs');

function getJobManager() {
  if (!globalThis.__ritzWeaseltonJobs) {
    globalThis.__ritzWeaseltonJobs = new SearchJobManager({ concurrency: 4 });
  }
  return globalThis.__ritzWeaseltonJobs;
}

async function runImmediateJob(params) {
  const codeOrder = Array.from(
    new Set((params.codes || []).map(normalizeCode).filter(Boolean))
  );

  const createdAt = new Date().toISOString();
  const runner = new MarriottApiRunner({ concurrency: 4 });
  const results = await runner.runSearch({
    ...params,
    codes: codeOrder,
  });
  const completedAt = new Date().toISOString();

  const failedCodes = results
    .filter((result) => !result.success && result.error !== 'NO_RESULTS')
    .map((result) => result.code);
  const successfulCodes = results.filter(
    (result) => result.success || result.error === 'NO_RESULTS'
  ).length;

  return {
    id: randomUUID(),
    status: 'completed',
    message: 'Complete',
    error: null,
    debug: false,
    createdAt,
    updatedAt: completedAt,
    completedAt,
    sourceJobId: null,
    params: {
      ...params,
      codes: codeOrder,
    },
    progress: {
      totalCodes: codeOrder.length,
      completedCodes: codeOrder.length,
      successfulCodes,
      failedCodes: failedCodes.length,
    },
    failedCodes,
    results,
  };
}

module.exports = {
  getJobManager,
  runImmediateJob,
};
