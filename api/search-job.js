const { getJobManager } = require('./_lib/jobs');
const { sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const jobId = String(req.query?.id || '').trim();
  if (!jobId) {
    sendJson(res, 400, { error: 'Search job id is required' });
    return;
  }

  const job = getJobManager().getJob(jobId);
  if (!job) {
    sendJson(res, 404, { error: 'Search job not found' });
    return;
  }

  sendJson(res, 200, job);
};
