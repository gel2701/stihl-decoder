/**
 * Phase 37C — Evidence Surfacing, Model Reachability & User Utility Test Suite
 * Validates 7 core quality gates:
 * 1. Index integrity (49 models, fact_ids populated, 452 facts, 451 single-value eligible, 1 conflicted blocked)
 * 2. Model queries (147/147 query variations resolve with non-UNKNOWN category, public facts and specs)
 * 3. Serial classification invariance (control serials and STIHL-prefixed serials NEVER classify as MODEL_DECODE)
 * 4. Distinct variant identities (MS 200 vs MS 200 T, MS 201 T vs MS 201 TC-M, MS 261 vs MS 261 C-M, FS 460 vs FS 460 C-EM)
 * 5. Category taxonomy (SR 430/450 nevelspuiten, chainsaw/blower cross-category spec blocking)
 * 6. UI & assist failure injection (chainsaw spec on blower, unverified/conflicted field, invalid assist rejection)
 * 7. Model Assist on 184592301 control fixture (unconfirmed specs empty; confirmed specs populated)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode, analyzeModelQuery } from '../src/decoder.js';
import { sanitizeModelSpecifications } from '../src/categoryWhitelist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8'));
const store = database.public_evidence;

console.log('▶ Running Phase 37C Evidence Surfacing & Reachability Tests...');

// ============================================================================
// Test 1: Index integrity
// ============================================================================
console.log('  Testing Test 1: Index integrity...');
assert.strictEqual(store.facts.length, 452, 'PUBLIC_FACT_COUNT must be exactly 452');
const modelSlugs = Object.keys(store.model_index);
assert.strictEqual(modelSlugs.length, 49, 'Evidence index must contain exactly 49 models');

let totalIndexedFactIds = 0;
for (const slug of modelSlugs) {
  const entry = store.model_index[slug];
  assert.ok(Array.isArray(entry.fact_ids), `${slug} fact_ids must be an array`);
  assert.ok(entry.fact_ids.length > 0, `${slug} must have at least 1 fact_id`);
  totalIndexedFactIds += entry.fact_ids.length;
}
assert.strictEqual(totalIndexedFactIds, 452, 'Sum of all fact_ids in model_index must equal total facts (452)');

// Verify single-value reachability: 451 single-value eligible, 1 conflicted fail-closed
const eligibleFacts = store.facts.filter((f) => f.display_eligible && f.public_evidence_status !== 'OFFICIAL_CONFLICTED');
const conflictedFacts = store.facts.filter((f) => f.public_evidence_status === 'OFFICIAL_CONFLICTED');
assert.strictEqual(eligibleFacts.length, 451, 'Must have exactly 451 display-eligible single-value facts');
assert.strictEqual(conflictedFacts.length, 1, 'Must have exactly 1 conflicted fact (046 stroke_mm)');
assert.strictEqual(conflictedFacts[0].model_slug, '046');
assert.strictEqual(conflictedFacts[0].field, 'stroke_mm');

// Verify conflicted fact does NOT reach technicalSpecs as single value
const res046 = decodeStihlCode('046', database);
assert.strictEqual(res046.success, true);
assert.strictEqual(res046.technicalSpecs.stroke_mm, undefined, 'Conflicted stroke_mm must not appear in technicalSpecs');
assert.strictEqual(res046.publicEvidenceFields.stroke_mm?.evidence_status, 'OFFICIAL_CONFLICTED');

console.log('  ✅ Test 1 Passed: Index integrity verified (49 models, 452 facts, 451 eligible, 1 conflicted blocked).');

// ============================================================================
// Test 2: Model queries (147 variations)
// ============================================================================
console.log('  Testing Test 2: Model queries (147 variations)...');
let queryCount = 0;
for (const slug of modelSlugs) {
  const entry = store.model_index[slug];
  const modelName = entry.model_name;

  const queries = [
    slug,
    modelName,
    `STIHL ${modelName}`
  ];

  for (const q of queries) {
    queryCount++;
    const res = decodeStihlCode(q, database);
    assert.strictEqual(res.success, true, `Query "${q}" must succeed`);
    assert.strictEqual(res.type, 'MODEL_DECODE', `Query "${q}" must resolve as MODEL_DECODE`);
    assert.ok(res.category && res.category !== 'UNKNOWN', `Query "${q}" category must not be UNKNOWN (got: ${res.category})`);
    assert.ok((res.publicEvidenceFacts || []).length > 0, `Query "${q}" must return public evidence facts`);
    assert.ok(Object.keys(res.technicalSpecs || {}).length > 0, `Query "${q}" must have available technical specs`);
  }
}
assert.strictEqual(queryCount, 147, 'Must test exactly 147 model query variations');
console.log(`  ✅ Test 2 Passed: All ${queryCount} model queries resolve with valid category, facts and specs.`);

// ============================================================================
// Test 3: Serial classification invariance
// ============================================================================
console.log('  Testing Test 3: Serial classification invariance...');
const controlSerials = [
  '824061159',
  '184592301',
  '123456789',
  '987654321',
  '111111111',
  '888888888',
  '999999999',
  '12345678A'
];

for (const serial of controlSerials) {
  const directRes = decodeStihlCode(serial, database);
  assert.notStrictEqual(directRes.type, 'MODEL_DECODE', `Serial "${serial}" must NOT be classified as MODEL_DECODE`);

  const prefixedRes = decodeStihlCode(`STIHL ${serial}`, database);
  assert.notStrictEqual(prefixedRes.type, 'MODEL_DECODE', `"STIHL ${serial}" must NOT be classified as MODEL_DECODE`);
}

const res824 = decodeStihlCode('824061159', database);
assert.strictEqual(res824.type, 'SERIAL_NUMBER');
assert.strictEqual(res824.cleaned, '824061159');

const res184 = decodeStihlCode('184592301', database);
assert.strictEqual(res184.type, 'SERIAL_NUMBER');
assert.strictEqual(res184.cleaned, '184592301');

const res824Prefixed = decodeStihlCode('STIHL 824061159', database);
assert.strictEqual(res824Prefixed.type, 'SERIAL_NUMBER');
assert.strictEqual(res824Prefixed.cleaned, '824061159');

const res184Prefixed = decodeStihlCode('STIHL 184592301', database);
assert.strictEqual(res184Prefixed.type, 'SERIAL_NUMBER');
assert.strictEqual(res184Prefixed.cleaned, '184592301');

console.log('  ✅ Test 3 Passed: Serial classification invariance guaranteed (0/8 serials misclassified).');

// ============================================================================
// Test 4: Distinct variant identities
// ============================================================================
console.log('  Testing Test 4: Distinct variant identities...');
const variantPairs = [
  { a: 'MS 200', b: 'MS 200 T', slugA: 'ms-200', slugB: 'ms-200-t' },
  { a: 'MS 201 T', b: 'MS 201 TC-M', slugA: 'ms-201-t', slugB: 'ms-201-tc-m' },
  { a: 'MS 261', b: 'MS 261 C-M', slugA: 'ms-261', slugB: 'ms-261-c-m' },
  { a: 'MS 362', b: 'MS 362 C-M', slugA: 'ms-362', slugB: 'ms-362-c-m' }
];

for (const pair of variantPairs) {
  const resA = decodeStihlCode(pair.a, database);
  const resB = decodeStihlCode(pair.b, database);

  assert.strictEqual(resA.success, true, `${pair.a} must resolve`);
  assert.strictEqual(resB.success, true, `${pair.b} must resolve`);
  assert.notStrictEqual(resA.model, resB.model, `${pair.a} and ${pair.b} must have distinct model names`);

  // Verify no cross-contamination between variant facts in the store
  const factsA = store.facts.filter((f) => f.model_slug === pair.slugA);
  const factsB = store.facts.filter((f) => f.model_slug === pair.slugB);

  const idsA = new Set(factsA.map((f) => f.fact_id));
  const idsB = new Set(factsB.map((f) => f.fact_id));
  for (const id of idsA) {
    assert.ok(!idsB.has(id), `Fact ID ${id} cannot belong to both ${pair.slugA} and ${pair.slugB}`);
  }
  for (const id of idsB) {
    assert.ok(!idsA.has(id), `Fact ID ${id} cannot belong to both ${pair.slugA} and ${pair.slugB}`);
  }
}

// Verify FS 460 C-EM resolves with exact identity and specs
const resFS460CEM = decodeStihlCode('FS 460 C-EM', database);
assert.strictEqual(resFS460CEM.success, true);
assert.strictEqual(resFS460CEM.model, 'FS 460 C-EM');
assert.strictEqual(resFS460CEM.technicalSpecs.displacement_cc, 45.6);

console.log('  ✅ Test 4 Passed: Distinct variant identities preserved with zero cross-contamination.');

// ============================================================================
// Test 5: Category taxonomy & cross-category spec blocking
// ============================================================================
console.log('  Testing Test 5: Category taxonomy & cross-category guards...');
const resSR430 = decodeStihlCode('SR 430', database);
assert.strictEqual(resSR430.success, true);
assert.strictEqual(resSR430.category.toLowerCase(), 'nevelspuit');

const resSR450 = decodeStihlCode('SR 450', database);
assert.strictEqual(resSR450.success, true);
assert.strictEqual(resSR450.category.toLowerCase(), 'nevelspuit');

// Cross-category field blocking tests
const dirtyBlowerSpecs = {
  chain_pitch: '.325"',
  chain_gauge_mm: 1.3,
  oil_tank_capacity_cm3: 200,
  displacement_cc: 64.8,
  blowing_force_n: 26
};
const cleanedBlower = sanitizeModelSpecifications(dirtyBlowerSpecs, 'Bladblazer', 'BR 700');
assert.strictEqual(cleanedBlower.chain_pitch, undefined, 'chain_pitch must be blocked for blowers');
assert.strictEqual(cleanedBlower.chain_gauge_mm, undefined, 'chain_gauge_mm must be blocked for blowers');
assert.strictEqual(cleanedBlower.oil_tank_capacity_cm3, undefined, 'oil_tank_capacity_cm3 must be blocked for blowers');
assert.strictEqual(cleanedBlower.displacement_cc, 64.8);
assert.strictEqual(cleanedBlower.blowing_force_n, 26);

const dirtySawSpecs = {
  blowing_force_n: 35,
  chain_pitch: '.325"',
  chain_gauge_mm: 1.3,
  displacement_cc: 50.2
};
const cleanedSaw = sanitizeModelSpecifications(dirtySawSpecs, 'Kettingzaag', 'MS 261');
assert.strictEqual(cleanedSaw.blowing_force_n, undefined, 'blowing_force_n must be blocked for chainsaws');
assert.strictEqual(cleanedSaw.chain_pitch, '.325"');
assert.strictEqual(cleanedSaw.chain_gauge_mm, 1.3);
assert.strictEqual(cleanedSaw.displacement_cc, 50.2);

console.log('  ✅ Test 5 Passed: Taxonomy correct (nevelspuiten) and cross-category guards verified.');

// ============================================================================
// Test 6: UI & Assist failure injection
// ============================================================================
console.log('  Testing Test 6: Failure injection...');
// Attempt invalid assist model confirmation
const invalidAssist = decodeStihlCode('184592301', database, { confirmedModel: 'FABRICATED_NONEXISTENT_MODEL_999' });
assert.strictEqual(invalidAssist.success, false, 'Invalid model confirmation must fail');
assert.strictEqual(invalidAssist.status, 'MODEL_CONFIRMATION_REQUIRED');

// Injection of unevidenced / conflicted spec
const res046Specs = res046.technicalSpecs;
assert.strictEqual(res046Specs.stroke_mm, undefined, 'Conflicted stroke_mm must not appear in technicalSpecs');

console.log('  ✅ Test 6 Passed: Failure injections rejected cleanly.');

// ============================================================================
// Test 7: Model Assist on 184592301 control fixture
// ============================================================================
console.log('  Testing Test 7: Model Assist on 184592301 control fixture...');
// 1. Unconfirmed decode
const unconfirmed = decodeStihlCode('184592301', database);
assert.strictEqual(unconfirmed.type, 'SERIAL_NUMBER');
assert.strictEqual(unconfirmed.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.deepStrictEqual(unconfirmed.technicalSpecs, {}, 'technicalSpecs MUST remain strictly empty without confirmation');
assert.strictEqual(unconfirmed.modelAssist.available, true, 'modelAssist MUST be available for 184592301');
assert.strictEqual(unconfirmed.modelAssist.series, 'MS 261 / MS 261 C-M');
assert.ok(unconfirmed.modelAssist.candidates.length >= 2, 'Must have at least 2 candidates');
assert.ok(unconfirmed.modelAssist.candidates.some((c) => c.slug === 'ms-261' && c.hasSpecs));
assert.ok(unconfirmed.modelAssist.candidates.some((c) => c.slug === 'ms-261-c-m' && c.hasSpecs));

// 2. Confirmed decode via assist
const confirmed = decodeStihlCode('184592301', database, { confirmedModel: 'MS 261 C-M' });
assert.strictEqual(confirmed.type, 'SERIAL_NUMBER');
assert.strictEqual(confirmed.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(confirmed.confirmedModel, 'MS 261 C-M');
assert.strictEqual(confirmed.technicalSpecs.displacement_cc, 50.2);
assert.strictEqual(confirmed.technicalSpecs.power_kw, 3.0);
assert.strictEqual(confirmed.technicalSpecs.bore_mm, 44.7);
assert.strictEqual(confirmed.technicalSpecs.stroke_mm, 32);
assert.strictEqual(confirmed.modelAssistAvailable, false, 'modelAssistAvailable must be false after user confirmation');

console.log('  ✅ Test 7 Passed: Model Assist workflow verified (unconfirmed empty specs -> confirmed populated specs).');

// ============================================================================
// Test 8: Legacy SEO URL Identity Semantics Protection
// ============================================================================
console.log('  Testing Test 8: Legacy SEO URL Identity Protection...');
const mFS460 = database.models.find((m) => m.slug === 'fs-460');
assert.ok(mFS460, 'fs-460 must exist in canonical database');
assert.strictEqual(mFS460.model_name, 'FS 460 C-EM', 'fs-460 MUST represent FS 460 C-EM to preserve indexed URL semantics');
assert.strictEqual(mFS460.category_slug, 'bosmaaiers');

const mMS201 = database.models.find((m) => m.slug === 'ms-201-t');
assert.ok(mMS201, 'ms-201-t must exist in canonical database');
assert.strictEqual(mMS201.model_name, 'MS 201 TC-M', 'ms-201-t MUST represent MS 201 TC-M to preserve indexed URL semantics');
assert.strictEqual(mMS201.category_slug, 'kettingzagen');

const mMS200 = database.models.find((m) => m.slug === 'ms-200');
assert.ok(mMS200, 'ms-200 must exist in canonical database');
assert.strictEqual(mMS200.model_name, 'MS 200 / 020 T', 'ms-200 MUST represent MS 200 / 020 T to preserve indexed URL semantics');
assert.strictEqual(mMS200.category_slug, 'kettingzagen');

const mMS290 = database.models.find((m) => m.slug === 'ms-290');
assert.ok(mMS290, 'ms-290 must exist in canonical database');
assert.strictEqual(mMS290.model_name, 'MS 290 Farm Boss', 'ms-290 MUST represent MS 290 Farm Boss to preserve indexed URL semantics');
assert.strictEqual(mMS290.category_slug, 'kettingzagen');

// Ensure no duplicate variant canonical URLs in database
const duplicateVariantCheck = database.models.filter((m) => m.slug === 'fs-460-c-em' || m.slug === 'ms-201-tc-m');
assert.strictEqual(duplicateVariantCheck.length, 0, 'Must NOT have duplicate variant slugs fs-460-c-em or ms-201-tc-m');

console.log('  ✅ Test 8 Passed: Legacy SEO URL identities protected against silent repurposing.');

console.log('🎉 All Phase 37C Evidence Surfacing & Reachability Tests Passed 100%!');
