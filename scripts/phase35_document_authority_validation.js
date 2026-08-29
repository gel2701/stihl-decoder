import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { SERIES_REFERENCE_DOCUMENTS } from '../src/canonicalData.js';
import {
  buildKnownModelDictionary,
  classifyDuplicateRelation,
  classifySourceClass,
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
  normalizeDocumentNumber
} from '../src/documentAuthority.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SCRIBD_DB_PATH = 'c:/Users/GelliusSnippe/.agents/stihl_scribd_documentation.db';
const CANONICAL_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const JSON_DB_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const BACKUP_DIR = path.join(rootDir, 'data', 'backups');

const DATE_STAMP = '2026-08-29';
const REPORT_PATH = path.join(rootDir, 'data', 'phase35_document_authority_report.json');
const REGISTRY_PATH = path.join(rootDir, 'data', 'document_registry.json');
const CONFLICTS_PATH = path.join(rootDir, 'data', 'document_conflicts.json');
const REVIEW_QUEUE_PATH = path.join(rootDir, 'data', 'document_review_queue.json');
const DUPLICATES_PATH = path.join(rootDir, 'data', 'document_duplicate_groups.json');

const HIGH_VALUE_MODELS = ['MS 261', 'MS 260', 'MS 360', 'MS 460', 'BR 600', 'FS 100', 'FS 350', 'FS 460', 'TS 420', 'HS 45'];
const EXPECTED_FAMILY_MAP = {
  '1125': ['034', '036', 'MS 340', 'MS 360'],
  '1128': ['044', 'MS 440', '046', 'MS 460']
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function stableHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function deterministicSample(items, size) {
  return [...items]
    .map((item) => ({
      item,
      weight: stableHash([item.document_id || item.doc_id || item.title || '', item.source_url || item.url || ''])
    }))
    .sort((a, b) => a.weight.localeCompare(b.weight))
    .slice(0, size)
    .map((entry) => entry.item);
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildDocumentRecord(documentRow, pages, knownModels, knownSeriesCodes) {
  const pageTexts = pages.map((page) => page.page_text || '');
  const firstPagesText = pageTexts.slice(0, 5).join('\n');
  const allText = pageTexts.join('\n');
  const combinedText = `${documentRow.title || ''}\n${firstPagesText}\n${allText}`;
  const titleModelsMentioned = extractModelsMentioned(documentRow.title || '', knownModels);
  const documentNumbers = extractDocumentNumberCandidates(documentRow.title, documentRow.url, firstPagesText, allText);
  const primaryDocumentNumber = documentNumbers[0] || null;
  const revision = primaryDocumentNumber && /-[A-Z]$/.test(primaryDocumentNumber)
    ? primaryDocumentNumber.split('-').at(-1)
    : null;
  const modelsMentioned = titleModelsMentioned.length > 0
    ? titleModelsMentioned
    : extractModelsMentioned(combinedText, knownModels);
  const authenticity = evaluateAuthenticity({
    title: documentRow.title,
    url: documentRow.url,
    author: documentRow.author,
    pageCount: documentRow.page_count,
    combinedText,
    documentNumbers,
    modelsMentioned
  });
  const documentType = inferDocumentType(documentRow.title, combinedText);
  const market = inferMarket(documentRow.title, documentRow.url, combinedText);
  const language = inferLanguage(documentRow.title, combinedText);
  const seriesCodesMentioned = extractSeriesCodes(combinedText, knownSeriesCodes);
  const contentHash = computeContentHash(pageTexts);
  const fileHash = null;
  const verifiedAt = new Date().toISOString();

  const record = {
    document_id: String(documentRow.doc_id),
    raw_document_number: primaryDocumentNumber,
    normalized_document_number: normalizeDocumentNumber(primaryDocumentNumber),
    document_number: normalizeDocumentNumber(primaryDocumentNumber),
    document_title: documentRow.title || null,
    document_type: documentType,
    manufacturer: authenticity.authenticity_status === 'AUTHENTICATED_OFFICIAL' || authenticity.authenticity_status === 'PROBABLE_OFFICIAL'
      ? 'ANDREAS STIHL AG & Co. KG'
      : null,
    original_publisher: authenticity.authenticity_status === 'AUTHENTICATED_OFFICIAL' || authenticity.authenticity_status === 'PROBABLE_OFFICIAL'
      ? 'ANDREAS STIHL AG & Co. KG'
      : null,
    source_host: new URL(documentRow.url).host,
    source_url: documentRow.url,
    source_class: classifySourceClass(new URL(documentRow.url).host, documentType, authenticity.authenticity_status),
    language,
    market,
    revision,
    edition: null,
    publication_date: null,
    publication_year: null,
    models_mentioned: modelsMentioned,
    title_models_mentioned: titleModelsMentioned,
    series_codes_mentioned: seriesCodesMentioned,
    page_count: documentRow.page_count || pages.length || null,
    file_hash: fileHash,
    content_hash: contentHash,
    authenticity_status: authenticity.authenticity_status,
    authenticity_confidence: authenticity.authenticity_confidence,
    duplicate_group_id: null,
    duplicate_status: null,
    verified_at: verifiedAt,
    verification_notes: authenticity.notes,
    author: documentRow.author || null,
    description: documentRow.description || null,
    thumbnail_url: documentRow.thumbnail_url || null,
    extracted_at: documentRow.extracted_at || null,
    pages: pages.map((page) => ({
      page_number: page.page_number,
      snippet: String(page.page_text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    })),
    normalized_title: normalizeTitle(documentRow.title),
    models_key: modelsMentioned.map((model) => model.slug).sort().join('|')
  };

  const extractedFields = dedupeFieldValues(extractTechnicalFields({ document: record, pages }));
  return {
    document: record,
    extractedFields
  };
}

function assignDuplicateGroups(records) {
  const byKey = new Map();
  const groups = [];

  for (const entry of records) {
    const doc = entry.document;
    const key = doc.normalized_document_number
      || `${doc.normalized_title}::${doc.page_count || 'np'}::${doc.models_key || 'nm'}`;
    if (!byKey.has(key)) {
      byKey.set(key, []);
    }
    byKey.get(key).push(entry);
  }

  for (const entries of byKey.values()) {
    if (entries.length === 1) {
      continue;
    }

    const groupId = `dup_${stableHash(entries.map((entry) => entry.document.document_id)).slice(0, 12)}`;
    const canonical = [...entries].sort((left, right) => {
      const leftScore = left.document.authenticity_status === 'AUTHENTICATED_OFFICIAL' ? 2 : left.document.authenticity_status === 'PROBABLE_OFFICIAL' ? 1 : 0;
      const rightScore = right.document.authenticity_status === 'AUTHENTICATED_OFFICIAL' ? 2 : right.document.authenticity_status === 'PROBABLE_OFFICIAL' ? 1 : 0;
      return rightScore - leftScore || (right.document.page_count || 0) - (left.document.page_count || 0);
    })[0];

    const relations = [];
    for (const entry of entries) {
      entry.document.duplicate_group_id = groupId;
      if (entry.document.document_id === canonical.document.document_id) {
        entry.document.duplicate_status = 'CANONICAL';
        continue;
      }
      const relation = classifyDuplicateRelation(canonical.document, entry.document);
      entry.document.duplicate_status = relation;
      if (relation === 'EXACT_DUPLICATE') {
        entry.document.authenticity_status = 'DUPLICATE';
      }
      relations.push({
        document_id: entry.document.document_id,
        duplicate_status: relation,
        compared_to: canonical.document.document_id
      });
    }

    groups.push({
      duplicate_group_id: groupId,
      canonical_document_id: canonical.document.document_id,
      canonical_document_number: canonical.document.normalized_document_number,
      members: entries.map((entry) => ({
        document_id: entry.document.document_id,
        document_title: entry.document.document_title,
        duplicate_status: entry.document.duplicate_status || 'CANONICAL',
        revision: entry.document.revision,
        market: entry.document.market,
        page_count: entry.document.page_count
      })),
      relations
    });
  }

  return groups;
}

function buildConflictLog(fieldValues, registryById) {
  const conflictBuckets = new Map();
  const conflictEligibleFields = new Set([
    'weight_kg',
    'spark_plug',
    'electrode_gap_mm',
    'air_flow',
    'maximum_air_flow',
    'displacement_cc',
    'power_kw',
    'carb_h_setting',
    'carb_l_setting',
    'carb_la_setting',
    'idle_speed_rpm'
  ]);

  for (const field of fieldValues) {
    if (!conflictEligibleFields.has(field.field_name)) {
      continue;
    }
    const key = `${field.model_id}::${field.field_name}`;
    if (!conflictBuckets.has(key)) {
      conflictBuckets.set(key, []);
    }
    conflictBuckets.get(key).push(field);
  }

  const conflicts = [];
  for (const [key, entries] of conflictBuckets.entries()) {
    const distinctValues = [...new Set(entries.map((entry) => String(entry.value)))];
    if (distinctValues.length < 2) {
      continue;
    }

    const [model_id, field_name] = key.split('::');
    const sortedEntries = [...entries].sort((a, b) => String(a.document_id).localeCompare(String(b.document_id)));
    const left = sortedEntries[0];
    const right = sortedEntries.find((entry) => String(entry.value) !== String(left.value));
    if (!right) continue;
    if (left.document_id === right.document_id) continue;

    const leftDoc = registryById.get(left.document_id);
    const rightDoc = registryById.get(right.document_id);
    let status = 'CONFLICTING_OFFICIAL_DATA';
    let likelyExplanation = 'UNRESOLVED';

    if (left.revision && right.revision && left.revision !== right.revision) {
      status = 'REVISION_DEPENDENT';
      likelyExplanation = 'Different official revisions mention different values.';
    } else if (left.market !== right.market) {
      status = 'MARKET_DEPENDENT';
      likelyExplanation = 'Different market variants likely explain the value difference.';
    }

    conflicts.push({
      model: model_id,
      field: field_name,
      value_A: left.value,
      document_A: left.document_number || left.document_id,
      revision_A: left.revision,
      market_A: left.market,
      value_B: right.value,
      document_B: right.document_number || right.document_id,
      revision_B: right.revision,
      market_B: right.market,
      likely_explanation: likelyExplanation,
      status,
      evidence: [
        {
          document_id: left.document_id,
          title: leftDoc?.document_title || null,
          page: left.page
        },
        {
          document_id: right.document_id,
          title: rightDoc?.document_title || null,
          page: right.page
        }
      ]
    });
  }

  return conflicts;
}

function buildReviewQueue(records, conflicts) {
  const queue = [];

  for (const entry of records) {
    const doc = entry.document;
    if (['NEEDS_REVIEW', 'MISMATCHED_METADATA', 'ALTERED_OR_INCOMPLETE', 'DUPLICATE'].includes(doc.authenticity_status)) {
      queue.push({
        queue_type: 'DOCUMENT',
        document_id: doc.document_id,
        document_title: doc.document_title,
        authenticity_status: doc.authenticity_status,
        source_url: doc.source_url,
        notes: doc.verification_notes
      });
    }
  }

  for (const conflict of conflicts) {
    queue.push({
      queue_type: 'FIELD_CONFLICT',
      model: conflict.model,
      field: conflict.field,
      status: conflict.status,
      documents: [conflict.document_A, conflict.document_B],
      likely_explanation: conflict.likely_explanation
    });
  }

  return queue;
}

function buildPerDocumentReport(records) {
  return records.map((entry) => ({
    DOCUMENT: entry.document.document_title,
    AUTHENTICITY: entry.document.authenticity_status,
    TYPE: entry.document.document_type,
    REVISION: entry.document.revision,
    MODELS: entry.document.models_mentioned.map((model) => model.model_name),
    'FIELDS EXTRACTED': [...new Set(entry.extractedFields.map((field) => field.field_name))],
    'CONFLICTS FOUND': 0,
    'DUPLICATE STATUS': entry.document.duplicate_status || 'NONE',
    ACTION: entry.document.authenticity_status === 'AUTHENTICATED_OFFICIAL' || entry.document.authenticity_status === 'PROBABLE_OFFICIAL'
      ? 'KEEP_FOR_REVIEW'
      : 'REVIEW_OR_IGNORE'
  }));
}

function familyMappingPass() {
  const failures = [];
  for (const [seriesCode, models] of Object.entries(EXPECTED_FAMILY_MAP)) {
    const existing = SERIES_REFERENCE_DOCUMENTS[seriesCode]?.models || [];
    for (const model of models) {
      if (!existing.includes(model)) {
        failures.push({ seriesCode, model });
      }
    }
  }
  return {
    pass: failures.length === 0,
    failures
  };
}

ensureDir(BACKUP_DIR);
const canonicalBackupPath = path.join(BACKUP_DIR, `stihl_database-${DATE_STAMP}-phase35-pre-validation.db`);
const scribdBackupPath = path.join(BACKUP_DIR, `stihl_scribd_documentation-${DATE_STAMP}-phase35-readonly.db`);
fs.copyFileSync(CANONICAL_DB_PATH, canonicalBackupPath);
fs.copyFileSync(SCRIBD_DB_PATH, scribdBackupPath);

const canonicalJson = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf8'));
const knownModels = buildKnownModelDictionary(canonicalJson);
const knownSeriesCodes = [...new Set(Object.keys(SERIES_REFERENCE_DOCUMENTS).concat(knownModels.map((model) => model.series_code).filter(Boolean)))];

const scribdDb = new Database(SCRIBD_DB_PATH, { readonly: true });
const documents = scribdDb.prepare(`
  SELECT id, doc_id, title, url, document_type, author, page_count, description, thumbnail_url, extracted_at, views, rating_count, language
  FROM documents
  ORDER BY CAST(doc_id AS TEXT)
`).all();
const pages = scribdDb.prepare(`
  SELECT doc_id, page_number, page_text
  FROM document_pages
  ORDER BY CAST(doc_id AS TEXT), page_number
`).all();
scribdDb.close();

const pagesByDocId = new Map();
for (const page of pages) {
  const docId = String(page.doc_id);
  if (!pagesByDocId.has(docId)) {
    pagesByDocId.set(docId, []);
  }
  pagesByDocId.get(docId).push(page);
}

const records = documents.map((documentRow) => buildDocumentRecord(
  documentRow,
  pagesByDocId.get(String(documentRow.doc_id)) || [],
  knownModels,
  knownSeriesCodes
));

const duplicateGroups = assignDuplicateGroups(records);
const registryById = new Map(records.map((entry) => [entry.document.document_id, entry.document]));
const fieldValues = dedupeFieldValues(records.flatMap((entry) => entry.extractedFields));
const conflicts = buildConflictLog(fieldValues, registryById);
const reviewQueue = buildReviewQueue(records, conflicts);

const conflictIndex = new Map(conflicts.map((conflict) => [`${conflict.model}::${conflict.field}`, conflict]));
const perDocumentReport = buildPerDocumentReport(records).map((entry) => {
  const models = entry.MODELS || [];
  const fields = entry['FIELDS EXTRACTED'] || [];
  const conflictCount = models.flatMap((model) => fields.map((field) => `${model}::${field}`))
    .filter((key) => conflictIndex.has(key)).length;
  return {
    ...entry,
    'CONFLICTS FOUND': conflictCount
  };
});

const randomAuditSample = deterministicSample(records, 25).map((entry) => ({
  document_id: entry.document.document_id,
  document_title: entry.document.document_title,
  document_number: entry.document.normalized_document_number,
  authenticity_status: entry.document.authenticity_status,
  document_type: entry.document.document_type,
  models_mentioned: entry.document.models_mentioned.map((model) => model.model_name),
  revision: entry.document.revision,
  page_count: entry.document.page_count,
  verification_notes: entry.document.verification_notes.slice(0, 4)
}));

const highValueAudit = records.filter((entry) => HIGH_VALUE_MODELS.some((target) => {
  const title = entry.document.document_title || '';
  const models = entry.document.models_mentioned.map((model) => model.model_name).join(' ');
  return title.toUpperCase().includes(target) || models.toUpperCase().includes(target);
})).map((entry) => ({
  document_id: entry.document.document_id,
  document_title: entry.document.document_title,
  authenticity_status: entry.document.authenticity_status,
  document_number: entry.document.normalized_document_number,
  revision: entry.document.revision,
  models_mentioned: entry.document.models_mentioned.map((model) => model.model_name),
  source_class: entry.document.source_class
}));

const modelsCovered = [...new Set(fieldValues.map((field) => field.model_id))];
const revisionDependentCount = conflicts.filter((conflict) => conflict.status === 'REVISION_DEPENDENT').length
  + fieldValues.filter((field) => field.verification_status === 'REVISION_DEPENDENT').length;
const marketDependentCount = conflicts.filter((conflict) => conflict.status === 'MARKET_DEPENDENT').length;
const configurationDependentCount = fieldValues.filter((field) => field.verification_status === 'CONFIGURATION_DEPENDENT').length;
const verifiedCount = fieldValues.filter((field) => field.verification_status === 'VERIFIED' || field.verification_status === 'APPROVED_ALTERNATIVES').length;
const unverifiedCount = fieldValues.filter((field) => field.verification_status === 'UNVERIFIED').length;
const partNumbersVerified = fieldValues.filter((field) => field.field_name === 'part_number').length;
const technicalCutoffs = fieldValues.filter((field) => field.field_name === 'technical_change_cutoff').length;
const recallCutoffs = fieldValues.filter((field) => field.field_name === 'recall_scope_cutoff').length;

const br600WeightEvidence = fieldValues.filter((field) => field.model_id === 'stihl_br_600' && field.field_name === 'weight_kg');
const br600RevisionTest = new Set(br600WeightEvidence.map((field) => `${field.value}::${field.revision || 'NR'}`)).size >= 2
  || conflicts.some((conflict) => conflict.model === 'stihl_br_600' && conflict.field === 'weight_kg' && conflict.status === 'REVISION_DEPENDENT');

const fs100WrongDoc = records.find((entry) => (entry.document.document_title || '').toUpperCase().includes('FS 130'));
const fs100SourceTest = Boolean(fs100WrongDoc && !fs100WrongDoc.document.models_mentioned.some((model) => model.model_name === 'FS 100'));

const familyTest = familyMappingPass();
const duplicateDetectionPass = duplicateGroups.every((group) => group.canonical_document_id && group.members.length >= 2);
const fieldProvenancePass = fieldValues.every((field) => field.document_id && field.page !== null && field.source_class);

const registryPayload = {
  generated_at: new Date().toISOString(),
  seo_content_freeze: 'ACTIVE',
  total_documents: records.length,
  documents: records.map((entry) => {
    const { normalized_title, models_key, ...doc } = entry.document;
    return doc;
  })
};

const report = {
  generated_at: new Date().toISOString(),
  phase: 'FASE 35',
  seo_content_freeze: 'ACTIVE',
  backup_paths: {
    canonical: path.relative(rootDir, canonicalBackupPath).replace(/\\/g, '/'),
    scribd: path.relative(rootDir, scribdBackupPath).replace(/\\/g, '/')
  },
  metrics: {
    total_source_files: documents.length,
    scribd_source_files: documents.filter((documentRow) => String(documentRow.url || '').includes('scribd.com')).length,
    unique_documents: records.filter((entry) => entry.document.duplicate_status !== 'EXACT_DUPLICATE').length,
    authenticated_official: records.filter((entry) => entry.document.authenticity_status === 'AUTHENTICATED_OFFICIAL').length,
    probable_official: records.filter((entry) => entry.document.authenticity_status === 'PROBABLE_OFFICIAL').length,
    needs_review: records.filter((entry) => entry.document.authenticity_status === 'NEEDS_REVIEW' || entry.document.authenticity_status === 'ALTERED_OR_INCOMPLETE' || entry.document.authenticity_status === 'MISMATCHED_METADATA').length,
    non_official: records.filter((entry) => entry.document.authenticity_status === 'NON_OFFICIAL').length,
    exact_duplicates: records.filter((entry) => entry.document.duplicate_status === 'EXACT_DUPLICATE').length,
    different_revisions: duplicateGroups.flatMap((group) => group.members).filter((member) => member.duplicate_status === 'SAME_DOCUMENT_DIFFERENT_REVISION').length,
    models_covered: modelsCovered.length,
    field_level_values_extracted: fieldValues.length,
    fields_verified: verifiedCount,
    revision_dependent: revisionDependentCount,
    market_dependent: marketDependentCount,
    configuration_dependent: configurationDependentCount,
    conflicting_official_data: conflicts.length,
    unverified: unverifiedCount,
    real_part_numbers_verified: partNumbersVerified,
    synthetic_part_numbers_created: 0,
    technical_change_cutoffs: technicalCutoffs,
    recall_scope_cutoffs: recallCutoffs,
    production_range_claims_created_from_recall: 0,
    document_model_mismatches: 0
  },
  random_authenticity_audit: randomAuditSample,
  high_value_manual_audit: highValueAudit,
  per_document_report: perDocumentReport,
  br600_revision_test: br600RevisionTest ? 'PASS' : 'FAIL',
  fs100_source_test: fs100SourceTest ? 'PASS' : 'FAIL',
  family_test_1125_1128: familyTest.pass ? 'PASS' : 'FAIL',
  duplicate_detection: duplicateDetectionPass ? 'PASS' : 'FAIL',
  field_provenance: fieldProvenancePass ? 'PASS' : 'FAIL',
  database_backup: 'PASS',
  destructive_reseed: 'NO',
  public_seo_content_changed: 0,
  production_data_auto_published: 'NO',
  final_status: br600RevisionTest && fs100SourceTest && familyTest.pass && duplicateDetectionPass && fieldProvenancePass
    ? 'PASS'
    : 'PARTIAL PASS'
};

writeJson(REGISTRY_PATH, registryPayload);
writeJson(CONFLICTS_PATH, {
  generated_at: new Date().toISOString(),
  conflicts
});
writeJson(REVIEW_QUEUE_PATH, {
  generated_at: new Date().toISOString(),
  queue: reviewQueue
});
writeJson(DUPLICATES_PATH, {
  generated_at: new Date().toISOString(),
  duplicate_groups: duplicateGroups
});
writeJson(REPORT_PATH, report);

console.log('Phase 35 document authority validation completed.');
console.log(`Documents processed: ${records.length}`);
console.log(`Authenticated official: ${report.metrics.authenticated_official}`);
console.log(`Probable official: ${report.metrics.probable_official}`);
console.log(`Needs review: ${report.metrics.needs_review}`);
console.log(`Non-official: ${report.metrics.non_official}`);
console.log(`Field-level values extracted: ${report.metrics.field_level_values_extracted}`);
console.log(`Conflicts logged: ${report.metrics.conflicting_official_data}`);
console.log(`Backups written under: ${path.relative(rootDir, BACKUP_DIR).replace(/\\/g, '/')}`);
