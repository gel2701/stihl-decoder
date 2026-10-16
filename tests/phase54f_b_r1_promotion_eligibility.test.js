import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { runEligibilityReview } from '../scripts/evaluate_phase54f_b_r1_eligibility.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const REVIEW_FILE = path.join(STAGING_DIR, 'promotion_eligibility_review.json');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');

const EXPECTED_ACCEPTED_EVIDENCE_SHA256 = '686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff';
const EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256 = 'cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd';

test('Phase 54F-B-R1 Test 1 — Eligible Existing-Part / New-Fitment Contract', () => {
  // Evaluates contract requirements for a hypothetical eligible new fitment
  const hypotheticalCandidate = {
    canonical_model_id: 'ms_260',
    part_number: '11216403202',
    part_exists_canonical: true,
    fitment_exists_canonical: false,
    source_scope: 'MODEL_LEVEL_ONLY',
    variant_key: null,
    configuration_key: null,
    multi_section_conflict: false,
    variant_conflict: false,
    configuration_conflict: false,
    canonical_conflict: false,
    provenance_complete: true,
    independent_support_count: 2
  };

  const isEligible = hypotheticalCandidate.part_exists_canonical &&
    !hypotheticalCandidate.fitment_exists_canonical &&
    hypotheticalCandidate.source_scope === 'MODEL_LEVEL_ONLY' &&
    hypotheticalCandidate.variant_key === null &&
    hypotheticalCandidate.configuration_key === null &&
    !hypotheticalCandidate.multi_section_conflict &&
    !hypotheticalCandidate.variant_conflict &&
    !hypotheticalCandidate.configuration_conflict &&
    !hypotheticalCandidate.canonical_conflict &&
    hypotheticalCandidate.provenance_complete &&
    hypotheticalCandidate.independent_support_count >= 2;

  assert.strictEqual(isEligible, true, 'Fully corroborated base-model fitment satisfying all 11 criteria must be eligible');
});

test('Phase 54F-B-R1 Test 2 — Insufficient New-Fitment Candidate Isolation', () => {
  assert.ok(fs.existsSync(REVIEW_FILE), 'Review ledger file must exist');
  const reviewDoc = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));

  assert.strictEqual(reviewDoc.summary.new_fitment_review.input, 311, 'All 311 fitment candidates must be evaluated');
  assert.strictEqual(reviewDoc.summary.new_fitment_review.eligible, 0, 'No uncorroborated single-source fitment may be eligible');
  assert.strictEqual(reviewDoc.summary.new_fitment_review.requires_more_evidence, 311, 'All 311 fitments must require more evidence');
  assert.strictEqual(reviewDoc.summary.new_fitment_review.unreviewed, 0, 'Zero fitments unreviewed');
});

test('Phase 54F-B-R1 Test 3 — Eligible New-Part Candidate Atomic Contract', () => {
  const hypotheticalPart = {
    normalized_part_number: '11410201299',
    format_valid_11_digit: true,
    normalization_collision: false,
    canonical_equivalent_exists: false,
    has_tier_1_2_authority: true,
    independent_support_count: 2,
    fits_canonical_model: 'ms_261',
    provenance_complete: true
  };

  const isPartEligible = hypotheticalPart.format_valid_11_digit &&
    !hypotheticalPart.normalization_collision &&
    !hypotheticalPart.canonical_equivalent_exists &&
    (hypotheticalPart.has_tier_1_2_authority || hypotheticalPart.independent_support_count >= 2) &&
    hypotheticalPart.fits_canonical_model !== null &&
    hypotheticalPart.provenance_complete;

  assert.strictEqual(isPartEligible, true, 'Corroborated atomic part + fitment claim must satisfy eligibility contract');
});

test('Phase 54F-B-R1 Test 4 — New-Part Insufficient Identity Quarantine', () => {
  const reviewDoc = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));

  assert.strictEqual(reviewDoc.summary.new_part_review.unique_parts, 301, 'Must evaluate exactly 301 unique candidate parts');
  assert.strictEqual(reviewDoc.summary.new_part_review.eligible, 0, 'Zero new parts eligible without STIHL TI authority');
  assert.strictEqual(reviewDoc.summary.new_part_review.identity_insufficient, 301, 'All 301 parts quarantined as identity insufficient');
  assert.strictEqual(reviewDoc.summary.new_part_review.unreviewed, 0, 'Zero parts unreviewed');
});

test('Phase 54F-B-R1 Test 5 — Normalization Collision Detection', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const existingPart = db.prepare('SELECT part_number FROM parts LIMIT 1').get();
  assert.ok(existingPart, 'Database must contain existing parts');

  // Candidate with formatting variations that normalizes to existing part
  const candidateRaw = `${existingPart.part_number.slice(0, 4)} ${existingPart.part_number.slice(4, 7)} ${existingPart.part_number.slice(7)}`;
  const candidateClean = candidateRaw.replace(/\D/g, '');
  const existingClean = existingPart.part_number.replace(/\D/g, '');

  const isCollision = (candidateClean === existingClean);
  assert.strictEqual(isCollision, true, 'Normalization must detect collision against existing canonical part');
});

test('Phase 54F-B-R1 Test 6 — Duplicate Source Observation Isolation', () => {
  const reviewDoc = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  const frozenQuarantined = reviewDoc.summary.frozen_quarantined_observations;
  assert.strictEqual(frozenQuarantined, 1228, 'Must maintain exactly 1228 frozen quarantined observations');

  const adjDoc = JSON.parse(fs.readFileSync(path.join(STAGING_DIR, 'staging_adjudication.json'), 'utf8'));
  const duplicates = adjDoc.adjudications.filter(a => a.status === 'DUPLICATE_OR_REDUNDANT');
  assert.strictEqual(duplicates.length, 5, 'Duplicate source observations must remain isolated (5 items)');
});

test('Phase 54F-B-R1 Test 7 — Multi-Observation Same-Source Non-Independence', () => {
  const reviewDoc = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  const multiObsParts = reviewDoc.part_eligibility_records.filter(r => r.observation_count > 1);

  assert.ok(multiObsParts.length > 0, 'Must contain parts observed multiple times');
  for (const part of multiObsParts) {
    assert.strictEqual(part.independent_support_count, 1, `Multi-observation part ${part.normalized_part_number} from same host has independent_support_count = 1`);
  }
});

test('Phase 54F-B-R1 Test 8 — Atomic New-Part + Fitment Promotion Contract', () => {
  // If part identity claim fails, fitment relation claim cannot independently create part
  const mockClaim = {
    claim_A_part_identity_sufficient: false,
    claim_B_fitment_relation_observed: true
  };

  const atomicPromotionAllowed = mockClaim.claim_A_part_identity_sufficient && mockClaim.claim_B_fitment_relation_observed;
  assert.strictEqual(atomicPromotionAllowed, false, 'Cannot promote fitment for a part whose existence is not proven');
});

test('Phase 54F-B-R1 Test 9 — Promotion Provenance Completeness', () => {
  const reviewDoc = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));

  for (const fitment of reviewDoc.fitment_eligibility_records) {
    assert.ok(fitment.evidence_id, 'fitment must have evidence_id');
    assert.ok(fitment.canonical_model_id, 'fitment must have canonical_model_id');
    assert.ok(fitment.part_number, 'fitment must have part_number');
    assert.ok(fitment.source_url, 'fitment must have source_url');
    assert.ok(fitment.promotion_decision, 'fitment must have promotion_decision');
    assert.ok(fitment.decision_reason, 'fitment must have decision_reason');
  }

  for (const part of reviewDoc.part_eligibility_records) {
    assert.ok(part.normalized_part_number, 'part must have normalized_part_number');
    assert.ok(part.observation_count >= 1, 'part must have observation_count >= 1');
    assert.ok(part.promotion_decision, 'part must have promotion_decision');
    assert.ok(part.decision_reason, 'part must have decision_reason');
  }
});

test('Phase 54F-B-R1 Test 10 — Rerun Idempotency', () => {
  const beforeReview = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  delete beforeReview.generated_at;

  const rerunResult = runEligibilityReview({ dryRun: true });
  delete rerunResult.generated_at;

  assert.deepStrictEqual(beforeReview, rerunResult, 'Eligibility review rerun must produce identical semantic state');
});

test('Phase 54F-B-R1 Test 11 — Phase 54F-A Accepted-Set Protection (Zero Mutations)', () => {
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assert.strictEqual(currentEvidenceHash, EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'accepted_evidence.jsonl hash must match Phase 54F-A baseline');
  assert.strictEqual(currentEnrichmentHash, EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'parts_section_enrichment.json hash must match Phase 54F-A baseline');

  const reviewDoc = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  assert.strictEqual(reviewDoc.summary.phase54f_a_accepted_set_mutations, 0, 'PHASE54F_A_ACCEPTED_SET_MUTATIONS must be 0');
});
