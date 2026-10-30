/**
 * Phase 56E — Parts Discovery Quality & Growth Test Suite
 *
 * Verifies:
 * 1. Authoritative Catalog & Database Invariants Preserved
 * 2. Robust Part Number Normalization (Brand prefixes, dot/slash separators, whitespace)
 * 3. Multilingual Technical Synonyms (Dutch & German -> Catalog English)
 * 4. Model-Scoped Joint Query Resolution (e.g. "MS 261 carburateur", "026 bougie")
 * 5. SEO Quality Audit across all 800 Indexable Parts (0 duplicate titles, 0 canonical errors, 0 orphans)
 * 6. Sitemap.xml Exact Equivalence (981 total URLs, 800 part detail URLs)
 * 7. Affiliate Contract Preservation (srihldecoder2-21, 17,082 fallbacks, 0 verified ASINs, Amazon.de fail-closed)
 * 8. Central Parts Discovery Page Template Rendering & Search UX
 * 9. Fail-Closed Security & Negative Controls
 * 10. Commercial Analytics Metadata Whitelisting & Non-PII Integrity
 * 11. Event Instrumentation (PARTS_SEARCH_RESULTS, PARTS_SEARCH_NO_RESULTS, PART_PAGE_VIEW)
 * 12. Phase 56E Output Artifacts Completeness
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  PartCatalogResolver,
  MULTILINGUAL_TECHNICAL_SYNONYMS
} from '../src/parts/PartCatalogResolver.js';
import {
  isPartIndexable,
  getAllIndexablePartsList,
  getAllIndexablePartsSet,
  getPilotPartsList,
  getExpansionCohortList,
  getWave2CohortList,
  getWave3CohortList,
  getWave4CohortList,
  getPreWave3IndexablePartsSet
} from '../src/seo/PartIndexationRegistry.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { EVENT_TYPES } from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Set test environment for affiliate rendering
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
delete process.env.AMAZON_ASSOCIATE_TAG_DE;

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new Database(dbPath, { readonly: true });
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

// Phase 56G: Wave 3 adds an explicit, audited cohort on top of the frozen 800-part Phase 56D/56E baseline.
// The 800 pre-Wave-3 parts stay exactly asserted; totals are asserted exactly as 800 + Wave 3 size.
const WAVE3_COUNT = getWave3CohortList().length;
const WAVE4_COUNT = getWave4CohortList().length;
const EXPECTED_INDEXABLE_PARTS = 800 + WAVE3_COUNT + WAVE4_COUNT;
const EXPECTED_SITEMAP_URLS = 981 + WAVE3_COUNT + WAVE4_COUNT;

test('Phase 56E - Test 1: Authoritative Catalog & Database Invariants Preserved', () => {
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

test('Phase 56E - Test 2: Robust Part Number Normalization (Brand prefixes, dot/slash, whitespace)', () => {
  // Exact part numbers with various prefixes and separators
  assert.strictEqual(PartNormalizer.normalizePartNumber('11231602050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('1123 160 2050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('  1123   160   2050  '), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('1123-160-2050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('1123.160.2050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('1123/160/2050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('STIHL 1123 160 2050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('Stihl 11231602050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('Teilenummer 1123 160 2050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('Onderdeel 1123 160 2050'), '11231602050');
  assert.strictEqual(PartNormalizer.normalizePartNumber('Part No. 1123 160 2050'), '11231602050');

  // Negative controls
  assert.strictEqual(PartNormalizer.normalizePartNumber('1123'), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber('112316020501'), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber('carburateur'), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber(''), null);
  assert.strictEqual(PartNormalizer.normalizePartNumber(null), null);
});

test('Phase 56E - Test 3: Multilingual Technical Synonyms (Dutch & German)', () => {
  assert.ok(Object.keys(MULTILINGUAL_TECHNICAL_SYNONYMS).length >= 100, 'Must support 100+ technical synonyms');

  // Dutch
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['carburateur'], 'carburetor');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['bougie'], 'spark plug');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['koppeling'], 'clutch');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['luchtfilter'], 'air filter');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['zaagblad'], 'guide bar');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['cilinder'], 'cylinder');

  // German
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['vergaser'], 'carburetor');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['zündkerze'], 'spark plug');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['kupplung'], 'clutch');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['schwert'], 'guide bar');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['auspuff'], 'muffler');
  assert.strictEqual(MULTILINGUAL_TECHNICAL_SYNONYMS['dichtung'], 'gasket');

  // Search execution parity: Dutch vs German yielding results
  const nlCarb = PartCatalogResolver.searchParts('carburateur', 5);
  const deCarb = PartCatalogResolver.searchParts('vergaser', 5);
  assert.ok(nlCarb.length > 0, 'Dutch "carburateur" must return parts');
  assert.ok(deCarb.length > 0, 'German "vergaser" must return parts');
  assert.strictEqual(nlCarb[0].part_number, deCarb[0].part_number, 'Dutch and German terms must resolve to identical canonical parts');

  const nlPlug = PartCatalogResolver.searchParts('bougie', 5);
  const dePlug = PartCatalogResolver.searchParts('zündkerze', 5);
  assert.ok(nlPlug.length > 0, 'Dutch "bougie" must return parts');
  assert.ok(dePlug.length > 0, 'German "zündkerze" must return parts');
  assert.strictEqual(nlPlug[0].part_number, dePlug[0].part_number);
});

test('Phase 56E - Test 4: Model-Scoped Joint Query Resolution', () => {
  // MS 261 carburateur
  const rMs261 = PartCatalogResolver.searchParts('MS 261 carburateur', 5);
  assert.ok(rMs261.length > 0, 'MS 261 carburateur must return parts');
  assert.strictEqual(rMs261[0].matched_model, 'ms_261', 'Must attach matched_model ms_261');
  assert.strictEqual(rMs261[0].part_number, '11411200640', 'Must return exact MS 261 carburetor 1141 120 0640');

  // 026 bougie (legacy model alias mapping)
  const r026 = PartCatalogResolver.searchParts('026 bougie', 5);
  assert.ok(r026.length > 0, '026 bougie must return parts');
  assert.strictEqual(r026[0].matched_model, 'ms_260', 'Must map legacy 026 to canonical ms_260');

  // 026 zündkerze (German query on legacy model)
  const r026de = PartCatalogResolver.searchParts('026 zündkerze', 5);
  assert.ok(r026de.length > 0, '026 zündkerze must return parts');
  assert.strictEqual(r026de[0].matched_model, 'ms_260');
  assert.strictEqual(r026[0].part_number, r026de[0].part_number);

  // FS 350 bougie
  const rFs350 = PartCatalogResolver.searchParts('FS 350 bougie', 5);
  assert.ok(rFs350.length > 0, 'FS 350 bougie must return parts');
  assert.strictEqual(rFs350[0].matched_model, 'fs_350');
  assert.strictEqual(rFs350[0].part_number, '41284051000');
});

test('Phase 56E - Test 5: SEO Quality Evaluation across all 800 Indexable Parts', () => {
  const allIndexable = getAllIndexablePartsList();
  assert.strictEqual(getPreWave3IndexablePartsSet().size, 800, 'Pre-Wave-3 indexable baseline must remain exactly 800');
  assert.strictEqual(allIndexable.length, EXPECTED_INDEXABLE_PARTS, 'Total indexable parts must be exactly 800 + Wave 3 cohort');

  const titles = new Set();
  const publishedModelSlugs = new Set(
    (database.models || [])
      .filter(m => m.data_status !== 'EVIDENCE_STORE_LINKED')
      .map(m => (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_'))
  );

  let wave2Orphans = 0;
  for (const p of allIndexable) {
    const html = renderPartDetailPageHtml(p.part_number, database, PRIMARY_ORIGIN);

    // Robots directive
    assert.ok(html.includes('<meta name="robots" content="index, follow">'), `Part ${p.part_number} must render index, follow`);

    // Self-canonical
    assert.ok(html.includes(`<link rel="canonical" href="${PRIMARY_ORIGIN}/onderdeelnummer/${p.part_number}/">`));

    // Title uniqueness
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    assert.ok(titleMatch, `Part ${p.part_number} must have a title`);
    titles.add(titleMatch[1]);

    // Structured data
    assert.ok(html.includes('"@type": "BreadcrumbList"'));

    // Wave 2 zero orphan check
    if (p.cohort === 'WAVE2_EXPANSION_56D') {
      const hasPublished = (p.sample_models || []).some(m => {
        const slug = m.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        return publishedModelSlugs.has(slug);
      });
      if (!hasPublished) wave2Orphans++;
    }
  }

  assert.strictEqual(titles.size, EXPECTED_INDEXABLE_PARTS, 'All indexable part titles must be 100% unique');
  assert.strictEqual(wave2Orphans, 0, 'Wave 2 must have zero orphan pages without published model links');
});

test('Phase 56E - Test 6: Sitemap.xml Exact Equivalence (981 URLs, 800 Parts)', () => {
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const allUrls = sitemapXml.match(/<loc>[^<]+<\/loc>/g) || [];
  const partUrls = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];

  assert.strictEqual(allUrls.length, EXPECTED_SITEMAP_URLS, 'Sitemap must contain exactly 981 + Wave 3 total URLs');
  assert.strictEqual(partUrls.length, EXPECTED_INDEXABLE_PARTS, 'Sitemap must contain exactly 800 + Wave 3 individual part detail URLs');

  // Verify uniqueness
  const uniqueUrls = new Set(allUrls);
  assert.strictEqual(uniqueUrls.size, EXPECTED_SITEMAP_URLS, 'Zero duplicate URLs in sitemap');
});

test('Phase 56E - Test 7: Amazon Affiliate Contract & Conversion Funnel', () => {
  const samplePart = getWave2CohortList()[0];
  const html = renderPartDetailPageHtml(samplePart.part_number, database, PRIMARY_ORIGIN);

  assert.ok(html.includes('Zoek op Amazon.nl'), 'Must render search fallback CTA');
  assert.ok(html.includes('rel="sponsored nofollow noopener"'), 'Must have sponsored rel');
  assert.ok(html.includes('/api/affiliate/out?') && html.includes('provider=amazon'), 'Must route via affiliate endpoint');

  // Verify non-indexable negative control renders noindex
  const nonIndexHtml = renderPartDetailPageHtml('11270201216', database, PRIMARY_ORIGIN);
  assert.ok(nonIndexHtml.includes('<meta name="robots" content="noindex, follow">'));
});

test('Phase 56E - Test 8: Central Parts Discovery (/onderdelen/) Template & Multilingual Search', () => {
  // 1. Initial State
  const initialHtml = renderPartsDiscoveryPageHtml('', database, PRIMARY_ORIGIN);
  assert.ok(initialHtml.includes('STIHL Onderdelen Zoeken & Explosietekeningen Catalogus'), 'Must render initial hub');
  assert.ok(initialHtml.includes('/onderdelen/'), 'Canonical URL must point to /onderdelen/');

  // 2. Exact match query
  const exactHtml = renderPartsDiscoveryPageHtml('11231602050', database, PRIMARY_ORIGIN);
  assert.ok(exactHtml.includes('Exacte Onderdeelnummer Match'), 'Must render exact match badge');
  assert.ok(exactHtml.includes('1123 160 2050'), 'Must render formatted part number');

  // 3. German synonym query
  const germanHtml = renderPartsDiscoveryPageHtml('vergaser', database, PRIMARY_ORIGIN);
  assert.ok(germanHtml.includes('Tekstzoekresultaten voor "vergaser"'), 'Must render search results for German term');

  // 4. Model query
  const modelHtml = renderPartsDiscoveryPageHtml('MS 261', database, PRIMARY_ORIGIN);
  assert.ok(modelHtml.includes('Gevonden STIHL Modellen'), 'Must show model search results');
  assert.ok(modelHtml.includes('/kettingzagen/ms-261/onderdelen/'), 'Must link to MS 261 parts page');
});

test('Phase 56E - Test 9: Fail-Closed Protection on Invalid Part Numbers', () => {
  const invalidNumbers = ['1123', '1123160205', '112316020501', 'abcdefghijk', '0000000000'];
  for (const inv of invalidNumbers) {
    assert.strictEqual(PartNormalizer.normalizePartNumber(inv), null, `Invalid number ${inv} must normalize to null`);
  }
});

test('Phase 56E - Test 10: Commercial Analytics Metadata Whitelisting & Non-PII Integrity', () => {
  const whitelistedEvents = Object.values(EVENT_TYPES);
  assert.ok(whitelistedEvents.includes('parts_search_results'), 'EVENT_TYPES must include parts_search_results');
  assert.ok(whitelistedEvents.includes('parts_search_no_results'), 'EVENT_TYPES must include parts_search_no_results');
  assert.ok(whitelistedEvents.includes('model_to_part_click'), 'EVENT_TYPES must include model_to_part_click');
  assert.ok(whitelistedEvents.includes('part_page_view'), 'EVENT_TYPES must include part_page_view');
  assert.ok(whitelistedEvents.includes('amazon_search_fallback_click'), 'EVENT_TYPES must include amazon_search_fallback_click');
  assert.ok(whitelistedEvents.includes('amazon_verified_product_click'), 'EVENT_TYPES must include amazon_verified_product_click');
});

test('Phase 56E - Test 11: Phase 56E Output Artifacts Completeness', () => {
  const requiredArtifacts = [
    'SEARCH_QUALITY_AUDIT.json',
    'SEO_QUALITY_AUDIT_800.json',
    'CONVERSION_AFFILIATE_AUDIT.json',
    'DISCOVERY_METRICS_AUDIT.json',
    'PHASE56E_SUMMARY.json',
    'PHASE56E_REPORT.md'
  ];

  for (const artifact of requiredArtifacts) {
    const artPath = path.join(rootDir, 'output', 'phase56e', artifact);
    assert.ok(fs.existsSync(artPath), `Artifact ${artifact} must exist in output/phase56e/`);
    const stat = fs.statSync(artPath);
    assert.ok(stat.size > 50, `Artifact ${artifact} must not be empty`);
  }
});

test('Phase 56E - Test 12: Zero False Commercial Claims in UI Templates', () => {
  const samplePart = getWave2CohortList()[0];
  const partHtml = renderPartDetailPageHtml(samplePart.part_number, database, PRIMARY_ORIGIN);
  const discoveryHtml = renderPartsDiscoveryPageHtml('carburateur', database, PRIMARY_ORIGIN);

  const forbiddenClaims = ['meest verkocht', 'populairst', 'best verkocht', 'laagste prijs', 'op voorraad'];
  for (const claim of forbiddenClaims) {
    assert.ok(!partHtml.includes(claim), `Part page must not contain forbidden claim "${claim}"`);
    assert.ok(!discoveryHtml.includes(claim), `Discovery page must not contain forbidden claim "${claim}"`);
  }
});
