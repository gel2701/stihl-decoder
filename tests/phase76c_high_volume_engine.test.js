/**
 * tests/phase76c_high_volume_engine.test.js
 *
 * Phase 76C — High-Volume eBay Affiliate Engine: batches (100/1.000/5.000),
 * checkpoints & resume, multi-vendor search, backoff, dedupe, classification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';

process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';
process.env.EBAY_CLIENT_ID = 'test_client_id';
process.env.EBAY_CLIENT_SECRET = 'test_client_secret';
delete process.env.EBAY_AFFILIATE_ENABLED;

const CAMPAIGN = '5339245312';
const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
const affUrl = (host, campaign = CAMPAIGN) => `https://www.${host}/itm/1001?campid=${campaign}`;

const makePart = n => String(n).padStart(11, '0');
const parts100 = Array.from({ length: 100 }, (_, i) => makePart(11210000000 + i));
const parts1000 = Array.from({ length: 1000 }, (_, i) => makePart(11220000000 + i));
const parts5000 = Array.from({ length: 5000 }, (_, i) => makePart(11230000000 + i));

const knownParts = [
  { part_number: '00004007000', description: 'Zündkerze NGK BPMR7A (Spark plug)' },
  { part_number: '11210201200', description: 'Zylinder (Cylinder)' },
  { part_number: '11350500600', description: 'Vergaser (Carburetor)' }
];

const validItem = (part, overrides = {}) => ({
  itemId: `v1|${part}|0`,
  title: `Zündkerze STIHL ${part.slice(0, 4)} ${part.slice(4, 7)} ${part.slice(7)}`,
  mpn: `${part.slice(0, 4)} ${part.slice(4, 7)} ${part.slice(7)}`,
  price: { value: '5.95', currency: 'EUR' },
  seller: { username: 'any_seller' },
  shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['NL'] }],
  itemAffiliateWebUrl: affUrl('ebay.de'),
  condition: 'NEW',
  ...overrides
});

const invalidItem = (part, overrides = {}) => ({
  itemId: `v1|${part}-bad|0`,
  title: 'Vergaser Tuning Kit MS 250',
  price: { value: '19.95', currency: 'EUR' },
  seller: { username: 'any_seller' },
  shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['NL'] }],
  itemAffiliateWebUrl: affUrl('ebay.de'),
  condition: 'NEW',
  ...overrides
});

const makeEngine = (partList, { rateLimitAt = -1, failUntilCall = 0 } = {}) => {
  let call = 0;
  const fetchFn = async (url) => {
    call++;
    if (rateLimitAt > 0 && call >= rateLimitAt && call < rateLimitAt + 3) {
      return reply({}, 429);
    }
    if (call <= failUntilCall) return reply({}, 500);
    // Extract the queried part from q= and return a matching + a non-matching item.
    const q = new URL(url).searchParams.get('q') || '';
    const compact = q.replace(/[\s-]/g, '').replace(/^STIHL/, '').trim();
    const part = /^\d{11}$/.test(compact) ? compact : null;
    if (!part) return reply({ itemSummaries: [] });
    return reply({ itemSummaries: [validItem(part), invalidItem(part)] });
  };
  const apiClient = new EbayBrowseApiClient({
    clientId: 'id',
    clientSecret: 'secret',
    epnCampaignId: CAMPAIGN,
    mockToken: 'token',
    sleepFn: async () => {},
    fetchFn
  });
  return new EbayHighVolumeEngine({ apiClient, batchDelayMs: 0, checkpointIntervalMs: 0 });
};

test('Phase 76C.7: batch 100 — processes all parts, validates only confirmed matches', async () => {
  const engine = makeEngine(parts100);
  const result = await engine.processBatch(parts100, { maxItems: 100, knownParts });

  assert.equal(result.status, 'complete');
  assert.equal(result.summary.scanned_parts, 100);
  assert.ok(result.summary.api_calls > 0, 'API calls must be executed');
  assert.ok(result.summary.offers_validated > 0, 'Valid offers must be found');
  assert.ok(result.summary.offers_rejected > 0, 'Invalid offers must be rejected');
  // Every validated offer has shipping + affiliate
  for (const offer of result.active_offers) {
    assert.equal(offer.ships_to_nl, true);
    assert.ok(offer.affiliate_url.includes(`campid=${CAMPAIGN}`));
    assert.ok(offer.affiliate_url.startsWith('https://'));
  }
  // Rejected offers must not appear in active offers
  const rejectedIds = new Set(result.rejected_offers.map(r => r.item_id));
  for (const active of result.active_offers) {
    assert.equal(rejectedIds.has(active.item_id), false);
  }
});

test('Phase 76C.8: batch 1.000 — completes within capacity with checkpoint records', async () => {
  const engine = makeEngine(parts1000);
  const result = await engine.processBatch(parts1000, { maxItems: 1000, knownParts });
  assert.equal(result.summary.scanned_parts, 1000);
  assert.ok(Array.isArray(result.checkpoints), 'Checkpoints must be recorded');
  assert.ok(result.summary.duration_ms >= 0);
});

test('Phase 76C.9: batch 5.000 — respects maxItems and does not exceed requested capacity', async () => {
  const engine = makeEngine(parts5000);
  const result = await engine.processBatch(parts5000, { maxItems: 5000, knownParts });
  assert.equal(result.summary.scanned_parts, 5000);
  // maxItems must clamp even if caller passes a bigger slice
  const engine2 = makeEngine(parts5000);
  const result2 = await engine2.processBatch(parts5000, { maxItems: 100, knownParts });
  assert.equal(result2.summary.scanned_parts, 100, 'maxItems must cap processing');
});

test('Phase 76C.10: resume from checkpoint — skips already-processed parts', async () => {
  const engine = makeEngine(parts100);
  const first = await engine.processBatch(parts100, { maxItems: 40, knownParts });
  assert.equal(first.summary.scanned_parts, 40);
  const resumeIndex = 40;
  const second = await engine.processBatch(parts100, {
    maxItems: 60,
    knownParts,
    resumeFrom: resumeIndex
  });
  assert.equal(second.summary.scanned_parts, 60, 'Resume must process remainder only');
});

test('Phase 76C.11: rate limit backoff — 429 triggers retry with backoff, not failure', async () => {
  // First two calls rate-limited (429), then success
  const engine = makeEngine(parts100, { rateLimitAt: 1 });
  const result = await engine.processBatch(parts100.slice(0, 3), { maxItems: 3, knownParts });
  assert.equal(result.summary.backoff_delays > 0, true, 'Backoff delays must be recorded');
  assert.equal(result.summary.scanned_parts, 3, 'All parts processed despite rate limiting');
});

test('Phase 76C.12: classification rejects conflicting product types (carburetor vs spark plug)', async () => {
  const engine = makeEngine(parts100);
  const sparkPlugClassification = { type: 'spark_plug', confidence: 0.95 };
  const carbTitle = validItem('00004007000', { title: 'Vergaser passend für Stihl MS 250' });
  const rejected = engine.validateOffer(carbTitle, '00004007000', sparkPlugClassification);
  assert.equal(rejected, null, 'Carburetor title must be rejected for spark plug part');

  const valid = engine.validateOffer(validItem('00004007000'), '00004007000', sparkPlugClassification);
  assert.ok(valid, 'Genuine spark plug must pass');
  assert.equal(valid.ships_to_nl, true);
});

test('Phase 76C.13: bundle/set detection rejects multi-quantity or kit phrases', async () => {
  const engine = makeEngine(parts100);
  const bundle = validItem('00004007000', { title: 'Zündkerze 0000 400 7000 Tune-up Kit für MS 250' });
  assert.equal(engine.validateOffer(bundle, '00004007000', {}), null, 'Kit phrase must reject');

  const multiQty = validItem('00004007000', { quantity: 4 });
  assert.equal(engine.validateOffer(multiQty, '00004007000', {}), null, 'Quantity > 1 must reject');

  const good = validItem('00004007000');
  assert.ok(engine.validateOffer(good, '00004007000', {}), 'Single genuine unit must pass');
});

test('Phase 76C.14: missing part number in title/mpn fails closed', () => {
  const engine = makeEngine(parts100);
  const noPart = validItem('00004007000', { title: 'Zündkerze NGK generisch', mpn: undefined });
  assert.equal(engine.validateOffer(noPart, '00004007000', {}), null);
});

test('Phase 76C.15: consolidation dedupes and sorts by price per marketplace', () => {
  const engine = makeEngine(parts100);
  const offers = [
    { part_number: '00004007000', marketplace: 'EBAY_DE', item_id: 'a', price: 9.99 },
    { part_number: '00004007000', marketplace: 'EBAY_DE', item_id: 'b', price: 5.99 },
    { part_number: '00004007000', marketplace: 'EBAY_NL', item_id: 'c', price: 7.49 },
    { part_number: '11210201200', marketplace: 'EBAY_DE', item_id: 'd', price: 49.99 }
  ];
  const consolidated = engine.consolidateOffers(offers);
  assert.equal(consolidated.size, 2, 'Two distinct parts');
  const deList = consolidated.get('00004007000').get('EBAY_DE');
  assert.equal(deList.length, 2);
  assert.equal(deList[0].item_id, 'b', 'Sorted by price ascending');
  assert.equal(deList[1].item_id, 'a');
});

test('Phase 76C.16: invalid affiliate URL and missing NL shipping fail closed', () => {
  const engine = makeEngine(parts100);
  const noAff = validItem('00004007000', { itemAffiliateWebUrl: undefined });
  assert.equal(engine.validateOffer(noAff, '00004007000', {}), null, 'Missing affiliate URL must reject');

  const badAff = validItem('00004007000', { itemAffiliateWebUrl: 'https://evil.example/itm/1' });
  assert.equal(engine.validateOffer(badAff, '00004007000', {}), null, 'Non-eBay URL must reject');

  const wrongCampaign = validItem('00004007000', { itemAffiliateWebUrl: `https://www.ebay.de/itm/1001?campid=9999999999` });
  const parsed = engine.validateOffer(wrongCampaign, '00004007000', {});
  if (parsed) {
    assert.ok(!parsed.affiliate_url.includes('campid=9999999999'), 'Wrong campaign must not be trusted');
  }

  const noNl = validItem('00004007000', { shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['DE'] }] });
  assert.equal(engine.validateOffer(noNl, '00004007000', {}), null, 'Non-NL shipping must reject');
});

test('Phase 76C.17: multi-vendor + multi-marketplace search coverage', async () => {
  const vendors = ['saegenspezi_de', 'second_seller', 'third_seller'];
  const searchedVendors = [];
  const searchedMarkets = [];
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    const filter = u.searchParams.get('filter') || '';
    const sellerMatch = filter.match(/sellers:\{([^}]+)\}/);
    searchedVendors.push(sellerMatch ? sellerMatch[1] : 'ALL');
    searchedMarkets.push(init.headers['X-EBAY-C-MARKETPLACE-ID']);
    return reply({ itemSummaries: [validItem('00004007000')] });
  };
  const apiClient = new EbayBrowseApiClient({
    clientId: 'id', clientSecret: 'secret', epnCampaignId: CAMPAIGN, mockToken: 'token',
    sleepFn: async () => {}, fetchFn, defaultSeller: vendors[0]
  });
  const engine = new EbayHighVolumeEngine({ apiClient, vendors, batchDelayMs: 0 });
  await engine.processBatch(['00004007000'], { maxItems: 1, knownParts });
  // 2 marketplaces × 3 vendors = 6 searches
  assert.equal(searchedVendors.length, 6, 'All vendors must be searched on both marketplaces');
  assert.ok(searchedVendors.includes('second_seller'));
  assert.ok(searchedVendors.includes('third_seller'));
  assert.ok(searchedMarkets.includes('EBAY_NL'));
  assert.ok(searchedMarkets.includes('EBAY_DE'));
});
