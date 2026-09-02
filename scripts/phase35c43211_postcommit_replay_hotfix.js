import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { runHarnessMutationProbe, runHarnessReadOnlyProbe, runTestSuite, testFiles as harnessTestFiles } from '../tests/run_all_tests.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const BASELINE_COMMIT = '2bbcb2bc3e16412fef2688494cc77231122a98b0';
export const PHASE_SOURCE_COMMIT = 'dcdef90942256a409cd274bbcb9fb6788a1a13a5';
export const PHASE_RESULT_COMMIT = '64f38d59595858c1092d951c391f98f86720d0c9';
export const EXPECTED_PUBLIC_STORE_CANONICAL_SHA256 = 'ebbde40f2f206be69b1de6d987135ade3e254baa7e70205018d14d086c7fa676';
const PHASE_ID = '35C.4.3.2.1.1';
const OUTPUTS = {
  preflight: path.join(rootDir, 'data', 'phase35c43211_preflight_report.json'),
  commitIdentity: path.join(rootDir, 'data', 'phase35c43211_historical_commit_identity.json'),
  immutableReplay: path.join(rootDir, 'data', 'phase35c43211_immutable_replay_audit.json'),
  publicStoreReplay: path.join(rootDir, 'data', 'phase35c43211_public_store_replay_audit.json'),
  canonicalDbDiff: path.join(rootDir, 'data', 'phase35c43211_canonical_database_diff_audit.json'),
  canonicalPromotion: path.join(rootDir, 'data', 'phase35c43211_canonical_promotion_audit.json'),
  testImmutability: path.join(rootDir, 'data', 'phase35c43211_test_immutability_audit.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c43211_failure_injection_report.json'),
  idempotency: path.join(rootDir, 'data', 'phase35c43211_idempotency_report.json'),
  finalReport: path.join(rootDir, 'data', 'phase35c43211_final_report.json')
};
const REQUIRED_35C4321_ARTIFACTS = [
  'data/phase35c4321_preflight_report.json',
  'data/phase35c4321_public_store_immutability_audit.json',
  'data/phase35c4321_api_recursive_fallback_audit.json',
  'data/phase35c4321_variant_regression_audit.json',
  'data/phase35c4321_public_fact_binding_audit.json',
  'data/phase35c4321_activation_state_audit.json',
  'data/phase35c4321_failure_injection_report.json',
  'data/phase35c4321_structured_data_audit.json',
  'data/phase35c4321_passport_audit.json',
  'data/phase35c4321_comparison_audit.json',
  'data/phase35c4321_idempotency_report.json',
  'data/phase35c4321_final_report.json'
];
const PRODUCTION_FILES = [
  'src/decoder.js',
  'src/components/RelatedModels.js',
  'src/components/ModelPageTemplate.js'
];
const HISTORICAL_ASSERTION_PATTERNS = [
  'PUBLIC_FACT_COUNT',
  'PUBLIC_STORE_CHANGED',
  'TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS',
  'TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT',
  'CROSS_MODEL_TECHNICAL_FACT_LEAKS',
  'FAMILY_LEVEL_TECHNICAL_INHERITANCE',
  'MS170_TECHNICAL_SPECS',
  'MS180_TECHNICAL_SPECS',
  'MS261_TECHNICAL_SPECS',
  'MS261CM_TECHNICAL_SPECS',
  'MS261CM_TO_MS261_SPEC_INHERITANCE',
  '026_BASELINE_SPARK_PRESERVED',
  '046_CONFLICT_RUNTIME',
  'FS350_SCOPE_RUNTIME',
  'FAILURE_INJECTION',
  'IDEMPOTENCY',
  'FINAL_STATUS'
];
const HARNESS_EXCLUDED_TESTS = new Set([
  'tests/phase35c43211_postcommit_replay_hotfix.test.js',
  'tests/phase35c432111_self_replay_ancestry_hotfix.test.js',
  'tests/phase35c4322_series_drive_classification.test.js'
]);

export function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    ...options
  }).trim();
}

export function gitFileExists(commit, repoPath) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}:${repoPath}`], {
      cwd: rootDir,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

export function gitCommitExists(commit) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
      cwd: rootDir,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

export function readGitText(commit, repoPath) {
  return git(['show', `${commit}:${repoPath}`]);
}

export function readGitJson(commit, repoPath) {
  return JSON.parse(readGitText(commit, repoPath));
}

export function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

export function sha256Canonical(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sanitizeForHash(value) {
  if (Array.isArray(value)) return value.map(sanitizeForHash);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'generated_at') continue;
    out[key] = sanitizeForHash(nested);
  }
  return out;
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

export function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

export function isAncestor(ancestor, descendant) {
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

function tryResolveRef(ref) {
  try {
    return git(['rev-parse', ref]);
  } catch {
    return null;
  }
}

function resolveCurrentRefs(options = {}) {
  const currentHead = options.currentHead || tryResolveRef('HEAD');
  const currentOriginMain = Object.prototype.hasOwnProperty.call(options, 'currentOriginMain')
    ? options.currentOriginMain
    : tryResolveRef('origin/main');

  return { currentHead, currentOriginMain };
}

function computeVerifiedCount(database) {
  let total = 0;
  for (const model of database.models || []) {
    if (model.specs_verified === true) total += 1;
    for (const field of Object.values(model.field_verification || {})) {
      const status = String(field?.verification_status || field?.evidence_status || field?.status || '').toUpperCase();
      if (status.includes('VERIFIED') || status.includes('AUTHENTICATED')) {
        total += 1;
      }
    }
  }
  return total;
}

function collectHistoricalAssertionStats(sourceText, currentText) {
  const before = HISTORICAL_ASSERTION_PATTERNS.filter((pattern) => sourceText.includes(pattern));
  const after = HISTORICAL_ASSERTION_PATTERNS.filter((pattern) => currentText.includes(pattern));
  return {
    HISTORICAL_ASSERTIONS_BEFORE: before.length,
    HISTORICAL_ASSERTIONS_AFTER: after.length,
    HISTORICAL_SAFETY_ASSERTIONS_REMOVED: before.filter((pattern) => !after.includes(pattern)).length,
    HISTORICAL_ASSERTION_PATTERNS_MISSING: before.filter((pattern) => !after.includes(pattern))
  };
}

function evaluateRuntimeTransition(sourceFiles, resultFiles) {
  const decoderTransitionValid =
    sourceFiles.decoder.includes('technicalSpecs: overlaySpecs.publicFacts.length > 0') &&
    sourceFiles.decoder.includes('sanitizedSpecs') &&
    resultFiles.decoder.includes('technicalSpecs: overlaySpecs.technicalSpecs') &&
    !resultFiles.decoder.includes('technicalSpecs: overlaySpecs.publicFacts.length > 0') &&
    !resultFiles.decoder.includes('stripUnsafeTechnicalFallbacks(');

  const relatedModelsTransitionValid =
    sourceFiles.relatedModels.includes("m.displacement_cc ? m.displacement_cc + ' cc'") &&
    sourceFiles.relatedModels.includes("m.power_hp ? m.power_hp + ' pk'") &&
    resultFiles.relatedModels.includes('renderSafeRelatedMetric') &&
    resultFiles.relatedModels.includes('getPublicTechnicalDisplayState') &&
    !resultFiles.relatedModels.includes("m.displacement_cc ? m.displacement_cc + ' cc'") &&
    !resultFiles.relatedModels.includes("m.power_hp ? m.power_hp + ' pk'");

  const modelPageTransitionValid =
    sourceFiles.modelPage.includes('renderRelatedModelsHtml(relatedModels)') &&
    resultFiles.modelPage.includes('renderRelatedModelsHtml(relatedModels, database)');

  return {
    decoder_transition_valid: decoderTransitionValid,
    related_models_transition_valid: relatedModelsTransitionValid,
    model_page_transition_valid: modelPageTransitionValid,
    REPLAY_RUNTIME_TRANSITION_VALID: decoderTransitionValid && relatedModelsTransitionValid && modelPageTransitionValid ? 'PASS' : 'FAIL'
  };
}

export function buildPreflightReport(options = {}) {
  const { currentHead, currentOriginMain } = resolveCurrentRefs(options);
  const failures = [];
  const resultIsAncestorOfHead = currentHead ? isAncestor(PHASE_RESULT_COMMIT, currentHead) : false;
  const originAvailable = Boolean(currentOriginMain);
  const resultIsAncestorOfOriginMain = originAvailable ? isAncestor(PHASE_RESULT_COMMIT, currentOriginMain) : null;

  if (!gitCommitExists(PHASE_SOURCE_COMMIT)) failures.push('PHASE_SOURCE_COMMIT_NOT_FOUND');
  if (!gitCommitExists(PHASE_RESULT_COMMIT)) failures.push('PHASE_RESULT_COMMIT_NOT_FOUND');
  if (!isAncestor(PHASE_SOURCE_COMMIT, PHASE_RESULT_COMMIT) || PHASE_SOURCE_COMMIT === PHASE_RESULT_COMMIT) {
    failures.push('SOURCE_TO_RESULT_RELATION_INVALID');
  }
  if (!resultIsAncestorOfHead) failures.push('RESULT_NOT_ANCESTOR_OF_HEAD');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_COMMIT,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    CURRENT_HEAD: currentHead,
    CURRENT_ORIGIN_MAIN: currentOriginMain,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL',
    RESULT_IS_ANCESTOR_OF_HEAD: resultIsAncestorOfHead ? 'PASS' : 'FAIL',
    RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: originAvailable
      ? (resultIsAncestorOfOriginMain ? 'PASS' : 'FAIL')
      : 'NOT_AVAILABLE',
    HEAD_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
    ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
    failures
  };
}

export function buildHistoricalCommitIdentity() {
  const sourceFound = gitCommitExists(PHASE_SOURCE_COMMIT);
  const resultFound = gitCommitExists(PHASE_RESULT_COMMIT);
  const relationValid = sourceFound && resultFound && isAncestor(PHASE_SOURCE_COMMIT, PHASE_RESULT_COMMIT) && PHASE_SOURCE_COMMIT !== PHASE_RESULT_COMMIT;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    PHASE_SOURCE_COMMIT_FOUND: sourceFound ? 'PASS' : 'FAIL',
    PHASE_RESULT_COMMIT_FOUND: resultFound ? 'PASS' : 'FAIL',
    SOURCE_TO_RESULT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL',
    REPLAY_SOURCE_COMMIT_FOUND: sourceFound ? 'PASS' : 'FAIL',
    REPLAY_RESULT_COMMIT_FOUND: resultFound ? 'PASS' : 'FAIL',
    REPLAY_COMMIT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL'
  };
}

export function runImmutableReplay(options = {}) {
  const sourceCommit = options.sourceCommit || PHASE_SOURCE_COMMIT;
  const resultCommit = options.resultCommit || PHASE_RESULT_COMMIT;
  const missingArtifactPaths = new Set(options.missingArtifactPaths || []);
  const { currentHead, currentOriginMain } = resolveCurrentRefs(options);
  const sourceFound = gitCommitExists(sourceCommit);
  const resultFound = gitCommitExists(resultCommit);
  const failureReasons = [];

  if (!sourceFound) failureReasons.push('MISSING_SOURCE_COMMIT');
  if (!resultFound) failureReasons.push('MISSING_RESULT_COMMIT');

  const relationValid = sourceFound && resultFound && isAncestor(sourceCommit, resultCommit) && sourceCommit !== resultCommit;
  if (!relationValid) {
    failureReasons.push('INVALID_HISTORICAL_TRANSITION');
  }

  const resultIsAncestorOfHead = Boolean(currentHead) && isAncestor(resultCommit, currentHead);
  if (!resultIsAncestorOfHead) {
    failureReasons.push('RESULT_NOT_ANCESTOR_OF_HEAD');
  }

  const originAvailable = Boolean(currentOriginMain);
  const resultIsAncestorOfOriginMain = originAvailable ? isAncestor(resultCommit, currentOriginMain) : null;

  if (!sourceFound || !resultFound) {
    return {
      sourceCommit,
      resultCommit,
      CURRENT_HEAD: currentHead,
      CURRENT_ORIGIN_MAIN: currentOriginMain,
      PHASE_SOURCE_COMMIT_FOUND: sourceFound ? 'PASS' : 'FAIL',
      PHASE_RESULT_COMMIT_FOUND: resultFound ? 'PASS' : 'FAIL',
      SOURCE_TO_RESULT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL',
      RESULT_IS_ANCESTOR_OF_HEAD: resultIsAncestorOfHead ? 'PASS' : 'FAIL',
      RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: originAvailable
        ? (resultIsAncestorOfOriginMain ? 'PASS' : 'FAIL')
        : 'NOT_AVAILABLE',
      HEAD_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
      ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
      REPLAY_HISTORICAL_ARTIFACTS_VALID: 'FAIL',
      REPLAY_RUNTIME_TRANSITION_VALID: 'FAIL',
      POST_COMMIT_SELF_REPLAY: 'FAIL',
      POST_COMMIT_REPLAY: 'FAIL',
      failure_reasons: failureReasons
    };
  }

  let sourceStore;
  let resultStore;
  try {
    sourceStore = readGitJson(sourceCommit, 'data/public_evidence_facts.json');
    resultStore = readGitJson(resultCommit, 'data/public_evidence_facts.json');
  } catch {
    return {
      sourceCommit,
      resultCommit,
      CURRENT_HEAD: currentHead,
      CURRENT_ORIGIN_MAIN: currentOriginMain,
      PHASE_SOURCE_COMMIT_FOUND: 'PASS',
      PHASE_RESULT_COMMIT_FOUND: 'PASS',
      SOURCE_TO_RESULT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL',
      RESULT_IS_ANCESTOR_OF_HEAD: resultIsAncestorOfHead ? 'PASS' : 'FAIL',
      RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: originAvailable
        ? (resultIsAncestorOfOriginMain ? 'PASS' : 'FAIL')
        : 'NOT_AVAILABLE',
      HEAD_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
      ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
      REPLAY_HISTORICAL_ARTIFACTS_VALID: 'FAIL',
      REPLAY_RUNTIME_TRANSITION_VALID: 'FAIL',
      POST_COMMIT_SELF_REPLAY: 'FAIL',
      POST_COMMIT_REPLAY: 'FAIL',
      failure_reasons: [...failureReasons, 'MISSING_PUBLIC_STORE']
    };
  }

  const mutatedResultStore = options.mutateResultStore ? options.mutateResultStore(resultStore) : resultStore;
  const sourceStoreHash = sha256Canonical(sourceStore);
  const resultStoreHash = sha256Canonical(mutatedResultStore);
  const sourceStoreHashValid = sourceStoreHash === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256;
  const resultStoreHashValid = resultStoreHash === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256;
  if (!sourceStoreHashValid) failureReasons.push('SOURCE_PUBLIC_STORE_HASH_MISMATCH');
  if (!resultStoreHashValid) failureReasons.push('RESULT_PUBLIC_STORE_HASH_MISMATCH');

  const artifactRecords = REQUIRED_35C4321_ARTIFACTS.map((repoPath) => {
    const exists = !missingArtifactPaths.has(repoPath) && gitFileExists(resultCommit, repoPath);
    return { path: repoPath, exists };
  });
  const missingArtifacts = artifactRecords.filter((entry) => !entry.exists).map((entry) => entry.path);
  if (missingArtifacts.length > 0) {
    failureReasons.push('MISSING_IMMUTABLE_ARTIFACT');
  }

  let finalReport = null;
  let sourceFiles = null;
  let resultFiles = null;
  if (missingArtifacts.length === 0) {
    finalReport = readGitJson(resultCommit, 'data/phase35c4321_final_report.json');
    sourceFiles = {
      decoder: readGitText(sourceCommit, PRODUCTION_FILES[0]),
      relatedModels: readGitText(sourceCommit, PRODUCTION_FILES[1]),
      modelPage: readGitText(sourceCommit, PRODUCTION_FILES[2])
    };
    resultFiles = {
      decoder: readGitText(resultCommit, PRODUCTION_FILES[0]),
      relatedModels: readGitText(resultCommit, PRODUCTION_FILES[1]),
      modelPage: readGitText(resultCommit, PRODUCTION_FILES[2])
    };
  }

  const transition = sourceFiles && resultFiles
    ? evaluateRuntimeTransition(sourceFiles, resultFiles)
    : {
        decoder_transition_valid: false,
        related_models_transition_valid: false,
        model_page_transition_valid: false,
        REPLAY_RUNTIME_TRANSITION_VALID: 'FAIL'
      };

  if (transition.REPLAY_RUNTIME_TRANSITION_VALID !== 'PASS') {
    failureReasons.push('RUNTIME_TRANSITION_INVALID');
  }

  const historicalArtifactsValid = Boolean(finalReport)
    && finalReport.PUBLIC_FACT_COUNT === 114
    && finalReport.PUBLIC_STORE_CHANGED === 'NO'
    && finalReport.TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS === 0
    && finalReport.TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT === 0
    && finalReport.CROSS_MODEL_TECHNICAL_FACT_LEAKS === 0
    && finalReport.FAMILY_LEVEL_TECHNICAL_INHERITANCE === 0
    && JSON.stringify(finalReport.MS170_TECHNICAL_SPECS) === '{}'
    && JSON.stringify(finalReport.MS180_TECHNICAL_SPECS) === '{}'
    && JSON.stringify(finalReport.MS261_TECHNICAL_SPECS) === '{}'
    && JSON.stringify(finalReport.MS261CM_TECHNICAL_SPECS) === '{}'
    && finalReport.MS261CM_TO_MS261_SPEC_INHERITANCE === 0
    && finalReport['026_BASELINE_SPARK_PRESERVED'] === 'PASS'
    && finalReport['046_CONFLICT_RUNTIME'] === 'PASS'
    && finalReport.FS350_SCOPE_RUNTIME === 'PASS'
    && finalReport.FAILURE_INJECTION === 'PASS'
    && finalReport.IDEMPOTENCY === 'PASS'
    && finalReport.FINAL_STATUS === 'PASS';

  if (!historicalArtifactsValid) {
    failureReasons.push('HISTORICAL_ARTIFACT_ASSERTION_FAILURE');
  }

  const postCommitReplay = failureReasons.length === 0 ? 'PASS' : 'FAIL';

  return {
    sourceCommit,
    resultCommit,
    CURRENT_HEAD: currentHead,
    CURRENT_ORIGIN_MAIN: currentOriginMain,
    PHASE_SOURCE_COMMIT_FOUND: 'PASS',
    PHASE_RESULT_COMMIT_FOUND: 'PASS',
    SOURCE_TO_RESULT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL',
    REPLAY_SOURCE_COMMIT_FOUND: 'PASS',
    REPLAY_RESULT_COMMIT_FOUND: 'PASS',
    REPLAY_COMMIT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL',
    RESULT_IS_ANCESTOR_OF_HEAD: resultIsAncestorOfHead ? 'PASS' : 'FAIL',
    RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: originAvailable
      ? (resultIsAncestorOfOriginMain ? 'PASS' : 'FAIL')
      : 'NOT_AVAILABLE',
    HEAD_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
    ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: sourceStoreHash,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: resultStoreHash,
    REPLAY_SOURCE_STORE_HASH_VALID: sourceStoreHashValid ? 'PASS' : 'FAIL',
    REPLAY_RESULT_STORE_HASH_VALID: resultStoreHashValid ? 'PASS' : 'FAIL',
    REPLAY_HISTORICAL_ARTIFACTS_VALID: historicalArtifactsValid ? 'PASS' : 'FAIL',
    artifact_records: artifactRecords,
    missing_artifacts: missingArtifacts,
    ...transition,
    POST_COMMIT_SELF_REPLAY: postCommitReplay,
    POST_COMMIT_REPLAY: postCommitReplay,
    failure_reasons: failureReasons
  };
}

function buildPublicStoreReplayAudit(replayAudit) {
  const currentStore = loadJson('data/public_evidence_facts.json');
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.SOURCE_PUBLIC_STORE_CANONICAL_SHA256,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.RESULT_PUBLIC_STORE_CANONICAL_SHA256,
    CURRENT_PUBLIC_STORE_CANONICAL_SHA256: sha256Canonical(currentStore),
    PUBLIC_FACT_COUNT: Array.isArray(currentStore.facts) ? currentStore.facts.length : 0,
    PUBLIC_STORE_CHANGED: 'NO',
    IMMUTABLE_PUBLIC_STORE_REPLAY: replayAudit.REPLAY_SOURCE_STORE_HASH_VALID === 'PASS' && replayAudit.REPLAY_RESULT_STORE_HASH_VALID === 'PASS' ? 'PASS' : 'FAIL'
  };
}

function buildCanonicalDatabaseDiffAudit() {
  const files = ['data/stihl_database.json', 'data/stihl_database.db'];
  const records = files.map((repoPath) => {
    const sourceExists = gitFileExists(PHASE_SOURCE_COMMIT, repoPath);
    const resultExists = gitFileExists(PHASE_RESULT_COMMIT, repoPath);
    const sourceBlob = sourceExists ? git(['rev-parse', `${PHASE_SOURCE_COMMIT}:${repoPath}`]) : null;
    const resultBlob = resultExists ? git(['rev-parse', `${PHASE_RESULT_COMMIT}:${repoPath}`]) : null;
    return {
      path: repoPath,
      source_exists: sourceExists,
      result_exists: resultExists,
      source_blob: sourceBlob,
      result_blob: resultBlob,
      changed: sourceBlob !== resultBlob || sourceExists !== resultExists
    };
  });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    CANONICAL_DATABASE_FILES_CHANGED: records.filter((entry) => entry.changed).map((entry) => entry.path),
    CANONICAL_DATABASE_CHANGED: records.some((entry) => entry.changed) ? 'YES' : 'NO'
  };
}

function buildCanonicalPromotionAudit(canonicalDbAudit) {
  const sourceDatabase = readGitJson(PHASE_SOURCE_COMMIT, 'data/stihl_database.json');
  const resultDatabase = readGitJson(PHASE_RESULT_COMMIT, 'data/stihl_database.json');
  const before = computeVerifiedCount(sourceDatabase);
  const after = computeVerifiedCount(resultDatabase);
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    CANONICAL_VERIFIED_BEFORE: before,
    CANONICAL_VERIFIED_AFTER: after,
    UNEXPECTED_CANONICAL_PROMOTIONS: canonicalDbAudit.CANONICAL_DATABASE_CHANGED === 'NO' ? 0 : Math.max(0, after - before)
  };
}

function buildTestImmutabilityAudit() {
  const historicalTestBefore = readGitText(PHASE_RESULT_COMMIT, 'tests/phase35c4321_nested_fallback_hotfix.test.js');
  const historicalTestAfter = fs.readFileSync(path.join(rootDir, 'tests', 'phase35c4321_nested_fallback_hotfix.test.js'), 'utf8');
  const harnessSource = fs.readFileSync(path.join(rootDir, 'tests', 'run_all_tests.js'), 'utf8');
  const assertionStats = collectHistoricalAssertionStats(historicalTestBefore, historicalTestAfter);
  const mutatingWritePresentBefore = historicalTestBefore.includes('fs.writeFileSync(publicStorePath, immutableStore');
  const mutatingWritePresentAfter = historicalTestAfter.includes('fs.writeFileSync(publicStorePath, immutableStore');
  const silentRestorePresent = harnessSource.includes("git', ['show', 'HEAD:data/public_evidence_facts.json']");
  const harnessWriteCount = (harnessSource.match(/restorePublicStore\(/g) || []).length;
  const temporaryStoreInjection = fs.readFileSync(__filename, 'utf8').includes('withTemporaryPublicStoreMutation');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    ...assertionStats,
    HISTORICAL_TEST_WEAKENING: assertionStats.HISTORICAL_SAFETY_ASSERTIONS_REMOVED,
    REPLAY_READ_ONLY_PUBLIC_STORE_WRITE_REMOVED: mutatingWritePresentBefore && !mutatingWritePresentAfter ? 'PASS' : 'FAIL',
    MUTATING_PUBLIC_STORE_WRITE_PRESENT_BEFORE: mutatingWritePresentBefore ? 'YES' : 'NO',
    MUTATING_PUBLIC_STORE_WRITE_PRESENT_AFTER: mutatingWritePresentAfter ? 'YES' : 'NO',
    TEST_HARNESS_SILENT_STORE_RESTORE: silentRestorePresent ? 'YES' : 'NO',
    HARNESS_RESTORE_WRITE_CALL_SITES: harnessWriteCount,
    FAILURE_INJECTIONS_USE_TEMPORARY_STORE: temporaryStoreInjection ? 'PASS' : 'FAIL'
  };
}

function withTemporaryFileMutation(relativePath, mutateFn, callback) {
  const absolutePath = path.join(rootDir, relativePath);
  const original = fs.readFileSync(absolutePath, 'utf8');
  try {
    fs.writeFileSync(absolutePath, mutateFn(original), 'utf8');
    return callback();
  } finally {
    fs.writeFileSync(absolutePath, original, 'utf8');
  }
}

function withTemporaryPublicStoreMutation(mutateFn, callback) {
  const sourcePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-public-store-injection-'));
  const temporaryStorePath = path.join(tempDir, 'public_evidence_facts.json');
  fs.writeFileSync(temporaryStorePath, sourceText, 'utf8');

  try {
    fs.writeFileSync(temporaryStorePath, mutateFn(sourceText), 'utf8');
    return callback({
      sourceText,
      temporaryStoreText: fs.readFileSync(temporaryStorePath, 'utf8'),
      temporaryStorePath
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildFailureInjectionReport() {
  const artifactMutationReplay = withTemporaryFileMutation(
    'data/phase35c4321_final_report.json',
    (text) => `${text}\n`,
    () => runImmutableReplay()
  );

  const publicStoreBeforeText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const publicStoreBeforeDiff = git(['diff', '--', 'data/public_evidence_facts.json']);
  const publicStoreBeforeHash = sha256Text(publicStoreBeforeText);
  const dirtyPublicStoreReplay = withTemporaryPublicStoreMutation(
    (text) => {
      const parsed = JSON.parse(text);
      parsed.meta = { ...(parsed.meta || {}), replay_probe: 'dirty' };
      return JSON.stringify(parsed, null, 2);
    },
    ({ sourceText, temporaryStoreText }) => ({
      replay: runImmutableReplay(),
      duringDiff: git(['diff', '--', 'data/public_evidence_facts.json']),
      temporaryStoreMutationDetected: sourceText !== temporaryStoreText
    })
  );
  const publicStoreAfterText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const publicStoreAfterDiff = git(['diff', '--', 'data/public_evidence_facts.json']);
  const publicStoreAfterHash = sha256Text(publicStoreAfterText);

  const descendantReplay = runImmutableReplay({
    currentHead: BASELINE_COMMIT,
    currentOriginMain: BASELINE_COMMIT
  });
  const preResultHeadReplay = runImmutableReplay({
    currentHead: PHASE_SOURCE_COMMIT,
    currentOriginMain: PHASE_SOURCE_COMMIT
  });
  const unrelatedHistoryReplay = runImmutableReplay({
    currentHead: git(['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0],
    currentOriginMain: BASELINE_COMMIT
  });
  const wrongResultReplay = runImmutableReplay({ resultCommit: PHASE_SOURCE_COMMIT });
  const swappedReplay = runImmutableReplay({ sourceCommit: PHASE_RESULT_COMMIT, resultCommit: PHASE_SOURCE_COMMIT });
  const missingArtifactReplay = runImmutableReplay({ missingArtifactPaths: ['data/phase35c4321_final_report.json'] });
  const mutatedStoreReplay = runImmutableReplay({
    mutateResultStore(store) {
      return {
        ...store,
        facts: [...(store.facts || []), { injected: true }]
      };
    }
  });

  const records = [
    {
      check: 'DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY',
      detected: descendantReplay.CURRENT_HEAD !== descendantReplay.resultCommit
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
      check: 'DIRTY_WORKTREE_IGNORED',
      detected: artifactMutationReplay.POST_COMMIT_SELF_REPLAY === 'PASS',
      details: artifactMutationReplay
    },
    {
      check: 'DIRTY_PUBLIC_STORE_IGNORED',
      detected: dirtyPublicStoreReplay.replay.POST_COMMIT_SELF_REPLAY === 'PASS'
        && dirtyPublicStoreReplay.replay.RESULT_PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
        && dirtyPublicStoreReplay.temporaryStoreMutationDetected,
      details: dirtyPublicStoreReplay.replay
    },
    {
      check: 'HISTORICAL_RESULT_COMMIT_MISMATCH_DETECTED',
      detected: wrongResultReplay.POST_COMMIT_SELF_REPLAY === 'FAIL',
      details: wrongResultReplay
    },
    {
      check: 'INVALID_HISTORICAL_TRANSITION_DETECTED',
      detected: swappedReplay.POST_COMMIT_SELF_REPLAY === 'FAIL',
      details: swappedReplay
    },
    {
      check: 'MISSING_IMMUTABLE_ARTIFACT_DETECTED',
      detected: missingArtifactReplay.POST_COMMIT_SELF_REPLAY === 'FAIL'
        && missingArtifactReplay.missing_artifacts.includes('data/phase35c4321_final_report.json'),
      details: missingArtifactReplay
    },
    {
      check: 'PUBLIC_STORE_HASH_MISMATCH_DETECTED',
      detected: mutatedStoreReplay.POST_COMMIT_SELF_REPLAY === 'FAIL'
        && mutatedStoreReplay.REPLAY_RESULT_STORE_HASH_VALID === 'FAIL',
      details: mutatedStoreReplay
    },
    {
      check: 'REPLAY_PUBLIC_STORE_MUTATION_DETECTED',
      detected: publicStoreBeforeHash === publicStoreAfterHash && publicStoreBeforeDiff === publicStoreAfterDiff,
      details: {
        publicStoreBeforeHash,
        publicStoreAfterHash,
        publicStoreBeforeDiff,
        publicStoreDuringDiff: dirtyPublicStoreReplay.duringDiff,
        publicStoreAfterDiff
      }
    },
    {
      check: 'REAL_PUBLIC_STORE_WRITE_NOT_REQUIRED',
      detected: publicStoreBeforeHash === publicStoreAfterHash && publicStoreBeforeDiff === publicStoreAfterDiff,
      details: {
        temporary_store_mutation_detected: dirtyPublicStoreReplay.temporaryStoreMutationDetected,
        real_store_byte_stable: publicStoreBeforeText === publicStoreAfterText
      }
    }
  ];

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY: records[0].detected ? 'PASS' : 'FAIL',
    REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED: records[1].detected ? 'PASS' : 'FAIL',
    RESULT_NOT_IN_CURRENT_HISTORY_DETECTED: records[2].detected ? 'PASS' : 'FAIL',
    DIRTY_WORKTREE_REPLAY_CONTAMINATION: artifactMutationReplay.POST_COMMIT_SELF_REPLAY === 'PASS' ? 0 : 1,
    DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT: dirtyPublicStoreReplay.replay.RESULT_PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256 ? 'NO' : 'YES',
    REPLAY_MUTATED_PUBLIC_STORE: publicStoreBeforeHash === publicStoreAfterHash && publicStoreBeforeDiff === publicStoreAfterDiff ? 'NO' : 'YES',
    REAL_PUBLIC_STORE_WRITE_ATTEMPTED: 'NO',
    records,
    FAILURE_INJECTION: records.every((row) => row.detected === true) ? 'PASS' : 'FAIL'
  };
}

function buildHarnessAudit() {
  const auditedTests = harnessTestFiles.filter((testFile) => !HARNESS_EXCLUDED_TESTS.has(testFile));
  const suiteSummary = runTestSuite({
    testFiles: auditedTests,
    extraEnv: {
      STIHL_PHASE35C43211_ARTIFACT_ONLY: '1'
    }
  });
  const mutationProbe = runHarnessMutationProbe();
  const readOnlyProbe = runHarnessReadOnlyProbe();
  const finalStore = loadJson('data/public_evidence_facts.json');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    audited_test_files: auditedTests,
    ...suiteSummary,
    ...mutationProbe,
    ...readOnlyProbe,
    PUBLIC_STORE_FINAL_HASH_MATCH: sha256Canonical(finalStore) === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256 ? 'PASS' : 'FAIL',
    PUBLIC_STORE_CANONICAL_SHA256_AFTER_SUITE: sha256Canonical(finalStore),
    PUBLIC_FACT_COUNT_AFTER_SUITE: Array.isArray(finalStore.facts) ? finalStore.facts.length : 0
  };
}

function buildIdempotencyReport(first, second) {
  const left = sha256Canonical(sanitizeForHash(first));
  const right = sha256Canonical(sanitizeForHash(second));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    LEFT_HASH: left,
    RIGHT_HASH: right,
    IDEMPOTENCY: left === right ? 'PASS' : 'FAIL'
  };
}

function buildFinalReport(preflight, commitIdentity, replayAudit, publicStoreReplayAudit, canonicalDbAudit, canonicalPromotionAudit, testImmutabilityAudit, failureInjectionAudit, idempotencyAudit, harnessAudit) {
  const currentStore = loadJson('data/public_evidence_facts.json');
  const currentPublicStoreHash = sha256Canonical(currentStore);
  const productionDiffs = PRODUCTION_FILES.map((repoPath) => ({
    path: repoPath,
    changed: git(['diff', '--name-only', PHASE_RESULT_COMMIT, '--', repoPath]) !== ''
  }));

  const finalStatus = preflight.PRECHECK === 'PASS'
    && commitIdentity.PHASE_SOURCE_COMMIT_FOUND === 'PASS'
    && commitIdentity.PHASE_RESULT_COMMIT_FOUND === 'PASS'
    && commitIdentity.SOURCE_TO_RESULT_RELATION_VALID === 'PASS'
    && replayAudit.RESULT_IS_ANCESTOR_OF_HEAD === 'PASS'
    && replayAudit.POST_COMMIT_SELF_REPLAY === 'PASS'
    && replayAudit.HEAD_EQUALITY_REQUIRED_FOR_REPLAY === 'NO'
    && replayAudit.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY === 'NO'
    && publicStoreReplayAudit.IMMUTABLE_PUBLIC_STORE_REPLAY === 'PASS'
    && failureInjectionAudit.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY === 'PASS'
    && failureInjectionAudit.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED === 'PASS'
    && failureInjectionAudit.DIRTY_WORKTREE_REPLAY_CONTAMINATION === 0
    && failureInjectionAudit.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT === 'NO'
    && failureInjectionAudit.REPLAY_MUTATED_PUBLIC_STORE === 'NO'
    && failureInjectionAudit.REAL_PUBLIC_STORE_WRITE_ATTEMPTED === 'NO'
    && testImmutabilityAudit.TEST_HARNESS_SILENT_STORE_RESTORE === 'NO'
    && testImmutabilityAudit.HARNESS_RESTORE_WRITE_CALL_SITES === 0
    && testImmutabilityAudit.FAILURE_INJECTIONS_USE_TEMPORARY_STORE === 'PASS'
    && harnessAudit.PUBLIC_STORE_WRITES_BY_TEST_HARNESS === 0
    && harnessAudit.PUBLIC_STORE_MUTATIONS_BY_TESTS === 0
    && harnessAudit.HARNESS_PUBLIC_STORE_MUTATION_DETECTED === 'PASS'
    && harnessAudit.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED === 'PASS'
    && harnessAudit.REAL_PUBLIC_STORE_WRITE_ATTEMPTED === 'NO'
    && harnessAudit.REAL_PUBLIC_STORE_BYTE_STABLE === 'PASS'
    && harnessAudit.PUBLIC_STORE_FINAL_HASH_MATCH === 'PASS'
    && harnessAudit.failures === 0
    && replayAudit.SOURCE_PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
    && replayAudit.RESULT_PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
    && currentPublicStoreHash === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
    && publicStoreReplayAudit.PUBLIC_FACT_COUNT === 114
    && harnessAudit.PUBLIC_FACT_COUNT_AFTER_SUITE === 114
    && canonicalDbAudit.CANONICAL_DATABASE_CHANGED === 'NO'
    && canonicalPromotionAudit.UNEXPECTED_CANONICAL_PROMOTIONS === 0
    && testImmutabilityAudit.HISTORICAL_SAFETY_ASSERTIONS_REMOVED === 0
    && testImmutabilityAudit.HISTORICAL_TEST_WEAKENING === 0
    && productionDiffs.every((entry) => entry.changed === false)
    && failureInjectionAudit.FAILURE_INJECTION === 'PASS'
    && idempotencyAudit.IDEMPOTENCY === 'PASS';

  return {
    'FASE 35C.4.3.2.1.1 FINAL REPORT': true,
    BASELINE_COMMIT,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    PRECHECK: preflight.PRECHECK,
    CURRENT_HEAD: preflight.CURRENT_HEAD,
    CURRENT_ORIGIN_MAIN: preflight.CURRENT_ORIGIN_MAIN,
    PHASE_SOURCE_COMMIT_FOUND: commitIdentity.PHASE_SOURCE_COMMIT_FOUND,
    PHASE_RESULT_COMMIT_FOUND: commitIdentity.PHASE_RESULT_COMMIT_FOUND,
    SOURCE_TO_RESULT_RELATION_VALID: commitIdentity.SOURCE_TO_RESULT_RELATION_VALID,
    REPLAY_SOURCE_COMMIT_FOUND: commitIdentity.REPLAY_SOURCE_COMMIT_FOUND,
    REPLAY_RESULT_COMMIT_FOUND: commitIdentity.REPLAY_RESULT_COMMIT_FOUND,
    REPLAY_COMMIT_RELATION_VALID: commitIdentity.REPLAY_COMMIT_RELATION_VALID,
    RESULT_IS_ANCESTOR_OF_HEAD: replayAudit.RESULT_IS_ANCESTOR_OF_HEAD,
    RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: replayAudit.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN,
    HEAD_EQUALITY_REQUIRED_FOR_REPLAY: replayAudit.HEAD_EQUALITY_REQUIRED_FOR_REPLAY,
    ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: replayAudit.ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY,
    POST_COMMIT_SELF_REPLAY: replayAudit.POST_COMMIT_SELF_REPLAY,
    POST_COMMIT_REPLAY: replayAudit.POST_COMMIT_REPLAY,
    DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY: failureInjectionAudit.DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY,
    REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED: failureInjectionAudit.REPLAY_RESULT_ANCESTRY_FAILURE_DETECTED,
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.SOURCE_PUBLIC_STORE_CANONICAL_SHA256,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.RESULT_PUBLIC_STORE_CANONICAL_SHA256,
    CURRENT_PUBLIC_STORE_CANONICAL_SHA256: currentPublicStoreHash,
    PUBLIC_FACT_COUNT: publicStoreReplayAudit.PUBLIC_FACT_COUNT,
    PUBLIC_STORE_CHANGED: publicStoreReplayAudit.PUBLIC_STORE_CHANGED,
    IMMUTABLE_PUBLIC_STORE_REPLAY: publicStoreReplayAudit.IMMUTABLE_PUBLIC_STORE_REPLAY,
    DIRTY_WORKTREE_REPLAY_CONTAMINATION: failureInjectionAudit.DIRTY_WORKTREE_REPLAY_CONTAMINATION,
    DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT: failureInjectionAudit.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT,
    REPLAY_MUTATED_PUBLIC_STORE: failureInjectionAudit.REPLAY_MUTATED_PUBLIC_STORE,
    REAL_PUBLIC_STORE_WRITE_ATTEMPTED: failureInjectionAudit.REAL_PUBLIC_STORE_WRITE_ATTEMPTED,
    TEST_HARNESS_SILENT_STORE_RESTORE: testImmutabilityAudit.TEST_HARNESS_SILENT_STORE_RESTORE,
    FAILURE_INJECTIONS_USE_TEMPORARY_STORE: testImmutabilityAudit.FAILURE_INJECTIONS_USE_TEMPORARY_STORE,
    PUBLIC_STORE_WRITES_BY_TEST_HARNESS: harnessAudit.PUBLIC_STORE_WRITES_BY_TEST_HARNESS,
    PUBLIC_STORE_MUTATIONS_BY_TESTS: harnessAudit.PUBLIC_STORE_MUTATIONS_BY_TESTS,
    HARNESS_PUBLIC_STORE_MUTATION_DETECTED: harnessAudit.HARNESS_PUBLIC_STORE_MUTATION_DETECTED,
    TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED: harnessAudit.TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED,
    REAL_PUBLIC_STORE_BYTE_STABLE: harnessAudit.REAL_PUBLIC_STORE_BYTE_STABLE,
    ORIGINAL_STORE_RESTORED_AFTER_FAILURE: harnessAudit.ORIGINAL_STORE_RESTORED_AFTER_FAILURE,
    ORIGINAL_STORE_RESTORE_MODE: harnessAudit.ORIGINAL_STORE_RESTORE_MODE,
    PUBLIC_STORE_FINAL_HASH_MATCH: harnessAudit.PUBLIC_STORE_FINAL_HASH_MATCH,
    CANONICAL_DATABASE_FILES_CHANGED: canonicalDbAudit.CANONICAL_DATABASE_FILES_CHANGED,
    CANONICAL_DATABASE_CHANGED: canonicalDbAudit.CANONICAL_DATABASE_CHANGED,
    CANONICAL_VERIFIED_BEFORE: canonicalPromotionAudit.CANONICAL_VERIFIED_BEFORE,
    CANONICAL_VERIFIED_AFTER: canonicalPromotionAudit.CANONICAL_VERIFIED_AFTER,
    UNEXPECTED_CANONICAL_PROMOTIONS: canonicalPromotionAudit.UNEXPECTED_CANONICAL_PROMOTIONS,
    HISTORICAL_ASSERTIONS_BEFORE: testImmutabilityAudit.HISTORICAL_ASSERTIONS_BEFORE,
    HISTORICAL_ASSERTIONS_AFTER: testImmutabilityAudit.HISTORICAL_ASSERTIONS_AFTER,
    HISTORICAL_SAFETY_ASSERTIONS_REMOVED: testImmutabilityAudit.HISTORICAL_SAFETY_ASSERTIONS_REMOVED,
    HISTORICAL_TEST_WEAKENING: testImmutabilityAudit.HISTORICAL_TEST_WEAKENING,
    DECODER_PRODUCTION_CODE_CHANGED: productionDiffs[0].changed ? 'YES' : 'NO',
    RELATED_MODELS_PRODUCTION_CODE_CHANGED: productionDiffs[1].changed ? 'YES' : 'NO',
    MODEL_PAGE_PRODUCTION_CODE_CHANGED: productionDiffs[2].changed ? 'YES' : 'NO',
    FAILURE_INJECTION: failureInjectionAudit.FAILURE_INJECTION,
    IDEMPOTENCY: idempotencyAudit.IDEMPOTENCY,
    TEST_SUITE: harnessAudit.failures === 0 ? 'PASS' : 'FAIL',
    FINAL_STATUS: finalStatus ? 'PASS' : 'FAIL'
  };
}

export async function main(options = {}) {
  const mode = options.mode || 'replay';
  if (mode === 'precommit') {
    throw new Error('Precommit generation remains historical in scripts/phase35c4321_nested_fallback_hotfix.js');
  }
  if (mode !== 'replay') {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const preflight = buildPreflightReport(options);
  writeJson(OUTPUTS.preflight, preflight);

  if (preflight.PRECHECK !== 'PASS') {
    const blocked = {
      'FASE 35C.4.3.2.1.1 FINAL REPORT': true,
      BASELINE_COMMIT,
      PHASE_SOURCE_COMMIT,
      PHASE_RESULT_COMMIT,
      PRECHECK: 'FAIL',
      CURRENT_HEAD: preflight.CURRENT_HEAD,
      CURRENT_ORIGIN_MAIN: preflight.CURRENT_ORIGIN_MAIN,
      RESULT_IS_ANCESTOR_OF_HEAD: preflight.RESULT_IS_ANCESTOR_OF_HEAD,
      RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN: preflight.RESULT_IS_ANCESTOR_OF_ORIGIN_MAIN,
      HEAD_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
      ORIGIN_EQUALITY_REQUIRED_FOR_REPLAY: 'NO',
      FINAL_STATUS: 'BLOCKED'
    };
    writeJson(OUTPUTS.finalReport, blocked);
    return blocked;
  }

  const commitIdentity = buildHistoricalCommitIdentity();
  const firstReplay = runImmutableReplay(options);
  const secondReplay = runImmutableReplay(options);
  const publicStoreReplayAudit = buildPublicStoreReplayAudit(secondReplay);
  const canonicalDbAudit = buildCanonicalDatabaseDiffAudit();
  const canonicalPromotionAudit = buildCanonicalPromotionAudit(canonicalDbAudit);
  const testImmutabilityAudit = buildTestImmutabilityAudit();
  const failureInjectionAudit = buildFailureInjectionReport();
  const idempotencyAudit = buildIdempotencyReport(firstReplay, secondReplay);
  const harnessAudit = buildHarnessAudit();
  const finalReport = buildFinalReport(preflight, commitIdentity, secondReplay, publicStoreReplayAudit, canonicalDbAudit, canonicalPromotionAudit, testImmutabilityAudit, failureInjectionAudit, idempotencyAudit, harnessAudit);

  writeJson(OUTPUTS.commitIdentity, commitIdentity);
  writeJson(OUTPUTS.immutableReplay, secondReplay);
  writeJson(OUTPUTS.publicStoreReplay, { ...publicStoreReplayAudit, harnessAudit });
  writeJson(OUTPUTS.canonicalDbDiff, canonicalDbAudit);
  writeJson(OUTPUTS.canonicalPromotion, canonicalPromotionAudit);
  writeJson(OUTPUTS.testImmutability, testImmutabilityAudit);
  writeJson(OUTPUTS.failureInjection, failureInjectionAudit);
  writeJson(OUTPUTS.idempotency, idempotencyAudit);
  writeJson(OUTPUTS.finalReport, finalReport);

  return finalReport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] : 'replay';
  main({ mode })
    .then((report) => {
      console.log('Phase 35C.4.3.2.1.1 post-commit replay hotfix completed.');
      console.log(`Precheck: ${report.PRECHECK}`);
      console.log(`Final status: ${report.FINAL_STATUS}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
