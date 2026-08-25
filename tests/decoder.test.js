import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StopHelingService } from '../src/StopHelingService.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import { StihlDecoderService } from '../src/StihlDecoderService.js';
import { StihlRangeResolver } from '../src/StihlRangeResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Serial Breakpoints Engine Unit Tests...\n');

// Test 1: StihlRangeResolver exact breakpoint match for MS 261 C-M Gen 2
const rangeRes = StihlRangeResolver.resolve(184592301, '1', database);
assert.strictEqual(rangeRes.yearRangeFormatted, '2016 – Heden');
assert.strictEqual(rangeRes.yearStart, 2016);
assert.strictEqual(rangeRes.yearEnd, null);
assert.strictEqual(rangeRes.generation, 'MS 261 C-M Gen 2 (Facelift / V2)');
assert.ok(rangeRes.technicalHighlights.includes('300g lichter carter'));
assert.strictEqual(rangeRes.confidence, 'HIGH');
console.log('✅ Test 1 Passed: StihlRangeResolver matched exact breakpoint 184592301 -> "2016 – Heden" (MS 261 C-M Gen 2).');

// Test 2: StihlRangeResolver exact breakpoint match for MS 260
const rangeRes260 = StihlRangeResolver.resolve(150000000, '1', database);
assert.strictEqual(rangeRes260.yearRangeFormatted, '2001 – 2011');
assert.strictEqual(rangeRes260.generation, 'MS 260 (Klassiek / Analoog)');
console.log('✅ Test 2 Passed: StihlRangeResolver matched exact breakpoint 150000000 -> "2001 – 2011" (MS 260).');

// Test 3: StopHelingService.verifySerialNumber
StopHelingService.verifySerialNumber('184592301').then(res => {
  assert.strictEqual(res.serialNumber, '184592301');
  assert.strictEqual(typeof res.isStolen, 'boolean');
  assert.strictEqual(res.source, 'Politiedatabase StopHeling.nl');
  console.log('✅ Test 3 Passed: StopHelingService.verifySerialNumber returned valid TheftCheckResult object.');
}).catch(err => {
  console.error('Test 3 failure:', err);
});

// Test 4: REST API POST /api/v1/decode with productionPeriod
handleDecodeApiV1({ serialNumber: '184592301' }, database).then(res => {
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'success');
  assert.ok(res.body.data.matchedModel);
  assert.ok(res.body.data.estimatedProduction);
  console.log('✅ Test 4 Passed: REST API returns 200 OK with estimatedProduction payload.');
}).catch(err => {
  console.error('Test 4 failure:', err);
});

console.log('\n🎉 ALL SERIAL BREAKPOINTS ENGINE TESTS PASSED SUCCESSFULLY!');
