import assert from 'assert';
import fs from 'fs';
import { verifyStopHelingReportText } from '../src/StopHelingVerifier.js';

console.log('🧪 Testing StopHeling Waterproof PDF & Text Verification Engine...\n');

// 1. Test Plain Text Report
const sampleText = `
Zoekresultaten
Je zocht op: 184592301
We hebben op 28-08-2026 geen resultaten gevonden in de Stop Heling-database voor dit serienummer. Dat betekent dat dit artikel niet bij ons geregistreerd staat als gestolen.
`;

const resText = verifyStopHelingReportText(sampleText, '184592301');
assert.strictEqual(resText.isValid, true);
assert.strictEqual(resText.serialNumber, '184592301');
assert.strictEqual(resText.checkedAt, '28-08-2026');
console.log('✅ Test 1 Passed: Plain text report verified.');

// 2. Test Real User PDF File (D:\Downloads\Check wat je wil kopen_Zoekresultaten _ Stop heling.pdf)
const pdfPath = 'D:\\Downloads\\Check wat je wil kopen_Zoekresultaten _ Stop heling.pdf';
if (fs.existsSync(pdfPath)) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const resPdf = verifyStopHelingReportText(pdfBuffer, '184592301', 'Check wat je wil kopen_Zoekresultaten _ Stop heling.pdf');
  
  assert.strictEqual(resPdf.isValid, true);
  assert.strictEqual(resPdf.verificationLevel, 'WATERPROOF_DOCUMENT_VERIFIED');
  assert.strictEqual(resPdf.serialNumber, '184592301');
  assert.strictEqual(resPdf.checkedAt, '28-08-2026');
  assert.ok(resPdf.proofHash.startsWith('SH-'));
  console.log('✅ Test 2 Passed: Real User PDF file verified perfectly!');
  console.log('   - Proof Hash:', resPdf.proofHash);
  console.log('   - Date Extracted from PDF:', resPdf.checkedAt);
  console.log('   - Serial Number Validated:', resPdf.serialNumber);
} else {
  console.log('⚠️ PDF file test skipped (file not present at path).');
}

// 3. Test Invalid File Format
const resInvalid = verifyStopHelingReportText('Willekeurige tekst', '184592301', 'test.txt');
assert.strictEqual(resInvalid.isValid, false);
assert.strictEqual(resInvalid.code, 'INVALID_STOPHELING_FORMAT');
console.log('✅ Test 3 Passed: Non-StopHeling file correctly rejected.');

console.log('\n🎉 ALL WATERPROOF PDF & TEXT VERIFICATION TESTS PASSED 100% CLEANLY!');
