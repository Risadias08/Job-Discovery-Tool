/**
 * Work-hours compatibility indicator.
 *
 * This only compares two numbers the student typed in (their own weekly limit and the hours they already use)
 * with the hours a listing publishes. It says nothing about what the student is or is not legally allowed to do.
 *
 * status:
 *   unset    - the student has not entered a weekly limit yet
 *   unknown  - the listing doesn't publish hours we can compare
 *   fits     - the job's hours (even the maximum) fit into the student's free hours
 *   may_fit  - the job's range straddles the free hours (shorter end fits, longer end doesn't)
 *   over     - even the shortest listed hours are more than the student's free hours
 */
export function hoursFit(job, prefs) {
  const limit = prefs?.weekly_hours_limit;
  if (limit == null) {
    return { status: 'unset', label: 'Set your weekly hours', detail: 'Add your weekly hours in Preferences to see how this job compares.' };
  }

  const committed = prefs.hours_already_committed ?? 0;
  const free = Math.max(0, limit - committed);
  const min = job.hours_per_week_min;
  const max = job.hours_per_week_max ?? min;

  if (min == null) {
    const detail = job.hours_raw
      ? `Listing says: "${job.hours_raw}" - not enough to work out hours per week.`
      : 'This listing does not publish working hours. Ask the employer before applying.';
    return { status: 'unknown', label: 'Hours not listed', detail, free };
  }

  const hrs = min === max ? `${fmt(min)} hrs/week` : `${fmt(min)}-${fmt(max)} hrs/week`;
  if (max <= free) return { status: 'fits', label: 'Fits your hours', detail: `Listed ${hrs}; you have ${fmt(free)} hrs/week free.`, jobHours: hrs, free };
  if (min <= free) return { status: 'may_fit', label: 'May fit your hours', detail: `Listed ${hrs}; you have ${fmt(free)} hrs/week free.`, jobHours: hrs, free };
  return {
    status: 'over',
    label: 'More than your free hours',
    detail: `Listed ${hrs}; you have ${fmt(free)} hrs/week free (${fmt(min - free)} hrs/week short).`,
    jobHours: hrs,
    free,
  };
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
