import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

// Use a throwaway database so tests never touch data/gradguide.db.
process.env.DB_PATH = path.join(os.tmpdir(), `gradguide-test-${process.pid}.db`);

const { createApp } = await import('../app.js');
const { getDb } = await import('../db.js');

let server;
let base;

before(async () => {
  getDb();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

test('health reports connected db', async () => {
  const body = await (await fetch(`${base}/health`)).json();
  assert.equal(body.status, 'ok');
  assert.equal(body.jobs, 0);
});

test('empty job search returns an empty list, not an error', async () => {
  const body = await (await fetch(`${base}/jobs?q=cafe`)).json();
  assert.deepEqual(body.items, []);
  assert.equal(body.total, 0);
});

test('invalid job type is rejected with 400', async () => {
  const res = await fetch(`${base}/jobs?type=bogus`);
  assert.equal(res.status, 400);
});

test('saving a non-existent job returns 404', async () => {
  const res = await fetch(`${base}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: 999 }),
  });
  assert.equal(res.status, 404);
});
