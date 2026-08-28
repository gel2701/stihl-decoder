import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { normalizeModelQuery } from '../src/modelNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('🧪 Running Phase 33B Revision & Historical Model Relationship Test Suite...\n');

let totalTests = 0;
let passedTests = 0;

// Test 1: BR600 Exact Normalization
totalTests++;
const br600Norm = normalizeModelQuery('BR600');
if (br600Norm.baseModel === 'BR 600' && br600Norm.canonicalQuery === 'BR 600') {
  passedTests++;
  console.log(`✅ Test Normalization BR600 -> BR 600: PASSED`);
} else {
  console.warn(`❌ Test Normalization BR600: FAILED`, br600Norm);
}

// Test 2: BR-600 Exact Normalization
totalTests++;
const brDashNorm = normalizeModelQuery('BR-600');
if (brDashNorm.baseModel === 'BR 600' && brDashNorm.canonicalQuery === 'BR 600') {
  passedTests++;
  console.log(`✅ Test Normalization BR-600 -> BR 600: PASSED`);
} else {
  console.warn(`❌ Test Normalization BR-600: FAILED`, brDashNorm);
}

// Test 3: BR600 Regression Check (Specs, Category, NO Chain Specs)
totalTests++;
const br600Res = decodeStihlCode('BR600', database);
const isBlowerCategory = br600Res.category.toLowerCase().includes('bladblazer');
const is648cc = br600Res.technicalSpecs && br600Res.technicalSpecs.displacement_cc === 64.8;
const is28kw = br600Res.technicalSpecs && br600Res.technicalSpecs.power_kw === 2.8;
const noChainSpecs = !br600Res.technicalSpecs.chain_pitch;

if (isBlowerCategory && is648cc && is28kw && noChainSpecs) {
  passedTests++;
  console.log(`✅ Test BR600 Regression (64.8cc, 2.8kW, Blower, NO chain specs): PASSED`);
} else {
  console.warn(`❌ Test BR600 Regression: FAILED`, br600Res);
}

// Test 4: Historical 026 (NOT automatically rewritten to MS 260)
totalTests++;
const res026 = decodeStihlCode('026', database);
const is026Model = res026.model === 'STIHL 026';
const hasPredecessor026 = res026.relationship && res026.relationship.type === 'PREDECESSOR' && res026.relationship.relatedModel === 'MS 260';

if (is026Model && hasPredecessor026) {
  passedTests++;
  console.log(`✅ Test Historical 026 (Model: STIHL 026, Predecessor of MS 260): PASSED`);
} else {
  console.warn(`❌ Test Historical 026: FAILED`, res026);
}

// Test 5: Historical 036 (NOT automatically rewritten to MS 360)
totalTests++;
const res036 = decodeStihlCode('036', database);
if (res036.model === 'STIHL 036' && res036.relationship && res036.relationship.type === 'PREDECESSOR') {
  passedTests++;
  console.log(`✅ Test Historical 036 (Model: STIHL 036, Predecessor of MS 360): PASSED`);
} else {
  console.warn(`❌ Test Historical 036: FAILED`, res036);
}

// Test 6: Historical 046
totalTests++;
const res046 = decodeStihlCode('046', database);
if (res046.model === 'STIHL 046' && res046.relationship && res046.relationship.type === 'PREDECESSOR') {
  passedTests++;
  console.log(`✅ Test Historical 046 (Model: STIHL 046, Predecessor of MS 460): PASSED`);
} else {
  console.warn(`❌ Test Historical 046: FAILED`, res046);
}

// Test 7: Historical 044
totalTests++;
const res044 = decodeStihlCode('044', database);
if (res044.model === 'STIHL 044' && res044.relationship && res044.relationship.type === 'PREDECESSOR') {
  passedTests++;
  console.log(`✅ Test Historical 044 (Model: STIHL 044, Predecessor of MS 440): PASSED`);
} else {
  console.warn(`❌ Test Historical 044: FAILED`, res044);
}

// Test 8: Historical 066
totalTests++;
const res066 = decodeStihlCode('066', database);
if (res066.model === 'STIHL 066' && res066.relationship && res066.relationship.type === 'PREDECESSOR') {
  passedTests++;
  console.log(`✅ Test Historical 066 (Model: STIHL 066, Predecessor of MS 660): PASSED`);
} else {
  console.warn(`❌ Test Historical 066: FAILED`, res066);
}

// Test 9: Historical 020 T (Renamed to MS 200 T)
totalTests++;
const res020T = decodeStihlCode('020 T', database);
if (res020T.model === 'STIHL 020 T' && res020T.relationship && res020T.relationship.type === 'RENAMED_MODEL') {
  passedTests++;
  console.log(`✅ Test Historical 020 T (Renamed model to MS 200 T): PASSED`);
} else {
  console.warn(`❌ Test Historical 020 T: FAILED`, res020T);
}

console.log(`\n====================================================================`);
console.log(`PHASE 33B REVISION & HISTORICAL TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`====================================================================\n`);

const isAllPassed = (passedTests === totalTests);
console.log(`🚦 PHASE 33B AUDIT DECISION: ${isAllPassed ? '✅ GO' : '❌ NO-GO'}`);

fs.writeFileSync(
  path.join(__dirname, 'phase33b_audit_report.json'),
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
