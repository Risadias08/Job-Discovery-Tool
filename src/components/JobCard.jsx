import { Link } from 'react-router-dom';
import TypeBadge from './TypeBadge.jsx';
import SaveButton from './SaveButton.jsx';
import { DistanceChip, HoursChip } from './Indicators.jsx';
import { formatPay, fullDate, postedLabel, sourceLabel } from '../lib/format.js';

const NOT_LISTED = <span className="text-slate-400">Not listed</span>;

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="truncate text-sm text-slate-800" title={typeof children === 'string' ? children : undefined}>{children}</dd>
    </div>
  );
}

export default function JobCard({ job, onChange, campusSet = false }) {
  const pay = formatPay(job);
  const posted = postedLabel(job.posted_at);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="job-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 text-lg font-semibold text-slate-900">
          <Link to={`/jobs/${job.id}`} className="hover:text-indigo-700 hover:underline">{job.title}</Link>
        </h2>
        <TypeBadge type={job.job_type} />
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Employer">{job.employer ?? NOT_LISTED}</Field>
        <Field label="Location">
          {job.location_raw ? (
            <>
              {job.location_raw}
              {job.is_remote ? <span className="ml-1 rounded bg-slate-100 px-1 text-xs text-slate-600">remote</span> : null}
            </>
          ) : (
            NOT_LISTED
          )}
        </Field>
        <Field label="Pay">{pay ?? NOT_LISTED}</Field>
        <Field label="Posted">
          {posted ? <span title={fullDate(job.posted_at) ?? ''}>{posted}</span> : NOT_LISTED}
        </Field>
      </dl>

      {(campusSet || job.hours_fit?.status !== 'unset') && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="indicators">
          <DistanceChip distance={job.distance} campusSet={campusSet} />
          <HoursChip fit={job.hours_fit} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Link to={`/jobs/${job.id}`} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          View job
        </Link>
        <SaveButton job={job} onChange={onChange} />
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Apply on {sourceLabel(job.source)} ↗
        </a>
        <span className="ml-auto text-xs text-slate-500">via {sourceLabel(job.source)}</span>
      </div>
    </article>
  );
}
