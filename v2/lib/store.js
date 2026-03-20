const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DEFAULT_PRESETS, RECOMMENDED_CODES } = require('./defaults');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'ritzweazelton.sqlite');
const LEGACY_CODES_FILE = path.join(__dirname, '..', '..', 'marriott_corporate_codes.md');

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serialize(value) {
  return JSON.stringify(value ?? null);
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function parseLegacyCodesFile() {
  if (!fs.existsSync(LEGACY_CODES_FILE)) {
    return [];
  }

  const content = fs.readFileSync(LEGACY_CODES_FILE, 'utf8');
  const lines = content.split('\n');
  const codes = [];

  for (const line of lines) {
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
      favorite: parts[2] === '⭐' || parts[2] === 'true',
      recommended: RECOMMENDED_CODES.includes(code),
    });
  }

  return codes;
}

class RitzStore {
  constructor() {
    ensureDirectory(DATA_DIR);
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.initSchema();
    this.seedInitialData();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS codes (
        code TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        recommended INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'bolt',
        codes_json TEXT NOT NULL DEFAULT '[]',
        is_default INTEGER NOT NULL DEFAULT 0,
        dynamic TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS search_history (
        id TEXT PRIMARY KEY,
        cache_key TEXT NOT NULL,
        params_json TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        results_json TEXT NOT NULL,
        reused_cache INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_search_history_created_at
      ON search_history (created_at DESC);
    `);
  }

  seedInitialData() {
    const existingCount = this.db.prepare('SELECT COUNT(*) AS count FROM codes').get().count;
    if (existingCount === 0) {
      const imported = parseLegacyCodesFile();
      const insertCode = this.db.prepare(`
        INSERT INTO codes (code, company, favorite, recommended, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const timestamp = nowIso();

      this.db.exec('BEGIN');
      try {
        for (const code of imported) {
          insertCode.run(
            code.code,
            code.company,
            code.favorite ? 1 : 0,
            code.recommended ? 1 : 0,
            timestamp,
            timestamp
          );
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    for (const preset of DEFAULT_PRESETS) {
      this.upsertPreset({
        ...preset,
        isDefault: true,
      });
    }

    if (!this.readState('enabledCodes')) {
      this.writeState('enabledCodes', this.getRecommendedCodes());
    }
    if (!this.readState('currency')) {
      this.writeState('currency', 'AUD');
    }
    if (!this.readState('setupNoticeDismissed')) {
      this.writeState('setupNoticeDismissed', false);
    }
    if (!this.readState('clientStateMigrated')) {
      this.writeState('clientStateMigrated', false);
    }
  }

  readState(key, fallback = null) {
    const row = this.db.prepare('SELECT value_json FROM app_state WHERE key = ?').get(key);
    return row ? safeJsonParse(row.value_json, fallback) : fallback;
  }

  writeState(key, value) {
    this.db
      .prepare(`
        INSERT INTO app_state (key, value_json)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
      `)
      .run(key, serialize(value));
  }

  getRecommendedCodes() {
    return this.db
      .prepare('SELECT code FROM codes WHERE recommended = 1 ORDER BY code ASC')
      .all()
      .map((row) => row.code);
  }

  getCodes() {
    return this.db
      .prepare(`
        SELECT code, company, favorite, recommended
        FROM codes
        ORDER BY favorite DESC, recommended DESC, company ASC, code ASC
      `)
      .all()
      .map((row) => ({
        code: row.code,
        company: row.company,
        favorite: Boolean(row.favorite),
        recommended: Boolean(row.recommended),
      }));
  }

  getCode(code) {
    const normalized = normalizeCode(code);
    if (!normalized) return null;
    const row = this.db
      .prepare('SELECT code, company, favorite, recommended FROM codes WHERE code = ?')
      .get(normalized);
    if (!row) return null;
    return {
      code: row.code,
      company: row.company,
      favorite: Boolean(row.favorite),
      recommended: Boolean(row.recommended),
    };
  }

  createCode({ code, company, favorite = false, recommended = false }) {
    const normalizedCode = normalizeCode(code);
    const normalizedCompany = String(company || '').trim();
    if (!normalizedCode || !normalizedCompany) {
      throw new Error('Code and company are required');
    }
    if (this.getCode(normalizedCode)) {
      throw new Error('Code already exists');
    }

    const timestamp = nowIso();
    this.db
      .prepare(`
        INSERT INTO codes (code, company, favorite, recommended, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalizedCode,
        normalizedCompany,
        favorite ? 1 : 0,
        recommended ? 1 : 0,
        timestamp,
        timestamp
      );
    return this.getCode(normalizedCode);
  }

  updateCode(oldCode, { code, company }) {
    const previous = normalizeCode(oldCode);
    const nextCode = normalizeCode(code);
    const nextCompany = String(company || '').trim();
    if (!nextCode || !nextCompany) {
      throw new Error('Code and company are required');
    }

    const existing = this.getCode(previous);
    if (!existing) {
      throw new Error('Code not found');
    }

    if (previous !== nextCode && this.getCode(nextCode)) {
      throw new Error('New code already exists');
    }

    this.db
      .prepare(`
        UPDATE codes
        SET code = ?, company = ?, updated_at = ?
        WHERE code = ?
      `)
      .run(nextCode, nextCompany, nowIso(), previous);

    const enabledCodes = this.readState('enabledCodes', []);
    if (Array.isArray(enabledCodes) && enabledCodes.includes(previous)) {
      this.writeState(
        'enabledCodes',
        enabledCodes.map((value) => (value === previous ? nextCode : value))
      );
    }

    const presets = this.getPresets();
    for (const preset of presets) {
      if (!preset.codes.includes(previous)) continue;
      const nextCodes = preset.codes.map((value) => (value === previous ? nextCode : value));
      this.upsertPreset({
        ...preset,
        codes: nextCodes,
      });
    }

    return this.getCode(nextCode);
  }

  deleteCode(code) {
    const normalized = normalizeCode(code);
    const existing = this.getCode(normalized);
    if (!existing) {
      throw new Error('Code not found');
    }

    this.db.prepare('DELETE FROM codes WHERE code = ?').run(normalized);

    const enabledCodes = this.readState('enabledCodes', []);
    if (Array.isArray(enabledCodes) && enabledCodes.includes(normalized)) {
      this.writeState(
        'enabledCodes',
        enabledCodes.filter((value) => value !== normalized)
      );
    }

    for (const preset of this.getPresets()) {
      if (!preset.codes.includes(normalized)) continue;
      this.upsertPreset({
        ...preset,
        codes: preset.codes.filter((value) => value !== normalized),
      });
    }
  }

  setFavorite(code, favorite) {
    const normalized = normalizeCode(code);
    if (!this.getCode(normalized)) {
      throw new Error('Code not found');
    }
    this.db
      .prepare('UPDATE codes SET favorite = ?, updated_at = ? WHERE code = ?')
      .run(favorite ? 1 : 0, nowIso(), normalized);
    return this.getCode(normalized);
  }

  getPresets() {
    return this.db
      .prepare(`
        SELECT id, name, icon, codes_json, is_default, dynamic
        FROM presets
        ORDER BY is_default DESC, created_at ASC, name ASC
      `)
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        codes: safeJsonParse(row.codes_json, []),
        isDefault: Boolean(row.is_default),
        dynamic: row.dynamic || null,
      }));
  }

  upsertPreset({ id, name, icon = 'bolt', codes = [], isDefault = false, dynamic = null }) {
    if (!id || !name) {
      throw new Error('Preset id and name are required');
    }

    const timestamp = nowIso();
    const sanitizedCodes = Array.from(
      new Set((Array.isArray(codes) ? codes : []).map(normalizeCode).filter(Boolean))
    );

    this.db
      .prepare(`
        INSERT INTO presets (id, name, icon, codes_json, is_default, dynamic, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          icon = excluded.icon,
          codes_json = excluded.codes_json,
          is_default = excluded.is_default,
          dynamic = excluded.dynamic,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        String(name).trim(),
        icon || 'bolt',
        serialize(sanitizedCodes),
        isDefault ? 1 : 0,
        dynamic,
        timestamp,
        timestamp
      );

    return this.getPresets().find((preset) => preset.id === id);
  }

  deletePreset(id) {
    const preset = this.getPresets().find((item) => item.id === id);
    if (!preset) {
      throw new Error('Preset not found');
    }
    if (preset.isDefault) {
      throw new Error('Default presets cannot be deleted');
    }
    this.db.prepare('DELETE FROM presets WHERE id = ?').run(id);
  }

  getState() {
    const enabledCodes = this.readState('enabledCodes', this.getRecommendedCodes());
    const favoriteCodes = this.getCodes()
      .filter((code) => code.favorite)
      .map((code) => code.code);

    return {
      enabledCodes: Array.isArray(enabledCodes) ? enabledCodes : this.getRecommendedCodes(),
      favoriteCodes,
      currency: this.readState('currency', 'AUD') || 'AUD',
      setupNoticeDismissed: Boolean(this.readState('setupNoticeDismissed', false)),
      clientStateMigrated: Boolean(this.readState('clientStateMigrated', false)),
    };
  }

  updateState(patch = {}) {
    if (Array.isArray(patch.enabledCodes)) {
      this.writeState(
        'enabledCodes',
        Array.from(new Set(patch.enabledCodes.map(normalizeCode).filter(Boolean)))
      );
    }
    if (typeof patch.currency === 'string' && patch.currency.trim()) {
      this.writeState('currency', patch.currency.trim().toUpperCase());
    }
    if (typeof patch.setupNoticeDismissed === 'boolean') {
      this.writeState('setupNoticeDismissed', patch.setupNoticeDismissed);
    }
    return this.getState();
  }

  importClientState(payload = {}) {
    const enabledCodes = Array.isArray(payload.enabledCodes) ? payload.enabledCodes : [];
    const favoriteCodes = Array.isArray(payload.favoriteCodes) ? payload.favoriteCodes : [];
    const savedPresets = Array.isArray(payload.savedPresets) ? payload.savedPresets : [];
    const customPresets = payload.customPresets && typeof payload.customPresets === 'object'
      ? Object.values(payload.customPresets)
      : [];

    if (enabledCodes.length > 0) {
      this.writeState(
        'enabledCodes',
        Array.from(new Set(enabledCodes.map(normalizeCode).filter(Boolean)))
      );
    }

    if (typeof payload.currency === 'string' && payload.currency.trim()) {
      this.writeState('currency', payload.currency.trim().toUpperCase());
    }

    if (typeof payload.setupNoticeDismissed === 'boolean') {
      this.writeState('setupNoticeDismissed', payload.setupNoticeDismissed);
    }

    if (favoriteCodes.length > 0) {
      const favoriteSet = new Set(favoriteCodes.map(normalizeCode));
      this.db.exec('BEGIN');
      try {
        const stmt = this.db.prepare('UPDATE codes SET favorite = ?, updated_at = ? WHERE code = ?');
        const timestamp = nowIso();
        for (const code of this.getCodes()) {
          stmt.run(favoriteSet.has(code.code) ? 1 : 0, timestamp, code.code);
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }

    const legacyPresets = [];
    for (const preset of savedPresets) {
      if (!preset || !preset.name) continue;
      legacyPresets.push({
        id: preset.id || `legacy-${slugify(preset.name) || Date.now()}`,
        name: preset.name,
        icon: preset.icon || 'bolt',
        codes: preset.codes || [],
        isDefault: false,
        dynamic: preset.dynamic || null,
      });
    }
    for (const preset of customPresets) {
      if (!preset || !preset.name) continue;
      legacyPresets.push({
        id: `legacy-${slugify(preset.name) || Date.now()}`,
        name: preset.name,
        icon: 'bolt',
        codes: preset.codes || [],
        isDefault: false,
        dynamic: null,
      });
    }

    const existingByName = new Set(this.getPresets().map((preset) => preset.name.toLowerCase()));
    for (const preset of legacyPresets) {
      if (existingByName.has(String(preset.name).toLowerCase())) continue;
      this.upsertPreset(preset);
    }

    this.writeState('clientStateMigrated', true);
    return this.getBootstrap();
  }

  recordSearchHistory({ id, params, summary, results, cacheKey, reusedCache = false }) {
    this.db
      .prepare(`
        INSERT INTO search_history (id, cache_key, params_json, summary_json, results_json, reused_cache, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        cacheKey,
        serialize(params),
        serialize(summary),
        serialize(results),
        reusedCache ? 1 : 0,
        nowIso()
      );
  }

  getHistory(limit = 8) {
    return this.db
      .prepare(`
        SELECT id, params_json, summary_json, reused_cache, created_at
        FROM search_history
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit)
      .map((row) => ({
        id: row.id,
        params: safeJsonParse(row.params_json, {}),
        summary: safeJsonParse(row.summary_json, {}),
        reusedCache: Boolean(row.reused_cache),
        createdAt: row.created_at,
      }));
  }

  getInsights(limit = 5) {
    const rows = this.db
      .prepare(`
        SELECT params_json, summary_json, results_json, created_at
        FROM search_history
        ORDER BY created_at DESC
        LIMIT 100
      `)
      .all();

    const codeStats = new Map();
    const destinationStats = new Map();
    let totalSearches = 0;
    let totalPropertiesCompared = 0;
    let totalSavingsTracked = 0;
    let latestSearchAt = null;

    for (const row of rows) {
      const params = safeJsonParse(row.params_json, {});
      const summary = safeJsonParse(row.summary_json, {});
      const results = safeJsonParse(row.results_json, []);
      const destination = summary.destination || [params.city, params.country].filter(Boolean).join(', ');

      totalSearches += 1;
      totalPropertiesCompared += Number(summary.propertyCount || 0);
      if (!latestSearchAt) latestSearchAt = row.created_at;

      if (destination) {
        const currentDestination = destinationStats.get(destination) || {
          destination,
          searches: 0,
          totalProperties: 0,
          lastSearchedAt: row.created_at,
        };
        currentDestination.searches += 1;
        currentDestination.totalProperties += Number(summary.propertyCount || 0);
        if (row.created_at > currentDestination.lastSearchedAt) {
          currentDestination.lastSearchedAt = row.created_at;
        }
        destinationStats.set(destination, currentDestination);
      }

      const baseline = results.find((result) => result.code === 'BASELINE') || { hotels: [] };
      const baselinePrices = new Map();
      for (const hotel of baseline.hotels || []) {
        baselinePrices.set(hotel.name, hotel.price);
      }

      const perProperty = new Map();
      for (const result of results) {
        for (const hotel of result.hotels || []) {
          if (!perProperty.has(hotel.name)) {
            perProperty.set(hotel.name, []);
          }
          perProperty.get(hotel.name).push({
            code: result.code,
            price: hotel.price,
          });
        }
      }

      for (const [hotelName, rates] of perProperty.entries()) {
        const priced = rates.filter((rate) => typeof rate.price === 'number');
        for (const rate of priced) {
          const stat = codeStats.get(rate.code) || {
            code: rate.code,
            wins: 0,
            appearances: 0,
            searches: 0,
            savingsTotal: 0,
          };
          stat.appearances += 1;
          stat.searches += 1;
          codeStats.set(rate.code, stat);
        }

        if (!priced.length) continue;

        const best = priced.reduce((lowest, current) => (current.price < lowest.price ? current : lowest));
        const baselinePrice = baselinePrices.get(hotelName);
        const bestStat = codeStats.get(best.code) || {
          code: best.code,
          wins: 0,
          appearances: 0,
          searches: 0,
          savingsTotal: 0,
        };
        bestStat.wins += 1;
        if (typeof baselinePrice === 'number' && baselinePrice > best.price) {
          const savings = baselinePrice - best.price;
          bestStat.savingsTotal += savings;
          totalSavingsTracked += savings;
        }
        codeStats.set(best.code, bestStat);
      }
    }

    const topCodes = [...codeStats.values()]
      .filter((entry) => entry.code !== 'BASELINE')
      .map((entry) => ({
        ...entry,
        averageSavings: entry.wins ? Math.round(entry.savingsTotal / entry.wins) : 0,
        winRate: entry.appearances ? Number((entry.wins / entry.appearances).toFixed(2)) : 0,
      }))
      .sort((left, right) =>
        right.wins - left.wins ||
        right.averageSavings - left.averageSavings ||
        left.code.localeCompare(right.code)
      )
      .slice(0, limit);

    const topDestinations = [...destinationStats.values()]
      .map((entry) => ({
        ...entry,
        averageProperties: entry.searches
          ? Math.round(entry.totalProperties / entry.searches)
          : 0,
      }))
      .sort((left, right) =>
        right.searches - left.searches ||
        right.averageProperties - left.averageProperties ||
        left.destination.localeCompare(right.destination)
      )
      .slice(0, limit);

    return {
      topCodes,
      topDestinations,
      snapshot: {
        totalSearches,
        totalPropertiesCompared,
        totalSavingsTracked,
        latestSearchAt,
      },
    };
  }

  getBootstrap() {
    return {
      codes: this.getCodes(),
      presets: this.getPresets(),
      state: this.getState(),
      history: this.getHistory(),
      insights: this.getInsights(),
    };
  }
}

module.exports = {
  DB_PATH,
  RitzStore,
};
