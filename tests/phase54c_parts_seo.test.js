/**
 * Phase 54C Test Suite — Parts SEO, Internal Linking & Controlled Indexation Readiness
 *
 * Verifies parts hub, series prefix pages, model parts pages, individual part protection,
 * sitemap gating, structured data, and readiness classifier integrity.
 */

import test, { after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { server, renderPartNumberHubHtml, renderPartNumberSeriesHtml } from '../server.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import {
  getCanonicalPartSeriesCodes,
  getSafeCategorySlug,
  getSafeModelPath,
  getSafeModelPartsPath
} from '../src/publicationRules.js';
import { PartIndexReadinessClassifier } from '../src/seo/PartIndexReadinessClassifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const publishedModels = (database.models || []).filter((m) => m.data_status !== 'EVIDENCE_STORE_LINKED');
const seriesCodes = getCanonicalPartSeriesCodes(database);

test('Phase 54C: Parts Hub (/onderdeelnummer/) SEO, H1, Breadcrumbs & Quick-links', () => {
  const html = renderPartNumberHubHtml(database, PRIMARY_ORIGIN);

  assert.match(html, /<title>STIHL Onderdeelnummer Opzoeken & Onderdelen Gids \| STIHLDecoder<\/title>/);
  assert.match(html, /<meta\s+name="robots"\s+content="index, follow"/);
  assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/"/);
  assert.match(html, /<h1[^>]*>STIHL Onderdeelnummer Opzoeken & Onderdelengids<\/h1>/);

  // Breadcrumbs visible & Schema.org JSON-LD
  assert.match(html, /aria-label="Breadcrumb"/);
  assert.match(html, /"BreadcrumbList"/);
  assert.match(html, /"WebPage"/);

  // Series prefix cards
  for (const code of seriesCodes) {
    assert.ok(html.includes(`/onderdeelnummer/stihl-${code}/`), `Hub must link to series ${code}`);
  }

  // Popular model parts quick-links
  assert.match(html, /Populaire STIHL Modellen & Onderdelen/);
  assert.match(html, /STIHL MS 200/);
  assert.match(html, /STIHL MS 261/);
});

test('Phase 54C: Part Series Prefix Pages (/onderdeelnummer/stihl-XXXX/) Data-Driven Mapping', () => {
  const code1123 = '1123';
  const html1123 = renderPartNumberSeriesHtml(code1123, database, PRIMARY_ORIGIN);

  assert.match(html1123, /<title>STIHL Serie 1123 Onderdeelnummers & Compatibiliteit \| STIHLDecoder<\/title>/);
  assert.match(html1123, /<meta\s+name="robots"\s+content="index, follow"/);
  assert.match(html1123, /<link\s+rel="canonical"\s+href="https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/stihl-1123\/"/);
  assert.match(html1123, /<h1[^>]*>STIHL Serie 1123 Onderdeelnummers<\/h1>/);

  // Breadcrumbs Schema.org
  assert.match(html1123, /"BreadcrumbList"/);
  assert.match(html1123, /"WebPage"/);

  // Verify series 1123 contains MS 210, MS 230, MS 250 or 021/023/025 models
  assert.ok(html1123.includes('MS 250') || html1123.includes('025') || html1123.includes('MS 210'));

  // Verify direct link to model parts page is rendered for models with catalog parts
  assert.match(html1123, /Onderdelencatalogus & tekeningen →/);

  // Non-hardcoded check: compare with series 1141
  const html1141 = renderPartNumberSeriesHtml('1141', database, PRIMARY_ORIGIN);
  assert.notStrictEqual(html1123, html1141, 'Series pages must have distinct data-driven content');
  assert.ok(html1141.includes('MS 261') || html1141.includes('1141'));

  // Publication gate check: Series 4238 contains published TS 420 and unpublished TS 410
  const html4238 = renderPartNumberSeriesHtml('4238', database, PRIMARY_ORIGIN);
  assert.match(html4238, /href="\/doorslijpers\/ts-420\/"/, 'Published model TS 420 must be linked');
  assert.match(html4238, /href="\/doorslijpers\/ts-420\/onderdelen\/"/, 'Published model TS 420 parts must be linked');
  assert.ok(!html4238.includes('href="/doorslijpers/ts-410/"'), 'Unpublished model TS 410 must not be linked');
  assert.ok(!html4238.includes('/ts-410/onderdelen/'), 'Unpublished model TS 410 parts must not be linked');
  assert.match(html4238, /STIHL TS 410/, 'Unpublished model TS 410 is mentioned text-only');
});

test('Phase 54C: Model Parts Pages (/kettingzagen/ms-200/onderdelen/) Full Metadata & Robots Gating', () => {
  const m200 = publishedModels.find((m) => m.slug === 'ms-200');
  assert.ok(m200, 'MS 200 model must exist');

  const html200 = renderModelPartsPageHtml(m200, database, PRIMARY_ORIGIN);

  // Title & description
  assert.match(html200, /<title>STIHL MS 200 \/ 020 T Onderdelen & Tekeningen Gids \| STIHLDecoder<\/title>/);
  assert.match(html200, /<meta\s+name="description"\s+content="Bekijk STIHL MS 200 \/ 020 T onderdelen, onderdeelnummers, exploded views en compatibiliteit\./);
  assert.match(html200, /<link\s+rel="canonical"\s+href="https:\/\/www\.stihldecoder\.nl\/kettingzagen\/ms-200\/onderdelen\/"/);

  // Robots index, follow because MS 200 has parts
  assert.match(html200, /<meta\s+name="robots"\s+content="index, follow"/);

  // H1 and Subhead
  assert.match(html200, /<h1[^>]*>[\s\S]*?STIHL MS 200 \/ 020 T Onderdelen[\s\S]*?<\/h1>/);
  assert.match(html200, /Onderdeelnummers, configuraties en compatibiliteit/);

  // Data-driven intro with real counts
  assert.match(html200, /Voor de STIHL MS 200 \/ 020 T bevat de catalogus \d+ bekende onderdelen/);

  // Series prefix banner
  if (m200.series_code) {
    assert.ok(html200.includes(`/onderdeelnummer/stihl-${m200.series_code}/`));
  }

  // Cross links: back to model guide & digital passport
  assert.match(html200, /Bekijk complete STIHL MS 200 \/ 020 T machinegids & specificaties/);
  assert.match(html200, /href="\/stihl-paspoort\/#add=ms-200"/);

  // Structured data: BreadcrumbList and WebPage
  assert.match(html200, /"BreadcrumbList"/);
  assert.match(html200, /"WebPage"/);
});

test('Phase 54C: Empty Model Parts Pages Strictly Gated to "noindex, follow"', () => {
  const emptyModels = publishedModels.filter((m) => !PartCatalogResolver.hasPartsForModel(m, database));
  assert.ok(emptyModels.length > 0, 'Must have models without catalog parts');

  for (const emptyModel of emptyModels.slice(0, 5)) {
    const html = renderModelPartsPageHtml(emptyModel, database, PRIMARY_ORIGIN);
    assert.match(
      html,
      /<meta\s+name="robots"\s+content="noindex, follow"/,
      `Empty model parts page for ${emptyModel.model_name} must have robots 'noindex, follow'`
    );
  }
});

test('Phase 54C: Non-Pilot Part Detail Pages Retain Strict "noindex, follow" & Breadcrumbs Schema', () => {
  const nonPilotParts = ['00000071043', '90223410980', '92143200700', '99999999999'];

  for (const partNo of nonPilotParts) {
    const html = renderPartDetailPageHtml(partNo, database, PRIMARY_ORIGIN);

    assert.match(html, /<meta\s+name="robots"\s+content="noindex, follow"/, `Part ${partNo} must be 'noindex, follow'`);
    assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d+\/"/);
    assert.match(html, /"BreadcrumbList"/, `Part ${partNo} must include BreadcrumbList JSON-LD`);
  }
});

test('Phase 54C: Internal Linking from Model Guide (/kettingzagen/ms-200/) to Parts Page', () => {
  const m200 = publishedModels.find((m) => m.slug === 'ms-200');
  const guideHtml = renderModelPageHtml(m200, database, PRIMARY_ORIGIN);

  assert.match(guideHtml, /href="\/kettingzagen\/ms-200\/onderdelen\/"/);
  assert.match(guideHtml, /Bekijk onderdelen voor de STIHL MS 200 \/ 020 T/);
});

test('Phase 54C: Sitemap Generator Gating (Zero Empty Model Parts, Exactly 50 Pilot Parts)', () => {
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);

  // Hub present
  assert.ok(sitemapXml.includes('<loc>https://www.stihldecoder.nl/onderdeelnummer/</loc>'));

  // Series pages present
  for (const code of seriesCodes) {
    assert.ok(sitemapXml.includes(`<loc>https://www.stihldecoder.nl/onderdeelnummer/stihl-${code}/</loc>`));
  }

  // Model parts pages present only if they have parts
  const sitemapModelParts = (sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/[^<]+\/onderdelen\/<\/loc>/g) || []);
  const expectedIndexableModelParts = publishedModels.filter((m) => PartCatalogResolver.hasPartsForModel(m, database)).length;

  assert.strictEqual(sitemapModelParts.length, expectedIndexableModelParts, 'Sitemap model parts count must match indexable parts models');
  assert.strictEqual(sitemapModelParts.length, 58, 'Exactly 58 model parts pages in sitemap');

  // Exactly 50 pilot part detail pages in sitemap (zero unapproved parts)
  const sitemapParts = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];
  assert.strictEqual(sitemapParts.length, 50, 'Sitemap must contain exactly 50 pilot part detail pages');
});

test('Phase 54C: Canonical Parts Foundation Invariants Unchanged', () => {
  const sqliteDb = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
  const partsCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM parts').get().c;
  const fitmentsCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c;
  const evidenceCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM part_fitment_evidence').get().c;
  const configsCount = sqliteDb.prepare('SELECT COUNT(*) as c FROM parts_model_configurations').get().c;
  sqliteDb.close();

  assert.strictEqual(partsCount, 17082, 'PARTS must remain exactly 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'FITMENTS must remain exactly 175,106');
  assert.ok(evidenceCount >= 206607, 'EVIDENCE must remain at least 206,607');
  assert.strictEqual(configsCount, 766, 'CONFIGURATIONS must remain exactly 766');
});

test('Phase 54C: Amazon Affiliate Tracking Tag & rel="sponsored nofollow noopener" Intact', () => {
  const origEnabled = process.env.AMAZON_AFFILIATE_ENABLED;
  const origTag = process.env.AMAZON_ASSOCIATE_TAG;
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    const partHtml = renderPartDetailPageHtml('11231602050', database, PRIMARY_ORIGIN);

    assert.ok(partHtml.includes('srihldecoder2-21'), 'Affiliate tag must remain srihldecoder2-21');
    assert.ok(partHtml.includes('rel="sponsored nofollow noopener"'), 'Affiliate link must have rel="sponsored nofollow noopener"');

    // Verify no affiliate links in metadata
    const metaDesc = partHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
    assert.ok(!metaDesc?.includes('amzn.to') && !metaDesc?.includes('amazon'), 'Meta description must not contain affiliate links');
  } finally {
    if (origEnabled !== undefined) process.env.AMAZON_AFFILIATE_ENABLED = origEnabled;
    else delete process.env.AMAZON_AFFILIATE_ENABLED;
    if (origTag !== undefined) process.env.AMAZON_ASSOCIATE_TAG = origTag;
    else delete process.env.AMAZON_ASSOCIATE_TAG;
  }
});

test('Phase 54C: Part Index Readiness Classifier Runs and Exports Top 100 Candidates', () => {
  const auditResult = PartIndexReadinessClassifier.runReadinessAudit();

  assert.strictEqual(auditResult.counts.TOTAL_PARTS, 17082);
  assert.ok(auditResult.counts.STRONG_CANDIDATE > 0);
  assert.ok(auditResult.counts.CANDIDATE > 0);
  assert.ok(auditResult.counts.NOT_READY > 0);
  assert.strictEqual(
    auditResult.counts.STRONG_CANDIDATE + auditResult.counts.CANDIDATE + auditResult.counts.NOT_READY,
    17082
  );

  assert.strictEqual(auditResult.top_100_candidates.length, 100);

  const tempExportPath = path.join(rootDir, 'data', 'seo', 'temp_test_candidates.json');
  const exportedFile = PartIndexReadinessClassifier.exportTopCandidates(auditResult, tempExportPath);
  assert.ok(fs.existsSync(exportedFile), 'Temporary top 100 candidates JSON file must exist');

  const jsonContent = JSON.parse(fs.readFileSync(exportedFile, 'utf8'));
  assert.strictEqual(jsonContent.candidates.length, 100);
  assert.ok(jsonContent.candidates[0].future_preview.title.includes('STIHL'));
  assert.ok(jsonContent.candidates[0].future_preview.description.includes('Bekijk'));
  fs.unlinkSync(exportedFile);

  const trackedFile = path.join(rootDir, 'data', 'seo', 'part_indexation_candidates.json');
  assert.ok(fs.existsSync(trackedFile), 'Tracked candidate artifact must exist');

  // Regression test: Fasteners with compatibility prose (e.g. Chainsaw Parts) must not match functional keywords
  const evalEClip = PartIndexReadinessClassifier.evaluatePart({
    part_number: '94606240400',
    part_name: 'Stihl 94606240400 Chainsaw Parts E-Clip Din6799-4 MS170 / MS170C',
    model_count: 50,
    fitment_count: 100,
    section_count: 10,
    has_pos: 1,
    has_config: 1
  });
  assert.strictEqual(evalEClip.is_functional, false, 'E-Clip must not be marked functional due to "Chainsaw Parts"');
  assert.ok(evalEClip.reasons.includes('generic_hardware'), 'E-Clip must be tagged generic_hardware');
  assert.notStrictEqual(evalEClip.tier, 'STRONG_CANDIDATE', 'Generic hardware must never be STRONG_CANDIDATE');

  const evalHexNut = PartIndexReadinessClassifier.evaluatePart({
    part_number: '92162610700',
    part_name: 'Stihl 92162610700 Hexagon Nut Chainsaw Parts M5 MS170',
    model_count: 50,
    fitment_count: 100,
    section_count: 10,
    has_pos: 1,
    has_config: 1
  });
  assert.strictEqual(evalHexNut.is_functional, false, 'Hexagon Nut must not be marked functional');
  assert.ok(evalHexNut.reasons.includes('generic_hardware'), 'Hexagon Nut must be tagged generic_hardware');
  assert.notStrictEqual(evalHexNut.tier, 'STRONG_CANDIDATE', 'Hexagon Nut must never be STRONG_CANDIDATE');
});

after(() => {
  server.close();
});
