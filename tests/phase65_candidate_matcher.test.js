import assert from 'node:assert/strict';
import { AmazonCandidateMatcher, CANDIDATE_STATUSES as S } from '../src/affiliate/AmazonCandidateMatcher.js';

const registered = {
  part_number: '11104007005', asin: 'B0068M5NAG', marketplace: 'amazon.nl',
  status: 'VERIFIED', affiliate_tag: 'test-tag', manufacturer: 'Bosch', brand: 'Bosch',
  manufacturer_part_number: 'WSR6F', oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
  verification_date: new Date().toISOString(), package_quantity: 1, ean_gtin: '0087295133651',
  variant: 'single', specifications: { thread: 'M14' },
  compatibility_proof: 'Manufacturer catalog fitment',
  asin_product_identity_proof: 'Independent distributor corroborates Amazon ASIN',
  independent_evidence_url: 'https://example.org/catalog/plug',
  verifiable_evidence_sources: [{ url: 'https://example.org/catalog/plug', claim: 'ASIN B0068M5NAG is Bosch WSR6F' }]
};
const observation = {
  part_number: registered.part_number, asin: registered.asin, marketplace: registered.marketplace,
  manufacturer: registered.manufacturer, brand: registered.brand, manufacturer_part_number: registered.manufacturer_part_number,
  oem_brand_classification: registered.oem_brand_classification, package_quantity: 1,
  ean_gtin: registered.ean_gtin, variant: 'single', specifications: { thread: 'M14' }
};
const match = (changes = {}, existing = registered) => AmazonCandidateMatcher.matchCandidate(existing, { ...observation, ...changes });
assert.equal(match().status, S.VERIFIED);
assert.equal(match({}, { ...registered, status: 'STAGED' }).status, S.STAGED);
assert.equal(match({ asin: 'B001RM8J76' }).status, S.REJECTED);
assert.equal(match({ manufacturer: 'NGK' }).status, S.REJECTED);
assert.equal(match({ brand: 'NGK' }).status, S.REJECTED);
assert.equal(match({ package_quantity: 10 }).status, S.REJECTED);
assert.equal(match({ marketplace: 'amazon.de' }).status, S.REJECTED);
assert.equal(match({ ean_gtin: '0087295133652' }).status, S.REJECTED);
assert.equal(match({ ean_gtin: '4006381333931' }).status, S.REJECTED);
assert.equal(match({ specifications: { thread: 'M10' } }).status, S.REJECTED);
assert.equal(match({ oem_brand_classification: 'MANUFACTURER_AFTERMARKET' }).status, S.REJECTED);
assert.equal(match({ ean_gtin: null }).status, S.INSUFFICIENT_EVIDENCE);
assert.equal(match({ error: 'timeout' }).status, S.INSUFFICIENT_EVIDENCE);
assert.equal(match({ temporary_error: true }).status, S.INSUFFICIENT_EVIDENCE);
assert.equal(match({}, { ...registered, asin_product_identity_proof: '' }).status, S.STAGED);
assert.equal(match({}, null).status, S.INSUFFICIENT_EVIDENCE);
const results = AmazonCandidateMatcher.matchCandidates([registered], [observation, { ...observation, marketplace: 'amazon.de' }]);
assert.deepEqual(results.map(result => result.status), [S.VERIFIED, S.REJECTED]);
assert.equal(registered.status, 'VERIFIED');
assert.equal(observation.status, undefined);
console.log('Phase 65 candidate matcher: PASS');
