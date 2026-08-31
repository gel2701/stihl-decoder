import { spawnSync } from 'child_process';

const testFiles = [
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
  'tests/phase35c4_verified_fact_recovery.test.js',
  'tests/phase35c421_failure_injection_integrity_hotfix.test.js',
  'tests/phase35c422_public_evidence_eligibility.test.js',
  'tests/phase35c4221_public_evidence_safety_hotfix.test.js',
  'tests/phase35c4222_residual_public_fallback_hotfix.test.js',
  'tests/phase35c42_targeted_archive_intake.test.js'
];

let failures = 0;

for (const testFile of testFiles) {
  console.log(`\n▶ Running ${testFile}`);
  const result = spawnSync(process.execPath, [testFile], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  if (result.status !== 0) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} test file(s) failed.`);
  process.exit(1);
}

console.log('\nAll selected test files passed.');
