PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  base_url        TEXT NOT NULL,
  last_scraped_at TEXT,
  last_status     TEXT,
  jobs_found      INTEGER DEFAULT 0,
  jobs_new        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id          INTEGER NOT NULL REFERENCES sources(id),
  source_job_id      TEXT,
  url                TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  employer           TEXT,
  location_raw       TEXT,
  city               TEXT,
  is_remote          INTEGER NOT NULL DEFAULT 0,
  lat                REAL,
  lng                REAL,
  pay_raw            TEXT,
  pay_min            REAL,
  pay_max            REAL,
  pay_currency       TEXT,
  pay_unit           TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (pay_unit IN ('hour','day','week','month','year','total','unknown')),
  job_type           TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (job_type IN ('part_time','casual','full_time','internship','unknown')),
  category           TEXT,
  hours_per_week_min REAL,
  hours_per_week_max REAL,
  hours_raw          TEXT,
  description        TEXT,
  posted_at          TEXT,
  posted_raw         TEXT,
  geo_precision      TEXT CHECK (geo_precision IN ('locality','city')),
  detail_checked_at  TEXT,
  scraped_at         TEXT NOT NULL DEFAULT (datetime('now')),
  dedupe_key         TEXT NOT NULL UNIQUE,
  is_active          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_jobs_type    ON jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_jobs_posted  ON jobs(posted_at);
CREATE INDEX IF NOT EXISTS idx_jobs_city    ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_source  ON jobs(source_id);

CREATE TABLE IF NOT EXISTS applications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'saved'
               CHECK (status IN ('saved','applied','interview','offer','rejected')),
  applied_date TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single local user: exactly one row, id = 1.
CREATE TABLE IF NOT EXISTS preferences (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  campus_id               TEXT,
  campus_name             TEXT,
  campus_lat              REAL,
  campus_lng              REAL,
  max_commute_km          REAL,
  weekly_hours_limit      REAL,
  hours_already_committed REAL NOT NULL DEFAULT 0,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO preferences (id) VALUES (1);

-- Results of place-name lookups (OpenStreetMap Nominatim), so each place is only ever asked about once.
CREATE TABLE IF NOT EXISTS geocache (
  query        TEXT PRIMARY KEY,
  lat          REAL,
  lng          REAL,
  display_name TEXT,
  found        INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER REFERENCES sources(id),
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  pages_fetched INTEGER DEFAULT 0,
  items_parsed  INTEGER DEFAULT 0,
  items_saved   INTEGER DEFAULT 0,
  errors        TEXT
);

INSERT OR IGNORE INTO sources (name, base_url) VALUES
  ('internshala',  'https://internshala.com'),
  ('freshersworld','https://www.freshersworld.com'),
  ('workindia',    'https://www.workindia.in');
