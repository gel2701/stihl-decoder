import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode, cleanInput, evaluateCounterfeitRules } from '../src/decoder.js';
import { StihlDecoderService } from '../src/StihlDecoderService.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Decoding Engine & API v1 Controller Unit Tests...\n');

// Test 1: Valid German 9-digit Serial (starts with 1)
const resDE = handleDecodeApiV1({ serialNumber: '184592301', optionalModelHint: 'MS 261' }, database);
assert.strictEqual(resDE.statusCode, 200);
assert.strictEqual(resDE.body.status, 'success');
assert.strictEqual(resDE.body.data.serialNumber, '184592301');
assert.strictEqual(resDE.body.data.formatted, '1 845 923 01');
assert.strictEqual(resDE.body.data.factory.code, '1');
assert.strictEqual(resDE.body.data.factory.country, 'Duitsland');
assert.strictEqual(resDE.body.data.factory.facility, 'Waiblingen');
assert.ok(resDE.body.data.matchedModel);
assert.strictEqual(resDE.body.data.authenticityStatus.isSuspicious, false);
console.log('✅ Test 1 Passed: Valid German 9-digit serial (starts with 1) returns 200 OK with full payload.');

// Test 2: Valid US 9-digit Serial (starts with 2 or 5)
const resUS2 = handleDecodeApiV1({ serialNumber: '275123456' }, database);
assert.strictEqual(resUS2.statusCode, 200);
assert.strictEqual(resUS2.body.data.factory.code, '2');
assert.strictEqual(resUS2.body.data.factory.country, 'Verenigde Staten');

const resUS5 = handleDecodeApiV1({ serialNumber: '512345678' }, database);
assert.strictEqual(resUS5.statusCode, 200);
assert.strictEqual(resUS5.body.data.factory.code, '5');
assert.strictEqual(resUS5.body.data.factory.country, 'Verenigde Staten');
console.log('✅ Test 2 Passed: Valid US 9-digit serials (starts with 2 or 5) return 200 OK.');

// Test 3: Empty input (400 Bad Request)
const resEmpty = handleDecodeApiV1({}, database);
assert.strictEqual(resEmpty.statusCode, 400);
assert.strictEqual(resEmpty.body.status, 'error');
assert.strictEqual(resEmpty.body.message, 'Serienummer is verplicht.');
console.log('✅ Test 3 Passed: Empty input returns 400 Bad Request.');

// Test 4: Invalid digit string and unexpected length (422 Unprocessable Entity)
const resShort = handleDecodeApiV1({ serialNumber: '12345' }, database);
assert.strictEqual(resShort.statusCode, 422);
assert.strictEqual(resShort.body.status, 'error');
assert.ok(resShort.body.flags.length > 0);
console.log('✅ Test 4 Passed: Unexpected length returns 422 Unprocessable Entity.');

// Test 5: Known Clone Pattern Detection (422 Unprocessable Entity)
const resFake = handleDecodeApiV1({ serialNumber: '999999999' }, database);
assert.strictEqual(resFake.statusCode, 422);
assert.strictEqual(resFake.body.status, 'error');
assert.ok(resFake.body.flags.length > 0);

const resZero = handleDecodeApiV1({ serialNumber: '012345678' }, database);
assert.strictEqual(resZero.statusCode, 422);
assert.strictEqual(resZero.body.status, 'error');
console.log('✅ Test 5 Passed: Detection of known clone patterns (999999999 / starting with 0) returns 422 error.');

console.log('\n🎉 ALL DECODING ENGINE & API V1 CONTROLLER TESTS PASSED SUCCESSFULLY!');
