const HOURS_STYLE = {
  fits: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  may_fit: 'bg-amber-50 text-amber-800 ring-amber-200',
  over: 'bg-rose-50 text-rose-800 ring-rose-200',
  unknown: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const HOURS_ICON = { fits: '✓', may_fit: '~', over: '!', unknown: '?' };
const BAND_STYLE = {
  near: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  mid: 'bg-amber-50 text-amber-800 ring-amber-200',
  far: 'bg-rose-50 text-rose-800 ring-rose-200',
};
const chip = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset';

/** Work-hours compatibility chip. Renders nothing until the student has entered a weekly limit. */
export function HoursChip({ fit }) {
  if (!fit || fit.status === 'unset') return null;
  return (
    <span className={`${chip} ${HOURS_STYLE[fit.status]}`} title={`${fit.detail} (Informational only - not legal advice.)`} data-testid="hours-chip" data-status={fit.status}>
      <span aria-hidden="true">{HOURS_ICON[fit.status]}</span> {fit.label}
      {fit.jobHours ? <span className="font-normal"> · {fit.jobHours}</span> : null}
    </span>
  );
}

/** Approximate-distance chip. `campusSet` says whether the student picked a campus (to explain a missing distance). */
export function DistanceChip({ distance, campusSet }) {
  if (!campusSet) return null;
  if (!distance) {
    return <span className={`${chip} bg-slate-100 text-slate-600 ring-slate-200`} title="We could not map this job's location to coordinates." data-testid="distance-chip">Distance unavailable</span>;
  }
  if (distance.remote) {
    return <span className={`${chip} bg-slate-100 text-slate-700 ring-slate-200`} data-testid="distance-chip" data-band="remote">Work from home · no commute</span>;
  }
  return (
    <span
      className={`${chip} ${BAND_STYLE[distance.band]}`}
      title="Approximate straight-line distance from your campus. It is not a route or travel time."
      data-testid="distance-chip"
      data-band={distance.band}
      data-km={distance.exactKm}
    >
      <span aria-hidden="true">📍</span> {distance.label} · {distance.bandLabel}
    </span>
  );
}
