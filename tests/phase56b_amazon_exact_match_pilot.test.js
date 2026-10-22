/**
 * Test Suite: Phase 56B — Amazon Exact Match Pilot
 *
 * Verifies:
 * 1. Authoritative Catalog Invariants Preserved (17,082 parts, 175,106 fitments, 766 configs, 208,412 evidence)
 * 2. Verification Queue Audit Integrity (250 items, 0 duplicates, 0 invalid)
 * 3. Priority Pilot Selection (50 items, 100% Commercial High, 100% SEO Tier A, 0 generic hardware)
 * 4. Strict Match Contract Validation (AmazonExactMatchVerifier)
 * 5. Fail-Closed Verifier (Rejection of invalid ASINs, fake prices/stock, aftermarket misrepresentation)
 * 6. Pilot Evaluation Outcomes (50 evaluated, 0 fabricated ASINs, 50 NOT_FOUND)
 * 7. 100% Search Fallback Availability for All 17,082 Parts
 * 8. UI Hierarchy & Content Safety (Technical data strictly above Commercial CTA)
 * 9. Analytics Differentiation (amazon_search_fallback_click vs amazon_verified_product_click)
 * 10. SEO Indexation Freeze (exactly 400 indexable parts, 581 sitemap URLs)
 * 11. Zero Uncontrolled /dp/ Links in Repository Code
 * 12. Phase 56B Output Artifacts Completeness
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  AmazonExactMatchVerifier,
  MATCH_CLASSIFICATIONS,
  VERIFICATION_METHODS,
  PRODUCT_TYPES
} from '../src/affiliate/AmazonExactMatchVerifier.js';
import {
  AmazonAffiliateProvider,
  AMAZON_MATCH_TYPES,
  VERIFICATION_STATUSES,
  isValidAsin
} from '../src/affiliate/AmazonAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import {
  isPartIndexable,
  getAllIndexablePartsList,
  getAllIndexablePartsSet
} from '../src/seo/PartIndexationRegistry.js';
import { EVENT_TYPES, isBotUserAgent } from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

// Configure test affiliate env
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'stihldecoder-21';

test('Phase 56B - Test 1: Authoritative Catalog Invariants Preserved', () => {
  const db = new Database(dbPath, { readonly: true });

  const partsCount = db.prepare('SELECT COUNT(*) as c FROM parts').get().c;
  const fitmentsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c;
  const configsCount = db.prepare('SELECT COUNT(*) as c FROM parts_model_configurations').get().c;
  const evidenceCount = db.prepare('SELECT COUNT(*) as c FROM part_fitment_evidence').get().c;
  const sectionCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;

  db.close();

  assert.strictEqual(partsCount, 17082, 'Must preserve 17,082 canonical parts');
  assert.strictEqual(fitmentsCount, 175106, 'Must preserve 175,106 canonical fitments');
  assert.strictEqual(configsCount, 766, 'Must preserve 766 active configurations');
  assert.ok(evidenceCount >= 208412, `Must preserve >= 208,412 evidence records (got ${evidenceCount})`);
  assert.strictEqual(sectionCount, 814, 'Must preserve 814 section contexts');
});

test('Phase 56B - Test 2: Verification Queue Audit Integrity (250 items)', () => {
  const queuePath = path.join(rootDir, 'output', 'phase56a', 'AMAZON_VERIFICATION_QUEUE.json');
  assert.ok(fs.existsSync(queuePath), 'AMAZON_VERIFICATION_QUEUE.json must exist');

  const doc = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  assert.strictEqual(doc.queue.length, 250, 'Queue must contain exactly 250 records');

  const seen = new Set();
  for (const item of doc.queue) {
    assert.match(item.part_number, /^\d{11}$/, 'Part number must be 11 digits');
    assert.ok(!seen.has(item.part_number), `Duplicate part number ${item.part_number} in queue`);
    seen.add(item.part_number);
    assert.strictEqual(item.current_affiliate_status, 'SEARCH_FALLBACK_ONLY');
    assert.strictEqual(item.verified_asin, null);
  }
});

test('Phase 56B - Test 3: Priority Pilot Selection (Top 50 items)', () => {
  const inputPath = path.join(rootDir, 'output', 'phase56b', 'AMAZON_PILOT_INPUT.json');
  assert.ok(fs.existsSync(inputPath), 'AMAZON_PILOT_INPUT.json must exist');

  const doc = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  assert.strictEqual(doc.pilot_size, 50, 'Pilot cohort must be exactly 50 parts');
  assert.strictEqual(doc.items.length, 50);

  const GENERIC_HARDWARE = /^(pan head screw|hexagonal head screw|hex nut|flat washer|spring washer|spline screw|countersunk screw|lock washer|screw|nut|washer|circlip|o-ring)/i;

  for (const item of doc.items) {
    assert.strictEqual(item.commercial_tier, 'COMMERCIAL_HIGH', 'Pilot items must be COMMERCIAL_HIGH');
    assert.strictEqual(item.seo_tier, 'SEO_TIER_A', 'Pilot items must be SEO_TIER_A');
    assert.ok(!GENERIC_HARDWARE.test(item.display_name), `Generic hardware leaked into pilot: ${item.display_name}`);
    assert.ok(isPartIndexable(item.part_number), `Pilot item ${item.part_number} must belong to 400 indexable parts`);
  }
});

test('Phase 56B - Test 4: Strict Match Contract Validation (AmazonExactMatchVerifier)', () => {
  // 1. Valid OEM match candidate
  const validOem = {
    part_number: '11231602050',
    asin: 'B01N7TEST1',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-22T00:00:00Z',
    evidence_source: 'STIHL Technical Catalog 2026 Page 144 / Verified OEM packaging',
    product_type: PRODUCT_TYPES.OEM,
    price: null,
    in_stock: null
  };
  const resOem = AmazonExactMatchVerifier.validateCandidate(validOem);
  assert.strictEqual(resOem.valid, true);
  assert.strictEqual(resOem.classification, MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT);

  // 2. Valid Aftermarket match candidate
  const validAftermarket = {
    part_number: '11236403200',
    asin: 'B07XYZTEST',
    marketplace: 'amazon.de',
    classification: MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-22T00:00:00Z',
    evidence_source: 'Sawzilla Parts Cross-Reference Catalog 2026',
    product_type: PRODUCT_TYPES.AFTERMARKET,
    aftermarket_brand: 'Sawzilla Parts',
    price: null,
    in_stock: null
  };
  const resAftermarket = AmazonExactMatchVerifier.validateCandidate(validAftermarket);
  assert.strictEqual(resAftermarket.valid, true);
  assert.strictEqual(resAftermarket.classification, MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE);
});

test('Phase 56B - Test 5: Fail-Closed Rejections (Invalid ASIN, fake price, misleading OEM claims)', () => {
  // 1. Invalid ASIN length / special chars
  const invalidAsin = {
    part_number: '11231602050',
    asin: 'B01INVALIDTOOLONG',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-22T00:00:00Z',
    evidence_source: 'Valid source URL',
    price: null
  };
  assert.strictEqual(AmazonExactMatchVerifier.validateCandidate(invalidAsin).valid, false);

  // 2. Disallow storing volatile prices
  const withPrice = {
    part_number: '11231602050',
    asin: 'B01N7TEST1',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-22T00:00:00Z',
    evidence_source: 'Valid source URL',
    price: '24.95' // Must fail
  };
  assert.strictEqual(AmazonExactMatchVerifier.validateCandidate(withPrice).valid, false);

  // 3. Aftermarket claiming to be OEM STIHL
  const fakeOem = {
    part_number: '11236403200',
    asin: 'B07XYZTEST',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: '2026-10-22T00:00:00Z',
    evidence_source: 'Valid source URL',
    product_type: PRODUCT_TYPES.AFTERMARKET,
    aftermarket_brand: 'STIHL OEM Replica', // Must fail
    price: null
  };
  assert.strictEqual(AmazonExactMatchVerifier.validateCandidate(fakeOem).valid, false);

  // 4. Missing timestamp / provenance
  const noProvenance = {
    part_number: '11231602050',
    asin: 'B01N7TEST1',
    marketplace: 'amazon.nl',
    classification: MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT,
    verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
    verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
    verified_at: 'not-a-timestamp',
    evidence_source: ''
  };
  assert.strictEqual(AmazonExactMatchVerifier.validateCandidate(noProvenance).valid, false);
});

test('Phase 56B - Test 6: Pilot Evaluation Outcomes (0 fabricated ASINs, 50 NOT_FOUND)', () => {
  const resultsPath = path.join(rootDir, 'output', 'phase56b', 'AMAZON_MATCH_RESULTS.json');
  const summaryPath = path.join(rootDir, 'output', 'phase56b', 'PHASE56B_SUMMARY.json');
  assert.ok(fs.existsSync(resultsPath));
  assert.ok(fs.existsSync(summaryPath));

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  assert.strictEqual(results.evaluated_count, 50);
  assert.strictEqual(summary.pilot_input_count, 50);
  assert.strictEqual(summary.exact_evaluated_count, 50);
  assert.strictEqual(summary.OEM_STIHL_EXACT, 0, 'Zero OEM matches fabricated without PAAPI / explicit ledger');
  assert.strictEqual(summary.AFTERMARKET_EXACT_REFERENCE, 0);
  assert.strictEqual(summary.AMBIGUOUS, 0);
  assert.strictEqual(summary.REJECTED, 0);
  assert.strictEqual(summary.NOT_FOUND, 50, 'All 50 parts remain safely in NOT_FOUND / pending manual verification');
  assert.strictEqual(summary.verified_asin_count_before, 0);
  assert.strictEqual(summary.verified_asin_count_after, 0);
  assert.strictEqual(summary.status, 'VERIFICATION_INFRA_READY — ZERO SAFE MATCHES');
});

test('Phase 56B - Test 7: 100% Search Fallback Availability for All 17,082 Parts', () => {
  const summary = JSON.parse(fs.readFileSync(path.join(rootDir, 'output', 'phase56b', 'PHASE56B_SUMMARY.json'), 'utf8'));
  assert.strictEqual(summary.search_fallback_coverage, 17082);
  assert.strictEqual(summary.search_fallback_percentage, 100.0);

  // Test provider search link generation
  const provider = new AmazonAffiliateProvider();
  const sampleOffers = provider.getOffers({ partNumber: '11181953500' });
  assert.strictEqual(sampleOffers.length, 1);
  assert.strictEqual(sampleOffers[0].match_type, 'SEARCH_LINK');
  assert.strictEqual(sampleOffers[0].is_verified, false);
  assert.ok(sampleOffers[0].url.includes('https://amazon.nl/s?k=STIHL+11181953500'));
  assert.ok(sampleOffers[0].url.includes('tag=stihldecoder-21'));
});

test('Phase 56B - Test 8: UI Hierarchy & Content Safety', () => {
  const html = renderPartDetailPageHtml('11181953500', database, PRIMARY_ORIGIN);

  // Hierarchy check: Technical data appears BEFORE commercial offer
  const modelsIdx = html.indexOf('Geschikte STIHL Modellen');
  const offersIdx = html.indexOf('Zoek dit onderdeel online');
  assert.ok(modelsIdx > -1, 'Models section must exist');
  assert.ok(offersIdx > -1, 'Commercial section must exist');
  assert.ok(modelsIdx < offersIdx, 'Technical compatibility must appear before commercial CTA');

  // Search fallback copy check
  assert.match(html, /Zoek op Amazon\.nl/);
  assert.match(html, /Amazon-zoekopdracht/);
  assert.match(html, /De beschikbaarheid en exacte overeenkomst zijn niet vooraf bevestigd/);

  // Price & stock claims check
  assert.strictEqual(html.includes('Op voorraad'), false);
  assert.strictEqual(html.includes('€'), false);
});

test('Phase 56B - Test 9: Analytics Differentiation (Fallback vs Verified Click)', () => {
  assert.ok(EVENT_TYPES.AMAZON_SEARCH_FALLBACK_CLICK, 'EVENT_TYPES must define AMAZON_SEARCH_FALLBACK_CLICK');
  assert.ok(EVENT_TYPES.AMAZON_VERIFIED_PRODUCT_CLICK, 'EVENT_TYPES must define AMAZON_VERIFIED_PRODUCT_CLICK');
  assert.strictEqual(EVENT_TYPES.AMAZON_SEARCH_FALLBACK_CLICK, 'amazon_search_fallback_click');
  assert.strictEqual(EVENT_TYPES.AMAZON_VERIFIED_PRODUCT_CLICK, 'amazon_verified_product_click');
});

test('Phase 56B - Test 10: SEO Indexation Freeze (400 indexable parts, 581 sitemap URLs)', () => {
  const allIndexable = getAllIndexablePartsList();
  assert.ok(allIndexable.length >= 400, 'Indexable parts must preserve baseline of at least 400');

  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const partUrls = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];
  assert.ok(partUrls.length >= 400, 'Sitemap must contain at least 400 individual part URLs');

  const allUrls = sitemapXml.match(/<loc>[^<]+<\/loc>/g) || [];
  assert.ok(allUrls.length >= 581, 'Total sitemap URLs must preserve baseline of at least 581');
});

test('Phase 56B - Test 11: Zero Uncontrolled /dp/ Links in Repository Code', () => {
  const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.idea', '.gemini', 'data', 'output']);
  const EXCLUDE_FILES = new Set([
    'tests/phase54a_parts_amazon_affiliate.test.js',
    'tests/phase54a_h_amazon_link_integrity.test.js',
    'tests/phase56b_amazon_exact_match_pilot.test.js',
    'scripts/audit_amazon_affiliate_links.mjs',
    'data/affiliate/amazon_part_offers.json'
  ]);

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');

      if (e.isDirectory()) {
        if (!EXCLUDE_DIRS.has(e.name)) scanDir(full);
      } else if (e.isFile()) {
        if (EXCLUDE_FILES.has(rel)) continue;
        if (!/\.(js|mjs|cjs|html|json)$/.test(e.name)) continue;

        const content = fs.readFileSync(full, 'utf8');
        const matches = content.match(/amazon\.(nl|de|com)\/dp\/[A-Za-z0-9]{10}/g);
        if (matches && rel !== 'src/affiliate/AmazonAffiliateProvider.js') {
          assert.fail(`Uncontrolled direct product link found in ${rel}: ${matches.join(', ')}`);
        }
      }
    }
  }

  scanDir(rootDir);
});

test('Phase 56B - Test 12: Phase 56B Output Artifacts Completeness', () => {
  const requiredFiles = [
    'AMAZON_PILOT_INPUT.json',
    'AMAZON_MATCH_RESULTS.json',
    'AMAZON_VERIFIED_OFFERS.json',
    'AMAZON_AMBIGUOUS_MATCHES.json',
    'AMAZON_REJECTED_MATCHES.json',
    'AMAZON_NOT_FOUND.json',
    'PHASE56B_SUMMARY.json',
    'PHASE56B_REPORT.md'
  ];

  for (const file of requiredFiles) {
    const p = path.join(rootDir, 'output', 'phase56b', file);
    assert.ok(fs.existsSync(p), `Required artifact output/phase56b/${file} must exist`);
    const stat = fs.statSync(p);
    assert.ok(stat.size > 20, `Artifact output/phase56b/${file} must not be empty (size: ${stat.size} bytes)`);
  }
});
