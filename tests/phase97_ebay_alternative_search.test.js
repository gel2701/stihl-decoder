/**
 * tests/phase97_ebay_alternative_search.test.js
 *
 * Phase 97 — the only search-level change: a caller may add query hints so a
 * part with only title-only listings gets a second look at other sellers. The
 * hints must reach the Browse API request and are forwarded by the engine per
 * part; they never affect the ACCEPT/REVIEW/REJECT decision.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';

const { EbayBrowseApiClient } = await import('../src/affiliate/EbayBrowseApiClient.js');
const { EbayHighVolumeEngine } = await import('../src/affiliate/EbayHighVolumeEngine.js');

function captureClient() {
  const urls = [];
  const fetchFn = async url => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ itemSummaries: [] })
    };
  };
  const client = new EbayBrowseApiClient({
    clientId: 'test',
    clientSecret: 'test',
    epnCampaignId: '5339245312',
    mockToken: 'token',
    fetchFn,
    sleepFn: async () => {}
  });
  return { client, urls };
}

test('Phase 97 — 1. query hints are added to the Browse request', async () => {
  const { client, urls } = captureClient();
  const result = await client.searchItems({
    partNumber: '11226642200',
    marketplace: 'EBAY_DE',
    seller: 'ALL',
    limit: 10,
    extraQueries: ['STIHL 11226642200 Abdeckblech']
  });
  assert.equal(result.success, true);
  const queries = urls.map(url => new URL(url).searchParams.get('q'));
  assert.ok(queries.includes('STIHL 11226642200 Abdeckblech'), 'the hint must be queried');
  assert.ok(queries.includes('1122 664 2200'), 'the exact-number ladder must stay');
  assert.equal(queries.length, 4);
});

test('Phase 97 — 2. without hints the request is unchanged', async () => {
  const { client, urls } = captureClient();
  await client.searchItems({ partNumber: '11226642200', marketplace: 'EBAY_NL', seller: 'ALL', limit: 10 });
  const queries = urls.map(url => new URL(url).searchParams.get('q'));
  assert.deepEqual(queries, ['1122 664 2200', '11226642200', 'STIHL 11226642200']);
});

test('Phase 97 — 3. hints are capped at three per search', async () => {
  const { client, urls } = captureClient();
  await client.searchItems({
    partNumber: '11226642200',
    marketplace: 'EBAY_DE',
    seller: 'ALL',
    limit: 10,
    extraQueries: ['a', 'b', 'c', 'd', 'e']
  });
  const queries = urls.map(url => new URL(url).searchParams.get('q'));
  assert.deepEqual(queries.slice(3), ['a', 'b', 'c']);
});

test('Phase 97 — 4. the engine forwards the hints of exactly that part', async () => {
  const seen = [];
  const apiClient = {
    searchItems: async params => {
      seen.push({ partNumber: params.partNumber, extraQueries: params.extraQueries });
      return { success: true, items: [], errors: [], stats: { raw_count: 0, client_passed_count: 0, client_rejected_count: 0 } };
    }
  };
  const engine = new EbayHighVolumeEngine({
    apiClient,
    marketplaces: ['EBAY_DE', 'EBAY_NL'],
    vendors: ['ALL'],
    batchDelayMs: 0,
    enrich: false
  });
  await engine.processBatch(['11226642200'], {
    maxItems: 1,
    enrich: false,
    queryHintsByPart: { '11226642200': ['STIHL 11226642200 Abdeckblech'] }
  });
  assert.equal(seen.length, 2);
  for (const call of seen) {
    assert.equal(call.partNumber, '11226642200');
    assert.deepEqual(call.extraQueries, ['STIHL 11226642200 Abdeckblech']);
  }
});
