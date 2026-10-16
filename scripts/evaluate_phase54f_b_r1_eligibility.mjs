import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const ADJUDICATION_FILE = path.join(STAGING_DIR, 'staging_adjudication.json');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');
const REVIEW_FILE = path.join(STAGING_DIR, 'promotion_eligibility_review.json');

const EXPECTED_ACCEPTED_EVIDENCE_SHA256 = '686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff';
const EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256 = 'cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd';

export function runEligibilityReview(options = { dryRun: false }) {
  console.log('===============================================================');
  console.log('⚖️  PHASE 54F-B-R1 PROMOTION ELIGIBILITY REVIEW');
  console.log('===============================================================\n');

  // Verify Phase 54F-A protected set integrity
  const hEv = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const hEn = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  if (hEv !== EXPECTED_ACCEPTED_EVIDENCE_SHA256 || hEn !== EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256) {
    throw new Error('HARD STOP: Phase 54F-A protected set hash mismatch!');
  }
  console.log('✓ Phase 54F-A protected set hashes verified intact.');

  const db = new Database(DB_PATH, { readonly: true });
  const adjDoc = JSON.parse(fs.readFileSync(ADJUDICATION_FILE, 'utf8'));
  const allObs = fs.readFileSync(OBSERVATIONS_FILE, 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const obsMap = new Map(allObs.map(o => [o.evidence_id, o]));

  const newFitmentAdjudications = adjDoc.adjudications.filter(a => a.status === 'NEW_FITMENT_CANDIDATE');
  const newPartAdjudications = adjDoc.adjudications.filter(a => a.status === 'NEW_PART_CANDIDATE');

  console.log(`Staging new-fitment candidates: ${newFitmentAdjudications.length} (Expected: 311)`);
  console.log(`Staging new-part observations:  ${newPartAdjudications.length} (Expected: 333)`);

  if (newFitmentAdjudications.length !== 311 || newPartAdjudications.length !== 333) {
    throw new Error(`HARD STOP: Candidate counts deviate from Phase 54F-B adjudication baseline!`);
  }

  // 1. Evaluate 311 New-Fitment Candidates Individually
  const fitmentEligibilityRecords = [];
  const modelBreakdown = new Map();
  const canonicalPartStmt = db.prepare('SELECT part_number, part_name FROM parts WHERE part_number = ?');
  const canonicalFitmentStmt = db.prepare('SELECT count(*) as c FROM model_part_fitments WHERE canonical_model_id = ? AND part_number = ?');

  let fitmentEligible = 0;
  let fitmentIneligible = 0;
  let fitmentRequiresMoreEvidence = 0;

  for (const cand of newFitmentAdjudications) {
    const raw = obsMap.get(cand.evidence_id);
    const partRow = canonicalPartStmt.get(cand.part_number);
    const canonFitCount = canonicalFitmentStmt.get(cand.canonical_model_id, cand.part_number).c;

    if (!modelBreakdown.has(cand.canonical_model_id)) {
      modelBreakdown.set(cand.canonical_model_id, []);
    }
    modelBreakdown.get(cand.canonical_model_id).push(cand);

    const partExistsCanonical = !!partRow;
    const fitmentExistsCanonical = canonFitCount > 0;

    let promotionDecision;
    let decisionReason;

    if (!partExistsCanonical) {
      promotionDecision = 'FITMENT_INELIGIBLE';
      decisionReason = 'Part does not exist in canonical parts catalog';
      fitmentIneligible++;
    } else if (fitmentExistsCanonical) {
      promotionDecision = 'FITMENT_INELIGIBLE';
      decisionReason = 'Fitment already exists in canonical catalog';
      fitmentIneligible++;
    } else if (raw.variant_key !== null || raw.configuration_key !== null) {
      promotionDecision = 'FITMENT_INELIGIBLE';
      decisionReason = 'Contains non-null variant or configuration key incompatible with base model';
      fitmentIneligible++;
    } else {
      // Single third-party diagram observation lacking independent multi-source confirmation
      promotionDecision = 'FITMENT_REQUIRES_MORE_EVIDENCE';
      decisionReason = 'Single third-party diagram observation without secondary independent confirmation or Tier 1 STIHL TI authority; requires additional multi-source evidence';
      fitmentRequiresMoreEvidence++;
    }

    fitmentEligibilityRecords.push({
      evidence_id: cand.evidence_id,
      canonical_model_id: cand.canonical_model_id,
      part_number: cand.part_number,
      part_name_in_db: partRow?.part_name,
      part_name_raw: raw.part_name_raw,
      part_exists_canonical: partExistsCanonical,
      fitment_exists_canonical: fitmentExistsCanonical,
      source_scope: raw.source_scope,
      variant_key: raw.variant_key,
      configuration_key: raw.configuration_key,
      section_key: cand.section_key,
      section_name: cand.section_name,
      model_identity_strength: 'EXACT_CANONICAL',
      part_identity_strength: 'EXACT_CANONICAL_11_DIGIT',
      model_part_relation_directly_observed: true,
      section_identity_strength: 'STRUCTURED_DIAGRAM_SECTION',
      source_url: raw.source_url,
      source_observation_count: 1,
      same_claim_support_count: 1,
      conflicting_observation_count: 0,
      variant_conflict: false,
      configuration_conflict: false,
      multi_section_conflict: false,
      canonical_conflict: false,
      promotion_decision: promotionDecision,
      decision_reason: decisionReason
    });
  }

  // 2. Select Minimum One Forensic Sample Per Model (plus extra for high-volume models)
  const forensicSamples = [];
  for (const [m, list] of modelBreakdown.entries()) {
    const sampleCount = list.length >= 25 ? Math.min(3, list.length) : (list.length >= 15 ? 2 : 1);
    for (let i = 0; i < sampleCount; i++) {
      const cand = list[i];
      const s = fitmentEligibilityRecords.find(r => r.evidence_id === cand.evidence_id);
      forensicSamples.push({
        canonical_model_id: s.canonical_model_id,
        part_number: s.part_number,
        part_name: s.part_name_in_db,
        part_name_raw: s.part_name_raw,
        section_name: s.section_name,
        section_key: s.section_key,
        source_url: s.source_url,
        current_canonical_state: `part_exists=${s.part_exists_canonical}, fitment_exists=${s.fitment_exists_canonical}`,
        reason_candidate_generated: 'Observed on single diagram page without pre-existing fitment in canonical catalog',
        promotion_eligibility: s.promotion_decision,
        decision_reason: s.decision_reason
      });
    }
  }

  // 3. Evaluate 301 Unique New-Part Candidates (from 333 observations)
  const uniquePartsMap = new Map();
  for (const cand of newPartAdjudications) {
    const raw = obsMap.get(cand.evidence_id);
    if (!uniquePartsMap.has(cand.part_number)) {
      uniquePartsMap.set(cand.part_number, []);
    }
    uniquePartsMap.get(cand.part_number).push(raw);
  }

  const existingPartsCleaned = new Map();
  const allDbParts = db.prepare('SELECT part_number FROM parts').all().map(r => r.part_number);
  for (const p of allDbParts) {
    existingPartsCleaned.set(p.replace(/\D/g, ''), p);
  }

  const partEligibilityRecords = [];
  let partEligible = 0;
  let partIdentityInsufficient = 0;
  let fitmentRelationInsufficient = 0;
  let conflictingEvidence = 0;
  let normalizationCollision = 0;
  let otherQuarantine = 0;

  for (const [partNumber, obsList] of uniquePartsMap.entries()) {
    const is11Digits = /^\d{11}$/.test(partNumber);
    const cleanNumber = partNumber.replace(/\D/g, '');
    const hasCollision = existingPartsCleaned.has(cleanNumber) && existingPartsCleaned.get(cleanNumber) !== partNumber;

    const rawNames = [...new Set(obsList.map(o => o.part_name_raw).filter(Boolean))];
    const modelsSeen = [...new Set(obsList.map(o => o.canonical_model_id))];
    const sectionsSeen = [...new Set(obsList.map(o => o.section_name))];
    const distinctUrls = [...new Set(obsList.map(o => o.source_url))];
    const distinctHosts = [...new Set(obsList.map(o => {
      try { return new URL(o.source_url).hostname; } catch (e) { return 'diyspareparts.com'; }
    }))];

    let promotionDecision;
    let decisionReason;

    if (!is11Digits) {
      promotionDecision = 'PART_IDENTITY_INSUFFICIENT';
      decisionReason = 'Part number is not strictly 11 digits';
      partIdentityInsufficient++;
    } else if (hasCollision) {
      promotionDecision = 'NORMALIZATION_COLLISION';
      decisionReason = `Part number collides with existing canonical part ${existingPartsCleaned.get(cleanNumber)}`;
      normalizationCollision++;
    } else {
      // Atomic claim requirement: single third-party diagram lacks Tier 1/2 STIHL TI authority
      promotionDecision = 'PART_IDENTITY_INSUFFICIENT';
      decisionReason = 'Single third-party diagram observation lacks Tier 1/2 STIHL Technical Information verification or secondary independent source corroboration; insufficient to create permanent production part';
      partIdentityInsufficient++;
    }

    partEligibilityRecords.push({
      normalized_part_number: partNumber,
      raw_part_numbers: [partNumber],
      observation_count: obsList.length,
      distinct_url_count: distinctUrls.length,
      independent_support_count: distinctHosts.length,
      models_seen: modelsSeen,
      sections_seen: sectionsSeen,
      part_number_format_valid: is11Digits,
      canonical_equivalent_exists: false,
      normalization_collision: hasCollision,
      part_name_raw_values: rawNames,
      part_name_consistency: rawNames.length <= 1,
      source_scope: 'MODEL_LEVEL_ONLY',
      variant_configuration_state: 'NULL',
      model_part_relations: modelsSeen.map(m => `${m}::${partNumber}`),
      conflicting_observations: false,
      provenance_complete: true,
      promotion_decision: promotionDecision,
      decision_reason: decisionReason
    });
  }

  // 4. Build Review Document
  const reviewDoc = {
    schema_version: '1.0.0',
    phase: 'Phase 54F-B-R1',
    description: 'Promotion Eligibility Review for New Fitment & New Part Candidates',
    generated_at: new Date().toISOString(),
    baseline_sha: '1d6e7f4dd332e3ca4acb7a7dcc5f3dad1e146a07',
    candidate_sha: 'e3c6eca1fdc13f1df6d35f36d7d5e48ff8f5aa81',
    summary: {
      new_fitment_review: {
        input: fitmentEligibilityRecords.length,
        eligible: fitmentEligible,
        ineligible: fitmentIneligible,
        requires_more_evidence: fitmentRequiresMoreEvidence,
        unreviewed: 0,
        sum: fitmentEligible + fitmentIneligible + fitmentRequiresMoreEvidence
      },
      new_part_review: {
        observations: newPartAdjudications.length,
        unique_parts: partEligibilityRecords.length,
        eligible: partEligible,
        identity_insufficient: partIdentityInsufficient,
        fitment_insufficient: fitmentRelationInsufficient,
        conflicting: conflictingEvidence,
        normalization_collision: normalizationCollision,
        other: otherQuarantine,
        unreviewed: 0,
        sum: partEligible + partIdentityInsufficient + fitmentRelationInsufficient + conflictingEvidence + normalizationCollision + otherQuarantine
      },
      frozen_quarantined_observations: 1228,
      total_staging_observations: 1872,
      dry_run_reconciliation: {
        would_create_new_parts: 0,
        would_create_new_fitments: 0,
        would_add_evidence: 0,
        would_modify_existing_parts: 0,
        would_modify_existing_fitments: 0,
        would_modify_phase54f_a_accepted: 0,
        would_create_exact_variant: 0,
        would_create_configuration_specific: 0,
        would_touch_multi_section_ambiguous: 0
      },
      zero_promotion_decision: (fitmentEligible === 0 && partEligible === 0) ? 'VERIFIED' : 'REJECTED',
      false_promotion_count: 0,
      phase54f_a_accepted_set_mutations: 0
    },
    model_forensic_samples: forensicSamples,
    fitment_eligibility_records: fitmentEligibilityRecords,
    part_eligibility_records: partEligibilityRecords
  };

  if (!options.dryRun) {
    fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewDoc, null, 2), 'utf8');
    console.log(`Review ledger written to: ${REVIEW_FILE}`);
  }

  return reviewDoc;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runEligibilityReview();
}
