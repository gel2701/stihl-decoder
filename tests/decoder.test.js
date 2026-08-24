import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanInput, decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '../data/stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Starting Stihl Decoder Unit Tests...\n');

// Test 1: Clean Input
assert.strictEqual(cleanInput('1 78 456 789'), '178456789');
assert.strictEqual(cleanInput('1121-021-0800'), '11210210800');
assert.strictEqual(cleanInput(' 4180 . 120 . 0600 '), '41801200600');
console.log('✅ Test 1 Passed: Input cleaning works correctly.');

// Test 2: German Serial Number (Waiblingen - MS 261 C-M Gen 1)
const res1 = decodeStihlCode('178456789', database);
assert.strictEqual(res1.success, true);
assert.strictEqual(res1.type, 'SERIAL_NUMBER');
assert.strictEqual(res1.factory.country, 'Duitsland');
assert.strictEqual(res1.factory.digit, '1');
assert.strictEqual(res1.model, 'STIHL MS 261 C-M (Generatie 1)');
assert.strictEqual(res1.confidence, 'Exact');
console.log('✅ Test 2 Passed: German serial number decoded correctly.');

// Test 3: US Serial Number (Virginia Beach - BR 600)
const res2 = decodeStihlCode('275123456', database);
assert.strictEqual(res2.success, true);
assert.strictEqual(res2.type, 'SERIAL_NUMBER');
assert.strictEqual(res2.factory.country, 'Verenigde Staten');
assert.strictEqual(res2.factory.digit, '2');
assert.strictEqual(res2.model, 'STIHL BR 600 (4-Mix Rugblazer)');
console.log('✅ Test 4 Passed: US serial number decoded correctly.');

// Test 4: China Serial Number (Qingdao - MS 170 / 180)
const res3 = decodeStihlCode('812345678', database);
assert.strictEqual(res3.success, true);
assert.strictEqual(res3.type, 'SERIAL_NUMBER');
assert.strictEqual(res3.factory.country, 'China');
assert.strictEqual(res3.factory.digit, '8');
console.log('✅ Test 4 Passed: China serial number decoded correctly.');

// Test 5: Part Number Detection (11 digits - 1121 prefix for 024 / 026 / MS 240 / MS 260)
const res4 = decodeStihlCode('1121 021 0800', database);
assert.strictEqual(res4.success, true);
assert.strictEqual(res4.type, 'PART_NUMBER');
assert.strictEqual(res4.isWarning, true);
assert.strictEqual(res4.familyCode, '1121');
assert.ok(res4.modelGroup.includes('026'));
assert.ok(res4.warningMessage.includes('Dit is een onderdeelnummer'));
console.log('✅ Test 5 Passed: 11-digit Part number detected with model family 1121.');

// Test 6: Part Number Detection (4180 prefix for 4-Mix FS series)
const res5 = decodeStihlCode('4180-120-0600', database);
assert.strictEqual(res5.success, true);
assert.strictEqual(res5.type, 'PART_NUMBER');
assert.strictEqual(res5.familyCode, '4180');
assert.ok(res5.modelGroup.includes('FS 90') || res5.modelGroup.includes('FS 130'));
console.log('✅ Test 6 Passed: Part number prefix 4180 correctly identified.');

// Test 7: Invalid Input Length
const res6 = decodeStihlCode('123456', database);
assert.strictEqual(res6.success, false);
assert.ok(res6.error.includes('6 cijfers'));
console.log('✅ Test 7 Passed: Invalid input handled cleanly.');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
