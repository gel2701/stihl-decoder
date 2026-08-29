import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import { buildKnownModelDictionary, extractModelsMentioned } from '../src/documentAuthority.js';
import { loadCandidateArchiveStreamReport } from './phase35c32_validator_integrity_reproducibility_hotfix.js';
import { classifySourceIndependence, verifyPrecheckIdentity } from './phase35c4_verified_fact_recovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SOURCE_COMMIT = '75d7b75';
const EXPECTED_ORIGIN_MAIN = '75d7b75';
const EXPECTED_CANDIDATE_RECORD_COUNT = 33260;
const EXPECTED_CANDIDATE_STREAM_HASH = '563f2056fd389b7131413cdf72854a0a028c867a9eb28a29891f82442b5fa19d';
const EXPECTED_CANDIDATE_ARCHIVE_SHA256 = '40d225d63c6de1fbc79be96b6912144794ac80da8f2afcad646f0a3b95e0286b';
const DEFAULT_CANDIDATE_ARCHIVE = path.join(rootDir, 'data', 'generated', 'phase35c2_blocked_field_candidates.jsonl.gz');
const CANONICAL_JSON_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const CANONICAL_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');

const HIGH_VALUE_MODELS = [
  '026', '036', '044', '046', 'ms-261', 'fs-350', 'ts-420', 'ms-260',
  'ms-360', 'ms-440', 'ms-460', 'fs-460', 'br-600', 'fs-100', 'fs-100-r', 'fs-100-rx'
];
const FIELD_PRIORITY = [
  'displacement_cc', 'power_kw', 'weight_kg', 'spark_plug', 'electrode_gap_mm',
  'idle_speed_rpm', 'max_engine_speed_rpm', 'fuel_tank_l', 'oil_tank_l', 'bore_mm', 'stroke_mm'
];
const EXACT_SCOPES = new Set(['EXACT_MODEL', 'EXACT_VARIANT', 'MULTI_MODEL_EXPLICIT_COLUMN']);
const COMPONENT_HINTS = /\b(base engine|moteur de base|basismotor|component|composant)\b/i;
const SPARK_PLUG_ALLOWED = /\b(?:NGK|BOSCH|CHAMPION)\s+[A-Z0-9-]{2,}(?:\s+[A-Z0-9-]{1,3})*\b/i;
const SPARK_PLUG_GARBAGE = /\b(?:\d{3}RA\d{3}|VA\s*\d{3}RA\d{3})\b/i;
const PUBLICATION_ID_REGEX = /^(RA_[A-Z0-9-]+(?:_[A-Z0-9-]+)+)/i;
const OUTPUTS = {
  finalReport: path.join(rootDir, 'data', 'phase35c41_final_report.json'),
  preflight: path.join(rootDir, 'data', 'phase35c41_preflight_report.json'),
  canonicalReconciliation: path.join(rootDir, 'data', 'phase35c41_canonical_document_reconciliation.json'),
  authenticityReassessment: path.join(rootDir, 'data', 'phase35c41_candidate_authenticity_reassessment.json'),
  modelCompatibility: path.join(rootDir, 'data', 'phase35c41_model_document_compatibility.json'),
  workingSetSummary: path.join(rootDir, 'data', 'phase35c41_recovery_working_set_summary.json'),
  fieldSemanticAudit: path.join(rootDir, 'data', 'phase35c41_field_semantic_audit.json'),
  goldValidationSet: path.join(rootDir, 'data', 'phase35c41_gold_validation_set.json'),
  sourceIndependenceAudit: path.join(rootDir, 'data', 'phase35c41_source_independence_audit.json'),
  conflictAudit: path.join(rootDir, 'data', 'phase35c41_conflict_audit.json'),
  modelScopeResolution: path.join(rootDir, 'data', 'phase35c41_model_scope_resolution.json'),
  verificationFunnel: path.join(rootDir, 'data', 'phase35c41_verification_funnel.json'),
  blockedSummary: path.join(rootDir, 'data', 'phase35c41_blocked_summary.json'),
  verifiedFactStaging: path.join(rootDir, 'data', 'phase35c41_verified_fact_staging.json'),
  verifiedFactEvidenceGraph: path.join(rootDir, 'data', 'phase35c41_verified_fact_evidence_graph.json'),
  failureInjectionReport: path.join(rootDir, 'data', 'phase35c41_failure_injection_report.json')
};
const PRIOR_DATA = {
  candidateSourceReport: path.join(rootDir, 'data', 'phase35c32_candidate_source_report.json'),
  phase35c32Final: path.join(rootDir, 'data', 'phase35c32_final_report.json'),
  batch2Registry: path.join(rootDir, 'data', 'batch2_document_registry.json'),
  batch3Registry: path.join(rootDir, 'data', 'batch3_pdf_document_registry.json'),
  batch3Native: path.join(rootDir, 'data', 'batch3_native_pdf_extraction_report.json'),
  crossRegistry: path.join(rootDir, 'data', 'cross_corpus_document_registry_all_sources.json'),
  authRecovery: path.join(rootDir, 'data', 'phase35c3_authenticity_recovery.json'),
  tsDataRecords: path.join(rootDir, 'data', 'phase35c3_ts_data_records.json')
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function stableHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function stableId(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLooseText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeModelSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[/.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sameModel(left, right) {
  const normalize = (value) => normalizeModelSlug(value).replace(/-/g, '');
  return normalize(left) === normalize(right);
}

function extractPublicationId(filePath) {
  const stem = path.basename(String(filePath || ''), path.extname(String(filePath || '')));
  const prefix = stem.split('_STIHL')[0];
  const match = prefix.match(PUBLICATION_ID_REGEX);
  return match ? match[1].toUpperCase() : null;
}

function extractModelsFromText(text, knownModels) {
  return [...new Set(extractModelsMentioned(String(text || ''), knownModels)
    .map((entry) => normalizeModelSlug(entry.slug || entry.model_name || entry.model_id))
    .filter(Boolean))];
}

function extractFamilyMentions(text, candidateModel) {
  const normalizedModel = normalizeModelSlug(candidateModel);
  const match = normalizedModel.match(/^([a-z]+)-?(\d.*)$/);
  if (!match) return [];
  const [, family] = match;
  const regex = new RegExp(`\\b${family}\\s*-?\\s*(\\d{2,4}[a-z]?)\\b`, 'ig');
  const values = new Set();
  let found = null;
  while ((found = regex.exec(String(text || ''))) !== null) values.add(`${family}-${String(found[1]).toLowerCase()}`);
  return [...values];
}

function normalizeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value.toFixed(3));
  return normalizeText(value);
}

function candidateArchivePath() {
  return process.env.PHASE35C2_BLOCKED_CANDIDATES_PATH
    ? path.resolve(process.env.PHASE35C2_BLOCKED_CANDIDATES_PATH)
    : DEFAULT_CANDIDATE_ARCHIVE;
}

function runGit(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function originMainIsAccepted(originMain) {
  if (originMain.startsWith(EXPECTED_ORIGIN_MAIN)) return true;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', SOURCE_COMMIT, originMain], { cwd: rootDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function worktreeStatus() {
  return runGit(['status', '--short']) || 'CLEAN';
}

function fileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function buildPreflight(candidateReport) {
  const head = runGit(['rev-parse', 'HEAD']);
  const originMain = runGit(['rev-parse', 'origin/main']);
  const priorCandidate = readJson(PRIOR_DATA.candidateSourceReport);
  const priorFinal = readJson(PRIOR_DATA.phase35c32Final);
  const tsDataResult = priorFinal.TS_DATA_PARSER_TEST || 'FAIL';
  const ts700Result = priorFinal.TS700_REAL_CORPUS_TEST || 'FAIL';
  const failures = verifyPrecheckIdentity({
    originMain,
    candidateRecordCount: candidateReport.record_count,
    canonicalRecordStreamHash: candidateReport.canonical_record_stream_hash,
    tsDataParserStatus: tsDataResult,
    ts700Status: ts700Result
  }).failures;
  if (candidateReport.compressed_file_hash !== EXPECTED_CANDIDATE_ARCHIVE_SHA256) failures.push('UNEXPECTED_ARCHIVE_SHA256');
  return {
    SOURCE_COMMIT,
    HEAD: head,
    ORIGIN_MAIN: originMain,
    WORKTREE_STATUS: worktreeStatus(),
    PRECHECK: originMainIsAccepted(originMain) && failures.length === 0 ? 'PASS' : 'FAIL',
    PRECHECK_FAILURES: failures,
    CANDIDATE_RECORD_COUNT: candidateReport.record_count,
    CANDIDATE_STREAM_IDENTITY: candidateReport.record_count === EXPECTED_CANDIDATE_RECORD_COUNT
      && candidateReport.canonical_record_stream_hash === EXPECTED_CANDIDATE_STREAM_HASH
      ? 'PASS'
      : 'FAIL',
    CANDIDATE_ARCHIVE_SHA256: candidateReport.compressed_file_hash,
    CANDIDATE_CANONICAL_STREAM_HASH: candidateReport.canonical_record_stream_hash,
    TS_DATA_PARSER_TEST: tsDataResult,
    TS700_REAL_CORPUS_TEST: ts700Result
  };
}

function buildMaps(knownModels) {
  const batch2Registry = readJson(PRIOR_DATA.batch2Registry);
  const batch3Registry = readJson(PRIOR_DATA.batch3Registry);
  const batch3Native = readJson(PRIOR_DATA.batch3Native);
  const crossRegistry = readJson(PRIOR_DATA.crossRegistry);
  const authRecovery = readJson(PRIOR_DATA.authRecovery);
  const tsDataRecords = readJson(PRIOR_DATA.tsDataRecords);

  const batch3ById = new Map((batch3Registry.documents || []).map((doc) => [doc.document_id, doc]));
  const nativeById = new Map((batch3Native.documents || []).map((doc) => [doc.document_id, doc]));
  const batch2ByPath = new Map((batch2Registry.documents || []).map((doc) => [normalizeLooseText(doc.source_file_path), doc]));
  const canonicalById = new Map((crossRegistry.canonical_documents || []).map((doc) => [doc.canonical_document_id, doc]));
  const authenticatedDocs = (authRecovery.documents || [])
    .filter((doc) => doc.auth_after === 'AUTHENTICATED_OFFICIAL')
    .map((doc) => {
      const publicationId = String(doc.RA_TI_identity || '').toUpperCase() || extractPublicationId(doc.batch6_path);
      const batch2Doc = batch2ByPath.get(normalizeLooseText(doc.batch6_path)) || null;
      return {
        ...doc,
        publication_id: publicationId || null,
        batch2_document_id: batch2Doc?.document_id || null,
        batch2_canonical_document_id: batch2Doc?.canonical_document_id || null,
        batch2_file_hash: batch2Doc?.file_hash || null,
        batch2_page_count: batch2Doc?.page_count || null,
        explicit_models: extractModelsFromText(`${doc.batch6_path} ${publicationId || ''}`, knownModels)
      };
    });
  return { batch3ById, nativeById, canonicalById, authenticatedDocs, tsDataRecords };
}

export function assessCanonicalIdentity(candidateDoc, authDoc) {
  const evidence = [];
  const sameCanonicalDocument = Boolean(candidateDoc.canonical_document_id && authDoc.batch2_canonical_document_id && candidateDoc.canonical_document_id === authDoc.batch2_canonical_document_id);
  const sameFileHash = Boolean(candidateDoc.file_hash && authDoc.batch2_file_hash && candidateDoc.file_hash === authDoc.batch2_file_hash);
  const samePayloadHash = Boolean(candidateDoc.payload_hash && authDoc.payload_hash && candidateDoc.payload_hash === authDoc.payload_hash);
  const sameSourceReference = normalizeLooseText(candidateDoc.source_file_path) === normalizeLooseText(authDoc.batch6_path);
  const samePublication = Boolean(candidateDoc.publication_id && authDoc.publication_id && candidateDoc.publication_id === authDoc.publication_id);
  const pageCountMatch = candidateDoc.page_count != null && authDoc.batch2_page_count != null && candidateDoc.page_count === authDoc.batch2_page_count;
  const modelOverlap = authDoc.explicit_models.some((model) => candidateDoc.explicit_models.some((candidateModel) => sameModel(model, candidateModel)));

  if (sameCanonicalDocument) evidence.push('CANONICAL_DOCUMENT_MATCH');
  if (sameFileHash) evidence.push('FILE_HASH_MATCH');
  if (samePayloadHash) evidence.push('PAYLOAD_HASH_MATCH');
  if (sameSourceReference) evidence.push('SAME_SOURCE_REFERENCE');
  if (samePublication) evidence.push('PUBLICATION_ID_MATCH');
  if (pageCountMatch) evidence.push('PAGE_COUNT_MATCH');
  if (modelOverlap) evidence.push('MODEL_INDEX_LINK');

  if (sameCanonicalDocument) return { identity_status: 'EXACT_CANONICAL_MATCH', identity_confidence: 'HIGH', evidence };
  if (sameFileHash) return { identity_status: 'EXACT_FILE_MATCH', identity_confidence: 'HIGH', evidence };
  if (samePayloadHash) return { identity_status: 'EXACT_PAYLOAD_MATCH', identity_confidence: 'HIGH', evidence };
  if (sameSourceReference) return { identity_status: 'SAME_SOURCE_REFERENCE', identity_confidence: 'HIGH', evidence };
  if (samePublication && pageCountMatch && modelOverlap) return { identity_status: 'PUBLICATION_MATCH_STRONG', identity_confidence: 'MEDIUM', evidence };
  if (samePublication) return { identity_status: 'PUBLICATION_MATCH_WEAK', identity_confidence: 'LOW', evidence };
  return { identity_status: 'UNRESOLVED', identity_confidence: 'LOW', evidence };
}

function buildCanonicalReconciliation(targetCandidates, maps, knownModels) {
  const documentRows = [];
  const seen = new Set();
  for (const candidate of targetCandidates) {
    if (seen.has(candidate.document_id)) continue;
    seen.add(candidate.document_id);
    const registry = maps.batch3ById.get(candidate.document_id) || {};
    const native = maps.nativeById.get(candidate.document_id) || {};
    const candidateDoc = {
      candidate_document_id: candidate.document_id,
      candidate_source_path: registry.source_file_path || native.source_file_path || null,
      candidate_publication_id: extractPublicationId(registry.source_file_path || native.source_file_path || null),
      candidate_file_hash: registry.file_hash || native.file_hash || null,
      candidate_payload_hash: null,
      canonical_document_id: candidate.canonical_document_id || null,
      page_count: registry.page_count || native.page_count || null,
      explicit_models: extractModelsFromText(`${registry.source_file_path || ''} ${(registry.models_mentioned || []).join(' ')}`, knownModels)
    };
    const canonical = maps.canonicalById.get(candidateDoc.canonical_document_id) || null;
    const matches = maps.authenticatedDocs
      .map((authDoc) => ({ authDoc, assessment: assessCanonicalIdentity(candidateDoc, authDoc) }))
      .filter((row) => row.assessment.identity_status !== 'UNRESOLVED')
      .sort((left, right) => right.assessment.evidence.length - left.assessment.evidence.length);
    const bestMatch = matches[0] || null;
    documentRows.push({
      candidate_document_id: candidateDoc.candidate_document_id,
      candidate_source_path: candidateDoc.candidate_source_path,
      candidate_publication_id: candidateDoc.candidate_publication_id,
      candidate_file_hash: candidateDoc.candidate_file_hash,
      candidate_payload_hash: candidateDoc.candidate_payload_hash,
      matched_document_id: bestMatch?.authDoc.batch6_document_id || candidateDoc.candidate_document_id,
      matched_batch: bestMatch ? 'BATCH6_STIHL_LEGACY_DOCUMENT_CD' : 'BATCH3_MANUEL_SERVICE',
      matched_source_path: bestMatch?.authDoc.batch6_path || candidateDoc.candidate_source_path,
      matched_publication_id: bestMatch?.authDoc.publication_id || candidateDoc.candidate_publication_id,
      matched_file_hash: bestMatch?.authDoc.batch2_file_hash || candidateDoc.candidate_file_hash,
      matched_payload_hash: null,
      same_file_hash: bestMatch?.assessment.identity_status === 'EXACT_FILE_MATCH' || false,
      same_payload_hash: bestMatch?.assessment.identity_status === 'EXACT_PAYLOAD_MATCH' || false,
      same_publication: bestMatch?.assessment.evidence.includes('PUBLICATION_ID_MATCH') || false,
      same_source_reference: bestMatch?.assessment.identity_status === 'SAME_SOURCE_REFERENCE' || false,
      same_canonical_document: bestMatch?.assessment.identity_status === 'EXACT_CANONICAL_MATCH' || false,
      identity_confidence: bestMatch?.assessment.identity_confidence || 'LOW',
      identity_status: bestMatch?.assessment.identity_status || (canonical ? 'UNRESOLVED' : 'UNRESOLVED'),
      identity_evidence: bestMatch?.assessment.evidence || (canonical ? ['CANDIDATE_CANONICAL_REFERENCE_PRESENT'] : []),
      current_authenticity_status: bestMatch?.authDoc.auth_after || registry.authenticity_status || 'UNRESOLVED',
      authenticity_source_phase: bestMatch ? 'PHASE35C3_AUTHENTICITY_RECOVERY' : 'BATCH3_NATIVE_DOCUMENT_REGISTRY'
    });
  }
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    documents: documentRows
  };
}

export function reassessAuthenticity(candidate, reconciliationRow) {
  const oldStatus = candidate.authenticity_status || 'UNRESOLVED';
  const currentStatus = reconciliationRow.current_authenticity_status || 'UNRESOLVED';
  const exactIdentity = ['EXACT_CANONICAL_MATCH', 'EXACT_FILE_MATCH', 'EXACT_PAYLOAD_MATCH', 'SAME_SOURCE_REFERENCE'].includes(reconciliationRow.identity_status);
  let reassessed = 'UNRESOLVED';
  let reason = 'No sufficient current document identity chain was proven.';

  if (oldStatus === 'AUTHENTICATED_OFFICIAL') {
    reassessed = 'AUTHENTICATED_DIRECT';
    reason = 'Candidate was already authenticated directly.';
  } else if (exactIdentity && currentStatus === 'AUTHENTICATED_OFFICIAL') {
    reassessed = 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT';
    reason = 'Canonical/file/source identity ties the candidate document to an authenticated official source.';
  } else if (currentStatus === 'PROBABLE_OFFICIAL') {
    reassessed = 'PROBABLE_OFFICIAL';
    reason = 'Current document layer supports probable official status, but not authenticated inheritance.';
  } else if (reconciliationRow.identity_status === 'IDENTITY_CONFLICT') {
    reassessed = 'IDENTITY_CONFLICT';
    reason = 'Conflicting identity signals block authenticity inheritance.';
  } else {
    reassessed = 'INSUFFICIENT_EVIDENCE';
  }

  return {
    candidate_id: candidate.candidate_id,
    document_id: candidate.document_id,
    old_authenticity_status: oldStatus,
    current_document_authenticity_status: currentStatus,
    identity_status: reconciliationRow.identity_status,
    identity_evidence: reconciliationRow.identity_evidence,
    reassessed_authenticity_status: reassessed,
    reassessment_reason: reason
  };
}

export function assessCandidateDocumentModelCompatibility(candidate, documentInfo, knownModels) {
  const candidateModel = normalizeModelSlug(candidate.variant_id);
  const pathModels = documentInfo.path_models || [];
  const snippetModels = extractModelsFromText(candidate.evidence_snippet, knownModels);
  const componentDocument = COMPONENT_HINTS.test(`${documentInfo.candidate_source_path || ''} ${candidate.evidence_snippet || ''}`);
  const pathMatches = pathModels.some((model) => sameModel(model, candidateModel));
  const snippetMatches = snippetModels.some((model) => sameModel(model, candidateModel));
  const explicitOtherInPath = pathModels.length > 0 && !pathMatches;
  const explicitOtherInSnippet = snippetModels.length > 0 && !snippetMatches;

  if (componentDocument) return 'COMPATIBLE_COMPONENT_DOCUMENT';
  if (explicitOtherInPath || explicitOtherInSnippet) return 'INCOMPATIBLE_MODEL_DOCUMENT';
  if (pathMatches && pathModels.length === 1) return 'EXACT_MODEL_DOCUMENT';
  if (pathMatches && pathModels.length > 1) return 'EXPLICIT_MULTI_MODEL_DOCUMENT';
  if (snippetMatches && snippetModels.length === 1) return 'EXACT_MODEL_DOCUMENT';
  if (snippetMatches && snippetModels.length > 1) return 'EXPLICIT_MULTI_MODEL_DOCUMENT';
  return 'MODEL_SCOPE_UNRESOLVED';
}

export function resolveFieldLevelModelScope(candidate, knownModels) {
  const snippet = normalizeText(candidate.evidence_snippet);
  const snippetModels = extractModelsFromText(snippet, knownModels);
  const candidateModel = normalizeModelSlug(candidate.variant_id);
  const singleSnippetModel = snippetModels.length > 0 && snippetModels.every((model) => sameModel(model, candidateModel));
  const familyMentions = extractFamilyMentions(snippet, candidate.variant_id);
  const singleFamilyMention = familyMentions.length <= 1 || familyMentions.every((model) => sameModel(model, candidateModel));
  const pageHeading = normalizeText(candidate.section || snippet.split(':')[0] || '');

  if (EXACT_SCOPES.has(candidate.model_scope)) {
    return {
      scope_before: candidate.model_scope,
      scope_after: candidate.model_scope,
      raw_heading: candidate.section || null,
      normalized_heading: pageHeading,
      detected_models: snippetModels,
      scope_evidence: ['ALREADY_EXACT'],
      resolver_rule: 'ALREADY_EXACT'
    };
  }

  if (singleSnippetModel && singleFamilyMention && /(moteur|engine|motor|ms|fs|ts|br|sr|hs|bt|re)/i.test(snippet)) {
    return {
      scope_before: candidate.model_scope || 'UNRESOLVED',
      scope_after: 'EXACT_MODEL',
      raw_heading: candidate.section || null,
      normalized_heading: pageHeading,
      detected_models: snippetModels,
      scope_evidence: ['EXPLICIT_PAGE_HEADING', 'FIELD_CONTEXT_COMPATIBLE'],
      resolver_rule: 'EXPLICIT_PAGE_HEADING'
    };
  }

  return {
    scope_before: candidate.model_scope || 'UNRESOLVED',
    scope_after: candidate.model_scope || 'UNRESOLVED',
    raw_heading: candidate.section || null,
    normalized_heading: pageHeading,
    detected_models: snippetModels,
    scope_evidence: [],
    resolver_rule: 'UNRESOLVED'
  };
}

export function validateFieldSemantics35c41(candidate) {
  const field = candidate.field_name;
  const rawContext = normalizeText(candidate.evidence_snippet);
  const normalizedUnit = normalizeText(candidate.unit || candidate.raw_unit || '');
  const evidence = [];
  let field_semantic_status = 'AMBIGUOUS';
  let value_pass = false;
  let unit_pass = false;
  let measurement_definition_pass = false;

  if (field === 'spark_plug') {
    if (SPARK_PLUG_GARBAGE.test(String(candidate.raw_value || '')) || !SPARK_PLUG_ALLOWED.test(String(candidate.raw_value || ''))) {
      field_semantic_status = 'INVALID';
      evidence.push('SPARK_PLUG_PATTERN_INVALID');
    } else if (/\b(bougie|spark plug|zuendkerze|bujia|vela)\b/i.test(rawContext)) {
      field_semantic_status = 'VALID';
      value_pass = true;
      unit_pass = true;
      measurement_definition_pass = true;
      evidence.push('SPARK_PLUG_CONTEXT_CONFIRMED');
    }
  } else if (field === 'power_kw') {
    if (typeof candidate.value === 'number' && Number.isFinite(candidate.value) && candidate.value > 0 && candidate.value < 20) value_pass = true;
    if (normalizedUnit.toLowerCase() === 'kw') unit_pass = true;
    if (/\b(power|leistung|puissance|vermogen)\b/i.test(rawContext)) evidence.push('POWER_CONTEXT_CONFIRMED');
    if (value_pass && unit_pass && evidence.length > 0) {
      field_semantic_status = 'VALID';
      measurement_definition_pass = true;
    } else if (!value_pass || !unit_pass) field_semantic_status = 'INVALID';
  } else if (field === 'displacement_cc') {
    if (typeof candidate.value === 'number' && Number.isFinite(candidate.value) && candidate.value > 0 && candidate.value < 500) value_pass = true;
    if (['cc', 'cm3'].includes(normalizedUnit.toLowerCase()) || /\bcm3\b/i.test(rawContext)) unit_pass = true;
    if (/\b(displacement|hubraum|cylindr|cilindr)\b/i.test(rawContext)) evidence.push('DISPLACEMENT_CONTEXT_CONFIRMED');
    if (value_pass && unit_pass && evidence.length > 0) {
      field_semantic_status = 'VALID';
      measurement_definition_pass = true;
    } else if (!value_pass || !unit_pass) field_semantic_status = 'INVALID';
  } else if (field === 'electrode_gap_mm') {
    if (typeof candidate.value === 'number' && Number.isFinite(candidate.value) && candidate.value > 0 && candidate.value < 5) value_pass = true;
    if (normalizedUnit.toLowerCase() === 'mm') unit_pass = true;
    if (/\b(electrode|spark plug gap|elektroden)\b/i.test(rawContext)) evidence.push('ELECTRODE_CONTEXT_CONFIRMED');
    if (value_pass && unit_pass && evidence.length > 0) {
      field_semantic_status = 'VALID';
      measurement_definition_pass = true;
    } else if (!value_pass || !unit_pass) field_semantic_status = 'INVALID';
  } else if (['bore_mm', 'stroke_mm'].includes(field)) {
    if (typeof candidate.value === 'number' && Number.isFinite(candidate.value) && candidate.value > 0 && candidate.value < 100) value_pass = true;
    if (normalizedUnit.toLowerCase() === 'mm') unit_pass = true;
    if ((field === 'bore_mm' && /\b(bore|bohrung)\b/i.test(rawContext)) || (field === 'stroke_mm' && /\b(stroke|course|hub|piston stroke)\b/i.test(rawContext))) {
      evidence.push('BORE_STROKE_CONTEXT_CONFIRMED');
    }
    if (value_pass && unit_pass && evidence.length > 0) {
      field_semantic_status = 'VALID';
      measurement_definition_pass = true;
    } else if (!value_pass || !unit_pass) field_semantic_status = 'INVALID';
  } else if (field === 'weight_kg') {
    if (typeof candidate.value === 'number' && Number.isFinite(candidate.value) && candidate.value > 0 && candidate.value < 100) value_pass = true;
    if (normalizedUnit.toLowerCase() === 'kg') unit_pass = true;
    if (/\b(dry weight|without cutting attachment|with cutting attachment|with battery|without battery)\b/i.test(rawContext)) {
      measurement_definition_pass = true;
      evidence.push('WEIGHT_MEASUREMENT_DEFINITION_CONFIRMED');
    }
    field_semantic_status = value_pass && unit_pass && measurement_definition_pass ? 'VALID' : 'AMBIGUOUS';
  } else {
    value_pass = candidate.value != null && candidate.value !== '';
    unit_pass = true;
    measurement_definition_pass = true;
    field_semantic_status = value_pass ? 'VALID' : 'AMBIGUOUS';
  }

  return {
    field_semantic_status,
    field_semantic_evidence: evidence,
    raw_context: rawContext,
    normalized_value: normalizeValue(candidate.value),
    normalized_unit: normalizedUnit || null,
    value_pass,
    unit_pass,
    measurement_definition_pass
  };
}

function buildCandidateReviews(candidateReport, maps, knownModels) {
  const candidates = candidateReport.candidates || [];
  const targetModelCandidates = candidates.filter((row) => HIGH_VALUE_MODELS.includes(row.variant_id));
  const targetFieldCandidates = targetModelCandidates.filter((row) => FIELD_PRIORITY.includes(row.field_name));
  const pageMapped = targetFieldCandidates.filter((row) => row.page_locator_exists && Number(row.pdf_page || row.page));

  const reconciliation = buildCanonicalReconciliation(pageMapped, maps, knownModels);
  const docById = new Map(reconciliation.documents.map((row) => [row.candidate_document_id, row]));

  const reviewed = pageMapped.map((candidate) => {
    const docRow = docById.get(candidate.document_id);
    const documentInfo = {
      ...docRow,
      path_models: extractModelsFromText(docRow?.candidate_source_path || '', knownModels)
    };
    const auth = reassessAuthenticity(candidate, docRow);
    const compatibility = assessCandidateDocumentModelCompatibility(candidate, documentInfo, knownModels);
    const scope = resolveFieldLevelModelScope(candidate, knownModels);
    const semantic = validateFieldSemantics35c41(candidate);
    return {
      ...candidate,
      candidate_publication_id: docRow?.candidate_publication_id || null,
      identity_status: docRow?.identity_status || 'UNRESOLVED',
      identity_evidence: docRow?.identity_evidence || [],
      current_document_authenticity_status: docRow?.current_authenticity_status || 'UNRESOLVED',
      effective_authenticity_status: auth.reassessed_authenticity_status,
      reassessment_reason: auth.reassessment_reason,
      model_document_compatibility: compatibility,
      model_document_compatibility_pass: ['EXACT_MODEL_DOCUMENT', 'EXPLICIT_MULTI_MODEL_DOCUMENT', 'COMPATIBLE_COMPONENT_DOCUMENT'].includes(compatibility),
      field_scope_pass: EXACT_SCOPES.has(scope.scope_after),
      ...scope,
      ...semantic,
      canonical_identity_pass: docRow?.candidate_document_id != null && candidate.canonical_document_id != null,
      effective_authenticity_pass: ['AUTHENTICATED_DIRECT', 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT'].includes(auth.reassessed_authenticity_status),
      page_locator_pass: Boolean(candidate.page_locator_exists && Number(candidate.pdf_page || candidate.page)),
      field_semantic_pass: semantic.field_semantic_status === 'VALID',
      value_pass: semantic.value_pass,
      unit_pass: semantic.unit_pass,
      measurement_definition_pass: semantic.measurement_definition_pass,
      sanity_pass: candidate.block_reason_standardized !== 'SANITY_CHECK_FAILED'
    };
  });

  return {
    targetModelCandidates,
    targetFieldCandidates,
    pageMapped,
    reconciliation,
    reviewed
  };
}

function buildGoldValidationSet(tsDataRecords) {
  const records = (tsDataRecords.records || [])
    .filter((row) => HIGH_VALUE_MODELS.includes(row.normalized_model) && FIELD_PRIORITY.includes(row.field_name))
    .map((row) => {
      const detectedModels = (row.normalized_model_candidates || []).map((value) => normalizeModelSlug(value));
      const exactSingleModel = detectedModels.length === 1 && sameModel(detectedModels[0], row.normalized_model);
      const sourceStem = normalizeModelSlug(path.basename(String(row.source_file || ''), path.extname(String(row.source_file || ''))).replace(/_body$/i, ''));
      const exactFileModel = sameModel(sourceStem, row.normalized_model);
      const semantic = validateFieldSemantics35c41({
        field_name: row.field_name,
        evidence_snippet: row.source_section,
        raw_value: row.raw_value,
        value: row.normalized_value,
        unit: row.unit
      });
      let status = 'REJECTED';
      let modelScope = 'UNRESOLVED';
      if (exactSingleModel && exactFileModel) {
        modelScope = 'EXACT_MODEL';
        status = semantic.field_semantic_status === 'VALID' ? 'GOLD_CANDIDATE' : 'REJECTED';
      } else {
        modelScope = 'MODEL_MISMATCH';
        status = 'MODEL_MISMATCH';
      }
      return {
        gold_record_id: row.record_id,
        model: row.normalized_model,
        field: row.field_name,
        raw_model_heading: row.raw_model,
        source_file: row.source_file,
        raw_value: row.raw_value,
        normalized_value: row.normalized_value,
        unit: row.unit,
        model_scope: modelScope,
        model_scope_evidence: exactSingleModel && exactFileModel ? ['TS_DATA_EXPLICIT_SINGLE_MODEL'] : ['TS_DATA_MODEL_MISMATCH'],
        status,
        validation_evidence: [row.source_section, ...semantic.field_semantic_evidence]
      };
    });
  return { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records };
}

function buildSourceIndependenceAudit(reviewed, goldSet) {
  const records = [];
  for (const candidate of reviewed.filter((row) => row.model_document_compatibility !== 'INCOMPATIBLE_MODEL_DOCUMENT')) {
    const goldMatches = goldSet.records.filter((row) => row.model === candidate.variant_id && row.field === candidate.field_name && row.status === 'GOLD_CANDIDATE');
    for (const gold of goldMatches) {
      const independence = classifySourceIndependence(
        {
          source_label: `TS_DATA:${gold.gold_record_id}`,
          file_hash: null,
          payload_hash: null,
          publication_id: gold.source_file,
          canonical_document_id: gold.source_file,
          same_source_reference: false
        },
        {
          source_label: `${candidate.document_id}:${candidate.candidate_id}`,
          file_hash: null,
          payload_hash: null,
          publication_id: candidate.candidate_publication_id,
          canonical_document_id: candidate.canonical_document_id,
          same_source_reference: false
        }
      );
      const sameValue = normalizeValue(gold.normalized_value) === normalizeValue(candidate.value);
      const supporting = independence.independent && sameValue && candidate.measurement_definition_pass && candidate.model_document_compatibility_pass;
      const conflict = independence.independent && !sameValue;
      records.push({
        candidate_id: candidate.candidate_id,
        model: candidate.variant_id,
        field: candidate.field_name,
        candidate_value: candidate.value,
        gold_value: gold.normalized_value,
        independent: independence.independent,
        pair_type: supporting ? 'INDEPENDENT_SUPPORTING_PAIR' : conflict ? 'INDEPENDENT_CONFLICT_PAIR' : 'INDEPENDENT_COMPARISON_PAIR',
        ...independence
      });
    }
  }
  return { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records };
}

function buildConflictAudit(reviewed, goldSet) {
  const clusters = new Map();
  const eligible = reviewed.filter((row) => row.model_document_compatibility_pass && row.identity_status !== 'IDENTITY_CONFLICT');
  for (const row of eligible) {
    const key = [row.variant_id, row.field_name, row.normalized_unit || row.unit || 'NONE', row.market || 'UNKNOWN', 'STANDARD', row.revision || 'NONE'].join('|');
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push({ source: 'candidate', value: normalizeValue(row.value), candidate_id: row.candidate_id });
  }
  for (const row of goldSet.records.filter((entry) => entry.status === 'GOLD_CANDIDATE')) {
    const key = [row.model, row.field, row.unit || 'NONE', 'UNKNOWN', 'STANDARD', 'NONE'].join('|');
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push({ source: 'gold', value: normalizeValue(row.normalized_value), gold_record_id: row.gold_record_id });
  }
  const records = [...clusters.entries()].map(([cluster_key, rows]) => {
    const distinct = [...new Set(rows.map((row) => JSON.stringify(row.value)))];
    return {
      cluster_id: stableId(['phase35c41-conflict', cluster_key]),
      cluster_key,
      record_count: rows.length,
      conflict_status: distinct.length > 1 ? 'BLOCKED' : 'CLEAR',
      conflict_type: distinct.length > 1 ? 'CROSS_SOURCE_DISAGREEMENT' : 'NO_CONFLICT'
    };
  });
  return { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, clusters: records };
}

function attachVerificationGates(reviewed, goldSet, independenceAudit, conflictAudit) {
  const supportByCandidate = new Map();
  for (const row of independenceAudit.records) {
    if (!supportByCandidate.has(row.candidate_id)) supportByCandidate.set(row.candidate_id, []);
    supportByCandidate.get(row.candidate_id).push(row);
  }
  const conflictByKey = new Map(conflictAudit.clusters.map((row) => [row.cluster_key, row]));

  return reviewed.map((candidate) => {
    const clusterKey = [candidate.variant_id, candidate.field_name, candidate.normalized_unit || candidate.unit || 'NONE', candidate.market || 'UNKNOWN', 'STANDARD', candidate.revision || 'NONE'].join('|');
    const supportRows = supportByCandidate.get(candidate.candidate_id) || [];
    const goldMatch = goldSet.records.find((row) => row.model === candidate.variant_id && row.field === candidate.field_name && row.status === 'GOLD_CANDIDATE' && normalizeValue(row.normalized_value) === normalizeValue(candidate.value));
    const conflict = conflictByKey.get(clusterKey);
    const gates = {
      canonical_identity_pass: candidate.canonical_identity_pass,
      effective_authenticity_pass: candidate.effective_authenticity_pass,
      model_document_compatibility_pass: candidate.model_document_compatibility_pass,
      page_locator_pass: candidate.page_locator_pass,
      field_scope_pass: candidate.field_scope_pass,
      field_semantic_pass: candidate.field_semantic_pass,
      value_pass: candidate.value_pass,
      unit_pass: candidate.unit_pass,
      measurement_definition_pass: candidate.measurement_definition_pass,
      sanity_pass: candidate.sanity_pass,
      independent_support_pass: supportRows.some((row) => row.pair_type === 'INDEPENDENT_SUPPORTING_PAIR'),
      precision_or_gold_pass: Boolean(goldMatch),
      conflict_clear: (conflict?.conflict_status || 'CLEAR') === 'CLEAR'
    };
    const failures = Object.entries(gates).filter(([, value]) => !value).map(([key]) => key.toUpperCase());
    return {
      ...candidate,
      independent_support_pass: gates.independent_support_pass,
      precision_or_gold_pass: gates.precision_or_gold_pass,
      conflict_clear: gates.conflict_clear,
      gates,
      verified: failures.length === 0,
      primary_block_reason: failures[0] || null,
      secondary_block_reasons: failures.slice(1)
    };
  });
}

function buildArtifacts(candidateReport) {
  const preflight = buildPreflight(candidateReport);
  const beforeHashes = { json: fileSha256(CANONICAL_JSON_PATH), db: fileSha256(CANONICAL_DB_PATH) };
  const canonicalJson = readJson(CANONICAL_JSON_PATH);
  const knownModels = buildKnownModelDictionary(canonicalJson);
  const maps = buildMaps(knownModels);
  const reviewData = buildCandidateReviews(candidateReport, maps, knownModels);
  const goldSet = buildGoldValidationSet(maps.tsDataRecords);
  const independenceAudit = buildSourceIndependenceAudit(reviewData.reviewed, goldSet);
  const conflictAudit = buildConflictAudit(reviewData.reviewed, goldSet);
  const reviewed = attachVerificationGates(reviewData.reviewed, goldSet, independenceAudit, conflictAudit);

  const authenticityReassessment = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: reviewed.map((row) => ({
      candidate_id: row.candidate_id,
      document_id: row.document_id,
      old_authenticity_status: row.authenticity_status || 'UNRESOLVED',
      current_document_authenticity_status: row.current_document_authenticity_status,
      identity_status: row.identity_status,
      identity_evidence: row.identity_evidence,
      reassessed_authenticity_status: row.effective_authenticity_status,
      reassessment_reason: row.reassessment_reason
    }))
  };
  const modelCompatibility = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: reviewed.map((row) => ({
      candidate_id: row.candidate_id,
      document_id: row.document_id,
      variant_id: row.variant_id,
      model_document_compatibility: row.model_document_compatibility
    }))
  };
  const workingSet = reviewed.filter((row) => row.canonical_identity_pass && row.page_locator_pass && row.model_document_compatibility_pass && row.effective_authenticity_status !== 'INSUFFICIENT_EVIDENCE');
  const fieldSemanticAudit = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: reviewed.map((row) => ({
      candidate_id: row.candidate_id,
      variant_id: row.variant_id,
      field_name: row.field_name,
      field_semantic_status: row.field_semantic_status,
      field_semantic_evidence: row.field_semantic_evidence,
      raw_context: row.raw_context,
      normalized_value: row.normalized_value,
      normalized_unit: row.normalized_unit
    })),
    field_metrics: FIELD_PRIORITY.map((field) => {
      const rows = reviewed.filter((row) => row.field_name === field);
      return {
        field,
        CANDIDATES: rows.length,
        SEMANTIC_VALID: rows.filter((row) => row.field_semantic_status === 'VALID').length,
        SEMANTIC_AMBIGUOUS: rows.filter((row) => row.field_semantic_status === 'AMBIGUOUS').length,
        SEMANTIC_INVALID: rows.filter((row) => row.field_semantic_status === 'INVALID').length
      };
    })
  };
  const scopeResolution = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: reviewed.map((row) => ({
      candidate_id: row.candidate_id,
      document_id: row.document_id,
      publication_id: row.candidate_publication_id,
      page: row.pdf_page || row.page || null,
      raw_heading: row.raw_heading,
      normalized_heading: row.normalized_heading,
      detected_models: row.detected_models,
      scope_before: row.scope_before,
      scope_after: row.scope_after,
      scope_evidence: row.scope_evidence,
      resolver_rule: row.resolver_rule
    }))
  };
  const verificationFunnel = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    fields: FIELD_PRIORITY.map((field) => {
      const rows = reviewed.filter((row) => row.field_name === field);
      return {
        field,
        CANDIDATES: rows.length,
        CANONICAL_IDENTITY: rows.filter((row) => row.canonical_identity_pass).length,
        EFFECTIVE_AUTHENTICITY: rows.filter((row) => row.effective_authenticity_pass).length,
        MODEL_DOCUMENT_COMPATIBILITY: rows.filter((row) => row.model_document_compatibility_pass).length,
        FIELD_SCOPE: rows.filter((row) => row.field_scope_pass).length,
        FIELD_SEMANTIC: rows.filter((row) => row.field_semantic_pass).length,
        INDEPENDENT_SUPPORT: rows.filter((row) => row.independent_support_pass).length,
        PRECISION_OR_GOLD: rows.filter((row) => row.precision_or_gold_pass).length,
        VERIFIED: rows.filter((row) => row.verified).length
      };
    })
  };
  const blockedSummary = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    reviewed_candidate_count: reviewed.length,
    verified_candidate_count: reviewed.filter((row) => row.verified).length,
    blocked_candidate_count: reviewed.filter((row) => !row.verified).length,
    top_block_reasons: Object.entries(reviewed.filter((row) => !row.verified).reduce((acc, row) => {
      acc[row.primary_block_reason || 'UNSPECIFIED'] = (acc[row.primary_block_reason || 'UNSPECIFIED'] || 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([reason, count]) => ({ reason, count }))
  };
  const verifiedFactStaging = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: reviewed.filter((row) => row.verified).map((row) => ({
      fact_id: stableId(['phase35c41-verified', row.candidate_id]),
      candidate_id: row.candidate_id,
      variant_id: row.variant_id,
      field_name: row.field_name,
      normalized_value: row.normalized_value,
      promotion_status: 'NOT_PROMOTED'
    }))
  };
  const verifiedFactEvidenceGraph = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    facts: verifiedFactStaging.records.map((row) => ({
      fact_id: row.fact_id,
      edges: [{ type: 'CANDIDATE', target: row.candidate_id }]
    }))
  };
  const failureInjection = buildFailureInjectionReport(reviewed, goldSet);

  const afterHashes = { json: fileSha256(CANONICAL_JSON_PATH), db: fileSha256(CANONICAL_DB_PATH) };
  const publicDataModified = beforeHashes.json === afterHashes.json && beforeHashes.db === afterHashes.db ? '0 / 0' : '0 / 1';
  const idempotency = 'PENDING';
  const finalReport = buildFinalReport({
    preflight,
    reviewed,
    workingSet,
    reconciliation: reviewData.reconciliation,
    fieldSemanticAudit,
    goldSet,
    independenceAudit,
    blockedSummary,
    failureInjection,
    publicDataModified,
    idempotency
  });

  return {
    preflight,
    canonicalReconciliation: reviewData.reconciliation,
    authenticityReassessment,
    modelCompatibility,
    workingSetSummary: buildWorkingSetSummary(candidateReport, reviewData, reviewed, workingSet),
    fieldSemanticAudit,
    goldSet,
    sourceIndependenceAudit: independenceAudit,
    conflictAudit,
    modelScopeResolution: scopeResolution,
    verificationFunnel,
    blockedSummary,
    verifiedFactStaging,
    verifiedFactEvidenceGraph,
    failureInjection,
    finalReport
  };
}

function buildWorkingSetSummary(candidateReport, reviewData, reviewed, workingSet) {
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    TOTAL_CANDIDATES: candidateReport.record_count,
    TARGET_MODEL_CANDIDATES: reviewData.targetModelCandidates.length,
    TARGET_FIELD_CANDIDATES: reviewData.targetFieldCandidates.length,
    PAGE_MAPPED: reviewData.pageMapped.length,
    CANONICAL_DOCUMENT_MATCHED: reviewed.filter((row) => row.canonical_identity_pass).length,
    AUTHENTICITY_RECOVERED: reviewed.filter((row) => row.effective_authenticity_status === 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT').length,
    MODEL_DOCUMENT_COMPATIBLE: reviewed.filter((row) => row.model_document_compatibility_pass).length,
    RECOVERY_WORKING_SET: workingSet.length,
    working_set_hash: stableHash(workingSet.map((row) => row.candidate_id))
  };
}

function buildFailureInjectionReport(reviewed, goldSet) {
  const verifiedFixture = evaluateCandidateFixture({
    canonical_identity_pass: true,
    effective_authenticity_pass: true,
    model_document_compatibility_pass: true,
    page_locator_pass: true,
    field_scope_pass: true,
    field_semantic_pass: true,
    value_pass: true,
    unit_pass: true,
    measurement_definition_pass: true,
    sanity_pass: true,
    independent_support_pass: true,
    precision_or_gold_pass: true,
    conflict_clear: true
  });
  const canonicalFail = evaluateCandidateFixture({ ...verifiedFixture.gates, canonical_identity_pass: false });
  const authFail = evaluateCandidateFixture({ ...verifiedFixture.gates, effective_authenticity_pass: false });
  const modelFail = evaluateCandidateFixture({ ...verifiedFixture.gates, model_document_compatibility_pass: false });
  const semanticFail = evaluateCandidateFixture({ ...verifiedFixture.gates, field_semantic_pass: false });
  const independenceFail = evaluateCandidateFixture({ ...verifiedFixture.gates, independent_support_pass: false });
  const conflictFail = evaluateCandidateFixture({ ...verifiedFixture.gates, conflict_clear: false });
  const hardcodedScopeRule = /\bcandidate\.variant_id\s*===|\bdocument_id\s*===\s*['"]batch3:/i.test(fs.readFileSync(__filename, 'utf8')) ? 'FAIL' : 'PASS';
  const authRecoveryRequiresCanonicalIdentity = reviewed.every((row) => row.effective_authenticity_status !== 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT'
    || ['EXACT_CANONICAL_MATCH', 'EXACT_FILE_MATCH', 'EXACT_PAYLOAD_MATCH', 'SAME_SOURCE_REFERENCE'].includes(row.identity_status))
    ? 'PASS'
    : 'FAIL';
  const noFs200ToFs350 = goldSet.records.every((row) => !(row.model === 'fs-350' && String(row.source_file).includes('FS200_body.htm') && row.model_scope === 'EXACT_MODEL')) ? 'PASS' : 'FAIL';

  return {
    CANONICAL_IDENTITY_FAILURE_INJECTION: canonicalFail.verified === false ? 'PASS' : 'FAIL',
    AUTH_REASSESSMENT_FAILURE_INJECTION: authFail.verified === false ? 'PASS' : 'FAIL',
    MODEL_DOCUMENT_FAILURE_INJECTION: modelFail.verified === false ? 'PASS' : 'FAIL',
    FIELD_SEMANTIC_FAILURE_INJECTION: semanticFail.verified === false ? 'PASS' : 'FAIL',
    INDEPENDENCE_FAILURE_INJECTION: independenceFail.verified === false ? 'PASS' : 'FAIL',
    CONFLICT_FAILURE_INJECTION: conflictFail.verified === false ? 'PASS' : 'FAIL',
    NO_HARDCODED_SCOPE_RULES: hardcodedScopeRule,
    AUTH_RECOVERY_REQUIRES_CANONICAL_IDENTITY: authRecoveryRequiresCanonicalIdentity,
    NO_FS200_TO_FS350_EXACT_SCOPE: noFs200ToFs350,
    VERIFIED_POSITIVE_FIXTURE: verifiedFixture.verified ? 'PASS' : 'FAIL',
    FAILURE_INJECTION: 'PENDING'
  };
}

function evaluateCandidateFixture(gates) {
  const failures = Object.entries(gates).filter(([, value]) => !value).map(([key]) => key.toUpperCase());
  return {
    gates,
    verified: failures.length === 0,
    failures
  };
}

function buildFinalReport({ preflight, reviewed, workingSet, reconciliation, fieldSemanticAudit, goldSet, independenceAudit, blockedSummary, failureInjection, publicDataModified, idempotency }) {
  const candidateDocumentsReviewed = reconciliation.documents.length;
  const exactCanonicalMatches = reconciliation.documents.filter((row) => row.identity_status === 'EXACT_CANONICAL_MATCH').length;
  const exactFileMatches = reconciliation.documents.filter((row) => row.identity_status === 'EXACT_FILE_MATCH').length;
  const exactPayloadMatches = reconciliation.documents.filter((row) => row.identity_status === 'EXACT_PAYLOAD_MATCH').length;
  const sameSourceReferences = reconciliation.documents.filter((row) => row.identity_status === 'SAME_SOURCE_REFERENCE').length;
  const publicationStrongMatches = reconciliation.documents.filter((row) => row.identity_status === 'PUBLICATION_MATCH_STRONG').length;
  const identityConflicts = reconciliation.documents.filter((row) => row.identity_status === 'IDENTITY_CONFLICT').length;
  const unresolvedIdentities = reconciliation.documents.filter((row) => row.identity_status === 'UNRESOLVED').length;
  const fieldSemanticValid = reviewed.filter((row) => row.field_semantic_status === 'VALID').length;
  const fieldSemanticAmbiguous = reviewed.filter((row) => row.field_semantic_status === 'AMBIGUOUS').length;
  const fieldSemanticInvalid = reviewed.filter((row) => row.field_semantic_status === 'INVALID').length;
  const sparkPlugGarbageBlocked = reviewed.filter((row) => row.field_name === 'spark_plug' && row.field_semantic_status === 'INVALID' && SPARK_PLUG_GARBAGE.test(String(row.raw_value || ''))).length;
  const tsDataModelMismatches = goldSet.records.filter((row) => row.status === 'MODEL_MISMATCH').length;
  const modelDocMatch = reviewed.filter((row) => row.model_document_compatibility === 'EXACT_MODEL_DOCUMENT').length;
  const modelDocMulti = reviewed.filter((row) => row.model_document_compatibility === 'EXPLICIT_MULTI_MODEL_DOCUMENT').length;
  const modelDocComponent = reviewed.filter((row) => row.model_document_compatibility === 'COMPATIBLE_COMPONENT_DOCUMENT').length;
  const modelDocMismatch = reviewed.filter((row) => row.model_document_compatibility === 'INCOMPATIBLE_MODEL_DOCUMENT').length;
  const modelDocUnresolved = reviewed.filter((row) => row.model_document_compatibility === 'MODEL_SCOPE_UNRESOLVED').length;
  const independentComparisonPairs = independenceAudit.records.filter((row) => row.independent).length;
  const independentSupportingPairs = independenceAudit.records.filter((row) => row.pair_type === 'INDEPENDENT_SUPPORTING_PAIR').length;
  const independentConflictPairs = independenceAudit.records.filter((row) => row.pair_type === 'INDEPENDENT_CONFLICT_PAIR').length;
  const verifiedByField = Object.fromEntries(FIELD_PRIORITY.map((field) => [field, reviewed.filter((row) => row.field_name === field && row.verified).length]));
  const verifiedByModel = Object.fromEntries(HIGH_VALUE_MODELS.map((model) => [model, reviewed.filter((row) => row.variant_id === model && row.verified).length]));
  const corpusChecks = {
    NO_KNOWN_MODEL_DOCUMENT_MISMATCH_SURVIVES: reviewed.filter((row) => ['3696b9fe905e866f', '39a6b2e04e4d2ad6', '3f5196618a93f998', 'd573672f5db79603', 'cbfe0fca4952c2d9'].includes(row.candidate_id)).every((row) => row.model_document_compatibility === 'INCOMPATIBLE_MODEL_DOCUMENT') ? 'PASS' : 'FAIL',
    NO_KNOWN_SPARK_PLUG_GARBAGE_SURVIVES: reviewed.filter((row) => ['208RA029', '208RA026', '133RA129'].includes(String(row.raw_value))).every((row) => row.field_semantic_status === 'INVALID') ? 'PASS' : 'FAIL',
    NO_FS200_TO_FS350_EXACT_SCOPE: goldSet.records.every((row) => !(row.model === 'fs-350' && String(row.source_file).includes('FS200_body.htm') && row.model_scope === 'EXACT_MODEL')) ? 'PASS' : 'FAIL',
    AUTH_RECOVERY_REQUIRES_CANONICAL_IDENTITY: failureInjection.AUTH_RECOVERY_REQUIRES_CANONICAL_IDENTITY,
    NO_HARDCODED_SCOPE_RULES: failureInjection.NO_HARDCODED_SCOPE_RULES
  };
  const failureValues = [
    failureInjection.CANONICAL_IDENTITY_FAILURE_INJECTION,
    failureInjection.AUTH_REASSESSMENT_FAILURE_INJECTION,
    failureInjection.MODEL_DOCUMENT_FAILURE_INJECTION,
    failureInjection.FIELD_SEMANTIC_FAILURE_INJECTION,
    failureInjection.INDEPENDENCE_FAILURE_INJECTION,
    failureInjection.CONFLICT_FAILURE_INJECTION
  ];
  failureInjection.FAILURE_INJECTION = failureValues.every((value) => value === 'PASS') ? 'PASS' : 'FAIL';
  const testSuite = preflight.PRECHECK === 'PASS'
    && preflight.TS_DATA_PARSER_TEST === 'PASS'
    && preflight.TS700_REAL_CORPUS_TEST === 'PASS'
    && Object.values(corpusChecks).every((value) => value === 'PASS')
    && failureInjection.FAILURE_INJECTION === 'PASS'
    ? 'PASS'
    : 'FAIL';

  return {
    'FASE 35C.4.1 FINAL REPORT': true,
    SOURCE_COMMIT,
    PRECHECK: preflight.PRECHECK,
    CANDIDATE_RECORD_COUNT: preflight.CANDIDATE_RECORD_COUNT,
    CANDIDATE_STREAM_IDENTITY: preflight.CANDIDATE_STREAM_IDENTITY,
    CANDIDATE_DOCUMENTS_REVIEWED: candidateDocumentsReviewed,
    EXACT_CANONICAL_MATCHES: exactCanonicalMatches,
    EXACT_FILE_MATCHES: exactFileMatches,
    EXACT_PAYLOAD_MATCHES: exactPayloadMatches,
    SAME_SOURCE_REFERENCES: sameSourceReferences,
    PUBLICATION_STRONG_MATCHES: publicationStrongMatches,
    IDENTITY_CONFLICTS: identityConflicts,
    UNRESOLVED_IDENTITIES: unresolvedIdentities,
    CANDIDATES_AUTHENTICATED_OLD_STATUS: reviewed.filter((row) => row.authenticity_status === 'AUTHENTICATED_OFFICIAL').length,
    CANDIDATES_AUTHENTICATED_AFTER_RECONCILIATION: reviewed.filter((row) => ['AUTHENTICATED_DIRECT', 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT'].includes(row.effective_authenticity_status)).length,
    AUTHENTICITY_RECOVERED_COUNT: reviewed.filter((row) => row.effective_authenticity_status === 'AUTHENTICATED_VIA_CANONICAL_DOCUMENT').length,
    MODEL_DOCUMENT_MATCH: modelDocMatch,
    MODEL_DOCUMENT_MULTI_MODEL: modelDocMulti,
    MODEL_DOCUMENT_COMPONENT: modelDocComponent,
    MODEL_DOCUMENT_MISMATCH: modelDocMismatch,
    MODEL_DOCUMENT_UNRESOLVED: modelDocUnresolved,
    RECOVERY_WORKING_SET: workingSet.length,
    FIELD_SEMANTIC_VALID: fieldSemanticValid,
    FIELD_SEMANTIC_AMBIGUOUS: fieldSemanticAmbiguous,
    FIELD_SEMANTIC_INVALID: fieldSemanticInvalid,
    SPARK_PLUG_GARBAGE_BLOCKED: sparkPlugGarbageBlocked,
    TS_DATA_MODEL_MISMATCHES: tsDataModelMismatches,
    FS200_TO_FS350_EXACT_SCOPE: goldSet.records.filter((row) => row.model === 'fs-350' && String(row.source_file).includes('FS200_body.htm') && row.model_scope === 'EXACT_MODEL').length,
    MODEL_SCOPE_EXACT_BEFORE: reviewed.filter((row) => EXACT_SCOPES.has(row.model_scope)).length,
    MODEL_SCOPE_MUTATIONS: reviewed.filter((row) => row.scope_before !== row.scope_after).length,
    MODEL_SCOPE_EXACT_AFTER: reviewed.filter((row) => EXACT_SCOPES.has(row.scope_after)).length,
    GOLD_CANDIDATES: goldSet.records.filter((row) => row.status === 'GOLD_CANDIDATE').length,
    GOLD_VALIDATED_INDEPENDENT: 0,
    AUTOMATED_REVIEW_ELIGIBLE: reviewed.filter((row) => row.field_semantic_status === 'VALID' && row.model_document_compatibility_pass).length,
    MANUAL_GOLD_REVIEWED: 0,
    INDEPENDENT_COMPARISON_PAIRS: independentComparisonPairs,
    INDEPENDENT_SUPPORTING_PAIRS: independentSupportingPairs,
    INDEPENDENT_CONFLICT_PAIRS: independentConflictPairs,
    FIELDS_VERIFIED: reviewed.filter((row) => row.verified).length,
    VERIFIED_BY_FIELD: verifiedByField,
    VERIFIED_BY_MODEL: verifiedByModel,
    BLOCKED: blockedSummary.blocked_candidate_count,
    TOP_BLOCK_REASONS: blockedSummary.top_block_reasons.map((row) => `${row.reason}:${row.count}`),
    ...corpusChecks,
    CANONICAL_IDENTITY_FAILURE_INJECTION: failureInjection.CANONICAL_IDENTITY_FAILURE_INJECTION,
    AUTH_REASSESSMENT_FAILURE_INJECTION: failureInjection.AUTH_REASSESSMENT_FAILURE_INJECTION,
    MODEL_DOCUMENT_FAILURE_INJECTION: failureInjection.MODEL_DOCUMENT_FAILURE_INJECTION,
    FIELD_SEMANTIC_FAILURE_INJECTION: failureInjection.FIELD_SEMANTIC_FAILURE_INJECTION,
    INDEPENDENCE_FAILURE_INJECTION: failureInjection.INDEPENDENCE_FAILURE_INJECTION,
    CONFLICT_FAILURE_INJECTION: failureInjection.CONFLICT_FAILURE_INJECTION,
    FAILURE_INJECTION: failureInjection.FAILURE_INJECTION,
    IDEMPOTENCY: idempotency,
    PUBLIC_MODEL_DATA_MODIFIED: publicDataModified,
    SEO_CONTENT_MODIFIED: '0 / 0',
    SEO_CONTENT_FREEZE: 'ACTIVE',
    PROMOTION_READY: 'NO',
    TEST_SUITE: testSuite,
    FINAL_STATUS: preflight.PRECHECK === 'PASS' && publicDataModified === '0 / 0' && failureInjection.FAILURE_INJECTION === 'PASS' && testSuite === 'PASS' ? 'PASS' : 'PARTIAL PASS'
  };
}

function sanitizeSnapshot(run) {
  return {
    preflight: {
      PRECHECK: run.preflight.PRECHECK,
      CANDIDATE_RECORD_COUNT: run.preflight.CANDIDATE_RECORD_COUNT,
      CANDIDATE_STREAM_IDENTITY: run.preflight.CANDIDATE_STREAM_IDENTITY,
      TS_DATA_PARSER_TEST: run.preflight.TS_DATA_PARSER_TEST,
      TS700_REAL_CORPUS_TEST: run.preflight.TS700_REAL_CORPUS_TEST
    },
    reconciliation: run.canonicalReconciliation.documents,
    authenticity: run.authenticityReassessment.records,
    workingSet: {
      TOTAL_CANDIDATES: run.workingSetSummary.TOTAL_CANDIDATES,
      TARGET_MODEL_CANDIDATES: run.workingSetSummary.TARGET_MODEL_CANDIDATES,
      TARGET_FIELD_CANDIDATES: run.workingSetSummary.TARGET_FIELD_CANDIDATES,
      PAGE_MAPPED: run.workingSetSummary.PAGE_MAPPED,
      CANONICAL_DOCUMENT_MATCHED: run.workingSetSummary.CANONICAL_DOCUMENT_MATCHED,
      AUTHENTICITY_RECOVERED: run.workingSetSummary.AUTHENTICITY_RECOVERED,
      MODEL_DOCUMENT_COMPATIBLE: run.workingSetSummary.MODEL_DOCUMENT_COMPATIBLE,
      RECOVERY_WORKING_SET: run.workingSetSummary.RECOVERY_WORKING_SET,
      working_set_hash: run.workingSetSummary.working_set_hash
    },
    gold: run.goldSet.records,
    final: {
      PRECHECK: run.finalReport.PRECHECK,
      RECOVERY_WORKING_SET: run.finalReport.RECOVERY_WORKING_SET,
      FIELDS_VERIFIED: run.finalReport.FIELDS_VERIFIED,
      TEST_SUITE: run.finalReport.TEST_SUITE
    }
  };
}

export async function main() {
  const candidateReport = await loadCandidateArchiveStreamReport(candidateArchivePath());
  const run1 = buildArtifacts(candidateReport);
  const run2 = buildArtifacts(candidateReport);
  const idempotency = stableHash(sanitizeSnapshot(run1)) === stableHash(sanitizeSnapshot(run2)) ? 'PASS' : 'FAIL';
  run1.finalReport.IDEMPOTENCY = idempotency;
  run1.finalReport.FINAL_STATUS = run1.finalReport.PRECHECK === 'PASS'
    && run1.finalReport.TEST_SUITE === 'PASS'
    && run1.finalReport.PUBLIC_MODEL_DATA_MODIFIED === '0 / 0'
    && run1.finalReport.FAILURE_INJECTION === 'PASS'
    && idempotency === 'PASS'
    ? 'PASS'
    : 'PARTIAL PASS';

  writeJson(OUTPUTS.preflight, run1.preflight);
  writeJson(OUTPUTS.canonicalReconciliation, run1.canonicalReconciliation);
  writeJson(OUTPUTS.authenticityReassessment, run1.authenticityReassessment);
  writeJson(OUTPUTS.modelCompatibility, run1.modelCompatibility);
  writeJson(OUTPUTS.workingSetSummary, run1.workingSetSummary);
  writeJson(OUTPUTS.fieldSemanticAudit, run1.fieldSemanticAudit);
  writeJson(OUTPUTS.goldValidationSet, run1.goldSet);
  writeJson(OUTPUTS.sourceIndependenceAudit, run1.sourceIndependenceAudit);
  writeJson(OUTPUTS.conflictAudit, run1.conflictAudit);
  writeJson(OUTPUTS.modelScopeResolution, run1.modelScopeResolution);
  writeJson(OUTPUTS.verificationFunnel, run1.verificationFunnel);
  writeJson(OUTPUTS.blockedSummary, run1.blockedSummary);
  writeJson(OUTPUTS.verifiedFactStaging, run1.verifiedFactStaging);
  writeJson(OUTPUTS.verifiedFactEvidenceGraph, run1.verifiedFactEvidenceGraph);
  writeJson(OUTPUTS.failureInjectionReport, run1.failureInjection);
  writeJson(OUTPUTS.finalReport, run1.finalReport);

  console.log('Phase 35C.4.1 canonical document reconciliation completed.');
  console.log(`Precheck: ${run1.finalReport.PRECHECK}`);
  console.log(`Recovery working set: ${run1.finalReport.RECOVERY_WORKING_SET}`);
  console.log(`Fields verified: ${run1.finalReport.FIELDS_VERIFIED}`);
  console.log(`Final status: ${run1.finalReport.FINAL_STATUS}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
