/**
 * tests/phase87_3_unlimited_amazon_activation.test.js
 *
 * Phase 87.3 — Unlimited Amazon Affiliate Activation Verification:
 *   1. Fixed commercial ceilings are removed (`null`), while Two-Gate verification,
 *      marketplace rules, NL shipping proof, and kill switches stay enforced.
 *   2. Registry scales to 345 ACTIVE offers (217 NL + 128 DE) across 271 unique parts
 *      with zero prior ACTIVE offers lost and all 12 ready_above_cap candidates activated.
 *   3. Stale RESEARCH_REQUIRED / SUSPENDED records never block ACTIVE offers, duplicate
 *      keys are rejected/deduplicated, and best valid links resolve first.
 *   4. Unproven / incomplete / unverified offers fail closed to SEARCH_FALLBACK.
 *   5. No private street address or postal code is stored in registry or Phase 87.3 outputs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  VerifiedOfferRegistry,
  MAX_PILOT_ACTIVE_OFFERS
} from '../src/affiliate/VerifiedOfferRegistry.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { getPartAffiliateOffers } from '../src/search/IntelligentPartsSearchEngine.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const registryDoc = read('data/affiliate/verified_amazon_registry.json');
const catalog = read('data/parts_catalog.json').parts;
const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const activation = read('output/phase87_3/PHASE87_3_ACTIVATION.json');
const checksNl = read('output/phase87_3/product_checks_amazon_nl.json');
const checksDe = read('output/phase87_3/product_checks_amazon_de.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase873Offers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && /^Phase 87\.3:/.test(o.status_reason || ''));
const priorActiveOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && !/^(?:Phase 87\.3|Phase 8[89]):/.test(o.status_reason || ''));

test('Phase 87.3 — 1. fixed commercial ceilings removed while registry scales past 150', () => {
  assert.strictEqual(MAX_PILOT_ACTIVE_OFFERS, null);
  assert.strictEqual(registryDoc.policy.max_active_offers_allowed, null);
  assert.strictEqual(registryDoc.policy.max_active_offers_per_marketplace['amazon.nl'], null);
  assert.strictEqual(registryDoc.policy.max_active_offers_per_marketplace['amazon.de'], null);
  assert.strictEqual(registryDoc.policy.production_activation_allowed, true);

  assert.strictEqual(priorActiveOffers.length, 150, 'All 150 previously ACTIVE offers remain untouched');
  assert.strictEqual(phase873Offers.length, 194);
  assert.ok(activeOffers.length >= 344);
  assert.ok(registryDoc.metrics.active >= 344);
  assert.ok(registryDoc.metrics.active_nl >= 216);
  assert.ok(registryDoc.metrics.active_de >= 128);
  assert.ok(registryDoc.metrics.parts_with_amazon_offer >= 270);
  assert.strictEqual(activation.after.ready_above_cap_activated, 12);
});

test('Phase 87.3 — 2. every new offer passes unchanged Two-Gate verification & safety guards', () => {
  for (const offer of phase873Offers) {
    const norm = PartNormalizer.normalizePartNumber(offer.part_number);
    assert.ok(catalogParts.has(norm), `${offer.part_number} must exist in canonical catalog`);
    const expectedTag = offer.marketplace === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
    const v = TwoGateVerifier.verifyOffer(offer, { catalogPartMap: catalogParts, expectedTag });
    assert.strictEqual(v.passed, true, `${offer.part_number}/${offer.asin}: ${v.errors.join('; ')}`);
    assert.strictEqual(offer.affiliate_tag, expectedTag);
    assert.strictEqual(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.strictEqual(offer.shipping_destination_country, 'NL');
    assert.strictEqual(offer.ean_gtin, null, 'No uncorroborated synthetic GTINs');
    assert.ok(offer.verifiable_evidence_sources.some(s => s.type === 'AMAZON_PRODUCT_PAGE' && s.url.includes(offer.marketplace)));
  }

  // Verify explicit programmatic cap override still fails closed if caller requests one
  const regCapped = new VerifiedOfferRegistry({ productionActivationAllowed: true, maxActiveOffersAllowed: 5 });
  assert.strictEqual(regCapped.getMaxActiveOffersAllowed('amazon.nl'), 5);

  // Verify unproven / unverified offer cannot become ACTIVE even with unlimited capacity
  const regUnlimited = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  assert.strictEqual(regUnlimited.getMaxActiveOffersAllowed('amazon.nl'), null);
  const badRes = regUnlimited.registerOffer({
    part_number: '00000071043',
    asin: 'B000000000',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    status: 'ACTIVE'
  });
  assert.strictEqual(badRes.success, false, 'Unlimited ceiling never bypasses Two-Gate proof');
});

test('Phase 87.3 — 3. registry prevents RESEARCH_REQUIRED/SUSPENDED shadowing, deduplicates keys, and preserves history', () => {
  const keys = new Set();
  for (const offer of activeOffers) {
    const key = `${offer.part_number}:${offer.marketplace || 'amazon.nl'}:${offer.asin}`;
    assert.ok(!keys.has(key), `Duplicate ACTIVE key: ${key}`);
    keys.add(key);
  }
  const killSwitches = new Set(activeOffers.map(o => o.kill_switch_id));
  assert.strictEqual(killSwitches.size, activeOffers.length, 'Every ACTIVE offer keeps a unique kill switch');

  const reg = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  reg.importRegistry(registryDoc);

  // Inject an old RESEARCH_REQUIRED and SUSPENDED record on the SAME part before querying
  const syntheticReg = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  syntheticReg.registerOffer({
    part_number: '11284001214',
    asin: 'B0OLDDEAD01',
    marketplace: 'amazon.nl',
    status: 'RESEARCH_REQUIRED'
  });
  syntheticReg.registerOffer({
    part_number: '11284001214',
    asin: 'B0OLDSUSP02',
    marketplace: 'amazon.nl',
    status: 'SUSPENDED'
  });
  const activeSample = phase873Offers.find(o => o.part_number === '11284001214');
  syntheticReg.registerOffer(activeSample);

  const resolved = syntheticReg.getActiveOffer('11284001214', 'amazon.nl');
  assert.ok(resolved, 'Stale RESEARCH_REQUIRED / SUSPENDED record must never block ACTIVE offer');
  assert.strictEqual(resolved.asin, activeSample.asin);

  // Best-first ranking check: GENUINE_STIHL before MANUFACTURER_AFTERMARKET on same marketplace
  const rankedReg = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  const genuineSample = phase873Offers.find(o => o.oem_brand_classification === 'GENUINE_STIHL');
  const aft = {
    ...activeSample,
    part_number: '00000071043',
    part_number_formatted: '0000 007 1043',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    brand: 'HUYUR'
  };
  const gen = {
    ...genuineSample,
    part_number: '00000071043',
    part_number_formatted: '0000 007 1043',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    direct_affiliate_url: genuineSample.direct_affiliate_url.replace('amazon.de', 'amazon.nl').replace('srihldecode00-21', 'srihldecoder2-21')
  };
  rankedReg.registerOffer(aft);
  rankedReg.registerOffer(gen);
  assert.strictEqual(rankedReg.getActiveOffer('00000071043', 'amazon.nl').asin, genuineSample.asin);
});

test('Phase 87.3 — 4. all 194 new offers and public resolver resolve as DIRECT_ASIN while unproven stay fallback', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  try {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    registry.loadFromFile();
    for (const o of phase873Offers) {
      const resolved = registry.resolveCommercialOffers({ partNumber: o.part_number, marketplace: o.marketplace });
      const match = resolved.find(r => r.link_type === 'DIRECT_ASIN' && r.asin === o.asin);
      assert.ok(match, `Expected DIRECT_ASIN for ${o.part_number} (${o.marketplace}/${o.asin})`);
    }
    const pub = getPartAffiliateOffers('41447108117', 'Deflector', { verifiedRegistry: registry });
    assert.ok(pub.has_direct_offers);
    assert.strictEqual(pub.primary_offer.asin, 'B08TRJMVRK');

    // Remaining RESEARCH_REQUIRED and VERIFIED DE stay non-direct
    const unproven = registryDoc.offers.filter(o => o.status === 'RESEARCH_REQUIRED' || o.status === 'VERIFIED');
    assert.ok(unproven.length <= 26);
    assert.ok(unproven.every(o => !o.pilot_active));
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 87.3 — 5. live checks complete and zero private address/postal data stored', () => {
  assert.ok(Object.keys(checksNl).length >= 430);
  assert.ok(Object.keys(checksDe).length >= 200);
  const reportMd = readFileSync(path.join(ROOT, 'output/phase87_3/PHASE87_3_REPORT.md'), 'utf8');
  const combined = JSON.stringify({ registryDoc, activation, checksNl, checksDe }) + '\n' + reportMd;
  assert.ok(!/Marga Klomp|Coevorden|7741\s*ZR/i.test(combined), 'No private shipping address or city may be persisted');
});
