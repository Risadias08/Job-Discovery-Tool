import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Shows whether the frontend can reach the backend and database.
export default function StatusBadge() {
  const [state, setState] = useState({ ok: null, text: 'Checking API...' });

  useEffect(() => {
    api
      .health()
      .then((h) => setState({ ok: true, text: `API ok - ${h.jobs} jobs` }))
      .catch((e) => setState({ ok: false, text: `API unreachable: ${e.message}` }));
  }, []);

  const color = state.ok === null ? 'bg-slate-300' : state.ok ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <span className="flex items-center gap-2 text-xs text-slate-600" data-testid="api-status">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="hidden sm:inline">{state.text}</span>
    </span>
  );
}
