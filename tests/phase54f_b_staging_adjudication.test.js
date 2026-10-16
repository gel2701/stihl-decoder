import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { EnrichmentScopeValidator, SCOPES } from '../src/parts/EnrichmentScopeValidator.js';
import { runAdjudication } from '../scripts/adjudicate_phase54f_staging.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const ADJUDICATION_FILE = path.join(STAGING_DIR, 'staging_adjudication.json');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');

const EXPECTED_ACCEPTED_EVIDENCE_SHA256 = '686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff';
const EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256 = 'cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd';

test('Phase 54F-B Test A — Existing Safe Fitment Matching', () => {
  const candidate = {
    fitment_id: '11216403202::ms_260::base::base::BASE_MODEL_CONFIRMED',
    canonical_model_id: 'ms_260',
    part_number: '11216403202',
    section_name: 'Oil Pump'
  };
  const modelEvidence = {
    canonical_model_id: 'ms_260',
    part_number: '11216403202',
    section_name: 'Oil Pump',
    source_scope: 'MODEL_LEVEL_ONLY',
    variant_key: null,
    configuration_key: null
  };
  const baseFitment = {
    fitment_id: candidate.fitment_id,
    canonical_model_id: 'ms_260',
    part_number: '11216403202',
    variant_key: 'base',
    fitment_scope: SCOPES.BASE_MODEL_CONFIRMED,
    configuration_key: null
  };

  const validation = EnrichmentScopeValidator.validateEnrichment(candidate, modelEvidence, baseFitment);
  assert.strictEqual(validation.valid, true, 'Base model evidence must validate for base model fitment');
  assert.strictEqual(validation.errors.length, 0);
});

test('Phase 54F-B Test B — Missing Fitment Candidate Isolation', () => {
  assert.ok(fs.existsSync(ADJUDICATION_FILE), 'Adjudication file must exist');
  const doc = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));

  const newFitmentCandidates = doc.adjudications.filter(a => a.status === 'NEW_FITMENT_CANDIDATE');
  assert.strictEqual(newFitmentCandidates.length, 311, 'Must isolate exactly 311 new fitment candidates');

  // Verify none are promoted
  assert.strictEqual(doc.summary.promoted_from_staging, 0);

  // Check that all 311 have matching canonical parts in DB
  const db = new Database(DB_PATH, { readonly: true });
  for (const c of newFitmentCandidates) {
    const part = db.prepare('SELECT part_number FROM parts WHERE part_number = ?').get(c.part_number);
    assert.ok(part, `Candidate part ${c.part_number} must exist in canonical parts catalog`);
    const fitment = db.prepare('SELECT fitment_id FROM model_part_fitments WHERE canonical_model_id = ? AND part_number = ?').get(c.canonical_model_id, c.part_number);
    assert.strictEqual(fitment, undefined, `Candidate model-part ${c.canonical_model_id}::${c.part_number} must NOT exist in canonical fitments`);
  }
});

test('Phase 54F-B Test C — Multi-Section Ambiguity Quarantine', () => {
  const doc = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));
  const multiSectionAdj = doc.adjudications.filter(a => a.status === 'MULTI_SECTION_AMBIGUOUS');

  assert.strictEqual(multiSectionAdj.length, 958, 'Must quarantine exactly 958 multi-section observations');

  // Verify that unique model-part pairs among these match 399
  const uniquePairs = new Set(multiSectionAdj.map(a => `${a.canonical_model_id}::${a.part_number}`));
  assert.strictEqual(uniquePairs.size, 399, 'Must span exactly 399 multi-section model-part pairs');
});

test('Phase 54F-B Test D — Null Variant Key Never Produces Exact Variant', () => {
  const candidate = {
    fitment_id: '11410201200::ms_261::c_m::base::EXACT_VARIANT',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder'
  };
  const nullVariantEvidence = {
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder',
    source_scope: 'MODEL_LEVEL_ONLY',
    variant_key: null,
    configuration_key: null
  };
  const exactVariantFitment = {
    fitment_id: candidate.fitment_id,
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    variant_key: 'c_m',
    fitment_scope: SCOPES.EXACT_VARIANT,
    configuration_key: null
  };

  const validation = EnrichmentScopeValidator.validateEnrichment(candidate, nullVariantEvidence, exactVariantFitment);
  assert.strictEqual(validation.valid, false, 'Model-level null variant evidence cannot enrich exact variant fitment');
  assert.ok(validation.errors.some(e => e.includes('INVALID_MODEL_LEVEL_TO_EXACT_VARIANT')));
});

test('Phase 54F-B Test E — Variant Match Functional', () => {
  const candidate = {
    fitment_id: '11410201200::ms_261::c_m::base::EXACT_VARIANT',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder'
  };
  const variantEvidence = {
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder',
    source_scope: 'EXACT_VARIANT',
    variant_key: 'c_m',
    configuration_key: null
  };
  const exactVariantFitment = {
    fitment_id: candidate.fitment_id,
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    variant_key: 'c_m',
    fitment_scope: SCOPES.EXACT_VARIANT,
    configuration_key: null
  };

  const validation = EnrichmentScopeValidator.validateEnrichment(candidate, variantEvidence, exactVariantFitment);
  assert.strictEqual(validation.valid, true, 'Legitimate matching variant evidence must pass');
  assert.strictEqual(validation.errors.length, 0);
});

test('Phase 54F-B Test F — Variant Mismatch Rejection', () => {
  const candidate = {
    fitment_id: '11410201200::ms_261::c_be::base::EXACT_VARIANT',
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder'
  };
  const variantEvidence = {
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    section_name: 'Cylinder',
    source_scope: 'EXACT_VARIANT',
    variant_key: 'c_m', // Mismatch!
    configuration_key: null
  };
  const targetFitment = {
    fitment_id: candidate.fitment_id,
    canonical_model_id: 'ms_261',
    part_number: '11410201200',
    variant_key: 'c_be',
    fitment_scope: SCOPES.EXACT_VARIANT,
    configuration_key: null
  };

  const validation = EnrichmentScopeValidator.validateEnrichment(candidate, variantEvidence, targetFitment);
  assert.strictEqual(validation.valid, false, 'Mismatching variant evidence must be rejected');
  assert.ok(validation.errors.some(e => e.includes('VARIANT_MISMATCH')));
});

test('Phase 54F-B Test G — Configuration Leakage Rejection', () => {
  const doc = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));
  const configUnresolved = doc.adjudications.filter(a => a.status === 'CONFIGURATION_SCOPE_UNRESOLVED');

  assert.strictEqual(configUnresolved.length, 126, 'Must isolate exactly 126 configuration scope unresolved items');

  // Verify none were promoted to configuration-specific fitments
  assert.strictEqual(doc.dry_run_report.invalid_configuration_promotion, 0);
});

test('Phase 54F-B Test H — Duplicate Evidence Non-Duplication', () => {
  const doc = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));
  const duplicates = doc.adjudications.filter(a => a.status === 'DUPLICATE_OR_REDUNDANT');

  assert.strictEqual(duplicates.length, 5, 'Must identify exactly 5 duplicate/redundant items');

  const db = new Database(DB_PATH, { readonly: true });
  for (const d of duplicates) {
    const existing = db.prepare('SELECT section_name FROM model_part_fitments WHERE canonical_model_id = ? AND part_number = ?').get(d.canonical_model_id, d.part_number);
    assert.ok(existing, `Existing fitment must exist for duplicate item ${d.canonical_model_id}::${d.part_number}`);
    assert.strictEqual(existing.section_name.toLowerCase().trim(), d.section_name.toLowerCase().trim(), 'Section names must match identically');
  }
});

test('Phase 54F-B Test I — Adjudication Idempotency', () => {
  const beforeContent = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));
  delete beforeContent.generated_at;

  const rerunResult = runAdjudication({ dryRun: true });
  delete rerunResult.generated_at;

  assert.deepStrictEqual(beforeContent, rerunResult, 'Adjudication rerun must produce identical semantic state');
});

test('Phase 54F-B Test J — Phase 54F-A Protected Set Integrity (Zero Mutations)', () => {
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assert.strictEqual(currentEvidenceHash, EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'accepted_evidence.jsonl hash must match Phase 54F-A baseline');
  assert.strictEqual(currentEnrichmentHash, EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'parts_section_enrichment.json hash must match Phase 54F-A baseline');

  const doc = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));
  assert.strictEqual(doc.summary.phase54f_a_accepted_set_mutations, 0, 'PHASE54F_A_ACCEPTED_SET_MUTATIONS must be exactly 0');
});
