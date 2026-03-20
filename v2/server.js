const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { RitzStore } = require('./lib/store');
const { SearchJobManager } = require('./lib/search-jobs');

const app = express();
const store = new RitzStore();
const jobs = new SearchJobManager({ store, concurrency: 4 });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, '..')));

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

app.get('/api/bootstrap', (req, res) => {
  res.json(store.getBootstrap());
});

app.get('/api/state', (req, res) => {
  res.json(store.getState());
});

app.put('/api/state', (req, res) => {
  res.json(store.updateState(req.body || {}));
});

app.post('/api/migrations/client-state', (req, res) => {
  res.json(store.importClientState(req.body || {}));
});

app.get('/api/codes', (req, res) => {
  res.json({ codes: store.getCodes() });
});

app.post('/api/codes', (req, res) => {
  try {
    const code = store.createCode(req.body || {});
    res.status(201).json({ success: true, code, codes: store.getCodes() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/codes/:code', (req, res) => {
  try {
    const code = store.updateCode(req.params.code, req.body || {});
    res.json({ success: true, code, codes: store.getCodes() });
  } catch (error) {
    const status = error.message === 'Code not found' ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

app.delete('/api/codes/:code', (req, res) => {
  try {
    store.deleteCode(req.params.code);
    res.json({ success: true, codes: store.getCodes() });
  } catch (error) {
    const status = error.message === 'Code not found' ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

app.post('/api/codes/:code/favorite', (req, res) => {
  try {
    const favorite = req.body?.favorite !== undefined ? Boolean(req.body.favorite) : true;
    const code = store.setFavorite(req.params.code, favorite);
    res.json({ success: true, code, codes: store.getCodes() });
  } catch (error) {
    const status = error.message === 'Code not found' ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

app.get('/api/presets', (req, res) => {
  res.json({ presets: store.getPresets() });
});

app.post('/api/presets', (req, res) => {
  try {
    const id = req.body?.id || `preset-${Date.now()}`;
    const preset = store.upsertPreset({
      id,
      name: req.body?.name,
      icon: req.body?.icon,
      codes: req.body?.codes,
      isDefault: false,
      dynamic: req.body?.dynamic || null,
    });
    res.status(201).json({ success: true, preset, presets: store.getPresets() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/presets/:id', (req, res) => {
  try {
    const existing = store.getPresets().find((preset) => preset.id === req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Preset not found' });
    }
    const preset = store.upsertPreset({
      ...existing,
      ...req.body,
      id: req.params.id,
      isDefault: existing.isDefault,
    });
    res.json({ success: true, preset, presets: store.getPresets() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/presets/:id', (req, res) => {
  try {
    store.deletePreset(req.params.id);
    res.json({ success: true, presets: store.getPresets() });
  } catch (error) {
    const status = error.message === 'Preset not found' ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

app.get('/api/history', (req, res) => {
  res.json({ history: store.getHistory() });
});

app.get('/api/insights', (req, res) => {
  res.json({ insights: store.getInsights() });
});

app.post('/api/search-jobs', (req, res) => {
  const { city, country, checkIn, checkOut, codes, debug } = req.body || {};
  if (!city || !checkIn || !checkOut || !Array.isArray(codes) || codes.length === 0) {
    return res.status(400).json({ error: 'city, checkIn, checkOut, and codes are required' });
  }

  const job = jobs.startJob({
    city,
    country: country || '',
    checkIn,
    checkOut,
    codes,
  }, { debug: Boolean(debug) });

  res.status(202).json(job);
});

app.get('/api/search-jobs/:id', (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Search job not found' });
  }
  res.json(job);
});

app.post('/api/search-jobs/:id/retry-failed', (req, res) => {
  try {
    const job = jobs.retryFailed(req.params.id);
    res.status(202).json(job);
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Ritz-Weaselton server running at http://localhost:${PORT}`);
  console.log(`SQLite data: ${path.join(__dirname, 'data', 'ritzweazelton.sqlite')}`);
});
