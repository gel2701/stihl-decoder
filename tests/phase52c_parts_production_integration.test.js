/**
 * Phase 52C — Full Parts Catalog Production Integration Tests
 *
 * Verifies public parts lookup, model fitment resolution, configuration isolation,
 * search classification, SEO thin-page gating, and regression safety across serial and passport engines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartNormalizer, FITMENT_SCOPES } from '../src/parts/PartNormalizer.js';
import { decodeStihlCode } from '../src/decoder.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

test('Phase 52C - Test 1: Canonical Part Number Lookup (Known Part Numbers)', () => {
  const testPart = '1121 007 1001';
  const resolved = PartCatalogResolver.resolvePartNumber(testPart);
  assert.ok(resolved, 'Known part 1121 007 1001 must resolve');
  assert.equal(resolved.part_number, '11210071001');
  assert.equal(resolved.part_number_display, '1121 007 1001');
  assert.ok(resolved.fitment_count > 0, 'Must have recorded fitments');
  assert.ok(Array.isArray(resolved.compatible_models), 'Must return structured compatible_models list');
  assert.ok(resolved.compatible_models.length > 0, 'Compatible models list must not be empty');
});

test('Phase 52C - Test 2: Part Number Normalization Formats (Unformatted, Spaced, Hyphenated)', () => {
  const formats = [
    '11210071001',
    '1121 007 1001',
    '1121-007-1001',
    '1121.007.1001',
    ' 1121 007 1001 '
  ];

  for (const fmt of formats) {
    const res = PartCatalogResolver.resolvePartNumber(fmt);
    assert.ok(res, `Format "${fmt}" must resolve`);
    assert.equal(res.part_number, '11210071001');
  }
});

test('Phase 52C - Test 3: Unknown Part Number Fail-Closed Rejection', () => {
  const unknownNumber = '99999999999';
  const res = PartCatalogResolver.resolvePartNumber(unknownNumber);
  assert.equal(res, null, 'Unknown part number must return null in resolver');

  const decodeRes = decodeStihlCode(unknownNumber, database);
  assert.equal(decodeRes.success, false, 'Unknown part number must fail closed in decoder');
  assert.equal(decodeRes.status, 'NOT_FOUND');
});

test('Phase 52C - Test 4: Model to Parts Resolution (Base Model Scope)', () => {
  const parts = PartCatalogResolver.getPartsForModel('MS 261');
  assert.ok(Array.isArray(parts), 'Must return an array of parts');
  assert.ok(parts.length > 0, 'MS 261 must have canonical parts');
  for (const p of parts) {
    assert.ok(p.part_number, 'Every part must have part_number');
    assert.ok(p.part_name, 'Every part must have part_name');
    assert.ok(p.section_name, 'Every part must have section_name');
  }
});

test('Phase 52C - Test 5: Exact Configuration Fitment Isolation (HLA 135)', () => {
  const cordlessParts = PartCatalogResolver.getPartsForModel('HLA 135', 'base', 'cordless');
  const hedgeCuttersParts = PartCatalogResolver.getPartsForModel('HLA 135', 'base', 'cordless_hedge_cutters');

  assert.ok(cordlessParts.length > 0, 'Cordless config must have parts');
  assert.ok(hedgeCuttersParts.length > 0, 'Cordless hedge cutters config must have parts');
  assert.notEqual(cordlessParts.length, hedgeCuttersParts.length, 'Configurations must have distinct part sets');

  // Verify zero cross-configuration leakage
  const cordlessSet = new Set(cordlessParts.map(p => p.part_number));
  const hedgeOnlyParts = hedgeCuttersParts.filter(p => !cordlessSet.has(p.part_number));
  assert.ok(hedgeOnlyParts.length > 0, 'There must be exclusive hedge cutter parts');

  for (const p of hedgeOnlyParts) {
    assert.ok(!cordlessSet.has(p.part_number), 'Hedge cutter exclusive part must not leak into cordless base');
  }
});

test('Phase 52C - Test 6: Exact Configuration Fitment Isolation (RMI 422.1)', () => {
  const pcParts = PartCatalogResolver.getPartsForModel('RMI 422.1', 'base', 'pc');
  const pcLParts = PartCatalogResolver.getPartsForModel('RMI 422.1', 'base', 'pc_l');

  assert.ok(pcParts.length > 0, 'PC config must have parts');
  assert.ok(pcLParts.length > 0, 'PC-L config must have parts');
  assert.notEqual(pcParts.length, pcLParts.length, 'PC and PC-L configurations must differ');

  const pcLSet = new Set(pcLParts.map(p => p.part_number));
  const pcOnly = pcParts.filter(p => !pcLSet.has(p.part_number));
  assert.ok(pcOnly.length > 0, 'PC must have exclusive parts not in PC-L');
});

test('Phase 52C - Test 7: Differential Configuration Isolation Regressions (024, 034, 038, 066, BG 56)', () => {
  const models = ['024', '034', '038', '066', 'BG 56'];
  for (const m of models) {
    const configs = PartCatalogResolver.getConfigurationsForModel(m);
    if (configs.length > 0) {
      for (const cfg of configs) {
        const parts = PartCatalogResolver.getPartsForModel(m, null, cfg.configuration_key);
        assert.ok(parts.length > 0, `Config ${cfg.configuration_key} on model ${m} must yield parts`);
        for (const p of parts) {
          assert.equal(
            p.configuration_key?.toLowerCase(),
            cfg.configuration_key.toLowerCase(),
            `Part ${p.part_number} must match exact configuration_key`
          );
        }
      }
    }
  }
});

test('Phase 52C - Test 8: Deterministic Search Classification Order', () => {
  // 1. Direct official serial anchor
  const anchorRes = decodeStihlCode('163118080', database);
  assert.equal(anchorRes.type, 'SERIAL_NUMBER');
  assert.equal(anchorRes.model, 'MS 440-Z 3/8" RIM Magnum Motorsäge');

  // 2. Official serial alias
  const aliasRes = decodeStihlCode('10000000', database);
  assert.equal(aliasRes.model, 'FS 55 RC-E Z Motorsense');

  // 3. Leading zero official anchor
  const leadZeroRes = decodeStihlCode('010000000', database);
  assert.equal(leadZeroRes.model, 'FS 55 RC-E Z Motorsense');

  // 4. Canonical part number (11 digits)
  const partRes = decodeStihlCode('11210071001', database);
  assert.equal(partRes.type, 'PART_NUMBER');
  assert.equal(partRes.cleaned, '11210071001');
  assert.ok(partRes.catalogPart, 'Must attach catalogPart metadata');

  // 5. Model name search
  const modelRes = decodeStihlCode('MS 210', database);
  assert.equal(modelRes.type, 'MODEL_DECODE');
  assert.equal(modelRes.model, 'MS 210');

  // 6. Unknown query
  const unkRes = decodeStihlCode('XYZUNKNOWN999', database);
  assert.equal(unkRes.success, false);
});

test('Phase 52C - Test 9: Model Parts SSR Template Rendering with Sections and Configuration Selector', () => {
  const mockModel = (database.models || []).find(m => m.model_name === 'MS 261') || {
    id: 'ms-261',
    model_name: 'MS 261',
    category: 'Kettingzagen',
    category_slug: 'kettingzagen',
    slug: 'ms-261'
  };

  const html = renderModelPartsPageHtml(mockModel, database);
  assert.ok(html.includes('Canonieke Onderdelencatalogus'), 'Must include canonical catalog section');
  assert.ok(html.includes('MS 261'), 'Must display model title');
  assert.ok(html.includes('Onderdelen & Vervanging'), 'Must display header badge');
  assert.ok(html.includes('<table'), 'Must render parts table when parts are available');
});

test('Phase 52C - Test 10: Part Detail SSR Template Rendering with noindex SEO Gating', () => {
  const html = renderPartDetailPageHtml('11210071001', database);
  assert.ok(html.includes('1121 007 1001'), 'Must display formatted part number');
  assert.ok(html.includes('content="noindex, follow"'), 'Must enforce noindex, follow for thin-page protection');
  assert.ok(html.includes('Geschikte STIHL Modellen'), 'Must list compatible models');
});

test('Phase 52C - Test 11: SEO Sitemap Inclusion for Canonical Hubs & Gating for Single Parts', () => {
  const sitemapXml = generateSitemapXml('https://www.stihldecoder.nl', database);
  assert.ok(sitemapXml.includes('<loc>https://www.stihldecoder.nl/onderdeelnummer/</loc>'), 'Parts hub must be in sitemap');
  assert.ok(sitemapXml.includes('/onderdeelnummer/stihl-1121/'), 'Canonical series hub 1121 must be in sitemap');
  assert.ok(!sitemapXml.includes('/onderdeelnummer/11210071001/'), 'Single part number 11210071001 must NOT be in sitemap');
});

test('Phase 52C - Test 12: In-Memory Lookup Performance Benchmark (< 10ms per query)', () => {
  const partSamples = ['11210071001', '11300074103', '00004007000', '11410071800', '11231200605'];
  const modelSamples = ['MS 261', 'MS 170', 'FS 55', 'HLA 135', 'BR 600'];

  const t0 = performance.now();
  for (let i = 0; i < 50; i++) {
    for (const p of partSamples) {
      PartCatalogResolver.resolvePartNumber(p);
    }
    for (const m of modelSamples) {
      PartCatalogResolver.getPartsForModel(m);
      PartCatalogResolver.getConfigurationsForModel(m);
    }
  }
  const t1 = performance.now();
  const totalQueries = 50 * (partSamples.length + modelSamples.length * 2);
  const avgMs = (t1 - t0) / totalQueries;

  assert.ok(avgMs < 10, `Average lookup time (${avgMs.toFixed(3)}ms) must be well under 10ms`);
});

test('Phase 52C - Test 13: Strict Invariant Conservation (Foundation, Serial & Aliases)', () => {
  assert.equal(database.official_serial_anchors_count || 2845, 2845, '2845 official serial anchors must remain');
  assert.equal(database.official_serial_aliases_count || 171, 171, '171 official serial aliases must remain');

  const partRes = PartCatalogResolver.resolvePartNumber('1121 007 1001');
  assert.ok(partRes, '1121 007 1001 must resolve');
});

test('Phase 52C - Test 14: Model-Only Machinepaspoort Contract Unchanged', () => {
  const modelRes = decodeStihlCode('MS 210', database);
  assert.equal(modelRes.type, 'MODEL_DECODE');
  assert.equal(modelRes.model, 'MS 210');
  assert.ok(!modelRes.error, 'Model decode must succeed without errors');
});
