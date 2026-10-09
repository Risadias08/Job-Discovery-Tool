import { clean } from './text.js';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const dayIndex = (s) => DAYS.findIndex((d) => d.startsWith(s.toLowerCase().slice(0, 3)));

function minutesOfDay(h, m, ap) {
  let hour = Number(h) % 12;
  if (/pm/i.test(ap)) hour += 12;
  return hour * 60 + Number(m ?? 0);
}

/** "Monday to Saturday" -> 6, "Mon-Fri" -> 5, "Saturday, Sunday" -> 2, "6 days a week" -> 6. Null if unclear. */
function countDays(text) {
  const n = text.match(/\b(\d)\s*days?\s*(?:a|per|\/)\s*week\b/i);
  if (n) return Number(n[1]);
  const names = '(mon|tue|wed|thu|fri|sat|sun)[a-z]*';
  const range = text.match(new RegExp(`\\b${names}\\s*(?:to|-|–)\\s*${names}\\b`, 'i'));
  if (range) {
    const a = dayIndex(range[1]);
    const b = dayIndex(range[2]);
    return ((b - a + 7) % 7) + 1;
  }
  const listed = new Set((text.match(new RegExp(`\\b${names}\\b`, 'gi')) ?? []).map((d) => dayIndex(d)));
  return listed.size > 0 ? listed.size : null;
}

/**
 * Parse a "Job Timings" line from a listing, e.g.
 *   "3 hours a day | Monday to Saturday | day shift"
 *   "9:30 AM - 6:30 PM | Monday to Saturday"
 *   "ANY TIME | day shift"
 * Returns { raw, perDay, days, weekly: {min,max}|null }.
 * weekly is only filled in when both the hours per day AND the number of days are stated -
 * nothing is guessed. For a clock range the shift length (end minus start) is used.
 */
export function parseJobTimings(input) {
  const raw = clean(input);
  if (!raw) return null;

  let perDay = null;
  const hoursDay = raw.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:hours?|hrs?)\s*(?:a|per|\/|each)\s*day/i);
  const hoursWeek = raw.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:hours?|hrs?)\s*(?:a|per|\/|each)\s*week/i);
  const range = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);

  if (hoursWeek) {
    const min = Number(hoursWeek[1]);
    const max = Number(hoursWeek[2] ?? hoursWeek[1]);
    return { raw, perDay: null, days: null, weekly: { min: Math.min(min, max), max: Math.max(min, max) } };
  }
  if (hoursDay) {
    const a = Number(hoursDay[1]);
    const b = Number(hoursDay[2] ?? hoursDay[1]);
    perDay = { min: Math.min(a, b), max: Math.max(a, b) };
  } else if (range) {
    const start = minutesOfDay(range[1], range[2], range[3]);
    let end = minutesOfDay(range[4], range[5], range[6]);
    if (end <= start) end += 24 * 60; // overnight shift
    const h = (end - start) / 60;
    perDay = { min: h, max: h };
  }

  const days = countDays(raw);
  const weekly = perDay && days ? { min: round(perDay.min * days), max: round(perDay.max * days) } : null;
  return { raw, perDay, days, weekly };
}

const round = (n) => Math.round(n * 10) / 10;
