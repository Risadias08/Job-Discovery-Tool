// Thin fetch wrapper. All endpoints live under /api (proxied to Express in dev).
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || `Request failed (${res.status})`), { code: data?.error?.code });
  return data;
}

export const api = {
  health: () => request('/health'),
  meta: () => request('/meta'),
  campuses: () => request('/campuses'),
  jobs: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return request(`/jobs${qs ? `?${qs}` : ''}`);
  },
  job: (id) => request(`/jobs/${id}`),
  geocode: (q) => request(`/geocode?q=${encodeURIComponent(q)}`),
  preferences: () => request('/preferences'),
  savePreferences: (body) => request('/preferences', { method: 'PUT', body }),
  applications: () => request('/applications'),
  saveJob: (jobId) => request('/applications', { method: 'POST', body: { jobId } }),
  updateApplication: (id, body) => request(`/applications/${id}`, { method: 'PATCH', body }),
  removeApplication: (id) => request(`/applications/${id}`, { method: 'DELETE' }),
};
