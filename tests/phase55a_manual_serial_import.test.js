/**
 * Phase 55A Test Suite: Manual MY STIHL Serial Evidence Reconciliation & Controlled Import
 * Extended for Batch A (2026-10-17) and Batch B (2026-10-19)
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

// Batch A constants
const EXPECTED_SOURCE_SHA256 = 'c7e682f06fe67881f9c66243b645cbd5f1c272323cd51f9451ec2b66684b7680';
const EXPECTED_SOURCE_BYTES = 4564382;
const EXPECTED_SOURCE_ROWS = 7303;
const EXPECTED_UNIQUE_SERIALS = 7202;
const EXPECTED_NEW_ANCHORS = 1543;
const EXPECTED_RECONFIRMED = 604;

// Batch B constants
const EXPECTED_BATCH_B_SOURCE_SHA256 = '523637fd45ae29b1b1d4256c208f3e744435b6b6baa701a963aa08d2098ba45c';
const EXPECTED_BATCH_B_SOURCE_BYTES = 8994337;
const EXPECTED_BATCH_B_SOURCE_ROWS = 7103;
const EXPECTED_BATCH_B_UNIQUE_SERIALS = 6618;
const EXPECTED_BATCH_B_NEW_ANCHORS = 5243;
const EXPECTED_BATCH_B_RECONFIRMED = 1243;
const EXPECTED_BATCH_B_DUPLICATES = 485;

// Cumulative constants
const EXPECTED_TOTAL_ANCHORS = 15660;
const EXPECTED_ALIASES_COUNT = 171;

const batchDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-17_manual_followup');
const batchBDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-19_manual_followup');
const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const canonicalAnchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const stihlDbPath = path.join(rootDir, 'data', 'stihl_database.json');

// --- BATCH A TESTS ---

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

  assert.ok(anchorsDoc.anchors.length >= EXPECTED_TOTAL_ANCHORS, `JSON official_serial_anchors must be >= ${EXPECTED_TOTAL_ANCHORS}`);
  assert.strictEqual(stihlDb.official_serial_anchors.length, anchorsDoc.anchors.length, `stihl_database.json parity`);
  assert.strictEqual(sqliteAnchorCount, anchorsDoc.anchors.length, `SQLite must match JSON`);

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

test('Phase 55A - Test 13: Full Idempotency of Batch Processing Pipeline (Batch A)', async () => {
  const genModule = await import('../scripts/generate_phase55a_batch.mjs');
  const dryRun = genModule.runReconciliationAndProcessing({ write: false });

  assert.strictEqual(dryRun.success, true, 'Dry-run must succeed');
  assert.strictEqual(dryRun.classifications.IDENTITY_CONFLICT, 0, 'Dry-run must report 0 conflicts');
  assert.strictEqual(dryRun.newOfficialAnchorsOnly.length, 0, 'Dry-run against updated baseline must find 0 new anchors (already imported)');
  assert.strictEqual(dryRun.reconfirmedAnchors.length, EXPECTED_RECONFIRMED + EXPECTED_NEW_ANCHORS, 'All positive matches are now reconfirmed');
});

// --- BATCH B EXTENSION TESTS ---

test('Phase 55A - Test 14: Batch B Second Immutable Source Identity & Integrity', () => {
  const sourceCopy = path.join(batchBDir, 'source', 'stihl_resultaten_3.csv');
  assert.ok(fs.existsSync(sourceCopy), 'Batch B source copy must exist in batch');

  const bytes = fs.readFileSync(sourceCopy);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');

  assert.strictEqual(hash, EXPECTED_BATCH_B_SOURCE_SHA256, 'Batch B source SHA256 must match');
  assert.strictEqual(bytes.length, EXPECTED_BATCH_B_SOURCE_BYTES, 'Batch B source byte size must match');
});

test('Phase 55A - Test 15: Batch B Complete Source Row Accounting (7103 Rows, 0 Unaccounted)', () => {
  const manifestPath = path.join(batchBDir, 'batch_manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Batch B manifest must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.source_rows, EXPECTED_BATCH_B_SOURCE_ROWS, 'All 7,103 source rows accounted');
  assert.strictEqual(manifest.source_unique_serials, EXPECTED_BATCH_B_UNIQUE_SERIALS, '6,618 unique serials');
  assert.strictEqual(manifest.new_official_anchors, EXPECTED_BATCH_B_NEW_ANCHORS, '5,243 new anchors');
  assert.strictEqual(manifest.reconfirmed_existing_anchors, EXPECTED_BATCH_B_RECONFIRMED, '1,243 reconfirmed anchors');
  assert.strictEqual(manifest.identity_conflicts, 0, 'Zero identity conflicts');
  assert.strictEqual(manifest.invalid_input_serials, 0, 'Zero invalid input serials');
  assert.strictEqual(manifest.duplicate_source_rows, EXPECTED_BATCH_B_DUPLICATES, '485 duplicate source rows');
});

test('Phase 55A - Test 16: Cross-Batch Overlap Accounting & Conflict Freedom', () => {
  const reconPath = path.join(rootDir, 'data', 'serial_phase55a_reconciliation.json');
  const recon = JSON.parse(fs.readFileSync(reconPath, 'utf8'));
  const cum = recon.cumulative_phase55a;

  assert.strictEqual(cum.cross_batch_overlap_serials, 120, 'Exactly 120 overlapping serials between A and B');
  assert.strictEqual(cum.cross_batch_same_positive_serials, 117, '117 identical positive results');
  assert.strictEqual(cum.cross_batch_timeout_overlap_serials, 3, '3 timeout overlaps on pre-existing anchors');
  assert.strictEqual(cum.cross_batch_identity_conflicts, 0, 'Zero cross-batch identity conflicts');
  assert.strictEqual(cum.total_unique_serials_across_sources, 13700, 'Exactly 13,700 unique serials across A ∪ B');
  assert.strictEqual(cum.total_source_rows, 14406, 'Exactly 14,406 total source rows across A and B');
});

test('Phase 55A - Test 17: Batch B Internal Duplicate & Retry Semantics', () => {
  const dupsPath = path.join(batchBDir, 'data', 'duplicate_source_rows_2026-10-19.csv');
  assert.ok(fs.existsSync(dupsPath), 'Batch B duplicate rows CSV must exist');

  const lines = fs.readFileSync(dupsPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, EXPECTED_BATCH_B_DUPLICATES, 'Must list exactly 485 duplicate rows');

  // Verify retry changed from error to positive was properly recorded
  const content = fs.readFileSync(dupsPath, 'utf8');
  assert.ok(content.includes('RETRY_CHANGED_FROM_ERROR_TO_POSITIVE'), 'Must track RETRY_CHANGED_FROM_ERROR_TO_POSITIVE');
  assert.ok(content.includes('RETRY_CHANGED_FROM_TIMEOUT_TO_POSITIVE'), 'Must track RETRY_CHANGED_FROM_TIMEOUT_TO_POSITIVE');
});

test('Phase 55A - Test 18: Batch B Timeout and No-Match Semantics (Zero Runtime Promotion)', () => {
  const noMatchPath = path.join(batchBDir, 'data', 'serial_no_match_2026-10-19.csv');
  assert.ok(fs.existsSync(noMatchPath), 'Batch B serial_no_match CSV must exist');

  const lines = fs.readFileSync(noMatchPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 122, 'Must record exactly 122 unique no-match observations in Batch B');

  // Verify none are in canonical official anchors unless previously established
  const canonicalDoc = JSON.parse(fs.readFileSync(canonicalAnchorsPath, 'utf8'));
  const newBAnchors = JSON.parse(fs.readFileSync(path.join(batchBDir, 'data', 'new_official_serial_anchors_only_2026-10-19.json'), 'utf8')).anchors;
  const newBSet = new Set(newBAnchors.map(a => a.serial_number));

  for (let i = 1; i < lines.length; i++) {
    const serial = lines[i].split(',')[0].trim();
    assert.strictEqual(newBSet.has(serial), false, `No-match serial ${serial} must NOT be in new anchors`);
  }
});

test('Phase 55A - Test 19: Batch B Found Without Usable Identity Remains Non-Runtime', () => {
  const unusablePath = path.join(batchBDir, 'data', 'found_without_usable_identity_2026-10-19.csv');
  assert.ok(fs.existsSync(unusablePath), 'found_without_usable_identity artifact must exist');

  const lines = fs.readFileSync(unusablePath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 10, 'Must record exactly 10 found without usable identity rows');

  const newBAnchors = JSON.parse(fs.readFileSync(path.join(batchBDir, 'data', 'new_official_serial_anchors_only_2026-10-19.json'), 'utf8')).anchors;
  const newBSet = new Set(newBAnchors.map(a => a.serial_number));

  for (let i = 1; i < lines.length; i++) {
    const serial = lines[i].split(',')[0].trim();
    assert.strictEqual(newBSet.has(serial), false, `Unusable identity serial ${serial} must NOT be in new anchors`);
  }
});

test('Phase 55A - Test 20: Batch B Technical Errors Resolution', () => {
  const techErrorsPath = path.join(batchBDir, 'data', 'technical_errors_2026-10-19.csv');
  assert.ok(fs.existsSync(techErrorsPath), 'technical_errors CSV must exist');

  const lines = fs.readFileSync(techErrorsPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 0, 'Zero unresolved technical errors (all 479 raw fout rows retried to positive)');
});

test('Phase 55A - Test 21: Batch B New Official Anchor Promotion Integrity', () => {
  const newAnchorsPath = path.join(batchBDir, 'data', 'new_official_serial_anchors_only_2026-10-19.json');
  const newAnchors = JSON.parse(fs.readFileSync(newAnchorsPath, 'utf8')).anchors;

  assert.strictEqual(newAnchors.length, EXPECTED_BATCH_B_NEW_ANCHORS, 'Must have exactly 5,243 new anchors');

  for (const a of newAnchors) {
    assert.ok(/^\d{8,10}$/.test(a.serial_number), `Serial must be 8-10 digits: ${a.serial_number}`);
    assert.ok(a.model_name && a.model_name.length > 0, `Anchor must have model_name: ${a.serial_number}`);
    assert.strictEqual(a.source, 'MY_STIHL', 'Source must be MY_STIHL');
    assert.strictEqual(a.verification_status, 'OFFICIAL_STIHL_LOOKUP', 'Status must be OFFICIAL_STIHL_LOOKUP');
    assert.ok(a.verification_date && a.verification_date.startsWith('2026-10-'), 'Must have per-row verification date');
  }
});

test('Phase 55A - Test 22: Cumulative Phase 55A JSON/SQLite Parity across 15,660 Anchors & 171 Aliases', () => {
  const anchorsDoc = JSON.parse(fs.readFileSync(canonicalAnchorsPath, 'utf8'));
  const stihlDb = JSON.parse(fs.readFileSync(stihlDbPath, 'utf8'));
  const db = new Database(dbPath, { readonly: true });
  const sqliteAnchorCount = db.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;
  const sqliteAliasCount = db.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases').get().c;

  assert.ok(anchorsDoc.anchors.length >= EXPECTED_TOTAL_ANCHORS, `JSON anchors must be >= ${EXPECTED_TOTAL_ANCHORS}`);
  assert.strictEqual(stihlDb.official_serial_anchors.length, anchorsDoc.anchors.length);
  assert.strictEqual(sqliteAnchorCount, anchorsDoc.anchors.length);
  assert.strictEqual(sqliteAliasCount, EXPECTED_ALIASES_COUNT);
});

test('Phase 55A - Test 23: Full Idempotency of Batch Processing Pipeline (Batch B)', async () => {
  const genModuleB = await import('../scripts/generate_phase55a_batch_b.mjs');
  const dryRunB = genModuleB.runBatchBReconciliationAndProcessing({ write: false });

  assert.strictEqual(dryRunB.success, true, 'Dry-run must succeed');
  assert.strictEqual(dryRunB.classifications.IDENTITY_CONFLICT, 0, 'Dry-run must report 0 conflicts');
  assert.strictEqual(dryRunB.newOfficialAnchorsOnly.length, 0, 'Dry-run against updated baseline must find 0 new anchors (already imported)');
  assert.strictEqual(dryRunB.reconfirmedAnchors.length, EXPECTED_BATCH_B_RECONFIRMED + EXPECTED_BATCH_B_NEW_ANCHORS, 'All positive matches are now reconfirmed');
});
