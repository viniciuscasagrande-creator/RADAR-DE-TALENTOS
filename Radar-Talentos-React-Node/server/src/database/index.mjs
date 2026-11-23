import {ensurePersistentPath} from '../persistence.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const migrationsDirectory = new URL('../../../database/migrations/', import.meta.url);

export function databasePath() {
  const configured = process.env.RADAR_DATABASE_PATH || 'data/radar.sqlite';
  return configured === ':memory:' ? configured : resolve(projectRoot, configured);
}

export function openDatabase(filename = databasePath()) {
  ensurePersistentPath(filename,'RADAR_DATABASE_PATH');
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ) STRICT;`);
    for (const name of readdirSync(migrationsDirectory).filter(name => /^\d+_.*\.sql$/.test(name)).sort()) {
      const sql = readFileSync(new URL(name, migrationsDirectory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const applied = db.prepare('SELECT checksum FROM schema_migrations WHERE name = ?').get(name);
        if (applied && applied.checksum !== checksum) throw new Error('Migração já aplicada foi alterada: ' + name);
        if (!applied) {
          db.exec(sql);
          db.prepare('INSERT INTO schema_migrations(name, checksum) VALUES (?, ?)').run(name, checksum);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    db.exec(`CREATE TABLE IF NOT EXISTS metric_current (
      account_id TEXT NOT NULL,
      talent_id TEXT NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
      network TEXT NOT NULL CHECK(network IN ('Instagram','YouTube','Spotify','TikTok')),
      metric TEXT NOT NULL,
      value INTEGER CHECK(value IS NULL OR value >= 0),
      observed_on TEXT,
      collected_at TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','pending_source','pending_auth','error')),
      status_detail TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(account_id, metric)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS talent_metadata (
      talent_id TEXT PRIMARY KEY REFERENCES talents(id) ON DELETE CASCADE,
      wikidata_id TEXT,
      musicbrainz_id TEXT,
      official_website TEXT,
      agenda_url TEXT,
      genres TEXT NOT NULL DEFAULT '[]',
      country TEXT DEFAULT 'BR',
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS municipality_demographics (
      municipality_code TEXT PRIMARY KEY REFERENCES municipalities(code) ON DELETE CASCADE,
      population INTEGER CHECK(population IS NULL OR population >= 0),
      gdp_per_capita REAL CHECK(gdp_per_capita IS NULL OR gdp_per_capita >= 0),
      avg_income REAL CHECK(avg_income IS NULL OR avg_income >= 0),
      urban_rate REAL CHECK(urban_rate IS NULL OR (urban_rate >= 0 AND urban_rate <= 100)),
      economic_profile TEXT NOT NULL DEFAULT '',
      demographic_source TEXT NOT NULL,
      reference_year INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS event_metadata (
      event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      price_info TEXT,
      source_type TEXT NOT NULL DEFAULT 'ticketeira' CHECK(source_type IN ('ticketeira','agenda_oficial')),
      official_agenda_url TEXT,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS media_metric_series (
      talent_id TEXT NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
      network TEXT NOT NULL CHECK(network IN ('Instagram','YouTube','Spotify','TikTok')),
      metric TEXT NOT NULL,
      observed_on TEXT NOT NULL,
      value INTEGER NOT NULL CHECK(value >= 0),
      source TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'observado' CHECK(source_type IN ('oficial','relatorio_autorizado','observado','calculado')),
      evidence_url TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      methodology TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(talent_id, network, metric, observed_on, source)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS spotify_repertoire (
      talent_id TEXT PRIMARY KEY REFERENCES talents(id) ON DELETE CASCADE,
      albums_count INTEGER CHECK(albums_count IS NULL OR albums_count >= 0),
      singles_count INTEGER CHECK(singles_count IS NULL OR singles_count >= 0),
      latest_release_title TEXT,
      latest_release_date TEXT,
      top_tracks_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'oficial' CHECK(source_type IN ('oficial','relatorio_autorizado','observado')),
      evidence_url TEXT NOT NULL,
      observed_on TEXT NOT NULL,
      collected_at TEXT NOT NULL
    ) STRICT;`);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
