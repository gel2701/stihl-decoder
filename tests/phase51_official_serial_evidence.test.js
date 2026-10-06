import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { decodeStihlCode } from '../src/decoder.js';
import { OfficialSerialAnchorResolver } from '../src/OfficialSerialAnchorResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const jsonDbPath = path.join(rootDir, 'data', 'stihl_database.json');
const sqliteDbPath = path.join(rootDir, 'data', 'stihl_database.db');
const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const batchPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-09-26', 'official_serial_anchors_batch_2026-09-26.json');

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

const database = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
const batchDoc = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

test('Phase 51A - Test 1: Production Official Anchor Count & Batch Equivalence', (t) => {
  assert.strictEqual(batchDoc.anchors.length, 727, 'Batch must contain exactly 727 anchors');
  assert.strictEqual(anchorsDoc.anchors.length, 727, 'Production official anchors must contain exactly 727 anchors');
  assert.strictEqual(database.official_serial_anchors.length, 727, 'stihl_database.json official_serial_anchors must contain exactly 727 anchors');
});

test('Phase 51A - Test 2: Anchor Format & Invariants (9 Digits, Unique, Source MY_STIHL)', (t) => {
  const serialSet = new Set();
  for (const anchor of anchorsDoc.anchors) {
    assert.match(anchor.serial_number, /^\d{9}$/, `Anchor ${anchor.serial_number} must be exact 9 digits`);
    assert.ok(anchor.model_name && anchor.model_name.trim().length > 0, `Anchor ${anchor.serial_number} must have non-empty model_name`);
    assert.strictEqual(anchor.source, 'MY_STIHL', `Anchor ${anchor.serial_number} source must be MY_STIHL`);
    assert.strictEqual(anchor.verification_status, 'OFFICIAL_STIHL_LOOKUP', `Anchor ${anchor.serial_number} verification_status must be OFFICIAL_STIHL_LOOKUP`);
    assert.ok(['2026-09-22', '2026-09-26'].includes(anchor.verification_date), `Anchor ${anchor.serial_number} verification_date must be valid`);
    assert.ok(!serialSet.has(anchor.serial_number), `Duplicate serial number detected: ${anchor.serial_number}`);
    serialSet.add(anchor.serial_number);
  }
  assert.strictEqual(serialSet.size, 727, 'Must have 727 unique serial numbers');
});

test('Phase 51A - Test 3: Anchor 163118080 Exact Identity & Canonical Mapping', (t) => {
  const anchor = OfficialSerialAnchorResolver.resolve('163118080', database);
  assert.ok(anchor, 'Anchor 163118080 must be resolved');
  assert.strictEqual(anchor.model_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
  assert.strictEqual(anchor.canonical_model_id, 'stihl_ms_440');
  assert.strictEqual(anchor.category, 'Kettingzaag');
  assert.strictEqual(anchor.drive_type, 'Benzine');

  const res = decodeStihlCode('163118080', database);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.model, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
  assert.strictEqual(res.exactModel, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
});

test('Phase 51A - Test 4: Exact Anchor Beats Historical Range Inference', (t) => {
  // 163118080 is within range 160000000..169999999 (Waiblingen plant), but exact anchor takes absolute precedence
  const res = decodeStihlCode('163118080', database);
  assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'Exact anchor must beat range inference');
  assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.probableModelSeries, null);
});

test('Phase 51A - Test 5: No Technical Unresolved or NOT_FOUND Records in Anchors', (t) => {
  for (const anchor of anchorsDoc.anchors) {
    const serialized = JSON.stringify(anchor).toLowerCase();
    assert.ok(!serialized.includes('timeout'), 'Anchor must not contain timeout error');
    assert.ok(!serialized.includes('targetclosederror'), 'Anchor must not contain browser error');
    assert.ok(!serialized.includes('not_found'), 'Anchor must not contain NOT_FOUND status');
    assert.ok(!serialized.includes('invalid_serial'), 'Anchor must not contain INVALID_SERIAL status');
  }
});

test('Phase 51A - Test 6: No Inferred Range Rules Created from Batch', (t) => {
  // Verify that model_serial_ranges does NOT contain any range for 163118080 .. 163118179
  const ranges = database.model_serial_ranges || [];
  const inferred = ranges.find(r => r.serial_start === 163118080 || r.serial_end === 163118179);
  assert.strictEqual(inferred, undefined, 'No inferred range rule may exist for dense MS440 sequence');
});

test('Phase 51A - Test 7: No Generic 8-to-9 Digit Prefix Logic in Runtime', (t) => {
  // Decoding an unproven 8-digit serial must NOT automatically prepend 0 or succeed as official anchor
  const res8 = decodeStihlCode('99999999', database);
  assert.notStrictEqual(res8.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'Unproven 8-digit serial must not auto-resolve as exact anchor');
});

test('Phase 51A - Test 8: Dense MS 440 Sequence Exact Individual Anchors (100 Records)', (t) => {
  const ms440Seq = anchorsDoc.anchors.filter(a => {
    const n = Number(a.serial_number);
    return n >= 163118080 && n <= 163118179;
  });
  assert.strictEqual(ms440Seq.length, 100, 'Must have exactly 100 individual anchors for 163118080..163118179');
  for (const item of ms440Seq) {
    assert.strictEqual(item.model_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
    assert.strictEqual(item.category, 'Kettingzaag');
    assert.strictEqual(item.drive_type, 'Benzine');
    assert.strictEqual(item.source, 'MY_STIHL');
  }
});

test('Phase 51A - Test 9: Representative Samples Across Product Categories', (t) => {
  const samples = [
    { serial: '010001000', expectedModel: '051 .404" P Motorsäge', expectedCategory: 'Kettingzaag', expectedDrive: 'Benzine' },
    { serial: '010000000', expectedModel: 'FS 55 RC-E Z Motorsense', expectedCategory: 'Bosmaaier', expectedDrive: 'Benzine' },
    { serial: '163198080', expectedModel: 'TS 400-Z Trennschleifer', expectedCategory: 'Doorslijper', expectedDrive: 'Benzine' },
    { serial: '163100000', expectedModel: 'HS 45 Heckenschere, 600mm/24"', expectedCategory: 'Heggenschaar', expectedDrive: 'Benzine' },
    { serial: '163978080', expectedModel: 'BG 55 Blasgerät', expectedCategory: 'Bladblazer', expectedDrive: 'Benzine' },
    { serial: '163398080', expectedModel: 'SH 85 SaugHäcksler', expectedCategory: 'Zuighakselaar', expectedDrive: 'Benzine' }
  ];

  for (const s of samples) {
    const anchor = OfficialSerialAnchorResolver.resolve(s.serial, database);
    assert.ok(anchor, `Sample ${s.serial} must be resolved by OfficialSerialAnchorResolver`);
    assert.strictEqual(anchor.model_name, s.expectedModel);
    assert.strictEqual(anchor.category, s.expectedCategory);
    assert.strictEqual(anchor.drive_type, s.expectedDrive);
    assert.strictEqual(anchor.source, 'MY_STIHL');
    assert.strictEqual(anchor.verification_date, '2026-09-26');

    // Decoder integration
    const res = decodeStihlCode(s.serial, database);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
    assert.strictEqual(res.model, s.expectedModel);
    assert.strictEqual(res.exactModel, s.expectedModel);
    assert.strictEqual(res.category, s.expectedCategory);
  }
});

test('Phase 51A - Test 10: JSON vs SQLite Parity for all 727 Anchors', async (t) => {
  const db = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY);
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM official_serial_anchors ORDER BY CAST(serial_number AS INTEGER) ASC', (err, r) => {
      if (err) reject(err); else resolve(r);
    });
  });
  db.close();

  assert.strictEqual(rows.length, 727, 'SQLite official_serial_anchors table must have 727 rows');
  assert.strictEqual(anchorsDoc.anchors.length, 727, 'JSON anchors must have 727 entries');

  for (const j of anchorsDoc.anchors) {
    const s = rows.find(r => r.serial_number === j.serial_number);
    assert.ok(s, `Anchor ${j.serial_number} must exist in SQLite`);
    assert.strictEqual(j.model_name, s.model_name);
    assert.strictEqual(j.canonical_model_id || null, s.canonical_model_id || null);
    assert.strictEqual(j.category || null, s.category || null);
    assert.strictEqual(j.drive_type || null, s.drive_type || null);
    assert.strictEqual(j.source, s.source);
    assert.strictEqual(j.verification_date || null, s.verification_date || null);
    assert.strictEqual(j.verification_status, s.verification_status);
  }
});
