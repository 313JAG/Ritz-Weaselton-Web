const { startSearch } = require('./_lib/jobs');
const { readBody, sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    const { city, country, checkIn, checkOut, codes } = body || {};

    if (!city || !checkIn || !checkOut || !Array.isArray(codes) || codes.length === 0) {
      sendJson(res, 400, { error: 'city, checkIn, checkOut, and codes are required' });
      return;
    }

    const params = {
      city,
      country: country || '',
      checkIn,
      checkOut,
      codes,
    };

    const job = await startSearch(params);
    sendJson(res, 202, job);
  } catch (error) {
    sendJson(res, 400, { error: error.message || 'Request failed' });
  }
};
