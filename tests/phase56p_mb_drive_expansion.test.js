/**
 * tests/phase56p_mb_drive_expansion.test.js
 *
 * Test suite for Phase 56P: VIKING MB Verified Drive-Type Expansion.
 *
 * Verifies:
 *   1. Cohort baseline: 956 total, 25 attachments, 52 noise, 879 powered candidates; 48 MB models (all powered candidates, 0 attachments, 0 noise, 48 unknown before).
 *   2. VIKING First-Party Manufacturer Evidence: 1992 acquisition, 2018 STIHL Tirol, 2019 rebrand, parts & service guarantee, Service Kit 51, official manuals.
 *   3. Starter Battery Discrimination: MB 545 VE resolved as PETROL (NOT BATTERY).
 *   4. Generation Matrix & Selective Promotion: exactly 36 models promoted as PETROL across 9 covered groups.
 *   5. Unsupported Generation Rejection: exactly 12 models fail-closed to UNKNOWN (UNSUPPORTED_GENERATION).
 *   6. Prefix Collision Safety: ME, MA, RM, RMA, MS unaffected; word boundary check.
 *   7. Explicit Precedence & Zero Conflicts: explicit power source beats family rule; 0 conflicts.
 *   8. Coverage Metrics & Arithmetic: 481 -> 517 resolved (+36), 398 -> 362 unknown (-36), 54.72% -> 58.82% (+4.10%).
 *   9. Artifact Presence & Hard Gates: all 12 artifacts exist in output/phase56p/ and pass all hard gates.
 *  10. Catalog Freeze Invariants Preserved: 956/25/52/879, parts 17,082, fitments 175,106, configs 766, evidence 208,412, contexts 814.
 *  11. Registry ↔ Fetch Ledger Parity & Hash Integrity: rule fields match ledger record, excerpt hash recomputed.
 *  12. Negative Controls: Registry & Ledger Provenance Gates (mismatched fetch ID, excerpt hash manipulation, unverified ledger).
 *  13. Fail-Closed Verifier Negative Controls (missing excerpt, missing hash, unavailable hasher, hash mismatch).
 *  14. Clean Checkout Reproducibility Test: empty temporary cache directory.
 *  15. No-Cache Negative Test: fails closed when network/snapshot absent.
 *  16. Tampered PDF Buffer Negative Test: PDF_DOCUMENT_HASH_MISMATCH.
 *  17. Metadata-Only Manual Negative Control: cannot create COVERED status without actual bytes.
 *  18. Cross-Family Regression Freeze: HOS, USG, RE, RM, RMA, MS, FS, BG, TS, HS continue resolving with zero regressions.
 *  19. Clean Execution Verification: builder executes deterministically with write=false.
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

import {
  buildPhase56pMbDriveExpansion,
  MB_COVERED_MODELS,
  MB_UNSUPPORTED_MODELS,
  OFFICIAL_MB_MANUAL_CATALOG
} from '../scripts/build_phase56p_mb_drive_expansion.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56p');
const LEDGER_PATH = path.join(REPO_ROOT, 'data', 'harvest', 'phase56l', 'official_family_fetch_ledger.json');

test('Phase 56P — 1. Target Cohort Baseline & Population Invariants', async () => {
  const result = await buildPhase56pMbDriveExpansion({ write: false });
  const b = result.baselineSummary;

  assert.equal(b.total_catalog_models, 956, 'Total catalog models must remain 956');
  assert.equal(b.unpowered_attachments, 25, 'Unpowered attachments must remain exactly 25');
  assert.equal(b.confirmed_non_machine_noise, 52, 'Non-machine noise must remain exactly 52');
  assert.equal(b.powered_machine_candidates, 879, 'Powered machine candidate denominator must be 879');
  assert.equal(b.resolved_powered_candidates_before, 481, 'Baseline resolved before Phase 56P must be 481');
  assert.equal(b.unknown_powered_candidates_before, 398, 'Baseline unknown before Phase 56P must be 398');
  assert.equal(b.coverage_percentage_before, 54.72, 'Baseline coverage must be 54.72%');

  assert.equal(b.target_cohort.total_models, 48, 'Target MB total models must be 48');
  assert.equal(b.target_cohort.unpowered_attachments, 0, 'Target MB attachments must be 0');
  assert.equal(b.target_cohort.non_machine_noise, 0, 'Target MB noise must be 0');
  assert.equal(b.target_cohort.powered_candidates, 48, 'Target MB powered candidates must be 48');
  assert.equal(b.target_cohort.resolved_before, 0, 'Target MB resolved before Phase 56P must be 0');
  assert.equal(b.target_cohort.unknown_before, 48, 'Target MB unknown before Phase 56P must be 48');
});

test('Phase 56P — 2. VIKING First-Party Manufacturer Evidence & Provenance', async () => {
  const result = await buildPhase56pMbDriveExpansion({ write: false });
  const ev = result.officialEvidenceLedger;

  // Heritage verification
  assert.equal(ev.manufacturer_heritage.parent_company, 'ANDREAS STIHL AG & Co. KG');
  assert.equal(ev.manufacturer_heritage.acquisition_year, 1992);
  assert.equal(ev.manufacturer_heritage.company_renaming_year, 2018);
  assert.equal(ev.manufacturer_heritage.brand_transition_year, 2019);
  assert.equal(ev.manufacturer_heritage.parts_and_service_guarantee, true);
  assert.ok(ev.manufacturer_heritage.official_faq_url.includes('stihl.nl'));

  // Service Kit 51 verification
  assert.equal(ev.official_service_kit_evidence.service_kit_id, 'STIHL_SERVICE_KIT_51');
  assert.equal(ev.official_service_kit_evidence.machine_category, 'STIHL benzinegrasmaaiers');
  assert.ok(ev.official_service_kit_evidence.title.includes('MB 248.4'));

  // Official Manuals Catalog
  assert.equal(ev.official_manuals.length, 12, 'Must include 12 official instruction manuals');
  for (const m of ev.official_manuals) {
    assert.ok(m.url.startsWith('https://ssc.stihl.com/'), `${m.document_id} must be hosted on ssc.stihl.com`);
    assert.ok(m.sha256.length === 64, `${m.document_id} must have 64-char SHA256`);
    assert.ok(m.bytes > 1000000, `${m.document_id} must have verifiable byte length`);
    assert.equal(m.verification_status, 'VERIFIED');
  }
});

test('Phase 56P — 3. Starter Battery Discrimination (MB 545 VE)', async () => {
  // Negative test: Starter battery != Battery drive
  const res = resolveDriveType('MB 545 VE');
  assert.equal(res.drive_type, DRIVE_TYPES.PETROL, 'MB 545 VE must resolve to PETROL, not BATTERY');
  assert.notEqual(res.drive_type, DRIVE_TYPES.BATTERY, 'MB 545 VE must NOT resolve to BATTERY');
  assert.equal(res.resolution, 'FAMILY_RULE', 'MB 545 VE must resolve via FAMILY_RULE');
  assert.equal(res.family, 'MB');

  // Same for MB 545.1
  const res545 = resolveDriveType('MB 545.1');
  assert.equal(res545.drive_type, DRIVE_TYPES.PETROL);
  assert.equal(res545.resolution, 'FAMILY_RULE');
});

test('Phase 56P — 4. Generation Matrix & Selective Promotion (36 Models)', async () => {
  const result = await buildPhase56pMbDriveExpansion({ write: false });
  const matrix = result.generationCoverageMatrix;

  assert.equal(matrix.total_target_models, 48);
  assert.equal(matrix.covered_models_count, 36);
  assert.equal(matrix.unsupported_models_count, 12);
  assert.equal(matrix.generation_groups_covered, 9);
  assert.equal(matrix.generation_groups_unsupported, 4);

  // Verify all 36 covered models resolve to PETROL
  for (const model of MB_COVERED_MODELS) {
    const res = resolveDriveType(model);
    assert.equal(res.drive_type, DRIVE_TYPES.PETROL, `${model} must resolve to PETROL`);
    assert.equal(res.display, DISPLAY_LABELS.PETROL, `${model} display must be Benzine`);
    assert.equal(res.resolution, 'FAMILY_RULE', `${model} resolution must be FAMILY_RULE`);
    assert.equal(res.family, 'MB', `${model} family must be MB`);
  }
});

test('Phase 56P — 5. Unsupported Generation Rejection (12 Models Fail Closed)', async () => {
  assert.equal(MB_UNSUPPORTED_MODELS.length, 12);

  // Verify all 12 unsupported legacy models fail closed to UNKNOWN
  for (const model of MB_UNSUPPORTED_MODELS) {
    const res = resolveDriveType(model);
    assert.equal(res.drive_type, DRIVE_TYPES.UNKNOWN, `${model} must fail closed to UNKNOWN`);
    assert.equal(res.display, DISPLAY_LABELS.UNKNOWN, `${model} display must be Niet vastgesteld`);
    assert.equal(res.resolution, 'UNSUPPORTED_GENERATION', `${model} resolution must be UNSUPPORTED_GENERATION`);
    assert.equal(res.family, 'MB', `${model} family must be MB`);
  }
});

test('Phase 56P — 6. Prefix Collision Safety', async () => {
  const collisionCases = [
    { name: 'ME 235', expectedFamily: null, expectedDrive: DRIVE_TYPES.UNKNOWN },
    { name: 'MA 339', expectedFamily: null, expectedDrive: DRIVE_TYPES.UNKNOWN },
    { name: 'RM 448', expectedFamily: 'RM', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'RMA 448', expectedFamily: 'RMA', expectedDrive: DRIVE_TYPES.BATTERY },
    { name: 'MS 211', expectedFamily: 'MS', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'MBA 100', expectedFamily: null, expectedDrive: DRIVE_TYPES.UNKNOWN }
  ];

  for (const c of collisionCases) {
    const res = resolveDriveType(c.name);
    assert.notEqual(res.family, 'MB', `${c.name} must not be captured by MB rule`);
    if (c.expectedFamily) {
      assert.equal(res.family, c.expectedFamily, `${c.name} family must be ${c.expectedFamily}`);
      assert.equal(res.drive_type, c.expectedDrive, `${c.name} drive_type must be ${c.expectedDrive}`);
    }
  }
});

test('Phase 56P — 7. Explicit Model Precedence & Zero Conflicts', async () => {
  // Test explicit override precedence over MB rule
  const explicitBatteryMock = {
    model_name: 'MB 248.4',
    explicit_power_source: 'Battery'
  };
  const conflictRes = resolveDriveType(explicitBatteryMock);
  // Contradiction between explicit BATTERY and verified MB rule PETROL must trigger conflict quarantine
  assert.equal(conflictRes.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.equal(conflictRes.resolution, 'CONFLICT_QUARANTINED');

  const result = await buildPhase56pMbDriveExpansion({ write: false });
  assert.equal(result.driveConflicts.length, 0, 'Catalog must contain 0 explicit vs family conflicts for MB');
  assert.equal(result.summary.hard_gates.MB_DRIVE_CONFLICTS, 0);
});

test('Phase 56P — 8. Coverage Metrics & Arithmetic', async () => {
  const result = await buildPhase56pMbDriveExpansion({ write: false });
  const c = result.coverageBeforeAfter;

  // Denominator: 879
  assert.equal(c.baseline.powered_machine_candidates, 879);
  assert.equal(c.after.powered_machine_candidates, 879);

  // Before: 481 (54.72%)
  assert.equal(c.baseline.resolved_powered_candidates, 481);
  assert.equal(c.baseline.unknown_powered_candidates, 398);
  assert.equal(c.baseline.coverage_percentage, 54.72);

  // Promotions: +36
  assert.equal(c.deltas.resolved_candidates_delta, 36);
  assert.equal(c.deltas.unknown_candidates_delta, -36);
  assert.equal(c.deltas.coverage_percentage_delta, 4.10);

  // After: 517 (58.82%)
  assert.equal(c.after.resolved_powered_candidates, 517);
  assert.equal(c.after.unknown_powered_candidates, 362);
  assert.equal(c.after.coverage_percentage, 58.82);
});

test('Phase 56P — 9. Artifact Presence & Hard Gates', async () => {
  const expectedArtifacts = [
    'MB_TARGET_BASELINE.json',
    'MB_OFFICIAL_EVIDENCE_LEDGER.json',
    'MB_GENERATION_COVERAGE_MATRIX.json',
    'MB_PREFIX_COLLISION_AUDIT.json',
    'MB_ACTIVATION_DECISION.json',
    'MB_DRIVE_PROMOTIONS.json',
    'MB_DRIVE_CONFLICTS.json',
    'COVERAGE_BEFORE_AFTER.json',
    'PROVENANCE_INTEGRITY.json',
    'CATALOG_INTEGRITY.json',
    'PHASE56P_SUMMARY.json',
    'PHASE56P_REPORT.md'
  ];

  for (const file of expectedArtifacts) {
    const p = path.join(OUTPUT_DIR, file);
    assert.ok(fs.existsSync(p), `Artifact ${file} must exist in output/phase56p/`);
    const stat = fs.statSync(p);
    assert.ok(stat.size > 0, `Artifact ${file} must not be empty`);
  }

  const result = await buildPhase56pMbDriveExpansion({ write: false });
  const gates = result.summary.hard_gates;

  assert.equal(gates.MB_TARGET_TOTAL, true);
  assert.equal(gates.MB_ATTACHMENT_LEAKAGE, 0);
  assert.equal(gates.MB_NON_MACHINE_LEAKAGE, 0);
  assert.equal(gates.MB_BLANKET_RULE_PREVENTED, true);
  assert.equal(gates.MB_PROMOTIONS_EXACT, true);
  assert.equal(gates.MB_UNSUPPORTED_EXACT, true);
  assert.equal(gates.MB_DRIVE_CONFLICTS, 0);
  assert.equal(gates.UNSAFE_DRIVE_PROMOTIONS, 0);
  assert.equal(gates.PROMOTIONS_WITHOUT_EVIDENCE_IDS, 0);
  assert.equal(gates.STARTER_BATTERY_DISCRIMINATED, true);
  assert.equal(gates.CATALOG_FREEZE_INTACT, true);
});

test('Phase 56P — 10. Catalog Freeze Invariants Preserved', async () => {
  const result = await buildPhase56pMbDriveExpansion({ write: false });
  const inv = result.catalogIntegrity.invariants;

  assert.equal(inv.total_catalog_models, 956);
  assert.equal(inv.unpowered_attachments, 25);
  assert.equal(inv.confirmed_non_machine_noise, 52);
  assert.equal(inv.powered_machine_candidates, 879);
  assert.equal(inv.total_parts, 17082);
  assert.equal(inv.total_fitments, 175106);
  assert.equal(inv.total_configurations, 766);
  assert.equal(inv.total_evidence_records, 208412);
  assert.equal(inv.total_section_contexts, 814);
  assert.equal(inv.total_indexable_models, 843);
  assert.equal(inv.total_sitemap_urls, 1024);
  assert.equal(inv.amazon_fallback_links, 17082);
  assert.equal(inv.verified_asin_links, 0);
  assert.equal(inv.affiliate_tag, 'srihldecoder2-21');
  assert.equal(inv.catalog_frozen, true);
});

test('Phase 56P — 11. Registry ↔ Fetch Ledger Parity & Hash Integrity', async () => {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const mbRule = OFFICIAL_STIHL_FAMILY_RULES.MB;
  assert.ok(mbRule, 'MB family rule must exist in OFFICIAL_STIHL_FAMILY_RULES');

  const lRec = ledger.find(l => l.family === 'MB' && l.fetch_id === mbRule.fetch_id);
  assert.ok(lRec, 'MB record must exist in fetch ledger');

  assert.equal(mbRule.fetch_id, lRec.fetch_id);
  assert.equal(mbRule.family, lRec.family);
  assert.equal(mbRule.drive_type, lRec.drive_type);
  assert.equal(mbRule.body_sha256, lRec.body_sha256);

  // Excerpt hash recomputation: SHA256(UTF8(source_excerpt))
  const excerpt = mbRule.extracted_evidence?.source_excerpt || mbRule.source_excerpt;
  assert.ok(excerpt, 'MB rule must have source_excerpt');
  const computedExcerptHash = crypto.createHash('sha256').update(excerpt).digest('hex');
  assert.equal(
    mbRule.extracted_evidence?.source_excerpt_hash,
    computedExcerptHash,
    'MB registry source_excerpt_hash must equal recomputed SHA256(UTF8(source_excerpt))'
  );
  assert.equal(
    lRec.source_excerpt_hash,
    computedExcerptHash,
    'MB ledger source_excerpt_hash must equal recomputed SHA256(UTF8(source_excerpt))'
  );

  const parityResult = verifyActiveFamilyRuleProvenance(mbRule, ledger);
  assert.equal(parityResult.valid, true, `MB provenance parity must be valid: ${parityResult.errors.join('; ')}`);
  assert.equal(parityResult.errors.length, 0);
});

test('Phase 56P — 12. Negative Controls: Registry & Ledger Provenance Gates', async () => {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

  // Negative 1: Registry fetch ID mismatch
  const fakeRuleFetchId = {
    ...OFFICIAL_STIHL_FAMILY_RULES.MB,
    fetch_id: 'fetch_stihl_family_999'
  };
  const neg1 = verifyActiveFamilyRuleProvenance(fakeRuleFetchId, ledger);
  assert.equal(neg1.valid, false);
  assert.ok(neg1.errors.some(e => e.includes('fetch_id') || e.includes('missing')));

  // Negative 2: Manipulate source_excerpt_hash = body_sha256 when excerpt != body
  const fakeRuleExcerptHash = {
    ...OFFICIAL_STIHL_FAMILY_RULES.MB,
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.MB.extracted_evidence,
      source_excerpt_hash: OFFICIAL_STIHL_FAMILY_RULES.MB.body_sha256
    }
  };
  const neg2 = verifyActiveFamilyRuleProvenance(fakeRuleExcerptHash, ledger);
  assert.equal(neg2.valid, false);
  assert.ok(neg2.errors.some(e => e.includes('body_sha256 cannot equal source_excerpt_hash') || e.includes('mismatch')));

  // Negative 3: Ledger verification_status = UNVERIFIED
  const fakeLedgerStatus = ledger.map(l => l.family === 'MB' ? { ...l, verification_status: 'UNVERIFIED_CONTEXT_MISMATCH' } : l);
  const neg3 = verifyActiveFamilyRuleProvenance(OFFICIAL_STIHL_FAMILY_RULES.MB, fakeLedgerStatus);
  assert.equal(neg3.valid, false);
  assert.ok(neg3.errors.some(e => e.includes('verification_status mismatch')));

  // Negative 4: Ledger context_bound = false
  const fakeLedgerContext = ledger.map(l => l.family === 'MB' ? { ...l, context_bound: false } : l);
  const neg4 = verifyActiveFamilyRuleProvenance(OFFICIAL_STIHL_FAMILY_RULES.MB, fakeLedgerContext);
  assert.equal(neg4.valid, false);
  assert.ok(neg4.errors.some(e => e.includes('context_bound mismatch')));
});

test('Phase 56P — 13. Fail-Closed Verifier Negative Controls', async () => {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

  // Negative A: Missing source_excerpt
  const fakeMissingExcerpt = {
    ...OFFICIAL_STIHL_FAMILY_RULES.MB,
    source_excerpt: null,
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.MB.extracted_evidence,
      source_excerpt: null
    }
  };
  const negA = verifyActiveFamilyRuleProvenance(fakeMissingExcerpt, ledger);
  assert.equal(negA.valid, false);
  assert.ok(negA.errors.includes('MISSING_SOURCE_EXCERPT'));

  // Negative B: Missing source_excerpt_hash
  const fakeMissingHash = {
    ...OFFICIAL_STIHL_FAMILY_RULES.MB,
    source_excerpt_hash: null,
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.MB.extracted_evidence,
      source_excerpt_hash: null
    }
  };
  const negB = verifyActiveFamilyRuleProvenance(fakeMissingHash, ledger);
  assert.equal(negB.valid, false);
  assert.ok(negB.errors.includes('MISSING_SOURCE_EXCERPT_HASH'));

  // Negative C: Hash computation unavailable
  const negC = verifyActiveFamilyRuleProvenance(OFFICIAL_STIHL_FAMILY_RULES.MB, ledger, { hasherUnavailable: true });
  assert.equal(negC.valid, false);
  assert.ok(negC.errors.includes('HASH_COMPUTATION_UNAVAILABLE'));

  // Negative D: Source excerpt hash mismatch
  const fakeBadHash = {
    ...OFFICIAL_STIHL_FAMILY_RULES.MB,
    source_excerpt_hash: '1111111111111111111111111111111111111111111111111111111111111111',
    extracted_evidence: {
      ...OFFICIAL_STIHL_FAMILY_RULES.MB.extracted_evidence,
      source_excerpt_hash: '1111111111111111111111111111111111111111111111111111111111111111'
    }
  };
  const negD = verifyActiveFamilyRuleProvenance(fakeBadHash, ledger);
  assert.equal(negD.valid, false);
  assert.ok(negD.errors.includes('SOURCE_EXCERPT_HASH_MISMATCH'));
});

test('Phase 56P — 14. Clean Checkout Reproducibility Test', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-clean-checkout-'));
  try {
    const result = await buildPhase56pMbDriveExpansion({
      write: false,
      cacheDir: emptyTempDir,
      allowLiveFetch: true
    });

    assert.equal(result.summary.outcome_status, 'PASS');
    assert.equal(result.summary.hard_gates.CLEAN_CHECKOUT_EVIDENCE_REPRODUCIBLE, true);
    assert.equal(result.summary.hard_gates.PDF_DOCUMENT_HASH_MISMATCHES, 0);
    assert.equal(result.summary.hard_gates.PDF_EXTRACTION_FAILURES, 0);
    assert.equal(result.summary.hard_gates.PAGE_EVIDENCE_FAILURES, 0);
    assert.equal(result.drivePromotions.length, 36);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 15. No-Cache Negative Test (Fails Closed When Network/Snapshot Absent)', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-no-cache-'));
  try {
    const result = await buildPhase56pMbDriveExpansion({
      write: false,
      cacheDir: emptyTempDir,
      allowLiveFetch: false
    });

    assert.equal(result.provenanceIntegrity.metrics.document_fetch_failures, 1);
    assert.equal(result.provenanceIntegrity.provenance_integrity_passed, false);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 16. Tampered PDF Buffer Negative Test', async () => {
  const tamperedBuffer = Buffer.from('%PDF-1.4 tampered MB test manual buffer');
  const result = await buildPhase56pMbDriveExpansion({
    write: false,
    mockPdfBuffer: tamperedBuffer
  });

  assert.equal(result.provenanceIntegrity.metrics.document_hash_mismatches, 1);
  assert.equal(result.provenanceIntegrity.provenance_integrity_passed, false);
  assert.equal(result.summary.hard_gates.PDF_DOCUMENT_HASH_MISMATCHES, 1);
});

test('Phase 56P — 17. Metadata-Only Manual Negative Control', async () => {
  const result = await buildPhase56pMbDriveExpansion({ write: false });
  const matrix = result.generationCoverageMatrix.generation_groups;

  // Unsupported groups without verifiable document bytes must have status UNSUPPORTED and 0 evidence IDs
  const unsupportedGroups = ['MB 1xx', 'MB 4xx', 'MB 5xx', 'MB 7xx / 8xx'];
  for (const grp of unsupportedGroups) {
    assert.equal(matrix[grp].status, 'UNSUPPORTED', `Group ${grp} must be UNSUPPORTED`);
    assert.equal(matrix[grp].official_evidence_ids.length, 0);
  }
});

test('Phase 56P — 18. Cross-Family Regression Freeze', async () => {
  // Check that previously resolved families continue resolving identically
  const regressionAnchors = [
    { name: 'HOS Sharpeners', drive: DRIVE_TYPES.MAINS_ELECTRIC, res: 'EXPLICIT_MODEL' },
    { name: 'USG Sharpeners', drive: DRIVE_TYPES.MAINS_ELECTRIC, res: 'EXPLICIT_MODEL' },
    { name: 'RE 130', drive: DRIVE_TYPES.MAINS_ELECTRIC, res: 'FAMILY_RULE' },
    { name: 'RM 448', drive: DRIVE_TYPES.PETROL, res: 'FAMILY_RULE' },
    { name: 'RMA 448', drive: DRIVE_TYPES.BATTERY, res: 'FAMILY_RULE' },
    { name: 'MS 211', drive: DRIVE_TYPES.PETROL, res: 'FAMILY_RULE' },
    { name: 'MSA 120', drive: DRIVE_TYPES.BATTERY, res: 'FAMILY_RULE' },
    { name: 'FS 55', drive: DRIVE_TYPES.PETROL, res: 'FAMILY_RULE' },
    { name: 'FSA 45', drive: DRIVE_TYPES.BATTERY, res: 'FAMILY_RULE' },
    { name: 'BG 50', drive: DRIVE_TYPES.PETROL, res: 'FAMILY_RULE' },
    { name: 'BGA 45', drive: DRIVE_TYPES.BATTERY, res: 'FAMILY_RULE' },
    { name: 'TS 410', drive: DRIVE_TYPES.PETROL, res: 'FAMILY_RULE' },
    { name: 'TSA 230', drive: DRIVE_TYPES.BATTERY, res: 'FAMILY_RULE' },
    { name: 'HS 45', drive: DRIVE_TYPES.PETROL, res: 'FAMILY_RULE' },
    { name: 'HSA 26', drive: DRIVE_TYPES.BATTERY, res: 'FAMILY_RULE' }
  ];

  for (const a of regressionAnchors) {
    const res = resolveDriveType(a.name);
    assert.equal(res.drive_type, a.drive, `${a.name} drive_type must be ${a.drive}`);
    assert.equal(res.resolution, a.res, `${a.name} resolution must be ${a.res}`);
  }
});

test('Phase 56P — 19. Clean Execution Verification', async () => {
  const result = await buildPhase56pMbDriveExpansion({ write: false });
  assert.equal(result.summary.outcome_status, 'PASS');
  assert.equal(result.summary.hard_gates.UNSAFE_DRIVE_PROMOTIONS, 0);
  assert.equal(result.summary.hard_gates.PROMOTIONS_WITHOUT_EVIDENCE_IDS, 0);
  assert.equal(result.summary.hard_gates.MB_PROMOTIONS_EXACT, true);
  assert.equal(result.summary.hard_gates.MB_UNSUPPORTED_EXACT, true);
});
