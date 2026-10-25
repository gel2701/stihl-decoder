/**
 * tests/phase56n_machine_eligibility_boundary.test.js
 *
 * Phase 56N — Catalog Noise & Powered-Machine Boundary Closure Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
    'TELESCOPIC SHAFT 456 CM Hand Tool',
    'HOS Sharpeners',
    'USG Sharpeners'
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

test('Phase 56N: All 12 required artifacts exist and validate cleanly', () => {
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
  assert.strictEqual(summary.hard_gates.PHASE56M_NOISE_BASELINE, 54);
  assert.strictEqual(summary.hard_gates.POWERED_MACHINE_FALSE_EXCLUSIONS, 0);
  assert.strictEqual(summary.hard_gates.KNOWN_ATTACHMENT_REGRESSIONS, 0);
  assert.strictEqual(summary.hard_gates.NON_MACHINE_STILL_COUNTED_AS_POWERED, 0);
  assert.strictEqual(summary.hard_gates.DRIVE_TYPES_CHANGED_BY_PHASE56N, 0);
  assert.strictEqual(summary.hard_gates.UNSAFE_ELIGIBILITY_CLASSIFICATIONS, 0);
  assert.strictEqual(summary.hard_gates.EXISTING_PHASE56L_REGRESSIONS, 0);
  assert.strictEqual(summary.hard_gates.CATALOG_FREEZE_INTACT, true);

  const denom = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'COVERAGE_DENOMINATOR_CORRECTION.json'), 'utf8'));
  assert.strictEqual(denom.drive_resolutions_added, 0);
  assert.strictEqual(denom.drive_types_changed, 0);
  assert.strictEqual(denom.non_machine_records_removed_from_denominator, 54);
  assert.strictEqual(denom.powered_candidates_before, 931);
  assert.strictEqual(denom.powered_candidates_after, 877);
  assert.strictEqual(denom.unknown_powered_before, 530);
  assert.strictEqual(denom.unknown_powered_after, 476);
  assert.strictEqual(denom.coverage_before_percentage, 43.07);
  assert.strictEqual(denom.coverage_after_percentage, 45.72);
});
