import assert from 'assert';

import {
  detectFilenamePayloadConflict,
  main,
  parseLegacyPublicationIdentity,
  parseModelIndexHtml,
  parseRepairTimeHtml,
  parseTsDataHtml
} from '../scripts/phase35c3_legacy_library_graph.js';

console.log('Starting Phase 35C.3 legacy library graph tests...');

const knownModels = [
  { model_id: 'm1', slug: '017', model_name: '017', series_code: '1130', patterns: ['017'], normalized_aliases: ['017'] },
  { model_id: 'm2', slug: '018', model_name: '018', series_code: '1130', patterns: ['018'], normalized_aliases: ['018'] },
  { model_id: 'm3', slug: 'fs-200', model_name: 'FS 200', series_code: '4134', patterns: ['FS[-\\s]*200'], normalized_aliases: ['FS200'] },
  { model_id: 'm4', slug: 'fs-350', model_name: 'FS 350', series_code: '4134', patterns: ['FS[-\\s]*350'], normalized_aliases: ['FS350'] }
];

const modelHtml = `
<table>
  <tr><td>TI-No.</td><td>Contents</td><td>Series</td></tr>
  <tr>
    <td><a href="../../../PDF/ti/1995/TI_23_1995_30.pdf">23.95</a></td>
    <td>017, 018: New Chain Saws</td>
    <td>1130</td>
  </tr>
</table>`;
const modelRelations = parseModelIndexHtml('D:/tmp/model_chain_017_ti_body_30.htm', modelHtml, knownModels);
assert.strictEqual(modelRelations.length, 2);
assert.strictEqual(modelRelations[0].publication_family, 'TI');
assert.strictEqual(modelRelations[0].series_code, '1130');

const tsHtml = `
<td class="Ue2_o">Testing and Setting Data</td>
<td class="Ue2_o">Brushcutter: FS 200, FS 350</td>
<table>
  <tr><td>1</td><td></td><td>Piston displacement</td><td>cc</td><td>36.3</td></tr>
  <tr><td>4</td><td></td><td>Engine power</td><td>kW (bhp)</td><td>1.6 (2.2)</td></tr>
</table>`;
const tsRecords = parseTsDataHtml('D:/tmp/FS200_body.htm', tsHtml, knownModels);
assert.ok(tsRecords.every((record) => record.model_scope === 'MODEL_GROUP'));

const rtHtml = `
<td class="Ue2_o">Timetables for Repair Work</td>
<td class="Ue2_o">Trimmer, Edger, Clearing Saw: FS 200, FS 350</td>
<table>
  <tr><td>Code</td><td>Type of Repair</td><td>RT</td></tr>
  <tr><td>1</td><td>Crankcase, Crankshaft</td><td>2.0</td></tr>
</table>`;
const rtRecords = parseRepairTimeHtml('D:/tmp/03_T_08_FS120.htm', rtHtml, knownModels);
assert.strictEqual(rtRecords.length, 1);
assert.strictEqual(rtRecords[0].repair_time_unit, 'tenths_of_hour');

const publication = parseLegacyPublicationIdentity('RA_573_00_02_02_STIHL MS 261.pdf');
assert.strictEqual(publication.publication_family, 'RA');
assert.strictEqual(publication.normalized_publication_id, 'RA_573_00_02_02');

const conflict = detectFilenamePayloadConflict(
  'RA_376_00_02_04_STIHL TS 700, 700.pdf',
  'STIHL TS 700, 800 2012-06'
);
assert.strictEqual(conflict.conflict, true);

console.log('Phase 35C.3 legacy library graph tests passed.');
