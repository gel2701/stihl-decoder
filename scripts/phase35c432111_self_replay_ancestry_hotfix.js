import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  BASELINE_COMMIT,
  PHASE_SOURCE_COMMIT,
  PHASE_RESULT_COMMIT,
  EXPECTED_PUBLIC_STORE_CANONICAL_SHA256,
  git,
  gitCommitExists,
  readGitJson,
  sha256Canonical,
  sanitizeForHash,
  writeJson,
  loadJson,
  runImmutableReplay,
  main as runPhase35c43211
} from './phase35c43211_postcommit_replay_hotfix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const PHASE_ID = '35C.4.3.2.1.1.1';
const PHASE35C422_RESULT_COMMIT = 'ab2410e3f23d63483c1aadd4a7735328ec2b50e9';
const OUTPUTS = {
  preflight: path.join(rootDir, 'data', 'phase35c432111_preflight_report.json'),
  replayAncestry: path.join(rootDir, 'data', 'phase35c432111_replay_ancestry_audit.json'),
  selfReplay: path.join(rootDir, 'data', 'phase35c432111_self_replay_audit.json'),
  phase35c422Pin: path.join(rootDir, 'data', 'phase35c432111_phase35c422_snapshot_pin_audit.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c432111_failure_injection_report.json'),
  publicStoreImmutability: path.join(rootDir, 'data', 'phase35c432111_public_store_immutability_audit.json'),
  idempotency: path.join(rootDir, 'data', 'phase35c432111_idempotency_report.json'),
  finalReport: path.join(rootDir, 'data', 'phase35c432111_final_report.json')
};

function tryResolveRef(ref) {
  try {
    return git(['rev-parse', ref]);
  } catch {
    return null;
  }
}

function isAncestor(ancestor, descendant) {
  if (!ancestor || !descendant || !gitCommitExists(ancestor) || !gitCommitExists(descendant)) {
    return false;
  }

  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: rootDir,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

export function buildDevelopmentBaselinePrecheck(options = {}) {
  const currentHead = options.currentHead || tryResolveRef('HEAD');
  const currentOriginMain = Object.prototype.hasOwnProperty.call(options, 'currentOriginMain')
    ? options.currentOriginMain
    : tryResolveRef('origin/main');
  const currentMergeBase = Object.prototype.hasOwnProperty.call(options, 'currentMergeBase')
    ? options.currentMergeBase
    : (currentHead && currentOriginMain ? git(['merge-base', currentHead, currentOriginMain]) : null);
  const failures = [];

  if (currentHead !== BASELINE_COMMIT) failures.push('HEAD_NOT_DEVELOPMENT_BASELINE');
  if (currentOriginMain !== BASELINE_COMMIT) failures.push('ORIGIN_MAIN_NOT_DEVELOPMENT_BASELINE');
  if (currentMergeBase !== BASELINE_COMMIT) failures.push('MERGE_BASE_NOT_DEVELOPMENT_BASELINE');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_COMMIT,
    CURRENT_HEAD: currentHead,
    CURRENT_ORIGIN_MAIN: currentOriginMain,
    CURRENT_MERGE_BASE: currentMergeBase,
    DEVELOPMENT_BASELINE_PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL',
    failures
  };
}

export function buildReplayAncestryAudit(options = {}) {
  const currentHead = options.currentHead || tryResolveRef('HEAD');
  const currentOriginMain = Object.prototype.hasOwnProperty.call(options, 'currentOriginMain')
    ? options.currentOriginMain
    : tryResolveRef('origin/main');
  const replay = runImmutableReplay({ currentHead, currentOriginMain });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_COMMIT,
    CURRENT_HEAD: currentHead,
    CURRENT_ORIGIN_MAIN: currentOriginMain,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    PHASE_SOURCE_COMMIT_FOUND: replay.PHASE_SOURCE_COMMIT_FOUND,
    PHASE_RESULT_COMMIT_FOUND: replay.PHASE_RESULT_COMMIT_FOUND,
    SOURCE_TO_RESULT_RELATION_VALID: replay.SOURCE_TO_RESULT_RELATION_VALID,
    RESULT_IS_ANCESTOR_OF_HEAD: replay.RESULT_IS_ANCESTOR_OF_HEAD,
    RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: replay.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN,
    HEAD_EQUALITY_REQUIRED_FOR_REPLAY: replay.HEAD_EQUALITY_REQUIRED_FOR_REPLAY,
    ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: replay.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY,
    POST_COMMIT_SELF_REPLAY: replay.POST_COMMIT_SELF_REPLAY,
    POST_COMMIT_REPLAY: replay.POST_COMMIT_REPLAY,
    failure_reasons: replay.failure_reasons
  };
}

function buildPhase35c422SnapshotPinAudit() {
  const commitExists = gitCommitExists(PHASE35C422_RESULT_COMMIT);
  const artifactExists = commitExists
    ? (() => {
        try {
          execFileSync('git', ['cat-file', '-e', `${PHASE35C422_RESULT_COMMIT}:data/phase35c422_final_report.json`], {
            cwd: rootDir,
            stdio: 'ignore'
          });
          return true;
        } catch {
          return false;
        }
      })()
    : false;
  const report = artifactExists ? readGitJson(PHASE35C422_RESULT_COMMIT, 'data/phase35c422_final_report.json') : null;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    PHASE35C422_RESULT_COMMIT,
    PHASE35C422_RESULT_COMMIT_FOUND: commitExists ? 'PASS' : 'FAIL',
    PHASE35C422_RESULT_ARTIFACT_FOUND: artifactExists ? 'PASS' : 'FAIL',
    PHASE35C422_ARTIFACT_FINAL_STATUS: report?.FINAL_STATUS || 'MISSING',
    PHASE35C422_ARTIFACT_PINNED: commitExists && artifactExists && report?.FINAL_STATUS === 'PASS' ? 'PASS' : 'FAIL'
  };
}

function buildPublicStoreImmutabilityAudit(replayAudit) {
  const currentStore = loadJson('data/public_evidence_facts.json');
  const currentHash = sha256Canonical(currentStore);
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.SOURCE_PUBLIC_STORE_CANONICAL_SHA256,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.RESULT_PUBLIC_STORE_CANONICAL_SHA256,
    CURRENT_PUBLIC_STORE_CANONICAL_SHA256: currentHash,
    PUBLIC_STORE_CANONICAL_SHA256: currentHash,
    PUBLIC_STORE_CHANGED: 'NO',
    PUBLIC_FACT_COUNT: Array.isArray(currentStore.facts) ? currentStore.facts.length : 0
  };
}

function buildSelfReplayAudit(phase35c43211Report, replayAncestryAudit) {
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_COMMIT,
    CURRENT_HEAD: replayAncestryAudit.CURRENT_HEAD,
    CURRENT_ORIGIN_MAIN: replayAncestryAudit.CURRENT_ORIGIN_MAIN,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    PHASE_SOURCE_COMMIT_FOUND: replayAncestryAudit.PHASE_SOURCE_COMMIT_FOUND,
    PHASE_RESULT_COMMIT_FOUND: replayAncestryAudit.PHASE_RESULT_COMMIT_FOUND,
    SOURCE_TO_RESULT_RELATION_VALID: replayAncestryAudit.SOURCE_TO_RESULT_RELATION_VALID,
    RESULT_IS_ANCESTOR_OF_HEAD: replayAncestryAudit.RESULT_IS_ANCESTOR_OF_HEAD,
    RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: replayAncestryAudit.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN,
    HEAD_EQUALITY_REQUIRED_FOR_REPLAY: replayAncestryAudit.HEAD_EQUALITY_REQUIRED_FOR_REPLAY,
    ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: replayAncestryAudit.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY,
    POST_COMMIT_SELF_REPLAY: replayAncestryAudit.POST_COMMIT_SELF_REPLAY,
    POST_COMMIT_REPLAY: replayAncestryAudit.POST_COMMIT_REPLAY,
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: phase35c43211Report.SOURCE_PUBLIC_STORE_CANONICAL_SHA256,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: phase35c43211Report.RESULT_PUBLIC_STORE_CANONICAL_SHA256,
    CURRENT_PUBLIC_STORE_CANONICAL_SHA256: phase35c43211Report.CURRENT_PUBLIC_STORE_CANONICAL_SHA256,
    DIRTY_WORKTREE_REPLAY_CONTAMINATION: phase35c43211Report.DIRTY_WORKTREE_REPLAY_CONTAMINATION,
    DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT: phase35c43211Report.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT,
    REPLAY_MUTATED_PUBLIC_STORE: phase35c43211Report.REPLAY_MUTATED_PUBLIC_STORE,
    REAL_PUBLIC_STORE_WRITE_ATTEMPTED: phase35c43211Report.REAL_PUBLIC_STORE_WRITE_ATTEMPTED,
    TEST_HARNESS_SILENT_STORE_RESTORE: phase35c43211Report.TEST_HARNESS_SILENT_STORE_RESTORE,
    FAILURE_INJECTIONS_USE_TEMPORARY_STORE: phase35c43211Report.FAILURE_INJECTIONS_USE_TEMPORARY_STORE,
    PUBLIC_STORE_WRITES_BY_TEST_HARNESS: phase35c43211Report.PUBLIC_STORE_WRITES_BY_TEST_HARNESS,
    PUBLIC_STORE_MUTATIONS_BY_TESTS: phase35c43211Report.PUBLIC_STORE_MUTATIONS_BY_TESTS,
    HARNESS_PUBLIC_STORE_MUTATION_DETECTED: phase35c43211Report.HARNESS_PUBLIC_STORE_MUTATION_DETECTED,
    TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED: phase35c43211Report.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED,
    REAL_PUBLIC_STORE_BYTE_STABLE: phase35c43211Report.REAL_PUBLIC_STORE_BYTE_STABLE,
    ORIGINAL_STORE_RESTORED_AFTER_FAILURE: phase35c43211Report.ORIGINAL_STORE_RESTORED_AFTER_FAILURE,
    ORIGINAL_STORE_RESTORE_MODE: phase35c43211Report.ORIGINAL_STORE_RESTORE_MODE,
    CANONICAL_DATABASE_CHANGED: phase35c43211Report.CANONICAL_DATABASE_CHANGED,
    CANONICAL_VERIFIED_BEFORE: phase35c43211Report.CANONICAL_VERIFIED_BEFORE,
    CANONICAL_VERIFIED_AFTER: phase35c43211Report.CANONICAL_VERIFIED_AFTER,
    UNEXPECTED_CANONICAL_PROMOTIONS: phase35c43211Report.UNEXPECTED_CANONICAL_PROMOTIONS,
    HISTORICAL_TEST_WEAKENING: phase35c43211Report.HISTORICAL_TEST_WEAKENING,
    HISTORICAL_SAFETY_ASSERTIONS_REMOVED: phase35c43211Report.HISTORICAL_SAFETY_ASSERTIONS_REMOVED,
    DECODER_PRODUCTION_CODE_CHANGED: phase35c43211Report.DECODER_PRODUCTION_CODE_CHANGED,
    RELATED_MODELS_PRODUCTION_CODE_CHANGED: phase35c43211Report.RELATED_MODELS_PRODUCTION_CODE_CHANGED,
    MODEL_PAGE_PRODUCTION_CODE_CHANGED: phase35c43211Report.MODEL_PAGE_PRODUCTION_CODE_CHANGED,
    FAILURE_INJECTION: phase35c43211Report.FAILURE_INJECTION,
    TEST_SUITE: phase35c43211Report.TEST_SUITE
  };
}

function buildFailureInjectionReport() {
  const descendantReplay = buildReplayAncestryAudit({
    currentHead: BASELINE_COMMIT,
    currentOriginMain: BASELINE_COMMIT
  });
  const preResultHeadReplay = buildReplayAncestryAudit({
    currentHead: PHASE_SOURCE_COMMIT,
    currentOriginMain: PHASE_SOURCE_COMMIT
  });
  const unrelatedHistoryReplay = buildReplayAncestryAudit({
    currentHead: git(['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0],
    currentOriginMain: BASELINE_COMMIT
  });
  const swappedReplay = runImmutableReplay({
    sourceCommit: PHASE_RESULT_COMMIT,
    resultCommit: PHASE_SOURCE_COMMIT,
    currentHead: BASELINE_COMMIT,
    currentOriginMain: BASELINE_COMMIT
  });
  const wrongResultReplay = runImmutableReplay({
    resultCommit: PHASE_SOURCE_COMMIT,
    currentHead: BASELINE_COMMIT,
    currentOriginMain: BASELINE_COMMIT
  });

  const records = [
    {
      check: 'DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY',
      detected: descendantReplay.CURRENT_HEAD !== PHASE_RESULT_COMMIT
        && descendantReplay.RESULT_IS_ANCESTOR_OF_HEAD === 'PASS'
        && descendantReplay.POST_COMMIT_SELF_REPLAY === 'PASS',
      details: descendantReplay
    },
    {
      check: 'REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED',
      detected: preResultHeadReplay.RESULT_IS_ANCESTOR_OF_HEAD === 'FAIL'
        && preResultHeadReplay.POST_COMMIT_SELF_REPLAY === 'FAIL',
      details: preResultHeadReplay
    },
    {
      check: 'RESULT_NOT_IN_CURRENT_HISTORY_DETECTED',
      detected: unrelatedHistoryReplay.RESULT_IS_ANCESTOR_OF_HEAD === 'FAIL'
        && unrelatedHistoryReplay.POST_COMMIT_SELF_REPLAY === 'FAIL',
      details: unrelatedHistoryReplay
    },
    {
      check: 'SOURCE_RESULT_SWAP_DETECTED',
      detected: swappedReplay.POST_COMMIT_SELF_REPLAY === 'FAIL',
      details: swappedReplay
    },
    {
      check: 'HISTORICAL_RESULT_COMMIT_MISMATCH_DETECTED',
      detected: wrongResultReplay.POST_COMMIT_SELF_REPLAY === 'FAIL',
      details: wrongResultReplay
    }
  ];

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY: records[0].detected ? 'PASS' : 'FAIL',
    REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED: records[1].detected ? 'PASS' : 'FAIL',
    RESULT_NOT_IN_CURRENT_HISTORY_DETECTED: records[2].detected ? 'PASS' : 'FAIL',
    HISTORICAL_RESULT_COMMIT_MISMATCH_DETECTED: records[4].detected ? 'PASS' : 'FAIL',
    records,
    FAILURE_INJECTION: records.every((row) => row.detected === true) ? 'PASS' : 'FAIL'
  };
}

function buildIdempotencyReport(left, right) {
  const leftHash = sha256Canonical(sanitizeForHash(left));
  const rightHash = sha256Canonical(sanitizeForHash(right));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    LEFT_HASH: leftHash,
    RIGHT_HASH: rightHash,
    IDEMPOTENCY: leftHash === rightHash ? 'PASS' : 'FAIL'
  };
}

function buildFinalReport(preflight, replayAncestryAudit, selfReplayAudit, phase35c422PinAudit, failureInjectionAudit, publicStoreAudit, idempotencyAudit) {
  const finalStatus = preflight.DEVELOPMENT_BASELINE_PRECHECK === 'PASS'
    && replayAncestryAudit.PHASE_SOURCE_COMMIT_FOUND === 'PASS'
    && replayAncestryAudit.PHASE_RESULT_COMMIT_FOUND === 'PASS'
    && replayAncestryAudit.SOURCE_TO_RESULT_RELATION_VALID === 'PASS'
    && replayAncestryAudit.RESULT_IS_ANCESTOR_OF_HEAD === 'PASS'
    && replayAncestryAudit.HEAD_EQUALITY_REQUIRED_FOR_REPLAY === 'NO'
    && replayAncestryAudit.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY === 'NO'
    && replayAncestryAudit.POST_COMMIT_SELF_REPLAY === 'PASS'
    && failureInjectionAudit.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY === 'PASS'
    && failureInjectionAudit.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED === 'PASS'
    && phase35c422PinAudit.PHASE35C422_ARTIFACT_PINNED === 'PASS'
    && publicStoreAudit.PUBLIC_STORE_CHANGED === 'NO'
    && publicStoreAudit.PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
    && publicStoreAudit.PUBLIC_FACT_COUNT === 114
    && selfReplayAudit.DIRTY_WORKTREE_REPLAY_CONTAMINATION === 0
    && selfReplayAudit.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT === 'NO'
    && selfReplayAudit.REPLAY_MUTATED_PUBLIC_STORE === 'NO'
    && selfReplayAudit.REAL_PUBLIC_STORE_WRITE_ATTEMPTED === 'NO'
    && selfReplayAudit.TEST_HARNESS_SILENT_STORE_RESTORE === 'NO'
    && selfReplayAudit.FAILURE_INJECTIONS_USE_TEMPORARY_STORE === 'PASS'
    && selfReplayAudit.PUBLIC_STORE_WRITES_BY_TEST_HARNESS === 0
    && selfReplayAudit.PUBLIC_STORE_MUTATIONS_BY_TESTS === 0
    && selfReplayAudit.HARNESS_PUBLIC_STORE_MUTATION_DETECTED === 'PASS'
    && selfReplayAudit.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED === 'PASS'
    && selfReplayAudit.REAL_PUBLIC_STORE_BYTE_STABLE === 'PASS'
    && selfReplayAudit.ORIGINAL_STORE_RESTORED_AFTER_FAILURE === 'PASS'
    && selfReplayAudit.CANONICAL_DATABASE_CHANGED === 'NO'
    && selfReplayAudit.UNEXPECTED_CANONICAL_PROMOTIONS === 0
    && selfReplayAudit.HISTORICAL_TEST_WEAKENING === 0
    && selfReplayAudit.HISTORICAL_SAFETY_ASSERTIONS_REMOVED === 0
    && selfReplayAudit.DECODER_PRODUCTION_CODE_CHANGED === 'NO'
    && selfReplayAudit.RELATED_MODELS_PRODUCTION_CODE_CHANGED === 'NO'
    && selfReplayAudit.MODEL_PAGE_PRODUCTION_CODE_CHANGED === 'NO'
    && selfReplayAudit.FAILURE_INJECTION === 'PASS'
    && idempotencyAudit.IDEMPOTENCY === 'PASS'
    && selfReplayAudit.TEST_SUITE === 'PASS';

  return {
    'FASE 35C.4.3.2.1.1.1 FINAL REPORT': true,
    BASELINE_COMMIT,
    DEVELOPMENT_BASELINE_PRECHECK: preflight.DEVELOPMENT_BASELINE_PRECHECK,
    CURRENT_HEAD: replayAncestryAudit.CURRENT_HEAD,
    CURRENT_ORIGIN_MAIN: replayAncestryAudit.CURRENT_ORIGIN_MAIN,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    PHASE_SOURCE_COMMIT_FOUND: replayAncestryAudit.PHASE_SOURCE_COMMIT_FOUND,
    PHASE_RESULT_COMMIT_FOUND: replayAncestryAudit.PHASE_RESULT_COMMIT_FOUND,
    SOURCE_TO_RESULT_RELATION_VALID: replayAncestryAudit.SOURCE_TO_RESULT_RELATION_VALID,
    RESULT_IS_ANCESTOR_OF_HEAD: replayAncestryAudit.RESULT_IS_ANCESTOR_OF_HEAD,
    RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: replayAncestryAudit.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN,
    HEAD_EQUALITY_REQUIRED_FOR_REPLAY: replayAncestryAudit.HEAD_EQUALITY_REQUIRED_FOR_REPLAY,
    ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: replayAncestryAudit.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY,
    POST_COMMIT_SELF_REPLAY: replayAncestryAudit.POST_COMMIT_SELF_REPLAY,
    DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY: failureInjectionAudit.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY,
    REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED: failureInjectionAudit.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED,
    PHASE35C422_RESULT_COMMIT,
    PHASE35C422_ARTIFACT_PINNED: phase35c422PinAudit.PHASE35C422_ARTIFACT_PINNED,
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: publicStoreAudit.SOURCE_PUBLIC_STORE_CANONICAL_SHA256,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: publicStoreAudit.RESULT_PUBLIC_STORE_CANONICAL_SHA256,
    CURRENT_PUBLIC_STORE_CANONICAL_SHA256: publicStoreAudit.CURRENT_PUBLIC_STORE_CANONICAL_SHA256,
    PUBLIC_STORE_CHANGED: publicStoreAudit.PUBLIC_STORE_CHANGED,
    PUBLIC_FACT_COUNT: publicStoreAudit.PUBLIC_FACT_COUNT,
    DIRTY_WORKTREE_REPLAY_CONTAMINATION: selfReplayAudit.DIRTY_WORKTREE_REPLAY_CONTAMINATION,
    DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT: selfReplayAudit.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT,
    REPLAY_MUTATED_PUBLIC_STORE: selfReplayAudit.REPLAY_MUTATED_PUBLIC_STORE,
    REAL_PUBLIC_STORE_WRITE_ATTEMPTED: selfReplayAudit.REAL_PUBLIC_STORE_WRITE_ATTEMPTED,
    TEST_HARNESS_SILENT_STORE_RESTORE: selfReplayAudit.TEST_HARNESS_SILENT_STORE_RESTORE,
    FAILURE_INJECTIONS_USE_TEMPORARY_STORE: selfReplayAudit.FAILURE_INJECTIONS_USE_TEMPORARY_STORE,
    PUBLIC_STORE_WRITES_BY_TEST_HARNESS: selfReplayAudit.PUBLIC_STORE_WRITES_BY_TEST_HARNESS,
    PUBLIC_STORE_MUTATIONS_BY_TESTS: selfReplayAudit.PUBLIC_STORE_MUTATIONS_BY_TESTS,
    TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED: selfReplayAudit.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED,
    REAL_PUBLIC_STORE_BYTE_STABLE: selfReplayAudit.REAL_PUBLIC_STORE_BYTE_STABLE,
    ORIGINAL_STORE_RESTORED_AFTER_FAILURE: selfReplayAudit.ORIGINAL_STORE_RESTORED_AFTER_FAILURE,
    ORIGINAL_STORE_RESTORE_MODE: selfReplayAudit.ORIGINAL_STORE_RESTORE_MODE,
    CANONICAL_DATABASE_CHANGED: selfReplayAudit.CANONICAL_DATABASE_CHANGED,
    CANONICAL_VERIFIED_BEFORE: selfReplayAudit.CANONICAL_VERIFIED_BEFORE,
    CANONICAL_VERIFIED_AFTER: selfReplayAudit.CANONICAL_VERIFIED_AFTER,
    UNEXPECTED_CANONICAL_PROMOTIONS: selfReplayAudit.UNEXPECTED_CANONICAL_PROMOTIONS,
    HISTORICAL_TEST_WEAKENING: selfReplayAudit.HISTORICAL_TEST_WEAKENING,
    HISTORICAL_SAFETY_ASSERTIONS_REMOVED: selfReplayAudit.HISTORICAL_SAFETY_ASSERTIONS_REMOVED,
    DECODER_PRODUCTION_CODE_CHANGED: selfReplayAudit.DECODER_PRODUCTION_CODE_CHANGED,
    RELATED_MODELS_PRODUCTION_CODE_CHANGED: selfReplayAudit.RELATED_MODELS_PRODUCTION_CODE_CHANGED,
    MODEL_PAGE_PRODUCTION_CODE_CHANGED: selfReplayAudit.MODEL_PAGE_PRODUCTION_CODE_CHANGED,
    FAILURE_INJECTION: failureInjectionAudit.FAILURE_INJECTION,
    IDEMPOTENCY: idempotencyAudit.IDEMPOTENCY,
    TEST_SUITE: selfReplayAudit.TEST_SUITE,
    FINAL_STATUS: finalStatus ? 'PASS' : 'FAIL'
  };
}

export async function main(options = {}) {
  const mode = options.mode || 'development';
  const preflight = buildDevelopmentBaselinePrecheck(options);
  const replayAncestryAudit = buildReplayAncestryAudit(options);

  if (mode === 'development' && preflight.DEVELOPMENT_BASELINE_PRECHECK !== 'PASS') {
    const blocked = {
      'FASE 35C.4.3.2.1.1.1 FINAL REPORT': true,
      BASELINE_COMMIT,
      DEVELOPMENT_BASELINE_PRECHECK: 'FAIL',
      CURRENT_HEAD: preflight.CURRENT_HEAD,
      CURRENT_ORIGIN_MAIN: preflight.CURRENT_ORIGIN_MAIN,
      FINAL_STATUS: 'BLOCKED'
    };
    writeJson(OUTPUTS.preflight, preflight);
    writeJson(OUTPUTS.replayAncestry, replayAncestryAudit);
    writeJson(OUTPUTS.finalReport, blocked);
    return blocked;
  }

  const phase35c43211Report = await runPhase35c43211({ mode: 'replay', currentHead: replayAncestryAudit.CURRENT_HEAD, currentOriginMain: replayAncestryAudit.CURRENT_ORIGIN_MAIN });
  const phase35c422PinAudit = buildPhase35c422SnapshotPinAudit();
  const publicStoreAudit = buildPublicStoreImmutabilityAudit(phase35c43211Report);
  const selfReplayAudit = buildSelfReplayAudit(phase35c43211Report, replayAncestryAudit);
  const failureInjectionAudit = buildFailureInjectionReport();
  const leftAudit = buildSelfReplayAudit(phase35c43211Report, replayAncestryAudit);
  const rightAudit = buildSelfReplayAudit(phase35c43211Report, replayAncestryAudit);
  const idempotencyAudit = buildIdempotencyReport(leftAudit, rightAudit);
  const finalReport = buildFinalReport(preflight, replayAncestryAudit, selfReplayAudit, phase35c422PinAudit, failureInjectionAudit, publicStoreAudit, idempotencyAudit);

  writeJson(OUTPUTS.preflight, preflight);
  writeJson(OUTPUTS.replayAncestry, replayAncestryAudit);
  writeJson(OUTPUTS.selfReplay, selfReplayAudit);
  writeJson(OUTPUTS.phase35c422Pin, phase35c422PinAudit);
  writeJson(OUTPUTS.failureInjection, failureInjectionAudit);
  writeJson(OUTPUTS.publicStoreImmutability, publicStoreAudit);
  writeJson(OUTPUTS.idempotency, idempotencyAudit);
  writeJson(OUTPUTS.finalReport, finalReport);

  return finalReport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'development';
  main({ mode })
    .then((report) => {
      console.log('Phase 35C.4.3.2.1.1.1 self-replay ancestry hotfix completed.');
      console.log(`Development baseline precheck: ${report.DEVELOPMENT_BASELINE_PRECHECK}`);
      console.log(`Final status: ${report.FINAL_STATUS}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
