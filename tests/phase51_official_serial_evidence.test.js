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
const batch1Path = path.join(rootDir, 'data', 'import_batches', 'serials_2026-09-26', 'official_serial_anchors_batch_2026-09-26.json');
const batch2NewPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06', 'data', 'new_official_serial_anchors_only_2026-10-06.json');
const batch2Path = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06', 'data', 'official_serial_anchors_batch_2026-10-06.json');

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

const database = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
const batch1Doc = JSON.parse(fs.readFileSync(batch1Path, 'utf8'));
const batch2NewDoc = JSON.parse(fs.readFileSync(batch2NewPath, 'utf8'));
const batch2Doc = JSON.parse(fs.readFileSync(batch2Path, 'utf8'));

test('Phase 51A-R2 - Test 1: Production Official Anchor Count & Batch Equivalence', (t) => {
  assert.strictEqual(batch1Doc.anchors.length, 727, 'Batch 1 must contain exactly 727 anchors');
  assert.strictEqual(batch2NewDoc.anchors.length, 2118, 'Batch 2 new anchors must contain exactly 2118 anchors');
  assert.strictEqual(batch2Doc.anchors.length, 2138, 'Batch 2 total observed anchors must contain 2138 anchors');
  assert.strictEqual(anchorsDoc.anchors.length, 2845, 'Production official anchors must contain exactly 2845 anchors');
  assert.strictEqual(database.official_serial_anchors.length, 2845, 'stihl_database.json official_serial_anchors must contain exactly 2845 anchors');
});

test('Phase 51A-R2 - Test 2: Anchor Format & Invariants (9 Digits, Unique, Source MY_STIHL)', (t) => {
  const serialSet = new Set();
  const validDates = ['2026-09-22', '2026-09-26', '2026-10-06'];
  for (const anchor of anchorsDoc.anchors) {
    assert.match(anchor.serial_number, /^\d{9}$/, `Anchor ${anchor.serial_number} must be exact 9 digits`);
    assert.ok(anchor.model_name && anchor.model_name.trim().length > 0, `Anchor ${anchor.serial_number} must have non-empty model_name`);
    assert.strictEqual(anchor.source, 'MY_STIHL', `Anchor ${anchor.serial_number} source must be MY_STIHL`);
    assert.strictEqual(anchor.verification_status, 'OFFICIAL_STIHL_LOOKUP', `Anchor ${anchor.serial_number} verification_status must be OFFICIAL_STIHL_LOOKUP`);
    assert.ok(validDates.includes(anchor.verification_date), `Anchor ${anchor.serial_number} verification_date must be valid`);
    assert.ok(!serialSet.has(anchor.serial_number), `Duplicate serial number detected: ${anchor.serial_number}`);
    serialSet.add(anchor.serial_number);
  }
  assert.strictEqual(serialSet.size, 2845, 'Must have 2845 unique serial numbers');
});

test('Phase 51A-R2 - Test 3: Anchor 163118080 Exact Identity & Canonical Mapping', (t) => {
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

test('Phase 51A-R2 - Test 4: Exact Anchor Beats Historical Range Inference', (t) => {
  // 163118080 is within range 160000000..169999999 (Waiblingen plant), but exact anchor takes absolute precedence
  const res = decodeStihlCode('163118080', database);
  assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'Exact anchor must beat range inference');
  assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.probableModelSeries, null);
});

test('Phase 51A-R2 - Test 5: No Technical Unresolved or NOT_FOUND Records in Anchors', (t) => {
  for (const anchor of anchorsDoc.anchors) {
    const serialized = JSON.stringify(anchor).toLowerCase();
    assert.ok(!serialized.includes('timeout'), 'Anchor must not contain timeout error');
    assert.ok(!serialized.includes('targetclosederror'), 'Anchor must not contain browser error');
    assert.ok(!serialized.includes('not_found'), 'Anchor must not contain NOT_FOUND status');
    assert.ok(!serialized.includes('invalid_serial'), 'Anchor must not contain INVALID_SERIAL status');
  }
});

test('Phase 51A-R2 - Test 6: No Inferred Range Rules Created from Batch', (t) => {
  // Verify that model_serial_ranges does NOT contain any range for 163118080 .. 163118179
  const ranges = database.model_serial_ranges || [];
  const inferred = ranges.find(r => r.serial_start === 163118080 || r.serial_end === 163118179);
  assert.strictEqual(inferred, undefined, 'No inferred range rule may exist for dense MS440 sequence');
});

test('Phase 51A-R2 - Test 7: No Generic 8-to-9 Digit Prefix Logic in Runtime', (t) => {
  // Decoding an unproven 8-digit serial must NOT automatically prepend 0 or succeed as official anchor
  const res8 = decodeStihlCode('99999999', database);
  assert.notStrictEqual(res8.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'Unproven 8-digit serial must not auto-resolve as exact anchor');
});

test('Phase 51A-R2 - Test 8: Dense MS 440 Sequence Exact Individual Anchors Preserved', (t) => {
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

test('Phase 51A-R2 - Test 9: Representative Samples Across Product Categories (Batch 1 & Batch 2)', (t) => {
  const samples = [
    // Batch 1 samples
    { serial: '010001000', expectedModel: '051 .404" P Motorsäge', expectedCategory: 'Kettingzaag', expectedDrive: 'Benzine', date: '2026-09-26' },
    { serial: '010000000', expectedModel: 'FS 55 RC-E Z Motorsense', expectedCategory: 'Bosmaaier', expectedDrive: 'Benzine', date: '2026-09-26' },
    { serial: '163198080', expectedModel: 'TS 400-Z Trennschleifer', expectedCategory: 'Doorslijper', expectedDrive: 'Benzine', date: '2026-09-26' },
    { serial: '163100000', expectedModel: 'HS 45 Heckenschere, 600mm/24"', expectedCategory: 'Heggenschaar', expectedDrive: 'Benzine', date: '2026-09-26' },
    { serial: '163978080', expectedModel: 'BG 55 Blasgerät', expectedCategory: 'Bladblazer', expectedDrive: 'Benzine', date: '2026-09-26' },
    { serial: '163398080', expectedModel: 'SH 85 SaugHäcksler', expectedCategory: 'Zuighakselaar', expectedDrive: 'Benzine', date: '2026-09-26' },
    // Batch 2 new samples
    // 3 Chainsaws:
    { serial: '163118180', expectedModel: 'MS 440-Z 3/8" RIM Magnum Motorsäge', expectedCategory: 'Kettingzaag', expectedDrive: 'Benzine', date: '2026-10-06' },
    { serial: '163118185', expectedModel: 'MS 440-Z 3/8" RIM Magnum Motorsäge', expectedCategory: 'Kettingzaag', expectedDrive: 'Benzine', date: '2026-10-06' },
    { serial: '163118190', expectedModel: 'MS 440-Z 3/8" RIM Magnum Motorsäge', expectedCategory: 'Kettingzaag', expectedDrive: 'Benzine', date: '2026-10-06' },
    // 2 Brushcutters:
    { serial: '163120365', expectedModel: 'FS 550-Z Freischneider', expectedCategory: 'Bosmaaier', expectedDrive: 'Benzine', date: '2026-10-06' },
    { serial: '163120370', expectedModel: 'FS 550-Z Freischneider', expectedCategory: 'Bosmaaier', expectedDrive: 'Benzine', date: '2026-10-06' },
    // 2 General motorized:
    { serial: '163121630', expectedModel: 'SP 450 Anbaumotor', expectedCategory: 'Algemeen gemotoriseerd', expectedDrive: 'Benzine', date: '2026-10-06' },
    { serial: '163121635', expectedModel: 'SP 450 Anbaumotor', expectedCategory: 'Algemeen gemotoriseerd', expectedDrive: 'Benzine', date: '2026-10-06' },
    // 2 Hedge trimmers:
    { serial: '163123040', expectedModel: 'HS 75 Heckenschere,600mm/24"', expectedCategory: 'Heggenschaar', expectedDrive: 'Benzine', date: '2026-10-06' },
    { serial: '163123045', expectedModel: 'HS 75 Heckenschere,600mm/24"', expectedCategory: 'Heggenschaar', expectedDrive: 'Benzine', date: '2026-10-06' },
    // 1 Earth auger (Grondboren):
    { serial: '163120895', expectedModel: 'BT 360 Bohrgerät', expectedCategory: 'Grondboren', expectedDrive: 'Benzine', date: '2026-10-06' }
  ];

  for (const s of samples) {
    const anchor = OfficialSerialAnchorResolver.resolve(s.serial, database);
    assert.ok(anchor, `Sample ${s.serial} must be resolved by OfficialSerialAnchorResolver`);
    assert.strictEqual(anchor.model_name, s.expectedModel);
    assert.strictEqual(anchor.category, s.expectedCategory);
    assert.strictEqual(anchor.drive_type, s.expectedDrive);
    assert.strictEqual(anchor.source, 'MY_STIHL');
    assert.strictEqual(anchor.verification_date, s.date);

    // Decoder integration
    const res = decodeStihlCode(s.serial, database);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
    assert.strictEqual(res.model, s.expectedModel);
    assert.strictEqual(res.exactModel, s.expectedModel);
    assert.strictEqual(res.category, s.expectedCategory);
  }
});

test('Phase 51A-R2 - Test 10: JSON vs SQLite Parity for all 2845 Anchors', async (t) => {
  const db = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY);
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT * FROM official_serial_anchors ORDER BY serial_number ASC', (err, r) => {
      if (err) reject(err); else resolve(r);
    });
  });
  db.close();

  assert.strictEqual(rows.length, 2845, 'SQLite official_serial_anchors table must have 2845 rows');
  assert.strictEqual(anchorsDoc.anchors.length, 2845, 'JSON anchors must have 2845 entries');

  for (let i = 0; i < anchorsDoc.anchors.length; i++) {
    const j = anchorsDoc.anchors[i];
    const s = rows[i];
    assert.strictEqual(j.serial_number, s.serial_number, `Serial mismatch at index ${i}`);
    assert.strictEqual(j.model_name, s.model_name, `Model name mismatch at ${j.serial_number}`);
    assert.strictEqual(j.canonical_model_id || null, s.canonical_model_id || null);
    assert.strictEqual(j.category || null, s.category || null);
    assert.strictEqual(j.drive_type || null, s.drive_type || null);
    assert.strictEqual(j.source, s.source);
    assert.strictEqual(j.verification_date || null, s.verification_date || null);
    assert.strictEqual(j.verification_status, s.verification_status);
  }
});
