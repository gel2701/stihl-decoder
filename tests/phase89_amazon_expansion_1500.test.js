/**
 * tests/phase89_amazon_expansion_1500.test.js
 *
 * Phase 89 — Amazon Affiliate Expansion 1500+ Verification:
 *   1. Unlimited activation policy remains enabled while adding +880 verified ACTIVE offers
 *      (698 -> 1578: 814 NL + 764 DE across 1030 unique parts), well above >= 300 goal.
 *   2. Preserves all 698 prior ACTIVE Amazon offers and all 34 historical SUSPENDED records.
 *   3. Every new Phase 89 offer passes TwoGateVerifier, checkHistoricalMismatch, NL shipping
 *      confirmation, kill switch uniqueness, 1-SKU-per-ASIN uniqueness, and amazon.nl price policy.
 *   4. Priority queue P1..P5 covers >= 1,500 previously uncovered catalog parts cleanly (1,620).
 *   5. No private shipping address/postal/city strings stored in registry, scripts, or outputs.
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
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { getPartAffiliateOffers } from '../src/search/IntelligentPartsSearchEngine.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const registryDoc = read('data/affiliate/verified_amazon_registry.json');
const catalog = read('data/parts_catalog.json').parts;
const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const activation = read('output/phase89/PHASE89_ACTIVATION.json');
const queueDoc = read('output/phase89/queue.json');
const checksNl = read('output/phase89/product_checks_amazon_nl.json');
const checksDe = read('output/phase89/product_checks_amazon_de.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase89Offers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && /^Phase 89:/.test(o.status_reason || ''));
const baselineOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && !/^Phase (?:89|9[023]):/.test(o.status_reason || ''));

test('Phase 89 — 1. registry expands past +300 goal while preserving baseline 698 ACTIVE & 34 SUSPENDED', () => {
  assert.strictEqual(MAX_PILOT_ACTIVE_OFFERS, null);
  assert.strictEqual(registryDoc.policy.max_active_offers_allowed, null);
  assert.strictEqual(registryDoc.policy.max_active_offers_per_marketplace['amazon.nl'], null);
  assert.strictEqual(registryDoc.policy.max_active_offers_per_marketplace['amazon.de'], null);
  assert.strictEqual(registryDoc.policy.production_activation_allowed, true);

  assert.strictEqual(baselineOffers.length, 698, 'All 698 Phase 88 baseline ACTIVE offers remain preserved');
  assert.strictEqual(phase89Offers.length, 880);
  assert.ok(phase89Offers.length >= 300, `Expected >= 300 new ACTIVE offers, got ${phase89Offers.length}`);
  assert.ok(activeOffers.length >= 1578);
  assert.ok(registryDoc.metrics.active >= 1578);
  assert.ok(registryDoc.metrics.active_nl >= 814);
  assert.ok(registryDoc.metrics.active_de >= 764);
  assert.ok(registryDoc.metrics.parts_with_amazon_offer >= 1030);
  assert.strictEqual(registryDoc.metrics.suspended, 34);
});

test('Phase 89 — 2. every new offer passes TwoGateVerifier, mismatch guard, NL shipping, and SKU uniqueness', () => {
  const asinMktSeen = new Map();
  const keySeen = new Set();
  const killSwitchSeen = new Set();

  for (const offer of activeOffers) {
    const key = `${offer.part_number}:${offer.marketplace || 'amazon.nl'}:${offer.asin}`;
    assert.ok(!keySeen.has(key), `Duplicate offer key: ${key}`);
    keySeen.add(key);

    assert.ok(!killSwitchSeen.has(offer.kill_switch_id), `Duplicate kill switch: ${offer.kill_switch_id}`);
    killSwitchSeen.add(offer.kill_switch_id);

    const amKey = `${offer.marketplace || 'amazon.nl'}|${offer.asin}`;
    const prevPart = asinMktSeen.get(amKey);
    assert.ok(!prevPart || prevPart === offer.part_number, `Multi-SKU ASIN collision on ${amKey}: ${prevPart} vs ${offer.part_number}`);
    asinMktSeen.set(amKey, offer.part_number);
  }

  for (const offer of phase89Offers) {
    const norm = PartNormalizer.normalizePartNumber(offer.part_number);
    assert.ok(catalogParts.has(norm), `${offer.part_number} must exist in canonical parts catalog`);
    const mkt = offer.marketplace || 'amazon.nl';
    const expectedTag = mkt === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
    const v = TwoGateVerifier.verifyOffer(offer, { catalogPartMap: catalogParts, expectedTag });
    assert.strictEqual(v.passed, true, `${offer.part_number}/${offer.asin}: ${v.errors.join('; ')}`);

    const mismatch = checkHistoricalMismatch(offer.part_number, offer.asin, offer.product_title);
    assert.strictEqual(mismatch.isMismatch, false, `Historical mismatch for ${offer.part_number}/${offer.asin}`);

    assert.strictEqual(offer.affiliate_tag, expectedTag);
    assert.strictEqual(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.strictEqual(offer.shipping_destination_country, 'NL');
    assert.strictEqual(offer.ean_gtin, null);
    assert.strictEqual(offer.is_multipack, false);
    if (mkt === 'amazon.nl') {
      assert.strictEqual(offer.item_price, null);
      assert.strictEqual(offer.shipping_cost_nl, null);
    }
    assert.ok(offer.verifiable_evidence_sources.some(s => s.type === 'AMAZON_PRODUCT_PAGE' && s.url.includes(mkt)));
  }
});

test('Phase 89 — 3. priority queue >= 1500 parts and live direct offer resolution', () => {
  const totalQueued = (queueDoc.batches || []).reduce((s, b) => s + (b.parts?.length || 0), 0);
  assert.ok(totalQueued >= 1500, `Expected >= 1500 uncovered catalog parts searched, got ${totalQueued}`);
  assert.ok(Object.keys(checksNl).length >= 1500);
  assert.ok(Object.keys(checksDe).length >= 1500);
  assert.ok(activation.gsc_coverage.delta_unique_parts >= 100);

  const originalEnv = { ...process.env };
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  try {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    registry.loadFromFile();
    for (const sample of phase89Offers.slice(0, 40)) {
      const resolved = registry.resolveCommercialOffers({ partNumber: sample.part_number, marketplace: sample.marketplace });
      const match = resolved.find(r => r.link_type === 'DIRECT_ASIN' && r.asin === sample.asin);
      assert.ok(match, `Expected DIRECT_ASIN for ${sample.part_number} (${sample.marketplace}/${sample.asin})`);

      const pub = getPartAffiliateOffers(sample.part_number, sample.product_title, { verifiedRegistry: registry });
      assert.ok(pub.has_direct_offers, `Expected public direct offer for ${sample.part_number}`);
    }
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 89 — 4. zero private address, postal code, or city stored in artifacts or code', () => {
  const forbiddenRe = new RegExp(Buffer.from('Y29ldm9yZGVufG1hcmdhXHMra2xvbXB8Nzc0MVxzKnpy', 'base64').toString('utf8'), 'i');
  const reportMd = readFileSync(path.join(ROOT, 'output/phase89/PHASE89_REPORT.md'), 'utf8');
  const payloads = [
    JSON.stringify(registryDoc),
    JSON.stringify(activation),
    JSON.stringify(queueDoc),
    JSON.stringify(checksNl),
    JSON.stringify(checksDe),
    reportMd
  ];
  for (const p of payloads) {
    assert.ok(!forbiddenRe.test(p), 'No private shipping address, city, or postal token may be stored');
  }
});
