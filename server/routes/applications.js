import { Router } from 'express';
import { getDb } from '../db.js';
import { HttpError, parse, idParam, z } from '../lib/validate.js';

const router = Router();
const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const createBody = z.object({ jobId: z.number().int().positive(), status: z.enum(STATUSES).default('saved') });
const patchBody = z
  .object({
    status: z.enum(STATUSES),
    notes: z.string().max(2000).nullable(),
    appliedDate: isoDate.nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'provide at least one field');

const SELECT = `SELECT a.*, j.title, j.employer, j.location_raw, j.is_remote, j.pay_raw, j.pay_min, j.pay_max, j.pay_unit,
                       j.pay_currency, j.job_type, j.posted_at, j.url, s.name AS source
                FROM applications a JOIN jobs j ON j.id = a.job_id JOIN sources s ON s.id = j.source_id`;

router.get('/', (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !STATUSES.includes(status)) throw new HttpError(400, 'invalid_input', 'unknown status');
  const db = getDb();
  const rows = status
    ? db.prepare(`${SELECT} WHERE a.status = ? ORDER BY a.updated_at DESC`).all(status)
    : db.prepare(`${SELECT} ORDER BY a.updated_at DESC`).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { jobId, status } = parse(createBody, req.body);
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(jobId)) {
    throw new HttpError(404, 'not_found', `Job ${jobId} not found`);
  }
  if (db.prepare('SELECT 1 FROM applications WHERE job_id = ?').get(jobId)) {
    throw new HttpError(409, 'already_saved', 'Job already in tracker');
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO applications (job_id, status) VALUES (?, ?)').run(jobId, status);
  res.status(201).json(db.prepare(`${SELECT} WHERE a.id = ?`).get(lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const id = parse(idParam, req.params.id);
  const body = parse(patchBody, req.body);
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM applications WHERE id = ?').get(id)) {
    throw new HttpError(404, 'not_found', `Application ${id} not found`);
  }
  const cols = { status: body.status, notes: body.notes, applied_date: body.appliedDate };
  const sets = Object.entries(cols).filter(([, v]) => v !== undefined);
  db.prepare(
    `UPDATE applications SET ${sets.map(([k]) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
  ).run(...sets.map(([, v]) => v), id);
  res.json(db.prepare(`${SELECT} WHERE a.id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = parse(idParam, req.params.id);
  const { changes } = getDb().prepare('DELETE FROM applications WHERE id = ?').run(id);
  if (!changes) throw new HttpError(404, 'not_found', `Application ${id} not found`);
  res.status(204).end();
});

export default router;
