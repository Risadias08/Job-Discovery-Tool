import { config } from '../server/config.js';
import { getDb } from '../server/db.js';
import { createFetcher } from './http.js';
import { dedupe } from './deduplicator/index.js';
import { saveListings } from './store.js';
import { enrichWorkindiaDetails } from './enrich.js';
import * as internshala from './sources/internshala.js';
import * as freshersworld from './sources/freshersworld.js';
import * as workindia from './sources/workindia.js';

export const SOURCES = { internshala, freshersworld, workindia };

/**
 * The whole pipeline:  for each source -> fetch pages -> parse HTML -> normalise -> dedupe -> save to SQLite.
 * One source failing never stops the others. Returns a summary per source.
 *
 * options: { sources: string[], mode: 'live'|'fixtures', limit, maxPages, details, save: boolean, log }
 * details = how many WorkIndia detail pages to visit for job timings (live + save only; 0 = skip)
 */
export async function runScraper({
  sources = Object.keys(SOURCES),
  mode = 'live',
  limit = Infinity,
  maxPages = config.scraper.maxPages,
  details = config.scraper.maxDetails,
  save = true,
  log = console.log,
} = {}) {
  const fetcher = createFetcher({ mode, userAgent: config.scraper.userAgent, delayMs: config.scraper.delayMs, log });
  const db = save ? getDb() : null;
  const seen = { urls: new Set(), keys: new Set() }; // shared so the same job on two sources is only kept once
  const results = [];

  for (const name of sources) {
    const source = SOURCES[name];
    if (!source) throw new Error(`Unknown source "${name}". Available: ${Object.keys(SOURCES).join(', ')}`);
    const startedAt = new Date().toISOString();
    log(`\n[${name}] starting (${mode})`);
    const result = { source: name, fetched: 0, unique: 0, duplicates: 0, inserted: 0, updated: 0, skipped: 0, stats: null, listings: [], failed: null };

    try {
      const { listings, stats } = await source.scrape(fetcher, { maxPages, limit, log });
      const { unique, duplicates } = dedupe(listings, seen);
      Object.assign(result, { fetched: listings.length, unique: unique.length, duplicates, stats, listings: unique });
      if (db) Object.assign(result, saveListings(db, name, unique));
      if (db && name === 'workindia' && mode === 'live' && details > 0) result.details = await enrichWorkindiaDetails(fetcher, db, { limit: details, log });
    } catch (e) {
      result.failed = e.message;
      log(`[${name}] FAILED: ${e.message}`);
    }

    if (db) recordRun(db, name, startedAt, result);
    log(`[${name}] done: ${result.fetched} parsed, ${result.duplicates} duplicates, ${result.inserted} new, ${result.updated} refreshed`);
    results.push(result);
  }
  return results;
}

function recordRun(db, name, startedAt, r) {
  const { id } = db.prepare('SELECT id FROM sources WHERE name = ?').get(name);
  const errors = [...(r.stats?.errors ?? []), ...(r.failed ? [r.failed] : [])];
  const status = r.failed ? 'failed' : errors.length ? 'partial' : 'ok';
  db.prepare(
    `INSERT INTO scrape_runs (source_id, started_at, finished_at, pages_fetched, items_parsed, items_saved, errors)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, startedAt, new Date().toISOString(), r.stats?.pages ?? 0, r.stats?.parsed ?? 0, r.inserted + r.updated, JSON.stringify(errors.slice(0, 50)));
  db.prepare(`UPDATE sources SET last_scraped_at = datetime('now'), last_status = ?, jobs_found = ?, jobs_new = ? WHERE id = ?`).run(
    status,
    r.fetched,
    r.inserted,
    id
  );
}
