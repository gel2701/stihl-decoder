import assert from 'assert';
import fs from 'fs';

import { buildPublicEvidenceFields } from '../src/publicEvidence.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { main, SOURCE_COMMIT } from '../scripts/phase35c4223_conflict_provenance_schema_binding_hotfix.js';

console.log('Starting Phase 35C.4.2.2.3 conflict provenance/schema binding tests...');

const report = main();
assert.strictEqual(report.SOURCE_COMMIT, SOURCE_COMMIT);
assert.strictEqual(report.EXPLICIT_NULL_PROVENANCE, 'PRESERVED');
assert.strictEqual(report.HARDcoded_046_TS_DATA_FALLBACKS, 'REMOVED');
assert.strictEqual(report.SCHEMA_026_WITH_026_EVIDENCE, 'PASS');
assert.strictEqual(report.SCHEMA_MS261_WITH_026_EVIDENCE, 'PASS');
assert.strictEqual(report.MODEL_BINDING_GATE, 'PASS');
assert.strictEqual(report.FINAL_STATUS, 'PASS');

const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
const overlay = JSON.parse(fs.readFileSync(new URL('../data/public_evidence_facts.json', import.meta.url), 'utf8'));
const evidence = buildPublicEvidenceFields('026', { ...database, public_evidence: overlay });
const model = {
  id: '026', slug: '026', model_name: '026', category: 'Kettingzaag', category_slug: 'kettingzagen',
  displacement_cc: 48.7, power_kw: 2.4, provenance: { source_document_number: '0458-133-3021' }
};
const positive = buildStructuredData({
  pageType: 'model', model, publicEvidence: { modelKey: '026', fields: evidence }, url: 'https://www.stihldecoder.nl/kettingzagen/026/'
});
assert.ok(positive['@graph'].some((node) => node['@type'] === 'Product'));

const wrongBinding = buildStructuredData({
  pageType: 'model', model: { ...model, id: 'ms-261', slug: 'ms-261', model_name: 'MS 261' },
  publicEvidence: { modelKey: '026', fields: evidence }, url: 'https://www.stihldecoder.nl/kettingzagen/ms-261/'
});
assert.strictEqual(wrongBinding['@graph'].some((node) => node['@type'] === 'Product'), false);

console.log('Phase 35C.4.2.2.3 conflict provenance/schema binding tests passed.');
