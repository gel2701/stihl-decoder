/**
 * Parts SEO Comprehensive Audit Script
 * Phase 54C — SEO, Internal Linking & Controlled Indexation Readiness
 *
 * Verifies parts hub, series pages, model parts pages, and part detail pages
 * against search engine criteria, indexation rules, canonical hosts, and metadata integrity.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRIMARY_ORIGIN } from '../src/config.js';
import { renderPartNumberHubHtml, renderPartNumberSeriesHtml } from '../server.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
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
import {
  isPartIndexationPilotEnabled,
  getPartIndexationPilotList,
  getPartIndexationPilotSet
} from '../src/seo/PartIndexationPilot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🔍 RUNNING PHASE 54C — PARTS SEO & INDEXATION READINESS AUDIT');
console.log('===============================================================\n');

// 1. Load database
const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const models = database.models || [];
const seriesCodes = getCanonicalPartSeriesCodes(database);

const inboundEdges = new Map();
function recordLink(sourceUrl, targetUrl) {
  if (!targetUrl || targetUrl === sourceUrl) return; // exclude self-links
  if (!inboundEdges.has(targetUrl)) {
    inboundEdges.set(targetUrl, new Set());
  }
  inboundEdges.get(targetUrl).add(sourceUrl);
}

function collectHrefs(html, sourceUrl) {
  if (!html) return;
  const matches = html.matchAll(/href="([^"#?]+)"/g);
  for (const m of matches) {
    recordLink(sourceUrl, m[1]);
  }
}

const audit = {
  model_parts_pages: 0,
  series_pages: 0,
  part_hub: 1,
  part_details_sampled: 0,

  indexable_count: 0,
  noindex_count: 0,

  missing_title: 0,
  missing_description: 0,
  missing_canonical: 0,
  missing_h1: 0,
  missing_breadcrumb: 0,
  missing_internal_links: 0,
  robots_mismatches: 0,
  duplicate_titles: 0,
  duplicate_descriptions: 0,
  orphan_pages: 0
};

const titleRegistry = new Map();
const descriptionRegistry = new Map();

function trackMetadata(title, description, url) {
  if (title) {
    if (titleRegistry.has(title)) {
      titleRegistry.get(title).push(url);
      audit.duplicate_titles++;
    } else {
      titleRegistry.set(title, [url]);
    }
  }
  if (description) {
    if (descriptionRegistry.has(description)) {
      descriptionRegistry.get(description).push(url);
      audit.duplicate_descriptions++;
    } else {
      descriptionRegistry.set(description, [url]);
    }
  }
}

// 2. Audit Parts Hub (/onderdeelnummer/)
console.log('▶ Auditing Parts Hub (/onderdeelnummer/)...');
const hubHtml = renderPartNumberHubHtml(database, PRIMARY_ORIGIN);
const hubTitle = hubHtml.match(/<title>([^<]+)<\/title>/)?.[1];
const hubDesc = hubHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
const hubCanonical = hubHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1];
const hubRobots = hubHtml.match(/<meta\s+name="robots"\s+content="([^"]+)"/)?.[1];
const hubH1 = hubHtml.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1];

if (!hubTitle) audit.missing_title++;
if (!hubDesc) audit.missing_description++;
if (!hubCanonical) audit.missing_canonical++;
if (!hubH1) audit.missing_h1++;
if (!hubHtml.includes('BreadcrumbList')) audit.missing_breadcrumb++;
if (!hubHtml.includes('/onderdeelnummer/stihl-')) audit.missing_internal_links++;

if (hubRobots === 'index, follow') {
  audit.indexable_count++;
} else {
  audit.noindex_count++;
  audit.robots_mismatches++;
}
trackMetadata(hubTitle, hubDesc, '/onderdeelnummer/');
collectHrefs(hubHtml, '/onderdeelnummer/');

console.log(`  Title: ${hubTitle}`);
console.log(`  Robots: ${hubRobots}`);
console.log(`  Canonical: ${hubCanonical}`);
console.log('  ✅ Parts Hub Audit Passed.\n');

// 3. Audit Part Series Pages (/onderdeelnummer/stihl-XXXX/)
console.log(`▶ Auditing ${seriesCodes.length} Part Series Pages...`);
for (const code of seriesCodes) {
  audit.series_pages++;
  const seriesUrl = `/onderdeelnummer/stihl-${code}/`;
  const seriesHtml = renderPartNumberSeriesHtml(code, database, PRIMARY_ORIGIN);
  const title = seriesHtml.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = seriesHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
  const canonical = seriesHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1];
  const robots = seriesHtml.match(/<meta\s+name="robots"\s+content="([^"]+)"/)?.[1];
  const h1 = seriesHtml.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1];

  if (!title) audit.missing_title++;
  if (!desc) audit.missing_description++;
  if (!canonical) audit.missing_canonical++;
  if (!h1) audit.missing_h1++;
  if (!seriesHtml.includes('BreadcrumbList')) audit.missing_breadcrumb++;

  if (robots === 'index, follow') {
    audit.indexable_count++;
  } else {
    audit.noindex_count++;
    audit.robots_mismatches++;
  }
  trackMetadata(title, desc, seriesUrl);
  collectHrefs(seriesHtml, seriesUrl);
}
console.log('  ✅ All Part Series Pages Audited Cleanly.\n');

const publishedModels = models.filter((m) => m.data_status !== 'EVIDENCE_STORE_LINKED');
console.log(`▶ Auditing Model Parts Pages for ${publishedModels.length} published models...`);
let indexableModelPartsCount = 0;
let noindexModelPartsCount = 0;

for (const model of publishedModels) {
  const partsPath = getSafeModelPartsPath(model);
  if (!partsPath) continue;

  audit.model_parts_pages++;
  const partsHtml = renderModelPartsPageHtml(model, database, PRIMARY_ORIGIN);
  const title = partsHtml.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = partsHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
  const canonical = partsHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1];
  const robots = partsHtml.match(/<meta\s+name="robots"\s+content="([^"]+)"/)?.[1];
  const h1 = partsHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/\s+/g, ' ').trim();

  if (!title) audit.missing_title++;
  if (!desc) audit.missing_description++;
  if (!canonical) audit.missing_canonical++;
  if (!h1) audit.missing_h1++;
  if (!partsHtml.includes('BreadcrumbList')) audit.missing_breadcrumb++;
  if (!partsHtml.includes(getSafeModelPath(model) || '/')) audit.missing_internal_links++;

  const hasParts = PartCatalogResolver.hasPartsForModel(model, database);

  if (hasParts) {
    if (robots !== 'index, follow') {
      console.error(`🚨 Model ${model.model_name} has parts but robots is ${robots}!`);
      audit.robots_mismatches++;
    }
    indexableModelPartsCount++;
    audit.indexable_count++;
  } else {
    if (robots !== 'noindex, follow') {
      console.error(`🚨 Empty model ${model.model_name} has 0 parts but robots is ${robots}!`);
      audit.robots_mismatches++;
    }
    noindexModelPartsCount++;
    audit.noindex_count++;
  }

  // Collect inbound links from model guide and model parts page
  const guidePath = getSafeModelPath(model);
  const guideHtml = renderModelPageHtml(model, database, PRIMARY_ORIGIN);
  collectHrefs(guideHtml, guidePath);
  collectHrefs(partsHtml, partsPath);

  // Only track duplicate metadata for indexable pages to avoid false positives on unindexed shells
  if (robots === 'index, follow') {
    trackMetadata(title, desc, partsPath);
  }
}

console.log(`  Indexable Model Parts Pages: ${indexableModelPartsCount}`);
console.log(`  Noindexed Empty Model Parts Pages: ${noindexModelPartsCount}`);
console.log('  ✅ Model Parts Pages Audited Cleanly.\n');

// 5. Audit Sampled Part Detail Pages (/onderdeelnummer/<part>/)
console.log('▶ Auditing Sampled Individual Part Detail Pages...');
const sampleParts = [
  '00000071043', '11231602050', '11236403200', '11104007005', '11256401701',
  '41370202800', '00009888600', '90223410980', '11181953500', '92143200700',
  '11210201200', '11230201200', '11280201250', '11300201201', '11410201200'
];

for (const rawPart of sampleParts) {
  audit.part_details_sampled++;
  const partHtml = renderPartDetailPageHtml(rawPart, database, PRIMARY_ORIGIN);
  const robots = partHtml.match(/<meta\s+name="robots"\s+content="([^"]+)"/)?.[1];
  const canonical = partHtml.match(/<link\s+rel="canonical"\s+href="([^"]+)"/)?.[1];
  const isPilot = isPartIndexationPilotEnabled(rawPart);

  if (isPilot) {
    if (robots !== 'index, follow') {
      throw new Error(`🚨 Pilot part ${rawPart} expected 'index, follow' but got ${robots}`);
    }
    audit.indexable_count++;
  } else {
    if (robots !== 'noindex, follow') {
      throw new Error(`🚨 CRITICAL FAIL-CLOSED REGRESSION: Non-pilot part ${rawPart} is NOT 'noindex, follow' (got ${robots})!`);
    }
    audit.noindex_count++;
  }

  if (!canonical || !canonical.startsWith('https://www.stihldecoder.nl/onderdeelnummer/')) {
    throw new Error(`🚨 Canonical host mismatch for part ${rawPart}: ${canonical}`);
  }
  if (!partHtml.includes('BreadcrumbList')) {
    audit.missing_breadcrumb++;
  }
}
console.log(`  Sampled ${sampleParts.length} Part Detail pages. Pilot parts confirmed 'index, follow', non-pilot strictly 'noindex, follow'.`);
console.log('  ✅ Part Detail Protection Policy Confirmed.\n');

// 6. Audit Sitemap Generator Coverage
console.log('▶ Auditing Sitemap Generator Coverage...');
const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
const sitemapUrls = (sitemapXml.match(/<loc>([^<]+)<\/loc>/g) || []).map((l) => l.replace(/<\/?loc>/g, ''));

const sitemapModelPartsUrls = sitemapUrls.filter((u) => u.includes('/onderdelen/'));
const sitemapSeriesUrls = sitemapUrls.filter((u) => u.includes('/onderdeelnummer/stihl-'));
const sitemapHubPresent = sitemapUrls.includes(`${PRIMARY_ORIGIN}/onderdeelnummer/`);
const sitemapIndividualPartUrls = sitemapUrls.filter((u) => u.match(/\/onderdeelnummer\/\d{11}\//));

const pilotList = getPartIndexationPilotList();
const pilotSet = getPartIndexationPilotSet();

console.log(`  Total URLs in sitemap: ${sitemapUrls.length}`);
console.log(`  Parts Hub in sitemap: ${sitemapHubPresent ? 'YES' : 'NO'}`);
console.log(`  Series pages in sitemap: ${sitemapSeriesUrls.length}`);
console.log(`  Model parts pages in sitemap: ${sitemapModelPartsUrls.length}`);
console.log(`  Individual part details in sitemap: ${sitemapIndividualPartUrls.length} (MUST BE EXACT PILOT COUNT: ${pilotList.length} <= 50)`);

if (!sitemapHubPresent) throw new Error('Parts hub missing from sitemap.xml');
if (sitemapSeriesUrls.length !== seriesCodes.length) throw new Error(`Series pages count in sitemap mismatch: got ${sitemapSeriesUrls.length}, expected ${seriesCodes.length}`);
if (sitemapModelPartsUrls.length !== indexableModelPartsCount) throw new Error(`Model parts in sitemap mismatch: got ${sitemapModelPartsUrls.length}, expected ${indexableModelPartsCount}`);

// Verify exact membership between sitemap model parts URLs and published models with parts
const expectedModelPartsUrls = new Set(
  publishedModels
    .filter((m) => PartCatalogResolver.hasPartsForModel(m, database))
    .map((m) => `${PRIMARY_ORIGIN}${getSafeModelPartsPath(m)}`)
    .filter(Boolean)
);
const actualModelPartsSet = new Set(sitemapModelPartsUrls);

for (const expectedUrl of expectedModelPartsUrls) {
  if (!actualModelPartsSet.has(expectedUrl)) {
    throw new Error(`Expected model parts URL missing from sitemap.xml: ${expectedUrl}`);
  }
}
for (const actualUrl of actualModelPartsSet) {
  if (!expectedModelPartsUrls.has(actualUrl)) {
    throw new Error(`Unexpected model parts URL leaked into sitemap.xml: ${actualUrl}`);
  }
}

// Phase 54D: Individual part detail pages in sitemap must match pilot allowlist exactly
if (sitemapIndividualPartUrls.length !== pilotList.length) {
  throw new Error(`🚨 Pilot parts sitemap count mismatch: expected ${pilotList.length}, got ${sitemapIndividualPartUrls.length}`);
}
if (sitemapIndividualPartUrls.length > 50) {
  throw new Error(`🚨 CRITICAL MASS INDEXATION TRIPWIRE: Sitemap parts count (${sitemapIndividualPartUrls.length}) exceeds 50!`);
}

const sitemapPartNumbers = new Set(sitemapIndividualPartUrls.map((u) => {
  const m = u.match(/\/onderdeelnummer\/(\d{11})\//);
  return m ? m[1] : null;
}).filter(Boolean));

for (const p of pilotList) {
  if (!sitemapPartNumbers.has(p.part_number)) {
    throw new Error(`🚨 Pilot part ${p.part_number} missing from sitemap.xml!`);
  }
}
for (const pNum of sitemapPartNumbers) {
  if (!pilotSet.has(pNum)) {
    throw new Error(`🚨 CRITICAL LEAK: Non-pilot part ${pNum} found in sitemap.xml!`);
  }
}

console.log('  ✅ Sitemap Generator Verification 100% Clean.\n');

// 7. Audit Internal Link Equity & Orphan Check
console.log('▶ Running Orphan Page Check for indexable parts surfaces...');
const indexablePartsUrls = [
  '/onderdeelnummer/',
  ...seriesCodes.map((code) => `/onderdeelnummer/stihl-${code}/`),
  ...publishedModels
    .filter((m) => PartCatalogResolver.hasPartsForModel(m, database))
    .map((m) => getSafeModelPartsPath(m))
    .filter(Boolean)
];

const orphanUrls = [];
for (const url of indexablePartsUrls) {
  if (url === '/onderdeelnummer/') continue;
  const sources = inboundEdges.get(url);
  if (!sources || sources.size === 0) {
    orphanUrls.push(url);
  }
}

audit.orphan_pages = orphanUrls.length;
if (orphanUrls.length > 0) {
  console.error(`🚨 Found ${orphanUrls.length} orphan indexable parts pages:\n`, orphanUrls.join('\n'));
} else {
  console.log(`  Indexable Orphan Part Pages: ${audit.orphan_pages} (verified across ${indexablePartsUrls.length} indexable parts routes against real link graph)`);
  console.log('  ✅ Orphan Check Passed.\n');
}

// 8. Run Part Indexability Readiness Classifier
console.log('▶ Running Part Indexability Readiness Classifier across 17,082 canonical parts...');
const readinessResult = PartIndexReadinessClassifier.runReadinessAudit();
const candidateFile = PartIndexReadinessClassifier.exportTopCandidates(readinessResult);

console.log(`  TOTAL_PARTS:               ${readinessResult.counts.TOTAL_PARTS}`);
console.log(`  STRONG_CANDIDATE:          ${readinessResult.counts.STRONG_CANDIDATE}`);
console.log(`  CANDIDATE:                 ${readinessResult.counts.CANDIDATE}`);
console.log(`  NOT_READY:                 ${readinessResult.counts.NOT_READY}`);
console.log('  Top 100 candidates written to:', candidateFile);
console.log('  ✅ Readiness Classifier Analysis Complete.\n');

console.log('===============================================================');
console.log('📊 AUDIT SUMMARY METRICS');
console.log('===============================================================');
console.log(`  Model Parts Pages:       ${audit.model_parts_pages} (Indexable: ${indexableModelPartsCount}, Noindexed Empty: ${noindexModelPartsCount})`);
console.log(`  Series Pages:            ${audit.series_pages}`);
console.log(`  Parts Hub:               ${audit.part_hub}`);
console.log(`  Sampled Part Details:    ${audit.part_details_sampled}`);
console.log(`  Indexable URLs Audited:  ${audit.indexable_count}`);
console.log(`  Noindexed URLs Audited:  ${audit.noindex_count}`);
console.log(`  Missing Title:           ${audit.missing_title}`);
console.log(`  Missing Description:     ${audit.missing_description}`);
console.log(`  Missing Canonical:       ${audit.missing_canonical}`);
console.log(`  Missing H1:              ${audit.missing_h1}`);
console.log(`  Missing Breadcrumb:      ${audit.missing_breadcrumb}`);
console.log(`  Missing Internal Links:  ${audit.missing_internal_links}`);
console.log(`  Robots Mismatches:       ${audit.robots_mismatches}`);
console.log(`  Duplicate Titles:        ${audit.duplicate_titles}`);
console.log(`  Duplicate Descriptions:  ${audit.duplicate_descriptions}`);
console.log(`  Orphan Pages:            ${audit.orphan_pages}`);
console.log('===============================================================\n');

if (
  audit.missing_title > 0 ||
  audit.missing_description > 0 ||
  audit.missing_canonical > 0 ||
  audit.missing_h1 > 0 ||
  audit.missing_breadcrumb > 0 ||
  audit.missing_internal_links > 0 ||
  audit.robots_mismatches > 0 ||
  audit.duplicate_titles > 0 ||
  audit.duplicate_descriptions > 0 ||
  audit.orphan_pages > 0
) {
  console.error('🚨 AUDIT DETECTED FAILURES!');
  process.exit(1);
} else {
  console.log('🎉 ALL PARTS SEO CRITERIA PASSED 100% CLEANLY!');
  process.exit(0);
}
