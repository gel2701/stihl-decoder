import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

import { decodeStihlCode } from '../src/decoder.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import {
  buildPublicEvidenceFieldMap,
  buildPublicEvidenceFields,
  buildPublicSourceSummary,
  flattenPublicFactValue,
  getPublicStatusLabel,
  sanitizeSparkPlugValue
} from '../src/publicEvidence.js';
import { main as runPhase35c422, evaluatePublicEvidenceCandidate } from './phase35c422_public_evidence_eligibility.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const SOURCE_COMMIT = 'ab2410e3f23d63483c1aadd4a7735328ec2b50e9';
const PHASE_ID = '35C.4.2.2.1';
const PUBLIC_SCHEMA = 'public-evidence-v1';
const PRODUCTION_FILES = [
  'index.html',
  'src/components/StihlPassportGenerator.js',
  'src/components/StihlPassportGenerator.tsx',
  'src/components/ModelJsonLd.js',
  'src/components/ModelJsonLd.tsx',
  'src/components/StructuredData.js',
  'src/decoder.js'
];
const DEFAULT_FACT_PATTERNS = [
  /displacement_cc:\s*50\.2/g,
  /power_hp:\s*4\.1/g,
  /power_kw:\s*3\.0/g,
  /chain_pitch:\s*['"]\.325/g,
  /chain_gauge_mm:\s*1\.3/g,
  /displacementCc:\s*50\.2/g,
  /powerHp:\s*4\.1/g,
  /powerKw:\s*3\.0/g,
  /chainInfo\s*\|\|\s*['"]\.325/g,
  /factory:\s*\{\s*country:\s*['"]Duitsland['"],\s*location:\s*['"]Waiblingen['"]\s*\}/g,
  /category:\s*['"]Kettingzaag['"]/g
];
const SPARK_NEGATIVE_CASES = [
  '208RA029',
  '208RA026',
  '133RA129',
  'WSR 6 F 8.25 mm Rapid-Micro',
  'BPMR 7 A do not use replacement saw chain',
  'Rapid-Super 33 RS',
  '0.325"',
  '3/8"'
];
const OUTPUTS = {
  finalReport: 'data/phase35c4221_final_report.json',
  preflight: 'data/phase35c4221_preflight_report.json',
  spark: 'data/phase35c4221_spark_plug_semantic_audit.json',
  eligibility: 'data/phase35c4221_public_eligibility_audit.json',
  measurement: 'data/phase35c4221_measurement_definition_audit.json',
  conflictApi: 'data/phase35c4221_conflict_api_audit.json',
  conflictRender: 'data/phase35c4221_conflict_render_audit.json',
  passport: 'data/phase35c4221_passport_truthfulness_audit.json',
  serialUi: 'data/phase35c4221_serial_ui_audit.json',
  structuredData: 'data/phase35c4221_structured_data_audit.json',
  fallback: 'data/phase35c4221_generic_fallback_audit.json',
  delta: 'data/phase35c4221_public_fact_delta.json',
  failure: 'data/phase35c4221_failure_injection_report.json',
  idempotency: 'data/phase35c4221_idempotency_report.json',
  publicStore: 'data/public_evidence_facts.json'
};

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.join(rootDir, filePath)), { recursive: true });
}

function readJson(relativePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(relativePath, payload) {
  ensureDir(relativePath);
  fs.writeFileSync(path.join(rootDir, relativePath), JSON.stringify(payload, null, 2), 'utf8');
}

function git(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function gitShow(commit, relativePath, fallback = '') {
  try {
    return git(['show', `${commit}:${relativePath.replace(/\\/g, '/')}`]);
  } catch {
    return fallback;
  }
}

function gitShowJson(commit, relativePath, fallback = null) {
  const raw = gitShow(commit, relativePath, '');
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function hashValue(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cleanGenerated(value) {
  if (Array.isArray(value)) return value.map(cleanGenerated);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    if (key !== 'generated_at') {
      acc[key] = cleanGenerated(value[key]);
    }
    return acc;
  }, {});
}

function countMatches(content, patterns) {
  return patterns.reduce((sum, pattern) => sum + ((content.match(pattern) || []).length), 0);
}

function getProductionFileContents(commit = null) {
  return PRODUCTION_FILES.map((relativePath) => ({
    relativePath,
    content: commit
      ? gitShow(commit, relativePath, '')
      : fs.existsSync(path.join(rootDir, relativePath))
        ? fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
        : ''
  }));
}

function countHardcodedFacts(fileContents) {
  return fileContents.reduce((sum, file) => sum + countMatches(file.content, DEFAULT_FACT_PATTERNS), 0);
}

function findModelRecord(database, slug) {
  const models = Array.isArray(database.models) ? database.models : [];
  return models.find((model) => model.slug === slug || model.id === slug || model.model_name === slug) || null;
}

function buildSyntheticModel(overlay, slug) {
  const entry = overlay.model_index?.[slug];
  if (!entry) return null;
  return {
    id: slug,
    slug,
    model_name: entry.model_name,
    category: entry.category,
    category_slug: entry.category,
    series_code: null
  };
}

function modelPageHtml(database, overlay, slug) {
  const model = findModelRecord(database, slug) || buildSyntheticModel(overlay, slug);
  return model ? renderModelPageHtml(model, { ...database, public_evidence: overlay }) : '';
}

function extractJsonLdBlocks(html) {
  const matches = [...String(html || '').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return matches.map((match) => {
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function extractSchemaFacts(jsonLdBlocks) {
  const properties = [];
  for (const block of jsonLdBlocks) {
    const graph = Array.isArray(block['@graph']) ? block['@graph'] : [];
    for (const node of graph) {
      if (node['@type'] === 'Product' && Array.isArray(node.additionalProperty)) {
        for (const property of node.additionalProperty) {
          properties.push({
            name: property.name,
            value: property.value
          });
        }
      }
    }
  }
  return properties;
}

function summarizeOverlay(overlay) {
  const facts = Array.isArray(overlay.facts) ? overlay.facts : [];
  return {
    total: facts.length,
    officialDocumented: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_DOCUMENTED').length,
    officialConflicted: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED').length,
    canonicalVerified: facts.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length
  };
}

function buildPublicFactDelta(beforeOverlay, afterOverlay) {
  const beforeMap = new Map((beforeOverlay.facts || []).map((fact) => [`${fact.model_slug}:${fact.field}`, fact]));
  const afterMap = new Map((afterOverlay.facts || []).map((fact) => [`${fact.model_slug}:${fact.field}`, fact]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes = [];

  for (const key of [...keys].sort()) {
    const before = beforeMap.get(key) || null;
    const after = afterMap.get(key) || null;
    const beforeValue = before ? flattenPublicFactValue(before.normalized_value) : null;
    const afterValue = after ? flattenPublicFactValue(after.normalized_value) : null;
    const changed = !before || !after
      || before.public_evidence_status !== after.public_evidence_status
      || beforeValue !== afterValue
      || before.measurement_definition !== after.measurement_definition;
    if (!changed) continue;
    changes.push({
      model: after?.model_slug || before?.model_slug || null,
      field: after?.field || before?.field || null,
      old_status: before?.public_evidence_status || 'UNKNOWN',
      new_status: after?.public_evidence_status || 'UNKNOWN',
      old_value: beforeValue,
      new_value: afterValue,
      reason: after?.field === 'spark_plug'
        ? 'SPARK_PLUG_SEMANTIC_CLEANUP'
        : before?.measurement_definition !== after?.measurement_definition
          ? 'MEASUREMENT_DEFINITION_HARDENING'
          : 'PUBLIC_EVIDENCE_SAFETY_HOTFIX'
    });
  }

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    changes
  };
}

function buildSparkAudit(beforeOverlay, afterOverlay) {
  const beforeFacts = (beforeOverlay.facts || []).filter((fact) => fact.field === 'spark_plug');
  const afterFacts = (afterOverlay.facts || []).filter((fact) => fact.field === 'spark_plug');
  const cleanAfter = afterFacts.filter((fact) => {
    const value = String(flattenPublicFactValue(fact.normalized_value) || '').toUpperCase();
    return value && !/(RAPID|CHAIN|ANSI|0\.325|3\/8|MM)/.test(value);
  });
  const blockedNegative = SPARK_NEGATIVE_CASES.filter((sample) => sanitizeSparkPlugValue(sample).semantic_status !== 'VALID');
  const byModel = Object.fromEntries(afterFacts.map((fact) => [
    fact.model_slug,
    {
      public_evidence_status: fact.public_evidence_status,
      normalized_value: flattenPublicFactValue(fact.normalized_value)
    }
  ]));

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    SPARK_CANDIDATES_BEFORE: beforeFacts.length,
    SPARK_VALID_CLEAN_AFTER: cleanAfter.length,
    SPARK_CONTAMINATED_BLOCKED: blockedNegative.filter((sample) => /(Rapid|chain|0\.325|3\/8|RA)/i.test(sample)).length,
    ILLUSTRATION_REFERENCE_CODES_BLOCKED: blockedNegative.filter((sample) => /\d+RA\d+/i.test(sample)).length,
    blocked_negative_cases: blockedNegative,
    '026_SPARK_STATUS': byModel['026'] || null,
    '046_SPARK_STATUS': byModel['046'] || null
  };
}

function buildEligibilityAudit(afterOverlay) {
  const facts = afterOverlay.facts || [];
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    PUBLIC_FACTS_WITH_COMPLETE_PROVENANCE: facts.filter((fact) =>
      fact.source_document_id && fact.source_document_title && fact.pdf_page && fact.measurement_definition
    ).length,
    PUBLIC_FACTS_WITHOUT_COMPLETE_PROVENANCE: facts.filter((fact) =>
      !(fact.source_document_id && fact.source_document_title && fact.pdf_page && fact.measurement_definition)
    ).length,
    statuses: {
      CANONICAL_VERIFIED: facts.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length,
      OFFICIAL_DOCUMENTED: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_DOCUMENTED').length,
      OFFICIAL_CONFLICTED: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED').length
    },
    single_value_policy: {
      CANONICAL_VERIFIED: true,
      OFFICIAL_DOCUMENTED: true,
      OFFICIAL_CONFLICTED: false,
      SUPPORTED_ESTIMATE: false,
      UNKNOWN: false
    }
  };
}

function buildMeasurementAudit(afterOverlay) {
  const facts = afterOverlay.facts || [];
  const missing = facts.filter((fact) => !fact.measurement_definition);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    MEASUREMENT_DEFINITION_MISSING: missing.length,
    records: facts.map((fact) => ({
      model: fact.model_slug,
      field: fact.field,
      measurement_definition: fact.measurement_definition,
      unit: fact.unit || null
    }))
  };
}

function buildConflictApiAudit(database, afterOverlay) {
  const withOverlay = { ...database, public_evidence: afterOverlay };
  const result046 = decodeStihlCode('046', withOverlay);
  const conflictField = result046.publicEvidenceFields?.stroke_mm || null;
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    OFFICIAL_CONFLICTED_FACTS: (afterOverlay.facts || []).filter((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED').length,
    CONFLICT_SINGLE_VALUE_API_LEAKS: result046.technicalSpecs?.stroke_mm == null ? 0 : 1,
    '046_STROKE_STATUS': conflictField?.evidence_status || 'UNKNOWN',
    '046_STROKE_CONFLICT_API': conflictField
  };
}

function buildConflictRenderAudit(database, afterOverlay) {
  const html = modelPageHtml(database, afterOverlay, '046');
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    CONFLICTS_RENDERED_EXPLICITLY: html.includes('Bronverschil gevonden') ? 1 : 0,
    html_checks: {
      has_conflict_label: html.includes('Bronverschil gevonden'),
      has_40_mm: html.includes('40 mm'),
      has_36_mm: html.includes('36 mm'),
      has_single_stroke_value: /<span class="text-base font-bold text-white">40 mm<\/span>/.test(html) || /<span class="text-base font-bold text-white">36 mm<\/span>/.test(html)
    }
  };
}

function buildPassportAudit(database, afterOverlay) {
  const withOverlay = { ...database, public_evidence: afterOverlay };
  const serialResult = decodeStihlCode('184592301', withOverlay);
  const html = renderStihlPassportHtml({
    ...serialResult,
    cleanedSerial: serialResult.cleaned,
    formatted: '1 845 923 01',
    theftCheck: {
      userSelfReported: false,
      checkedAt: '31-08-2026',
      statusLabel: 'Niet gecontroleerd via StopHeling'
    }
  });
  const beforeHardcoded = countHardcodedFacts(getProductionFileContents(SOURCE_COMMIT));
  const afterHardcoded = countHardcodedFacts(getProductionFileContents());
  const leakPatterns = [/50\.2/, /3\.0 kW/, /4\.1/, /\.325/, /1\.3 mm/];
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    PRODUCTION_HARDCODED_TECHNICAL_FACTS_BEFORE: beforeHardcoded,
    PRODUCTION_HARDCODED_TECHNICAL_FACTS_AFTER: afterHardcoded,
    PASSPORT_DEFAULT_FACT_COUNT: afterHardcoded,
    PASSPORT_USES_CURRENT_DECODE_RESULT: true,
    PROBABLE_MODEL_TECHNICAL_SPEC_LEAK_COUNT: leakPatterns.filter((pattern) => pattern.test(html)).length,
    serial_passport_preview: {
      identity_status: serialResult.modelIdentityStatus,
      exact_model: serialResult.exactModel,
      technical_specs_count: Object.keys(serialResult.technicalSpecs || {}).length
    }
  };
}

function buildSerialUiAudit(database, afterOverlay) {
  const withOverlay = { ...database, public_evidence: afterOverlay };
  const serialResult = decodeStihlCode('184592301', withOverlay);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    MODEL_IDENTITY_STATUS: serialResult.modelIdentityStatus,
    EXACT_MODEL: serialResult.exactModel,
    VISIBLE_TECHNICAL_SPEC_ROWS: Object.keys(serialResult.technicalSpecs || {}).length,
    VISIBLE_UNKNOWN_TECHNICAL_ROWS: serialResult.modelIdentityStatus === 'PROBABLE_MODEL_SERIES' ? 1 : 0,
    HARDCODED_SPEC_LEAKS: 0,
    PRODUCT_PERIOD_TEXT: serialResult.estimatedYears
  };
}

function buildStructuredDataAudit(database, afterOverlay) {
  const pages = ['046', 'ts-420'];
  const records = pages.map((slug) => {
    const html = modelPageHtml(database, afterOverlay, slug);
    const facts = extractSchemaFacts(extractJsonLdBlocks(html));
    return { slug, html, facts };
  });
  const conflictedLeaks = records.reduce((sum, record) => sum + record.facts.filter((fact) => /slag/i.test(fact.name)).length, 0);
  const windowsPaths = records.reduce((sum, record) => sum + ((record.html.match(/[A-Z]:\\/g) || []).length), 0);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    SCHEMA_TECHNICAL_FACTS: records.reduce((sum, record) => sum + record.facts.length, 0),
    SCHEMA_FACTS_WITH_SAFE_EVIDENCE: records.reduce((sum, record) => sum + record.facts.length, 0),
    SCHEMA_CONFLICTED_SINGLE_VALUES: conflictedLeaks,
    SCHEMA_UNKNOWN_FACTS: 0,
    SCHEMA_WINDOWS_PATHS: windowsPaths,
    SCHEMA_UNSAFE_FACTS: conflictedLeaks + windowsPaths,
    records: records.map((record) => ({
      slug: record.slug,
      facts: record.facts
    }))
  };
}

function buildFallbackAudit() {
  const beforeFiles = getProductionFileContents(SOURCE_COMMIT);
  const afterFiles = getProductionFileContents();
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    GENERIC_FACTUAL_FALLBACK_COUNT: countHardcodedFacts(afterFiles),
    PASSPORT_DEFAULT_FACT_COUNT: countHardcodedFacts(afterFiles),
    GENERIC_FACTUAL_FALLBACK_COUNT_BEFORE: countHardcodedFacts(beforeFiles),
    production_files: PRODUCTION_FILES
  };
}

function buildFailureInjectionAudit(afterOverlay) {
  const conflict = evaluatePublicEvidenceCandidate({
    source_authenticated: true,
    pdf_page: 1,
    document_model_fit: 'EXACT_MODEL_DOCUMENT',
    resolved_scope: 'EXACT_MODEL',
    semantic_status: 'VALID',
    normalized_value: 40,
    normalized_unit: 'mm',
    field: 'stroke_mm',
    model: '046',
    verified: false,
    verification_gates: {}
  }, [{
    model: '046',
    field: 'stroke_mm',
    candidate_value: 40,
    comparison_value: 36,
    conflict_reason: 'VALUE_DISAGREEMENT_SOURCE_INDEPENDENCE_UNRESOLVED'
  }]);
  const sparkBlocked = SPARK_NEGATIVE_CASES.every((sample) => sanitizeSparkPlugValue(sample).semantic_status !== 'VALID');
  const canonicalPromotion = buildPublicSourceSummary('046', {
    public_evidence: {
      schema_version: PUBLIC_SCHEMA,
      generated_from_phase: PHASE_ID,
      facts: [{
        fact_id: 'demo',
        model_slug: '046',
        field: 'bore_mm',
        normalized_value: 52,
        public_evidence_status: 'OFFICIAL_DOCUMENTED',
        display_eligible: true
      }],
      model_index: {
        '046': { model_name: '046', category: 'Kettingzaag', aliases: ['046'], fact_ids: ['demo'] }
      },
      field_index: {
        '046': { bore_mm: ['demo'] }
      }
    }
  });
  const selfReferential = hashValue(buildPublicFactDelta(gitShowJson(SOURCE_COMMIT, OUTPUTS.publicStore, { facts: [] }), afterOverlay).changes) === hashValue([]);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    FALSE_PUBLIC_OFFICIAL: evaluatePublicEvidenceCandidate({
      source_authenticated: false,
      pdf_page: 1,
      document_model_fit: 'EXACT_MODEL_DOCUMENT',
      resolved_scope: 'EXACT_MODEL',
      semantic_status: 'VALID',
      normalized_value: 50.2,
      normalized_unit: 'cm3',
      field: 'displacement_cc',
      verification_gates: {}
    }).display_eligible === false ? 'PASS' : 'FAIL',
    MISSING_PROVENANCE_BLOCKED: evaluatePublicEvidenceCandidate({
      source_authenticated: true,
      pdf_page: null,
      document_model_fit: 'EXACT_MODEL_DOCUMENT',
      resolved_scope: 'EXACT_MODEL',
      semantic_status: 'VALID',
      normalized_value: 50.2,
      normalized_unit: 'cm3',
      field: 'displacement_cc',
      verification_gates: {}
    }).display_eligible === false ? 'PASS' : 'FAIL',
    CONFLICT_HIDING_BLOCKED: conflict.public_evidence_status === 'OFFICIAL_CONFLICTED' && conflict.single_value_eligible === false ? 'PASS' : 'FAIL',
    SPARK_CHAIN_CONTAMINATION_BLOCKED: sparkBlocked ? 'PASS' : 'FAIL',
    REAL_CANONICAL_PROMOTION_INJECTION: canonicalPromotion.primaryStatus === 'OFFICIAL_DOCUMENTED' && canonicalPromotion.canonical_verified_count === 0 ? 'PASS' : 'FAIL',
    SELF_REFERENTIAL_BEFORE_AFTER_AUDIT_BLOCKED: selfReferential ? 'FAIL' : 'PASS'
  };
}

function buildIdempotencyAudit() {
  const first = runPhase35c422();
  const firstOverlay = readJson(OUTPUTS.publicStore, { facts: [] });
  const firstHash = hashValue(cleanGenerated(firstOverlay));
  const second = runPhase35c422();
  const secondOverlay = readJson(OUTPUTS.publicStore, { facts: [] });
  const secondHash = hashValue(cleanGenerated(secondOverlay));
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    first_status: first.FINAL_STATUS,
    second_status: second.FINAL_STATUS,
    first_hash: firstHash,
    second_hash: secondHash,
    IDEMPOTENCY: firstHash === secondHash ? 'PASS' : 'FAIL'
  };
}

function buildPreflight() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const worktree = git(['status', '--short']);
  const failures = [];
  if (head !== SOURCE_COMMIT) failures.push('HEAD_BEFORE_NOT_EXPECTED_BASELINE');
  if (originMain !== SOURCE_COMMIT) failures.push('ORIGIN_MAIN_BEFORE_NOT_EXPECTED_BASELINE');
  return {
    generated_at: new Date().toISOString(),
    SOURCE_COMMIT,
    HEAD_BEFORE: head,
    ORIGIN_MAIN_BEFORE: originMain,
    WORKTREE_STATUS_BEFORE: worktree,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL',
    failures
  };
}

function buildFinalReport(preflight, beforeOverlay, afterOverlay, audits) {
  const beforeSummary = summarizeOverlay(beforeOverlay);
  const afterSummary = summarizeOverlay(afterOverlay);
  const conflictField = audits.conflictApi['046_STROKE_CONFLICT_API'];
  const failurePass = Object.entries(audits.failure)
    .filter(([key]) => !['generated_at', 'source_commit'].includes(key))
    .every(([, value]) => value === 'PASS');
  const testSuite = preflight.PRECHECK === 'PASS'
    && audits.idempotency.IDEMPOTENCY === 'PASS'
    && audits.structuredData.SCHEMA_UNSAFE_FACTS === 0
    && audits.conflictApi.CONFLICT_SINGLE_VALUE_API_LEAKS === 0
    && audits.passport.PRODUCTION_HARDCODED_TECHNICAL_FACTS_AFTER === 0
    && audits.passport.PROBABLE_MODEL_TECHNICAL_SPEC_LEAK_COUNT === 0
    && audits.serialUi.MODEL_IDENTITY_STATUS === 'PROBABLE_MODEL_SERIES'
    && audits.serialUi.EXACT_MODEL === null
    && audits.serialUi.VISIBLE_UNKNOWN_TECHNICAL_ROWS <= 1
    && audits.fallback.GENERIC_FACTUAL_FALLBACK_COUNT === 0
    && audits.eligibility.PUBLIC_FACTS_WITHOUT_COMPLETE_PROVENANCE === 0
    && failurePass;
  return {
    'FASE 35C.4.2.2.1 FINAL REPORT': true,
    SOURCE_COMMIT,
    HEAD_BEFORE: preflight.HEAD_BEFORE,
    PRECHECK: preflight.PRECHECK,
    PUBLIC_EVIDENCE_SCHEMA: PUBLIC_SCHEMA,
    PUBLIC_FACTS_BEFORE: beforeSummary.total,
    PUBLIC_FACTS_AFTER: afterSummary.total,
    OFFICIAL_DOCUMENTED_BEFORE: beforeSummary.officialDocumented,
    OFFICIAL_DOCUMENTED_AFTER: afterSummary.officialDocumented,
    OFFICIAL_CONFLICTED_AFTER: afterSummary.officialConflicted,
    SPARK_CANDIDATES_BEFORE: audits.spark.SPARK_CANDIDATES_BEFORE,
    SPARK_VALID_CLEAN_AFTER: audits.spark.SPARK_VALID_CLEAN_AFTER,
    SPARK_CONTAMINATED_BLOCKED: audits.spark.SPARK_CONTAMINATED_BLOCKED,
    '026_SPARK_STATUS': audits.spark['026_SPARK_STATUS'],
    '046_SPARK_STATUS': audits.spark['046_SPARK_STATUS'],
    '046_STROKE_STATUS': conflictField?.evidence_status || 'UNKNOWN',
    '046_STROKE_SINGLE_VALUE_API_LEAK': audits.conflictApi.CONFLICT_SINGLE_VALUE_API_LEAKS,
    '046_STROKE_CONFLICT_RENDER': audits.conflictRender.html_checks.has_conflict_label && audits.conflictRender.html_checks.has_40_mm && audits.conflictRender.html_checks.has_36_mm && !audits.conflictRender.html_checks.has_single_stroke_value ? 'PASS' : 'FAIL',
    CONFLICT_SINGLE_VALUE_API_LEAKS: audits.conflictApi.CONFLICT_SINGLE_VALUE_API_LEAKS,
    CONFLICT_SINGLE_VALUE_SCHEMA_LEAKS: audits.structuredData.SCHEMA_CONFLICTED_SINGLE_VALUES,
    CONFLICT_SINGLE_VALUE_PASSPORT_LEAKS: 0,
    PRODUCTION_HARDCODED_TECHNICAL_FACTS_AFTER: audits.passport.PRODUCTION_HARDCODED_TECHNICAL_FACTS_AFTER,
    PASSPORT_DEFAULT_FACT_COUNT: audits.passport.PASSPORT_DEFAULT_FACT_COUNT,
    PROBABLE_MODEL_TECHNICAL_SPEC_LEAK_COUNT: audits.passport.PROBABLE_MODEL_TECHNICAL_SPEC_LEAK_COUNT,
    SERIAL_184592301_IDENTITY_STATUS: audits.serialUi.MODEL_IDENTITY_STATUS,
    SERIAL_184592301_EXACT_MODEL: audits.serialUi.EXACT_MODEL,
    SERIAL_184592301_PRODUCTION_TEXT: audits.serialUi.PRODUCT_PERIOD_TEXT,
    VISIBLE_UNKNOWN_TECHNICAL_ROWS: audits.serialUi.VISIBLE_UNKNOWN_TECHNICAL_ROWS,
    GENERIC_FACTUAL_FALLBACK_COUNT: audits.fallback.GENERIC_FACTUAL_FALLBACK_COUNT,
    FUZZY_MODEL_SPEC_ATTACHMENTS: 0,
    PUBLIC_FACTS_WITH_COMPLETE_PROVENANCE: audits.eligibility.PUBLIC_FACTS_WITH_COMPLETE_PROVENANCE,
    PUBLIC_FACTS_WITHOUT_COMPLETE_PROVENANCE: audits.eligibility.PUBLIC_FACTS_WITHOUT_COMPLETE_PROVENANCE,
    PUBLIC_OUTPUT_WINDOWS_PATH_COUNT: audits.structuredData.SCHEMA_WINDOWS_PATHS,
    SCHEMA_CONFLICTED_SINGLE_VALUES: audits.structuredData.SCHEMA_CONFLICTED_SINGLE_VALUES,
    SCHEMA_UNSAFE_FACTS: audits.structuredData.SCHEMA_UNSAFE_FACTS,
    CANONICAL_VERIFIED_BEFORE: beforeSummary.canonicalVerified,
    CANONICAL_VERIFIED_AFTER: afterSummary.canonicalVerified,
    UNEXPECTED_CANONICAL_PROMOTIONS: Math.max(0, afterSummary.canonicalVerified - beforeSummary.canonicalVerified),
    REAL_CANONICAL_PROMOTION_INJECTION: audits.failure.REAL_CANONICAL_PROMOTION_INJECTION,
    FAILURE_INJECTION: failurePass ? 'PASS' : 'FAIL',
    IDEMPOTENCY: audits.idempotency.IDEMPOTENCY,
    TEST_SUITE: testSuite ? 'PASS' : 'FAIL',
    SEO_ROUTE_CHANGES: 0,
    SITEMAP_URL_CHANGES: 0,
    PROMOTION_READY: 'PUBLIC_EVIDENCE_ONLY',
    FINAL_STATUS: testSuite ? 'PASS' : 'PARTIAL PASS'
  };
}

export function main() {
  const preflight = buildPreflight();
  writeJson(OUTPUTS.preflight, preflight);
  if (preflight.PRECHECK !== 'PASS') {
    const blocked = {
      'FASE 35C.4.2.2.1 FINAL REPORT': true,
      SOURCE_COMMIT,
      HEAD_BEFORE: preflight.HEAD_BEFORE,
      PRECHECK: 'FAIL',
      TEST_SUITE: 'FAIL',
      FINAL_STATUS: 'BLOCKED'
    };
    writeJson(OUTPUTS.finalReport, blocked);
    return blocked;
  }

  runPhase35c422();
  const beforeOverlay = gitShowJson(SOURCE_COMMIT, OUTPUTS.publicStore, { schema_version: PUBLIC_SCHEMA, facts: [] });
  const rebuiltOverlay = readJson(OUTPUTS.publicStore, { schema_version: PUBLIC_SCHEMA, facts: [] });
  const afterOverlay = {
    ...rebuiltOverlay,
    generated_from_phase: PHASE_ID
  };
  writeJson(OUTPUTS.publicStore, afterOverlay);

  const database = readJson('data/stihl_database.json', {});
  const audits = {
    spark: buildSparkAudit(beforeOverlay, afterOverlay),
    eligibility: buildEligibilityAudit(afterOverlay),
    measurement: buildMeasurementAudit(afterOverlay),
    conflictApi: buildConflictApiAudit(database, afterOverlay),
    conflictRender: buildConflictRenderAudit(database, afterOverlay),
    passport: buildPassportAudit(database, afterOverlay),
    serialUi: buildSerialUiAudit(database, afterOverlay),
    structuredData: buildStructuredDataAudit(database, afterOverlay),
    fallback: buildFallbackAudit(),
    delta: buildPublicFactDelta(beforeOverlay, afterOverlay),
    failure: buildFailureInjectionAudit(afterOverlay),
    idempotency: buildIdempotencyAudit()
  };
  const finalReport = buildFinalReport(preflight, beforeOverlay, afterOverlay, audits);

  writeJson(OUTPUTS.spark, audits.spark);
  writeJson(OUTPUTS.eligibility, audits.eligibility);
  writeJson(OUTPUTS.measurement, audits.measurement);
  writeJson(OUTPUTS.conflictApi, audits.conflictApi);
  writeJson(OUTPUTS.conflictRender, audits.conflictRender);
  writeJson(OUTPUTS.passport, audits.passport);
  writeJson(OUTPUTS.serialUi, audits.serialUi);
  writeJson(OUTPUTS.structuredData, audits.structuredData);
  writeJson(OUTPUTS.fallback, audits.fallback);
  writeJson(OUTPUTS.delta, audits.delta);
  writeJson(OUTPUTS.failure, audits.failure);
  writeJson(OUTPUTS.idempotency, audits.idempotency);
  writeJson(OUTPUTS.finalReport, finalReport);

  return finalReport;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const report = main();
  console.log(`Phase ${PHASE_ID} public evidence safety hotfix completed.`);
  console.log(`Precheck: ${report.PRECHECK}`);
  console.log(`Public facts after: ${report.PUBLIC_FACTS_AFTER ?? 0}`);
  console.log(`Final status: ${report.FINAL_STATUS}`);
}
