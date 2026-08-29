import assert from 'assert';

import {
  buildKnownModelDictionary,
  classifyDuplicateRelation,
  classifySerialEvidence,
  classifySourceClass,
  dedupeFieldValues,
  evaluateAuthenticity,
  extractTechnicalFields,
  inferDocumentType,
  normalizeDocumentNumber
} from '../src/documentAuthority.js';

console.log('🧪 Starting Phase 35 document authority regression tests...');

const databaseFixture = {
  models: [
    { id: 'stihl_fs_100', slug: 'fs-100', model_name: 'FS 100', series_code: '4180' },
    { id: 'stihl_br_600', slug: 'br-600', model_name: 'BR 600', series_code: '4282' },
    { id: 'stihl_ms_460', slug: 'ms-460', model_name: 'MS 460', series_code: '1128' }
  ]
};

const knownModels = buildKnownModelDictionary(databaseFixture);

assert.strictEqual(normalizeDocumentNumber('0458 259 8621 D'), '0458-259-8621-D', 'Document numbers should normalize formatting only.');
assert.strictEqual(normalizeDocumentNumber('0458-259-8621-D'), '0458-259-8621-D');
assert.strictEqual(inferDocumentType('STIHL BR 600 Instruction Manual', ''), 'INSTRUCTION_MANUAL');
assert.strictEqual(inferDocumentType('BR 600 Spare Parts List 2022', ''), 'PARTS_LIST');

const officialMirror = evaluateAuthenticity({
  title: 'STIHL FS 100 Instruction Manual',
  url: 'https://www.scribd.com/document/123456789/STIHL-FS-100-Manual',
  author: 'mirror-user',
  pageCount: 88,
  combinedText: '© ANDREAS STIHL AG & Co. KG 0458 259 8621 D STIHL FS 100 FS 100 RX Operating Instructions',
  documentNumbers: ['0458-259-8621-D'],
  modelsMentioned: knownModels.filter((model) => model.slug === 'fs-100')
});
assert.strictEqual(officialMirror.authenticity_status, 'AUTHENTICATED_OFFICIAL', 'Authenticated original STIHL mirror should be accepted.');
assert.strictEqual(classifySourceClass('scribd.com', 'INSTRUCTION_MANUAL', officialMirror.authenticity_status), 'OFFICIAL_INSTRUCTION_MANUAL_MIRROR');

const plainScribd = evaluateAuthenticity({
  title: 'MS 260 Parts and Maintenance Guide',
  url: 'https://www.scribd.com/document/954444698/STIHL-CATALOG-MS-260',
  author: 'ScribdTranslations',
  pageCount: 167,
  combinedText: 'Translated guide without publisher identity or document number',
  documentNumbers: [],
  modelsMentioned: knownModels.filter((model) => model.slug === 'ms-260')
});
assert.notStrictEqual(plainScribd.authenticity_status, 'AUTHENTICATED_OFFICIAL', 'Plain Scribd presence must not auto-trust a document.');

const wrongDocument = evaluateAuthenticity({
  title: 'Stihl FS 130 Manual PDF',
  url: 'https://www.scribd.com/document/137679860/Stihl-FS-130-manual-pdf',
  author: 'mirror-user',
  pageCount: 42,
  combinedText: '© ANDREAS STIHL AG & Co. KG STIHL FS 130 FS 110 HT 130 spark plug',
  documentNumbers: [],
  modelsMentioned: []
});
assert.ok(['PROBABLE_OFFICIAL', 'AUTHENTICATED_OFFICIAL'].includes(wrongDocument.authenticity_status), 'Wrong document may still be official, but not for the wrong model.');

const fs100Doc = {
  document_id: 'doc-fs100',
  normalized_document_number: '0458-259-8621-D',
  revision: 'D',
  document_type: 'INSTRUCTION_MANUAL',
  market: 'US',
  source_class: 'OFFICIAL_INSTRUCTION_MANUAL_MIRROR',
  authenticity_status: 'AUTHENTICATED_OFFICIAL',
  authenticity_confidence: 'HIGH',
  models_mentioned: [
    { model_id: 'stihl_fs_100', slug: 'fs-100', model_name: 'FS 100', series_code: '4180' }
  ]
};

const fs100Fields = dedupeFieldValues(extractTechnicalFields({
  document: fs100Doc,
  pages: [
    { page_number: 4, page_text: 'FS 100 Spark Plug: Bosch USR7AC or NGK CMR6H Electrode gap: 0.5 mm' },
    { page_number: 5, page_text: 'General safety page without carb values' }
  ]
}));
assert.ok(fs100Fields.some((field) => field.field_name === 'spark_plug'), 'Fields present in the document may be verified.');
assert.ok(fs100Fields.some((field) => field.field_name === 'electrode_gap_mm'), 'Electrode gap should be extracted when present.');
assert.strictEqual(fs100Fields.some((field) => field.field_name === 'carb_h_setting'), false, 'Absent fields must remain UNVERIFIED.');

const br600RevA = {
  document_id: 'doc-br600-a',
  normalized_document_number: '0458-452-0121-A',
  revision: 'A',
  document_type: 'INSTRUCTION_MANUAL',
  market: 'US',
  source_class: 'OFFICIAL_INSTRUCTION_MANUAL_MIRROR',
  authenticity_status: 'AUTHENTICATED_OFFICIAL',
  authenticity_confidence: 'HIGH',
  models_mentioned: [
    { model_id: 'stihl_br_600', slug: 'br-600', model_name: 'BR 600', series_code: '4282' }
  ]
};
const br600RevJ = {
  ...br600RevA,
  document_id: 'doc-br600-j',
  normalized_document_number: '0458-452-0121-J',
  revision: 'J'
};

const br600Fields = dedupeFieldValues([
  ...extractTechnicalFields({
    document: br600RevA,
    pages: [{ page_number: 7, page_text: 'BR 600 Weight: 10.2 kg Air flow: 1150 m3/h Spark Plug: NGK CMR6H Electrode gap: 0.5 mm' }]
  }),
  ...extractTechnicalFields({
    document: br600RevJ,
    pages: [{ page_number: 9, page_text: 'BR 600 Weight: 10.3 kg Maximum air flow: 1200 m3/h Spark Plug: NGK CMR6H Electrode gap: 0.5 mm' }]
  })
]);
assert.ok(br600Fields.some((field) => field.field_name === 'weight_kg' && field.value === 10.2), 'BR600 revision A weight should be preserved.');
assert.ok(br600Fields.some((field) => field.field_name === 'weight_kg' && field.value === 10.3), 'BR600 revision J weight should be preserved.');
assert.strictEqual(classifyDuplicateRelation(
  { normalized_document_number: '0458-452-0121-A', revision: 'A', content_hash: 'x', page_count: 80, normalized_title: 'br600', models_key: 'br-600', market: 'US' },
  { normalized_document_number: '0458-452-0121-J', revision: 'J', content_hash: 'y', page_count: 80, normalized_title: 'br600', models_key: 'br-600', market: 'US' }
), 'SAME_DOCUMENT_DIFFERENT_REVISION', 'Different revisions must be retained, not merged away.');

assert.strictEqual(classifySerialEvidence('Replace ignition module before serial number 123456789 component update.'), 'TECHNICAL_CHANGE_CUTOFF', 'Technical change cutoffs must stay technical.');
assert.strictEqual(classifySerialEvidence('Recall applies to serial number range 123456789 to 123456999.'), 'RECALL_SCOPE_CUTOFF', 'Recall cutoffs must not become production ranges.');

const pseudoPartText = 'Use SERIES-CARB or 1123-CHAIN if no real part number exists';
assert.strictEqual(/\b\d{4}-(CHAIN|CARB|AIRFILTER)\b/.test(pseudoPartText), true, 'Regression fixture must contain a banned synthetic part code pattern.');

console.log('✅ Phase 35 document authority regression tests passed.');
