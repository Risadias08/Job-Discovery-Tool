// Give every scraped job approximate coordinates, so distance to a campus can be calculated.
//   npm run geocode
//
// Precision, best available first:
//   locality - WorkIndia prints "Area, City" (e.g. "Bellandur, Bengaluru"); the area is looked up on OpenStreetMap
//   city     - everything else (Internshala / Freshersworld only give cities): the city centre
// A locality result is only trusted if it lies within MAX_LOCALITY_KM of its city centre; otherwise we fall back
// to the city centre. Remote jobs get no coordinates. Lookups are cached in the geocache table, 1 request/second.
import { getDb } from '../server/db.js';
import { cityPoint, lookup } from '../server/lib/geocode.js';
import { haversineKm } from '../server/lib/geo.js';

const MAX_LOCALITY_KM = 60;
// Some listings put a state where the city should be; a state isn't a place we can measure a commute to.
const STATES = new Set(['maharashtra', 'haryana', 'karnataka', 'tamil nadu', 'gujarat', 'rajasthan', 'uttar pradesh', 'kerala', 'punjab', 'bihar', 'odisha', 'telangana', 'west bengal', 'madhya pradesh', 'jammu and kashmir', 'andhra pradesh', 'goa', 'assam', 'jharkhand', 'uttarakhand', 'himachal pradesh', 'chhattisgarh']);

const log = (m) => console.log(m);
const db = getDb();

const jobs = db
  .prepare(
    `SELECT j.id, j.city, j.location_raw, s.name AS source FROM jobs j JOIN sources s ON s.id = j.source_id
     WHERE j.lat IS NULL AND j.is_remote = 0 AND j.is_active = 1 AND j.city IS NOT NULL`
  )
  .all();

// group jobs that share the same place, so each place is resolved once
const groups = new Map();
for (const j of jobs) {
  if (STATES.has(j.city.toLowerCase())) continue;
  const locality = j.source === 'workindia' ? j.location_raw.split(',').slice(0, -1).join(',').trim() : '';
  const key = `${locality}|${j.city}`;
  if (!groups.has(key)) groups.set(key, { locality, city: j.city, ids: [] });
  groups.get(key).ids.push(j.id);
}
log(`${jobs.length} jobs without coordinates -> ${groups.size} distinct places`);

const update = db.prepare('UPDATE jobs SET lat = ?, lng = ?, geo_precision = ? WHERE id = ?');
const stats = { locality: 0, city: 0, failed: 0, errors: 0 };
let n = 0;

for (const g of groups.values()) {
  n++;
  try {
    const centre = await cityPoint(g.city, db);
    if (!centre) {
      stats.failed += g.ids.length;
      continue;
    }
    let point = centre;
    let precision = 'city';
    if (g.locality) {
      const hit = await lookup(`${g.locality}, ${g.city}, India`, db);
      if (hit && haversineKm(centre.lat, centre.lng, hit.lat, hit.lng) <= MAX_LOCALITY_KM) {
        point = hit;
        precision = 'locality';
      }
    }
    db.exec('BEGIN');
    for (const id of g.ids) update.run(point.lat, point.lng, precision, id);
    db.exec('COMMIT');
    stats[precision] += g.ids.length;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* no open transaction */ }
    stats.errors++;
    log(`  ! ${g.locality ? g.locality + ', ' : ''}${g.city}: ${e.message} (will retry on the next run)`);
  }
  if (n % 25 === 0) log(`  ... ${n}/${groups.size} places`);
}

const total = db.prepare('SELECT COUNT(*) n FROM jobs WHERE is_active = 1').get().n;
const withCoords = db.prepare('SELECT COUNT(*) n FROM jobs WHERE is_active = 1 AND lat IS NOT NULL').get().n;
const remote = db.prepare('SELECT COUNT(*) n FROM jobs WHERE is_active = 1 AND is_remote = 1').get().n;
log(`\nDone. locality-level: ${stats.locality}, city-level: ${stats.city}, unresolved: ${stats.failed}, lookup errors: ${stats.errors}`);
log(`${withCoords} of ${total} jobs now have coordinates (${remote} are remote and need none).`);
