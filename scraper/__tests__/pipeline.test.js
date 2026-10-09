import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DB_PATH = path.join(os.tmpdir(), `gradguide-scraper-test-${process.pid}.db`);

const { parseRobots, isAllowed } = await import('../robots.js');
const { dedupe, dedupeKey } = await import('../deduplicator/index.js');
const { parseInternshala } = await import('../parser/internshala.js');
const { parseFreshersworld, cleanFreshersworldTitle } = await import('../parser/freshersworld.js');
const { parseWorkindia } = await import('../parser/workindia.js');
const { saveListings } = await import('../store.js');
const { getDb } = await import('../../server/db.js');
const { runScraper } = await import('../scraper.js');

const fixture = (f) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', f), 'utf8');

test('robots.txt: wildcard, query-string and grouped user-agent rules', () => {
  const internshala = parseRobots('User-Agent: *\nDisallow: /*,*\nDisallow: /*?*\nDisallow: /job/details/\n');
  assert.equal(isAllowed(internshala, '/jobs/part-time-jobs/page-2/'), true);
  assert.equal(isAllowed(internshala, '/jobs/?q=a'), false);
  assert.equal(isAllowed(internshala, '/job/details/foo'), false);
  const workindia = parseRobots('User-agent: *\nUser-agent: gptbot\nDisallow: /*?*\n');
  assert.equal(isAllowed(workindia, '/delivery-jobs-in-bengaluru/'), true);
  assert.equal(isAllowed(workindia, '/delivery-jobs-in-bengaluru/?pg=2'), false);
  assert.equal(isAllowed([], '/anything'), true);
});

test('internshala parser reads real cards (internships)', () => {
  const { items, errors } = parseInternshala(fixture('internshala_part_time_internships.html'));
  assert.equal(errors.length, 0);
  assert.ok(items.length === 10);
  const first = items[0];
  assert.ok(first.title && first.url.startsWith('/internship/detail/'));
  assert.ok(first.employer && first.location && first.pay && first.posted);
  assert.ok(items.every((i) => i.jobTypeHint === 'internship'));
});

test('internshala parser reads jobs and picks the unit-bearing salary text', () => {
  const { items } = parseInternshala(fixture('internshala_part_time_jobs.html'));
  assert.ok(items.length === 10);
  assert.ok(items.some((i) => /\/year/.test(i.pay)));
  assert.ok(items.every((i) => !/^(.+)\1$/.test(i.pay ?? ''))); // salary not duplicated desktop+mobile
});

test('freshersworld parser reads cards and strips the SEO title', () => {
  const { items } = parseFreshersworld(fixture('freshersworld_part_time.html'));
  assert.ok(items.length === 8);
  assert.ok(items.every((i) => i.url.startsWith('https://www.freshersworld.com/jobs/')));
  assert.ok(items.every((i) => !/Jobs?\s+Opening\s+in/i.test(i.title)));
  assert.equal(cleanFreshersworldTitle('HR Intern Jobs Opening in SamInfratech Pvt Ltd at Lucknow'), 'HR Intern');
  assert.ok(items.some((i) => /monthly/i.test(i.pay)));
});

test('workindia parser reads cards', () => {
  const { items } = parseWorkindia(fixture('workindia_delivery_bengaluru.html'));
  assert.equal(items.length, 8);
  const first = items[0];
  assert.ok(first.title && first.url.startsWith('https://www.workindia.in/jobs/'));
  assert.ok(first.employer && first.location && first.pay && /Posted on/.test(first.posted));
  assert.ok(first.externalId);
});

test('parsers survive missing fields and empty pages', () => {
  const html = '<div class="individual_internship" employment_type="job"><a class="job-title-href" href="/job/detail/x">Only Title</a></div>';
  const { items, errors } = parseInternshala(html);
  assert.equal(errors.length, 0);
  assert.equal(items[0].title, 'Only Title');
  assert.equal(items[0].pay, null); // missing pay stays null
  assert.deepEqual(parseInternshala('<html></html>').items, []);
  assert.deepEqual(parseWorkindia('').items, []);
});

const L = (o) => ({ title: 'Cook', employer: 'Cafe', location: { raw: 'Delhi', city: 'Delhi', remote: false }, pay: null, jobType: 'casual', postedDate: null, description: null, url: 'https://x/1', source: 'workindia', category: null, externalId: null, ...o });

test('dedupe removes repeated URLs and repeated title+employer+location', () => {
  const { unique, duplicates } = dedupe([L({}), L({}), L({ url: 'https://x/2' }), L({ url: 'https://x/3', title: 'Chef' }), L({ url: 'https://x/4', location: { raw: 'Noida', city: 'Noida', remote: false } })]);
  assert.equal(unique.length, 3);
  assert.equal(duplicates, 2);
  assert.equal(dedupeKey(L({ title: 'COOK ' })), dedupeKey(L({})));
});

test('saveListings inserts, refreshes by URL, and skips cross-source duplicates', () => {
  const db = getDb();
  assert.deepEqual(saveListings(db, 'workindia', [L({})]), { inserted: 1, updated: 0, skipped: 0 });
  assert.deepEqual(saveListings(db, 'workindia', [L({ pay: { raw: 'Rs. 1', min: 1, max: 1, unit: 'month', currency: 'INR' } })]), { inserted: 0, updated: 1, skipped: 0 });
  assert.deepEqual(saveListings(db, 'internshala', [L({ url: 'https://y/9', source: 'internshala' })]), { inserted: 0, updated: 0, skipped: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs').get().n, 1);
  assert.equal(db.prepare('SELECT pay_min FROM jobs').get().pay_min, 1);
});

test('full pipeline from fixtures: one failing source does not stop the others', async () => {
  const logs = [];
  const results = await runScraper({ sources: ['workindia', 'freshersworld'], mode: 'fixtures', maxPages: 1, save: false, log: (m) => logs.push(m) });
  assert.equal(results.length, 2);
  assert.ok(results.find((r) => r.source === 'workindia').fetched === 8);
  assert.ok(results.find((r) => r.source === 'freshersworld').fetched === 16);
  // targets without a fixture are logged as errors but do not abort the run
  assert.ok(results.every((r) => r.stats.errors.length > 0));
  await assert.rejects(() => runScraper({ sources: ['nope'], mode: 'fixtures', save: false, log() {} }), /Unknown source/);
});

const { parseWorkindiaDetail } = await import('../parser/workindiaDetail.js');
const { parseJobTimings: timings } = await import('../normalizer/hours.js');

test('workindia detail pages: Job Timings are read from real saved pages, interview timings are ignored', () => {
  const cleaning = parseWorkindiaDetail(fixture('workindia_detail_cleaning.html'));
  assert.equal(cleaning.timings, '3 hours a day | Monday to Saturday | day shift');
  assert.equal(timings(cleaning.timings).weekly.min, 18);
  assert.equal(parseWorkindiaDetail(fixture('workindia_detail_cook.html')).timings, '9:30 AM - 6:30 PM | Monday to Saturday');
  const delivery = parseWorkindiaDetail(fixture('workindia_detail_delivery.html'));
  assert.equal(delivery.timings, 'ANY TIME | day shift');
  assert.equal(timings(delivery.timings).weekly, null);
  assert.deepEqual(parseWorkindiaDetail('<html><body>no such section</body></html>'), { timings: null, address: null });
});
