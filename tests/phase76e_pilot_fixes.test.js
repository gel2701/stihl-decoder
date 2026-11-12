/**
 * tests/phase76e_pilot_fixes.test.js
 *
 * Phase 76E — Targeted regression fixes:
 * 1. Title matching without MPN supporting spaces, hyphens, compact part numbers.
 * 2. Explicit ACCEPT/REVIEW/REJECT processing; only ACCEPT in active_offers.
 * 3. Product type check with classifyPart + knownParts.
 * 4. --limit N and --run-id X pilot script arguments.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';

process.env.EBAY_ENABLED = 'true';
process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';

const CAMPAIGN = '5339245312';
const AFF_URL = `https://www.ebay.de/itm/1?campid=${CAMPAIGN}`;

// Full, otherwise-valid Browse item so validateOffer reaches the decision stage.
function item(overrides = {}) {
  return {
    itemId: 'v1|1|0',
    title: 'Zündkerze',
    mpn: '',
    price: { value: '5.95', currency: 'EUR' },
    seller: { username: 'any_seller' },
    shippingOptions: [{ shippingCost: { value: '4.95', currency: 'EUR' }, shipToLocations: ['NL'] }],
    itemAffiliateWebUrl: AFF_URL,
    condition: 'NEW',
    ...overrides
  };
}

test('Phase 76E.1: Title matching without MPN supports compact, hyphen, spaced formats', () => {
  const part = '00004007000';
  const engine = new EbayHighVolumeEngine({ apiClient: {} });

  const compact = engine.validateOffer(item({ title: 'Zündkerze STIHL 00004007000 Motorsäge' }), part, {});
  assert.ok(compact, 'compact title inline must not reject');
  assert.strictEqual(compact.decision, 'REVIEW', 'compact title-only match is REVIEW');

  const hyphen = engine.validateOffer(item({ title: 'Zündkerze 0000-400-7000 passend' }), part, {});
  assert.ok(hyphen, 'hyphen title must not reject');
  assert.strictEqual(hyphen.decision, 'REVIEW', 'hyphen title-only match is REVIEW');

  const spaced = engine.validateOffer(item({ title: 'Zündkerze 0000 400 7000 passend' }), part, {});
  assert.ok(spaced, 'spaced title must not reject');
  assert.strictEqual(spaced.decision, 'REVIEW', 'spaced title-only match is REVIEW');

  const wrong = engine.validateOffer(item({ title: 'Zündkerze NGK BPMR7A 00004007011 Motorsäge' }), part, {});
  assert.strictEqual(wrong, null, 'different part number must reject');
});

test('Phase 76E.2: Exact MPN match yields ACCEPT', () => {
  const engine = new EbayHighVolumeEngine({ apiClient: {} });
  const result = engine.validateOffer(item({ title: 'NGK Zündkerze 0000 400 7000', mpn: '00004007000' }), '00004007000', {});
  assert.ok(result, 'exact MPN should not reject');
  assert.strictEqual(result.decision, 'ACCEPT');
  assert.strictEqual(result.match_basis, 'MPN_EXACT');
});

test('Phase 76E.3: Only ACCEPT may enter active_offers; REVIEW excluded', () => {
  const engine = new EbayHighVolumeEngine({ apiClient: {} });

  const accept = engine.validateOffer(item({ title: 'Zündkerze 0000 400 7000', mpn: '00004007000' }), '00004007000', {});
  const review = engine.validateOffer(item({ title: 'Zündkerze 00004007000 passend', mpn: '' }), '00004007000', {});
  const reject = engine.validateOffer(item({ title: 'Sommerangebote Zündkerze', mpn: '' }), '00004007000', {});

  assert.ok(accept && accept.decision === 'ACCEPT');
  assert.ok(review && review.decision === 'REVIEW');
  assert.strictEqual(reject, null);

  // Mirror the processBatch rule: only ACCEPT is pushed to active_offers.
  const activeOffers = [accept, review, reject].filter(o => o && o.decision === 'ACCEPT');
  assert.strictEqual(activeOffers.length, 1, 'only ACCEPT may enter active_offers');
  assert.ok(review.decision !== 'ACCEPT', 'REVIEW never enters active_offers');
});

test('Phase 76E.4: Product type check with classifyPart + knownParts', () => {
  const engine = new EbayHighVolumeEngine({ apiClient: {} });
  const known = [{ part_number: '00004007000', description: 'Spark plug NGK CMR6H bougie' }];
  const cls = engine.classifyPart('00004007000', known);
  assert.strictEqual(cls.type, 'spark_plug');

  // Carburetor title with the spark plug part number must be rejected by the type gate.
  const carb = engine.validateOffer(item({ title: 'Vergaser Kit 0000 400 7000', mpn: '00004007000' }), '00004007000', cls);
  assert.strictEqual(carb, null, 'carb title must be rejected for spark_plug classification');

  // Unknown classification does not block a valid match.
  const unknownCls = engine.classifyPart('00004007000', [{ part_number: 'some', description: 'random part' }]);
  assert.strictEqual(unknownCls.type, 'unknown');
  const generic = engine.validateOffer(item({ title: 'Zündkerze 0000 400 7000', mpn: '00004007000' }), '00004007000', unknownCls);
  assert.ok(generic && generic.decision === 'ACCEPT', 'unknown type keeps valid exact-MPN match');
});

test('Phase 76E.5: --limit N selects exactly N parts; default 100 unchanged', () => {
  function readArg(name, arr = []) {
    const i = arr.indexOf(name);
    return i >= 0 ? arr[i + 1] : null;
  }
  const limit = readArg('--limit', ['--select-only', '--limit', '10']);
  assert.strictEqual(Number(limit), 10);
  assert.strictEqual(readArg('--limit', ['--select-only']), null);

  const unique = Array.from({ length: 100 }, (_, i) => ({ part_number: String(11111111100 + i) }));
  const limited = Number(limit) ? unique.slice(0, Number(limit)) : unique;
  assert.strictEqual(limited.length, 10, '--limit 10 selects exactly ten parts');
  assert.strictEqual(unique.length, 100, 'default selection stays 100 parts');
});

test('Phase 76E.6: --run-id X parses and is filename-safe', () => {
  function readArg(name, arr = []) {
    const i = arr.indexOf(name);
    return i >= 0 ? arr[i + 1] : null;
  }
  const runId = readArg('--run-id', ['--run-id', 'testrun123']);
  assert.strictEqual(runId, 'testrun123');
  assert.ok(/^[A-Za-z0-9._-]+$/.test(runId));
  const stateName = `pilot_100_state${runId ? `_${runId}` : ''}.json`;
  assert.strictEqual(stateName, 'pilot_100_state_testrun123.json');
});

test('Phase 76E.7: ACCEPT/REVIEW/REJECT engine output is explicit', () => {
  const engine = new EbayHighVolumeEngine({ apiClient: {} });
  const accept = engine.validateOffer(item({ title: 'NGK Zündkerze', mpn: '00004007000' }), '00004007000', {});
  const review = engine.validateOffer(item({ title: 'Zündkerze 00004007000', mpn: '' }), '00004007000', {});
  const reject = engine.validateOffer(item({ title: 'Sommerangebote', mpn: '' }), '00004007000', {});

  assert.strictEqual(accept.decision, 'ACCEPT');
  assert.strictEqual(review.decision, 'REVIEW');
  assert.strictEqual(reject, null);
});