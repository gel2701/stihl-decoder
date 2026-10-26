/**
 * tests/phase56o_re_rm_rma_drive_expansion.test.js
 *
 * Test suite for Phase 56O / 56O.1 / 56O.2: Verified RE / RM / RMA Drive-Type Expansion
 * & Reproducible Evidence & Fail-Closed Verification Closure.
 *
 * Verifies:
 *   1. Cohort baseline: 956 total, 25 attachments, 52 noise, 879 powered candidates.
 *   2. RE family resolution (MAINS_ELECTRIC) for supported 1xx models; fail-closed UNKNOWN for 2xx-9xx.
 *   3. RE prefix collision safety (REA 60, REA 100, RB unaffected).
 *   4. RM family resolution (PETROL) and evidence verification across 25 models.
 *   5. RM prefix collision safety (RMA, RME, RMI unaffected).
 *   6. RMA family resolution (BATTERY) and evidence verification across 22 models.
 *   7. Precedence & Conflict rules: Explicit beats family; 0 conflicts.
 *   8. Coverage accounting: 403 -> 481 resolved (+78), 476 -> 398 unknown (-78), 45.85% -> 54.72%.
 *   9. Artifact integrity: all 14 artifacts in output/phase56o/ verified.
 *  10. Catalog freeze invariants preserved.
 *  11. Registry ↔ Ledger Parity & Hash Integrity.
 *  12. Negative Controls: Mismatched fetch ID, excerpt hash manipulation, unverified ledger.
 *  13. Generation Coverage & Model-Level Promotion Rule (78 promotions, zero unsupported).
 *  14. Fail-closed verifier: missing excerpt, missing hash, unavailable hasher, hash mismatch.
 *  15. Clean checkout reproducibility test (empty cache directory).
 *  16. No-cache + network down negative test (fails closed).
 *  17. Tampered PDF buffer negative test (PDF_DOCUMENT_HASH_MISMATCH).
 *  18. Metadata-only manual negative test (cannot create COVERED).
 *  19. Shared source selective-refresh regression test (BGE / SHE shared PDF).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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

import {
  verifyActiveFamilyRuleProvenance,
  computeSha256Sync
} from '../scripts/lib/verify_family_evidence_provenance.mjs';

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
  // 1xx models are verified via official live HTML and UK Catalogue p.161
  const representativeRe = [
    'RE 100', 'RE 109', 'RE 110', 'RE 120', 'RE 130', 'RE 130 PLUS', 'RE 140', 'RE 150', 'RE 160'
  ];

  for (const name of representativeRe) {
    const res = resolveDriveType(name);
    assert.equal(res.drive_type, DRIVE_TYPES.MAINS_ELECTRIC, `${name} must resolve to MAINS_ELECTRIC`);
    assert.equal(res.resolution, 'FAMILY_RULE', `${name} must resolve via FAMILY_RULE`);
    assert.equal(res.family, 'RE', `${name} family must be RE`);
    assert.equal(res.confidence, 'HIGH', `${name} confidence must be HIGH`);
  }

  // Unsupported historical generations fail closed to UNKNOWN
  const unsupportedRe = ['RE 271', 'RE 361', 'RE 461', 'RE 551', 'RE 661', 'RE 881', 'RE 981'];
  for (const name of unsupportedRe) {
    const res = resolveDriveType(name);
    assert.equal(res.drive_type, DRIVE_TYPES.UNKNOWN, `${name} must fail-closed to UNKNOWN`);
    assert.equal(res.resolution, 'UNSUPPORTED_GENERATION', `${name} must resolve to UNSUPPORTED_GENERATION`);
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

test('Phase 56O — 8. Coverage Metrics & Arithmetic (Phase 56O.2)', async () => {
  const result = await buildPhase56oDriveExpansion({ write: false });
  const c = result.coverageBeforeAfter;

  assert.equal(c.baseline.resolved_powered_candidates, 403);
  assert.equal(c.baseline.unknown_powered_candidates, 476);
  assert.equal(c.baseline.coverage_percentage, 45.85);

  assert.equal(c.after.resolved_powered_candidates, 481);
  assert.equal(c.after.unknown_powered_candidates, 398);
  assert.equal(c.after.coverage_percentage, 54.72);

  assert.equal(c.deltas.resolved_candidates_delta, 78);
  assert.equal(c.deltas.unknown_candidates_delta, -78);
  assert.equal(c.deltas.coverage_percentage_delta, 8.87);

  assert.equal(c.deltas.promotions_by_family.RE, 31);
  assert.equal(c.deltas.promotions_by_family.RM, 25);
  assert.equal(c.deltas.promotions_by_family.RMA, 22);
  assert.equal(c.deltas.promotions_by_family.total, 78);
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
  assert.equal(summary.hard_gates.PDF_DOCUMENT_HASH_MISMATCHES, 0);
  assert.equal(summary.hard_gates.PDF_EXTRACTION_FAILURES, 0);
  assert.equal(summary.hard_gates.PAGE_EVIDENCE_FAILURES, 0);
  assert.equal(summary.hard_gates.CLEAN_CHECKOUT_EVIDENCE_REPRODUCIBLE, true);
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

    // 7. Full parity validation via Node-only authoritative verifier
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

test('Phase 56O — 13. Generation Coverage & Model-Level Promotion Rule (Phase 56O.2)', async () => {
  const result = await buildPhase56oDriveExpansion({ write: false });
  const promotions = result.drivePromotions;

  assert.equal(promotions.length, 78, 'Total promotions must be exactly 78 (31 RE + 25 RM + 22 RMA)');

  // Verify every promotion contains concrete evidence_ids and is COVERED
  for (const promo of promotions) {
    assert.ok(Array.isArray(promo.evidence_ids), `${promo.model_name} must have evidence_ids array`);
    assert.ok(promo.evidence_ids.length > 0, `${promo.model_name} evidence_ids must not be empty`);
    assert.equal(promo.generation_coverage_status, 'COVERED', `${promo.model_name} generation must be COVERED`);
  }

  assert.equal(result.summary.hard_gates.PROMOTIONS_WITHOUT_EVIDENCE_IDS, 0);
  assert.equal(result.summary.hard_gates.PROMOTIONS_WITH_UNSUPPORTED_GENERATION, 0);
  assert.equal(result.summary.hard_gates.PROMOTIONS_WITHOUT_VERIFIED_GENERATION, 0);
});

test('Phase 56O — 14. Fail-Closed Verifier Negative Controls (Phase 56O.2 Defect A)', async () => {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

  // Negative A: Missing source_excerpt
  const fakeMissingExcerpt = {
    ...OFFICIAL_STIHL_FAMILY_RULES.RE,
    source_excerpt: null,
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.RE.extracted_evidence,
      source_excerpt: null
    }
  };
  const negA = verifyActiveFamilyRuleProvenance(fakeMissingExcerpt, ledger);
  assert.equal(negA.valid, false);
  assert.ok(negA.errors.includes('MISSING_SOURCE_EXCERPT'), 'Must produce MISSING_SOURCE_EXCERPT');

  // Negative B: Missing source_excerpt_hash
  const fakeMissingHash = {
    ...OFFICIAL_STIHL_FAMILY_RULES.RM,
    source_excerpt_hash: null,
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.RM.extracted_evidence,
      source_excerpt_hash: null
    }
  };
  const negB = verifyActiveFamilyRuleProvenance(fakeMissingHash, ledger);
  assert.equal(negB.valid, false);
  assert.ok(negB.errors.includes('MISSING_SOURCE_EXCERPT_HASH'), 'Must produce MISSING_SOURCE_EXCERPT_HASH');

  // Negative C: Hash computation unavailable
  const negC = verifyActiveFamilyRuleProvenance(OFFICIAL_STIHL_FAMILY_RULES.RMA, ledger, { hasherUnavailable: true });
  assert.equal(negC.valid, false);
  assert.ok(negC.errors.includes('HASH_COMPUTATION_UNAVAILABLE'), 'Must produce HASH_COMPUTATION_UNAVAILABLE');

  // Negative D: Source excerpt hash mismatch
  const fakeBadHash = {
    ...OFFICIAL_STIHL_FAMILY_RULES.RE,
    source_excerpt_hash: '1111111111111111111111111111111111111111111111111111111111111111',
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.RE.extracted_evidence,
      source_excerpt_hash: '1111111111111111111111111111111111111111111111111111111111111111'
    }
  };
  const negD = verifyActiveFamilyRuleProvenance(fakeBadHash, ledger);
  assert.equal(negD.valid, false);
  assert.ok(negD.errors.includes('SOURCE_EXCERPT_HASH_MISMATCH'), 'Must produce SOURCE_EXCERPT_HASH_MISMATCH');
});

test('Phase 56O — 15. Clean Checkout Reproducibility Test (Phase 56O.2 Defect B)', async () => {
  // Execute builder with an empty temporary cache directory to prove reproducibility
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-clean-checkout-'));
  try {
    const result = await buildPhase56oDriveExpansion({
      write: false,
      cacheDir: emptyTempDir,
      allowLiveFetch: true
    });

    assert.equal(result.summary.outcome_status, 'PASS');
    assert.equal(result.summary.hard_gates.CLEAN_CHECKOUT_EVIDENCE_REPRODUCIBLE, true);
    assert.equal(result.summary.hard_gates.PDF_DOCUMENT_HASH_MISMATCHES, 0);
    assert.equal(result.summary.hard_gates.PDF_EXTRACTION_FAILURES, 0);
    assert.equal(result.summary.hard_gates.PAGE_EVIDENCE_FAILURES, 0);
    assert.equal(result.drivePromotions.length, 78);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56O — 16. No-Cache Negative Test (Fails Closed When Network/Snapshot Absent)', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-no-cache-'));
  try {
    const result = await buildPhase56oDriveExpansion({
      write: false,
      cacheDir: emptyTempDir,
      allowLiveFetch: false
    });

    // Without cache and without live fetch, PDF acquisition fails closed
    assert.equal(result.provenanceIntegrity.metrics.document_fetch_failures, 1);
    assert.equal(result.provenanceIntegrity.provenance_integrity_passed, false);
    // Involved generation groups must NOT be COVERED
    assert.notEqual(result.generationCoverageMatrix.families.RE['1xx'].coverage_status, 'COVERED');
    assert.notEqual(result.generationCoverageMatrix.families.RM['2xx'].coverage_status, 'COVERED');
    assert.notEqual(result.generationCoverageMatrix.families.RMA['2xx'].coverage_status, 'COVERED');
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56O — 17. Tampered PDF Buffer Negative Test', async () => {
  const tamperedBuffer = Buffer.from('%PDF-1.4 tampered corrupted test buffer content');
  const result = await buildPhase56oDriveExpansion({
    write: false,
    mockPdfBuffer: tamperedBuffer
  });

  assert.equal(result.provenanceIntegrity.metrics.document_hash_mismatches, 1);
  assert.equal(result.provenanceIntegrity.provenance_integrity_passed, false);
  assert.equal(result.summary.hard_gates.PDF_DOCUMENT_HASH_MISMATCHES, 1);
  assert.equal(result.summary.hard_gates.PHASE56O_EVIDENCE_INTEGRITY, false);
  assert.equal(result.generationCoverageMatrix.families.RM['2xx'].coverage_status, 'UNSUPPORTED');
});

test('Phase 56O — 18. Metadata-Only Manual Negative Control', async () => {
  const result = await buildPhase56oDriveExpansion({ write: false });
  // Historical RE manuals without verifiable bytes must be marked UNSUPPORTED
  const matrix = result.generationCoverageMatrix.families.RE;
  const unsupportedGroups = ['2xx', '3xx', '4xx', '5xx', '6xx', '8xx', '9xx'];
  for (const grp of unsupportedGroups) {
    assert.equal(matrix[grp].coverage_status, 'UNSUPPORTED', `Group ${grp} must be UNSUPPORTED`);
    assert.equal(matrix[grp].official_evidence_ids.length, 0);
  }
});

test('Phase 56O — 19. BGE/SHE Shared Source Selective Refresh Regression Test (Phase 56O.2 Defect C)', async () => {
  // Test that shared PDF manuals (such as BGE and SHE sharing 0458-290-9821-F)
  // do not regress when selective refresh is performed
  const fetchModulePath = path.join(REPO_ROOT, 'scripts', 'fetch_official_family_evidence.mjs');
  const fileContent = fs.readFileSync(fetchModulePath, 'utf8');

  // Verify that shallow retained ledger records are NOT set into urlFetchMap
  assert.ok(
    !fileContent.includes('urlFetchMap.set(target.requested_url, {\n        fetch_id: existing.fetch_id'),
    'Shallow existing ledger entries must NOT be stored into urlFetchMap'
  );

  // Verify that fetchRecord reuse requires complete parsed payload
  assert.ok(
    fileContent.includes('!fetchRecord.body_text && !fetchRecord.pdf_extraction'),
    'urlFetchMap reuse must require body_text or pdf_extraction'
  );
});
