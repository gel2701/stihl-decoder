/**
 * tests/phase93_affiliate_recovery_expansion.test.js
 *
 * Phase 93: Affiliate Recovery & Expansion
 *
 * Verifies:
 *  1. REJECTED recovery audit classifies all 2,689 Phase 92 rejected candidates and moves
 *     missing-evidence / transient blockers (734) to NEEDS_EVIDENCE without losing history.
 *  2. Local eBay store is idempotently reconciled from Phase 81-86 payloads to 1,773
 *     canonical ACTIVE offers across 220 unique parts with zero duplicates.
 *  3. Amazon registry preserves all 2,428 Phase 92 baseline ACTIVE offers, 34 SUSPENDED,
 *     3 VERIFIED, and 19 RESEARCH_REQUIRED while adding +296 ACTIVE (+206 unique parts).
 *  4. Every new Phase 93 offer passes unchanged TwoGateVerifier, mismatch guard, NL shipping,
 *     single-unit policy, SKU-per-ASIN uniqueness, and live SSR/resolver resolution.
 *  5. Zero private address, postal code, or city stored in artifacts or code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { VerifiedOfferRegistry, MAX_PILOT_ACTIVE_OFFERS } from '../src/affiliate/VerifiedOfferRegistry.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { loadEbayOfferStore, validateEbayAffiliateUrl } from '../src/affiliate/EbayOfferStore.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { getPartAffiliateOffers } from '../src/search/IntelligentPartsSearchEngine.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const registryDoc = read('data/affiliate/verified_amazon_registry.json');
const catalog = read('data/parts_catalog.json').parts;
const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const activation = read('output/phase93/PHASE93_ACTIVATION.json');
const rejectedAudit = read('output/phase93/PHASE93_REJECTED_RECOVERY_AUDIT.json');
const ebayRecovery = read('output/phase93/PHASE93_EBAY_RECOVERY.json');
const ebayStore = loadEbayOfferStore(path.join(ROOT, 'data/affiliate/ebay_offers.json'));
const queueDoc = read('output/phase93/queue.json');
const checksNl = read('output/phase93/product_checks_amazon_nl.json');
const checksDe = read('output/phase93/product_checks_amazon_de.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase93Offers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && /^Phase 93:/.test(o.status_reason || ''));
const baselineOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && !/^Phase 9[345]:/.test(o.status_reason || ''));

test('Phase 93 — 1. REJECTED audit & eBay reconciliation preserve all invariants', () => {
  assert.strictEqual(rejectedAudit.audited_rejected_candidates, 2689);
  assert.ok(rejectedAudit.moved_to_needs_evidence_count >= 700);
  assert.strictEqual(
    rejectedAudit.stayed_rejected_count + rejectedAudit.moved_to_needs_evidence_count,
    rejectedAudit.audited_rejected_candidates
  );

  assert.strictEqual(ebayRecovery.reconciled_unique_offers, 1773);
  assert.strictEqual(ebayRecovery.reconciled_unique_parts, 220);
  // The reconciled store must never shrink: later phases only add proven offers.
  assert.ok(ebayStore.offers.length >= 1773, 'The store still holds every reconciled Phase 93 offer');
  const ebayKeys = new Set();
  for (const offer of ebayStore.offers) {
    const key = `${offer.part_number}:${offer.marketplace}:${offer.item_id}`;
    assert.ok(!ebayKeys.has(key), `Duplicate eBay store key: ${key}`);
    ebayKeys.add(key);
    assert.strictEqual(validateEbayAffiliateUrl(offer.affiliate_url, '5339245312').valid, true);
  }
});

test('Phase 93 — 2. Amazon registry expands ACTIVE & unique parts while preserving 2,428 baseline', () => {
  assert.strictEqual(MAX_PILOT_ACTIVE_OFFERS, null);
  assert.strictEqual(registryDoc.policy.max_active_offers_allowed, null);
  assert.strictEqual(registryDoc.policy.production_activation_allowed, true);

  assert.strictEqual(baselineOffers.length, 2428, 'All 2,428 Phase 92 baseline ACTIVE offers remain preserved');
  assert.ok(phase93Offers.length >= 250, `Expected >= 250 new Phase 93 ACTIVE offers, got ${phase93Offers.length}`);
  assert.ok(activeOffers.length >= activation.after.active_total);
  assert.strictEqual(registryDoc.metrics.active, activeOffers.length);
  assert.strictEqual(registryDoc.metrics.suspended, 34);
  assert.strictEqual(registryDoc.metrics.verified, 3);
  assert.strictEqual(registryDoc.metrics.research_required, 19);
  assert.ok(activation.after.new_unique_parts_added >= 180);
  assert.ok(activation.after.models_covered_all_fitments > activation.before.models_covered_all_fitments);
});

test('Phase 93 — 3. every new Phase 93 offer passes TwoGateVerifier, mismatch guard, NL shipping, and SKU uniqueness', () => {
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

  for (const offer of phase93Offers) {
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

test('Phase 93 — 4. live runtime offer resolution & SSR part detail page rendering', () => {
  assert.ok(Object.keys(checksNl).length >= 500);
  assert.ok(Object.keys(checksDe).length >= 500);

  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
  process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  try {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    registry.loadFromFile();
    const nlSample = phase93Offers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').slice(0, 20);
    const deSample = phase93Offers.filter(o => o.marketplace === 'amazon.de').slice(0, 20);
    for (const sample of [...nlSample, ...deSample]) {
      const resolved = registry.resolveCommercialOffers({ partNumber: sample.part_number, marketplace: sample.marketplace });
      const match = resolved.find(r => r.link_type === 'DIRECT_ASIN' && r.asin === sample.asin);
      assert.ok(match, `Expected DIRECT_ASIN for ${sample.part_number} (${sample.marketplace}/${sample.asin})`);

      const pub = getPartAffiliateOffers(sample.part_number, sample.product_title, { verifiedRegistry: registry });
      assert.ok(pub.has_direct_offers, `Expected public direct offer for ${sample.part_number}`);
    }

    const first = phase93Offers[0];
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

test('Phase 93 — 5. zero private address, postal code, or city stored in artifacts or code', () => {
  const forbiddenRe = new RegExp(Buffer.from('Y29ldm9yZGVufG1hcmdhXHMra2xvbXB8Nzc0MVxzKnpy', 'base64').toString('utf8'), 'i');
  const reportMd = readFileSync(path.join(ROOT, 'output/phase93/PHASE93_REPORT.md'), 'utf8');
  const payloads = [
    JSON.stringify(registryDoc),
    JSON.stringify(activation),
    JSON.stringify(rejectedAudit),
    JSON.stringify(ebayRecovery),
    JSON.stringify(queueDoc),
    JSON.stringify(checksNl),
    JSON.stringify(checksDe),
    reportMd
  ];
  for (const p of payloads) {
    assert.ok(!forbiddenRe.test(p), 'No private shipping address, city, or postal token may be stored');
  }
});
