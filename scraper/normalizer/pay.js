import { clean } from './text.js';

const UNIT_PATTERNS = [
  ['total', /lump\s*sum/i],
  ['year', /\/\s*(year|yr|annum)|per\s+(year|annum)|yearly|annual|\blpa\b/i],
  ['month', /\/\s*month|per\s+month|monthly/i],
  ['week', /\/\s*week|per\s+week|weekly/i],
  ['day', /\/\s*day|per\s+day|daily/i],
  ['hour', /\/\s*(hour|hr)|per\s+hour|hourly/i],
];

function detectCurrency(raw) {
  if (/₹|\brs\.?\s*\d|\binr\b/i.test(raw)) return 'INR';
  if (/\$|\busd\b/i.test(raw)) return 'USD';
  return null;
}

/**
 * Parse a pay string such as "₹ 4,50,000 - 4,60,000 /year", "2500 - 5000 Monthly",
 * "Rs. 35000 - Rs. 59000" or "Unpaid".
 * Indian digit grouping (4,50,000) is handled by simply removing commas.
 * `defaultUnit` is used when the text has no unit (WorkIndia quotes monthly salaries without saying so).
 * Returns null when there is no pay information at all.
 */
export function parsePay(rawInput, { defaultUnit = 'unknown', defaultCurrency = null } = {}) {
  const raw = clean(rawInput);
  if (!raw) return null;

  if (/^unpaid$/i.test(raw)) return { raw, min: 0, max: 0, currency: null, unit: 'unknown' };

  const nums = (raw.match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map((n) => Number(n.replace(/,/g, '')))
    .filter(Number.isFinite)
    .slice(0, 2);
  const currency = detectCurrency(raw) ?? defaultCurrency;
  if (nums.length === 0) return { raw, min: null, max: null, currency, unit: 'unknown' };

  const unit = UNIT_PATTERNS.find(([, re]) => re.test(raw))?.[0] ?? defaultUnit;
  return { raw, min: Math.min(...nums), max: Math.max(...nums), currency, unit };
}
