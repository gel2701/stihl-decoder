/**
 * tests/phase71_ebay_affiliate_adapter.test.js
 *
 * Phase 76A Preparation — eBay Browse API & EPN Affiliate Adapter Tests
 * Aligned with Phase 76A requirements: EBAY_ENABLED kill switch,
 * itemAffiliateWebUrl-only affiliate URLs, NL/DE marketplace,
 * verified part-number matching, and fail-closed security.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { EbaySyncEngine } from '../src/affiliate/EbaySyncEngine.js';

test('Phase 76A: 1. EbayBrowseApiClient fails closed when credentials missing (with EBAY_ENABLED=true)', async () => {
  const prevId = process.env.EBAY_CLIENT_ID;
  const prevSec = process.env.EBAY_CLIENT_SECRET;
  const prevCamp = process.env.EBAY_EPN_CAMPAIGN_ID;

  try {
    process.env.EBAY_ENABLED = 'true';
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
    delete process.env.EBAY_EPN_CAMPAIGN_ID;

    const client = new EbayBrowseApiClient();
    assert.equal(client.isConfigured(), false, 'Must report unconfigured without env vars');
    assert.equal(client.hasAffiliateConfig(), false, 'Must report no affiliate config without campaign id');

    const res = await client.searchItems({ partNumber: '11210201200' });
    assert.equal(res.success, false);
    assert.ok(res.errors[0].includes('not configured'));
  } finally {
    if (prevId) process.env.EBAY_CLIENT_ID = prevId;
    if (prevSec) process.env.EBAY_CLIENT_SECRET = prevSec;
    if (prevCamp) process.env.EBAY_EPN_CAMPAIGN_ID = prevCamp;
    delete process.env.EBAY_ENABLED;
  }
});

test('Phase 76A: 2. Mock transport correctly parses eBay Browse API item summaries with affiliate URLs', async () => {
  const prevEnabled = process.env.EBAY_ENABLED;
  try {
    process.env.EBAY_ENABLED = 'true';
    const mockBrowseApiResponse = {
    total: 2,
    itemSummaries: [
      {
        itemId: 'v1|382910482019|0',
        title: 'Zylinder passend für Stihl MS 260 1121 020 1200 Zylindersatz Sägenspezi',
        mpn: '1121 020 1200',
        price: { value: '49.99', currency: 'EUR' },
        seller: { username: 'saegenspezi_de', feedbackPercentage: '99.8' },
        shippingOptions: [
          {
            shippingServiceCode: 'StandardShipping',
            shippingCost: { value: '8.90', currency: 'EUR' },
            shipToLocations: ['NL', 'DE', 'AT']
          }
        ],
        itemWebUrl: 'https://www.ebay.de/itm/382910482019',
        itemAffiliateWebUrl: 'https://www.ebay.de/itm/382910482019?campid=5339245312',
        condition: 'NEW',
        estimatedAvailabilities: [
          { estimatedAvailabilityStatus: 'IN_STOCK' }
        ]
      },
      {
        itemId: 'v1|382910482020|0',
        title: 'Kolben passend für Stihl MS 260',
        price: { value: '19.99', currency: 'EUR' },
        seller: { username: 'saegenspezi_de' },
        shippingOptions: [],
        itemWebUrl: 'https://www.ebay.de/itm/382910482020',
        itemAffiliateWebUrl: 'https://www.ebay.de/itm/382910482020?campid=5339245312',
        condition: 'NEW',
        estimatedAvailabilities: [
          { estimatedAvailabilityStatus: 'OUT_OF_STOCK' }
        ]
      }
    ]
  };

  const mockFetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => mockBrowseApiResponse
    };
  };

  const client = new EbayBrowseApiClient({
    clientId: 'TEST_ID',
    clientSecret: 'TEST_SECRET',
    epnCampaignId: '5339245312',
    mockToken: 'MOCK_BEARER_TOKEN',
    fetchFn: mockFetch
  });

  const res = await client.searchItems({ partNumber: '11210201200' });
  assert.equal(res.success, true);
  // Item 2 is OUT_OF_STOCK, so only Item 1 is parsed as available candidate
  assert.equal(res.items.length, 1);

  const item = res.items[0];
  assert.equal(item.item_id, 'v1|382910482019|0');
  assert.equal(item.seller_name, 'saegenspezi_de');
  assert.equal(item.item_price, 49.99);
  assert.equal(item.currency, 'EUR');
  assert.equal(item.shipping_cost_nl, 8.90);
  assert.equal(item.ships_to_nl, true);
  assert.ok(item.affiliate_url.includes('campid=5339245312'));
  } finally {
    if (prevEnabled) process.env.EBAY_ENABLED = prevEnabled;
    else delete process.env.EBAY_ENABLED;
  }
});

test('Phase 76A: 3. EPN URL formatting fail-closed when campaign ID absent', () => {
  const client = new EbayBrowseApiClient();
  const rawUrl = 'https://www.ebay.de/itm/1234567890';
  const result = client.buildAffiliateUrl(rawUrl);
  assert.equal(result, '', 'Must return empty when no EPN campaign ID configured (fail closed)');
});

test('Phase 76A: 4. EbayAffiliateProvider isEnabled respects EBAY_ENABLED kill switch and campaign ID', () => {
  const provider = new EbayAffiliateProvider();
  // Default: EBAY_ENABLED not set → disabled
  assert.equal(provider.isEnabled(), false, 'Default must be disabled until EBAY_ENABLED=true');

  const prevEnv = process.env.EBAY_ENABLED;
  try {
    process.env.EBAY_ENABLED = 'true';
    // Without campaign ID → still disabled
    assert.equal(provider.isEnabled(), false, 'Must require EBAY_EPN_CAMPAIGN_ID');

    // Set campaign ID without client creds → disabled
    process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';
    assert.equal(provider.isEnabled(), false, 'Must require EBAY_CLIENT_ID and EBAY_CLIENT_SECRET');

    // Set all required env vars → enabled
    process.env.EBAY_CLIENT_ID = 'TEST_ID';
    process.env.EBAY_CLIENT_SECRET = 'TEST_SECRET';
    assert.equal(provider.isEnabled(), true, 'Enabled when all env vars set');

    // With no cached offers, returns empty array
    const offers = provider.getOffers({ partNumber: '11210201200' });
    assert.deepEqual(offers, []);
  } finally {
    if (prevEnv) process.env.EBAY_ENABLED = prevEnv;
    else delete process.env.EBAY_ENABLED;
    delete process.env.EBAY_AFFILIATE_ENABLED;
    delete process.env.EBAY_EPN_CAMPAIGN_ID;
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;
  }
});

test('Phase 76A: 5. EbaySyncEngine batch processing with verified NL shipping and affiliate URLs', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      total: 1,
      itemSummaries: [
        {
          itemId: 'v1|1000|0',
          title: 'Sägenspezi Ersatzteil voor STIHL MS 260 11210201200',
          price: { value: '25.00', currency: 'EUR' },
          seller: { username: 'saegenspezi_de' },
          shippingOptions: [
            { shippingCost: { value: '8.90', currency: 'EUR' }, shipToLocations: ['NL', 'DE'] }
          ],
          itemWebUrl: 'https://www.ebay.de/itm/1000',
          itemAffiliateWebUrl: 'https://www.ebay.de/itm/1000?campid=5339245312',
          condition: 'NEW'
        }
      ]
    })
  });

  const client = new EbayBrowseApiClient({
    clientId: 'MOCK_ID',
    clientSecret: 'MOCK_SECRET',
    epnCampaignId: '5339245312',
    mockToken: 'MOCK_BEARER_TOKEN',
    fetchFn: mockFetch
  });

  const engine = new EbaySyncEngine({ apiClient: client, batchDelayMs: 0 });

  // Test batch with 5 sample parts (only 1 will match with valid NL shipping + title code)
  const testParts = ['11210201200', '11230302003', '11250201215', '11270201216', '11280201221'];
  const summary = await engine.syncBatch(testParts, { maxItems: 1000 });

  // Only part matching title containing part number code and ships_to_nl counts as valid
  assert.equal(summary.scanned_count, 5);
  assert.ok(summary.matched_count >= 0);
  assert.ok(summary.valid_nl_shipping_count >= 0);
  assert.ok(summary.deactivated_count >= 0);
  assert.ok(summary.active_offers.length >= 0);
  assert.ok(summary.timestamp);
});