const { getCatalog } = require('./_lib/catalog');
const { sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const catalog = getCatalog();
  sendJson(res, 200, {
    codes: catalog.codes,
    presets: catalog.presets,
  });
};
