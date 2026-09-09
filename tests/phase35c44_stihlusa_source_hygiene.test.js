import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { main, runFailureInjections } from '../scripts/phase35c44_stihlusa_source_hygiene.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('▶ Running Phase 35C.4.4 STIHL USA Source Hygiene Test (Fixture Mode)');

const finalReport = await main({ sourceMode: 'fixture', writeArtifacts: true });

// 1. Pipeline Pass & Mode Assertions
assert.strictEqual(finalReport.FINAL_STATUS, 'PASS', 'FINAL_STATUS must be PASS');
assert.strictEqual(finalReport.SOURCE_MODE, 'TEST_FIXTURE', 'SOURCE_MODE must be TEST_FIXTURE');
assert.strictEqual(finalReport.USER_SPECIFIC_PATH_REQUIRED_FOR_TESTS, 'NO', 'USER_SPECIFIC_PATH_REQUIRED_FOR_TESTS must be NO');
assert.strictEqual(finalReport.COMMITTED, 'NO', 'COMMITTED must be NO');
assert.strictEqual(finalReport.PUSHED, 'NO', 'PUSHED must be NO');
assert.strictEqual(finalReport.DEPLOYED, 'NO', 'DEPLOYED must be NO');

// 2. Safety & Immutability Assertions
assert.strictEqual(finalReport.AUTO_PUBLIC_PROMOTIONS, 0, 'AUTO_PUBLIC_PROMOTIONS must be 0');
assert.strictEqual(finalReport.PUBLIC_EVIDENCE_STORE_CHANGED, 'NO', 'PUBLIC_EVIDENCE_STORE_CHANGED must be NO');
assert.strictEqual(finalReport.PUBLIC_FACT_COUNT, 452, 'PUBLIC_FACT_COUNT must be 452 in Phase 37A candidate');
assert.strictEqual(finalReport.SOURCE_DATASET_MUTATED, 'NO', 'SOURCE_DATASET_MUTATED must be NO');
assert.strictEqual(finalReport.CANONICAL_DATABASE_CHANGED, 'NO', 'CANONICAL_DATABASE_CHANGED must be NO');
assert.strictEqual(finalReport.PRODUCTION_CODE_CHANGED, 'NO', 'PRODUCTION_CODE_CHANGED must be NO');

// 3. Power Source & Taxonomical Normalization Assertions
assert.strictEqual(finalReport.KNOWN_BATTERY_MODEL_PETROL_MISCLASSIFICATIONS, 0, 'KNOWN_BATTERY_MODEL_PETROL_MISCLASSIFICATIONS must be 0');
assert.strictEqual(finalReport.KNOWN_CORDED_MODEL_PETROL_MISCLASSIFICATIONS, 0, 'KNOWN_CORDED_MODEL_PETROL_MISCLASSIFICATIONS must be 0');
assert.strictEqual(finalReport.UNKNOWN_TO_PETROL_DEFAULTS, 0, 'UNKNOWN_TO_PETROL_DEFAULTS must be 0');
assert.strictEqual(finalReport.MS500I_TO_MS500_COLLAPSE, 0, 'MS500I_TO_MS500_COLLAPSE must be 0');
assert.strictEqual(finalReport.VARIANT_COLLAPSE_ERRORS, 0, 'VARIANT_COLLAPSE_ERRORS must be 0');

// 4. Entity Classification & Extraction Gate Counts
assert.strictEqual(finalReport.TOTAL_RAW_RECORDS, 14, 'TOTAL_RAW_RECORDS must be 14 in fixture mode');
assert.strictEqual(finalReport.REJECTED_SOURCE_CONTAMINATION_COUNT, 2, 'REJECTED_SOURCE_CONTAMINATION_COUNT must be 2');
assert.strictEqual(finalReport.SAFE_FOR_FIELD_EXTRACTION_COUNT, 9, 'SAFE_FOR_FIELD_EXTRACTION_COUNT must be 9');
assert.strictEqual(finalReport.STIHLUSA_SOURCE_LAYER_READY_FOR_FIELD_EXTRACTION, 'YES', 'STIHLUSA_SOURCE_LAYER_READY_FOR_FIELD_EXTRACTION must be YES');

// 5. Failure Injection Assertions
const failures = runFailureInjections();
assert.strictEqual(failures.FAILURE_INJECTION, 'PASS', 'Failure injection suite must PASS');

// 6. Artifact Verification in data/
const requiredArtifacts = [
  'phase35c44_preflight_report.json',
  'phase35c44_dataset_inventory.json',
  'phase35c44_entity_type_audit.json',
  'phase35c44_synthetic_text_audit.json',
  'phase35c44_model_normalization_audit.json',
  'phase35c44_power_source_audit.json',
  'phase35c44_provenance_audit.json',
  'phase35c44_deduplication_audit.json',
  'phase35c44_manual_review_queue.json',
  'phase35c44_failure_injection_report.json',
  'phase35c44_immutability_report.json',
  'phase35c44_final_report.json',
  'stihlusa_knowledge_graph_hygienic_candidate.json'
];

for (const artifact of requiredArtifacts) {
  const filePath = path.join(rootDir, 'data', artifact);
  assert.ok(fs.existsSync(filePath), `Artifact ${artifact} must exist in data/`);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.ok(content, `Artifact ${artifact} must be valid JSON`);
}

console.log('✅ Phase 35C.4.4 Test (Fixture Mode) Passed Successfully');
