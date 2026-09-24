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
// Test 3: Recommendation Gates A-F Verification
// ============================================================================
console.log('▶ Test 3: Recommendation Gates A-F verification for MS 440...');
const ms440Model = {
  model_slug: 'ms-440',
  model_name: 'MS 440',
  category: 'Kettingzaag',
  series_code: '1128'
};

// Gate A: technicalSpecs.spark_plug present, but NO evidence -> NIET VERIFIED (SPECIFICATION_MATCH_ONLY)
const recsNoEvidence = buildModelRecommendations(ms440Model, { spark_plug: 'Bosch WSR6F' });
const sparkNoEv = recsNoEvidence.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkNoEv.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Gate A: spark_plug without documented evidence MUST be SPECIFICATION_MATCH_ONLY (never VERIFIED)'
);
console.log('  ✅ Gate A Passed: spark_plug without evidence yields SPECIFICATION_MATCH_ONLY.');

// Gate B: spark plug + exact model-specific eligible evidence -> VERIFIED_MODEL_COMPATIBILITY
const eligibleSparkEvidence = [{
  model_slug: 'ms-440',
  field: 'spark_plug',
  normalized_value: 'Bosch WSR6F',
  display_eligible: true,
  single_value_eligible: true,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_MANUAL'
}];
const recsWithSparkEv = buildModelRecommendations(
  ms440Model,
  { spark_plug: 'Bosch WSR6F' },
  { compatibilityEvidence: eligibleSparkEvidence }
);
const sparkWithEv = recsWithSparkEv.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.SPARK_PLUG);
assert.strictEqual(
  sparkWithEv.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
  'Gate B: spark_plug with model-specific eligible evidence MUST be VERIFIED_MODEL_COMPATIBILITY'
);
console.log('  ✅ Gate B Passed: spark_plug with eligible evidence yields VERIFIED_MODEL_COMPATIBILITY.');

// Gate C: chain pitch + gauge without drive links -> SPECIFICATION_MATCH_ONLY
const recsPartialChain = buildModelRecommendations(ms440Model, {
  chain_pitch: '3/8"',
  chain_gauge_mm: '1.6'
});
const chainPartial = recsPartialChain.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.CHAIN);
assert.strictEqual(
  chainPartial.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.SPECIFICATION_MATCH_ONLY,
  'Gate C: chain pitch + gauge without drive links MUST be SPECIFICATION_MATCH_ONLY'
);
assert.strictEqual(
  chainPartial.technical_compatibility.display_claim,
  'Steek en dikte komen overeen; controleer aantal aandrijfschakels en zwaardconfiguratie.',
  'Gate C: must provide cautious guidance regarding drive links'
);
console.log('  ✅ Gate C Passed: partial chain spec yields SPECIFICATION_MATCH_ONLY.');

// Gate D: complete officially proven chain configuration -> VERIFIED_MODEL_COMPATIBILITY
const eligibleChainEvidence = [{
  model_slug: 'ms-440',
  part_type: 'chain',
  pitch: '3/8"',
  gauge: '1.6 mm',
  drive_links: 72,
  display_eligible: true,
  single_value_eligible: true,
  public_evidence_status: 'OFFICIAL_DOCUMENTED',
  source_class: 'OFFICIAL_PARTS_LIST'
}];
const recsFullChain = buildModelRecommendations(
  ms440Model,
  {
    chain_pitch: '3/8"',
    chain_gauge_mm: '1.6',
    drive_links: 72
  },
  { compatibilityEvidence: eligibleChainEvidence }
);
const chainFull = recsFullChain.recommendations.find(s => s.recommendation_type === RECOMMENDATION_TYPES.CHAIN);
assert.strictEqual(
  chainFull.technical_compatibility.compatibility_status,
  COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
  'Gate D: complete chain config with evidence MUST be VERIFIED_MODEL_COMPATIBILITY'
);
console.log('  ✅ Gate D Passed: full chain configuration yields VERIFIED_MODEL_COMPATIBILITY.');

// Gate E & F: offers remain [] and offers_active remains false, zero merchant URLs
for (const r of [...recsNoEvidence.recommendations, ...recsWithSparkEv.recommendations, ...recsFullChain.recommendations]) {
  assert.strictEqual(r.commercial_offers.offers_active, false, 'Gate E: offers_active must be strictly false');
  assert.deepStrictEqual(r.commercial_offers.offers, [], 'Gate E: offers must be empty array');
  const serialized = JSON.stringify(r.commercial_offers);
  assert(!serialized.includes('http://') && !serialized.includes('https://'), 'Gate F: Zero merchant URLs');
}
console.log('  ✅ Gate E & F Passed: Zero offers, zero affiliate merchant URLs.\n');

// ============================================================================
// Test 4: Recommendation Slots HTML Rendering
// ============================================================================
console.log('▶ Test 4: Passport recommendation slots HTML rendering...');
const slotsHtml = renderPassportRecommendationSlotsHtml(recsWithSparkEv);
assert(slotsHtml.includes('Benodigdheden & Onderhoud voor STIHL MS 440'), 'Must include header');
assert(slotsHtml.includes('Geverifieerd compatibel'), 'Must render verified fit badge');
assert(!slotsHtml.includes('koop nu bij'), 'Must NOT contain fake affiliate merchant copy');
assert(!slotsHtml.includes('bol.com') && !slotsHtml.includes('amazon'), 'Zero merchant contamination');
console.log('  ✅ Test 4 Passed: HTML renders safely with zero merchant contamination.\n');

// ============================================================================
// Test 5: Analytics & Privacy Guarantees
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
