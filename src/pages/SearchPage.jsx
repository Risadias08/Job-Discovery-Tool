import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import JobCard from '../components/JobCard.jsx';
import { SOURCE_LABELS, TYPES, TYPE_STYLE } from '../lib/format.js';

const PAY_OPTIONS = [
  { value: '', label: 'Any pay' },
  { value: '10000', label: '₹10,000+ / month' },
  { value: '20000', label: '₹20,000+ / month' },
  { value: '30000', label: '₹30,000+ / month' },
  { value: '50000', label: '₹50,000+ / month' },
];
const POSTED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];
const DISTANCE_OPTIONS = [
  { value: '', label: 'Any distance' },
  { value: '2', label: 'Within 2 km' },
  { value: '5', label: 'Within 5 km' },
  { value: '10', label: 'Within 10 km' },
  { value: '20', label: 'Within 20 km' },
  { value: '50', label: 'Within 50 km' },
];
const HOURS_OPTIONS = [
  { value: '', label: 'Any hours' },
  { value: 'fits', label: 'Fits my hours' },
  { value: 'fits_or_unknown', label: 'Fits, or hours not listed' },
];
const FILTER_KEYS = ['q', 'location', 'type', 'minPay', 'postedWithin', 'remote', 'source', 'maxKm', 'hours'];

const selectCls = 'rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';
const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const KEYS = [...FILTER_KEYS, 'sort', 'page'];
const fromParams = (p) => Object.fromEntries(KEYS.map((k) => [k, p.get(k) ?? '']));
const toSearch = (f) => {
  const s = new URLSearchParams();
  for (const k of KEYS) if (f[k] !== '' && f[k] != null) s.set(k, String(f[k]));
  return s;
};

export default function SearchPage() {
  const [params, setParams] = useSearchParams();

  // The filters are plain React state (updates queue safely even if several change at once)
  // and are mirrored into the URL so a search can be shared, reloaded or reached with the back button.
  const [filters, setFilters] = useState(() => fromParams(params));
  const get = (k) => filters[k] ?? '';
  const types = useMemo(() => filters.type.split(',').filter(Boolean), [filters.type]);
  const queryString = toSearch(filters).toString();

  /** update(obj) or update(prevFilters => obj). Any change except paging returns to page 1. */
  const setParam = useCallback(
    (updates) =>
      setFilters((f) => {
        const u = typeof updates === 'function' ? updates(f) : updates;
        return { ...f, ...u, page: 'page' in u && u.page !== 1 ? u.page : '' }; // page 1 is the default, keep it out of the URL
      }),
    []
  );

  const pendingUrls = useRef(new Set()); // URLs we wrote ourselves, so they aren't mistaken for outside navigation
  const latestQuery = useRef(queryString);
  latestQuery.current = queryString;
  useEffect(() => {
    if (queryString !== params.toString()) {
      pendingUrls.current.add(queryString);
      setParams(new URLSearchParams(queryString), { replace: true });
    }
  }, [queryString]); // eslint-disable-line react-hooks/exhaustive-deps

  // text inputs: local state for typing, debounced into the filters
  const [q, setQ] = useState(filters.q);
  const [location, setLocation] = useState(filters.location);
  const dq = useDebounced(q);
  const dloc = useDebounced(location);
  useEffect(() => { setParam((f) => (dq.trim() !== f.q ? { q: dq.trim() } : {})); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setParam((f) => (dloc.trim() !== f.location ? { location: dloc.trim() } : {})); }, [dloc]); // eslint-disable-line react-hooks/exhaustive-deps

  // the URL changed from outside (nav link to "Jobs", browser back/forward): adopt it
  useEffect(() => {
    const url = params.toString();
    if (pendingUrls.current.has(url)) {
      if (url === latestQuery.current) pendingUrls.current.clear();
      return;
    }
    if (url !== latestQuery.current) {
      const f = fromParams(params);
      setFilters(f);
      setQ(f.q);
      setLocation(f.location);
    }
  }, [params]);

  const [meta, setMeta] = useState(null);
  useEffect(() => { api.meta().then(setMeta).catch(() => setMeta(null)); }, []);
  const [prefs, setPrefs] = useState(null);
  useEffect(() => { api.preferences().then(setPrefs).catch(() => setPrefs(null)); }, []);
  const campusSet = prefs?.campus_lat != null;
  const hoursSet = prefs?.weekly_hours_limit != null;

  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api
      .jobs(Object.fromEntries(new URLSearchParams(queryString)))
      .then((data) => id === requestId.current && setState({ status: 'ok', data, error: null }))
      .catch((e) => id === requestId.current && setState({ status: 'error', data: null, error: e.message, code: e.code }));
  }, [queryString]);
  useEffect(load, [load]);

  const patchJob = (jobId, fields) =>
    setState((s) => ({ ...s, data: { ...s.data, items: s.data.items.map((j) => (j.id === jobId ? { ...j, ...fields } : j)) } }));

  const toggleType = (t) =>
    setParam((f) => {
      const cur = f.type.split(',').filter(Boolean);
      return { type: (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]).join(',') };
    });
  const isPartTimeAndCasual = types.length === 2 && types.includes('part_time') && types.includes('casual');
  const activeFilters = FILTER_KEYS.filter((k) => get(k) !== '');
  const clearAll = () => {
    setQ('');
    setLocation('');
    setFilters(fromParams(new URLSearchParams()));
  };

  const count = (t) => meta?.types.find((x) => x.value === t)?.count;
  const data = state.data;
  const page = Number(get('page')) || 1;

  const chip = (active) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium ${active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`;

  return (
    <div>
      <section className="mb-5">
        <h1 className="text-2xl font-semibold">Find work that fits student life</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everyday jobs, part-time and casual work, full-time roles and internships, collected from {Object.values(SOURCE_LABELS).join(', ')}.
          {meta ? ` ${meta.total} listings.` : ''}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="type-overview">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setParam({ type: t.value })}
              className={`rounded-lg px-3 py-2 text-left ring-1 ring-inset ${TYPE_STYLE[t.value]}`}
              title={t.hint}
            >
              <span className="block text-lg font-semibold">{count(t.value) ?? '-'}</span>
              <span className="block text-sm">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {prefs && (!campusSet || !hoursSet) && (
        <div className="mb-4 rounded-md border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900" data-testid="prefs-prompt">
          {!campusSet && !hoursSet
            ? 'Set your campus and weekly hours to see how far each job is and whether its hours fit.'
            : !campusSet
              ? 'Set your campus to see how far each job is and sort by nearest.'
              : 'Set your weekly hours to see whether each job\'s hours fit.'}{' '}
          <Link to="/preferences" className="font-medium underline">Open preferences</Link>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-label="Search and filters">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <input
            type="search"
            aria-label="Search jobs"
            placeholder="Search by job title, employer or keyword (e.g. barista, delivery, data entry)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={inputCls}
          />
          <>
            <input
              type="text"
              aria-label="Location"
              list="city-list"
              placeholder="Location (city or area)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputCls}
            />
            <datalist id="city-list">{meta?.cities.map((c) => <option key={c.value} value={c.value} />)}</datalist>
          </>
          <select aria-label="Sort by" value={get('sort') || 'newest'} onChange={(e) => setParam({ sort: e.target.value === 'newest' ? '' : e.target.value })} className={selectCls}>
            <option value="newest">Newest first</option>
            <option value="pay">Highest pay</option>
            <option value="nearest" disabled={!campusSet}>{campusSet ? 'Nearest to my campus' : 'Nearest (set campus first)'}</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Job type">
          <button type="button" className={chip(types.length === 0)} onClick={() => setParam({ type: '' })}>All jobs</button>
          <button type="button" className={chip(isPartTimeAndCasual)} onClick={() => setParam({ type: 'part_time,casual' })}>Part-time &amp; casual</button>
          <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden="true" />
          {TYPES.map((t) => (
            <button key={t.value} type="button" aria-pressed={types.includes(t.value)} className={chip(types.includes(t.value) && !isPartTimeAndCasual)} onClick={() => toggleType(t.value)} title={t.hint}>
              {t.label}{count(t.value) != null ? ` (${count(t.value)})` : ''}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-sm text-slate-600">
            Pay
            <select value={get('minPay')} onChange={(e) => setParam({ minPay: e.target.value })} className={selectCls} title="Monthly equivalent in INR. Jobs with no comparable pay are hidden when this is set.">
              {PAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            Posted
            <select value={get('postedWithin')} onChange={(e) => setParam({ postedWithin: e.target.value })} className={selectCls}>
              {POSTED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            Source
            <select value={get('source')} onChange={(e) => setParam({ source: e.target.value })} className={selectCls}>
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600" title={campusSet ? 'Straight-line distance from your campus. Work-from-home jobs are always included.' : 'Choose your campus in Preferences first'}>
            Distance
            <select value={get('maxKm')} disabled={!campusSet} onChange={(e) => setParam({ maxKm: e.target.value })} className={selectCls} data-testid="distance-filter">
              {DISTANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600" title={hoursSet ? 'Compares listed hours with your free hours. Informational only.' : 'Enter your weekly hours in Preferences first'}>
            Hours
            <select value={get('hours')} disabled={!hoursSet} onChange={(e) => setParam({ hours: e.target.value })} className={selectCls} data-testid="hours-filter">
              {HOURS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="checkbox" checked={get('remote') === '1'} onChange={(e) => setParam({ remote: e.target.checked ? '1' : '' })} />
            Work from home only
          </label>
          {activeFilters.length > 0 && (
            <button type="button" onClick={clearAll} className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
              Clear filters ({activeFilters.length})
            </button>
          )}
        </div>
        {get('minPay') && <p className="mt-2 text-xs text-slate-500">Pay is compared as a monthly equivalent in INR. Listings without a comparable pay figure are hidden while this filter is on.</p>}
      </section>

      <section className="mt-5" aria-live="polite">
        {state.status === 'loading' && !data && <LoadingList />}

        {state.status === 'error' && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-center" data-testid="error-state">
            <p className="font-medium text-red-800">Could not load jobs</p>
            <p className="mt-1 text-sm text-red-700">{state.error}</p>
            {state.code === 'campus_required' || state.code === 'hours_required' ? (
              <div className="mt-3 flex justify-center gap-2">
                <Link to="/preferences" className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Open preferences</Link>
                <button type="button" onClick={clearAll} className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-800 hover:bg-red-100">Clear filters</button>
              </div>
            ) : (
              <button type="button" onClick={load} className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Try again</button>
            )}
          </div>
        )}

        {data && state.status !== 'error' && (
          <>
            <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
              <span data-testid="result-count">
                <strong className="text-slate-900">{data.total}</strong> {data.total === 1 ? 'job' : 'jobs'} found
                {state.status === 'loading' ? ' - updating...' : ''}
              </span>
              {data.total > 0 && <span>Page {data.page} of {data.pages}</span>}
            </div>

            {data.items.length === 0 && meta?.total === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-10 text-center" data-testid="no-data-state">
                <p className="text-lg font-medium text-amber-900">There are no jobs in the database yet</p>
                <p className="mt-1 text-sm text-amber-800">Run the scraper to collect listings, then reload this page:</p>
                <code className="mt-2 inline-block rounded bg-white px-3 py-1 text-sm text-slate-800">npm run refresh</code>
                <p className="mt-2 text-xs text-amber-800">For a quick offline demo use <code>npm run scrape -- --fixtures</code>.</p>
              </div>
            ) : data.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center" data-testid="empty-state">
                <p className="text-lg font-medium text-slate-800">No jobs match these filters</p>
                <p className="mt-1 text-sm text-slate-600">Try a shorter keyword, a different city, or remove some filters.</p>
                <button type="button" onClick={clearAll} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Clear all filters</button>
              </div>
            ) : (
              <div className="space-y-3">
                {data.items.map((job) => <JobCard key={job.id} job={job} onChange={patchJob} campusSet={campusSet} />)}
              </div>
            )}

            {data.pages > 1 && (
              <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Pagination">
                <button type="button" disabled={page <= 1} onClick={() => { setParam({ page: page - 1 }); window.scrollTo(0, 0); }} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Previous</button>
                <span className="text-sm text-slate-600">Page {page} of {data.pages}</span>
                <button type="button" disabled={page >= data.pages} onClick={() => { setParam({ page: page + 1 }); window.scrollTo(0, 0); }} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Next</button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function LoadingList() {
  return (
    <div data-testid="loading-state" aria-busy="true">
      <p className="mb-3 text-sm text-slate-600">Loading jobs...</p>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-5 w-1/3 rounded bg-slate-200" />
            <div className="mt-4 h-4 w-2/3 rounded bg-slate-100" />
            <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
