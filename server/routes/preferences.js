import { Router } from 'express';
import { getDb } from '../db.js';
import { parse, z } from '../lib/validate.js';

const router = Router();

const putBody = z.object({
  campusId: z.string().max(50).nullable().optional(),
  campusName: z.string().max(120).nullable().optional(),
  campusLat: z.number().min(-90).max(90).nullable().optional(),
  campusLng: z.number().min(-180).max(180).nullable().optional(),
  maxCommuteKm: z.number().positive().max(500).nullable().optional(),
  weeklyHoursLimit: z.number().min(0).max(168).nullable().optional(),
  hoursAlreadyCommitted: z.number().min(0).max(168).optional(),
});

const COLS = {
  campusId: 'campus_id',
  campusName: 'campus_name',
  campusLat: 'campus_lat',
  campusLng: 'campus_lng',
  maxCommuteKm: 'max_commute_km',
  weeklyHoursLimit: 'weekly_hours_limit',
  hoursAlreadyCommitted: 'hours_already_committed',
};

const read = () => getDb().prepare('SELECT * FROM preferences WHERE id = 1').get();

router.get('/', (_req, res) => res.json(read()));

router.put('/', (req, res) => {
  const body = parse(putBody, req.body);
  const sets = Object.entries(body).filter(([, v]) => v !== undefined);
  if (sets.length) {
    getDb()
      .prepare(`UPDATE preferences SET ${sets.map(([k]) => `${COLS[k]} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = 1`)
      .run(...sets.map(([, v]) => v));
  }
  res.json(read());
});

export default router;
