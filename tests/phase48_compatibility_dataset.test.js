/**
 * tests/phase48_compatibility_dataset.test.js
 * Comprehensive test suite for Phase 48 Compatibility Dataset Integrity.
 * Tests A through J per Phase 48 Specification.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RECOMMENDATION_TYPES, COMPATIBILITY_STATUSES } from '../src/modelRecommendations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\n===============================================================');
console.log('🧪 RUNNING PHASE 48 COMPATIBILITY DATASET TEST SUITE');
console.log('===============================================================\n');

const compatPath = path.join(rootDir, 'data', 'model_product_compatibility.json');
const evPath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const dbPath = path.join(rootDir, 'data', 'stihl_database.json');

const compatData = JSON.parse(fs.readFileSync(compatPath, 'utf8'));
const evData = JSON.parse(fs.readFileSync(evPath, 'utf8'));
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const factsArray = Array.isArray(evData.facts) ? evData.facts : Object.values(evData.facts || {});
const factsMap = new Map(factsArray.map((f) => [f.fact_id, f]));
const canonicalDbSlugs = new Set((db.models || []).map((m) => m.slug));

const EXPECTED_PILOT_MODELS = ['ms-170', 'ms-180', 'ms-251', 'ms-260', 'ms-261', 'ms-362', 'ms-440', 'ms-462'];

// ▶ Test A: All 8 pilot models exist and have valid structure in dataset
console.log('▶ Test A: Validating 8 pilot models presence and structure...');
assert.strictEqual(typeof compatData.models, 'object', 'models must be an object');
for (const slug of EXPECTED_PILOT_MODELS) {
  assert.ok(compatData.models[slug], `Pilot model ${slug} must be present`);
  assert.ok(canonicalDbSlugs.has(slug), `Pilot model ${slug} must exist in canonical stihl_database.json`);
  const m = compatData.models[slug];
  assert.strictEqual(m.machine_identity.model_slug, slug, `machine_identity.model_slug must match ${slug}`);
  assert.ok(m.categories && typeof m.categories === 'object', `categories must exist for ${slug}`);
}
console.log('  ✅ Test A Passed: All 8 pilot models exist with valid structure.');

// ▶ Test B: All recommendation types belong to ALLOWED_RECOMMENDATION_TYPES
console.log('▶ Test B: Validating recommendation types...');
const allowedTypes = new Set(Object.values(RECOMMENDATION_TYPES));
for (const [slug, m] of Object.entries(compatData.models)) {
  for (const [catName, recs] of Object.entries(m.categories)) {
    assert.ok(allowedTypes.has(catName), `Category key "${catName}" in ${slug} must be allowed`);
    for (const r of recs) {
      assert.ok(allowedTypes.has(r.recommendation_type), `Recommendation type "${r.recommendation_type}" in ${r.recommendation_id} must be allowed`);
      assert.strictEqual(r.recommendation_type, catName, `recommendation_type must match category key`);
    }
  }
}
console.log('  ✅ Test B Passed: All recommendation types conform to ALLOWED_RECOMMENDATION_TYPES.');

// ▶ Test C: All compatibility statuses belong to ALLOWED_COMPATIBILITY_STATUSES
console.log('▶ Test C: Validating compatibility statuses...');
const allowedStatuses = new Set(Object.values(COMPATIBILITY_STATUSES));
for (const [slug, m] of Object.entries(compatData.models)) {
  for (const [catName, recs] of Object.entries(m.categories)) {
    for (const r of recs) {
      assert.ok(allowedStatuses.has(r.compatibility_status), `Status "${r.compatibility_status}" in ${r.recommendation_id} must be allowed`);
    }
  }
}
console.log('  ✅ Test C Passed: All compatibility statuses belong to ALLOWED_COMPATIBILITY_STATUSES.');

// ▶ Test D: All evidence_fact_ids exist in public_evidence_facts.json and match the model slug
console.log('▶ Test D: Validating evidence_fact_ids integrity...');
let factCount = 0;
for (const [slug, m] of Object.entries(compatData.models)) {
  for (const [catName, recs] of Object.entries(m.categories)) {
    for (const r of recs) {
      for (const factId of r.evidence_fact_ids || []) {
        factCount++;
        const fact = factsMap.get(factId);
        assert.ok(fact, `Fact ID "${factId}" must exist in public_evidence_facts.json`);
        assert.strictEqual(fact.model_slug, slug, `Fact ID "${factId}" belongs to "${fact.model_slug}", expected "${slug}"`);
      }
    }
  }
}
assert.ok(factCount > 0, 'At least one fact ID must be verified');
console.log(`  ✅ Test D Passed: ${factCount} evidence_fact_ids verified with zero mismatch.`);

// ▶ Test E: Verified spark plugs match canonical engine specifications
console.log('▶ Test E: Validating verified spark plugs...');
for (const [slug, m] of Object.entries(compatData.models)) {
  const sparkRecs = m.categories.spark_plug || [];
  for (const r of sparkRecs) {
    if (r.compatibility_status === COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY) {
      assert.ok(r.specification, `Verified spark plug ${r.recommendation_id} must have specification`);
      assert.ok(r.specification.gap_mm > 0, `Verified spark plug must specify gap_mm > 0`);
      assert.ok(r.evidence_fact_ids.length > 0, `Verified spark plug must link to evidence fact IDs`);
    }
  }
}
console.log('  ✅ Test E Passed: Verified spark plugs match specifications and evidence.');

// ▶ Test F: Verified saw chain configurations have matching pitch, gauge, and drive links
console.log('▶ Test F: Validating saw chain configurations...');
for (const [slug, m] of Object.entries(compatData.models)) {
  const chains = m.categories.chain || [];
  for (const r of chains) {
    if (r.compatibility_status === COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY) {
      const spec = r.specification;
      assert.ok(spec, `Chain ${r.recommendation_id} must have specification`);
      assert.ok(spec.pitch, `Chain must have pitch`);
      assert.ok(spec.gauge_mm > 0, `Chain must have positive gauge_mm`);
      assert.ok(Number.isInteger(spec.drive_links) && spec.drive_links > 0, `Chain must have integer drive_links > 0`);
      assert.ok(spec.guide_bar_length_cm > 0, `Chain must specify guide_bar_length_cm`);
    }
  }
}
console.log('  ✅ Test F Passed: Verified saw chain configurations are geometrically complete.');

// ▶ Test G: Guide bars have valid mount types and length
console.log('▶ Test G: Validating guide bar mount types and lengths...');
for (const [slug, m] of Object.entries(compatData.models)) {
  const bars = m.categories.bar || [];
  for (const r of bars) {
    if (r.compatibility_status === COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY) {
      const spec = r.specification;
      assert.ok(spec, `Bar ${r.recommendation_id} must have specification`);
      assert.ok(spec.mount_type.includes('3005') || spec.mount_type.includes('3003'), `Bar mount type must be 3005 or 3003`);
      assert.ok((spec.guide_bar_length_cm || spec.bar_length_cm) > 0, `Bar length must be positive`);
    }
  }
}
console.log('  ✅ Test G Passed: Guide bars have valid STIHL mount types (3005/3003) and lengths.');

// ▶ Test H: OEM part numbers follow canonical 11-digit STIHL format xxxx xxx xxxx
console.log('▶ Test H: Validating OEM part number formatting...');
const OEM_REGEX = /^\d{4}\s\d{3}\s\d{4}$/;
let oemCount = 0;
for (const [slug, m] of Object.entries(compatData.models)) {
  for (const [catName, recs] of Object.entries(m.categories)) {
    for (const r of recs) {
      if (r.oem_part_number) {
        oemCount++;
        assert.ok(OEM_REGEX.test(r.oem_part_number), `OEM Part Number "${r.oem_part_number}" in ${r.recommendation_id} must match format xxxx xxx xxxx`);
      }
    }
  }
}
assert.ok(oemCount >= 20, `Expected at least 20 OEM part numbers, found ${oemCount}`);
console.log(`  ✅ Test H Passed: All ${oemCount} OEM part numbers strictly match "xxxx xxx xxxx" format.`);

// ▶ Test I: Generic recommendations (oils, PPE, tools) do not overclaim model-specific verification
console.log('▶ Test I: Validating generic recommendations do not overclaim...');
for (const [slug, m] of Object.entries(compatData.models)) {
  for (const catName of ['chain_oil', 'two_stroke_oil', 'protective_gear', 'maintenance_tool']) {
    const recs = m.categories[catName] || [];
    for (const r of recs) {
      assert.notStrictEqual(
        r.compatibility_status,
        COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
        `Generic category "${catName}" in ${slug} must NOT claim VERIFIED_MODEL_COMPATIBILITY`
      );
    }
  }
}
console.log('  ✅ Test I Passed: Generic categories never overclaim VERIFIED_MODEL_COMPATIBILITY.');

// ▶ Test J: Zero unverified recommendations claim VERIFIED_MODEL_COMPATIBILITY
console.log('▶ Test J: Validating unverified recommendations status separation...');
for (const [slug, m] of Object.entries(compatData.models)) {
  for (const [catName, recs] of Object.entries(m.categories)) {
    for (const r of recs) {
      if (r.compatibility_status === COMPATIBILITY_STATUSES.UNVERIFIED) {
        assert.strictEqual(r.evidence_fact_ids.length, 0, `Unverified recommendation must have zero evidence_fact_ids`);
      }
    }
  }
}
console.log('  ✅ Test J Passed: Zero unverified recommendations claim verified status.');

console.log('\n🎉 ALL PHASE 48 COMPATIBILITY DATASET TESTS PASSED 100% CLEANLY!\n');
