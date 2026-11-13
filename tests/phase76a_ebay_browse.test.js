import test from 'node:test';
import assert from 'node:assert/strict';
import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';

process.env.EBAY_ENABLED = 'true';
const campaign = '5339245312';
const part = '11210201200';
const item = (overrides = {}) => ({
  itemId: 'v1|123|0', title: 'STIHL 1121 020 1200 cylinder',
  itemAffiliateWebUrl: `https://www.ebay.de/itm/123?campid=${campaign}`,
  itemWebUrl: 'https://www.ebay.de/itm/123',
  price: { value: '20.00', currency: 'EUR' },
  shippingOptions: [{ shipToLocations: ['NL'], shippingCost: { value: '5.00', currency: 'EUR' } }],
  ...overrides
});
const client = (fetchFn, options = {}) => new EbayBrowseApiClient({
  clientId: 'id', clientSecret: 'secret', epnCampaignId: campaign, mockToken: 'token',
  sleepFn: async () => {}, fetchFn, ...options
});
const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('OAuth uses client credentials and scope, caches token', async () => {
  const calls = [];
  const api = client(async (url, init) => {
    calls.push([url, init]);
    return url.includes('oauth2/token') ? reply({ access_token: 'issued', expires_in: 3600 }) : reply({ itemSummaries: [] });
  }, { mockToken: null });
  assert.equal((await api.searchItems({ partNumber: part })).success, true);
  assert.equal(calls.filter(([url]) => url.includes('oauth2/token')).length, 1);
  assert.equal(new URLSearchParams(calls[0][1].body).get('scope'), 'https://api.ebay.com/oauth/api_scope');
  assert.equal(calls[0][1].headers.Authorization, `Basic ${Buffer.from('id:secret').toString('base64')}`);
  assert.deepEqual(calls.slice(1).map(([url]) => new URL(url).searchParams.get('q')), ['1121 020 1200', part, `STIHL ${part}`]);
  assert.equal(calls[1][1].headers['X-EBAY-C-ENDUSERCTX'], `affiliateCampaignId=${campaign},contextualLocation=country%3DNL`);
  assert.equal(calls[1][1].headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_DE');
  await api.searchItems({ partNumber: part });
  assert.equal(calls.length, 4);
});

test('403 and rate limit stop bounded search', async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    const api = client(async () => { calls++; return reply({}, status); });
    const result = await api.searchItems({ partNumber: part });
    assert.equal(result.success, false);
    assert.match(result.errors[0], new RegExp(String(status)));
    assert.equal(calls, 1);
  }
});

test('shipping unknown without destination proof; prices separate', () => {
  const api = client(async () => reply({}));
  const [unknown, proven] = api.parseItemSummaries([item({ shippingOptions: [] }), item({ itemId: 'second', shippingOptions: [{ shipToLocations: ['NL'], shippingCost: { value: '7.50' } }] })], part);
  assert.equal(unknown.ships_to_nl, false);
  assert.equal(unknown.shipping_cost_nl, null);
  assert.equal(proven.ships_to_nl, true);
  assert.equal(proven.item_price, 20);
  assert.equal(proven.shipping_cost_nl, 7.5);
});

test('rejects wrong part, unsafe URL, wrong campaign and missing affiliate URL', () => {
  const api = client(async () => reply({}));
  assert.deepEqual(api.parseItemSummaries([
    item({ itemId: 'wrong', title: 'STIHL 1121 020 1201' }),
    item({ itemId: 'host', itemAffiliateWebUrl: `https://ebay.de.evil.test/itm/1?campid=${campaign}` }),
    item({ itemId: 'http', itemAffiliateWebUrl: `http://www.ebay.de/itm/1?campid=${campaign}` }),
    item({ itemId: 'campaign', itemAffiliateWebUrl: 'https://www.ebay.de/itm/1?campid=123' }),
    item({ itemId: 'missing', itemAffiliateWebUrl: undefined })
  ], part), []);
  assert.equal(api.buildAffiliateUrl(`https://www.ebay.nl/itm/1?campid=${campaign}`), `https://www.ebay.nl/itm/1?campid=${campaign}`);
});

test('deduplicates across queries and caches part', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return reply({ itemSummaries: [item(), item()] }); });
  const result = await api.searchItems({ partNumber: part });
  assert.equal(result.items.length, 1);
  assert.equal(result.total, 1);
  await api.searchItems({ partNumber: part });
  assert.equal(calls, 3);
});

test('NL marketplace and verified substitutes stay bounded', async () => {
  const queries = [];
  const api = client(async (url) => {
    queries.push(new URL(url).searchParams.get('q'));
    return reply({ itemSummaries: [item({ title: 'STIHL 1121 020 1201 substitute' })] });
  }, { marketplaceId: 'EBAY_NL' });
  const result = await api.searchItems({ partNumber: part, verifiedSubstitutes: ['11210201201'] });
  assert.equal(result.items.length, 1);
  assert.deepEqual(queries, ['1121 020 1200', part, `STIHL ${part}`, 'STIHL 11210201201']);
});

test('missing credentials prevent network calls', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return reply({}); }, { clientId: '', clientSecret: '', mockToken: null });
  assert.equal((await api.searchItems({ partNumber: part })).success, false);
  assert.deepEqual(api.preflight().missing, ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET']);
  assert.equal(calls, 0);
});

test('kill switch and missing campaign prevent all network calls; preflight names only', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return reply({}); });
  const prior = process.env.EBAY_ENABLED;
  try {
    delete process.env.EBAY_ENABLED;
    assert.equal((await api.searchItems({ partNumber: part })).success, false);
    process.env.EBAY_ENABLED = 'false';
    assert.equal((await api.searchItems({ partNumber: part })).success, false);
    assert.equal(api.preflight().enabled, false);
  } finally {
    if (prior === undefined) delete process.env.EBAY_ENABLED;
    else process.env.EBAY_ENABLED = prior;
  }
  const invalid = client(async () => { calls++; return reply({}); }, { epnCampaignId: '' });
  assert.equal((await invalid.searchItems({ partNumber: part })).success, false);
  assert.deepEqual(invalid.preflight().missing, ['EBAY_EPN_CAMPAIGN_ID']);
  assert.equal(calls, 0);
});
