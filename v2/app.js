import {
  buildCatalog,
  buildInsights,
  loadClientState,
  loadCustomCodes,
  loadCustomPresets,
  loadHistory,
  saveClientState,
  saveHistory,
} from './browser-store.js';

const CODE_DISPLAY = { BASELINE: 'STD' };
const DEFAULT_DESTINATION = 'Las Vegas, US';
const DEFAULT_CHECK_IN = '2026-04-16';
const DEFAULT_CHECK_OUT = '2026-04-22';

const state = {
  codes: [],
  presets: [],
  enabledCodes: [],
  favoriteCodes: [],
  history: [],
  insights: null,
  setupNoticeDismissed: false,
  currentView: 'cards',
  mapOpen: false,
  currentJob: null,
  results: [],
  properties: [],
  selectedPropertyId: null,
  map: null,
  markers: [],
};

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function getDisplayCode(code) {
  return CODE_DISPLAY[code] || code;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getCurrencySymbol(currency) {
  const symbols = {
    AUD: 'A$',
    USD: '$',
    EUR: 'EUR ',
    GBP: 'GBP ',
    SGD: 'S$',
    CAD: 'C$',
    JPY: 'JPY ',
  };
  return symbols[currency] || `${currency || 'USD'} `;
}

function formatMoney(amount, currency) {
  if (typeof amount !== 'number') return 'N/A';
  return `${getCurrencySymbol(currency)}${Math.round(amount)}`;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseDestination(value) {
  const parts = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    city: parts[0] || '',
    country: parts[1] || '',
  };
}

function getSelectedCodes() {
  return ['BASELINE', ...state.enabledCodes];
}

function mergeBootstrap(bootstrap) {
  const clientState = loadClientState(
    (bootstrap.codes || []).filter((code) => code.recommended).map((code) => code.code)
  );
  const customCodes = loadCustomCodes();
  const customPresets = loadCustomPresets();

  state.favoriteCodes = clientState.favoriteCodes || [];
  state.enabledCodes = clientState.enabledCodes || [];
  state.setupNoticeDismissed = Boolean(clientState.setupNoticeDismissed);
  state.mapOpen = Boolean(clientState.mapOpen);
  state.codes = buildCatalog(bootstrap.codes || [], state.favoriteCodes, customCodes);
  state.presets = [...(bootstrap.presets || []), ...customPresets];
  state.history = loadHistory();
  state.insights = buildInsights(state.history);
}

function saveState(patch) {
  const next = saveClientState({
    enabledCodes: state.enabledCodes,
    favoriteCodes: state.favoriteCodes,
    setupNoticeDismissed: state.setupNoticeDismissed,
    mapOpen: state.mapOpen,
    ...patch,
  });

  state.enabledCodes = next.enabledCodes || state.enabledCodes;
  state.favoriteCodes = next.favoriteCodes || state.favoriteCodes;
  state.setupNoticeDismissed = Boolean(next.setupNoticeDismissed);
  state.mapOpen = Boolean(next.mapOpen);
}

function summarizeWinningCodes(properties) {
  const wins = new Map();

  for (const property of properties) {
    if (!property.bestCode || property.bestCode === 'BASELINE') continue;
    const bucket = wins.get(property.bestCode) || {
      code: property.bestCode,
      wins: 0,
      savings: [],
    };
    bucket.wins += 1;
    if (typeof property.savings === 'number' && property.savings > 0) {
      bucket.savings.push(property.savings);
    }
    wins.set(property.bestCode, bucket);
  }

  return [...wins.values()]
    .sort((left, right) => right.wins - left.wins)
    .slice(0, 4)
    .map((entry) => ({
      code: entry.code,
      wins: entry.wins,
      averageSavings: entry.savings.length
        ? Math.round(entry.savings.reduce((sum, value) => sum + value, 0) / entry.savings.length)
        : 0,
    }));
}

function recordHistory(params, job, properties) {
  const item = {
    id: job.id,
    createdAt: job.completedAt || new Date().toISOString(),
    params,
    summary: {
      destination: [params.city, params.country].filter(Boolean).join(', '),
      propertyCount: properties.length,
      successfulCodes: job.progress?.successfulCodes || 0,
      totalCodes: job.progress?.totalCodes || 0,
      failedCodes: job.failedCodes || [],
      winningCodes: summarizeWinningCodes(properties),
    },
  };

  state.history = [item, ...state.history.filter((entry) => entry.id !== item.id)].slice(0, 12);
  saveHistory(state.history);
  state.insights = buildInsights(state.history);
}

function getBrandInitials(property) {
  const value = property.brandName || property.name || 'Hotel';
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function normalizeResults(results) {
  const byProperty = new Map();

  for (const result of results) {
    for (const hotel of result.hotels || []) {
      const id = hotel.propertyId || slug(hotel.name);
      const entry = byProperty.get(id) || {
        id,
        name: hotel.name,
        propertyId: hotel.propertyId || id,
        brandName: hotel.brandName || '',
        imageUrl: hotel.imageUrl || '',
        description: hotel.description || '',
        rating: hotel.rating || null,
        reviewCount: hotel.reviewCount || null,
        distance: hotel.distance || '',
        latitude: typeof hotel.latitude === 'number' ? hotel.latitude : null,
        longitude: typeof hotel.longitude === 'number' ? hotel.longitude : null,
        currency: hotel.currency || null,
        rates: [],
      };

      entry.currency = entry.currency || hotel.currency || null;
      entry.imageUrl = entry.imageUrl || hotel.imageUrl || '';
      entry.description = entry.description || hotel.description || '';
      entry.distance = entry.distance || hotel.distance || '';
      entry.rating = entry.rating || hotel.rating || null;
      entry.reviewCount = entry.reviewCount || hotel.reviewCount || null;
      if (entry.latitude === null && typeof hotel.latitude === 'number') entry.latitude = hotel.latitude;
      if (entry.longitude === null && typeof hotel.longitude === 'number') entry.longitude = hotel.longitude;
      entry.rates.push({
        code: result.code,
        price: typeof hotel.price === 'number' ? hotel.price : null,
        currency: hotel.currency || entry.currency || null,
        url: result.url,
      });
      byProperty.set(id, entry);
    }
  }

  return [...byProperty.values()]
    .map((property) => {
      property.rates.sort((left, right) => {
        if (left.price === null) return 1;
        if (right.price === null) return -1;
        return left.price - right.price;
      });

      const baseline = property.rates.find((rate) => rate.code === 'BASELINE' && rate.price !== null) || null;
      const best = property.rates.find((rate) => rate.price !== null) || null;
      property.baselinePrice = baseline?.price ?? null;
      property.bestPrice = best?.price ?? null;
      property.bestCode = best?.code || null;
      property.bestRateUrl = best?.url || '';
      property.savings =
        property.baselinePrice !== null &&
        property.bestPrice !== null &&
        property.bestCode !== 'BASELINE'
          ? Math.max(0, Math.round(property.baselinePrice - property.bestPrice))
          : 0;

      return property;
    })
    .sort((left, right) => {
      if ((right.savings || 0) !== (left.savings || 0)) {
        return (right.savings || 0) - (left.savings || 0);
      }
      if (left.bestPrice === null) return 1;
      if (right.bestPrice === null) return -1;
      return left.bestPrice - right.bestPrice;
    });
}

function setStatus(text, tone = 'idle') {
  const pill = document.getElementById('statusPill');
  pill.textContent = text;
  pill.dataset.tone = tone;
}

function renderSetupNotice() {
  const notice = document.getElementById('setupNotice');
  notice.hidden = state.setupNoticeDismissed;
}

function renderSelectionSummary() {
  const count = state.enabledCodes.length;
  const recommended = state.codes.filter((code) => code.recommended).length;

  document.getElementById('selectedCount').textContent = String(count);
  document.getElementById('selectedMeta').textContent =
    count > 0
      ? `${count} saved codes ready for the next search`
      : `No saved codes selected. Start with the ${recommended} recommended options.`;

  const selected = state.codes.filter((code) => state.enabledCodes.includes(code.code)).slice(0, 8);
  document.getElementById('selectedCodes').innerHTML = selected.length
    ? selected
        .map((code) => `<span class="selection-chip">${escapeHtml(code.code)}<small>${escapeHtml(code.company)}</small></span>`)
        .join('')
    : '<span class="selection-chip muted">Open the code library to choose your comparison set.</span>';
}

function renderPresetRail() {
  const container = document.getElementById('presetRail');
  container.innerHTML = state.presets
    .map((preset) => {
      const codes = preset.dynamic === 'recommended'
        ? state.codes.filter((code) => code.recommended).map((code) => code.code)
        : preset.codes || [];
      return `
        <button class="preset-tile" data-action="apply-preset" data-id="${escapeHtml(preset.id)}">
          <span class="preset-kicker">Saved Set</span>
          <strong>${escapeHtml(preset.name)}</strong>
          <small>${codes.length} codes</small>
        </button>
      `;
    })
    .join('');
}

function renderInsights() {
  const insights = state.insights || { snapshot: {}, topCodes: [], topDestinations: [] };
  const topCode = insights.topCodes?.[0];
  const topDestination = insights.topDestinations?.[0];

  document.getElementById('insightGrid').innerHTML = `
    <article class="insight-card">
      <span class="eyebrow">Search Engine</span>
      <h3>Server-side Marriott rate retrieval</h3>
      <p>The browser only presents the interface. Code checks run against Marriott’s live site backend from the server.</p>
    </article>
    <article class="insight-card">
      <span class="eyebrow">Frequent Winner</span>
      <h3>${escapeHtml(topCode ? getDisplayCode(topCode.code) : 'Ready to learn')}</h3>
      <p>${topCode ? `${topCode.wins} hotel wins, average edge about ${topCode.averageSavings}` : 'Run a few searches and the best-performing codes will surface here.'}</p>
    </article>
    <article class="insight-card">
      <span class="eyebrow">Recent Pattern</span>
      <h3>${escapeHtml(topDestination ? topDestination.destination : 'No history yet')}</h3>
      <p>${topDestination ? `${topDestination.searches} stored searches, ${topDestination.averageProperties} hotels on average` : 'History is stored in this browser for quick restores and light local analytics.'}</p>
    </article>
    <article class="insight-card">
      <span class="eyebrow">Search Depth</span>
      <h3>${insights.snapshot?.totalPropertiesCompared || 0}</h3>
      <p>Total hotel comparisons captured in local browser history.</p>
    </article>
  `;
}

function renderHistory() {
  const container = document.getElementById('historyList');
  if (!state.history.length) {
    container.innerHTML = '<p class="empty-copy">Recent searches will appear here after the first completed run.</p>';
    return;
  }

  container.innerHTML = state.history
    .slice(0, 6)
    .map((item) => `
      <button class="history-row" data-action="restore-history" data-id="${escapeHtml(item.id)}">
        <div>
          <strong>${escapeHtml(item.summary?.destination || 'Recent search')}</strong>
          <div class="history-meta">${escapeHtml(formatDateTime(item.createdAt))}</div>
        </div>
        <div class="history-stats">
          <span>${item.summary?.propertyCount || 0} hotels</span>
          <span>${item.summary?.successfulCodes || 0}/${item.summary?.totalCodes || 0} codes</span>
        </div>
      </button>
    `)
    .join('');
}

function renderProgress(job) {
  const progress = job.progress || {};
  const total = progress.totalCodes || 0;
  const completed = progress.completedCodes || 0;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const properties = normalizeResults(job.results || []);

  document.getElementById('resultsSummary').innerHTML = `
    <div class="summary-strip">
      <div>
        <span class="eyebrow">Status</span>
        <h3>${escapeHtml(job.message || 'Working')}</h3>
      </div>
      <div class="summary-metrics">
        <div><strong>${completed}/${total}</strong><span>codes completed</span></div>
        <div><strong>${properties.length}</strong><span>properties found</span></div>
        <div><strong>${percent}%</strong><span>search progress</span></div>
      </div>
    </div>
  `;

  document.getElementById('resultsBody').innerHTML = `
    <div class="progress-card">
      <div class="progress-track"><span style="width:${percent}%"></span></div>
      <p>${escapeHtml(job.message || 'Searching Marriott')}</p>
    </div>
  `;
}

function renderResultsSummary(properties) {
  const bestSavings = Math.max(0, ...properties.map((property) => property.savings || 0));
  const withRates = properties.filter((property) => property.bestPrice !== null).length;
  const topProperty = properties.find((property) => property.bestPrice !== null);

  document.getElementById('resultsSummary').innerHTML = `
    <div class="summary-strip">
      <div>
        <span class="eyebrow">Rate Brief</span>
        <h3>${properties.length ? `${properties.length} properties compared` : 'No properties returned'}</h3>
        <p>${topProperty ? `${escapeHtml(topProperty.name)} is currently leading at ${formatMoney(topProperty.bestPrice, topProperty.currency)}.` : 'The search completed, but Marriott did not return live rates for this combination.'}</p>
      </div>
      <div class="summary-metrics">
        <div><strong>${withRates}</strong><span>priced hotels</span></div>
        <div><strong>${formatMoney(bestSavings, topProperty?.currency || 'USD')}</strong><span>best savings</span></div>
        <div><strong>${state.history.length}</strong><span>browser-saved searches</span></div>
      </div>
    </div>
  `;
}

function renderEmptyResults(message) {
  document.getElementById('resultsSummary').innerHTML = `
    <div class="summary-strip">
      <div>
        <span class="eyebrow">Search Result</span>
        <h3>No live rates returned</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    </div>
  `;
  document.getElementById('resultsBody').innerHTML = '<div class="empty-state">Try a different destination, date range, or code set.</div>';
}

function buildRateChips(property) {
  return property.rates
    .slice(0, 5)
    .map((rate) => {
      const isBest = rate.code === property.bestCode;
      const isBaseline = rate.code === 'BASELINE';
      const savings =
        property.baselinePrice !== null &&
        rate.price !== null &&
        rate.code !== 'BASELINE'
          ? Math.max(0, Math.round(property.baselinePrice - rate.price))
          : 0;

      return `
        <a class="rate-chip ${isBest ? 'best' : ''} ${isBaseline ? 'baseline' : ''}" href="${escapeHtml(rate.url)}" target="_blank" rel="noreferrer">
          <span>${escapeHtml(getDisplayCode(rate.code))}</span>
          <strong>${formatMoney(rate.price, property.currency)}</strong>
          ${savings ? `<small>Save ${formatMoney(savings, property.currency)}</small>` : ''}
        </a>
      `;
    })
    .join('');
}

function buildPropertyCard(property) {
  const selected = state.selectedPropertyId === property.id ? 'selected' : '';
  return `
    <article class="property-card ${selected}" data-action="select-property" data-id="${escapeHtml(property.id)}">
      <div class="property-media">
        ${property.imageUrl
          ? `<img src="${escapeHtml(property.imageUrl)}" alt="${escapeHtml(property.name)}">`
          : `<div class="property-fallback">${escapeHtml(getBrandInitials(property))}</div>`}
        ${property.savings ? `<span class="savings-badge">Save ${formatMoney(property.savings, property.currency)}</span>` : ''}
      </div>
      <div class="property-copy">
        <div class="property-heading">
          <div>
            <span class="eyebrow">${escapeHtml(property.brandName || 'Marriott')}</span>
            <h3>${escapeHtml(property.name)}</h3>
          </div>
          <div class="property-price">
            <strong>${formatMoney(property.bestPrice, property.currency)}</strong>
            <span>${escapeHtml(getDisplayCode(property.bestCode || 'BASELINE'))}</span>
          </div>
        </div>
        <p>${escapeHtml(property.description || 'Live Marriott pricing returned for this property.')}</p>
        <div class="property-meta">
          ${property.baselinePrice !== null ? `<span>Baseline ${formatMoney(property.baselinePrice, property.currency)}</span>` : ''}
          ${property.distance ? `<span>${escapeHtml(property.distance)}</span>` : ''}
          ${property.rating ? `<span>${property.rating} stars</span>` : ''}
        </div>
        <div class="rate-chip-row">${buildRateChips(property)}</div>
      </div>
    </article>
  `;
}

function buildPropertyRow(property) {
  const selected = state.selectedPropertyId === property.id ? 'selected' : '';
  return `
    <article class="property-row ${selected}" data-action="select-property" data-id="${escapeHtml(property.id)}">
      <div>
        <span class="eyebrow">${escapeHtml(property.brandName || 'Marriott')}</span>
        <h3>${escapeHtml(property.name)}</h3>
        <div class="property-meta">
          ${property.baselinePrice !== null ? `<span>Baseline ${formatMoney(property.baselinePrice, property.currency)}</span>` : ''}
          ${property.savings ? `<span>Save ${formatMoney(property.savings, property.currency)}</span>` : ''}
          ${property.distance ? `<span>${escapeHtml(property.distance)}</span>` : ''}
        </div>
      </div>
      <div class="row-rates">${buildRateChips(property)}</div>
      <div class="property-price compact">
        <strong>${formatMoney(property.bestPrice, property.currency)}</strong>
        <span>${escapeHtml(getDisplayCode(property.bestCode || 'BASELINE'))}</span>
      </div>
    </article>
  `;
}

function renderProperties() {
  renderResultsSummary(state.properties);
  const body = document.getElementById('resultsBody');

  if (!state.properties.length) {
    renderEmptyResults('No matching properties were returned for the current search.');
    return;
  }

  body.innerHTML = state.currentView === 'cards'
    ? `<div class="property-grid">${state.properties.map(buildPropertyCard).join('')}</div>`
    : `<div class="property-list">${state.properties.map(buildPropertyRow).join('')}</div>`;

  updateMap();
}

function updateMap() {
  const mapPanel = document.getElementById('mapPanel');
  mapPanel.hidden = !state.mapOpen;

  if (!state.mapOpen || typeof window.L === 'undefined') {
    return;
  }

  if (!state.map) {
    state.map = window.L.map('mapCanvas', {
      zoomControl: false,
      attributionControl: true,
    });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(state.map);
  }

  state.markers.forEach((marker) => marker.remove());
  state.markers = [];

  const mappable = state.properties.filter((property) => property.latitude !== null && property.longitude !== null);
  if (!mappable.length) return;

  const bounds = [];

  for (const property of mappable) {
    const marker = window.L.marker([property.latitude, property.longitude]).addTo(state.map);
    marker.bindPopup(`
      <div class="map-popup">
        <strong>${escapeHtml(property.name)}</strong>
        <p>${escapeHtml(getDisplayCode(property.bestCode || 'BASELINE'))} · ${formatMoney(property.bestPrice, property.currency)}</p>
        ${property.savings ? `<small>Save ${formatMoney(property.savings, property.currency)} vs baseline</small>` : ''}
      </div>
    `);
    marker.on('click', () => {
      state.selectedPropertyId = property.id;
      renderProperties();
    });
    if (state.selectedPropertyId === property.id) {
      marker.openPopup();
    }
    state.markers.push(marker);
    bounds.push([property.latitude, property.longitude]);
  }

  state.map.invalidateSize();
  state.map.fitBounds(bounds, { padding: [24, 24] });
}

function renderResults() {
  const toolbar = document.getElementById('resultsToolbar');
  document.getElementById('retryButton').disabled = !(state.currentJob?.failedCodes?.length);
  toolbar.hidden = !state.currentJob;

  if (!state.currentJob) {
    document.getElementById('resultsSummary').innerHTML = `
      <div class="summary-strip">
        <div>
          <span class="eyebrow">Ready</span>
          <h3>Choose a destination and run a rate brief</h3>
          <p>Searches query Marriott server-side, compare your selected codes, and keep recent results in this browser.</p>
        </div>
      </div>
    `;
    document.getElementById('resultsBody').innerHTML = '<div class="empty-state">No search has been run yet.</div>';
    return;
  }

  if (state.currentJob.status === 'running' || state.currentJob.status === 'queued') {
    renderProgress(state.currentJob);
    return;
  }

  const failedEverything =
    state.currentJob.status === 'completed' &&
    !state.currentJob.results.some((result) => result.success || result.error === 'NO_RESULTS');

  if (!state.properties.length && failedEverything) {
    renderEmptyResults('Marriott rejected the request set or returned no usable hotel data for any selected code.');
    return;
  }

  renderProperties();
}

function renderViewToggle() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.currentView);
  });
  const mapButton = document.getElementById('toggleMap');
  mapButton.classList.toggle('active', state.mapOpen);
}

function refreshShell() {
  renderSetupNotice();
  renderSelectionSummary();
  renderPresetRail();
  renderInsights();
  renderHistory();
  renderViewToggle();
  renderResults();
}

async function pollJob(jobId) {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const job = await apiFetch(`/api/search-jobs/${jobId}`);
    state.currentJob = job;
    state.results = job.results || [];
    state.properties = normalizeResults(state.results);
    if (!state.selectedPropertyId && state.properties.length) {
      state.selectedPropertyId = state.properties[0].id;
    }
    renderResults();

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
  }
}

async function runSearch() {
  const destination = document.getElementById('destinationInput').value.trim();
  const checkIn = document.getElementById('checkInInput').value;
  const checkOut = document.getElementById('checkOutInput').value;

  if (!destination || !checkIn || !checkOut) {
    window.alert('Destination, check-in, and check-out are required.');
    return;
  }

  if (!state.enabledCodes.length) {
    window.alert('Select at least one corporate code in the library first.');
    return;
  }

  const params = parseDestination(destination);
  if (!params.city) {
    window.alert('Please enter a destination in the format "City, Country".');
    return;
  }

  document.getElementById('searchButton').disabled = true;
  setStatus('Searching', 'working');

  try {
    const job = await apiFetch('/api/search-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        checkIn,
        checkOut,
        codes: getSelectedCodes(),
      }),
    });

    state.currentJob = job;
    state.results = job.results || [];
    state.properties = normalizeResults(state.results);

    const completed = job.status === 'running' || job.status === 'queued'
      ? await pollJob(job.id)
      : job;

    state.currentJob = completed;
    state.results = completed.results || [];
    state.properties = normalizeResults(state.results);
    state.selectedPropertyId = state.properties[0]?.id || null;
    recordHistory(
      { ...params, checkIn, checkOut, codes: getSelectedCodes() },
      completed,
      state.properties
    );
    setStatus(completed.failedCodes?.length ? 'Complete with failures' : 'Complete', completed.failedCodes?.length ? 'warn' : 'success');
    refreshShell();
  } catch (error) {
    setStatus('Failed', 'error');
    renderEmptyResults(error.message);
  } finally {
    document.getElementById('searchButton').disabled = false;
  }
}

async function retryFailed() {
  if (!state.currentJob?.failedCodes?.length) return;

  document.getElementById('searchButton').disabled = true;
  setStatus('Retrying failed codes', 'working');

  try {
    const params = state.currentJob.params || {};
    const job = await apiFetch('/api/search-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: params.city,
        country: params.country,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        codes: state.currentJob.failedCodes,
      }),
    });
    const completed = job.status === 'running' || job.status === 'queued'
      ? await pollJob(job.id)
      : job;
    state.currentJob = completed;
    state.results = completed.results || [];
    state.properties = normalizeResults(state.results);
    state.selectedPropertyId = state.properties[0]?.id || null;
    setStatus(completed.failedCodes?.length ? 'Retry complete with failures' : 'Retry complete', completed.failedCodes?.length ? 'warn' : 'success');
    refreshShell();
  } catch (error) {
    setStatus('Retry failed', 'error');
    window.alert(error.message);
  } finally {
    document.getElementById('searchButton').disabled = false;
  }
}

function applyPreset(id) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) return;
  state.enabledCodes = preset.dynamic === 'recommended'
    ? state.codes.filter((code) => code.recommended).map((code) => code.code)
    : [...(preset.codes || [])];
  saveState();
  renderSelectionSummary();
  renderPresetRail();
}

function restoreHistory(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;

  document.getElementById('destinationInput').value = entry.summary?.destination || '';
  document.getElementById('checkInInput').value = entry.params?.checkIn || DEFAULT_CHECK_IN;
  document.getElementById('checkOutInput').value = entry.params?.checkOut || DEFAULT_CHECK_OUT;
  state.enabledCodes = (entry.params?.codes || []).filter((code) => code !== 'BASELINE');
  saveState();
  renderSelectionSummary();
  setStatus('History restored', 'idle');
}

function selectProperty(id) {
  state.selectedPropertyId = id;
  renderProperties();
}

function toggleView(view) {
  state.currentView = view;
  renderViewToggle();
  renderResults();
}

function toggleMap() {
  state.mapOpen = !state.mapOpen;
  saveState({ mapOpen: state.mapOpen });
  renderViewToggle();
  renderResults();
}

function dismissNotice() {
  state.setupNoticeDismissed = true;
  saveState({ setupNoticeDismissed: true });
  renderSetupNotice();
}

function attachListeners() {
  document.body.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const { action, id } = trigger.dataset;
    if (action === 'apply-preset') applyPreset(id);
    if (action === 'restore-history') restoreHistory(id);
    if (action === 'select-property') selectProperty(id);
  });

  document.getElementById('searchButton').addEventListener('click', runSearch);
  document.getElementById('retryButton').addEventListener('click', retryFailed);
  document.getElementById('dismissNotice').addEventListener('click', dismissNotice);
  document.getElementById('toggleMap').addEventListener('click', toggleMap);

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => toggleView(button.dataset.view));
  });
}

async function init() {
  const bootstrap = await apiFetch('/api/bootstrap');
  mergeBootstrap(bootstrap);

  document.getElementById('destinationInput').value = DEFAULT_DESTINATION;
  document.getElementById('checkInInput').value = DEFAULT_CHECK_IN;
  document.getElementById('checkOutInput').value = DEFAULT_CHECK_OUT;

  attachListeners();
  refreshShell();
}

init().catch((error) => {
  console.error(error);
  setStatus('Failed to load', 'error');
  renderEmptyResults(error.message);
});
