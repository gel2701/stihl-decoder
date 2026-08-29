import assert from 'assert';
import fs from 'fs';
import crypto from 'crypto';

import {
  assessAuthenticityFromPayload,
  buildGoldPrecisionAuditRow,
  buildGoldValidationRecord,
  classifyDocumentDedup,
  parseTsDataHtmlStrict,
  resolveModelScopeMutation
} from '../scripts/phase35c31_legacy_graph_validation_hotfix.js';

console.log('Starting Phase 35C.3.1 validation integrity hotfix tests...');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const knownModels = [
  { model_id: 'm1', slug: 'fs-350', model_name: 'FS 350', series_code: '4134', patterns: ['FS[-\\s]*350'], normalized_aliases: ['FS350'] },
  { model_id: 'm2', slug: 'ts-700', model_name: 'TS 700', series_code: '4224', patterns: ['TS[-\\s]*700'], normalized_aliases: ['TS700'] },
  { model_id: 'm3', slug: 'ts-800', model_name: 'TS 800', series_code: '4224', patterns: ['TS[-\\s]*800'], normalized_aliases: ['TS800'] }
];

const strictTsHtml = `
<td class="Ue2_o">Testing and Setting Data</td>
<td class="Ue2_o">Brushcutter: FS 350</td>
<table>
  <tr><td>1</td><td></td><td>Spark plug</td><td></td><td>NGK BPMR 7A</td></tr>
  <tr><td>2</td><td></td><td>Carburetor setting H</td><td></td><td>1 1/4</td></tr>
  <tr><td>3</td><td></td><td>Carburetor setting L</td><td></td><td>0.75</td></tr>
  <tr><td>4</td><td></td><td>Electrode gap</td><td>mm</td><td>0.5</td></tr>
</table>`;
const strictRecords = parseTsDataHtmlStrict('D:/tmp/FS350_body.htm', strictTsHtml, knownModels);
assert.strictEqual(strictRecords.length, 4);
assert.ok(strictRecords.every((record) => Array.isArray(record.raw_cells)));
assert.strictEqual(strictRecords.find((record) => record.field_name === 'spark_plug').normalized_value, 'NGK BPMR 7A');
assert.strictEqual(strictRecords.find((record) => record.field_name === 'carb_h_setting').normalized_value, 1.25);

const garbageTsHtml = `
<td class="Ue2_o">Testing and Setting Data</td>
<td class="Ue2_o">Cut-off machine: TS 700, TS 800</td>
<table>
  <tr><td>1</td><td></td><td>Spark plug</td><td></td><td>0.5 mm / 43</td></tr>
  <tr><td>2</td><td></td><td>Carburetor setting H</td><td></td><td>43</td></tr>
</table>`;
const garbageRecords = parseTsDataHtmlStrict('D:/tmp/TS700_body.htm', garbageTsHtml, knownModels);
assert.strictEqual(garbageRecords.length, 0);

const unreadable = assessAuthenticityFromPayload({
  file_path: 'D:/tmp/TI_03_2000_30.pdf',
  title_line: '',
  front_excerpt: '',
  back_excerpt: '',
  native_pages_with_text: 0,
  payload_characters: 0
});
assert.strictEqual(unreadable.auth_after, 'PAYLOAD_UNREADABLE');

const authenticated = assessAuthenticityFromPayload({
  file_path: 'D:/tmp/TI_03_2000_30.pdf',
  title_line: 'Technical Information TI_03_2000_30 Andreas Stihl AG & Co.',
  front_excerpt: 'Technical Information STIHL BG 45 Specifications Spare Parts',
  back_excerpt: 'Copyright Andreas Stihl AG & Co.',
  native_pages_with_text: 4,
  payload_characters: 600
});
assert.strictEqual(authenticated.auth_after, 'AUTHENTICATED_OFFICIAL');
assert.strictEqual(authenticated.corporate_identity, true);

const maps = {
  batch2ByPath: new Map([
    [normalizePathForTest(import.meta.url), { source_file_path: new URL(import.meta.url).pathname.slice(1) }]
  ]),
  batch3ByPublication: new Map()
};
const dedup = classifyDocumentDedup(
  {
    file_path: new URL(import.meta.url).pathname.slice(1),
    file_hash: hashFile(new URL(import.meta.url).pathname.slice(1)),
    pdf_pages: 10,
    publication_id: 'TI_03_2000_30',
    title_line: 'Technical Information TI_03_2000_30 STIHL',
    front_excerpt: 'Technical Information STIHL'
  },
  maps,
  new Map([['TI_03_2000_30', ['bg-45']]])
);
assert.strictEqual(dedup.dedup_status, 'EXACT_FILE_DUPLICATE');

const goldRejected = buildGoldValidationRecord(
  { normalized_model: null, normalized_value: null, field_name: 'power_kw', source_file: 'x', unit: 'kW', record_id: '1' },
  [],
  []
);
assert.strictEqual(goldRejected.status, 'REJECTED');

const goldNeedsReview = buildGoldValidationRecord(
  { normalized_model: 'fs-350', normalized_value: 1.6, field_name: 'power_kw', source_file: 'x', unit: 'kW', record_id: '2' },
  [{ eligible_independent: false, value: 1.6 }],
  [{ eligible_independent: false, value: 1.6 }]
);
assert.strictEqual(goldNeedsReview.status, 'NEEDS_MANUAL_REVIEW');

const goldIndependent = buildGoldValidationRecord(
  { normalized_model: 'fs-350', normalized_value: 1.6, field_name: 'power_kw', source_file: 'x', unit: 'kW', record_id: '3' },
  [{ eligible_independent: true, value: 1.6 }],
  [{ eligible_independent: true, value: 1.6 }]
);
assert.strictEqual(goldIndependent.status, 'GOLD_VALIDATED_INDEPENDENT');

const precisionLimited = buildGoldPrecisionAuditRow('power_kw', 3, 3);
assert.strictEqual(precisionLimited.context_precision, 'LIMITED_SAMPLE');
assert.strictEqual(precisionLimited.auto_verify_eligible, false);

const precisionHigh = buildGoldPrecisionAuditRow('power_kw', 20, 20);
assert.strictEqual(precisionHigh.context_precision, 'HIGH');
assert.strictEqual(precisionHigh.auto_verify_eligible, true);

const unchangedScope = resolveModelScopeMutation(
  { candidate_id: 'a', variant_id: 'fs-350', model_scope: 'DOCUMENT_LEVEL_ONLY' },
  ['fs-200', 'fs-350']
);
assert.strictEqual(unchangedScope.changed, false);

const changedScope = resolveModelScopeMutation(
  { candidate_id: 'b', variant_id: 'fs-350', model_scope: 'DOCUMENT_LEVEL_ONLY' },
  ['fs-350']
);
assert.strictEqual(changedScope.changed, true);
assert.strictEqual(changedScope.after, 'EXACT_MODEL');

console.log('Phase 35C.3.1 validation integrity hotfix tests passed.');

function normalizePathForTest(urlValue) {
  return new URL(urlValue).pathname.slice(1).replace(/\//g, '\\').toLowerCase();
}
