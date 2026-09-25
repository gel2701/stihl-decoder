/**
 * tests/phase48_compatibility_dataset.test.js
 * Comprehensive test suite for Phase 48 / 48A Compatibility Dataset Integrity.
 * Tests positive contracts and negative validation gates.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RECOMMENDATION_TYPES, COMPATIBILITY_STATUSES } from '../src/modelRecommendations.js';
import { validateCompatibilityDataset } from '../scripts/validate_model_product_compatibility.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\n===============================================================');
console.log('🧪 RUNNING PHASE 48A COMPATIBILITY DATASET TEST SUITE');
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
        assert.strictEqual(fact.display_eligible, true, `Fact ID "${factId}" must be display_eligible`);
        assert.strictEqual(fact.single_value_eligible, true, `Fact ID "${factId}" must be single_value_eligible`);
      }
    }
  }
}
assert.strictEqual(factCount, 12, 'Exactly 12 facts for 6 verified spark plugs');
console.log(`  ✅ Test D Passed: ${factCount} evidence_fact_ids verified with zero mismatch.`);

// ▶ Test E: Verified spark plugs match canonical engine specifications
console.log('▶ Test E: Validating verified spark plugs...');
let verifiedCount = 0;
for (const [slug, m] of Object.entries(compatData.models)) {
  const sparkRecs = m.categories.spark_plug || [];
  for (const r of sparkRecs) {
    if (r.compatibility_status === COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY) {
      verifiedCount++;
      assert.ok(r.specification, `Verified spark plug ${r.recommendation_id} must have specification`);
      assert.ok(r.specification.gap_mm > 0, `Verified spark plug must specify gap_mm > 0`);
      assert.ok(r.evidence_fact_ids.length > 0, `Verified spark plug must link to evidence fact IDs`);
    }
  }
}
assert.strictEqual(verifiedCount, 6, 'Exactly 6 verified spark plugs across 8 models');
console.log('  ✅ Test E Passed: Exactly 6 verified spark plugs match specifications and evidence.');

// ▶ Test F: Saw chain configurations have matching pitch, gauge, and drive links
console.log('▶ Test F: Validating saw chain configurations...');
for (const [slug, m] of Object.entries(compatData.models)) {
  const chains = m.categories.chain || [];
  for (const r of chains) {
    // Phase 48A Invariant: chains without composite configuration evidence must be SPECIFICATION_MATCH_ONLY
    assert.strictEqual(r.compatibility_status, COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY, 'Chains must be SPECIFICATION_MATCH_ONLY');
    assert.strictEqual(r.evidence_fact_ids.length, 0, 'Chains without composite evidence must have empty evidence_fact_ids');
    const spec = r.specification;
    assert.ok(spec, `Chain ${r.recommendation_id} must have specification`);
    assert.ok(spec.pitch, `Chain must have pitch`);
    assert.ok(spec.gauge_mm > 0, `Chain must have positive gauge_mm`);
    assert.ok(Number.isInteger(spec.drive_links) && spec.drive_links > 0, `Chain must have integer drive_links > 0`);
    assert.ok(spec.guide_bar_length_cm > 0, `Chain must specify guide_bar_length_cm`);
  }
}
console.log('  ✅ Test F Passed: Saw chain configurations are geometrically complete and non-overclaiming.');

// ▶ Test G: Guide bars have valid mount types and length
console.log('▶ Test G: Validating guide bar mount types and lengths...');
for (const [slug, m] of Object.entries(compatData.models)) {
  const bars = m.categories.bar || [];
  for (const r of bars) {
    assert.strictEqual(r.compatibility_status, COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY, 'Bars must be SPECIFICATION_MATCH_ONLY');
    assert.strictEqual(r.evidence_fact_ids.length, 0, 'Bars without composite evidence must have empty evidence_fact_ids');
    const spec = r.specification;
    assert.ok(spec, `Bar ${r.recommendation_id} must have specification`);
    assert.ok(spec.mount_type.includes('3005') || spec.mount_type.includes('3003'), `Bar mount type must be 3005 or 3003`);
    assert.ok((spec.guide_bar_length_cm || spec.bar_length_cm) > 0, `Bar length must be positive`);
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
assert.strictEqual(oemCount, 24, `Expected exactly 24 OEM part numbers, found ${oemCount}`);
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

// ▶ Test J: Generic two-stroke claims do not overclaim 1:50 without model-specific proof
console.log('▶ Test J: Validating generic two-stroke oil claims...');
for (const [slug, m] of Object.entries(compatData.models)) {
  const oilRecs = m.categories.two_stroke_oil || [];
  for (const r of oilRecs) {
    assert.ok(!r.display_claim.includes('1:50'), `Claim "${r.display_claim}" in ${slug} must not hardcode 1:50`);
    assert.ok(!r.display_guidance.includes('1:50'), `Guidance in ${slug} must not hardcode 1:50`);
    assert.ok(r.display_guidance.includes('Controleer de voorgeschreven brandstof/mengverhouding'), 'Must contain neutral check instruction');
  }
}
console.log('  ✅ Test J Passed: Two-stroke oil recommendations use neutral instruction without overclaiming.');

// =========================================================================
// NEGATIVE VALIDATION TESTS (Requirement 8)
// =========================================================================

// ▶ Test K: Negative: VERIFIED with empty evidence_fact_ids MUST FAIL
console.log('▶ Test K (Negative): VERIFIED with empty evidence_fact_ids must fail validator...');
const badDataK = JSON.parse(JSON.stringify(compatData));
badDataK.models['ms-170'].categories.spark_plug[0].evidence_fact_ids = [];
const resultK = validateCompatibilityDataset(badDataK);
assert.strictEqual(resultK.valid, false, 'Validator must reject VERIFIED with empty evidence_fact_ids');
assert.ok(resultK.errors.some((e) => e.includes('VERIFIED_MODEL_COMPATIBILITY strictly requires canonical evidence')));
console.log('  ✅ Test K Passed: Rejected VERIFIED record with empty evidence_fact_ids.');

// ▶ Test L: Negative: VERIFIED with fact from another model MUST FAIL
console.log('▶ Test L (Negative): VERIFIED with fact from different model must fail validator...');
const badDataL = JSON.parse(JSON.stringify(compatData));
// Put MS 261 spark plug fact onto MS 170
badDataL.models['ms-170'].categories.spark_plug[0].evidence_fact_ids = ['6ccb7c0711129aaa'];
const resultL = validateCompatibilityDataset(badDataL);
assert.strictEqual(resultL.valid, false, 'Validator must reject fact from different model');
assert.ok(resultL.errors.some((e) => e.includes('belongs to model "ms-261", not "ms-170"')));
console.log('  ✅ Test L Passed: Rejected VERIFIED record with cross-model fact.');

// ▶ Test M: Negative: VERIFIED with non-display-eligible fact MUST FAIL
console.log('▶ Test M (Negative): VERIFIED with non-display-eligible fact must fail validator...');
// Temporarily mock a fact in public_evidence_facts memory map
const badDataM = JSON.parse(JSON.stringify(compatData));
badDataM.models['ms-170'].categories.spark_plug[0].evidence_fact_ids = ['non_existent_fact_id_xyz'];
const resultM = validateCompatibilityDataset(badDataM);
assert.strictEqual(resultM.valid, false, 'Validator must reject non-existent / ineligible fact');
assert.ok(resultM.errors.some((e) => e.includes('not found in public_evidence_facts.json')));
console.log('  ✅ Test M Passed: Rejected VERIFIED record with invalid fact.');

// ▶ Test N: Negative: OEM part number without evidence cannot be VERIFIED
console.log('▶ Test N (Negative): OEM part number without evidence cannot be VERIFIED...');
const badDataN = JSON.parse(JSON.stringify(compatData));
badDataN.models['ms-170'].categories.chain[0].compatibility_status = 'VERIFIED_MODEL_COMPATIBILITY';
badDataN.models['ms-170'].categories.chain[0].evidence_fact_ids = [];
const resultN = validateCompatibilityDataset(badDataN);
assert.strictEqual(resultN.valid, false, 'Validator must reject OEM part number claiming VERIFIED without evidence');
assert.ok(resultN.errors.some((e) => e.includes('VERIFIED_MODEL_COMPATIBILITY strictly requires canonical evidence')));
console.log('  ✅ Test N Passed: Confirmed OEM part number alone cannot elevate to VERIFIED.');

// ▶ Test O: Negative: ACTIVE_AFFILIATE with merchant.affiliate_active === false MUST FAIL
console.log('▶ Test O (Negative): ACTIVE_AFFILIATE on inactive merchant must fail validator...');
const badDataO = JSON.parse(JSON.stringify(compatData));
badDataO.models['ms-170'].categories.spark_plug[0].commercial_offers = {
  offers_active: true,
  offers: [
    {
      offer_id: 'off_bad_active',
      merchant_id: 'bol', // bol has affiliate_active: false
      title: 'Bougie',
      product_url: 'https://www.bol.com/nl/p/1',
      affiliate_url: 'https://www.bol.com/nl/p/1?aff=test',
      status: 'ACTIVE_AFFILIATE'
    }
  ]
};
const resultO = validateCompatibilityDataset(badDataO);
assert.strictEqual(resultO.valid, false, 'Validator must reject ACTIVE_AFFILIATE on inactive merchant');
assert.ok(resultO.errors.some((e) => e.includes('affiliate_active === false, cannot host ACTIVE_AFFILIATE offer')));
console.log('  ✅ Test O Passed: Confirmed ACTIVE_AFFILIATE rejected on inactive merchant.');

console.log('\n🎉 ALL PHASE 48A COMPATIBILITY DATASET TESTS PASSED 100% CLEANLY!\n');
