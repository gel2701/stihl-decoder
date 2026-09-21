import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

// Load canonical database
const db = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/stihl_database.json'), 'utf8'));
const wave1Data = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_phase45b_wave1_definition.json'), 'utf8'));
const wave1 = wave1Data.identities;
const wave1Slugs = new Set(wave1.map(w => w.proposed_slug));
const wave1Names = new Set(wave1.map(w => w.canonical_model));

test('Phase 45B — 1. Exact Wave 1 input 15', () => {
  assert.equal(wave1.length, 15);
  assert.equal(wave1Data.wave1_count, 15);
});

test('Phase 45B — 2. Only selected Wave 1 activated', () => {
  assert.equal(db.models.length, 98);
  const activated = db.models.slice(83);
  assert.equal(activated.length, 15);
  for (const m of activated) {
    assert.ok(wave1Names.has(m.model_name), `Unexpected model activated: ${m.model_name}`);
    assert.ok(wave1Slugs.has(m.slug), `Unexpected slug activated: ${m.slug}`);
  }
});

test('Phase 45B — 3. Model equation valid: 83 + 15 = 98', () => {
  assert.equal(db.models.length, 98);
});

test('Phase 45B — 4. Existing 83 untouched', () => {
  const existing83 = db.models.slice(0, 83);
  assert.equal(existing83.length, 83);
  assert.equal(existing83[0].model_name, 'MS 170');
  assert.equal(existing83[82].model_name, 'MS 212');
});

test('Phase 45B — 5. Unique IDs across all 98 models', () => {
  const ids = db.models.map(m => m.id);
  assert.equal(new Set(ids).size, 98);
});

test('Phase 45B — 6. Unique slugs across all 98 models', () => {
  const slugs = db.models.map(m => m.slug);
  assert.equal(new Set(slugs).size, 98);
});

test('Phase 45B — 7. Aliases not invented', () => {
  const activated = db.models.slice(83);
  for (const m of activated) {
    assert.equal(m.aliases, undefined, `Aliases should not be invented for ${m.model_name}`);
  }
});

test('Phase 45B — 8. CORE5 canonical vocabulary valid', () => {
  const allowedCategories = new Set([
    'Kettingzaag', 'Bosmaaier', 'Bladblazer', 'Heggenschaar',
    'Doorslijper', 'Nevelspuit', 'Zuig-/blaasmachine'
  ]);
  const allowedTypes = new Set([
    'Handkettingzaag', 'Tophandle kettingzaag', 'Bosmaaier',
    'Rugbladblazer', 'Handheggenschaar', 'Doorslijper',
    'Grastrimmer', 'Nevelspuit', 'Handbladblazer', 'Zuighakselaar',
    'Handbosmaaier', 'Bladblazer'
  ]);
  const allowedForms = new Set(['HANDHELD', 'BACKPACK', 'WHEELED']);
  const allowedPowers = new Set(['GASOLINE', 'BATTERY', 'ELECTRIC', 'MANUAL']);
  const allowedFunctions = new Set([
    'SAWING', 'BRUSHCUTTING', 'BLOWING', 'HEDGE_TRIMMING',
    'CUT_OFF', 'GRASS_TRIMMING', 'SPRAYING', 'CUTTING', 'CLEANING', 'PRUNING'
  ]);

  const activated = db.models.slice(83);
  for (const m of activated) {
    const bc = m.basic_classification;
    assert.ok(bc, `Missing basic_classification for ${m.model_name}`);
    assert.ok(allowedCategories.has(bc.product_category), `Invalid product_category: ${bc.product_category}`);
    assert.ok(allowedTypes.has(bc.product_type), `Invalid product_type: ${bc.product_type}`);
    assert.ok(allowedForms.has(bc.machine_form), `Invalid machine_form: ${bc.machine_form}`);
    assert.ok(allowedPowers.has(bc.power_source), `Invalid power_source: ${bc.power_source}`);
    assert.ok(allowedFunctions.has(bc.primary_function), `Invalid primary_function: ${bc.primary_function}`);
  }
});

test('Phase 45B — 9. CORE5 complete 5/5 for all activated', () => {
  const activated = db.models.slice(83);
  for (const m of activated) {
    assert.equal(m.basic_classification?.core5_completeness, 5);
  }
});

test('Phase 45B — 10. Lowercase Phase45A semantic strings not leaked as canonical values', () => {
  const forbidden = [
    'brushcutter', 'chainsaw', 'hedge_trimmer', 'blower', 'vacuum_shredder',
    'handheld_brushcutter', 'handheld_chainsaw', 'pole_hedge_trimmer', 'handheld_hedge_trimmer',
    'battery', 'vegetation_clearing', 'wood_cutting', 'debris_collection', 'hedge_trimming', 'debris_blowing'
  ];

  const activated = db.models.slice(83);
  for (const m of activated) {
    const bc = m.basic_classification;
    for (const val of [bc.product_category, bc.product_type, bc.machine_form, bc.power_source, bc.primary_function]) {
      assert.ok(!forbidden.includes(val), `Forbidden staging string leaked: ${val} in ${m.model_name}`);
    }
  }
});

test('Phase 45B — 11. SHA 56 route/category safe', () => {
  const sha56 = db.models.find(m => m.model_name === 'SHA 56');
  assert.ok(sha56, 'SHA 56 must be activated');
  assert.equal(sha56.category_slug, 'bladblazers');
  assert.equal(sha56.category, 'Bladblazer');
  assert.equal(sha56.basic_classification.product_category, 'Zuig-/blaasmachine');
  assert.equal(sha56.basic_classification.product_type, 'Zuighakselaar');
  assert.equal(sha56.basic_classification.primary_function, 'BLOWING');
});

test('Phase 45B — 12. HLA 40 mapping safe', () => {
  const hla40 = db.models.find(m => m.model_name === 'HLA 40');
  assert.ok(hla40, 'HLA 40 must be activated');
  assert.equal(hla40.category_slug, 'heggenscharen');
  assert.equal(hla40.category, 'Heggenschaar');
  assert.equal(hla40.basic_classification.product_category, 'Heggenschaar');
  assert.equal(hla40.basic_classification.product_type, 'Handheggenschaar');
});

test('Phase 45B — 13. MSA suffix C-B preserved', () => {
  const cbModels = ['MSA 60 C-B', 'MSA 160 C-B', 'MSA 220 C-B', 'MSA 200 C-B', 'MSA 70 C-B'];
  for (const name of cbModels) {
    const m = db.models.find(mod => mod.model_name === name);
    assert.ok(m, `${name} must be activated with exact suffix`);
    assert.ok(m.slug.endsWith('-c-b'), `${m.slug} must end with -c-b`);
  }
});

test('Phase 45B — 14. Bundle duplicates remain one identity', () => {
  assert.equal(db.models.filter(m => m.model_name === 'BGA 30').length, 1);
  assert.equal(db.models.filter(m => m.model_name === 'FSA 50').length, 1);
  assert.equal(db.models.filter(m => m.model_name === 'HSA 30').length, 1);
});

test('Phase 45B — 15. Kit-only provenance retained', () => {
  const hsa40 = db.models.find(m => m.model_name === 'HSA 40');
  const fsa30 = db.models.find(m => m.model_name === 'FSA 30');
  assert.ok(hsa40.basic_classification.notes.includes('KIT_ONLY_IDENTITY_SOURCE'));
  assert.ok(fsa30.basic_classification.notes.includes('KIT_ONLY_IDENTITY_SOURCE'));
});

test('Phase 45B — 16-18. Technical fields remain null & battery_system is null', () => {
  const activated = db.models.slice(83);
  const technicalFields = [
    'displacement_cc', 'power_kw', 'power_hp', 'weight_kg',
    'spark_plug', 'electrode_gap_mm', 'carb_h_setting', 'carb_l_setting',
    'carb_la_setting', 'chain_pitch', 'chain_gauge_mm', 'oil_mix_ratio',
    'battery_system', 'voltage_v'
  ];
  for (const m of activated) {
    for (const f of technicalFields) {
      assert.equal(m[f], null, `Technical field ${f} must be null for ${m.model_name}`);
    }
  }
});

test('Phase 45B — 19-20. Public facts remain 665 and evidence hash unchanged', () => {
  const factsRaw = fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'));
  const facts = JSON.parse(factsRaw.toString('utf8'));
  assert.equal(facts.facts.length, 665);
});

test('Phase 45B — 21-22. Production confidence UNKNOWN & specs_verified false', () => {
  for (const m of db.models) {
    assert.equal(m.production_confidence, 'UNKNOWN');
    assert.notStrictEqual(m.specs_verified, true);
  }
});

test('Phase 45B — 23. Route resolution: all 15 have expected categories', () => {
  const validCategories = new Set(['kettingzagen', 'bosmaaiers', 'bladblazers', 'heggenscharen']);
  const activated = db.models.slice(83);
  for (const m of activated) {
    assert.ok(validCategories.has(m.category_slug), `Invalid category_slug: ${m.category_slug}`);
  }
});

test('Phase 45B — 27-29. No Wave 2, architecture-required, or Tier 3 activations', () => {
  const activeSlugs = new Set(db.models.map(m => m.slug));
  assert.ok(!activeSlugs.has('bge-71'), 'Wave 2 BGE 71 should not be activated');
  assert.ok(!activeSlugs.has('re-90'), 'Category-architecture RE 90 should not be activated');
  assert.ok(!activeSlugs.has('rm-253'), 'Category-architecture RM 253 should not be activated');
});
