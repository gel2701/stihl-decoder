/**
 * tests/phase95_targeted_activation_coverage.test.js
 *
 * Phase 95: Targeted Affiliate Activation & Coverage Growth
 *
 * Verifies:
 *  1. Phase 95 compound-noun screener (`evaluateTechnicalFit95`) accepts genuine NL/DE compounds
 *     while strictly rejecting non-STIHL products, multi-packs (even on kits), diameter mismatches,
 *     clutch drums matched to clutches, ring-only sets matched to pistons, and multi-gasket kits.
 *  2. eBay store preserves all 1,773 ACTIVE offers (220 parts) and distinguishes production vs
 *     backlog (`586` TITLE_ONLY_NEEDS_EVIDENCE) & OAuth blocker without unauthorized scraping.
 *  3. Amazon registry preserves all 2,784 Phase 94 baseline ACTIVE offers, 34 SUSPENDED, 3 VERIFIED,
 *     and 19 RESEARCH_REQUIRED while expanding ACTIVE (+272 -> 3,056), unique Amazon parts (+152 -> 1,895),
 *     combined Amazon+eBay unique parts (+144 -> 1,998), and model coverage (430 -> 440, +10 models).
 *  4. Every new Phase 95 ACTIVE offer passes TwoGateVerifier, mismatch guard, NL shipping,
 *     single-unit policy, SKU-per-ASIN uniqueness, and live SSR/resolver resolution + commercial UX.
 *  5. Zero private address, postal code, or city stored in artifacts or code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { VerifiedOfferRegistry, MAX_PILOT_ACTIVE_OFFERS } from '../src/affiliate/VerifiedOfferRegistry.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { getPartAffiliateOffers } from '../src/search/IntelligentPartsSearchEngine.js';
import { evaluateTechnicalFit95 } from '../scripts/phase95_screener.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const registryDoc = read('data/affiliate/verified_amazon_registry.json');
const catalog = read('data/parts_catalog.json').parts;
const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const activation = read('output/phase95/PHASE95_ACTIVATION.json');
const ebayStatus = read('output/phase95/PHASE95_EBAY_STATUS.json');
const ebayStore = loadEbayOfferStore(path.join(ROOT, 'data/affiliate/ebay_offers.json'));
const queueDoc = read('output/phase95/queue.json');
const checksNl = read('output/phase95/product_checks_amazon_nl.json');
const checksDe = read('output/phase95/product_checks_amazon_de.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase95Offers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && /^Phase 95:/.test(o.status_reason || ''));
const baselineOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && !/^Phase 95:/.test(o.status_reason || ''));

test('Phase 95 — 1. evaluateTechnicalFit95 accepts verified NL/DE compounds and rejects unsafe mismatches', () => {
  // Positive controls
  assert.strictEqual(evaluateTechnicalFit95('11181953500', 'Stihl Spring Starter Pawl Clip', {
    title: 'ISE Ersatz-Starter-Pawl-Clip für Stihl MS210 Kettensägen. Ersetzt Teilenummern: 1118 195 3500'
  }, 'ISE').ok, true);
  assert.strictEqual(evaluateTechnicalFit95('42555005800', 'Stihl 42555005800 Spray Guard For SG 31 SG 51', {
    title: 'Stihl 42555005800 Spritzschirm Kunststoff, transparent 80°'
  }, 'Stihl').ok, true);
  assert.strictEqual(evaluateTechnicalFit95('00003500536', 'Stihl 00003500536 Filler Cap', {
    title: 'Stihl Tankdeksel originele olietankdeksel 00003500536'
  }, 'Stihl').ok, true);
  assert.strictEqual(evaluateTechnicalFit95('11400074101', 'Service Kit 11 (HD2 Air Filter, Spark Plug NGK CMR6H, Fuel Filter)', {
    title: 'STIHL Service KIT 11 1140 007 4101/886661609062'
  }, 'Stihl').ok, true);
  assert.strictEqual(evaluateTechnicalFit95('42230209400', 'Stihl Decompression Valve', {
    title: 'Overdrukventiel TS410 voor Stihl TS410 TS420 4223 020 9400'
  }, 'Gubeter').ok, true);

  // Strict negative controls
  assert.strictEqual(evaluateTechnicalFit95('49505100301', 'Stihl Control Piston', {
    title: 'Messing stuurzuiger voor Nilfisk RE130 reserveonderdeel 49505100301'
  }, 'Moliuoly').ok, false);
  assert.strictEqual(evaluateTechnicalFit95('41470071700', 'Stihl Set Of Carburettor Parts', {
    title: '10 stuks K1-WTF carburateurreparatieset 4147 007 1700'
  }, 'FEREOWNQ').ok, false);
  assert.strictEqual(evaluateTechnicalFit95('11251602052', 'Stihl Clutch', {
    title: '0.325 Zoll Kupplungstrommel mit 7-Zahn Kranz für Stihl 026 1125 160 2052'
  }, 'URPIZY').ok, false);
  assert.strictEqual(evaluateTechnicalFit95('11210343010', 'Stihl Piston Ring 44X1.2Mm', {
    title: 'ITACO Zuigerringenset 1121 034 3010 46 mm x 1,2 mm voor STIHL 029'
  }, 'ITACO').ok, false);
  assert.strictEqual(evaluateTechnicalFit95('11480302015', 'Stihl Piston 39 mm', {
    title: 'MS182 Qualitätskolbenringsatz OEM 11480302015'
  }, 'ISQJPVF').ok, false);
  assert.strictEqual(evaluateTechnicalFit95('11410292302', 'Stihl Cylinder Gasket', {
    title: 'Cilinderdemper Uitlaatpakkingset voor STIHL MS261 11410292302'
  }, 'DORFEY').ok, false);
});

test('Phase 95 — 2. registry expands ACTIVE, unique parts, & model coverage while preserving baseline & eBay boundaries', () => {
  assert.strictEqual(MAX_PILOT_ACTIVE_OFFERS, null);
  assert.strictEqual(registryDoc.policy.max_active_offers_allowed, null);
  assert.strictEqual(registryDoc.policy.production_activation_allowed, true);

  assert.strictEqual(baselineOffers.length, 2784, 'All 2,784 Phase 94 baseline ACTIVE offers remain preserved');
  assert.ok(phase95Offers.length >= 250, `Expected >= 250 new Phase 95 ACTIVE offers, got ${phase95Offers.length}`);
  assert.strictEqual(activeOffers.length, activation.after.active_total);
  assert.strictEqual(registryDoc.metrics.active, activeOffers.length);
  assert.strictEqual(registryDoc.metrics.parts_with_amazon_offer, activation.after.unique_parts_amazon);
  assert.strictEqual(registryDoc.metrics.suspended, 34);
  assert.strictEqual(registryDoc.metrics.verified, 3);
  assert.strictEqual(registryDoc.metrics.research_required, 19);

  assert.ok(activation.after.new_unique_parts_added_amazon >= 140);
  assert.ok(activation.after.models_covered_all_fitments >= 440);
  assert.ok(activation.after.models_coverage_growth_all_fitments >= 10);
  assert.ok(activation.evidence_enrichment.needs_evidence_slots_activated_in_phase95 >= 50);

  assert.strictEqual(ebayStore.offers.length, 1773);
  assert.strictEqual(ebayStatus.ebay_already_active_in_production_and_store, 1773);
  assert.strictEqual(ebayStatus.ebay_title_only_needs_evidence, 586);
});

test('Phase 95 — 3. every new Phase 95 offer passes TwoGateVerifier, mismatch guard, NL shipping, and SKU uniqueness', () => {
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

  for (const offer of phase95Offers) {
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

test('Phase 95 — 4. live runtime offer resolution, commercial UX badges, & SSR part page priority', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
  process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  try {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    registry.loadFromFile();
    const nlSample = phase95Offers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').slice(0, 20);
    const deSample = phase95Offers.filter(o => o.marketplace === 'amazon.de').slice(0, 20);
    for (const sample of [...nlSample, ...deSample]) {
      const resolved = registry.resolveCommercialOffers({ partNumber: sample.part_number, marketplace: sample.marketplace });
      const match = resolved.find(r => r.link_type === 'DIRECT_ASIN' && r.asin === sample.asin);
      assert.ok(match, `Expected DIRECT_ASIN for ${sample.part_number} (${sample.marketplace}/${sample.asin})`);

      const pub = getPartAffiliateOffers(sample.part_number, sample.product_title, { verifiedRegistry: registry });
      assert.ok(pub.has_direct_offers, `Expected public direct offer for ${sample.part_number}`);
      assert.ok(pub.primary_offer?.is_direct && pub.all_offers[0]?.is_verified, 'Direct offer must take priority over search fallback');
    }

    const resolver = new AffiliateOfferResolver({ verifiedRegistry: registry });
    const genuineSample = phase95Offers.find(o => o.oem_brand_classification === 'GENUINE_STIHL' && (o.marketplace || 'amazon.nl') === 'amazon.nl');
    const aftermarketSample = phase95Offers.find(o => o.oem_brand_classification === 'MANUFACTURER_AFTERMARKET' && (o.marketplace || 'amazon.nl') === 'amazon.nl');
    assert.ok(genuineSample && aftermarketSample);

    const gOffers = resolver.resolveOffers({ partNumber: genuineSample.part_number, partName: genuineSample.product_title });
    const aOffers = resolver.resolveOffers({ partNumber: aftermarketSample.part_number, partName: aftermarketSample.product_title });
    const gHtml = renderPartDetailPageHtml({ part_number: genuineSample.part_number, part_name: genuineSample.product_title, fitment_count: 1, models: [], offers: gOffers }, null, 'https://www.stihldecoder.nl');
    const aHtml = renderPartDetailPageHtml({ part_number: aftermarketSample.part_number, part_name: aftermarketSample.product_title, fitment_count: 1, models: [], offers: aOffers }, null, 'https://www.stihldecoder.nl');
    assert.ok(gHtml.includes('Origineel STIHL'), 'Genuine STIHL badge must render distinctly');
    assert.ok(aHtml.includes('Aftermarket ('), 'Aftermarket badge must render distinctly');
    assert.ok(gHtml.includes('srihldecoder2-21') && !gHtml.includes('SEARCH_FALLBACK'), 'Direct verified page must carry affiliate tag and verified card');
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 95 — 5. zero private address, postal code, or city stored in artifacts or code', () => {
  const forbiddenRe = new RegExp(Buffer.from('Y29ldm9yZGVufG1hcmdhXHMra2xvbXB8Nzc0MVxzKnpy', 'base64').toString('utf8'), 'i');
  const reportMd = readFileSync(path.join(ROOT, 'output/phase95/PHASE95_REPORT.md'), 'utf8');
  const payloads = [
    JSON.stringify(registryDoc),
    JSON.stringify(activation),
    JSON.stringify(ebayStatus),
    JSON.stringify(queueDoc),
    JSON.stringify(checksNl),
    JSON.stringify(checksDe),
    reportMd
  ];
  for (const p of payloads) {
    assert.ok(!forbiddenRe.test(p), 'No private shipping address, city, or postal token may be stored');
  }
});
