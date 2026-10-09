import { BlockedError } from './http.js';
import { parseWorkindiaDetail } from './parser/workindiaDetail.js';
import { parseJobTimings } from './normalizer/hours.js';

/**
 * Second pass for WorkIndia: listing cards carry no working hours, but each job's own page publishes "Job Timings".
 * We visit the detail pages of listings we haven't checked yet (at most `limit` per run, one every `delayMs`),
 * parse the timings and store them. Pages are allowed by WorkIndia's robots.txt (no query strings are used).
 * A listing is marked as checked even when it has no timings, so it is never fetched twice.
 */
export async function enrichWorkindiaDetails(fetcher, db, { limit = 200, log = console.log } = {}) {
  const todo = db
    .prepare(
      `SELECT j.id, j.url FROM jobs j JOIN sources s ON s.id = j.source_id
       WHERE s.name = 'workindia' AND j.is_active = 1 AND j.detail_checked_at IS NULL
       ORDER BY j.id DESC LIMIT ?`
    )
    .all(limit);
  const update = db.prepare(
    `UPDATE jobs SET hours_raw = ?, hours_per_week_min = ?, hours_per_week_max = ?, detail_checked_at = datetime('now') WHERE id = ?`
  );
  const stats = { checked: 0, withTimings: 0, withWeeklyHours: 0, errors: [] };
  log(`  fetching ${todo.length} WorkIndia detail pages for job timings`);

  for (const job of todo) {
    try {
      const html = await fetcher.getHtml(job.url);
      const { timings } = parseWorkindiaDetail(html);
      const t = parseJobTimings(timings);
      update.run(t?.raw ?? null, t?.weekly?.min ?? null, t?.weekly?.max ?? null, job.id);
      stats.checked++;
      if (t) stats.withTimings++;
      if (t?.weekly) stats.withWeeklyHours++;
      if (stats.checked % 25 === 0) log(`  ... ${stats.checked}/${todo.length}`);
    } catch (e) {
      stats.errors.push(`${job.url}: ${e.message}`);
      log(`  ! ${job.url}: ${e.message}`);
      if (e instanceof BlockedError) break; // never push through a refusal
    }
  }
  return stats;
}
