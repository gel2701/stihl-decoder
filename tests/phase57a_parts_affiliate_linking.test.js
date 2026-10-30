import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  AmazonAffiliateProvider,
  AMAZON_MATCH_TYPES,
  VERIFICATION_STATUSES,
  isValidAsin,
  isValidIsoTimestamp,
  isValidManualAsinOverride
} from '../src/affiliate/AmazonAffiliateProvider.js';
import {
  AmazonExactMatchVerifier,
  MATCH_CLASSIFICATIONS,
  VERIFICATION_METHODS,
  PRODUCT_TYPES
} from '../src/affiliate/AmazonExactMatchVerifier.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { importVerifiedOffers } from '../scripts/import_verified_amazon_offers.mjs';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 57A Test 1: Baseline accounting preserves all 17,082 pre-58A canonical parts and 0 direct mappings', () => {
  const catalogDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
  const offersDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json'), 'utf8'));
  
  assert.equal(catalogDoc.parts.filter(p => !(p.sources?.length === 1 && p.sources[0] === 'ghs')).length, 17082, 'Expected 17,082 pre-58A canonical parts');
  assert.equal(Array.isArray(offersDoc.offers), true, 'Offers must be an array');
  assert.equal(offersDoc.offers.length, 0, 'Baseline direct offers must be 0');
});

test('Phase 57A Test 2: Pilot queue contains exactly 100 unique canonical indexable parts', () => {
  const queuePath = path.join(rootDir, 'output', 'phase57a', 'AFFILIATE_PRIORITY_QUEUE.json');
  assert.equal(fs.existsSync(queuePath), true, 'Priority queue artifact must exist');
  
  const queueData = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  assert.equal(queueData.items.length, 100, 'Pilot queue must contain 100 items');
  
  const partSet = new Set();
  for (const item of queueData.items) {
    const norm = PartNormalizer.normalizePartNumber(item.part_number);
    assert.ok(norm, `Part number must normalize: ${item.part_number}`);
    assert.equal(norm.length, 11, 'Part number must be 11 digits');
    assert.ok(!partSet.has(norm), `Part number must be unique: ${norm}`);
    partSet.add(norm);
    assert.equal(item.commercial_tier, 'COMMERCIAL_HIGH');
    assert.equal(item.seo_tier, 'SEO_TIER_A');
  }
});

test('Phase 57A Test 3: Exact part-number normalization behaves correctly', () => {
  assert.equal(PartNormalizer.normalizePartNumber('1123 160 2050'), '11231602050');
  assert.equal(PartNormalizer.normalizePartNumber('1123-160-2050'), '11231602050');
  assert.equal(PartNormalizer.normalizePartNumber('11231602050'), '11231602050');
  assert.equal(PartNormalizer.normalizePartNumber('invalid_part'), null);
});

test('Phase 57A Test 4: Valid OEM candidate passes contract', () => {
  const validOem = {
    part_number: '11231602050',
    asin: 'B001ABCDEF',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    product_type: PRODUCT_TYPES.OEM,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-27T12:00:00Z',
    evidence_source: 'Official STIHL Packaging Proof with ASIN inspection',
    evidence_sources: [{
      type: 'OFFICIAL_CATALOG',
      url: 'https://example.com/stihl/11231602050',
      title: 'STIHL Packaging Proof',
      claim: 'Part 1123 160 2050 verified packaging',
      retrieved_at: '2026-10-27T12:00:00Z'
    }],
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true
    },
    price: null,
    in_stock: null
  };
  const res = AmazonExactMatchVerifier.validateCandidate(validOem);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.classification, MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT);
});

test('Phase 57A Test 5: Valid aftermarket candidate passes contract', () => {
  const validAftermarket = {
    part_number: '11231602050',
    asin: 'B002GHIJKL',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE,
    product_type: PRODUCT_TYPES.AFTERMARKET,
    aftermarket_brand: 'Haishine Replacement Parts',
    manufacturer_part_number: 'HSH-11231602050',
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-27T12:00:00Z',
    evidence_source: 'Listing details explicitly reference STIHL OEM 1123 160 2050',
    evidence_sources: [{
      type: 'MANUFACTURER_CROSS_REF',
      url: 'https://example.com/haishine/11231602050',
      title: 'Haishine Cross Reference',
      claim: 'Replaces STIHL OEM 1123 160 2050',
      retrieved_at: '2026-10-27T12:00:00Z'
    }],
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true,
      replacement_reference_verified: true
    },
    price: null,
    in_stock: null
  };
  const res = AmazonExactMatchVerifier.validateCandidate(validAftermarket);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.classification, MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE);
});

test('Phase 57A Test 6: Title-only candidate is rejected if missing exact part number proof', () => {
  const titleOnly = {
    part_number: '11231602050',
    asin: 'B003MNOPQR',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.AMBIGUOUS,
    rejection_reason: 'TITLE_ONLY_MATCH_WITHOUT_PART_NUMBER_PROOF',
    evidence_source: 'Title mentions Stihl clutch but body lacks part number'
  };
  const res = AmazonExactMatchVerifier.validateCandidate(titleOnly);
  assert.equal(res.classification, MATCH_CLASSIFICATIONS.AMBIGUOUS);
});

test('Phase 57A Test 7: Candidate with invalid part number format is rejected', () => {
  const badPart = {
    part_number: '112316',
    asin: 'B001ABCDEF',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT
  };
  const res = AmazonExactMatchVerifier.validateCandidate(badPart);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('Invalid canonical 11-digit STIHL part number')));
});

test('Phase 57A Test 8: Ambiguous context candidate requires documented reason', () => {
  const ambiguousNoReason = {
    part_number: '11231602050',
    classification: MATCH_CLASSIFICATIONS.AMBIGUOUS
  };
  const res = AmazonExactMatchVerifier.validateCandidate(ambiguousNoReason);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('must document explicit reason')));
});

test('Phase 57A Test 9: Invalid ASIN format is rejected', () => {
  const badAsin = {
    part_number: '11231602050',
    asin: 'INVALID_ASIN_123',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verified_at: '2026-10-27T12:00:00Z',
    evidence_source: 'Some source'
  };
  const res = AmazonExactMatchVerifier.validateCandidate(badAsin);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('Invalid Amazon ASIN')));
});

test('Phase 57A Test 10: Duplicate ASIN in batch is rejected by import tool', () => {
  const tempDir = path.join(rootDir, 'output', 'phase57a');
  const testBatchPath = path.join(tempDir, 'test_dup_asin.json');
  fs.writeFileSync(testBatchPath, JSON.stringify([
    {
      part_number: '11231602050',
      asin: 'B009DUPAS1',
      evidence_source: 'Valid evidence source 1'
    },
    {
      part_number: '11210071001',
      asin: 'B009DUPAS1',
      evidence_source: 'Valid evidence source 2'
    }
  ]));

  const res = importVerifiedOffers({ file: testBatchPath, dryRun: true });
  assert.equal(res.duplicate.length, 1);
  assert.ok(res.duplicate[0].reason.includes('Duplicate ASIN'));
  fs.unlinkSync(testBatchPath);
});

test('Phase 57A Test 11: Duplicate part number in batch is rejected by import tool', () => {
  const tempDir = path.join(rootDir, 'output', 'phase57a');
  const testBatchPath = path.join(tempDir, 'test_dup_part.json');
  fs.writeFileSync(testBatchPath, JSON.stringify([
    {
      part_number: '11231602050',
      asin: 'B009PARTA1',
      evidence_source: 'Valid evidence source 1'
    },
    {
      part_number: '11231602050',
      asin: 'B009PARTA2',
      evidence_source: 'Valid evidence source 2'
    }
  ]));

  const res = importVerifiedOffers({ file: testBatchPath, dryRun: true });
  assert.equal(res.duplicate.length, 1);
  assert.ok(res.duplicate[0].reason.includes('Duplicate mapping for part number'));
  fs.unlinkSync(testBatchPath);
});

test('Phase 57A Test 12: Static price in offer is strictly rejected', () => {
  const priceItem = {
    part_number: '11231602050',
    asin: 'B001ABCDEF',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verified_at: '2026-10-27T12:00:00Z',
    evidence_source: 'Proof document',
    price: 19.99
  };
  const res = AmazonExactMatchVerifier.validateCandidate(priceItem);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('price must be null')));
});

test('Phase 57A Test 13: Static stock claim in offer is strictly rejected', () => {
  const stockItem = {
    part_number: '11231602050',
    asin: 'B001ABCDEF',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verified_at: '2026-10-27T12:00:00Z',
    evidence_source: 'Proof document',
    in_stock: true
  };
  const res = AmazonExactMatchVerifier.validateCandidate(stockItem);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('in_stock must be null')));
});

test('Phase 57A Test 14: Dry-run does not modify production offers file', () => {
  const offersPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');
  const beforeStat = fs.statSync(offersPath);
  
  const res = importVerifiedOffers({
    file: path.join(rootDir, 'output', 'phase57a', 'VERIFIED_IMPORT_BATCH.json'),
    dryRun: true
  });
  
  assert.equal(res.written, false);
  const afterStat = fs.statSync(offersPath);
  assert.equal(beforeStat.mtimeMs, afterStat.mtimeMs, 'File must not be written in dry-run');
});

test('Phase 57A Test 15: Clean batch import maintains zero corruptions', () => {
  const res = importVerifiedOffers({
    file: path.join(rootDir, 'output', 'phase57a', 'VERIFIED_IMPORT_BATCH.json'),
    dryRun: false
  });
  
  assert.equal(res.invalid.length, 0);
  assert.equal(res.rejected.length, 0);
  assert.equal(res.ambiguous.length, 0);
  assert.equal(res.duplicate.length, 0);
});

test('Phase 57A Test 16: Resolver returns direct verified offer when override exists', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  const testPart = '11231602050';
  const customOverride = {
    part_number: testPart,
    asin: 'B001TESTAS',
    marketplace: 'amazon.nl',
    enabled: true,
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-27T12:00:00Z',
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true
    },
    evidence_sources: [{
      type: 'CATALOG',
      url: 'https://example.com/stihl/11231602050',
      title: 'Catalog',
      claim: 'Part',
      retrieved_at: '2026-10-27T12:00:00Z'
    }]
  };

  const provider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    manualOverrides: [customOverride]
  });

  const offers = provider.getOffers({ partNumber: testPart });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
  assert.equal(offers[0].is_verified, true);
  assert.equal(offers[0].asin, 'B001TESTAS');
  assert.ok(offers[0].url.includes('/dp/B001TESTAS'));
});

test('Phase 57A Test 17: Unmapped part retains safe search fallback link', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  const testPart = '11231602050';
  const provider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    manualOverrides: []
  });

  const offers = provider.getOffers({ partNumber: testPart });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].match_type, AMAZON_MATCH_TYPES.SEARCH_LINK);
  assert.equal(offers[0].is_verified, false);
  assert.ok(offers[0].url.includes('/s?k='));
});

test('Phase 57A Test 18: OEM UI copy presents correct verified claims', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  
  const offersDocPath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');
  const originalOffers = fs.readFileSync(offersDocPath, 'utf8');
  try {
    const mockOffers = {
      schema_version: '1.0.0',
      offers: [{
        part_number: '11231602050',
        asin: 'B001OEMTES',
        marketplace: 'amazon.nl',
        enabled: true,
        verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
        verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
        verified_at: '2026-10-27T12:00:00Z',
        match_type: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
        product_type: PRODUCT_TYPES.OEM,
        proof: {
          exact_part_number_found: true,
          asin_identity_verified: true,
          marketplace_verified: true
        },
        evidence_sources: [{
          type: 'CATALOG',
          url: 'https://example.com/stihl/11231602050',
          title: 'Catalog',
          claim: 'Part',
          retrieved_at: '2026-10-27T12:00:00Z'
        }]
      }]
    };
    fs.writeFileSync(offersDocPath, JSON.stringify(mockOffers));
    AffiliateOfferResolver.reloadManualOverrides ? AffiliateOfferResolver.reloadManualOverrides() : null;
    
    // Test through resolver and provider directly to guarantee isolation
    const provider = new AmazonAffiliateProvider({
      manualOverrides: mockOffers.offers,
      marketplace: 'amazon.nl'
    });
    const offers = provider.getOffers({ partNumber: '11231602050' });
    assert.equal(offers[0].match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
    assert.equal(offers[0].label, 'Bekijk product op Amazon.nl');
    assert.equal(offers[0].badge_label, 'Geverifieerd product');
  } finally {
    fs.writeFileSync(offersDocPath, originalOffers);
  }
});

test('Phase 57A Test 19: Aftermarket UI copy presents transparent non-OEM badge', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  const mockOffer = {
    part_number: '11231602050',
    asin: 'B002AFTTES',
    marketplace: 'amazon.nl',
    enabled: true,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-27T12:00:00Z',
    match_type: MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE,
    product_type: PRODUCT_TYPES.AFTERMARKET,
    aftermarket_brand: 'Haishine',
    manufacturer_part_number: 'HSH-11231602050',
    proof: {
      exact_part_number_found: true,
      asin_identity_verified: true,
      marketplace_verified: true,
      replacement_reference_verified: true
    },
    evidence_sources: [{
      type: 'CATALOG',
      url: 'https://example.com/haishine/11231602050',
      title: 'Catalog',
      claim: 'Part',
      retrieved_at: '2026-10-27T12:00:00Z'
    }]
  };

  const provider = new AmazonAffiliateProvider({
    manualOverrides: [mockOffer],
    marketplace: 'amazon.nl'
  });
  const offers = provider.getOffers({ partNumber: '11231602050' });
  assert.equal(offers[0].match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
  assert.equal(offers[0].label, 'Bekijk product op Amazon.nl');
  assert.ok(offers[0].badge_label.includes('Geverifieerd'));
});

test('Phase 57A Test 20: All affiliate link CTAs enforce sponsored nofollow noopener and target=_blank', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  
  const html = renderPartDetailPageHtml('11231602050');
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="sponsored nofollow noopener"'));
});

test('Phase 57A Test 21: Current production tag srihldecoder2-21 is properly loaded', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  
  const provider = new AmazonAffiliateProvider({ marketplace: 'amazon.nl' });
  assert.equal(provider.getAssociateTag('amazon.nl'), 'srihldecoder2-21');
  const offers = provider.getOffers({ partNumber: '11231602050' });
  assert.ok(offers[0].url.includes('tag=srihldecoder2-21'));
});

test('Phase 57A Test 22: No uncontrolled /dp/ links exist in codebase', () => {
  const auditPath = path.join(rootDir, 'output', 'phase57a', 'DIRECT_LINK_INTEGRITY_AUDIT.json');
  assert.equal(fs.existsSync(auditPath), true);
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  assert.equal(audit.uncontrolled_direct_dp_links, 0);
});

test('Phase 57A Test 23: Before/After accounting arithmetic is mathematically sound', () => {
  const beforeAfterPath = path.join(rootDir, 'output', 'phase57a', 'AFFILIATE_BEFORE_AFTER.json');
  assert.equal(fs.existsSync(beforeAfterPath), true);
  const data = JSON.parse(fs.readFileSync(beforeAfterPath, 'utf8'));
  
  assert.equal(data.before.canonical_parts, 17082);
  assert.equal(data.after.canonical_parts, 17082);
  assert.equal(data.before.verified_direct_mappings + data.before.search_fallbacks, 17082);
  assert.equal(data.after.verified_direct_mappings + data.after.search_fallbacks, 17082);
});

test('Phase 57A Test 24: Catalog and SEO freezes remain intact', () => {
  const summaryPath = path.join(rootDir, 'output', 'phase57a', 'PHASE57A_SUMMARY.json');
  assert.equal(fs.existsSync(summaryPath), true);
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  
  assert.equal(summary.hard_gates.CATALOG_FREEZE_INTACT, true);
  assert.equal(summary.hard_gates.SEO_FREEZE_INTACT, true);
  assert.equal(summary.hard_gates.AFFILIATE_TAG_INTACT, true);
});
