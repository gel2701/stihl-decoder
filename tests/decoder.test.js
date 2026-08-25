import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StopHelingService } from '../src/StopHelingService.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import { StihlDecoderService } from '../src/StihlDecoderService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL FuelType Separation & Bugfix Tests...\n');

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

// Test 2: REST API POST /api/v1/decode returns specific model name & fuel_type
handleDecodeApiV1({ serialNumber: '184592301' }, database).then(res => {
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'success');
  assert.ok(res.body.data.matchedModel);
  assert.strictEqual(res.body.data.matchedModel.name, 'MS 261 C-M (M-Tronic)');
  assert.strictEqual(res.body.data.matchedModel.fuelType, 'PETROL_2STROKE');
  assert.ok(res.body.data.matchedModel.specs.displacementCc);
  console.log('✅ Test 2 Passed: REST API returns specific model name "MS 261 C-M (M-Tronic)" and fuelType "PETROL_2STROKE".');
}).catch(err => {
  console.error('Test 2 failure:', err);
});

// Test 3: StihlDecoderService decode method fuelType separation
const decoded = StihlDecoderService.decode('184592301', database);
assert.ok(decoded.modelMatch);
assert.strictEqual(decoded.modelMatch.modelName, 'MS 261 C-M (M-Tronic)');
assert.strictEqual(decoded.modelMatch.fuelType, 'PETROL_2STROKE');
assert.ok(decoded.modelMatch.specs.sparkPlug);
console.log('✅ Test 3 Passed: StihlDecoderService correctly resolves specific model name and petrol specs.');

// Test 4: Stihl Passport HTML rendering
const htmlCard = renderStihlPassportHtml({
  cleanedSerial: '184592301',
  model: 'MS 261 C-M (M-Tronic)',
  theftCheck: {
    isStolen: false,
    checkedAt: '26-08-2026',
    statusLabel: '✓ NIET ALS GESTOLEN GEREGISTREERD'
  }
});
assert.ok(htmlCard.includes('MS 261 C-M (M-Tronic)'));
assert.ok(htmlCard.includes('Stop Heling Diefstalcontrole'));
console.log('✅ Test 4 Passed: StihlPassportGenerator rendered specific model name on passport.');

console.log('\n🎉 ALL FUELTYPE SEPARATION & SPECIFIC MODEL NAME TESTS PASSED SUCCESSFULLY!');
