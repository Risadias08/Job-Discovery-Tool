import { normalizeListing } from '../normalizer/index.js';
import { BlockedError } from '../http.js';

/**
 * Shared adapter loop. A source definition provides:
 *   name, baseUrl, parse(html) -> { items, errors }, targets[]
 * and each target: { path, fixture?, defaultType, category?, maxPages?, pageUrl?(path, n) }
 *
 * For every target page: fetch -> parse -> normalise each item. A bad item is logged and skipped,
 * a failed page is logged and the next target still runs, and if the site blocks us we stop that source.
 *
 * Returns { listings, stats } where listings all share the normalised structure.
 */
export async function scrapeSource(def, fetcher, { maxPages = 1, limit = Infinity, log, now = new Date() } = {}) {
  const listings = [];
  const stats = { pages: 0, parsed: 0, invalid: 0, errors: [] };
  const err = (msg) => {
    stats.errors.push(msg);
    log(`  ! ${msg}`);
  };

  outer: for (const target of def.targets) {
    const pages = Math.min(target.maxPages ?? 1, maxPages);
    for (let page = 1; page <= pages; page++) {
      if (listings.length >= limit) break outer;
      const path = page === 1 ? target.path : target.pageUrl(target.path, page);
      const url = new URL(path, def.baseUrl).href;

      let html;
      try {
        html = await fetcher.getHtml(url, { fixture: page === 1 ? target.fixture : undefined });
      } catch (e) {
        err(`${url}: ${e.message}`);
        if (e instanceof BlockedError) {
          log(`  site refused the request; skipping the rest of ${def.name}`);
          break outer;
        }
        break; // next target
      }
      stats.pages++;

      const { items, errors } = def.parse(html);
      errors.forEach((m) => err(`${url}: ${m}`));
      log(`  ${url} -> ${items.length} cards`);
      if (items.length === 0) break; // ran off the end of pagination

      const ctx = { ...def.context, baseUrl: def.baseUrl, source: def.name, defaultType: target.defaultType, category: target.category, now };
      for (const raw of items) {
        stats.parsed++;
        try {
          listings.push(normalizeListing(raw, ctx));
        } catch (e) {
          stats.invalid++;
          err(`${url}: skipped "${raw.title ?? '?'}": ${e.message}`);
        }
      }
    }
  }
  return { listings: listings.slice(0, limit), stats };
}
