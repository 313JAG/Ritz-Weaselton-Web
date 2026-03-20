const STORAGE_KEYS = {
  state: 'ritzweazelton.state',
  customCodes: 'ritzweazelton.customCodes',
  customPresets: 'ritzweazelton.customPresets',
  history: 'ritzweazelton.history',
};

const DEFAULT_STATE = {
  enabledCodes: [],
  favoriteCodes: [],
  currency: 'AUD',
  setupNoticeDismissed: false,
  mapOpen: false,
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadClientState(defaultRecommended = []) {
  const next = {
    ...DEFAULT_STATE,
    ...readJson(STORAGE_KEYS.state, {}),
  };

  if (!Array.isArray(next.enabledCodes) || next.enabledCodes.length === 0) {
    next.enabledCodes = [...defaultRecommended];
  }
  if (!Array.isArray(next.favoriteCodes)) {
    next.favoriteCodes = [];
  }

  return next;
}

export function saveClientState(patch) {
  const current = loadClientState();
  const next = { ...current, ...patch };
  writeJson(STORAGE_KEYS.state, next);
  return next;
}

export function loadCustomCodes() {
  const value = readJson(STORAGE_KEYS.customCodes, []);
  return Array.isArray(value) ? value : [];
}

export function saveCustomCodes(codes) {
  writeJson(STORAGE_KEYS.customCodes, Array.isArray(codes) ? codes : []);
}

export function loadCustomPresets() {
  const value = readJson(STORAGE_KEYS.customPresets, []);
  return Array.isArray(value) ? value : [];
}

export function saveCustomPresets(presets) {
  writeJson(STORAGE_KEYS.customPresets, Array.isArray(presets) ? presets : []);
}

export function loadHistory() {
  const value = readJson(STORAGE_KEYS.history, []);
  return Array.isArray(value) ? value : [];
}

export function saveHistory(entries) {
  writeJson(STORAGE_KEYS.history, Array.isArray(entries) ? entries.slice(0, 12) : []);
}

export function buildCatalog(serverCodes, favorites, customCodes) {
  const favoriteSet = new Set(favorites || []);
  const byCode = new Map();

  for (const code of serverCodes || []) {
    byCode.set(code.code, {
      ...code,
      custom: false,
      favorite: favoriteSet.has(code.code),
    });
  }

  for (const code of customCodes || []) {
    if (!code?.code) continue;
    byCode.set(code.code, {
      code: code.code,
      company: code.company || 'Custom code',
      recommended: false,
      custom: true,
      favorite: favoriteSet.has(code.code),
    });
  }

  return [...byCode.values()].sort((left, right) => {
    if (left.favorite !== right.favorite) return Number(right.favorite) - Number(left.favorite);
    if (left.recommended !== right.recommended) return Number(right.recommended) - Number(left.recommended);
    return left.company.localeCompare(right.company) || left.code.localeCompare(right.code);
  });
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildInsights(historyEntries) {
  const history = Array.isArray(historyEntries) ? historyEntries : [];
  const codeWins = new Map();
  const destinationStats = new Map();
  let totalPropertiesCompared = 0;

  for (const entry of history) {
    totalPropertiesCompared += Number(entry.summary?.propertyCount || 0);

    const destination = entry.summary?.destination || 'Recent search';
    const destinationBucket = destinationStats.get(destination) || {
      destination,
      searches: 0,
      properties: [],
    };
    destinationBucket.searches += 1;
    destinationBucket.properties.push(Number(entry.summary?.propertyCount || 0));
    destinationStats.set(destination, destinationBucket);

    for (const winner of entry.summary?.winningCodes || []) {
      const bucket = codeWins.get(winner.code) || {
        code: winner.code,
        wins: 0,
        savings: [],
      };
      bucket.wins += Number(winner.wins || 0);
      if (typeof winner.averageSavings === 'number') {
        bucket.savings.push(winner.averageSavings);
      }
      codeWins.set(winner.code, bucket);
    }
  }

  return {
    snapshot: {
      totalSearches: history.length,
      totalPropertiesCompared,
    },
    topCodes: [...codeWins.values()]
      .sort((left, right) => right.wins - left.wins)
      .slice(0, 5)
      .map((entry) => ({
        code: entry.code,
        wins: entry.wins,
        averageSavings: Math.round(average(entry.savings)),
      })),
    topDestinations: [...destinationStats.values()]
      .sort((left, right) => right.searches - left.searches)
      .slice(0, 5)
      .map((entry) => ({
        destination: entry.destination,
        searches: entry.searches,
        averageProperties: Math.round(average(entry.properties)),
      })),
  };
}
