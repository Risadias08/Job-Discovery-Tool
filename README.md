# International Student Job Discovery Tool

*(Project name in the code: GradGuide.)*

## Overview

A job discovery web app for international students studying in India. It collects real listings from three job sites with a custom-built scraper, stores them in SQLite, and lets students search them with filters plus three student-focused features: work-hours compatibility, campus/commute matching and an application tracker.

- One-page write-up: [WRITEUP.md](WRITEUP.md)
- Scraper details: [SCRAPER.md](SCRAPER.md)
- Demo video script: [docs/video]

## Problem

International students look for internships, full-time jobs and part-time, casual or everyday jobs (delivery, cooking, retail, helper roles) at the same time. Listings are spread across sites with different layouts, and an ad rarely answers what a student needs to know: do the hours fit around classes, is the commute from campus realistic, and what have I already applied for?

## Key Features

- **Job discovery:** listings scraped from Internshala, Freshersworld and WorkIndia, shown in one place with title, employer, location, pay, job type and posted date, plus links to view the job and apply on the original site.
- **Search and filters:** keyword, location, job type, minimum pay, posted date, source, work from home, maximum distance and work hours; sort by newest, highest pay or nearest.
- **Part-time and casual jobs:** job type filter (`part_time`, `casual`).
- **Full-time jobs:** job type filter (`full_time`).
- **Internships:** job type filter (`internship`).
- **Everyday jobs:** delivery, cook and similar roles, labelled "casual" (our label; the sites do not use it), mainly from WorkIndia.
- **Work-hours compatibility:** the student enters their own weekly limit and hours already used; each job is labelled *Fits your hours*, *May fit your hours*, *More than your free hours* or *Hours not listed*, and the list can be filtered by it. Informational only: no immigration or visa rules are built in, and it never says a job is allowed or prohibited.
- **Campus/commute matching:** pick one of 8 built-in campuses or search a place; each job shows an approximate straight-line distance (Close / Moderate / Far relative to the student's maximum commute), and results can be sorted by nearest or filtered by distance. Work-from-home jobs show "no commute".
- **Application tracker:** save a job and track its status (Saved, Applied, Interview, Offer, Rejected), application date and notes; filter by status.

## Architecture

```
Job sites ──fetch+parse──> Scraper ──> SQLite <──> Express API <──> React app
(Internshala,             (Node.js,    (node:sqlite)  (/api/...)     (Vite, Tailwind)
 Freshersworld,            Cheerio)
 WorkIndia)
```

- **Frontend (`client/`):** React single-page app with four pages: search, job detail, preferences and tracker. In development, Vite proxies `/api` to the backend.
- **Backend (`server/`):** Express API with zod input validation. Computes the hours-fit label and the distance for each job from the saved preferences, and serves the built frontend when `client/dist` exists.
- **Scraper (`scraper/`):** Node.js script run from the command line (not part of the server process). It writes straight to the same SQLite file.
- **Database:** a single SQLite file (`data/gradguide.db`) using Node's built-in `node:sqlite`. Single local user, no login.

## Scraper

The scraper is **custom-built code. It does not use any job-board API and does not use AI scraping services.**

- **Real sources:** Internshala, Freshersworld and WorkIndia. They were chosen because their job cards are present in the raw HTML (no JavaScript rendering needed).
- **Fetching:** Node's native `fetch` with an identifying User-Agent. robots.txt is checked before every request; there is a delay between requests (default 2 s), a 20 s timeout and one retry on network errors or HTTP 5xx. On HTTP 403/429 or a robots.txt block, it stops that source and does not try to get around it.
- **HTML parsing:** Cheerio with CSS selectors per site (in `scraper/parser/`), written from the real pages. A card that fails to parse is logged and skipped. For WorkIndia, a second pass visits each job's page to read "Job Timings".
- **Normalization:** into one common structure: pay (Indian digit grouping, units, currency), relative dates to calendar dates, city and work-from-home, job type (card, then title keywords, then the category page scraped), and hours per week (only when both hours per day and days are stated).
- **Deduplication:** a listing is a duplicate if its URL, or its title + employer + location text, was already seen. This runs across sources in a run and again in the database (`jobs.url` and `jobs.dedupe_key` are both `UNIQUE`). Re-running refreshes existing rows rather than adding copies.
- **Geocoding:** a separate step (`npm run geocode`) adds approximate coordinates using cached OpenStreetMap Nominatim lookups (1 request per second).
- **Limitations:**
  - It reads only the first pages of selected categories, so the data is a sample, not a full crawl.
  - Selectors break if a site changes its HTML.
  - Jobs that disappear from a site are not marked inactive.
  - Descriptions are the short text on the card.
  - **Terms of use:** robots.txt allows the pages requested, but all three sites' terms of use prohibit automated scraping. This is an educational project, kept small and polite (a few dozen pages per run, honest User-Agent, no logins, every listing links back to its source). Do not use it commercially or at scale; ask the sites for permission or use a source whose terms allow it.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router, Vite, Tailwind CSS v4 |
| Backend | Node.js (>= 22.13), Express 5, zod, dotenv, cors |
| Scraper | Node.js native `fetch`, Cheerio |
| Database | SQLite via `node:sqlite` |
| Tests | `node --test`; Playwright (`playwright-core`) driving an installed Edge or Chrome for browser tests |

## Project Structure

```
client/    React app (src/pages, src/components, src/api.js)
server/    Express app: routes/, lib/ (hoursFit, geo, geocode, validate), schema.sql,
           db.js, db-setup.js, data/campuses.json, __tests__/
scraper/   scraper.js (pipeline), index.js (CLI), sources/ (pages per site), parser/ (HTML -> fields),
           normalizer/, deduplicator/, http.js + robots.js (fetching), enrich.js (WorkIndia timings),
           geocode.js, store.js, fixtures/ (small trimmed HTML samples), __tests__/
e2e/       Browser tests (smoke.mjs, ui.test.mjs)
data/      SQLite file (git-ignored)
docs/      Screenshots and the demo video script
```

## Installation

Requires **Node.js 22.13 or newer** (check with `node -v`). No separate database install is needed: SQLite is built into Node.

### Quick start (fresh clone)

A fresh clone has no dependencies, no `.env` and no jobs. The database file is created automatically on first run but starts empty, so run a scrape before using the app.

```bash
# 1. Clone and enter the folder
git clone <your-repo-url>
cd <repo-folder-name>

# 2. Install dependencies (root + client)
npm run install:all

# 3. Optional: copy the settings template (defaults work without it)
copy .env.example .env      # Windows
cp .env.example .env        # macOS / Linux

# 4. Load jobs (choose one)
npm run scrape -- --fixtures      # seconds, offline, small sample
npm run scrape -- --details 30    # live data, about 5-8 min
npm run geocode                   # adds distances; run after a live scrape (needs internet)
# or: npm run refresh             # full live scrape + geocode, about 15-20 min

# 5. Start the backend and frontend together
npm run dev
```

Then open **http://localhost:5173** (if that port is busy, use the address Vite prints). The header should show "API ok - N jobs".

`npm run install:all` runs `npm install` in the root and in `client/`.

## Environment Variables

All are optional. Copy `.env.example` to `.env` to change them.

| Variable | Default | Used for |
|---|---|---|
| `PORT` | `4000` | API port |
| `DB_PATH` | `data/gradguide.db` | SQLite file location |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `SCRAPER_USER_AGENT` | `Mozilla/5.0 (compatible; GradGuideStudentProject/1.0; educational)` | User-Agent sent by the scraper |
| `SCRAPER_DELAY_MS` | `2000` | Delay between scraper requests |
| `SCRAPER_MAX_PAGES` | `3` | Max pages per target (sources may allow fewer) |
| `SCRAPER_MAX_DETAILS` | `200` | WorkIndia detail pages visited per run; `0` skips |

For the browser tests only: `APP_URL` and `API_URL` (see Testing).

## Running the Application

The app starts empty: it only has jobs after a scrape.

**Scraper** (needs internet; 2 s between requests on purpose):

```bash
npm run scrape                          # all sources, live
npm run scrape -- --source internshala  # one source
npm run scrape -- --fixtures            # offline, using saved sample HTML (seconds)
npm run scrape -- --dry-run --show 3    # parse only, print 3 listings per source
npm run geocode                         # add coordinates (needed for distances)
npm run refresh                         # scrape + geocode (about 15-20 min)
```

Faster live run: `npm run scrape -- --details 30` then `npm run geocode`.

**Backend** (API on http://localhost:4000):

```bash
npm start
```

**Frontend** (dev server on http://localhost:5173; if the port is taken Vite prints another):

```bash
npm run dev:client
```

**Both together in development:**

```bash
npm run dev
```

**Single process:** build the frontend, then the API also serves it:

```bash
npm run build
npm start        # open http://localhost:4000
```

## Database

SQLite file at `data/gradguide.db` (or `DB_PATH`). It is created automatically with the schema from `server/schema.sql` the first time the server, scraper or setup script runs; no manual step is required. Opening it also applies small migrations for columns added later.

```bash
npm run db:setup    # create/initialise (safe to repeat)
npm run db:reset    # delete the database file and recreate it empty
```

Tables: `sources`, `jobs`, `applications`, `preferences` (a single row), `geocache` and `scrape_runs`.

## Testing

```bash
npm test               # backend + scraper tests (node --test)
npm run test:smoke     # short browser check of the main workflow against npm start
npm run test:e2e       # full browser suite against the dev app and live-scraped data
```

The browser tests need Edge or Chrome installed. They default to `http://localhost:4000` (smoke) and `http://localhost:5173` (e2e); override with `APP_URL`, for example `APP_URL=http://localhost:4000`. Run `npm run build && npm start` first for the smoke test, and have a recent scrape in the database for the e2e suite.


## Video Walkthrough

**Link:** _add the final video link here_

The video demonstrates:

1. The problem
2. Job search
3. Filters
4. Everyday jobs
5. The three student-focused features (work-hours compatibility, campus/commute matching, application tracker)
6. The scraper
7. The architecture
8. The implementation

## Known Limitations

- **Three sources, a sample:** only the first pages of selected categories are read; Freshersworld and WorkIndia give one page per category.
- **Working hours exist only for WorkIndia jobs.** Internshala's detail pages are disallowed for bots and Freshersworld's have no structured hours, so those jobs show "Hours not listed". Some WorkIndia jobs say "ANY TIME" and also show as not listed.
- **Distance is approximate:** straight-line, no route or travel time. Internshala and Freshersworld only give a city, so their distances are to the city centre (labelled "city-level"). Some jobs cannot be placed at all.
- **Pay** is as published, errors included; unit-less pay on WorkIndia and Freshersworld is assumed to be monthly INR. Some jobs list no pay.
- **Scraper fragility:** breaks if a site changes its HTML; expired listings are not removed.
- **Terms of use:** all three sites' terms prohibit automated scraping (see Scraper).
- **App scope:** India only, single user, no login.

## Future Improvements

- Mark jobs inactive when they disappear from a source.
- Add more sources, ideally ones whose terms allow scraping or that offer permitted access.
- Real travel-time estimates instead of straight-line distance.
- User accounts so the tracker and preferences are per person.
