import assert from 'assert';

import {
  applyVerificationPrecisionGate,
  buildCanonicalRegistry,
  buildPrecisionAudit,
  buildPublicationIdentity
} from '../scripts/phase35c21_integrity_hotfix.js';

console.log('Starting Phase 35C.2.1 integrity hotfix tests...');

const zeroSampleAudit = buildPrecisionAudit([]);
const zeroSamplePower = zeroSampleAudit.fields.find((field) => field.field === 'power_kw');
assert.strictEqual(zeroSamplePower.context_precision, 'NOT_EVALUATED');
assert.strictEqual(zeroSamplePower.auto_verify_eligible, false);

const limitedSampleFields = Array.from({ length: 3 }, (_, index) => ({
  candidate_id: `limited-${index}`,
  field_name: 'power_kw',
  value: '2.5',
  raw_value: '2.5',
  unit: 'kW',
  raw_unit: 'kW',
  document_id: `doc-${index}`,
  model_id: 'model-1',
  variant_id: 'model-1',
  pdf_page: index + 1,
  page: index + 1,
  model_scope: 'EXACT_MODEL',
  measurement_definition: 'dry_weight',
  evidence_snippet: 'Power output: 2.5 kW'
}));
const limitedSampleAudit = buildPrecisionAudit(limitedSampleFields);
const limitedSamplePower = limitedSampleAudit.fields.find((field) => field.field === 'power_kw');
assert.strictEqual(limitedSamplePower.context_precision, 'NOT_EVALUATED');
assert.strictEqual(limitedSamplePower.auto_verify_eligible, false);

const fullSampleFields = Array.from({ length: 20 }, (_, index) => ({
  ...limitedSampleFields[0],
  candidate_id: `full-${index}`,
  document_id: `full-doc-${index}`,
  pdf_page: index + 1,
  page: index + 1
}));
const fullSampleAudit = buildPrecisionAudit(fullSampleFields);
const fullSamplePower = fullSampleAudit.fields.find((field) => field.field === 'power_kw');
assert.strictEqual(fullSamplePower.context_precision, 'HIGH');
assert.strictEqual(fullSamplePower.auto_verify_eligible, true);

const demoted = applyVerificationPrecisionGate([{
  ...limitedSampleFields[0],
  verification_status: 'VERIFIED',
  block_reason: null
}], zeroSampleAudit)[0];
assert.strictEqual(demoted.verification_status, 'UNVERIFIED');
assert.strictEqual(demoted.block_reason, 'EXTRACTOR_PRECISION_TOO_LOW');

const publicationIdentity = buildPublicationIdentity(
  { title: 'STIHL Instruction Manual', file_path: 'D:\\test\\manual.pdf' },
  [
    {
      page_number: 1,
      pdf_page_number: 1,
      section_heading: 'Cover',
      lines: [
        { line_number: 1, line_text: 'STIHL Operating Instructions' },
        { line_number: 2, line_text: '0458-259-8621-D' }
      ],
      content_layer: 'DOCUMENT_PAYLOAD'
    },
    {
      page_number: 3,
      pdf_page_number: 3,
      section_heading: 'Footer',
      lines: [
        { line_number: 1, line_text: 'Technical data' },
        { line_number: 10, line_text: '0458-259-8621-D' },
        { line_number: 11, line_text: 'Printed in USA' }
      ],
      content_layer: 'DOCUMENT_PAYLOAD'
    },
    {
      page_number: 4,
      pdf_page_number: 4,
      section_heading: 'Footer',
      lines: [
        { line_number: 1, line_text: 'Specifications' },
        { line_number: 10, line_text: '0458-259-8621-D' },
        { line_number: 11, line_text: 'Printed in USA' }
      ],
      content_layer: 'DOCUMENT_PAYLOAD'
    },
    {
      page_number: 5,
      pdf_page_number: 5,
      section_heading: 'Footer',
      lines: [
        { line_number: 1, line_text: 'Maintenance' },
        { line_number: 10, line_text: '0458-259-8621-D' },
        { line_number: 11, line_text: 'Printed in USA' }
      ],
      content_layer: 'DOCUMENT_PAYLOAD'
    }
  ],
  'INSTRUCTION_MANUAL'
);
assert.strictEqual(publicationIdentity.selected_publication_number, '0458-259-8621-D');
assert.strictEqual(publicationIdentity.publication_confidence, 'CONFIRMED');

const collisionRegistry = buildCanonicalRegistry([
  {
    document_id: 'left',
    source_batch: 'BATCH3_MANUEL_SERVICE',
    source_database: 'test.db',
    source_document_id: '1',
    source_url: null,
    source_file_path: 'D:\\test\\STIHL FS 350.pdf',
    document_title: null,
    document_type: 'SERVICE_MANUAL',
    page_count: 40,
    file_hash: 'hash-a',
    content_hash: 'content-a',
    publication_identity: { selected_publication_number: '0781-120-1109', publication_confidence: 'CONFIRMED' },
    document_number: '0781-120-1109',
    document_number_base: '0781-120-1109',
    revision: null,
    authenticity_status: 'AUTHENTICATED_OFFICIAL',
    payload_completeness_score: 2,
    extraction_quality_score: 3
  },
  {
    document_id: 'right',
    source_batch: 'BATCH3_MANUEL_SERVICE',
    source_database: 'test.db',
    source_document_id: '2',
    source_url: null,
    source_file_path: 'D:\\test\\STIHL MSE 170 C.pdf',
    document_title: null,
    document_type: 'SERVICE_MANUAL',
    page_count: 55,
    file_hash: 'hash-b',
    content_hash: 'content-b',
    publication_identity: { selected_publication_number: '0781-120-1109', publication_confidence: 'CONFIRMED' },
    document_number: '0781-120-1109',
    document_number_base: '0781-120-1109',
    revision: null,
    authenticity_status: 'AUTHENTICATED_OFFICIAL',
    payload_completeness_score: 2,
    extraction_quality_score: 3
  }
]);
assert.strictEqual(collisionRegistry.collision_audit.length, 1);
assert.strictEqual(collisionRegistry.canonical_documents.length, 2);

console.log('Phase 35C.2.1 integrity hotfix tests passed.');
