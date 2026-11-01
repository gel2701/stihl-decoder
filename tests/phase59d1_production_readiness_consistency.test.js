/**
 * tests/phase59d1_production_readiness_consistency.test.js
 *
 * Phase 59D.1: Production Readiness & Evidence Consistency Test Suite
 *
 * Validates:
 * 1. Documentation & Registry Consistency:
 *    - Cross-parity of the 19 investigated parts across all Phase 59 artifacts.
 *    - Exactly 3 VERIFIED_COMPLETE (Bosch WSR6F, NGK BPMR7A, NGK CMR6H).
 *    - Exactly 13 PART_COMPATIBILITY_VERIFIED / STAGED.
 *    - Exactly 3 INCORRECT_MATCH_CONFIRMED / SUSPENDED (0000 350 3518, 1123 640 2074, 4238 140 1800).
 * 2. Forensic Re-examination & Technical Distinctions for Top 3 Spark Plugs:
 *    - Bosch WSR6F (B0068M5NAG), NGK BPMR7A (B001RM8J76), NGK CMR6H (B001RMA5S2).
 *    - Packaging (1-pack), MPN, brand, fitment distinctions, and Amazon.nl marketplace constraints.
 * 3. Two-Gate Staleness & Freshness Verification:
 *    - Rejection of records older than maxEvidenceAgeDays (180 days).
 *    - Rejection of malformed/invalid verification_date values.
 *    - Acceptance of valid recent ISO dates.
 * 4. Production Activation Simulation (8 Scenarios):
 *    - 1: Valid ACTIVE offer when productionActivationAllowed: true -> returns direct ASIN URL.
 *    - 2: Missing offer -> returns compliant search fallback URL.
 *    - 3: Suspended offer -> returns compliant search fallback URL.
 *    - 4: Stale evidence record (> 180d) -> fails TwoGate runtime check -> falls back to search.
 *    - 5: Invalid ASIN syntax -> fails TwoGate Gate 1 -> falls back to search.
 *    - 6: Incorrect marketplace / tag mismatch -> fails TwoGate Gate 1 -> falls back to search.
 *    - 7: Production lock disabled (productionActivationAllowed: false) -> strictly returns search fallback.
 *    - 8: Universal safe fallback -> zero unhandled exceptions, correct query encoding and affiliate tag.
 * 5. Production Resolver Integration:
 *    - AffiliateOfferResolver seamlessly integrates VerifiedOfferRegistry.
 *    - Default production resolver strictly resolves to search fallbacks while production lock is engaged.
 * 6. Production Invariant Protection:
 *    - Exactly 18,373 canonical parts.
 *    - data/affiliate/amazon_part_offers.json remains [] (0 published ASINs).
 *    - Exactly 843 indexable SEO parts.
 *    - Exactly 1,024 sitemap URLs.
 *    - Affiliate tag strictly srihldecoder2-21.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { ContinuousEnrichmentEngine, ENRICHMENT_STAGES } from '../src/affiliate/ContinuousEnrichmentEngine.js';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to normalize 11-digit part numbers
function norm(pn) {
  return String(pn || '').replace(/\s+/g, '');
}

test('Phase 59D.1 — 1. Documentation & Registry Consistency Across All 19 Candidates', () => {
  const cMatchesPath = path.join(ROOT_DIR, 'PHASE59C_VERIFIED_MATCHES.json');
  const dOffersPath = path.join(ROOT_DIR, 'PHASE59D_VERIFIED_OFFERS.json');
  const dEvidencePath = path.join(ROOT_DIR, 'PHASE59D_EVIDENCE_VALIDATION.json');
  const dReportPath = path.join(ROOT_DIR, 'PHASE59D_REPORT.md');

  assert.ok(fs.existsSync(cMatchesPath), 'PHASE59C_VERIFIED_MATCHES.json must exist');
  assert.ok(fs.existsSync(dOffersPath), 'PHASE59D_VERIFIED_OFFERS.json must exist');
  assert.ok(fs.existsSync(dEvidencePath), 'PHASE59D_EVIDENCE_VALIDATION.json must exist');
  assert.ok(fs.existsSync(dReportPath), 'PHASE59D_REPORT.md must exist');

  const cMatches = JSON.parse(fs.readFileSync(cMatchesPath, 'utf8'));
  const dOffers = JSON.parse(fs.readFileSync(dOffersPath, 'utf8'));
  const dEvidence = JSON.parse(fs.readFileSync(dEvidencePath, 'utf8'));
  const dReport = fs.readFileSync(dReportPath, 'utf8');

  // The 19 actively investigated/staged candidates from Phase 59C
  const cTopCandidates = cMatches.matches.filter(m =>
    ['VERIFIED_COMPLETE', 'PART_COMPATIBILITY_VERIFIED', 'INCORRECT_MATCH_CONFIRMED'].includes(m.investigation_status)
  );
  assert.equal(cTopCandidates.length, 19, 'Phase 59C top investigated candidates count must be exactly 19');
  assert.equal(dOffers.offers.length, 19, 'Phase 59D offers count must be exactly 19');
  assert.equal(dEvidence.enrichment_backlog.dossiers.length, 19, 'Phase 59D evidence validation dossier count must be exactly 19');

  // Verify status mapping:
  // 3 VERIFIED_COMPLETE -> VERIFIED (STAGE_4_TWO_GATE_READY)
  // 13 PART_COMPATIBILITY_VERIFIED -> STAGED (STAGE_3_ASIN_IDENTITY)
  // 3 INCORRECT_MATCH_CONFIRMED -> SUSPENDED (STAGE_REJECTED_REPLACED)
  const expectedComplete = ['11104007005', '00004007000', '00004007011'];
  const expectedSuspended = ['00003503518', '11236402074', '42381401800'];
  const expectedStaged = [
    '00003503502', '11176403800', '00006421234', '00006421236',
    '11181953500', '00001958200', '42821410300', '11236407102',
    '11231201613', '11301240800', '11236403200', '11411201600',
    '00004007025'
  ];

  // Check 59C
  const cComplete = cTopCandidates.filter(c => c.investigation_status === 'VERIFIED_COMPLETE').map(c => norm(c.part_number));
  const cSuspended = cTopCandidates.filter(c => c.investigation_status === 'INCORRECT_MATCH_CONFIRMED').map(c => norm(c.part_number));
  const cStaged = cTopCandidates.filter(c => c.investigation_status === 'PART_COMPATIBILITY_VERIFIED').map(c => norm(c.part_number));

  assert.deepEqual(cComplete.sort(), expectedComplete.sort(), 'Phase 59C VERIFIED_COMPLETE must match exactly 3 spark plugs');
  assert.deepEqual(cSuspended.sort(), expectedSuspended.sort(), 'Phase 59C INCORRECT_MATCH_CONFIRMED must match 3 rejected parts');
  assert.deepEqual(cStaged.sort(), expectedStaged.sort(), 'Phase 59C PART_COMPATIBILITY_VERIFIED must match 13 staged parts');

  // Check 59D
  const dVerified = dOffers.offers.filter(o => o.status === 'VERIFIED').map(o => norm(o.part_number));
  const dSuspendedOffers = dOffers.offers.filter(o => o.status === 'SUSPENDED').map(o => norm(o.part_number));
  const dStagedOffers = dOffers.offers.filter(o => o.status === 'STAGED').map(o => norm(o.part_number));

  assert.deepEqual(dVerified.sort(), expectedComplete.sort(), 'Phase 59D VERIFIED offers must match exactly 3 spark plugs');
  assert.deepEqual(dSuspendedOffers.sort(), expectedSuspended.sort(), 'Phase 59D SUSPENDED offers must match 3 rejected parts');
  assert.deepEqual(dStagedOffers.sort(), expectedStaged.sort(), 'Phase 59D STAGED offers must match 13 staged parts');

  // Confirm dReport explicitly documents these groups without contradiction
  assert.ok(dReport.includes('1110 400 7005'), 'Report must mention Bosch WSR6F');
  assert.ok(dReport.includes('0000 400 7000'), 'Report must mention NGK BPMR7A');
  assert.ok(dReport.includes('0000 400 7011'), 'Report must mention NGK CMR6H');
  assert.ok(dReport.includes('0000 350 3518'), 'Report must mention rejected fuel cap');
  assert.ok(dReport.includes('1123 640 2074'), 'Report must mention rejected clutch drum');
  assert.ok(dReport.includes('4238 140 1800'), 'Report must mention rejected air filter');
});

test('Phase 59D.1 — 2. Forensic Re-examination & Technical Distinctions for Top 3 Spark Plugs', () => {
  const dOffersPath = path.join(ROOT_DIR, 'PHASE59D_VERIFIED_OFFERS.json');
  const dOffers = JSON.parse(fs.readFileSync(dOffersPath, 'utf8'));

  const bosch = dOffers.offers.find(o => norm(o.part_number) === '11104007005');
  const ngkStandard = dOffers.offers.find(o => norm(o.part_number) === '00004007000');
  const ngkCompact = dOffers.offers.find(o => norm(o.part_number) === '00004007011');

  assert.ok(bosch, 'Bosch WSR6F must be in registry');
  assert.ok(ngkStandard, 'NGK BPMR7A must be in registry');
  assert.ok(ngkCompact, 'NGK CMR6H must be in registry');

  // Bosch WSR6F
  assert.equal(bosch.asin, 'B0068M5NAG');
  assert.equal(bosch.manufacturer_part_number, '0242240506');
  assert.equal(bosch.brand, 'Bosch');
  assert.equal(bosch.marketplace, 'amazon.nl');
  assert.ok(
    bosch.product_title.includes('WSR6F') &&
    bosch.asin_product_identity_proof.includes('0242240506')
  );

  // NGK BPMR7A (Standard M14)
  assert.equal(ngkStandard.asin, 'B001RM8J76');
  assert.equal(ngkStandard.brand, 'NGK');
  assert.ok(ngkStandard.manufacturer_part_number.includes('6703'));
  assert.equal(ngkStandard.marketplace, 'amazon.nl');

  // NGK CMR6H (Compact M10 for 4-MIX®)
  assert.equal(ngkCompact.asin, 'B001RMA5S2');
  assert.equal(ngkCompact.brand, 'NGK');
  assert.ok(ngkCompact.manufacturer_part_number.includes('3365'));
  assert.equal(ngkCompact.marketplace, 'amazon.nl');

  // Technical fitment distinction check:
  // BPMR7A has M14x1.25 thread (standard 2-stroke), while CMR6H has M10x1.0 thread (compact 4-MIX®).
  // They are physically incompatible and cannot be interchanged.
  assert.notEqual(ngkStandard.asin, ngkCompact.asin, 'M14 and M10 spark plugs must have distinct ASINs');
  assert.notEqual(ngkStandard.manufacturer_part_number, ngkCompact.manufacturer_part_number);
});

test('Phase 59D.1 — 3. Two-Gate Staleness & Freshness Verification', () => {
  const validBaseOffer = {
    part_number: '11104007005',
    asin: 'B0068M5NAG',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Bosch',
    manufacturer_part_number: '0242240506',
    brand: 'Bosch',
    product_title: 'Bosch WSR6F Spark Plug',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    independent_evidence_url: 'https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck',
    confirmed_product_identity: 'Bosch WSR6F 0242240506',
    confirmed_stihl_compatibility: 'Fits STIHL 017-026, MS 170-MS 260'
  };

  // Case A: Fresh date (today) -> passes
  const todayIso = new Date().toISOString().slice(0, 10);
  const freshResult = TwoGateVerifier.verifyOffer({
    ...validBaseOffer,
    verification_date: todayIso
  });
  assert.equal(freshResult.passed, true, 'Fresh verification date must pass');
  assert.equal(freshResult.errors.length, 0);

  // Case B: Stale date (> 180 days ago, e.g. 200 days) -> fails
  const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const staleResult = TwoGateVerifier.verifyOffer({
    ...validBaseOffer,
    verification_date: staleDate
  });
  assert.equal(staleResult.passed, false, 'Stale verification date (>180d) must fail');
  assert.ok(
    staleResult.errors.some(e => e.includes('Stale evidence record')),
    `Error should mention staleness: ${staleResult.errors.join(', ')}`
  );

  // Case C: Malformed date string -> fails
  const malformedResult = TwoGateVerifier.verifyOffer({
    ...validBaseOffer,
    verification_date: 'not-a-valid-date'
  });
  assert.equal(malformedResult.passed, false, 'Malformed verification date must fail');
  assert.ok(
    malformedResult.errors.some(e => e.includes('Invalid verification_date format')),
    `Error should mention format: ${malformedResult.errors.join(', ')}`
  );

  // Case D: Missing verification_date -> fails
  const missingDateOffer = { ...validBaseOffer };
  delete missingDateOffer.verification_date;
  const missingResult = TwoGateVerifier.verifyOffer(missingDateOffer);
  assert.equal(missingResult.passed, false, 'Missing verification_date must fail');
  assert.ok(
    missingResult.errors.some(e => e.includes('Missing mandatory provenance fields')),
    `Error should mention missing fields: ${missingResult.errors.join(', ')}`
  );
});

test('Phase 59D.1 — 4. Production Activation Simulation (8 Scenarios)', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    const freshDate = new Date().toISOString().slice(0, 10);

    // Scenario 1: Valid ACTIVE offer with productionActivationAllowed: true -> returns direct ASIN URL
    const activeRegistry = new VerifiedOfferRegistry({
      productionActivationAllowed: true
    });
    activeRegistry.registerOffer({
      part_number: '11104007005',
      asin: 'B0068M5NAG',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      status: 'ACTIVE',
      manufacturer: 'Bosch Automotive Aftermarket',
      manufacturer_part_number: '0242240506',
      brand: 'Bosch',
      product_title: 'Bosch WSR6F',
      oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
      independent_evidence_url: 'https://example.com/evidence',
      confirmed_product_identity: 'Bosch WSR6F',
      confirmed_stihl_compatibility: 'Direct match for MS 260',
      verification_date: freshDate
    });

    const providerActive = new AmazonAffiliateProvider({
      tag: 'srihldecoder2-21',
      defaultMarketplace: 'amazon.nl'
    });
    providerActive.setVerifiedRegistry(activeRegistry);

    const s1Offers = providerActive.getOffers({ partNumber: '11104007005', partName: 'Zündkerze WSR6F' });
    assert.equal(s1Offers.length, 1);
    const s1 = s1Offers[0];
    assert.equal(s1.link_type, 'DIRECT_ASIN', 'Scenario 1: Must resolve as DIRECT_ASIN');
    assert.equal(s1.asin, 'B0068M5NAG');
    assert.ok(s1.url.includes('/dp/B0068M5NAG'), 'Scenario 1: URL must be /dp/ ASIN link');
    assert.ok(s1.url.includes('tag=srihldecoder2-21'), 'Scenario 1: URL must have compliant tag');

    // Scenario 2: Missing offer -> returns compliant search fallback
    const s2Offers = providerActive.getOffers({ partNumber: '99999999999', partName: 'Non Existent Part' });
    assert.equal(s2Offers.length, 1);
    const s2 = s2Offers[0];
    assert.equal(s2.link_type, 'SEARCH_FALLBACK', 'Scenario 2: Missing offer must fall back to search');
    assert.ok(s2.url.includes('/s?k='), 'Scenario 2: Must be search URL');
    assert.ok(s2.url.includes('tag=srihldecoder2-21'), 'Scenario 2: Compliant tag');

    // Scenario 3: Suspended offer -> returns compliant search fallback
    activeRegistry.registerOffer({
      part_number: '00003503518',
      asin: 'B01N0XTEST',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      status: 'SUSPENDED',
      manufacturer: 'Generic',
      manufacturer_part_number: '00003503518',
      brand: 'Generic',
      oem_brand_classification: 'AFTERMARKET_REPLACEMENT',
      independent_evidence_url: 'https://example.com/revoked',
      confirmed_product_identity: 'Rejected Cap',
      confirmed_stihl_compatibility: 'Incompatible thread pitch',
      verification_date: freshDate
    });
    const s3Offers = providerActive.getOffers({ partNumber: '00003503518', partName: 'Tankdop' });
    assert.equal(s3Offers.length, 1);
    const s3 = s3Offers[0];
    assert.equal(s3.link_type, 'SEARCH_FALLBACK', 'Scenario 3: Suspended offer must fall back to search');
    assert.ok(s3.url.includes('/s?k='), 'Scenario 3: Must be search URL');

    // Scenario 4: Stale evidence record (> 180 days) marked ACTIVE -> fails runtime Two-Gate check -> search fallback
    const staleDate = new Date(Date.now() - 190 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    activeRegistry.registerOffer({
      part_number: '11236407102',
      asin: 'B07TESTSTALE',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      status: 'ACTIVE',
      manufacturer: 'Stens',
      manufacturer_part_number: '11236407102',
      brand: 'Stens',
      product_title: 'Stens Oil Worm Gear',
      oem_brand_classification: 'AFTERMARKET_REPLACEMENT',
      independent_evidence_url: 'https://example.com/evidence',
      confirmed_product_identity: 'Worm gear',
      confirmed_stihl_compatibility: 'Fits MS 250',
      verification_date: staleDate
    });
    const s4Offers = providerActive.getOffers({ partNumber: '11236407102', partName: 'Wormwiel' });
    assert.equal(s4Offers.length, 1);
    const s4 = s4Offers[0];
    assert.equal(s4.link_type, 'SEARCH_FALLBACK', 'Scenario 4: Stale evidence must fall back to search');
    assert.ok(s4.url.includes('/s?k='), 'Scenario 4: Must be search URL');

    // Scenario 5: Invalid ASIN syntax (e.g. non-10 characters) -> fails TwoGate Gate 1 -> search fallback
    activeRegistry.registerOffer({
      part_number: '11181953500',
      asin: 'INVALID_ASIN_TOO_LONG',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      status: 'ACTIVE',
      manufacturer: 'STIHL',
      brand: 'STIHL',
      oem_brand_classification: 'GENUINE_OEM',
      independent_evidence_url: 'https://example.com/evidence',
      confirmed_product_identity: 'Spring',
      confirmed_stihl_compatibility: 'Fits MS 260',
      verification_date: freshDate
    });
    const s5Offers = providerActive.getOffers({ partNumber: '11181953500', partName: 'Veer' });
    assert.equal(s5Offers.length, 1);
    const s5 = s5Offers[0];
    assert.equal(s5.link_type, 'SEARCH_FALLBACK', 'Scenario 5: Malformed ASIN must fall back to search');

    // Scenario 6: Incorrect marketplace / tag mismatch -> fails TwoGate Gate 1 -> search fallback
    activeRegistry.registerOffer({
      part_number: '00001958200',
      asin: 'B08TESTTAG',
      marketplace: 'amazon.nl',
      affiliate_tag: 'malicious-or-wrong-tag-20', // Not srihldecoder2-21
      status: 'ACTIVE',
      manufacturer: 'STIHL',
      brand: 'STIHL',
      oem_brand_classification: 'GENUINE_OEM',
      independent_evidence_url: 'https://example.com/evidence',
      confirmed_product_identity: 'Rope',
      confirmed_stihl_compatibility: 'Fits starter',
      verification_date: freshDate
    });
    const s6Offers = providerActive.getOffers({ partNumber: '00001958200', partName: 'Starterkoord' });
    assert.equal(s6Offers.length, 1);
    const s6 = s6Offers[0];
    assert.equal(s6.link_type, 'SEARCH_FALLBACK', 'Scenario 6: Tag mismatch must fall back to search');

    // Scenario 7: Production lock disabled (productionActivationAllowed: false) -> strictly returns search fallback
    const lockedRegistry = new VerifiedOfferRegistry({
      productionActivationAllowed: false
    });
    lockedRegistry.registerOffer({
      part_number: '11104007005',
      asin: 'B0068M5NAG',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      status: 'ACTIVE',
      manufacturer: 'Bosch Automotive Aftermarket',
      manufacturer_part_number: '0242240506',
      brand: 'Bosch',
      product_title: 'Bosch WSR6F',
      oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
      independent_evidence_url: 'https://example.com/evidence',
      confirmed_product_identity: 'Bosch WSR6F',
      confirmed_stihl_compatibility: 'Direct match for MS 260',
      verification_date: freshDate
    });
    const providerLocked = new AmazonAffiliateProvider({
      tag: 'srihldecoder2-21',
      defaultMarketplace: 'amazon.nl'
    });
    providerLocked.setVerifiedRegistry(lockedRegistry);

    const s7Offers = providerLocked.getOffers({ partNumber: '11104007005', partName: 'Zündkerze WSR6F' });
    assert.equal(s7Offers.length, 1);
    const s7 = s7Offers[0];
    assert.equal(s7.link_type, 'SEARCH_FALLBACK', 'Scenario 7: When production lock is active, even ACTIVE offers must return search fallback');
    assert.ok(s7.url.includes('/s?k='), 'Scenario 7: Must be search URL');

    // Scenario 8: Fallback URL is always technically valid, uses srihldecoder2-21, has valid encoding, never throws
    const badInputs = [null, undefined, '', '   ', '1123@@##$$%', '0000 400 7000'];
    for (const input of badInputs) {
      assert.doesNotThrow(() => {
        const fallbacks = providerLocked.getOffers({ partNumber: input, partName: 'Test' });
        if (fallbacks.length > 0) {
          assert.ok(fallbacks[0].url, 'Fallback URL must exist');
          assert.ok(fallbacks[0].url.includes('tag=srihldecoder2-21'), 'Fallback URL must include affiliate tag');
          assert.ok(!fallbacks[0].url.includes('/dp/'), 'Fallback URL must never include /dp/');
        }
      });
    }
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 59D.1 — 5. Default Production Resolver Integration & Fail-Closed Safety', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    // Test across multiple parts in canonical catalog
    const testParts = ['11104007005', '00004007000', '00004007011', '11231200605', '00003503502'];

    for (const pn of testParts) {
      const offers = AffiliateOfferResolver.resolveOffers({ partNumber: pn });
      assert.ok(offers.length >= 1, `Resolver must produce at least one offer for ${pn}`);
      const offer = offers[0];
      // In production default state, productionActivationAllowed is false and runtime amazon_part_offers is []
      // Therefore, EVERY offer must be SEARCH_FALLBACK
      assert.equal(offer.link_type, 'SEARCH_FALLBACK', `Default production state must serve SEARCH_FALLBACK for ${pn}`);
      assert.ok(offer.url.includes('amazon.nl/s?k='), `Default production link must be Amazon search URL for ${pn}`);
      assert.ok(offer.url.includes('tag=srihldecoder2-21'), `Tag must be srihldecoder2-21 for ${pn}`);
      assert.ok(!offer.url.includes('/dp/'), `Default production link must not contain /dp/ for ${pn}`);
    }
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 59D.1 — 6. Production Read-Only Safety & Invariant Protection', () => {
  // Invariant 1: Exactly 18,373 canonical catalog parts
  const catalogPath = path.join(ROOT_DIR, 'data', 'parts_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.equal(catalog.parts.length, 18373, 'Canonical catalog must contain exactly 18,373 parts');

  // Invariant 2: 0 runtime published ASINs in amazon_part_offers.json
  const offersPath = path.join(ROOT_DIR, 'data', 'affiliate', 'amazon_part_offers.json');
  const offersDoc = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
  assert.ok(Array.isArray(offersDoc.offers), 'amazon_part_offers.json offers must be an array');
  assert.equal(offersDoc.offers.length, 0, 'Production runtime offers must contain 0 published ASINs');

  // Invariant 3: Exactly 843 SEO indexable parts
  const indexable = getAllIndexablePartsList();
  assert.equal(indexable.length, 843, 'Must maintain exactly 843 indexable SEO parts');

  // Invariant 4: Exactly 1,024 sitemap URLs
  const dbPath = path.join(ROOT_DIR, 'data', 'stihl_database.json');
  const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const sitemapXml = generateSitemapXml('https://www.stihldecoder.nl', database);
  const locCount = (sitemapXml.match(/<loc>/g) || []).length;
  assert.equal(locCount, 1024, 'Must maintain exactly 1,024 sitemap URLs');

  // Invariant 5: Universal tracking tag is srihldecoder2-21
  const testProvider = new AmazonAffiliateProvider({ tag: 'srihldecoder2-21', defaultMarketplace: 'amazon.nl' });
  const sampleSearch = testProvider.buildSearchUrl('11236407102', 'srihldecoder2-21');
  assert.ok(sampleSearch.includes('tag=srihldecoder2-21'), 'Affiliate tag must strictly be srihldecoder2-21');
});
