/**
 * tests/phase56n_machine_eligibility_boundary.test.js
 *
 * Phase 56N — Catalog Noise & Powered-Machine Boundary Closure Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  DRIVE_TYPES,
  DISPLAY_LABELS,
  OFFICIAL_STIHL_FAMILY_RULES,
  resolveDriveType,
  isPoweredModelDesignation
} from '../src/ModelFamilyDriveRegistry.js';

import {
  MACHINE_ELIGIBILITY,
  resolveMachineEligibility,
  isPoweredMachine,
  isUnpoweredAttachment,
  isNonMachineNoise
} from '../src/ModelMachineEligibilityRegistry.js';

import { buildPhase56nPoweredMachineBoundary } from '../scripts/build_phase56n_powered_machine_boundary.mjs';
import {
  verifyEvidenceExcerpt,
  verifySharpenerProvenance,
  verifySemanticPurityOfReconstruction,
  verifyEvidenceTraceability,
  HOS_ARCHIVED_BODY_SHA256,
  HOS_DERIVED_PDF_SHA256,
  HOS_WARC_RECORD_SHA256,
  HOS_OFFICIAL_URL,
  USG_OFFICIAL_URL
} from '../scripts/fetch_official_sharpener_evidence.mjs';
import { extractPdfDocumentText } from '../scripts/fetch_official_family_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56n');

test('Phase 56N: Existing unpowered attachments are classified as UNPOWERED_ATTACHMENT', () => {
  const attachmentCases = ['BG-KM', 'FS-KM', 'HL-KM', 'HT-KM', 'BF-MM'];

  for (const name of attachmentCases) {
    const res = resolveMachineEligibility(name);
    assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.UNPOWERED_ATTACHMENT, `${name} must be UNPOWERED_ATTACHMENT`);
    assert.strictEqual(isUnpoweredAttachment(name), true, `${name} must return isUnpoweredAttachment = true`);
    assert.strictEqual(isPoweredMachine(name), false, `${name} must not be powered machine`);

    const driveRes = resolveDriveType(name);
    assert.strictEqual(driveRes.drive_type, DRIVE_TYPES.UNKNOWN);
    assert.strictEqual(driveRes.resolution, 'ATTACHMENT_NOT_POWERED');
  }

  // Slug-only attachment object test (retains safety gate against explicit power source bypass)
  const slugAttachmentObj = { slug: 'BG-KM', explicit_power_source: 'GASOLINE' };
  const slugRes = resolveMachineEligibility(slugAttachmentObj);
  assert.strictEqual(slugRes.eligibility, MACHINE_ELIGIBILITY.UNPOWERED_ATTACHMENT);
  const slugDriveRes = resolveDriveType(slugAttachmentObj);
  assert.strictEqual(slugDriveRes.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.strictEqual(slugDriveRes.resolution, 'ATTACHMENT_NOT_POWERED');
});

test('Phase 56N: Real machines are classified as POWERED_MACHINE (False-exclusion safety gate)', () => {
  const realMachines = [
    { name: 'MS 211', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'MSA 300', expectedDrive: DRIVE_TYPES.BATTERY },
    { name: 'MSE 210', expectedDrive: DRIVE_TYPES.MAINS_ELECTRIC },
    { name: 'FS 55', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'BG 86', expectedDrive: DRIVE_TYPES.PETROL },
    { name: '026', expectedDrive: DRIVE_TYPES.PETROL }
  ];

  for (const m of realMachines) {
    const res = resolveMachineEligibility(m.name);
    assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.POWERED_MACHINE, `${m.name} must be POWERED_MACHINE`);
    assert.strictEqual(isPoweredMachine(m.name), true, `${m.name} isPoweredMachine must be true`);
    assert.strictEqual(isPoweredModelDesignation(m.name), true, `${m.name} isPoweredModelDesignation must be true`);
  }
});

test('Phase 56N: Unknown-but-real-machine cohorts are POWERED_MACHINE candidates without premature drive assignment', () => {
  const unknownMachineCandidates = ['RE 130', 'RM 448', 'RMA 448', 'BT 131', 'MB 448', 'GE 250'];

  for (const name of unknownMachineCandidates) {
    const res = resolveMachineEligibility(name);
    assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.POWERED_MACHINE, `${name} must be POWERED_MACHINE`);
    assert.strictEqual(isPoweredMachine(name), true, `${name} must be eligible powered machine`);

    // Drive type must remain UNKNOWN (no speculative promotions in Phase 56N)
    const driveRes = resolveDriveType(name);
    assert.strictEqual(driveRes.drive_type, DRIVE_TYPES.UNKNOWN, `${name} drive type must remain UNKNOWN in Phase 56N`);
  }
});

test('Phase 56N: Actual Phase 56M noise items receive exact non-machine categories', () => {
  // 1. Mowing heads
  const mowingHeadSamples = [
    'Mowing Head Auto Cut 11-2',
    'Mowing Head Autocut 21-2',
    'Mowing Head DuroCut 20-2',
    'Mowing Head Polycut 20-3',
    'Mowing head TrimCut 30-2'
  ];
  for (const mh of mowingHeadSamples) {
    const res = resolveMachineEligibility(mh);
    assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY, `${mh} must be NON_MACHINE_ACCESSORY`);
    assert.strictEqual(isPoweredMachine(mh), false, `${mh} must not be powered machine`);
    assert.strictEqual(isNonMachineNoise(mh), true, `${mh} must be non-machine noise`);

    const driveRes = resolveDriveType(mh);
    assert.strictEqual(driveRes.resolution, 'NON_MACHINE_ACCESSORY');
  }

  // 2. Battery belts and carrying systems
  const accessorySamples = [
    'BATTERY BELT Battery Belt',
    'CARRYING SYSTEM CARRYING SYSTEM',
    'DOUBLE BATTERY SLOT ADAPTER ADA 1000 DOUBLE BATTERY SLOT ADAPTER ADA 1000',
    'TELESCOPIC SHAFT 456 CM Hand Tool'
  ];
  for (const a of accessorySamples) {
    const res = resolveMachineEligibility(a);
    assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.NON_MACHINE_ACCESSORY, `${a} must be NON_MACHINE_ACCESSORY`);
    assert.strictEqual(isPoweredMachine(a), false, `${a} must not be powered machine`);
  }

  // 3. Replacement parts cataloged as models
  const replacementPartSamples = [
    'Blade for FS 111, FS 120',
    'Grey Plastic Sleeve/Insert for FS55, FS75, FS85',
    'Muffler Exhaust Gasket for HS45, HS81, HS86',
    'Skirt for FS90, FS100, FS100R',
    'Starter Rope  2.7x910 mm for MS180, MS181'
  ];
  for (const rp of replacementPartSamples) {
    const res = resolveMachineEligibility(rp);
    assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.REPLACEMENT_PART_AS_MODEL, `${rp} must be REPLACEMENT_PART_AS_MODEL`);
    assert.strictEqual(isPoweredMachine(rp), false, `${rp} must not be powered machine`);
    assert.strictEqual(isNonMachineNoise(rp), true, `${rp} must be non-machine noise`);

    const driveRes = resolveDriveType(rp);
    assert.strictEqual(driveRes.resolution, 'REPLACEMENT_PART_AS_MODEL');
  }
});

test('Phase 56N: Phase 56L/M regression freeze & drive resolution stability', () => {
  const frozenCases = [
    { name: 'MS 211', drive: DRIVE_TYPES.PETROL, resolution: 'FAMILY_RULE' },
    { name: 'MSA 300', drive: DRIVE_TYPES.BATTERY, resolution: 'FAMILY_RULE' },
    { name: 'MSE 210', drive: DRIVE_TYPES.MAINS_ELECTRIC, resolution: 'FAMILY_RULE' },
    { name: 'FS 55', drive: DRIVE_TYPES.PETROL, resolution: 'FAMILY_RULE' },
    { name: 'FSA 120', drive: DRIVE_TYPES.BATTERY, resolution: 'FAMILY_RULE' },
    { name: 'TS 420', drive: DRIVE_TYPES.PETROL, resolution: 'FAMILY_RULE' },
    { name: 'TSA 230', drive: DRIVE_TYPES.BATTERY, resolution: 'FAMILY_RULE' },
    { name: 'BG 86', drive: DRIVE_TYPES.PETROL, resolution: 'FAMILY_RULE' }
  ];

  for (const c of frozenCases) {
    const res = resolveDriveType(c.name);
    assert.strictEqual(res.drive_type, c.drive, `${c.name} drive type must match`);
    assert.strictEqual(res.resolution, c.resolution, `${c.name} resolution must match`);
  }

  // Explicit model 026
  const numeric026 = resolveDriveType({ model_name: '026', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric026.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric026.resolution, 'EXPLICIT_MODEL');

  // Verify HLE, BGE, SHE PDF evidence rules remain ACTIVE
  for (const fam of ['HLE', 'BGE', 'SHE']) {
    const rule = OFFICIAL_STIHL_FAMILY_RULES[fam];
    assert.ok(rule, `${fam} rule must be present`);
    assert.strictEqual(rule.status, 'ACTIVE');
    assert.strictEqual(rule.pdf_text_extracted, true);
    assert.ok(rule.page_number > 0);
  }
});

test('Phase 56N: Catalog, SEO and Commercial Freezes Intact', () => {
  const db = new Database(path.join(DATA_DIR, 'stihl_database.db'), { readonly: true });
  const partsCount = db.prepare('SELECT COUNT(*) as c FROM parts').get().c;
  const fitmentsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c;
  const configsCount = db.prepare('SELECT COUNT(*) as c FROM parts_model_configurations').get().c;
  const evidenceCount = db.prepare('SELECT COUNT(*) as c FROM part_fitment_evidence').get().c;
  const sectionContextsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;

  assert.strictEqual(partsCount, 17082, 'Canonical parts count must be exactly 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'Canonical fitments count must be exactly 175,106');
  assert.strictEqual(configsCount, 766, 'Diagram configurations count must be exactly 766');
  assert.strictEqual(evidenceCount, 208412, 'Evidence ledger count must be exactly 208,412');
  assert.strictEqual(sectionContextsCount, 814, 'Section contexts count must be exactly 814');
});

test('Phase 56N.1: HOS and USG Sharpeners are classified as POWERED_MACHINE with MAINS_ELECTRIC / EXPLICIT_MODEL', () => {
  const sharpeners = ['HOS Sharpeners', 'USG Sharpeners'];

  for (const name of sharpeners) {
    const res = resolveMachineEligibility(name);
    assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.POWERED_MACHINE, `${name} must be POWERED_MACHINE`);
    assert.strictEqual(isPoweredMachine(name), true, `${name} must return isPoweredMachine = true`);
    assert.strictEqual(isNonMachineNoise(name), false, `${name} must not be non-machine noise`);

    const driveRes = resolveDriveType(name);
    assert.strictEqual(driveRes.drive_type, DRIVE_TYPES.MAINS_ELECTRIC, `${name} drive_type must be MAINS_ELECTRIC`);
    assert.strictEqual(driveRes.display, 'Elektrisch / netstroom', `${name} display must be Elektrisch / netstroom`);
    assert.strictEqual(driveRes.resolution, 'EXPLICIT_MODEL', `${name} resolution must be EXPLICIT_MODEL`);
  }

  // Negative check: ensure no generic accessory pattern matches HOS or USG
  assert.strictEqual(resolveMachineEligibility('HOS Sharpeners').eligibility, MACHINE_ELIGIBILITY.POWERED_MACHINE);
  assert.strictEqual(resolveMachineEligibility('USG Sharpeners').eligibility, MACHINE_ELIGIBILITY.POWERED_MACHINE);
});

test('Phase 56N.2: All 14 required artifacts exist and validate cleanly', () => {
  const expectedArtifacts = [
    'NOISE_BASELINE_54.json',
    'MACHINE_ELIGIBILITY_AUDIT.json',
    'NON_MACHINE_ACCESSORIES.json',
    'REPLACEMENT_PART_RECORDS.json',
    'UNPOWERED_ATTACHMENTS.json',
    'AMBIGUOUS_ELIGIBILITY.json',
    'PUBLIC_NON_MACHINE_EXPOSURE_AUDIT.json',
    'POWERED_POPULATION_BEFORE_AFTER.json',
    'COVERAGE_DENOMINATOR_CORRECTION.json',
    'POWERED_SHARPENER_CORRECTION.json',
    'SHARPENER_PROVENANCE_INTEGRITY.json',
    'CATALOG_INTEGRITY.json',
    'PHASE56N_SUMMARY.json',
    'PHASE56N_REPORT.md'
  ];

  for (const artifact of expectedArtifacts) {
    const p = path.join(OUTPUT_DIR, artifact);
    assert.ok(fs.existsSync(p), `Artifact ${artifact} must exist in ${OUTPUT_DIR}`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'PHASE56N_SUMMARY.json'), 'utf8'));
  assert.strictEqual(summary.outcome_status, 'PASS');
  assert.strictEqual(summary.hard_gates.HOS_POWERED_MACHINE, true);
  assert.strictEqual(summary.hard_gates.USG_POWERED_MACHINE, true);
  assert.strictEqual(summary.hard_gates.HOS_EXPLICIT_MAINS_ELECTRIC, true);
  assert.strictEqual(summary.hard_gates.USG_EXPLICIT_MAINS_ELECTRIC, true);
  assert.strictEqual(summary.hard_gates.POWERED_SHARPENERS_FALSE_EXCLUDED, 0);
  assert.strictEqual(summary.hard_gates.TRUE_NON_MACHINE_COUNT, 52);
  assert.strictEqual(summary.hard_gates.POWERED_MACHINE_CANDIDATES, 879);
  assert.strictEqual(summary.hard_gates.NEW_EXACT_DRIVE_RESOLUTIONS, 2);
  assert.strictEqual(summary.hard_gates.UNSAFE_DRIVE_PROMOTIONS, 0);
  assert.strictEqual(summary.hard_gates.DRIVE_CONFLICTS_INTRODUCED, 0);
  assert.strictEqual(summary.hard_gates.ATTACHMENT_REGRESSIONS, 0);
  assert.strictEqual(summary.hard_gates.POWERED_MACHINE_FALSE_EXCLUSIONS, 0);
  assert.strictEqual(summary.hard_gates.NON_MACHINE_STILL_COUNTED_AS_POWERED, 0);
  assert.strictEqual(summary.hard_gates.FABRICATED_SHARPENER_PROVENANCE, 0);
  assert.strictEqual(summary.hard_gates.MISLABELED_ARCHIVE_AS_LIVE_HTTP, 0);
  assert.strictEqual(summary.hard_gates.LOCAL_RECONSTRUCTION_ADDED_SEMANTIC_CONTENT, 0);
  assert.strictEqual(summary.hard_gates.HOS_SOURCE_ORIGIN_TRUTHFUL, true);
  assert.strictEqual(summary.hard_gates.HOS_EVIDENCE_TRACEABLE_TO_SOURCE_BYTES, true);
  assert.strictEqual(summary.hard_gates.HOS_PDF_REEXTRACTION_SUCCESS, true);
  assert.strictEqual(summary.hard_gates.HOS_EXCERPT_REVALIDATED, true);
  assert.strictEqual(summary.hard_gates.USG_PDF_REEXTRACTION_SUCCESS, true);
  assert.strictEqual(summary.hard_gates.USG_EXCERPT_REVALIDATED, true);
  assert.strictEqual(summary.hard_gates.SHARPENER_PROVENANCE_INTEGRITY, true);
  assert.strictEqual(summary.hard_gates.CATALOG_FREEZE_INTACT, true);

  const denom = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'COVERAGE_DENOMINATOR_CORRECTION.json'), 'utf8'));
  assert.strictEqual(denom.drive_resolutions_added, 2);
  assert.strictEqual(denom.drive_types_changed, 2);
  assert.strictEqual(denom.non_machine_records_removed_from_denominator, 52);
  assert.strictEqual(denom.powered_sharpeners_restored_to_denominator, 2);
  assert.strictEqual(denom.new_exact_drive_resolutions, 2);
  assert.strictEqual(denom.powered_candidates_before, 931);
  assert.strictEqual(denom.powered_candidates_after, 879);
  assert.strictEqual(denom.unknown_powered_before, 530);
  assert.strictEqual(denom.unknown_powered_after, 476);
  assert.strictEqual(denom.resolved_powered_before, 401);
  assert.strictEqual(denom.resolved_powered_after, 403);
  assert.strictEqual(denom.coverage_before_percentage, 43.07);
  assert.strictEqual(denom.coverage_after_percentage, 45.85);

  const sharpenerCorr = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'POWERED_SHARPENER_CORRECTION.json'), 'utf8'));
  assert.strictEqual(sharpenerCorr.status, 'PASS');
  assert.strictEqual(sharpenerCorr.records_checked, 2);
  assert.strictEqual(sharpenerCorr.records_restored_to_powered, 2);
});

test('Phase 56N.3: SHARPENER_PROVENANCE_INTEGRITY passes all truthful provenance gates', () => {
  const p = path.join(OUTPUT_DIR, 'SHARPENER_PROVENANCE_INTEGRITY.json');
  assert.ok(fs.existsSync(p), 'SHARPENER_PROVENANCE_INTEGRITY.json must exist');

  const prov = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.strictEqual(prov.status, 'PASS');
  assert.strictEqual(prov.models_checked, 2);
  assert.strictEqual(prov.live_official_fetches, 1);
  assert.strictEqual(prov.archived_official_captures, 1);
  assert.strictEqual(prov.derived_parser_artifacts, 1);
  assert.strictEqual(prov.synthetic_semantic_content_records, 0);
  assert.strictEqual(prov.mislabelled_origin_records, 0);
  assert.strictEqual(prov.document_hash_matches, 2);
  assert.strictEqual(prov.fresh_pdf_extraction_successes, 2);
  assert.strictEqual(prov.fresh_excerpt_source_matches, 2);
  assert.strictEqual(prov.HOS_source_mode, 'ARCHIVED_OFFICIAL_CAPTURE');
  assert.strictEqual(prov.HOS_source_origin_truthful, true);
  assert.strictEqual(prov.HOS_evidence_traceable, true);
  assert.strictEqual(prov.USG_source_mode, 'LIVE_OFFICIAL_HTTP');

  assert.strictEqual(prov.gates.FABRICATED_SHARPENER_PROVENANCE, 0);
  assert.strictEqual(prov.gates.MISLABELED_ARCHIVE_AS_LIVE_HTTP, 0);
  assert.strictEqual(prov.gates.LOCAL_RECONSTRUCTION_ADDED_SEMANTIC_CONTENT, 0);
  assert.strictEqual(prov.gates.HOS_SOURCE_ORIGIN_TRUTHFUL, true);
  assert.strictEqual(prov.gates.HOS_EVIDENCE_TRACEABLE_TO_SOURCE_BYTES, true);
  assert.strictEqual(prov.gates.HOS_PDF_REEXTRACTION_SUCCESS, true);
  assert.strictEqual(prov.gates.HOS_EXCERPT_REVALIDATED, true);
  assert.strictEqual(prov.gates.USG_PDF_REEXTRACTION_SUCCESS, true);
  assert.strictEqual(prov.gates.USG_EXCERPT_REVALIDATED, true);
  assert.strictEqual(prov.gates.SHARPENER_PROVENANCE_INTEGRITY, true);

  // Verify HOS record specifics
  const hos = prov.records.find(r => r.model === 'HOS Sharpeners');
  assert.ok(hos, 'HOS record must be in provenance integrity');
  assert.strictEqual(hos.source_mode, 'ARCHIVED_OFFICIAL_CAPTURE');
  assert.strictEqual(hos.content_origin, 'ARCHIVED_OFFICIAL_HTTP_CAPTURE');
  assert.strictEqual(hos.archive_provider, 'COMMON_CRAWL');
  assert.strictEqual(hos.source_type, 'OFFICIAL_STIHL_ARCHIVED_DOCUMENT');
  assert.strictEqual(hos.original_source_url, HOS_OFFICIAL_URL);
  assert.strictEqual(hos.requested_url, HOS_OFFICIAL_URL);
  assert.ok(hos.evidence_retrieval_url.includes('commoncrawl.org'));
  assert.strictEqual(hos.source_artifact, 'hosmanual_source_body.bin');
  assert.strictEqual(hos.source_body_sha256, HOS_ARCHIVED_BODY_SHA256);
  assert.strictEqual(hos.source_body_bytes, 1048576);
  assert.strictEqual(hos.derived_parser_artifact, 'hosmanual.pdf');
  assert.strictEqual(hos.derived_pdf_sha256, HOS_DERIVED_PDF_SHA256);
  assert.strictEqual(hos.derived_pdf_bytes, 1057881);
  assert.strictEqual(hos.derived_structure_added, true);
  assert.strictEqual(hos.local_reconstruction_added_semantic_content, 0);
  assert.strictEqual(hos.page_number, 20);
  assert.strictEqual(hos.pdf_page_count, 26);
  assert.strictEqual(hos.source_objects_present_in_archived_body, true);
  assert.deepStrictEqual(hos.evidence_object_ids, [179, 180, 181]);
  assert.strictEqual(hos.verification_status, 'VERIFIED');

  // Verify USG record specifics
  const usg = prov.records.find(r => r.model === 'USG Sharpeners');
  assert.ok(usg, 'USG record must be in provenance integrity');
  assert.strictEqual(usg.source_mode, 'LIVE_OFFICIAL_HTTP');
  assert.strictEqual(usg.http_status, 200);
  assert.strictEqual(usg.content_origin, 'OFFICIAL_HTTP_FETCH');
  assert.strictEqual(usg.source_type, 'OFFICIAL_STIHL_MODEL_DOCUMENT');
  assert.strictEqual(usg.requested_url, USG_OFFICIAL_URL);
  assert.strictEqual(usg.source_url, USG_OFFICIAL_URL);
  assert.strictEqual(usg.final_url, USG_OFFICIAL_URL);
  assert.strictEqual(usg.document_filename, 'USG_Manual.pdf');
  assert.strictEqual(usg.document_sha256, 'd782f571b2f09f249536bd3288608ab469b5dbd336ca6813cb5aa5a50e86d3bf');
  assert.strictEqual(usg.document_bytes, 1060207);
  assert.strictEqual(usg.derived_document, false);
  assert.strictEqual(usg.derived_structure_added, false);
  assert.strictEqual(usg.page_number, 28);
  assert.strictEqual(usg.pdf_page_count, 32);
  assert.strictEqual(usg.verification_status, 'VERIFIED');
});

test('Phase 56N.3 Contract: Direct official HTTP provenance for USG', () => {
  const p = path.join(OUTPUT_DIR, 'SHARPENER_PROVENANCE_INTEGRITY.json');
  const prov = JSON.parse(fs.readFileSync(p, 'utf8'));
  const usg = prov.records.find(r => r.model === 'USG Sharpeners');
  assert.strictEqual(usg.content_origin, 'OFFICIAL_HTTP_FETCH');
  assert.strictEqual(usg.http_status, 200);
  assert.strictEqual(usg.final_url, USG_OFFICIAL_URL);
  assert.strictEqual(usg.derived_document, false);
});

test('Phase 56N.3 Contract: Archive provenance is NOT labeled as live HTTP fetch', () => {
  const p = path.join(OUTPUT_DIR, 'SHARPENER_PROVENANCE_INTEGRITY.json');
  const prov = JSON.parse(fs.readFileSync(p, 'utf8'));
  const hos = prov.records.find(r => r.model === 'HOS Sharpeners');
  assert.notStrictEqual(hos.content_origin, 'OFFICIAL_HTTP_FETCH');
  assert.notStrictEqual(hos.content_origin, 'HTTP_FETCH');
  assert.strictEqual(hos.content_origin, 'ARCHIVED_OFFICIAL_HTTP_CAPTURE');
  assert.strictEqual(hos.archive_provider, 'COMMON_CRAWL');
  assert.ok(hos.evidence_retrieval_url.includes('commoncrawl.org'));
});

test('Phase 56N.3 Contract: Derived reconstruction has separate hash from source body', () => {
  const p = path.join(OUTPUT_DIR, 'SHARPENER_PROVENANCE_INTEGRITY.json');
  const prov = JSON.parse(fs.readFileSync(p, 'utf8'));
  const hos = prov.records.find(r => r.model === 'HOS Sharpeners');
  assert.notStrictEqual(hos.derived_pdf_sha256, hos.source_body_sha256);
  assert.strictEqual(hos.source_body_sha256, HOS_ARCHIVED_BODY_SHA256);
  assert.strictEqual(hos.derived_pdf_sha256, HOS_DERIVED_PDF_SHA256);
  assert.strictEqual(hos.source_body_bytes, 1048576);
  assert.strictEqual(hos.derived_pdf_bytes, 1057881);
});

test('Phase 56N.3 Contract: Semantic content cannot originate from reconstruction', () => {
  // Negative injection: test that semantic terms in reconstruction are caught and rejected
  const maliciousReconstruction = '\n374 0 obj\n<</Type /Pages /Kids [] /Count 1>>\nendobj\n% Injected: HOS 230 V 0.18 kW motor speed 2,800 RPM\n';
  const violations = verifySemanticPurityOfReconstruction(maliciousReconstruction, '', '');
  assert.ok(violations > 0, 'Injected semantic terms must be detected as violations');

  // Clean reconstruction has exactly 0 violations
  const cleanObjs = '\n374 0 obj\n<</Type /Pages /Kids [375 0 R] /Count 1>>\nendobj\n';
  const cleanXref = 'xref\n0 375\n0000000000 65535 f \n';
  const cleanTrailer = 'trailer\n<</Size 375/Root 387 0 R>>\nstartxref\n100\n%%EOF\n';
  assert.strictEqual(verifySemanticPurityOfReconstruction(cleanObjs, cleanXref, cleanTrailer), 0);
});

test('Phase 56N.3 Contract: Fresh PDF re-extraction succeeds dynamically on disk artifacts', async () => {
  const usgBuf = fs.readFileSync(path.join(DATA_DIR, 'harvest', 'phase56n', 'USG_Manual.pdf'));
  const hosBuf = fs.readFileSync(path.join(DATA_DIR, 'harvest', 'phase56n', 'hosmanual.pdf'));

  const usgExt = await extractPdfDocumentText(usgBuf);
  assert.strictEqual(usgExt.success, true);
  assert.strictEqual(usgExt.page_count, 32);

  const hosExt = await extractPdfDocumentText(hosBuf);
  assert.strictEqual(hosExt.success, true);
  assert.strictEqual(hosExt.page_count, 26);
});

test('Phase 56N.3 Contract: Real excerpt match against freshly extracted pages', async () => {
  const p = path.join(OUTPUT_DIR, 'SHARPENER_PROVENANCE_INTEGRITY.json');
  const prov = JSON.parse(fs.readFileSync(p, 'utf8'));

  const hos = prov.records.find(r => r.model === 'HOS Sharpeners');
  const usg = prov.records.find(r => r.model === 'USG Sharpeners');

  const hosBuf = fs.readFileSync(path.join(DATA_DIR, 'harvest', 'phase56n', 'hosmanual.pdf'));
  const hosExt = await extractPdfDocumentText(hosBuf);
  assert.strictEqual(verifyEvidenceExcerpt(hos, hosExt.pages), true, 'HOS excerpt must match extracted page text');

  const usgBuf = fs.readFileSync(path.join(DATA_DIR, 'harvest', 'phase56n', 'USG_Manual.pdf'));
  const usgExt = await extractPdfDocumentText(usgBuf);
  assert.strictEqual(verifyEvidenceExcerpt(usg, usgExt.pages), true, 'USG excerpt must match extracted page text');
});

test('Phase 56N.3 Negative Test: Fake excerpt rejection ("FABRICATED TEXT")', () => {
  const fakeHos = {
    page_number: 20,
    evidence_excerpt: 'FABRICATED TEXT: 400 V diesel hydraulic motor'
  };
  const mockPages = [
    { page_number: 20, text: 'Type: Single-phase AC, squirrel-cage motor Operating voltage: 230 V' }
  ];

  const matched = verifyEvidenceExcerpt(fakeHos, mockPages);
  assert.strictEqual(matched, false, 'Fabricated excerpt must be rejected by verifyEvidenceExcerpt');
});

test('Phase 56N.3 Negative Test: Fake stored VERIFIED rejection when excerpt mismatches', async () => {
  const badEvidence = {
    records: [
      {
        model: 'USG Sharpeners',
        document_filename: 'USG_Manual.pdf',
        document_sha256: 'd782f571b2f09f249536bd3288608ab469b5dbd336ca6813cb5aa5a50e86d3bf',
        http_status: 200,
        content_origin: 'OFFICIAL_HTTP_FETCH',
        page_number: 28,
        evidence_excerpt: '21   Specifications',
        evidence_excerpt_sha256: 'd57386fe9f253ebd1b675a0e30b9b7d53db8ac63c3e436b71400000000000000', // bad hash
        verification_status: 'VERIFIED'
      },
      {
        model: 'HOS Sharpeners',
        source_artifact: 'hosmanual_source_body.bin',
        derived_parser_artifact: 'hosmanual.pdf',
        source_body_sha256: HOS_ARCHIVED_BODY_SHA256,
        derived_pdf_sha256: HOS_DERIVED_PDF_SHA256,
        content_origin: 'ARCHIVED_OFFICIAL_HTTP_CAPTURE',
        archive_provider: 'COMMON_CRAWL',
        source_type: 'OFFICIAL_STIHL_ARCHIVED_DOCUMENT',
        original_source_url: HOS_OFFICIAL_URL,
        derived_structure_added: true,
        local_reconstruction_added_semantic_content: 0,
        source_objects_present_in_archived_body: true,
        page_number: 20,
        evidence_excerpt: 'FABRICATED EXCERPT NOT IN MANUAL',
        verification_status: 'VERIFIED' // falsely claimed
      }
    ]
  };

  const audit = await verifySharpenerProvenance({ sharpenerEvidence: badEvidence, harvestDir: path.join(DATA_DIR, 'harvest', 'phase56n') });
  assert.strictEqual(audit.status, 'FAIL', 'Falsely claimed VERIFIED status with mismatching excerpt must fail');
  assert.strictEqual(audit.gates.SHARPENER_PROVENANCE_INTEGRITY, false);
  assert.strictEqual(audit.gates.HOS_EXCERPT_REVALIDATED, false);
});

test('Phase 56N.3 Negative Test: Failed extraction rejection', async () => {
  // A record claiming pdf_text_extraction = true and verification_status = VERIFIED,
  // pointing to an invalid/corrupted PDF file must fail verification
  const badPdfEvidence = {
    records: [
      {
        model: 'USG Sharpeners',
        document_filename: 'USG_Manual.pdf',
        document_sha256: 'd782f571b2f09f249536bd3288608ab469b5dbd336ca6813cb5aa5a50e86d3bf',
        http_status: 200,
        content_origin: 'OFFICIAL_HTTP_FETCH',
        page_number: 28,
        evidence_excerpt: '21   Specifications',
        verification_status: 'VERIFIED'
      },
      {
        model: 'HOS Sharpeners',
        source_artifact: 'hosmanual_source_body.bin',
        derived_parser_artifact: 'corrupted_file.pdf', // non-existent / broken
        source_body_sha256: HOS_ARCHIVED_BODY_SHA256,
        derived_pdf_sha256: '1111111111111111111111111111111111111111111111111111111111111111',
        content_origin: 'ARCHIVED_OFFICIAL_HTTP_CAPTURE',
        archive_provider: 'COMMON_CRAWL',
        source_type: 'OFFICIAL_STIHL_ARCHIVED_DOCUMENT',
        original_source_url: HOS_OFFICIAL_URL,
        derived_structure_added: true,
        local_reconstruction_added_semantic_content: 0,
        source_objects_present_in_archived_body: true,
        pdf_text_extraction: true, // stored claim
        verification_status: 'VERIFIED' // stored claim
      }
    ]
  };

  const audit = await verifySharpenerProvenance({ sharpenerEvidence: badPdfEvidence, harvestDir: path.join(DATA_DIR, 'harvest', 'phase56n') });
  assert.strictEqual(audit.status, 'FAIL', 'Record pointing to missing/failed parser artifact must FAIL');
  assert.strictEqual(audit.gates.HOS_PDF_REEXTRACTION_SUCCESS, false);
  assert.strictEqual(audit.gates.SHARPENER_PROVENANCE_INTEGRITY, false);
});

test('Phase 56N.3 Regression: HOS Sharpeners is POWERED_MACHINE with MAINS_ELECTRIC / EXPLICIT_MODEL', () => {
  const res = resolveMachineEligibility('HOS Sharpeners');
  assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.POWERED_MACHINE);
  const drive = resolveDriveType('HOS Sharpeners');
  assert.strictEqual(drive.drive_type, DRIVE_TYPES.MAINS_ELECTRIC);
  assert.strictEqual(drive.resolution, 'EXPLICIT_MODEL');
  assert.strictEqual(drive.source_type, 'OFFICIAL_STIHL_ARCHIVED_DOCUMENT');
});

test('Phase 56N.3 Regression: USG Sharpeners is POWERED_MACHINE with MAINS_ELECTRIC / EXPLICIT_MODEL', () => {
  const res = resolveMachineEligibility('USG Sharpeners');
  assert.strictEqual(res.eligibility, MACHINE_ELIGIBILITY.POWERED_MACHINE);
  const drive = resolveDriveType('USG Sharpeners');
  assert.strictEqual(drive.drive_type, DRIVE_TYPES.MAINS_ELECTRIC);
  assert.strictEqual(drive.resolution, 'EXPLICIT_MODEL');
  assert.strictEqual(drive.source_type, 'OFFICIAL_STIHL_MODEL_DOCUMENT');
});
