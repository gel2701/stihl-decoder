/**
 * Phase 58A — Complete Garden Hire Spares STIHL Catalog Harvest & Authoritative Source Import
 * Dedicated Regression & Contract Test Suite (14 Required Verification Areas + Hard Gates)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  GHS_ROOT_URL,
  GHS_AUTHORITY,
  GHS_SOURCE_STATUS,
  GHS_DISCOVERY_METHOD,
  normalizeGhsUrl,
  separateGhsSkuAndStihlPartNumber,
  classifyGhsProductType,
  normalizeGhsModel,
  parseGhsDiagramLabel,
  parseGhsPage,
  extractSuitableStihlModelsFromText
} from '../src/parts/GhsCatalogParser.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { isPartIndexable } from '../src/seo/PartIndexationRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUT_DIR = path.join(ROOT_DIR, 'output', 'phase58a');
const RAW_DIR = path.join(OUT_DIR, 'raw');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('Phase 58A — 1. Model Normalization & Alias Preservation (Distinct Variants Kept Separate)', () => {
  const rm0 = normalizeGhsModel('RM248.0 Rotary Mower Parts');
  const rm1 = normalizeGhsModel('RM248.1 Rotary Mower Parts');
  const rm2 = normalizeGhsModel('RM248.2 Rotary Mower Parts');
  const rm1t = normalizeGhsModel('RM248.1 T Rotary Mower Parts');

  assert.ok(rm0 && rm1 && rm2 && rm1t);
  assert.notEqual(rm0.canonical_model_id, rm1.canonical_model_id, 'RM248.0 and RM248.1 must remain separate');
  assert.notEqual(rm1.canonical_model_id, rm2.canonical_model_id, 'RM248.1 and RM248.2 must remain separate');
  assert.equal(rm1.model_display_name, 'RM 248.1');
  assert.equal(rm1t.normalized_alias, 'RM248.1T');

  const km85r = normalizeGhsModel('KM85 R KombiEngine Parts');
  const km85rAlias = normalizeGhsModel('KM85R');
  assert.ok(km85r && km85rAlias);
  assert.equal(km85r.model_display_name, 'KM 85 R');
  assert.equal(km85r.normalized_alias, 'KM85R');
  assert.equal(km85rAlias.normalized_alias, 'KM85R');

  const hl145 = normalizeGhsModel('HL-KM 145 KombiTools Parts');
  const hl135 = normalizeGhsModel('HL-KM 135 KombiTools Parts');
  assert.ok(hl145 && hl135);
  assert.notEqual(hl145.canonical_model_id, hl135.canonical_model_id, 'HL-KM 145 and HL-KM 135 must remain distinct');

  // Category headers and non-models must be rejected
  assert.equal(normalizeGhsModel('Stihl Chainsaw Parts'), null);
  assert.equal(normalizeGhsModel('FW Petrol Disc Cutter Parts'), null);
  assert.equal(normalizeGhsModel('TS 0000'), null);
});

test('Phase 58A — 2. STIHL Part-Number Normalization (Raw Formatting Preserved)', () => {
  const res = separateGhsSkuAndStihlPartNumber('ST0000 350 3502', '0000 350 3502', null);
  assert.equal(res.part_number_raw, '0000 350 3502');
  assert.equal(res.part_number_normalized, '00003503502');
  assert.equal(res.part_number_display, '0000 350 3502');

  const resFromTitle = separateGhsSkuAndStihlPartNumber(null, null, '4241 122 6600 Genuine Stihl Collar Screw');
  assert.equal(resFromTitle.part_number_raw, '4241 122 6600');
  assert.equal(resFromTitle.part_number_normalized, '42411226600');
});

test('Phase 58A — 3. GHS Internal SKU Separation (Never Mistaken for STIHL Part Number)', () => {
  const internalOnly = separateGhsSkuAndStihlPartNumber('7488', null, 'Non-Genuine Stihl Recoil Pull Cord');
  assert.equal(internalOnly.ghs_part_number, '7488');
  assert.equal(internalOnly.part_number_normalized, null);

  const internalWithOem = separateGhsSkuAndStihlPartNumber('1474', '4223 190 0401', 'Stihl TS400 Recoil Starter Assembly');
  assert.equal(internalWithOem.ghs_part_number, '1474');
  assert.equal(internalWithOem.part_number_normalized, '42231900401');

  const integrity = readJson(path.join(OUT_DIR, 'CATALOG_INTEGRITY.json'));
  assert.equal(integrity.hard_gates.GHS_SKU_MISTAKEN_FOR_STIHL_PART_NUMBER, 0);
});

test('Phase 58A — 4. Genuine OEM vs Aftermarket Classification', () => {
  const oem = classifyGhsProductType({
    title: '0000 642 1234 Genuine Stihl Rim Sprocket',
    manufacturer: 'Stihl',
    partType: 'Genuine Part',
    ghsSku: 'ST0000 642 1234'
  });
  assert.equal(oem.product_type, 'OEM');
  assert.equal(oem.manufacturer, 'STIHL');
  assert.equal(oem.is_oem, true);

  const aftermarket = classifyGhsProductType({
    title: 'Stihl TS400 Cylinder & Piston Assembly',
    manufacturer: 'WAR TEC',
    partType: 'Non-Genuine Part',
    ghsSku: '7488'
  });
  assert.equal(aftermarket.product_type, 'AFTERMARKET');
  assert.equal(aftermarket.is_oem, false);

  const integrity = readJson(path.join(OUT_DIR, 'CATALOG_INTEGRITY.json'));
  assert.equal(integrity.hard_gates.AFTERMARKET_MISTAKEN_FOR_OEM, 0);
});

test('Phase 58A — 5. Pagination Traversal & URL Normalization', () => {
  assert.equal(
    normalizeGhsUrl('https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html?p=1&srsltid=abc'),
    'https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html'
  );
  assert.equal(
    normalizeGhsUrl('https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html?p=2&srsltid=abc'),
    'https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html?p=2'
  );

  // Verify toolbar "1-24 of 75 Items" generates ?p=2, ?p=3, ?p=4
  const sampleHtml = `
    <html>
      <body>
        <h1>MS271 C-BE Chainsaw Parts</h1>
        <p class="toolbar-amount">1-24 of 75 Items</p>
        <div class="products-grid"></div>
      </body>
    </html>
  `;
  const parsed = parseGhsPage(
    sampleHtml,
    'https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html'
  );
  assert.ok(parsed.pagination_urls.includes('https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html?p=2'));
  assert.ok(parsed.pagination_urls.includes('https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html?p=3'));
  assert.ok(parsed.pagination_urls.includes('https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/ms271-c-be.html?p=4'));
});

test('Phase 58A — 6. Recursive Category & Subcategory Traversal', () => {
  const catCoverage = readJson(path.join(OUT_DIR, 'CATEGORY_COVERAGE.json'));
  assert.ok(catCoverage.raw_category_pages_discovered >= 80, `Expected >= 80 category pages discovered, got ${catCoverage.raw_category_pages_discovered}`);
  assert.ok(Array.isArray(catCoverage.categories) && catCoverage.categories.length >= 10);
});

test('Phase 58A — 7. Diagram Section & Image Reference Extraction (No Binary Bloat)', () => {
  const diag = parseGhsDiagramLabel('Genuine Stihl MS271 C-BE / A - Motor housing');
  assert.ok(diag);
  assert.equal(diag.model, 'MS 271 C-BE');
  assert.equal(diag.diagram_code, 'A');
  assert.equal(diag.diagram_title, 'Motor housing');

  // Single-part titles must never be mistaken for diagram labels
  assert.equal(parseGhsDiagramLabel('Genuine Stihl 18" - Chain .325" - 050" - 74 Links - 3695 000 0074 (Rapid Micro)'), null);
  assert.equal(parseGhsDiagramLabel('Genuine Stihl O-ring N 6x1-NBR70 - 9645 945 1761'), null);

  const ghsDiagrams = readJson(path.join(OUT_DIR, 'GHS_DIAGRAMS.json'));
  assert.ok(ghsDiagrams.length >= 400, `Expected >= 400 GHS diagrams, got ${ghsDiagrams.length}`);
  for (const d of ghsDiagrams) {
    assert.ok(d.model && d.canonical_model_id !== 'unknown_model');
    assert.ok(d.diagram_code);
    assert.ok(d.diagram_title);
    assert.ok(d.diagram_page_url);
    assert.ok(d.diagram_identifier);
    assert.equal(d.source_authority, GHS_AUTHORITY);
  }
});

test('Phase 58A — 8. Model-Part & Diagram-Part Fitment Creation', () => {
  const ghsFitments = readJson(path.join(OUT_DIR, 'GHS_FITMENTS.json'));
  assert.ok(ghsFitments.length >= 5000, `Expected >= 5000 GHS fitments, got ${ghsFitments.length}`);

  const withDiagramAndPos = ghsFitments.filter(f => f.diagram_code && f.position_number !== null);
  const withModelLevelNullPos = ghsFitments.filter(f => !f.diagram_code && f.position_number === null);
  assert.ok(withDiagramAndPos.length >= 1000, 'Must extract diagram-level fitments with position_number');
  assert.ok(withModelLevelNullPos.length >= 500, 'Model-level fitments without position must keep position_number = null');
});

test('Phase 58A — 9. Duplicate Part Deduplication (1 Canonical Part -> N Fitments)', () => {
  const partsCatalog = readJson(path.join(DATA_DIR, 'parts_catalog.json'));
  const partNums = partsCatalog.parts.map(p => p.part_number);
  const uniquePartNums = new Set(partNums);
  assert.equal(partNums.length, uniquePartNums.size, 'Zero duplicate canonical part numbers allowed in parts_catalog.json');
  assert.ok(partsCatalog.parts.length > 17082, `Expected catalog expansion beyond 17,082 parts, got ${partsCatalog.parts.length}`);
});

test('Phase 58A — 10. New Model Creation Without Serial Range Fabrication', () => {
  const newModels = readJson(path.join(OUT_DIR, 'GHS_NEW_MODELS.json'));
  const beforeAfter = readJson(path.join(OUT_DIR, 'CATALOG_BEFORE_AFTER.json'));
  const stihlDb = readJson(path.join(DATA_DIR, 'stihl_database.json'));

  assert.ok(newModels.length >= 80, `Expected >= 80 new models from GHS, got ${newModels.length}`);
  assert.equal(beforeAfter.models_before + beforeAfter.new_models, beforeAfter.models_after);
  assert.equal(beforeAfter.serial_ranges_modified, 0);
  assert.equal(stihlDb.model_serial_ranges.length, 8, 'Existing 8 serial ranges must remain 100% untouched');
});

test('Phase 58A — 11. Source URL & Authority Required on Every Part, Fitment & Ledger Record', () => {
  const newParts = readJson(path.join(OUT_DIR, 'GHS_NEW_PARTS.json'));
  const newFitments = readJson(path.join(OUT_DIR, 'GHS_NEW_FITMENTS.json'));
  const sourceLedger = readJson(path.join(DATA_DIR, 'sources', 'ghs_stihl_source_ledger.json'));

  assert.ok(newParts.length >= 500);
  for (const p of newParts) {
    assert.ok(p.source_url && p.source_url.startsWith('https://www.gardenhirespares.co.uk/'));
    assert.equal(p.source_authority, GHS_AUTHORITY);
    assert.equal(p.source_status, GHS_SOURCE_STATUS);
  }

  assert.ok(newFitments.length >= 2000);
  for (const f of newFitments) {
    assert.ok(f.source_url && f.source_url.startsWith('https://www.gardenhirespares.co.uk/'));
    assert.equal(f.source_id, 'ghs');
    assert.equal(f.source_evidence_status, GHS_AUTHORITY);
  }

  assert.equal(sourceLedger.authority, GHS_AUTHORITY);
  assert.equal(sourceLedger.discovery_method, GHS_DISCOVERY_METHOD);
  assert.ok(sourceLedger.records.length >= 5000);
});

test('Phase 58A — 12. Restart / Checkpoint & Zero Duplicate URL Processing', () => {
  const checkpoint = readJson(path.join(OUT_DIR, 'CRAWL_CHECKPOINT.json'));
  const crawlSummary = readJson(path.join(OUT_DIR, 'CRAWL_SUMMARY.json'));
  assert.ok(Array.isArray(checkpoint.visited_urls) && checkpoint.visited_urls.length >= 4000);
  assert.ok(Array.isArray(checkpoint.pending_urls));
  assert.ok(Array.isArray(checkpoint.failed_urls));
  assert.ok(Array.isArray(checkpoint.rounds_completed) && checkpoint.rounds_completed.length >= 2);
  assert.equal(crawlSummary.hard_gates.DUPLICATE_SOURCE_URLS_PROCESSED, 0, 'DUPLICATE_SOURCE_URLS_PROCESSED must be 0');
});

test('Phase 58A — 13. Canonical Rebuild, Safe Amazon Search Fallback & SEO Noindex Protection', () => {
  const newParts = readJson(path.join(OUT_DIR, 'GHS_NEW_PARTS.json'));
  const seoReport = readJson(path.join(OUT_DIR, 'SEO_ELIGIBILITY_REPORT.json'));

  assert.equal(seoReport.automatically_indexed_count, 0, 'Zero newly imported parts may be automatically indexed');
  assert.equal(seoReport.total_newly_imported_parts, newParts.length);

  // Sample 10 newly imported parts: verify PartCatalogResolver resolves them, isPartIndexable is false,
  // and AffiliateOfferResolver generates a safe Amazon.nl search fallback with associate tag srihldecoder2-21
  const prevEnabled = process.env.AMAZON_AFFILIATE_ENABLED;
  const prevTag = process.env.AMAZON_ASSOCIATE_TAG;
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    const affiliateResolver = new AffiliateOfferResolver();
    for (const sample of newParts.slice(0, 10)) {
      assert.equal(isPartIndexable(sample.part_number), false);
      const resolved = PartCatalogResolver.resolvePartNumber(sample.part_number);
      assert.ok(resolved && resolved.part_number === sample.part_number, `PartCatalogResolver must resolve newly imported part ${sample.part_number}`);

      const offers = affiliateResolver.resolveOffers({
        partNumber: sample.part_number,
        partName: sample.part_name
      });
      assert.ok(Array.isArray(offers) && offers.length > 0, `AffiliateOfferResolver must return safe search fallback for ${sample.part_number}`);
      const offer = offers[0];
      assert.equal(offer.match_type, 'SEARCH_LINK');
      assert.ok(offer.url.includes('amazon.nl/s?k='));
      assert.ok(offer.url.includes('tag=srihldecoder2-21'));
    }
  } finally {
    if (prevEnabled === undefined) delete process.env.AMAZON_AFFILIATE_ENABLED;
    else process.env.AMAZON_AFFILIATE_ENABLED = prevEnabled;
    if (prevTag === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevTag;
  }
});

test('Phase 58A — 14. All 17 Required Artifacts Present & Zero Serial Regressions in SQLite DB', () => {
  const requiredArtifacts = [
    'CRAWL_SUMMARY.json',
    'CATEGORY_COVERAGE.json',
    'MODEL_COVERAGE.json',
    'GHS_MODELS.json',
    'GHS_DIAGRAMS.json',
    'GHS_PARTS.json',
    'GHS_FITMENTS.json',
    'GHS_CONFLICTS.json',
    'GHS_NEW_MODELS.json',
    'GHS_NEW_PARTS.json',
    'GHS_NEW_FITMENTS.json',
    'CRAWL_ERRORS.json',
    'CRAWL_CHECKPOINT.json',
    'CATALOG_BEFORE_AFTER.json',
    'CATALOG_INTEGRITY.json',
    'SEO_ELIGIBILITY_REPORT.json',
    'PHASE58A_SUMMARY.json',
    'PHASE58A_REPORT.md'
  ];

  for (const file of requiredArtifacts) {
    const fullPath = path.join(OUT_DIR, file);
    assert.ok(fs.existsSync(fullPath), `Missing required Phase 58A artifact: ${file}`);
  }

  const dbPath = path.join(DATA_DIR, 'stihl_database.db');
  const db = new Database(dbPath, { readonly: true });
  try {
    const partsCount = db.prepare('SELECT COUNT(*) as c FROM parts').get().c;
    const fitmentsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c;
    const rangesCount = db.prepare('SELECT COUNT(*) as c FROM model_serial_ranges').get().c;
    const anchorsCount = db.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;
    const ghsSource = db.prepare("SELECT * FROM parts_sources WHERE source_id = 'ghs'").get();

    const beforeAfter = readJson(path.join(OUT_DIR, 'CATALOG_BEFORE_AFTER.json'));
    const partsDoc = readJson(path.join(DATA_DIR, 'parts_catalog.json'));
    const fitmentsDoc = readJson(path.join(DATA_DIR, 'model_part_fitments.json'));
    assert.equal(partsCount, partsDoc.parts_count, 'SQLite parts table must match parts_catalog.json');
    assert.ok(partsCount >= beforeAfter.parts_after, 'SQLite parts table must be >= Phase 58A parts_after');
    assert.equal(fitmentsCount, fitmentsDoc.fitments_count, 'SQLite model_part_fitments table must match model_part_fitments.json');
    assert.ok(fitmentsCount >= beforeAfter.fitments_after, 'SQLite model_part_fitments table must be >= Phase 58A fitments_after');
    assert.equal(rangesCount, 8, 'SQLite model_serial_ranges must remain 8');
    assert.equal(anchorsCount, 16878, 'SQLite official_serial_anchors must remain 16,878');
    assert.ok(ghsSource && ghsSource.authority_level === GHS_AUTHORITY);
  } finally {
    db.close();
  }
});
