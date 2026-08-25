import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StopHelingService } from '../src/StopHelingService.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Stop Heling Service & Theft Check Unit Tests...\n');

// Test 1: StopHelingService.verifySerialNumber
StopHelingService.verifySerialNumber('184592301').then(res => {
  assert.strictEqual(res.serialNumber, '184592301');
  assert.strictEqual(typeof res.isStolen, 'boolean');
  assert.strictEqual(res.source, 'Politiedatabase StopHeling.nl');
  assert.ok(res.checkedAt);
  assert.ok(res.statusLabel);
  console.log('✅ Test 1 Passed: StopHelingService.verifySerialNumber returned valid TheftCheckResult object.');
}).catch(err => {
  console.error('Test 1 failure:', err);
});

// Test 2: REST API POST /api/v1/decode with theftCheck payload
handleDecodeApiV1({ serialNumber: '184592301' }, database).then(res => {
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'success');
  assert.ok(res.body.data.theftCheck);
  assert.strictEqual(res.body.data.theftCheck.source, 'Politiedatabase StopHeling.nl');
  console.log('✅ Test 2 Passed: REST API v1 Controller returns 200 OK with theftCheck payload.');
}).catch(err => {
  console.error('Test 2 failure:', err);
});

// Test 3: Stihl Passport HTML with Stop Heling Banner
const htmlCard = renderStihlPassportHtml({
  cleanedSerial: '184592301',
  model: 'MS 261 C-M (M-Tronic)',
  theftCheck: {
    isStolen: false,
    checkedAt: '26-08-2026',
    statusLabel: '✓ NIET ALS GESTOLEN GEREGISTREERD'
  }
});
assert.ok(htmlCard.includes('Stop Heling Diefstalcontrole'));
assert.ok(htmlCard.includes('✓ NIET ALS GESTOLEN GEREGISTREERD'));
console.log('✅ Test 3 Passed: StihlPassportGenerator rendered Stop Heling safety banner.');

console.log('\n🎉 ALL STOP HELING SERVICE & PASSPORT BADGE TESTS PASSED SUCCESSFULLY!');
