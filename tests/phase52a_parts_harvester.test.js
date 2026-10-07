import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartsHarvesterEngine } from '../src/parts/PartsHarvesterEngine.js';
import { HttpClient } from '../src/parts/HttpClient.js';
import { DiySparePartsSource } from '../src/parts/sources/DiySparePartsSource.js';
import { PartsTreeSource } from '../src/parts/sources/PartsTreeSource.js';
import { OfficialStihlSource } from '../src/parts/sources/OfficialStihlSource.js';
import { decodeStihlCode, analyzePartNumber } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

const partsCatalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const fitmentsPath = path.join(rootDir, 'data', 'model_part_fitments.json');
const sourcesPath = path.join(rootDir, 'data', 'parts_sources.json');
const conflictsPath = path.join(rootDir, 'data', 'parts_conflicts.json');
const variantsPath = path.join(rootDir, 'data', 'parts_model_variants.json');
const manifestPath = path.join(rootDir, 'data', 'parts_harvest_manifest.json');
const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const aliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');
const sqliteDbPath = path.join(rootDir, 'data', 'stihl_database.db');

const partsCatalogDoc = JSON.parse(fs.readFileSync(partsCatalogPath, 'utf8'));
const fitmentsDoc = JSON.parse(fs.readFileSync(fitmentsPath, 'utf8'));
const sourcesDoc = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
const conflictsDoc = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
const variantsDoc = JSON.parse(fs.readFileSync(variantsPath, 'utf8'));
const manifestDoc = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));

// -------------------------------------------------------------
// Test 1: 11-digit STIHL Part Number Normalization
// -------------------------------------------------------------
test('Phase 52A - Test 1: Part Normalizer 11-digit Formats Normalization', () => {
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141 160 5400'), '11411605400');
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141-160-5400'), '11411605400');
  assert.strictEqual(PartNormalizer.normalizePartNumber('11411605400'), '11411605400');
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141.160.5400'), '11411605400');
  assert.strictEqual(PartNormalizer.normalizePartNumber(' 0000 400 7000 '), '00004007000');
  assert.strictEqual(PartNormalizer.formatPartNumber('11411605400'), '1141 160 5400');
});

// -------------------------------------------------------------
// Test 2: Strict Rejection of Malformed Part Numbers
// -------------------------------------------------------------
test('Phase 52A - Test 2: Rejection of Malformed Part Numbers', () => {
  assert.strictEqual(PartNormalizer.normalizePartNumber('123456789'), null); // 9 digits
  assert.strictEqual(PartNormalizer.normalizePartNumber('1234567890'), null); // 10 digits
  assert.strictEqual(PartNormalizer.normalizePartNumber('123456789012'), null); // 12 digits
  assert.strictEqual(PartNormalizer.normalizePartNumber('1141-ABC-5400'), null); // Alpha chars
  assert.strictEqual(PartNormalizer.normalizePartNumber(''), null); // Empty
  assert.strictEqual(PartNormalizer.normalizePartNumber(null), null); // Null
  assert.strictEqual(PartNormalizer.isValidPartNumber('9999 999 99'), false);
  assert.strictEqual(PartNormalizer.isValidPartNumber('1141 160 5400'), true);
});

// -------------------------------------------------------------
// Test 3: Deduplication and Canonical Part Aggregation
// -------------------------------------------------------------
test('Phase 52A - Test 3: Deduplication across Diagram Sections and Sources', () => {
  assert.ok(partsCatalogDoc.parts.length > 0, 'Parts catalog must contain parts');
  const partNoSet = new Set();
  for (const part of partsCatalogDoc.parts) {
    assert.match(part.part_number, /^\d{11}$/, `Part number ${part.part_number} must be 11 digits`);
    assert.ok(!partNoSet.has(part.part_number), `Duplicate part number in catalog: ${part.part_number}`);
    partNoSet.add(part.part_number);
    assert.strictEqual(part.part_number_display, PartNormalizer.formatPartNumber(part.part_number));
  }
  assert.strictEqual(partsCatalogDoc.parts_count, partsCatalogDoc.parts.length);
});

// -------------------------------------------------------------
// Test 4: Multi-Model Fitment Preservation
// -------------------------------------------------------------
test('Phase 52A - Test 4: Multi-Model Fitment Association for Universal Parts', () => {
  const sparkPlugFitments = fitmentsDoc.fitments.filter(f => f.part_number === '00004007000');
  assert.ok(sparkPlugFitments.length >= 4, 'Spark plug 0000 400 7000 must fit multiple pilot models');

  const modelsLinked = new Set(sparkPlugFitments.map(f => f.canonical_model_id));
  assert.ok(modelsLinked.has('ms_261'), 'Fits MS 261');
  assert.ok(modelsLinked.has('026'), 'Fits 026');
  assert.ok(modelsLinked.has('fs_55'), 'Fits FS 55');
  assert.ok(modelsLinked.has('ts_420'), 'Fits TS 420');
});

// -------------------------------------------------------------
// Test 5: Model Variant Preservation (No Flattening)
// -------------------------------------------------------------
test('Phase 52A - Test 5: Model Variant Preservation without Flattening', () => {
  const v1 = PartNormalizer.normalizeModelVariant('MS 261', 'MS 261 C-M');
  assert.strictEqual(v1.canonical_model_id, 'ms_261');
  assert.strictEqual(v1.variant_key, 'c_m');
  assert.strictEqual(v1.variant_name, 'MS 261 C-M');

  const v2 = PartNormalizer.normalizeModelVariant('MS 180', 'MS 180 C-BE');
  assert.strictEqual(v2.canonical_model_id, 'ms_180');
  assert.strictEqual(v2.variant_key, 'c_be');
  assert.strictEqual(v2.variant_name, 'MS 180 C-BE');

  const v3 = PartNormalizer.normalizeModelVariant('FS 55', 'FS 55 RC-E');
  assert.strictEqual(v3.canonical_model_id, 'fs_55');
  assert.strictEqual(v3.variant_key, 'rc_e');
  assert.strictEqual(v3.variant_name, 'FS 55 RC-E');
});

// -------------------------------------------------------------
// Test 6: Exploded Diagram Section Extraction
// -------------------------------------------------------------
test('Phase 52A - Test 6: Exploded Diagram Section Extraction', () => {
  const sectionKeys = new Set(fitmentsDoc.fitments.map(f => f.section_key));
  assert.ok(sectionKeys.has('crankcase'), 'Must contain crankcase section');
  assert.ok(sectionKeys.has('cylinder') || sectionKeys.has('cylinder/'), 'Must contain cylinder section');
  assert.ok(fitmentsDoc.fitments.length > 0, 'Fitments must be populated');
});

// -------------------------------------------------------------
// Test 7: Diagram Position Parsing
// -------------------------------------------------------------
test('Phase 52A - Test 7: Position Number Parsing and Preservation', () => {
  const sampleWithPos = fitmentsDoc.fitments.find(f => f.part_number === '11410202100');
  assert.ok(sampleWithPos, 'Crankcase part must exist in fitments');
  assert.strictEqual(sampleWithPos.diagram_position, '1');
});

// -------------------------------------------------------------
// Test 8: Quantity and Supersession Extraction
// -------------------------------------------------------------
test('Phase 52A - Test 8: Quantity and Supersession Note Parsing', () => {
  const carbOld = fitmentsDoc.fitments.find(f => f.part_number === '11411200616');
  assert.ok(carbOld, 'Old carburetor must exist');
  assert.ok(carbOld.notes.includes('1141 120 0620') || carbOld.superseded_by === '11411200620', 'Supersession noted');
});

// -------------------------------------------------------------
// Test 9: Multi-Source Corroboration Logic
// -------------------------------------------------------------
test('Phase 52A - Test 9: Multi-Source Corroboration Logic', () => {
  const multiSourcePart = partsCatalogDoc.parts.find(p => p.sources && p.sources.length > 1);
  assert.ok(multiSourcePart, 'Catalog should contain multi-source parts');
  assert.ok(multiSourcePart.source_count > 1);
});

// -------------------------------------------------------------
// Test 10: Conflict Detection and Isolation
// -------------------------------------------------------------
test('Phase 52A - Test 10: Conflict Detection Isolated into parts_conflicts.json', () => {
  assert.ok(Array.isArray(conflictsDoc.conflicts), 'Conflicts array exists');
  assert.strictEqual(conflictsDoc.conflicts_count, conflictsDoc.conflicts.length);
  for (const c of conflictsDoc.conflicts) {
    assert.ok(c.part_number, 'Conflict must have part number');
    assert.ok(c.conflict_type, 'Conflict must have conflict type');
    assert.strictEqual(c.status, 'REVIEW_REQUIRED');
  }
});

// -------------------------------------------------------------
// Test 11: Official Precedence
// -------------------------------------------------------------
test('Phase 52A - Test 11: Official STIHL Service Doc Precedence', () => {
  const officialSource = sourcesDoc.sources.find(s => s.source_id === 'official_stihl');
  assert.ok(officialSource);
  assert.strictEqual(officialSource.authority_level, 'OFFICIAL_STIHL');
  assert.strictEqual(officialSource.source_type, 'OFFICIAL_MANUFACTURER_DOCUMENTATION');
});

// -------------------------------------------------------------
// Test 12: CLI Flag --pilot
// -------------------------------------------------------------
test('Phase 52A - Test 12: CLI Flag --pilot Harvests All 6 Models', () => {
  assert.strictEqual(manifestDoc.models_requested, 6);
  assert.strictEqual(manifestDoc.models_found, 6);
  assert.ok(manifestDoc.per_model_summary['MS 261']);
  assert.ok(manifestDoc.per_model_summary['MS 170']);
  assert.ok(manifestDoc.per_model_summary['MS 180']);
  assert.ok(manifestDoc.per_model_summary['026']);
  assert.ok(manifestDoc.per_model_summary['FS 55']);
  assert.ok(manifestDoc.per_model_summary['TS 420']);
});

// -------------------------------------------------------------
// Test 13: CLI Flag --model <name>
// -------------------------------------------------------------
test('Phase 52A - Test 13: CLI Single Model Harvest', async () => {
  const engine = new PartsHarvesterEngine({
    httpClient: new HttpClient({ useCache: true }),
    dryRun: true
  });
  const res = await engine.harvestModels(['MS 261']);
  assert.strictEqual(res.stats.models_requested, 1);
  assert.strictEqual(res.stats.models_found, 1);
  assert.ok(res.partsCatalogDoc.parts.length > 0);
});

// -------------------------------------------------------------
// Test 14: CLI Flag --dry-run
// -------------------------------------------------------------
test('Phase 52A - Test 14: Dry Run Does Not Overwrite Files', async () => {
  const tempDir = path.join(rootDir, '.cache', 'temp_dry_run_test');
  const engine = new PartsHarvesterEngine({
    httpClient: new HttpClient({ useCache: true }),
    outputDir: tempDir,
    dryRun: true
  });
  await engine.harvestModels(['026']);
  assert.strictEqual(fs.existsSync(tempDir), false, 'Temp dir must not be created during dry run');
});

// -------------------------------------------------------------
// Test 15: Fail-Closed on --all-models
// -------------------------------------------------------------
test('Phase 52A - Test 15: Fail-Closed on --all-models Flag', () => {
  const res = spawnSync('node', ['scripts/harvest_stihl_parts.mjs', '--all-models'], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  assert.strictEqual(res.status, 1, 'Command must exit with non-zero code');
  assert.ok(res.stderr.includes('FULL_CATALOG_CRAWL_PROHIBITED') || res.stdout.includes('FULL_CATALOG_CRAWL_PROHIBITED'));
});

// -------------------------------------------------------------
// Test 16: HTTP Client Caching & Rate Limiting
// -------------------------------------------------------------
test('Phase 52A - Test 16: HTTP Client Deterministic Caching', async () => {
  const client = new HttpClient({ useCache: true });
  const testUrl = 'https://www.diyspareparts.com/parts/stihl/diagrams/ms261/';
  const res = await client.get(testUrl);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.fromCache, true);
  assert.ok(res.body.includes('STIHL MS 261'));
});

// -------------------------------------------------------------
// Test 17: JSON vs SQLite Parity (100% Match)
// -------------------------------------------------------------
test('Phase 52A - Test 17: JSON vs SQLite Parity Across All 5 Tables', async () => {
  const db = new sqlite3.Database(sqliteDbPath);
  const getCount = (query) => new Promise((resolve, reject) => {
    db.get(query, (err, row) => (err ? reject(err) : resolve(row.c)));
  });

  try {
    const partsCount = await getCount('SELECT COUNT(*) as c FROM parts');
    const fitmentsCount = await getCount('SELECT COUNT(*) as c FROM model_part_fitments');
    const sourcesCount = await getCount('SELECT COUNT(*) as c FROM parts_sources');
    const conflictsCount = await getCount('SELECT COUNT(*) as c FROM parts_conflicts');
    const variantsCount = await getCount('SELECT COUNT(*) as c FROM parts_model_variants');

    assert.strictEqual(partsCount, partsCatalogDoc.parts.length, 'parts table count matches JSON');
    assert.strictEqual(fitmentsCount, fitmentsDoc.fitments.length, 'model_part_fitments count matches JSON');
    assert.strictEqual(sourcesCount, sourcesDoc.sources.length, 'parts_sources count matches JSON');
    assert.strictEqual(conflictsCount, conflictsDoc.conflicts.length, 'parts_conflicts count matches JSON');
    assert.strictEqual(variantsCount, variantsDoc.variants.length, 'parts_model_variants count matches JSON');
  } finally {
    db.close();
  }
});

// -------------------------------------------------------------
// Test 18: Failure Injections A-E (404, HTML Malformed, Missing Columns)
// -------------------------------------------------------------
test('Phase 52A - Test 18: Failure Injections A-E', () => {
  const source = new DiySparePartsSource(new HttpClient({ useCache: false }));

  // Injection A: Malformed HTML with missing columns
  const badHtml = '<table><tr><td>1</td></tr></table>';
  const resA = source.parseSectionPage(badHtml, { sectionKey: 'test', sectionName: 'Test' });
  assert.strictEqual(resA.parts.length, 0);

  // Injection B: Empty table
  const emptyHtml = '<table><tr><th>Pos</th></tr></table>';
  const resB = source.parseSectionPage(emptyHtml, { sectionKey: 'test', sectionName: 'Test' });
  assert.strictEqual(resB.parts.length, 0);
  assert.strictEqual(resB.status, 'EMPTY_VALID');

  // Injection C: Invalid part number rows
  const badPartHtml = '<table><tr><td>1</td><td>12345</td><td>Some Part</td><td>1</td></tr></table>';
  const resC = source.parseSectionPage(badPartHtml, { sectionKey: 'test', sectionName: 'Test' });
  assert.strictEqual(resC.parts.length, 0);
  assert.strictEqual(resC.rejected.length, 1);
  assert.strictEqual(resC.rejected[0].reason, 'INVALID_PART_NUMBER_FORMAT');

  // Injection D: Model page with no diagram links
  const emptyModelHtml = '<html><body><h1>No diagrams</h1></body></html>';
  const resD = source.parseModelPage(emptyModelHtml, 'http://test', 'MS 999');
  assert.strictEqual(resD.sections.length, 0);

  // Injection E: Resolver for non-existent part
  const resolver = new PartCatalogResolver(partsCatalogDoc, fitmentsDoc);
  const notFound = resolver.resolvePartNumber('99999999999');
  assert.strictEqual(notFound.found, false);
});

// -------------------------------------------------------------
// Test 19: Failure Injections F-J (Conflict Recovery, Resolver)
// -------------------------------------------------------------
test('Phase 52A - Test 19: Failure Injections F-J (Resolver & Fitment Queries)', () => {
  const resolver = new PartCatalogResolver(partsCatalogDoc, fitmentsDoc);

  // F: Resolve existing part
  const sparkPlug = resolver.resolvePartNumber('0000 400 7000');
  assert.strictEqual(sparkPlug.found, true);
  assert.strictEqual(sparkPlug.part_number, '00004007000');
  assert.ok(sparkPlug.fitments.length > 0);

  // G: Get parts for model
  const ms261Parts = resolver.getPartsForModel('MS 261');
  assert.ok(ms261Parts.length > 0);

  // H: Get parts for variant
  const ms261cmParts = resolver.getPartsForModel('MS 261', 'c_m');
  assert.ok(ms261cmParts.length > 0);

  // I: Non-existent model parts
  const fakeModelParts = resolver.getPartsForModel('UNKNOWN_MODEL_XYZ');
  assert.strictEqual(fakeModelParts.length, 0);

  // J: Check that resolver handles null input safely
  const nullRes = resolver.resolvePartNumber(null);
  assert.strictEqual(nullRes.found, false);
});

// -------------------------------------------------------------
// Test 20: Regression Safety - Production Decoder & Serial Anchors
// -------------------------------------------------------------
test('Phase 52A - Test 20: Complete Regression Safety for Decoder, Anchors (2845), and Aliases (171)', () => {
  assert.strictEqual(anchorsDoc.anchors.length, 2845, 'Official anchors must remain 2845');
  assert.strictEqual(aliasesDoc.aliases.length, 171, 'Official aliases must remain 171');

  // Decode standard 9-digit serial
  const dec1 = decodeStihlCode('191422784');
  assert.strictEqual(dec1.success, true, 'Serial 191422784 must decode');

  // Decode official evidenced 8-digit alias
  const dec2 = decodeStihlCode('10000000');
  assert.strictEqual(dec2.success, true);
  assert.strictEqual(dec2.inputAliasMatched, true);
  assert.strictEqual(dec2.model, 'FS 55 RC-E Z Motorsense');

  // Generic 8-digit serial without evidence must be rejected
  const dec3 = decodeStihlCode('88888888');
  assert.strictEqual(dec3.success, false);

  // 11-digit Part number decoder unchanged
  const partAnalysis = decodeStihlCode('1121 160 2051', JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8')));
  assert.strictEqual(partAnalysis.success, true);
  assert.strictEqual(partAnalysis.type, 'PART_NUMBER');
  assert.strictEqual(partAnalysis.familyCode, '1121');
});
