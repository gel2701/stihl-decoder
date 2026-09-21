import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as runtime from '../src/publicEvidence.js';

const rootDir = process.cwd();

const db = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/stihl_database.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_baseline_manifest.json'), 'utf8'));
const delta = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45c_canonical_delta.json'), 'utf8')).writes;
const wave1 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_phase45b_wave1_definition.json'), 'utf8')).identities;
const wave1Slugs = new Set(wave1.map(w => w.proposed_slug));

test('Phase 45C — 1-3. Target 15 identities, models count 98, CORE5 98/98', () => {
  assert.equal(wave1.length, 15);
  assert.equal(db.models.length, 98);
  assert.equal(db.models.filter(m => m.basic_classification?.core5_completeness === 5).length, 98);
});

test('Phase 45C — 4-6. Pre-45B 83 models technical data untouched', () => {
  const pre45b = db.models.slice(0, 83);
  assert.equal(pre45b.length, 83);
  for (const w of delta) {
    assert.ok(wave1Slugs.has(w.slug), `Write to non-Wave 1 model: ${w.slug}`);
  }
});

test('Phase 45C — 7-8. Old 665 facts immutable and baseline 38 unindexed unchanged', () => {
  assert.equal(store.facts.length, 665 + delta.length);
  assert.equal(manifest.fact_count, 665 + delta.length);

  const indexedIds = new Set(Object.values(store.model_index).flatMap(e => e.fact_ids));
  const unindexedCount = store.facts.slice(0, 665).filter(f => !indexedIds.has(f.fact_id)).length;
  assert.equal(unindexedCount, 38);
});

test('Phase 45C — 11-13. Canonical delta: before was null, every write has fact_id', () => {
  for (const w of delta) {
    assert.equal(w.before, null);
    assert.ok(w.after != null);
    assert.ok(w.fact_id);
    const fact = store.facts.find(f => f.fact_id === w.fact_id);
    assert.ok(fact, `Missing supporting fact for ${w.slug}.${w.field}`);
    assert.equal(fact.normalized_value, w.after);
  }
});

test('Phase 45C — 14-16. Every safe fact schema-complete, model-indexed, field-indexed', () => {
  const newFacts = store.facts.slice(665);
  assert.equal(newFacts.length, delta.length);

  for (const f of newFacts) {
    assert.ok(f.fact_id);
    assert.ok(f.model_slug);
    assert.ok(f.field);
    assert.ok(f.normalized_value != null);
    assert.ok(f.unit);
    assert.equal(f.public_evidence_status, 'OFFICIAL_DOCUMENTED');
    assert.equal(f.display_eligible, true);
    assert.equal(f.single_value_eligible, true);

    // Check model index
    assert.ok(store.model_index[f.model_slug]?.fact_ids.includes(f.fact_id), `Missing model_index for ${f.fact_id}`);

    // Check field index
    assert.equal(store.field_index[f.model_slug]?.[f.field], f.fact_id, `Missing field_index for ${f.fact_id}`);
  }
});

test('Phase 45C — 17-18. Runtime resolution and canonical parity F/F and C/C', () => {
  const attached = { ...db, public_evidence: store };
  for (const w of delta) {
    const facts = runtime.getPublicEvidenceFactsForModel(w.slug, attached);
    const fact = facts.find(f => f.field === w.field);
    assert.ok(fact, `Runtime resolution failed for ${w.slug}.${w.field}`);
    assert.equal(fact.normalized_value, w.after);
  }
});

test('Phase 45C — 19-20. Unique fact IDs and no duplicate fields per model in new facts', () => {
  const newFacts = store.facts.slice(665);
  const factIds = new Set(newFacts.map(f => f.fact_id));
  assert.equal(factIds.size, newFacts.length);

  const modelFields = new Set(newFacts.map(f => `${f.model_slug}:${f.field}`));
  assert.equal(modelFields.size, newFacts.length);
});

test('Phase 45C — 23-24. Charger 127/220V never machine voltage & kit contents not machine specs', () => {
  const newFacts = store.facts.slice(665);
  const voltageFacts = newFacts.filter(f => f.field === 'voltage_v');
  assert.equal(voltageFacts.length, 0, 'No machine voltage facts should be written in Wave 1');

  for (const m of db.models.slice(83)) {
    assert.equal(m.voltage_v, null);
    assert.equal(m.battery_system, null);
  }
});

test('Phase 45C — 27. FSA 135 configuration safety: no flattened attachment vibration', () => {
  const fsa135Facts = store.facts.slice(665).filter(f => f.model_slug === 'fsa-135');
  for (const f of fsa135Facts) {
    if (f.field.includes('vibration')) {
      assert.ok(f.field.includes('nylon') || f.field.includes('blade'), 'Vibration must have nylon/blade qualification');
    }
  }
});

test('Phase 45C — 29. Sound pressure & power have explicit dB(A) units', () => {
  const soundFacts = store.facts.slice(665).filter(f => f.field.includes('sound_'));
  assert.ok(soundFacts.length > 0);
  for (const f of soundFacts) {
    assert.equal(f.unit, 'dB(A)');
  }
});

test('Phase 45C — 34-35. Production confidence UNKNOWN & specs_verified not true', () => {
  for (const m of db.models) {
    assert.equal(m.production_confidence, 'UNKNOWN');
    assert.notStrictEqual(m.specs_verified, true);
  }
});
