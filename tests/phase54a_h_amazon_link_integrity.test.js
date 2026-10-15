/**
 * Test Suite: Phase 54A-H — Amazon Affiliate Link Integrity Hotfix
 * Validates hard boundary between SEARCH_LINK and VERIFIED_PRODUCT_LINK (MANUAL_ASIN),
 * fail-closed override contracts, copy integrity, and dynamic UI sections.
 */

import assert from 'assert';
import {
  AmazonAffiliateProvider,
  AMAZON_MATCH_TYPES,
  VERIFICATION_STATUSES,
  isValidAsin,
  isValidIsoTimestamp,
  isValidManualAsinOverride
} from '../src/affiliate/AmazonAffiliateProvider.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 54A-H — AMAZON LINK INTEGRITY TEST SUITE');
console.log('===============================================================\n');

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

// 1. Validation helpers
console.log('▶ Test 1: Helper contract validation (ASIN, ISO timestamp, override validator)...');
assert.strictEqual(isValidAsin('B07TEST123'), true);
assert.strictEqual(isValidAsin('B07INVALIDTOOLONG'), false);
assert.strictEqual(isValidAsin('B07SHORT'), false);

assert.strictEqual(isValidIsoTimestamp('2026-10-15T12:00:00Z'), true);
assert.strictEqual(isValidIsoTimestamp('2026-10-15T12:00:00.000Z'), true);
assert.strictEqual(isValidIsoTimestamp('2026-10-15T14:00:00+02:00'), true);
assert.strictEqual(isValidIsoTimestamp('not-a-timestamp'), false);
assert.strictEqual(isValidIsoTimestamp(null), false);
assert.strictEqual(isValidIsoTimestamp(''), false);

const validOverride = {
  part_number: '11231602050',
  asin: 'B07TEST123',
  marketplace: 'amazon.nl',
  enabled: true,
  verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
  verified_at: '2026-10-15T12:00:00Z'
};
assert.strictEqual(isValidManualAsinOverride(validOverride), true);

// Incomplete / invalid overrides must fail validation
assert.strictEqual(isValidManualAsinOverride({ ...validOverride, enabled: false }), false, 'Disabled override must fail validation');
assert.strictEqual(isValidManualAsinOverride({ ...validOverride, asin: 'INVALID' }), false, 'Invalid ASIN must fail validation');
assert.strictEqual(isValidManualAsinOverride({ ...validOverride, verification_status: 'UNVERIFIED' }), false, 'Non-exact status must fail validation');
assert.strictEqual(isValidManualAsinOverride({ ...validOverride, verification_status: undefined }), false, 'Missing verification status must fail validation');
assert.strictEqual(isValidManualAsinOverride({ ...validOverride, verified_at: null }), false, 'Null verified_at must fail validation');
assert.strictEqual(isValidManualAsinOverride({ ...validOverride, verified_at: 'invalid-date' }), false, 'Malformed verified_at must fail validation');
assert.strictEqual(isValidManualAsinOverride({ ...validOverride, marketplace: 'amazon.fake' }), false, 'Disallowed marketplace must fail validation');
assert.strictEqual(isValidManualAsinOverride(null), false);
assert.strictEqual(isValidManualAsinOverride(undefined), false);

console.log('  ✅ Test 1 Passed: Helper validation functions strictly enforce contract.\n');

// 2. Fail-closed behavior on incomplete overrides
console.log('▶ Test 2: Incomplete/unverified manual overrides fail closed to SEARCH_LINK...');
const incompleteOverrides = [
  {
    part_number: '11231602050',
    asin: 'B07TEST123',
    // Missing verification_status and verified_at
    enabled: true
  },
  {
    part_number: '11210071001',
    asin: 'B07TEST456',
    enabled: true,
    verification_status: 'PARTIAL_MATCH', // Not VERIFIED_EXACT_MATCH
    verified_at: '2026-10-15T12:00:00Z'
  }
];

const providerWithIncomplete = new AmazonAffiliateProvider({
  manualOverrides: incompleteOverrides,
  associateTag: 'srihldecoder2-21'
});

const offer1 = providerWithIncomplete.getOffers({ partNumber: '11231602050' })[0];
assert.strictEqual(offer1.match_type, AMAZON_MATCH_TYPES.SEARCH_LINK, 'Missing verification must fail closed to SEARCH_LINK');
assert.strictEqual(offer1.asin, null, 'Must not emit ASIN when failing closed');
assert.strictEqual(offer1.label, 'Zoek op Amazon.nl');
assert.strictEqual(offer1.badge_label, 'Amazon-zoekopdracht');
assert(!offer1.url.includes('/dp/'), 'Search link must not contain /dp/');
assert(offer1.url.includes('/s?k='), 'Search link must contain /s?k=');

const offer2 = providerWithIncomplete.getOffers({ partNumber: '11210071001' })[0];
assert.strictEqual(offer2.match_type, AMAZON_MATCH_TYPES.SEARCH_LINK, 'Non-exact match status must fail closed to SEARCH_LINK');

console.log('  ✅ Test 2 Passed: Incomplete overrides cleanly fail closed to search links.\n');

// 3. Complete verified override behavior
console.log('▶ Test 3: Complete verified override produces VERIFIED_PRODUCT_LINK (/dp/<ASIN>)...');
const providerWithVerified = new AmazonAffiliateProvider({
  manualOverrides: [validOverride],
  associateTag: 'srihldecoder2-21'
});

const verifiedOffer = providerWithVerified.getOffers({ partNumber: '11231602050' })[0];
assert.strictEqual(verifiedOffer.match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
assert.strictEqual(verifiedOffer.asin, 'B07TEST123');
assert.strictEqual(verifiedOffer.is_verified, true);
assert.strictEqual(verifiedOffer.verification_status, VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH);
assert.strictEqual(verifiedOffer.verified_at, '2026-10-15T12:00:00Z');
assert.strictEqual(verifiedOffer.label, 'Bekijk product op Amazon.nl');
assert.strictEqual(verifiedOffer.badge_label, 'Geverifieerd product');
assert(verifiedOffer.url.includes('/dp/B07TEST123'));
assert(verifiedOffer.description.includes('specifieke Amazon-productpagina gecontroleerd'));
assert(verifiedOffer.cta_aria_label.includes('Bekijk geverifieerd Amazon-product'));

console.log('  ✅ Test 3 Passed: Verified override produces authentic product link and honest claims.\n');

// 4. UI rendering for pure search fallback vs verified product
console.log('▶ Test 4: Part detail page dynamic heading & copy matrix...');
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

// Default empty override inventory (current production state)
const htmlPureSearch = renderPartDetailPageHtml('11231602050');
assert(htmlPureSearch.includes('Zoek dit onderdeel online'), 'Pure search link must render "Zoek dit onderdeel online" heading');
assert(!htmlPureSearch.includes('Waar te koop'), 'Pure search link must NEVER render "Waar te koop"');
assert(htmlPureSearch.includes('Zoek op Amazon.nl'), 'Pure search button must be "Zoek op Amazon.nl"');
assert(!htmlPureSearch.includes('Bekijk op Amazon.nl'), 'Pure search must NOT use "Bekijk op Amazon.nl"');
assert(!htmlPureSearch.includes('Bekijk product op Amazon.nl'), 'Pure search must NOT use "Bekijk product op Amazon.nl"');
assert(htmlPureSearch.includes('Amazon-zoekopdracht'), 'Pure search must use "Amazon-zoekopdracht" badge');
assert(!htmlPureSearch.includes('Geverifieerd product'), 'Pure search must NOT use "Geverifieerd product" badge');
assert(htmlPureSearch.includes('Beschikbaarheid en exacte productmatch zijn niet vooraf bevestigd'), 'Must include disclaimer');
assert(!htmlPureSearch.includes('op voorraad'), 'Must never claim stock availability');
assert(!htmlPureSearch.includes('direct leverbaar'), 'Must never claim immediate delivery');

console.log('  ✅ Test 4 Passed: Pure search link renders honest UI without unverified claims.\n');

// 5. Representative canonical parts test
console.log('▶ Test 5: Representative canonical parts test (11231602050, 11210071001, 00009677339)...');
const testParts = ['11231602050', '11210071001', '00009677339'];
for (const partNo of testParts) {
  const resolved = PartCatalogResolver.resolvePartNumber(partNo);
  assert(resolved, `Part ${partNo} must resolve in canonical catalog`);
  const html = renderPartDetailPageHtml(partNo);
  assert(html.includes('Zoek dit onderdeel online'), `Part ${partNo} must have search heading`);
  assert(html.includes('Zoek op Amazon.nl'), `Part ${partNo} must have search button`);
  assert(html.includes('Amazon-zoekopdracht'), `Part ${partNo} must have search badge`);
  assert(!html.includes('Waar te koop'), `Part ${partNo} must NOT have "Waar te koop"`);
  assert(!html.includes('Bekijk op Amazon.nl'), `Part ${partNo} must NOT have "Bekijk op Amazon.nl"`);
}
console.log('  ✅ Test 5 Passed: All representative canonical parts render properly.\n');

console.log('===============================================================');
console.log('🎉 ALL PHASE 54A-H AMAZON INTEGRITY TESTS PASSED 100% CLEANLY!');
console.log('===============================================================\n');
