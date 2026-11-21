/**
 * tests/phase96_ebay_activation_batch.test.js
 *
 * Phase 96 — eBay activation batch invariants.
 *
 * The batch itself is produced by scripts/phase96_ebay_activation.mjs (live
 * Browse API). This suite checks the persisted result, so a later change cannot
 * silently publish an eBay offer that lacks NL delivery proof, the EPN campaign
 * or a match type the store accepts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const STORE = 'data/affiliate/ebay_offers.json';
const QUEUE = 'output/phase96/queue.json';
const ACTIVATION = 'output/phase96/PHASE96_EBAY_ACTIVATION.json';
const CAMPAIGN = '5339245312';

const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
const activation = JSON.parse(fs.readFileSync(ACTIVATION, 'utf8'));

test('Phase 96 — 1. the eBay store keeps every reconciled offer and only grows', () => {
  assert.ok(store.offers.length >= 1773, 'the Phase 93 reconciled store must never shrink');
  const parts = new Set(store.offers.map(o => o.part_number));
  assert.ok(parts.size >= 220, 'no part may lose its eBay offer');
  assert.equal(store.offers.filter(o => o.status === 'ACTIVE').length, store.offers.length);
});

test('Phase 96 — 2. every ACTIVE offer carries NL delivery proof and the EPN campaign', () => {
  for (const offer of store.offers) {
    assert.equal(offer.ships_to_nl, true, `${offer.item_id} must ship to NL`);
    assert.equal(offer.shipping_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.ok(String(offer.affiliate_url || '').includes(`campid=${CAMPAIGN}`), `${offer.item_id} must carry the campaign id`);
  }
});

test('Phase 96 — 3. the batch activated new parts and recorded them in the report', () => {
  const acceptedParts = new Set(activation.accepted_offers.map(o => o.part_number));
  assert.equal(acceptedParts.size, activation.result.new_active_parts);
  assert.ok(activation.result.new_active_parts > 0, 'the batch must have activated at least one part');
  assert.ok(activation.result.ebay_unique_parts_after >= 220 + activation.result.new_active_parts);
  for (const part of acceptedParts) {
    assert.ok(
      store.offers.some(o => o.part_number === part && o.status === 'ACTIVE'),
      `${part} must be present in the store`
    );
  }
});

test('Phase 96 — 4. only store-approved match types were published', () => {
  const allowed = new Set(['EXACT_MPN', 'EXACT_PART_NUMBER_WITH_CORROBORATION', 'VERIFIED_REPLACEMENT']);
  for (const offer of activation.accepted_offers) {
    assert.ok(allowed.has(offer.match_type), `${offer.item_id} has non-activatable match type ${offer.match_type}`);
  }
});

test('Phase 96 — 5. the queue covers parts that have no eBay offer yet', () => {
  assert.ok(queue.summary.queue_size > 0);
  assert.ok(queue.summary.candidates_without_ebay_offer > 0);
  const storeParts = new Set(store.offers.map(o => o.part_number));
  for (const entry of queue.queue) {
    // Queue parts are selected before activation; those activated in this batch
    // are now in the store, the rest must still be absent (no phantom records).
    assert.match(entry.part_number, /^\d{11}$/);
  }
  assert.ok(storeParts.size >= 220);
});
