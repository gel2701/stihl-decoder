import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalize, hashCanonicalValue } from '../src/utils/evidenceBaselineValidator.js';
import * as runtime from '../src/publicEvidence.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = '0c00214888a67f90eb2a6466ceb0d85b166e5314';
export const REJECTED = '15fefa2a4f30b4616aaf393c7b59a1219ae4149b';
export const REJECTED_TREE = 'cb43aee41efbd4185e02898d2f4c8a246e99bef8';
const DB = 'data/stihl_database.json', STORE = 'data/public_evidence_facts.json';
const MANIFEST = 'data/public_evidence_baseline_manifest.json';
const PHASE = '44C-R2';
export const UNITS = Object.freeze({ displacement_cc: 'cm³', power_kw: 'kW', weight_kg: 'kg', sound_pressure_db: 'dB(A)', sound_power_db: 'dB(A)', fuel_tank_ml: 'ml', fuel_tank_l: 'l', oil_tank_ml: 'ml', air_volume_m3h: 'm³/h', air_velocity_ms: 'm/s', blowing_force_n: 'N', cutting_diameter_mm: 'mm', total_length_cm: 'cm', voltage_v: 'V', frequency_hz: 'Hz', water_flow_lh: 'l/h', max_pressure_bar: 'bar', vibration_left_ms2: 'm/s²', vibration_right_ms2: 'm/s²', vibration_nylon_left_ms2: 'm/s²', vibration_nylon_right_ms2: 'm/s²', vibration_blade_left_ms2: 'm/s²', vibration_blade_right_ms2: 'm/s²' });
const LABELS = Object.freeze({ displacement_cc: ['Cilindrada (cm³)'], power_kw: ['Potência (kW/cv)', 'Potência (kW/CV)', 'Potência (kW)'], weight_kg: ['Peso (kg)'], sound_pressure_db: ['Nível de pressão sonora dB(A)'], sound_power_db: ['Nível de potência sonora dB(A)'], fuel_tank_ml: ['Capacidade do tanque de combustível (ml)'], fuel_tank_l: ['Capacidade do tanque de combustível (l)'], oil_tank_ml: ['Capacidade do tanque de óleo (ml)'], air_volume_m3h: ['Vazão máx. de ar (m³/h)'], air_velocity_ms: ['Velocidade máxima do ar (m/s)'], blowing_force_n: ['Força de sopro (N)'], cutting_diameter_mm: ['Diametro ferramenta de corte (mm)'], total_length_cm: ['Comprimento total s/ ferramenta de corte (cm)'] });
const COMPOUND = Object.freeze({ 'Nível de vibração esquerda/direita (m/s²)': ['vibration_left_ms2', 'vibration_right_ms2'], 'Nivel de vibração esquerda/direita nylon (m/s²)': ['vibration_nylon_left_ms2', 'vibration_nylon_right_ms2'], 'Nivel de vibração esquerda/direita lâmina (m/s²)': ['vibration_blade_left_ms2', 'vibration_blade_right_ms2'] });
const DEFINITIONS = { displacement_cc: 'ENGINE_DISPLACEMENT', power_kw: 'ENGINE_OUTPUT_POWER', sound_pressure_db: 'SOUND_PRESSURE_LEVEL', sound_power_db: 'SOUND_POWER_LEVEL', fuel_tank_ml: 'FUEL_TANK_CAPACITY', fuel_tank_l: 'FUEL_TANK_CAPACITY', oil_tank_ml: 'OIL_TANK_CAPACITY' };
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 40e6 });
export const at = (ref, p) => JSON.parse(git('show', `${ref}:${p}`).toString('utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(path.join(ROOT, p));
const clone = x => structuredClone(x);
const equal = (a, b) => canonicalize(a) === canonicalize(b);

// No magnitude-based inference. A single separator followed by three digits
// is ambiguous without captured punctuation metadata, even in a BR source.
export function parseNumber(raw) {
  const text = String(raw).trim();
  if (/^\d+$/.test(text)) return { value: Number(text), numeric_class: 'INTEGER' };
  if (/^\d+[.,]\d{3}$/.test(text)) return { value: null, numeric_class: 'AMBIGUOUS_THOUSANDS_OR_DECIMAL' };
  if (/^\d+,\d{1,2}$/.test(text)) return { value: Number(text.replace(',', '.')), numeric_class: 'DECIMAL_COMMA' };
  if (/^\d+\.\d{1,2}$/.test(text)) return { value: Number(text), numeric_class: 'DECIMAL_POINT' };
  return { value: null, numeric_class: 'UNSUPPORTED_TEXT_OR_PUNCTUATION' };
}

export function classify(row) {
  const result = (disposition, reason, extra = {}) => ({ disposition, reason, value: null, ...extra });
  if (row.original_disposition === 'BLOCKED') return result('PREVIOUSLY_BLOCKED_PRESERVED', 'Original chainsaw configuration-dependent weight remains blocked.', { numeric_classes: [parseNumber(row.raw_value).numeric_class] });
  const raw = row.raw_value.trim();
  const parts = raw.split('/').map(s => s.trim());
  const numbers = parts.map(parseNumber);
  const numeric_classes = numbers.map(n => n.numeric_class);
  if (row.field.startsWith('vibration_')) {
    const fields = COMPOUND[row.raw_label];
    if (!fields?.includes(row.field) || parts.length !== 2 || numbers.some(n => n.value == null)) return result('FIELD_SEMANTIC_AMBIGUOUS_BLOCKED', 'Left/right components not completely bound and parsed.', { numeric_classes });
    return result('SAFE_COMPOUND_COMPONENT', 'Captured label explicitly binds left/right and, where present, nylon/blade.', { value: numbers[fields.indexOf(row.field)].value, numeric_classes, multivalue_class: 'LEFT_RIGHT_COMPONENTS' });
  }
  if (!LABELS[row.field]?.includes(row.raw_label) || !UNITS[row.field]) return result('UNIT_SEMANTIC_AMBIGUOUS_BLOCKED', 'Unsupported exact field/label mapping.');
  if (row.field === 'power_kw' && row.raw_label !== 'Potência (kW)') {
    if (parts.length !== 2 || parts[1] === '-') return result('UNIT_SEMANTIC_AMBIGUOUS_BLOCKED', 'Combined kW/CV heading lacks a complete pair; conversion sanity cannot be established.', { numeric_classes, multivalue_class: parts[1] === '-' ? 'PLACEHOLDER_SECONDARY_VALUE' : 'AMBIGUOUS' });
    const [kw, cv] = numbers.map(n => n.value);
    // Fixed before execution: displayed manufacturer CV has one decimal;
    // permit at most half a CV tenth plus a small kW rounding allowance.
    const error = kw == null || cv == null ? null : Math.abs(cv - kw * 1.35962);
    if (!(kw > 0 && cv > 0 && error <= 0.08)) return result('UNIT_SEMANTIC_AMBIGUOUS_BLOCKED', 'Complete power pair fails fixed metric horsepower rounding bound.', { numeric_classes, conversion_failed: true, kw, cv, conversion_error: error });
    return result('SAFE_DUAL_UNIT_NORMALIZATION', 'Ordered kW/CV pair passes fixed conversion sanity; only kW retained.', { value: kw, kw, cv, conversion_ratio: cv / kw, conversion_error: error, conversion_tolerance: 0.08, numeric_classes, multivalue_class: 'DUAL_UNIT' });
  }
  if (parts.length > 1) return result('CONFIGURATION_MULTI_VALUE_BLOCKED', 'Multiple values are not an unconditional scalar; no configuration flattening.', { numeric_classes, multivalue_class: 'CONFIGURATION_DEPENDENT' });
  if (numbers[0].numeric_class === 'AMBIGUOUS_THOUSANDS_OR_DECIMAL') return result('LOCALE_AMBIGUOUS_BLOCKED', 'Captured text has no explicit separator metadata; both decimal and grouping interpretations possible.', { numeric_classes });
  if (numbers[0].value == null) return result('FIELD_SEMANTIC_AMBIGUOUS_BLOCKED', 'Whole source token does not parse safely.', { numeric_classes });
  if (row.field === 'weight_kg') return result('FIELD_SEMANTIC_AMBIGUOUS_BLOCKED', 'Peso (kg) does not specify dry/powerhead measurement definition; do not invent weight scope.', { numeric_classes });
  return result(numbers[0].numeric_class === 'INTEGER' ? 'SAFE_SINGLE_VALUE' : 'SAFE_LOCALE_NORMALIZATION', 'Exact scalar label and complete numeric token; explicit field unit.', { value: numbers[0].value, numeric_classes });
}

export function reconstruct() {
  assert.equal(git('rev-parse', `${REJECTED}^{tree}`).toString().trim(), REJECTED_TREE);
  assert.equal(git('show', '-s', '--format=%P', REJECTED).toString().trim(), BASE);
  git('merge-base', '--is-ancestor', REJECTED, 'HEAD');
  const frozen = ['data/phase44c_product_page_fetches.json', 'data/phase44c_technical_specs_extracted.json', 'data/phase44c_technical_evidence_audit.json', 'data/phase44a_br_new_machine_candidates.json', 'data/phase44a_br_source_manifest.json'];
  // Git for Windows checks LF blobs out as CRLF; compare Git-normalized blobs.
  for (const p of frozen) assert.equal(git('hash-object', `--path=${p}`, p).toString().trim(), git('rev-parse', `${REJECTED}:${p}`).toString().trim(), `Frozen source changed: ${p}`);
  const baseline = at(BASE, DB), oldStore = at(BASE, STORE), rejectedDB = at(REJECTED, DB), rejectedStore = at(REJECTED, STORE);
  const db = clone(baseline), store = clone(oldStore);
  const oldFacts = rejectedStore.facts.filter(f => f.phase === '44C');
  const audit = at(REJECTED, frozen[2]), specs = at(REJECTED, frozen[1]), fetches = at(REJECTED, frozen[0]);
  const catalog = at(REJECTED, frozen[3]).candidates;
  assert.equal(oldFacts.length, 189); assert.equal(oldStore.facts.length, 512);
  assert.equal(audit.canonical_writes_detail.length, 189); assert.equal(audit.blocked_detail.length, 8);
  assert.deepEqual(rejectedStore.facts.filter(f => f.phase !== '44C'), oldStore.facts);
  const explainedRejectedDB = clone(baseline);
  for (const write of audit.canonical_writes_detail) explainedRejectedDB.models.find(m => m.slug === write.slug)[write.field] = write.value;
  assert.deepEqual(explainedRejectedDB, rejectedDB, 'Rejected canonical delta contains unaccounted changes');
  assert.deepEqual(rejectedStore.model_index, oldStore.model_index);
  assert.deepEqual(rejectedStore.field_index, oldStore.field_index);
  const ledger = [];
  for (const entry of [...audit.canonical_writes_detail, ...audit.blocked_detail]) {
    const model = db.models.find(m => m.model_name === entry.model);
    assert.ok(model, `Unknown model ${entry.model}`);
    const source = specs.find(s => s.slug === model.slug), captured = fetches.find(s => s.slug === model.slug);
    assert.ok(source && captured && source.reference === captured.reference);
    const catalogMatches = catalog.filter(c => c.reference === source.reference && c.name.toUpperCase().includes(model.model_name));
    assert.ok(catalogMatches.length > 0, `Missing Phase44A lineage ${model.slug}`);
    const old = oldFacts.find(f => f.model_slug === model.slug && f.field === entry.field);
    const rawLabel = old?.source.raw_label || 'Peso (kg)';
    const raw = source.raw_specs[rawLabel];
    assert.equal(typeof raw, 'string');
    assert.equal(captured.product_url, source.product_url);
    assert.equal(new URL(source.product_url).hostname, 'loja.stihl.com.br');
    assert.ok(captured.specs._raw_specs.some(text => text.includes(rawLabel + raw)), `Captured raw context mismatch ${model.slug}.${entry.field}`);
    if (old) { assert.equal(old.source.raw_value, raw); assert.equal(old.source.url, source.product_url); assert.equal(old.value, entry.value); assert.equal(rejectedDB.models.find(m => m.slug === model.slug)[entry.field], old.value); }
    assert.ok(model[entry.field] == null, `Baseline technical field is not absent: ${model.slug}.${entry.field}`);
    const row = { model: model.model_name, slug: model.slug, field: entry.field, raw_label: rawLabel, raw_value: raw, source_url: source.product_url, reference: source.reference, source_context: captured.specs._raw_specs, source_unit_context: rawLabel, phase44a_product_ids: catalogMatches.map(c => c.id), original_disposition: old ? 'ACTIVATED' : 'BLOCKED', old_fact_id: old?.fact_id ?? null, old_value: old?.value ?? null, old_unit: old?.unit ?? null, phase44b_field_present: Object.hasOwn(model, entry.field), phase44b_value: model[entry.field] ?? null };
    row.numeric_syntax = { decimal_comma_or_grouping: raw.includes(','), decimal_point_or_grouping: raw.includes('.'), slash: raw.includes('/'), placeholder: /(?:^|\/)\s*-\s*$/.test(raw), text: /[^\d\s.,/\-]/u.test(raw) };
    Object.assign(row, classify(row));
    row.safe = row.disposition.startsWith('SAFE_'); row.unit = UNITS[row.field];
    if (row.safe) {
      assert.ok(Number.isFinite(row.value) && row.value > 0 && row.unit);
      model[row.field] = row.value;
      const id = hashCanonicalValue([PHASE, row.slug, row.field, row.value, row.unit, row.source_url, row.raw_value]).slice(0, 16);
      row.new_fact_id = id;
      const fact = { fact_id: id, model_slug: row.slug, variant_slug: row.slug, model_name: model.model_name, category: model.category, field: row.field, raw_value: raw, normalized_value: row.value, unit: row.unit, measurement_definition: DEFINITIONS[row.field] || null, public_evidence_status: 'OFFICIAL_DOCUMENTED', display_eligible: true, single_value_eligible: true, source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE', source_url: row.source_url, source_document_id: row.source_url, source_document_title: `STIHL ${model.model_name} BR Product Page`, market: 'BR', retrieved_at: old.source.retrieved_at, model_scope: 'EXACT_MODEL', scope_evidence: [`DOC_MODEL:${row.slug}`, `STIHL_REFERENCE:${source.reference}`], field_semantic_status: 'VALID', conflict_status: 'CLEAR', conflict_group_id: null, conflicting_values: [], configuration: row.field.includes('_nylon_') ? 'nylon' : row.field.includes('_blade_') ? 'blade' : null, source_locator_type: 'PRODUCT_PAGE', source_locator: row.source_url, source_heading: rawLabel, evidence_hash: hashCanonicalValue({ source: old.source, field: row.field, normalized_value: row.value, unit: row.unit, reference: source.reference }), generated_from_phase: PHASE, evidence_status: 'OFFICIAL_DOCUMENTED', source: clone(old.source), source_lineage: `Phase44A catalog reference ${source.reference} -> captured Phase44C product page -> Phase44C-R2 semantic review`, previous_fact_id: old.fact_id };
      store.facts.push(fact);
      if (!store.model_index[row.slug]) store.model_index[row.slug] = { model_name: model.model_name, category: model.category, aliases: [row.slug, model.model_name, `STIHL ${model.model_name}`, model.model_name.replace(/\s/g, '')], fact_ids: [] };
      store.model_index[row.slug].fact_ids.push(id);
      store.field_index[row.slug] ||= {};
      assert.equal(store.field_index[row.slug][row.field], undefined);
      store.field_index[row.slug][row.field] = id;
    } else row.new_fact_id = null;
    ledger.push(row);
  }
  assert.equal(ledger.length, 197); assert.equal(new Set(ledger.map(r => `${r.slug}:${r.field}`)).size, 197);
  assert.equal(new Set(ledger.map(r => r.slug)).size, 21);
  const safe = ledger.filter(r => r.safe), blocked = ledger.filter(r => !r.safe);
  assert.equal(ledger.filter(r => r.conversion_failed).length, 0, 'Power conversion sanity failure requires review');
  assert.equal(store.facts.length, 512 + safe.length);
  assert.equal(new Set(store.facts.map(f => f.fact_id)).size, store.facts.length);
  assert.deepEqual(store.facts.slice(0, 512), oldStore.facts);
  for (const [slug, entry] of Object.entries(oldStore.model_index)) assert.deepEqual(store.model_index[slug], entry);
  for (const [slug, entry] of Object.entries(oldStore.field_index)) assert.deepEqual(store.field_index[slug], entry);
  const indexed = s => new Set(Object.values(s.model_index).flatMap(e => e.fact_ids));
  const debt = oldStore.facts.filter(f => !indexed(oldStore).has(f.fact_id)).map(f => f.fact_id);
  assert.equal(debt.length, 38); assert.deepEqual(oldStore.facts.filter(f => !indexed(store).has(f.fact_id)).map(f => f.fact_id), debt);
  const attached = { ...db, public_evidence: store };
  const resolution = safe.map(row => {
    const facts = runtime.getPublicEvidenceFactsForModel(row.slug, attached);
    const map = runtime.buildPublicEvidenceFieldMap(row.slug, attached);
    const fields = runtime.buildPublicEvidenceFields(row.slug, attached);
    const tech = runtime.buildPublicTechnicalSpecs(row.slug, attached);
    const state = runtime.getPublicTechnicalDisplayState(row.slug, row.field, attached);
    assert.equal(facts.filter(f => f.fact_id === row.new_fact_id).length, 1);
    assert.equal(map[row.field][0].fact_id, row.new_fact_id);
    assert.equal(fields[row.field].value, row.value); assert.equal(tech[row.field], row.value);
    assert.equal(state.value, row.value); assert.equal(state.unit, row.unit);
    assert.equal(state.evidence_status, 'OFFICIAL_DOCUMENTED'); assert.ok(state.display_eligible && state.single_value_eligible);
    return { fact_id: row.new_fact_id, model: row.slug, field: row.field, canonical_value: row.value, runtime_value: state.value, unit: state.unit, status: 'PASS', display_eligible: true, single_value_eligible: true };
  });
  for (const row of blocked) {
    assert.equal(db.models.find(m => m.slug === row.slug)[row.field], baseline.models.find(m => m.slug === row.slug)[row.field]);
    assert.equal(runtime.getSafePublicTechnicalValue(row.slug, row.field, attached), null);
  }
  for (const slug of Object.keys(oldStore.model_index)) assert.deepEqual(runtime.buildPublicEvidenceFields(slug, attached), runtime.buildPublicEvidenceFields(slug, { ...baseline, public_evidence: oldStore }));
  assert.equal(db.models.length, 83);
  for (const m of db.models) { assert.equal(m.production_confidence, 'UNKNOWN'); assert.notEqual(m.specs_verified, true); assert.ok(['product_category', 'product_type', 'machine_form', 'power_source', 'primary_function'].every(k => m.basic_classification?.[k])); }
  const manifest = at(REJECTED, MANIFEST);
  Object.assign(manifest, { approved_phase: '44C-R2 CANDIDATE ONLY', created_from_commit: REJECTED, baseline_commit_timestamp: git('show', '-s', '--format=%cI', REJECTED).toString().trim(), fact_count: store.facts.length, distinct_model_count: new Set(store.facts.map(f => f.model_slug)).size, fact_array_canonical_sha256: hashCanonicalValue(store.facts), public_store_canonical_sha256: hashCanonicalValue(store), canonical_database_sha256: hashCanonicalValue(db), immutable_prefix_count: 512, immutable_prefix_canonical_sha256: hashCanonicalValue(oldStore.facts), model_fact_counts: store.facts.reduce((a, f) => { a[f.model_slug] = (a[f.model_slug] || 0) + 1; return a; }, {}), manifest_status: 'CANDIDATE_ONLY_NOT_PRODUCTION_APPROVED', phase: PHASE, canonical_model_count: 83, public_fact_count: store.facts.length, public_evidence_hash: sha(JSON.stringify(store)), canonical_db_hash: sha(JSON.stringify(db.models)) });
  const counts = ledger.reduce((a, r) => { a[r.disposition] = (a[r.disposition] || 0) + 1; return a; }, {});
  const summary = { technical_candidates: 197, accounted: 197, unaccounted: 0, safe_canonical_fields: safe.length, safe_public_facts: safe.length, blocked: blocked.length, canonical_rollbacks: blocked.filter(r => r.old_fact_id).length, final_facts: store.facts.length, models: 83, core5: 83, dispositions: counts, baseline_unindexed: 38, unit_corrections_retained: safe.filter(r => r.unit !== r.old_unit).length, unit_corrections_by_field: Object.fromEntries(['power_kw', 'sound_pressure_db', 'sound_power_db'].map(k => [k, safe.filter(r => r.field === k && r.unit !== r.old_unit).length])), compound_components: safe.filter(r => r.disposition === 'SAFE_COMPOUND_COMPONENT').length, unknown_safe_units: safe.filter(r => !r.unit).length, dry_run: 'PASS', production_ready: false, regression_status: 'NOT_RUN' };
  const outputs = { [DB]: db, [STORE]: store, [MANIFEST]: manifest };
  const artifact = (name, data) => { outputs[`data/phase44c_r2_${name}.json`] = data; };
  artifact('candidate_ledger', ledger); artifact('semantic_reconciliation', { ...summary, candidates: ledger });
  artifact('unit_audit', ledger.map(r => ({ model: r.slug, field: r.field, source_label: r.raw_label, raw_unit_representation: r.raw_label, old_unit: r.old_unit, canonical_unit: r.safe ? r.unit : null, reason: r.reason, status: r.disposition })));
  artifact('multivalue_audit', ledger.filter(r => r.raw_value.includes('/')).map(r => ({ ...r, multivalue_class: r.multivalue_class || 'AMBIGUOUS' })));
  artifact('locale_numeric_audit', ledger.filter(r => /[.,]/.test(r.raw_value)));
  artifact('blocked_candidates', blocked);
  artifact('canonical_delta', ledger.map(r => ({ model: r.slug, field: r.field, phase44b_field_present: r.phase44b_field_present, phase44b_value: r.phase44b_value, phase44c_value: r.old_value, r2_value: r.safe ? r.value : r.phase44b_value, action: !r.safe ? (r.old_fact_id ? 'ROLLBACK' : 'PRESERVE_BLOCK') : r.value === r.old_value ? 'RETAIN' : 'CORRECT', reason: r.reason, supporting_fact_id: r.new_fact_id })));
  artifact('fact_id_crosswalk', ledger.filter(r => r.old_fact_id).map(r => ({ old_fact_id: r.old_fact_id, model: r.slug, field: r.field, old_value: r.old_value, old_unit: r.old_unit, disposition: r.disposition, new_fact_id: r.new_fact_id, new_value: r.safe ? r.value : null, new_unit: r.safe ? r.unit : null, reason: r.reason })));
  artifact('index_integrity', { safe_facts: safe.length, missing_model_index: 0, missing_field_index: 0, baseline_membership_drift: 0, baseline_unindexed: 38, baseline_unindexed_fact_ids: debt, records: resolution.map(r => ({ fact_id: r.fact_id, model: r.model, field: r.field, model_index_present: store.model_index[r.model].fact_ids.includes(r.fact_id), field_index_present: store.field_index[r.model][r.field] === r.fact_id })) });
  artifact('runtime_resolution', resolution);
  return { outputs, summary, ledger, baseline, oldStore };
}

export function main() {
  const result = reconstruct();
  // Refuse to overwrite unrelated edits, including changes to old facts or identities.
  for (const p of [DB, STORE, MANIFEST]) {
    const current = JSON.parse(read(p));
    assert.ok(equal(current, at(REJECTED, p)) || equal(current, result.outputs[p]), `Unexpected working data drift: ${p}`);
  }
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(JSON.stringify(result.ledger.filter(r => r.disposition.endsWith('_BLOCKED') || r.disposition === 'SAFE_DUAL_UNIT_NORMALIZATION'), null, 2));
  if (process.argv.includes('--execute')) {
    for (const [p, content] of Object.entries(result.outputs)) {
      const bytes = JSON.stringify(content, null, 2) + '\n';
      if (!fs.existsSync(path.join(ROOT, p)) || read(p).toString() !== bytes) fs.writeFileSync(path.join(ROOT, p), bytes);
    }
    console.log('Validated reconstruction written. No production action performed.');
  } else console.log('DRY RUN: no files written.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
