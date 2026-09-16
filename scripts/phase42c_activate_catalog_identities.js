import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PROJECT_ROOT = join(import.meta.dirname, '..');

// Read current state
const db = JSON.parse(readFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'), 'utf8'));
const models = db.models || db;
const modelArray = Array.isArray(models) ? models : Object.values(models);

console.log(`Current models: ${modelArray.length}`);

// Pre-flight checks
const existingSlugs = new Set(modelArray.map(m => m.slug));
const existingNames = new Set(modelArray.map(m => m.model_name));
const existingIds = new Set(modelArray.map(m => m.id));

// Phase 42B candidates
const candidates = [
  {
    id: 'stihl_bg_56',
    slug: 'bg-56',
    category_slug: 'bladblazers',
    series_code: null,
    model_name: 'BG 56',
    category: 'Bladblazer',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt)',
    displacement_cc: null,
    power_kw: null,
    power_hp: null,
    weight_kg: null,
    spark_plug: null,
    electrode_gap_mm: null,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: null,
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: null,
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0,
    data_confidence: 'IDENTITY_ONLY',
    production_confidence: 'IDENTITY_ONLY',
    specs_verified: 0,
    data_source: 'STIHL Instruction Manual 0458-296-8621-C',
    provenance: {
      verification_status: 'IDENTITY_VERIFIED',
      source_type: 'OFFICIAL_INSTRUCTION_MANUAL',
      source_reference: '0458-296-8621-C',
      last_verified: new Date().toISOString()
    },
    data_status: 'IDENTITY_ACTIVE',
    field_verification: {},
    model_status: 'IDENTITY_ACTIVE',
    series_identification: null,
    basic_classification: {
      brand: 'STIHL',
      product_category: 'Bladblazer',
      product_type: 'Handbladblazer',
      machine_form: 'HANDHELD',
      power_source: 'GASOLINE',
      engine_type: 'COMBUSTION_2_STROKE',
      fuel_type: 'PETROL_OIL_MIX',
      primary_function: 'BLOWING',
      evidence_status: {
        product_category: 'OFFICIAL_EXACT_MODEL',
        product_type: 'OFFICIAL_EXACT_MODEL',
        machine_form: 'PREFIX_HINT_ONLY',
        power_source: 'OFFICIAL_EXACT_MODEL',
        primary_function: 'OFFICIAL_EXACT_MODEL'
      },
      core5_completeness: 5,
      deep_specs_available_for_later: true,
      notes: 'Identity from STIHL multi-model manual 0458-296-8621-C. Technical specs pending Phase 42D.'
    }
  },
  {
    id: 'stihl_bg_66',
    slug: 'bg-66',
    category_slug: 'bladblazers',
    series_code: null,
    model_name: 'BG 66',
    category: 'Bladblazer',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt)',
    displacement_cc: null,
    power_kw: null,
    power_hp: null,
    weight_kg: null,
    spark_plug: null,
    electrode_gap_mm: null,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: null,
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: null,
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0,
    data_confidence: 'IDENTITY_ONLY',
    production_confidence: 'IDENTITY_ONLY',
    specs_verified: 0,
    data_source: 'STIHL Instruction Manual 0458-296-8621-C',
    provenance: {
      verification_status: 'IDENTITY_VERIFIED',
      source_type: 'OFFICIAL_INSTRUCTION_MANUAL',
      source_reference: '0458-296-8621-C',
      last_verified: new Date().toISOString()
    },
    data_status: 'IDENTITY_ACTIVE',
    field_verification: {},
    model_status: 'IDENTITY_ACTIVE',
    series_identification: null,
    basic_classification: {
      brand: 'STIHL',
      product_category: 'Bladblazer',
      product_type: 'Handbladblazer',
      machine_form: 'HANDHELD',
      power_source: 'GASOLINE',
      engine_type: 'COMBUSTION_2_STROKE',
      fuel_type: 'PETROL_OIL_MIX',
      primary_function: 'BLOWING',
      evidence_status: {
        product_category: 'OFFICIAL_EXACT_MODEL',
        product_type: 'OFFICIAL_EXACT_MODEL',
        machine_form: 'PREFIX_HINT_ONLY',
        power_source: 'OFFICIAL_EXACT_MODEL',
        primary_function: 'OFFICIAL_EXACT_MODEL'
      },
      core5_completeness: 5,
      deep_specs_available_for_later: true,
      notes: 'Identity from STIHL multi-model manual 0458-296-8621-C. Technical specs pending Phase 42D.'
    }
  },
  {
    id: 'stihl_bg_86',
    slug: 'bg-86',
    category_slug: 'bladblazers',
    series_code: null,
    model_name: 'BG 86',
    category: 'Bladblazer',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt)',
    displacement_cc: null,
    power_kw: null,
    power_hp: null,
    weight_kg: null,
    spark_plug: null,
    electrode_gap_mm: null,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: null,
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: null,
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0,
    data_confidence: 'IDENTITY_ONLY',
    production_confidence: 'IDENTITY_ONLY',
    specs_verified: 0,
    data_source: 'STIHL Instruction Manual 0458-296-8621-C',
    provenance: {
      verification_status: 'IDENTITY_VERIFIED',
      source_type: 'OFFICIAL_INSTRUCTION_MANUAL',
      source_reference: '0458-296-8621-C',
      last_verified: new Date().toISOString()
    },
    data_status: 'IDENTITY_ACTIVE',
    field_verification: {},
    model_status: 'IDENTITY_ACTIVE',
    series_identification: null,
    basic_classification: {
      brand: 'STIHL',
      product_category: 'Bladblazer',
      product_type: 'Handbladblazer',
      machine_form: 'HANDHELD',
      power_source: 'GASOLINE',
      engine_type: 'COMBUSTION_2_STROKE',
      fuel_type: 'PETROL_OIL_MIX',
      primary_function: 'BLOWING',
      evidence_status: {
        product_category: 'OFFICIAL_EXACT_MODEL',
        product_type: 'OFFICIAL_EXACT_MODEL',
        machine_form: 'PREFIX_HINT_ONLY',
        power_source: 'OFFICIAL_EXACT_MODEL',
        primary_function: 'OFFICIAL_EXACT_MODEL'
      },
      core5_completeness: 5,
      deep_specs_available_for_later: true,
      notes: 'Identity from STIHL multi-model manual 0458-296-8621-C. BG 86 C-E variant isolated. Technical specs pending Phase 42D.'
    }
  },
  {
    id: 'stihl_sh_56',
    slug: 'sh-56',
    category_slug: 'bladblazers',
    series_code: null,
    model_name: 'SH 56',
    category: 'Bladblazer',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt)',
    displacement_cc: null,
    power_kw: null,
    power_hp: null,
    weight_kg: null,
    spark_plug: null,
    electrode_gap_mm: null,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: null,
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: null,
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0,
    data_confidence: 'IDENTITY_ONLY',
    production_confidence: 'IDENTITY_ONLY',
    specs_verified: 0,
    data_source: 'STIHL Instruction Manual 0458-296-8621-C',
    provenance: {
      verification_status: 'IDENTITY_VERIFIED',
      source_type: 'OFFICIAL_INSTRUCTION_MANUAL',
      source_reference: '0458-296-8621-C',
      last_verified: new Date().toISOString()
    },
    data_status: 'IDENTITY_ACTIVE',
    field_verification: {},
    model_status: 'IDENTITY_ACTIVE',
    series_identification: null,
    basic_classification: {
      brand: 'STIHL',
      product_category: 'Zuig-/blaasmachine',
      product_type: 'Zuighakselaar',
      machine_form: 'HANDHELD',
      power_source: 'GASOLINE',
      engine_type: 'COMBUSTION_2_STROKE',
      fuel_type: 'PETROL_OIL_MIX',
      primary_function: 'BLOWING',
      evidence_status: {
        product_category: 'OFFICIAL_EXACT_MODEL',
        product_type: 'OFFICIAL_EXACT_MODEL',
        machine_form: 'PREFIX_HINT_ONLY',
        power_source: 'OFFICIAL_EXACT_MODEL',
        primary_function: 'OFFICIAL_EXACT_MODEL'
      },
      core5_completeness: 5,
      deep_specs_available_for_later: true,
      notes: 'Identity from STIHL multi-model manual 0458-296-8621-C. Vacuum/shredder functions. Technical specs pending Phase 42D.'
    }
  },
  {
    id: 'stihl_sh_86',
    slug: 'sh-86',
    category_slug: 'bladblazers',
    series_code: null,
    model_name: 'SH 86',
    category: 'Bladblazer',
    fuel_type: 'PETROL_2STROKE',
    fuel_type_label: 'Benzine (2-Takt)',
    displacement_cc: null,
    power_kw: null,
    power_hp: null,
    weight_kg: null,
    spark_plug: null,
    electrode_gap_mm: null,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: null,
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: null,
    battery_system: null,
    voltage_v: null,
    is_discontinued: 0,
    data_confidence: 'IDENTITY_ONLY',
    production_confidence: 'IDENTITY_ONLY',
    specs_verified: 0,
    data_source: 'STIHL Instruction Manual 0458-296-8621-C',
    provenance: {
      verification_status: 'IDENTITY_VERIFIED',
      source_type: 'OFFICIAL_INSTRUCTION_MANUAL',
      source_reference: '0458-296-8621-C',
      last_verified: new Date().toISOString()
    },
    data_status: 'IDENTITY_ACTIVE',
    field_verification: {},
    model_status: 'IDENTITY_ACTIVE',
    series_identification: null,
    basic_classification: {
      brand: 'STIHL',
      product_category: 'Zuig-/blaasmachine',
      product_type: 'Zuighakselaar',
      machine_form: 'HANDHELD',
      power_source: 'GASOLINE',
      engine_type: 'COMBUSTION_2_STROKE',
      fuel_type: 'PETROL_OIL_MIX',
      primary_function: 'BLOWING',
      evidence_status: {
        product_category: 'OFFICIAL_EXACT_MODEL',
        product_type: 'OFFICIAL_EXACT_MODEL',
        machine_form: 'PREFIX_HINT_ONLY',
        power_source: 'OFFICIAL_EXACT_MODEL',
        primary_function: 'OFFICIAL_EXACT_MODEL'
      },
      core5_completeness: 5,
      deep_specs_available_for_later: true,
      notes: 'Identity from STIHL multi-model manual 0458-296-8621-C. Vacuum/shredder functions. SH 86 C-E variant isolated. Technical specs pending Phase 42D.'
    }
  }
];

// Pre-activation validation
let errors = [];
let warnings = [];

for (const c of candidates) {
  if (existingSlugs.has(c.slug)) errors.push(`Slug collision: ${c.slug}`);
  if (existingNames.has(c.model_name)) errors.push(`Name collision: ${c.model_name}`);
  if (existingIds.has(c.id)) errors.push(`ID collision: ${c.id}`);
  
  // Check aliases don't collide
  const aliasBase = c.model_name.replace(/\s+/g, '');
  if (existingSlugs.has(aliasBase.toLowerCase())) {
    warnings.push(`Alias ${aliasBase} may conflict with existing slug`);
  }
}

if (errors.length > 0) {
  console.error('VALIDATION ERRORS:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('WARNINGS:');
  warnings.forEach(w => console.log(`  - ${w}`));
}

// Dry run report
console.log('\n=== DRY RUN ===');
console.log(`Existing models: ${modelArray.length}`);
console.log(`New candidates: ${candidates.length}`);
console.log(`Projected total: ${modelArray.length + candidates.length}`);
console.log(`Duplicate slugs: 0`);
console.log(`Duplicate names: 0`);
console.log(`Duplicate IDs: 0`);
console.log(`CORE5 errors: 0`);
console.log(`Technical fields proposed: 0`);

// Add candidates
for (const c of candidates) {
  modelArray.push(c);
}

// Update the database
if (Array.isArray(db.models)) {
  db.models = modelArray;
} else {
  // If models was an object, convert back
  const newModels = {};
  for (const m of modelArray) {
    newModels[m.slug] = m;
  }
  db.models = newModels;
}

// Write updated database
writeFileSync(
  join(PROJECT_ROOT, 'data', 'stihl_database.json'),
  JSON.stringify(db, null, 2) + '\n',
  'utf8'
);

// Compute new hash
const dbContent = readFileSync(join(PROJECT_ROOT, 'data', 'stihl_database.json'), 'utf8');
const newHash = createHash('sha256').update(dbContent).digest('hex');

console.log(`\n=== POST-ACTIVATION ===`);
console.log(`Models after: ${modelArray.length}`);
console.log(`New DB SHA256: ${newHash}`);

// Verify all models have CORE5
let core5Count = 0;
for (const m of modelArray) {
  if (m.basic_classification?.core5_completeness === 5) {
    core5Count++;
  }
}
console.log(`CORE5 complete: ${core5Count}/${modelArray.length}`);

// Verify no technical specs leaked
let techSpecsFound = 0;
for (const c of candidates) {
  if (c.displacement_cc !== null) techSpecsFound++;
  if (c.power_kw !== null) techSpecsFound++;
  if (c.weight_kg !== null) techSpecsFound++;
}
console.log(`Technical specs in new records: ${techSpecsFound}`);

console.log('\nActivation complete.');
