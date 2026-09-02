import assert from 'assert';
import fs from 'fs';
import { execFileSync } from 'child_process';

import { decodeStihlCode } from '../src/decoder.js';
import { evaluatePublicEvidenceCandidate } from '../scripts/phase35c422_public_evidence_eligibility.js';

console.log('Starting Phase 35C.4.2.2 public evidence eligibility tests...');

const PHASE35C422_RESULT_COMMIT = 'ab2410e3f23d63483c1aadd4a7735328ec2b50e9';

function readGitJson(repoPath) {
  return JSON.parse(execFileSync('git', ['show', `${PHASE35C422_RESULT_COMMIT}:${repoPath}`], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  }));
}

const report = readGitJson('data/phase35c422_final_report.json');
assert.strictEqual(report.PRECHECK, 'PASS');

const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(new URL('../data/public_evidence_facts.json', import.meta.url), 'utf8'));

const eligible = evaluatePublicEvidenceCandidate({
  source_authenticated: true,
  pdf_page: 50,
  document_model_fit: 'EXACT_MODEL_DOCUMENT',
  resolved_scope: 'EXACT_MODEL',
  semantic_status: 'VALID',
  normalized_value: 44,
  normalized_unit: 'mm',
  field: 'bore_mm',
  verified: false,
  verification_gates: {}
});
assert.strictEqual(eligible.public_evidence_status, 'OFFICIAL_DOCUMENTED');
assert.strictEqual(eligible.display_eligible, true);

const conflict = evaluatePublicEvidenceCandidate({
  source_authenticated: true,
  pdf_page: 51,
  document_model_fit: 'EXACT_MODEL_DOCUMENT',
  resolved_scope: 'EXACT_MODEL',
  semantic_status: 'VALID',
  normalized_value: 40,
  normalized_unit: 'mm',
  field: 'stroke_mm',
  model: '046',
  verified: false,
  verification_gates: {}
}, [{
  model: '046',
  field: 'stroke_mm',
  candidate_value: 40,
  comparison_value: 36,
  conflict_reason: 'VALUE_DISAGREEMENT_SOURCE_INDEPENDENCE_UNRESOLVED'
}]);
assert.strictEqual(conflict.public_evidence_status, 'OFFICIAL_CONFLICTED');

const rejected = evaluatePublicEvidenceCandidate({
  source_authenticated: false,
  pdf_page: 1,
  document_model_fit: 'EXACT_MODEL_DOCUMENT',
  resolved_scope: 'EXACT_MODEL',
  semantic_status: 'VALID',
  normalized_value: 2.8,
  normalized_unit: 'kW',
  field: 'power_kw',
  verified: false,
  verification_gates: {}
});
assert.strictEqual(rejected.display_eligible, false);

const legacy026 = decodeStihlCode('026', database);
assert.strictEqual(legacy026.success, true);
assert.strictEqual(legacy026.modelResolution, 'VERIFIED_ALIAS');
assert.ok((legacy026.publicEvidenceFacts || []).length > 0);

const ts410 = decodeStihlCode('TS 410', database);
assert.strictEqual(ts410.success, true);
assert.strictEqual(ts410.modelResolution, 'VERIFIED_ALIAS');
assert.ok((ts410.publicEvidenceFacts || []).length >= 4);

const fuzzy = decodeStihlCode('MS 26', database);
assert.strictEqual(fuzzy.success, false);

const serial = decodeStihlCode('184592301', database);
assert.strictEqual(serial.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.notStrictEqual(serial.model, 'Onbekend Model');
assert.ok(String(serial.estimatedYears).includes('vanaf circa'));

const publicStore = database.public_evidence;
const windowsPathCount = JSON.stringify(publicStore).match(/[A-Z]:\\/g)?.length || 0;
assert.strictEqual(windowsPathCount, 0);

assert.strictEqual(report.TEST_SUITE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

console.log('Phase 35C.4.2.2 public evidence eligibility tests passed.');
