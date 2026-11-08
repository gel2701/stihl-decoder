import assert from 'node:assert/strict';
import { AmazonCreatorsClient } from '../src/affiliate/AmazonCreatorsClient.js';

async function run() {
  const disabled = new AmazonCreatorsClient();
  await assert.rejects(disabled.getItems({}), { code: 'CREATORS_DISABLED' });
  for (const config of [
    { enabled: true },
    { enabled: true, transport: () => {}, marketplace: 'amazon.invalid', partnerTag: 'tag', perSecond: 1, daily: 1 },
    { enabled: true, transport: () => {}, marketplace: 'amazon.nl', partnerTag: '', perSecond: 1, daily: 1 },
    { enabled: true, transport: () => {}, marketplace: 'amazon.nl', partnerTag: 'tag', perSecond: 0, daily: 1 }
  ]) assert.throws(() => new AmazonCreatorsClient(config), { code: 'CREATORS_INVALID_CONFIG' });

  let time = Date.parse('2026-01-01T00:00:00Z');
  const requests = [];
  const client = new AmazonCreatorsClient({
    enabled: true, marketplace: 'amazon.nl', partnerTag: 'test-tag', perSecond: 2, daily: 4,
    now: () => time,
    transport: async request => { requests.push(request); return { ok: true }; }
  });
  await assert.rejects(client.getItems(null), { code: 'CREATORS_INVALID_REQUEST' });
  for (const [method, operation] of [
    ['getItems', 'GetItems'], ['searchItems', 'SearchItems'],
    ['getVariations', 'GetVariations'], ['getBrowseNodes', 'GetBrowseNodes']
  ]) {
    assert.deepEqual(await client[method]({ query: operation }), { ok: true });
    assert.equal(requests.at(-1).operation, operation);
    assert.equal(requests.at(-1).marketplace, 'amazon.nl');
    assert.equal(requests.at(-1).partnerTag, 'test-tag');
    assert.deepEqual(requests.at(-1).params, { query: operation });
    if (requests.length === 2) {
      await assert.rejects(client.getItems({}), { code: 'CREATORS_QUOTA_EXCEEDED' });
      time += 1000;
    }
  }
  assert.equal(requests.length, 4);
  await assert.rejects(client.getItems({}), { code: 'CREATORS_QUOTA_EXCEEDED' });
  time += 86400000;
  assert.deepEqual(await client.getItems({}), { ok: true });
  time -= 1;
  await assert.rejects(client.getItems({}), { code: 'CREATORS_CLOCK_ERROR' });

  const secret = 'private-token-value';
  const broken = new AmazonCreatorsClient({
    enabled: true, marketplace: 'amazon.nl', partnerTag: 'test-tag', perSecond: 1, daily: 1,
    transport: async () => { throw new Error(secret); }
  });
  await assert.rejects(broken.searchItems({}), error => {
    assert.equal(error.code, 'CREATORS_TRANSPORT_ERROR');
    assert.equal(JSON.stringify(error).includes(secret), false);
    assert.equal(String(error).includes(secret), false);
    assert.equal(error.cause, undefined);
    return true;
  });
  await assert.rejects(broken.searchItems({}), { code: 'CREATORS_QUOTA_EXCEEDED' });
  console.log('Phase 65 Creators client: PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
