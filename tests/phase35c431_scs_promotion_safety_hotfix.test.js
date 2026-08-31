import assert from 'assert';
import fs from 'fs';

import { main as runPhase35c431 } from '../scripts/phase35c431_scs_promotion_safety_hotfix.js';

console.log('Starting Phase 35C.4.3.1 SCS promotion safety hotfix tests...');

const report = runPhase35c431();

assert.strictEqual(report.SOURCE_COMMIT, '31603a59d9c60d322deabe0bd679a6677fc7bd14');
assert.strictEqual(report.PRECHECK, 'PASS');
assert.strictEqual(report.HISTORICAL_35C43_PROMOTIONS, 111);
assert.strictEqual(report.PRECOMMIT_ACCOUNTING, 'PASS');
assert.strictEqual(report.RETAINED_UNCHANGED + report.PROMOTIONS_REMOVED + report.REPLACED_OLD_FACTS, 111);
assert.strictEqual(report.RETAINED_UNCHANGED + report.REPLACEMENT_FACTS + report.NEW_AFTER_REEVALUATION, report.CORRECTED_NEW_PUBLIC_FACTS);
assert.ok(report.CANDIDATES_REEVALUATED > 111);
assert.ok(report.CORRECTED_NEW_PUBLIC_FACTS < 111);
assert.ok(report.PROMOTIONS_REMOVED > 0);
assert.strictEqual(report.SPARK_COMBINED_MANUFACTURER_VALUE_LEAKS, 0);
assert.strictEqual(report.DERIVATIVE_SOURCE_PROMOTIONS, 0);
assert.strictEqual(report.SCS_FALSE_INDEPENDENCE_PROMOTIONS, 0);
assert.strictEqual(report.PROMOTIONS_WITHOUT_SOURCE_HEADING, 0);
assert.strictEqual(report.PROMOTIONS_WITHOUT_SOURCE_LOCATOR, 0);
assert.strictEqual(report.PROMOTIONS_WITH_SCOPE_MISMATCH, 0);
assert.strictEqual(report.PROMOTIONS_WITH_UNKNOWN_MEASUREMENT_DEFINITION, 0);
assert.strictEqual(report.DUPLICATE_PUBLIC_FACT_PROMOTIONS, 0);
assert.strictEqual(report.VARIANT_SCOPE_UNRESOLVED_PROMOTIONS, 0);
assert.strictEqual(report.FS350_SCOPE_TEST, 'PASS');
assert.strictEqual(report.MS170_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report.MS180_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report['046_STROKE_STATUS'], 'OFFICIAL_CONFLICTED');
assert.strictEqual(report.FUZZY_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PROBABLE_SERIAL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PART_NUMBER_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.NUMERIC_TOKEN_MODEL_COLLISIONS, 0);
assert.strictEqual(report.SCHEMA_MODEL_BINDING, 'PASS');
assert.strictEqual(report.STRATIFIED_SAMPLE, 'PASS');
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.CANONICAL_VERIFIED_BEFORE, 0);
assert.strictEqual(report.CANONICAL_VERIFIED_AFTER, 0);
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_CHANGED, 'NO');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

assert.strictEqual(report['009_SPARK_STATUS'], 'PROMOTED_VALID');
assert.strictEqual(report['017_SPARK_STATUS'], 'PROMOTED_VALID');
assert.strictEqual(report['018_SPARK_STATUS'], 'PROMOTED_VALID');
assert.ok(/^BLOCKED_/.test(report['026_SPARK_STATUS']));
assert.ok(/^BLOCKED_/.test(report['046_SPARK_STATUS']));

const sparkAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c431_spark_semantic_audit.json', import.meta.url), 'utf8'));
assert.ok(sparkAudit.records.some((row) => row.model === '009' && Array.isArray(row.normalized_value) && row.normalized_value.length === 2));
assert.ok(sparkAudit.records.some((row) => row.model === '017' && Array.isArray(row.normalized_value) && row.normalized_value.length === 2));
assert.ok(sparkAudit.records.some((row) => row.model === '018' && Array.isArray(row.normalized_value) && row.normalized_value.length === 2));
assert.ok(!sparkAudit.records.some((row) => row.model === '009' && Array.isArray(row.normalized_value) && row.normalized_value.some((entry) => entry.manufacturer === 'BOSCH' && /BPMR/.test(entry.model))));

const variantAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c431_variant_scope_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(variantAudit.MS360_VARIANT_SCOPE_RESULT, 'BLOCKED');
assert.strictEqual(variantAudit.SCOPE_020_020T_RESULT, 'BLOCKED');
assert.strictEqual(variantAudit.SCOPE_MS200_MS200T_RESULT, 'BLOCKED');

const transitionAccounting = JSON.parse(fs.readFileSync(new URL('../data/phase35c431_promotion_transition_accounting.json', import.meta.url), 'utf8'));
assert.strictEqual(transitionAccounting.PRECOMMIT_ACCOUNTING, 'PASS');
assert.strictEqual(transitionAccounting.HISTORICAL_PROMOTIONS, 111);
assert.strictEqual(transitionAccounting.REMOVED, report.PROMOTIONS_REMOVED);
assert.strictEqual(transitionAccounting.CORRECTED_PROMOTIONS, report.CORRECTED_NEW_PUBLIC_FACTS);
assert.ok(transitionAccounting.replacement_mappings.length > 0);
assert.ok(transitionAccounting.replacement_mappings.every((row) => row.replacement_reason));

const failureAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c431_failure_injection_report.json', import.meta.url), 'utf8'));
assert.strictEqual(failureAudit.FAILURE_INJECTION, 'PASS');
assert.ok(failureAudit.records.every((row) => row.pass === true));

const structured = JSON.parse(fs.readFileSync(new URL('../data/phase35c431_structured_data_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(structured.SCHEMA_MODEL_BINDING, 'PASS');

console.log('Phase 35C.4.3.1 SCS promotion safety hotfix tests passed.');
