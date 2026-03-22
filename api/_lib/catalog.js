const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_PRESETS, RECOMMENDED_CODES } = require('../../v2/lib/defaults');

const LEGACY_CODES_FILE = path.join(__dirname, '..', '..', 'marriott_corporate_codes.md');

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitTableRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((part) => part.trim());
}

function isTableSeparator(line) {
  return /^\|\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?$/.test(line.trim());
}

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseMarkdownRow(headers, cells) {
  const row = {};
  headers.forEach((header, index) => {
    row[header] = cells[index] || '';
  });
  return row;
}

function buildCodeEntry(row, category) {
  const code = normalizeCode(row.code);
  if (!code) return null;

  const company =
    row.company ||
    row.university ||
    row.name ||
    row.status ||
    'Unknown';

  return {
    code,
    company,
    category,
    recommended: RECOMMENDED_CODES.includes(code),
  };
}

function categoryPreset(category, codes) {
  return {
    id: slugify(category),
    name: category,
    icon: 'folder',
    codes: [...codes],
    isDefault: false,
  };
}

function dedupePresets(presets) {
  const seen = new Set();
  return presets.filter((preset) => {
    if (seen.has(preset.id)) return false;
    seen.add(preset.id);
    return true;
  });
}

const HIDDEN_DERIVED_CATEGORIES = new Set([
  'Public / Membership Codes (No Corporate Affiliation Needed)',
  'Marriott Internal / Employee Codes',
  'Promo & Package Codes (From FlyerTalk Wiki)',
]);

function parseCodesFile() {
  if (!fs.existsSync(LEGACY_CODES_FILE)) {
    return { codes: [], presets: DEFAULT_PRESETS.map((preset) => ({ ...preset })) };
  }

  const content = fs.readFileSync(LEGACY_CODES_FILE, 'utf8');
  const lines = content.split(/\r?\n/);
  const codesByCode = new Map();
  const categoryCodes = new Map();
  let currentH2 = '';
  let currentH3 = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (line.startsWith('## ')) {
      currentH2 = line.replace(/^##\s+/, '').trim();
      currentH3 = '';
      continue;
    }

    if (line.startsWith('### ')) {
      currentH3 = line.replace(/^###\s+/, '').trim();
      continue;
    }

    if (!line.startsWith('|') || !isTableSeparator(lines[index + 1] || '')) {
      continue;
    }

    const headers = splitTableRow(line).map(normalizeHeader);
    index += 2;

    while (index < lines.length) {
      const rowLine = lines[index].trim();
      if (!rowLine.startsWith('|') || isTableSeparator(rowLine)) {
        index -= 1;
        break;
      }

      const row = parseMarkdownRow(headers, splitTableRow(rowLine));

      if (currentH2.includes('All Codes')) {
        const entry = buildCodeEntry(row, currentH3);
        if (entry && !codesByCode.has(entry.code)) {
          codesByCode.set(entry.code, entry);
          if (!categoryCodes.has(currentH3)) {
            categoryCodes.set(currentH3, []);
          }
          categoryCodes.get(currentH3).push(entry.code);
        }
      }

      index += 1;
    }
  }

  const codes = [...codesByCode.values()].sort((left, right) => {
    if (left.recommended !== right.recommended) {
      return Number(right.recommended) - Number(left.recommended);
    }
    return left.company.localeCompare(right.company) || left.code.localeCompare(right.code);
  });

  const derivedCategoryPresets = [...categoryCodes.entries()]
    .filter(([category, codesForCategory]) => codesForCategory.length > 0 && !HIDDEN_DERIVED_CATEGORIES.has(category))
    .map(([category, codesForCategory]) => categoryPreset(category, codesForCategory));

  return {
    codes,
    presets: dedupePresets([
      ...DEFAULT_PRESETS.map((preset) => ({ ...preset })),
      ...derivedCategoryPresets,
    ]),
  };
}

let cachedCatalog = null;

function getCatalog() {
  if (cachedCatalog) return cachedCatalog;
  cachedCatalog = parseCodesFile();
  return cachedCatalog;
}

module.exports = {
  getCatalog,
};
