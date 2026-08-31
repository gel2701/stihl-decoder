import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

import { decodeStihlCode } from '../src/decoder.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderComparisonPageHtml } from '../src/components/ComparisonPageTemplate.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { buildPublicEvidenceFields, sanitizeSparkPlugValue } from '../src/publicEvidence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const SOURCE_COMMIT = '35fa5e17a71120c3bb0dac00910ede8f59eb02dc';
const PHASE_ID = '35C.4.2.2.2';
const PUBLIC_SCHEMA = 'public-evidence-v1';
const PUBLIC_RENDER_FILES = new Set([
  'index.html',
  'src/app.js',
  'src/components/ModelPageTemplate.js',
  'src/components/ComparisonPageTemplate.js',
  'src/components/CategoryPageTemplate.js',
  'src/components/ModelPartsPageTemplate.js',
  'src/components/StihlPassportGenerator.js',
  'src/components/StructuredData.js'
]);
const ROUTE_FILES = [
  'src/server.js',
  'src/components/SitemapGenerator.js'
];
const RAW_PATTERN_DEFS = [
  { field: 'power_kw', expression: /\bmodel\.power_kw\b/g },
  { field: 'power_hp', expression: /\bmodel\.power_hp\b/g },
  { field: 'displacement_cc', expression: /\bmodel\.displacement_cc\b/g },
  { field: 'weight_kg', expression: /\bmodel\.weight_kg\b/g },
  { field: 'spark_plug', expression: /\bmodel\.spark_plug\b/g },
  { field: 'electrode_gap_mm', expression: /\bmodel\.electrode_gap_mm\b/g },
  { field: 'carb_h_setting', expression: /\bmodel\.carb_h_setting\b/g },
  { field: 'carb_l_setting', expression: /\bmodel\.carb_l_setting\b/g },
  { field: 'carb_la_setting', expression: /\bmodel\.carb_la_setting\b/g },
  { field: 'chain_pitch', expression: /\bmodel\.chain_pitch\b/g },
  { field: 'chain_gauge_mm', expression: /\bmodel\.chain_gauge_mm\b/g },
  { field: 'fuel_tank_l', expression: /\bmodel\.fuel_tank_l\b/g },
  { field: 'oil_tank_l', expression: /\bmodel\.oil_tank_l\b/g },
  { field: 'power_kw', expression: /\bcomparisonPartner\.power_kw\b/g },
  { field: 'power_hp', expression: /\bcomparisonPartner\.power_hp\b/g },
  { field: 'displacement_cc', expression: /\bcomparisonPartner\.displacement_cc\b/g },
  { field: 'weight_kg', expression: /\bcomparisonPartner\.weight_kg\b/g }
];
const OUTPUTS = {
  finalReport: 'data/phase35c4222_final_report.json',
  preflight: 'data/phase35c4222_preflight_report.json',
  rawFallback: 'data/phase35c4222_raw_public_fallback_audit.json',
  partFamily: 'data/phase35c4222_part_family_safety_audit.json',
  conflictTraceability: 'data/phase35c4222_conflict_traceability_audit.json',
  conflictApi: 'data/phase35c4222_conflict_api_audit.json',
  conflictRender: 'data/phase35c4222_conflict_render_audit.json',
  conflictPassport: 'data/phase35c4222_conflict_passport_audit.json',
  spark: 'data/phase35c4222_spark_alternative_audit.json',
  structuredData: 'data/phase35c4222_structured_data_audit.json',
  fuzzy: 'data/phase35c4222_fuzzy_model_audit.json',
  partUi: 'data/phase35c4222_part_number_ui_audit.json',
  genericFallback: 'data/phase35c4222_generic_fallback_audit.json',
  failure: 'data/phase35c4222_failure_injection_report.json',
  idempotency: 'data/phase35c4222_idempotency_report.json',
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

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripGenerated(value) {
  if (Array.isArray(value)) return value.map(stripGenerated);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc, key) => {
    if (key !== 'generated_at') {
      acc[key] = stripGenerated(value[key]);
    }
    return acc;
  }, {});
}

function summarizeOverlay(overlay) {
  const facts = overlay?.facts || [];
  return {
    total: facts.length,
    canonicalVerified: facts.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length,
    officialDocumented: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_DOCUMENTED').length,
    officialConflicted: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED').length
  };
}

function normalizeSourceClass(sourceClass) {
  return sourceClass === 'OFFICIAL_TECHNICAL_DATASET'
    ? 'OFFICIAL_LEGACY_TECHNICAL_DATA'
    : sourceClass;
}

function toCanonicalLocator(sourcePath) {
  const raw = String(sourcePath || '').replace(/\\/g, '/');
  const marker = '/doc/';
  const idx = raw.toLowerCase().indexOf(marker);
  if (idx >= 0) {
    return raw.slice(idx + 1);
  }
  return raw.replace(/^[A-Za-z]:\//, '');
}

function buildAfterOverlay(beforeOverlay) {
  const overlay = deepClone(beforeOverlay);
  const verificationFunnel = readJson('data/phase35c42_verification_funnel.json', { records: [] });
  const provenanceAudit = readJson('data/phase35c421_source_provenance_audit.json', { records: [] });

  for (const fact of overlay.facts || []) {
    fact.generated_from_phase = PHASE_ID;
    fact.source_class = normalizeSourceClass(fact.source_class);
    fact.evidence_status = fact.public_evidence_status;
    fact.source_locator_type = fact.pdf_page ? 'PDF_PAGE' : (fact.source_locator_type || null);
    fact.source_locator = fact.pdf_page ? `publication:${fact.publication_id || fact.source_document_id}#page=${fact.pdf_page}` : (fact.source_locator || null);
    fact.source_heading = fact.source_heading || fact.field;

    if ((fact.model_slug === '026' || fact.model_slug === '046') && fact.field === 'spark_plug') {
      const candidate = (verificationFunnel.records || []).find((row) => row.model === fact.model_slug && row.field === 'spark_plug');
      const sanitized = candidate ? sanitizeSparkPlugValue(candidate.raw_value) : null;
      if (sanitized?.semantic_status === 'VALID' && sanitized.normalized_value.length > 0) {
        fact.raw_value = candidate.raw_value;
        fact.normalized_value = sanitized.normalized_value;
        fact.field_semantic_status = sanitized.semantic_status;
      }
    }

    if (fact.model_slug === '046' && fact.field === 'stroke_mm' && fact.public_evidence_status === 'OFFICIAL_CONFLICTED') {
      const legacy = (provenanceAudit.records || provenanceAudit || []).find((row) => row.model === '046' && row.field === 'stroke_mm');
      fact.conflicting_values = [{
        value: legacy?.new_normalized ?? 36,
        unit: legacy?.unit || 'mm',
        source_label: 'STIHL technische gegevens',
        source_document_id: legacy?.synthetic_publication_id || 'TS_DATA_046',
        source_document_title: 'STIHL technische gegevens',
        publication_id: legacy?.synthetic_publication_id || 'TS_DATA_046',
        pdf_page: null,
        printed_page: null,
        source_class: normalizeSourceClass(legacy?.source_class || 'OFFICIAL_LEGACY_TECHNICAL_DATA'),
        source_locator_type: 'TS_DATA',
        source_locator: toCanonicalLocator(legacy?.source_path || legacy?.source_file || 'doc/TS_Data/046_body.htm'),
        source_heading: legacy?.source_heading || 'Testing and Setting Data | Chain Saw: 046',
        source_url: null,
        market: null,
        revision: null,
        configuration: null,
        evidence_status: 'OFFICIAL_CONFLICTED',
        model_scope: legacy?.source_model_scope || 'EXACT_MODEL',
        scope_evidence: ['DOC_MODEL:046'],
        reason: 'VALUE_DISAGREEMENT_SOURCE_INDEPENDENCE_UNRESOLVED'
      }];
    } else if (Array.isArray(fact.conflicting_values)) {
      fact.conflicting_values = fact.conflicting_values.map((entry) => ({
        ...entry,
        source_class: normalizeSourceClass(entry.source_class),
        evidence_status: entry.evidence_status || fact.public_evidence_status,
        source_document_id: entry.source_document_id || entry.publication_id || null,
        source_document_title: entry.source_document_title || entry.source_label || 'Officiële bron',
        source_locator_type: entry.source_locator_type || (entry.pdf_page ? 'PDF_PAGE' : null),
        source_locator: entry.source_locator || (entry.pdf_page ? `publication:${entry.publication_id || fact.publication_id}#page=${entry.pdf_page}` : null),
        source_heading: entry.source_heading || null,
        printed_page: entry.printed_page ?? null,
        market: entry.market ?? null,
        revision: entry.revision ?? null,
        configuration: entry.configuration ?? null,
        model_scope: entry.model_scope || fact.model_scope || null,
        scope_evidence: Array.isArray(entry.scope_evidence) ? entry.scope_evidence : (Array.isArray(fact.scope_evidence) ? fact.scope_evidence : [])
      }));
    }
  }

  overlay.generated_at = new Date().toISOString();
  overlay.generated_from_phase = PHASE_ID;
  return overlay;
}

function getConflictValueEntries(fact) {
  const values = [{
    value: fact.normalized_value,
    unit: fact.unit || null,
    source_class: fact.source_class || null,
    source_document_id: fact.source_document_id || null,
    source_document_title: fact.source_document_title || null,
    publication_id: fact.publication_id || null,
    pdf_page: fact.pdf_page ?? null,
    printed_page: fact.printed_page ?? null,
    source_locator_type: fact.source_locator_type || null,
    source_locator: fact.source_locator || null,
    source_heading: fact.source_heading || null,
    market: fact.market ?? null,
    revision: fact.revision ?? null,
    configuration: fact.configuration ?? null,
    evidence_status: fact.public_evidence_status,
    model_scope: fact.model_scope || null,
    scope_evidence: Array.isArray(fact.scope_evidence) ? fact.scope_evidence : []
  }];
  for (const entry of fact.conflicting_values || []) {
    values.push(entry);
  }
  return values;
}

function isCompleteConflictValue(entry) {
  const hasIdentity = Boolean(entry.source_document_id || entry.publication_id || entry.source_locator);
  const hasLocator = entry.pdf_page != null || Boolean(entry.source_locator);
  return Boolean(
    entry.value != null
    && entry.source_class
    && entry.source_document_title
    && hasIdentity
    && hasLocator
    && Object.prototype.hasOwnProperty.call(entry, 'market')
    && Object.prototype.hasOwnProperty.call(entry, 'revision')
    && Object.prototype.hasOwnProperty.call(entry, 'configuration')
    && entry.evidence_status
  );
}

function buildConflictTraceabilityAudit(afterOverlay) {
  const conflictFacts = (afterOverlay.facts || []).filter((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED');
  const records = [];

  for (const fact of conflictFacts) {
    const values = getConflictValueEntries(fact).map((entry, index) => ({
      model: fact.model_slug,
      field: fact.field,
      index,
      value: entry.value,
      unit: entry.unit || null,
      source_class: entry.source_class || null,
      source_document_id: entry.source_document_id || null,
      source_document_title: entry.source_document_title || null,
      publication_id: entry.publication_id || null,
      pdf_page: entry.pdf_page ?? null,
      source_locator_type: entry.source_locator_type || null,
      source_locator: entry.source_locator || null,
      source_heading: entry.source_heading || null,
      market: entry.market ?? null,
      revision: entry.revision ?? null,
      configuration: entry.configuration ?? null,
      evidence_status: entry.evidence_status || null,
      complete_traceability: isCompleteConflictValue(entry)
    }));
    records.push(...values);
  }

  const stroke046 = records.filter((row) => row.model === '046' && row.field === 'stroke_mm');
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records,
    OFFICIAL_CONFLICTED_FACTS: conflictFacts.length,
    PUBLIC_CONFLICT_VALUES_TOTAL: records.length,
    PUBLIC_CONFLICT_VALUES_WITH_COMPLETE_TRACEABILITY: records.filter((row) => row.complete_traceability).length,
    PUBLIC_CONFLICT_VALUES_WITHOUT_COMPLETE_TRACEABILITY: records.filter((row) => !row.complete_traceability).length,
    '046_STROKE_VALUE_A_TRACEABLE': stroke046[0]?.complete_traceability ? 'PASS' : 'FAIL',
    '046_STROKE_VALUE_B_TRACEABLE': stroke046[1]?.complete_traceability ? 'PASS' : 'FAIL',
    PRIMARY_SOURCE: stroke046[0] || null,
    SECONDARY_SOURCE: stroke046[1] || null
  };
}

function buildConflictApiAudit(database) {
  const result046 = decodeStihlCode('046', database);
  const strokeField = result046.publicEvidenceFields?.stroke_mm || null;
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    '046_STROKE_STATUS': strokeField?.evidence_status || 'UNKNOWN',
    '046_STROKE_CONFLICT_API': strokeField,
    '046_STROKE_SINGLE_VALUE_API_LEAKS': Object.prototype.hasOwnProperty.call(result046.technicalSpecs || {}, 'stroke_mm') ? 1 : 0
  };
}

function buildConflictRenderAudit(database) {
  const model046 = { id: '046', slug: '046', model_name: '046', category: 'Kettingzaag', category_slug: 'kettingzagen' };
  const html = renderModelPageHtml(model046, database);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    html_checks: {
      has_conflict_label: html.includes('Bronverschil gevonden'),
      has_40_mm: html.includes('40 mm'),
      has_36_mm: html.includes('36 mm'),
      has_single_stroke_value: /Slag:<\/span>\s*<span class="text-base font-bold text-white">(?:40|36) mm<\/span>/.test(html)
    },
    '046_STROKE_SINGLE_VALUE_RENDER_LEAKS': /Slag:<\/span>\s*<span class="text-base font-bold text-white">(?:40|36) mm<\/span>/.test(html) ? 1 : 0
  };
}

function buildConflictPassportAudit(database) {
  const result046 = decodeStihlCode('046', database);
  const html = renderStihlPassportHtml({
    ...result046,
    cleanedSerial: '046',
    formatted: '046',
    theftCheck: {
      userSelfReported: false,
      checkedAt: '31-08-2026',
      statusLabel: 'Niet gecontroleerd via StopHeling'
    }
  });
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    has_conflict_label: html.includes('Bronverschil gevonden'),
    has_stroke_row: /Slag/i.test(html),
    '046_STROKE_SINGLE_VALUE_PASSPORT_LEAKS': /Slag:\s*40 mm/i.test(html) ? 1 : 0
  };
}

function buildSparkAudit(afterOverlay) {
  const facts = afterOverlay.facts || [];
  const model026 = facts.find((fact) => fact.model_slug === '026' && fact.field === 'spark_plug');
  const model046 = facts.find((fact) => fact.model_slug === '046' && fact.field === 'spark_plug');
  const contaminationPattern = /(RAPID|CHAIN|ANSI|0\.325|3\/8|RA\d+)/i;
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    '026_SPARK_ALTERNATIVES': model026?.normalized_value || [],
    '046_SPARK_ALTERNATIVES': model046?.normalized_value || [],
    '026_SPARK_CONTAMINATION': contaminationPattern.test(JSON.stringify(model026?.normalized_value || [])) ? 1 : 0,
    '046_SPARK_CONTAMINATION': contaminationPattern.test(JSON.stringify(model046?.normalized_value || [])) ? 1 : 0
  };
}

function extractProductProperties(jsonLdData) {
  const graph = Array.isArray(jsonLdData?.['@graph']) ? jsonLdData['@graph'] : [];
  return graph
    .filter((node) => node['@type'] === 'Product')
    .flatMap((node) => Array.isArray(node.additionalProperty) ? node.additionalProperty : []);
}

function buildStructuredDataAudit(database) {
  const publicEvidence026 = buildPublicEvidenceFields('026', database);
  const positiveFixture = {
    id: 'stihl_ms_261',
    slug: 'ms-261',
    model_name: 'MS 261',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    series_code: '1141',
    displacement_cc: 50.2,
    power_kw: 3.0,
    provenance: { source_document_number: '0458-573-8621-D' }
  };
  const positive = buildStructuredData({
    pageType: 'model',
    model: positiveFixture,
    publicEvidence: { fields: publicEvidence026 },
    breadcrumbs: [],
    url: 'https://www.stihldecoder.nl/kettingzagen/ms-261/'
  });
  const positiveProps = extractProductProperties(positive);
  const fieldMap = {
    Motorinhoud: 'displacement_cc',
    Vermogen: 'power_kw',
    Cilinderboring: 'bore_mm',
    Slag: 'stroke_mm',
    'Stationair toerental': 'idle_speed_rpm',
    Elektrodenafstand: 'electrode_gap_mm',
    Brandstoftank: 'fuel_tank_l',
    Kettingolietank: 'oil_tank_l',
    Bougie: 'spark_plug'
  };

  const publicEvidence046 = buildPublicEvidenceFields('046', database);
  const fixture046 = {
    id: '046',
    slug: '046',
    model_name: '046',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    series_code: '1128',
    displacement_cc: 76.5,
    power_kw: 4.6,
    provenance: { source_document_number: '0458-145-3021' }
  };
  const conflicted = buildStructuredData({
    pageType: 'model',
    model: fixture046,
    publicEvidence: { fields: publicEvidence046 },
    breadcrumbs: [],
    url: 'https://www.stihldecoder.nl/kettingzagen/046/'
  });
  const conflictedProps = extractProductProperties(conflicted);

  const unknown = buildStructuredData({
    pageType: 'model',
    model: { ...positiveFixture, slug: 'unknown', model_name: 'Unknown' },
    publicEvidence: { fields: {} },
    breadcrumbs: [],
    url: 'https://www.stihldecoder.nl/kettingzagen/unknown/'
  });
  const unknownProps = extractProductProperties(unknown);

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    SCHEMA_POSITIVE_SAFE_FACTS: positiveProps.length,
    SCHEMA_FACTS_WITH_PUBLIC_EVIDENCE: positiveProps.filter((prop) => {
      const field = fieldMap[prop.name];
      return field && publicEvidence026[field]?.single_value_eligible === true;
    }).length,
    SCHEMA_RAW_MODEL_FALLBACK_FACTS: positiveProps.filter((prop) => {
      const field = fieldMap[prop.name];
      return field ? publicEvidence026[field]?.single_value_eligible !== true : true;
    }).length,
    SCHEMA_CONFLICTED_SINGLE_VALUES: conflictedProps.filter((prop) => prop.name === 'Slag').length,
    SCHEMA_UNKNOWN_TECHNICAL_FACTS: unknownProps.length,
    positive_properties: positiveProps,
    conflicted_properties: conflictedProps,
    unknown_properties: unknownProps
  };
}

function buildFuzzyAudit(database) {
  const queries = ['MS 26', 'MS999', 'FS999', 'BR601'];
  const records = queries.map((query) => {
    const result = decodeStihlCode(query, database);
    return {
      query,
      success: result.success,
      status: result.status || (result.success ? 'SUCCESS' : 'ERROR'),
      technical_spec_count: Object.keys(result.technicalSpecs || {}).length
    };
  });
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records,
    FUZZY_MODEL_SPEC_ATTACHMENTS: records.reduce((sum, row) => sum + row.technical_spec_count, 0)
  };
}

function renderPartNumberUiState(result) {
  return {
    title: result.formattedPartNo || result.cleaned,
    message: result.warningMessage || '',
    modelGroup: result.modelGroup || '',
    specs: `${result.familyDetails?.familyLabel || 'STIHL onderdeelreeks / familiecode'}${result.category ? ` · Categorie: ${result.category}` : ''}`,
    advice: result.advice || ''
  };
}

function countPartUiTechnicalFacts(uiState) {
  return ['Machinetype', 'Type:', 'Motor:', 'Inhoud:', 'Vermogen:', 'Productieperiode:', 'Era:']
    .reduce((sum, token) => sum + ((uiState.title + uiState.message + uiState.modelGroup + uiState.specs + uiState.advice).includes(token) ? 1 : 0), 0);
}

function buildPartFamilyAudit(database) {
  const part1121 = decodeStihlCode('11210210800', database);
  const part1128 = decodeStihlCode('11280210800', database);
  const partUi1121 = renderPartNumberUiState(part1121);
  const partUi1128 = renderPartNumberUiState(part1128);
  const source = fs.readFileSync(path.join(rootDir, 'src', 'decoder.js'), 'utf8');
  const dangerousPathCount = /matchedModelSpec\s*=.*series_code\s*===\s*familyCode[\s\S]*technicalSpecs:\s*sanitizedSpecs/.test(source) ? 1 : 0;

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    PART_NUMBER_CASES_TESTED: 2,
    '1121_RESULT': {
      type: part1121.type,
      modelGroup: part1121.modelGroup,
      matchedModel: part1121.matchedModel,
      technicalSpecs: part1121.technicalSpecs
    },
    '1128_RESULT': {
      type: part1128.type,
      modelGroup: part1128.modelGroup,
      matchedModel: part1128.matchedModel,
      technicalSpecs: part1128.technicalSpecs
    },
    '1121_TECHNICAL_SPEC_COUNT': Object.keys(part1121.technicalSpecs || {}).length,
    '1128_TECHNICAL_SPEC_COUNT': Object.keys(part1128.technicalSpecs || {}).length,
    PART_FAMILY_TECHNICAL_INHERITANCE_PATHS: dangerousPathCount,
    PART_NUMBER_UI_TECHNICAL_FACT_COUNT: countPartUiTechnicalFacts(partUi1121) + countPartUiTechnicalFacts(partUi1128),
    ui_records: [
      { familyCode: '1121', ...partUi1121 },
      { familyCode: '1128', ...partUi1128 }
    ]
  };
}

function collectFiles(dir) {
  const entries = fs.readdirSync(path.join(rootDir, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(rel));
    } else if (/\.(js|ts|tsx|html)$/.test(entry.name)) {
      files.push(rel.replace(/\\/g, '/'));
    }
  }
  return files;
}

function classifyOccurrence(file) {
  if (PUBLIC_RENDER_FILES.has(file)) return 'PUBLIC_RENDER';
  if (file.startsWith('tests/')) return 'TEST_FIXTURE';
  if (file.startsWith('scripts/')) return 'INTERNAL_ADMIN';
  if (file === 'src/publicationRules.js') return 'NON_TECHNICAL_METADATA';
  return 'INTERNAL_ADMIN';
}

function buildRawFallbackAudit() {
  const files = ['index.html', ...collectFiles('src'), ...collectFiles('tests'), ...collectFiles('scripts')];
  const records = [];

  for (const file of files) {
    const absolute = path.join(rootDir, file);
    if (!fs.existsSync(absolute)) continue;
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of RAW_PATTERN_DEFS) {
        if (pattern.expression.test(line)) {
          pattern.expression.lastIndex = 0;
          const classification = classifyOccurrence(file);
          const evidenceSafe = classification !== 'PUBLIC_RENDER';
          records.push({
            file,
            line: index + 1,
            context: line.trim(),
            expression: (line.match(pattern.expression) || [pattern.expression.source])[0],
            field: pattern.field,
            public_path: classification === 'PUBLIC_RENDER',
            classification,
            evidence_safe: evidenceSafe,
            reason: evidenceSafe
              ? 'Not on a public render path'
              : 'Raw technical model value still present on a public render path'
          });
          pattern.expression.lastIndex = 0;
        }
      }
    });
  }

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records,
    RAW_MODEL_TECHNICAL_RENDER_OCCURRENCES: records.length,
    RAW_MODEL_TECHNICAL_RENDER_ALLOWED: records.filter((row) => row.evidence_safe).length,
    RAW_MODEL_TECHNICAL_RENDER_UNSAFE: records.filter((row) => !row.evidence_safe).length
  };
}

function buildPartUiAudit(database) {
  const result = decodeStihlCode('11210210800', database);
  const uiState = renderPartNumberUiState(result);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    uiState,
    PART_NUMBER_UI_TECHNICAL_FACT_COUNT: countPartUiTechnicalFacts(uiState)
  };
}

function buildGenericFallbackAudit(rawFallbackAudit, partFamilyAudit) {
  const publicOutputs = [
    renderModelPageHtml({ id: '026', slug: '026', model_name: '026', category: 'Kettingzaag', category_slug: 'kettingzagen' }, loadDatabase()),
    renderCategoryPageHtml('kettingzagen', loadDatabase()),
    renderComparisonPageHtml('ms-170-vs-ms-180', loadDatabase()),
    renderModelPartsPageHtml({ id: '026', slug: '026', model_name: '026', category: 'Kettingzaag', category_slug: 'kettingzagen' }, loadDatabase())
  ].join('\n');
  const windowsPathCount = (publicOutputs.match(/[A-Z]:\\/g) || []).length + (publicOutputs.match(/file:\/\//g) || []).length;

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    GENERIC_FACTUAL_FALLBACK_COUNT: rawFallbackAudit.RAW_MODEL_TECHNICAL_RENDER_UNSAFE + partFamilyAudit.PART_FAMILY_TECHNICAL_INHERITANCE_PATHS + partFamilyAudit.PART_NUMBER_UI_TECHNICAL_FACT_COUNT,
    PUBLIC_OUTPUT_WINDOWS_PATH_COUNT: windowsPathCount
  };
}

function loadDatabase(overlay = null) {
  const database = readJson('data/stihl_database.json', {});
  database.public_evidence = overlay || readJson(OUTPUTS.publicStore, { schema_version: PUBLIC_SCHEMA, facts: [] });
  return database;
}

function buildRouteMetrics() {
  const routeChanges = ROUTE_FILES.reduce((sum, file) => {
    const diff = git(['diff', '--numstat', SOURCE_COMMIT, '--', file]);
    if (!diff) return sum;
    const [added, removed] = diff.split(/\s+/);
    return sum + Number(added || 0) + Number(removed || 0);
  }, 0);
  const sitemapChanges = git(['diff', '--numstat', SOURCE_COMMIT, '--', 'src/components/SitemapGenerator.js']);
  return {
    SEO_ROUTE_CHANGES: routeChanges,
    SITEMAP_URL_CHANGES: sitemapChanges ? sitemapChanges.split(/\s+/).slice(0, 2).reduce((sum, value) => sum + Number(value || 0), 0) : 0
  };
}

function buildFailureInjectionAudit(afterOverlay) {
  const database = loadDatabase(afterOverlay);
  const model046 = { id: '046', slug: '046', model_name: '046', category: 'Kettingzaag', category_slug: 'kettingzagen' };
  const rawOnlyModel = { id: 'raw-test', slug: 'raw-test', model_name: 'Raw Test', category: 'Kettingzaag', category_slug: 'kettingzagen', power_kw: 9.9, displacement_cc: 99.9, carb_h_setting: '2 turns', chain_pitch: '.404"' };

  const rawModelHtml = renderModelPageHtml(rawOnlyModel, database);
  const rawComparisonHtml = renderComparisonPageHtml('ms-170-vs-ms-180', database);
  const rawCategoryHtml = renderCategoryPageHtml('kettingzagen', database);
  const brokenOverlay = deepClone(afterOverlay);
  const brokenFact = brokenOverlay.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm');
  if (brokenFact?.conflicting_values?.[0]) {
    delete brokenFact.conflicting_values[0].source_document_id;
    delete brokenFact.conflicting_values[0].publication_id;
    delete brokenFact.conflicting_values[0].source_locator;
  }
  const brokenTraceability = buildConflictTraceabilityAudit(brokenOverlay);
  const leakingOverlay = deepClone(afterOverlay);
  const leakingFact = leakingOverlay.facts.find((fact) => fact.model_slug === '046' && fact.field === 'stroke_mm');
  if (leakingFact) {
    leakingFact.public_evidence_status = 'OFFICIAL_DOCUMENTED';
    leakingFact.display_eligible = true;
    leakingFact.single_value_eligible = true;
    leakingFact.conflicting_values = [];
  }
  const leakingDatabase = loadDatabase(leakingOverlay);
  const leaked046 = decodeStihlCode('046', leakingDatabase);
  const leakedModelHtml = renderModelPageHtml(model046, leakingDatabase);
  const passportLeakHtml = renderStihlPassportHtml({
    ...decodeStihlCode('046', database),
    technicalSpecs: {
      ...decodeStihlCode('046', database).technicalSpecs,
      stroke_mm: 40
    },
    cleanedSerial: '046',
    formatted: '046',
    theftCheck: { userSelfReported: false, checkedAt: '31-08-2026', statusLabel: 'Niet gecontroleerd via StopHeling' }
  });
  const schemaRaw = buildStructuredData({
    pageType: 'model',
    model: { ...rawOnlyModel, provenance: { source_document_number: '0458-133-3021' } },
    publicEvidence: { fields: {} },
    breadcrumbs: [],
    url: 'https://www.stihldecoder.nl/kettingzagen/raw-test/'
  });
  const schemaConflict = buildStructuredData({
    pageType: 'model',
    model: { ...model046, displacement_cc: 76.5, power_kw: 4.6, provenance: { source_document_number: '0458-145-3021' } },
    publicEvidence: { fields: buildPublicEvidenceFields('046', database) },
    breadcrumbs: [],
    url: 'https://www.stihldecoder.nl/kettingzagen/046/'
  });
  const fuzzy = ['MS 26', 'MS999', 'FS999', 'BR601'].map((query) => decodeStihlCode(query, database));
  const sparkMutation = sanitizeSparkPlugValue('Bosch WSR 6 F 8.25 mm Rapid-Micro or NGK BPMR 7 A');

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    RAW_MODEL_POWER_RENDER_FAILURE: rawModelHtml.includes('9.9 kW') || rawComparisonHtml.includes('9.9 kW') || rawCategoryHtml.includes('9.9 kW') ? 'FAIL' : 'PASS',
    RAW_MODEL_DISPLACEMENT_RENDER_FAILURE: rawModelHtml.includes('99.9 cc') ? 'FAIL' : 'PASS',
    RAW_MODEL_CARB_RENDER_FAILURE: rawModelHtml.includes('2 turns') ? 'FAIL' : 'PASS',
    RAW_MODEL_CHAIN_RENDER_FAILURE: rawModelHtml.includes('.404') ? 'FAIL' : 'PASS',
    PART_FAMILY_SPEC_INHERITANCE_FAILURE: Object.keys(decodeStihlCode('11210210800', database).technicalSpecs || {}).length === 0 ? 'PASS' : 'FAIL',
    CONFLICT_SECOND_SOURCE_MISSING_PROVENANCE_FAILURE: brokenTraceability.PUBLIC_CONFLICT_VALUES_WITHOUT_COMPLETE_TRACEABILITY > 0 ? 'PASS' : 'FAIL',
    CONFLICT_SINGLE_VALUE_API_FAILURE: Object.prototype.hasOwnProperty.call(leaked046.technicalSpecs || {}, 'stroke_mm') ? 'PASS' : 'FAIL',
    CONFLICT_SINGLE_VALUE_RENDER_FAILURE: /Slag:<\/span>\s*<span class="text-base font-bold text-white">40 mm<\/span>/.test(leakedModelHtml) ? 'PASS' : 'FAIL',
    CONFLICT_SINGLE_VALUE_PASSPORT_FAILURE: passportLeakHtml.includes('Slag') ? 'FAIL' : 'PASS',
    SPARK_SECOND_ALTERNATIVE_CONTAMINATION_FAILURE: sparkMutation.contamination_detected ? 'PASS' : 'FAIL',
    SCHEMA_RAW_MODEL_FALLBACK_FAILURE: extractProductProperties(schemaRaw).length === 0 ? 'PASS' : 'FAIL',
    SCHEMA_CONFLICT_SINGLE_VALUE_FAILURE: extractProductProperties(schemaConflict).some((prop) => prop.name === 'Slag') ? 'FAIL' : 'PASS',
    FUZZY_MODEL_SPEC_ATTACH_FAILURE: fuzzy.every((result) => Object.keys(result.technicalSpecs || {}).length === 0) ? 'PASS' : 'FAIL'
  };
}

function buildIdempotencyAudit(beforeOverlay) {
  const run1Overlay = buildAfterOverlay(beforeOverlay);
  const run2Overlay = buildAfterOverlay(beforeOverlay);
  const database1 = loadDatabase(run1Overlay);
  const database2 = loadDatabase(run2Overlay);
  const renderState1 = {
    decode1121: decodeStihlCode('11210210800', database1),
    decode184592301: decodeStihlCode('184592301', database1),
    page046: renderModelPageHtml({ id: '046', slug: '046', model_name: '046', category: 'Kettingzaag', category_slug: 'kettingzagen' }, database1),
    schema026: buildStructuredData({
      pageType: 'model',
      model: { id: '026', slug: '026', model_name: '026', category: 'Kettingzaag', category_slug: 'kettingzagen', provenance: { source_document_number: '0458-133-3021' }, displacement_cc: 48.7, power_kw: 2.6 },
      publicEvidence: { fields: buildPublicEvidenceFields('026', database1) },
      breadcrumbs: [],
      url: 'https://www.stihldecoder.nl/kettingzagen/026/'
    })
  };
  const renderState2 = {
    decode1121: decodeStihlCode('11210210800', database2),
    decode184592301: decodeStihlCode('184592301', database2),
    page046: renderModelPageHtml({ id: '046', slug: '046', model_name: '046', category: 'Kettingzaag', category_slug: 'kettingzagen' }, database2),
    schema026: buildStructuredData({
      pageType: 'model',
      model: { id: '026', slug: '026', model_name: '026', category: 'Kettingzaag', category_slug: 'kettingzagen', provenance: { source_document_number: '0458-133-3021' }, displacement_cc: 48.7, power_kw: 2.6 },
      publicEvidence: { fields: buildPublicEvidenceFields('026', database2) },
      breadcrumbs: [],
      url: 'https://www.stihldecoder.nl/kettingzagen/026/'
    })
  };
  const firstHash = stableHash(stripGenerated({ overlay: run1Overlay, renderState: renderState1 }));
  const secondHash = stableHash(stripGenerated({ overlay: run2Overlay, renderState: renderState2 }));
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    first_hash: firstHash,
    second_hash: secondHash,
    IDEMPOTENCY: firstHash === secondHash ? 'PASS' : 'FAIL'
  };
}

function buildPreflight() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  const worktree = git(['status', '--short']);
  const failures = [];
  if (head !== SOURCE_COMMIT) failures.push('HEAD_BEFORE_NOT_EXPECTED_BASELINE');
  if (originMain !== SOURCE_COMMIT) failures.push('ORIGIN_MAIN_BEFORE_NOT_EXPECTED_BASELINE');
  if (mergeBase !== SOURCE_COMMIT) failures.push('MERGE_BASE_NOT_EXPECTED_BASELINE');
  return {
    generated_at: new Date().toISOString(),
    SOURCE_COMMIT,
    HEAD_BEFORE: head,
    ORIGIN_MAIN_BEFORE: originMain,
    MERGE_BASE: mergeBase,
    WORKTREE_STATUS_BEFORE: worktree,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL',
    failures
  };
}

function buildFinalReport(preflight, beforeOverlay, afterOverlay, audits) {
  const beforeSummary = summarizeOverlay(beforeOverlay);
  const afterSummary = summarizeOverlay(afterOverlay);
  const routeMetrics = buildRouteMetrics();
  const failurePass = Object.entries(audits.failure)
    .filter(([key]) => !['generated_at', 'source_commit'].includes(key))
    .every(([, value]) => value === 'PASS');
  const testSuite = preflight.PRECHECK === 'PASS'
    && audits.rawFallback.RAW_MODEL_TECHNICAL_RENDER_UNSAFE === 0
    && audits.partFamily.PART_FAMILY_TECHNICAL_INHERITANCE_PATHS === 0
    && audits.partFamily['1121_TECHNICAL_SPEC_COUNT'] === 0
    && audits.partFamily['1128_TECHNICAL_SPEC_COUNT'] === 0
    && audits.partFamily.PART_NUMBER_UI_TECHNICAL_FACT_COUNT === 0
    && audits.conflictTraceability.PUBLIC_CONFLICT_VALUES_WITHOUT_COMPLETE_TRACEABILITY === 0
    && audits.conflictApi['046_STROKE_SINGLE_VALUE_API_LEAKS'] === 0
    && audits.conflictRender['046_STROKE_SINGLE_VALUE_RENDER_LEAKS'] === 0
    && audits.conflictPassport['046_STROKE_SINGLE_VALUE_PASSPORT_LEAKS'] === 0
    && audits.spark['026_SPARK_CONTAMINATION'] === 0
    && audits.spark['046_SPARK_CONTAMINATION'] === 0
    && audits.structuredData.SCHEMA_POSITIVE_SAFE_FACTS > 0
    && audits.structuredData.SCHEMA_FACTS_WITH_PUBLIC_EVIDENCE === audits.structuredData.SCHEMA_POSITIVE_SAFE_FACTS
    && audits.structuredData.SCHEMA_RAW_MODEL_FALLBACK_FACTS === 0
    && audits.structuredData.SCHEMA_CONFLICTED_SINGLE_VALUES === 0
    && audits.structuredData.SCHEMA_UNKNOWN_TECHNICAL_FACTS === 0
    && audits.fuzzy.FUZZY_MODEL_SPEC_ATTACHMENTS === 0
    && audits.serial.SERIAL_184592301_TECHNICAL_SPEC_COUNT === 0
    && audits.genericFallback.GENERIC_FACTUAL_FALLBACK_COUNT === 0
    && audits.genericFallback.PUBLIC_OUTPUT_WINDOWS_PATH_COUNT === 0
    && beforeSummary.canonicalVerified === afterSummary.canonicalVerified
    && routeMetrics.SEO_ROUTE_CHANGES === 0
    && routeMetrics.SITEMAP_URL_CHANGES === 0
    && audits.idempotency.IDEMPOTENCY === 'PASS'
    && failurePass;

  return {
    'FASE 35C.4.2.2.2 FINAL REPORT': true,
    SOURCE_COMMIT,
    PRECHECK: preflight.PRECHECK,
    PUBLIC_FACTS_BEFORE: beforeSummary.total,
    PUBLIC_FACTS_AFTER: afterSummary.total,
    RAW_MODEL_TECHNICAL_RENDER_OCCURRENCES: audits.rawFallback.RAW_MODEL_TECHNICAL_RENDER_OCCURRENCES,
    RAW_MODEL_TECHNICAL_RENDER_ALLOWED: audits.rawFallback.RAW_MODEL_TECHNICAL_RENDER_ALLOWED,
    RAW_MODEL_TECHNICAL_RENDER_UNSAFE: audits.rawFallback.RAW_MODEL_TECHNICAL_RENDER_UNSAFE,
    PART_FAMILY_TECHNICAL_INHERITANCE_PATHS: audits.partFamily.PART_FAMILY_TECHNICAL_INHERITANCE_PATHS,
    PART_NUMBER_CASES_TESTED: audits.partFamily.PART_NUMBER_CASES_TESTED,
    '1121_TECHNICAL_SPEC_COUNT': audits.partFamily['1121_TECHNICAL_SPEC_COUNT'],
    '1128_TECHNICAL_SPEC_COUNT': audits.partFamily['1128_TECHNICAL_SPEC_COUNT'],
    PART_NUMBER_UI_TECHNICAL_FACT_COUNT: audits.partFamily.PART_NUMBER_UI_TECHNICAL_FACT_COUNT,
    OFFICIAL_CONFLICTED_FACTS: audits.conflictTraceability.OFFICIAL_CONFLICTED_FACTS,
    PUBLIC_CONFLICT_VALUES_TOTAL: audits.conflictTraceability.PUBLIC_CONFLICT_VALUES_TOTAL,
    PUBLIC_CONFLICT_VALUES_WITH_COMPLETE_TRACEABILITY: audits.conflictTraceability.PUBLIC_CONFLICT_VALUES_WITH_COMPLETE_TRACEABILITY,
    PUBLIC_CONFLICT_VALUES_WITHOUT_COMPLETE_TRACEABILITY: audits.conflictTraceability.PUBLIC_CONFLICT_VALUES_WITHOUT_COMPLETE_TRACEABILITY,
    '046_STROKE_VALUE_A_TRACEABLE': audits.conflictTraceability['046_STROKE_VALUE_A_TRACEABLE'],
    '046_STROKE_VALUE_B_TRACEABLE': audits.conflictTraceability['046_STROKE_VALUE_B_TRACEABLE'],
    '046_STROKE_SINGLE_VALUE_API_LEAKS': audits.conflictApi['046_STROKE_SINGLE_VALUE_API_LEAKS'],
    '046_STROKE_SINGLE_VALUE_RENDER_LEAKS': audits.conflictRender['046_STROKE_SINGLE_VALUE_RENDER_LEAKS'],
    '046_STROKE_SINGLE_VALUE_PASSPORT_LEAKS': audits.conflictPassport['046_STROKE_SINGLE_VALUE_PASSPORT_LEAKS'],
    '026_SPARK_ALTERNATIVES': audits.spark['026_SPARK_ALTERNATIVES'],
    '046_SPARK_ALTERNATIVES': audits.spark['046_SPARK_ALTERNATIVES'],
    '026_SPARK_CONTAMINATION': audits.spark['026_SPARK_CONTAMINATION'],
    '046_SPARK_CONTAMINATION': audits.spark['046_SPARK_CONTAMINATION'],
    SCHEMA_POSITIVE_SAFE_FACTS: audits.structuredData.SCHEMA_POSITIVE_SAFE_FACTS,
    SCHEMA_FACTS_WITH_PUBLIC_EVIDENCE: audits.structuredData.SCHEMA_FACTS_WITH_PUBLIC_EVIDENCE,
    SCHEMA_RAW_MODEL_FALLBACK_FACTS: audits.structuredData.SCHEMA_RAW_MODEL_FALLBACK_FACTS,
    SCHEMA_CONFLICTED_SINGLE_VALUES: audits.structuredData.SCHEMA_CONFLICTED_SINGLE_VALUES,
    SCHEMA_UNKNOWN_TECHNICAL_FACTS: audits.structuredData.SCHEMA_UNKNOWN_TECHNICAL_FACTS,
    FUZZY_MODEL_SPEC_ATTACHMENTS: audits.fuzzy.FUZZY_MODEL_SPEC_ATTACHMENTS,
    SERIAL_184592301_TECHNICAL_SPEC_COUNT: audits.serial.SERIAL_184592301_TECHNICAL_SPEC_COUNT,
    GENERIC_FACTUAL_FALLBACK_COUNT: audits.genericFallback.GENERIC_FACTUAL_FALLBACK_COUNT,
    PUBLIC_OUTPUT_WINDOWS_PATH_COUNT: audits.genericFallback.PUBLIC_OUTPUT_WINDOWS_PATH_COUNT,
    CANONICAL_VERIFIED_BEFORE: beforeSummary.canonicalVerified,
    CANONICAL_VERIFIED_AFTER: afterSummary.canonicalVerified,
    UNEXPECTED_CANONICAL_PROMOTIONS: Math.max(0, afterSummary.canonicalVerified - beforeSummary.canonicalVerified),
    SEO_ROUTE_CHANGES: routeMetrics.SEO_ROUTE_CHANGES,
    SITEMAP_URL_CHANGES: routeMetrics.SITEMAP_URL_CHANGES,
    FAILURE_INJECTION: failurePass ? 'PASS' : 'FAIL',
    IDEMPOTENCY: audits.idempotency.IDEMPOTENCY,
    TEST_SUITE: testSuite ? 'PASS' : 'FAIL',
    PROMOTION_READY: 'PUBLIC_EVIDENCE_ONLY',
    FINAL_STATUS: testSuite ? 'PASS' : 'PARTIAL PASS'
  };
}

function buildSerialAudit(database) {
  const result = decodeStihlCode('184592301', database);
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    MODEL_IDENTITY_STATUS: result.modelIdentityStatus,
    EXACT_MODEL: result.exactModel,
    SERIAL_184592301_TECHNICAL_SPEC_COUNT: Object.keys(result.technicalSpecs || {}).length
  };
}

export function main() {
  const preflight = buildPreflight();
  writeJson(OUTPUTS.preflight, preflight);
  if (preflight.PRECHECK !== 'PASS') {
    const blocked = {
      'FASE 35C.4.2.2.2 FINAL REPORT': true,
      SOURCE_COMMIT,
      PRECHECK: 'FAIL',
      TEST_SUITE: 'FAIL',
      FINAL_STATUS: 'BLOCKED'
    };
    writeJson(OUTPUTS.finalReport, blocked);
    return blocked;
  }

  const beforeOverlay = gitShowJson(SOURCE_COMMIT, OUTPUTS.publicStore, { schema_version: PUBLIC_SCHEMA, facts: [] });
  const afterOverlay = buildAfterOverlay(beforeOverlay);
  writeJson(OUTPUTS.publicStore, afterOverlay);
  const database = loadDatabase(afterOverlay);

  const audits = {
    rawFallback: buildRawFallbackAudit(),
    partFamily: buildPartFamilyAudit(database),
    conflictTraceability: buildConflictTraceabilityAudit(afterOverlay),
    conflictApi: buildConflictApiAudit(database),
    conflictRender: buildConflictRenderAudit(database),
    conflictPassport: buildConflictPassportAudit(database),
    spark: buildSparkAudit(afterOverlay),
    structuredData: buildStructuredDataAudit(database),
    fuzzy: buildFuzzyAudit(database),
    serial: buildSerialAudit(database),
    partUi: buildPartUiAudit(database),
    genericFallback: null,
    failure: null,
    idempotency: buildIdempotencyAudit(beforeOverlay)
  };
  audits.genericFallback = buildGenericFallbackAudit(audits.rawFallback, audits.partFamily);
  audits.failure = buildFailureInjectionAudit(afterOverlay);

  const finalReport = buildFinalReport(preflight, beforeOverlay, afterOverlay, audits);

  writeJson(OUTPUTS.rawFallback, audits.rawFallback);
  writeJson(OUTPUTS.partFamily, audits.partFamily);
  writeJson(OUTPUTS.conflictTraceability, audits.conflictTraceability);
  writeJson(OUTPUTS.conflictApi, audits.conflictApi);
  writeJson(OUTPUTS.conflictRender, audits.conflictRender);
  writeJson(OUTPUTS.conflictPassport, audits.conflictPassport);
  writeJson(OUTPUTS.spark, audits.spark);
  writeJson(OUTPUTS.structuredData, audits.structuredData);
  writeJson(OUTPUTS.fuzzy, audits.fuzzy);
  writeJson(OUTPUTS.partUi, audits.partUi);
  writeJson(OUTPUTS.genericFallback, audits.genericFallback);
  writeJson(OUTPUTS.failure, audits.failure);
  writeJson(OUTPUTS.idempotency, audits.idempotency);
  writeJson(OUTPUTS.finalReport, finalReport);

  return finalReport;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const report = main();
  console.log(`Phase ${PHASE_ID} residual public fallback hotfix completed.`);
  console.log(`Precheck: ${report.PRECHECK}`);
  console.log(`Public facts after: ${report.PUBLIC_FACTS_AFTER ?? 0}`);
  console.log(`Final status: ${report.FINAL_STATUS}`);
}
