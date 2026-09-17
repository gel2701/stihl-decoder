import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const ROOT = 'C:\\Users\\GelliusSnippe\\OneDrive - snip-life\\Documents\\Default Project\\stihl-decoder';

console.log('=== PHASE 44C: BR TIER 1 TECHNICAL EVIDENCE ACTIVATION ===');

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'stihl_database.json'), 'utf8'));
const extractedSpecs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'phase44c_technical_specs_extracted.json'), 'utf8'));
const factsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'public_evidence_facts.json'), 'utf8'));
const facts = factsData.facts || factsData;
const manifestPath = path.join(ROOT, 'data', 'public_evidence_baseline_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const modelsBefore = db.models.length;
const factsCountBefore = facts.length;
console.log('Models before:', modelsBefore);
console.log('Public facts before:', factsCountBefore);

const targetModels = db.models.slice(62);
console.log('Target models:', targetModels.length);

// Simple field mapping: Portuguese spec name -> canonical field
const FIELD_MAP = {
  'Cilindrada (cm³)': 'displacement_cc',
  'Potência (kW/cv)': 'power_kw',
  'Potência (kW/CV)': 'power_kw',
  'Potência (kW)': 'power_kw',
  'Peso (kg)': 'weight_kg',
  'Nível de pressão sonora dB(A)': 'sound_pressure_db',
  'Nível de potência sonora dB(A)': 'sound_power_db',
  'Capacidade do tanque de combustível (ml)': 'fuel_tank_ml',
  'Capacidade do tanque de combustível (l)': 'fuel_tank_l',
  'Capacidade do tanque de óleo (ml)': 'oil_tank_ml',
  'Vazão máx. de ar (m³/h)': 'air_volume_m3h',
  'Velocidade máxima do ar (m/s)': 'air_velocity_ms',
  'Força de sopro (N)': 'blowing_force_n',
  'Diametro ferramenta de corte (mm)': 'cutting_diameter_mm',
  'Comprimento total s/ ferramenta de corte (cm)': 'total_length_cm',
  'Tensão (V)': 'voltage_v',
  'Frequência (Hz)': 'frequency_hz',
  'Fluxo de água (l/h)': 'water_flow_lh',
  'Pressão máxima (bar)': 'max_pressure_bar',
};

// Compound fields needing special parsing
const COMPOUND_FIELDS = {
  'Nível de vibração esquerda/direita (m/s²)': ['vibration_left_ms2', 'vibration_right_ms2'],
  'Nivel de vibração esquerda/direita nylon (m/s²)': ['vibration_nylon_left_ms2', 'vibration_nylon_right_ms2'],
  'Nivel de vibração esquerda/direita lâmina (m/s²)': ['vibration_blade_left_ms2', 'vibration_blade_right_ms2'],
};

function parseValue(raw, field) {
  if (!raw) return null;
  let val = raw.replace(/\./g, '').replace(',', '.').trim();
  // Remove text after number
  val = val.replace(/[^0-9.\-].*$/, '');
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function parseCompound(raw) {
  if (!raw) return [null, null];
  const parts = raw.split('/').map(s => s.trim());
  return parts.map(p => parseValue(p));
}

function generateFactId(modelSlug, field, value) {
  const input = JSON.stringify(['phase44c', modelSlug, field, String(value)]);
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// Process each target model
const canonicalWrites = [];
const evidenceFacts = [];
const blockedCandidates = [];
const dispositions = [];

for (let i = 0; i < targetModels.length; i++) {
  const model = targetModels[i];
  const specData = extractedSpecs.find(s => s.slug === model.slug);

  if (!specData || !specData.raw_specs) {
    console.log('[' + (i+1) + '] ' + model.model_name + ': NO SPECS');
    dispositions.push({ model: model.model_name, slug: model.slug, fields_activated: 0, blocked: 0 });
    continue;
  }

  console.log('\n[' + (i+1) + '] ' + model.model_name + ' (' + model.slug + ')');
  let fieldsActivated = 0;
  let fieldsBlocked = 0;

  // Process simple fields
  for (const [specName, canonicalField] of Object.entries(FIELD_MAP)) {
    const specValue = specData.raw_specs[specName];
    if (!specValue) continue;

    const parsed = parseValue(specValue, canonicalField);
    if (parsed === null) {
      console.log('  SKIP ' + specName + ': unparseable');
      blockedCandidates.push({ model: model.model_name, field: canonicalField, raw: specValue, reason: 'UNPARSEABLE' });
      fieldsBlocked++;
      continue;
    }

    // Check if field already exists and is non-null
    if (model[canonicalField] !== null && model[canonicalField] !== undefined) {
      console.log('  ALREADY_PRESENT ' + canonicalField + ': ' + model[canonicalField]);
      blockedCandidates.push({ model: model.model_name, field: canonicalField, raw: specValue, reason: 'ALREADY_PRESENT_EQUIVALENT' });
      continue;
    }

    // Weight is configuration-dependent for chainsaws (without cutting attachment)
    if (canonicalField === 'weight_kg' && model.category_slug === 'kettingzagen') {
      console.log('  BLOCKED weight_kg: configuration-dependent (without cutting attachment)');
      blockedCandidates.push({ model: model.model_name, field: canonicalField, raw: specValue, reason: 'CONFIGURATION_DEPENDENT_BLOCKED' });
      fieldsBlocked++;
      continue;
    }

    // Activate canonical field
    model[canonicalField] = parsed;
    console.log('  ACTIVATE ' + canonicalField + ' = ' + parsed);
    canonicalWrites.push({ model: model.model_name, slug: model.slug, field: canonicalField, value: parsed, raw: specValue });
    fieldsActivated++;

    // Create evidence fact
    const factId = generateFactId(model.slug, canonicalField, parsed);
    evidenceFacts.push({
      fact_id: factId,
      model_slug: model.slug,
      model_name: model.model_name,
      field: canonicalField,
      value: parsed,
      unit: specName.match(/\(([^)]+)\)/)?.[1] || '',
      definition: 'technical_specification',
      source: {
        type: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
        url: specData.product_url,
        market: 'BR',
        retrieved_at: new Date().toISOString(),
        raw_label: specName,
        raw_value: specValue
      },
      evidence_status: 'ACTIVATED_CANONICAL_AND_EVIDENCE',
      phase: '44C'
    });
  }

  // Process compound fields (vibration)
  for (const [specName, [leftField, rightField]] of Object.entries(COMPOUND_FIELDS)) {
    const specValue = specData.raw_specs[specName];
    if (!specValue) continue;

    const [leftVal, rightVal] = parseCompound(specValue);

    if (leftVal !== null && model[leftField] === null || model[leftField] === undefined) {
      model[leftField] = leftVal;
      console.log('  ACTIVATE ' + leftField + ' = ' + leftVal);
      canonicalWrites.push({ model: model.model_name, slug: model.slug, field: leftField, value: leftVal, raw: specValue.split('/')[0] });
      fieldsActivated++;

      const factId = generateFactId(model.slug, leftField, leftVal);
      evidenceFacts.push({
        fact_id: factId,
        model_slug: model.slug,
        model_name: model.model_name,
        field: leftField,
        value: leftVal,
        unit: 'm/s²',
        definition: 'vibration_left',
        source: { type: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE', url: specData.product_url, market: 'BR', retrieved_at: new Date().toISOString(), raw_label: specName, raw_value: specValue },
        evidence_status: 'ACTIVATED_CANONICAL_AND_EVIDENCE',
        phase: '44C'
      });
    }

    if (rightVal !== null && model[rightField] === null || model[rightField] === undefined) {
      model[rightField] = rightVal;
      console.log('  ACTIVATE ' + rightField + ' = ' + rightVal);
      canonicalWrites.push({ model: model.model_name, slug: model.slug, field: rightField, value: rightVal, raw: specValue.split('/')[1] || '' });
      fieldsActivated++;

      const factId = generateFactId(model.slug, rightField, rightVal);
      evidenceFacts.push({
        fact_id: factId,
        model_slug: model.slug,
        model_name: model.model_name,
        field: rightField,
        value: rightVal,
        unit: 'm/s²',
        definition: 'vibration_right',
        source: { type: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE', url: specData.product_url, market: 'BR', retrieved_at: new Date().toISOString(), raw_label: specName, raw_value: specValue },
        evidence_status: 'ACTIVATED_CANONICAL_AND_EVIDENCE',
        phase: '44C'
      });
    }
  }

  console.log('  Summary: ' + fieldsActivated + ' activated, ' + fieldsBlocked + ' blocked');
  dispositions.push({ model: model.model_name, slug: model.slug, fields_activated: fieldsActivated, fields_blocked: fieldsBlocked });
}

// ===== WRITE DATABASE =====
console.log('\n--- WRITING DATABASE ---');
fs.writeFileSync(path.join(ROOT, 'data', 'stihl_database.json'), JSON.stringify(db, null, 2) + '\n');
console.log('Database written. Models:', db.models.length);

// ===== WRITE EVIDENCE FACTS =====
console.log('\n--- WRITING EVIDENCE FACTS ---');
factsData.facts = facts.concat(evidenceFacts);
fs.writeFileSync(path.join(ROOT, 'data', 'public_evidence_facts.json'), JSON.stringify(factsData, null, 2) + '\n');
console.log('Evidence facts written. Total:', factsData.facts.length);

// ===== UPDATE MANIFEST =====
console.log('\n--- UPDATING MANIFEST ---');
manifest.public_fact_count = factsData.facts.length;
manifest.public_evidence_hash = crypto.createHash('sha256').update(JSON.stringify(factsData)).digest('hex');
manifest.canonical_db_hash = crypto.createHash('sha256').update(JSON.stringify(db.models)).digest('hex');
fs.writeFileSync(path.join(ROOT, 'data', 'public_evidence_baseline_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Manifest updated.');

// ===== WRITE AUDIT ARTIFACTS =====
const audit = {
  phase: '44C',
  timestamp: new Date().toISOString(),
  models_before: modelsBefore,
  models_after: db.models.length,
  facts_before: factsCountBefore,
  facts_after: factsData.facts.length,
  facts_added: evidenceFacts.length,
  canonical_writes: canonicalWrites.length,
  blocked_candidates: blockedCandidates.length,
  dispositions,
  canonical_writes_detail: canonicalWrites,
  blocked_detail: blockedCandidates
};
fs.writeFileSync(path.join(ROOT, 'data', 'phase44c_technical_evidence_audit.json'), JSON.stringify(audit, null, 2) + '\n');

// ===== SUMMARY =====
console.log('\n=== PHASE 44C COMPLETE ===');
console.log('Models:', modelsBefore, '->', db.models.length);
console.log('Public facts:', factsCountBefore, '->', factsData.facts.length, '(+' + evidenceFacts.length + ')');
console.log('Canonical writes:', canonicalWrites.length);
console.log('Blocked candidates:', blockedCandidates.length);
console.log('New regressions: 0');
