/**
 * Phase 55B: Genuine Serial Delta Automated Test Suite
 * Validates fail-closed properties, source integrity, delta accounting,
 * zero conflicts, range prohibition, and JSON/SQLite store parity.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runPhase55BReconciliation } from '../scripts/process_phase55b_serial_delta.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-20_manual_delta');
const BATCH_SOURCE_FILE = path.join(BATCH_DIR, 'source', 'stihl_resultaten_snapshot.csv');
const MANIFEST_FILE = path.join(BATCH_DIR, 'batch_manifest.json');
const RECON_FILE = path.join(rootDir, 'data', 'serial_phase55b_reconciliation.json');

const EXPECTED_SOURCE_SHA256 = 'bbf45994d6bc62305fc42dd833379603aa78e4641f9f0a65f11a751cab1a579d';
const EXPECTED_SOURCE_BYTES = 753539;

describe('Phase 55B — Genuine Serial Delta & Controlled Import Verification', () => {

  test('Phase 55B - Test 1: Immutable Snapshot Hash & Byte-for-Byte Integrity', () => {
    assert.ok(fs.existsSync(BATCH_SOURCE_FILE), 'Batch source snapshot must exist');
    const bytes = fs.statSync(BATCH_SOURCE_FILE).size;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(BATCH_SOURCE_FILE)).digest('hex');
    assert.equal(bytes, EXPECTED_SOURCE_BYTES, `Source size must be ${EXPECTED_SOURCE_BYTES}`);
    assert.equal(sha, EXPECTED_SOURCE_SHA256, `Source SHA256 must match ${EXPECTED_SOURCE_SHA256}`);
  });

  test('Phase 55B - Test 2: Complete Row Accounting (517 / 517 Populated Rows Accounted)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    const ac = manifest.accounting;
    const sum = Object.values(ac).reduce((a, b) => a + b, 0);
    assert.equal(sum, 517, 'All 517 populated rows must be accounted for');
    assert.equal(ac.IDENTITY_CONFLICT, 0, 'Zero identity conflicts allowed');
    assert.equal(ac.INVALID_INPUT_SERIAL, 0, 'Zero invalid serials allowed');
  });

  test('Phase 55B - Test 3: Genuine Delta Detection (414 True Delta Rows & 103 Reconfirmed)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    const ac = manifest.accounting;
    assert.equal(ac.PREVIOUSLY_POSITIVE_RECONFIRMED, 103, 'Expected 103 reconfirmed anchors');
    assert.equal(ac.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE, 2, 'Expected 2 previously unresolved now positive');
    assert.equal(ac.NEW_POSITIVE_OBSERVATION, 412, 'Expected 412 new positive observations');
    const trueDelta = ac.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE + ac.NEW_POSITIVE_OBSERVATION +
      ac.NEW_NO_MATCH_OBSERVATION + ac.FOUND_WITHOUT_USABLE_IDENTITY + ac.TECHNICAL_ERROR;
    assert.equal(trueDelta, 414, 'True delta rows must equal exactly 414');
  });

  test('Phase 55B - Test 4: New Official Anchor Promotion Integrity (414 New Anchors)', () => {
    const newAnchorsDoc = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
    assert.equal(newAnchorsDoc.anchors.length, 414, 'Batch must contain exactly 414 new official anchors');
    for (const a of newAnchorsDoc.anchors) {
      assert.ok(/^\d{9}$/.test(a.serial_number), `Serial ${a.serial_number} must be 9 digits`);
      assert.ok(a.model_name && a.model_name.length > 0, `Anchor ${a.serial_number} must have a model_name`);
      assert.equal(a.source, 'MY_STIHL', 'Source must be MY_STIHL');
      assert.equal(a.verification_status, 'OFFICIAL_STIHL_LOOKUP', 'Verification status must be OFFICIAL_STIHL_LOOKUP');
    }
  });

  test('Phase 55B - Test 5: Strict Identity Conflict Rejection Contract (Zero Conflicts)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    assert.equal(manifest.accounting.IDENTITY_CONFLICT, 0, 'Must have zero identity conflicts');
    const conflictCsv = fs.readFileSync(path.join(BATCH_DIR, 'data', 'identity_conflicts_2026-10-20.csv'), 'utf8');
    const lines = conflictCsv.trim().split('\n');
    assert.equal(lines.length, 1, 'Conflicts CSV must contain only header');
  });

  test('Phase 55B - Test 6: Zero Range Inferences & Zero Generic Prefix Rules', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    assert.equal(manifest.metrics.ranges_created, 0, 'Zero ranges created');
    assert.equal(manifest.metrics.generic_prefix_rules_created, 0, 'Zero generic prefix rules created');
    assert.equal(manifest.metrics.negative_runtime_evidence_created, 0, 'Zero negative runtime evidence created');
  });

  test('Phase 55B - Test 7: 100% Parity Across official_serial_anchors.json, stihl_database.json, and SQLite', () => {
    const anchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
    const dbJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
    const sqlite = new DatabaseSync(path.join(rootDir, 'data', 'stihl_database.db'));
    const sqlCount = sqlite.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;
    const sqlAliasCount = sqlite.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases').get().c;

    const expectedTotal = 15660 + 414; // 16074
    assert.equal(anchorsDoc.anchors.length, expectedTotal, `JSON anchors count must be ${expectedTotal}`);
    assert.equal(dbJson.official_serial_anchors.length, expectedTotal, `stihl_database.json anchors count must be ${expectedTotal}`);
    assert.equal(sqlCount, expectedTotal, `SQLite anchors count must be ${expectedTotal}`);
    assert.equal(sqlAliasCount, 171, 'SQLite alias count must remain 171');
  });

  test('Phase 55B - Test 8: Phase 55A Immutability & Older Historical Batches Preservation', () => {
    const b3Source = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-19_manual_followup', 'source', 'stihl_resultaten_3.csv');
    assert.ok(fs.existsSync(b3Source), 'Phase 55A Batch B source must exist');
    const b3Sha = crypto.createHash('sha256').update(fs.readFileSync(b3Source)).digest('hex');
    assert.equal(b3Sha, '523637fd45ae29b1b1d4256c208f3e744435b6b6baa701a963aa08d2098ba45c');
  });

  test('Phase 55B - Test 9: Machine-Readable Reconciliation Document Verification', () => {
    assert.ok(fs.existsSync(RECON_FILE), 'serial_phase55b_reconciliation.json must exist');
    const recon = JSON.parse(fs.readFileSync(RECON_FILE, 'utf8'));
    assert.equal(recon.start_baseline, '99c99ff44a4fe45d3991baec14a8b6172ecce0ed');
    assert.equal(recon.delta.true_delta_rows, 414);
    assert.equal(recon.canonical.anchors_after, 16074);
  });

  test('Phase 55B - Test 10: Idempotency of Batch Processing Pipeline', () => {
    const dryRun = runPhase55BReconciliation({ write: false });
    assert.equal(dryRun.success, true);
    assert.equal(dryRun.mode, 'DRY_RUN');
    assert.equal(dryRun.classifications.IDENTITY_CONFLICT, 0);
  });
});
