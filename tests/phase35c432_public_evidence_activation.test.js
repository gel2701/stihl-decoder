import assert from 'assert';
import fs from 'fs';

import { main as runPhase35c432 } from '../scripts/phase35c432_public_evidence_activation.js';

console.log('Starting Phase 35C.4.3.2 public evidence activation tests...');

const report = await runPhase35c432();

assert.strictEqual(report.SOURCE_COMMIT, '356040404fc81c8b69d4d259697b58ec2ca67c1a');
assert.strictEqual(report.PRECHECK, 'PASS');
assert.strictEqual(report.IMMUTABLE_AUDITED_STAGING_USED, 'PASS');
assert.strictEqual(report.ACTIVATION_HASH_MATCH, 'PASS');
assert.strictEqual(report.PUBLIC_FACTS_BEFORE, 22);
assert.strictEqual(report.PUBLIC_FACTS_AFTER, 114);
assert.strictEqual(report.SAFE_NEW_SCS_FACTS, 92);
assert.strictEqual(report.BASELINE_FACTS_PRESERVED_AFTER_ACTIVATION, 22);
assert.strictEqual(report.BASELINE_FACTS_CHANGED_AFTER_ACTIVATION, 0);
assert.strictEqual(report.BASELINE_FACTS_REMOVED_AFTER_ACTIVATION, 0);
assert.strictEqual(report.ACTIVATION_FACTS_ADDED, 0);
assert.strictEqual(report.ACTIVATION_FACTS_REMOVED, 0);
assert.strictEqual(report.ACTIVATION_FACTS_CHANGED, 0);
assert.strictEqual(report.MODELS_WITH_PUBLIC_FACTS_BEFORE, 4);
assert.strictEqual(report.MODELS_WITH_PUBLIC_FACTS_AFTER, 15);
assert.strictEqual(report['026_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(report['046_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(report['046_STROKE_STATUS'], 'OFFICIAL_CONFLICTED');
assert.strictEqual(report['046_STROKE_SINGLE_VALUE_ELIGIBLE'], false);
assert.strictEqual(report['046_CONFLICT_UI'], 'PASS');
assert.strictEqual(report.FS350_SCOPE_RUNTIME, 'PASS');
assert.strictEqual(report.MS170_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report.MS180_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report.VARIANT_SPEC_LEAKS, 0);
assert.strictEqual(report.FUZZY_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PROBABLE_SERIAL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PART_NUMBER_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.NUMERIC_TOKEN_MODEL_COLLISIONS, 0);
assert.strictEqual(report.SCS_FALSE_INDEPENDENCE_PROMOTIONS, 0);
assert.strictEqual(report.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE, 0);
assert.strictEqual(report.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS, 0);
assert.strictEqual(report.DERIVATIVE_SOURCE_PROMOTIONS, 0);
assert.strictEqual(report.RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(report.SCHEMA_MODEL_BINDING_MISMATCHES, 0);
assert.strictEqual(report.PASSPORT_UNEVIDENCED_DEFAULTS, 0);
assert.strictEqual(report.UNEXPECTED_CANONICAL_PROMOTIONS, 0);
assert.strictEqual(report.PUBLIC_WINDOWS_PATH_COUNT, 0);
assert.strictEqual(report.CANONICAL_DATABASE_CHANGED, 'NO');
assert.strictEqual(report.API_VALIDATION, 'PASS');
assert.strictEqual(report.MODEL_PAGE_VALIDATION, 'PASS');
assert.strictEqual(report.STRUCTURED_DATA_VALIDATION, 'PASS');
assert.strictEqual(report.COMPARISON_VALIDATION, 'PASS');
assert.strictEqual(report.PASSPORT_VALIDATION, 'PASS');
assert.strictEqual(report.DECODER_REGRESSION, 'PASS');
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.ROLLBACK_TEST, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const activationIdentity = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_activation_source_identity.json', import.meta.url), 'utf8'));
assert.strictEqual(activationIdentity.IMMUTABLE_AUDITED_STAGING_USED, 'PASS');
assert.strictEqual(activationIdentity.ACTIVATION_HASH_MATCH, 'PASS');
assert.strictEqual(activationIdentity.ACTIVATED_PUBLIC_FACT_COUNT, 114);
assert.strictEqual(activationIdentity.AUDITED_STAGING_CANONICAL_SHA256, activationIdentity.ACTIVATED_PUBLIC_STORE_CANONICAL_SHA256);

const factIdentity = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_fact_identity_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(factIdentity.ACTIVATION_FACTS_ADDED, 0);
assert.strictEqual(factIdentity.ACTIVATION_FACTS_REMOVED, 0);
assert.strictEqual(factIdentity.ACTIVATION_FACTS_CHANGED, 0);
assert.strictEqual(factIdentity.FACT_SET_MATCH, 'PASS');

const lineage = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_lineage_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(lineage.SAFE_NEW_SCS_FACTS, 92);
assert.strictEqual(lineage.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE, 0);
assert.strictEqual(lineage.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS, 0);
assert.strictEqual(lineage.SCS_FALSE_INDEPENDENCE_PROMOTIONS, 0);
assert.strictEqual(lineage.DERIVATIVE_SOURCE_PROMOTIONS, 0);
assert.strictEqual(lineage.PROMOTIONS_WITHOUT_SOURCE_HEADING, 0);
assert.strictEqual(lineage.PROMOTIONS_WITHOUT_SOURCE_LOCATOR, 0);

const coverage = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_public_coverage_before_after.json', import.meta.url), 'utf8'));
assert.strictEqual(coverage.PUBLIC_FACTS_BEFORE, 22);
assert.strictEqual(coverage.PUBLIC_FACTS_AFTER, 114);
assert.strictEqual(coverage.MODELS_WITH_PUBLIC_FACTS_BEFORE, 4);
assert.strictEqual(coverage.MODELS_WITH_PUBLIC_FACTS_AFTER, 15);
assert.strictEqual(coverage.NEW_PUBLIC_MODELS.length, 11);

const api = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_api_validation.json', import.meta.url), 'utf8'));
assert.strictEqual(api['009_RESULT'].pass, true);
assert.strictEqual(api['026_RESULT'].pass, true);
assert.strictEqual(api['046_RESULT'].pass, true);
assert.strictEqual(api['FS350_RESULT'].pass, true);
assert.strictEqual(api.MS170_009_TECHNICAL_FACTS, 0);
assert.strictEqual(api.MS180_009_TECHNICAL_FACTS, 0);
assert.strictEqual(api.VARIANT_SPEC_LEAKS, 0);
assert.strictEqual(api.FUZZY_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(api.PROBABLE_SERIAL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(api.PART_NUMBER_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(api.NUMERIC_TOKEN_MODEL_COLLISIONS, 0);

const modelPages = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_model_page_validation.json', import.meta.url), 'utf8'));
assert.strictEqual(modelPages['046_CONFLICT_UI'], 'PASS');
assert.strictEqual(modelPages['026_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(modelPages.RAW_TECHNICAL_FALLBACK_LEAKS, 0);
assert.strictEqual(modelPages.MODEL_PAGE_VALIDATION, 'PASS');

const structured = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_structured_data_validation.json', import.meta.url), 'utf8'));
assert.strictEqual(structured['026_positive_binding'], 'PASS');
assert.strictEqual(structured['046_conflicted_stroke_excluded'], 'PASS');
assert.strictEqual(structured.negative_ms261_with_026_evidence, 'PASS');
assert.strictEqual(structured.SCHEMA_MODEL_BINDING_MISMATCHES, 0);
assert.strictEqual(structured.STRUCTURED_DATA_VALIDATION, 'PASS');

const comparison = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_comparison_validation.json', import.meta.url), 'utf8'));
assert.strictEqual(comparison.COMPARISON_VALIDATION, 'PASS');
assert.strictEqual(comparison.record.http_status, 200);
assert.strictEqual(comparison.record.raw_fallback_leak, false);

const passport = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_passport_validation.json', import.meta.url), 'utf8'));
assert.strictEqual(passport.PASSPORT_UNEVIDENCED_DEFAULTS, 0);
assert.strictEqual(passport.PASSPORT_VALIDATION, 'PASS');

const failure = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_failure_injection_report.json', import.meta.url), 'utf8'));
assert.strictEqual(failure.FAILURE_INJECTION, 'PASS');
assert.ok(failure.records.every((row) => row.pass === true));

const rollback = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_rollback_test.json', import.meta.url), 'utf8'));
assert.strictEqual(rollback.ROLLBACK_BASELINE_HASH_MATCH, 'PASS');
assert.strictEqual(rollback.RESTORED_ACTIVATED_HASH_MATCH, 'PASS');
assert.strictEqual(rollback.ROLLBACK_TEST, 'PASS');

const idempotency = JSON.parse(fs.readFileSync(new URL('../data/phase35c432_idempotency_report.json', import.meta.url), 'utf8'));
assert.strictEqual(idempotency.IDEMPOTENCY, 'PASS');
assert.strictEqual(typeof idempotency.LEFT_HASH, 'string');
assert.strictEqual(idempotency.LEFT_HASH, idempotency.RIGHT_HASH);

console.log('Phase 35C.4.3.2 public evidence activation tests passed.');
