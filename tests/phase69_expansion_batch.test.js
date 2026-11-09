import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { validateGtin } from '../src/affiliate/GtinValidator.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const batch = read('reports/phase69_expansion_batch.json');
const verified = read('PHASE60_1_VERIFIED_OFFERS.json');
const pending = read('PHASE60_1_REJECTED_AND_PENDING.json');
const catalog = read('data/parts_catalog.json');
const registry = read('data/affiliate/verified_amazon_registry.json');
const gsc = read('output/phase56g/GSC_INTEGRATION_AUDIT.json');
const phase67 = read('reports/phase67_validation.json');
const expected = [
  ['00004007009', 'B09QH68W83'], ['00006421240', 'B000IBWVWG'],
  ['41470074102', 'B09R1T6X4D'], ['41471410300', 'B08F9K47R9'],
  ['41471404400', 'B09JGG2L99'], ['00003503521', 'B079DNGM5Y'],
  ['07811201109', 'B007X6X91K'], ['07811201110', 'B00474640Y'],
  ['41471900600', 'B08F9MKGTR'], ['41197106000', 'B017SBNY52']
];

test('ranked batch, provenance, identity claims and search fallback', () => {
  assert.deepEqual(batch.candidates.map(c => [c.part_number, c.asin]), expected);
  assert.equal(new Set(batch.candidates.map(c => c.part_number)).size, 10);
  assert.equal(new Set(batch.candidates.map(c => c.asin)).size, 10);
  const activeParts = new Set(registry.offers.filter(o => o.pilot_active).map(o => o.part_number));
  const activeAsins = new Set(registry.offers.filter(o => o.pilot_active).map(o => o.asin));
  const catalogParts = new Set(catalog.parts.map(p => p.part_number));
  for (const [i, c] of batch.candidates.entries()) {
    const source = i < 2 ? verified.offers[i + 3] : pending.items[i - 2];
    const ref = i < 2 ? `PHASE60_1_VERIFIED_OFFERS.json#offers[${i + 3}]` : `PHASE60_1_REJECTED_AND_PENDING.json#items[${i - 2}]`;
    assert.equal(c.rank, i + 1);
    assert.ok(catalogParts.has(c.part_number));
    assert.match(c.asin, /^[A-Z0-9]{10}$/);
    assert.ok(!activeParts.has(c.part_number) && !activeAsins.has(c.asin));
    assert.ok(!/placeholder|example|dummy/i.test(c.asin));
    assert.equal(c.historical_claim.manufacturer, source.manufacturer);
    assert.equal(c.historical_claim.ean_gtin, source.ean_gtin);
    assert.equal(c.historical_claim.oem_type, source.oem_brand_classification);
    assert.equal(c.historical_claim.source, `${ref}.gate_1_technical.fitment_proof`);
    assert.ok(source.gate_1_technical.fitment_proof.includes('FS 460') || source.gate_1_technical.fitment_proof.includes(c.historical_claim.model_fitment_claim.split(',')[0]));
    assert.equal(validateGtin(c.historical_claim.ean_gtin).valid, true);
    assert.equal(c.historical_gate1, source.gate_1_technical.status);
    assert.equal(c.historical_gate2, source.gate_2_product_identity.status);
    assert.ok(c.evidence_refs.includes(ref));
    assert.equal(c.current_gate1, 'FAIL_CURRENT_INSUFFICIENT_EVIDENCE');
    assert.equal(c.current_gate2, 'FAIL_CURRENT_INSUFFICIENT_EVIDENCE');
    assert.ok(['STAGED', 'RESEARCH_REQUIRED'].includes(c.status));
    assert.equal(c.fallback, 'SEARCH');
    assert.equal(checkHistoricalMismatch(c.part_number, c.asin, c.historical_claim.title, c.historical_claim.ean_gtin).isMismatch, false);
    assert.equal(TwoGateVerifier.evaluateGate1({ part_number: c.part_number, asin: c.asin, marketplace: source.marketplace, affiliate_tag: source.affiliate_tag, brand: source.brand, manufacturer: source.manufacturer, oem_brand_classification: source.oem_brand_classification, ean_gtin: source.ean_gtin }, { catalogPartMap: catalogParts, expectedTag: registry.policy.affiliate_tag }).status, 'FAIL');
    assert.equal(TwoGateVerifier.evaluateGate2({ part_number: c.part_number, asin: c.asin, oem_brand_classification: source.oem_brand_classification, asin_identity_verified: false }).status, 'FAIL');
  }
  assert.equal(checkHistoricalMismatch('00006421223', 'B000IBWVWG').isMismatch, true);
  assert.equal(batch.candidates[1].blocker, 'BLOCKED_CONFLICT');
  assert.notEqual(batch.candidates[1].status, 'REJECTED');
});

test('production unchanged and activation explicitly gated', () => {
  assert.equal(registry.policy.max_active_offers_allowed, 3);
  assert.equal(registry.offers.filter(o => o.pilot_active).length, 3);
  assert.equal(batch.production_baseline.max_active_offers_allowed, registry.policy.max_active_offers_allowed);
  assert.equal(batch.production_baseline.active_offers, 3);
  assert.equal(batch.production_baseline.change_requested, false);
  assert.deepEqual(batch.counts, { candidates: 10, staged: 0, research_required: 10, blocked_conflict: 1, ready_for_manual_review: 0, new_verified: 0, activated: 0 });
  assert.equal(batch.future_activation_proposal.operator_approval_required, true);
  assert.equal(batch.future_activation_proposal.current_cap_unchanged, 3);
  assert.equal(batch.future_activation_proposal.proposed_future_max_active_offers, '5/10');
  assert.equal(batch.future_activation_proposal.auto_activation, false);
  assert.equal(batch.amazon_creators.live_access, phase67.amazon_access.live_access_working);
  for (const key of ['impressions', 'clicks', 'ctr', 'average_position']) assert.equal(batch.gsc[key], gsc.live_gsc_metrics[key]);
  assert.equal(batch.phase68b2.ready_for_manual_review, 0);
  for (const file of ['reports/phase69_expansion_batch.json', 'reports/phase69_expansion_readiness.md', 'tests/phase69_expansion_batch.test.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /https?:\/\/www\.amazon\.nl\/dp\/[A-Z0-9]{10}/i);
  }
});
