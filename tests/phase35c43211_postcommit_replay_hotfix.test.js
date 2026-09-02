import assert from 'assert';
import fs from 'fs';
import { execFileSync } from 'child_process';

import {
  main as runPhase35c43211,
  BASELINE_COMMIT,
  PHASE_SOURCE_COMMIT,
  PHASE_RESULT_COMMIT,
  EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
} from '../scripts/phase35c43211_postcommit_replay_hotfix.js';

console.log('Starting Phase 35C.4.3.2.1.1 post-commit replay hotfix tests...');

function git(args) {
  return execFileSync('git', args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  }).trim();
}

const publicStoreDiffBefore = git(['diff', '--', 'data/public_evidence_facts.json']);
const report = await runPhase35c43211({ mode: 'replay' });

assert.strictEqual(report.BASELINE_COMMIT, BASELINE_COMMIT);
assert.strictEqual(report.PHASE_SOURCE_COMMIT, PHASE_SOURCE_COMMIT);
assert.strictEqual(report.PHASE_RESULT_COMMIT, PHASE_RESULT_COMMIT);
assert.strictEqual(report.PRECHECK, 'PASS');
assert.strictEqual(report.PHASE_SOURCE_COMMIT_FOUND, 'PASS');
assert.strictEqual(report.PHASE_RESULT_COMMIT_FOUND, 'PASS');
assert.strictEqual(report.SOURCE_TO_RESULT_RELATION_VALID, 'PASS');
assert.strictEqual(report.RESULT_IS_ANCESTOR_OF_HEAD, 'PASS');
assert.strictEqual(report.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN, 'PASS');
assert.strictEqual(report.HEAD_EQUALITY_REQUIRED_FOR_REPLAY, 'NO');
assert.strictEqual(report.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY, 'NO');
assert.strictEqual(report.POST_COMMIT_SELF_REPLAY, 'PASS');
assert.strictEqual(report.POST_COMMIT_REPLAY, 'PASS');
assert.strictEqual(report.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY, 'PASS');
assert.strictEqual(report.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED, 'PASS');
assert.strictEqual(report.SOURCE_PUBLIC_STORE_CANONICAL_SHA256, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.RESULT_PUBLIC_STORE_CANONICAL_SHA256, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.CURRENT_PUBLIC_STORE_CANONICAL_SHA256, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.PUBLIC_FACT_COUNT, 114);
assert.strictEqual(report.IMMUTABLE_PUBLIC_STORE_REPLAY, 'PASS');
assert.strictEqual(report.DIRTY_WORKTREE_REPLAY_CONTAMINATION, 0);
assert.strictEqual(report.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT, 'NO');
assert.strictEqual(report.REPLAY_MUTATED_PUBLIC_STORE, 'NO');
assert.strictEqual(report.TEST_HARNESS_SILENT_STORE_RESTORE, 'NO');
assert.strictEqual(report.PUBLIC_STORE_WRITES_BY_TEST_HARNESS, 0);
assert.strictEqual(report.PUBLIC_STORE_MUTATIONS_BY_TESTS, 0);
assert.strictEqual(report.HARNESS_PUBLIC_STORE_MUTATION_DETECTED, 'PASS');
assert.strictEqual(report.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED, 'PASS');
assert.strictEqual(report.REAL_PUBLIC_STORE_WRITE_ATTEMPTED, 'NO');
assert.strictEqual(report.REAL_PUBLIC_STORE_BYTE_STABLE, 'PASS');
assert.strictEqual(report.FAILURE_INJECTIONS_USE_TEMPORARY_STORE, 'PASS');
assert.strictEqual(report.ORIGINAL_STORE_RESTORED_AFTER_FAILURE, 'PASS');
assert.strictEqual(report.ORIGINAL_STORE_RESTORE_MODE, 'NOT_REQUIRED');
assert.strictEqual(report.PUBLIC_STORE_FINAL_HASH_MATCH, 'PASS');
assert.deepStrictEqual(report.CANONICAL_DATABASE_FILES_CHANGED, []);
assert.strictEqual(report.CANONICAL_DATABASE_CHANGED, 'NO');
assert.strictEqual(report.UNEXPECTED_CANONICAL_PROMOTIONS, 0);
assert.strictEqual(report.HISTORICAL_SAFETY_ASSERTIONS_REMOVED, 0);
assert.strictEqual(report.HISTORICAL_TEST_WEAKENING, 0);
assert.strictEqual(report.DECODER_PRODUCTION_CODE_CHANGED, 'NO');
assert.strictEqual(report.RELATED_MODELS_PRODUCTION_CODE_CHANGED, 'NO');
assert.strictEqual(report.MODEL_PAGE_PRODUCTION_CODE_CHANGED, 'NO');
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const replayAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43211_immutable_replay_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(replayAudit.RESULT_IS_ANCESTOR_OF_HEAD, 'PASS');
assert.strictEqual(replayAudit.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN, 'PASS');
assert.strictEqual(replayAudit.HEAD_EQUALITY_REQUIRED_FOR_REPLAY, 'NO');
assert.strictEqual(replayAudit.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY, 'NO');
assert.strictEqual(replayAudit.POST_COMMIT_SELF_REPLAY, 'PASS');
assert.strictEqual(replayAudit.POST_COMMIT_REPLAY, 'PASS');
assert.strictEqual(replayAudit.REPLAY_HISTORICAL_ARTIFACTS_VALID, 'PASS');
assert.strictEqual(replayAudit.REPLAY_RUNTIME_TRANSITION_VALID, 'PASS');

const publicStoreAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43211_public_store_replay_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(publicStoreAudit.IMMUTABLE_PUBLIC_STORE_REPLAY, 'PASS');
assert.strictEqual(publicStoreAudit.CURRENT_PUBLIC_STORE_CANONICAL_SHA256, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);

const canonicalDbAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43211_canonical_database_diff_audit.json', import.meta.url), 'utf8'));
assert.deepStrictEqual(canonicalDbAudit.CANONICAL_DATABASE_FILES_CHANGED, []);
assert.strictEqual(canonicalDbAudit.CANONICAL_DATABASE_CHANGED, 'NO');

const testImmutabilityAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43211_test_immutability_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(testImmutabilityAudit.HISTORICAL_SAFETY_ASSERTIONS_REMOVED, 0);
assert.strictEqual(testImmutabilityAudit.HISTORICAL_TEST_WEAKENING, 0);
assert.strictEqual(testImmutabilityAudit.REPLAY_READ_ONLY_PUBLIC_STORE_WRITE_REMOVED, 'PASS');
assert.strictEqual(testImmutabilityAudit.TEST_HARNESS_SILENT_STORE_RESTORE, 'NO');

const failureAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c43211_failure_injection_report.json', import.meta.url), 'utf8'));
assert.strictEqual(failureAudit.FAILURE_INJECTION, 'PASS');
assert.strictEqual(failureAudit.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY, 'PASS');
assert.strictEqual(failureAudit.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED, 'PASS');
assert.strictEqual(failureAudit.RESULT_NOT_IN_CURRENT_HISTORY_DETECTED, 'PASS');
assert.strictEqual(failureAudit.DIRTY_WORKTREE_REPLAY_CONTAMINATION, 0);
assert.strictEqual(failureAudit.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT, 'NO');
assert.strictEqual(failureAudit.REPLAY_MUTATED_PUBLIC_STORE, 'NO');
assert.ok(failureAudit.records.every((row) => row.detected === true));

assert.strictEqual(publicStoreAudit.harnessAudit.PUBLIC_STORE_WRITES_BY_TEST_HARNESS, 0);
assert.strictEqual(publicStoreAudit.harnessAudit.PUBLIC_STORE_MUTATIONS_BY_TESTS, 0);
assert.strictEqual(publicStoreAudit.harnessAudit.HARNESS_PUBLIC_STORE_MUTATION_DETECTED, 'PASS');
assert.strictEqual(publicStoreAudit.harnessAudit.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED, 'PASS');
assert.strictEqual(publicStoreAudit.harnessAudit.REAL_PUBLIC_STORE_WRITE_ATTEMPTED, 'NO');
assert.strictEqual(publicStoreAudit.harnessAudit.REAL_PUBLIC_STORE_BYTE_STABLE, 'PASS');
assert.strictEqual(publicStoreAudit.harnessAudit.ORIGINAL_STORE_RESTORED_AFTER_FAILURE, 'PASS');
assert.strictEqual(publicStoreAudit.harnessAudit.ORIGINAL_STORE_RESTORE_MODE, 'NOT_REQUIRED');
assert.strictEqual(publicStoreAudit.harnessAudit.PUBLIC_STORE_FINAL_HASH_MATCH, 'PASS');

const publicStoreDiffAfter = git(['diff', '--', 'data/public_evidence_facts.json']);
assert.strictEqual(publicStoreDiffAfter, publicStoreDiffBefore);

console.log('Phase 35C.4.3.2.1.1 post-commit replay hotfix tests passed.');
