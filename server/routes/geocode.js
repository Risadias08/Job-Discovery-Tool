import { Router } from 'express';
import { HttpError, parse, z } from '../lib/validate.js';
import { lookup } from '../lib/geocode.js';

const router = Router();
const query = z.object({ q: z.string().trim().min(3, 'type at least 3 characters').max(100) });

// Find a place by name (used for "my campus is not in the list"). Cached; OpenStreetMap is asked at most once per place.
router.get('/', async (req, res) => {
  const { q } = parse(query, req.query);
  let hit;
  try {
    hit = await lookup(q.toLowerCase().includes('india') ? q : `${q}, India`);
  } catch {
    throw new HttpError(502, 'geocoder_unavailable', 'The place search is unavailable right now. Pick a campus from the list or try again later.');
  }
  if (!hit) throw new HttpError(404, 'not_found', `Couldn't find "${q}" in India. Try a more specific name, e.g. the university and city.`);
  res.json({ name: hit.name, lat: hit.lat, lng: hit.lng });
});

export default router;
