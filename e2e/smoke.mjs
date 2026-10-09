// Short end-to-end smoke test of the main workflow, for a reviewer on a fresh checkout.
// Works with whatever data exists (live scrape or `npm run scrape -- --fixtures`), against the app served by `npm start`
// (default http://localhost:4000) or the dev client (set APP_URL).
//   npm run test:smoke                 full workflow (needs some jobs in the database)
//   npm run test:smoke -- --expect-empty   checks the "no jobs yet" message on an empty database
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const APP = process.env.APP_URL || 'http://localhost:4000';
const API = process.env.API_URL || 'http://localhost:4000/api';
const EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
if (!EXE) { console.error('No Edge/Chrome found. Install one, or set it in e2e/smoke.mjs.'); process.exit(2); }

const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log('PASS', name); } catch (e) { results.push(false); console.log('FAIL', name, '\n     ', e.message.split('\n')[0]); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const health = await (await page.request.get(`${API}/health`)).json();
let savedId = null;

try {
  if (process.argv.includes('--expect-empty')) {
    await step('empty database shows a clear "run the scraper" message', async () => {
      ok(health.jobs === 0, `expected an empty database, found ${health.jobs} jobs`);
      await page.goto(APP);
      await page.waitForSelector('[data-testid=no-data-state]', { timeout: 8000 });
      ok(/npm run refresh/.test(await page.getByTestId('no-data-state').innerText()), 'message should tell the user how to get data');
    });
  } else {
    ok(health.jobs > 0, `no jobs in the database - run "npm run scrape -- --fixtures" (offline) or "npm run refresh"`);
    await step('home page lists jobs; every card shows the six required fields and three actions', async () => {
      await page.goto(APP);
      await page.waitForSelector('[data-testid=job-card]');
      for (const c of await page.locator('[data-testid=job-card]').all()) {
        const t = await c.innerText();
        ok(['EMPLOYER', 'LOCATION', 'PAY', 'POSTED'].every((l) => t.includes(l)), 'card is missing a field');
        ok(/Everyday|Part-time|Full-time|Internship/.test(t), 'card has no job type badge');
        ok(t.includes('View job') && /Save job|✓/.test(t) && /Apply on/.test(t), 'card is missing an action');
      }
    });
    await step('every job type can be filtered and shows only that type', async () => {
      for (const [chip, badge] of [['Everyday / casual', /Everyday/], ['Part-time', /Part-time/], ['Full-time', /Full-time/], ['Internship', /Internship/]]) {
        await page.goto(APP);
        await page.waitForSelector('[data-testid=job-card]');
        await page.getByRole('group', { name: 'Job type' }).getByRole('button', { name: new RegExp(`^${chip.replace('/', '\\/')}( \\(|$)`) }).click();
        await page.waitForFunction((src) => !document.querySelector('[data-testid=result-count]')?.textContent.includes('updating') && [...document.querySelectorAll('[data-testid=job-card] h2 ~ span')].length > 0 && [...document.querySelectorAll('[data-testid=job-card] h2 ~ span')].every((s) => new RegExp(src).test(s.textContent)), badge.source, { timeout: 8000 });
      }
    });
    await step('keyword search finds a job by a word from its title; nonsense gives the empty state', async () => {
      await page.goto(APP);
      await page.waitForSelector('[data-testid=job-card]');
      const word = (await page.locator('[data-testid=job-card] h2 a').first().innerText()).split(/\s+/).find((w) => w.length > 3) ?? 'a';
      await page.getByLabel('Search jobs').fill(word);
      await page.waitForFunction((w) => location.search.includes('q=') && [...document.querySelectorAll('[data-testid=job-card]')].some((c) => c.innerText.toLowerCase().includes(w.toLowerCase())), word, { timeout: 8000 });
      await page.getByLabel('Search jobs').fill('zzzzqqqq');
      await page.waitForSelector('[data-testid=empty-state]', { timeout: 8000 });
    });
    await step('job page, source link, save, track status/notes/date, remove', async () => {
      await page.goto(APP);
      await page.waitForSelector('[data-testid=job-card]');
      const card = page.locator('[data-testid=job-card]').filter({ has: page.getByRole('button', { name: 'Save job' }) }).first();
      const title = await card.locator('h2 a').innerText();
      await card.getByRole('link', { name: 'View job' }).click();
      await page.waitForSelector('[data-testid=job-title]');
      ok((await page.getByTestId('job-title').innerText()) === title, 'detail title differs');
      const href = await page.getByTestId('source-link').getAttribute('href');
      ok(/^https:\/\//.test(href) && (await page.getByTestId('source-link').getAttribute('target')) === '_blank', 'source link is wrong');
      await page.getByRole('button', { name: 'Save job' }).click();
      await page.waitForSelector('[data-testid=status-select]');
      savedId = (await (await page.request.get(`${API}/applications`)).json()).find((a) => a.title === title)?.id;
      ok(savedId, 'job was not stored in the database');
      await page.goto(`${APP}/tracker`);
      await page.waitForSelector('[data-testid=application]');
      const row = page.locator('[data-testid=application]').filter({ hasText: title }).first();
      await row.getByTestId('status-select').selectOption('applied');
      await row.getByText('Status updated.').waitFor();
      await row.getByTestId('notes').fill('smoke test note');
      await row.getByTestId('save-details').click();
      await row.getByText('Saved.').waitFor();
      const a = (await (await page.request.get(`${API}/applications`)).json()).find((x) => x.id === savedId);
      ok(a.status === 'applied' && a.notes === 'smoke test note' && a.applied_date, 'tracker changes were not saved');
      page.once('dialog', (d) => d.accept());
      await row.getByTestId('remove').click();
      await page.waitForSelector('[data-testid=empty-state]');
      savedId = null;
    });
  }
} finally {
  if (savedId) await page.request.delete(`${API}/applications/${savedId}`).catch(() => {});
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} smoke steps passed`);
process.exit(results.every(Boolean) ? 0 : 1);
