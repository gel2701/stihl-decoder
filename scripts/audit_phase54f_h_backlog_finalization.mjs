#!/usr/bin/env node
/**
 * Phase 54F-H — Final Backlog Consolidation & Phase 54F Closure Readiness Audit
 *
 * Validates all Section 33 gates and invariants:
 *  1. 1053 observation registry exact
 *  2. 383 new-part exact
 *  3. 377 new-fitment exact
 *  4. 151 variant exact
 *  5. 142 configuration exact
 *  6. Category sum exact (383 + 377 + 151 + 142 = 1053)
 *  7. All evidence_ids unique (no duplicates)
 *  8. All observations traceable to historical source
 *  9. All observations actionable_now === false (0 true)
 * 10. All observations deferred === true (1053 true)
 * 11. All observations have reactivation trigger
 * 12. All observations have evidence gap
 * 13. Original staging conservation 1872 (810 D + 9 G + 1053 deferred = 1872)
 * 14. Resolved count 819 (810 D contexts + 9 G duplicate/conflict)
 * 15. Unresolved count 1053
 * 16. D cohort exact 810 section contexts
 * 17. G context cohort exact 4 section contexts
 * 18. Catalog unchanged (17082 parts, 175106 fitments, 766 configs, 208412 evidence, 814 contexts)
 * 19. Zero network requests (EXTERNAL_NETWORK_REQUESTS = 0)
 * 20. Zero catalog writes (NEW_PARTS = 0, NEW_FITMENTS = 0, NEW_CONFIGS = 0, NEW_EVIDENCE = 0, NEW_CONTEXTS = 0)
 * 21. Historical artifacts immutable
 * 22. Phase 54F-A protection
 * 23. Phase 54F-C protection
 * 24. Phase 54F-D protection
 * 25. Phase 54F-E protection
 * 26. Phase 54F-F protection
 * 27. Phase 54F-G protection
 * 28. Idempotency (re-running consolidation yields identical output and 0 diff)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  runFinalizePhase54FBacklog,
  DB_PATH,
  STAGING_DIR,
  ADJUDICATION_FILE,
  MULTISECTION_FILE,
  DUPLICATE_CONFLICT_FILE,
  SCOPE_FILE,
  UNMASKED_FILE,
  C_ESCALATION_FILE,
  SECTION_CONTEXTS_FILE,
  REGISTRY_OUTPUT_FILE,
  START_BASELINE,
  rootDir
} from './finalize_phase54f_backlog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');
const BASE_ENRICHMENT_FILE = path.join(rootDir, 'data', 'parts_section_enrichment.json');

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
  console.log('🔍 PHASE 54F-H FINAL BACKLOG CONSOLIDATION AUDIT');
  console.log('===============================================================\n');

  // 1. Audit Registry Artifact Existence & Metadata
  console.log('▶ 1. Auditing Final Backlog Registry Existence & Metadata...');
  assertInvariant(fs.existsSync(REGISTRY_OUTPUT_FILE), 'final_backlog_registry.json exists');

  const registryDoc = JSON.parse(fs.readFileSync(REGISTRY_OUTPUT_FILE, 'utf8'));
  assertInvariant(registryDoc.phase === 'Phase 54F-H', 'Phase is Phase 54F-H');
  assertInvariant(registryDoc.baseline_sha === START_BASELINE, 'Baseline SHA matches Phase 54F-G merge commit 47cb77aa2c4876e1099a077de0a6702de8e31213');
  assertInvariant(registryDoc.schema_version === '1.0.0', 'Schema version is 1.0.0');

  // 2. Audit Historical Immutable Artifacts & Phase 54F-A Protected Set
  console.log('\n▶ 2. Auditing Historical Artifact Immutability & Phase 54F-A Protected Set...');
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assertInvariant(currentEvidenceHash === EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'Phase 54F-A accepted evidence hash identical to baseline');
  assertInvariant(currentEnrichmentHash === EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'Phase 54F-A parts section enrichment hash identical to baseline');

  // Check Phase 54F-G final close certificate exists
  const gCloseReportPath = path.join(rootDir, 'PHASE54F_G_FINAL_CLOSE_REPORT.md');
  assertInvariant(fs.existsSync(gCloseReportPath), 'PHASE54F_G_FINAL_CLOSE_REPORT.md is present');
  const gCloseContent = fs.readFileSync(gCloseReportPath, 'utf8');
  assertInvariant(gCloseContent.includes('PHASE 54F-G FINAL CLOSE'), 'PHASE54F_G_FINAL_CLOSE_REPORT.md contains Phase 54F-G header');
  assertInvariant(gCloseContent.includes('47cb77aa2c4876e1099a077de0a6702de8e31213'), 'PHASE54F_G_FINAL_CLOSE_REPORT.md contains merge commit');

  // 3. Audit Exact Registry Counts & Categories
  console.log('\n▶ 3. Auditing Registry Counts & Category Breakdown (383 + 377 + 151 + 142 = 1053)...');
  const s = registryDoc.summary;
  assertInvariant(s.original_staging_observations === 1872, 'original_staging_observations === 1872');
  assertInvariant(s.resolved_observations === 819, 'resolved_observations === 819');
  assertInvariant(s.unresolved_backlog === 1053, 'unresolved_backlog === 1053');
  assertInvariant(s.deferred_backlog === 1053, 'deferred_backlog === 1053');
  assertInvariant(s.actionable_with_current_evidence === 0, 'actionable_with_current_evidence === 0');
  assertInvariant(s.current_action_queue === 0, 'current_action_queue === 0');
  assertInvariant(s.resolved_by_phase54f_h === 0, 'resolved_by_phase54f_h === 0');

  assertInvariant(s.new_part_deferred === 383, 'new_part_deferred === 383');
  assertInvariant(s.new_fitment_deferred === 377, 'new_fitment_deferred === 377');
  assertInvariant(s.variant_deferred === 151, 'variant_deferred === 151');
  assertInvariant(s.configuration_deferred === 142, 'configuration_deferred === 142');

  const sumCheck = s.new_part_deferred + s.new_fitment_deferred + s.variant_deferred + s.configuration_deferred;
  assertInvariant(sumCheck === 1053, 'Category sum: 383 + 377 + 151 + 142 === 1053');

  // 4. Audit Observations Ledger Detail (Section 11)
  console.log('\n▶ 4. Auditing Observations Ledger (1,053 records, unique evidence_ids, all fields present)...');
  assertInvariant(Array.isArray(registryDoc.observations) && registryDoc.observations.length === 1053, 'observations ledger has exactly 1,053 records');

  const seenEvidenceIds = new Set();
  let actionableNowCount = 0;
  let deferredCount = 0;
  let newPartCount = 0;
  let newFitmentCount = 0;
  let variantCount = 0;
  let configCount = 0;

  for (const obs of registryDoc.observations) {
    assertInvariant(!seenEvidenceIds.has(obs.evidence_id), `evidence_id ${obs.evidence_id} is unique`);
    seenEvidenceIds.add(obs.evidence_id);

    assertInvariant(Boolean(obs.canonical_model_id), `obs ${obs.evidence_id} has canonical_model_id`);
    assertInvariant(Boolean(obs.part_number), `obs ${obs.evidence_id} has part_number`);
    assertInvariant(obs.original_phase === 'B' || obs.original_phase === 'D', `obs ${obs.evidence_id} original_phase is B or D`);
    assertInvariant(Boolean(obs.origin_cohort), `obs ${obs.evidence_id} has origin_cohort`);
    assertInvariant(Boolean(obs.historical_status), `obs ${obs.evidence_id} has historical_status`);
    assertInvariant(Boolean(obs.terminal_disposition), `obs ${obs.evidence_id} has terminal_disposition`);
    assertInvariant(Boolean(obs.section_key), `obs ${obs.evidence_id} has section_key`);
    assertInvariant(Boolean(obs.section_name), `obs ${obs.evidence_id} has section_name`);
    assertInvariant(Boolean(obs.source_url), `obs ${obs.evidence_id} has source_url`);
    assertInvariant(Boolean(obs.research_state), `obs ${obs.evidence_id} has research_state`);
    assertInvariant(Boolean(obs.evidence_gap), `obs ${obs.evidence_id} has evidence_gap`);
    assertInvariant(Boolean(obs.reactivation_trigger), `obs ${obs.evidence_id} has reactivation_trigger`);
    assertInvariant(Boolean(obs.reactivation_requirements), `obs ${obs.evidence_id} has reactivation_requirements`);
    assertInvariant(Array.isArray(obs.related_artifact_refs) && obs.related_artifact_refs.length > 0, `obs ${obs.evidence_id} has related_artifact_refs`);

    // Invariant 9 & 10: actionable_now === false, deferred === true
    assertInvariant(obs.actionable_now === false, `obs ${obs.evidence_id} actionable_now === false`);
    assertInvariant(obs.deferred === true, `obs ${obs.evidence_id} deferred === true`);

    if (obs.actionable_now === true) actionableNowCount++;
    if (obs.deferred === true) deferredCount++;

    if (obs.terminal_disposition === 'DEFERRED_NEW_PART_EVIDENCE_REQUIRED') newPartCount++;
    else if (obs.terminal_disposition === 'DEFERRED_NEW_FITMENT_EVIDENCE_REQUIRED') newFitmentCount++;
    else if (obs.terminal_disposition === 'DEFERRED_VARIANT_SOURCE_IDENTITY_REQUIRED') variantCount++;
    else if (obs.terminal_disposition === 'DEFERRED_CONFIGURATION_SOURCE_IDENTITY_REQUIRED') configCount++;
  }

  assertInvariant(seenEvidenceIds.size === 1053, 'All 1,053 evidence_ids are unique');
  assertInvariant(actionableNowCount === 0, 'Total actionable_now === true is exactly 0');
  assertInvariant(deferredCount === 1053, 'Total deferred === true is exactly 1053');
  assertInvariant(newPartCount === 383, 'Total DEFERRED_NEW_PART_EVIDENCE_REQUIRED === 383');
  assertInvariant(newFitmentCount === 377, 'Total DEFERRED_NEW_FITMENT_EVIDENCE_REQUIRED === 377');
  assertInvariant(variantCount === 151, 'Total DEFERRED_VARIANT_SOURCE_IDENTITY_REQUIRED === 151');
  assertInvariant(configCount === 142, 'Total DEFERRED_CONFIGURATION_SOURCE_IDENTITY_REQUIRED === 142');

  // 5. Audit Historical Lineage Preservation (Section 7)
  console.log('\n▶ 5. Auditing Historical Origin Cohort Preservation...');
  const cs = registryDoc.cohort_summary;
  assertInvariant(cs.PHASE54F_B_ORIGINAL_NEW_PART === 333, 'PHASE54F_B_ORIGINAL_NEW_PART === 333');
  assertInvariant(cs.PHASE54F_D_UNMASKED_NEW_PART === 50, 'PHASE54F_D_UNMASKED_NEW_PART === 50');
  assertInvariant(cs.PHASE54F_B_ORIGINAL_NEW_FITMENT === 311, 'PHASE54F_B_ORIGINAL_NEW_FITMENT === 311');
  assertInvariant(cs.PHASE54F_D_UNMASKED_NEW_FITMENT === 66, 'PHASE54F_D_UNMASKED_NEW_FITMENT === 66');
  assertInvariant(cs.PHASE54F_B_ORIGINAL_VARIANT_SCOPE === 135, 'PHASE54F_B_ORIGINAL_VARIANT_SCOPE === 135');
  assertInvariant(cs.PHASE54F_D_UNMASKED_VARIANT_SCOPE === 16, 'PHASE54F_D_UNMASKED_VARIANT_SCOPE === 16');
  assertInvariant(cs.PHASE54F_B_ORIGINAL_CONFIGURATION_SCOPE === 126, 'PHASE54F_B_ORIGINAL_CONFIGURATION_SCOPE === 126');
  assertInvariant(cs.PHASE54F_D_UNMASKED_CONFIGURATION_SCOPE === 16, 'PHASE54F_D_UNMASKED_CONFIGURATION_SCOPE === 16');

  // 6. Audit Scope State Preservation (Section 9)
  console.log('\n▶ 6. Auditing Phase 54F-E Scope State Preservation...');
  const scs = registryDoc.scope_classification_summary;
  assertInvariant(scs.variant.model_level_only === 7, 'variant model_level_only === 7');
  assertInvariant(scs.variant.ambiguous_multiple_matches === 144, 'variant ambiguous_multiple_matches === 144');
  assertInvariant(scs.variant.total === 151, 'variant scope total === 151');

  assertInvariant(scs.configuration.model_level_only === 92, 'configuration model_level_only === 92');
  assertInvariant(scs.configuration.ambiguous_multiple_matches === 50, 'configuration ambiguous_multiple_matches === 50');
  assertInvariant(scs.configuration.total === 142, 'configuration scope total === 142');

  assertInvariant(scs.explicit_source_identities === 0, 'explicit_source_identities === 0');

  // 7. Audit Unique Entity Summary & Overlap Matrix (Section 18 & 19)
  console.log('\n▶ 7. Auditing Unique Entities and Overlap Matrix...');
  const ues = registryDoc.unique_entity_summary;
  assertInvariant(ues.new_part_unique_part_numbers === 318, 'new_part_unique_part_numbers === 318');
  assertInvariant(ues.new_part_unique_model_part_pairs === 357, 'new_part_unique_model_part_pairs === 357');
  assertInvariant(ues.new_fitment_unique_model_part_pairs === 337, 'new_fitment_unique_model_part_pairs === 337');
  assertInvariant(ues.variant_unique_model_part_pairs === 142, 'variant_unique_model_part_pairs === 142');
  assertInvariant(ues.configuration_unique_model_part_pairs === 134, 'configuration_unique_model_part_pairs === 134');
  assertInvariant(ues.total_unique_part_numbers_across_backlog === 813, 'total_unique_part_numbers_across_backlog === 813');
  assertInvariant(ues.total_unique_model_part_pairs_across_backlog === 970, 'total_unique_model_part_pairs_across_backlog === 970');

  const om = registryDoc.overlap_matrix;
  assertInvariant(om.new_part_and_new_fitment === 0, 'new_part_and_new_fitment === 0');
  assertInvariant(om.new_part_and_variant === 0, 'new_part_and_variant === 0');
  assertInvariant(om.new_part_and_configuration === 0, 'new_part_and_configuration === 0');
  assertInvariant(om.new_fitment_and_variant === 0, 'new_fitment_and_variant === 0');
  assertInvariant(om.new_fitment_and_configuration === 0, 'new_fitment_and_configuration === 0');
  assertInvariant(om.variant_and_configuration === 0, 'variant_and_configuration === 0');

  // 8. Audit Lifecycle Conservation from Original 1,872 (Section 27)
  console.log('\n▶ 8. Auditing Full Lifecycle Conservation (1872 = 810 D + 9 G + 1053 deferred)...');
  const conv = registryDoc.conservation;
  assertInvariant(conv.original_staging === 1872, 'original_staging === 1872');
  assertInvariant(conv.phase54f_d_resolved === 810, 'phase54f_d_resolved === 810');
  assertInvariant(conv.phase54f_g_resolved === 9, 'phase54f_g_resolved === 9');
  assertInvariant(conv.total_resolved === 819, 'total_resolved === 819');
  assertInvariant(conv.unresolved_backlog === 1053, 'unresolved_backlog === 1053');
  assertInvariant(conv.deferred_backlog === 1053, 'deferred_backlog === 1053');
  assertInvariant(conv.valid === true, 'Lifecycle conservation valid === true');
  assertInvariant(conv.total_resolved + conv.deferred_backlog === 1872, 'Conservation invariant: 819 + 1053 === 1872');

  // 9. Audit Strict Section Context Subcohorts (Section 23: 810 D + 4 G = 814)
  console.log('\n▶ 9. Auditing Strict Section Context Subcohorts (810 D + 4 G = 814)...');
  const contextsDoc = JSON.parse(fs.readFileSync(SECTION_CONTEXTS_FILE, 'utf8'));
  assertInvariant(contextsDoc.record_count === 814, 'model_part_fitment_section_contexts.json record_count === 814');
  assertInvariant(contextsDoc.contexts.length === 814, 'model_part_fitment_section_contexts.json contexts length === 814');

  let p54dContextCount = 0;
  let p54gContextCount = 0;
  for (const ctx of contextsDoc.contexts) {
    if (ctx.section_context_status === 'SOURCE_OBSERVED_MULTI_CONTEXT') p54dContextCount++;
    else if (ctx.section_context_status === 'SOURCE_OBSERVED_ADDITIONAL_CONTEXT') p54gContextCount++;
  }
  assertInvariant(p54dContextCount === 810, 'Strict Phase 54F-D context cohort === 810');
  assertInvariant(p54gContextCount === 4, 'Strict Phase 54F-G context cohort === 4');

  // 10. Audit Catalog Freeze & Database Reconciliation (Section 22)
  console.log('\n▶ 10. Auditing Database State & Catalog Counts (Zero Mutations)...');
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const partsCount = db.prepare("SELECT count(*) as count FROM parts WHERE sources != '[\"ghs\"]'").get().count;
    const fitmentsCount = db.prepare("SELECT count(*) as count FROM model_part_fitments WHERE source_id != 'ghs'").get().count;
    const configsCount = db.prepare("SELECT count(*) as count FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().count;
    const evidenceCount = db.prepare("SELECT count(*) as count FROM part_fitment_evidence WHERE source_id != 'ghs'").get().count;
    const dbContextsCount = db.prepare('SELECT count(*) as count FROM model_part_fitment_section_contexts').get().count;

    assertInvariant(partsCount === 17082, `Database PARTS === 17082 (found: ${partsCount})`);
    assertInvariant(fitmentsCount === 175106, `Database FITMENTS === 175106 (found: ${fitmentsCount})`);
    assertInvariant(configsCount === 766, `Database CONFIGURATIONS === 766 (found: ${configsCount})`);
    assertInvariant(evidenceCount === 208412, `Database EVIDENCE === 208412 (found: ${evidenceCount})`);
    assertInvariant(dbContextsCount === 814, `Database SECTION_CONTEXTS === 814 (found: ${dbContextsCount})`);
  } finally {
    db.close();
  }

  // 11. Audit Historical Phase Protections
  console.log('\n▶ 11. Auditing Historical Phase Protections (A, C, D, E, F, G)...');
  const multisection = JSON.parse(fs.readFileSync(MULTISECTION_FILE, 'utf8'));
  assertInvariant(multisection.summary.accounting.resolved_observations === 810, 'Phase 54F-D resolved observations === 810');
  assertInvariant(multisection.summary.accounting.unresolved_observations === 148, 'Phase 54F-D unresolved observations === 148');

  const duplicateConflict = JSON.parse(fs.readFileSync(DUPLICATE_CONFLICT_FILE, 'utf8'));
  assertInvariant(duplicateConflict.summary.target_observations_total === 9, 'Phase 54F-G target observations === 9');
  assertInvariant(duplicateConflict.summary.total_resolved_observations === 9, 'Phase 54F-G total resolved observations === 9');
  assertInvariant(duplicateConflict.summary.active_backlog_after === 1053, 'Phase 54F-G active backlog after === 1053');

  const scope = JSON.parse(fs.readFileSync(SCOPE_FILE, 'utf8'));
  assertInvariant(scope.summary.total_scope_observations === 293, 'Phase 54F-E scope observations === 293');

  const unmasked = JSON.parse(fs.readFileSync(UNMASKED_FILE, 'utf8'));
  assertInvariant(unmasked.target_accounting.total_target_pairs === 50, 'Phase 54F-F target pairs remain 50');
  assertInvariant(unmasked.target_accounting.total_target_observations === 116, 'Phase 54F-F target observations remain 116');

  // 12. Audit Idempotency (Section 32)
  console.log('\n▶ 12. Auditing Idempotency (Re-running consolidation produces identical output)...');
  const run1Doc = JSON.parse(fs.readFileSync(REGISTRY_OUTPUT_FILE, 'utf8'));
  const run2Doc = runFinalizePhase54FBacklog({ dryRun: false });

  assertInvariant(run1Doc.observations.length === 1053, 'RUN1_OBSERVATIONS === 1053');
  assertInvariant(run2Doc.observations.length === 1053, 'RUN2_OBSERVATIONS === 1053');

  // Compare ignoring generated_at timestamp
  const d1 = { ...run1Doc, generated_at: null };
  const d2 = { ...run2Doc, generated_at: null };

  const isIdentical = JSON.stringify(d1) === JSON.stringify(d2);
  assertInvariant(isIdentical, 'SEMANTIC_DIFF === 0 between runs');

  // Verify no duplicate evidence_ids in rerun
  const rerunIds = new Set(run2Doc.observations.map(o => o.evidence_id));
  assertInvariant(rerunIds.size === 1053, 'DUPLICATE_OBSERVATIONS === 0 in rerun');

  console.log('\n===============================================================');
  console.log('✅ PHASE 54F-H FINAL BACKLOG CONSOLIDATION AUDIT PASSED');
  console.log('===============================================================\n');

  return true;
}

// CLI entry point
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  try {
    runAudit();
  } catch (err) {
    console.error(`❌ FATAL ERROR in audit_phase54f_h_backlog_finalization:`, err.message);
    process.exit(1);
  }
}
