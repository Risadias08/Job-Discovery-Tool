import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import TypeBadge from '../components/TypeBadge.jsx';
import { DistanceChip, HoursChip } from '../components/Indicators.jsx';
import { STATUSES, formatPay, fullDate, postedLabel, sourceLabel, todayISO } from '../lib/format.js';

const today = todayISO;
const NOT_LISTED = <span className="text-slate-400">Not listed</span>;

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', job: null, error: null });
  const [prefs, setPrefs] = useState(null);
  useEffect(() => { api.preferences().then(setPrefs).catch(() => setPrefs(null)); }, []);

  const load = useCallback(() => {
    setState({ status: 'loading', job: null, error: null });
    api
      .job(id)
      .then((job) => setState({ status: 'ok', job, error: null }))
      .catch((e) => setState({ status: 'error', job: null, error: e.message }));
  }, [id]);
  useEffect(load, [load]);

  if (state.status === 'loading') return <p className="text-slate-600" data-testid="loading-state">Loading job...</p>;
  if (state.status === 'error') {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-center" data-testid="error-state">
        <p className="font-medium text-red-800">Could not load this job</p>
        <p className="mt-1 text-sm text-red-700">{state.error}</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={load} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white">Try again</button>
          <Link to="/" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm">Back to jobs</Link>
        </div>
      </div>
    );
  }

  const job = state.job;
  const pay = formatPay(job);
  const posted = postedLabel(job.posted_at);

  return (
    <div>
      <button type="button" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))} className="text-sm text-indigo-700 hover:underline">
        ← Back to results
      </button>

      <article className="mt-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900" data-testid="job-title">{job.title}</h1>
            <p className="mt-1 text-slate-700">{job.employer ?? 'Employer not listed'}</p>
          </div>
          <TypeBadge type={job.job_type} />
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Location">
            {job.location_raw ?? NOT_LISTED}
            {job.is_remote ? <span className="ml-1 rounded bg-slate-100 px-1 text-xs text-slate-600">remote</span> : null}
          </Row>
          <Row label="Pay">{pay ?? NOT_LISTED}</Row>
          <Row label="Job type"><TypeBadge type={job.job_type} /></Row>
          <Row label="Working hours">{job.hours_raw ?? NOT_LISTED}</Row>
          <Row label="Posted">{posted ? `${posted} (${fullDate(job.posted_at)})` : NOT_LISTED}</Row>
          <Row label="Source">{sourceLabel(job.source)}</Row>
          {job.category && <Row label="Category">{job.category}</Row>}
        </dl>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Description</h2>
          <p className="mt-2 whitespace-pre-line text-slate-800" data-testid="job-description">
            {job.description ?? 'No description was available on the listing page.'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            This is the short summary shown on {sourceLabel(job.source)}'s listing page. See the original listing for the full description.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="source-link"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Apply on {sourceLabel(job.source)} ↗
          </a>
          <span className="break-all text-xs text-slate-500">Original listing: <a href={job.url} target="_blank" rel="noopener noreferrer" className="underline">{job.url}</a></span>
        </div>
      </article>

      <FitPanel job={job} prefs={prefs} />

      <TrackerPanel job={job} onChange={(fields) => setState((s) => ({ ...s, job: { ...s.job, ...fields } }))} />
    </div>
  );
}

function FitPanel({ job, prefs }) {
  const campusSet = prefs?.campus_lat != null;
  const fit = job.hours_fit;
  const d = job.distance;
  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" data-testid="fit-panel">
      <h2 className="text-lg font-semibold">How this job fits you</h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Work hours</h3>
          {fit?.status === 'unset' ? (
            <p className="mt-1 text-sm text-slate-600">Enter your weekly hours in <Link to="/preferences" className="underline">Preferences</Link> to compare.</p>
          ) : (
            <>
              <div className="mt-1"><HoursChip fit={fit} /></div>
              <p className="mt-2 text-sm text-slate-700" data-testid="hours-detail">{fit?.detail}</p>
            </>
          )}
          <p className="mt-2 text-xs text-slate-500">Informational only. It compares numbers you entered with the hours the listing publishes, and is not legal or immigration advice.</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Distance from your campus</h3>
          {!campusSet ? (
            <p className="mt-1 text-sm text-slate-600">Choose your campus in <Link to="/preferences" className="underline">Preferences</Link> to see the distance.</p>
          ) : (
            <>
              <div className="mt-1"><DistanceChip distance={d} campusSet /></div>
              <p className="mt-2 text-sm text-slate-700" data-testid="distance-detail">
                {d?.remote ? 'This is a work-from-home job, so there is no commute.' : d ? `About ${d.km} km in a straight line from ${prefs.campus_name}${d.precision === 'city' ? ', measured to the city centre because the listing only names the city' : ''}.` : 'We could not work out where this job is.'}
              </p>
            </>
          )}
          <p className="mt-2 text-xs text-slate-500">Approximate straight-line distance. It is not a route or a travel time.</p>
        </div>
      </div>
    </section>
  );
}

function TrackerPanel({ job, onChange }) {
  const saved = job.application_id != null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'error', text }
  const [notes, setNotes] = useState(job.application_notes ?? '');
  const [date, setDate] = useState(job.application_applied_date ?? '');

  const fromApp = (a) => ({ application_id: a.id, application_status: a.status, application_notes: a.notes, application_applied_date: a.applied_date });

  async function run(fn, okText) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ type: 'ok', text: okText });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(async () => {
    const a = await api.saveJob(job.id);
    onChange(fromApp(a));
  }, 'Saved to your tracker.');

  const changeStatus = (status) => run(async () => {
    const body = { status };
    if (status === 'applied' && !date) body.appliedDate = today(); // convenient default, editable below
    const a = await api.updateApplication(job.application_id, body);
    setDate(a.applied_date ?? '');
    onChange(fromApp(a));
  }, 'Status updated.');

  const saveDetails = () => run(async () => {
    const a = await api.updateApplication(job.application_id, { notes: notes.trim() === '' ? null : notes, appliedDate: date === '' ? null : date });
    onChange(fromApp(a));
  }, 'Notes and date saved.');

  const remove = () => run(async () => {
    await api.removeApplication(job.application_id);
    setNotes('');
    setDate('');
    onChange({ application_id: null, application_status: null, application_notes: null, application_applied_date: null });
  }, 'Removed from your tracker.');

  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" data-testid="tracker-panel">
      <h2 className="text-lg font-semibold">Application tracking</h2>
      {!saved ? (
        <div className="mt-3">
          <p className="text-sm text-slate-600">Save this job to track your application status, date and notes.</p>
          <button type="button" onClick={save} disabled={busy} className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? 'Saving...' : 'Save job'}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">Status</span>
            <select value={job.application_status} disabled={busy} onChange={(e) => changeStatus(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2" data-testid="status-select">
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Date applied</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2" data-testid="applied-date" />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Contact person, interview date, follow-ups..." className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" data-testid="notes" />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" onClick={saveDetails} disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">Save notes &amp; date</button>
            <button type="button" onClick={remove} disabled={busy} className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60">Remove from tracker</button>
          </div>
        </div>
      )}
      {msg && (
        <p role={msg.type === 'error' ? 'alert' : 'status'} className={`mt-3 text-sm ${msg.type === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>{msg.text}</p>
      )}
    </section>
  );
}
