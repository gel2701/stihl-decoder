import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode, cleanInput, evaluateCounterfeitRules } from '../src/decoder.js';
import { StihlDecoderService } from '../src/StihlDecoderService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Decoding Engine Unit Tests...\n');

// Test 1: Input Cleaning
assert.strictEqual(cleanInput('178 456 789'), '178456789');
assert.strictEqual(StihlDecoderService.sanitizeSerial('178-456.789'), '178456789');
console.log('✅ Test 1 Passed: Input cleaning works correctly.');

// Test 2: Plant Resolver
const plant1 = StihlDecoderService.resolvePlant('1');
assert.strictEqual(plant1.country, 'Duitsland');
assert.strictEqual(plant1.location, 'Waiblingen');
console.log('✅ Test 2 Passed: Plant resolution correctly maps digit 1 to Germany.');

// Test 3: Counterfeit Detection Engine
const alertsFake = StihlDecoderService.evaluateCounterfeits('012345678');
assert.ok(alertsFake.length > 0);
assert.ok(alertsFake[0].includes('Ongeldige fabriekscode'));

const alertsKnownFake = StihlDecoderService.evaluateCounterfeits('999999999');
assert.ok(alertsKnownFake.length > 0);
assert.ok(alertsKnownFake[0].includes('database van bekende namaakmachines'));
console.log('✅ Test 3 Passed: Counterfeit and clone detection engine flags invalid & known fake serials.');

// Test 4: StihlDecoderService.decode() Output Structure
const serviceResult = StihlDecoderService.decode('178456789', database);
assert.strictEqual(serviceResult.isValidFormat, true);
assert.strictEqual(serviceResult.plantInfo.code, '1');
assert.strictEqual(serviceResult.plantInfo.country, 'Duitsland');
assert.ok(serviceResult.manufacturingYearEstimate);
assert.strictEqual(serviceResult.counterfeitAlerts.length, 0);
console.log('✅ Test 4 Passed: StihlDecoderService.decode() returns full DecodeResult structure.');

// Test 5: Part Number Warning Test
const resPart = decodeStihlCode('1121 021 0800', database);
assert.strictEqual(resPart.success, true);
assert.strictEqual(resPart.type, 'PART_NUMBER');
assert.strictEqual(resPart.familyCode, '1121');
console.log('✅ Test 5 Passed: 11-digit Part number correctly identified.');

console.log('\n🎉 ALL DECODING ENGINE TESTS PASSED SUCCESSFULLY!');
