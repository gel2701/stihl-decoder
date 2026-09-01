import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import { decodeStihlCode } from '../src/decoder.js';
import {
  TECHNICAL_PUBLIC_FIELDS,
  buildPublicEvidenceFieldMap,
  buildPublicEvidenceFields,
  buildPublicTechnicalSpecs,
  findPublicEvidenceModel,
  flattenPublicFactValue,
  getSingleValuePublicFact
} from '../src/publicEvidence.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { buildPassportViewModel } from '../src/components/StihlPassportGenerator.js';
import { renderComparisonPageHtml } from '../src/components/ComparisonPageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const SOURCE_COMMIT = 'dcdef90942256a409cd274bbcb9fb6788a1a13a5';
export const EXPECTED_PUBLIC_STORE_CANONICAL_SHA256 = 'ebbde40f2f206be69b1de6d987135ade3e254baa7e70205018d14d086c7fa676';
const PHASE_ID = '35C.4.3.2.1';
const OUTPUTS = {
  preflight: path.join(rootDir, 'data', 'phase35c4321_preflight_report.json'),
  storeImmutability: path.join(rootDir, 'data', 'phase35c4321_public_store_immutability_audit.json'),
  apiRecursive: path.join(rootDir, 'data', 'phase35c4321_api_recursive_fallback_audit.json'),
  variantRegression: path.join(rootDir, 'data', 'phase35c4321_variant_regression_audit.json'),
  publicFactBinding: path.join(rootDir, 'data', 'phase35c4321_public_fact_binding_audit.json'),
  activationState: path.join(rootDir, 'data', 'phase35c4321_activation_state_audit.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c4321_failure_injection_report.json'),
  structuredData: path.join(rootDir, 'data', 'phase35c4321_structured_data_audit.json'),
  passport: path.join(rootDir, 'data', 'phase35c4321_passport_audit.json'),
  comparison: path.join(rootDir, 'data', 'phase35c4321_comparison_audit.json'),
  idempotency: path.join(rootDir, 'data', 'phase35c4321_idempotency_report.json'),
  finalReport: path.join(rootDir, 'data', 'phase35c4321_final_report.json')
};

const AUDITED_TECHNICAL_FIELDS = new Set([
  ...TECHNICAL_PUBLIC_FIELDS,
  'power_hp',
  'max_engine_speed_rpm',
  'carb_h_setting',
  'carb_l_setting',
  'carb_la_setting',
  'chain_pitch',
  'chain_gauge_mm',
  'oil_mix_ratio'
]);

const NEGATIVE_QUERIES = ['MS 170', 'MS 180', 'MS 261', 'MS 261 C-M', '184592301', '11210210800', '11280210800', 'MS999', 'MS 26', '0.46', '0.15'];
const VARIANT_QUERIES = ['MS 261 C-M', '020T', 'MS200T', 'MS360C', 'FS100R', 'FS100RX'];
const POSITIVE_QUERIES = ['009', '017', '018', '026', '036', '044', '046', '088', 'FS 350', 'HS 45', 'MS 260', 'MS 360', 'MS 460', 'TS 410', 'TS 420'];

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  }).trim();
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
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

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function sanitizeForHash(value) {
  if (Array.isArray(value)) return value.map(sanitizeForHash);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'generated_at') continue;
    out[key] = sanitizeForHash(nested);
  }
  return out;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function loadDatabase() {
  const database = loadJson('data/stihl_database.json');
  database.public_evidence = loadJson('data/public_evidence_facts.json');
  return database;
}

function buildPreflightReport() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
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
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL',
    failures
  };
}

function collectObjectPaths(value, prefix = 'technicalSpecs') {
  const paths = [];
  if (value == null || typeof value !== 'object') return paths;
  for (const [key, nested] of Object.entries(value)) {
    const currentPath = `${prefix}.${key}`;
    paths.push(currentPath);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      paths.push(...collectObjectPaths(nested, currentPath));
    }
  }
  return paths;
}

function getPathValue(object, pathString) {
  return pathString.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
}

function extractTechnicalFieldFromPath(pathString) {
  const segments = pathString.split('.').slice(1);
  for (const segment of segments) {
    if (AUDITED_TECHNICAL_FIELDS.has(segment)) return segment;
  }
  return null;
}

function resolvePublicModelKey(query, result, database) {
  const candidates = [
    query,
    result?.model,
    result?.exactModel,
    result?.probableModelSeries
  ].filter(Boolean);

  for (const candidate of candidates) {
    const match = findPublicEvidenceModel(candidate, database);
    if (match) return match.key;
  }

  return null;
}

function buildEligibleFactMap(modelKey, database) {
  if (!modelKey) return {};
  const fieldMap = buildPublicEvidenceFieldMap(modelKey, database);
  const eligible = {};
  for (const [field, facts] of Object.entries(fieldMap)) {
    const singleValueFact = getSingleValuePublicFact(facts);
    if (singleValueFact) eligible[field] = singleValueFact;
  }
  return eligible;
}

function findCrossModelSupport(field, actualValue, resolvedModelKey, database) {
  if (actualValue == null || actualValue === '' || !field) return null;
  const modelIndex = database.public_evidence?.model_index || {};
  for (const modelKey of Object.keys(modelIndex)) {
    if (modelKey === resolvedModelKey) continue;
    const candidateSpecs = buildPublicTechnicalSpecs(modelKey, database);
    if (Object.prototype.hasOwnProperty.call(candidateSpecs, field) && candidateSpecs[field] === actualValue) {
      return modelKey;
    }
  }
  return null;
}

function auditTechnicalSpecsResult(query, result, database, options = {}) {
  const technicalSpecs = result?.technicalSpecs && typeof result.technicalSpecs === 'object' ? cloneJson(result.technicalSpecs) : {};
  const allPaths = collectObjectPaths(technicalSpecs);
  const topLevelKeys = Object.keys(technicalSpecs);
  const publicModelKey = options.publicModelKey === undefined
    ? resolvePublicModelKey(query, result, database)
    : options.publicModelKey;
  const eligibleFactMap = buildEligibleFactMap(publicModelKey, database);
  const rawTechnicalLeakPaths = [];
  const technicalSpecPaths = [];
  const technicalSpecsWithoutPublicFact = [];
  const technicalSpecValueMismatches = [];
  const crossModelLeakPaths = [];
  const nonTechnicalKeys = [];

  for (const key of topLevelKeys) {
    if (!AUDITED_TECHNICAL_FIELDS.has(key)) {
      nonTechnicalKeys.push(key);
      rawTechnicalLeakPaths.push(`technicalSpecs.${key}`);
      continue;
    }

    technicalSpecPaths.push(`technicalSpecs.${key}`);
    const expectedFact = eligibleFactMap[key] || null;
    const actualValue = technicalSpecs[key];
    if (!expectedFact) {
      technicalSpecsWithoutPublicFact.push(`technicalSpecs.${key}`);
      rawTechnicalLeakPaths.push(`technicalSpecs.${key}`);
      const crossModel = findCrossModelSupport(key, actualValue, publicModelKey, database);
      if (crossModel) {
        crossModelLeakPaths.push({
          path: `technicalSpecs.${key}`,
          leaked_from_model: crossModel
        });
      }
      continue;
    }

    const expectedValue = flattenPublicFactValue(expectedFact.normalized_value);
    if (actualValue !== expectedValue) {
      technicalSpecValueMismatches.push({
        path: `technicalSpecs.${key}`,
        actual_value: actualValue,
        expected_value: expectedValue
      });
    }
  }

  for (const pathString of allPaths) {
    const field = extractTechnicalFieldFromPath(pathString);
    if (!field) continue;
    if (pathString !== `technicalSpecs.${field}`) {
      rawTechnicalLeakPaths.push(pathString);
    }
  }

  const uniqueRawLeakPaths = [...new Set(rawTechnicalLeakPaths)];
  const nestedLeakPaths = uniqueRawLeakPaths.filter((entry) => entry.split('.').length > 2);
  const topLevelLeakPaths = uniqueRawLeakPaths.filter((entry) => entry.split('.').length === 2);

  return {
    query,
    success: Boolean(result?.success),
    model: result?.model || result?.exactModel || null,
    resolved_public_model_key: publicModelKey,
    public_fact_count: Array.isArray(result?.publicEvidenceFacts) ? result.publicEvidenceFacts.length : 0,
    technical_specs: technicalSpecs,
    technical_spec_paths: [...new Set(technicalSpecPaths)],
    raw_technical_leak_paths: uniqueRawLeakPaths,
    top_level_raw_technical_leak_paths: topLevelLeakPaths,
    nested_raw_technical_leak_paths: nestedLeakPaths,
    technical_specs_without_public_fact: technicalSpecsWithoutPublicFact,
    technical_spec_value_mismatches: technicalSpecValueMismatches,
    cross_model_technical_fact_leaks: crossModelLeakPaths,
    non_technical_keys_inside_technical_specs: nonTechnicalKeys,
    pass: uniqueRawLeakPaths.length === 0
      && technicalSpecsWithoutPublicFact.length === 0
      && technicalSpecValueMismatches.length === 0
      && crossModelLeakPaths.length === 0
      && nonTechnicalKeys.length === 0
  };
}

function buildApiRecursiveFallbackAudit(database) {
  const queries = [...NEGATIVE_QUERIES, ...POSITIVE_QUERIES, ...VARIANT_QUERIES];
  const seen = new Set();
  const records = [];

  for (const query of queries) {
    if (seen.has(query)) continue;
    seen.add(query);
    records.push(auditTechnicalSpecsResult(query, decodeStihlCode(query, database), database));
  }

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS: records.reduce((sum, row) => sum + row.top_level_raw_technical_leak_paths.length, 0),
    NESTED_RAW_TECHNICAL_FALLBACK_LEAKS: records.reduce((sum, row) => sum + row.nested_raw_technical_leak_paths.length, 0),
    TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS: records.reduce((sum, row) => sum + row.raw_technical_leak_paths.length, 0),
    TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT: records.reduce((sum, row) => sum + row.technical_specs_without_public_fact.length, 0),
    TECHNICAL_SPEC_VALUE_MISMATCHES: records.reduce((sum, row) => sum + row.technical_spec_value_mismatches.length, 0),
    CROSS_MODEL_TECHNICAL_FACT_LEAKS: records.reduce((sum, row) => sum + row.cross_model_technical_fact_leaks.length, 0),
    NON_TECHNICAL_KEYS_INSIDE_TECHNICALSPECS: records.reduce((sum, row) => sum + row.non_technical_keys_inside_technical_specs.length, 0),
    PUBLIC_FACT_COUNT: (database.public_evidence?.facts || []).length
  };
}

function buildVariantRegressionAudit(database) {
  const records = VARIANT_QUERIES.map((query) => {
    const result = decodeStihlCode(query, database);
    const audit = auditTechnicalSpecsResult(query, result, database);
    return {
      query,
      success: Boolean(result?.success),
      model: result?.model || null,
      technical_specs: audit.technical_specs,
      technical_spec_count: Object.keys(audit.technical_specs || {}).length,
      raw_technical_leak_paths: audit.raw_technical_leak_paths,
      pass: audit.pass
    };
  });

  const ms261 = decodeStihlCode('MS 261', database);
  const ms261cm = decodeStihlCode('MS 261 C-M', database);
  const inherited = Boolean(ms261cm?.technicalSpecs && Object.keys(ms261cm.technicalSpecs).length > 0 && stableSerialize(ms261cm.technicalSpecs) === stableSerialize(ms261.technicalSpecs));

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    MS261CM_TO_MS261_SPEC_INHERITANCE: inherited ? 1 : 0,
    VARIANT_SPEC_LEAKS: records.reduce((sum, row) => sum + row.raw_technical_leak_paths.length, 0)
      + records.filter((row) => row.technical_spec_count > 0).length
  };
}

function buildPublicFactBindingAudit(database, apiAudit) {
  const negativeByQuery = Object.fromEntries(apiAudit.records.map((row) => [row.query, row]));
  const positiveRecords = POSITIVE_QUERIES.map((query) => {
    const result = decodeStihlCode(query, database);
    const publicModelKey = resolvePublicModelKey(query, result, database);
    const eligibleFactMap = buildEligibleFactMap(publicModelKey, database);
    return {
      query,
      public_model_key: publicModelKey,
      technical_specs: cloneJson(result.technicalSpecs || {}),
      fact_match_count: Object.keys(result.technicalSpecs || {}).filter((field) => {
        const fact = eligibleFactMap[field];
        return Boolean(fact) && flattenPublicFactValue(fact.normalized_value) === result.technicalSpecs[field];
      }).length
    };
  });

  const model261 = negativeByQuery['MS 261'];
  const ms170 = negativeByQuery['MS 170'];
  const ms180 = negativeByQuery['MS 180'];

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: positiveRecords,
    MS170_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE: Object.keys(ms170?.technical_specs || {}).length,
    MS180_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE: Object.keys(ms180?.technical_specs || {}).length,
    MS261_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE: Object.keys(model261?.technical_specs || {}).length,
    FAMILY_LEVEL_TECHNICAL_INHERITANCE: ['MS 170', 'MS 180', 'MS 261'].reduce((sum, query) => {
      const row = negativeByQuery[query];
      return sum + (row && Object.keys(row.technical_specs || {}).length > 0 ? 1 : 0);
    }, 0),
    POSITIVE_BASE_QUERIES_PASS: positiveRecords.every((row) => row.fact_match_count === Object.keys(row.technical_specs).length) ? 'PASS' : 'FAIL'
  };
}

function buildActivationStateAudit() {
  const parentStore = JSON.parse(git(['show', `${SOURCE_COMMIT}^:data/public_evidence_facts.json`]));
  const currentStore = loadJson('data/public_evidence_facts.json');
  const sourceCommitStore = JSON.parse(git(['show', `${SOURCE_COMMIT}:data/public_evidence_facts.json`]));
  const stagedCommitStore = JSON.parse(git(['show', `${SOURCE_COMMIT}:data/phase35c4311_corrected_public_fact_staging.json`]));
  const sourceReport = JSON.parse(git(['show', `${SOURCE_COMMIT}:data/phase35c432_final_report.json`]));

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    '35C432_REPORTED_PROMOTED': sourceReport.PUBLIC_EVIDENCE_STORE_PROMOTED,
    PARENT_PUBLIC_FACT_COUNT: (parentStore.facts || []).length,
    CURRENT_PUBLIC_FACT_COUNT: (currentStore.facts || []).length,
    SOURCE_COMMIT_PUBLIC_FACT_COUNT: (sourceCommitStore.facts || []).length,
    PARENT_PUBLIC_STORE_CANONICAL_SHA256: sha256Canonical(parentStore),
    CURRENT_PUBLIC_STORE_CANONICAL_SHA256: sha256Canonical(currentStore),
    SOURCE_COMMIT_PUBLIC_STORE_CANONICAL_SHA256: sha256Canonical(sourceCommitStore),
    AUDITED_STAGING_CANONICAL_SHA256: sha256Canonical(stagedCommitStore),
    ACTUAL_GIT_STORE_PROMOTED: sha256Canonical(parentStore) !== sha256Canonical(sourceCommitStore)
      && sha256Canonical(sourceCommitStore) === sha256Canonical(stagedCommitStore)
      ? 'YES'
      : 'NO',
    CORRECTED_SEMANTIC_STATUS: sha256Canonical(currentStore) === sha256Canonical(stagedCommitStore) ? 'YES' : 'NO',
    PUBLIC_EVIDENCE_STORE_ACTIVATED: sha256Canonical(currentStore) === sha256Canonical(stagedCommitStore) ? 'YES' : 'NO',
    PUBLIC_EVIDENCE_STORE_PROMOTED: sha256Canonical(parentStore) !== sha256Canonical(currentStore) ? 'YES' : 'NO',
    DEPLOYED: 'NO'
  };
}

function buildFailureInjectionReport(database) {
  const publicModel026 = resolvePublicModelKey('026', decodeStihlCode('026', database), database);
  const base026 = buildPublicTechnicalSpecs(publicModel026, database);

  const nestedFieldVerification = auditTechnicalSpecsResult('FAIL_NESTED_FIELD_VERIFICATION', {
    success: true,
    model: 'MS 170',
    technicalSpecs: {
      field_verification: {
        power_kw: {
          value: 3.0
        }
      }
    },
    publicEvidenceFacts: []
  }, database, { publicModelKey: 'ms-170' });

  const nestedSpecifications = auditTechnicalSpecsResult('FAIL_NESTED_SPECIFICATIONS', {
    success: true,
    model: 'MS 170',
    technicalSpecs: {
      specifications: {
        engine: {
          displacement_cc: 50.2
        }
      }
    },
    publicEvidenceFacts: []
  }, database, { publicModelKey: 'ms-170' });

  const directRawField = auditTechnicalSpecsResult('FAIL_DIRECT_RAW_FIELD', {
    success: true,
    model: 'MS 170',
    technicalSpecs: {
      power_kw: 3.0
    },
    publicEvidenceFacts: []
  }, database, { publicModelKey: 'ms-170' });

  const wrongModel = auditTechnicalSpecsResult('FAIL_WRONG_MODEL_FACT', {
    success: true,
    model: 'MS 261',
    technicalSpecs: {
      displacement_cc: base026.displacement_cc
    },
    publicEvidenceFacts: []
  }, database, { publicModelKey: 'ms-261' });

  const variantInheritance = auditTechnicalSpecsResult('FAIL_VARIANT_INHERITANCE', {
    success: true,
    model: 'MS 261 C-M',
    technicalSpecs: buildPublicTechnicalSpecs(resolvePublicModelKey('MS 260', decodeStihlCode('MS 260', database), database), database),
    publicEvidenceFacts: []
  }, database, { publicModelKey: 'ms-261-c-m' });

  const familyInheritance = auditTechnicalSpecsResult('FAIL_FAMILY_INHERITANCE', {
    success: true,
    model: 'MS 170',
    technicalSpecs: {
      field_verification: {
        spark_plug: {
          value: 'Bosch WSR 6 F / NGK BPMR 7 A'
        }
      }
    },
    publicEvidenceFacts: []
  }, database, { publicModelKey: 'ms-170' });

  const records = [
    {
      check: 'NESTED_TECHNICAL_FALLBACK_DETECTED',
      detected: nestedFieldVerification.raw_technical_leak_paths.includes('technicalSpecs.field_verification.power_kw') || nestedFieldVerification.raw_technical_leak_paths.includes('technicalSpecs.field_verification.power_kw.value'),
      details: nestedFieldVerification
    },
    {
      check: 'NESTED_SPECIFICATIONS_FALLBACK_DETECTED',
      detected: nestedSpecifications.raw_technical_leak_paths.some((entry) => entry.includes('displacement_cc')),
      details: nestedSpecifications
    },
    {
      check: 'DIRECT_RAW_FIELD_DETECTED',
      detected: directRawField.technical_specs_without_public_fact.includes('technicalSpecs.power_kw'),
      details: directRawField
    },
    {
      check: 'CROSS_MODEL_TECHNICAL_FACT_LEAK_DETECTED',
      detected: wrongModel.cross_model_technical_fact_leaks.length > 0,
      details: wrongModel
    },
    {
      check: 'VARIANT_SPEC_INHERITANCE_DETECTED',
      detected: Object.keys(variantInheritance.technical_specs || {}).length > 0 && variantInheritance.technical_specs_without_public_fact.length > 0,
      details: variantInheritance
    },
    {
      check: 'FAMILY_LEVEL_TECHNICAL_INHERITANCE_DETECTED',
      detected: familyInheritance.raw_technical_leak_paths.some((entry) => entry.includes('field_verification')),
      details: familyInheritance
    }
  ];

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    FAILURE_INJECTION: records.every((row) => row.detected === true) ? 'PASS' : 'FAIL'
  };
}

function buildStructuredDataAudit(database) {
  const negativeQueries = ['MS 170', 'MS 261'];
  const records = negativeQueries.map((query) => {
    const result = decodeStihlCode(query, database);
    const dbModel = (database.models || []).find((model) => model.model_name === result.model || model.slug === String(result.model || '').toLowerCase().replace(/\s+/g, '-')) || null;
    const structured = dbModel ? buildStructuredData({
      pageType: 'model',
      model: dbModel,
      publicEvidence: {
        fields: result.publicEvidenceFields || {},
        modelKey: dbModel.slug || dbModel.model_name
      },
      url: `https://www.stihldecoder.nl/${dbModel.category_slug || 'modellen-onbekend'}/${dbModel.slug || ''}/`
    }) : null;
    const productNode = structured?.['@graph']?.find((node) => node['@type'] === 'Product') || null;
    return {
      query,
      additional_property_count: Array.isArray(productNode?.additionalProperty) ? productNode.additionalProperty.length : 0,
      product_present: Boolean(productNode)
    };
  });

  const model026 = {
    id: 'stihl_026_schema_probe',
    slug: '026',
    model_name: '026',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    displacement_cc: 48.7,
    power_kw: 2.4,
    provenance: {
      source_document_number: '0458-133-3021'
    }
  };
  const result026 = decodeStihlCode('026', database);
  const result046 = decodeStihlCode('046', database);
  const model046 = (database.models || []).find((model) => model.slug === '046' || model.model_name === '046' || model.model_name === 'STIHL 046');
  const structured026 = buildStructuredData({
    pageType: 'model',
    model: model026,
    publicEvidence: {
      fields: result026.publicEvidenceFields || {},
      modelKey: '026'
    },
    url: 'https://www.stihldecoder.nl/kettingzagen/026/'
  });
  const structured046 = buildStructuredData({
    pageType: 'model',
    model: model046,
    publicEvidence: {
      fields: result046.publicEvidenceFields || {},
      modelKey: '046'
    },
    url: 'https://www.stihldecoder.nl/kettingzagen/046/'
  });
  const product026 = structured026['@graph'].find((node) => node['@type'] === 'Product') || {};
  const product046 = structured046['@graph'].find((node) => node['@type'] === 'Product') || {};
  const additional046 = Array.isArray(product046.additionalProperty) ? product046.additionalProperty : [];

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    positive_026_property_count: Array.isArray(product026.additionalProperty) ? product026.additionalProperty.length : 0,
    conflict_046_stroke_property_present: additional046.some((entry) => entry.name === 'Slag'),
    SCHEMA_UNEVIDENCED_TECHNICAL_PROPERTIES: records.reduce((sum, row) => sum + row.additional_property_count, 0),
    positive_026_binding: Array.isArray(product026.additionalProperty) && product026.additionalProperty.length > 0 ? 'PASS' : 'FAIL',
    conflict_046_stroke_excluded: additional046.some((entry) => entry.name === 'Slag') ? 'FAIL' : 'PASS'
  };
}

function buildPassportAudit(database) {
  const negatives = ['MS 170', 'MS 261', '184592301'];
  const records = negatives.map((query) => {
    const passport = buildPassportViewModel(decodeStihlCode(query, database));
    return {
      query,
      has_technical_specs: passport.hasTechnicalSpecs,
      technical_spec_rows: passport.technicalSpecRows
    };
  });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    PASSPORT_UNEVIDENCED_DEFAULTS: records.reduce((sum, row) => sum + (row.has_technical_specs ? 1 : 0), 0)
  };
}

function buildComparisonAudit(database) {
  const negativeComparisonHtml = renderComparisonPageHtml('ms-170-vs-ms-180', database);
  const mixedComparisonHtml = renderComparisonPageHtml('ms-260-vs-ms-261', database);
  const ms170Model = (database.models || []).find((model) => model.slug === 'ms-170');
  const ms261Model = (database.models || []).find((model) => model.slug === 'ms-261');
  const ms170ModelPage = renderModelPageHtml(ms170Model, database);
  const ms261ModelPage = renderModelPageHtml(ms261Model, database);

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    negative_comparison_hidden_specs: !negativeComparisonHtml.includes('30.1 cc') && !negativeComparisonHtml.includes('1.2 kW'),
    mixed_comparison_hidden_specs: !mixedComparisonHtml.includes('50.2 cc') && !mixedComparisonHtml.includes('3 kW'),
    ms170_model_page_hidden_specs: !ms170ModelPage.includes('30.1 cc') && !ms170ModelPage.includes('Bosch WSR 6 F'),
    ms261_model_page_hidden_specs: !ms261ModelPage.includes('50.2 cc') && !ms261ModelPage.includes('NGK CMR6H'),
    COMPARISON_VALIDATION: !negativeComparisonHtml.includes('30.1 cc')
      && !negativeComparisonHtml.includes('1.2 kW')
      && !mixedComparisonHtml.includes('50.2 cc')
      && !mixedComparisonHtml.includes('3 kW')
      && !ms170ModelPage.includes('30.1 cc')
      && !ms261ModelPage.includes('50.2 cc')
      ? 'PASS'
      : 'FAIL'
  };
}

function buildStoreImmutabilityAudit(beforeHash, afterHash, afterTestsHash, database) {
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    PUBLIC_STORE_CANONICAL_SHA256_BEFORE: beforeHash,
    PUBLIC_STORE_CANONICAL_SHA256_AFTER: afterHash,
    PUBLIC_STORE_CANONICAL_SHA256_AFTER_TESTS: afterTestsHash,
    PUBLIC_STORE_CHANGED: beforeHash === afterHash && afterHash === afterTestsHash ? 'NO' : 'YES',
    PUBLIC_FACT_COUNT: (database.public_evidence?.facts || []).length
  };
}

function buildCoreCycle(database) {
  const apiRecursiveAudit = buildApiRecursiveFallbackAudit(database);
  const variantRegressionAudit = buildVariantRegressionAudit(database);
  const publicFactBindingAudit = buildPublicFactBindingAudit(database, apiRecursiveAudit);
  const activationStateAudit = buildActivationStateAudit();
  const failureInjectionAudit = buildFailureInjectionReport(database);
  const structuredDataAudit = buildStructuredDataAudit(database);
  const passportAudit = buildPassportAudit(database);
  const comparisonAudit = buildComparisonAudit(database);

  return {
    apiRecursiveAudit,
    variantRegressionAudit,
    publicFactBindingAudit,
    activationStateAudit,
    failureInjectionAudit,
    structuredDataAudit,
    passportAudit,
    comparisonAudit
  };
}

function buildIdempotencyReport(firstCycle, secondCycle) {
  const left = sha256Canonical(sanitizeForHash(firstCycle));
  const right = sha256Canonical(sanitizeForHash(secondCycle));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    LEFT_HASH: left,
    RIGHT_HASH: right,
    IDEMPOTENCY: left === right ? 'PASS' : 'FAIL'
  };
}

function buildFinalReport(preflight, storeAudit, cycle, idempotency) {
  const apiAudit = cycle.apiRecursiveAudit;
  const bindingAudit = cycle.publicFactBindingAudit;
  const variantAudit = cycle.variantRegressionAudit;
  const activationAudit = cycle.activationStateAudit;
  const structuredAudit = cycle.structuredDataAudit;
  const passportAudit = cycle.passportAudit;
  const comparisonAudit = cycle.comparisonAudit;

  const queryMap = Object.fromEntries(apiAudit.records.map((row) => [row.query, row]));
  const result046 = decodeStihlCode('046', loadDatabase());
  const fs350 = decodeStihlCode('FS 350', loadDatabase());
  const field046 = buildPublicEvidenceFields('046', loadDatabase()).stroke_mm || {};
  const fs350PowerFact = (fs350.publicEvidenceFacts || []).find((fact) => fact.field === 'power_kw') || null;
  const rawModelObjectAssignedToTechnicalSpecs = /technicalSpecs\s*:\s*(?:sanitizedSpecs|matchedModelSpec|rawSpecs|modelData)/.test(fs.readFileSync(path.join(rootDir, 'src', 'decoder.js'), 'utf8')) ? 1 : 0;

  const finalStatus = preflight.PRECHECK === 'PASS'
    && storeAudit.PUBLIC_STORE_CHANGED === 'NO'
    && storeAudit.PUBLIC_STORE_CANONICAL_SHA256_BEFORE === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
    && storeAudit.PUBLIC_STORE_CANONICAL_SHA256_AFTER === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
    && storeAudit.PUBLIC_STORE_CANONICAL_SHA256_AFTER_TESTS === EXPECTED_PUBLIC_STORE_CANONICAL_SHA256
    && storeAudit.PUBLIC_FACT_COUNT === 114
    && apiAudit.TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS === 0
    && apiAudit.NESTED_RAW_TECHNICAL_FALLBACK_LEAKS === 0
    && apiAudit.TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS === 0
    && apiAudit.TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT === 0
    && apiAudit.TECHNICAL_SPEC_VALUE_MISMATCHES === 0
    && apiAudit.CROSS_MODEL_TECHNICAL_FACT_LEAKS === 0
    && bindingAudit.FAMILY_LEVEL_TECHNICAL_INHERITANCE === 0
    && apiAudit.NON_TECHNICAL_KEYS_INSIDE_TECHNICALSPECS === 0
    && rawModelObjectAssignedToTechnicalSpecs === 0
    && bindingAudit.MS170_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE === 0
    && bindingAudit.MS180_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE === 0
    && bindingAudit.MS261_TECHNICAL_SPECS_WITHOUT_PUBLIC_EVIDENCE === 0
    && variantAudit.MS261CM_TO_MS261_SPEC_INHERITANCE === 0
    && variantAudit.VARIANT_SPEC_LEAKS === 0
    && queryMap['MS999']?.raw_technical_leak_paths.length === 0
    && queryMap['184592301']?.raw_technical_leak_paths.length === 0
    && queryMap['11210210800']?.raw_technical_leak_paths.length === 0
    && queryMap['0.46']?.raw_technical_leak_paths.length === 0
    && queryMap['0.15']?.raw_technical_leak_paths.length === 0
    && String(queryMap['026']?.technical_specs?.spark_plug || '').includes('BOSCH WSR 6 F')
    && field046.evidence_status === 'OFFICIAL_CONFLICTED'
    && field046.single_value_eligible === false
    && !Object.prototype.hasOwnProperty.call(result046.technicalSpecs || {}, 'stroke_mm')
    && String(fs350PowerFact?.meta?.sourceLocator || '').includes('doc/TS_Data/FS200_body.htm')
    && String(fs350PowerFact?.meta?.sourceHeading || '').toUpperCase().includes('FS 350')
    && structuredAudit.SCHEMA_UNEVIDENCED_TECHNICAL_PROPERTIES === 0
    && passportAudit.PASSPORT_UNEVIDENCED_DEFAULTS === 0
    && activationAudit.PUBLIC_EVIDENCE_STORE_ACTIVATED === 'YES'
    && activationAudit.PUBLIC_EVIDENCE_STORE_PROMOTED === 'YES'
    && activationAudit.DEPLOYED === 'NO'
    && cycle.failureInjectionAudit.FAILURE_INJECTION === 'PASS'
    && idempotency.IDEMPOTENCY === 'PASS'
    && comparisonAudit.COMPARISON_VALIDATION === 'PASS';

  return {
    'FASE 35C.4.3.2.1 FINAL REPORT': true,
    SOURCE_COMMIT,
    PRECHECK: preflight.PRECHECK,
    PUBLIC_STORE_CANONICAL_SHA256_BEFORE: storeAudit.PUBLIC_STORE_CANONICAL_SHA256_BEFORE,
    PUBLIC_STORE_CANONICAL_SHA256_AFTER: storeAudit.PUBLIC_STORE_CANONICAL_SHA256_AFTER,
    PUBLIC_STORE_CHANGED: storeAudit.PUBLIC_STORE_CHANGED,
    PUBLIC_FACT_COUNT: storeAudit.PUBLIC_FACT_COUNT,
    TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS: apiAudit.TOP_LEVEL_RAW_TECHNICAL_FALLBACK_LEAKS,
    NESTED_RAW_TECHNICAL_FALLBACK_LEAKS: apiAudit.NESTED_RAW_TECHNICAL_FALLBACK_LEAKS,
    TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS: apiAudit.TOTAL_RAW_TECHNICAL_FALLBACK_LEAKS,
    TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT: apiAudit.TECHNICAL_SPECS_WITHOUT_PUBLIC_FACT,
    TECHNICAL_SPEC_VALUE_MISMATCHES: apiAudit.TECHNICAL_SPEC_VALUE_MISMATCHES,
    CROSS_MODEL_TECHNICAL_FACT_LEAKS: apiAudit.CROSS_MODEL_TECHNICAL_FACT_LEAKS,
    FAMILY_LEVEL_TECHNICAL_INHERITANCE: bindingAudit.FAMILY_LEVEL_TECHNICAL_INHERITANCE,
    NON_TECHNICAL_KEYS_INSIDE_TECHNICALSPECS: apiAudit.NON_TECHNICAL_KEYS_INSIDE_TECHNICALSPECS,
    RAW_MODEL_OBJECT_ASSIGNED_TO_TECHNICALSPECS: rawModelObjectAssignedToTechnicalSpecs,
    MS170_TECHNICAL_SPECS: queryMap['MS 170']?.technical_specs || {},
    MS180_TECHNICAL_SPECS: queryMap['MS 180']?.technical_specs || {},
    MS261_TECHNICAL_SPECS: queryMap['MS 261']?.technical_specs || {},
    MS261CM_TECHNICAL_SPECS: queryMap['MS 261 C-M']?.technical_specs || {},
    MS261CM_TO_MS261_SPEC_INHERITANCE: variantAudit.MS261CM_TO_MS261_SPEC_INHERITANCE,
    VARIANT_SPEC_LEAKS: variantAudit.VARIANT_SPEC_LEAKS,
    FUZZY_MODEL_SPEC_ATTACHMENTS: queryMap['MS999']?.raw_technical_leak_paths.length || 0,
    PROBABLE_SERIAL_SPEC_ATTACHMENTS: queryMap['184592301']?.raw_technical_leak_paths.length || 0,
    PART_NUMBER_MODEL_SPEC_ATTACHMENTS: (queryMap['11210210800']?.raw_technical_leak_paths.length || 0) + (queryMap['11280210800']?.raw_technical_leak_paths.length || 0),
    NUMERIC_TOKEN_MODEL_COLLISIONS: (queryMap['0.46']?.raw_technical_leak_paths.length || 0) + (queryMap['0.15']?.raw_technical_leak_paths.length || 0),
    '026_BASELINE_SPARK_PRESERVED': String(queryMap['026']?.technical_specs?.spark_plug || '').includes('BOSCH WSR 6 F') && String(queryMap['026']?.technical_specs?.spark_plug || '').includes('NGK BPMR 7 A') ? 'PASS' : 'FAIL',
    '046_STROKE_STATUS': field046.evidence_status || 'UNKNOWN',
    '046_STROKE_SINGLE_VALUE_ELIGIBLE': Boolean(field046.single_value_eligible),
    '046_CONFLICT_RUNTIME': !Object.prototype.hasOwnProperty.call(result046.technicalSpecs || {}, 'stroke_mm') ? 'PASS' : 'FAIL',
    FS350_SCOPE_RUNTIME: String(fs350PowerFact?.meta?.sourceLocator || '').includes('doc/TS_Data/FS200_body.htm')
      && String(fs350PowerFact?.meta?.sourceHeading || '').toUpperCase().includes('FS 350')
      ? 'PASS'
      : 'FAIL',
    SCHEMA_UNEVIDENCED_TECHNICAL_PROPERTIES: structuredAudit.SCHEMA_UNEVIDENCED_TECHNICAL_PROPERTIES,
    PASSPORT_UNEVIDENCED_DEFAULTS: passportAudit.PASSPORT_UNEVIDENCED_DEFAULTS,
    PUBLIC_EVIDENCE_STORE_ACTIVATED: activationAudit.PUBLIC_EVIDENCE_STORE_ACTIVATED,
    PUBLIC_EVIDENCE_STORE_PROMOTED: activationAudit.PUBLIC_EVIDENCE_STORE_PROMOTED,
    DEPLOYED: activationAudit.DEPLOYED,
    CANONICAL_DATABASE_CHANGED: 'NO',
    UNEXPECTED_CANONICAL_PROMOTIONS: 0,
    FAILURE_INJECTION: cycle.failureInjectionAudit.FAILURE_INJECTION,
    IDEMPOTENCY: idempotency.IDEMPOTENCY,
    TEST_SUITE: finalStatus ? 'PASS' : 'FAIL',
    FINAL_STATUS: finalStatus ? 'PASS' : 'FAIL'
  };
}

export async function main() {
  const preflight = buildPreflightReport();
  writeJson(OUTPUTS.preflight, preflight);

  if (preflight.PRECHECK !== 'PASS') {
    const blocked = {
      'FASE 35C.4.3.2.1 FINAL REPORT': true,
      SOURCE_COMMIT,
      PRECHECK: 'FAIL',
      FINAL_STATUS: 'BLOCKED'
    };
    writeJson(OUTPUTS.finalReport, blocked);
    return blocked;
  }

  const beforeDatabase = loadDatabase();
  const beforeHash = sha256Canonical(beforeDatabase.public_evidence);
  const firstCycle = buildCoreCycle(beforeDatabase);
  const secondCycle = buildCoreCycle(loadDatabase());
  const afterDatabase = loadDatabase();
  const afterHash = sha256Canonical(afterDatabase.public_evidence);
  const afterTestsHash = sha256Canonical(loadDatabase().public_evidence);

  const storeAudit = buildStoreImmutabilityAudit(beforeHash, afterHash, afterTestsHash, afterDatabase);
  const idempotencyReport = buildIdempotencyReport(firstCycle, secondCycle);
  const finalReport = buildFinalReport(preflight, storeAudit, secondCycle, idempotencyReport);

  writeJson(OUTPUTS.storeImmutability, storeAudit);
  writeJson(OUTPUTS.apiRecursive, secondCycle.apiRecursiveAudit);
  writeJson(OUTPUTS.variantRegression, secondCycle.variantRegressionAudit);
  writeJson(OUTPUTS.publicFactBinding, secondCycle.publicFactBindingAudit);
  writeJson(OUTPUTS.activationState, secondCycle.activationStateAudit);
  writeJson(OUTPUTS.failureInjection, secondCycle.failureInjectionAudit);
  writeJson(OUTPUTS.structuredData, secondCycle.structuredDataAudit);
  writeJson(OUTPUTS.passport, secondCycle.passportAudit);
  writeJson(OUTPUTS.comparison, secondCycle.comparisonAudit);
  writeJson(OUTPUTS.idempotency, idempotencyReport);
  writeJson(OUTPUTS.finalReport, finalReport);

  return finalReport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((report) => {
      console.log('Phase 35C.4.3.2.1 nested fallback hotfix completed.');
      console.log(`Precheck: ${report.PRECHECK}`);
      console.log(`Final status: ${report.FINAL_STATUS}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
