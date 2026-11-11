/**
 * tests/phase76c_ebay_live_offer_validation.test.js
 *
 * Phase 76C — eBay Live Offer Validation (no credentials needed).
 * Reproduces the Phase 76B observation: German Browse results for spark
 * plug 0000 400 7000 contain unrelated carburetor listings. Verifies that
 * the parsing/matching layer rejects those offers fail-closed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { EbaySyncEngine } from '../src/affiliate/EbaySyncEngine.js';

const CAMPAIGN = '5339245312';
process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = CAMPAIGN;
process.env.EBAY_CLIENT_ID = 'test_client_id';
process.env.EBAY_CLIENT_SECRET = 'test_client_secret';
delete process.env.EBAY_AFFILIATE_ENABLED;

const affUrl = (host, campaign = CAMPAIGN) => `https://www.${host}/itm/1001?campid=${campaign}`;
const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

const client = (marketplaceId = 'EBAY_DE', overrides = {}) => new EbayBrowseApiClient({
  clientId: 'id',
  clientSecret: 'secret',
  epnCampaignId: CAMPAIGN,
  mockToken: 'token',
  sleepFn: async () => {},
  fetchFn: async () => reply({}),
  marketplaceId,
  ...overrides
});

// Raw eBay Browse API response as observed in the Phase 76B production test:
// German search for spark plug 0000 400 7000 (NGK BPMR7A) returned carburetors.
const DE_RAW_ITEMS = [
  // Legit spark plugs
  { itemId: 'de1', title: 'NGK BPMR7A Zündkerze passend für STIHL 0000 400 7000 Sägenspezi', mpn: '0000 400 7000', price: { value: '6.95', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL', 'DE'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  { itemId: 'de2', title: 'Zündkerze NGK BPMR7A STIHL 00004007000 Motorsäge', price: { value: '5.50', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '0.00', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  // Carburetor contamination (no part number in title — must be rejected)
  { itemId: 'de3', title: 'Vergaser passend für Stihl MS 250 Sägenspezi', price: { value: '29.90', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  { itemId: 'de4', title: 'Original Stihl Qualität Vergaser MS 170 MS 180', price: { value: '24.90', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  { itemId: 'de5', title: 'Membran Vergaser Kit für STIHL MS 460 MS 660', price: { value: '19.90', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  // Misleading model mention without part number
  { itemId: 'de6', title: 'Zündkerze passend für STIHL MS 250 Zündkerzenwechsel', price: { value: '4.99', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  // Bundle false positive: carburetor kit that merely references the plug number
  { itemId: 'de7', title: 'Vergaser Tuning Kit für STIHL MS 250 mit Zündkerze 0000 400 7000', price: { value: '39.90', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  // Different spark plug part number (0000 400 7011 = NGK CMR6H)
  { itemId: 'de8', title: 'Zündkerze NGK CMR6H passend STIHL 0000 400 7011', price: { value: '5.95', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de'), condition: 'NEW' },
  // Affiliate URL with wrong campaign
  { itemId: 'de9', title: 'NGK BPMR7A Zündkerze STIHL 0000 400 7000', price: { value: '6.95', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: affUrl('ebay.de', '9999999999'), condition: 'NEW' },
  // Missing affiliate URL
  { itemId: 'de10', title: 'NGK BPMR7A Zündkerze STIHL 0000 400 7000', price: { value: '6.95', currency: 'EUR' }, seller: { username: 'saegenspezi_de' }, shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['NL'] }], itemAffiliateWebUrl: undefined, condition: 'NEW' }
];

const SPARK_PLUG_PARTS = ['00004007000', '00004007011', '00004007025', '00006421223'];

test('Phase 76C: 1. Browse API part validation accepts all four spark plug part numbers on NL and DE', async () => {
  for (const marketplaceId of ['EBAY_NL', 'EBAY_DE']) {
    for (const part of SPARK_PLUG_PARTS) {
      const api = client(marketplaceId);
      const res = await api.searchItems({ partNumber: part });
      assert.equal(res.success, true, `${marketplaceId} must accept ${part}`);
      assert.deepEqual(res.items, []);
    }
  }
  const badMarket = client('EBAY_US');
  const res = await badMarket.searchItems({ partNumber: SPARK_PLUG_PARTS[0] });
  assert.equal(res.success, false);
  assert.match(res.errors[0], /marketplace/i);
});

test('Phase 76C: 2. German carburetor contamination is blocked fail-closed', () => {
  const api = client('EBAY_DE');
  const parsed = api.parseItemSummaries(DE_RAW_ITEMS, '00004007000');
  const ids = parsed.map(i => i.item_id);
  // Only the two legit spark plug offers with part number + affiliate URL survive
  assert.deepEqual(ids.sort(), ['de1', 'de2']);
  for (const item of parsed) {
    assert.ok(item.affiliate_url.includes(`campid=${CAMPAIGN}`), 'Every accepted offer must carry campaign ID');
    assert.equal(item.ships_to_nl, true);
  }
  // Carburetors, model-only claims, wrong plug, wrong campaign, missing URL all rejected
  for (const rejected of ['de3', 'de4', 'de5', 'de6', 'de7', 'de8', 'de9', 'de10']) {
    assert.equal(ids.includes(rejected), false, `${rejected} must be blocked`);
  }
});

test('Phase 76C: 3. Shipping to NL distinguishes paid, free and unknown per offer', () => {
  const api = client('EBAY_DE');
  const parsed = api.parseItemSummaries(DE_RAW_ITEMS, '00004007000');
  const byId = new Map(parsed.map(i => [i.item_id, i]));
  // Paid shipping
  assert.equal(byId.get('de1').shipping_cost_nl, 5.95);
  // Free shipping (0.00)
  assert.equal(byId.get('de2').shipping_cost_nl, 0);
  // Unknown destination never marked confirmed
  const unknown = api.parseItemSummaries([{
    itemId: 'de11',
    title: 'Zündkerze NGK BPMR7A STIHL 0000 400 7000',
    itemAffiliateWebUrl: affUrl('ebay.de'),
    shippingOptions: [{ shippingCost: { value: '5.95', currency: 'EUR' }, shipToLocations: ['DE'] }]
  }], '00004007000');
  assert.equal(unknown.length, 0, 'Non-NL destination must not be offered');
});

test('Phase 76C: 4. Provider blocks cached carburetor and unverified offers, accepts verified ones', () => {
  const cached = new Map([
    ['00004007000', [
      { item_id: 'v1|1|0', title: 'Vergaser passend für Stihl MS 250 Sägenspezi', marketplace: 'EBAY_DE', part_number: '00004007000', seller_name: 'saegenspezi_de', item_price: 29.9, shipping_cost_nl: 5.95, currency: 'EUR', ships_to_nl: true, itemAffiliateWebUrl: affUrl('ebay.de'), affiliate_url: affUrl('ebay.de') },
      { item_id: 'v1|2|0', title: 'NGK BPMR7A Zündkerze passend für STIHL 0000 400 7000', marketplace: 'EBAY_DE', part_number: '00004007000', seller_name: 'saegenspezi_de', item_price: 6.95, shipping_cost_nl: 5.95, currency: 'EUR', ships_to_nl: true, itemAffiliateWebUrl: affUrl('ebay.de'), affiliate_url: affUrl('ebay.de') }
    ]]
  ]);
  const provider = new EbayAffiliateProvider({ cachedOffers: cached });
  const offers = provider.getOffers({ partNumber: '0000 400 7000', partName: 'Zündkerze' });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].item_id, 'v1|2|0');
  assert.equal(offers[0].provider, 'ebay');
  assert.equal(offers[0].marketplace, 'ebay.de');
  assert.equal(offers[0].shipping_status, 'SHIPS_TO_NL_CONFIRMED');
  assert.ok(offers[0].url.includes(`campid=${CAMPAIGN}`));
});

test('Phase 76C: 5. Verified replacement references accepted, unverified rejected', () => {
  const base = (itemId) => ({
    item_id: itemId,
    title: 'NGK Zündkerze passend für STIHL 0000 400 7011 Sägenspezi',
    marketplace: 'EBAY_DE',
    part_number: '00004007011',
    seller_name: 'saegenspezi_de',
    item_price: 6.95,
    shipping_cost_nl: 5.95,
    currency: 'EUR',
    ships_to_nl: true,
    itemAffiliateWebUrl: affUrl('ebay.de'),
    affiliate_url: affUrl('ebay.de')
  });
  const verified = new Map([['00004007000', [{ ...base('v1|3|0'), verified_replacements: [{ part_number: '00004007000', replacement_part_number: '00004007011', verified: true }] }]]]);
  const unverified = new Map([['00004007000', [{ ...base('v1|4|0'), verified_replacements: [{ part_number: '00004007000', replacement_part_number: '00004007011', verified: false }] }]]]);
  const pVerified = new EbayAffiliateProvider({ cachedOffers: verified });
  assert.equal(pVerified.getOffers({ partNumber: '00004007000' }).length, 1);
  const pUnverified = new EbayAffiliateProvider({ cachedOffers: unverified });
  assert.equal(pUnverified.getOffers({ partNumber: '00004007000' }).length, 0);
});

test('Phase 76C: 6. Sync engine accepts only verified offers from contaminated German results', async () => {
  const api = client('EBAY_DE', {
    fetchFn: async () => reply({ itemSummaries: DE_RAW_ITEMS })
  });
  const engine = new EbaySyncEngine({ apiClient: api, batchDelayMs: 0 });
  const summary = await engine.syncBatch(['00004007000'], { maxItems: 1000 });
  assert.equal(summary.scanned_count, 1);
  assert.equal(summary.matched_count, 2, 'Only the two verified spark plug offers count as matches');
  assert.equal(summary.valid_nl_shipping_count, 2);
  assert.equal(summary.deactivated_count, 0);
  for (const offer of summary.active_offers) {
    assert.ok(offer.affiliate_url.includes(`campid=${CAMPAIGN}`));
    assert.equal(offer.ships_to_nl, true);
    assert.ok(offer.title.includes('0000 400 7000') || offer.title.includes('00004007000'));
  }
});
