/**
 * tests/phase48_commercial_offers.test.js
 * Comprehensive test suite for Phase 48 Commercial Offers Ingestion Layer.
 * Tests A through J per Phase 48 Specification.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  COMMERCIAL_OFFER_STATUSES,
  DEFAULT_MAX_PRICE_AGE_MS,
  normalizeCommercialOffer,
  isDomainAllowlisted,
  isOfferStale,
  validateCommercialOffer,
  attachOfferToRecommendation,
  getActiveOffersForRecommendation
} from '../src/commercialOffers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\n===============================================================');
console.log('🧪 RUNNING PHASE 48 COMMERCIAL OFFERS TEST SUITE');
console.log('===============================================================\n');

const merchPath = path.join(rootDir, 'data', 'affiliate_merchants.json');
const merchData = JSON.parse(fs.readFileSync(merchPath, 'utf8'));
const registeredMerchants = merchData.merchants || [];

// ▶ Test A: Normalization of commercial offers (fields, types, default values)
console.log('▶ Test A: Validating normalizeCommercialOffer...');
const raw = {
  offer_id: '  test_off_1  ',
  recommendation_id: 'rec_123',
  merchant_id: 'bol',
  title: '  Bosch Bougie WSR 6 F  ',
  product_url: 'https://www.bol.com/nl/nl/p/test/123/',
  price: '4.95',
  currency: 'EUR',
  observed_at: '2026-09-25T10:00:00Z',
  in_stock: 1
};
const norm = normalizeCommercialOffer(raw);
assert.strictEqual(norm.offer_id, 'test_off_1');
assert.strictEqual(norm.title, 'Bosch Bougie WSR 6 F');
assert.strictEqual(norm.price, 4.95);
assert.strictEqual(norm.currency, 'EUR');
assert.strictEqual(norm.in_stock, true);
assert.strictEqual(norm.status, COMMERCIAL_OFFER_STATUSES.UNMONETIZED);
console.log('  ✅ Test A Passed: Normalization cleans and formats fields correctly.');

// ▶ Test B: Offer status validation
console.log('▶ Test B: Validating offer status handling...');
const validStatuses = Object.values(COMMERCIAL_OFFER_STATUSES);
for (const s of validStatuses) {
  const o = normalizeCommercialOffer({ ...raw, status: s });
  assert.strictEqual(o.status, s);
}
const invalidOffer = normalizeCommercialOffer({ ...raw, status: 'BOGUS_STATUS' });
assert.strictEqual(invalidOffer.status, COMMERCIAL_OFFER_STATUSES.INVALID);
console.log('  ✅ Test B Passed: All canonical statuses accepted, bogus downgraded to INVALID.');

// ▶ Test C: Registered merchant lookup and unknown merchant rejection
console.log('▶ Test C: Validating merchant lookup and unknown merchant rejection...');
const unknownMerchantOffer = {
  offer_id: 'off_unknown',
  recommendation_id: 'rec_123',
  merchant_id: 'unknown_vendor_xyz',
  title: 'Generic chain',
  product_url: 'https://unknown.com/prod/1',
  status: COMMERCIAL_OFFER_STATUSES.UNMONETIZED
};
const validationC = validateCommercialOffer(unknownMerchantOffer, registeredMerchants);
assert.strictEqual(validationC.valid, false);
assert.ok(validationC.errors.some((e) => e.includes('Unknown merchant_id')));
console.log('  ✅ Test C Passed: Unknown merchant_id is strictly rejected.');

// ▶ Test D: Domain allowlist enforcement
console.log('▶ Test D: Validating domain allowlist enforcement...');
assert.strictEqual(isDomainAllowlisted('https://www.bol.com/nl/nl/p/item', 'bol', registeredMerchants), true);
assert.strictEqual(isDomainAllowlisted('https://bol.com/p/item', 'bol', registeredMerchants), true);
assert.strictEqual(isDomainAllowlisted('https://evil-bol.com/p/item', 'bol', registeredMerchants), false);
assert.strictEqual(isDomainAllowlisted('https://www.amazon.nl/dp/B001', 'amazon_nl', registeredMerchants), true);
assert.strictEqual(isDomainAllowlisted('https://www.google.com/', 'bol', registeredMerchants), false);
console.log('  ✅ Test D Passed: Domain allowlist strictly permits registered domains only.');

// ▶ Test E: Dangerous URI rejection
console.log('▶ Test E: Validating dangerous URI scheme rejection...');
const dangerousUrls = [
  'javascript:alert(1)',
  'data:text/html;base64,PHNjcmlwdD4=',
  'vbscript:msgbox',
  'file:///etc/passwd',
  'about:blank',
  'ftp://bol.com/file'
];
for (const url of dangerousUrls) {
  assert.strictEqual(isDomainAllowlisted(url, 'bol', registeredMerchants), false, `Must reject ${url}`);
}
console.log('  ✅ Test E Passed: All dangerous/unsupported URI schemes rejected.');

// ▶ Test F: Missing or malformed affiliate_url rejection when status is ACTIVE_AFFILIATE
console.log('▶ Test F: Validating ACTIVE_AFFILIATE url requirement...');
const activeMissingAffiliateUrl = {
  offer_id: 'off_active_bad',
  recommendation_id: 'rec_123',
  merchant_id: 'bol',
  title: 'Test Part',
  product_url: 'https://www.bol.com/nl/p/1',
  affiliate_url: null,
  status: COMMERCIAL_OFFER_STATUSES.ACTIVE_AFFILIATE
};
const valF1 = validateCommercialOffer(activeMissingAffiliateUrl, registeredMerchants);
assert.strictEqual(valF1.valid, false);
assert.ok(valF1.errors.some((e) => e.includes('strictly requires a valid affiliate_url')));

const activeBadDomainAffiliateUrl = {
  ...activeMissingAffiliateUrl,
  affiliate_url: 'https://malicious-tracker.com/click'
};
const valF2 = validateCommercialOffer(activeBadDomainAffiliateUrl, registeredMerchants);
assert.strictEqual(valF2.valid, false);
assert.ok(valF2.errors.some((e) => e.includes('not allowlisted')));
console.log('  ✅ Test F Passed: ACTIVE_AFFILIATE status strictly enforces valid allowlisted affiliate_url.');

// ▶ Test G: Price staleness detection
console.log('▶ Test G: Validating price staleness detection...');
const now = Date.now();
const freshOffer = { observed_at: new Date(now - 1000 * 60 * 60).toISOString(), price: 10 }; // 1 hour ago
const staleOffer = { observed_at: new Date(now - DEFAULT_MAX_PRICE_AGE_MS - 1000).toISOString(), price: 10 }; // > 7 days ago
const noDateOffer = { price: 10 };

assert.strictEqual(isOfferStale(freshOffer), false);
assert.strictEqual(isOfferStale(staleOffer), true);
assert.strictEqual(isOfferStale(noDateOffer), true);
console.log('  ✅ Test G Passed: Price staleness detection accurately identifies stale quotes.');

// ▶ Test H: Technical compatibility immutability when attaching commercial offers
console.log('▶ Test H: Validating technical compatibility immutability...');
const initialRec = {
  recommendation_id: 'rec_ms170_plug',
  recommendation_type: 'spark_plug',
  compatibility_status: 'SPECIFICATION_MATCH_ONLY',
  display_claim: 'Bosch WSR 6 F',
  evidence_basis: ['MANUAL'],
  evidence_fact_ids: [],
  commercial_offers: { offers_active: false, offers: [] }
};
const validOfferToAttach = {
  offer_id: 'off_attach_1',
  recommendation_id: 'rec_ms170_plug',
  merchant_id: 'bol',
  title: 'Bosch Bougie',
  product_url: 'https://www.bol.com/nl/p/plug',
  status: COMMERCIAL_OFFER_STATUSES.UNMONETIZED
};
const attached = attachOfferToRecommendation(initialRec, validOfferToAttach, registeredMerchants);

// Verify technical compatibility remained 100% identical
assert.strictEqual(attached.compatibility_status, 'SPECIFICATION_MATCH_ONLY');
assert.strictEqual(attached.recommendation_id, initialRec.recommendation_id);
assert.strictEqual(attached.recommendation_type, initialRec.recommendation_type);
assert.deepStrictEqual(attached.evidence_basis, initialRec.evidence_basis);
assert.strictEqual(initialRec.commercial_offers.offers.length, 0, 'Original recommendation must not be mutated');
assert.strictEqual(attached.commercial_offers.offers.length, 1);
console.log('  ✅ Test H Passed: Technical compatibility is completely immutable upon offer attachment.');

// ▶ Test I: Recommendation ID binding and mismatch rejection
console.log('▶ Test I: Validating recommendation_id mismatch rejection...');
const mismatchedOffer = {
  ...validOfferToAttach,
  recommendation_id: 'different_rec_id'
};
assert.throws(() => {
  attachOfferToRecommendation(initialRec, mismatchedOffer, registeredMerchants);
}, /Recommendation ID mismatch/);
console.log('  ✅ Test I Passed: Recommendation ID mismatch is strictly rejected.');

// ▶ Test J: Offer filtering and price suppression for displayable offers
console.log('▶ Test J: Validating active displayable offers filtering...');
const recWithOffers = {
  ...initialRec,
  commercial_offers: {
    offers_active: false,
    offers: [
      {
        offer_id: 'off_fresh',
        merchant_id: 'bol',
        title: 'Fresh Offer',
        product_url: 'https://www.bol.com/1',
        price: 15.0,
        observed_at: new Date(now - 1000).toISOString(),
        status: COMMERCIAL_OFFER_STATUSES.UNMONETIZED
      },
      {
        offer_id: 'off_stale',
        merchant_id: 'bol',
        title: 'Stale Offer',
        product_url: 'https://www.bol.com/2',
        price: 12.0,
        observed_at: new Date(now - DEFAULT_MAX_PRICE_AGE_MS - 10000).toISOString(),
        status: COMMERCIAL_OFFER_STATUSES.UNMONETIZED
      },
      {
        offer_id: 'off_disabled',
        merchant_id: 'bol',
        title: 'Disabled Offer',
        product_url: 'https://www.bol.com/3',
        price: 10.0,
        status: COMMERCIAL_OFFER_STATUSES.DISABLED
      }
    ]
  }
};
const displayable = getActiveOffersForRecommendation(recWithOffers);
assert.strictEqual(displayable.length, 2, 'Disabled offer must be excluded');
const freshDisplay = displayable.find((o) => o.offer_id === 'off_fresh');
const staleDisplay = displayable.find((o) => o.offer_id === 'off_stale');
assert.strictEqual(freshDisplay.display_price, 15.0);
assert.strictEqual(freshDisplay.is_price_stale, false);
assert.strictEqual(staleDisplay.display_price, null, 'Stale price must be suppressed to null');
assert.strictEqual(staleDisplay.is_price_stale, true);
console.log('  ✅ Test J Passed: Stale price suppression and status filtering work as expected.');

console.log('\n🎉 ALL PHASE 48 COMMERCIAL OFFERS TESTS PASSED 100% CLEANLY!\n');
