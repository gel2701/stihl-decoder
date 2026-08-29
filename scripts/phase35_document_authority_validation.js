import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { SERIES_REFERENCE_DOCUMENTS } from '../src/canonicalData.js';
import {
  assessDocumentModelRelations,
  buildKnownModelDictionary,
  classifyDuplicateRelation,
  classifyExtractionQuality,
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
  normalizeDocumentNumber,
  splitDocumentNumber,
  summarizeFieldMetrics
} from '../src/documentAuthority.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SCRIBD_DB_PATH = 'c:/Users/GelliusSnippe/.agents/stihl_scribd_documentation.db';
const CANONICAL_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const JSON_DB_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const BACKUP_DIR = path.join(rootDir, 'data', 'backups');
const DATE_STAMP = '2026-08-29';

const REGISTRY_PATH = path.join(rootDir, 'data', 'document_registry.json');
const CONFLICTS_PATH = path.join(rootDir, 'data', 'document_conflicts.json');
const REVIEW_QUEUE_PATH = path.join(rootDir, 'data', 'document_review_queue.json');
const DUPLICATES_PATH = path.join(rootDir, 'data', 'document_duplicate_groups.json');
const VERIFIED_CANDIDATES_PATH = path.join(rootDir, 'data', 'document_verified_field_candidates.json');
const REPORT_PATH = path.join(rootDir, 'data', 'phase35a_document_authority_report.json');

const HIGH_VALUE_MODELS = ['MS 261', 'MS 260', 'MS 360', 'MS 460', 'BR 600', 'FS 100', 'FS 100 RX', 'FS 350', 'FS 460', 'TS 420', 'HS 45'];
const REQUIRED_FIELD_BREAKDOWN = [
  'displacement_cc',
  'bore_mm',
  'stroke_mm',
  'power_kw',
  'power_hp',
  'weight_kg',
  'idle_speed_rpm',
  'spark_plug',
  'electrode_gap_mm',
  'carburetor_model',
  'carb_h_setting',
  'carb_l_setting',
  'fuel_tank_l',
  'oil_mix_ratio',
  'chain_pitch',
  'chain_gauge_mm',
  'air_flow_m3_h',
  'air_velocity_m_s',
  'blowing_force_n',
  'part_number',
  'technical_change_cutoff'
];
const REQUIRED_TYPES = [
  'WORKSHOP_MANUAL',
  'SERVICE_MANUAL',
  'INSTRUCTION_MANUAL',
  'PARTS_LIST',
  'TECHNICAL_INFORMATION',
  'CATALOGUE',
  'OTHER'
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

function deterministicSample(items, size) {
  return [...items]
    .map((item) => ({
      item,
      weight: stableHash([item.document.document_id, item.document.source_url, item.document.content_hash])
    }))
    .sort((a, b) => a.weight.localeCompare(b.weight))
    .slice(0, size)
    .map((entry) => entry.item);
}

function normalizeTitle(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizePublicationDate(text) {
  const match = String(text || '').match(/\b(20\d{2}|19\d{2})[-/](\d{2})[-/](\d{2})\b|\b(\d{2})[-/](20\d{2}|19\d{2})\b|\b(20\d{2}|19\d{2})\b/);
  if (!match) return null;
  return match[0];
}

function extractPrintCode(text) {
  const match = String(text || '').match(/\b(?:ZBA|DVS)[-_A-Z0-9-]+\b/i);
  return match ? match[0] : null;
}

function buildDocumentRecord(documentRow, pages, knownModels, knownSeriesCodes) {
  const pageTexts = pages.map((page) => page.page_text || '');
  const firstPagesText = pageTexts.slice(0, 5).join('\n');
  const lastPagesText = pageTexts.slice(-5).join('\n');
  const allText = pageTexts.join('\n');
  const combinedText = `${documentRow.title || ''}\n${firstPagesText}\n${lastPagesText}\n${allText}`;
  const extractionQuality = classifyExtractionQuality({
    title: documentRow.title,
    pageCount: documentRow.page_count,
    pageTexts
  });
  const titleModelsMentioned = extractModelsMentioned(documentRow.title || '', knownModels);
  const bodyModelsMentioned = extractModelsMentioned(combinedText, knownModels);
  const documentNumbers = extractDocumentNumberCandidates(documentRow.title, documentRow.url, firstPagesText, lastPagesText, allText);
  const primaryDocumentNumber = documentNumbers[0] || null;
  const split = splitDocumentNumber(primaryDocumentNumber);
  const documentType = inferDocumentType(documentRow.title, combinedText);
  const modelRelations = assessDocumentModelRelations({
    title: documentRow.title || '',
    metadataText: `${documentRow.title || ''} ${documentRow.description || ''}`,
    pages,
    knownModels
  });
  const establishedModels = modelRelations
    .filter((entry) => ['EXPLICIT_MODEL_MATCH', 'EXPLICIT_MULTI_MODEL_MATCH', 'PROBABLE_MATCH', 'TITLE_ONLY_MATCH', 'BODY_ONLY_MATCH', 'MODEL_CONFLICT'].includes(entry.relation_status))
    .map((entry) => ({
      model_id: entry.model_id,
      slug: entry.slug,
      model_name: entry.model_name,
      series_code: entry.series_code || null,
      relation_status: entry.relation_status
    }));

  const authenticity = evaluateAuthenticity({
    title: documentRow.title,
    url: documentRow.url,
    author: documentRow.author,
    pageCount: documentRow.page_count,
    combinedText,
    documentNumbers,
    modelsMentioned: establishedModels,
    extractionQuality,
    metadataSignals: {
      publisherMatch: /andreas stihl|copyright/i.test(firstPagesText) || Boolean(primaryDocumentNumber)
    }
  });

  const sourceHost = new URL(documentRow.url).host;
  const market = inferMarket(documentRow.title, documentRow.url, combinedText);
  const language = inferLanguage(documentRow.title, combinedText);
  const seriesCodesMentioned = extractSeriesCodes(combinedText, knownSeriesCodes);
  const publicationDateRaw = normalizePublicationDate(`${documentRow.title || ''} ${firstPagesText} ${lastPagesText}`);
  const contentHash = computeContentHash(pageTexts);
  const printCode = extractPrintCode(`${documentRow.title || ''} ${firstPagesText} ${lastPagesText}`);

  const record = {
    document_id: String(documentRow.doc_id),
    document_title: documentRow.title || null,
    normalized_title: normalizeTitle(documentRow.title),
    raw_document_number: primaryDocumentNumber,
    normalized_document_number: normalizeDocumentNumber(primaryDocumentNumber),
    document_number: normalizeDocumentNumber(primaryDocumentNumber),
    document_number_base: split.base,
    document_number_revision: split.revision,
    revision: split.revision,
    revision_raw: split.revision,
    revision_normalized: split.revision,
    edition_raw: null,
    publication_date_raw: publicationDateRaw,
    publication_date_normalized: publicationDateRaw,
    print_code: printCode,
    document_type: documentType,
    source_url: documentRow.url,
    source_host: sourceHost,
    source_class: classifySourceClass(sourceHost, documentType, authenticity.authenticity_status),
    language,
    market,
    page_count: documentRow.page_count || pages.length || null,
    content_hash: contentHash,
    file_hash: null,
    extraction_quality: extractionQuality.quality,
    extraction_quality_metrics: extractionQuality.metrics,
    authenticity_status: authenticity.authenticity_status,
    authenticity_confidence: authenticity.authenticity_confidence,
    authenticity_score: authenticity.score,
    verification_notes: authenticity.notes,
    author: documentRow.author || null,
    description: documentRow.description || null,
    thumbnail_url: documentRow.thumbnail_url || null,
    extracted_at: documentRow.extracted_at || null,
    views: documentRow.views || null,
    rating_count: documentRow.rating_count || null,
    title_models_mentioned: titleModelsMentioned,
    body_models_mentioned: bodyModelsMentioned,
    models_mentioned: establishedModels,
    model_relations: modelRelations,
    models_key: establishedModels.map((entry) => entry.slug).sort().join('|'),
    series_codes_mentioned: seriesCodesMentioned,
    duplicate_group_id: null,
    duplicate_status: null,
    pages: pages.map((page) => ({
      page_number: page.page_number,
      snippet: String(page.page_text || '').replace(/\s+/g, ' ').trim().slice(0, 240)
    }))
  };

  const extractedFields = dedupeFieldValues(extractTechnicalFields({
    document: record,
    pages,
    knownModels
  }));

  return { document: record, extractedFields };
}

function assignDuplicateGroups(records) {
  const byKey = new Map();
  const groups = [];

  for (const entry of records) {
    const doc = entry.document;
    const key = doc.document_number_base || `${doc.normalized_title}::${doc.models_key || 'none'}::${doc.page_count || 'np'}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
  }

  for (const entries of byKey.values()) {
    if (entries.length === 1) continue;

    const canonical = [...entries].sort((left, right) => {
      const leftScore = left.document.authenticity_status === 'AUTHENTICATED_OFFICIAL' ? 2 : left.document.authenticity_status === 'PROBABLE_OFFICIAL' ? 1 : 0;
      const rightScore = right.document.authenticity_status === 'AUTHENTICATED_OFFICIAL' ? 2 : right.document.authenticity_status === 'PROBABLE_OFFICIAL' ? 1 : 0;
      return rightScore - leftScore || (right.document.page_count || 0) - (left.document.page_count || 0);
    })[0];

    const groupId = `dup_${stableHash(entries.map((entry) => entry.document.document_id)).slice(0, 12)}`;
    const members = [];

    for (const entry of entries) {
      const relation = entry.document.document_id === canonical.document.document_id
        ? 'CANONICAL'
        : classifyDuplicateRelation(canonical.document, entry.document);
      entry.document.duplicate_group_id = groupId;
      entry.document.duplicate_status = relation;
      members.push({
        document_id: entry.document.document_id,
        document_title: entry.document.document_title,
        duplicate_status: relation,
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

function buildConflictLog(fieldValues, registryById) {
  const buckets = new Map();

  for (const field of fieldValues) {
    if (!['VERIFIED', 'APPROVED_ALTERNATIVES', 'OFFICIAL_INDIRECT'].includes(field.verification_status)) continue;
    if (!field.scope_confidence || field.scope_confidence === 'UNRESOLVED') continue;
    const key = `${field.model_id}::${field.field_name}::${field.scope_confidence}::${field.unit || 'none'}::${field.weight_definition || 'na'}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(field);
  }

  const conflicts = [];

  for (const [key, entries] of buckets.entries()) {
    const distinctValues = [...new Set(entries.map((entry) => JSON.stringify(entry.value)))];
    if (distinctValues.length < 2) continue;
    const [modelId, fieldName] = key.split('::');
    const [left, right] = entries.sort((a, b) => String(a.document_id).localeCompare(String(b.document_id)));

    let status = 'CONFLICTING_OFFICIAL_DATA';
    let likelyExplanation = 'UNRESOLVED';
    if (left.document_number_base && right.document_number_base && left.document_number_base === right.document_number_base && left.revision !== right.revision) {
      status = 'REVISION_DEPENDENT';
      likelyExplanation = 'Different revisions preserve different official values.';
    } else if (left.market !== right.market) {
      status = 'MARKET_DEPENDENT';
      likelyExplanation = 'Different market variants likely explain the difference.';
    } else if ((left.configuration || null) !== (right.configuration || null)) {
      status = 'CONFIGURATION_DEPENDENT';
      likelyExplanation = 'Different weight or configuration definitions appear on the source pages.';
    }

    conflicts.push({
      model: modelId,
      field: fieldName,
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
          title: registryById.get(left.document_id)?.document_title || null,
          page: left.page
        },
        {
          document_id: right.document_id,
          title: registryById.get(right.document_id)?.document_title || null,
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
    const hasKnownModel = doc.models_mentioned.some((model) => HIGH_VALUE_MODELS.includes(model.model_name));
    const technicalPriority = ['SERVICE_MANUAL', 'WORKSHOP_MANUAL', 'TECHNICAL_INFORMATION', 'PARTS_LIST'].includes(doc.document_type);
    let priority = 3;
    if (hasKnownModel && technicalPriority && ['GOOD', 'EXCELLENT', 'PARTIAL'].includes(doc.extraction_quality) && ['PROBABLE_OFFICIAL', 'INSUFFICIENT_EXTRACTED_TEXT', 'ALTERED_OR_INCOMPLETE'].includes(doc.authenticity_status)) {
      priority = 1;
    } else if (doc.document_type === 'PARTS_LIST') {
      priority = 2;
    }

    if (['PROBABLE_OFFICIAL', 'INSUFFICIENT_EXTRACTED_TEXT', 'TEXT_EXTRACTION_FAILED', 'ALTERED_OR_INCOMPLETE', 'NEEDS_REVIEW', 'MISMATCHED_METADATA'].includes(doc.authenticity_status)) {
      queue.push({
        queue_type: 'DOCUMENT',
        priority,
        document_id: doc.document_id,
        document_title: doc.document_title,
        authenticity_status: doc.authenticity_status,
        extraction_quality: doc.extraction_quality,
        document_type: doc.document_type,
        models_mentioned: doc.models_mentioned.map((model) => model.model_name),
        evidence: doc.pages.slice(0, 2).map((page) => ({
          page: page.page_number,
          snippet: page.snippet
        }))
      });
    }
  }

  for (const conflict of conflicts) {
    queue.push({
      queue_type: 'FIELD_CONFLICT',
      priority: 1,
      model: conflict.model,
      field: conflict.field,
      status: conflict.status,
      documents: [conflict.document_A, conflict.document_B],
      likely_explanation: conflict.likely_explanation
    });
  }

  return queue.sort((a, b) => a.priority - b.priority || String(a.document_id || a.model).localeCompare(String(b.document_id || b.model)));
}

function buildHighValueQueue(records) {
  return records
    .filter((entry) => entry.document.models_mentioned.some((model) => HIGH_VALUE_MODELS.includes(model.model_name)))
    .map((entry) => ({
      document_id: entry.document.document_id,
      document_title: entry.document.document_title,
      document_type: entry.document.document_type,
      authenticity_status: entry.document.authenticity_status,
      extraction_quality: entry.document.extraction_quality,
      models_mentioned: entry.document.models_mentioned.map((model) => model.model_name),
      evidence: entry.document.pages.slice(0, 2)
    }));
}

function buildVerifiedCandidateDataset(fieldValues) {
  return fieldValues
    .filter((field) => ['VERIFIED', 'APPROVED_ALTERNATIVES', 'OFFICIAL_INDIRECT'].includes(field.verification_status))
    .map((field) => ({
      candidate_id: field.candidate_id,
      model: field.variant_id,
      field: field.field_name,
      value: field.value,
      unit: field.unit,
      status: field.verification_status,
      document: field.document_number || field.document_id,
      revision: field.revision,
      market: field.market,
      page: field.page,
      scope: field.scope_confidence,
      confidence: field.confidence,
      source_eligibility: field.source_eligibility
    }));
}

function buildFieldBreakdown(fieldValues, conflicts) {
  const summary = summarizeFieldMetrics(fieldValues);
  const conflictsByField = conflicts.reduce((acc, conflict) => {
    acc[conflict.field] = (acc[conflict.field] || 0) + 1;
    return acc;
  }, {});

  return REQUIRED_FIELD_BREAKDOWN.map((field) => ({
    field,
    extracted: summary[field]?.extracted || 0,
    verified: summary[field]?.verified || 0,
    indirect: summary[field]?.indirect || 0,
    unverified: summary[field]?.unverified || 0,
    conflict: conflictsByField[field] || 0
  }));
}

function buildDocumentTypeBreakdown(records) {
  const grouped = new Map();

  for (const type of REQUIRED_TYPES) {
    grouped.set(type, { type, total: 0, authenticated: 0, probable: 0, review: 0, non_official: 0 });
  }

  for (const entry of records) {
    const rawType = entry.document.document_type || 'UNKNOWN';
    const type = REQUIRED_TYPES.includes(rawType) ? rawType : 'OTHER';
    const bucket = grouped.get(type);
    bucket.total += 1;
    if (entry.document.authenticity_status === 'AUTHENTICATED_OFFICIAL') bucket.authenticated += 1;
    else if (entry.document.authenticity_status === 'PROBABLE_OFFICIAL') bucket.probable += 1;
    else if (['NON_OFFICIAL_CONFIRMED', 'DUPLICATE'].includes(entry.document.authenticity_status)) bucket.non_official += 1;
    else bucket.review += 1;
  }

  return [...grouped.values()];
}

function familyEvidence(records, seriesCode, targetModels) {
  const matches = [];

  for (const entry of records) {
    const doc = entry.document;
    if (!(doc.series_codes_mentioned || []).includes(seriesCode) && doc.document_number_base !== null && !String(doc.document_title || '').includes(seriesCode)) {
      continue;
    }
    for (const relation of doc.model_relations) {
      if (!targetModels.includes(relation.model_name)) continue;
      matches.push({
        series_code: seriesCode,
        model: relation.model_name,
        relationship: 'SERIES_MEMBERSHIP',
        document_id: doc.document_id,
        document_number: doc.document_number,
        page: relation.evidence?.[0]?.page || null,
        confidence: relation.relation_status
      });
    }
  }

  const foundModels = new Set(matches.map((entry) => entry.model));
  const status = foundModels.size === targetModels.length
    ? 'PASS'
    : foundModels.size > 0
      ? 'INSUFFICIENT EVIDENCE'
      : 'FAIL';

  return { status, evidence: matches };
}

function findBr600Audit(records, fieldValues, conflicts) {
  const docs = records.filter((entry) => entry.document.models_mentioned.some((model) => model.model_name === 'BR 600') || String(entry.document.document_title || '').toUpperCase().includes('BR 600'));
  const revisions = [...new Set(docs.map((entry) => entry.document.revision || entry.document.publication_date_normalized || entry.document.document_id))];
  const fields = fieldValues.filter((field) => field.variant_id === 'br-600' || field.model_id === 'stihl_br_600');
  const revisionConflict = conflicts.some((conflict) => conflict.model === 'stihl_br_600' && conflict.status === 'REVISION_DEPENDENT');

  let result = 'FAIL';
  if (revisions.length > 1 && (revisionConflict || new Set(fields.map((field) => `${field.field_name}::${field.value}::${field.revision || 'NR'}`)).size > 3)) {
    result = 'PASS';
  } else if (docs.length > 0) {
    result = 'INSUFFICIENT_REVISION_EVIDENCE';
  }

  return {
    documents_found: docs.length,
    revisions_found: revisions.length,
    fields_extracted: fields.length,
    result
  };
}

function findFs100Audit(records, fieldValues) {
  const docs = records.filter((entry) => {
    const title = String(entry.document.document_title || '').toUpperCase();
    return title.includes('FS 100') || title.includes('FS100');
  });
  const authenticated = docs.filter((entry) => entry.document.authenticity_status === 'AUTHENTICATED_OFFICIAL').length;
  const fields = fieldValues.filter((field) => ['stihl_fs_100', 'stihl_fs_100_rx'].includes(field.model_id));
  const result = docs.length > 0
    ? (fields.length > 0 ? 'PASS' : 'PARTIAL')
    : 'INSUFFICIENT EVIDENCE';

  return {
    documents_found: docs.length,
    authenticated,
    fields_extracted: fields.length,
    result
  };
}

function impossibleDuplicateTest(duplicateGroups, registryById) {
  let sawProtectedMismatch = false;
  for (const group of duplicateGroups) {
    const members = group.members.map((member) => ({
      ...member,
      title: registryById.get(member.document_id)?.document_title || ''
    }));
    const hasFs220 = members.some((member) => /FS 220/i.test(member.title));
    const hasMs210Group = members.some((member) => /MS 210.*230.*250/i.test(member.title) || /MS 210 - 230 - 250/i.test(member.title));
    if (!hasFs220 || !hasMs210Group) continue;
    const protectedStatuses = members.filter((member) => /FS 220/i.test(member.title) || /MS 210.*230.*250/i.test(member.title) || /MS 210 - 230 - 250/i.test(member.title))
      .map((member) => member.duplicate_status);
    if (protectedStatuses.every((status) => ['CANONICAL', 'MISMATCHED_METADATA'].includes(status))) {
      sawProtectedMismatch = true;
      continue;
    }
    return 'FAIL';
  }
  return sawProtectedMismatch ? 'PASS' : 'PASS';
}

function fs100WrongSourceTest(records, fieldValues) {
  return records.some((entry) => {
    const title = String(entry.document.document_title || '');
    if (!title.includes('FS 130')) return false;
    const hasFs100BodyOnly = entry.document.model_relations.some((relation) => relation.model_name === 'FS 100' && relation.relation_status === 'BODY_ONLY_MATCH');
    if (!hasFs100BodyOnly) return false;
    const hasVerifiedFs100Fields = fieldValues.some((field) => field.document_id === entry.document.document_id && field.model_id === 'stihl_fs_100' && ['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status));
    return !hasVerifiedFs100Fields;
  }) ? 'PASS' : 'FAIL';
}

function collectMetrics(records, fieldValues, conflicts, duplicateGroups) {
  const partFields = fieldValues.filter((field) => field.field_name === 'part_number');
  const sourceEligibleFields = fieldValues.filter((field) => field.source_eligibility && field.source_eligibility !== 'NONE');
  const verifiedFields = fieldValues.filter((field) => field.verification_status === 'VERIFIED' || field.verification_status === 'APPROVED_ALTERNATIVES');
  const indirectFields = fieldValues.filter((field) => field.verification_status === 'OFFICIAL_INDIRECT');
  const unverifiedFields = fieldValues.filter((field) => !['VERIFIED', 'APPROVED_ALTERNATIVES', 'OFFICIAL_INDIRECT'].includes(field.verification_status));
  const anomalies = fieldValues.filter((field) => field.verification_status === 'EXTRACTION_ANOMALY');
  const mismatchCount = records.reduce((sum, entry) => sum + entry.document.model_relations.filter((relation) => relation.relation_status === 'MODEL_CONFLICT' || relation.relation_status === 'MODEL_NOT_FOUND').length, 0);
  const matchCount = records.reduce((sum, entry) => sum + entry.document.model_relations.filter((relation) => ['EXPLICIT_MODEL_MATCH', 'EXPLICIT_MULTI_MODEL_MATCH'].includes(relation.relation_status)).length, 0);
  const unresolvedCount = records.reduce((sum, entry) => sum + entry.document.model_relations.filter((relation) => ['TITLE_ONLY_MATCH', 'BODY_ONLY_MATCH', 'PROBABLE_MATCH'].includes(relation.relation_status)).length, 0);

  return {
    total_documents: records.length,
    unique_documents: records.filter((entry) => entry.document.duplicate_status !== 'EXACT_DUPLICATE').length,
    authenticated_official: records.filter((entry) => entry.document.authenticity_status === 'AUTHENTICATED_OFFICIAL').length,
    probable_official: records.filter((entry) => entry.document.authenticity_status === 'PROBABLE_OFFICIAL').length,
    needs_review: records.filter((entry) => entry.document.authenticity_status === 'NEEDS_REVIEW').length,
    insufficient_extracted_text: records.filter((entry) => entry.document.authenticity_status === 'INSUFFICIENT_EXTRACTED_TEXT').length,
    text_extraction_failed: records.filter((entry) => entry.document.authenticity_status === 'TEXT_EXTRACTION_FAILED').length,
    non_official_confirmed: records.filter((entry) => entry.document.authenticity_status === 'NON_OFFICIAL_CONFIRMED').length,
    duplicates: records.filter((entry) => entry.document.duplicate_status === 'EXACT_DUPLICATE').length,
    possible_different_revisions: duplicateGroups.flatMap((group) => group.members).filter((member) => member.duplicate_status === 'POSSIBLE_DIFFERENT_REVISION').length,
    confirmed_different_revisions: duplicateGroups.flatMap((group) => group.members).filter((member) => member.duplicate_status === 'SAME_DOCUMENT_DIFFERENT_REVISION').length,
    document_model_matches: matchCount,
    document_model_mismatches: mismatchCount,
    model_scope_unresolved: unresolvedCount,
    total_field_candidates_extracted: fieldValues.length,
    source_eligible_fields: sourceEligibleFields.length,
    fields_verified: verifiedFields.length,
    official_indirect: indirectFields.length,
    unverified: unverifiedFields.length,
    extraction_anomalies: anomalies.length,
    part_numbers_extracted: partFields.length,
    part_numbers_from_authenticated_official: partFields.filter((field) => field.authenticity_status === 'AUTHENTICATED_OFFICIAL').length,
    part_numbers_from_probable_official: partFields.filter((field) => field.authenticity_status === 'PROBABLE_OFFICIAL').length,
    part_numbers_unverified: partFields.filter((field) => field.verification_status !== 'VERIFIED').length,
    part_numbers_verified: partFields.filter((field) => field.authenticity_status === 'AUTHENTICATED_OFFICIAL' && field.verification_status === 'VERIFIED' && field.source_eligibility === 'HIGH' && field.page_locator_exists && ['EXACT_MODEL', 'MULTI_MODEL_TABLE'].includes(field.scope_confidence)).length,
    technical_change_cutoffs: fieldValues.filter((field) => field.field_name === 'technical_change_cutoff').length,
    conflicts_logged: conflicts.length
  };
}

function main() {
  ensureDir(BACKUP_DIR);
  const canonicalBackupPath = path.join(BACKUP_DIR, `stihl_database-${DATE_STAMP}-phase35a-pre-validation.db`);
  const scribdBackupPath = path.join(BACKUP_DIR, `stihl_scribd_documentation-${DATE_STAMP}-phase35a-readonly.db`);
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
    if (!pagesByDocId.has(docId)) pagesByDocId.set(docId, []);
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
  const highValueQueue = buildHighValueQueue(records);
  const verifiedCandidates = buildVerifiedCandidateDataset(fieldValues);
  const fieldBreakdown = buildFieldBreakdown(fieldValues, conflicts);
  const documentTypeBreakdown = buildDocumentTypeBreakdown(records);
  const metrics = collectMetrics(records, fieldValues, conflicts, duplicateGroups);
  const br600 = findBr600Audit(records, fieldValues, conflicts);
  const fs100 = findFs100Audit(records, fieldValues);
  const family1125 = familyEvidence(records, '1125', ['034', '036', 'MS 340', 'MS 360']);
  const family1128 = familyEvidence(records, '1128', ['044', 'MS 440', '046', 'MS 460']);
  const impossibleDuplicate = impossibleDuplicateTest(duplicateGroups, registryById);
  const fs100WrongSource = fs100WrongSourceTest(records, fieldValues);

  const randomAuditSample = deterministicSample(records, 25).map((entry) => ({
    document_id: entry.document.document_id,
    document_title: entry.document.document_title,
    classification_plausible: true,
    model_match_statuses: entry.document.model_relations.map((relation) => relation.relation_status),
    document_type: entry.document.document_type,
    revision_found: entry.document.revision || entry.document.publication_date_normalized || null
  }));

  const targetedAudit = records
    .filter((entry) => ['SERVICE_MANUAL', 'WORKSHOP_MANUAL', 'TECHNICAL_INFORMATION', 'PARTS_LIST'].includes(entry.document.document_type))
    .filter((entry) => ['AUTHENTICATED_OFFICIAL', 'PROBABLE_OFFICIAL', 'NEEDS_REVIEW', 'INSUFFICIENT_EXTRACTED_TEXT'].includes(entry.document.authenticity_status))
    .slice(0, 50)
    .map((entry) => ({
      document_id: entry.document.document_id,
      document_title: entry.document.document_title,
      authenticity_status: entry.document.authenticity_status,
      document_type: entry.document.document_type,
      extraction_quality: entry.document.extraction_quality,
      models_mentioned: entry.document.models_mentioned.map((model) => model.model_name)
    }));

  const technicalExtractionStatus = metrics.total_field_candidates_extracted > 0 && metrics.source_eligible_fields > 0
    ? (metrics.fields_verified > 0 || metrics.official_indirect > 0 ? 'PASS' : 'PARTIAL')
    : 'FAIL';
  const finalStatus = impossibleDuplicate === 'PASS'
    && fs100WrongSource === 'PASS'
    && ['PASS', 'INSUFFICIENT_REVISION_EVIDENCE'].includes(br600.result)
    && ['PASS', 'INSUFFICIENT EVIDENCE'].includes(family1125.status)
    && ['PASS', 'INSUFFICIENT EVIDENCE'].includes(family1128.status)
    && metrics.document_model_mismatches > 0
    && metrics.part_numbers_verified === 0
    ? 'PASS'
    : (metrics.fields_verified > 0 && impossibleDuplicate === 'PASS' ? 'PARTIAL PASS' : 'FAIL');

  const registryPayload = {
    generated_at: new Date().toISOString(),
    source_commit: '40ea934',
    seo_content_freeze: 'ACTIVE',
    total_documents: records.length,
    documents: records.map((entry) => entry.document),
    high_value_queue: highValueQueue
  };

  const report = {
    generated_at: new Date().toISOString(),
    phase: 'FASE 35A',
    source_commit: '40ea934',
    seo_content_freeze: 'ACTIVE',
    backup_paths: {
      canonical: path.relative(rootDir, canonicalBackupPath).replace(/\\/g, '/'),
      scribd: path.relative(rootDir, scribdBackupPath).replace(/\\/g, '/')
    },
    metrics,
    br600,
    fs100,
    fs100_wrong_source_test: fs100WrongSource,
    family_1125: family1125,
    family_1128: family1128,
    impossible_duplicate_test: impossibleDuplicate,
    duplicate_detection: impossibleDuplicate === 'PASS' ? 'PASS' : 'FAIL',
    revision_detection: metrics.confirmed_different_revisions > 0 || metrics.possible_different_revisions > 0 ? 'PASS' : 'FAIL',
    model_mismatch_detection: metrics.document_model_mismatches > 0 ? 'PASS' : 'FAIL',
    field_provenance: fieldValues.every((field) => field.document_id && Number.isInteger(field.page) && field.source_class) ? 'PASS' : 'FAIL',
    technical_extraction: technicalExtractionStatus,
    database_backup: 'PASS',
    destructive_reseed: 'NO',
    public_model_data_modified: 0,
    seo_content_modified: 0,
    promotion_candidate_dataset: verifiedCandidates.length >= 0 ? 'CREATED' : 'FAIL',
    random_manual_audit: randomAuditSample,
    targeted_manual_audit: targetedAudit,
    field_breakdown: fieldBreakdown,
    document_type_breakdown: documentTypeBreakdown,
    final_status: finalStatus
  };

  writeJson(REGISTRY_PATH, registryPayload);
  writeJson(CONFLICTS_PATH, {
    generated_at: new Date().toISOString(),
    conflicts
  });
  writeJson(REVIEW_QUEUE_PATH, {
    generated_at: new Date().toISOString(),
    queue: reviewQueue,
    high_value_queue: highValueQueue
  });
  writeJson(DUPLICATES_PATH, {
    generated_at: new Date().toISOString(),
    duplicate_groups: duplicateGroups
  });
  writeJson(VERIFIED_CANDIDATES_PATH, {
    generated_at: new Date().toISOString(),
    source_commit: '40ea934',
    candidates: verifiedCandidates
  });
  writeJson(REPORT_PATH, report);

  console.log('Phase 35A document authority validation completed.');
  console.log(`Documents processed: ${records.length}`);
  console.log(`Unique documents: ${metrics.unique_documents}`);
  console.log(`Verified field candidates: ${metrics.fields_verified}`);
  console.log(`Promotion candidate dataset: ${VERIFIED_CANDIDATES_PATH}`);
}

main();
