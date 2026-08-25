import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode, cleanInput, evaluateCounterfeitRules } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Decoding Engine Unit Tests...\n');

// Test 1: Input Cleaning
assert.strictEqual(cleanInput('178 456 789'), '178456789');
assert.strictEqual(cleanInput('1121-021-0800'), '11210210800');
console.log('✅ Test 1 Passed: Input cleaning works correctly.');

// Test 2: German Serial Number & Plant Lookup
const resDE = decodeStihlCode('178456789', database);
assert.strictEqual(resDE.success, true);
assert.strictEqual(resDE.factory.digit, '1');
assert.strictEqual(resDE.factory.country, 'Duitsland');
console.log('✅ Test 2 Passed: German serial number decoded with plant lookup.');

// Test 3: Counterfeit / Clone Detection Rule
const cfFake = evaluateCounterfeitRules('999999999', database);
assert.strictEqual(cfFake.isCounterfeit, true);
assert.strictEqual(cfFake.riskLevel, 'DEFINITIVE_FAKE');

const resFake = decodeStihlCode('012345678', database);
assert.strictEqual(resFake.success, false);
assert.strictEqual(resFake.isCounterfeit, true);
console.log('✅ Test 3 Passed: Counterfeit and clone rules correctly flag fake serial numbers.');

// Test 4: Technical Specifications Match
assert.ok(resDE.technicalSpecs);
assert.ok(resDE.technicalSpecs.spark_plug);
assert.ok(resDE.technicalSpecs.electrode_gap_mm);
console.log('✅ Test 4 Passed: Technical specifications (spark plug, carb settings) returned.');

// Test 5: Part Number Detection
const resPart = decodeStihlCode('1121 021 0800', database);
assert.strictEqual(resPart.success, true);
assert.strictEqual(resPart.type, 'PART_NUMBER');
assert.strictEqual(resPart.familyCode, '1121');
console.log('✅ Test 5 Passed: 11-digit Part number correctly identified as non-serial casting code.');

console.log('\n🎉 ALL DECODING ENGINE TESTS PASSED SUCCESSFULLY!');
