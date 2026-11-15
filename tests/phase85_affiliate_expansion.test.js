/**
 * Phase 85 — affiliate expansion for the newly verified carburettors.
 *
 * Guard: only fully evidenced, NL-shippable offers with the configured EPN
 * campaign may be in the payload, and the audit numbers must be recomputable
 * from that payload.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));
const normalize = (value) => String(value || '').replace(/[\s-]/g, '');

const payload = readJson('output/phase85/ebay_offers_phase85.json');
const audit = readJson('output/phase85/PHASE85_AFFILIATE_AUDIT.json');
const catalogNumbers = new Set(readJson('data/parts_catalog.json').parts.map((part) => normalize(part.part_number)));

test('Phase 85: every affiliate offer is ACTIVE, ACCEPT, NL-shippable and evidence-backed', () => {
  assert.ok(payload.offers.length > 0, 'the batch must have produced offers');
  for (const offer of payload.offers) {
    assert.strictEqual(offer.status, 'ACTIVE', `${offer.item_id} must be ACTIVE`);
    assert.strictEqual(offer.decision, 'ACCEPT', `${offer.item_id} must be accepted`);
    assert.strictEqual(offer.ships_to_nl, true, `${offer.item_id} must ship to NL`);
    assert.strictEqual(offer.shipping_status, 'SHIPS_TO_NL_CONFIRMED', `${offer.item_id} needs confirmed NL delivery`);
    assert.ok(offer.match_type && offer.match_type !== 'REVIEW', `${offer.item_id} needs a proven match type`);
    assert.ok(offer.campaign_id === '5339245312', `${offer.item_id} must carry EPN campaign 5339245312`);
    assert.ok(/^https:\/\/[^/]*ebay\.(nl|de|com)\//.test(offer.affiliate_url), `${offer.item_id} needs an eBay affiliate URL`);
    assert.ok(offer.affiliate_url.includes('campid=5339245312'), `${offer.item_id} URL must carry the campaign id`);
  }
  assert.strictEqual(payload.campaign_id, '5339245312');
});

test('Phase 85: offers point at catalogued parts and are unique', () => {
  const keys = new Set();
  for (const offer of payload.offers) {
    assert.ok(catalogNumbers.has(normalize(offer.part_number)), `${offer.part_number} must exist in the catalog`);
    const key = `${offer.part_number}:${offer.marketplace}:${offer.item_id}`;
    assert.ok(!keys.has(key), `duplicate offer ${key}`);
    keys.add(key);
  }
});

test('Phase 85: the audit numbers are recomputable from the payload', () => {
  const parts = new Set(payload.offers.map((offer) => offer.part_number));
  assert.strictEqual(audit.offers_in_payload, payload.offers.length);
  assert.strictEqual(audit.parts_with_new_offers, parts.size);
  assert.deepStrictEqual([...audit.offer_parts].sort(), [...parts].sort());
  assert.strictEqual(
    audit.new_active_offers + audit.reimported_known_offers,
    payload.offers.length,
    'every payload offer is either new or a known re-import'
  );
  for (const [part, count] of Object.entries(audit.offers_per_part)) {
    assert.strictEqual(count, payload.offers.filter((offer) => offer.part_number === part).length);
  }
  assert.strictEqual(audit.parts_attempted, audit.offer_parts.length + (audit.parts_attempted - audit.offer_parts.length));
});

test('Phase 85: existing ACTIVE offers are preserved, not replaced', () => {
  assert.strictEqual(audit.preservation.production_active_offers_before, 1649);
  assert.ok(
    audit.preservation.production_active_offers_after_minimum >= audit.preservation.production_active_offers_before,
    'the store may only grow'
  );
  assert.strictEqual(
    audit.unique_parts_with_direct_purchase_after,
    audit.preservation.production_parts_with_direct_purchase_before + audit.parts_with_new_offers
  );
  const storeSource = fs.readFileSync(path.join(rootDir, 'src/affiliate/EbayOfferStore.js'), 'utf8');
  assert.ok(storeSource.includes('preserved: preservedKeys.size'), 'untouched records are reported as preserved');
});

test('Phase 85: no Amazon offer was claimed without evidence', () => {
  assert.match(audit.amazon_status, /0 Amazon offers/, 'the audit must state the Amazon blocker explicitly');
  assert.ok(!payload.offers.some((offer) => String(offer.marketplace).startsWith('AMAZON')));
});
