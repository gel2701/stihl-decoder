import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runCreatorsProbe } from '../scripts/phase67_creators_probe.mjs';

const env = {
  AMAZON_CREATORS_CLIENT_ID: 'private-id', AMAZON_CREATORS_CLIENT_SECRET: 'private-secret',
  AMAZON_CREATORS_PARTNER_TAG_NL: 'private-nl-tag', AMAZON_CREATORS_PARTNER_TAG_DE: 'private-de-tag',
  AMAZON_CREATORS_CREDENTIAL_VERSION: '3.2'
};
const base = ['--marketplace', 'amazon.nl'];
const live = [...base, '--live', '--asin', 'B09B2SBHQK'];
let calls = 0;
const fake = async request => {
  calls++;
  assert.equal(request.marketplace, 'amazon.nl');
  assert.equal(request.partnerTag, env.AMAZON_CREATORS_PARTNER_TAG_NL);
  assert.deepEqual(request.params.resources, ['itemInfo.title', 'itemInfo.byLineInfo', 'itemInfo.externalIds', 'itemInfo.productInfo']);
  return { itemsResult: { items: [{ asin: 'B09B2SBHQK', detailPageURL: 'private-url' }] } };
};

assert.deepEqual(await runCreatorsProbe(base, { env: {}, transport: fake }), {
  status: { code: 'MISSING_ENV', missingEnvKeys: ['AMAZON_CREATORS_CLIENT_ID', 'AMAZON_CREATORS_CLIENT_SECRET', 'AMAZON_CREATORS_PARTNER_TAG_NL', 'AMAZON_CREATORS_CREDENTIAL_VERSION'] }, marketplace: 'amazon.nl', count: 0
});
assert.deepEqual(await runCreatorsProbe(['--marketplace', 'amazon.de'], { env: { ...env, AMAZON_CREATORS_PARTNER_TAG_DE: '' }, transport: fake }), {
  status: { code: 'MISSING_ENV', missingEnvKeys: ['AMAZON_CREATORS_PARTNER_TAG_DE'] }, marketplace: 'amazon.de', count: 0
});
assert.deepEqual(await runCreatorsProbe(base, { env, transport: fake }), { status: 'READY', marketplace: 'amazon.nl', count: 0 });
assert.equal(calls, 0);
for (const args of [
  [...base, '--live'], [...base, '--live', '--preflight', '--asin', 'B09B2SBHQK'],
  [...base, '--live', '--asin', 'bad'], [...base, '--live', '--keywords', ''],
  [...base, '--live', '--keywords', 'a'.repeat(201)], [...base, '--live', '--keywords', 'saw\nsecret'],
  [...live, '--keywords', 'saw'], [...live, '--unknown'], ['--marketplace', 'amazon.com', '--live', '--asin', 'B09B2SBHQK'],
  [...base, '--marketplace', 'amazon.de', '--live', '--asin', 'B09B2SBHQK']
]) assert.equal((await runCreatorsProbe(args, { env, transport: fake })).status, 'INVALID_ARGUMENTS');
assert.equal(calls, 0);
assert.equal((await runCreatorsProbe(live, { env: { ...env, AMAZON_CREATORS_CLIENT_SECRET: '' }, transport: fake })).status.code, 'MISSING_ENV');
assert.equal((await runCreatorsProbe(live, { env: { ...env, AMAZON_CREATORS_CREDENTIAL_VERSION: '3.1' }, transport: fake })).status.code, 'MISSING_ENV');
assert.equal(calls, 0);
for (const code of ['CREATORS_AUTH_ERROR', 'CREATORS_RATE_LIMITED']) {
  const result = await runCreatorsProbe(live, { env, transport: async () => { throw Object.assign(new Error('private-secret private-token'), { code }); } });
  assert.deepEqual(result, { status: code, marketplace: 'amazon.nl', count: 0 });
  assert.ok(!JSON.stringify(result).includes('private'));
}
assert.deepEqual(await runCreatorsProbe(live, { env, transport: fake }), {
  status: 'CANDIDATES_UNVERIFIED', marketplace: 'amazon.nl', count: 1, candidateAsins: ['B09B2SBHQK']
});
assert.equal(calls, 1);
assert.deepEqual(await runCreatorsProbe([...base, '--live', '--keywords', 'saw'], { env, transport: async request => {
  assert.equal(request.operation, 'SearchItems');
  return { searchResult: { items: [{ asin: 'B09B2SBHQK' }] } };
} }), { status: 'CANDIDATES_UNVERIFIED', marketplace: 'amazon.nl', count: 1, candidateAsins: ['B09B2SBHQK'] });
assert.deepEqual(await runCreatorsProbe(live, { env, transport: async () => ({ itemsResult: { items: [{ asin: 'bad' }] } }) }), {
  status: 'CREATORS_INVALID_RESPONSE', marketplace: 'amazon.nl', count: 0
});
const cli = JSON.parse(execFileSync(process.execPath, ['scripts/phase67_creators_probe.mjs', ...base], { cwd: new URL('..', import.meta.url), env: { ...process.env, ...env }, encoding: 'utf8' }));
assert.deepEqual(cli, { status: 'READY', marketplace: 'amazon.nl', count: 0 });
console.log('Phase 67 Creators probe: PASS');
