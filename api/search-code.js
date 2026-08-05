const { MarriottApiRunner } = require('../v2/lib/marriott-api-runner');
const { readBody, sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const params = await readBody(req);
    if (!params.city || !params.checkIn || !params.checkOut || !params.code) {
      return sendJson(res, 400, { error: 'city, dates, and code are required' });
    }
    const runner = new MarriottApiRunner({ concurrency: 1 });
    const [result] = await runner.runSearch({ ...params, codes: [params.code] });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Marriott request failed' });
  }
};
