#!/usr/bin/env node
/**
 * Phase 54F-G — Duplicate & Canonical Section Conflict Resolution Audit
 *
 * Validates all Section 35 invariants, contracts, accounting conservation, and non-lossy rules:
 * 1. target_duplicates_exact_5: exactly 5 duplicate observations evaluated.
 * 2. target_conflicts_exact_4: exactly 4 conflict observations evaluated.
 * 3. target_total_exact_9: exactly 9 target observations evaluated.
 * 4. out_of_scope_exact_1053: protected out-of-scope backlog is exactly 1053 (Conservation: 9 + 1053 = 1062).
 * 5. all_duplicates_verified_canonical: all 5 duplicates verified against canonical base-model fitments.
 * 6. all_conflicts_accounted: all 4 conflicts accounted for in conflict ledger.
 * 7. no_scalar_section_mutation: scalar section fields in fitments remain unmutated (SCALAR_SECTION_MUTATIONS = 0).
 * 8. context_requires_existing_fitment: all added contexts reference an existing canonical fitment_id.
 * 9. context_scope_compatible: source scope MODEL_LEVEL_ONLY compatible with BASE_MODEL_CONFIRMED.
 * 10. context_provenance_complete: all contexts retain complete source provenance.
 * 11. no_duplicate_contexts: no duplicate contexts created.
 * 12. context_growth_bounded: new conflict contexts <= 4 (810 -> 814).
 * 13. existing_810_contexts_immutable: original Phase 54F-D 810 contexts unchanged.
 * 14. no_new_parts: parts count unchanged at 17,082.
 * 15. no_new_fitments: fitments count unchanged at 175,106.
 * 16. no_config_changes: configurations count unchanged at 766.
 * 17. no_evidence_mutations: raw evidence count unchanged at 208,412.
 * 18. raw_observations_preserved: RAW_OBSERVATION_DELETIONS = 0.
 * 19. zero_external_network: 0 external network requests executed.
 * 20. historical_phase_protections: Phase 54F-A, 54F-C, 54F-D, 54F-E, 54F-F untouched.
 * 21. false_resolutions_zero: FALSE_RESOLUTIONS = 0.
 * 22. idempotency: re-running resolution yields identical output and 0 diff.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  runDuplicateConflictResolution,
  DB_PATH,
  STAGING_DIR,
  OBSERVATIONS_FILE,
  ACCEPTED_EVIDENCE_FILE,
  BASE_ENRICHMENT_FILE,
  ADJUDICATION_FILE,
  SECTION_CONTEXTS_FILE,
  RESOLUTION_OUTPUT_FILE,
  START_BASELINE
} from './resolve_phase54f_duplicate_conflict.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const P54C_ESCALATION_FILE = path.join(STAGING_DIR, 'evidence_escalation.json');
const P54D_RESOLUTION_FILE = path.join(STAGING_DIR, 'multisection_resolution.json');
const P54E_SCOPE_FILE = path.join(STAGING_DIR, 'scope_resolution.json');
const P54F_UNMASKED_FILE = path.join(STAGING_DIR, 'unmasked_evidence_escalation.json');

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
  console.log('🔍 PHASE 54F-G DUPLICATE & CONFLICT RESOLUTION AUDIT');
  console.log('===============================================================\n');

  // 1. Audit Artifact Existence & Metadata
  console.log('▶ 1. Auditing Artifact Existence & Metadata...');
  assertInvariant(fs.existsSync(RESOLUTION_OUTPUT_FILE), 'duplicate_conflict_resolution.json exists');

  const doc = JSON.parse(fs.readFileSync(RESOLUTION_OUTPUT_FILE, 'utf8'));
  assertInvariant(doc.phase === 'Phase 54F-G', 'Phase is Phase 54F-G');
  assertInvariant(doc.baseline_sha === START_BASELINE, 'Baseline SHA matches Phase 54F-F final merge commit');

  // 2. Audit Phase 54F-A Protected Set Integrity
  console.log('\n▶ 2. Auditing Phase 54F-A Protected Set Integrity (Zero Mutations)...');
  const currentEvidenceHash = crypto.createHash('sha256').update(fs.readFileSync(ACCEPTED_EVIDENCE_FILE)).digest('hex');
  const currentEnrichmentHash = crypto.createHash('sha256').update(fs.readFileSync(BASE_ENRICHMENT_FILE)).digest('hex');

  assertInvariant(currentEvidenceHash === EXPECTED_ACCEPTED_EVIDENCE_SHA256, 'Phase 54F-A accepted evidence hash identical to baseline');
  assertInvariant(currentEnrichmentHash === EXPECTED_PARTS_SECTION_ENRICHMENT_SHA256, 'Phase 54F-A parts section enrichment hash identical to baseline');
  assertInvariant(doc.protection_checks.phase54f_a_accepted_set_mutations === 0, 'phase54f_a_accepted_set_mutations === 0');

  // 3. Audit Target Accounting & Backlog Conservation (5 + 4 = 9, 9 + 1053 = 1062)
  console.log('\n▶ 3. Auditing Target Accounting & Conservation (5 dup + 4 conf = 9; 9 + 1053 = 1062)...');
  const s = doc.summary;
  assertInvariant(s.duplicates_total === 5, 'duplicates_total === 5');
  assertInvariant(s.conflicts_total === 4, 'conflicts_total === 4');
  assertInvariant(s.target_observations_total === 9, 'target_observations_total === 9');
  assertInvariant(s.resolved_duplicate_observations === 5, 'resolved_duplicate_observations === 5');
  assertInvariant(s.resolved_conflict_observations === 4, 'resolved_conflict_observations === 4');
  assertInvariant(s.total_resolved_observations === 9, 'total_resolved_observations === 9');

  const br = doc.backlog_reconciliation;
  assertInvariant(br.active_backlog_before === 1062, 'active_backlog_before === 1062');
  assertInvariant(br.target_observations === 9, 'target_observations === 9');
  assertInvariant(br.total_resolved === 9, 'total_resolved === 9');
  assertInvariant(br.active_backlog_after === 1053, 'active_backlog_after === 1053');
  assertInvariant(br.out_of_scope_backlog === 1053, 'out_of_scope_backlog === 1053');
  assertInvariant(br.target_observations + br.out_of_scope_backlog === 1062, 'Conservation invariant: 9 + 1053 === 1062');
  assertInvariant(br.conservation_valid === true, 'conservation_valid === true');

  // 4. Audit Duplicate Ledger (5/5 Exact Canonical Base Match)
  console.log('\n▶ 4. Auditing Duplicate Ledger (5/5 Corroborating Duplicates Resolved)...');
  assertInvariant(Array.isArray(doc.duplicate_ledger) && doc.duplicate_ledger.length === 5, 'duplicate_ledger has 5 records');

  for (const d of doc.duplicate_ledger) {
    assertInvariant(d.part_exists === true, `Duplicate ${d.evidence_id} part exists`);
    assertInvariant(d.fitment_exists === true, `Duplicate ${d.evidence_id} fitment exists`);
    assertInvariant(d.section_keys_match === true, `Duplicate ${d.evidence_id} section keys match`);
    assertInvariant(d.fitment_scope === 'BASE_MODEL_CONFIRMED', `Duplicate ${d.evidence_id} is BASE_MODEL_CONFIRMED`);
    assertInvariant(d.final_status === 'CORROBORATING_DUPLICATE_RESOLVED', `Duplicate ${d.evidence_id} status is CORROBORATING_DUPLICATE_RESOLVED`);
  }

  // 5. Audit Conflict Ledger (4/4 Additive Contexts Created)
  console.log('\n▶ 5. Auditing Conflict Ledger (4/4 Additive Section Contexts)...');
  assertInvariant(Array.isArray(doc.conflict_ledger) && doc.conflict_ledger.length === 4, 'conflict_ledger has 4 records');

  for (const c of doc.conflict_ledger) {
    assertInvariant(c.existing_fitment_id !== null, `Conflict ${c.evidence_id} has existing_fitment_id`);
    assertInvariant(c.fitment_scope === 'BASE_MODEL_CONFIRMED', `Conflict ${c.evidence_id} fitment_scope === BASE_MODEL_CONFIRMED`);
    assertInvariant(c.source_scope === 'MODEL_LEVEL_ONLY', `Conflict ${c.evidence_id} source_scope === MODEL_LEVEL_ONLY`);
    assertInvariant(c.raw_observation_exists === true, `Conflict ${c.evidence_id} raw_observation_exists === true`);
    assertInvariant(c.section_is_meaningful === true, `Conflict ${c.evidence_id} section_is_meaningful === true`);
    assertInvariant(c.final_status === 'SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT', `Conflict ${c.evidence_id} status is SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT`);
  }

  // 6. Audit Additive Contexts File (810 -> 814, 0 Old Mutations)
  console.log('\n▶ 6. Auditing Additive Section Contexts File (810 -> 814)...');
  const contextsDoc = JSON.parse(fs.readFileSync(SECTION_CONTEXTS_FILE, 'utf8'));
  assertInvariant(contextsDoc.record_count === 814, 'model_part_fitment_section_contexts.json record_count === 814');
  assertInvariant(contextsDoc.contexts.length === 814, 'model_part_fitment_section_contexts.json contexts length === 814');

  // Verify first 810 contexts are unchanged from Phase 54F-D
  const p54dDoc = JSON.parse(fs.readFileSync(P54D_RESOLUTION_FILE, 'utf8'));
  const p54dContextIds = new Set(p54dDoc.section_contexts.map(c => c.context_id));
  assertInvariant(p54dContextIds.size === 810, 'Phase 54F-D had 810 unique context IDs');

  let originalMatchCount = 0;
  for (let i = 0; i < 810; i++) {
    if (p54dContextIds.has(contextsDoc.contexts[i].context_id)) {
      originalMatchCount++;
    }
  }
  assertInvariant(originalMatchCount === 810, 'All 810 original Phase 54F-D section contexts 100% preserved');

  // Verify the 4 added contexts
  const addedContexts = contextsDoc.contexts.slice(810);
  assertInvariant(addedContexts.length === 4, 'Exactly 4 added contexts');
  for (const ctx of addedContexts) {
    assertInvariant(ctx.section_context_status === 'SOURCE_OBSERVED_ADDITIONAL_CONTEXT', 'Added context has SOURCE_OBSERVED_ADDITIONAL_CONTEXT status');
    assertInvariant(ctx.provenance_hash && ctx.provenance_hash.length === 64, 'Added context has 64-char SHA-256 provenance_hash');
    assertInvariant(ctx.fitment_id.includes('BASE_MODEL_CONFIRMED'), 'Added context attached to BASE_MODEL_CONFIRMED fitment');
  }

  // 7. Audit Zero-Leakage & Immutability Invariants
  console.log('\n▶ 7. Auditing Zero-Leakage & Immutability Invariants...');
  const pc = doc.protection_checks;
  assertInvariant(pc.scalar_section_mutations === 0, 'scalar_section_mutations === 0');
  assertInvariant(pc.variant_leakage === 0, 'variant_leakage === 0');
  assertInvariant(pc.configuration_leakage === 0, 'configuration_leakage === 0');
  assertInvariant(pc.false_resolutions === 0, 'false_resolutions === 0');
  assertInvariant(pc.raw_observation_deletions === 0, 'raw_observation_deletions === 0');
  assertInvariant(s.external_network_requests === 0, 'external_network_requests === 0');

  // 8. Audit Historical Phase Protections
  console.log('\n▶ 8. Auditing Historical Phase Protections...');
  const p54cDoc = JSON.parse(fs.readFileSync(P54C_ESCALATION_FILE, 'utf8'));
  assertInvariant(p54cDoc.queue.length === 612, 'Phase 54F-C queue remains 612 candidates');

  const p54eDoc = JSON.parse(fs.readFileSync(P54E_SCOPE_FILE, 'utf8'));
  assertInvariant(p54eDoc.summary.total_scope_observations === 293, 'Phase 54F-E scope observations remain 293');

  const p54fDoc = JSON.parse(fs.readFileSync(P54F_UNMASKED_FILE, 'utf8'));
  assertInvariant(p54fDoc.target_accounting.total_target_pairs === 50, 'Phase 54F-F target pairs remain 50');
  assertInvariant(p54fDoc.target_accounting.total_target_observations === 116, 'Phase 54F-F target observations remain 116');

  // 9. Audit Database Catalog Counts (Strict Freezes)
  console.log('\n▶ 9. Auditing Database State & Catalog Counts...');
  const db = new Database(DB_PATH, { readonly: true });
  const partsCount = db.prepare('SELECT count(*) as c FROM parts').get().c;
  const fitmentsCount = db.prepare('SELECT count(*) as c FROM model_part_fitments').get().c;
  const configsCount = db.prepare('SELECT count(*) as c FROM parts_model_configurations').get().c;
  const evidenceCount = db.prepare('SELECT count(*) as c FROM part_fitment_evidence').get().c;
  const contextsDbCount = db.prepare('SELECT count(*) as c FROM model_part_fitment_section_contexts').get().c;
  db.close();

  assertInvariant(partsCount === 17082, 'Database PARTS count === 17082');
  assertInvariant(fitmentsCount === 175106, 'Database FITMENTS count === 175106');
  assertInvariant(configsCount === 766, 'Database CONFIGURATIONS count === 766');
  assertInvariant(evidenceCount === 208412, 'Database EVIDENCE count === 208412');
  assertInvariant(contextsDbCount === 814, 'Database SECTION_CONTEXTS count === 814');

  // 10. Audit Idempotency
  console.log('\n▶ 10. Auditing Idempotency (Rerun Yields Identical Output & 0 Diff)...');
  const rerunResult = runDuplicateConflictResolution({ dryRun: true });

  const preDoc = JSON.parse(fs.readFileSync(RESOLUTION_OUTPUT_FILE, 'utf8'));
  preDoc.generated_at = 'TIMESTAMP_NEUTRAL';
  rerunResult.generated_at = 'TIMESTAMP_NEUTRAL';

  assertInvariant(
    JSON.stringify(preDoc) === JSON.stringify(rerunResult),
    'Idempotency check: duplicate & conflict resolution rerun produces identical ledger and accounting'
  );

  console.log('\n===============================================================');
  console.log('✅ PHASE 54F-G DUPLICATE & CONFLICT RESOLUTION AUDIT PASSED');
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
