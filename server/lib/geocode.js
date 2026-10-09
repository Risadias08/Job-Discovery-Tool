import { getDb } from '../db.js';
import { CITY_COORDS } from './geo.js';

// OpenStreetMap's Nominatim service asks for: an identifying User-Agent, at most 1 request/second, and caching.
// We do all three: every answer (including "not found") is stored in the geocache table and never asked again.
const USER_AGENT = 'GradGuideStudentProject/1.0 (educational project)';
const MIN_GAP_MS = 1100;
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const cacheKey = (q) => q.toLowerCase().replace(/\s+/g, ' ').trim();

async function nominatim(query) {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), name: hit.display_name } : null;
}

/** Cache-first lookup. Returns { lat, lng, name } or null (not found). Throws on network errors (not cached, so retried later). */
export async function lookup(query, db = getDb()) {
  const key = cacheKey(query);
  const cached = db.prepare('SELECT lat, lng, display_name, found FROM geocache WHERE query = ?').get(key);
  if (cached) return cached.found ? { lat: cached.lat, lng: cached.lng, name: cached.display_name } : null;
  const hit = await nominatim(query);
  db.prepare('INSERT OR REPLACE INTO geocache (query, lat, lng, display_name, found) VALUES (?, ?, ?, ?, ?)').run(
    key,
    hit?.lat ?? null,
    hit?.lng ?? null,
    hit?.name ?? null,
    hit ? 1 : 0
  );
  return hit;
}

/** Built-in coordinates for major cities, otherwise a cached lookup. */
export async function cityPoint(city, db = getDb()) {
  const known = CITY_COORDS[city.toLowerCase()];
  if (known) return { lat: known[0], lng: known[1], name: city };
  return lookup(`${city}, India`, db);
}
