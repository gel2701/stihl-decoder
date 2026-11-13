/**
 * tests/phase76c_high_volume_engine.test.js
 *
 * Phase 76C — High-Volume eBay Affiliate Engine: batches (100/1.000/5.000),
 * checkpoints & resume, multi-vendor/multi-marketplace, 429 backoff,
 * dedupe, strict matching. Deterministic mocks, no real waits or network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';

process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';
process.env.EBAY_CLIENT_ID = 'test_client_id';
process.env.EBAY_CLIENT_SECRET = 'test_client_secret';
delete process.env.EBAY_AFFILIATE_ENABLED;

const CAMPAIGN = '5339245312';
const affUrl = (part, host = 'ebay.de') => `https://www.${host}/itm/${part}?campid=${CAMPAIGN}`;
const fmt = p => `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`;
const makePart = n => String(n).padStart(11, '0');
const parts100 = Array.from({ length: 100 }, (_, i) => makePart(11210000000 + i));
const parts1000 = Array.from({ length: 1000 }, (_, i) => makePart(11220000000 + i));
const parts5000 = Array.from({ length: 5000 }, (_, i) => makePart(11230000000 + i));

const knownParts = [
  { part_number: '11210000000', description: 'Zündkerze NGK (Spark plug)' },
  { part_number: '11220000000', description: 'Zylinder (Cylinder)' },
  { part_number: '11230000000', description: 'Vergaser (Carburetor)' }
];

const goodItem = part => ({
  itemId: `v1|${part}|0`,
  title: `Zündkerze STIHL ${fmt(part)}`,
  mpn: fmt(part),
  price: { value: '5.95', currency: 'EUR' },
  seller: { username: 'any_seller' },
  shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['NL'] }],
  itemAffiliateWebUrl: affUrl(part),
  condition: 'NEW'
});
const badItem = part => ({
  itemId: `v1|${part}-bad|0`,
  title: 'Vergaser Tuning Kit MS 250',
  price: { value: '19.95', currency: 'EUR' },
  seller: { username: 'any_seller' },
  shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['NL'] }],
  itemAffiliateWebUrl: affUrl(part),
  condition: 'NEW'
});

/**
 * Deterministic engine with a stubbed search: no fetch, no timers.
 * Corrupt/foreign items are returned alongside valid ones to exercise validation.
 */
const makeEngine = (engineOptions = {}, searchBehaviour = {}) => {
  const engine = new EbayHighVolumeEngine({
    apiClient: { searchItems: async () => ({ success: true, items: [], total: 0, errors: [] }) },
    batchDelayMs: 0,
    backoffBaseMs: 0,
    checkpointIntervalMs: -1,
    vendors: ['vendor_a'],
    marketplaces: ['EBAY_DE'],
    ...engineOptions
  });
  let call = 0;
  const rateLimitCalls = searchBehaviour.rateLimitCalls ?? 0;
  engine.apiClient.searchItems = async ({ partNumber }) => {
    call++;
    if (call <= rateLimitCalls) {
      return { success: false, items: [], total: 0, errors: ['eBay Browse API returned HTTP 429'] };
    }
    return { success: true, items: [goodItem(partNumber), badItem(partNumber)], total: 2, errors: [] };
  };
  engine.__callCount = () => call;
  return engine;
};

test('Phase 76C.7: batch 100 — processes every part, validates only confirmed matches', async () => {
  const engine = makeEngine();
  const result = await engine.processBatch(parts100, { maxItems: 100, knownParts });

  assert.equal(result.status, 'complete');
  assert.equal(result.summary.scanned_parts, 100);
  assert.equal(result.summary.offers_validated, 100, 'One valid offer per part');
  assert.equal(result.summary.offers_rejected, 100, 'Contaminated item rejected per part');
  for (const offer of result.active_offers) {
    assert.equal(offer.ships_to_nl, true);
    assert.ok(offer.affiliate_url.includes(`campid=${CAMPAIGN}`));
    assert.ok(offer.affiliate_url.startsWith('https://'));
  }
  const rejectedIds = new Set(result.rejected_offers.map(r => r.item_id));
  for (const active of result.active_offers) assert.equal(rejectedIds.has(active.item_id), false);
});

test('Phase 76C.8: batch 1.000 — completes fast with checkpoint records', async () => {
  const engine = makeEngine();
  const started = Date.now();
  const result = await engine.processBatch(parts1000, { maxItems: 1000, knownParts });
  const elapsed = Date.now() - started;
  assert.equal(result.summary.scanned_parts, 1000);
  assert.ok(elapsed < 10000, `Batch 1.000 must stay CI-fast (took ${elapsed}ms)`);
  assert.ok(result.checkpoints.length > 0, 'Checkpoints must be recorded');
  assert.ok(result.summary.offers_validated >= 1000);
});

test('Phase 76C.9: batch 5.000 — capacity supported, maxItems clamps', async () => {
  const engine = makeEngine();
  const result = await engine.processBatch(parts5000, { maxItems: 5000, knownParts });
  assert.equal(result.summary.scanned_parts, 5000);

  const clamped = makeEngine();
  const result2 = await clamped.processBatch(parts5000, { maxItems: 100, knownParts });
  assert.equal(result2.summary.scanned_parts, 100, 'maxItems must cap processing');
});

test('Phase 76C.10: resume from checkpoint — skips already-processed parts', async () => {
  const engine = makeEngine();
  const first = await engine.processBatch(parts100, { maxItems: 40, knownParts });
  assert.equal(first.summary.scanned_parts, 40);
  const lastCheckpoint = first.checkpoints[first.checkpoints.length - 1];
  const resumeFrom = lastCheckpoint ? lastCheckpoint.partIndex : 40;

  const second = await makeEngine().processBatch(parts100, {
    maxItems: 100,
    knownParts,
    resumeFrom
  });
  assert.equal(second.summary.scanned_parts, 100 - resumeFrom, 'Resume must process remainder only');
});

test('Phase 76C.11: 429 rate limit triggers backoff and retries, part is not lost', async () => {
  const engine = makeEngine({ backoffBaseMs: 0 }, { rateLimitCalls: 2 });
  const result = await engine.processBatch(parts100.slice(0, 3), { maxItems: 3, knownParts });
  assert.ok(result.summary.backoff_delays >= 2, 'Backoff must be recorded');
  assert.equal(result.summary.scanned_parts, 3);
  assert.equal(result.summary.offers_validated, 3, 'Retries must still yield the offer');
});

test('Phase 76C.12: conflicting product types are rejected (carburetor vs spark plug)', () => {
  const engine = makeEngine();
  const sparkPlug = { type: 'spark_plug', confidence: 0.95 };
  const carbTitle = { ...goodItem('11210000000'), title: 'Vergaser passend für Stihl MS 250', mpn: '1121 000 0000' };
  assert.equal(engine.validateOffer(carbTitle, '11210000000', sparkPlug), null);
  assert.ok(engine.validateOffer(goodItem('11210000000'), '11210000000', sparkPlug));
});

test('Phase 76C.13: bundle/kit offers are rejected, available stock is not a bundle', () => {
  const engine = makeEngine();
  const bundle = { ...goodItem('11210000000'), title: 'Zündkerze 1121 000 0000 Tune-up Kit' };
  assert.equal(engine.validateOffer(bundle, '11210000000', {}), null);
  const multipack = { ...goodItem('11210000000'), title: 'Zündkerze 1121 000 0000 2er Pack' };
  assert.equal(engine.validateOffer(multipack, '11210000000', {}), null, 'explicit multipack title must reject');
  // Phase 80.2: Browse `quantity` is the AVAILABLE STOCK, not a multipack. Treating
  // stock > 1 as a bundle rejected every enriched listing that was in stock.
  assert.ok(engine.validateOffer({ ...goodItem('11210000000'), quantity: 4 }, '11210000000', {}));
  assert.ok(engine.validateOffer(goodItem('11210000000'), '11210000000', {}));
});

test('Phase 76C.14: missing part number or wrong part fails closed', () => {
  const engine = makeEngine();
  assert.equal(engine.validateOffer({ ...goodItem('11210000000'), title: 'Zündkerze generisch', mpn: undefined }, '11210000000', {}), null);
  assert.equal(engine.validateOffer(goodItem('11220000000'), '11210000000', {}), null, 'Different part must reject');
});

test('Phase 76C.15: consolidation dedupes and sorts by price per marketplace', () => {
  const engine = makeEngine();
  const offers = [
    { part_number: '11210000000', marketplace: 'EBAY_DE', item_id: 'a', price: 9.99 },
    { part_number: '11210000000', marketplace: 'EBAY_DE', item_id: 'b', price: 5.99 },
    { part_number: '11210000000', marketplace: 'EBAY_NL', item_id: 'c', price: 7.49 },
    { part_number: '11220000000', marketplace: 'EBAY_DE', item_id: 'd', price: 49.99 }
  ];
  const consolidated = engine.consolidateOffers(offers);
  assert.equal(consolidated.size, 2);
  const deList = consolidated.get('11210000000').get('EBAY_DE');
  assert.deepEqual(deList.map(o => o.item_id), ['b', 'a']);
});

test('Phase 76C.16: missing/foreign affiliate URL and missing NL shipping fail closed', () => {
  const engine = makeEngine();
  assert.equal(engine.validateOffer({ ...goodItem('11210000000'), itemAffiliateWebUrl: undefined }, '11210000000', {}), null);
  assert.equal(engine.validateOffer({ ...goodItem('11210000000'), itemAffiliateWebUrl: 'https://evil.example/itm/1' }, '11210000000', {}), null);
  const noNl = { ...goodItem('11210000000'), shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['DE'] }] };
  assert.equal(engine.validateOffer(noNl, '11210000000', {}), null);
});

test('Phase 76C.17: all vendors and both marketplaces are searched per part', async () => {
  const seen = [];
  const engine = makeEngine({
    vendors: ['vendor_a', 'vendor_b', 'vendor_c'],
    marketplaces: ['EBAY_NL', 'EBAY_DE']
  });
  engine.apiClient.searchItems = async ({ marketplace, seller, partNumber }) => {
    seen.push(`${marketplace}/${seller}/${partNumber}`);
    return { success: true, items: [goodItem(partNumber)], total: 1, errors: [] };
  };
  await engine.processBatch(['11210000000'], { maxItems: 1, knownParts });
  assert.equal(seen.length, 6, '2 marketplaces × 3 vendors');
  for (const vendor of ['vendor_a', 'vendor_b', 'vendor_c']) {
    assert.ok(seen.some(s => s.startsWith(`EBAY_NL/${vendor}/`)), `NL search for ${vendor}`);
    assert.ok(seen.some(s => s.startsWith(`EBAY_DE/${vendor}/`)), `DE search for ${vendor}`);
  }
});

test('Phase 76C.18: duplicate item IDs are not double-counted in results', async () => {
  const engine = makeEngine({
    vendors: ['vendor_a', 'vendor_b'],
    marketplaces: ['EBAY_DE']
  });
  engine.apiClient.searchItems = async ({ partNumber }) => ({
    success: true,
    items: [goodItem(partNumber)],
    total: 1,
    errors: []
  });
  const result = await engine.processBatch(['11210000000'], { maxItems: 1, knownParts });
  const ids = result.active_offers.map(o => o.item_id);
  assert.equal(new Set(ids).size, ids.length, 'No duplicate item IDs across vendors');
});

test('Phase 76C.19: state persists and survives restart, expired offers are dropped', async () => {
  const engine = makeEngine();
  const result = await engine.processBatch(parts100.slice(0, 10), { maxItems: 10, knownParts });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebay-state-'));
  const file = path.join(tmpDir, 'batch_state.json');
  try {
    engine.saveState(file, {
      summary: result.summary,
      active_offers: result.active_offers,
      rejected_offers: result.rejected_offers,
      checkpoints: result.checkpoints,
      next_part_index: 10
    });
    const loaded = EbayHighVolumeEngine.loadState(file);
    assert.ok(loaded);
    assert.equal(loaded.next_part_index, 10);
    assert.equal(loaded.active_offers.length, result.active_offers.length);
    assert.equal(loaded.expired_offers_dropped, 0);
    assert.equal(loaded.state_fresh, true);

    // Stale state (> maxAge) must not surface offers
    const stale = EbayHighVolumeEngine.loadState(file, { maxAgeMs: -1 });
    assert.equal(stale.active_offers.length, 0, 'Expired offers must not be shown');
    assert.ok(stale.expired_offers_dropped > 0);
    assert.equal(stale.state_fresh, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
