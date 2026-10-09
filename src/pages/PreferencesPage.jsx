import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import FeatureNote from '../components/FeatureNote.jsx';
import { FEATURES } from '../lib/features.js';

const inputCls = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';
const toNum = (s) => (s === '' || s == null ? null : Number(s));
const CUSTOM = 'custom';

export default function PreferencesPage() {
  const [load, setLoad] = useState({ status: 'loading', error: null });
  const [campuses, setCampuses] = useState([]);
  const [limit, setLimit] = useState('');
  const [committed, setCommitted] = useState('0');
  const [maxKm, setMaxKm] = useState('');
  const [campus, setCampus] = useState({ id: '', name: null, lat: null, lng: null }); // the chosen campus / place
  const [placeQuery, setPlaceQuery] = useState('');
  const [place, setPlace] = useState({ busy: false, error: null });
  const [save, setSave] = useState({ busy: false, msg: null, error: null });

  useEffect(() => {
    Promise.all([api.preferences(), api.campuses()])
      .then(([p, c]) => {
        setCampuses(c);
        setLimit(p.weekly_hours_limit ?? '');
        setCommitted(String(p.hours_already_committed ?? 0));
        setMaxKm(p.max_commute_km ?? '');
        setCampus({ id: p.campus_id ?? '', name: p.campus_name, lat: p.campus_lat, lng: p.campus_lng });
        setLoad({ status: 'ok', error: null });
      })
      .catch((e) => setLoad({ status: 'error', error: e.message }));
  }, []);

  const free = limit === '' ? null : Math.max(0, Number(limit) - (Number(committed) || 0));
  const limitInvalid = limit !== '' && (Number.isNaN(Number(limit)) || Number(limit) < 0 || Number(limit) > 168);
  const committedInvalid = committed !== '' && (Number.isNaN(Number(committed)) || Number(committed) < 0 || Number(committed) > 168);
  const kmInvalid = maxKm !== '' && (Number.isNaN(Number(maxKm)) || Number(maxKm) <= 0 || Number(maxKm) > 500);
  const invalid = limitInvalid || committedInvalid || kmInvalid;

  function chooseCampus(id) {
    if (id === '') return setCampus({ id: '', name: null, lat: null, lng: null });
    if (id === CUSTOM) return setCampus({ id: CUSTOM, name: null, lat: null, lng: null }); // don't keep the previous campus until a search succeeds
    const c = campuses.find((x) => x.id === id);
    setCampus({ id, name: c.name, lat: c.lat, lng: c.lng });
  }

  async function findPlace() {
    setPlace({ busy: true, error: null });
    try {
      const hit = await api.geocode(placeQuery);
      setCampus({ id: CUSTOM, name: placeQuery.trim(), lat: hit.lat, lng: hit.lng });
    } catch (e) {
      setPlace({ busy: false, error: e.message });
      return;
    }
    setPlace({ busy: false, error: null });
  }

  async function submit(e) {
    e.preventDefault();
    setSave({ busy: true, msg: null, error: null });
    try {
      await api.savePreferences({
        weeklyHoursLimit: toNum(limit),
        hoursAlreadyCommitted: toNum(committed) ?? 0,
        campusId: campus.id || null,
        campusName: campus.name,
        campusLat: campus.lat,
        campusLng: campus.lng,
        maxCommuteKm: toNum(maxKm),
      });
      setSave({ busy: false, msg: 'Preferences saved.', error: null });
    } catch (err) {
      setSave({ busy: false, msg: null, error: err.message });
    }
  }

  if (load.status === 'loading') return <p className="text-slate-600" data-testid="loading-state">Loading preferences...</p>;
  if (load.status === 'error') {
    return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800" data-testid="error-state">Could not load preferences: {load.error}</div>;
  }

  const campusReady = campus.lat != null && campus.lng != null;

  return (
    <form onSubmit={submit} className="space-y-6" data-testid="preferences-form">
      <div>
        <h1 className="text-2xl font-semibold">Student preferences</h1>
        <p className="mt-1 text-sm text-slate-600">These settings personalise every job in the list: how well its hours fit your week, and how far it is from your campus. Saved in the database; nothing is sent anywhere else.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="hours-h">
        <h2 id="hours-h" className="text-lg font-semibold">Work-hours compatibility</h2>
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          <strong>Informational only, not legal or immigration advice.</strong> This compares the numbers you enter below with the hours a job lists.
          It does not tell you what you are allowed to work. Check your own limit with your university's international student office or the official government source.
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Most hours per week I want to work</span>
            <input type="number" min="0" max="168" step="0.5" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="e.g. 20" className={inputCls} data-testid="limit-input" aria-invalid={limitInvalid} />
            <span className="mt-1 block text-xs text-slate-500">Use the limit that applies to you. Leave blank to turn this off.</span>
            {limitInvalid && <span className="text-xs text-red-600">Enter a number from 0 to 168.</span>}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Hours per week I already use for other work</span>
            <input type="number" min="0" max="168" step="0.5" value={committed} onChange={(e) => setCommitted(e.target.value)} className={inputCls} data-testid="committed-input" aria-invalid={committedInvalid} />
            <span className="mt-1 block text-xs text-slate-500">For example another job you already have.</span>
            {committedInvalid && <span className="text-xs text-red-600">Enter a number from 0 to 168.</span>}
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-700" data-testid="free-hours">
          {free === null || limitInvalid || committedInvalid ? 'Enter your weekly hours to see what is free.' : <>Free for a new job: <strong>{free % 1 === 0 ? free : free.toFixed(1)} hours per week</strong></>}
        </p>
        <FeatureNote feature={FEATURES.hours} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="campus-h">
        <h2 id="campus-h" className="text-lg font-semibold">Campus and commute</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">My campus or preferred location</span>
            <select value={campus.id} onChange={(e) => chooseCampus(e.target.value)} className={inputCls} data-testid="campus-select">
              <option value="">Not set</option>
              {campuses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.city})</option>)}
              <option value={CUSTOM}>{campus.id === CUSTOM && campus.name ? `Other: ${campus.name}` : 'Other place (search)...'}</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Farthest I would commute (km)</span>
            <input type="number" min="1" max="500" step="1" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} placeholder="e.g. 10" className={inputCls} data-testid="maxkm-input" aria-invalid={kmInvalid} />
            <span className="mt-1 block text-xs text-slate-500">Used to label jobs Close / Moderate / Far. Optional (without it: 5 km and 15 km).</span>
            {kmInvalid && <span className="text-xs text-red-600">Enter a number from 1 to 500.</span>}
          </label>
        </div>

        {campus.id === CUSTOM && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Search for a place</span>
              <div className="mt-1 flex gap-2">
                <input type="text" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (placeQuery.trim().length >= 3) findPlace(); } }} placeholder="e.g. Symbiosis International University, Pune" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-testid="place-input" />
                <button type="button" onClick={findPlace} disabled={place.busy || placeQuery.trim().length < 3} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60" data-testid="place-find">
                  {place.busy ? 'Searching...' : 'Find'}
                </button>
              </div>
            </label>
            {place.error && <p role="alert" className="mt-2 text-sm text-red-700">{place.error}</p>}
          </div>
        )}

        <p className="mt-3 text-sm text-slate-700" data-testid="campus-status">
          {campusReady ? <>Distances are measured from <strong>{campus.name}</strong> ({campus.lat.toFixed(3)}, {campus.lng.toFixed(3)}).</> : campus.id === CUSTOM ? 'Search for a place above, then press Find.' : 'No campus selected: distances are turned off.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">Distances are approximate straight-line distances, not routes or travel times.</p>
        <FeatureNote feature={FEATURES.commute} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={save.busy || invalid || (campus.id === CUSTOM && !campusReady)} className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60" data-testid="save-prefs">
          {save.busy ? 'Saving...' : 'Save preferences'}
        </button>
        {save.msg && <span role="status" className="text-sm text-emerald-700" data-testid="save-msg">{save.msg} <Link to="/" className="underline">See jobs</Link></span>}
        {save.error && <span role="alert" className="text-sm text-red-700">{save.error}</span>}
      </div>
    </form>
  );
}
