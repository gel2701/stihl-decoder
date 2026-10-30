/**
 * Phase 56F — Growth, Search Intelligence & Conversion Optimization Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver, MULTILINGUAL_TECHNICAL_SYNONYMS } from '../src/parts/PartCatalogResolver.js';
import { getAllIndexablePartsList, isPartIndexable, getWave3CohortList, getWave4CohortList, getPreWave3IndexablePartsSet } from '../src/seo/PartIndexationRegistry.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';

// Phase 56G / 56I: Wave 3 and Wave 4 add explicit, audited cohorts on top of the frozen 800-part baseline.
const WAVE3_COUNT = getWave3CohortList().length;
const WAVE4_COUNT = getWave4CohortList().length;
const EXPECTED_INDEXABLE_PARTS = 800 + WAVE3_COUNT + WAVE4_COUNT;
const EXPECTED_SITEMAP_URLS = 981 + WAVE3_COUNT + WAVE4_COUNT;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Set test environment for affiliate rendering
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
delete process.env.AMAZON_ASSOCIATE_TAG_DE;

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });
const database = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'data', 'stihl_database.json'), 'utf8'));

test('Phase 56F - Test 1: Authoritative Catalog & Database Invariants Preserved', () => {
  const partsCount = db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c;
  const fitmentsCount = db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c;
  const configsCount = db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c;
  const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c;
  const sectionContextsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;

  assert.strictEqual(partsCount, 17082, 'Total canonical parts must remain exactly 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'Total fitments must remain exactly 175,106');
  assert.strictEqual(configsCount, 766, 'Total configurations must remain exactly 766');
  assert.strictEqual(evidenceCount, 208412, 'Total evidence records must remain exactly 208,412');
  assert.strictEqual(sectionContextsCount, 814, 'Total section contexts must remain exactly 814');
});

test('Phase 56F - Test 2: Multi-Factor Search Relevance Scoring', () => {
  // 1. Exact Part Number match scores 1000
  const exactRes = PartCatalogResolver.searchParts('1141 120 0640', 1);
  assert.ok(exactRes.length > 0);
  assert.strictEqual(exactRes[0].relevance_score, 1000, 'Exact part number match must score 1000');

  // 2. Core component (Carburetor) outranks generic hardware (Screw for carburetor)
  const carbRes = PartCatalogResolver.searchParts('carburateur', 10);
  assert.ok(carbRes.length > 0, 'Must return carburetor results');
  const topCarb = carbRes[0];
  assert.ok(
    topCarb.part_name.toLowerCase().includes('carburetor'),
    `Top result must be a carburetor component, got ${topCarb.part_name}`
  );
  assert.ok(
    !topCarb.part_name.toLowerCase().startsWith('pan head screw') &&
    !topCarb.part_name.toLowerCase().startsWith('hex nut'),
    'Generic hardware must not outrank the core carburetor'
  );

  // 3. Model-scoped search attached boost
  const ms261Carb = PartCatalogResolver.searchParts('MS 261 carburateur', 5);
  assert.ok(ms261Carb.length > 0);
  assert.strictEqual(ms261Carb[0].matched_model, 'ms_261');
  assert.strictEqual(ms261Carb[0].part_number, '11411200640');
  assert.ok(ms261Carb[0].relevance_score > 300, 'Model-scoped match must receive model boost');
});

test('Phase 56F - Test 3: Zero-Result Typo Suggestion Engine (Levenshtein & Chips)', () => {
  // 1. Common typo: caburateur -> Carburateur
  const s1 = PartCatalogResolver.getSearchSuggestions('caburateur');
  assert.strictEqual(s1.suggestion, 'Carburateur', 'Must suggest Carburateur for "caburateur" typo');
  assert.ok(Array.isArray(s1.chips) && s1.chips.length > 0);

  // 2. Common typo: bougi -> Bougie
  const s2 = PartCatalogResolver.getSearchSuggestions('bougi');
  assert.strictEqual(s2.suggestion, 'Bougie', 'Must suggest Bougie for "bougi" typo');

  // 3. Common typo: luchtfiltre -> Luchtfilter
  const s3 = PartCatalogResolver.getSearchSuggestions('luchtfiltre');
  assert.strictEqual(s3.suggestion, 'Luchtfilter', 'Must suggest Luchtfilter for "luchtfiltre" typo');

  // 4. Unknown random query: returns fallback chips without suggestion
  const s4 = PartCatalogResolver.getSearchSuggestions('xyzqwe999');
  assert.strictEqual(s4.suggestion, null);
  assert.ok(s4.chips.includes('Bougie') || s4.chips.includes('Luchtfilter'));
});

test('Phase 56F - Test 4: Central Parts Discovery Page Renders Suggestions on 0 Results', () => {
  const html = renderPartsDiscoveryPageHtml('caburateur', database, PRIMARY_ORIGIN);
  assert.ok(html.includes('Geen onderdelen gevonden voor "caburateur"'), 'Must render 0-result header');
  assert.ok(html.includes('Bedoelde u misschien:'), 'Must render suggestion prompt');
  assert.ok(html.includes('Carburateur'), 'Must render suggested term link');
  assert.ok(html.includes('/onderdelen/?q=Carburateur'), 'Must link to suggested term');
  assert.ok(html.includes('<meta name="robots" content="noindex, follow">'), 'Must remain noindex, follow');
});

test('Phase 56F - Test 5: Model Page 1-Click Maintenance Wear Parts Navigation', () => {
  const ms261 = (database.models || []).find(m => (m.slug || m.id).toLowerCase() === 'ms-261');
  assert.ok(ms261, 'MS 261 must exist in database');

  const html = renderModelPageHtml(ms261, database, PRIMARY_ORIGIN);
  assert.ok(html.includes('Veelgezochte Slijtage- & Onderhoudsdelen'), 'Must render maintenance shortcuts');
  assert.ok(html.includes('/onderdelen/?q=MS%20261%20bougie'), 'Must link to scoped spark plug search');
  assert.ok(html.includes('/onderdelen/?q=MS%20261%20luchtfilter'), 'Must link to scoped air filter search');
  assert.ok(html.includes('/onderdelen/?q=MS%20261%20carburateur'), 'Must link to scoped carburetor search');
  assert.ok(html.includes('/onderdelen/?q=MS%20261%20zaagketting'), 'Chainsaw must include saw chain');
  assert.ok(html.includes('/onderdelen/?q=MS%20261%20zaagblad'), 'Chainsaw must include guide bar');
});

test('Phase 56F - Test 6: Schema.org Product Structured Data on Indexable Parts', () => {
  const allIndexable = getAllIndexablePartsList();
  assert.strictEqual(getPreWave3IndexablePartsSet().size, 800, 'Pre-Wave-3 indexable baseline must remain exactly 800');
  assert.strictEqual(allIndexable.length, EXPECTED_INDEXABLE_PARTS, 'Must have exactly 800 + Wave 3 indexable parts');

  // Verify first 20 parts render valid Product Schema and BreadcrumbList
  for (let i = 0; i < 20; i++) {
    const p = allIndexable[i];
    const html = renderPartDetailPageHtml(p.part_number, database, PRIMARY_ORIGIN);

    assert.ok(html.includes('"@type": "BreadcrumbList"'), `Part ${p.part_number} must have BreadcrumbList`);
    assert.ok(html.includes('"@type": "Product"'), `Indexable part ${p.part_number} must have Product schema`);
    assert.ok(html.includes('"mpn"'), `Indexable part ${p.part_number} must have MPN`);
    assert.ok(html.includes('"brand"'), `Indexable part ${p.part_number} must have brand`);
    assert.ok(html.includes('STIHL'), `Indexable part ${p.part_number} must specify STIHL brand`);
    assert.ok(html.includes('<meta name="robots" content="index, follow">'));
  }

  // Non-indexable negative control: must NOT render Product schema
  const nonIndexHtml = renderPartDetailPageHtml('11270201216', database, PRIMARY_ORIGIN);
  assert.ok(!nonIndexHtml.includes('"@type": "Product"'), 'Non-indexable part must not render Product schema');
  assert.ok(nonIndexHtml.includes('<meta name="robots" content="noindex, follow">'));
});

test('Phase 56F - Test 7: Sitemap Exact URL & Set Equivalence Preserved (981 Total, 800 Parts)', () => {
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const allUrls = sitemapXml.match(/<loc>[^<]+<\/loc>/g) || [];
  const partUrls = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];

  assert.strictEqual(allUrls.length, EXPECTED_SITEMAP_URLS, 'Sitemap must contain exactly 981 + Wave 3 URLs');
  assert.strictEqual(partUrls.length, EXPECTED_INDEXABLE_PARTS, 'Sitemap must contain exactly 800 + Wave 3 part detail URLs');

  const set = new Set(allUrls);
  assert.strictEqual(set.size, EXPECTED_SITEMAP_URLS, 'Zero duplicate URLs');
});

test('Phase 56F - Test 8: Amazon Affiliate Contract & Fail-Closed Integrity Preserved', () => {
  assert.strictEqual(process.env.AMAZON_ASSOCIATE_TAG || 'srihldecoder2-21', 'srihldecoder2-21');
  const samplePart = getAllIndexablePartsList()[0];
  const html = renderPartDetailPageHtml(samplePart.part_number, database, PRIMARY_ORIGIN);

  assert.ok(html.includes('rel="sponsored nofollow noopener"'), 'Must have rel sponsored nofollow noopener');
  assert.ok(html.includes('/api/affiliate/out?') && html.includes('provider=amazon'), 'Must route via affiliate endpoint');
});

test('Phase 56F - Test 9: Phase 56F Output Artifacts Completeness', () => {
  const expectedFiles = [
    'SEO_OPPORTUNITY_MATRIX.json',
    'SEARCH_INTELLIGENCE_AUDIT.json',
    'CONVERSION_FUNNEL_AUDIT.json',
    'ORGANIC_GROWTH_DASHBOARD.json',
    'PHASE56F_SUMMARY.json',
    'PHASE56F_REPORT.md'
  ];

  for (const file of expectedFiles) {
    const fullPath = path.resolve(rootDir, 'output', 'phase56f', file);
    assert.ok(fs.existsSync(fullPath), `Artifact ${file} must exist in output/phase56f/`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 50, `Artifact ${file} must not be empty`);
  }
});
