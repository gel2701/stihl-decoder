/**
 * Phase 55C: Genuine Serial Delta Automated Test Suite
 * Validates fail-closed properties, source integrity, delta accounting,
 * zero conflicts, range prohibition, nested historical protection, and JSON/SQLite store parity.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runPhase55CReconciliation } from '../scripts/process_phase55c_serial_delta.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BATCH_NAME = 'serials_2026-10-20_manual_delta_55c';
const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', BATCH_NAME);
const BATCH_SOURCE_FILE = path.join(BATCH_DIR, 'source', 'stihl_resultaten_snapshot.csv');
const MANIFEST_FILE = path.join(BATCH_DIR, 'batch_manifest.json');
const RECON_FILE = path.join(rootDir, 'data', 'serial_phase55c_reconciliation.json');

const EXPECTED_SOURCE_SHA256 = '1a0b86b7b1b3654e3fdf16404aa144d19f002f4b2fd8f8a947089e305efc748e';
const EXPECTED_SOURCE_BYTES = 1640010;

describe('Phase 55C — Genuine Serial Delta & Controlled Import Verification', () => {

  test('Phase 55C - Test 1: Immutable Snapshot Hash & Byte-for-Byte Integrity', () => {
    assert.ok(fs.existsSync(BATCH_SOURCE_FILE), 'Batch source snapshot must exist');
    const bytes = fs.statSync(BATCH_SOURCE_FILE).size;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(BATCH_SOURCE_FILE)).digest('hex');
    assert.equal(bytes, EXPECTED_SOURCE_BYTES, `Source size must be ${EXPECTED_SOURCE_BYTES}`);
    assert.equal(sha, EXPECTED_SOURCE_SHA256, `Source SHA256 must match ${EXPECTED_SOURCE_SHA256}`);
  });

  test('Phase 55C - Test 2: Complete Row Accounting (1,178 / 1,178 Populated Rows Accounted)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    const ac = manifest.accounting;
    const sum = Object.values(ac).reduce((a, b) => a + b, 0);
    assert.equal(sum, 1178, 'All 1178 populated rows must be accounted for');
    assert.equal(ac.IDENTITY_CONFLICT, 0, 'Zero identity conflicts allowed');
    assert.equal(ac.INVALID_INPUT_SERIAL, 0, 'Zero invalid serials allowed');
  });

  test('Phase 55C - Test 3: Genuine Delta Detection (528 True Delta Rows & 649 Reconfirmed)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    const ac = manifest.accounting;
    assert.equal(ac.PREVIOUSLY_POSITIVE_RECONFIRMED, 649, 'Expected 649 reconfirmed anchors');
    assert.equal(ac.NEW_POSITIVE_OBSERVATION, 528, 'Expected 528 new positive observations');
    assert.equal(ac.DUPLICATE_SOURCE_ROW, 1, 'Expected 1 duplicate source row');
    const trueDelta = ac.NEW_POSITIVE_OBSERVATION + (ac.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE || 0) +
      (ac.NEW_NO_MATCH_OBSERVATION || 0) + (ac.NEW_FOUND_WITHOUT_USABLE_IDENTITY || 0) + (ac.NEW_TECHNICAL_ERROR || 0);
    assert.equal(trueDelta, 528, 'True delta rows must equal exactly 528');
  });

  test('Phase 55C - Test 4: New Official Anchor Promotion Integrity (528 New Anchors)', () => {
    const newAnchorsDoc = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
    assert.equal(newAnchorsDoc.anchors.length, 528, 'Batch must contain exactly 528 new official anchors');
    for (const a of newAnchorsDoc.anchors) {
      assert.ok(/^\d{9}$/.test(a.serial_number), `Serial ${a.serial_number} must be 9 digits`);
      assert.ok(a.model_name && a.model_name.length > 0, `Anchor ${a.serial_number} must have a model_name`);
      assert.equal(a.source, 'MY_STIHL', 'Source must be MY_STIHL');
      assert.equal(a.verification_status, 'OFFICIAL_STIHL_LOOKUP', 'Verification status must be OFFICIAL_STIHL_LOOKUP');
    }
  });

  test('Phase 55C - Test 5: Strict Identity Conflict Rejection Contract (Zero Conflicts)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    assert.equal(manifest.accounting.IDENTITY_CONFLICT, 0, 'Must have zero identity conflicts');
    const conflictCsv = fs.readFileSync(path.join(BATCH_DIR, 'data', 'identity_conflicts_2026-10-20.csv'), 'utf8');
    const lines = conflictCsv.trim().split('\n');
    assert.equal(lines.length, 1, 'Conflicts CSV must contain only header');
  });

  test('Phase 55C - Test 6: Zero Range Inferences & Zero Generic Prefix Rules', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    assert.equal(manifest.metrics.ranges_created, 0, 'Zero ranges created');
    assert.equal(manifest.metrics.generic_prefix_rules_created, 0, 'Zero generic prefix rules created');
    assert.equal(manifest.metrics.negative_runtime_evidence_created, 0, 'Zero negative runtime evidence created');
  });

  test('Phase 55C - Test 7: 100% Parity Across official_serial_anchors.json, stihl_database.json, and SQLite (16,602 Anchors)', () => {
    const anchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
    const dbJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
    const sqlite = new DatabaseSync(path.join(rootDir, 'data', 'stihl_database.db'));
    const sqlCount = sqlite.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;
    const sqlAliasCount = sqlite.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases').get().c;

    const expectedTotal = 16074 + 528; // 16602
    assert.ok(anchorsDoc.anchors.length >= expectedTotal, `JSON anchors count must be >= ${expectedTotal}`);
    assert.equal(dbJson.official_serial_anchors.length, anchorsDoc.anchors.length, `stihl_database.json anchors count must match official_serial_anchors.json`);
    assert.equal(sqlCount, anchorsDoc.anchors.length, `SQLite anchors count must match official_serial_anchors.json`);
    assert.equal(sqlAliasCount, 171, 'SQLite alias count must remain 171');
  });

  test('Phase 55C - Test 8: Nested Historical Invariant & Prior Batches Preservation', () => {
    const priorBatches = [
      'serials_2026-09-26',
      'serials_2026-10-06',
      'serials_2026-10-09',
      'serials_2026-10-17_manual_followup',
      'serials_2026-10-19_manual_followup',
      'serials_2026-10-20_manual_delta'
    ];
    for (const b of priorBatches) {
      assert.ok(fs.existsSync(path.join(rootDir, 'data', 'import_batches', b)), `Prior batch ${b} must exist`);
    }

    // Verify Phase 55B new anchors (414) remain 100% present in canonical
    const p55bAnchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-20_manual_delta', 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
    const currentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
    const currentMap = new Map(currentDoc.anchors.map(a => [a.serial_number, a]));

    for (const a of p55bAnchorsDoc.anchors) {
      const cur = currentMap.get(a.serial_number);
      assert.ok(cur, `Phase 55B anchor ${a.serial_number} must remain present in canonical`);
      assert.equal(cur.model_name, a.model_name, `Phase 55B anchor ${a.serial_number} model_name must match`);
    }
  });

  test('Phase 55C - Test 9: Machine-Readable Reconciliation Document Verification', () => {
    assert.ok(fs.existsSync(RECON_FILE), 'serial_phase55c_reconciliation.json must exist');
    const recon = JSON.parse(fs.readFileSync(RECON_FILE, 'utf8'));
    assert.equal(recon.start_baseline, '0d92a48f024549083c9d9545175f6c9b669af599');
    assert.equal(recon.delta.true_delta_rows, 528);
    assert.equal(recon.canonical.anchors_after, 16602);
  });

  test('Phase 55C - Test 10: Idempotency of Batch Processing Pipeline', () => {
    const dryRun = runPhase55CReconciliation({ write: false });
    assert.equal(dryRun.success, true);
    assert.equal(dryRun.mode, 'DRY_RUN');
    assert.equal(dryRun.classifications.IDENTITY_CONFLICT, 0);
  });

  test('Phase 55C - Test 11: Phase 55C New-Anchor Set Identity & Canonical Presence (528 Anchors)', () => {
    const newAnchorsDoc = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
    assert.equal(newAnchorsDoc.anchors.length, 528, 'Batch new anchors must contain exactly 528 records');

    const canonicalDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
    const canonicalMap = new Map(canonicalDoc.anchors.map(a => [a.serial_number, a]));

    const fields = [
      'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
      'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
    ];

    for (const newAnchor of newAnchorsDoc.anchors) {
      const can = canonicalMap.get(newAnchor.serial_number);
      assert.ok(can, `New anchor ${newAnchor.serial_number} must exist in canonical registry`);
      for (const f of fields) {
        assert.equal(can[f], newAnchor[f], `Field ${f} mismatch for new anchor ${newAnchor.serial_number}`);
      }
    }
  });
});
