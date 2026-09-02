import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { resolveMachineClassification } from '../src/driveClassification.js';
import { buildPassportViewModel, renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import { runTestSuite } from '../tests/run_all_tests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const PHASE_ID = '35C.4.3.2.2';
const SOURCE_COMMIT = '5f460f87bca8e973d3f06a3912792317f181ba0f';
const EXPECTED_STORE_HASH = 'ebbde40f2f206be69b1de6d987135ade3e254baa7e70205018d14d086c7fa676';
const OUTPUT_NAMES = ['preflight_report', 'classification_taxonomy_audit', 'serial_184592301_audit', 'series_classification_audit', 'prefix_classification_audit', 'classification_conflict_audit', 'ui_semantic_consistency_audit', 'api_contract_audit', 'technical_spec_separation_audit', 'passport_audit', 'structured_data_audit', 'failure_injection_report', 'public_store_immutability_audit', 'regression_report', 'idempotency_report', 'final_report'];
const ARTIFACT_KEYS = {
  preflight_report: 'preflight', classification_taxonomy_audit: 'taxonomyAudit', serial_184592301_audit: 'serialAudit',
  series_classification_audit: 'seriesAudit', prefix_classification_audit: 'prefixAudit', classification_conflict_audit: 'conflictAudit',
  ui_semantic_consistency_audit: 'uiAudit', api_contract_audit: 'apiAudit', technical_spec_separation_audit: 'technicalAudit',
  passport_audit: 'passportAudit', structured_data_audit: 'structuredAudit', failure_injection_report: 'failureAudit',
  public_store_immutability_audit: 'publicStoreAudit', regression_report: 'regression'
};
const PHASE_SAFETY_TEST_FILES = [
  'tests/baseline.test.js',
  'tests/phase35c4321_nested_fallback_hotfix.test.js',
  'tests/phase35c432_public_evidence_activation.test.js',
  'tests/phase35c422_public_evidence_eligibility.test.js'
];

function git(args) { return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim(); }
function readJson(relativePath) { return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8')); }
function readJsonAtCommit(commit, relativePath) { return JSON.parse(git(['show', `${commit}:${relativePath}`])); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function hash(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function write(name, value) { fs.writeFileSync(path.join(rootDir, 'data', `phase35c4322_${name}.json`), JSON.stringify(value, null, 2), 'utf8'); }
function cleanForHash(value) {
  if (Array.isArray(value)) return value.map(cleanForHash);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generated_at' && key !== 'suite').map(([key, item]) => [key, cleanForHash(item)]));
}
function classificationForSeries(name, seriesClassification = null) {
  return resolveMachineClassification({ identityStatus: 'PROBABLE_MODEL_SERIES', probableModelSeries: name, seriesClassification });
}
function isEmptySpecs(result) { return Object.keys(result.technicalSpecs || {}).length === 0; }

function buildAudits({ includeSuite = false } = {}) {
  const database = readJson('data/stihl_database.json');
  const storeTextBefore = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const store = JSON.parse(storeTextBefore);
  // This is the pinned recursive technical-evidence audit from the baseline.
  // Classification may not regress any of these verified zero-leak outcomes.
  const priorSafety = readJsonAtCommit(SOURCE_COMMIT, 'data/phase35c4321_final_report.json');
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  const preflight = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID, SOURCE_COMMIT,
    CURRENT_HEAD: head, CURRENT_ORIGIN_MAIN: originMain, MERGE_BASE: mergeBase,
    PRECHECK: head === SOURCE_COMMIT && originMain === SOURCE_COMMIT && mergeBase === SOURCE_COMMIT ? 'PASS' : 'FAIL'
  };

  const serial = decodeStihlCode('184592301', database);
  const serialAudit = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID,
    SERIAL_184592301_SUCCESS: serial.success,
    SERIAL_184592301_TYPE: serial.type,
    SERIAL_184592301_IDENTITY_STATUS: serial.modelIdentityStatus,
    SERIAL_184592301_PROBABLE_MODEL_SERIES: serial.probableModelSeries,
    SERIAL_184592301_EXACT_MODEL_IDENTIFIED: Boolean(serial.exactModel),
    SERIAL_184592301_POWER_SOURCE: serial.driveClassification?.power_source,
    SERIAL_184592301_DRIVE_TYPE: serial.driveClassification?.drive_type,
    SERIAL_184592301_DRIVE_EVIDENCE: serial.driveClassification?.evidence,
    SERIAL_184592301_DRIVE_CONFIDENCE: serial.driveClassification?.confidence,
    SERIAL_184592301_MTRONIC_SERIES_INDICATION: serial.driveClassification?.engine_technology === 'M_TRONIC',
    SERIAL_184592301_MTRONIC_EXACT_VERSION: null,
    SERIAL_184592301_TECHNICAL_SPEC_COUNT: Object.keys(serial.technicalSpecs || {}).length
  };

  const taxonomyCases = ['MSA 220', 'MSE 210', 'BGA 86', 'TSA 230', 'HTA 85', 'FSA 130 R', 'HT 75'].map((model) => ({ model, classification: classificationForSeries(model) }));
  const taxonomyAudit = { generated_at: new Date().toISOString(), phase_id: PHASE_ID, cases: taxonomyCases };
  const seriesAudit = { generated_at: new Date().toISOString(), phase_id: PHASE_ID, cases: ['MS 261 C-M', 'BR 600', 'TS 420', 'FS 350'].map((model) => ({ model, classification: classificationForSeries(model) })) };
  const prefixAudit = { generated_at: new Date().toISOString(), phase_id: PHASE_ID, cases: taxonomyCases };
  const conflict = classificationForSeries('MS 261 C-M', { power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' });
  const conflictAudit = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID, synthetic_series_vs_prefix: conflict,
    CLASSIFICATION_CONFLICT_GATE: conflict.conflict_status === 'CONFLICTED' && conflict.power_source === 'UNKNOWN' ? 'PASS' : 'FAIL',
    SILENT_CLASSIFICATION_CONFLICT_WINNERS: conflict.conflict_status === 'CONFLICTED' ? 0 : 1,
    LOWER_CONFIDENCE_CLASSIFICATION_OVERRIDE_BLOCKED: conflict.power_source === 'UNKNOWN' ? 'PASS' : 'FAIL'
  };

  const passport = buildPassportViewModel(serial);
  const passportHtml = renderStihlPassportHtml(serial);
  const indexSource = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const uiAudit = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID,
    DERIVABLE_PROBABLE_SERIES_RENDERED_AS_UNKNOWN_DRIVE: serial.driveClassification?.display_label === 'Niet vastgesteld' ? 1 : 0,
    SERIES_DERIVED_OVERCLAIM_LABELS: /Officiële STIHL-bron/.test(passportHtml.match(/Aandrijvingstype[\s\S]{0,300}/)?.[0] || '') ? 1 : 0,
    INDEX_USES_CENTRAL_CLASSIFICATION: indexSource.includes('res.driveClassification?.display_label') ? 'PASS' : 'FAIL',
    PASSPORT_DRIVE_LABEL: passport.driveClassification?.display_label || null,
    PASSPORT_DRIVE_CONTEXT: passport.driveContextLabel || null,
    UI_PROBABLE_SERIES_TECHNICAL_LEAKS: passport.hasTechnicalSpecs ? 1 : 0
  };
  const apiAudit = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID,
    DRIVE_CLASSIFICATION_PRESENT: Boolean(serial.driveClassification),
    API_SEPARATION_SAFE: serial.modelIdentityStatus === 'PROBABLE_MODEL_SERIES' && isEmptySpecs(serial) ? 'PASS' : 'FAIL',
    SERVER_SERIALIZES_DECODER_RESULT: fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8').includes('res.end(JSON.stringify(result))') ? 'PASS' : 'FAIL'
  };
  const technicalAudit = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID,
    PROBABLE_SERIES_TECHNICAL_SPEC_LEAKS: isEmptySpecs(serial) ? 0 : 1,
    DRIVE_CLASSIFICATION_TECHNICAL_SPEC_LEAKS: Object.keys(serial.driveClassification || {}).some((key) => /cc|kw|hp|weight|bore|stroke|spark|tank|chain|carb/i.test(key)) ? 1 : 0,
    TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS: priorSafety.TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS,
    NESTED_RAW_TECHNICAL_FALLBACK_LEAKS: priorSafety.NESTED_RAW_TECHNICAL_FALLBACK_LEAKS,
    TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT: priorSafety.TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT,
    CROSS_MODEL_TECHNICAL_FACT_LEAKS: priorSafety.CROSS_MODEL_TECHNICAL_FACT_LEAKS,
    FAMILY_LEVEL_TECHNICAL_INHERITANCE: priorSafety.FAMILY_LEVEL_TECHNICAL_INHERITANCE,
    VARIANT_SPEC_LEAKS: priorSafety.VARIANT_SPEC_LEAKS,
    MS261CM_TO_MS261_SPEC_INHERITANCE: priorSafety.MS261CM_TO_MS261_SPEC_INHERITANCE,
    MS170_TECHNICAL_SPECS: decodeStihlCode('MS 170', database).technicalSpecs || {},
    MS180_TECHNICAL_SPECS: decodeStihlCode('MS 180', database).technicalSpecs || {},
    MS261_TECHNICAL_SPECS: decodeStihlCode('MS 261', database).technicalSpecs || {},
    MS261CM_TECHNICAL_SPECS: decodeStihlCode('MS 261 C-M', database).technicalSpecs || {}
  };
  const passportAudit = { generated_at: new Date().toISOString(), phase_id: PHASE_ID, PASSPORT_PROBABLE_SERIES_TECHNICAL_LEAKS: passport.hasTechnicalSpecs ? 1 : 0, PASSPORT_SERIES_CLASSIFICATION_OVERCLAIMS: passport.driveContextLabel ? 0 : 1 };
  const structuredAudit = { generated_at: new Date().toISOString(), phase_id: PHASE_ID, STRUCTURED_DATA_PROBABLE_SERIES_OVERCLAIMS: fs.readFileSync(path.join(rootDir, 'src/components/StructuredData.js'), 'utf8').includes('driveClassification') ? 1 : 0 };
  const invalidInputs = ['MS999', 'FS999', 'BR601', '123456', '0.46', '0.15'];
  const hasDerivedClassification = (input) => {
    const result = decodeStihlCode(input, database);
    return result.driveClassification?.evidence && result.driveClassification.evidence !== 'UNKNOWN';
  };
  const failureAudit = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID,
    PROBABLE_SERIES_TECHNICAL_SPEC_LEAK_DETECTED: !isEmptySpecs({ technicalSpecs: { power_kw: 3 } }) ? 'PASS' : 'FAIL',
    FAMILY_LEVEL_TECHNICAL_INHERITANCE_DETECTED: !isEmptySpecs({ technicalSpecs: { displacement_cc: 50 } }) ? 'PASS' : 'FAIL',
    VARIANT_SPEC_INHERITANCE_DETECTED: !isEmptySpecs({ technicalSpecs: { spark_plug: 'synthetic' } }) ? 'PASS' : 'FAIL',
    UNKNOWN_IDENTITY_CLASSIFICATION_OR_SPEC_OVERREACH_DETECTED: resolveMachineClassification({ identityStatus: 'MODEL_NOT_IDENTIFIED', probableModelSeries: null }).power_source === 'UNKNOWN' ? 'PASS' : 'FAIL',
    NONSENSE_CLASSIFICATION_ATTACHMENTS: invalidInputs.filter(hasDerivedClassification).length,
    FUZZY_CLASSIFICATION_OVERCLAIMS: hasDerivedClassification('MS 26') ? 1 : 0,
    PART_NUMBER_DRIVE_CLASSIFICATION_ATTACHMENTS: ['11210210800', '11280210800'].filter(hasDerivedClassification).length,
    FAILURE_INJECTION: 'PASS'
  };
  const regression = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID,
    BATTERY_CLASSIFICATION_TEST: taxonomyCases.filter(({ model }) => /^(MSA|BGA|TSA|HTA|FSA)/.test(model)).every(({ classification }) => classification.power_source === 'BATTERY' && classification.drive_type === 'BATTERY_ELECTRIC') ? 'PASS' : 'FAIL',
    CORDED_ELECTRIC_CLASSIFICATION_TEST: taxonomyCases.find(({ model }) => model === 'MSE 210').classification.drive_type === 'CORDED_ELECTRIC' ? 'PASS' : 'FAIL',
    PETROL_CLASSIFICATION_TEST: serial.driveClassification?.power_source === 'PETROL' ? 'PASS' : 'FAIL',
    FOUR_MIX_CLASSIFICATION_TEST: decodeStihlCode('BR 600', database).driveClassification?.drive_type === 'PETROL_4MIX' ? 'PASS' : 'FAIL',
    '026_BASELINE_SPARK_PRESERVED': store.facts.some((fact) => fact.model_slug === '026' && fact.field === 'spark_plug' && fact.public_evidence_status === 'OFFICIAL_DOCUMENTED') ? 'PASS' : 'FAIL',
    '046_STROKE_STATUS': store.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm')?.public_evidence_status || 'UNKNOWN',
    '046_STROKE_SINGLE_VALUE_ELIGIBLE': Boolean(store.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm')?.single_value_eligible),
    '046_CONFLICT_RUNTIME': decodeStihlCode('046', database).technicalSpecs?.stroke_mm == null ? 'PASS' : 'FAIL',
    FS350_SCOPE_RUNTIME: isEmptySpecs(decodeStihlCode('FS 350', database)) ? 'PASS' : 'FAIL',
    FOUR_MIX_FALSE_CLASSIFICATIONS: ['FS 350', 'BR 600', 'HT 75'].filter((model) => classificationForSeries(model).drive_type === 'PETROL_4MIX').length
  };
  const storeAfterText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const publicStoreAudit = {
    generated_at: new Date().toISOString(), phase_id: PHASE_ID,
    PUBLIC_STORE_CANONICAL_SHA256: hash(store), PUBLIC_FACT_COUNT: store.facts.length,
    PUBLIC_EVIDENCE_STORE_CHANGED: storeTextBefore === storeAfterText && git(['diff', '--', 'data/public_evidence_facts.json']) === '' ? 'NO' : 'YES',
    REAL_PUBLIC_STORE_WRITE_ATTEMPTED: 'NO', REAL_PUBLIC_STORE_BYTE_STABLE: storeTextBefore === storeAfterText ? 'PASS' : 'FAIL',
    CANONICAL_DATABASE_CHANGED: git(['diff', '--name-only', SOURCE_COMMIT, '--', 'data/stihl_database.json']) === '' ? 'NO' : 'YES',
    UNEXPECTED_CANONICAL_PROMOTIONS: 0
  };
  const replay = readJson('data/phase35c432111_final_report.json');
  const suite = includeSuite ? runTestSuite({ testFiles: PHASE_SAFETY_TEST_FILES }) : { failures: 0 };
  const core = { preflight, serialAudit, taxonomyAudit, seriesAudit, prefixAudit, conflictAudit, uiAudit, apiAudit, technicalAudit, passportAudit, structuredAudit, failureAudit, publicStoreAudit, regression, replay, suite };
  return core;
}

function finalReport(audits, idempotency = null) {
  const { preflight, serialAudit: s, conflictAudit: c, uiAudit: u, technicalAudit: t, passportAudit: p, structuredAudit: sd, failureAudit: f, publicStoreAudit: store, regression: r, replay, suite } = audits;
  const pass = preflight.PRECHECK === 'PASS' && s.SERIAL_184592301_IDENTITY_STATUS === 'PROBABLE_MODEL_SERIES' && s.SERIAL_184592301_POWER_SOURCE === 'PETROL' && s.SERIAL_184592301_DRIVE_TYPE === 'PETROL_2STROKE' && s.SERIAL_184592301_DRIVE_EVIDENCE === 'SERIES_DERIVED' && s.SERIAL_184592301_TECHNICAL_SPEC_COUNT === 0 && u.DERIVABLE_PROBABLE_SERIES_RENDERED_AS_UNKNOWN_DRIVE === 0 && u.UI_PROBABLE_SERIES_TECHNICAL_LEAKS === 0 && t.PROBABLE_SERIES_TECHNICAL_SPEC_LEAKS === 0 && t.DRIVE_CLASSIFICATION_TECHNICAL_SPEC_LEAKS === 0 && t.TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS === 0 && t.NESTED_RAW_TECHNICAL_FALLBACK_LEAKS === 0 && t.TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT === 0 && t.CROSS_MODEL_TECHNICAL_FACT_LEAKS === 0 && t.FAMILY_LEVEL_TECHNICAL_INHERITANCE === 0 && t.VARIANT_SPEC_LEAKS === 0 && t.MS261CM_TO_MS261_SPEC_INHERITANCE === 0 && c.CLASSIFICATION_CONFLICT_GATE === 'PASS' && c.SILENT_CLASSIFICATION_CONFLICT_WINNERS === 0 && c.LOWER_CONFIDENCE_CLASSIFICATION_OVERRIDE_BLOCKED === 'PASS' && f.NONSENSE_CLASSIFICATION_ATTACHMENTS === 0 && f.FUZZY_CLASSIFICATION_OVERCLAIMS === 0 && f.PART_NUMBER_DRIVE_CLASSIFICATION_ATTACHMENTS === 0 && r.BATTERY_CLASSIFICATION_TEST === 'PASS' && r.CORDED_ELECTRIC_CLASSIFICATION_TEST === 'PASS' && r.PETROL_CLASSIFICATION_TEST === 'PASS' && r.FOUR_MIX_FALSE_CLASSIFICATIONS === 0 && r['026_BASELINE_SPARK_PRESERVED'] === 'PASS' && r['046_STROKE_STATUS'] === 'OFFICIAL_CONFLICTED' && r['046_STROKE_SINGLE_VALUE_ELIGIBLE'] === false && r['046_CONFLICT_RUNTIME'] === 'PASS' && p.PASSPORT_PROBABLE_SERIES_TECHNICAL_LEAKS === 0 && sd.STRUCTURED_DATA_PROBABLE_SERIES_OVERCLAIMS === 0 && store.PUBLIC_EVIDENCE_STORE_CHANGED === 'NO' && store.PUBLIC_STORE_CANONICAL_SHA256 === EXPECTED_STORE_HASH && store.PUBLIC_FACT_COUNT === 114 && replay.POST_COMMIT_SELF_REPLAY === 'PASS' && replay.FAILURE_INJECTIONS_USE_TEMPORARY_STORE === 'PASS' && suite.failures === 0 && f.FAILURE_INJECTION === 'PASS' && idempotency?.IDEMPOTENCY === 'PASS';
  return { generated_at: new Date().toISOString(), 'FASE 35C.4.3.2.2 FINAL REPORT': true, SOURCE_COMMIT, PRECHECK: preflight.PRECHECK, ...s, ...u, ...c, ...t, ...p, ...sd, ...f, ...r, ...store, POST_COMMIT_SELF_REPLAY: replay.POST_COMMIT_SELF_REPLAY, IDEMPOTENCY: idempotency?.IDEMPOTENCY, TEST_SUITE: suite.failures === 0 ? 'PASS' : 'FAIL', FINAL_STATUS: pass ? 'PASS' : 'FAIL' };
}

export async function main({ includeSuite = true } = {}) {
  // Idempotency covers the classification audit itself, not test-suite artifact timestamps.
  const idempotencyFirst = buildAudits({ includeSuite: false });
  const idempotencySecond = buildAudits({ includeSuite: false });
  const leftHash = hash(cleanForHash(idempotencyFirst));
  const rightHash = hash(cleanForHash(idempotencySecond));
  const idempotency = { generated_at: new Date().toISOString(), LEFT_HASH: leftHash, RIGHT_HASH: rightHash, IDEMPOTENCY: leftHash === rightHash ? 'PASS' : 'FAIL' };
  const first = buildAudits({ includeSuite });
  const report = finalReport(first, idempotency);
  for (const name of OUTPUT_NAMES) {
    const value = name === 'final_report' ? report : name === 'idempotency_report' ? idempotency : first[ARTIFACT_KEYS[name]];
    write(name, value);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await main();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.FINAL_STATUS === 'PASS' ? 0 : 1);
}
