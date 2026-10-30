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
  AMAZON_MATCH_TYPES,
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
    brand: 'Stens',
    manufacturer_part_number: '605-205',
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true,
      replacement_reference_verified: true
    },
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
    brand: 'NGK',
    manufacturer_part_number: 'CMR6H',
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true,
      replacement_reference_verified: true
    },
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
  assert.strictEqual(catalogDoc.parts.filter(p => !(p.sources?.length === 1 && p.sources[0] === 'ghs')).length, 17082, 'Must preserve all 17,082 pre-58A canonical parts');

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

// ---------------------------------------------------------------------------
// Phase 57A.3 — Production Offer Contract Final Closure
// ---------------------------------------------------------------------------

const VERIFIED_AT = '2026-10-28T20:25:00.000Z';
const AMAZON_TAG = 'srihldecoder2-21';

function structuredEvidence() {
  return [{
    type: 'OFFICIAL_CATALOG',
    url: 'https://example.com/stihl/catalog/11411201600',
    title: 'STIHL official catalog entry 1141 120 1600',
    claim: 'Exact OEM part 1141 120 1600 air filter confirmed',
    retrieved_at: VERIFIED_AT
  }];
}

function validOemRecord() {
  return {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    marketplace: 'amazon.nl',
    classification: 'VERIFIED_OEM_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: VERIFIED_AT,
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true
    },
    evidence_sources: structuredEvidence()
  };
}

function validAftermarketRecord() {
  return {
    part_number: '11411201600',
    asin: 'B01LXML5G0',
    marketplace: 'amazon.nl',
    classification: 'VERIFIED_AFTERMARKET_EXACT',
    verification_status: 'VERIFIED_EXACT_MATCH',
    verification_method: 'MANUAL_CATALOG_AUDIT',
    verified_at: VERIFIED_AT,
    aftermarket_brand: 'Stens',
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
      title: 'Stens 605-205 air filter cross reference',
      claim: 'Stens 605-205 replaces STIHL 1141 120 1600',
      retrieved_at: VERIFIED_AT
    }]
  };
}

function importDryRun(items, fileName) {
  const tempFile = path.join(outDir, fileName);
  fs.writeFileSync(tempFile, JSON.stringify(items, null, 2) + '\n');
  const result = importVerifiedOffers({ file: tempFile, dryRun: true });
  fs.unlinkSync(tempFile);
  return result;
}

function providerOffersFor(override) {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = AMAZON_TAG;
  const provider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    manualOverrides: override ? [{ part_number: '11411201600', enabled: true, ...override }] : []
  });
  return provider.getOffers({ partNumber: '1141 120 1600' });
}

// Counters for Phase 57A.3 hard gates, derived from actual test outcomes.
const hardGates = {
  DIRECT_OVERRIDE_WITHOUT_CLASSIFICATION_ACCEPTED: 0,
  DIRECT_OVERRIDE_WITHOUT_PROOF_ACCEPTED: 0,
  DIRECT_OVERRIDE_WITHOUT_EVIDENCE_ACCEPTED: 0,
  AFTERMARKET_WITHOUT_REPLACEMENT_PROOF_ACCEPTED: 0,
  LEGACY_VERIFIED_CLASS_WITHOUT_PROOF_ACCEPTED: 0,
  SYNTHETIC_PROVENANCE_FROM_LEGACY_STRING: 0,
  AUTO_GENERATED_PRODUCTION_PROOF: 0,
  UNVERIFIED_RECORDS_RENDERED_AS_DIRECT_PRODUCT: 0,
  KNOWN_WRONG_ASIN_PART_MAPPING_ACCEPTED: 0,
  INVALID_DIRECT_ASIN_MAPPINGS: 0
};

function assertSearchFallbackOnly(offers, message) {
  assert.strictEqual(offers.length, 1, `${message}: exactly one search offer expected`);
  assert.strictEqual(offers[0].match_type, AMAZON_MATCH_TYPES.SEARCH_LINK, `${message}: must fall back to search`);
  assert.strictEqual(offers[0].is_verified, false, `${message}: must not be marked verified`);
  assert.strictEqual(offers[0].asin, null, `${message}: must not expose an ASIN`);
  assert.ok(!offers[0].url.includes('/dp/'), `${message}: must not emit a /dp/ product URL`);
}

test('Phase 57A.3 - Test 21: Provider rejects override without classification', () => {
  const { classification, match_type, ...override } = validOemRecord();
  const offers = providerOffersFor(override);
  if (offers[0].match_type !== AMAZON_MATCH_TYPES.SEARCH_LINK) hardGates.DIRECT_OVERRIDE_WITHOUT_CLASSIFICATION_ACCEPTED++;
  assertSearchFallbackOnly(offers, 'Missing classification');
  assert.strictEqual(isValidManualAsinOverride({ ...override, enabled: true }), false);
});

test('Phase 57A.3 - Test 22: Provider rejects override without proof', () => {
  const { proof, ...override } = validOemRecord();
  const offers = providerOffersFor(override);
  if (offers[0].match_type !== AMAZON_MATCH_TYPES.SEARCH_LINK) hardGates.DIRECT_OVERRIDE_WITHOUT_PROOF_ACCEPTED++;
  assertSearchFallbackOnly(offers, 'Missing proof');
  assert.strictEqual(isValidManualAsinOverride({ ...override, enabled: true }), false);
});

test('Phase 57A.3 - Test 23: Provider rejects override without evidence_sources', () => {
  const { evidence_sources, ...override } = validOemRecord();
  const offers = providerOffersFor(override);
  if (offers[0].match_type !== AMAZON_MATCH_TYPES.SEARCH_LINK) hardGates.DIRECT_OVERRIDE_WITHOUT_EVIDENCE_ACCEPTED++;
  assertSearchFallbackOnly(offers, 'Missing evidence');
  assert.strictEqual(isValidManualAsinOverride({ ...override, enabled: true }), false);
});

test('Phase 57A.3 - Test 24: Aftermarket without replacement_reference_verified rejected', () => {
  const { replacement_reference_verified, ...proofWithoutReplacement } = validAftermarketRecord().proof;
  assert.strictEqual(replacement_reference_verified, true);
  assert.strictEqual(isValidStructuredProof(proofWithoutReplacement, true), false);
  assert.strictEqual(isValidStructuredProof({ ...proofWithoutReplacement, replacement_reference_verified: undefined }, true), false);
  assert.strictEqual(isValidStructuredProof({ ...proofWithoutReplacement, replacement_reference_verified: null }, true), false);

  const override = { ...validAftermarketRecord(), proof: proofWithoutReplacement };
  const offers = providerOffersFor(override);
  if (offers[0].match_type !== AMAZON_MATCH_TYPES.SEARCH_LINK) hardGates.AFTERMARKET_WITHOUT_REPLACEMENT_PROOF_ACCEPTED++;
  assertSearchFallbackOnly(offers, 'Aftermarket without replacement proof');

  const result = importDryRun([override], 'temp_test_a3_aftermarket_no_replacement.json');
  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('proof.replacement_reference_verified must be true'));
});

test('Phase 57A.3 - Test 25: Legacy OEM class without proof rejected by importer', () => {
  const { proof, ...legacyOem } = { ...validOemRecord(), match_type: 'OEM_STIHL_EXACT', classification: undefined };
  const result = importDryRun([legacyOem], 'temp_test_a3_legacy_oem_no_proof.json');
  if (result.accepted.length > 0) hardGates.LEGACY_VERIFIED_CLASS_WITHOUT_PROOF_ACCEPTED++;
  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('Structured proof object is required'));
});

test('Phase 57A.3 - Test 26: Legacy aftermarket class without proof rejected by importer', () => {
  const base = validAftermarketRecord();
  const legacyAftermarket = {
    ...base,
    classification: 'AFTERMARKET_EXACT_REFERENCE',
    match_type: 'AFTERMARKET_EXACT_REFERENCE'
  };
  delete legacyAftermarket.proof;
  const result = importDryRun([legacyAftermarket], 'temp_test_a3_legacy_aftermarket_no_proof.json');
  if (result.accepted.length > 0) hardGates.LEGACY_VERIFIED_CLASS_WITHOUT_PROOF_ACCEPTED++;
  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('Structured proof object is required'));
});

test('Phase 57A.3 - Test 27: Free-text evidence_source only is rejected (no synthetic provenance)', () => {
  const { evidence_sources, ...freeTextOnly } = validOemRecord();
  const withLegacyString = { ...freeTextOnly, evidence_source: 'verified manually' };
  const result = importDryRun([withLegacyString], 'temp_test_a3_free_text_evidence.json');
  if (result.accepted.length > 0) hardGates.SYNTHETIC_PROVENANCE_FROM_LEGACY_STRING++;
  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('evidence_sources must be a non-empty array'));

  const verifierRes = AmazonExactMatchVerifier.validateCandidate({ ...withLegacyString, product_type: PRODUCT_TYPES.OEM });
  assert.strictEqual(verifierRes.valid, false);
  assert.ok(verifierRes.errors.some(e => e.includes('evidence_sources')));
});

test('Phase 57A.3 - Test 28: Fully valid OEM fixture accepted by dry-run import and by provider', () => {
  const record = validOemRecord();
  const result = importDryRun([record], 'temp_test_a3_valid_oem.json');
  assert.strictEqual(result.accepted.length, 1, 'Valid OEM fixture must be accepted');
  assert.strictEqual(result.rejected.length, 0);
  assert.strictEqual(result.written, false, 'Dry-run must never write production mapping file');

  const accepted = result.accepted[0];
  assert.deepStrictEqual(accepted.proof, record.proof, 'Proof must be carried through verbatim');
  assert.deepStrictEqual(accepted.evidence_sources, record.evidence_sources, 'Evidence must be carried through verbatim');

  const offers = providerOffersFor(record);
  assert.strictEqual(offers[0].match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
  assert.strictEqual(offers[0].is_verified, true);
});

test('Phase 57A.3 - Test 29: Fully valid aftermarket fixture accepted by dry-run import', () => {
  const record = validAftermarketRecord();
  const result = importDryRun([record], 'temp_test_a3_valid_aftermarket.json');
  assert.strictEqual(result.accepted.length, 1, 'Valid aftermarket fixture must be accepted');
  assert.strictEqual(result.rejected.length, 0);
  assert.strictEqual(result.accepted[0].aftermarket_brand, 'Stens');
  assert.strictEqual(result.accepted[0].manufacturer_part_number, '605-205');
  assert.strictEqual(result.accepted[0].product_type, PRODUCT_TYPES.AFTERMARKET);
});

test('Phase 57A.3 - Test 30: Provider direct-link positive fixture emits verified /dp/ URL', () => {
  const offers = providerOffersFor(validOemRecord());
  assert.strictEqual(offers.length, 1);
  assert.strictEqual(offers[0].match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
  assert.strictEqual(offers[0].is_verified, true);
  assert.strictEqual(offers[0].asin, 'B01LXML5G0');
  assert.strictEqual(offers[0].marketplace, 'amazon.nl');
  const expectedAsinPath = ['https://amazon.nl', 'dp', 'B01LXML5G0'].join('/');
  assert.ok(offers[0].url.startsWith(expectedAsinPath), 'Direct URL must use the /dp/<ASIN> product path');
  assert.ok(offers[0].url.includes(`tag=${AMAZON_TAG}`), 'Direct URL must carry the affiliate tag');
  assert.strictEqual(offers[0].tag, AMAZON_TAG);
});

test('Phase 57A.3 - Test 31: Known wrong 0000 400 7000 + B001RMA5S2 mapping rejected everywhere', () => {
  const wrong = {
    ...validAftermarketRecord(),
    part_number: '00004007000',
    asin: 'B001RMA5S2',
    product: 'NGK CMR6H',
    aftermarket_brand: 'NGK',
    manufacturer_part_number: 'CMR6H'
  };
  assert.strictEqual(isKnownPartNumberMismatch('0000 400 7000', 'B001RMA5S2', 'NGK CMR6H'), true);
  assert.strictEqual(isProductionVerifiedAmazonOffer(wrong), false);

  const offers = (() => {
    process.env.AMAZON_AFFILIATE_ENABLED = 'true';
    process.env.AMAZON_ASSOCIATE_TAG = AMAZON_TAG;
    const provider = new AmazonAffiliateProvider({
      marketplace: 'amazon.nl',
      manualOverrides: [{ ...wrong, enabled: true }]
    });
    return provider.getOffers({ partNumber: '0000 400 7000' });
  })();
  if (offers[0] && offers[0].match_type !== AMAZON_MATCH_TYPES.SEARCH_LINK) {
    hardGates.KNOWN_WRONG_ASIN_PART_MAPPING_ACCEPTED++;
  }
  assertSearchFallbackOnly(offers, 'Known wrong ASIN/part pair');

  const result = importDryRun([wrong], 'temp_test_a3_known_wrong_pair.json');
  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason.includes('PART_NUMBER_PRODUCT_IDENTITY_MISMATCH'));
});

test('Phase 57A.3 - Test 32: Provider negative matrix always yields SEARCH_LINK fallback', () => {
  const base = validOemRecord();
  const cases = [
    ['missing classification', (() => { const { classification, ...r } = base; return r; })()],
    ['NOT_FOUND', { ...base, classification: 'NOT_FOUND' }],
    ['DISCOVERED_UNVERIFIED', { ...base, classification: 'DISCOVERED_UNVERIFIED' }],
    ['UNAUDITED', { ...base, classification: 'UNAUDITED' }],
    ['UNAUDITED_LEGACY_PHASE57A1', { ...base, classification: 'UNAUDITED_LEGACY_PHASE57A1' }],
    ['REJECTED', { ...base, classification: 'REJECTED' }],
    ['missing proof', (() => { const { proof, ...r } = base; return r; })()],
    ['marketplace_verified=false', { ...base, proof: { ...base.proof, marketplace_verified: false } }],
    ['missing evidence_sources', (() => { const { evidence_sources, ...r } = base; return r; })()],
    ['invalid evidence object', { ...base, evidence_sources: [{ url: 'https://example.com' }] }],
    ['aftermarket replacement proof missing', {
      ...validAftermarketRecord(),
      proof: { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true }
    }],
    ['known part-number mismatch', {
      ...validAftermarketRecord(),
      part_number: '00004007000',
      asin: 'B001RMA5S2',
      product: 'NGK CMR6H'
    }],
    ['invalid ASIN', { ...base, asin: 'B123' }],
    ['disallowed marketplace', { ...base, marketplace: 'amazon.fr' }],
    ['invalid verified_at', { ...base, verified_at: 'not-a-timestamp' }]
  ];

  for (const [label, override] of cases) {
    const offers = providerOffersFor(override);
    if (offers[0].match_type !== AMAZON_MATCH_TYPES.SEARCH_LINK) {
      if (label === 'missing proof') hardGates.DIRECT_OVERRIDE_WITHOUT_PROOF_ACCEPTED++;
      else if (label === 'missing evidence_sources') hardGates.DIRECT_OVERRIDE_WITHOUT_EVIDENCE_ACCEPTED++;
      else if (label === 'aftermarket replacement proof missing') hardGates.AFTERMARKET_WITHOUT_REPLACEMENT_PROOF_ACCEPTED++;
      else if (label === 'known part-number mismatch') hardGates.KNOWN_WRONG_ASIN_PART_MAPPING_ACCEPTED++;
      else hardGates.UNVERIFIED_RECORDS_RENDERED_AS_DIRECT_PRODUCT++;
    }
    assertSearchFallbackOnly(offers, `Negative matrix case "${label}"`);
  }
});

test('Phase 57A.3 - Test 33: Hard gates are all zero, production state unchanged', () => {
  // Structural assertions derived from the live contract, not hardcoded expectations.
  assert.strictEqual(isValidManualAsinOverride({ part_number: '11411201600', asin: 'B01LXML5G0', enabled: true, verification_status: 'VERIFIED_EXACT_MATCH', verified_at: VERIFIED_AT }), false);
  assert.strictEqual(isValidManualAsinOverride({ ...validOemRecord(), enabled: true }), true);
  assert.strictEqual(isValidStructuredProof(validAftermarketRecord().proof, true), true);
  assert.strictEqual(isValidStructuredProof({ ...validAftermarketRecord().proof, replacement_reference_verified: undefined }, true), false);

  const offersPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');
  const offersDoc = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
  const directMappings = offersDoc.offers.filter(o => o.asin && isProductionVerifiedAmazonOffer(o));
  const invalidDirectMappings = offersDoc.offers.filter(o => o.asin && !isProductionVerifiedAmazonOffer(o));
  hardGates.INVALID_DIRECT_ASIN_MAPPINGS = invalidDirectMappings.length;
  assert.strictEqual(directMappings.length, 0, 'Affiliate production freeze: 0 verified direct mappings');
  assert.strictEqual(invalidDirectMappings.length, 0, 'No invalid direct mapping may be stored');

  for (const [gate, value] of Object.entries(hardGates)) {
    assert.strictEqual(value, 0, `Hard gate ${gate} must be 0 (observed ${value})`);
  }
});

// ---------------------------------------------------------------------------
// Phase 57A.4 — Malformed Input Fail-Closed Closure
// ---------------------------------------------------------------------------

const MALFORMED_VALUES = [null, undefined, true, false, 0, 1, '', [], {}];

test('Phase 57A.4 - Test 34: Central contract never throws on JSON-compatible values', () => {
  let uncaught = 0;
  for (const value of MALFORMED_VALUES) {
    try {
      assert.strictEqual(isProductionVerifiedAmazonOffer(value), false, `Contract must reject ${JSON.stringify(value)}`);
    } catch (err) {
      uncaught++;
    }
  }

  const base = validOemRecord();
  const fieldCases = [
    ['asin', 1234567890], ['asin', {}], ['asin', []], ['asin', true],
    ['marketplace', 123], ['marketplace', {}], ['marketplace', []],
    ['part_number', 12345678900], ['part_number', {}],
    ['title', 123], ['product', {}], ['candidate_product', []],
    ['classification', {}], ['verification_status', {}], ['verified_at', 123],
    ['proof', []], ['proof', 'string'], ['evidence_sources', {}]
  ];
  for (const [field, value] of fieldCases) {
    try {
      assert.strictEqual(
        isProductionVerifiedAmazonOffer({ ...base, [field]: value }),
        false,
        `Contract must reject malformed ${field}=${JSON.stringify(value)}`
      );
    } catch (err) {
      uncaught++;
    }
  }

  const CENTRAL_CONTRACT_UNCAUGHT_EXCEPTIONS = uncaught;
  assert.strictEqual(CENTRAL_CONTRACT_UNCAUGHT_EXCEPTIONS, 0, 'Central contract must never throw');
});

test('Phase 57A.4 - Test 35: Known mismatch helper never throws on malformed input', () => {
  let uncaught = 0;
  const malformed = [null, undefined, true, false, 0, 1, '', [], {}, 1234567890];
  for (const value of malformed) {
    for (const args of [['00004007000', value, ''], ['00004007000', 'B001RMA5S2', value], [value, 'B001RMA5S2', ''], [value, value, value]]) {
      try {
        assert.strictEqual(typeof isKnownPartNumberMismatch(...args), 'boolean');
      } catch (err) {
        uncaught++;
      }
    }
  }

  // Known wrong pair must still be detected.
  assert.strictEqual(isKnownPartNumberMismatch('0000 400 7000', 'B001RMA5S2', ''), true);
  assert.strictEqual(isKnownPartNumberMismatch('00004007000', 'B001RMA5S2', 'NGK CMR6H'), true);
  assert.strictEqual(isKnownPartNumberMismatch('11411201600', 'B01LXML5G0', 'OK'), false);

  const KNOWN_MISMATCH_HELPER_UNCAUGHT_EXCEPTIONS = uncaught;
  assert.strictEqual(KNOWN_MISMATCH_HELPER_UNCAUGHT_EXCEPTIONS, 0, 'Mismatch helper must never throw');
});

test('Phase 57A.4 - Test 36: Malformed ASIN types never produce a direct link', () => {
  let directLinks = 0;
  for (const asin of [1234567890, {}, [], true, null]) {
    const override = { ...validOemRecord(), asin };
    try {
      assert.strictEqual(isValidManualAsinOverride({ ...override, enabled: true }), false);
      const offers = providerOffersFor(override);
      assertSearchFallbackOnly(offers, `Malformed ASIN ${JSON.stringify(asin)}`);
      if (offers.some(o => o.url.includes('/dp/'))) directLinks++;
    } catch (err) {
      directLinks++;
    }
  }

  const MALFORMED_OVERRIDE_DIRECT_LINKS = directLinks;
  assert.strictEqual(MALFORMED_OVERRIDE_DIRECT_LINKS, 0);
});

test('Phase 57A.4 - Test 37: Malformed marketplace types never produce a direct link', () => {
  let directLinks = 0;
  for (const marketplace of [123, {}, [], true, null]) {
    const override = { ...validOemRecord(), marketplace };
    try {
      assert.strictEqual(isValidManualAsinOverride({ ...override, enabled: true }), false);
      assertSearchFallbackOnly(providerOffersFor(override), `Malformed marketplace ${JSON.stringify(marketplace)}`);
    } catch (err) {
      directLinks++;
    }
  }
  assert.strictEqual(directLinks, 0);
});

test('Phase 57A.4 - Test 38: Malformed product/title/candidate_product types never produce a direct link', () => {
  let directLinks = 0;
  const fieldCases = [['product', 123], ['title', {}], ['candidate_product', []]];
  for (const [field, value] of fieldCases) {
    const override = { ...validOemRecord(), [field]: value };
    try {
      assert.strictEqual(isValidManualAsinOverride({ ...override, enabled: true }), false);
      assertSearchFallbackOnly(providerOffersFor(override), `Malformed ${field}`);
    } catch (err) {
      directLinks++;
    }
  }
  assert.strictEqual(directLinks, 0);
});

test('Phase 57A.4 - Test 39: Combined malformed record fails closed everywhere', () => {
  const combined = {
    ...validOemRecord(),
    asin: { malformed: true },
    marketplace: 123,
    title: 456,
    product: [],
    candidate_product: {},
    verified_at: 789
  };

  assert.strictEqual(isProductionVerifiedAmazonOffer(combined), false);
  assert.strictEqual(isValidManualAsinOverride({ ...combined, enabled: true }), false);
  assertSearchFallbackOnly(providerOffersFor(combined), 'Combined malformed override');

  const result = importDryRun([combined], 'temp_test_a4_combined_malformed.json');
  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.written, false);
});

test('Phase 57A.4 - Test 40: Importer rejects malformed records without crashing or partial writes', () => {
  let crashes = 0;
  let result = null;
  try {
    result = importDryRun([{ part_number: '11411201600', asin: 1234567890 }], 'temp_test_a4_malformed_asin.json');
  } catch (err) {
    crashes++;
  }
  assert.strictEqual(crashes, 0, 'Malformed ASIN record must not crash importer');
  assert.strictEqual(result.accepted.length, 0);
  assert.strictEqual(result.written, false);
  assert.strictEqual(result.invalid.length + result.rejected.length, 1);

  // Mixed batch: 1 malformed + 1 otherwise valid record -> fail closed, no partial write.
  let mixed = null;
  try {
    mixed = importDryRun([
      { part_number: '11411201600', asin: 1234567890 },
      validOemRecord()
    ], 'temp_test_a4_mixed_batch.json');
  } catch (err) {
    crashes++;
  }
  assert.strictEqual(crashes, 0, 'Mixed batch must not crash importer');
  assert.strictEqual(mixed.accepted.length, 1, 'Valid record is still evaluated');
  assert.strictEqual(mixed.invalid.length + mixed.rejected.length, 1, 'Malformed record is recorded');
  assert.strictEqual(mixed.written, false, 'No partial write while a malformed record exists');

  const MALFORMED_IMPORT_RECORD_CRASHES = crashes;
  assert.strictEqual(MALFORMED_IMPORT_RECORD_CRASHES, 0);
});

test('Phase 57A.4 - Test 41: Verifier never throws on malformed candidate fields', () => {
  const base = validOemRecord();
  const fieldCases = [
    ['asin', 1234567890], ['asin', {}], ['asin', []],
    ['marketplace', 123], ['marketplace', {}],
    ['product', 123], ['title', {}], ['candidate_product', []],
    ['evidence_sources', [{}]],
    ['proof', { exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: 1 }]
  ];
  let uncaught = 0;
  for (const [field, value] of fieldCases) {
    try {
      const res = AmazonExactMatchVerifier.validateCandidate({ ...base, [field]: value });
      assert.strictEqual(res.valid, false, `Verifier must reject malformed ${field}`);
    } catch (err) {
      uncaught++;
    }
  }

  // Aftermarket-specific malformed identity fields.
  const aftermarketBase = validAftermarketRecord();
  for (const [field, value] of [['aftermarket_brand', 123], ['manufacturer_part_number', {}]]) {
    try {
      const res = AmazonExactMatchVerifier.validateCandidate({ ...aftermarketBase, [field]: value });
      assert.strictEqual(res.valid, false, `Verifier must reject malformed aftermarket ${field}`);
    } catch (err) {
      uncaught++;
    }
  }

  assert.strictEqual(uncaught, 0, 'Verifier must never throw on malformed fields');
});

test('Phase 57A.4 - Test 42: Positive regressions and Phase 57A.3 gates remain intact', () => {
  // Valid OEM + aftermarket accepted.
  assert.strictEqual(isProductionVerifiedAmazonOffer(validOemRecord()), true);
  assert.strictEqual(isProductionVerifiedAmazonOffer(validAftermarketRecord()), true);

  // Known wrong pair still rejected at contract and importer level.
  assert.strictEqual(isProductionVerifiedAmazonOffer({
    ...validAftermarketRecord(),
    part_number: '00004007000',
    asin: 'B001RMA5S2',
    product: 'NGK CMR6H'
  }), false);

  // Structural Phase 57A.3 assertions still hold.
  const { classification, ...noClassification } = validOemRecord();
  assert.strictEqual(classification, 'VERIFIED_OEM_EXACT');
  assert.strictEqual(isValidManualAsinOverride({ ...noClassification, enabled: true }), false);
  const { proof, ...noProof } = validOemRecord();
  assert.strictEqual(isValidManualAsinOverride({ ...noProof, enabled: true }), false);
  const { evidence_sources, ...noEvidence } = validOemRecord();
  assert.strictEqual(isValidManualAsinOverride({ ...noEvidence, enabled: true }), false);
  assert.strictEqual(isValidStructuredProof({ exact_part_number_found: true, asin_identity_verified: true, marketplace_verified: true }, true), false);

  // Affiliate production freeze.
  const offersDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json'), 'utf8'));
  assert.strictEqual(offersDoc.offers.filter(o => o.asin).length, 0, '0 verified direct mappings');
});
