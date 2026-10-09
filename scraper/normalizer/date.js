import { clean } from './text.js';

// All three sources are Indian and quote dates in Indian time, so "today" means the calendar date in IST (UTC+5:30),
// not the UTC date (which is still yesterday between 00:00 and 05:30 IST).
const IST_MS = 5.5 * 3600 * 1000;
const inIST = (d) => new Date(d.getTime() + IST_MS);
const iso = (d) => d.toISOString().slice(0, 10); // d is already shifted to IST

/**
 * Turn the site's posted-date text into an ISO date (YYYY-MM-DD), or null if it can't be understood.
 * Handles: "Just now", "Few hours ago", "Today", "Yesterday", "5 days ago", "3 weeks ago",
 * "1 months ago", and "Posted on: 9/25/2026" (month/day/year, as WorkIndia prints it).
 * Relative dates are computed from `now` (the scrape time).
 */
export function parsePostedDate(textInput, nowReal = new Date()) {
  const text = clean(textInput);
  if (!text) return null;
  const now = inIST(nowReal);

  if (/just now|few (hours|minutes)|\btoday\b|\d+\s*(hour|minute|min)s?\s*ago/i.test(text)) return iso(now);
  if (/yesterday/i.test(text)) return iso(new Date(now.getTime() - 86400000));

  const rel = text.match(/(\d+)\s*(day|week|month|year)s?\s*ago/i);
  if (rel) {
    const n = Number(rel[1]);
    const d = new Date(now);
    const unit = rel[2].toLowerCase();
    if (unit === 'day') d.setUTCDate(d.getUTCDate() - n);
    else if (unit === 'week') d.setUTCDate(d.getUTCDate() - 7 * n);
    else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() - n);
    else d.setUTCFullYear(d.getUTCFullYear() - n);
    return iso(d);
  }

  const mdy = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const [, m, day, y] = mdy.map(Number);
    const d = new Date(Date.UTC(y, m - 1, day));
    // reject impossible dates (e.g. 13/40/2026) and dates in the future
    if (d.getUTCMonth() === m - 1 && d.getUTCDate() === day && d.getTime() <= now.getTime() + 86400000) return iso(d);
  }
  return null;
}
