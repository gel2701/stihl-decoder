/**
 * tests/phase56l_drive_type_family_resolution.test.js
 *
 * Phase 56L — Verified Model-Family Drive-Type Resolution Test Suite
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

test('Phase 56L: ModelFamilyDriveRegistry longest-prefix-first parser', () => {
  assert.strictEqual(parseModelFamily('MS 211'), 'MS');
  assert.strictEqual(parseModelFamily('ms-211'), 'MS');
  assert.strictEqual(parseModelFamily('ms_211_c_be'), 'MS');
  assert.strictEqual(parseModelFamily('MSA 300'), 'MSA');
  assert.strictEqual(parseModelFamily('MSE 210 C-B'), 'MSE');
  assert.strictEqual(parseModelFamily('FS 55'), 'FS');
  assert.strictEqual(parseModelFamily('FSA 120'), 'FSA');
  assert.strictEqual(parseModelFamily('FSE 60'), 'FSE');
  assert.strictEqual(parseModelFamily('TS 420'), 'TS');
  assert.strictEqual(parseModelFamily('TSA 230'), 'TSA');
  assert.strictEqual(parseModelFamily('BG 86'), 'BG');
  assert.strictEqual(parseModelFamily('BGA 30'), 'BGA');
  assert.strictEqual(parseModelFamily('BGE 71'), 'BGE');
  assert.strictEqual(parseModelFamily('HS 45'), 'HS');
  assert.strictEqual(parseModelFamily('HSA 66'), 'HSA');
  assert.strictEqual(parseModelFamily('HSE 61'), 'HSE');
  assert.strictEqual(parseModelFamily('BRA 100'), 'BRA');
  assert.strictEqual(parseModelFamily('RM 248'), 'RM');
  assert.strictEqual(parseModelFamily('RMA 448'), 'RMA');
  assert.strictEqual(parseModelFamily('RME 339'), 'RME');
  assert.strictEqual(parseModelFamily('UNKNOWN 123'), null);
});

test('Phase 56L: Primary acceptance target MS 211 resolves to Benzine (PETROL)', () => {
  const result = resolveDriveType({ model_name: 'MS 211' });
  assert.strictEqual(result.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(result.display, DISPLAY_LABELS.PETROL);
  assert.strictEqual(result.display, 'Benzine');
  assert.strictEqual(result.resolution, 'FAMILY_RULE');
  assert.strictEqual(result.family, 'MS');
  assert.strictEqual(result.machine_type, 'CHAINSAW');
  assert.strictEqual(result.source_type, 'OFFICIAL_STIHL_FAMILY_EVIDENCE');
  assert.strictEqual(result.confidence, 'HIGH');
});

test('Phase 56L: Negative chainsaw cases MSA 300 (Accu) and MSE 210 (Elektrisch)', () => {
  const msa = resolveDriveType({ model_name: 'MSA 300' });
  assert.strictEqual(msa.drive_type, DRIVE_TYPES.BATTERY);
  assert.strictEqual(msa.display, 'Accu');
  assert.strictEqual(msa.resolution, 'FAMILY_RULE');
  assert.notStrictEqual(msa.drive_type, DRIVE_TYPES.PETROL);

  const mse = resolveDriveType({ model_name: 'MSE 210' });
  assert.strictEqual(mse.drive_type, DRIVE_TYPES.MAINS_ELECTRIC);
  assert.strictEqual(mse.display, 'Elektrisch / netstroom');
  assert.strictEqual(mse.resolution, 'FAMILY_RULE');
  assert.notStrictEqual(mse.drive_type, DRIVE_TYPES.PETROL);
});

test('Phase 56L: Cross-family verification cases (FS/FSA, TS/TSA, BG/BGA)', () => {
  const fs55 = resolveDriveType({ model_name: 'FS 55' });
  assert.strictEqual(fs55.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(fs55.family, 'FS');

  const fsa120 = resolveDriveType({ model_name: 'FSA 120' });
  assert.strictEqual(fsa120.drive_type, DRIVE_TYPES.BATTERY);
  assert.strictEqual(fsa120.family, 'FSA');

  const ts420 = resolveDriveType({ model_name: 'TS 420' });
  assert.strictEqual(ts420.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(ts420.family, 'TS');

  const tsa230 = resolveDriveType({ model_name: 'TSA 230' });
  assert.strictEqual(tsa230.drive_type, DRIVE_TYPES.BATTERY);
  assert.strictEqual(tsa230.family, 'TSA');

  const bg86 = resolveDriveType({ model_name: 'BG 86' });
  assert.strictEqual(bg86.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(bg86.family, 'BG');

  const bga30 = resolveDriveType({ model_name: 'BGA 30' });
  assert.strictEqual(bga30.drive_type, DRIVE_TYPES.BATTERY);
  assert.strictEqual(bga30.family, 'BGA');
});

test('Phase 56L: Fail-closed behavior for unverified families and unknown prefixes', () => {
  const bra = resolveDriveType({ model_name: 'BRA 100' });
  assert.strictEqual(bra.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.strictEqual(bra.display, 'Niet vastgesteld');
  assert.strictEqual(bra.resolution, 'UNVERIFIED_FAMILY');

  const rm = resolveDriveType({ model_name: 'RM 248' });
  assert.strictEqual(rm.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.strictEqual(rm.display, 'Niet vastgesteld');
  assert.strictEqual(rm.resolution, 'UNVERIFIED_FAMILY');

  const unknown = resolveDriveType({ model_name: 'XYZ 999' });
  assert.strictEqual(unknown.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.strictEqual(unknown.display, 'Niet vastgesteld');
  assert.strictEqual(unknown.resolution, 'UNKNOWN');
});

test('Phase 56L: Precedence: explicit evidence beats family rule', () => {
  const explicitModel = {
    model_name: 'MS 261',
    basic_classification: { power_source: 'GASOLINE', fuel_type: 'PETROL_2STROKE' }
  };
  const res = resolveDriveType(explicitModel);
  assert.strictEqual(res.drive_type, DRIVE_TYPES.PETROL);
  assert.strictEqual(res.resolution, 'EXPLICIT_MODEL');
});

test('Phase 56L: Conflict handling: contradictory explicit evidence is quarantined', () => {
  const conflictModel = {
    model_name: 'MS 261',
    basic_classification: { power_source: 'BATTERY' }
  };
  const res = resolveDriveType(conflictModel);
  assert.strictEqual(res.drive_type, DRIVE_TYPES.UNKNOWN);
  assert.strictEqual(res.display, 'Niet vastgesteld');
  assert.strictEqual(res.resolution, 'CONFLICT_QUARANTINED');
  assert.strictEqual(res.source_type, 'QUARANTINED_CONFLICT');
});

test('Phase 56L: Integration with publicationRules.js', () => {
  const ms211 = { model_name: 'MS 211' };
  assert.strictEqual(getFuelTypeCode(ms211), 'PETROL');
  assert.strictEqual(getFuelDriveLabel(ms211), 'Benzine-aandrijving');
  assert.strictEqual(isPetrolModel(ms211), true);
  assert.strictEqual(isBatteryModel(ms211), false);

  const msa300 = { model_name: 'MSA 300' };
  assert.strictEqual(getFuelTypeCode(msa300), 'BATTERY');
  assert.strictEqual(isBatteryModel(msa300), true);
  assert.strictEqual(isPetrolModel(msa300), false);
});

test('Phase 56L: Integration with driveClassification.js', () => {
  const cls = resolveMachineClassification({ exactModel: { model_name: 'MS 211' } });
  assert.strictEqual(cls.power_source, 'PETROL');
  assert.strictEqual(cls.display_label, 'Benzine');
  assert.strictEqual(cls.evidence, 'FAMILY_RULE_DERIVED');
  assert.strictEqual(getClassificationContextLabel(cls), '≈ Afgeleid van geverifieerde modelfamilie');

  const unk = resolveMachineClassification({ identityStatus: 'MODEL_NOT_IDENTIFIED' });
  assert.strictEqual(unk.power_source, 'UNKNOWN');
  assert.strictEqual(unk.display_label, 'Niet vastgesteld');
});

test('Phase 56L: Catalog & SEO Freeze Invariants', () => {
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

test('Phase 56L: All 10 artifacts exist and pass integrity checks', () => {
  const expectedArtifacts = [
    'MODEL_FAMILY_INVENTORY.json',
    'OFFICIAL_FAMILY_EVIDENCE.json',
    'DRIVE_TYPE_DRY_RUN.json',
    'DRIVE_TYPE_CONFLICTS.json',
    'DRIVE_TYPE_ACTIVATION.json',
    'MODEL_COVERAGE_BEFORE_AFTER.json',
    'SEO_INTEGRITY.json',
    'CATALOG_INTEGRITY.json',
    'PHASE56L_SUMMARY.json',
    'PHASE56L_REPORT.md'
  ];

  for (const artifact of expectedArtifacts) {
    const p = path.join(OUTPUT_DIR, artifact);
    assert.ok(fs.existsSync(p), `Artifact ${artifact} must exist in output/phase56l/`);
  }

  const summary = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'PHASE56L_SUMMARY.json'), 'utf8'));
  assert.strictEqual(summary.outcome_status, 'PASS');
  assert.strictEqual(summary.acceptance_cases_verified.all_passed, true);
  assert.strictEqual(summary.conflict_summary.total_conflicts, 0);

  const catalog = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'CATALOG_INTEGRITY.json'), 'utf8'));
  assert.strictEqual(catalog.status, 'PASS');
  assert.strictEqual(catalog.invariants.amazon_production_tag, 'srihldecoder2-21');
  assert.strictEqual(catalog.invariants.verified_asin_mappings_count, 0);

  const seo = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'SEO_INTEGRITY.json'), 'utf8'));
  assert.strictEqual(seo.status, 'PASS');
  assert.strictEqual(seo.invariants.indexable_parts_after, 843);
  assert.strictEqual(seo.invariants.sitemap_urls_after, 1024);
});
