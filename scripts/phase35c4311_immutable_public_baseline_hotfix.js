import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import { buildStructuredData } from '../src/components/StructuredData.js';
import {
  buildPublicEvidenceFields,
  normalizePublicEvidenceModelKey
} from '../src/publicEvidence.js';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const PHASE_ID = '35C.4.3.1.1';
const HOTFIX_BASELINE_COMMIT = '4457b41d7fed36274fd9d98ef74600df27898789';
const PREVIOUS_SCS_PHASE_COMMIT = '31603a59d9c60d322deabe0bd679a6677fc7bd14';
const IMMUTABLE_PUBLIC_BASELINE_PATH = 'data/public_evidence_facts.json';
const ALLOWED_SOURCE_CLASSES = new Set(['OFFICIAL_LEGACY_TECHNICAL_DATA']);
const ALLOWED_SCOPE_STATES = new Set(['EXACT_MODEL_EXPLICIT', 'MULTI_MODEL_EXPLICIT']);
const VARIANT_SUFFIXES = new Set(['T', 'C', 'R', 'RX', 'RT', 'TC', 'CM', 'C-M']);
const SPARK_BRANDS = ['BOSCH', 'NGK', 'CHAMPION'];
const SPARK_CONTAMINATION_PATTERNS = [
  /RAPID(?:-MICRO|-SUPER)?/i,
  /\bPICCO\b/i,
  /\bCHAIN\b/i,
  /SAW CHAIN/i,
  /\bANSI\b/i,
  /\bPITCH\b/i,
  /\bRM\b/i,
  /\bRS\b/i,
  /\b0?\.325\b/i,
  /\b3\/8\b/i,
  /\b1\/4\b/i
];
const OUTPUTS = {
  preflight: path.join(rootDir, 'data', 'phase35c4311_preflight_report.json'),
  immutableBaselineAudit: path.join(rootDir, 'data', 'phase35c4311_immutable_baseline_audit.json'),
  baselinePreservationAudit: path.join(rootDir, 'data', 'phase35c4311_baseline_fact_preservation_audit.json'),
  regression026046Audit: path.join(rootDir, 'data', 'phase35c4311_026_046_regression_audit.json'),
  promotionGateAudit: path.join(rootDir, 'data', 'phase35c4311_promotion_gate_audit.json'),
  lineagePreservationAudit: path.join(rootDir, 'data', 'phase35c4311_lineage_preservation_audit.json'),
  conflictSafetyAudit: path.join(rootDir, 'data', 'phase35c4311_conflict_safety_audit.json'),
  candidateTransitionAudit: path.join(rootDir, 'data', 'phase35c4311_candidate_transition_audit.json'),
  finalTransitionAccounting: path.join(rootDir, 'data', 'phase35c4311_final_transition_accounting.json'),
  correctedStaging: path.join(rootDir, 'data', 'phase35c4311_corrected_public_fact_staging.json'),
  indexIntegrityAudit: path.join(rootDir, 'data', 'phase35c4311_index_integrity_audit.json'),
  decoderRegression: path.join(rootDir, 'data', 'phase35c4311_decoder_regression_audit.json'),
  structuredDataAudit: path.join(rootDir, 'data', 'phase35c4311_structured_data_audit.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c4311_failure_injection_report.json'),
  idempotency: path.join(rootDir, 'data', 'phase35c4311_idempotency_report.json'),
  finalReport: path.join(rootDir, 'data', 'phase35c4311_final_report.json')
};

const HISTORICAL_INPUTS = {
  factCandidates: 'data/phase35c43_fact_candidates.json',
  promotionAudit: 'data/phase35c43_public_fact_promotion_audit.json',
  publicCoverage: 'data/phase35c43_public_coverage_before_after.json',
  finalReport: 'data/phase35c43_final_report.json',
  previousHotfixFinalReport: 'data/phase35c431_final_report.json',
  previousHotfixStaging: 'data/phase35c431_corrected_public_fact_staging.json'
};

const LIVE_INPUTS = {
  database: path.join(rootDir, 'data', 'stihl_database.json'),
  tsRecords: path.join(rootDir, 'data', 'phase35c3_ts_data_records.json')
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSourceLocator(fact) {
  return normalizeTsSourcePath(fact?.source_locator || fact?.underlying_source_path || fact?.publication_id || '');
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableId(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

function git(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function gitShow(commit, repoPath) {
  return execFileSync('git', ['show', `${commit}:${repoPath.replace(/\\/g, '/')}`], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  });
}

function readImmutableJson(commit, repoPath) {
  return JSON.parse(gitShow(commit, repoPath));
}

function sha256Raw(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hasCommittedDiff(fromCommit, toCommit, repoPath) {
  try {
    execFileSync('git', ['diff', '--quiet', fromCommit, toCommit, '--', repoPath], { cwd: rootDir, stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
}

function isAncestor(ancestor, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, commit], { cwd: rootDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function worktreeStatus() {
  return git(['status', '--short']) || 'CLEAN';
}

function buildPreflight() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  const statusLines = worktreeStatus().split(/\r?\n/).filter(Boolean);
  const normalizedStatus = statusLines.map((line) => line.replace(/\\/g, '/'));
  const sensitiveDirty = normalizedStatus.filter((line) => /scripts\/phase35c43_scs_machine_dossier_graph\.js|scripts\/phase35c431_scs_promotion_safety_hotfix\.js|src\/publicEvidence\.js|src\/components\/StructuredData\.js|src\/decoder\.js/.test(line));
  const failures = [];
  const worktreePublicStoreDirty = normalizedStatus.some((line) => /data\/public_evidence_facts\.json/.test(line));
  const baselineIdentityChanged = hasCommittedDiff(PREVIOUS_SCS_PHASE_COMMIT, HOTFIX_BASELINE_COMMIT, IMMUTABLE_PUBLIC_BASELINE_PATH);

  if (head !== HOTFIX_BASELINE_COMMIT) failures.push('HEAD_NOT_HOTFIX_BASELINE_COMMIT');
  if (originMain !== HOTFIX_BASELINE_COMMIT) failures.push('ORIGIN_MAIN_NOT_HOTFIX_BASELINE_COMMIT');
  if (mergeBase !== HOTFIX_BASELINE_COMMIT) failures.push('MERGE_BASE_NOT_HOTFIX_BASELINE_COMMIT');
  if (sensitiveDirty.length > 0) failures.push('35C43_LOGIC_DIRTY');
  if (baselineIdentityChanged) failures.push('BASELINE_IDENTITY_CHANGED_IN_GIT');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    HOTFIX_BASELINE_COMMIT,
    PREVIOUS_SCS_PHASE_COMMIT,
    HEAD: head,
    ORIGIN_MAIN: originMain,
    MERGE_BASE: mergeBase,
    WORKTREE_STATUS: worktreeStatus(),
    WORKTREE_PUBLIC_STORE_DIRTY: worktreePublicStoreDirty ? 'YES' : 'NO',
    BASELINE_IDENTITY: baselineIdentityChanged ? 'FAIL' : 'PASS',
    SENSITIVE_DIRTY_FILES: sensitiveDirty,
    PRECHECK_FAILURES: failures,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL'
  };
}

function readHistoricalJson(repoPath) {
  return readImmutableJson(PREVIOUS_SCS_PHASE_COMMIT, repoPath);
}

function readHotfixBaselineJson(repoPath) {
  return readImmutableJson(HOTFIX_BASELINE_COMMIT, repoPath);
}

function readHotfixBaselineRaw(repoPath) {
  return gitShow(HOTFIX_BASELINE_COMMIT, repoPath);
}

function normalizeFactForComparison(fact) {
  return sanitizeForIdempotency(fact);
}

function factsEquivalent(left, right) {
  return JSON.stringify(normalizeFactForComparison(left)) === JSON.stringify(normalizeFactForComparison(right));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildFactIdMap(facts) {
  return new Map((facts || []).map((fact) => [fact.fact_id, fact]));
}

function buildFactIdentityKey(fact) {
  return stableHash([
    normalizePublicEvidenceModelKey(fact.model_slug),
    fact.field,
    normalizeValueForEquality(fact.field, fact.normalized_value),
    fact.source_locator || fact.publication_id || fact.source_document_id || '',
    fact.model_scope || ''
  ]);
}

function normalizeModelScopeForTransition(scope) {
  if (scope === 'EXACT_MODEL' || scope === 'EXACT_MODEL_EXPLICIT') return 'EXACT_MODEL';
  if (scope === 'MULTI_MODEL_EXPLICIT' || scope === 'MULTI_MODEL_EXPLICIT_SHARED_VALUE') return 'MULTI_MODEL_EXPLICIT_SHARED_VALUE';
  return scope || 'UNKNOWN';
}

function buildTransitionIdentityKey(record) {
  const sourceLocator = normalizeTsSourcePath(
    record.source_locator
    || record.underlying_source_path
    || record.underlying_source_locator
    || record.publication_id
    || record.source_document_id
    || ''
  );
  return stableHash([
    normalizePublicEvidenceModelKey(record.model_slug || record.model),
    record.field,
    normalizeValueForEquality(record.field, record.normalized_value),
    sourceLocator,
    normalizeModelScopeForTransition(record.model_scope || record.source_scope)
  ]);
}

function hasWindowsPath(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[A-Z]:\\|file:\/\/\//i.test(text);
}

function buildTsRecordIndexes(tsRecordPayload) {
  const byId = new Map();
  const bySource = new Map();
  for (const record of tsRecordPayload.records || []) {
    byId.set(record.record_id, record);
    const sourceKey = normalizeTsSourcePath(record.source_file);
    if (!bySource.has(sourceKey)) bySource.set(sourceKey, []);
    bySource.get(sourceKey).push(record);
  }
  return { byId, bySource };
}

function normalizeTsSourcePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^.*?\/doc\//i, 'doc/')
    .replace(/^.*?\/PDF\//i, 'PDF/');
}

function parseMetricFirst(rawValue) {
  const match = String(rawValue || '').match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function parseRpm(rawValue) {
  const match = String(rawValue || '').match(/\b(\d{1,2}[,.]\d{3}|\d{4,5})\b/);
  if (!match) return null;
  const value = Number(match[1].replace(/[.,]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function parsePowerRecord(rawValue) {
  const text = String(rawValue || '');
  const exact = text.match(/(\d+(?:[.,]\d+)?)\s*\((\d+(?:[.,]\d+)?)\)\s*(\d{1,2}[,.]\d{3}|\d{4,5})/);
  if (exact) {
    const kw = Number(exact[1].replace(',', '.'));
    const hp = Number(exact[2].replace(',', '.'));
    const rpm = Number(exact[3].replace(/[.,]/g, ''));
    return {
      kw: Number.isFinite(kw) ? kw : null,
      hp: Number.isFinite(hp) ? hp : null,
      rpm: Number.isFinite(rpm) ? rpm : null
    };
  }
  return {
    kw: parseMetricFirst(text),
    hp: null,
    rpm: parseRpm(text)
  };
}

function normalizeScopeToken(prefix, number, suffix = null) {
  const normalizedPrefix = normalizeText(prefix).toLowerCase();
  const normalizedNumber = normalizeText(number);
  const normalizedSuffix = normalizeText(suffix).toLowerCase();
  if (!normalizedPrefix && normalizedSuffix) return `${normalizedNumber}-${normalizedSuffix}`;
  if (!normalizedPrefix) return normalizedNumber;
  return normalizedSuffix
    ? `${normalizedPrefix}-${normalizedNumber}-${normalizedSuffix}`
    : `${normalizedPrefix}-${normalizedNumber}`;
}

function parseExplicitScopeModels(heading) {
  const text = normalizeText(heading).replace(/^Testing and Setting Data\s*\|/i, '');
  const scopeText = text.includes(':') ? text.split(':').slice(1).join(':') : text;
  const parts = scopeText.split(/[,;/]+/).map((part) => normalizeText(part)).filter(Boolean);
  const models = [];
  let carryPrefix = null;

  for (const part of parts) {
    const joined = part.replace(/\s+/g, ' ').trim();
    const exactMatch = joined.match(/^([A-Z]{1,4})\s*(\d{2,4})(?:\s+([A-Z]{1,3}(?:-[A-Z]{1,2})?))?$/i)
      || joined.match(/^(\d{2,4})(?:\s+([A-Z]{1,3}(?:-[A-Z]{1,2})?))?$/i)
      || joined.match(/^([A-Z]{1,4})\s*(\d{2,4})([A-Z]{1,3})$/i);

    if (!exactMatch) continue;

    if (exactMatch.length === 4 && exactMatch[1] && exactMatch[2]) {
      carryPrefix = /^[A-Z]{1,4}$/i.test(exactMatch[1]) ? exactMatch[1] : carryPrefix;
      const prefix = /^[A-Z]{1,4}$/i.test(exactMatch[1]) ? exactMatch[1] : null;
      const number = prefix ? exactMatch[2] : exactMatch[1];
      const suffix = prefix ? exactMatch[3] : exactMatch[2];
      models.push(normalizeScopeToken(prefix, number, suffix));
      continue;
    }

    if (exactMatch.length === 3 && /^[A-Z]{1,4}$/i.test(exactMatch[1])) {
      carryPrefix = exactMatch[1];
      models.push(normalizeScopeToken(exactMatch[1], exactMatch[2], null));
      continue;
    }

    if (exactMatch.length === 3) {
      models.push(normalizeScopeToken(carryPrefix, exactMatch[1], exactMatch[2] || null));
    }
  }

  return [...new Set(models)];
}

function classifyScope(scopeModels, targetModel) {
  const normalizedTarget = normalizePublicEvidenceModelKey(targetModel);
  if (!Array.isArray(scopeModels) || scopeModels.length === 0) return 'SCOPE_NOT_STATED';
  if (!scopeModels.includes(normalizedTarget)) return 'SCOPE_CONFLICT';
  return scopeModels.length === 1 ? 'EXACT_MODEL_EXPLICIT' : 'MULTI_MODEL_EXPLICIT';
}

function detectManufacturers(fieldHeading) {
  const heading = String(fieldHeading || '').toUpperCase();
  return SPARK_BRANDS.filter((brand) => heading.includes(brand));
}

function containsSparkContamination(rawValue) {
  const text = normalizeText(rawValue);
  return SPARK_CONTAMINATION_PATTERNS.some((pattern) => pattern.test(text));
}

function parseSparkCodes(rawValue) {
  const tokens = normalizeText(rawValue).toUpperCase().replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
  const codes = [];
  let index = 0;

  while (index < tokens.length) {
    const prefix = tokens[index];
    const numeric = tokens[index + 1];
    const suffixA = tokens[index + 2];
    const suffixB = tokens[index + 3];

    if (/^[A-Z]{2,5}$/.test(prefix) && /^\d{1,2}$/.test(numeric) && /^[A-Z]{1,3}$/.test(suffixA)) {
      const parts = [prefix, numeric, suffixA];
      let consumed = 3;
      if (/^[A-Z]{1,3}$/.test(suffixB) && !SPARK_BRANDS.includes(suffixB)) {
        parts.push(suffixB);
        consumed = 4;
      }
      codes.push(parts.join(' '));
      index += consumed;
      continue;
    }

    return {
      codes: [],
      tokens,
      valid: false
    };
  }

  return {
    codes,
    tokens,
    valid: codes.length > 0
  };
}

function parseSparkSemantics(rawValue, fieldHeading) {
  const heading = normalizeText(fieldHeading);
  const manufacturers = detectManufacturers(heading);
  if (/electrode gap/i.test(heading) || /\bmm\b/i.test(heading) && /\bin\b/i.test(heading)) {
    return {
      corrected_field: 'electrode_gap_mm',
      normalized_value: parseMetricFirst(rawValue),
      semantic_status: Number.isFinite(parseMetricFirst(rawValue)) ? 'VALID' : 'INVALID',
      manufacturers_detected: [],
      plug_tokens_detected: [],
      blocking_reasons: Number.isFinite(parseMetricFirst(rawValue)) ? [] : ['ELECTRODE_GAP_PARSE_FAILED']
    };
  }
  if (containsSparkContamination(rawValue)) {
    return {
      corrected_field: 'spark_plug',
      normalized_value: null,
      semantic_status: 'INVALID',
      manufacturers_detected: manufacturers,
      plug_tokens_detected: [],
      blocking_reasons: ['SPARK_CHAIN_CONTAMINATION']
    };
  }
  const parsed = parseSparkCodes(rawValue);
  if (!parsed.valid) {
    return {
      corrected_field: 'spark_plug',
      normalized_value: null,
      semantic_status: 'INVALID',
      manufacturers_detected: manufacturers,
      plug_tokens_detected: parsed.tokens,
      blocking_reasons: ['SPARK_COMBINED_IDENTIFIER_INVALID']
    };
  }
  if (manufacturers.length === 0) {
    return {
      corrected_field: 'spark_plug',
      normalized_value: null,
      semantic_status: 'INVALID',
      manufacturers_detected: [],
      plug_tokens_detected: parsed.codes,
      blocking_reasons: ['SPARK_MANUFACTURER_CONTEXT_MISSING']
    };
  }
  if (manufacturers.length !== parsed.codes.length) {
    return {
      corrected_field: 'spark_plug',
      normalized_value: null,
      semantic_status: 'AMBIGUOUS',
      manufacturers_detected: manufacturers,
      plug_tokens_detected: parsed.codes,
      blocking_reasons: ['SPARK_CARDINALITY_AMBIGUOUS']
    };
  }

  const normalized = manufacturers.map((manufacturer, index) => ({
    manufacturer,
    model: parsed.codes[index]
  }));

  const combinedLeak = normalized.some((entry, index) => {
    const otherManufacturers = manufacturers.filter((_, otherIndex) => otherIndex !== index);
    return otherManufacturers.some((brand) => entry.model.includes(brand))
      || (entry.manufacturer === 'BOSCH' && /\bBPMR\b/i.test(entry.model));
  });

  if (combinedLeak) {
    return {
      corrected_field: 'spark_plug',
      normalized_value: null,
      semantic_status: 'INVALID',
      manufacturers_detected: manufacturers,
      plug_tokens_detected: parsed.codes,
      blocking_reasons: ['SPARK_COMBINED_MANUFACTURER_VALUE_LEAK']
    };
  }

  return {
    corrected_field: 'spark_plug',
    normalized_value: normalized,
    semantic_status: 'VALID',
    manufacturers_detected: manufacturers,
    plug_tokens_detected: parsed.codes,
    blocking_reasons: []
  };
}

function buildFieldMeasurementDefinition(field) {
  const definitions = {
    displacement_cc: 'ENGINE_DISPLACEMENT',
    bore_mm: 'CYLINDER_BORE',
    stroke_mm: 'PISTON_STROKE',
    power_kw: 'ENGINE_POWER_KW',
    power_hp: 'ENGINE_POWER_HP',
    idle_speed_rpm: 'ENGINE_IDLE_SPEED',
    max_engine_speed_rpm: 'MAX_ENGINE_SPEED',
    spark_plug: 'NOT_APPLICABLE',
    electrode_gap_mm: 'SPARK_PLUG_ELECTRODE_GAP',
    fuel_tank_l: 'FUEL_TANK_CAPACITY',
    oil_tank_l: 'CHAIN_OIL_TANK_CAPACITY',
    weight_kg: 'UNKNOWN_WEIGHT_DEFINITION'
  };
  return definitions[field] || null;
}

function normalizeValueForEquality(field, value) {
  if (field === 'spark_plug' && Array.isArray(value)) {
    return value.map((entry) => ({
      manufacturer: normalizeText(entry.manufacturer).toUpperCase(),
      model: normalizeText(entry.model).replace(/\s+/g, ' ')
    }));
  }
  return value;
}

function sanitizeNumeric(value) {
  return Number.isFinite(value) ? value : null;
}

function reparseCandidate(candidate, tsRecord) {
  const actualHeading = tsRecord?.source_section?.split('|').slice(1).join('|').trim() || candidate.source_heading || null;
  const fieldHeading = candidate.field_heading || null;
  const actualSourcePath = tsRecord ? normalizeTsSourcePath(tsRecord.source_file) : candidate.underlying_source_path;
  const scopeModels = parseExplicitScopeModels(actualHeading);
  const sourceScope = classifyScope(scopeModels, candidate.model_slug);
  const base = {
    ...candidate,
    historical_field: candidate.field,
    historical_status: candidate.public_evidence_status,
    actual_source_heading: actualHeading,
    field_heading: fieldHeading,
    underlying_source_path: actualSourcePath,
    source_scope: sourceScope,
    scope_models: scopeModels,
    scope_evidence: actualHeading ? [actualHeading] : [],
    source_lineage: candidate.source_lineage || tsRecord?.source_batch || null,
    authenticity_status: candidate.authenticity_status ?? null,
    independence_status: candidate.independence_status ?? null
  };

  if (candidate.field === 'spark_plug') {
    const spark = parseSparkSemantics(candidate.raw_value, fieldHeading);
    return {
      ...base,
      field: spark.corrected_field,
      normalized_value: spark.normalized_value,
      unit: spark.corrected_field === 'electrode_gap_mm' ? 'mm' : null,
      measurement_definition: buildFieldMeasurementDefinition(spark.corrected_field),
      semantic_status: spark.semantic_status,
      spark_manufacturers_detected: spark.manufacturers_detected,
      spark_plug_tokens_detected: spark.plug_tokens_detected,
      reevaluated_blocking_reasons: [...spark.blocking_reasons]
    };
  }

  if (candidate.field === 'displacement_cc') {
    return {
      ...base,
      normalized_value: sanitizeNumeric(parseMetricFirst(candidate.raw_value)),
      unit: 'cc',
      measurement_definition: buildFieldMeasurementDefinition(candidate.field),
      semantic_status: Number.isFinite(parseMetricFirst(candidate.raw_value)) ? 'VALID' : 'INVALID',
      reevaluated_blocking_reasons: Number.isFinite(parseMetricFirst(candidate.raw_value)) ? [] : ['NUMERIC_PARSE_FAILED']
    };
  }
  if (candidate.field === 'bore_mm' || candidate.field === 'stroke_mm') {
    return {
      ...base,
      normalized_value: sanitizeNumeric(parseMetricFirst(candidate.raw_value)),
      unit: 'mm',
      measurement_definition: buildFieldMeasurementDefinition(candidate.field),
      semantic_status: Number.isFinite(parseMetricFirst(candidate.raw_value)) ? 'VALID' : 'INVALID',
      reevaluated_blocking_reasons: Number.isFinite(parseMetricFirst(candidate.raw_value)) ? [] : ['NUMERIC_PARSE_FAILED']
    };
  }
  if (candidate.field === 'idle_speed_rpm' || candidate.field === 'max_engine_speed_rpm') {
    return {
      ...base,
      normalized_value: sanitizeNumeric(parseRpm(candidate.raw_value)),
      unit: 'rpm',
      measurement_definition: buildFieldMeasurementDefinition(candidate.field),
      semantic_status: Number.isFinite(parseRpm(candidate.raw_value)) ? 'VALID' : 'INVALID',
      reevaluated_blocking_reasons: Number.isFinite(parseRpm(candidate.raw_value)) ? [] : ['NUMERIC_PARSE_FAILED']
    };
  }
  if (candidate.field === 'power_kw' || candidate.field === 'power_hp') {
    const power = parsePowerRecord(candidate.raw_value);
    const value = candidate.field === 'power_kw' ? power.kw : power.hp;
    return {
      ...base,
      normalized_value: sanitizeNumeric(value),
      unit: candidate.field === 'power_kw' ? 'kW' : 'hp',
      measurement_definition: buildFieldMeasurementDefinition(candidate.field),
      semantic_status: Number.isFinite(value) ? 'VALID' : 'INVALID',
      reevaluated_blocking_reasons: Number.isFinite(value) ? [] : ['NUMERIC_PARSE_FAILED'],
      extra: {
        rated_speed_rpm: power.rpm,
        counterpart_value: candidate.field === 'power_kw' ? power.hp : power.kw
      }
    };
  }
  if (candidate.field === 'weight_kg') {
    return {
      ...base,
      normalized_value: sanitizeNumeric(parseMetricFirst(candidate.raw_value)),
      unit: 'kg',
      measurement_definition: buildFieldMeasurementDefinition(candidate.field),
      semantic_status: 'INVALID',
      reevaluated_blocking_reasons: ['MEASUREMENT_DEFINITION_UNKNOWN']
    };
  }
  if (candidate.field === 'fuel_tank_l' || candidate.field === 'oil_tank_l') {
    return {
      ...base,
      normalized_value: sanitizeNumeric(parseMetricFirst(candidate.raw_value)),
      unit: 'l',
      measurement_definition: buildFieldMeasurementDefinition(candidate.field),
      semantic_status: Number.isFinite(parseMetricFirst(candidate.raw_value)) ? 'VALID' : 'INVALID',
      reevaluated_blocking_reasons: Number.isFinite(parseMetricFirst(candidate.raw_value)) ? [] : ['NUMERIC_PARSE_FAILED']
    };
  }

  return {
    ...base,
    normalized_value: candidate.normalized_value,
    measurement_definition: buildFieldMeasurementDefinition(candidate.field),
    semantic_status: candidate.semantic_status || 'INVALID',
    reevaluated_blocking_reasons: []
  };
}

function buildLiveFactIndex(liveStore) {
  const byField = new Map();
  for (const fact of liveStore.facts || []) {
    const key = `${normalizePublicEvidenceModelKey(fact.model_slug)}::${fact.field}`;
    if (!byField.has(key)) byField.set(key, []);
    byField.get(key).push(fact);
  }
  return byField;
}

function hasEquivalentLiveValue(liveFacts, candidate) {
  const normalizedCandidate = JSON.stringify(normalizeValueForEquality(candidate.field, candidate.normalized_value));
  return (liveFacts || []).some((fact) => JSON.stringify(normalizeValueForEquality(candidate.field, fact.normalized_value)) === normalizedCandidate);
}

function evaluateSCSCandidatePromotionEligibility(candidate, liveFactIndex) {
  const checks = {};
  const blocking = [...new Set(candidate.reevaluated_blocking_reasons || [])];
  const liveFacts = liveFactIndex.get(`${normalizePublicEvidenceModelKey(candidate.model_slug)}::${candidate.field}`) || [];

  checks.allowed_source_class = ALLOWED_SOURCE_CLASSES.has(candidate.underlying_source_class);
  if (!checks.allowed_source_class) blocking.push('DERIVATIVE_SOURCE_NOT_TECHNICAL_EVIDENCE');

  checks.source_lineage_present = Boolean(candidate.source_lineage);
  if (!checks.source_lineage_present) blocking.push('SOURCE_LINEAGE_MISSING');

  checks.source_locator_present = Boolean(candidate.underlying_source_path);
  if (!checks.source_locator_present) blocking.push('SOURCE_PAYLOAD_OR_LOCATOR_MISSING');

  checks.source_heading_present = Boolean(candidate.actual_source_heading);
  if (!checks.source_heading_present) blocking.push('SOURCE_HEADING_MISSING');

  checks.source_heading_not_placeholder = Boolean(candidate.actual_source_heading && !/^SCS$/i.test(normalizeText(candidate.actual_source_heading)));
  if (!checks.source_heading_not_placeholder) blocking.push('NO_TECHNICAL_DATA_IN_SOURCE');

  checks.semantic_valid = candidate.semantic_status === 'VALID';
  if (!checks.semantic_valid) blocking.push(candidate.semantic_status === 'AMBIGUOUS' ? 'SEMANTIC_AMBIGUOUS' : 'SEMANTIC_INVALID');

  checks.normalized_value_present = candidate.normalized_value != null
    && (!Array.isArray(candidate.normalized_value) || candidate.normalized_value.length > 0);
  if (!checks.normalized_value_present) blocking.push('NULL_NORMALIZED_VALUE');

  checks.allowed_scope = ALLOWED_SCOPE_STATES.has(candidate.source_scope);
  if (!checks.allowed_scope) blocking.push(candidate.source_scope === 'SCOPE_CONFLICT' ? 'MODEL_NOT_IN_EXPLICIT_SOURCE_SCOPE' : 'SCOPE_NOT_STATED');

  checks.target_in_scope = Array.isArray(candidate.scope_models) && candidate.scope_models.includes(normalizePublicEvidenceModelKey(candidate.model_slug));
  if (!checks.target_in_scope) blocking.push('PROMOTION_SCOPE_REVALIDATION_FAILED');

  checks.measurement_definition_known = Boolean(candidate.measurement_definition && candidate.measurement_definition !== 'UNKNOWN_WEIGHT_DEFINITION');
  if (!checks.measurement_definition_known) blocking.push('MEASUREMENT_DEFINITION_UNKNOWN');

  checks.authenticated = candidate.authenticity_status === 'AUTHENTICATED_OFFICIAL';
  if (!checks.authenticated) blocking.push('AUTHENTICITY_NOT_SUFFICIENT');

  checks.independence_status_present = Boolean(candidate.independence_status);
  if (!checks.independence_status_present) blocking.push('INDEPENDENCE_STATUS_MISSING');

  checks.lineage_independence_safe = !(candidate.source_lineage === 'BATCH6_STIHL_LEGACY_DOCUMENT_CD' && candidate.independence_status === 'INDEPENDENT_PROVEN');
  if (!checks.lineage_independence_safe) blocking.push('SCS_LINEAGE_INDEPENDENCE_MISMATCH');

  checks.unresolved_conflict = !blocking.includes('OFFICIAL_CONFLICT_UNRESOLVED');
  if (!checks.unresolved_conflict) blocking.push('OFFICIAL_CONFLICT_UNRESOLVED');

  checks.numeric_sanity = Array.isArray(candidate.normalized_value)
    ? candidate.normalized_value.every((entry) => normalizeText(entry.manufacturer) && normalizeText(entry.model))
    : (typeof candidate.normalized_value === 'number' ? Number.isFinite(candidate.normalized_value) : true);
  if (!checks.numeric_sanity) blocking.push('NUMERIC_SANITY_FAILED');

  checks.variant_scope_safe = !candidate.scope_models.some((scopeModel) => normalizePublicEvidenceModelKey(scopeModel) !== normalizePublicEvidenceModelKey(candidate.model_slug) && shareBaseModel(scopeModel, candidate.model_slug));
  if (!checks.variant_scope_safe) blocking.push('VARIANT_SCOPE_UNRESOLVED');

  checks.live_conflict_safe = liveFacts.length === 0 || hasEquivalentLiveValue(liveFacts, candidate);
  if (!checks.live_conflict_safe) blocking.push('OFFICIAL_CONFLICT_UNRESOLVED');

  const eligible = blocking.length === 0;
  return {
    eligible,
    status: eligible ? 'OFFICIAL_DOCUMENTED' : 'BLOCKED',
    blocking_reasons: [...new Set(blocking)],
    checks
  };
}

function shareBaseModel(left, right) {
  const normalize = (value) => normalizePublicEvidenceModelKey(value).replace(/-(t|c|r|rx|rt|tc|cm|c-m)$/i, '');
  return normalize(left) === normalize(right);
}

function inferModelMeta(modelSlug, database) {
  const model = (database.models || []).find((entry) => normalizePublicEvidenceModelKey(entry.slug || entry.model_name) === normalizePublicEvidenceModelKey(modelSlug));
  return {
    model_name: model?.model_name || String(modelSlug).toUpperCase(),
    category: model?.category || model?.category_slug || 'UNKNOWN'
  };
}

function buildCorrectedPromotions(reevaluatedCandidates, immutableBaseline, database) {
  const liveFactIndex = buildLiveFactIndex(immutableBaseline);
  const corrected = [];
  const blocked = [];
  const gateRecords = [];
  const seenKeys = new Set();
  const redundant = [];
  const baselineIdentityKeys = new Set((immutableBaseline.facts || []).map((fact) => buildFactIdentityKey(fact)));
  const baselineFactIds = new Set((immutableBaseline.facts || []).map((fact) => fact.fact_id));
  let factIdCollisions = 0;

  for (const candidate of reevaluatedCandidates) {
    const gate = evaluateSCSCandidatePromotionEligibility(candidate, liveFactIndex);
    const liveFacts = liveFactIndex.get(`${normalizePublicEvidenceModelKey(candidate.model_slug)}::${candidate.field}`) || [];
    const equivalentBaseline = liveFacts.find((fact) => JSON.stringify(normalizeValueForEquality(candidate.field, fact.normalized_value)) === JSON.stringify(normalizeValueForEquality(candidate.field, candidate.normalized_value)));
    const baselineConflict = liveFacts.length > 0 && !equivalentBaseline;
    const redundancyClassification = Boolean(equivalentBaseline);
    gateRecords.push({
      candidate_id: candidate.candidate_id,
      model: candidate.model_slug,
      field: candidate.field,
      source: candidate.underlying_source_path,
      eligible: gate.eligible,
      status: gate.status,
      redundant_with_baseline: redundancyClassification,
      blocked_by_baseline_conflict: baselineConflict,
      blocking_reasons: gate.blocking_reasons,
      checks: gate.checks
    });

    if (!gate.eligible) {
      blocked.push({
        ...candidate,
        corrected_status: gate.status,
        corrected_blocking_reasons: gate.blocking_reasons
      });
      continue;
    }

    if (equivalentBaseline) {
      redundant.push({
        ...candidate,
        redundancy_reason: 'REDUNDANT_SUPPORTING_SOURCE',
        baseline_fact_id: equivalentBaseline.fact_id
      });
      continue;
    }

    const key = stableHash([
      normalizePublicEvidenceModelKey(candidate.model_slug),
      candidate.field,
      normalizeValueForEquality(candidate.field, candidate.normalized_value),
      candidate.underlying_source_path,
      candidate.source_scope
    ]);
    if (seenKeys.has(key)) {
      blocked.push({
        ...candidate,
        corrected_status: 'BLOCKED',
        corrected_blocking_reasons: ['DUPLICATE_SOURCE_FACT']
      });
      continue;
    }
    seenKeys.add(key);

    const meta = inferModelMeta(candidate.model_slug, database);
    const fact = {
      fact_id: stableId([PHASE_ID, candidate.model_slug, candidate.field, candidate.underlying_source_path, normalizeValueForEquality(candidate.field, candidate.normalized_value)]),
      model_slug: candidate.model_slug,
      variant_slug: candidate.model_slug,
      model_name: meta.model_name,
      category: meta.category,
      field: candidate.field,
      raw_value: candidate.raw_value,
      normalized_value: candidate.normalized_value,
      unit: candidate.unit,
      measurement_definition: candidate.measurement_definition,
      public_evidence_status: 'OFFICIAL_DOCUMENTED',
      display_eligible: true,
      single_value_eligible: true,
      source_class: candidate.underlying_source_class,
      source_document_id: candidate.underlying_source_id,
      source_document_title: 'STIHL technische dataset',
      publication_id: candidate.publication_id,
      pdf_page: null,
      printed_page: null,
      market: null,
      revision: null,
      configuration: null,
      model_scope: candidate.source_scope === 'EXACT_MODEL_EXPLICIT' ? 'EXACT_MODEL' : 'MULTI_MODEL_EXPLICIT_SHARED_VALUE',
      scope_evidence: candidate.scope_evidence,
      field_semantic_status: candidate.semantic_status,
      conflict_group_id: null,
      conflict_status: 'CLEAR',
      conflicting_values: [],
      source_url: null,
      evidence_hash: stableHash([candidate.model_slug, candidate.field, normalizeValueForEquality(candidate.field, candidate.normalized_value), candidate.underlying_source_path]),
      generated_from_phase: PHASE_ID,
      evidence_status: 'OFFICIAL_DOCUMENTED',
      source_locator_type: 'TS_DATA',
      source_locator: candidate.underlying_source_path,
      source_heading: candidate.actual_source_heading,
      source_lineage: candidate.source_lineage,
      independence_status: candidate.independence_status,
      underlying_source_id: candidate.underlying_source_id,
      underlying_source_class: candidate.underlying_source_class,
      underlying_source_locator: candidate.underlying_source_path,
      authenticity_status: candidate.authenticity_status
    };
    if (baselineFactIds.has(fact.fact_id) || baselineIdentityKeys.has(buildFactIdentityKey(fact))) {
      factIdCollisions += 1;
      blocked.push({
        ...candidate,
        corrected_status: 'BLOCKED',
        corrected_blocking_reasons: ['DUPLICATE_SOURCE_FACT']
      });
      continue;
    }
    corrected.push(fact);
  }

  const mergedFacts = [...cloneJson(immutableBaseline.facts || []), ...corrected];
  const modelIndex = {};
  const fieldIndex = {};
  for (const fact of mergedFacts) {
    if (!modelIndex[fact.model_slug]) {
      modelIndex[fact.model_slug] = {
        model_name: fact.model_name,
        category: fact.category,
        aliases: [fact.model_slug, fact.model_name, `STIHL ${fact.model_name}`],
        fact_ids: []
      };
    }
    modelIndex[fact.model_slug].fact_ids.push(fact.fact_id);
    if (!fieldIndex[fact.model_slug]) fieldIndex[fact.model_slug] = {};
    if (!fieldIndex[fact.model_slug][fact.field]) fieldIndex[fact.model_slug][fact.field] = [];
    fieldIndex[fact.model_slug][fact.field].push(fact.fact_id);
  }

  return {
    corrected,
    blocked,
    redundant,
    factIdCollisions,
    gateRecords,
    mergedOverlay: {
      schema_version: 'public-evidence-v1',
      generated_at: new Date().toISOString(),
      generated_from_phase: PHASE_ID,
      facts: mergedFacts,
      model_index: modelIndex,
      field_index: fieldIndex
    }
  };
}

function buildPromotionGateAudit(gateRecords) {
  const checkNames = new Set();
  for (const record of gateRecords) {
    Object.keys(record.checks).forEach((key) => checkNames.add(key));
  }

  const records = [...checkNames].sort().map((checkName) => {
    const rows = gateRecords.filter((record) => Object.prototype.hasOwnProperty.call(record.checks, checkName));
    const failed = rows.filter((record) => record.checks[checkName] === false);
    return {
      check: checkName,
      checked_count: rows.length,
      failed_count: failed.length,
      examples: failed.slice(0, 3).map((row) => ({
        candidate_id: row.candidate_id,
        model: row.model,
        field: row.field,
        source: row.source,
        blocking_reasons: row.blocking_reasons
      }))
    };
  });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records
  };
}

function buildSparkAudit(reevaluatedCandidates, correctedFacts) {
  const correctedKeySet = new Set(correctedFacts.map((fact) => `${fact.model_slug}::${fact.field}::${fact.source_locator}`));
  const records = reevaluatedCandidates
    .filter((candidate) => candidate.historical_field === 'spark_plug')
    .map((candidate) => ({
      model: candidate.model_slug,
      source: candidate.underlying_source_path,
      field_heading: candidate.field_heading,
      raw_value: candidate.raw_value,
      manufacturers_detected: candidate.spark_manufacturers_detected || [],
      plug_tokens_detected: candidate.spark_plug_tokens_detected || [],
      normalized_value: candidate.normalized_value,
      semantic_status: candidate.semantic_status,
      promotion_status: correctedKeySet.has(`${candidate.model_slug}::${candidate.field}::${candidate.underlying_source_path}`) ? 'PROMOTED' : 'BLOCKED',
      reason: candidate.reevaluated_blocking_reasons || []
    }));

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SPARK_FACTS_REEVALUATED: records.length,
    SPARK_FACTS_VALID: records.filter((row) => row.semantic_status === 'VALID').length,
    SPARK_FACTS_BLOCKED: records.filter((row) => row.promotion_status === 'BLOCKED').length,
    SPARK_COMBINED_MANUFACTURER_VALUE_LEAKS: records.filter((row) => Array.isArray(row.normalized_value) && row.normalized_value.some((entry) => /\bBPMR\b/i.test(entry.model) && entry.manufacturer === 'BOSCH')).length,
    records
  };
}

function buildVariantScopeAudit(reevaluatedCandidates) {
  const focusModels = new Set(['020', '020-t', 'ms-200', 'ms-200-t', 'ms-360', 'ms-360-c', 'fs-100', 'fs-100-r', 'fs-100-rx']);
  const records = reevaluatedCandidates
    .filter((candidate) => focusModels.has(candidate.model_slug) || candidate.scope_models.some((model) => focusModels.has(model)))
    .map((candidate) => ({
      model: candidate.model_slug,
      source: candidate.underlying_source_path,
      heading: candidate.actual_source_heading,
      scope_models: candidate.scope_models,
      scope_status: candidate.source_scope,
      field: candidate.field,
      corrected_blocking_reasons: candidate.reevaluated_blocking_reasons
    }));

  const ms360VariantBlocked = records
    .filter((row) => row.model === 'ms-360' && /ms360c_body/i.test(row.source))
    .every((row) => row.scope_status === 'SCOPE_CONFLICT');
  const tVariantBlocked = records
    .filter((row) => row.model === '020')
    .every((row) => row.scope_status === 'SCOPE_CONFLICT');
  const ms200tBlocked = records
    .filter((row) => row.model === 'ms-200')
    .every((row) => row.scope_status === 'SCOPE_CONFLICT');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    MS360_VARIANT_SCOPE_RESULT: ms360VariantBlocked ? 'BLOCKED' : 'FAILED',
    SCOPE_020_020T_RESULT: tVariantBlocked ? 'BLOCKED' : 'FAILED',
    SCOPE_MS200_MS200T_RESULT: ms200tBlocked ? 'BLOCKED' : 'FAILED',
    records
  };
}

function buildCandidateReevaluation(historicalPromoted, reevaluatedCandidates, correctedFacts) {
  const historicalKeys = new Map();
  for (const fact of historicalPromoted) {
    historicalKeys.set(`${fact.model_slug}::${fact.field}::${fact.source_locator || fact.underlying_source_path || fact.publication_id}`, fact);
  }
  const correctedKeys = new Map();
  for (const fact of correctedFacts) {
    correctedKeys.set(`${fact.model_slug}::${fact.field}::${fact.source_locator}`, fact);
  }

  const records = reevaluatedCandidates.map((candidate) => {
    const key = `${candidate.model_slug}::${candidate.field}::${candidate.underlying_source_path}`;
    const historical = historicalKeys.get(`${candidate.model_slug}::${candidate.historical_field}::${candidate.underlying_source_path}`);
    const corrected = correctedKeys.get(key);
    return {
      candidate_id: candidate.candidate_id,
      model: candidate.model_slug,
      historical_field: candidate.historical_field,
      corrected_field: candidate.field,
      source: candidate.underlying_source_path,
      raw_value: candidate.raw_value,
      historical_promoted: Boolean(historical),
      corrected_promoted: Boolean(corrected),
      historical_status: candidate.historical_status,
      corrected_status: corrected ? 'OFFICIAL_DOCUMENTED' : 'BLOCKED',
      normalized_value: candidate.normalized_value,
      blocking_reasons: candidate.corrected_blocking_reasons || []
    };
  });

  const removed = records.filter((row) => row.historical_promoted && !row.corrected_promoted);
  const changed = records.filter((row) => row.historical_promoted && row.corrected_promoted && row.historical_field !== row.corrected_field);
  const retained = records.filter((row) => row.historical_promoted && row.corrected_promoted).length;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    CANDIDATES_REEVALUATED: records.length,
    OLD_PROMOTABLE: historicalPromoted.length,
    NEW_PROMOTABLE: correctedFacts.length,
    PROMOTIONS_RETAINED: retained,
    PROMOTIONS_REMOVED: removed.length,
    PROMOTIONS_CHANGED: changed.length,
    records
  };
}

function buildTransitionAccounting(historicalPromoted, correctedFacts) {
  const correctedByIdentity = new Map();
  for (const fact of correctedFacts) {
    correctedByIdentity.set(`${fact.model_slug}::${fact.field}::${normalizeSourceLocator(fact)}`, fact);
  }

  const classifications = [];
  const replacementMappings = [];
  const usedCorrectedKeys = new Set();
  let retainedUnchanged = 0;
  let removed = 0;
  let replacedOldFacts = 0;
  let replacementFacts = 0;

  for (const historical of historicalPromoted) {
    const identityKey = `${historical.model_slug}::${historical.field}::${normalizeSourceLocator(historical)}`;
    const corrected = correctedByIdentity.get(identityKey);
    const oldStatus = historical.public_evidence_status || historical.evidence_status || 'UNKNOWN';
    const oldNormalized = normalizeValueForEquality(historical.field, historical.normalized_value);
    const sourceLocator = normalizeSourceLocator(historical);
    const sourceHeading = historical.source_heading || null;

    if (corrected) {
      const newStatus = corrected.public_evidence_status || corrected.evidence_status || 'UNKNOWN';
      const newNormalized = normalizeValueForEquality(corrected.field, corrected.normalized_value);
      const unchanged = historical.field === corrected.field
        && JSON.stringify(oldNormalized) === JSON.stringify(newNormalized)
        && normalizeText(historical.raw_value) === normalizeText(corrected.raw_value)
        && oldStatus === newStatus;

      if (unchanged) {
        retainedUnchanged += 1;
        usedCorrectedKeys.add(identityKey);
        classifications.push({
          classification: 'RETAINED_UNCHANGED',
          model: historical.model_slug,
          field: historical.field,
          source_locator: sourceLocator,
          source_heading: sourceHeading,
          old_raw_value: historical.raw_value,
          old_normalized_value: historical.normalized_value,
          old_status: oldStatus,
          new_raw_value: corrected.raw_value,
          new_normalized_value: corrected.normalized_value,
          new_status: newStatus
        });
        continue;
      }

      replacedOldFacts += 1;
      replacementFacts += 1;
      usedCorrectedKeys.add(identityKey);
      replacementMappings.push({
        model: historical.model_slug,
        field: historical.field,
        old_raw_value: historical.raw_value,
        old_normalized_value: historical.normalized_value,
        old_status: oldStatus,
        new_raw_value: corrected.raw_value,
        new_normalized_value: corrected.normalized_value,
        new_status: newStatus,
        source_locator: sourceLocator,
        source_heading: corrected.source_heading || sourceHeading,
        replacement_reason: inferReplacementReason(historical, corrected)
      });
      classifications.push({
        classification: 'REPLACED_BY_CORRECTED_FACT',
        model: historical.model_slug,
        field: historical.field,
        source_locator: sourceLocator,
        source_heading: corrected.source_heading || sourceHeading,
        old_raw_value: historical.raw_value,
        old_normalized_value: historical.normalized_value,
        old_status: oldStatus,
        new_raw_value: corrected.raw_value,
        new_normalized_value: corrected.normalized_value,
        new_status: newStatus
      });
      continue;
    }

    removed += 1;
    classifications.push({
      classification: 'REMOVED',
      model: historical.model_slug,
      field: historical.field,
      source_locator: sourceLocator,
      source_heading: sourceHeading,
      old_raw_value: historical.raw_value,
      old_normalized_value: historical.normalized_value,
      old_status: oldStatus,
      new_raw_value: null,
      new_normalized_value: null,
      new_status: null,
      removal_reason: inferRemovedPromotionReason(historical)
    });
  }

  const newAfterReevaluationRecords = correctedFacts
    .filter((fact) => !usedCorrectedKeys.has(`${fact.model_slug}::${fact.field}::${normalizeSourceLocator(fact)}`))
    .map((fact) => ({
      classification: 'NEW_AFTER_REEVALUATION',
      model: fact.model_slug,
      field: fact.field,
      source_locator: normalizeSourceLocator(fact),
      source_heading: fact.source_heading || null,
      new_raw_value: fact.raw_value,
      new_normalized_value: fact.normalized_value,
      new_status: fact.public_evidence_status || fact.evidence_status || 'UNKNOWN'
    }));

  const newAfterReevaluation = newAfterReevaluationRecords.length;
  const historicalPromotions = historicalPromoted.length;
  const correctedPromotions = correctedFacts.length;
  const historicalInvariant = historicalPromotions === retainedUnchanged + removed + replacedOldFacts;
  const correctedInvariant = correctedPromotions === retainedUnchanged + replacementFacts + newAfterReevaluation;
  const accountingPass = historicalInvariant && correctedInvariant;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    HISTORICAL_PROMOTIONS: historicalPromotions,
    RETAINED_UNCHANGED: retainedUnchanged,
    REMOVED: removed,
    REPLACED_OLD_FACTS: replacedOldFacts,
    REPLACEMENT_FACTS: replacementFacts,
    NEW_AFTER_REEVALUATION: newAfterReevaluation,
    CORRECTED_PROMOTIONS: correctedPromotions,
    HISTORICAL_INVARIANT: historicalInvariant ? 'PASS' : 'FAIL',
    CORRECTED_INVARIANT: correctedInvariant ? 'PASS' : 'FAIL',
    PRECOMMIT_ACCOUNTING: accountingPass ? 'PASS' : 'FAIL',
    replacement_mappings: replacementMappings,
    new_after_reevaluation_records: newAfterReevaluationRecords,
    classifications
  };
}

function inferReplacementReason(historical, corrected) {
  if (historical.field === 'spark_plug' && corrected.field === 'spark_plug') {
    return 'SPARK_MANUFACTURER_MODEL_SPLIT_CORRECTED';
  }
  if (historical.field !== corrected.field) {
    return `FIELD_REMAP_${historical.field}_TO_${corrected.field}`;
  }
  if (JSON.stringify(normalizeValueForEquality(historical.field, historical.normalized_value)) !== JSON.stringify(normalizeValueForEquality(corrected.field, corrected.normalized_value))) {
    return 'NORMALIZED_VALUE_CORRECTED';
  }
  if (normalizeText(historical.raw_value) !== normalizeText(corrected.raw_value)) {
    return 'RAW_VALUE_CORRECTED';
  }
  return 'STATUS_OR_METADATA_CORRECTED';
}

function buildRemovedPromotionsAudit(historicalPromoted, correctedFacts) {
  const correctedKeys = new Set(correctedFacts.map((fact) => `${fact.model_slug}::${fact.field}::${fact.source_locator}`));
  const records = historicalPromoted
    .filter((fact) => !correctedKeys.has(`${fact.model_slug}::${fact.field}::${fact.source_locator || fact.underlying_source_path}`))
    .map((fact) => ({
      model: fact.model_slug,
      field: fact.field,
      old_value: fact.normalized_value,
      source: fact.source_locator || fact.underlying_source_path || fact.publication_id,
      reason: inferRemovedPromotionReason(fact)
    }));

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records
  };
}

function inferRemovedPromotionReason(fact) {
  if (/020t_body|ms200t_body|ms360c_body/i.test(String(fact.source_locator || ''))) return 'VARIANT_SCOPE_UNRESOLVED';
  if (fact.field === 'spark_plug' && Array.isArray(fact.normalized_value) && fact.normalized_value.some((entry) => /\bBPMR\b/i.test(entry.model) && entry.manufacturer === 'BOSCH')) {
    return 'SPARK_SEMANTIC_INVALID';
  }
  return 'PROMOTION_GATE_FAILED';
}

function summarizeCoverage(immutableBaseline, correctedOverlay, correctedFacts, redundantFacts, blockedFacts) {
  const countModels = (facts) => new Set(facts.map((fact) => normalizePublicEvidenceModelKey(fact.model_slug))).size;
  const baselineModelSet = new Set((immutableBaseline.facts || []).map((fact) => normalizePublicEvidenceModelKey(fact.model_slug)));
  const stagedModelSet = new Set((correctedOverlay.facts || []).map((fact) => normalizePublicEvidenceModelKey(fact.model_slug)));
  return {
    BASELINE_PUBLIC_FACTS: (immutableBaseline.facts || []).length,
    SAFE_NEW_SCS_FACTS: correctedFacts.length,
    SCS_FACTS_REDUNDANT_WITH_BASELINE: redundantFacts.length,
    SCS_REDUNDANT_FACTS_SKIPPED: redundantFacts.length,
    SCS_FACTS_BLOCKED_BY_BASELINE_VALUE_CONFLICT: blockedFacts.filter((fact) => (fact.corrected_blocking_reasons || []).includes('OFFICIAL_CONFLICT_UNRESOLVED')).length,
    TOTAL_CORRECTED_STAGED_FACTS: correctedOverlay.facts.length,
    BASELINE_MODELS_WITH_FACTS: baselineModelSet.size,
    STAGED_MODELS_WITH_FACTS: stagedModelSet.size,
    NEW_MODELS_ADDED_BY_SCS: [...stagedModelSet].filter((model) => !baselineModelSet.has(model)).length,
    MODELS_WITH_SAFE_STAGED_FACTS: countModels(correctedOverlay.facts || [])
  };
}

function buildStratifiedSample(correctedFacts) {
  const ordered = [...correctedFacts].sort((left, right) => {
    const byModel = left.model_slug.localeCompare(right.model_slug);
    if (byModel !== 0) return byModel;
    const byField = left.field.localeCompare(right.field);
    if (byField !== 0) return byField;
    return String(left.source_locator).localeCompare(String(right.source_locator));
  });
  const sample = [];
  const seenModels = new Set();
  const seenFields = new Set();

  const addFirst = (predicate) => {
    const found = ordered.find((row) => predicate(row) && !sample.includes(row));
    if (found) {
      sample.push(found);
      seenModels.add(found.model_slug);
      seenFields.add(found.field);
    }
  };

  addFirst((row) => row.model_scope === 'EXACT_MODEL');
  addFirst((row) => row.model_scope === 'MULTI_MODEL_EXPLICIT_SHARED_VALUE');
  addFirst((row) => row.field === 'spark_plug');
  addFirst((row) => row.field === 'power_kw');
  addFirst((row) => row.field === 'idle_speed_rpm');
  addFirst((row) => /^\d/.test(row.model_slug));
  addFirst((row) => /^[a-z]{2,4}-\d/.test(row.model_slug));

  for (const row of ordered) {
    if (sample.length >= 25 || seenModels.size >= 5) break;
    if (sample.includes(row) || seenModels.has(row.model_slug)) continue;
    sample.push(row);
    seenModels.add(row.model_slug);
    seenFields.add(row.field);
  }

  for (const row of ordered) {
    if (sample.length >= 25 || seenFields.size >= 5) break;
    if (sample.includes(row) || seenFields.has(row.field)) continue;
    sample.push(row);
    seenModels.add(row.model_slug);
    seenFields.add(row.field);
  }

  for (const row of ordered) {
    if (sample.length >= 25) break;
    if (sample.includes(row)) continue;
    sample.push(row);
    seenModels.add(row.model_slug);
    seenFields.add(row.field);
  }

  const models = [...new Set(sample.map((row) => row.model_slug))];
  const fields = [...new Set(sample.map((row) => row.field))];
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SAMPLE_MODELS: models,
    SAMPLE_FIELDS: fields,
    HAS_EXACT_SCOPE: sample.some((row) => row.model_scope === 'EXACT_MODEL') ? 'YES' : 'NO',
    HAS_MULTI_MODEL_SCOPE: sample.some((row) => row.model_scope === 'MULTI_MODEL_EXPLICIT_SHARED_VALUE') ? 'YES' : 'NO',
    HAS_SPARK: sample.some((row) => row.field === 'spark_plug') ? 'YES' : 'NO',
    HAS_POWER: sample.some((row) => row.field === 'power_kw') ? 'YES' : 'NO',
    HAS_RPM: sample.some((row) => row.field === 'idle_speed_rpm') ? 'YES' : 'NO',
    SAMPLE_REQUIREMENTS_PASS: models.length >= 5 && fields.length >= 5
      && sample.some((row) => row.model_scope === 'EXACT_MODEL')
      && sample.some((row) => row.model_scope === 'MULTI_MODEL_EXPLICIT_SHARED_VALUE')
      && sample.some((row) => row.field === 'spark_plug')
      && sample.some((row) => row.field === 'power_kw')
      && sample.some((row) => row.field === 'idle_speed_rpm')
      ? 'PASS'
      : 'FAIL',
    records: sample.slice(0, 25).map((row) => ({
      model: row.model_slug,
      field: row.field,
      normalized_value: row.normalized_value,
      source: row.source_locator,
      scope: row.model_scope
    }))
  };
}

function buildBlockedSample(blockedCandidates) {
  const ordered = [...blockedCandidates].sort((left, right) => left.model_slug.localeCompare(right.model_slug) || left.field.localeCompare(right.field));
  const requiredClasses = [
    'MODEL_NOT_IN_EXPLICIT_SOURCE_SCOPE',
    'SEMANTIC_INVALID',
    'OFFICIAL_CONFLICT_UNRESOLVED',
    'SOURCE_HEADING_MISSING',
    'VARIANT_SCOPE_UNRESOLVED',
    'MEASUREMENT_DEFINITION_UNKNOWN'
  ];
  const sample = [];
  for (const reason of requiredClasses) {
    const found = ordered.find((row) => (row.corrected_blocking_reasons || []).includes(reason) && !sample.includes(row));
    if (found) sample.push(found);
  }
  for (const row of ordered) {
    if (sample.length >= 25) break;
    if (!sample.includes(row)) sample.push(row);
  }
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: sample.slice(0, 25).map((row) => ({
      model: row.model_slug,
      field: row.field,
      source: row.underlying_source_path,
      reason: row.corrected_blocking_reasons
    }))
  };
}

function buildImmutableBaselineAudit(preflight, immutableBaselineRaw, immutableBaseline) {
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    HOTFIX_BASELINE_COMMIT,
    IMMUTABLE_PUBLIC_BASELINE_COMMIT: HOTFIX_BASELINE_COMMIT,
    BASELINE_IDENTITY: preflight.BASELINE_IDENTITY,
    BASELINE_PUBLIC_STORE_RAW_SHA256: sha256Raw(immutableBaselineRaw),
    BASELINE_PUBLIC_STORE_CANONICAL_SHA256: sha256Canonical(immutableBaseline),
    WORKTREE_PUBLIC_STORE_DIRTY: preflight.WORKTREE_PUBLIC_STORE_DIRTY,
    IMMUTABLE_GIT_BASELINE_USED: 'PASS',
    BASELINE_FACT_COUNT: (immutableBaseline.facts || []).length
  };
}

function buildBaselineFactPreservationAudit(immutableBaseline, correctedOverlay) {
  const stagedByFactId = buildFactIdMap(correctedOverlay.facts || []);
  const records = (immutableBaseline.facts || []).map((fact) => {
    const staged = stagedByFactId.get(fact.fact_id);
    return {
      fact_id: fact.fact_id,
      model: fact.model_slug,
      field: fact.field,
      baseline_hash: sha256Canonical(normalizeFactForComparison(fact)),
      staging_hash: staged ? sha256Canonical(normalizeFactForComparison(staged)) : null,
      preserved: Boolean(staged) && factsEquivalent(fact, staged),
      changed: Boolean(staged) && !factsEquivalent(fact, staged),
      removed: !staged
    };
  });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_FACTS_BEFORE: records.length,
    BASELINE_FACTS_PRESERVED: records.filter((row) => row.preserved).length,
    BASELINE_FACTS_REMOVED: records.filter((row) => row.removed).length,
    BASELINE_FACTS_CHANGED: records.filter((row) => row.changed).length,
    BASELINE_FACTS_REPLACED: 0,
    records
  };
}

function build026046RegressionAudit(immutableBaseline, correctedOverlay) {
  const stagedByFactId = buildFactIdMap(correctedOverlay.facts || []);
  const baseline026 = (immutableBaseline.facts || []).find((fact) => fact.model_slug === '026' && fact.field === 'spark_plug');
  const baseline046 = (immutableBaseline.facts || []).find((fact) => fact.model_slug === '046' && fact.field === 'spark_plug');
  const conflict046 = (immutableBaseline.facts || []).find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm');
  const stagedConflict046 = conflict046 ? stagedByFactId.get(conflict046.fact_id) : null;
  const secondary = stagedConflict046?.conflicting_values?.[0] || null;
  const secondaryIntegrityPass = Boolean(
    secondary?.source_document_id
    && secondary?.publication_id
    && secondary?.source_class
    && secondary?.source_locator
    && secondary?.source_heading
    && secondary?.model_scope
  );

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    '026_BASELINE_SPARK_PRESERVED': baseline026 && factsEquivalent(baseline026, stagedByFactId.get(baseline026.fact_id)) ? 'PASS' : 'FAIL',
    '046_BASELINE_SPARK_PRESERVED': baseline046 && factsEquivalent(baseline046, stagedByFactId.get(baseline046.fact_id)) ? 'PASS' : 'FAIL',
    '046_STROKE_CONFLICT_PRESERVED': conflict046 && factsEquivalent(conflict046, stagedConflict046) ? 'PASS' : 'FAIL',
    '046_CONFLICT_BASELINE_FACT_CHANGED': conflict046 && stagedConflict046 && factsEquivalent(conflict046, stagedConflict046) ? 'NO' : 'YES',
    '046_CONFLICT_SECONDARY_SOURCE_DOCUMENT_ID_PRESENT': secondary?.source_document_id ? 'YES' : 'NO',
    '046_CONFLICT_SECONDARY_PUBLICATION_ID_PRESENT': secondary?.publication_id ? 'YES' : 'NO',
    '046_CONFLICT_SECONDARY_SOURCE_CLASS_PRESENT': secondary?.source_class ? 'YES' : 'NO',
    '046_CONFLICT_SECONDARY_LOCATOR_PRESENT': secondary?.source_locator ? 'YES' : 'NO',
    '046_CONFLICT_SECONDARY_HEADING_PRESENT': secondary?.source_heading ? 'YES' : 'NO',
    '046_CONFLICT_SECONDARY_MODEL_SCOPE_PRESENT': secondary?.model_scope ? 'YES' : 'NO',
    '046_CONFLICT_SECONDARY_PROVENANCE_COMPLETE': secondaryIntegrityPass ? 'PASS' : 'FAIL',
    '046_SECONDARY_SOURCE_DOCUMENT_ID': secondary?.source_document_id || null,
    '046_SECONDARY_PUBLICATION_ID': secondary?.publication_id || null,
    '046_SECONDARY_SOURCE_CLASS': secondary?.source_class || null,
    '046_SECONDARY_SOURCE_LOCATOR': secondary?.source_locator || null,
    '046_SECONDARY_SOURCE_HEADING': secondary?.source_heading || null,
    '046_SECONDARY_MODEL_SCOPE': secondary?.model_scope || null,
    '046_STROKE_STATUS': stagedConflict046?.public_evidence_status || conflict046?.public_evidence_status || 'UNKNOWN',
    '046_STROKE_SINGLE_VALUE_ELIGIBLE': Boolean(stagedConflict046?.single_value_eligible)
  };
}

function buildLineagePreservationAudit(correctedFacts) {
  const records = correctedFacts.map((fact) => ({
    fact_id: fact.fact_id,
    model: fact.model_slug,
    field: fact.field,
    source_locator: fact.source_locator,
    source_lineage: fact.source_lineage || null,
    independence_status: fact.independence_status || null,
    source_class: fact.source_class || null,
    lineage_valid: Boolean(fact.source_lineage),
    independence_valid: Boolean(fact.independence_status)
  }));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    DERIVATIVE_SOURCE_PROMOTIONS: records.filter((row) => row.source_class === 'DERIVATIVE_MACHINE_INDEX').length,
    DOSSIER_AS_DIRECT_TECHNICAL_SOURCE: records.filter((row) => /DOSSIER/i.test(String(row.source_class || ''))).length,
    SCS_FALSE_INDEPENDENCE_PROMOTIONS: records.filter((row) => row.source_lineage === 'BATCH6_STIHL_LEGACY_DOCUMENT_CD' && row.independence_status === 'INDEPENDENT_PROVEN').length,
    SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE: records.filter((row) => !row.lineage_valid).length,
    SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS: records.filter((row) => !row.independence_valid).length,
    records
  };
}

function buildConflictSafetyAudit(blockedFacts, redundantFacts) {
  const byBaselineConflict = blockedFacts.filter((fact) => (fact.corrected_blocking_reasons || []).includes('OFFICIAL_CONFLICT_UNRESOLVED'));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SCS_FACTS_BLOCKED_BY_BASELINE_VALUE_CONFLICT: byBaselineConflict.length,
    SCS_FACTS_REDUNDANT_WITH_BASELINE: redundantFacts.length,
    SCS_REDUNDANT_FACTS_SKIPPED: redundantFacts.length,
    examples: byBaselineConflict.slice(0, 10).map((fact) => ({
      model: fact.model_slug,
      field: fact.field,
      source_locator: fact.underlying_source_path,
      blocking_reasons: fact.corrected_blocking_reasons
    }))
  };
}

function buildCandidateTransitionAudit(correctedFacts, redundantFacts, blockedFacts) {
  const records = [
    ...correctedFacts.map((fact) => ({
      model: fact.model_slug,
      field: fact.field,
      source_locator: fact.source_locator,
      classification: 'RETAINED_SAFE'
    })),
    ...redundantFacts.map((fact) => ({
      model: fact.model_slug,
      field: fact.field,
      source_locator: fact.underlying_source_path,
      classification: 'REDUNDANT_WITH_BASELINE'
    })),
    ...blockedFacts.map((fact) => ({
      model: fact.model_slug,
      field: fact.field,
      source_locator: fact.underlying_source_path,
      classification: classifyBlockedCandidate(fact)
    }))
  ];
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    RETAINED_SAFE: records.filter((row) => row.classification === 'RETAINED_SAFE').length,
    DROPPED_BY_4311: records.filter((row) => row.classification !== 'RETAINED_SAFE').length,
    REDUNDANT_WITH_BASELINE: records.filter((row) => row.classification === 'REDUNDANT_WITH_BASELINE').length,
    METADATA_REPAIRED: 0,
    REJECTED_AUTHENTICITY: records.filter((row) => row.classification === 'REJECTED_AUTHENTICITY').length,
    REJECTED_LINEAGE: records.filter((row) => row.classification === 'REJECTED_LINEAGE').length,
    REJECTED_CONFLICT: records.filter((row) => row.classification === 'REJECTED_CONFLICT').length,
    records
  };
}

function classifyBlockedCandidate(fact) {
  const reasons = fact.corrected_blocking_reasons || [];
  if (reasons.includes('AUTHENTICITY_NOT_SUFFICIENT')) return 'REJECTED_AUTHENTICITY';
  if (reasons.includes('SOURCE_LINEAGE_MISSING') || reasons.includes('SCS_LINEAGE_INDEPENDENCE_MISMATCH') || reasons.includes('INDEPENDENCE_STATUS_MISSING')) return 'REJECTED_LINEAGE';
  if (reasons.includes('OFFICIAL_CONFLICT_UNRESOLVED')) return 'REJECTED_CONFLICT';
  return 'DROPPED_BY_4311';
}

function classifyFinalPrimaryDisposition(candidate) {
  const reasons = candidate.corrected_blocking_reasons || [];
  if (reasons.includes('AUTHENTICITY_NOT_SUFFICIENT')) return 'BLOCKED_AUTHENTICITY';
  if (reasons.includes('SOURCE_LINEAGE_MISSING')) return 'BLOCKED_LINEAGE';
  if (reasons.includes('INDEPENDENCE_STATUS_MISSING') || reasons.includes('SCS_LINEAGE_INDEPENDENCE_MISMATCH')) return 'BLOCKED_INDEPENDENCE';
  if (reasons.includes('MODEL_NOT_IN_EXPLICIT_SOURCE_SCOPE') || reasons.includes('PROMOTION_SCOPE_REVALIDATION_FAILED')) return 'BLOCKED_SCOPE';
  if (reasons.includes('VARIANT_SCOPE_UNRESOLVED')) return 'BLOCKED_VARIANT';
  if (reasons.includes('SEMANTIC_INVALID') || reasons.includes('SPARK_CHAIN_CONTAMINATION') || reasons.includes('SPARK_COMBINED_IDENTIFIER_INVALID') || reasons.includes('SPARK_MANUFACTURER_CONTEXT_MISSING') || reasons.includes('SPARK_CARDINALITY_AMBIGUOUS')) return 'BLOCKED_SEMANTIC';
  if (reasons.includes('MEASUREMENT_DEFINITION_UNKNOWN') || reasons.includes('NULL_NORMALIZED_VALUE')) return 'BLOCKED_MEASUREMENT';
  if (reasons.includes('DUPLICATE_SOURCE_FACT')) return 'BLOCKED_DUPLICATE';
  if (reasons.includes('OFFICIAL_CONFLICT_UNRESOLVED')) return 'BLOCKED_BASELINE_CONFLICT';
  return 'OTHER_BLOCKED';
}

function buildFinalTransitionAccounting(previousHotfixFacts, correctedFacts, redundantFacts, blockedFacts, reevaluatedCandidates) {
  const historicalInputFacts = (previousHotfixFacts || []).filter((fact) => fact.generated_from_phase === '35C.4.3.1');
  const correctedByKey = new Map(correctedFacts.map((fact) => [buildTransitionIdentityKey(fact), fact]));
  const redundantByKey = new Map(redundantFacts.map((fact) => [buildTransitionIdentityKey(fact), fact]));
  const blockedByKey = new Map(blockedFacts.map((fact) => [buildTransitionIdentityKey(fact), fact]));

  const broadCandidateOverlapRecords = reevaluatedCandidates
    .filter((candidate) => {
      const key = buildTransitionIdentityKey(candidate);
      return correctedByKey.has(key) || redundantByKey.has(key) || blockedByKey.has(key);
    })
    .map((candidate) => {
      const key = buildTransitionIdentityKey(candidate);
      let primaryDisposition = 'OTHER_BLOCKED';
      if (correctedByKey.has(key)) primaryDisposition = 'PROMOTED_NEW';
      else if (redundantByKey.has(key)) primaryDisposition = 'REDUNDANT_WITH_BASELINE';
      else if (blockedByKey.has(key)) primaryDisposition = classifyFinalPrimaryDisposition(blockedByKey.get(key));

      const secondaryLabels = [];
      const gateReasons = blockedByKey.get(key)?.corrected_blocking_reasons || candidate.corrected_blocking_reasons || candidate.reevaluated_blocking_reasons || [];
      if (redundantByKey.has(key)) secondaryLabels.push('REDUNDANT_WITH_BASELINE');
      if (gateReasons.includes('OFFICIAL_CONFLICT_UNRESOLVED')) secondaryLabels.push('BLOCKED_BY_BASELINE_CONFLICT');

      return {
        candidate_id: candidate.candidate_id,
        model: candidate.model_slug,
        field: candidate.field,
        source_locator: candidate.underlying_source_path,
        primary_disposition: primaryDisposition,
        secondary_labels: secondaryLabels
      };
    })
    .filter((record) => record.secondary_labels.length > 0);

  const records = historicalInputFacts.map((fact) => {
    const key = buildTransitionIdentityKey(fact);
    let primaryDisposition = 'OTHER_BLOCKED';
    let matchedRecord = null;
    if (correctedByKey.has(key)) {
      primaryDisposition = 'PROMOTED_NEW';
      matchedRecord = correctedByKey.get(key);
    } else if (redundantByKey.has(key)) {
      primaryDisposition = 'REDUNDANT_WITH_BASELINE';
      matchedRecord = redundantByKey.get(key);
    } else if (blockedByKey.has(key)) {
      matchedRecord = blockedByKey.get(key);
      primaryDisposition = classifyFinalPrimaryDisposition(matchedRecord);
    }

    return {
      fact_id: fact.fact_id,
      model: fact.model_slug,
      field: fact.field,
      source_locator: normalizeTsSourcePath(fact.source_locator || fact.publication_id || ''),
      normalized_value: fact.normalized_value,
      primary_disposition: primaryDisposition,
      matched_candidate_id: matchedRecord?.candidate_id || null,
      secondary_labels: broadCandidateOverlapRecords
        .filter((row) => row.model === fact.model_slug && row.field === fact.field && row.source_locator === normalizeTsSourcePath(fact.source_locator || fact.publication_id || ''))
        .flatMap((row) => row.secondary_labels)
        .filter((label, index, array) => array.indexOf(label) === index)
    };
  });

  const inputCandidates = records.length;
  const promotedNew = records.filter((row) => row.primary_disposition === 'PROMOTED_NEW').length;
  const totalBlockedOrRedundant = records.filter((row) => row.primary_disposition !== 'PROMOTED_NEW').length;
  const safeNewFactsExact = correctedFacts.length === promotedNew;
  const invariant = inputCandidates === promotedNew + totalBlockedOrRedundant;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    METRIC_CLASSIFICATION: 'OVERLAPPING_AUDIT_LABELS',
    INPUT_CANDIDATES: inputCandidates,
    PROMOTED_NEW: promotedNew,
    TOTAL_BLOCKED_OR_REDUNDANT: totalBlockedOrRedundant,
    SAFE_NEW_SCS_FACTS_MATCHES_PROMOTED_NEW: safeNewFactsExact ? 'PASS' : 'FAIL',
    INPUT_INVARIANT: invariant ? 'PASS' : 'FAIL',
    REDUNDANT_WITH_BASELINE: redundantFacts.length,
    BLOCKED_BY_BASELINE_CONFLICT: blockedFacts.filter((fact) => (fact.corrected_blocking_reasons || []).includes('OFFICIAL_CONFLICT_UNRESOLVED')).length,
    PRIMARY_DISPOSITION_COUNTS: {
      PROMOTED_NEW: promotedNew,
      REDUNDANT_WITH_BASELINE: records.filter((row) => row.primary_disposition === 'REDUNDANT_WITH_BASELINE').length,
      BLOCKED_BASELINE_CONFLICT: records.filter((row) => row.primary_disposition === 'BLOCKED_BASELINE_CONFLICT').length,
      BLOCKED_AUTHENTICITY: records.filter((row) => row.primary_disposition === 'BLOCKED_AUTHENTICITY').length,
      BLOCKED_LINEAGE: records.filter((row) => row.primary_disposition === 'BLOCKED_LINEAGE').length,
      BLOCKED_INDEPENDENCE: records.filter((row) => row.primary_disposition === 'BLOCKED_INDEPENDENCE').length,
      BLOCKED_SCOPE: records.filter((row) => row.primary_disposition === 'BLOCKED_SCOPE').length,
      BLOCKED_VARIANT: records.filter((row) => row.primary_disposition === 'BLOCKED_VARIANT').length,
      BLOCKED_SEMANTIC: records.filter((row) => row.primary_disposition === 'BLOCKED_SEMANTIC').length,
      BLOCKED_MEASUREMENT: records.filter((row) => row.primary_disposition === 'BLOCKED_MEASUREMENT').length,
      BLOCKED_DUPLICATE: records.filter((row) => row.primary_disposition === 'BLOCKED_DUPLICATE').length,
      OTHER_BLOCKED: records.filter((row) => row.primary_disposition === 'OTHER_BLOCKED').length
    },
    OVERLAP_RECORDS: broadCandidateOverlapRecords,
    FINAL_TRANSITION_ACCOUNTING: invariant && safeNewFactsExact ? 'PASS' : 'FAIL',
    records
  };
}

function buildIndexIntegrityAudit(correctedOverlay) {
  const factIds = new Set((correctedOverlay.facts || []).map((fact) => fact.fact_id));
  const modelIndexIds = [];
  for (const bucket of Object.values(correctedOverlay.model_index || {})) {
    modelIndexIds.push(...(bucket.fact_ids || []));
  }
  const fieldIndexIds = [];
  for (const fieldMap of Object.values(correctedOverlay.field_index || {})) {
    for (const ids of Object.values(fieldMap || {})) fieldIndexIds.push(...ids);
  }
  const duplicateModelIds = modelIndexIds.filter((id, index) => modelIndexIds.indexOf(id) !== index);
  const duplicateFieldIds = fieldIndexIds.filter((id, index) => fieldIndexIds.indexOf(id) !== index);
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    ORPHAN_FACT_IDS: [...factIds].filter((id) => !modelIndexIds.includes(id) || !fieldIndexIds.includes(id)).length,
    MISSING_MODEL_INDEX_FACTS: [...factIds].filter((id) => !modelIndexIds.includes(id)).length,
    MISSING_FIELD_INDEX_FACTS: [...factIds].filter((id) => !fieldIndexIds.includes(id)).length,
    DUPLICATE_INDEX_FACT_IDS: new Set([...duplicateModelIds, ...duplicateFieldIds]).size
  };
}

function buildDecoderRegressionAudit(database, correctedOverlay) {
  const decoderDatabase = { ...database, public_evidence: correctedOverlay };
  const inputs = ['MS999', 'FS999', 'BR601', 'MS 26', '184592301', '11210210800', '11280210800', '0.46', '0.15'];
  const records = inputs.map((input) => {
    const result = decodeStihlCode(input, decoderDatabase);
    return {
      input,
      success: Boolean(result.success),
      identified_model: result.model?.slug || result.model?.model_name || null,
      technical_spec_count: Object.keys(result.technicalSpecs || {}).length,
      probable_serial: Boolean(result.flags?.includes?.('PROBABLE_SERIAL') || result.probableSerial),
      part_warning: Boolean(result.partNumberWarning || result.flags?.includes?.('PART_NUMBER_QUERY'))
    };
  });
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    FUZZY_MODEL_SPEC_ATTACHMENTS: records.filter((row) => ['MS999', 'FS999', 'BR601', 'MS 26'].includes(row.input) && row.technical_spec_count > 0).length,
    PROBABLE_SERIAL_SPEC_ATTACHMENTS: records.filter((row) => row.input === '184592301' && row.technical_spec_count > 0).length,
    PART_NUMBER_MODEL_SPEC_ATTACHMENTS: records.filter((row) => ['11210210800', '11280210800'].includes(row.input) && row.technical_spec_count > 0).length,
    NUMERIC_TOKEN_MODEL_COLLISIONS: records.filter((row) => ['0.46', '0.15'].includes(row.input) && row.technical_spec_count > 0).length,
    records
  };
}

function buildStructuredDataAudit(database, immutableBaseline, correctedOverlay) {
  const dbWithCorrected = { ...database, public_evidence: correctedOverlay };
  const dbWithBaseline = { ...database, public_evidence: immutableBaseline };
  const model026 = (database.models || []).find((model) => normalizePublicEvidenceModelKey(model.slug || model.model_name) === '026');
  const model261 = (database.models || []).find((model) => normalizePublicEvidenceModelKey(model.slug || model.model_name) === 'ms-261');
  const modelFs350 = (database.models || []).find((model) => normalizePublicEvidenceModelKey(model.slug || model.model_name) === 'fs-350');

  const evidence026Live = buildPublicEvidenceFields('026', dbWithBaseline);
  const evidence026Corrected = buildPublicEvidenceFields('026', dbWithCorrected);
  const evidenceFs350Corrected = buildPublicEvidenceFields('fs-350', dbWithCorrected);
  const positive026 = buildStructuredData({
    pageType: 'model',
    model: {
      ...model026,
      slug: model026?.slug || '026',
      model_name: model026?.model_name || '026',
      category: model026?.category || 'Kettingzaag',
      category_slug: model026?.category_slug || 'kettingzagen',
      provenance: { source_document_number: '0458-133-3021' },
      power_kw: model026?.power_kw || 2.4
    },
    url: 'https://www.stihldecoder.nl/kettingzagen/026/',
    publicEvidence: { modelKey: '026', fields: evidence026Live }
  });
  const negative261 = buildStructuredData({
    pageType: 'model',
    model: { ...model261, provenance: { source_document_number: '0458-543-0121' }, power_kw: model261?.power_kw || 2.8 },
    url: 'https://www.stihldecoder.nl/kettingzagen/ms-261/',
    publicEvidence: { modelKey: '026', fields: evidence026Live }
  });
  const positive026Corrected = buildStructuredData({
    pageType: 'model',
    model: {
      ...model026,
      slug: model026?.slug || '026',
      model_name: model026?.model_name || '026',
      category: model026?.category || 'Kettingzaag',
      category_slug: model026?.category_slug || 'kettingzagen',
      provenance: { source_document_number: '0458-133-3021' },
      power_kw: model026?.power_kw || 2.4
    },
    url: 'https://www.stihldecoder.nl/kettingzagen/026/',
    publicEvidence: { modelKey: '026', fields: evidence026Corrected }
  });
  const positiveFs350Corrected = buildStructuredData({
    pageType: 'model',
    model: {
      ...modelFs350,
      slug: modelFs350?.slug || 'fs-350',
      model_name: modelFs350?.model_name || 'FS 350',
      category: modelFs350?.category || 'Bosmaaier',
      category_slug: modelFs350?.category_slug || 'bosmaaiers',
      provenance: { source_document_number: 'FS200_body' },
      power_kw: modelFs350?.power_kw || 1.6
    },
    url: 'https://www.stihldecoder.nl/bosmaaiers/fs-350/',
    publicEvidence: { modelKey: 'fs-350', fields: evidenceFs350Corrected }
  });

  const hasProduct = (graph) => Array.isArray(graph?.['@graph']) && graph['@graph'].some((node) => node['@type'] === 'Product');
  const fs350TechnicalBindings = Array.isArray(positiveFs350Corrected?.['@graph'])
    ? positiveFs350Corrected['@graph']
      .filter((node) => node['@type'] === 'Product')
      .flatMap((node) => node.additionalProperty || [])
    : [];
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    positive_026_product: hasProduct(positive026) ? 'YES' : 'NO',
    negative_ms261_with_026_evidence: hasProduct(negative261) ? 'FAIL' : 'PASS',
    corrected_026_product: hasProduct(positive026Corrected) ? 'YES' : 'NO',
    corrected_fs350_product: hasProduct(positiveFs350Corrected) ? 'YES' : 'NO',
    corrected_fs350_safe: fs350TechnicalBindings.every((prop) => !/026|ms-261/i.test(JSON.stringify(prop))) ? 'PASS' : 'FAIL',
    SCHEMA_MODEL_BINDING: hasProduct(positive026) && !hasProduct(negative261) && hasProduct(positive026Corrected) && fs350TechnicalBindings.every((prop) => !/026|ms-261/i.test(JSON.stringify(prop))) ? 'PASS' : 'FAIL'
  };
}

function buildFailureInjectionReport(context) {
  const validCandidate = context.reevaluatedCandidates.find((candidate) => candidate.model_slug === '009' && candidate.field === 'spark_plug' && candidate.raw_value === 'WSR 6 F BPMR 7 A');
  const derivative = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, underlying_source_class: 'DERIVATIVE_MACHINE_INDEX' }, context.liveFactIndex);
  const falseIndependent = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, independence_status: 'INDEPENDENT_PROVEN' }, context.liveFactIndex);
  const missingAuthenticity = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, authenticity_status: null }, context.liveFactIndex);
  const missingLineage = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, source_lineage: null }, context.liveFactIndex);
  const missingIndependence = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, independence_status: null }, context.liveFactIndex);
  const wrongScope = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, model_slug: 'ms-170', scope_models: ['009'], source_scope: 'EXACT_MODEL_EXPLICIT' }, context.liveFactIndex);
  const missingHeading = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, actual_source_heading: null, scope_evidence: [] }, context.liveFactIndex);
  const missingLocator = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, underlying_source_path: null }, context.liveFactIndex);
  const placeholder = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, actual_source_heading: 'SCS', scope_evidence: ['SCS'] }, context.liveFactIndex);
  const unknownWeight = evaluateSCSCandidatePromotionEligibility({
    ...validCandidate,
    field: 'weight_kg',
    normalized_value: 5.6,
    measurement_definition: 'UNKNOWN_WEIGHT_DEFINITION',
    semantic_status: 'VALID'
  }, context.liveFactIndex);
  const nullValue = evaluateSCSCandidatePromotionEligibility({ ...validCandidate, normalized_value: null }, context.liveFactIndex);
  const duplicateMutation = buildCorrectedPromotions([validCandidate, { ...validCandidate, candidate_id: `${validCandidate.candidate_id}-dup` }], context.immutableBaseline, context.database);
  const sparkCombined = parseSparkSemantics('WSR 6 F BPMR 7 A', 'Type of spark plug BOSCH NGK');
  const sparkAmbiguous = parseSparkSemantics('WSR 6 F BPMR 7 A', 'Type of spark plug BOSCH NGK CHAMPION');
  const sparkContaminated = parseSparkSemantics('Rapid-Super 33 RS', 'Type of spark plug BOSCH NGK');
  const gapAsSpark = parseSparkSemantics('0.5 0.02', 'Spark plug electrode gap mm in');
  const ms170Blocked = context.reevaluatedCandidates.filter((candidate) => candidate.model_slug === 'ms-170' && /009_body/i.test(candidate.underlying_source_path || '')).every((candidate) => !evaluateSCSCandidatePromotionEligibility(candidate, context.liveFactIndex).eligible);
  const ms180Blocked = context.reevaluatedCandidates.filter((candidate) => candidate.model_slug === 'ms-180' && /009_body/i.test(candidate.underlying_source_path || '')).every((candidate) => !evaluateSCSCandidatePromotionEligibility(candidate, context.liveFactIndex).eligible);
  const conflict046 = context.immutableBaseline.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm');
  const numeric046 = decodeStihlCode('0.46', { ...context.database, public_evidence: context.correctedOverlay });
  const numeric015 = decodeStihlCode('0.15', { ...context.database, public_evidence: context.correctedOverlay });
  const variantBleed = context.correctedFacts.every((fact) => !/020t_body|ms200t_body|ms360c_body/i.test(fact.source_locator));
  const baselineEquivalentGap = context.immutableBaseline.facts.find((fact) => fact.model_slug === '026' && fact.field === 'electrode_gap_mm');
  const electrodeGapCandidate = context.reevaluatedCandidates.find((candidate) => candidate.model_slug === '026' && candidate.field === 'electrode_gap_mm');
  const gapConflictCandidate = evaluateSCSCandidatePromotionEligibility({ ...electrodeGapCandidate, normalized_value: 0.7, unit: 'mm', measurement_definition: 'SPARK_PLUG_ELECTRODE_GAP', semantic_status: 'VALID' }, context.liveFactIndex);
  const mutatedWorktreeBaseline = cloneJson(context.immutableBaseline);
  if (mutatedWorktreeBaseline.facts?.length) {
    const fact026 = mutatedWorktreeBaseline.facts.find((fact) => fact.model_slug === '026' && fact.field === 'spark_plug');
    if (fact026) fact026.normalized_value = [{ manufacturer: 'BOSCH', model: 'BROKEN' }];
  }
  const immutableOverlayHash = stableHash(sanitizeForIdempotency(buildCorrectedPromotions(context.reevaluatedCandidates, context.immutableBaseline, context.database).mergedOverlay));
  const contaminatedOverlayHash = stableHash(sanitizeForIdempotency(buildCorrectedPromotions(context.reevaluatedCandidates, mutatedWorktreeBaseline, context.database).mergedOverlay));
  const actualOverlayHash = stableHash(sanitizeForIdempotency(context.correctedOverlay));
  const contaminationIgnored = actualOverlayHash === immutableOverlayHash && actualOverlayHash !== contaminatedOverlayHash;
  const mutatedOverlay = cloneJson(context.correctedOverlay);
  if (mutatedOverlay.facts?.length) mutatedOverlay.facts = mutatedOverlay.facts.filter((fact) => fact.fact_id !== context.immutableBaseline.facts[0]?.fact_id);
  const removalDetected = buildBaselineFactPreservationAudit(context.immutableBaseline, mutatedOverlay).BASELINE_FACTS_REMOVED > 0;
  const mutatedOverlayChanged = cloneJson(context.correctedOverlay);
  const mutateTarget = mutatedOverlayChanged.facts.find((fact) => fact.fact_id === context.immutableBaseline.facts[0]?.fact_id);
  if (mutateTarget) mutateTarget.source_heading = 'mutated';
  const mutationDetected = buildBaselineFactPreservationAudit(context.immutableBaseline, mutatedOverlayChanged).BASELINE_FACTS_CHANGED > 0;
  const mutatedSparkOverlay = cloneJson(context.correctedOverlay);
  const spark026 = mutatedSparkOverlay.facts.find((fact) => fact.model_slug === '026' && fact.field === 'spark_plug');
  if (spark026) spark026.normalized_value = [{ manufacturer: 'BOSCH', model: 'WSR 6 F' }];
  const spark026RegressionDetected = build026046RegressionAudit(context.immutableBaseline, mutatedSparkOverlay)['026_BASELINE_SPARK_PRESERVED'] === 'FAIL';
  const mutatedConflictOverlay = cloneJson(context.correctedOverlay);
  const conflictFact = mutatedConflictOverlay.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm');
  if (conflictFact?.conflicting_values?.[0]) {
    conflictFact.conflicting_values[0].source_document_id = null;
    conflictFact.conflicting_values[0].publication_id = null;
    conflictFact.conflicting_values[0].source_locator = null;
  }
  const conflictRegressionDetected = build026046RegressionAudit(context.immutableBaseline, mutatedConflictOverlay)['046_CONFLICT_SECONDARY_SOURCE_DOCUMENT_ID_PRESENT'] === 'NO';

  const rows = [
    ['IMMUTABLE_GIT_BASELINE_USED', 'pass', context.immutableBaselineAudit.IMMUTABLE_GIT_BASELINE_USED, context.immutableBaselineAudit.IMMUTABLE_GIT_BASELINE_USED === 'PASS'],
    ['WORKTREE_PUBLIC_STORE_CONTAMINATION_IGNORED', 'pass', contaminationIgnored, contaminationIgnored],
    ['BASELINE_FACT_REMOVAL_DETECTED', 'true', removalDetected, removalDetected],
    ['BASELINE_FACT_MUTATION_DETECTED', 'true', mutationDetected, mutationDetected],
    ['026_BASELINE_SPARK_REGRESSION_DETECTED', 'true', spark026RegressionDetected, spark026RegressionDetected],
    ['046_CONFLICT_PROVENANCE_REGRESSION_DETECTED', 'true', conflictRegressionDetected, conflictRegressionDetected],
    ['DERIVATIVE_SOURCE_BLOCKED', 'blocked', derivative.blocking_reasons, derivative.blocking_reasons.includes('DERIVATIVE_SOURCE_NOT_TECHNICAL_EVIDENCE')],
    ['MISSING_AUTHENTICITY_BLOCKED', 'blocked', missingAuthenticity.blocking_reasons, missingAuthenticity.blocking_reasons.includes('AUTHENTICITY_NOT_SUFFICIENT')],
    ['MISSING_LINEAGE_BLOCKED', 'blocked', missingLineage.blocking_reasons, missingLineage.blocking_reasons.includes('SOURCE_LINEAGE_MISSING')],
    ['FALSE_SCS_INDEPENDENCE_BLOCKED', 'blocked', falseIndependent.blocking_reasons, falseIndependent.blocking_reasons.includes('SCS_LINEAGE_INDEPENDENCE_MISMATCH')],
    ['MISSING_HEADING_BLOCKED', 'blocked', missingHeading.blocking_reasons, missingHeading.blocking_reasons.includes('SOURCE_HEADING_MISSING')],
    ['MISSING_LOCATOR_BLOCKED', 'blocked', missingLocator.blocking_reasons, missingLocator.blocking_reasons.includes('SOURCE_PAYLOAD_OR_LOCATOR_MISSING')],
    ['PLACEHOLDER_SOURCE_BLOCKED', 'blocked', placeholder.blocking_reasons, placeholder.blocking_reasons.includes('NO_TECHNICAL_DATA_IN_SOURCE')],
    ['WRONG_SCOPE_BLOCKED', 'blocked', wrongScope.blocking_reasons, wrongScope.blocking_reasons.includes('MODEL_NOT_IN_EXPLICIT_SOURCE_SCOPE') || wrongScope.blocking_reasons.includes('PROMOTION_SCOPE_REVALIDATION_FAILED')],
    ['VARIANT_SCOPE_BLEED_BLOCKED', 'blocked', variantBleed, variantBleed],
    ['ELECTRODE_GAP_CONFLICT_BLOCKED', 'blocked', gapConflictCandidate.blocking_reasons, gapConflictCandidate.blocking_reasons.includes('OFFICIAL_CONFLICT_UNRESOLVED') && baselineEquivalentGap != null],
    ['UNKNOWN_MEASUREMENT_BLOCKED', 'blocked', unknownWeight.blocking_reasons, unknownWeight.blocking_reasons.includes('MEASUREMENT_DEFINITION_UNKNOWN')],
    ['NULL_NORMALIZED_VALUE_BLOCKED', 'blocked', nullValue.blocking_reasons, nullValue.blocking_reasons.includes('NULL_NORMALIZED_VALUE')],
    ['DUPLICATE_FACT_BLOCKED', 'single promotion', duplicateMutation.corrected.length, duplicateMutation.corrected.length === 1 && duplicateMutation.blocked.some((fact) => (fact.corrected_blocking_reasons || []).includes('DUPLICATE_SOURCE_FACT'))],
    ['NUMERIC_046_COLLISION_BLOCKED', 'no unsafe specs', Object.keys(numeric046.technicalSpecs || {}).length, Object.keys(numeric046.technicalSpecs || {}).length === 0],
    ['NUMERIC_015_COLLISION_BLOCKED', 'no unsafe specs', Object.keys(numeric015.technicalSpecs || {}).length, Object.keys(numeric015.technicalSpecs || {}).length === 0],
    ['SPARK_CARDINALITY_AMBIGUITY_BLOCKED', 'ambiguous blocked', sparkAmbiguous.semantic_status, sparkAmbiguous.semantic_status === 'AMBIGUOUS'],
    ['SPARK_CHAIN_CONTAMINATION_BLOCKED', 'invalid', sparkContaminated.blocking_reasons, sparkContaminated.blocking_reasons.includes('SPARK_CHAIN_CONTAMINATION')],
    ['SPARK_PARSER_SPLIT_PRESERVED', 'two manufacturers split', sparkCombined.normalized_value, sparkCombined.semantic_status === 'VALID' && sparkCombined.normalized_value?.length === 2],
    ['ELECTRODE_GAP_AS_SPARK_BLOCKED', 'electrode gap remapped', gapAsSpark.corrected_field, gapAsSpark.corrected_field === 'electrode_gap_mm'],
    ['MS170_009_BLOCKED', 'blocked', ms170Blocked, ms170Blocked],
    ['MS180_009_BLOCKED', 'blocked', ms180Blocked, ms180Blocked],
    ['046_CONFLICT_WINNER_BLOCKED', 'existing conflict remains', conflict046?.public_evidence_status, conflict046?.public_evidence_status === 'OFFICIAL_CONFLICTED'],
    ['MISSING_INDEPENDENCE_BLOCKED', 'blocked', missingIndependence.blocking_reasons, missingIndependence.blocking_reasons.includes('INDEPENDENCE_STATUS_MISSING')]
  ];

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: rows.map(([name, expected, actual, pass]) => ({
      check: name,
      mutation: name,
      expected,
      actual,
      pass: Boolean(pass)
    })),
    FAILURE_INJECTION: rows.every(([, , , pass]) => pass) ? 'PASS' : 'FAIL'
  };
}

function buildFinalReport(context) {
  const coverage = summarizeCoverage(context.immutableBaseline, context.correctedOverlay, context.correctedFacts, context.redundantFacts, context.blockedFacts);
  const correctedNewFacts = context.correctedFacts.length;
  const duplicatePromotions = correctedNewFacts - new Set(context.correctedFacts.map((fact) => stableHash([fact.model_slug, fact.field, normalizeValueForEquality(fact.field, fact.normalized_value), fact.source_locator, fact.model_scope]))).size;
  const promotionsWithoutHeading = context.correctedFacts.filter((fact) => !fact.source_heading).length;
  const promotionsWithoutLocator = context.correctedFacts.filter((fact) => !fact.source_locator).length;
  const scopeMismatch = context.correctedFacts.filter((fact) => !(fact.scope_evidence || []).some((heading) => parseExplicitScopeModels(heading).includes(normalizePublicEvidenceModelKey(fact.model_slug)))).length;
  const unknownMeasurement = context.correctedFacts.filter((fact) => !fact.measurement_definition || fact.measurement_definition === 'UNKNOWN_WEIGHT_DEFINITION').length;
  const derivativePromotions = context.lineagePreservationAudit.DERIVATIVE_SOURCE_PROMOTIONS;
  const falseIndependencePromotions = context.lineagePreservationAudit.SCS_FALSE_INDEPENDENCE_PROMOTIONS;
  const variantPromotions = context.correctedFacts.filter((fact) => /020t_body|ms200t_body|ms360c_body/i.test(fact.source_locator || '')).length;
  const authenticityDefaultPromotions = context.correctedFacts.filter((fact) => fact.authenticity_status == null).length;
  const windowsPathCount = context.correctedOverlay.facts.filter((fact) => hasWindowsPath(fact)).length;
  const dossierAsTechnicalSource = context.lineagePreservationAudit.DOSSIER_AS_DIRECT_TECHNICAL_SOURCE;
  const finalTransitionAccountingPass = context.finalTransitionAccounting.FINAL_TRANSITION_ACCOUNTING === 'PASS'
    && context.finalTransitionAccounting.INPUT_INVARIANT === 'PASS'
    && context.finalTransitionAccounting.SAFE_NEW_SCS_FACTS_MATCHES_PROMOTED_NEW === 'PASS';
  const baselineFactPreservationPass = context.baselinePreservationAudit.BASELINE_FACTS_PRESERVED === coverage.BASELINE_PUBLIC_FACTS
    && context.baselinePreservationAudit.BASELINE_FACTS_REMOVED === 0
    && context.baselinePreservationAudit.BASELINE_FACTS_CHANGED === 0
    && context.baselinePreservationAudit.BASELINE_FACTS_REPLACED === 0;
  const strokeConflictGatePass = context.regression026046Audit['046_STROKE_CONFLICT_PRESERVED'] === 'PASS'
    && context.regression026046Audit['046_CONFLICT_SECONDARY_PROVENANCE_COMPLETE'] === 'PASS'
    && context.regression026046Audit['046_STROKE_STATUS'] === 'OFFICIAL_CONFLICTED'
    && context.regression026046Audit['046_STROKE_SINGLE_VALUE_ELIGIBLE'] === false;
  const lineageGatePass = derivativePromotions === 0
    && dossierAsTechnicalSource === 0
    && falseIndependencePromotions === 0
    && context.lineagePreservationAudit.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE === 0
    && context.lineagePreservationAudit.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS === 0;

  const testSuite = context.preflight.PRECHECK === 'PASS'
    && context.immutableBaselineAudit.IMMUTABLE_GIT_BASELINE_USED === 'PASS'
    && finalTransitionAccountingPass
    && baselineFactPreservationPass
    && strokeConflictGatePass
    && lineageGatePass
    && context.regression026046Audit['026_BASELINE_SPARK_PRESERVED'] === 'PASS'
    && context.regression026046Audit['046_BASELINE_SPARK_PRESERVED'] === 'PASS'
    && context.failureInjection.FAILURE_INJECTION === 'PASS'
    && context.structuredDataAudit.SCHEMA_MODEL_BINDING === 'PASS'
    && context.promotionSample.SAMPLE_REQUIREMENTS_PASS === 'PASS'
    && context.variantScopeAudit.MS360_VARIANT_SCOPE_RESULT === 'BLOCKED'
    && context.variantScopeAudit.SCOPE_020_020T_RESULT === 'BLOCKED'
    && context.variantScopeAudit.SCOPE_MS200_MS200T_RESULT === 'BLOCKED'
    && context.decoderRegression.FUZZY_MODEL_SPEC_ATTACHMENTS === 0
    && context.decoderRegression.PROBABLE_SERIAL_SPEC_ATTACHMENTS === 0
    && context.decoderRegression.PART_NUMBER_MODEL_SPEC_ATTACHMENTS === 0
    && context.decoderRegression.NUMERIC_TOKEN_MODEL_COLLISIONS === 0
    && context.sparkAudit.SPARK_COMBINED_MANUFACTURER_VALUE_LEAKS === 0
    && authenticityDefaultPromotions === 0
    && duplicatePromotions === 0
    && context.buildCorrectedPromotionsMeta.factIdCollisions === 0
    && windowsPathCount === 0
    ? 'PASS'
    : 'FAIL';

  return {
    'FASE 35C.4.3.1.1 FINAL REPORT': true,
    HOTFIX_BASELINE_COMMIT,
    IMMUTABLE_PUBLIC_BASELINE_COMMIT: HOTFIX_BASELINE_COMMIT,
    BASELINE_PUBLIC_STORE_RAW_SHA256: context.immutableBaselineAudit.BASELINE_PUBLIC_STORE_RAW_SHA256,
    BASELINE_PUBLIC_STORE_CANONICAL_SHA256: context.immutableBaselineAudit.BASELINE_PUBLIC_STORE_CANONICAL_SHA256,
    WORKTREE_PUBLIC_STORE_DIRTY: context.preflight.WORKTREE_PUBLIC_STORE_DIRTY,
    IMMUTABLE_GIT_BASELINE_USED: context.immutableBaselineAudit.IMMUTABLE_GIT_BASELINE_USED,
    PRECHECK: context.preflight.PRECHECK,
    FINAL_TRANSITION_ACCOUNTING: finalTransitionAccountingPass ? 'PASS' : 'FAIL',
    BASELINE_FACT_PRESERVATION: baselineFactPreservationPass ? 'PASS' : 'FAIL',
    '046_CONFLICT_GATE': strokeConflictGatePass ? 'PASS' : 'FAIL',
    LINEAGE_GATE: lineageGatePass ? 'PASS' : 'FAIL',
    METRIC_CLASSIFICATION: context.finalTransitionAccounting.METRIC_CLASSIFICATION,
    INPUT_CANDIDATES: context.finalTransitionAccounting.INPUT_CANDIDATES,
    PROMOTED_NEW: context.finalTransitionAccounting.PROMOTED_NEW,
    TOTAL_BLOCKED_OR_REDUNDANT: context.finalTransitionAccounting.TOTAL_BLOCKED_OR_REDUNDANT,
    REDUNDANT_WITH_BASELINE: context.finalTransitionAccounting.REDUNDANT_WITH_BASELINE,
    BLOCKED_BY_BASELINE_CONFLICT: context.finalTransitionAccounting.BLOCKED_BY_BASELINE_CONFLICT,
    BASELINE_PUBLIC_FACTS: coverage.BASELINE_PUBLIC_FACTS,
    BASELINE_FACTS_PRESERVED: context.baselinePreservationAudit.BASELINE_FACTS_PRESERVED,
    BASELINE_FACTS_REMOVED: context.baselinePreservationAudit.BASELINE_FACTS_REMOVED,
    BASELINE_FACTS_CHANGED: context.baselinePreservationAudit.BASELINE_FACTS_CHANGED,
    BASELINE_FACTS_REPLACED: context.baselinePreservationAudit.BASELINE_FACTS_REPLACED,
    '026_BASELINE_SPARK_PRESERVED': context.regression026046Audit['026_BASELINE_SPARK_PRESERVED'],
    '046_BASELINE_SPARK_PRESERVED': context.regression026046Audit['046_BASELINE_SPARK_PRESERVED'],
    '046_CONFLICT_PROVENANCE_PRESERVED': context.regression026046Audit['046_STROKE_CONFLICT_PRESERVED'] === 'PASS'
      && context.regression026046Audit['046_CONFLICT_SECONDARY_SOURCE_DOCUMENT_ID_PRESENT'] === 'YES'
      && context.regression026046Audit['046_CONFLICT_SECONDARY_PUBLICATION_ID_PRESENT'] === 'YES'
      && context.regression026046Audit['046_CONFLICT_SECONDARY_SOURCE_CLASS_PRESENT'] === 'YES'
      && context.regression026046Audit['046_CONFLICT_SECONDARY_LOCATOR_PRESENT'] === 'YES'
      && context.regression026046Audit['046_CONFLICT_SECONDARY_HEADING_PRESENT'] === 'YES'
      && context.regression026046Audit['046_CONFLICT_SECONDARY_MODEL_SCOPE_PRESENT'] === 'YES'
      ? 'PASS'
      : 'FAIL',
    '431_CORRECTED_CANDIDATE_FACTS': context.previousHotfixFinalReport.CORRECTED_NEW_PUBLIC_FACTS,
    SAFE_NEW_SCS_FACTS: coverage.SAFE_NEW_SCS_FACTS,
    SCS_FACTS_REDUNDANT_WITH_BASELINE: coverage.SCS_FACTS_REDUNDANT_WITH_BASELINE,
    SCS_REDUNDANT_FACTS_SKIPPED: coverage.SCS_REDUNDANT_FACTS_SKIPPED,
    SCS_FACTS_BLOCKED_BY_BASELINE_VALUE_CONFLICT: coverage.SCS_FACTS_BLOCKED_BY_BASELINE_VALUE_CONFLICT,
    TOTAL_CORRECTED_STAGED_FACTS: coverage.TOTAL_CORRECTED_STAGED_FACTS,
    BASELINE_MODELS_WITH_FACTS: coverage.BASELINE_MODELS_WITH_FACTS,
    STAGED_MODELS_WITH_FACTS: coverage.STAGED_MODELS_WITH_FACTS,
    NEW_MODELS_ADDED_BY_SCS: coverage.NEW_MODELS_ADDED_BY_SCS,
    SPARK_FACTS_REEVALUATED: context.sparkAudit.SPARK_FACTS_REEVALUATED,
    SPARK_COMBINED_MANUFACTURER_VALUE_LEAKS: context.sparkAudit.SPARK_COMBINED_MANUFACTURER_VALUE_LEAKS,
    DERIVATIVE_SOURCE_PROMOTIONS: derivativePromotions,
    DOSSIER_AS_DIRECT_TECHNICAL_SOURCE: dossierAsTechnicalSource,
    SCS_FALSE_INDEPENDENCE_PROMOTIONS: falseIndependencePromotions,
    SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE: context.lineagePreservationAudit.SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE,
    SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS: context.lineagePreservationAudit.SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS,
    AUTHENTICITY_DEFAULT_PROMOTIONS: authenticityDefaultPromotions,
    PROMOTIONS_WITHOUT_SOURCE_HEADING: promotionsWithoutHeading,
    PROMOTIONS_WITHOUT_SOURCE_LOCATOR: promotionsWithoutLocator,
    PROMOTIONS_WITH_SCOPE_MISMATCH: scopeMismatch,
    PROMOTIONS_WITH_UNKNOWN_MEASUREMENT_DEFINITION: unknownMeasurement,
    DUPLICATE_PUBLIC_FACT_PROMOTIONS: duplicatePromotions,
    FACT_ID_COLLISIONS: context.buildCorrectedPromotionsMeta.factIdCollisions,
    VARIANT_SCOPE_UNRESOLVED_PROMOTIONS: variantPromotions,
    PUBLIC_WINDOWS_PATH_COUNT: windowsPathCount,
    FS350_SCOPE_TEST: context.fs350Result,
    MS170_009_TECHNICAL_FACTS: context.ms170Count,
    MS180_009_TECHNICAL_FACTS: context.ms180Count,
    '046_STROKE_STATUS': context.regression026046Audit['046_STROKE_STATUS'],
    '046_STROKE_SINGLE_VALUE_ELIGIBLE': context.regression026046Audit['046_STROKE_SINGLE_VALUE_ELIGIBLE'],
    FUZZY_MODEL_SPEC_ATTACHMENTS: context.decoderRegression.FUZZY_MODEL_SPEC_ATTACHMENTS,
    PROBABLE_SERIAL_SPEC_ATTACHMENTS: context.decoderRegression.PROBABLE_SERIAL_SPEC_ATTACHMENTS,
    PART_NUMBER_MODEL_SPEC_ATTACHMENTS: context.decoderRegression.PART_NUMBER_MODEL_SPEC_ATTACHMENTS,
    NUMERIC_TOKEN_MODEL_COLLISIONS: context.decoderRegression.NUMERIC_TOKEN_MODEL_COLLISIONS,
    SCHEMA_MODEL_BINDING: context.structuredDataAudit.SCHEMA_MODEL_BINDING,
    STRATIFIED_SAMPLE: context.promotionSample.SAMPLE_REQUIREMENTS_PASS,
    FAILURE_INJECTION: context.failureInjection.FAILURE_INJECTION,
    IDEMPOTENCY: context.idempotency.IDEMPOTENCY,
    CANONICAL_VERIFIED_BEFORE: context.historicalCoverage.before.CANONICAL_VERIFIED,
    CANONICAL_VERIFIED_AFTER: context.historicalCoverage.before.CANONICAL_VERIFIED,
    PUBLIC_EVIDENCE_STORE_CHANGED: 'NO',
    PUBLIC_EVIDENCE_STORE_PROMOTED: 'NO',
    CANONICAL_DATABASE_CHANGED: 'NO',
    TEST_SUITE: testSuite,
    FINAL_STATUS: testSuite === 'PASS'
      && finalTransitionAccountingPass
      && baselineFactPreservationPass
      && strokeConflictGatePass
      && lineageGatePass
      && promotionsWithoutHeading === 0
      && promotionsWithoutLocator === 0
      && scopeMismatch === 0
      && unknownMeasurement === 0
      && authenticityDefaultPromotions === 0
      && duplicatePromotions === 0
      && context.buildCorrectedPromotionsMeta.factIdCollisions === 0
      && variantPromotions === 0
      && windowsPathCount === 0
      && context.baselinePreservationAudit.BASELINE_FACTS_REMOVED === 0
      && context.baselinePreservationAudit.BASELINE_FACTS_CHANGED === 0
      ? 'PASS'
      : 'PARTIAL PASS'
  };
}

function sanitizeForIdempotency(value) {
  if (Array.isArray(value)) return value.map(sanitizeForIdempotency);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'generated_at') continue;
    out[key] = sanitizeForIdempotency(nested);
  }
  return out;
}

function buildArtifacts() {
  const preflight = buildPreflight();
  const database = readJson(LIVE_INPUTS.database, {});
  const immutableBaselineRaw = readHotfixBaselineRaw(IMMUTABLE_PUBLIC_BASELINE_PATH);
  const immutableBaseline = JSON.parse(immutableBaselineRaw);
  const tsRecords = readJson(LIVE_INPUTS.tsRecords, { records: [] });
  const tsIndexes = buildTsRecordIndexes(tsRecords);

  if (preflight.PRECHECK !== 'PASS') {
    return {
      preflight,
      immutableBaselineAudit: {
        IMMUTABLE_GIT_BASELINE_USED: 'FAIL',
        BASELINE_PUBLIC_STORE_RAW_SHA256: null,
        BASELINE_PUBLIC_STORE_CANONICAL_SHA256: null
      },
      baselinePreservationAudit: { BASELINE_FACTS_PRESERVED: 0, BASELINE_FACTS_REMOVED: 0, BASELINE_FACTS_CHANGED: 0, BASELINE_FACTS_REPLACED: 0, records: [] },
      regression026046Audit: { '026_BASELINE_SPARK_PRESERVED': 'FAIL', '046_BASELINE_SPARK_PRESERVED': 'FAIL', '046_STROKE_CONFLICT_PRESERVED': 'FAIL' },
      lineagePreservationAudit: { DERIVATIVE_SOURCE_PROMOTIONS: 0, DOSSIER_AS_DIRECT_TECHNICAL_SOURCE: 0, SCS_FALSE_INDEPENDENCE_PROMOTIONS: 0, SCS_PROMOTIONS_WITHOUT_SOURCE_LINEAGE: 0, SCS_PROMOTIONS_WITHOUT_INDEPENDENCE_STATUS: 0, records: [] },
      conflictSafetyAudit: { SCS_FACTS_BLOCKED_BY_BASELINE_VALUE_CONFLICT: 0, SCS_FACTS_REDUNDANT_WITH_BASELINE: 0, SCS_REDUNDANT_FACTS_SKIPPED: 0, examples: [] },
      candidateTransitionAudit: { RETAINED_SAFE: 0, DROPPED_BY_4311: 0, REDUNDANT_WITH_BASELINE: 0, REJECTED_AUTHENTICITY: 0, REJECTED_LINEAGE: 0, REJECTED_CONFLICT: 0, records: [] },
      finalTransitionAccounting: { FINAL_TRANSITION_ACCOUNTING: 'FAIL', INPUT_CANDIDATES: 0, PROMOTED_NEW: 0, TOTAL_BLOCKED_OR_REDUNDANT: 0, REDUNDANT_WITH_BASELINE: 0, BLOCKED_BY_BASELINE_CONFLICT: 0, METRIC_CLASSIFICATION: 'OVERLAPPING_AUDIT_LABELS', records: [], OVERLAP_RECORDS: [] },
      indexIntegrityAudit: { ORPHAN_FACT_IDS: 0, MISSING_MODEL_INDEX_FACTS: 0, MISSING_FIELD_INDEX_FACTS: 0, DUPLICATE_INDEX_FACT_IDS: 0 },
      historicalCoverage: { before: { CANONICAL_VERIFIED: 0 } },
      historicalFinalReport: { NEW_PUBLIC_FACTS: 111 },
      previousHotfixFinalReport: { CORRECTED_NEW_PUBLIC_FACTS: 100 },
      previousHotfixStaging: { facts: [] },
      reevaluatedCandidates: [],
      correctedFacts: [],
      redundantFacts: [],
      blockedFacts: [],
      buildCorrectedPromotionsMeta: { factIdCollisions: 0 },
      correctedOverlay: { facts: [] },
      sparkAudit: { SPARK_FACTS_REEVALUATED: 0, SPARK_FACTS_VALID: 0, SPARK_FACTS_BLOCKED: 0, SPARK_COMBINED_MANUFACTURER_VALUE_LEAKS: 0, records: [] },
      promotionGateAudit: { records: [] },
      candidateReevaluation: { CANDIDATES_REEVALUATED: 0, PROMOTIONS_RETAINED: 0, PROMOTIONS_REMOVED: 0, PROMOTIONS_CHANGED: 0, records: [] },
      transitionAccounting: { PRECOMMIT_ACCOUNTING: 'FAIL', RETAINED_UNCHANGED: 0, REPLACED_OLD_FACTS: 0, REPLACEMENT_FACTS: 0, NEW_AFTER_REEVALUATION: 0, classifications: [], replacement_mappings: [] },
      removedPromotions: { records: [] },
      variantScopeAudit: { MS360_VARIANT_SCOPE_RESULT: 'FAILED', SCOPE_020_020T_RESULT: 'FAILED', SCOPE_MS200_MS200T_RESULT: 'FAILED', records: [] },
      promotionSample: { SAMPLE_REQUIREMENTS_PASS: 'FAIL', records: [] },
      blockedSample: { records: [] },
      decoderRegression: { FUZZY_MODEL_SPEC_ATTACHMENTS: 0, PROBABLE_SERIAL_SPEC_ATTACHMENTS: 0, PART_NUMBER_MODEL_SPEC_ATTACHMENTS: 0, NUMERIC_TOKEN_MODEL_COLLISIONS: 0, records: [] },
      structuredDataAudit: { SCHEMA_MODEL_BINDING: 'FAIL' },
      failureInjection: { FAILURE_INJECTION: 'FAIL', records: [] },
      idempotency: { IDEMPOTENCY: 'FAIL' },
      finalReport: { FINAL_STATUS: 'BLOCKED', TEST_SUITE: 'FAIL' },
      immutableBaseline,
      database,
      fs350Result: 'FAIL',
      ms170Count: 0,
      ms180Count: 0,
      stroke046Status: 'UNKNOWN'
    };
  }

  const historicalCandidates = readHistoricalJson(HISTORICAL_INPUTS.factCandidates).records || [];
  const historicalPromoted = readHistoricalJson(HISTORICAL_INPUTS.promotionAudit).promoted || [];
  const historicalCoverage = readHistoricalJson(HISTORICAL_INPUTS.publicCoverage);
  const historicalFinalReport = readHistoricalJson(HISTORICAL_INPUTS.finalReport);
  const previousHotfixFinalReport = readHotfixBaselineJson(HISTORICAL_INPUTS.previousHotfixFinalReport);
  const previousHotfixStaging = readHotfixBaselineJson(HISTORICAL_INPUTS.previousHotfixStaging);

  const reevaluatedCandidates = historicalCandidates.map((candidate) => reparseCandidate(candidate, tsIndexes.byId.get(candidate.underlying_source_hash)));
  const immutableBaselineAudit = buildImmutableBaselineAudit(preflight, immutableBaselineRaw, immutableBaseline);
  const { corrected, blocked, redundant, gateRecords, mergedOverlay, factIdCollisions } = buildCorrectedPromotions(reevaluatedCandidates, immutableBaseline, database);
  const baselinePreservationAudit = buildBaselineFactPreservationAudit(immutableBaseline, mergedOverlay);
  const regression026046Audit = build026046RegressionAudit(immutableBaseline, mergedOverlay);
  const lineagePreservationAudit = buildLineagePreservationAudit(corrected);
  const conflictSafetyAudit = buildConflictSafetyAudit(blocked, redundant);
  const candidateTransitionAudit = buildCandidateTransitionAudit(corrected, redundant, blocked);
  const finalTransitionAccounting = buildFinalTransitionAccounting(previousHotfixStaging.facts || [], corrected, redundant, blocked, reevaluatedCandidates);
  const indexIntegrityAudit = buildIndexIntegrityAudit(mergedOverlay);
  const sparkAudit = buildSparkAudit(reevaluatedCandidates, corrected);
  const promotionGateAudit = buildPromotionGateAudit(gateRecords);
  const candidateReevaluation = buildCandidateReevaluation(historicalPromoted, reevaluatedCandidates, corrected);
  const transitionAccounting = buildTransitionAccounting(historicalPromoted, corrected);
  const removedPromotions = buildRemovedPromotionsAudit(historicalPromoted, corrected);
  const variantScopeAudit = buildVariantScopeAudit(reevaluatedCandidates);
  const promotionSample = buildStratifiedSample(corrected);
  const blockedSample = buildBlockedSample(blocked);
  const decoderRegression = buildDecoderRegressionAudit(database, mergedOverlay);
  const structuredDataAudit = buildStructuredDataAudit(database, immutableBaseline, mergedOverlay);
  const liveFactIndex = buildLiveFactIndex(immutableBaseline);
  const failureInjection = buildFailureInjectionReport({
    reevaluatedCandidates,
    correctedFacts: corrected,
    blockedFacts: blocked,
    redundantFacts: redundant,
    liveFactIndex,
    immutableBaseline,
    immutableBaselineAudit,
    correctedOverlay: mergedOverlay,
    database
  });

  const fs350Result = reevaluatedCandidates
    .filter((candidate) => candidate.model_slug === 'fs-350' && candidate.underlying_source_path === 'doc/TS_Data/FS200_body.htm')
    .every((candidate) => candidate.source_scope === 'MULTI_MODEL_EXPLICIT' && candidate.scope_models.includes('fs-350'))
    ? 'PASS'
    : 'FAIL';
  const ms170Count = corrected.filter((fact) => fact.model_slug === 'ms-170' && /009_body/i.test(fact.source_locator || '')).length;
  const ms180Count = corrected.filter((fact) => fact.model_slug === 'ms-180' && /009_body/i.test(fact.source_locator || '')).length;
  const stroke046Status = (immutableBaseline.facts || []).find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm')?.public_evidence_status || 'UNKNOWN';

  const interim = {
    preflight,
    immutableBaselineAudit,
    baselinePreservationAudit,
    regression026046Audit,
    lineagePreservationAudit,
    conflictSafetyAudit,
    candidateTransitionAudit,
    indexIntegrityAudit,
    historicalCoverage,
    historicalFinalReport,
    previousHotfixFinalReport,
    previousHotfixStaging,
    reevaluatedCandidates,
    correctedFacts: corrected,
    redundantFacts: redundant,
    blockedFacts: blocked,
    buildCorrectedPromotionsMeta: { factIdCollisions },
    correctedOverlay: mergedOverlay,
    sparkAudit,
    promotionGateAudit,
    candidateReevaluation,
    transitionAccounting,
    finalTransitionAccounting,
    removedPromotions,
    variantScopeAudit,
    promotionSample,
    blockedSample,
    decoderRegression,
    structuredDataAudit,
    failureInjection,
    immutableBaseline,
    database,
    fs350Result,
    ms170Count,
    ms180Count,
    stroke046Status
  };

  const finalReport = buildFinalReport({
    ...interim,
    idempotency: { IDEMPOTENCY: 'PENDING' }
  });

  return {
    ...interim,
    finalReport
  };
}

function buildIdempotency(runA, runB) {
  const left = sanitizeForIdempotency({
    immutableBaselineAudit: runA.immutableBaselineAudit,
    baselinePreservationAudit: runA.baselinePreservationAudit,
    regression026046Audit: runA.regression026046Audit,
    sparkAudit: runA.sparkAudit,
    promotionGateAudit: runA.promotionGateAudit,
    lineagePreservationAudit: runA.lineagePreservationAudit,
    conflictSafetyAudit: runA.conflictSafetyAudit,
    candidateTransitionAudit: runA.candidateTransitionAudit,
    finalTransitionAccounting: runA.finalTransitionAccounting,
    indexIntegrityAudit: runA.indexIntegrityAudit,
    candidateReevaluation: runA.candidateReevaluation,
    transitionAccounting: runA.transitionAccounting,
    correctedFacts: runA.correctedFacts,
    correctedOverlay: runA.correctedOverlay,
    finalReport: runA.finalReport
  });
  const right = sanitizeForIdempotency({
    immutableBaselineAudit: runB.immutableBaselineAudit,
    baselinePreservationAudit: runB.baselinePreservationAudit,
    regression026046Audit: runB.regression026046Audit,
    sparkAudit: runB.sparkAudit,
    promotionGateAudit: runB.promotionGateAudit,
    lineagePreservationAudit: runB.lineagePreservationAudit,
    conflictSafetyAudit: runB.conflictSafetyAudit,
    candidateTransitionAudit: runB.candidateTransitionAudit,
    finalTransitionAccounting: runB.finalTransitionAccounting,
    indexIntegrityAudit: runB.indexIntegrityAudit,
    candidateReevaluation: runB.candidateReevaluation,
    transitionAccounting: runB.transitionAccounting,
    correctedFacts: runB.correctedFacts,
    correctedOverlay: runB.correctedOverlay,
    finalReport: runB.finalReport
  });
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    LEFT_HASH: stableHash(left),
    RIGHT_HASH: stableHash(right),
    IDEMPOTENCY: stableHash(left) === stableHash(right) ? 'PASS' : 'FAIL'
  };
}

export function main() {
  const runA = buildArtifacts();
  const runB = buildArtifacts();
  const idempotency = buildIdempotency(runA, runB);
  const finalReport = buildFinalReport({
    ...runA,
    idempotency
  });

  writeJson(OUTPUTS.preflight, runA.preflight);
  writeJson(OUTPUTS.immutableBaselineAudit, runA.immutableBaselineAudit);
  writeJson(OUTPUTS.baselinePreservationAudit, runA.baselinePreservationAudit);
  writeJson(OUTPUTS.regression026046Audit, runA.regression026046Audit);
  writeJson(OUTPUTS.promotionGateAudit, runA.promotionGateAudit);
  writeJson(OUTPUTS.lineagePreservationAudit, runA.lineagePreservationAudit);
  writeJson(OUTPUTS.conflictSafetyAudit, runA.conflictSafetyAudit);
  writeJson(OUTPUTS.candidateTransitionAudit, runA.candidateTransitionAudit);
  writeJson(OUTPUTS.finalTransitionAccounting, runA.finalTransitionAccounting);
  writeJson(OUTPUTS.correctedStaging, runA.correctedOverlay);
  writeJson(OUTPUTS.indexIntegrityAudit, runA.indexIntegrityAudit);
  writeJson(OUTPUTS.decoderRegression, runA.decoderRegression);
  writeJson(OUTPUTS.structuredDataAudit, runA.structuredDataAudit);
  writeJson(OUTPUTS.failureInjection, runA.failureInjection);
  writeJson(OUTPUTS.idempotency, idempotency);
  writeJson(OUTPUTS.finalReport, finalReport);

  return finalReport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = main();
  console.log('Phase 35C.4.3.1.1 immutable public baseline hotfix completed.');
  console.log(`Precheck: ${report.PRECHECK}`);
  console.log(`Final status: ${report.FINAL_STATUS}`);
}
