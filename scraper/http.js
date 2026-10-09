import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRobots, isAllowed } from './robots.js';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Raised when a site refuses us (robots.txt, 403, 429). We never try to get around it. */
export class BlockedError extends Error {}

/**
 * Page fetcher used by every source.
 *  - live mode: native fetch with an honest User-Agent, a delay between requests, a timeout,
 *    one retry on network errors / 5xx, and a robots.txt check before every request.
 *  - fixtures mode: reads previously saved HTML from scraper/fixtures (for offline demos and tests).
 */
export function createFetcher({ mode = 'live', userAgent, delayMs = 2000, timeoutMs = 20000, log = () => {} }) {
  const robotsCache = new Map(); // origin -> rules
  let lastRequestAt = 0;

  async function rawFetch(url) {
    const wait = lastRequestAt + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IN,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  async function robotsFor(origin) {
    if (robotsCache.has(origin)) return robotsCache.get(origin);
    let rules = [];
    try {
      const res = await rawFetch(`${origin}/robots.txt`);
      if (res.ok) rules = parseRobots(await res.text());
      else log(`robots.txt for ${origin} returned ${res.status}; treating as no restrictions`);
    } catch (e) {
      log(`could not read robots.txt for ${origin} (${e.message}); treating as no restrictions`);
    }
    robotsCache.set(origin, rules);
    return rules;
  }

  /** @returns {Promise<string>} the page HTML */
  async function getHtml(url, { fixture } = {}) {
    if (mode === 'fixtures') {
      const file = fixture && path.join(FIXTURE_DIR, fixture);
      if (!file || !fs.existsSync(file)) throw new Error(`no fixture for ${url}`);
      return fs.readFileSync(file, 'utf8');
    }

    const u = new URL(url);
    const rules = await robotsFor(u.origin);
    if (!isAllowed(rules, u.pathname + u.search)) throw new BlockedError(`robots.txt disallows ${u.pathname + u.search}`);

    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await rawFetch(url);
        if (res.status === 403 || res.status === 429) throw new BlockedError(`HTTP ${res.status} from ${u.host} - stopping, not bypassing`);
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { noRetry: true });
        const type = res.headers.get('content-type') || '';
        if (!/html/i.test(type)) throw Object.assign(new Error(`unexpected content-type ${type}`), { noRetry: true });
        return await res.text();
      } catch (e) {
        if (e instanceof BlockedError || e.noRetry) throw e;
        lastErr = e;
        log(`attempt ${attempt} failed for ${url}: ${e.message}`);
        if (attempt < 2) await sleep(delayMs * 2);
      }
    }
    throw lastErr;
  }

  return { getHtml, mode };
}
