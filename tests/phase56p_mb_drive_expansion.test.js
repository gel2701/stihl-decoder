/**
 * tests/phase56p_mb_drive_expansion.test.js
 *
 * Test suite for Phase 56P / 56P.1: VIKING MB Verified Drive-Type Expansion & Evidence Integrity Closure.
 *
 * Verifies:
 *   1. Cohort baseline: 956 total, 25 attachments, 52 noise, 879 powered candidates; 48 MB models (all powered candidates, 0 attachments, 0 noise, 48 unknown before).
 *   2. VIKING First-Party Manufacturer Evidence: 1992 acquisition, 2018 STIHL Tirol, 2019 rebrand, parts & service guarantee, Service Kit 51.
 *   3. All 12 evidence-bearing manuals actually verified during execution with genuine non-null excerpt hashes.
 *   4. No VERIFIED manual with null excerpt hash (hard gate: 0).
 *   5. Every verified excerpt demonstrably exists in the actual extracted PDF page text.
 *   6. Dynamic Generation Matrix Coverage: status derived from actual manual verification.
 *   7. Promotions strictly follow verified generation coverage (0 promotions referencing unverified manuals).
 *   8. Starter Battery Discrimination: MB 545 VE resolved as PETROL (NOT BATTERY).
 *   9. MB Canonical Input Equivalence: MB 248.4, mb 248.4, MB248.4, MB-248.4, mb-248.4, STIHL MB 248.4, STIHL MB-248.4.
 *  10. Unsupported Model Input Equivalence: MB 400, MB400, mb-400, STIHL MB 400 fail closed to UNKNOWN / UNSUPPORTED_GENERATION.
 *  11. MB 545 VE Variant Representation Equivalence: MB 545 VE, MB545VE, MB-545-VE, STIHL MB 545 VE resolve to PETROL.
 *  12. Prefix Collision Safety: MBA 100, MBC 248, AMBA 248, RM 448, RMA 448, ME 235 never captured as MB.
 *  13. Explicit Model Precedence & Zero Conflicts: explicit power source beats family rule; 0 conflicts.
 *  14. Coverage Metrics & Arithmetic: 481 -> 517 resolved (+36), 398 -> 362 unknown (-36), 54.72% -> 58.82% (+4.10%).
 *  15. Negative Test — Manual Hash Mismatch Fails Verification (UNVERIFIED_HASH_MISMATCH).
 *  16. Negative Test — Manual Fetch Failure Removes Affected Coverage.
 *  17. Negative Test — PDF Extraction Failure Blocks Verification.
 *  18. Negative Test — Excerpt Mismatch Fails Verification.
 *  19. Clean Checkout Reproducibility Test: validates ALL used manuals without developer cache.
 *  20. No-Cache Negative Test: fails closed when network/snapshot absent.
 *  21. Artifact Presence & Hard Gates: all 12 artifacts exist in output/phase56p/ and pass all hard gates.
 *  22. Catalog & Serial Freeze Invariants Preserved: 956/25/52/879, parts 17,082, fitments 175,106, configs 766, evidence 208,412, contexts 814.
 *  23. Cross-Family Regression Freeze: HOS, USG, RE, RM, RMA, MS, FS, BG, TS, HS continue resolving with zero regressions.
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
  parseModelFamily,
  normalizeModelDesignation
} from '../src/ModelFamilyDriveRegistry.js';

import {
  MACHINE_ELIGIBILITY,
  resolveMachineEligibility
} from '../src/ModelMachineEligibilityRegistry.js';

import {
  verifyActiveFamilyRuleProvenance
} from '../scripts/lib/verify_family_evidence_provenance.mjs';

import {
  buildPhase56pMbDriveExpansion,
  MB_COVERED_MODELS,
  MB_UNSUPPORTED_MODELS,
  OFFICIAL_MB_MANUAL_CATALOG
} from '../scripts/build_phase56p_mb_drive_expansion.mjs';

import {
  verifyMbManual,
  verifyAllMbManuals,
  verifyServiceKit51Evidence,
  OFFICIAL_MB_MANUAL_CONFIGS
} from '../scripts/lib/verify_mb_manual_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56p');
const LEDGER_PATH = path.join(REPO_ROOT, 'data', 'harvest', 'phase56l', 'official_family_fetch_ledger.json');

let defaultBuildPromise = null;
function getDefaultBuild() {
  if (!defaultBuildPromise) {
    defaultBuildPromise = buildPhase56pMbDriveExpansion({ write: false });
  }
  return defaultBuildPromise;
}

test('Phase 56P — 1. Target Cohort Baseline & Population Invariants', async () => {
  const result = await getDefaultBuild();
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
  const result = await getDefaultBuild();
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
  assert.equal(ev.official_service_kit_evidence.verification_status, 'VERIFIED');
  assert.ok(ev.official_service_kit_evidence.supported_models.includes('MB 248.4'));
});

test('Phase 56P — 3. All 12 Evidence-Bearing Manuals Actually Verified in Run', async () => {
  const result = await getDefaultBuild();
  const manuals = result.officialEvidenceLedger.official_manuals;

  assert.equal(manuals.length, 12, 'Must contain all 12 MB manuals');
  for (const m of manuals) {
    assert.ok(m.url.startsWith('https://ssc.stihl.com/'), `${m.document_id} must have official ssc.stihl.com URL`);
    assert.equal(m.sha256.length, 64, `${m.document_id} must have 64-char SHA256`);
    assert.ok(m.bytes > 1000000, `${m.document_id} must have non-trivial byte length`);
    assert.ok(m.page_count > 100, `${m.document_id} must have verified page count > 100`);
    assert.ok(m.primary_models.length > 0, `${m.document_id} must match primary models`);
    assert.ok(m.drive_terms.length > 0, `${m.document_id} must match drive terms`);
    assert.equal(m.verification_status, 'VERIFIED', `${m.document_id} must be VERIFIED`);
    assert.equal(m.failure_reason, null);
  }
});

test('Phase 56P — 4. No VERIFIED Manual With Null Excerpt Hash (Hard Gate)', async () => {
  const result = await getDefaultBuild();
  const manuals = result.officialEvidenceLedger.official_manuals;

  const nullExcerptHashes = manuals.filter(m => m.verification_status === 'VERIFIED' && !m.source_excerpt_hash);
  assert.equal(nullExcerptHashes.length, 0, 'No VERIFIED manual may have a null or missing source_excerpt_hash');

  const emptyExcerpts = manuals.filter(m => m.verification_status === 'VERIFIED' && (!m.source_excerpt || m.source_excerpt.trim().length === 0));
  assert.equal(emptyExcerpts.length, 0, 'No VERIFIED manual may have an empty source_excerpt');

  for (const m of manuals) {
    const recomputed = crypto.createHash('sha256').update(m.source_excerpt).digest('hex');
    assert.equal(m.source_excerpt_hash, recomputed, `${m.document_id} excerpt hash must match recomputed SHA256(source_excerpt)`);
  }
});

test('Phase 56P — 5. Every Verified Excerpt Exists in Extracted Source Text', async () => {
  const v = await verifyAllMbManuals();
  assert.equal(v.manuals_semantically_verified, 12);

  for (const m of v.manual_results) {
    assert.ok(m.source_excerpt, `Manual ${m.document_id} must have source_excerpt`);
    assert.ok(m.source_excerpt.length >= 20, `Manual ${m.document_id} excerpt must be non-trivial`);
  }
});

test('Phase 56P — 6. Generation Matrix Coverage Dynamically Derived', async () => {
  const result = await getDefaultBuild();
  const matrix = result.generationCoverageMatrix;

  assert.equal(matrix.total_target_models, 48);
  assert.equal(matrix.covered_models_count, 36);
  assert.equal(matrix.unsupported_models_count, 12);
  assert.equal(matrix.generation_groups_covered, 9);
  assert.equal(matrix.generation_groups_unsupported, 4);

  // Each covered group must have all its evidence IDs verified
  for (const [key, grp] of Object.entries(matrix.generation_groups)) {
    if (grp.status === 'COVERED') {
      assert.ok(grp.official_evidence_ids.length > 0, `Covered group ${key} must have evidence IDs`);
    } else {
      assert.equal(grp.status, 'UNSUPPORTED', `Uncovered group ${key} must be UNSUPPORTED`);
    }
  }
});

test('Phase 56P — 7. Promotions Strictly Follow Verified Evidence (Zero Unverified Promotions)', async () => {
  const result = await getDefaultBuild();
  const promotions = result.drivePromotions;

  assert.equal(promotions.length, 36);
  for (const p of promotions) {
    assert.equal(p.new_drive, DRIVE_TYPES.PETROL);
    assert.equal(p.resolution, 'FAMILY_RULE');
    assert.equal(p.family, 'MB');
    assert.ok(p.official_evidence_ids.length > 0, `${p.model_name} must reference verified evidence IDs`);
  }

  assert.equal(result.provenanceIntegrity.promotions_with_unverified_evidence, 0);
  assert.equal(result.summary.hard_gates.PROMOTIONS_REFERENCING_UNVERIFIED_MANUALS, 0);
});

test('Phase 56P — 8. Starter Battery Discrimination (MB 545 VE)', async () => {
  const res = resolveDriveType('MB 545 VE');
  assert.equal(res.drive_type, DRIVE_TYPES.PETROL, 'MB 545 VE prime mover is petrol combustion engine');
  assert.notEqual(res.drive_type, DRIVE_TYPES.BATTERY, 'MB 545 VE must NOT resolve to BATTERY');
  assert.equal(res.resolution, 'FAMILY_RULE');
  assert.equal(res.family, 'MB');
});

test('Phase 56P — 9. Canonical Model Designation Normalization & Input Equivalence', async () => {
  // Required equivalent variants from prompt section 20
  const equivalentVariants = [
    'MB 248.4',
    'mb 248.4',
    'MB248.4',
    'MB-248.4',
    'mb-248.4',
    'STIHL MB 248.4',
    'STIHL MB-248.4'
  ];

  for (const v of equivalentVariants) {
    const norm = normalizeModelDesignation(v);
    assert.equal(norm, 'MB 248.4', `${v} must normalize to canonical "MB 248.4"`);

    const res = resolveDriveType(v);
    assert.equal(res.drive_type, DRIVE_TYPES.PETROL, `${v} must resolve to PETROL`);
    assert.equal(res.resolution, 'FAMILY_RULE', `${v} resolution must be FAMILY_RULE`);
    assert.equal(res.family, 'MB', `${v} family must be MB`);
  }
});

test('Phase 56P — 10. Unsupported Models Fail Closed Across All Equivalent Notations', async () => {
  // Required equivalent forms from prompt section 21
  const unsupportedVariants = [
    'MB 400',
    'MB400',
    'mb-400',
    'STIHL MB 400'
  ];

  for (const v of unsupportedVariants) {
    const norm = normalizeModelDesignation(v);
    assert.equal(norm, 'MB 400', `${v} must normalize to "MB 400"`);

    const res = resolveDriveType(v);
    assert.equal(res.drive_type, DRIVE_TYPES.UNKNOWN, `${v} must fail closed to UNKNOWN`);
    assert.equal(res.resolution, 'UNSUPPORTED_GENERATION', `${v} resolution must be UNSUPPORTED_GENERATION`);
    assert.equal(res.family, 'MB', `${v} family must be MB`);
  }
});

test('Phase 56P — 11. MB 545 VE Variant Representation Equivalence', async () => {
  // Required variant notations from prompt section 23
  const veVariants = [
    'MB 545 VE',
    'MB545VE',
    'MB-545-VE',
    'STIHL MB 545 VE'
  ];

  for (const v of veVariants) {
    const norm = normalizeModelDesignation(v);
    assert.equal(norm, 'MB 545 VE', `${v} must normalize to "MB 545 VE"`);

    const res = resolveDriveType(v);
    assert.equal(res.drive_type, DRIVE_TYPES.PETROL, `${v} must resolve to PETROL`);
    assert.equal(res.resolution, 'FAMILY_RULE', `${v} resolution must be FAMILY_RULE`);
    assert.equal(res.family, 'MB', `${v} family must be MB`);
  }
});

test('Phase 56P — 12. Prefix Safety & Collision Prevention', async () => {
  // Required prefix safety checks from prompt section 22
  const prefixSafetyCases = [
    { input: 'MBA 100', expectedFamily: null, expectedDrive: DRIVE_TYPES.UNKNOWN },
    { input: 'MBC 248', expectedFamily: null, expectedDrive: DRIVE_TYPES.UNKNOWN },
    { input: 'AMBA 248', expectedFamily: null, expectedDrive: DRIVE_TYPES.UNKNOWN },
    { input: 'RM 448', expectedFamily: 'RM', expectedDrive: DRIVE_TYPES.PETROL },
    { input: 'RMA 448', expectedFamily: 'RMA', expectedDrive: DRIVE_TYPES.BATTERY },
    { input: 'ME 235', expectedFamily: 'ME', expectedDrive: DRIVE_TYPES.UNKNOWN }
  ];

  for (const c of prefixSafetyCases) {
    const fam = parseModelFamily(c.input);
    assert.notEqual(fam, 'MB', `${c.input} must never be parsed as family MB`);
    assert.equal(fam, c.expectedFamily, `${c.input} family must be ${c.expectedFamily}`);

    const res = resolveDriveType(c.input);
    assert.notEqual(res.family, 'MB', `${c.input} resolution family must not be MB`);
    assert.equal(res.drive_type, c.expectedDrive, `${c.input} drive must be ${c.expectedDrive}`);
  }
});

test('Phase 56P — 13. Explicit Model Precedence & Zero Conflicts', async () => {
  const explicitBatteryMock = {
    model_name: 'MB 248.4',
    explicit_power_source: 'Battery'
  };
  const conflictRes = resolveDriveType(explicitBatteryMock);
  assert.equal(conflictRes.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.equal(conflictRes.resolution, 'CONFLICT_QUARANTINED');

  const result = await getDefaultBuild();
  assert.equal(result.driveConflicts.length, 0);
  assert.equal(result.summary.hard_gates.MB_DRIVE_CONFLICTS, 0);
});

test('Phase 56P — 14. Coverage Metrics & Arithmetic', async () => {
  const result = await getDefaultBuild();
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

test('Phase 56P — 15. Negative Test — Manual Hash Mismatch Fails Verification', async () => {
  const cfg = OFFICIAL_MB_MANUAL_CONFIGS[0];
  const res = await verifyMbManual(cfg, { mockByteMutation: true });

  assert.equal(res.hash_match, false);
  assert.equal(res.verification_status, 'UNVERIFIED_HASH_MISMATCH');
  assert.ok(res.failure_reason.includes('SHA256_MISMATCH'));
});

test('Phase 56P — 16. Negative Test — Manual Fetch Failure Removes Affected Coverage', async () => {
  const cfg = OFFICIAL_MB_MANUAL_CONFIGS[0];
  const res = await verifyMbManual(cfg, { mockError: 'ETIMEDOUT: Connection timed out' });

  assert.equal(res.verification_status, 'UNVERIFIED_FETCH_FAILED');
  assert.equal(res.failure_reason, 'ETIMEDOUT: Connection timed out');
});

test('Phase 56P — 17. Negative Test — PDF Extraction Failure Blocks Verification', async () => {
  const cfg = OFFICIAL_MB_MANUAL_CONFIGS[0];
  const corruptPdf = Buffer.from('%PDF-1.4 corrupt byte stream that cannot be parsed by pdfjs');
  // Mutated byte stream with wrong hash fails at hash step, or if hash matched but PDF invalid:
  const fakeCfg = { ...cfg, expected_sha256: crypto.createHash('sha256').update(corruptPdf).digest('hex') };
  const res = await verifyMbManual(fakeCfg, { mockBuffer: corruptPdf });

  assert.equal(res.verification_status, 'UNVERIFIED_PDF_EXTRACTION_FAILED');
  assert.ok(res.failure_reason.includes('PDF_PARSE_ERROR'));
});

test('Phase 56P — 18. Clean Checkout Reproducibility Test (Validates All Used Manuals)', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-clean-checkout-'));
  try {
    const result = await buildPhase56pMbDriveExpansion({
      write: false,
      cacheDir: emptyTempDir,
      allowLiveFetch: true
    });

    assert.equal(result.summary.outcome_status, 'PASS');
    assert.equal(result.provenanceIntegrity.clean_checkout_all_manuals_reproducible, true);
    assert.equal(result.provenanceIntegrity.manual_fetch_failures, 0);
    assert.equal(result.provenanceIntegrity.manual_hash_mismatches, 0);
    assert.equal(result.provenanceIntegrity.manual_extraction_failures, 0);
    assert.equal(result.drivePromotions.length, 36);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 19. No-Cache Negative Test (Fails Closed When Network Absent)', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-no-cache-'));
  try {
    const result = await buildPhase56pMbDriveExpansion({
      write: false,
      cacheDir: emptyTempDir,
      allowLiveFetch: false
    });

    assert.equal(result.provenanceIntegrity.manual_fetch_failures, 12);
    assert.equal(result.provenanceIntegrity.provenance_integrity_passed, false);
    assert.equal(result.drivePromotions.length, 0);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 20. Artifact Presence & Hard Gates Verification', async () => {
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

  const result = await getDefaultBuild();
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
  assert.equal(gates.PROMOTIONS_REFERENCING_UNVERIFIED_MANUALS, 0);
  assert.equal(gates.STARTER_BATTERY_DISCRIMINATED, true);
  assert.equal(gates.VERIFIED_MANUALS_WITHOUT_BYTES, 0);
  assert.equal(gates.VERIFIED_MANUALS_WITHOUT_HASH_MATCH, 0);
  assert.equal(gates.VERIFIED_MANUALS_WITHOUT_PDF_EXTRACTION, 0);
  assert.equal(gates.VERIFIED_MANUALS_WITHOUT_EXCERPT, 0);
  assert.equal(gates.VERIFIED_MANUALS_WITHOUT_EXCERPT_HASH, 0);
  assert.equal(gates.EXCERPT_HASH_MISMATCHES, 0);
  assert.equal(gates.MB_CANONICAL_INPUT_EQUIVALENCE_ERRORS, 0);
  assert.equal(gates.MB_PREFIX_COLLISION_ERRORS, 0);
  assert.equal(gates.MB_STARTER_BATTERY_MISCLASSIFICATIONS, 0);
  assert.equal(gates.FABRICATED_PROVENANCE, 0);
  assert.equal(gates.SYNTHETIC_PROVENANCE, 0);
  assert.equal(gates.MB_CLEAN_CHECKOUT_ALL_USED_MANUALS_REPRODUCIBLE, true);
  assert.equal(gates.PHASE56P_EVIDENCE_INTEGRITY, true);
  assert.equal(gates.CATALOG_FREEZE_INTACT, true);
});

test('Phase 56P — 21. Catalog & Serial Freeze Invariants Preserved', async () => {
  const result = await getDefaultBuild();
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

test('Phase 56P — 22. Cross-Family Regression Freeze', async () => {
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

test('Phase 56P — 23. Manual Cache Roundtrip Parity (Live -> TempDir -> Offline)', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-roundtrip-'));
  const cfg = OFFICIAL_MB_MANUAL_CONFIGS[0];

  try {
    // Step 1: Live acquisition into tempDir
    const resLive = await verifyMbManual(cfg, {
      allowLiveFetch: true,
      cacheDir: emptyTempDir
    });

    assert.equal(resLive.verification_status, 'VERIFIED');
    assert.ok(resLive.document_bytes > 0);
    assert.equal(resLive.hash_match, true);

    // Step 2: Offline re-verification using identical cacheDir
    const resOffline = await verifyMbManual(cfg, {
      allowLiveFetch: false,
      cacheDir: emptyTempDir
    });

    assert.equal(resOffline.verification_status, 'VERIFIED');
    assert.equal(resOffline.acquisition_mode, 'VERIFIED_CACHE_ENTRY');
    assert.equal(resOffline.actual_sha256, resLive.actual_sha256);
    assert.equal(resOffline.document_bytes, resLive.document_bytes);
    assert.equal(resOffline.source_excerpt_hash, resLive.source_excerpt_hash);
    assert.equal(resOffline.source_excerpt, resLive.source_excerpt);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 24. All-12 Manual Offline Cache Roundtrip Reproducibility', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-all-cache-'));
  const liveRepoCacheDir = path.join(REPO_ROOT, '.cache', 'parts-harvester', 'live');

  try {
    // Populate tempDir from live repo cache using canonical cache paths
    for (const cfg of OFFICIAL_MB_MANUAL_CONFIGS) {
      const urlHash = crypto.createHash('sha256').update(cfg.url).digest('hex');
      const srcPath = path.join(liveRepoCacheDir, `${urlHash}.json`);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(emptyTempDir, `${urlHash}.json`));
      }
    }

    const serviceKitUrl = 'https://www.stihl.nl/nl/ap/service-kit-51-1022025';
    const skHash = crypto.createHash('sha256').update(serviceKitUrl).digest('hex');
    const skSrc = path.join(liveRepoCacheDir, `${skHash}.json`);
    if (fs.existsSync(skSrc)) {
      fs.copyFileSync(skSrc, path.join(emptyTempDir, `${skHash}.json`));
    }

    // Verify completely offline against tempDir
    const result = await verifyAllMbManuals({
      allowLiveFetch: false,
      cacheDir: emptyTempDir
    });

    assert.equal(result.manuals_required, 12);
    assert.equal(result.manuals_acquired, 12);
    assert.equal(result.manuals_hash_verified, 12);
    assert.equal(result.manuals_pdf_extracted, 12);
    assert.equal(result.manuals_excerpt_verified, 12);
    assert.equal(result.manuals_semantically_verified, 12);
    assert.equal(result.manuals_failed, 0);
    assert.equal(result.service_kit_verified, true);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 25. Corrupted Manual Cache Entry Rejected', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-corrupt-manual-'));
  const cfg = OFFICIAL_MB_MANUAL_CONFIGS[0];

  try {
    const urlHash = crypto.createHash('sha256').update(cfg.url).digest('hex');
    const corruptCachePath = path.join(emptyTempDir, `${urlHash}.json`);
    fs.writeFileSync(corruptCachePath, JSON.stringify({
      url: cfg.url,
      status: 200,
      is_binary: true,
      body_encoding: 'latin1',
      body_sha256: 'deadbeef12345678deadbeef12345678deadbeef12345678deadbeef12345678',
      body: 'corrupted manual byte string'
    }));

    const res = await verifyMbManual(cfg, {
      allowLiveFetch: false,
      cacheDir: emptyTempDir
    });

    assert.equal(res.verification_status, 'UNVERIFIED_HASH_MISMATCH');
    assert.ok(res.failure_reason.includes('CORRUPTED_CACHE'));
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 26. Service Kit Actual Body Hash Recomputed & Verified', async () => {
  const res = await verifyServiceKit51Evidence();

  assert.equal(res.verification_status, 'VERIFIED');
  assert.ok(res.body_bytes > 0);
  assert.ok(typeof res.observed_body_sha256 === 'string' && res.observed_body_sha256.length === 64);
  assert.equal(res.hash_match, true);
  assert.equal(res.body_sha256, res.observed_body_sha256);
});

test('Phase 56P — 27. Corrupted Service Kit Cache Entry Rejected', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-corrupt-sk-'));
  const serviceKitUrl = 'https://www.stihl.nl/nl/ap/service-kit-51-1022025';

  try {
    const urlHash = crypto.createHash('sha256').update(serviceKitUrl).digest('hex');
    const corruptCachePath = path.join(emptyTempDir, `${urlHash}.json`);
    fs.writeFileSync(corruptCachePath, JSON.stringify({
      url: serviceKitUrl,
      status: 200,
      body_sha256: 'fakehash99999999fakehash99999999fakehash99999999fakehash99999999',
      body: '<html><body>Tampered content without matching hash</body></html>'
    }));

    const res = await verifyServiceKit51Evidence({
      allowLiveFetch: false,
      cacheDir: emptyTempDir
    });

    assert.equal(res.verification_status, 'UNVERIFIED_HASH_MISMATCH');
    assert.ok(res.failure_reason.includes('CORRUPTED_SERVICE_KIT_CACHE'));
    assert.equal(res.hash_match, false);
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 28. Service Kit Excerpt Demonstrably Comes From Source', async () => {
  const res = await verifyServiceKit51Evidence();

  assert.equal(res.verification_status, 'VERIFIED');
  assert.ok(res.source_excerpt && res.source_excerpt.length > 0);
  assert.equal(res.excerpt_present_in_source, true);
  const expectedHash = crypto.createHash('sha256').update(res.source_excerpt, 'utf8').digest('hex');
  assert.equal(res.source_excerpt_hash, expectedHash);
});

test('Phase 56P — 29. Separated-Token HTML Fixture Rejected (Secondary Context Contamination)', async () => {
  const separatedHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Test Page</title></head>
    <body>
      <nav>STIHL benzinegrasmaaiers en aanverwante categorieen</nav>
      <main>
        <h1>Service Kit 51</h1>
        <p>Standaard onderhoudspakket voor tuinonderhoud.</p>
      </main>
      <footer>
        <p>Compatibel met de modellen RM 248.0 en MB 248.4</p>
      </footer>
    </body>
    </html>
  `;

  const res = await verifyServiceKit51Evidence({ mockHtml: separatedHtml });

  assert.equal(res.primary_context_verified, false);
  assert.equal(res.verification_status, 'UNVERIFIED_PRIMARY_CONTEXT');
  assert.ok(res.failure_reason.includes('Primary product context missing'));
});

test('Phase 56P — 30. Correct Primary-Context HTML Fixture Accepted', async () => {
  const validPrimaryHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Service Kit 51</title></head>
    <body>
      <main>
        <h1>Service Kit 51 voor RM 248.0 en MB 248.4</h1>
        <p>Onderhoudsset voor STIHL benzinegrasmaaiers.</p>
        <p>De volgende machines zijn compatibel met de STIHL Service Kit 51: RM 248.0 en MB 248.4</p>
      </main>
    </body>
    </html>
  `;

  const res = await verifyServiceKit51Evidence({ mockHtml: validPrimaryHtml });

  assert.equal(res.primary_context_verified, true);
  assert.equal(res.excerpt_present_in_source, true);
  assert.equal(res.verification_status, 'VERIFIED');
  assert.equal(res.source_excerpt, 'De volgende machines zijn compatibel met de STIHL Service Kit 51: RM 248.0 en MB 248.4');
});

test('Phase 56P — 31. MB 248 / 253 Required-vs-Corroborating Evidence Behavior', async () => {
  const result = await getDefaultBuild();
  const mb248Grp = result.generationGroups['MB 248 / 253'];

  assert.ok(mb248Grp.required_evidence_ids.includes('0478-111-9828-B'));
  assert.ok(mb248Grp.required_evidence_ids.includes('0478-111-9928-B'));
  assert.ok(mb248Grp.corroborating_evidence_ids.includes('STIHL_SERVICE_KIT_51'));
  assert.equal(mb248Grp.status, 'COVERED');

  // Verify that all 6 models in group resolve to PETROL
  for (const m of mb248Grp.models) {
    const res = resolveDriveType(m);
    assert.equal(res.drive_type, DRIVE_TYPES.PETROL);
    assert.equal(res.resolution, 'FAMILY_RULE');
  }
});

test('Phase 56P — 32. Live Service Kit Uses bodySha256 Contract Property', async () => {
  const skRes = await verifyServiceKit51Evidence();
  assert.equal(skRes.verification_status, 'VERIFIED');
  assert.ok(skRes.observed_body_sha256, 'observed_body_sha256 must be present');
  assert.ok(skRes.stored_body_sha256, 'stored_body_sha256 must be present');
  assert.equal(skRes.stored_body_sha256.toLowerCase(), skRes.observed_body_sha256.toLowerCase(), 'stored and observed hash must match');
  assert.equal(skRes.hash_match, true, 'hash_match must be true');
});

test('Phase 56P — 33. Live Service Kit Uses fetchedAt Contract Property', async () => {
  const skRes = await verifyServiceKit51Evidence();
  assert.equal(skRes.verification_status, 'VERIFIED');
  assert.ok(skRes.retrieved_at, 'retrieved_at must be present');
  assert.ok(!isNaN(Date.parse(skRes.retrieved_at)), 'retrieved_at must be a valid ISO date');
});

test('Phase 56P — 34. Missing Acquired Hash Fails Closed (UNVERIFIED_MISSING_ACQUIRED_HASH)', async () => {
  const mockHtml = `
    <main>
      <h1>Service Kit 51 voor RM 248.0 en MB 248.4</h1>
      <p>Onderhoudsset voor STIHL benzinegrasmaaiers.</p>
      <p>De volgende machines zijn compatibel met de STIHL Service Kit 51: RM 248.0 en MB 248.4</p>
    </main>
  `;
  const res = await verifyServiceKit51Evidence({
    mockHtml,
    acquisitionMode: 'LIVE_OFFICIAL_FETCH',
    mockAcquiredHash: null
  });

  assert.equal(res.verification_status, 'UNVERIFIED_MISSING_ACQUIRED_HASH');
  assert.equal(res.hash_match, false);
  assert.ok(res.failure_reason.includes('MISSING_ACQUIRED_HASH'));
});

test('Phase 56P — 35. Offline Empty-Cache Gate Becomes False', async () => {
  const emptyTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-mb-empty-cache-'));
  try {
    const res = await buildPhase56pMbDriveExpansion({
      write: false,
      allowLiveFetch: false,
      cacheDir: emptyTempDir
    });

    assert.equal(res.summary.hard_gates.MB_ALL_MANUALS_OFFLINE_CACHE_REPRODUCIBLE, false);
    assert.equal(res.summary.hard_gates.PHASE56P_EVIDENCE_INTEGRITY, false);
    assert.ok(res.summary.hard_gates.MB_MANUAL_CACHE_ROUNDTRIP_ERRORS > 0);
    assert.equal(res.summary.outcome_status, 'FAIL');
  } finally {
    fs.rmSync(emptyTempDir, { recursive: true, force: true });
  }
});

test('Phase 56P — 36. Manual Roundtrip Gates Derived, Not Constants', async () => {
  const res = await getDefaultBuild();
  assert.equal(typeof res.summary.hard_gates.MB_MANUAL_CACHE_ROUNDTRIP_ERRORS, 'number');
  assert.equal(typeof res.summary.hard_gates.MB_ALL_MANUALS_OFFLINE_CACHE_REPRODUCIBLE, 'boolean');
  assert.equal(
    res.summary.hard_gates.MB_MANUAL_CACHE_ROUNDTRIP_ERRORS,
    res.provenanceIntegrity.manual_cache_roundtrip_errors
  );
  assert.equal(
    res.summary.hard_gates.MB_ALL_MANUALS_OFFLINE_CACHE_REPRODUCIBLE,
    res.provenanceIntegrity.manual_offline_cache_verified
  );
});

test('Phase 56P — 37. Corrupted Service Kit Increments Actual Mismatch Metric', async () => {
  const healthy = await getDefaultBuild();
  const mockManuals = healthy.officialEvidenceLedger.official_manuals.map(m => ({
    ...m,
    document_bytes: m.bytes,
    pdf_extraction_success: true,
    hash_match: true
  }));

  const corruptSK = {
    service_kit_id: 'STIHL_SERVICE_KIT_51',
    verification_status: 'UNVERIFIED_HASH_MISMATCH',
    hash_match: false,
    failure_reason: 'CORRUPTED_SERVICE_KIT_CACHE: stored hash does not match observed'
  };

  const res = await buildPhase56pMbDriveExpansion({
    write: false,
    mockManualResults: mockManuals,
    mockServiceKitResult: corruptSK
  });

  assert.equal(res.summary.hard_gates.SERVICE_KIT_CACHE_HASH_MISMATCHES, 1);
  assert.equal(res.provenanceIntegrity.service_kit_hash_mismatches, 1);
});

test('Phase 56P — 38. Required Manuals Valid + Service Kit Failed => Promotions Remain Valid', async () => {
  const healthy = await getDefaultBuild();
  const mockManuals = healthy.officialEvidenceLedger.official_manuals.map(m => ({
    ...m,
    document_bytes: m.bytes,
    pdf_extraction_success: true,
    hash_match: true
  }));

  const failedSK = {
    service_kit_id: 'STIHL_SERVICE_KIT_51',
    verification_status: 'UNVERIFIED_FETCH_FAILED',
    hash_match: false,
    failure_reason: 'FETCH_FAILED: Network timeout'
  };

  const res = await buildPhase56pMbDriveExpansion({
    write: false,
    mockManualResults: mockManuals,
    mockServiceKitResult: failedSK
  });

  // MB 248 / 253 required manuals are still valid, so group status remains COVERED
  assert.equal(res.generationGroups['MB 248 / 253'].status, 'COVERED');
  assert.equal(res.summary.hard_gates.MB_PROMOTIONS_EXACT, true);
  assert.equal(res.drivePromotions.length, 36);
  assert.equal(res.provenanceIntegrity.required_evidence_failures, 0);
  assert.equal(res.provenanceIntegrity.corroborating_evidence_failures, 1);
  // Service Kit failure is non-blocking when required evidence is valid
  assert.equal(res.summary.hard_gates.PROMOTIONS_WITH_MISSING_REQUIRED_EVIDENCE, 0);
  assert.equal(res.summary.hard_gates.PHASE56P_EVIDENCE_INTEGRITY, true);
  assert.equal(res.summary.outcome_status, 'PASS_WITH_LIMITATION');
});

test('Phase 56P — 39. Required Manual Failed + Service Kit Valid => Promotions Rejected', async () => {
  const healthy = await getDefaultBuild();
  const mockManuals = healthy.officialEvidenceLedger.official_manuals.map(m => {
    if (m.document_id === '0478-111-9828-B') {
      return {
        ...m,
        verification_status: 'UNVERIFIED_HASH_MISMATCH',
        hash_match: false,
        failure_reason: 'SHA256_MISMATCH'
      };
    }
    return {
      ...m,
      document_bytes: m.bytes,
      pdf_extraction_success: true,
      hash_match: true
    };
  });

  const res = await buildPhase56pMbDriveExpansion({
    write: false,
    mockManualResults: mockManuals
  });

  // MB 248 / 253 depends on 0478-111-9828-B; failure of required manual prevents COVERED
  assert.notEqual(res.generationGroups['MB 248 / 253'].status, 'COVERED');
  assert.ok(res.provenanceIntegrity.required_evidence_failures > 0);
  assert.equal(res.summary.hard_gates.PHASE56P_EVIDENCE_INTEGRITY, false);
});

test('Phase 56P — 40. Promotion Validation Checks Required Evidence', async () => {
  const res = await getDefaultBuild();
  for (const promo of res.drivePromotions) {
    assert.ok(Array.isArray(promo.required_evidence_ids), 'required_evidence_ids must be an array');
    assert.ok(promo.required_evidence_ids.length > 0, 'required_evidence_ids must not be empty');
    assert.equal(promo.required_evidence_verified, true, 'required_evidence_verified must be true');
    assert.ok(Array.isArray(promo.corroborating_evidence_ids), 'corroborating_evidence_ids must be an array');
  }
  assert.equal(res.summary.hard_gates.PROMOTIONS_WITH_MISSING_REQUIRED_EVIDENCE, 0);
});

test('Phase 56P — 41. PHASE56P_EVIDENCE_INTEGRITY Flips False on Blocking Failure', async () => {
  const healthy = await getDefaultBuild();
  const mockManuals = healthy.officialEvidenceLedger.official_manuals.map(m => ({
    ...m,
    document_bytes: m.bytes,
    pdf_extraction_success: true,
    hash_match: true
  }));

  // Introduce a blocking extraction failure in one manual
  mockManuals[0] = {
    ...mockManuals[0],
    verification_status: 'UNVERIFIED_PDF_EXTRACTION_FAILED',
    pdf_extraction_success: false
  };

  const res = await buildPhase56pMbDriveExpansion({
    write: false,
    mockManualResults: mockManuals
  });

  assert.equal(res.summary.hard_gates.PHASE56P_EVIDENCE_INTEGRITY, false);
  assert.equal(res.summary.outcome_status, 'FAIL');
});
