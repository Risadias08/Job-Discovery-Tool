// CLI for the scraping pipeline.
//   npm run scrape                              all sources, live, saved to SQLite
//   npm run scrape -- --source internshala      one or more sources (comma separated)
//   npm run scrape -- --fixtures                use saved HTML in scraper/fixtures (offline demo)
//   npm run scrape -- --limit 20 --max-pages 1
//   npm run scrape -- --details 0               skip the WorkIndia detail pages (job timings)
//   npm run scrape -- --dry-run --show 3        parse only, don't write to the database; print examples
import { runScraper, SOURCES } from './scraper.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dryRun = flag('dry-run');
const show = Number(value('show') ?? 0);
const requested = value('source')?.split(',').map((s) => s.trim()) ?? Object.keys(SOURCES);
const unknown = requested.filter((s) => !SOURCES[s]);
if (unknown.length) {
  console.error(`Unknown source: ${unknown.join(', ')}. Available sources: ${Object.keys(SOURCES).join(', ')}`);
  process.exit(2);
}
const results = await runScraper({
  sources: requested,
  mode: flag('fixtures') ? 'fixtures' : 'live',
  limit: value('limit') ? Number(value('limit')) : Infinity,
  maxPages: value('max-pages') ? Number(value('max-pages')) : undefined,
  details: value('details') !== undefined ? Number(value('details')) : undefined,
  save: !dryRun,
});

console.log('\n=== Summary ===');
console.table(
  results.map((r) => ({
    source: r.source,
    parsed: r.fetched,
    duplicates: r.duplicates,
    new: r.inserted,
    refreshed: r.updated,
    skipped: r.skipped,
    "detail pages": r.details?.checked ?? "-",
    "with hours": r.details?.withWeeklyHours ?? "-",
    errors: (r.stats?.errors.length ?? 0) + (r.details?.errors.length ?? 0) + (r.failed ? 1 : 0),
  }))
);

if (show > 0) {
  for (const r of results) {
    console.log(`\n--- ${r.source}: first ${show} normalised listings ---`);
    console.log(JSON.stringify(r.listings.slice(0, show), null, 2));
  }
}
if (results.every((r) => r.failed)) process.exitCode = 1;
