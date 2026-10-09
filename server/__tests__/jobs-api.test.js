import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `gradguide-jobs-api-${process.pid}.db`);

const { createApp } = await import('../app.js');
const { getDb } = await import('../db.js');

let server;
let base;
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const JOBS = [
  // title, employer, location_raw, city, remote, pay_raw, min, max, unit, currency, type, category, posted
  ['Barista', 'Bean Cafe', 'Kothrud, Pune', 'Pune', 0, 'Rs. 12000 - Rs. 15000', 12000, 15000, 'month', 'INR', 'casual', 'Cafe', today],
  ['Data Entry Operator', 'Acme', 'Bangalore', 'Bengaluru', 0, '₹ 3,00,000 /year', 300000, 300000, 'year', 'INR', 'full_time', null, daysAgo(3)],
  ['Marketing Intern', 'Startup', 'Work from home', null, 1, '₹ 5,000 /month', 5000, 5000, 'month', 'INR', 'internship', null, daysAgo(10)],
  ['HR Intern', 'Typo Ltd', 'Gurgaon', 'Gurugram', 0, '250000 - 400000 Monthly', 250000, 400000, 'month', 'INR', 'internship', null, daysAgo(1)],
  ['Delivery Partner', 'Quick Co', 'Andheri, Mumbai', 'Mumbai', 0, null, null, null, 'unknown', null, 'part_time', 'Delivery', null],
  ['Support Agent', 'Global', 'Delhi', 'Delhi', 0, '$ 8,640 - 24,000 /year', 8640, 24000, 'year', 'USD', 'full_time', null, daysAgo(40)],
];

before(async () => {
  const db = getDb();
  const src = db.prepare("SELECT id FROM sources WHERE name = 'workindia'").get().id;
  const ins = db.prepare(`INSERT INTO jobs (source_id, url, title, employer, location_raw, city, is_remote, pay_raw, pay_min, pay_max, pay_unit, pay_currency, job_type, category, posted_at, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  JOBS.forEach((j, i) => ins.run(src, `https://example.com/${i}`, j[0], j[1], j[2], j[3], j[4], j[5], j[6], j[7], j[8], j[9], j[10], j[11], j[12], `k${i}`));
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

const titles = async (qs) => {
  const body = await (await fetch(`${base}/jobs?${qs}`)).json();
  return body.items.map((i) => i.title);
};

test('keyword search is multi-word and also matches category', async () => {
  assert.deepEqual(await titles('q=data%20entry'), ['Data Entry Operator']);
  assert.deepEqual(await titles('q=cafe'), ['Barista']); // employer "Bean Cafe" / category "Cafe"
  assert.deepEqual(await titles('q=zzzz'), []);
});

test('LIKE wildcards in the search box are matched literally', async () => {
  assert.deepEqual(await titles('q=%25'), []);
  assert.deepEqual(await titles('q=_'), []);
});

test('job type filter, single and multiple', async () => {
  assert.deepEqual((await titles('type=internship')).sort(), ['HR Intern', 'Marketing Intern']);
  assert.equal((await titles('type=casual,part_time')).length, 2);
});

test('location filter understands spelling variants', async () => {
  assert.deepEqual(await titles('location=Bengaluru'), ['Data Entry Operator']);
  assert.deepEqual(await titles('location=Bangalore'), ['Data Entry Operator']);
  assert.deepEqual(await titles('location=Gurgaon'), ['HR Intern']);
  assert.deepEqual(await titles('location=gurugram'), ['HR Intern']);
});

test('remote filter', async () => {
  assert.deepEqual(await titles('remote=1'), ['Marketing Intern']);
});

test('pay filter compares monthly equivalents (yearly / 12) and ignores unknown or USD pay', async () => {
  // Data Entry = 3,00,000/year = 25,000/month; Barista max 15,000; Marketing Intern 5,000
  assert.deepEqual(await titles('minPay=20000'), ['Data Entry Operator']);
  assert.deepEqual((await titles('minPay=10000')).sort(), ['Barista', 'Data Entry Operator']);
  const withAnyPay = await titles('minPay=0');
  assert.deepEqual(withAnyPay.sort(), ['Barista', 'Data Entry Operator', 'Marketing Intern']);
  assert.ok(!withAnyPay.includes('Delivery Partner'), 'job with no pay must not match a pay filter');
  assert.ok(!withAnyPay.includes('Support Agent'), 'USD pay is not comparable to INR');
});

test('implausible internship pay (> 1 lakh / month) is excluded from pay filtering', async () => {
  assert.ok(!(await titles('minPay=100000')).includes('HR Intern'));
  const all = await (await fetch(`${base}/jobs?q=HR%20Intern`)).json();
  assert.equal(all.items[0].pay_raw, '250000 - 400000 Monthly'); // still shown as published
});

test('posted-within filter', async () => {
  assert.deepEqual((await titles('postedWithin=2')).sort(), ['Barista', 'HR Intern']);
  assert.ok(!(await titles('postedWithin=30')).includes('Support Agent'));
});

test('sorting: newest first, highest pay first', async () => {
  const newest = await titles('sort=newest');
  assert.equal(newest[0], 'Barista');
  assert.equal(newest.at(-1), 'Delivery Partner'); // no date sorts last
  const byPay = await titles('sort=pay');
  assert.equal(byPay[0], 'Data Entry Operator');
});

test('combined filters narrow the result', async () => {
  assert.deepEqual(await titles('type=full_time&location=Bangalore&minPay=20000&postedWithin=7'), ['Data Entry Operator']);
  assert.deepEqual(await titles('type=internship&minPay=20000'), []);
});

test('pagination reports totals and pages', async () => {
  const b = await (await fetch(`${base}/jobs?limit=4&page=2`)).json();
  assert.equal(b.total, 6);
  assert.equal(b.pages, 2);
  assert.equal(b.items.length, 2);
});

test('invalid parameters are rejected with 400', async () => {
  for (const qs of ['type=bogus', 'minPay=-1', 'page=0', 'limit=1000', 'sort=random', 'postedWithin=abc']) {
    assert.equal((await fetch(`${base}/jobs?${qs}`)).status, 400, qs);
  }
});

test('job detail includes tracker fields; unknown id is 404; bad id is 400', async () => {
  const list = await (await fetch(`${base}/jobs?q=Barista`)).json();
  const id = list.items[0].id;
  assert.equal((await (await fetch(`${base}/jobs/${id}`)).json()).application_id, null);
  const save = await fetch(`${base}/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: id }) });
  assert.equal(save.status, 201);
  const detail = await (await fetch(`${base}/jobs/${id}`)).json();
  assert.equal(detail.application_status, 'saved');
  assert.equal((await fetch(`${base}/jobs/99999`)).status, 404);
  assert.equal((await fetch(`${base}/jobs/abc`)).status, 400);
});
