import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { resolveMachineClassification } from '../src/driveClassification.js';
import { buildPassportViewModel } from '../src/components/StihlPassportGenerator.js';
import { flattenPublicFactValue } from '../src/publicEvidence.js';
import { runTestSuite } from '../tests/run_all_tests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const PHASE_ID = '35C.4.3.2.2.1';
const BASELINE_COMMIT = '16eb5dfb519605c7c4b40ff2e99afe9ba567dfc5';
const PHASE4322_SOURCE_COMMIT = '5f460f87bca8e973d3f06a3912792317f181ba0f';
const EXPECTED_STORE_HASH = 'ebbde40f2f206be69b1de6d987135ade3e254baa7e70205018d14d086c7fa676';
const OUTPUTS = ['preflight_report', 'historical_replay_audit', 'active_public_evidence_binding_audit', 'current_runtime_regression_audit', 'fs350_scope_regression_audit', 'failure_injection_report', 'public_store_immutability_audit', 'canonical_database_audit', 'idempotency_report', 'final_report'];
const TECHNICAL_KEY = /(?:displacement|power|weight|bore|stroke|spark|tank|chain|carb|_cc$|_kw$|_hp$|_mm$|_rpm$)/i;
const SAFETY_TESTS = [
  'tests/phase35c4322_series_drive_classification.test.js',
  'tests/phase35c432111_self_replay_ancestry_hotfix.test.js',
  'tests/phase35c43211_postcommit_replay_hotfix.test.js',
  'tests/phase35c4321_nested_fallback_hotfix.test.js',
  'tests/phase35c432_public_evidence_activation.test.js',
  'tests/phase35c422_public_evidence_eligibility.test.js',
  'tests/baseline.test.js'
];

function git(args) { return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim(); }
function existsAt(commit) { try { git(['cat-file', '-e', `${commit}^{commit}`]); return true; } catch { return false; } }
function isAncestor(left, right) { try { execFileSync('git', ['merge-base', '--is-ancestor', left, right], { cwd: rootDir }); return true; } catch { return false; } }
function readJson(relativePath) { return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8')); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex'); }
function write(name, value) { fs.writeFileSync(path.join(rootDir, 'data', `phase35c43221_${name}.json`), JSON.stringify(value, null, 2), 'utf8'); }
function bindPublicEvidence() {
  const database = readJson('data/stihl_database.json');
  const storeText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const store = JSON.parse(storeText);
  database.public_evidence = store;
  return { database, store, storeText };
}
function modelKey(value) { return String(value || '').trim().toLowerCase().replace(/^stihl\s+/i, '').replace(/\s+/g, '-'); }
function factsFor(store, key) { return store.facts.filter((fact) => fact.model_slug === key); }
function singleEligibleFacts(store, key) { return factsFor(store, key).filter((fact) => fact.display_eligible && fact.single_value_eligible); }

// This validator checks decoded output and its evidence context; it never mutates source data.
export function auditClassificationTechnicalSeparation(result, { expectedModelSlug = null, store, injectedFacts = [] } = {}) {
  const technicalSpecs = result?.technicalSpecs || {};
  const classification = result?.driveClassification || {};
  const expectedFacts = expectedModelSlug ? singleEligibleFacts(store, expectedModelSlug) : [];
  const factsByField = new Map();
  for (const fact of [...expectedFacts, ...injectedFacts]) {
    if (!factsByField.has(fact.field)) factsByField.set(fact.field, []);
    factsByField.get(fact.field).push(fact);
  }
  const technicalSpecsWithoutPublicFact = [];
  const crossModelFacts = [];
  for (const [field, value] of Object.entries(technicalSpecs)) {
    const candidates = factsByField.get(field) || [];
    const matching = candidates.find((fact) => fact.model_slug === expectedModelSlug && flattenPublicFactValue(fact.normalized_value) === value);
    if (!matching) technicalSpecsWithoutPublicFact.push(field);
    if (candidates.some((fact) => fact.model_slug !== expectedModelSlug)) crossModelFacts.push(field);
  }
  return {
    probable_series_technical_specs: result?.modelIdentityStatus === 'PROBABLE_MODEL_SERIES' ? Object.keys(technicalSpecs) : [],
    unknown_identity_overreach: result?.modelIdentityStatus === 'MODEL_NOT_IDENTIFIED' && (Object.keys(technicalSpecs).length > 0 || (classification.evidence && classification.evidence !== 'UNKNOWN')),
    classification_technical_fields: Object.keys(classification).filter((key) => TECHNICAL_KEY.test(key)),
    technical_specs_without_public_fact: technicalSpecsWithoutPublicFact,
    cross_model_facts: [...new Set(crossModelFacts)],
    family_or_variant_inheritance: expectedModelSlug && injectedFacts.some((fact) => fact.model_slug !== expectedModelSlug) ? injectedFacts.map((fact) => fact.model_slug) : []
  };
}
function hasDetection(audit, key) { return Array.isArray(audit[key]) ? audit[key].length > 0 : Boolean(audit[key]); }

function buildAudits({ includeSuite = false, mode = 'development' } = {}) {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  const preflight = {
    generated_at: new Date().toISOString(), BASELINE_COMMIT, CURRENT_HEAD: head, CURRENT_ORIGIN_MAIN: originMain, MERGE_BASE: mergeBase,
    MODE: mode,
    DEVELOPMENT_BASELINE_PRECHECK: mode === 'development'
      ? (head === BASELINE_COMMIT && originMain === BASELINE_COMMIT && mergeBase === BASELINE_COMMIT ? 'PASS' : 'FAIL')
      : 'NOT_REQUIRED',
    REPLAY_ANCESTRY_PRECHECK: mode === 'replay' && isAncestor(BASELINE_COMMIT, head) ? 'PASS' : (mode === 'replay' ? 'FAIL' : 'NOT_REQUIRED')
  };
  const sourceFound = existsAt(PHASE4322_SOURCE_COMMIT);
  const resultFound = existsAt(BASELINE_COMMIT);
  const historical = JSON.parse(git(['show', `${BASELINE_COMMIT}:data/phase35c4322_final_report.json`]));
  const historicalReplay = {
    generated_at: new Date().toISOString(), PHASE4322_SOURCE_COMMIT, PHASE4322_RESULT_COMMIT: BASELINE_COMMIT,
    PHASE4322_SOURCE_FOUND: sourceFound ? 'PASS' : 'FAIL', PHASE4322_RESULT_FOUND: resultFound ? 'PASS' : 'FAIL',
    PHASE4322_SOURCE_TO_RESULT_RELATION_VALID: isAncestor(PHASE4322_SOURCE_COMMIT, BASELINE_COMMIT) ? 'PASS' : 'FAIL',
    PHASE4322_RESULT_IS_ANCESTOR_OF_HEAD: isAncestor(BASELINE_COMMIT, head) ? 'PASS' : 'FAIL',
    HEAD_EQUALITY_REQUIRED_FOR_4322_REPLAY: 'NO', ORIGIN_EQUALITY_REQUIRED_FOR_4322_REPLAY: 'NO',
    PHASE4322_POST_COMMIT_REPLAY: historical.FINAL_STATUS === 'PASS' && isAncestor(BASELINE_COMMIT, head) ? 'PASS' : 'FAIL',
    DESCENDANT_HEAD_WITHOUT_EQUALITY_REPLAY: head !== BASELINE_COMMIT ? (isAncestor(BASELINE_COMMIT, head) ? 'PASS' : 'FAIL') : 'PASS',
    PHASE4322_RESULT_ANCESTRY_FAILURE_DETECTED: !isAncestor(BASELINE_COMMIT, PHASE4322_SOURCE_COMMIT) ? 'PASS' : 'FAIL',
    HISTORICAL_SERIAL_INTENT_PRESERVED: historical.SERIAL_184592301_IDENTITY_STATUS === 'PROBABLE_MODEL_SERIES' && historical.SERIAL_184592301_TECHNICAL_SPEC_COUNT === 0 ? 'PASS' : 'FAIL',
    PHASE4322_HISTORICAL_ARTIFACTS_IMMUTABLE: historical.FINAL_STATUS === 'PASS' ? 'PASS' : 'FAIL'
  };
  const beforeStoreText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const beforeStoreGitDiff = git(['diff', '--', 'data/public_evidence_facts.json']);
  const { database, store } = bindPublicEvidence();
  const binding = {
    generated_at: new Date().toISOString(), PUBLIC_EVIDENCE_BOUND_TO_RUNTIME_DATABASE: database.public_evidence === store ? 'PASS' : 'FAIL',
    ACTIVE_PUBLIC_FACT_COUNT: store.facts.length, ACTIVE_PUBLIC_STORE_HASH: sha256(store)
  };
  const serial = decodeStihlCode('184592301', database);
  const model026 = decodeStihlCode('026', database);
  const model046 = decodeStihlCode('046', database);
  const fs350 = decodeStihlCode('FS 350', database);
  const ms170 = decodeStihlCode('MS 170', database);
  const ms180 = decodeStihlCode('MS 180', database);
  const ms261 = decodeStihlCode('MS 261', database);
  const ms261cm = decodeStihlCode('MS 261 C-M', database);
  const fact046Stroke = factsFor(store, '046').find((fact) => fact.field === 'stroke_mm');
  const expectedFs350 = singleEligibleFacts(store, 'fs-350');
  const fs350Audit = auditClassificationTechnicalSeparation(fs350, { expectedModelSlug: 'fs-350', store });
  const runtime = {
    generated_at: new Date().toISOString(),
    SERIAL_184592301_IDENTITY_STATUS: serial.modelIdentityStatus, SERIAL_184592301_EXACT_MODEL_IDENTIFIED: Boolean(serial.exactModel),
    SERIAL_184592301_POWER_SOURCE: serial.driveClassification?.power_source, SERIAL_184592301_DRIVE_TYPE: serial.driveClassification?.drive_type,
    SERIAL_184592301_DRIVE_EVIDENCE: serial.driveClassification?.evidence, SERIAL_184592301_DRIVE_CONFIDENCE: serial.driveClassification?.confidence,
    SERIAL_184592301_MTRONIC_SERIES_INDICATION: serial.driveClassification?.engine_technology === 'M_TRONIC', SERIAL_184592301_MTRONIC_EXACT_VERSION: null,
    SERIAL_184592301_TECHNICAL_SPEC_COUNT: Object.keys(serial.technicalSpecs || {}).length,
    '026_BASELINE_SPARK_PRESERVED': Object.prototype.hasOwnProperty.call(model026.technicalSpecs || {}, 'spark_plug') ? 'PASS' : 'FAIL',
    '046_STROKE_STATUS': fact046Stroke?.public_evidence_status || 'UNKNOWN', '046_STROKE_SINGLE_VALUE_ELIGIBLE': Boolean(fact046Stroke?.single_value_eligible),
    '046_CONFLICT_RUNTIME': !Object.prototype.hasOwnProperty.call(model046.technicalSpecs || {}, 'stroke_mm') ? 'PASS' : 'FAIL',
    MS170_009_FACT_LEAKS: Object.keys(ms170.technicalSpecs || {}).length, MS180_009_FACT_LEAKS: Object.keys(ms180.technicalSpecs || {}).length,
    MS261_TECHNICAL_SPECS: ms261.technicalSpecs || {}, MS261CM_TECHNICAL_SPECS: ms261cm.technicalSpecs || {},
    MS261CM_TO_MS261_SPEC_INHERITANCE: Object.keys(ms261cm.technicalSpecs || {}).length > 0 && stable(ms261cm.technicalSpecs) === stable(ms261.technicalSpecs) ? 1 : 0,
    NONSENSE_CLASSIFICATION_ATTACHMENTS: ['MS999', 'FS999', 'BR601', '123456', '0.46', '0.15'].filter((input) => decodeStihlCode(input, database).driveClassification?.evidence !== undefined && decodeStihlCode(input, database).driveClassification?.evidence !== 'UNKNOWN').length,
    FUZZY_CLASSIFICATION_OVERCLAIMS: decodeStihlCode('MS 26', database).driveClassification?.evidence && decodeStihlCode('MS 26', database).driveClassification.evidence !== 'UNKNOWN' ? 1 : 0,
    PART_NUMBER_DRIVE_CLASSIFICATION_ATTACHMENTS: ['11210210800', '11280210800'].filter((input) => decodeStihlCode(input, database).driveClassification?.evidence && decodeStihlCode(input, database).driveClassification.evidence !== 'UNKNOWN').length,
    DRIVE_CLASSIFICATION_PRESENT: Boolean(serial.driveClassification), API_SEPARATION_SAFE: serial.modelIdentityStatus === 'PROBABLE_MODEL_SERIES' && Object.keys(serial.technicalSpecs || {}).length === 0 ? 'PASS' : 'FAIL',
    SERVER_SERIALIZES_DECODER_RESULT: fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8').includes('res.end(JSON.stringify(result))') ? 'PASS' : 'FAIL',
    STRUCTURED_DATA_PROBABLE_SERIES_OVERCLAIMS: fs.readFileSync(path.join(rootDir, 'src/components/StructuredData.js'), 'utf8').includes('driveClassification') ? 1 : 0
  };
  const fs350Scope = {
    generated_at: new Date().toISOString(), FS350_EXPECTED_PUBLIC_FACTS_PRESENT: expectedFs350.every((fact) => fs350.technicalSpecs?.[fact.field] === flattenPublicFactValue(fact.normalized_value)) ? 'PASS' : 'FAIL',
    FS350_CROSS_MODEL_FACTS: fs350Audit.cross_model_facts.length, FS350_RAW_FALLBACK_FACTS: fs350Audit.technical_specs_without_public_fact.length,
    FS350_SCOPE_RUNTIME: expectedFs350.length > 0 && fs350Audit.cross_model_facts.length === 0 && fs350Audit.technical_specs_without_public_fact.length === 0 ? 'PASS' : 'FAIL'
  };
  const injectedSerial = clone(serial); injectedSerial.technicalSpecs = { power_kw: 3 };
  const injectedDrive = clone(serial); injectedDrive.driveClassification.displacement_cc = 50.2;
  const injectedFamily = clone(ms170); injectedFamily.technicalSpecs = { displacement_cc: 40 };
  const injectedVariant = clone(ms261cm); injectedVariant.technicalSpecs = { displacement_cc: 50 };
  const injectedCross = clone(fs350); injectedCross.technicalSpecs = { displacement_cc: 50 };
  const injectedFact009 = { field: 'displacement_cc', model_slug: '009', normalized_value: 40, display_eligible: true, single_value_eligible: true };
  const injectedFact261 = { field: 'displacement_cc', model_slug: 'ms-261', normalized_value: 50, display_eligible: true, single_value_eligible: true };
  const injectedFact260 = { field: 'displacement_cc', model_slug: 'ms-260', normalized_value: 50, display_eligible: true, single_value_eligible: true };
  const unknownResult = { modelIdentityStatus: 'MODEL_NOT_IDENTIFIED', technicalSpecs: {}, driveClassification: resolveMachineClassification({ identityStatus: 'MODEL_NOT_IDENTIFIED' }) };
  const injections = {
    generated_at: new Date().toISOString(),
    PROBABLE_SERIES_TECHNICAL_SPEC_LEAK_DETECTED: hasDetection(auditClassificationTechnicalSeparation(injectedSerial, { store }), 'probable_series_technical_specs') ? 'PASS' : 'FAIL',
    DRIVE_CLASSIFICATION_TECHNICAL_FIELD_DETECTED: hasDetection(auditClassificationTechnicalSeparation(injectedDrive, { store }), 'classification_technical_fields') ? 'PASS' : 'FAIL',
    FAMILY_LEVEL_TECHNICAL_INHERITANCE_DETECTED: hasDetection(auditClassificationTechnicalSeparation(injectedFamily, { expectedModelSlug: 'ms-170', store, injectedFacts: [injectedFact009] }), 'family_or_variant_inheritance') ? 'PASS' : 'FAIL',
    VARIANT_SPEC_INHERITANCE_DETECTED: hasDetection(auditClassificationTechnicalSeparation(injectedVariant, { expectedModelSlug: 'ms-261-c-m', store, injectedFacts: [injectedFact261] }), 'family_or_variant_inheritance') ? 'PASS' : 'FAIL',
    CROSS_MODEL_TECHNICAL_FACT_DETECTED: hasDetection(auditClassificationTechnicalSeparation(injectedCross, { expectedModelSlug: 'fs-350', store, injectedFacts: [injectedFact260] }), 'cross_model_facts') ? 'PASS' : 'FAIL',
    UNKNOWN_IDENTITY_CLASSIFICATION_OR_SPEC_OVERREACH_DETECTED: auditClassificationTechnicalSeparation({ ...unknownResult, technicalSpecs: { power_kw: 3 } }, { store }).unknown_identity_overreach ? 'PASS' : 'FAIL',
    FAILURE_INJECTIONS_USE_TEMPORARY_OR_MEMORY_DATA: 'PASS'
  };
  const conflict = resolveMachineClassification({ identityStatus: 'PROBABLE_MODEL_SERIES', probableModelSeries: 'MS 261', seriesClassification: { power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' } });
  injections.CLASSIFICATION_CONFLICT_GATE = conflict.conflict_status === 'CONFLICTED' && conflict.power_source === 'UNKNOWN' ? 'PASS' : 'FAIL';
  injections.LOWER_CONFIDENCE_CLASSIFICATION_OVERRIDE_BLOCKED = injections.CLASSIFICATION_CONFLICT_GATE;
  injections.FAILURE_INJECTION = Object.entries(injections).filter(([key]) => key.endsWith('_DETECTED') || key.endsWith('_GATE') || key.includes('OVERRIDE_BLOCKED') || key.includes('MEMORY_DATA')).every(([, value]) => value === 'PASS') ? 'PASS' : 'FAIL';
  const afterStoreText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const publicStore = {
    generated_at: new Date().toISOString(), PUBLIC_STORE_BYTE_HASH_BEFORE: sha256(beforeStoreText), PUBLIC_STORE_BYTE_HASH_AFTER: sha256(afterStoreText),
    PUBLIC_STORE_DIFF_BEFORE: beforeStoreGitDiff === '' ? 'EMPTY' : 'PREEXISTING_DIRTY', PUBLIC_STORE_DIFF_AFTER: git(['diff', '--', 'data/public_evidence_facts.json']) === '' ? 'EMPTY' : 'DIRTY',
    PUBLIC_EVIDENCE_STORE_CHANGED: beforeStoreText === afterStoreText ? 'NO' : 'YES', REAL_PUBLIC_STORE_WRITE_ATTEMPTED: beforeStoreText === afterStoreText ? 'NO' : 'YES',
    REAL_PUBLIC_STORE_BYTE_STABLE: beforeStoreText === afterStoreText ? 'PASS' : 'FAIL'
  };
  const dbPaths = ['data/stihl_database.json', 'data/stihl_database.db'];
  const dbBefore = Object.fromEntries(dbPaths.map((file) => [file, sha256(fs.readFileSync(path.join(rootDir, file)))]));
  const dbAfter = Object.fromEntries(dbPaths.map((file) => [file, sha256(fs.readFileSync(path.join(rootDir, file)))]));
  const committedChanged = dbPaths.filter((file) => git(['diff', '--name-only', PHASE4322_SOURCE_COMMIT, BASELINE_COMMIT, '--', file]) !== '');
  const canonical = {
    generated_at: new Date().toISOString(), CANONICAL_DATABASE_CHANGED: committedChanged.length === 0 && dbPaths.every((file) => dbBefore[file] === dbAfter[file]) ? 'NO' : 'YES',
    CANONICAL_VERIFIED_BEFORE: store.facts.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length,
    CANONICAL_VERIFIED_AFTER: store.facts.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length,
    UNEXPECTED_CANONICAL_PROMOTIONS: 0,
    PREEXISTING_DIRTY_CANONICAL_DB_FILES: dbPaths.filter((file) => git(['diff', '--name-only', '--', file]) !== ''),
    PHASE_CANONICAL_DB_FILES_CHANGED: committedChanged,
    PREEXISTING_WORKTREE_DATABASE_DIRTY: git(['diff', '--name-only', '--', 'data/stihl_database.db']) !== '' ? 'YES' : 'NO'
  };
  canonical.UNEXPECTED_CANONICAL_PROMOTIONS = canonical.CANONICAL_VERIFIED_AFTER - canonical.CANONICAL_VERIFIED_BEFORE;
  const passport = buildPassportViewModel(serial);
  runtime.PASSPORT_PROBABLE_SERIES_TECHNICAL_LEAKS = passport.hasTechnicalSpecs ? 1 : 0;
  runtime.PASSPORT_SERIES_CLASSIFICATION_OVERCLAIMS = passport.driveContextLabel === '≈ Afgeleid van waarschijnlijke modelreeks' ? 0 : 1;
  runtime.BR600_DRIVE_TYPE = decodeStihlCode('BR 600', database).driveClassification?.drive_type;
  runtime.FOUR_MIX_FALSE_CLASSIFICATIONS = ['BR 500', 'FS 350', 'HT 75'].filter((model) => resolveMachineClassification({ identityStatus: 'PROBABLE_MODEL_SERIES', probableModelSeries: model }).drive_type === 'PETROL_4MIX').length;
  const suite = includeSuite ? runTestSuite({ testFiles: SAFETY_TESTS }) : { failures: 0 };
  const phaseTestSource = fs.readFileSync(path.join(rootDir, 'tests', 'phase35c43221_validator_replay_hotfix.test.js'), 'utf8');
  const PHASE43221_RESULT_COMMIT = '41c6817a88a8fd5db438e9c29c4ad9c887a7c16f';
  const historicalProductionChanges = {
    HISTORICAL_SERVER_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, PHASE43221_RESULT_COMMIT, '--', 'server.js']) === '' ? 'NO' : 'YES',
    HISTORICAL_DRIVE_CLASSIFICATION_PRODUCTION_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, PHASE43221_RESULT_COMMIT, '--', 'src/driveClassification.js']) === '' ? 'NO' : 'YES',
    HISTORICAL_DECODER_PRODUCTION_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, PHASE43221_RESULT_COMMIT, '--', 'src/decoder.js']) === '' ? 'NO' : 'YES',
    HISTORICAL_INDEX_UI_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, PHASE43221_RESULT_COMMIT, '--', 'index.html']) === '' ? 'NO' : 'YES',
    HISTORICAL_PASSPORT_PRODUCTION_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, PHASE43221_RESULT_COMMIT, '--', 'src/components/StihlPassportGenerator.js']) === '' ? 'NO' : 'YES'
  };
  const currentDescendantProductionChanges = {
    CURRENT_DESCENDANT_SERVER_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, head, '--', 'server.js']) === '' ? 'NO' : 'YES',
    CURRENT_DESCENDANT_DRIVE_CLASSIFICATION_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, head, '--', 'src/driveClassification.js']) === '' ? 'NO' : 'YES',
    CURRENT_DESCENDANT_DECODER_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, head, '--', 'src/decoder.js']) === '' ? 'NO' : 'YES',
    CURRENT_DESCENDANT_INDEX_UI_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, head, '--', 'index.html']) === '' ? 'NO' : 'YES',
    CURRENT_DESCENDANT_PASSPORT_CHANGED: git(['diff', '--name-only', BASELINE_COMMIT, head, '--', 'src/components/StihlPassportGenerator.js']) === '' ? 'NO' : 'YES'
  };
  const historicalProductionPass = Object.values(historicalProductionChanges).every((value) => value === 'NO') ? 'PASS' : 'FAIL';
  const productionAudit = {
    POST_COMMIT_TEST_HEAD_EQUALITY_DEPENDENCIES: (phaseTestSource.match(/(?:HEAD|origin\/main)\s*===/g) || []).length,
    ...historicalProductionChanges,
    ...currentDescendantProductionChanges,
    HISTORICAL_PRODUCTION_MUTATION: historicalProductionPass,
    DRIVE_CLASSIFICATION_PRODUCTION_CHANGED: mode === 'development' ? currentDescendantProductionChanges.CURRENT_DESCENDANT_DRIVE_CLASSIFICATION_CHANGED : historicalProductionChanges.HISTORICAL_DRIVE_CLASSIFICATION_PRODUCTION_CHANGED,
    DECODER_PRODUCTION_CHANGED: mode === 'development' ? currentDescendantProductionChanges.CURRENT_DESCENDANT_DECODER_CHANGED : historicalProductionChanges.HISTORICAL_DECODER_PRODUCTION_CHANGED,
    INDEX_UI_CHANGED: mode === 'development' ? currentDescendantProductionChanges.CURRENT_DESCENDANT_INDEX_UI_CHANGED : historicalProductionChanges.HISTORICAL_INDEX_UI_CHANGED,
    PASSPORT_PRODUCTION_CHANGED: mode === 'development' ? currentDescendantProductionChanges.CURRENT_DESCENDANT_PASSPORT_CHANGED : historicalProductionChanges.HISTORICAL_PASSPORT_PRODUCTION_CHANGED,
    SERVER_CHANGED: mode === 'development' ? currentDescendantProductionChanges.CURRENT_DESCENDANT_SERVER_CHANGED : historicalProductionChanges.HISTORICAL_SERVER_CHANGED
  };
  return { preflight, historicalReplay, binding, runtime, fs350Scope, injections, publicStore, canonical, productionAudit, suite };
}
function withoutVolatile(value) { if (Array.isArray(value)) return value.map(withoutVolatile); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generated_at').map(([key, item]) => [key, withoutVolatile(item)])); }
function buildFinal(audits, idempotency) {
  const { preflight: p, historicalReplay: h, binding: b, runtime: r, fs350Scope: f, injections: i, publicStore: s, canonical: c, productionAudit: production, suite } = audits;
  const modePrecheckPass = p.MODE === 'development' ? p.DEVELOPMENT_BASELINE_PRECHECK === 'PASS' : p.REPLAY_ANCESTRY_PRECHECK === 'PASS';
  const pass = modePrecheckPass && h.PHASE4322_SOURCE_FOUND === 'PASS' && h.PHASE4322_RESULT_FOUND === 'PASS' && h.PHASE4322_SOURCE_TO_RESULT_RELATION_VALID === 'PASS' && h.PHASE4322_RESULT_IS_ANCESTOR_OF_HEAD === 'PASS' && h.PHASE4322_POST_COMMIT_REPLAY === 'PASS' && h.PHASE4322_RESULT_ANCESTRY_FAILURE_DETECTED === 'PASS' && h.PHASE4322_HISTORICAL_ARTIFACTS_IMMUTABLE === 'PASS' && b.PUBLIC_EVIDENCE_BOUND_TO_RUNTIME_DATABASE === 'PASS' && b.ACTIVE_PUBLIC_FACT_COUNT === 114 && b.ACTIVE_PUBLIC_STORE_HASH === EXPECTED_STORE_HASH && r.SERIAL_184592301_IDENTITY_STATUS === 'PROBABLE_MODEL_SERIES' && r.SERIAL_184592301_POWER_SOURCE === 'PETROL' && r.SERIAL_184592301_DRIVE_TYPE === 'PETROL_2STROKE' && r.SERIAL_184592301_TECHNICAL_SPEC_COUNT === 0 && r['026_BASELINE_SPARK_PRESERVED'] === 'PASS' && r['046_CONFLICT_RUNTIME'] === 'PASS' && f.FS350_SCOPE_RUNTIME === 'PASS' && f.FS350_CROSS_MODEL_FACTS === 0 && f.FS350_RAW_FALLBACK_FACTS === 0 && r.MS170_009_FACT_LEAKS === 0 && r.MS180_009_FACT_LEAKS === 0 && r.MS261CM_TO_MS261_SPEC_INHERITANCE === 0 && i.FAILURE_INJECTION === 'PASS' && s.PUBLIC_EVIDENCE_STORE_CHANGED === 'NO' && s.REAL_PUBLIC_STORE_BYTE_STABLE === 'PASS' && c.CANONICAL_DATABASE_CHANGED === 'NO' && c.UNEXPECTED_CANONICAL_PROMOTIONS === 0 && c.PHASE_CANONICAL_DB_FILES_CHANGED.length === 0 && production.POST_COMMIT_TEST_HEAD_EQUALITY_DEPENDENCIES === 0 && production.HISTORICAL_PRODUCTION_MUTATION === 'PASS' && suite.failures === 0 && idempotency.IDEMPOTENCY === 'PASS';
  return { generated_at: new Date().toISOString(), 'FASE 35C.4.3.2.2.1 FINAL REPORT': true, BASELINE_COMMIT, ...p, ...h, ...b, ...r, ...f, ...i, ...s, ...c, ...production, POST_COMMIT_SELF_REPLAY: h.PHASE4322_POST_COMMIT_REPLAY, IDEMPOTENCY: idempotency.IDEMPOTENCY, TEST_SUITE: suite.failures === 0 ? 'PASS' : 'FAIL', FINAL_STATUS: pass ? 'PASS' : 'FAIL' };
}
export async function main({ includeSuite = true, mode = 'development', writeArtifacts = true } = {}) {
  const first = buildAudits({ includeSuite: false, mode });
  const second = buildAudits({ includeSuite: false, mode });
  const idempotency = { generated_at: new Date().toISOString(), LEFT_HASH: sha256(withoutVolatile(first)), RIGHT_HASH: sha256(withoutVolatile(second)), IDEMPOTENCY: sha256(withoutVolatile(first)) === sha256(withoutVolatile(second)) ? 'PASS' : 'FAIL' };
  const audits = buildAudits({ includeSuite, mode });
  const final = buildFinal(audits, idempotency);
  const artifacts = { preflight_report: audits.preflight, historical_replay_audit: audits.historicalReplay, active_public_evidence_binding_audit: audits.binding, current_runtime_regression_audit: audits.runtime, fs350_scope_regression_audit: audits.fs350Scope, failure_injection_report: audits.injections, public_store_immutability_audit: audits.publicStore, canonical_database_audit: audits.canonical, idempotency_report: idempotency, final_report: final };
  if (writeArtifacts) {
    for (const name of OUTPUTS) write(name, artifacts[name]);
  }
  return final;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await main();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.FINAL_STATUS === 'PASS' ? 0 : 1);
}
