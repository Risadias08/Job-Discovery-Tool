# How the scraper works

Our own Node.js code: it fetches real web pages, parses the HTML with Cheerio, turns each job card into a common structure, removes duplicates and stores the result in SQLite. No job-board API, no browser automation, no AI/LLM involved.

```
npm run scrape                            # all sources, live, saved to the database
npm run scrape -- --source internshala    # one source (comma-separate for several)
npm run scrape -- --fixtures              # offline: use the saved HTML in scraper/fixtures
npm run scrape -- --dry-run --show 3      # parse only, print 3 normalised listings per source
npm run scrape -- --limit 20 --max-pages 1
```

Pipeline: `fetch page -> parse HTML cards -> normalise each -> deduplicate -> save`.

| Step | File |
|---|---|
| Orchestration, per-source error isolation, run log | `scraper/scraper.js` |
| Fetching (robots.txt, delay, retry, User-Agent) | `scraper/http.js`, `scraper/robots.js` |
| Which pages to scrape per site | `scraper/sources/*.js` |
| HTML -> raw fields (all CSS selectors live here) | `scraper/parser/*.js` |
| Raw text -> clean fields (pay, date, location, type) | `scraper/normalizer/*.js` |
| Duplicate removal | `scraper/deduplicator/index.js` |
| Writing to SQLite | `scraper/store.js` |

## Sources

Chosen after checking each site's robots.txt and confirming that job cards are present in the raw HTML (no JavaScript rendering needed). Sites that were JS-only (TimesJobs, Shine, Foundit, Apna) were dropped.

| Source | Pages scraped | Gives us |
|---|---|---|
| **Internshala** | `/internships/part-time-jobs/`, `/internships/work-from-home-internships/`, `/jobs/`, `/jobs/part-time-jobs/` (3 pages each) | internships, full-time and part-time jobs |
| **Freshersworld** | category pages: part-time, internship, retail, hospitality (page 1) | part-time, internship, retail/hospitality roles |
| **WorkIndia** | part-time, delivery and cook pages for Bengaluru, Delhi and Mumbai (page 1) | everyday and casual jobs (delivery, cooking, part-time) |

Selectors were written from the real pages, not guessed. For example Internshala cards are `.individual_internship` with the title in `a.job-title-href`; Freshersworld cards are `.job-container`; WorkIndia cards are `.JobItemV3`. If a site changes its markup, only the matching file in `scraper/parser/` needs updating.

## Fetching

- Native `fetch` with an honest User-Agent (`Mozilla/5.0 (compatible; GradGuideStudentProject/1.0; educational)`), configurable in `.env`.
- robots.txt is downloaded and checked before every request. Internshala disallows query strings and detail pages, and WorkIndia disallows `?pg=` pagination, so we only request clean listing URLs and never open job detail pages. Everything is read from the listing cards.
- 2 second delay between requests (`SCRAPER_DELAY_MS`), 20 second timeout, one retry on network errors or HTTP 5xx.
- On HTTP 403/429 or a robots.txt block the scraper stops that source. It does not try to get around it.

## HTML parsing

Each parser loads a page into Cheerio, selects the job cards, and returns plain strings per card (title, url, employer, location, pay, posted text, description). A card that throws is recorded and skipped; the rest of the page continues.

## Normalisation

Every adapter returns the same structure:

```
{ title, employer, location:{raw,city,remote}, pay:{raw,min,max,currency,unit},
  jobType, postedDate, description, url, source, category, externalId }
```

- **Whitespace** is collapsed everywhere.
- **Pay**: handles Indian grouping (`4,50,000`), `/year`, `/month`, `/week`, `lump sum`, `Unpaid`, `$` vs `₹`. WorkIndia and Freshersworld prices have no unit; we assume monthly in INR, because every value seen is a monthly-size figure (8,000-65,000). The original text is always kept in `pay.raw`.
- **Posted date**: `Few hours ago`, `5 days ago`, `1 months ago`, `Posted on: 9/25/2026` (month/day/year) become `YYYY-MM-DD`. Relative dates are measured from the scrape time.
- **Location**: city extraction with aliases (Bangalore -> Bengaluru, Gurgaon -> Gurugram). "Work from home" is flagged remote with no city.
- **Job type** is one of `part_time`, `casual`, `full_time`, `internship`, `unknown`. Evidence order: a type shown on the card, then keywords in the title ("Intern"), then the default for the page we scraped. So a job on the "internship" category page is an internship, and WorkIndia's delivery and cook pages are `casual`.
- **Validation**: title and a valid http(s) URL are required. Everything else may be missing and is stored as null.

## Second pass: job timings (WorkIndia only)

Listing cards have no working hours, but each WorkIndia job's own page publishes "Job Timings". After saving the listings, `scraper/enrich.js` visits the detail pages of jobs it hasn't checked yet (at most `SCRAPER_MAX_DETAILS` per run, default 200, one request every 2 seconds; `--details 0` skips it) and `scraper/parser/workindiaDetail.js` reads `section.JobDetailContainer > div > h3 ("Job Timings") + p`. The text is turned into hours per week by `scraper/normalizer/hours.js`:

- `3 hours a day | Monday to Saturday | day shift` -> 18 h/week
- `9:30 AM - 6:30 PM | Monday to Saturday` -> 54 h/week (shift length x days)
- `ANY TIME | day shift` -> no weekly hours (shown as "hours not listed")

Weekly hours are only computed when both hours per day and the days are stated, so nothing is guessed. A job is marked checked even if it has no timings, so it isn't fetched twice. A 403/429 stops the pass.

## Geocoding (for the distance feature)

`npm run geocode` (`scraper/geocode.js`) gives each job approximate coordinates, stored in `jobs.lat/lng` with a `geo_precision`:

- **locality** - WorkIndia prints "Area, City"; the area is looked up on OpenStreetMap Nominatim. Results more than 60 km from the city centre are discarded.
- **city** - Internshala and Freshersworld only give a city: a built-in table for 20 major cities, otherwise a Nominatim lookup.
- Remote jobs get none. Every lookup (including "not found") is cached in the `geocache` table; requests are limited to 1 per second with an identifying User-Agent, as Nominatim's usage policy asks.

## Deduplication

Two listings are the same job if they share a URL, or the same title + employer + location text. This runs across all sources in a run, and again in the database (`jobs.url` and `jobs.dedupe_key` are both UNIQUE). Re-running the scraper refreshes existing rows instead of adding copies.

## Error handling

- A bad card is logged and skipped.
- A failed page is logged; the next page or target still runs.
- A failed or blocked source is logged; the other sources still run.
- Every run is recorded in `scrape_runs` (pages fetched, items parsed and saved, errors), and `sources` keeps the last status.

## Limitations

- Only the first listing pages are read, so this is a sample of each site, not a full crawl. Freshersworld and WorkIndia are page 1 only (no allowed pagination).
- Working hours exist only for WorkIndia (see "Second pass" below). Internshala's detail pages are disallowed and Freshersworld's have no structured hours, so those listings have no hours.
- Descriptions are the short text shown on the card, because detail pages are off limits.
- WorkIndia unit-less salaries are assumed monthly INR.
- "Casual" is our label for everyday service/gig roles; the sites do not use it.
- Jobs that disappear from a site are not yet marked inactive.
- Selectors depend on each site's current markup and will need updating if it changes.
- **Terms of use.** robots.txt allows every page we request (checked against each site's live robots.txt), but all three sites' terms of use prohibit automated scraping or data extraction (Internshala, Freshersworld and WorkIndia each have a clause). This is an educational assignment, so the scraper is deliberately small and polite (a few dozen pages per run, 2 s apart, honest User-Agent, no logins, no bypassing, links back to every original, data kept locally and not republished). Don't run it at scale or commercially; for real use, ask the sites for permission or use a source whose terms allow it.
- **Saved samples.** `scraper/fixtures/` holds only a few trimmed cards per page (about 380 KB), enough to test the parsers and run the offline demo, not copies of whole pages.
