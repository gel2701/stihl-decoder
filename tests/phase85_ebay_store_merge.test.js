/**
 * Phase 85 — eBay offer store merge regression.
 *
 * Reproduces the real Phase 82/84 overlap: 41 of the 42 Phase 84 offers are
 * re-imports of listings already stored from Phase 82, plus one genuinely new
 * listing. Before the Phase 85 repair the whole record was replaced, so the
 * re-import erased adjudicated product and shipping evidence with empty values.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  ebayOfferKey,
  loadEbayOfferStore,
  mergeEbayOfferRecord,
  saveEbayOfferStore,
  toCanonicalEbayOffer
} from '../src/affiliate/EbayOfferStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));
const CAMPAIGN = '5339245312';

const phase82 = readJson('output/phase82/ebay_offers_phase82.json').offers
  .filter((o) => o.status === 'ACTIVE' && o.decision === 'ACCEPT');
const phase84 = readJson('output/phase84/ebay_offers_phase84.json').offers
  .filter((o) => o.status === 'ACTIVE' && o.decision === 'ACCEPT');

const keyOf = (offer) => ebayOfferKey(offer.item_id, offer.marketplace || offer.marketplaceId, offer.part_number);
const phase82Keys = new Set(phase82.map(keyOf));
const overlapping = phase84.filter((offer) => phase82Keys.has(keyOf(offer)));
const brandNew = phase84.filter((offer) => !phase82Keys.has(keyOf(offer)));

/** The stored state a live matcher leaves behind: adjudicated evidence objects. */
function storedRecord(offer, index) {
  const canonical = toCanonicalEbayOffer(offer, { campaignId: CAMPAIGN });
  assert.ok(canonical, `Phase 82 offer ${offer.item_id} must be storable`);
  return {
    ...canonical,
    shipping_evidence: { source: 'phase82_live', ships_to_nl: true, checked_at: '2026-11-14T00:00:00.000Z', ref: `ship-${index}` },
    product_evidence: { source: 'phase82_live', mpn: canonical.mpn, match: 'EXACT_MPN', ref: `prod-${index}` },
    first_seen_at: '2026-11-14T00:00:00.000Z'
  };
}

function tempStore(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase85-store-'));
  const file = path.join(dir, 'ebay_offers.json');
  fs.writeFileSync(file, JSON.stringify({
    schema_version: '1.0.0',
    updated_at: '2026-11-14T00:00:00.000Z',
    campaign_id: CAMPAIGN,
    policy: {},
    metrics: { total: records.length, active: records.length },
    offers: records
  }, null, 2));
  return file;
}

test('Phase 85: the Phase 82/84 overlap is 41 re-imports plus one new listing', () => {
  assert.strictEqual(phase84.length, 42, 'Phase 84 payload carries 42 ACTIVE offers');
  assert.strictEqual(overlapping.length, 41, '41 of them already existed in the Phase 82 payload');
  assert.strictEqual(brandNew.length, 1, 'exactly one listing is genuinely new');
});

test('Phase 85: re-importing a batch never erases stored product or shipping evidence', () => {
  const stored = overlapping.map(storedRecord);
  const file = tempStore(stored);
  const before = loadEbayOfferStore(file).offers;
  assert.strictEqual(before.length, 41);

  const result = saveEbayOfferStore(file, phase84, { campaignId: CAMPAIGN });

  assert.strictEqual(result.rejected, 0, 'every Phase 84 offer is storable');
  assert.strictEqual(result.added, 1, 'one record is new');
  assert.strictEqual(result.updated, 41, '41 records are updates, not replacements');
  assert.strictEqual(result.preserved, 0, 'no untouched record is expected in this scenario');
  assert.strictEqual(result.conflicts, 0, 'an empty incoming field is not a conflict');

  const after = loadEbayOfferStore(file);
  assert.strictEqual(after.offers.length, 42, 'the store holds 41 re-imports plus the new listing');
  assert.strictEqual(after.offers.filter((o) => o.status === 'ACTIVE').length, 42, 'all 42 offers stay ACTIVE');

  const byKey = new Map(after.offers.map((offer) => [ebayOfferKey(offer.item_id, offer.marketplace, offer.part_number), offer]));
  for (const record of stored) {
    const merged = byKey.get(ebayOfferKey(record.item_id, record.marketplace, record.part_number));
    assert.ok(merged, `stored listing ${record.item_id} must survive the import`);
    assert.deepStrictEqual(merged.shipping_evidence, record.shipping_evidence, 'shipping evidence must be preserved');
    assert.deepStrictEqual(merged.product_evidence, record.product_evidence, 'product evidence must be preserved');
    assert.strictEqual(merged.first_seen_at, record.first_seen_at, 'first_seen_at must not be rewritten');
  }
});

test('Phase 85: contradictory identity is kept, logged, and never silently merged', () => {
  const base = {
    ...storedRecord(overlapping[0], 0),
    title: 'Genuine stored listing title',
    mpn: 'STORED-MPN'
  };
  const file = tempStore([base]);

  const incoming = {
    ...overlapping[0],
    title: 'Completely different listing title',
    mpn: 'DIFFERENT-MPN',
    item_price: 99.95
  };
  const result = saveEbayOfferStore(file, [incoming], { campaignId: CAMPAIGN });

  assert.strictEqual(result.updated, 1);
  assert.ok(result.conflicts >= 2, 'title and mpn contradictions are recorded');
  const record = loadEbayOfferStore(file).offers[0];
  assert.strictEqual(record.title, base.title, 'stored title wins over a contradictory one');
  assert.strictEqual(record.mpn, base.mpn, 'stored MPN wins over a contradictory one');
  assert.ok(Array.isArray(record.evidence_conflicts) && record.evidence_conflicts.length >= 2);
  assert.ok(record.evidence_conflicts.some((c) => c.field === 'title'));
  assert.strictEqual(record.item_price, 99.95, 'a changed price is updated when it is a real value');
});

test('Phase 85: imports are idempotent and never drop ACTIVE offers', () => {
  const stored = overlapping.map(storedRecord);
  const file = tempStore(stored);
  const first = saveEbayOfferStore(file, phase84, { campaignId: CAMPAIGN });
  const second = saveEbayOfferStore(file, phase84, { campaignId: CAMPAIGN });

  assert.strictEqual(first.added, 1);
  assert.strictEqual(second.added, 0, 'a repeated import adds nothing');
  assert.strictEqual(second.updated, 42, 'a repeated import only refreshes the records it mentions');
  const doc = loadEbayOfferStore(file);
  assert.strictEqual(doc.offers.length, 42, 'the store size is stable');
  assert.strictEqual(doc.offers.filter((o) => o.status === 'ACTIVE').length, 42);
});

test('Phase 85: an empty incoming record keeps every stored evidence field', () => {
  const stored = storedRecord(overlapping[0], 7);
  const incoming = {
    ...toCanonicalEbayOffer(overlapping[0], { campaignId: CAMPAIGN }),
    shipping_evidence: null,
    product_evidence: null,
    gtin: null,
    brand: '',
    seller_name: ''
  };
  const { record, conflicts } = mergeEbayOfferRecord(stored, incoming);
  assert.deepStrictEqual(record.shipping_evidence, stored.shipping_evidence);
  assert.deepStrictEqual(record.product_evidence, stored.product_evidence);
  assert.strictEqual(record.gtin, stored.gtin);
  assert.strictEqual(record.brand, stored.brand);
  assert.strictEqual(record.seller_name, stored.seller_name);
  assert.deepStrictEqual(conflicts, []);
});
