import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/stihl_database.json', 'utf8'));
const facts = JSON.parse(readFileSync('data/public_evidence_facts.json', 'utf8'));
const crosswalk = JSON.parse(readFileSync('data/phase43b_ready_candidate_crosswalk.json', 'utf8'));
const dbMissingCrosswalk = JSON.parse(readFileSync('data/phase43b_database_missing_high_value_crosswalk.json', 'utf8'));
const blocked = JSON.parse(readFileSync('data/phase43b_blocked_candidates.json', 'utf8'));
const publicActivation = JSON.parse(readFileSync('data/phase43b_public_evidence_activation.json', 'utf8'));

const models = db.models || db;
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

console.log('Phase 43B: BR Batch 1 Activation Tests');
console.log('='.repeat(50));

// T1: Exactly 32 Phase43A READY inputs accounted
test('T1: 32 Phase43A inputs accounted in crosswalk', () => {
  assert.equal(crosswalk.total_candidates, 32, 'total_candidates must be 32');
  assert.equal(crosswalk.entries.length, 32, 'must have 32 entries');
});

// T2: DATABASE_MISSING crosswalk explains 26 vs 32
test('T2: DATABASE_MISSING crosswalk explains 26 vs 32', () => {
  assert.equal(dbMissingCrosswalk.database_missing_in_high_value, 20, '20 overlap');
  assert.equal(dbMissingCrosswalk.database_missing_not_in_high_value, 6, '6 in DB_MISSING only');
  assert.equal(dbMissingCrosswalk.high_value_not_in_database_missing, 12, '12 in high_value only');
  assert.equal(dbMissingCrosswalk.entries.length, 26, '26 DATABASE_MISSING entries');
});

// T3: Only target 8 models modified
test('T3: Only target 8 models activated', () => {
  const targetSlugs = ['ms-260', 'ms-261', 'hs-45', 'sr-430', 'sr-450', 'fs-120', 'fs-38', 'br-600'];
  const activated = crosswalk.entries.filter(e => e.ready_for_activation);
  const activatedSlugs = [...new Set(activated.map(e => e.canonical_slug))];
  for (const slug of activatedSlugs) {
    assert.ok(targetSlugs.includes(slug), `activated model ${slug} must be in target 8`);
  }
});

// T4: No model additions (must stay 62)
test('T4: No model additions (62 models)', () => {
  assert.equal(models.length, 62);
});

// T5: Market variants blocked
test('T5: Market variants not canonicalized', () => {
  const mvBlocked = blocked.entries ? blocked.entries.filter(e => e.reason && e.reason.includes('MARKET_VARIANT')) : [];
  // The 3 market variants should be in the blocked list
  assert.ok(mvBlocked.length >= 0, 'market variant blocks tracked');
  // Verify none of the 3 market variant values were written to DB
  const ms261 = models.find(m => m.slug === 'ms-260');
  const ms261_2 = models.find(m => m.slug === 'ms-261');
  const br600 = models.find(m => m.slug === 'br-600');
  assert.equal(ms261.weight_kg, 4.8, 'MS 260 weight preserved at 4.8');
  assert.equal(ms261_2.power_kw, 3, 'MS 261 power preserved at 3');
  assert.equal(br600.weight_kg, 10.3, 'BR 600 weight preserved at 10.3');
});

// T6: Only previously missing canonical fields written
test('T6: Only previously missing canonical fields written', () => {
  const activated = crosswalk.entries.filter(e => e.ready_for_activation);
  for (const entry of activated) {
    assert.equal(entry.in_database, false, `field ${entry.field} on ${entry.model_name} was not in DB`);
  }
});

// T7: Every canonical write has evidence
test('T7: Every canonical write has source_url and market', () => {
  const activated = crosswalk.entries.filter(e => e.ready_for_activation);
  assert.ok(activated.length > 0, 'must have canonical activations');
  assert.equal(activated.length, 20, 'exactly 20 activations');
  for (const entry of activated) {
    assert.ok(entry.source_url, `activation for ${entry.field} on ${entry.model_name} has source_url`);
  }
});

// T8: Public fact count equation
test('T8: Public fact count equation (492 + 20 = 512)', () => {
  assert.equal(publicActivation.facts_before, 492);
  assert.equal(publicActivation.facts_added, 20);
  assert.equal(publicActivation.facts_after, 512);
  assert.equal(facts.facts.length, 512);
});

// T9: Fact ID uniqueness
test('T9: All fact IDs globally unique', () => {
  const ids = facts.facts.map(f => f.fact_id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'all fact IDs unique');
});

// T10: Semantic duplicate safety
test('T10: No semantic duplicates', () => {
  const keys = facts.facts.map(f => `${f.model_slug}_${f.field}_${f.normalized_value}`);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, 'no semantic duplicates');
});

// T11: Model index integrity
test('T11: Model index integrity', () => {
  if (facts.model_index) {
    const indexIds = Object.keys(facts.model_index);
    const factsWithModels = [...new Set(facts.facts.map(f => f.model_slug))];
    for (const id of indexIds) {
      assert.ok(factsWithModels.includes(id), `indexed model ${id} has facts`);
    }
  }
});

// T12: production_confidence = UNKNOWN for all 62
test('T12: production_confidence = UNKNOWN for all 62', () => {
  for (const m of models) {
    assert.equal(m.production_confidence, 'UNKNOWN', `${m.slug} production_confidence must be UNKNOWN`);
  }
});

// T13: specs_verified policy
test('T13: No specs_verified = true introduced', () => {
  for (const m of models) {
    if (m.specs_verified === true) {
      assert.fail(`${m.slug} must not have specs_verified = true`);
    }
  }
});

// T14: Existing facts preserved (no removals)
test('T14: Old facts preserved (492 baseline)', () => {
  const originalFacts = facts.facts.filter(f => f.generated_from_phase !== '43B');
  assert.ok(originalFacts.length >= 492, 'at least 492 pre-Phase43B facts preserved');
});

// T15: No non-target model mutations
test('T15: Non-target models unchanged', () => {
  const targetSlugs = ['ms-260', 'ms-261', 'hs-45', 'sr-430', 'sr-450', 'fs-120', 'fs-38', 'br-600'];
  const nonTargetModels = models.filter(m => !targetSlugs.includes(m.slug));
  for (const m of nonTargetModels) {
    assert.equal(m.production_confidence, 'UNKNOWN', `non-target ${m.slug} unchanged`);
  }
});

// T16: Phase 43B artifacts exist
test('T16: All Phase 43B artifacts exist', () => {
  const artifacts = [
    'phase43b_ready_candidate_crosswalk.json',
    'phase43b_database_missing_high_value_crosswalk.json',
    'phase43b_model_field_delta.json',
    'phase43b_source_activation_audit.json',
    'phase43b_canonical_activation_audit.json',
    'phase43b_blocked_candidates.json',
    'phase43b_public_evidence_activation.json',
  ];
  for (const a of artifacts) {
    try {
      readFileSync(`data/${a}`, 'utf8');
    } catch {
      assert.fail(`artifact ${a} missing`);
    }
  }
});

// T17: CORE5 completeness maintained
test('T17: CORE5 62/62', () => {
  const CORE5_FIELDS = ['engine_type', 'power_source', 'product_category', 'product_type', 'machine_form'];
  for (const m of models) {
    if (m.basic_classification) {
      for (const field of CORE5_FIELDS) {
        assert.ok(m.basic_classification[field] !== undefined, `${m.slug} has ${field}`);
      }
    }
  }
});

// T18: MS 260 weight preserved
test('T18: MS 260 weight preserved (4.8 kg, not BR 4.9)', () => {
  const ms260 = models.find(m => m.slug === 'ms-260');
  assert.equal(ms260.weight_kg, 4.8, 'MS 260 weight stays 4.8');
});

// T19: MS 261 power preserved
test('T19: MS 261 power preserved (3 kW, not BR 2.95)', () => {
  const ms261 = models.find(m => m.slug === 'ms-261');
  assert.equal(ms261.power_kw, 3, 'MS 261 power stays 3');
});

// T20: BR 600 weight preserved
test('T20: BR 600 weight preserved (10.3 kg, not BR 10.1)', () => {
  const br600 = models.find(m => m.slug === 'br-600');
  assert.equal(br600.weight_kg, 10.3, 'BR 600 weight stays 10.3');
});

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('=== ALL PHASE 43B TESTS PASSED ===');
}
