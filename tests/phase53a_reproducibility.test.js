import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { decodeStihlCode } from '../src/decoder.js';
import {
  runBatchProcessing,
  verifyReproducibility,
  KNOWN_SOURCE_SHA256,
  KNOWN_SOURCE_BYTES,
  KNOWN_PRE_IMPORT_BASELINE_SHA256,
  KNOWN_PRE_IMPORT_BASELINE_ANCHORS,
  DEFAULT_SOURCE_CSV,
  DEFAULT_BASELINE_JSON,
  BATCH_DATA_DIR
} from '../scripts/generate_phase53a_batch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

test('Phase 53A-M1 - Test 4: Idempotence & Exact Metrics on Successive Verify Runs (#1 & #2)', () => {
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

  // Verify that new anchors did not collapse into 0 on rerun!
  assert.notStrictEqual(run2.newAnchorsOnly.length, 0, 'New anchors must NOT be 0 on rerun');
  assert.notStrictEqual(run2.reconfirmedAnchors.length, 6031, 'Reconfirmed anchors must NOT be 6031 on rerun');
});

test('Phase 53A-M1 - Test 5: Verify Mode Causes Zero Repository Mutations', () => {
  const result = spawnSync('node', ['scripts/generate_phase53a_batch.mjs', '--verify'], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  assert.strictEqual(result.status, 0, `Verify script exited with code ${result.status}: ${result.stderr}`);
  assert.ok(result.stdout.includes('ALL REPRODUCIBILITY CHECKS PASSED PERFECTLY'));
});

test('Phase 53A-M1 - Test 6: Actual Recheck Queue Records Present in Queue CSV', () => {
  const queueCsvPath = path.join(BATCH_DATA_DIR, 'serial_recheck_queue_2026-10-09.csv');
  const queueContent = fs.readFileSync(queueCsvPath, 'utf8');

  // 1. Technical Timeout: 163133770
  assert.ok(queueContent.includes('163133770,TECHNICAL_TIMEOUT'), 'Queue must contain 163133770 with TECHNICAL_TIMEOUT');

  // 2. Technical Error: 163150360
  assert.ok(queueContent.includes('163150360,TECHNICAL_ERROR'), 'Queue must contain 163150360 with TECHNICAL_ERROR');

  // 3. Missing Identity: 163133490
  assert.ok(queueContent.includes('163133490,FOUND_WITHOUT_USABLE_IDENTITY'), 'Queue must contain 163133490 with FOUND_WITHOUT_USABLE_IDENTITY');
});

test('Phase 53A-M1 - Test 7: Actual Recheck Queue Negative Controls Fail-Closed in Decoder', () => {
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

test('Phase 53A-M1 - Test 8: Current Production Registry Preserved (8874 Anchors & 171 Aliases)', () => {
  const anchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
  const databaseDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

  assert.strictEqual(anchorsDoc.anchors.length, 8874, 'official_serial_anchors.json must have exactly 8874 anchors');
  assert.strictEqual(databaseDoc.official_serial_anchors.length, 8874, 'stihl_database.json must have exactly 8874 anchors');
  assert.strictEqual(databaseDoc.official_serial_input_aliases.length, 171, 'stihl_database.json must have exactly 171 aliases');
});
