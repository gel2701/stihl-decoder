/**
 * tests/phase74_amazon_growth.test.js
 *
 * Phase 74: Verified Amazon Product Growth — Milestone 25+ Test Suite
 *
 * Validates:
 * 1. Milestone 25 Growth: 26 active verified product offers (24 Amazon.nl + 2 Amazon.de)
 * 2. Strict Verification of 6 New Maintenance Products (ASINs, GS1 GTINs, TwoGateVerifier compliance)
 * 3. GSC Priority Coverage: MS 440, MS 170, MS 210, HS 45, and FS 80 gap resolution
 * 4. Regulatory Price Safety: item_price and shipping_cost_nl are null for Dutch offers
 * 5. Preservation of Unproven Candidates in RESEARCH_REQUIRED
 * 6. Kill-Switch Precision and Fail-Closed Search Fallback
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { validateGtin } from '../src/affiliate/GtinValidator.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import {
  VerifiedOfferRegistry,
  MAX_PILOT_ACTIVE_OFFERS
} from '../src/affiliate/VerifiedOfferRegistry.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { generateCommercialReport } from '../scripts/report_affiliate_commercial_metrics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');

describe('Phase 74: Verified Amazon Product Growth — Milestone 25+', () => {
  const regDoc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const allOffers = regDoc.offers || [];
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const canonicalParts = catalog.parts || catalog;
  const canonicalPartSet = new Set(canonicalParts.map(p => p.part_number));

  it('1. Commercial Milestone 25 Achieved with 26 Verified Active Offers', () => {
    assert.ok(MAX_PILOT_ACTIVE_OFFERS >= 25, 'MAX_PILOT_ACTIVE_OFFERS must be at least 25');

    const activeOffers = allOffers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);
    assert.ok(activeOffers.length >= 25, `Expected at least 25 ACTIVE offers, found ${activeOffers.length}`);
    assert.ok(activeOffers.length >= 26, 'Expected at least 26 ACTIVE offers in Phase 74');

    const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
    const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');

    assert.ok(activeNl.length >= 24, 'Expected at least 24 active Amazon.nl offers');
    assert.ok(activeDe.length >= 2, 'Expected at least 2 active Amazon.de offers with confirmed NL delivery');
  });

  it('1B. Registry Metrics Invariant & Status Breakdown Synchronization', () => {
    assert.ok(regDoc.metrics, 'Registry must contain metrics block');
    const activeOffers = allOffers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);
    const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
    const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');
    const unprovenOffers = allOffers.filter(o => o.status === 'RESEARCH_REQUIRED');
    const verifiedInactive = allOffers.filter(o => o.status === 'VERIFIED' && !o.pilot_active);

    assert.strictEqual(regDoc.metrics.total_registered, allOffers.length, 'metrics.total_registered must match allOffers.length');
    assert.strictEqual(regDoc.metrics.active, activeOffers.length, 'metrics.active must equal actual active offers');
    assert.strictEqual(regDoc.metrics.active_nl, activeNl.length, 'metrics.active_nl must equal actual active NL offers');
    assert.strictEqual(regDoc.metrics.active_de, activeDe.length, 'metrics.active_de must equal actual active DE offers');
    assert.strictEqual(regDoc.metrics.research_required, unprovenOffers.length, 'metrics.research_required must equal unproven offers count');
    assert.strictEqual(regDoc.metrics.verified, verifiedInactive.length, 'metrics.verified must equal verified inactive offers count');
    assert.strictEqual(regDoc.metrics.staged, 0, 'metrics.staged must be 0');
    assert.strictEqual(regDoc.metrics.suspended, 0, 'metrics.suspended must be 0');
  });

  it('2. Strict Verification of 6 New Genuine Maintenance Products', () => {
    const verifiedNewCandidates = [
      {
        part: '00006421231',
        asin: 'B000IBWVWG',
        gtin: '0036577187202',
        brand: 'Oregon',
        mpn: '18720',
        titlePart: 'Oregon 18720'
      },
      {
        part: '07811201109',
        asin: 'B007TK174M',
        gtin: '0795711017804',
        brand: 'STIHL',
        mpn: '0781 120 1109',
        titlePart: 'MultiLub'
      },
      {
        part: '30050004809',
        asin: 'B001FUALX0',
        gtin: '5400182014232',
        brand: 'Oregon',
        mpn: '140SDEA074',
        titlePart: '140SDEA074'
      },
      {
        part: '30050004813',
        asin: 'B002VAAQC4',
        gtin: '5400182040774',
        brand: 'Oregon',
        mpn: '160SDEA074',
        titlePart: '160SDEA074'
      },
      {
        part: '56057504303',
        asin: 'B00CIRQW0K',
        gtin: '0795711424237',
        brand: 'STIHL',
        mpn: '5605 750 4303',
        titlePart: 'Feilenhalter'
      },
      {
        part: '00006421223',
        asin: 'B00455Q028',
        gtin: '5400182633471',
        brand: 'Oregon',
        mpn: '68210',
        titlePart: '68210'
      }
    ];

    for (const item of verifiedNewCandidates) {
      const offer = allOffers.find(o => o.asin === item.asin && o.part_number === item.part);
      assert.ok(offer, `Verified offer for part ${item.part} (${item.asin}) must exist in registry`);
      assert.strictEqual(offer.status, 'ACTIVE');
      assert.strictEqual(offer.pilot_active, true);
      assert.strictEqual(offer.brand, item.brand);
      assert.strictEqual(offer.manufacturer_part_number, item.mpn);
      assert.ok(offer.product_title.includes(item.titlePart), `Title must include ${item.titlePart}`);
      assert.strictEqual(offer.ean_gtin, item.gtin);

      // Verify canonical catalog grounding
      assert.ok(canonicalPartSet.has(item.part), `Part ${item.part} must exist in canonical catalog`);

      // TwoGateVerifier compliance
      const v = TwoGateVerifier.verifyOffer(offer, { catalogPartMap: canonicalPartSet });
      assert.ok(v.passed, `Offer ${item.part} failed TwoGateVerifier: ${v.errors.join('; ')}`);

      // GS1 GTIN Modulo-10 check
      const gtinRes = validateGtin(offer.ean_gtin);
      assert.ok(gtinRes.valid, `GTIN ${offer.ean_gtin} failed check-digit validation`);

      // Historical mismatch check
      const mismatch = checkHistoricalMismatch(item.part, item.asin);
      assert.strictEqual(mismatch.isMismatch, false, `Part ${item.part} cannot be in historical mismatch list`);
    }

    // Explicit technical validation of Oregon Sprocket separation
    const smallSpline = allOffers.find(o => o.part_number === '00006421231');
    const standardSpline = allOffers.find(o => o.part_number === '00006421223');

    assert.ok(smallSpline.product_title.includes('Small Spline') || smallSpline.product_title.includes('SM7'));
    assert.ok(smallSpline.compatibility_proof.includes('19.05 mm') || smallSpline.compatibility_proof.includes('Small 7-Spline'));
    assert.ok(smallSpline.model_compatibility.includes('MS 261'));
    assert.ok(!smallSpline.model_compatibility.includes('MS 440'), 'Small spline must not list MS 440');
    assert.ok(!smallSpline.model_compatibility.includes('MS 460'), 'Small spline must not list MS 460');

    assert.ok(standardSpline.product_title.includes('Standard Spline') || standardSpline.product_title.includes('SD7'));
    assert.ok(standardSpline.compatibility_proof.includes('22.2 mm') || standardSpline.compatibility_proof.includes('Standard 7-Spline'));
    assert.ok(standardSpline.model_compatibility.includes('MS 440'));
    assert.ok(standardSpline.model_compatibility.includes('MS 460'));
    assert.ok(!standardSpline.model_compatibility.includes('MS 261'), 'Standard spline must not list MS 261');
    assert.ok(!standardSpline.model_compatibility.includes('MS 260'), 'Standard spline must not list MS 260');
  });

  it('3. GSC Priority Coverage: MS 440, MS 170, MS 210, HS 45 and FS 80 Gap Resolution', () => {
    const report = generateCommercialReport();
    assert.ok(report.gsc_model_coverage, 'GSC coverage data must exist');

    const ms440 = report.gsc_model_coverage.find(m => m.model_name === 'MS 440');
    assert.ok(ms440 && ms440.active_offers_count >= 3, 'MS 440 must have at least 3 active offers');
    assert.strictEqual(ms440.coverage_status, 'STRONG');

    const ms170 = report.gsc_model_coverage.find(m => m.model_name === 'MS 170');
    assert.ok(ms170 && ms170.active_offers_count >= 7, 'MS 170 must have at least 7 active offers');
    assert.strictEqual(ms170.coverage_status, 'STRONG');

    const ms210 = report.gsc_model_coverage.find(m => m.model_name === 'MS 210');
    assert.ok(ms210 && ms210.active_offers_count >= 10, 'MS 210 must have at least 10 active offers');
    assert.strictEqual(ms210.coverage_status, 'STRONG');

    const fs80 = report.gsc_model_coverage.find(m => m.model_name === 'FS 80');
    assert.ok(fs80 && fs80.active_offers_count >= 3, 'FS 80 must have at least 3 active offers');
    assert.strictEqual(fs80.coverage_status, 'STRONG');

    const hs45 = report.gsc_model_coverage.find(m => m.model_name === 'HS 45');
    assert.ok(hs45 && hs45.active_offers_count >= 5, 'HS 45 must have at least 5 active offers');
    assert.strictEqual(hs45.coverage_status, 'STRONG');
  });

  it('4. Regulatory Price Safety & German Shipping Evidence', () => {
    const activeOffers = allOffers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);

    for (const offer of activeOffers) {
      if (offer.marketplace === 'amazon.nl') {
        assert.ok(offer.item_price == null, `Dutch offer ${offer.part_number} must not store static item_price`);
        assert.ok(offer.shipping_cost_nl == null, `Dutch offer ${offer.part_number} must not store static shipping_cost_nl`);
      }

      if (offer.marketplace === 'amazon.de') {
        assert.strictEqual(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
        assert.ok(offer.shipping_evidence_url, 'German offer must have shipping evidence URL');
      }
    }
  });

  it('5. Inactive Candidate Preservation in RESEARCH_REQUIRED', () => {
    const unprovenOffers = allOffers.filter(o => o.status === 'RESEARCH_REQUIRED');
    assert.ok(unprovenOffers.length >= 50, 'Unproven candidate offers must be preserved in RESEARCH_REQUIRED');

    for (const unproven of unprovenOffers) {
      assert.strictEqual(unproven.pilot_active, false, 'Unproven offers must not have pilot_active === true');
    }

    const inactiveDe = allOffers.filter(o => o.marketplace === 'amazon.de' && o.status === 'VERIFIED');
    assert.ok(inactiveDe.length >= 3, 'Must retain inactive German offers pending verified NL delivery');
  });

  it('6. Kill Switch Precision & Fail-Closed Fallback Mechanics', () => {
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      maxActiveOffersAllowed: 60
    });
    registry.loadFromFile();

    const activeOffers = registry.listOffers({ status: 'ACTIVE' });
    assert.ok(activeOffers.length >= 26, 'Registry must load at least 26 active offers');

    const killSwitchIds = new Set();
    for (const offer of activeOffers) {
      assert.ok(offer.kill_switch_id, `Offer ${offer.part_number} must have a kill_switch_id`);
      assert.ok(!killSwitchIds.has(offer.kill_switch_id), `Duplicate kill_switch_id: ${offer.kill_switch_id}`);
      killSwitchIds.add(offer.kill_switch_id);
    }
    assert.strictEqual(killSwitchIds.size, activeOffers.length, 'All kill switch IDs must be distinct');

    // Test fail-closed fallback for unverified part
    const unverifiedPart = '99999999999';
    const fallbackOffer = registry.getActiveOffer(unverifiedPart, 'amazon.nl');
    assert.strictEqual(fallbackOffer, null, 'Unverified part must return null active offer');
  });
});
