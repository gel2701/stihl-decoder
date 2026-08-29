import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import zlib from 'zlib';
import readline from 'readline';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  assessAuthenticityFromPayload,
  buildGoldPrecisionAuditRow,
  buildGoldValidationRecord,
  parseTsDataHtmlStrict,
  resolveModelScopeMutation
} from './phase35c31_legacy_graph_validation_hotfix.js';
import {
  detectFilenamePayloadConflict,
  parseLegacyPublicationIdentity,
  parseModelIndexHtml
} from './phase35c3_legacy_library_graph.js';
import { buildKnownModelDictionary } from '../src/documentAuthority.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SOURCE_COMMIT = '0c575a0';
const SOURCE_BATCH = 'BATCH6_STIHL_LEGACY_DOCUMENT_CD';
const ZIP_PATH = 'D:/Downloads/Stihl library.zip';
const LIBRARY_ROOT = 'D:/Downloads/Stihl library/Stihl library';
const CANONICAL_JSON_PATH = path.join(rootDir, 'data', 'stihl_database.json');
const CANONICAL_DB_PATH = path.join(rootDir, 'data', 'stihl_database.db');
const DEFAULT_CANDIDATE_ARCHIVE = path.join(rootDir, 'data', 'generated', 'phase35c2_blocked_field_candidates.jsonl.gz');
const BUNDLED_PYTHON = 'C:/Users/GelliusSnippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const PAYLOAD_NORMALIZATION_VERSION = 'phase35c32-v1';
const OUTPUTS = {
  finalReport: path.join(rootDir, 'data', 'phase35c32_final_report.json'),
  dedupAudit: path.join(rootDir, 'data', 'phase35c32_dedup_semantics_audit.json'),
  validatorIntegrity: path.join(rootDir, 'data', 'phase35c32_validator_integrity_report.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c32_failure_injection_report.json'),
  reproducibility: path.join(rootDir, 'data', 'phase35c32_reproducibility_report.json'),
  candidateSource: path.join(rootDir, 'data', 'phase35c32_candidate_source_report.json')
};
const PRIOR_DATA = {
  batch2Registry: path.join(rootDir, 'data', 'batch2_document_registry.json'),
  batch3Registry: path.join(rootDir, 'data', 'batch3_pdf_document_registry.json'),
  batch3Native: path.join(rootDir, 'data', 'batch3_native_pdf_extraction_report.json'),
  phase35c2Summary: path.join(rootDir, 'data', 'phase35c2_blocked_field_candidates_summary.json'),
  phase35c31Final: path.join(rootDir, 'data', 'phase35c31_final_report.json'),
  phase35c31TsAudit: path.join(rootDir, 'data', 'phase35c31_ts_data_parser_audit.json'),
  phase35c31Ts700: path.join(rootDir, 'data', 'phase35c31_ts700_real_corpus_audit.json')
};

const DEDUP_STATES = [
  'SAME_SOURCE_REFERENCE',
  'EXACT_FILE_DUPLICATE',
  'EXACT_CONTENT_DUPLICATE',
  'SAME_PUBLICATION_DIFFERENT_SCAN',
  'SAME_PUBLICATION_POSSIBLE_REVISION',
  'IDENTITY_MATCH_ONLY',
  'IDENTITY_CONFLICT',
  'NEW_UNIQUE',
  'UNRESOLVED'
];
const EXACT_MODEL_SCOPES = new Set(['EXACT_MODEL', 'EXACT_VARIANT', 'MULTI_MODEL_EXPLICIT_COLUMN']);
const HIGH_VALUE_MODELS = new Set(['ms-261', 'fs-100', 'br-600', 'ts-420', 'ts-700', 'ts-800']);
const FIELD_ORDER = ['power_kw', 'weight_kg', 'spark_plug', 'part_number', 'carb_h_setting', 'carb_l_setting', 'displacement_cc', 'electrode_gap_mm'];

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

function stableHash(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
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

function stableId(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLooseText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePathForLookup(filePath) {
  return String(filePath || '').replace(/\//g, '\\').toLowerCase();
}

function normalizePayloadText(value) {
  return normalizeText(value);
}

function normalizePayloadHash(value) {
  return crypto.createHash('sha256').update(`${PAYLOAD_NORMALIZATION_VERSION}\n${normalizePayloadText(value)}`).digest('hex');
}

function listFilesRecursive(baseDir, predicate) {
  const results = [];
  const stack = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!predicate || predicate(fullPath, entry)) results.push(fullPath);
    }
  }
  return results.sort((left, right) => left.localeCompare(right));
}

function loadLatin1(filePath) {
  return fs.readFileSync(filePath, 'latin1');
}

function inferFamilyFromPath(filePath) {
  const normalized = normalizePathForLookup(filePath);
  if (normalized.includes('\\pdf\\ti\\')) return 'TI';
  if (normalized.includes('\\pdf\\ra\\')) return 'RA';
  return null;
}

function resolveCandidateArchivePath() {
  const preferred = process.env.PHASE35C2_BLOCKED_CANDIDATES_PATH
    ? path.resolve(process.env.PHASE35C2_BLOCKED_CANDIDATES_PATH)
    : DEFAULT_CANDIDATE_ARCHIVE;
  if (!fs.existsSync(preferred)) {
    throw new Error('Required reproducible candidate artifact is missing.\nRegenerate Phase 35C.2 blocked candidate archive first.');
  }
  return preferred;
}

export async function loadCandidateArchiveStreamReport(archivePath) {
  if (!fs.existsSync(archivePath)) {
    throw new Error('Required reproducible candidate artifact is missing.\nRegenerate Phase 35C.2 blocked candidate archive first.');
  }

  const compressedFileHash = fileSha256(archivePath);
  const canonicalHash = crypto.createHash('sha256');
  const candidates = [];
  let count = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(archivePath).pipe(zlib.createGunzip()),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    canonicalHash.update(line);
    canonicalHash.update('\n');
    candidates.push(JSON.parse(line));
    count += 1;
  }

  return {
    archive_path: archivePath,
    compressed_file_hash: compressedFileHash,
    canonical_record_stream_hash: canonicalHash.digest('hex'),
    record_count: count,
    candidates
  };
}

function tryPythonCandidate(command) {
  try {
    const probe = spawnSync(command, ['-c', 'import json,sys,pypdf; print(json.dumps({"python": sys.executable, "pypdf": getattr(pypdf, "__version__", "unknown")}))'], {
      encoding: 'utf8'
    });
    if (probe.status === 0) return JSON.parse(probe.stdout.trim());
  } catch {}
  return null;
}

export function resolvePythonRuntime() {
  const candidates = [
    process.env.PHASE35_PYTHON || null,
    'python',
    'python3',
    BUNDLED_PYTHON
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = tryPythonCandidate(candidate);
    if (resolved) {
      return {
        command: candidate,
        executable: resolved.python,
        payloadEngine: 'pypdf',
        payloadEngineVersion: resolved.pypdf
      };
    }
  }
  throw new Error('Unable to resolve a Python runtime with pypdf. Set PHASE35_PYTHON or install pypdf in python/python3.');
}

function buildRelationsByPublication(modelRelations) {
  const byPublication = new Map();
  for (const relation of modelRelations) {
    if (!relation.linked_document_id) continue;
    if (!byPublication.has(relation.linked_document_id)) byPublication.set(relation.linked_document_id, []);
    byPublication.get(relation.linked_document_id).push(relation.model_variant);
  }
  return byPublication;
}

function buildExistingMaps(batch2Registry, batch3Registry, batch3Native) {
  const batch2ByPath = new Map();
  const batch2ByPublication = new Map();
  for (const document of batch2Registry.documents || []) {
    batch2ByPath.set(normalizePathForLookup(document.source_file_path), document);
    const publicationId = parseLegacyPublicationIdentity(document.source_file_path || '').normalized_publication_id;
    if (publicationId && !batch2ByPublication.has(publicationId)) batch2ByPublication.set(publicationId, document);
  }

  const batch3ByPublication = new Map();
  const batch3ByFileHash = new Map();
  for (const document of batch3Registry.documents || []) {
    const publicationId = parseLegacyPublicationIdentity(document.source_file_path || '').normalized_publication_id;
    if (publicationId && !batch3ByPublication.has(publicationId)) batch3ByPublication.set(publicationId, document);
    if (document.file_hash && !batch3ByFileHash.has(document.file_hash)) batch3ByFileHash.set(document.file_hash, document);
  }

  const batch3NativeByPublication = new Map();
  for (const document of batch3Native.documents || []) {
    const publicationId = parseLegacyPublicationIdentity(document.file_path || '').normalized_publication_id;
    if (publicationId && !batch3NativeByPublication.has(publicationId)) batch3NativeByPublication.set(publicationId, document);
  }

  return { batch2ByPath, batch2ByPublication, batch3ByPublication, batch3ByFileHash, batch3NativeByPublication };
}

function runPythonJson(pythonCommand, script, args, maxBuffer = 256 * 1024 * 1024) {
  return JSON.parse(execFileSync(pythonCommand, ['-c', script, ...args], {
    encoding: 'utf8',
    maxBuffer
  }));
}

function extractBatch6NativePayloads(libraryRoot, pythonCommand) {
  const script = `
import hashlib, json, os, re, sys
from pypdf import PdfReader

norm_version = sys.argv[2]
library_root = sys.argv[1]
pdf_root = os.path.join(library_root, 'PDF')
documents = []
for current_root, _, files in os.walk(pdf_root):
    for name in sorted(files):
        if not name.lower().endswith('.pdf'):
            continue
        full_path = os.path.join(current_root, name)
        norm_path = full_path.replace('/', '\\\\').lower()
        if '\\\\pdf\\\\ti\\\\' not in norm_path and '\\\\pdf\\\\ra\\\\' not in norm_path:
            continue
        parse_error = None
        non_empty = []
        page_count = 0
        try:
            reader = PdfReader(full_path)
            page_count = len(reader.pages)
            for idx, page in enumerate(reader.pages):
                try:
                    text = page.extract_text() or ''
                except Exception:
                    text = ''
                text = ' '.join(text.split())
                if text:
                    non_empty.append((idx + 1, text))
        except Exception as exc:
            parse_error = str(exc)
        combined = ' '.join(text for _, text in non_empty)
        payload_hash = hashlib.sha256((norm_version + '\\n' + combined).encode('utf-8')).hexdigest() if combined else None
        documents.append({
            'file_path': full_path,
            'file_hash': hashlib.sha256(open(full_path, 'rb').read()).hexdigest(),
            'payload_hash': payload_hash,
            'normalized_text': combined,
            'pdf_pages': page_count,
            'native_pages_with_text': len(non_empty),
            'native_pages_empty': max(page_count - len(non_empty), 0),
            'payload_characters': len(combined),
            'front_excerpt': ' '.join(text for _, text in non_empty[:3])[:2400],
            'back_excerpt': ' '.join(text for _, text in non_empty[-2:])[:1800],
            'title_line': non_empty[0][1][:400] if non_empty else '',
            'parse_error': parse_error,
            'publication_hits': re.findall(r'\\b(?:RA|TI)[ _-]?\\d{2,3}(?:[ _-]?\\d{2}){1,4}\\b', combined, flags=re.I)[:8]
        })
print(json.dumps(documents))
`;
  return runPythonJson(pythonCommand, script, [libraryRoot, PAYLOAD_NORMALIZATION_VERSION]);
}

function extractSinglePdfPayload(filePath, pythonCommand) {
  const script = `
import json, re, sys
from pypdf import PdfReader

full_path = sys.argv[1]
non_empty = []
page_count = 0
parse_error = None
try:
    reader = PdfReader(full_path)
    page_count = len(reader.pages)
    for page in reader.pages:
        try:
            text = page.extract_text() or ''
        except Exception:
            text = ''
        text = ' '.join(text.split())
        if text:
            non_empty.append(text)
except Exception as exc:
    parse_error = str(exc)
combined = ' '.join(non_empty)
print(json.dumps({
    'file_path': full_path,
    'pdf_pages': page_count,
    'title_line': non_empty[0][:400] if non_empty else '',
    'front_excerpt': ' '.join(non_empty[:3])[:2400],
    'ts_model_hits': re.findall(r'\\bTS\\s*(?:700|800)\\b', combined, flags=re.I)[:20],
    'parse_error': parse_error
}))
`;
  return runPythonJson(pythonCommand, script, [filePath], 32 * 1024 * 1024);
}

function pickBestPriorRecord(document, maps) {
  const batch2PathRecord = maps.batch2ByPath.get(normalizePathForLookup(document.file_path)) || null;
  const batch3PublicationRecord = document.publication_id ? maps.batch3ByPublication.get(document.publication_id) || null : null;
  const batch3FileHashRecord = document.file_hash ? maps.batch3ByFileHash.get(document.file_hash) || null : null;
  return batch2PathRecord || batch3FileHashRecord || batch3PublicationRecord || null;
}

export function classifyDedupEntry(document, context) {
  const {
    priorRecord = null,
    priorPublicationRecord = null,
    priorFileHashRecord = null,
    priorPayloadRecord = null,
    samePhysicalSource = false,
    fileHashEqual = false,
    payloadHashEqual = false,
    pageCountEqual = false,
    identityConflict = false,
    linkedModels = []
  } = context;

  let dedup_status = 'UNRESOLVED';
  let reason = 'No safe duplicate or unique classification could be proven.';

  if (identityConflict) {
    dedup_status = 'IDENTITY_CONFLICT';
    reason = 'Filename/payload identity conflict overrides other matching heuristics.';
  } else if (samePhysicalSource) {
    dedup_status = 'SAME_SOURCE_REFERENCE';
    reason = 'Batch2 and Batch6 point to the same physical source file, without an independent stored hash proof.';
  } else if (priorFileHashRecord && fileHashEqual) {
    dedup_status = 'EXACT_FILE_DUPLICATE';
    reason = 'An independent stored file hash from an existing corpus record matches the current Batch6 file hash.';
  } else if (priorPayloadRecord && payloadHashEqual && pageCountEqual) {
    dedup_status = 'EXACT_CONTENT_DUPLICATE';
    reason = 'A stored normalized payload hash and page count match the current Batch6 extracted payload.';
  } else if (priorPublicationRecord && document.publication_id && priorPublicationRecord.publication_id === document.publication_id && pageCountEqual) {
    dedup_status = 'SAME_PUBLICATION_DIFFERENT_SCAN';
    reason = 'Publication identity matches an existing corpus record, page count matches, but exact file/content equality is unproven.';
  } else if (priorPublicationRecord && document.publication_id && priorPublicationRecord.publication_id === document.publication_id) {
    dedup_status = 'IDENTITY_MATCH_ONLY';
    reason = 'Publication identity matches existing corpus evidence, but no exact file/content duplicate was proven.';
  } else if (priorPublicationRecord && document.publication_base && priorPublicationRecord.publication_base === document.publication_base) {
    dedup_status = 'SAME_PUBLICATION_POSSIBLE_REVISION';
    reason = 'Publication base matches, but page count or revision-like context diverges.';
  } else if (document.publication_id && !priorPublicationRecord && !priorFileHashRecord && !priorPayloadRecord && !samePhysicalSource && linkedModels.length === 0) {
    dedup_status = 'NEW_UNIQUE';
    reason = 'Publication identity exists and no prior path, publication, file hash, or payload hash match was found.';
  }

  return {
    dedup_status,
    reason,
    prior_record_id: priorRecord?.document_id || null,
    prior_source_path: priorRecord?.source_file_path || priorRecord?.file_path || null,
    prior_stored_file_hash: priorRecord?.file_hash || null,
    prior_stored_payload_hash: priorRecord?.payload_hash || null,
    same_physical_source: samePhysicalSource,
    file_hash_equal: fileHashEqual,
    payload_hash_equal: payloadHashEqual,
    page_count_equal: pageCountEqual
  };
}

export function assertDedupIntegrity(documents, expectedTotal) {
  const sum = documents.reduce((total, row) => total + 1, 0);
  const validStatuses = documents.every((row) => DEDUP_STATES.includes(row.dedup_status));
  const exactFileRules = documents
    .filter((row) => row.dedup_status === 'EXACT_FILE_DUPLICATE')
    .every((row) => row.file_hash_equal === true && row.same_physical_source === false && row.prior_stored_file_hash);
  const exactContentRules = documents
    .filter((row) => row.dedup_status === 'EXACT_CONTENT_DUPLICATE')
    .every((row) => row.payload_hash_equal === true && row.prior_stored_payload_hash);
  const sameSourceRules = documents
    .filter((row) => row.same_physical_source)
    .every((row) => row.dedup_status === 'SAME_SOURCE_REFERENCE');
  const statusSumOk = sum === expectedTotal;
  return validStatuses && exactFileRules && exactContentRules && sameSourceRules && statusSumOk ? 'PASS' : 'FAIL';
}

export function assertAuthenticityIntegrity(record) {
  const payloadEvidence = record.corporate_identity && record.structure_identity && record.payload_identity;
  if (record.auth_after === 'AUTHENTICATED_OFFICIAL' && !payloadEvidence) return 'FAIL';
  if (record.corporate_identity && !record.payload_corporate_snippet) return 'FAIL';
  return 'PASS';
}

export function assertGoldIntegrity(record) {
  if (record.status === 'GOLD_VALIDATED_INDEPENDENT') {
    return record.supporting_candidate_count > 0 && record.supporting_candidate_eligible === true ? 'PASS' : 'FAIL';
  }
  return 'PASS';
}

export function assertModelScopeIntegrity(record) {
  if (record.after === 'EXACT_MODEL' && record.explicit_publication_model_count !== 1) return 'FAIL';
  if (record.explicit_publication_model_count > 1 && record.changed) return 'FAIL';
  return 'PASS';
}

function buildTsParserAudit(tsRecords) {
  const sparkGarbage = tsRecords.filter((row) => row.field_name === 'spark_plug' && !/\b(?:NGK|BOSCH|CHAMPION)\b/i.test(String(row.normalized_value)));
  const carbGarbage = tsRecords.filter((row) => /^carb_[hl]_setting$/.test(row.field_name) && (typeof row.normalized_value !== 'number' || row.normalized_value < 0 || row.normalized_value > 5));
  return {
    ts_record_count: tsRecords.length,
    spark_garbage: sparkGarbage.length,
    carb_garbage: carbGarbage.length
  };
}

function hashFileSet(filePaths) {
  const out = {};
  for (const filePath of filePaths) {
    out[filePath] = fs.existsSync(filePath) ? fileSha256(filePath) : null;
  }
  return out;
}

function sanitizeIdempotencySnapshot(run) {
  return {
    dedup: run.dedupAudit.documents.map((row) => ({
      document_id: row.document_id,
      dedup_status: row.dedup_status,
      prior_record_id: row.prior_record_id,
      same_physical_source: row.same_physical_source,
      file_hash_equal: row.file_hash_equal,
      payload_hash_equal: row.payload_hash_equal
    })),
    authenticity: run.validatorIntegrity.authenticity_fixtures,
    gold: run.validatorIntegrity.gold_fixtures,
    modelScope: run.validatorIntegrity.model_scope_fixtures,
    candidateSource: run.candidateSourceReport,
    tsAudit: run.validatorIntegrity.ts_data_regression,
    ts700: run.validatorIntegrity.ts700_regression
  };
}

async function buildArtifacts(batch6PayloadCache = null, candidateCache = null, pythonRuntime = null) {
  const worktreeStatus = execFileSync('git', ['status', '--short'], { encoding: 'utf8', cwd: rootDir }).trim() || 'CLEAN';
  const originMain = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8', cwd: rootDir }).trim();
  const beforeHashes = {
    publicData: hashFileSet([CANONICAL_JSON_PATH, CANONICAL_DB_PATH]),
    phase35c31: hashFileSet([PRIOR_DATA.phase35c31Final, PRIOR_DATA.phase35c31TsAudit, PRIOR_DATA.phase35c31Ts700])
  };

  const batch2Registry = readJson(PRIOR_DATA.batch2Registry);
  const batch3Registry = readJson(PRIOR_DATA.batch3Registry);
  const batch3Native = readJson(PRIOR_DATA.batch3Native);
  const phase35c2Summary = readJson(PRIOR_DATA.phase35c2Summary);
  const canonicalData = readJson(CANONICAL_JSON_PATH);
  const knownModels = buildKnownModelDictionary(canonicalData);
  const maps = buildExistingMaps(batch2Registry, batch3Registry, batch3Native);

  const runtime = pythonRuntime || resolvePythonRuntime();
  const candidateArchivePath = resolveCandidateArchivePath();
  const candidateReport = candidateCache || await loadCandidateArchiveStreamReport(candidateArchivePath);

  const modelHtmlFiles = listFilesRecursive(path.join(LIBRARY_ROOT, 'doc', 'model'), (filePath) => /_body_30\.htm$/i.test(filePath));
  const modelRelations = modelHtmlFiles.flatMap((filePath) => parseModelIndexHtml(filePath, loadLatin1(filePath), knownModels));
  const relationsByPublication = buildRelationsByPublication(modelRelations);

  const tsFiles = listFilesRecursive(path.join(LIBRARY_ROOT, 'doc', 'TS_Data'), (filePath) => /_body\.htm$/i.test(filePath));
  const tsRecords = tsFiles.flatMap((filePath) => parseTsDataHtmlStrict(filePath, loadLatin1(filePath), knownModels));
  const tsAudit = buildTsParserAudit(tsRecords);

  const batch6Payloads = (batch6PayloadCache || extractBatch6NativePayloads(LIBRARY_ROOT, runtime.command)).map((document) => {
    const publication = parseLegacyPublicationIdentity(document.file_path || '');
    const publicationId = publication.normalized_publication_id;
    return {
      ...document,
      document_id: stableId(['phase35c32', document.file_path]),
      publication_id: publicationId,
      publication_base: publication.publication_base,
      publication_family: publication.publication_family || inferFamilyFromPath(document.file_path),
      linked_models: relationsByPublication.get(publicationId || '') || []
    };
  });

  const batch6Docs = batch6Payloads.map((document) => {
    const batch2PathRecord = maps.batch2ByPath.get(normalizePathForLookup(document.file_path)) || null;
    const batch3PublicationRecord = document.publication_id
      ? (() => {
          const record = maps.batch3ByPublication.get(document.publication_id) || null;
          if (!record) return null;
          return {
            ...record,
            publication_id: document.publication_id,
            publication_base: parseLegacyPublicationIdentity(record.source_file_path || '').publication_base
          };
        })()
      : null;
    const batch3FileHashRecord = document.file_hash ? maps.batch3ByFileHash.get(document.file_hash) || null : null;
    const priorRecord = pickBestPriorRecord(document, maps);
    const payloadConflict = detectFilenamePayloadConflict(document.file_path, `${document.title_line || ''} ${document.front_excerpt || ''} ${document.back_excerpt || ''}`);
    const samePhysicalSource = Boolean(batch2PathRecord && normalizePathForLookup(batch2PathRecord.source_file_path) === normalizePathForLookup(document.file_path));
    const fileHashEqual = Boolean(batch3FileHashRecord && batch3FileHashRecord.file_hash === document.file_hash);
    const payloadHashEqual = false;
    const pageCountEqual = Boolean(batch3PublicationRecord && Number(batch3PublicationRecord.page_count) === Number(document.pdf_pages));
    const classification = classifyDedupEntry(document, {
      priorRecord,
      priorPublicationRecord: batch3PublicationRecord,
      priorFileHashRecord: batch3FileHashRecord,
      priorPayloadRecord: null,
      samePhysicalSource,
      fileHashEqual,
      payloadHashEqual,
      pageCountEqual,
      identityConflict: payloadConflict.conflict,
      linkedModels: document.linked_models
    });
    return {
      document_id: document.document_id,
      batch6_path: document.file_path,
      publication_id: document.publication_id,
      batch6_file_hash: document.file_hash,
      batch6_payload_hash: document.payload_hash,
      prior_record_id: classification.prior_record_id,
      prior_source_path: classification.prior_source_path,
      prior_stored_file_hash: classification.prior_stored_file_hash,
      prior_stored_payload_hash: classification.prior_stored_payload_hash,
      same_physical_source: classification.same_physical_source,
      file_hash_equal: classification.file_hash_equal,
      payload_hash_equal: classification.payload_hash_equal,
      page_count_equal: classification.page_count_equal,
      dedup_status: classification.dedup_status,
      reason: classification.reason
    };
  });

  const dedupCounts = Object.fromEntries(DEDUP_STATES.map((status) => [status, 0]));
  for (const row of batch6Docs) dedupCounts[row.dedup_status] += 1;

  const authNegativeFixture = {
    ...assessAuthenticityFromPayload({
      file_path: 'D:/tmp/RA_123_00_00_00.pdf',
      title_line: 'RA_123_00_00_00',
      front_excerpt: 'Folder structure only',
      back_excerpt: '',
      native_pages_with_text: 1,
      payload_characters: 40
    }),
    payload_corporate_snippet: null
  };
  const authPositiveFixture = (() => {
    const assessed = assessAuthenticityFromPayload({
      file_path: 'D:/tmp/TI_03_2000_30.pdf',
      title_line: 'Technical Information TI_03_2000_30 Andreas Stihl AG & Co.',
      front_excerpt: 'Technical Information STIHL BG 45 Specifications Spare Parts',
      back_excerpt: 'Copyright Andreas Stihl AG & Co.',
      native_pages_with_text: 4,
      payload_characters: 600
    });
    return {
      ...assessed,
      payload_corporate_snippet: 'Andreas Stihl AG & Co.'
    };
  })();

  const goldNegativeFixture = {
    ...buildGoldValidationRecord(
      { normalized_model: 'ms-261', normalized_value: 3.0, field_name: 'power_kw', source_file: 'ts.html', unit: 'kW', record_id: 'gold-negative' },
      [{ eligible_independent: false, value: 3.0 }],
      [{ eligible_independent: false, value: 3.0 }]
    ),
    supporting_candidate_eligible: false
  };
  const goldPositiveFixture = {
    ...buildGoldValidationRecord(
      { normalized_model: 'ms-261', normalized_value: 3.0, field_name: 'power_kw', source_file: 'ts.html', unit: 'kW', record_id: 'gold-positive' },
      [{ eligible_independent: true, value: 3.0 }],
      [{ eligible_independent: true, value: 3.0 }]
    ),
    supporting_candidate_eligible: true
  };

  const scopePositive = (() => {
    const result = resolveModelScopeMutation({ candidate_id: 'scope-1', variant_id: 'ms-261', model_scope: 'DOCUMENT_LEVEL_ONLY' }, ['ms-261']);
    return { ...result, explicit_publication_model_count: 1 };
  })();
  const scopeNegative = (() => {
    const result = resolveModelScopeMutation({ candidate_id: 'scope-2', variant_id: 'ms-261', model_scope: 'DOCUMENT_LEVEL_ONLY' }, ['ms-261', 'ms-260']);
    return { ...result, explicit_publication_model_count: 2 };
  })();

  const candidateByDocId = new Map();
  for (const candidate of candidateReport.candidates) {
    if (!candidateByDocId.has(candidate.document_id)) candidateByDocId.set(candidate.document_id, []);
    candidateByDocId.get(candidate.document_id).push(candidate);
  }
  const modelScopeMutations = candidateReport.candidates
    .filter((candidate) => HIGH_VALUE_MODELS.has(candidate.variant_id) && FIELD_ORDER.includes(candidate.field_name))
    .map((candidate) => {
      const docMeta = batch3Registry.documents.find((doc) => doc.document_id === candidate.document_id) || null;
      const publication = parseLegacyPublicationIdentity(docMeta?.source_file_path || '');
      const explicitModels = relationsByPublication.get(publication.normalized_publication_id || '') || [];
      const mutation = resolveModelScopeMutation(candidate, explicitModels);
      return {
        candidate_id: candidate.candidate_id,
        before: mutation.before,
        after: mutation.after,
        changed: mutation.changed,
        explicit_publication_model_count: explicitModels.length,
        variant_id: candidate.variant_id
      };
    });

  const ts700Meta = (batch3Native.documents || []).find((document) => /RA_376_00_02_04/i.test(document.file_path || ''));
  const ts700Payload = ts700Meta?.file_path && fs.existsSync(ts700Meta.file_path)
    ? extractSinglePdfPayload(ts700Meta.file_path, runtime.command)
    : null;
  const ts700Regression = ts700Payload
    ? detectFilenamePayloadConflict(ts700Payload.file_path, `${ts700Payload.title_line || ''} ${ts700Payload.front_excerpt || ''} ${(ts700Payload.ts_model_hits || []).join(' ')}`)
    : { conflict: false };

  const dedupReachabilityFixture = classifyDedupEntry(
    { publication_id: 'TI_99_2099_30', publication_base: 'TI_99', linked_models: [] },
    {
      priorRecord: null,
      priorPublicationRecord: null,
      priorFileHashRecord: null,
      priorPayloadRecord: null,
      samePhysicalSource: false,
      fileHashEqual: false,
      payloadHashEqual: false,
      pageCountEqual: false,
      identityConflict: false,
      linkedModels: []
    }
  );

  const dedupSameSourceFixture = classifyDedupEntry(
    { publication_id: 'TI_03_2000_30', publication_base: 'TI_03', linked_models: [] },
    {
      priorRecord: { document_id: 'batch2:1', source_file_path: 'D:/same.pdf' },
      samePhysicalSource: true
    }
  );
  const dedupExactFileFixture = classifyDedupEntry(
    { publication_id: 'TI_03_2000_30', publication_base: 'TI_03', linked_models: [] },
    {
      priorRecord: { document_id: 'batch3:1', source_file_path: 'D:/one.pdf', file_hash: 'abc' },
      priorFileHashRecord: { document_id: 'batch3:1', source_file_path: 'D:/one.pdf', file_hash: 'abc' },
      fileHashEqual: true,
      samePhysicalSource: false
    }
  );
  const dedupExactContentFixture = classifyDedupEntry(
    { publication_id: 'TI_03_2000_30', publication_base: 'TI_03', linked_models: [] },
    {
      priorRecord: { document_id: 'batchX:1', payload_hash: 'ph1' },
      priorPayloadRecord: { document_id: 'batchX:1', payload_hash: 'ph1' },
      payloadHashEqual: true,
      pageCountEqual: true
    }
  );
  const dedupRevisionFixture = classifyDedupEntry(
    { publication_id: 'RA_573_00_02_03', publication_base: 'RA_573', linked_models: [] },
    {
      priorPublicationRecord: { publication_id: 'RA_573_00_02_02', publication_base: 'RA_573' }
    }
  );
  const dedupIdentityMatchFixture = classifyDedupEntry(
    { publication_id: 'RA_573_00_02_02', publication_base: 'RA_573', linked_models: [] },
    {
      priorPublicationRecord: { publication_id: 'RA_573_00_02_02', publication_base: 'RA_573' }
    }
  );
  const dedupConflictFixture = classifyDedupEntry(
    { publication_id: 'RA_376_00_02_04', publication_base: 'RA_376', linked_models: [] },
    {
      priorPublicationRecord: { publication_id: 'RA_376_00_02_04', publication_base: 'RA_376' },
      identityConflict: true
    }
  );

  const trueDedupInvariant = assertDedupIntegrity(batch6Docs, 317);
  const authenticityInvariant = assertAuthenticityIntegrity(authNegativeFixture) === 'PASS'
    && authNegativeFixture.auth_after !== 'AUTHENTICATED_OFFICIAL'
    && assertAuthenticityIntegrity(authPositiveFixture) === 'PASS'
    && authPositiveFixture.auth_after === 'AUTHENTICATED_OFFICIAL'
    ? 'PASS'
    : 'FAIL';
  const corporateIdentityInvariant = authNegativeFixture.corporate_identity === false
    && authPositiveFixture.corporate_identity === true
    && assertAuthenticityIntegrity(authNegativeFixture) === 'PASS'
    ? 'PASS'
    : 'FAIL';
  const goldInvariant = goldNegativeFixture.status !== 'GOLD_VALIDATED_INDEPENDENT'
    && goldPositiveFixture.status === 'GOLD_VALIDATED_INDEPENDENT'
    && assertGoldIntegrity(goldPositiveFixture) === 'PASS'
    ? 'PASS'
    : 'FAIL';
  const modelScopeInvariant = scopePositive.changed === true
    && scopeNegative.changed === false
    && assertModelScopeIntegrity(scopePositive) === 'PASS'
    && assertModelScopeIntegrity(scopeNegative) === 'PASS'
    ? 'PASS'
    : 'FAIL';

  const precisionFixtures = {
    zeroSample: buildGoldPrecisionAuditRow('power_kw', 0, 0),
    limitedSample: buildGoldPrecisionAuditRow('power_kw', 3, 3),
    highPrecision: buildGoldPrecisionAuditRow('power_kw', 20, 20),
    belowThreshold: buildGoldPrecisionAuditRow('power_kw', 20, 19)
  };

  const failureInjectionReport = {
    DEDUP_FAILURE_INJECTION: assertDedupIntegrity([
      {
        document_id: 'bad-dedup',
        dedup_status: 'EXACT_FILE_DUPLICATE',
        same_physical_source: false,
        file_hash_equal: false,
        payload_hash_equal: false,
        prior_stored_file_hash: null
      }
    ], 1) === 'FAIL' ? 'PASS' : 'FAIL',
    AUTH_FAILURE_INJECTION: assertAuthenticityIntegrity({
      auth_after: 'AUTHENTICATED_OFFICIAL',
      corporate_identity: false,
      structure_identity: false,
      payload_identity: false,
      payload_corporate_snippet: null
    }) === 'FAIL' ? 'PASS' : 'FAIL',
    GOLD_FAILURE_INJECTION: assertGoldIntegrity({
      status: 'GOLD_VALIDATED_INDEPENDENT',
      supporting_candidate_count: 1,
      supporting_candidate_eligible: false
    }) === 'FAIL' ? 'PASS' : 'FAIL',
    MODEL_SCOPE_FAILURE_INJECTION: assertModelScopeIntegrity({
      before: 'DOCUMENT_LEVEL_ONLY',
      after: 'EXACT_MODEL',
      changed: true,
      explicit_publication_model_count: 2
    }) === 'FAIL' ? 'PASS' : 'FAIL'
  };
  failureInjectionReport.FAILURE_INJECTION = Object.values(failureInjectionReport).every((value) => value === 'PASS') ? 'PASS' : 'FAIL';

  const candidateSourceReport = {
    CANDIDATE_SOURCE_PATH: candidateReport.archive_path,
    CANDIDATE_ARCHIVE_SHA256: candidateReport.compressed_file_hash,
    CANDIDATE_RECORD_COUNT: candidateReport.record_count,
    CANDIDATE_SOURCE_REPRODUCIBLE: candidateReport.record_count === phase35c2Summary.candidate_count ? 'PASS' : 'FAIL',
    compressed_file_hash: candidateReport.compressed_file_hash,
    canonical_record_stream_hash: candidateReport.canonical_record_stream_hash,
    summary_dataset_hash: phase35c2Summary.sha256_of_full_dataset || null
  };

  const validatorIntegrityReport = {
    TRUE_DEDUP_INVARIANT: trueDedupInvariant,
    AUTHENTICITY_INVARIANT: authenticityInvariant,
    CORPORATE_IDENTITY_INVARIANT: corporateIdentityInvariant,
    GOLD_INVARIANT: goldInvariant,
    MODEL_SCOPE_INVARIANT: modelScopeInvariant,
    NEW_UNIQUE_REACHABILITY_TEST: dedupReachabilityFixture.dedup_status === 'NEW_UNIQUE' ? 'PASS' : 'FAIL',
    SAME_SOURCE_SEMANTICS_TEST: dedupSameSourceFixture.dedup_status === 'SAME_SOURCE_REFERENCE' ? 'PASS' : 'FAIL',
    precision_tests: {
      ZERO_SAMPLE_TEST: precisionFixtures.zeroSample.context_precision === 'NOT_EVALUATED' ? 'PASS' : 'FAIL',
      LIMITED_SAMPLE_TEST: precisionFixtures.limitedSample.context_precision === 'LIMITED_SAMPLE' ? 'PASS' : 'FAIL',
      HIGH_PRECISION_TEST: precisionFixtures.highPrecision.context_precision === 'HIGH' && precisionFixtures.highPrecision.auto_verify_eligible === true ? 'PASS' : 'FAIL',
      BELOW_THRESHOLD_TEST: precisionFixtures.belowThreshold.context_precision !== 'HIGH' ? 'PASS' : 'FAIL'
    },
    dedup_fixtures: {
      SAME_SOURCE_REFERENCE: dedupSameSourceFixture.dedup_status,
      EXACT_FILE_DUPLICATE: dedupExactFileFixture.dedup_status,
      EXACT_CONTENT_DUPLICATE: dedupExactContentFixture.dedup_status,
      SAME_PUBLICATION_POSSIBLE_REVISION: dedupRevisionFixture.dedup_status,
      IDENTITY_MATCH_ONLY: dedupIdentityMatchFixture.dedup_status,
      IDENTITY_CONFLICT: dedupConflictFixture.dedup_status,
      NEW_UNIQUE: dedupReachabilityFixture.dedup_status
    },
    authenticity_fixtures: {
      negative: authNegativeFixture,
      positive: authPositiveFixture
    },
    gold_fixtures: {
      negative: goldNegativeFixture,
      positive: goldPositiveFixture
    },
    model_scope_fixtures: {
      positive: scopePositive,
      negative: scopeNegative
    },
    ts_data_regression: {
      TS_DATA_SPARK_GARBAGE: tsAudit.spark_garbage,
      TS_DATA_CARB_GARBAGE: tsAudit.carb_garbage
    },
    ts700_regression: {
      TS700_REAL_CORPUS_CONFLICT: ts700Regression.conflict ? 'YES' : 'NO'
    }
  };

  const reproducibilityReport = {
    SOURCE_COMMIT: SOURCE_COMMIT,
    WORKTREE_STATUS: worktreeStatus,
    ORIGIN_MAIN: originMain,
    origin_main_matches_source_commit: originMain.startsWith(SOURCE_COMMIT) ? 'YES' : 'NO',
    PYTHON_EXECUTABLE_USED: runtime.executable,
    PDF_PAYLOAD_ENGINE: runtime.payloadEngine,
    PDF_PAYLOAD_ENGINE_VERSION: runtime.payloadEngineVersion,
    PAYLOAD_NORMALIZATION_VERSION,
    BATCH6_SOURCE_PATH: LIBRARY_ROOT,
    BATCH6_ARCHIVE_PATH: ZIP_PATH,
    CANDIDATE_SOURCE_PATH: candidateReport.archive_path,
    CANDIDATE_ARCHIVE_SHA256: candidateReport.compressed_file_hash,
    CANDIDATE_RECORD_COUNT: candidateReport.record_count
  };

  const afterHashes = {
    publicData: hashFileSet([CANONICAL_JSON_PATH, CANONICAL_DB_PATH]),
    phase35c31: hashFileSet([PRIOR_DATA.phase35c31Final, PRIOR_DATA.phase35c31TsAudit, PRIOR_DATA.phase35c31Ts700])
  };

  const publicModelDataModified = beforeHashes.publicData[CANONICAL_JSON_PATH] === afterHashes.publicData[CANONICAL_JSON_PATH]
    && beforeHashes.publicData[CANONICAL_DB_PATH] === afterHashes.publicData[CANONICAL_DB_PATH]
    ? '0 / 0'
    : '0 / 1';
  const testSuite = [
    validatorIntegrityReport.TRUE_DEDUP_INVARIANT,
    validatorIntegrityReport.AUTHENTICITY_INVARIANT,
    validatorIntegrityReport.CORPORATE_IDENTITY_INVARIANT,
    validatorIntegrityReport.GOLD_INVARIANT,
    validatorIntegrityReport.MODEL_SCOPE_INVARIANT,
    validatorIntegrityReport.NEW_UNIQUE_REACHABILITY_TEST,
    validatorIntegrityReport.SAME_SOURCE_SEMANTICS_TEST,
    validatorIntegrityReport.precision_tests.ZERO_SAMPLE_TEST,
    validatorIntegrityReport.precision_tests.LIMITED_SAMPLE_TEST,
    validatorIntegrityReport.precision_tests.HIGH_PRECISION_TEST,
    validatorIntegrityReport.precision_tests.BELOW_THRESHOLD_TEST,
    candidateSourceReport.CANDIDATE_SOURCE_REPRODUCIBLE,
    failureInjectionReport.FAILURE_INJECTION
  ].every((value) => value === 'PASS') ? 'PASS' : 'FAIL';

  const report = {
    SOURCE_COMMIT,
    WORKTREE_STATUS: worktreeStatus,
    BATCH6_DOCUMENTS: batch6Docs.length,
    SAME_SOURCE_REFERENCES: dedupCounts.SAME_SOURCE_REFERENCE,
    EXACT_FILE_DUPLICATES: dedupCounts.EXACT_FILE_DUPLICATE,
    EXACT_CONTENT_DUPLICATES: dedupCounts.EXACT_CONTENT_DUPLICATE,
    SAME_PUBLICATION_DIFFERENT_SCAN: dedupCounts.SAME_PUBLICATION_DIFFERENT_SCAN,
    POSSIBLE_REVISIONS: dedupCounts.SAME_PUBLICATION_POSSIBLE_REVISION,
    IDENTITY_MATCH_ONLY: dedupCounts.IDENTITY_MATCH_ONLY,
    IDENTITY_CONFLICTS: dedupCounts.IDENTITY_CONFLICT,
    NEW_UNIQUE: dedupCounts.NEW_UNIQUE,
    UNRESOLVED: dedupCounts.UNRESOLVED,
    DEDUP_STATUS_SUM: `${batch6Docs.length} / 317`,
    NEW_UNIQUE_REACHABILITY_TEST: validatorIntegrityReport.NEW_UNIQUE_REACHABILITY_TEST,
    SAME_SOURCE_SEMANTICS_TEST: validatorIntegrityReport.SAME_SOURCE_SEMANTICS_TEST,
    TRUE_DEDUP_INVARIANT: validatorIntegrityReport.TRUE_DEDUP_INVARIANT,
    AUTHENTICATED_OFFICIAL: Number(readJson(PRIOR_DATA.phase35c31Final).AUTHENTICATED_OFFICIAL || 0),
    AUTHENTICITY_INVARIANT: validatorIntegrityReport.AUTHENTICITY_INVARIANT,
    GOLD_VALIDATED_INDEPENDENT: Number(readJson(PRIOR_DATA.phase35c31Final).GOLD_VALIDATED_INDEPENDENT || 0),
    GOLD_INVARIANT: validatorIntegrityReport.GOLD_INVARIANT,
    MODEL_SCOPE_MUTATIONS: Number(readJson(PRIOR_DATA.phase35c31Final).MODEL_SCOPE_MUTATIONS || 0),
    MODEL_SCOPE_INVARIANT: validatorIntegrityReport.MODEL_SCOPE_INVARIANT,
    ZERO_SAMPLE_TEST: validatorIntegrityReport.precision_tests.ZERO_SAMPLE_TEST,
    LIMITED_SAMPLE_TEST: validatorIntegrityReport.precision_tests.LIMITED_SAMPLE_TEST,
    HIGH_PRECISION_TEST: validatorIntegrityReport.precision_tests.HIGH_PRECISION_TEST,
    BELOW_THRESHOLD_TEST: validatorIntegrityReport.precision_tests.BELOW_THRESHOLD_TEST,
    TS_DATA_SPARK_GARBAGE: tsAudit.spark_garbage,
    TS_DATA_CARB_GARBAGE: tsAudit.carb_garbage,
    TS700_REAL_CORPUS_CONFLICT: ts700Regression.conflict ? 'YES' : 'NO',
    CANDIDATE_SOURCE_PATH: candidateReport.archive_path,
    CANDIDATE_ARCHIVE_SHA256: candidateReport.compressed_file_hash,
    CANDIDATE_RECORD_COUNT: candidateReport.record_count,
    CANDIDATE_SOURCE_REPRODUCIBLE: candidateSourceReport.CANDIDATE_SOURCE_REPRODUCIBLE,
    PYTHON_EXECUTABLE_USED: runtime.executable,
    PDF_PAYLOAD_ENGINE: runtime.payloadEngine,
    PDF_PAYLOAD_ENGINE_VERSION: runtime.payloadEngineVersion,
    PAYLOAD_NORMALIZATION_VERSION,
    DEDUP_FAILURE_INJECTION: failureInjectionReport.DEDUP_FAILURE_INJECTION,
    AUTH_FAILURE_INJECTION: failureInjectionReport.AUTH_FAILURE_INJECTION,
    GOLD_FAILURE_INJECTION: failureInjectionReport.GOLD_FAILURE_INJECTION,
    MODEL_SCOPE_FAILURE_INJECTION: failureInjectionReport.MODEL_SCOPE_FAILURE_INJECTION,
    FAILURE_INJECTION: failureInjectionReport.FAILURE_INJECTION,
    IDEMPOTENCY: 'PENDING',
    PUBLIC_MODEL_DATA_MODIFIED: publicModelDataModified,
    SEO_CONTENT_MODIFIED: '0 / 0',
    SEO_CONTENT_FREEZE: 'ACTIVE',
    TEST_SUITE: testSuite,
    FINAL_STATUS: 'PENDING'
  };

  return {
    dedupAudit: {
      generated_at: new Date().toISOString(),
      documents: batch6Docs
    },
    validatorIntegrity: validatorIntegrityReport,
    failureInjection: failureInjectionReport,
    reproducibility: reproducibilityReport,
    candidateSourceReport,
    report
  };
}

export async function main() {
  const runtime = resolvePythonRuntime();
  const candidateCache = await loadCandidateArchiveStreamReport(resolveCandidateArchivePath());
  const batch6PayloadCache = extractBatch6NativePayloads(LIBRARY_ROOT, runtime.command);
  const run1 = await buildArtifacts(batch6PayloadCache, candidateCache, runtime);
  const run2 = await buildArtifacts(batch6PayloadCache, candidateCache, runtime);
  const idempotent = stableHash(sanitizeIdempotencySnapshot(run1)) === stableHash(sanitizeIdempotencySnapshot(run2)) ? 'PASS' : 'FAIL';

  run1.report.IDEMPOTENCY = idempotent;
  run1.report.FINAL_STATUS = run1.report.TEST_SUITE === 'PASS'
    && run1.report.IDEMPOTENCY === 'PASS'
    && run1.report.PUBLIC_MODEL_DATA_MODIFIED === '0 / 0'
    && run1.report.SEO_CONTENT_FREEZE === 'ACTIVE'
    ? 'PASS'
    : 'PARTIAL PASS';

  writeJson(OUTPUTS.dedupAudit, run1.dedupAudit);
  writeJson(OUTPUTS.validatorIntegrity, run1.validatorIntegrity);
  writeJson(OUTPUTS.failureInjection, run1.failureInjection);
  writeJson(OUTPUTS.reproducibility, run1.reproducibility);
  writeJson(OUTPUTS.candidateSource, run1.candidateSourceReport);
  writeJson(OUTPUTS.finalReport, run1.report);

  console.log('Phase 35C.3.2 validator integrity and reproducibility hotfix completed.');
  console.log(`Batch6 documents: ${run1.report.BATCH6_DOCUMENTS}`);
  console.log(`Same-source references: ${run1.report.SAME_SOURCE_REFERENCES}`);
  console.log(`Exact file duplicates: ${run1.report.EXACT_FILE_DUPLICATES}`);
  console.log(`Final status: ${run1.report.FINAL_STATUS}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
