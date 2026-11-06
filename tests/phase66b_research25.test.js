import test from 'node:test';
import assert from 'node:assert/strict';
import { ids, curated, validateObservation, assess, run } from '../scripts/phase66b_research25.mjs';

const row = { part_number: ids[0], queue_rank: 34, part_name: 'Rim sprocket', category: 'kettingwiel', candidates: [] };
const fixture = { part_number: ids[0], observed_at: '2026-11-06', source_url: `https://www.amazon.nl/dp/${'B012345678'}?tag=test-21`, source_kind: 'MARKETPLACE_PRODUCT', page_type: 'PRODUCT', claim: 'Fictitious listing B012345678', exact_part_found: false, asin: 'B012345678', marketplace: 'amazon.nl' };

test('25 unique selected in priority order; curated attribution distinguishes search from product', () => {
  assert.equal(ids.length, 25);
  assert.equal(new Set(ids).size, 25);
  assert.equal(curated.length, 36);
  curated.forEach(validateObservation);
  assert.equal(assess(row, curated).product_identity_confirmed, false);
});

test('fictitious marketplace candidate never verified, even with listing and claimed gate pass', () => {
  const result = assess(row, [fixture], [{ part_number: ids[0], asin: 'B012345678', marketplace: 'amazon.nl', source_url: fixture.source_url, status: 'VERIFIED', gate_1: 'PASS', gate_2: 'PASS' }]);
  assert.equal(result.candidates[0].status, 'STAGED');
  assert.equal(result.candidates[0].gate_2, 'FAIL');
  assert.equal(result.activation_state, 'INACTIVE');
});

test('cross-region, GTIN and quantity conflicts reject; attribution and GTIN validated', () => {
  const candidate = { part_number: ids[0], asin: 'B012345678', marketplace: 'amazon.nl', source_url: fixture.source_url, ean_gtin: '0036577187202', package_quantity: 1 };
  for (const conflict of [
    { ...fixture, source_url: `https://www.amazon.de/dp/${fixture.asin}?tag=test-21`, marketplace: 'amazon.de' },
    { ...fixture, ean_gtin: '0087295130667' },
    { ...fixture, package_quantity: 10 }
  ]) assert.equal(assess(row, [conflict], [candidate]).candidates[0].status, 'REJECTED');
  assert.throws(() => validateObservation({ ...fixture, source_url: 'https://example.com/dp/B012345678' }));
  assert.throws(() => validateObservation({ ...fixture, ean_gtin: '0036577187203' }));
  assert.throws(() => validateObservation({ ...fixture, part_number: 'bad' }));
  assert.throws(() => validateObservation({ ...fixture, source_url: `https://www.amazon.nl.evil.com/dp/${fixture.asin}?tag=test-21` }));
  assert.throws(() => validateObservation({ ...fixture, source_url: 'https://www.amazon.nl/s?k=B012345678&tag=test-21' }));
  assert.throws(() => validateObservation({ ...fixture, source_kind: 'INDEPENDENT_CATALOG' }));
  assert.throws(() => validateObservation({ ...fixture, source_kind: 'MANUFACTURER_PRODUCT' }));
  assert.equal(assess(row, [{ ...fixture, manufacturer: 'Other' }], [{ ...candidate, manufacturer: 'STIHL' }]).candidates[0].reason, 'CONFLICTING_EVIDENCE');
});

test('historical mappings dedupe and retain provenance; absence stays research required', () => {
  const historical = { ...row, candidates: [{ asin: 'B012345678', marketplace: 'amazon.nl', status: 'STAGED' }] };
  const result = assess(historical, [fixture], [{ part_number: ids[0], asin: 'B012345678', marketplace: 'amazon.nl', source_url: fixture.source_url }]);
  assert.equal(result.candidates.length, 1);
  assert.equal(assess(row, []).status, 'RESEARCH_REQUIRED');
});

test('temporary input failures do not change completed report', async () => {
  await assert.rejects(run({ importPath: 'missing-phase66b-import.json' }), { code: 'ENOENT' });
  await assert.rejects(run({ stopAfter: 26 }), /Invalid stopAfter/);
});
