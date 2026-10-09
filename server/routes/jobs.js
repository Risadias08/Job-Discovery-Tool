import { Router } from 'express';
import { getDb } from '../db.js';
import { HttpError, parse, idParam, z } from '../lib/validate.js';
import { distanceInfo } from '../lib/geo.js';
import { hoursFit } from '../lib/hoursFit.js';

const router = Router();

const JOB_TYPES = ['part_time', 'casual', 'full_time', 'internship', 'unknown'];
const csv = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []));

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  location: z.string().trim().max(100).optional(),
  type: csv.refine((a) => a.every((t) => JOB_TYPES.includes(t)), 'unknown job type'),
  source: z.string().trim().max(30).optional(),
  remote: z.enum(['1', 'true']).optional(),
  minPay: z.coerce.number().min(0).max(10_000_000).optional(), // INR per month (monthly equivalent)
  postedWithin: z.coerce.number().int().positive().max(365).optional(), // days
  maxKm: z.coerce.number().positive().max(5000).optional(), // straight-line km from the student's campus
  hours: z.enum(['fits', 'fits_or_unknown']).optional(), // work-hours compatibility filter
  sort: z.enum(['newest', 'pay', 'nearest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Escape LIKE wildcards so user input is matched literally.
const like = (s) => `%${s.replace(/[%_\\]/g, '\\$&')}%`;

/**
 * Highest pay converted to INR per month, so yearly salaries, monthly pay and weekly stipends can be compared.
 * NULL when that isn't meaningful (unknown unit, lump sums, non-INR currencies, no pay listed).
 */
const RAW_MONTHLY = `(CASE WHEN j.pay_max IS NOT NULL AND (j.pay_currency = 'INR' OR j.pay_currency IS NULL) THEN
  CASE j.pay_unit
    WHEN 'month' THEN j.pay_max
    WHEN 'year'  THEN j.pay_max / 12.0
    WHEN 'week'  THEN j.pay_max * 4.33
    WHEN 'day'   THEN j.pay_max * 26
    WHEN 'hour'  THEN j.pay_max * 160
  END
END)`;
// Internship stipends above INR 1 lakh/month are almost certainly source typos (e.g. a yearly figure labelled
// "Monthly"), so they are left out of pay filtering and sorting. The listing still shows the pay as published.
const MONTHLY_PAY = `(CASE WHEN j.job_type = 'internship' AND ${RAW_MONTHLY} > 100000 THEN NULL ELSE ${RAW_MONTHLY} END)`;

// Spellings of the same place, so "Bangalore" also finds listings that say "Bengaluru" and vice versa.
const PLACE_ALIASES = [
  ['bangalore', 'bengaluru'],
  ['gurgaon', 'gurugram'],
  ['mumbai', 'bombay'],
  ['chennai', 'madras'],
  ['kolkata', 'calcutta'],
  ['delhi', 'new delhi'],
];
const placeVariants = (s) => PLACE_ALIASES.find((g) => g.includes(s.toLowerCase()))?.concat() ?? [s];

const JOIN = `FROM jobs j
  JOIN sources s ON s.id = j.source_id
  LEFT JOIN applications a ON a.job_id = j.id`;
const COLS = `j.*, s.name AS source, ${MONTHLY_PAY} AS monthly_pay_max,
  a.id AS application_id, a.status AS application_status, a.notes AS application_notes, a.applied_date AS application_applied_date`;

router.get('/', (req, res) => {
  const f = parse(listQuery, req.query);
  const where = ['j.is_active = 1'];
  const args = [];

  // Every search word must appear somewhere in title / employer / category / location / description.
  for (const term of (f.q ?? '').split(/\s+/).filter(Boolean)) {
    where.push(
      "(j.title LIKE ? ESCAPE '\\' OR j.employer LIKE ? ESCAPE '\\' OR j.category LIKE ? ESCAPE '\\' OR j.location_raw LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\')"
    );
    args.push(...Array(5).fill(like(term)));
  }
  if (f.location) {
    const variants = placeVariants(f.location);
    where.push(`(${variants.map(() => "j.location_raw LIKE ? ESCAPE '\\' OR j.city LIKE ? ESCAPE '\\'").join(' OR ')})`);
    for (const v of variants) args.push(like(v), like(v));
  }
  if (f.type.length) {
    where.push(`j.job_type IN (${f.type.map(() => '?').join(',')})`);
    args.push(...f.type);
  }
  if (f.source) {
    where.push('s.name = ?');
    args.push(f.source);
  }
  if (f.remote) where.push('j.is_remote = 1');
  if (f.minPay !== undefined) {
    where.push(`${MONTHLY_PAY} >= ?`);
    args.push(f.minPay);
  }
  if (f.postedWithin) {
    where.push('j.posted_at >= date(\'now\', ?)');
    args.push(`-${f.postedWithin} days`);
  }

  const whereSql = where.join(' AND ');
  const db = getDb();
  const prefs = db.prepare('SELECT * FROM preferences WHERE id = 1').get();

  // "newest": most recent first. Many listings share a date, so within one date the job types are
  // interleaved (rn = 1st of each type, then 2nd of each type...) instead of one source filling the page.
  const orderedSql =
    f.sort === 'pay'
      ? `SELECT ${COLS} ${JOIN} WHERE ${whereSql}
         ORDER BY ${MONTHLY_PAY} DESC NULLS LAST, j.posted_at DESC NULLS LAST, j.id DESC`
      : `SELECT * FROM (
           SELECT ${COLS}, ROW_NUMBER() OVER (PARTITION BY j.job_type, j.posted_at ORDER BY j.id DESC) AS rn
           ${JOIN} WHERE ${whereSql}
         ) ORDER BY posted_at DESC NULLS LAST, rn, id DESC`;

  // Distance and hours-fit depend on the student's preferences, so filtering or sorting by them can't be done in SQL.
  // These requests load the matching rows, work the values out in JS, then filter / sort / paginate in memory
  // (a few hundred rows). Everything else is paginated in SQL.
  const needsPrefsLogic = f.sort === 'nearest' || f.maxKm !== undefined || f.hours !== undefined;
  if ((f.sort === 'nearest' || f.maxKm !== undefined) && prefs.campus_lat == null) {
    throw new HttpError(400, 'campus_required', 'Choose your campus in Preferences to sort or filter by distance.');
  }
  if (f.hours && prefs.weekly_hours_limit == null) {
    throw new HttpError(400, 'hours_required', 'Enter your weekly hours in Preferences to filter by work-hours compatibility.');
  }

  let items;
  let total;
  if (!needsPrefsLogic) {
    ({ total } = db.prepare(`SELECT COUNT(*) AS total ${JOIN} WHERE ${whereSql}`).get(...args));
    items = db.prepare(`${orderedSql} LIMIT ? OFFSET ?`).all(...args, f.limit, (f.page - 1) * f.limit).map((j) => annotate(j, prefs));
  } else {
    let all = db.prepare(orderedSql).all(...args).map((j) => annotate(j, prefs));
    if (f.maxKm !== undefined) all = all.filter((j) => j.distance?.remote || (j.distance && j.distance.exactKm <= f.maxKm));
    if (f.hours) {
      const ok = f.hours === 'fits' ? ['fits'] : ['fits', 'may_fit', 'unknown'];
      all = all.filter((j) => ok.includes(j.hours_fit.status));
    }
    if (f.sort === 'nearest') {
      // located jobs by distance, then remote jobs (no commute), then jobs we couldn't place; ties keep "newest" order
      const rank = (j) => (j.distance?.km !== undefined ? 0 : j.distance?.remote ? 1 : 2);
      all.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.distance.exactKm - b.distance.exactKm : 0));
    }
    total = all.length;
    items = all.slice((f.page - 1) * f.limit, f.page * f.limit);
  }

  res.json({ items, total, page: f.page, limit: f.limit, pages: Math.max(1, Math.ceil(total / f.limit)) });
});

/** Add the student-specific indicators to a job row. */
function annotate(job, prefs) {
  delete job.rn;
  job.distance = distanceInfo(job, prefs);
  job.hours_fit = hoursFit(job, prefs);
  return job;
}

router.get('/:id', (req, res) => {
  const id = parse(idParam, req.params.id);
  const db = getDb();
  const job = db.prepare(`SELECT ${COLS} ${JOIN} WHERE j.id = ?`).get(id);
  if (!job) throw new HttpError(404, 'not_found', `Job ${id} not found`);
  res.json(annotate(job, db.prepare('SELECT * FROM preferences WHERE id = 1').get()));
});

export default router;
