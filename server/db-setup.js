import { getDb, resetDb } from './db.js';
import { config } from './config.js';

const reset = process.argv.includes('--reset');
const db = reset ? resetDb() : getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((t) => t.name);
console.log(`${reset ? 'Reset and initialised' : 'Initialised'} database at ${config.dbPath}`);
console.log('Tables:', tables.join(', '));
