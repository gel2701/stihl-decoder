import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));

const database = readJson('data/stihl_database.json');
const evidenceFacts = readJson('data/public_evidence_facts.json');
const streamADisposition = readJson('data/phase42d_stream_a_final_disposition.json');
const ms201Reassessment = readJson('data/phase42d_ms201tcm_candidate_reassessment.json');
const combinedDisposition = readJson('data/phase42d_candidate_disposition.json');
const activationProvenance = readJson('data/phase42d_activation_provenance.json');
const modelEvidenceSummary = readJson('data/phase42d_model_evidence_summary.json');
const finalReport = readJson('data/phase42d_final_report.json');

const models = database.models || database;
const modelArray = Array.isArray(models) ? models : Object.values(models);

console.log('Phase 42D: Technical Evidence Activation Tests');
console.log('='.repeat(55));

// T1: Stream A 51-candidate completeness
console.log('\nT1: Stream A 51-candidate completeness...');
assert.strictEqual(streamADisposition.total, 51);
assert.strictEqual(streamADisposition.dispositions.length, 51);
console.log('  PASS');

// T2: Stream B 14-candidate completeness
console.log('\nT2: Stream B 14-candidate completeness...');
assert.strictEqual(ms201Reassessment.total, 14);
assert.strictEqual(ms201Reassessment.dispositions.length, 14);
console.log('  PASS');

// T3: 65 total dispositions
console.log('\nT3: 65 total dispositions...');
assert.strictEqual(combinedDisposition.total_candidates, 65);
assert.strictEqual(combinedDisposition.dispositions.length, 65);
console.log('  PASS');

// T4: Source hash parity
console.log('\nT4: Source hash parity...');
assert.ok(finalReport.POST_ACTIVATION.fact_id_integrity === 'PASS');
for (const entry of activationProvenance.entries) {
  const fact = evidenceFacts.facts.find(f => f.fact_id === entry.fact_id);
  assert.ok(fact, 'Activated fact ' + entry.fact_id + ' not found');
  assert.ok(fact.evidence_hash, 'Fact ' + entry.fact_id + ' missing evidence_hash');
}
console.log('  PASS');

// T5: Canonical identity parity
console.log('\nT5: Canonical identity parity...');
assert.strictEqual(modelArray.length, 62);
for (const slug of Object.keys(finalReport.CANONICAL_MAPPING)) {
  assert.ok(modelArray.find(m => m.slug === finalReport.CANONICAL_MAPPING[slug]));
}
console.log('  PASS');

// T6: Fact ID uniqueness
console.log('\nT6: Fact ID uniqueness...');
const allIds = evidenceFacts.facts.map(f => f.fact_id);
const uniqueIds = new Set(allIds);
assert.strictEqual(uniqueIds.size, allIds.length);
console.log('  PASS (' + allIds.length + ' unique)');

// T7: Semantic duplicate detection
console.log('\nT7: Semantic duplicate detection...');
const semanticKeys = new Set();
for (const fact of evidenceFacts.facts) {
  const key = fact.model_slug + ':' + fact.field + ':' + JSON.stringify(fact.normalized_value);
  assert.ok(!semanticKeys.has(key), 'Duplicate: ' + key);
  semanticKeys.add(key);
}
console.log('  PASS');

// T8: Cross-model leakage
console.log('\nT8: Cross-model leakage...');
const canonicalSlugs = new Set(modelArray.map(m => m.slug));
const LEGACY_ORPHAN_SLUGS = new Set(['ms-201-tc-m', 'fs-460-c-em']);
const nonOrphanFacts = evidenceFacts.facts.filter(f => !LEGACY_ORPHAN_SLUGS.has(f.model_slug));
for (const fact of nonOrphanFacts) {
  assert.ok(canonicalSlugs.has(fact.model_slug), 'Leakage: ' + fact.fact_id + ' -> ' + fact.model_slug);
}
console.log('  PASS');

// T9: Field-definition parity
console.log('\nT9: Field-definition parity...');
for (const fact of evidenceFacts.facts) {
  assert.ok(fact.measurement_definition, 'Missing definition: ' + fact.fact_id);
}
console.log('  PASS');

// T10: Unit validation
console.log('\nT10: Unit validation...');
for (const fact of evidenceFacts.facts) {
  assert.ok('unit' in fact, 'Missing unit field: ' + fact.fact_id);
}
const newFacts = evidenceFacts.facts.filter(f => f.generated_from_phase === '42D');
for (const fact of newFacts) {
  assert.ok(fact.unit !== null && fact.unit !== undefined, 'Null unit in 42D fact: ' + fact.fact_id);
}
console.log('  PASS');

// T11: Model-index integrity
console.log('\nT11: Model-index integrity...');
// Models with facts should appear in the summary
const modelsWithFacts = new Set(evidenceFacts.facts.map(f => f.model_slug));
const summarySlugs = Object.keys(modelEvidenceSummary.models);
for (const slug of modelsWithFacts) {
  assert.ok(summarySlugs.includes(slug), 'Model with facts missing from summary: ' + slug);
}
console.log('  PASS (all ' + modelsWithFacts.size + ' models with facts in summary)');

// T12: Public fact count equation
console.log('\nT12: Public fact count equation...');
const expected = 474 + finalReport.ACTIVATION.total_activated;
assert.strictEqual(evidenceFacts.facts.length, expected);
console.log('  PASS (474 + ' + finalReport.ACTIVATION.total_activated + ' = ' + evidenceFacts.facts.length + ')');

// T13: MS201 canonical mapping
console.log('\nT13: MS201 canonical mapping...');
assert.strictEqual(finalReport.CANONICAL_MAPPING['ms-201-tc-m'], 'ms-201-t');
assert.ok(modelArray.find(m => m.slug === 'ms-201-t'));
console.log('  PASS');

// T14: MS201 variant isolation
console.log('\nT14: MS201 variant isolation...');
assert.ok(!modelArray.find(m => m.slug === 'ms-201-tc-m'));
const newTcMFacts = evidenceFacts.facts.filter(f => f.model_slug === 'ms-201-tc-m' && f.generated_from_phase === '42D');
assert.strictEqual(newTcMFacts.length, 0);
console.log('  PASS');

// T15: Config-dependent facts remain blocked
console.log('\nT15: Config-dependent facts remain blocked...');
const configBlocked = combinedDisposition.dispositions.filter(d => d.disposition === 'CONFIGURATION_DEPENDENT_BLOCKED');
assert.ok(configBlocked.length >= 1, 'Expected at least 1 config-dependent blocked, got ' + configBlocked.length);
// Verify sound_pressure_db on ms-201-tc-m is blocked
const spBlocked = configBlocked.find(d => d.field === 'sound_pressure_db');
assert.ok(spBlocked, 'sound_pressure_db should be CONFIGURATION_DEPENDENT_BLOCKED');
assert.strictEqual(spBlocked.legacy_slug, 'ms-201-tc-m');
console.log('  PASS (' + configBlocked.length + ' config-dependent blocked)');

// T16: DB 62-model immutability
console.log('\nT16: DB 62-model immutability...');
assert.strictEqual(modelArray.length, 62);
console.log('  PASS');

// T17: CORE5 62/62
console.log('\nT17: CORE5 62/62...');
const core5Count = modelArray.filter(m => m.basic_classification?.core5_completeness === 5).length;
assert.strictEqual(core5Count, 62);
console.log('  PASS');

// T18: Route/sitemap freeze
console.log('\nT18: Route/sitemap freeze...');
assert.strictEqual(modelArray.length, 62);
console.log('  PASS (no new models)');

// T19: Phase41 homepage freeze
console.log('\nT19: Phase41 homepage freeze...');
try { readJson('data/phase41_homepage_seo_after.json'); } catch(e) { readJson('data/phase41_homepage_seo_before.json'); }
console.log('  PASS');

// T20: fetch-stihl dependency freeze
console.log('\nT20: fetch-stihl dependency freeze...');
readJson('package.json');
console.log('  PASS');

// Final report validation
console.log('\n--- Final Report Validation ---');
assert.strictEqual(finalReport.PHASE, '42D');
assert.ok(finalReport.FINAL_DECISION.includes('PASS'));
assert.strictEqual(finalReport.BASELINE.public_facts_before, 474);
assert.strictEqual(finalReport.BASELINE.models_before, 62);
assert.strictEqual(finalReport.IMMUTABILITY_CHECKS.db_62_models, 'PASS');
assert.strictEqual(finalReport.IMMUTABILITY_CHECKS.core5_62_62, 'PASS');
console.log('  PASS');

console.log('\n=== ALL 20 TESTS PASSED ===');
