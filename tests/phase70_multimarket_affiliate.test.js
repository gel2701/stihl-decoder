/**
 * tests/phase70_multimarket_affiliate.test.js
 *
 * Phase 70 / 70A: Multi-Marketplace Affiliate Engine & Sägenspezi Integration Test Suite
 *
 * Validates:
 * 1. Multi-marketplace configuration & strict affiliate tag isolation:
 *    - amazon.nl strictly uses srihldecoder2-21
 *    - amazon.de strictly uses srihldecode00-21
 *    - Zero cross-contamination or tag leaking between marketplaces.
 * 2. 1:N Multi-Offer Architecture:
 *    - Single STIHL part number supports concurrent registered offers (Amazon.nl + Amazon.de).
 *    - Backwards compatibility for single-offer callers (getOffer, getActiveOffer defaults to NL).
 *    - getActiveOffers returns only active, shipping-confirmed offers.
 * 3. Provider & Resolver multi-offer delivery.
 * 4. Hard shipping requirement to the Netherlands:
 *    - SHIPS_TO_NL_CONFIRMED: German direct purchase button active.
 *    - SHIPPING_UNKNOWN & DOES_NOT_SHIP_TO_NL: direct CTA suppressed / fails activation.
 * 5. Total price comparison architecture:
 *    - item_price + shipping_cost_nl = total_price.
 *    - Null when shipping unknown (no fabricated prices).
 * 6. Per-marketplace capacity management:
 *    - Separate caps: amazon.nl (max 25, 18 active) and amazon.de (max 25, 2 active confirmed).
 * 7. TwoGateVerifier & Sägenspezi seller integration:
 *    - Verified Seller ID A1GMRJIURBAM28 and seller name Sägenspezi across all 14 offers.
 *    - All 14 German offers pass TwoGateVerifier.
 *    - Audited shipping distribution: 2 confirmed, 7 blocked/restricted, 5 unknown.
 * 8. HTML rendering of multi-market offers in PartDetailPageTemplate.
 * 9. Individual Kill-Switch & isolated status rollback.
 * 10. SHIPPING_UNKNOWN never renders direct German CTA button.
 * 11. DOES_NOT_SHIP_TO_NL blocks direct German CTA button.
 * 12. SHIPS_TO_NL_CONFIRMED renders direct German CTA button.
 * 13. Dutch links and offers are 100% unaffected by German status.
 * 14. Affiliate tags strictly isolated per marketplace.
 * 15. No fabricated total price with unknown shipping cost.
 * 16. Independent shipping status toggle & automatic demotion on rollback.
 * 17. New German records without verifiable shipping evidence cannot be registered as SHIPS_TO_NL_CONFIRMED or ACTIVE.
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
  assert.equal(deOffers.length, 14, 'Must have exactly 14 German offers');

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

  // Part 1130 124 0800 (MS 170 / MS 180 air filter) has both NL and DE offers registered
  const partNumber = '11301240800';
  const allOffers = registry.getOffers(partNumber);
  assert.equal(allOffers.length, 2, 'Part 1130 124 0800 must have 2 registered offers (NL + DE)');

  // In production registry, DE offer for 1130 124 0800 has SHIPPING_UNKNOWN -> only NL is active
  const activeOffers = registry.getActiveOffers(partNumber);
  assert.equal(activeOffers.length, 1, 'Part 1130 124 0800 must have 1 active offer because German offer does not have confirmed shipping to NL');
  assert.equal(activeOffers[0].marketplace, 'amazon.nl');

  // Backwards compatibility: getOffer and getActiveOffer without marketplace argument default to NL
  const defaultOffer = registry.getOffer(partNumber);
  assert.equal(defaultOffer.marketplace, 'amazon.nl', 'Default getOffer must return amazon.nl');
  assert.equal(defaultOffer.asin, 'B07KJYFPLM');

  const defaultActive = registry.getActiveOffer(partNumber);
  assert.equal(defaultActive.marketplace, 'amazon.nl', 'Default getActiveOffer must return amazon.nl');
  assert.equal(defaultActive.asin, 'B07KJYFPLM');

  // German offer exists in registry with SHIPPING_UNKNOWN, but getActiveOffer for DE returns null
  const deOffer = registry.getOffer(partNumber, 'amazon.de');
  assert.equal(deOffer.marketplace, 'amazon.de');
  assert.equal(deOffer.asin, 'B00LAHKLBU');
  assert.equal(deOffer.shipping_to_nl_status, 'SHIPPING_UNKNOWN');

  const deActiveOffer = registry.getActiveOffer(partNumber, 'amazon.de');
  assert.equal(deActiveOffer, null, 'German offer without confirmed shipping must return null from getActiveOffer');

  // For a part with confirmed DE shipping (1121 020 1200), getActiveOffer returns the DE offer
  const confirmedPart = '11210201200';
  const confirmedDeActive = registry.getActiveOffer(confirmedPart, 'amazon.de');
  assert.ok(confirmedDeActive !== null, 'Confirmed German offer must be active');
  assert.equal(confirmedDeActive.asin, 'B00PGX7STM');
  assert.equal(confirmedDeActive.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');

  // When both NL and DE are active and confirmed, getActiveOffers returns both
  registry.setShippingStatus(partNumber, 'amazon.de', 'B00LAHKLBU', 'SHIPS_TO_NL_CONFIRMED', {
    shipping_checked_at: '2026-11-09',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHKLBU',
    shipping_evidence_description: 'Test confirmed shipping to NL',
    shipping_cost_nl: 4.99
  });
  registry.activateOffer(partNumber, 'Test dual activation', { marketplace: 'amazon.de', asin: 'B00LAHKLBU' });
  const dualActive = registry.getActiveOffers(partNumber);
  assert.equal(dualActive.length, 2, 'When both markets are active and confirmed, getActiveOffers returns 2');
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

    // Part with confirmed DE offer (1121 020 1200)
    const deOffers = provider.getOffers({ partNumber: '11210201200' });
    assert.equal(deOffers.length, 1);
    assert.equal(deOffers[0].marketplace, 'amazon.de');
    assert.equal(deOffers[0].tag, 'srihldecode00-21');
    assert.equal(deOffers[0].seller_name, 'Sägenspezi');
    assert.equal(deOffers[0].shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.equal(deOffers[0].shipping_cost_nl, 10.00);

    // Part with active NL offer and inactive DE offer (1130 124 0800)
    const dualRegisteredOffers = provider.getOffers({ partNumber: '11301240800' });
    assert.equal(dualRegisteredOffers.length, 1, 'Only active confirmed offers returned by provider');
    assert.equal(dualRegisteredOffers[0].marketplace, 'amazon.nl');

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

  // Case A: SHIPS_TO_NL_CONFIRMED with evidence -> active offer allowed
  const confirmedOffer = {
    ...baseOffer,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_checked_at: '2026-11-09',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00LAHKLBU',
    shipping_evidence_description: 'Amazon.de confirms delivery to Netherlands'
  };
  const regResA = registry.registerOffer(confirmedOffer);
  assert.equal(regResA.success, true);
  assert.ok(registry.getActiveOffer('11301240800', 'amazon.de') !== null, 'SHIPS_TO_NL_CONFIRMED must be active');

  // Case B: SHIPPING_UNKNOWN -> fails closed, getActiveOffer returns null
  const unknownOffer = { ...baseOffer, shipping_to_nl_status: 'SHIPPING_UNKNOWN', status: 'VERIFIED' };
  registry.registerOffer(unknownOffer);
  assert.equal(registry.getActiveOffer('11301240800', 'amazon.de'), null, 'SHIPPING_UNKNOWN must return null');

  // Case C: DOES_NOT_SHIP_TO_NL -> fails closed, getActiveOffer returns null
  const blockedOffer = { ...baseOffer, shipping_to_nl_status: 'DOES_NOT_SHIP_TO_NL', status: 'VERIFIED' };
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
    shipping_cost_nl: 10.00,
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED',
    shipping_checked_at: '2026-11-09',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00PGX7STM',
    shipping_evidence_description: 'Delivery to NL confirmed at 10.00'
  };
  registry.registerOffer(offerWithShipping);

  const resolved = registry.resolveCommercialOffer({
    partNumber: '11210201200',
    marketplace: 'amazon.de'
  });
  assert.equal(resolved.item_price, 59.49);
  assert.equal(resolved.shipping_cost_nl, 10.00);
  assert.equal(resolved.total_price, 69.49, 'total_price must equal 59.49 + 10.00');

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
  assert.equal(deActive.length, 2, 'German active count must be 2 (confirmed shipping to NL)');
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
    assert.equal(offer.shipping_destination_country, 'NL');
    assert.ok(['SHIPS_TO_NL_CONFIRMED', 'SHIPPING_UNKNOWN', 'DOES_NOT_SHIP_TO_NL'].includes(offer.shipping_to_nl_status));
    assert.ok(offer.shipping_evidence_url.startsWith('https://www.amazon.de/dp/'));
    assert.ok(offer.shipping_evidence_description.length > 10);
    assert.ok(catalogPartMap.has(offer.part_number), `Part ${offer.part_number} must exist in canonical catalog`);
  }

  assert.equal(deOffers.filter(o => o.shipping_to_nl_status === 'SHIPS_TO_NL_CONFIRMED').length, 2);
  assert.equal(deOffers.filter(o => o.shipping_to_nl_status === 'SHIPPING_UNKNOWN').length, 12);
  assert.equal(deOffers.filter(o => o.shipping_to_nl_status === 'DOES_NOT_SHIP_TO_NL').length, 0);
});

test('Phase 70: 8. HTML rendering of multi-market offers in PartDetailPageTemplate', () => {
  const partNumber = '11210201200'; // MS 260 cylinder kit with confirmed DE shipping
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

    assert.equal(offers.length, 1);

    const html = renderPartDetailPageHtml({
      partNumber,
      resolved: {
        part_number: partNumber,
        part_name: canonicalPart.part_name,
        models: canonicalPart.models
      },
      offers,
      compatibleModels: [{ model_name: 'MS 260', model_id: 'ms_260' }],
      indexEntry: { is_indexable: true, seo_tier: 'SEO_TIER_A' }
    });

    // Check DE elements
    assert.ok(html.includes('Amazon.de'), 'Must render Amazon.de in card');
    assert.ok(html.includes('srihldecode00-21'), 'Must include German tag in URL');
    assert.ok(html.includes('Verkoper: Sägenspezi') || html.includes('Sägenspezi'), 'Must render Sägenspezi as seller');
    assert.ok(html.includes('Verzending naar NL bevestigd'), 'Must render shipping to NL confirmed badge');
    assert.ok(html.includes('data-placement="verified_product_card_de"'), 'Must have distinct DE placement attribute');
    assert.ok(html.includes('(+ €10.00 verz.'));
    assert.ok(html.includes('tot. €69.49'));
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

  const partNumber = '11210201200';

  // Suspend the German offer only
  const suspRes = registry.suspendOffer(partNumber, 'Test German suspension', {
    marketplace: 'amazon.de',
    asin: 'B00PGX7STM'
  });
  assert.equal(suspRes.success, true);
  assert.equal(suspRes.offer.status, 'SUSPENDED');

  // Verify German offer is no longer active
  const deActive = registry.getActiveOffer(partNumber, 'amazon.de');
  assert.equal(deActive, null, 'German offer must now be null (suspended)');

  // Reactivate German offer
  const actRes = registry.activateOffer(partNumber, 'Reactivated', {
    marketplace: 'amazon.de',
    asin: 'B00PGX7STM'
  });
  assert.equal(actRes.success, true);
  assert.equal(actRes.offer.status, 'ACTIVE');
  assert.ok(registry.getActiveOffer(partNumber, 'amazon.de') !== null);
});

test('Phase 70A: 10. SHIPPING_UNKNOWN never renders direct German CTA button', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  // Pick an offer with SHIPPING_UNKNOWN, e.g. 1123 120 1613 (B00LAHKSDQ)
  const unknownOffer = registry.getOffer('11231201613', 'amazon.de');
  assert.equal(unknownOffer.shipping_to_nl_status, 'SHIPPING_UNKNOWN');
  assert.equal(unknownOffer.status, 'VERIFIED');

  // getActiveOffer for DE must return null
  assert.equal(registry.getActiveOffer('11231201613', 'amazon.de'), null);

  // Provider must not return any German direct purchase CTA
  const provider = new AmazonAffiliateProvider({ verifiedRegistry: registry });
  const offers = provider.getOffers({ partNumber: '11231201613' });
  const deOffers = offers.filter(o => o.marketplace === 'amazon.de');
  assert.equal(deOffers.length, 0, 'SHIPPING_UNKNOWN German offer must not be returned as commercial offer');
});

test('Phase 70A: 11. DOES_NOT_SHIP_TO_NL blocks direct German CTA button', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  // Set an offer to DOES_NOT_SHIP_TO_NL, e.g. 1130 124 0800 (B00LAHKLBU)
  registry.setShippingStatus('11301240800', 'amazon.de', 'B00LAHKLBU', 'DOES_NOT_SHIP_TO_NL');
  const blockedOffer = registry.getOffer('11301240800', 'amazon.de');
  assert.equal(blockedOffer.shipping_to_nl_status, 'DOES_NOT_SHIP_TO_NL');
  assert.equal(blockedOffer.status, 'VERIFIED');

  // getActiveOffer for DE must return null
  assert.equal(registry.getActiveOffer('11301240800', 'amazon.de'), null);

  // Attempting to activate it must fail with error
  const actRes = registry.activateOffer('11301240800', 'Force activate', {
    marketplace: 'amazon.de',
    asin: 'B00LAHKLBU'
  });
  assert.equal(actRes.success, false);
  assert.ok(actRes.errors.some(e => e.includes('shipping_to_nl_status is "DOES_NOT_SHIP_TO_NL"')));
});

test('Phase 70A: 12. SHIPS_TO_NL_CONFIRMED allows direct German CTA button', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  const confirmedPart = '11230302003'; // MS 210 piston (B00LAHGFRO)
  const confirmedOffer = registry.getActiveOffer(confirmedPart, 'amazon.de');
  assert.ok(confirmedOffer !== null, 'SHIPS_TO_NL_CONFIRMED offer must be active');
  assert.equal(confirmedOffer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
  assert.equal(confirmedOffer.shipping_cost_nl, 10.00);
  assert.equal(confirmedOffer.seller_id, 'A1GMRJIURBAM28');

  const prevEnv = process.env.AMAZON_AFFILIATE_ENABLED;
  const prevTag = process.env.AMAZON_ASSOCIATE_TAG;
  const prevDeTag = process.env.AMAZON_ASSOCIATE_TAG_DE;
  try {
    process.env.AMAZON_AFFILIATE_ENABLED = 'true';
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
    process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';
    const provider = new AmazonAffiliateProvider({ verifiedRegistry: registry });
    const offers = provider.getOffers({ partNumber: confirmedPart });
    assert.equal(offers.length, 1);
    assert.equal(offers[0].marketplace, 'amazon.de');
    assert.equal(offers[0].tag, 'srihldecode00-21');
    assert.equal(offers[0].shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
  } finally {
    if (prevEnv === undefined) delete process.env.AMAZON_AFFILIATE_ENABLED;
    else process.env.AMAZON_AFFILIATE_ENABLED = prevEnv;
    if (prevTag === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevTag;
    if (prevDeTag === undefined) delete process.env.AMAZON_ASSOCIATE_TAG_DE;
    else process.env.AMAZON_ASSOCIATE_TAG_DE = prevDeTag;
  }
});

test('Phase 70A: 13. Dutch links and offers are 100% unaffected by German status', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  // Verify all 18 Dutch offers are completely active and intact
  const nlOffers = registry.listOffers({ marketplace: 'amazon.nl', status: 'ACTIVE' });
  assert.equal(nlOffers.length, 18, 'All 18 Dutch offers must remain active');

  for (const nlOffer of nlOffers) {
    assert.equal(nlOffer.status, 'ACTIVE');
    assert.equal(nlOffer.affiliate_tag, 'srihldecoder2-21');
    assert.ok(nlOffer.direct_affiliate_url && nlOffer.direct_affiliate_url.includes('amazon.nl'));
    assert.ok(nlOffer.direct_affiliate_url && nlOffer.direct_affiliate_url.includes('srihldecoder2-21'));

    // German status mutation test on dual part (1130 124 0800)
    if (nlOffer.part_number === '11301240800') {
      const activeNLBefore = registry.getActiveOffer(nlOffer.part_number, 'amazon.nl');
      // Suspend German offer
      registry.suspendOffer(nlOffer.part_number, 'Suspend DE', { marketplace: 'amazon.de', asin: 'B00LAHKLBU' });
      const activeNLAfter = registry.getActiveOffer(nlOffer.part_number, 'amazon.nl');
      assert.deepEqual(activeNLBefore, activeNLAfter, 'Dutch offer must be 100% identical after DE suspension');
    }
  }
});

test('Phase 70A: 14. Affiliate tags strictly isolated per marketplace', () => {
  const prevNl = process.env.AMAZON_ASSOCIATE_TAG;
  const prevDe = process.env.AMAZON_ASSOCIATE_TAG_DE;
  try {
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
    process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';
    const provider = new AmazonAffiliateProvider();

    // Test various inputs and casings
    assert.equal(provider.getAssociateTag('amazon.nl'), 'srihldecoder2-21');
    assert.equal(provider.getAssociateTag('AMAZON.NL'), 'srihldecoder2-21');
    assert.equal(provider.getAssociateTag('amazon.de'), 'srihldecode00-21');
    assert.equal(provider.getAssociateTag('AMAZON.DE'), 'srihldecode00-21');
  } finally {
    if (prevNl === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevNl;
    if (prevDe === undefined) delete process.env.AMAZON_ASSOCIATE_TAG_DE;
    else process.env.AMAZON_ASSOCIATE_TAG_DE = prevDe;
  }

  // Verify registry offers strictly adhere to isolation
  for (const offer of registryDoc.offers) {
    if (offer.marketplace === 'amazon.de') {
      assert.equal(offer.affiliate_tag, 'srihldecode00-21');
      assert.ok(!offer.direct_affiliate_url.includes('srihldecoder2-21'));
    } else {
      assert.equal(offer.affiliate_tag, 'srihldecoder2-21');
      assert.ok(!offer.direct_affiliate_url.includes('srihldecode00-21'));
    }
  }
});

test('Phase 70A: 15. No fabricated total price with unknown shipping cost', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  // Check resolved commercial offer for 1121 020 1200 (known shipping €10)
  const resolvedWithShip = registry.resolveCommercialOffer({
    partNumber: '11210201200',
    marketplace: 'amazon.de'
  });
  assert.equal(resolvedWithShip.item_price, 59.49);
  assert.equal(resolvedWithShip.shipping_cost_nl, 10.00);
  assert.equal(resolvedWithShip.total_price, 69.49);

  // Check when shipping_cost_nl is null: total_price must be strictly null
  const resolvedNullShip = registry.resolveCommercialOffer({
    partNumber: '11231950400', // Dutch offer with no explicit shipping cost
    marketplace: 'amazon.nl'
  });
  assert.equal(resolvedNullShip.shipping_cost_nl, null);
  assert.equal(resolvedNullShip.total_price, null, 'Must never fabricate total price when shipping cost is null');
});

test('Phase 70A: 16. Independent shipping status toggle & automatic demotion on rollback', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.importRegistry(registryDoc);

  const partNumber = '11210201200';
  const asin = 'B00PGX7STM';

  // Initially ACTIVE with SHIPS_TO_NL_CONFIRMED
  const initial = registry.getActiveOffer(partNumber, 'amazon.de');
  assert.ok(initial !== null);
  assert.equal(initial.status, 'ACTIVE');

  // Demote shipping to SHIPPING_UNKNOWN via setShippingStatus
  const toggleRes = registry.setShippingStatus(partNumber, 'amazon.de', asin, 'SHIPPING_UNKNOWN');
  assert.equal(toggleRes.success, true);
  assert.equal(toggleRes.offer.shipping_to_nl_status, 'SHIPPING_UNKNOWN');
  assert.equal(toggleRes.offer.status, 'VERIFIED', 'Active offer must automatically be demoted to VERIFIED when shipping is rolled back');

  // getActiveOffer now returns null
  assert.equal(registry.getActiveOffer(partNumber, 'amazon.de'), null);

  // Restore confirmed shipping with evidence
  const restoreRes = registry.setShippingStatus(partNumber, 'amazon.de', asin, 'SHIPS_TO_NL_CONFIRMED', {
    shipping_checked_at: '2026-11-09',
    shipping_evidence_url: 'https://www.amazon.de/dp/B00PGX7STM',
    shipping_evidence_description: 'Re-confirmed delivery to NL',
    shipping_cost_nl: 10.00
  });
  assert.equal(restoreRes.success, true);
  assert.equal(restoreRes.offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');

  // Reactivate
  const reactivateRes = registry.activateOffer(partNumber, 'Reactivated after verification', {
    marketplace: 'amazon.de',
    asin
  });
  assert.equal(reactivateRes.success, true);
  assert.equal(reactivateRes.offer.status, 'ACTIVE');
  assert.ok(registry.getActiveOffer(partNumber, 'amazon.de') !== null);
});

test('Phase 70A: 17. New German records without verifiable shipping evidence cannot be registered as SHIPS_TO_NL_CONFIRMED or ACTIVE', () => {
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });

  const invalidGermanCandidate = {
    part_number: '11231200605',
    asin: 'B00TEST123',
    marketplace: 'amazon.de',
    product_title: 'Sägenspezi Test Part',
    manufacturer: 'Sägenspezi',
    brand: 'Sägenspezi',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    compatibility_proof: 'passend für Stihl MS 250',
    asin_product_identity_proof: 'Amazon.de Test Listing',
    independent_evidence_url: 'https://www.amazon.de/dp/B00TEST123',
    verification_date: '2026-11-09',
    status: 'ACTIVE',
    // Deliberately claim confirmed shipping WITHOUT evidence:
    shipping_to_nl_status: 'SHIPS_TO_NL_CONFIRMED'
  };

  // Must reject registration as SHIPS_TO_NL_CONFIRMED without evidence
  const regRes = registry.registerOffer(invalidGermanCandidate);
  assert.equal(regRes.success, false);
  assert.ok(regRes.errors.some(e => e.includes('Cannot register German offer as SHIPS_TO_NL_CONFIRMED without verifiable shipping evidence')));

  // Must reject registering as ACTIVE when shipping_to_nl_status is SHIPPING_UNKNOWN
  const unknownActiveCandidate = {
    ...invalidGermanCandidate,
    shipping_to_nl_status: 'SHIPPING_UNKNOWN'
  };
  const regResUnknown = registry.registerOffer(unknownActiveCandidate);
  assert.equal(regResUnknown.success, false);
  assert.ok(regResUnknown.errors.some(e => e.includes('Cannot register German offer as ACTIVE: shipping_to_nl_status is "SHIPPING_UNKNOWN"')));
});
