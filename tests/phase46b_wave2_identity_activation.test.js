import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodeStihlCode } from '../src/decoder.js';
import { searchGlobalModels } from '../src/globalModelSearch.js';
import { getSafeModelPath } from '../src/publicationRules.js';

const rootDir = process.cwd();

// Load canonical database
const dbRaw = fs.readFileSync(path.join(rootDir, 'data/stihl_database.json'), 'utf8');
const db = JSON.parse(dbRaw);

// Load Wave 2 definition
const wave2Raw = fs.readFileSync(path.join(rootDir, 'data/phase46a_phase46b_wave2_definition.json'), 'utf8');
const wave2Data = JSON.parse(wave2Raw);
const wave2Identities = wave2Data.selected_identities;
const wave2Slugs = new Set(wave2Identities.map(w => w.proposed_slug));
const wave2Names = new Set(wave2Identities.map(w => w.model));

// Load public evidence facts
const factsRaw = fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'), 'utf8');
const factsData = JSON.parse(factsRaw);
const factsList = factsData.facts || factsData;

// 1. exact accepted Phase46A-R2 input
test('Phase 46B — 1. Exact accepted Phase46A-R2 input', () => {
  assert.equal(wave2Data.phase, '46A-R2');
  assert.equal(wave2Data.target_phase, '46B');
  const wave2Hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(rootDir, 'data/phase46a_phase46b_wave2_definition.json'))).digest('hex');
  assert.equal(wave2Hash, '65b0f019ec599c284cd276ed46eddd2b1e4a711e8a8979294ccc52b6fb47fa65');
});

// 2. exact 12 selected
test('Phase 46B — 2. Exact 12 selected in Wave 2 definition', () => {
  assert.equal(wave2Identities.length, 12);
  assert.equal(wave2Data.total_selected, 12);
  assert.equal(wave2Data.deferred_count, 0);
  assert.equal(wave2Data.blocked_count, 0);
});

// 3. 98 + 12 = 110
test('Phase 46B — 3. Model equation valid: 98 + 12 = 110', () => {
  assert.equal(db.models.length, 110);
});

// 4. only selected Wave2 models activated
test('Phase 46B — 4. Only selected Wave 2 models activated', () => {
  const activated = db.models.slice(98);
  assert.equal(activated.length, 12);
  for (const m of activated) {
    assert.ok(wave2Names.has(m.model_name), `Unexpected model activated: ${m.model_name}`);
    assert.ok(wave2Slugs.has(m.slug), `Unexpected slug activated: ${m.slug}`);
  }
});

// 5. existing 98 immutable
test('Phase 46B — 5. Existing 98 models remain immutable', () => {
  const existing98 = db.models.slice(0, 98);
  assert.equal(existing98.length, 98);
  assert.equal(existing98[0].model_name, 'MS 170');
  assert.equal(existing98[82].model_name, 'MS 212');
  assert.equal(existing98[97].model_name, 'MSA 70 C-B');
});

// 6. 110 unique IDs
test('Phase 46B — 6. Unique IDs across all 110 models', () => {
  const ids = db.models.map(m => m.id);
  assert.equal(new Set(ids).size, 110);
});

// 7. 110 unique slugs
test('Phase 46B — 7. Unique slugs across all 110 models', () => {
  const slugs = db.models.map(m => m.slug);
  assert.equal(new Set(slugs).size, 110);
});

// 8. no invented aliases
test('Phase 46B — 8. No invented aliases on activated models', () => {
  const activated = db.models.slice(98);
  for (const m of activated) {
    assert.equal(m.aliases, undefined, `Aliases should not be invented for ${m.model_name}`);
  }
});

// 9. CORE5 canonical vocabulary valid
test('Phase 46B — 9. CORE5 canonical vocabulary valid across all 12 activated', () => {
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

  const activated = db.models.slice(98);
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

// 10. CORE5 5/5 for all 12
test('Phase 46B — 10. CORE5 complete 5/5 for all 12 activated and all 110 models', () => {
  const core5Total = db.models.filter(m => m.basic_classification?.core5_completeness === 5).length;
  assert.equal(core5Total, 110);
  const activated = db.models.slice(98);
  for (const m of activated) {
    assert.equal(m.basic_classification?.core5_completeness, 5);
  }
});

// 11. MSE170 C-BQ exact suffix
test('Phase 46B — 11. MSE 170 C-BQ retains exact suffix C-BQ', () => {
  const m = db.models.find(mod => mod.model_name === 'MSE 170 C-BQ');
  assert.ok(m, 'MSE 170 C-BQ must be activated');
  assert.equal(m.slug, 'mse-170-c-bq');
  assert.equal(m.id, 'stihl_mse_170_c-bq');
  assert.equal(m.category_slug, 'kettingzagen');
  assert.equal(m.basic_classification.power_source, 'ELECTRIC');
});

// 12. MSE141 C-Q exact suffix
test('Phase 46B — 12. MSE 141 C-Q retains exact suffix C-Q', () => {
  const m = db.models.find(mod => mod.model_name === 'MSE 141 C-Q');
  assert.ok(m, 'MSE 141 C-Q must be activated');
  assert.equal(m.slug, 'mse-141-c-q');
  assert.equal(m.id, 'stihl_mse_141_c-q');
  assert.equal(m.category_slug, 'kettingzagen');
  assert.equal(m.basic_classification.power_source, 'ELECTRIC');
});

// 13. HS82 R exact suffix
test('Phase 46B — 13. HS 82 R retains exact suffix R', () => {
  const m = db.models.find(mod => mod.model_name === 'HS 82 R');
  assert.ok(m, 'HS 82 R must be activated');
  assert.equal(m.slug, 'hs-82-r');
  assert.equal(m.id, 'stihl_hs_82_r');
  assert.equal(m.category_slug, 'heggenscharen');
  assert.equal(m.basic_classification.power_source, 'GASOLINE');
  assert.equal(m.fuel_type_label, null, 'Gasoline model must not have fake Accu fuel_type_label');
});

// 14. MSA190 T exact suffix
test('Phase 46B — 14. MSA 190 T retains exact suffix T', () => {
  const m = db.models.find(mod => mod.model_name === 'MSA 190 T');
  assert.ok(m, 'MSA 190 T must be activated');
  assert.equal(m.slug, 'msa-190-t');
  assert.equal(m.id, 'stihl_msa_190_t');
  assert.equal(m.category_slug, 'kettingzagen');
  assert.equal(m.basic_classification.product_type, 'Tophandle kettingzaag');
  assert.equal(m.basic_classification.power_source, 'BATTERY');
});

// 15. HSA26 one canonical identity
test('Phase 46B — 15. HSA 26 exists as exactly one canonical identity', () => {
  const hsa26Matches = db.models.filter(m => m.model_name === 'HSA 26' || m.slug === 'hsa-26');
  assert.equal(hsa26Matches.length, 1);
});

// 16. HSA26 primary record/reference correct
test('Phase 46B — 16. HSA 26 has primary record 27 and reference HA03-011-3503', () => {
  const m = db.models.find(mod => mod.model_name === 'HSA 26');
  assert.ok(m);
  assert.equal(m.provenance.source_document_number, 'HA03-011-3503');
  assert.ok(m.provenance.source_url.includes('podador-arbustos-bateria-hsa-26/p'));
  assert.ok(m.basic_classification.notes.includes('27 (HA03-011-3503)'));
});

// 17. HSA26 kit not separately activated
test('Phase 46B — 17. HSA 26 kit (record 28) not separately activated', () => {
  const kitMatches = db.models.filter(m => m.slug.includes('kit') || m.model_name.includes('SET') || m.model_name.includes('Kit'));
  for (const k of kitMatches) {
    assert.notEqual(k.model_name, 'HSA 26 Set');
    assert.notEqual(k.model_name, 'HSA 26 Kit');
    assert.notEqual(k.slug, 'hsa-26-kit');
  }
});

// 18. TSA230 category Doorslijper
test('Phase 46B — 18. TSA 230 category is Doorslijper with category_slug doorslijpers', () => {
  const m = db.models.find(mod => mod.model_name === 'TSA 230');
  assert.ok(m);
  assert.equal(m.category, 'Doorslijper');
  assert.equal(m.category_slug, 'doorslijpers');
  assert.equal(m.basic_classification.product_category, 'Doorslijper');
  assert.equal(m.basic_classification.product_type, 'Doorslijper');
});

// 19. TSA230 CUT_OFF
test('Phase 46B — 19. TSA 230 primary_function is CUT_OFF', () => {
  const m = db.models.find(mod => mod.model_name === 'TSA 230');
  assert.ok(m);
  assert.equal(m.basic_classification.primary_function, 'CUT_OFF');
  assert.equal(m.basic_classification.machine_form, 'HANDHELD');
});

// 20. TSA230 no LAWNMOWER leakage
test('Phase 46B — 20. TSA 230 has zero lawnmower leakage', () => {
  const m = db.models.find(mod => mod.model_name === 'TSA 230');
  assert.ok(m);
  assert.notEqual(m.category, 'Grasmaaier');
  assert.notEqual(m.category_slug, 'grasmaaiers');
  assert.notEqual(m.basic_classification.product_category, 'Grasmaaier');
  assert.notEqual(m.basic_classification.product_type, 'Grasmaaier');
  assert.notEqual(m.basic_classification.primary_function, 'MOWING');
});

// 21. six mains-electric models ELECTRIC
test('Phase 46B — 21. All 6 mains-electric models have power_source ELECTRIC and no fake Accu label', () => {
  const electricModels = ['MSE 170 C-BQ', 'MSE 141 C-Q', 'BGE 71', 'FSE 41', 'HSE 52', 'FSE 60'];
  for (const name of electricModels) {
    const m = db.models.find(mod => mod.model_name === name);
    assert.ok(m, `${name} must be in database`);
    assert.equal(m.basic_classification.power_source, 'ELECTRIC', `${name} must have power_source ELECTRIC`);
    assert.equal(m.fuel_type_label, null, `${name} must have fuel_type_label null`);
    assert.equal(m.fuel_type, null, `${name} must have fuel_type null`);
    assert.equal(m.voltage_v, null, `${name} must have voltage_v null`);
  }
});

// 22. technical fields all null
test('Phase 46B — 22. Technical fields strictly null across all 12 activated models', () => {
  const activated = db.models.slice(98);
  const technicalFields = [
    'displacement_cc', 'power_kw', 'power_hp', 'weight_kg',
    'spark_plug', 'electrode_gap_mm', 'carb_h_setting', 'carb_l_setting',
    'carb_la_setting', 'chain_pitch', 'chain_gauge_mm', 'oil_mix_ratio',
    'battery_system', 'voltage_v', 'sound_pressure_db', 'sound_power_db',
    'vibration_left_ms2', 'vibration_right_ms2'
  ];
  for (const m of activated) {
    for (const f of technicalFields) {
      assert.equal(m[f], null, `Technical field ${f} must be null for ${m.model_name}`);
    }
  }
});

// 23. battery_system null
test('Phase 46B — 23. battery_system is null for all 12 activated models', () => {
  const activated = db.models.slice(98);
  for (const m of activated) {
    assert.equal(m.battery_system, null, `battery_system must be null for ${m.model_name}`);
  }
});

// 24. voltage_v null
test('Phase 46B — 24. voltage_v is null for all 12 activated models', () => {
  const activated = db.models.slice(98);
  for (const m of activated) {
    assert.equal(m.voltage_v, null, `voltage_v must be null for ${m.model_name}`);
  }
});

// 25. production_confidence UNKNOWN all 110
test('Phase 46B — 25. production_confidence is UNKNOWN for all 110 models', () => {
  for (const m of db.models) {
    assert.equal(m.production_confidence, 'UNKNOWN', `production_confidence should be UNKNOWN for ${m.model_name}`);
  }
});

// 26. specs_verified true count = 0
test('Phase 46B — 26. specs_verified is false for all 110 models (true count = 0)', () => {
  const verifiedCount = db.models.filter(m => m.specs_verified === true).length;
  assert.equal(verifiedCount, 0);
  for (const m of db.models) {
    assert.notEqual(m.specs_verified, true, `specs_verified must not be true for ${m.model_name}`);
  }
});

// 27. facts remain 721
test('Phase 46B — 27. Public facts count remains exactly 721', () => {
  assert.equal(factsList.length, 721);
});

// 28. facts hash unchanged
test('Phase 46B — 28. Public facts file hash remains unchanged', () => {
  const currentFactsHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'))).digest('hex');
  const EXPECTED_FACTS_HASH = '0d8efa841591b2fd27869e27d989620f8b2159f53f1b82cfe7dea9db67094d80';
  assert.equal(currentFactsHash, EXPECTED_FACTS_HASH);
});

// 29. routes resolve 12/12
test('Phase 46B — 29. Routes resolve 12/12 for all activated models', () => {
  const activated = db.models.slice(98);
  const expectedRoutes = {
    'MSE 170 C-BQ': '/kettingzagen/mse-170-c-bq/',
    'MSE 141 C-Q': '/kettingzagen/mse-141-c-q/',
    'HSA 26': '/heggenscharen/hsa-26/',
    'HLA 66': '/heggenscharen/hla-66/',
    'HS 82 R': '/heggenscharen/hs-82-r/',
    'MSA 190 T': '/kettingzagen/msa-190-t/',
    'TSA 230': '/doorslijpers/tsa-230/',
    'HLA 56': '/heggenscharen/hla-56/',
    'BGE 71': '/bladblazers/bge-71/',
    'FSE 41': '/bosmaaiers/fse-41/',
    'HSE 52': '/heggenscharen/hse-52/',
    'FSE 60': '/bosmaaiers/fse-60/'
  };

  for (const m of activated) {
    const path = getSafeModelPath(m);
    assert.equal(path, expectedRoutes[m.model_name], `Route mismatch for ${m.model_name}`);
  }
});

// 30. category listings 12/12
test('Phase 46B — 30. Category listings include 12/12 activated models without orphans', () => {
  const validCategories = new Set(['kettingzagen', 'bosmaaiers', 'bladblazers', 'heggenscharen', 'doorslijpers']);
  const activated = db.models.slice(98);
  for (const m of activated) {
    assert.ok(validCategories.has(m.category_slug), `Invalid category_slug: ${m.category_slug} for ${m.model_name}`);
    const inCategory = db.models.filter(mod => mod.category_slug === m.category_slug);
    assert.ok(inCategory.some(mod => mod.id === m.id), `Model ${m.model_name} not found in its category listing`);
  }
});

// 31. search exact 12/12
test('Phase 46B — 31. Exact search hits 12/12 activated models', () => {
  for (const item of wave2Identities) {
    const results = searchGlobalModels(item.model, db);
    assert.ok(results.length > 0, `Search returned no results for ${item.model}`);
    assert.equal(results[0].model_name, item.model, `First result should be ${item.model}, got ${results[0].model_name}`);
    assert.equal(results[0].slug, item.proposed_slug);
  }
});

// 32. suffix negative searches PASS
test('Phase 46B — 32. Suffix negative search tests pass (no false suffix stripping)', () => {
  // Query "MSE 170" should not be an exact hit on MSE 170 C-BQ
  const resMse170 = searchGlobalModels('MSE 170', db);
  const exactMse170Match = resMse170.find(r => r.model_name === 'MSE 170 C-BQ' && r.matchType === 'EXACT_NAME');
  assert.equal(exactMse170Match, undefined, 'MSE 170 should not produce an EXACT_NAME match on MSE 170 C-BQ');

  // Query "MSE 141" should not be an exact hit on MSE 141 C-Q
  const resMse141 = searchGlobalModels('MSE 141', db);
  const exactMse141Match = resMse141.find(r => r.model_name === 'MSE 141 C-Q' && r.matchType === 'EXACT_NAME');
  assert.equal(exactMse141Match, undefined, 'MSE 141 should not produce an EXACT_NAME match on MSE 141 C-Q');

  // Query "HS 82" should not be an exact hit on HS 82 R
  const resHs82 = searchGlobalModels('HS 82', db);
  const exactHs82Match = resHs82.find(r => r.model_name === 'HS 82 R' && r.matchType === 'EXACT_NAME');
  assert.equal(exactHs82Match, undefined, 'HS 82 should not produce an EXACT_NAME match on HS 82 R');

  // Query "MSA 190" should not be an exact hit on MSA 190 T
  const resMsa190 = searchGlobalModels('MSA 190', db);
  const exactMsa190Match = resMsa190.find(r => r.model_name === 'MSA 190 T' && r.matchType === 'EXACT_NAME');
  assert.equal(exactMsa190Match, undefined, 'MSA 190 should not produce an EXACT_NAME match on MSA 190 T');
});

// 33. serial ranges remain 8
test('Phase 46B — 33. Serial ranges count remains strictly 8', () => {
  assert.equal(db.model_serial_ranges.length, 8);
});

// 34. serial range metadata 8/8 identical
test('Phase 46B — 34. Serial range metadata 8/8 identical with 0 HIGH, 8 MEDIUM, 0 LOW', () => {
  const ranges = db.model_serial_ranges;
  assert.equal(ranges.length, 8);
  const highCount = ranges.filter(r => r.confidence_level === 'HIGH').length;
  const medCount = ranges.filter(r => r.confidence_level === 'MEDIUM').length;
  const lowCount = ranges.filter(r => r.confidence_level === 'LOW').length;
  assert.equal(highCount, 0);
  assert.equal(medCount, 8);
  assert.equal(lowCount, 0);
});

// 35. serial decoder R2 candidate scopes unchanged
test('Phase 46B — 35. Serial decoder R2 candidate scopes unchanged', () => {
  // BR 600
  const rBr600 = decodeStihlCode('275000000', db);
  assert.ok(rBr600.success);
  assert.equal(rBr600.modelAssist?.series, 'BR 600 Reeks');
  assert.deepEqual(rBr600.modelAssist?.candidates.map(c => c.slug), ['br-600']);

  // FS 120 / FS 250 -> FS 120 candidate only
  const rFs120 = decodeStihlCode('335000000', db);
  assert.ok(rFs120.success);
  assert.equal(rFs120.modelAssist?.series, 'FS 120 / FS 250');
  assert.deepEqual(rFs120.modelAssist?.candidates.map(c => c.slug), ['fs-120']);

  // BR 340 / BR 420 -> BR 420 candidate only
  const rBr420 = decodeStihlCode('150123456', db);
  assert.ok(rBr420.success);
  assert.equal(rBr420.modelAssist?.series, 'BR 340 / BR 420');
  assert.deepEqual(rBr420.modelAssist?.candidates.map(c => c.slug), ['br-420']);
});

// 36. no Phase46C technical evidence activated
test('Phase 46B — 36. Zero Phase 46C technical evidence activated', () => {
  const activated = db.models.slice(98);
  for (const m of activated) {
    assert.equal(m.data_status, 'CATALOG_IDENTITY_ONLY');
    assert.equal(m.model_status, 'CATALOG_IDENTITY_ONLY');
    assert.equal(m.data_confidence, 'LOW');
    assert.equal(m.specs_verified, false);
    assert.equal(m.series_code, null);
    assert.equal(m.displacement_cc, null);
    assert.equal(m.power_kw, null);
    assert.equal(m.power_hp, null);
    assert.equal(m.weight_kg, null);
    assert.equal(m.spark_plug, null);
    assert.equal(m.battery_system, null);
    assert.equal(m.voltage_v, null);
    assert.equal(m.sound_pressure_db, null);
    assert.equal(m.sound_power_db, null);
    assert.equal(m.vibration_left_ms2, null);
    assert.equal(m.vibration_right_ms2, null);
  }
});
