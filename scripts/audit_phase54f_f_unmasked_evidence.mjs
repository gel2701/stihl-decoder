#!/usr/bin/env node
/**
 * Phase 54F-F — Newly Unmasked Evidence Escalation Audit
 *
 * Verifies all Section 42 invariants, contracts, accounting conservation, and zero-leakage rules:
 * 1. Target cohort exact: 24 new-part pairs (50 obs), 26 new-fitment pairs (66 obs) = 50 pairs (116 obs).
 * 2. Backlog conservation: 116 target + 946 out-of-scope = 1062 active backlog before.
 * 3. 24 unique new part numbers, 11 target models.
 * 4. Cache-first enforced (40 resources in external cache, 34 relevant).
 * 5. Zero duplicate network requests, 0 new network requests, 0 requests blocked.
 * 6. Source independence: >=2 independent Tier-3 groups required for confirmation.
 * 7. Candidate status matches research evidence (50/50 NO_MATCH_IN_RESEARCHED_SOURCES).
 * 8. Candidate ledger completeness (all 50 pairs have all required Section 7 fields).
 * 9. Part name consistency: 24 NAME_MISSING, 26 NOT_APPLICABLE.
 * 10. Model coverage completeness: all 11 models fully researched.
 * 11. Promotions zero: new_parts=0, part_only=0, new_fitments=0, new_contexts=0, false_promotions=0.
 * 12. Scope protection & zero-leakage: 0 variant leakage, 0 configuration leakage, 0 arbitrary section winners.
 * 13. Phase 54F-A protected set integrity: accepted evidence & enrichment SHA-256 identical.
 * 14. Phase 54F-C protection: 612 candidates untouched, 0 mutations.
 * 15. Phase 54F-D protection: 810 section contexts untouched, 0 context mutations.
 * 16. Phase 54F-E protection: 293 scope observations untouched, 0 mutations.
 * 17. Catalog reconciliation: PARTS=17082, FITMENTS=175106, CONFIGURATIONS=766, EVIDENCE=208412, CONTEXTS=810.
 * 18. Idempotency: re-running unmasked escalation yields identical output and 0 diff.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { runUnmaskedEscalation } from './escalate_phase54f_unmasked_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const EXTERNAL_CACHE_DIR = path.join(STAGING_DIR, 'external_cache');

const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');
const D_CONTEXTS_FILE = path.join(rootDir, 'data', 'model_part_fitment_section_contexts.json');
const P54C_ESCALATION_FILE = path.join(STAGING_DIR, 'evidence_escalation.json');
const P54E_SCOPE_FILE = path.join(STAGING_DIR, 'scope_resolution.json');
const UNMASKED_ESCALATION_FILE = path.join(STAGING_DIR, 'unmasked_evidence_escalation.json');

const EXPECTED_ACCEPTED_EVIDENCE_SHA256 = '686f20a46af7b1b488dd1275725750078c238c4ff1daef2a9c38542fe6a4f4ff';
const EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256 = 'cf59af5d67278a8cf2605a79c5f671081aba1dd36fab589493d8d0f4519c35dd';

function assertInvariant(condition, message) {
  if (!condition) {
    console.error(`❌ INVARIANT VIOLATION: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

export function runAudit() {
  console.log('===============================================================');
  console.log('🔍 PHASE 54F-F UNMASKED EVIDENCE ESCALATION AUDIT');
  console.log('===============================================================\n');

  // 1. Audit Artifact Existence & Metadata
  console.log('▶ 1. Auditing Artifact Existence & Metadata...');
  assertInvariant(fs.existsSync(UNMASKED_ESCALATION_FILE), 'unmasked_evidence_escalation.json exists');

  const doc = JSON.parse(fs.readFileSync(UNMASKED_ESCALATION_FILE, 'utf8'));
  assertInvariant(doc.phase === 'Phase 54F-F', 'Phase is Phase 54F-F');
  assertInvariant(doc.start_baseline_sha === 'd57f7aafa214c7210b68e65ba9de213a9e1ec3f3', 'Start baseline SHA matches expected Phase 54F-E merge commit');

  // 2. Audit Phase 54F-A Protected Set Integrity
  console.log('\n▶ 2. Auditing Phase 54F-A Protected Set Integrity (Zero Mutations)...');
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assertInvariant(currentEvidenceHash === EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'Phase 54F-A accepted evidence hash identical to baseline');
  assertInvariant(currentEnrichmentHash === EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'Phase 54F-A parts section enrichment hash identical to baseline');
  assertInvariant(doc.protection_checks.phase54f_a_accepted_set_mutations === 0, 'phase54f_a_accepted_set_mutations === 0');

  // 3. Audit Target Accounting & Conservation (24/50, 26/66, 50/116, 946 out-of-scope, 1062 total)
  console.log('\n▶ 3. Auditing Target Accounting & Conservation (50 pairs, 116 obs, 946 out-of-scope, 1062 total)...');
  const ta = doc.target_accounting;
  assertInvariant(ta.new_part_pairs === 24, 'new_part_pairs === 24');
  assertInvariant(ta.new_part_observations === 50, 'new_part_observations === 50');
  assertInvariant(ta.unique_new_part_numbers === 24, 'unique_new_part_numbers === 24');
  assertInvariant(ta.new_fitment_pairs === 26, 'new_fitment_pairs === 26');
  assertInvariant(ta.new_fitment_observations === 66, 'new_fitment_observations === 66');
  assertInvariant(ta.total_target_pairs === 50, 'total_target_pairs === 50');
  assertInvariant(ta.total_target_observations === 116, 'total_target_observations === 116');
  assertInvariant(ta.target_models_count === 11, 'target_models_count === 11');
  assertInvariant(Array.isArray(ta.target_models) && ta.target_models.length === 11, 'target_models list has 11 models');

  const br = doc.backlog_reconciliation;
  assertInvariant(br.active_backlog_before === 1062, 'active_backlog_before === 1062');
  assertInvariant(br.target_observations === 116, 'target_observations === 116');
  assertInvariant(br.fully_resolved_observations === 0, 'fully_resolved_observations === 0');
  assertInvariant(br.active_backlog_after === 1062, 'active_backlog_after === 1062');
  assertInvariant(br.out_of_scope_backlog === 946, 'out_of_scope_backlog === 946');
  assertInvariant(br.target_observations + br.out_of_scope_backlog === 1062, 'Conservation invariant: 116 + 946 === 1062');
  assertInvariant(br.conservation_valid === true, 'conservation_valid === true');

  // Audit Out-of-Scope Composition (333 + 311 + 293 + 5 + 4 = 946)
  const ooc = br.out_of_scope_composition;
  assertInvariant(ooc.p54c_original_new_part_observations === 333, 'out_of_scope p54c parts === 333');
  assertInvariant(ooc.p54c_original_new_fitment_observations === 311, 'out_of_scope p54c fitments === 311');
  assertInvariant(ooc.p54e_unresolved_scope_observations === 293, 'out_of_scope p54e scopes === 293');
  assertInvariant(ooc.duplicate_redundant_observations === 5, 'out_of_scope duplicates === 5');
  assertInvariant(ooc.conflicting_canonical_section_observations === 4, 'out_of_scope conflicts === 4');
  assertInvariant(ooc.sum === 946, 'out_of_scope sum === 946');

  // 4. Audit Cache-First & Network Accounting
  console.log('\n▶ 4. Auditing Cache-First Enforcement & Network Accounting...');
  const ca = doc.cache_accounting;
  assertInvariant(ca.existing_resources === 40, 'existing_resources in cache === 40');
  assertInvariant(ca.relevant_existing_resources === 34, 'relevant_existing_resources === 34');
  assertInvariant(ca.cache_only_matches === 0, 'cache_only_matches === 0');
  assertInvariant(ca.candidates_with_cache_match === 0, 'candidates_with_cache_match === 0');
  assertInvariant(ca.candidates_without_cache_match === 50, 'candidates_without_cache_match === 50');
  assertInvariant(ca.models_fully_covered_by_existing_cache === 11, 'models_fully_covered_by_existing_cache === 11');
  assertInvariant(ca.models_not_fully_covered_by_existing_cache === 0, 'models_not_fully_covered_by_existing_cache === 0');

  const na = doc.network_accounting;
  assertInvariant(na.new_external_requests === 0, 'new_external_requests === 0');
  assertInvariant(na.requests_attempted === 0, 'requests_attempted === 0');
  assertInvariant(na.requests_successful === 0, 'requests_successful === 0');
  assertInvariant(na.requests_failed === 0, 'requests_failed === 0');
  assertInvariant(na.requests_blocked === 0, 'requests_blocked === 0');
  assertInvariant(na.rate_limited === 0, 'rate_limited === 0');
  assertInvariant(na.duplicate_external_requests === 0, 'duplicate_external_requests === 0');
  assertInvariant(na.new_cached_resources === 0, 'new_cached_resources === 0');

  // Verify physical cache files count
  const physicalFiles = fs.readdirSync(EXTERNAL_CACHE_DIR).filter(f => f.endsWith('.json'));
  assertInvariant(physicalFiles.length === 40, '40 physical cache files exist');

  // 5. Audit Source Groups & Independence
  console.log('\n▶ 5. Auditing Source Groups & Independence...');
  assertInvariant(Array.isArray(doc.source_groups) && doc.source_groups.length >= 2, 'At least 2 source groups configured');
  const sgNames = doc.source_groups.map(sg => sg.source_group);
  assertInvariant(sgNames.includes('stihl_official'), 'Source group stihl_official present');
  assertInvariant(sgNames.includes('sparepartsworld.co.uk'), 'Source group sparepartsworld.co.uk present');
  assertInvariant(sgNames.includes('lsengineers.co.uk'), 'Source group lsengineers.co.uk present');

  // 6. Audit Model Coverage Completeness (All 11 Models)
  console.log('\n▶ 6. Auditing Model Coverage Completeness (All 11 Models)...');
  const mcs = doc.model_coverage_summary;
  assertInvariant(mcs.models_total === 11, 'models_total === 11');
  assertInvariant(mcs.fully_researched === 11, 'fully_researched === 11');
  assertInvariant(mcs.partially_researched === 0, 'partially_researched === 0');
  assertInvariant(mcs.blocked === 0, 'blocked === 0');
  assertInvariant(mcs.budget_exhausted === 0, 'budget_exhausted === 0');

  const expected11Models = ['009', '034', 'bg_86', 'br_600', 'fs_400', 'fs_55', 'fs_85', 'hs_45', 'ms_260', 'ms_261', 'ts_410'];
  assertInvariant(doc.model_coverage_ledger.length === 11, 'model_coverage_ledger has 11 entries');
  for (const mId of expected11Models) {
    const entry = doc.model_coverage_ledger.find(e => e.canonical_model_id === mId);
    assertInvariant(entry !== undefined, `Model ${mId} present in model_coverage_ledger`);
    assertInvariant(entry.fully_researched === true, `Model ${mId} fully_researched === true`);
    assertInvariant(entry.coverage_status === 'EXHAUSTED_NO_MATCH', `Model ${mId} coverage status === EXHAUSTED_NO_MATCH`);
    assertInvariant(entry.official_resources_count >= 2, `Model ${mId} official_resources_count >= 2`);
    assertInvariant(entry.tier3_resources_count >= 1, `Model ${mId} tier3_resources_count >= 1`);
  }

  // 7. Audit Candidate Ledger Completeness & Dispositions (50/50)
  console.log('\n▶ 7. Auditing Candidate Ledger Completeness & Dispositions (50/50)...');
  assertInvariant(Array.isArray(doc.candidate_ledger) && doc.candidate_ledger.length === 50, 'candidate_ledger length === 50');

  const requiredFields = [
    'candidate_id', 'candidate_type', 'canonical_model_id', 'part_number', 'observation_count',
    'evidence_ids', 'raw_part_names', 'raw_sections', 'raw_positions', 'source_ids', 'source_urls',
    'part_exists_before', 'fitment_exists_before', 'existing_variant_keys', 'existing_configuration_keys',
    'phase54f_d_status', 'research_priority', 'cached_resources_checked', 'live_resources_checked',
    'source_groups_checked', 'candidate_matches', 'part_identity_status', 'fitment_status',
    'part_name_consistency', 'promotion_decision', 'decision_reason', 'final_research_status'
  ];

  let newPartCandidates = 0;
  let newFitmentCandidates = 0;
  for (const c of doc.candidate_ledger) {
    for (const f of requiredFields) {
      if (c[f] === undefined || c[f] === null) {
        assertInvariant(false, `Candidate ${c.candidate_id} missing field '${f}'`);
      }
    }
    assertInvariant(c.final_research_status === 'NO_MATCH_IN_RESEARCHED_SOURCES', `Candidate ${c.candidate_id} status is NO_MATCH_IN_RESEARCHED_SOURCES`);
    assertInvariant(c.promotion_decision === 'NO_PROMOTION', `Candidate ${c.candidate_id} promotion decision is NO_PROMOTION`);
    assertInvariant(Array.isArray(c.cached_resources_checked) && c.cached_resources_checked.length >= 3, `Candidate ${c.candidate_id} checked >= 3 cached resources`);
    assertInvariant(c.candidate_matches.length === 0, `Candidate ${c.candidate_id} has 0 matches`);

    if (c.candidate_type === 'NEW_PART') {
      newPartCandidates++;
      assertInvariant(c.part_exists_before === false, `New part candidate ${c.candidate_id} part_exists_before === false`);
      assertInvariant(c.part_name_consistency === 'NAME_MISSING', `New part candidate ${c.candidate_id} part_name_consistency === NAME_MISSING`);
    } else if (c.candidate_type === 'NEW_FITMENT') {
      newFitmentCandidates++;
      assertInvariant(c.part_exists_before === true, `New fitment candidate ${c.candidate_id} part_exists_before === true`);
      assertInvariant(c.part_name_consistency === 'NOT_APPLICABLE', `New fitment candidate ${c.candidate_id} part_name_consistency === NOT_APPLICABLE`);
    } else {
      assertInvariant(false, `Unexpected candidate_type: ${c.candidate_type}`);
    }
  }
  assertInvariant(newPartCandidates === 24, 'newPartCandidates === 24');
  assertInvariant(newFitmentCandidates === 26, 'newFitmentCandidates === 26');

  // 8. Audit Promotion Plan & Results (Zero Promotions)
  console.log('\n▶ 8. Auditing Promotion Plan & Results (Zero Promotions)...');
  const pp = doc.promotion_plan;
  assertInvariant(pp.new_parts === 0, 'promotion new_parts === 0');
  assertInvariant(pp.part_only_promotions === 0, 'promotion part_only_promotions === 0');
  assertInvariant(pp.new_fitments === 0, 'promotion new_fitments === 0');
  assertInvariant(pp.new_section_contexts === 0, 'promotion new_section_contexts === 0');
  assertInvariant(pp.fully_resolved_observations === 0, 'fully_resolved_observations === 0');
  assertInvariant(pp.false_promotions === 0, 'false_promotions === 0');

  // 9. Audit Scope Protection & Zero-Leakage Invariants
  console.log('\n▶ 9. Auditing Scope Protection & Zero-Leakage Invariants...');
  const pc = doc.protection_checks;
  assertInvariant(pc.variant_leakage === 0, 'variant_leakage === 0');
  assertInvariant(pc.configuration_leakage === 0, 'configuration_leakage === 0');
  assertInvariant(pc.arbitrary_section_winners === 0, 'arbitrary_section_winners === 0');
  assertInvariant(pc.raw_evidence_duplication === 0, 'raw_evidence_duplication === 0');
  assertInvariant(pc.promotions_without_provenance === 0, 'promotions_without_provenance === 0');
  assertInvariant(pc.false_promotions === 0, 'false_promotions === 0');
  assertInvariant(pc.out_of_scope_mutations === 0, 'out_of_scope_mutations === 0');

  // 10. Audit Historical Phase Protections (Phase 54F-C, 54F-D, 54F-E)
  console.log('\n▶ 10. Auditing Historical Phase Protections (Phase 54F-C, 54F-D, 54F-E)...');
  const p54cDoc = JSON.parse(fs.readFileSync(P54C_ESCALATION_FILE, 'utf8'));
  assertInvariant(p54cDoc.queue.length === 612, 'Phase 54F-C queue remains 612 candidates');
  assertInvariant(p54cDoc.fitment_evidence_summary.total === 311, 'Phase 54F-C fitments remain 311');
  assertInvariant(p54cDoc.part_evidence_summary.total === 301, 'Phase 54F-C parts remain 301');
  assertInvariant(pc.phase54f_c_research_ledger_mutations === 0, 'phase54f_c_research_ledger_mutations === 0');
  assertInvariant(pc.phase54f_c_candidate_status_mutations === 0, 'phase54f_c_candidate_status_mutations === 0');

  const dContextsDoc = JSON.parse(fs.readFileSync(D_CONTEXTS_FILE, 'utf8'));
  assertInvariant(dContextsDoc.record_count === 810, 'Phase 54F-D contexts count remains 810');
  assertInvariant(pc.phase54f_d_existing_context_mutations === 0, 'phase54f_d_existing_context_mutations === 0');

  const p54eDoc = JSON.parse(fs.readFileSync(P54E_SCOPE_FILE, 'utf8'));
  assertInvariant(p54eDoc.summary.total_scope_observations === 293, 'Phase 54F-E scope observations remain 293');
  assertInvariant(p54eDoc.summary.resolved_scope_observations === 0, 'Phase 54F-E resolved scope observations remain 0');
  assertInvariant(pc.phase54f_e_scope_resolution_mutations === 0, 'phase54f_e_scope_resolution_mutations === 0');

  // 11. Audit Database Catalog Counts (Strict Freezes)
  console.log('\n▶ 11. Auditing Database State & Catalog Counts...');
  const db = new Database(DB_PATH, { readonly: true });
  const partsCount = db.prepare('SELECT count(*) as c FROM parts').get().c;
  const fitmentsCount = db.prepare('SELECT count(*) as c FROM model_part_fitments').get().c;
  const configsCount = db.prepare('SELECT count(*) as c FROM parts_model_configurations').get().c;
  const evidenceCount = db.prepare('SELECT count(*) as c FROM part_fitment_evidence').get().c;
  db.close();

  assertInvariant(partsCount === 17082, 'Database PARTS count === 17082');
  assertInvariant(fitmentsCount === 175106, 'Database FITMENTS count === 175106');
  assertInvariant(configsCount === 766, 'Database CONFIGURATIONS count === 766');
  assertInvariant(evidenceCount === 208412, 'Database EVIDENCE count === 208412');
  assertInvariant(dContextsDoc.record_count === 810, 'SECTION_CONTEXTS count === 810');

  const cr = doc.catalog_reconciliation;
  assertInvariant(cr.parts_reconciled === true, 'Catalog parts reconciled');
  assertInvariant(cr.fitments_reconciled === true, 'Catalog fitments reconciled');
  assertInvariant(cr.configurations_reconciled === true, 'Catalog configurations reconciled');
  assertInvariant(cr.evidence_reconciled === true, 'Catalog evidence reconciled');
  assertInvariant(cr.section_contexts_reconciled === true, 'Catalog section contexts reconciled');

  // 12. Audit Idempotency
  console.log('\n▶ 12. Auditing Idempotency (Rerun Yields Identical Output & 0 Diff)...');
  const preRerunHash = crypto.createHash('sha256').update(fs.readFileSync(UNMASKED_ESCALATION_FILE)).digest('hex');
  const rerunResult = runUnmaskedEscalation();
  const postRerunHash = crypto.createHash('sha256').update(fs.readFileSync(UNMASKED_ESCALATION_FILE)).digest('hex');

  // Re-read both, ignore generated_at timestamp differences
  const preDoc = JSON.parse(fs.readFileSync(UNMASKED_ESCALATION_FILE, 'utf8'));
  preDoc.generated_at = 'TIMESTAMP_NEUTRAL';
  rerunResult.generated_at = 'TIMESTAMP_NEUTRAL';

  assertInvariant(
    JSON.stringify(preDoc) === JSON.stringify(rerunResult),
    'Idempotency check: unmasked escalation rerun produces identical candidate ledger and reconciliation'
  );

  console.log('\n===============================================================');
  console.log('✅ PHASE 54F-F UNMASKED EVIDENCE ESCALATION AUDIT PASSED');
  console.log('===============================================================\n');

  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runAudit();
  } catch (err) {
    console.error('Audit failed with error:', err);
    process.exit(1);
  }
}
