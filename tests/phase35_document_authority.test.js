import assert from 'assert';

import {
  assessDocumentModelRelations,
  buildKnownModelDictionary,
  classifyCodeCandidate,
  classifyDuplicateRelation,
  classifyExtractionQuality,
  classifySerialEvidence,
  dedupeFieldValues,
  evaluateAuthenticity,
  extractPartNumbers,
  extractTechnicalFields,
  normalizeDocumentNumber,
  splitDocumentNumber
} from '../src/documentAuthority.js';

console.log('Starting Phase 35B document authority regression tests...');

const databaseFixture = {
  models: [
    { id: 'stihl_fs_100', slug: 'fs-100', model_name: 'FS 100', series_code: '4180' },
    { id: 'stihl_fs_100_rx', slug: 'fs-100-rx', model_name: 'FS 100 RX', series_code: '4180' },
    { id: 'stihl_br_600', slug: 'br-600', model_name: 'BR 600', series_code: '4282' },
    { id: 'stihl_ms_460', slug: 'ms-460', model_name: 'MS 460', series_code: '1128' },
    { id: 'stihl_ms_440', slug: 'ms-440', model_name: 'MS 440', series_code: '1128' },
    { id: 'stihl_044', slug: '044', model_name: '044', series_code: '1128' },
    { id: 'stihl_046', slug: '046', model_name: '046', series_code: '1128' },
    { id: 'stihl_ms_340', slug: 'ms-340', model_name: 'MS 340', series_code: '1125' },
    { id: 'stihl_ms_360', slug: 'ms-360', model_name: 'MS 360', series_code: '1125' },
    { id: 'stihl_034', slug: '034', model_name: '034', series_code: '1125' },
    { id: 'stihl_036', slug: '036', model_name: '036', series_code: '1125' }
  ]
};

const knownModels = buildKnownModelDictionary(databaseFixture);

assert.strictEqual(normalizeDocumentNumber('0458 259 8621 D'), '0458-259-8621-D');
assert.deepStrictEqual(splitDocumentNumber('0458-259-8621-D'), { base: '0458-259-8621', revision: 'D' });

const officialMirror = evaluateAuthenticity({
  title: 'STIHL FS 100 Instruction Manual',
  url: 'https://www.scribd.com/document/123456789/STIHL-FS-100-Manual',
  author: 'mirror-user',
  pageCount: 88,
  combinedText: 'ANDREAS STIHL AG & Co. KG 0458 259 8621 D STIHL FS 100 Operating Instructions',
  documentNumbers: ['0458-259-8621-D'],
  modelsMentioned: knownModels.filter((model) => model.slug === 'fs-100'),
  extractionQuality: classifyExtractionQuality({ title: 'STIHL FS 100 Instruction Manual', pageCount: 88, pageTexts: ['STIHL FS 100 operating instructions'] }),
  metadataSignals: { publisherMatch: true }
});
assert.strictEqual(officialMirror.authenticity_status, 'AUTHENTICATED_OFFICIAL');

const falsePositive = evaluateAuthenticity({
  title: 'STIHL service manual discussion',
  url: 'https://example.com/blog/stihl-service-manual-discussion',
  author: 'forum-user',
  pageCount: 2,
  combinedText: 'Forum discussion about a service manual and user experiences.',
  documentNumbers: [],
  modelsMentioned: [],
  extractionQuality: classifyExtractionQuality({ title: 'discussion', pageCount: 2, pageTexts: ['discussion only'] }),
  metadataSignals: {}
});
assert.notStrictEqual(falsePositive.authenticity_status, 'AUTHENTICATED_OFFICIAL');

const falseNegative = evaluateAuthenticity({
  title: 'STIHL FS 100 / FS 100 RX Instruction Manual',
  url: 'https://www.scribd.com/document/98765/0458-259-8621-D',
  author: 'mirror-user',
  pageCount: 92,
  combinedText: '0458 259 8621 D ANDREAS STIHL AG & Co. KG',
  documentNumbers: ['0458-259-8621-D'],
  modelsMentioned: knownModels.filter((model) => ['fs-100', 'fs-100-rx'].includes(model.slug)),
  extractionQuality: classifyExtractionQuality({ title: 'manual', pageCount: 92, pageTexts: ['0458 259 8621 D'] }),
  metadataSignals: { publisherMatch: true }
});
assert.notStrictEqual(falseNegative.authenticity_status, 'NON_OFFICIAL_CONFIRMED');

const mismatchRelations = assessDocumentModelRelations({
  title: 'Stihl FS 130 Manual PDF',
  metadataText: 'service document',
  pages: [
    { page_number: 1, page_text: 'FS 130 service information.' },
    { page_number: 2, page_text: 'BR 600 ignition module air gap. FS 90 FS 100 FS 110.' }
  ],
  knownModels
});
assert.ok(mismatchRelations.some((entry) => entry.model_name === 'FS 100' && ['BODY_ONLY_MATCH', 'MODEL_CONFLICT'].includes(entry.relation_status)));

assert.strictEqual(
  classifyDuplicateRelation(
    { normalized_document_number: '0458-452-0121-A', normalized_title: 'stihl br 600 instruction manual', models_key: 'br-600', page_count: 88, content_hash: 'a', market: 'US' },
    { normalized_document_number: '0458-452-0121-J', normalized_title: 'stihl br 600 instruction manual', models_key: 'br-600', page_count: 88, content_hash: 'b', market: 'US' }
  ),
  'SAME_DOCUMENT_DIFFERENT_REVISION'
);

assert.strictEqual(
  classifyDuplicateRelation(
    { normalized_document_number: '0458-111-1111-A', normalized_title: 'rocadeira stihl fs 220 manual', models_key: 'fs-220', page_count: 60, content_hash: 'x', market: 'BR' },
    { normalized_document_number: '0458-111-1111-A', normalized_title: 'stihl ms 210 230 250', models_key: 'ms-210|ms-230|ms-250', page_count: 60, content_hash: 'y', market: 'BR' }
  ),
  'MISMATCHED_METADATA'
);

const multiModelDocument = {
  document_id: 'doc-1125',
  normalized_document_number: '0458-000-1125-A',
  document_number_base: '0458-000-1125',
  revision: 'A',
  document_type: 'SERVICE_MANUAL',
  market: 'US',
  source_class: 'OFFICIAL_SERVICE_DOCUMENT_MIRROR',
  authenticity_status: 'AUTHENTICATED_OFFICIAL',
  authenticity_confidence: 'HIGH',
  extraction_quality: 'GOOD',
  document_title: 'STIHL 1125 Service Manual',
  description: null,
  model_relations: [
    { model_id: 'stihl_034', slug: '034', model_name: '034', relation_status: 'EXPLICIT_MULTI_MODEL_MATCH' },
    { model_id: 'stihl_036', slug: '036', model_name: '036', relation_status: 'EXPLICIT_MULTI_MODEL_MATCH' }
  ]
};

const multiModelFields = dedupeFieldValues(extractTechnicalFields({
  document: multiModelDocument,
  pages: [
    { page_number: 5, page_text: '034 036\nDisplacement 56.5 61.5\nPower 3.4 3.6' }
  ],
  knownModels
}));
assert.ok(multiModelFields.some((field) => field.model_id === 'stihl_034' && field.field_name === 'displacement_cc' && field.value === 56.5));
assert.ok(multiModelFields.some((field) => field.model_id === 'stihl_036' && field.field_name === 'displacement_cc' && field.value === 61.5));
assert.ok(multiModelFields.some((field) => field.model_id === 'stihl_034' && field.field_name === 'displacement_cc' && field.model_scope === 'MULTI_MODEL_EXPLICIT_COLUMN' && field.table_scope_confidence === 'HIGH' && field.verification_status === 'VERIFIED'));

const fs100Doc = {
  document_id: 'doc-fs100',
  normalized_document_number: '0458-259-8621-D',
  document_number_base: '0458-259-8621',
  revision: 'D',
  document_type: 'INSTRUCTION_MANUAL',
  market: 'US',
  source_class: 'OFFICIAL_INSTRUCTION_MANUAL_MIRROR',
  authenticity_status: 'AUTHENTICATED_OFFICIAL',
  authenticity_confidence: 'HIGH',
  extraction_quality: 'GOOD',
  document_title: 'STIHL FS 100 / FS 100 RX Instruction Manual',
  description: null,
  model_relations: [
    { model_id: 'stihl_fs_100', slug: 'fs-100', model_name: 'FS 100', relation_status: 'EXPLICIT_MULTI_MODEL_MATCH' },
    { model_id: 'stihl_fs_100_rx', slug: 'fs-100-rx', model_name: 'FS 100 RX', relation_status: 'EXPLICIT_MULTI_MODEL_MATCH' }
  ]
};

const fs100Fields = dedupeFieldValues(extractTechnicalFields({
  document: fs100Doc,
  pages: [
    { page_number: 4, page_text: 'FS 100 Spark Plug: Bosch USR7AC or NGK CMR6H Electrode gap: 0.5 mm' }
  ],
  knownModels
}));
assert.ok(fs100Fields.some((field) => field.model_id === 'stihl_fs_100' && field.field_name === 'spark_plug'));
assert.ok(fs100Fields.some((field) => field.model_id === 'stihl_fs_100' && field.field_name === 'electrode_gap_mm' && field.verification_status === 'VERIFIED'));
assert.ok(fs100Fields.some((field) => field.model_id === 'stihl_fs_100' && field.field_name === 'electrode_gap_mm' && field.model_scope === 'EXACT_MODEL' && field.block_reason === null));
assert.ok(fs100Fields.some((field) => field.model_id === 'stihl_fs_100' && field.field_name === 'spark_plug' && field.verification_status === 'APPROVED_ALTERNATIVES'));

const wrongSourceDoc = {
  ...fs100Doc,
  document_id: 'doc-fs130',
  document_title: 'Stihl FS 130 Manual PDF',
  model_relations: [
    { model_id: 'stihl_fs_100', slug: 'fs-100', model_name: 'FS 100', relation_status: 'MODEL_CONFLICT' }
  ]
};
const wrongSourceFields = dedupeFieldValues(extractTechnicalFields({
  document: wrongSourceDoc,
  pages: [
    { page_number: 9, page_text: 'BR 600 ignition module. FS 90 FS 100 FS 110.' }
  ],
  knownModels
}));
assert.strictEqual(wrongSourceFields.some((field) => field.verification_status === 'VERIFIED'), false);
assert.ok(wrongSourceFields.every((field) => field.block_reason === 'DOCUMENT_AUTHENTICITY_INSUFFICIENT' || field.block_reason === 'SOURCE_TYPE_UNSUITABLE' || field.verification_status === 'OFFICIAL_INDIRECT'));

const br600Doc = {
  document_id: 'doc-br600',
  normalized_document_number: '0458-452-0121-A',
  document_number_base: '0458-452-0121',
  revision: 'A',
  document_type: 'INSTRUCTION_MANUAL',
  market: 'US',
  source_class: 'OFFICIAL_INSTRUCTION_MANUAL_MIRROR',
  authenticity_status: 'AUTHENTICATED_OFFICIAL',
  authenticity_confidence: 'HIGH',
  extraction_quality: 'GOOD',
  document_title: 'STIHL BR 600 Instruction Manual',
  description: null,
  model_relations: [
    { model_id: 'stihl_br_600', slug: 'br-600', model_name: 'BR 600', relation_status: 'EXPLICIT_MODEL_MATCH' }
  ]
};
const br600Fields = dedupeFieldValues(extractTechnicalFields({
  document: br600Doc,
  pages: [
    { page_number: 7, page_text: 'BR 600 Weight: 10.2 kg Air flow: 1150 m3/h Spark Plug: NGK CMR6H Electrode gap: 0.5 mm' }
  ],
  knownModels
}));
assert.ok(br600Fields.some((field) => field.field_name === 'weight_kg' && field.value === 10.2));

const partContext = 'Illustrated parts list Pos. 1 Part no 1128 123 4567 Qty 1';
assert.deepStrictEqual(extractPartNumbers(partContext), ['1128-123-4567']);
assert.strictEqual(classifyCodeCandidate(partContext, '1128-123-4567'), 'PART_NUMBER');
assert.strictEqual(classifyCodeCandidate('0458 259 8621 D STIHL Instruction Manual', '0458-259-8621-D'), 'DOCUMENT_NUMBER');

const partFieldDoc = {
  ...br600Doc,
  document_type: 'PARTS_LIST',
  document_title: 'BR 600 Spare Parts List'
};
const partFields = dedupeFieldValues(extractTechnicalFields({
  document: partFieldDoc,
  pages: [
    { page_number: 2, page_text: partContext }
  ],
  knownModels
}));
assert.ok(partFields.some((field) => field.field_name === 'part_number' && field.verification_status === 'VERIFIED'));
assert.strictEqual(partFields.filter((field) => field.field_name === 'part_number' && field.verification_status === 'VERIFIED').length, 1);

assert.strictEqual(classifySerialEvidence('Replace ignition module before serial number 123456789 component update.'), 'TECHNICAL_CHANGE_CUTOFF');
assert.strictEqual(classifySerialEvidence('Recall applies to serial number range 123456789 to 123456999.'), 'RECALL_SCOPE_CUTOFF');

const family1125Relations = assessDocumentModelRelations({
  title: 'STIHL 1125 Service Manual 034 036 MS 340 MS 360',
  metadataText: '',
  pages: [{ page_number: 1, page_text: '034 036 MS 340 MS 360' }],
  knownModels
});
assert.ok(family1125Relations.some((entry) => entry.model_name === '034'));
assert.ok(family1125Relations.some((entry) => entry.model_name === 'MS 360'));

const family1128Relations = assessDocumentModelRelations({
  title: 'STIHL 1128 Service Manual 044 046 MS 440 MS 460',
  metadataText: '',
  pages: [{ page_number: 1, page_text: '044 046 MS 440 MS 460' }],
  knownModels
});
assert.ok(family1128Relations.some((entry) => entry.model_name === '044'));
assert.ok(family1128Relations.some((entry) => entry.model_name === 'MS 460'));

console.log('Phase 35B document authority regression tests passed.');
