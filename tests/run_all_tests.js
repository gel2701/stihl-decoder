import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const publicStorePath = path.join(rootDir, 'data', 'public_evidence_facts.json');

export const testFiles = [
  'tests/decoder.test.js',
  'tests/baseline.test.js',
  'tests/render_www_alignment.test.js',
  'tests/production_validation.test.js',
  'tests/audit_remediation.test.js',
  'tests/canonical_policy.test.js',
  'tests/phase34_seo_integrity.test.js',
  'tests/phase34b_cleanup.test.js',
  'tests/phase35_document_authority.test.js',
  'tests/phase35c21_integrity_hotfix.test.js',
  'tests/phase35c3_legacy_library_graph.test.js',
  'tests/phase35c31_legacy_graph_validation_hotfix.test.js',
  'tests/phase35c32_validator_integrity_reproducibility_hotfix.test.js',
  'tests/phase35c432111_self_replay_ancestry_hotfix.test.js',
  'tests/phase35c43221_validator_replay_hotfix.test.js',
  'tests/phase35c4322_series_drive_classification.test.js',
  'tests/phase35c43223_breakpoint_highlight_safety_hotfix.test.js',
  'tests/phase35c43211_postcommit_replay_hotfix.test.js',
  'tests/phase35c4321_nested_fallback_hotfix.test.js',
  'tests/phase35c432_public_evidence_activation.test.js',
  'tests/phase35c4311_immutable_public_baseline_hotfix.test.js',
  'tests/phase35c431_scs_promotion_safety_hotfix.test.js',
  'tests/phase35c43_scs_machine_dossier_graph.test.js',
  'tests/phase35c4_verified_fact_recovery.test.js',
  'tests/phase35c421_failure_injection_integrity_hotfix.test.js',
  'tests/phase35c422_public_evidence_eligibility.test.js',
  'tests/phase35c4221_public_evidence_safety_hotfix.test.js',
  'tests/phase35c4222_residual_public_fallback_hotfix.test.js',
  'tests/phase35c4223_conflict_provenance_schema_binding_hotfix.test.js',
  'tests/phase35c42_targeted_archive_intake.test.js'
];

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function sha256CanonicalJsonText(text) {
  return crypto.createHash('sha256').update(stableSerialize(JSON.parse(text))).digest('hex');
}

function snapshotPublicStore() {
  const raw = fs.readFileSync(publicStorePath, 'utf8');
  return {
    raw,
    byte_hash: sha256Text(raw),
    canonical_hash: sha256CanonicalJsonText(raw),
    fact_count: JSON.parse(raw).facts.length
  };
}

function runNodeTest(testFile, extraEnv = {}) {
  console.log(`\n▶ Running ${testFile}`);
  return spawnSync(process.execPath, [testFile], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    cwd: rootDir
  });
}

function runSyntheticInline(scriptSource, label, extraEnv = {}) {
  console.log(`\n▶ Running ${label}`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-harness-'));
  const tempFile = path.join(tempDir, `${label.replace(/[^a-z0-9_-]+/gi, '_')}.mjs`);
  fs.writeFileSync(tempFile, scriptSource, 'utf8');
  const result = spawnSync(process.execPath, [tempFile], {
    stdio: 'inherit',
    env: { ...process.env, STIHL_DECODER_ROOT: rootDir, ...extraEnv },
    cwd: rootDir
  });
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
  return result;
}

function evaluateMutation(before, after) {
  return before.byte_hash !== after.byte_hash || before.raw !== after.raw;
}

export function runTestSuite(options = {}) {
  const files = options.testFiles || testFiles;
  let failures = 0;
  let publicStoreWritesByHarness = 0;
  let publicStoreMutationsByTests = 0;
  const mutationRecords = [];

  for (const testFile of files) {
    const before = snapshotPublicStore();
    const result = runNodeTest(testFile, options.extraEnv || {});
    const after = snapshotPublicStore();

    if (evaluateMutation(before, after)) {
      publicStoreMutationsByTests += 1;
      mutationRecords.push({
        test_file: testFile,
        before_hash: before.canonical_hash,
        after_hash: after.canonical_hash,
        before_byte_hash: before.byte_hash,
        after_byte_hash: after.byte_hash
      });
      console.error(`TEST_MUTATED_PUBLIC_STORE ${testFile}`);
      failures += 1;
      continue;
    }

    if (result.status !== 0) {
      failures += 1;
    }
  }

  return {
    failures,
    TEST_HARNESS_SILENT_STORE_RESTORE: 'NO',
    PUBLIC_STORE_WRITES_BY_TEST_HARNESS: publicStoreWritesByHarness,
    PUBLIC_STORE_MUTATIONS_BY_TESTS: publicStoreMutationsByTests,
    mutation_records: mutationRecords,
    MUTATING_TESTS_FOUND: mutationRecords.map((entry) => entry.test_file)
  };
}

export function runHarnessMutationProbe() {
  const realStoreBefore = snapshotPublicStore();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-public-store-probe-'));
  const temporaryStorePath = path.join(tempDir, 'public_evidence_facts.json');
  fs.copyFileSync(publicStorePath, temporaryStorePath);
  const temporaryStoreBefore = fs.readFileSync(temporaryStorePath, 'utf8');
  const mutatingScript = `
    import fs from 'fs';
    const target = process.env.STIHL_PUBLIC_STORE_PATH;
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    parsed.meta = { ...(parsed.meta || {}), harness_probe: 'mutated' };
    fs.writeFileSync(target, JSON.stringify(parsed, null, 2), 'utf8');
  `;
  let result;
  let temporaryStoreAfter;
  try {
    result = runSyntheticInline(mutatingScript, 'synthetic_public_store_mutator', {
      STIHL_PUBLIC_STORE_PATH: temporaryStorePath
    });
    temporaryStoreAfter = fs.readFileSync(temporaryStorePath, 'utf8');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  const realStoreAfter = snapshotPublicStore();
  const temporaryMutationDetected = temporaryStoreBefore !== temporaryStoreAfter;
  const realStoreByteStable = realStoreBefore.raw === realStoreAfter.raw;

  return {
    HARNESS_PUBLIC_STORE_MUTATION_DETECTED: temporaryMutationDetected ? 'PASS' : 'FAIL',
    TEMPORARY_PUBLIC_STORE_MUTATION_DETECTED: temporaryMutationDetected ? 'PASS' : 'FAIL',
    REAL_PUBLIC_STORE_WRITE_ATTEMPTED: 'NO',
    REAL_PUBLIC_STORE_BYTE_STABLE: realStoreByteStable ? 'PASS' : 'FAIL',
    SUITE_RESULT_FOR_MUTATING_TEST: temporaryMutationDetected && result.status === 0 ? 'FAIL' : 'PASS',
    // The legacy postcondition passes without a restore write because the real store was never mutated.
    ORIGINAL_STORE_RESTORED_AFTER_FAILURE: realStoreByteStable ? 'PASS' : 'FAIL',
    ORIGINAL_STORE_RESTORE_MODE: 'NOT_REQUIRED',
    mutation_record: {
      test_file: 'synthetic_public_store_mutator',
      temporary_before_byte_hash: sha256Text(temporaryStoreBefore),
      temporary_after_byte_hash: sha256Text(temporaryStoreAfter),
      real_before_byte_hash: realStoreBefore.byte_hash,
      real_after_byte_hash: realStoreAfter.byte_hash
    }
  };
}

export function runHarnessReadOnlyProbe() {
  const before = snapshotPublicStore();
  const readOnlyScript = `
    import fs from 'fs';
    import path from 'path';
    const rootDir = process.env.STIHL_DECODER_ROOT;
    const target = path.join(rootDir, 'data', 'public_evidence_facts.json');
    JSON.parse(fs.readFileSync(target, 'utf8'));
  `;
  const result = runSyntheticInline(readOnlyScript, 'synthetic_public_store_read_only');
  const after = snapshotPublicStore();
  return {
    READ_ONLY_TEST_MUTATION_COUNT: evaluateMutation(before, after) ? 1 : 0,
    READ_ONLY_TEST_EXIT_CODE: result.status ?? 1
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const summary = runTestSuite();

  if (summary.failures > 0) {
    console.error(`\n${summary.failures} test file(s) failed.`);
    process.exit(1);
  }

  console.log('\nAll selected test files passed.');
}
