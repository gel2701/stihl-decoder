import assert from 'assert';
import fs from 'fs';
import { execFileSync } from 'child_process';

import {
  main as runPhase35c432111,
  buildDevelopmentBaselinePrecheck,
  buildReplayAncestryAudit
} from '../scripts/phase35c432111_self_replay_ancestry_hotfix.js';
import {
  BASELINE_COMMIT,
  PHASE_SOURCE_COMMIT,
  PHASE_RESULT_COMMIT,
  EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
} from '../scripts/phase35c43211_postcommit_replay_hotfix.js';

console.log('Starting Phase 35C.4.3.2.1.1.1 self-replay ancestry hotfix tests...');

function git(args) {
  return execFileSync('git', args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  }).trim();
}

const simulatedDevelopmentPrecheck = buildDevelopmentBaselinePrecheck({
  currentHead: BASELINE_COMMIT,
  currentOriginMain: BASELINE_COMMIT,
  currentMergeBase: BASELINE_COMMIT
});
assert.strictEqual(simulatedDevelopmentPrecheck.DEVELOPMENT_BASELINE_PRECHECK, 'PASS');

const publicStoreDiffBefore = git(['diff', '--', 'data/public_evidence_facts.json']);
const report = await runPhase35c432111({
  mode: 'replay',
  currentHead: BASELINE_COMMIT,
  currentOriginMain: BASELINE_COMMIT,
  currentMergeBase: BASELINE_COMMIT
});

assert.strictEqual(report.BASELINE_COMMIT, BASELINE_COMMIT);
assert.strictEqual(report.DEVELOPMENT_BASELINE_PRECHECK, 'PASS');
assert.strictEqual(report.PHASE_SOURCE_COMMIT, PHASE_SOURCE_COMMIT);
assert.strictEqual(report.PHASE_RESULT_COMMIT, PHASE_RESULT_COMMIT);
assert.strictEqual(report.PHASE_SOURCE_COMMIT_FOUND, 'PASS');
assert.strictEqual(report.PHASE_RESULT_COMMIT_FOUND, 'PASS');
assert.strictEqual(report.SOURCE_TO_RESULT_RELATION_VALID, 'PASS');
assert.strictEqual(report.RESULT_IS_ANCESTOR_OF_HEAD, 'PASS');
assert.strictEqual(report.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN, 'PASS');
assert.strictEqual(report.HEAD_EQUALITY_REQUIRED_FOR_REPLAY, 'NO');
assert.strictEqual(report.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY, 'NO');
assert.strictEqual(report.POST_COMMIT_SELF_REPLAY, 'PASS');
assert.strictEqual(report.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY, 'PASS');
assert.strictEqual(report.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED, 'PASS');
assert.strictEqual(report.PHASE35C422_ARTIFACT_PINNED, 'PASS');
assert.strictEqual(report.SOURCE_PUBLIC_STORE_CANONICAL_SHA256, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.RESULT_PUBLIC_STORE_CANONICAL_SHA256, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.CURRENT_PUBLIC_STORE_CANONICAL_SHA256, EXPECTED_PUBLIC_STORE_CANONICAL_SHA256);
assert.strictEqual(report.PUBLIC_STORE_CHANGED, 'NO');
assert.strictEqual(report.PUBLIC_FACT_COUNT, 114);
assert.strictEqual(report.DIRTY_WORKTREE_REPLAY_CONTAMINATION, 0);
assert.strictEqual(report.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT, 'NO');
assert.strictEqual(report.REPLAY_MUTATED_PUBLIC_STORE, 'NO');
assert.strictEqual(report.REAL_PUBLIC_STORE_WRITE_ATTEMPTED, 'NO');
assert.strictEqual(report.TEST_HARNESS_SILENT_STORE_RESTORE, 'NO');
assert.strictEqual(report.FAILURE_INJECTIONS_USE_TEMPORARY_STORE, 'PASS');
assert.strictEqual(report.PUBLIC_STORE_WRITES_BY_TEST_HARNESS, 0);
assert.strictEqual(report.PUBLIC_STORE_MUTATIONS_BY_TESTS, 0);
assert.strictEqual(report.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED, 'PASS');
assert.strictEqual(report.REAL_PUBLIC_STORE_BYTE_STABLE, 'PASS');
assert.strictEqual(report.ORIGINAL_STORE_RESTORED_AFTER_FAILURE, 'PASS');
assert.strictEqual(report.ORIGINAL_STORE_RESTORE_MODE, 'NOT_REQUIRED');
assert.strictEqual(report.CANONICAL_DATABASE_CHANGED, 'NO');
assert.strictEqual(report.UNEXPECTED_CANONICAL_PROMOTIONS, 0);
assert.strictEqual(report.HISTORICAL_TEST_WEAKENING, 0);
assert.strictEqual(report.HISTORICAL_SAFETY_ASSERTIONS_REMOVED, 0);
assert.strictEqual(report.DECODER_PRODUCTION_CODE_CHANGED, 'NO');
assert.strictEqual(report.RELATED_MODELS_PRODUCTION_CODE_CHANGED, 'NO');
assert.strictEqual(report.MODEL_PAGE_PRODUCTION_CODE_CHANGED, 'NO');
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');
assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const descendantReplay = buildReplayAncestryAudit({
  currentHead: BASELINE_COMMIT,
  currentOriginMain: BASELINE_COMMIT
});
assert.strictEqual(descendantReplay.RESULT_IS_ANCESTOR_OF_HEAD, 'PASS');
assert.strictEqual(descendantReplay.POST_COMMIT_SELF_REPLAY, 'PASS');

const negativeReplay = buildReplayAncestryAudit({
  currentHead: PHASE_SOURCE_COMMIT,
  currentOriginMain: PHASE_SOURCE_COMMIT
});
assert.strictEqual(negativeReplay.RESULT_IS_ANCESTOR_OF_HEAD, 'FAIL');
assert.strictEqual(negativeReplay.POST_COMMIT_SELF_REPLAY, 'FAIL');

const finalReport = JSON.parse(fs.readFileSync(new URL('../data/phase35c432111_final_report.json', import.meta.url), 'utf8'));
assert.strictEqual(finalReport.FINAL_STATUS, 'PASS');
assert.strictEqual(finalReport.PHASE35C422_ARTIFACT_PINNED, 'PASS');

const failureAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c432111_failure_injection_report.json', import.meta.url), 'utf8'));
assert.strictEqual(failureAudit.FAILURE_INJECTION, 'PASS');
assert.strictEqual(failureAudit.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY, 'PASS');
assert.strictEqual(failureAudit.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED, 'PASS');
assert.strictEqual(failureAudit.RESULT_NOT_IN_CURRENT_HISTORY_DETECTED, 'PASS');

const pinAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c432111_phase35c422_snapshot_pin_audit.json', import.meta.url), 'utf8'));
assert.strictEqual(pinAudit.PHASE35C422_RESULT_COMMIT, 'ab2410e3f23d63483c1aadd4a7735328ec2b50e9');
assert.strictEqual(pinAudit.PHASE35C422_ARTIFACT_PINNED, 'PASS');

const publicStoreDiffAfter = git(['diff', '--', 'data/public_evidence_facts.json']);
assert.strictEqual(publicStoreDiffAfter, publicStoreDiffBefore);

console.log('Phase 35C.4.3.2.1.1.1 self-replay ancestry hotfix tests passed.');
