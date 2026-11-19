/**
 * Phase 87.1 — Amazon.nl expansion guards.
 *
 * Locks in the expansion batch: every new ACTIVE offer is catalog-grounded, carries
 * the NL tag, passed the unchanged Two-Gate verifier, keeps its evidence sources and
 * is authorised for the pilot. Rejected/unproven candidates stay documented instead
 * of disappearing, and the catalogue-wide dynamic search fallback keeps working.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const registryDoc = read('data/affiliate/verified_amazon_registry.json');
const catalog = read('data/parts_catalog.json').parts;
const catalogParts = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const activation = read('output/phase87_1/PHASE87_1_ACTIVATION.json');
const selection = read('output/phase87_1/selection_plan.json');
const queue = read('output/phase87_1/queue.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase871Offers = registryDoc.offers.filter(o => o.status === 'ACTIVE' && /^Phase 87\.1:/.test(o.status_reason || ''));
const previouslyLive = registryDoc.offers.filter(o => o.status === 'ACTIVE' && !/^(?:Phase 87\.[123]|Phase 8[89]|Phase 9[0234]):/.test(o.status_reason || ''));

test('Phase 87.1 — 1. registry grows without losing a single previously live offer', () => {
  assert.ok(registryDoc.offers.length >= 216, 'Only obsolete RESEARCH_REQUIRED candidates are retired (and preserved in the artifact)');
  assert.ok(activeOffers.length >= 150);
  assert.ok(registryDoc.metrics.active >= 150);
  assert.ok(registryDoc.metrics.active_nl >= 100);
  assert.ok(registryDoc.metrics.active_de >= 50);
  assert.ok(registryDoc.metrics.parts_with_amazon_offer >= 137);
  assert.equal(previouslyLive.length, 97, 'All 97 offers that were live before Phase 87.1 must stay ACTIVE');
  assert.equal(phase871Offers.length, 33);
  assert.equal(activation.superseded_research_candidates.length, 11, 'retired candidates must be preserved with their evidence');
});

test('Phase 87.1 — 2. every new offer passed the unchanged Two-Gate verifier', () => {
  for (const offer of phase871Offers) {
    const verification = TwoGateVerifier.verifyOffer(offer, {
      catalogPartMap: catalogParts,
      expectedTag: 'srihldecoder2-21'
    });
    assert.equal(verification.passed, true, `${offer.part_number}/${offer.asin}: ${verification.errors.join('; ')}`);
    assert.ok(offer.gate_1_technical?.passed);
    assert.ok(offer.gate_2_product?.passed);
  }
});

test('Phase 87.1 — 3. tags, marketplaces, catalogue grounding and evidence URLs', () => {
  for (const offer of phase871Offers) {
    assert.ok(catalogParts.has(PartNormalizer.normalizePartNumber(offer.part_number)), `${offer.part_number} must exist in the catalog`);
    assert.equal(offer.marketplace, 'amazon.nl');
    assert.equal(offer.affiliate_tag, 'srihldecoder2-21');
    assert.ok(offer.direct_affiliate_url.startsWith(`https://www.amazon.nl/dp/${offer.asin}`));
    assert.ok(offer.direct_affiliate_url.includes('tag=srihldecoder2-21'));
    assert.ok(offer.search_fallback_url.includes('amazon.nl/s?k='));
    assert.equal(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.match(offer.compatibility_proof, /STIHL onderdeel \d{4} \d{3} \d{4}/);
    assert.ok(/MS|FS|BR|BG|HS|TS|HT|BT|HL|KM/.test(offer.compatibility_proof), 'compatibility proof must name STIHL models');

    const sources = offer.verifiable_evidence_sources || [];
    assert.ok(sources.some(s => s.type === 'AMAZON_PRODUCT_PAGE' && s.url.includes('amazon.nl')), 'Amazon page evidence is mandatory');
    assert.ok(sources.every(s => typeof s.claim === 'string' && s.claim.length > 20), 'every source needs its own claim');
    for (const source of sources) {
      assert.ok(!/\bB[0-9A-Z]{9}\b/.test(source.claim) || source.claim.includes(offer.asin), 'a source may not claim a different ASIN');
    }
  }
});

test('Phase 87.1 — 4. no duplicates, distinct kill switches and explicit operator authorisation', () => {
  const keys = new Set();
  for (const offer of phase871Offers) {
    const key = `${offer.part_number}:${offer.marketplace}:${offer.asin}`;
    assert.ok(!keys.has(key), `duplicate offer ${key}`);
    keys.add(key);
  }
  const killSwitches = new Set(activeOffers.map(o => o.kill_switch_id));
  assert.equal(killSwitches.size, activeOffers.length, 'every active offer keeps its own kill switch');
  const whitelist = new Set(registryDoc.policy.pilot_activated_parts);
  for (const offer of phase871Offers) {
    assert.ok(whitelist.has(offer.part_number), `${offer.part_number} must be explicitly authorised`);
  }
  const cap = registryDoc.policy.max_active_offers_allowed;
  assert.ok(cap === null || registryDoc.metrics.active_nl <= cap, 'Amazon.nl respects unlimited policy or configured cap');
});

test('Phase 87.1 — 5. the work queue and its evidence artifacts are complete', () => {
  assert.equal(queue.queue.length, 250, 'the prioritised queue must hold 250 parts');
  assert.equal(selection.parts, 250);
  assert.ok(selection.parts_with_candidate >= 80, 'at least 80 parts exposed a listing with the exact number');
  assert.equal(selection.asins.length, selection.unique_candidate_asins);

  const checks = read('output/phase87_1/product_checks_amazon_nl.json');
  assert.equal(Object.keys(checks).length, selection.unique_candidate_asins, 'every candidate ASIN must have a rendered page check');
  assert.ok(Object.values(checks).every(c => c.listed !== false), 'no activated candidate may come from a dead page');

  const search = read('output/phase87_1/search_hits_amazon_nl.json');
  assert.ok(Object.keys(search).length >= 250, 'all 250 queued parts were searched');
  assert.ok(Object.values(search).reduce((s, r) => s + r.hits.length, 0) > 1000, 'the audit must keep the observed search results');
});

test('Phase 87.1 — 6. non-activated candidates stay documented with their verdict', () => {
  assert.ok(Array.isArray(activation.not_activated) && activation.not_activated.length >= 10);
  const verdicts = new Set(activation.not_activated.map(r => r.verdict));
  assert.ok(verdicts.has('CONFLICTING_PRODUCT_IDENTITY'));
  assert.ok(verdicts.has('NEEDS_EVIDENCE_MULTIPACK'));
  for (const row of activation.not_activated) {
    assert.ok(row.why && row.why.length > 20, `${row.part} needs a written reason`);
    assert.ok(!phase871Offers.some(o => o.part_number === row.part && o.asin === row.asin), `${row.part} may not be activated and rejected at once`);
  }
  // The unbranded 10-pack stays refused, and no new offer may carry a synthetic GTIN.
  assert.ok(activation.not_activated.some(r => r.asin === 'B0D3GRT27F'));
  assert.ok(phase871Offers.every(o => o.ean_gtin === null), 'no GTIN may be invented for a new offer');
});

test('Phase 87.1 — 7. catalogue-wide dynamic search fallback keeps both marketplaces', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  // Search links require a configured tag per marketplace; production sets both.
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
  process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';
  try {
    for (const part of ['11231200604', '00004007000', '99999999999']) {
      const offers = AffiliateOfferResolver.resolveOffers({ partNumber: part, partName: 'Test' });
      const nl = offers.find(o => o.url?.includes('amazon.nl/s?k='));
      const de = offers.find(o => o.url?.includes('amazon.de/s?k='));
      assert.ok(nl, `${part} must get an Amazon.nl search link`);
      assert.ok(de, `${part} must get an Amazon.de search link`);
      assert.equal(nl.link_type, 'SEARCH_FALLBACK');
      assert.ok(nl.url.includes('tag=srihldecoder2-21'));
      assert.ok(de.url.includes('tag=srihldecode00-21'));
      assert.ok(nl.url.includes(encodeURIComponent('1123 120 0604')) || nl.url.includes(part) || nl.url.includes('STIHL'));
    }
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 87.1 — 8. registry loader serves the new offers as direct links', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.loadFromFile();
  const sample = ['11351201601', '42821410300', '11300802100', '00003500514'];
  for (const part of sample) {
    const resolved = registry.resolveCommercialOffers({ partNumber: part });
    const direct = resolved.filter(o => o.link_type === 'DIRECT_ASIN');
    assert.ok(direct.length >= 1, `${part} must resolve to its direct Amazon offer`);
    assert.ok(direct.some(o => o.marketplace === 'amazon.nl'));
  }
  assert.equal(registry.getActiveOffers('00003500514')[0].affiliate_tag, 'srihldecoder2-21');
  process.env = originalEnv;
});
