/**
 * tests/phase70_multimarket_affiliate.test.js
 *
 * Phase 70: Multi-Marketplace Affiliate Engine & Sägenspezi Integration Test Suite
 *
 * Validates:
 * 1. Multi-marketplace configuration & strict affiliate tag isolation:
 *    - amazon.nl strictly uses srihldecoder2-21
 *    - amazon.de strictly uses srihldecode00-21
 *    - Zero cross-contamination or tag leaking between marketplaces.
 * 2. 1:N Multi-Offer Architecture:
 *    - Single STIHL part number supports concurrent active offers (Amazon.nl + Amazon.de).
 *    - Full backwards compatibility for single-offer callers (getOffer, getActiveOffer).
 *    - getActiveOffers returns multi-market offers.
 *    - Provider & Resolver deliver multi-offer array.
 * 3. Hard shipping requirement to the Netherlands:
 *    - SHIPS_TO_NL_CONFIRMED: German direct purchase button active.
 *    - SHIPPING_UNKNOWN & DOES_NOT_SHIP_TO_NL: direct CTA suppressed / fails activation.
 * 4. Total price comparison architecture:
 *    - item_price + shipping_cost_nl = total_price.
 *    - Null when shipping unknown (no fabricated prices).
 * 5. Per-marketplace capacity management:
 *    - Separate caps: amazon.nl (max 25, 18 active) and amazon.de (max 25, 14 active).
 *    - No quota collision between marketplaces.
 * 6. Sägenspezi seller integration:
 *    - Verified Seller ID A1GMRJIURBAM28 and seller name Sägenspezi.
 *    - >= 10 verified German offers (14 registered and active).
 *    - Explicit model compatibility (AMAZON_LISTING_COMPATIBLE) passes TwoGateVerifier.
 * 7. HTML rendering & UI presentation:
 *    - German badge, seller badge, shipping to NL confirmed badge.
 *    - Total price breakdown if available.
 * 8. Individual offer lifecycle & kill switch isolation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VerifiedOfferRegistry,
  MAX_PILOT_ACTIVE_OFFERS
} from '../src/affiliate/VerifiedOfferRegistry.js';
import {
  AmazonAffiliateProvider,
  ALLOWED_AMAZON_MARKETPLACES
} from '../src/affiliate/AmazonAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const registryDoc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
const catalogPartMap = new Map(catalog.parts.map(p => [p.part_number, p]));

test('Phase 70: 1. Multi-marketplace configuration & strict tag isolation', () => {
  const provider = new AmazonAffiliateProvider();

  const prevNl = process.env.AMAZON_ASSOCIATE_TAG;
  const prevDe = process.env.AMAZON_ASSOCIATE_TAG_DE;
  try {
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
    process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';

    // Test strict marketplace tag isolation
    const nlTag = provider.getAssociateTag('amazon.nl');
    const deTag = provider.getAssociateTag('amazon.de');

    assert.equal(nlTag, 'srihldecoder2-21', 'amazon.nl must use srihldecoder2-21');
    assert.equal(deTag, 'srihldecode00-21', 'amazon.de must use srihldecode00-21');
    assert.notEqual(nlTag, deTag, 'NL and DE tags must never be equal');
  } finally {
    if (prevNl === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevNl;
    if (prevDe === undefined) delete process.env.AMAZON_ASSOCIATE_TAG_DE;
    else process.env.AMAZON_ASSOCIATE_TAG_DE = prevDe;
  }

  // Verify tags in registry offers
  const nlOffers = registryDoc.offers.filter(o => o.marketplace === 'amazon.nl');
  const deOffers = registryDoc.offers.filter(o => o.marketplace === 'amazon.de');

  assert.equal(nlOffers.length, 18, 'Must maintain exactly 18 Dutch offers');
  assert.ok(deOffers.length >= 10, 'Must have at least 10 German offers');

  for (const offer of nlOffers) {
    assert.equal(offer.affiliate_tag, 'srihldecoder2-21', `NL offer ${offer.part_number} must strictly use Dutch tag`);
    assert.ok(offer.direct_affiliate_url.includes('tag=srihldecoder2-21'));
    assert.ok(!offer.direct_affiliate_url.includes('srihldecode00-21'), 'Dutch link must never contain German tag');
  }

  for (const offer of deOffers) {
    assert.equal(offer.affiliate_tag, 'srihldecode00-21', `DE offer ${offer.part_number} must strictly use German tag`);
    assert.ok(offer.direct_affiliate_url.includes('tag=srihldecode00-21'));
    assert.ok(!offer.direct_affiliate_url.includes('srihldecoder2-21'), 'German link must never contain Dutch tag');
  }
});

test('Phase 70: 2. 1:N Multi-Offer Architecture & Backwards Compatibility', () => {
  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true
  });
  registry.importRegistry(registryDoc);

  // Part 1130 124 0800 (MS 170 / MS 180 air filter) has both NL and DE offers
  const partNumber = '11301240800';
  const allOffers = registry.getOffers(partNumber);
  assert.equal(allOffers.length, 2, 'Part 1130 124 0800 must have 2 registered offers (NL + DE)');

  const activeOffers = registry.getActiveOffers(partNumber);
  assert.equal(activeOffers.length, 2, 'Part 1130 124 0800 must have 2 active offers');

  const nlActive = activeOffers.find(o => o.marketplace === 'amazon.nl');
  const deActive = activeOffers.find(o => o.marketplace === 'amazon.de');

  assert.ok(nlActive, 'Active NL offer must exist');
  assert.ok(deActive, 'Active DE offer must exist');
  assert.equal(nlActive.asin, 'B07KJYFPLM');
  assert.equal(deActive.asin, 'B00LAHKLBU');
  assert.equal(deActive.seller_name, 'Sägenspezi');

  // Backwards compatibility: getOffer and getActiveOffer without marketplace argument default to NL
  const defaultOffer = registry.getOffer(partNumber);
  assert.equal(defaultOffer.marketplace, 'amazon.nl', 'Default getOffer must return amazon.nl');
  assert.equal(defaultOffer.asin, 'B07KJYFPLM');

  const defaultActive = registry.getActiveOffer(partNumber);
  assert.equal(defaultActive.marketplace, 'amazon.nl', 'Default getActiveOffer must return amazon.nl');
  assert.equal(defaultActive.asin, 'B07KJYFPLM');

  // Explicit marketplace query works
  const deOffer = registry.getOffer(partNumber, 'amazon.de');
  assert.equal(deOffer.marketplace, 'amazon.de');
  assert.equal(deOffer.asin, 'B00LAHKLBU');

  const deActiveOffer = registry.getActiveOffer(partNumber, 'amazon.de');
  assert.equal(deActiveOffer.marketplace, 'amazon.de');
  assert.equal(deActiveOffer.asin, 'B00LAHKLBU');
});

test('Phase 70: 3. Provider & Resolver multi-offer delivery', () => {
  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true
  });
  registry.importRegistry(registryDoc);

  const provider = new AmazonAffiliateProvider({
    verifiedRegistry: registry
  });

  const prevEnv = process.env.AMAZON_AFFILIATE_ENABLED;
  const prevTag = process.env.AMAZON_ASSOCIATE_TAG;
  const prevDeTag = process.env.AMAZON_ASSOCIATE_TAG_DE;
  try {
    process.env.AMAZON_AFFILIATE_ENABLED = 'true';
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
    delete process.env.AMAZON_ASSOCIATE_TAG_DE;

    // Query part with dual offers (1123 120 1613)
    const offers = provider.getOffers({ partNumber: '11231201613' });
    assert.equal(offers.length, 2, 'Provider must return 2 commercial offers for dual-market part');

    const nlCommercial = offers.find(o => o.marketplace === 'amazon.nl');
    const deCommercial = offers.find(o => o.marketplace === 'amazon.de');

    assert.ok(nlCommercial);
    assert.ok(deCommercial);
    assert.equal(nlCommercial.tag, 'srihldecoder2-21');
    assert.equal(deCommercial.tag, 'srihldecode00-21');
    assert.equal(deCommercial.seller_name, 'Sägenspezi');
    assert.equal(deCommercial.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');

    // Query unverified part (search fallback)
    const fallbackOffers = provider.getOffers({ partNumber: '11230000000' });
    assert.equal(fallbackOffers.length, 1);
    assert.equal(fallbackOffers[0].link_type, 'SEARCH_FALLBACK');
    assert.equal(fallbackOffers[0].marketplace, 'amazon.nl');
  } finally {
    if (prevEnv === undefined) delete process.env.AMAZON_AFFILIATE_ENABLED;
    else process.env.AMAZON_AFFILIATE_ENABLED = prevEnv;
    if (prevTag === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevTag;
    if (prevDeTag === undefined) delete process.env.AMAZON_ASSOCIATE_TAG_DE;
    else process.env.AMAZON_ASSOCIATE_TAG_DE = prevDeTag;
  }
});

test('Phase 70: 4. Hard shipping requirement to the Netherlands', () => {
  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true
  });

  const baseOffer = {
    part_number: '11301240800',
    asin: 'B00LAHKLBU',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    manufacturer_part_number: '1130-124-0800-SPEZI',
    brand: 'Sägenspezi',
    product_title: 'Sägenspezi Luftfilter',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    compatibility_proof: 'passend für Stihl MS 170',
    asin_product_identity_proof: 'Amazon.de Listing',
    independent_evidence_url: 'https://www.amazon.de/dp/B00LAHKLBU',
    verification_date: '2026-11-09',
    status: 'ACTIVE'
  };

  // Case A: SHIPS_TO_NL_CONFIRMED -> active offer allowed
  const confirmedOffer = { ...baseOffer, shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED' };
  registry.registerOffer(confirmedOffer);
  assert.ok(registry.getActiveOffer('11301240800', 'amazon.de') !== null, 'SHIPS_TO_NL_CONFIRMED must be active');

  // Case B: SHIPPING_UNKNOWN -> fails closed, getActiveOffer returns null
  const unknownOffer = { ...baseOffer, shipping_to_nl_status: 'SHIPPING_UNKNOWN' };
  registry.registerOffer(unknownOffer);
  assert.equal(registry.getActiveOffer('11301240800', 'amazon.de'), null, 'SHIPPING_UNKNOWN must return null');

  // Case C: DOES_NOT_SHIP_TO_NL -> fails closed, getActiveOffer returns null
  const blockedOffer = { ...baseOffer, shipping_to_nl_status: 'DOES_NOT_SHIP_TO_NL' };
  registry.registerOffer(blockedOffer);
  assert.equal(registry.getActiveOffer('11301240800', 'amazon.de'), null, 'DOES_NOT_SHIP_TO_NL must return null');
});

test('Phase 70: 5. Total price calculation architecture', () => {
  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true
  });

  // Case A: item_price + shipping_cost_nl present
  const offerWithShipping = {
    part_number: '11210201200',
    asin: 'B00PGX7STM',
    marketplace: 'amazon.de',
    affiliate_tag: 'srihldecode00-21',
    manufacturer: 'Sägenspezi',
    manufacturer_part_number: '1121-020-1200-SPEZI',
    brand: 'Sägenspezi',
    product_title: 'Sägenspezi Zylinder MS 260',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    compatibility_proof: 'passend für Stihl MS 260',
    asin_product_identity_proof: 'Amazon.de Listing',
    independent_evidence_url: 'https://www.amazon.de/dp/B00PGX7STM',
    verification_date: '2026-11-09',
    status: 'ACTIVE',
    item_price: 59.49,
    shipping_cost_nl: 4.90,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED'
  };
  registry.registerOffer(offerWithShipping);

  const resolved = registry.resolveCommercialOffer({
    partNumber: '11210201200',
    marketplace: 'amazon.de'
  });
  assert.equal(resolved.item_price, 59.49);
  assert.equal(resolved.shipping_cost_nl, 4.90);
  assert.equal(resolved.total_price, 64.39, 'total_price must equal 59.49 + 4.90');

  // Case B: shipping unknown -> total_price is null (no fabricated prices)
  const offerNoShipping = {
    ...offerWithShipping,
    shipping_cost_nl: null
  };
  registry.registerOffer(offerNoShipping);
  const resolvedNoShip = registry.resolveCommercialOffer({
    partNumber: '11210201200',
    marketplace: 'amazon.de'
  });
  assert.equal(resolvedNoShip.item_price, 59.49);
  assert.equal(resolvedNoShip.shipping_cost_nl, null);
  assert.equal(resolvedNoShip.total_price, null, 'total_price must be null when shipping unknown');
});

test('Phase 70: 6. Per-marketplace capacity management (no cross-market collision)', () => {
  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true,
    maxActiveOffersPerMarketplace: {
      'amazon.nl': 25,
      'amazon.de': 25
    }
  });

  assert.equal(registry.getMaxActiveOffersAllowed('amazon.nl'), 25);
  assert.equal(registry.getMaxActiveOffersAllowed('amazon.de'), 25);

  registry.importRegistry(registryDoc);

  const nlActive = registry.listOffers({ status: 'ACTIVE', marketplace: 'amazon.nl' });
  const deActive = registry.listOffers({ status: 'ACTIVE', marketplace: 'amazon.de' });

  assert.equal(nlActive.length, 18, 'Dutch active count must be 18');
  assert.equal(deActive.length, 14, 'German active count must be 14');
  assert.ok(nlActive.length <= 25, 'Dutch offers within cap');
  assert.ok(deActive.length <= 25, 'German offers within cap');
});

test('Phase 70: 7. TwoGateVerifier passes all 14 German Sägenspezi offers cleanly', () => {
  const deOffers = registryDoc.offers.filter(o => o.marketplace === 'amazon.de');
  assert.equal(deOffers.length, 14, 'Must evaluate all 14 German Sägenspezi offers');

  for (const offer of deOffers) {
    const v = TwoGateVerifier.verifyOffer(offer, {
      catalogPartMap,
      expectedTag: 'srihldecode00-21'
    });
    assert.equal(v.passed, true, `Offer ${offer.part_number} (${offer.asin}) must pass TwoGateVerifier: ${v.errors.join('; ')}`);
    assert.equal(v.gate1.status, 'PASS');
    assert.equal(v.gate2.status, 'PASS');
    assert.equal(offer.seller_name, 'Sägenspezi');
    assert.equal(offer.seller_id, 'A1GMRJIURBAM28');
    assert.equal(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.ok(catalogPartMap.has(offer.part_number), `Part ${offer.part_number} must exist in canonical catalog`);
  }
});

test('Phase 70: 8. HTML rendering of multi-market offers in PartDetailPageTemplate', () => {
  const partNumber = '11301240800'; // MS 170 air filter
  const canonicalPart = catalogPartMap.get(partNumber);

  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  const provider = new AmazonAffiliateProvider({ verifiedRegistry: registry });
  const prevEnv = process.env.AMAZON_AFFILIATE_ENABLED;
  const prevTag = process.env.AMAZON_ASSOCIATE_TAG;
  try {
    process.env.AMAZON_AFFILIATE_ENABLED = 'true';
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
    const offers = provider.getOffers({ partNumber });

    assert.equal(offers.length, 2);

    const html = renderPartDetailPageHtml({
      partNumber,
      resolved: {
        part_number: partNumber,
        part_name: canonicalPart.part_name,
        models: canonicalPart.models
      },
      offers,
      compatibleModels: [{ model_name: 'MS 170', model_id: 'ms_170' }],
      indexEntry: { is_indexable: true, seo_tier: 'SEO_TIER_A' }
    });

    // Check NL elements
    assert.ok(html.includes('Amazon.nl'), 'Must render Amazon.nl in card');
    assert.ok(html.includes('srihldecoder2-21'), 'Must include Dutch tag in URL');

    // Check DE elements
    assert.ok(html.includes('Amazon.de'), 'Must render Amazon.de in card');
    assert.ok(html.includes('srihldecode00-21'), 'Must include German tag in URL');
    assert.ok(html.includes('Verkoper: Sägenspezi') || html.includes('Sägenspezi'), 'Must render Sägenspezi as seller');
    assert.ok(html.includes('Verzending naar NL bevestigd'), 'Must render shipping to NL confirmed badge');
    assert.ok(html.includes('data-placement="verified_product_card_de"'), 'Must have distinct DE placement attribute');
  } finally {
    if (prevEnv === undefined) delete process.env.AMAZON_AFFILIATE_ENABLED;
    else process.env.AMAZON_AFFILIATE_ENABLED = prevEnv;
    if (prevTag === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevTag;
  }
});

test('Phase 70: 9. Individual Kill-Switch & isolated status rollback', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  const partNumber = '11301240800';

  // Suspend the German offer only
  const suspRes = registry.suspendOffer(partNumber, 'Test German suspension', {
    marketplace: 'amazon.de',
    asin: 'B00LAHKLBU'
  });
  assert.equal(suspRes.success, true);
  assert.equal(suspRes.offer.status, 'SUSPENDED');

  // Verify Dutch offer is unaffected
  const nlActive = registry.getActiveOffer(partNumber, 'amazon.nl');
  assert.ok(nlActive !== null, 'Dutch offer must remain ACTIVE');
  assert.equal(nlActive.status, 'ACTIVE');

  // Verify German offer is no longer active
  const deActive = registry.getActiveOffer(partNumber, 'amazon.de');
  assert.equal(deActive, null, 'German offer must now be null (suspended)');

  // Reactivate German offer
  const actRes = registry.activateOffer(partNumber, 'Reactivated', {
    marketplace: 'amazon.de',
    asin: 'B00LAHKLBU'
  });
  assert.equal(actRes.success, true);
  assert.equal(actRes.offer.status, 'ACTIVE');
  assert.ok(registry.getActiveOffer(partNumber, 'amazon.de') !== null);
});
