const { getJobManager, runImmediateJob } = require('./_lib/jobs');
const { readBody, sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const jobId = String(req.query?.id || '').trim();
  if (!jobId) {
    sendJson(res, 400, { error: 'Search job id is required' });
    return;
  }

  try {
    if (process.env.VERCEL) {
      const body = await readBody(req).catch(() => ({}));
      const params = body?.params || null;
      const baseResults = Array.isArray(body?.baseResults) ? body.baseResults : [];

      if (!params || !Array.isArray(params.codes) || !params.codes.length) {
        sendJson(res, 400, { error: 'Retry parameters are required' });
        return;
      }

      const retried = await runImmediateJob(params);
      const mergedResults = [...baseResults, ...retried.results];
      const failedCodes = mergedResults
        .filter((result) => !result.success && result.error !== 'NO_RESULTS')
        .map((result) => result.code);
      const successfulCodes = mergedResults.filter(
        (result) => result.success || result.error === 'NO_RESULTS'
      ).length;

      sendJson(res, 200, {
        ...retried,
        progress: {
          totalCodes: mergedResults.length,
          completedCodes: mergedResults.length,
          successfulCodes,
          failedCodes: failedCodes.length,
        },
        failedCodes,
        results: mergedResults,
      });
      return;
    }

    const job = getJobManager().retryFailed(jobId);
    sendJson(res, 202, job);
  } catch (error) {
    const status = error.message && error.message.includes('not found') ? 404 : 400;
    sendJson(res, status, { error: error.message || 'Retry failed' });
  }
};
