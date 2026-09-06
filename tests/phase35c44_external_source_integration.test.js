import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runHygienicPipeline, resolveStihlUsaSourcePath } from '../scripts/phase35c441_provenance_metrics_integrity_hotfix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('▶ Running Phase 35C.4.4 External Source Integration Test (Optional)');

const resolved = resolveStihlUsaSourcePath();
if (!resolved.path || !fs.existsSync(resolved.path)) {
  console.log('ℹ️ External source file unavailable. Skipping optional external integration test.');
  process.exit(0);
}

console.log(`ℹ️ Testing external real dataset at: ${resolved.path}`);
const result = runHygienicPipeline({ sourceMode: 'real' });
const report = result.finalReport;

assert.strictEqual(report.SOURCE_MODE, 'EXTERNAL_REAL');
assert.strictEqual(report.SOURCE_DATASET_SHA256, '8ae6f7b759ea120abc77873fe9f220fa4355f30c7c0b059eb208da278ec208ff');
assert.strictEqual(report.TOTAL_INPUT_RECORDS, 115);
assert.strictEqual(report.FINAL_STATUS, 'PASS');

console.log('✅ Phase 35C.4.4 External Source Integration Test Passed Successfully');
