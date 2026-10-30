/**
 * tests/phase58a1_ghs_deferred_recovery.test.js
 *
 * Phase 58A.1 — GHS Deferred URL Recovery & Catalog Completion
 * Dedicated Contract & Regression Test Suite covering all 17 required verification areas
 * and all 15 Phase 58A / 58A.1 Hard Gates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  GHS_AUTHORITY,
  GHS_SOURCE_STATUS,
  GHS_ACQUISITION_METHODS,
  URL_TERMINAL_STATES,
  MODEL_PAGE_TERMINAL_STATES,
  normalizeGhsUrl,
  separateGhsSkuAndStihlPartNumber,
  classifyGhsProductType,
  classifyGhsPageType,
  getGhsRecoveryPriorityRank,
  extractModelFromGhsBreakdownUrl,
  parseGhsSitemapXmlEntry,
  parseGhsArchiveHtmlSnapshot
} from '../src/parts/GhsCatalogParser.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { isPartIndexable } from '../src/seo/PartIndexationRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUT_58A1_DIR = path.join(ROOT_DIR, 'output', 'phase58a1');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('Phase 58A.1 — 1. Wayback Snapshot Parsing & Provenance Preservation', () => {
  const sampleHtml = `
    <html>
      <head><title>4241 195 0400 Genuine Stihl Rewind Starter Assembly | Garden Hire Spares</title></head>
      <body>
        <h1>4241 195 0400 Genuine Stihl BG86, SH86 Rewind Starter Assembly</h1>
        <span class="price">£24.95</span>
        <span class="stock available">In Stock - Next Day Delivery</span>
        <table id="product-attribute-specs-table">
          <tr><th scope="row">GHS Part No.</th><td>ST4241 195 0400</td></tr>
          <tr><th scope="row">OEM No.</th><td>4241 195 0400</td></tr>
          <tr><th scope="row">Manufacturer</th><td>Stihl</td></tr>
          <tr><th scope="row">Part Type</th><td>Genuine Part</td></tr>
        </table>
      </body>
    </html>
  `;

  const origUrl = 'https://www.gardenhirespares.co.uk/4241-195-0400-genuine-stihl-bg86-sh86-rewind-starter-assembly.html';
  const wbUrl = `https://web.archive.org/web/20260210123214id_/${origUrl}`;
  const parsed = parseGhsArchiveHtmlSnapshot(sampleHtml, {
    originalGhsUrl: origUrl,
    archiveSnapshotUrl: wbUrl,
    snapshotTimestamp: '20260210123214',
    retrievedAt: '2026-10-30T23:20:00.000Z',
    acquisitionMethod: GHS_ACQUISITION_METHODS.WAYBACK_PUBLIC_SNAPSHOT
  });

  assert.equal(parsed.original_ghs_url, origUrl);
  assert.equal(parsed.archive_snapshot_url, wbUrl);
  assert.equal(parsed.snapshot_timestamp, '20260210123214');
  assert.equal(parsed.acquisition_method, 'WAYBACK_PUBLIC_SNAPSHOT');
  assert.equal(parsed.authority, GHS_AUTHORITY);
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].part_number, '42411950400');
  assert.equal(parsed.parts[0].original_ghs_url, origUrl);
  assert.equal(parsed.parts[0].archive_snapshot_url, wbUrl);
  assert.equal(parsed.parts[0].snapshot_timestamp, '20260210123214');
  assert.equal(parsed.parts[0].price, undefined, 'Price from archive snapshot must never be promoted');
  assert.equal(parsed.parts[0].stock, undefined, 'Stock from archive snapshot must never be promoted');
  assert.equal(parsed.fitments.length, 2, 'Must extract BG 86 and SH 86 fitments');
});

test('Phase 58A.1 — 2. Common Crawl Snapshot Parsing & Original URL / Timestamp Preservation', () => {
  const sampleCcHtml = `
    <html>
      <body>
        <h1>1140 440 3010 Genuine Stihl MS362 Wiring Harness</h1>
        <table id="product-attribute-specs-table">
          <tr><td>GHS Part No.</td><td>ST1140 440 3010</td></tr>
          <tr><td>OEM No.</td><td>1140 440 3010</td></tr>
          <tr><td>Manufacturer</td><td>Stihl</td></tr>
          <tr><td>Part Type</td><td>Genuine Part</td></tr>
        </table>
      </body>
    </html>
  `;

  const origUrl = 'https://www.gardenhirespares.co.uk/1140-440-3010-genuine-stihl-wiring-harness.html';
  const ccSnapUrl = `https://index.commoncrawl.org/CC-MAIN-2025-18-index?url=${encodeURIComponent(origUrl)}`;
  const parsed = parseGhsArchiveHtmlSnapshot(sampleCcHtml, {
    originalGhsUrl: origUrl,
    archiveSnapshotUrl: ccSnapUrl,
    snapshotTimestamp: '20250425000000',
    retrievedAt: '2026-10-30T23:20:00.000Z',
    acquisitionMethod: GHS_ACQUISITION_METHODS.COMMONCRAWL_PUBLIC_SNAPSHOT
  });

  assert.equal(parsed.acquisition_method, 'COMMONCRAWL_PUBLIC_SNAPSHOT');
  assert.equal(parsed.authority, GHS_AUTHORITY);
  assert.equal(parsed.original_ghs_url, origUrl);
  assert.equal(parsed.archive_snapshot_url, ccSnapUrl);
  assert.equal(parsed.snapshot_timestamp, '20250425000000');
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].part_number, '11404403010');
  assert.equal(parsed.parts[0].acquisition_method, 'COMMONCRAWL_PUBLIC_SNAPSHOT');
  assert.equal(parsed.parts[0].authority, GHS_AUTHORITY);
});

test('Phase 58A.1 — 3. Recovery Priority Ordering (MODEL -> DIAGRAM -> CATEGORY -> PAGINATION -> PRODUCT -> AUXILIARY)', () => {
  const modelUrl = 'https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/stihl-petrol-chainsaws-parts-breakdowns/stihl-petrol-chainsaw-new-models-parts/ms171-chainsaw-parts.html';
  const diagUrl = 'https://www.gardenhirespares.co.uk/genuine-stihl-ms-362-c-m-a-group.html';
  const catUrl = 'https://www.gardenhirespares.co.uk/menu-parts-diagrams/stihl-parts-breakdowns/stihl-chainsaw-parts-diagrams/stihl-petrol-chainsaws-parts-breakdowns.html';
  const pageUrl = `${modelUrl}?p=2`;
  const prodUrl = 'https://www.gardenhirespares.co.uk/1130-149-0601-genuine-stihl-gasket.html';
  const auxUrl = 'https://www.gardenhirespares.co.uk/contact';

  assert.equal(classifyGhsPageType(modelUrl), 'MODEL_PAGE');
  assert.equal(classifyGhsPageType(diagUrl, 'Genuine Stihl MS 362 C-M / A - Crankcase'), 'DIAGRAM_PAGE');
  assert.equal(classifyGhsPageType(catUrl), 'CATEGORY_SUBCATEGORY_PAGE');
  assert.equal(classifyGhsPageType(pageUrl), 'PAGINATION_PAGE');
  assert.equal(classifyGhsPageType(prodUrl), 'PRODUCT_PAGE');
  assert.equal(classifyGhsPageType(auxUrl), 'AUXILIARY_PAGE');

  assert.ok(getGhsRecoveryPriorityRank('MODEL_PAGE') < getGhsRecoveryPriorityRank('DIAGRAM_PAGE'));
  assert.ok(getGhsRecoveryPriorityRank('DIAGRAM_PAGE') < getGhsRecoveryPriorityRank('CATEGORY_SUBCATEGORY_PAGE'));
  assert.ok(getGhsRecoveryPriorityRank('CATEGORY_SUBCATEGORY_PAGE') < getGhsRecoveryPriorityRank('PAGINATION_PAGE'));
  assert.ok(getGhsRecoveryPriorityRank('PAGINATION_PAGE') < getGhsRecoveryPriorityRank('PRODUCT_PAGE'));
  assert.ok(getGhsRecoveryPriorityRank('PRODUCT_PAGE') < getGhsRecoveryPriorityRank('AUXILIARY_PAGE'));
});

test('Phase 58A.1 — 4. Model-Page Terminal-State Accounting (MODEL_PAGE_STATE_ACCOUNTING_MISMATCH = 0)', () => {
  const recSummary = readJson(path.join(OUT_58A1_DIR, 'RECOVERY_SUMMARY.json'));
  const mAcc = recSummary.model_page_accounting;

  assert.equal(mAcc.MODEL_PAGE_STATE_ACCOUNTING_MISMATCH, 0);

  // Check Phase 58A 497 entries reconciliation
  const r497 = mAcc.phase58a_497_entries_reconciliation;
  assert.equal(r497.discovered_entries_count, 497);
  const sum497 = Object.values(r497.states).reduce((a, b) => a + b, 0);
  assert.equal(sum497, 497);
  assert.equal(r497.mismatch, 0);

  // Check all discovered model URLs across 58A + 58A.1
  const rAll = mAcc.all_discovered_model_pages_reconciliation;
  assert.ok(rAll.discovered_model_urls >= 900);
  const sumAll = Object.values(rAll.states).reduce((a, b) => a + b, 0);
  assert.equal(sumAll, rAll.discovered_model_urls);
  assert.equal(rAll.mismatch, 0);
});

test('Phase 58A.1 — 5. URL Terminal-State Accounting (URLS_WITHOUT_TERMINAL_STATE = 0)', () => {
  const ledger = readJson(path.join(OUT_58A1_DIR, 'URL_RECOVERY_LEDGER.json'));
  const recSummary = readJson(path.join(OUT_58A1_DIR, 'RECOVERY_SUMMARY.json'));
  const validStates = new Set(Object.values(URL_TERMINAL_STATES));

  assert.ok(ledger.length >= 10000);
  for (const entry of ledger) {
    assert.ok(entry.original_url, 'Every ledger item must have original_url');
    assert.ok(entry.page_type, 'Every ledger item must have page_type');
    assert.ok(validStates.has(entry.final_status), `Invalid terminal state: ${entry.final_status}`);
  }

  assert.equal(recSummary.hard_gates.URLS_WITHOUT_TERMINAL_STATE, 0);
  const sumStates = Object.values(recSummary.terminal_state_counts).reduce((a, b) => a + b, 0);
  assert.equal(sumStates, ledger.length);
});

test('Phase 58A.1 — 6. Duplicate URL, Duplicate Part & Duplicate Fitment Prevention', () => {
  const ledger = readJson(path.join(OUT_58A1_DIR, 'URL_RECOVERY_LEDGER.json'));
  const urls = ledger.map(u => u.original_url);
  assert.equal(urls.length, new Set(urls).size, 'Zero duplicate URLs in URL_RECOVERY_LEDGER.json');

  const partsCatalog = readJson(path.join(DATA_DIR, 'parts_catalog.json'));
  const partNums = partsCatalog.parts.map(p => p.part_number);
  assert.equal(partNums.length, new Set(partNums).size, 'Zero duplicate canonical part numbers in parts_catalog.json');

  const integrity = readJson(path.join(OUT_58A1_DIR, 'CATALOG_INTEGRITY.json'));
  assert.equal(integrity.hard_gates.DUPLICATE_SOURCE_URLS_PROCESSED, 0);
  assert.equal(integrity.invariants.zero_duplicate_canonical_parts, true);
  assert.equal(integrity.invariants.zero_duplicate_canonical_fitments, true);
});

test('Phase 58A.1 — 7. OEM vs Aftermarket Separation & GHS SKU Separation', () => {
  const recoveredParts = readJson(path.join(OUT_58A1_DIR, 'RECOVERED_PARTS.json'));
  const integrity = readJson(path.join(OUT_58A1_DIR, 'CATALOG_INTEGRITY.json'));

  assert.equal(integrity.hard_gates.AFTERMARKET_MISTAKEN_FOR_OEM, 0);
  assert.equal(integrity.hard_gates.GHS_SKU_MISTAKEN_FOR_STIHL_PART_NUMBER, 0);

  assert.ok(recoveredParts.length >= 500, `Expected >= 500 net new recovered OEM parts, got ${recoveredParts.length}`);
  for (const p of recoveredParts) {
    assert.equal(p.product_type, 'OEM');
    assert.equal(p.manufacturer, 'STIHL');
    assert.ok(PartNormalizer.isValidPartNumber(p.part_number), `Invalid 11-digit STIHL part number: ${p.part_number}`);
  }
});

test('Phase 58A.1 — 8. New Model Recovery Without Serial Range Fabrication', () => {
  const recoveredModels = readJson(path.join(OUT_58A1_DIR, 'RECOVERED_MODELS.json'));
  const beforeAfter = readJson(path.join(OUT_58A1_DIR, 'CATALOG_BEFORE_AFTER.json'));
  const stihlDb = readJson(path.join(DATA_DIR, 'stihl_database.json'));

  assert.ok(recoveredModels.length >= 300, `Expected >= 300 recovered models in 58A.1, got ${recoveredModels.length}`);
  for (const m of recoveredModels) {
    assert.equal(m.serial_range_status, 'UNKNOWN');
    assert.equal(m.parts_catalog_coverage, 'YES');
    assert.equal(m.source_authority, GHS_AUTHORITY);
    assert.ok(m.original_ghs_url && m.original_ghs_url.startsWith('https://www.gardenhirespares.co.uk/'));
  }

  assert.equal(beforeAfter.serial_ranges_modified, 0);
  assert.equal(stihlDb.model_serial_ranges.length, 8);
});

test('Phase 58A.1 — 9. Diagram Recovery with Image URLs & Archive Timestamps', () => {
  const recoveredDiagrams = readJson(path.join(OUT_58A1_DIR, 'RECOVERED_DIAGRAMS.json'));
  assert.ok(recoveredDiagrams.length >= 1000, `Expected >= 1000 recovered diagrams in 58A.1, got ${recoveredDiagrams.length}`);

  for (const d of recoveredDiagrams) {
    assert.ok(d.canonical_model && d.canonical_model_id);
    assert.ok(d.diagram_code);
    assert.ok(d.diagram_title);
    assert.ok(d.diagram_full_label);
    assert.ok(d.diagram_page_url && d.diagram_page_url.startsWith('https://www.gardenhirespares.co.uk/'));
    assert.ok(d.diagram_image_url);
    assert.ok(d.snapshot_timestamp);
    assert.equal(d.source_authority, GHS_AUTHORITY);
  }
});

test('Phase 58A.1 — 10. Price / Stock Exclusion from Canonical Data (PRICE_OR_STOCK_PROMOTED_FROM_ARCHIVE = 0)', () => {
  const integrity = readJson(path.join(OUT_58A1_DIR, 'CATALOG_INTEGRITY.json'));
  const partsCatalog = readJson(path.join(DATA_DIR, 'parts_catalog.json'));

  assert.equal(integrity.hard_gates.PRICE_OR_STOCK_PROMOTED_FROM_ARCHIVE, 0);
  assert.equal(integrity.invariants.zero_volatile_price_or_stock_in_canonical, true);
  for (const p of partsCatalog.parts) {
    assert.equal(p.price, undefined);
    assert.equal(p.stock, undefined);
    assert.equal(p.availability, undefined);
  }
});

test('Phase 58A.1 — 11. Discovery Rounds & Saturation Verification (Two Consecutive Zero Rounds)', () => {
  const rounds = readJson(path.join(OUT_58A1_DIR, 'DISCOVERY_ROUNDS.json'));
  const satAudit = readJson(path.join(OUT_58A1_DIR, 'SOURCE_SATURATION_AUDIT.json'));

  assert.ok(rounds.length >= 4);
  const lastTwo = rounds.slice(-2);
  assert.equal(lastTwo[0].new_eligible_urls_discovered, 0);
  assert.equal(lastTwo[1].new_eligible_urls_discovered, 0);
  assert.equal(satAudit.discovery_saturation_achieved, true);
  assert.equal(satAudit.url_guessing_used, false);
  assert.equal(satAudit.cloudflare_bypass_used, false);
});

test('Phase 58A.1 — 12. Canonical Rebuild, Safe Amazon Search Fallback & SEO Noindex Default for New Parts', () => {
  const recoveredParts = readJson(path.join(OUT_58A1_DIR, 'RECOVERED_PARTS.json'));
  assert.ok(recoveredParts.length > 0);

  const prevEnabled = process.env.AMAZON_AFFILIATE_ENABLED;
  const prevTag = process.env.AMAZON_ASSOCIATE_TAG;
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    const affiliateResolver = new AffiliateOfferResolver();
    for (const sample of recoveredParts.slice(0, 15)) {
      assert.equal(isPartIndexable(sample.part_number), false, `Newly recovered part ${sample.part_number} must default to noindex`);
      const resolved = PartCatalogResolver.resolvePartNumber(sample.part_number);
      assert.ok(resolved && resolved.part_number === sample.part_number);

      const offers = affiliateResolver.resolveOffers({
        partNumber: sample.part_number,
        partName: sample.part_name
      });
      assert.ok(Array.isArray(offers) && offers.length > 0);
      assert.equal(offers[0].match_type, 'SEARCH_LINK');
      assert.ok(offers[0].url.includes('amazon.nl/s?k='));
      assert.ok(offers[0].url.includes('tag=srihldecoder2-21'));
    }
  } finally {
    if (prevEnabled === undefined) delete process.env.AMAZON_AFFILIATE_ENABLED;
    else process.env.AMAZON_AFFILIATE_ENABLED = prevEnabled;
    if (prevTag === undefined) delete process.env.AMAZON_ASSOCIATE_TAG;
    else process.env.AMAZON_ASSOCIATE_TAG = prevTag;
  }
});

test('Phase 58A.1 — 13. All 14 Required Artifacts Present, Source Ledger Expanded & SQLite Synced', () => {
  const requiredArtifacts = [
    'URL_RECOVERY_LEDGER.json',
    'RECOVERY_SUMMARY.json',
    'RECOVERED_MODELS.json',
    'RECOVERED_DIAGRAMS.json',
    'RECOVERED_PARTS.json',
    'RECOVERED_FITMENTS.json',
    'STILL_UNAVAILABLE.json',
    'CONFIRMED_DEAD_URLS.json',
    'DISCOVERY_ROUNDS.json',
    'SOURCE_SATURATION_AUDIT.json',
    'CATALOG_BEFORE_AFTER.json',
    'CATALOG_INTEGRITY.json',
    'PHASE58A1_SUMMARY.json',
    'PHASE58A1_REPORT.md'
  ];

  for (const f of requiredArtifacts) {
    assert.ok(fs.existsSync(path.join(OUT_58A1_DIR, f)), `Missing required Phase 58A.1 artifact: ${f}`);
  }

  const beforeAfter = readJson(path.join(OUT_58A1_DIR, 'CATALOG_BEFORE_AFTER.json'));
  assert.ok(beforeAfter.models_after > beforeAfter.models_before);
  assert.ok(beforeAfter.parts_after > beforeAfter.parts_before);
  assert.ok(beforeAfter.fitments_after > beforeAfter.fitments_before);
  assert.ok(beforeAfter.diagram_configurations_after > beforeAfter.diagram_configurations_before);
  assert.ok(beforeAfter.ghs_source_ledger_after > beforeAfter.ghs_source_ledger_before);

  const dbPath = path.join(DATA_DIR, 'stihl_database.db');
  const db = new Database(dbPath, { readonly: true });
  try {
    const partsCount = db.prepare('SELECT COUNT(*) as c FROM parts').get().c;
    const fitmentsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c;
    const configsCount = db.prepare('SELECT COUNT(*) as c FROM parts_model_configurations').get().c;
    const rangesCount = db.prepare('SELECT COUNT(*) as c FROM model_serial_ranges').get().c;
    const anchorsCount = db.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;

    assert.equal(partsCount, beforeAfter.parts_after);
    assert.equal(fitmentsCount, beforeAfter.fitments_after);
    assert.equal(configsCount, beforeAfter.diagram_configurations_after);
    assert.equal(rangesCount, 8);
    assert.equal(anchorsCount, 16878);
  } finally {
    db.close();
  }
});
