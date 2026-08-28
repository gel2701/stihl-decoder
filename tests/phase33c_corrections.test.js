import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('🧪 Running Phase 33C Corrections & Verification Test Suite...\n');

let totalTests = 0;
let passedTests = 0;

// Test 1: 036 Family Code 1125 Fix (MUST NOT return 1128!)
totalTests++;
const res036 = decodeStihlCode('036', database);
const is036Family1125 = res036.seriesCode === '1125';
const is036Not1128 = res036.seriesCode !== '1128';
const is036Model = res036.model === 'STIHL 036';
const has036Rel = res036.relationship && res036.relationship.type === 'PREDECESSOR' && res036.relationship.relatedModel === 'MS 360';

if (is036Family1125 && is036Not1128 && is036Model && has036Rel) {
  passedTests++;
  console.log(`✅ Test 036 Family 1125 Fix: PASSED (Model: STIHL 036, Series: 1125, NOT 1128, Predecessor of MS 360)`);
} else {
  console.warn(`❌ Test 036 Family Fix: FAILED`, res036);
}

// Test 2: MS 360 Family Code 1125
totalTests++;
const resMS360 = decodeStihlCode('MS360', database);
if (resMS360.seriesCode === '1125' && resMS360.model.includes('MS 360')) {
  passedTests++;
  console.log(`✅ Test MS 360 Family 1125: PASSED (Series: 1125)`);
} else {
  console.warn(`❌ Test MS 360 Family: FAILED`, resMS360);
}

// Test 3: 046 & MS 460 Family Code 1128
totalTests++;
const res046 = decodeStihlCode('046', database);
const resMS460 = decodeStihlCode('MS460', database);
if (res046.seriesCode === '1128' && resMS460.seriesCode === '1128') {
  passedTests++;
  console.log(`✅ Test 046 / MS 460 Family 1128: PASSED (Series: 1128 preserved)`);
} else {
  console.warn(`❌ Test 046 / MS 460 Family: FAILED`, { res046, resMS460 });
}

// Test 4: 020 T Relationship & Disabled Spec Inheritance
totalTests++;
const res020T = decodeStihlCode('020 T', database);
const is020TIdentity = res020T.model === 'STIHL 020 T';
const isSuccessorTransition = res020T.relationship && res020T.relationship.type === 'SUCCESSOR_TRANSITION';
const isInheritanceDisabled = res020T.relationship && res020T.relationship.specInheritance === false;

if (is020TIdentity && isSuccessorTransition && isInheritanceDisabled) {
  passedTests++;
  console.log(`✅ Test 020 T Relationship (Identity: STIHL 020 T, Rel: SUCCESSOR_TRANSITION, Spec Inheritance: DISABLED): PASSED`);
} else {
  console.warn(`❌ Test 020 T Relationship: FAILED`, res020T);
}

// Test 5: BR 600 Regression Check
totalTests++;
const resBR600 = decodeStihlCode('BR600', database);
const isBlower = resBR600.category.toLowerCase().includes('bladblazer');
const is648cc = resBR600.technicalSpecs && resBR600.technicalSpecs.displacement_cc === 64.8;
const is28kw = resBR600.technicalSpecs && resBR600.technicalSpecs.power_kw === 2.8;
const noChain = !resBR600.technicalSpecs.chain_pitch;

if (isBlower && is648cc && is28kw && noChain) {
  passedTests++;
  console.log(`✅ Test BR 600 Regression (Blower, 64.8cc, 2.8kW, NO chain specs): PASSED`);
} else {
  console.warn(`❌ Test BR 600 Regression: FAILED`, resBR600);
}

console.log(`\n====================================================================`);
console.log(`PHASE 33C TEST SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`====================================================================\n`);

const isAllPassed = (passedTests === totalTests);
console.log(`🚦 PHASE 33C DECISION: ${isAllPassed ? '✅ GO' : '❌ NO-GO'}`);

fs.writeFileSync(
  path.join(__dirname, 'phase33c_audit_report.json'),
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
