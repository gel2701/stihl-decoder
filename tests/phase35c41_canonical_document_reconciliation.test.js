import assert from 'assert';

import {
  assessCanonicalIdentity,
  reassessAuthenticity,
  assessCandidateDocumentModelCompatibility,
  resolveFieldLevelModelScope,
  validateFieldSemantics35c41
} from '../scripts/phase35c41_canonical_document_reconciliation.js';
import { buildKnownModelDictionary } from '../src/documentAuthority.js';
import fs from 'fs';

const canonicalJson = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
const knownModels = buildKnownModelDictionary(canonicalJson);

console.log('Starting Phase 35C.4.1 canonical reconciliation tests...');

const identityPositive = assessCanonicalIdentity(
  {
    canonical_document_id: 'canon-1',
    file_hash: 'file-a',
    payload_hash: null,
    publication_id: 'RA_024_026_01',
    page_count: 42,
    source_file_path: 'D:\\A\\RA_024_026_01.PDF',
    explicit_models: ['026']
  },
  {
    batch2_canonical_document_id: 'canon-1',
    batch2_file_hash: 'file-a',
    payload_hash: null,
    publication_id: 'RA_024_026_01',
    batch2_page_count: 42,
    batch6_path: 'D:\\A\\RA_024_026_01.PDF',
    explicit_models: ['026']
  }
);
assert.strictEqual(identityPositive.identity_status, 'EXACT_CANONICAL_MATCH');

const identityNegative = assessCanonicalIdentity(
  {
    canonical_document_id: 'canon-a',
    file_hash: 'file-a',
    payload_hash: null,
    publication_id: 'RA_024_026_01',
    page_count: 42,
    source_file_path: 'D:\\A\\RA_024_026_01.PDF',
    explicit_models: ['026']
  },
  {
    batch2_canonical_document_id: 'canon-b',
    batch2_file_hash: 'file-b',
    payload_hash: null,
    publication_id: 'RA_024_026_01',
    batch2_page_count: 10,
    batch6_path: 'D:\\B\\RA_024_026_01.PDF',
    explicit_models: ['026']
  }
);
assert.notStrictEqual(identityNegative.identity_status, 'EXACT_CANONICAL_MATCH');

const authPositive = reassessAuthenticity(
  { candidate_id: 'c1', document_id: 'batch3:2', authenticity_status: 'PROBABLE_OFFICIAL' },
  {
    identity_status: 'EXACT_CANONICAL_MATCH',
    identity_evidence: ['CANONICAL_DOCUMENT_MATCH'],
    current_authenticity_status: 'AUTHENTICATED_OFFICIAL'
  }
);
assert.strictEqual(authPositive.reassessed_authenticity_status, 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT');

const authNegative = reassessAuthenticity(
  { candidate_id: 'c2', document_id: 'batch3:2', authenticity_status: 'PROBABLE_OFFICIAL' },
  {
    identity_status: 'PUBLICATION_MATCH_WEAK',
    identity_evidence: ['PUBLICATION_ID_MATCH'],
    current_authenticity_status: 'AUTHENTICATED_OFFICIAL'
  }
);
assert.notStrictEqual(authNegative.reassessed_authenticity_status, 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT');

const modelMismatch = assessCandidateDocumentModelCompatibility(
  {
    variant_id: '026',
    evidence_snippet: 'MS 440 Bougie VA 208RA029'
  },
  {
    path_models: ['ms-440'],
    candidate_source_path: 'D:\\Downloads\\Manuel Service\\RA_175_00_02_02_STIHL MS 440.pdf'
  },
  knownModels
);
assert.strictEqual(modelMismatch, 'INCOMPATIBLE_MODEL_DOCUMENT');

const modelMulti = assessCandidateDocumentModelCompatibility(
  {
    variant_id: '026',
    evidence_snippet: '024 026 Bougie NGK BPMR 7 A'
  },
  {
    path_models: ['024', '026'],
    candidate_source_path: 'D:\\Downloads\\Manuel Service\\RA_127_00_02_01_STIHL 024, 026.pdf'
  },
  knownModels
);
assert.strictEqual(modelMulti, 'EXPLICIT_MULTI_MODEL_DOCUMENT');

const sparkBad = validateFieldSemantics35c41({
  field_name: 'spark_plug',
  raw_value: '208RA029',
  value: '208RA029',
  evidence_snippet: 'pour bougie VA 208RA029',
  unit: null
});
assert.strictEqual(sparkBad.field_semantic_status, 'INVALID');

const sparkGood = validateFieldSemantics35c41({
  field_name: 'spark_plug',
  raw_value: 'NGK BPMR 7 A',
  value: 'NGK BPMR 7 A',
  evidence_snippet: 'Bougie NGK BPMR 7 A',
  unit: null
});
assert.strictEqual(sparkGood.field_semantic_status, 'VALID');

const powerBadDoc = assessCandidateDocumentModelCompatibility(
  {
    variant_id: '036',
    evidence_snippet: '3.1 Moteur MS 780 MS 880 Puissance suivant ISO 7293 : 5,6 kW'
  },
  {
    path_models: ['ms-780', 'ms-880'],
    candidate_source_path: 'D:\\Downloads\\Manuel Service\\RA_550_00_02_02_STIHL MS 780, 880.pdf'
  },
  knownModels
);
assert.strictEqual(powerBadDoc, 'INCOMPATIBLE_MODEL_DOCUMENT');

const scopeMs261 = resolveFieldLevelModelScope({
  variant_id: 'ms-261',
  model_scope: 'UNRESOLVED',
  section: '2.1 Moteur MS 261',
  evidence_snippet: '2.1 Moteur MS 261 Cylindree : 50,2 cm3 Puissance suivant ISO 7293 : 2,8 kW'
}, knownModels);
assert.strictEqual(scopeMs261.scope_after, 'EXACT_MODEL');

const scopeTsMulti = resolveFieldLevelModelScope({
  variant_id: 'ts-420',
  model_scope: 'UNRESOLVED',
  section: '3.1 Moteur',
  evidence_snippet: 'TS 410 TS 420 Cylindree : 66,7 cm3 66,7 cm3 Puissance suivant ISO 19432 : 3,2 kW 3,2 kW'
}, knownModels);
assert.notStrictEqual(scopeTsMulti.scope_after, 'EXACT_MODEL');

console.log('Phase 35C.4.1 canonical reconciliation tests passed.');
