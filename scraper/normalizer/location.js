import { clean } from './text.js';

const ALIASES = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  bombay: 'Mumbai',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  gurgaon: 'Gurugram',
  'new delhi': 'Delhi',
};

const titleCase = (s) => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

function canonicalCity(s) {
  const name = clean(s.replace(/\(.*?\)/g, ''));
  if (!name) return null;
  return ALIASES[name.toLowerCase()] ?? titleCase(name);
}

/**
 * Normalise a location string.
 * - remote: "Work from home" / "Remote" / "WFH"
 * - city: the primary city. Internshala and Freshersworld list cities with the main one first
 *   ("Delhi, Gurgaon, Noida"); WorkIndia prints "Area, City", so its adapter passes cityPosition: 'last'.
 * Returns { raw, city, remote }, or null if there is no location.
 */
export function parseLocation(rawInput, { cityPosition = 'first' } = {}) {
  const raw = clean(rawInput);
  if (!raw) return null;
  const remote = /work from home|remote|\bwfh\b/i.test(raw);
  if (remote && !/,/.test(raw)) return { raw, city: null, remote: true };
  const parts = raw.split(',').map((p) => clean(p)).filter(Boolean);
  const pick = cityPosition === 'last' ? parts[parts.length - 1] : parts[0];
  return { raw, city: pick ? canonicalCity(pick) : null, remote };
}
