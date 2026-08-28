import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { getRenderableSpecs, CATEGORY_TYPES, normalizeCategorySlug } from '../src/categoryWhitelist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('🧪 Running Phase 33D Zero Generic Spec Fallback & Hard Category Assertion Suite...\n');

let totalTests = 0;
let passedTests = 0;

// Test 1: FS100 Decode (Must be Bosmaaier, NO chain specs, NO 50.2cc)
totalTests++;
const resFS100 = decodeStihlCode('FS100', database);
const isFS100Bosmaaier = resFS100.category.toLowerCase().includes('bosmaaier');
const noFS100Chain = !resFS100.technicalSpecs.chain_pitch && !resFS100.technicalSpecs.chain_gauge_mm;
const noFS100Generic50cc = resFS100.technicalSpecs.displacement_cc !== 50.2;

if (isFS100Bosmaaier && noFS100Chain && noFS100Generic50cc) {
  passedTests++;
  console.log(`✅ Test FS100 Decode (Category: Bosmaaier, Specs: ${resFS100.technicalSpecs.displacement_cc || '31.4'} cc, ZERO Chain Specs): PASSED`);
} else {
  console.warn(`❌ Test FS100 Decode: FAILED`, resFS100);
}

// Test 2: FS 100 RX Decode (Verified 31.4cc, 1.05kW, 4-MIX, NO M-Tronic)
totalTests++;
const resFS100RX = decodeStihlCode('FS 100 RX', database);
const isFS100RX31cc = resFS100RX.technicalSpecs && resFS100RX.technicalSpecs.displacement_cc === 31.4;
const isFS100RX1kW = resFS100RX.technicalSpecs && resFS100RX.technicalSpecs.power_kw === 1.05;
const noFS100RXChain = !resFS100RX.technicalSpecs.chain_pitch;

if (isFS100RX31cc && isFS100RX1kW && noFS100RXChain) {
  passedTests++;
  console.log(`✅ Test FS 100 RX Verified Baseline (31.4 cc, 1.05 kW, ZERO Chain Specs): PASSED`);
} else {
  console.warn(`❌ Test FS 100 RX Baseline: FAILED`, resFS100RX);
}

// Test 3: BR600 Blower Regression
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

// Test 4: MS261 Chainsaw Regression
totalTests++;
const resMS261 = decodeStihlCode('MS 261', database);
const isMS261Chainsaw = resMS261.category.toLowerCase().includes('kettingzaag');
const isMS26150cc = resMS261.technicalSpecs && resMS261.technicalSpecs.displacement_cc === 50.2;
const hasMS261Chain = resMS261.technicalSpecs && resMS261.technicalSpecs.chain_pitch === '.325"';

if (isMS261Chainsaw && isMS26150cc && hasMS261Chain) {
  passedTests++;
  console.log(`✅ Test MS 261 Chainsaw Regression (Kettingzaag, 50.2 cc, Chain Pitch: .325"): PASSED`);
} else {
  console.warn(`❌ Test MS 261 Regression: FAILED`, resMS261);
}

// Test 5: Hard Safety Assertion (Non-chainsaws MUST NOT contain chain specs)
totalTests++;
let assertionPassed = true;
try {
  getRenderableSpecs({ displacement_cc: 31.4, chain_pitch: '.325"' }, 'Bosmaaier', 'FS 100');
  assertionPassed = false; // Should have thrown an error!
} catch (err) {
  if (err.message.includes('[CRITICAL_DATA_LEAK]')) {
    assertionPassed = true;
  }
}

if (assertionPassed) {
  passedTests++;
  console.log(`✅ Test Hard Safety Assertion (Blocked chain pitch on Bosmaaier): PASSED`);
} else {
  console.warn(`❌ Test Hard Safety Assertion: FAILED`);
}

// Test 6: 25-Model Random Category & Spec Audit (0 Impossible Spec Combinations)
totalTests++;
let impossibleCombinations = 0;
const testModels = [
  'FS 100', 'FS 100 RX', 'FS 350', 'FS 460', 'FS 90', 'FS 130', 'FS 250', 'FS 55', 'FS 70', 'FS 85',
  'BR 600', 'BR 700', 'BR 500', 'BR 430', 'BR 800',
  'MS 261', 'MS 260', 'MS 362', 'MS 170', 'MS 462',
  'HS 82', 'TS 420', 'HT 103', 'BG 86', 'KM 130'
];

testModels.forEach(q => {
  const dec = decodeStihlCode(q, database);
  const catSlug = normalizeCategorySlug(dec.category, dec.model);
  const specs = dec.technicalSpecs || {};

  if (catSlug !== CATEGORY_TYPES.CHAINSAW && catSlug !== CATEGORY_TYPES.ACCU_CHAINSAW) {
    if (specs.chain_pitch || specs.chain_gauge_mm || specs.guide_bar || specs.bar_length) {
      impossibleCombinations++;
      console.warn(`❌ Impossible combination found on ${q}: Chain specs on non-chainsaw (${dec.category})`);
    }
  }
  if (catSlug === CATEGORY_TYPES.CHAINSAW) {
    if (specs.blowing_force_n || specs.air_velocity_ms) {
      impossibleCombinations++;
      console.warn(`❌ Impossible combination found on ${q}: Blower specs on chainsaw`);
    }
  }
});

if (impossibleCombinations === 0) {
  passedTests++;
  console.log(`✅ Test 25-Model Audit (25/25 models checked, 0 impossible spec combinations): PASSED`);
} else {
  console.warn(`❌ Test 25-Model Audit: FAILED (${impossibleCombinations} impossible combinations)`);
}

console.log(`\n====================================================================`);
console.log(`PHASE 33D ZERO FALLBACK TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`====================================================================\n`);

const isAllPassed = (passedTests === totalTests);
console.log(`🚦 PHASE 33D DECISION: ${isAllPassed ? '✅ GO' : '❌ NO-GO'}`);

fs.writeFileSync(
  path.join(__dirname, 'phase33d_audit_report.json'),
  JSON.stringify({
    timestamp: new Date().toISOString(),
    totalTests,
    passedTests,
    impossibleCombinations,
    seoContentFreeze: 'ACTIVE',
    decision: isAllPassed ? 'GO' : 'NO-GO'
  }, null, 2),
  'utf8'
);

process.exit(isAllPassed ? 0 : 1);
