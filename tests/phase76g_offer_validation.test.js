/**
 * tests/phase76g_offer_validation.test.js
 *
 * Phase 76G — Diagnostic offer validation and funnel instrumentation.
 * Verifies structured evaluateOffer() output, shipping diagnostics,
 * conflicting part-number detection, product-type conflicts and the
 * client→engine funnel counts (raw vs client-filtered vs engine).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';

process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';

const CAMPAIGN = '5339245312';
const AFF_URL = `https://www.ebay.de/itm/1?campid=${CAMPAIGN}`;
const SPARK_PART = '00004007000';

const engine = new EbayHighVolumeEngine({ apiClient: {} });

const item = (overrides = {}) => ({
  itemId: 'v1|1|0',
  title: 'Zündkerze',
  mpn: '',
  price: { value: '5.95', currency: 'EUR' },
  seller: { username: 'any_seller' },
  shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['NL'] }],
  itemAffiliateWebUrl: AFF_URL,
  condition: 'NEW',
  ...overrides
});

test('Phase 76G.1: evaluateOffer returns structured decision + reason_codes + first_blocking_step', () => {
  const r = engine.evaluateOffer(item({ title: 'Zündkerze', mpn: SPARK_PART }), SPARK_PART, {});
  assert.strictEqual(r.decision, 'ACCEPT');
  assert.ok(Array.isArray(r.reason_codes));
  assert.equal(r.first_blocking_step, null);
  assert.ok(r.offer);
  assert.equal(r.offer.match_basis, 'MPN_EXACT');

  const blocked = engine.evaluateOffer(item({ title: 'onbekend', mpn: '' }), SPARK_PART, {});
  assert.strictEqual(blocked.decision, 'REJECT');
  assert.ok(blocked.reason_codes.includes('PART_NUMBER_MISMATCH'));
  assert.equal(blocked.first_blocking_step, 'PART_NUMBER_MISMATCH');
  assert.equal(blocked.offer, null);
});

test('Phase 76G.2: validateOffer() wrapper stays backwards-compatible', () => {
  assert.equal(engine.validateOffer(item({ title: 'Zündkerze', mpn: SPARK_PART }), SPARK_PART, {}).decision, 'ACCEPT');
  assert.equal(engine.validateOffer(item({ title: 'Zündkerze 0000 400 7000' }), SPARK_PART, {}).decision, 'REVIEW');
  assert.equal(engine.validateOffer(item({ title: 'geen nummer' }), SPARK_PART, {}), null);
});

test('Phase 76G.3: unconfirmed NL shipping is REVIEW, never ACCEPT', () => {
  const r = engine.evaluateOffer(item({ title: 'Zündkerze', mpn: SPARK_PART, shippingOptions: [] }), SPARK_PART, {});
  assert.strictEqual(r.decision, 'REVIEW');
  assert.ok(r.reason_codes.includes('SHIPPING_NOT_CONFIRMED'));
  assert.equal(r.first_blocking_step, 'SHIPPING_NOT_CONFIRMED');
  assert.equal(r.offer.ships_to_nl, false);
});

test('Phase 76G.4: explicit non-NL shipping is REJECT', () => {
  const r = engine.evaluateOffer(item({
    title: 'Zündkerze', mpn: SPARK_PART,
    shippingOptions: [{ shippingCost: { value: '5.00', currency: 'EUR' }, shipToLocations: ['DE'] }]
  }), SPARK_PART, {});
  assert.strictEqual(r.decision, 'REJECT');
  assert.ok(r.reason_codes.includes('SHIPPING_NOT_CONFIRMED'));
  assert.equal(r.offer, null);
});

test('Phase 76G.5: conflicting MPN and conflicting title part numbers are REJECT', () => {
  const conflictingTitle = engine.evaluateOffer(item({ title: 'Zündkerze 0000 400 7011', mpn: SPARK_PART }), SPARK_PART, {});
  assert.strictEqual(conflictingTitle.decision, 'REJECT');
  assert.ok(conflictingTitle.reason_codes.includes('CONFLICTING_TITLE_PART_NUMBER'));

  const conflictingMpn = engine.evaluateOffer(item({ title: 'Zündkerze', mpn: '0000 400 7011' }), SPARK_PART, {});
  assert.strictEqual(conflictingMpn.decision, 'REJECT');
  assert.ok(conflictingMpn.reason_codes.includes('CONFLICTING_MPN'));
});

test('Phase 76G.6: product type conflicts are rejected (spark vs carb, starter vs saw chain, air filter vs carb)', () => {
  // Spark plug part vs carburetor title
  assert.equal(engine.evaluateOffer(item({ title: 'Vergaser', mpn: SPARK_PART }), SPARK_PART, { type: 'spark_plug' }).decision, 'REJECT');
  // Starter part vs saw-chain title
  const starterCls = { type: 'starter' };
  assert.equal(engine.evaluateOffer(item({ title: 'Zaagketting 3/8 1.3mm', mpn: '11181953500' }), '11181953500', starterCls).decision, 'REJECT');
  // Air filter part vs carburetor title
  const airCls = { type: 'air_filter' };
  assert.equal(engine.evaluateOffer(item({ title: 'Vergaser', mpn: '11231602050' }), '11231602050', airCls).decision, 'REJECT');
});

test('Phase 76G.7: classifyPart — concrete product-type words only', () => {
  // "saw" inside "chainsaw" must NOT classify a starter part as saw_chain
  const starterKnown = [{ part_number: '11181953500', description: 'Spring Starter Pawl Clip for TS400 chainsaw', category: 'starter' }];
  assert.equal(engine.classifyPart('11181953500', starterKnown).type, 'starter');

  assert.equal(engine.classifyPart(SPARK_PART, [{ part_number: SPARK_PART, description: 'Spark plug NGK', category: 'bougie' }]).type, 'spark_plug');
  assert.equal(engine.classifyPart('41371200628', [{ part_number: '41371200628', description: 'Carburetor', category: 'carburateur' }]).type, 'carburetor');
  assert.equal(engine.classifyPart('00001404407', [{ part_number: '00001404407', description: 'Air Filter Hd2', category: 'luchtfilter' }]).type, 'air_filter');
  assert.equal(engine.classifyPart('11220000000', [{ part_number: '11220000000', description: 'Zaagketting 3/8', category: 'ketting' }]).type, 'saw_chain');
  assert.equal(engine.classifyPart('x', []).type, 'unknown');
});

test('Phase 76G.8: correct part number but conflicting product title is REJECT', () => {
  // Exact MPN + conflicting title part number -> REJECT (both codes recorded)
  const r = engine.evaluateOffer(item({ title: 'Zündkerze 0000 400 7011 passt für 0000 400 7000', mpn: SPARK_PART }), SPARK_PART, {});
  assert.strictEqual(r.decision, 'REJECT');
  assert.ok(r.reason_codes.includes('CONFLICTING_TITLE_PART_NUMBER'));
  assert.ok(r.reason_codes.length > 0);
});

test('Phase 76G.9: client funnel stats — raw vs client-passed are measurable and consistent', async () => {
  const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
  const api = new EbayBrowseApiClient({
    clientId: 'id', clientSecret: 'secret', epnCampaignId: CAMPAIGN, mockToken: 'token',
    sleepFn: async () => {},
    fetchFn: async () => reply({ itemSummaries: [item({ title: 'Zündkerze', mpn: SPARK_PART })] })
  });
  const res = await api.searchItems({ partNumber: SPARK_PART });
  assert.equal(res.success, true);
  assert.ok(res.stats, 'stats must be present');
  assert.equal(res.stats.raw_count, 3, '3 queries return 1 item each');
  assert.equal(res.stats.client_passed_count, 1, 'deduplicated to one item');
  assert.equal(res.stats.client_rejected_count, res.stats.raw_count - res.stats.raw_unique_count, 'dedupe duplicates counted');
  assert.equal(res.items.length, res.stats.client_passed_count, 'engine receives exactly the client-passed items');
});

test('Phase 76G.10: client records concrete rejection reasons', () => {
  const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
  const api = new EbayBrowseApiClient({
    clientId: 'id', clientSecret: 'secret', epnCampaignId: CAMPAIGN, mockToken: 'token',
    sleepFn: async () => {}, fetchFn: async () => reply({})
  });
  const { rejection_reasons } = api.parseItemSummariesDetailed([
    { itemId: 'a', title: 'STIHL Zündkerze 0000 400 7000', itemAffiliateWebUrl: undefined },
    { itemId: 'b', title: 'Vergaser ohne Nummer', itemAffiliateWebUrl: AFF_URL },
    { itemId: 'c', title: 'Zündkerze Kit 0000 400 7000', itemAffiliateWebUrl: AFF_URL },
    { itemId: 'd', title: 'Zündkerze 0000 400 7000', itemAffiliateWebUrl: AFF_URL, shippingOptions: [{ shipToLocations: ['DE'] }] }
  ], SPARK_PART);
  assert.ok(rejection_reasons.AFFILIATE_URL_INVALID >= 1);
  assert.ok(rejection_reasons.PART_NUMBER_MISMATCH >= 1);
  assert.ok(rejection_reasons.BUNDLE_OR_KIT >= 1);
  assert.ok(rejection_reasons.SHIPPING_NOT_CONFIRMED >= 1);
});

test('Phase 76G.11: end-to-end processBatch reports first blocking steps and never ACCEPTs unconfirmed shipping', async () => {
  const makeEngine = (searchItems) => {
    const eng = new EbayHighVolumeEngine({
      apiClient: { searchItems: async () => ({ success: true, items: [], total: 0, errors: [] }) },
      batchDelayMs: 0, backoffBaseMs: 0, checkpointIntervalMs: -1,
      vendors: ['vendor_a'], marketplaces: ['EBAY_DE']
    });
    eng.apiClient.searchItems = searchItems;
    return eng;
  };
  // Unconfirmed shipping must land in review_offers, never active_offers
  const eng1 = makeEngine(async ({ partNumber }) => ({
    success: true,
    items: [item({ itemId: `v1|${partNumber}|0`, title: `Zündkerze ${partNumber.slice(0,4)} ${partNumber.slice(4,7)} ${partNumber.slice(7)}`, mpn: partNumber, shippingOptions: [] })],
    total: 1, errors: []
  }));
  const r1 = await eng1.processBatch([SPARK_PART], { maxItems: 1, knownParts: [] });
  assert.equal(r1.active_offers.length, 0, 'unconfirmed shipping must not be auto-accepted');
  assert.equal(r1.review_offers.length, 1);
  assert.equal(r1.summary.first_blocking_steps.SHIPPING_NOT_CONFIRMED, undefined, 'REVIEW is not a rejection');
  assert.ok(r1.review_offers[0].reason_codes.includes('SHIPPING_NOT_CONFIRMED'));

  // Confirmed NL shipping + exact MPN -> ACCEPT, funnel counts consistent
  const eng2 = makeEngine(async ({ partNumber }) => ({
    success: true,
    items: [item({ itemId: `v1|${partNumber}|0`, title: `Zündkerze`, mpn: partNumber })],
    total: 1, errors: [],
    stats: { raw_count: 1, raw_unique_count: 1, client_passed_count: 1, client_rejected_count: 0, client_rejection_reasons: {}, query_count: 1 }
  }));
  const r2 = await eng2.processBatch([SPARK_PART], { maxItems: 1, knownParts: [] });
  assert.equal(r2.active_offers.length, 1);
  assert.equal(r2.active_offers[0].decision, 'ACCEPT');
  assert.equal(r2.summary.raw_results, 1);
  assert.equal(r2.summary.client_passed, 1);
  assert.equal(r2.summary.client_rejected, 0);
  assert.equal(r2.summary.offers_validated, 1);
  assert.equal(r2.summary.offers_rejected, 0);
});