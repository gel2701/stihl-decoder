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
  // SQLite fallback
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Central Database Path Resolution
const PERSISTENT_DIR = process.env.RENDER_DISK_PATH || '/var/data';
const PERSISTENT_DB_PATH = path.join(PERSISTENT_DIR, 'stihl_database.db');
const LOCAL_FALLBACK_DB_PATH = path.join(__dirname, '..', '..', 'data', 'stihl_database.db');

export function getDatabasePath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (process.env.NODE_ENV === 'test') return path.join(__dirname, '..', '..', 'data', 'test_stihl_database.db');
  
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

  // Configure Production Pragmas safely
  dbInstance.serialize(() => {
    dbInstance.run(`PRAGMA journal_mode = WAL;`);
    dbInstance.run(`PRAGMA foreign_keys = ON;`);
    dbInstance.run(`PRAGMA busy_timeout = 5000;`);

    // Ensure analytics_events table exists idempotently (SAFE: NEVER DROPS TABLES)
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
