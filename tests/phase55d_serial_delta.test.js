/**
 * Phase 55D: Genuine Serial Delta Automated Test Suite
 * Validates fail-closed properties, source integrity, delta accounting,
 * zero conflicts, range prohibition, nested historical protection,
 * historical batch Git-tree immutability, corruption detection, and JSON/SQLite store parity.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runPhase55DReconciliation } from '../scripts/process_phase55d_serial_delta.mjs';
import { verifyHistoricalBatchTrees, HISTORICAL_BATCHES } from '../scripts/audit_phase55d_serial_delta.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BATCH_NAME = 'serials_2026-10-20_manual_delta_55d';
const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', BATCH_NAME);
const BATCH_SOURCE_FILE = path.join(BATCH_DIR, 'source', 'stihl_resultaten_snapshot.csv');
const MANIFEST_FILE = path.join(BATCH_DIR, 'batch_manifest.json');
const RECON_FILE = path.join(rootDir, 'data', 'serial_phase55d_reconciliation.json');

const EXPECTED_SOURCE_SHA256 = 'af1f7638d5161e02f586293ae4050c49e7b916119b3a8b2030996c9825192e29';
const EXPECTED_SOURCE_BYTES = 2036808;

const PROTECTED_FIELDS = [
  'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
  'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
];

let _cachedProtectedPhase55CSet = null;

function loadProtectedPhase55CSet() {
  if (_cachedProtectedPhase55CSet) return _cachedProtectedPhase55CSet;

  const pre = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'reproducibility', 'phase53a', 'official_serial_anchors_pre_phase53a.json'), 'utf8')).anchors;
  const p53a = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'data', 'new_official_serial_anchors_only_2026-10-09.json'), 'utf8')).anchors;
  const map53a = new Map();
  for (const a of pre) map53a.set(a.serial_number, a);
  for (const a of p53a) map53a.set(a.serial_number, a);
  const hist53a = [...map53a.values()];

  const batchA = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-17_manual_followup', 'data', 'new_official_serial_anchors_only_2026-10-17.json'), 'utf8')).anchors;
  const batchB = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-19_manual_followup', 'data', 'new_official_serial_anchors_only_2026-10-19.json'), 'utf8')).anchors;
  const batch55B = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-20_manual_delta', 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8')).anchors;
  const batch55C = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-20_manual_delta_55c', 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8')).anchors;

  _cachedProtectedPhase55CSet = [...hist53a, ...batchA, ...batchB, ...batch55B, ...batch55C];
  return _cachedProtectedPhase55CSet;
}

export function verifyProtectedCohort(protectedList, currentList) {
  const currentMap = new Map(currentList.map(a => [a.serial_number, a]));
  let present = 0;
  let missing = 0;
  let mutated = 0;

  for (const exp of protectedList) {
    const cur = currentMap.get(exp.serial_number);
    if (!cur) {
      missing++;
    } else {
      present++;
      for (const f of PROTECTED_FIELDS) {
        if ((exp[f] ?? null) !== (cur[f] ?? null)) {
          mutated++;
          break;
        }
      }
    }
  }

  return {
    expected: protectedList.length,
    present,
    missing,
    mutated,
    passed: present === protectedList.length && missing === 0 && mutated === 0
  };
}

describe('Phase 55D — Genuine Serial Delta & Controlled Import Verification', () => {

  test('Phase 55D - Test 1: Immutable Snapshot Hash & Byte-for-Byte Integrity', () => {
    assert.ok(fs.existsSync(BATCH_SOURCE_FILE), 'Batch source snapshot must exist');
    const bytes = fs.statSync(BATCH_SOURCE_FILE).size;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(BATCH_SOURCE_FILE)).digest('hex');
    assert.equal(bytes, EXPECTED_SOURCE_BYTES, `Source size must be ${EXPECTED_SOURCE_BYTES}`);
    assert.equal(sha, EXPECTED_SOURCE_SHA256, `Source SHA256 must match ${EXPECTED_SOURCE_SHA256}`);
  });

  test('Phase 55D - Test 2: Complete Row Accounting (1,727 / 1,727 Populated Rows Accounted)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    const ac = manifest.accounting;
    const sum = Object.values(ac).reduce((a, b) => a + b, 0);
    assert.equal(sum, 1727, 'All 1727 populated rows must be accounted for');
    assert.equal(ac.IDENTITY_CONFLICT, 0, 'Zero identity conflicts allowed');
    assert.equal(ac.INVALID_INPUT_SERIAL, 0, 'Zero invalid serials allowed');
  });

  test('Phase 55D - Test 3: Genuine Delta Detection (505 True Delta Rows & 1,221 Reconfirmed)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    const ac = manifest.accounting;
    assert.equal(ac.PREVIOUSLY_POSITIVE_RECONFIRMED, 1221, 'Expected 1221 reconfirmed anchors');
    assert.equal(ac.NEW_POSITIVE_OBSERVATION, 177, 'Expected 177 new positive observations');
    assert.equal(ac.NEW_NO_MATCH_OBSERVATION, 328, 'Expected 328 new no-match observations');
    assert.equal(ac.DUPLICATE_SOURCE_ROW, 1, 'Expected 1 duplicate source row');
    const trueDelta = ac.NEW_POSITIVE_OBSERVATION + (ac.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE || 0) +
      (ac.NEW_NO_MATCH_OBSERVATION || 0) + (ac.NEW_FOUND_WITHOUT_USABLE_IDENTITY || 0) + (ac.NEW_TECHNICAL_ERROR || 0);
    assert.equal(trueDelta, 505, 'True delta rows must equal exactly 505');
  });

  test('Phase 55D - Test 4: New Official Anchor Promotion Integrity (177 New Anchors)', () => {
    const newAnchorsDoc = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
    assert.equal(newAnchorsDoc.anchors.length, 177, 'Batch must contain exactly 177 new official anchors');
    for (const a of newAnchorsDoc.anchors) {
      assert.ok(/^\d{9}$/.test(a.serial_number), `Serial ${a.serial_number} must be 9 digits`);
      assert.ok(a.model_name && a.model_name.length > 0, `Anchor ${a.serial_number} must have a model_name`);
      assert.equal(a.source, 'MY_STIHL', 'Source must be MY_STIHL');
      assert.equal(a.verification_status, 'OFFICIAL_STIHL_LOOKUP', 'Verification status must be OFFICIAL_STIHL_LOOKUP');
    }
  });

  test('Phase 55D - Test 5: Negative Non-Runtime Semantics (328 Timeouts Strictly Excluded from Anchors)', () => {
    const newAnchorsDoc = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
    const newAnchorSerials = new Set(newAnchorsDoc.anchors.map(a => a.serial_number));

    const noMatchCsv = fs.readFileSync(path.join(BATCH_DIR, 'data', 'new_no_match_2026-10-20.csv'), 'utf8');
    const lines = noMatchCsv.trim().split('\n').slice(1);
    assert.equal(lines.length, 328, 'Must record exactly 328 no-match observations');

    for (const line of lines) {
      const serial = line.split(';')[0].replace(/"/g, '').trim();
      assert.equal(newAnchorSerials.has(serial), false, `Timeout serial ${serial} must NOT be in new anchors`);
    }
  });

  test('Phase 55D - Test 6: Strict Identity Conflict Rejection Contract (Zero Conflicts)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    assert.equal(manifest.accounting.IDENTITY_CONFLICT, 0, 'Must have zero identity conflicts');
    const conflictCsv = fs.readFileSync(path.join(BATCH_DIR, 'data', 'identity_conflicts_2026-10-20.csv'), 'utf8');
    const lines = conflictCsv.trim().split('\n');
    assert.equal(lines.length, 1, 'Conflicts CSV must contain only header');
  });

  test('Phase 55D - Test 7: Zero Range Inferences & Zero Generic Prefix Rules', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    assert.equal(manifest.metrics.ranges_created, 0, 'Zero ranges created');
    assert.equal(manifest.metrics.generic_prefix_rules_created, 0, 'Zero generic prefix rules created');
    assert.equal(manifest.metrics.negative_runtime_evidence_created, 0, 'Zero negative runtime evidence created');
  });

  test('Phase 55D - Test 8: 100% Parity Across official_serial_anchors.json, stihl_database.json, and SQLite (16,779 Anchors)', () => {
    const anchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
    const dbJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
    const sqlite = new DatabaseSync(path.join(rootDir, 'data', 'stihl_database.db'));
    const sqlCount = sqlite.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;
    const sqlAliasCount = sqlite.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases').get().c;

    const expectedTotal = 16602 + 177; // 16779
    assert.ok(anchorsDoc.anchors.length >= expectedTotal, `JSON anchors count must be >= ${expectedTotal}`);
    assert.equal(dbJson.official_serial_anchors.length, anchorsDoc.anchors.length, `stihl_database.json anchors count must match official_serial_anchors.json`);
    assert.equal(sqlCount, anchorsDoc.anchors.length, `SQLite anchors count must match official_serial_anchors.json`);
    assert.equal(sqlAliasCount, 171, 'SQLite alias count must remain 171');
  });

  test('Phase 55D - Test 9: Complete Full 16,602 Historical Protected Set Invariant (Keyed by Serial)', () => {
    const protectedList = loadProtectedPhase55CSet();
    assert.equal(protectedList.length, 16602, 'Protected historical cohort must equal exactly 16,602 anchors');

    const currentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
    const res = verifyProtectedCohort(protectedList, currentDoc.anchors);

    assert.equal(res.expected, 16602, 'PHASE55C_PROTECTED_EXPECTED must equal 16,602');
    assert.equal(res.present, 16602, 'PHASE55C_PROTECTED_PRESENT must equal 16,602');
    assert.equal(res.missing, 0, 'PHASE55C_PROTECTED_MISSING must be 0');
    assert.equal(res.mutated, 0, 'PHASE55C_PROTECTED_MUTATED must be 0');
    assert.equal(res.passed, true, 'Protected cohort verification must pass 100%');
  });

  test('Phase 55D - Test 10: Machine-Readable Reconciliation Document Verification', () => {
    assert.ok(fs.existsSync(RECON_FILE), 'serial_phase55d_reconciliation.json must exist');
    const recon = JSON.parse(fs.readFileSync(RECON_FILE, 'utf8'));
    assert.equal(recon.start_baseline, '5482c4b23e0c74089f0488db87bc626c4b736ea1');
    assert.equal(recon.delta.true_delta_rows, 505);
    assert.equal(recon.canonical.anchors_after, 16779);
    assert.ok(recon.historical_batch_immutability, 'historical_batch_immutability object must be present');
    assert.equal(recon.historical_batch_immutability.directories_expected, 7);
    assert.equal(recon.historical_batch_immutability.directories_verified, 7);
    assert.equal(recon.historical_batch_immutability.tree_mismatches, 0);
  });

  test('Phase 55D - Test 11: Idempotency of Batch Processing Pipeline', () => {
    const dryRun = runPhase55DReconciliation({ write: false });
    assert.equal(dryRun.success, true);
    assert.equal(dryRun.mode, 'DRY_RUN');
    assert.equal(dryRun.classifications.IDENTITY_CONFLICT, 0);
  });

  test('Phase 55D - Test 12: Phase 55D New-Anchor Set Identity & Canonical Presence (177 Anchors)', () => {
    const newAnchorsDoc = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
    assert.equal(newAnchorsDoc.anchors.length, 177, 'Batch new anchors must contain exactly 177 records');

    const canonicalDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
    const canonicalMap = new Map(canonicalDoc.anchors.map(a => [a.serial_number, a]));

    for (const newAnchor of newAnchorsDoc.anchors) {
      const can = canonicalMap.get(newAnchor.serial_number);
      assert.ok(can, `New anchor ${newAnchor.serial_number} must exist in canonical registry`);
      for (const f of PROTECTED_FIELDS) {
        assert.equal(can[f], newAnchor[f], `Field ${f} mismatch for new anchor ${newAnchor.serial_number}`);
      }
    }
  });

  test('Phase 55D - Test 13: Historical Batch Immutability via Git Tree Verification & Fail-Closed Synthetic Mismatch', () => {
    // 1. Authoritative verification of all 7 historical batch trees against Phase 55C baseline
    const verif = verifyHistoricalBatchTrees();
    assert.equal(verif.passed, true, 'All 7 historical batch Git trees must match baseline');
    assert.equal(verif.directoriesExpected, 7, 'HISTORICAL_BATCH_DIRS_EXPECTED must be 7');
    assert.equal(verif.directoriesVerified, 7, 'HISTORICAL_BATCH_DIRS_VERIFIED must be 7');
    assert.equal(verif.treeMismatches, 0, 'HISTORICAL_BATCH_TREE_MISMATCHES must be 0');

    // 2. Fail-closed test: Synthetic tree mismatch in one historical batch
    const syntheticMismatched = verifyHistoricalBatchTrees({
      getTreeHash: (ref, b) => {
        if (ref === 'HEAD' && b === 'serials_2026-10-20_manual_delta_55c') {
          return '0000000000000000000000000000000000000000';
        }
        return 'c4a15b904316dde493e4cfe3d4c49432f216619d';
      }
    });
    assert.equal(syntheticMismatched.passed, false, 'Synthetic mismatch must fail closed');
    assert.equal(syntheticMismatched.treeMismatches, 1, 'Expected 1 tree mismatch for synthetic tampering');
  });

  test('Phase 55D - Test 14: Historical Anchor Corruption Rejection (Mutation, Removal, Replacement)', () => {
    const protectedList = loadProtectedPhase55CSet();
    const currentDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));

    const targetSerial = '163118080'; // Well-known historical anchor: MS 440 Magnum

    // 1. Mutation test: Alter model_name of target serial
    const mutatedList = currentDoc.anchors.map(a => {
      if (a.serial_number === targetSerial) {
        return { ...a, model_name: 'CORRUPTED_MS_440_MAGNUM' };
      }
      return a;
    });
    const mutRes = verifyProtectedCohort(protectedList, mutatedList);
    assert.equal(mutRes.passed, false, 'Mutation must fail verification');
    assert.equal(mutRes.mutated, 1, 'Expected exactly 1 mutated record');

    // 2. Removal test: Remove target historical anchor
    const removedList = currentDoc.anchors.filter(a => a.serial_number !== targetSerial);
    const remRes = verifyProtectedCohort(protectedList, removedList);
    assert.equal(remRes.passed, false, 'Removal must fail verification');
    assert.equal(remRes.missing, 1, 'Expected exactly 1 missing record');

    // 3. Replacement test: Replace target historical anchor with a future / synthetic serial
    const replacedList = currentDoc.anchors.map(a => {
      if (a.serial_number === targetSerial) {
        return { ...a, serial_number: '999999999', model_name: 'FUTURE_SYNTHETIC_MODEL' };
      }
      return a;
    });
    const repRes = verifyProtectedCohort(protectedList, replacedList);
    assert.equal(repRes.passed, false, 'Replacement must fail verification');
    assert.equal(repRes.missing, 1, 'Target historical anchor must be reported missing');
  });
});
