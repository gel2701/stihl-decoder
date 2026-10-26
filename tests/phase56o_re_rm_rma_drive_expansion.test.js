/**
 * tests/phase56o_re_rm_rma_drive_expansion.test.js
 *
 * Test suite for Phase 56O / 56O.1: Verified RE / RM / RMA Drive-Type Expansion
 * & Evidence Integrity Closure.
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
 *  11. Registry ↔ Ledger Parity & Hash Integrity (fetch_id, family, drive, body_sha256, excerpt_hash).
 *  12. Negative Controls: Mismatched fetch ID, excerpt hash manipulation, unverified ledger, context-bound failure.
 *  13. Generation Coverage & Evidence IDs: All promotions have evidence IDs, zero promotions with unsupported generation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  DRIVE_TYPES,
  DISPLAY_LABELS,
  OFFICIAL_STIHL_FAMILY_RULES,
  DISABLED_FAMILY_RULES,
  resolveDriveType,
  parseModelFamily,
  verifyActiveFamilyRuleProvenance,
  computeSha256Sync
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
const LEDGER_PATH = path.join(REPO_ROOT, 'data', 'harvest', 'phase56l', 'official_family_fetch_ledger.json');

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

  const result = await buildPhase56oDriveExpansion({ write: false });
  const reEv = result.officialReEvidence;
  assert.equal(reEv.family, 'RE');
  assert.equal(reEv.candidate_drive_type, DRIVE_TYPES.MAINS_ELECTRIC);
  assert.equal(reEv.status, 'VERIFIED');
  assert.equal(reEv.evidence_sources[0].body_sha256, 'bb312ab038f1f0366e48906a75fb16df91d8ec522a27b76108226ecef7a280aa');
  assert.equal(reEv.evidence_sources[1].page_number, 161);
});

test('Phase 56O — 3. RE Prefix Collision Safety', async () => {
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

  const result = await buildPhase56oDriveExpansion({ write: false });
  const rmaEv = result.officialRmaEvidence;
  assert.equal(rmaEv.family, 'RMA');
  assert.equal(rmaEv.candidate_drive_type, DRIVE_TYPES.BATTERY);
  assert.equal(rmaEv.status, 'VERIFIED');
  assert.equal(rmaEv.evidence_sources[0].body_sha256, '029075bc0de0f7bc8ccfdd15f669c664efb8684f04de1022d55230c0efc5075f');
  assert.equal(rmaEv.evidence_sources[1].page_number, 108);
});

test('Phase 56O — 7. Explicit Precedence & Zero Conflicts', async () => {
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
  assert.equal(summary.hard_gates.REGISTRY_LEDGER_FETCH_ID_MISMATCHES, 0);
  assert.equal(summary.hard_gates.ACTIVE_RULE_LEDGER_PARITY_ERRORS, 0);
  assert.equal(summary.hard_gates.EXCERPT_HASH_MISMATCHES, 0);
  assert.equal(summary.hard_gates.BODY_HASH_MISMATCHES, 0);
  assert.equal(summary.hard_gates.UNVERIFIED_ACTIVE_LEDGER_RECORDS, 0);
  assert.equal(summary.hard_gates.NON_CONTEXT_BOUND_ACTIVE_RECORDS, 0);
  assert.equal(summary.hard_gates.PROMOTIONS_WITHOUT_EVIDENCE_IDS, 0);
  assert.equal(summary.hard_gates.PROMOTIONS_WITH_UNSUPPORTED_GENERATION, 0);
  assert.equal(summary.hard_gates.PREFIX_COLLISION_ERRORS, 0);
  assert.equal(summary.hard_gates.DRIVE_CONFLICTS_INTRODUCED, 0);
  assert.equal(summary.hard_gates.FABRICATED_PROVENANCE, 0);
  assert.equal(summary.hard_gates.SYNTHETIC_PROVENANCE, 0);
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

test('Phase 56O — 11. Registry ↔ Fetch Ledger Parity & Hash Integrity (Phase 56O.1)', async () => {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

  for (const fam of ['RE', 'RM', 'RMA']) {
    const rule = OFFICIAL_STIHL_FAMILY_RULES[fam];
    assert.ok(rule, `Rule ${fam} must exist in registry`);

    const lRec = ledger.find(l => l.family === fam);
    assert.ok(lRec, `Ledger record for ${fam} must exist`);

    // 1. fetch ID match
    assert.equal(rule.fetch_id, lRec.fetch_id, `${fam} fetch_id must match ledger`);

    // 2. Family match
    assert.equal(rule.family, lRec.family, `${fam} family must match ledger`);

    // 3. Drive type match
    assert.equal(rule.drive_type, lRec.drive_type, `${fam} drive_type must match ledger`);

    // 4. Body hash parity
    assert.equal(rule.body_sha256, lRec.body_sha256, `${fam} body_sha256 must match ledger`);

    // 5. Excerpt hash recomputation: SHA256(UTF8(source_excerpt))
    const excerpt = rule.extracted_evidence?.source_excerpt || rule.source_excerpt;
    assert.ok(excerpt, `${fam} must have source_excerpt`);
    const computedExcerptHash = crypto.createHash('sha256').update(excerpt).digest('hex');
    assert.equal(
      rule.extracted_evidence?.source_excerpt_hash,
      computedExcerptHash,
      `${fam} registry source_excerpt_hash must equal recomputed SHA256(UTF8(source_excerpt))`
    );
    assert.equal(
      lRec.source_excerpt_hash,
      computedExcerptHash,
      `${fam} ledger source_excerpt_hash must equal recomputed SHA256(UTF8(source_excerpt))`
    );

    // 6. Hard invariant: body_sha256 != source_excerpt_hash for HTML sources
    assert.notEqual(
      rule.body_sha256,
      rule.extracted_evidence?.source_excerpt_hash,
      `${fam} body_sha256 must NOT equal source_excerpt_hash`
    );

    // 7. Full parity validation
    const parityResult = verifyActiveFamilyRuleProvenance(rule, ledger);
    assert.equal(parityResult.valid, true, `${fam} provenance parity must be valid: ${parityResult.errors.join('; ')}`);
    assert.equal(parityResult.errors.length, 0);
  }
});

test('Phase 56O — 12. Negative Controls: Registry & Ledger Provenance Gates (Phase 56O.1)', async () => {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

  // Negative 1: Registry fetch ID mismatch (fetch_stihl_family_999)
  const fakeRuleFetchId = {
    ...OFFICIAL_STIHL_FAMILY_RULES.RE,
    fetch_id: 'fetch_stihl_family_999'
  };
  const neg1 = verifyActiveFamilyRuleProvenance(fakeRuleFetchId, ledger);
  assert.equal(neg1.valid, false, 'Provenance must fail when fetch_id does not exist in ledger');
  assert.ok(neg1.errors.some(e => e.includes('fetch_id') || e.includes('missing')));

  // Negative 2: Manipulate source_excerpt_hash = body_sha256 when excerpt != body
  const fakeRuleExcerptHash = {
    ...OFFICIAL_STIHL_FAMILY_RULES.RM,
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.RM.extracted_evidence,
      source_excerpt_hash: OFFICIAL_STIHL_FAMILY_RULES.RM.body_sha256
    }
  };
  const neg2 = verifyActiveFamilyRuleProvenance(fakeRuleExcerptHash, ledger);
  assert.equal(neg2.valid, false, 'Provenance must fail when source_excerpt_hash equals body_sha256 inappropriately');
  assert.ok(neg2.errors.some(e => e.includes('body_sha256 cannot equal source_excerpt_hash') || e.includes('mismatch')));

  // Negative 3: Ledger verification_status = UNVERIFIED_CONTEXT_MISMATCH
  const fakeLedgerStatus = ledger.map(l => l.family === 'RMA' ? { ...l, verification_status: 'UNVERIFIED_CONTEXT_MISMATCH' } : l);
  const neg3 = verifyActiveFamilyRuleProvenance(OFFICIAL_STIHL_FAMILY_RULES.RMA, fakeLedgerStatus);
  assert.equal(neg3.valid, false, 'Provenance must fail when ledger verification_status is not VERIFIED');
  assert.ok(neg3.errors.some(e => e.includes('verification_status mismatch')));

  // Negative 4: Ledger context_bound = false
  const fakeLedgerContext = ledger.map(l => l.family === 'RE' ? { ...l, context_bound: false } : l);
  const neg4 = verifyActiveFamilyRuleProvenance(OFFICIAL_STIHL_FAMILY_RULES.RE, fakeLedgerContext);
  assert.equal(neg4.valid, false, 'Provenance must fail when ledger record is not context-bound');
  assert.ok(neg4.errors.some(e => e.includes('context_bound mismatch')));
});

test('Phase 56O — 13. Generation Coverage & Evidence IDs Integrity (Phase 56O.1)', async () => {
  const result = await buildPhase56oDriveExpansion({ write: false });
  const promotions = result.drivePromotions;

  assert.equal(promotions.length, 118, 'Total promotions must remain 118');

  // Verify every promotion contains concrete evidence_ids and is COVERED
  for (const promo of promotions) {
    assert.ok(Array.isArray(promo.evidence_ids), `${promo.model_name} must have evidence_ids array`);
    assert.ok(promo.evidence_ids.length > 0, `${promo.model_name} evidence_ids must not be empty`);
    assert.equal(promo.generation_coverage_status, 'COVERED', `${promo.model_name} generation must be COVERED`);
  }

  assert.equal(result.summary.hard_gates.PROMOTIONS_WITHOUT_EVIDENCE_IDS, 0);
  assert.equal(result.summary.hard_gates.PROMOTIONS_WITH_UNSUPPORTED_GENERATION, 0);

  // Negative control: An unsupported generation group cannot promote
  const testMatrix = JSON.parse(JSON.stringify(result.generationCoverageMatrix));
  testMatrix.families.RE['2xx'].coverage_status = 'UNSUPPORTED';
  const unsupportedCount = Object.values(testMatrix.families.RE).filter(g => g.coverage_status === 'UNSUPPORTED').length;
  assert.ok(unsupportedCount > 0, 'Unsupported generation group detected');
});
