import { createHash } from 'node:crypto';

/**
 * Two listings are "the same job" if they share a URL, or the same title + employer + location text.
 * The key is stored in jobs.dedupe_key (UNIQUE) so duplicates are also rejected at the database level.
 */
export function dedupeKey(listing) {
  const part = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Full location text, not just the city: one employer's openings in different localities are different jobs.
  const where = listing.location?.raw ?? '';
  return createHash('sha1')
    .update([part(listing.title), part(listing.employer), part(where)].join('|'))
    .digest('hex');
}

/**
 * Remove duplicates, keeping the first occurrence (so earlier / more specific sources win).
 * Returns { unique, duplicates } so the caller can report how many were dropped.
 */
export function dedupe(listings, seen = { urls: new Set(), keys: new Set() }) {
  const unique = [];
  let duplicates = 0;
  for (const l of listings) {
    const key = dedupeKey(l);
    if (seen.urls.has(l.url) || seen.keys.has(key)) {
      duplicates++;
      continue;
    }
    seen.urls.add(l.url);
    seen.keys.add(key);
    unique.push(l);
  }
  return { unique, duplicates };
}
