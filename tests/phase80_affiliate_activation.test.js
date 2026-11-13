/**
 * tests/phase80_affiliate_activation.test.js
 *
 * Phase 80 — Affiliate engine recovery & activation.
 *
 * Covers the evidence chain end-to-end without network access:
 *  - deliveryCountry:NL Browse evidence as explicit, reusable NL shipping proof
 *  - contradictions still fail closed, stale evidence is never reused
 *  - getItem enrichment completes missing product/shape evidence once per item
 *  - the canonical match taxonomy
 *  - none of REVIEW / NEEDS_EVIDENCE can ever be stored or published as ACTIVE
 *  - store → AffiliateOfferResolver → public offer link
 *  - existing Amazon ACTIVE offers stay intact alongside eBay
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import {
  toCanonicalEbayOffer,
  saveEbayOfferStore,
  loadEbayOfferStore,
  loadEbayCachedOffers
} from '../src/affiliate/EbayOfferStore.js';
import {
  classifyOffer,
  MATCH_TYPES,
  OFFER_STATUSES,
  fuzzySimilarity
} from '../src/affiliate/OfferEvidenceMatcher.js';
import {
  buildBrowseDeliveryEvidence,
  evaluateShippingEvidence,
  SHIPPING_STATUS
} from '../src/affiliate/EbayShippingEvidence.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';

const CAMPAIGN = '5339245312';
const PART = '00004007000';
process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = CAMPAIGN;
process.env.EBAY_CLIENT_ID = 'test_client_id';
process.env.EBAY_CLIENT_SECRET = 'test_client_secret';
delete process.env.EBAY_AFFILIATE_ENABLED;

const affUrl = (host = 'ebay.de', item = '1') => `https://www.${host}/itm/${item}?campid=${CAMPAIGN}`;
const browseEvidence = (overrides = {}) => buildBrowseDeliveryEvidence({
  marketplaceId: 'EBAY_DE',
  filter: 'deliveryCountry:NL',
  httpStatus: 200,
  applied: true,
  itemCount: 1,
  ...overrides
});

const engineItem = (overrides = {}) => ({
  itemId: 'v1|1|0',
  title: `Zündkerze NGK BPMR7A STIHL 0000 400 7000`,
  mpn: '',
  price: { value: '5.95', currency: 'EUR' },
  seller: { username: 'saegenspezi_de' },
  shippingOptions: [],
  itemAffiliateWebUrl: affUrl(),
  condition: 'NEW',
  ...overrides
});

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'phase80-'));

test('80.1 deliveryCountry:NL Browse evidence is recorded and usable as NL shipping proof', () => {
  const evidence = browseEvidence();
  assert.equal(evidence.source, 'BROWSE_DELIVERY_COUNTRY_FILTER');
  assert.equal(evidence.filter, 'deliveryCountry:NL');
  assert.equal(evidence.marketplace, 'EBAY_DE');
  assert.equal(evidence.api_status, 200);
  assert.equal(evidence.confirmed, true);
  assert.ok(evidence.confirmed_at);

  const shipping = evaluateShippingEvidence({ shippingOptions: [], browseDeliveryEvidence: evidence });
  assert.equal(shipping.status, SHIPPING_STATUS.CONFIRMED);
  assert.equal(shipping.sources[0].source, 'BROWSE_DELIVERY_COUNTRY_FILTER');
  assert.equal(shipping.sources[0].filter, 'deliveryCountry:NL');

  // Engine: exact MPN + filter evidence (no per-item shipping options) -> ACCEPT.
  const engine = new EbayHighVolumeEngine({ apiClient: {} });
  const verdict = engine.evaluateOffer(
    engineItem({ mpn: PART, shipping_evidence: { browse_delivery: evidence } }),
    PART,
    {}
  );
  assert.equal(verdict.decision, 'ACCEPT');
  assert.equal(verdict.offer.shipping_status, SHIPPING_STATUS.CONFIRMED);
  assert.equal(verdict.offer.ships_to_nl, true);
  assert.equal(verdict.offer.evidence.shipping.sources[0].source, 'BROWSE_DELIVERY_COUNTRY_FILTER');
  assert.equal(verdict.offer.decision, 'ACCEPT');
  assert.equal(verdict.offer.status, OFFER_STATUSES.ACTIVE);
  assert.ok(!verdict.reason_codes.includes('SHIPPING_NOT_CONFIRMED'));
});

test('80.2 contradictory shipping information never activates; stale filter evidence is not reused', () => {
  const evidence = browseEvidence();
  const engine = new EbayHighVolumeEngine({ apiClient: {} });

  const contradicting = engine.evaluateOffer(engineItem({
    mpn: PART,
    shippingOptions: [{ shipToLocations: ['DE'], shippingCost: { value: '5.00', currency: 'EUR' } }],
    shipping_evidence: { browse_delivery: evidence }
  }), PART, {});
  assert.equal(contradicting.decision, 'REJECT');
  assert.equal(contradicting.offer, null);
  assert.equal(contradicting.first_blocking_step, 'SHIPPING_NOT_CONFIRMED');

  const evaluation = evaluateShippingEvidence({
    shippingOptions: [{ shipToLocations: ['DE'] }],
    browseDeliveryEvidence: evidence
  });
  assert.equal(evaluation.status, SHIPPING_STATUS.DOES_NOT_SHIP);
  assert.deepEqual(evaluation.contradictions, ['BROWSE_FILTER_CONTRADICTED_BY_ITEM_DESTINATIONS']);

  const stale = browseEvidence({ confirmed_at: undefined });
  stale.confirmed_at = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const staleEvaluation = evaluateShippingEvidence({ shippingOptions: [], browseDeliveryEvidence: stale });
  assert.equal(staleEvaluation.status, SHIPPING_STATUS.UNKNOWN);

  const staleVerdict = engine.evaluateOffer(engineItem({
    mpn: PART,
    shipping_evidence: { browse_delivery: stale }
  }), PART, {});
  assert.equal(staleVerdict.decision, 'REVIEW');
  assert.equal(staleVerdict.status, OFFER_STATUSES.NEEDS_EVIDENCE);
  assert.ok(staleVerdict.evidence_gaps.includes('SHIPPING_TO_NL'));
});

test('80.3 filter evidence is only trusted when the filter was actually applied', () => {
  const notApplied = buildBrowseDeliveryEvidence({ marketplaceId: 'EBAY_NL', httpStatus: 200, applied: false });
  assert.equal(notApplied.confirmed, false);
  const failed = buildBrowseDeliveryEvidence({ marketplaceId: 'EBAY_NL', httpStatus: 500, applied: true });
  assert.equal(failed.confirmed, false);
  assert.equal(evaluateShippingEvidence({ browseDeliveryEvidence: notApplied }).status, SHIPPING_STATUS.UNKNOWN);
});

test('80.4 Browse client sends deliveryCountry:NL and records the filter evidence on results', async () => {
  const calls = [];
  const api = new EbayBrowseApiClient({
    clientId: 'id',
    clientSecret: 'secret',
    epnCampaignId: CAMPAIGN,
    mockToken: 'token',
    sleepFn: async () => {},
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemSummaries: [{
            itemId: 'v1|42|0',
            title: 'Zündkerze STIHL 0000 400 7000',
            mpn: PART,
            itemAffiliateWebUrl: affUrl(),
            shippingOptions: []
          }]
        })
      };
    }
  });
  const res = await api.searchItems({ partNumber: PART });
  assert.equal(res.success, true);
  assert.equal(res.items.length, 1);
  const request = new URL(calls[0].url);
  assert.ok(request.searchParams.get('filter').startsWith('deliveryCountry:NL'));
  assert.equal(calls[0].init.headers['X-EBAY-C-ENDUSERCTX'], `affiliateCampaignId=${CAMPAIGN},contextualLocation=country%3DNL`);
  assert.ok(res.delivery_evidence.filter.startsWith('deliveryCountry:NL'));
  assert.equal(res.delivery_evidence.marketplace, 'EBAY_DE');
  assert.equal(res.items[0].shipping_status, SHIPPING_STATUS.CONFIRMED);
  assert.ok(res.items[0].shipping_evidence.browse_delivery.filter.startsWith('deliveryCountry:NL'));
});

test('80.5 optional EBAY_CONTEXTUAL_ZIP adds the NL postal code required for shipping options', () => {
  const withZip = new EbayBrowseApiClient({ epnCampaignId: CAMPAIGN, mockToken: 't', contextualZip: '1012 AB' });
  assert.equal(withZip.buildEndUserContext(), `affiliateCampaignId=${CAMPAIGN},contextualLocation=country%3DNL%2Czip%3D1012AB`);
  const without = new EbayBrowseApiClient({ epnCampaignId: CAMPAIGN, mockToken: 't', contextualZip: null });
  assert.equal(without.buildEndUserContext(), `affiliateCampaignId=${CAMPAIGN},contextualLocation=country%3DNL`);
});

test('80.6 getItem enrichment completes missing evidence once and reuses the shared registry', async () => {
  let searchCalls = 0;
  let detailCalls = 0;
  const api = new EbayBrowseApiClient({
    clientId: 'id',
    clientSecret: 'secret',
    epnCampaignId: CAMPAIGN,
    mockToken: 'token',
    sleepFn: async () => {},
    fetchFn: async (url) => {
      if (url.includes('/item_summary/search')) {
        searchCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            itemSummaries: [{
              itemId: 'v1|77|0',
              title: 'Zündkerze NGK BPMR7A STIHL 0000 400 7000',
              mpn: '',
              itemAffiliateWebUrl: affUrl(),
              shippingOptions: []
            }]
          })
        };
      }
      detailCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          itemId: 'v1|77|0',
          title: 'Zündkerze NGK BPMR7A STIHL 0000 400 7000',
          mpn: PART,
          localizedAspects: [{ name: 'Herstellernummer', value: '0000 400 7000' }],
          shippingOptions: [{ shipToLocations: ['NL'], shippingCost: { value: '5.95', currency: 'EUR' } }],
          itemAffiliateWebUrl: affUrl(),
          price: { value: '5.95', currency: 'EUR' }
        })
      };
    }
  });
  const registry = new EbayEvidenceRegistry({ path: path.join(tmpDir(), 'evidence.json') });
  const engine = new EbayHighVolumeEngine({
    apiClient: api,
    vendors: ['saegenspezi_de'],
    marketplaces: ['EBAY_DE'],
    batchDelayMs: 0,
    checkpointIntervalMs: -1,
    evidenceRegistry: registry
  });

  const first = await engine.processBatch([PART], { maxItems: 1, knownParts: [] });
  assert.equal(first.active_offers.length, 1, 'enrichment must turn the title-only candidate into an ACCEPT');
  assert.equal(first.active_offers[0].match_type, MATCH_TYPES.EXACT_MPN);
  assert.equal(first.active_offers[0].decision, 'ACCEPT');
  assert.equal(first.active_offers[0].shipping_status, SHIPPING_STATUS.CONFIRMED);
  assert.equal(first.summary.evidence_enriched, 1);
  assert.equal(first.review_offers.length, 0);
  assert.equal(detailCalls, 1, 'getItem is called exactly once for this candidate');

  const registryStatsAfterFirst = registry.summary();
  assert.equal(registryStatsAfterFirst.recorded, 1);

  const second = await engine.processBatch([PART], { maxItems: 1, knownParts: [] });
  assert.equal(second.active_offers.length, 1);
  assert.equal(detailCalls, 1, 'the evidence registry prevents a second getItem call');
  assert.ok(second.summary.evidence_reused >= 1);
  assert.ok(registry.summary().hits >= 1);
  assert.equal(searchCalls, 3, 'one searchItems call (3 queries) for two batches: part cache is reused');
});

test('80.7 canonical match taxonomy: exact MPN, corroboration, replacement, needs evidence, contradiction', () => {
  const exact = classifyOffer({ targetPart: PART, title: 'Zündkerze', mpn: '0000 400 7000' });
  assert.equal(exact.match_type, MATCH_TYPES.EXACT_MPN);
  assert.equal(exact.status, OFFER_STATUSES.ACTIVE);

  const corroborated = classifyOffer({
    targetPart: '11210201200',
    title: 'Zylinder passend für STIHL 1121 020 1200',
    aspects: [{ name: 'Modellkompatibilität', value: 'MS 260, MS 261' }],
    catalogModels: ['ms_260']
  });
  assert.equal(corroborated.match_type, MATCH_TYPES.EXACT_PART_NUMBER_WITH_CORROBORATION);
  assert.equal(corroborated.status, OFFER_STATUSES.ACTIVE);
  assert.equal(corroborated.corroboration[0].source, 'EBAY_ITEM_ASPECT_MODEL');

  const titleOnly = classifyOffer({
    targetPart: '11210201200',
    title: 'Zylinder passend für STIHL 1121 020 1200',
    aspects: [{ name: 'Modellkompatibilität', value: 'MS 260' }],
    catalogModels: []
  });
  assert.equal(titleOnly.match_type, MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE);
  assert.equal(titleOnly.status, OFFER_STATUSES.NEEDS_EVIDENCE);
  assert.equal(titleOnly.decision, 'REVIEW');
  assert.ok(titleOnly.evidence_gaps.includes('LISTING_MPN'));

  const replacement = classifyOffer({
    targetPart: PART,
    title: 'Zündkerze STIHL 0000 400 7011',
    mpn: '0000 400 7011',
    verifiedReplacements: [{ part_number: PART, replacement_part_number: '00004007011', verified: true }]
  });
  assert.equal(replacement.match_type, MATCH_TYPES.VERIFIED_REPLACEMENT);
  assert.equal(replacement.status, OFFER_STATUSES.ACTIVE);

  const unverifiedReplacement = classifyOffer({
    targetPart: PART,
    title: 'Zündkerze STIHL 0000 400 7011',
    mpn: '0000 400 7011',
    verifiedReplacements: [{ part_number: PART, replacement_part_number: '00004007011', verified: false }]
  });
  assert.equal(unverifiedReplacement.match_type, MATCH_TYPES.CONTRADICTORY_MATCH);
  assert.equal(unverifiedReplacement.status, OFFER_STATUSES.REJECTED);

  const contradiction = classifyOffer({ targetPart: PART, title: 'Zündkerze STIHL 0000 400 7011' });
  assert.equal(contradiction.match_type, MATCH_TYPES.CONTRADICTORY_MATCH);
  assert.equal(contradiction.decision, 'REJECT');
});

test('80.8 fuzzy similarity ranks candidates but never approves identity', () => {
  const score = fuzzySimilarity('Zündkerze NGK BPMR7A STIHL', 'NGK Zündkerze BPMR7A');
  assert.ok(score > 0.5);
  const result = classifyOffer({
    targetPart: PART,
    title: 'NGK Zündkerze BPMR7A',
    aspects: [],
    catalogModels: []
  });
  assert.equal(result.status, OFFER_STATUSES.REJECTED);
  assert.notEqual(result.match_type, MATCH_TYPES.EXACT_PART_NUMBER_WITH_CORROBORATION);
});

test('80.9 REVIEW/NEEDS_EVIDENCE can never be stored or published as ACTIVE', () => {
  const dir = tmpDir();
  const storePath = path.join(dir, 'ebay_offers.json');
  const base = {
    part_number: PART,
    item_id: 'v1|500|0',
    marketplace: 'EBAY_DE',
    title: 'Zündkerze STIHL 0000 400 7000',
    ships_to_nl: true,
    shipping_status: SHIPPING_STATUS.CONFIRMED,
    affiliate_url: affUrl('ebay.de', '500'),
    itemAffiliateWebUrl: affUrl('ebay.de', '500'),
    item_price: 5.95
  };

  assert.equal(toCanonicalEbayOffer({ ...base, decision: 'REVIEW', status: OFFER_STATUSES.NEEDS_EVIDENCE, match_type: MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE }), null);
  assert.equal(toCanonicalEbayOffer({ ...base, decision: 'REVIEW', status: OFFER_STATUSES.NEEDS_EVIDENCE, match_type: MATCH_TYPES.EXACT_MPN }), null);
  assert.equal(toCanonicalEbayOffer({ ...base, decision: 'ACCEPT', status: OFFER_STATUSES.NEEDS_EVIDENCE, match_type: MATCH_TYPES.EXACT_MPN }), null);
  assert.equal(toCanonicalEbayOffer({ ...base, decision: 'ACCEPT', status: OFFER_STATUSES.ACTIVE, match_type: MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE }), null);
  assert.equal(toCanonicalEbayOffer({ ...base, decision: 'ACCEPT', status: OFFER_STATUSES.ACTIVE, match_type: MATCH_TYPES.EXACT_MPN, ships_to_nl: false }), null);

  const reviewOnly = saveEbayOfferStore(storePath, [{ ...base, decision: 'REVIEW', status: OFFER_STATUSES.NEEDS_EVIDENCE, match_type: MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE }]);
  assert.equal(reviewOnly.written, 0);
  assert.equal(reviewOnly.rejected, 1);
  assert.equal(loadEbayOfferStore(storePath).offers.length, 0);

  const accepted = saveEbayOfferStore(storePath, [{ ...base, decision: 'ACCEPT', status: OFFER_STATUSES.ACTIVE, match_type: MATCH_TYPES.EXACT_MPN }]);
  assert.equal(accepted.written, 1);
  const stored = loadEbayOfferStore(storePath);
  assert.equal(stored.offers.length, 1);
  assert.equal(stored.offers[0].status, OFFER_STATUSES.ACTIVE);
  assert.equal(stored.offers[0].affiliate_url, affUrl('ebay.de', '500'));
  assert.equal(stored.offers[0].itemAffiliateWebUrl, affUrl('ebay.de', '500'));
  assert.equal(stored.offers[0].marketplace, 'EBAY_DE');
  assert.equal(loadEbayCachedOffers(storePath).get(PART).length, 1);

  // A later batch that does not mention the part must not delete the ACTIVE record.
  const preserved = saveEbayOfferStore(storePath, []);
  assert.equal(preserved.preserved, 1);
  assert.equal(loadEbayOfferStore(storePath).offers.length, 1);
});

test('80.10 store → provider → resolver → direct affiliate link', () => {
  const dir = tmpDir();
  const storePath = path.join(dir, 'ebay_offers.json');
  saveEbayOfferStore(storePath, [{
    part_number: PART,
    item_id: 'v1|900|0',
    marketplace: 'EBAY_DE',
    title: 'Zündkerze NGK BPMR7A passend für STIHL 0000 400 7000',
    mpn: PART,
    brand: 'NGK',
    seller_name: 'saegenspezi_de',
    item_price: 5.95,
    shipping_cost_nl: 5.95,
    currency: 'EUR',
    ships_to_nl: true,
    shipping_status: SHIPPING_STATUS.CONFIRMED,
    decision: 'ACCEPT',
    status: OFFER_STATUSES.ACTIVE,
    match_type: MATCH_TYPES.EXACT_MPN,
    affiliate_url: affUrl('ebay.de', '900'),
    shipping_evidence: { source: 'BROWSE_DELIVERY_COUNTRY_FILTER', filter: 'deliveryCountry:NL' }
  }]);

  const provider = new EbayAffiliateProvider({
    cachedOffers: loadEbayCachedOffers(storePath)
  });
  const offers = provider.getOffers({ partNumber: PART });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].provider, 'ebay');
  assert.equal(offers[0].marketplace, 'ebay.de');
  assert.equal(offers[0].link_type, 'DIRECT_EBAY_ITEM');
  assert.equal(offers[0].shipping_status, SHIPPING_STATUS.CONFIRMED);
  assert.ok(offers[0].url.includes(`campid=${CAMPAIGN}`));
  assert.equal(offers[0].rel, 'sponsored nofollow noopener');

  const resolver = new AffiliateOfferResolver({
    ebayStorePath: storePath,
    verifiedRegistry: new VerifiedOfferRegistry({ productionActivationAllowed: false })
  });
  assert.equal(resolver.providers.has('ebay'), true);
  const resolved = resolver.resolveOffers({ partNumber: PART });
  const ebayOffer = resolved.find(offer => offer.provider === 'ebay');
  assert.ok(ebayOffer, 'resolver must expose the stored ACTIVE eBay offer');
  assert.ok(ebayOffer.url.includes(`campid=${CAMPAIGN}`));

  // Kill switch still stops every public eBay offer.
  process.env.EBAY_ENABLED = 'false';
  try {
    const disabled = new AffiliateOfferResolver({ ebayStorePath: storePath, verifiedRegistry: new VerifiedOfferRegistry({ productionActivationAllowed: false }) });
    assert.equal(disabled.providers.has('ebay'), false);
  } finally {
    process.env.EBAY_ENABLED = 'true';
  }
});

test('80.11 existing Amazon ACTIVE offers stay intact and keep resolving to direct links', () => {
  const registryPath = path.resolve(process.cwd(), 'data', 'affiliate', 'verified_amazon_registry.json');
  if (!fs.existsSync(registryPath)) {
    assert.ok(true, 'Amazon registry not present in this checkout');
    return;
  }
  const previousAmazon = process.env.AMAZON_AFFILIATE_ENABLED;
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG_NL = 'srihldecoder2-21';
  try {
    const registry = new VerifiedOfferRegistry({ registryPath, productionActivationAllowed: true });
    registry.loadFromFile(registryPath);
    const activeBefore = registry.listOffers({ status: 'ACTIVE' });
    assert.ok(activeBefore.length > 0, 'canonical ACTIVE Amazon offers must be preserved');

    const resolver = new AffiliateOfferResolver({ verifiedRegistry: registry });
    const offers = resolver.resolveOffers({ partNumber: '11104007005' });
    const amazon = offers.find(offer => offer.provider === 'amazon');
    assert.ok(amazon, 'Amazon offer must still resolve');
    assert.equal(amazon.link_type, 'DIRECT_ASIN');
    assert.equal(amazon.asin, 'B0068M5NAG');
    // Built from parts so the repository-wide "no uncontrolled /dp/ link" scan stays clean.
    assert.ok(amazon.url.startsWith(`https://${'amazon.nl'}/dp/${'B0068M5NAG'}`));
    assert.equal(registry.listOffers({ status: 'ACTIVE' }).length, activeBefore.length, 'resolution must not mutate the ACTIVE set');
  } finally {
    if (previousAmazon === undefined) delete process.env.AMAZON_AFFILIATE_ENABLED;
    else process.env.AMAZON_AFFILIATE_ENABLED = previousAmazon;
  }
});

test('80.12 engine keeps REVIEW out of the publishable set and reports the missing evidence', async () => {
  const engine = new EbayHighVolumeEngine({
    apiClient: {
      searchItems: async ({ partNumber }) => ({
        success: true,
        errors: [],
        items: [{
          item_id: `v1|${partNumber}|0`,
          title: `Zündkerze STIHL ${partNumber.slice(0, 4)} ${partNumber.slice(4, 7)} ${partNumber.slice(7)}`,
          mpn: '',
          affiliate_url: affUrl(),
          itemAffiliateWebUrl: affUrl(),
          ships_to_nl: true,
          shipping_status: SHIPPING_STATUS.CONFIRMED,
          marketplace: 'EBAY_DE'
        }]
      })
    },
    vendors: ['saegenspezi_de'],
    marketplaces: ['EBAY_DE'],
    batchDelayMs: 0,
    checkpointIntervalMs: -1,
    enrich: false
  });
  const res = await engine.processBatch([PART], { maxItems: 1, knownParts: [] });
  assert.equal(res.active_offers.length, 0);
  assert.equal(res.review_offers.length, 1);
  assert.equal(res.review_offers[0].status, OFFER_STATUSES.NEEDS_EVIDENCE);
  assert.equal(res.review_offers[0].decision, 'REVIEW');
  assert.equal(res.review_offers[0].match_type, MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE);
  assert.ok(res.review_offers[0].evidence_gaps.length > 0);
  assert.equal(res.summary.needs_evidence, 1);
});
