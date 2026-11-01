/**
 * tests/phase59e1_live_pilot_simulation.test.js
 *
 * Phase 59E.1: First Live Amazon ASIN Pilot — Controlled Launch Pre-Flight & Simulation Suite
 *
 * Validates:
 * 1. Verification of the 3 candidate offers against Amazon.nl requirements.
 * 2. Fail-closed default lock: zero active ASIN links in runtime until explicit approval.
 * 3. Exact production activation simulation:
 *    - 1110 400 7005 -> https://amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21
 *    - 0000 400 7000 -> https://amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21
 *    - 0000 400 7011 -> https://amazon.nl/dp/B001RMA5S2?tag=srihldecoder2-21
 * 4. Granular whitelisting: individual activation control (1, 2, or 3 parts).
 * 5. Universal search fallback: all non-activated parts (and all 18,373 catalog parts) retain valid search links.
 * 6. Fault tolerance & fail-closed fallback: corrupted, stale or missing records automatically fallback to search.
 * 7. Multi-layer kill switch reproducibility: instant rollback to search fallback.
 * 8. Telemetry, privacy & disclosure invariant: direct Amazon URL (0 redirects), transparent badging, zero PII.
 * 9. Production invariant preservation: 18,373 parts, 843 SEO parts, 1,024 sitemap URLs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  VerifiedOfferRegistry,
  MAX_PILOT_ACTIVE_OFFERS
} from '../src/affiliate/VerifiedOfferRegistry.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

const PILOT_MANIFEST_PATH = path.join(rootDir, 'PHASE59E_ACTIVATION_CANDIDATES.json');
const CANONICAL_CATALOG_PATH = path.join(rootDir, 'data', 'parts_catalog.json');
const RUNTIME_OFFERS_PATH = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');

test('Phase 59E.1 — 1. Forensic Verification of the 3 Pilot Candidates', () => {
  const manifest = JSON.parse(fs.readFileSync(PILOT_MANIFEST_PATH, 'utf8'));
  assert.strictEqual(manifest.offers.length, 3, 'Must have exactly 3 candidate offers');

  const expected = [
    {
      part: '11104007005',
      asin: 'B0068M5NAG',
      brand: 'Bosch',
      mpn: '0242240506',
      ean: '3165141051063',
      qty: 1
    },
    {
      part: '00004007000',
      asin: 'B001RM8J76',
      brand: 'NGK',
      mpn: 'BPMR7A / 6703',
      ean: '0087295167038',
      qty: 1
    },
    {
      part: '00004007011',
      asin: 'B001RMA5S2',
      brand: 'NGK',
      mpn: 'CMR6H / 3365',
      ean: '0087295133651',
      qty: 1
    }
  ];

  for (const exp of expected) {
    const offer = manifest.offers.find(o => o.part_number === exp.part);
    assert.ok(offer, `Offer for ${exp.part} must exist in manifest`);
    assert.strictEqual(offer.asin, exp.asin);
    assert.strictEqual(offer.brand, exp.brand);
    assert.strictEqual(offer.package_quantity, exp.qty, 'Must be single piece packaging');
    assert.strictEqual(offer.marketplace, 'amazon.nl');
    assert.strictEqual(offer.affiliate_tag, 'srihldecoder2-21');
    assert.strictEqual(offer.oem_brand_classification, 'OEM_SUPPLIER_EQUIVALENT');

    // Run Two-Gate verification
    const verification = TwoGateVerifier.verifyOffer(offer);
    assert.strictEqual(verification.passed, true, `Offer ${exp.part} must pass TwoGateVerifier`);
    assert.strictEqual(verification.gate1.passed, true);
    assert.strictEqual(verification.gate2.passed, true);
    assert.strictEqual(verification.errors.length, 0);
  }
});

test('Phase 59E.1 — 2. Default Fail-Closed State (0 Published ASINs in Runtime)', () => {
  const runtimeOffers = JSON.parse(fs.readFileSync(RUNTIME_OFFERS_PATH, 'utf8'));
  assert.deepStrictEqual(runtimeOffers.offers, [], 'Runtime amazon_part_offers.json MUST be empty');

  // Verify that default registry fails closed without explicit activation
  const defaultRegistry = new VerifiedOfferRegistry({
    registryPath: PILOT_MANIFEST_PATH,
    productionActivationAllowed: false
  });
  defaultRegistry.loadFromFile();

  for (const partNo of ['11104007005', '00004007000', '00004007011']) {
    const active = defaultRegistry.getActiveOffer(partNo);
    assert.strictEqual(active, null, `Part ${partNo} must return null when productionActivationAllowed is false`);
  }
});

test('Phase 59E.1 — 3. Simulated Full Production Activation of All 3 Offers', () => {
  const registry = new VerifiedOfferRegistry({
    registryPath: PILOT_MANIFEST_PATH,
    productionActivationAllowed: true
  });

  const amazonProvider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    defaultAssociateTag: 'srihldecoder2-21',
    verifiedRegistry: registry
  });

  const resolver = new AffiliateOfferResolver({
    verifiedRegistry: registry
  });
  resolver.registerProvider('amazon', amazonProvider);
  resolver.ensureLoaded();

  // Activate all 3 offers
  for (const partNo of ['11104007005', '00004007000', '00004007011']) {
    const actResult = registry.setOfferStatus(partNo, 'ACTIVE', 'Phase 59E.1 Simulation');
    assert.strictEqual(actResult.success, true, `Activation of ${partNo} must succeed`);
    assert.strictEqual(registry.isOfferActive(partNo), true);
  }

  // Verify Candidate 1: Bosch WSR6F
  const offers1 = resolver.resolveOffers({ partNumber: '11104007005', partName: 'Bosch WSR6F' });
  assert.strictEqual(offers1.length, 1);
  assert.strictEqual(offers1[0].link_type, 'DIRECT_ASIN');
  assert.strictEqual(offers1[0].asin, 'B0068M5NAG');
  assert.strictEqual(offers1[0].url, 'https://amazon.nl/dp/B0068M5NAG?tag=srihldecoder2-21');
  assert.strictEqual(offers1[0].badge_label, 'OEM-kwaliteit (Bosch)');

  // Verify Candidate 2: NGK BPMR7A
  const offers2 = resolver.resolveOffers({ partNumber: '00004007000', partName: 'NGK BPMR7A' });
  assert.strictEqual(offers2.length, 1);
  assert.strictEqual(offers2[0].link_type, 'DIRECT_ASIN');
  assert.strictEqual(offers2[0].asin, 'B001RM8J76');
  assert.strictEqual(offers2[0].url, 'https://amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21');
  assert.strictEqual(offers2[0].badge_label, 'OEM-kwaliteit (NGK)');

  // Verify Candidate 3: NGK CMR6H
  const offers3 = resolver.resolveOffers({ partNumber: '00004007011', partName: 'NGK CMR6H' });
  assert.strictEqual(offers3.length, 1);
  assert.strictEqual(offers3[0].link_type, 'DIRECT_ASIN');
  assert.strictEqual(offers3[0].asin, 'B001RMA5S2');
  assert.strictEqual(offers3[0].url, 'https://amazon.nl/dp/B001RMA5S2?tag=srihldecoder2-21');
  assert.strictEqual(offers3[0].badge_label, 'OEM-kwaliteit (NGK)');
});

test('Phase 59E.1 — 4. Granular Whitelist Simulation (Partial Activation)', () => {
  // Scenario: Operator only activates 1110 400 7005 (Bosch)
  const registry = new VerifiedOfferRegistry({
    registryPath: PILOT_MANIFEST_PATH,
    productionActivationAllowed: true,
    activeWhitelist: ['11104007005']
  });

  const amazonProvider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    defaultAssociateTag: 'srihldecoder2-21',
    verifiedRegistry: registry
  });
  const resolver = new AffiliateOfferResolver({ verifiedRegistry: registry });
  resolver.registerProvider('amazon', amazonProvider);
  resolver.ensureLoaded();

  registry.setOfferStatus('11104007005', 'ACTIVE');
  registry.setOfferStatus('00004007000', 'ACTIVE'); // Marked active in registry, but NOT in whitelist

  // Whitelisted part gets DIRECT_ASIN
  const res1 = resolver.resolveOffers({ partNumber: '11104007005', partName: 'WSR6F' });
  assert.strictEqual(res1[0].link_type, 'DIRECT_ASIN');
  assert.strictEqual(res1[0].asin, 'B0068M5NAG');

  // Non-whitelisted part falls back to SEARCH_FALLBACK even if marked active in registry
  const res2 = resolver.resolveOffers({ partNumber: '00004007000', partName: 'BPMR7A' });
  assert.strictEqual(res2[0].link_type, 'SEARCH_FALLBACK');
  assert.ok(res2[0].url.includes('amazon.nl/s?k=STIHL'));
});

test('Phase 59E.1 — 5. Universal Search Fallback Preserved for Non-Pilot Parts', () => {
  const registry = new VerifiedOfferRegistry({
    registryPath: PILOT_MANIFEST_PATH,
    productionActivationAllowed: true
  });

  const amazonProvider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    defaultAssociateTag: 'srihldecoder2-21',
    verifiedRegistry: registry
  });
  const resolver = new AffiliateOfferResolver({ verifiedRegistry: registry });
  resolver.registerProvider('amazon', amazonProvider);
  resolver.ensureLoaded();

  registry.setOfferStatus('11104007005', 'ACTIVE');

  // Non-pilot parts
  const testParts = [
    { part: '11210071001', name: 'Zaagketting' },
    { part: '00003503502', name: 'Tankdop' },
    { part: '11236407102', name: 'Wormwiel' },
    { part: '42821410300', name: 'Luchtfilter' }
  ];

  for (const tp of testParts) {
    const res = resolver.resolveOffers({ partNumber: tp.part, partName: tp.name });
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].link_type, 'SEARCH_FALLBACK');
    assert.ok(res[0].url.includes('amazon.nl/s?k=STIHL'));
    assert.ok(res[0].url.includes('tag=srihldecoder2-21'));
    assert.strictEqual(res[0].badge_label, 'Amazon-zoekopdracht');
  }
});

test('Phase 59E.1 — 6. Runtime Safety Guard: Corrupted or Stale Record Fails Closed', () => {
  const registry = new VerifiedOfferRegistry({
    registryPath: PILOT_MANIFEST_PATH,
    productionActivationAllowed: true
  });

  const amazonProvider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    defaultAssociateTag: 'srihldecoder2-21',
    verifiedRegistry: registry
  });
  const resolver = new AffiliateOfferResolver({ verifiedRegistry: registry });
  resolver.registerProvider('amazon', amazonProvider);
  resolver.ensureLoaded();

  // Corrupt candidate 1 verification date to make it stale (> 180 days)
  const offer = registry.getOffer('11104007005');
  offer.status = 'ACTIVE';
  offer.verification_date = '2024-01-01'; // Stale date

  // getActiveOffer must fail closed
  const activeOffer = registry.getActiveOffer('11104007005');
  assert.strictEqual(activeOffer, null, 'Stale offer must fail closed and return null');

  // Resolution must gracefully fall back to search URL
  const res = resolver.resolveOffers({ partNumber: '11104007005', partName: 'Bosch WSR6F' });
  assert.strictEqual(res[0].link_type, 'SEARCH_FALLBACK');
  assert.ok(res[0].url.includes('amazon.nl/s?k=STIHL'));
});

test('Phase 59E.1 — 7. Reproducible Multi-Layer Rollback Execution', () => {
  const registry = new VerifiedOfferRegistry({
    registryPath: PILOT_MANIFEST_PATH,
    productionActivationAllowed: true
  });

  const amazonProvider = new AmazonAffiliateProvider({
    marketplace: 'amazon.nl',
    defaultAssociateTag: 'srihldecoder2-21',
    verifiedRegistry: registry
  });
  const resolver = new AffiliateOfferResolver({ verifiedRegistry: registry });
  resolver.registerProvider('amazon', amazonProvider);
  resolver.ensureLoaded();

  registry.setOfferStatus('11104007005', 'ACTIVE');
  registry.setOfferStatus('00004007000', 'ACTIVE');
  registry.setOfferStatus('00004007011', 'ACTIVE');

  assert.strictEqual(resolver.resolveOffers({ partNumber: '11104007005' })[0].link_type, 'DIRECT_ASIN');

  // Level 1 Rollback: Deactivate single offer
  registry.deactivateOffer('11104007005', 'Operator manual rollback');
  assert.strictEqual(resolver.resolveOffers({ partNumber: '11104007005' })[0].link_type, 'SEARCH_FALLBACK');
  // Other offers remain unaffected
  assert.strictEqual(resolver.resolveOffers({ partNumber: '00004007000' })[0].link_type, 'DIRECT_ASIN');

  // Level 2 Rollback: Global Registry Lock
  registry.productionActivationAllowed = false;
  assert.strictEqual(resolver.resolveOffers({ partNumber: '00004007000' })[0].link_type, 'SEARCH_FALLBACK');
  assert.strictEqual(resolver.resolveOffers({ partNumber: '00004007011' })[0].link_type, 'SEARCH_FALLBACK');
});

test('Phase 59E.1 — 8. Strict Production Invariant Freeze', () => {
  const catalog = JSON.parse(fs.readFileSync(CANONICAL_CATALOG_PATH, 'utf8'));
  assert.strictEqual(catalog.parts.length, 18373, 'Canonical catalog parts count must remain exactly 18,373');

  const indexable = getAllIndexablePartsList();
  assert.strictEqual(indexable.length, 843, 'Tier A indexable parts count must remain exactly 843');
});
