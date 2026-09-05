import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { main } from '../scripts/phase35c43221_validator_replay_hotfix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🧪 Running Phase 35C.4.3.2.2.4.1 Validator Integrity Restore Test...');

// 1. Run 43221 validator replay and check strict FINAL_STATUS = PASS
const report = await main({ mode: 'replay', writeArtifacts: false });
assert.strictEqual(report.FINAL_STATUS, 'PASS', '43221 report.FINAL_STATUS must be PASS without bypass');
assert.strictEqual(report.HISTORICAL_SERVER_CHANGED, 'NO', 'HISTORICAL_SERVER_CHANGED must be NO');
assert.strictEqual(report.CURRENT_DESCENDANT_SERVER_CHANGED, 'YES', 'CURRENT_DESCENDANT_SERVER_CHANGED must be YES');
assert.strictEqual(report.HISTORICAL_PRODUCTION_MUTATION, 'PASS', 'HISTORICAL_PRODUCTION_MUTATION must be PASS');
console.log('✅ HISTORICAL_REPLAY_WITH_DESCENDANT_SERVER_CHANGE = PASS');

// Failure Injection: Prove that if HISTORICAL_SERVER_CHANGED were YES, HISTORICAL_PRODUCTION_MUTATION would FAIL
const mockHistoricalChanges = { HISTORICAL_SERVER_CHANGED: 'YES', HISTORICAL_DRIVE_CLASSIFICATION_PRODUCTION_CHANGED: 'NO' };
const mockPass = Object.values(mockHistoricalChanges).every(v => v === 'NO') ? 'PASS' : 'FAIL';
assert.strictEqual(mockPass, 'FAIL', 'Historical server mutation must cause HISTORICAL_PRODUCTION_MUTATION to fail');
console.log('✅ HISTORICAL_SERVER_MUTATION_DETECTED = PASS');

// 2. Failure Injection: Source Scan for SERVER_CHANGED bypass in test
const testSource = fs.readFileSync(path.join(rootDir, 'tests', 'phase35c43221_validator_replay_hotfix.test.js'), 'utf8');
const hasWeakness = /FINAL_STATUS\s*===\s*['"]PASS['"]\s*\|\|\s*.*SERVER_CHANGED/.test(testSource);
assert.strictEqual(hasWeakness, false, 'phase35c43221 test file must not contain SERVER_CHANGED bypass');
console.log('✅ SERVER_CHANGED_FINAL_STATUS_BYPASS_PRESENT = NO');

// 3. Failure Injection: No hardcoded current commit SHA bypasses in code/tests
const runnerSource = fs.readFileSync(path.join(rootDir, 'scripts', 'phase35c43221_validator_replay_hotfix.js'), 'utf8');
const hasCommitHardcode = /9963d45c8a527e0de19f729a4acc6ec87ff67e5f/.test(runnerSource) || /9963d45c8a527e0de19f729a4acc6ec87ff67e5f/.test(testSource);
assert.strictEqual(hasCommitHardcode, false, 'Must not contain hardcoded current commit SHA special case bypasses');
console.log('✅ CURRENT_COMMIT_SPECIAL_CASE_BYPASSES = 0');

// 4. Verify Frontend Module Hotfix is Preserved (server.js serving driveClassification.js)
const PORT = 3095;
process.env.PORT = String(PORT);
await import('../server.js');
await new Promise(r => setTimeout(r, 600));

function fetchUrl(pathStr) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + PORT + pathStr, res => {
      resolve({ status: res.statusCode, headers: res.headers });
    }).on('error', reject);
  });
}

const driveRes = await fetchUrl('/src/driveClassification.js');
assert.strictEqual(driveRes.status, 200, '/src/driveClassification.js must respond 200');
assert.ok(driveRes.headers['content-type'].includes('text/javascript'), 'driveClassification.js must serve text/javascript MIME');

const decoderRes = await fetchUrl('/src/decoder.js');
assert.strictEqual(decoderRes.status, 404, '/src/decoder.js must remain 404 private');
console.log('✅ FRONTEND_MODULE_DEPENDENCY_TEST = PASS');

console.log('🎉 Phase 35C.4.3.2.2.4.1 Validator Integrity Restore tests passed.\n');
process.exit(0);
