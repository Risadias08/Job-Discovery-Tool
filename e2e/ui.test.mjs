// Browser test of the job discovery UI against the real database.
// Needs the API (npm run dev:server) and client (npm run dev:client) running, and scraped data (npm run scrape).
//   npm run test:e2e
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:4000/api';
const EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log('PASS', name);
  } catch (e) {
    results.push([false, name, e.message]);
    console.log('FAIL', name, '\n     ', e.message.split('\n')[0]);
  }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg}: expected ${b}, got ${a}`);

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const createdApplicationIds = [];
let savedHref;
const cardFor = (href) => page.locator('[data-testid=job-card]').filter({ has: page.locator(`h2 a[href="${href}"]`) });
// leave no test data behind, even if a test throws or the process is interrupted
process.on('unhandledRejection', (e) => console.log('unhandled:', e?.message));

const apiTotal = async (qs) => (await (await page.request.get(`${API}/jobs?${qs}&limit=1`)).json()).total;
const uiTotal = async () => Number(await page.locator('[data-testid=result-count] strong').first().textContent());
/** wait until the list shows `n` results and is no longer updating */
async function waitTotal(n) {
  await page.waitForFunction((n) => {
    const el = document.querySelector('[data-testid=result-count]');
    return el && !/updating/.test(el.textContent) && el.querySelector('strong')?.textContent === String(n);
  }, n, { timeout: 8000 });
}
const go = async (qs = '') => { await page.goto(`${APP}/${qs ? '?' + qs : ''}`); await page.waitForSelector('[data-testid=job-card],[data-testid=empty-state]'); };
const badges = async () => (await page.locator('[data-testid=job-card] h2 ~ span').allTextContents()).map((s) => s.trim());
const waitApps = (n) => page.waitForFunction((n) => document.querySelectorAll('[data-testid=application]').length === n, n, { timeout: 8000 });
const clearIfNeeded = async () => { const b = page.getByRole('button', { name: /^Clear filters/ }); if (await b.count()) await b.click(); };

try {
  const all = await apiTotal('x=');
  ok(all > 100, `expected real scraped data in the DB, found ${all} jobs`);

  await test('home page lists real jobs with loading finished', async () => {
    await go();
    eq(await page.locator('[data-testid=job-card]').count(), 20, 'cards on first page');
    eq(await uiTotal(), all, 'total shown vs API');
  });

  await test('every card shows title, employer, location, pay, job type, posted + 3 actions', async () => {
    const card = page.locator('[data-testid=job-card]').first();
    const text = await card.innerText();
    for (const label of ['EMPLOYER', 'LOCATION', 'PAY', 'POSTED']) ok(text.includes(label), `card missing ${label}`);
    ok((await card.locator('h2 a').innerText()).length > 1, 'title empty');
    ok(/Everyday|Part-time|Full-time|Internship|Not specified/.test(text), 'job type badge missing');
    ok(await card.getByRole('link', { name: 'View job' }).count(), 'View job missing');
    ok(await card.getByRole('button', { name: /Save job/ }).count() || await card.getByText(/✓/).count(), 'Save missing');
    ok(await card.getByRole('link', { name: /^Apply on/ }).count(), 'Apply/View source missing');
    // all 20 cards have the six fields
    for (const c of await page.locator('[data-testid=job-card]').all()) {
      const t = await c.innerText();
      ok(['EMPLOYER', 'LOCATION', 'PAY', 'POSTED'].every((l) => t.includes(l)), 'a card lacks a field label');
    }
  });

  await test('overview tiles show counts for everyday, part-time, full-time and internships', async () => {
    const t = await page.locator('[data-testid=type-overview]').innerText();
    for (const l of ['Everyday / casual', 'Part-time', 'Full-time', 'Internship']) ok(t.includes(l), `tile ${l} missing`);
    ok(!/-\n/.test(t), 'a count is missing');
  });

  await test('keyword search (delivery) matches API and cards are relevant', async () => {
    await go();
    await page.getByLabel('Search jobs').fill('delivery');
    const expected = await apiTotal('q=delivery');
    await waitTotal(expected);
    ok(page.url().includes('q=delivery'), 'q not in URL');
    const first = (await page.locator('[data-testid=job-card]').first().innerText()).toLowerCase();
    ok(first.includes('delivery'), 'first result does not mention delivery');
  });

  await test('multi-word search (data entry)', async () => {
    await clearIfNeeded();
    await page.getByLabel('Search jobs').fill('data entry');
    await waitTotal(await apiTotal('q=data%20entry'));
  });

  await test('location filter, incl. Bangalore/Bengaluru alias', async () => {
    await go();
    await page.getByLabel('Location').fill('Mumbai');
    await waitTotal(await apiTotal('location=Mumbai'));
    for (const c of (await page.locator('[data-testid=job-card]').allInnerTexts()).slice(0, 5)) ok(/mumbai/i.test(c), 'non-Mumbai result');
    await page.getByLabel('Location').fill('Bangalore');
    const a = await apiTotal('location=Bangalore');
    await waitTotal(a);
    eq(a, await apiTotal('location=Bengaluru'), 'alias totals');
  });

  const typeChecks = [
    ['Everyday / casual', 'casual', /Everyday/],
    ['Part-time', 'part_time', /Part-time/],
    ['Full-time', 'full_time', /Full-time/],
    ['Internship', 'internship', /Internship/],
  ];
  for (const [label, value, re] of typeChecks) {
    await test(`type filter: ${label}`, async () => {
      await go();
      await page.getByRole('group', { name: 'Job type' }).getByRole('button', { name: new RegExp(`^${label.replace('/', '\\/')}( \\(|$)`) }).click();
      await waitTotal(await apiTotal(`type=${value}`));
      const b = await badges();
      ok(b.length > 0 && b.every((x) => re.test(x)), `badges not all ${label}: ${[...new Set(b)]}`);
    });
  }

  await test('part-time & casual preset shows both types only', async () => {
    await go();
    await page.getByRole('button', { name: /Part-time & casual/ }).click();
    await waitTotal(await apiTotal('type=part_time,casual'));
    const kinds = new Set(await badges());
    ok([...kinds].every((k) => /Part-time|Everyday/.test(k)), `unexpected: ${[...kinds]}`);
  });

  await test('multi-select types (full-time + internship) and All jobs reset', async () => {
    await go();
    const g = page.getByRole('group', { name: 'Job type' });
    await g.getByRole('button', { name: /^Full-time/ }).click();
    await g.getByRole('button', { name: /^Internship/ }).click();
    await waitTotal(await apiTotal('type=full_time,internship'));
    await g.getByRole('button', { name: 'All jobs' }).click();
    await waitTotal(all);
  });

  await test('pay filter (30,000+/month) matches API', async () => {
    await go();
    await page.getByLabel('Pay').selectOption('30000');
    await waitTotal(await apiTotal('minPay=30000'));
    ok((await page.getByText(/Listings without a comparable pay figure are hidden/).count()) === 1, 'pay note missing');
  });

  await test('posted-date filter (7 days) matches API', async () => {
    await go();
    await page.getByLabel('Posted').selectOption('7');
    await waitTotal(await apiTotal('postedWithin=7'));
    const posted = await page.locator('[data-testid=job-card] dd').filter({ hasText: /ago|Today|Yesterday/ }).allInnerTexts();
    ok(posted.every((p) => /Today|Yesterday|\d+ days ago/.test(p) && !/month|year/.test(p)), 'old posting in 7-day results');
  });

  await test('source filter and work-from-home filter', async () => {
    await go();
    await page.getByLabel('Source').selectOption('workindia');
    await waitTotal(await apiTotal('source=workindia'));
    ok((await page.locator('[data-testid=job-card]').first().innerText()).includes('WorkIndia'), 'not WorkIndia');
    await page.getByLabel('Source').selectOption('');
    await page.getByLabel('Work from home only').check();
    await waitTotal(await apiTotal('remote=1'));
    for (const c of (await page.locator('[data-testid=job-card]').allInnerTexts()).slice(0, 10)) ok(/remote/i.test(c), 'non-remote result');
  });

  await test('combined filters: part-time & casual + Delhi + pay 10k+ + last 7 days', async () => {
    await go();
    await page.getByRole('button', { name: /Part-time & casual/ }).click();
    await page.getByLabel('Location').fill('Delhi');
    await page.getByLabel('Pay').selectOption('10000');
    await page.getByLabel('Posted').selectOption('7');
    const expected = await apiTotal('type=part_time,casual&location=Delhi&minPay=10000&postedWithin=7');
    ok(expected > 0, 'expected the combination to have data');
    await waitTotal(expected);
    ok(expected < (await apiTotal('type=part_time,casual')), 'combined filters did not narrow results');
    ok((await page.getByRole('button', { name: /Clear filters \(4\)/ }).count()) === 1, 'clear-filters count wrong');
  });

  await test('sorting: highest pay then newest', async () => {
    await go();
    await page.getByLabel('Sort by').selectOption('pay');
    await page.waitForFunction(() => document.querySelector('[data-testid=job-card]')?.innerText.includes('40,00,000'), null, { timeout: 8000 });
    await page.getByLabel('Sort by').selectOption('newest');
    await page.waitForFunction(() => !document.querySelector('[data-testid=job-card]')?.innerText.includes('40,00,000'), null, { timeout: 8000 });
    ok(/Today|Yesterday/.test(await page.locator('[data-testid=job-card]').first().innerText()), 'newest first should start with the most recent day');
  });

  await test('pagination next / previous', async () => {
    await go();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.waitForFunction(() => location.search.includes('page=2'));
    await page.waitForFunction(() => document.body.innerText.includes('Page 2 of'));
    await page.getByRole('button', { name: 'Previous' }).click();
    await page.waitForFunction(() => !location.search.includes('page='));
  });

  await test('empty state, then clear filters restores results', async () => {
    await go();
    await page.getByLabel('Search jobs').fill('zzzzqqqq');
    await page.waitForSelector('[data-testid=empty-state]');
    eq(await uiTotal(), 0, 'total in empty state');
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await waitTotal(all);
    eq(await page.getByLabel('Search jobs').inputValue(), '', 'search box not cleared');
  });

  await test('loading state is shown while the API is slow', async () => {
    await page.route('**/api/jobs?*', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue().catch(() => {}); });
    await page.goto(`${APP}/?q=cook`);
    await page.waitForSelector('[data-testid=loading-state]', { timeout: 1200 });
    await page.unroute('**/api/jobs?*');
    await page.waitForSelector('[data-testid=job-card]');
  });

  await test('error state when the API fails, and Try again recovers', async () => {
    await page.route('**/api/jobs?*', (route) => route.abort());
    await page.goto(`${APP}/?q=chef`);
    await page.waitForSelector('[data-testid=error-state]');
    await page.unroute('**/api/jobs?*');
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.waitForSelector('[data-testid=job-card]');
  });

  await test('job detail shows all fields, description, source and original link', async () => {
    await go('type=casual');
    const card = page.locator('[data-testid=job-card]').first();
    const title = await card.locator('h2 a').innerText();
    const applyHref = await card.getByRole('link', { name: /^Apply on/ }).getAttribute('href');
    await card.getByRole('link', { name: 'View job' }).click();
    await page.waitForSelector('[data-testid=job-title]');
    ok(/\/jobs\/\d+$/.test(page.url()), 'URL is not /jobs/:id');
    eq(await page.locator('[data-testid=job-title]').innerText(), title, 'title');
    const text = await page.locator('article').first().innerText();
    for (const l of ['LOCATION', 'PAY', 'JOB TYPE', 'POSTED', 'SOURCE', 'Description']) ok(text.toLowerCase().includes(l.toLowerCase()), `detail missing ${l}`);
    ok(text.includes('Everyday'), 'type badge missing');
    ok((await page.locator('[data-testid=job-description]').innerText()).length > 20, 'description empty');
    const link = page.locator('[data-testid=source-link]');
    eq(await link.getAttribute('href'), applyHref, 'source link vs card link');
    eq(await link.getAttribute('target'), '_blank', 'link target');
    ok((await link.getAttribute('rel')).includes('noopener'), 'rel noopener');
    ok(/^https:\/\/(www\.)?(workindia\.in|internshala\.com|freshersworld\.com)\//.test(applyHref), `unexpected host ${applyHref}`);
    ok((await page.locator('article').first().innerText()).includes(applyHref), 'original URL not displayed');
  });

  await test('detail page for missing / invalid id shows an error', async () => {
    await page.goto(`${APP}/jobs/99999999`);
    await page.waitForSelector('[data-testid=error-state]');
    await page.goto(`${APP}/jobs/abc`);
    await page.waitForSelector('[data-testid=error-state]');
  });

  await test('save job from a card persists, shows status, and survives reload', async () => {
    await go('q=cook');
    // pick the first card that is not saved yet, and find it again later by its unique /jobs/:id link
    const unsaved = page.locator('[data-testid=job-card]').filter({ has: page.getByRole('button', { name: 'Save job' }) }).first();
    savedHref = await unsaved.locator('h2 a').getAttribute('href');
    const card = cardFor(savedHref);
    await card.getByRole('button', { name: 'Save job' }).click();
    await card.getByText('✓ Saved').waitFor();
    const apps = await (await page.request.get(`${API}/applications`)).json();
    const mine = apps.find((a) => `/jobs/${a.job_id}` === savedHref);
    ok(mine, 'application not stored in DB');
    createdApplicationIds.push(mine.id);
    await page.reload();
    await page.waitForSelector('[data-testid=job-card]');
    ok(await cardFor(savedHref).getByText('✓ Saved').count(), 'saved state lost after reload');
  });

  await test('detail page tracking: status, applied date, notes, remove', async () => {
    await go('q=cook');
    await cardFor(savedHref).getByText('✓ Saved').click(); // saved badge links to the detail page
    await page.waitForSelector('[data-testid=tracker-panel] select');
    await page.getByTestId('status-select').selectOption('applied');
    await page.getByText('Status updated.').waitFor();
    ok((await page.getByTestId('applied-date').inputValue()) !== '', 'applied date not auto-filled');
    await page.getByTestId('notes').fill('Spoke to the manager, follow up Friday');
    await page.getByRole('button', { name: /Save notes/ }).click();
    await page.getByText('Notes and date saved.').waitFor();
    const apps = await (await page.request.get(`${API}/applications`)).json();
    const app = apps.find((a) => a.id === createdApplicationIds[0]);
    eq(app.status, 'applied', 'status in DB');
    eq(app.notes, 'Spoke to the manager, follow up Friday', 'notes in DB');
    ok(app.applied_date, 'applied date in DB');
    await page.reload();
    await page.waitForSelector('[data-testid=tracker-panel] select');
    eq(await page.getByTestId('status-select').inputValue(), 'applied', 'status after reload');
    await page.getByRole('button', { name: 'Remove from tracker' }).click();
    await page.getByText('Removed from your tracker.').waitFor();
    ok(await page.getByRole('button', { name: 'Save job' }).count(), 'Save button not back');
    createdApplicationIds.length = 0;
  });

  // ======================= FEATURE 1 + 2: preferences, hours compatibility, campus distance =======================
  const putPrefs = (body) => page.request.put(`${API}/preferences`, { data: body });
  const RESET = { weeklyHoursLimit: null, hoursAlreadyCommitted: 0, campusId: null, campusName: null, campusLat: null, campusLng: null, maxCommuteKm: null };
  await putPrefs(RESET);

  await test('preferences page: explains both features, shows the not-legal-advice notice, validates input', async () => {
    await page.goto(`${APP}/preferences`);
    await page.waitForSelector('[data-testid=preferences-form]');
    const text = await page.locator('[data-testid=preferences-form]').innerText();
    ok(/not legal or immigration advice/i.test(text), 'disclaimer missing');
    eq(await page.locator('[data-testid=feature-note]').count(), 2, 'feature explanations');
    for (const l of ['Problem', 'Why it matters', 'How it works here']) ok(text.includes(l), `explanation lacks "${l}"`);
    await page.getByTestId('limit-input').fill('20');
    await page.getByTestId('committed-input').fill('5');
    ok((await page.getByTestId('free-hours').innerText()).includes('15 hours per week'), 'free hours not computed');
    await page.getByTestId('limit-input').fill('500');
    ok(await page.getByTestId('save-prefs').isDisabled(), 'save should be disabled for an invalid limit');
    ok(await page.getByText('Enter a number from 0 to 168.').count(), 'validation message missing');
    await page.getByTestId('limit-input').fill('20');
  });

  await test('without preferences: nearest sort and distance/hours filters are disabled, prompt shown, API says why', async () => {
    await go();
    ok(await page.getByTestId('prefs-prompt').count(), 'prompt to set preferences missing');
    ok(await page.getByTestId('distance-filter').isDisabled(), 'distance filter should be disabled');
    ok(await page.getByTestId('hours-filter').isDisabled(), 'hours filter should be disabled');
    eq(await page.locator('[data-testid=distance-chip],[data-testid=hours-chip]').count(), 0, 'indicators without preferences');
    await page.goto(`${APP}/?sort=nearest`);
    await page.waitForSelector('[data-testid=error-state]');
    ok(await page.getByRole('link', { name: 'Open preferences' }).count(), 'no link to preferences in the error');
  });

  await test('saving preferences through the form stores them in the database', async () => {
    await page.goto(`${APP}/preferences`);
    await page.waitForSelector('[data-testid=preferences-form]');
    await page.getByTestId('campus-select').selectOption('iit-delhi');
    await page.getByTestId('maxkm-input').fill('10');
    await page.getByTestId('limit-input').fill('20');
    await page.getByTestId('committed-input').fill('0');
    await page.getByTestId('save-prefs').click();
    await page.getByTestId('save-msg').waitFor();
    const p = await (await page.request.get(`${API}/preferences`)).json();
    eq(p.campus_id, 'iit-delhi', 'campus in DB');
    eq(p.max_commute_km, 10, 'max commute in DB');
    eq(p.weekly_hours_limit, 20, 'weekly limit in DB');
    ok(Math.abs(p.campus_lat - 28.545) < 0.01, 'campus coordinates in DB');
    await page.reload();
    await page.waitForSelector('[data-testid=preferences-form]');
    eq(await page.getByTestId('campus-select').inputValue(), 'iit-delhi', 'campus after reload');
    eq(await page.getByTestId('limit-input').inputValue(), '20', 'limit after reload');
  });

  await test('cards show approximate distance and work-hours chips once preferences are set', async () => {
    await go('location=Delhi');
    ok(await page.locator('[data-testid=distance-chip]').count() >= 10, 'distance chips missing');
    ok(await page.locator('[data-testid=hours-chip]').count() >= 10, 'hours chips missing');
    const chip = page.locator('[data-testid=distance-chip][data-km]').first();
    ok(/~[\d.]+ km/.test(await chip.innerText()), 'distance chip should show approximate km');
    ok((await chip.getAttribute('title')).includes('not a route or travel time'), 'chip must say it is not a route/travel time');
    ok(!/minutes|mins|\bmin\b/i.test(await page.locator('[data-testid=distance-chip]').allInnerTexts().then((a) => a.join(' '))), 'no travel times should be promised');
  });

  await test('sort by nearest orders cards by increasing distance', async () => {
    await go();
    await page.getByLabel('Sort by').selectOption('nearest');
    // wait for the re-sorted list (not the previous one): the URL has the sort and the distances ascend
    await page.waitForFunction(() => {
      const k = [...document.querySelectorAll('[data-testid=distance-chip][data-km]')].map((e) => Number(e.dataset.km));
      return location.search.includes('sort=nearest') && k.length >= 10 && k.every((v, i) => i === 0 || v >= k[i - 1]);
    }, null, { timeout: 10000 });
    const kms = await page.locator('[data-testid=distance-chip][data-km]').evaluateAll((els) => els.map((e) => Number(e.dataset.km)));
    ok(kms.length >= 10, `only ${kms.length} located cards`);
    ok(kms.every((k, i) => i === 0 || k >= kms[i - 1]), `not sorted ascending: ${kms.slice(0, 8).map((k) => k.toFixed(1))}`);
    ok(kms[0] < 15, `nearest job to IIT Delhi should be close, got ${kms[0]} km`);
    // API agrees
    const api = await (await page.request.get(`${API}/jobs?sort=nearest&limit=5`)).json();
    ok(api.items.every((j) => j.distance?.km !== undefined), 'API nearest should start with located jobs');
  });

  await test('distance filter (within 5 km) matches the API and only shows close or remote jobs', async () => {
    await go();
    await page.getByTestId('distance-filter').selectOption('5');
    const expected = await apiTotal('maxKm=5');
    await waitTotal(expected);
    const kms = await page.locator('[data-testid=distance-chip][data-km]').evaluateAll((els) => els.map((e) => Number(e.dataset.km)));
    ok(kms.every((k) => k <= 5), `a result is farther than 5 km: ${Math.max(...kms)}`);
  });

  await test('work-hours filter "Fits my hours" matches the API; every chip says it fits', async () => {
    await go();
    await page.getByTestId('hours-filter').selectOption('fits');
    const expected = await apiTotal('hours=fits');
    await waitTotal(expected);
    ok(expected > 0, 'expected some listings with known hours that fit a 20 h limit (needs the WorkIndia detail pass)');
    const statuses = await page.locator('[data-testid=hours-chip]').evaluateAll((els) => els.map((e) => e.dataset.status));
    ok(statuses.length > 0 && statuses.every((s) => s === 'fits'), `chips: ${[...new Set(statuses)]}`);
  });

  await test('hours indicator reacts to the preference: a tiny limit hides every "fits" job', async () => {
    await putPrefs({ weeklyHoursLimit: 1, hoursAlreadyCommitted: 0 });
    await go('hours=fits');
    eq(await uiTotal(), 0, 'nothing should fit 1 hour a week');
    await page.waitForSelector('[data-testid=empty-state]');
    await putPrefs({ weeklyHoursLimit: 20, hoursAlreadyCommitted: 0 });
  });

  await test('job detail explains hours and distance, with the informational-only notice', async () => {
    const res = await (await page.request.get(`${API}/jobs?hours=fits&sort=nearest&limit=1`)).json();
    const job = res.items[0];
    await page.goto(`${APP}/jobs/${job.id}`);
    await page.waitForSelector('[data-testid=fit-panel]');
    const panel = await page.getByTestId('fit-panel').innerText();
    ok(/not legal or immigration advice/i.test(panel), 'notice missing');
    ok(/hrs\/week/.test(await page.getByTestId('hours-detail').innerText()), 'hours explanation missing');
    ok(/straight line/.test(await page.getByTestId('distance-detail').innerText()) || /no commute/.test(await page.getByTestId('distance-detail').innerText()), 'distance explanation missing');
    ok(/not a route or a travel time/.test(panel), 'must say distance is not a route/travel time');
    ok((await page.locator('article').first().innerText()).includes('WORKING HOURS'), 'working hours row missing');
  });

  await test('custom place search sets the campus (OpenStreetMap lookup, cached)', async () => {
    await page.goto(`${APP}/preferences`);
    await page.waitForSelector('[data-testid=preferences-form]');
    await page.getByTestId('campus-select').selectOption('custom');
    await page.getByTestId('place-input').fill('Symbiosis International University Pune');
    await page.getByTestId('place-find').click();
    await page.waitForFunction(() => /Distances are measured from/.test(document.querySelector('[data-testid=campus-status]')?.textContent ?? '') || document.querySelector('[role=alert]'), null, { timeout: 20000 });
    const status = await page.getByTestId('campus-status').innerText();
    ok(/Distances are measured from Symbiosis/.test(status), `place search failed: ${status} / ${await page.locator('[role=alert]').allInnerTexts()}`);
    await page.getByTestId('save-prefs').click();
    await page.getByTestId('save-msg').waitFor();
    const p = await (await page.request.get(`${API}/preferences`)).json();
    eq(p.campus_id, 'custom', 'custom campus saved');
    ok(p.campus_lat > 18 && p.campus_lat < 19.2 && p.campus_lng > 73 && p.campus_lng < 74.2, `coordinates not in Pune: ${p.campus_lat},${p.campus_lng}`);
    // nearest to a Pune campus should start in Pune
    const near = await (await page.request.get(`${API}/jobs?sort=nearest&limit=3`)).json();
    ok(near.items.every((j) => j.distance?.km < 60), `nearest to a Pune campus should be local: ${near.items.map((j) => j.location_raw + ' ' + j.distance?.km)}`);
    const bad = await page.request.get(`${API}/geocode?q=zzzzqqqqxxxxyyyy`);
    ok([404, 502].includes(bad.status()), 'gibberish place should not resolve');
  });
  await putPrefs(RESET);

  // ======================= FEATURE 3: application tracker =======================
  await test('tracker: empty state when nothing is saved', async () => {
    const apps = await (await page.request.get(`${API}/applications`)).json();
    for (const a of apps) await page.request.delete(`${API}/applications/${a.id}`);
    await page.goto(`${APP}/tracker`);
    await page.waitForSelector('[data-testid=empty-state]');
    ok(await page.getByRole('link', { name: 'Browse jobs' }).count(), 'link back to jobs missing');
    ok(await page.getByTestId('feature-note').innerText().then((t) => /Problem/.test(t) && /Why it matters/.test(t) && /How it works here/.test(t)), 'tracker explanation missing');
  });

  const trackedIds = [];
  await test('tracker: jobs saved from the search page appear on the dashboard with all columns', async () => {
    await go('q=cook');
    const cards = page.locator('[data-testid=job-card]').filter({ has: page.getByRole('button', { name: 'Save job' }) });
    const hrefs = [];
    for (let i = 0; i < 3; i++) hrefs.push(await cards.nth(i).locator('h2 a').getAttribute('href'));
    for (const href of hrefs) {
      await cardFor(href).getByRole('button', { name: 'Save job' }).click();
      await cardFor(href).getByText('✓ Saved').waitFor();
    }
    const apps = await (await page.request.get(`${API}/applications`)).json();
    apps.forEach((a) => trackedIds.push(a.id));
    eq(apps.length, 3, 'saved applications in DB');
    await page.goto(`${APP}/tracker`);
    await page.waitForSelector('[data-testid=application]');
    eq(await page.locator('[data-testid=application]').count(), 3, 'application cards');
    const card = await page.locator('[data-testid=application]').first().innerText();
    for (const l of ['LOCATION', 'PAY', 'STATUS', 'APPLICATION DATE', 'NOTES', 'View job', 'Remove']) ok(card.includes(l), `card lacks ${l}`);
    eq(await page.getByTestId('count-saved').innerText(), '3', 'saved count');
  });

  await test('tracker: status can be moved through Applied, Interview, Offer, Rejected and persists', async () => {
    const first = page.locator('[data-testid=application]').first();
    const jobId = await first.getAttribute('data-job-id');
    const row = () => page.locator(`[data-testid=application][data-job-id="${jobId}"]`);
    for (const [value, label] of [['applied', 'Applied'], ['interview', 'Interview'], ['offer', 'Offer'], ['rejected', 'Rejected']]) {
      await row().getByTestId('status-select').selectOption(value);
      await row().getByText('Status updated.').waitFor();
      const app = (await (await page.request.get(`${API}/applications`)).json()).find((a) => String(a.job_id) === jobId);
      eq(app.status, value, `${label} in DB`);
    }
    await row().getByTestId('status-select').selectOption('interview');
    await row().getByText('Status updated.').waitFor();
    await page.reload();
    await page.waitForSelector('[data-testid=application]');
    eq(await row().getByTestId('status-select').inputValue(), 'interview', 'status after reload');
  });

  await test('tracker: applying fills in today\'s date; notes and a custom date save and survive reload', async () => {
    const second = page.locator('[data-testid=application][data-status=saved]').first();
    const jobId = await second.getAttribute('data-job-id');
    const row = () => page.locator(`[data-testid=application][data-job-id="${jobId}"]`);
    await row().getByTestId('status-select').selectOption('applied');
    await row().getByText('Status updated.').waitFor();
    ok((await row().getByTestId('applied-date').inputValue()) === new Date().toLocaleDateString('en-CA') /* local YYYY-MM-DD */, 'applied date not defaulted to today');
    ok(await row().getByTestId('save-details').isDisabled(), 'save button should be disabled with no edits');
    await row().getByTestId('notes').fill('Emailed the manager, call back on Monday');
    await row().getByTestId('applied-date').fill('2026-10-01');
    ok(await row().getByText('Unsaved changes').count(), 'unsaved-changes hint missing');
    await row().getByTestId('save-details').click();
    await row().getByText('Saved.').waitFor();
    const app = (await (await page.request.get(`${API}/applications`)).json()).find((a) => String(a.job_id) === jobId);
    eq(app.notes, 'Emailed the manager, call back on Monday', 'notes in DB');
    eq(app.applied_date, '2026-10-01', 'date in DB');
    await page.reload();
    await page.waitForSelector('[data-testid=application]');
    eq(await row().getByTestId('notes').inputValue(), 'Emailed the manager, call back on Monday', 'notes after reload');
    eq(await row().getByTestId('applied-date').inputValue(), '2026-10-01', 'date after reload');
  });

  await test('tracker: filter by status with live counts, and an empty-filter message', async () => {
    eq(await page.getByTestId('count-interview').innerText(), '1', 'interview count');
    eq(await page.getByTestId('count-applied').innerText(), '1', 'applied count');
    eq(await page.getByTestId('count-saved').innerText(), '1', 'saved count');
    await page.getByRole('button', { name: /^Interview \(/ }).click();
    await waitApps(1);
    eq(await page.locator('[data-testid=application]').count(), 1, 'interview filter');
    eq(await page.locator('[data-testid=application]').first().getAttribute('data-status'), 'interview', 'filtered status');
    ok(page.url().includes('status=interview'), 'filter not in URL');
    await page.getByRole('button', { name: /^Offer \(/ }).click();
    await page.waitForSelector('[data-testid=empty-filter]');
    await page.getByRole('button', { name: /^All \(/ }).click();
    await waitApps(3);
    eq(await page.locator('[data-testid=application]').count(), 3, 'all');
  });

  await test('tracker: the job page and the dashboard agree; removing works (with confirmation)', async () => {
    const card = page.locator('[data-testid=application][data-status=interview]').first();
    const jobId = await card.getAttribute('data-job-id');
    await page.goto(`${APP}/jobs/${jobId}`);
    await page.waitForSelector('[data-testid=tracker-panel] select');
    eq(await page.getByTestId('status-select').inputValue(), 'interview', 'status on job page');
    await page.goto(`${APP}/tracker`);
    await page.waitForSelector('[data-testid=application]');
    page.once('dialog', (d) => d.dismiss());
    await page.locator('[data-testid=application]').first().getByTestId('remove').click();
    eq(await page.locator('[data-testid=application]').count(), 3, 'dismissing the dialog must not delete');
    while (await page.locator('[data-testid=application]').count()) {
      page.once('dialog', (d) => d.accept());
      const before = await page.locator('[data-testid=application]').count();
      await page.locator('[data-testid=application]').first().getByTestId('remove').click();
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid=application]').length === n - 1, before);
    }
    await page.waitForSelector('[data-testid=empty-state]');
    eq((await (await page.request.get(`${API}/applications`)).json()).length, 0, 'applications left in DB');
    trackedIds.length = 0;
  });

  await test('no console errors or failed requests during a normal browse', async () => {
    const problems = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    page.on('requestfailed', (r) => problems.push('failed: ' + r.url()));
    await go('type=internship&sort=pay');
    await page.waitForTimeout(500);
    eq(problems.length, 0, `console problems: ${problems.join(' | ')}`);
  });
} finally {
  for (const id of createdApplicationIds) await page.request.delete(`${API}/applications/${id}`).catch(() => {});
  // leave no test data behind: no tracked applications, preferences back to "not set"
  const leftover = await page.request.get(`${API}/applications`).then((r) => r.json()).catch(() => []);
  for (const a of leftover) await page.request.delete(`${API}/applications/${a.id}`).catch(() => {});
  await page.request
    .put(`${API}/preferences`, { data: { weeklyHoursLimit: null, hoursAlreadyCommitted: 0, campusId: null, campusName: null, campusLat: null, campusLng: null, maxCommuteKm: null } })
    .catch(() => {});
  await browser.close();
}

const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} UI tests passed`);
process.exit(failed.length ? 1 : 0);
