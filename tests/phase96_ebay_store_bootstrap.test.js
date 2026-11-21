/**
 * tests/phase96_ebay_store_bootstrap.test.js
 *
 * Phase 96 — the committed eBay offers must reach the persistent store, and the
 * bootstrap must never remove, rewrite or weaken an offer that is already there.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { reconcileEbayStoreFromArchive } from '../src/affiliate/EbayStoreBootstrap.js';
import { loadEbayOfferStore, saveEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';

const CAMPAIGN = '5339245312';

const makeOffer = (part, itemId, marketplace) => ({
  part_number: part,
  item_id: itemId,
  marketplace,
  decision: 'ACCEPT',
  status: 'ACTIVE',
  match_type: 'EXACT_MPN',
  title: `STIHL ${part}`,
  ships_to_nl: true,
  shipping_status: 'SHIPS_TO_NL_CONFIRMED',
  item_price: 10,
  shipping_cost_nl: 5,
  currency: 'EUR',
  affiliate_url: `https://www.ebay.nl/itm/${String(itemId).replace(/\D/g, '')}?campid=${CAMPAIGN}`,
  checked_at: new Date().toISOString()
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'phase96-bootstrap-'));

test('Phase 96 bootstrap — 1. adds the committed ACTIVE offers to an empty persistent store', () => {
  const dir = tmp();
  const archivePath = path.join(dir, 'archive.json');
  const storePath = path.join(dir, 'store', 'ebay_offers.json');
  saveEbayOfferStore(archivePath, [makeOffer('11226642200', 'v1|1|0', 'EBAY_DE'), makeOffer('00007912009', 'v1|2|0', 'EBAY_NL')], { campaignId: CAMPAIGN });

  const result = reconcileEbayStoreFromArchive({ archivePath, storePath, campaignId: CAMPAIGN });
  assert.equal(result.applied, true);
  assert.equal(result.added, 2);
  assert.equal(loadEbayOfferStore(storePath).offers.length, 2);
});

test('Phase 96 bootstrap — 1b. uses the campaign id recorded in the archive when the environment has none', () => {
  const dir = tmp();
  const archivePath = path.join(dir, 'archive.json');
  const storePath = path.join(dir, 'store', 'ebay_offers.json');
  saveEbayOfferStore(archivePath, [makeOffer('11226642200', 'v1|1|0', 'EBAY_DE')], { campaignId: CAMPAIGN });
  const result = reconcileEbayStoreFromArchive({ archivePath, storePath });
  assert.equal(result.applied, true);
  assert.equal(result.added, 1);
  assert.equal(result.rejected, 0);
});

test('Phase 96 bootstrap — 2. is idempotent and never duplicates on a later boot', () => {
  const dir = tmp();
  const archivePath = path.join(dir, 'archive.json');
  const storePath = path.join(dir, 'store', 'ebay_offers.json');
  saveEbayOfferStore(archivePath, [makeOffer('11226642200', 'v1|1|0', 'EBAY_DE')], { campaignId: CAMPAIGN });

  reconcileEbayStoreFromArchive({ archivePath, storePath, campaignId: CAMPAIGN });
  const second = reconcileEbayStoreFromArchive({ archivePath, storePath, campaignId: CAMPAIGN });
  assert.equal(second.applied, false);
  assert.equal(second.reason, 'ALREADY_IN_SYNC');
  assert.equal(loadEbayOfferStore(storePath).offers.length, 1);
});

test('Phase 96 bootstrap — 3. keeps offers that only exist in the persistent store', () => {
  const dir = tmp();
  const archivePath = path.join(dir, 'archive.json');
  const storePath = path.join(dir, 'store', 'ebay_offers.json');
  saveEbayOfferStore(archivePath, [makeOffer('11226642200', 'v1|1|0', 'EBAY_DE')], { campaignId: CAMPAIGN });
  saveEbayOfferStore(storePath, [makeOffer('00006421239', 'v1|9|0', 'EBAY_NL')], { campaignId: CAMPAIGN });

  reconcileEbayStoreFromArchive({ archivePath, storePath, campaignId: CAMPAIGN });
  const parts = loadEbayOfferStore(storePath).offers.map(o => o.part_number).sort();
  assert.deepEqual(parts, ['00006421239', '11226642200']);
});

test('Phase 96 bootstrap — 4. does nothing when the archive is the store itself', () => {
  const dir = tmp();
  const storePath = path.join(dir, 'ebay_offers.json');
  saveEbayOfferStore(storePath, [makeOffer('11226642200', 'v1|1|0', 'EBAY_DE')], { campaignId: CAMPAIGN });
  const result = reconcileEbayStoreFromArchive({ archivePath: storePath, storePath, campaignId: CAMPAIGN });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'SAME_STORE');
});

test('Phase 96 bootstrap — 5. refuses records the store guard rejects', () => {
  const dir = tmp();
  const archivePath = path.join(dir, 'archive.json');
  const storePath = path.join(dir, 'store', 'ebay_offers.json');
  const broken = { ...makeOffer('11226642200', 'v1|1|0', 'EBAY_DE'), affiliate_url: `https://www.ebay.nl/itm/1?campid=999` };
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, JSON.stringify({
    schema_version: '1.0.0',
    updated_at: new Date().toISOString(),
    offers: [broken]
  }), 'utf8');

  const result = reconcileEbayStoreFromArchive({ archivePath, storePath, campaignId: CAMPAIGN });
  assert.equal(result.applied, true);
  assert.equal(result.added, 0);
  assert.equal(result.rejected, 1);
  assert.equal(loadEbayOfferStore(storePath).offers.length, 0);
});
