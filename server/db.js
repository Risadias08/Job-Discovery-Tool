import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT } from './config.js';

const SCHEMA_PATH = path.join(ROOT, 'server', 'schema.sql');

let db;

/** Add columns introduced after a database file was first created (CREATE TABLE IF NOT EXISTS won't). */
function migrate(conn) {
  const have = conn.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  const added = { geo_precision: 'TEXT', detail_checked_at: 'TEXT' };
  for (const [name, type] of Object.entries(added)) if (!have.includes(name)) conn.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
}

/** Open (and create if needed) the SQLite database, applying the schema. Idempotent. */
export function getDb(dbPath = config.dbPath) {
  if (db && dbPath === config.dbPath) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const conn = new DatabaseSync(dbPath);
  conn.exec('PRAGMA journal_mode = WAL;');
  conn.exec('PRAGMA busy_timeout = 5000;'); // wait instead of failing when the scraper and the API write at once
  conn.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  migrate(conn);
  if (dbPath === config.dbPath) db = conn;
  return conn;
}

/** Drop the database file and recreate it. */
export function resetDb() {
  if (db) { db.close(); db = undefined; }
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
  return getDb();
}
