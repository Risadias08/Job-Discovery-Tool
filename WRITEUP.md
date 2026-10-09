# Job Discovery Tool

## 1. Problem

International students in India search for **internships**, **full-time jobs** and **part-time, casual or everyday jobs** (delivery, cooking, retail, helper roles) at the same time. Listings are spread across sites with different layouts, and an ad rarely answers what a student needs to know: do the hours fit around classes, is it a realistic commute from campus, and what have I already applied for?

## 2. Solution

GradGuide gathers real listings into one searchable app: filter by keyword, location, job type, pay, posted date, source, work from home, distance and work hours; sort by newest, highest pay or nearest. Each listing shows title, employer, location, pay, job type and posted date, with links to view it, save it and apply on the original site.

## 3. Scraper

Custom code (`scraper/`). **It uses no job-board API and no AI or scraping service.**

- **Sources:** Internshala, Freshersworld and WorkIndia.
- **Fetching:** Node's `fetch` with an identifying User-Agent, a robots.txt check before every request, 2 s between requests, one retry, and a stop on 403/429.
- **Parsing:** Cheerio with CSS selectors for each site's job cards, written from the real HTML. For WorkIndia, a second pass reads "Job Timings" from each job's page.
- **Normalising:** pay (Indian digit grouping, units, currency), relative dates to calendar dates, city and work-from-home, job type (card, then title, then source page), and hours per week (only when hours per day and days are both stated).
- **Duplicates:** skipped if the URL, or title + employer + location, was already seen; both are also unique in the database. Missing fields show "Not listed"; a bad card or page is logged and skipped.
- **To the app:** scraper, SQLite, Express API, React app. A separate `npm run geocode` adds approximate coordinates from cached OpenStreetMap lookups.

## 4. Three Original Features

**Work-hours compatibility awareness.** *Problem:* ads rarely show whether a job's hours fit a student's week. *Why it matters:* students can check before applying. *How:* the student enters their own weekly limit and hours already used; the API compares that with the job's hours per week and labels it Fits, May fit, More than your free hours, or Hours not listed, and can filter by it. Informational only: no immigration rules are built in and it never says a job is allowed or not.

**Campus/commute matching.** *Problem:* a good job may be far from campus. *Why it matters:* travel costs study time and money. *How:* pick one of 8 campuses or search a place; the API computes straight-line distance, labels it Close, Moderate or Far against the student's own maximum commute, and can sort or filter by it.

**Application tracker.** *Problem:* applications get scattered across sites. *Why it matters:* students applying widely need follow-ups and a record that outlives the listing. *How:* saving a job stores a status (Saved, Applied, Interview, Offer, Rejected), application date and notes, shown on a dashboard with status filters.

## 5. Technical Architecture

**Frontend:** React, Vite, Tailwind CSS. **Backend:** Node.js, Express, zod validation. **Scraper:** Node.js, fetch, Cheerio. **Database:** SQLite (`node:sqlite`). Tested with 56 backend/scraper tests and browser tests of the main workflow.

## 6. Limitations

- **Three sources, a sample:** about 700 listings from the first pages of chosen categories; Freshersworld and WorkIndia give one page per category.
- **Hours:** only WorkIndia publishes them (147 of its 206 jobs); other jobs show "Hours not listed".
- **Pay:** 21 of 702 jobs list none; unit-less pay on two sites is assumed monthly rupees; figures are as published, errors included.
- **Distance:** approximate straight-line, no travel time; city-centre only for Internshala and Freshersworld; some jobs can't be placed.
- **Scraper:** breaks if a site changes its HTML; expired listings are not removed. All three sites' terms prohibit automated scraping though robots.txt allows these pages, so it is small, local and educational, linking every listing to its source.
- **App:** India only, single user, no login.
