/**
 * tests/phase81_gsc_first_scaling.test.js
 *
 * Phase 81 — GSC-first selection, reuse and queueing. These tests pin the pure
 * functions; no network, no eBay credentials, no store writes beyond temp files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  parseGscModelRows,
  computePriorityScore,
  classifyPartCommercial,
  buildMissingQueue,
  parseEbayPartsArg
} from '../scripts/phase81_gsc_first_scaling.mjs';

const addendum = `| Exacte onderdelenpagina | Klikken | Vertoningen | CTR | Positie |
| --- | ---: | ---: | ---: | ---: |
| /kettingzagen/ms-440/onderdelen/ | 2 | 446 | 0,45% | 8,92 |
| /kettingzagen/ms-170/onderdelen/ | 7 | 201 | 3,48% | 9,66 |
| /bladblazers/bg-86/onderdelen/ | 4 | 177 | 2,26% | 8,34 |
`;

test('81.1 parses the measured GSC model pages with their real numbers', () => {
  const rows = parseGscModelRows(addendum);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    path: '/kettingzagen/ms-440/onderdelen/',
    category_slug: 'kettingzagen',
    slug: 'ms-440',
    clicks: 2,
    impressions: 446,
    ctr_pct: 0.45,
    position: 8.92
  });
  assert.equal(parseGscModelRows('geen tabel').length, 0);
});

test('81.2 the priority formula is bounded and rewards measured demand plus gap', () => {
  const strong = computePriorityScore({ impressions: 446, maxImpressions: 446, phase60_score: 76, maxPhase60: 97, coverage_gap_pct: 96.4 });
  const weak = computePriorityScore({ impressions: 1, maxImpressions: 446, phase60_score: 0, maxPhase60: 97, coverage_gap_pct: 10 });
  assert.ok(strong <= 100 && strong > 90);
  assert.ok(weak < strong);
  assert.equal(computePriorityScore({}), 0);
});

test('81.3 hardware is excluded from the commercial queue, service parts are not', () => {
  assert.equal(classifyPartCommercial('Hexagon nut M8').hardware, true);
  assert.equal(classifyPartCommercial('Stihl Spark Plug').hardware, false);
  assert.equal(classifyPartCommercial('Stihl Spark Plug').tier, 'COMMERCIAL_HIGH');
});

test('81.4 the queue only contains missing parts and is spread across models', () => {
  const modelA = { rank: 1, model_name: 'MS 440', priority_score: 90, parts: [
    { part_number: '11256401701', part_name: 'Chain Sprocket Cover' },
    { part_number: '11280292301', part_name: 'Cylinder Gasket' },
    { part_number: '90223710210', part_name: 'Hexagon nut' }
  ] };
  const modelB = { rank: 2, model_name: 'MS 170', priority_score: 80, parts: [
    { part_number: '11306421200', part_name: 'Rim Sprocket' },
    { part_number: '11301234567', part_name: 'Muffler Gasket' }
  ] };
  const queue = buildMissingQueue({
    models: [modelA, modelB],
    directParts: new Set(['11301234567']),
    limit: 10
  });
  const parts = queue.map(entry => entry.part_number);
  assert.deepEqual(parts, ['11256401701', '11306421200', '11280292301']);
  assert.ok(!parts.includes('90223710210'), 'hardware must never be queued');
  assert.ok(!parts.includes('11301234567'), 'already covered parts must never be queued');
  assert.equal(queue[0].priority_model, 'MS 440');
});

test('81.5 extra ACTIVE eBay parts accept a comma list or a JSON file', () => {
  assert.deepEqual(parseEbayPartsArg('1123 640 3200,0000-642-1223'), ['11236403200', '00006421223']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase81-'));
  const file = path.join(dir, 'parts.json');
  fs.writeFileSync(file, JSON.stringify({ parts: ['11257909906', { part_number: '11131214705' }] }));
  assert.deepEqual(parseEbayPartsArg(file).sort(), ['11131214705', '11257909906']);
  assert.deepEqual(parseEbayPartsArg(''), []);
});
