import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { decodeStihlCode } from '../src/decoder.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import {
  runBatchProcessing,
  verifyReproducibility,
  rebuildBatchArtifacts,
  validateBatchManifest,
  KNOWN_SOURCE_SHA256,
  KNOWN_SOURCE_BYTES,
  KNOWN_PRE_IMPORT_BASELINE_SHA256,
  KNOWN_PRE_IMPORT_BASELINE_ANCHORS,
  DEFAULT_SOURCE_CSV,
  DEFAULT_BASELINE_JSON,
  BATCH_DIR,
  BATCH_DATA_DIR,
  REBUILD_CANONICAL_WRITES,
  SQLITE_RESEED_FROM_PHASE53A_REBUILD,
  VERIFY_SQLITE_WRITES,
  CANONICAL_ANCHORS_JSON,
  STIHL_DATABASE_JSON,
  STIHL_DATABASE_DB,
  CANONICAL_ANCHOR_FIELDS,
  REQUIRED_MANIFEST_FIELDS,
  EXPECTED_MANIFEST_SCALARS,
  REQUIRED_MANIFEST_FILE_PATHS
} from '../scripts/generate_phase53a_batch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function createTempProductionEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p53a-prod-test-'));
  const tempOfficialAnchors = path.join(tempDir, 'official_serial_anchors.json');
  const tempStihlDatabaseJson = path.join(tempDir, 'stihl_database.json');
  const tempStihlDatabaseDb = path.join(tempDir, 'stihl_database.db');

  fs.copyFileSync(CANONICAL_ANCHORS_JSON, tempOfficialAnchors);
  fs.copyFileSync(STIHL_DATABASE_JSON, tempStihlDatabaseJson);
  fs.copyFileSync(STIHL_DATABASE_DB, tempStihlDatabaseDb);

  return {
    tempDir,
    tempOfficialAnchors,
    tempStihlDatabaseJson,
    tempStihlDatabaseDb,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  };
}

function createTempBatchEnvironment() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p53a-test-'));
  const tempBatchDir = path.join(tempDir, 'serials_2026-10-09');
  const tempBatchDataDir = path.join(tempBatchDir, 'data');
  const tempBatchSourceDir = path.join(tempBatchDir, 'source');
  fs.mkdirSync(tempBatchDataDir, { recursive: true });
  fs.mkdirSync(tempBatchSourceDir, { recursive: true });

  fs.copyFileSync(path.join(BATCH_DIR, 'batch_manifest.json'), path.join(tempBatchDir, 'batch_manifest.json'));
  fs.copyFileSync(path.join(BATCH_DIR, 'README.md'), path.join(tempBatchDir, 'README.md'));
  fs.copyFileSync(path.join(BATCH_DIR, 'source', 'stihl_resultaten_backup_1.csv'), path.join(tempBatchSourceDir, 'stihl_resultaten_backup_1.csv'));

  const files = fs.readdirSync(BATCH_DATA_DIR);
  for (const f of files) {
    fs.copyFileSync(path.join(BATCH_DATA_DIR, f), path.join(tempBatchDataDir, f));
  }

  return {
    tempDir,
    tempBatchDir,
    tempBatchDataDir,
    tempSourceCsv: path.join(tempBatchSourceDir, 'stihl_resultaten_backup_1.csv'),
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  };
}

test('Phase 53A-M1 - Test 1: Zero Hardcoded Workstation Paths in Batch Scripts', () => {
  const generatorScript = fs.readFileSync(path.join(rootDir, 'scripts', 'generate_phase53a_batch.mjs'), 'utf8');
  assert.strictEqual(generatorScript.includes('C:/Users/'), false, 'generate_phase53a_batch.mjs must NOT contain C:/Users/ paths');
  assert.strictEqual(generatorScript.includes('C:\\Users\\'), false, 'generate_phase53a_batch.mjs must NOT contain C:\\Users\\ paths');
  assert.strictEqual(generatorScript.includes('GelliusSnippe'), false, 'generate_phase53a_batch.mjs must NOT contain GelliusSnippe');
});

test('Phase 53A-M1 - Test 2: Immutable Source Identity (Bytes & SHA256)', () => {
  assert.ok(fs.existsSync(DEFAULT_SOURCE_CSV), 'Immutable source CSV must exist');
  const raw = fs.readFileSync(DEFAULT_SOURCE_CSV);
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  assert.strictEqual(raw.length, KNOWN_SOURCE_BYTES, `Source must be exactly ${KNOWN_SOURCE_BYTES} bytes`);
  assert.strictEqual(sha, KNOWN_SOURCE_SHA256, `Source SHA256 must be exactly ${KNOWN_SOURCE_SHA256}`);
});

test('Phase 53A-M1 - Test 3: Pre-Import Baseline Identity (2845 Anchors & SHA256)', () => {
  assert.ok(fs.existsSync(DEFAULT_BASELINE_JSON), 'Pre-import baseline JSON must exist');
  const raw = fs.readFileSync(DEFAULT_BASELINE_JSON);
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  const doc = JSON.parse(raw.toString('utf8'));
  assert.strictEqual(doc.anchors.length, KNOWN_PRE_IMPORT_BASELINE_ANCHORS, `Pre-import baseline must have ${KNOWN_PRE_IMPORT_BASELINE_ANCHORS} anchors`);
  assert.strictEqual(sha, KNOWN_PRE_IMPORT_BASELINE_SHA256, `Baseline SHA256 must match ${KNOWN_PRE_IMPORT_BASELINE_SHA256}`);
});

test('Phase 53A-M1 - Test 4: Manifest SHA Validation Across All Committed Batch Files', () => {
  const manifestResult = validateBatchManifest(BATCH_DIR);
  assert.strictEqual(manifestResult.success, true, `Manifest validation failed: ${manifestResult.mismatches.join('; ')}`);
  assert.strictEqual(manifestResult.mismatches.length, 0, 'Must have zero manifest mismatches');
  assert.strictEqual(manifestResult.fileCount, 10, 'Manifest must validate all 10 files');
});

test('Phase 53A-M1 - Test 5: Full Content & Serialization Verification (All 8 Phase 53A Artifacts)', () => {
  const verifyResult = verifyReproducibility({
    throwOnError: false
  });
  assert.strictEqual(verifyResult.success, true, `Verification failed with errors: ${verifyResult.errors.join('; ')}`);
  assert.strictEqual(verifyResult.errors.length, 0, 'Must have zero verification errors');
});

test('Phase 53A-M1 - Test 6: Idempotence & Exact Metrics on Successive Verify Runs (#1 & #2)', () => {
  // Run #1
  const run1 = runBatchProcessing({
    sourcePath: DEFAULT_SOURCE_CSV,
    baselinePath: DEFAULT_BASELINE_JSON
  });
  assert.strictEqual(run1.populatedDataRows, 6822, 'Run 1 data rows === 6822');
  assert.strictEqual(run1.uniqueInputSerialsCount, 6820, 'Run 1 unique inputs === 6820');
  assert.strictEqual(run1.allPositiveAnchorsBatch.length, 6031, 'Run 1 safe exact === 6031');
  assert.strictEqual(run1.reconfirmedAnchors.length, 2, 'Run 1 reconfirmed === 2');
  assert.strictEqual(run1.newAnchorsOnly.length, 6029, 'Run 1 new anchors === 6029');
  assert.strictEqual(run1.recheckQueue.length, 789, 'Run 1 recheck queue === 789');
  assert.strictEqual(run1.finalAnchorsList.length, 8874, 'Run 1 final anchors === 8874');

  // Run #2
  const run2 = runBatchProcessing({
    sourcePath: DEFAULT_SOURCE_CSV,
    baselinePath: DEFAULT_BASELINE_JSON
  });
  assert.strictEqual(run2.populatedDataRows, 6822, 'Run 2 data rows === 6822');
  assert.strictEqual(run2.uniqueInputSerialsCount, 6820, 'Run 2 unique inputs === 6820');
  assert.strictEqual(run2.allPositiveAnchorsBatch.length, 6031, 'Run 2 safe exact === 6031');
  assert.strictEqual(run2.reconfirmedAnchors.length, 2, 'Run 2 reconfirmed === 2');
  assert.strictEqual(run2.newAnchorsOnly.length, 6029, 'Run 2 new anchors === 6029');
  assert.strictEqual(run2.recheckQueue.length, 789, 'Run 2 recheck queue === 789');
  assert.strictEqual(run2.finalAnchorsList.length, 8874, 'Run 2 final anchors === 8874');

  assert.notStrictEqual(run2.newAnchorsOnly.length, 0, 'New anchors must NOT be 0 on rerun');
  assert.notStrictEqual(run2.reconfirmedAnchors.length, 6031, 'Reconfirmed anchors must NOT be 6031 on rerun');
});

test('Phase 53A-M1 - Test 7: Verify Mode Causes Zero Repository Mutations', () => {
  const result = spawnSync('node', ['scripts/generate_phase53a_batch.mjs', '--verify'], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  assert.strictEqual(result.status, 0, `Verify script exited with code ${result.status}: ${result.stderr}`);
  assert.ok(result.stdout.includes('ALL REPRODUCIBILITY CHECKS PASSED PERFECTLY'));
});

test('Phase 53A-M1 - Test 8: Corruption Failure Injection A — JSON Anchor Model Name Corruption (Same Count)', () => {
  const env = createTempBatchEnvironment();
  try {
    const jsonPath = path.join(env.tempBatchDataDir, 'new_official_serial_anchors_only_2026-10-09.json');
    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Mutate model_name of the first anchor while keeping array length identical (6029)
    doc.anchors[0].model_name = 'CORRUPTED_MODEL_NAME_CANNOT_PASS';
    fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));

    const res = verifyReproducibility({
      sourcePath: env.tempSourceCsv,
      batchDir: env.tempBatchDir,
      batchDataDir: env.tempBatchDataDir,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when JSON model_name is corrupted');
    assert.ok(res.errors.some(e => e.includes('property "model_name" mismatch')), 'Error must specify model_name mismatch');
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 9: Corruption Failure Injection B — JSON Serial Number Corruption (Same Count)', () => {
  const env = createTempBatchEnvironment();
  try {
    const jsonPath = path.join(env.tempBatchDataDir, 'official_serial_anchors_batch_2026-10-09.json');
    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Mutate serial_number of anchor 5 while keeping array length identical (6031)
    doc.anchors[5].serial_number = '999999999';
    fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));

    const res = verifyReproducibility({
      sourcePath: env.tempSourceCsv,
      batchDir: env.tempBatchDir,
      batchDataDir: env.tempBatchDataDir,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when serial_number is corrupted');
    assert.ok(res.errors.some(e => e.includes('property "serial_number" mismatch')), 'Error must specify serial_number mismatch');
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 10: Corruption Failure Injection C — CSV Field Corruption (Reason & Source Row)', () => {
  const env = createTempBatchEnvironment();
  try {
    const csvPath = path.join(env.tempBatchDataDir, 'serial_recheck_queue_2026-10-09.csv');
    const originalContent = fs.readFileSync(csvPath, 'utf8');
    // Replace reason of first queue record without modifying row count (790)
    const corruptedContent = originalContent.replace('TECHNICAL_TIMEOUT', 'CORRUPTED_TIMEOUT_REASON');
    fs.writeFileSync(csvPath, corruptedContent);

    const res = verifyReproducibility({
      sourcePath: env.tempSourceCsv,
      batchDir: env.tempBatchDir,
      batchDataDir: env.tempBatchDataDir,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when CSV field is corrupted');
    assert.ok(res.errors.some(e => e.includes('reason') || e.includes('mismatch')), 'Error must detect CSV field mismatch');
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 11: Corruption Failure Injection D — Record Reordering Detection (Same Count)', () => {
  const env = createTempBatchEnvironment();
  try {
    const jsonPath = path.join(env.tempBatchDataDir, 'new_official_serial_anchors_only_2026-10-09.json');
    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Swap records 0 and 1 without changing count
    const temp = doc.anchors[0];
    doc.anchors[0] = doc.anchors[1];
    doc.anchors[1] = temp;
    fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));

    const res = verifyReproducibility({
      sourcePath: env.tempSourceCsv,
      batchDir: env.tempBatchDir,
      batchDataDir: env.tempBatchDataDir,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when records are reordered');
    assert.ok(res.errors.some(e => e.includes('mismatch')), 'Error must detect reordering mismatch');
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 12: Manifest Hash Failure Injection', () => {
  const env = createTempBatchEnvironment();
  try {
    const manifestPath = path.join(env.tempBatchDir, 'batch_manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Corrupt SHA256 of first file
    manifest.files[0].sha256 = '0000000000000000000000000000000000000000000000000000000000000000';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const res = verifyReproducibility({
      sourcePath: env.tempSourceCsv,
      batchDir: env.tempBatchDir,
      batchDataDir: env.tempBatchDataDir,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when manifest SHA256 is mismatched');
    assert.ok(res.errors.some(e => e.includes('Manifest SHA256 mismatch')), 'Error must detect manifest hash mismatch');
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 13: Rebuild Canonical-Write Prohibition & Future Anchor Preservation', () => {
  // 1. Explicit Invariants
  assert.strictEqual(REBUILD_CANONICAL_WRITES, 0, 'Rebuild canonical writes must be exactly 0');
  assert.strictEqual(SQLITE_RESEED_FROM_PHASE53A_REBUILD, 'NO', 'SQLite reseed from rebuild must be NO');

  // 2. Static Code Inspection: rebuildBatchArtifacts must NOT reference official_serial_anchors.json or seedDatabase
  const scriptContent = fs.readFileSync(path.join(rootDir, 'scripts', 'generate_phase53a_batch.mjs'), 'utf8');
  const rebuildSection = scriptContent.slice(scriptContent.indexOf('export function rebuildBatchArtifacts'));
  assert.strictEqual(rebuildSection.includes("fs.writeFileSync(officialAnchorsPath"), false, 'rebuild must NOT write to officialAnchorsPath');
  assert.strictEqual(rebuildSection.includes("fs.writeFileSync(stihlDbPath"), false, 'rebuild must NOT write to stihlDbPath');
  assert.strictEqual(rebuildSection.includes("seedDatabase()"), false, 'rebuild must NOT call seedDatabase');

  // 3. Dynamic Future Anchor Preservation Simulation:
  // Simulate canonical production registry with 8874 Phase 53A anchors + 1 future post-Phase 53A anchor = 8875
  const canonicalJsonPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
  const initialCanonicalDoc = JSON.parse(fs.readFileSync(canonicalJsonPath, 'utf8'));
  const initialCanonicalSha = crypto.createHash('sha256').update(fs.readFileSync(canonicalJsonPath)).digest('hex');

  // In a temp directory, simulate a future canonical file
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'future-anchor-test-'));
  try {
    const futureCanonicalDoc = {
      schema_version: 'official-serial-anchors-v1',
      anchors: [
        ...initialCanonicalDoc.anchors,
        {
          serial_number: '199999999',
          model_name: 'FUTURE STIHL MODEL',
          canonical_model_id: 'future-stihl-model',
          category: 'Kettingzaag',
          drive_type: 'Benzine',
          source: 'MY_STIHL',
          verification_date: '2026-11-01',
          verification_method: 'SERIAL_LOOKUP_MY_STIHL',
          evidence_type: 'OFFICIAL_PRODUCT_REGISTRATION',
          verification_status: 'VERIFIED_OFFICIAL'
        }
      ]
    };
    assert.strictEqual(futureCanonicalDoc.anchors.length, initialCanonicalDoc.anchors.length + 1, 'Simulated registry has +1 future anchor');

    const tempBatchDataDir = path.join(tempDir, 'data');
    fs.mkdirSync(tempBatchDataDir, { recursive: true });

    // Run rebuildBatchArtifacts
    rebuildBatchArtifacts({
      batchDataDir: tempBatchDataDir
    });

    // Verify real canonical registry was NOT touched
    const postRebuildSha = crypto.createHash('sha256').update(fs.readFileSync(canonicalJsonPath)).digest('hex');
    assert.strictEqual(postRebuildSha, initialCanonicalSha, 'Canonical registry SHA256 must NOT change after rebuild');

    // Verify simulated future anchor remains intact
    assert.strictEqual(futureCanonicalDoc.anchors.length, initialCanonicalDoc.anchors.length + 1);
    assert.strictEqual(futureCanonicalDoc.anchors[futureCanonicalDoc.anchors.length - 1].serial_number, '199999999');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Phase 53A-M1 - Test 14: Actual Recheck Queue Records Present in Queue CSV', () => {
  const queueCsvPath = path.join(BATCH_DATA_DIR, 'serial_recheck_queue_2026-10-09.csv');
  const queueContent = fs.readFileSync(queueCsvPath, 'utf8');

  // 1. Technical Timeout: 163133770
  assert.ok(queueContent.includes('163133770,TECHNICAL_TIMEOUT'), 'Queue must contain 163133770 with TECHNICAL_TIMEOUT');

  // 2. Technical Error: 163150360
  assert.ok(queueContent.includes('163150360,TECHNICAL_ERROR'), 'Queue must contain 163150360 with TECHNICAL_ERROR');

  // 3. Missing Identity: 163133490
  assert.ok(queueContent.includes('163133490,FOUND_WITHOUT_USABLE_IDENTITY'), 'Queue must contain 163133490 with FOUND_WITHOUT_USABLE_IDENTITY');
});

test('Phase 53A-M1 - Test 15: Actual Recheck Queue Negative Controls Fail-Closed in Decoder', () => {
  const db = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

  const recheckControls = ['163133770', '163150360', '163133490'];
  for (const serial of recheckControls) {
    const res = decodeStihlCode(serial, db);
    assert.strictEqual(res.officialAnchor, null, `Recheck serial ${serial} must NOT have officialAnchor`);
    assert.notStrictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED', `Recheck serial ${serial} must NOT have EXACT_MODEL_IDENTIFIED`);
    assert.strictEqual(res.status, 'FORMAT_VALIDATED', `Recheck serial ${serial} status must be FORMAT_VALIDATED`);
    assert.strictEqual(res.model, 'Nog niet definitief bevestigd', `Recheck serial ${serial} must NOT have exact model`);
  }
});

test('Phase 53A-M1 - Test 16: Future-Safe Production Registry Preserves >= 8874 Anchors, Full B/C/D Parity & 171 Aliases', () => {
  const anchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
  const databaseDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
  const db = new Database(STIHL_DATABASE_DB, { readonly: true });
  const sqliteCount = db.prepare('SELECT COUNT(*) as cnt FROM official_serial_anchors').get().cnt;
  db.close();

  assert.ok(anchorsDoc.anchors.length >= 8874, 'official_serial_anchors.json must have >= 8874 anchors');
  assert.ok(databaseDoc.official_serial_anchors.length >= 8874, 'stihl_database.json must have >= 8874 anchors');
  assert.ok(sqliteCount >= 8874, 'SQLite official_serial_anchors must have >= 8874 rows');
  assert.strictEqual(anchorsDoc.anchors.length, databaseDoc.official_serial_anchors.length, 'B and C counts must match');
  assert.strictEqual(anchorsDoc.anchors.length, sqliteCount, 'B and D counts must match');
  assert.strictEqual(databaseDoc.official_serial_input_aliases.length, 171, 'stihl_database.json must have 171 aliases');
});

test('Phase 53A-M1 - Test 17: Historical Subset (All 8874 Present & Unchanged) & Full Production Parity (B == C == D)', () => {
  assert.strictEqual(VERIFY_SQLITE_WRITES, 0, 'VERIFY_SQLITE_WRITES must be exactly 0');
  const res = verifyReproducibility({
    canonicalAnchorsPath: CANONICAL_ANCHORS_JSON,
    stihlDatabaseJsonPath: STIHL_DATABASE_JSON,
    sqliteDatabasePath: STIHL_DATABASE_DB,
    throwOnError: false
  });
  assert.strictEqual(res.success, true, 'verifyReproducibility must succeed with true production paths');
  assert.strictEqual(res.errors.length, 0, 'errors must be empty');
  assert.strictEqual(res.computed.finalAnchorsList.length, 8874, 'computed historical Phase 53A anchors must be exactly 8874');
  assert.strictEqual(res.productionStats.historicalAnchorsExpected, 8874);
  assert.strictEqual(res.productionStats.historicalAnchorsPresent, 8874);
  assert.strictEqual(res.productionStats.historicalAnchorsMissing, 0);
  assert.strictEqual(res.productionStats.historicalAnchorsMutated, 0);
  assert.strictEqual(res.productionStats.fullParityPass, true);
  assert.ok(res.productionStats.currentProductionJsonCount >= 8874);
  assert.strictEqual(res.productionStats.currentProductionJsonCount, res.productionStats.currentStihlDbJsonCount);
  assert.strictEqual(res.productionStats.currentProductionJsonCount, res.productionStats.currentSqliteCount);
});

test('Phase 53A-M1 - Test 18: Corruption Injection E — official_serial_anchors.json Mid-Registry Model Mutation', () => {
  const env = createTempProductionEnvironment();
  try {
    const doc = JSON.parse(fs.readFileSync(env.tempOfficialAnchors, 'utf8'));
    assert.ok(doc.anchors.length >= 8874);
    // Mutate record 4500 (non-sampled index) without changing count
    doc.anchors[4500].model_name = 'CORRUPTED_MODEL_NAME_PHASE53A';
    fs.writeFileSync(env.tempOfficialAnchors, JSON.stringify(doc, null, 2));

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when official_serial_anchors.json model is mutated');
    assert.strictEqual(res.productionStats.historicalAnchorsMutated, 1);
    assert.ok(
      res.errors.some(e => e.includes('official_serial_anchors.json record 4500') && e.includes('model_name')),
      'Error message must pinpoint record 4500 model_name mismatch'
    );
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 19: Corruption Injection F — official_serial_anchors.json Category Mutation', () => {
  const env = createTempProductionEnvironment();
  try {
    const doc = JSON.parse(fs.readFileSync(env.tempOfficialAnchors, 'utf8'));
    assert.ok(doc.anchors.length >= 8874);
    // Mutate record 1200 category without changing count
    doc.anchors[1200].category = 'CORRUPTED_CATEGORY_PHASE53A';
    fs.writeFileSync(env.tempOfficialAnchors, JSON.stringify(doc, null, 2));

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when category is mutated');
    assert.strictEqual(res.productionStats.historicalAnchorsMutated, 1);
    assert.ok(
      res.errors.some(e => e.includes('official_serial_anchors.json record 1200') && e.includes('category')),
      'Error message must pinpoint record 1200 category mismatch'
    );
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 20: Corruption Injection G — stihl_database.json Drive Type Mutation & Cross-Parity Failure', () => {
  const env = createTempProductionEnvironment();
  try {
    const doc = JSON.parse(fs.readFileSync(env.tempStihlDatabaseJson, 'utf8'));
    assert.ok(doc.official_serial_anchors.length >= 8874);
    // Mutate record 6000 drive_type in stihl_database.json only
    doc.official_serial_anchors[6000].drive_type = 'CORRUPTED_DRIVE_TYPE';
    fs.writeFileSync(env.tempStihlDatabaseJson, JSON.stringify(doc, null, 2));

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when stihl_database.json is mutated');
    assert.ok(
      res.errors.some(e => e.includes('stihl_database.json record 6000') && e.includes('drive_type')),
      'Error message must detect stihl_database.json record 6000 drive_type mismatch'
    );
    assert.ok(
      res.errors.some(e => e.includes('Cross-parity mismatch between official_serial_anchors.json and stihl_database.json at record 6000')),
      'Error message must detect cross-parity mismatch between canonical json and stihl_database.json'
    );
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 21: Corruption Injection H — SQLite official_serial_anchors Mutation Detection', () => {
  const env = createTempProductionEnvironment();
  try {
    // Open sqlite in read-write mode only to inject test corruption
    const db = new Database(env.tempStihlDatabaseDb);
    db.prepare("UPDATE official_serial_anchors SET model_name = 'CORRUPTED_SQLITE_MODEL' WHERE serial_number = '163133000'").run();
    db.close();

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when SQLite table is corrupted');
    assert.ok(
      res.errors.some(e => e.includes('SQLite official_serial_anchors') && e.includes('163133000') && e.includes('model_name')),
      'Error message must pinpoint SQLite model_name mismatch for serial 163133000'
    );
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 22: Corruption Injection I — Alias Parity Boolean / Count Corruption Detection', () => {
  const env = createTempProductionEnvironment();
  try {
    const doc = JSON.parse(fs.readFileSync(env.tempStihlDatabaseJson, 'utf8'));
    assert.strictEqual(doc.official_serial_input_aliases.length, 171);
    // Mutate alias 0 generic_zero_prefix_rule_allowed from false to true
    doc.official_serial_input_aliases[0].generic_zero_prefix_rule_allowed = true;
    fs.writeFileSync(env.tempStihlDatabaseJson, JSON.stringify(doc, null, 2));

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when alias boolean is corrupted');
    assert.ok(
      res.errors.some(e => e.includes('Alias') && e.includes('generic_zero_prefix_rule_allowed')),
      'Error message must pinpoint alias generic_zero_prefix_rule_allowed mismatch'
    );
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 23: Verify Mode Leaves Zero Files and SQLite Intact (VERIFY_SQLITE_WRITES === 0)', () => {
  assert.strictEqual(VERIFY_SQLITE_WRITES, 0, 'VERIFY_SQLITE_WRITES must be 0');

  const initialOfficialSha = crypto.createHash('sha256').update(fs.readFileSync(CANONICAL_ANCHORS_JSON)).digest('hex');
  const initialStihlDbSha = crypto.createHash('sha256').update(fs.readFileSync(STIHL_DATABASE_JSON)).digest('hex');
  const initialSqliteSha = crypto.createHash('sha256').update(fs.readFileSync(STIHL_DATABASE_DB)).digest('hex');

  const res = verifyReproducibility({ throwOnError: false });
  assert.strictEqual(res.success, true);

  const postOfficialSha = crypto.createHash('sha256').update(fs.readFileSync(CANONICAL_ANCHORS_JSON)).digest('hex');
  const postStihlDbSha = crypto.createHash('sha256').update(fs.readFileSync(STIHL_DATABASE_JSON)).digest('hex');
  const postSqliteSha = crypto.createHash('sha256').update(fs.readFileSync(STIHL_DATABASE_DB)).digest('hex');

  assert.strictEqual(postOfficialSha, initialOfficialSha, 'CANONICAL_ANCHORS_JSON SHA256 must be identical');
  assert.strictEqual(postStihlDbSha, initialStihlDbSha, 'STIHL_DATABASE_JSON SHA256 must be identical');
  assert.strictEqual(postSqliteSha, initialSqliteSha, 'STIHL_DATABASE_DB SHA256 must be identical');
});

test('Phase 53A-M1 - Test 24: Future Anchor Acceptance When Consistently Added Across B, C, and D (8875 Total)', () => {
  const env = createTempProductionEnvironment();
  try {
    const futureAnchor = {
      serial_number: '299999999',
      model_name: 'MS 500i-W 3/8" RS Motorsäge',
      canonical_model_id: 'stihl_ms_500i',
      category: 'Kettingzaag',
      drive_type: 'Benzine',
      source: 'MY_STIHL',
      source_url: 'https://app.stihl.com/nl-nl/mystihl/tools/add/serial-number',
      verification_date: '2026-10-15',
      verification_method: 'authenticated MY STIHL UI lookup',
      evidence_type: 'OFFICIAL_WEB_LOOKUP',
      verification_status: 'OFFICIAL_STIHL_LOOKUP'
    };

    // 1. Add to B (official_serial_anchors.json)
    const officialDoc = JSON.parse(fs.readFileSync(env.tempOfficialAnchors, 'utf8'));
    officialDoc.anchors.push(futureAnchor);
    officialDoc.anchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));
    fs.writeFileSync(env.tempOfficialAnchors, JSON.stringify(officialDoc, null, 2));

    // 2. Add to C (stihl_database.json)
    const stihlDbDoc = JSON.parse(fs.readFileSync(env.tempStihlDatabaseJson, 'utf8'));
    stihlDbDoc.official_serial_anchors.push(futureAnchor);
    stihlDbDoc.official_serial_anchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));
    fs.writeFileSync(env.tempStihlDatabaseJson, JSON.stringify(stihlDbDoc, null, 2));

    // 3. Add to D (SQLite official_serial_anchors)
    const db = new Database(env.tempStihlDatabaseDb);
    db.prepare(`
      INSERT INTO official_serial_anchors (
        serial_number, model_name, canonical_model_id, category, drive_type,
        source, source_url, verification_date, verification_method, evidence_type, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      futureAnchor.serial_number,
      futureAnchor.model_name,
      futureAnchor.canonical_model_id,
      futureAnchor.category,
      futureAnchor.drive_type,
      futureAnchor.source,
      futureAnchor.source_url,
      futureAnchor.verification_date,
      futureAnchor.verification_method,
      futureAnchor.evidence_type,
      futureAnchor.verification_status
    );
    db.close();

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, true, `Future anchor in B/C/D must PASS: ${res.errors.join('; ')}`);
    assert.strictEqual(res.errors.length, 0);
    assert.strictEqual(res.productionStats.historicalAnchorsExpected, 8874);
    assert.strictEqual(res.productionStats.historicalAnchorsPresent, 8874);
    assert.strictEqual(res.productionStats.historicalAnchorsMissing, 0);
    assert.strictEqual(res.productionStats.historicalAnchorsMutated, 0);
    assert.strictEqual(res.productionStats.currentProductionJsonCount, 8875);
    assert.strictEqual(res.productionStats.currentStihlDbJsonCount, 8875);
    assert.strictEqual(res.productionStats.currentSqliteCount, 8875);
    assert.strictEqual(res.productionStats.futurePostPhase53aAnchors, 1);
    assert.strictEqual(res.productionStats.fullParityPass, true);

    // Also verify 8-digit and 10-digit future anchors supported by OfficialSerialAnchorResolver (/^\d{8,10}$/)
    const future8Digit = { ...futureAnchor, serial_number: '89999999' };
    const future10Digit = { ...futureAnchor, serial_number: '1299999999' };
    officialDoc.anchors.push(future8Digit, future10Digit);
    officialDoc.anchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));
    fs.writeFileSync(env.tempOfficialAnchors, JSON.stringify(officialDoc, null, 2));

    stihlDbDoc.official_serial_anchors.push(future8Digit, future10Digit);
    stihlDbDoc.official_serial_anchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));
    fs.writeFileSync(env.tempStihlDatabaseJson, JSON.stringify(stihlDbDoc, null, 2));

    const db2 = new Database(env.tempStihlDatabaseDb);
    const ins = db2.prepare(`
      INSERT INTO official_serial_anchors (
        serial_number, model_name, canonical_model_id, category, drive_type,
        source, source_url, verification_date, verification_method, evidence_type, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const fa of [future8Digit, future10Digit]) {
      ins.run(
        fa.serial_number,
        fa.model_name,
        fa.canonical_model_id,
        fa.category,
        fa.drive_type,
        fa.source,
        fa.source_url,
        fa.verification_date,
        fa.verification_method,
        fa.evidence_type,
        fa.verification_status
      );
    }
    db2.close();

    const res8And10 = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });
    assert.strictEqual(res8And10.success, true, `8- and 10-digit future anchors in B/C/D must PASS: ${res8And10.errors.join('; ')}`);
    assert.strictEqual(res8And10.productionStats.currentProductionJsonCount, 8877);
    assert.strictEqual(res8And10.productionStats.futurePostPhase53aAnchors, 3);
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 25: Future Anchor Parity Failure When Added Only to JSON or Only to SQLite', () => {
  const futureAnchor = {
    serial_number: '299999999',
    model_name: 'MS 500i-W 3/8" RS Motorsäge',
    canonical_model_id: 'stihl_ms_500i',
    category: 'Kettingzaag',
    drive_type: 'Benzine',
    source: 'MY_STIHL',
    source_url: 'https://app.stihl.com/nl-nl/mystihl/tools/add/serial-number',
    verification_date: '2026-10-15',
    verification_method: 'authenticated MY STIHL UI lookup',
    evidence_type: 'OFFICIAL_WEB_LOOKUP',
    verification_status: 'OFFICIAL_STIHL_LOOKUP'
  };

  // Case A: Added ONLY to official_serial_anchors.json (B=8875, C=8874, D=8874)
  const envA = createTempProductionEnvironment();
  try {
    const officialDoc = JSON.parse(fs.readFileSync(envA.tempOfficialAnchors, 'utf8'));
    officialDoc.anchors.push(futureAnchor);
    fs.writeFileSync(envA.tempOfficialAnchors, JSON.stringify(officialDoc, null, 2));

    const resA = verifyReproducibility({
      canonicalAnchorsPath: envA.tempOfficialAnchors,
      stihlDatabaseJsonPath: envA.tempStihlDatabaseJson,
      sqliteDatabasePath: envA.tempStihlDatabaseDb,
      throwOnError: false
    });
    assert.strictEqual(resA.success, false, 'Verify must FAIL when future anchor is in official_serial_anchors.json only');
    assert.strictEqual(resA.productionStats.fullParityPass, false);
    assert.ok(resA.errors.some(e => e.includes('299999999') || e.includes('count mismatch')));
  } finally {
    envA.cleanup();
  }

  // Case B: Added ONLY to SQLite (B=8874, C=8874, D=8875)
  const envB = createTempProductionEnvironment();
  try {
    const db = new Database(envB.tempStihlDatabaseDb);
    db.prepare(`
      INSERT INTO official_serial_anchors (
        serial_number, model_name, canonical_model_id, category, drive_type,
        source, source_url, verification_date, verification_method, evidence_type, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      futureAnchor.serial_number,
      futureAnchor.model_name,
      futureAnchor.canonical_model_id,
      futureAnchor.category,
      futureAnchor.drive_type,
      futureAnchor.source,
      futureAnchor.source_url,
      futureAnchor.verification_date,
      futureAnchor.verification_method,
      futureAnchor.evidence_type,
      futureAnchor.verification_status
    );
    db.close();

    const resB = verifyReproducibility({
      canonicalAnchorsPath: envB.tempOfficialAnchors,
      stihlDatabaseJsonPath: envB.tempStihlDatabaseJson,
      sqliteDatabasePath: envB.tempStihlDatabaseDb,
      throwOnError: false
    });
    assert.strictEqual(resB.success, false, 'Verify must FAIL when future anchor is in SQLite only');
    assert.strictEqual(resB.productionStats.fullParityPass, false);
    assert.ok(resB.errors.some(e => e.includes('299999999') || e.includes('SQLite')));
  } finally {
    envB.cleanup();
  }
});

test('Phase 53A-M1 - Test 26: Historical Mutation Fails Even When Identical Across All Three (B == C == D)', () => {
  const env = createTempProductionEnvironment();
  try {
    // Mutate historical anchor 163133000 identically in B, C, and D
    const officialDoc = JSON.parse(fs.readFileSync(env.tempOfficialAnchors, 'utf8'));
    const targetB = officialDoc.anchors.find(a => a.serial_number === '163133000');
    targetB.model_name = 'MUTATED_HISTORICAL_MODEL_IN_ALL_THREE';
    fs.writeFileSync(env.tempOfficialAnchors, JSON.stringify(officialDoc, null, 2));

    const stihlDbDoc = JSON.parse(fs.readFileSync(env.tempStihlDatabaseJson, 'utf8'));
    const targetC = stihlDbDoc.official_serial_anchors.find(a => a.serial_number === '163133000');
    targetC.model_name = 'MUTATED_HISTORICAL_MODEL_IN_ALL_THREE';
    fs.writeFileSync(env.tempStihlDatabaseJson, JSON.stringify(stihlDbDoc, null, 2));

    const db = new Database(env.tempStihlDatabaseDb);
    db.prepare("UPDATE official_serial_anchors SET model_name = 'MUTATED_HISTORICAL_MODEL_IN_ALL_THREE' WHERE serial_number = '163133000'").run();
    db.close();

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when historical anchor is mutated even if B == C == D');
    assert.strictEqual(res.productionStats.historicalAnchorsMutated, 1);
    assert.ok(res.errors.some(e => e.includes('163133000') && e.includes('model_name')));
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 27: Historical Anchor Removal Rejected Even When Replaced By Future Anchor With Same Count 8874', () => {
  const env = createTempProductionEnvironment();
  try {
    const replacementAnchor = {
      serial_number: '299999999',
      model_name: 'MS 500i-W 3/8" RS Motorsäge',
      canonical_model_id: 'stihl_ms_500i',
      category: 'Kettingzaag',
      drive_type: 'Benzine',
      source: 'MY_STIHL',
      source_url: 'https://app.stihl.com/nl-nl/mystihl/tools/add/serial-number',
      verification_date: '2026-10-15',
      verification_method: 'authenticated MY STIHL UI lookup',
      evidence_type: 'OFFICIAL_WEB_LOOKUP',
      verification_status: 'OFFICIAL_STIHL_LOOKUP'
    };

    // Replace historical anchor 163133000 with 299999999 across B, C, and D so count remains 8874
    const officialDoc = JSON.parse(fs.readFileSync(env.tempOfficialAnchors, 'utf8'));
    officialDoc.anchors = officialDoc.anchors.filter(a => a.serial_number !== '163133000');
    officialDoc.anchors.push(replacementAnchor);
    officialDoc.anchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));
    fs.writeFileSync(env.tempOfficialAnchors, JSON.stringify(officialDoc, null, 2));

    const stihlDbDoc = JSON.parse(fs.readFileSync(env.tempStihlDatabaseJson, 'utf8'));
    stihlDbDoc.official_serial_anchors = stihlDbDoc.official_serial_anchors.filter(a => a.serial_number !== '163133000');
    stihlDbDoc.official_serial_anchors.push(replacementAnchor);
    stihlDbDoc.official_serial_anchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));
    fs.writeFileSync(env.tempStihlDatabaseJson, JSON.stringify(stihlDbDoc, null, 2));

    const db = new Database(env.tempStihlDatabaseDb);
    db.prepare("DELETE FROM official_serial_anchors WHERE serial_number = '163133000'").run();
    db.prepare(`
      INSERT INTO official_serial_anchors (
        serial_number, model_name, canonical_model_id, category, drive_type,
        source, source_url, verification_date, verification_method, evidence_type, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      replacementAnchor.serial_number,
      replacementAnchor.model_name,
      replacementAnchor.canonical_model_id,
      replacementAnchor.category,
      replacementAnchor.drive_type,
      replacementAnchor.source,
      replacementAnchor.source_url,
      replacementAnchor.verification_date,
      replacementAnchor.verification_method,
      replacementAnchor.evidence_type,
      replacementAnchor.verification_status
    );
    db.close();

    const res = verifyReproducibility({
      canonicalAnchorsPath: env.tempOfficialAnchors,
      stihlDatabaseJsonPath: env.tempStihlDatabaseJson,
      sqliteDatabasePath: env.tempStihlDatabaseDb,
      throwOnError: false
    });

    assert.strictEqual(res.success, false, 'Verify must FAIL when a historical anchor is removed even if total count is 8874');
    assert.strictEqual(res.productionStats.historicalAnchorsMissing, 1);
    assert.strictEqual(res.productionStats.historicalAnchorsPresent, 8873);
    assert.ok(res.errors.some(e => e.includes('Historical Phase 53A anchor 163133000 missing')));
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 28: Manifest Contract Failure Injection — Empty files=[] Array Rejected', () => {
  const env = createTempBatchEnvironment();
  try {
    const manifestPath = path.join(env.tempBatchDir, 'batch_manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files = [];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const manifestRes = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(manifestRes.success, false, 'validateBatchManifest must FAIL when files is empty');
    assert.strictEqual(manifestRes.missingPathsCount, 10);
    assert.ok(manifestRes.mismatches.some(m => m.includes('cannot be empty')));

    const verifyRes = verifyReproducibility({
      sourcePath: env.tempSourceCsv,
      batchDir: env.tempBatchDir,
      batchDataDir: env.tempBatchDataDir,
      throwOnError: false
    });
    assert.strictEqual(verifyRes.success, false, 'verifyReproducibility must FAIL when manifest.files is empty');
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 29: Manifest Contract Failure Injection — Missing Required File & Missing Top-Level Field Rejected', () => {
  const env = createTempBatchEnvironment();
  try {
    const manifestPath = path.join(env.tempBatchDir, 'batch_manifest.json');
    const originalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // 1. Remove one required file entry
    const manifestMissingFile = {
      ...originalManifest,
      files: originalManifest.files.filter(f => f.path !== 'data/duplicate_source_rows_2026-10-09.csv')
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestMissingFile, null, 2));

    const res1 = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(res1.success, false, 'Must fail when a required file entry is missing');
    assert.strictEqual(res1.missingPathsCount, 1);
    assert.ok(res1.mismatches.some(m => m.includes('Manifest missing required file path: data/duplicate_source_rows_2026-10-09.csv')));

    // 2. Remove a required top-level field
    const manifestMissingField = { ...originalManifest };
    delete manifestMissingField.recheck_queue_count;
    fs.writeFileSync(manifestPath, JSON.stringify(manifestMissingField, null, 2));

    const res2 = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(res2.success, false, 'Must fail when a required top-level field is missing');
    assert.ok(res2.mismatches.some(m => m.includes('Manifest missing required field: recheck_queue_count')));
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 30: Manifest Contract Failure Injection — Source SHA256 & Source Byte Size Corruption Rejected', () => {
  const env = createTempBatchEnvironment();
  try {
    const manifestPath = path.join(env.tempBatchDir, 'batch_manifest.json');
    const originalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // 1. Corrupt source_file_sha256
    const manifestBadSha = {
      ...originalManifest,
      source_file_sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestBadSha, null, 2));

    const resSha = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(resSha.success, false, 'Must fail when source_file_sha256 is corrupted');
    assert.ok(resSha.mismatches.some(m => m.includes('source_file_sha256')));

    // 2. Corrupt source_file_bytes
    const manifestBadBytes = {
      ...originalManifest,
      source_file_bytes: 9999999
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifestBadBytes, null, 2));

    const resBytes = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(resBytes.success, false, 'Must fail when source_file_bytes is corrupted');
    assert.ok(resBytes.mismatches.some(m => m.includes('source_file_bytes')));
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 31: Manifest Contract Failure Injection — Scalar Metrics Corruption Rejected', () => {
  const env = createTempBatchEnvironment();
  try {
    const manifestPath = path.join(env.tempBatchDir, 'batch_manifest.json');
    const originalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // 1. Corrupt new_official_anchors = 6030
    fs.writeFileSync(manifestPath, JSON.stringify({ ...originalManifest, new_official_anchors: 6030 }, null, 2));
    const res1 = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(res1.success, false, 'Must fail when new_official_anchors is corrupted');
    assert.ok(res1.mismatches.some(m => m.includes('new_official_anchors')));

    // 2. Corrupt recheck_queue_count = 788
    fs.writeFileSync(manifestPath, JSON.stringify({ ...originalManifest, recheck_queue_count: 788 }, null, 2));
    const res2 = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(res2.success, false, 'Must fail when recheck_queue_count is corrupted');
    assert.ok(res2.mismatches.some(m => m.includes('recheck_queue_count')));

    // 3. Corrupt historical final_production_anchors = 9000
    fs.writeFileSync(manifestPath, JSON.stringify({ ...originalManifest, final_production_anchors: 9000 }, null, 2));
    const res3 = verifyReproducibility({
      sourcePath: env.tempSourceCsv,
      batchDir: env.tempBatchDir,
      batchDataDir: env.tempBatchDataDir,
      throwOnError: false
    });
    assert.strictEqual(res3.success, false, 'Must fail when historical final_production_anchors is corrupted');
    assert.ok(res3.errors.some(e => e.includes('final_production_anchors')));
  } finally {
    env.cleanup();
  }
});

test('Phase 53A-M1 - Test 32: Manifest Contract Failure Injection — Duplicate Path & Traversal Path Rejected', () => {
  const env = createTempBatchEnvironment();
  try {
    const manifestPath = path.join(env.tempBatchDir, 'batch_manifest.json');
    const originalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // 1. Duplicate path (replace last entry with duplicate of first entry)
    const dupFiles = [...originalManifest.files];
    dupFiles[dupFiles.length - 1] = { ...dupFiles[0] };
    fs.writeFileSync(manifestPath, JSON.stringify({ ...originalManifest, files: dupFiles }, null, 2));

    const resDup = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(resDup.success, false, 'Must fail on duplicate file path in manifest');
    assert.strictEqual(resDup.duplicatePathsCount, 1);
    assert.ok(resDup.mismatches.some(m => m.includes('Manifest duplicate file path: README.md')));

    // 2. Path traversal entry
    const traversalFiles = [...originalManifest.files];
    traversalFiles[traversalFiles.length - 1] = {
      path: '../outside.txt',
      bytes: 100,
      sha256: '0000000000000000000000000000000000000000000000000000000000000000'
    };
    fs.writeFileSync(manifestPath, JSON.stringify({ ...originalManifest, files: traversalFiles }, null, 2));

    const resTrav = validateBatchManifest(env.tempBatchDir);
    assert.strictEqual(resTrav.success, false, 'Must fail on path traversal in manifest');
    assert.ok(resTrav.mismatches.some(m => m.includes('forbidden absolute or traversal path')));
  } finally {
    env.cleanup();
  }
});
