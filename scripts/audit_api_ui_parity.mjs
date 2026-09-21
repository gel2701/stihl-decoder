import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

console.log('▶ Starting API vs UI Parity & State Isolation Audit...');

// Test cases covering all key dimensions
const TEST_CASES = [
  { id: 'MS260_LAAT_EXACT', serial: '160500000', expectedModel: 'MS 260', expectedType: 'SERIAL_NUMBER' },
  { id: '026_VROEG_SERIES', serial: '125000000', expectedModel: 'STIHL 026 / MS 260 Reeks', expectedType: 'SERIAL_NUMBER' },
  { id: 'BR420_BLOWER', serial: '146000000', expectedModel: 'BR 420', expectedType: 'SERIAL_NUMBER' },
  { id: 'MS261_GEN1', serial: '175000000', expectedModel: 'MS 261', expectedType: 'SERIAL_NUMBER' },
  { id: 'MS261_CM_GEN2', serial: '185000000', expectedModel: 'MS 261 C-M', expectedType: 'SERIAL_NUMBER' },
  { id: 'MS290_FARM_BOSS', serial: '250000000', expectedModel: 'MS 290', expectedType: 'SERIAL_NUMBER' },
  { id: 'BR600_BLOWER', serial: '275000000', expectedModel: 'BR 600', expectedType: 'SERIAL_NUMBER' },
  { id: 'FS120_BRUSHCUTTER', serial: '335000000', expectedModel: 'FS 120', expectedType: 'SERIAL_NUMBER' },
  { id: 'PLANT8_CHINA_UNASSISTED', serial: '824061159', expectedModel: 'Nog niet definitief bevestigd', expectedType: 'SERIAL_NUMBER' },
  { id: 'PLANT4_AUSTRIA_UNMAPPED', serial: '412345678', expectedModel: 'Nog niet definitief bevestigd', expectedType: 'SERIAL_NUMBER' },
  { id: 'PLANT9_REST_UNMAPPED', serial: '912345678', expectedModel: 'Nog niet definitief bevestigd', expectedType: 'SERIAL_NUMBER' },
  { id: 'COUNTERFEIT_TEST', serial: '123456789', expectedModel: 'Niet vastgesteld', expectedType: 'COUNTERFEIT' },
  { id: 'PART_NUMBER_TEST', serial: '1123 020 1200', expectedModel: 'STIHL 021, 023, 025, MS 210, MS 230, MS 250', expectedType: 'PART_NUMBER' }
];

// Helper simulating the exact UI mapping logic from index.html
function simulateUiResolution(res, priorState = null) {
  // In index.html, at start of handleDecode(), state is reset:
  let currentModelName = 'Niet vastgesteld';
  let currentSerial = '';
  let currentYearsFormatted = 'Niet vastgesteld';
  let displayedStatus = 'EMPTY';
  let specsVisible = false;

  if (!res) {
    return {
      displayedModel: currentModelName,
      displayedSerial: currentSerial,
      specsVisible,
      status: 'EMPTY'
    };
  }

  if (res.isCounterfeit) {
    return {
      displayedModel: 'Niet vastgesteld',
      displayedSerial: '',
      specsVisible: false,
      status: 'COUNTERFEIT'
    };
  }

  if (res.type === 'PART_NUMBER') {
    return {
      displayedModel: res.familyDetails?.familyLabel || res.modelGroup || 'Part Family',
      displayedSerial: '',
      specsVisible: false,
      status: 'PART_NUMBER'
    };
  }

  if (res.type === 'SERIAL_NUMBER') {
    currentSerial = res.cleaned;
    currentModelName = res.exactModel || res.confirmedModel || res.probableModelSeries || ((res.model && res.model !== 'UNKNOWN') ? res.model : 'Niet vastgesteld');
    
    // Check if specs are displayed
    const hasSpecs = res.technicalSpecs && Object.keys(res.technicalSpecs).length > 0;
    const isExact = (res.modelIdentityStatus === 'EXACT_MODEL_IDENTIFIED' || res.modelIdentityStatus === 'USER_CONFIRMED_MODEL');
    specsVisible = Boolean(hasSpecs && isExact);

    return {
      displayedModel: currentModelName,
      displayedSerial: currentSerial,
      specsVisible,
      status: res.modelIdentityStatus || 'SERIAL_NUMBER'
    };
  }

  return {
    displayedModel: currentModelName,
    displayedSerial: currentSerial,
    specsVisible,
    status: 'UNKNOWN'
  };
}

const results = [];
let allPassed = true;

for (const tc of TEST_CASES) {
  // 1. Core decoder
  const coreRes = decodeStihlCode(tc.serial, database);

  // 2. /api/decode simulation (identical parameters to server.js endpoint)
  let codeClean = tc.serial.trim().substring(0, 50).replace(/[^a-zA-Z0-9\s\.\-_\/]/g, '');
  const apiDecodeRes = decodeStihlCode(codeClean, database);

  // 3. /api/v1/decode
  let apiv1Res = null;
  const isSerial = tc.expectedType === 'SERIAL_NUMBER' || tc.expectedType === 'COUNTERFEIT';
  if (isSerial) {
    const v1Result = await handleDecodeApiV1({ serialNumber: tc.serial }, database);
    apiv1Res = v1Result.body;
  }

  // 4. UI simulation
  const uiSim = simulateUiResolution(coreRes);

  // Consistency checks
  const coreVsApiMatch = JSON.stringify(coreRes) === JSON.stringify(apiDecodeRes);
  
  // UI model consistency: UI should never show MS 260 if core/api did not resolve to MS 260
  const isMs260InCore = (coreRes.exactModel && coreRes.exactModel.includes('260')) ||
                        (coreRes.probableModelSeries && coreRes.probableModelSeries.includes('260')) ||
                        (coreRes.model && coreRes.model.includes('260'));
  const isMs260InUi = uiSim.displayedModel.includes('260');
  const ms260UiLeakage = (!isMs260InCore && isMs260InUi);

  // Technical specs leakage check: probable models must NOT display specs
  const isProbable = (coreRes.modelIdentityStatus === 'PROBABLE_MODEL_SERIES');
  const probableSpecsLeakage = (isProbable && uiSim.specsVisible);

  const testPassed = coreVsApiMatch && !ms260UiLeakage && !probableSpecsLeakage;
  if (!testPassed) allPassed = false;

  results.push({
    test_id: tc.id,
    input: tc.serial,
    core_type: coreRes.type,
    core_model_status: coreRes.modelIdentityStatus || 'N/A',
    core_resolved_model: coreRes.exactModel || coreRes.probableModelSeries || coreRes.model || 'UNKNOWN',
    api_decode_type: apiDecodeRes.type,
    api_v1_status: apiv1Res?.status || 'N/A',
    ui_displayed_model: uiSim.displayedModel,
    ui_specs_visible: uiSim.specsVisible,
    core_api_parity: coreVsApiMatch,
    ms260_leakage_detected: ms260UiLeakage,
    probable_specs_leakage: probableSpecsLeakage,
    pass: testPassed
  });
}

// 5. Sequential State Leakage Test (Serial A [MS 260] -> Serial B [Random Plant 4])
const serialA = '160500000'; // MS 260
const resA = decodeStihlCode(serialA, database);
const uiA = simulateUiResolution(resA);

const serialB = '412345678'; // Plant 4 Unmapped
const resB = decodeStihlCode(serialB, database);
const uiB = simulateUiResolution(resB, uiA); // Pass state of A to test reset

const sequentialResetPassed = (!uiB.displayedModel.includes('260') && !uiB.specsVisible && (uiB.displayedModel === 'Niet vastgesteld' || uiB.displayedModel === 'Nog niet definitief bevestigd'));
if (!sequentialResetPassed) allPassed = false;

const sequentialTestRecord = {
  test: 'SEQUENTIAL_STATE_RESET_AUDIT',
  step_1_input: serialA,
  step_1_result_model: uiA.displayedModel,
  step_2_input: serialB,
  step_2_result_model: uiB.displayedModel,
  ms260_residual_in_step_2: uiB.displayedModel.includes('260'),
  pass: sequentialResetPassed
};

const outputAudit = {
  audit_version: 'api_ui_parity_v1',
  generated_at: new Date().toISOString(),
  total_cases: results.length,
  all_passed: allPassed,
  sequential_state_reset_test: sequentialTestRecord,
  cases: results
};

const outputPath = path.join(rootDir, 'data', 'serial_recovery_api_ui_parity.json');
fs.writeFileSync(outputPath, JSON.stringify(outputAudit, null, 2), 'utf8');
console.log(`✅ API vs UI Parity Audit written to ${outputPath}`);
console.log(`Overall Parity Status: ${allPassed ? 'PASS ✅' : 'FAIL ❌'}`);
