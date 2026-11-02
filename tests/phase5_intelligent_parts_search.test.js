import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  searchIntelligentParts,
  normalizeSearchPartNumber,
  classifyPartCategory,
  checkPartSupersession,
  resolvePurchaseOffer,
  enrichSearchResultPart,
  PART_CATEGORIES,
  MACHINE_TYPES
} from '../src/search/IntelligentPartsSearchEngine.js';

import { defaultVerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
process.env.AMAZON_ASSOCIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG || 'srihldecoder2-21';

test('Phase 5 - Test 1: Part Number Input Normalization (Compact, Spaced, Dashed, Dotted)', () => {
  const variations = [
    '11231602050',
    '1123 160 2050',
    '1123-160-2050',
    '1123.160.2050',
    ' 1123  160  2050 '
  ];

  for (const v of variations) {
    const norm = normalizeSearchPartNumber(v);
    assert.ok(norm, `Variation "${v}" must normalize`);
    assert.strictEqual(norm.canonical, '11231602050');
    assert.strictEqual(norm.formatted, '1123 160 2050');
    assert.strictEqual(norm.type, 'EXACT_PART_NUMBER');

    const res = searchIntelligentParts(v, {}, { database });
    assert.strictEqual(res.is_exact_part_lookup, true, `Query "${v}" must be recognized as exact part lookup`);
    assert.ok(res.total_matches >= 1, `Query "${v}" must find exact part match`);
    assert.strictEqual(res.results[0].part_number, '11231602050');
    assert.strictEqual(res.results[0].part_number_display, '1123 160 2050');
  }

  // Series prefix
  const prefixNorm = normalizeSearchPartNumber('1121');
  assert.ok(prefixNorm);
  assert.strictEqual(prefixNorm.canonical, '1121');
  assert.strictEqual(prefixNorm.type, 'SERIES_PREFIX');
});

test('Phase 5 - Test 2: Multilingual Synonyms & Technical Component Search', () => {
  const synonyms = [
    { q: 'luchtfilter', lang: 'nl' },
    { q: 'luftfilter', lang: 'de' },
    { q: 'air filter', lang: 'en' },
    { q: 'carburateur', lang: 'nl' },
    { q: 'vergaser', lang: 'de' },
    { q: 'carburetor', lang: 'en' },
    { q: 'bougie', lang: 'nl' },
    { q: 'zündkerze', lang: 'de' },
    { q: 'spark plug', lang: 'en' },
    { q: 'koppeling', lang: 'nl' },
    { q: 'kupplung', lang: 'de' },
    { q: 'clutch', lang: 'en' }
  ];

  for (const item of synonyms) {
    const res = searchIntelligentParts(item.q, {}, { database });
    assert.ok(res.total_matches > 0, `Search for "${item.q}" (${item.lang}) must return matches`);
    assert.ok(res.results.length > 0, `Search for "${item.q}" must have results on page 1`);
  }
});

test('Phase 5 - Test 3: Supersession & Replacement Relations (Forward & Backward)', () => {
  // 1. Forward supersession: 4203 400 1301 -> superseded by 4203 400 1302
  const fwd = checkPartSupersession('42034001301');
  assert.ok(fwd, '42034001301 must have supersession record');
  assert.strictEqual(fwd.type, 'SUPERSEDED_BY');
  assert.strictEqual(fwd.target_part, '42034001302');
  assert.strictEqual(fwd.target_part_formatted, '4203 400 1302');
  assert.ok(fwd.label.includes('4203 400 1302'));

  const fwdSearch = searchIntelligentParts('4203 400 1301', {}, { database });
  assert.ok(fwdSearch.supersession_notice, 'Search must include supersession_notice');
  assert.strictEqual(fwdSearch.supersession_notice.type, 'SUPERSEDED_BY');
  assert.strictEqual(fwdSearch.supersession_notice.target_part, '42034001302');
  // Must return both the original and the superseding target part
  assert.ok(fwdSearch.results.some(r => r.part_number === '42034001301'), 'Must include original');
  assert.ok(fwdSearch.results.some(r => r.part_number === '42034001302'), 'Must include replacement');

  // 2. Backward supersession: 4203 400 1302 replaces 4203 400 1301
  const bwd = checkPartSupersession('42034001302');
  assert.ok(bwd, '42034001302 must have replacement record');
  assert.strictEqual(bwd.type, 'REPLACES');
  assert.strictEqual(bwd.target_part, '42034001301');
});

test('Phase 5 - Test 4: Model Scoping & Pure Model Queries (MS 260, MS 261, FS 450)', () => {
  // Pure model search MS 260
  const ms260Res = searchIntelligentParts('MS 260', {}, { database });
  assert.ok(ms260Res.total_matches >= 200, 'MS 260 must return all confirmed fitments (>=200)');
  assert.strictEqual(ms260Res.results[0].compatibility_badge, '✓ Bevestigde compatibiliteit');

  // Composite query: model + component
  const compositeRes = searchIntelligentParts('MS 260 luchtfilter', {}, { database });
  assert.ok(compositeRes.total_matches >= 1, 'MS 260 luchtfilter must find component');
  const airFilter = compositeRes.results[0];
  assert.ok(airFilter.part_name.toLowerCase().includes('air filter') || airFilter.part_name.toLowerCase().includes('luchtfilter'));
  assert.ok(airFilter.compatible_models.some(m => m.model_name === 'MS 260' || m.model_id === 'ms_260'));
});

test('Phase 5 - Test 5: Multi-Dimensional Filtering (Machine Type, Category, Compatibility)', () => {
  // 1. Filter by machine_type
  const chainsawsRes = searchIntelligentParts('luchtfilter', { machine_type: 'kettingzagen' }, { database });
  const brushcuttersRes = searchIntelligentParts('luchtfilter', { machine_type: 'bosmaaiers' }, { database });
  assert.ok(chainsawsRes.total_matches > 0, 'Must have chainsaw air filters');
  assert.ok(brushcuttersRes.total_matches > 0, 'Must have brushcutter air filters');
  assert.ok(chainsawsRes.results.every(r => r.machine_type_id === 'kettingzagen'));
  assert.ok(brushcuttersRes.results.every(r => r.machine_type_id === 'bosmaaiers'));

  // 2. Filter by category
  const filterCatRes = searchIntelligentParts('filter', { category: 'filters' }, { database });
  assert.ok(filterCatRes.total_matches > 0);
  assert.ok(filterCatRes.results.every(r => r.category_id === 'filters'));

  // 3. Filter by compatibility
  const confirmedRes = searchIntelligentParts('bougie', { compatibility: 'CONFIRMED' }, { database });
  assert.ok(confirmedRes.total_matches > 0);
  assert.ok(confirmedRes.results.every(r => r.compatibility_status === 'CONFIRMED'));
});

test('Phase 5 - Test 6: Invariant Verification (Amazon Affiliate srihldecoder2-21 & Phrasing Guard)', () => {
  // 1. Fail-closed protection when activation is disabled
  defaultVerifiedOfferRegistry.productionActivationAllowed = false;
  const closedOffer = resolvePurchaseOffer('11104007005', 'Bosch WSR6F Spark Plug');
  assert.ok(closedOffer);
  assert.strictEqual(closedOffer.type, 'SEARCH_FALLBACK', 'Must fail closed to search fallback when productionActivationAllowed is false');

  // 2. Direct offer resolution when pilot is activated
  defaultVerifiedOfferRegistry.productionActivationAllowed = true;
  defaultVerifiedOfferRegistry.activeWhitelist = new Set(['11104007005', '00004007000', '00004007011']);
  defaultVerifiedOfferRegistry.loadFromFile();
  const directOffer = resolvePurchaseOffer('11104007005', 'Bosch WSR6F Spark Plug');
  assert.ok(directOffer);
  assert.strictEqual(directOffer.type, 'DIRECT_ASIN');
  assert.strictEqual(directOffer.is_direct, true);
  assert.ok(directOffer.url.includes('tag=srihldecoder2-21'));
  assert.ok(directOffer.url.includes('dp/B0068M5NAG'));

  // Test search fallback resolution for non-pilot part
  const fallbackOffer = resolvePurchaseOffer('11231602050', 'Stihl Clutch');
  assert.ok(fallbackOffer);
  assert.strictEqual(fallbackOffer.type, 'SEARCH_FALLBACK');
  assert.strictEqual(fallbackOffer.is_direct, false);
  assert.ok(fallbackOffer.url.includes('tag=srihldecoder2-21'));
  assert.ok(fallbackOffer.url.includes('amazon.nl/s?k='));

  // Render HTML and check phrasing invariants
  const html = renderPartsDiscoveryPageHtml('luchtfilter', database, PRIMARY_ORIGIN);
  assert.ok(html.includes('Bevestigde compatibiliteit'), 'Must use "Bevestigde compatibiliteit"');
  assert.ok(!html.includes('Gegarandeerd passend'), 'Forbidden phrase "Gegarandeerd passend" must NOT appear anywhere');
  assert.ok(!html.includes('meest verkocht'), 'Forbidden phrase "meest verkocht" must NOT appear');
  assert.ok(!html.includes('laagste prijs'), 'Forbidden phrase "laagste prijs" must NOT appear');
});

test('Phase 5 - Test 7: Supersession Banner Rendering on Discovery Page', () => {
  const html = renderPartsDiscoveryPageHtml('4203 400 1301', database, PRIMARY_ORIGIN);
  assert.ok(html.includes('Onderdeelvervanging Geverifieerd'), 'Must render supersession alert');
  assert.ok(html.includes('4203 400 1302'), 'Must cite replacement part number 4203 400 1302');
  assert.ok(html.includes('/onderdeelnummer/42034001302/'), 'Must link to replacement part guide');
});

test('Phase 5 - Test 8: Filter Bar Rendering & Pagination Controls', () => {
  const filteredHtml = renderPartsDiscoveryPageHtml('filter', database, PRIMARY_ORIGIN, {
    machine_type: 'kettingzagen',
    category: 'filters',
    page: 1
  });

  assert.ok(filteredHtml.includes('⚡ Filters'), 'Must render filter toolbar');
  assert.ok(filteredHtml.includes('Kettingzagen'), 'Must render machine type filter');
  assert.ok(filteredHtml.includes('Wis filters'), 'Must offer clear filters link when filters applied');
  assert.ok(filteredHtml.includes('Onderdeelcategorie'), 'Must render category filter bar');
});
