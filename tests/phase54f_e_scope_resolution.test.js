import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { runScopeResolution, FINAL_VARIANT_STATUSES, FINAL_CONFIG_STATUSES } from '../scripts/resolve_phase54f_scope.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');
const ACCEPTED_EVIDENCE_FILE = path.join(STAGING_DIR, 'accepted_evidence.jsonl');

const SCOPE_RESOLUTION_FILE = path.join(STAGING_DIR, 'scope_resolution.json');
const CANONICAL_RESOLUTIONS_FILE = path.join(rootDir, 'data', 'part_fitment_scope_resolutions.json');
const D_CONTEXTS_FILE = path.join(rootDir, 'data', 'model_part_fitment_section_contexts.json');
const EVIDENCE_ESCALATION_FILE = path.join(STAGING_DIR, 'evidence_escalation.json');

describe('Phase 54F-E — Variant & Configuration Scope Resolution Test Suite', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const scopeResDoc = JSON.parse(fs.readFileSync(SCOPE_RESOLUTION_FILE, 'utf8'));
  const canonicalResDoc = JSON.parse(fs.readFileSync(CANONICAL_RESOLUTIONS_FILE, 'utf8'));
  const dContextsDoc = JSON.parse(fs.readFileSync(D_CONTEXTS_FILE, 'utf8'));

  it('Test 1 — Exact Input Cohort: 151 variant, 142 configuration, 293 total observations', () => {
    assert.equal(scopeResDoc.summary.variant_observations_total, 151);
    assert.equal(scopeResDoc.summary.configuration_observations_total, 142);
    assert.equal(scopeResDoc.summary.total_scope_observations, 293);
    assert.equal(scopeResDoc.observations_ledger.length, 293);

    const variantObs = scopeResDoc.observations_ledger.filter(o => o.cohort === 'VARIANT');
    const configObs = scopeResDoc.observations_ledger.filter(o => o.cohort === 'CONFIGURATION');
    assert.equal(variantObs.length, 151);
    assert.equal(configObs.length, 142);
  });

  it('Test 2 — Pair Accounting: 142 variant pairs, 134 configuration pairs, 276 unique pairs', () => {
    assert.equal(scopeResDoc.summary.variant_unique_pairs, 142);
    assert.equal(scopeResDoc.summary.configuration_unique_pairs, 134);
    assert.equal(scopeResDoc.summary.total_scope_unique_pairs, 276);
    assert.equal(scopeResDoc.pair_summary.variant_pairs_count, 142);
    assert.equal(scopeResDoc.pair_summary.configuration_pairs_count, 134);
    assert.equal(scopeResDoc.pair_summary.total_pairs_count, 276);
  });

  it('Test 3 — Variant Classification Integrity: base-model-only does NOT resolve variant', () => {
    const vClass = scopeResDoc.summary.variant_classification;
    assert.equal(vClass.explicit_identity_found, 0);
    assert.equal(vClass.model_level_only, 7);
    assert.equal(vClass.ambiguous_multiple_matches, 144);
    assert.equal(vClass.conflicting_source_identity, 0);
    assert.equal(vClass.no_existing_fitment, 0);
    assert.equal(vClass.invalid_metadata, 0);

    const sum = Object.values(vClass).reduce((a, b) => a + b, 0);
    assert.equal(sum, 151);

    // Verify all 151 variant observations are unresolved
    const variantObs = scopeResDoc.observations_ledger.filter(o => o.cohort === 'VARIANT');
    for (const obs of variantObs) {
      assert.equal(obs.resolved_fitment_id, null);
      assert.equal(obs.resolved_variant_key, null);
      assert.ok([
        FINAL_VARIANT_STATUSES.UNRESOLVED_MODEL_LEVEL,
        FINAL_VARIANT_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL
      ].includes(obs.resolution_status));
    }
  });

  it('Test 4 — Configuration Classification Integrity: base-model-only does NOT resolve config', () => {
    const cClass = scopeResDoc.summary.configuration_classification;
    assert.equal(cClass.explicit_identity_found, 0);
    assert.equal(cClass.model_level_only, 92);
    assert.equal(cClass.ambiguous_multiple_matches, 50);
    assert.equal(cClass.conflicting_source_identity, 0);
    assert.equal(cClass.no_existing_fitment, 0);
    assert.equal(cClass.invalid_metadata, 0);

    const sum = Object.values(cClass).reduce((a, b) => a + b, 0);
    assert.equal(sum, 142);

    // Verify all 142 configuration observations are unresolved
    const configObs = scopeResDoc.observations_ledger.filter(o => o.cohort === 'CONFIGURATION');
    for (const obs of configObs) {
      assert.equal(obs.resolved_fitment_id, null);
      assert.equal(obs.resolved_configuration_key, null);
      assert.ok([
        FINAL_CONFIG_STATUSES.UNRESOLVED_MODEL_LEVEL,
        FINAL_CONFIG_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL
      ].includes(obs.resolution_status));
    }
  });

  it('Test 5 — Rule 13 & 15: Candidate Uniqueness != Source Evidence', () => {
    // 7 variant observations have a single candidate in DB, but source is model-level only
    const modelLevelVariants = scopeResDoc.observations_ledger.filter(
      o => o.cohort === 'VARIANT' && o.resolution_status === FINAL_VARIANT_STATUSES.UNRESOLVED_MODEL_LEVEL
    );
    assert.equal(modelLevelVariants.length, 7);
    for (const obs of modelLevelVariants) {
      assert.equal(obs.candidate_variant_keys.length, 1);
      assert.equal(obs.resolved_variant_key, null, 'Single candidate in DB must NOT be inferred as resolution!');
    }

    // 92 config observations have a single candidate in DB, but source is model-level only
    const modelLevelConfigs = scopeResDoc.observations_ledger.filter(
      o => o.cohort === 'CONFIGURATION' && o.resolution_status === FINAL_CONFIG_STATUSES.UNRESOLVED_MODEL_LEVEL
    );
    assert.equal(modelLevelConfigs.length, 92);
    for (const obs of modelLevelConfigs) {
      assert.equal(obs.candidate_configuration_keys.length, 1);
      assert.equal(obs.resolved_configuration_key, null, 'Single candidate in DB must NOT be inferred as resolution!');
    }
  });

  it('Test 6 — Multiple Matches Remain Ambiguous', () => {
    const ambigVariants = scopeResDoc.observations_ledger.filter(
      o => o.cohort === 'VARIANT' && o.resolution_status === FINAL_VARIANT_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL
    );
    assert.equal(ambigVariants.length, 144);
    for (const obs of ambigVariants) {
      assert.ok(obs.candidate_variant_keys.length > 1);
      assert.equal(obs.resolved_variant_key, null);
    }

    const ambigConfigs = scopeResDoc.observations_ledger.filter(
      o => o.cohort === 'CONFIGURATION' && o.resolution_status === FINAL_CONFIG_STATUSES.AMBIGUOUS_MULTIPLE_CANONICAL
    );
    assert.equal(ambigConfigs.length, 50);
    for (const obs of ambigConfigs) {
      assert.ok(obs.candidate_configuration_keys.length > 1);
      assert.equal(obs.resolved_configuration_key, null);
    }
  });

  it('Test 7 — No Synthetic Configuration or Variant Invention', () => {
    const canonicalVariants = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_model_variants.json'), 'utf8')).variants;
    const canonicalConfigs = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_model_configurations.json'), 'utf8')).configurations;

    const validVariantKeys = new Set(canonicalVariants.map(v => v.variant_key));
    const validConfigKeys = new Set(canonicalConfigs.map(c => c.configuration_key));

    for (const res of canonicalResDoc.resolutions) {
      if (res.resolved_variant_key) {
        assert.ok(validVariantKeys.has(res.resolved_variant_key), `Invented variant key: ${res.resolved_variant_key}`);
      }
      if (res.resolved_configuration_key) {
        assert.ok(validConfigKeys.has(res.resolved_configuration_key), `Synthetic config key: ${res.resolved_configuration_key}`);
      }
    }
  });

  it('Test 8 — Existing 810 Phase 54F-D Section Contexts Unchanged', () => {
    const phaseDContexts = dContextsDoc.contexts.filter(c => c.section_context_status === 'SOURCE_OBSERVED_MULTI_CONTEXT');
    assert.equal(phaseDContexts.length, 810);

    const dbPhaseDContextCount = db.prepare("SELECT count(1) as c FROM model_part_fitment_section_contexts WHERE section_context_status = 'SOURCE_OBSERVED_MULTI_CONTEXT'").get().c;
    assert.equal(dbPhaseDContextCount, 810);
  });

  it('Test 9 — No Context Added for Unresolved Scope', () => {
    // 16 variant + 16 config multi-section observations were evaluated. Since 0 were resolved, 0 contexts were added.
    const dMsDoc = JSON.parse(fs.readFileSync(path.join(STAGING_DIR, 'multisection_resolution.json'), 'utf8'));
    const unresolvedDVariantObsIds = new Set(
      dMsDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_VARIANT_SCOPE_UNRESOLVED').flatMap(p => p.evidence_ids)
    );
    const unresolvedDConfigObsIds = new Set(
      dMsDoc.pairs.filter(p => p.final_pair_status === 'MULTI_SECTION_CONFIGURATION_SCOPE_UNRESOLVED').flatMap(p => p.evidence_ids)
    );

    assert.equal(unresolvedDVariantObsIds.size, 16);
    assert.equal(unresolvedDConfigObsIds.size, 16);

    for (const ctx of dContextsDoc.contexts) {
      assert.ok(!unresolvedDVariantObsIds.has(ctx.source_evidence_id), 'Unresolved D variant observation found in contexts!');
      assert.ok(!unresolvedDConfigObsIds.has(ctx.source_evidence_id), 'Unresolved D config observation found in contexts!');
    }
  });

  it('Test 10 — No Duplicate Resolution Rows & No Duplicate Contexts', () => {
    const resIds = new Set();
    for (const r of canonicalResDoc.resolutions) {
      assert.ok(!resIds.has(r.resolution_id), `Duplicate resolution_id: ${r.resolution_id}`);
      resIds.add(r.resolution_id);
    }

    const ctxIds = new Set();
    for (const c of dContextsDoc.contexts) {
      assert.ok(!ctxIds.has(c.context_id), `Duplicate context_id: ${c.context_id}`);
      ctxIds.add(c.context_id);
    }
  });

  it('Test 11 — Active Backlog Reconciliation & Out-of-Scope Conservation', () => {
    assert.equal(scopeResDoc.summary.active_backlog_before, 1062);
    assert.equal(scopeResDoc.summary.resolved_scope_observations, 0);
    assert.equal(scopeResDoc.summary.unresolved_scope_observations, 293);
    assert.equal(scopeResDoc.summary.active_backlog_after, 1062);
    assert.equal(scopeResDoc.summary.out_of_scope_backlog, 769);

    assert.equal(
      scopeResDoc.summary.total_scope_observations + scopeResDoc.summary.out_of_scope_backlog,
      1062
    );
  });

  it('Test 12 — Catalog Immutability & Zero False Resolutions', () => {
    const partsCount = db.prepare('SELECT count(1) as c FROM parts').get().c;
    const fitmentsCount = db.prepare('SELECT count(1) as c FROM model_part_fitments').get().c;
    const configsCount = db.prepare('SELECT count(1) as c FROM parts_model_configurations').get().c;
    const evidenceCount = db.prepare('SELECT count(1) as c FROM part_fitment_evidence').get().c;
    const unresolvedScalarCount = db.prepare('SELECT count(1) as c FROM model_part_fitments WHERE section_name = \'Unresolved Diagram Section\'').get().c;

    assert.equal(partsCount, 17082);
    assert.equal(fitmentsCount, 175106);
    assert.equal(configsCount, 766);
    assert.equal(evidenceCount, 208412);
    assert.equal(unresolvedScalarCount, 170503);

    const inv = scopeResDoc.summary.invariants;
    assert.equal(inv.new_parts, 0);
    assert.equal(inv.new_fitments, 0);
    assert.equal(inv.raw_evidence_mutations, 0);
    assert.equal(inv.scalar_section_mutations, 0);
    assert.equal(inv.phase54f_d_context_mutations, 0);
    assert.equal(inv.false_scope_resolutions, 0);
    assert.equal(inv.variant_leakage, 0);
    assert.equal(inv.configuration_leakage, 0);
    assert.equal(inv.external_network_requests, 0);
  });

  it('Test 13 — Idempotency Check', () => {
    const rerun = runScopeResolution({ dryRun: true });
    assert.equal(rerun.scopeResolutionDoc.summary.total_scope_observations, 293);
    assert.equal(rerun.scopeResolutionDoc.summary.resolved_scope_observations, 0);
    assert.equal(rerun.canonicalResolutionsDoc.record_count, canonicalResDoc.record_count);
  });
});
