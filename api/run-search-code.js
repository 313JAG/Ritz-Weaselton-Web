const { MarriottApiRunner } = require('../v2/lib/marriott-api-runner');
const { claimNextCode, getJob, storeResult } = require('./_lib/job-store');
const { sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const jobId = String(req.query?.id || '').trim();
  if (!jobId) return sendJson(res, 400, { error: 'Search job id is required' });

  try {
    const claimed = await claimNextCode(jobId);
    if (!claimed) return sendJson(res, 200, await getJob(jobId));
    const runner = new MarriottApiRunner({ concurrency: 1 });
    const [result] = await runner.runSearch(claimed.params);
    const job = await storeResult(claimed.id, result);
    sendJson(res, 200, job);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Could not process search code' });
  }
};
