import { Router } from 'express';
import { getDb } from '../db.js';
import campuses from '../data/campuses.json' with { type: 'json' };

const router = Router();

router.get('/health', (_req, res) => {
  const { n } = getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get();
  res.json({ status: 'ok', time: new Date().toISOString(), db: 'connected', jobs: n });
});

router.get('/meta', (_req, res) => {
  const db = getDb();
  const sources = db.prepare('SELECT name, base_url, last_scraped_at, last_status, jobs_found FROM sources').all();
  const types = db
    .prepare('SELECT job_type AS value, COUNT(*) AS count FROM jobs WHERE is_active = 1 GROUP BY job_type')
    .all();
  const total = db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE is_active = 1').get().n;
  const cities = db
    .prepare(
      'SELECT city AS value, COUNT(*) AS count FROM jobs WHERE is_active = 1 AND city IS NOT NULL GROUP BY city ORDER BY count DESC'
    )
    .all();
  res.json({ total, sources, types, cities });
});

router.get('/campuses', (_req, res) => res.json(campuses));

export default router;
