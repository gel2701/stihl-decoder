import assert from 'assert';
import { verifyStopHelingReportText } from '../src/StopHelingVerifier.js';

console.log('🧪 Testing StopHeling Waterproof Report Verification Engine...\n');

// Sample StopHeling Print Text (Matching user screenshot)
const sampleStopHelingPrintText = `
Zoekresultaten
Je zocht op: 184592301

We hebben op 28-08-2026 geen resultaten gevonden in de Stop Heling-database voor dit serienummer. Dat betekent dat dit artikel niet bij ons geregistreerd staat als gestolen.

Let goed op!
Blijf wel zelf goed nadenken als je iets koopt. Is deze aanbieding te mooi om waar te zijn? Krijg je de originele doos en het aankoopbonnetje er niet bij? Dan kan het nog steeds dat je iets koopt dat gestolen is. En dat blijft heling, en dus strafbaar.

print
`;

// Test 1: Valid Print Report matching serial number 184592301
const resValid = verifyStopHelingReportText(sampleStopHelingPrintText, '184592301');
assert.strictEqual(resValid.isValid, true);
assert.strictEqual(resValid.verificationLevel, 'WATERPROOF_DOCUMENT_VERIFIED');
assert.strictEqual(resValid.serialNumber, '184592301');
assert.strictEqual(resValid.checkedAt, '28-08-2026');
assert.ok(resValid.proofHash.startsWith('SH-'));
console.log('✅ Test 1 Passed: Valid StopHeling print report verified with proof hash', resValid.proofHash);

// Test 2: Serial Mismatch (Doc has 184592301, user target is 999999999)
const resMismatch = verifyStopHelingReportText(sampleStopHelingPrintText, '999999999');
assert.strictEqual(resMismatch.isValid, false);
assert.strictEqual(resMismatch.code, 'SERIAL_MISMATCH');
console.log('✅ Test 2 Passed: Serial mismatch correctly rejected.');

// Test 3: Invalid Document Format
const resInvalid = verifyStopHelingReportText('Willekeurige tekst zonder diefstalcontrole', '184592301');
assert.strictEqual(resInvalid.isValid, false);
assert.strictEqual(resInvalid.code, 'INVALID_STOPHELING_FORMAT');
console.log('✅ Test 3 Passed: Invalid document format correctly rejected.');

console.log('\n🎉 ALL STOPHELING VERIFIER TESTS PASSED 100% CLEANLY!');
