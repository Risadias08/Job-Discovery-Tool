import { dedupeKey } from './deduplicator/index.js';

/** Flatten a normalised listing into the columns of the `jobs` table. */
export function toRow(l) {
  return {
    source_job_id: l.externalId,
    url: l.url,
    title: l.title,
    employer: l.employer,
    location_raw: l.location?.raw ?? null,
    city: l.location?.city ?? null,
    is_remote: l.location?.remote ? 1 : 0,
    pay_raw: l.pay?.raw ?? null,
    pay_min: l.pay?.min ?? null,
    pay_max: l.pay?.max ?? null,
    pay_currency: l.pay?.currency ?? null,
    pay_unit: l.pay?.unit ?? 'unknown',
    job_type: l.jobType,
    category: l.category,
    description: l.description,
    posted_at: l.postedDate,
    dedupe_key: dedupeKey(l),
  };
}

const COLS = Object.keys(toRow({ location: null, pay: null, url: '', title: '' }));
const UPSERT = `INSERT INTO jobs (source_id, ${COLS.join(', ')}, scraped_at, is_active)
  VALUES (@source_id, ${COLS.map((c) => '@' + c).join(', ')}, datetime('now'), 1)
  ON CONFLICT(url) DO UPDATE SET ${COLS.filter((c) => !['url', 'dedupe_key'].includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')}, scraped_at = datetime('now'), is_active = 1`;

/**
 * Save listings for one source. Same URL -> row is refreshed; same title+employer+city under a different
 * URL (e.g. the same job on two sites) -> skipped. Runs in one transaction.
 * Returns { inserted, updated, skipped }.
 */
export function saveListings(db, sourceName, listings) {
  const source = db.prepare('SELECT id FROM sources WHERE name = ?').get(sourceName);
  if (!source) throw new Error(`unknown source ${sourceName}`);
  const byUrl = db.prepare('SELECT id FROM jobs WHERE url = ?');
  const byKey = db.prepare('SELECT id FROM jobs WHERE dedupe_key = ?');
  const upsert = db.prepare(UPSERT);
  const counts = { inserted: 0, updated: 0, skipped: 0 };

  db.exec('BEGIN');
  try {
    for (const l of listings) {
      const row = toRow(l);
      if (byUrl.get(row.url)) counts.updated++;
      else if (byKey.get(row.dedupe_key)) {
        counts.skipped++;
        continue;
      } else counts.inserted++;
      upsert.run({ source_id: source.id, ...row });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return counts;
}
