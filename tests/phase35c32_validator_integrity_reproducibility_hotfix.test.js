import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';

import {
  assertAuthenticityIntegrity,
  assertDedupIntegrity,
  assertGoldIntegrity,
  assertModelScopeIntegrity,
  classifyDedupEntry,
  loadCandidateArchiveStreamReport,
  resolvePythonRuntime
} from '../scripts/phase35c32_validator_integrity_reproducibility_hotfix.js';
import {
  assessAuthenticityFromPayload,
  buildGoldPrecisionAuditRow,
  buildGoldValidationRecord,
  resolveModelScopeMutation
} from '../scripts/phase35c31_legacy_graph_validation_hotfix.js';

console.log('Starting Phase 35C.3.2 validator integrity and reproducibility hotfix tests...');

const sameSource = classifyDedupEntry(
  { publication_id: 'TI_03_2000_30', publication_base: 'TI_03' },
  {
    priorRecord: { document_id: 'batch2:1', source_file_path: 'D:/same.pdf' },
    samePhysicalSource: true
  }
);
assert.strictEqual(sameSource.dedup_status, 'SAME_SOURCE_REFERENCE');

const exactFile = classifyDedupEntry(
  { publication_id: 'TI_03_2000_30', publication_base: 'TI_03' },
  {
    priorRecord: { document_id: 'batch3:1', file_hash: 'abc' },
    priorFileHashRecord: { document_id: 'batch3:1', file_hash: 'abc' },
    fileHashEqual: true,
    samePhysicalSource: false
  }
);
assert.strictEqual(exactFile.dedup_status, 'EXACT_FILE_DUPLICATE');

const exactContent = classifyDedupEntry(
  { publication_id: 'TI_03_2000_30', publication_base: 'TI_03' },
  {
    priorRecord: { document_id: 'batchx:1', payload_hash: 'same' },
    priorPayloadRecord: { document_id: 'batchx:1', payload_hash: 'same' },
    payloadHashEqual: true,
    pageCountEqual: true
  }
);
assert.strictEqual(exactContent.dedup_status, 'EXACT_CONTENT_DUPLICATE');

const newUnique = classifyDedupEntry(
  { publication_id: 'TI_99_2099_30', publication_base: 'TI_99' },
  {
    samePhysicalSource: false,
    fileHashEqual: false,
    payloadHashEqual: false,
    pageCountEqual: false,
    linkedModels: []
  }
);
assert.strictEqual(newUnique.dedup_status, 'NEW_UNIQUE');

const identityMatch = classifyDedupEntry(
  { publication_id: 'RA_573_00_02_02', publication_base: 'RA_573' },
  {
    priorPublicationRecord: { publication_id: 'RA_573_00_02_02', publication_base: 'RA_573' }
  }
);
assert.strictEqual(identityMatch.dedup_status, 'IDENTITY_MATCH_ONLY');

const revisionCandidate = classifyDedupEntry(
  { publication_id: 'RA_573_00_02_03', publication_base: 'RA_573' },
  {
    priorPublicationRecord: { publication_id: 'RA_573_00_02_02', publication_base: 'RA_573' }
  }
);
assert.strictEqual(revisionCandidate.dedup_status, 'SAME_PUBLICATION_POSSIBLE_REVISION');

const identityConflict = classifyDedupEntry(
  { publication_id: 'RA_376_00_02_04', publication_base: 'RA_376' },
  {
    identityConflict: true,
    priorPublicationRecord: { publication_id: 'RA_376_00_02_04', publication_base: 'RA_376' }
  }
);
assert.strictEqual(identityConflict.dedup_status, 'IDENTITY_CONFLICT');

assert.strictEqual(
  assertDedupIntegrity([
    {
      document_id: 'ok',
      dedup_status: 'SAME_SOURCE_REFERENCE',
      same_physical_source: true,
      file_hash_equal: false,
      payload_hash_equal: false,
      prior_stored_file_hash: null,
      prior_stored_payload_hash: null
    }
  ], 1),
  'PASS'
);
assert.strictEqual(
  assertDedupIntegrity([
    {
      document_id: 'bad',
      dedup_status: 'EXACT_FILE_DUPLICATE',
      same_physical_source: false,
      file_hash_equal: false,
      payload_hash_equal: false,
      prior_stored_file_hash: null,
      prior_stored_payload_hash: null
    }
  ], 1),
  'FAIL'
);

const authNegative = {
  ...assessAuthenticityFromPayload({
    file_path: 'D:/tmp/RA_123_00_00_00.pdf',
    title_line: 'RA_123_00_00_00',
    front_excerpt: 'filename only',
    back_excerpt: '',
    native_pages_with_text: 1,
    payload_characters: 30
  }),
  payload_corporate_snippet: null
};
assert.notStrictEqual(authNegative.auth_after, 'AUTHENTICATED_OFFICIAL');
assert.strictEqual(assertAuthenticityIntegrity(authNegative), 'PASS');

const authInjected = {
  auth_after: 'AUTHENTICATED_OFFICIAL',
  corporate_identity: false,
  structure_identity: false,
  payload_identity: false,
  payload_corporate_snippet: null
};
assert.strictEqual(assertAuthenticityIntegrity(authInjected), 'FAIL');

const goldNegative = {
  ...buildGoldValidationRecord(
    { normalized_model: 'ms-261', normalized_value: 3.0, field_name: 'power_kw', source_file: 'ts', unit: 'kW', record_id: 'g1' },
    [{ eligible_independent: false, value: 3.0 }],
    [{ eligible_independent: false, value: 3.0 }]
  ),
  supporting_candidate_eligible: false
};
assert.notStrictEqual(goldNegative.status, 'GOLD_VALIDATED_INDEPENDENT');

const goldPositive = {
  ...buildGoldValidationRecord(
    { normalized_model: 'ms-261', normalized_value: 3.0, field_name: 'power_kw', source_file: 'ts', unit: 'kW', record_id: 'g2' },
    [{ eligible_independent: true, value: 3.0 }],
    [{ eligible_independent: true, value: 3.0 }]
  ),
  supporting_candidate_eligible: true
};
assert.strictEqual(goldPositive.status, 'GOLD_VALIDATED_INDEPENDENT');
assert.strictEqual(assertGoldIntegrity(goldPositive), 'PASS');
assert.strictEqual(assertGoldIntegrity({ status: 'GOLD_VALIDATED_INDEPENDENT', supporting_candidate_count: 1, supporting_candidate_eligible: false }), 'FAIL');

assert.strictEqual(buildGoldPrecisionAuditRow('power_kw', 0, 0).context_precision, 'NOT_EVALUATED');
assert.strictEqual(buildGoldPrecisionAuditRow('power_kw', 3, 3).context_precision, 'LIMITED_SAMPLE');
assert.strictEqual(buildGoldPrecisionAuditRow('power_kw', 20, 20).context_precision, 'HIGH');
assert.notStrictEqual(buildGoldPrecisionAuditRow('power_kw', 20, 19).context_precision, 'HIGH');

const scopePositive = { ...resolveModelScopeMutation({ candidate_id: 'a', variant_id: 'ms-261', model_scope: 'DOCUMENT_LEVEL_ONLY' }, ['ms-261']), explicit_publication_model_count: 1 };
const scopeNegative = { ...resolveModelScopeMutation({ candidate_id: 'b', variant_id: 'ms-261', model_scope: 'DOCUMENT_LEVEL_ONLY' }, ['ms-261', 'ms-260']), explicit_publication_model_count: 2 };
assert.strictEqual(scopePositive.after, 'EXACT_MODEL');
assert.strictEqual(scopeNegative.changed, false);
assert.strictEqual(assertModelScopeIntegrity(scopePositive), 'PASS');
assert.strictEqual(assertModelScopeIntegrity({ before: 'DOCUMENT_LEVEL_ONLY', after: 'EXACT_MODEL', changed: true, explicit_publication_model_count: 2 }), 'FAIL');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase35c32-'));
const gzPath = path.join(tmpDir, 'candidates.jsonl.gz');
const lines = [
  JSON.stringify({ candidate_id: '1', value: 'a' }),
  JSON.stringify({ candidate_id: '2', value: 'b' })
].join('\n') + '\n';
fs.writeFileSync(gzPath, zlib.gzipSync(lines));
const archiveReport = await loadCandidateArchiveStreamReport(gzPath);
assert.strictEqual(archiveReport.record_count, 2);
assert.strictEqual(archiveReport.candidates.length, 2);
assert.ok(archiveReport.compressed_file_hash);
assert.ok(archiveReport.canonical_record_stream_hash);
const archiveReport2 = await loadCandidateArchiveStreamReport(gzPath);
assert.strictEqual(archiveReport.canonical_record_stream_hash, archiveReport2.canonical_record_stream_hash);

let missingError = null;
try {
  await loadCandidateArchiveStreamReport(path.join(tmpDir, 'missing.jsonl.gz'));
} catch (error) {
  missingError = error;
}
assert.ok(missingError);
assert.match(missingError.message, /Required reproducible candidate artifact is missing/);

const runtime = resolvePythonRuntime();
assert.ok(runtime.executable);
assert.strictEqual(runtime.payloadEngine, 'pypdf');

console.log('Phase 35C.3.2 validator integrity and reproducibility hotfix tests passed.');
