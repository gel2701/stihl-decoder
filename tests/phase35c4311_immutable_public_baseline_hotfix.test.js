import assert from 'assert';
import fs from 'fs';

import { main as runPhase35c4311 } from '../scripts/phase35c4311_immutable_public_baseline_hotfix.js';

console.log('Starting Phase 35C.4.3.1.1 immutable public baseline hotfix tests...');

const report = runPhase35c4311();

assert.strictEqual(report.HOTFIX_BASELINE_COMMIT, '4457b41d7fed36274fd9d98ef74600df27898789');
assert.strictEqual(report.IMMUTABLE_PUBLIC_BASELINE_COMMIT, '4457b41d7fed36274fd9d98ef74600df27898789');
assert.strictEqual(report.IMMUTABLE_GIT_BASELINE_USED, 'PASS');
assert.strictEqual(report.PRECHECK, 'PASS');
assert.strictEqual(report.FINAL_TRANSITION_ACCOUNTING, 'PASS');
assert.strictEqual(report.BASELINE_FACT_PRESERVATION, 'PASS');
assert.strictEqual(report['046_CONFLICT_GATE'], 'PASS');
assert.strictEqual(report.LINEAGE_GATE, 'PASS');
assert.strictEqual(report.METRIC_CLASSIFICATION, 'OVERLAPPING_AUDIT_LABELS');
assert.strictEqual(report.INPUT_CANDIDATES, 100);
assert.strictEqual(report.PROMOTED_NEW + report.TOTAL_BLOCKED_OR_REDUNDANT, report.INPUT_CANDIDATES);
assert.strictEqual(report.BASELINE_PUBLIC_FACTS, 22);
assert.strictEqual(report.BASELINE_FACTS_PRESERVED, 22);
assert.strictEqual(report.BASELINE_FACTS_CHANGED, 0);
assert.strictEqual(report.BASELINE_FACTS_REMOVED, 0);
assert.strictEqual(report.BASELINE_FACTS_REPLACED, 0);
assert.strictEqual(report['026_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(report['046_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(report['046_CONFLICT_PROVENANCE_PRESERVED'], 'PASS');
assert.strictEqual(report['431_CORRECTED_CANDIDATE_FACTS'], 100);
assert.strictEqual(report.SAFE_NEW_SCS_FACTS, report.PROMOTED_NEW);
assert.ok(report.SAFE_NEW_SCS_FACTS > 0);
assert.strictEqual(report.TOTAL_CORRECTED_STAGED_FACTS, report.BASELINE_PUBLIC_FACTS + report.SAFE_NEW_SCS_FACTS);
assert.strictEqual(report.DERIVATIVE_SOURCE_PROMOTIONS, 0);
assert.strictEqual(report.DOSSIER_AS_DIRECT_TECHNICAL_SOURCE, 0);
assert.strictEqual(report.SCS_FALSE_INDEPENDENCE_PROMOTIONS, 0);
assert.strictEqual(report.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE, 0);
assert.strictEqual(report.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS, 0);
assert.strictEqual(report.AUTHENTICITY_DEFAULT_PROMOTIONS, 0);
assert.strictEqual(report.PROMOTIONS_WITHOUT_SOURCE_HEADING, 0);
assert.strictEqual(report.PROMOTIONS_WITHOUT_SOURCE_LOCATOR, 0);
assert.strictEqual(report.PROMOTIONS_WITH_SCOPE_MISMATCH, 0);
assert.strictEqual(report.PROMOTIONS_WITH_UNKNOWN_MEASUREMENT_DEFINITION, 0);
assert.strictEqual(report.DUPLICATE_PUBLIC_FACT_PROMOTIONS, 0);
assert.strictEqual(report.FACT_ID_COLLISIONS, 0);
assert.strictEqual(report.PUBLIC_WINDOWS_PATH_COUNT, 0);
assert.strictEqual(report.FS350_SCOPE_TEST, 'PASS');
assert.strictEqual(report.MS170_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report.MS180_009_TECHNICAL_FACTS, 0);
assert.strictEqual(report['046_STROKE_STATUS'], 'OFFICIAL_CONFLICTED');
assert.strictEqual(report['046_STROKE_SINGLE_VALUE_ELIGIBLE'], false);
assert.strictEqual(report.FUZZY_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PROBABLE_SERIAL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.PART_NUMBER_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.NUMERIC_TOKEN_MODEL_COLLISIONS, 0);
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_CHANGED, 'NO');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const preservation = JSON.parse(fs.readFileSync(new URL('../data/phase35c4311_baseline_fact_preservation_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(preservation.BASELINE_FACTS_PRESERVED, 22);
assert.ok(preservation.records.every((row) => row.preserved === true));

const regression = JSON.parse(fs.readFileSync(new URL('../data/phase35c4311_026_046_regression_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(regression['026_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(regression['046_BASELINE_SPARK_PRESERVED'], 'PASS');
assert.strictEqual(regression['046_STROKE_CONFLICT_PRESERVED'], 'PASS');
assert.strictEqual(regression['046_CONFLICT_SECONDARY_SOURCE_DOCUMENT_ID_PRESENT'], 'YES');
assert.strictEqual(regression['046_CONFLICT_SECONDARY_PUBLICATION_ID_PRESENT'], 'YES');
assert.strictEqual(regression['046_CONFLICT_SECONDARY_SOURCE_CLASS_PRESENT'], 'YES');
assert.strictEqual(regression['046_CONFLICT_SECONDARY_LOCATOR_PRESENT'], 'YES');
assert.strictEqual(regression['046_CONFLICT_SECONDARY_HEADING_PRESENT'], 'YES');
assert.strictEqual(regression['046_CONFLICT_SECONDARY_MODEL_SCOPE_PRESENT'], 'YES');
assert.strictEqual(regression['046_CONFLICT_SECONDARY_PROVENANCE_COMPLETE'], 'PASS');
assert.strictEqual(regression['046_STROKE_SINGLE_VALUE_ELIGIBLE'], false);

const lineage = JSON.parse(fs.readFileSync(new URL('../data/phase35c4311_lineage_preservation_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(lineage.DERIVATIVE_SOURCE_PROMOTIONS, 0);
assert.strictEqual(lineage.DOSSIER_AS_DIRECT_TECHNICAL_SOURCE, 0);
assert.strictEqual(lineage.SCS_FALSE_INDEPENDENCE_PROMOTIONS, 0);
assert.strictEqual(lineage.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE, 0);
assert.strictEqual(lineage.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS, 0);
assert.ok(lineage.records.every((row) => row.lineage_valid && row.independence_valid));

const finalTransition = JSON.parse(fs.readFileSync(new URL('../data/phase35c4311_final_transition_accounting.json', import.meta.url), 'utf8'));
assert.strictEqual(finalTransition.FINAL_TRANSITION_ACCOUNTING, 'PASS');
assert.strictEqual(finalTransition.METRIC_CLASSIFICATION, 'OVERLAPPING_AUDIT_LABELS');
assert.strictEqual(finalTransition.INPUT_CANDIDATES, 100);
assert.strictEqual(finalTransition.PROMOTED_NEW, report.SAFE_NEW_SCS_FACTS);
assert.strictEqual(finalTransition.PROMOTED_NEW + finalTransition.TOTAL_BLOCKED_OR_REDUNDANT, finalTransition.INPUT_CANDIDATES);
assert.strictEqual(finalTransition.SAFE_NEW_SCS_FACTS_MATCHES_PROMOTED_NEW, 'PASS');
assert.strictEqual(finalTransition.INPUT_INVARIANT, 'PASS');
assert.ok(finalTransition.records.every((row) => typeof row.primary_disposition === 'string'));

const failureAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4311_failure_injection_report.json', import.meta.url), 'utf8'));
assert.strictEqual(failureAudit.FAILURE_INJECTION, 'PASS');
assert.ok(failureAudit.records.every((row) => row.pass === true));

const structured = JSON.parse(fs.readFileSync(new URL('../data/phase35c4311_structured_data_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(structured.SCHEMA_MODEL_BINDING, 'PASS');
assert.strictEqual(structured.negative_ms261_with_026_evidence, 'PASS');
assert.strictEqual(structured.corrected_fs350_safe, 'PASS');

console.log('Phase 35C.4.3.1.1 immutable public baseline hotfix tests passed.');
