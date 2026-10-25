/**
 * tests/phase56l_drive_type_family_resolution.test.js
 *
 * Phase 56L.2 — Semantic STIHL Family Evidence Verification Test Suite
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
  DISABLED_FAMILY_RULES,
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
import { evaluateSemanticEvidence } from '../scripts/fetch_official_family_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'phase56l');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const HARVEST_DIR = path.join(DATA_DIR, 'harvest', 'phase56l');

test('Phase 56L.2: Attachment Safety Gate prevents misclassification of KombiTools and accessories', () => {
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

test('Phase 56L.2: Powered machines continue resolving correctly under attachment safety gate', () => {
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

test('Phase 56L.2: Canonical explicit evidence propagation contract', () => {
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

test('Phase 56L.2: Historical numeric STIHL models resolution (026, 009, 017, 044)', () => {
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

test('Phase 56L.2: Conflict detection quarantines contradictory explicit evidence', () => {
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

test('Phase 56L.2: Primary acceptance target MS 211 resolves to Benzine (PETROL)', () => {
  const result = resolveDriveType({ model_name: 'MS 211' });
  assert.strictEqual(result.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(result.display, 'Benzine');
  assert.strictEqual(result.resolution, 'FAMILY_RULE');
  assert.strictEqual(result.family, 'MS');
  assert.strictEqual(result.machine_type, 'CHAINSAW');
  assert.strictEqual(result.source_type, 'OFFICIAL_STIHL_FAMILY_EVIDENCE');
  assert.strictEqual(result.confidence, 'HIGH');
});

test('Phase 56L.2: Semantic source verification & false positive prevention fixtures', () => {
  const mseTarget = {
    family: 'MSE',
    drive_type: 'MAINS_ELECTRIC',
    family_tokens: ['MSE'],
    representative_models: ['MSE 141', 'MSE 170', 'MSE 210'],
    required_drive_terms: ['elektrisch', 'elektrische', 'electric', 'netstroom', '230v', '230 v'],
    negative_patterns: [/gazonmaaier|rasenmäher|zitmaaier|RM\s*2|RT\s*5097/i]
  };

  // 1. Wrong page fixture: MSE target with RM 2 lawn mower page
  const wrongPageFixture = {
    http_status: 200,
    page_title: 'RM 2 R benzine gazonmaaier kopen',
    body_text: 'De compacte benzine grasmaaier RM 2 R met mulchfunctie voor middelgrote gazons.'
  };
  const wrongEval = evaluateSemanticEvidence(mseTarget, wrongPageFixture);
  assert.strictEqual(wrongEval.verification_status, 'UNVERIFIED_WRONG_CONTENT');
  assert.strictEqual(wrongEval.wrong_content, true);
  assert.strictEqual(wrongEval.family_match, false);

  // 2. HTTP 200 STIHL page without family match
  const noFamilyFixture = {
    http_status: 200,
    page_title: 'STIHL Reinigingsmiddelen en accessoires kopen',
    body_text: 'Elektrische universele reiniger voor diverse toepassingen, 230 V voeding compatibel.'
  };
  const noFamEval = evaluateSemanticEvidence(mseTarget, noFamilyFixture);
  assert.strictEqual(noFamEval.verification_status, 'UNVERIFIED_NO_FAMILY_MATCH');
  assert.strictEqual(noFamEval.family_match, false);

  // 3. HTTP 200 STIHL page without drive match
  const noDriveFixture = {
    http_status: 200,
    page_title: 'STIHL MSE 141 Onderdelengids',
    body_text: 'Onderdelenoverzicht voor de MSE 141 serie kettingzaag zonder vermelde aandrijvingstechniek.'
  };
  const noDriveEval = evaluateSemanticEvidence(mseTarget, noDriveFixture);
  assert.strictEqual(noDriveEval.verification_status, 'UNVERIFIED_NO_DRIVE_MATCH');
  assert.strictEqual(noDriveEval.family_match, true);
  assert.strictEqual(noDriveEval.drive_match, false);

  // 4. Genuine matching page -> VERIFIED
  const validFixture = {
    http_status: 200,
    page_title: 'MSE 141 elektrische kettingzaag kopen',
    body_text: 'De lichte en handige elektrische kettingzaag MSE 141 C-Q met netstroom 230 V voor tuin en haardhout.'
  };
  const validEval = evaluateSemanticEvidence(mseTarget, validFixture);
  assert.strictEqual(validEval.verification_status, 'VERIFIED');
  assert.strictEqual(validEval.family_match, true);
  assert.strictEqual(validEval.drive_match, true);
  assert.ok(validEval.extracted_evidence, 'Extracted evidence must be populated');
  assert.ok(validEval.extracted_evidence.source_excerpt_hash, 'Excerpt hash must be present');
});

test('Phase 56L.2: Timestamp ordering & Cache reuse integrity in fetch ledger', () => {
  const ledgerPath = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');
  assert.ok(fs.existsSync(ledgerPath), 'Official family fetch ledger must exist');

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  // Timestamp ordering: fetch_started_at <= fetch_completed_at
  for (const entry of ledger) {
    const start = new Date(entry.fetch_started_at || entry.retrieval_started_at).getTime();
    const end = new Date(entry.fetch_completed_at || entry.retrieved_at).getTime();
    assert.ok(start <= end, `Fetch started_at (${start}) must be <= retrieved_at (${end}) for rule ${entry.family}`);
    assert.ok(!entry.retrieved_at.includes('00:00:00.000Z'), `Rule ${entry.family} must not use static placeholder timestamp`);
  }

  // Cache reuse: SHE and BGE share the exact same PDF manual fetch_id
  const bge = ledger.find(l => l.family === 'BGE');
  const she = ledger.find(l => l.family === 'SHE');
  assert.ok(bge && she, 'Both BGE and SHE must exist in ledger');
  assert.strictEqual(bge.fetch_id, she.fetch_id, 'BGE and SHE must share the exact same fetch_id');
  assert.strictEqual(she.reused_cached_fetch, true, 'SHE must be flagged as reused_cached_fetch = true');
  assert.strictEqual(bge.retrieved_at, she.retrieved_at, 'SHE must share identical retrieved_at timestamp with BGE');
});

test('Phase 56L.2: Active registry is 100% powered by semantically VERIFIED rules', () => {
  const ledgerPath = path.join(HARVEST_DIR, 'official_family_fetch_ledger.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  const activeRules = Object.values(OFFICIAL_STIHL_FAMILY_RULES);
  assert.ok(activeRules.length >= 20, 'Must have at least 20 verified active rules');

  for (const rule of activeRules) {
    const l = ledger.find(entry => entry.family === rule.family);
    assert.ok(l, `Rule ${rule.family} must have an entry in the ledger`);
    assert.strictEqual(l.verification_status, 'VERIFIED', `Active rule ${rule.family} must be VERIFIED in ledger`);
    assert.strictEqual(l.family_match, true, `Active rule ${rule.family} must have family_match = true`);
    assert.strictEqual(l.drive_match, true, `Active rule ${rule.family} must have drive_match = true`);
    assert.strictEqual(Boolean(l.wrong_content), false, `Active rule ${rule.family} must not have wrong_content = true`);
  }

  // Unverified/disabled families (e.g. HTE) must NOT be in ACTIVE rules
  assert.strictEqual(OFFICIAL_STIHL_FAMILY_RULES['HTE'], undefined, 'HTE must not be in ACTIVE rules');
  assert.ok(DISABLED_FAMILY_RULES['HTE'], 'HTE must be recorded in DISABLED_FAMILY_RULES');
  assert.strictEqual(DISABLED_FAMILY_RULES['HTE'].status, 'DISABLED');
});

test('Phase 56L.2: Representative acceptance families (MS, MSA, MSE, FS, FSA, FSE, TS, TSA, HS, HSA, HSE, BG, BGA, BGE, BR)', () => {
  const representativeFamilies = [
    { family: 'MS', drive: DRIVE_TYPES.PETROL, model: 'MS 211' },
    { family: 'MSA', drive: DRIVE_TYPES.BATTERY, model: 'MSA 300' },
    { family: 'MSE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'MSE 210' },
    { family: 'FS', drive: DRIVE_TYPES.PETROL, model: 'FS 55' },
    { family: 'FSA', drive: DRIVE_TYPES.BATTERY, model: 'FSA 120' },
    { family: 'FSE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'FSE 60' },
    { family: 'TS', drive: DRIVE_TYPES.PETROL, model: 'TS 420' },
    { family: 'TSA', drive: DRIVE_TYPES.BATTERY, model: 'TSA 230' },
    { family: 'HS', drive: DRIVE_TYPES.PETROL, model: 'HS 45' },
    { family: 'HSA', drive: DRIVE_TYPES.BATTERY, model: 'HSA 60' },
    { family: 'HSE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'HSE 42' },
    { family: 'BG', drive: DRIVE_TYPES.PETROL, model: 'BG 86' },
    { family: 'BGA', drive: DRIVE_TYPES.BATTERY, model: 'BGA 57' },
    { family: 'BGE', drive: DRIVE_TYPES.MAINS_ELECTRIC, model: 'BGE 71' },
    { family: 'BR', drive: DRIVE_TYPES.PETROL, model: 'BR 600' }
  ];

  for (const rep of representativeFamilies) {
    const rule = OFFICIAL_STIHL_FAMILY_RULES[rep.family];
    assert.ok(rule, `Representative family ${rep.family} must be ACTIVE in registry`);
    assert.strictEqual(rule.drive_type, rep.drive, `Family ${rep.family} drive type must match`);
    assert.strictEqual(rule.status, 'ACTIVE');

    const res = resolveDriveType(rep.model);
    assert.strictEqual(res.drive_type, rep.drive, `Model ${rep.model} must resolve to ${rep.drive}`);
    assert.strictEqual(res.resolution, 'FAMILY_RULE');
  }
});

test('Phase 56L.2: Integration with publicationRules.js and driveClassification.js', () => {
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

test('Phase 56L.2: Catalog & SEO Freeze Invariants', () => {
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

test('Phase 56L.2: All 12 required artifacts exist and pass semantic provenance hard gates', () => {
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
  assert.strictEqual(summary.hard_gates.EXPLICIT_EVIDENCE_PROPAGATION_VALID, true);
  assert.strictEqual(summary.hard_gates.FABRICATED_FAMILY_PROVENANCE, 0);
  assert.strictEqual(summary.hard_gates.WRONG_CONTENT_VERIFIED_RECORDS, 0);
  assert.strictEqual(summary.hard_gates.IMPOSSIBLE_TIMESTAMP_ORDER_RECORDS, 0);
  assert.strictEqual(summary.hard_gates.ACTIVE_RULES_WITHOUT_SEMANTIC_EVIDENCE, 0);
  assert.strictEqual(summary.hard_gates.SEMANTIC_FAMILY_PROVENANCE_VERIFIED, true);

  const provenanceIntegrity = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'FAMILY_PROVENANCE_INTEGRITY.json'), 'utf8'));
  assert.strictEqual(provenanceIntegrity.status, 'PASS');
  assert.strictEqual(provenanceIntegrity.SEMANTIC_FAMILY_PROVENANCE_VERIFIED, true);
  assert.strictEqual(provenanceIntegrity.wrong_content_records, 1);
  assert.strictEqual(provenanceIntegrity.WRONG_CONTENT_VERIFIED_RECORDS, 0);
  assert.strictEqual(provenanceIntegrity.impossible_timestamp_order_records, 0);
  assert.strictEqual(provenanceIntegrity.ACTIVE_RULES_WITHOUT_SEMANTIC_EVIDENCE, 0);
  assert.strictEqual(provenanceIntegrity.fabricated_family_provenance, 0);
});
