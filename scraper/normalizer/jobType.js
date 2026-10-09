export const JOB_TYPES = ['part_time', 'casual', 'full_time', 'internship', 'unknown'];

/** Map free text ("Part time", "internship", "Full-time"...) to one of our job types, or null. */
export function normalizeJobType(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/\bintern(ship)?s?\b/.test(t)) return 'internship';
  if (/part[\s-]?time/.test(t)) return 'part_time';
  if (/casual|gig|temporary|temp\b/.test(t)) return 'casual';
  if (/full[\s-]?time/.test(t)) return 'full_time';
  return null;
}

/**
 * Decide the job type from the evidence available, strongest first:
 * 1. a type the site states on the card (`hint`),
 * 2. keywords in the job title,
 * 3. the default for the listing page we scraped (e.g. the "part-time jobs" category page).
 */
export function resolveJobType({ hint, title, defaultType }) {
  return normalizeJobType(hint) ?? normalizeJobType(title) ?? (JOB_TYPES.includes(defaultType) ? defaultType : 'unknown');
}
