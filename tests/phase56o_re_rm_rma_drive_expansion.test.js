/**
 * tests/phase56o_re_rm_rma_drive_expansion.test.js
 *
 * Test suite for Phase 56O: Verified RE / RM / RMA Drive-Type Expansion.
 *
 * Verifies:
 *   1. Cohort baseline: 956 total, 25 attachments, 52 noise, 879 powered candidates.
 *   2. RE family resolution (MAINS_ELECTRIC) and evidence verification across 71 models.
 *   3. RE prefix collision safety (REA 60, REA 100, RB unaffected).
 *   4. RM family resolution (PETROL) and evidence verification across 25 models.
 *   5. RM prefix collision safety (RMA, RME, RMI unaffected).
 *   6. RMA family resolution (BATTERY) and evidence verification across 22 models.
 *   7. Precedence & Conflict rules: Explicit beats family; 0 conflicts.
 *   8. Coverage accounting: 403 -> 521 resolved (+118), 476 -> 358 unknown (-118), 45.85% -> 59.27%.
 *   9. Artifact integrity: all 14 artifacts in output/phase56o/ verified.
 *  10. Catalog freeze invariants preserved.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DRIVE_TYPES,
  DISPLAY_LABELS,
  OFFICIAL_STIHL_FAMILY_RULES,
  DISABLED_FAMILY_RULES,
  resolveDriveType,
  parseModelFamily
} from '../src/ModelFamilyDriveRegistry.js';

import {
  MACHINE_ELIGIBILITY,
  resolveMachineEligibility
} from '../src/ModelMachineEligibilityRegistry.js';

import { buildPhase56oDriveExpansion } from '../scripts/build_phase56o_drive_expansion.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56o');

test('Phase 56O — 1. Target Cohort Baseline & Population Invariants', async () => {
  const result = await buildPhase56oDriveExpansion({ write: false });
  const b = result.baselineSummary;

  assert.equal(b.total_catalog_models, 956, 'Total catalog models must remain 956');
  assert.equal(b.unpowered_attachments, 25, 'Unpowered attachments must remain exactly 25');
  assert.equal(b.confirmed_non_machine_noise, 52, 'Non-machine noise must remain exactly 52');
  assert.equal(b.powered_machine_candidates, 879, 'Powered machine candidate denominator must be 879');
  assert.equal(b.resolved_powered_candidates_before, 403, 'Baseline resolved before Phase 56O must be 403');
  assert.equal(b.unknown_powered_candidates_before, 476, 'Baseline unknown before Phase 56O must be 476');
  assert.equal(b.coverage_percentage_before, 45.85, 'Baseline coverage must be 45.85%');

  assert.equal(b.target_unknown_cohort.RE_count, 71, 'Target unknown RE count must be 71');
  assert.equal(b.target_unknown_cohort.RM_count, 25, 'Target unknown RM count must be 25');
  assert.equal(b.target_unknown_cohort.RMA_count, 22, 'Target unknown RMA count must be 22');
  assert.equal(b.target_unknown_cohort.total_target_potential, 118, 'Total target potential must be 118');
});

test('Phase 56O — 2. RE Family Resolution & Evidence Verification', async () => {
  // Test representative models
  const representativeRe = [
    'RE 80', 'RE 90', 'RE 100', 'RE 110', 'RE 120', 'RE 130', 'RE 130 PLUS', 'RE 150', 'RE 170 PLUS'
  ];

  for (const name of representativeRe) {
    const res = resolveDriveType(name);
    assert.equal(res.drive_type, DRIVE_TYPES.MAINS_ELECTRIC, `${name} must resolve to MAINS_ELECTRIC`);
    assert.equal(res.resolution, 'FAMILY_RULE', `${name} must resolve via FAMILY_RULE`);
    assert.equal(res.family, 'RE', `${name} family must be RE`);
    assert.equal(res.confidence, 'HIGH', `${name} confidence must be HIGH`);
  }

  // Verify official evidence artifact
  const result = await buildPhase56oDriveExpansion({ write: false });
  const reEv = result.officialReEvidence;
  assert.equal(reEv.family, 'RE');
  assert.equal(reEv.candidate_drive_type, DRIVE_TYPES.MAINS_ELECTRIC);
  assert.equal(reEv.status, 'VERIFIED');
  assert.equal(reEv.evidence_sources[0].body_sha256, 'bb312ab038f1f0366e48906a75fb16df91d8ec522a27b76108226ecef7a280aa');
  assert.equal(reEv.evidence_sources[1].page_number, 161);
});

test('Phase 56O — 3. RE Prefix Collision Safety', async () => {
  // Negative controls: REA (cordless) and RB (petrol) must NEVER match RE rule
  const negativeRe = ['REA 60.0', 'REA 100.0', 'RB 200', 'RB 400'];

  for (const name of negativeRe) {
    const res = resolveDriveType(name);
    assert.notEqual(res.family, 'RE', `${name} must not be matched by RE rule`);
    assert.notEqual(res.drive_type, DRIVE_TYPES.MAINS_ELECTRIC, `${name} must not resolve as MAINS_ELECTRIC via RE`);
  }

  const result = await buildPhase56oDriveExpansion({ write: false });
  assert.equal(result.prefixCollisionAudit.metrics.re_rule_affected_rea, 0, 'RE rule must affect 0 REA models');
});

test('Phase 56O — 4. RM Family Resolution & Evidence Verification', async () => {
  // Test representative models
  const representativeRm = [
    'RM 248', 'RM 253', 'RM 443', 'RM 448', 'RM 448 T', 'RM 448.1 TX', 'RM 545', 'RM 650', 'RM 756'
  ];

  for (const name of representativeRm) {
    const res = resolveDriveType(name);
    assert.equal(res.drive_type, DRIVE_TYPES.PETROL, `${name} must resolve to PETROL`);
    assert.equal(res.resolution, 'FAMILY_RULE', `${name} must resolve via FAMILY_RULE`);
    assert.equal(res.family, 'RM', `${name} family must be RM`);
    assert.equal(res.confidence, 'HIGH', `${name} confidence must be HIGH`);
  }

  // Verify official evidence artifact
  const result = await buildPhase56oDriveExpansion({ write: false });
  const rmEv = result.officialRmEvidence;
  assert.equal(rmEv.family, 'RM');
  assert.equal(rmEv.candidate_drive_type, DRIVE_TYPES.PETROL);
  assert.equal(rmEv.status, 'VERIFIED');
  assert.equal(rmEv.evidence_sources[0].body_sha256, '0859432bfc193b32503a27a51d75ea724f54c5d955ff1cfe37e2fd1d539da729');
  assert.equal(rmEv.evidence_sources[1].page_number, 107);
  assert.equal(rmEv.evidence_sources[2].document_id, '0458-007-0049');
});

test('Phase 56O — 5. RM Prefix Collision Safety', async () => {
  // Negative controls: RMA (battery), RME (electric), RMI (robotic) must NEVER match RM rule
  const negativeRm = [
    'RMA 448', 'RMA 235', 'RMA 339',
    'RME 339.0 C', 'RME 443.0 C', 'RME 545.0 C',
    'RMI 422.0', 'RMI 522.0 C', 'RMI 632.0 PC'
  ];

  for (const name of negativeRm) {
    const res = resolveDriveType(name);
    assert.notEqual(res.family, 'RM', `${name} must not be matched by RM rule`);
    if (name.startsWith('RMA')) {
      assert.equal(res.drive_type, DRIVE_TYPES.BATTERY, `${name} must resolve as BATTERY via RMA rule`);
      assert.equal(res.family, 'RMA');
    } else {
      assert.notEqual(res.drive_type, DRIVE_TYPES.PETROL, `${name} must not resolve as PETROL via RM`);
    }
  }

  const result = await buildPhase56oDriveExpansion({ write: false });
  assert.equal(result.prefixCollisionAudit.metrics.rm_rule_affected_rma, 0, 'RM rule must affect 0 RMA models');
  assert.equal(result.prefixCollisionAudit.metrics.rm_rule_affected_rme, 0, 'RM rule must affect 0 RME models');
  assert.equal(result.prefixCollisionAudit.metrics.rm_rule_affected_rmi, 0, 'RM rule must affect 0 RMI models');
  assert.equal(result.prefixCollisionAudit.metrics.prefix_collision_errors, 0, 'Prefix collision errors must be 0');
});

test('Phase 56O — 6. RMA Family Resolution & Evidence Verification', async () => {
  // Test representative models
  const representativeRma = [
    'RMA 235', 'RMA 248', 'RMA 253', 'RMA 339', 'RMA 443', 'RMA 448', 'RMA 448 V', 'RMA 765'
  ];

  for (const name of representativeRma) {
    const res = resolveDriveType(name);
    assert.equal(res.drive_type, DRIVE_TYPES.BATTERY, `${name} must resolve to BATTERY`);
    assert.equal(res.resolution, 'FAMILY_RULE', `${name} must resolve via FAMILY_RULE`);
    assert.equal(res.family, 'RMA', `${name} family must be RMA`);
    assert.equal(res.confidence, 'HIGH', `${name} confidence must be HIGH`);
  }

  // Verify official evidence artifact
  const result = await buildPhase56oDriveExpansion({ write: false });
  const rmaEv = result.officialRmaEvidence;
  assert.equal(rmaEv.family, 'RMA');
  assert.equal(rmaEv.candidate_drive_type, DRIVE_TYPES.BATTERY);
  assert.equal(rmaEv.status, 'VERIFIED');
  assert.equal(rmaEv.evidence_sources[0].body_sha256, '029075bc0de0f7bc8ccfdd15f669c664efb8684f04de1022d55230c0efc5075f');
  assert.equal(rmaEv.evidence_sources[1].page_number, 108);
});

test('Phase 56O — 7. Explicit Precedence & Zero Conflicts', async () => {
  // Check that explicit models (026 with explicit power source, HOS, USG) still resolve via EXPLICIT_MODEL
  assert.equal(resolveDriveType({ model_name: '026', explicit_power_source: 'GASOLINE' }).resolution, 'EXPLICIT_MODEL');
  assert.equal(resolveDriveType('HOS Sharpeners').resolution, 'EXPLICIT_MODEL');
  assert.equal(resolveDriveType('USG Sharpeners').resolution, 'EXPLICIT_MODEL');

  const result = await buildPhase56oDriveExpansion({ write: false });
  assert.equal(result.driveConflicts.length, 0, 'Drive conflicts count must be 0');
  assert.equal(result.summary.hard_gates.DRIVE_CONFLICTS_INTRODUCED, 0);
  assert.equal(result.summary.hard_gates.TARGET_NON_MACHINE_RECORDS, 0);
  assert.equal(result.summary.hard_gates.TARGET_ATTACHMENT_RECORDS, 0);
});

test('Phase 56O — 8. Coverage Metrics & Arithmetic', async () => {
  const result = await buildPhase56oDriveExpansion({ write: false });
  const c = result.coverageBeforeAfter;

  assert.equal(c.baseline.resolved_powered_candidates, 403);
  assert.equal(c.baseline.unknown_powered_candidates, 476);
  assert.equal(c.baseline.coverage_percentage, 45.85);

  assert.equal(c.after.resolved_powered_candidates, 521);
  assert.equal(c.after.unknown_powered_candidates, 358);
  assert.equal(c.after.coverage_percentage, 59.27);

  assert.equal(c.deltas.resolved_candidates_delta, 118);
  assert.equal(c.deltas.unknown_candidates_delta, -118);
  assert.equal(c.deltas.coverage_percentage_delta, 13.42);

  assert.equal(c.deltas.promotions_by_family.RE, 71);
  assert.equal(c.deltas.promotions_by_family.RM, 25);
  assert.equal(c.deltas.promotions_by_family.RMA, 22);
  assert.equal(c.deltas.promotions_by_family.total, 118);
});

test('Phase 56O — 9. Artifact Presence & Hard Gates', async () => {
  const expectedArtifacts = [
    'TARGET_COHORT_BASELINE.json',
    'OFFICIAL_RE_EVIDENCE.json',
    'OFFICIAL_RM_EVIDENCE.json',
    'OFFICIAL_RMA_EVIDENCE.json',
    'GENERATION_COVERAGE_MATRIX.json',
    'PREFIX_COLLISION_AUDIT.json',
    'FAMILY_ACTIVATION_DECISIONS.json',
    'DRIVE_PROMOTIONS.json',
    'DRIVE_CONFLICTS.json',
    'COVERAGE_BEFORE_AFTER.json',
    'PROVENANCE_INTEGRITY.json',
    'CATALOG_INTEGRITY.json',
    'PHASE56O_SUMMARY.json',
    'PHASE56O_REPORT.md'
  ];

  for (const file of expectedArtifacts) {
    const filePath = path.join(OUTPUT_DIR, file);
    assert.ok(fs.existsSync(filePath), `Artifact ${file} must exist in ${OUTPUT_DIR}`);
    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 0, `Artifact ${file} must not be empty`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'PHASE56O_SUMMARY.json'), 'utf8'));
  assert.equal(summary.outcome_status, 'PASS');
  assert.equal(summary.hard_gates.UNSAFE_DRIVE_PROMOTIONS, 0);
  assert.equal(summary.hard_gates.PROMOTIONS_WITHOUT_OFFICIAL_EVIDENCE, 0);
  assert.equal(summary.hard_gates.PREFIX_COLLISION_ERRORS, 0);
  assert.equal(summary.hard_gates.RE_RULE_AFFECTED_REA, 0);
  assert.equal(summary.hard_gates.RM_RULE_AFFECTED_RMA, 0);
  assert.equal(summary.hard_gates.RM_RULE_AFFECTED_RME, 0);
  assert.equal(summary.hard_gates.RM_RULE_AFFECTED_RMI, 0);
  assert.equal(summary.hard_gates.TARGET_NON_MACHINE_RECORDS, 0);
  assert.equal(summary.hard_gates.TARGET_ATTACHMENT_RECORDS, 0);
  assert.equal(summary.hard_gates.DRIVE_CONFLICTS_INTRODUCED, 0);
  assert.equal(summary.hard_gates.FABRICATED_PROVENANCE, 0);
  assert.equal(summary.hard_gates.PHASE56N_REGRESSIONS, 0);
  assert.equal(summary.hard_gates.CATALOG_FREEZE_INTACT, true);
  assert.equal(summary.hard_gates.PHASE56O_EVIDENCE_INTEGRITY, true);
});

test('Phase 56O — 10. Catalog Freeze Invariants Preserved', async () => {
  const result = await buildPhase56oDriveExpansion({ write: false });
  const cat = result.catalogIntegrity;

  assert.equal(cat.invariants.total_catalog_models, 956);
  assert.equal(cat.invariants.canonical_parts_count, 17082);
  assert.equal(cat.invariants.unpowered_attachments_count, 25);
  assert.equal(cat.invariants.non_machine_noise_count, 52);
  assert.equal(cat.invariants.powered_machine_candidates, 879);
  assert.equal(cat.catalog_freeze_intact, true);
});
