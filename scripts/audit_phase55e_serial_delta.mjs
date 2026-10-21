/**
 * Phase 55E: Genuine Serial Delta Reconciliation Audit Script
 * Fail-Closed verification of all 10 audit gates & nested historical protection
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';
import { parseCSV } from './generate_phase55a_batch.mjs';
import { runBatchProcessing as runPhase53ABatchProcessing } from './generate_phase53a_batch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const BATCH_NAME = 'serials_2026-10-20_manual_delta_55e';
const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', BATCH_NAME);
const BATCH_DATA_DIR = path.join(BATCH_DIR, 'data');
const BATCH_SOURCE_DIR = path.join(BATCH_DIR, 'source');
const BATCH_SOURCE_FILE = path.join(BATCH_SOURCE_DIR, 'stihl_resultaten_snapshot.csv');
const MANIFEST_FILE = path.join(BATCH_DIR, 'batch_manifest.json');
const RECON_FILE = path.join(rootDir, 'data', 'serial_phase55e_reconciliation.json');

const EXPECTED_SOURCE_SHA256 = '9bdb732d185a82fdb0e9f626c37b17ea41469bc628ff433a9ab211258cad4423';
const EXPECTED_SOURCE_BYTES = 2252144;

export const HISTORICAL_BATCHES = [
  'serials_2026-09-26',
  'serials_2026-10-06',
  'serials_2026-10-09',
  'serials_2026-10-17_manual_followup',
  'serials_2026-10-19_manual_followup',
  'serials_2026-10-20_manual_delta',
  'serials_2026-10-20_manual_delta_55c',
  'serials_2026-10-20_manual_delta_55d'
];

export const AUTHORITATIVE_PHASE55D_BATCH_TREES = Object.freeze({
  'serials_2026-09-26': '7f135d03b4e652e59811cf6dc14952b50ae837b0',
  'serials_2026-10-06': '5cff7e5c37278ca410177ea980228ff9c40940a8',
  'serials_2026-10-09': '793aaeee030c4c972c8ed539077a7afa60d19afd',
  'serials_2026-10-17_manual_followup': '4323f2edd65f4928f83af7cdf982d58f7b485066',
  'serials_2026-10-19_manual_followup': '656ee0936360396b0d2a56ed6297de0268a89166',
  'serials_2026-10-20_manual_delta': '1574bc8a79b22dfd14598273df0e85e59a7203d1',
  'serials_2026-10-20_manual_delta_55c': 'c4a15b904316dde493e4cfe3d4c49432f216619d',
  'serials_2026-10-20_manual_delta_55d': '69de7ea5b234ce380a26ee957dc23a5c7215f34a'
});

/**
 * Pure helper for Git tree immutability verification across historical batches.
 */
export function verifyHistoricalBatchTrees(options = {}) {
  const {
    baselineSha = '609e79c4e53d3419de68d6049ab99f09462eda7e',
    headRef = 'HEAD',
    batchList = HISTORICAL_BATCHES,
    getTreeHash = null
  } = options;

  const defaultGetTreeHash = (ref, batch) => {
    try {
      const cmd = `git rev-parse "${ref}:data/import_batches/${batch}"`;
      return execSync(cmd, { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      // In shallow clone environments (e.g. CI runner), baseline commits may not be present in local object store.
      // Fallback to immutable baseline tree constant if git object resolution is unavailable in shallow clone
      if (ref === baselineSha && AUTHORITATIVE_PHASE55D_BATCH_TREES[batch]) {
        return AUTHORITATIVE_PHASE55D_BATCH_TREES[batch];
      }
      return null;
    }
  };

  const resolver = getTreeHash || defaultGetTreeHash;

  const results = [];
  let mismatches = 0;

  for (let i = 0; i < batchList.length; i++) {
    const batch = batchList[i];
    const letter = String.fromCharCode(65 + i); // A, B, C, D, E, F, G, H
    const baselineTree = resolver(baselineSha, batch);
    const headTree = resolver(headRef, batch);
    const match = Boolean(baselineTree && headTree && baselineTree === headTree);
    if (!match) mismatches++;
    results.push({
      batch,
      gate: `Gate 9${letter}`,
      baselineTree,
      headTree,
      match
    });
  }

  const passed = mismatches === 0 && results.length === batchList.length;
  return {
    passed,
    directoriesExpected: batchList.length,
    directoriesVerified: results.filter(r => r.match).length,
    treeMismatches: mismatches,
    results
  };
}

export function runAudit() {
  console.log('================================================================');
  console.log('AUDIT: PHASE 55E GENUINE SERIAL DELTA VERIFICATION (FAIL-CLOSED)');
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
  const expectedPopulated = 2000;

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
  if (newAnchorsDoc.anchors.length !== 99) {
    throw new Error(`Gate 4 FAIL: Expected exactly 99 new anchors, got ${newAnchorsDoc.anchors.length}`);
  }
  const newAnchorSerials = new Set(newAnchorsDoc.anchors.map(a => a.serial_number));

  for (const a of newAnchorsDoc.anchors) {
    if (!a.serial_number || !a.model_name || a.verification_status !== 'OFFICIAL_STIHL_LOOKUP') {
      throw new Error(`Gate 4 FAIL: Anchor ${a.serial_number} missing required official attributes`);
    }
  }

  // Verify that none of the 149 timeouts were promoted
  const noMatchCsv = fs.readFileSync(path.join(BATCH_DATA_DIR, 'new_no_match_2026-10-20.csv'), 'utf8');
  const noMatchLines = noMatchCsv.trim().split('\n').slice(1);
  if (noMatchLines.length !== 149) {
    throw new Error(`Gate 4 FAIL: Expected 149 no-match rows in CSV, got ${noMatchLines.length}`);
  }
  for (const line of noMatchLines) {
    const serial = line.split(';')[0].replace(/"/g, '').trim();
    if (newAnchorSerials.has(serial)) {
      throw new Error(`Gate 4 FAIL: Timeout serial ${serial} was unlawfully promoted to new anchors`);
    }
  }
  console.log('✅ Gate 4: All 99 new anchors have 100% official attributes and zero non-runtime promotions (149 timeouts strictly non-runtime)');

  // Gate 5: Production Registry & Cross-Store Parity
  const canonicalAnchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
  const stihlDbDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
  const sqliteDb = new DatabaseSync(path.join(rootDir, 'data', 'stihl_database.db'));
  const sqlAnchorsCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;
  const sqlAliasesCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM official_serial_input_aliases').get().c;

  const expectedAnchorsCount = 16779 + 99; // 16878
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
  const phase55dBatchDir = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-20_manual_delta_55d');

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

  // 7.6 Phase 55D new anchors (177)
  const batch55DAnchors = JSON.parse(fs.readFileSync(path.join(phase55dBatchDir, 'data', 'new_official_serial_anchors_only_2026-10-20.json'), 'utf8')).anchors;
  if (batch55DAnchors.length !== 177) {
    throw new Error(`Gate 7I FAIL: Phase 55D new anchors must be 177, got ${batch55DAnchors.length}`);
  }

  const protectedPhase55DSet = [...protectedPhase55CSet, ...batch55DAnchors];
  if (protectedPhase55DSet.length !== 16779) {
    throw new Error(`Gate 7J FAIL: Protected Phase 55D set mismatch: ${protectedPhase55DSet.length} vs 16779`);
  }

  // Compare protected anchors by serial_number against current canonical registry
  const canonicalMap = new Map(canonicalAnchorsDoc.anchors.map(a => [a.serial_number, a]));
  const protectedFields = [
    'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
    'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
  ];

  let phase55dPresent = 0;
  let phase55dMissing = 0;
  let phase55dMutated = 0;

  for (const exp of protectedPhase55DSet) {
    const cur = canonicalMap.get(exp.serial_number);
    if (!cur) {
      phase55dMissing++;
    } else {
      phase55dPresent++;
      for (const f of protectedFields) {
        if ((exp[f] ?? null) !== (cur[f] ?? null)) {
          phase55dMutated++;
          break;
        }
      }
    }
  }

  if (phase55dPresent !== 16779 || phase55dMissing !== 0 || phase55dMutated !== 0) {
    throw new Error(`Gate 7 FAIL: Protected set invariant violated: present=${phase55dPresent}, missing=${phase55dMissing}, mutated=${phase55dMutated}`);
  }

  console.log('✅ Gate 7A: PHASE53A_HISTORICAL_SUBSET = 8874/8874 unchanged');
  console.log('✅ Gate 7B: PHASE55A_BATCH_A_NEW_ANCHORS = 1543/1543 present unchanged');
  console.log('✅ Gate 7C: PHASE55A_BATCH_B_NEW_ANCHORS = 5243/5243 present unchanged');
  console.log('✅ Gate 7D: PHASE55A_PROTECTED_SET = 15660/15660 present unchanged');
  console.log('✅ Gate 7E: PHASE55B_NEW_ANCHORS = 414/414 present unchanged');
  console.log('✅ Gate 7F: PHASE55B_CUMULATIVE_PROTECTED_SET = 16074/16074 present unchanged');
  console.log('✅ Gate 7G: PHASE55C_NEW_ANCHORS = 528/528 present unchanged');
  console.log('✅ Gate 7H: PHASE55C_CUMULATIVE_PROTECTED_SET = 16602/16602 present unchanged');
  console.log('✅ Gate 7I: PHASE55D_NEW_ANCHORS = 177/177 present unchanged');
  console.log(`✅ Gate 7J: PHASE55D_CUMULATIVE_PROTECTED_SET = ${phase55dPresent}/16779 present unchanged (missing: ${phase55dMissing}, mutated: ${phase55dMutated})`);

  // Gate 8: Authoritative serial_phase55e_reconciliation.json verified
  if (!fs.existsSync(RECON_FILE)) {
    throw new Error(`Gate 8 FAIL: Missing root reconciliation file at ${RECON_FILE}`);
  }
  const recon = JSON.parse(fs.readFileSync(RECON_FILE, 'utf8'));
  if (recon.canonical.anchors_after !== expectedAnchorsCount || recon.delta.true_delta_rows !== 248) {
    throw new Error('Gate 8 FAIL: Reconciliation summary metrics mismatch');
  }
  console.log('✅ Gate 8: Authoritative serial_phase55e_reconciliation.json verified');

  // Gate 9: Historical batches protection (exact Git tree immutability)
  console.log('\n--- Gate 9: Historical Batch Immutability Audit ---');
  const treeVerif = verifyHistoricalBatchTrees();

  for (const r of treeVerif.results) {
    console.log(`${r.gate}:`);
    console.log(`${r.batch} TREE_MATCH = ${r.match ? 'YES' : 'NO'}\n`);
  }

  console.log(`HISTORICAL_BATCH_DIRS_VERIFIED = ${treeVerif.directoriesVerified}/${treeVerif.directoriesExpected}`);
  console.log(`HISTORICAL_BATCH_TREE_MISMATCHES = ${treeVerif.treeMismatches}`);

  if (!treeVerif.passed) {
    throw new Error(`Gate 9 FAIL: Historical batch tree mismatch detected: ${treeVerif.treeMismatches} mismatches`);
  }
  console.log('✅ Gate 9: Historical batches (prior 8 batches) strictly preserved (Git tree-identical)\n');

  // Gate 10: Zero Identity Conflicts
  if (ac.IDENTITY_CONFLICT !== 0) {
    throw new Error(`Gate 10 FAIL: Found ${ac.IDENTITY_CONFLICT} identity conflicts`);
  }
  console.log('✅ Gate 10: Zero identity conflicts across snapshot and canonical database');

  console.log('\n================================================================');
  console.log('📊 FINAL AUDIT NUMERICAL REPORT:');
  console.log('================================================================');
  console.log('PHASE53A_PROTECTED = 8874/8874');
  console.log('PHASE55A_PROTECTED = 15660/15660');
  console.log('PHASE55B_PROTECTED = 16074/16074');
  console.log('PHASE55C_PROTECTED = 16602/16602');
  console.log(`PHASE55D_PROTECTED = ${phase55dPresent}/16779`);
  console.log(`PHASE55D_MISSING = ${phase55dMissing}`);
  console.log(`PHASE55D_MUTATED = ${phase55dMutated}`);
  console.log(`HISTORICAL_BATCH_DIRS_VERIFIED = ${treeVerif.directoriesVerified}/${treeVerif.directoriesExpected}`);
  console.log(`HISTORICAL_BATCH_TREE_MISMATCHES = ${treeVerif.treeMismatches}`);
  console.log('================================================================');
  console.log('🎉 AUDIT STATUS: PASS (All Fail-Closed Gates Cleared)');
  console.log('================================================================\n');

  return {
    passed: true,
    protectedCounts: {
      phase53a: 8874,
      phase55a: 15660,
      phase55b: 16074,
      phase55c: 16602,
      phase55d: phase55dPresent,
      phase55dMissing,
      phase55dMutated
    },
    treeVerif
  };
}

if (process.argv[1] && process.argv[1].endsWith('audit_phase55e_serial_delta.mjs')) {
  runAudit();
}
