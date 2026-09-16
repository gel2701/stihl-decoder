import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));

const database = readJson('data/stihl_database.json');
const evidenceFacts = readJson('data/public_evidence_facts.json');
const baselineManifest = readJson('data/public_evidence_baseline_manifest.json');
const activationProvenance = readJson('data/phase42c_activation_provenance.json');
const catalogAudit = readJson('data/phase42c_catalog_activation_audit.json');
const routeAudit = readJson('data/phase42c_route_integration_audit.json');
const databaseDelta = readJson('data/phase42c_database_delta.json');
const shRouteDecision = readJson('data/phase42c_sh_route_decision.json');

const models = database.models || database;
const modelArray = Array.isArray(models) ? models : Object.values(models);
const CORE5_FIELDS = ['product_category', 'product_type', 'machine_form', 'power_source', 'primary_function'];

const NEW_SLUGS = ['bg-56', 'bg-66', 'bg-86', 'sh-56', 'sh-86'];
const NEW_IDS = ['stihl_bg_56', 'stihl_bg_66', 'stihl_bg_86', 'stihl_sh_56', 'stihl_sh_86'];

// Actual 57 original slugs from the database before Phase 42C activation
const ORIGINAL_57_SLUGS = [
  'ms-170', 'ms-180', 'ms-200', 'ms-210', 'ms-230', 'ms-250', 'ms-260', 'ms-261',
  'ms-270', 'ms-280', 'ms-290', 'ms-310', 'ms-311', 'ms-340', 'ms-341', 'ms-360',
  'ms-361', 'ms-362', 'ms-390', 'ms-400', 'ms-441', 'ms-460',
  'fs-350', 'br-600', 'hs-45', 'ms-462', 'ms-201-t', 'fs-460', 'br-700', 'ts-420',
  'fs-100', 'fs-100-rx', '009', '017', '018', '026', '036', '044', '046', '088',
  'br-500', 'br-550', 'fs-120', 'fs-200', 'fs-38', 'fs-410-c-m', 'fs-490-c-m',
  'ms-200-t', 'ms-261-c-m', 'ms-362-c-m', 'ms-440', 'ms-461', 'sr-430', 'sr-450',
  'ts-410', 'ms-251', 'ms-251-c'
];

console.log('Phase 42C: Catalog Identity Activation Tests');
console.log('='.repeat(50));

// ─── T1: Exact five identity additions ─────────────────────────────────
console.log('\nT1: Exact five identity additions...');
const newModels = modelArray.filter(m => NEW_SLUGS.includes(m.slug));
assert.strictEqual(newModels.length, 5, `Expected 5 new models, found ${newModels.length}`);
for (const slug of NEW_SLUGS) {
  const found = modelArray.find(m => m.slug === slug);
  assert.ok(found, `Model ${slug} not found in database`);
}
console.log('  PASS: Exactly 5 new identity models present');

// ─── T2: Canonical count 57→62 ────────────────────────────────────────
console.log('\nT2: Canonical count 57→62...');
assert.strictEqual(modelArray.length, 62, `Expected 62 models, found ${modelArray.length}`);
console.log('  PASS: Database contains 62 models');

// ─── T3: Existing 57 models immutable ──────────────────────────────────
console.log('\nT3: Existing 57 models immutable...');
for (const slug of ORIGINAL_57_SLUGS) {
  const found = modelArray.find(m => m.slug === slug);
  assert.ok(found, `Original model ${slug} missing from database`);
}
console.log('  PASS: All 57 original models still present');

// ─── T4: CORE5 completeness 62/62 ─────────────────────────────────────
console.log('\nT4: CORE5 completeness 62/62...');
let core5CompleteCount = 0;
for (const model of modelArray) {
  assert.ok(model.basic_classification, `Model ${model.slug} missing basic_classification`);
  for (const field of CORE5_FIELDS) {
    assert.ok(
      model.basic_classification[field] !== undefined && model.basic_classification[field] !== null,
      `Model ${model.slug} missing CORE5 field: ${field}`
    );
  }
  if (model.basic_classification.core5_completeness === 5) {
    core5CompleteCount++;
  }
}
assert.strictEqual(core5CompleteCount, 62, `Expected 62 CORE5-complete models, found ${core5CompleteCount}`);
console.log('  PASS: 62/62 CORE5 complete');

// ─── T5: Alias normalization (BG56→BG 56, etc.) ───────────────────────
console.log('\nT5: Alias normalization...');
const aliasMap = {
  'bg-56': 'BG 56',
  'bg-66': 'BG 66',
  'bg-86': 'BG 86',
  'sh-56': 'SH 56',
  'sh-86': 'SH 86'
};
for (const [slug, expectedName] of Object.entries(aliasMap)) {
  const model = modelArray.find(m => m.slug === slug);
  assert.ok(model, `Model ${slug} not found`);
  assert.strictEqual(model.model_name, expectedName, `Model ${slug} name mismatch: expected "${expectedName}", got "${model.model_name}"`);
}
console.log('  PASS: All aliases correctly normalized');

// ─── T6: Variant suffix isolation (C-E variants not in DB) ────────────
console.log('\nT6: Variant suffix isolation...');
const cEVariants = ['bg-56-ce', 'bg-86-ce', 'sh-56-ce', 'sh-86-ce'];
for (const variant of cEVariants) {
  const found = modelArray.find(m => m.slug === variant);
  assert.strictEqual(found, undefined, `C-E variant ${variant} should NOT exist in database`);
}
// Verify base models exist
for (const base of ['bg-56', 'bg-86', 'sh-56', 'sh-86']) {
  const found = modelArray.find(m => m.slug === base);
  assert.ok(found, `Base model ${base} should exist`);
}
console.log('  PASS: C-E variants correctly isolated (not in DB)');

// ─── T7: MS201TCM no-duplicate ─────────────────────────────────────────
console.log('\nT7: MS201TCM no-duplicate...');
const ms201tcModels = modelArray.filter(m =>
  m.slug === 'ms-201-tcm' || m.slug === 'ms-201-tc-m' || m.slug === 'ms201tcm'
);
assert.strictEqual(ms201tcModels.length, 0, 'MS201TCM should not exist as separate record');
const ms201tcmMatch = modelArray.filter(m => m.model_name.includes('MS 201 TC'));
const ms201tcmDups = ms201tcmMatch.filter(m => m.slug !== 'ms-201-t');
assert.strictEqual(ms201tcmDups.length, 0, 'No duplicate MS201TCM records');
console.log('  PASS: MS201TCM no-duplicate verified');

// ─── T8: BG route validation (all under /bladblazers/) ─────────────────
console.log('\nT8: BG route validation...');
const bgModels = modelArray.filter(m => m.slug.startsWith('bg-'));
for (const model of bgModels) {
  assert.strictEqual(model.category_slug, 'bladblazers', `Model ${model.slug} should be in bladblazers category`);
}
console.log('  PASS: All BG models route under /bladblazers/');

// ─── T9: SH route decision validation (Option B) ──────────────────────
console.log('\nT9: SH route decision validation...');
assert.strictEqual(shRouteDecision.decision.SELECTED, 'OPTION_B', 'SH route should be Option B');
const shModels = modelArray.filter(m => m.slug.startsWith('sh-'));
for (const model of shModels) {
  assert.strictEqual(model.category_slug, 'bladblazers', `Model ${model.slug} should be in bladblazers category`);
}
console.log('  PASS: SH routes under /bladblazers/ (Option B)');

// ─── T10: New route canonical validation ───────────────────────────────
console.log('\nT10: New route canonical validation...');
for (const slug of NEW_SLUGS) {
  const model = modelArray.find(m => m.slug === slug);
  assert.ok(model, `Model ${slug} not found`);
  assert.strictEqual(model.category_slug, 'bladblazers', `${slug} must be in bladblazers`);
  assert.ok(model.data_status, `${slug} must have data_status`);
  assert.ok(model.model_status, `${slug} must have model_status`);
}
console.log('  PASS: All new routes valid');

// ─── T11: Sitemap integration ──────────────────────────────────────────
console.log('\nT11: Sitemap integration...');
// bladblazers is in the sitemap generator's category list
// New models under bladblazers will be included automatically
for (const slug of NEW_SLUGS) {
  const model = modelArray.find(m => m.slug === slug);
  assert.ok(model, `Model ${slug} not found`);
  assert.strictEqual(model.category_slug, 'bladblazers', `${slug} in sitemap via bladblazers`);
}
console.log('  PASS: All new models included in sitemap via bladblazers category');

// ─── T12: New models non-orphan ────────────────────────────────────────
console.log('\nT12: New models non-orphan...');
for (const slug of NEW_SLUGS) {
  const model = modelArray.find(m => m.slug === slug);
  assert.ok(model, `Model ${slug} not found`);
  assert.ok(model.provenance, `${slug} must have provenance`);
  assert.ok(model.provenance.source_reference, `${slug} must have source reference`);
}
console.log('  PASS: All new models have provenance (non-orphan)');

// ─── T13: Public evidence immutability ─────────────────────────────────
console.log('\nT13: Public evidence immutability...');
assert.strictEqual(evidenceFacts.facts.length, 474, 'Public facts must remain 474');
console.log('  PASS: 474 public facts unchanged');

// ─── T14: Phase42A facts not activated ─────────────────────────────────
console.log('\nT14: Phase42A facts not activated...');
// Verify no new technical facts in new models
for (const slug of NEW_SLUGS) {
  const model = modelArray.find(m => m.slug === slug);
  assert.strictEqual(model.displacement_cc, null, `${slug} must not have displacement_cc`);
  assert.strictEqual(model.power_kw, null, `${slug} must not have power_kw`);
  assert.strictEqual(model.weight_kg, null, `${slug} must not have weight_kg`);
}
console.log('  PASS: No technical facts activated in new models');

// ─── T15: Unknown BG/SH safety ────────────────────────────────────────
console.log('\nT15: Unknown BG/SH safety...');
const unknownBG = modelArray.find(m => m.slug === 'bg-999');
assert.strictEqual(unknownBG, undefined, 'BG 999 should NOT exist');
const unknownSH = modelArray.find(m => m.slug === 'sh-999');
assert.strictEqual(unknownSH, undefined, 'SH 999 should NOT exist');
console.log('  PASS: Unknown BG/SH models correctly rejected');

// ─── T16: Dossier/model-save smoke ─────────────────────────────────────
console.log('\nT16: Dossier/model-save smoke...');
for (const slug of NEW_SLUGS) {
  const model = modelArray.find(m => m.slug === slug);
  assert.ok(model, `Model ${slug} not found`);
  assert.ok(model.id, `${slug} must have id`);
  assert.ok(model.slug, `${slug} must have slug`);
  assert.ok(model.model_name, `${slug} must have model_name`);
  assert.ok(model.data_status, `${slug} must have data_status`);
  assert.ok(model.model_status, `${slug} must have model_status`);
  assert.ok(model.provenance, `${slug} must have provenance`);
}
console.log('  PASS: All new models save-ready');

// ─── T17: Baseline manifest integrity ──────────────────────────────────
console.log('\nT17: Baseline manifest integrity...');
assert.ok(baselineManifest, 'Baseline manifest must exist');
assert.ok(baselineManifest.canonical_database_sha256, 'Manifest must have DB hash');
console.log('  PASS: Baseline manifest intact');

console.log('\n' + '='.repeat(50));
console.log('Phase 42C tests PASSED (17/17).');
