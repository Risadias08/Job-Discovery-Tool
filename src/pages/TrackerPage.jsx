import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FeatureNote from '../components/FeatureNote.jsx';
import TypeBadge from '../components/TypeBadge.jsx';
import { FEATURES } from '../lib/features.js';
import { STATUSES, STATUS_STYLE, formatPay, sourceLabel, statusLabel, todayISO } from '../lib/format.js';

export default function TrackerPage() {
  const [params, setParams] = useSearchParams();
  const filter = STATUSES.some((s) => s.value === params.get('status')) ? params.get('status') : 'all';
  const [state, setState] = useState({ status: 'loading', apps: [], error: null });

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api
      .applications()
      .then((apps) => setState({ status: 'ok', apps, error: null }))
      .catch((e) => setState({ status: 'error', apps: [], error: e.message }));
  }, []);
  useEffect(load, [load]);

  const patchLocal = (id, fields) => setState((s) => ({ ...s, apps: s.apps.map((a) => (a.id === id ? { ...a, ...fields } : a)) }));
  const removeLocal = (id) => setState((s) => ({ ...s, apps: s.apps.filter((a) => a.id !== id) }));

  const counts = Object.fromEntries(STATUSES.map((s) => [s.value, state.apps.filter((a) => a.status === s.value).length]));
  const visible = filter === 'all' ? state.apps : state.apps.filter((a) => a.status === filter);
  const tab = (active) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium ${active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Application tracker</h1>
      <p className="mt-1 text-sm text-slate-600">Every job you saved, with where you are in the process. Changes are saved to the database as you make them.</p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="status-summary">
        {STATUSES.map((s) => (
          <div key={s.value} className={`rounded-lg px-3 py-2 ring-1 ring-inset ${STATUS_STYLE[s.value]}`}>
            <span className="block text-xl font-semibold" data-testid={`count-${s.value}`}>{counts[s.value]}</span>
            <span className="block text-sm">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <button type="button" className={tab(filter === 'all')} aria-pressed={filter === 'all'} onClick={() => setParams({})}>All ({state.apps.length})</button>
        {STATUSES.map((s) => (
          <button key={s.value} type="button" className={tab(filter === s.value)} aria-pressed={filter === s.value} onClick={() => setParams({ status: s.value })}>
            {s.label} ({counts[s.value]})
          </button>
        ))}
      </div>

      <section className="mt-5" aria-live="polite">
        {state.status === 'loading' && <p className="text-slate-600" data-testid="loading-state">Loading your applications...</p>}
        {state.status === 'error' && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-center" data-testid="error-state">
            <p className="font-medium text-red-800">Could not load your applications</p>
            <p className="mt-1 text-sm text-red-700">{state.error}</p>
            <button type="button" onClick={load} className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white">Try again</button>
          </div>
        )}
        {state.status === 'ok' && state.apps.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center" data-testid="empty-state">
            <p className="text-lg font-medium text-slate-800">You haven't saved any jobs yet</p>
            <p className="mt-1 text-sm text-slate-600">Use "Save job" on any listing and it will appear here.</p>
            <Link to="/" className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Browse jobs</Link>
          </div>
        )}
        {state.status === 'ok' && state.apps.length > 0 && visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center" data-testid="empty-filter">
            <p className="font-medium text-slate-800">No applications with status "{statusLabel(filter)}"</p>
            <button type="button" onClick={() => setParams({})} className="mt-3 rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Show all</button>
          </div>
        )}
        <div className="space-y-3">
          {visible.map((a) => <ApplicationCard key={a.id} app={a} onPatch={patchLocal} onRemove={removeLocal} />)}
        </div>
      </section>

      <FeatureNote feature={FEATURES.tracker} />
    </div>
  );
}

function ApplicationCard({ app, onPatch, onRemove }) {
  const [notes, setNotes] = useState(app.notes ?? '');
  const [date, setDate] = useState(app.applied_date ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const dirty = notes !== (app.notes ?? '') || date !== (app.applied_date ?? '');
  const pay = formatPay(app);

  async function run(fn, ok) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (status) =>
    run(async () => {
      const body = { status };
      if (status === 'applied' && !date) body.appliedDate = todayISO(); // sensible default, editable
      const u = await api.updateApplication(app.id, body);
      setDate(u.applied_date ?? '');
      onPatch(app.id, { status: u.status, applied_date: u.applied_date, updated_at: u.updated_at });
    }, 'Status updated.');

  const saveDetails = () =>
    run(async () => {
      const u = await api.updateApplication(app.id, { notes: notes.trim() === '' ? null : notes, appliedDate: date === '' ? null : date });
      onPatch(app.id, { notes: u.notes, applied_date: u.applied_date, updated_at: u.updated_at });
    }, 'Saved.');

  const remove = () => {
    if (!window.confirm(`Remove "${app.title}" from your tracker? Your notes for it will be deleted.`)) return;
    run(async () => {
      await api.removeApplication(app.id);
      onRemove(app.id);
    }, 'Removed.');
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="application" data-status={app.status} data-job-id={app.job_id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900"><Link to={`/jobs/${app.job_id}`} className="hover:text-indigo-700 hover:underline">{app.title}</Link></h2>
          <p className="text-sm text-slate-700">{app.employer ?? 'Employer not listed'}</p>
        </div>
        <TypeBadge type={app.job_type} />
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Location</dt><dd className="text-sm">{app.location_raw ?? <span className="text-slate-400">Not listed</span>}</dd></div>
        <div><dt className="text-xs uppercase tracking-wide text-slate-500">Pay</dt><dd className="text-sm">{pay ?? <span className="text-slate-400">Not listed</span>}</dd></div>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Status</span>
          <select value={app.status} disabled={busy} onChange={(e) => changeStatus(e.target.value)} className={`mt-0.5 block w-full rounded-md border-0 px-2 py-1.5 text-sm font-medium ring-1 ring-inset ${STATUS_STYLE[app.status]}`} data-testid="status-select" aria-label={`Status for ${app.title}`}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-500">Application date</span>
          <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" data-testid="applied-date" aria-label={`Application date for ${app.title}`} />
        </label>
      </dl>

      <label className="mt-3 block">
        <span className="text-xs uppercase tracking-wide text-slate-500">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} placeholder="Contact person, interview date, follow-ups..." className="mt-0.5 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-testid="notes" aria-label={`Notes for ${app.title}`} />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={saveDetails} disabled={!dirty || busy} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" data-testid="save-details">Save notes &amp; date</button>
        <Link to={`/jobs/${app.job_id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">View job</Link>
        <a href={app.url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">Open on {sourceLabel(app.source)} ↗</a>
        <button type="button" onClick={remove} disabled={busy} className="ml-auto rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50" data-testid="remove">Remove</button>
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </article>
  );
}
