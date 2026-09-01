import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { StopHelingService } from '../src/StopHelingService.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running Comprehensive Decoder Baseline Regression Test Suite...\n');

// 1. 9-digit serial number
const res9digit = decodeStihlCode('184592301', database);
assert.strictEqual(res9digit.success, true);
assert.strictEqual(res9digit.type, 'SERIAL_NUMBER');
assert.strictEqual(res9digit.status, 'FORMAT_VALIDATED');
assert.strictEqual(res9digit.cleaned, '184592301');
assert.strictEqual(res9digit.factory.country, 'Duitsland');
assert.ok(res9digit.model && res9digit.model !== 'UNKNOWN', 'model should be resolved from serial breakpoints');
assert.ok(res9digit.estimatedYears && res9digit.estimatedYears !== 'UNKNOWN', 'estimatedYears should be resolved');
assert.ok(res9digit.productionPeriod !== null, 'productionPeriod should be resolved');
console.log('✅ Scenario 1 Passed: 9-digit serial decoded successfully.');

// 2. 11-digit part number
const res11digit = decodeStihlCode('11210210800', database);
assert.strictEqual(res11digit.success, true);
assert.strictEqual(res11digit.type, 'PART_NUMBER');
assert.strictEqual(res11digit.isWarning, true);
assert.ok(res11digit.modelGroup.includes('026') || res11digit.modelGroup.includes('260') || res11digit.modelGroup.includes('261'));
console.log('✅ Scenario 2 Passed: 11-digit part number decoded with warning card.');

// 3. Known model search
const resModel = decodeStihlCode('MS 261', database);
assert.strictEqual(resModel.success, true);
assert.strictEqual(resModel.type, 'MODEL_DECODE');
assert.strictEqual(resModel.prefixCode, 'MS');
console.log('✅ Scenario 3 Passed: Model query decoded with technical specs.');

// 4. Unknown serial / short number
const resShort = decodeStihlCode('12345', database);
assert.strictEqual(resShort.success, false);
assert.ok(resShort.error.includes('5 cijfers'));
console.log('✅ Scenario 4 Passed: Short number returns friendly error.');

// 5. Invalid length (10 digits)
const res10digit = decodeStihlCode('1234567890', database);
assert.strictEqual(res10digit.success, false);
assert.ok(res10digit.error.includes('10 cijfers'));
console.log('✅ Scenario 5 Passed: 10-digit number returns length error.');

// 6. Clone / Counterfeit detection
const resFake = decodeStihlCode('999999999', database);
assert.strictEqual(resFake.success, false);
assert.strictEqual(resFake.isCounterfeit, true);
assert.strictEqual(resFake.riskLevel, 'SUSPECT_SERIAL');
console.log('✅ Scenario 6 Passed: Counterfeit rule flagged fake serial 999999999 as SUSPECT_SERIAL.');

// 7. StopHeling police check
StopHelingService.verifySerialNumber('184592301').then(resStop => {
  assert.strictEqual(resStop.serialNumber, '184592301');
  assert.ok(['CLEAR', 'STOLEN', 'UNVERIFIED'].includes(resStop.status));
  assert.ok(resStop.statusLabel);
  console.log('✅ Scenario 7 Passed: StopHeling police check service active.');

  // 8. Passport HTML generation
  const passportHtml = renderStihlPassportHtml({
    cleanedSerial: '184592301',
    model: 'MS 261 C-M Gen 2',
    theftCheck: resStop
  });
  assert.ok(passportHtml.includes('184592301'));
  assert.ok(passportHtml.includes('stihldecoder.nl'));
  console.log('✅ Scenario 8 Passed: Passport HTML rendered correctly.');

  // 9. QR Generation URL in Passport
  assert.ok(passportHtml.includes('https://api.qrserver.com/v1/create-qr-code'));
  console.log('✅ Scenario 9 Passed: Verification QR code URL included.');

  console.log('\n🎉 ALL 9 BASELINE REGRESSION SCENARIOS PASSED 100% CLEANLY!');
}).catch(err => {
  console.error('Scenario 7 failure:', err);
  process.exit(1);
});
