/**
 * tests/phase97_ebay_activation_batch.test.js
 *
 * Phase 97 — persisted activation invariants. The live batch is produced by
 * scripts/phase97_ebay_activation.mjs; this suite checks the artefacts so a
 * later change cannot publish an eBay offer without NL delivery proof, the EPN
 * campaign or a store-approved match type, and cannot quietly drop the queue.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CAMPAIGN = '5339245312';
const store = JSON.parse(fs.readFileSync('data/affiliate/ebay_offers.json', 'utf8'));
const queue = JSON.parse(fs.readFileSync('output/phase97/queue.json', 'utf8'));
const mpn = JSON.parse(fs.readFileSync('output/phase97/listing_mpn_groups.json', 'utf8'));
const baseline = JSON.parse(fs.readFileSync('output/phase97/PHASE97_BASELINE.json', 'utf8'));
const activation = JSON.parse(fs.readFileSync('output/phase97/PHASE97_EBAY_ACTIVATION.json', 'utf8'));

const activeOffers = store.offers.filter(offer => offer.status === 'ACTIVE');
const storeParts = new Set(activeOffers.map(offer => offer.part_number));

test('Phase 97 — 1. the store never shrinks and keeps its NL/campaign contract', () => {
  assert.ok(activeOffers.length >= 2968, 'the Phase 96 store must never shrink');
  assert.ok(storeParts.size >= 503, 'no part may lose its eBay offer');
  for (const offer of activeOffers) {
    assert.equal(offer.ships_to_nl, true, `${offer.item_id} must ship to NL`);
    assert.equal(offer.shipping_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.ok(String(offer.affiliate_url || '').includes(`campid=${CAMPAIGN}`));
  }
});

test('Phase 97 — 2. every reported new offer is ACTIVE in the store', () => {
  for (const offer of activation.accepted_offers) {
    assert.ok(
      activeOffers.some(record =>
        record.part_number === offer.part_number
        && record.item_id === offer.item_id
        && record.marketplace === offer.marketplace),
      `${offer.part_number} ${offer.item_id} must be in the store`
    );
  }
  const reportedParts = new Set(activation.accepted_offers.map(offer => offer.part_number));
  assert.equal(reportedParts.size, activation.result.new_active_parts);
});

test('Phase 97 — 3. published offers use activatable match types only', () => {
  const allowed = new Set(['EXACT_MPN', 'EXACT_PART_NUMBER_WITH_CORROBORATION', 'VERIFIED_REPLACEMENT']);
  for (const offer of activation.accepted_offers) {
    assert.ok(allowed.has(offer.match_type), `${offer.item_id} has non-activatable match type ${offer.match_type}`);
  }
});

test('Phase 97 — 4. the queue resumes after the 400 Phase 96 parts', () => {
  assert.equal(queue.summary.queue_size, 400);
  assert.equal(queue.summary.batch_ids.length, 10);
  assert.deepEqual(queue.summary.batch_ids, [
    'queue_10', 'queue_11', 'queue_12', 'queue_13', 'queue_14',
    'queue_15', 'queue_16', 'queue_17', 'queue_18', 'queue_19'
  ]);
  const phase96Parts = new Set();
  for (const file of fs.readdirSync('output/phase96/batches').filter(name => name.endsWith('_result.json'))) {
    const result = JSON.parse(fs.readFileSync(`output/phase96/batches/${file}`, 'utf8'));
    for (const entry of result.per_part || []) phase96Parts.add(entry.part_number);
  }
  for (const entry of queue.queue) {
    assert.match(entry.part_number, /^\d{11}$/);
    assert.ok(!phase96Parts.has(entry.part_number), `${entry.part_number} was already researched in Phase 96`);
  }
});

test('Phase 97 — 5. the LISTING_MPN backlog is grouped per part', () => {
  assert.equal(mpn.summary.candidates, 846);
  assert.equal(mpn.summary.unique_parts, 146);
  assert.equal(mpn.groups.length, 146);
  for (const group of mpn.groups) {
    assert.ok(group.part_number);
    assert.ok(group.candidates >= 1);
  }
});

test('Phase 97 — 6. the Phase 96 reconciliation explains every uncounted offer', () => {
  const { phase96_growth: growth, phase96_report_counted: counted, phase96_unreported: unreported } = baseline;
  assert.equal(counted.offers + unreported.offers, growth.offers);
  assert.equal(counted.parts + unreported.parts, growth.parts);
  assert.equal(unreported.offers, 500);
  assert.equal(unreported.parts, 124);
  assert.equal(unreported.skipped_parts_in_result_files, 124);
  assert.equal(unreported.skipped_parts_without_store_offer, 0);
});
