const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle ("as the crow flies") distance in km between two lat/lng points. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(a));
}

/**
 * Centre-point coordinates for the big cities that show up most in listings. Used so distances work without
 * any network call; other places are looked up once via OpenStreetMap and cached (see geocode.js).
 */
export const CITY_COORDS = {
  delhi: [28.6139, 77.209],
  mumbai: [19.076, 72.8777],
  bengaluru: [12.9716, 77.5946],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  hyderabad: [17.385, 78.4867],
  pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714],
  jaipur: [26.9124, 75.7873],
  lucknow: [26.8467, 80.9462],
  gurugram: [28.4595, 77.0266],
  noida: [28.5355, 77.391],
  thane: [19.2183, 72.9781],
  'navi mumbai': [19.033, 73.0297],
  kochi: [9.9312, 76.2673],
  indore: [22.7196, 75.8577],
  chandigarh: [30.7333, 76.7794],
  nagpur: [21.1458, 79.0882],
  surat: [21.1702, 72.8311],
  bhopal: [23.2599, 77.4126],
};

/**
 * Describe how far a job is from the student's campus.
 * Only straight-line distance is available, so the result is deliberately labelled approximate and gives no travel time.
 * `precision` says how good the job's coordinates are: 'locality' (a neighbourhood) or 'city' (the city centre).
 *
 * Returns null when it can't be computed (no campus chosen, or the job has no coordinates),
 * or { remote: true } for work-from-home jobs.
 */
export function distanceInfo(job, prefs) {
  if (!prefs || prefs.campus_lat == null || prefs.campus_lng == null) return null;
  if (job.is_remote) return { remote: true, label: 'Work from home - no commute' };
  if (job.lat == null || job.lng == null) return null;

  const km = haversineKm(prefs.campus_lat, prefs.campus_lng, job.lat, job.lng);
  const max = prefs.max_commute_km;
  const [closeLimit, midLimit] = max ? [max / 2, max] : [5, 15];
  const band = km <= closeLimit ? 'near' : km <= midLimit ? 'mid' : 'far';
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  const precision = job.geo_precision ?? 'city';
  return {
    km: rounded,
    exactKm: km,
    band,
    bandLabel: { near: 'Close', mid: 'Moderate', far: 'Far' }[band],
    withinMax: max ? km <= max : null,
    precision,
    label: `~${rounded} km${precision === 'city' ? ' (city-level)' : ''}`,
  };
}
