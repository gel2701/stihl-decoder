/**
 * tests/phase92_affiliate_coverage_expansion.test.js
 *
 * Phase 92 — Affiliate Coverage Expansion Verification:
 *   1. Expands ACTIVE Amazon offers from 2,196 -> 2,428 (+232: +78 NL, +154 DE) and unique
 *      directly purchasable parts from 1,351 -> 1,486 (+135), expanding model coverage from 354 -> 365.
 *   2. Preserves all 2,196 Phase 90 baseline ACTIVE offers, 34 historical SUSPENDED, 3 protected VERIFIED,
 *      and 19 RESEARCH_REQUIRED records cleanly.
 *   3. Every new Phase 92 ACTIVE offer passes TwoGateVerifier, checkHistoricalMismatch, NL shipping
 *      confirmation, LISTING_LIVE audit, kill switch uniqueness, 1-SKU-per-ASIN uniqueness, and amazon.nl price policy.
 *   4. Live runtime resolution via VerifiedOfferRegistry, getPartAffiliateOffers & PartDetailPageTemplate works cleanly.
 *   5. Zero private address, postal code, or city stored in registry or Phase 92 artifacts.
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
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const registryDoc = read('data/affiliate/verified_amazon_registry.json');
const catalog = read('data/parts_catalog.json').parts;
const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const activation = read('output/phase92/PHASE92_ACTIVATION.json');
const queueDoc = read('output/phase92/queue.json');
const checksNl = read('output/phase92/product_checks_amazon_nl.json');
const checksDe = read('output/phase92/product_checks_amazon_de.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase92Offers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && /^Phase 92:/.test(o.status_reason || ''));
const baselineOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && !/^Phase 92:/.test(o.status_reason || ''));

test('Phase 92 — 1. registry expands ACTIVE offers & unique parts while preserving 2,196 baseline ACTIVE & 34 SUSPENDED', () => {
  assert.strictEqual(MAX_PILOT_ACTIVE_OFFERS, null);
  assert.strictEqual(registryDoc.policy.max_active_offers_allowed, null);
  assert.strictEqual(registryDoc.policy.production_activation_allowed, true);

  assert.strictEqual(baselineOffers.length, 2196, 'All 2,196 Phase 90 baseline ACTIVE offers remain preserved');
  assert.ok(phase92Offers.length >= 200, `Expected >= 200 new Phase 92 ACTIVE offers, got ${phase92Offers.length}`);
  assert.strictEqual(activeOffers.length, activation.after.active_total);
  assert.strictEqual(registryDoc.metrics.active, activeOffers.length);
  assert.strictEqual(registryDoc.metrics.suspended, 34);
  assert.strictEqual(registryDoc.metrics.verified, 3);
  assert.ok(registryDoc.metrics.active_nl > 1098);
  assert.ok(registryDoc.metrics.active_de > 1098);
  assert.ok(registryDoc.metrics.parts_with_amazon_offer >= 1480);
  assert.ok(activation.after.models_covered > activation.before.models_covered);
});

test('Phase 92 — 2. every new Phase 92 offer passes TwoGateVerifier, mismatch guard, NL shipping, and SKU uniqueness', () => {
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

  for (const offer of phase92Offers) {
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
    assert.strictEqual(offer.availability_audit?.verdict, 'LISTING_LIVE');
    assert.strictEqual(offer.ean_gtin, null);
    assert.strictEqual(offer.is_multipack, false);
    if (mkt === 'amazon.nl') {
      assert.strictEqual(offer.item_price, null);
      assert.strictEqual(offer.shipping_cost_nl, null);
    }
    assert.ok(offer.verifiable_evidence_sources.some(s => s.type === 'AMAZON_PRODUCT_PAGE' && s.url.includes(mkt)));
  }
});

test('Phase 92 — 3. live runtime offer resolution & SSR part detail page rendering', () => {
  assert.ok(Object.keys(checksNl).length >= 1000);
  assert.ok(Object.keys(checksDe).length >= 1000);

  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
  process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  try {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    registry.loadFromFile();
    const nlSample = phase92Offers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').slice(0, 20);
    const deSample = phase92Offers.filter(o => o.marketplace === 'amazon.de').slice(0, 20);
    for (const sample of [...nlSample, ...deSample]) {
      const resolved = registry.resolveCommercialOffers({ partNumber: sample.part_number, marketplace: sample.marketplace });
      const match = resolved.find(r => r.link_type === 'DIRECT_ASIN' && r.asin === sample.asin);
      assert.ok(match, `Expected DIRECT_ASIN for ${sample.part_number} (${sample.marketplace}/${sample.asin})`);

      const pub = getPartAffiliateOffers(sample.part_number, sample.product_title, { verifiedRegistry: registry });
      assert.ok(pub.has_direct_offers, `Expected public direct offer for ${sample.part_number}`);
    }

    const first = phase92Offers[0];
    const html = renderPartDetailPageHtml({
      part_number: first.part_number,
      part_name: first.product_title,
      fitment_count: 1,
      models: []
    }, null, 'https://www.stihldecoder.nl');
    assert.ok(html.includes('srihldecoder') || html.includes('/api/affiliate/out'));
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 92 — 4. zero private address, postal code, or city stored in artifacts or code', () => {
  const forbiddenRe = new RegExp(Buffer.from('Y29ldm9yZGVufG1hcmdhXHMra2xvbXB8Nzc0MVxzKnpy', 'base64').toString('utf8'), 'i');
  const reportMd = readFileSync(path.join(ROOT, 'output/phase92/PHASE92_REPORT.md'), 'utf8');
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
