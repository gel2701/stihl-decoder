import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('🧪 Running Phase 33 Category Specification Whitelist & Leak Prevention Regression Suite...\n');

let totalTests = 0;
let passedTests = 0;

// Test 1: BR600 / BR 600 Query Decoding
const br600Inputs = ['BR600', 'BR 600', 'br600', 'br 600'];
for (const input of br600Inputs) {
  totalTests++;
  const result = decodeStihlCode(input, database);
  const specs = result.technicalSpecs || {};

  const hasChainPitch = specs.chain_pitch !== undefined && specs.chain_pitch !== null;
  const hasChainGauge = specs.chain_gauge_mm !== undefined && specs.chain_gauge_mm !== null;
  const hasBarLength = specs.bar_length !== undefined && specs.bar_length !== null;

  if (!hasChainPitch && !hasChainGauge && !hasBarLength && result.category.toLowerCase().includes('bladblazer')) {
    passedTests++;
    console.log(`✅ Test Decode BR600 ("${input}"): PASSED (Category: ${result.category}, Chain Specs: ZERO LEAK)`);
  } else {
    console.warn(`❌ Test Decode BR600 ("${input}"): FAILED`, result);
  }
}

// Test 2: MS261 Chainsaw Query Decoding (Chain specs ALLOWED for chainsaws)
totalTests++;
const ms261Result = decodeStihlCode('MS 261', database);
if (ms261Result.technicalSpecs && ms261Result.technicalSpecs.chain_pitch) {
  passedTests++;
  console.log(`✅ Test Decode MS 261 (Chainsaw): PASSED (Chain pitch: ${ms261Result.technicalSpecs.chain_pitch})`);
} else {
  console.warn(`❌ Test Decode MS 261 (Chainsaw): FAILED`, ms261Result);
}

// Test 3: FS350 Brushcutter Query Decoding
totalTests++;
const fs350Result = decodeStihlCode('FS 350', database);
if (!fs350Result.technicalSpecs.chain_pitch && fs350Result.category.toLowerCase().includes('bosmaaier')) {
  passedTests++;
  console.log(`✅ Test Decode FS 350 (Brushcutter): PASSED (Category: ${fs350Result.category}, NO chain specs)`);
} else {
  console.warn(`❌ Test Decode FS 350 (Brushcutter): FAILED`, fs350Result);
}

// Test 4: TS420 Cut-off Saw Query Decoding
totalTests++;
const ts420Result = decodeStihlCode('TS 420', database);
if (!ts420Result.technicalSpecs.chain_pitch && ts420Result.category.toLowerCase().includes('doorslijper')) {
  passedTests++;
  console.log(`✅ Test Decode TS 420 (Cutoff Saw): PASSED (Category: ${ts420Result.category}, NO chain specs)`);
} else {
  console.warn(`❌ Test Decode TS 420 (Cutoff Saw): FAILED`, ts420Result);
}

// Test 5: BR700 Blower Query Decoding
totalTests++;
const br700Result = decodeStihlCode('BR 700', database);
if (!br700Result.technicalSpecs.chain_pitch && br700Result.category.toLowerCase().includes('bladblazer')) {
  passedTests++;
  console.log(`✅ Test Decode BR 700 (Blower): PASSED (Category: ${br700Result.category}, NO chain specs)`);
} else {
  console.warn(`❌ Test Decode BR 700 (Blower): FAILED`, br700Result);
}

// Test 6: BR 600 Machine Passport HTML Rendering
totalTests++;
const br600PassportData = {
  cleanedSerial: '428291045',
  model: 'BR 600',
  category: 'Bladblazer',
  technicalSpecs: decodeStihlCode('BR 600', database).technicalSpecs
};
const passportHtml = renderStihlPassportHtml(br600PassportData);

const hasPassportChainPitch = passportHtml.includes('Snijgarnituur') || passportHtml.includes('Kettingmaat') || passportHtml.includes('.325"');
if (!hasPassportChainPitch) {
  passedTests++;
  console.log(`✅ Test BR 600 Passport HTML: PASSED (ZERO chainsaw terminology in passport)`);
} else {
  console.warn(`❌ Test BR 600 Passport HTML: FAILED (Chainsaw terminology leaked into passport!)`);
}

console.log(`\n====================================================================`);
console.log(`PHASE 33 REGRESSION AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`====================================================================\n`);

const isAllPassed = (passedTests === totalTests);
console.log(`🚦 PHASE 33 CATEGORY WHITELIST DECISION: ${isAllPassed ? '✅ GO' : '❌ NO-GO'}`);

fs.writeFileSync(
  path.join(__dirname, 'phase33_audit_report.json'),
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
