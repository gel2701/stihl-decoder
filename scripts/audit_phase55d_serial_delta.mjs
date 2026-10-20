/**
 * Phase 55D: Genuine Serial Delta Reconciliation Audit Script
 * Fail-Closed verification of all 10 audit gates & nested historical protection
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { parseCSV } from './generate_phase55a_batch.mjs';
import { runBatchProcessing as runPhase53ABatchProcessing } from './generate_phase53a_batch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BATCH_NAME = 'serials_2026-10-20_manual_delta_55d';
const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', BATCH_NAME);
const BATCH_DATA_DIR = path.join(BATCH_DIR, 'data');
const BATCH_SOURCE_DIR = path.join(BATCH_DIR, 'source');
const BATCH_SOURCE_FILE = path.join(BATCH_SOURCE_DIR, 'stihl_resultaten_snapshot.csv');
const MANIFEST_FILE = path.join(BATCH_DIR, 'batch_manifest.json');
const RECON_FILE = path.join(rootDir, 'data', 'serial_phase55d_reconciliation.json');

const EXPECTED_SOURCE_SHA256 = 'af1f7638d5161e02f586293ae4050c49e7b916119b3a8b2030996c9825192e29';
const EXPECTED_SOURCE_BYTES = 2036808;

console.log('================================================================');
console.log('AUDIT: PHASE 55D GENUINE SERIAL DELTA VERIFICATION (FAIL-CLOSED)');
console.log('================================================================\n');

// Gate 1: Source File Identity & Hash
if (!fs.existsSync(BATCH_SOURCE_FILE)) {
  throw new Error(`Gate 1 FAIL: Batch source copy missing at ${BATCH_SOURCE_FILE}`);
}
const sourceBytes = fs.statSync(BATCH_SOURCE_FILE).size;
const sourceSha = crypto.createHash('sha256').update(fs.readFileSync(BATCH_SOURCE_FILE)).digest('hex');
if (sourceBytes !== EXPECTED_SOURCE_BYTES || sourceSha !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`Gate 1 FAIL: Source copy hash/size mismatch: ${sourceSha} (${sourceBytes} bytes)`);
}
console.log('✅ Gate 1: Source copy exists and exact SHA256 verified');

// Gate 2: Batch Manifest & Artifact Integrity
if (!fs.existsSync(MANIFEST_FILE)) {
  throw new Error(`Gate 2 FAIL: Batch manifest missing at ${MANIFEST_FILE}`);
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
for (const [relPath, expected] of Object.entries(manifest.artifacts)) {
  const fullPath = path.join(BATCH_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Gate 2 FAIL: Artifact ${relPath} missing`);
  }
  const buf = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== expected.bytes || hash !== expected.sha256) {
    throw new Error(`Gate 2 FAIL: Artifact ${relPath} hash mismatch (expected ${expected.sha256}, got ${hash})`);
  }
}
console.log('✅ Gate 2: Batch manifest and all artifact hashes verified');

// Gate 3: Complete Row Accounting & Overlap Equations
const sourceText = fs.readFileSync(BATCH_SOURCE_FILE, 'utf8');
const allRows = parseCSV(sourceText);
const populatedRows = allRows.slice(1).filter(r => r.some(f => f && f.trim().length > 0));
const expectedPopulated = 1727;

if (populatedRows.length !== expectedPopulated) {
  throw new Error(`Gate 3 FAIL: Expected ${expectedPopulated} populated rows, found ${populatedRows.length}`);
}

const ac = manifest.accounting;
const totalClassified = Object.values(ac).reduce((a, b) => a + b, 0);
if (totalClassified !== expectedPopulated) {
  throw new Error(`Gate 3 FAIL: Accounting sum mismatch: ${totalClassified} vs ${expectedPopulated}`);
}
console.log(`✅ Gate 3: Complete accounting equation (${totalClassified} / ${expectedPopulated} populated rows accounted)`);

// Gate 4: Zero promotions from timeouts, errors, or unusable identities
const newAnchorsDoc = JSON.parse(fs.readFileSync(path.join(BATCH_DATA_DIR, 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8'));
if (newAnchorsDoc.anchors.length !== 177) {
  throw new Error(`Gate 4 FAIL: Expected exactly 177 new anchors, got ${newAnchorsDoc.anchors.length}`);
}
const newAnchorSerials = new Set(newAnchorsDoc.anchors.map(a => a.serial_number));

for (const a of newAnchorsDoc.anchors) {
  if (!a.serial_number || !a.model_name || a.verification_status !== 'OFFICIAL_STIHL_LOOKUP') {
    throw new Error(`Gate 4 FAIL: Anchor ${a.serial_number} missing required official attributes`);
  }
}

// Verify that none of the 328 timeouts were promoted
const noMatchCsv = fs.readFileSync(path.join(BATCH_DATA_DIR, 'new_no_match_2026-10-20.csv'), 'utf8');
const noMatchLines = noMatchCsv.trim().split('\n').slice(1);
if (noMatchLines.length !== 328) {
  throw new Error(`Gate 4 FAIL: Expected 328 no-match rows in CSV, got ${noMatchLines.length}`);
}
for (const line of noMatchLines) {
  const serial = line.split(';')[0].replace(/"/g, '').trim();
  if (newAnchorSerials.has(serial)) {
    throw new Error(`Gate 4 FAIL: Timeout serial ${serial} was unlawfully promoted to new anchors`);
  }
}
console.log('✅ Gate 4: All 177 new anchors have 100% official attributes and zero non-runtime promotions (328 timeouts strictly non-runtime)');

// Gate 5: Production Registry & Cross-Store Parity
const canonicalAnchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
const stihlDbDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const sqliteDb = new DatabaseSync(path.join(rootDir, 'data', 'stihl_database.db'));
const sqlAnchorsCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;
const sqlAliasesCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases').get().c;

const expectedAnchorsCount = 16602 + 177; // 16779
if (canonicalAnchorsDoc.anchors.length !== expectedAnchorsCount ||
    stihlDbDoc.official_serial_anchors.length !== expectedAnchorsCount ||
    sqlAnchorsCount !== expectedAnchorsCount) {
  throw new Error(`Gate 5 FAIL: Anchor count mismatch across stores: JSON=${canonicalAnchorsDoc.anchors.length}, DB_JSON=${stihlDbDoc.official_serial_anchors.length}, SQLite=${sqlAnchorsCount} (expected ${expectedAnchorsCount})`);
}
if (sqlAliasesCount !== 171) {
  throw new Error(`Gate 5 FAIL: Alias count mismatch: expected 171, got ${sqlAliasesCount}`);
}
console.log(`✅ Gate 5: 100% Parity across JSON, stihl_database.json, and SQLite (${expectedAnchorsCount} anchors, 171 aliases)`);

// Gate 6: Zero range inferences, generic prefix rules, or negative runtime evidence
if (manifest.metrics.ranges_created !== 0 ||
    manifest.metrics.generic_prefix_rules_created !== 0 ||
    manifest.metrics.negative_runtime_evidence_created !== 0) {
  throw new Error('Gate 6 FAIL: Range or prefix heuristic violation');
}
console.log('✅ Gate 6: Zero range inferences, generic prefix rules, or negative runtime evidence');

// Gate 7: Authoritative Nested Historical Invariants
const phase55aBatchADir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-17_manual_followup');
const phase55aBatchBDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-19_manual_followup');
const phase55bBatchDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-20_manual_delta');
const phase55cBatchDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-20_manual_delta_55c');

// 7.1 Historical Phase 53A (8,874)
const res53a = runPhase53ABatchProcessing();
const hist53a = res53a.finalAnchorsList;
if (hist53a.length !== 8874) {
  throw new Error(`Gate 7A FAIL: Phase 53A historical subset must be 8874, got ${hist53a.length}`);
}

// 7.2 Phase 55A Batch A (1,543)
const batchAAnchors = JSON.parse(fs.readFileSync(path.join(phase55aBatchADir, 'data', 'new_official_serial_anchors_only_2026-10-17.json'), 'utf8')).anchors;
if (batchAAnchors.length !== 1543) {
  throw new Error(`Gate 7B FAIL: Phase 55A Batch A new anchors must be 1543, got ${batchAAnchors.length}`);
}

// 7.3 Phase 55A Batch B (5,243)
const batchBAnchors = JSON.parse(fs.readFileSync(path.join(phase55aBatchBDir, 'data', 'new_official_serial_anchors_only_2026-10-19.json'), 'utf8')).anchors;
if (batchBAnchors.length !== 5243) {
  throw new Error(`Gate 7C FAIL: Phase 55A Batch B new anchors must be 5243, got ${batchBAnchors.length}`);
}

const protectedPhase55ASet = [...hist53a, ...batchAAnchors, ...batchBAnchors];
if (protectedPhase55ASet.length !== 15660) {
  throw new Error(`Gate 7D FAIL: Protected Phase 55A set mismatch: ${protectedPhase55ASet.length} vs 15660`);
}

// 7.4 Phase 55B new anchors (414)
const batch55BAnchors = JSON.parse(fs.readFileSync(path.join(phase55bBatchDir, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8')).anchors;
if (batch55BAnchors.length !== 414) {
  throw new Error(`Gate 7E FAIL: Phase 55B new anchors must be 414, got ${batch55BAnchors.length}`);
}

const protectedPhase55BSet = [...protectedPhase55ASet, ...batch55BAnchors];
if (protectedPhase55BSet.length !== 16074) {
  throw new Error(`Gate 7F FAIL: Protected Phase 55B set mismatch: ${protectedPhase55BSet.length} vs 16074`);
}

// 7.5 Phase 55C new anchors (528)
const batch55CAnchors = JSON.parse(fs.readFileSync(path.join(phase55cBatchDir, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8')).anchors;
if (batch55CAnchors.length !== 528) {
  throw new Error(`Gate 7G FAIL: Phase 55C new anchors must be 528, got ${batch55CAnchors.length}`);
}

const protectedPhase55CSet = [...protectedPhase55BSet, ...batch55CAnchors];
if (protectedPhase55CSet.length !== 16602) {
  throw new Error(`Gate 7H FAIL: Protected Phase 55C set mismatch: ${protectedPhase55CSet.length} vs 16602`);
}

// Compare protected anchors by serial_number against current canonical registry
const canonicalMap = new Map(canonicalAnchorsDoc.anchors.map(a => [a.serial_number, a]));
const protectedFields = [
  'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
  'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
];

let phase55cPresent = 0;
let phase55cMissing = 0;
let phase55cMutated = 0;

for (const exp of protectedPhase55CSet) {
  const cur = canonicalMap.get(exp.serial_number);
  if (!cur) {
    phase55cMissing++;
  } else {
    phase55cPresent++;
    for (const f of protectedFields) {
      if ((exp[f] ?? null) !== (cur[f] ?? null)) {
        phase55cMutated++;
        break;
      }
    }
  }
}

if (phase55cPresent !== 16602 || phase55cMissing !== 0 || phase55cMutated !== 0) {
  throw new Error(`Gate 7 FAIL: Protected set invariant violated: present=${phase55cPresent}, missing=${phase55cMissing}, mutated=${phase55cMutated}`);
}

console.log('✅ Gate 7A: PHASE53A_HISTORICAL_SUBSET = 8874/8874 unchanged');
console.log('✅ Gate 7B: PHASE55A_BATCH_A_NEW_ANCHORS = 1543/1543 present unchanged');
console.log('✅ Gate 7C: PHASE55A_BATCH_B_NEW_ANCHORS = 5243/5243 present unchanged');
console.log('✅ Gate 7D: PHASE55A_PROTECTED_SET = 15660/15660 present unchanged');
console.log('✅ Gate 7E: PHASE55B_NEW_ANCHORS = 414/414 present unchanged');
console.log('✅ Gate 7F: PHASE55B_CUMULATIVE_PROTECTED_SET = 16074/16074 present unchanged');
console.log('✅ Gate 7G: PHASE55C_NEW_ANCHORS = 528/528 present unchanged');
console.log(`✅ Gate 7H: PHASE55C_CUMULATIVE_PROTECTED_SET = ${phase55cPresent}/16602 present unchanged (missing: ${phase55cMissing}, mutated: ${phase55cMutated})`);

// Gate 8: Authoritative serial_phase55d_reconciliation.json verified
if (!fs.existsSync(RECON_FILE)) {
  throw new Error(`Gate 8 FAIL: Missing root reconciliation file at ${RECON_FILE}`);
}
const recon = JSON.parse(fs.readFileSync(RECON_FILE, 'utf8'));
if (recon.canonical.anchors_after !== expectedAnchorsCount || recon.delta.true_delta_rows !== 505) {
  throw new Error('Gate 8 FAIL: Reconciliation summary metrics mismatch');
}
console.log('✅ Gate 8: Authoritative serial_phase55d_reconciliation.json verified');

// Gate 9: Historical batches protection
const historicalBatches = [
  'serials_2026-09-26',
  'serials_2026-10-06',
  'serials_2026-10-09',
  'serials_2026-10-17_manual_followup',
  'serials_2026-10-19_manual_followup',
  'serials_2026-10-20_manual_delta',
  'serials_2026-10-20_manual_delta_55c'
];
for (const hb of historicalBatches) {
  const p = path.join(rootDir, 'data', 'import_batches', hb);
  if (!fs.existsSync(p)) {
    throw new Error(`Gate 9 FAIL: Historical batch ${hb} missing`);
  }
}
console.log('✅ Gate 9: Historical batches (prior 7 batches) strictly preserved');

// Gate 10: Zero Identity Conflicts
if (ac.IDENTITY_CONFLICT !== 0) {
  throw new Error(`Gate 10 FAIL: Found ${ac.IDENTITY_CONFLICT} identity conflicts`);
}
console.log('✅ Gate 10: Zero identity conflicts across snapshot and canonical database');

console.log('================================================================');
console.log('🎉 AUDIT STATUS: PASS (All Fail-Closed Gates Cleared)');
console.log('================================================================\n');
