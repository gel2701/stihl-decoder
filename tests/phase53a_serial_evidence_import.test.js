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
const aliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');

const batch1Path = path.join(rootDir, 'data', 'import_batches', 'serials_2026-09-26', 'official_serial_anchors_batch_2026-09-26.json');
const batch2NewPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06', 'data', 'new_official_serial_anchors_only_2026-10-06.json');
const batch3NewPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'data', 'new_official_serial_anchors_only_2026-10-09.json');
const batch3BatchPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'data', 'official_serial_anchors_batch_2026-10-09.json');
const batch3ManifestPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'batch_manifest.json');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  Database = null;
}

const database = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
const batch1Doc = JSON.parse(fs.readFileSync(batch1Path, 'utf8'));
const batch2NewDoc = JSON.parse(fs.readFileSync(batch2NewPath, 'utf8'));
const batch3NewDoc = JSON.parse(fs.readFileSync(batch3NewPath, 'utf8'));
const batch3BatchDoc = JSON.parse(fs.readFileSync(batch3BatchPath, 'utf8'));
const batch3Manifest = JSON.parse(fs.readFileSync(batch3ManifestPath, 'utf8'));

test('Phase 53A - Test 1: Cumulative Production Anchor Count & Batch Equivalence', (t) => {
  assert.strictEqual(batch1Doc.anchors.length, 727, 'Batch 1 must contain exactly 727 anchors');
  assert.strictEqual(batch2NewDoc.anchors.length, 2118, 'Batch 2 new anchors must contain exactly 2118 anchors');
  assert.strictEqual(batch3NewDoc.anchors.length, 6029, 'Batch 3 new anchors must contain exactly 6029 anchors');
  assert.strictEqual(batch3BatchDoc.anchors.length, 6031, 'Batch 3 total observed positive anchors must contain 6031 anchors');
  
  // Total cumulative anchors: 727 + 2118 + 6029 = 8874
  assert.strictEqual(anchorsDoc.anchors.length, 8874, 'Production official anchors must contain exactly 8874 anchors');
  assert.strictEqual(database.official_serial_anchors.length, 8874, 'stihl_database.json official_serial_anchors must contain exactly 8874 anchors');
  assert.strictEqual(aliasesDoc.aliases.length, 171, 'official_serial_input_aliases.json must contain exactly 171 aliases');
  assert.strictEqual(database.official_serial_input_aliases.length, 171, 'stihl_database.json aliases must contain exactly 171 aliases');
});

test('Phase 53A - Test 2: Anchor Format & Invariants (9 Digits, Unique, Source MY_STIHL)', (t) => {
  const serialSet = new Set();
  const validDates = ['2026-09-22', '2026-09-26', '2026-10-06', '2026-10-09'];
  for (const anchor of anchorsDoc.anchors) {
    assert.match(anchor.serial_number, /^\d{9}$/, `Anchor ${anchor.serial_number} must be exact 9 digits`);
    assert.ok(anchor.model_name && anchor.model_name.trim().length > 0, `Anchor ${anchor.serial_number} must have non-empty model_name`);
    assert.strictEqual(anchor.source, 'MY_STIHL', `Anchor ${anchor.serial_number} source must be MY_STIHL`);
    assert.strictEqual(anchor.verification_status, 'OFFICIAL_STIHL_LOOKUP', `Anchor ${anchor.serial_number} verification_status must be OFFICIAL_STIHL_LOOKUP`);
    assert.ok(validDates.includes(anchor.verification_date), `Anchor ${anchor.serial_number} verification_date must be valid`);
    assert.ok(!serialSet.has(anchor.serial_number), `Duplicate serial number detected: ${anchor.serial_number}`);
    serialSet.add(anchor.serial_number);
  }
  assert.strictEqual(serialSet.size, 8874, 'Must have exactly 8874 unique serial numbers');
});

test('Phase 53A - Test 3: Batch 3 Accounting Invariant (6822 Rows, 6820 Inputs, 0 Unaccounted)', (t) => {
  assert.strictEqual(batch3Manifest.populated_data_rows, 6822, 'Batch 3 must have 6822 populated data rows');
  assert.strictEqual(batch3Manifest.unique_input_serials, 6820, 'Batch 3 must have 6820 unique input serials');
  assert.strictEqual(batch3Manifest.exact_official_observations, 6031, 'Batch 3 must have 6031 exact positive observations');
  assert.strictEqual(batch3Manifest.recheck_queue_count, 789, 'Batch 3 recheck queue must contain 789 unique inputs');
  assert.strictEqual(batch3Manifest.technical_timeout_count, 736, 'Batch 3 must have 736 technical timeouts');
  assert.strictEqual(batch3Manifest.technical_error_count, 34, 'Batch 3 must have 34 technical errors');
  assert.strictEqual(batch3Manifest.found_without_usable_identity_count, 19, 'Batch 3 must have 19 missing identity observations');
  assert.strictEqual(batch3Manifest.duplicate_source_rows_count, 4, 'Batch 3 must record 4 duplicate source rows (2 unique serials)');
  assert.strictEqual(batch3Manifest.identity_conflicts, 0, 'Batch 3 must have 0 identity conflicts');

  // Accounting completeness check: 6031 positive + 789 recheck = 6820 total unique inputs
  assert.strictEqual(batch3Manifest.exact_official_observations + batch3Manifest.recheck_queue_count, 6820, '0 unaccounted input serials in Batch 3');
});

test('Phase 53A - Test 4: Positive Evidence Over Technical Failure (163148080 Preserved as MS 260-W)', (t) => {
  const anchor = OfficialSerialAnchorResolver.resolve('163148080', database);
  assert.ok(anchor, 'Anchor 163148080 must be resolved');
  assert.strictEqual(anchor.model_name, 'MS 260-W .325" P Motorsäge', '163148080 must be preserved as verified MS 260-W despite timeout in new batch');
  assert.strictEqual(anchor.category, 'Kettingzaag');
  assert.strictEqual(anchor.drive_type, 'Benzine');
  assert.strictEqual(anchor.source, 'MY_STIHL');
});

test('Phase 53A - Test 5: Duplicate Resolution (163140540 & 163150525)', (t) => {
  // 163140540 appears twice in source with identical model
  const anchor1 = OfficialSerialAnchorResolver.resolve('163140540', database);
  assert.ok(anchor1, 'Anchor 163140540 must be resolved');
  assert.strictEqual(anchor1.model_name, 'MS 210 3/8"P Motorsäge');

  // 163150525 appears twice (1 error, 1 positive) -> resolved to positive model FS 450
  const anchor2 = OfficialSerialAnchorResolver.resolve('163150525', database);
  assert.ok(anchor2, 'Anchor 163150525 must be resolved to positive model');
  assert.strictEqual(anchor2.model_name, 'FS 450 Freischneider');
  assert.strictEqual(anchor2.category, 'Bosmaaier');
});

test('Phase 53A - Test 6: Reconfirmed Existing Anchors (163130555 & 163158080)', (t) => {
  const a1 = OfficialSerialAnchorResolver.resolve('163130555', database);
  assert.ok(a1);
  assert.strictEqual(a1.model_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');

  const a2 = OfficialSerialAnchorResolver.resolve('163158080', database);
  assert.ok(a2);
  assert.strictEqual(a2.model_name, 'HS 45 Heckenschere, 600mm/24"');
});

test('Phase 53A - Test 7: Decoder Integration Across Representative Categories (Batch 3)', (t) => {
  const samples = [
    { serial: '163130555', expectedModel: 'MS 440-Z 3/8" RIM Magnum Motorsäge', expectedCategory: 'Kettingzaag', expectedDrive: 'Benzine' },
    { serial: '163140540', expectedModel: 'MS 210 3/8"P Motorsäge', expectedCategory: 'Kettingzaag', expectedDrive: 'Benzine' },
    { serial: '163150525', expectedModel: 'FS 450 Freischneider', expectedCategory: 'Bosmaaier', expectedDrive: 'Benzine' },
    { serial: '163131000', expectedModel: 'FS 450 Freischneider', expectedCategory: 'Bosmaaier', expectedDrive: 'Benzine' },
    { serial: '163158080', expectedModel: 'HS 45 Heckenschere, 600mm/24"', expectedCategory: 'Heggenschaar', expectedDrive: 'Benzine' }
  ];

  for (const s of samples) {
    const res = decodeStihlCode(s.serial, database);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
    assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
    assert.strictEqual(res.model, s.expectedModel);
    assert.strictEqual(res.category, s.expectedCategory);
  }
});

test('Phase 53A - Test 8: Exact Anchor Beats Range Inference for Batch 3 Serials', (t) => {
  // Batch 3 serial 163140540 is within Waiblingen plant range (160000000..169999999), but exact anchor takes absolute precedence
  const res = decodeStihlCode('163140540', database);
  assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'Exact anchor must beat range inference');
  assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.probableModelSeries, null);
});

test('Phase 53A - Test 9: Zero Inferred Range Rules Created', (t) => {
  const ranges = database.model_serial_ranges || [];
  // Verify no synthetic range created for 163130555..163165505
  const inferred = ranges.find(r => r.serial_start === 163130555 || r.serial_end === 163165505);
  assert.strictEqual(inferred, undefined, 'No inferred range rule may exist from Batch 3');
});

test('Phase 53A - Test 10: Parts Foundation Immutability', (t) => {
  if (Database) {
    const db = new Database(sqliteDbPath, { readonly: true });
    const partsCount = db.prepare('SELECT COUNT(*) as cnt FROM parts').get().cnt;
    const fitmentsCount = db.prepare('SELECT COUNT(*) as cnt FROM model_part_fitments').get().cnt;
    const evidenceCount = db.prepare('SELECT COUNT(*) as cnt FROM part_fitment_evidence').get().cnt;
    const configsCount = db.prepare('SELECT COUNT(*) as cnt FROM parts_model_configurations').get().cnt;
    db.close();

    assert.strictEqual(partsCount, 17082, 'Parts count must be exactly 17082');
    assert.strictEqual(fitmentsCount, 175106, 'Fitments count must be exactly 175106');
    assert.strictEqual(evidenceCount, 206607, 'Evidence count must be exactly 206607');
    assert.strictEqual(configsCount, 766, 'Configurations count must be exactly 766');
  }
});

test('Phase 53A - Test 11: 100% JSON vs SQLite Parity for all 8874 Anchors', async (t) => {
  let rows;
  if (Database) {
    const db = new Database(sqliteDbPath, { readonly: true });
    rows = db.prepare('SELECT * FROM official_serial_anchors ORDER BY serial_number ASC').all();
    const aliasRows = db.prepare('SELECT * FROM official_serial_input_aliases ORDER BY input_serial ASC').all();
    db.close();

    assert.strictEqual(rows.length, 8874, 'SQLite official_serial_anchors table must have 8874 rows');
    assert.strictEqual(aliasRows.length, 171, 'SQLite official_serial_input_aliases table must have 171 rows');
  } else {
    const sqlite3 = require('sqlite3');
    const db = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY);
    rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM official_serial_anchors ORDER BY serial_number ASC', (err, r) => {
        if (err) reject(err); else resolve(r);
      });
    });
    db.close();
    assert.strictEqual(rows.length, 8874);
  }

  assert.strictEqual(anchorsDoc.anchors.length, 8874, 'JSON anchors must have 8874 entries');

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

test('Phase 53A - Test 12: Failure Injections (Conflict, Malformed, Timeout Rejection)', (t) => {
  // 1. Rejection of timeout/error as anchor
  for (const anchor of anchorsDoc.anchors) {
    const serialized = JSON.stringify(anchor).toLowerCase();
    assert.ok(!serialized.includes('timeout'), 'Anchor must not contain timeout');
    assert.ok(!serialized.includes('unresolved'), 'Anchor must not have UNRESOLVED status');
  }

  // 2. Unproven 8-digit serial does not auto-resolve
  const res8 = decodeStihlCode('88888888', database);
  assert.notStrictEqual(res8.identityStatus, 'EXACT_MODEL_IDENTIFIED', 'Unproven 8-digit serial must not auto-resolve as exact anchor');
});
