/**
 * Phase 87.2 — Amazon Maximum Activation guards.
 *
 * Verifies:
 * 1. Registry grows from 130 -> 150 ACTIVE offers (100 Amazon.nl + 50 Amazon.de) across
 *    137 unique parts without losing any previously active or suspended record.
 * 2. Every new offer passes the unchanged TwoGateVerifier cleanly with catalog grounding.
 * 3. Correct marketplace tags (srihldecoder2-21 / srihldecode00-21) & NL shipping confirmation.
 * 4. Marketplace safety limits respected (100/100 NL, 50/50 DE).
 * 5. Work queue (500+ unhandled parts) and evidence artifacts complete without private PII/street addresses.
 * 6. Registry loader resolves all 20 new direct ASIN links cleanly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const registryDoc = read('data/affiliate/verified_amazon_registry.json');
const catalog = read('data/parts_catalog.json').parts;
const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const activation = read('output/phase87_2/PHASE87_2_ACTIVATION.json');
const queue = read('output/phase87_2/queue.json');
const nlSearch = read('output/phase87_2/search_hits_amazon_nl.json');
const deSearch = read('output/phase87_2/search_hits_amazon_de.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase872Offers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && /^Phase 87\.2:/.test(o.status_reason || ''));
const previouslyLive = registryDoc.offers.filter(o => o.status === 'ACTIVE' && !/^(?:Phase 87\.[23]|Phase 8[89]|Phase 9[023]):/.test(o.status_reason || ''));

test('Phase 87.2 — 1. registry expands to 150+ ACTIVE offers without losing prior offers', () => {
  assert.ok(registryDoc.offers.length >= 216);
  assert.ok(activeOffers.length >= 150);
  assert.ok(registryDoc.metrics.active >= 150);
  assert.ok(registryDoc.metrics.active_nl >= 100);
  assert.ok(registryDoc.metrics.active_de >= 50);
  assert.ok(registryDoc.metrics.parts_with_amazon_offer >= 137);
  assert.equal(previouslyLive.length, 130, 'All 130 offers that were live before Phase 87.2 stay ACTIVE');
  assert.equal(phase872Offers.length, 20);
  assert.equal(activation.activated_nl, 16);
  assert.equal(activation.activated_de, 4);
  assert.equal(activation.superseded_research_candidates.length, 5);
  const nlCap = registryDoc.policy.max_active_offers_per_marketplace['amazon.nl'];
  const deCap = registryDoc.policy.max_active_offers_per_marketplace['amazon.de'];
  assert.ok(nlCap === null || registryDoc.metrics.active_nl <= nlCap);
  assert.ok(deCap === null || registryDoc.metrics.active_de <= deCap);
});

test('Phase 87.2 — 2. every new offer passes the unchanged TwoGateVerifier', () => {
  for (const offer of phase872Offers) {
    const expectedTag = offer.marketplace === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
    const v = TwoGateVerifier.verifyOffer(offer, { catalogPartMap: catalogParts, expectedTag });
    assert.equal(v.passed, true, `${offer.part_number}/${offer.asin}: ${v.errors.join('; ')}`);
    assert.ok(offer.gate_1_technical?.passed);
    assert.ok(offer.gate_2_product?.passed);
  }
});

test('Phase 87.2 — 3. tags, NL shipping verification and evidence sources', () => {
  for (const offer of phase872Offers) {
    assert.ok(catalogParts.has(PartNormalizer.normalizePartNumber(offer.part_number)));
    const expectedTag = offer.marketplace === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
    assert.equal(offer.affiliate_tag, expectedTag);
    assert.ok(offer.direct_affiliate_url.startsWith(`https://www.${offer.marketplace}/dp/${offer.asin}`));
    assert.ok(offer.direct_affiliate_url.includes(`tag=${expectedTag}`));
    assert.equal(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.equal(offer.shipping_destination_country, 'NL');
    assert.ok(offer.ean_gtin === null, 'No fabricated GTINs');
    const sources = offer.verifiable_evidence_sources || [];
    assert.ok(sources.some(s => s.type === 'AMAZON_PRODUCT_PAGE' && s.url.includes(offer.marketplace)));
  }
});

test('Phase 87.2 — 4. no duplicate keys, distinct kill switches, explicit operator authorization', () => {
  const keys = new Set();
  for (const o of activeOffers) {
    const k = `${o.part_number}:${o.marketplace}:${o.asin}`;
    assert.ok(!keys.has(k), `Duplicate offer ${k}`);
    keys.add(k);
  }
  const killSwitches = new Set(activeOffers.map(o => o.kill_switch_id));
  assert.equal(killSwitches.size, activeOffers.length);
  const whitelist = new Set(registryDoc.policy.pilot_activated_parts);
  for (const o of phase872Offers) {
    assert.ok(whitelist.has(o.part_number), `${o.part_number} must be in pilot_activated_parts`);
  }
});

test('Phase 87.2 — 5. 500+ unhandled parts searched and zero private street address stored', () => {
  assert.equal(queue.next_500.length, 500, 'Queue must hold 500 prioritized unhandled catalog parts');
  assert.ok(Object.keys(nlSearch).length >= 500, 'All 500+ parts searched on Amazon.nl');
  assert.ok(Object.keys(deSearch).length >= 250, 'At least 250 priority parts searched on Amazon.de');
  assert.ok(Array.isArray(activation.ready_above_cap) && activation.ready_above_cap.length >= 10);
  assert.ok(Array.isArray(activation.not_activated) && activation.not_activated.length >= 8);

  const combinedText = JSON.stringify({ registryDoc, activation });
  assert.ok(!/Marga Klomp|Coevorden|7741\s*ZR/i.test(combinedText), 'Private shipping address/postal code must never be stored in registry or artifacts');
});

test('Phase 87.2 — 6. VerifiedOfferRegistry serves all 20 new offers as DIRECT_ASIN', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  try {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    registry.loadFromFile();
    for (const o of phase872Offers) {
      const resolved = registry.resolveCommercialOffers({ partNumber: o.part_number, marketplace: o.marketplace });
      const direct = resolved.filter(r => r.link_type === 'DIRECT_ASIN' && r.asin === o.asin);
      assert.equal(direct.length, 1, `Expected DIRECT_ASIN for ${o.part_number} (${o.marketplace}/${o.asin})`);
    }
  } finally {
    process.env = originalEnv;
  }
});
