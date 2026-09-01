import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { runHarnessMutationProbe, runHarnessReadOnlyProbe, runTestSuite, testFiles as harnessTestFiles } from '../tests/run_all_tests.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const BASELINE_COMMIT = '64f38d59595858c1092d951c391f98f86720d0c9';
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

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    ...options
  }).trim();
}

function gitFileExists(commit, repoPath) {
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

function gitCommitExists(commit) {
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

function readGitText(commit, repoPath) {
  return git(['show', `${commit}:${repoPath}`]);
}

function readGitJson(commit, repoPath) {
  return JSON.parse(readGitText(commit, repoPath));
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeForHash(value) {
  if (Array.isArray(value)) return value.map(sanitizeForHash);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'generated_at') continue;
    out[key] = sanitizeForHash(nested);
  }
  return out;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
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

function buildPreflightReport() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  const failures = [];

  if (head !== BASELINE_COMMIT) failures.push('HEAD_NOT_BASELINE_COMMIT');
  if (originMain !== BASELINE_COMMIT) failures.push('ORIGIN_MAIN_NOT_BASELINE_COMMIT');
  if (mergeBase !== BASELINE_COMMIT) failures.push('MERGE_BASE_NOT_BASELINE_COMMIT');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_COMMIT,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    HEAD: head,
    ORIGIN_MAIN: originMain,
    MERGE_BASE: mergeBase,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL',
    failures
  };
}

function buildHistoricalCommitIdentity() {
  const sourceFound = gitCommitExists(PHASE_SOURCE_COMMIT);
  const resultFound = gitCommitExists(PHASE_RESULT_COMMIT);
  let relationValid = false;

  if (sourceFound && resultFound) {
    const mergeBase = git(['merge-base', PHASE_SOURCE_COMMIT, PHASE_RESULT_COMMIT]);
    relationValid = mergeBase === PHASE_SOURCE_COMMIT && PHASE_SOURCE_COMMIT !== PHASE_RESULT_COMMIT;
  }

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    PHASE_SOURCE_COMMIT,
    PHASE_RESULT_COMMIT,
    REPLAY_SOURCE_COMMIT_FOUND: sourceFound ? 'PASS' : 'FAIL',
    REPLAY_RESULT_COMMIT_FOUND: resultFound ? 'PASS' : 'FAIL',
    REPLAY_COMMIT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL'
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

function runImmutableReplay(options = {}) {
  const sourceCommit = options.sourceCommit || PHASE_SOURCE_COMMIT;
  const resultCommit = options.resultCommit || PHASE_RESULT_COMMIT;
  const missingArtifactPaths = new Set(options.missingArtifactPaths || []);
  const sourceFound = gitCommitExists(sourceCommit);
  const resultFound = gitCommitExists(resultCommit);

  if (!sourceFound || !resultFound) {
    return {
      sourceCommit,
      resultCommit,
      REPLAY_SOURCE_COMMIT_FOUND: sourceFound ? 'PASS' : 'FAIL',
      REPLAY_RESULT_COMMIT_FOUND: resultFound ? 'PASS' : 'FAIL',
      REPLAY_COMMIT_RELATION_VALID: 'FAIL',
      REPLAY_HISTORICAL_ARTIFACTS_VALID: 'FAIL',
      REPLAY_RUNTIME_TRANSITION_VALID: 'FAIL',
      POST_COMMIT_REPLAY: 'FAIL',
      failure_reasons: ['MISSING_COMMIT']
    };
  }

  const relationValid = git(['merge-base', sourceCommit, resultCommit]) === sourceCommit && sourceCommit !== resultCommit;
  const failureReasons = [];
  if (!relationValid) {
    failureReasons.push('INVALID_HISTORICAL_TRANSITION');
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
      REPLAY_SOURCE_COMMIT_FOUND: 'PASS',
      REPLAY_RESULT_COMMIT_FOUND: 'PASS',
      REPLAY_COMMIT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL',
      REPLAY_HISTORICAL_ARTIFACTS_VALID: 'FAIL',
      REPLAY_RUNTIME_TRANSITION_VALID: 'FAIL',
      POST_COMMIT_REPLAY: 'FAIL',
      failure_reasons: ['MISSING_PUBLIC_STORE']
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

  return {
    sourceCommit,
    resultCommit,
    REPLAY_SOURCE_COMMIT_FOUND: 'PASS',
    REPLAY_RESULT_COMMIT_FOUND: 'PASS',
    REPLAY_COMMIT_RELATION_VALID: relationValid ? 'PASS' : 'FAIL',
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: sourceStoreHash,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: resultStoreHash,
    REPLAY_SOURCE_STORE_HASH_VALID: sourceStoreHashValid ? 'PASS' : 'FAIL',
    REPLAY_RESULT_STORE_HASH_VALID: resultStoreHashValid ? 'PASS' : 'FAIL',
    REPLAY_HISTORICAL_ARTIFACTS_VALID: historicalArtifactsValid ? 'PASS' : 'FAIL',
    artifact_records: artifactRecords,
    missing_artifacts: missingArtifacts,
    ...transition,
    POST_COMMIT_REPLAY: failureReasons.length === 0 ? 'PASS' : 'FAIL',
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

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    ...assertionStats,
    HISTORICAL_TEST_WEAKENING: assertionStats.HISTORICAL_SAFETY_ASSERTIONS_REMOVED,
    REPLAY_READ_ONLY_PUBLIC_STORE_WRITE_REMOVED: mutatingWritePresentBefore && !mutatingWritePresentAfter ? 'PASS' : 'FAIL',
    MUTATING_PUBLIC_STORE_WRITE_PRESENT_BEFORE: mutatingWritePresentBefore ? 'YES' : 'NO',
    MUTATING_PUBLIC_STORE_WRITE_PRESENT_AFTER: mutatingWritePresentAfter ? 'YES' : 'NO',
    TEST_HARNESS_SILENT_STORE_RESTORE: silentRestorePresent ? 'YES' : 'NO',
    HARNESS_RESTORE_WRITE_CALL_SITES: harnessWriteCount
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

function buildFailureInjectionReport(baseReplayAudit) {
  const artifactMutationReplay = withTemporaryFileMutation(
    'data/phase35c4321_final_report.json',
    (text) => `${text}\n`,
    () => runImmutableReplay()
  );

  const publicStoreBeforeText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const publicStoreBeforeDiff = git(['diff', '--', 'data/public_evidence_facts.json']);
  const publicStoreBeforeHash = sha256Text(publicStoreBeforeText);
  const dirtyPublicStoreReplay = withTemporaryFileMutation(
    'data/public_evidence_facts.json',
    (text) => {
      const parsed = JSON.parse(text);
      parsed.meta = { ...(parsed.meta || {}), replay_probe: 'dirty' };
      return JSON.stringify(parsed, null, 2);
    },
    () => ({
      replay: runImmutableReplay(),
      duringDiff: git(['diff', '--', 'data/public_evidence_facts.json'])
    })
  );
  const publicStoreAfterText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const publicStoreAfterDiff = git(['diff', '--', 'data/public_evidence_facts.json']);
  const publicStoreAfterHash = sha256Text(publicStoreAfterText);

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
      check: 'DIRTY_WORKTREE_IGNORED',
      detected: artifactMutationReplay.POST_COMMIT_REPLAY === 'PASS',
      details: artifactMutationReplay
    },
    {
      check: 'DIRTY_PUBLIC_STORE_IGNORED',
      detected: dirtyPublicStoreReplay.replay.POST_COMMIT_REPLAY === 'PASS'
        && dirtyPublicStoreReplay.replay.RESULT_PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256,
      details: dirtyPublicStoreReplay.replay
    },
    {
      check: 'HISTORICAL_RESULT_COMMIT_MISMATCH_DETECTED',
      detected: wrongResultReplay.POST_COMMIT_REPLAY === 'FAIL',
      details: wrongResultReplay
    },
    {
      check: 'INVALID_HISTORICAL_TRANSITION_DETECTED',
      detected: swappedReplay.POST_COMMIT_REPLAY === 'FAIL',
      details: swappedReplay
    },
    {
      check: 'MISSING_IMMUTABLE_ARTIFACT_DETECTED',
      detected: missingArtifactReplay.POST_COMMIT_REPLAY === 'FAIL' && missingArtifactReplay.missing_artifacts.includes('data/phase35c4321_final_report.json'),
      details: missingArtifactReplay
    },
    {
      check: 'PUBLIC_STORE_HASH_MISMATCH_DETECTED',
      detected: mutatedStoreReplay.POST_COMMIT_REPLAY === 'FAIL'
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
    }
  ];

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    DIRTY_WORKTREE_REPLAY_CONTAMINATION: artifactMutationReplay.POST_COMMIT_REPLAY === 'PASS' ? 0 : 1,
    DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT: dirtyPublicStoreReplay.replay.RESULT_PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256 ? 'NO' : 'YES',
    REPLAY_MUTATED_PUBLIC_STORE: publicStoreBeforeHash === publicStoreAfterHash && publicStoreBeforeDiff === publicStoreAfterDiff ? 'NO' : 'YES',
    records,
    FAILURE_INJECTION: records.every((row) => row.detected === true) ? 'PASS' : 'FAIL'
  };
}

function buildHarnessAudit() {
  const auditedTests = harnessTestFiles.filter((testFile) => testFile !== 'tests/phase35c43211_postcommit_replay_hotfix.test.js');
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
    changed: git(['diff', '--name-only', BASELINE_COMMIT, '--', repoPath]) !== ''
  }));

  const finalStatus = preflight.PRECHECK === 'PASS'
    && commitIdentity.REPLAY_SOURCE_COMMIT_FOUND === 'PASS'
    && commitIdentity.REPLAY_RESULT_COMMIT_FOUND === 'PASS'
    && commitIdentity.REPLAY_COMMIT_RELATION_VALID === 'PASS'
    && replayAudit.POST_COMMIT_REPLAY === 'PASS'
    && publicStoreReplayAudit.IMMUTABLE_PUBLIC_STORE_REPLAY === 'PASS'
    && failureInjectionAudit.DIRTY_WORKTREE_REPLAY_CONTAMINATION === 0
    && failureInjectionAudit.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT === 'NO'
    && failureInjectionAudit.REPLAY_MUTATED_PUBLIC_STORE === 'NO'
    && testImmutabilityAudit.TEST_HARNESS_SILENT_STORE_RESTORE === 'NO'
    && harnessAudit.PUBLIC_STORE_WRITES_BY_TEST_HARNESS === 0
    && harnessAudit.PUBLIC_STORE_MUTATIONS_BY_TESTS === 0
    && harnessAudit.HARNESS_PUBLIC_STORE_MUTATION_DETECTED === 'PASS'
    && harnessAudit.ORIGINAL_STORE_RESTORED_AFTER_FAILURE === 'PASS'
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
    REPLAY_SOURCE_COMMIT_FOUND: commitIdentity.REPLAY_SOURCE_COMMIT_FOUND,
    REPLAY_RESULT_COMMIT_FOUND: commitIdentity.REPLAY_RESULT_COMMIT_FOUND,
    REPLAY_COMMIT_RELATION_VALID: commitIdentity.REPLAY_COMMIT_RELATION_VALID,
    POST_COMMIT_REPLAY: replayAudit.POST_COMMIT_REPLAY,
    SOURCE_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.SOURCE_PUBLIC_STORE_CANONICAL_SHA256,
    RESULT_PUBLIC_STORE_CANONICAL_SHA256: replayAudit.RESULT_PUBLIC_STORE_CANONICAL_SHA256,
    CURRENT_PUBLIC_STORE_CANONICAL_SHA256: currentPublicStoreHash,
    PUBLIC_FACT_COUNT: publicStoreReplayAudit.PUBLIC_FACT_COUNT,
    IMMUTABLE_PUBLIC_STORE_REPLAY: publicStoreReplayAudit.IMMUTABLE_PUBLIC_STORE_REPLAY,
    DIRTY_WORKTREE_REPLAY_CONTAMINATION: failureInjectionAudit.DIRTY_WORKTREE_REPLAY_CONTAMINATION,
    DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT: failureInjectionAudit.DIRTY_PUBLIC_STORE_USED_AS_REPLAY_INPUT,
    REPLAY_MUTATED_PUBLIC_STORE: failureInjectionAudit.REPLAY_MUTATED_PUBLIC_STORE,
    TEST_HARNESS_SILENT_STORE_RESTORE: testImmutabilityAudit.TEST_HARNESS_SILENT_STORE_RESTORE,
    PUBLIC_STORE_WRITES_BY_TEST_HARNESS: harnessAudit.PUBLIC_STORE_WRITES_BY_TEST_HARNESS,
    PUBLIC_STORE_MUTATIONS_BY_TESTS: harnessAudit.PUBLIC_STORE_MUTATIONS_BY_TESTS,
    HARNESS_PUBLIC_STORE_MUTATION_DETECTED: harnessAudit.HARNESS_PUBLIC_STORE_MUTATION_DETECTED,
    ORIGINAL_STORE_RESTORED_AFTER_FAILURE: harnessAudit.ORIGINAL_STORE_RESTORED_AFTER_FAILURE,
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

  const preflight = buildPreflightReport();
  writeJson(OUTPUTS.preflight, preflight);

  if (preflight.PRECHECK !== 'PASS') {
    const blocked = {
      'FASE 35C.4.3.2.1.1 FINAL REPORT': true,
      BASELINE_COMMIT,
      PHASE_SOURCE_COMMIT,
      PHASE_RESULT_COMMIT,
      PRECHECK: 'FAIL',
      FINAL_STATUS: 'BLOCKED'
    };
    writeJson(OUTPUTS.finalReport, blocked);
    return blocked;
  }

  const commitIdentity = buildHistoricalCommitIdentity();
  const firstReplay = runImmutableReplay();
  const secondReplay = runImmutableReplay();
  const publicStoreReplayAudit = buildPublicStoreReplayAudit(secondReplay);
  const canonicalDbAudit = buildCanonicalDatabaseDiffAudit();
  const canonicalPromotionAudit = buildCanonicalPromotionAudit(canonicalDbAudit);
  const testImmutabilityAudit = buildTestImmutabilityAudit();
  const failureInjectionAudit = buildFailureInjectionReport(secondReplay);
  const idempotencyAudit = buildIdempotencyReport(firstReplay, secondReplay);
  const harnessAudit = buildHarnessAudit();
  const finalReport = buildFinalReport(preflight, commitIdentity, secondReplay, publicStoreReplayAudit, canonicalDbAudit, canonicalPromotionAudit, testImmutabilityAudit, failureInjectionAudit, idempotencyAudit, harnessAudit);

  writeJson(OUTPUTS.commitIdentity, commitIdentity);
  writeJson(OUTPUTS.immutableReplay, secondReplay);
  writeJson(OUTPUTS.publicStoreReplay, publicStoreReplayAudit);
  writeJson(OUTPUTS.canonicalDbDiff, canonicalDbAudit);
  writeJson(OUTPUTS.canonicalPromotion, canonicalPromotionAudit);
  writeJson(OUTPUTS.testImmutability, testImmutabilityAudit);
  writeJson(OUTPUTS.failureInjection, failureInjectionAudit);
  writeJson(OUTPUTS.idempotency, idempotencyAudit);
  writeJson(OUTPUTS.publicStoreReplay, { ...publicStoreReplayAudit, harnessAudit });
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
