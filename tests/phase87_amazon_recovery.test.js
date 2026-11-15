/**
 * tests/phase87_amazon_recovery.test.js
 *
 * Phase 87 — Amazon recovery & direct affiliate activation.
 *
 * This phase repaired the amazon.nl half of the affiliate registry: 24 ACTIVE
 * offers and 53 research candidates pointed at listings that returned HTTP 404.
 * Fresh browser checks plus independent dealer-catalog corroboration produced
 * 23 new ACTIVE offers on 23 parts, and the delisted predecessors stay in the
 * registry as SUSPENDED records.
 *
 * The tests below pin the resulting truth:
 *
 *  1. the scale of the registry and that every Phase 86 live offer survived;
 *  2. every Phase 87 activation carries page-level evidence, the NL tag, and no
 *     uncorroborated GTIN;
 *  3. every ACTIVE offer still passes the unchanged TwoGateVerifier;
 *  4. superseded listings stay suspended and keep their original evidence;
 *  5. a listing without a manufacturer brand was refused (no brand inflation);
 *  6. every ACTIVE part is in the operator authorization list;
 *  7. catalogue invariants are untouched.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));

const registryDoc = readJson('data/affiliate/verified_amazon_registry.json');
const activation = readJson('output/phase87/PHASE87_ACTIVATION.json');
const catalogDoc = readJson('data/parts_catalog.json');
const catalogParts = new Set((catalogDoc.parts || catalogDoc).map((p) => p.part_number));

const activeOffers = registryDoc.offers.filter((o) => o.status === 'ACTIVE');
const phase87Offers = registryDoc.offers.filter((o) => o.status === 'ACTIVE' && /Phase 87/.test(o.status_reason || ''));

describe('Phase 87 — Amazon recovery', () => {
  it('1. grows the registry without losing a single live Phase 86 offer', () => {
    assert.strictEqual(registryDoc.offers.length, 179, 'Every historical Amazon record stays in the registry');
    assert.strictEqual(registryDoc.metrics.active, 98);
    assert.strictEqual(registryDoc.metrics.active_nl, 52);
    assert.strictEqual(registryDoc.metrics.active_de, 46);
    assert.strictEqual(registryDoc.metrics.parts_with_amazon_offer, 84);

    const survivingPhase86 = registryDoc.offers.filter(
      (o) => o.status === 'ACTIVE' && o.availability_audit?.verdict === 'LISTING_LIVE'
    );
    assert.strictEqual(survivingPhase86.length, 75, 'All 75 offers that were live in Phase 86 must stay ACTIVE');
  });

  it('2. every Phase 87 activation carries page-level evidence and the correct tag', () => {
    assert.strictEqual(activation.activated, 23);
    assert.strictEqual(phase87Offers.length, 23);
    for (const offer of phase87Offers) {
      assert.ok(catalogParts.has(offer.part_number), `Part ${offer.part_number} must exist in the canonical catalog`);
      assert.strictEqual(offer.marketplace, 'amazon.nl');
      assert.strictEqual(offer.affiliate_tag, 'srihldecoder2-21', 'Amazon.nl offers must carry the NL tag');
      assert.ok(offer.direct_affiliate_url.includes(`tag=srihldecoder2-21`));
      assert.strictEqual(offer.ean_gtin, null, 'No uncorroborated GTIN may be carried into a new activation');

      const amazonSource = (offer.verifiable_evidence_sources || []).find((s) => s.type === 'AMAZON_PRODUCT_PAGE');
      assert.ok(amazonSource, `Offer ${offer.part_number} must record the Amazon product page it was verified on`);
      assert.ok(amazonSource.url.includes(`amazon.nl/dp/${offer.asin}`));
      assert.match(amazonSource.url, /^https:\/\/www\.amazon\.nl\/dp\/[A-Z0-9]{10}$/);
      assert.strictEqual(amazonSource.retrieved_at, '2026-11-15');
      assert.ok(
        offer.verifiable_evidence_sources.every((s) => typeof s.claim === 'string' && s.claim.length > 20),
        `Offer ${offer.part_number} must describe what each source actually proves`
      );
      assert.ok(
        offer.compatibility_proof && offer.compatibility_proof.includes(offer.part_number_formatted),
        `Offer ${offer.part_number} must name the exact STIHL number in its compatibility proof`
      );
      assert.strictEqual(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    }
  });

  it('3. every ACTIVE offer still passes the unchanged Two-Gate verification', () => {
    for (const offer of activeOffers) {
      const result = TwoGateVerifier.verifyOffer(offer, {
        catalogPartMap: catalogParts,
        expectedTag: offer.marketplace === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21'
      });
      assert.strictEqual(result.passed, true, `Active offer ${offer.part_number} (${offer.asin}) must pass: ${result.errors.join('; ')}`);
    }
  });

  it('4. delisted predecessors stay suspended with their original evidence', () => {
    const replaced = phase87Offers.filter((o) => o.supersedes_asin);
    assert.strictEqual(replaced.length, 22, '22 activations replace a delisted listing; the Champion plug reused its own ASIN');

    for (const offer of replaced) {
      const predecessor = registryDoc.offers.find(
        (o) => o.part_number === offer.part_number && o.asin === offer.supersedes_asin
      );
      assert.ok(predecessor, `Predecessor ${offer.supersedes_asin} of ${offer.part_number} must be preserved`);
      assert.strictEqual(predecessor.status, 'SUSPENDED');
      assert.strictEqual(predecessor.superseded_by_asin, offer.asin);
      assert.ok(predecessor.suspension_reason, 'The predecessor keeps the reason it can no longer be served');
      assert.ok(predecessor.verification_date, 'The predecessor keeps its original verification date');
      assert.ok(
        (predecessor.verifiable_evidence_sources || []).length > 0,
        'The predecessor keeps its original evidence sources'
      );
    }
  });

  it('5. refuses a listing that has no manufacturer brand', () => {
    const generic = registryDoc.offers.find((o) => o.part_number === '41341410300' && o.asin === 'B0D3GRT27F');
    assert.strictEqual(generic, undefined, 'The unbranded 10-pack may not be registered as an active offer');
    const part = registryDoc.offers.find((o) => o.part_number === '41341410300');
    assert.ok(part, 'The part keeps its record');
    assert.notStrictEqual(part.status, 'ACTIVE');
    assert.ok(/Generic/i.test(part.phase_87_review || ''), 'The refusal reason must be recorded');
  });

  it('6. only operator-authorized parts are active', () => {
    const script = fs.readFileSync(path.join(rootDir, 'scripts/check_affiliate_consistency.mjs'), 'utf8');
    const authorized = new Set(script.match(/'(\d{11})'/g)?.map((s) => s.replace(/'/g, '')) || []);
    assert.ok(authorized.size > 50, 'The authorization list must be readable');
    for (const offer of activeOffers) {
      assert.ok(authorized.has(offer.part_number), `Active part ${offer.part_number} must be explicitly authorized`);
    }
  });

  it('7. keeps the catalog and marketplace invariants intact', () => {
    assert.strictEqual((catalogDoc.parts || catalogDoc).length, 18480);
    for (const offer of activeOffers) {
      if (offer.marketplace === 'amazon.de') {
        assert.strictEqual(offer.affiliate_tag, 'srihldecode00-21', 'Amazon.de never carries the NL tag');
        assert.strictEqual(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
      } else {
        assert.strictEqual(offer.affiliate_tag, 'srihldecoder2-21');
      }
    }
    const duplicates = new Set();
    for (const offer of activeOffers) {
      const key = `${offer.part_number}:${offer.marketplace}:${offer.asin}`;
      assert.ok(!duplicates.has(key), `Duplicate active offer ${key}`);
      duplicates.add(key);
    }
  });
});
