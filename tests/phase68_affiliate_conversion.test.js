/**
 * tests/phase68_affiliate_conversion.test.js
 *
 * Automated regression test suite for Phase 68: Affiliate Conversion & Amazon Approval Readiness.
 * Validates:
 * 1. Product card UI improvements (verified vs search fallback, OEM metadata, no fake prices/ratings).
 * 2. Search fallback clear demarcation (distinct non-verified badge & disclaimer).
 * 3. Model parts table links and telemetry attributes.
 * 4. Telemetry & click tracking (placement, device_type, is_mobile whitelisted & recorded).
 * 5. Amazon compliance (direct links only, 410 on redirect endpoint, sponsored/nofollow, tag integrity).
 * 6. Production safety lock (strictly 3 active pilot ASINs; 0 research candidates activated).
 * 7. Maintenance guide (stihl-bougie-vervangen covers 12 GSC models, source-bound, verified parts).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Set required runtime environment variables
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { getAllStructuredGuides, getStructuredGuide } from '../src/content/guides/index.js';
import { WHITELISTED_METADATA_KEYS } from '../src/components/AnalyticsTracker.js';
import { VerifiedOfferRegistry, defaultVerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { AffiliateOfferResolver, defaultResolverInstance } from '../src/affiliate/AffiliateOfferResolver.js';

describe('Phase 68: Affiliate Conversion & Amazon Approval Readiness', () => {

  before(() => {
    // Ensure resolver and registry are fully loaded with pilot offers
    defaultVerifiedOfferRegistry.productionActivationAllowed = true;
    defaultVerifiedOfferRegistry.loadFromFile();
    defaultResolverInstance.reloadManualOverrides();
  });

  describe('1. Product Cards & Search Fallback UI (Section 4A & 4B)', () => {
    it('renders verified product card with full specifications, OEM badge, and direct Amazon.nl link', () => {
      // 00004007000 is NGK BPMR7A (ASIN B001RM8J76), active verified pilot offer
      const catalogPath = resolve(rootDir, 'data', 'parts_catalog.json');
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
      const resolver = new PartCatalogResolver(catalog);
      const partItem = resolver.resolvePartNumber('00004007000');
      assert.ok(partItem, '00004007000 must resolve');

      const html = renderPartDetailPageHtml(partItem, catalog);

      // Verification badge
      assert.ok(html.includes('Geverifieerd Product (Directe Link)'), 'Must include verified badge');
      assert.ok(html.includes('OEM-Fabrikant / Eerste Montage'), 'Must include OEM supplier label');

      // Product identity
      assert.ok(html.includes('NGK'), 'Must mention manufacturer brand');
      assert.ok(html.includes('BPMR7A'), 'Must mention MPN');
      assert.ok(html.includes('0000 400 7000') || html.includes('00004007000'), 'Must mention STIHL part number');

      // Direct affiliate link structure
      assert.ok(html.includes('https://amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21') || html.includes('https://www.amazon.nl/dp/B001RM8J76?tag=srihldecoder2-21'), 'Must link directly to Amazon.nl with tag');
      assert.ok(html.includes('rel="sponsored nofollow noopener"'), 'Must have correct rel attributes');
      assert.ok(html.includes('target="_blank"'), 'Must open in new tab');

      // Compliance: zero unconfirmed claims
      assert.ok(html.includes('Geen onbevestigde prijs of voorraadclaims'), 'Must state no unconfirmed claims');
      assert.ok(!html.includes('★★★★'), 'Must not render unverified star ratings');
      assert.ok(!html.includes('Op voorraad'), 'Must not make unverified live stock claims without Creators API');

      // Mobile UX
      assert.ok(html.includes('min-h-[44px]'), 'Must support minimum 44px touch target on mobile');
    });

    it('renders search fallback card with distinct non-verified warning and dynamic disclaimer', () => {
      // 11231602050 is not an active verified ASIN (falls back to search query)
      const catalogPath = resolve(rootDir, 'data', 'parts_catalog.json');
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
      const resolver = new PartCatalogResolver(catalog);
      const partItem = resolver.resolvePartNumber('11231602050');
      assert.ok(partItem, '11231602050 must resolve');

      const html = renderPartDetailPageHtml(partItem, catalog);

      // Distinct non-verified demarcation
      assert.ok(html.includes('Amazon-zoekopdracht (Niet vooraf gecontroleerd)'), 'Must clearly demarcate search fallback');
      assert.ok(html.includes('dynamische zoekopdracht'), 'Must state that it is a dynamic search query');
      assert.ok(html.includes('Controleer altijd zelf de pasvorm'), 'Must advise manual fit check');
      assert.ok(html.includes('Zoek op Amazon.nl ↗'), 'Button text must indicate search action');

      // Must NOT claim to be verified
      assert.ok(!html.includes('Geverifieerd Product (Directe Link)'), 'Must not have verified badge for unverified part');
    });

    it('renders model parts table with compliant sponsored attributes and telemetry placement', () => {
      const catalogPath = resolve(rootDir, 'data', 'parts_catalog.json');
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));

      const model = {
        id: 'ms-261',
        model_name: 'MS 261',
        category: 'Kettingzaag',
        category_slug: 'kettingzagen',
        slug: 'ms-261'
      };

      const html = renderModelPartsPageHtml(model, catalog);

      assert.ok(html.includes('rel="sponsored nofollow noopener"'), 'Model parts table links must include rel="sponsored nofollow noopener"');
      assert.ok(html.includes('placement: \'model_parts_table\''), 'Model parts table must transmit placement metadata');
    });
  });

  describe('2. Telemetry & Analytics Tracking (Section 4D)', () => {
    it('whitelists placement, device_type, is_mobile, and click_target in AnalyticsTracker', () => {
      assert.ok(WHITELISTED_METADATA_KEYS.includes('placement'), 'placement must be whitelisted');
      assert.ok(WHITELISTED_METADATA_KEYS.includes('device_type'), 'device_type must be whitelisted');
      assert.ok(WHITELISTED_METADATA_KEYS.includes('is_mobile'), 'is_mobile must be whitelisted');
      assert.ok(WHITELISTED_METADATA_KEYS.includes('click_target'), 'click_target must be whitelisted');
    });

    it('verifies server.js implements /api/affiliate/track with device detection and non-blocking response', () => {
      const serverCode = readFileSync(resolve(rootDir, 'server.js'), 'utf-8');
      assert.ok(serverCode.includes('/api/affiliate/track'), 'server.js must expose /api/affiliate/track');
      assert.ok(serverCode.includes('placement = data.placement'), 'server.js must capture placement');
      assert.ok(serverCode.includes('device_type: deviceType'), 'server.js must capture device_type');
      assert.ok(serverCode.includes('is_mobile: deviceType === \'mobile\''), 'server.js must capture is_mobile');
    });

    it('enforces direct link policy: /api/affiliate/out returns 410 Gone (no redirect masking)', () => {
      const serverCode = readFileSync(resolve(rootDir, 'server.js'), 'utf-8');
      assert.ok(serverCode.includes("pathname === '/api/affiliate/out'"), 'server.js must handle /api/affiliate/out');
      assert.ok(serverCode.includes('res.writeHead(410'), 'server.js must return 410 Gone on redirect route');
    });
  });

  describe('3. Production Safety Lock & Catalog Pilot Integrity (Section 2 & 5)', () => {
    it('strictly limits active verified offers to the 3 pilot ASINs', () => {
      const activeOffers = defaultVerifiedOfferRegistry.listOffers({ status: 'ACTIVE' });
      assert.equal(activeOffers.length, 3, 'Must strictly have 3 active verified offers in production');

      const asins = activeOffers.map(o => o.asin).sort();
      assert.deepEqual(asins, ['B001RM8J76', 'B001RMA5S2', 'B0068M5NAG'].sort(), 'Active ASINs must match exactly the 3 approved pilot items');
    });

    it('ensures Phase 68B/68B.1/68B.2 research files are strictly decoupled from production registry', () => {
      const registryPath = resolve(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
      assert.ok(existsSync(registryPath), 'Registry file must exist');
      const registryData = JSON.parse(readFileSync(registryPath, 'utf-8'));
      assert.equal(registryData.metrics.active_in_production, 3, 'Registry metrics must maintain active_in_production == 3');

      // Verify none of the Phase 68B candidate ASINs were prematurely injected
      const researchAsinBlacklist = ['B00HQ63YUY', 'B00455Q028', 'B07V9P5T8Q', 'B000182C0K', 'B0032V6Y4E'];
      const activeOffers = defaultVerifiedOfferRegistry.listOffers({ status: 'ACTIVE' });
      for (const asin of researchAsinBlacklist) {
        const found = activeOffers.find(o => o.asin === asin);
        assert.equal(found, undefined, `Research candidate ${asin} must NOT be in active registry`);
      }
    });
  });

  describe('4. Maintenance Guides & SEO Content Integration (Section 4E)', () => {
    it('registers stihl-bougie-vervangen in guides catalog', () => {
      const guides = getAllStructuredGuides();
      const sparkPlugGuide = guides.find(g => g.slug === 'stihl-bougie-vervangen');
      assert.ok(sparkPlugGuide, 'stihl-bougie-vervangen must be registered in getAllStructuredGuides()');
      assert.equal(sparkPlugGuide.publicationStatus, 'PUBLISHED', 'Guide publication status must be PUBLISHED');
      assert.equal(sparkPlugGuide.publicationEligible, true, 'Guide must be publication eligible');
    });

    it('verifies stihl-bougie-vervangen contains technical specs and covers all 12 GSC priority models', () => {
      const guide = getStructuredGuide('stihl-bougie-vervangen');
      assert.ok(guide, 'Guide must be retrievable by slug');

      // Check required GSC priority models
      const gscPriorityModels = [
        'MS 440', 'MS 210', 'MS 170', 'MS 461',
        'BG 86', 'MS 390', 'BR 600', 'MS 361',
        'MS 261', 'HS 45', 'FS 350', 'FS 460'
      ];

      const guideContent = JSON.stringify(guide);
      for (const model of gscPriorityModels) {
        assert.ok(guideContent.includes(model), `Guide must cover priority model ${model}`);
      }

      // Check technical parameters & manual citations
      assert.ok(guideContent.includes('0,5 mm'), 'Must specify 0.5 mm electrode distance');
      assert.ok(guideContent.includes('25 Nm'), 'Must specify 25 Nm torque for M14 thread');
      assert.ok(guideContent.includes('12 Nm'), 'Must specify 12 Nm torque for M10 thread');
      assert.ok(guideContent.includes('0458-428-0121') || guideContent.includes('0458-208-0121'), 'Must cite official STIHL manual instruction references');
    });

    it('renders maintenance guide HTML with verified part cards and affiliate disclosure', () => {
      const guide = getStructuredGuide('stihl-bougie-vervangen');
      const html = renderGuidePageHtml(guide, {});

      assert.ok(html.includes('Stappenplan: Veilig Bougie Inspecteren & Vervangen'), 'Must render step-by-step section');
      assert.ok(html.includes('Bougietabel per STIHL Machine & Modelserie'), 'Must render model table');
      assert.ok(html.includes('Geverifieerde Vervangingsonderdelen & Directe Links'), 'Must render verified parts section');
      assert.ok(html.includes('rel="sponsored nofollow noopener"'), 'Guide affiliate links must have rel="sponsored nofollow noopener"');
      assert.ok(html.includes('placement: \'guide_content\''), 'Guide affiliate clicks must send placement: guide_content');
      assert.ok(html.includes('As an Amazon Associate I earn from qualifying purchases'), 'Must include Amazon affiliate disclosure');
    });
  });

});
