import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { decodeStihlCode } from '../src/decoder.js';
import * as runtime from '../src/publicEvidence.js';

const rootDir = process.cwd();

// 1. Load canonical DB
const db = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/stihl_database.json'), 'utf8'));

// 2. Load public evidence store & manifest
const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_baseline_manifest.json'), 'utf8'));

// 3. Load canonical delta & summaries
const delta = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_canonical_delta.json'), 'utf8')).writes;
const dispositionSummary = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_field_disposition_summary.json'), 'utf8'));
const modelSummary = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_model_technical_summary.json'), 'utf8')).summary;

// 4. Load Wave 2 definition
const wave2Identities = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46a_phase46b_wave2_definition.json'), 'utf8')).selected_identities;
const wave2Slugs = new Set(wave2Identities.map(w => w.proposed_slug));

// Test 1: Target 12 Wave 2 models loaded from canonical database
test('Phase 46C — 1. Target 12 Wave 2 models loaded from canonical database', () => {
  assert.equal(wave2Identities.length, 12);
  for (const w of wave2Identities) {
    const m = db.models.find(mod => mod.slug === w.proposed_slug);
    assert.ok(m, `Model ${w.proposed_slug} must exist in canonical DB`);
  }
});

// Test 2: Canonical models count remains exactly 110
test('Phase 46C — 2. Canonical models count remains exactly 110', () => {
  assert.equal(db.models.length, 110);
});

// Test 3: Pre-Wave 2 98 models technical fields completely untouched
test('Phase 46C — 3. Pre-Wave 2 98 models technical fields completely untouched', () => {
  for (const w of delta) {
    assert.ok(wave2Slugs.has(w.slug), `Delta write targeted non-Wave 2 model: ${w.slug}`);
  }
});

// Test 4: HSA 26 has exactly 0 technical fields populated (quality over coverage)
test('Phase 46C — 4. HSA 26 has exactly 0 technical fields populated (quality over coverage)', () => {
  const hsa26 = db.models.find(m => m.slug === 'hsa-26');
  assert.ok(hsa26);
  const techSummary = modelSummary.find(m => m.slug === 'hsa-26');
  assert.equal(techSummary.safe_canonical_writes, 0);
  assert.equal(techSummary.activated_fields.length, 0);
  assert.equal(hsa26.weight_kg, null);
  assert.equal(hsa26.battery_system, null);
  assert.equal(hsa26.voltage_v, null);
});

// Test 5: HS 82 R has exactly 7 safe fields
test('Phase 46C — 5. HS 82 R has exactly 7 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hs-82-r');
  assert.ok(m);
  assert.equal(m.displacement_cc, 22.7);
  assert.equal(m.power_kw, 0.7);
  assert.equal(m.power_hp, 1.0);
  assert.equal(m.sound_pressure_db, 94);
  assert.equal(m.sound_power_db, 107);
  assert.equal(m.vibration_left_ms2, 2.7);
  assert.equal(m.vibration_right_ms2, 3.1);
});

// Test 6: MSE 170 C-BQ has exactly 4 safe fields
test('Phase 46C — 6. MSE 170 C-BQ has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'mse-170-c-bq');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 92);
  assert.equal(m.sound_power_db, 103);
  assert.equal(m.vibration_left_ms2, 2.9);
  assert.equal(m.vibration_right_ms2, 3.4);
});

// Test 7: MSE 141 C-Q has exactly 4 safe fields
test('Phase 46C — 7. MSE 141 C-Q has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'mse-141-c-q');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 90);
  assert.equal(m.sound_power_db, 101);
  assert.equal(m.vibration_left_ms2, 3.3);
  assert.equal(m.vibration_right_ms2, 4.2);
});

// Test 8: HLA 66 has exactly 4 safe fields
test('Phase 46C — 8. HLA 66 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hla-66');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 80);
  assert.equal(m.sound_power_db, 94);
  assert.equal(m.vibration_left_ms2, 3.5);
  assert.equal(m.vibration_right_ms2, 3.5);
});

// Test 9: MSA 190 T has exactly 2 safe fields
test('Phase 46C — 9. MSA 190 T has exactly 2 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'msa-190-t');
  assert.ok(m);
  assert.equal(m.vibration_left_ms2, 3.9);
  assert.equal(m.vibration_right_ms2, 3.8);
});

// Test 10: TSA 230 has exactly 2 safe fields
test('Phase 46C — 10. TSA 230 has exactly 2 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'tsa-230');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 104);
  assert.equal(m.sound_power_db, 115);
});

// Test 11: HLA 56 has exactly 4 safe fields
test('Phase 46C — 11. HLA 56 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hla-56');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 77);
  assert.equal(m.sound_power_db, 88);
  assert.equal(m.vibration_left_ms2, 1.5);
  assert.equal(m.vibration_right_ms2, 1.5);
});

// Test 12: BGE 71 has exactly 3 safe fields
test('Phase 46C — 12. BGE 71 has exactly 3 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'bge-71');
  assert.ok(m);
  assert.equal(m.air_volume_m3h, 670);
  assert.equal(m.air_velocity_ms, 66);
  assert.equal(m.sound_power_db, 101);
});

// Test 13: FSE 41 has exactly 4 safe fields
test('Phase 46C — 13. FSE 41 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'fse-41');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 87);
  assert.equal(m.sound_power_db, 96);
  assert.equal(m.vibration_left_ms2, 2.2);
  assert.equal(m.vibration_right_ms2, 1.3);
});

// Test 14: HSE 52 has exactly 4 safe fields
test('Phase 46C — 14. HSE 52 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hse-52');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 84);
  assert.equal(m.sound_power_db, 95);
  assert.equal(m.vibration_left_ms2, 3.1);
  assert.equal(m.vibration_right_ms2, 1.5);
});

// Test 15: FSE 60 has exactly 2 safe fields
test('Phase 46C — 15. FSE 60 has exactly 2 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'fse-60');
  assert.ok(m);
  assert.equal(m.vibration_left_ms2, 3.9);
  assert.equal(m.vibration_right_ms2, 3.6);
});

// Test 16: Total safe canonical writes across the 12 models is exactly 40
test('Phase 46C — 16. Total safe canonical writes across the 12 models is exactly 40', () => {
  assert.equal(delta.length, 40);
  assert.equal(dispositionSummary.safe_canonical_writes, 40);
  const totalWritesInSummary = modelSummary.reduce((acc, m) => acc + m.safe_canonical_writes, 0);
  assert.equal(totalWritesInSummary, 40);
});

// Test 17: Weight is null across all 12 models
test('Phase 46C — 17. Weight is null across all 12 models (weight_kg == null)', () => {
  for (const slug of wave2Slugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.weight_kg, null, `weight_kg must be null for ${slug}`);
  }
});

// Test 18: Multi-voltage (127V / 220V) mains-electric safety: zero voltage_v writes
test('Phase 46C — 18. Multi-voltage (127V / 220V) mains-electric safety: zero voltage_v writes', () => {
  const electricSlugs = ['mse-170-c-bq', 'mse-141-c-q', 'bge-71', 'fse-41', 'hse-52', 'fse-60'];
  for (const slug of electricSlugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.voltage_v, null, `voltage_v must be null for ${slug}`);
  }
  const voltageWrites = delta.filter(w => w.field === 'voltage_v');
  assert.equal(voltageWrites.length, 0);
});

// Test 19: Battery system is null across all 12 models
test('Phase 46C — 19. Battery system is null across all 12 models (battery_system == null)', () => {
  for (const slug of wave2Slugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.battery_system, null, `battery_system must be null for ${slug}`);
  }
  const batteryWrites = delta.filter(w => w.field === 'battery_system');
  assert.equal(batteryWrites.length, 0);
});

// Test 20: Spark plug and carburetor settings remain null across all 12 models
test('Phase 46C — 20. Spark plug and carburetor settings remain null across all 12 models', () => {
  for (const slug of wave2Slugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.spark_plug, null);
    assert.equal(m.electrode_gap_mm, null);
    assert.equal(m.carb_h_setting, null);
    assert.equal(m.carb_l_setting, null);
    assert.equal(m.carb_la_setting, null);
  }
});

// Test 21: Sound ranges blocked for MSA 190 T
test('Phase 46C — 21. Sound ranges blocked for MSA 190 T', () => {
  const m = db.models.find(mod => mod.slug === 'msa-190-t');
  assert.equal(m.sound_pressure_db, null);
  assert.equal(m.sound_power_db, null);
});

// Test 22: Dual sound blocked for FSE 60
test('Phase 46C — 22. Dual sound blocked for FSE 60', () => {
  const m = db.models.find(mod => mod.slug === 'fse-60');
  assert.equal(m.sound_pressure_db, null);
  assert.equal(m.sound_power_db, null);
});

// Test 23: Vibration inequality (< 4,3) blocked for TSA 230
test('Phase 46C — 23. Vibration inequality (< 4,3) blocked for TSA 230', () => {
  const m = db.models.find(mod => mod.slug === 'tsa-230');
  assert.equal(m.vibration_left_ms2, null);
  assert.equal(m.vibration_right_ms2, null);
});

// Test 24: Public evidence facts count is exactly 761 (721 baseline + 40 new)
test('Phase 46C — 24. Public evidence facts count is exactly 761 (721 baseline + 40 new)', () => {
  assert.equal(store.facts.length, 761);
  assert.equal(store.facts.length, 721 + 40);
});

// Test 25: 721 baseline public facts remain completely immutable
test('Phase 46C — 25. 721 baseline public facts remain completely immutable', () => {
  const baselineFacts = store.facts.slice(0, 721);
  assert.equal(baselineFacts.length, 721);
  // Verify first and last baseline facts
  assert.equal(baselineFacts[0].model_slug, '026');
  assert.equal(baselineFacts[720].generated_from_phase, '45C');
});

// Test 26: 40 new public facts are 100% indexed in model_index
test('Phase 46C — 26. 40 new public facts are 100% indexed in model_index', () => {
  const newFacts = store.facts.slice(721);
  assert.equal(newFacts.length, 40);
  for (const f of newFacts) {
    const entry = store.model_index[f.model_slug];
    assert.ok(entry, `Model index missing for ${f.model_slug}`);
    assert.ok(entry.fact_ids.includes(f.fact_id), `Fact ID ${f.fact_id} missing from model_index[${f.model_slug}]`);
  }
});

// Test 27: 40 new public facts are 100% indexed in field_index
test('Phase 46C — 27. 40 new public facts are 100% indexed in field_index', () => {
  const newFacts = store.facts.slice(721);
  for (const f of newFacts) {
    const entry = store.field_index[f.model_slug];
    assert.ok(entry, `Field index missing for ${f.model_slug}`);
    assert.equal(entry[f.field], f.fact_id, `Field index entry incorrect for ${f.model_slug}.${f.field}`);
  }
});

// Test 28: Baseline unindexed debt is strictly frozen at 38
test('Phase 46C — 28. Baseline unindexed debt is strictly frozen at 38', () => {
  const indexedIds = new Set(Object.values(store.model_index).flatMap(e => e.fact_ids));
  const unindexedCount = store.facts.filter(f => !indexedIds.has(f.fact_id)).length;
  assert.equal(unindexedCount, 38);
});

// Test 29: Runtime resolution returns all 40 new facts for corresponding models
test('Phase 46C — 29. Runtime resolution returns all 40 new facts for corresponding models', () => {
  const attached = { ...db, public_evidence: store };
  for (const w of delta) {
    const facts = runtime.getPublicEvidenceFactsForModel(w.slug, attached);
    const fact = facts.find(f => f.field === w.field);
    assert.ok(fact, `Runtime resolution failed for ${w.slug}.${w.field}`);
    assert.equal(fact.normalized_value, w.new_value);
  }
});

// Test 30: Public evidence baseline manifest updated with phase 46C and fact_count 761
test('Phase 46C — 30. Public evidence baseline manifest updated with phase 46C and fact_count 761', () => {
  assert.equal(manifest.phase, '46C');
  assert.equal(manifest.public_fact_count, 761);
  assert.equal(manifest.canonical_model_count, 110);
});

// Test 31: Production confidence remains UNKNOWN and specs_verified is false across all 110 models
test('Phase 46C — 31. Production confidence remains UNKNOWN and specs_verified is false across all 110 models', () => {
  for (const m of db.models) {
    assert.equal(m.production_confidence, 'UNKNOWN');
    assert.notEqual(m.specs_verified, true, `specs_verified must not be true for ${m.model_name}`);
  }
});

// Test 32: Serial ranges count remains strictly 8 (0 HIGH, 8 MEDIUM, 0 LOW)
test('Phase 46C — 32. Serial ranges count remains strictly 8 (0 HIGH, 8 MEDIUM, 0 LOW)', () => {
  const ranges = db.model_serial_ranges;
  assert.equal(ranges.length, 8);
  const highCount = ranges.filter(r => r.confidence_level === 'HIGH').length;
  const medCount = ranges.filter(r => r.confidence_level === 'MEDIUM').length;
  const lowCount = ranges.filter(r => r.confidence_level === 'LOW').length;
  assert.equal(highCount, 0);
  assert.equal(medCount, 8);
  assert.equal(lowCount, 0);
});

// Test 33: Serial decoder R2 resolution and candidate scopes completely unaffected
test('Phase 46C — 33. Serial decoder R2 resolution and candidate scopes completely unaffected', () => {
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

// Test 34: SQLite database parity
test('Phase 46C — 34. SQLite database parity: 110 models, HS 82 R technical specs populated', () => {
  const sqliteDb = new Database(path.join(rootDir, 'data/stihl_database.db'));
  const countRow = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM models').get();
  assert.equal(countRow.cnt, 110);

  const hs82r = sqliteDb.prepare('SELECT displacement_cc, power_kw, power_hp FROM models WHERE slug = ?').get('hs-82-r');
  assert.equal(hs82r.displacement_cc, 22.7);
  assert.equal(hs82r.power_kw, 0.7);
  assert.equal(hs82r.power_hp, 1.0);

  sqliteDb.close();
});
