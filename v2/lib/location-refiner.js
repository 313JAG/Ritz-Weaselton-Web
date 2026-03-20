const GEOCODER_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const GEOCODER_USER_AGENT = 'Ritz-Weaselton/1.0 (hosted prototype geocoder)';
const MAX_LOOKUPS_PER_BATCH = 8;
const LOOKUP_CONCURRENCY = 2;
const MILES_PER_METER = 0.000621371;

function getCache() {
  if (!globalThis.__ritzWeaseltonGeoCache) {
    globalThis.__ritzWeaseltonGeoCache = new Map();
  }
  return globalThis.__ritzWeaseltonGeoCache;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMiles(from, to) {
  const earthRadiusMiles = 3958.7613;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function getCountryName(countryCode) {
  if (!countryCode) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
}

function buildQueries(hotel, params) {
  const city = params.city || '';
  const countryName = getCountryName(params.country || '');
  const parts = [hotel.name, city, countryName].filter(Boolean);
  const broad = parts.join(', ');
  return [
    broad,
    [hotel.name, 'hotel', city, countryName].filter(Boolean).join(', '),
  ].filter(Boolean);
}

async function geocodeQuery(query) {
  const url = new URL(GEOCODER_ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'accept-language': 'en',
      'user-agent': GEOCODER_USER_AGENT,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => []);
  const match = Array.isArray(payload) ? payload[0] : null;
  if (!match?.lat || !match?.lon) {
    return null;
  }

  return {
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    displayName: match.display_name || '',
  };
}

async function geocodeHotel(hotel, params) {
  const cache = getCache();
  const cacheKey = `${hotel.name}|${params.city || ''}|${params.country || ''}`.toLowerCase();
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let location = null;
  for (const query of buildQueries(hotel, params)) {
    location = await geocodeQuery(query);
    if (location) break;
  }

  cache.set(cacheKey, location);
  return location;
}

function needsGeocode(hotel, searchCenter) {
  if (!isFiniteNumber(hotel.latitude) || !isFiniteNumber(hotel.longitude)) {
    return true;
  }

  if (
    !searchCenter ||
    !isFiniteNumber(searchCenter.latitude) ||
    !isFiniteNumber(searchCenter.longitude) ||
    !isFiniteNumber(hotel.distanceMeters)
  ) {
    return false;
  }

  const geoMiles = haversineMiles(
    { latitude: searchCenter.latitude, longitude: searchCenter.longitude },
    { latitude: hotel.latitude, longitude: hotel.longitude }
  );
  const reportedMiles = hotel.distanceMeters * MILES_PER_METER;
  const drift = Math.abs(geoMiles - reportedMiles);
  const ratio =
    reportedMiles > 0.25 && geoMiles > 0.25
      ? Math.max(geoMiles, reportedMiles) / Math.min(geoMiles, reportedMiles)
      : 1;

  return drift > 4 && ratio > 1.75;
}

async function runPool(items, worker, concurrency) {
  let index = 0;

  async function loop() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      await worker(items[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => loop())
  );
}

async function refineHotelLocations(hotels, params, searchCenter) {
  const candidates = hotels.filter((hotel) => needsGeocode(hotel, searchCenter)).slice(0, MAX_LOOKUPS_PER_BATCH);
  if (!candidates.length) {
    return hotels;
  }

  const updates = new Map();
  await runPool(
    candidates,
    async (hotel) => {
      const location = await geocodeHotel(hotel, params);
      if (!location) return;
      updates.set(hotel.name, location);
    },
    LOOKUP_CONCURRENCY
  );

  if (!updates.size) {
    return hotels;
  }

  return hotels.map((hotel) => {
    const update = updates.get(hotel.name);
    if (!update) return hotel;
    return {
      ...hotel,
      latitude: update.latitude,
      longitude: update.longitude,
      locationSource: 'geocoded',
      locationLabel: update.displayName || hotel.locationLabel || '',
    };
  });
}

module.exports = {
  refineHotelLocations,
};
