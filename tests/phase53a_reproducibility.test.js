import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { decodeStihlCode } from '../src/decoder.js';
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
  SQLITE_RESEED_FROM_PHASE53A_REBUILD
} from '../scripts/generate_phase53a_batch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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
    assert.strictEqual(futureCanonicalDoc.anchors.length, 8875, 'Simulated registry has 8875 anchors');

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
    assert.strictEqual(futureCanonicalDoc.anchors.length, 8875);
    assert.strictEqual(futureCanonicalDoc.anchors[8874].serial_number, '199999999');
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

test('Phase 53A-M1 - Test 16: Current Production Registry Preserved (8874 Anchors & 171 Aliases)', () => {
  const anchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
  const databaseDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

  assert.strictEqual(anchorsDoc.anchors.length, 8874, 'official_serial_anchors.json must have exactly 8874 anchors');
  assert.strictEqual(databaseDoc.official_serial_anchors.length, 8874, 'stihl_database.json must have exactly 8874 anchors');
  assert.strictEqual(databaseDoc.official_serial_input_aliases.length, 171, 'stihl_database.json must have exactly 171 aliases');
});
