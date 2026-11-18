import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const dbPath = path.join(ROOT, 'data', 'stihl_database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'phase91', 'model_inventory.json'), 'utf8'));
const fitmentModelIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'phase91', 'fitment_model_ids.json'), 'utf8'));
const partsConfigs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'parts_model_configurations.json'), 'utf8'));
const partsVariants = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'parts_model_variants.json'), 'utf8'));

// 1. Write compact fitment_model_index.json for O(1) PartCatalogResolver loading
const fitmentCidSet = new Set(fitmentModelIds);
for (const c of (partsConfigs.configurations || [])) {
  if (c.canonical_model_id && !/^\d{4,}_/.test(c.canonical_model_id)) {
    fitmentCidSet.add(c.canonical_model_id);
  }
}
const compactFitmentIndex = {
  schema_version: 'fitment-model-index-v1',
  generated_at: new Date().toISOString(),
  count: fitmentCidSet.size,
  canonical_model_ids: Array.from(fitmentCidSet).sort()
};
fs.writeFileSync(path.join(ROOT, 'data', 'fitment_model_index.json'), JSON.stringify(compactFitmentIndex, null, 2));

// Enrich original 110 models ONLY with non-breaking documented variants & aliases arrays from inventory (preserving CORE5/identity/specs_verified untouched)
const invByUpper = new Map(inv.models.map(m => [m.base_model.toUpperCase(), m]));
const originalModels = db.models.slice(0, 110).map(orig => {
  const invMatch = invByUpper.get((orig.model_name || '').toUpperCase().trim());
  const copy = { ...orig };
  if (invMatch && Array.isArray(invMatch.variants) && invMatch.variants.length > 0) {
    const mergedVars = new Set([...(Array.isArray(orig.variants) ? orig.variants : []), ...invMatch.variants]);
    copy.variants = Array.from(mergedVars);
  }
  const origAliases = new Set(Array.isArray(orig.aliases) ? orig.aliases : []);
  origAliases.add(`STIHL ${orig.model_name}`);
  if (/^0\d{2}$/.test(orig.model_name)) {
    origAliases.add(`MS ${orig.model_name}`);
    origAliases.add(`MS${orig.model_name}`);
  } else {
    origAliases.add(orig.model_name.replace(/\s+/g, ''));
  }
  copy.aliases = Array.from(origAliases);
  return copy;
});
const existingNamesUpper = new Set(originalModels.map(m => (m.model_name || '').toUpperCase().trim()));
const existingSlugs = new Set(originalModels.map(m => (m.slug || '').toLowerCase().trim()));
const existingIds = new Set(originalModels.map(m => (m.id || '').toLowerCase().trim()));

// Collect SPW verified models even if fit=0 for genuine modern cordless/electric/TS models
const spwVerifiedModels = new Set();
for (const v of (partsVariants.variants || [])) {
  if (v.source_url && v.source_url.includes('sparepartsworld.co.uk') && v.base_model_name) {
    spwVerifiedModels.add(v.base_model_name.toUpperCase().trim());
  }
}

const MODERN_SPW_ALLOW = new Set([
  'BGA 50', 'BGA 160', 'BGA 300', 'BGE 81',
  'FSA 80', 'FSA 110', 'FSA 400',
  'HSA 60', 'HSA 140', 'HSA 150', 'HTA 50',
  'KM 235', 'KMA 80', 'KMA 120', 'KMA 200',
  'MSA 80', 'MSE 250', 'SGA 30', 'SGA 60', 'SHE 81',
  'TSA 300', 'TSA 350'
]);

const importedModels = [];
const skippedReasons = [];

for (const entry of inv.models) {
  if (entry.in_existing_db) continue;
  const name = entry.base_model;
  const upper = name.toUpperCase();

  // Exclude colloquial "MS 0xx" typos from canonical models (mapped as aliases to 0xx below!)
  if (/^MS\s+0\d{2}$/i.test(name)) {
    skippedReasons.push({ name, reason: 'MAPPED_AS_ALIAS_TO_0XX' });
    continue;
  }

  const isEligible = (
    entry.source_count >= 2 ||
    Boolean(entry.sources.stihl_local_library_ts_data) ||
    Boolean(entry.sources.stihl_manuel_service_db) ||
    Boolean(entry.sources.stihlusa_official) ||
    Boolean(entry.sources.stihl_models_full_output) ||
    entry.fitment_count >= 1 ||
    name === '050' ||
    (MODERN_SPW_ALLOW.has(upper) && spwVerifiedModels.has(upper))
  );

  if (!isEligible) {
    skippedReasons.push({ name, reason: 'INSUFFICIENT_EVIDENCE' });
    continue;
  }

  if (existingNamesUpper.has(upper)) {
    skippedReasons.push({ name, reason: 'NAME_ALREADY_IN_ORIGINAL_110' });
    continue;
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = `stihl_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

  if (existingSlugs.has(slug) || existingIds.has(id)) {
    skippedReasons.push({ name, reason: 'SLUG_OR_ID_COLLISION' });
    continue;
  }

  existingNamesUpper.add(upper);
  existingSlugs.add(slug);
  existingIds.add(id);

  const cls = entry.classification;
  const specs = entry.verified_specs || {};
  const specSources = entry.spec_sources || {};
  const hasVerifiedSpecs = Boolean(specs.displacement_cc || specs.power_kw || specs.spark_plug);

  // Build explicit field_sources for publicEvidence dynamic synthesis without mutating 761 facts
  const fieldSources = {};
  if (specs.displacement_cc != null) {
    fieldSources.displacement_cc = { value: specs.displacement_cc, unit: 'cc', source: specSources.displacement_cc, status: 'OFFICIAL_DOCUMENTED' };
  }
  if (specs.power_kw != null) {
    fieldSources.power_kw = { value: specs.power_kw, unit: 'kW', source: specSources.power_kw, status: 'OFFICIAL_DOCUMENTED' };
  }
  if (specs.power_hp != null) {
    fieldSources.power_hp = { value: specs.power_hp, unit: 'pk', source: specSources.power_hp, status: 'OFFICIAL_DOCUMENTED' };
  }
  if (specs.spark_plug != null) {
    fieldSources.spark_plug = { value: specs.spark_plug, unit: null, source: specSources.spark_plug, status: 'OFFICIAL_DOCUMENTED' };
  }
  if (specs.electrode_gap_mm != null) {
    fieldSources.electrode_gap_mm = { value: specs.electrode_gap_mm, unit: 'mm', source: specSources.electrode_gap_mm, status: 'OFFICIAL_DOCUMENTED' };
  }

  // Confirmed variants & safe aliases (never invent C/BE suffixes when not in sources!)
  const documentedVariants = Array.isArray(entry.variants) ? [...entry.variants] : [];
  const aliases = new Set([`STIHL ${name}`]);
  if (!/^0\d{2}$/.test(name) && name !== 'CONTRA') {
    aliases.add(name.replace(/\s+/g, '')); // e.g. MS250
  } else if (/^0\d{2}$/.test(name)) {
    aliases.add(`MS ${name}`); // colloquial typo MS 023 -> 023
    aliases.add(`MS${name}`);
  }

  const primarySeriesCode = entry.series_codes && entry.series_codes.length > 0 ? String(entry.series_codes[0]) : null;

  const modelRecord = {
    id,
    slug,
    category_slug: cls.category_slug,
    series_code: primarySeriesCode,
    model_name: name,
    category: cls.category,
    fuel_type: cls.fuel_type,
    fuel_type_label: cls.fuel_type_label,
    displacement_cc: specs.displacement_cc ?? null,
    power_kw: specs.power_kw ?? null,
    power_hp: specs.power_hp ?? null,
    weight_kg: null,
    spark_plug: specs.spark_plug ?? null,
    electrode_gap_mm: specs.electrode_gap_mm ?? null,
    carb_h_setting: null,
    carb_l_setting: null,
    carb_la_setting: null,
    chain_pitch: null,
    chain_gauge_mm: null,
    oil_mix_ratio: null,
    battery_system: null,
    voltage_v: null,
    is_discontinued: /^0\d{2}$/.test(name) || name === 'CONTRA' ? 1 : null,
    data_confidence: hasVerifiedSpecs || entry.source_count >= 3 ? 'HIGH' : 'MEDIUM',
    production_confidence: 'UNKNOWN',
    specs_verified: false,
    data_source: Object.keys(entry.sources).join(', '),
    provenance: {
      source_type: 'phase91_verified_local_import',
      sources: Object.keys(entry.sources),
      source_samples: entry.sources,
      fitment_canonical_ids: entry.fitment_canonical_ids,
      fitment_count: entry.fitment_count,
      verification_status: hasVerifiedSpecs ? 'OFFICIAL_TS_DATA_AND_CATALOG' : 'MULTI_SOURCE_CATALOG_VERIFIED'
    },
    data_status: 'IMPORTED_EVIDENCED_MODEL',
    field_sources: fieldSources,
    field_verification: fieldSources,
    model_status: 'PUBLISHED',
    series_identification: primarySeriesCode,
    variants: documentedVariants,
    aliases: Array.from(aliases),
    basic_classification: {
      brand: 'STIHL',
      product_category: cls.category,
      machine_form: 'HANDHELD',
      equipment_type: cls.equipment_type,
      power_source: cls.fuel_type === 'BATTERY' ? 'BATTERY' : cls.fuel_type === 'ELECTRIC' ? 'ELECTRIC' : 'GASOLINE',
      fuel_type: cls.fuel_type
    }
  };

  importedModels.push(modelRecord);
}

// Also ensure original 110 models inherit TS_Data specs if they lack field_sources AND we have verified TS_Data (stored strictly on field_sources without mutating id/slug/model_name/CORE5!)
// Wait: phase46b/phase46c check specs_verified === false on original 110, so DO NOT touch specs_verified on original 110! Just enrich database.aliases safely!

const allModels = [...originalModels, ...importedModels];

// Build canonical database.aliases lookup map (no collisions with canonical model_names)
const canonicalUpper = new Set(allModels.map(m => m.model_name.toUpperCase()));
const aliasesMap = {};
for (const m of allModels) {
  const cname = m.model_name;
  // Legacy 0xx colloquial aliases (MS 023 -> 023, MS 026 -> 026)
  if (/^0\d{2}$/.test(cname)) {
    for (const a of [`MS ${cname}`, `MS${cname}`, `STIHL ${cname}`]) {
      const k = a.toUpperCase();
      if (!canonicalUpper.has(k)) aliasesMap[k] = cname;
    }
  } else {
    const compact = cname.replace(/\s+/g, '').toUpperCase();
    if (!canonicalUpper.has(compact) && compact !== cname.toUpperCase()) {
      aliasesMap[compact] = cname;
    }
    const branded = `STIHL ${cname}`.toUpperCase();
    aliasesMap[branded] = cname;
  }
  // Map explicit non-conflicting variants ONLY if there is no separate canonical model
  for (const v of (m.variants || [])) {
    const vk = String(v).toUpperCase().trim();
    if (!canonicalUpper.has(vk)) {
      aliasesMap[vk] = cname;
      aliasesMap[vk.replace(/\s+/g, '')] = cname;
    }
  }
}

db.models = allModels;
db.aliases = aliasesMap;
if (!db.meta) db.meta = {};
db.meta.phase91_import = {
  imported_at: new Date().toISOString(),
  original_models_count: originalModels.length,
  imported_models_count: importedModels.length,
  total_models_count: allModels.length,
  legacy_0xx_count: allModels.filter(m => /^0\d{2}$/.test(m.model_name)).length,
  aliases_count: Object.keys(aliasesMap).length
};

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

console.log('=== PHASE 91 IMPORT COMPLETE ===');
console.log('Original preserved:', originalModels.length);
console.log('Newly imported verified models:', importedModels.length);
console.log('Total models in stihl_database.json:', allModels.length);
console.log('Legacy 0xx models in DB:', db.meta.phase91_import.legacy_0xx_count);
console.log('Database aliases count:', Object.keys(aliasesMap).length);
console.log('Compact fitment index models:', compactFitmentIndex.count);
console.log('Skipped reasons summary:', skippedReasons.reduce((acc, s) => { acc[s.reason] = (acc[s.reason] || 0) + 1; return acc; }, {}));
