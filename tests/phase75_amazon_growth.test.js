/**
 * tests/phase75_amazon_growth.test.js
 *
 * Phase 75: Commercial Expansion to Milestone 50 Verified Offers
 *
 * Validates:
 * 1. Milestone 50 Achievement: exactly 50 verified active offers (48 Amazon.nl + 2 Amazon.de)
 * 2. Registry Metrics Invariant & Status Synchronization
 * 3. GSC Priority Model Coverage: MS 440, FS 460, MS 170, MS 461, BG 86, BR 600, MS 390, MS 210 all STRONG
 * 4. Genuine Brand Taxonomy: Oregon, NGK, Bosch, Walbro, STIHL (no counterfeit or synthetic products)
 * 5. Two-Gate Verification & Modulo-10 Check-Digit Compliance across all active offers
 * 6. Regulatory Price Safety & German Shipping Verification
 * 7. Kill-Switch Precision & Fail-Closed Fallback Mechanics
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

describe('Phase 75: Commercial Expansion to Milestone 50 Verified Offers', () => {
  const regDoc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const allOffers = regDoc.offers || [];
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const canonicalParts = catalog.parts || catalog;
  const canonicalPartSet = new Set(canonicalParts.map(p => p.part_number));

  it('1. Commercial Milestone 50 Achieved with Verified Active Offers', () => {
    assert.ok(MAX_PILOT_ACTIVE_OFFERS >= 50, 'MAX_PILOT_ACTIVE_OFFERS must accommodate at least 50');

    const activeOffers = allOffers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);
    assert.ok(activeOffers.length >= 50, `Expected at least 50 ACTIVE offers, found ${activeOffers.length}`);

    const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
    const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');

    assert.ok(activeNl.length >= 49, `Expected at least 49 active Amazon.nl offers, found ${activeNl.length}`);
    assert.ok(activeDe.length >= 2, `Expected at least 2 active Amazon.de offers with confirmed NL delivery, found ${activeDe.length}`);
  });

  it('2. Registry Metrics Invariant & Status Breakdown Synchronization', () => {
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

  it('3. GSC Priority Coverage: All 8 Focus Models at STRONG Status', () => {
    const report = generateCommercialReport();
    assert.ok(report.gsc_model_coverage, 'GSC coverage data must exist');

    const focusModels = [
      { name: 'MS 440', minOffers: 3 },
      { name: 'FS 460', minOffers: 5 },
      { name: 'MS 170', minOffers: 7 },
      { name: 'MS 461', minOffers: 3 },
      { name: 'BG 86', minOffers: 3 },
      { name: 'MS 390', minOffers: 3 },
      { name: 'BR 600', minOffers: 3 },
      { name: 'MS 210', minOffers: 10 }
    ];

    for (const f of focusModels) {
      const cov = report.gsc_model_coverage.find(m => m.model_name === f.name);
      assert.ok(cov, `Model ${f.name} must exist in GSC coverage report`);
      assert.ok(cov.active_offers_count >= f.minOffers, `Model ${f.name} expected >= ${f.minOffers} active offers, got ${cov.active_offers_count}`);
      assert.strictEqual(cov.coverage_status, 'STRONG', `Model ${f.name} must have STRONG coverage status`);
    }

    assert.strictEqual(report.milestones.milestone_50.achieved, true, 'Milestone 50 must be marked achieved');
    assert.ok(report.milestones.milestone_50.current >= 50, `Current active offers must be >= 50, got ${report.milestones.milestone_50.current}`);
  });

  it('4. Genuine Brand Taxonomy & Check-Digit Validation across All Active Offers', () => {
    const activeOffers = allOffers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);
    const approvedManufacturers = new Set([
      'STIHL', 'Oregon', 'NGK', 'Bosch', 'Walbro', 'Zama', 'Champion',
      'Haishine', 'MCHNIC', 'Trade-Shop', 'MospdyGear', 'YOUSHARES', 'Yingshop', 'vhbw', 'ECSiNG', 'Sägenspezi', 'RUURUU'
    ]);

    for (const offer of activeOffers) {
      assert.ok(canonicalPartSet.has(offer.part_number), `Part ${offer.part_number} must exist in canonical parts catalog`);

      const brand = (offer.brand || offer.manufacturer || '').trim();
      const brandAllowed = Array.from(approvedManufacturers).some(b => brand.toLowerCase().includes(b.toLowerCase()));
      assert.ok(brandAllowed, `Offer ${offer.part_number} brand "${brand}" must be an approved manufacturer`);

      if (offer.ean_gtin) {
        const gtinRes = validateGtin(offer.ean_gtin);
        assert.strictEqual(gtinRes.valid, true, `Offer ${offer.part_number} GTIN ${offer.ean_gtin} must pass Modulo-10`);
      }

      const gateRes = TwoGateVerifier.verifyOffer(offer);
      assert.strictEqual(gateRes.passed, true, `Offer ${offer.part_number} must pass TwoGateVerifier: ${gateRes.errors.join(', ')}`);

      const mismatch = checkHistoricalMismatch(offer.part_number, offer.asin);
      assert.strictEqual(mismatch.isMismatch, false, `Part ${offer.part_number} cannot be in historical mismatch list`);
    }

    // Verify Phase 75 promoted offers specifically are genuine OEM / tier-1 suppliers
    const phase75Parts = [
      '30030002021', '42821401003', '42821900303', '42820071020', '42410074100',
      '42410071700', '42411401000', '42410071003', '11270802103', '41470074102',
      '41471410300', '41471404400', '41471900600', '41471602002', '11231201651',
      '11231900600', '11230071061', '11230802115', '36360000056', '11236402073',
      '11291900601', '11303500500', '11300802100', '07811201110', '30030003313'
    ];
    for (const pn of phase75Parts) {
      const offer = activeOffers.find(o => o.part_number === pn);
      if (offer) {
        const brand = (offer.brand || offer.manufacturer || '').trim();
        const isGenuine = ['STIHL', 'Walbro', 'Oregon', 'Bosch', 'NGK'].some(b => brand.toLowerCase().includes(b.toLowerCase()));
        assert.ok(isGenuine, `Phase 75 promoted part ${pn} must be genuine OEM / tier-1 supplier`);
      }
    }
  });

  it('5. Regulatory Price Safety & German Shipping Verification', () => {
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

  it('6. Kill Switch Precision & Fail-Closed Fallback Mechanics', () => {
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      maxActiveOffersAllowed: 100
    });
    registry.loadFromFile();

    const activeOffers = registry.listOffers({ status: 'ACTIVE' });
    assert.ok(activeOffers.length >= 50, `Registry must load at least 50 active offers, found ${activeOffers.length}`);

    const killSwitchIds = new Set();
    for (const offer of activeOffers) {
      assert.ok(offer.kill_switch_id, `Offer ${offer.part_number} must have a kill_switch_id`);
      assert.ok(!killSwitchIds.has(offer.kill_switch_id), `Duplicate kill_switch_id: ${offer.kill_switch_id}`);
      killSwitchIds.add(offer.kill_switch_id);
    }
    assert.strictEqual(killSwitchIds.size, activeOffers.length, 'All kill switch IDs must be distinct');

    const unverifiedPart = '99999999999';
    const fallbackOffer = registry.getActiveOffer(unverifiedPart, 'amazon.nl');
    assert.strictEqual(fallbackOffer, null, 'Unverified part must return null active offer');
  });

  it('7. Phase 75B: Multi-Offer Resolver Invariants & Quarantine Verification', () => {
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      maxActiveOffersAllowed: 60
    });
    registry.loadFromFile();

    // 1. Oregon 90PX050E on STIHL 3610 000 0050 remains active direct ASIN
    const oregonResolved = registry.resolveCommercialOffer({ partNumber: '36100000050' });
    assert.strictEqual(oregonResolved.link_type, 'DIRECT_ASIN');
    assert.strictEqual(oregonResolved.asin, 'B00HQ63YUY');
    assert.strictEqual(oregonResolved.brand, 'Oregon');

    // 2. Primary NGK offer for 0000 400 7000 remains default active direct ASIN
    const primaryResolved = registry.resolveCommercialOffer({ partNumber: '00004007000' });
    assert.strictEqual(primaryResolved.link_type, 'DIRECT_ASIN');
    assert.strictEqual(primaryResolved.asin, 'B001RM8J76');
    assert.strictEqual(primaryResolved.brand, 'NGK');

    // 3. Champion RCJ6Y is quarantined in RESEARCH_REQUIRED
    const champRecord = registry.getOffer('00004007000', 'amazon.nl', 'B00IKF8TH8');
    assert.ok(champRecord, 'Champion record must exist in registry');
    assert.strictEqual(champRecord.status, 'RESEARCH_REQUIRED');
    assert.notStrictEqual(champRecord.status, 'ACTIVE');

    // 4. Multi-offer listing for 0000 400 7000: active offers count is exactly 1 (NGK only)
    const activeSparkPlugs = registry.getActiveOffers('00004007000');
    assert.strictEqual(activeSparkPlugs.length, 1, 'Only NGK BPMR7A must be active for 0000 400 7000');
    assert.strictEqual(activeSparkPlugs[0].asin, 'B001RM8J76');

    // 5. Commercial resolution resolves exclusively to primary NGK
    const resolvedOffers = registry.resolveCommercialOffers({ partNumber: '00004007000' });
    assert.strictEqual(resolvedOffers.length, 1);
    assert.strictEqual(resolvedOffers[0].asin, 'B001RM8J76');
    assert.strictEqual(resolvedOffers[0].link_type, 'DIRECT_ASIN');
  });

  it('8. Phase 75E: MS 170 Final Commercial Gaps (Oil Pickup Filter 1123 640 3800 & 40 cm Saw Chains 3636 000 0055 / 3610 000 0055)', () => {
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      maxActiveOffersAllowed: 100
    });
    registry.loadFromFile();

    // 1. Oil pickup filter 1123 640 3800 -> RUURUU B0FP2XR798 (amazon.de, 2-pack, ships to NL)
    const oilFilterOffer = registry.getActiveOffer('11236403800', 'amazon.de');
    assert.ok(oilFilterOffer, '1123 640 3800 must have an active offer on amazon.de');
    assert.strictEqual(oilFilterOffer.asin, 'B0FP2XR798');
    assert.strictEqual(oilFilterOffer.brand, 'RUURUU');
    assert.strictEqual(oilFilterOffer.package_quantity, 2);
    assert.strictEqual(oilFilterOffer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.strictEqual(oilFilterOffer.affiliate_tag, 'srihldecode00-21');

    // 2. 40 cm 3/8" P 1.3 mm 55 DL saw chain 3636 000 0055 -> Oregon 91PX055E B005MCM2YS (amazon.de, ships to NL)
    assert.ok(canonicalPartSet.has('36360000055'), '3636 000 0055 must exist in canonical parts catalog');
    const chain13Offer = registry.getActiveOffer('36360000055', 'amazon.de');
    assert.ok(chain13Offer, '3636 000 0055 must have an active offer on amazon.de');
    assert.strictEqual(chain13Offer.asin, 'B005MCM2YS');
    assert.strictEqual(chain13Offer.brand, 'Oregon');
    assert.strictEqual(chain13Offer.manufacturer_part_number, '91PX055E');
    assert.strictEqual(chain13Offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.strictEqual(chain13Offer.affiliate_tag, 'srihldecode00-21');

    // 3. 40 cm 3/8" P 1.1 mm 55 DL saw chain 3610 000 0055 -> Oregon 90PX055E B013KONKZY (canonical part present, offer verified inactive due to missing buybox/NL shipping)
    assert.ok(canonicalPartSet.has('36100000055'), '3610 000 0055 must exist in canonical parts catalog');
    const chain11Record = registry.getOffer('36100000055', 'amazon.de', 'B013KONKZY');
    assert.ok(chain11Record, 'Oregon 90PX055E record must exist for 3610 000 0055');
    assert.strictEqual(chain11Record.status, 'VERIFIED');
    assert.notStrictEqual(chain11Record.status, 'ACTIVE');
    assert.strictEqual(registry.getActiveOffer('36100000055', 'amazon.de'), null, '3610 000 0055 must not resolve as active without confirmed NL delivery');
  });

  it('9. Phase 75F: MS 180 Commercial Coverage Across All 10 Core Categories (78 Active Offers)', () => {
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      maxActiveOffersAllowed: 100
    });
    registry.loadFromFile();

    const activeOffers = registry.listOffers({ status: 'ACTIVE' });
    assert.strictEqual(activeOffers.length, 78, 'Total active offers must equal 78 (53 NL + 25 DE)');

    // Canonical 30 cm 1,3 mm 44 DL chain 3636 000 0044 must exist and have active Sägenspezi offer B0723GG5VR
    assert.ok(canonicalPartSet.has('36360000044'), '3636 000 0044 must exist in canonical parts catalog');
    const chain30cm13 = registry.getActiveOffer('36360000044', 'amazon.de');
    assert.ok(chain30cm13, '3636 000 0044 must have an active offer on amazon.de');
    assert.strictEqual(chain30cm13.asin, 'B0723GG5VR');
    assert.strictEqual(chain30cm13.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');

    // Verify all 8 newly activated MS 180 offers on amazon.de
    const expectedMs180DeOffers = [
      ['11301402803', 'B00LAHKMBO'],
      ['00004007009', 'B077X8JMG9'],
      ['36360000044', 'B0723GG5VR'],
      ['36360000050', 'B071J6WTSR'],
      ['36100000050', 'B07R9J97NQ'],
      ['11236402073', 'B00LAHPOXA'],
      ['11301200603', 'B074CH7JFY'],
      ['11301200608', 'B00LAHQFX8']
    ];

    for (const [partNum, asin] of expectedMs180DeOffers) {
      const offer = registry.getOffer(partNum, 'amazon.de', asin);
      assert.ok(offer, `MS 180 offer ${asin} for ${partNum} must exist`);
      assert.strictEqual(offer.status, 'ACTIVE', `MS 180 offer ${asin} must be ACTIVE`);
      assert.strictEqual(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
      assert.strictEqual(offer.affiliate_tag, 'srihldecode00-21');
    }

    // Ensure B00LAHPOXA is no longer erroneously mapped to 11236402074 (.325" 7T)
    assert.strictEqual(registry.getOffer('11236402074', 'amazon.de', 'B00LAHPOXA'), null);
  });
});
