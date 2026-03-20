const { getJobManager } = require('./_lib/jobs');
const { sendJson } = require('./_lib/http');

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
    const job = getJobManager().retryFailed(jobId);
    sendJson(res, 202, job);
  } catch (error) {
    const status = error.message && error.message.includes('not found') ? 404 : 400;
    sendJson(res, status, { error: error.message || 'Retry failed' });
  }
};
