const { getCatalog } = require('./_lib/catalog')
const { sendJson } = require('./_lib/http')
const { DEFAULT_RATE_PREFERENCES, RATE_CODE_GROUPS } = require('../v2/lib/defaults')

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const catalog = getCatalog()
  sendJson(res, 200, {
    codes: catalog.codes,
    presets: catalog.presets,
    rateGroups: RATE_CODE_GROUPS,
    ratePreferences: DEFAULT_RATE_PREFERENCES,
  })
}
