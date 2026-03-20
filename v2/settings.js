import {
  buildCatalog,
  buildInsights,
  loadClientState,
  loadCustomCodes,
  loadCustomPresets,
  loadHistory,
  saveClientState,
  saveCustomCodes,
  saveCustomPresets,
} from './browser-store.js';

const state = {
  codes: [],
  presets: [],
  history: [],
  insights: null,
  enabledCodes: [],
  favoriteCodes: [],
  filter: '',
  mode: 'all',
  customCodes: [],
  customPresets: [],
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

function mergeBootstrap(bootstrap) {
  const clientState = loadClientState(
    (bootstrap.codes || []).filter((code) => code.recommended).map((code) => code.code)
  );
  state.enabledCodes = clientState.enabledCodes || [];
  state.favoriteCodes = clientState.favoriteCodes || [];
  state.customCodes = loadCustomCodes();
  state.customPresets = loadCustomPresets();
  state.codes = buildCatalog(bootstrap.codes || [], state.favoriteCodes, state.customCodes);
  state.presets = [...(bootstrap.presets || []), ...state.customPresets];
  state.history = loadHistory();
  state.insights = buildInsights(state.history);
}

function persistClientState() {
  saveClientState({
    enabledCodes: state.enabledCodes,
    favoriteCodes: state.favoriteCodes,
  });
}

function refreshCatalog() {
  state.codes = buildCatalog(
    state.codes.filter((code) => !code.custom),
    state.favoriteCodes,
    state.customCodes
  );
}

function getVisibleCodes() {
  const needle = state.filter.trim().toLowerCase();
  let codes = state.codes.filter((code) => {
    if (!needle) return true;
    return (
      code.code.toLowerCase().includes(needle) ||
      code.company.toLowerCase().includes(needle)
    );
  });

  if (state.mode === 'favorites') codes = codes.filter((code) => code.favorite);
  if (state.mode === 'recommended') codes = codes.filter((code) => code.recommended);
  if (state.mode === 'selected') codes = codes.filter((code) => state.enabledCodes.includes(code.code));

  return codes;
}

function renderInsights() {
  const insights = state.insights || { snapshot: {}, topCodes: [], topDestinations: [] };
  const topCodes = insights.topCodes || [];
  const destinations = insights.topDestinations || [];

  document.getElementById('libraryInsights').innerHTML = `
    <article class="library-card">
      <span class="eyebrow">Library State</span>
      <h3>${state.enabledCodes.length} active codes</h3>
      <p>${state.favoriteCodes.length} favourites and ${state.customCodes.length} local custom additions are saved in this browser.</p>
    </article>
    <article class="library-card">
      <span class="eyebrow">Winning Codes</span>
      <h3>${escapeHtml(topCodes[0]?.code || 'No signal yet')}</h3>
      <p>${topCodes[0] ? `${topCodes[0].wins} hotel wins, average edge ${topCodes[0].averageSavings}` : 'Complete a few searches and local code performance will show up here.'}</p>
    </article>
    <article class="library-card">
      <span class="eyebrow">Frequent Destination</span>
      <h3>${escapeHtml(destinations[0]?.destination || 'No history yet')}</h3>
      <p>${destinations[0] ? `${destinations[0].searches} searches, ${destinations[0].averageProperties} hotels on average` : 'Recent destination patterns appear here after a few searches.'}</p>
    </article>
  `;
}

function renderSelectionSummary() {
  document.getElementById('selectionCount').textContent = String(state.enabledCodes.length);
  document.getElementById('selectionMeta').textContent =
    state.enabledCodes.length
      ? `${state.enabledCodes.length} codes will be included with the standard baseline on the next search.`
      : 'No corporate codes selected yet.';
}

function renderPresets() {
  const container = document.getElementById('presetList');
  container.innerHTML = state.presets
    .map((preset) => {
      const codes = preset.dynamic === 'recommended'
        ? state.codes.filter((code) => code.recommended).map((code) => code.code)
        : preset.codes || [];
      const deletable = !preset.isDefault;
      return `
        <article class="preset-card">
          <div>
            <span class="eyebrow">Preset</span>
            <h3>${escapeHtml(preset.name)}</h3>
            <p>${codes.length} codes</p>
          </div>
          <div class="preset-actions">
            <button data-action="apply-preset" data-id="${escapeHtml(preset.id)}">Apply</button>
            ${deletable ? `<button class="subtle" data-action="delete-preset" data-id="${escapeHtml(preset.id)}">Delete</button>` : ''}
          </div>
        </article>
      `;
    })
    .join('');
}

function buildCodeCard(code) {
  const selected = state.enabledCodes.includes(code.code);
  return `
    <article class="code-card ${selected ? 'selected' : ''}">
      <button class="code-main" data-action="toggle-code" data-id="${escapeHtml(code.code)}">
        <span class="code-name">${escapeHtml(code.code)}</span>
        <span class="code-company">${escapeHtml(code.company)}</span>
      </button>
      <div class="code-flags">
        ${code.recommended ? '<span class="flag">Recommended</span>' : ''}
        ${code.custom ? '<span class="flag muted">Custom</span>' : ''}
      </div>
      <div class="code-actions">
        <button class="icon-button ${code.favorite ? 'active' : ''}" data-action="toggle-favorite" data-id="${escapeHtml(code.code)}" aria-label="Toggle favorite">★</button>
        ${code.custom ? `<button class="icon-button" data-action="delete-code" data-id="${escapeHtml(code.code)}" aria-label="Delete code">✕</button>` : ''}
      </div>
    </article>
  `;
}

function renderCodes() {
  const visibleCodes = getVisibleCodes();
  const container = document.getElementById('codeGrid');

  if (!visibleCodes.length) {
    container.innerHTML = '<p class="empty-copy">No codes match the current filter.</p>';
    return;
  }

  container.innerHTML = visibleCodes.map(buildCodeCard).join('');
}

function refreshScreen() {
  renderInsights();
  renderSelectionSummary();
  renderPresets();
  renderCodes();
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === state.mode);
  });
}

function toggleCode(code) {
  const normalized = normalizeCode(code);
  if (state.enabledCodes.includes(normalized)) {
    state.enabledCodes = state.enabledCodes.filter((value) => value !== normalized);
  } else {
    state.enabledCodes = [...state.enabledCodes, normalized];
  }
  persistClientState();
  refreshScreen();
}

function toggleFavorite(code) {
  const normalized = normalizeCode(code);
  if (state.favoriteCodes.includes(normalized)) {
    state.favoriteCodes = state.favoriteCodes.filter((value) => value !== normalized);
  } else {
    state.favoriteCodes = [...state.favoriteCodes, normalized];
  }
  persistClientState();
  refreshCatalog();
  refreshScreen();
}

function deleteCode(code) {
  const normalized = normalizeCode(code);
  state.customCodes = state.customCodes.filter((entry) => entry.code !== normalized);
  state.enabledCodes = state.enabledCodes.filter((entry) => entry !== normalized);
  state.favoriteCodes = state.favoriteCodes.filter((entry) => entry !== normalized);
  saveCustomCodes(state.customCodes);
  persistClientState();
  refreshCatalog();
  refreshScreen();
}

function applyPreset(id) {
  const preset = state.presets.find((item) => item.id === id);
  if (!preset) return;
  state.enabledCodes = preset.dynamic === 'recommended'
    ? state.codes.filter((code) => code.recommended).map((code) => code.code)
    : [...(preset.codes || [])];
  persistClientState();
  refreshScreen();
}

function deletePreset(id) {
  state.customPresets = state.customPresets.filter((preset) => preset.id !== id);
  state.presets = state.presets.filter((preset) => preset.id !== id);
  saveCustomPresets(state.customPresets);
  refreshScreen();
}

function addCustomCode() {
  const codeInput = document.getElementById('newCodeInput');
  const companyInput = document.getElementById('newCompanyInput');
  const code = normalizeCode(codeInput.value);
  const company = companyInput.value.trim();

  if (!code || !company) {
    window.alert('Both code and company are required.');
    return;
  }

  if (state.codes.some((entry) => entry.code === code)) {
    window.alert('That code already exists in the library.');
    return;
  }

  state.customCodes = [...state.customCodes, { code, company }];
  saveCustomCodes(state.customCodes);
  state.enabledCodes = [...state.enabledCodes, code];
  persistClientState();
  refreshCatalog();
  refreshScreen();
  codeInput.value = '';
  companyInput.value = '';
}

function savePresetFromSelection() {
  const nameInput = document.getElementById('presetNameInput');
  const name = nameInput.value.trim();

  if (!name) {
    window.alert('Preset name is required.');
    return;
  }
  if (!state.enabledCodes.length) {
    window.alert('Select at least one code before saving a preset.');
    return;
  }

  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  const preset = {
    id,
    name,
    icon: 'custom',
    codes: [...state.enabledCodes],
    isDefault: false,
  };

  state.customPresets = [preset, ...state.customPresets];
  state.presets = [...state.presets, preset];
  saveCustomPresets(state.customPresets);
  renderPresets();
  nameInput.value = '';
}

function attachListeners() {
  document.getElementById('searchInput').addEventListener('input', (event) => {
    state.filter = event.target.value;
    renderCodes();
  });

  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      refreshScreen();
    });
  });

  document.getElementById('addCodeButton').addEventListener('click', addCustomCode);
  document.getElementById('savePresetButton').addEventListener('click', savePresetFromSelection);

  document.body.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const { action, id } = trigger.dataset;
    if (action === 'toggle-code') toggleCode(id);
    if (action === 'toggle-favorite') toggleFavorite(id);
    if (action === 'delete-code') deleteCode(id);
    if (action === 'apply-preset') applyPreset(id);
    if (action === 'delete-preset') deletePreset(id);
  });
}

async function init() {
  const bootstrap = await apiFetch('/api/bootstrap');
  mergeBootstrap(bootstrap);
  attachListeners();
  refreshScreen();
}

init().catch((error) => {
  console.error(error);
  document.getElementById('codeGrid').innerHTML = `<p class="empty-copy">${escapeHtml(error.message)}</p>`;
});
