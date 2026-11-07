-- BRACU Thesis Portal incremental read cache (v11).
-- Run once on a NEW/EMPTY D1 database. Existing v10 databases must be migrated;
-- CREATE TABLE IF NOT EXISTS cannot add missing columns to old tables.
-- Only trusted Pages Functions can query these records; never bind D1 in React.
CREATE TABLE IF NOT EXISTS portal_cache (
  generation TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  thesis_id TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (generation,kind,item_key)
);
CREATE INDEX IF NOT EXISTS idx_portal_cache_email ON portal_cache(generation,kind,email);
CREATE INDEX IF NOT EXISTS idx_portal_cache_thesis ON portal_cache(generation,kind,thesis_id);
CREATE INDEX IF NOT EXISTS idx_portal_cache_stage ON portal_cache(generation,kind,stage);
CREATE INDEX IF NOT EXISTS idx_portal_cache_name ON portal_cache(generation,kind,name);

CREATE TABLE IF NOT EXISTS portal_sync_runs (
  generation TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  expected_count INTEGER NOT NULL,
  base_generation TEXT NOT NULL DEFAULT '',
  base_checksum TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'loading'
);
-- Only removals are staged here. New/changed items are staged in portal_cache
-- under the job generation, then applied to the long-lived active generation
-- in a single transaction at commit time.
CREATE TABLE IF NOT EXISTS portal_sync_deletes (
  generation TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  PRIMARY KEY (generation,kind,item_key)
);
CREATE TABLE IF NOT EXISTS portal_active (
  id INTEGER PRIMARY KEY CHECK(id=1),
  generation TEXT NOT NULL,
  checksum TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
