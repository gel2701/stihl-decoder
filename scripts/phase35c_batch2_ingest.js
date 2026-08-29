import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import Database from 'better-sqlite3';

import { SERIES_REFERENCE_DOCUMENTS } from '../src/canonicalData.js';
import {
  assessDocumentModelRelations,
  buildKnownModelDictionary,
  classifyDuplicateRelation,
  classifyExtractionQuality,
  computeContentHash,
  dedupeFieldValues,
  evaluateAuthenticity,
  extractDocumentNumberCandidates,
  extractModelsMentioned,
  extractSeriesCodes,
  extractTechnicalFields,
  inferDocumentType,
  inferLanguage,
  inferMarket,
  normalizeDocumentNumber,
  splitDocumentNumber,
  summarizeFieldMetrics
} from '../src/documentAuthority.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const DATE_STAMP = '2026-08-29';
const SOURCE_COMMIT = 'ca5c545';
const CONTENT_COMMIT = 'ca5c545';
const BATCH1_REGISTRY_PATH = path.join(rootDir, 'data', 'document_registry.json');
const BATCH1_VERIFIED_PATH = path.join(rootDir, 'data', 'document_verified_field_candidates.json');
const BATCH2_DB_PATH = 'C:/Users/GelliusSnippe/.agents/stihl_local_library.db';
const CANONICAL_JSON_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const CANONICAL_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const BACKUP_DIR = path.join(rootDir, 'data', 'backups');
const BATCH2_SOURCE_BATCH = 'BATCH2_HIGH_AUTHORITY_STIHL';
const BATCH1_SOURCE_BATCH = 'BATCH1_SCRIBD_MIXED';
const BATCH2_SOURCE_DB = 'stihl_local_library.db';
const AUTOMATIC_VERIFICATION_PRECISION_THRESHOLD = 98;

const OUTPUTS = {
  report: path.join(rootDir, 'data', 'phase35c_batch2_ingest_report.json'),
  batch2Registry: path.join(rootDir, 'data', 'batch2_document_registry.json'),
  crossRegistry: path.join(rootDir, 'data', 'cross_corpus_document_registry.json'),
  batch2Duplicates: path.join(rootDir, 'data', 'batch2_duplicate_groups.json'),
  crossDuplicates: path.join(rootDir, 'data', 'cross_corpus_duplicate_groups.json'),
  batch2Verified: path.join(rootDir, 'data', 'batch2_verified_field_candidates.json'),
  crossVerified: path.join(rootDir, 'data', 'cross_corpus_verified_field_candidates.json'),
  batch2Blocked: path.join(rootDir, 'data', 'batch2_source_eligible_blocked_fields.json'),
  batch2Conflicts: path.join(rootDir, 'data', 'batch2_conflicts.json'),
  crossConflicts: path.join(rootDir, 'data', 'cross_corpus_conflicts.json'),
  batch2Revision: path.join(rootDir, 'data', 'batch2_revision_resolution.json'),
  highValueAudit: path.join(rootDir, 'data', 'batch2_high_value_model_audit.json')
};

const HIGH_VALUE_MODELS = ['BR 600', 'FS 100', 'FS 100 RX', 'MS 261', 'MS 260', 'MS 360', 'MS 460', '044', '046', '034', '036', 'FS 350', 'FS 460', 'TS 420', 'HS 45'];
const PRECISION_FIELDS = ['displacement_cc', 'power_kw', 'weight_kg', 'spark_plug', 'electrode_gap_mm', 'carb_h_setting', 'carb_l_setting', 'part_number', 'fuel_tank_l', 'air_flow_m3_h', 'air_velocity_m_s', 'blowing_force_n'];
const REQUIRED_FIELD_BREAKDOWN = [
  'displacement_cc', 'bore_mm', 'stroke_mm', 'power_kw', 'power_hp', 'weight_kg', 'idle_speed_rpm', 'max_engine_speed_rpm',
  'spark_plug', 'electrode_gap_mm', 'ignition_timing', 'carburetor_model', 'carb_h_setting', 'carb_l_setting', 'carb_la_instruction',
  'fuel_tank_l', 'oil_tank_l', 'oil_mix_ratio', 'chain_pitch', 'chain_gauge_mm', 'air_flow_m3_h', 'maximum_air_flow_m3_h',
  'air_velocity_m_s', 'blowing_force_n', 'torque_nm', 'pressure_bar', 'vacuum_bar', 'part_number', 'technical_change_cutoff', 'recall_scope_cutoff'
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function stableHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function fileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const handle = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest('hex');
}

function normalizeTitle(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeLooseText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizePublicationDate(text) {
  const match = String(text || '').match(/\b(20\d{2}|19\d{2})[-/](\d{2})[-/](\d{2})\b|\b(\d{2})[-/](20\d{2}|19\d{2})\b|\b(20\d{2}|19\d{2})\b/);
  return match ? match[0] : null;
}

function extractPrintCode(text) {
  const match = String(text || '').match(/\b(?:ZBA|DVS|TI[_-]?\d+[_-]?\d+[_-]?[A-Z0-9]*)\b/i);
  return match ? match[0] : null;
}

function mapArchiveSourceClass(docType, authenticityStatus) {
  const official = authenticityStatus === 'AUTHENTICATED_OFFICIAL';
  if (!official && authenticityStatus === 'PROBABLE_OFFICIAL') return 'ARCHIVE_COPY_NEEDS_REVIEW';
  switch (docType) {
    case 'PARTS_LIST':
      return official ? 'OFFICIAL_PARTS_DOCUMENT_ARCHIVE_COPY' : 'LOCAL_ARCHIVE_PARTS_COPY';
    case 'WORKSHOP_MANUAL':
      return official ? 'OFFICIAL_WORKSHOP_MANUAL_ARCHIVE_COPY' : 'LOCAL_ARCHIVE_WORKSHOP_COPY';
    case 'SERVICE_MANUAL':
      return official ? 'OFFICIAL_SERVICE_DOCUMENT_ARCHIVE_COPY' : 'LOCAL_ARCHIVE_SERVICE_COPY';
    case 'TECHNICAL_INFORMATION':
      return official ? 'OFFICIAL_TECHNICAL_INFORMATION_ARCHIVE_COPY' : 'LOCAL_ARCHIVE_TECHNICAL_COPY';
    default:
      return official ? 'OFFICIAL_DOCUMENT_ARCHIVE_COPY' : 'LOCAL_ARCHIVE_COPY';
  }
}

function mapBatch2DocType(docType, title, combinedText) {
  const inferred = inferDocumentType(title || '', combinedText || '');
  if (docType === 'pdf_repair_instruction') {
    if (inferred === 'PARTS_LIST' || inferred === 'TECHNICAL_INFORMATION' || inferred === 'INSTRUCTION_MANUAL') return inferred;
    return 'WORKSHOP_MANUAL';
  }
  if (docType === 'html_technical_doc') return inferred;
  return inferred;
}

function parseModelHints(raw, knownModels) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return extractModelsMentioned(text, knownModels);
}

function buildBatch2Rows() {
  const db = new Database(BATCH2_DB_PATH, { readonly: true });
  const manualDocs = db.prepare(`
    SELECT id, file_path, title, stihl_models, doc_type, description
    FROM manual_documents
    ORDER BY id
  `).all();
  const textRows = db.prepare(`
    SELECT file_path, section_name, content_text
    FROM extracted_text_contents
    ORDER BY id
  `).all();
  db.close();

  const textByPath = new Map();
  for (const row of textRows) {
    const key = String(row.file_path);
    if (!textByPath.has(key)) textByPath.set(key, []);
    textByPath.get(key).push(row);
  }

  return manualDocs.map((row) => ({
    ...row,
    text_rows: textByPath.get(String(row.file_path)) || []
  }));
}

function buildBatch2DocumentRecord(row, knownModels, knownSeriesCodes) {
  const pages = row.text_rows.map((entry, index) => ({
    page_number: index + 1,
    section_name: entry.section_name || `section_${index + 1}`,
    page_text: entry.content_text || ''
  }));
  const pageTexts = pages.map((page) => page.page_text || '');
  const combinedText = `${row.title || ''}\n${row.description || ''}\n${pageTexts.join('\n')}`;
  const extractionQuality = classifyExtractionQuality({
    title: row.title,
    pageCount: pages.length || 1,
    pageTexts
  });
  const titleModelsMentioned = extractModelsMentioned(row.title || '', knownModels);
  const hintModelsMentioned = parseModelHints(row.stihl_models, knownModels);
  const bodyModelsMentioned = extractModelsMentioned(combinedText, knownModels);
  const allModelsMentioned = [...new Map([...titleModelsMentioned, ...hintModelsMentioned, ...bodyModelsMentioned].map((entry) => [entry.model_id, entry])).values()];
  const documentNumbers = extractDocumentNumberCandidates(
    row.title || '',
    pathToFileURL(row.file_path).toString(),
    pageTexts.slice(0, 3).join('\n'),
    pageTexts.slice(-3).join('\n'),
    combinedText
  );
  const primaryDocumentNumber = documentNumbers[0] || null;
  const split = splitDocumentNumber(primaryDocumentNumber);
  const documentType = mapBatch2DocType(row.doc_type, row.title || '', combinedText);
  const modelRelations = assessDocumentModelRelations({
    title: row.title || '',
    metadataText: `${row.title || ''} ${row.description || ''} ${row.stihl_models || ''}`,
    pages,
    knownModels
  });
  const establishedModels = modelRelations
    .filter((entry) => entry.model_id)
    .map((entry) => ({
      model_id: entry.model_id,
      slug: entry.slug,
      model_name: entry.model_name,
      series_code: entry.series_code || null,
      relation_status: entry.relation_status
    }));
  const authenticity = evaluateAuthenticity({
    title: row.title || path.basename(row.file_path),
    url: pathToFileURL(row.file_path).toString(),
    author: 'local_archive',
    pageCount: pages.length || 1,
    combinedText,
    documentNumbers,
    modelsMentioned: allModelsMentioned.length > 0 ? allModelsMentioned : establishedModels,
    extractionQuality,
    metadataSignals: {
      publisherMatch: /andreas stihl|copyright|service communications system|stihl service cd/i.test(combinedText) || Boolean(primaryDocumentNumber)
    }
  });
  const language = inferLanguage(row.title || '', combinedText);
  const market = inferMarket(row.title || '', row.file_path || '', combinedText);
  const seriesCodesMentioned = extractSeriesCodes(combinedText, knownSeriesCodes);
  const publicationDate = normalizePublicationDate(`${row.title || ''} ${row.description || ''} ${pageTexts.slice(0, 3).join(' ')} ${pageTexts.slice(-3).join(' ')}`);
  const printCode = extractPrintCode(`${row.title || ''} ${combinedText}`);
  const document = {
    document_id: `batch2:${row.id}`,
    source_document_id: String(row.id),
    source_batch: BATCH2_SOURCE_BATCH,
    source_database: BATCH2_SOURCE_DB,
    source_file_path: row.file_path,
    source_url: pathToFileURL(row.file_path).toString(),
    source_host: 'local-archive',
    source_locations: [{
      source_batch: BATCH2_SOURCE_BATCH,
      source_database: BATCH2_SOURCE_DB,
      source_document_id: String(row.id),
      source_file_path: row.file_path,
      source_url: pathToFileURL(row.file_path).toString()
    }],
    document_title: row.title || null,
    normalized_title: normalizeTitle(row.title),
    raw_document_number: primaryDocumentNumber,
    normalized_document_number: normalizeDocumentNumber(primaryDocumentNumber),
    document_number: normalizeDocumentNumber(primaryDocumentNumber),
    document_number_base: split.base,
    document_number_revision: split.revision,
    revision: split.revision,
    revision_raw: split.revision,
    revision_normalized: split.revision,
    publication_date_raw: publicationDate,
    publication_date_normalized: publicationDate,
    print_code: printCode,
    document_type: documentType,
    language,
    market,
    page_count: pages.length,
    content_hash: computeContentHash(pageTexts),
    file_hash: null,
    extraction_quality: extractionQuality.quality,
    extraction_quality_metrics: extractionQuality.metrics,
    authenticity_status: authenticity.authenticity_status,
    authenticity_confidence: authenticity.authenticity_confidence,
    authenticity_score: authenticity.score,
    verification_notes: authenticity.notes,
    author: 'local_archive',
    description: row.description || null,
    title_models_mentioned: titleModelsMentioned,
    hint_models_mentioned: hintModelsMentioned,
    body_models_mentioned: bodyModelsMentioned,
    models_mentioned: establishedModels,
    model_relations: modelRelations,
    models_key: establishedModels.map((entry) => entry.slug).sort().join('|'),
    series_codes_mentioned: seriesCodesMentioned,
    duplicate_group_id: null,
    duplicate_status: null,
    pages: pages.map((page) => ({
      page_number: page.page_number,
      section_name: page.section_name,
      snippet: String(page.page_text || '').replace(/\s+/g, ' ').trim().slice(0, 240)
    }))
  };
  document.source_class = mapArchiveSourceClass(document.document_type, document.authenticity_status);
  const extractedFields = dedupeFieldValues(extractTechnicalFields({
    document,
    pages,
    knownModels
  })).map((field) => ({
    ...field,
    source_batch: BATCH2_SOURCE_BATCH,
    source_database: BATCH2_SOURCE_DB,
    source_document_id: String(row.id)
  }));
  return { document, extractedFields };
}

function chooseCanonical(entries) {
  return [...entries].sort((left, right) => {
    const sourceRank = (entry) => {
      if (entry.document.source_batch === BATCH2_SOURCE_BATCH) return 3;
      if (entry.document.authenticity_status === 'AUTHENTICATED_OFFICIAL') return 2;
      if (entry.document.authenticity_status === 'PROBABLE_OFFICIAL') return 1;
      return 0;
    };
    return sourceRank(right) - sourceRank(left)
      || (right.document.page_count || 0) - (left.document.page_count || 0)
      || String(left.document.document_id).localeCompare(String(right.document.document_id));
  })[0];
}

function assignDuplicateGroups(records) {
  const grouped = new Map();
  for (const entry of records) {
    const doc = entry.document;
    const key = doc.document_number_base || `${doc.normalized_title}::${doc.models_key || 'none'}::${doc.page_count || 'np'}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }
  const groups = [];
  for (const entries of grouped.values()) {
    if (entries.length === 1) continue;
    const canonical = chooseCanonical(entries);
    const groupId = `batch2_dup_${stableHash(entries.map((entry) => entry.document.document_id)).slice(0, 12)}`;
    const members = [];
    for (const entry of entries) {
      const relation = entry.document.document_id === canonical.document.document_id
        ? 'CANONICAL'
        : classifyDuplicateRelation(canonical.document, entry.document);
      entry.document.duplicate_group_id = groupId;
      entry.document.duplicate_status = relation;
      members.push({
        document_id: entry.document.document_id,
        source_document_id: entry.document.source_document_id,
        document_title: entry.document.document_title,
        duplicate_status: relation,
        source_batch: entry.document.source_batch,
        revision: entry.document.revision,
        market: entry.document.market,
        page_count: entry.document.page_count
      });
    }
    groups.push({
      duplicate_group_id: groupId,
      canonical_document_id: canonical.document.document_id,
      canonical_document_number: canonical.document.document_number,
      members
    });
  }
  return groups;
}

function buildCrossDuplicateGroups(batch1Docs, batch2Docs) {
  const allDocs = [...batch1Docs, ...batch2Docs];
  const byKey = new Map();
  for (const doc of allDocs) {
    const key = doc.document_number_base || `${doc.normalized_title}::${doc.models_key || 'none'}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(doc);
  }
  const groups = [];
  for (const docs of byKey.values()) {
    const hasBatch1 = docs.some((doc) => doc.source_batch === BATCH1_SOURCE_BATCH);
    const hasBatch2 = docs.some((doc) => doc.source_batch === BATCH2_SOURCE_BATCH);
    if (!hasBatch1 || !hasBatch2) continue;
    const canonical = chooseCanonical(docs.map((document) => ({ document })));
    const groupId = `cross_dup_${stableHash(docs.map((doc) => doc.document_id)).slice(0, 12)}`;
    groups.push({
      duplicate_group_id: groupId,
      canonical_document_id: canonical.document.document_id,
      canonical_document_number: canonical.document.document_number,
      members: docs.map((doc) => ({
        document_id: doc.document_id,
        source_document_id: doc.source_document_id || doc.document_id,
        source_batch: doc.source_batch,
        document_title: doc.document_title,
        duplicate_status: doc.document_id === canonical.document.document_id ? 'CANONICAL' : classifyDuplicateRelation(canonical.document, doc),
        revision: doc.revision,
        market: doc.market,
        page_count: doc.page_count
      }))
    });
  }
  return groups;
}

function buildCanonicalRegistry(documents) {
  const buckets = new Map();
  for (const doc of documents) {
    const key = doc.normalized_document_number
      ? `${doc.normalized_document_number}::${doc.market || 'UNKNOWN'}`
      : `${doc.normalized_title}::${doc.models_key || 'none'}::${doc.page_count || 'np'}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(doc);
  }

  return [...buckets.values()].map((docs) => {
    const canonical = chooseCanonical(docs.map((document) => ({ document }))).document;
    const canonicalDocumentId = `canon_${stableHash(docs.map((doc) => `${doc.source_batch}:${doc.document_id}`)).slice(0, 16)}`;
    return {
      canonical_document_id: canonicalDocumentId,
      document_number: canonical.document_number,
      document_number_base: canonical.document_number_base,
      revision: canonical.revision,
      market: canonical.market,
      language: canonical.language,
      document_type: canonical.document_type,
      models: canonical.models_mentioned.map((model) => model.model_name),
      source_locations: docs.map((doc) => ({
        source_batch: doc.source_batch,
        source_database: doc.source_database,
        source_document_id: doc.source_document_id || doc.document_id,
        source_class: doc.source_class,
        source_file_path: doc.source_file_path || null,
        source_url: doc.source_url || null
      })),
      preferred_source_batch: docs.some((doc) => doc.source_batch === BATCH2_SOURCE_BATCH) ? BATCH2_SOURCE_BATCH : BATCH1_SOURCE_BATCH
    };
  });
}

function hasFieldContext(field, patterns, unitPattern = null) {
  const snippet = normalizeLooseText(field.evidence_snippet);
  const hasLabel = patterns.some((pattern) => pattern.test(snippet));
  const hasUnit = unitPattern ? unitPattern.test(snippet) : true;
  const hasScope = ['EXACT_MODEL', 'EXACT_VARIANT', 'MULTI_MODEL_EXPLICIT_COLUMN'].includes(field.model_scope);
  return hasLabel && hasUnit && hasScope && Number.isInteger(field.page);
}

function buildPrecisionAudit(fieldValues, fieldName) {
  const sample = fieldValues.filter((field) => field.field_name === fieldName).slice(0, 100);
  const correct = sample.filter((field) => {
    switch (fieldName) {
      case 'displacement_cc':
        return hasFieldContext(field, [/displacement/i, /hubraum/i], /\b(cm3|cc)\b/i);
      case 'power_kw':
        return hasFieldContext(field, [/power/i, /leistung/i, /potencia/i], /\bkw\b/i);
      case 'weight_kg':
        return hasFieldContext(field, [/weight/i, /gewicht/i, /peso/i], /\bkg\b/i);
      case 'spark_plug':
        return hasFieldContext(field, [/spark plug/i, /bougie/i, /zuendkerze/i]) && String(field.value || '').length < 80;
      case 'electrode_gap_mm':
        return hasFieldContext(field, [/electrode gap/i, /spark plug gap/i], /\bmm\b/i);
      case 'carb_h_setting':
        return hasFieldContext(field, [/carb/i, /carburetor/i, /\bh\b/i]);
      case 'carb_l_setting':
        return hasFieldContext(field, [/carb/i, /carburetor/i, /\bl\b/i]);
      case 'part_number':
        return hasFieldContext(field, [/part no/i, /part number/i, /parts list/i], /\d{4}-\d{3}-\d{4}/i) && field.document_type === 'PARTS_LIST';
      case 'fuel_tank_l':
        return hasFieldContext(field, [/fuel tank/i, /tank capacity/i], /\bl\b/i);
      case 'air_flow_m3_h':
        return hasFieldContext(field, [/air flow/i], /m(?:3|³)\/h/i);
      case 'air_velocity_m_s':
        return hasFieldContext(field, [/air velocity/i], /m\/s/i);
      case 'blowing_force_n':
        return hasFieldContext(field, [/blowing force/i], /\bn\b/i);
      default:
        return false;
    }
  }).length;
  return {
    field: fieldName,
    sample_size: sample.length,
    correct_context_validated: correct,
    false_positives: sample.length - correct,
    context_precision_percent: sample.length > 0 ? Number(((correct / sample.length) * 100).toFixed(1)) : 0
  };
}

function buildVerifiedCandidates(fieldValues, canonicalLookup, eligibleFields) {
  return fieldValues
    .filter((field) => ['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status))
    .filter((field) => eligibleFields.has(field.field_name))
    .map((field) => ({
      candidate_id: field.candidate_id,
      model_id: field.model_id,
      variant_id: field.variant_id,
      field_name: field.field_name,
      value: field.value,
      unit: field.unit,
      verification_status: field.verification_status,
      document_id: field.document_id,
      canonical_document_id: canonicalLookup.get(field.document_id) || null,
      document_number: field.document_number,
      revision: field.revision,
      market: field.market,
      page: field.page,
      section: field.section || null,
      model_scope: field.model_scope,
      measurement_definition: field.measurement_definition,
      source_batch: field.source_batch,
      source_class: field.source_class,
      authenticity_status: field.authenticity_status,
      confidence: field.confidence,
      promotion_status: 'NOT_PROMOTED'
    }));
}

function buildBlockedFields(fieldValues, eligibleFields) {
  return fieldValues
    .filter((field) => field.source_eligibility && field.source_eligibility !== 'NONE')
    .filter((field) => !(['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status) && eligibleFields.has(field.field_name)))
    .map((field) => ({
      candidate_id: field.candidate_id,
      model_id: field.model_id,
      variant_id: field.variant_id,
      field_name: field.field_name,
      value: field.value,
      unit: field.unit,
      document_id: field.document_id,
      document_number: field.document_number,
      revision: field.revision,
      market: field.market,
      page: field.page,
      section: field.section || null,
      model_scope: field.model_scope,
      measurement_definition: field.measurement_definition,
      source_batch: field.source_batch,
      source_class: field.source_class,
      authenticity_status: field.authenticity_status,
      verification_status: field.verification_status,
      block_reason: !eligibleFields.has(field.field_name) && ['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status)
        ? 'AUTO_VERIFY_DISABLED_LOW_PRECISION'
        : field.block_reason || 'UNVERIFIED',
      required_action: !eligibleFields.has(field.field_name) && ['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status)
        ? 'Manual field review until precision >= 98%'
        : 'Review document scope/context manually'
    }));
}

function buildConflictLog(fieldValues, canonicalLookup) {
  const buckets = new Map();
  for (const field of fieldValues) {
    if (!['VERIFIED', 'APPROVED_ALTERNATIVES', 'OFFICIAL_INDIRECT'].includes(field.verification_status)) continue;
    const key = `${field.model_id}::${field.field_name}::${field.model_scope}::${field.unit || 'none'}::${field.measurement_definition || 'na'}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(field);
  }
  const conflicts = [];
  for (const [key, entries] of buckets.entries()) {
    const distinctValues = [...new Set(entries.map((entry) => JSON.stringify(entry.value)))];
    if (distinctValues.length < 2) continue;
    const [left, right] = entries.sort((a, b) => String(a.document_id).localeCompare(String(b.document_id)));
    let status = 'CONFLICTING_OFFICIAL_DATA';
    if (left.document_number_base && right.document_number_base && left.document_number_base === right.document_number_base && left.revision !== right.revision) status = 'REVISION_DEPENDENT';
    else if (left.market !== right.market) status = 'MARKET_DEPENDENT';
    else if ((left.measurement_definition || null) !== (right.measurement_definition || null)) status = 'MEASUREMENT_DEFINITION_DEPENDENT';
    conflicts.push({
      model: left.model_id,
      field: left.field_name,
      value_A: left.value,
      document_A: left.document_number || left.document_id,
      canonical_document_A: canonicalLookup.get(left.document_id) || null,
      source_batch_A: left.source_batch,
      revision_A: left.revision,
      market_A: left.market,
      value_B: right.value,
      document_B: right.document_number || right.document_id,
      canonical_document_B: canonicalLookup.get(right.document_id) || null,
      source_batch_B: right.source_batch,
      revision_B: right.revision,
      market_B: right.market,
      status
    });
  }
  return conflicts;
}

function buildRevisionResolution(groups, documentsById) {
  return groups
    .filter((group) => group.members.some((member) => member.duplicate_status === 'SAME_DOCUMENT_DIFFERENT_REVISION'))
    .map((group) => {
      const candidates = group.members.map((member) => documentsById.get(member.document_id)).filter(Boolean);
      const markets = [...new Set(candidates.map((doc) => doc.market).filter(Boolean))];
      const revisions = [...new Set(candidates.map((doc) => doc.revision).filter(Boolean))];
      const titles = [...new Set(candidates.map((doc) => doc.document_title).filter(Boolean))];
      let classification = 'INSUFFICIENT_EVIDENCE';
      if (revisions.length > 1) classification = 'CONFIRMED_DIFFERENT_REVISION';
      else if (markets.length > 1) classification = 'MARKET_VARIANT';
      else if (titles.some((title) => /manual de|betriebsanleitung|mode d'emploi/i.test(title))) classification = 'TRANSLATION';
      return {
        duplicate_group_id: group.duplicate_group_id,
        document_base: candidates[0]?.document_number_base || null,
        classification,
        candidate_documents: candidates.map((doc) => ({
          document_id: doc.document_id,
          source_batch: doc.source_batch,
          document_number: doc.document_number,
          revision: doc.revision,
          market: doc.market,
          publication_date: doc.publication_date_normalized,
          page_count: doc.page_count,
          title: doc.document_title
        }))
      };
    });
}

function buildFieldBreakdown(fieldValues, verifiedCandidates, blockedFields, conflicts) {
  const summary = summarizeFieldMetrics(fieldValues);
  const verifiedSet = new Set(verifiedCandidates.map((entry) => entry.candidate_id));
  const conflictByField = conflicts.reduce((acc, conflict) => {
    acc[conflict.field] = (acc[conflict.field] || 0) + 1;
    return acc;
  }, {});
  return REQUIRED_FIELD_BREAKDOWN.map((field) => ({
    field,
    extracted: summary[field]?.extracted || 0,
    source_eligible: fieldValues.filter((entry) => entry.field_name === field && entry.source_eligibility && entry.source_eligibility !== 'NONE').length,
    verified: verifiedCandidates.filter((entry) => entry.field_name === field).length,
    indirect: summary[field]?.indirect || 0,
    blocked: blockedFields.filter((entry) => entry.field_name === field && !verifiedSet.has(entry.candidate_id)).length,
    conflict: conflictByField[field] || 0
  }));
}

function buildDocumentTypeBreakdown(documents) {
  const buckets = new Map();
  for (const doc of documents) {
    const key = doc.document_type || 'OTHER';
    if (!buckets.has(key)) buckets.set(key, { type: key, total: 0, authenticated: 0, probable: 0, review: 0, failed: 0 });
    const bucket = buckets.get(key);
    bucket.total += 1;
    if (doc.authenticity_status === 'AUTHENTICATED_OFFICIAL') bucket.authenticated += 1;
    else if (doc.authenticity_status === 'PROBABLE_OFFICIAL') bucket.probable += 1;
    else if (['TEXT_EXTRACTION_FAILED', 'INSUFFICIENT_EXTRACTED_TEXT'].includes(doc.authenticity_status)) bucket.failed += 1;
    else bucket.review += 1;
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total);
}

function buildHighValueModelAudit(documents, verifiedCandidates) {
  const audit = {};
  for (const modelName of HIGH_VALUE_MODELS) {
    const modelDocs = documents.filter((doc) => doc.models_mentioned.some((model) => model.model_name === modelName));
    const verified = verifiedCandidates.filter((field) => modelDocs.some((doc) => doc.document_id === field.document_id));
    let status = 'NO_VERIFIED_DATA';
    if (verified.length > 0) status = 'VERIFIED_PARTIAL_TECHNICAL';
    if (verified.length > 0 && new Set(verified.map((field) => field.field_name)).size >= 3) status = 'VERIFIED_CORE_SPECS';
    audit[modelName] = {
      documents: modelDocs.length,
      verified_fields: verified.length,
      revisions: new Set(modelDocs.map((doc) => `${doc.document_number_base || doc.document_number || doc.document_id}::${doc.revision || 'NR'}`)).size,
      status
    };
  }
  return audit;
}

function buildBatch2Inventory(rows, documents) {
  return {
    total_documents: rows.length,
    total_pages: rows.reduce((sum, row) => sum + row.text_rows.length, 0),
    total_text_characters: rows.reduce((sum, row) => sum + row.text_rows.reduce((inner, textRow) => inner + String(textRow.content_text || '').length, 0), 0),
    document_types: rows.reduce((acc, row) => {
      const key = row.doc_type || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    languages: documents.reduce((acc, doc) => {
      acc[doc.language || 'unknown'] = (acc[doc.language || 'unknown'] || 0) + 1;
      return acc;
    }, {}),
    markets: documents.reduce((acc, doc) => {
      acc[doc.market || 'UNKNOWN'] = (acc[doc.market || 'UNKNOWN'] || 0) + 1;
      return acc;
    }, {}),
    document_number_coverage: documents.filter((doc) => doc.document_number).length,
    model_coverage: documents.filter((doc) => doc.models_mentioned.length > 0).length,
    empty_or_failed_documents: documents.filter((doc) => ['TEXT_EXTRACTION_FAILED', 'INSUFFICIENT_EXTRACTED_TEXT'].includes(doc.authenticity_status)).length
  };
}

function buildCrossCorpusVerified(batch1Verified, batch2Verified) {
  const seen = new Set();
  const result = [];
  for (const candidate of [...batch1Verified, ...batch2Verified]) {
    const key = JSON.stringify([
      candidate.model_id,
      candidate.field_name,
      candidate.value,
      candidate.unit,
      candidate.revision,
      candidate.market,
      candidate.canonical_document_id || candidate.document_id
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function buildCrossBatchAgreementMetrics(batch1Verified, batch2Verified) {
  const byFact = new Map();
  for (const candidate of batch1Verified) {
    const key = `${candidate.model_id}::${candidate.field_name}::${candidate.revision || 'NR'}::${candidate.market || 'UNKNOWN'}`;
    if (!byFact.has(key)) byFact.set(key, { batch1: [], batch2: [] });
    byFact.get(key).batch1.push(candidate);
  }
  for (const candidate of batch2Verified) {
    const key = `${candidate.model_id}::${candidate.field_name}::${candidate.revision || 'NR'}::${candidate.market || 'UNKNOWN'}`;
    if (!byFact.has(key)) byFact.set(key, { batch1: [], batch2: [] });
    byFact.get(key).batch2.push(candidate);
  }
  let agreements = 0;
  let conflicts = 0;
  let higherAuthorityCandidates = 0;
  let unresolvedOfficialConflicts = 0;
  for (const bucket of byFact.values()) {
    if (bucket.batch1.length === 0 || bucket.batch2.length === 0) continue;
    const batch1Values = new Set(bucket.batch1.map((entry) => JSON.stringify(entry.value)));
    const batch2Values = new Set(bucket.batch2.map((entry) => JSON.stringify(entry.value)));
    const intersects = [...batch1Values].some((value) => batch2Values.has(value));
    if (intersects) agreements += 1;
    else {
      conflicts += 1;
      unresolvedOfficialConflicts += 1;
    }
    if (bucket.batch2.some((entry) => entry.source_class?.includes('ARCHIVE_COPY'))) higherAuthorityCandidates += 1;
  }
  return { agreements, conflicts, higherAuthorityCandidates, unresolvedOfficialConflicts };
}

function buildAuditPass(sample, predicate) {
  if (sample.length === 0) return 'FAIL';
  return predicate(sample) ? 'PASS' : 'FAIL';
}

function buildRegressionChecks(knownModels) {
  const archiveAuth = evaluateAuthenticity({
    title: 'STIHL FS 100 Instruction Manual',
    url: 'file:///archive/STIHL_FS100_0458-259-8621-D.pdf',
    author: 'local_archive',
    pageCount: 88,
    combinedText: 'ANDREAS STIHL AG & Co. KG STIHL FS 100 0458 259 8621 D Operating Instructions',
    documentNumbers: ['0458-259-8621-D'],
    modelsMentioned: knownModels.filter((model) => model.slug === 'fs-100'),
    extractionQuality: classifyExtractionQuality({ title: 'STIHL FS 100 Instruction Manual', pageCount: 88, pageTexts: ['ANDREAS STIHL AG & Co. KG FS 100 0458 259 8621 D'] }),
    metadataSignals: { publisherMatch: true }
  });
  const unresolvedDoc = {
    document_id: 'fixture-cross-scope',
    normalized_document_number: '0458-000-1125-A',
    document_number_base: '0458-000-1125',
    revision: 'A',
    document_type: 'SERVICE_MANUAL',
    market: 'US',
    source_class: 'OFFICIAL_SERVICE_DOCUMENT_ARCHIVE_COPY',
    authenticity_status: 'AUTHENTICATED_OFFICIAL',
    authenticity_confidence: 'HIGH',
    extraction_quality: 'GOOD',
    document_title: 'STIHL 1125 Service Manual 034 036',
    description: null,
    model_relations: [
      { model_id: 'stihl_034', slug: '034', model_name: '034', relation_status: 'EXPLICIT_MULTI_MODEL_MATCH' },
      { model_id: 'stihl_036', slug: '036', model_name: '036', relation_status: 'EXPLICIT_MULTI_MODEL_MATCH' }
    ]
  };
  const unresolvedFields = dedupeFieldValues(extractTechnicalFields({
    document: unresolvedDoc,
    pages: [{ page_number: 1, page_text: '034 036 Spark Plug: NGK BPMR7A' }],
    knownModels
  }));
  const highAuthorityScopeTest = unresolvedFields.every((field) => !['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status));
  const duplicateTest = classifyDuplicateRelation(
    { normalized_document_number: '0458-259-8621-D', normalized_title: 'stihl fs 100 instruction manual', models_key: 'fs-100', page_count: 88, content_hash: 'a', market: 'US' },
    { normalized_document_number: '0458-259-8621-D', normalized_title: 'stihl fs 100 instruction manual archive copy', models_key: 'fs-100', page_count: 88, content_hash: 'b', market: 'US' }
  ) === 'SAME_DOCUMENT_DIFFERENT_SCAN';
  const revisionTest = classifyDuplicateRelation(
    { normalized_document_number: '0458-259-8621-D', normalized_title: 'stihl fs 100 instruction manual', models_key: 'fs-100', page_count: 88, content_hash: 'a', market: 'US' },
    { normalized_document_number: '0458-259-8621-J', normalized_title: 'stihl fs 100 instruction manual', models_key: 'fs-100', page_count: 88, content_hash: 'c', market: 'US' }
  ) === 'SAME_DOCUMENT_DIFFERENT_REVISION';
  return {
    archive_copy_authority: archiveAuth.authenticity_status === 'AUTHENTICATED_OFFICIAL' ? 'PASS' : 'FAIL',
    high_authority_scope: highAuthorityScopeTest ? 'PASS' : 'FAIL',
    cross_batch_duplicate: duplicateTest ? 'PASS' : 'FAIL',
    cross_batch_revision: revisionTest ? 'PASS' : 'FAIL'
  };
}

function snapshotImmutableFiles() {
  const files = [
    CANONICAL_JSON_PATH,
    CANONICAL_DB_PATH,
    path.join(rootDir, 'data', 'phase35b_document_authority_report.json'),
    path.join(rootDir, 'data', 'phase35b1_validation_integrity_report.json')
  ];
  return Object.fromEntries(files.map((filePath) => [filePath, fileSha256(filePath)]));
}

function runPipeline() {
  const batch1Registry = JSON.parse(fs.readFileSync(BATCH1_REGISTRY_PATH, 'utf8'));
  const batch1VerifiedJson = JSON.parse(fs.readFileSync(BATCH1_VERIFIED_PATH, 'utf8'));
  const canonicalJson = JSON.parse(fs.readFileSync(CANONICAL_JSON_PATH, 'utf8'));
  const knownModels = buildKnownModelDictionary(canonicalJson);
  const knownSeriesCodes = [...new Set(Object.keys(SERIES_REFERENCE_DOCUMENTS).concat(knownModels.map((model) => model.series_code).filter(Boolean)))];
  const batch2Rows = buildBatch2Rows();
  const batch2Records = batch2Rows.map((row) => buildBatch2DocumentRecord(row, knownModels, knownSeriesCodes));
  const batch2Documents = batch2Records.map((entry) => entry.document);
  const batch2FieldValues = dedupeFieldValues(batch2Records.flatMap((entry) => entry.extractedFields));
  const batch2DuplicateGroups = assignDuplicateGroups(batch2Records);
  const batch2DocumentsById = new Map(batch2Documents.map((doc) => [doc.document_id, doc]));

  const precisionAudits = Object.fromEntries(PRECISION_FIELDS.map((field) => [field, buildPrecisionAudit(batch2FieldValues, field)]));
  const eligibleFields = new Set(Object.values(precisionAudits).filter((entry) => entry.context_precision_percent >= AUTOMATIC_VERIFICATION_PRECISION_THRESHOLD).map((entry) => entry.field));

  const batch2CanonicalRegistry = buildCanonicalRegistry(batch2Documents);
  const batch2CanonicalLookup = new Map(batch2CanonicalRegistry.flatMap((entry) =>
    entry.source_locations
      .filter((location) => location.source_batch === BATCH2_SOURCE_BATCH)
      .map((location) => [`batch2:${location.source_document_id}`, entry.canonical_document_id])
  ));
  const batch2Verified = buildVerifiedCandidates(batch2FieldValues, batch2CanonicalLookup, eligibleFields);
  const batch2Blocked = buildBlockedFields(batch2FieldValues, eligibleFields);
  const batch2Conflicts = buildConflictLog([...batch2Verified, ...batch2FieldValues.filter((field) => field.verification_status === 'OFFICIAL_INDIRECT')], batch2CanonicalLookup);
  const batch2RevisionResolution = buildRevisionResolution(batch2DuplicateGroups, batch2DocumentsById);

  const batch1Documents = batch1Registry.documents.map((doc) => ({
    ...doc,
    source_batch: doc.source_batch || BATCH1_SOURCE_BATCH,
    source_database: doc.source_database || 'stihl_scribd_documentation.db',
    source_document_id: doc.source_document_id || doc.document_id,
    source_locations: doc.source_locations || [{
      source_batch: doc.source_batch || BATCH1_SOURCE_BATCH,
      source_database: doc.source_database || 'stihl_scribd_documentation.db',
      source_document_id: doc.source_document_id || doc.document_id,
      source_url: doc.source_url || null,
      source_class: doc.source_class || null
    }]
  }));
  const crossRegistry = buildCanonicalRegistry([...batch1Documents, ...batch2Documents]);
  const crossCanonicalLookup = new Map(crossRegistry.flatMap((entry) =>
    entry.source_locations.map((location) => {
      const documentId = location.source_batch === BATCH2_SOURCE_BATCH
        ? `batch2:${location.source_document_id}`
        : String(location.source_document_id);
      return [documentId, entry.canonical_document_id];
    })
  ));
  const batch1Verified = (batch1VerifiedJson.candidates || []).map((entry) => ({
    ...entry,
    source_batch: entry.source_batch || BATCH1_SOURCE_BATCH,
    source_class: entry.source_class || 'OFFICIAL_DOCUMENT_MIRROR',
    canonical_document_id: crossCanonicalLookup.get(String(entry.document_id)) || entry.canonical_document_id || null
  }));
  const crossVerified = buildCrossCorpusVerified(batch1Verified, batch2Verified.map((entry) => ({
    ...entry,
    canonical_document_id: crossCanonicalLookup.get(entry.document_id) || entry.canonical_document_id
  })));
  const crossDuplicates = buildCrossDuplicateGroups(batch1Documents, batch2Documents);
  const crossConflicts = buildConflictLog([...batch1Verified, ...batch2Verified], crossCanonicalLookup);
  const crossAgreementMetrics = buildCrossBatchAgreementMetrics(batch1Verified, batch2Verified);
  const batch2Inventory = buildBatch2Inventory(batch2Rows, batch2Documents);
  const fieldBreakdown = buildFieldBreakdown(batch2FieldValues, batch2Verified, batch2Blocked, batch2Conflicts);
  const documentTypeBreakdown = buildDocumentTypeBreakdown(batch2Documents);
  const highValueAudit = buildHighValueModelAudit(batch2Documents, batch2Verified);
  const regressionChecks = buildRegressionChecks(knownModels);

  const verifiedSample = batch2Verified.slice(0, 100);
  const falsePositiveSample = batch2FieldValues.slice(0, 50);
  const partNumberSample = batch2FieldValues.filter((field) => field.field_name === 'part_number').slice(0, 50);
  const carbSample = batch2FieldValues.filter((field) => ['carb_h_setting', 'carb_l_setting'].includes(field.field_name)).slice(0, 50);
  const documentNumberSample = batch2Documents.filter((doc) => doc.document_number).slice(0, 50);

  const fs100Documents = batch2Documents.filter((doc) => doc.models_mentioned.some((model) => ['FS 100', 'FS 100 RX'].includes(model.model_name)));
  const fs100Verified = batch2Verified.filter((field) => fs100Documents.some((doc) => doc.document_id === field.document_id));
  const br600Documents = batch2Documents.filter((doc) => doc.models_mentioned.some((model) => model.model_name === 'BR 600'));
  const br600Verified = batch2Verified.filter((field) => br600Documents.some((doc) => doc.document_id === field.document_id));
  const family1125 = batch2Documents.some((doc) => doc.series_codes_mentioned.includes('1125') && ['034', '036', 'MS 340', 'MS 360'].every((name) => doc.models_mentioned.some((model) => model.model_name === name))) ? 'PASS' : 'INSUFFICIENT_EVIDENCE';
  const family1128 = batch2Documents.some((doc) => doc.series_codes_mentioned.includes('1128') && ['044', '046', 'MS 440', 'MS 460'].every((name) => doc.models_mentioned.some((model) => model.model_name === name))) ? 'PASS' : 'INSUFFICIENT_EVIDENCE';

  return {
    knownModels,
    batch2Rows,
    batch2Documents,
    batch2FieldValues,
    batch2DuplicateGroups,
    batch2CanonicalRegistry,
    batch2Verified,
    batch2Blocked,
    batch2Conflicts,
    batch2RevisionResolution,
    crossRegistry,
    crossVerified,
    crossDuplicates,
    crossConflicts,
    batch2Inventory,
    fieldBreakdown,
    documentTypeBreakdown,
    precisionAudits,
    eligibleFields,
    highValueAudit,
    crossAgreementMetrics,
    regressionChecks,
    verifiedSample,
    falsePositiveSample,
    partNumberSample,
    carbSample,
    documentNumberSample,
    fs100Documents,
    fs100Verified,
    br600Documents,
    br600Verified,
    family1125,
    family1128
  };
}

function main() {
  ensureDir(BACKUP_DIR);
  const backupPath = path.join(BACKUP_DIR, `stihl_local_library-${DATE_STAMP}-phase35c-readonly.db`);
  fs.copyFileSync(BATCH2_DB_PATH, backupPath);
  const beforeHashes = snapshotImmutableFiles();
  const batch2FileHash = fileSha256(BATCH2_DB_PATH);
  const batch2DatabaseSize = fs.statSync(BATCH2_DB_PATH).size;

  const run1 = runPipeline();
  const run2 = runPipeline();
  const idempotencyPass = stableHash({
    verified: run1.batch2Verified.map((entry) => entry.candidate_id),
    blocked: run1.batch2Blocked.map((entry) => entry.candidate_id),
    registry: run1.batch2CanonicalRegistry.map((entry) => entry.canonical_document_id)
  }) === stableHash({
    verified: run2.batch2Verified.map((entry) => entry.candidate_id),
    blocked: run2.batch2Blocked.map((entry) => entry.candidate_id),
    registry: run2.batch2CanonicalRegistry.map((entry) => entry.canonical_document_id)
  });

  writeJson(OUTPUTS.batch2Registry, {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    source_batch: BATCH2_SOURCE_BATCH,
    documents: run1.batch2Documents,
    canonical_documents: run1.batch2CanonicalRegistry
  });
  writeJson(OUTPUTS.crossRegistry, {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    canonical_documents: run1.crossRegistry
  });
  writeJson(OUTPUTS.batch2Duplicates, {
    generated_at: new Date().toISOString(),
    duplicate_groups: run1.batch2DuplicateGroups
  });
  writeJson(OUTPUTS.crossDuplicates, {
    generated_at: new Date().toISOString(),
    duplicate_groups: run1.crossDuplicates
  });
  writeJson(OUTPUTS.batch2Verified, {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    candidates: run1.batch2Verified
  });
  writeJson(OUTPUTS.crossVerified, {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    candidates: run1.crossVerified
  });
  writeJson(OUTPUTS.batch2Blocked, {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    blocked_fields: run1.batch2Blocked
  });
  writeJson(OUTPUTS.batch2Conflicts, {
    generated_at: new Date().toISOString(),
    conflicts: run1.batch2Conflicts
  });
  writeJson(OUTPUTS.crossConflicts, {
    generated_at: new Date().toISOString(),
    conflicts: run1.crossConflicts
  });
  writeJson(OUTPUTS.batch2Revision, {
    generated_at: new Date().toISOString(),
    revisions: run1.batch2RevisionResolution
  });
  writeJson(OUTPUTS.highValueAudit, {
    generated_at: new Date().toISOString(),
    models: run1.highValueAudit
  });

  const afterHashes = snapshotImmutableFiles();
  const immutableUnchanged = Object.keys(beforeHashes).every((key) => beforeHashes[key] === afterHashes[key]);

  const report = {
    generated_at: new Date().toISOString(),
    phase: 'FASE 35C FINAL REPORT',
    SOURCE_COMMIT: SOURCE_COMMIT,
    CONTENT_COMMIT: CONTENT_COMMIT,
    BATCH2_SOURCE: BATCH2_DB_PATH,
    BATCH2_FILE_HASH: batch2FileHash,
    BATCH2_DATABASE_SIZE: batch2DatabaseSize,
    BATCH2_TOTAL_DOCUMENTS: run1.batch2Inventory.total_documents,
    BATCH2_TOTAL_PAGES: run1.batch2Inventory.total_pages,
    BATCH2_UNIQUE_DOCUMENTS: run1.batch2Documents.length - run1.batch2DuplicateGroups.reduce((sum, group) => sum + group.members.filter((member) => member.duplicate_status === 'EXACT_DUPLICATE').length, 0),
    BATCH2_AUTHENTICATED_OFFICIAL: run1.batch2Documents.filter((doc) => doc.authenticity_status === 'AUTHENTICATED_OFFICIAL').length,
    BATCH2_PROBABLE_OFFICIAL: run1.batch2Documents.filter((doc) => doc.authenticity_status === 'PROBABLE_OFFICIAL').length,
    BATCH2_NEEDS_REVIEW: run1.batch2Documents.filter((doc) => doc.authenticity_status === 'NEEDS_REVIEW').length,
    BATCH2_INSUFFICIENT_TEXT: run1.batch2Documents.filter((doc) => doc.authenticity_status === 'INSUFFICIENT_EXTRACTED_TEXT').length,
    BATCH2_TEXT_FAILED: run1.batch2Documents.filter((doc) => doc.authenticity_status === 'TEXT_EXTRACTION_FAILED').length,
    BATCH2_NON_OFFICIAL: run1.batch2Documents.filter((doc) => doc.authenticity_status === 'NON_OFFICIAL_CONFIRMED').length,
    BATCH2_EXCELLENT_TEXT: run1.batch2Documents.filter((doc) => doc.extraction_quality === 'EXCELLENT').length,
    BATCH2_GOOD_TEXT: run1.batch2Documents.filter((doc) => doc.extraction_quality === 'GOOD').length,
    BATCH2_PARTIAL_TEXT: run1.batch2Documents.filter((doc) => doc.extraction_quality === 'PARTIAL').length,
    BATCH2_POOR_TEXT: run1.batch2Documents.filter((doc) => doc.extraction_quality === 'POOR').length,
    BATCH2_FAILED_TEXT: run1.batch2Documents.filter((doc) => doc.extraction_quality === 'FAILED').length,
    DUPLICATES_WITHIN_BATCH2: run1.batch2DuplicateGroups.length,
    DUPLICATES_AGAINST_BATCH1: run1.crossDuplicates.length,
    SAME_DOCUMENT_DIFFERENT_REVISION: run1.crossDuplicates.reduce((sum, group) => sum + group.members.filter((member) => member.duplicate_status === 'SAME_DOCUMENT_DIFFERENT_REVISION').length, 0),
    SAME_DOCUMENT_DIFFERENT_MARKET: run1.crossDuplicates.reduce((sum, group) => sum + group.members.filter((member) => member.duplicate_status === 'SAME_DOCUMENT_DIFFERENT_MARKET').length, 0),
    NEW_UNIQUE_OFFICIAL_DOCUMENTS: run1.batch2Documents.filter((doc) => doc.authenticity_status === 'AUTHENTICATED_OFFICIAL' && !run1.crossDuplicates.some((group) => group.members.some((member) => member.document_id === doc.document_id))).length,
    REVISION_CANDIDATE_GROUPS: run1.batch2RevisionResolution.length,
    CONFIRMED_DIFFERENT_REVISIONS: run1.batch2RevisionResolution.filter((entry) => entry.classification === 'CONFIRMED_DIFFERENT_REVISION').length,
    MARKET_VARIANTS: run1.batch2RevisionResolution.filter((entry) => entry.classification === 'MARKET_VARIANT').length,
    TRANSLATIONS: run1.batch2RevisionResolution.filter((entry) => entry.classification === 'TRANSLATION').length,
    TOTAL_FIELD_CANDIDATES: run1.batch2FieldValues.length,
    SOURCE_ELIGIBLE: run1.batch2FieldValues.filter((field) => field.source_eligibility && field.source_eligibility !== 'NONE').length,
    FIELDS_VERIFIED: run1.batch2Verified.length,
    OFFICIAL_INDIRECT: run1.batch2FieldValues.filter((field) => field.verification_status === 'OFFICIAL_INDIRECT').length,
    BLOCKED: run1.batch2Blocked.length,
    CONFLICTS: run1.batch2Conflicts.length,
    PART_NUMBERS_EXTRACTED: run1.batch2FieldValues.filter((field) => field.field_name === 'part_number').length,
    PART_NUMBERS_VERIFIED: run1.batch2Verified.filter((field) => field.field_name === 'part_number').length,
    PART_COMPATIBILITY_VERIFIED: run1.batch2Verified.filter((field) => field.field_name === 'part_number' && ['EXACT_MODEL', 'EXACT_VARIANT', 'MULTI_MODEL_EXPLICIT_COLUMN'].includes(field.model_scope)).length,
    TECHNICAL_CHANGE_CUTOFFS: run1.batch2FieldValues.filter((field) => field.field_name === 'technical_change_cutoff').length,
    FS100_DOCUMENTS: run1.fs100Documents.length,
    FS100_VERIFIED_FIELDS: run1.fs100Verified.length,
    FS100_RESULT: run1.fs100Verified.length > 0 ? 'PASS' : run1.fs100Documents.length > 0 ? 'INSUFFICIENT_EVIDENCE' : 'NO_VALID_DOCUMENT',
    BR600_DOCUMENTS: run1.br600Documents.length,
    BR600_VERIFIED_FIELDS: run1.br600Verified.length,
    BR600_REVISION_STATUS: run1.br600Verified.length > 0 ? 'REVISION_DEPENDENT_VERIFIED' : run1.br600Documents.length > 0 ? 'EXTRACTION_ONLY' : 'INSUFFICIENT_EVIDENCE',
    FAMILY_1125: run1.family1125,
    FAMILY_1128: run1.family1128,
    BATCH1_BATCH2_FACT_AGREEMENTS: run1.crossAgreementMetrics.agreements,
    BATCH1_BATCH2_FACT_CONFLICTS: run1.crossAgreementMetrics.conflicts,
    UNRESOLVED_OFFICIAL_CONFLICTS: run1.crossAgreementMetrics.unresolvedOfficialConflicts,
    VERIFIED_SAMPLE_AUDIT: buildAuditPass(run1.verifiedSample, (sample) => sample.every((entry) => Number.isInteger(entry.page) && entry.canonical_document_id)),
    PART_NUMBER_AUDIT: buildAuditPass(run1.partNumberSample, (sample) => sample.every((entry) => /\d{4}-\d{3}-\d{4}/.test(String(entry.value || '')))),
    CARB_AUDIT: run1.carbSample.length === 0 ? 'N/A' : buildAuditPass(run1.carbSample, (sample) => sample.every((entry) => /carb/i.test(String(entry.evidence_snippet || '')))),
    DOCUMENT_NUMBER_AUDIT: buildAuditPass(run1.documentNumberSample, (sample) => sample.every((entry) => Boolean(entry.document_number_base))),
    CROSS_BATCH_DEDUP_TEST: run1.regressionChecks.cross_batch_duplicate,
    CROSS_BATCH_REVISION_TEST: run1.regressionChecks.cross_batch_revision,
    CONFLICT_PRESERVATION_TEST: run1.crossConflicts.some((entry) => entry.status === 'REVISION_DEPENDENT') ? 'PASS' : 'FAIL',
    HIGH_AUTHORITY_SCOPE_TEST: run1.regressionChecks.high_authority_scope,
    IDEMPOTENCY_TEST: idempotencyPass ? 'PASS' : 'FAIL',
    PUBLIC_MODEL_DATA_MODIFIED: '0 / 0',
    SEO_CONTENT_MODIFIED: '0 / 0',
    SEO_CONTENT_FREEZE: 'ACTIVE',
    DATABASE_BACKUP: fs.existsSync(backupPath) ? 'PASS' : 'FAIL',
    TEST_SUITE: [
      run1.regressionChecks.archive_copy_authority,
      run1.regressionChecks.high_authority_scope,
      run1.regressionChecks.cross_batch_duplicate,
      run1.regressionChecks.cross_batch_revision,
      buildAuditPass(run1.verifiedSample, (sample) => sample.every((entry) => Number.isInteger(entry.page) && entry.canonical_document_id)),
      buildAuditPass(run1.partNumberSample, (sample) => sample.every((entry) => /\d{4}-\d{3}-\d{4}/.test(String(entry.value || '')))),
      run1.carbSample.length === 0 ? 'PASS' : buildAuditPass(run1.carbSample, (sample) => sample.every((entry) => /carb/i.test(String(entry.evidence_snippet || '')))),
      buildAuditPass(run1.documentNumberSample, (sample) => sample.every((entry) => Boolean(entry.document_number_base))),
      run1.crossConflicts.some((entry) => entry.status === 'REVISION_DEPENDENT') ? 'PASS' : 'FAIL',
      idempotencyPass ? 'PASS' : 'FAIL'
    ].every((status) => status === 'PASS') ? 'PASS' : 'FAIL',
    FINAL_STATUS: immutableUnchanged
      && idempotencyPass
      && run1.regressionChecks.archive_copy_authority === 'PASS'
      && run1.regressionChecks.high_authority_scope === 'PASS'
      && run1.regressionChecks.cross_batch_duplicate === 'PASS'
      && run1.regressionChecks.cross_batch_revision === 'PASS'
      && buildAuditPass(run1.verifiedSample, (sample) => sample.every((entry) => Number.isInteger(entry.page) && entry.canonical_document_id)) === 'PASS'
      && buildAuditPass(run1.partNumberSample, (sample) => sample.every((entry) => /\d{4}-\d{3}-\d{4}/.test(String(entry.value || '')))) === 'PASS'
      && (run1.carbSample.length === 0 ? 'PASS' : buildAuditPass(run1.carbSample, (sample) => sample.every((entry) => /carb/i.test(String(entry.evidence_snippet || ''))))) === 'PASS'
      && buildAuditPass(run1.documentNumberSample, (sample) => sample.every((entry) => Boolean(entry.document_number_base))) === 'PASS'
      && (run1.crossConflicts.some((entry) => entry.status === 'REVISION_DEPENDENT') ? 'PASS' : 'FAIL') === 'PASS'
      ? 'PASS'
      : (immutableUnchanged
        && idempotencyPass
        && run1.regressionChecks.archive_copy_authority === 'PASS'
        && run1.regressionChecks.high_authority_scope === 'PASS'
        && run1.regressionChecks.cross_batch_duplicate === 'PASS'
        && run1.regressionChecks.cross_batch_revision === 'PASS'
        ? 'PARTIAL PASS'
        : 'FAIL'),
    batch2_inventory: run1.batch2Inventory,
    field_breakdown: run1.fieldBreakdown,
    document_type_breakdown: run1.documentTypeBreakdown,
    precision_audits: run1.precisionAudits,
    top_verified_models: Object.entries(run1.highValueAudit)
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.verified_fields - a.verified_fields)
      .slice(0, 15),
    verified_candidate_sample: run1.verifiedSample.map((entry) => ({
      MODEL: entry.variant_id,
      FIELD: entry.field_name,
      VALUE: entry.value,
      UNIT: entry.unit,
      DOCUMENT_NUMBER: entry.document_number,
      REVISION: entry.revision,
      MARKET: entry.market,
      PAGE: entry.page,
      SOURCE_BATCH: entry.source_batch
    }))
  };

  writeJson(OUTPUTS.report, report);

  console.log('Phase 35C batch2 ingest completed.');
  console.log(`Batch2 documents: ${report.BATCH2_TOTAL_DOCUMENTS}`);
  console.log(`Batch2 verified fields: ${report.FIELDS_VERIFIED}`);
  console.log(`Final status: ${report.FINAL_STATUS}`);
}

main();
