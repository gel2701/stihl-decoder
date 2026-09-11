/**
 * Central Database Connection & Persistent Storage Manager for STIHLDecoder.nl
 * Phase 32B Render Persistent Disk Migration & Safe Idempotent Schema Management
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let sqlite3;
try {
  sqlite3 = (await import('sqlite3')).default.verbose();
} catch (e) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    sqlite3 = {
      Database: class {
        constructor(targetPath) {
          this.syncDb = new DatabaseSync(targetPath);
        }
        serialize(fn) {
          if (typeof fn === 'function') fn();
        }
        run(sql, params, callback) {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          try {
            const stmt = this.syncDb.prepare(sql);
            const res = stmt.run(...(params || []));
            if (callback) callback.call({ changes: res.changes, lastID: res.lastInsertRowid }, null);
          } catch (err) {
            if (callback) callback(err);
          }
        }
        get(sql, params, callback) {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          try {
            const stmt = this.syncDb.prepare(sql);
            const row = stmt.get(...(params || []));
            if (callback) callback(null, row);
          } catch (err) {
            if (callback) callback(err);
          }
        }
        all(sql, params, callback) {
          if (typeof params === 'function') {
            callback = params;
            params = [];
          }
          try {
            const stmt = this.syncDb.prepare(sql);
            const rows = stmt.all(...(params || []));
            if (callback) callback(null, rows);
          } catch (err) {
            if (callback) callback(err);
          }
        }
        on(event, handler) {
          if (event === 'open' && typeof handler === 'function') {
            setTimeout(handler, 0);
          }
        }
        close(callback) {
          try {
            this.syncDb.close();
            if (callback) callback(null);
          } catch (err) {
            if (callback) callback(err);
          }
        }
      }
    };
  } catch (fallbackErr) {
    // Both SQLite drivers unavailable
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Central Database Path Resolution
const PERSISTENT_DIR = process.env.RENDER_DISK_PATH || '/var/data';
const PERSISTENT_DB_PATH = path.join(PERSISTENT_DIR, 'stihl_database.db');
const LOCAL_FALLBACK_DB_PATH = path.join(__dirname, '..', 'data', 'stihl_database.db');
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test_stihl_database.db');
const DB_SCHEMA_VERSION = 3;

const dbHealthSnapshot = {
  connected: false,
  path: null,
  persistent: false,
  schemaVersion: DB_SCHEMA_VERSION,
  analyticsSchemaReady: false,
  lastError: null
};

export function getDatabasePath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.REPRODUCIBILITY_NESTED_RUN === '1' ||
    process.argv.some((arg) => typeof arg === 'string' && (arg.endsWith('.test.js') || arg.includes('run_all_tests') || arg.includes('test_runner')))
  ) {
    return TEST_DB_PATH;
  }
  
  // If Render Persistent Disk directory exists or is mounted, use /var/data/stihl_database.db
  if (fs.existsSync(PERSISTENT_DIR)) {
    return PERSISTENT_DB_PATH;
  }
  
  return LOCAL_FALLBACK_DB_PATH;
}

export const CURRENT_DB_PATH = getDatabasePath();

export function isPersistentDiskActive() {
  return fs.existsSync(PERSISTENT_DIR) || process.env.DATABASE_PATH?.startsWith('/var/data');
}

let dbInstance = null;

export function getDatabaseConnection() {
  if (dbInstance) return dbInstance;
  if (!sqlite3) return null;

  const targetPath = getDatabasePath();
  const dbDir = path.dirname(targetPath);

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
    } catch (e) {}
  }

  // Safe initial copy: If persistent DB does not exist, copy from local fallback ONCE
  if (targetPath === PERSISTENT_DB_PATH && !fs.existsSync(PERSISTENT_DB_PATH) && fs.existsSync(LOCAL_FALLBACK_DB_PATH)) {
    try {
      fs.copyFileSync(LOCAL_FALLBACK_DB_PATH, PERSISTENT_DB_PATH);
      console.log('✅ Initial one-time database copy to Render Persistent Disk succeeded.');
    } catch (err) {
      console.warn('⚠️ Initial persistent database copy warning:', err.message);
    }
  }

  dbInstance = new sqlite3.Database(targetPath);
  dbHealthSnapshot.path = targetPath;
  dbHealthSnapshot.persistent = isPersistentDiskActive();

  // Configure Production Pragmas safely
  dbInstance.serialize(() => {
    dbInstance.run(`PRAGMA journal_mode = WAL;`);
    dbInstance.run(`PRAGMA foreign_keys = ON;`);
    dbInstance.run(`PRAGMA busy_timeout = 5000;`);
    dbInstance.run(`CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
    dbInstance.run(`INSERT INTO schema_version (version) SELECT ${DB_SCHEMA_VERSION} WHERE NOT EXISTS (SELECT 1 FROM schema_version);`);

    dbInstance.run(`CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE,
      event_type VARCHAR(50) NOT NULL,
      model_slug VARCHAR(100),
      page_path VARCHAR(250),
      metadata_json TEXT,
      is_test INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);

    dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);`);
    dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);`);
    dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_analytics_model_slug ON analytics_events(model_slug);`);
    dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_analytics_test ON analytics_events(is_test);`);
    dbInstance.all(`PRAGMA table_info(analytics_events);`, (err, rows = []) => {
      if (err) {
        dbHealthSnapshot.lastError = err.message;
        return;
      }

      const columnNames = new Set(rows.map((row) => row.name));
      if (!columnNames.has('event_id')) {
        dbInstance.run(`ALTER TABLE analytics_events ADD COLUMN event_id TEXT;`, (alterErr) => {
          if (alterErr && !alterErr.message.includes('duplicate column name')) {
            dbHealthSnapshot.lastError = alterErr.message;
            return;
          }
          dbInstance.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_event_id ON analytics_events(event_id);`);
          dbHealthSnapshot.analyticsSchemaReady = true;
        });
      } else {
        dbInstance.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_event_id ON analytics_events(event_id);`);
        dbHealthSnapshot.analyticsSchemaReady = true;
      }
    });

    dbInstance.run(`CREATE TABLE IF NOT EXISTS field_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      observation_id TEXT UNIQUE NOT NULL,
      dedupe_key TEXT UNIQUE NOT NULL,
      serial_normalized TEXT NOT NULL,
      serial_hash TEXT NOT NULL,
      decoder_identity_status TEXT NOT NULL,
      decoder_predicted_series TEXT,
      decoder_candidate_slugs_json TEXT,
      user_reported_model_raw TEXT NOT NULL,
      user_reported_model_normalized TEXT NOT NULL,
      matched_model_slug TEXT,
      matched_model_name TEXT,
      observation_source TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'PENDING',
      consent_version TEXT NOT NULL DEFAULT 'v1',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      review_status_note TEXT,
      promoted_reference TEXT
    );`);

    dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_field_obs_serial_hash ON field_observations(serial_hash);`);
    dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_field_obs_status ON field_observations(verification_status);`);
    dbInstance.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_field_obs_dedupe ON field_observations(dedupe_key);`);
  });

  dbInstance.on('open', () => {
    dbHealthSnapshot.connected = true;
    dbHealthSnapshot.lastError = null;
  });
  dbInstance.on('error', (err) => {
    dbHealthSnapshot.connected = false;
    dbHealthSnapshot.lastError = err.message;
  });

  return dbInstance;
}

export function backupDatabase() {
  const targetPath = getDatabasePath();
  if (!fs.existsSync(targetPath)) return { success: false, error: 'Database file not found.' };

  const backupDir = path.join(path.dirname(targetPath), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const timestampStr = now.toISOString().replace(/[-:]/g, '').replace('T', '-').split('.')[0];
  const backupFilePath = path.join(backupDir, `stihl_database-${timestampStr}.db`);

  try {
    if (dbInstance) {
      dbInstance.run(`PRAGMA wal_checkpoint(FULL);`);
    }
    fs.copyFileSync(targetPath, backupFilePath);

    // Retention: Keep 7 most recent backups
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('stihl_database-') && f.endsWith('.db'))
      .map(f => path.join(backupDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    if (files.length > 7) {
      files.slice(7).forEach(fileToRemove => {
        try { fs.unlinkSync(fileToRemove); } catch (e) {}
      });
    }

    return { success: true, backupFilePath, totalBackupsKept: Math.min(files.length, 7) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function getDatabaseHealthSnapshot() {
  return {
    ...dbHealthSnapshot,
    connected: Boolean(sqlite3) && (dbHealthSnapshot.connected || fs.existsSync(getDatabasePath())),
    path: getDatabasePath(),
    persistent: isPersistentDiskActive()
  };
}
