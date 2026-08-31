import assert from 'assert';
import { execFileSync } from 'child_process';

console.log('Starting Phase 35C.4.3.1 SCS promotion safety hotfix snapshot tests...');

const BASELINE_COMMIT = '4457b41d7fed36274fd9d98ef74600df27898789';

function readGitJson(repoPath) {
  return JSON.parse(execFileSync('git', ['show', `${BASELINE_COMMIT}:${repoPath}`], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  }));
}

const report = readGitJson('data/phase35c431_final_report.json');

assert.strictEqual(report.SOURCE_COMMIT, '31603a59d9c60d322deabe0bd679a6677fc7bd14');
assert.strictEqual(report.PRECHECK, 'PASS');
assert.strictEqual(report.HISTORICAL_35C43_PROMOTIONS, 111);
assert.strictEqual(report.PRECOMMIT_ACCOUNTING, 'PASS');
assert.strictEqual(report.RETAINED_UNCHANGED + report.PROMOTIONS_REMOVED + report.REPLACED_OLD_FACTS, 111);
assert.strictEqual(report.RETAINED_UNCHANGED + report.REPLACEMENT_FACTS + report.NEW_AFTER_REEVALUATION, report.CORRECTED_NEW_PUBLIC_FACTS);
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
assert.strictEqual(report.SCHEMA_MODEL_BINDING, 'PASS');
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_CHANGED, 'NO');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const transitionAccounting = readGitJson('data/phase35c431_promotion_transition_accounting.json');
assert.strictEqual(transitionAccounting.PRECOMMIT_ACCOUNTING, 'PASS');
assert.strictEqual(transitionAccounting.HISTORICAL_PROMOTIONS, 111);
assert.strictEqual(transitionAccounting.CORRECTED_PROMOTIONS, 100);

const failureAudit = readGitJson('data/phase35c431_failure_injection_report.json');
assert.strictEqual(failureAudit.FAILURE_INJECTION, 'PASS');
assert.ok(failureAudit.records.every((row) => row.pass === true));

console.log('Phase 35C.4.3.1 SCS promotion safety hotfix snapshot tests passed.');
