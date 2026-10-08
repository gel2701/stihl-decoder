import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

import { PartNormalizer, FITMENT_SCOPES } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartsHarvesterEngine } from '../src/parts/PartsHarvesterEngine.js';
import { HttpClient } from '../src/parts/HttpClient.js';
import { SparePartsWorldSource } from '../src/parts/sources/SparePartsWorldSource.js';
import { DiySparePartsSource } from '../src/parts/sources/DiySparePartsSource.js';
import { PartsTreeSource } from '../src/parts/sources/PartsTreeSource.js';
import { OfficialStihlSource } from '../src/parts/sources/OfficialStihlSource.js';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

const partsCatalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const fitmentsPath = path.join(rootDir, 'data', 'model_part_fitments.json');
const evidencePath = path.join(rootDir, 'data', 'part_fitment_evidence.json');
const sourcesPath = path.join(rootDir, 'data', 'parts_sources.json');
const conflictsPath = path.join(rootDir, 'data', 'parts_conflicts.json');
const variantsPath = path.join(rootDir, 'data', 'parts_model_variants.json');
const manifestPath = path.join(rootDir, 'data', 'parts_harvest_manifest.json');
const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const aliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');
const sqliteDbPath = path.join(rootDir, 'data', 'stihl_database.db');

const partsCatalogDoc = JSON.parse(fs.readFileSync(partsCatalogPath, 'utf8'));
const fitmentsDoc = JSON.parse(fs.readFileSync(fitmentsPath, 'utf8'));
const evidenceDoc = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
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
// Test 4: Section Key Normalization
// -------------------------------------------------------------
test('Phase 52A - Test 4: Section Key Normalization and Slash Stripping', () => {
  assert.strictEqual(PartNormalizer.normalizeSectionKey('cylinder/'), 'cylinder');
  assert.strictEqual(PartNormalizer.normalizeSectionKey('/crankcase/'), 'crankcase');
  assert.strictEqual(PartNormalizer.normalizeSectionKey('Air filter, Carburetor'), 'air_filter_carburetor');
  assert.strictEqual(PartNormalizer.normalizeSectionKey('Clutch & Chain Brake'), 'clutch_chain_brake');
  assert.strictEqual(PartNormalizer.normalizeSectionKey(''), 'general');
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
// Test 6: Part Name Conflict Comparison Classifications
// -------------------------------------------------------------
test('Phase 52A - Test 6: Deterministic Part Name Comparison', () => {
  // NORMALIZED_EQUIVALENT
  const eq = PartNormalizer.comparePartNames('HD2 Air filter', 'Air Filter HD2');
  assert.strictEqual(eq.isConflict, false);
  assert.strictEqual(eq.classification, 'NORMALIZED_EQUIVALENT');

  // DESCRIPTION_ENRICHMENT
  const enr = PartNormalizer.comparePartNames('Service Kit 7', 'Service Kit 7 (Air Filter, Spark Plug, Fuel Filter)');
  assert.strictEqual(enr.isConflict, false);
  assert.strictEqual(enr.classification, 'DESCRIPTION_ENRICHMENT');

  // TRUE_CONFLICT
  const conf = PartNormalizer.comparePartNames('Spark plug NGK CMR6H', 'Cylinder with piston Ø 44 mm');
  assert.strictEqual(conf.isConflict, true);
  assert.strictEqual(conf.classification, 'TRUE_CONFLICT');
});

// -------------------------------------------------------------
// Test 7: HTTP Client LIVE Mode Refuses Fixture Fallback
// -------------------------------------------------------------
test('Phase 52A - Test 7: LIVE Mode Refuses Fixture Fallback', () => {
  const liveClient = new HttpClient({ mode: 'LIVE', useCache: false });
  assert.strictEqual(liveClient.mode, 'LIVE');
  const cached = liveClient.readFromCache('https://www.example.com/not-in-live-cache');
  assert.strictEqual(cached, null, 'LIVE mode must never return fixture cache');
});

// -------------------------------------------------------------
// Test 8: HTTP Client FIXTURE Mode Does Not Make Network Requests
// -------------------------------------------------------------
test('Phase 52A - Test 8: FIXTURE Mode Operates Fully Offline', async () => {
  const fixtureClient = new HttpClient({ mode: 'FIXTURE', useCache: true });
  assert.strictEqual(fixtureClient.mode, 'FIXTURE');
  const res = await fixtureClient.get('https://www.example.com/unmocked-url-test');
  assert.strictEqual(res.fromCache, false);
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.mode, 'FIXTURE');
});

// -------------------------------------------------------------
// Test 9: Granular Part Fitment Evidence Observations
// -------------------------------------------------------------
test('Phase 52A - Test 9: Granular Part Fitment Evidence Structure with URLs and Status', () => {
  assert.ok(evidenceDoc.observations.length > 0, 'Must have fitment evidence observations');
  assert.strictEqual(evidenceDoc.observations_count, evidenceDoc.observations.length);
  for (const obs of evidenceDoc.observations) {
    assert.ok(obs.evidence_id, 'Must have evidence_id');
    assert.match(obs.part_number, /^\d{11}$/, 'Part number must be 11 digits');
    assert.ok(obs.canonical_model_id, 'Must have canonical_model_id');
    assert.ok(obs.source_id, 'Must have source_id');
    assert.ok(obs.source_url, 'Must have source_url');
    assert.ok(obs.requested_url, 'Must have requested_url');
    assert.ok(obs.final_url, 'Must have final_url');
    assert.ok(obs.http_status, 'Must have http_status');
    assert.ok(obs.fitment_scope, 'Must have fitment_scope');
  }
});

// -------------------------------------------------------------
// Test 10: Conflict Deduplication & Unique Conflict IDs
// -------------------------------------------------------------
test('Phase 52A - Test 10: Conflict Deduplication and Unique IDs', () => {
  const idSet = new Set();
  for (const c of conflictsDoc.conflicts) {
    assert.ok(!idSet.has(c.conflict_id), `Duplicate conflict ID found: ${c.conflict_id}`);
    idSet.add(c.conflict_id);
    assert.ok(c.part_number, 'Conflict must have part number');
    assert.ok(c.conflict_type, 'Conflict must have conflict type');
  }
  assert.strictEqual(conflictsDoc.conflicts_count, conflictsDoc.conflicts.length);
});

// -------------------------------------------------------------
// Test 11: Official STIHL Service Doc Precedence & Valid URLs
// -------------------------------------------------------------
test('Phase 52A - Test 11: Official STIHL Precedence and Valid Provenance', () => {
  const officialSource = sourcesDoc.sources.find(s => s.source_id === 'official_stihl');
  assert.ok(officialSource);
  assert.strictEqual(officialSource.authority_level, 'OFFICIAL_STIHL');
  assert.strictEqual(officialSource.source_type, 'OFFICIAL_MANUFACTURER_DOCUMENTATION');

  for (const f of fitmentsDoc.fitments.filter(x => x.source_id === 'official_stihl')) {
    assert.ok(!f.source_url.includes('service-kits-official'), 'No invented placeholder URLs');
    assert.ok(f.source_url.startsWith('https://www.stihl.'), 'Valid STIHL source URL');
  }
});

// -------------------------------------------------------------
// Test 12: CLI Flag --pilot Manifest Integrity
// -------------------------------------------------------------
test('Phase 52A - Test 12: CLI Flag --pilot Manifest Integrity', () => {
  assert.strictEqual(manifestDoc.models_requested, 6);
  assert.strictEqual(manifestDoc.models_found, 6);
  assert.strictEqual(manifestDoc.synthetic_canonical_records, 0, 'SYNTHETIC_CANONICAL_RECORDS must be 0');
  assert.ok(manifestDoc.per_model_summary['MS 261']);
  assert.ok(manifestDoc.per_model_summary['MS 170']);
  assert.ok(manifestDoc.per_model_summary['MS 180']);
  assert.ok(manifestDoc.per_model_summary['026']);
  assert.ok(manifestDoc.per_model_summary['FS 55']);
  assert.ok(manifestDoc.per_model_summary['TS 420']);
});

// -------------------------------------------------------------
// Test 13: CLI Flag --model <name> (Offline Engine Test)
// -------------------------------------------------------------
test('Phase 52A - Test 13: CLI Single Model Harvest (Offline Engine)', async () => {
  const engine = new PartsHarvesterEngine({
    httpClient: new HttpClient({ mode: 'FIXTURE', useCache: true }),
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
    httpClient: new HttpClient({ mode: 'FIXTURE', useCache: true }),
    outputDir: tempDir,
    dryRun: true
  });
  await engine.harvestModels(['026']);
  assert.strictEqual(fs.existsSync(tempDir), false, 'Temp dir must not be created during dry run');
});

// -------------------------------------------------------------
// Test 15: Fail-Closed on --all-models Flag
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
// Test 16: Deterministic Canonical Output
// -------------------------------------------------------------
test('Phase 52A - Test 16: Deterministic Output Across Successive Runs', async () => {
  const engine1 = new PartsHarvesterEngine({
    httpClient: new HttpClient({ mode: 'LIVE', useCache: true, refresh: false }),
    dryRun: true
  });
  const res1 = await engine1.harvestModels(['MS 261', 'MS 170']);

  const engine2 = new PartsHarvesterEngine({
    httpClient: new HttpClient({ mode: 'LIVE', useCache: true, refresh: false }),
    dryRun: true
  });
  const res2 = await engine2.harvestModels(['MS 261', 'MS 170']);

  assert.strictEqual(
    JSON.stringify(res1.partsCatalogDoc),
    JSON.stringify(res2.partsCatalogDoc),
    'partsCatalogDoc must be 100% deterministic'
  );
  assert.strictEqual(
    JSON.stringify(res1.modelPartFitmentsDoc),
    JSON.stringify(res2.modelPartFitmentsDoc),
    'modelPartFitmentsDoc must be 100% deterministic'
  );
});

// -------------------------------------------------------------
// Test 17: JSON vs SQLite Parity (100% Match Across All Tables)
// -------------------------------------------------------------
test('Phase 52A - Test 17: JSON vs SQLite Parity Across All 6 Parts Tables', async () => {
  const db = new sqlite3.Database(sqliteDbPath);
  const getCount = (query) => new Promise((resolve, reject) => {
    db.get(query, (err, row) => (err ? reject(err) : resolve(row.c)));
  });

  try {
    const partsCount = await getCount('SELECT COUNT(*) as c FROM parts');
    const fitmentsCount = await getCount('SELECT COUNT(*) as c FROM model_part_fitments');
    const evidenceCount = await getCount('SELECT COUNT(*) as c FROM part_fitment_evidence');
    const sourcesCount = await getCount('SELECT COUNT(*) as c FROM parts_sources');
    const conflictsCount = await getCount('SELECT COUNT(*) as c FROM parts_conflicts');
    const variantsCount = await getCount('SELECT COUNT(*) as c FROM parts_model_variants');

    assert.strictEqual(partsCount, partsCatalogDoc.parts.length, 'parts table count matches JSON');
    assert.strictEqual(fitmentsCount, fitmentsDoc.fitments.length, 'model_part_fitments count matches JSON');
    assert.strictEqual(evidenceCount, evidenceDoc.observations.length, 'part_fitment_evidence count matches JSON');
    assert.strictEqual(sourcesCount, sourcesDoc.sources.length, 'parts_sources count matches JSON');
    assert.strictEqual(conflictsCount, conflictsDoc.conflicts.length, 'parts_conflicts count matches JSON');
    assert.strictEqual(variantsCount, variantsDoc.variants.length, 'parts_model_variants count matches JSON');
  } finally {
    db.close();
  }
});

// -------------------------------------------------------------
// Test 18: Failure Injections A-E (HTML Malformed, Missing Columns, 404)
// -------------------------------------------------------------
test('Phase 52A - Test 18: Failure Injections A-E (Source Parsing Resilience)', () => {
  const source = new DiySparePartsSource(new HttpClient({ mode: 'FIXTURE' }));

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
// Test 19: Spark Plug Part Identity Investigation (0000 400 7000 vs 1110 400 7005)
// -------------------------------------------------------------
test('Phase 52A - Test 19: Spark Plug Identity Verification (0000 400 7000 is NGK CMR6H, not Bosch WSR6F)', () => {
  const resolver = new PartCatalogResolver(partsCatalogDoc, fitmentsDoc);

  const cmr6h = resolver.resolvePartNumber('0000 400 7000');
  assert.strictEqual(cmr6h.found, true);
  assert.strictEqual(cmr6h.part_number, '00004007000');
  assert.ok(cmr6h.part_name.includes('NGK CMR6H'));

  const wsr6f = resolver.resolvePartNumber('1110 400 7005');
  assert.strictEqual(wsr6f.found, true);
  assert.strictEqual(wsr6f.part_number, '11104007005');
  assert.ok(wsr6f.part_name.includes('Bosch WSR6F'));
});

// -------------------------------------------------------------
// Test 20: Regression Safety - Production Decoder & Serial Anchors (2845) & Aliases (171)
// -------------------------------------------------------------
test('Phase 52A - Test 20: Complete Regression Safety for Decoder, Anchors (2845), and Aliases (171)', () => {
  assert.strictEqual(anchorsDoc.anchors.length, 2845, 'Official anchors must remain 2845');
  assert.strictEqual(aliasesDoc.aliases.length, 171, 'Official aliases must remain 171');

  const dec1 = decodeStihlCode('191422784');
  assert.strictEqual(dec1.success, true, 'Serial 191422784 must decode');

  const dec2 = decodeStihlCode('10000000');
  assert.strictEqual(dec2.success, true);
  assert.strictEqual(dec2.inputAliasMatched, true);
  assert.strictEqual(dec2.model, 'FS 55 RC-E Z Motorsense');

  const dec3 = decodeStihlCode('88888888');
  assert.strictEqual(dec3.success, false);

  const partAnalysis = decodeStihlCode('1121 160 2051', JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8')));
  assert.strictEqual(partAnalysis.success, true);
  assert.strictEqual(partAnalysis.type, 'PART_NUMBER');
  assert.strictEqual(partAnalysis.familyCode, '1121');
});

// -------------------------------------------------------------
// Test 21: Official Entry Without Response SHA-256 Rejected
// -------------------------------------------------------------
test('Phase 52A-R3 - Test 21: Official Entry Without Response SHA-256 Rejected', () => {
  const source = new OfficialStihlSource();
  const invalidNoSha = {
    part_number: '11400074101',
    part_name: 'Test Kit',
    models: ['MS 261'],
    source_url: 'https://www.stihl.nl/test',
    verification_status: 'OFFICIAL_SOURCE_VERIFIED'
  };
  assert.strictEqual(source.isValidOfficialRecord(invalidNoSha), false);
});

// -------------------------------------------------------------
// Test 22: Official Source URL Mismatch Rejected
// -------------------------------------------------------------
test('Phase 52A-R3 - Test 22: Official Source URL Non-STIHL Mismatch Rejected', () => {
  const source = new OfficialStihlSource();
  const invalidUrl = {
    part_number: '11400074101',
    part_name: 'Test Kit',
    models: ['MS 261'],
    source_url: 'https://www.thirdparty.com/test',
    response_sha256: '35feb83f556080c13f105ae8528901e90088f817dfbdb526c35e477161b4e68b',
    verification_status: 'OFFICIAL_SOURCE_VERIFIED'
  };
  assert.strictEqual(source.isValidOfficialRecord(invalidUrl), false);
});

// -------------------------------------------------------------
// Test 23: Erroneous MS 261 Service Kit 14 Completely Removed
// -------------------------------------------------------------
test('Phase 52A-R3 - Test 23: Erroneous MS 261 Service Kit 14 (1141 007 1800) Removed', async () => {
  const source = new OfficialStihlSource();
  const parts = await source.getOfficialPartsForModel('MS 261');
  const hasBadKit = parts.some(p => p.part_number === '11410071800');
  assert.strictEqual(hasBadKit, false, 'Erroneous 1141 007 1800 must be removed from MS 261');

  const hasCorrectKit = parts.some(p => p.part_number === '11400074101');
  assert.strictEqual(hasCorrectKit, true, 'Correct Service Kit 11 (1140 007 4101) must be present');
});

// -------------------------------------------------------------
// Test 24: Application-Specific Conditions Preserved for MS 170/180
// -------------------------------------------------------------
test('Phase 52A-R3 - Test 24: Application-Specific Fitment Conditions Preserved', async () => {
  const source = new OfficialStihlSource();
  const parts = await source.getOfficialPartsForModel('MS 170');
  const sk6 = parts.find(p => p.part_number === '11300074100');
  assert.ok(sk6);
  assert.strictEqual(sk6.fitment_scope, FITMENT_SCOPES.APPLICATION_SPECIFIC);
  assert.ok(sk6.variant_condition.includes('Pre-2-MIX'));

  const sk45 = parts.find(p => p.part_number === '11300074103');
  assert.ok(sk45);
  assert.strictEqual(sk45.fitment_scope, FITMENT_SCOPES.APPLICATION_SPECIFIC);
  assert.ok(sk45.variant_condition.includes('2-MIX'));
});

// -------------------------------------------------------------
// Test 25: Source Harvestability Matrix Status Integrity
// -------------------------------------------------------------
test('Phase 52A-R3 - Test 25: Parts Source Harvestability Matrix Status Integrity', () => {
  const harvestabilityPath = path.join(rootDir, 'data', 'parts_source_harvestability.json');
  assert.ok(fs.existsSync(harvestabilityPath), 'parts_source_harvestability.json must exist');
  const matrix = JSON.parse(fs.readFileSync(harvestabilityPath, 'utf8'));

  const spw = matrix.sources.find(s => s.source_id === 'sparepartsworld');
  assert.ok(spw);
  assert.strictEqual(spw.harvestable, true);
  assert.strictEqual(spw.model_http_status, 200);

  const diy = matrix.sources.find(s => s.source_id === 'diyspareparts');
  assert.ok(diy);
  assert.strictEqual(diy.harvestable, false);
  assert.strictEqual(diy.reason, 'WAF_BLOCKED');

  const pt = matrix.sources.find(s => s.source_id === 'partstree');
  assert.ok(pt);
  assert.strictEqual(pt.harvestable, false);
  assert.strictEqual(pt.reason, 'AUTOMATION_BLOCKED');
});

// -------------------------------------------------------------
// Test 26: Scalability Gate - Models Live Discovered vs Official Only
// -------------------------------------------------------------
test('Phase 52A-R3 - Test 26: Models Live Discovered vs Official Only Tracking', () => {
  assert.strictEqual(manifestDoc.models_requested, 6);
  assert.strictEqual(manifestDoc.models_live_discovered, 6);
  assert.strictEqual(manifestDoc.models_official_evidence_only, 0);
  assert.strictEqual(manifestDoc.sections_failed, 0);
  assert.ok(manifestDoc.sections_parsed >= 40);
});

// -------------------------------------------------------------
// Test 27: Automatic Model Discovery on Spare Parts World (No hardcoded modelUrls map)
// -------------------------------------------------------------
test('Phase 52A-R4 - Test 27: Automatic Model Discovery in SparePartsWorldSource', async () => {
  const source = new SparePartsWorldSource(new HttpClient({ mode: 'LIVE', useCache: true }));
  assert.strictEqual(source.modelUrls, undefined, 'modelUrls hardcoded map must be removed');

  const res261 = await source.discoverModel('MS 261');
  assert.strictEqual(res261.found, true);
  assert.strictEqual(res261.match_type, 'BASE_MODEL');
  assert.ok(res261.url.includes('P782612') || res261.url.includes('MS-261'));
});

// -------------------------------------------------------------
// Test 28: Automatic Discovery of Holdout Models MS 250 and MS 362
// -------------------------------------------------------------
test('Phase 52A-R4 - Test 28: Automatic Discovery of Holdout Models MS 250 and MS 362', async () => {
  const source = new SparePartsWorldSource(new HttpClient({ mode: 'LIVE', useCache: true }));

  const res250 = await source.discoverModel('MS 250');
  assert.strictEqual(res250.found, true);
  assert.strictEqual(res250.match_type, 'BASE_MODEL');

  const res362 = await source.discoverModel('MS 362');
  assert.strictEqual(res362.found, true);
});

// -------------------------------------------------------------
// Test 29: Section Attribution Semantics (No First-Diagram Leaks)
// -------------------------------------------------------------
test('Phase 52A-R4 - Test 29: Section Attribution Semantics (Unmapped Parts get UNRESOLVED)', () => {
  const source = new SparePartsWorldSource(new HttpClient({ mode: 'FIXTURE' }));
  const sampleHtml = `
    <div class='diagpill' onclick="roll(1, 'images_spares/MS261-Crankcase.jpg')">Diagram 1</div>
    <div class='spareref'>1</div>
    <div class='sparetitle'><a class='sparetitle'>Stihl Crankcase Fan Side</a></div>
    <span class='sparesncode'>1141 020 2616</span>
    <div class='spareref'>2</div>
    <div class='sparetitle'><a class='sparetitle'>Stihl Generic Washer</a></div>
    <span class='sparesncode'>0000 958 0408</span>
  `;

  const parsed = source.parsePartsFromHtml(sampleHtml, 'MS 261', 'http://test');
  assert.strictEqual(parsed.length, 2);

  const crankcasePart = parsed.find(p => p.part_number === '11410202616');
  assert.strictEqual(crankcasePart.section_attribution_status, 'MAPPED');
  assert.strictEqual(crankcasePart.section_key, 'crankcase');

  const unmappedPart = parsed.find(p => p.part_number === '00009580408');
  assert.strictEqual(unmappedPart.section_attribution_status, 'UNRESOLVED');
  assert.strictEqual(unmappedPart.section_key, 'general_unresolved');
});

// -------------------------------------------------------------
// Test 30: Reverse Compatibility Helper
// -------------------------------------------------------------
test('Phase 52A-R4 - Test 30: Reverse Compatibility Lookup Helper', async () => {
  const source = new SparePartsWorldSource(new HttpClient({ mode: 'LIVE', useCache: true }));
  const testPartUrl = 'https://www.sparepartsworld.co.uk/Stihl-11410802104-Fan-Housing-With-Rewind-Starter-for-the-MS261-range/P737999';
  const lookup = await source.discoverCompatibleModelsForPart(testPartUrl);

  assert.strictEqual(lookup.status, 200);
  assert.ok(Array.isArray(lookup.compatible_models));
  assert.ok(lookup.compatible_models.length > 0);
  assert.ok(lookup.compatible_models.some(m => m.includes('261')));
});
