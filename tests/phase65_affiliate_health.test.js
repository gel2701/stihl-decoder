import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAmazonLink, classifyAmazonResponse, extractAmazonAsin, normalizeAmazonUrl } from '../src/affiliate/AmazonLinkValidator.js';
import { checkAmazonHealth } from '../src/affiliate/AmazonHealthMonitor.js';

const product = `https://amazon.nl/dp/${'B0068M5NAG'}?tag=test-21&extra=keep`;
const offer = { part_number: '11104007005', asin: 'B0068M5NAG', marketplace: 'amazon.nl', affiliate_tag: 'test-21', direct_affiliate_url: product, status: 'ACTIVE' };
const expected = { asin: offer.asin, marketplace: offer.marketplace, tag: offer.affiliate_tag };

test('strict product and search URLs retain API parameters', () => {
  assert.deepEqual(validateAmazonLink(product, expected), { valid: true, kind: 'PRODUCT', url: product, asin: offer.asin });
  assert.equal(validateAmazonLink('https://amazon.nl/gp/product/B0068M5NAG?tag=test-21', expected).valid, true);
  assert.equal(validateAmazonLink(`https://www.amazon.nl/dp/${offer.asin}?tag=test-21`, expected).valid, true);
  assert.equal(extractAmazonAsin(product), offer.asin);
  assert.equal(extractAmazonAsin('https://amazon.nl/s?k=test&tag=test-21'), null);
  assert.equal(normalizeAmazonUrl(`https://www.amazon.nl/dp/${offer.asin}?tag=test-21&extra=keep`, expected), product);
  assert.equal(validateAmazonLink('https://amazon.nl/s?k=stihl&tag=test-21', { marketplace: 'amazon.nl', tag: 'test-21' }).kind, 'SEARCH_FALLBACK');
  for (const url of [`https://amazon.nl.evil.com/dp/${offer.asin}?tag=test-21`, `http://amazon.nl/dp/${offer.asin}?tag=test-21`, `https://evil@amazon.nl/dp/${offer.asin}?tag=test-21`, `https://amazon.de/dp/${offer.asin}?tag=test-21`, `https://amazon.nl/dp/${offer.asin}?tag=test-21&tag=other`, `https://amazon.nl/dp/${offer.asin}`, `https://amazon.nl/dp/${offer.asin}/redirect?tag=test-21`]) {
    assert.equal(validateAmazonLink(url, expected).valid, false, url);
  }
  assert.equal(validateAmazonLink(`https://amazon.nl/dp/${'B001RMA5S2'}?tag=test-21`, expected).reason, 'PRODUCT_MISMATCH');
});

test('response classification needs no requests or redirects', () => {
  assert.equal(classifyAmazonResponse({ status: 429 }, expected), 'TEMPORARY_FAILURE');
  assert.equal(classifyAmazonResponse({ status: 401 }, expected), 'TEMPORARY_FAILURE');
  assert.equal(classifyAmazonResponse({ status: 404 }, expected), 'UNAVAILABLE');
  assert.equal(classifyAmazonResponse({ status: 200, url: `https://amazon.nl/dp/${'B001RMA5S2'}?tag=test-21` }, expected), 'PRODUCT_MISMATCH');
  assert.equal(classifyAmazonResponse({ status: 200, url: product }, expected), 'UNKNOWN');
  assert.equal(classifyAmazonResponse({ status: 200, url: product, asin: offer.asin }, expected), 'HEALTHY');
});

test('monitor checks only active entries, writes separate atomic status transitions on request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'amazon-health-'));
  try {
    const registryPath = join(dir, 'registry.json');
    const outputPath = join(dir, 'health.json');
    const original = JSON.stringify({ offers: [offer, { ...offer }, { ...offer, status: 'STAGED' }] });
    await writeFile(registryPath, original);
    const first = await checkAmazonHealth({ registryPath, now: () => 'today' });
    assert.deepEqual(first.results.map(item => item.state), ['UNKNOWN', 'WARNING']);
    assert.equal(first.results[1].reason, 'DUPLICATE');
    assert.equal(await readFile(registryPath, 'utf8'), original);
    await checkAmazonHealth({ registryPath, outputPath, inspect: async () => ({ status: 200, url: product, asin: offer.asin }), now: () => 'today' });
    const second = await checkAmazonHealth({ registryPath, outputPath, inspect: async () => ({ status: 429 }), now: () => 'tomorrow' });
    assert.equal(second.results[0].state, 'TEMPORARY_FAILURE');
    assert.deepEqual(second.transitions, [{ part_number: offer.part_number, asin: offer.asin, from: 'HEALTHY', to: 'TEMPORARY_FAILURE', checked_at: 'tomorrow' }]);
    assert.deepEqual(second.history, second.transitions);
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), second);
    await assert.rejects(checkAmazonHealth({ registryPath, outputPath: registryPath }));
    assert.equal(await readFile(registryPath, 'utf8'), original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
