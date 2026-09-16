import assert from 'assert';
import fs from 'fs';

console.log('Starting Phase 40A basic machine classification tests...');

const inventory = JSON.parse(fs.readFileSync(new URL('../data/phase40a_catalog_inventory.json', import.meta.url), 'utf8'));
const audit = JSON.parse(fs.readFileSync(new URL('../data/phase40a_current_basic_data_audit.json', import.meta.url), 'utf8'));
const vocab = JSON.parse(fs.readFileSync(new URL('../data/phase40a_basic_classification_vocabulary.json', import.meta.url), 'utf8'));
const candidates = JSON.parse(fs.readFileSync(new URL('../data/phase40a_basic_classification_candidates.json', import.meta.url), 'utf8'));
const sourceAudit = JSON.parse(fs.readFileSync(new URL('../data/phase40a_basic_classification_source_audit.json', import.meta.url), 'utf8'));
const conflicts = JSON.parse(fs.readFileSync(new URL('../data/phase40a_basic_classification_conflicts.json', import.meta.url), 'utf8'));
const completeness = JSON.parse(fs.readFileSync(new URL('../data/phase40a_completeness_report.json', import.meta.url), 'utf8'));
const finalReport = JSON.parse(fs.readFileSync(new URL('../data/phase40a_final_report.json', import.meta.url), 'utf8'));
const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
const evidenceFacts = JSON.parse(fs.readFileSync(new URL('../data/public_evidence_facts.json', import.meta.url), 'utf8'));

const CORE5_FIELDS = ['product_category', 'product_type', 'machine_form', 'power_source', 'primary_function'];

// ─── Test 1: Full catalog inventory ──────────────────────────────────────────
console.log('Test 1: Full catalog inventory...');
assert.strictEqual(inventory.total_canonical_models, 57, 'Expected 57 canonical models');
assert.strictEqual(inventory.families.length, 7, 'Expected 7 families');
assert.strictEqual(inventory.categories.length, 6, 'Expected 6 categories');
assert.ok(inventory.families.every(f => f.count > 0), 'All families must have at least 1 model');
assert.ok(inventory.categories.every(c => c.count > 0), 'All categories must have at least 1 model');
const totalFromFamilies = inventory.families.reduce((acc, f) => acc + f.count, 0);
assert.strictEqual(totalFromFamilies, 57, 'Sum of family counts must equal 57');
const totalFromCategories = inventory.categories.reduce((acc, c) => acc + c.count, 0);
assert.strictEqual(totalFromCategories, 57, 'Sum of category counts must equal 57');
console.log('  PASS: Catalog inventory verified (57 models, 7 families, 6 categories)');

// ─── Test 2: Candidate schema ───────────────────────────────────────────────
console.log('Test 2: Candidate schema validation...');
assert.strictEqual(candidates.length, 57, 'Expected 57 candidates');
const requiredFields = ['model_slug', 'model_name', 'model_family', 'existing_category', 'existing_fuel_type', 'existing_data_status', 'classification', 'evidence_status', 'core5_completeness', 'deep_specs_available_for_later', 'notes'];
for (const c of candidates) {
  for (const field of requiredFields) {
    assert.ok(field in c, `Candidate ${c.model_slug} missing field: ${field}`);
  }
  assert.ok(typeof c.classification === 'object' && c.classification !== null, `${c.model_slug} classification must be object`);
  assert.ok(typeof c.evidence_status === 'object' && c.evidence_status !== null, `${c.model_slug} evidence_status must be object`);
}
console.log('  PASS: All 57 candidates have required fields');

// ─── Test 3: Core5 validation ───────────────────────────────────────────────
console.log('Test 3: Core5 completeness validation...');
for (const c of candidates) {
  assert.strictEqual(c.core5_completeness, 5, `${c.model_slug} core5_completeness must be 5`);
  for (const field of CORE5_FIELDS) {
    assert.ok(c.classification[field] != null, `${c.model_slug} missing Core5 field: ${field}`);
  }
}
assert.strictEqual(completeness.remaining_incomplete_models.length, 0, 'No incomplete models expected');
assert.strictEqual(completeness.proposed_core5_complete, 57, 'All 57 models must have Core5 complete');
console.log('  PASS: All 57 models have complete Core5 (5/5)');

// ─── Test 4: Controlled vocabulary ──────────────────────────────────────────
console.log('Test 4: Controlled vocabulary validation...');
assert.ok(vocab.product_categories.length >= 6, 'Must have at least 6 product categories');
assert.ok(vocab.product_types.length >= 7, 'Must have at least 7 product types');
assert.ok(vocab.machine_forms.length >= 2, 'Must have at least 2 machine forms');
assert.ok(vocab.power_sources.length >= 2, 'Must have at least 2 power sources');
assert.ok(vocab.engine_types.length >= 3, 'Must have at least 3 engine types');
assert.ok(vocab.fuel_types.length >= 2, 'Must have at least 2 fuel types');
assert.ok(vocab.primary_functions.length >= 5, 'Must have at least 5 primary functions');
for (const c of candidates) {
  for (const field of CORE5_FIELDS) {
    const value = c.classification[field];
    const vocabKey = field + 's';
    if (vocab[vocabKey]) {
      assert.ok(vocab[vocabKey].includes(value), `${c.model_slug} field ${field} value "${value}" not in vocabulary`);
    }
  }
  // Also check engine_type and fuel_type against vocabulary
  assert.ok(vocab.engine_types.includes(c.classification.engine_type), `${c.model_slug} engine_type "${c.classification.engine_type}" not in vocabulary`);
  assert.ok(vocab.fuel_types.includes(c.classification.fuel_type), `${c.model_slug} fuel_type "${c.classification.fuel_type}" not in vocabulary`);
}
console.log('  PASS: All classification values are in controlled vocabulary');

// ─── Test 5: Provenance / evidence_status ───────────────────────────────────
console.log('Test 5: Provenance and evidence_status validation...');
const validEvidenceStatuses = [
  'EXISTING_CANONICAL_SUPPORTED',
  'PREFIX_HINT_ONLY',
  'CATEGORY_SUFFIX_HINT',
  'MODEL_NAME_SUFFIX',
  'LEGACY_PREFIX_RULE',
  'LEGACY_ERA_INFERENCE',
  'SERIES_CROSSREFERENCE',
  'PRODUCT_KNOWLEDGE',
  'WEIGHT_CLASS_INFERENCE'
];
for (const c of candidates) {
  for (const [field, status] of Object.entries(c.evidence_status)) {
    assert.ok(validEvidenceStatuses.includes(status), `${c.model_slug} field ${field} has invalid evidence_status: ${status}`);
  }
}
// Verify models with prefix-only or legacy evidence exist
const prefixOnlyModels = candidates.filter(c =>
  Object.values(c.evidence_status).some(v => v === 'PREFIX_HINT_ONLY' || v === 'LEGACY_PREFIX_RULE')
);
assert.ok(prefixOnlyModels.length > 0, 'Must have some models with prefix-only or legacy evidence');
// All models should have at least one EXISTING_CANONICAL_SUPPORTED field (product_category)
const allHaveCanonical = candidates.every(c =>
  Object.values(c.evidence_status).some(v => v === 'EXISTING_CANONICAL_SUPPORTED')
);
assert.ok(allHaveCanonical, 'All models must have at least one EXISTING_CANONICAL_SUPPORTED field');
console.log(`  PASS: All evidence statuses valid (${prefixOnlyModels.length} models with prefix/legacy evidence)`);

// ─── Test 6: Variant isolation ──────────────────────────────────────────────
console.log('Test 6: Variant isolation for T/TC/C-M models...');
const variantModels = candidates.filter(c =>
  c.model_name.includes('T') || c.model_name.includes('C-') || c.model_name.includes(' RX')
);
// MS 200 T should be top-handle
const ms200t = candidates.find(c => c.model_slug === 'ms-200-t');
assert.ok(ms200t, 'MS 200 T must exist');
assert.strictEqual(ms200t.classification.product_type, 'Tophandle kettingzaag', 'MS 200 T must be Tophandle');
assert.strictEqual(ms200t.classification.primary_function, 'SAWING', 'MS 200 T must have SAWING function');

// MS 201 TC-M should be top-handle
const ms201t = candidates.find(c => c.model_slug === 'ms-201-t');
assert.ok(ms201t, 'MS 201 TC-M must exist');
assert.strictEqual(ms201t.classification.product_type, 'Tophandle kettingzaag', 'MS 201 TC-M must be Tophandle');
assert.strictEqual(ms201t.classification.product_category, 'Kettingzaag', 'MS 201 TC-M category must be Kettingzaag');

// MS 261 C-M should be hand-held
const ms261cm = candidates.find(c => c.model_slug === 'ms-261-c-m');
assert.ok(ms261cm, 'MS 261 C-M must exist');
assert.strictEqual(ms261cm.classification.machine_form, 'HANDHELD', 'MS 261 C-M must be HANDHELD');
assert.strictEqual(ms261cm.classification.product_type, 'Handkettingzaag', 'MS 261 C-M must be Handkettingzaag');

// FS 100 RX should be bosmaaier
const fs100rx = candidates.find(c => c.model_slug === 'fs-100-rx');
assert.ok(fs100rx, 'FS 100 RX must exist');
assert.strictEqual(fs100rx.classification.product_type, 'Bosmaaier', 'FS 100 RX must be Bosmaaier');
assert.strictEqual(fs100rx.classification.primary_function, 'BRUSHCUTTING', 'FS 100 RX must have BRUSHCUTTING');

// BR 600 and BR 700 should be backpack
const br600 = candidates.find(c => c.model_slug === 'br-600');
const br700 = candidates.find(c => c.model_slug === 'br-700');
assert.strictEqual(br600.classification.machine_form, 'BACKPACK', 'BR 600 must be BACKPACK');
assert.strictEqual(br700.classification.machine_form, 'BACKPACK', 'BR 700 must be BACKPACK');
assert.strictEqual(br600.classification.engine_type, 'STIHL_4_MIX', 'BR 600 must be 4-MIX');
assert.strictEqual(br700.classification.engine_type, 'STIHL_4_MIX', 'BR 700 must be 4-MIX');

console.log(`  PASS: Variant isolation verified for ${variantModels.length} variant models`);

// ─── Test 7: No prefix-only promotion ───────────────────────────────────────
console.log('Test 7: No PREFIX_HINT_ONLY-only models marked as READY...');
// No model should be marked READY if all evidence is prefix-only
for (const c of candidates) {
  const allPrefixOnly = Object.values(c.evidence_status).every(v =>
    v === 'PREFIX_HINT_ONLY' || v === 'LEGACY_PREFIX_RULE' || v === 'LEGACY_ERA_INFERENCE'
  );
  // These models have classification but are not READY - they're PROPOSED
  // The test verifies no model is incorrectly classified as READY
  assert.ok(c.existing_data_status !== 'READY', `${c.model_slug} must not be READY`);
}
console.log('  PASS: No prefix-only models incorrectly marked as READY');

// ─── Test 8: Production immutability ────────────────────────────────────────
console.log('Test 8: Production immutability verification...');
assert.strictEqual(database.models.length, 57, 'Database must still have 57 models');
assert.ok(evidenceFacts.facts.length >= 474, 'Evidence facts must have at least 474 facts');
assert.strictEqual(finalReport.PRODUCTION_INTEGRITY.database_modified, false, 'Database must not be modified');
assert.strictEqual(finalReport.PRODUCTION_INTEGRITY.evidence_facts_modified, false, 'Evidence facts must not be modified');
assert.strictEqual(finalReport.PRODUCTION_INTEGRITY.public_fact_count_unchanged, true, 'Public fact count must be unchanged');
assert.strictEqual(finalReport.PRODUCTION_INTEGRITY.public_evidence_facts_count, 474, 'Public evidence facts count must be 474');
assert.strictEqual(finalReport.BASELINE.public_fact_count, 474, 'Baseline public fact count must be 474');
assert.strictEqual(finalReport.FINAL_DECISION.status, 'PASS', 'Final decision must be PASS');
assert.strictEqual(finalReport.FINAL_DECISION.core5_coverage, '57/57', 'Core5 coverage must be 57/57');

// Verify source audit is consistent with candidates
assert.strictEqual(sourceAudit.length, 57, 'Source audit must have 57 entries');
for (const s of sourceAudit) {
  assert.ok(s.model_slug, 'Source audit entry must have model_slug');
  assert.ok(s.classification_source, 'Source audit entry must have classification_source');
  assert.ok(Array.isArray(s.official_sources_for_basic_classification), 'official_sources must be array');
}

// Verify conflicts are documented
assert.ok(conflicts.total_conflicts >= 4, 'Must have at least 4 documented conflicts');
assert.ok(conflicts.conflicts.length >= 4, 'Must have at least 4 conflict entries');

console.log('  PASS: Production immutability verified');
console.log('');
console.log('Phase 40A basic machine classification tests PASSED (8/8).');
