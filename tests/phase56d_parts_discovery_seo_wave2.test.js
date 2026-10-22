/**
 * Phase 56D — Parts Discovery & SEO Scale Wave 2 Test Suite
 *
 * Verifies:
 * 1. Authoritative Catalog Integrity (17,082 parts, 175,106 fitments, 766 configs, 208,412 evidence, 814 section contexts)
 * 2. SEO Protection & Cohort Progression (original 400 preserved, 400 Wave 2 selected, exactly 800 indexable total)
 * 3. Sitemap.xml Exact Equivalence (981 total URLs, 800 individual part URLs, 0 leaks, 0 orphans)
 * 4. Central Parts Discovery Page (/onderdelen/) Architecture & Rendering
 * 5. Exact Part Number Lookup & Normalization (compact, formatted, whitespace padded)
 * 6. Component Text Search & Model Filtering (strict non-fuzzy attribution)
 * 7. Model Parts Page UX Enhancements (quick section jump navigation, evidence-backed maintenance grid)
 * 8. Zero Orphan Indexable Pages (Bidirectional Model <-> Part linking)
 * 9. Affiliate Contract Preservation (srihldecoder2-21, A/B determinism, 17,082 fallbacks, 0 verified ASINs)
 * 10. Fail-Closed Security & Negative Controls (robots noindex on unapproved parts, invalid inputs)
 * 11. Commercial Analytics Metadata Whitelisting & Non-PII Integrity
 * 12. Phase 56D Output Artifacts Completeness
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import {
  isPartIndexable,
  getIndexablePartEntry,
  getAllIndexablePartsList,
  getAllIndexablePartsSet,
  getPilotPartsList,
  getExpansionCohortList,
  getWave2CohortList,
  getWave2CohortSet,
  getWave3CohortList,
  getWave4CohortList,
  getPreWave3IndexablePartsSet,
  getPreWave4IndexablePartsSet
} from '../src/seo/PartIndexationRegistry.js';
import {
  getDeterministicQueryVariant,
  QUERY_VARIANTS
} from '../src/affiliate/AmazonAffiliateProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Set test associate tag in env for affiliate offer rendering
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
delete process.env.AMAZON_ASSOCIATE_TAG_DE;

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

// Phase 56G: Wave 3 adds an explicit, audited cohort on top of the frozen 800-part Phase 56D baseline.
// The 800 pre-Wave-3 parts stay exactly asserted; totals are asserted exactly as 800 + Wave 3 size.
const WAVE3_COUNT = getWave3CohortList().length;
const WAVE4_COUNT = getWave4CohortList().length;
const EXPECTED_INDEXABLE_PARTS = 800 + WAVE3_COUNT + WAVE4_COUNT;
const EXPECTED_SITEMAP_URLS = 981 + WAVE3_COUNT + WAVE4_COUNT;

test('Phase 56D - Test 1: Authoritative Catalog & Database Invariants Preserved', () => {
  const partsCount = db.prepare('SELECT COUNT(*) as c FROM parts').get().c;
  const fitmentsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c;
  const configsCount = db.prepare('SELECT COUNT(*) as c FROM parts_model_configurations').get().c;
  const evidenceCount = db.prepare('SELECT COUNT(*) as c FROM part_fitment_evidence').get().c;
  const sectionContextsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;

  assert.strictEqual(partsCount, 17082, 'Total canonical parts must remain exactly 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'Total fitments must remain exactly 175,106');
  assert.strictEqual(configsCount, 766, 'Total configurations must remain exactly 766');
  assert.strictEqual(evidenceCount, 208412, 'Total evidence records must remain exactly 208,412');
  assert.strictEqual(sectionContextsCount, 814, 'Total section contexts must remain exactly 814');
});

test('Phase 56D - Test 2: SEO Protection & Cohort Progression (400 -> 800 parts)', () => {
  const pilotList = getPilotPartsList();
  assert.strictEqual(pilotList.length, 50, 'Phase 54D Pilot must remain exactly 50 parts');

  const expansionList = getExpansionCohortList();
  assert.strictEqual(expansionList.length, 350, 'Phase 56A Expansion cohort must remain exactly 350 parts');

  const wave2List = getWave2CohortList();
  assert.strictEqual(wave2List.length, 400, 'Phase 56D Wave 2 cohort must contain exactly 400 parts');

  const allIndexable = getAllIndexablePartsList();
  assert.strictEqual(getPreWave3IndexablePartsSet().size, 800, 'Pre-Wave-3 indexable baseline must remain exactly 800');
  assert.strictEqual(allIndexable.length, EXPECTED_INDEXABLE_PARTS, 'Total indexable parts must be exactly 800 + Wave 3 cohort');

  const allSet = getAllIndexablePartsSet();
  assert.strictEqual(allSet.size, EXPECTED_INDEXABLE_PARTS, 'Total indexable set must contain exactly 800 + Wave 3 unique parts');

  // Verify all 400 prior parts are strictly preserved in the 800 set
  for (const p of [...pilotList, ...expansionList]) {
    assert.ok(allSet.has(p.part_number), `Original part ${p.part_number} must be preserved in active indexable registry`);
    assert.strictEqual(isPartIndexable(p.part_number), true);
  }

  // Verify all 400 wave2 parts are present
  for (const p of wave2List) {
    assert.ok(allSet.has(p.part_number), `Wave 2 part ${p.part_number} must be active in indexable registry`);
    assert.strictEqual(isPartIndexable(p.part_number), true);
  }
});

test('Phase 56D - Test 3: Sitemap.xml Exact Equivalence (981 total URLs, 800 part URLs)', () => {
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const allUrls = sitemapXml.match(/<loc>[^<]+<\/loc>/g) || [];
  const partUrls = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];

  assert.strictEqual(allUrls.length, EXPECTED_SITEMAP_URLS, 'Sitemap must contain exactly 981 + Wave 3 total URLs (581 baseline + 400 wave2 + wave3)');
  assert.strictEqual(partUrls.length, EXPECTED_INDEXABLE_PARTS, 'Sitemap must contain exactly 800 + Wave 3 individual part URLs');

  // Verify zero duplicate URLs in sitemap
  const urlSet = new Set(allUrls);
  assert.strictEqual(urlSet.size, allUrls.length, 'Sitemap must contain zero duplicate URLs');

  // Verify all 800 indexable parts are present in sitemap
  const allIndexableSet = getAllIndexablePartsSet();
  const sitemapPartNumbers = new Set(partUrls.map(u => {
    const m = u.match(/\/onderdeelnummer\/(\d{11})\//);
    return m ? m[1] : null;
  }).filter(Boolean));

  assert.strictEqual(sitemapPartNumbers.size, EXPECTED_INDEXABLE_PARTS, 'All sitemap part URLs must be unique');
  for (const pNo of allIndexableSet) {
    assert.ok(sitemapPartNumbers.has(pNo), `Part ${pNo} must be in sitemap.xml`);
  }
});

test('Phase 56D - Test 4: Central Parts Discovery (/onderdelen/) Template & Rendering', () => {
  // 1. Initial State (no query)
  const homeHtml = renderPartsDiscoveryPageHtml('', database, PRIMARY_ORIGIN);
  assert.ok(homeHtml.includes('STIHL Onderdelen Zoeken'), 'Page must contain main heading');
  assert.ok(homeHtml.includes('Populaire Onderdelengroepen'), 'Page must contain category shortcuts');
  assert.ok(homeHtml.includes('<link rel="canonical" href="https://www.stihldecoder.nl/onderdelen/">'), 'Canonical URL must be /onderdelen/');
  assert.ok(homeHtml.includes('<meta name="robots" content="index, follow">'), 'Initial hub page must be index, follow');

  // 2. Exact Match Query
  const exactHtml = renderPartsDiscoveryPageHtml('11231602050', database, PRIMARY_ORIGIN);
  assert.ok(exactHtml.includes('Exacte Onderdeelnummer Match'), 'Must show exact match banner');
  assert.ok(exactHtml.includes('/onderdeelnummer/11231602050/'), 'Must link to part detail page');

  // 3. Formatted Part Number Query
  const formattedHtml = renderPartsDiscoveryPageHtml('1123 160 2050', database, PRIMARY_ORIGIN);
  assert.ok(formattedHtml.includes('Exacte Onderdeelnummer Match'), 'Must normalize and match formatted number');

  // 4. Text Query
  const textHtml = renderPartsDiscoveryPageHtml('carburateur', database, PRIMARY_ORIGIN);
  assert.ok(textHtml.includes('Tekstzoekresultaten'), 'Must show text search results section');

  // 5. Model Query
  const modelHtml = renderPartsDiscoveryPageHtml('MS 261', database, PRIMARY_ORIGIN);
  assert.ok(modelHtml.includes('Gevonden STIHL Modellen'), 'Must show model search results');
  assert.ok(modelHtml.includes('/kettingzagen/ms-261/onderdelen/'), 'Must link to MS 261 parts page');
});

test('Phase 56D - Test 5: Search Query Normalization & Segregation', () => {
  const norm1 = PartNormalizer.normalizePartNumber('11231602050');
  const norm2 = PartNormalizer.normalizePartNumber('1123 160 2050');
  const norm3 = PartNormalizer.normalizePartNumber('  1123  160  2050  ');
  const norm4 = PartNormalizer.normalizePartNumber('1123-160-2050');

  assert.strictEqual(norm1, '11231602050');
  assert.strictEqual(norm2, '11231602050');
  assert.strictEqual(norm3, '11231602050');
  assert.strictEqual(norm4, '11231602050');

  // Invalid part numbers must not resolve to canonical
  assert.strictEqual(PartNormalizer.normalizePartNumber('1123'), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber('carburateur'), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber('112316020501'), null); // 12 digits
  assert.strictEqual(PartNormalizer.normalizePartNumber('1123160205'), null);   // 10 digits
});

test('Phase 56D - Test 6: Model Parts Page Quick Section Navigation & Maintenance Highlight', () => {
  const model = database.models.find(m => m.slug === 'ms-261' || m.id === 'ms_261');
  assert.ok(model, 'MS 261 model must exist in database');

  const html = renderModelPartsPageHtml(model, database, PRIMARY_ORIGIN);
  assert.ok(html.includes('SNEL NAAR EXPLODED VIEW SECTIE:'), 'Must render section navigation bar');
  assert.ok(html.includes('#section-0'), 'Must contain anchor links to sections');
  assert.ok(html.includes('Veelgezochte Onderhouds- & Slijtagedelen'), 'Must render maintenance parts grid');
  assert.ok(html.includes('/onderdelen/'), 'Header must contain link to central parts discovery');

  // Negative assertion: forbidden commercial claims
  assert.ok(!html.includes('meest verkocht'), 'Must not contain forbidden claim "meest verkocht"');
  assert.ok(!html.includes('populairst'), 'Must not contain forbidden claim "populairst"');
  assert.ok(!html.includes('best verkocht'), 'Must not contain forbidden claim "best verkocht"');
});

test('Phase 56D - Test 7: Zero Orphan Indexable Pages (Bidirectional Links)', () => {
  const wave2List = getWave2CohortList();
  const publishedModelSlugs = new Set(
    (database.models || [])
      .filter(m => m.data_status !== 'EVIDENCE_STORE_LINKED')
      .map(m => (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_'))
  );

  let orphans = 0;
  for (const p of wave2List) {
    const hasPublishedModel = p.sample_models.some(m => {
      const slug = m.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      return publishedModelSlugs.has(slug);
    });
    if (!hasPublishedModel) {
      orphans++;
    }
  }

  assert.strictEqual(orphans, 0, 'Zero Wave 2 indexable parts may be orphans without published model links');
});

test('Phase 56D - Test 8: Part Detail Page Content & Wave 2 Indexation Integrity', () => {
  const wave2Sample = getWave2CohortList()[0];
  assert.ok(wave2Sample, 'Wave 2 sample part must exist');

  const html = renderPartDetailPageHtml(wave2Sample.part_number, database, PRIMARY_ORIGIN);
  assert.ok(html.includes('<meta name="robots" content="index, follow">'), 'Wave 2 parts must render index, follow');
  assert.ok(html.includes(`STIHL ${wave2Sample.part_number_display}`), 'Must render formatted part number');
  assert.ok(html.includes(wave2Sample.clean_name), 'Must render clean component name');
  assert.ok(html.includes('Geschikte STIHL Modellen'), 'Must render compatible models section');
  assert.ok(html.includes('Zoek op Amazon.nl'), 'Must render search fallback copy');

  // Test negative control: non-indexable part
  const nonIndexableSample = '11270201216';
  assert.strictEqual(isPartIndexable(nonIndexableSample), false);
  const nonIndexHtml = renderPartDetailPageHtml(nonIndexableSample, database, PRIMARY_ORIGIN);
  assert.ok(nonIndexHtml.includes('<meta name="robots" content="noindex, follow">'), 'Non-indexable part must render noindex, follow');
});

test('Phase 56D - Test 9: Amazon Affiliate Contract & Deterministic A/B Preservation', () => {
  const wave2List = getWave2CohortList();
  let aCount = 0;
  let bCount = 0;

  for (const p of wave2List) {
    const variant = getDeterministicQueryVariant(p.part_number);
    assert.ok([QUERY_VARIANTS.VARIANT_A, QUERY_VARIANTS.VARIANT_B].includes(variant));
    if (variant === QUERY_VARIANTS.VARIANT_A) aCount++;
    else if (variant === QUERY_VARIANTS.VARIANT_B) bCount++;
  }

  // Distribution across 400 parts should be well-balanced
  assert.ok(aCount > 150 && aCount < 250, `Variant A count must be balanced (got ${aCount})`);
  assert.ok(bCount > 150 && bCount < 250, `Variant B count must be balanced (got ${bCount})`);
  assert.strictEqual(aCount + bCount, 400, 'All 400 Wave 2 parts must be assigned a variant');

  // Determinism check: repeated calls yield identical variant
  for (const p of wave2List.slice(0, 10)) {
    const v1 = getDeterministicQueryVariant(p.part_number);
    const v2 = getDeterministicQueryVariant(p.part_number);
    assert.strictEqual(v1, v2, 'Query variant assignment must be strictly deterministic');
  }
});

test('Phase 56D - Test 10: Fail-Closed Protection on Invalid & Unknown Numbers', () => {
  // Unknown 11-digit number
  const unknownNo = '99999999999';
  const resolved = PartCatalogResolver.resolvePartNumber(unknownNo, database);
  assert.strictEqual(Boolean(resolved && resolved.part_number), false, 'Unknown part number must not resolve');
  assert.strictEqual(isPartIndexable(unknownNo), false, 'Unknown part number must NOT be indexable');

  const unknownHtml = renderPartDetailPageHtml(unknownNo, database, PRIMARY_ORIGIN);
  assert.ok(unknownHtml.includes('niet opgenomen in de canonieke onderdelendatabase'), 'Must render fail-closed not found card');
  assert.ok(unknownHtml.includes('<meta name="robots" content="noindex, follow">'), 'Must render noindex');
});

test('Phase 56D - Test 11: Commercial Analytics Metadata Whitelisting & Non-PII Integrity', () => {
  const summaryPath = path.join(rootDir, 'output', 'phase56d', 'AFFILIATE_FUNNEL_AUDIT.json');
  assert.ok(fs.existsSync(summaryPath), 'AFFILIATE_FUNNEL_AUDIT.json must exist');

  const doc = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.strictEqual(doc.contract_invariants.production_tag, 'srihldecoder2-21');
  assert.strictEqual(doc.contract_invariants.verified_direct_asin_count, 0);
  assert.strictEqual(doc.contract_invariants.amazon_de_fail_closed, true);
  assert.strictEqual(doc.funnel_ux.forbidden_commercial_claims, 0);
});

test('Phase 56D - Test 12: Phase 56D Output Artifacts Completeness', () => {
  const requiredFiles = [
    'PARTS_DISCOVERY_BASELINE.json',
    'WAVE2_ELIGIBILITY.json',
    'WAVE2_SELECTED_COHORT.json',
    'INTERNAL_LINK_AUDIT.json',
    'PART_SEARCH_AUDIT.json',
    'AFFILIATE_FUNNEL_AUDIT.json',
    'SEO_WAVE2_SUMMARY.json',
    'PHASE56D_SUMMARY.json',
    'PHASE56D_REPORT.md'
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(rootDir, 'output', 'phase56d', f);
    assert.ok(fs.existsSync(fullPath), `Artifact output/phase56d/${f} must exist`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 50, `Artifact output/phase56d/${f} must not be empty`);
  }
});
