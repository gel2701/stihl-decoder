/**
 * tests/phase56l_drive_type_family_resolution.test.js
 *
 * Phase 56L.1 — Drive Resolution Integrity & Attachment Safety Test Suite
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
  UNVERIFIED_FAMILY_PREFIXES,
  isAttachmentDesignation,
  isPoweredModelDesignation,
  parseModelFamily,
  getFamilyRule,
  resolveDriveType,
  getDriveResolutionMetadata,
  getRegistryStats,
  ModelFamilyDriveRegistry
} from '../src/ModelFamilyDriveRegistry.js';

import {
  getFuelTypeCode,
  getFuelDriveLabel,
  isPetrolModel,
  isBatteryModel
} from '../src/publicationRules.js';

import { resolveMachineClassification, getClassificationContextLabel } from '../src/driveClassification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56l');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const HARVEST_DIR = path.join(DATA_DIR, 'harvest', 'phase56l');

test('Phase 56L.1: Attachment Safety Gate prevents misclassification of KombiTools and accessories', () => {
  const attachmentCases = [
    'BG-KM',
    'FS-KM',
    'HL-KM',
    'HT-KM',
    'FS Power Tool Attachments',
    'BF-MM',
    'Mowing head Auto Cut C12-2 Cutting Attachment'
  ];

  for (const name of attachmentCases) {
    assert.strictEqual(isAttachmentDesignation(name), true, `${name} must be identified as attachment`);
    assert.strictEqual(isPoweredModelDesignation(name), false, `${name} must not be powered designation`);

    const res = resolveDriveType(name);
    assert.strictEqual(res.drive_type, DRIVE_TYPES.UNKNOWN, `${name} drive type must be UNKNOWN`);
    assert.strictEqual(res.display, DISPLAY_LABELS.UNKNOWN, `${name} display must be 'Niet vastgesteld'`);
    assert.strictEqual(res.resolution, 'ATTACHMENT_NOT_POWERED', `${name} resolution must be ATTACHMENT_NOT_POWERED`);
    assert.strictEqual(res.family, null, `${name} must not infer a family prefix rule`);
  }
});

test('Phase 56L.1: Powered machines continue resolving correctly under attachment safety gate', () => {
  const poweredCases = [
    { name: 'BG 86', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'FS 55', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'HT 131', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'MS 211', expectedDrive: DRIVE_TYPES.PETROL },
    { name: 'MSA 300', expectedDrive: DRIVE_TYPES.BATTERY },
    { name: 'MSE 210', expectedDrive: DRIVE_TYPES.MAINS_ELECTRIC }
  ];

  for (const c of poweredCases) {
    assert.strictEqual(isAttachmentDesignation(c.name), false, `${c.name} must not be flagged as attachment`);
    assert.strictEqual(isPoweredModelDesignation(c.name), true, `${c.name} must be flagged as powered designation`);

    const res = resolveDriveType(c.name);
    assert.strictEqual(res.drive_type, c.expectedDrive, `${c.name} drive type must match`);
    assert.strictEqual(res.resolution, 'FAMILY_RULE', `${c.name} resolution must be FAMILY_RULE`);
  }
});

test('Phase 56L.1: Canonical explicit evidence propagation contract', () => {
  // Test explicit GASOLINE -> EXPLICIT_MODEL PETROL
  const gasRes = resolveDriveType({ model_name: 'Custom-Saw', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(gasRes.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(gasRes.resolution, 'EXPLICIT_MODEL');

  // Test explicit BATTERY -> EXPLICIT_MODEL BATTERY
  const batRes = resolveDriveType({ model_name: 'Custom-Battery', explicit_power_source: 'BATTERY' });
  assert.strictEqual(batRes.drive_type, DRIVE_TYPES.BATTERY);
  assert.strictEqual(batRes.resolution, 'EXPLICIT_MODEL');

  // Test explicit PETROL_2STROKE -> EXPLICIT_MODEL PETROL
  const twoStrokeRes = resolveDriveType({ model_name: 'Custom-2Stroke', explicit_fuel_type: 'PETROL_2STROKE' });
  assert.strictEqual(twoStrokeRes.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(twoStrokeRes.resolution, 'EXPLICIT_MODEL');

  // When explicit evidence agrees with family, resolution must be EXPLICIT_MODEL, NOT FAMILY_RULE
  const ms261Explicit = resolveDriveType({ model_name: 'MS 261', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(ms261Explicit.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(ms261Explicit.resolution, 'EXPLICIT_MODEL');
});

test('Phase 56L.1: Historical numeric STIHL models resolution (026, 009, 017, 044)', () => {
  const numeric026 = resolveDriveType({ model_name: '026', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric026.drive_type, DRIVE_TYPES.PETROL, '026 with gasoline evidence must not be UNKNOWN');
  assert.strictEqual(numeric026.display, 'Benzine');
  assert.strictEqual(numeric026.resolution, 'EXPLICIT_MODEL');

  const numeric009 = resolveDriveType({ model_name: '009', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric009.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric009.resolution, 'EXPLICIT_MODEL');

  const numeric017 = resolveDriveType({ model_name: '017', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric017.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric017.resolution, 'EXPLICIT_MODEL');

  const numeric044 = resolveDriveType({ model_name: '044', explicit_power_source: 'GASOLINE' });
  assert.strictEqual(numeric044.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(numeric044.resolution, 'EXPLICIT_MODEL');
});

test('Phase 56L.1: Conflict detection quarantines contradictory explicit evidence', () => {
  const conflictModel = {
    model_name: 'MS 261',
    explicit_power_source: 'BATTERY'
  };
  const res = resolveDriveType(conflictModel);
  assert.strictEqual(res.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.strictEqual(res.display, 'Niet vastgesteld');
  assert.strictEqual(res.resolution, 'CONFLICT_QUARANTINED');
  assert.strictEqual(res.source_type, 'QUARANTINED_CONFLICT');
  assert.strictEqual(res.explicit_value, 'BATTERY');
  assert.strictEqual(res.family_value, 'PETROL');
});

test('Phase 56L.1: Primary acceptance target MS 211 resolves to Benzine (PETROL)', () => {
  const result = resolveDriveType({ model_name: 'MS 211' });
  assert.strictEqual(result.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(result.display, 'Benzine');
  assert.strictEqual(result.resolution, 'FAMILY_RULE');
  assert.strictEqual(result.family, 'MS');
  assert.strictEqual(result.machine_type, 'CHAINSAW');
  assert.strictEqual(result.source_type, 'OFFICIAL_STIHL_FAMILY_EVIDENCE');
  assert.strictEqual(result.confidence, 'HIGH');
});

test('Phase 56L.1: Live official STIHL family evidence provenance validation', () => {
  const ledgerPath = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');
  assert.ok(fs.existsSync(ledgerPath), 'Official family fetch ledger must exist');

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  assert.strictEqual(ledger.length, 28, 'Must contain exactly 28 active family rules');

  for (const entry of ledger) {
    assert.strictEqual(entry.http_status, 200, `Rule ${entry.family} must have HTTP 200`);
    assert.strictEqual(entry.verification_status, 'VERIFIED', `Rule ${entry.family} must be VERIFIED`);
    assert.ok(typeof entry.body_sha256 === 'string' && entry.body_sha256.length === 64, `Rule ${entry.family} must have SHA-256 hash`);
    assert.ok(typeof entry.retrieved_at === 'string', `Rule ${entry.family} must have retrieved_at timestamp`);
    assert.ok(!entry.retrieved_at.includes('00:00:00.000Z'), `Rule ${entry.family} must not use static placeholder timestamp`);
    assert.ok((entry.page_title || entry.source_title) && (entry.page_title || entry.source_title).length > 0, `Rule ${entry.family} must have real page title`);
  }
});

test('Phase 56L.1: Integration with publicationRules.js and driveClassification.js', () => {
  // Attachment safety in publicationRules
  assert.strictEqual(getFuelTypeCode({ model_name: 'BG-KM' }), 'UNKNOWN');
  assert.strictEqual(getFuelDriveLabel({ model_name: 'BG-KM' }), 'Niet vastgesteld');
  assert.strictEqual(isPetrolModel({ model_name: 'BG-KM' }), false);

  // Attachment safety in driveClassification
  const bgKmCls = resolveMachineClassification({ exactModel: { model_name: 'BG-KM' } });
  assert.strictEqual(bgKmCls.power_source, 'UNKNOWN');
  assert.strictEqual(bgKmCls.drive_type, 'UNKNOWN');
  assert.strictEqual(bgKmCls.display_label, 'Niet vastgesteld');

  // Powered machine MS 211
  assert.strictEqual(getFuelTypeCode({ model_name: 'MS 211' }), 'PETROL');
  assert.strictEqual(getFuelDriveLabel({ model_name: 'MS 211' }), 'Benzine-aandrijving');
  assert.strictEqual(isPetrolModel({ model_name: 'MS 211' }), true);

  // Historic model 026
  assert.strictEqual(getFuelTypeCode({ model_name: '026', explicit_power_source: 'GASOLINE' }), 'PETROL_2STROKE');
  assert.strictEqual(isPetrolModel({ model_name: '026', explicit_power_source: 'GASOLINE' }), true);
});

test('Phase 56L.1: Catalog & SEO Freeze Invariants', () => {
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

test('Phase 56L.1: All 12 required artifacts exist and pass hard integrity gates', () => {
  const expectedArtifacts = [
    'MODEL_FAMILY_INVENTORY.json',
    'OFFICIAL_FAMILY_EVIDENCE.json',
    'DRIVE_TYPE_DRY_RUN.json',
    'DRIVE_TYPE_CONFLICTS.json',
    'DRIVE_TYPE_ACTIVATION.json',
    'MODEL_COVERAGE_BEFORE_AFTER.json',
    'ATTACHMENT_CLASSIFICATION_AUDIT.json',
    'FAMILY_PROVENANCE_INTEGRITY.json',
    'SEO_INTEGRITY.json',
    'CATALOG_INTEGRITY.json',
    'PHASE56L_SUMMARY.json',
    'PHASE56L_REPORT.md'
  ];

  assert.strictEqual(expectedArtifacts.length, 12, 'Must require exactly 12 artifacts');

  for (const artifact of expectedArtifacts) {
    const p = path.join(OUTPUT_DIR, artifact);
    assert.ok(fs.existsSync(p), `Artifact ${artifact} must exist in output/phase56l/`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'PHASE56L_SUMMARY.json'), 'utf8'));
  assert.strictEqual(summary.outcome_status, 'PASS');
  assert.strictEqual(summary.hard_gates.POWERED_ATTACHMENT_MISCLASSIFICATIONS, 0);
  assert.strictEqual(summary.hard_gates.POWERED_ATTACHMENT_GATE_PASSED, true);
  assert.strictEqual(summary.hard_gates.EXPLICIT_EVIDENCE_PROPAGATION_VALID, true);
  assert.strictEqual(summary.hard_gates.FABRICATED_FAMILY_PROVENANCE, 0);
  assert.strictEqual(summary.hard_gates.FAMILY_PROVENANCE_VERIFIED, true);

  const attachmentAudit = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'ATTACHMENT_CLASSIFICATION_AUDIT.json'), 'utf8'));
  assert.strictEqual(attachmentAudit.status, 'PASS');
  assert.strictEqual(attachmentAudit.powered_attachment_misclassifications, 0);

  const provenanceIntegrity = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'FAMILY_PROVENANCE_INTEGRITY.json'), 'utf8'));
  assert.strictEqual(provenanceIntegrity.status, 'PASS');
  assert.strictEqual(provenanceIntegrity.FAMILY_PROVENANCE_VERIFIED, true);
  assert.strictEqual(provenanceIntegrity.fabricated_family_provenance, 0);
});
