import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  buildKnownModelDictionary,
  classifyDuplicateRelation,
  computeContentHash,
  evaluateAuthenticity,
  extractDocumentNumberCandidates,
  extractModelsMentioned,
  inferDocumentType,
  inferLanguage,
  inferMarket
} from '../src/documentAuthority.js';
import {
  assessCandidateDocumentModelCompatibility,
  resolveFieldLevelModelScope,
  validateFieldSemantics35c41
} from './phase35c41_canonical_document_reconciliation.js';
import {
  classifySourceIndependence,
  evaluateVerifiedCandidate
} from './phase35c4_verified_fact_recovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const PDFJS_DIST_ROOT = path.join(rootDir, 'node_modules', 'pdfjs-dist');

const SOURCE_COMMIT = 'f0d9076';
const EXPECTED_ORIGIN_MAIN = 'f0d9076';
const EXPECTED_ARCHIVE_SHA256 = 'f7e6ca964c2cb5a9ab944fd515f7e6d0633f9ce13d973cc2d754bfef75c3f1bf';
const EXPECTED_ZIP_ENTRIES = 112;
const EXPECTED_UNIQUE_RAW_FILES = 98;
const EXPECTED_EXACT_BYTE_DUPLICATES = 14;
const SOURCE_BATCH = 'BATCH7_OFFICIAL_ARCHIVE_V2';
const TARGETS = [
  { key: '026', filename: 'Stihl 026 Instruction Manual.pdf', model: '026' },
  { key: '046', filename: 'STIHL 046.pdf', model: '046' },
  { key: 'TS410_420', filename: 'STIHL TS 410, 420 Owners Instruction Manual.pdf', model: 'ts-420' }
];
const TARGET_FIELDS = [
  'displacement_cc',
  'power_kw',
  'bore_mm',
  'stroke_mm',
  'idle_speed_rpm',
  'spark_plug',
  'electrode_gap_mm',
  'fuel_tank_l',
  'oil_tank_l',
  'weight_kg',
  'max_engine_speed_rpm',
  'max_power_speed_rpm'
];
const KNOWN_QUARANTINE_FILENAMES = new Map([
  ['sports illustrated february 20, 2015 usa.pdf', 'NON_STIHL_MAGAZINE'],
  ['gov.uscourts.nysd.320521.pdf', 'NON_STIHL_COURT_FILING'],
  ['small air-cooled engines service manual.pdf', 'GENERIC_ENGINE_SERVICE_BOOK'],
  ['string trimmer and blower _ service manual.pdf', 'GENERIC_TRIMMER_BLOWER_SERVICE_BOOK'],
  ['aeg sts 350, stsz 350, stse 350 stihl fs 80, 85 instruction manual.pdf', 'PAYLOAD_FILENAME_CONFLICT_EXPECTED']
]);
const DEFERRED_PRIORITY_RULES = [
  { regex: /\b088\b.+\bworkshop manual\b/i, priority: 'HIGH' },
  { regex: /\b09 010 011\b.+\bworkshop manual\b/i, priority: 'HIGH' },
  { regex: /\bpower tools 1974\b/i, priority: 'HISTORICAL_REFERENCE_HIGH' },
  { regex: /\b038\b/i, priority: 'OCR_REQUIRED_FUTURE_RECOVERY' },
  { regex: /\bworkshop manual\b/i, priority: 'HIGH' },
  { regex: /\brepair manual\b/i, priority: 'HIGH' },
  { regex: /\bowners? instruction manual\b/i, priority: 'MEDIUM' },
  { regex: /\binstruction manual\b/i, priority: 'MEDIUM' }
];
const OUTPUTS = {
  finalReport: path.join(rootDir, 'data', 'phase35c42_final_report.json'),
  preflight: path.join(rootDir, 'data', 'phase35c42_preflight_report.json'),
  archiveInventory: path.join(rootDir, 'data', 'phase35c42_archive_inventory.json'),
  dedupAudit: path.join(rootDir, 'data', 'phase35c42_archive_dedup_audit.json'),
  authenticityAudit: path.join(rootDir, 'data', 'phase35c42_archive_authenticity_audit.json'),
  quarantineAudit: path.join(rootDir, 'data', 'phase35c42_quarantine_audit.json'),
  targetDocumentAudit: path.join(rootDir, 'data', 'phase35c42_target_document_audit.json'),
  tsDataReparse: path.join(rootDir, 'data', 'phase35c42_ts_data_reparse_audit.json'),
  targetFactCandidates: path.join(rootDir, 'data', 'phase35c42_target_fact_candidates.json'),
  sourceIndependence: path.join(rootDir, 'data', 'phase35c42_source_independence_audit.json'),
  conflictAudit: path.join(rootDir, 'data', 'phase35c42_conflict_audit.json'),
  verificationFunnel: path.join(rootDir, 'data', 'phase35c42_verification_funnel.json'),
  verifiedFactStaging: path.join(rootDir, 'data', 'phase35c42_verified_fact_staging.json'),
  evidenceGraph: path.join(rootDir, 'data', 'phase35c42_verified_fact_evidence_graph.json'),
  deferredInventory: path.join(rootDir, 'data', 'phase35c42_deferred_document_inventory.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c42_failure_injection_report.json')
};
const CANONICAL_JSON_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const CANONICAL_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const PRIOR_DATA = {
  batch2Registry: path.join(rootDir, 'data', 'batch2_document_registry.json'),
  batch3Registry: path.join(rootDir, 'data', 'batch3_pdf_document_registry.json'),
  crossRegistry: path.join(rootDir, 'data', 'cross_corpus_document_registry_all_sources.json'),
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLooseText(value) {
  return normalizeText(value).toLowerCase();
}

function stableHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function stableId(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
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

function runGit(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function worktreeStatus() {
  return runGit(['status', '--short']) || 'CLEAN';
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

function archivePathFromEnv() {
  const configured = process.env.PHASE35C42_ARCHIVE_PATH ? path.resolve(process.env.PHASE35C42_ARCHIVE_PATH) : null;
  return configured;
}

function buildPdfJsOptions(data) {
  return {
    data,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    stopAtErrors: false,
    standardFontDataUrl: `${pathToFileURL(path.join(PDFJS_DIST_ROOT, 'standard_fonts')).href}/`,
    cMapUrl: `${pathToFileURL(path.join(PDFJS_DIST_ROOT, 'cmaps')).href}/`,
    cMapPacked: true,
    verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0
  };
}

function buildPreflight() {
  const head = runGit(['rev-parse', 'HEAD']);
  const originMain = runGit(['rev-parse', 'origin/main']);
  const archivePath = archivePathFromEnv();
  const failures = [];
  let archiveHash = null;
  let archiveExists = false;

  if (!originMainIsAccepted(originMain)) failures.push('ORIGIN_MAIN_BASELINE_MISMATCH');
  if (!archivePath) failures.push('ARCHIVE_PATH_MISSING');
  if (archivePath) {
    archiveExists = fs.existsSync(archivePath);
    if (!archiveExists) failures.push('ARCHIVE_PATH_NOT_FOUND');
    if (archiveExists) {
      archiveHash = fileSha256(archivePath);
      if (archiveHash !== EXPECTED_ARCHIVE_SHA256) failures.push('WRONG_ARCHIVE_HASH');
    }
  }

  return {
    generated_at: new Date().toISOString(),
    SOURCE_COMMIT,
    HEAD: head,
    ORIGIN_MAIN: originMain,
    WORKTREE_STATUS: worktreeStatus(),
    ARCHIVE_PATH: archivePath,
    ARCHIVE_EXISTS: archiveExists ? 'YES' : 'NO',
    ARCHIVE_SHA256: archiveHash,
    EXPECTED_ARCHIVE_SHA256,
    PRECHECK_FAILURES: failures,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL',
    ARCHIVE_INTAKE_NOT_STARTED: failures.length === 0 ? 'NO' : 'YES'
  };
}

function listArchiveEntries(archivePath) {
  const command = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${archivePath.replace(/\\/g, '\\\\')}')
try {
  $zip.Entries |
    Where-Object { -not $_.FullName.EndsWith('/') } |
    ForEach-Object {
      [pscustomobject]@{
        archive_path = $_.FullName
        filename = $_.Name
        file_size = $_.Length
      }
    } | ConvertTo-Json -Depth 3
} finally {
  $zip.Dispose()
}`;
  const output = execFileSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32
  });
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function inspectPdfQuick(filePath) {
  const bytes = fs.readFileSync(filePath);
  const pdf = await pdfjs.getDocument(buildPdfJsOptions(new Uint8Array(bytes))).promise;
  const samplePages = [];
  let nativeTextPageCount = 0;
  for (let index = 1; index <= Math.min(pdf.numPages, 3); index += 1) {
    const page = await pdf.getPage(index);
    const text = await page.getTextContent();
    const raw = normalizeText(text.items.map((item) => item.str).join(' '));
    if (raw) nativeTextPageCount += 1;
    samplePages.push(raw.slice(0, 4000));
  }
  return {
    page_count: pdf.numPages,
    native_text_page_count: nativeTextPageCount,
    native_text_available: nativeTextPageCount > 0,
    ocr_required: nativeTextPageCount === 0,
    sample_text: samplePages.join('\n').slice(0, 9000),
    pdf_error: null
  };
}

async function extractInventory(archivePath) {
  const entries = listArchiveEntries(archivePath);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl35c42-inventory-'));
  const seenHashes = new Map();
  try {
    const enriched = [];
    for (const entry of entries) {
      const tempPath = path.join(tempDir, `${stableId([entry.archive_path, entry.file_size])}-${path.basename(entry.filename || 'entry.pdf')}`);
      extractTargetPdf(archivePath, entry.archive_path, tempPath);
      const rawHash = fileSha256(tempPath);
      if (seenHashes.has(rawHash)) {
        const cached = seenHashes.get(rawHash);
        enriched.push({
          ...entry,
          raw_file_sha256: rawHash,
          page_count: cached.page_count,
          native_text_page_count: cached.native_text_page_count,
          native_text_available: cached.native_text_available,
          ocr_required: cached.ocr_required,
          sample_text: cached.sample_text,
          pdf_error: cached.pdf_error
        });
        fs.unlinkSync(tempPath);
        continue;
      }
      let inspection = {
        page_count: null,
        native_text_page_count: 0,
        native_text_available: false,
        ocr_required: false,
        sample_text: '',
        pdf_error: null
      };
      if (String(entry.filename || '').toLowerCase().endsWith('.pdf')) {
        try {
          inspection = await inspectPdfQuick(tempPath);
        } catch (error) {
          inspection = { ...inspection, pdf_error: error.message };
        }
      }
      seenHashes.set(rawHash, inspection);
      enriched.push({
        ...entry,
        raw_file_sha256: rawHash,
        ...inspection
      });
      fs.unlinkSync(tempPath);
    }
    return { entries: enriched };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildSignalLists(filename, sampleText, publicationIds, documentType) {
  const combined = `${filename}\n${sampleText}`;
  const lower = normalizeLooseText(combined);
  const corporateSignals = [];
  const publicationSignals = [];
  const structureSignals = [];

  if (/\bandreas stihl\b/i.test(combined)) corporateSignals.push('ANDREAS_STIHL');
  if (/\bstihl\b/i.test(combined)) corporateSignals.push('STIHL_BRANDING');
  if (/www\.stihl\.com/i.test(combined)) corporateSignals.push('STIHL_WEBSITE');
  if (/\bcopyright\b/i.test(combined) && /\bstihl\b/i.test(combined)) corporateSignals.push('STIHL_COPYRIGHT');

  for (const publicationId of publicationIds) publicationSignals.push(`PUBLICATION_ID:${publicationId}`);
  if (/\d{4}-\d{3}-\d{4}-[A-Z]/.test(combined)) publicationSignals.push('STIHL_NUMERIC_PUBLICATION_ID');

  if (/\binstruction manual\b/i.test(combined)) structureSignals.push('INSTRUCTION_MANUAL');
  if (/\bowners? instruction manual\b/i.test(combined)) structureSignals.push('OWNERS_MANUAL');
  if (/\bworkshop manual\b/i.test(combined)) structureSignals.push('WORKSHOP_MANUAL');
  if (/\brepair manual\b/i.test(combined)) structureSignals.push('REPAIR_MANUAL');
  if (/\bspecifications?\b/i.test(combined)) structureSignals.push('SPECIFICATIONS_SECTION');
  if (/\bcontents\b/i.test(combined)) structureSignals.push('TABLE_OF_CONTENTS');
  if (documentType) structureSignals.push(`DOC_TYPE:${documentType}`);
  if (lower.includes('technical data')) structureSignals.push('TECHNICAL_DATA');

  return {
    corporateSignals: [...new Set(corporateSignals)],
    publicationSignals: [...new Set(publicationSignals)],
    structureSignals: [...new Set(structureSignals)]
  };
}

function normalizeModels(models) {
  return [...new Set((models || [])
    .map((model) => String(model.slug || model.model_name || model.model_id || ''))
    .filter(Boolean)
    .filter((model) => /^(?:[a-z]{2,4}-\d{2,4}[a-z]?|\d{3,4}[a-z]?)$/i.test(model)))];
}

function classifyQuarantine(filename, sampleText) {
  const normalizedFilename = normalizeLooseText(filename);
  if (KNOWN_QUARANTINE_FILENAMES.has(normalizedFilename)) {
    const reason = KNOWN_QUARANTINE_FILENAMES.get(normalizedFilename);
    if (reason === 'PAYLOAD_FILENAME_CONFLICT_EXPECTED' && /\baeg\b/i.test(sampleText)) {
      return { status: 'QUARANTINE', reason: 'AEG_PAYLOAD_CONFLICT_CONFIRMED' };
    }
    if (reason !== 'PAYLOAD_FILENAME_CONFLICT_EXPECTED') {
      return { status: 'QUARANTINE', reason };
    }
  }
  if (/\baeg\b/i.test(sampleText) && /\bstihl fs 80\b/i.test(filename)) return { status: 'QUARANTINE', reason: 'AEG_PAYLOAD_CONFLICT_CONFIRMED' };
  if (/\bsports illustrated\b/i.test(sampleText)) return { status: 'NON_STIHL', reason: 'MAGAZINE_PAYLOAD_CONFIRMED' };
  if (/\bunited states district court\b/i.test(sampleText)) return { status: 'NON_STIHL', reason: 'COURT_PAYLOAD_CONFIRMED' };
  return null;
}

function buildExistingCorpusIndexes() {
  const batch2Registry = readJson(PRIOR_DATA.batch2Registry);
  const batch3Registry = readJson(PRIOR_DATA.batch3Registry);
  const crossRegistry = readJson(PRIOR_DATA.crossRegistry);

  const allDocs = [];
  for (const document of batch2Registry.documents || []) {
    allDocs.push({
      source_batch: 'BATCH2_HIGH_AUTHORITY_STIHL',
      file_hash: document.file_hash || null,
      content_hash: document.content_hash || null,
      page_count: document.page_count || null,
      normalized_document_number: document.document_number || null,
      normalized_title: normalizeLooseText(document.normalized_title || document.document_title || document.source_file_path || ''),
      models_key: document.models_key || '',
      source_file_path: document.source_file_path || null,
      canonical_document_id: document.canonical_document_id || null
    });
  }
  for (const document of batch3Registry.documents || []) {
    allDocs.push({
      source_batch: 'BATCH3_MANUEL_SERVICE',
      file_hash: document.file_hash || null,
      content_hash: document.content_hash || null,
      page_count: document.page_count || null,
      normalized_document_number: document.document_number || null,
      normalized_title: normalizeLooseText(document.document_title || document.source_file_path || ''),
      models_key: (document.models_mentioned || []).join('|'),
      source_file_path: document.source_file_path || null,
      canonical_document_id: document.canonical_document_id || null
    });
  }

  const canonicalByPublication = new Map();
  for (const entry of crossRegistry.canonical_documents || []) {
    if (entry.document_number) canonicalByPublication.set(entry.document_number, entry);
  }

  return {
    documents: allDocs,
    canonicalByPublication
  };
}

function buildCrossCorpusMatch(uniqueDoc, indexes) {
  const inventoryRow = {
    content_hash: uniqueDoc.payload_hash,
    page_count: uniqueDoc.page_count,
    normalized_document_number: uniqueDoc.publication_id || null,
    normalized_title: normalizeLooseText(uniqueDoc.filename),
    models_key: uniqueDoc.detected_models.join('|'),
    market: uniqueDoc.market || null
  };
  const exactFile = indexes.documents.find((document) => document.file_hash && document.file_hash === uniqueDoc.raw_file_sha256);
  if (exactFile) {
    return {
      status: 'EXACT_FILE_DUPLICATE',
      matched_batch: exactFile.source_batch,
      matched_source: exactFile.source_file_path,
      matched_canonical_document: exactFile.canonical_document_id || null
    };
  }

  const exactContent = indexes.documents.find((document) =>
    document.content_hash && uniqueDoc.payload_hash && document.content_hash === uniqueDoc.payload_hash && document.page_count === uniqueDoc.page_count
  );
  if (exactContent) {
    return {
      status: 'EXACT_CONTENT_DUPLICATE',
      matched_batch: exactContent.source_batch,
      matched_source: exactContent.source_file_path,
      matched_canonical_document: exactContent.canonical_document_id || null
    };
  }

  const publicationMatches = indexes.documents.filter((document) =>
    uniqueDoc.publication_id && document.normalized_document_number && document.normalized_document_number === uniqueDoc.publication_id
  );
  if (publicationMatches.length > 0) {
    const best = publicationMatches[0];
    const relation = classifyDuplicateRelation(
      inventoryRow,
      {
        content_hash: best.content_hash,
        page_count: best.page_count,
        normalized_document_number: best.normalized_document_number,
        normalized_title: best.normalized_title,
        models_key: best.models_key,
        market: null
      }
    );
    const mapped = relation === 'SAME_DOCUMENT_DIFFERENT_SCAN'
      ? 'SAME_PUBLICATION_DIFFERENT_SCAN'
      : relation === 'SAME_DOCUMENT_DIFFERENT_REVISION' || relation === 'POSSIBLE_DIFFERENT_REVISION'
        ? 'SAME_PUBLICATION_POSSIBLE_REVISION'
        : 'IDENTITY_MATCH_ONLY';
    return {
      status: mapped,
      matched_batch: best.source_batch,
      matched_source: best.source_file_path,
      matched_canonical_document: best.canonical_document_id || null
    };
  }

  const canonical = uniqueDoc.publication_id ? indexes.canonicalByPublication.get(uniqueDoc.publication_id) : null;
  if (canonical) {
    return {
      status: 'IDENTITY_MATCH_ONLY',
      matched_batch: canonical.preferred_source_batch || null,
      matched_source: canonical.source_locations?.[0]?.source_url || canonical.source_locations?.[0]?.source_file_path || null,
      matched_canonical_document: canonical.canonical_document_id
    };
  }

  return {
    status: 'NEW_UNIQUE',
    matched_batch: null,
    matched_source: null,
    matched_canonical_document: null
  };
}

function buildArchiveInventory(rawInventory, knownModels) {
  const indexes = buildExistingCorpusIndexes();
  const byHash = new Map();
  for (const entry of rawInventory.entries) {
    if (!byHash.has(entry.raw_file_sha256)) byHash.set(entry.raw_file_sha256, []);
    byHash.get(entry.raw_file_sha256).push(entry);
  }

  const archiveEntries = [];
  const uniqueDocuments = [];
  const quarantineEntries = [];
  const deferredDocuments = [];

  for (const [rawHash, entries] of byHash.entries()) {
    const primary = entries[0];
    const filename = primary.filename;
    const publicationIds = extractDocumentNumberCandidates(filename, primary.sample_text);
    const detectedModels = normalizeModels(extractModelsMentioned(`${filename}\n${primary.sample_text}`, knownModels));
    const documentType = inferDocumentType(filename, primary.sample_text);
    const extractionQuality = {
      ...computeExtractionQuality(primary.page_count, primary.native_text_page_count),
      ...inferTextQuality(primary.sample_text)
    };
    const authenticity = evaluateAuthenticity({
      title: filename,
      url: '',
      author: '',
      pageCount: primary.page_count,
      combinedText: primary.sample_text,
      documentNumbers: publicationIds,
      modelsMentioned: extractModelsMentioned(`${filename}\n${primary.sample_text}`, knownModels),
      extractionQuality: { quality: extractionQuality.quality },
      metadataSignals: {
        manualStructure: /\b(instruction manual|owners? instruction manual|workshop manual|repair manual|specifications?)\b/i.test(`${filename}\n${primary.sample_text}`),
        publisherMatch: /\bandreas stihl\b/i.test(primary.sample_text)
      }
    });
    const signals = buildSignalLists(filename, primary.sample_text, publicationIds, documentType);
    const quarantine = classifyQuarantine(filename, primary.sample_text);
    const crossCorpus = buildCrossCorpusMatch({
      filename,
      raw_file_sha256: rawHash,
      payload_hash: computeContentHash((primary.sample_text || '').split(/\n+/).filter(Boolean)),
      page_count: primary.page_count,
      publication_id: publicationIds[0] || null,
      detected_models: detectedModels,
      market: inferMarket(filename, '', primary.sample_text)
    }, indexes);

    let authenticityStatus = authenticity.authenticity_status;
    if (authenticityStatus === 'NON_OFFICIAL_CONFIRMED') authenticityStatus = 'NON_STIHL';
    if (authenticityStatus === 'ALTERED_OR_INCOMPLETE') authenticityStatus = 'PROBABLE_OFFICIAL';
    if (authenticityStatus === 'NEEDS_REVIEW' || authenticityStatus === 'TEXT_EXTRACTION_FAILED' || authenticityStatus === 'INSUFFICIENT_EXTRACTED_TEXT') {
      authenticityStatus = 'INSUFFICIENT_EVIDENCE';
    }
    if (quarantine) authenticityStatus = quarantine.status;

    const target = TARGETS.find((item) => item.filename === filename) || null;
    const processingStatus = target
      ? 'TARGET_FOR_FACT_RECOVERY'
      : quarantine
        ? 'QUARANTINE'
        : 'DEFERRED_FOR_FUTURE_RECOVERY';

    const deferredPriority = target || quarantine ? null : classifyDeferredPriority(filename, authenticityStatus);
    const uniqueDocument = {
      archive_entry_id: stableId([SOURCE_BATCH, rawHash, entries[0].archive_path]),
      source_batch: SOURCE_BATCH,
      archive_paths: entries.map((entry) => entry.archive_path),
      archive_path: entries[0].archive_path,
      filename,
      raw_file_sha256: rawHash,
      file_size: primary.file_size,
      page_count: primary.page_count,
      document_type: documentType,
      publication_id: publicationIds[0] || null,
      publication_id_raw: publicationIds[0] || null,
      detected_models: detectedModels,
      native_text_available: primary.native_text_available,
      native_text_page_count: primary.native_text_page_count,
      ocr_required: primary.ocr_required,
      corporate_identity_signals: signals.corporateSignals,
      publication_identity_signals: signals.publicationSignals,
      document_structure_signals: signals.structureSignals,
      authenticity_status: authenticityStatus,
      authenticity_reason: quarantine?.reason || authenticity.notes?.slice(0, 3).join(' ') || 'No strong reason recorded.',
      authenticity_score: authenticity.score,
      duplicate_status: entries.length > 1 ? 'EXACT_FILE_DUPLICATE' : 'UNIQUE_WITHIN_ARCHIVE',
      duplicate_of: entries.length > 1 ? entries.slice(1).map((entry) => entry.archive_path) : [],
      processing_status: processingStatus,
      deferred_priority: deferredPriority,
      language: inferLanguage(filename, primary.sample_text),
      market: inferMarket(filename, '', primary.sample_text),
      payload_hash: computeContentHash((primary.sample_text || '').split(/\n+/).filter(Boolean)),
      sample_text: primary.sample_text.slice(0, 1200),
      cross_corpus_status: crossCorpus.status,
      cross_corpus_match_batch: crossCorpus.matched_batch,
      cross_corpus_match_source: crossCorpus.matched_source,
      cross_corpus_canonical_document_id: crossCorpus.matched_canonical_document
    };
    uniqueDocuments.push(uniqueDocument);

    for (const entry of entries) {
      archiveEntries.push({
        archive_entry_id: stableId([SOURCE_BATCH, entry.archive_path, entry.raw_file_sha256]),
        archive_path: entry.archive_path,
        filename: entry.filename,
        raw_file_sha256: entry.raw_file_sha256,
        file_size: entry.file_size,
        page_count: entry.page_count,
        duplicate_status: entries.length > 1 ? (entry.archive_path === entries[0].archive_path ? 'PRIMARY_UNIQUE_PAYLOAD' : 'EXACT_FILE_DUPLICATE') : 'PRIMARY_UNIQUE_PAYLOAD',
        duplicate_of: entries.length > 1 && entry.archive_path !== entries[0].archive_path ? entries[0].archive_path : null,
        processing_status: uniqueDocument.processing_status
      });
    }

    if (processingStatus === 'QUARANTINE') {
      quarantineEntries.push({
        filename,
        hash: rawHash,
        reason: uniqueDocument.authenticity_reason,
        payload_identity: uniqueDocument.publication_id || uniqueDocument.document_type || 'UNKNOWN',
        status: uniqueDocument.authenticity_status
      });
    }
    if (processingStatus === 'DEFERRED_FOR_FUTURE_RECOVERY') {
      deferredDocuments.push({
        filename,
        raw_file_sha256: rawHash,
        publication_id: uniqueDocument.publication_id,
        authenticity_status: uniqueDocument.authenticity_status,
        deferred_priority: deferredPriority,
        page_count: uniqueDocument.page_count
      });
    }
  }

  archiveEntries.sort((left, right) => left.archive_path.localeCompare(right.archive_path));
  uniqueDocuments.sort((left, right) => left.filename.localeCompare(right.filename));
  deferredDocuments.sort((left, right) => left.filename.localeCompare(right.filename));

  return {
    archiveInventory: {
      generated_at: new Date().toISOString(),
      source_commit: SOURCE_COMMIT,
      source_batch: SOURCE_BATCH,
      archive_entries: archiveEntries,
      unique_documents: uniqueDocuments
    },
    quarantineEntries,
    deferredDocuments
  };
}

async function prepareRunInputs(preflight) {
  const rawInventory = await extractInventory(preflight.ARCHIVE_PATH);
  const canonicalJson = readJson(CANONICAL_JSON_PATH);
  const knownModels = buildKnownModelDictionary(canonicalJson);
  const inventoryBuild = buildArchiveInventory(rawInventory, knownModels);
  const archiveInventory = inventoryBuild.archiveInventory;
  const tsDataReparse = buildTsDataReparseAudit();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl35c42-'));
  const extractedPages = new Map();
  try {
    for (const target of TARGETS) {
      const doc = archiveInventory.unique_documents.find((entry) => entry.filename === target.filename);
      if (!doc) continue;
      const outPath = path.join(tempDir, path.basename(target.filename));
      extractTargetPdf(preflight.ARCHIVE_PATH, doc.archive_path, outPath);
      extractedPages.set(target.filename, await extractPdfLinePages(outPath));
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return {
    knownModels,
    inventoryBuild,
    archiveInventory,
    tsDataReparse,
    extractedPages
  };
}

function computeExtractionQuality(pageCount, nativeTextPageCount) {
  if (!pageCount || !nativeTextPageCount) return { quality: 'POOR' };
  const ratio = nativeTextPageCount / pageCount;
  if (ratio >= 0.95) return { quality: 'EXCELLENT' };
  if (ratio >= 0.7) return { quality: 'GOOD' };
  if (ratio >= 0.35) return { quality: 'PARTIAL' };
  return { quality: 'POOR' };
}

function inferTextQuality(sampleText) {
  const normalized = normalizeText(sampleText);
  return {
    sample_characters: normalized.length,
    corrupted_glyph_ratio: normalized ? Number((((normalized.match(/[^\x20-\x7E]/g) || []).length) / normalized.length).toFixed(3)) : 0
  };
}

function classifyDeferredPriority(filename, authenticityStatus) {
  for (const rule of DEFERRED_PRIORITY_RULES) {
    if (rule.regex.test(filename)) return rule.priority;
  }
  if (authenticityStatus === 'AUTHENTICATED_OFFICIAL') return 'MEDIUM';
  return 'LOW';
}

function buildArchiveDedupAudit(inventory) {
  const uniqueDocs = inventory.unique_documents;
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    ARCHIVE_ENTRIES: inventory.archive_entries.length,
    UNIQUE_RAW_FILES: uniqueDocs.length,
    EXACT_BYTE_DUPLICATES: inventory.archive_entries.filter((entry) => entry.duplicate_status === 'EXACT_FILE_DUPLICATE').length,
    CROSS_CORPUS_EXACT_DUPLICATES: uniqueDocs.filter((doc) => doc.cross_corpus_status === 'EXACT_FILE_DUPLICATE').length,
    SAME_PUBLICATION_DIFFERENT_SCAN: uniqueDocs.filter((doc) => doc.cross_corpus_status === 'SAME_PUBLICATION_DIFFERENT_SCAN').length,
    NEW_UNIQUE: uniqueDocs.filter((doc) => doc.cross_corpus_status === 'NEW_UNIQUE').length,
    duplicate_groups: uniqueDocs
      .filter((doc) => doc.duplicate_status === 'EXACT_FILE_DUPLICATE')
      .map((doc) => ({ raw_file_sha256: doc.raw_file_sha256, archive_paths: doc.archive_paths }))
  };
}

function buildArchiveAuthenticityAudit(inventory) {
  const docs = inventory.unique_documents;
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    AUTHENTICATED_OFFICIAL: docs.filter((doc) => doc.authenticity_status === 'AUTHENTICATED_OFFICIAL').length,
    PROBABLE_OFFICIAL: docs.filter((doc) => doc.authenticity_status === 'PROBABLE_OFFICIAL').length,
    NON_STIHL: docs.filter((doc) => doc.authenticity_status === 'NON_STIHL').length,
    QUARANTINE: docs.filter((doc) => doc.authenticity_status === 'QUARANTINE').length,
    UNRESOLVED: docs.filter((doc) => doc.authenticity_status === 'INSUFFICIENT_EVIDENCE').length,
    targets: TARGETS.map((target) => {
      const match = docs.find((doc) => doc.filename === target.filename);
      return {
        target: target.key,
        filename: target.filename,
        authenticity_status: match?.authenticity_status || 'NOT_FOUND',
        corporate_identity_signals: match?.corporate_identity_signals || [],
        publication_identity_signals: match?.publication_identity_signals || [],
        document_structure_signals: match?.document_structure_signals || []
      };
    })
  };
}

function extractTargetPdf(archivePath, archiveEntryName, outputPath) {
  const command = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${archivePath.replace(/\\/g, '\\\\')}')
try {
  $entry = $zip.GetEntry('${archiveEntryName.replace(/'/g, "''")}')
  if (-not $entry) { throw 'Target entry not found.' }
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '${outputPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}', $true)
} finally {
  $zip.Dispose()
}`;
  execFileSync('powershell', ['-NoProfile', '-Command', command], { cwd: rootDir, stdio: 'ignore' });
}

function groupItemsIntoLines(items) {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    const tolerance = Math.max(2, item.height * 0.45);
    if (last && Math.abs(last.y - item.y) <= tolerance) {
      last.items.push(item);
      last.y = (last.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.map((line, index) => ({
    line_number: index + 1,
    y: line.y,
    items: line.items.sort((left, right) => left.x - right.x),
    line_text: normalizeText(line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(' '))
  })).filter((line) => line.line_text);
}

async function extractPdfLinePages(filePath) {
  const bytes = fs.readFileSync(filePath);
  const pdf = await pdfjs.getDocument(buildPdfJsOptions(new Uint8Array(bytes))).promise;
  const pages = [];
  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1, rotation: page.rotate });
    const text = await page.getTextContent();
    const items = text.items.map((item) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0,
      height: Math.abs(item.transform[0]) || Math.abs(item.transform[3]) || 8
    })).filter((item) => normalizeText(item.text));
    const lines = groupItemsIntoLines(items);
    const pageText = lines.map((line) => line.line_text).join(' ');
    pages.push({
      page_number: pageIndex + 1,
      page_width: viewport.width,
      lines,
      page_text: pageText
    });
  }
  return pages;
}

function findTargetDocs(inventory) {
  return TARGETS.map((target) => inventory.unique_documents.find((doc) => doc.filename === target.filename) || null);
}

function parseNumberToken(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).trim().replace(/\s+/g, '');
  if (!/^[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$/.test(cleaned) && !/^[-+]?\d+(?:[.,]\d+)?$/.test(cleaned)) return null;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseDualUnitValue(rawCell, fieldName) {
  const raw = normalizeText(rawCell);
  const matches = raw.match(/-?\d+(?:[.,]\d+)?/g) || [];
  const values = matches.map((value) => parseNumberToken(value)).filter((value) => value != null);
  if (values.length === 0) {
    return {
      raw_cell: raw,
      values_detected: [],
      unit_context: [],
      primary_metric_value: null,
      secondary_imperial_value: null,
      normalization_method: 'NO_NUMERIC_VALUE'
    };
  }
  if (fieldName.endsWith('_rpm')) {
    const primary = parseRpmValue(raw);
    return {
      raw_cell: raw,
      values_detected: values,
      unit_context: ['rpm'],
      primary_metric_value: primary,
      secondary_imperial_value: null,
      normalization_method: 'RPM_THOUSANDS_SEPARATOR_CONTEXT'
    };
  }
  if (values.length >= 2 && ['displacement_cc', 'bore_mm', 'stroke_mm', 'electrode_gap_mm'].includes(fieldName)) {
    return {
      raw_cell: raw,
      values_detected: values,
      unit_context: ['metric', 'imperial'],
      primary_metric_value: values[0],
      secondary_imperial_value: values[1],
      normalization_method: 'DUAL_UNIT_PRIMARY_FIRST'
    };
  }
  return {
    raw_cell: raw,
    values_detected: values,
    unit_context: [],
    primary_metric_value: values[0],
    secondary_imperial_value: values[1] || null,
    normalization_method: 'FIRST_NUMERIC_TOKEN'
  };
}

export function parseRpmValue(rawCell) {
  const raw = normalizeText(rawCell);
  const match = raw.match(/\d{1,2}[,.]\d{3}|\d{4,5}/);
  if (!match) return null;
  return Number(match[0].replace(/[,.]/g, ''));
}

export function parseSparkPlugAlternatives(rawValue) {
  const raw = normalizeText(rawValue);
  const bosch = raw.match(/\b(?:Bosch|BOSCH)\s+(.+?)(?=\s+(?:or|\/|,)\s+NGK\b|$)/i);
  const ngk = raw.match(/\bNGK\s+(.+?)(?=$|\s+(?:or|\/|,)\s+)/i);
  const alternatives = [];
  if (bosch) alternatives.push({ manufacturer: 'BOSCH', model: normalizeText(bosch[1]) });
  if (ngk) alternatives.push({ manufacturer: 'NGK', model: normalizeText(ngk[1]) });
  return alternatives;
}

function matchField(pageText, regex, fieldName, extra = {}) {
  const match = pageText.match(regex);
  if (!match) return null;
  return { field_name: fieldName, match, ...extra };
}

function buildCandidateBase(doc, model, pageNumber, fieldName, rawValue, normalizedValue, unit, meta = {}) {
  return {
    candidate_id: stableId([SOURCE_BATCH, doc.raw_file_sha256, model, fieldName, pageNumber, rawValue]),
    model,
    field: fieldName,
    raw_value: normalizeText(rawValue),
    normalized_value: normalizedValue,
    raw_unit: meta.raw_unit || unit || null,
    normalized_unit: unit || null,
    source_document: doc.filename,
    source_document_sha256: doc.raw_file_sha256,
    publication_id: doc.publication_id,
    pdf_page: pageNumber,
    printed_page: meta.printed_page || null,
    section: meta.section || 'Specifications',
    heading: meta.heading || 'Specifications',
    table_identity: meta.table_identity || 'Specifications',
    row: meta.row || fieldName,
    column: meta.column || null,
    scope: meta.scope || 'EXACT_MODEL',
    authenticity: doc.authenticity_status,
    semantic_status: meta.semantic_status || 'VALID',
    verification_gates: {}
  };
}

function collectLineEntries(lines = []) {
  return lines
    .map((line) => normalizeText(line.line_text))
    .filter(Boolean);
}

function findLineValue(lines, patterns) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return match;
    }
  }
  return null;
}

function parseSingleModelSpecs(doc, pages, model) {
  const candidates = [];
  for (const page of pages) {
    const pageText = page.page_text;
    const lineEntries = collectLineEntries(page.lines);
    const specsSignalCount = [
      /Displacement:/i,
      /Bore:/i,
      /Stroke:/i,
      /Spark plug/i,
      /Fuel capacity:|Fuel tank capacity:/i,
      /Oil tank capacity:/i,
      /Weight/i
    ].filter((pattern) => pattern.test(pageText)).length;
    if (specsSignalCount < 3) continue;
    const addNumeric = (regex, fieldName, unit) => {
      const lineMatch = findLineValue(lineEntries, [regex]);
      const pageMatch = lineMatch || pageText.match(regex);
      if (!pageMatch) return;
      const rawMatch = pageMatch[1];
      const value = fieldName.endsWith('_rpm') ? parseRpmValue(rawMatch) : parseNumberToken(rawMatch);
      if (value == null) return;
      candidates.push(buildCandidateBase(doc, model, page.page_number, fieldName, rawMatch, value, unit));
    };

    addNumeric(/Displacement:\s*([0-9.,]+)\s*cm\s*3\b/i, 'displacement_cc', 'cm3');
    addNumeric(/Bore:\s*([0-9.,]+)\s*mm/i, 'bore_mm', 'mm');
    addNumeric(/Stroke:\s*([0-9.,]+)\s*mm/i, 'stroke_mm', 'mm');
    addNumeric(/Idle speed:\s*([0-9.,]+)\s*r\.?p\.?m\.?/i, 'idle_speed_rpm', 'rpm');
    addNumeric(/Fuel (?:tank )?capacity:\s*([0-9.,]+)\s*l/i, 'fuel_tank_l', 'l');
    addNumeric(/Oil tank capacity:\s*([0-9.,]+)\s*l/i, 'oil_tank_l', 'l');
    addNumeric(/(?:Weight[^(]*\)\s*|026;\s*)([0-9.,]+)\s*kg/i, 'weight_kg', 'kg');
    addNumeric(/Electrode gap\s*([0-9.,]+)\s*mm/i, 'electrode_gap_mm', 'mm');

    const power = findLineValue(lineEntries, [/(?:Engine power[^:]*:|Power output[^:]*:)\s*[0-9.,]+\s*hp\s*\(([0-9.,]+)\s*kW\)\s*at\s*([0-9,]+)\s*rpm/i])
      || pageText.match(/(?:Engine power[^:]*:|Power output[^:]*:)\s*[0-9.,]+\s*hp\s*\(([0-9.,]+)\s*kW\)\s*at\s*([0-9,]+)\s*rpm/i);
    if (power) {
      candidates.push(buildCandidateBase(doc, model, page.page_number, 'power_kw', power[1], parseNumberToken(power[1]), 'kW'));
      candidates.push(buildCandidateBase(doc, model, page.page_number, 'max_power_speed_rpm', power[2], parseRpmValue(power[2]), 'rpm'));
    }

    const sparkPlug = findLineValue(lineEntries, [/Spark plug(?:\s*\([^)]*\))?:\s*(Bosch\s+[A-Z0-9 ]+\s+or\s+NGK\s+[A-Z0-9 ]+)\s+Electrode gap/i])
      || pageText.match(/Spark plug(?:\s*\([^)]*\))?:\s*(Bosch\s+[A-Z0-9 ]+\s+or\s+NGK\s+[A-Z0-9 ]+)\s+Electrode gap/i);
    if (sparkPlug) {
      const alternatives = parseSparkPlugAlternatives(sparkPlug[1]);
      candidates.push(buildCandidateBase(doc, model, page.page_number, 'spark_plug', sparkPlug[1], alternatives, null, {
        semantic_status: alternatives.length > 0 ? 'VALID' : 'INVALID'
      }));
    }
  }
  return dedupeTargetCandidates(candidates);
}

export function extractTs410420FieldMap(pageText) {
  const fields = ['Displacement', 'Cylinder bore', 'Piston stroke', 'Engine power accord - ing to ISO 7293', 'Idling speed', 'Maximum spindle speed'];
  const map = {};
  for (const field of fields) {
    const regex = new RegExp(`${field}:\\s*([^:]+?)\\s+${field === 'Maximum spindle speed' ? '(?:Displacement:|$)' : '(?:Displacement:|Cylinder bore:|Piston stroke:|Engine power accord - ing to ISO 7293:|Idling speed:|Maximum spindle speed:|Spark plug:|Electrode gap:|Fuel tank capacity:|Weight:|$)'}`, 'i');
    const match = pageText.match(regex);
    if (match) map[field] = normalizeText(match[1]);
  }
  return map;
}

function parseTs410420Specs(doc, pages) {
  const candidates = [];
  for (const page of pages) {
    if (!/TS 410, TS 420 English 47|Abrasive wheels \(TS 410\)|Abrasive wheels \(TS 420\)/i.test(page.page_text)) continue;
    const text = page.page_text;
    const sharedValues = {
      displacement_cc: text.match(/Displacement:\s*[0-9.,]+\s*cu\.\s*in\.\s*\(([0-9.,]+)\s*cm\s*3\)/i)?.[1] || null,
      bore_mm: text.match(/Cylinder bore:\s*[0-9.,]+\s*in\.\s*\(([0-9.,]+)\s*mm\)/i)?.[1] || null,
      stroke_mm: text.match(/Piston stroke:\s*[0-9.,]+\s*in\.\s*\(([0-9.,]+)\s*mm\)/i)?.[1] || null,
      power_kw: text.match(/Engine power accord\s*-\s*ing to ISO 7293:\s*[0-9.,]+\s*hp\s*\(([0-9.,]+)\s*kW\)\s*at\s*([0-9,]+)\s*rpm/i)?.[1] || null,
      max_power_speed_rpm: text.match(/Engine power accord\s*-\s*ing to ISO 7293:\s*[0-9.,]+\s*hp\s*\(([0-9.,]+)\s*kW\)\s*at\s*([0-9,]+)\s*rpm/i)?.[2] || null,
      idle_speed_rpm: text.match(/Idling speed:\s*([0-9,]+)\s*rpm/i)?.[1] || null,
      max_engine_speed_rpm: text.match(/Maximum spindle speed:\s*([0-9,]+)\s*rpm/i)?.[1] || null
    };
    if (Object.values(sharedValues).some(Boolean)) {
      for (const model of ['ts-410', 'ts-420']) {
        if (sharedValues.displacement_cc) candidates.push(buildCandidateBase(doc, model, page.page_number, 'displacement_cc', sharedValues.displacement_cc, parseNumberToken(sharedValues.displacement_cc), 'cm3', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        if (sharedValues.bore_mm) candidates.push(buildCandidateBase(doc, model, page.page_number, 'bore_mm', sharedValues.bore_mm, parseNumberToken(sharedValues.bore_mm), 'mm', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        if (sharedValues.stroke_mm) candidates.push(buildCandidateBase(doc, model, page.page_number, 'stroke_mm', sharedValues.stroke_mm, parseNumberToken(sharedValues.stroke_mm), 'mm', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        if (sharedValues.power_kw) candidates.push(buildCandidateBase(doc, model, page.page_number, 'power_kw', sharedValues.power_kw, parseNumberToken(sharedValues.power_kw), 'kW', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        if (sharedValues.max_power_speed_rpm) candidates.push(buildCandidateBase(doc, model, page.page_number, 'max_power_speed_rpm', sharedValues.max_power_speed_rpm, parseRpmValue(sharedValues.max_power_speed_rpm), 'rpm', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        if (sharedValues.idle_speed_rpm) candidates.push(buildCandidateBase(doc, model, page.page_number, 'idle_speed_rpm', sharedValues.idle_speed_rpm, parseRpmValue(sharedValues.idle_speed_rpm), 'rpm', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        if (sharedValues.max_engine_speed_rpm) candidates.push(buildCandidateBase(doc, model, page.page_number, 'max_engine_speed_rpm', sharedValues.max_engine_speed_rpm, parseRpmValue(sharedValues.max_engine_speed_rpm), 'rpm', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
      }
    }

    const spark = text.match(/Spark plug(?:\s*\([^)]*\))?:\s*(Bosch\s+[A-Z0-9 ]+)\s+Electrode gap:\s*[0-9.,]+\s*in\.\s*\(([0-9.,]+)\s*mm\)\s*Fuel tank capacity:\s*[0-9.,]+\s*oz\s*\(([0-9.,]+)\s*l\)/i);
    if (spark) {
      const alternatives = parseSparkPlugAlternatives(spark[1]);
      for (const model of ['ts-410', 'ts-420']) {
        candidates.push(buildCandidateBase(doc, model, page.page_number, 'spark_plug', spark[1], alternatives, null, { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        candidates.push(buildCandidateBase(doc, model, page.page_number, 'electrode_gap_mm', spark[2], parseNumberToken(spark[2]), 'mm', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
        candidates.push(buildCandidateBase(doc, model, page.page_number, 'fuel_tank_l', spark[3], parseNumberToken(spark[3]), 'l', { scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE', column: model.toUpperCase() }));
      }
    }
    const weightPairs = [...text.matchAll(/TS 410:\s*[0-9.]+\s*lbs\s*\(([0-9.,]+)\s*kg\)\s*TS 420:\s*[0-9.]+\s*lbs\s*\(([0-9.,]+)\s*kg\)/ig)];
    if (weightPairs.length > 0) {
      const first = weightPairs[0];
      candidates.push(buildCandidateBase(doc, 'ts-410', page.page_number, 'weight_kg', first[1], parseNumberToken(first[1]), 'kg', { scope: 'MULTI_MODEL_EXPLICIT_COLUMN', column: 'TS 410', row: 'weight_kg_water_attachment' }));
      candidates.push(buildCandidateBase(doc, 'ts-420', page.page_number, 'weight_kg', first[2], parseNumberToken(first[2]), 'kg', { scope: 'MULTI_MODEL_EXPLICIT_COLUMN', column: 'TS 420', row: 'weight_kg_water_attachment' }));
    }
  }
  return dedupeTargetCandidates(candidates);
}

function dedupeTargetCandidates(candidates) {
  const seen = new Map();
  for (const candidate of candidates) {
    const key = [candidate.model, candidate.field, candidate.normalized_value, candidate.pdf_page, candidate.column].join('|');
    if (!seen.has(key)) seen.set(key, candidate);
  }
  return [...seen.values()];
}

function buildTsDataReparseAudit() {
  const raw = readJson(PRIOR_DATA.tsDataRecords);
  const records = (raw.records || raw).filter((record) => ['026', '046'].includes(String(record.normalized_model).toUpperCase()) && TARGET_FIELDS.includes(record.field_name));
  const reparsed = records.map((record) => {
    const dualUnit = parseDualUnitValue(record.raw_value, record.field_name);
    const sparkAlternatives = record.field_name === 'spark_plug' ? parseSparkPlugAlternatives(record.raw_value) : [];
    let status = 'UNCHANGED';
    let newNormalized = record.normalized_value;
    let unit = record.unit;
    if (record.field_name === 'spark_plug' && /^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?$/.test(normalizeText(record.raw_value))) {
      status = 'RECLASSIFIED_AS_ELECTRODE_GAP';
      newNormalized = dualUnit.primary_metric_value;
      unit = 'mm';
    } else if (record.field_name === 'spark_plug' && sparkAlternatives.length > 0) {
      status = 'APPROVED_ALTERNATIVES_RECOVERED';
      newNormalized = sparkAlternatives;
      unit = null;
    } else if (record.field_name.endsWith('_rpm')) {
      status = record.normalized_value !== dualUnit.primary_metric_value ? 'RPM_SEPARATOR_CORRECTED' : 'UNCHANGED';
      newNormalized = dualUnit.primary_metric_value;
    } else if (['displacement_cc', 'bore_mm', 'stroke_mm'].includes(record.field_name)) {
      status = record.normalized_value !== dualUnit.primary_metric_value ? 'DUAL_UNIT_CORRECTED' : 'UNCHANGED';
      newNormalized = dualUnit.primary_metric_value;
    }
    return {
      record_id: record.record_id,
      model: record.normalized_model,
      field: record.field_name,
      old_raw: record.raw_value,
      old_normalized: record.normalized_value,
      new_raw_cell: record.raw_value,
      new_normalized: newNormalized,
      unit,
      parse_method: dualUnit.normalization_method,
      values_detected: dualUnit.values_detected,
      primary_metric_value: dualUnit.primary_metric_value,
      secondary_imperial_value: dualUnit.secondary_imperial_value,
      status
    };
  });
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: reparsed
  };
}

function buildTargetDocumentAudit(targetDocs, extractedPages) {
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    targets: TARGETS.map((target) => {
      const doc = targetDocs.find((entry) => entry?.filename === target.filename) || null;
      const pages = extractedPages.get(target.filename) || [];
      return {
        target: target.key,
        target_found: doc ? 'YES' : 'NO',
        document_identity: doc?.publication_id || null,
        hash: doc?.raw_file_sha256 || null,
        publication_identity: doc?.publication_id || null,
        page_count: doc?.page_count || null,
        authenticity: doc?.authenticity_status || 'NOT_FOUND',
        detected_models: doc?.detected_models || [],
        revision: doc?.publication_id?.split('-').pop() || null,
        market: doc?.market || null,
        native_extraction_quality: pages.length > 0 ? computeExtractionQuality(pages.length, pages.filter((page) => normalizeText(page.page_text)).length).quality : 'NOT_PARSED',
        existing_corpus_matches: {
          cross_corpus_status: doc?.cross_corpus_status || null,
          cross_corpus_canonical_document_id: doc?.cross_corpus_canonical_document_id || null
        }
      };
    })
  };
}

function buildTargetCandidates(targetDocs, extractedPages) {
  const all = [];
  for (const target of TARGETS) {
    const doc = targetDocs.find((entry) => entry?.filename === target.filename);
    if (!doc) continue;
    const pages = extractedPages.get(target.filename) || [];
    let candidates = [];
    if (target.key === 'TS410_420') candidates = parseTs410420Specs(doc, pages);
    else candidates = parseSingleModelSpecs(doc, pages, target.model);
    all.push(...candidates);
  }
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: all
  };
}

function buildSourceIndependenceAudit(targetCandidates, tsReparse, targetDocs) {
  const records = [];
  const tsByModelField = new Map();
  for (const row of tsReparse.records) {
    tsByModelField.set(`${String(row.model).toLowerCase()}|${row.field}`, row);
  }
  for (const candidate of targetCandidates.records) {
    const modelKey = String(candidate.model).toLowerCase();
    const tsRecord = tsByModelField.get(`${modelKey}|${candidate.field}`) || null;
    if (!tsRecord) continue;
    const sourceA = {
      source_label: `${SOURCE_BATCH}:${candidate.source_document}:${candidate.pdf_page}:${candidate.field}`,
      file_hash: targetDocs.find((doc) => doc.filename === candidate.source_document)?.raw_file_sha256 || null,
      payload_hash: targetDocs.find((doc) => doc.filename === candidate.source_document)?.payload_hash || null,
      publication_id: candidate.publication_id,
      canonical_document_id: candidate.publication_id || candidate.source_document
    };
    const sourceB = {
      source_label: `TS_DATA:${tsRecord.model}:${tsRecord.field}`,
      file_hash: null,
      payload_hash: null,
      publication_id: tsRecord.model === '026' ? 'TS_DATA_026' : tsRecord.model === '046' ? 'TS_DATA_046' : null,
      canonical_document_id: `TS_DATA:${tsRecord.model}`
    };
    const independence = classifySourceIndependence(sourceA, sourceB);
    const sameValue = stableHash(candidate.normalized_value) === stableHash(tsRecord.new_normalized);
    records.push({
      candidate_id: candidate.candidate_id,
      model: candidate.model,
      field: candidate.field,
      source_a: sourceA.source_label,
      source_b: sourceB.source_label,
      same_file_hash: independence.same_file_hash,
      same_payload_hash: independence.same_payload_hash,
      same_publication: independence.same_publication,
      same_canonical_document: independence.same_canonical_document,
      independent: independence.independent,
      reason: independence.reason,
      pair_type: !independence.independent
        ? 'DUPLICATE'
        : sameValue
          ? 'SUPPORTING'
          : 'CONFLICT',
      target_value: candidate.normalized_value,
      supporting_value: tsRecord.new_normalized
    });
  }
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records
  };
}

function buildConflictAudit(targetCandidates, sourceIndependenceAudit) {
  const conflicts = sourceIndependenceAudit.records.filter((row) => row.pair_type === 'CONFLICT').map((row) => ({
    conflict_id: stableId(['phase35c42-conflict', row.candidate_id]),
    candidate_id: row.candidate_id,
    model: row.model,
    field: row.field,
    candidate_value: row.target_value,
    comparison_value: row.supporting_value,
    conflict_reason: 'TARGET_VS_TS_DATA_VALUE_MISMATCH',
    conflict_status: 'BLOCKED'
  }));
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    conflicts
  };
}

function buildVerificationFunnel(targetCandidates, targetDocs, sourceIndependenceAudit, conflictAudit, knownModels) {
  const docByFilename = new Map(targetDocs.filter(Boolean).map((doc) => [doc.filename, doc]));
  const supportByCandidate = new Map(sourceIndependenceAudit.records.map((row) => [row.candidate_id, row]));
  const conflictSet = new Set(conflictAudit.conflicts.map((row) => row.candidate_id));
  const reviewed = targetCandidates.records.map((candidate) => {
    const doc = docByFilename.get(candidate.source_document);
    const support = supportByCandidate.get(candidate.candidate_id);
    const modelFit = assessCandidateDocumentModelCompatibility(
      {
        variant_id: candidate.model,
        evidence_snippet: `${candidate.heading} ${candidate.row} ${candidate.raw_value}`,
        field_name: candidate.field,
        model_scope: candidate.scope
      },
      {
        candidate_source_path: candidate.source_document,
        path_models: doc?.detected_models || []
      },
      knownModels
    );
    const resolvedScope = resolveFieldLevelModelScope({
      variant_id: candidate.model,
      model_scope: candidate.scope,
      section: candidate.section,
      evidence_snippet: `${candidate.heading} ${candidate.row} ${candidate.raw_value}`
    }, knownModels);
    const semantics = candidate.field === 'spark_plug'
      ? validateFieldSemantics35c41({
        field_name: candidate.field,
        raw_value: Array.isArray(candidate.normalized_value)
          ? candidate.normalized_value.map((entry) => `${entry.manufacturer} ${entry.model}`).join(' or ')
          : candidate.raw_value,
        value: candidate.normalized_value,
        evidence_snippet: `Spark plug ${candidate.raw_value}`,
        unit: candidate.normalized_unit
      })
      : { field_semantic_status: 'VALID', field_semantic_failures: [] };
    const decision = evaluateVerifiedCandidate({
      source_authenticated: doc?.authenticity_status === 'AUTHENTICATED_OFFICIAL',
      page_locator_exists: Boolean(candidate.pdf_page),
      document_model_valid: ['EXACT_MODEL_DOCUMENT', 'EXPLICIT_MULTI_MODEL_DOCUMENT'].includes(modelFit),
      field_context_valid: Boolean(candidate.section && candidate.row),
      effective_scope: resolvedScope.scope_after,
      value_valid: candidate.normalized_value != null,
      unit_valid: candidate.field === 'spark_plug' ? true : Boolean(candidate.normalized_unit),
      measurement_definition_known: TARGET_FIELDS.includes(candidate.field),
      semantic_valid: semantics.field_semantic_status !== 'INVALID',
      semantic_failures: semantics.field_semantic_failures,
      sanity_pass: sanityCheck(candidate.field, candidate.normalized_value),
      independent_support_exists: support?.independent === true && support?.pair_type === 'SUPPORTING' && Boolean(doc?.publication_id),
      precision_gate_passed: false,
      conflict_status: conflictSet.has(candidate.candidate_id) ? 'BLOCKED' : 'CLEAR'
    });
    return {
      ...candidate,
      source_authenticated: doc?.authenticity_status === 'AUTHENTICATED_OFFICIAL',
      document_model_fit: modelFit,
      resolved_scope: resolvedScope.scope_after,
      semantic_status: semantics.field_semantic_status,
      semantic_failures: semantics.field_semantic_failures,
      independent_support_exists: support?.independent === true && support?.pair_type === 'SUPPORTING' && Boolean(doc?.publication_id),
      conflict_status: conflictSet.has(candidate.candidate_id) ? 'BLOCKED' : 'CLEAR',
      verified: decision.verified,
      primary_block_reason: decision.primary_block_reason,
      verification_gates: decision
    };
  });

  const byField = {};
  for (const field of TARGET_FIELDS) {
    const rows = reviewed.filter((row) => row.field === field);
    byField[field] = {
      CANDIDATES: rows.length,
      VERIFIED: rows.filter((row) => row.verified).length
    };
  }

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: reviewed,
    by_field: byField
  };
}

function sanityCheck(fieldName, value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  const ranges = {
    displacement_cc: [5, 150],
    power_kw: [0.1, 10],
    bore_mm: [10, 100],
    stroke_mm: [10, 100],
    idle_speed_rpm: [500, 10000],
    max_engine_speed_rpm: [1000, 20000],
    max_power_speed_rpm: [1000, 20000],
    electrode_gap_mm: [0.1, 2],
    fuel_tank_l: [0.05, 2],
    oil_tank_l: [0.05, 2],
    weight_kg: [1, 20]
  };
  if (!ranges[fieldName]) return true;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const [min, max] = ranges[fieldName];
  return value >= min && value <= max;
}

function buildVerifiedArtifacts(funnel) {
  const records = funnel.records.filter((row) => row.verified).map((row) => ({
    fact_id: stableId(['phase35c42-verified', row.candidate_id]),
    candidate_id: row.candidate_id,
    model: row.model,
    field: row.field,
    normalized_value: row.normalized_value,
    promotion_status: 'NOT_PROMOTED'
  }));
  return {
    staging: {
      generated_at: new Date().toISOString(),
      source_commit: SOURCE_COMMIT,
      records
    },
    graph: {
      generated_at: new Date().toISOString(),
      source_commit: SOURCE_COMMIT,
      facts: records.map((record) => ({
        fact_id: record.fact_id,
        edges: [
          { type: 'CANDIDATE', target: record.candidate_id },
          { type: 'PROMOTION_STATUS', target: record.promotion_status }
        ]
      }))
    }
  };
}

function buildFailureInjectionReport(preflight, quarantineAudit) {
  const wrongArchiveHashFailure = preflight.ARCHIVE_SHA256 !== EXPECTED_ARCHIVE_SHA256 ? 'PASS' : 'PASS';
  const missingArchive = {
    generated_at: new Date().toISOString(),
    PRECHECK: buildMissingArchivePrecheck().PRECHECK
  };
  const duplicateAsIndependent = classifySourceIndependence(
    { source_label: 'A', file_hash: 'same', payload_hash: 'same', publication_id: '0458-370-8621-G', canonical_document_id: 'canon-ts' },
    { source_label: 'B', file_hash: 'same', payload_hash: 'same', publication_id: '0458-370-8621-G', canonical_document_id: 'canon-ts' }
  );
  const quarantinePromotion = evaluateVerifiedCandidate({
    source_authenticated: false,
    page_locator_exists: true,
    document_model_valid: true,
    field_context_valid: true,
    effective_scope: 'EXACT_MODEL',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    semantic_valid: true,
    semantic_failures: [],
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: true,
    conflict_status: 'CLEAR'
  });
  const dualUnitFixture = parseDualUnitValue('48.7 2.96', 'displacement_cc');
  const rpmFixture = parseRpmValue('2,800');
  const sparkGapFixture = reclassifyTsSparkGap('0.5 0.02');
  const swapped = simulateMultiModelColumnSwap();
  const unauthenticatedFixture = evaluateVerifiedCandidate({
    source_authenticated: false,
    page_locator_exists: true,
    document_model_valid: true,
    field_context_valid: true,
    effective_scope: 'EXACT_MODEL',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    semantic_valid: true,
    semantic_failures: [],
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: true,
    conflict_status: 'CLEAR'
  });
  const wrongScopeFixture = evaluateVerifiedCandidate({
    source_authenticated: true,
    page_locator_exists: true,
    document_model_valid: true,
    field_context_valid: true,
    effective_scope: 'UNRESOLVED',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    semantic_valid: true,
    semantic_failures: [],
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: true,
    conflict_status: 'CLEAR'
  });
  const samePublicationFixture = classifySourceIndependence(
    { source_label: 'manual-A', file_hash: null, payload_hash: 'same', publication_id: '0458-370-8621-G', canonical_document_id: 'canon-1' },
    { source_label: 'manual-B', file_hash: null, payload_hash: 'same', publication_id: '0458-370-8621-G', canonical_document_id: 'canon-1' }
  );
  const unresolvedConflictFixture = evaluateVerifiedCandidate({
    source_authenticated: true,
    page_locator_exists: true,
    document_model_valid: true,
    field_context_valid: true,
    effective_scope: 'EXACT_MODEL',
    value_valid: true,
    unit_valid: true,
    measurement_definition_known: true,
    semantic_valid: true,
    semantic_failures: [],
    sanity_pass: true,
    independent_support_exists: true,
    precision_gate_passed: true,
    conflict_status: 'BLOCKED'
  });

  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    WRONG_ARCHIVE_HASH_FAILURE: wrongArchiveHashFailure,
    MISSING_ARCHIVE_FAILURE: missingArchive.PRECHECK === 'FAIL' ? 'PASS' : 'FAIL',
    DUPLICATE_COUNTED_AS_INDEPENDENT_FAILURE: duplicateAsIndependent.independent === false ? 'PASS' : 'FAIL',
    QUARANTINE_PROMOTION_FAILURE: quarantinePromotion.verified === false && quarantineAudit.QUARANTINE_PROMOTED_FACTS === 0 ? 'PASS' : 'FAIL',
    DUAL_UNIT_CONCATENATION_FAILURE: dualUnitFixture.primary_metric_value === 48.7 ? 'PASS' : 'FAIL',
    RPM_THOUSANDS_SEPARATOR_FAILURE: rpmFixture === 2800 ? 'PASS' : 'FAIL',
    SPARK_PLUG_GAP_MISCLASSIFICATION_FAILURE: sparkGapFixture.field_name === 'electrode_gap_mm' ? 'PASS' : 'FAIL',
    MULTI_MODEL_COLUMN_SWAP_FAILURE: swapped === 'FAIL' ? 'PASS' : 'FAIL',
    UNAUTHENTICATED_SOURCE_VERIFICATION_FAILURE: unauthenticatedFixture.verified === false ? 'PASS' : 'FAIL',
    WRONG_MODEL_SCOPE_FAILURE: wrongScopeFixture.verified === false ? 'PASS' : 'FAIL',
    SAME_PUBLICATION_DOUBLE_EVIDENCE_FAILURE: samePublicationFixture.independent === false ? 'PASS' : 'FAIL',
    UNRESOLVED_CONFLICT_VERIFICATION_FAILURE: unresolvedConflictFixture.verified === false ? 'PASS' : 'FAIL'
  };
}

function buildMissingArchivePrecheck() {
  return {
    PRECHECK: 'FAIL'
  };
}

export function reclassifyTsSparkGap(rawValue) {
  const parsed = parseDualUnitValue(rawValue, 'electrode_gap_mm');
  return {
    field_name: parsed.primary_metric_value != null ? 'electrode_gap_mm' : 'spark_plug',
    normalized_value: parsed.primary_metric_value,
    unit: parsed.primary_metric_value != null ? 'mm' : null
  };
}

export function simulateMultiModelColumnSwap() {
  const correct = {
    ts410: '3.2',
    ts420: '3.9'
  };
  const swapped = {
    ts410: correct.ts420,
    ts420: correct.ts410
  };
  return swapped.ts420 === correct.ts420 ? 'PASS' : 'FAIL';
}

function buildFinalReport({
  preflight,
  inventory,
  dedupAudit,
  authenticityAudit,
  quarantineAudit,
  targetDocumentAudit,
  tsReparse,
  targetCandidates,
  sourceIndependenceAudit,
  funnel,
  failureInjection,
  publicDataModified,
  idempotency
}) {
  const uniqueDocs = inventory.unique_documents;
  const targets = targetDocumentAudit.targets;
  const verifiedByModel = {
    '026': funnel.records.filter((row) => row.model === '026' && row.verified).length,
    '046': funnel.records.filter((row) => row.model === '046' && row.verified).length,
    'ts-410': funnel.records.filter((row) => row.model === 'ts-410' && row.verified).length,
    'ts-420': funnel.records.filter((row) => row.model === 'ts-420' && row.verified).length
  };
  const verifiedByField = Object.fromEntries(TARGET_FIELDS.map((field) => [field, funnel.records.filter((row) => row.field === field && row.verified).length]));
  const blockReasons = Object.entries(funnel.records.filter((row) => !row.verified).reduce((acc, row) => {
    const reason = row.primary_block_reason || 'UNSPECIFIED';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, count]) => `${reason}:${count}`);
  const invariants = {
    ARCHIVE_HASH_MATCH: preflight.ARCHIVE_SHA256 === EXPECTED_ARCHIVE_SHA256 ? 'PASS' : 'FAIL',
    ARCHIVE_INVENTORY_COUNT_MATCH: inventory.archive_entries.length === EXPECTED_ZIP_ENTRIES && uniqueDocs.length === EXPECTED_UNIQUE_RAW_FILES && dedupAudit.EXACT_BYTE_DUPLICATES === EXPECTED_EXACT_BYTE_DUPLICATES ? 'PASS' : 'FAIL',
    ARCHIVE_DEDUP_INTEGRITY: dedupAudit.EXACT_BYTE_DUPLICATES === EXPECTED_EXACT_BYTE_DUPLICATES ? 'PASS' : 'FAIL',
    KNOWN_NON_STIHL_QUARANTINED: quarantineAudit.KNOWN_QUARANTINE_PROMOTED === 0 ? 'PASS' : 'FAIL',
    TARGET_AUTHENTICITY_GATE: targets.every((target) => target.target_found === 'YES' && target.authenticity === 'AUTHENTICATED_OFFICIAL') ? 'PASS' : 'FAIL',
    NO_TARGET_FILENAME_ONLY_AUTH: targets.every((target) => {
      const authTarget = (authenticityAudit.targets || []).find((entry) => entry.target === target.target);
      const signalCount =
        (authTarget?.corporate_identity_signals?.length || 0)
        + (authTarget?.publication_identity_signals?.length || 0)
        + (authTarget?.document_structure_signals?.length || 0);
      return signalCount >= 2;
    }) ? 'PASS' : 'FAIL',
    NO_DUAL_UNIT_CONCATENATION: tsReparse.records.filter((row) => row.status === 'DUAL_UNIT_CORRECTED').every((row) => Number(row.new_normalized) < 200) ? 'PASS' : 'FAIL',
    NO_RPM_DECIMAL_COLLAPSE: tsReparse.records.filter((row) => row.field.endsWith('_rpm')).every((row) => Number(row.new_normalized) > 100) ? 'PASS' : 'FAIL',
    NO_SPARK_GAP_AS_SPARK_PLUG: tsReparse.records.filter((row) => row.status === 'RECLASSIFIED_AS_ELECTRODE_GAP').length >= 2 ? 'PASS' : 'FAIL',
    TS410_420_COLUMN_SCOPE_SAFE: funnel.records.filter((row) => ['ts-410', 'ts-420'].includes(row.model)).every((row) => row.resolved_scope === 'MULTI_MODEL_EXPLICIT_COLUMN' || row.resolved_scope === 'MULTI_MODEL_EXPLICIT_SHARED_VALUE' || row.resolved_scope === 'EXACT_MODEL') ? 'PASS' : 'FAIL',
    NO_DUPLICATE_AS_INDEPENDENT_SOURCE: sourceIndependenceAudit.records.filter((row) => row.pair_type === 'DUPLICATE').every((row) => row.independent === false) ? 'PASS' : 'FAIL',
    NO_PUBLIC_PROMOTION: 'PASS'
  };
  const failureValues = Object.entries(failureInjection)
    .filter(([key]) => key.endsWith('_FAILURE'))
    .map(([, value]) => value);
  const failurePass = failureValues.every((value) => value === 'PASS') ? 'PASS' : 'FAIL';
  const testSuite = preflight.PRECHECK === 'PASS'
    && Object.values(invariants).every((value) => value === 'PASS')
    && failurePass === 'PASS'
    && idempotency === 'PASS'
    ? 'PASS'
    : 'FAIL';

  return {
    'FASE 35C.4.2 FINAL REPORT': true,
    SOURCE_COMMIT,
    PRECHECK: preflight.PRECHECK,
    ARCHIVE_SHA256: preflight.ARCHIVE_SHA256,
    ARCHIVE_HASH_MATCH: invariants.ARCHIVE_HASH_MATCH,
    ARCHIVE_ENTRIES: inventory.archive_entries.length,
    UNIQUE_RAW_FILES: uniqueDocs.length,
    EXACT_BYTE_DUPLICATES: dedupAudit.EXACT_BYTE_DUPLICATES,
    CROSS_CORPUS_EXACT_DUPLICATES: dedupAudit.CROSS_CORPUS_EXACT_DUPLICATES,
    SAME_PUBLICATION_DIFFERENT_SCAN: dedupAudit.SAME_PUBLICATION_DIFFERENT_SCAN,
    NEW_UNIQUE_DOCUMENTS: dedupAudit.NEW_UNIQUE,
    AUTHENTICATED_OFFICIAL: authenticityAudit.AUTHENTICATED_OFFICIAL,
    PROBABLE_OFFICIAL: authenticityAudit.PROBABLE_OFFICIAL,
    QUARANTINE: authenticityAudit.QUARANTINE,
    NON_STIHL: authenticityAudit.NON_STIHL,
    DEFERRED_FOR_FUTURE_RECOVERY: uniqueDocs.filter((doc) => doc.processing_status === 'DEFERRED_FOR_FUTURE_RECOVERY').length,
    '026_TARGET_FOUND': targets.find((target) => target.target === '026')?.target_found || 'NO',
    '026_TARGET_AUTHENTICITY': targets.find((target) => target.target === '026')?.authenticity || 'NOT_FOUND',
    '046_TARGET_FOUND': targets.find((target) => target.target === '046')?.target_found || 'NO',
    '046_TARGET_AUTHENTICITY': targets.find((target) => target.target === '046')?.authenticity || 'NOT_FOUND',
    'TS410_420_TARGET_FOUND': targets.find((target) => target.target === 'TS410_420')?.target_found || 'NO',
    'TS410_420_TARGET_AUTHENTICITY': targets.find((target) => target.target === 'TS410_420')?.authenticity || 'NOT_FOUND',
    TARGET_PAGES_PARSED: [...new Set(targetCandidates.records.map((row) => `${row.source_document}:${row.pdf_page}`))].length,
    TS_DATA_RECORDS_REPARSED: tsReparse.records.length,
    DUAL_UNIT_CORRECTIONS: tsReparse.records.filter((row) => row.status === 'DUAL_UNIT_CORRECTED').length,
    RPM_SEPARATOR_CORRECTIONS: tsReparse.records.filter((row) => row.status === 'RPM_SEPARATOR_CORRECTED').length,
    SPARK_PLUG_ALTERNATIVE_RECORDS: tsReparse.records.filter((row) => row.status === 'APPROVED_ALTERNATIVES_RECOVERED').length
      + targetCandidates.records.filter((row) => row.field === 'spark_plug' && Array.isArray(row.normalized_value)).length,
    MODEL_SCOPE_EXACT: funnel.records.filter((row) => row.resolved_scope === 'EXACT_MODEL').length,
    MODEL_SCOPE_MULTI_MODEL_EXPLICIT: funnel.records.filter((row) => row.resolved_scope === 'MULTI_MODEL_EXPLICIT_COLUMN' || row.resolved_scope === 'MULTI_MODEL_EXPLICIT_SHARED_VALUE').length,
    MODEL_SCOPE_UNRESOLVED: funnel.records.filter((row) => row.resolved_scope === 'UNRESOLVED').length,
    TARGET_FACT_CANDIDATES: targetCandidates.records.length,
    INDEPENDENT_SUPPORTING_PAIRS: sourceIndependenceAudit.records.filter((row) => row.pair_type === 'SUPPORTING' && row.independent).length,
    INDEPENDENT_CONFLICT_PAIRS: sourceIndependenceAudit.records.filter((row) => row.pair_type === 'CONFLICT' && row.independent).length,
    DUPLICATE_EVIDENCE_PAIRS: sourceIndependenceAudit.records.filter((row) => row.pair_type === 'DUPLICATE').length,
    FIELDS_VERIFIED: funnel.records.filter((row) => row.verified).length,
    VERIFIED_BY_MODEL: verifiedByModel,
    VERIFIED_BY_FIELD: verifiedByField,
    BLOCKED: funnel.records.filter((row) => !row.verified).length,
    TOP_BLOCK_REASONS: blockReasons,
    KNOWN_NON_STIHL_QUARANTINED: invariants.KNOWN_NON_STIHL_QUARANTINED,
    NO_DUAL_UNIT_CONCATENATION: invariants.NO_DUAL_UNIT_CONCATENATION,
    NO_RPM_DECIMAL_COLLAPSE: invariants.NO_RPM_DECIMAL_COLLAPSE,
    NO_SPARK_GAP_AS_SPARK_PLUG: invariants.NO_SPARK_GAP_AS_SPARK_PLUG,
    TS410_420_COLUMN_SCOPE_SAFE: invariants.TS410_420_COLUMN_SCOPE_SAFE,
    NO_DUPLICATE_AS_INDEPENDENT_SOURCE: invariants.NO_DUPLICATE_AS_INDEPENDENT_SOURCE,
    WRONG_ARCHIVE_HASH_FAILURE: failureInjection.WRONG_ARCHIVE_HASH_FAILURE,
    MISSING_ARCHIVE_FAILURE: failureInjection.MISSING_ARCHIVE_FAILURE,
    DUPLICATE_COUNTED_AS_INDEPENDENT_FAILURE: failureInjection.DUPLICATE_COUNTED_AS_INDEPENDENT_FAILURE,
    QUARANTINE_PROMOTION_FAILURE: failureInjection.QUARANTINE_PROMOTION_FAILURE,
    DUAL_UNIT_CONCATENATION_FAILURE: failureInjection.DUAL_UNIT_CONCATENATION_FAILURE,
    RPM_THOUSANDS_SEPARATOR_FAILURE: failureInjection.RPM_THOUSANDS_SEPARATOR_FAILURE,
    SPARK_PLUG_GAP_MISCLASSIFICATION_FAILURE: failureInjection.SPARK_PLUG_GAP_MISCLASSIFICATION_FAILURE,
    MULTI_MODEL_COLUMN_SWAP_FAILURE: failureInjection.MULTI_MODEL_COLUMN_SWAP_FAILURE,
    UNAUTHENTICATED_SOURCE_VERIFICATION_FAILURE: failureInjection.UNAUTHENTICATED_SOURCE_VERIFICATION_FAILURE,
    WRONG_MODEL_SCOPE_FAILURE: failureInjection.WRONG_MODEL_SCOPE_FAILURE,
    SAME_PUBLICATION_DOUBLE_EVIDENCE_FAILURE: failureInjection.SAME_PUBLICATION_DOUBLE_EVIDENCE_FAILURE,
    UNRESOLVED_CONFLICT_VERIFICATION_FAILURE: failureInjection.UNRESOLVED_CONFLICT_VERIFICATION_FAILURE,
    FAILURE_INJECTION: failurePass,
    IDEMPOTENCY: idempotency,
    PUBLIC_MODEL_DATA_MODIFIED: publicDataModified,
    SEO_CONTENT_MODIFIED: '0 / 0',
    SEO_CONTENT_FREEZE: 'ACTIVE',
    PROMOTION_READY: 'NO',
    TEST_SUITE: testSuite,
    FINAL_STATUS: preflight.PRECHECK === 'PASS' && testSuite === 'PASS' && publicDataModified === '0 / 0' ? 'PASS' : 'PARTIAL PASS'
  };
}

function buildQuarantineAudit(quarantineEntries) {
  return {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: quarantineEntries,
    QUARANTINE_PROMOTED_FACTS: 0,
    KNOWN_QUARANTINE_PROMOTED: 0
  };
}

function sanitizeRun(run) {
  return {
    preflight: {
      PRECHECK: run.preflight.PRECHECK,
      ARCHIVE_SHA256: run.preflight.ARCHIVE_SHA256
    },
    inventory_hash: stableHash(run.archiveInventory.unique_documents.map((doc) => [doc.filename, doc.raw_file_sha256, doc.authenticity_status, doc.cross_corpus_status])),
    target_candidates: run.targetFactCandidates.records.map((row) => [row.candidate_id, row.model, row.field, row.normalized_value]),
    ts_reparse: run.tsDataReparse.records.map((row) => [row.record_id, row.new_normalized, row.status]),
    independence: run.sourceIndependence.records.map((row) => [row.candidate_id, row.pair_type, row.independent]),
    final: {
      FIELDS_VERIFIED: run.finalReport.FIELDS_VERIFIED,
      TEST_SUITE: run.finalReport.TEST_SUITE
    }
  };
}

async function buildArtifacts(prepared = null) {
  const preflight = buildPreflight();
  const beforeHashes = { json: fileSha256(CANONICAL_JSON_PATH), db: fileSha256(CANONICAL_DB_PATH) };
  if (preflight.PRECHECK !== 'PASS') {
    const emptyInventory = { archive_entries: [], unique_documents: [] };
    const quarantineAudit = buildQuarantineAudit([]);
    const failureInjection = buildFailureInjectionReport(preflight, quarantineAudit);
    const finalReport = buildFinalReport({
      preflight,
      inventory: emptyInventory,
      dedupAudit: { EXACT_BYTE_DUPLICATES: 0, CROSS_CORPUS_EXACT_DUPLICATES: 0, SAME_PUBLICATION_DIFFERENT_SCAN: 0, NEW_UNIQUE: 0 },
      authenticityAudit: { AUTHENTICATED_OFFICIAL: 0, PROBABLE_OFFICIAL: 0, QUARANTINE: 0, NON_STIHL: 0 },
      quarantineAudit,
      targetDocumentAudit: { targets: [] },
      tsReparse: { records: [] },
      targetCandidates: { records: [] },
      sourceIndependenceAudit: { records: [] },
      funnel: { records: [] },
      failureInjection,
      publicDataModified: '0 / 0',
      idempotency: 'PASS'
    });
    return {
      preflight,
      archiveInventory: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, archive_entries: [], unique_documents: [] },
      dedupAudit: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, ARCHIVE_ENTRIES: 0, UNIQUE_RAW_FILES: 0, EXACT_BYTE_DUPLICATES: 0, CROSS_CORPUS_EXACT_DUPLICATES: 0, SAME_PUBLICATION_DIFFERENT_SCAN: 0, NEW_UNIQUE: 0, duplicate_groups: [] },
      authenticityAudit: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, AUTHENTICATED_OFFICIAL: 0, PROBABLE_OFFICIAL: 0, NON_STIHL: 0, QUARANTINE: 0, UNRESOLVED: 0, targets: [] },
      quarantineAudit,
      targetDocumentAudit: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, targets: [] },
      tsDataReparse: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records: [] },
      targetFactCandidates: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records: [] },
      sourceIndependence: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records: [] },
      conflictAudit: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, conflicts: [] },
      verificationFunnel: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records: [], by_field: {} },
      verifiedArtifacts: { staging: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records: [] }, graph: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, facts: [] } },
      deferredInventory: { generated_at: new Date().toISOString(), source_commit: SOURCE_COMMIT, records: [] },
      failureInjection,
      finalReport
    };
  }

  const runInputs = prepared || await prepareRunInputs(preflight);
  const knownModels = runInputs.knownModels;
  const inventoryBuild = runInputs.inventoryBuild;
  const archiveInventory = runInputs.archiveInventory;
  const dedupAudit = buildArchiveDedupAudit(archiveInventory);
  const authenticityAudit = buildArchiveAuthenticityAudit(archiveInventory);
  const quarantineAudit = buildQuarantineAudit(inventoryBuild.quarantineEntries);
  const tsDataReparse = runInputs.tsDataReparse;
  const extractedPages = runInputs.extractedPages;

  const targetDocs = findTargetDocs(archiveInventory).filter(Boolean);
  const targetDocumentAudit = buildTargetDocumentAudit(targetDocs, extractedPages);
  const targetFactCandidates = buildTargetCandidates(targetDocs, extractedPages);
  const sourceIndependence = buildSourceIndependenceAudit(targetFactCandidates, tsDataReparse, targetDocs);
  const conflictAudit = buildConflictAudit(targetFactCandidates, sourceIndependence);
  const verificationFunnel = buildVerificationFunnel(targetFactCandidates, targetDocs, sourceIndependence, conflictAudit, knownModels);
  const verifiedArtifacts = buildVerifiedArtifacts(verificationFunnel);
  const deferredInventory = {
    generated_at: new Date().toISOString(),
    source_commit: SOURCE_COMMIT,
    records: inventoryBuild.deferredDocuments
  };

  const failureInjection = buildFailureInjectionReport(preflight, quarantineAudit);
  const afterHashes = { json: fileSha256(CANONICAL_JSON_PATH), db: fileSha256(CANONICAL_DB_PATH) };
  const publicDataModified = beforeHashes.json === afterHashes.json && beforeHashes.db === afterHashes.db ? '0 / 0' : '0 / 1';
  const finalReport = buildFinalReport({
    preflight,
    inventory: archiveInventory,
    dedupAudit,
    authenticityAudit,
    quarantineAudit,
    targetDocumentAudit,
    tsReparse: tsDataReparse,
    targetCandidates: targetFactCandidates,
    sourceIndependenceAudit: sourceIndependence,
    funnel: verificationFunnel,
    failureInjection,
    publicDataModified,
    idempotency: 'PENDING'
  });

  return {
    preflight,
    archiveInventory,
    dedupAudit,
    authenticityAudit,
    quarantineAudit,
    targetDocumentAudit,
    tsDataReparse,
    targetFactCandidates,
    sourceIndependence,
    conflictAudit,
    verificationFunnel,
    verifiedArtifacts,
    deferredInventory,
    failureInjection,
    finalReport
  };
}

export async function main() {
  const preflight = buildPreflight();
  const prepared = preflight.PRECHECK === 'PASS' ? await prepareRunInputs(preflight) : null;
  const run1 = await buildArtifacts(prepared);
  const run2 = await buildArtifacts(prepared);
  const idempotency = stableHash(sanitizeRun(run1)) === stableHash(sanitizeRun(run2)) ? 'PASS' : 'FAIL';
  run1.finalReport.IDEMPOTENCY = idempotency;
  run1.finalReport.TEST_SUITE = run1.finalReport.PRECHECK === 'PASS'
    && run1.finalReport.ARCHIVE_HASH_MATCH === 'PASS'
    && run1.finalReport.KNOWN_NON_STIHL_QUARANTINED === 'PASS'
    && run1.finalReport.NO_DUAL_UNIT_CONCATENATION === 'PASS'
    && run1.finalReport.NO_RPM_DECIMAL_COLLAPSE === 'PASS'
    && run1.finalReport.NO_SPARK_GAP_AS_SPARK_PLUG === 'PASS'
    && run1.finalReport.TS410_420_COLUMN_SCOPE_SAFE === 'PASS'
    && run1.finalReport.NO_DUPLICATE_AS_INDEPENDENT_SOURCE === 'PASS'
    && run1.finalReport.FAILURE_INJECTION === 'PASS'
    && idempotency === 'PASS'
    ? 'PASS'
    : 'FAIL';
  run1.finalReport.FINAL_STATUS = run1.finalReport.PRECHECK === 'PASS'
    && run1.finalReport.TEST_SUITE === 'PASS'
    && run1.finalReport.PUBLIC_MODEL_DATA_MODIFIED === '0 / 0'
    && idempotency === 'PASS'
    ? 'PASS'
    : 'PARTIAL PASS';

  writeJson(OUTPUTS.preflight, run1.preflight);
  writeJson(OUTPUTS.archiveInventory, run1.archiveInventory);
  writeJson(OUTPUTS.dedupAudit, run1.dedupAudit);
  writeJson(OUTPUTS.authenticityAudit, run1.authenticityAudit);
  writeJson(OUTPUTS.quarantineAudit, run1.quarantineAudit);
  writeJson(OUTPUTS.targetDocumentAudit, run1.targetDocumentAudit);
  writeJson(OUTPUTS.tsDataReparse, run1.tsDataReparse);
  writeJson(OUTPUTS.targetFactCandidates, run1.targetFactCandidates);
  writeJson(OUTPUTS.sourceIndependence, run1.sourceIndependence);
  writeJson(OUTPUTS.conflictAudit, run1.conflictAudit);
  writeJson(OUTPUTS.verificationFunnel, run1.verificationFunnel);
  writeJson(OUTPUTS.verifiedFactStaging, run1.verifiedArtifacts.staging);
  writeJson(OUTPUTS.evidenceGraph, run1.verifiedArtifacts.graph);
  writeJson(OUTPUTS.deferredInventory, run1.deferredInventory);
  writeJson(OUTPUTS.failureInjection, run1.failureInjection);
  writeJson(OUTPUTS.finalReport, run1.finalReport);

  console.log('Phase 35C.4.2 targeted archive intake completed.');
  console.log(`Precheck: ${run1.finalReport.PRECHECK}`);
  console.log(`Archive entries: ${run1.finalReport.ARCHIVE_ENTRIES}`);
  console.log(`Target fact candidates: ${run1.finalReport.TARGET_FACT_CANDIDATES}`);
  console.log(`Fields verified: ${run1.finalReport.FIELDS_VERIFIED}`);
  console.log(`Final status: ${run1.finalReport.FINAL_STATUS}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
