import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  runHygienicPipeline,
  runFailureInjections,
  buildHygienicRecord,
  parseWaybackTimestamp,
  normalizeStihlModel,
  resolvePowerSource,
  main
} from '../scripts/phase35c441_provenance_metrics_integrity_hotfix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('▶ Running Phase 35C.4.4.1 Provenance & Metrics Integrity Hotfix Test (Fixture Mode)');

// 1. Run Pipeline in Fixture Mode
const result = runHygienicPipeline({ sourceMode: 'fixture' });
const report = result.finalReport;

// 2. Mode & Isolation Assertions
assert.strictEqual(report.SOURCE_MODE, 'TEST_FIXTURE', 'SOURCE_MODE must be TEST_FIXTURE');
assert.strictEqual(report.USER_SPECIFIC_PATH_REQUIRED_FOR_TESTS, 'NO', 'USER_SPECIFIC_PATH_REQUIRED_FOR_TESTS must be NO');

// 3. Immutability & File Change Assertions
assert.strictEqual(report.PRODUCTION_FILES_CHANGED, 0, 'PRODUCTION_FILES_CHANGED must be 0');
assert.strictEqual(report.SOURCE_DATA_FILES_CHANGED, 0, 'SOURCE_DATA_FILES_CHANGED must be 0');
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_CHANGED, 'NO', 'PUBLIC_EVIDENCE_STORE_CHANGED must be NO');
assert.strictEqual(report.PUBLIC_FACT_COUNT, 124, 'PUBLIC_FACT_COUNT must be 124 in Phase 36 candidate');
assert.strictEqual(report.CANONICAL_DATABASE_CHANGED, 'NO', 'CANONICAL_DATABASE_CHANGED must be NO');

// 4. Power Source & Conservation Assertions in Fixture
assert.strictEqual(report.POWER_SOURCE_BEFORE_TOTAL, 14);
assert.strictEqual(report.POWER_SOURCE_AFTER_TOTAL, 14);
assert.strictEqual(report.POWER_SOURCE_BUCKET_CONSERVATION, 'PASS');
assert.strictEqual(report.POWER_SOURCE_CHANGE_MATRIX_CONSISTENT, 'PASS');

// 5. Provenance Audit Assertions
assert.strictEqual(report.CONFLICTING_ARCHIVE_TIMESTAMP_RECORDS, 1);

const ms211Record = result.hygienicRecords.find((r) => r.raw_model_name === 'ms211');
assert.ok(ms211Record, 'MS211 record must exist');
assert.strictEqual(ms211Record.snapshot_provenance_status, 'CONFLICTING_ARCHIVE_TIMESTAMPS');
assert.strictEqual(ms211Record.normalized_snapshot_timestamp, null);
assert.strictEqual(ms211Record.candidate_status, 'NEEDS_MANUAL_REVIEW');
assert.ok(ms211Record.review_reasons.includes('ARCHIVE_TIMESTAMP_CONFLICT'));

// 6. Candidate Status Gate Assertions
assert.strictEqual(report.SAFE_FOR_FIELD_EXTRACTION_COUNT, 9);
assert.strictEqual(report.NEEDS_MANUAL_REVIEW_COUNT, 1);
assert.strictEqual(report.SAFE_RECORDS_WITHOUT_INDEPENDENT_IDENTITY_EVIDENCE, 0);

// 7. Identity & Contamination Leaks Assertions
assert.strictEqual(report.DERIVED_DESCRIPTION_EXPLICIT_ACCEPTED, 0);
assert.strictEqual(report.DERIVED_TITLE_EXPLICIT_ACCEPTED, 0);
assert.strictEqual(report.CATEGORY_URL_TO_MACHINE_IDENTITY_LEAKS, 0);
assert.strictEqual(report.MANUAL_PAGE_TO_MACHINE_IDENTITY_LEAKS, 0);

// 8. Normalization & Misclassification Assertions
assert.strictEqual(report.MS500I_TO_MS500_COLLAPSE, 0);
assert.strictEqual(report.VARIANT_COLLAPSE_ERRORS, 0);
assert.strictEqual(report.KNOWN_BATTERY_MODEL_PETROL_MISCLASSIFICATIONS, 0);
assert.strictEqual(report.KNOWN_CORDED_MODEL_PETROL_MISCLASSIFICATIONS, 0);
assert.strictEqual(report.UNKNOWN_TO_PETROL_DEFAULTS, 0);

// 9. Failure Injections Test
const failures = runFailureInjections();
assert.strictEqual(failures.FAILURE_INJECTION, 'PASS', 'Failure injections must PASS');

console.log('✅ Phase 35C.4.4.1 Test (Fixture Mode) Passed Successfully');
