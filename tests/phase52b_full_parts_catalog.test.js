import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { PartNormalizer, FITMENT_SCOPES } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { readGzipJsonlFile } from '../src/parts/PartsHarvesterEngine.js';
import { StihlModelIdentityParser } from '../src/parts/StihlModelIdentityParser.js';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  Database = null;
}

const partsCatalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const fitmentsPath = path.join(rootDir, 'data', 'model_part_fitments.json');
const evidencePath = path.join(rootDir, 'data', 'part_fitment_evidence.json');
const sourcesPath = path.join(rootDir, 'data', 'parts_sources.json');
const conflictsPath = path.join(rootDir, 'data', 'parts_conflicts.json');
const variantsPath = path.join(rootDir, 'data', 'parts_model_variants.json');
const configsPath = path.join(rootDir, 'data', 'parts_model_configurations.json');
const manifestPath = path.join(rootDir, 'data', 'parts_harvest_manifest.json');
const auditPath = path.join(rootDir, 'data', 'parts_catalog_index_audit.json');
const queuePath = path.join(rootDir, 'data', 'parts_harvest_queue.json');
const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const aliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');
const configAuditPath = path.join(rootDir, 'data', 'phase52b_configuration_fitment_audit.json');
const sqliteDbPath = path.join(rootDir, 'data', 'stihl_database.db');

const partsCatalogDoc = JSON.parse(fs.readFileSync(partsCatalogPath, 'utf8'));
const fitmentsDoc = JSON.parse(fs.readFileSync(fitmentsPath, 'utf8'));
const evidenceDoc = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const sourcesDoc = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
const conflictsDoc = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
const variantsDoc = JSON.parse(fs.readFileSync(variantsPath, 'utf8'));
const configsDoc = JSON.parse(fs.readFileSync(configsPath, 'utf8'));
const manifestDoc = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const auditDoc = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const queueDoc = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
const configAuditDoc = fs.existsSync(configAuditPath) ? JSON.parse(fs.readFileSync(configAuditPath, 'utf8')) : null;

// Load sharded fitments
function loadShardedFitments() {
  if (Array.isArray(fitmentsDoc.shard_files)) {
    const all = [];
    for (const sFile of fitmentsDoc.shard_files) {
      const sPath = path.join(rootDir, 'data', sFile);
      all.push(...readGzipJsonlFile(sPath));
    }
    return all;
  }
  return fitmentsDoc.fitments || [];
}

// Load sharded evidence
function loadShardedEvidence() {
  if (Array.isArray(evidenceDoc.shard_files)) {
    const all = [];
    for (const sFile of evidenceDoc.shard_files) {
      const sPath = path.join(rootDir, 'data', sFile);
      all.push(...readGzipJsonlFile(sPath));
    }
    return all;
  }
  return evidenceDoc.observations || [];
}

const allFitments = loadShardedFitments();
const allEvidence = loadShardedEvidence();

// -------------------------------------------------------------
// Test 1: Full Catalog Scale & Metric Thresholds
// -------------------------------------------------------------
test('Phase 52B - Test 1: Full Catalog Scale & Metric Thresholds', () => {
  assert.ok(queueDoc.total_queue_items >= 1400, `Queue count should be >= 1400, got ${queueDoc.total_queue_items}`);
  assert.ok(manifestDoc.models_found >= 1400, `Models found should be >= 1400, got ${manifestDoc.models_found}`);
  assert.ok(partsCatalogDoc.parts.length >= 17000, `Parts count should be >= 17000, got ${partsCatalogDoc.parts.length}`);
  assert.ok(allFitments.length >= 150000, `Fitments count should be >= 150000, got ${allFitments.length}`);
  assert.ok(allEvidence.length >= 180000, `Evidence count should be >= 180000, got ${allEvidence.length}`);
  assert.strictEqual(manifestDoc.synthetic_canonical_records, 0, 'SYNTHETIC_CANONICAL_RECORDS must be 0');
  assert.strictEqual(manifestDoc.conflicts_detected, 0, 'CONFLICTS_DETECTED must be 0');
});

// -------------------------------------------------------------
// Test 2: Sharding & Git Size Compliance (< 25MB per file, < 50MB total)
// -------------------------------------------------------------
test('Phase 52B - Test 2: Deterministic Sharding & Git Size Safety (< 25MB)', () => {
  assert.ok(fitmentsDoc.is_sharded, 'model_part_fitments.json must declare is_sharded');
  assert.ok(fitmentsDoc.shard_files.length >= 5, 'Must have at least 5 fitment shards');

  let totalSize = 0;
  for (const sFile of fitmentsDoc.shard_files) {
    const sPath = path.join(rootDir, 'data', sFile);
    assert.ok(fs.existsSync(sPath), `Shard file ${sFile} must exist`);
    assert.ok(sFile.endsWith('.jsonl.gz'), `Shard file ${sFile} must be compressed .jsonl.gz`);
    const stats = fs.statSync(sPath);
    const sizeMb = stats.size / (1024 * 1024);
    totalSize += sizeMb;
    assert.ok(sizeMb < 25, `Shard file ${sFile} size (${sizeMb.toFixed(2)}MB) must be < 25MB`);
  }

  assert.ok(evidenceDoc.is_sharded, 'part_fitment_evidence.json must declare is_sharded');
  assert.ok(evidenceDoc.shard_files.length >= 5, 'Must have at least 5 evidence shards');

  for (const sFile of evidenceDoc.shard_files) {
    const sPath = path.join(rootDir, 'data', sFile);
    assert.ok(fs.existsSync(sPath), `Shard file ${sFile} must exist`);
    assert.ok(sFile.endsWith('.jsonl.gz'), `Shard file ${sFile} must be compressed .jsonl.gz`);
    const stats = fs.statSync(sPath);
    const sizeMb = stats.size / (1024 * 1024);
    totalSize += sizeMb;
    assert.ok(sizeMb < 25, `Shard file ${sFile} size (${sizeMb.toFixed(2)}MB) must be < 25MB`);
  }

  assert.ok(totalSize < 50, `Total compressed storage payload (${totalSize.toFixed(2)}MB) must be < 50MB`);
});

// -------------------------------------------------------------
// Test 3: Referential Integrity Across Parts, Fitments, Variants, Configurations
// -------------------------------------------------------------
test('Phase 52B - Test 3: Referential Integrity Across Parts, Fitments & Variants', () => {
  const partNumberSet = new Set(partsCatalogDoc.parts.map(p => p.part_number));
  const variantKeySet = new Set(variantsDoc.variants.map(v => `${v.canonical_model_id}::${v.variant_key}`));

  for (const f of allFitments) {
    assert.ok(partNumberSet.has(f.part_number), `Fitment references non-existent part: ${f.part_number}`);
    assert.ok(/^\d{11}$/.test(f.part_number), `Fitment part number not 11-digit: ${f.part_number}`);
    const vKey = `${f.canonical_model_id}::${f.variant_key}`;
    assert.ok(variantKeySet.has(vKey), `Fitment references non-existent model variant: ${vKey}`);
    assert.ok(Object.values(FITMENT_SCOPES).includes(f.fitment_scope), `Invalid fitment_scope: ${f.fitment_scope}`);

    if (f.configuration_key && f.configuration_key !== 'base') {
      assert.strictEqual(f.fitment_scope, FITMENT_SCOPES.EXACT_CONFIGURATION, `Configuration fitment ${f.fitment_id} must have EXACT_CONFIGURATION scope`);
    } else if (f.variant_key !== 'base') {
      assert.strictEqual(f.fitment_scope, FITMENT_SCOPES.EXACT_VARIANT, `Variant fitment ${f.fitment_id} must have EXACT_VARIANT scope`);
    }
  }
});

// -------------------------------------------------------------
// Test 4: 100% JSON vs SQLite Database Parity
// -------------------------------------------------------------
test('Phase 52B - Test 4: 100% JSON vs SQLite Database Parity', async () => {
  let db;
  let getCount;
  if (Database) {
    db = new Database(sqliteDbPath, { readonly: true });
    getCount = (query) => db.prepare(query).get().c;
  } else {
    const sqlite3 = require('sqlite3');
    db = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY);
    getCount = (query) => new Promise((resolve, reject) => {
      db.get(query, (err, row) => (err ? reject(err) : resolve(row.c)));
    });
  }

  try {
    const partsCount = await getCount('SELECT COUNT(*) as c FROM parts');
    const fitmentsCount = await getCount('SELECT COUNT(*) as c FROM model_part_fitments');
    const evidenceCount = await getCount('SELECT COUNT(*) as c FROM part_fitment_evidence');
    const sourcesCount = await getCount('SELECT COUNT(*) as c FROM parts_sources');
    const conflictsCount = await getCount('SELECT COUNT(*) as c FROM parts_conflicts');
    const variantsCount = await getCount('SELECT COUNT(*) as c FROM parts_model_variants');
    const configsCount = await getCount('SELECT COUNT(*) as c FROM parts_model_configurations');
    const anchorsCount = await getCount('SELECT COUNT(*) as c FROM official_serial_anchors');
    const aliasesCount = await getCount('SELECT COUNT(*) as c FROM official_serial_input_aliases');

    assert.strictEqual(partsCount, partsCatalogDoc.parts.length, 'parts table matches JSON');
    assert.strictEqual(fitmentsCount, allFitments.length, 'model_part_fitments matches JSON');
    assert.strictEqual(evidenceCount, allEvidence.length, 'part_fitment_evidence matches JSON');
    assert.strictEqual(sourcesCount, sourcesDoc.sources.length, 'parts_sources matches JSON');
    assert.strictEqual(conflictsCount, conflictsDoc.conflicts.length, 'parts_conflicts matches JSON');
    assert.strictEqual(variantsCount, variantsDoc.variants.length, 'parts_model_variants matches JSON');
    assert.strictEqual(configsCount, configsDoc.configurations.length, 'parts_model_configurations matches JSON');
    assert.strictEqual(anchorsCount, anchorsDoc.anchors.length, 'Anchors must match JSON anchors length');
    assert.strictEqual(aliasesCount, 171, 'Aliases must be exactly 171');
  } finally {
    db.close();
  }
});

// -------------------------------------------------------------
// Test 5: Historical Model Preservation & Pilot Retrieval
// -------------------------------------------------------------
test('Phase 52B - Test 5: Historical Model Preservation & Pilot Retrieval', () => {
  const pilotModels = ['MS 261', 'MS 170', 'MS 180', '026', 'FS 55', 'TS 420'];

  for (const model of pilotModels) {
    const parts = PartCatalogResolver.getPartsForModel(model);
    assert.ok(parts.length > 0, `Pilot model ${model} must return parts`);
    const hasOfficial = parts.some(p => p.source_evidence_status === 'OFFICIAL_STIHL');
    assert.ok(hasOfficial, `Pilot model ${model} must have official STIHL evidence`);
  }
});

// -------------------------------------------------------------
// Test 6: Decoder Regression Safety
// -------------------------------------------------------------
test('Phase 52B - Test 6: Complete Decoder & Part Normalizer Regression Safety', () => {
  const dec1 = decodeStihlCode('180123456');
  assert.strictEqual(dec1.success, true);
  assert.strictEqual(dec1.factory.code, '1');

  const pNorm = PartNormalizer.normalizePartNumber('1141 160 5400');
  assert.strictEqual(pNorm, '11411605400');

  const pInvalid = PartNormalizer.normalizePartNumber('123456789');
  assert.strictEqual(pInvalid, null);
});

// -------------------------------------------------------------
// Test 7: Catalog Audit & Queue Sanity (Machines vs Attachments)
// -------------------------------------------------------------
test('Phase 52B - Test 7: Catalog Audit & Queue Sanity', () => {
  assert.ok(auditDoc.stats.total_index_entries >= 1500, 'Audit must inspect > 1500 candidate index entries');
  assert.ok(auditDoc.stats.accepted_machines_count >= 1400, 'Audit must accept > 1400 STIHL machines');
  assert.ok(auditDoc.stats.accepted_attachments_count >= 20, 'Audit must distinguish attachments');
  assert.ok(auditDoc.stats.rejected_non_machines_count >= 50, 'Audit must reject non-machine accessory entries');

  // Verify none of the rejected items made it into the harvest queue
  const queueUrlSet = new Set(queueDoc.queue.map(q => q.source_url));
  for (const rej of auditDoc.rejected_items) {
    assert.ok(!queueUrlSet.has(rej.source_url), `Rejected non-machine item should not be in harvest queue: ${rej.source_url}`);
  }
});

// -------------------------------------------------------------
// Test 8: Canonical Model Identity Contract (5 Key Examples)
// -------------------------------------------------------------
test('Phase 52B - Test 8: Canonical Model Identity Contract (5 Key Examples)', () => {
  // Case 1: 009 EQ Quiet QuickStop Plus
  const m1 = StihlModelIdentityParser.parseModelIdentity('Stihl 009 EQ Quiet QuickStop Quickstop Plus');
  assert.strictEqual(m1.canonical_model_id, '009');
  assert.strictEqual(m1.variant_key, 'eq');
  assert.ok(m1.configuration.includes('Quiet QuickStop'));

  // Case 2: 010 AV Anti-Vibration
  const m2 = StihlModelIdentityParser.parseModelIdentity('Stihl 010 AV Anti-Vibration');
  assert.strictEqual(m2.canonical_model_id, '010');
  assert.strictEqual(m2.variant_key, 'av');
  assert.strictEqual(m2.configuration, 'Anti-Vibration');

  // Case 3: 026 C Comfort
  const m3 = StihlModelIdentityParser.parseModelIdentity('Stihl 026 C Comfort');
  assert.strictEqual(m3.canonical_model_id, '026');
  assert.strictEqual(m3.variant_key, 'c');
  assert.strictEqual(m3.configuration, 'Comfort');

  // Case 4: FS 100 R Loop Handle
  const m4 = StihlModelIdentityParser.parseModelIdentity('Stihl FS 100 R Loop Handle');
  assert.strictEqual(m4.canonical_model_id, 'fs_100');
  assert.strictEqual(m4.variant_key, 'r');
  assert.strictEqual(m4.configuration, 'Loop Handle');

  // Case 5: FR 460 TC-EFM Backpack
  const m5 = StihlModelIdentityParser.parseModelIdentity('Stihl FR 460 TC-EFM Backpack');
  assert.strictEqual(m5.canonical_model_id, 'fr_460');
  assert.strictEqual(m5.variant_key, 'tc_efm');
  assert.strictEqual(m5.configuration, 'Backpack');
});

// -------------------------------------------------------------
// Test 9: Strict Row Conservation Invariant (UNACCOUNTED = 0)
// -------------------------------------------------------------
test('Phase 52B - Test 9: Strict Row Conservation Invariant', () => {
  const rc = manifestDoc.row_conservation;
  assert.ok(rc, 'Manifest must contain row_conservation object');
  assert.ok(rc.raw_part_rows > 200000, `Raw part rows must exceed 200k, got ${rc.raw_part_rows}`);
  assert.ok(rc.canonical_evidence_rows > 180000, `Canonical evidence rows must exceed 180k, got ${rc.canonical_evidence_rows}`);

  const accountedSum = rc.canonical_evidence_rows +
    rc.invalid_part_number_rows +
    rc.noncanonical_part_rows +
    rc.duplicate_observations_collapsed +
    rc.explicitly_rejected_rows;

  assert.strictEqual(rc.raw_part_rows, accountedSum, 'Raw rows must exactly match sum of categorized rows');
  assert.strictEqual(rc.unaccounted_rows, 0, 'Unaccounted rows must be exactly 0');
  assert.strictEqual(rc.conservation_invariant_satisfied, true, 'Conservation invariant satisfied flag must be true');
});

// -------------------------------------------------------------
// Test 10: Performance Benchmark (Separate Latency Measurements < 100ms)
// -------------------------------------------------------------
test('Phase 52B - Test 10: Performance Benchmark (Part, Base Model, Variant, Configuration < 100ms)', () => {
  // Warm up
  PartCatalogResolver.resolvePartNumber('1141 160 5400');
  PartCatalogResolver.getPartsForModel('024');

  const partLatencies = [];
  const baseModelLatencies = [];
  const variantLatencies = [];
  const configLatencies = [];

  const testPartNumbers = ['1141 160 5400', '1127 120 0650', '1130 140 0600', '4180 120 0611', '4238 120 0600'];

  for (let i = 0; i < 50; i++) {
    const pNum = testPartNumbers[i % testPartNumbers.length];

    const t0 = performance.now();
    PartCatalogResolver.resolvePartNumber(pNum);
    partLatencies.push(performance.now() - t0);

    const t1 = performance.now();
    PartCatalogResolver.getPartsForModel('024');
    baseModelLatencies.push(performance.now() - t1);

    const t2 = performance.now();
    PartCatalogResolver.getPartsForModel('ms_261', 'c_m');
    variantLatencies.push(performance.now() - t2);

    const t3 = performance.now();
    PartCatalogResolver.getPartsForModel('024', null, 'sw_version_with_larger_piston_diam');
    configLatencies.push(performance.now() - t3);
  }

  const getStats = (arr) => {
    arr.sort((a, b) => a - b);
    return {
      median: arr[Math.floor(arr.length / 2)],
      p95: arr[Math.floor(arr.length * 0.95)]
    };
  };

  const partStats = getStats(partLatencies);
  const baseStats = getStats(baseModelLatencies);
  const varStats = getStats(variantLatencies);
  const cfgStats = getStats(configLatencies);

  assert.ok(partStats.median < 100, `Part lookup median (${partStats.median.toFixed(2)}ms) must be < 100ms`);
  assert.ok(baseStats.median < 100, `Base model lookup median (${baseStats.median.toFixed(2)}ms) must be < 100ms`);
  assert.ok(varStats.median < 100, `Variant lookup median (${varStats.median.toFixed(2)}ms) must be < 100ms`);
  assert.ok(cfgStats.median < 100, `Configuration lookup median (${cfgStats.median.toFixed(2)}ms) must be < 100ms`);
});

// -------------------------------------------------------------
// Test 11: Fail-Closed JSONL Reader & Negative Corruption Test
// -------------------------------------------------------------
test('Phase 52B - Test 11: Fail-Closed JSONL Reader & Corruption Negative Test', () => {
  // Test reading valid shards
  const validShardPath = path.join(rootDir, 'data', fitmentsDoc.shard_files[0]);
  const records = readGzipJsonlFile(validShardPath);
  assert.ok(records.length > 0, 'Must read valid records from uncorrupted shard');

  // Create temporary corrupted shard
  const tempCorruptPath = path.join(rootDir, 'data', 'temp_corrupt_test_shard.jsonl.gz');
  try {
    const corruptContent = JSON.stringify({ test: 1 }) + '\n{ INVALID_JSON_LINE\n' + JSON.stringify({ test: 2 }) + '\n';
    const gzBuffer = zlib.gzipSync(Buffer.from(corruptContent, 'utf8'));
    fs.writeFileSync(tempCorruptPath, gzBuffer);

    assert.throws(
      () => {
        readGzipJsonlFile(tempCorruptPath);
      },
      /Failed to parse JSONL/i,
      'readGzipJsonlFile MUST throw an error on malformed JSON line and not drop rows silently'
    );
  } finally {
    if (fs.existsSync(tempCorruptPath)) {
      fs.unlinkSync(tempCorruptPath);
    }
  }
});

// -------------------------------------------------------------
// Test 12: Configuration Fitment Isolation Regressions (024, 034, 038, 066, BG 56)
// -------------------------------------------------------------
test('Phase 52B - Test 12: Configuration Fitment Isolation Regressions (024, 034, 038, 066, BG 56)', () => {
  // Regression 1: 024 Base vs 024 SW vs 024 SWVH
  const base024 = PartCatalogResolver.getPartsForModel('024');
  const sw024 = PartCatalogResolver.getPartsForModel('024', null, 'sw_version_with_larger_piston_diam');
  const swvh024 = PartCatalogResolver.getPartsForModel('024', null, 'swvh_version_with_larger_piston_diam_carbuertor_heating');

  assert.ok(base024.length > 0, '024 Base must have parts');
  assert.ok(sw024.length > 0, '024 SW must have parts');
  assert.ok(swvh024.length > 0, '024 SWVH must have parts');

  // Verify all parts in base024 have BASE_MODEL_CONFIRMED scope
  for (const p of base024) {
    assert.strictEqual(p.fitment_scope, FITMENT_SCOPES.BASE_MODEL_CONFIRMED, `024 base query part ${p.part_number} must have BASE_MODEL_CONFIRMED scope`);
  }

  // Verify all parts in sw024 have EXACT_CONFIGURATION scope
  for (const p of sw024) {
    assert.strictEqual(p.fitment_scope, FITMENT_SCOPES.EXACT_CONFIGURATION, `024 SW part ${p.part_number} must have EXACT_CONFIGURATION scope`);
  }

  // Regression 2: 034 Configuration Isolation
  const base034 = PartCatalogResolver.getPartsForModel('034');
  const aveqwz034 = PartCatalogResolver.getPartsForModel('034', null, 'aveqwz');
  assert.ok(base034.length > 0, '034 Base must return parts');
  assert.ok(aveqwz034.length > 0, '034 AVEQWZ must return parts');

  // Regression 3: 038 Configuration Isolation
  const base038 = PartCatalogResolver.getPartsForModel('038');
  const mMagnum038 = PartCatalogResolver.getPartsForModel('038', null, 'm_magnum');
  assert.ok(base038.length > 0, '038 Base must return parts');
  assert.ok(mMagnum038.length > 0, '038 M Magnum must return parts');

  // Regression 4: 066 Configuration Isolation
  const base066 = PartCatalogResolver.getPartsForModel('066');
  const mMagnum066 = PartCatalogResolver.getPartsForModel('066', null, 'm_magnum');
  assert.ok(base066.length > 0, '066 Base must return parts');
  assert.ok(mMagnum066.length > 0, '066 M Magnum must return parts');

  // Regression 5: Modern Model BG 56
  const bg56Base = PartCatalogResolver.getPartsForModel('bg_56');
  const bg56CE = PartCatalogResolver.getPartsForModel('bg_56', 'c_e');
  const bg56CED = PartCatalogResolver.getPartsForModel('bg_56', 'c_e', 'd');
  assert.ok(bg56Base.length > 0, 'BG 56 Base must return parts');
  assert.ok(bg56CE.length > 0, 'BG 56 C-E must return parts');
  assert.ok(bg56CED.length > 0, 'BG 56 C-E D must return parts');
});

// -------------------------------------------------------------
// Test 13: Shard Hash & Manifest Record Count Validation
// -------------------------------------------------------------
test('Phase 52B - Test 13: Shard Hash & Manifest Record Count Validation', () => {
  // 1. Verify fitments shards
  let fitmentSum = 0;
  for (const meta of fitmentsDoc.shards) {
    const sPath = path.join(rootDir, 'data', meta.file_path);
    const buf = fs.readFileSync(sPath);
    const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
    assert.strictEqual(actualHash, meta.sha256, `Fitment shard ${meta.file_path} SHA256 mismatch`);

    const records = readGzipJsonlFile(sPath);
    assert.strictEqual(records.length, meta.records_count, `Fitment shard ${meta.file_path} records count mismatch`);
    fitmentSum += records.length;
  }
  assert.strictEqual(fitmentSum, fitmentsDoc.fitments_count, 'Sum of fitment shard records must match root manifest count');

  // 2. Verify evidence shards
  let evidenceSum = 0;
  for (const meta of evidenceDoc.shards) {
    const sPath = path.join(rootDir, 'data', meta.file_path);
    const buf = fs.readFileSync(sPath);
    const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
    assert.strictEqual(actualHash, meta.sha256, `Evidence shard ${meta.file_path} SHA256 mismatch`);

    const records = readGzipJsonlFile(sPath);
    assert.strictEqual(records.length, meta.records_count, `Evidence shard ${meta.file_path} records count mismatch`);
    evidenceSum += records.length;
  }
  assert.strictEqual(evidenceSum, evidenceDoc.observations_count, 'Sum of evidence shard records must match root manifest count');
});

// -------------------------------------------------------------
// Test 14: Exact Configuration Fitment Matching & Prefix Matching Prohibition (HLA 135 & RMI 422.1)
// -------------------------------------------------------------
test('Phase 52B - Test 14: Exact Configuration Fitment Matching & Prefix Matching Prohibition (HLA 135 & RMI 422.1)', () => {
  // Case A: HLA 135 cordless vs cordless_hedge_cutters
  const hlaCordless = PartCatalogResolver.getPartsForModel('hla_135', 'base', 'cordless');
  const hlaCutters = PartCatalogResolver.getPartsForModel('hla_135', 'base', 'cordless_hedge_cutters');

  assert.ok(hlaCordless.length > 0, 'HLA 135 cordless must return parts');
  assert.ok(hlaCutters.length > 0, 'HLA 135 cordless_hedge_cutters must return parts');

  for (const p of hlaCordless) {
    assert.strictEqual(p.configuration_key?.toLowerCase(), 'cordless', 'HLA 135 cordless fitments must have configuration_key cordless');
    assert.notStrictEqual(p.configuration_key?.toLowerCase(), 'cordless_hedge_cutters', 'Cordless hedge cutters fitment must NOT leak into cordless');
  }

  for (const p of hlaCutters) {
    assert.strictEqual(p.configuration_key?.toLowerCase(), 'cordless_hedge_cutters', 'HLA 135 cordless_hedge_cutters fitments must have configuration_key cordless_hedge_cutters');
    assert.notStrictEqual(p.configuration_key?.toLowerCase(), 'cordless', 'Cordless fitment must NOT leak into cordless_hedge_cutters');
  }

  // Case B: RMI 422.1 pc vs pc_l
  const rmiPC = PartCatalogResolver.getPartsForModel('rmi_422_1', 'base', 'pc');
  const rmiPCL = PartCatalogResolver.getPartsForModel('rmi_422_1', 'base', 'pc_l');

  assert.ok(rmiPC.length > 0, 'RMI 422.1 PC must return parts');
  assert.ok(rmiPCL.length > 0, 'RMI 422.1 PC-L must return parts');

  for (const p of rmiPC) {
    assert.strictEqual(p.configuration_key?.toLowerCase(), 'pc', 'RMI 422.1 PC fitments must have configuration_key pc');
    assert.notStrictEqual(p.configuration_key?.toLowerCase(), 'pc_l', 'PC-L fitment must NOT leak into PC query');
  }

  for (const p of rmiPCL) {
    assert.strictEqual(p.configuration_key?.toLowerCase(), 'pc_l', 'RMI 422.1 PC-L fitments must have configuration_key pc_l');
    assert.notStrictEqual(p.configuration_key?.toLowerCase(), 'pc', 'PC fitment must NOT leak into PC-L query');
  }
});

// -------------------------------------------------------------
// Test 15: Dynamic Scan of Configuration Prefix Collisions & Zero Cross-Configuration Leakage
// -------------------------------------------------------------
test('Phase 52B - Test 15: Dynamic Scan of Configuration Prefix Collisions & Zero Cross-Configuration Leakage', () => {
  const groups = new Map();
  for (const c of configsDoc.configurations) {
    const key = `${c.canonical_model_id}::${c.variant_key || 'base'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let totalCollisions = 0;
  let crossLeakageCount = 0;

  for (const [key, list] of groups.entries()) {
    const [modelId, varKey] = key.split('::');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const cfgA = list[i].configuration_key.toLowerCase();
        const cfgB = list[j].configuration_key.toLowerCase();
        if (cfgA === cfgB) continue;

        if (cfgA.startsWith(cfgB + '_') || cfgB.startsWith(cfgA + '_') || cfgA.startsWith(cfgB) || cfgB.startsWith(cfgA)) {
          totalCollisions++;
          const partsA = PartCatalogResolver.getPartsForModel(modelId, varKey, cfgA);
          const partsB = PartCatalogResolver.getPartsForModel(modelId, varKey, cfgB);

          for (const p of partsA) {
            if (p.configuration_key && p.configuration_key.toLowerCase() !== cfgA) {
              crossLeakageCount++;
            }
          }
          for (const p of partsB) {
            if (p.configuration_key && p.configuration_key.toLowerCase() !== cfgB) {
              crossLeakageCount++;
            }
          }
        }
      }
    }
  }

  assert.ok(totalCollisions >= 10, `Expected at least 10 prefix collision pairs to be tested, got ${totalCollisions}`);
  assert.strictEqual(crossLeakageCount, 0, `CROSS_CONFIGURATION_LEAKAGE must be exactly 0, got ${crossLeakageCount}`);
});

// -------------------------------------------------------------
// Test 16: Base Query, Exact Variant Query, and Configuration Query Safety Invariants
// -------------------------------------------------------------
test('Phase 52B - Test 16: Base Query, Exact Variant Query, and Configuration Query Safety Invariants', () => {
  // 1. Base query safety: only BASE_MODEL_CONFIRMED with no variant and no configuration
  const baseParts = PartCatalogResolver.getPartsForModel('ms_261');
  assert.ok(baseParts.length > 0, 'MS 261 base must return parts');
  for (const p of baseParts) {
    assert.strictEqual(p.fitment_scope, FITMENT_SCOPES.BASE_MODEL_CONFIRMED);
    assert.ok(!p.configuration_key || p.configuration_key === 'base');
    assert.ok(!p.variant_key || p.variant_key === 'base');
  }

  // 2. Variant query safety: only EXACT_VARIANT / MULTI_VARIANT_EXPLICIT with no configuration
  const varParts = PartCatalogResolver.getPartsForModel('ms_261', 'c_m');
  assert.ok(varParts.length > 0, 'MS 261 C-M variant must return parts');
  for (const p of varParts) {
    assert.ok(p.fitment_scope === FITMENT_SCOPES.EXACT_VARIANT || p.fitment_scope === FITMENT_SCOPES.MULTI_VARIANT_EXPLICIT);
    assert.strictEqual(p.variant_key, 'c_m');
    assert.ok(!p.configuration_key || p.configuration_key === 'base');
  }

  // 3. Configuration helper resolution
  const resolvedCfg = PartCatalogResolver.resolveConfigurationKey('hla_135', 'base', 'Cordless Hedge Cutters');
  assert.strictEqual(resolvedCfg, 'cordless_hedge_cutters');
});

// -------------------------------------------------------------
// Test 17: Configuration Registry Dynamic Count Verification
// -------------------------------------------------------------
test('Phase 52B - Test 17: Configuration Registry Dynamic Count Verification', () => {
  assert.strictEqual(configsDoc.configurations.length, configsDoc.configurations_count, 'Configurations array length matches configurations_count');
  assert.ok(configsDoc.configurations.length >= 750, `Configurations count must be >= 750, got ${configsDoc.configurations.length}`);
});
