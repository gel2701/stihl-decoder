import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { runDuplicateConflictResolution } from '../scripts/resolve_phase54f_duplicate_conflict.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const STAGING_DIR = path.join(rootDir, 'data', 'harvest', 'phase54f');
const RESOLUTION_OUTPUT_FILE = path.join(STAGING_DIR, 'duplicate_conflict_resolution.json');
const SECTION_CONTEXTS_FILE = path.join(rootDir, 'data', 'model_part_fitment_section_contexts.json');
const STAGING_ADJUDICATION_FILE = path.join(STAGING_DIR, 'staging_adjudication.json');
const RAW_OBSERVATIONS_FILE = path.join(STAGING_DIR, 'observations.jsonl');

describe('Phase 54F-G — Duplicate & Canonical Section Conflict Resolution Test Suite', () => {
  const resolutionDoc = JSON.parse(fs.readFileSync(RESOLUTION_OUTPUT_FILE, 'utf8'));
  const contextsDoc = JSON.parse(fs.readFileSync(SECTION_CONTEXTS_FILE, 'utf8'));
  const adjudicationDoc = JSON.parse(fs.readFileSync(STAGING_ADJUDICATION_FILE, 'utf8'));

  // A. Target cohort = exact 5 duplicate + 4 conflict = 9 observations
  it('A. Exact Target Cohort Accounting (5 duplicates + 4 conflicts = 9 observations)', () => {
    assert.strictEqual(resolutionDoc.summary.duplicates_total, 5);
    assert.strictEqual(resolutionDoc.summary.conflicts_total, 4);
    assert.strictEqual(resolutionDoc.summary.target_observations_total, 9);
    assert.strictEqual(resolutionDoc.duplicate_ledger.length, 5);
    assert.strictEqual(resolutionDoc.conflict_ledger.length, 4);
    assert.strictEqual(resolutionDoc.summary.resolved_duplicate_observations, 5);
    assert.strictEqual(resolutionDoc.summary.resolved_conflict_observations, 4);
    assert.strictEqual(resolutionDoc.summary.total_resolved_observations, 9);
  });

  // B, C, D. Duplicates: 5/5 matching part + fitment + section, 0 new parts/fitments/contexts, resolved as corroborating
  it('B, C, D. Duplicates Ledger Verification (5/5 Corroborating Duplicates Resolved)', () => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      for (const dup of resolutionDoc.duplicate_ledger) {
        assert.strictEqual(dup.final_status, 'CORROBORATING_DUPLICATE_RESOLVED');
        assert.strictEqual(dup.section_keys_match, true);
        assert.strictEqual(dup.fitment_scope, 'BASE_MODEL_CONFIRMED');
        assert.ok(dup.canonical_fitment_id, `Missing canonical_fitment_id for duplicate ${dup.evidence_id}`);

        // Verify in DB
        const part = db.prepare('SELECT * FROM parts WHERE part_number = ?').get(dup.part_number);
        assert.ok(part, `DB missing part ${dup.part_number}`);

        const fitment = db.prepare('SELECT * FROM model_part_fitments WHERE fitment_id = ?').get(dup.canonical_fitment_id);
        assert.ok(fitment, `DB missing fitment ${dup.canonical_fitment_id}`);
        assert.strictEqual(fitment.canonical_model_id, dup.canonical_model_id);
        assert.strictEqual(fitment.part_number, dup.part_number);
        assert.strictEqual(fitment.section_key, dup.source_section_key);
      }
    } finally {
      db.close();
    }

    assert.strictEqual(resolutionDoc.summary.new_parts, 0);
    assert.strictEqual(resolutionDoc.summary.new_fitments, 0);
    assert.strictEqual(resolutionDoc.resolution_accounting.duplicates_verified_exact, 5);
  });

  // E, F, G. Conflicts: 4/4 matching part + fitment, valid normalized section, resolved via non-lossy section model
  it('E, F, G. Conflicts Ledger Verification (4/4 Additive Section Contexts)', () => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      for (const conf of resolutionDoc.conflict_ledger) {
        assert.strictEqual(conf.final_status, 'SOURCE_OBSERVED_ADDITIONAL_SECTION_CONTEXT');
        assert.strictEqual(conf.fitment_scope, 'BASE_MODEL_CONFIRMED');
        assert.strictEqual(conf.source_scope, 'MODEL_LEVEL_ONLY');
        assert.strictEqual(conf.raw_observation_exists, true);
        assert.strictEqual(conf.section_is_meaningful, true);
        assert.strictEqual(conf.alias_relation, 'DISTINCT_DIAGRAM_PLACEMENT');
        assert.strictEqual(conf.scope_compatible, true);
        assert.ok(conf.source_section_normalized.length > 0);
        assert.ok(conf.existing_fitment_id);

        // Verify in DB
        const fitment = db.prepare('SELECT * FROM model_part_fitments WHERE fitment_id = ?').get(conf.existing_fitment_id);
        assert.ok(fitment);
        assert.strictEqual(fitment.canonical_model_id, conf.canonical_model_id);
        assert.strictEqual(fitment.part_number, conf.part_number);
        // Scalar section must NOT be changed to the conflicting source section
        assert.notStrictEqual(fitment.section_key, conf.source_section_key);
      }
    } finally {
      db.close();
    }

    assert.strictEqual(resolutionDoc.resolution_accounting.conflict_additional_context, 4);
    assert.strictEqual(resolutionDoc.resolution_accounting.conflict_scope_unresolved, 0);
  });

  // H, I, J. Backlog Conservation: 1062 - 9 = 1053, 9 + 1053 = 1062
  it('H, I, J. Backlog Conservation Invariants', () => {
    const br = resolutionDoc.backlog_reconciliation;
    assert.strictEqual(br.active_backlog_before, 1062);
    assert.strictEqual(br.target_observations, 9);
    assert.strictEqual(br.resolved_duplicates, 5);
    assert.strictEqual(br.resolved_conflicts, 4);
    assert.strictEqual(br.total_resolved, 9);
    assert.strictEqual(br.active_backlog_after, 1053);
    assert.strictEqual(br.out_of_scope_backlog, 1053);
    assert.strictEqual(br.conservation_valid, true);

    assert.strictEqual(resolutionDoc.summary.active_backlog_before, 1062);
    assert.strictEqual(resolutionDoc.summary.active_backlog_after, 1053);
    assert.strictEqual(resolutionDoc.summary.out_of_scope_backlog, 1053);

    // Verify out-of-scope adjudication items count exactly 1053
    const inScopeEvidenceIds = new Set([
      ...resolutionDoc.duplicate_ledger.map(d => d.evidence_id),
      ...resolutionDoc.conflict_ledger.map(c => c.evidence_id)
    ]);
    assert.strictEqual(inScopeEvidenceIds.size, 9);
  });

  // K. Scalar sections in model_part_fitments: 0 mutations
  it('K. Scalar Section Immutability Invariant', () => {
    assert.strictEqual(resolutionDoc.summary.scalar_section_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.scalar_section_mutations, 0);

    const db = new Database(DB_PATH, { readonly: true });
    try {
      // Check that existing fitments for the 4 conflicts retain their original scalar section
      const expectedSections = {
        'ev_p54f_fs_400_41287107108_h_clutch_housing': 'Drive Tube Assembly',
        'ev_p54f_ts_350_11064051000_b_cylinder': 'Connector',
        'ev_p54f_br_600_42820212502_cylinder': 'Engine',
        'ev_p54f_br_600_99910035087_fan_housing': 'Engine'
      };

      for (const conf of resolutionDoc.conflict_ledger) {
        const fitment = db.prepare('SELECT * FROM model_part_fitments WHERE fitment_id = ?').get(conf.existing_fitment_id);
        const expectedSection = expectedSections[conf.evidence_id];
        assert.strictEqual(fitment.section_name, expectedSection);
      }
    } finally {
      db.close();
    }
  });

  // L, M, N, Q, R, S. Additive Contexts, 810 -> 814, No Duplicates, Provenance, 810 Preserved
  it('L, M, N, Q, R, S. Additive Section Contexts Invariants (810 -> 814)', () => {
    assert.strictEqual(contextsDoc.record_count, 814);
    assert.strictEqual(contextsDoc.contexts.length, 814);
    assert.strictEqual(resolutionDoc.context_additions.length, 4);
    assert.strictEqual(resolutionDoc.summary.new_conflict_section_contexts, 4);
    assert.strictEqual(resolutionDoc.summary.section_contexts_before, 810);
    assert.strictEqual(resolutionDoc.summary.section_contexts_after, 814);

    // Verify all 814 context IDs are strictly unique
    const contextIds = contextsDoc.contexts.map(c => c.context_id);
    const uniqueIds = new Set(contextIds);
    assert.strictEqual(uniqueIds.size, 814);

    // Verify 810 original contexts preserved
    const phase54fGConflictEvidenceIds = new Set(resolutionDoc.conflict_ledger.map(c => c.evidence_id));
    const originalContexts = contextsDoc.contexts.filter(c => !phase54fGConflictEvidenceIds.has(c.source_evidence_id));
    assert.strictEqual(originalContexts.length, 810);

    // Verify 4 added contexts have complete provenance
    const addedContexts = contextsDoc.contexts.filter(c => phase54fGConflictEvidenceIds.has(c.source_evidence_id));
    assert.strictEqual(addedContexts.length, 4);

    for (const ctx of addedContexts) {
      assert.strictEqual(ctx.section_context_status, 'SOURCE_OBSERVED_ADDITIONAL_CONTEXT');
      assert.strictEqual(ctx.fitment_scope, 'BASE_MODEL_CONFIRMED');
      assert.strictEqual(ctx.variant_key, 'base');
      assert.strictEqual(ctx.configuration_key, null);
      assert.ok(ctx.provenance_hash && ctx.provenance_hash.length === 64);
      assert.ok(ctx.source_url && ctx.source_url.startsWith('https://'));
      assert.strictEqual(ctx.source_scope, 'MODEL_LEVEL_ONLY');
    }
  });

  // O, P, T. Zero Variant/Config Leakage, Zero Network Requests
  it('O, P, T. Zero Leakage & Zero Network Requests', () => {
    assert.strictEqual(resolutionDoc.summary.variant_leakage, 0);
    assert.strictEqual(resolutionDoc.summary.configuration_leakage, 0);
    assert.strictEqual(resolutionDoc.summary.false_resolutions, 0);
    assert.strictEqual(resolutionDoc.summary.external_network_requests, 0);

    assert.strictEqual(resolutionDoc.protection_checks.phase54f_a_accepted_set_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.phase54f_c_research_ledger_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.phase54f_c_cache_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.phase54f_d_existing_context_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.phase54f_e_scope_ledger_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.phase54f_f_research_ledger_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.out_of_scope_mutations, 0);
    assert.strictEqual(resolutionDoc.protection_checks.raw_observation_deletions, 0);
  });

  // Catalog Database Verification
  it('Catalog Counts: PARTS=17082, FITMENTS=175106, CONFIGS=766, EVIDENCE=208412, CONTEXTS=814', () => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const partsCount = db.prepare('SELECT count(*) as c FROM parts').get().c;
      const fitmentsCount = db.prepare('SELECT count(*) as c FROM model_part_fitments').get().c;
      const configsCount = db.prepare('SELECT count(*) as c FROM parts_model_configurations').get().c;
      const evidenceCount = db.prepare('SELECT count(*) as c FROM part_fitment_evidence').get().c;
      const contextsDbCount = db.prepare('SELECT count(*) as c FROM model_part_fitment_section_contexts').get().c;

      assert.strictEqual(partsCount, 17082);
      assert.strictEqual(fitmentsCount, 175106);
      assert.strictEqual(configsCount, 766);
      assert.strictEqual(evidenceCount, 208412);
      assert.strictEqual(contextsDbCount, 814);
    } finally {
      db.close();
    }
  });

  // U. Idempotency Verification
  it('U. Idempotency (Rerun Yields Identical Output & 0 Diff)', () => {
    const rerun = runDuplicateConflictResolution({ dryRun: true });
    const preDoc = JSON.parse(fs.readFileSync(RESOLUTION_OUTPUT_FILE, 'utf8'));

    preDoc.generated_at = 'TIMESTAMP_NEUTRAL';
    rerun.generated_at = 'TIMESTAMP_NEUTRAL';

    assert.strictEqual(JSON.stringify(preDoc), JSON.stringify(rerun));
  });
});
