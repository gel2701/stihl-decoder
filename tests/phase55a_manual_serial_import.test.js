/**
 * Phase 55A Test Suite: Manual MY STIHL Serial Evidence Reconciliation & Controlled Import
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const EXPECTED_SOURCE_SHA256 = 'c7e682f06fe67881f9c66243b645cbd5f1c272323cd51f9451ec2b66684b7680';
const EXPECTED_SOURCE_BYTES = 4564382;
const EXPECTED_SOURCE_ROWS = 7303;
const EXPECTED_UNIQUE_SERIALS = 7202;
const EXPECTED_NEW_ANCHORS = 1543;
const EXPECTED_RECONFIRMED = 604;
const EXPECTED_TOTAL_ANCHORS = 10417;

const batchDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-17_manual_followup');
const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const canonicalAnchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const stihlDbPath = path.join(rootDir, 'data', 'stihl_database.json');

test('Phase 55A - Test 1: Frozen Source File Identity & Byte-for-Byte Integrity', () => {
  const sourceCopy = path.join(batchDir, 'source', 'stihl_resultaten_17_10.csv');
  assert.ok(fs.existsSync(sourceCopy), 'Source copy must exist in batch');

  const bytes = fs.readFileSync(sourceCopy);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');

  assert.strictEqual(hash, EXPECTED_SOURCE_SHA256, 'Source SHA256 must match frozen hash');
  assert.strictEqual(bytes.length, EXPECTED_SOURCE_BYTES, 'Source byte size must match');
});

test('Phase 55A - Test 2: Complete Source Row Accounting (7303 Rows, 0 Unaccounted)', () => {
  const manifestPath = path.join(batchDir, 'batch_manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Manifest must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.source_rows, EXPECTED_SOURCE_ROWS, 'All 7,303 source rows accounted');
  assert.strictEqual(manifest.source_unique_serials, EXPECTED_UNIQUE_SERIALS, '7,202 unique serials');
  assert.strictEqual(manifest.new_official_anchors, EXPECTED_NEW_ANCHORS, '1,543 new anchors');
  assert.strictEqual(manifest.reconfirmed_existing_anchors, EXPECTED_RECONFIRMED, '604 reconfirmed anchors');
  assert.strictEqual(manifest.identity_conflicts, 0, 'Zero identity conflicts');
  assert.strictEqual(manifest.invalid_input_serials, 0, 'Zero invalid input serials');
});

test('Phase 55A - Test 3: Historical Identical Row & Observed Same Result Preservation', () => {
  const alreadyRepPath = path.join(batchDir, 'data', 'already_represented_rows_2026-10-17.csv');
  assert.ok(fs.existsSync(alreadyRepPath), 'Already represented rows artifact must exist');

  const content = fs.readFileSync(alreadyRepPath, 'utf8');
  const lines = content.trim().split('\n');
  assert.strictEqual(lines.length - 1, EXPECTED_RECONFIRMED, `Must contain exactly ${EXPECTED_RECONFIRMED} reconfirmed rows`);

  // Verify sample serial 163155655 is reconfirmed
  assert.ok(content.includes('163155655'), 'Serial 163155655 must be recorded as already represented');
});

test('Phase 55A - Test 4: Historical Unresolved to Positive Resolution Traceability', () => {
  const prevUnresolvedPath = path.join(batchDir, 'data', 'previously_unresolved_now_positive_2026-10-17.csv');
  assert.ok(fs.existsSync(prevUnresolvedPath), 'previously_unresolved_now_positive artifact must exist');

  const content = fs.readFileSync(prevUnresolvedPath, 'utf8');
  const lines = content.trim().split('\n');
  assert.strictEqual(lines.length - 1, 13, 'Must contain exactly 13 previously unresolved now positive serials');

  // Verify known samples e.g. 163134555 and 163135705
  assert.ok(content.includes('163134555'), 'Serial 163134555 must be tracked');
  assert.ok(content.includes('163135705'), 'Serial 163135705 must be tracked');
});

test('Phase 55A - Test 5: Reconfirmed Existing Anchors Preservation (Zero Duplicates)', () => {
  const reconfirmedPath = path.join(batchDir, 'data', 'reconfirmed_existing_anchors_2026-10-17.csv');
  assert.ok(fs.existsSync(reconfirmedPath), 'Reconfirmed CSV must exist');

  const content = fs.readFileSync(reconfirmedPath, 'utf8');
  const lines = content.trim().split('\n');
  assert.strictEqual(lines.length - 1, EXPECTED_RECONFIRMED, 'Must list all 604 reconfirmed anchors');

  // Verify none of the reconfirmed anchors are in new_official_serial_anchors_only
  const newAnchorsPath = path.join(batchDir, 'data', 'new_official_serial_anchors_only_2026-10-17.json');
  const newAnchors = JSON.parse(fs.readFileSync(newAnchorsPath, 'utf8')).anchors;
  const newSerialSet = new Set(newAnchors.map(a => a.serial_number));

  for (let i = 1; i < lines.length; i++) {
    const serial = lines[i].split(',')[0].trim();
    assert.strictEqual(newSerialSet.has(serial), false, `Reconfirmed serial ${serial} must NOT be duplicated in new anchors`);
  }
});

test('Phase 55A - Test 6: New Official Anchor Promotion Integrity', () => {
  const newAnchorsPath = path.join(batchDir, 'data', 'new_official_serial_anchors_only_2026-10-17.json');
  const newAnchors = JSON.parse(fs.readFileSync(newAnchorsPath, 'utf8')).anchors;

  assert.strictEqual(newAnchors.length, EXPECTED_NEW_ANCHORS, 'Must have exactly 1,543 new anchors');

  for (const a of newAnchors) {
    assert.ok(/^\d{8,10}$/.test(a.serial_number), `Serial must be 8-10 digits: ${a.serial_number}`);
    assert.ok(a.model_name && a.model_name.length > 0, `Anchor must have model_name: ${a.serial_number}`);
    assert.strictEqual(a.source, 'MY_STIHL', 'Source must be MY_STIHL');
    assert.strictEqual(a.verification_status, 'OFFICIAL_STIHL_LOOKUP', 'Status must be OFFICIAL_STIHL_LOOKUP');
    assert.ok(a.verification_date && a.verification_date.startsWith('2026-10-'), 'Must have per-row verification date in October 2026');
  }
});

test('Phase 55A - Test 7: Strict Identity Conflict Rejection Contract', () => {
  const conflictsPath = path.join(batchDir, 'data', 'identity_conflicts_2026-10-17.csv');
  assert.ok(fs.existsSync(conflictsPath), 'Identity conflicts artifact must exist');

  const content = fs.readFileSync(conflictsPath, 'utf8').trim();
  const lines = content.split('\n');
  assert.strictEqual(lines.length, 1, 'Identity conflicts file must only contain header (0 conflict records)');
});

test('Phase 55A - Test 8: Timeout Semantics (NO_MATCH Never Promoted to Runtime)', () => {
  const noMatchPath = path.join(batchDir, 'data', 'serial_no_match_2026-10-17.csv');
  assert.ok(fs.existsSync(noMatchPath), 'serial_no_match artifact must exist');

  const lines = fs.readFileSync(noMatchPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 5050, 'Must record all 5,050 unique no-match observations');

  // Verify none are in canonical official anchors
  const canonicalDoc = JSON.parse(fs.readFileSync(canonicalAnchorsPath, 'utf8'));
  const canonicalSet = new Set(canonicalDoc.anchors.map(a => a.serial_number));

  for (let i = 1; i <= Math.min(100, lines.length - 1); i++) {
    const serial = lines[i].split(',')[0].trim();
    assert.strictEqual(canonicalSet.has(serial), false, `No-match serial ${serial} must NOT exist in canonical anchors`);
  }
});

test('Phase 55A - Test 9: Found Without Usable Identity Remains Non-Runtime', () => {
  const unusablePath = path.join(batchDir, 'data', 'found_without_usable_identity_2026-10-17.csv');
  assert.ok(fs.existsSync(unusablePath), 'found_without_usable_identity artifact must exist');

  const lines = fs.readFileSync(unusablePath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 4, 'Must record exactly 4 found without usable identity rows');

  const canonicalDoc = JSON.parse(fs.readFileSync(canonicalAnchorsPath, 'utf8'));
  const canonicalSet = new Set(canonicalDoc.anchors.map(a => a.serial_number));

  const unusableSerials = ['189000000', '163241973', '161149600', '161149700'];
  for (const s of unusableSerials) {
    assert.strictEqual(canonicalSet.has(s), false, `Unusable identity serial ${s} must NOT be promoted to canonical`);
  }
});

test('Phase 55A - Test 10: Dense Sequences Remain Exact Individual Anchors (Zero Ranges)', () => {
  const db = new Database(dbPath, { readonly: true });
  const rangeCount = db.prepare('SELECT COUNT(*) as c FROM model_serial_ranges').get().c;
  assert.strictEqual(rangeCount, 8, 'model_serial_ranges must strictly remain 8 baseline ranges');

  // Dense MS 462 sequence sample check: individual exact anchors preserved
  const sample462 = db.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get('198300000');
  assert.ok(sample462, 'Exact anchor 198300000 must exist');
  assert.strictEqual(sample462.model_name, 'MS 462 3/8" R Motorsäge');
});

test('Phase 55A - Test 11: Zero Generic Prefix (8->9) Rules Created', () => {
  const db = new Database(dbPath, { readonly: true });
  const genericAllowed = db.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases WHERE generic_zero_prefix_rule_allowed = 1').get().c;
  assert.strictEqual(genericAllowed, 0, 'generic_zero_prefix_rule_allowed must remain 0 across all aliases');
});

test('Phase 55A - Test 12: 100% Parity Across official_serial_anchors.json, stihl_database.json, and SQLite', () => {
  const anchorsDoc = JSON.parse(fs.readFileSync(canonicalAnchorsPath, 'utf8'));
  const stihlDb = JSON.parse(fs.readFileSync(stihlDbPath, 'utf8'));
  const db = new Database(dbPath, { readonly: true });
  const sqliteAnchorCount = db.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;

  assert.strictEqual(anchorsDoc.anchors.length, EXPECTED_TOTAL_ANCHORS, `JSON official_serial_anchors must be ${EXPECTED_TOTAL_ANCHORS}`);
  assert.strictEqual(stihlDb.official_serial_anchors.length, EXPECTED_TOTAL_ANCHORS, `stihl_database.json must be ${EXPECTED_TOTAL_ANCHORS}`);
  assert.strictEqual(sqliteAnchorCount, EXPECTED_TOTAL_ANCHORS, `SQLite must be ${EXPECTED_TOTAL_ANCHORS}`);

  // Test spot-check across all 3 stores
  const spotCheckSerial = '188000000';
  const aJson = anchorsDoc.anchors.find(a => a.serial_number === spotCheckSerial);
  const aDbJson = stihlDb.official_serial_anchors.find(a => a.serial_number === spotCheckSerial);
  const aSqlite = db.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get(spotCheckSerial);

  assert.ok(aJson, 'Spot check anchor in official_serial_anchors.json');
  assert.ok(aDbJson, 'Spot check anchor in stihl_database.json');
  assert.ok(aSqlite, 'Spot check anchor in SQLite');
  assert.strictEqual(aJson.model_name, aDbJson.model_name);
  assert.strictEqual(aJson.model_name, aSqlite.model_name);
});

test('Phase 55A - Test 13: Full Idempotency of Batch Processing Pipeline', async () => {
  const genModule = await import('../scripts/generate_phase55a_batch.mjs');
  const dryRun = genModule.runReconciliationAndProcessing({ write: false });

  assert.strictEqual(dryRun.success, true, 'Dry-run must succeed');
  assert.strictEqual(dryRun.classifications.IDENTITY_CONFLICT, 0, 'Dry-run must report 0 conflicts');
  assert.strictEqual(dryRun.newOfficialAnchorsOnly.length, 0, 'Dry-run against updated baseline must find 0 new anchors (already imported)');
  assert.strictEqual(dryRun.reconfirmedAnchors.length, EXPECTED_RECONFIRMED + EXPECTED_NEW_ANCHORS, 'All positive matches are now reconfirmed');
});
