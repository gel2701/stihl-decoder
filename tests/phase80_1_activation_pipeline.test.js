/**
 * tests/phase80_1_activation_pipeline.test.js
 *
 * Phase 80.1 — finish the activation pipeline:
 *  - persistent storage paths (Render /var/data + local overrides)
 *  - restart keeps ACTIVE offers and the resolver reads the same store
 *  - multiple part relations per listing are preserved
 *  - existing REVIEW candidates are enriched with getItem only (no new Browse
 *    search unless the stored listing is gone), one request per unique listing
 *  - the batch runner writes only proven ACTIVE offers
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  projectRoot,
  resolveStorageRoot,
  getAffiliateDataDir,
  getEbayOfferStorePath,
  getEbayEvidenceRegistryPath,
  getPhase80OutputDir,
  isPersistentStorageConfigured
} from '../src/affiliate/AffiliateStoragePaths.js';
import {
  saveEbayOfferStore,
  loadEbayOfferStore,
  loadEbayCachedOffers
} from '../src/affiliate/EbayOfferStore.js';
import { ReviewEvidenceBatch } from '../src/affiliate/ReviewEvidenceBatch.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { MATCH_TYPES, OFFER_STATUSES } from '../src/affiliate/OfferEvidenceMatcher.js';
import { SHIPPING_STATUS } from '../src/affiliate/EbayShippingEvidence.js';

const CAMPAIGN = '5339245312';
process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = CAMPAIGN;
process.env.EBAY_CLIENT_ID = 'test_client_id';
process.env.EBAY_CLIENT_SECRET = 'test_client_secret';

const PART_A = '00004007000';
const PART_B = '00004007011';
const affUrl = (item = '1') => `https://www.ebay.de/itm/${item}?campid=${CAMPAIGN}`;
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'phase801-'));

const reviewOffer = (overrides = {}) => ({
  part_number: PART_A,
  item_id: 'v1|500|0',
  marketplace: 'EBAY_DE',
  title: 'Zündkerze NGK BPMR7A passend für STIHL 0000 400 7000',
  mpn: '',
  seller_name: 'saegenspezi_de',
  item_price: 5.95,
  currency: 'EUR',
  ships_to_nl: true,
  shipping_status: SHIPPING_STATUS.CONFIRMED,
  affiliate_url: affUrl('500'),
  itemAffiliateWebUrl: affUrl('500'),
  decision: 'REVIEW',
  status: OFFER_STATUSES.NEEDS_EVIDENCE,
  match_type: MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE,
  ...overrides
});

const candidate = (part, existing, extra = {}) => ({
  part_number: part,
  description: 'Zündkerze',
  category: 'bougie',
  models: [],
  existing,
  ...extra
});

test('80.1.1 storage paths: local default, explicit override, Render disk and /var/data', () => {
  assert.equal(resolveStorageRoot({}, () => false).source, 'PROJECT_DATA');
  assert.equal(getAffiliateDataDir({}, () => false), path.join(projectRoot, 'data', 'affiliate'));
  assert.equal(getEbayOfferStorePath({}, () => false), path.join(projectRoot, 'data', 'affiliate', 'ebay_offers.json'));
  assert.equal(getEbayEvidenceRegistryPath({}, () => false), path.join(projectRoot, 'data', 'affiliate', 'ebay_evidence_registry.json'));
  assert.equal(getPhase80OutputDir({}, () => false), path.join(projectRoot, 'output', 'phase80'));
  assert.equal(isPersistentStorageConfigured({}, () => false), false);

  assert.equal(resolveStorageRoot({ AFFILIATE_DATA_DIR: '/tmp/aff' }, () => false).persistent, true);
  assert.equal(getEbayOfferStorePath({ AFFILIATE_DATA_DIR: '/tmp/aff' }, () => false), '/tmp/aff/affiliate/ebay_offers.json');
  assert.equal(getPhase80OutputDir({ AFFILIATE_DATA_DIR: '/tmp/aff' }, () => false), '/tmp/aff/phase80');

  assert.equal(getEbayOfferStorePath({ RENDER_DISK_PATH: '/var/data' }, () => false), '/var/data/affiliate/ebay_offers.json');
  assert.equal(getEbayEvidenceRegistryPath({ RENDER_DISK_PATH: '/var/data' }, () => false), '/var/data/affiliate/ebay_evidence_registry.json');
  assert.equal(getPhase80OutputDir({ RENDER_DISK_PATH: '/var/data' }, () => false), '/var/data/phase80');

  assert.equal(resolveStorageRoot({}, p => p === '/var/data').source, '/var/data');
  assert.equal(getEbayOfferStorePath({ EBAY_OFFER_STORE_PATH: '/tmp/custom.json' }, () => false), '/tmp/custom.json');
});

test('80.1.2 a restart keeps ACTIVE offers and the resolver reads the same persistent store', () => {
  const dir = tmpDir();
  const previous = process.env.AFFILIATE_DATA_DIR;
  process.env.AFFILIATE_DATA_DIR = dir;
  try {
    const storePath = getEbayOfferStorePath();
    assert.equal(storePath, path.join(dir, 'affiliate', 'ebay_offers.json'));

    saveEbayOfferStore(storePath, [{
      ...reviewOffer(),
      decision: 'ACCEPT',
      status: OFFER_STATUSES.ACTIVE,
      match_type: MATCH_TYPES.EXACT_MPN,
      mpn: PART_A
    }]);
    assert.equal(loadEbayOfferStore(storePath).offers.length, 1);

    // Simulated restart: brand new provider + resolver, default paths only.
    const provider = new EbayAffiliateProvider();
    assert.equal(provider.loadFromStore().get(PART_A).length, 1);

    const resolver = new AffiliateOfferResolver({
      verifiedRegistry: new VerifiedOfferRegistry({ productionActivationAllowed: false })
    });
    assert.equal(resolver.ebayStorePath, storePath, 'resolver must read the same persistent store');
    const offers = resolver.resolveOffers({ partNumber: PART_A });
    const ebay = offers.find(offer => offer.provider === 'ebay');
    assert.ok(ebay, 'ACTIVE offer must survive a restart');
    assert.ok(ebay.url.includes(`campid=${CAMPAIGN}`));
  } finally {
    if (previous === undefined) delete process.env.AFFILIATE_DATA_DIR;
    else process.env.AFFILIATE_DATA_DIR = previous;
  }
});

test('80.1.3 one listing proven for two part numbers keeps both relations (store, provider, resolver)', () => {
  const dir = tmpDir();
  const storePath = path.join(dir, 'ebay_offers.json');
  const accepted = [PART_A, PART_B].map(part => ({
    ...reviewOffer(),
    part_number: part,
    mpn: part,
    related_part_numbers: [PART_A, PART_B],
    decision: 'ACCEPT',
    status: OFFER_STATUSES.ACTIVE,
    match_type: MATCH_TYPES.EXACT_MPN
  }));
  const result = saveEbayOfferStore(storePath, accepted);
  assert.equal(result.written, 2);

  const stored = loadEbayOfferStore(storePath);
  assert.equal(stored.offers.length, 2, 'both part relations are stored separately');
  for (const offer of stored.offers) {
    assert.deepEqual([...offer.related_part_numbers].sort(), [PART_A, PART_B].sort());
  }

  const cached = loadEbayCachedOffers(storePath);
  assert.equal(cached.get(PART_A).length, 1);
  assert.equal(cached.get(PART_B).length, 1);

  const provider = new EbayAffiliateProvider({ cachedOffers: cached });
  assert.equal(provider.getOffers({ partNumber: PART_A }).length, 1);
  assert.equal(provider.getOffers({ partNumber: PART_B }).length, 1);
});

test('80.1.4 existing REVIEW candidates are enriched via getItem only, once per unique listing', async () => {
  let getItemCalls = 0;
  const apiClient = {
    searchItems: async () => {
      throw new Error('Browse search must not run for existing review candidates');
    },
    getItem: async itemId => {
      getItemCalls++;
      return {
        success: true,
        cached: false,
        errors: [],
        item: {
          item_id: itemId,
          marketplace: 'EBAY_DE',
          title: 'Zündkerze NGK BPMR7A STIHL 0000 400 7000',
          mpn: PART_A,
          brand: 'NGK',
          aspects: [{ name: 'Herstellernummer', value: '0000 400 7000' }],
          shipping_options: [{ shipToLocations: ['NL'], shippingCost: { value: '5.95' } }],
          affiliate_url: affUrl('500'),
          fetched_at: new Date().toISOString()
        }
      };
    }
  };
  const engine = new EbayHighVolumeEngine({ apiClient, batchDelayMs: 0, checkpointIntervalMs: -1 });
  const evidenceRegistry = new EbayEvidenceRegistry({ path: path.join(tmpDir(), 'evidence.json') });
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry, batchDelayMs: 0 });

  const result = await batch.run([
    candidate(PART_A, [reviewOffer()]),
    candidate(PART_B, [reviewOffer({ part_number: PART_B })])
  ], { live: true, allowSearchFallback: true, maxGetItems: 10 });

  assert.equal(getItemCalls, 1, 'one getItem for the listing shared by both parts');
  assert.equal(result.get_item_requests, 1);
  assert.equal(result.get_item_network_calls, 1);
  assert.equal(result.unique_items, 1);
  assert.equal(result.processed_candidates, 2);
  assert.equal(result.search_fallbacks, 0);
  assert.equal(result.accepted.length, 1, 'only the proven part becomes ACTIVE');
  assert.equal(result.accepted[0].part_number, PART_A);
  assert.deepEqual([...result.accepted[0].related_part_numbers].sort(), [PART_A, PART_B].sort());
  assert.equal(result.evidence_completed, 1);
  // The second relation is not silently dropped: it is reported as a conflicting
  // match for PART_B (the listing names PART_A), and the relation stays on the record.
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].part_number, PART_B);
  assert.equal(result.rejected[0].status, OFFER_STATUSES.REJECTED);
  assert.equal(result.item_relations.length, 1);
  assert.deepEqual([...result.item_relations[0].part_numbers].sort(), [PART_A, PART_B].sort());
  assert.equal(evidenceRegistry.summary().recorded, 1);
});

test('80.1.4b missing evidence stays NEEDS_EVIDENCE and is never stored', async () => {
  const engine = new EbayHighVolumeEngine({
    apiClient: { searchItems: async () => { throw new Error('no search'); }, getItem: async () => { throw new Error('no getItem'); } },
    batchDelayMs: 0,
    checkpointIntervalMs: -1
  });
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry: null, batchDelayMs: 0 });
  const result = await batch.run([candidate(PART_A, [reviewOffer()])], { live: false, allowSearchFallback: false });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.needs_evidence.length, 1);
  assert.equal(result.needs_evidence[0].status, OFFER_STATUSES.NEEDS_EVIDENCE);
  assert.ok(result.needs_evidence[0].evidence_gaps.includes('LISTING_MPN'));
});

test('80.1.5 a stored listing that no longer exists is the only reason to search again', async () => {
  let getItemCalls = 0;
  let searchCalls = 0;
  const apiClient = {
    searchItems: async () => { throw new Error('engine.processBatch is stubbed'); },
    getItem: async () => {
      getItemCalls++;
      return { success: false, item: null, cached: false, errors: ['eBay getItem returned HTTP 404'] };
    }
  };
  const engine = new EbayHighVolumeEngine({ apiClient, batchDelayMs: 0, checkpointIntervalMs: -1 });
  engine.processBatch = async () => {
    searchCalls++;
    return {
      active_offers: [{ part_number: PART_A, item_id: 'v1|new|0', decision: 'ACCEPT', status: OFFER_STATUSES.ACTIVE, match_type: MATCH_TYPES.EXACT_MPN }],
      review_offers: [],
      rejected_offers: []
    };
  };
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry: null, batchDelayMs: 0 });
  const result = await batch.run([candidate(PART_A, [reviewOffer()])], {
    live: true,
    allowSearchFallback: true,
    maxGetItems: 10
  });

  assert.equal(getItemCalls, 1, 'getItem is attempted once');
  assert.equal(result.item_unavailable, 1);
  assert.equal(result.search_fallbacks, 1, 'search only after the listing is proven gone');
  assert.equal(searchCalls, 1);
  assert.equal(result.accepted.length, 1);
});

test('80.1.6 offline mode re-adjudicates stored evidence without any network call', async () => {
  const evidenceRegistry = new EbayEvidenceRegistry({ path: path.join(tmpDir(), 'evidence.json') });
  evidenceRegistry.record('v1|500|0', {
    item_id: 'v1|500|0',
    marketplace: 'EBAY_DE',
    title: 'Zündkerze NGK BPMR7A STIHL 0000 400 7000',
    mpn: PART_A,
    aspects: [],
    shipping_options: [{ shipToLocations: ['NL'] }],
    affiliate_url: affUrl('500'),
    fetched_at: new Date().toISOString()
  });
  const engine = new EbayHighVolumeEngine({
    apiClient: { searchItems: async () => { throw new Error('no search in offline mode'); }, getItem: async () => { throw new Error('no getItem in offline mode'); } },
    batchDelayMs: 0,
    checkpointIntervalMs: -1
  });
  const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry, batchDelayMs: 0 });
  const result = await batch.run([candidate(PART_A, [reviewOffer()])], { live: false, allowSearchFallback: false });

  assert.equal(result.get_item_requests, 0);
  assert.equal(result.get_item_network_calls, 0);
  assert.equal(result.get_item_reused, 1);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.evidence_completed, 1);
});

test('80.1.7 batch runner persists only proven ACTIVE offers and reports the chain', () => {
  const dir = tmpDir();
  const storePath = path.join(dir, 'ebay_offers.json');
  const evidencePath = path.join(dir, 'evidence.json');
  const outDir = path.join(dir, 'reports');
  const inputPath = path.join(dir, 'input.json');

  fs.writeFileSync(inputPath, JSON.stringify({
    review_offers: [reviewOffer()]
  }), 'utf8');
  fs.writeFileSync(evidencePath, JSON.stringify({
    items: {
      'v1|500|0': {
        item_id: 'v1|500|0',
        marketplace: 'EBAY_DE',
        title: 'Zündkerze NGK BPMR7A STIHL 0000 400 7000',
        mpn: PART_A,
        aspects: [],
        shipping_options: [{ shipToLocations: ['NL'] }],
        affiliate_url: affUrl('500'),
        fetched_at: new Date().toISOString()
      }
    }
  }), 'utf8');

  const childEnv = { ...process.env, EBAY_ENABLED: 'false' };
  for (const key of ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET']) delete childEnv[key];
  const res = spawnSync(process.execPath, [
    'scripts/phase80_evidence_batch.mjs',
    '--input', inputPath,
    '--offline',
    '--store', storePath,
    '--evidence', evidencePath,
    '--out-dir', outDir
  ], { cwd: projectRoot, env: childEnv, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  const store = loadEbayOfferStore(storePath);
  assert.equal(store.offers.length, 1);
  assert.equal(store.offers[0].status, OFFER_STATUSES.ACTIVE);
  assert.equal(store.offers[0].part_number, PART_A);
  assert.equal(store.offers[0].decision, 'ACCEPT');

  const reports = fs.readdirSync(outDir);
  assert.equal(reports.length, 1);
  const report = JSON.parse(fs.readFileSync(path.join(outDir, reports[0]), 'utf8'));
  assert.equal(report.live_api, false);
  assert.equal(report.activation_blocker, 'EBAY_CREDENTIALS_MISSING');
  assert.equal(report.exchange.input_selection, 'EXISTING_REVIEW_OFFERS');
  assert.equal(report.metrics.get_item_requests, 0);
  assert.equal(report.metrics.search_fallbacks_for_unavailable_listings, 0);
  assert.equal(report.metrics.candidates_evidence_completed, 1);
  assert.equal(report.metrics.new_active, 1);
  assert.equal(report.metrics.offers_on_persistent_disk, 1);
});
