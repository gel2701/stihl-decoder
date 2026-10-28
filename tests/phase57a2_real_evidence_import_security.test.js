/**
 * Test Suite: Phase 57A.2 — Real Evidence & Fail-Closed Affiliate Import Security
 *
 * Verifies the 20 requirements specified in Section 48:
 * 1. Builder cannot create search results without raw evidence
 * 2. Unaudited item stays UNAUDITED
 * 3. Fake/generated timestamp evidence rejected
 * 4. NOT_FOUND requires complete raw query set
 * 5. Discovered candidate prevents NOT_FOUND
 * 6. Valid verified OEM import allowed
 * 7. Valid verified aftermarket import allowed
 * 8. NOT_FOUND + valid ASIN rejected by importer
 * 9. DISCOVERED_UNVERIFIED + valid ASIN rejected
 * 10. AMBIGUOUS + valid ASIN rejected
 * 11. evidence_sources:[{}] rejected
 * 12. Missing verification_status rejected
 * 13. Missing verification_method rejected
 * 14. Missing verified_at rejected
 * 15. Missing structured proof rejected
 * 16. marketplace_verified=false rejected
 * 17. Provider rejects non-verified classification override
 * 18. 0000 400 7000 + B001RMA5S2 rejected (identity mismatch)
 * 19. Stens 605-205 remains unverified without NL marketplace proof
 * 20. Catalog and affiliate freeze invariants intact
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  AmazonExactMatchVerifier,
  MATCH_CLASSIFICATIONS,
  VERIFICATION_METHODS,
  PRODUCT_TYPES
} from '../src/affiliate/AmazonExactMatchVerifier.js';
import {
  AmazonAffiliateProvider,
  isValidManualAsinOverride
} from '../src/affiliate/AmazonAffiliateProvider.js';
import {
  PRODUCTION_VERIFIED_CLASSIFICATIONS,
  NON_PRODUCTION_CLASSIFICATIONS,
  isValidEvidenceSource,
  isValidStructuredProof,
  isKnownPartNumberMismatch,
  isProductionVerifiedClassification,
  isProductionVerifiedAmazonOffer
} from '../src/affiliate/AmazonProductionOfferContract.js';
import { importVerifiedOffers } from '../scripts/import_verified_amazon_offers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'output', 'phase57a2');

test('Phase 57A.2 - Test 1: Builder cannot create search results without raw evidence', () => {
  const rawPath = path.join(outDir, 'RAW_DISCOVERY_EVIDENCE.json');
  assert.ok(fs.existsSync(rawPath), 'RAW_DISCOVERY_EVIDENCE.json must exist');
  const rawDoc = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

  const ledgerPath = path.join(outDir, 'DERIVED_DISCOVERY_LEDGER.json');
  assert.ok(fs.existsSync(ledgerPath), 'DERIVED_DISCOVERY_LEDGER.json must exist');
  const ledgerDoc = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  // Every item audited in Phase 57A.2 must have raw_evidence_ids that exist in RAW_DISCOVERY_EVIDENCE.json
  const rawQueryIds = new Set(rawDoc.records.map(r => r.query_id));
  const auditedItems = ledgerDoc.items.filter(i => i.audited_in_phase === 'PHASE_57A.2');
  assert.strictEqual(auditedItems.length, 10, 'Must have 10 audited items in cohort');

  for (const item of auditedItems) {
    assert.ok(Array.isArray(item.raw_evidence_ids), `Item ${item.part_number} must have raw_evidence_ids array`);
    assert.ok(item.raw_evidence_ids.length > 0, `Item ${item.part_number} must have >= 1 raw evidence ID`);
    for (const qid of item.raw_evidence_ids) {
      assert.ok(rawQueryIds.has(qid), `Raw evidence ID ${qid} must exist in authoritative RAW_DISCOVERY_EVIDENCE.json`);
    }
  }
});

test('Phase 57A.2 - Test 2: Unaudited item stays UNAUDITED', () => {
  const ledgerPath = path.join(outDir, 'DERIVED_DISCOVERY_LEDGER.json');
  const ledgerDoc = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  const unauditedItems = ledgerDoc.items.filter(i => i.classification === 'UNAUDITED' || i.classification === 'UNAUDITED_LEGACY_PHASE57A1');
  assert.strictEqual(unauditedItems.length, 90, 'Must have 90 unaudited queue items (21 legacy + 69 standard)');

  for (const item of unauditedItems) {
    assert.strictEqual(item.raw_evidence_ids.length, 0, 'Unaudited items must have 0 raw evidence IDs');
    assert.strictEqual(item.amazon_nl_listing_verified, false, 'Unaudited item cannot be verified');
    assert.strictEqual(item.affiliate_action, 'SEARCH_FALLBACK_ONLY', 'Unaudited item must use search fallback');
  }
});

test('Phase 57A.2 - Test 3: Fake/generated timestamp evidence rejected', () => {
  assert.strictEqual(isValidEvidenceSource({
    type: 'WEB',
    url: 'https://example.com',
    title: 'Example',
    claim: 'Claim',
    retrieved_at: 'not-a-timestamp'
  }), false, 'Malformed timestamp in evidence source must be rejected');

  assert.strictEqual(isValidEvidenceSource({
    type: 'WEB',
    url: 'https://example.com',
    title: 'Example',
    claim: 'Claim',
    retrieved_at: null
  }), false, 'Null timestamp in evidence source must be rejected');
});

test('Phase 57A.2 - Test 4: NOT_FOUND requires complete raw query set', () => {
  // Verifier contract: NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH requires queries_run and sources_checked
  const res = AmazonExactMatchVerifier.validateCandidate({
    part_number: '11411201600',
    classification: MATCH_CLASSIFICATIONS.NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH,
    queries_run: [], // empty query set
    sources_checked: []
  });
  assert.strictEqual(res.valid, false, 'Empty queries_run must be rejected for NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH');
  assert.ok(res.errors.some(e => e.includes('queries_run audit')), 'Must cite missing queries_run audit');
});

test('Phase 57A.2 - Test 5: Discovered candidate prevents NOT_FOUND', () => {
  const res = AmazonExactMatchVerifier.validateCandidate({
    part_number: '11411201600',
    classification: MATCH_CLASSIFICATIONS.NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH,
    candidate_asin: 'B01LXML5G0',
    queries_run: ['Q1', 'Q2'],
    sources_checked: ['Source1']
  });
  assert.strictEqual(res.valid, false, 'Candidate ASIN must prevent NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH');
  assert.ok(res.errors.some(e => e.includes('forbidden when candidate products, ASINs, or sources are found')));
});

test('Phase 57A.2 - Test 6: Valid verified OEM import allowed', () => {
  const validOem = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    marketplace: 'amazon.nl',
    classification: 'VERIFIED_OEM_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true
    },
    evidence_sources: [{
      type: 'OFFICIAL_CATALOG',
      url: 'https://example.com/stihl/11411201600',
      title: 'Official Reference',
      claim: 'STIHL 1141 120 1600 OEM Air Filter',
      retrieved_at: '2026-10-28T20:25:00.000Z'
    }]
  };

  const tempFile = path.join(outDir, 'temp_test_oem.json');
  fs.writeFileSync(tempFile, JSON.stringify([validOem], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 1, 'Valid OEM record must be accepted in dry-run');
  assert.strictEqual(result.rejected.length, 0, 'Valid OEM record must not be rejected');
});

test('Phase 57A.2 - Test 7: Valid verified aftermarket import allowed', () => {
  const validAftermarket = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    marketplace: 'amazon.nl',
    classification: 'VERIFIED_AFTERMARKET_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    brand: 'Stens',
    manufacturer_part_number: '605-205',
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true,
      replacement_reference_verified: true
    },
    evidence_sources: [{
      type: 'MANUFACTURER_CROSS_REF',
      url: 'https://example.com/stens/605-205',
      title: 'Stens 605-205',
      claim: 'Replaces STIHL 1141 120 1600',
      retrieved_at: '2026-10-28T20:25:00.000Z'
    }]
  };

  const tempFile = path.join(outDir, 'temp_test_aftermarket.json');
  fs.writeFileSync(tempFile, JSON.stringify([validAftermarket], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 1, 'Valid aftermarket record must be accepted in dry-run');
  assert.strictEqual(result.rejected.length, 0, 'Valid aftermarket record must not be rejected');
});

test('Phase 57A.2 - Test 8: NOT_FOUND + valid ASIN rejected by importer', () => {
  const invalid = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'NOT_FOUND',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true },
    evidence_sources: [{ type: 'REF', url: 'https://example.com', title: 'T', claim: 'C', retrieved_at: '2026-10-28T20:25:00.000Z' }]
  };

  const tempFile = path.join(outDir, 'temp_test_not_found.json');
  fs.writeFileSync(tempFile, JSON.stringify([invalid], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0, 'NOT_FOUND must never be accepted');
  assert.strictEqual(result.rejected.length, 1, 'NOT_FOUND must be rejected');
  assert.ok(result.rejected[0].reason.includes('not permitted for production import'));
});

test('Phase 57A.2 - Test 9: DISCOVERED_UNVERIFIED + valid ASIN rejected', () => {
  const unverified = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'DISCOVERED_UNVERIFIED',
    brand: 'Stens',
    evidence_sources: []
  };

  const tempFile = path.join(outDir, 'temp_test_discovered.json');
  fs.writeFileSync(tempFile, JSON.stringify([unverified], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0, 'DISCOVERED_UNVERIFIED must not be imported');
  assert.strictEqual(result.rejected.length, 1, 'DISCOVERED_UNVERIFIED must be rejected');
});

test('Phase 57A.2 - Test 10: AMBIGUOUS + valid ASIN rejected', () => {
  const ambiguous = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'AMBIGUOUS'
  };

  const tempFile = path.join(outDir, 'temp_test_ambiguous.json');
  fs.writeFileSync(tempFile, JSON.stringify([ambiguous], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0, 'AMBIGUOUS must not be imported');
  assert.strictEqual(result.rejected.length, 1, 'AMBIGUOUS must be rejected');
});

test('Phase 57A.2 - Test 11: evidence_sources:[{}] rejected', () => {
  const emptyObjEvidence = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'VERIFIED_AFTERMARKET_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true },
    evidence_sources: [{}]
  };

  const tempFile = path.join(outDir, 'temp_test_empty_evidence.json');
  fs.writeFileSync(tempFile, JSON.stringify([emptyObjEvidence], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0, 'evidence_sources:[{}] must be rejected');
  assert.strictEqual(result.rejected.length, 1, 'Must be rejected');
  assert.ok(result.rejected[0].reason.includes('empty or invalid evidence source objects'));
});

test('Phase 57A.2 - Test 12: Missing verification_status rejected', () => {
  const missingStatus = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'VERIFIED_OEM_EXACT',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true },
    evidence_sources: [{ type: 'REF', url: 'https://example.com', title: 'T', claim: 'C', retrieved_at: '2026-10-28T20:25:00.000Z' }]
  };

  const tempFile = path.join(outDir, 'temp_test_missing_status.json');
  fs.writeFileSync(tempFile, JSON.stringify([missingStatus], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('Missing explicit verification_status'));
});

test('Phase 57A.2 - Test 13: Missing verification_method rejected', () => {
  const missingMethod = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'VERIFIED_OEM_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verified_at: '2026-10-28T20:25:00.000Z',
    proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true },
    evidence_sources: [{ type: 'REF', url: 'https://example.com', title: 'T', claim: 'C', retrieved_at: '2026-10-28T20:25:00.000Z' }]
  };

  const tempFile = path.join(outDir, 'temp_test_missing_method.json');
  fs.writeFileSync(tempFile, JSON.stringify([missingMethod], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('Missing explicit verification_method'));
});

test('Phase 57A.2 - Test 14: Missing verified_at rejected', () => {
  const missingTimestamp = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'VERIFIED_OEM_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true },
    evidence_sources: [{ type: 'REF', url: 'https://example.com', title: 'T', claim: 'C', retrieved_at: '2026-10-28T20:25:00.000Z' }]
  };

  const tempFile = path.join(outDir, 'temp_test_missing_ts.json');
  fs.writeFileSync(tempFile, JSON.stringify([missingTimestamp], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('Missing explicit verified_at'));
});

test('Phase 57A.2 - Test 15: Missing structured proof rejected', () => {
  const missingProof = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'VERIFIED_OEM_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    proof: null,
    evidence_sources: [{ type: 'REF', url: 'https://example.com', title: 'T', claim: 'C', retrieved_at: '2026-10-28T20:25:00.000Z' }]
  };

  const tempFile = path.join(outDir, 'temp_test_missing_proof.json');
  fs.writeFileSync(tempFile, JSON.stringify([missingProof], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('Structured proof object is required'));
});

test('Phase 57A.2 - Test 16: marketplace_verified=false rejected', () => {
  const unverifiedMarketplace = {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    classification: 'VERIFIED_OEM_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: false },
    evidence_sources: [{ type: 'REF', url: 'https://example.com', title: 'T', claim: 'C', retrieved_at: '2026-10-28T20:25:00.000Z' }]
  };

  const tempFile = path.join(outDir, 'temp_test_market_false.json');
  fs.writeFileSync(tempFile, JSON.stringify([unverifiedMarketplace], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('proof.marketplace_verified must be true'));
});

test('Phase 57A.2 - Test 17: Provider rejects non-verified classification override', () => {
  assert.strictEqual(isValidManualAsinOverride({
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    enabled: true,
    classification: 'NOT_FOUND',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verified_at: '2026-10-28T20:25:00.000Z'
  }), false, 'Provider must reject override with classification NOT_FOUND');

  assert.strictEqual(isValidManualAsinOverride({
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    enabled: true,
    classification: 'DISCOVERED_UNVERIFIED',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verified_at: '2026-10-28T20:25:00.000Z'
  }), false, 'Provider must reject override with classification DISCOVERED_UNVERIFIED');
});

test('Phase 57A.2 - Test 18: 0000 400 7000 + B001RMA5S2 rejected', () => {
  const mismatchItem = {
    part_number: '00004007000',
    asin: 'B001RMA5S2',
    classification: 'VERIFIED_AFTERMARKET_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: '2026-10-28T20:25:00.000Z',
    product: 'NGK CMR6H',
    proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true },
    evidence_sources: [{ type: 'REF', url: 'https://example.com', title: 'T', claim: 'C', retrieved_at: '2026-10-28T20:25:00.000Z' }]
  };

  const tempFile = path.join(outDir, 'temp_test_mismatch.json');
  fs.writeFileSync(tempFile, JSON.stringify([mismatchItem], null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.accepted.length, 0, 'Known mismatch must never be accepted');
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('PART_NUMBER_PRODUCT_IDENTITY_MISMATCH'));
});

test('Phase 57A.2 - Test 19: Stens 605-205 remains unverified without NL marketplace proof', () => {
  const ledgerPath = path.join(outDir, 'DERIVED_DISCOVERY_LEDGER.json');
  const ledgerDoc = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

  const item1600 = ledgerDoc.items.find(i => i.part_number === '11411201600');
  assert.ok(item1600, 'Part 1141 120 1600 must exist in ledger');
  assert.strictEqual(item1600.classification, MATCH_CLASSIFICATIONS.DISCOVERED_UNVERIFIED);
  assert.strictEqual(item1600.candidate_product, 'Stens 605-205 Air Filter');
  assert.strictEqual(item1600.amazon_nl_listing_verified, false);
  assert.strictEqual(item1600.affiliate_action, 'SEARCH_FALLBACK_ONLY');
});

test('Phase 57A.2 - Test 20: Catalog and affiliate freeze invariants intact', () => {
  const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
  const catalogDoc = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.strictEqual(catalogDoc.parts.length, 17082, 'Must preserve exactly 17,082 canonical parts');

  const offersPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');
  const offersDoc = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
  assert.strictEqual(offersDoc.offers.length, 0, 'Must preserve 0 production verified offers in fail-closed state');

  const prov = new AmazonAffiliateProvider({ marketplace: 'amazon.nl' });
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  const offers = prov.getOffers({ partNumber: '1141 120 1600' });
  assert.strictEqual(offers.length, 1);
  assert.strictEqual(offers[0].match_type, 'SEARCH_LINK');
  assert.strictEqual(offers[0].is_verified, false);
  assert.strictEqual(offers[0].tag, 'srihldecoder2-21');
  assert.ok(offers[0].url.includes('https://amazon.nl/s?k=STIHL'));
});
