import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  runFinalizePhase54FBacklog,
  REGISTRY_OUTPUT_FILE,
  SECTION_CONTEXTS_FILE,
  DB_PATH
} from '../scripts/finalize_phase54f_backlog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 54F-H — Final Backlog Consolidation & Phase 54F Closure Readiness Test Suite', () => {
  const registryDoc = JSON.parse(fs.readFileSync(REGISTRY_OUTPUT_FILE, 'utf8'));
  const contextsDoc = JSON.parse(fs.readFileSync(SECTION_CONTEXTS_FILE, 'utf8'));

  // 1. Exact Category Breakdown & Totals (Section 34)
  it('1. Exact Category Counts and 1,053 Total Backlog', () => {
    assert.strictEqual(registryDoc.summary.new_part_deferred, 383, 'new_part_deferred === 383');
    assert.strictEqual(registryDoc.summary.new_fitment_deferred, 377, 'new_fitment_deferred === 377');
    assert.strictEqual(registryDoc.summary.variant_deferred, 151, 'variant_deferred === 151');
    assert.strictEqual(registryDoc.summary.configuration_deferred, 142, 'configuration_deferred === 142');
    assert.strictEqual(registryDoc.summary.unresolved_backlog, 1053, 'unresolved_backlog === 1053');
    assert.strictEqual(registryDoc.summary.deferred_backlog, 1053, 'deferred_backlog === 1053');
    assert.strictEqual(registryDoc.observations.length, 1053, 'observations.length === 1053');

    const sum = registryDoc.summary.new_part_deferred +
      registryDoc.summary.new_fitment_deferred +
      registryDoc.summary.variant_deferred +
      registryDoc.summary.configuration_deferred;
    assert.strictEqual(sum, 1053, '383 + 377 + 151 + 142 === 1053');
  });

  // 2. Unique Evidence IDs (Section 34)
  it('2. Unique Evidence IDs Across Entire Deferred Backlog', () => {
    const evidenceIds = new Set();
    for (const obs of registryDoc.observations) {
      assert.ok(!evidenceIds.has(obs.evidence_id), `Duplicate evidence_id: ${obs.evidence_id}`);
      evidenceIds.add(obs.evidence_id);
    }
    assert.strictEqual(evidenceIds.size, 1053, 'All 1,053 evidence_ids are unique');
  });

  // 3. Actionable Now and Deferred Semantics (Section 34)
  it('3. Actionable Now === false (0 true) and Deferred === true (1053 true)', () => {
    assert.strictEqual(registryDoc.summary.actionable_with_current_evidence, 0);
    assert.strictEqual(registryDoc.summary.current_action_queue, 0);
    assert.strictEqual(registryDoc.protection_checks.actionable_now_true, 0);
    assert.strictEqual(registryDoc.protection_checks.deferred_true, 1053);

    for (const obs of registryDoc.observations) {
      assert.strictEqual(obs.actionable_now, false, `obs ${obs.evidence_id} actionable_now must be false`);
      assert.strictEqual(obs.deferred, true, `obs ${obs.evidence_id} deferred must be true`);
      assert.ok(obs.evidence_gap && obs.evidence_gap.length > 0, `obs ${obs.evidence_id} missing evidence_gap`);
      assert.ok(obs.reactivation_trigger && obs.reactivation_trigger.length > 0, `obs ${obs.evidence_id} missing reactivation_trigger`);
    }
  });

  // 4. Reactivation Rules Enforcement (Section 34)
  it('4. Reactivation Rules Enforcement: New Part, New Fitment, Variant, and Configuration', () => {
    for (const obs of registryDoc.observations) {
      if (obs.terminal_disposition === 'DEFERRED_NEW_PART_EVIDENCE_REQUIRED') {
        assert.strictEqual(obs.reactivation_trigger, 'NEW_TIER1_OR_TIER2_IDENTITY_OR_DUAL_TIER3_IDENTITY');
        assert.ok(obs.reactivation_requirements.rule.includes('Tier 1/Tier 2'));
        assert.ok(obs.reactivation_requirements.prohibited.includes('Periodic automated retry without genuine new source evidence'));
      } else if (obs.terminal_disposition === 'DEFERRED_NEW_FITMENT_EVIDENCE_REQUIRED') {
        assert.strictEqual(obs.reactivation_trigger, 'NEW_TIER1_OR_TIER2_FITMENT_OR_DUAL_TIER3_FITMENT');
        assert.ok(obs.reactivation_requirements.rule.includes('Tier 1/Tier 2'));
        assert.ok(obs.reactivation_requirements.prohibited.includes('Sibling/family inference'));
      } else if (obs.terminal_disposition === 'DEFERRED_VARIANT_SOURCE_IDENTITY_REQUIRED') {
        assert.strictEqual(obs.reactivation_trigger, 'NEW_EXPLICIT_VARIANT_SOURCE_IDENTITY');
        assert.ok(obs.reactivation_requirements.rule.includes('explicitly containing textual or diagrammatic token'));
        assert.ok(obs.reactivation_requirements.prohibited.includes('Database uniqueness'));
      } else if (obs.terminal_disposition === 'DEFERRED_CONFIGURATION_SOURCE_IDENTITY_REQUIRED') {
        assert.strictEqual(obs.reactivation_trigger, 'NEW_EXPLICIT_CONFIGURATION_SOURCE_IDENTITY');
        assert.ok(obs.reactivation_requirements.rule.includes('explicitly containing textual or diagrammatic token'));
        assert.ok(obs.reactivation_requirements.prohibited.includes('Synthetic configuration'));
      } else {
        assert.fail(`Unexpected terminal disposition: ${obs.terminal_disposition}`);
      }
    }
  });

  // 5. Origin Cohort Preservation (Section 34)
  it('5. Lineage Conservation: Exact Historical Subcohort Distribution', () => {
    const cs = registryDoc.cohort_summary;
    assert.strictEqual(cs.PHASE54F_B_ORIGINAL_NEW_PART, 333);
    assert.strictEqual(cs.PHASE54F_D_UNMASKED_NEW_PART, 50);
    assert.strictEqual(cs.PHASE54F_B_ORIGINAL_NEW_FITMENT, 311);
    assert.strictEqual(cs.PHASE54F_D_UNMASKED_NEW_FITMENT, 66);
    assert.strictEqual(cs.PHASE54F_B_ORIGINAL_VARIANT_SCOPE, 135);
    assert.strictEqual(cs.PHASE54F_D_UNMASKED_VARIANT_SCOPE, 16);
    assert.strictEqual(cs.PHASE54F_B_ORIGINAL_CONFIGURATION_SCOPE, 126);
    assert.strictEqual(cs.PHASE54F_D_UNMASKED_CONFIGURATION_SCOPE, 16);

    // Sum of original B: 333 + 311 + 135 + 126 = 905
    assert.strictEqual(cs.PHASE54F_B_ORIGINAL_NEW_PART + cs.PHASE54F_B_ORIGINAL_NEW_FITMENT + cs.PHASE54F_B_ORIGINAL_VARIANT_SCOPE + cs.PHASE54F_B_ORIGINAL_CONFIGURATION_SCOPE, 905);
    // Sum of unmasked D: 50 + 66 + 16 + 16 = 148
    assert.strictEqual(cs.PHASE54F_D_UNMASKED_NEW_PART + cs.PHASE54F_D_UNMASKED_NEW_FITMENT + cs.PHASE54F_D_UNMASKED_VARIANT_SCOPE + cs.PHASE54F_D_UNMASKED_CONFIGURATION_SCOPE, 148);
    // Total: 905 + 148 = 1053
  });

  // 6. Scope State Invariants (Section 34)
  it('6. Phase 54F-E Scope State Preservation (7/144 variant, 92/50 config)', () => {
    const scs = registryDoc.scope_classification_summary;
    assert.strictEqual(scs.variant.model_level_only, 7);
    assert.strictEqual(scs.variant.ambiguous_multiple_matches, 144);
    assert.strictEqual(scs.variant.total, 151);

    assert.strictEqual(scs.configuration.model_level_only, 92);
    assert.strictEqual(scs.configuration.ambiguous_multiple_matches, 50);
    assert.strictEqual(scs.configuration.total, 142);

    assert.strictEqual(scs.explicit_source_identities, 0);
  });

  // 7. Full Lifecycle Conservation (Section 34)
  it('7. Full Lifecycle Conservation: 1,872 Original = 819 Resolved + 1,053 Deferred', () => {
    const conv = registryDoc.conservation;
    assert.strictEqual(conv.original_staging, 1872);
    assert.strictEqual(conv.phase54f_d_resolved, 810);
    assert.strictEqual(conv.phase54f_g_resolved, 9);
    assert.strictEqual(conv.total_resolved, 819);
    assert.strictEqual(conv.deferred_backlog, 1053);
    assert.strictEqual(conv.valid, true);
    assert.strictEqual(conv.total_resolved + conv.deferred_backlog, 1872);
    assert.strictEqual(registryDoc.summary.resolved_by_phase54f_h, 0);
  });

  // 8. Strict Section Context Subcohorts (Section 34)
  it('8. Strict Section Context Subcohorts: 810 Phase 54F-D + 4 Phase 54F-G = 814 Total', () => {
    assert.strictEqual(contextsDoc.record_count, 814);
    assert.strictEqual(contextsDoc.contexts.length, 814);

    let dCount = 0;
    let gCount = 0;
    for (const ctx of contextsDoc.contexts) {
      if (ctx.section_context_status === 'SOURCE_OBSERVED_MULTI_CONTEXT') dCount++;
      else if (ctx.section_context_status === 'SOURCE_OBSERVED_ADDITIONAL_CONTEXT') gCount++;
    }
    assert.strictEqual(dCount, 810, 'Strict Phase 54F-D cohort === 810');
    assert.strictEqual(gCount, 4, 'Strict Phase 54F-G cohort === 4');
  });

  // 9. Catalog Freeze & Zero Catalog Writes (Section 34)
  it('9. Catalog Invariant Verification: Database Counts Frozen', () => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const parts = db.prepare("SELECT count(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c;
      const fitments = db.prepare("SELECT count(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c;
      const configs = db.prepare("SELECT count(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c;
      const evidence = db.prepare("SELECT count(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c;
      const contexts = db.prepare('SELECT count(*) as c FROM model_part_fitment_section_contexts').get().c;

      assert.strictEqual(parts, 17082, 'Database parts count frozen at 17,082');
      assert.strictEqual(fitments, 175106, 'Database fitments count frozen at 175,106');
      assert.strictEqual(configs, 766, 'Database configurations count frozen at 766');
      assert.strictEqual(evidence, 208412, 'Database evidence count frozen at 208,412');
      assert.strictEqual(contexts, 814, 'Database section contexts count frozen at 814');
    } finally {
      db.close();
    }

    assert.strictEqual(registryDoc.protection_checks.new_parts, 0);
    assert.strictEqual(registryDoc.protection_checks.new_fitments, 0);
    assert.strictEqual(registryDoc.protection_checks.new_configurations, 0);
    assert.strictEqual(registryDoc.protection_checks.new_evidence_rows, 0);
    assert.strictEqual(registryDoc.protection_checks.new_section_contexts, 0);
    assert.strictEqual(registryDoc.protection_checks.external_network_requests, 0);
  });

  // 10. Unique Entities and Disjoint Overlap Matrix (Section 34)
  it('10. Unique Entities Accounting and Disjoint Overlap Matrix', () => {
    const ues = registryDoc.unique_entity_summary;
    assert.strictEqual(ues.new_part_unique_part_numbers, 318);
    assert.strictEqual(ues.new_part_unique_model_part_pairs, 357);
    assert.strictEqual(ues.new_fitment_unique_model_part_pairs, 337);
    assert.strictEqual(ues.variant_unique_model_part_pairs, 142);
    assert.strictEqual(ues.configuration_unique_model_part_pairs, 134);
    assert.strictEqual(ues.total_unique_part_numbers_across_backlog, 813);
    assert.strictEqual(ues.total_unique_model_part_pairs_across_backlog, 970);

    const om = registryDoc.overlap_matrix;
    assert.strictEqual(om.new_part_and_new_fitment, 0);
    assert.strictEqual(om.new_part_and_variant, 0);
    assert.strictEqual(om.new_part_and_configuration, 0);
    assert.strictEqual(om.new_fitment_and_variant, 0);
    assert.strictEqual(om.new_fitment_and_configuration, 0);
    assert.strictEqual(om.variant_and_configuration, 0);
  });

  // 11. Idempotency (Section 34)
  it('11. Idempotency: Re-running consolidation produces identical registry', () => {
    const rerunDoc = runFinalizePhase54FBacklog({ dryRun: true });
    assert.strictEqual(rerunDoc.observations.length, 1053);
    assert.strictEqual(rerunDoc.summary.unresolved_backlog, 1053);
    assert.strictEqual(rerunDoc.summary.deferred_backlog, 1053);
    assert.strictEqual(rerunDoc.summary.actionable_with_current_evidence, 0);

    const d1 = { ...registryDoc, generated_at: null };
    const d2 = { ...rerunDoc, generated_at: null };
    assert.strictEqual(JSON.stringify(d1), JSON.stringify(d2), 'Semantic diff is 0 across runs');
  });
});
