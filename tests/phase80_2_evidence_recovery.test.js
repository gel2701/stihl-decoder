/**
 * tests/phase80_2_evidence_recovery.test.js
 *
 * Phase 80.2 — the zero-activation root causes and the recovery of activation
 * from evidence that was already fetched:
 *
 *  1. getItem must request the PRODUCT field group and read the MPN/GTIN/aspects
 *     from the `product` container and localizedAspects (not only raw.mpn).
 *  2. Browse `quantity` is stock, never a multipack → it must not reject.
 *  3. Recorded NL delivery evidence must be reused in every shape an earlier
 *     batch wrote it (shipping_evidence / evidence.shipping / flat / status).
 *  4. A recovery run must turn stored evidence into ACTIVE offers, persist them
 *     and resolve real affiliate links, without any network call.
 *  5. Multiple part relations of one listing stay intact.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { EbayBrowseApiClient, normalizeDetailAspects } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayHighVolumeEngine, priorDeliveryEvidence } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import { ReviewEvidenceBatch } from '../src/affiliate/ReviewEvidenceBatch.js';
import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
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
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'phase802-'));

/** A realistic getItem response: MPN only in the product container/aspects. */
const getItemResponse = (overrides = {}) => ({
  itemId: ITEM,
  title: 'Zündkerze NGK BPMR7A für STIHL 0000 400 7000',
  itemAffiliateWebUrl: affUrl(),
  quantity: 25,
  localizedAspects: [
    { name: 'Marke', value: 'NGK' },
    { name: 'Herstellernummer', value: '0000 400 7000' },
    { name: 'Modellkompatibilität', value: 'STIHL MS 260, MS 261' }
  ],
  product: {
    brand: 'NGK',
    mpns: ['0000 400 7000'],
    gtins: ['4014835123456'],
    aspects: [{ name: 'Herstellernummer', value: '0000 400 7000' }]
  },
  shippingOptions: [{ shipToLocations: ['NL', 'DE'], shippingCost: { value: '4.95', currency: 'EUR' } }],
  seller: { username: 'saegenspezi_de' },
  price: { value: '5.95', currency: 'EUR' },
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
  ...overrides
});

const reviewOffer = (overrides = {}) => ({
  part_number: PART,
  item_id: ITEM,
  marketplace: 'EBAY_DE',
  title: 'Zündkerze NGK BPMR7A für STIHL 0000 400 7000',
  mpn: '',
  seller_name: 'saegenspezi_de',
  item_price: 5.95,
  currency: 'EUR',
  ships_to_nl: true,
  shipping_status: SHIPPING_STATUS.CONFIRMED,
  checked_at: new Date().toISOString(),
  affiliate_url: affUrl(),
  itemAffiliateWebUrl: affUrl(),
  decision: 'REVIEW',
  status: OFFER_STATUSES.NEEDS_EVIDENCE,
  match_type: MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE,
  ...overrides
});

const candidate = () => ({
  part_number: PART,
  description: 'Zündkerze',
  category: 'bougie',
  models: ['ms_260'],
  existing: [reviewOffer()]
});

test('82.1 getItem requests the PRODUCT field group and reads MPN/GTIN from the product container', async () => {
  const seen = [];
  const client = new EbayBrowseApiClient({
    clientId: 'id',
    clientSecret: 'secret',
    epnCampaignId: CAMPAIGN,
    fetchFn: async (url, init) => {
      seen.push(String(url));
      if (String(url).includes('oauth2/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 7200 }) };
      }
      assert.ok(init.headers['X-EBAY-C-ENDUSERCTX']);
      return { ok: true, status: 200, json: async () => getItemResponse() };
    }
  });
  process.env.EBAY_ENABLED = 'true';
  const res = await client.getItem(ITEM, { marketplace: 'EBAY_DE' });
  assert.equal(res.success, true, res.errors?.join(','));
  assert.ok(seen.some(url => url.includes('fieldgroups=PRODUCT')), 'PRODUCT field group must be requested');
  assert.equal(res.item.mpn, '0000 400 7000');
  assert.deepEqual(res.item.mpns, ['0000 400 7000']);
  assert.equal(res.item.gtin, '4014835123456');
  assert.equal(res.item.brand, 'NGK');
  assert.ok(res.item.aspects.some(a => a.name === 'Modellkompatibilität'));
});

test('82.2 MPN that only exists in localizedAspects is still the identity proof', () => {
  const client = new EbayBrowseApiClient({ clientId: 'id', clientSecret: 'secret', epnCampaignId: CAMPAIGN });
  const detail = client.parseItemDetail({
    itemId: ITEM,
    title: 'Zündkerze STIHL 0000 400 7000',
    localizedAspects: [{ name: 'Herstellernummer', value: '0000 400 7000' }],
    itemAffiliateWebUrl: affUrl()
  }, 'EBAY_DE');
  assert.equal(detail.mpn, '0000 400 7000');
  assert.equal(detail.mpns.length, 1);
  assert.deepEqual(normalizeDetailAspects({ localizedAspects: [{ name: 'Marke', localizedValues: ['NGK', 'STIHL'] }] }),
    [{ name: 'Marke', value: 'NGK' }, { name: 'Marke', value: 'STIHL' }]);
});

test('82.3 available stock quantity is not a bundle and no longer rejects the offer', () => {
  const engine = new EbayHighVolumeEngine({ apiClient: { searchItems: async () => ({ success: true, items: [] }) }, batchDelayMs: 0 });
  const offer = {
    ...reviewOffer(),
    item_detail: { ...getItemResponse(), quantity: 40, available_quantity: 40 }
  };
  const verdict = engine.evaluateOffer(offer, PART, { type: 'spark_plug', models: ['ms_260'] });
  assert.equal(verdict.decision, 'ACCEPT');
  assert.ok(!verdict.reason_codes.includes('BUNDLE_OR_KIT'));
  assert.equal(verdict.match_type, MATCH_TYPES.EXACT_MPN);
});

test('82.4 recorded NL delivery evidence is reused in every shape earlier batches wrote', () => {
  const base = { checked_at: new Date().toISOString(), marketplace: 'EBAY_DE' };
  const browse = { source: 'BROWSE_DELIVERY_COUNTRY_FILTER', delivery_country: 'NL', filter: 'deliveryCountry:NL', confirmed: true, confirmed_at: new Date().toISOString() };
  assert.ok(priorDeliveryEvidence({ shipping_evidence: { browse_delivery: browse } }));
  assert.ok(priorDeliveryEvidence({ evidence: { shipping: { browse_delivery: browse } } }));
  assert.ok(priorDeliveryEvidence({ browse_delivery_evidence: browse }));
  assert.ok(priorDeliveryEvidence({ ...base, shipping_status: SHIPPING_STATUS.CONFIRMED }));
  assert.equal(priorDeliveryEvidence({ ships_to_nl: true }), null, 'a bare flag without confirmation is not evidence');
  assert.equal(priorDeliveryEvidence({ shipping_status: SHIPPING_STATUS.CONFIRMED }), null, 'confirmed status without a timestamp expires');

  const engine = new EbayHighVolumeEngine({ apiClient: { searchItems: async () => ({ success: true, items: [] }) }, batchDelayMs: 0 });
  const stored = reviewOffer();
  delete stored.ships_to_nl;
  const verdict = engine.evaluateOffer({
    ...stored,
    shipping_evidence: { browse_delivery: browse },
    item_detail: { ...getItemResponse(), shippingOptions: [] }
  }, PART, { type: 'spark_plug', models: ['ms_260'] });
  assert.equal(verdict.decision, 'ACCEPT');
  assert.equal(verdict.offer.shipping_status, SHIPPING_STATUS.CONFIRMED);
});

test('82.5 recovery run: stored evidence becomes ACTIVE, persists and resolves real links', async () => {
  const dir = tmpDir();
  const evidencePath = path.join(dir, 'evidence.json');
  const storePath = path.join(dir, 'offers.json');
  const registry = new EbayEvidenceRegistry({ path: evidencePath });
  registry.record(ITEM, {
    item_id: ITEM,
    marketplace: 'EBAY_DE',
    title: getItemResponse().title,
    mpn: '0000 400 7000',
    mpns: ['0000 400 7000'],
    brand: 'NGK',
    aspects: getItemResponse().localizedAspects,
    shipping_options: getItemResponse().shippingOptions,
    affiliate_url: affUrl(),
    fetched_at: new Date().toISOString()
  });
  registry.save(evidencePath);

  let getItemCalls = 0;
  const engine = new EbayHighVolumeEngine({
    apiClient: { searchItems: async () => ({ success: true, items: [] }), getItem: async () => { getItemCalls++; throw new Error('no network'); } },
    batchDelayMs: 0
  });
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry: registry, batchDelayMs: 0 });
  const result = await batch.run([candidate()], { live: false });
  assert.equal(getItemCalls, 0);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.evidence_completed, 1);
  assert.equal(result.blocker_counts ? Object.keys(result.blocker_counts).length : 0, 0);
  assert.equal(result.diagnostics[0].evidence.mpn_values.length, 1);
  assert.equal(result.diagnostics[0].evidence.shipping_options_count, 1);
});

test('82.6 recovery CLI: report + input + registry produce activation, diagnosis and resolver links', () => {
  const dir = tmpDir();
  const evidencePath = path.join(dir, 'evidence.json');
  const storePath = path.join(dir, 'offers.json');
  const outDir = path.join(dir, 'out');
  const inputPath = path.join(dir, 'input.json');
  const reportPath = path.join(dir, 'report.json');

  fs.writeFileSync(evidencePath, JSON.stringify({
    items: {
      [ITEM]: {
        item_id: ITEM,
        marketplace: 'EBAY_DE',
        title: getItemResponse().title,
        mpn: '0000 400 7000',
        mpns: ['0000 400 7000'],
        brand: 'NGK',
        aspects: getItemResponse().localizedAspects,
        shipping_options: getItemResponse().shippingOptions,
        affiliate_url: affUrl(),
        fetched_at: new Date().toISOString()
      }
    }
  }), 'utf8');
  fs.writeFileSync(inputPath, JSON.stringify({ review_offers: [reviewOffer()] }), 'utf8');
  fs.writeFileSync(reportPath, JSON.stringify({
    needs_evidence_offers: [{ part_number: PART, item_id: ITEM, marketplace: 'EBAY_DE', status: OFFER_STATUSES.NEEDS_EVIDENCE }],
    rejected_offers: []
  }), 'utf8');

  const res = spawnSync(process.execPath, [
    'scripts/phase80_2_evidence_recovery.mjs',
    '--report', reportPath,
    '--input', inputPath,
    '--evidence', evidencePath,
    '--store', storePath,
    '--out-dir', outDir
  ], { cwd: projectRoot, env: { ...process.env }, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  const report = JSON.parse(res.stdout);
  assert.equal(report.mode, 'OFFLINE_EVIDENCE_REUSE');
  assert.equal(report.required_report['5_new_active_offers'], 1);
  assert.equal(report.required_report['6_unique_parts_buyable'], 1);
  assert.equal(report.required_report['9_active_records_on_disk'], 1);
  assert.equal(report.required_report['10_resolver_links'], 1);
  assert.equal(report.coverage.candidate_pairs_from_sources, 2);
  assert.equal(report.coverage.duplicate_part_item_pairs_dropped, 1, 'the same part+listing from two sources is one pair');
  assert.equal(report.chain.resolver_status, 'VERIFIED');

  const store = loadEbayOfferStore(storePath);
  assert.equal(store.offers.length, 1);
  assert.equal(store.offers[0].match_type, MATCH_TYPES.EXACT_MPN);
  assert.ok(store.offers[0].affiliate_url.includes('campid='));
});

test('82.7 one listing proven for two parts keeps both relations in one recovery run', async () => {
  const registry = new EbayEvidenceRegistry({ path: null });
  registry.record(ITEM, {
    item_id: ITEM,
    marketplace: 'EBAY_DE',
    title: getItemResponse().title,
    mpn: '0000 400 7000',
    mpns: ['0000 400 7000'],
    aspects: getItemResponse().localizedAspects,
    shipping_options: getItemResponse().shippingOptions,
    affiliate_url: affUrl(),
    fetched_at: new Date().toISOString()
  });
  const engine = new EbayHighVolumeEngine({
    apiClient: { searchItems: async () => ({ success: true, items: [] }), getItem: async () => ({ success: false, errors: ['no network'] }) },
    batchDelayMs: 0
  });
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry: registry, batchDelayMs: 0 });
  const result = await batch.run([
    candidate(),
    { ...candidate(), part_number: '00004007011', existing: [reviewOffer({ part_number: '00004007011' })] }
  ], { live: false });
  assert.equal(result.accepted.length, 1, 'only the proven part is activated');
  assert.deepEqual([...result.accepted[0].related_part_numbers].sort(), ['00004007000', '00004007011']);
  assert.equal(result.item_relations.length, 1);
  assert.deepEqual([...result.item_relations[0].part_numbers].sort(), ['00004007000', '00004007011']);
  assert.equal(result.rejected.length, 1);
});
