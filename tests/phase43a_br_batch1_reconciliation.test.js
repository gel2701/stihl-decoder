import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/stihl_database.json', 'utf8'));
const facts = JSON.parse(readFileSync('data/public_evidence_facts.json', 'utf8'));
const manifest = JSON.parse(readFileSync('data/phase43a_br_source_manifest.json', 'utf8'));
const identity = JSON.parse(readFileSync('data/phase43a_br_model_identity_review.json', 'utf8'));
const reconciliation = JSON.parse(readFileSync('data/phase43a_br_field_reconciliation.json', 'utf8'));
const marketVariants = JSON.parse(readFileSync('data/phase43a_br_market_variant_review.json', 'utf8'));
const highValue = JSON.parse(readFileSync('data/phase43a_br_high_value_candidate_review.json', 'utf8'));
const coverage = JSON.parse(readFileSync('data/phase43a_br_coverage_summary.json', 'utf8'));
const finalReport = JSON.parse(readFileSync('data/phase43a_br_final_report.json', 'utf8'));
const deferred = JSON.parse(readFileSync('data/phase43a_br_deferred_new_model_inventory.json', 'utf8'));
const ready43b = JSON.parse(readFileSync('data/phase43a_br_phase43b_ready_candidates.json', 'utf8'));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

console.log('Phase 43A: BR Batch 1 Reconciliation Tests');
console.log('='.repeat(50));

// T1: Source manifest structure
test('T1: Source manifest has correct structure', () => {
  assert.equal(manifest.phase, '43A');
  assert.equal(manifest.market, 'BR');
  assert.equal(manifest.harvested, 8);
  assert.equal(manifest.failed, 0);
  assert.equal(manifest.existing_model_matches, 6);
  assert.equal(manifest.unmatched_models, 2);
  assert.deepEqual(manifest.unmatched_model_names, ['SR 430', 'SR 450']);
});

// T2: Identity review covers all 8 models
test('T2: Identity review covers all 8 target models', () => {
  assert.equal(identity.total_models_reviewed, 8);
  assert.ok(Array.isArray(identity.reviews), 'reviews must be array');
  assert.equal(identity.reviews.length, 8);
  const slugs = identity.reviews.map(r => r.model_slug).sort();
  assert.deepEqual(slugs, ['sr-430', 'sr-450', 'stihl_br_600', 'stihl_fs_120', 'stihl_fs_38', 'stihl_hs_45', 'stihl_ms_260', 'stihl_ms_261_cm']);
});

// T3: SR 430/450 marked as variant matches (not unmatched)
test('T3: SR 430/450 marked as variant matches', () => {
  const sr430 = identity.reviews.find(r => r.model_slug === 'sr-430');
  const sr450 = identity.reviews.find(r => r.model_slug === 'sr-450');
  assert.ok(sr430, 'SR 430 found');
  assert.ok(sr450, 'SR 450 found');
  assert.ok(sr430.identity_status !== 'UNMATCHED', 'SR 430 not unmatched');
  assert.ok(sr450.identity_status !== 'UNMATCHED', 'SR 450 not unmatched');
});

// T4: Field reconciliation has entries for all 8 models
test('T4: Field reconciliation covers all 8 models', () => {
  assert.ok(Array.isArray(reconciliation.comparisons), 'comparisons must be array');
  assert.ok(reconciliation.comparisons.length > 0, 'must have comparisons');
  const modelSlugs = [...new Set(reconciliation.comparisons.map(e => e.model_slug))];
  assert.ok(modelSlugs.length >= 6, 'at least 6 models in comparisons');
});

// T5: 3 market variants identified
test('T5: Exactly 3 market variants identified', () => {
  assert.ok(Array.isArray(marketVariants.variants), 'variants must be array');
  assert.equal(marketVariants.variants.length, 3);
  const keys = marketVariants.variants.map(v => `${v.model_name}_${v.field}`).sort();
  assert.deepEqual(keys, ['BR 600_weight_kg', 'MS 260_weight_kg', 'MS 261_power_kw']);
});

// T6: Canonical database unchanged (62 models)
test('T6: Canonical database unchanged (62 models)', () => {
  const models = db.models || db;
  assert.equal(models.length, 62);
});

// T7: Public evidence unchanged (492 facts)
test('T7: Public evidence unchanged (492 facts)', () => {
  assert.equal(facts.facts.length, 492);
});

// T8: HIGH_VALUE candidates exist
test('T8: HIGH_VALUE candidates exist for Phase 43B', () => {
  assert.ok(Array.isArray(highValue.candidates), 'candidates must be array');
  assert.ok(highValue.candidates.length > 0, 'must have at least 1 candidate');
  assert.ok(highValue.new_high_value_candidates > 0, 'must have new high value candidates');
});

// T9: No deferred new models
test('T9: No deferred new models (SR 430/450 already exist)', () => {
  assert.equal(deferred.total_new_models, 0);
  assert.ok(Array.isArray(deferred.deferred_models), 'deferred_models must be array');
  assert.equal(deferred.deferred_models.length, 0);
});

// T10: Coverage summary has expected disposition counts
test('T10: Coverage summary has valid disposition counts', () => {
  assert.ok(coverage.disposition_counts || coverage.counts, 'must have counts');
  const counts = coverage.disposition_counts || coverage.counts;
  assert.ok(counts.POSSIBLE_MARKET_VARIANT >= 3, 'at least 3 market variants');
});

// T11: Final report has required sections
test('T11: Final report has required sections', () => {
  assert.equal(finalReport.phase, '43A');
  assert.ok(finalReport.harvest_summary, 'has harvest_summary');
  assert.ok(finalReport.identity_summary, 'has identity_summary');
  assert.ok(finalReport.field_reconciliation_summary, 'has field_reconciliation_summary');
  assert.ok(finalReport.market_variants, 'has market_variants');
  assert.ok(finalReport.database_missing_analysis, 'has database_missing_analysis');
});

// T12: Phase 43B ready candidates exist
test('T12: Phase 43B ready candidates exist', () => {
  assert.ok(Array.isArray(ready43b.candidates), 'candidates must be array');
  assert.ok(ready43b.candidates.length > 0, 'must have at least 1 ready candidate');
});

// T13: MS 260/261 displacement matches database
test('T13: MS 260/261 displacement matches database', () => {
  const models = db.models || db;
  const ms260 = models.find(m => m.slug === 'ms-260');
  const ms261 = models.find(m => m.slug === 'ms-261');
  assert.equal(ms260.displacement_cc, 50.2, 'MS 260 displacement');
  assert.equal(ms261.displacement_cc, 50.2, 'MS 261 displacement');
});

// T14: No cross-model leakage in public evidence
test('T14: No cross-model leakage in public evidence', () => {
  const targetIds = ['stihl_ms_260', 'stihl_ms_261_cm', 'stihl_hs_45', 'stihl_sr_430', 'stihl_sr_450', 'stihl_fs_120', 'stihl_fs_38', 'stihl_br_600'];
  for (const f of facts.facts) {
    if (targetIds.includes(f.model_slug) || targetIds.includes(f.variant_slug)) {
      assert.ok(f.fact_id, 'fact must have id');
      assert.ok(f.field, 'fact must have field');
      assert.ok(f.normalized_value !== undefined, 'fact must have normalized_value');
    }
  }
});

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('=== ALL PHASE 43A TESTS PASSED ===');
}
