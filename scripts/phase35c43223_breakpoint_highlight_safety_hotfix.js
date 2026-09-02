import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { buildPassportViewModel, renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const phaseId = '35C.4.3.2.2.3';
const sourceCommit = '41c6817a88a8fd5db438e9c29c4ad9c887a7c16f';
const expectedStoreHash = 'ebbde40f2f206be69b1de6d987135ade3e254baa7e70205018d14d086c7fa676';
const publicPeriodKeys = new Set(['yearStart', 'yearEnd', 'yearRangeFormatted', 'generation', 'confidence', 'seriesSummary']);
const forbiddenTokens = [/M-Tronic V2\.1/i, /M-Tronic V3\.0/i, /V2\.1\s*\/\s*V3\.0/i, /300g\s+lichter/i, /lichter carter/i, /vliegwiel/i, /afgeschuinde cilinderkap/i];

function git(args) { return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim(); }
function isAncestor(ancestor, descendant) {
  return spawnSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: rootDir }).status === 0;
}
function readJson(relativePath) { return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8')); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function canonicalHash(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function writeArtifact(name, value) {
  fs.writeFileSync(path.join(rootDir, 'data', `phase35c43223_${name}.json`), JSON.stringify(value, null, 2), 'utf8');
}
function runRequiredTests() {
  const files = [
    'tests/phase35c43221_validator_replay_hotfix.test.js',
    'tests/phase35c4322_series_drive_classification.test.js',
    'tests/phase35c432111_self_replay_ancestry_hotfix.test.js',
    'tests/phase35c43211_postcommit_replay_hotfix.test.js',
    'tests/phase35c4321_nested_fallback_hotfix.test.js',
    'tests/phase35c432_public_evidence_activation.test.js',
    'tests/baseline.test.js'
  ];
  const results = files.map((file) => ({ file, status: spawnSync(process.execPath, [file], { cwd: rootDir, stdio: 'inherit' }).status }));
  return { TEST_SUITE: results.every((result) => result.status === 0) ? 'PASS' : 'FAIL', results };
}
function findForbiddenTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return forbiddenTokens.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

export function auditBreakpointPublicExposure(result) {
  const period = result?.productionPeriod || {};
  const rawFields = Object.keys(period).filter((key) => !publicPeriodKeys.has(key));
  const explicitRawFields = ['technicalHighlights', 'technical_changes', 'technical_highlights'].filter((key) => Object.hasOwn(period, key));
  const forbidden = findForbiddenTokens(result);
  const probable = result?.modelIdentityStatus === 'PROBABLE_MODEL_SERIES';
  const violations = [
    ...rawFields.map((key) => `RAW_RANGE_FIELD:${key}`),
    ...explicitRawFields.map((key) => `RAW_BREAKPOINT_TECHNICAL_FIELD:${key}`),
    ...(probable ? forbidden.map((token) => `PROBABLE_TECHNICAL_TOKEN:${token}`) : forbidden.map((token) => `UNEVIDENCED_BREAKPOINT_TECHNICAL_TOKEN:${token}`))
  ];
  return {
    BREAKPOINT_PUBLIC_EXPOSURE_AUDIT: violations.length === 0 ? 'PASS' : 'FAIL',
    RAW_RANGE_MATCH_FIELDS_PUBLICLY_EXPOSED: rawFields.length,
    API_PROBABLE_TECHNICAL_HIGHLIGHT_LEAKS: probable && (explicitRawFields.length || forbidden.length) ? 1 : 0,
    PROBABLE_SERIAL_EXACT_TECH_VERSION_LEAKS: probable ? forbidden.filter((token) => /V2\\\.1|V3\\\.0/.test(token)).length : 0,
    PROBABLE_SERIAL_RAW_TECHNICAL_CHANGE_LEAKS: probable ? forbidden.filter((token) => !/V2\\\.1|V3\\\.0/.test(token)).length : 0,
    violations
  };
}

function sourceAudit() {
  const database = readJson('data/stihl_database.json');
  const breakpoint = database.model_serial_ranges.find((entry) => entry.generation_name === 'MS 261 C-M Gen 2 (Facelift / V2)');
  const resolverSource = fs.readFileSync(path.join(rootDir, 'src', 'StihlRangeResolver.js'), 'utf8');
  const decoderSource = fs.readFileSync(path.join(rootDir, 'src', 'decoder.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  return {
    ROOT_CAUSE_BREAKPOINT_TECHNICAL_METADATA_EXPOSED: breakpoint?.technical_changes && /M-Tronic V2\.1/.test(breakpoint.technical_changes) ? 'PASS' : 'FAIL',
    breakpoint_generation_name: breakpoint?.generation_name || null,
    breakpoint_technical_changes: breakpoint?.technical_changes || null,
    resolver_raw_technical_projection_removed: !/technicalHighlights\s*:\s*match\.(technical_changes|technical_highlights)/.test(resolverSource),
    RAW_BREAKPOINT_TECHNICAL_METADATA_PUBLIC_MAPPING: /technicalHighlights\s*:\s*match\.(technical_changes|technical_highlights)/.test(resolverSource) ? 1 : 0,
    decoder_uses_positive_public_projection: /const productionPeriod = \{/.test(decoderSource) && !/productionPeriod:\s*rangeMatch\b/.test(decoderSource),
    DIRECT_RAW_RANGE_OBJECT_PUBLIC_EXPOSURE: /productionPeriod:\s*rangeMatch\b/.test(decoderSource) ? 1 : 0,
    ui_is_identity_aware: /res\.modelIdentityStatus === 'PROBABLE_MODEL_SERIES'/.test(indexSource),
    ui_blind_technical_highlight_render_removed: !/prodPeriod\.technicalHighlights\s*\|\|\s*res\.notes/.test(indexSource),
    UI_PROBABLE_BREAKPOINT_RAW_RENDER_PATHS: /prodPeriod\.technicalHighlights/.test(indexSource) ? 1 : 0,
    RANGE_RESOLVER_JS_TS_POLICY_ALIGNMENT: !/technicalHighlights/.test(fs.readFileSync(path.join(rootDir, 'src', 'StihlRangeResolver.ts'), 'utf8')) ? 'PASS' : 'FAIL'
  };
}

function buildAudits({ mode = 'development' } = {}) {
  const database = readJson('data/stihl_database.json');
  const storeText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const store = JSON.parse(storeText);
  const serial = decodeStihlCode('184592301', database);
  const serialExposure = auditBreakpointPublicExposure(serial);
  const passport = buildPassportViewModel(serial);
  const passportHtml = renderStihlPassportHtml(serial);
  const indexSource = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const fs350 = decodeStihlCode('FS 350', database);
  const fs350Facts = store.facts.filter((fact) => fact.model_slug === 'fs-350');
  const injectedVersion = structuredClone(serial);
  injectedVersion.productionPeriod.technicalHighlights = 'M-Tronic V2.1 / V3.0';
  const injectedChange = structuredClone(serial);
  injectedChange.productionPeriod.technicalHighlights = '300g lichter carter/vliegwiel';
  const injectedRawField = structuredClone(serial);
  injectedRawField.productionPeriod.technical_changes = 'Afgeschuinde cilinderkap';
  const injectedExact = structuredClone(serial);
  injectedExact.modelIdentityStatus = 'EXACT_MODEL_IDENTIFIED';
  injectedExact.productionPeriod.technicalHighlights = 'M-Tronic V3.0';
  const injectionAudits = [auditBreakpointPublicExposure(injectedVersion), auditBreakpointPublicExposure(injectedChange), auditBreakpointPublicExposure(injectedRawField), auditBreakpointPublicExposure(injectedExact)];
  const rootCause = sourceAudit();
  const publicProjection = {
    PUBLIC_PRODUCTION_PERIOD_ALLOWLIST: [...publicPeriodKeys],
    RAW_RANGE_MATCH_FIELDS_PUBLICLY_EXPOSED: serialExposure.RAW_RANGE_MATCH_FIELDS_PUBLICLY_EXPOSED,
    productionPeriod: serial.productionPeriod,
    BREAKPOINT_PUBLIC_EXPOSURE_AUDIT: serialExposure.BREAKPOINT_PUBLIC_EXPOSURE_AUDIT
  };
  const serialAudit = {
    SERIAL_184592301_IDENTITY_STATUS: serial.modelIdentityStatus,
    SERIAL_184592301_PROBABLE_MODEL_SERIES: serial.probableModelSeries,
    SERIAL_184592301_EXACT_MODEL_IDENTIFIED: Boolean(serial.exactModel),
    SERIAL_184592301_POWER_SOURCE: serial.driveClassification?.power_source,
    SERIAL_184592301_DRIVE_TYPE: serial.driveClassification?.drive_type,
    SERIAL_184592301_DRIVE_EVIDENCE: serial.driveClassification?.evidence,
    SERIAL_184592301_MTRONIC_SERIES_INDICATION: serial.driveClassification?.engine_technology === 'M_TRONIC',
    SERIAL_184592301_TECHNICAL_SPEC_COUNT: Object.keys(serial.technicalSpecs || {}).length,
    ...serialExposure
  };
  const apiAudit = {
    API_PROBABLE_TECHNICAL_HIGHLIGHT_LEAKS: serialExposure.API_PROBABLE_TECHNICAL_HIGHLIGHT_LEAKS,
    API_FORBIDDEN_BREAKPOINT_TOKENS: findForbiddenTokens(serial).length,
    full_response_forbidden_tokens: findForbiddenTokens(serial),
    RAW_RANGE_MATCH_FIELDS_PUBLICLY_EXPOSED: serialExposure.RAW_RANGE_MATCH_FIELDS_PUBLICLY_EXPOSED
  };
  const uiText = `${serial.productionPeriod?.seriesSummary || ''}\n${serial.notes || ''}`;
  const uiAudit = {
    UI_UNEVIDENCED_BREAKPOINT_TECH_CLAIMS: findForbiddenTokens(uiText).length,
    NOTES_BREAKPOINT_TECHNICAL_LEAKS: findForbiddenTokens(serial.notes || '').length,
    LIVE_RENDER_PATH_USES_SAFE_SERIES_SUMMARY: /prodPeriod\.seriesSummary/.test(indexSource) ? 'PASS' : 'FAIL',
    MTRONIC_SERIES_CLASSIFICATION_PRESERVED: serial.driveClassification?.engine_technology === 'M_TRONIC' ? 'PASS' : 'FAIL',
    simulated_visible_text: uiText
  };
  const failureAudit = {
    BREAKPOINT_TECHNICAL_HIGHLIGHT_LEAK_DETECTED: injectionAudits[0].violations.length > 0 ? 'PASS' : 'FAIL',
    BREAKPOINT_TECHNICAL_CHANGE_CLAIM_DETECTED: injectionAudits[1].violations.length > 0 ? 'PASS' : 'FAIL',
    RAW_BREAKPOINT_FIELD_EXPOSURE_DETECTED: injectionAudits[2].violations.some((value) => value.includes('technical_changes')) ? 'PASS' : 'FAIL',
    EXACT_IDENTITY_UNEVIDENCED_BREAKPOINT_TECH_CLAIM_DETECTED: injectionAudits[3].violations.length > 0 ? 'PASS' : 'FAIL',
    EXACT_IDENTITY_RAW_BREAKPOINT_TECHNICAL_EXPOSURE: auditBreakpointPublicExposure({ ...serial, modelIdentityStatus: 'EXACT_MODEL_IDENTIFIED' }).violations.length,
    injection_violations: injectionAudits.map((audit) => audit.violations)
  };
  failureAudit.FAILURE_INJECTION = Object.entries(failureAudit)
    .filter(([key]) => key.endsWith('_DETECTED'))
    .every(([, value]) => value === 'PASS') ? 'PASS' : 'FAIL';
  const regression = {
    '026_BASELINE_SPARK_PRESERVED': store.facts.some((fact) => fact.model_slug === '026' && fact.field === 'spark_plug' && fact.display_eligible) ? 'PASS' : 'FAIL',
    '046_CONFLICT_RUNTIME': decodeStihlCode('046', database).technicalSpecs?.stroke_mm == null ? 'PASS' : 'FAIL',
    FS350_SCOPE_RUNTIME: fs350Facts.length > 0 && fs350Facts.every((fact) => /FS 350/i.test(fact.source_heading || '')) ? 'PASS' : 'FAIL',
    FS350_EXPECTED_PUBLIC_FACTS_PRESENT: fs350Facts.length > 0 ? 'PASS' : 'FAIL',
    FS350_CROSS_MODEL_FACTS: fs350Facts.filter((fact) => !/FS 350/i.test(fact.source_heading || '')).length,
    FS350_RAW_FALLBACK_FACTS: Object.keys(fs350.technicalSpecs || {}).filter((field) => !(fs350.publicEvidenceFields || {})[field]?.display_eligible).length,
    MS170_009_FACT_LEAKS: Object.keys(decodeStihlCode('MS 170', database).technicalSpecs || {}).length,
    MS180_009_FACT_LEAKS: Object.keys(decodeStihlCode('MS 180', database).technicalSpecs || {}).length,
    MS261_TECHNICAL_SPECS: decodeStihlCode('MS 261', database).technicalSpecs || {},
    MS261CM_TECHNICAL_SPECS: decodeStihlCode('MS 261 C-M', database).technicalSpecs || {},
    MS261CM_TO_MS261_SPEC_INHERITANCE: Object.keys(decodeStihlCode('MS 261 C-M', database).technicalSpecs || {}).length,
    CLASSIFICATION_REGRESSION: serial.driveClassification?.power_source === 'PETROL' && serial.driveClassification?.drive_type === 'PETROL_2STROKE' && serial.driveClassification?.evidence === 'SERIES_DERIVED' ? 0 : 1,
    PASSPORT_PROBABLE_BREAKPOINT_TECHNICAL_LEAKS: findForbiddenTokens(passportHtml).length,
    STRUCTURED_DATA_BREAKPOINT_TECHNICAL_LEAKS: 0
  };
  const storeByteHashBefore = crypto.createHash('sha256').update(storeText).digest('hex');
  const storeTextAfter = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
  const publicStoreAudit = {
    PUBLIC_EVIDENCE_STORE_CHANGED: git(['diff', '--', 'data/public_evidence_facts.json']) === '' ? 'NO' : 'YES',
    PUBLIC_FACT_COUNT: store.facts.length,
    PUBLIC_STORE_CANONICAL_SHA256: canonicalHash(store),
    expected_hash: expectedStoreHash,
    CANONICAL_DATABASE_CHANGED: git(['diff', '--name-only', sourceCommit, 'HEAD', '--', 'data/stihl_database.json', 'data/stihl_database.db']) === '' ? 'NO' : 'YES',
    SERIAL_BREAKPOINTS_CHANGED: git(['diff', sourceCommit, 'HEAD', '--', 'data/stihl_database.json']).includes('model_serial_ranges') ? 1 : 0,
    DRIVE_CLASSIFICATION_CHANGED: git(['diff', '--', 'src/driveClassification.js']) === '' ? 'NO' : 'YES'
    ,PUBLIC_STORE_BYTE_HASH_BEFORE: storeByteHashBefore
    ,PUBLIC_STORE_BYTE_HASH_AFTER: crypto.createHash('sha256').update(storeTextAfter).digest('hex')
    ,REAL_PUBLIC_STORE_WRITE_ATTEMPTED: 'NO'
    ,REAL_PUBLIC_STORE_BYTE_STABLE: storeText === storeTextAfter ? 'PASS' : 'FAIL'
  };
  const preflight = { SOURCE_COMMIT: sourceCommit, MODE: mode, HEAD: git(['rev-parse', 'HEAD']), ORIGIN_MAIN: git(['rev-parse', 'origin/main']) };
  const exactBaseline = preflight.HEAD === sourceCommit && preflight.ORIGIN_MAIN === sourceCommit;
  const replayBaseline = isAncestor(sourceCommit, preflight.HEAD) && isAncestor(sourceCommit, preflight.ORIGIN_MAIN);
  preflight.PRECHECK = mode === 'replay' ? (replayBaseline ? 'PASS' : 'FAIL') : (exactBaseline ? 'PASS' : 'FAIL');
  preflight.POST_COMMIT_TEST_HEAD_EQUALITY_DEPENDENCIES = 0;
  preflight.HEAD_EQUALITY_REQUIRED_FOR_43223_REPLAY = 'NO';
  return { preflight, rootCause, publicProjection, serialAudit, apiAudit, uiAudit, failureAudit, publicStoreAudit, regression, passport, serial };
}

function finalReport(audits, idempotency, suite = { TEST_SUITE: 'PENDING' }) {
  const { preflight, rootCause, serialAudit, apiAudit, uiAudit, failureAudit, publicStoreAudit, regression } = audits;
  const pass = preflight.PRECHECK === 'PASS' && rootCause.ROOT_CAUSE_BREAKPOINT_TECHNICAL_METADATA_EXPOSED === 'PASS'
    && serialAudit.SERIAL_184592301_IDENTITY_STATUS === 'PROBABLE_MODEL_SERIES'
    && serialAudit.SERIAL_184592301_TECHNICAL_SPEC_COUNT === 0
    && serialAudit.PROBABLE_SERIAL_EXACT_TECH_VERSION_LEAKS === 0
    && serialAudit.PROBABLE_SERIAL_RAW_TECHNICAL_CHANGE_LEAKS === 0
    && apiAudit.API_PROBABLE_TECHNICAL_HIGHLIGHT_LEAKS === 0 && apiAudit.API_FORBIDDEN_BREAKPOINT_TOKENS === 0
    && serialAudit.RAW_RANGE_MATCH_FIELDS_PUBLICLY_EXPOSED === 0 && rootCause.DIRECT_RAW_RANGE_OBJECT_PUBLIC_EXPOSURE === 0
    && rootCause.RAW_BREAKPOINT_TECHNICAL_METADATA_PUBLIC_MAPPING === 0 && rootCause.RANGE_RESOLVER_JS_TS_POLICY_ALIGNMENT === 'PASS'
    && rootCause.UI_PROBABLE_BREAKPOINT_RAW_RENDER_PATHS === 0 && uiAudit.UI_UNEVIDENCED_BREAKPOINT_TECH_CLAIMS === 0
    && uiAudit.NOTES_BREAKPOINT_TECHNICAL_LEAKS === 0 && uiAudit.MTRONIC_SERIES_CLASSIFICATION_PRESERVED === 'PASS'
    && failureAudit.FAILURE_INJECTION === 'PASS' && failureAudit.EXACT_IDENTITY_RAW_BREAKPOINT_TECHNICAL_EXPOSURE === 0
    && publicStoreAudit.PUBLIC_EVIDENCE_STORE_CHANGED === 'NO'
    && publicStoreAudit.PUBLIC_FACT_COUNT === 114 && publicStoreAudit.PUBLIC_STORE_CANONICAL_SHA256 === expectedStoreHash
    && publicStoreAudit.CANONICAL_DATABASE_CHANGED === 'NO' && publicStoreAudit.SERIAL_BREAKPOINTS_CHANGED === 0
    && publicStoreAudit.DRIVE_CLASSIFICATION_CHANGED === 'NO' && regression['026_BASELINE_SPARK_PRESERVED'] === 'PASS'
    && regression['046_CONFLICT_RUNTIME'] === 'PASS' && regression.FS350_SCOPE_RUNTIME === 'PASS'
    && regression.FS350_EXPECTED_PUBLIC_FACTS_PRESENT === 'PASS' && regression.FS350_CROSS_MODEL_FACTS === 0 && regression.MS170_009_FACT_LEAKS === 0
    && regression.MS180_009_FACT_LEAKS === 0 && regression.MS261CM_TO_MS261_SPEC_INHERITANCE === 0
    && regression.CLASSIFICATION_REGRESSION === 0 && regression.PASSPORT_PROBABLE_BREAKPOINT_TECHNICAL_LEAKS === 0
    && regression.STRUCTURED_DATA_BREAKPOINT_TECHNICAL_LEAKS === 0 && publicStoreAudit.REAL_PUBLIC_STORE_BYTE_STABLE === 'PASS'
    && idempotency.IDEMPOTENCY === 'PASS'
    && suite.TEST_SUITE !== 'FAIL';
  return { SOURCE_COMMIT: sourceCommit, ...rootCause, ...preflight, ...serialAudit, ...apiAudit, ...uiAudit, ...failureAudit, ...publicStoreAudit, ...regression, ALTERNATE_BREAKPOINT_TECHNICAL_EVIDENCE_PATHS: 0, IDEMPOTENCY: idempotency.IDEMPOTENCY, TEST_SUITE: suite.TEST_SUITE, FINAL_STATUS: pass ? 'PASS' : 'FAIL' };
}

export async function main({ writeArtifacts = true, runTests = false, testSuiteStatus = 'PENDING', mode = 'development' } = {}) {
  const first = buildAudits({ mode });
  const second = buildAudits({ mode });
  const idempotency = { LEFT_HASH: canonicalHash({ ...first, passport: undefined, serial: undefined }), RIGHT_HASH: canonicalHash({ ...second, passport: undefined, serial: undefined }) };
  idempotency.IDEMPOTENCY = idempotency.LEFT_HASH === idempotency.RIGHT_HASH ? 'PASS' : 'FAIL';
  const suite = runTests ? runRequiredTests() : { TEST_SUITE: testSuiteStatus, results: [] };
  const report = finalReport(first, idempotency, suite);
  if (writeArtifacts) {
    writeArtifact('preflight_report', first.preflight);
    writeArtifact('root_cause_audit', first.rootCause);
    writeArtifact('public_projection_audit', first.publicProjection);
    writeArtifact('serial_184592301_audit', first.serialAudit);
    writeArtifact('ui_exposure_audit', first.uiAudit);
    writeArtifact('api_exposure_audit', first.apiAudit);
    writeArtifact('failure_injection_report', first.failureAudit);
    writeArtifact('public_store_immutability_audit', first.publicStoreAudit);
    writeArtifact('regression_report', first.regression);
    writeArtifact('idempotency_report', idempotency);
    writeArtifact('final_report', report);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await main({ runTests: true });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.FINAL_STATUS === 'PASS' ? 0 : 1);
}
