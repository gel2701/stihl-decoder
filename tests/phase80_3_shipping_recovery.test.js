/**
 * tests/phase80_3_shipping_recovery.test.js
 *
 * Phase 80.3 — targeted NL delivery recovery:
 *
 *  1. Evidence is stored and looked up per marketplace + item id, and expires.
 *  2. Only an official deliveryCountry:NL Browse response that returns the exact
 *     listing counts; a listing that does not come back gets no confirmation.
 *  3. An exact non-NL destination list is an explicit restriction, never a yes.
 *  4. Renewed delivery evidence combined with the stored getItem detail promotes
 *     the offer to ACTIVE, persists it and yields a working affiliate link.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  EbayShippingEvidenceRegistry,
  shippingEvidenceKey
} from '../src/affiliate/EbayShippingEvidenceRegistry.js';
import { ShippingRecovery, applyShippingEvidence } from '../src/affiliate/ShippingRecovery.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { ReviewEvidenceBatch } from '../src/affiliate/ReviewEvidenceBatch.js';
import { saveEbayOfferStore, loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { MATCH_TYPES, OFFER_STATUSES } from '../src/affiliate/OfferEvidenceMatcher.js';
import { SHIPPING_STATUS } from '../src/affiliate/EbayShippingEvidence.js';

const CAMPAIGN = '5339245312';
process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = CAMPAIGN;
process.env.EBAY_CLIENT_ID = 'test_client_id';
process.env.EBAY_CLIENT_SECRET = 'test_client_secret';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PART = '00004007000';
const ITEM = 'v1|276|0';
const affUrl = (item = '276') => `https://www.ebay.de/itm/${item}?campid=${CAMPAIGN}`;
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'phase803-'));
const now = () => new Date().toISOString();

const deliveryEvidence = (overrides = {}) => ({
  source: 'BROWSE_DELIVERY_COUNTRY_FILTER',
  delivery_country: 'NL',
  filter: 'deliveryCountry:NL',
  marketplace: 'EBAY_DE',
  api_status: 200,
  confirmed: true,
  confirmed_at: now(),
  item_count: 1,
  queries: [`STIHL ${PART}`],
  applied: true,
  ...overrides
});

const recoveredItem = (overrides = {}) => ({
  item_id: ITEM,
  title: 'Zündkerze NGK BPMR7A für STIHL 0000 400 7000',
  marketplace: 'EBAY_DE',
  shipping_destinations: ['NL', 'DE'],
  shipping_cost_nl: 4.95,
  item_price: 5.95,
  currency: 'EUR',
  shipping_evidence: { browse_delivery: deliveryEvidence() },
  evidence: { shipping: { browse_delivery: deliveryEvidence() } },
  ...overrides
});

const fakeClient = handler => {
  const calls = [];
  return {
    calls,
    searchItems: async params => {
      calls.push(params);
      return handler(params);
    }
  };
};

const pendingPair = (overrides = {}) => ({ part_number: PART, marketplace: 'EBAY_DE', item_id: ITEM, ...overrides });

test('83.1 shipping evidence is keyed by marketplace + item id and expires', () => {
  const registry = new EbayShippingEvidenceRegistry({ path: null });
  registry.record(ITEM, 'EBAY_DE', { ...deliveryEvidence(), item_id: ITEM });
  assert.ok(registry.get(ITEM, 'EBAY_DE'));
  assert.equal(registry.get(ITEM, 'EBAY_NL'), null, 'evidence never crosses a marketplace');
  assert.equal(shippingEvidenceKey(ITEM, 'ebay_de'), `EBAY_DE:${ITEM}`);

  const stale = new EbayShippingEvidenceRegistry({ path: null, maxAgeMs: 1000 });
  stale.record(ITEM, 'EBAY_DE', { ...deliveryEvidence(), confirmed_at: new Date(Date.now() - 60_000).toISOString() });
  assert.equal(stale.get(ITEM, 'EBAY_DE'), null, 'stale delivery evidence is not reused');
});

test('83.2 only the exact listing returned by the NL-filtered search is confirmed', async () => {
  const client = fakeClient(params => {
    if (params.marketplace === 'EBAY_DE') {
      return { success: true, items: [recoveredItem()], total: 1, errors: [], delivery_evidence: deliveryEvidence() };
    }
    return { success: true, items: [], total: 0, errors: [], delivery_evidence: deliveryEvidence({ marketplace: 'EBAY_NL' }) };
  });
  const registry = new EbayShippingEvidenceRegistry({ path: null });
  const recovery = new ShippingRecovery({ apiClient: client, registry });

  const result = await recovery.verifyListings([
    pendingPair(),
    pendingPair({ marketplace: 'EBAY_NL' }),
    pendingPair({ item_id: 'v1|999|0' })
  ], { maxParts: 10 });

  assert.equal(result.searched_pairs, 3);
  assert.equal(result.confirmed_pairs, 1, 'only the returned DE listing is confirmed');
  assert.equal(registry.get(ITEM, 'EBAY_DE').marketplace, 'EBAY_DE');
  assert.equal(registry.get(ITEM, 'EBAY_NL'), null, 'the NL search returned no such listing');
  assert.equal(result.not_returned_pairs, 2);

  const record = registry.get(ITEM, 'EBAY_DE');
  assert.equal(record.filter, 'deliveryCountry:NL');
  assert.equal(record.api_status, 200);
  assert.ok(record.confirmed_at);
  assert.deepEqual(record.shipping_destinations, ['NL', 'DE']);
});

test('83.3 an explicit non-NL destination list blocks the confirmation', async () => {
  const client = fakeClient(() => ({
    success: true,
    items: [recoveredItem({ shipping_destinations: ['DE', 'AT'] })],
    total: 1,
    errors: [],
    delivery_evidence: deliveryEvidence()
  }));
  const registry = new EbayShippingEvidenceRegistry({ path: null });
  const recovery = new ShippingRecovery({ apiClient: client, registry });
  const result = await recovery.verifyListings([pendingPair()], { maxParts: 10 });
  assert.equal(result.confirmed_pairs, 0);
  assert.equal(result.restricted_pairs, 1);
  assert.equal(registry.get(ITEM, 'EBAY_DE'), null);
});

test('83.4 evidence is attached to the exact marketplace + item id only', () => {
  const candidates = [{
    part_number: PART,
    existing: [
      { part_number: PART, item_id: ITEM, marketplace: 'EBAY_DE' },
      { part_number: PART, item_id: ITEM, marketplace: 'EBAY_NL' }
    ]
  }];
  const out = applyShippingEvidence(candidates, [{
    item_id: ITEM,
    marketplace: 'EBAY_DE',
    confirmed: true,
    confirmed_at: now(),
    filter: 'deliveryCountry:NL'
  }]);
  assert.equal(out.applied, 1);
  assert.ok(candidates[0].existing[0].shipping_evidence.browse_delivery.confirmed);
  assert.equal(candidates[0].existing[1].shipping_evidence, undefined, 'NL offer gets no DE evidence');
});

test('83.5 renewed shipping evidence plus stored getItem detail becomes ACTIVE with a working link', async () => {
  const dir = tmpDir();
  const storePath = path.join(dir, 'offers.json');
  const registry = new EbayEvidenceRegistry({ path: null });
  registry.record(ITEM, {
    item_id: ITEM,
    marketplace: 'EBAY_DE',
    title: recoveredItem().title,
    mpn: '0000 400 7000',
    mpns: ['0000 400 7000'],
    aspects: [{ name: 'Herstellernummer', value: '0000 400 7000' }],
    shipping_options: [],
    affiliate_url: affUrl(),
    fetched_at: now()
  });

  const candidates = [{
    part_number: PART,
    description: 'Zündkerze',
    category: 'bougie',
    models: [],
    existing: [{
      part_number: PART,
      item_id: ITEM,
      marketplace: 'EBAY_DE',
      title: recoveredItem().title,
      mpn: '',
      affiliate_url: affUrl(),
      itemAffiliateWebUrl: affUrl(),
      ships_to_nl: false,
      shipping_status: SHIPPING_STATUS.UNKNOWN,
      decision: 'REVIEW',
      status: OFFER_STATUSES.NEEDS_EVIDENCE
    }]
  }];

  const client = fakeClient(() => ({
    success: true,
    items: [recoveredItem()],
    total: 1,
    errors: [],
    delivery_evidence: deliveryEvidence()
  }));
  const shippingRegistry = new EbayShippingEvidenceRegistry({ path: null });
  const recovery = new ShippingRecovery({ apiClient: client, registry: shippingRegistry });
  const verification = await recovery.verifyListings(
    candidates[0].existing.map(offer => ({ part_number: PART, marketplace: offer.marketplace, item_id: offer.item_id })),
    { maxParts: 10 }
  );
  applyShippingEvidence(candidates, verification.records);

  const engine = new EbayHighVolumeEngine({
    apiClient: { searchItems: async () => { throw new Error('no network'); }, getItem: async () => { throw new Error('no getItem'); } },
    batchDelayMs: 0
  });
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry: registry, batchDelayMs: 0 });
  const result = await batch.run(candidates, { live: false });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].match_type, MATCH_TYPES.EXACT_MPN);
  assert.equal(result.accepted[0].shipping_status, SHIPPING_STATUS.CONFIRMED);
  assert.equal(result.get_item_requests, 0, 'stored getItem detail is reused');

  const saved = saveEbayOfferStore(storePath, result.accepted, { campaignId: CAMPAIGN });
  assert.equal(saved.written, 1);
  const store = loadEbayOfferStore(storePath);
  assert.equal(store.offers[0].status, OFFER_STATUSES.ACTIVE);
  assert.ok(store.offers[0].affiliate_url.includes(`campid=${CAMPAIGN}`));
});

test('83.6 a conflicting listing keeps its delivery evidence but is never activated', async () => {
  const otherPart = '00004007011';
  const registry = new EbayEvidenceRegistry({ path: null });
  registry.record(ITEM, {
    item_id: ITEM,
    marketplace: 'EBAY_DE',
    title: `Zündkerze STIHL ${otherPart}`,
    mpn: otherPart,
    mpns: [otherPart],
    aspects: [],
    shipping_options: [],
    affiliate_url: affUrl(),
    fetched_at: now()
  });
  const candidates = [{
    part_number: PART,
    description: 'Zündkerze',
    category: 'bougie',
    models: [],
    existing: [{
      part_number: PART,
      item_id: ITEM,
      marketplace: 'EBAY_DE',
      title: `Zündkerze STIHL ${otherPart}`,
      affiliate_url: affUrl(),
      itemAffiliateWebUrl: affUrl(),
      ships_to_nl: false,
      shipping_status: SHIPPING_STATUS.UNKNOWN
    }]
  }];

  // Delivery evidence is confirmed for this listing (it is deliverable), which is
  // why a confirmed-delivery count can exceed the number of activated offers.
  const applied = applyShippingEvidence(candidates, [{
    item_id: ITEM,
    marketplace: 'EBAY_DE',
    confirmed: true,
    confirmed_at: now(),
    filter: 'deliveryCountry:NL',
    api_status: 200
  }]);
  assert.equal(applied.applied, 1);

  const engine = new EbayHighVolumeEngine({
    apiClient: { searchItems: async () => { throw new Error('no network'); }, getItem: async () => { throw new Error('no getItem'); } },
    batchDelayMs: 0
  });
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry: registry, batchDelayMs: 0 });
  const result = await batch.run(candidates, { live: false });
  assert.equal(result.accepted.length, 0, 'shipping proof never overrides a contradictory identity');
  assert.equal(result.rejected.length, 1);
  assert.ok(result.rejected[0].reason_codes.includes('CONFLICTING_MPN'));
  assert.ok(candidates[0].existing[0].shipping_evidence.browse_delivery.confirmed, 'evidence is preserved');
});

test('83.7 the recovery CLI refuses targeted shipping verification without credentials', () => {
  const dir = tmpDir();
  const inputPath = path.join(dir, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify({ review_offers: [] }), 'utf8');
  const env = { ...process.env };
  delete env.EBAY_CLIENT_ID;
  delete env.EBAY_CLIENT_SECRET;
  const res = spawnSync(process.execPath, [
    'scripts/phase80_2_evidence_recovery.mjs',
    '--input', inputPath,
    '--verify-shipping',
    '--store', path.join(dir, 'offers.json'),
    '--evidence', path.join(dir, 'evidence.json'),
    '--out-dir', path.join(dir, 'out')
  ], { cwd: projectRoot, env, encoding: 'utf8' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /ABORT: --verify-shipping requires/);
});
