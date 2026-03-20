const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_PRESETS, RECOMMENDED_CODES } = require('../../v2/lib/defaults');

const LEGACY_CODES_FILE = path.join(__dirname, '..', '..', 'marriott_corporate_codes.md');

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function parseCodesFile() {
  if (!fs.existsSync(LEGACY_CODES_FILE)) {
    return [];
  }

  const content = fs.readFileSync(LEGACY_CODES_FILE, 'utf8');
  const codes = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || line.includes('Code |')) {
      continue;
    }

    const parts = line
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length < 2) continue;

    const code = normalizeCode(parts[0]);
    if (!code) continue;

    codes.push({
      code,
      company: parts[1],
      recommended: RECOMMENDED_CODES.includes(code),
    });
  }

  return codes.sort((left, right) => {
    if (left.recommended !== right.recommended) {
      return Number(right.recommended) - Number(left.recommended);
    }
    return left.company.localeCompare(right.company) || left.code.localeCompare(right.code);
  });
}

let cachedCatalog = null;

function getCatalog() {
  if (cachedCatalog) return cachedCatalog;
  cachedCatalog = {
    codes: parseCodesFile(),
    presets: DEFAULT_PRESETS.map((preset) => ({ ...preset })),
  };
  return cachedCatalog;
}

module.exports = {
  getCatalog,
};
