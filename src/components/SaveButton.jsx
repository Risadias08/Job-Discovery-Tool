import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { statusLabel } from '../lib/format.js';

/**
 * Save-to-tracker button for a job card. Once saved it becomes a link to the job page,
 * where status, date and notes are managed. `onChange(jobId, fields)` lets the parent update its list.
 */
export default function SaveButton({ job, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (job.application_id != null) {
    return (
      <Link
        to={`/jobs/${job.id}`}
        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
        title="Open to update status and notes"
      >
        ✓ {statusLabel(job.application_status)}
      </Link>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const app = await api.saveJob(job.id);
      onChange(job.id, { application_id: app.id, application_status: app.status });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      >
        {busy ? 'Saving...' : 'Save job'}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}
