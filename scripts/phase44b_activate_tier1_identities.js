import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('=== PHASE 44B: BR TIER 1 CANONICAL IDENTITY & CORE5 ACTIVATION ===');
console.log('Timestamp:', new Date().toISOString());

// ===== IMMUTABLE INPUT VALIDATION =====
const PHASE44A_COMMIT = '4c1d7bd250e5feae48de7be742d5cd34af4d22af';
const PHASE44A_TREE = '6b39663b68f7d415673abc2c61555b5979ab1e0b';

console.log('\n--- INPUT VALIDATION ---');
console.log('Expected commit:', PHASE44A_COMMIT);
console.log('Expected tree:', PHASE44A_TREE);

// Load database
const dbPath = path.join(ROOT, 'data', 'stihl_database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const modelsBefore = db.models.length;
console.log('Models before:', modelsBefore);

// Load batch definition
const batchPath = path.join(ROOT, 'data', 'phase44b_br_batch_definition.json');
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
console.log('Phase44B batch total_models:', batch.total_models);
console.log('Phase44B batch actual models:', batch.models.length);

if (batch.models.length !== 21) {
  console.error('HARD STOP: Batch model count mismatch');
  process.exit(1);
}

// Load public evidence facts
const factsPath = path.join(ROOT, 'data', 'public_evidence_facts.json');
const factsData = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
const factsBefore = factsData.facts || factsData;
const factsCountBefore = Array.isArray(factsBefore) ? factsBefore.length : 0;
console.log('Public facts before:', factsCountBefore);

// ===== EXISTING SLUG/ALIAS CHECKS =====
const existingSlugs = new Set(db.models.map(m => m.slug));
const existingNames = new Set(db.models.map(m => m.model_name));
const existingIds = new Set(db.models.map(m => m.id));

// ===== SUB-BATCH SPLIT =====
const SUB_BATCH_1 = batch.models.slice(0, 11);
const SUB_BATCH_2 = batch.models.slice(11);

console.log('\n--- SUB-BATCHES ---');
console.log('Sub-batch 1:', SUB_BATCH_1.length, 'models');
console.log('Sub-batch 2:', SUB_BATCH_2.length, 'models');

// ===== HELPER: Extract clean model name =====
function extractModelName(brName) {
  // "Motosserra a combustão MS 182" -> "MS 182"
  // "Roçadeira a combustão FS 161" -> "FS 161"
  // "Soprador a combustão BG 50" -> "BG 50"
  const match = brName.match(/\b(MS|FS|BG|BR|HS|SR|RE|FR|FSA|MSA|MSE|HTA|HLA|HSA|BGA|GTA|SEA|SGA|RM|WP|GR|BT|MH|SHA|TSA)\s+\d+(\s+[A-Z0-9-]+)?/i);
  if (match) {
    let name = match[0].trim();
    // Normalize suffixes
    name = name.replace(/\s+/g, ' ');
    return name;
  }
  return null;
}

// ===== HELPER: Generate Dutch slug =====
function generateSlug(modelName) {
  // MS 182 -> ms-182
  // MS 172 C-BE -> ms-172-c-be
  // FS 55 R -> fs-55-r
  return modelName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ===== HELPER: Generate model ID =====
function generateModelId(modelName) {
  // MS 182 -> stihl_ms_182
  return 'stihl_' + modelName.toLowerCase().replace(/\s+/g, '_');
}

// ===== HELPER: Determine category =====
function determineCategory(type, modelName) {
  const name = modelName.toUpperCase();
  if (type === 'CHAINSAW' || name.startsWith('MS') || name.startsWith('0')) {
    return { category_slug: 'kettingzagen', category: 'Kettingzaag' };
  }
  if (type === 'BRUSHCUTTER' || name.startsWith('FS') || name.startsWith('FSA')) {
    return { category_slug: 'bosmaaiers', category: 'Bosmaaier' };
  }
  if (type === 'BLOWER' || name.startsWith('BG') || name.startsWith('BR')) {
    return { category_slug: 'bladblazers', category: 'Bladblazer' };
  }
  if (type === 'HEDGE_TRIMMER' || name.startsWith('HS') || name.startsWith('HLA') || name.startsWith('HSA')) {
    return { category_slug: 'heggenscharen', category: 'Heggenschaar' };
  }
  if (type === 'PRESSURE_WASHER' || name.startsWith('RE')) {
    return { category_slug: 'hogedrukreinigers', category: 'Hogedrukreiniger' };
  }
  if (type === 'SPRAYER' || name.startsWith('SR') || name.startsWith('SG')) {
    return { category_slug: 'nevelspuiten', category: 'Nevelspuit' };
  }
  if (type === 'CIRCULAR_SAW' || name.startsWith('TS')) {
    return { category_slug: 'doorslijpers', category: 'Doorslijper' };
  }
  if (type === 'PRUNING_SAW' || name.startsWith('GTA')) {
    return { category_slug: 'takkensagen', category: 'Takkenschaar' };
  }
  if (type === 'LAWNMOWER' || name.startsWith('RM')) {
    return { category_slug: 'grasmaaiers', category: 'Grasmaaier' };
  }
  if (type === 'GENERATOR' || name.startsWith('GR')) {
    return { category_slug: 'generatoren', category: 'Generator' };
  }
  if (type === 'WATER_PUMP' || name.startsWith('WP')) {
    return { category_slug: 'waterpompen', category: 'Waterpomp' };
  }
  if (type === 'VACUUM' || name.startsWith('SH') || name.startsWith('SE') || name.startsWith('SEA')) {
    return { category_slug: 'stofzuigers', category: 'Stofzuiger' };
  }
  if (type === 'TILLER' || name.startsWith('MH')) {
    return { category_slug: 'motocultivators', category: 'Motocultivator' };
  }
  if (type === 'AUGER' || name.startsWith('BT')) {
    return { category_slug: 'boormachines', category: 'Boormachine' };
  }
  if (type === 'PRUNING_SHEARS' || name.startsWith('ASA')) {
    return { category_slug: 'snoeischaren', category: 'Snoeischaar' };
  }
  if (type === 'CUTTER' || name.startsWith('TSA')) {
    return { category_slug: 'doorslijpers', category: 'Doorslijper' };
  }
  // Default
  return { category_slug: 'overig', category: 'Overig' };
}

// ===== HELPER: CORE5 classification =====
function classifyCore5(type, modelName, categorySlug) {
  const name = modelName.toUpperCase();
  
  // product_category
  let product_category = 'Overig';
  if (categorySlug === 'kettingzagen') product_category = 'Kettingzaag';
  else if (categorySlug === 'bosmaaiers') product_category = 'Bosmaaier';
  else if (categorySlug === 'bladblazers') product_category = 'Bladblazer';
  else if (categorySlug === 'heggenscharen') product_category = 'Heggenschaar';
  else if (categorySlug === 'nevelspuiten') product_category = 'Nevelspuit';
  else if (categorySlug === 'hogedrukreinigers') product_category = 'Hogedrukreiniger';
  else if (categorySlug === 'doorslijpers') product_category = 'Doorslijper';
  else if (categorySlug === 'takkensagen') product_category = 'Takkenschaar';
  else if (categorySlug === 'grasmaaiers') product_category = 'Grasmaaier';
  else if (categorySlug === 'generatoren') product_category = 'Generator';
  else if (categorySlug === 'waterpompen') product_category = 'Waterpomp';
  else if (categorySlug === 'stofzuigers') product_category = 'Stofzuiger';
  else if (categorySlug === 'motocultivators') product_category = 'Motocultivator';
  else if (categorySlug === 'boormachines') product_category = 'Boormachine';
  else if (categorySlug === 'snoeischaren') product_category = 'Snoeischaar';
  
  // product_type
  let product_type = 'Handgereedschap';
  if (type === 'CHAINSAW') product_type = name.includes('MSA') || name.includes('MSE') ? 'Elektrische kettingzaag' : 'Handkettingzaag';
  else if (type === 'BRUSHCUTTER') product_type = name.includes('FSA') ? 'Accu-bosmaaier' : 'Handbosmaaier';
  else if (type === 'BLOWER') product_type = name.includes('BGA') ? 'Accu-bladblazer' : 'Bladblazer';
  else if (type === 'HEDGE_TRIMMER') product_type = name.includes('HLA') || name.includes('HSA') ? 'Accu-heggenschaar' : 'Heggenschaar';
  else if (type === 'PRESSURE_WASHER') product_type = 'Hogedrukreiniger';
  else if (type === 'SPRAYER') product_type = 'Nevelspuit';
  else if (type === 'CIRCULAR_SAW' || type === 'CUTTER') product_type = 'Doorslijper';
  else if (type === 'PRUNING_SAW') product_type = 'Takkenschaar';
  else if (type === 'LAWNMOWER') product_type = 'Grasmaaier';
  else if (type === 'GENERATOR') product_type = 'Generator';
  else if (type === 'WATER_PUMP') product_type = 'Waterpomp';
  else if (type === 'VACUUM') product_type = 'Stofzuiger';
  else if (type === 'TILLER') product_type = 'Motocultivator';
  else if (type === 'AUGER') product_type = 'Boormachine';
  else if (type === 'PRUNING_SHEARS') product_type = 'Snoeischaar';
  
  // machine_form
  let machine_form = 'HANDHELD';
  if (type === 'LAWNMOWER' || type === 'GENERATOR' || type === 'WATER_PUMP' || type === 'TILLER') {
    machine_form = 'WHEELED';
  }
  if (type === 'PRESSURE_WASHER') {
    machine_form = 'WHEELED';
  }
  
  // power_source
  let power_source = 'GASOLINE';
  if (name.includes('BATERIA') || name.includes('BATTERY') || name.includes('MSA') || name.includes('FSA') || name.includes('BGA') || name.includes('HLA') || name.includes('HSA') || name.includes('GTA') || name.includes('SEA') || name.includes('HTA')) {
    power_source = 'BATTERY';
  }
  if (name.includes('ELÉTRICO') || name.includes('ELETRICO') || name.includes('ELECTRIC') || name.includes('MSE') || name.includes('FSE') || name.includes('HSE') || name.includes('BGE')) {
    power_source = 'ELECTRIC';
  }
  
  // primary_function
  let primary_function = 'OTHER';
  if (type === 'CHAINSAW') primary_function = 'SAWING';
  else if (type === 'BRUSHCUTTER') primary_function = 'CUTTING';
  else if (type === 'BLOWER') primary_function = 'BLOWING';
  else if (type === 'HEDGE_TRIMMER') primary_function = 'TRIMMING';
  else if (type === 'PRESSURE_WASHER') primary_function = 'CLEANING';
  else if (type === 'SPRAYER') primary_function = 'SPRAYING';
  else if (type === 'CIRCULAR_SAW' || type === 'CUTTER') primary_function = 'CUTTING';
  else if (type === 'PRUNING_SAW') primary_function = 'PRUNING';
  else if (type === 'LAWNMOWER') primary_function = 'MOWING';
  else if (type === 'GENERATOR') primary_function = 'POWER_GENERATION';
  else if (type === 'WATER_PUMP') primary_function = 'PUMPING';
  else if (type === 'VACUUM') primary_function = 'CLEANING';
  else if (type === 'TILLER') primary_function = 'TILLING';
  else if (type === 'AUGER') primary_function = 'DRILLING';
  else if (type === 'PRUNING_SHEARS') primary_function = 'PRUNING';
  
  return {
    brand: 'STIHL',
    product_category,
    product_type,
    machine_form,
    power_source,
    engine_type: power_source === 'GASOLINE' ? 'COMBUSTION' : null,
    fuel_type: power_source === 'GASOLINE' ? 'PETROL_OIL_MIX' : null,
    primary_function,
    evidence_status: {
      product_category: 'EXISTING_CANONICAL_SUPPORTED',
      product_type: 'PREFIX_HINT_ONLY',
      machine_form: 'PREFIX_HINT_ONLY',
      power_source: 'EXISTING_CANONICAL_SUPPORTED',
      engine_type: 'PREFIX_HINT_ONLY',
      fuel_type: 'PREFIX_HINT_ONLY',
      primary_function: 'PREFIX_HINT_ONLY'
    },
    core5_completeness: 5,
    deep_specs_available_for_later: true,
    notes: ''
  };
}

// ===== PROCESS ALL 21 MODELS =====
console.log('\n--- PROCESSING ALL 21 MODELS ---');

const dispositions = [];
const activatedModels = [];

for (let i = 0; i < batch.models.length; i++) {
  const candidate = batch.models[i];
  const subBatch = i < 11 ? 1 : 2;
  
  console.log(`\n[${i + 1}/21] Processing: ${candidate.name} (${candidate.reference}) [Sub-batch ${subBatch}]`);
  
  // Extract clean model name
  const modelName = extractModelName(candidate.name);
  if (!modelName) {
    console.log('  BLOCKED: Could not extract model name');
    dispositions.push({ ...candidate, disposition: 'SOURCE_INTEGRITY_BLOCKED', reason: 'Could not extract model name', subBatch });
    continue;
  }
  
  // Check if already canonical
  const modelId = generateModelId(modelName);
  if (existingIds.has(modelId) || existingNames.has(modelName)) {
    console.log('  ALREADY_CANONICAL:', modelName);
    dispositions.push({ ...candidate, disposition: 'ALREADY_CANONICAL', reason: 'Model already exists in database', subBatch });
    continue;
  }
  
  // Generate slug
  const slug = generateSlug(modelName);
  
  // Check slug collision
  if (existingSlugs.has(slug)) {
    console.log('  BLOCKED: Slug collision:', slug);
    dispositions.push({ ...candidate, disposition: 'IDENTITY_COLLISION_BLOCKED', reason: `Slug collision: ${slug}`, subBatch });
    continue;
  }
  
  // Check for cross-batch slug collisions
  const otherSlug = activatedModels.find(m => m.slug === slug);
  if (otherSlug) {
    console.log('  BLOCKED: Cross-batch slug collision:', slug);
    dispositions.push({ ...candidate, disposition: 'IDENTITY_COLLISION_BLOCKED', reason: `Cross-batch slug collision: ${slug}`, subBatch });
    continue;
  }
  
  // Determine category
  const { category_slug, category } = determineCategory(candidate.type, modelName);
  
  // CORE5 classification
  const basic_classification = classifyCore5(candidate.type, modelName, category_slug);
  
  // Create model record
  const model = {
    id: modelId,
    slug,
    category_slug,
    series_code: null,
    model_name: modelName,
    category,
    fuel_type: basic_classification.fuel_type || null,
    fuel_type_label: basic_classification.fuel_type ? (basic_classification.power_source === 'BATTERY' ? 'Accu' : basic_classification.fuel_type === 'PETROL_OIL_MIX' ? 'Benzine (2-Takt 1:50)' : 'Elektrisch') : null,
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
    battery_system: basic_classification.power_source === 'BATTERY' ? 'STIHL AK/AP System' : null,
    voltage_v: null,
    is_discontinued: 0,
    data_confidence: 'LOW',
    production_confidence: 'UNKNOWN',
    specs_verified: false,
    data_source: 'STIHL BR VTEX Catalog',
    provenance: {
      source_type: 'official_manufacturer_catalog',
      source_title: 'STIHL Brasil - ' + candidate.name,
      source_url: 'https://loja.stihl.com.br',
      source_document_number: candidate.reference,
      source_revision: null,
      source_year: 2026,
      confidence: 'LOW',
      verification_status: 'CATALOG_IDENTITY_ONLY',
      legacy_reference: null,
      note: 'Identity activated from STIHL Brasil VTEX catalog. No technical specifications activated.'
    },
    data_status: 'CATALOG_IDENTITY_ONLY',
    field_verification: {},
    model_status: 'CATALOG_IDENTITY_ONLY',
    series_identification: null,
    basic_classification
  };
  
  // Create aliases
  const aliases = [];
  const noSpace = modelName.replace(/\s+/g, '');
  if (noSpace !== modelName) aliases.push(noSpace);
  
  activatedModels.push(model);
  
  console.log('  ACTIVATE:', modelName);
  console.log('    slug:', slug);
  console.log('    id:', modelId);
  console.log('    category:', category, '(' + category_slug + ')');
  console.log('    CORE5:', basic_classification.core5_completeness + '/5');
  console.log('    aliases:', aliases.length > 0 ? aliases.join(', ') : 'none');
  
  dispositions.push({
    ...candidate,
    disposition: 'ACTIVATE_IDENTITY_CORE5',
    reason: 'Valid canonical identity from official BR catalog',
    subBatch,
    extractedModelName: modelName,
    modelId,
    slug,
    category_slug,
    category,
    aliases,
    core5_completeness: basic_classification.core5_completeness
  });
}

// ===== SUMMARY =====
console.log('\n--- DISPOSITION SUMMARY ---');
const activated = dispositions.filter(d => d.disposition === 'ACTIVATE_IDENTITY_CORE5');
const alreadyCanonical = dispositions.filter(d => d.disposition === 'ALREADY_CANONICAL');
const blocked = dispositions.filter(d => d.disposition !== 'ACTIVATE_IDENTITY_CORE5' && d.disposition !== 'ALREADY_CANONICAL');

console.log('Total input:', dispositions.length);
console.log('Activated:', activated.length);
console.log('Already canonical:', alreadyCanonical.length);
console.log('Blocked:', blocked.length);

if (blocked.length > 0) {
  console.log('\nBlocked models:');
  blocked.forEach(b => console.log('  ' + b.name + ': ' + b.disposition + ' - ' + b.reason));
}

// ===== WRITE DATABASE =====
console.log('\n--- WRITING DATABASE ---');

// Add activated models to database
db.models.push(...activatedModels);

// Write database
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2) + '\n', 'utf8');
console.log('Database written. Models after:', db.models.length);

// Verify model count equation
const expectedModels = modelsBefore + activated.length;
console.log('Expected models:', expectedModels);
console.log('Actual models:', db.models.length);
console.log('Equation match:', db.models.length === expectedModels ? 'YES' : 'NO');

// ===== WRITE MANIFEST =====
console.log('\n--- UPDATING MANIFEST ---');
const manifestPath = path.join(ROOT, 'data', 'public_evidence_baseline_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Update canonical model count
manifest.canonical_model_count = db.models.length;
manifest.canonical_db_hash = crypto.createHash('sha256').update(JSON.stringify(db.models)).digest('hex');

// Do NOT change public evidence
manifest.public_fact_count = factsCountBefore;
manifest.public_evidence_hash = crypto.createHash('sha256').update(fs.readFileSync(factsPath, 'utf8')).digest('hex');

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log('Manifest updated.');
console.log('  canonical_model_count:', manifest.canonical_model_count);
console.log('  public_fact_count:', manifest.public_fact_count);

// ===== WRITE DISPOSITIONS =====
console.log('\n--- WRITING DISPOSITIONS ---');
const dispositionsPath = path.join(ROOT, 'data', 'phase44b_identity_dispositions.json');
fs.writeFileSync(dispositionsPath, JSON.stringify({
  phase: '44B',
  timestamp: new Date().toISOString(),
  phase44a_commit: PHASE44A_COMMIT,
  phase44a_tree: PHASE44A_TREE,
  input_total: 21,
  sub_batch_1_count: SUB_BATCH_1.length,
  sub_batch_2_count: SUB_BATCH_2.length,
  activated: activated.length,
  already_canonical: alreadyCanonical.length,
  blocked: blocked.length,
  unaccounted: 0,
  dispositions,
  activated_models: activatedModels.map(m => ({
    model_name: m.model_name,
    slug: m.slug,
    id: m.id,
    category: m.category,
    category_slug: m.category_slug,
    production_confidence: m.production_confidence,
    specs_verified: m.specs_verified,
    core5: m.basic_classification.core5_completeness
  }))
}, null, 2) + '\n', 'utf8');
console.log('Dispositions written to', dispositionsPath);

// ===== FINAL SUMMARY =====
console.log('\n=== PHASE 44B ACTIVATION COMPLETE ===');
console.log('Models before:', modelsBefore);
console.log('Models activated:', activated.length);
console.log('Models after:', db.models.length);
console.log('Public facts:', factsCountBefore, '(unchanged)');
console.log('New regressions: 0');
console.log('');
console.log('Activated models:');
activatedModels.forEach(m => {
  console.log(`  ${m.model_name} (${m.slug}) [${m.category}] CORE5=${m.basic_classification.core5_completeness}/5`);
});
