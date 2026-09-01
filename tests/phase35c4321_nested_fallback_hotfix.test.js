import assert from 'assert';
import fs from 'fs';
import { execFileSync } from 'child_process';

import { main as runPhase35c4321, SOURCE_COMMIT, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256 } from '../scripts/phase35c4321_nested_fallback_hotfix.js';

console.log('Starting Phase 35C.4.3.2.1 nested fallback hotfix tests...');

const publicStorePath = new URL('../data/public_evidence_facts.json', import.meta.url);
const immutableStore = execFileSync('git', ['show', `${SOURCE_COMMIT}:data/public_evidence_facts.json`], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 64
});
fs.writeFileSync(publicStorePath, immutableStore, 'utf8');

const report = await runPhase35c4321();

assert.strictEqual(report.SOURCE_COMMIT, SOURCE_COMMIT);
assert.strictEqual(report.PRECHECK, 'PASS');
assert.strictEqual(report.PUBLIC_STORE_CANONICAL_SHA256_BEFORE, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.PUBLIC_STORE_CANONICAL_SHA256_AFTER, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.PUBLIC_STORE_CHANGED, 'NO');
assert.strictEqual(report.PUBLIC_FACT_COUNT, 114);
assert.strictEqual(report.TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(report.NESTED_RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(report.TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(report.TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT, 0);
assert.strictEqual(report.TECHNICAL_SPEC_VALUE_MISMATCHES, 0);
assert.strictEqual(report.CROSS_MODEL_TECHNICAL_FACT_LEAKS, 0);
assert.strictEqual(report.FAMILY_LEVEL_TECHNICAL_INHERITANCE, 0);
assert.strictEqual(report.NON_TECHNICAL_KEYS_INSIDE_TECHNICALSPECS, 0);
assert.strictEqual(report.RAW_MODEL_OBJECT_ASSIGNED_TO_TECHNICALSPECS, 0);
assert.deepStrictEqual(report.MS170_TECHNICAL_SPECS, {});
assert.deepStrictEqual(report.MS180_TECHNICAL_SPECS, {});
assert.deepStrictEqual(report.MS261_TECHNICAL_SPECS, {});
assert.deepStrictEqual(report.MS261CM_TECHNICAL_SPECS, {});
assert.strictEqual(report.MS261CM_TO_MS261_SPEC_INHERITANCE, 0);
assert.strictEqual(report.VARIANT_SPEC_LEAKS, 0);
assert.strictEqual(report.FUZZY_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PROBABLE_SERIAL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PART_NUMBER_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.NUMERIC_TOKEN_MODEL_COLLISIONS, 0);
assert.strictEqual(report['026_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(report['046_STROKE_STATUS'], 'OFFICIAL_CONFLICTED');
assert.strictEqual(report['046_STROKE_SINGLE_VALUE_ELIGIBLE'], false);
assert.strictEqual(report['046_CONFLICT_RUNTIME'], 'PASS');
assert.strictEqual(report.FS350_SCOPE_RUNTIME, 'PASS');
assert.strictEqual(report.SCHEMA_UNEVIDENCED_TECHNICAL_PROPERTIES, 0);
assert.strictEqual(report.PASSPORT_UNEVIDENCED_DEFAULTS, 0);
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_ACTIVATED, 'YES');
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_PROMOTED, 'YES');
assert.strictEqual(report.DEPLOYED, 'NO');
assert.strictEqual(report.CANONICAL_DATABASE_CHANGED, 'NO');
assert.strictEqual(report.UNEXPECTED_CANONICAL_PROMOTIONS, 0);
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const storeAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_public_store_immutability_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(storeAudit.PUBLIC_STORE_CANONICAL_SHA256_BEFORE, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(storeAudit.PUBLIC_STORE_CANONICAL_SHA256_AFTER, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(storeAudit.PUBLIC_STORE_CANONICAL_SHA256_AFTER_TESTS, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(storeAudit.PUBLIC_STORE_CHANGED, 'NO');

const apiAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_api_recursive_fallback_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(apiAudit.TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(apiAudit.NESTED_RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(apiAudit.TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(apiAudit.TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT, 0);
assert.strictEqual(apiAudit.TECHNICAL_SPEC_VALUE_MISMATCHES, 0);
assert.strictEqual(apiAudit.CROSS_MODEL_TECHNICAL_FACT_LEAKS, 0);
assert.strictEqual(apiAudit.NON_TECHNICAL_KEYS_INSIDE_TECHNICALSPECS, 0);
assert.ok(apiAudit.records.every((row) => row.pass === true));

const variantAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_variant_regression_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(variantAudit.MS261CM_TO_MS261_SPEC_INHERITANCE, 0);
assert.strictEqual(variantAudit.VARIANT_SPEC_LEAKS, 0);
assert.ok(variantAudit.records.every((row) => row.pass === true));

const bindingAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_public_fact_binding_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(bindingAudit.MS170_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE, 0);
assert.strictEqual(bindingAudit.MS180_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE, 0);
assert.strictEqual(bindingAudit.MS261_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE, 0);
assert.strictEqual(bindingAudit.FAMILY_LEVEL_TECHNICAL_INHERITANCE, 0);
assert.strictEqual(bindingAudit.POSITIVE_BASE_QUERIES_PASS, 'PASS');

const activationAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_activation_state_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(activationAudit['35C432_REPORTED_PROMOTED'], 'NO');
assert.strictEqual(activationAudit.ACTUAL_GIT_STORE_PROMOTED, 'YES');
assert.strictEqual(activationAudit.CORRECTED_SEMANTIC_STATUS, 'YES');
assert.strictEqual(activationAudit.PUBLIC_EVIDENCE_STORE_ACTIVATED, 'YES');
assert.strictEqual(activationAudit.PUBLIC_EVIDENCE_STORE_PROMOTED, 'YES');
assert.strictEqual(activationAudit.DEPLOYED, 'NO');

const failureAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_failure_injection_report.json', import.meta.url), 'utf8'));
assert.strictEqual(failureAudit.FAILURE_INJECTION, 'PASS');
assert.ok(failureAudit.records.every((row) => row.detected === true));

const structuredAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_structured_data_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(structuredAudit.SCHEMA_UNEVIDENCED_TECHNICAL_PROPERTIES, 0);
assert.strictEqual(structuredAudit.positive_026_binding, 'PASS');
assert.strictEqual(structuredAudit.conflict_046_stroke_excluded, 'PASS');

const passportAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_passport_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(passportAudit.PASSPORT_UNEVIDENCED_DEFAULTS, 0);

const comparisonAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_comparison_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(comparisonAudit.COMPARISON_VALIDATION, 'PASS');

const idempotency = JSON.parse(fs.readFileSync(new URL('../data/phase35c4321_idempotency_report.json', import.meta.url), 'utf8'));
assert.strictEqual(idempotency.IDEMPOTENCY, 'PASS');
assert.strictEqual(idempotency.LEFT_HASH, idempotency.RIGHT_HASH);

console.log('Phase 35C.4.3.2.1 nested fallback hotfix tests passed.');
