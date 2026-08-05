const { cancelJob } = require('./_lib/jobs');
const { sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const jobId = String(req.query?.id || '').trim();
  if (!jobId) return sendJson(res, 400, { error: 'Search job id is required' });
  try {
    sendJson(res, 200, await cancelJob(jobId));
  } catch (error) {
    sendJson(res, error.message?.includes('not found') ? 404 : 400, { error: error.message || 'Could not cancel search' });
  }
};
