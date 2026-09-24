import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  COMPATIBILITY_STATUSES,
  RECOMMENDATION_TYPES,
  buildModelRecommendations,
  renderPassportRecommendationSlotsHtml
} from '../src/modelRecommendations.js';
import {
  EVENT_TYPES,
  logStihlEvent
} from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🧪 RUNNING AFFILIATE FOUNDATION & PRIVACY TEST SUITE');
console.log('===============================================================\n');

// ============================================================================
// Test 1: Model Recommendation Schema & Three-Layer Architecture
// ============================================================================
console.log('▶ Test 1: Verifying 3-layer recommendation schema definition...');
const schemaPath = path.join(rootDir, 'data', 'model_recommendation_schema.json');
assert(fs.existsSync(schemaPath), 'model_recommendation_schema.json must exist');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
assert(schema.properties.machine_identity, 'Must have Layer 1: machine_identity');
assert(schema.properties.recommendations, 'Must have Layer 2 & 3: recommendations');
const itemProps = schema.properties.recommendations.items.properties;
assert(itemProps.technical_compatibility, 'Must have Layer 2: technical_compatibility');
assert(itemProps.commercial_offers, 'Must have Layer 3: commercial_offers');
console.log('  ✅ Test 1 Passed: 3-layer architecture cleanly defined in schema.\n');

// ============================================================================
// Test 2: Compatibility Status Constants
// ============================================================================
console.log('▶ Test 2: Compatibility statuses verification...');
assert.strictEqual(COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY, 'VERIFIED_MODEL_COMPATIBILITY');
assert.strictEqual(COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY, 'SPECIFICATION_MATCH_ONLY');
assert.strictEqual(COMPATIBILITY_STATUSES.GENERIC_CATEGORY_RECOMMENDATION, 'GENERIC_CATEGORY_RECOMMENDATION');
assert.strictEqual(COMPATIBILITY_STATUSES.UNVERIFIED, 'UNVERIFIED');
assert.strictEqual(COMPATIBILITY_STATUSES.CONFLICTED, 'CONFLICTED');
console.log('  ✅ Test 2 Passed: Compatibility status hierarchy verified.\n');

// ============================================================================
// Test 3: Recommendation Slots Generation (Zero Fictional Affiliate Links)
// ============================================================================
console.log('▶ Test 3: Recommendations generation for MS 440...');
const ms440Model = {
  model_slug: 'ms-440',
  model_name: 'MS 440',
  category: 'Kettingzaag',
  series_code: '1128'
};
const ms440Specs = {
  displacement_cc: '70.7',
  power_kw: '4.0',
  spark_plug: 'Bosch WSR6F',
  chain_pitch: '3/8"',
  chain_gauge_mm: '1.6'
};

const recs = buildModelRecommendations(ms440Model, ms440Specs);
assert(recs.recommendations.length >= 3, 'Must have at least 3 relevant slots for chainsaw');

for (const rec of recs.recommendations) {
  // Layer 3 check: Zero fictional affiliate links or active offers
  assert.strictEqual(rec.commercial_offers.offers_active, false, 'offers_active must be false (no active affiliate deals)');
  assert.deepStrictEqual(rec.commercial_offers.offers, [], 'offers array must be strictly empty');
}

const sparkRec = recs.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert(sparkRec, 'Must have spark_plug slot');
assert.strictEqual(sparkRec.technical_compatibility.technical_spec_ref.value, 'Bosch WSR6F');
assert.strictEqual(sparkRec.technical_compatibility.compatibility_status, COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY);
console.log('  ✅ Test 3 Passed: Zero fictional affiliate links; specs matched cleanly.\n');

// ============================================================================
// Test 4: Recommendation Slots HTML Rendering
// ============================================================================
console.log('▶ Test 4: Passport recommendation slots HTML rendering...');
const slotsHtml = renderPassportRecommendationSlotsHtml(recs);
assert(slotsHtml.includes('Benodigdheden & Onderhoud voor STIHL MS 440'), 'Must include header');
assert(slotsHtml.includes('Geverifieerd compatibel'), 'Must render verified fit badge');
assert(!slotsHtml.includes('koop nu bij'), 'Must NOT contain fake affiliate merchant copy');
assert(!slotsHtml.includes('bol.com') && !slotsHtml.includes('amazon'), 'Zero merchant contamination');
console.log('  ✅ Test 4 Passed: HTML renders safely with zero merchant contamination.\n');

// ============================================================================
// Test 5: Analytics Privacy & Event Types
// ============================================================================
console.log('▶ Test 5: Analytics Tracker privacy and event integrity...');
assert(EVENT_TYPES.MACHINE_ADDED, 'Must have MACHINE_ADDED');
assert(EVENT_TYPES.SERIAL_ADDED_TO_MACHINE, 'Must have SERIAL_ADDED_TO_MACHINE');
assert(EVENT_TYPES.IDENTITY_CONFLICT_DETECTED, 'Must have IDENTITY_CONFLICT_DETECTED');
assert(EVENT_TYPES.RECOMMENDATION_VIEWED, 'Must have RECOMMENDATION_VIEWED');
assert(EVENT_TYPES.AFFILIATE_OFFER_IMPRESSION, 'Must have AFFILIATE_OFFER_IMPRESSION');
assert(EVENT_TYPES.AFFILIATE_OFFER_CLICK, 'Must have AFFILIATE_OFFER_CLICK');

const logRes = logStihlEvent(EVENT_TYPES.SERIAL_ADDED_TO_MACHINE, {
  model: 'MS 440',
  serial_number: '163118080', // Should be STRIPPED by whitelist
  nickname: 'Secret Saw',     // Should be STRIPPED
  notes: 'Personal note'      // Should be STRIPPED
}, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

assert(logRes, 'logStihlEvent must return an object');
assert.strictEqual(logRes.metadata.model, 'MS 440', 'Whitelisted model field is retained');
assert.strictEqual(logRes.metadata.serial_number, undefined, 'Serial number MUST BE STRIPPED!');
assert.strictEqual(logRes.metadata.nickname, undefined, 'Nickname MUST BE STRIPPED!');
assert.strictEqual(logRes.metadata.notes, undefined, 'Notes MUST BE STRIPPED!');

const jsonStr = JSON.stringify(logRes.metadata);
assert(!jsonStr.includes('163118080'), 'Serial number must never appear in metadata JSON');
assert(!jsonStr.includes('Secret Saw'), 'Nickname must never appear in metadata JSON');
assert(!jsonStr.includes('Personal note'), 'Notes must never appear in metadata JSON');
console.log('  ✅ Test 5 Passed: Strict privacy enforcement verified (zero serial/PII leaks).\n');

console.log('🎉 ALL AFFILIATE FOUNDATION & PRIVACY TESTS PASSED 100% CLEANLY!');
