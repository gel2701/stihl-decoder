import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync, spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { decodeStihlCode } from '../src/decoder.js';
import { TECHNICAL_PUBLIC_FIELDS, buildPublicEvidenceFields, buildPublicTechnicalSpecs } from '../src/publicEvidence.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { buildPassportViewModel, renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const PHASE_ID = '35C.4.3.2';
const SOURCE_COMMIT = '356040404fc81c8b69d4d259697b58ec2ca67c1a';
const PUBLIC_STORE_PATH = path.join(rootDir, 'data', 'public_evidence_facts.json');
const PUBLIC_STORE_TMP_PATH = path.join(rootDir, 'data', 'public_evidence_facts.activation.tmp.json');
const PUBLIC_STORE_BACKUP_PATH = path.join(rootDir, 'data', 'backups', 'phase35c432_pre_activation_public_evidence_facts.json');
const DATABASE_JSON_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const DATABASE_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');

const OUTPUTS = {
  preflight: path.join(rootDir, 'data', 'phase35c432_preflight_report.json'),
  activationSourceIdentity: path.join(rootDir, 'data', 'phase35c432_activation_source_identity.json'),
  factIdentityAudit: path.join(rootDir, 'data', 'phase35c432_fact_identity_audit.json'),
  baselinePreservationAudit: path.join(rootDir, 'data', 'phase35c432_baseline_preservation_audit.json'),
  lineageAudit: path.join(rootDir, 'data', 'phase35c432_lineage_audit.json'),
  indexIntegrityAudit: path.join(rootDir, 'data', 'phase35c432_index_integrity_audit.json'),
  consumerInventory: path.join(rootDir, 'data', 'phase35c432_consumer_inventory.json'),
  apiValidation: path.join(rootDir, 'data', 'phase35c432_api_validation.json'),
  modelPageValidation: path.join(rootDir, 'data', 'phase35c432_model_page_validation.json'),
  structuredDataValidation: path.join(rootDir, 'data', 'phase35c432_structured_data_validation.json'),
  comparisonValidation: path.join(rootDir, 'data', 'phase35c432_comparison_validation.json'),
  passportValidation: path.join(rootDir, 'data', 'phase35c432_passport_validation.json'),
  decoderRegression: path.join(rootDir, 'data', 'phase35c432_decoder_regression.json'),
  coverage: path.join(rootDir, 'data', 'phase35c432_public_coverage_before_after.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c432_failure_injection_report.json'),
  rollback: path.join(rootDir, 'data', 'phase35c432_rollback_test.json'),
  idempotency: path.join(rootDir, 'data', 'phase35c432_idempotency_report.json'),
  finalReport: path.join(rootDir, 'data', 'phase35c432_final_report.json')
};

const REQUIRED_SOURCE_REPORTS = {
  finalReport: 'data/phase35c4311_final_report.json',
  finalTransitionAccounting: 'data/phase35c4311_final_transition_accounting.json',
  baselinePreservationAudit: 'data/phase35c4311_baseline_fact_preservation_audit.json',
  lineagePreservationAudit: 'data/phase35c4311_lineage_preservation_audit.json',
  regression026046Audit: 'data/phase35c4311_026_046_regression_audit.json'
};

const PRIORITY_MODELS = ['009', '017', '018', '020', '026', '036', '044', '046', '088', 'FS 350', 'HS 45', 'MS 200', 'MS 260', 'MS 360', 'MS 460', 'TS 410', 'TS 420'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  }).trim();
}

function gitShowRaw(commit, repoPath) {
  return execFileSync('git', ['show', `${commit}:${repoPath.replace(/\\/g, '/')}`], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  });
}

function gitShowJson(commit, repoPath) {
  return JSON.parse(gitShowRaw(commit, repoPath));
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function sha256String(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Canonical(value) {
  return sha256String(stableSerialize(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeForHash(value) {
  if (Array.isArray(value)) return value.map(sanitizeForHash);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'generated_at' || key === 'activated_at' || key === 'server_started_at' || key === 'backup_created_at') continue;
    out[key] = sanitizeForHash(nested);
  }
  return out;
}

function summarizeWorktreeStatus() {
  return git(['status', '--short']) || 'CLEAN';
}

function buildPreflightReport() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  const worktreeStatus = summarizeWorktreeStatus();
  const failures = [];

  if (head !== SOURCE_COMMIT) failures.push('HEAD_NOT_SOURCE_COMMIT');
  if (originMain !== SOURCE_COMMIT) failures.push('ORIGIN_MAIN_NOT_SOURCE_COMMIT');
  if (mergeBase !== SOURCE_COMMIT) failures.push('MERGE_BASE_NOT_SOURCE_COMMIT');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SOURCE_COMMIT,
    HEAD: head,
    ORIGIN_MAIN: originMain,
    MERGE_BASE: mergeBase,
    WORKTREE_STATUS: worktreeStatus,
    PRECHECK_FAILURES: failures,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL'
  };
}

function loadImmutableInputs() {
  const auditedStagingRaw = gitShowRaw(SOURCE_COMMIT, 'data/phase35c4311_corrected_public_fact_staging.json');
  const auditedStaging = JSON.parse(auditedStagingRaw);
  const baselineRaw = gitShowRaw(SOURCE_COMMIT, 'data/public_evidence_facts.json');
  const baselineStore = JSON.parse(baselineRaw);

  return {
    auditedStagingRaw,
    auditedStaging,
    baselineRaw,
    baselineStore,
    sourceReports: {
      finalReport: gitShowJson(SOURCE_COMMIT, REQUIRED_SOURCE_REPORTS.finalReport),
      finalTransitionAccounting: gitShowJson(SOURCE_COMMIT, REQUIRED_SOURCE_REPORTS.finalTransitionAccounting),
      baselinePreservationAudit: gitShowJson(SOURCE_COMMIT, REQUIRED_SOURCE_REPORTS.baselinePreservationAudit),
      lineagePreservationAudit: gitShowJson(SOURCE_COMMIT, REQUIRED_SOURCE_REPORTS.lineagePreservationAudit),
      regression026046Audit: gitShowJson(SOURCE_COMMIT, REQUIRED_SOURCE_REPORTS.regression026046Audit)
    }
  };
}

function validateActivationSource(sourceReports, auditedStaging) {
  const failures = [];
  const finalReport = sourceReports.finalReport;
  const finalTransitionAccounting = sourceReports.finalTransitionAccounting;
  const baselinePreservationAudit = sourceReports.baselinePreservationAudit;
  const lineageAudit = sourceReports.lineagePreservationAudit;
  const regressionAudit = sourceReports.regression026046Audit;

  if (finalReport.FINAL_STATUS !== 'PASS') failures.push('SOURCE_FINAL_STATUS_NOT_PASS');
  if (finalReport.TEST_SUITE !== 'PASS') failures.push('SOURCE_TEST_SUITE_NOT_PASS');
  if (finalTransitionAccounting.FINAL_TRANSITION_ACCOUNTING !== 'PASS') failures.push('SOURCE_TRANSITION_ACCOUNTING_NOT_PASS');
  if (finalReport.BASELINE_PUBLIC_FACTS !== 22) failures.push('BASELINE_PUBLIC_FACTS_MISMATCH');
  if (finalReport.SAFE_NEW_SCS_FACTS !== 92) failures.push('SAFE_NEW_SCS_FACTS_MISMATCH');
  if (finalReport.TOTAL_CORRECTED_STAGED_FACTS !== 114) failures.push('TOTAL_STAGED_FACTS_MISMATCH');
  if (baselinePreservationAudit.BASELINE_FACTS_PRESERVED !== 22) failures.push('BASELINE_PRESERVED_MISMATCH');
  if (baselinePreservationAudit.BASELINE_FACTS_CHANGED !== 0) failures.push('BASELINE_CHANGED_NOT_ZERO');
  if (baselinePreservationAudit.BASELINE_FACTS_REMOVED !== 0) failures.push('BASELINE_REMOVED_NOT_ZERO');
  if (regressionAudit['046_STROKE_STATUS'] !== 'OFFICIAL_CONFLICTED') failures.push('046_STATUS_MISMATCH');
  if (regressionAudit['046_STROKE_SINGLE_VALUE_ELIGIBLE'] !== false) failures.push('046_SINGLE_VALUE_ELIGIBILITY_MISMATCH');
  if (lineageAudit.SCS_FALSE_INDEPENDENCE_PROMOTIONS !== 0) failures.push('FALSE_INDEPENDENCE_NOT_ZERO');
  if ((auditedStaging.facts || []).length !== 114) failures.push('AUDITED_STAGING_FACT_COUNT_MISMATCH');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    FINAL_STATUS: finalReport.FINAL_STATUS,
    TEST_SUITE: finalReport.TEST_SUITE,
    FINAL_TRANSITION_ACCOUNTING: finalTransitionAccounting.FINAL_TRANSITION_ACCOUNTING,
    BASELINE_PUBLIC_FACTS: finalReport.BASELINE_PUBLIC_FACTS,
    SAFE_NEW_SCS_FACTS: finalReport.SAFE_NEW_SCS_FACTS,
    TOTAL_CORRECTED_STAGED_FACTS: finalReport.TOTAL_CORRECTED_STAGED_FACTS,
    BASELINE_FACTS_PRESERVED: baselinePreservationAudit.BASELINE_FACTS_PRESERVED,
    BASELINE_FACTS_CHANGED: baselinePreservationAudit.BASELINE_FACTS_CHANGED,
    BASELINE_FACTS_REMOVED: baselinePreservationAudit.BASELINE_FACTS_REMOVED,
    '046_STROKE_STATUS': regressionAudit['046_STROKE_STATUS'],
    '046_STROKE_SINGLE_VALUE_ELIGIBLE': regressionAudit['046_STROKE_SINGLE_VALUE_ELIGIBLE'],
    SCS_FALSE_INDEPENDENCE_PROMOTIONS: lineageAudit.SCS_FALSE_INDEPENDENCE_PROMOTIONS,
    ACTIVATION_SOURCE_VALIDATION: failures.length === 0 ? 'PASS' : 'FAIL',
    failures
  };
}

function activatePublicStore(auditedStagingRaw, auditedStaging) {
  ensureDir(path.dirname(PUBLIC_STORE_BACKUP_PATH));
  const currentRaw = fileExists(PUBLIC_STORE_PATH) ? fs.readFileSync(PUBLIC_STORE_PATH, 'utf8') : '';
  fs.writeFileSync(PUBLIC_STORE_BACKUP_PATH, currentRaw, 'utf8');
  fs.writeFileSync(PUBLIC_STORE_TMP_PATH, JSON.stringify(auditedStaging, null, 2), 'utf8');
  JSON.parse(fs.readFileSync(PUBLIC_STORE_TMP_PATH, 'utf8'));
  fs.renameSync(PUBLIC_STORE_TMP_PATH, PUBLIC_STORE_PATH);
  const activatedRaw = fs.readFileSync(PUBLIC_STORE_PATH, 'utf8');
  const activatedStore = JSON.parse(activatedRaw);
  return {
    backupPath: PUBLIC_STORE_BACKUP_PATH,
    backupCreatedAt: new Date().toISOString(),
    previousLocalRawSha256: sha256String(currentRaw),
    auditedStagingRawSha256: sha256String(auditedStagingRaw),
    activatedPublicStoreRawSha256: sha256String(activatedRaw),
    activatedPublicStoreCanonicalSha256: sha256Canonical(activatedStore),
    activatedRaw,
    activatedStore
  };
}

function buildFactMap(facts) {
  return new Map((facts || []).map((fact) => [fact.fact_id, fact]));
}

function compareFacts(expectedFacts, actualFacts) {
  const expectedMap = buildFactMap(expectedFacts);
  const actualMap = buildFactMap(actualFacts);
  const added = [];
  const removed = [];
  const changed = [];

  for (const [factId, expectedFact] of expectedMap.entries()) {
    const actualFact = actualMap.get(factId);
    if (!actualFact) {
      removed.push(factId);
      continue;
    }
    if (stableSerialize(expectedFact) !== stableSerialize(actualFact)) {
      changed.push({
        fact_id: factId,
        expected_hash: sha256Canonical(expectedFact),
        actual_hash: sha256Canonical(actualFact)
      });
    }
  }

  for (const factId of actualMap.keys()) {
    if (!expectedMap.has(factId)) added.push(factId);
  }

  return { added, removed, changed };
}

function buildFactIdentityAudit(auditedStaging, activatedStore) {
  const comparison = compareFacts(auditedStaging.facts || [], activatedStore.facts || []);
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    AUDITED_STAGING_FACT_COUNT: (auditedStaging.facts || []).length,
    ACTIVATED_PUBLIC_FACT_COUNT: (activatedStore.facts || []).length,
    ACTIVATION_FACTS_ADDED: comparison.added.length,
    ACTIVATION_FACTS_REMOVED: comparison.removed.length,
    ACTIVATION_FACTS_CHANGED: comparison.changed.length,
    added_fact_ids: comparison.added,
    removed_fact_ids: comparison.removed,
    changed_fact_ids: comparison.changed,
    FACT_SET_MATCH: comparison.added.length === 0 && comparison.removed.length === 0 && comparison.changed.length === 0 ? 'PASS' : 'FAIL'
  };
}

function buildBaselinePreservationAudit(baselineStore, activatedStore) {
  const baselineFacts = baselineStore.facts || [];
  const activatedMap = buildFactMap(activatedStore.facts || []);
  const records = baselineFacts.map((fact) => {
    const activated = activatedMap.get(fact.fact_id);
    return {
      fact_id: fact.fact_id,
      model_slug: fact.model_slug,
      field: fact.field,
      preserved: Boolean(activated && stableSerialize(fact) === stableSerialize(activated)),
      changed: Boolean(activated && stableSerialize(fact) !== stableSerialize(activated)),
      removed: !activated
    };
  });
  const preserved = records.filter((row) => row.preserved).length;
  const changed = records.filter((row) => row.changed).length;
  const removed = records.filter((row) => row.removed).length;
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_FACTS_PRESERVED_AFTER_ACTIVATION: preserved,
    BASELINE_FACTS_CHANGED_AFTER_ACTIVATION: changed,
    BASELINE_FACTS_REMOVED_AFTER_ACTIVATION: removed,
    records
  };
}

function buildLineageAudit(baselineStore, activatedStore) {
  const baselineIds = new Set((baselineStore.facts || []).map((fact) => fact.fact_id));
  const newFacts = (activatedStore.facts || []).filter((fact) => !baselineIds.has(fact.fact_id));
  const records = newFacts.map((fact) => ({
    fact_id: fact.fact_id,
    model_slug: fact.model_slug,
    field: fact.field,
    source_lineage: fact.source_lineage || null,
    independence_status: fact.independence_status || null,
    source_heading: fact.source_heading || null,
    source_locator: fact.source_locator || null,
    source_class: fact.source_class || null,
    model_scope: fact.model_scope || null,
    derivative_source: /^DERIVATIVE_/i.test(String(fact.source_class || '')),
    missing_lineage: !fact.source_lineage,
    missing_independence: !fact.independence_status,
    missing_source_heading: !fact.source_heading,
    missing_source_locator: !fact.source_locator,
    missing_source_class: !fact.source_class,
    missing_model_scope: !fact.model_scope,
    false_independence: String(fact.independence_status || '').toUpperCase().includes('INDEPENDENT')
  }));

  const missingLineage = records.filter((row) => row.missing_lineage).length;
  const missingIndependence = records.filter((row) => row.missing_independence).length;
  const derivativePromotions = records.filter((row) => row.derivative_source).length;
  const falseIndependence = records.filter((row) => row.false_independence).length;
  const missingSourceHeading = records.filter((row) => row.missing_source_heading).length;
  const missingSourceLocator = records.filter((row) => row.missing_source_locator).length;
  const missingSourceClass = records.filter((row) => row.missing_source_class).length;
  const missingModelScope = records.filter((row) => row.missing_model_scope).length;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SAFE_NEW_SCS_FACTS: newFacts.length,
    SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE: missingLineage,
    SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS: missingIndependence,
    SCS_FALSE_INDEPENDENCE_PROMOTIONS: falseIndependence,
    DERIVATIVE_SOURCE_PROMOTIONS: derivativePromotions,
    DOSSIER_AS_DIRECT_TECHNICAL_SOURCE: derivativePromotions,
    PROMOTIONS_WITHOUT_SOURCE_HEADING: missingSourceHeading,
    PROMOTIONS_WITHOUT_SOURCE_LOCATOR: missingSourceLocator,
    PROMOTIONS_WITHOUT_SOURCE_CLASS: missingSourceClass,
    PROMOTIONS_WITHOUT_MODEL_SCOPE: missingModelScope,
    records
  };
}

function buildIndexIntegrityAudit(store) {
  const facts = store.facts || [];
  const factIds = facts.map((fact) => fact.fact_id);
  const factIdCounts = new Map();
  for (const factId of factIds) {
    factIdCounts.set(factId, (factIdCounts.get(factId) || 0) + 1);
  }
  const duplicateFactIds = [...factIdCounts.entries()].filter(([, count]) => count > 1).map(([factId]) => factId);
  const factIdSet = new Set(factIds);
  const modelIndexFacts = [];
  const fieldIndexFacts = [];

  for (const [modelSlug, entry] of Object.entries(store.model_index || {})) {
    for (const factId of entry.fact_ids || []) {
      modelIndexFacts.push({ model_slug: modelSlug, fact_id: factId });
    }
  }

  for (const [modelSlug, fieldMap] of Object.entries(store.field_index || {})) {
    for (const [field, factIdsForField] of Object.entries(fieldMap || {})) {
      for (const factId of factIdsForField || []) {
        fieldIndexFacts.push({ model_slug: modelSlug, field, fact_id: factId });
      }
    }
  }

  const orphanFactIds = facts
    .filter((fact) => !modelIndexFacts.some((row) => row.fact_id === fact.fact_id) || !fieldIndexFacts.some((row) => row.fact_id === fact.fact_id))
    .map((fact) => fact.fact_id);
  const missingModelIndexFacts = modelIndexFacts.filter((row) => !factIdSet.has(row.fact_id));
  const missingFieldIndexFacts = fieldIndexFacts.filter((row) => !factIdSet.has(row.fact_id));

  const duplicateIndexFactIds = [];
  const indexCounts = new Map();
  for (const row of [...modelIndexFacts, ...fieldIndexFacts]) {
    const key = `${row.fact_id}:${row.model_slug}:${row.field || 'model_index'}`;
    indexCounts.set(key, (indexCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of indexCounts.entries()) {
    if (count > 1) duplicateIndexFactIds.push(key);
  }

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    FACT_ID_COLLISIONS: duplicateFactIds.length,
    DUPLICATE_FACT_IDS: duplicateFactIds.length,
    ORPHAN_FACT_IDS: orphanFactIds.length,
    MISSING_MODEL_INDEX_FACTS: missingModelIndexFacts.length,
    MISSING_FIELD_INDEX_FACTS: missingFieldIndexFacts.length,
    DUPLICATE_INDEX_FACT_IDS: duplicateIndexFactIds.length,
    duplicate_fact_ids: duplicateFactIds,
    orphan_fact_ids: orphanFactIds,
    missing_model_index_facts: missingModelIndexFacts,
    missing_field_index_facts: missingFieldIndexFacts,
    duplicate_index_fact_ids: duplicateIndexFactIds
  };
}

function summarizeCoverage(store) {
  const facts = store.facts || [];
  const perModel = {};
  for (const fact of facts) {
    if (!perModel[fact.model_slug]) {
      perModel[fact.model_slug] = {
        model_slug: fact.model_slug,
        model_name: fact.model_name,
        fields: [],
        conflicted_fields: []
      };
    }
    perModel[fact.model_slug].fields.push(fact.field);
    if (fact.public_evidence_status === 'OFFICIAL_CONFLICTED') {
      perModel[fact.model_slug].conflicted_fields.push(fact.field);
    }
  }

  return {
    PUBLIC_FACTS_TOTAL: facts.length,
    PUBLIC_MODELS_WITH_ANY_FACT: Object.keys(perModel).length,
    perModel
  };
}

function buildCoverageAudit(baselineStore, activatedStore) {
  const before = summarizeCoverage(baselineStore);
  const after = summarizeCoverage(activatedStore);
  const records = Object.keys(after.perModel).sort().map((modelSlug) => {
    const beforeModel = before.perModel[modelSlug] || { fields: [], conflicted_fields: [] };
    const afterModel = after.perModel[modelSlug];
    return {
      model_slug: modelSlug,
      model_name: afterModel.model_name,
      before_fields: beforeModel.fields.sort(),
      after_fields: afterModel.fields.sort(),
      new_fields: afterModel.fields.filter((field) => !beforeModel.fields.includes(field)).sort(),
      conflicted_fields: afterModel.conflicted_fields.sort()
    };
  });
  const newPublicModels = Object.keys(after.perModel).filter((modelSlug) => !before.perModel[modelSlug]).sort();
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    before,
    after,
    PUBLIC_FACTS_BEFORE: before.PUBLIC_FACTS_TOTAL,
    PUBLIC_FACTS_AFTER: after.PUBLIC_FACTS_TOTAL,
    MODELS_WITH_PUBLIC_FACTS_BEFORE: before.PUBLIC_MODELS_WITH_ANY_FACT,
    MODELS_WITH_PUBLIC_FACTS_AFTER: after.PUBLIC_MODELS_WITH_ANY_FACT,
    NEW_PUBLIC_MODELS: newPublicModels,
    records
  };
}

function hashFileIfExists(filePath) {
  if (!fileExists(filePath)) return null;
  return sha256Buffer(fs.readFileSync(filePath));
}

function buildConsumerInventory() {
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    consumers: [
      {
        file: 'src/publicEvidence.js',
        function: 'buildPublicEvidenceFields',
        reads_public_evidence: true,
        raw_model_fallback_present: false,
        activation_tested: true
      },
      {
        file: 'src/publicEvidence.js',
        function: 'buildPublicTechnicalSpecs',
        reads_public_evidence: true,
        raw_model_fallback_present: false,
        activation_tested: true
      },
      {
        file: 'src/decoder.js',
        function: 'analyzeModelQuery',
        reads_public_evidence: true,
        raw_model_fallback_present: 'sanitized_nontechnical_only',
        activation_tested: true
      },
      {
        file: 'src/decoder.js',
        function: 'analyzeSerialNumber',
        reads_public_evidence: true,
        raw_model_fallback_present: 'no_technical_specs_for_probable',
        activation_tested: true
      },
      {
        file: 'src/decoder.js',
        function: 'analyzePartNumber',
        reads_public_evidence: false,
        raw_model_fallback_present: false,
        activation_tested: true
      },
      {
        file: 'server.js',
        function: 'GET /api/decode',
        reads_public_evidence: true,
        raw_model_fallback_present: 'via decoder safeguards only',
        activation_tested: true
      },
      {
        file: 'src/components/ModelPageTemplate.js',
        function: 'renderModelPageHtml',
        reads_public_evidence: true,
        raw_model_fallback_present: false,
        activation_tested: true
      },
      {
        file: 'src/components/ComparisonPageTemplate.js',
        function: 'renderComparisonPageHtml',
        reads_public_evidence: true,
        raw_model_fallback_present: false,
        activation_tested: true
      },
      {
        file: 'src/components/StihlPassportGenerator.js',
        function: 'buildPassportViewModel/renderStihlPassportHtml',
        reads_public_evidence: true,
        raw_model_fallback_present: false,
        activation_tested: true
      },
      {
        file: 'src/components/StructuredData.js',
        function: 'buildStructuredData',
        reads_public_evidence: true,
        raw_model_fallback_present: false,
        activation_tested: true
      }
    ]
  };
}

function createSyntheticModel(modelSlug, database, activatedStore) {
  const existing = (database.models || []).find((model) => {
    const slug = String(model.slug || model.id || '').toLowerCase();
    return slug === String(modelSlug).toLowerCase();
  });
  if (existing) return existing;

  const overlayEntry = activatedStore.model_index?.[modelSlug];
  const firstFactId = overlayEntry?.fact_ids?.[0];
  const firstFact = (activatedStore.facts || []).find((fact) => fact.fact_id === firstFactId) || null;
  const categoryText = String(firstFact?.category || overlayEntry?.category || 'UNKNOWN');
  const fuelType = /Kettingzaag|Bosmaaier|Heggenschaar|Doorslijper/i.test(categoryText)
    ? 'PETROL_2STROKE'
    : 'UNKNOWN';
  return {
    id: String(modelSlug).replace(/-/g, '_'),
    slug: modelSlug,
    model_name: overlayEntry?.model_name || String(modelSlug).toUpperCase(),
    category: categoryText,
    category_slug: null,
    series_code: null,
    fuel_type: fuelType,
    displacement_cc: null,
    power_kw: null,
    provenance: firstFact?.publication_id ? { source_document_number: firstFact.publication_id } : null
  };
}

function extractJsonLdObjects(html) {
  const objects = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    const raw = match[1].trim();
    try {
      objects.push(JSON.parse(raw));
    } catch {
      objects.push({ parse_error: true, raw });
    }
  }
  return objects;
}

function flattenJsonLdTypes(node) {
  const types = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value['@type']) {
      if (Array.isArray(value['@type'])) {
        value['@type'].forEach((entry) => types.push(entry));
      } else {
        types.push(value['@type']);
      }
    }
    if (Array.isArray(value['@graph'])) value['@graph'].forEach(visit);
  };
  visit(node);
  return types;
}

function extractHtmlMeta(html) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null;
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || null;
  const robots = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] || null;
  const jsonLdObjects = extractJsonLdObjects(html);
  const jsonLdTypes = [...new Set(jsonLdObjects.flatMap((entry) => flattenJsonLdTypes(entry)))];
  return {
    title,
    canonical,
    robots,
    jsonLdTypes
  };
}

function countWindowsPaths(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const matches = text.match(/[A-Z]:\\|file:\/\/\//gi);
  return matches ? matches.length : 0;
}

async function startLocalServer() {
  const port = 3400 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      RENDER_GIT_COMMIT: SOURCE_COMMIT,
      RENDER_GIT_BRANCH: 'main'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return { child, baseUrl, logs };
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  child.kill('SIGTERM');
  throw new Error(`Local server did not start. Logs: ${logs}`);
}

async function stopLocalServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

async function fetchJson(baseUrl, requestPath) {
  const response = await fetch(`${baseUrl}${requestPath}`);
  const text = await response.text();
  return {
    status: response.status,
    body: JSON.parse(text)
  };
}

async function fetchText(baseUrl, requestPath) {
  const response = await fetch(`${baseUrl}${requestPath}`);
  return {
    status: response.status,
    body: await response.text(),
    headers: Object.fromEntries(response.headers.entries())
  };
}

function findExpectedFact(store, modelSlug, field) {
  return (store.facts || []).find((fact) => fact.model_slug === modelSlug && fact.field === field) || null;
}

function compactApiResult(query, result) {
  return {
    query,
    success: result.success,
    type: result.type || null,
    status: result.status || null,
    model: result.model || null,
    exactModel: result.exactModel || null,
    probableModelSeries: result.probableModelSeries || null,
    technicalSpecKeys: Object.keys(result.technicalSpecs || {}),
    technicalSpecs: result.technicalSpecs || {},
    publicEvidenceFacts: Array.isArray(result.publicEvidenceFacts)
      ? result.publicEvidenceFacts.map((fact) => ({
          field: fact.field,
          value: fact.value,
          sourceDocumentId: fact.meta?.sourceDocumentId || null,
          sourceLocator: fact.meta?.sourceLocator || null,
          sourceHeading: fact.meta?.sourceHeading || null,
          status: fact.meta?.status || null
        }))
      : []
  };
}

async function buildApiValidation(baseUrl, database, activatedStore) {
  const queries = [
    '009', '017', '018', '020', '026', '036', '044', '046', '088',
    'FS 350', 'HS 45', 'MS 200', 'MS 260', 'MS 360', 'MS 460', 'TS 410', 'TS 420',
    'MS 170', 'MS 180', 'MS 261', 'MS999', 'FS999', 'BR601', 'MS 26',
    '184592301', '11210210800', '11280210800', '0.46', '0.15',
    '020T', 'MS200T', 'MS360C'
  ];

  const records = [];
  for (const query of queries) {
    const response = await fetchJson(baseUrl, `/api/decode?code=${encodeURIComponent(query)}`);
    records.push({
      query,
      http_status: response.status,
      result: compactApiResult(query, response.body)
    });
  }

  const byQuery = new Map(records.map((entry) => [entry.query, entry]));
  const getResult = (query) => byQuery.get(query)?.result || {};
  const countTechnicalFacts = (result) => {
    const technicalKeys = new Set([...TECHNICAL_PUBLIC_FIELDS, 'power_hp', 'max_engine_speed_rpm']);
    return Object.keys(result.technicalSpecs || {}).filter((key) => technicalKeys.has(key)).length;
  };
  const result009 = getResult('009');
  const result017 = getResult('017');
  const result018 = getResult('018');
  const result026 = getResult('026');
  const result046 = getResult('046');
  const resultFs350 = getResult('FS 350');
  const resultMs170 = getResult('MS 170');
  const resultMs180 = getResult('MS 180');
  const resultProbableSerial = getResult('184592301');
  const resultPart1121 = getResult('11210210800');
  const resultPart1128 = getResult('11280210800');
  const fuzzyQueries = ['MS999', 'FS999', 'BR601', 'MS 26'];
  const variantQueries = ['020T', 'MS200T', 'MS360C'];
  const numericQueries = ['0.46', '0.15'];

  const expected009 = {
    displacement_cc: findExpectedFact(activatedStore, '009', 'displacement_cc')?.normalized_value ?? null,
    bore_mm: findExpectedFact(activatedStore, '009', 'bore_mm')?.normalized_value ?? null,
    stroke_mm: findExpectedFact(activatedStore, '009', 'stroke_mm')?.normalized_value ?? null,
    power_kw: findExpectedFact(activatedStore, '009', 'power_kw')?.normalized_value ?? null,
    power_hp: findExpectedFact(activatedStore, '009', 'power_hp')?.normalized_value ?? null,
    idle_speed_rpm: findExpectedFact(activatedStore, '009', 'idle_speed_rpm')?.normalized_value ?? null,
    spark_plug: buildPublicTechnicalSpecs('009', { ...database, public_evidence: activatedStore }).spark_plug,
    electrode_gap_mm: findExpectedFact(activatedStore, '009', 'electrode_gap_mm')?.normalized_value ?? null
  };

  const ms170Facts = countTechnicalFacts(resultMs170);
  const ms180Facts = countTechnicalFacts(resultMs180);
  const variantLeaks = variantQueries.filter((query) => countTechnicalFacts(getResult(query)) > 0);
  const fuzzyLeaks = fuzzyQueries.filter((query) => countTechnicalFacts(getResult(query)) > 0);
  const numericLeaks = numericQueries.filter((query) => countTechnicalFacts(getResult(query)) > 0);
  const partLeaks = [resultPart1121, resultPart1128].filter((result) => countTechnicalFacts(result) > 0).length;
  const probableSerialLeaks = countTechnicalFacts(resultProbableSerial);

  const traceRecords = [
    { model_slug: '009', field: 'power_kw' },
    { model_slug: '017', field: 'spark_plug' },
    { model_slug: '018', field: 'spark_plug' },
    { model_slug: 'fs-350', field: 'power_kw' }
  ].map((entry) => {
    const fact = findExpectedFact(activatedStore, entry.model_slug, entry.field);
    const apiResult = entry.model_slug === 'fs-350' ? resultFs350 : getResult(entry.model_slug.toUpperCase().replace('-', ' '));
    return {
      model_slug: entry.model_slug,
      field: entry.field,
      fact_id: fact?.fact_id || null,
      staging_source_locator: fact?.source_locator || null,
      activated_value: fact?.normalized_value ?? null,
      resolver_value: buildPublicTechnicalSpecs(entry.model_slug, { ...database, public_evidence: activatedStore })[entry.field] ?? null,
      api_value: apiResult?.technicalSpecs?.[entry.field] ?? null,
      api_source_locator: apiResult?.publicEvidenceFacts?.find((row) => row.field === entry.field)?.sourceLocator || null
    };
  });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    trace_records: traceRecords,
    '009_RESULT': {
      expected: expected009,
      actual: result009.technicalSpecs || {},
      pass: expected009.displacement_cc === result009.technicalSpecs?.displacement_cc
        && expected009.bore_mm === result009.technicalSpecs?.bore_mm
        && expected009.stroke_mm === result009.technicalSpecs?.stroke_mm
        && expected009.power_kw === result009.technicalSpecs?.power_kw
        && expected009.power_hp === result009.technicalSpecs?.power_hp
        && expected009.idle_speed_rpm === result009.technicalSpecs?.idle_speed_rpm
        && expected009.spark_plug === result009.technicalSpecs?.spark_plug
        && expected009.electrode_gap_mm === result009.technicalSpecs?.electrode_gap_mm
    },
    '017_SPARK_RESULT': result017.technicalSpecs?.spark_plug || null,
    '018_SPARK_RESULT': result018.technicalSpecs?.spark_plug || null,
    '026_RESULT': {
      spark_plug: result026.technicalSpecs?.spark_plug || null,
      pass: String(result026.technicalSpecs?.spark_plug || '').includes('BOSCH WSR 6 F')
        && String(result026.technicalSpecs?.spark_plug || '').includes('NGK BPMR 7 A')
    },
    '046_RESULT': {
      spark_plug: result046.technicalSpecs?.spark_plug || null,
      stroke_present: Object.prototype.hasOwnProperty.call(result046.technicalSpecs || {}, 'stroke_mm'),
      pass: !Object.prototype.hasOwnProperty.call(result046.technicalSpecs || {}, 'stroke_mm')
    },
    'FS350_RESULT': {
      source_locator: resultFs350.publicEvidenceFacts?.find((row) => row.field === 'power_kw')?.sourceLocator || null,
      source_heading: resultFs350.publicEvidenceFacts?.find((row) => row.field === 'power_kw')?.sourceHeading || null,
      pass: String(resultFs350.publicEvidenceFacts?.find((row) => row.field === 'power_kw')?.sourceLocator || '').includes('doc/TS_Data/FS200_body.htm')
        && String(resultFs350.publicEvidenceFacts?.find((row) => row.field === 'power_kw')?.sourceHeading || '').toUpperCase().includes('FS 350')
    },
    MS170_009_TECHNICAL_FACTS: ms170Facts,
    MS180_009_TECHNICAL_FACTS: ms180Facts,
    VARIANT_SPEC_LEAKS: variantLeaks.length,
    FUZZY_MODEL_SPEC_ATTACHMENTS: fuzzyLeaks.length,
    PROBABLE_SERIAL_SPEC_ATTACHMENTS: probableSerialLeaks,
    PART_NUMBER_MODEL_SPEC_ATTACHMENTS: partLeaks,
    NUMERIC_TOKEN_MODEL_COLLISIONS: numericLeaks.length
  };
}

function extractRawModelMetric(model, field, formatter) {
  const value = model?.[field];
  if (value == null || value === '') return null;
  return formatter ? formatter(value) : String(value);
}

async function buildModelPageValidation(baseUrl, database, activatedStore) {
  const targets = [
    { label: '026', slug: '026', mode: 'local' },
    { label: '046', slug: '046', mode: 'local' },
    { label: '009', slug: '009', mode: 'local' },
    { label: 'FS350', slug: 'fs-350', mode: 'server', path: '/bosmaaiers/fs-350/' },
    { label: 'MS170', slug: 'ms-170', mode: 'server', path: '/kettingzagen/ms-170/' },
    { label: 'MS180', slug: 'ms-180', mode: 'server', path: '/kettingzagen/ms-180/' }
  ];

  const records = [];
  for (const target of targets) {
    let status = 200;
    let html;
    if (target.mode === 'server') {
      const response = await fetchText(baseUrl, target.path);
      status = response.status;
      html = response.body;
    } else {
      html = renderModelPageHtml(createSyntheticModel(target.slug, database, activatedStore), { ...database, public_evidence: activatedStore }, PRIMARY_ORIGIN);
    }

    const meta = extractHtmlMeta(html);
    const rawModel = (database.models || []).find((model) => model.slug === target.slug) || null;
    const bannedPower = extractRawModelMetric(rawModel, 'power_kw', (value) => `${value} kW`);
    const bannedDisplacement = extractRawModelMetric(rawModel, 'displacement_cc', (value) => `${value} cc`);
    const undefinedCount = (html.match(/undefined/gi) || []).length;
    const nullCount = (html.match(/>null</gi) || []).length;
    const windowsPathCount = countWindowsPaths(html);

    const rawFallbackLeak = (target.slug === 'ms-170' || target.slug === 'ms-180')
      ? [bannedPower, bannedDisplacement].filter(Boolean).some((token) => html.includes(token))
      : false;

    records.push({
      label: target.label,
      model_slug: target.slug,
      source: target.mode === 'server' ? target.path : 'LOCAL_RENDER',
      http_status: status,
      title: meta.title,
      canonical: meta.canonical,
      robots: meta.robots,
      json_ld_types: meta.jsonLdTypes,
      undefined_count: undefinedCount,
      null_count: nullCount,
      windows_path_count: windowsPathCount,
      raw_fallback_leak: rawFallbackLeak,
      contains_conflict_text: html.includes('Bronverschil gevonden'),
      contains_40_mm: html.includes('40 mm'),
      contains_36_mm: html.includes('36 mm'),
      contains_bosch_wsr_6_f: /bosch wsr 6 f/i.test(html),
      contains_ngk_bpmr_7_a: /ngk bpmr 7 a/i.test(html)
    });
  }

  const page046 = records.find((row) => row.model_slug === '046');
  const page026 = records.find((row) => row.model_slug === '026');
  const rawLeaks = records.filter((row) => row.raw_fallback_leak).length;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    '046_CONFLICT_UI': page046 && page046.contains_conflict_text && page046.contains_40_mm && page046.contains_36_mm ? 'PASS' : 'FAIL',
    '026_BASELINE_SPARK_PRESERVED': page026 && page026.contains_bosch_wsr_6_f && page026.contains_ngk_bpmr_7_a ? 'PASS' : 'FAIL',
    RAW_TECHNICAL_FALLBACK_LEAKS: rawLeaks,
    MODEL_PAGE_VALIDATION: records.every((row) => row.http_status === 200 && row.undefined_count === 0 && row.null_count === 0 && row.windows_path_count === 0 && !row.raw_fallback_leak) ? 'PASS' : 'FAIL'
  };
}

function buildSafeSyntheticSchemaModel(modelSlug, modelName, categorySlug, documentNumber, technicalSpecs = {}) {
  return {
    id: modelSlug.replace(/-/g, '_'),
    slug: modelSlug,
    model_name: modelName,
    category: categorySlug === 'bosmaaiers' ? 'Bosmaaier' : 'Kettingzaag',
    category_slug: categorySlug,
    displacement_cc: technicalSpecs.displacement_cc || null,
    power_kw: technicalSpecs.power_kw || null,
    provenance: {
      source_document_number: documentNumber
    }
  };
}

function getProductNode(jsonLd) {
  const graph = Array.isArray(jsonLd?.['@graph']) ? jsonLd['@graph'] : [];
  return graph.find((node) => node['@type'] === 'Product') || null;
}

function buildStructuredDataValidation(database, activatedStore) {
  const overlayDb = { ...database, public_evidence: activatedStore };
  const public026 = buildPublicEvidenceFields('026', overlayDb);
  const public046 = buildPublicEvidenceFields('046', overlayDb);
  const public009 = buildPublicEvidenceFields('009', overlayDb);
  const ms261 = (database.models || []).find((model) => model.slug === 'ms-261');

  const schema026 = buildStructuredData({
    pageType: 'model',
    model: buildSafeSyntheticSchemaModel('026', '026', 'kettingzagen', '0458-133-3021', {
      displacement_cc: 48.7,
      power_kw: 2.6
    }),
    publicEvidence: { fields: public026, modelKey: '026', summary: null },
    breadcrumbs: [{ name: 'Home', url: '/' }],
    url: `${PRIMARY_ORIGIN}/synthetic/026/`
  });
  const schema046 = buildStructuredData({
    pageType: 'model',
    model: buildSafeSyntheticSchemaModel('046', '046', 'kettingzagen', '0458-145-3021', {
      displacement_cc: 76.5,
      power_kw: 4.6
    }),
    publicEvidence: { fields: public046, modelKey: '046', summary: null },
    breadcrumbs: [{ name: 'Home', url: '/' }],
    url: `${PRIMARY_ORIGIN}/synthetic/046/`
  });
  const mismatchSchema = buildStructuredData({
    pageType: 'model',
    model: ms261,
    publicEvidence: { fields: public026, modelKey: '026', summary: null },
    breadcrumbs: [{ name: 'Home', url: '/' }],
    url: `${PRIMARY_ORIGIN}/kettingzagen/ms-261/`
  });
  const schema009 = buildStructuredData({
    pageType: 'model',
    model: createSyntheticModel('009', database, activatedStore),
    publicEvidence: { fields: public009, modelKey: '009', summary: null },
    breadcrumbs: [{ name: 'Home', url: '/' }],
    url: `${PRIMARY_ORIGIN}/modellen-onbekend/009/`
  });

  const product026 = getProductNode(schema026);
  const product046 = getProductNode(schema046);
  const productMismatch = getProductNode(mismatchSchema);
  const product009 = getProductNode(schema009);
  const allowed026Values = new Set(
    Object.entries(public026)
      .filter(([, field]) => field.single_value_eligible && field.value != null)
      .map(([key, field]) => `${key}:${field.value}${field.unit ? ` ${field.unit}` : ''}`)
  );
  const prop026 = product026?.additionalProperty || [];
  const mismatches026 = prop026.filter((property) => {
    const value = String(property.value || '');
    return ![...allowed026Values].some((entry) => value === entry.split(':').slice(1).join(':'));
  });
  const strokeProperty046 = (product046?.additionalProperty || []).find((property) => property.name === 'Slag') || null;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    schema_026_types: extractJsonLdObjects(`<script type="application/ld+json">${JSON.stringify(schema026)}</script>`).flatMap((entry) => flattenJsonLdTypes(entry)),
    schema_046_types: extractJsonLdObjects(`<script type="application/ld+json">${JSON.stringify(schema046)}</script>`).flatMap((entry) => flattenJsonLdTypes(entry)),
    product_026_property_count: prop026.length,
    product_046_present: Boolean(product046),
    product_009_present: Boolean(product009),
    negative_ms261_with_026_evidence: productMismatch ? 'FAIL' : 'PASS',
    '026_positive_binding': product026 && mismatches026.length === 0 && prop026.length > 0 ? 'PASS' : 'FAIL',
    '046_conflicted_stroke_excluded': !strokeProperty046 ? 'PASS' : 'FAIL',
    SCHEMA_MODEL_BINDING_MISMATCHES: productMismatch ? 1 : 0,
    records: [
      { model_slug: '026', product_present: Boolean(product026), properties: prop026 },
      { model_slug: '046', product_present: Boolean(product046), properties: product046?.additionalProperty || [] },
      { model_slug: '009', product_present: Boolean(product009), properties: product009?.additionalProperty || [] },
      { model_slug: 'ms-261', mismatch_blocked: !productMismatch }
    ],
    STRUCTURED_DATA_VALIDATION: product026 && mismatches026.length === 0 && !strokeProperty046 && !productMismatch ? 'PASS' : 'FAIL'
  };
}

async function buildComparisonValidation(baseUrl, database) {
  const canonical = await fetchText(baseUrl, '/vergelijk/ms-260-vs-ms-261/');
  const compact = extractHtmlMeta(canonical.body);
  const ms261 = (database.models || []).find((model) => model.slug === 'ms-261');
  const bannedPower = extractRawModelMetric(ms261, 'power_kw', (value) => `${value} kW`);
  const bannedDisplacement = extractRawModelMetric(ms261, 'displacement_cc', (value) => `${value} cc`);
  const rawLeak = [bannedPower, bannedDisplacement].filter(Boolean).some((token) => canonical.body.includes(token));
  const containsUnknown = canonical.body.includes('Niet betrouwbaar gedocumenteerd');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    record: {
      path: '/vergelijk/ms-260-vs-ms-261/',
      http_status: canonical.status,
      title: compact.title,
      canonical: compact.canonical,
      robots: compact.robots,
      json_ld_types: compact.jsonLdTypes,
      contains_unknown: containsUnknown,
      raw_fallback_leak: rawLeak
    },
    COMPARISON_VALIDATION: canonical.status === 200 && containsUnknown && !rawLeak ? 'PASS' : 'FAIL'
  };
}

function buildPassportAuditEntry(label, result) {
  const passport = buildPassportViewModel(result);
  const html = renderStihlPassportHtml(result);
  return {
    label,
    identity_status: passport.identityStatus,
    has_technical_specs: passport.hasTechnicalSpecs,
    technical_rows: passport.technicalSpecRows,
    html_contains_default_50_2: html.includes('50.2'),
    html_contains_default_4_1: html.includes('4.1'),
    html_contains_default_3_0: html.includes('3.0'),
    html_contains_default_325: html.includes('.325'),
    html_contains_default_1_3: html.includes('1.3'),
    contains_windows_path: countWindowsPaths(html) > 0
  };
}

function buildPassportValidation(database, activatedStore) {
  const overlayDb = { ...database, public_evidence: activatedStore };
  const result026 = decodeStihlCode('026', overlayDb);
  const result046 = decodeStihlCode('046', overlayDb);
  const probable = decodeStihlCode('184592301', overlayDb);
  const fuzzy = decodeStihlCode('MS999', overlayDb);

  const entries = [
    buildPassportAuditEntry('026', result026),
    buildPassportAuditEntry('046', result046),
    buildPassportAuditEntry('184592301', probable),
    buildPassportAuditEntry('MS999', fuzzy)
  ];

  const unevidencedDefaults = entries.filter((entry) => {
    if (entry.label === '026') return false;
    if (entry.label === '046') return false;
    return entry.has_technical_specs
      || entry.html_contains_default_50_2
      || entry.html_contains_default_4_1
      || entry.html_contains_default_3_0
      || entry.html_contains_default_325
      || entry.html_contains_default_1_3;
  }).length;

  const strokeLeak046 = entries.find((entry) => entry.label === '046')?.technical_rows.some((row) => row.startsWith('Slag:')) || false;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: entries,
    PASSPORT_UNEVIDENCED_DEFAULTS: unevidencedDefaults,
    PASSPORT_VALIDATION: unevidencedDefaults === 0 && !strokeLeak046 && !entries.some((entry) => entry.contains_windows_path) ? 'PASS' : 'FAIL'
  };
}

function buildDecoderRegression(database, activatedStore, apiValidation) {
  const overlayDb = { ...database, public_evidence: activatedStore };
  const results = PRIORITY_MODELS.map((query) => {
    const result = decodeStihlCode(query, overlayDb);
    return {
      query,
      success: result.success,
      model: result.model || null,
      technical_spec_keys: Object.keys(result.technicalSpecs || {}),
      spark_plug: result.technicalSpecs?.spark_plug || null,
      source_status: result.sourceStatus || null
    };
  });

  const spark017 = results.find((row) => row.query === '017')?.spark_plug || null;
  const spark018 = results.find((row) => row.query === '018')?.spark_plug || null;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    priority_results: results,
    trace_records: apiValidation.trace_records,
    '009_RESULT': apiValidation['009_RESULT'],
    '017_SPARK_RESULT': spark017,
    '018_SPARK_RESULT': spark018,
    '026_RESULT': apiValidation['026_RESULT'],
    '046_RESULT': apiValidation['046_RESULT'],
    'FS350_RESULT': apiValidation['FS350_RESULT'],
    'MS170_RESULT': results.find((row) => row.query === 'MS 170') || null,
    'MS180_RESULT': results.find((row) => row.query === 'MS 180') || null,
    DECODER_REGRESSION: apiValidation['009_RESULT'].pass
      && apiValidation['026_RESULT'].pass
      && apiValidation['046_RESULT'].pass
      && apiValidation['FS350_RESULT'].pass
      ? 'PASS'
      : 'FAIL'
  };
}

function evaluate046ConflictWinner(store, database) {
  const fact046 = (store.facts || []).find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm') || null;
  const technicalSpecs046 = buildPublicTechnicalSpecs('046', { ...database, public_evidence: store });
  return Boolean(
    fact046
    && (fact046.single_value_eligible === true || Object.prototype.hasOwnProperty.call(technicalSpecs046, 'stroke_mm'))
  );
}

function buildFailureInjectionReport(auditedStaging, baselineStore, activatedStore, database) {
  const rows = [];

  const mutatedHashSource = cloneJson(auditedStaging);
  mutatedHashSource.facts[0].normalized_value = 99999;
  rows.push({
    check: 'AUDITED_STAGING_HASH_MISMATCH',
    pass: sha256Canonical(mutatedHashSource) !== sha256Canonical(auditedStaging)
  });

  const removalStore = cloneJson(activatedStore);
  removalStore.facts.pop();
  rows.push({
    check: 'FACT_SET_MISMATCH_REMOVAL',
    pass: buildFactIdentityAudit(auditedStaging, removalStore).FACT_SET_MATCH === 'FAIL'
  });

  const extraStore = cloneJson(activatedStore);
  extraStore.facts.push({
    fact_id: 'fabricated-fact',
    model_slug: 'fake',
    field: 'power_kw',
    normalized_value: 999
  });
  rows.push({
    check: 'FACT_SET_MISMATCH_EXTRA',
    pass: buildFactIdentityAudit(auditedStaging, extraStore).FACT_SET_MATCH === 'FAIL'
  });

  const baselineMutationStore = cloneJson(activatedStore);
  baselineMutationStore.facts[0].normalized_value = 12345;
  rows.push({
    check: 'BASELINE_FACT_REGRESSION',
    pass: buildBaselinePreservationAudit(baselineStore, baselineMutationStore).BASELINE_FACTS_CHANGED_AFTER_ACTIVATION > 0
  });

  const winnerStore = cloneJson(activatedStore);
  const winnerFact = winnerStore.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm');
  if (winnerFact) winnerFact.single_value_eligible = true;
  rows.push({
    check: '046_CONFLICT_WINNER_DETECTED',
    pass: evaluate046ConflictWinner(winnerStore, database)
  });

  const lineageLossStore = cloneJson(activatedStore);
  const lineageLossFact = lineageLossStore.facts.find((fact) => fact.model_slug === '009');
  if (lineageLossFact) delete lineageLossFact.source_lineage;
  rows.push({
    check: 'SOURCE_LINEAGE_LOSS_DETECTED',
    pass: buildLineageAudit(baselineStore, lineageLossStore).SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE > 0
  });

  const schemaWrongModel = buildStructuredData({
    pageType: 'model',
    model: (database.models || []).find((model) => model.slug === 'ms-261'),
    publicEvidence: { fields: buildPublicEvidenceFields('026', { ...database, public_evidence: activatedStore }), modelKey: '026' },
    breadcrumbs: [],
    url: `${PRIMARY_ORIGIN}/kettingzagen/ms-261/`
  });
  rows.push({
    check: 'SCHEMA_MODEL_BINDING_BLOCKED',
    pass: !getProductNode(schemaWrongModel)
  });

  rows.push({
    check: 'FUZZY_SPEC_LEAK_DETECTED',
    pass: Object.keys(decodeStihlCode('MS999', { ...database, public_evidence: activatedStore }).technicalSpecs || {}).length === 0
  });
  rows.push({
    check: 'PROBABLE_SERIAL_SPEC_LEAK_DETECTED',
    pass: Object.keys(decodeStihlCode('184592301', { ...database, public_evidence: activatedStore }).technicalSpecs || {}).length === 0
  });
  rows.push({
    check: 'PART_FAMILY_SPEC_LEAK_DETECTED',
    pass: Object.keys(decodeStihlCode('11210210800', { ...database, public_evidence: activatedStore }).technicalSpecs || {}).length === 0
  });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: rows,
    FAILURE_INJECTION: rows.every((row) => row.pass) ? 'PASS' : 'FAIL'
  };
}

function performAtomicWrite(filePath, payload) {
  fs.writeFileSync(PUBLIC_STORE_TMP_PATH, JSON.stringify(payload, null, 2), 'utf8');
  JSON.parse(fs.readFileSync(PUBLIC_STORE_TMP_PATH, 'utf8'));
  fs.renameSync(PUBLIC_STORE_TMP_PATH, filePath);
}

function buildRollbackTest(baselineStore, activatedStore) {
  performAtomicWrite(PUBLIC_STORE_PATH, baselineStore);
  const baselineReloaded = readJson(PUBLIC_STORE_PATH);
  const baselineHashMatch = sha256Canonical(baselineReloaded) === sha256Canonical(baselineStore);
  performAtomicWrite(PUBLIC_STORE_PATH, activatedStore);
  const activatedReloaded = readJson(PUBLIC_STORE_PATH);
  const activatedHashMatch = sha256Canonical(activatedReloaded) === sha256Canonical(activatedStore);
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    ROLLBACK_BASELINE_HASH_MATCH: baselineHashMatch ? 'PASS' : 'FAIL',
    RESTORED_ACTIVATED_HASH_MATCH: activatedHashMatch ? 'PASS' : 'FAIL',
    ROLLBACK_TEST: baselineHashMatch && activatedHashMatch ? 'PASS' : 'FAIL'
  };
}

async function buildRuntimeSnapshot(baseUrl, database, baselineStore, activatedStore) {
  const consumerInventory = buildConsumerInventory();
  const apiValidation = await buildApiValidation(baseUrl, database, activatedStore);
  const modelPageValidation = await buildModelPageValidation(baseUrl, database, activatedStore);
  const structuredDataValidation = buildStructuredDataValidation(database, activatedStore);
  const comparisonValidation = await buildComparisonValidation(baseUrl, database);
  const passportValidation = buildPassportValidation(database, activatedStore);
  const decoderRegression = buildDecoderRegression(database, activatedStore, apiValidation);

  return {
    consumerInventory,
    apiValidation,
    modelPageValidation,
    structuredDataValidation,
    comparisonValidation,
    passportValidation,
    decoderRegression
  };
}

function buildIdempotencyReport(firstSnapshot, secondSnapshot, activationIdentity, factIdentityAudit, indexIntegrityAudit, coverageAudit) {
  const projectSnapshot = (snapshot) => ({
    consumerInventory: snapshot.consumerInventory.consumers,
    apiValidation: {
      records: snapshot.apiValidation.records,
      trace_records: snapshot.apiValidation.trace_records,
      metrics: {
        '009_RESULT': snapshot.apiValidation['009_RESULT'],
        '017_SPARK_RESULT': snapshot.apiValidation['017_SPARK_RESULT'],
        '018_SPARK_RESULT': snapshot.apiValidation['018_SPARK_RESULT'],
        '026_RESULT': snapshot.apiValidation['026_RESULT'],
        '046_RESULT': snapshot.apiValidation['046_RESULT'],
        'FS350_RESULT': snapshot.apiValidation['FS350_RESULT'],
        MS170_009_TECHNICAL_FACTS: snapshot.apiValidation.MS170_009_TECHNICAL_FACTS,
        MS180_009_TECHNICAL_FACTS: snapshot.apiValidation.MS180_009_TECHNICAL_FACTS,
        VARIANT_SPEC_LEAKS: snapshot.apiValidation.VARIANT_SPEC_LEAKS,
        FUZZY_MODEL_SPEC_ATTACHMENTS: snapshot.apiValidation.FUZZY_MODEL_SPEC_ATTACHMENTS,
        PROBABLE_SERIAL_SPEC_ATTACHMENTS: snapshot.apiValidation.PROBABLE_SERIAL_SPEC_ATTACHMENTS,
        PART_NUMBER_MODEL_SPEC_ATTACHMENTS: snapshot.apiValidation.PART_NUMBER_MODEL_SPEC_ATTACHMENTS,
        NUMERIC_TOKEN_MODEL_COLLISIONS: snapshot.apiValidation.NUMERIC_TOKEN_MODEL_COLLISIONS
      }
    },
    modelPageValidation: snapshot.modelPageValidation,
    structuredDataValidation: snapshot.structuredDataValidation,
    comparisonValidation: snapshot.comparisonValidation,
    passportValidation: snapshot.passportValidation,
    decoderRegression: snapshot.decoderRegression
  });

  const left = sanitizeForHash({
    activationIdentity,
    factIdentityAudit,
    indexIntegrityAudit,
    coverageAudit,
    snapshot: projectSnapshot(firstSnapshot)
  });
  const right = sanitizeForHash({
    activationIdentity,
    factIdentityAudit,
    indexIntegrityAudit,
    coverageAudit,
    snapshot: projectSnapshot(secondSnapshot)
  });
  const leftHash = sha256Canonical(left);
  const rightHash = sha256Canonical(right);
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    LEFT_HASH: leftHash,
    RIGHT_HASH: rightHash,
    IDEMPOTENCY: leftHash === rightHash ? 'PASS' : 'FAIL'
  };
}

function buildActivationSourceIdentity(immutableInputs, activationResult, sourceValidation) {
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    AUDITED_STAGING_RAW_SHA256: sha256String(immutableInputs.auditedStagingRaw),
    AUDITED_STAGING_CANONICAL_SHA256: sha256Canonical(immutableInputs.auditedStaging),
    ACTIVATED_PUBLIC_STORE_RAW_SHA256: activationResult.activatedPublicStoreRawSha256,
    ACTIVATED_PUBLIC_STORE_CANONICAL_SHA256: activationResult.activatedPublicStoreCanonicalSha256,
    IMMUTABLE_AUDITED_STAGING_USED: sourceValidation.ACTIVATION_SOURCE_VALIDATION === 'PASS' ? 'PASS' : 'FAIL',
    ACTIVATION_HASH_MATCH: sha256Canonical(immutableInputs.auditedStaging) === activationResult.activatedPublicStoreCanonicalSha256 ? 'PASS' : 'FAIL',
    ACTIVATED_PUBLIC_FACT_COUNT: (activationResult.activatedStore.facts || []).length
  };
}

function buildFinalReport(context) {
  const publicWindowsPathCount =
    countWindowsPaths(context.activationSourceIdentity)
    + countWindowsPaths(context.factIdentityAudit)
    + countWindowsPaths(context.baselinePreservationAudit)
    + countWindowsPaths(context.lineageAudit)
    + countWindowsPaths(context.indexIntegrityAudit)
    + countWindowsPaths(context.runtimeSnapshot.apiValidation)
    + countWindowsPaths(context.runtimeSnapshot.modelPageValidation)
    + countWindowsPaths(context.runtimeSnapshot.structuredDataValidation)
    + countWindowsPaths(context.runtimeSnapshot.comparisonValidation)
    + countWindowsPaths(context.runtimeSnapshot.passportValidation)
    + countWindowsPaths(context.runtimeSnapshot.decoderRegression);

  const canonicalBefore = (context.immutableInputs.baselineStore.facts || []).filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length;
  const canonicalAfter = (context.activationResult.activatedStore.facts || []).filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length;
  const unexpectedCanonicalPromotions = canonicalAfter > canonicalBefore ? canonicalAfter - canonicalBefore : 0;

  const apiValidation = context.runtimeSnapshot.apiValidation;
  const modelPageValidation = context.runtimeSnapshot.modelPageValidation;
  const structuredDataValidation = context.runtimeSnapshot.structuredDataValidation;
  const comparisonValidation = context.runtimeSnapshot.comparisonValidation;
  const passportValidation = context.runtimeSnapshot.passportValidation;
  const decoderRegression = context.runtimeSnapshot.decoderRegression;
  const coverage = context.coverageAudit;
  const baselinePreservation = context.baselinePreservationAudit;
  const lineage = context.lineageAudit;
  const indexAudit = context.indexIntegrityAudit;
  const activationSourceIdentity = context.activationSourceIdentity;

  const testSuitePass = context.preflight.PRECHECK === 'PASS'
    && context.sourceValidation.ACTIVATION_SOURCE_VALIDATION === 'PASS'
    && activationSourceIdentity.IMMUTABLE_AUDITED_STAGING_USED === 'PASS'
    && activationSourceIdentity.ACTIVATION_HASH_MATCH === 'PASS'
    && context.factIdentityAudit.ACTIVATION_FACTS_ADDED === 0
    && context.factIdentityAudit.ACTIVATION_FACTS_REMOVED === 0
    && context.factIdentityAudit.ACTIVATION_FACTS_CHANGED === 0
    && baselinePreservation.BASELINE_FACTS_CHANGED_AFTER_ACTIVATION === 0
    && baselinePreservation.BASELINE_FACTS_REMOVED_AFTER_ACTIVATION === 0
    && coverage.PUBLIC_FACTS_AFTER === 114
    && coverage.PUBLIC_FACTS_BEFORE === 22
    && lineage.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE === 0
    && lineage.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS === 0
    && lineage.SCS_FALSE_INDEPENDENCE_PROMOTIONS === 0
    && lineage.DERIVATIVE_SOURCE_PROMOTIONS === 0
    && lineage.PROMOTIONS_WITHOUT_SOURCE_HEADING === 0
    && lineage.PROMOTIONS_WITHOUT_SOURCE_LOCATOR === 0
    && apiValidation.MS170_009_TECHNICAL_FACTS === 0
    && apiValidation.MS180_009_TECHNICAL_FACTS === 0
    && apiValidation.VARIANT_SPEC_LEAKS === 0
    && apiValidation.FUZZY_MODEL_SPEC_ATTACHMENTS === 0
    && apiValidation.PROBABLE_SERIAL_SPEC_ATTACHMENTS === 0
    && apiValidation.PART_NUMBER_MODEL_SPEC_ATTACHMENTS === 0
    && apiValidation.NUMERIC_TOKEN_MODEL_COLLISIONS === 0
    && modelPageValidation['046_CONFLICT_UI'] === 'PASS'
    && modelPageValidation['026_BASELINE_SPARK_PRESERVED'] === 'PASS'
    && modelPageValidation.RAW_TECHNICAL_FALLBACK_LEAKS === 0
    && structuredDataValidation.SCHEMA_MODEL_BINDING_MISMATCHES === 0
    && passportValidation.PASSPORT_UNEVIDENCED_DEFAULTS === 0
    && indexAudit.FACT_ID_COLLISIONS === 0
    && indexAudit.DUPLICATE_FACT_IDS === 0
    && indexAudit.ORPHAN_FACT_IDS === 0
    && indexAudit.MISSING_MODEL_INDEX_FACTS === 0
    && indexAudit.MISSING_FIELD_INDEX_FACTS === 0
    && indexAudit.DUPLICATE_INDEX_FACT_IDS === 0
    && publicWindowsPathCount === 0
    && unexpectedCanonicalPromotions === 0
    && context.canonicalDatabaseChanged === 'NO'
    && context.failureInjection.FAILURE_INJECTION === 'PASS'
    && context.rollbackTest.ROLLBACK_TEST === 'PASS'
    && context.idempotencyReport.IDEMPOTENCY === 'PASS'
    && modelPageValidation.MODEL_PAGE_VALIDATION === 'PASS'
    && structuredDataValidation.STRUCTURED_DATA_VALIDATION === 'PASS'
    && comparisonValidation.COMPARISON_VALIDATION === 'PASS'
    && passportValidation.PASSPORT_VALIDATION === 'PASS'
    && decoderRegression.DECODER_REGRESSION === 'PASS';

  return {
    'FASE 35C.4.3.2 FINAL REPORT': true,
    SOURCE_COMMIT,
    PRECHECK: context.preflight.PRECHECK,
    AUDITED_STAGING_RAW_SHA256: activationSourceIdentity.AUDITED_STAGING_RAW_SHA256,
    AUDITED_STAGING_CANONICAL_SHA256: activationSourceIdentity.AUDITED_STAGING_CANONICAL_SHA256,
    ACTIVATED_PUBLIC_STORE_RAW_SHA256: activationSourceIdentity.ACTIVATED_PUBLIC_STORE_RAW_SHA256,
    ACTIVATED_PUBLIC_STORE_CANONICAL_SHA256: activationSourceIdentity.ACTIVATED_PUBLIC_STORE_CANONICAL_SHA256,
    IMMUTABLE_AUDITED_STAGING_USED: activationSourceIdentity.IMMUTABLE_AUDITED_STAGING_USED,
    ACTIVATION_HASH_MATCH: activationSourceIdentity.ACTIVATION_HASH_MATCH,
    PUBLIC_FACTS_BEFORE: coverage.PUBLIC_FACTS_BEFORE,
    PUBLIC_FACTS_AFTER: coverage.PUBLIC_FACTS_AFTER,
    SAFE_NEW_SCS_FACTS: context.sourceReportsFinalReport.SAFE_NEW_SCS_FACTS,
    BASELINE_FACTS_PRESERVED_AFTER_ACTIVATION: baselinePreservation.BASELINE_FACTS_PRESERVED_AFTER_ACTIVATION,
    BASELINE_FACTS_CHANGED_AFTER_ACTIVATION: baselinePreservation.BASELINE_FACTS_CHANGED_AFTER_ACTIVATION,
    BASELINE_FACTS_REMOVED_AFTER_ACTIVATION: baselinePreservation.BASELINE_FACTS_REMOVED_AFTER_ACTIVATION,
    ACTIVATION_FACTS_ADDED: context.factIdentityAudit.ACTIVATION_FACTS_ADDED,
    ACTIVATION_FACTS_REMOVED: context.factIdentityAudit.ACTIVATION_FACTS_REMOVED,
    ACTIVATION_FACTS_CHANGED: context.factIdentityAudit.ACTIVATION_FACTS_CHANGED,
    MODELS_WITH_PUBLIC_FACTS_BEFORE: coverage.MODELS_WITH_PUBLIC_FACTS_BEFORE,
    MODELS_WITH_PUBLIC_FACTS_AFTER: coverage.MODELS_WITH_PUBLIC_FACTS_AFTER,
    NEW_PUBLIC_MODELS: coverage.NEW_PUBLIC_MODELS,
    '026_BASELINE_SPARK_PRESERVED': modelPageValidation['026_BASELINE_SPARK_PRESERVED'],
    '046_BASELINE_SPARK_PRESERVED': apiValidation['046_RESULT'].pass ? 'PASS' : 'FAIL',
    '046_STROKE_STATUS': context.sourceReportsRegression['046_STROKE_STATUS'],
    '046_STROKE_SINGLE_VALUE_ELIGIBLE': context.sourceReportsRegression['046_STROKE_SINGLE_VALUE_ELIGIBLE'],
    '046_CONFLICT_UI': modelPageValidation['046_CONFLICT_UI'],
    FS350_SCOPE_RUNTIME: apiValidation['FS350_RESULT'].pass ? 'PASS' : 'FAIL',
    MS170_009_TECHNICAL_FACTS: apiValidation.MS170_009_TECHNICAL_FACTS,
    MS180_009_TECHNICAL_FACTS: apiValidation.MS180_009_TECHNICAL_FACTS,
    VARIANT_SPEC_LEAKS: apiValidation.VARIANT_SPEC_LEAKS,
    FUZZY_MODEL_SPEC_ATTACHMENTS: apiValidation.FUZZY_MODEL_SPEC_ATTACHMENTS,
    PROBABLE_SERIAL_SPEC_ATTACHMENTS: apiValidation.PROBABLE_SERIAL_SPEC_ATTACHMENTS,
    PART_NUMBER_MODEL_SPEC_ATTACHMENTS: apiValidation.PART_NUMBER_MODEL_SPEC_ATTACHMENTS,
    NUMERIC_TOKEN_MODEL_COLLISIONS: apiValidation.NUMERIC_TOKEN_MODEL_COLLISIONS,
    SCS_FALSE_INDEPENDENCE_PROMOTIONS: lineage.SCS_FALSE_INDEPENDENCE_PROMOTIONS,
    SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE: lineage.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE,
    SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS: lineage.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS,
    DERIVATIVE_SOURCE_PROMOTIONS: lineage.DERIVATIVE_SOURCE_PROMOTIONS,
    RAW_TECHNICAL_FALLBACK_LEAKS: modelPageValidation.RAW_TECHNICAL_FALLBACK_LEAKS,
    SCHEMA_MODEL_BINDING_MISMATCHES: structuredDataValidation.SCHEMA_MODEL_BINDING_MISMATCHES,
    PASSPORT_UNEVIDENCED_DEFAULTS: passportValidation.PASSPORT_UNEVIDENCED_DEFAULTS,
    UNEXPECTED_CANONICAL_PROMOTIONS: unexpectedCanonicalPromotions,
    PUBLIC_WINDOWS_PATH_COUNT: publicWindowsPathCount,
    CANONICAL_DATABASE_CHANGED: context.canonicalDatabaseChanged,
    API_VALIDATION: apiValidation['009_RESULT'].pass && apiValidation['026_RESULT'].pass && apiValidation['046_RESULT'].pass && apiValidation['FS350_RESULT'].pass ? 'PASS' : 'FAIL',
    MODEL_PAGE_VALIDATION: modelPageValidation.MODEL_PAGE_VALIDATION,
    STRUCTURED_DATA_VALIDATION: structuredDataValidation.STRUCTURED_DATA_VALIDATION,
    COMPARISON_VALIDATION: comparisonValidation.COMPARISON_VALIDATION,
    PASSPORT_VALIDATION: passportValidation.PASSPORT_VALIDATION,
    DECODER_REGRESSION: decoderRegression.DECODER_REGRESSION,
    FAILURE_INJECTION: context.failureInjection.FAILURE_INJECTION,
    ROLLBACK_TEST: context.rollbackTest.ROLLBACK_TEST,
    IDEMPOTENCY: context.idempotencyReport.IDEMPOTENCY,
    TEST_SUITE: testSuitePass ? 'PASS' : 'FAIL',
    FINAL_STATUS: testSuitePass ? 'PASS' : 'FAIL',
    PUBLIC_EVIDENCE_STORE_PROMOTED: 'NO',
    CANONICAL_DATABASE_MUTATED: 'NO'
  };
}

export async function main() {
  const preflight = buildPreflightReport();
  writeJson(OUTPUTS.preflight, preflight);

  const immutableInputs = loadImmutableInputs();
  const sourceValidation = validateActivationSource(immutableInputs.sourceReports, immutableInputs.auditedStaging);
  const databaseBeforeHash = hashFileIfExists(DATABASE_JSON_PATH);
  const databaseDbBeforeHash = hashFileIfExists(DATABASE_DB_PATH);

  if (preflight.PRECHECK !== 'PASS' || sourceValidation.ACTIVATION_SOURCE_VALIDATION !== 'PASS') {
    const blockedReport = {
      'FASE 35C.4.3.2 FINAL REPORT': true,
      SOURCE_COMMIT,
      PRECHECK: preflight.PRECHECK,
      ACTIVATION_SOURCE_VALIDATION: sourceValidation.ACTIVATION_SOURCE_VALIDATION,
      TEST_SUITE: 'FAIL',
      FINAL_STATUS: 'FAIL'
    };
    writeJson(OUTPUTS.activationSourceIdentity, sourceValidation);
    writeJson(OUTPUTS.finalReport, blockedReport);
    return blockedReport;
  }

  const activationResult = activatePublicStore(immutableInputs.auditedStagingRaw, immutableInputs.auditedStaging);
  const activationSourceIdentity = buildActivationSourceIdentity(immutableInputs, activationResult, sourceValidation);
  const factIdentityAudit = buildFactIdentityAudit(immutableInputs.auditedStaging, activationResult.activatedStore);
  const baselinePreservationAudit = buildBaselinePreservationAudit(immutableInputs.baselineStore, activationResult.activatedStore);
  const lineageAudit = buildLineageAudit(immutableInputs.baselineStore, activationResult.activatedStore);
  const indexIntegrityAudit = buildIndexIntegrityAudit(activationResult.activatedStore);
  const coverageAudit = buildCoverageAudit(immutableInputs.baselineStore, activationResult.activatedStore);
  const consumerInventory = buildConsumerInventory();

  let server;
  let runtimeSnapshot;
  try {
    server = await startLocalServer();
    const firstSnapshot = await buildRuntimeSnapshot(server.baseUrl, readJson(DATABASE_JSON_PATH), immutableInputs.baselineStore, activationResult.activatedStore);
    await stopLocalServer(server.child);
    server = await startLocalServer();
    const secondSnapshot = await buildRuntimeSnapshot(server.baseUrl, readJson(DATABASE_JSON_PATH), immutableInputs.baselineStore, activationResult.activatedStore);
    runtimeSnapshot = firstSnapshot;

    const failureInjection = buildFailureInjectionReport(immutableInputs.auditedStaging, immutableInputs.baselineStore, activationResult.activatedStore, readJson(DATABASE_JSON_PATH));
    const rollbackTest = buildRollbackTest(immutableInputs.baselineStore, activationResult.activatedStore);
    const idempotencyReport = buildIdempotencyReport(firstSnapshot, secondSnapshot, activationSourceIdentity, factIdentityAudit, indexIntegrityAudit, coverageAudit);
    const databaseAfterHash = hashFileIfExists(DATABASE_JSON_PATH);
    const databaseDbAfterHash = hashFileIfExists(DATABASE_DB_PATH);
    const canonicalDatabaseChanged = databaseBeforeHash === databaseAfterHash ? 'NO' : 'YES';

    const finalReport = buildFinalReport({
      preflight,
      immutableInputs,
      sourceValidation,
      activationResult,
      activationSourceIdentity,
      factIdentityAudit,
      baselinePreservationAudit,
      lineageAudit,
      indexIntegrityAudit,
      coverageAudit,
      consumerInventory,
      runtimeSnapshot,
      failureInjection,
      rollbackTest,
      idempotencyReport,
      canonicalDatabaseChanged,
      sourceReportsFinalReport: immutableInputs.sourceReports.finalReport,
      sourceReportsRegression: immutableInputs.sourceReports.regression026046Audit
    });

    writeJson(OUTPUTS.activationSourceIdentity, activationSourceIdentity);
    writeJson(OUTPUTS.factIdentityAudit, factIdentityAudit);
    writeJson(OUTPUTS.baselinePreservationAudit, baselinePreservationAudit);
    writeJson(OUTPUTS.lineageAudit, lineageAudit);
    writeJson(OUTPUTS.indexIntegrityAudit, indexIntegrityAudit);
    writeJson(OUTPUTS.consumerInventory, consumerInventory);
    writeJson(OUTPUTS.apiValidation, runtimeSnapshot.apiValidation);
    writeJson(OUTPUTS.modelPageValidation, runtimeSnapshot.modelPageValidation);
    writeJson(OUTPUTS.structuredDataValidation, runtimeSnapshot.structuredDataValidation);
    writeJson(OUTPUTS.comparisonValidation, runtimeSnapshot.comparisonValidation);
    writeJson(OUTPUTS.passportValidation, runtimeSnapshot.passportValidation);
    writeJson(OUTPUTS.decoderRegression, runtimeSnapshot.decoderRegression);
    writeJson(OUTPUTS.coverage, coverageAudit);
    writeJson(OUTPUTS.failureInjection, failureInjection);
    writeJson(OUTPUTS.rollback, rollbackTest);
    writeJson(OUTPUTS.idempotency, idempotencyReport);
    writeJson(OUTPUTS.finalReport, finalReport);

    return finalReport;
  } finally {
    await stopLocalServer(server?.child);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((report) => {
      console.log('Phase 35C.4.3.2 public evidence activation completed.');
      console.log(`Precheck: ${report.PRECHECK}`);
      console.log(`Final status: ${report.FINAL_STATUS}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
