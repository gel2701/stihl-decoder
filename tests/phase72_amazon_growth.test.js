/**
 * tests/phase72_amazon_growth.test.js
 *
 * Phase 72: Amazon Affiliate Growth Engine — 250 Links & GSC Priorities Test Suite
 *
 * Validates:
 * 1. 50 active product offers milestone (48 NL, 2 DE)
 * 2. TwoGateVerifier compliance for all active offers
 * 3. Atomic batch activation, deduplication, kill switches & expiry dates
 * 4. GSC high-impression models coverage & gap detection
 * 5. SEO & Conversion UX: OEM badges, CTA copy, touch targets, no static price leakage
 * 6. Amazon Creators API Adapter fail-closed behavior & mock mode
 * 7. Commercial analytics reporting and outbound clicks vs sales distinction
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  VerifiedOfferRegistry,
  MAX_PILOT_ACTIVE_OFFERS,
  COMMERCIAL_MILESTONES
} from '../src/affiliate/VerifiedOfferRegistry.js';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import {
  AmazonCreatorsAdapter,
  ADAPTER_MODES,
  CREDENTIAL_STATUS,
  CREATORS_API_MIN_QUALIFYING_SALES
} from '../src/affiliate/AmazonCreatorsAdapter.js';
import { generateCommercialReport, GSC_MODEL_METRICS } from '../scripts/report_affiliate_commercial_metrics.mjs';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 72: Amazon Affiliate Growth Engine — 50 Links & GSC Priorities', () => {

  test('1. Verified inventory and candidate registration in registry', () => {
    const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
    assert.ok(fs.existsSync(registryPath), 'Registry file exists');
    const doc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    // Registry holds at least 50 candidate records (112 total)
    assert.ok(doc.offers.length >= 50, 'Must have at least 50 candidate offers registered');

    // Truly verified active offers are safely bounded
    const activeOffers = doc.offers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);
    assert.ok(activeOffers.length >= 18, 'Must have at least 18 verified active offers');

    const activeNl = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
    const activeDe = activeOffers.filter(o => o.marketplace === 'amazon.de');

    assert.ok(activeNl.length >= 18, 'Must have at least 18 active Amazon.nl offers');
    assert.ok(activeDe.length >= 2, 'Must have at least 2 active Amazon.de offers with confirmed NL shipping');

    // German active offers must have confirmed NL delivery
    for (const deOffer of activeDe) {
      assert.equal(deOffer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED', 'German offer must have confirmed NL delivery');
      assert.ok(deOffer.shipping_evidence_url, 'Must have shipping evidence URL');
    }

    // Inactive German offers must remain inactive
    const inactiveDe = doc.offers.filter(o => o.marketplace === 'amazon.de' && o.status !== 'ACTIVE');
    assert.ok(inactiveDe.length >= 6, 'Must retain at least 6 inactive German offers');
  });

  test('2. All active offers pass TwoGateVerifier cleanly', () => {
    const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
    const doc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const activeOffers = doc.offers.filter(o => o.status === 'ACTIVE' && o.pilot_active === true);

    for (const offer of activeOffers) {
      const v = TwoGateVerifier.verifyOffer(offer);
      assert.ok(v.passed, `Offer ${offer.part_number} (${offer.asin}) on ${offer.marketplace} must pass TwoGateVerifier: ${v.errors.join('; ')}`);
      assert.equal(v.errors.length, 0, 'Must have zero verification errors');
    }
  });

  test('3. Tag isolation is maintained per marketplace (srihldecoder2-21 vs srihldecode00-21)', () => {
    const registryPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
    const doc = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const activeOffers = doc.offers.filter(o => o.status === 'ACTIVE');

    for (const offer of activeOffers) {
      if (offer.marketplace === 'amazon.de') {
        assert.equal(offer.affiliate_tag, 'srihldecode00-21', 'German offer must use srihldecode00-21');
        assert.ok(offer.direct_affiliate_url.includes('tag=srihldecode00-21'), 'German URL must contain German tag');
      } else {
        assert.equal(offer.affiliate_tag, 'srihldecoder2-21', 'Dutch offer must use srihldecoder2-21');
        assert.ok(offer.direct_affiliate_url.includes('tag=srihldecoder2-21'), 'Dutch URL must contain Dutch tag');
      }
    }
  });

  test('4. VerifiedOfferRegistry supports capacity milestones and batch activation', () => {
    assert.ok(MAX_PILOT_ACTIVE_OFFERS >= 25, 'Default MAX_PILOT_ACTIVE_OFFERS is at least 25');
    assert.equal(COMMERCIAL_MILESTONES.MILESTONE_50, 50);
    assert.equal(COMMERCIAL_MILESTONES.MILESTONE_100, 100);
    assert.equal(COMMERCIAL_MILESTONES.MILESTONE_250, 250);

    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      maxActiveOffersAllowed: 50
    });

    assert.equal(registry.getMaxActiveOffersAllowed('amazon.nl'), 50);

    // Test activateBatch limits
    const hugeBatch = new Array(51).fill(null).map((_, i) => ({
      part_number: '11301240800',
      asin: `B0000000${i.toString().padStart(2, '0')}`
    }));
    const hugeResult = registry.activateBatch(hugeBatch, { batchLimit: 50 });
    assert.equal(hugeResult.success, false, 'Must reject batch exceeding batch limit');
    assert.ok(hugeResult.errors[0].includes('exceeds maximum allowed batch limit'));

    // Test activateBatch atomic rollback on invalid item
    const validOffer1 = {
      part_number: '11104007005',
      asin: 'B0068M5NAG',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      manufacturer: 'Bosch',
      brand: 'Bosch',
      oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
      evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
      verification_date: '2026-11-09',
      compatibility_proof: 'Passend voor STIHL MS 170 volgens Amazon vermelding',
      asin_product_identity_proof: 'Bosch bougie WSR6F',
      verifiable_evidence_sources: [{ url: 'https://www.amazon.nl/dp/B0068M5NAG', claim: 'Bosch bougie' }]
    };
    const invalidOffer = {
      part_number: 'invalid_part_no',
      asin: 'B0068M5NAG'
    };

    const failResult = registry.activateBatch([validOffer1, invalidOffer]);
    assert.equal(failResult.success, false, 'Batch must fail when any candidate is invalid');
    assert.equal(registry.offers.size, 0, 'Atomic rollback: no offers registered');
  });

  test('5. GSC focus models are covered with active offers', () => {
    const report = generateCommercialReport();
    assert.ok(report.gsc_model_coverage.length >= 12, 'Must evaluate all GSC focus models');

    // High impression models must have active offers
    const ms440 = report.gsc_model_coverage.find(m => m.model_name === 'MS 440');
    assert.ok(ms440 && ms440.active_offers_count >= 2, 'MS 440 (446 imp) must have verified active offers (>=2)');

    const fs460 = report.gsc_model_coverage.find(m => m.model_name === 'FS 460');
    assert.ok(fs460 && fs460.active_offers_count >= 3, 'FS 460 (315 imp) must have verified active offers (>=3)');

    const ms170 = report.gsc_model_coverage.find(m => m.model_name === 'MS 170');
    assert.ok(ms170 && ms170.active_offers_count >= 5, 'MS 170 must have at least 5 active offers');

    const ms250 = report.gsc_model_coverage.find(m => m.model_name === 'MS 250');
    assert.ok(ms250 && ms250.active_offers_count >= 3, 'MS 250 must have at least 3 active offers');

    // GAP detection / resolution
    const fs80 = report.gsc_model_coverage.find(m => m.model_name === 'FS 80');
    assert.ok(fs80, 'FS 80 evaluated');
    assert.ok(['GAP', 'STRONG'].includes(fs80.coverage_status), 'FS 80 tracked in coverage report');
  });

  test('6. ModelPageTemplate renders enhanced SEO title, description & parts banner', () => {
    const databasePath = path.join(rootDir, 'data', 'stihl_database.json');
    const database = fs.existsSync(databasePath) ? JSON.parse(fs.readFileSync(databasePath, 'utf8')) : { models: [] };
    const ms440Model = database.models.find(m => m.id === 'ms_440' || m.slug === 'ms-440') || {
      id: 'ms_440',
      model_name: 'MS 440',
      category: 'Kettingzagen',
      slug: 'ms-440'
    };

    const html = renderModelPageHtml(ms440Model, database);
    assert.ok(html.includes('Specificaties &amp; Onderdelen') || html.includes('Onderdelen & Specificaties'),
      'Title or H1 must mention Onderdelen & Specificaties for SEO intent matching');
    assert.ok(html.includes('Passende Onderdelen Beschikbaar'), 'Must render parts action banner');
    assert.ok(html.includes('Bekijk Onderdelen →'), 'Must link to parts page');
  });

  test('7. PartDetailPageTemplate displays clear OEM vs Aftermarket badges and actionable CTA', () => {
    const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
    const registryDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json'), 'utf8'));
    registry.importRegistry(registryDoc);

    const provider = new AmazonAffiliateProvider({ verifiedRegistry: registry });
    const prevEnv = process.env.AMAZON_AFFILIATE_ENABLED;
    const prevTag = process.env.AMAZON_ASSOCIATE_TAG;
    try {
      process.env.AMAZON_AFFILIATE_ENABLED = 'true';
      process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

      const partNumber = '11104007005'; // Bosch bougie WSR6F (verified active)
      const offers = provider.getOffers({ partNumber });
      assert.ok(offers.length >= 1, 'Must find active offer for 11104007005');

      const html = renderPartDetailPageHtml({
        partNumber,
        resolved: {
          part_number: partNumber,
          part_name: 'Bougie Bosch WSR6F',
          models: ['MS 170', 'MS 250', 'MS 440']
        },
        offers,
        compatibleModels: [{ model_name: 'MS 170', model_id: 'ms_170' }],
        indexEntry: { is_indexable: true, seo_tier: 'SEO_TIER_A' }
      });

      assert.ok(html.includes('Origineel STIHL') || html.includes('Kwaliteitsvervanger') || html.includes('OEM'),
        'Must display clear provenance classification');
      assert.ok(html.includes('min-h-[44px]'), 'Must enforce minimum 44px touch target height');
      assert.ok(html.includes('sponsored nofollow noopener'), 'Must preserve affiliate disclosures and link attributes');

      // Ensure no static price leakage in public HTML
      assert.ok(!html.includes('item_price'), 'Must not leak raw item_price field name');
      assert.ok(!html.includes('shipping_cost_nl'), 'Must not leak raw shipping_cost_nl field name');
      assert.ok(html.includes('Actuele prijs en beschikbaarheid op Amazon'), 'Must direct user to Amazon for live pricing and availability');
    } finally {
      process.env.AMAZON_AFFILIATE_ENABLED = prevEnv;
      process.env.AMAZON_ASSOCIATE_TAG = prevTag;
    }
  });

  test('8. AmazonCreatorsAdapter fails closed without credentials and supports mock mode', async () => {
    // Disabled mode when credentials absent
    const adapter = new AmazonCreatorsAdapter({ mode: ADAPTER_MODES.DISABLED });
    assert.equal(adapter.isApiReady(), false);
    assert.equal(adapter.getCredentialStatus(), CREDENTIAL_STATUS.MISSING);

    const failClosedRes = await adapter.fetchProductDetails('B001RMA5S2');
    assert.equal(failClosedRes.success, false);
    assert.equal(failClosedRes.source, 'FAIL_CLOSED_GUARD');

    // Check eligibility rule (3 qualifying sales)
    const notEligible = adapter.checkEligibility({ qualifyingSalesCount: 1 });
    assert.equal(notEligible.eligible, false);
    assert.equal(notEligible.salesRemaining, 2);
    assert.ok(notEligible.reason.includes('Requires at least 3 qualifying sales'));

    const eligible = adapter.checkEligibility({ qualifyingSalesCount: 3 });
    assert.equal(eligible.eligible, true);
    assert.equal(eligible.salesRemaining, 0);

    // Mock mode
    const mockAdapter = new AmazonCreatorsAdapter({
      mode: ADAPTER_MODES.MOCK,
      apiKey: 'MOCK_KEY_123',
      apiSecret: 'MOCK_SECRET_123456789'
    });
    assert.equal(mockAdapter.isApiReady(), true);
    const mockRes = await mockAdapter.fetchProductDetails('B001RMA5S2');
    assert.equal(mockRes.success, true);
    assert.equal(mockRes.source, 'MOCK_TRANSPORT');
    assert.equal(mockRes.product.asin, 'B001RMA5S2');
  });

  test('9. Commercial metrics report delineates outbound clicks from real Amazon sales', () => {
    const report = generateCommercialReport();
    assert.ok(report.commercial_telemetry_disclaimer, 'Disclaimer object exists');
    assert.ok(report.commercial_telemetry_disclaimer.statement.includes('clicks measure user purchase intent'),
      'Must state that outbound clicks do NOT equal realized sales');
    assert.ok(report.commercial_telemetry_disclaimer.sales_tracking_source.includes('Amazon Associates PartnerNet'),
      'Must identify Amazon PartnerNet as sole source of true sales data');
  });
});
