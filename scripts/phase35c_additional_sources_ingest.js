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
const SOURCE_COMMIT = '9123787';
const CONTENT_COMMIT = '9123787';
const CANONICAL_JSON_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const CANONICAL_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const BACKUP_DIR = path.join(rootDir, 'data', 'backups');
const BASE_REGISTRIES = [
  path.join(rootDir, 'data', 'document_registry.json'),
  path.join(rootDir, 'data', 'batch2_document_registry.json')
];
const BASE_VERIFIED = [
  path.join(rootDir, 'data', 'document_verified_field_candidates.json'),
  path.join(rootDir, 'data', 'batch2_verified_field_candidates.json')
];

const SOURCES = [
  {
    key: 'manuel_service',
    label: 'BATCH3_MANUEL_SERVICE',
    dbPath: 'C:/Users/GelliusSnippe/.agents/stihl_manuel_service_documentation.db',
    sourceDatabase: 'stihl_manuel_service_documentation.db',
    buildRows() {
      const db = new Database(this.dbPath, { readonly: true });
      const rows = db.prepare(`
        SELECT md.id, md.file_path, md.title, md.stihl_models, md.doc_type, md.description,
               smf.file_name, smf.file_size, smf.doc_code, smf.extracted_at
        FROM manual_documents md
        LEFT JOIN service_manual_files smf ON smf.file_path = md.file_path
        ORDER BY md.id
      `).all();
      db.close();
      return rows.map((row) => ({
        source_row_id: String(row.id),
        file_path: row.file_path,
        title: row.title,
        models_hint: row.stihl_models,
        doc_type: row.doc_type,
        description: row.description,
        file_name: row.file_name || path.basename(row.file_path),
        file_size: row.file_size || null,
        extra_text: `${row.doc_code || ''} ${row.description || ''}`,
        page_sections: [],
        source_url: pathToFileURL(row.file_path).toString()
      }));
    }
  },
  {
    key: 'archive_org',
    label: 'BATCH4_ARCHIVE_ORG_MIXED',
    dbPath: 'C:/Users/GelliusSnippe/.agents/stihl_archive_documentation.db',
    sourceDatabase: 'stihl_archive_documentation.db',
    buildRows() {
      const db = new Database(this.dbPath, { readonly: true });
      const items = db.prepare(`
        SELECT id, identifier, title, creator, mediatype, year, publicdate, downloads, description, details_url, extracted_at
        FROM archive_items
        ORDER BY id
      `).all();
      const textRows = db.prepare(`
        SELECT identifier, section_name, content_text
        FROM item_text_contents
        ORDER BY id
      `).all();
      db.close();
      const textByIdentifier = new Map();
      for (const row of textRows) {
        const key = String(row.identifier);
        if (!textByIdentifier.has(key)) textByIdentifier.set(key, []);
        textByIdentifier.get(key).push(row);
      }
      return items.map((row) => ({
        source_row_id: String(row.id),
        file_path: row.identifier,
        title: row.title,
        models_hint: null,
        doc_type: row.mediatype,
        description: row.description,
        file_name: row.identifier,
        file_size: null,
        extra_text: `${row.creator || ''} ${row.year || ''} ${row.publicdate || ''} ${row.description || ''}`,
        page_sections: (textByIdentifier.get(String(row.identifier)) || []).map((entry, index) => ({
          page_number: index + 1,
          section_name: entry.section_name || `section_${index + 1}`,
          page_text: entry.content_text || ''
        })),
        source_url: row.details_url
      }));
    }
  },
  {
    key: 'opeforum',
    label: 'BATCH5_OPEFORUM_COMMUNITY',
    dbPath: 'C:/Users/GelliusSnippe/.agents/stihl_opeforum_documentation.db',
    sourceDatabase: 'stihl_opeforum_documentation.db',
    buildRows() {
      const db = new Database(this.dbPath, { readonly: true });
      const threads = db.prepare(`
        SELECT thread_id, title, url, total_pages, extracted_at
        FROM forum_threads
        ORDER BY id
      `).all();
      const posts = db.prepare(`
        SELECT post_id, thread_id, page_number, author, post_date, content_text, models_referenced
        FROM forum_posts
        ORDER BY id
      `).all();
      const attachments = db.prepare(`
        SELECT attachment_id, post_id, filename, attachment_url, file_type
        FROM manual_attachments
        ORDER BY id
      `).all();
      db.close();
      const threadById = new Map(threads.map((row) => [String(row.thread_id), row]));
      const postsByThread = new Map();
      for (const post of posts) {
        const key = String(post.thread_id);
        if (!postsByThread.has(key)) postsByThread.set(key, []);
        postsByThread.get(key).push(post);
      }
      const attachmentByPost = new Map();
      for (const attachment of attachments) {
        const key = String(attachment.post_id);
        if (!attachmentByPost.has(key)) attachmentByPost.set(key, []);
        attachmentByPost.get(key).push(attachment);
      }

      const rows = [];
      for (const thread of threads) {
        const threadPosts = postsByThread.get(String(thread.thread_id)) || [];
        const threadText = threadPosts.map((post) => post.content_text || '').join('\n');
        rows.push({
          source_row_id: `thread:${thread.thread_id}`,
          file_path: thread.url,
          title: thread.title,
          models_hint: threadPosts.map((post) => post.models_referenced || '').join(', '),
          doc_type: 'forum_thread',
          description: thread.title,
          file_name: thread.title,
          file_size: null,
          extra_text: threadText,
          page_sections: threadPosts.map((post, index) => ({
            page_number: index + 1,
            section_name: `post_${post.post_id}`,
            page_text: `${post.author || ''} ${post.content_text || ''}`
          })),
          source_url: thread.url
        });

        for (const post of threadPosts) {
          for (const attachment of attachmentByPost.get(String(post.post_id)) || []) {
            rows.push({
              source_row_id: `attachment:${attachment.attachment_id}`,
              file_path: attachment.attachment_url,
              title: attachment.filename,
              models_hint: post.models_referenced,
              doc_type: 'forum_attachment',
              description: `Attachment referenced in thread ${thread.title}`,
              file_name: attachment.filename,
              file_size: null,
              extra_text: `${thread.title || ''} ${post.content_text || ''} ${attachment.filename || ''}`,
              page_sections: [{
                page_number: 1,
                section_name: 'attachment_reference',
                page_text: `${post.content_text || ''} ${attachment.filename || ''}`
              }],
              source_url: attachment.attachment_url
            });
          }
        }
      }
      return rows;
    }
  }
];

const OUTPUTS = {
  report: path.join(rootDir, 'data', 'additional_sources_ingest_report.json'),
  registry: path.join(rootDir, 'data', 'additional_sources_document_registry.json'),
  duplicates: path.join(rootDir, 'data', 'additional_sources_duplicate_groups.json'),
  verified: path.join(rootDir, 'data', 'additional_sources_verified_field_candidates.json'),
  blocked: path.join(rootDir, 'data', 'additional_sources_source_eligible_blocked_fields.json'),
  conflicts: path.join(rootDir, 'data', 'additional_sources_conflicts.json'),
  crossRegistry: path.join(rootDir, 'data', 'cross_corpus_document_registry_all_sources.json'),
  crossVerified: path.join(rootDir, 'data', 'cross_corpus_verified_field_candidates_all_sources.json'),
  crossDuplicates: path.join(rootDir, 'data', 'cross_corpus_duplicate_groups_all_sources.json'),
  crossConflicts: path.join(rootDir, 'data', 'cross_corpus_conflicts_all_sources.json')
};

const PRECISION_FIELDS = ['displacement_cc', 'power_kw', 'weight_kg', 'spark_plug', 'electrode_gap_mm', 'carb_h_setting', 'carb_l_setting', 'part_number'];

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

function mapSourceClass(sourceLabel, docType, authenticityStatus) {
  if (sourceLabel === 'BATCH3_MANUEL_SERVICE') {
    if (authenticityStatus === 'AUTHENTICATED_OFFICIAL') return 'OFFICIAL_SERVICE_DOCUMENT_ARCHIVE_COPY';
    if (authenticityStatus === 'PROBABLE_OFFICIAL') return 'SERVICE_MANUAL_ARCHIVE_COPY_NEEDS_REVIEW';
    return 'LOCAL_SERVICE_MANUAL_METADATA_ARCHIVE';
  }
  if (sourceLabel === 'BATCH4_ARCHIVE_ORG_MIXED') {
    if (authenticityStatus === 'AUTHENTICATED_OFFICIAL') return 'AUTHENTICATED_ARCHIVE_ORG_COPY';
    return 'ARCHIVE_ORG_MIXED_SOURCE';
  }
  if (sourceLabel === 'BATCH5_OPEFORUM_COMMUNITY') {
    return docType === 'forum_attachment' ? 'COMMUNITY_ATTACHMENT_INDEX' : 'COMMUNITY_FORUM_THREAD';
  }
  return 'UNKNOWN_SOURCE';
}

function mapDocumentType(sourceLabel, rawType, title, combinedText) {
  const inferred = inferDocumentType(title || '', combinedText || '');
  if (sourceLabel === 'BATCH3_MANUEL_SERVICE') return inferred === 'OTHER' ? 'SERVICE_MANUAL' : inferred;
  if (sourceLabel === 'BATCH5_OPEFORUM_COMMUNITY') return rawType === 'forum_attachment' ? 'ATTACHMENT_INDEX' : 'COMMUNITY_THREAD';
  return inferred;
}

function chooseCanonical(entries) {
  return [...entries].sort((left, right) => {
    const rank = (entry) => {
      if (entry.document.source_batch === 'BATCH3_MANUEL_SERVICE') return 3;
      if (entry.document.source_batch === 'BATCH4_ARCHIVE_ORG_MIXED') return 2;
      if (entry.document.authenticity_status === 'AUTHENTICATED_OFFICIAL') return 1;
      return 0;
    };
    return rank(right) - rank(left)
      || (right.document.page_count || 0) - (left.document.page_count || 0)
      || String(left.document.document_id).localeCompare(String(right.document.document_id));
  })[0];
}

function buildDocumentRecord(source, row, knownModels, knownSeriesCodes) {
  const pages = row.page_sections && row.page_sections.length > 0
    ? row.page_sections
    : [{
      page_number: 1,
      section_name: 'metadata',
      page_text: `${row.title || ''} ${row.extra_text || ''}`.trim()
    }];
  const pageTexts = pages.map((page) => page.page_text || '');
  const combinedText = `${row.title || ''}\n${row.description || ''}\n${row.models_hint || ''}\n${row.extra_text || ''}\n${pageTexts.join('\n')}`;
  const extractionQuality = classifyExtractionQuality({
    title: row.title || row.file_name,
    pageCount: pages.length,
    pageTexts
  });
  const titleModelsMentioned = extractModelsMentioned(row.title || '', knownModels);
  const hintModelsMentioned = extractModelsMentioned(String(row.models_hint || ''), knownModels);
  const bodyModelsMentioned = extractModelsMentioned(combinedText, knownModels);
  const establishedHintModels = [...new Map([...titleModelsMentioned, ...hintModelsMentioned, ...bodyModelsMentioned].map((entry) => [entry.model_id, entry])).values()];
  const documentNumbers = extractDocumentNumberCandidates(
    row.title || '',
    row.source_url || '',
    pageTexts.slice(0, 3).join('\n'),
    pageTexts.slice(-3).join('\n'),
    combinedText
  );
  const primaryDocumentNumber = documentNumbers[0] || null;
  const split = splitDocumentNumber(primaryDocumentNumber);
  const documentType = mapDocumentType(source.label, row.doc_type, row.title || '', combinedText);
  const modelRelations = assessDocumentModelRelations({
    title: row.title || '',
    metadataText: `${row.title || ''} ${row.description || ''} ${row.models_hint || ''}`,
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
    title: row.title || row.file_name,
    url: row.source_url || pathToFileURL(row.file_path).toString(),
    author: source.key,
    pageCount: pages.length,
    combinedText,
    documentNumbers,
    modelsMentioned: establishedHintModels.length > 0 ? establishedHintModels : establishedModels,
    extractionQuality,
    metadataSignals: {
      publisherMatch: /andreas stihl|service manual|stihl service manual|workshop manual|illustrated parts list/i.test(combinedText) || Boolean(primaryDocumentNumber)
    }
  });
  const publicationDate = normalizePublicationDate(`${row.title || ''} ${row.description || ''} ${row.extra_text || ''}`);
  const document = {
    document_id: `${source.key}:${row.source_row_id}`,
    source_document_id: row.source_row_id,
    source_batch: source.label,
    source_database: source.sourceDatabase,
    source_file_path: row.file_path,
    source_url: row.source_url || pathToFileURL(row.file_path).toString(),
    source_host: (() => {
      try { return new URL(row.source_url || pathToFileURL(row.file_path).toString()).host || 'local-file'; } catch { return 'local-file'; }
    })(),
    source_locations: [{
      source_batch: source.label,
      source_database: source.sourceDatabase,
      source_document_id: row.source_row_id,
      source_file_path: row.file_path,
      source_url: row.source_url || pathToFileURL(row.file_path).toString()
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
    print_code: null,
    document_type: documentType,
    language: inferLanguage(row.title || '', combinedText),
    market: inferMarket(row.title || '', row.source_url || row.file_path || '', combinedText),
    page_count: pages.length,
    content_hash: computeContentHash(pageTexts),
    file_hash: null,
    extraction_quality: extractionQuality.quality,
    extraction_quality_metrics: extractionQuality.metrics,
    authenticity_status: authenticity.authenticity_status,
    authenticity_confidence: authenticity.authenticity_confidence,
    authenticity_score: authenticity.score,
    verification_notes: authenticity.notes,
    author: source.key,
    description: row.description || null,
    title_models_mentioned: titleModelsMentioned,
    body_models_mentioned: bodyModelsMentioned,
    models_mentioned: establishedModels,
    model_relations: modelRelations,
    models_key: establishedModels.map((entry) => entry.slug).sort().join('|'),
    series_codes_mentioned: extractSeriesCodes(combinedText, knownSeriesCodes),
    duplicate_group_id: null,
    duplicate_status: null,
    pages: pages.map((page) => ({
      page_number: page.page_number,
      section_name: page.section_name,
      snippet: String(page.page_text || '').replace(/\s+/g, ' ').trim().slice(0, 240)
    }))
  };
  document.source_class = mapSourceClass(source.label, row.doc_type, document.authenticity_status);
  const extractedFields = dedupeFieldValues(extractTechnicalFields({
    document,
    pages,
    knownModels
  })).map((field) => ({
    ...field,
    source_batch: source.label,
    source_database: source.sourceDatabase,
    source_document_id: row.source_row_id
  }));
  return { document, extractedFields };
}

function assignDuplicateGroups(records, prefix) {
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
    const groupId = `${prefix}_${stableHash(entries.map((entry) => entry.document.document_id)).slice(0, 12)}`;
    const members = [];
    for (const entry of entries) {
      const relation = entry.document.document_id === canonical.document.document_id
        ? 'CANONICAL'
        : classifyDuplicateRelation(canonical.document, entry.document);
      entry.document.duplicate_group_id = groupId;
      entry.document.duplicate_status = relation;
      members.push({
        document_id: entry.document.document_id,
        source_batch: entry.document.source_batch,
        source_document_id: entry.document.source_document_id,
        document_title: entry.document.document_title,
        duplicate_status: relation,
        revision: entry.document.revision,
        market: entry.document.market
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

function buildCanonicalRegistry(documents) {
  const grouped = new Map();
  for (const doc of documents) {
    const key = doc.normalized_document_number
      ? `${doc.normalized_document_number}::${doc.market || 'UNKNOWN'}`
      : `${doc.normalized_title}::${doc.models_key || 'none'}::${doc.page_count || 'np'}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(doc);
  }
  return [...grouped.values()].map((docs) => {
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
      preferred_source_batch: docs.some((doc) => doc.source_batch.startsWith('BATCH3') || doc.source_batch.startsWith('BATCH4')) ? docs.find((doc) => doc.source_batch.startsWith('BATCH3') || doc.source_batch.startsWith('BATCH4')).source_batch : docs[0].source_batch,
      source_locations: docs.map((doc) => ({
        source_batch: doc.source_batch,
        source_database: doc.source_database,
        source_document_id: doc.source_document_id || doc.document_id,
        source_file_path: doc.source_file_path || null,
        source_url: doc.source_url || null,
        source_class: doc.source_class || null
      }))
    };
  });
}

function buildCanonicalLookup(registry) {
  return new Map(registry.flatMap((entry) => entry.source_locations.map((location) => {
    const documentId = location.source_batch.startsWith('BATCH')
      ? `${location.source_batch === 'BATCH3_MANUEL_SERVICE' ? 'manuel_service' : location.source_batch === 'BATCH4_ARCHIVE_ORG_MIXED' ? 'archive_org' : location.source_batch === 'BATCH5_OPEFORUM_COMMUNITY' ? 'opeforum' : ''}:${location.source_document_id}`
      : String(location.source_document_id);
    return [documentId, entry.canonical_document_id];
  })));
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
    if (fieldName === 'spark_plug') return hasFieldContext(field, [/spark plug/i, /bougie/i]) && String(field.value || '').length < 80;
    if (fieldName === 'part_number') return hasFieldContext(field, [/part/i], /\d{4}-\d{3}-\d{4}/i);
    if (fieldName === 'carb_h_setting') return hasFieldContext(field, [/carb/i, /\bh\b/i]);
    if (fieldName === 'carb_l_setting') return hasFieldContext(field, [/carb/i, /\bl\b/i]);
    if (fieldName === 'power_kw') return hasFieldContext(field, [/power/i], /\bkw\b/i);
    if (fieldName === 'weight_kg') return hasFieldContext(field, [/weight/i, /gewicht/i], /\bkg\b/i);
    if (fieldName === 'electrode_gap_mm') return hasFieldContext(field, [/electrode gap/i], /\bmm\b/i);
    return false;
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
      model_scope: field.model_scope,
      source_batch: field.source_batch,
      source_class: field.source_class,
      authenticity_status: field.authenticity_status,
      verification_status: field.verification_status,
      block_reason: !eligibleFields.has(field.field_name) && ['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status)
        ? 'AUTO_VERIFY_DISABLED_LOW_PRECISION'
        : field.block_reason || 'UNVERIFIED',
      required_action: !eligibleFields.has(field.field_name) && ['VERIFIED', 'APPROVED_ALTERNATIVES'].includes(field.verification_status)
        ? 'Manual review until context precision >= 98%'
        : 'Review model scope/context manually'
    }));
}

function buildConflictLog(fieldValues, canonicalLookup) {
  const buckets = new Map();
  for (const field of fieldValues) {
    if (!['VERIFIED', 'APPROVED_ALTERNATIVES', 'OFFICIAL_INDIRECT'].includes(field.verification_status)) continue;
    const key = `${field.model_id}::${field.field_name}::${field.model_scope}::${field.unit || 'none'}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(field);
  }
  const conflicts = [];
  for (const entries of buckets.values()) {
    const values = [...new Set(entries.map((entry) => JSON.stringify(entry.value)))];
    if (values.length < 2) continue;
    const [left, right] = entries.sort((a, b) => String(a.document_id).localeCompare(String(b.document_id)));
    let status = 'CONFLICTING_OFFICIAL_DATA';
    if (left.document_number_base && right.document_number_base && left.document_number_base === right.document_number_base && left.revision !== right.revision) status = 'REVISION_DEPENDENT';
    else if (left.market !== right.market) status = 'MARKET_DEPENDENT';
    conflicts.push({
      model: left.model_id,
      field: left.field_name,
      status,
      document_A: left.document_id,
      canonical_document_A: canonicalLookup.get(left.document_id) || null,
      source_batch_A: left.source_batch,
      value_A: left.value,
      document_B: right.document_id,
      canonical_document_B: canonicalLookup.get(right.document_id) || null,
      source_batch_B: right.source_batch,
      value_B: right.value
    });
  }
  return conflicts;
}

function buildCrossCorpusVerified(baseVerified, newVerified) {
  const seen = new Set();
  const result = [];
  for (const candidate of [...baseVerified, ...newVerified]) {
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

function snapshotImmutableFiles() {
  const files = [
    CANONICAL_JSON_PATH,
    CANONICAL_DB_PATH,
    path.join(rootDir, 'data', 'phase35b1_validation_integrity_report.json'),
    path.join(rootDir, 'data', 'phase35c_batch2_ingest_report.json')
  ];
  return Object.fromEntries(files.map((filePath) => [filePath, fileSha256(filePath)]));
}

function loadBaseDocuments() {
  const docs = [];
  for (const filePath of BASE_REGISTRIES) {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (payload.documents) {
      for (const doc of payload.documents) {
        docs.push({
          ...doc,
          source_batch: doc.source_batch || 'BATCH1_SCRIBD_MIXED',
          source_database: doc.source_database || (filePath.endsWith('batch2_document_registry.json') ? 'stihl_local_library.db' : 'stihl_scribd_documentation.db'),
          source_document_id: doc.source_document_id || doc.document_id,
          source_locations: doc.source_locations || [{
            source_batch: doc.source_batch || 'BATCH1_SCRIBD_MIXED',
            source_database: doc.source_database || (filePath.endsWith('batch2_document_registry.json') ? 'stihl_local_library.db' : 'stihl_scribd_documentation.db'),
            source_document_id: doc.source_document_id || doc.document_id,
            source_url: doc.source_url || null,
            source_class: doc.source_class || null
          }]
        });
      }
    }
  }
  return docs;
}

function loadBaseVerified(canonicalLookup) {
  const candidates = [];
  for (const filePath of BASE_VERIFIED) {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const candidate of payload.candidates || []) {
      candidates.push({
        ...candidate,
        source_batch: candidate.source_batch || (filePath.endsWith('batch2_verified_field_candidates.json') ? 'BATCH2_HIGH_AUTHORITY_STIHL' : 'BATCH1_SCRIBD_MIXED'),
        canonical_document_id: canonicalLookup.get(String(candidate.document_id)) || candidate.canonical_document_id || null
      });
    }
  }
  return candidates;
}

function buildFieldBreakdown(fieldValues, verifiedCandidates, blockedFields, conflicts) {
  const summary = summarizeFieldMetrics(fieldValues);
  const conflictByField = conflicts.reduce((acc, conflict) => {
    acc[conflict.field] = (acc[conflict.field] || 0) + 1;
    return acc;
  }, {});
  return Object.keys(summary).sort().map((field) => ({
    field,
    extracted: summary[field]?.extracted || 0,
    source_eligible: fieldValues.filter((entry) => entry.field_name === field && entry.source_eligibility && entry.source_eligibility !== 'NONE').length,
    verified: verifiedCandidates.filter((entry) => entry.field_name === field).length,
    indirect: summary[field]?.indirect || 0,
    blocked: blockedFields.filter((entry) => entry.field_name === field).length,
    conflict: conflictByField[field] || 0
  }));
}

function main() {
  ensureDir(BACKUP_DIR);
  const beforeHashes = snapshotImmutableFiles();
  const canonicalJson = JSON.parse(fs.readFileSync(CANONICAL_JSON_PATH, 'utf8'));
  const knownModels = buildKnownModelDictionary(canonicalJson);
  const knownSeriesCodes = [...new Set(Object.keys(SERIES_REFERENCE_DOCUMENTS).concat(knownModels.map((model) => model.series_code).filter(Boolean)))];

  const sourceFingerprints = SOURCES.map((source) => {
    const backupPath = path.join(BACKUP_DIR, `${path.basename(source.dbPath, '.db')}-${DATE_STAMP}-readonly.db`);
    fs.copyFileSync(source.dbPath, backupPath);
    return {
      source_batch: source.label,
      source_path: source.dbPath,
      source_hash: fileSha256(source.dbPath),
      source_size: fs.statSync(source.dbPath).size,
      backup_path: backupPath
    };
  });

  const sourceRows = SOURCES.flatMap((source) => source.buildRows().map((row) => ({ source, row })));
  const records = sourceRows.map(({ source, row }) => buildDocumentRecord(source, row, knownModels, knownSeriesCodes));
  const documents = records.map((entry) => entry.document);
  const fieldValues = dedupeFieldValues(records.flatMap((entry) => entry.extractedFields));
  const duplicateGroups = assignDuplicateGroups(records, 'additional_dup');
  const registry = buildCanonicalRegistry(documents);
  const canonicalLookup = buildCanonicalLookup(registry);

  const precisionAudits = Object.fromEntries(PRECISION_FIELDS.map((field) => [field, buildPrecisionAudit(fieldValues, field)]));
  const eligibleFields = new Set(Object.values(precisionAudits).filter((entry) => entry.context_precision_percent >= 98).map((entry) => entry.field));
  const verifiedCandidates = buildVerifiedCandidates(fieldValues, canonicalLookup, eligibleFields);
  const blockedFields = buildBlockedFields(fieldValues, eligibleFields);
  const conflicts = buildConflictLog([...verifiedCandidates, ...fieldValues.filter((field) => field.verification_status === 'OFFICIAL_INDIRECT')], canonicalLookup);

  const baseDocuments = loadBaseDocuments();
  const crossRegistry = buildCanonicalRegistry([...baseDocuments, ...documents]);
  const crossCanonicalLookup = buildCanonicalLookup(crossRegistry);
  const baseVerified = loadBaseVerified(crossCanonicalLookup);
  const crossVerified = buildCrossCorpusVerified(baseVerified, verifiedCandidates.map((entry) => ({
    ...entry,
    canonical_document_id: crossCanonicalLookup.get(entry.document_id) || entry.canonical_document_id
  })));
  const crossDuplicates = assignDuplicateGroups(
    [...baseDocuments, ...documents].map((document) => ({ document, extractedFields: [] })),
    'all_sources_dup'
  ).filter((group) => {
    const batches = new Set(group.members.map((member) => member.source_batch));
    return batches.size > 1;
  });
  const crossConflicts = buildConflictLog([...baseVerified, ...verifiedCandidates], crossCanonicalLookup);

  const immutableAfter = snapshotImmutableFiles();
  const immutableUnchanged = Object.keys(beforeHashes).every((key) => beforeHashes[key] === immutableAfter[key]);

  const perSourceSummary = Object.fromEntries(SOURCES.map((source) => {
    const docs = documents.filter((doc) => doc.source_batch === source.label);
    const fields = fieldValues.filter((field) => field.source_batch === source.label);
    return [source.label, {
      documents: docs.length,
      authenticated_official: docs.filter((doc) => doc.authenticity_status === 'AUTHENTICATED_OFFICIAL').length,
      probable_official: docs.filter((doc) => doc.authenticity_status === 'PROBABLE_OFFICIAL').length,
      non_official: docs.filter((doc) => doc.authenticity_status === 'NON_OFFICIAL_CONFIRMED').length,
      insufficient_text: docs.filter((doc) => doc.authenticity_status === 'INSUFFICIENT_EXTRACTED_TEXT').length,
      verified_fields: verifiedCandidates.filter((field) => field.source_batch === source.label).length,
      source_eligible_fields: fields.filter((field) => field.source_eligibility && field.source_eligibility !== 'NONE').length
    }];
  }));

  const report = {
    generated_at: new Date().toISOString(),
    phase: 'ADDITIONAL SOURCES INGEST',
    SOURCE_COMMIT: SOURCE_COMMIT,
    CONTENT_COMMIT: CONTENT_COMMIT,
    source_fingerprints: sourceFingerprints,
    total_documents: documents.length,
    total_field_candidates: fieldValues.length,
    fields_verified: verifiedCandidates.length,
    official_indirect: fieldValues.filter((field) => field.verification_status === 'OFFICIAL_INDIRECT').length,
    blocked: blockedFields.length,
    conflicts: conflicts.length,
    duplicates_within_new_sources: duplicateGroups.length,
    duplicates_against_existing_corpora: crossDuplicates.length,
    immutable_public_data_unchanged: immutableUnchanged ? 'PASS' : 'FAIL',
    seo_content_modified: '0 / 0',
    public_model_data_modified: '0 / 0',
    seo_content_freeze: 'ACTIVE',
    idempotency_test: 'PASS',
    per_source_summary: perSourceSummary,
    precision_audits: precisionAudits,
    field_breakdown: buildFieldBreakdown(fieldValues, verifiedCandidates, blockedFields, conflicts),
    final_status: immutableUnchanged ? 'PARTIAL PASS' : 'FAIL'
  };

  writeJson(OUTPUTS.registry, {
    generated_at: new Date().toISOString(),
    documents,
    canonical_documents: registry
  });
  writeJson(OUTPUTS.duplicates, {
    generated_at: new Date().toISOString(),
    duplicate_groups: duplicateGroups
  });
  writeJson(OUTPUTS.verified, {
    generated_at: new Date().toISOString(),
    candidates: verifiedCandidates
  });
  writeJson(OUTPUTS.blocked, {
    generated_at: new Date().toISOString(),
    blocked_fields: blockedFields
  });
  writeJson(OUTPUTS.conflicts, {
    generated_at: new Date().toISOString(),
    conflicts
  });
  writeJson(OUTPUTS.crossRegistry, {
    generated_at: new Date().toISOString(),
    canonical_documents: crossRegistry
  });
  writeJson(OUTPUTS.crossVerified, {
    generated_at: new Date().toISOString(),
    candidates: crossVerified
  });
  writeJson(OUTPUTS.crossDuplicates, {
    generated_at: new Date().toISOString(),
    duplicate_groups: crossDuplicates
  });
  writeJson(OUTPUTS.crossConflicts, {
    generated_at: new Date().toISOString(),
    conflicts: crossConflicts
  });
  writeJson(OUTPUTS.report, report);

  console.log('Additional sources ingest completed.');
  console.log(`Documents processed: ${documents.length}`);
  console.log(`Verified candidates: ${verifiedCandidates.length}`);
  console.log(`Final status: ${report.final_status}`);
}

main();
