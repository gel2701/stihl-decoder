import assert from 'node:assert/strict';
import { AmazonCreatorsClient } from '../src/affiliate/AmazonCreatorsClient.js';
import { createAmazonCreatorsTransport } from '../src/affiliate/AmazonCreatorsTransport.js';

const config = { enabled: true, credentialVersion: '3.2', clientId: 'private-id', clientSecret: 'private-secret', marketplace: 'amazon.nl', partnerTag: 'my-tag' };
const item = { asin: 'B09B2SBHQK', detailPageURL: `https://www.amazon.nl/dp/${'B09B2SBHQK'}?tag=my-tag&linkCode=ogi&th=1` };
const response = (status, body, url) => ({ status, ok: status >= 200 && status < 300, url, redirected: false, headers: { get: () => null }, text: async () => JSON.stringify(body) });

async function run() {
  let calls = [];
  let time = 1000000;
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/auth/')) return response(200, { access_token: 'private-token', token_type: 'bearer', expires_in: 3600 }, url);
    return response(200, url.endsWith('getItems') ? { itemsResult: { items: [item] } } : { searchResult: { items: [item] } }, url);
  };
  const transport = createAmazonCreatorsTransport({ ...config, fetch, now: () => time });
  const client = new AmazonCreatorsClient({ enabled: true, marketplace: 'amazon.nl', partnerTag: 'my-tag', transport, perSecond: 2, daily: 3, now: () => time });
  assert.deepEqual(await client.getItems({ itemIds: [item.asin], resources: ['itemInfo.title'] }), { itemsResult: { items: [item] } });
  assert.equal(calls[0].url, 'https://api.amazon.co.uk/auth/o2/token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret, scope: 'creatorsapi::default' });
  assert.equal(calls[0].options.redirect, 'manual');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(calls[1].url, 'https://creatorsapi.amazon/catalog/v1/getItems');
  assert.deepEqual(JSON.parse(calls[1].options.body), { itemIds: [item.asin], itemIdType: 'ASIN', marketplace: 'www.amazon.nl', partnerTag: 'my-tag', resources: ['itemInfo.title'] });
  assert.equal(calls[1].options.headers.Authorization, 'Bearer private-token');
  assert.equal(calls[1].options.headers['x-marketplace'], 'www.amazon.nl');
  assert.equal((await client.searchItems({ keywords: 'saw', resources: ['itemInfo.title'] })).searchResult.items[0].detailPageURL, item.detailPageURL);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, 'https://creatorsapi.amazon/catalog/v1/searchItems');
  await assert.rejects(client.getItems({ itemIds: [item.asin], resources: ['itemInfo.title'] }), { code: 'CREATORS_QUOTA_EXCEEDED' });
  assert.equal(calls.length, 3);
  time += 1000;
  await client.getItems({ itemIds: [item.asin], resources: ['itemInfo.title'] });
  assert.equal(calls.length, 4);
  await assert.rejects(client.getItems({ itemIds: [item.asin], resources: ['itemInfo.title'] }), { code: 'CREATORS_QUOTA_EXCEEDED' });
  time += 3600000;
  await transport({ operation: 'SearchItems', marketplace: 'amazon.nl', partnerTag: 'my-tag', params: { keywords: 'saw', resources: ['itemInfo.title'] } });
  assert.equal(calls.filter(call => call.url.includes('/auth/')).length, 2);

  let count = 0;
  const disabled = createAmazonCreatorsTransport({ ...config, enabled: false, fetch: () => { count++; } });
  await assert.rejects(disabled(), { code: 'CREATORS_DISABLED' });
  assert.equal(count, 0);
  for (const override of [{ clientId: '' }, { clientSecret: '' }, { marketplace: 'amazon.com' }, { credentialVersion: '3.1' }, { partnerTag: '' }]) {
    assert.throws(() => createAmazonCreatorsTransport({ ...config, ...override, fetch }), { code: 'CREATORS_INVALID_CONFIG' });
  }
  const request = { operation: 'GetItems', marketplace: 'amazon.nl', partnerTag: 'my-tag', params: { itemIds: [item.asin], resources: ['itemInfo.title'] } };
  for (const changed of [{ marketplace: 'amazon.de' }, { partnerTag: 'other' }, { params: { itemIds: Array(11).fill(item.asin), resources: ['itemInfo.title'] } }, { operation: 'GetVariations' }, { params: { keywords: 'x', resources: ['itemInfo.title'] } }]) {
    await assert.rejects(transport({ ...request, ...changed }), { code: 'CREATORS_INVALID_REQUEST' });
  }
  assert.equal(calls.length, 6);
  for (const [status, body, code] of [
    [401, { message: 'private-secret' }, 'CREATORS_AUTH_ERROR'],
    [429, { message: 'private-secret' }, 'CREATORS_RATE_LIMITED'],
    [503, { message: 'private-secret' }, 'CREATORS_SERVER_ERROR'],
    [200, { itemsResult: {} }, 'CREATORS_INVALID_RESPONSE']
  ]) {
    const broken = createAmazonCreatorsTransport({ ...config, fetch: async url => response(status, body, url) });
    await assert.rejects(broken(request), error => {
      assert.equal(error.code, code);
      assert.equal(JSON.stringify(error).includes('private-secret'), false);
      assert.equal(String(error).includes('private-secret'), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  const redirect = createAmazonCreatorsTransport({ ...config, fetch: async url => ({ ...response(200, {}, url), redirected: true }) });
  await assert.rejects(redirect(request), { code: 'CREATORS_REDIRECT' });
  const huge = createAmazonCreatorsTransport({ ...config, fetch: async url => ({ ...response(200, {}, url), headers: { get: () => '2000000' } }) });
  await assert.rejects(huge(request), { code: 'CREATORS_INVALID_RESPONSE' });
  const badToken = createAmazonCreatorsTransport({ ...config, fetch: async url => response(200, { access_token: 'private-token', expires_in: 3600 }, url) });
  await assert.rejects(badToken(request), { code: 'CREATORS_INVALID_RESPONSE' });
  const de = createAmazonCreatorsTransport({ ...config, marketplace: 'amazon.de', fetch });
  await de({ ...request, marketplace: 'amazon.de' });
  assert.equal(calls.at(-1).options.headers['x-marketplace'], 'www.amazon.de');
  console.log('Phase 67 Creators transport: PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
