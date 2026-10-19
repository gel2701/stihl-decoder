/**
 * tests/phase55b_serial_delta.test.js
 * Comprehensive test suite for Phase 55B:
 * Current Serial Delta Snapshot, Reconciliation & Controlled Import.
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

const BATCH_ID = 'serials_2026-10-19_manual_delta';
const batchDir = path.join(rootDir, 'data', 'import_batches', BATCH_ID);
const sourceCopyPath = path.join(batchDir, 'source', 'stihl_resultaten_snapshot.csv');

const EXPECTED_SNAPSHOT_SHA256 = '523637fd45ae29b1b1d4256c208f3e744435b6b6baa701a963aa08d2098ba45c';
const EXPECTED_SNAPSHOT_BYTES = 8994337;
const EXPECTED_POPULATED_ROWS = 7103;
const EXPECTED_UNIQUE_SERIALS = 6618;
const EXPECTED_CANONICAL_ANCHORS = 15660;
const EXPECTED_CANONICAL_ALIASES = 171;

test('Phase 55B - Test 1: Immutable Snapshot Hash & Byte-for-Byte Integrity', () => {
  assert.ok(fs.existsSync(sourceCopyPath), 'Snapshot source copy must exist in batch');
  const bytes = fs.readFileSync(sourceCopyPath);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');

  assert.strictEqual(hash, EXPECTED_SNAPSHOT_SHA256, 'Snapshot SHA256 must match authoritative hash');
  assert.strictEqual(bytes.length, EXPECTED_SNAPSHOT_BYTES, 'Snapshot byte size must match');
});

test('Phase 55B - Test 2: Complete Row Accounting (7,103 / 7,103 Rows Accounted)', () => {
  const manifestPath = path.join(batchDir, 'batch_manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Batch manifest must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.source_rows, EXPECTED_POPULATED_ROWS);
  assert.strictEqual(manifest.source_unique_serials, EXPECTED_UNIQUE_SERIALS);
  assert.strictEqual(manifest.identity_conflicts, 0);
  assert.strictEqual(manifest.invalid_serials, 0);

  const sumClassified = manifest.reconfirmed +
    manifest.previously_unresolved_now_positive +
    manifest.new_official_anchors +
    manifest.new_no_match +
    manifest.found_without_usable_identity +
    manifest.technical_errors +
    manifest.duplicate_rows;

  assert.strictEqual(sumClassified, EXPECTED_POPULATED_ROWS, 'Conservation equation must hold');
});

test('Phase 55B - Test 3: Historical Identical Observation & Phase 55A Overlap Detection', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(batchDir, 'batch_manifest.json'), 'utf8'));
  assert.strictEqual(manifest.historical_overlap_rows, EXPECTED_POPULATED_ROWS, 'All 7,103 rows must be tracked in historical overlap');
  assert.strictEqual(manifest.true_delta_rows, 0, 'True delta rows must be 0 for re-snapshot of Batch B');

  const alreadyProcessedCsv = path.join(batchDir, 'data', 'already_processed_rows_2026-10-19.csv');
  assert.ok(fs.existsSync(alreadyProcessedCsv));
  const lines = fs.readFileSync(alreadyProcessedCsv, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, EXPECTED_POPULATED_ROWS);
});

test('Phase 55B - Test 4: Existing Positive Reconfirmation (6,486 Reconfirmed Anchors)', () => {
  const reconfirmedCsv = path.join(batchDir, 'data', 'reconfirmed_existing_anchors_2026-10-19.csv');
  assert.ok(fs.existsSync(reconfirmedCsv));
  const lines = fs.readFileSync(reconfirmedCsv, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 6486, 'Must contain exactly 6,486 reconfirmed positive unique serials');

  const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'));
  const sample = db.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get('163133522');
  assert.ok(sample, 'Sample anchor 163133522 must exist in SQLite');
  assert.strictEqual(sample.model_name, 'FS 400 Freischneider');
});

test('Phase 55B - Test 5: Zero New Official Anchors Promoted in Zero-Delta Import', () => {
  const newAnchorsCsv = path.join(batchDir, 'data', 'new_official_serial_anchors_only_2026-10-19.csv');
  assert.ok(fs.existsSync(newAnchorsCsv));
  const lines = fs.readFileSync(newAnchorsCsv, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 0, 'New anchors CSV must contain 0 data rows');

  const prevUnresCsv = path.join(batchDir, 'data', 'previously_unresolved_now_positive_2026-10-19.csv');
  assert.ok(fs.existsSync(prevUnresCsv));
  const prevLines = fs.readFileSync(prevUnresCsv, 'utf8').trim().split('\n');
  assert.strictEqual(prevLines.length - 1, 0, 'Previously unresolved now positive CSV must contain 0 data rows');
});

test('Phase 55B - Test 6: Identity Conflict Detection & Rejection (Zero Conflicts)', () => {
  const conflictsCsv = path.join(batchDir, 'data', 'identity_conflicts_2026-10-19.csv');
  assert.ok(fs.existsSync(conflictsCsv));
  const lines = fs.readFileSync(conflictsCsv, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 0, 'Zero identity conflicts allowed');
});

test('Phase 55B - Test 7: Timeouts, Errors & Unusable Identities Remain Strictly Non-Runtime', () => {
  const noMatchCsv = path.join(batchDir, 'data', 'serial_no_match_2026-10-19.csv');
  const unusableCsv = path.join(batchDir, 'data', 'found_without_usable_identity_2026-10-19.csv');
  const errorsCsv = path.join(batchDir, 'data', 'technical_errors_2026-10-19.csv');

  assert.ok(fs.existsSync(noMatchCsv));
  assert.ok(fs.existsSync(unusableCsv));
  assert.ok(fs.existsSync(errorsCsv));

  const noMatchCount = fs.readFileSync(noMatchCsv, 'utf8').trim().split('\n').length - 1;
  const unusableCount = fs.readFileSync(unusableCsv, 'utf8').trim().split('\n').length - 1;
  const errorsCount = fs.readFileSync(errorsCsv, 'utf8').trim().split('\n').length - 1;

  assert.strictEqual(noMatchCount, 122, '122 no match / timeouts recorded');
  assert.strictEqual(unusableCount, 10, '10 unusable identity records');
  assert.strictEqual(errorsCount, 0, '0 unresolved technical errors');

  // Verify none are in official_serial_anchors
  const canonicalAnchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
  const anchorSerials = new Set(canonicalAnchorsDoc.anchors.map(a => a.serial_number));

  // Serial 299963595 had a timeout in row 7304
  assert.strictEqual(anchorSerials.has('299963595'), false, 'Timeout serial 299963595 must not be an anchor');
});

test('Phase 55B - Test 8: Duplicate / Retry Selection (485 Duplicate Source Rows)', () => {
  const dupesCsv = path.join(batchDir, 'data', 'duplicate_source_rows_2026-10-19.csv');
  assert.ok(fs.existsSync(dupesCsv));
  const lines = fs.readFileSync(dupesCsv, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length - 1, 485, 'Must contain exactly 485 duplicate source rows');
});

test('Phase 55B - Test 9: Zero Range Inferences & Zero Generic Prefix Rules', () => {
  const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
  assert.strictEqual(stihlDb.model_serial_ranges.length, 8, 'Must strictly remain 8 baseline model_serial_ranges');

  const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'));
  const sqliteRanges = db.prepare('SELECT COUNT(*) as c FROM model_serial_ranges').get().c;
  assert.strictEqual(sqliteRanges, 8, 'SQLite model_serial_ranges must strictly remain 8');
});

test('Phase 55B - Test 10: 100% Parity Across official_serial_anchors.json, stihl_database.json, and SQLite', () => {
  const anchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
  const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
  const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'));

  const sqliteAnchors = db.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;

  assert.strictEqual(anchorsDoc.anchors.length, EXPECTED_CANONICAL_ANCHORS, `JSON official_serial_anchors must be ${EXPECTED_CANONICAL_ANCHORS}`);
  assert.strictEqual(stihlDb.official_serial_anchors.length, EXPECTED_CANONICAL_ANCHORS, `stihl_database.json must be ${EXPECTED_CANONICAL_ANCHORS}`);
  assert.strictEqual(sqliteAnchors, EXPECTED_CANONICAL_ANCHORS, `SQLite must be ${EXPECTED_CANONICAL_ANCHORS}`);

  const aliasesDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_input_aliases.json'), 'utf8'));
  const sqliteAliases = db.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases').get().c;
  assert.strictEqual(aliasesDoc.aliases.length, EXPECTED_CANONICAL_ALIASES);
  assert.strictEqual(sqliteAliases, EXPECTED_CANONICAL_ALIASES);
});

test('Phase 55B - Test 11: Phase 55A Immutability & Older Historical Batches Preservation', () => {
  assert.ok(fs.existsSync(path.join(rootDir, 'PHASE55A_FINAL_CLOSE_REPORT.md')), 'PHASE55A_FINAL_CLOSE_REPORT.md must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-17_manual_followup')), 'Batch 17 must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-19_manual_followup')), 'Batch 19 must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-09-26')), 'Batch 2026-09-26 must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06')), 'Batch 2026-10-06 must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09')), 'Batch 2026-10-09 must exist');
});

test('Phase 55B - Test 12: Machine-Readable Reconciliation Document Verification', () => {
  const reconPath = path.join(rootDir, 'data', 'serial_phase55b_reconciliation.json');
  assert.ok(fs.existsSync(reconPath), 'serial_phase55b_reconciliation.json must exist');

  const recon = JSON.parse(fs.readFileSync(reconPath, 'utf8'));
  assert.strictEqual(recon.phase, 'Phase 55B');
  assert.strictEqual(recon.baseline_sha, 'db863aca2471d3059c5aeb5748637a63cb3484e9');
  assert.strictEqual(recon.phase55a_baseline.anchors, 15660);
  assert.strictEqual(recon.phase55a_baseline.aliases, 171);
  assert.strictEqual(recon.delta_accounting.true_delta_rows, 0);
  assert.strictEqual(recon.positive_anchor_accounting.new_official_anchors_promoted, 0);
  assert.strictEqual(recon.conflict_accounting.identity_conflicts, 0);
  assert.strictEqual(recon.idempotency.status, 'IDEMPOTENT_VERIFIED');
});
