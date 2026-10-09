import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `gradguide-features-${process.pid}.db`);

const { createApp } = await import('../app.js');
const { getDb } = await import('../db.js');
const { haversineKm, distanceInfo } = await import('../lib/geo.js');
const { hoursFit } = await import('../lib/hoursFit.js');

let server;
let base;
const json = { 'Content-Type': 'application/json' };
const put = (body) => fetch(`${base}/preferences`, { method: 'PUT', headers: json, body: JSON.stringify(body) });
const titles = async (qs) => (await (await fetch(`${base}/jobs?${qs}`)).json()).items?.map((i) => i.title);

// campus: IIT Delhi
const CAMPUS = { campusId: 'iit-delhi', campusName: 'IIT Delhi', campusLat: 28.545, campusLng: 77.1926 };

// title, lat, lng, precision, remote, hours min, hours max, hours_raw
const JOBS = [
  ['Near 10h', 28.55, 77.2, 'locality', 0, 10, 10, '2 hours a day | Monday to Friday'],
  ['Near 10-20h', 28.56, 77.21, 'locality', 0, 10, 20, null],
  ['Gurugram 25h', 28.4595, 77.0266, 'city', 0, 25, 25, null],
  ['Mumbai 40h', 19.076, 72.8777, 'city', 0, 40, 40, null],
  ['Remote job', null, null, null, 1, null, null, 'ANY TIME | day shift'],
  ['Unplaced job', null, null, null, 0, null, null, null],
];

before(async () => {
  const db = getDb();
  const ins = db.prepare(`INSERT INTO jobs (source_id, url, title, lat, lng, geo_precision, is_remote, hours_per_week_min, hours_per_week_max, hours_raw, dedupe_key, posted_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'))`);
  JOBS.forEach((j, i) => ins.run(`https://example.com/${i}`, j[0], j[1], j[2], j[3], j[4], j[5], j[6], j[7], `k${i}`));
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

// ---------- geo + hours logic ----------

test('haversine: Delhi to Mumbai is about 1,150 km; same point is 0', () => {
  const km = haversineKm(28.6139, 77.209, 19.076, 72.8777);
  assert.ok(km > 1100 && km < 1200, `got ${km}`);
  assert.equal(haversineKm(10, 10, 10, 10), 0);
});

test('distanceInfo: bands follow the student max commute, remote and missing data are handled', () => {
  const prefs = { campus_lat: 28.545, campus_lng: 77.1926, max_commute_km: 10 };
  const near = distanceInfo({ lat: 28.55, lng: 77.2, geo_precision: 'locality' }, prefs);
  assert.equal(near.band, 'near');
  assert.ok(near.km < 2);
  assert.equal(near.precision, 'locality');
  const far = distanceInfo({ lat: 19.076, lng: 72.8777, geo_precision: 'city' }, prefs);
  assert.equal(far.band, 'far');
  assert.equal(far.withinMax, false);
  assert.match(far.label, /city-level/);
  assert.equal(distanceInfo({ is_remote: 1 }, prefs).remote, true);
  assert.equal(distanceInfo({ lat: null, lng: null }, prefs), null);
  assert.equal(distanceInfo({ lat: 1, lng: 1 }, { campus_lat: null }), null);
  // without a max, default bands are 5 km and 15 km
  assert.equal(distanceInfo({ lat: 28.57, lng: 77.2 }, { campus_lat: 28.545, campus_lng: 77.1926 }).band, 'near');
});

test('hoursFit statuses: unset, unknown, fits, may_fit, over', () => {
  const prefs = { weekly_hours_limit: 20, hours_already_committed: 5 }; // 15 free
  assert.equal(hoursFit({}, { weekly_hours_limit: null }).status, 'unset');
  assert.equal(hoursFit({ hours_per_week_min: null }, prefs).status, 'unknown');
  assert.match(hoursFit({ hours_raw: 'ANY TIME' }, prefs).detail, /ANY TIME/);
  assert.equal(hoursFit({ hours_per_week_min: 10, hours_per_week_max: 15 }, prefs).status, 'fits');
  assert.equal(hoursFit({ hours_per_week_min: 10, hours_per_week_max: 20 }, prefs).status, 'may_fit');
  const over = hoursFit({ hours_per_week_min: 25, hours_per_week_max: 25 }, prefs);
  assert.equal(over.status, 'over');
  assert.match(over.detail, /10 hrs\/week short/);
});

test('hoursFit never makes legal claims', () => {
  const prefs = { weekly_hours_limit: 20, hours_already_committed: 0 };
  for (const hrs of [5, 20, 40]) {
    const r = hoursFit({ hours_per_week_min: hrs, hours_per_week_max: hrs }, prefs);
    assert.doesNotMatch(`${r.label} ${r.detail}`, /illegal|legal|permitted|allowed|prohibited|visa|violat/i);
  }
});

// ---------- API: campus / distance ----------

test('without a campus, distance sort and filter are rejected with a clear code', async () => {
  for (const qs of ['sort=nearest', 'maxKm=10']) {
    const res = await fetch(`${base}/jobs?${qs}`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'campus_required');
  }
  assert.equal((await (await fetch(`${base}/jobs?limit=1`)).json()).items[0].distance, null);
});

test('with a campus: jobs carry a distance, sort=nearest orders by distance, remote then unplaced last', async () => {
  assert.equal((await put({ ...CAMPUS, maxCommuteKm: 10 })).status, 200);
  const items = (await (await fetch(`${base}/jobs?sort=nearest`)).json()).items;
  assert.deepEqual(items.map((j) => j.title), ['Near 10h', 'Near 10-20h', 'Gurugram 25h', 'Mumbai 40h', 'Remote job', 'Unplaced job']);
  const kms = items.slice(0, 4).map((j) => j.distance.exactKm);
  assert.deepEqual([...kms].sort((a, b) => a - b), kms);
  assert.equal(items[0].distance.band, 'near');
  assert.equal(items[3].distance.band, 'far');
  assert.equal(items[4].distance.remote, true);
  assert.equal(items[5].distance, null);
});

test('maxKm filter keeps close jobs and remote jobs, drops far and unplaced ones', async () => {
  assert.deepEqual((await titles('maxKm=30&sort=nearest')), ['Near 10h', 'Near 10-20h', 'Gurugram 25h', 'Remote job']);
  assert.deepEqual((await titles('maxKm=5&sort=nearest')), ['Near 10h', 'Near 10-20h', 'Remote job']);
  assert.equal((await fetch(`${base}/jobs?maxKm=-3`)).status, 400);
});

test('distance sort combines with other filters and paginates', async () => {
  const body = await (await fetch(`${base}/jobs?sort=nearest&limit=2&page=2`)).json();
  assert.equal(body.total, 6);
  assert.deepEqual(body.items.map((j) => j.title), ['Gurugram 25h', 'Mumbai 40h']);
  assert.deepEqual(await titles('sort=nearest&remote=1'), ['Remote job']);
});

// ---------- API: work hours ----------

test('without a weekly limit, the hours filter is rejected and the indicator is "unset"', async () => {
  const res = await fetch(`${base}/jobs?hours=fits`);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'hours_required');
  assert.equal((await (await fetch(`${base}/jobs?limit=1`)).json()).items[0].hours_fit.status, 'unset');
});

test('with a weekly limit: each job gets a compatibility status and the filter works', async () => {
  await put({ weeklyHoursLimit: 20, hoursAlreadyCommitted: 5 }); // 15 free
  const byTitle = Object.fromEntries((await (await fetch(`${base}/jobs`)).json()).items.map((j) => [j.title, j.hours_fit.status]));
  assert.deepEqual(byTitle, {
    'Near 10h': 'fits',
    'Near 10-20h': 'may_fit',
    'Gurugram 25h': 'over',
    'Mumbai 40h': 'over',
    'Remote job': 'unknown',
    'Unplaced job': 'unknown',
  });
  assert.deepEqual((await titles('hours=fits')), ['Near 10h']);
  assert.deepEqual((await titles('hours=fits_or_unknown')).sort(), ['Near 10-20h', 'Near 10h', 'Remote job', 'Unplaced job']);
  assert.equal((await fetch(`${base}/jobs?hours=whatever`)).status, 400);
});

test('changing the preferences changes the result (end to end)', async () => {
  await put({ weeklyHoursLimit: 40, hoursAlreadyCommitted: 0 });
  assert.deepEqual((await titles('hours=fits')).sort(), ['Gurugram 25h', 'Mumbai 40h', 'Near 10-20h', 'Near 10h']);
  await put({ weeklyHoursLimit: 8, hoursAlreadyCommitted: 0 });
  assert.deepEqual(await titles('hours=fits'), []);
});

test('job detail includes distance and hours indicators', async () => {
  await put({ weeklyHoursLimit: 20, hoursAlreadyCommitted: 5 });
  const list = await (await fetch(`${base}/jobs?q=Near%2010h`)).json();
  const d = await (await fetch(`${base}/jobs/${list.items[0].id}`)).json();
  assert.equal(d.hours_fit.status, 'fits');
  assert.equal(d.distance.band, 'near');
});

test('preferences validation and clearing', async () => {
  for (const bad of [{ weeklyHoursLimit: -1 }, { weeklyHoursLimit: 500 }, { maxCommuteKm: 0 }, { campusLat: 120 }, { hoursAlreadyCommitted: -2 }]) {
    assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  }
  const cleared = await (await put({ weeklyHoursLimit: null, campusId: null, campusName: null, campusLat: null, campusLng: null, maxCommuteKm: null })).json();
  assert.equal(cleared.weekly_hours_limit, null);
  assert.equal(cleared.campus_lat, null);
});

// ---------- API: geocode (no network needed: validation + cache) ----------

test('geocode: validates input, serves cached places, reports unknown places', async () => {
  assert.equal((await fetch(`${base}/geocode?q=ab`)).status, 400);
  assert.equal((await fetch(`${base}/geocode`)).status, 400);
  const db = getDb();
  db.prepare("INSERT INTO geocache (query, lat, lng, display_name, found) VALUES ('test university, india', 12.5, 77.5, 'Test University, Karnataka', 1)").run();
  db.prepare("INSERT INTO geocache (query, found) VALUES ('nowhere land, india', 0)").run();
  const ok = await fetch(`${base}/geocode?q=Test University`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { name: 'Test University, Karnataka', lat: 12.5, lng: 77.5 });
  const missing = await fetch(`${base}/geocode?q=Nowhere Land`);
  assert.equal(missing.status, 404);
});

// ---------- API: tracker ----------

test('tracker: save, move through every status, notes and date persist, filter by status', async () => {
  const ids = (await (await fetch(`${base}/jobs`)).json()).items.map((j) => j.id);
  const created = [];
  for (const jobId of ids.slice(0, 3)) {
    const r = await fetch(`${base}/applications`, { method: 'POST', headers: json, body: JSON.stringify({ jobId }) });
    assert.equal(r.status, 201);
    created.push(await r.json());
  }
  assert.ok(created.every((a) => a.status === 'saved' && a.source && a.title));
  const patch = (id, body) => fetch(`${base}/applications/${id}`, { method: 'PATCH', headers: json, body: JSON.stringify(body) });

  for (const status of ['applied', 'interview', 'offer', 'rejected', 'saved']) {
    const r = await patch(created[0].id, { status });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, status);
  }
  await patch(created[0].id, { status: 'applied', notes: 'Spoke to Priya', appliedDate: '2026-10-01' });
  await patch(created[1].id, { status: 'interview' });
  const one = await (await patch(created[0].id, { notes: 'Follow up Friday' })).json();
  assert.deepEqual([one.status, one.notes, one.applied_date], ['applied', 'Follow up Friday', '2026-10-01']); // untouched fields survive

  const applied = await (await fetch(`${base}/applications?status=applied`)).json();
  assert.deepEqual(applied.map((a) => a.id), [created[0].id]);
  assert.equal((await (await fetch(`${base}/applications?status=interview`)).json()).length, 1);
  assert.equal((await (await fetch(`${base}/applications`)).json()).length, 3);
  assert.equal((await fetch(`${base}/applications?status=hired`)).status, 400);

  const cleared = await (await patch(created[0].id, { notes: null, appliedDate: null })).json();
  assert.deepEqual([cleared.notes, cleared.applied_date], [null, null]);

  for (const bad of [{}, { status: 'hired' }, { appliedDate: '01/10/2026' }, { notes: 'x'.repeat(2001) }]) {
    assert.equal((await patch(created[0].id, bad)).status, 400, JSON.stringify(bad).slice(0, 40));
  }
  assert.equal((await patch(99999, { status: 'offer' })).status, 404);
  for (const a of created) assert.equal((await fetch(`${base}/applications/${a.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await (await fetch(`${base}/applications`)).json()).length, 0);
});
