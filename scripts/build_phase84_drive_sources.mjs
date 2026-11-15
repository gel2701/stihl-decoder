#!/usr/bin/env node
/**
 * scripts/build_phase84_drive_sources.mjs
 *
 * Phase 84 — Drive source intake.
 *
 * Records what the shared Google Drive folder actually contains, what each
 * source yields for the STIHL catalog, and which candidates still lack proof.
 * It never writes to the catalog: candidates stay in a work queue until their
 * identity is complete.
 *
 * Inputs (downloaded archives, not tracked in the repo):
 *   PHASE84_SCRIBD_DIR   directory with the exported Scribd .md documents
 *   PHASE84_LOCAL_DB     path to stihl_local_library.db
 *   PHASE84_OPEFORUM_DB  path to stihl_opeforum_documentation.db
 *   PHASE84_USA_KG       path to stihlusa_knowledge_graph.json
 *
 * Every input that is absent is recorded as ABSENT_IN_ENV; the script still
 * produces a valid artifact so CI and tests never depend on the archives.
 *
 * Usage:
 *   PHASE84_SCRIBD_DIR=/tmp/gd/scribd \
 *   PHASE84_LOCAL_DB=/tmp/gd/stihl_local_library.db \
 *   PHASE84_OPEFORUM_DB=/tmp/gd/stihl_opeforum_documentation.db \
 *   PHASE84_USA_KG=/tmp/gd/stihlusa_knowledge_graph.json \
 *   node scripts/build_phase84_drive_sources.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const scribdDir = process.env.PHASE84_SCRIBD_DIR || '';
const localDbPath = process.env.PHASE84_LOCAL_DB || '';
const opeforumDbPath = process.env.PHASE84_OPEFORUM_DB || '';
const usaKgPath = process.env.PHASE84_USA_KG || '';
const outPath = path.join(rootDir, 'output', 'phase84', 'PHASE84_DRIVE_SOURCES.json');

const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
const knownParts = new Set(catalog.parts.map((p) => p.part_number));

/** The fifteen archives Phase 84 asked for. */
const REQUESTED_ARCHIVES = [
  'stihl_archive_documentation.db',
  'stihl_archive_official_documentation.zip',
  'stihl_archive_official_documentation_v2.zip',
  'stihl_gardenhirespares_chainsaws_archive.zip',
  'stihl_gardenhirespares_semantic_archive.zip',
  'stihl_local_library.db',
  'stihl_manuel_service_documentation.db',
  'stihl_models_documentation_archive.zip',
  'stihl_models_full_documentation_archive.zip',
  'stihl_opeforum_documentation.db',
  'stihl_parts_knowledge_graph.json',
  'stihl_scribd_documentation.db',
  'stihl_scribd_official_documents_archive.zip',
  'stihlusa_knowledge_graph.json',
  'stihlusa_semantic_archive.zip'
];

const normaliseNumber = (value) => String(value || '').replace(/\D/g, '').slice(0, 11);
const isPartNumber = (value) => /^\d{11}$/.test(value);
const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

/* ---------------------------------------------------------------- Scribd --- */

function readScribdDocs() {
  if (!scribdDir || !fs.existsSync(scribdDir)) return null;
  const files = fs.readdirSync(scribdDir).filter((f) => f.endsWith('.md'));
  const docs = [];
  for (const file of files) {
    const text = readText(path.join(scribdDir, file));
    if (!text) continue;
    const pages = [...text.matchAll(/```text\s*([\s\S]*?)```/g)].map((m) => m[1]);
    const synopsis = (text.match(/## 2\. Document Description & Synopsis\s*([\s\S]*?)---/) || [])[1] || '';
    const realPages = pages.filter((p) => p.trim().length > 400 && !synopsis.includes(p.trim().slice(0, 100)));
    docs.push({
      file,
      title: (text.match(/\*\*Document Title\*\*: (.*)/) || [])[1]?.trim() || file,
      documentId: (text.match(/\*\*Scribd Document ID\*\*: (\d+)/) || [])[1] || null,
      url: (text.match(/\*\*Original Scribd Document URL\*\*: \[([^\]]+)\]/) || [])[1] || null,
      stub: /Full page text layer indexed/.test(text),
      pages,
      realPages,
      synopsis
    });
  }
  return docs;
}

function extractCarburetorRows(docs) {
  const doc = docs.find((d) => /walbro/i.test(d.title + ' ' + d.synopsis) && /cross\s*reference/i.test(d.title + ' ' + d.synopsis));
  if (!doc) return { document: null, rows: [] };
  const numberRe = /(\d{4})\s*-?\s*(\d{3})\s*-?\s*(\d{3})\s*-?\s*(\d)(?!\d)/g;
  const rows = [];
  for (const raw of doc.realPages) {
    const text = raw.replace(/\s+/g, ' ');
    numberRe.lastIndex = 0;
    let match;
    let cursor = 0;
    while ((match = numberRe.exec(text))) {
      const partNumber = normaliseNumber(match[1] + match[2] + match[3] + match[4]);
      const segment = text.slice(cursor, match.index).trim();
      cursor = numberRe.lastIndex;
      if (segment.length < 8) continue;
      const carb = (segment.match(/(WA\s?\d+|WT[\s-]?\d+|WT[\s-]?F[\s-]?\d+|C1[QS][\s-]?[A-Z0-9]+|HU\s?\d+|C3A[\s-]?[A-Z0-9]+)/) || [])[0];
      const model = (segment.match(/(?:^|\s)(MS\s?\d{3}[A-Z]*|\d{3}[A-Z]*|[A-Z]{2}\s?\d{2,3}(?:\s?[A-Z])?)(?=\s+(?:Chain Saw|String Trimmer|Brush Cutter|Cut-?Off|Hedge|Blower|Trimmer))/i) || [])[0];
      rows.push({
        part_number: partNumber,
        carburetor: carb ? carb.replace(/\s+/g, ' ').trim() : null,
        model_text: model ? model.trim() : null,
        discontinued_in_source: /no\s?lo\s?nger\s?A\s?vai\s?lable/i.test(segment),
        source_text: segment.slice(-140)
      });
    }
  }
  const unique = new Map();
  for (const row of rows) {
    const key = `${row.part_number}|${row.carburetor || ''}|${row.model_text || ''}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return {
    document: { title: doc.title, document_id: doc.documentId, url: doc.url, pages_with_table_text: doc.realPages.length },
    rows: [...unique.values()].filter((row) => isPartNumber(row.part_number))
  };
}

/* ------------------------------------------------------- local library --- */

function inspectLocalLibrary() {
  if (!localDbPath || !fs.existsSync(localDbPath)) return null;
  const db = new Database(localDbPath, { readonly: true });
  const docTypes = db.prepare('select doc_type, count(*) c from manual_documents group by doc_type').all();
  const sections = db.prepare('select section_name, count(*) c from extracted_text_contents group by section_name').all();
  const rows = db.prepare('select file_path, content_text from extracted_text_contents').all();
  const docs = db.prepare('select file_path, title from manual_documents').all();
  const titleByPath = new Map(docs.map((d) => [d.file_path, d.title]));

  const numberRe = /\b(\d{4})[\s.\-]?(\d{3})[\s.\-]?(\d{4})\b/g;
  const seen = new Map();
  const supersessions = [];
  const supersedeRe = /\b(\d{4})[\s.\-]?(\d{3})[\s.\-]?(\d{4})\b[^.\n]{0,40}?(?:changed to|replaced by|superseded by|ersetzt durch|wird ersetzt|new:)[^.\n]{0,20}?\b(\d{4})[\s.\-]?(\d{3})[\s.\-]?(\d{4})\b/gi;
  for (const row of rows) {
    const text = String(row.content_text || '').replace(/\s+/g, ' ');
    numberRe.lastIndex = 0;
    let match;
    while ((match = numberRe.exec(text))) {
      const part = match[1] + match[2] + match[3];
      if (!seen.has(part)) {
        seen.set(part, {
          part_number: part,
          in_catalog: knownParts.has(part),
          source_text: text.slice(Math.max(0, match.index - 80), match.index + 100),
          document_title: titleByPath.get(row.file_path) || null
        });
      }
    }
    supersedeRe.lastIndex = 0;
    while ((match = supersedeRe.exec(text))) {
      const from = match[1] + match[2] + match[3];
      const to = match[4] + match[5] + match[6];
      if (from === to) continue;
      if (supersessions.some((s) => s.from_part === from && s.to_part === to)) continue;
      supersessions.push({
        from_part: from,
        to_part: to,
        document_title: titleByPath.get(row.file_path) || null,
        source_text: text.slice(Math.max(0, match.index - 40), match.index + 160)
      });
    }
  }
  db.close();
  return {
    document_types: docTypes,
    text_sections: sections,
    part_numbers_seen: seen.size,
    part_numbers_missing_from_catalog: [...seen.values()].filter((v) => !v.in_catalog),
    supersession_statements: supersessions
  };
}

/* ------------------------------------------------------------ opeforum --- */

function inspectOpeforum() {
  if (!opeforumDbPath || !fs.existsSync(opeforumDbPath)) return null;
  const db = new Database(opeforumDbPath, { readonly: true });
  const posts = db.prepare('select content_text, models_referenced from forum_posts').all();
  const threads = db.prepare('select count(*) c from forum_threads').get().c;
  const attachments = db.prepare('select count(*) c from manual_attachments').get().c;
  const models = new Set();
  let withLongNumber = 0;
  for (const post of posts) {
    String(post.models_referenced || '')
      .split(/[,;]/)
      .map((m) => m.trim())
      .filter(Boolean)
      .forEach((m) => models.add(m));
    if (/\d{4}[\s.\-]?\d{3}[\s.\-]?\d{4}/.test(String(post.content_text || ''))) withLongNumber++;
  }
  db.close();
  return {
    threads,
    posts: posts.length,
    attachments,
    distinct_models_referenced: models.size,
    posts_with_11_digit_pattern: withLongNumber,
    note: 'Forum prose; no part number in this source is new to the catalog.'
  };
}

/* ----------------------------------------------------------- STIHL USA --- */

function inspectUsaKnowledgeGraph() {
  if (!usaKgPath || !fs.existsSync(usaKgPath)) return null;
  const kg = JSON.parse(fs.readFileSync(usaKgPath, 'utf8'));
  const records = Array.isArray(kg.records) ? kg.records : [];
  const withPartNumber = records.filter((r) => r.part && r.part.oem_part_number_normalized);
  const models = [...new Set(records.flatMap((r) => (r.compatibility || []).map((c) => c.canonical_model)).filter(Boolean))];
  return {
    records: records.length,
    record_types: [...new Set(records.map((r) => r.item_boundary_type))],
    records_with_part_number: withPartNumber.length,
    canonical_models: models.length,
    note: 'Machine model pages only: no part numbers, so no catalog or fitment records can be derived.'
  };
}

/* ---------------------------------------------------------------- build --- */

const docs = readScribdDocs();
const carb = docs ? extractCarburetorRows(docs) : { document: null, rows: [] };
const scribdNumbers = new Set();
let stubDocs = 0;
let docsWithRealText = 0;
if (docs) {
  for (const doc of docs) {
    if (doc.stub) stubDocs++;
    if (doc.realPages.length) docsWithRealText++;
    for (const page of doc.pages) {
      for (const match of page.matchAll(/\b(\d{4})[\s.\-]?(\d{3})[\s.\-]?(\d{4})\b/g)) {
        scribdNumbers.add(normaliseNumber(match[1] + match[2] + match[3]));
      }
    }
  }
}

const carbMissing = carb.rows.filter((row) => !knownParts.has(row.part_number));
const carbMissingUnique = [...new Map(carbMissing.map((row) => [row.part_number, row])).values()];

const sources = [
  {
    archive: 'stihl_local_library.db',
    status: localDbPath && fs.existsSync(localDbPath) ? 'PRESENT' : 'ABSENT_IN_ENV',
    inspected: inspectLocalLibrary()
  },
  {
    archive: 'stihl_opeforum_documentation.db',
    status: opeforumDbPath && fs.existsSync(opeforumDbPath) ? 'PRESENT' : 'ABSENT_IN_ENV',
    inspected: inspectOpeforum()
  },
  {
    archive: 'stihlusa_knowledge_graph.json',
    status: usaKgPath && fs.existsSync(usaKgPath) ? 'PRESENT' : 'ABSENT_IN_ENV',
    inspected: inspectUsaKnowledgeGraph()
  },
  {
    archive: 'stihl_scribd_documentation.db',
    status: docs ? 'DERIVED_EXPORT_PRESENT' : 'ABSENT_IN_ENV',
    inspected: docs
      ? {
          exported_documents: docs.length,
          metadata_only_documents: stubDocs,
          documents_with_page_text: docsWithRealText,
          distinct_11_digit_numbers: scribdNumbers.size,
          numbers_missing_from_catalog: [...scribdNumbers].filter((n) => !knownParts.has(n)).length,
          note: 'The Drive folder holds an export of the Scribd database, not the .db file itself.'
        }
      : null
  }
];

const missingArchives = REQUESTED_ARCHIVES.filter((name) => {
  if (name === 'stihl_scribd_documentation.db') return !docs;
  return !sources.some((s) => s.archive === name && s.status === 'PRESENT');
});

const artifact = {
  schema_version: '1.0.0',
  phase: 84,
  generated_at: new Date().toISOString(),
  drive_folder: '1l5LmjDidmiBDlOWHLyJWRhqdh0oTliM9',
  read_method:
    'Google Drive integration returned 403 insufficient scopes; sources were read and downloaded through the public share links.',
  requested_archives: REQUESTED_ARCHIVES,
  archives_present: sources.filter((s) => s.status === 'PRESENT').map((s) => s.archive),
  archives_derived_present: sources.filter((s) => s.status === 'DERIVED_EXPORT_PRESENT').map((s) => s.archive),
  archives_missing: missingArchives,
  sources,
  candidate_queue: {
    carburetor_cross_reference: {
      source_document: carb.document,
      unique_rows: carb.rows.length,
      distinct_part_numbers: new Set(carb.rows.map((r) => r.part_number)).size,
      missing_from_catalog: carbMissingUnique.length,
      missing_with_carburetor_code: carbMissingUnique.filter((r) => r.carburetor).length,
      missing_with_model_text: carbMissingUnique.filter((r) => r.model_text).length,
      missing_with_both: carbMissingUnique.filter((r) => r.carburetor && r.model_text).length,
      status: 'NEEDS_IDENTITY_REVIEW',
      reason:
        'Numbers, carburettor type and model come from a third-party cross-reference chart with OCR noise. Nothing is written to the catalog until each record has a defensible name and no conflicting identity.',
      entries: carbMissingUnique
    },
    supersession_statements: {
      status: 'NEEDS_EVIDENCE',
      reason:
        'The 1995 TI index names the component and the number change but not the bar length/pitch, so the successor has no complete product identity yet.',
      entries: (inspectLocalLibrary()?.supersession_statements || []).map((entry) => ({
        ...entry,
        from_in_catalog: knownParts.has(entry.from_part),
        to_in_catalog: knownParts.has(entry.to_part)
      }))
    }
  },
  catalog_untouched: {
    parts_in_catalog: catalog.parts.length,
    parts_count_field: catalog.parts_count,
    written_records: 0
  }
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      artifact: path.relative(rootDir, outPath),
      archives_present: artifact.archives_present,
      archives_derived_present: artifact.archives_derived_present,
      archives_missing: artifact.archives_missing.length,
      carb_unique_rows: artifact.candidate_queue.carburetor_cross_reference.unique_rows,
      carb_missing: artifact.candidate_queue.carburetor_cross_reference.missing_from_catalog,
      supersession_statements: artifact.candidate_queue.supersession_statements.entries.length,
      catalog_parts: artifact.catalog_untouched.parts_in_catalog
    },
    null,
    2
  )
);
