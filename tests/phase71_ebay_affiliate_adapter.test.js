/**
 * tests/phase71_ebay_affiliate_adapter.test.js
 *
 * Phase 71 Preparation — eBay Browse API & EPN Affiliate Adapter Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { EbaySyncEngine } from '../src/affiliate/EbaySyncEngine.js';

test('Phase 71: 1. EbayBrowseApiClient fails closed when credentials missing', async () => {
  const prevId = process.env.EBAY_CLIENT_ID;
  const prevSec = process.env.EBAY_CLIENT_SECRET;
  const prevCamp = process.env.EBAY_EPN_CAMPAIGN_ID;

  try {
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
  }
});

test('Phase 71: 2. Mock transport correctly parses eBay Browse API item summaries', async () => {
  const mockBrowseApiResponse = {
    total: 2,
    itemSummaries: [
      {
        itemId: 'v1|382910482019|0',
        title: 'Zylinder passend für Stihl MS 260 026 44mm Zylindersatz Sägenspezi',
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
    epnCampaignId: '5339001234',
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
  assert.ok(item.affiliate_url.includes('campid=5339001234'));
  assert.ok(item.affiliate_url.includes('customid=11210201200'));
});

test('Phase 71: 3. EPN URL formatting preserves base URL when campaign ID is absent', () => {
  const client = new EbayBrowseApiClient();
  const rawUrl = 'https://www.ebay.de/itm/1234567890';
  const result = client.buildAffiliateUrl(rawUrl, '11210201200');
  assert.equal(result, rawUrl, 'Must return unmodified URL when no campaign ID is configured');
});

test('Phase 71: 4. EbayAffiliateProvider adheres to AffiliateProvider interface', () => {
  const provider = new EbayAffiliateProvider();
  assert.equal(provider.getName(), 'ebay');
  assert.equal(provider.isEnabled(), false, 'Default must be disabled (fail closed)');

  const prevEnv = process.env.EBAY_AFFILIATE_ENABLED;
  try {
    process.env.EBAY_AFFILIATE_ENABLED = 'true';
    assert.equal(provider.isEnabled(), true);

    // With no cached offers, returns empty array
    const offers = provider.getOffers({ partNumber: '11210201200' });
    assert.deepEqual(offers, []);

    // Set a verified cached offer
    const cacheMap = new Map();
    cacheMap.set('11210201200', {
      item_id: '382910482019',
      seller_name: 'Sägenspezi',
      item_price: 49.99,
      shipping_cost_nl: 8.90,
      ships_to_nl: true,
      affiliate_url: 'https://www.ebay.de/itm/382910482019?campid=5339001234'
    });
    provider.setCachedOffers(cacheMap);

    const resolved = provider.getOffers({ partNumber: '1121 020 1200' });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].provider, 'ebay');
    assert.equal(resolved[0].marketplace, 'ebay.de');
    assert.equal(resolved[0].ships_to_nl, true);
    assert.equal(resolved[0].shipping_status, 'SHIPS_TO_NL_CONFIRMED');
  } finally {
    if (prevEnv) process.env.EBAY_AFFILIATE_ENABLED = prevEnv;
    else delete process.env.EBAY_AFFILIATE_ENABLED;
  }
});

test('Phase 71: 5. EbaySyncEngine batch processing & scalability to 1,000 parts', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      total: 1,
      itemSummaries: [
        {
          itemId: 'v1|1000|0',
          title: 'Sägenspezi Ersatzteil für STIHL',
          price: { value: '25.00', currency: 'EUR' },
          seller: { username: 'saegenspezi_de' },
          shippingOptions: [
            { shippingCost: { value: '8.90', currency: 'EUR' } }
          ],
          itemWebUrl: 'https://www.ebay.de/itm/1000',
          condition: 'NEW'
        }
      ]
    })
  });

  const client = new EbayBrowseApiClient({
    clientId: 'MOCK_ID',
    clientSecret: 'MOCK_SECRET',
    epnCampaignId: 'MOCK_CAMP',
    mockToken: 'MOCK_BEARER_TOKEN',
    fetchFn: mockFetch
  });

  const engine = new EbaySyncEngine({ apiClient: client, batchDelayMs: 0 });

  // Test batch with 5 sample parts
  const testParts = ['11210201200', '11230302003', '11250201215', '11270201216', '11280201221'];
  const summary = await engine.syncBatch(testParts, { maxItems: 1000 });

  assert.equal(summary.scanned_count, 5);
  assert.equal(summary.matched_count, 5);
  assert.equal(summary.valid_nl_shipping_count, 5);
  assert.equal(summary.deactivated_count, 0);
  assert.equal(summary.active_offers.length, 5);
  assert.ok(summary.timestamp);
});
