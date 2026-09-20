import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, BASE, REJECTED, at, reconstruct, parseNumber, classify, UNITS } from '../scripts/phase44c_r2_reconcile_technical_evidence.js';
import * as rt from '../src/publicEvidence.js';
import { canonicalize, hashCanonicalValue, validatePublicEvidenceBaseline } from '../src/utils/evidenceBaselineValidator.js';
import { findRegisteredModel } from '../src/globalModelSearch.js';

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p)));
const db = read('data/stihl_database.json'), store = read('data/public_evidence_facts.json');
const base = at(BASE, 'data/stihl_database.json'), old = at(BASE, 'data/public_evidence_facts.json');
const original = at(REJECTED, 'data/public_evidence_facts.json');
const ledger = read('data/phase44c_r2_candidate_ledger.json');
const safe = ledger.filter(r => r.safe), blocked = ledger.filter(r => !r.safe);
const facts = store.facts.filter(f => f.generated_from_phase === '44C-R2');
const database = { ...db, public_evidence: store };
const factIds = new Set(facts.map(f => f.fact_id));
const modelMembers = s => Object.entries(s.model_index).flatMap(([model, entry]) => entry.fact_ids.map(id => ({ model, id })));
const fieldMembers = s => Object.entries(s.field_index).flatMap(([model, entry]) => Object.entries(entry).flatMap(([field, ids]) => [ids].flat().map(id => ({ model, field, id }))));
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }

test('197 candidates; 189 original fact IDs and 8 original blocks, each exactly once', () => {
  assert.equal(ledger.length, 197);
  assert.equal(new Set(ledger.map(r => `${r.slug}:${r.field}`)).size, 197);
  assert.deepEqual(new Set(ledger.filter(r => r.old_fact_id).map(r => r.old_fact_id)), new Set(original.facts.filter(f => f.phase === '44C').map(f => f.fact_id)));
  assert.equal(ledger.filter(r => r.original_disposition === 'BLOCKED').length, 8);
  assert.equal(safe.length + blocked.length, 197);
  assert.ok(ledger.every(r => r.reason && r.disposition));
});
test('83 identities, CORE5 and all nontechnical data unchanged from Phase44B', () => {
  assert.equal(db.models.length, 83);
  const rolledBack = structuredClone(db);
  for (const row of safe) {
    const m = rolledBack.models.find(m => m.slug === row.slug), prev = base.models.find(m => m.slug === row.slug);
    if (Object.hasOwn(prev, row.field)) m[row.field] = prev[row.field]; else delete m[row.field];
  }
  assert.deepEqual(rolledBack, base);
  assert.ok(db.models.every(m => ['product_category','product_type','machine_form','power_source','primary_function'].every(k => m.basic_classification[k])));
});
test('512 old facts and ALL original index entries untouched', () => {
  assert.deepEqual(store.facts.slice(0, 512), old.facts);
  for (const [slug, v] of Object.entries(old.model_index)) assert.deepEqual(store.model_index[slug], v);
  for (const [slug, v] of Object.entries(old.field_index)) assert.deepEqual(store.field_index[slug], v);
});
test('38 baseline-unindexed facts remain exactly the same, model and field memberships preserved', () => {
  const oldIndexed = new Set(modelMembers(old).map(m => m.id)), nowIndexed = new Set(modelMembers(store).map(m => m.id));
  const debt = old.facts.filter(f => !oldIndexed.has(f.fact_id)).map(f => f.fact_id);
  assert.equal(debt.length, 38); assert.deepEqual(old.facts.filter(f => !nowIndexed.has(f.fact_id)).map(f => f.fact_id), debt);
  const ids = new Set(old.facts.map(f => f.fact_id));
  assert.deepEqual(modelMembers(store).filter(m => ids.has(m.id)), modelMembers(old));
  // Preserve even stale baseline references. Comparing only extant fact IDs
  // against the complete old index would falsely report pre-existing debt.
  assert.deepEqual(fieldMembers(store).filter(m => !factIds.has(m.id)), fieldMembers(old));
});
test('every safe fact has required schema and frozen official source provenance', () => {
  const required = ['fact_id','model_slug','variant_slug','model_name','category','field','raw_value','normalized_value','unit','measurement_definition','public_evidence_status','display_eligible','single_value_eligible','source_class','source_url','market','model_scope','scope_evidence','field_semantic_status','conflict_status','source_locator_type','source_locator','source_heading','evidence_hash','generated_from_phase'];
  for (const f of facts) {
    for (const k of required) assert.ok(Object.hasOwn(f, k), `${f.fact_id} ${k}`);
    const previous = original.facts.find(o => o.fact_id === f.previous_fact_id);
    assert.deepEqual(f.source, previous.source);
    assert.equal(f.raw_value, previous.source.raw_value); assert.equal(f.source_url, previous.source.url);
    assert.equal(f.market, 'BR'); assert.equal(new URL(f.source_url).hostname, 'loja.stihl.com.br');
    assert.equal(f.model_scope, 'EXACT_MODEL'); assert.equal(f.variant_slug, f.model_slug);
    assert.equal(f.field_semantic_status, 'VALID'); assert.equal(f.conflict_status, 'CLEAR');
    assert.equal(f.public_evidence_status, 'OFFICIAL_DOCUMENTED'); assert.equal(f.display_eligible, true); assert.equal(f.single_value_eligible, true);
    assert.match(f.evidence_hash, /^[a-f0-9]{64}$/);
  }
});
test('each safe fact indexed exactly once for its exact model and field; no dangling new indexes', () => {
  const mm = modelMembers(store), fm = fieldMembers(store);
  for (const f of facts) {
    assert.deepEqual(mm.filter(m => m.id === f.fact_id), [{ model: f.model_slug, id: f.fact_id }]);
    assert.deepEqual(fm.filter(m => m.id === f.fact_id), [{ model: f.model_slug, field: f.field, id: f.fact_id }]);
  }
  const all = new Set(store.facts.map(f => f.fact_id));
  assert.deepEqual(mm.filter(m => !all.has(m.id)), modelMembers(old).filter(m => !all.has(m.id)));
  assert.deepEqual(fm.filter(m => !all.has(m.id)), fieldMembers(old).filter(m => !all.has(m.id)));
});
test('explicit canonical units: no parenthesis extraction; correct sound and power units', () => {
  for (const f of facts) assert.equal(f.unit, UNITS[f.field]);
  assert.ok(facts.filter(f => f.field.startsWith('sound_')).every(f => f.unit === 'dB(A)'));
  assert.ok(facts.filter(f => f.field === 'power_kw').every(f => f.unit === 'kW'));
});
test('complete dual-unit pairs pass numerical conversion sanity; incomplete pairs blocked', () => {
  for (const r of ledger.filter(r => r.field === 'power_kw' && /CV/i.test(r.raw_label))) {
    if (r.safe) { assert.equal(r.disposition, 'SAFE_DUAL_UNIT_NORMALIZATION'); assert.ok(Math.abs(r.cv - 1.35962 * r.kw) <= 0.08); }
    else assert.equal(r.disposition, 'UNIT_SEMANTIC_AMBIGUOUS_BLOCKED');
  }
  assert.equal(classify({ field: 'power_kw', raw_label: 'Potência (kW/cv)', raw_value: '1,6 / 9,0' }).conversion_failed, true);
});
test('all 11 known multi-configuration scalars removed and blocked in runtime', () => {
  const config = ledger.filter(r => r.disposition === 'CONFIGURATION_MULTI_VALUE_BLOCKED');
  assert.equal(config.length, 11);
  assert.equal(config.filter(r => r.field.startsWith('sound_')).length, 7);
  assert.equal(config.filter(r => r.field === 'cutting_diameter_mm').length, 4);
  for (const r of blocked) {
    assert.ok(db.models.find(m => m.slug === r.slug)[r.field] == null);
    assert.ok(!facts.some(f => f.model_slug === r.slug && f.field === r.field));
    assert.equal(rt.getSafePublicTechnicalValue(r.slug, r.field, database), null);
    assert.ok(!modelMembers(store).some(m => m.id === r.old_fact_id));
    assert.ok(!fieldMembers(store).some(m => m.id === r.old_fact_id));
  }
});
test('locale audit covers every punctuated candidate; ambiguous grouping is blocked without guesses', () => {
  const audit = read('data/phase44c_r2_locale_numeric_audit.json');
  assert.deepEqual(audit, ledger.filter(r => /[.,]/.test(r.raw_value)));
  for (const slug of ['br-800', 'br-420']) assert.equal(ledger.find(r => r.slug === slug && r.field === 'air_volume_m3h').disposition, 'LOCALE_AMBIGUOUS_BLOCKED');
  for (const raw of ['1,260','2.025','1.234,56','1,234.56','94 / 95','5 kg','-','']) assert.equal(parseNumber(raw).value, null);
  assert.equal(parseNumber('35,8').value, 35.8); assert.equal(parseNumber('35.8').value, 35.8);
});
test('44 compound components retain exact label orientation and no null write path', () => {
  const components = ledger.filter(r => r.field.startsWith('vibration_'));
  assert.equal(components.length, 44);
  for (const r of components) {
    assert.equal(r.disposition, 'SAFE_COMPOUND_COMPONENT'); assert.ok(Number.isFinite(r.value));
    const pos = r.field.includes('_left_') ? 0 : 1;
    assert.equal(r.value, Number(r.raw_value.split('/')[pos].trim().replace(',', '.')));
    assert.match(r.raw_label, /esquerda\/direita/);
  }
  for (const raw of ['- / 3,0','3,0 / -','3,0','bad']) assert.equal(classify({ field: 'vibration_left_ms2', raw_label: 'Nível de vibração esquerda/direita (m/s²)', raw_value: raw }).disposition, 'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED');
});
test('eight original chainsaw weights remain blocked', () => {
  const weights = ledger.filter(r => r.disposition === 'PREVIOUSLY_BLOCKED_PRESERVED');
  assert.deepEqual(new Set(weights.map(r => r.slug)), new Set(['ms-182','ms-162','ms-172','ms-363','ms-661','ms-382','ms-172-c-be','ms-212']));
  assert.ok(weights.every(r => r.field === 'weight_kg' && !r.safe && !r.new_fact_id));
});
test('variant identities resolve separately without evidence or index cross-contamination', () => {
  for (const slug of ['ms-172','ms-172-c-be','fs-55','fs-55-r']) {
    const m = db.models.find(m => m.slug === slug);
    assert.equal(findRegisteredModel(m.model_name, database).slug, slug);
    assert.equal(findRegisteredModel(m.model_name.replace(/\s/g,''), database).slug, slug);
    const list = rt.getPublicEvidenceFactsForModel(slug, database);
    assert.ok(list.length > 0 && list.every(f => f.model_slug === slug));
  }
});
test('canonical/evidence one-to-one and all five runtime APIs return exact safe values and units', () => {
  assert.equal(facts.length, safe.length); assert.equal(store.facts.length, 512 + safe.length);
  for (const f of facts) {
    const m = db.models.find(m => m.slug === f.model_slug);
    assert.equal(m[f.field], f.normalized_value);
    assert.equal(rt.getPublicEvidenceFactsForModel(f.model_slug, database).filter(x => x.fact_id === f.fact_id).length, 1);
    assert.equal(rt.buildPublicEvidenceFieldMap(f.model_slug, database)[f.field][0].fact_id, f.fact_id);
    assert.equal(rt.buildPublicEvidenceFields(f.model_slug, database)[f.field].value, m[f.field]);
    assert.equal(rt.buildPublicTechnicalSpecs(f.model_slug, database)[f.field], m[f.field]);
    const state = rt.getPublicTechnicalDisplayState(f.model_slug, f.field, database);
    assert.equal(state.value, m[f.field]); assert.equal(state.unit, f.unit);
    assert.ok(state.display_eligible && state.single_value_eligible);
  }
});
test('old runtime fields, values, statuses and visibility exactly equivalent', () => {
  for (const slug of Object.keys(old.model_index)) assert.deepEqual(rt.buildPublicEvidenceFields(slug, database), rt.buildPublicEvidenceFields(slug, { ...base, public_evidence: old }));
});
test('no duplicate IDs, semantic duplicates or non-target facts', () => {
  assert.equal(new Set(store.facts.map(f => f.fact_id)).size, store.facts.length);
  const keys = store.facts.map(f => canonicalize([f.model_slug, f.field, f.normalized_value]));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(ledger.map(r => r.slug)).size, 21);
  assert.ok(facts.every(f => ledger.some(r => r.safe && r.slug === f.model_slug && r.field === f.field && r.new_fact_id === f.fact_id)));
});
test('confidence/specs policy and frozen runtime/routes/UI/packages/harvester', () => {
  for (const m of db.models) { assert.equal(m.production_confidence, 'UNKNOWN'); assert.notEqual(m.specs_verified, true); }
  for (const p of ['src/publicEvidence.js','src/globalModelSearch.js','src/components/ModelPageTemplate.js','server.js','index.html','package.json','package-lock.json','src/officialProductHarvester.js','scripts/harvest_stihl_official_products.js']) {
    assert.equal(execFileSync('git',['hash-object',`--path=${p}`,p],{cwd:ROOT,encoding:'utf8'}).trim(),execFileSync('git',['rev-parse',`${REJECTED}:${p}`],{cwd:ROOT,encoding:'utf8'}).trim());
  }
});
test('manifest hashes/counts match reconstruction; no new fact semantic validator errors', () => {
  const manifest = read('data/public_evidence_baseline_manifest.json');
  assert.equal(manifest.fact_count, store.facts.length);
  assert.equal(manifest.fact_array_canonical_sha256, hashCanonicalValue(store.facts));
  assert.equal(manifest.public_store_canonical_sha256, hashCanonicalValue(store));
  assert.equal(manifest.canonical_database_sha256, hashCanonicalValue(db));
  const result = validatePublicEvidenceBaseline({ manifest, publicEvidenceStore:store, database:db, baselineFacts:old.facts, approvedAdditionFactIds:[...factIds] });
  assert.deepEqual(result.errors.filter(e => factIds.has(e.details?.fact_id) || !e.details?.fact_id), []);
  console.log(`Baseline-only validator findings preserved: ${result.errors.length}`);
});
test('deterministic replay matches every written artifact and does not duplicate facts/indexes', () => {
  const first = reconstruct(), second = reconstruct();
  assert.deepEqual(first.outputs, second.outputs);
  for (const [p, value] of Object.entries(first.outputs)) assert.deepEqual(read(p), value, p);
});
console.log(`Phase44C-R2: ${passed} groups PASS; ${facts.length}/${facts.length} safe facts runtime-resolvable.`);
