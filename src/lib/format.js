export const TYPES = [
  { value: 'casual', label: 'Everyday / casual', hint: 'Delivery, cooking, service and gig roles' },
  { value: 'part_time', label: 'Part-time', hint: 'Fewer hours alongside study' },
  { value: 'full_time', label: 'Full-time', hint: 'Permanent or graduate roles' },
  { value: 'internship', label: 'Internship', hint: 'Paid or unpaid placements in any field' },
];

export const TYPE_STYLE = {
  casual: 'bg-amber-100 text-amber-800 ring-amber-200',
  part_time: 'bg-sky-100 text-sky-800 ring-sky-200',
  full_time: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  internship: 'bg-violet-100 text-violet-800 ring-violet-200',
  unknown: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const typeLabel = (v) => TYPES.find((t) => t.value === v)?.label ?? 'Not specified';

export const SOURCE_LABELS = { internshala: 'Internshala', freshersworld: 'Freshersworld', workindia: 'WorkIndia' };
export const sourceLabel = (s) => SOURCE_LABELS[s] ?? s;

export const STATUSES = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
];
export const statusLabel = (v) => STATUSES.find((s) => s.value === v)?.label ?? v;

const nf = new Intl.NumberFormat('en-IN');
const UNIT = { month: '/ month', year: '/ year', week: '/ week', day: '/ day', hour: '/ hour', total: 'in total', unknown: '' };

/** Readable pay text, e.g. "₹35,000 – ₹59,000 / month". Falls back to the site's own text, or null if none. */
export function formatPay(job) {
  if (!job.pay_raw) return null;
  if (job.pay_max === 0) return 'Unpaid';
  if (job.pay_min == null || job.pay_max == null) return job.pay_raw;
  const sym = job.pay_currency === 'USD' ? '$' : '₹';
  const amount = (n) => `${sym}${nf.format(n)}`;
  const range = job.pay_min === job.pay_max ? amount(job.pay_min) : `${amount(job.pay_min)} – ${amount(job.pay_max)}`;
  return `${range} ${UNIT[job.pay_unit] ?? ''}`.trim();
}

const DAY = 86400000;
function daysAgo(isoDate) {
  const posted = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(posted)) return null;
  const today = Date.parse(todayISO() + 'T00:00:00Z');
  return Math.max(0, Math.round((today - posted) / DAY));
}

/** "Today", "3 days ago", "2 months ago" - or null when the listing had no date. */
export function postedLabel(isoDate) {
  if (!isoDate) return null;
  const d = daysAgo(isoDate);
  if (d === null) return null;
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? 's' : ''} ago`;
  return `${Math.floor(d / 365)} year${Math.floor(d / 365) > 1 ? 's' : ''} ago`;
}

export function fullDate(isoDate) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const STATUS_STYLE = {
  saved: 'bg-slate-100 text-slate-700 ring-slate-200',
  applied: 'bg-sky-100 text-sky-800 ring-sky-200',
  interview: 'bg-violet-100 text-violet-800 ring-violet-200',
  offer: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 ring-rose-200',
};
// The student's local calendar date (not UTC, which is still "yesterday" in India before 05:30).
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
