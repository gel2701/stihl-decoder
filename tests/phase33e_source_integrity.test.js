import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OFFICIAL_PRIMARY_DOCUMENTS } from '../src/canonicalData.js';
import { decodeStihlCode } from '../src/decoder.js';

function assertSourceModelLink(docNumber, modelName) {
  const doc = OFFICIAL_PRIMARY_DOCUMENTS[docNumber];
  if (!doc) return false;
  return doc.models_mentioned.some(m => modelName.toUpperCase().includes(m.toUpperCase()) || m.toUpperCase().includes(modelName.toUpperCase()));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('🧪 Running Phase 33E Source Integrity & Document Verification Test Suite...\n');

let totalTests = 0;
let passedTests = 0;

// Test 1: FS 100 RX Source Validation (0458-259-8621-D)
totalTests++;
const isFS100RXSourceValid = assertSourceModelLink('0458-259-8621-D', 'FS 100 RX');
if (isFS100RXSourceValid) {
  passedTests++;
  console.log(`✅ Test FS 100 RX Source Validation (0458-259-8621-D covers FS 100 RX): PASSED`);
} else {
  console.warn(`❌ Test FS 100 RX Source Validation: FAILED`);
}

// Test 2: Source Mismatch Assertion Test (FS 100 RX + 0458-434-0121 MUST FAIL)
totalTests++;
const isMismatchedDocValid = assertSourceModelLink('0458-434-0121', 'FS 100 RX');
if (!isMismatchedDocValid) {
  passedTests++;
  console.log(`✅ Test Source Mismatch Assertion (FS 100 RX + 0458-434-0121 correctly rejected): PASSED`);
} else {
  console.warn(`❌ Test Source Mismatch Assertion: FAILED`);
}

// Test 3: FS 100 RX Weight (4.7 kg) & Spark Plug (Bosch USR 7 AC / NGK CMR6H)
totalTests++;
const resFS100RX = decodeStihlCode('FS 100 RX', database);
const isWeight47 = resFS100RX.technicalSpecs && resFS100RX.technicalSpecs.weight_kg === 4.7;
const hasBoschSparkPlug = resFS100RX.technicalSpecs && resFS100RX.technicalSpecs.spark_plug.includes('Bosch USR 7 AC');

if (isWeight47 && hasBoschSparkPlug) {
  passedTests++;
  console.log(`✅ Test FS 100 RX Provenance Specs (Weight: 4.7 kg, Spark Plug: Bosch USR 7 AC / NGK CMR6H): PASSED`);
} else {
  console.warn(`❌ Test FS 100 RX Provenance Specs: FAILED`, resFS100RX);
}

// Test 4: BR 600 Source Validation (0458-452-0121-J)
totalTests++;
const isBR600SourceValid = assertSourceModelLink('0458-452-0121-J', 'BR 600');
if (isBR600SourceValid) {
  passedTests++;
  console.log(`✅ Test BR 600 Source Validation (0458-452-0121-J covers BR 600): PASSED`);
} else {
  console.warn(`❌ Test BR 600 Source Validation: FAILED`);
}

// Test 5: MS 261 Source Validation (0458-543-0121)
totalTests++;
const isMS261SourceValid = assertSourceModelLink('0458-543-0121', 'MS 261');
if (isMS261SourceValid) {
  passedTests++;
  console.log(`✅ Test MS 261 Source Validation (0458-543-0121 covers MS 261): PASSED`);
} else {
  console.warn(`❌ Test MS 261 Source Validation: FAILED`);
}

// Test 6: BR 600 Regression Check (64.8cc, 2.8kW, Blower, ZERO Chain Specs)
totalTests++;
const resBR600 = decodeStihlCode('BR600', database);
const isBR600Blower = resBR600.category.toLowerCase().includes('bladblazer');
const isBR60064cc = resBR600.technicalSpecs && resBR600.technicalSpecs.displacement_cc === 64.8;
const noBR600Chain = !resBR600.technicalSpecs.chain_pitch;

if (isBR600Blower && isBR60064cc && noBR600Chain) {
  passedTests++;
  console.log(`✅ Test BR600 Blower Regression (Bladblazer, 64.8 cc, ZERO Chain Specs): PASSED`);
} else {
  console.warn(`❌ Test BR600 Regression: FAILED`, resBR600);
}

console.log(`\n====================================================================`);
console.log(`PHASE 33E SOURCE TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`====================================================================\n`);

const isAllPassed = (passedTests === totalTests);
console.log(`git 🚦 PHASE 33E DECISION: ${isAllPassed ? '✅ GO' : '❌ NO-GO'}`);

fs.writeFileSync(
  path.join(__dirname, 'phase33e_audit_report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    totalTests,
    passedTests,
    seoContentFreeze: 'ACTIVE',
    decision: isAllPassed ? 'GO' : 'NO-GO'
  }, null, 2),
  'utf8'
);

process.exit(isAllPassed ? 0 : 1);
