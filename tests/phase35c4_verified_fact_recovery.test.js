import assert from 'assert';

import {
  classifyManualGoldReview,
  classifySourceIndependence,
  evaluateVerifiedCandidate,
  resolveScopeMutation,
  verifyPrecheckIdentity
} from '../scripts/phase35c4_verified_fact_recovery.js';

console.log('Starting Phase 35C.4 verified fact recovery tests...');

const precheckOk = verifyPrecheckIdentity({
  originMain: 'd8c23f18dd689d52507912e542f39618c5aafd80',
  candidateRecordCount: 33260,
  canonicalRecordStreamHash: '563f2056fd389b7131413cdf72854a0a028c867a9eb28a29891f82442b5fa19d',
  tsDataParserStatus: 'PASS',
  ts700Status: 'PASS'
});
assert.strictEqual(precheckOk.PRECHECK, 'PASS');

const precheckBad = verifyPrecheckIdentity({
  originMain: '05a02e2deadbeef',
  candidateRecordCount: 33260,
  canonicalRecordStreamHash: 'wrong',
  tsDataParserStatus: 'PASS',
  ts700Status: 'PASS'
});
assert.strictEqual(precheckBad.PRECHECK, 'FAIL');
assert.ok(precheckBad.failures.includes('WRONG_CANONICAL_STREAM_HASH'));

const samePdf = classifySourceIndependence(
  {
    source_label: 'batch3-manual',
    file_hash: 'abc',
    payload_hash: 'payload-1',
    publication_id: 'RA_573_00_02_02',
    canonical_document_id: 'canon-1'
  },
  {
    source_label: 'batch6-mirror',
    file_hash: 'abc',
    payload_hash: 'payload-1',
    publication_id: 'RA_573_00_02_02',
    canonical_document_id: 'canon-1'
  }
);
assert.strictEqual(samePdf.independent, false);

const tsVsManual = classifySourceIndependence(
  {
    source_label: 'TS_DATA:026:power_kw',
    file_hash: null,
    payload_hash: null,
    publication_id: 'ts://026_body.htm',
    canonical_document_id: 'ts://026_body.htm'
  },
  {
    source_label: 'batch3:2:power_kw',
    file_hash: 'manual-hash',
    payload_hash: null,
    publication_id: 'RA_127_00_02_01',
    canonical_document_id: 'canon-df1e741fa3588728'
  }
);
assert.strictEqual(tsVsManual.independent, true);

const scopePositive = resolveScopeMutation({
  candidate_id: 'scope-ms261',
  variant_id: 'ms-261',
  document_id: 'batch3:49',
  page: 6,
  pdf_page: 6,
  model_scope: 'UNRESOLVED',
  evidence_snippet: '2.1 Moteur MS 261 Cylindree : 50,2 cm3 Puissance suivant ISO 7293 : 2,8 kW'
});
assert.strictEqual(scopePositive.after, 'EXACT_MODEL');
assert.strictEqual(scopePositive.changed, true);

const scopeNegative = resolveScopeMutation({
  candidate_id: 'scope-ts420',
  variant_id: 'ts-420',
  document_id: 'batch3:29',
  page: 7,
  pdf_page: 7,
  model_scope: 'DOCUMENT_LEVEL_ONLY',
  evidence_snippet: 'TS 410 TS 420 Cylindree : 66,7 cm3 66,7 cm3 Puissance suivant ISO 19432 : 3,2 kW 3,2 kW'
});
assert.strictEqual(scopeNegative.changed, false);

const manualGoldPositive = classifyManualGoldReview({
  source_authenticated: true,
  page_locator_exists: true,
  effective_scope: 'EXACT_MODEL',
  field_context_valid: true,
  value_valid: true,
  unit_valid: true,
  measurement_definition_known: true,
  scope_evidence: ['EXPLICIT_PAGE_HEADING'],
  pdf_page: 6,
  printed_page: 5,
  section: '2.1 Moteur',
  table_id: null,
  row_label: null,
  column_header: null,
  field_name: 'power_kw',
  raw_value: '2,8',
  value: 2.8,
  unit: 'kW'
});
assert.strictEqual(manualGoldPositive.review_result, 'APPROVED');

const manualGoldNegative = classifyManualGoldReview({
  source_authenticated: false,
  page_locator_exists: false,
  effective_scope: 'UNRESOLVED',
  field_context_valid: true,
  value_valid: true,
  unit_valid: true,
  measurement_definition_known: true,
  scope_evidence: [],
  field_name: 'power_kw',
  raw_value: '2,8',
  value: 2.8,
  unit: 'kW'
});
assert.strictEqual(manualGoldNegative.review_result, 'REJECTED');
assert.strictEqual(manualGoldNegative.primary_block_reason, 'DOCUMENT_NOT_AUTHENTICATED');

const verifiedPositive = evaluateVerifiedCandidate({
  source_authenticated: true,
  page_locator_exists: true,
  field_context_valid: true,
  effective_scope: 'EXACT_MODEL',
  value_valid: true,
  unit_valid: true,
  measurement_definition_known: true,
  sanity_pass: true,
  independent_support_exists: true,
  precision_gate_passed: true,
  conflict_status: 'CLEAR'
});
assert.strictEqual(verifiedPositive.verified, true);

for (const [key, candidate] of Object.entries({
  noIndependent: {
    source_authenticated: true,
    page_locator_exists: true,
    field_context_valid: true,
    effective_scope: 'EXACT_MODEL',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    sanity_pass: true,
    independent_support_exists: false,
    precision_gate_passed: true,
    conflict_status: 'CLEAR'
  },
  noPage: {
    source_authenticated: true,
    page_locator_exists: false,
    field_context_valid: true,
    effective_scope: 'EXACT_MODEL',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: true,
    conflict_status: 'CLEAR'
  },
  unresolvedScope: {
    source_authenticated: true,
    page_locator_exists: true,
    field_context_valid: true,
    effective_scope: 'UNRESOLVED',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: true,
    conflict_status: 'CLEAR'
  },
  lowPrecision: {
    source_authenticated: true,
    page_locator_exists: true,
    field_context_valid: true,
    effective_scope: 'EXACT_MODEL',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: false,
    conflict_status: 'CLEAR'
  },
  unresolvedConflict: {
    source_authenticated: true,
    page_locator_exists: true,
    field_context_valid: true,
    effective_scope: 'EXACT_MODEL',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: true,
    conflict_status: 'BLOCKED'
  }
})) {
  const result = evaluateVerifiedCandidate(candidate);
  assert.strictEqual(result.verified, false, key);
}

console.log('Phase 35C.4 verified fact recovery tests passed.');
