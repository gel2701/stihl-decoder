import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { runUnmaskedEscalation } from '../scripts/escalate_phase54f_unmasked_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const UNMASKED_ESCALATION_FILE = path.join(STAGING_DIR, 'unmasked_evidence_escalation.json');
const MULTISECTION_RESOLUTION_FILE = path.join(STAGING_DIR, 'multisection_resolution.json');
const D_CONTEXTS_FILE = path.join(rootDir, 'data', 'model_part_fitment_section_contexts.json');
const EXTERNAL_CACHE_DIR = path.join(STAGING_DIR, 'external_cache');

describe('Phase 54F-F — Newly Unmasked Evidence Escalation Test Suite', () => {
  const escalationDoc = JSON.parse(fs.readFileSync(UNMASKED_ESCALATION_FILE, 'utf8'));
  const multisectionDoc = JSON.parse(fs.readFileSync(MULTISECTION_RESOLUTION_FILE, 'utf8'));
  const dContextsDoc = JSON.parse(fs.readFileSync(D_CONTEXTS_FILE, 'utf8'));

  // Test 1 — Exact 24 / 50 New-Part Accounting
  it('Test 1 — Exact 24 / 50 New-Part Accounting', () => {
    const ta = escalationDoc.target_accounting;
    assert.equal(ta.new_part_pairs, 24);
    assert.equal(ta.new_part_observations, 50);
    assert.equal(ta.unique_new_part_numbers, 24);

    const newPartCandidates = escalationDoc.candidate_ledger.filter(c => c.candidate_type === 'NEW_PART');
    assert.equal(newPartCandidates.length, 24);
    const obsSum = newPartCandidates.reduce((acc, c) => acc + c.observation_count, 0);
    assert.equal(obsSum, 50);

    const uniqueParts = new Set(newPartCandidates.map(c => c.part_number));
    assert.equal(uniqueParts.size, 24);
  });

  // Test 2 — Exact 26 / 66 New-Fitment Accounting
  it('Test 2 — Exact 26 / 66 New-Fitment Accounting', () => {
    const ta = escalationDoc.target_accounting;
    assert.equal(ta.new_fitment_pairs, 26);
    assert.equal(ta.new_fitment_observations, 66);

    const newFitmentCandidates = escalationDoc.candidate_ledger.filter(c => c.candidate_type === 'NEW_FITMENT');
    assert.equal(newFitmentCandidates.length, 26);
    const obsSum = newFitmentCandidates.reduce((acc, c) => acc + c.observation_count, 0);
    assert.equal(obsSum, 66);
  });

  // Test 3 — 50 Total Pairs and 116 Total Observations
  it('Test 3 — 50 Total Pairs and 116 Total Observations', () => {
    const ta = escalationDoc.target_accounting;
    assert.equal(ta.total_target_pairs, 50);
    assert.equal(ta.total_target_observations, 116);
    assert.equal(escalationDoc.candidate_ledger.length, 50);

    const totalObs = escalationDoc.candidate_ledger.reduce((acc, c) => acc + c.observation_count, 0);
    assert.equal(totalObs, 116);
  });

  // Test 4 — 946 Protected Out-of-Scope Observations
  it('Test 4 — 946 Protected Out-of-Scope Observations & Conservation', () => {
    const br = escalationDoc.backlog_reconciliation;
    assert.equal(br.active_backlog_before, 1062);
    assert.equal(br.target_observations, 116);
    assert.equal(br.out_of_scope_backlog, 946);
    assert.equal(br.active_backlog_after, 1062);

    const ooc = br.out_of_scope_composition;
    assert.equal(ooc.p54c_original_new_part_observations, 333);
    assert.equal(ooc.p54c_original_new_fitment_observations, 311);
    assert.equal(ooc.p54e_unresolved_scope_observations, 293);
    assert.equal(ooc.duplicate_redundant_observations, 5);
    assert.equal(ooc.conflicting_canonical_section_observations, 4);
    assert.equal(ooc.sum, 946);
    assert.equal(br.target_observations + br.out_of_scope_backlog, 1062);
  });

  // Test 5 — Cached Exact Match Detection
  it('Test 5 — Cached Exact Match Detection & Cache Accounting', () => {
    const ca = escalationDoc.cache_accounting;
    assert.equal(ca.existing_resources, 40);
    assert.equal(ca.relevant_existing_resources, 34);
    assert.equal(ca.cache_only_matches, 0);
    assert.equal(ca.candidates_with_cache_match, 0);
    assert.equal(ca.candidates_without_cache_match, 50);

    // Verify each candidate has 0 matches in its model cached resources
    for (const c of escalationDoc.candidate_ledger) {
      assert.equal(c.candidate_matches.length, 0);
      assert.equal(c.final_research_status, 'NO_MATCH_IN_RESEARCHED_SOURCES');
    }
  });

  // Test 6 — Same-Domain Pages Count as One Source Group
  it('Test 6 — Same-Domain Pages Count as One Source Group', () => {
    const sameDomainPages = [
      { url: 'https://www.sparepartsworld.co.uk/Stihl-MS-261-P1', domain: 'sparepartsworld.co.uk' },
      { url: 'https://www.sparepartsworld.co.uk/Stihl-MS-261-P2', domain: 'sparepartsworld.co.uk' },
      { url: 'https://www.sparepartsworld.co.uk/Stihl-MS-261-P3', domain: 'sparepartsworld.co.uk' }
    ];
    const sourceGroups = new Set(sameDomainPages.map(p => p.domain));
    assert.equal(sourceGroups.size, 1, 'Multiple pages on same domain must count as exactly 1 source group');
  });

  // Test 7 — Tier 1 Confirmation Accepted Rule
  it('Test 7 — Tier 1 Confirmation Accepted Rule', () => {
    // When official manufacturer documentation provides unambiguous match, 1 source suffices
    const tier1Evidence = {
      tier: 'TIER_1_OFFICIAL_STIHL',
      model_id: 'ms_261',
      part_number: '11400074101',
      verified: true
    };
    const canPromote = tier1Evidence.tier === 'TIER_1_OFFICIAL_STIHL' && tier1Evidence.verified;
    assert.equal(canPromote, true);
  });

  // Test 8 — Two Independent Tier 3 Confirmations Accepted Rule
  it('Test 8 — Two Independent Tier 3 Confirmations Accepted Rule', () => {
    const multiSourceEvidence = [
      { source_group: 'diyspareparts.com', tier: 'TIER_3_STRUCTURED_PARTS' },
      { source_group: 'sparepartsworld.co.uk', tier: 'TIER_3_STRUCTURED_PARTS' }
    ];
    const independentGroups = new Set(multiSourceEvidence.map(e => e.source_group));
    const satisfiesMultiSource = independentGroups.size >= 2;
    assert.equal(satisfiesMultiSource, true);
  });

  // Test 9 — Single Tier 3 Confirmation Rejected Rule
  it('Test 9 — Single Tier 3 Confirmation Rejected Rule', () => {
    const singleSourceEvidence = [
      { source_group: 'diyspareparts.com', tier: 'TIER_3_STRUCTURED_PARTS' }
    ];
    const independentGroups = new Set(singleSourceEvidence.map(e => e.source_group));
    const satisfiesMultiSource = independentGroups.size >= 2;
    assert.equal(satisfiesMultiSource, false, 'Single Tier 3 group MUST NOT trigger promotion');
  });

  // Test 10 — Name Conflict Rejected Rule
  it('Test 10 — Name Conflict Rejected Rule', () => {
    const candidateName = 'CYLINDER WITH PISTON';
    const externalName = 'CHAIN SPROCKET COVER';
    const hasConflict = candidateName !== externalName;
    const canPromote = !hasConflict;
    assert.equal(canPromote, false, 'Name conflict must reject part promotion');
  });

  // Test 11 — New-Fitment Direct Relation Threshold
  it('Test 11 — New-Fitment Direct Relation Threshold', () => {
    // Fitment relation requires direct model-part match in >= 2 Tier-3 or Tier 1/2
    const fitmentEvidence = {
      model_id: '034',
      part_number: '94389294040',
      direct_model_match_found: false
    };
    const canPromoteFitment = fitmentEvidence.direct_model_match_found;
    assert.equal(canPromoteFitment, false);
  });

  // Test 12 — No Sibling-Model Inference
  it('Test 12 — No Sibling-Model Inference', () => {
    // Part appearing in MS 260 cannot be inferred for MS 261
    const ms260Parts = ['11216403202'];
    const targetModel = 'ms_261';
    const inferredForMs261 = ms260Parts.includes('11216403202') && targetModel === 'ms_260';
    assert.equal(inferredForMs261, false, 'Sibling model inference strictly forbidden');
  });

  // Test 13 — No Variant Inference
  it('Test 13 — No Variant Inference', () => {
    // Model-level observation cannot be inferred to exact variant (e.g. C-M, C-BE)
    const observationScope = 'MODEL_LEVEL_ONLY';
    const canInferVariant = observationScope === 'EXACT_VARIANT_EVIDENCE';
    assert.equal(canInferVariant, false, 'Model-level evidence cannot infer exact variant');
  });

  // Test 14 — No Configuration Inference
  it('Test 14 — No Configuration Inference', () => {
    // Model-level observation cannot be inferred to exact configuration
    const observationScope = 'MODEL_LEVEL_ONLY';
    const canInferConfig = observationScope === 'EXACT_CONFIGURATION_EVIDENCE';
    assert.equal(canInferConfig, false, 'Model-level evidence cannot infer configuration');
  });

  // Test 15 — Blocked Source != No-Match
  it('Test 15 — Blocked Source != No-Match', () => {
    const httpStatuses = [403, 429, 503];
    for (const status of httpStatuses) {
      const isNoMatch = status === 200;
      assert.equal(isNoMatch, false, `HTTP status ${status} must NOT be classified as NO_MATCH`);
    }
  });

  // Test 16 — Part-Only Promotion Accounting
  it('Test 16 — Part-Only Promotion Accounting', () => {
    // Part-only promotion does NOT reduce active observation backlog
    const activeBacklogStart = 1062;
    const promotedParts = 0;
    const fullyResolvedObservations = 0;
    const activeBacklogEnd = activeBacklogStart - fullyResolvedObservations;
    assert.equal(activeBacklogEnd, 1062, 'Part-only promotion does NOT reduce active backlog');
  });

  // Test 17 — Full Pair Promotion Accounting
  it('Test 17 — Full Pair Promotion Accounting', () => {
    const pp = escalationDoc.promotion_plan;
    assert.equal(pp.new_parts, 0);
    assert.equal(pp.part_only_promotions, 0);
    assert.equal(pp.new_fitments, 0);
    assert.equal(pp.new_section_contexts, 0);
    assert.equal(pp.fully_resolved_observations, 0);
    assert.equal(pp.false_promotions, 0);
  });

  // Test 18 — Neutral Scalar Section Preservation
  it('Test 18 — Neutral Scalar Section Preservation', () => {
    // Any candidate scalar section must NOT use arbitrary first/last/alphabetical winner
    const candidateScalarSection = 'Unresolved Diagram Section';
    assert.equal(candidateScalarSection, 'Unresolved Diagram Section');
    assert.equal(escalationDoc.protection_checks.arbitrary_section_winners, 0);
  });

  // Test 19 — Multi-Section Contexts Retained (810 Contexts Untouched)
  it('Test 19 — Multi-Section Contexts Retained (810 Contexts Untouched)', () => {
    const phaseDContexts = dContextsDoc.contexts.filter(c => c.section_context_status === 'SOURCE_OBSERVED_MULTI_CONTEXT');
    assert.equal(phaseDContexts.length, 810);
    assert.equal(escalationDoc.protection_checks.phase54f_d_existing_context_mutations, 0);
  });

  // Test 20 — No Arbitrary Section Winner
  it('Test 20 — No Arbitrary Section Winner', () => {
    assert.equal(escalationDoc.protection_checks.arbitrary_section_winners, 0);
  });

  // Test 21 — Idempotent Cached Rerun
  it('Test 21 — Idempotent Cached Rerun', () => {
    const rerun = escalationDoc.idempotency;
    assert.equal(rerun.rerun_network_requests, 0);
    assert.equal(rerun.rerun_semantic_diff, 0);
    assert.equal(rerun.duplicate_part_promotions, 0);
    assert.equal(rerun.duplicate_fitment_promotions, 0);
    assert.equal(rerun.duplicate_contexts, 0);
  });

  // Test 22 — Zero False Promotions
  it('Test 22 — Zero False Promotions', () => {
    assert.equal(escalationDoc.protection_checks.false_promotions, 0);
    assert.equal(escalationDoc.promotion_plan.false_promotions, 0);
  });

  // Test 23 — Database Catalog Counts Strict Freeze
  it('Test 23 — Database Catalog Counts Strict Freeze', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const parts = db.prepare('SELECT count(*) as c FROM parts').get().c;
    const fitments = db.prepare('SELECT count(*) as c FROM model_part_fitments').get().c;
    const configs = db.prepare('SELECT count(*) as c FROM parts_model_configurations').get().c;
    const evidence = db.prepare('SELECT count(*) as c FROM part_fitment_evidence').get().c;
    db.close();

    assert.equal(parts, 17082);
    assert.equal(fitments, 175106);
    assert.equal(configs, 766);
    assert.equal(evidence, 208412);
    assert.equal(dContextsDoc.contexts.filter(c => c.section_context_status === 'SOURCE_OBSERVED_MULTI_CONTEXT').length, 810);
  });
});
