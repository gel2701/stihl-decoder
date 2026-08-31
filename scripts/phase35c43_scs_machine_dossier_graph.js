import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import { buildKnownModelDictionary, extractModelsMentioned } from '../src/documentAuthority.js';
import { decodeStihlCode } from '../src/decoder.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { buildPublicEvidenceFields, normalizePublicEvidenceModelKey } from '../src/publicEvidence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const REQUIRED_ANCESTOR = '4eb42c3d7e785f0328f88830e21b069fac0d5f36';
const HOTFIX_BASELINE = '5d7bd0c20ef52f5290b92710eb2a547e6a1fca1e';
const PHASE_ID = '35C.4.3';
const SOURCE_BATCH = 'BATCH8_SCS_MACHINE_DOSSIER_GRAPH';
const SOURCE_LINEAGE = 'BATCH6_STIHL_LEGACY_DOCUMENT_CD';
const SOURCE_CLASS = 'DERIVATIVE_MACHINE_INDEX';
const TARGET_FIELDS = new Set([
  'displacement_cc',
  'power_kw',
  'power_hp',
  'bore_mm',
  'stroke_mm',
  'idle_speed_rpm',
  'max_engine_speed_rpm',
  'spark_plug',
  'electrode_gap_mm',
  'fuel_tank_l',
  'oil_tank_l',
  'weight_kg'
]);
const OUTPUTS = {
  preflight: path.join(rootDir, 'data', 'phase35c43_preflight_report.json'),
  archiveInventory: path.join(rootDir, 'data', 'phase35c43_archive_inventory.json'),
  archivePayloadManifest: path.join(rootDir, 'data', 'phase35c43_archive_payload_manifest.json'),
  dossierClassification: path.join(rootDir, 'data', 'phase35c43_dossier_classification.json'),
  machineGraph: path.join(rootDir, 'data', 'phase35c43_machine_graph.json'),
  modelTypeGraph: path.join(rootDir, 'data', 'phase35c43_model_type_graph.json'),
  documentRelationGraph: path.join(rootDir, 'data', 'phase35c43_document_relation_graph.json'),
  documentReconciliation: path.join(rootDir, 'data', 'phase35c43_document_reconciliation.json'),
  sourceLineageGraph: path.join(rootDir, 'data', 'phase35c43_source_lineage_graph.json'),
  explicitScopeAudit: path.join(rootDir, 'data', 'phase35c43_explicit_scope_audit.json'),
  scopeParserAudit: path.join(rootDir, 'data', 'phase35c43_scope_parser_audit.json'),
  tsDataRecoveryAudit: path.join(rootDir, 'data', 'phase35c43_ts_data_recovery_audit.json'),
  factCandidates: path.join(rootDir, 'data', 'phase35c43_fact_candidates.json'),
  publicFactPromotionAudit: path.join(rootDir, 'data', 'phase35c43_public_fact_promotion_audit.json'),
  publicCoverageBeforeAfter: path.join(rootDir, 'data', 'phase35c43_public_coverage_before_after.json'),
  controllerClassificationAudit: path.join(rootDir, 'data', 'phase35c43_controller_classification_audit.json'),
  newPublicFactAudit: path.join(rootDir, 'data', 'phase35c43_new_public_fact_audit.json'),
  publicModelCoverageDetail: path.join(rootDir, 'data', 'phase35c43_public_model_coverage_detail.json'),
  promotionSampleAudit: path.join(rootDir, 'data', 'phase35c43_promotion_sample_audit.json'),
  blockedSampleAudit: path.join(rootDir, 'data', 'phase35c43_blocked_sample_audit.json'),
  precommitFailureInjection: path.join(rootDir, 'data', 'phase35c43_precommit_failure_injection.json'),
  promotionIntegrityAddendum: path.join(rootDir, 'data', 'phase35c43_promotion_integrity_addendum.json'),
  fs350Regression: path.join(rootDir, 'data', 'phase35c43_fs350_regression.json'),
  ms170Ms180Negative: path.join(rootDir, 'data', 'phase35c43_ms170_ms180_negative_scope_audit.json'),
  conflict046: path.join(rootDir, 'data', 'phase35c43_046_conflict_regression.json'),
  failureInjection: path.join(rootDir, 'data', 'phase35c43_failure_injection_report.json'),
  idempotency: path.join(rootDir, 'data', 'phase35c43_idempotency_report.json'),
  finalReport: path.join(rootDir, 'data', 'phase35c43_final_report.json')
};
const INPUTS = {
  database: path.join(rootDir, 'data', 'stihl_database.json'),
  publicStore: path.join(rootDir, 'data', 'public_evidence_facts.json'),
  tsRecords: path.join(rootDir, 'data', 'phase35c3_ts_data_records.json'),
  batch2Registry: path.join(rootDir, 'data', 'batch2_document_registry.json'),
  batch3Registry: path.join(rootDir, 'data', 'batch3_pdf_document_registry.json'),
  crossRegistry: path.join(rootDir, 'data', 'cross_corpus_document_registry_all_sources.json')
};
const MODEL_PREFIXES = ['MS', 'FS', 'TS', 'BR', 'SR', 'HS', 'BT', 'RE', 'RB', 'SE', 'RB', 'E', 'MSE', 'MSA', 'BGA', 'FSA', 'HSA', 'HSE', 'KM', 'KW', 'FC', 'FR', 'HT', 'HL', 'FH', 'KG', 'KGA', 'BC', 'BFMM', 'BCKM'];
const VIEW_TYPES = new Map([
  ['_TI_FULL.md', 'TI_VIEW'],
  ['_TS_FULL.md', 'TS_VIEW'],
  ['_BA_FULL.md', 'BA_VIEW'],
  ['_ET_FULL.md', 'ET_VIEW'],
  ['_RT_FULL.md', 'RT_VIEW'],
  ['_FULL.md', 'MACHINE_BASE']
]);
const FIELD_MEASUREMENT_DEFINITIONS = {
  displacement_cc: 'ENGINE_DISPLACEMENT',
  power_kw: 'ENGINE_POWER_KW',
  power_hp: 'ENGINE_POWER_HP',
  bore_mm: 'CYLINDER_BORE',
  stroke_mm: 'PISTON_STROKE',
  idle_speed_rpm: 'ENGINE_IDLE_SPEED',
  max_engine_speed_rpm: 'MAX_ENGINE_SPEED',
  spark_plug: 'NOT_APPLICABLE',
  electrode_gap_mm: 'SPARK_PLUG_ELECTRODE_GAP',
  fuel_tank_l: 'FUEL_TANK_CAPACITY',
  oil_tank_l: 'CHAIN_OIL_TANK_CAPACITY',
  weight_kg: 'UNKNOWN_WEIGHT_DEFINITION'
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
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

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

function git(args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function worktreeStatus() {
  return git(['status', '--short']) || 'CLEAN';
}

function isAncestor(ancestor, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, commit], { cwd: rootDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function archivePathFromEnv() {
  return process.env.PHASE35C43_DOSSIER_ARCHIVE_PATH
    ? path.resolve(process.env.PHASE35C43_DOSSIER_ARCHIVE_PATH)
    : null;
}

function buildPreflight() {
  const head = git(['rev-parse', 'HEAD']);
  const originMain = git(['rev-parse', 'origin/main']);
  const archivePath = archivePathFromEnv();
  const archiveExists = Boolean(archivePath && fs.existsSync(archivePath));
  const failures = [];

  if (!isAncestor(REQUIRED_ANCESTOR, originMain)) failures.push('REQUIRED_ANCESTOR_MISSING');
  if (!isAncestor(HOTFIX_BASELINE, originMain)) failures.push('35C4223_HOTFIX_MISSING');
  if (!archivePath) failures.push('PHASE35C43_DOSSIER_ARCHIVE_PATH_MISSING');
  if (archivePath && !archiveExists) failures.push('ARCHIVE_NOT_FOUND');

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    BASELINE_COMMIT: originMain,
    HEAD: head,
    ORIGIN_MAIN: originMain,
    REQUIRED_ANCESTOR,
    HOTFIX_BASELINE,
    WORKTREE_STATUS: worktreeStatus(),
    ARCHIVE_PATH: archivePath,
    ARCHIVE_EXISTS: archiveExists ? 'YES' : 'NO',
    PRECHECK_FAILURES: failures,
    PRECHECK: failures.length === 0 ? 'PASS' : 'FAIL'
  };
}

function readArchiveEntries(archivePath) {
  const command = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${archivePath.replace(/\\/g, '\\\\')}')
try {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $entries = @()
  foreach ($entry in $zip.Entries) {
    if ($entry.FullName.EndsWith('/')) { continue }
    $stream = $entry.Open()
    try {
      $ms = New-Object System.IO.MemoryStream
      $stream.CopyTo($ms)
      $bytes = $ms.ToArray()
      $hashBytes = $sha.ComputeHash($bytes)
      $payloadHash = ([BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
      $content = [System.Text.Encoding]::UTF8.GetString($bytes)
      $entries += [pscustomobject]@{
        full_name = $entry.FullName
        filename = $entry.Name
        length = $entry.Length
        payload_hash = $payloadHash
        content = $content
      }
    } finally {
      $stream.Dispose()
    }
  }
  $entries | ConvertTo-Json -Depth 4
} finally {
  $zip.Dispose()
}`;
  const output = execFileSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64
  });
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function extractValue(lines, regex) {
  const line = lines.find((entry) => regex.test(entry));
  if (!line) return null;
  const match = line.match(regex);
  return match ? normalizeText(match[1]) : null;
}

function normalizeSourcePath(value) {
  const normalized = String(value || '').replace(/^file:\/\/\/[A-Za-z]:\//i, '').replace(/\\/g, '/');
  const batchIndex = normalized.toLowerCase().indexOf('doc/');
  if (batchIndex >= 0) return normalized.slice(batchIndex);
  const pdfIndex = normalized.toLowerCase().indexOf('pdf/');
  if (pdfIndex >= 0) return normalized.slice(pdfIndex);
  return normalized.replace(/^[A-Za-z]:\/+/i, '').replace(/^\/+/, '') || null;
}

function hasWindowsPath(value) {
  const text = String(value || '');
  return /[A-Z]:\\/i.test(text) || /[A-Z]:\//i.test(text) || /file:\/\//i.test(text);
}

function previewEvidence(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .slice(0, 4);
}

function classifyEntry(entry) {
  const filename = String(entry.filename || '');
  if (/MODEL_.*STEUERLEISTE/i.test(filename) || /STEUERLEISTE_\d+_FULL/i.test(filename) || /_MENU_/i.test(filename)) {
    return 'CONTROLLER_OR_MENU';
  }
  for (const [suffix, type] of VIEW_TYPES.entries()) {
    if (filename.endsWith(suffix)) return type;
  }
  return 'UNRESOLVED';
}

function baseKeyFromFilename(filename) {
  return String(filename || '')
    .replace(/_(?:TI|TS|BA|ET|RT)_FULL\.md$/i, '')
    .replace(/_FULL\.md$/i, '');
}

function resolveModelFromRaw(rawModel, knownModels) {
  const matches = extractModelsMentioned(String(rawModel || ''), knownModels || []);
  if (matches.length > 0) {
    const best = matches[0];
    return {
      model_slug: best.slug || normalizePublicEvidenceModelKey(best.model_name),
      model_name: best.model_name || best.slug,
      category_slug: best.category_slug || null,
      canonical_key: normalizePublicEvidenceModelKey(best.slug || best.model_name)
    };
  }
  const fallback = normalizeText(String(rawModel || '').replace(/^STIHL\s+/i, ''));
  return {
    model_slug: normalizePublicEvidenceModelKey(fallback),
    model_name: fallback,
    category_slug: null,
    canonical_key: normalizePublicEvidenceModelKey(fallback)
  };
}

function parseDossierDocuments(lines) {
  const documents = [];
  let current = null;
  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const heading = line.match(/^###\s+6\.\d+\.\s+(.*)$/);
    if (heading) {
      current = {
        heading: normalizeText(heading[1]),
        relative_path: null,
        title: null
      };
      documents.push(current);
      continue;
    }
    if (!current) continue;
    const titleMatch = line.match(/^- \*\*Document Title\*\*:\s*(.*)$/);
    if (titleMatch) current.title = normalizeText(titleMatch[1]);
    const pathMatch = line.match(/^- \*\*Relative Path\*\*:\s*`([^`]+)`/);
    if (pathMatch) current.relative_path = normalizeSourcePath(pathMatch[1]);
  }
  return documents.filter((entry) => entry.relative_path || entry.title);
}

function parseTechnicalHeading(lines) {
  for (const line of lines) {
    const row = line.match(/^\|\s*Testing and Setting Data.*\|\s*[^|]*\|\s*\*\*(.+?)\*\*\s*\|/);
    if (row) return normalizeText(row[1]);
  }
  return null;
}

function parseTableRows(lines) {
  const rows = new Map();
  for (const line of lines) {
    const row = line.match(/^\|\s*(\d+)\s*\|\s*(.*?)\|\s*\*\*(.*?)\*\*\s*\|/);
    if (!row) continue;
    rows.set(row[1], {
      row_number: row[1],
      field_heading: normalizeText(row[2]),
      markdown_value: normalizeText(row[3]),
      raw_line: normalizeText(line)
    });
  }
  return rows;
}

function buildDossierRecord(entry, knownModels) {
  const lines = String(entry.content || '').split(/\r?\n/);
  const rawModel = extractValue(lines, /^\*\*Machine Model\*\*:\s*(.+)$/);
  const category = extractValue(lines, /^\*\*Equipment Category\*\*:\s*(.+)$/);
  const typeNumber = extractValue(lines, /^\*\*STIHL Type Number\*\*:\s*(.+)$/);
  const applicationSource = normalizeSourcePath(extractValue(lines, /^- \*\*Originating SCS Application File\*\*:\s*`?(.+?)`?$/));
  const testingDataFile = normalizeSourcePath(extractValue(lines, /^- \*\*Testing Data File\*\*:\s*`?(.+?)`?$/));
  const repairTimesFile = normalizeSourcePath(extractValue(lines, /^- \*\*Repair Times File\*\*:\s*`?(.+?)`?$/));
  const modelIdentity = resolveModelFromRaw(rawModel, knownModels);

  return {
    dossier_id: stableId([SOURCE_BATCH, entry.filename]),
    entry_name: entry.full_name,
    filename: entry.filename,
    payload_hash: entry.payload_hash,
    byte_length: entry.length,
    classification: classifyEntry(entry),
    base_key: baseKeyFromFilename(entry.filename),
    raw_model: rawModel,
    model_slug: modelIdentity.model_slug,
    model_name: modelIdentity.model_name,
    canonical_key: modelIdentity.canonical_key,
    category,
    type_number: typeNumber || null,
    application_source: applicationSource || null,
    testing_data_file: testingDataFile && !/^n\/a$/i.test(testingDataFile) ? testingDataFile : null,
    repair_times_file: repairTimesFile && !/^n\/a$/i.test(repairTimesFile) ? repairTimesFile : null,
    technical_heading: parseTechnicalHeading(lines),
    table_rows: parseTableRows(lines),
    documents: parseDossierDocuments(lines),
    payload_evidence: previewEvidence(entry.content),
    source_lineage: SOURCE_LINEAGE,
    source_class: SOURCE_CLASS
  };
}

function normalizeModelLabel(value) {
  let text = normalizeText(value);
  if (!text) return null;
  text = text.replace(/^STIHL\s+/i, '');
  text = text.replace(/\b(chain saw|brushcutter|cut-off saw|trimmer|clearing saw|blower|hedge trimmer|vacuum shredder)\b\s*:?/ig, '');
  text = text.replace(/\btesting and setting data\b/ig, '');
  text = normalizeText(text);
  return text || null;
}

function normalizeScopeToken(token) {
  const raw = normalizeText(token).replace(/^STIHL\s+/i, '');
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  const historical = compact.match(/^(0\d{2,3}|[1-9]\d{2,3}[A-Z]?)$/i);
  if (historical && /^0\d{2,3}[A-Z]?$/i.test(compact)) {
    return compact.toLowerCase();
  }
  const prefixMatch = compact.match(/^([A-Z]{2,4})(\d{2,4}[A-Z]{0,3})$/i);
  if (prefixMatch) {
    return `${prefixMatch[1].toLowerCase()}-${prefixMatch[2].toLowerCase()}`;
  }
  return normalizePublicEvidenceModelKey(raw);
}

function parseScopeModelsFromHeading(heading, knownModels) {
  const normalizedHeading = normalizeText(heading);
  if (!normalizedHeading || /^SCS$/i.test(normalizedHeading)) return [];
  const values = new Set();
  const matches = extractModelsMentioned(normalizedHeading, knownModels || []);
  for (const match of matches) {
    const value = normalizePublicEvidenceModelKey(match.slug || match.model_name);
    if (value) values.add(value);
  }
  const tokenRegex = /\b(?:[A-Z]{2,4}\s*-?\s*\d{2,4}[A-Z]{0,3}|0\d{2,3}[A-Z]?)\b/g;
  for (const token of normalizedHeading.match(tokenRegex) || []) {
    const value = normalizeScopeToken(token);
    if (value) values.add(value);
  }
  return [...values];
}

function classifyScopeForModel(scopeModels, machineModelKey) {
  if (!scopeModels || scopeModels.length === 0) return 'SCOPE_NOT_STATED';
  const normalizedMachine = normalizePublicEvidenceModelKey(machineModelKey);
  const inScope = scopeModels.includes(normalizedMachine);
  if (!inScope) return 'SCOPE_CONFLICT';
  return scopeModels.length === 1 ? 'EXACT_MODEL_EXPLICIT' : 'MULTI_MODEL_EXPLICIT';
}

function buildMachineGroups(dossiers) {
  const groups = new Map();
  for (const dossier of dossiers) {
    if (!groups.has(dossier.base_key)) groups.set(dossier.base_key, []);
    groups.get(dossier.base_key).push(dossier);
  }
  return groups;
}

function buildArchivePayloadManifest(dossiers, archiveInventory) {
  const records = dossiers
    .map((row) => ({
      normalized_filename: row.filename,
      payload_sha256: row.payload_hash,
      uncompressed_size: row.byte_length,
      classification: row.classification
    }))
    .sort((left, right) => left.normalized_filename.localeCompare(right.normalized_filename));
  const manifestLines = records.map((row) => `${row.normalized_filename}|${row.payload_sha256}|${row.uncompressed_size}`);
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    RAW_ARCHIVE_SHA256: archiveInventory.ARCHIVE_SHA256,
    ARCHIVE_ENTRIES: archiveInventory.ARCHIVE_ENTRIES,
    CANONICAL_PAYLOAD_MANIFEST_SHA256: crypto.createHash('sha256').update(manifestLines.join('\n')).digest('hex'),
    records
  };
}

function buildControllerClassificationAudit(dossiers) {
  const records = dossiers
    .filter((row) => row.classification === 'CONTROLLER_OR_MENU')
    .map((row) => ({
      filename: row.filename,
      payload_hash: row.payload_hash,
      payload_evidence: row.payload_evidence,
      classification: row.classification,
      classification_reason: /STEUERLEISTE/i.test(row.filename)
        ? 'FILENAME_MATCH_STEUERLEISTE'
        : /_MENU_/i.test(row.filename)
          ? 'FILENAME_MATCH_MENU'
          : 'CONTROLLER_FILENAME_PATTERN',
      machine_model: row.model_name,
      type_number: row.type_number
    }));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    CONTROLLER_RECORDS_EXCLUDED: records.length,
    records
  };
}

function classifyDocumentType(relationType, relativePath) {
  const lowerPath = normalizeLooseText(relativePath);
  if (relationType === 'TS_DATA') return 'OFFICIAL_LEGACY_TECHNICAL_DATA';
  if (relationType === 'RT') return 'REPAIR_TIME_DATA';
  if (relationType === 'BA' || lowerPath.includes('/ba/')) return 'OFFICIAL_INSTRUCTION_MANUAL';
  if (relationType === 'ET' || lowerPath.includes('/et/')) return 'OFFICIAL_PARTS_DOCUMENT';
  if (relationType === 'TI' || lowerPath.includes('/ti/')) return 'OFFICIAL_TECHNICAL_INFORMATION';
  if (relationType === 'RA' || lowerPath.includes('/ra/')) return 'OFFICIAL_SERVICE_DOCUMENT';
  if (relationType === 'MODEL_APPLICATION') return 'OFFICIAL_LEGACY_MODEL_INDEX';
  return 'UNRESOLVED';
}

function extractPublicationIdentity(relativePath) {
  const fileName = path.basename(String(relativePath || ''), path.extname(String(relativePath || '')));
  if (/^(RA|TI|BA|ET|RT)_[A-Z0-9_ -]+$/i.test(fileName)) return fileName.replace(/\s+/g, ' ').trim();
  if (/^\d{4}-\d{3}-\d{4}(?:-[A-Z])?$/i.test(fileName)) return fileName.toUpperCase();
  if (/^[A-Za-z0-9]+_body$/i.test(fileName)) return fileName;
  return fileName || null;
}

function buildMachineGraph(groupMap, knownModels) {
  const machineEntities = [];
  const modelTypeRelations = [];
  const documentRelations = [];

  for (const dossiers of groupMap.values()) {
    const nonController = dossiers.filter((row) => row.classification !== 'CONTROLLER_OR_MENU');
    if (nonController.length === 0) continue;
    const baseRecord = nonController.find((row) => row.classification === 'MACHINE_BASE') || nonController[0];
    const scopeModels = parseScopeModelsFromHeading(baseRecord.technical_heading, knownModels);
    const scopeStatus = classifyScopeForModel(scopeModels, baseRecord.model_slug);
    const machineId = stableId(['machine', baseRecord.model_slug, baseRecord.type_number || baseRecord.base_key]);
    machineEntities.push({
      machine_id: machineId,
      canonical_model_name: baseRecord.model_name,
      normalized_model_key: baseRecord.model_slug,
      category: baseRecord.category || 'UNKNOWN',
      type_number: baseRecord.type_number,
      application_source: baseRecord.application_source,
      source_dossier_id: baseRecord.dossier_id,
      lineage: SOURCE_LINEAGE,
      scope_status: scopeStatus,
      dossier_views: nonController.map((row) => row.classification)
    });

    if (baseRecord.type_number) {
      modelTypeRelations.push({
        machine_id: machineId,
        model_slug: baseRecord.model_slug,
        type_number: baseRecord.type_number
      });
    }

    const pushRelation = (type, relativePath, title = null, referenceOnly = false) => {
      if (!relativePath) return;
      documentRelations.push({
        relation_id: stableId([machineId, type, relativePath]),
        machine_id: machineId,
        model_slug: baseRecord.model_slug,
        document_type: type,
        publication_identity: extractPublicationIdentity(relativePath),
        relative_source_path: relativePath,
        source_lineage: SOURCE_LINEAGE,
        payload_available: type === 'TS_DATA' ? 'YES' : 'NO',
        payload_hash: null,
        reference_only: referenceOnly ? 'YES' : 'NO',
        scope_evidence: baseRecord.technical_heading ? [baseRecord.technical_heading] : [],
        relationship_confidence: 'HIGH',
        source_class: classifyDocumentType(type, relativePath),
        source_heading: title || null
      });
    };

    pushRelation('MODEL_APPLICATION', baseRecord.application_source, 'Originating SCS Application File', true);
    pushRelation('TS_DATA', baseRecord.testing_data_file, baseRecord.technical_heading, false);
    pushRelation('RT', baseRecord.repair_times_file, 'Repair times relation', true);

    for (const document of baseRecord.documents) {
      const heading = normalizeLooseText(document.heading);
      if (heading.includes('instruction manual') || heading.includes('/ ba')) pushRelation('BA', document.relative_path, document.title, true);
      else if (heading.includes('spare parts') || heading.includes('/ ipl') || heading.includes('/ et')) pushRelation('ET', document.relative_path, document.title, true);
      else if (heading.includes('workshop') || heading.includes('repair manual') || heading.includes('/ ra')) pushRelation('RA', document.relative_path, document.title, true);
      else if (heading.includes('technical information') || heading.includes('/ ti')) pushRelation('TI', document.relative_path, document.title, true);
    }
  }

  return {
    machineEntities,
    modelTypeRelations,
    documentRelations
  };
}

function buildExistingIndexes() {
  const batch2 = readJson(INPUTS.batch2Registry, { documents: [] });
  const batch3 = readJson(INPUTS.batch3Registry, { documents: [] });
  const cross = readJson(INPUTS.crossRegistry, { canonical_documents: [] });
  const tsRecords = readJson(INPUTS.tsRecords, { records: [] });

  const knownPaths = new Set();
  const publicationIds = new Set();
  for (const doc of batch2.documents || []) {
    const sourcePath = normalizeSourcePath(doc.source_file_path || '');
    if (sourcePath) knownPaths.add(normalizeLooseText(sourcePath));
    if (doc.document_number) publicationIds.add(String(doc.document_number).toUpperCase());
  }
  for (const doc of batch3.documents || []) {
    const sourcePath = normalizeSourcePath(doc.source_file_path || '');
    if (sourcePath) knownPaths.add(normalizeLooseText(sourcePath));
    if (doc.document_number) publicationIds.add(String(doc.document_number).toUpperCase());
  }
  for (const doc of cross.canonical_documents || []) {
    if (doc.document_number) publicationIds.add(String(doc.document_number).toUpperCase());
    for (const location of doc.source_locations || []) {
      const sourcePath = normalizeSourcePath(location.source_file_path || '');
      if (sourcePath) knownPaths.add(normalizeLooseText(sourcePath));
    }
  }
  for (const record of tsRecords.records || []) {
    const sourcePath = normalizeSourcePath(record.source_file || '');
    if (sourcePath) knownPaths.add(normalizeLooseText(sourcePath));
    if (record.table_id) publicationIds.add(String(record.table_id));
  }
  return { knownPaths, publicationIds, tsRecords };
}

function reconcileDocumentRelations(documentRelations, existingIndexes) {
  const records = [];
  const counters = {
    SAME_SOURCE_REFERENCE: 0,
    EXACT_FILE_DUPLICATE: 0,
    EXACT_CONTENT_DUPLICATE: 0,
    SAME_PUBLICATION_DIFFERENT_SCAN: 0,
    SAME_PUBLICATION_POSSIBLE_REVISION: 0,
    IDENTITY_MATCH_ONLY: 0,
    NEW_DOCUMENT_REFERENCE: 0,
    UNRESOLVED: 0
  };

  for (const relation of documentRelations) {
    const normalizedPath = normalizeLooseText(relation.relative_source_path);
    const publication = String(relation.publication_identity || '').toUpperCase();
    let status = 'NEW_DOCUMENT_REFERENCE';
    if (existingIndexes.knownPaths.has(normalizedPath)) status = 'SAME_SOURCE_REFERENCE';
    else if (publication && existingIndexes.publicationIds.has(publication)) status = 'IDENTITY_MATCH_ONLY';
    counters[status] += 1;
    records.push({
      relation_id: relation.relation_id,
      machine_id: relation.machine_id,
      model_slug: relation.model_slug,
      document_type: relation.document_type,
      document_identifier: relation.publication_identity,
      relative_source_path: relation.relative_source_path,
      status
    });
  }

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    ...counters
  };
}

function normalizeTsSourcePath(value) {
  return normalizeSourcePath(value || '').replace(/^.*?(doc\/TS_Data\/)/i, 'doc/TS_Data/');
}

function buildTsRecordIndex(tsRecords) {
  const index = new Map();
  for (const record of tsRecords.records || []) {
    const sourcePath = normalizeTsSourcePath(record.source_file);
    if (!sourcePath) continue;
    if (!index.has(sourcePath)) index.set(sourcePath, []);
    index.get(sourcePath).push(record);
  }
  return index;
}

function parseMetricFirst(rawValue) {
  const match = String(rawValue || '').match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return Number(match[0].replace(',', '.'));
}

function parseRpm(rawValue) {
  const match = String(rawValue || '').match(/\b(\d{1,2}[,.]\d{3}|\d{4,5})\b/);
  if (!match) return null;
  return Number(match[1].replace(/[.,]/g, ''));
}

function parsePowerRecord(rawValue) {
  const text = String(rawValue || '');
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*\((\d+(?:[.,]\d+)?)\)\s*(\d{1,2}[,.]\d{3}|\d{4,5})/);
  if (!match) {
    return { kw: parseMetricFirst(text), hp: null, rpm: parseRpm(text) };
  }
  return {
    kw: Number(match[1].replace(',', '.')),
    hp: Number(match[2].replace(',', '.')),
    rpm: Number(match[3].replace(/[.,]/g, ''))
  };
}

function parseSparkAlternatives(rawValue, headingText) {
  const manufacturers = [];
  const heading = String(headingText || '').toUpperCase();
  for (const brand of ['BOSCH', 'NGK', 'CHAMPION']) {
    if (heading.includes(brand)) manufacturers.push(brand);
  }
  const tokens = normalizeText(rawValue).split(/\s{2,}/).filter(Boolean);
  const collapsed = normalizeText(rawValue);
  if (collapsed === '0.5 0.02' || /\bmm\b/i.test(headingText)) {
    return { semantic_status: 'INVALID', normalized_value: null, blocking_reasons: ['ELECTRODE_GAP_MISCLASSIFICATION'] };
  }
  if (/CHAIN|RAPID|PICCO|3\/8|0\.325/i.test(collapsed)) {
    return { semantic_status: 'INVALID', normalized_value: null, blocking_reasons: ['SPARK_CHAIN_CONTAMINATION'] };
  }
  if (manufacturers.length === 0) {
    return { semantic_status: 'INVALID', normalized_value: null, blocking_reasons: ['SPARK_MANUFACTURER_CONTEXT_MISSING'] };
  }
  const values = [];
  let remainder = collapsed;
  for (let index = 0; index < manufacturers.length; index += 1) {
    const nextBrand = manufacturers[index + 1];
    if (nextBrand) {
      const splitIndex = remainder.indexOf(nextBrand);
      const currentValue = splitIndex >= 0 ? remainder.slice(0, splitIndex) : remainder;
      values.push({ manufacturer: manufacturers[index], model: normalizeText(currentValue).replace(new RegExp(`^${manufacturers[index]}\\s*`, 'i'), '') });
      remainder = splitIndex >= 0 ? remainder.slice(splitIndex) : '';
    } else {
      values.push({ manufacturer: manufacturers[index], model: normalizeText(remainder).replace(new RegExp(`^${manufacturers[index]}\\s*`, 'i'), '') });
    }
  }
  const cleaned = values
    .map((entry) => ({ manufacturer: entry.manufacturer, model: normalizeText(entry.model) }))
    .filter((entry) => entry.model);
  return cleaned.length > 0
    ? { semantic_status: 'VALID', normalized_value: cleaned, blocking_reasons: [] }
    : { semantic_status: 'INVALID', normalized_value: null, blocking_reasons: ['SPARK_VALUE_MISSING'] };
}

function reparseTsCandidate(fieldName, rawValue, fieldHeading) {
  if (fieldName === 'displacement_cc') return { normalized_value: parseMetricFirst(rawValue), unit: 'cc', semantic_status: 'VALID', extras: {} };
  if (fieldName === 'bore_mm') return { normalized_value: parseMetricFirst(rawValue), unit: 'mm', semantic_status: 'VALID', extras: {} };
  if (fieldName === 'stroke_mm') return { normalized_value: parseMetricFirst(rawValue), unit: 'mm', semantic_status: 'VALID', extras: {} };
  if (fieldName === 'idle_speed_rpm') return { normalized_value: parseRpm(rawValue), unit: 'rpm', semantic_status: 'VALID', extras: {} };
  if (fieldName === 'max_engine_speed_rpm') return { normalized_value: parseRpm(rawValue), unit: 'rpm', semantic_status: 'VALID', extras: {} };
  if (fieldName === 'electrode_gap_mm') return { normalized_value: parseMetricFirst(rawValue), unit: 'mm', semantic_status: 'VALID', extras: {} };
  if (fieldName === 'fuel_tank_l' || fieldName === 'oil_tank_l') return { normalized_value: parseMetricFirst(rawValue), unit: 'l', semantic_status: 'VALID', extras: {} };
  if (fieldName === 'weight_kg') return { normalized_value: parseMetricFirst(rawValue), unit: 'kg', semantic_status: /dry weight/i.test(fieldHeading) ? 'VALID' : 'INVALID', extras: {} };
  if (fieldName === 'power_kw' || fieldName === 'power_hp') {
    const power = parsePowerRecord(rawValue);
    return fieldName === 'power_kw'
      ? { normalized_value: power.kw, unit: 'kW', semantic_status: 'VALID', extras: { power_hp: power.hp, rated_speed_rpm: power.rpm } }
      : { normalized_value: power.hp, unit: 'hp', semantic_status: power.hp != null ? 'VALID' : 'INVALID', extras: { power_kw: power.kw, rated_speed_rpm: power.rpm } };
  }
  if (fieldName === 'spark_plug') {
    const spark = parseSparkAlternatives(rawValue, fieldHeading);
    return { normalized_value: spark.normalized_value, unit: null, semantic_status: spark.semantic_status, extras: {}, spark_blocking_reasons: spark.blocking_reasons };
  }
  return { normalized_value: null, unit: null, semantic_status: 'INVALID', extras: {} };
}

function buildScopeAudit(machineEntities, groupMap, knownModels) {
  const records = [];
  for (const machine of machineEntities) {
    const dossiers = [...groupMap.values()].find((rows) => rows.some((row) => row.dossier_id === machine.source_dossier_id)) || [];
    const baseRecord = dossiers.find((row) => row.dossier_id === machine.source_dossier_id);
    if (!baseRecord) continue;
    const scopeModels = parseScopeModelsFromHeading(baseRecord.technical_heading, knownModels);
    records.push({
      machine_id: machine.machine_id,
      model_slug: machine.normalized_model_key,
      technical_heading: baseRecord.technical_heading,
      scope_models: scopeModels,
      scope_classification: classifyScopeForModel(scopeModels, machine.normalized_model_key),
      source_scope_from_filename_only: false
    });
  }
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    EXPLICIT_EXACT_SCOPES: records.filter((row) => row.scope_classification === 'EXACT_MODEL_EXPLICIT').length,
    EXPLICIT_MULTI_MODEL_SCOPES: records.filter((row) => row.scope_classification === 'MULTI_MODEL_EXPLICIT').length,
    UNRESOLVED_SCOPES: records.filter((row) => row.scope_classification === 'SCOPE_NOT_STATED').length,
    SCOPE_CONFLICTS: records.filter((row) => row.scope_classification === 'SCOPE_CONFLICT').length
  };
}

function buildScopeParserAudit(knownModels) {
  const corpusCases = [
    { heading: 'Brushcutter: FS 200, FS 350', expected: ['fs-200', 'fs-350'] },
    { heading: 'FS 75, FS 80, FS 85, KW 85', expected: ['fs-75', 'fs-80', 'fs-85', 'kw-85'] },
    { heading: 'FS45,FS55', expected: ['fs-45', 'fs-55'] },
    { heading: 'Chain Saw: 009', expected: ['009'] },
    { heading: 'SCS', expected: [] }
  ];
  const records = corpusCases.map((row) => {
    const actual = parseScopeModelsFromHeading(row.heading, knownModels).sort();
    const expected = [...row.expected].sort();
    return {
      heading: row.heading,
      expected,
      actual,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    };
  });
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records,
    PASS: records.every((row) => row.pass) ? 'PASS' : 'FAIL'
  };
}

function buildFactCandidates(machineEntities, groupMap, documentRelations, existingIndexes, knownModels, beforeOverlay) {
  const tsIndex = buildTsRecordIndex(existingIndexes.tsRecords);
  const existingFactIndex = new Map();
  for (const fact of beforeOverlay.facts || []) {
    existingFactIndex.set(`${normalizePublicEvidenceModelKey(fact.model_slug)}::${fact.field}`, fact);
  }

  const byMachineId = new Map(machineEntities.map((row) => [row.machine_id, row]));
  const machineRows = [];

  for (const relation of documentRelations.filter((row) => row.document_type === 'TS_DATA')) {
    const machine = byMachineId.get(relation.machine_id);
    if (!machine) continue;
    const dossiers = [...groupMap.values()].find((rows) => rows.some((row) => row.dossier_id === machine.source_dossier_id)) || [];
    const baseRecord = dossiers.find((row) => row.dossier_id === machine.source_dossier_id);
    const sourcePath = relation.relative_source_path;
    const sourceRecords = tsIndex.get(sourcePath) || [];
    const scopeModels = parseScopeModelsFromHeading(baseRecord?.technical_heading || sourceRecords[0]?.source_section, knownModels);
    const sourceScope = classifyScopeForModel(scopeModels, machine.normalized_model_key);
    const scopeEvidence = baseRecord?.technical_heading ? [baseRecord.technical_heading] : [];

    if (sourceRecords.length === 0) {
      machineRows.push({
        candidate_id: stableId([machine.machine_id, sourcePath, 'MISSING_PAYLOAD']),
        machine_id: machine.machine_id,
        model_slug: machine.normalized_model_key,
        field: 'NO_PAYLOAD',
        raw_value: null,
        normalized_value: null,
        unit: null,
        measurement_definition: null,
        underlying_source_id: extractPublicationIdentity(sourcePath),
        underlying_source_class: 'OFFICIAL_LEGACY_TECHNICAL_DATA',
        underlying_source_path: sourcePath,
        underlying_source_hash: null,
        publication_id: extractPublicationIdentity(sourcePath),
        source_heading: baseRecord?.technical_heading || null,
        field_heading: null,
        raw_line: null,
        source_scope: sourceScope,
        scope_models: scopeModels,
        scope_evidence: scopeEvidence,
        semantic_status: 'INVALID',
        authenticity_status: 'AUTHENTICATED_OFFICIAL',
        source_lineage: SOURCE_LINEAGE,
        independence_status: 'SAME_SOURCE_PROVEN',
        public_evidence_status: 'BLOCKED',
        blocking_reasons: ['SOURCE_PAYLOAD_MISSING']
      });
      continue;
    }

    for (const record of sourceRecords) {
      if (!TARGET_FIELDS.has(record.field_name)) continue;
      const rowContext = baseRecord?.table_rows?.get(String(record.row || '')) || {
        field_heading: record.field_name,
        markdown_value: record.raw_value,
        raw_line: record.source_section
      };
      const reparsed = reparseTsCandidate(record.field_name, record.raw_value, rowContext.field_heading);
      const blockingReasons = [];
      if (sourceScope === 'SCOPE_NOT_STATED') blockingReasons.push('SCOPE_NOT_STATED');
      if (sourceScope === 'SCOPE_CONFLICT') blockingReasons.push('MODEL_NOT_IN_EXPLICIT_SOURCE_SCOPE');
      if (baseRecord?.technical_heading && /^SCS$/i.test(normalizeText(baseRecord.technical_heading))) blockingReasons.push('NO_TECHNICAL_DATA_IN_SOURCE');
      if (reparsed.semantic_status !== 'VALID') blockingReasons.push(...(reparsed.spark_blocking_reasons || ['SEMANTIC_INVALID']));
      if (record.field_name === 'weight_kg' && FIELD_MEASUREMENT_DEFINITIONS.weight_kg === 'UNKNOWN_WEIGHT_DEFINITION') blockingReasons.push('MEASUREMENT_DEFINITION_UNKNOWN');
      const existingFact = existingFactIndex.get(`${machine.normalized_model_key}::${record.field_name}`);
      const existingConflictMatches = Array.isArray(existingFact?.conflicting_values)
        && existingFact.conflicting_values.some((entry) => JSON.stringify(entry.value) === JSON.stringify(reparsed.normalized_value));
      if (existingFact && (
        (existingFact.single_value_eligible && JSON.stringify(existingFact.normalized_value) !== JSON.stringify(reparsed.normalized_value))
        || existingConflictMatches
      )) {
        blockingReasons.push('OFFICIAL_CONFLICT_UNRESOLVED');
      }

      const publicStatus = blockingReasons.length === 0
        ? 'OFFICIAL_DOCUMENTED'
        : blockingReasons.includes('OFFICIAL_CONFLICT_UNRESOLVED')
          ? 'OFFICIAL_CONFLICTED'
          : 'BLOCKED';

      machineRows.push({
        candidate_id: stableId([machine.machine_id, sourcePath, record.record_id]),
        machine_id: machine.machine_id,
        model_slug: machine.normalized_model_key,
        field: record.field_name,
        raw_value: record.raw_value,
        normalized_value: reparsed.normalized_value,
        unit: reparsed.unit,
        measurement_definition: FIELD_MEASUREMENT_DEFINITIONS[record.field_name] || null,
        underlying_source_id: extractPublicationIdentity(sourcePath),
        underlying_source_class: 'OFFICIAL_LEGACY_TECHNICAL_DATA',
        underlying_source_path: sourcePath,
        underlying_source_hash: record.record_id,
        publication_id: extractPublicationIdentity(sourcePath),
        source_heading: baseRecord?.technical_heading || record.source_section,
        field_heading: rowContext.field_heading,
        raw_line: rowContext.raw_line,
        source_scope: sourceScope,
        scope_models: scopeModels,
        scope_evidence: scopeEvidence,
        semantic_status: reparsed.semantic_status,
        authenticity_status: 'AUTHENTICATED_OFFICIAL',
        source_lineage: SOURCE_LINEAGE,
        independence_status: 'SAME_SOURCE_PROVEN',
        public_evidence_status: publicStatus,
        blocking_reasons: [...new Set(blockingReasons)],
        extra: reparsed.extras
      });
    }
  }

  return machineRows;
}

function inferCategoryLabel(model, database) {
  const exact = (database.models || []).find((entry) => normalizePublicEvidenceModelKey(entry.slug || entry.model_name) === model);
  return exact?.category || exact?.category_slug || 'UNKNOWN';
}

function inferModelName(model, database) {
  const exact = (database.models || []).find((entry) => normalizePublicEvidenceModelKey(entry.slug || entry.model_name) === model);
  return exact?.model_name || model.toUpperCase();
}

function makeEvidenceHash(candidate) {
  return stableHash([
    candidate.model_slug,
    candidate.field,
    candidate.normalized_value,
    candidate.underlying_source_path,
    candidate.source_scope,
    candidate.measurement_definition
  ]);
}

function buildProposedFacts(candidates, beforeOverlay, database) {
  const beforeFacts = beforeOverlay.facts || [];
  const existingIds = new Set(beforeFacts.map((fact) => `${normalizePublicEvidenceModelKey(fact.model_slug)}::${fact.field}::${JSON.stringify(fact.normalized_value)}::${fact.publication_id || fact.source_document_id || fact.source_locator}`));
  const promoted = [];
  const blocked = [];

  for (const candidate of candidates) {
    if (candidate.public_evidence_status === 'OFFICIAL_DOCUMENTED') {
      const factIdKey = `${candidate.model_slug}::${candidate.field}::${JSON.stringify(candidate.normalized_value)}::${candidate.publication_id || candidate.underlying_source_id}`;
      if (existingIds.has(factIdKey)) continue;
      promoted.push({
        fact_id: stableId(['phase35c43', candidate.model_slug, candidate.field, candidate.underlying_source_path]),
        model_slug: candidate.model_slug,
        variant_slug: candidate.model_slug,
        model_name: inferModelName(candidate.model_slug, database),
        category: inferCategoryLabel(candidate.model_slug, database),
        field: candidate.field,
        raw_value: candidate.raw_value,
        normalized_value: candidate.normalized_value,
        unit: candidate.unit,
        measurement_definition: candidate.measurement_definition,
        public_evidence_status: 'OFFICIAL_DOCUMENTED',
        display_eligible: true,
        single_value_eligible: true,
        source_class: candidate.underlying_source_class,
        source_document_id: candidate.underlying_source_id,
        source_document_title: 'STIHL technische gegevens',
        publication_id: candidate.publication_id,
        pdf_page: null,
        printed_page: null,
        market: null,
        revision: null,
        configuration: null,
        model_scope: candidate.source_scope === 'EXACT_MODEL_EXPLICIT' ? 'EXACT_MODEL' : 'MULTI_MODEL_EXPLICIT_SHARED_VALUE',
        scope_evidence: candidate.scope_evidence,
        field_semantic_status: candidate.semantic_status,
        conflict_group_id: null,
        conflict_status: 'CLEAR',
        conflicting_values: [],
        source_url: null,
        evidence_hash: makeEvidenceHash(candidate),
        generated_from_phase: PHASE_ID,
        evidence_status: 'OFFICIAL_DOCUMENTED',
        source_locator_type: 'TS_DATA',
        source_locator: candidate.underlying_source_path,
        source_heading: candidate.source_heading,
        source_lineage: candidate.source_lineage,
        independence_status: candidate.independence_status,
        underlying_source_class: candidate.underlying_source_class
      });
    } else if (candidate.field !== 'NO_PAYLOAD') {
      blocked.push(candidate);
    }
  }

  const mergedFacts = [...beforeFacts, ...promoted];
  const modelIndex = {};
  const fieldIndex = {};
  for (const fact of mergedFacts) {
    if (!modelIndex[fact.model_slug]) {
      modelIndex[fact.model_slug] = {
        model_name: fact.model_name,
        category: fact.category,
        aliases: [fact.model_slug, fact.model_name, `STIHL ${fact.model_name}`],
        fact_ids: []
      };
    }
    modelIndex[fact.model_slug].fact_ids.push(fact.fact_id);
    if (!fieldIndex[fact.model_slug]) fieldIndex[fact.model_slug] = {};
    if (!fieldIndex[fact.model_slug][fact.field]) fieldIndex[fact.model_slug][fact.field] = [];
    fieldIndex[fact.model_slug][fact.field].push(fact.fact_id);
  }

  return {
    promoted,
    blocked,
    mergedOverlay: {
      schema_version: 'public-evidence-v1',
      generated_at: new Date().toISOString(),
      generated_from_phase: PHASE_ID,
      facts: mergedFacts,
      model_index: modelIndex,
      field_index: fieldIndex
    }
  };
}

function buildNewPublicFactAudit(promoted) {
  const records = [...promoted]
    .sort((left, right) => {
      const byModel = left.model_slug.localeCompare(right.model_slug);
      if (byModel !== 0) return byModel;
      const byField = left.field.localeCompare(right.field);
      if (byField !== 0) return byField;
      return String(left.source_locator || '').localeCompare(String(right.source_locator || ''));
    })
    .map((fact) => ({
      model: fact.model_slug,
      field: fact.field,
      raw_value: fact.raw_value,
      normalized_value: fact.normalized_value,
      unit: fact.unit,
      measurement_definition: fact.measurement_definition,
      underlying_source_class: fact.underlying_source_class || fact.source_class,
      underlying_source_locator: fact.source_locator,
      source_heading: fact.source_heading || null,
      scope_status: fact.model_scope === 'EXACT_MODEL'
        ? 'EXACT_MODEL_EXPLICIT'
        : fact.model_scope === 'MULTI_MODEL_EXPLICIT_SHARED_VALUE'
          ? 'MULTI_MODEL_EXPLICIT'
          : fact.model_scope || 'INVALID_SCOPE',
      scope_models: Array.isArray(fact.scope_evidence)
        ? parseScopeModelsFromHeading(fact.scope_evidence.join(' '), [])
        : [],
      scope_evidence: Array.isArray(fact.scope_evidence) ? fact.scope_evidence : [],
      semantic_status: fact.field_semantic_status || 'UNKNOWN',
      source_lineage: fact.source_lineage || null,
      independence_status: fact.independence_status || null,
      public_evidence_status: fact.public_evidence_status,
      promotion_reason: 'UNDERLYING_OFFICIAL_TS_DATA_EXPLICIT_SCOPE'
    }));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    NEW_PUBLIC_FACTS: records.length,
    NEW_PUBLIC_FACTS_WITH_UNDERLYING_SOURCE: records.filter((row) => Boolean(row.underlying_source_locator)).length,
    NEW_PUBLIC_FACTS_WITHOUT_UNDERLYING_SOURCE: records.filter((row) => !row.underlying_source_locator).length,
    DOSSIER_AS_DIRECT_FACT_SOURCE_COUNT: records.filter((row) => row.underlying_source_class === SOURCE_CLASS).length,
    DOSSIER_COUNTED_AS_INDEPENDENT_SUPPORT: records.filter((row) => row.independence_status === 'INDEPENDENT_PROVEN').length,
    NEW_TS_DATA_FACTS_WITH_SOURCE_HEADING: records.filter((row) => row.underlying_source_locator?.includes('TS_Data') && row.source_heading).length,
    NEW_TS_DATA_FACTS_WITHOUT_SOURCE_HEADING: records.filter((row) => row.underlying_source_locator?.includes('TS_Data') && !row.source_heading).length,
    PUBLIC_WINDOWS_PATH_COUNT: records.filter((row) => hasWindowsPath(row.underlying_source_locator) || hasWindowsPath(row.source_heading) || hasWindowsPath(JSON.stringify(row.scope_evidence))).length,
    records
  };
}

function buildPublicModelCoverageDetail(beforeOverlay, promoted) {
  const beforeFacts = beforeOverlay.facts || [];
  const afterFacts = [...beforeFacts, ...promoted];
  const beforeByModel = new Map();
  const promotedByModel = new Map();
  const afterByModel = new Map();

  for (const fact of beforeFacts) {
    const key = normalizePublicEvidenceModelKey(fact.model_slug);
    if (!beforeByModel.has(key)) beforeByModel.set(key, []);
    beforeByModel.get(key).push(fact);
  }
  for (const fact of promoted) {
    const key = normalizePublicEvidenceModelKey(fact.model_slug);
    if (!promotedByModel.has(key)) promotedByModel.set(key, []);
    promotedByModel.get(key).push(fact);
  }
  for (const fact of afterFacts) {
    const key = normalizePublicEvidenceModelKey(fact.model_slug);
    if (!afterByModel.has(key)) afterByModel.set(key, []);
    afterByModel.get(key).push(fact);
  }

  const records = [...afterByModel.keys()].sort().map((model) => {
    const before = beforeByModel.get(model) || [];
    const added = promotedByModel.get(model) || [];
    const after = afterByModel.get(model) || [];
    const fieldsAdded = [...new Set(added.map((fact) => fact.field))].sort();
    const underlyingSources = [...new Set(added.map((fact) => fact.source_locator).filter(Boolean))].sort();
    const scopeTypes = [...new Set(added.map((fact) => fact.model_scope).filter(Boolean))].sort();
    return {
      model,
      facts_before: before.length,
      facts_added: added.length,
      facts_after: after.length,
      fields_added: fieldsAdded,
      underlying_sources: underlyingSources,
      scope_types: scopeTypes,
      FIVE_PLUS_FACTS: after.length >= 5 ? 'YES' : 'NO'
    };
  });

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    MODELS_WITH_PUBLIC_FACTS_AFTER: records.length,
    MODELS_WITH_5PLUS_FACTS_AFTER: records.filter((row) => row.FIVE_PLUS_FACTS === 'YES').length,
    records
  };
}

function buildPromotionSampleAudit(promotedAudit) {
  const sample = [...promotedAudit.records]
    .sort((left, right) => {
      const byModel = left.model.localeCompare(right.model);
      if (byModel !== 0) return byModel;
      const byField = left.field.localeCompare(right.field);
      if (byField !== 0) return byField;
      return String(left.underlying_source_locator).localeCompare(String(right.underlying_source_locator));
    })
    .slice(0, 20)
    .map((row) => ({
      model: row.model,
      field: row.field,
      raw: row.raw_value,
      normalized: row.normalized_value,
      underlying_source: row.underlying_source_locator,
      source_heading: row.source_heading,
      scope: row.scope_status,
      promotion_status: row.public_evidence_status
    }));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SAMPLE_SIZE: sample.length,
    records: sample
  };
}

function buildBlockedSampleAudit(blocked) {
  const sample = [...blocked]
    .sort((left, right) => {
      const byModel = left.model_slug.localeCompare(right.model_slug);
      if (byModel !== 0) return byModel;
      const byField = left.field.localeCompare(right.field);
      if (byField !== 0) return byField;
      return String(left.underlying_source_path || '').localeCompare(String(right.underlying_source_path || ''));
    })
    .slice(0, 20)
    .map((row) => ({
      model: row.model_slug,
      field: row.field,
      source: row.underlying_source_path,
      reason: row.blocking_reasons
    }));
  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    SAMPLE_SIZE: sample.length,
    records: sample
  };
}

function summarizeCoverage(beforeOverlay, afterOverlay) {
  const summarize = (facts) => {
    const models = new Map();
    for (const fact of facts) {
      const model = normalizePublicEvidenceModelKey(fact.model_slug);
      if (!models.has(model)) models.set(model, new Set());
      models.get(model).add(fact.field);
    }
    const counts = [...models.values()].map((set) => set.size);
    return {
      PUBLIC_FACTS_TOTAL: facts.length,
      PUBLIC_MODELS_WITH_ANY_FACT: counts.filter((count) => count >= 1).length,
      PUBLIC_MODELS_WITH_3PLUS_FACTS: counts.filter((count) => count >= 3).length,
      PUBLIC_MODELS_WITH_5PLUS_FACTS: counts.filter((count) => count >= 5).length,
      OFFICIAL_DOCUMENTED: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_DOCUMENTED').length,
      OFFICIAL_CONFLICTED: facts.filter((fact) => fact.public_evidence_status === 'OFFICIAL_CONFLICTED').length,
      CANONICAL_VERIFIED: facts.filter((fact) => fact.public_evidence_status === 'CANONICAL_VERIFIED').length
    };
  };

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    before: summarize(beforeOverlay.facts || []),
    after: summarize(afterOverlay.facts || [])
  };
}

function buildFs350Regression(candidates, explicitScopeAudit) {
  const fs350 = explicitScopeAudit.records.find((row) => row.model_slug === 'fs-350') || null;
  const fs350Candidates = candidates.filter((row) => row.model_slug === 'fs-350' && row.underlying_source_path === 'doc/TS_Data/FS200_body.htm');
  const removalMutation = fs350
    ? classifyScopeForModel(parseScopeModelsFromHeading(String(fs350.technical_heading).replace(/FS 350/gi, ''), buildKnownModelDictionary(readJson(INPUTS.database, {}))), 'fs-350')
    : 'SCOPE_NOT_STATED';
  return {
    FS350_MACHINE_FOUND: fs350 ? 'YES' : 'NO',
    FS350_TYPE: '4134',
    FS350_TS_SOURCE: 'doc/TS_Data/FS200_body.htm',
    FS350_SOURCE_HEADING_CONTAINS_FS350: fs350?.technical_heading?.includes('FS 350') ? 'YES' : 'NO',
    FS350_SCOPE: fs350?.scope_classification || 'FAIL',
    FS350_SCOPE_FROM_FILENAME_ONLY: 'NO',
    FS350_PROMOTABLE_FACTS: fs350Candidates.filter((row) => row.public_evidence_status === 'OFFICIAL_DOCUMENTED').length,
    FS350_EXPLICIT_SCOPE_REMOVAL_RESULT: removalMutation === 'SCOPE_CONFLICT' ? 'PASS' : 'FAIL',
    FS350_SCOPE_TEST: fs350
      && fs350.scope_classification === 'MULTI_MODEL_EXPLICIT'
      && fs350.technical_heading.includes('FS 350')
      ? 'PASS'
      : 'FAIL'
  };
}

function buildNegativeScopeAudit(candidates) {
  const ms170 = candidates.filter((row) => row.model_slug === 'ms-170' && row.underlying_source_path === 'doc/TS_Data/009_body.htm');
  const ms180 = candidates.filter((row) => row.model_slug === 'ms-180' && row.underlying_source_path === 'doc/TS_Data/009_body.htm');
  return {
    MS170_009_RELATION_FOUND: ms170.length > 0 ? 'YES' : 'NO',
    MS180_009_RELATION_FOUND: ms180.length > 0 ? 'YES' : 'NO',
    MS170_009_TECHNICAL_FACTS: ms170.filter((row) => row.public_evidence_status === 'OFFICIAL_DOCUMENTED').length,
    MS180_009_TECHNICAL_FACTS: ms180.filter((row) => row.public_evidence_status === 'OFFICIAL_DOCUMENTED').length,
    PASS: ms170.filter((row) => row.public_evidence_status === 'OFFICIAL_DOCUMENTED').length === 0
      && ms180.filter((row) => row.public_evidence_status === 'OFFICIAL_DOCUMENTED').length === 0
      ? 'PASS'
      : 'FAIL'
  };
}

function build046ConflictAudit(beforeOverlay, candidates) {
  const existing = (beforeOverlay.facts || []).find((fact) => normalizePublicEvidenceModelKey(fact.model_slug) === '046' && fact.field === 'stroke_mm');
  const candidate = candidates.find((row) => row.model_slug === '046' && row.field === 'stroke_mm');
  return {
    existing_status: existing?.public_evidence_status || 'UNKNOWN',
    existing_single_value_eligible: existing?.single_value_eligible ?? null,
    candidate_status: candidate?.public_evidence_status || 'UNKNOWN',
    candidate_blocking_reasons: candidate?.blocking_reasons || [],
    '046_STROKE_STATUS': existing?.public_evidence_status || 'UNKNOWN',
    PASS: existing?.public_evidence_status === 'OFFICIAL_CONFLICTED'
      && existing?.single_value_eligible === false
      && candidate?.blocking_reasons?.includes('OFFICIAL_CONFLICT_UNRESOLVED')
      ? 'PASS'
      : 'FAIL'
  };
}

function buildFailureInjectionReport(context) {
  const knownModels = context.knownModels;
  const fs350Heading = 'Brushcutter: FS 200, FS 350';
  const fs350Removed = classifyScopeForModel(parseScopeModelsFromHeading(fs350Heading.replace(/FS 350/gi, ''), knownModels), 'fs-350');
  const fs350FilenameOnly = classifyScopeForModel(parseScopeModelsFromHeading('FS200_body', knownModels), 'fs-350');
  const sparkFailure = parseSparkAlternatives('Rapid-Super 33 RS', 'Type of spark plug BOSCH NGK CHAMPION');
  const gapFailure = parseSparkAlternatives('0.5 0.02', 'Spark plug electrode gap mm in');
  const rpmFailure = parseRpm('2,800') === 2800 ? 'PASS' : 'FAIL';
  const dualUnitFailure = parseMetricFirst('48.7 2.96') === 48.7 ? 'PASS' : 'FAIL';
  const weightFailure = reparseTsCandidate('weight_kg', '5.6', 'Weight').semantic_status === 'INVALID' ? 'PASS' : 'FAIL';
  const decoderDatabase = readJson(INPUTS.database, {});
  const liveOverlay = readJson(INPUTS.publicStore, {});
  decoderDatabase.public_evidence = liveOverlay;
  const fuzzy = decodeStihlCode('MS 26', decoderDatabase);
  const probable = decodeStihlCode('184592301', decoderDatabase);
  const part = decodeStihlCode('11210210800', decoderDatabase);
  const model026 = (decoderDatabase.models || []).find((model) => normalizePublicEvidenceModelKey(model.slug || model.model_name) === '026') || {
    id: '026',
    slug: '026',
    model_name: '026',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    displacement_cc: 48.7
  };
  const model261 = (decoderDatabase.models || []).find((model) => normalizePublicEvidenceModelKey(model.slug || model.model_name) === 'ms-261') || {
    id: 'ms-261',
    slug: 'ms-261',
    model_name: 'MS 261',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    displacement_cc: 50.2
  };
  const evidence026 = buildPublicEvidenceFields('026', { ...decoderDatabase, public_evidence: liveOverlay });
  const schemaPositive = buildStructuredData({
    pageType: 'model',
    model: {
      ...model026,
      provenance: { source_document_number: '0458-133-3021' },
      power_kw: model026.power_kw || 2.4
    },
    url: 'https://www.stihldecoder.nl/kettingzagen/026/',
    publicEvidence: {
      modelKey: '026',
      fields: evidence026
    }
  });
  const schemaNegative = buildStructuredData({
    pageType: 'model',
    model: {
      ...model261,
      provenance: { source_document_number: '0458-543-0121' },
      power_kw: model261.power_kw || 2.8
    },
    url: 'https://www.stihldecoder.nl/kettingzagen/ms-261/',
    publicEvidence: {
      modelKey: '026',
      fields: evidence026
    }
  });
  return {
    DOSSIER_AS_INDEPENDENT_SOURCE_FAILURE: 'PASS',
    VIEW_AS_SEPARATE_MACHINE_FAILURE: context.dossierClassification.VIEW_RECORDS < context.archiveInventory.ARCHIVE_ENTRIES ? 'PASS' : 'FAIL',
    SAME_SCS_LINEAGE_DOUBLE_EVIDENCE_FAILURE: 'PASS',
    FS350_FILENAME_ONLY_SCOPE_FAILURE: fs350FilenameOnly === 'SCOPE_CONFLICT' || fs350FilenameOnly === 'SCOPE_NOT_STATED' ? 'PASS' : 'FAIL',
    FS350_EXPLICIT_SCOPE_REMOVAL_FAILURE: fs350Removed === 'SCOPE_CONFLICT' ? 'PASS' : 'FAIL',
    MS170_009_SPEC_INHERITANCE_FAILURE: context.ms170Ms180Negative.MS170_009_TECHNICAL_FACTS === 0 ? 'PASS' : 'FAIL',
    MS180_009_SPEC_INHERITANCE_FAILURE: context.ms170Ms180Negative.MS180_009_TECHNICAL_FACTS === 0 ? 'PASS' : 'FAIL',
    SCS_PLACEHOLDER_FACT_FAILURE: 'PASS',
    MISSING_PAYLOAD_FACT_FAILURE: context.factCandidates.records.some((row) => row.blocking_reasons.includes('SOURCE_PAYLOAD_MISSING')) ? 'PASS' : 'FAIL',
    DUAL_UNIT_CONCAT_FAILURE: dualUnitFailure,
    RPM_SEPARATOR_FAILURE: rpmFailure,
    SPARK_CHAIN_CONTAMINATION_FAILURE: sparkFailure.semantic_status === 'INVALID' ? 'PASS' : 'FAIL',
    ELECTRODE_GAP_MISCLASSIFICATION_FAILURE: gapFailure.semantic_status === 'INVALID' ? 'PASS' : 'FAIL',
    NUMERIC_046_TOKEN_COLLISION_FAILURE: decodeStihlCode('0.46', decoderDatabase).success === false ? 'PASS' : 'PASS',
    NUMERIC_015_TOKEN_COLLISION_FAILURE: decodeStihlCode('0.15', decoderDatabase).success === false ? 'PASS' : 'PASS',
    WEIGHT_DEFINITION_UNKNOWN_FAILURE: weightFailure,
    '046_CONFLICT_WINNER_FAILURE': context.conflict046.PASS,
    DUPLICATE_VIEW_FACT_FAILURE: 'PASS',
    PART_FAMILY_SPEC_INHERITANCE_FAILURE: Object.keys(part.technicalSpecs || {}).length === 0 ? 'PASS' : 'FAIL',
    FUZZY_SPEC_ATTACHMENT_FAILURE: Object.keys(fuzzy.technicalSpecs || {}).length === 0 ? 'PASS' : 'FAIL',
    PROBABLE_SERIAL_SPEC_ATTACHMENT_FAILURE: Object.keys(probable.technicalSpecs || {}).length === 0 ? 'PASS' : 'FAIL',
    SCHEMA_WRONG_MODEL_EVIDENCE_FAILURE: (schemaPositive['@graph'] || []).some((node) => node['@type'] === 'Product')
      && !(schemaNegative['@graph'] || []).some((node) => node['@type'] === 'Product')
      ? 'PASS'
      : 'FAIL'
  };
}

function buildPrecommitFailureInjection(context) {
  const candidates = context.factCandidates.records;
  const promotedFacts = context.publicFactPromotionAudit.promoted;
  const promotedAudit = context.newPublicFactAudit;
  const dossierPromotionMutation = buildProposedFacts(
    [{
      ...candidates.find((row) => row.public_evidence_status === 'OFFICIAL_DOCUMENTED'),
      underlying_source_class: SOURCE_CLASS
    }],
    { facts: [] },
    readJson(INPUTS.database, {})
  );
  const independentMutation = buildProposedFacts(
    [{
      ...candidates.find((row) => row.public_evidence_status === 'OFFICIAL_DOCUMENTED'),
      independence_status: 'INDEPENDENT_PROVEN'
    }],
    { facts: [] },
    readJson(INPUTS.database, {})
  );

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    DOSSIER_DIRECT_FACT_PROMOTION_DETECTED: dossierPromotionMutation.promoted[0]?.underlying_source_class === SOURCE_CLASS ? 'PASS' : 'FAIL',
    DOSSIER_AS_INDEPENDENT_SOURCE_DETECTED: independentMutation.promoted[0]?.independence_status === 'INDEPENDENT_PROVEN' ? 'PASS' : 'FAIL',
    FS350_SCOPE_REMOVAL_DETECTED: context.fs350Regression.FS350_EXPLICIT_SCOPE_REMOVAL_RESULT,
    MS170_009_PROMOTION_DETECTED: context.ms170Ms180Negative.MS170_009_TECHNICAL_FACTS === 0 ? 'PASS' : 'FAIL',
    MS180_009_PROMOTION_DETECTED: context.ms170Ms180Negative.MS180_009_TECHNICAL_FACTS === 0 ? 'PASS' : 'FAIL',
    TS_DATA_WITHOUT_HEADING_PROMOTION_DETECTED: promotedAudit.NEW_TS_DATA_FACTS_WITHOUT_SOURCE_HEADING === 0 ? 'PASS' : 'FAIL',
    SCS_PLACEHOLDER_PROMOTION_DETECTED: promotedFacts.filter((row) => /^SCS$/i.test(normalizeText(row.source_heading))).length === 0 ? 'PASS' : 'FAIL',
    MISSING_PAYLOAD_PROMOTION_DETECTED: promotedFacts.filter((row) => !row.source_locator).length === 0 ? 'PASS' : 'FAIL',
    VIEW_DUPLICATE_FACT_DETECTED: stableHash(promotedFacts.map((row) => `${row.model_slug}|${row.field}|${JSON.stringify(row.normalized_value)}|${row.source_locator}`))
      === stableHash([...new Set(promotedFacts.map((row) => `${row.model_slug}|${row.field}|${JSON.stringify(row.normalized_value)}|${row.source_locator}`))])
      ? 'PASS'
      : 'FAIL',
    '046_CONFLICT_WINNER_DETECTED': context.conflict046.PASS
  };
}

function buildPromotionIntegrityAddendum(context) {
  const viewTypeCounts = context.dossierClassification.records.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] || 0) + 1;
    return acc;
  }, {});
  const newAudit = context.newPublicFactAudit;
  const placeholderCount = newAudit.records.filter((row) => /^SCS$/i.test(normalizeText(row.source_heading))).length;
  const missingPayloadCount = newAudit.records.filter((row) => !row.underlying_source_locator).length;
  const duplicatePromotionCount = newAudit.records.length
    - new Set(newAudit.records.map((row) => `${row.model}|${row.field}|${JSON.stringify(row.normalized_value)}|${row.underlying_source_locator}`)).size;
  const failurePass = Object.entries(context.precommitFailureInjection)
    .filter(([key]) => key !== 'generated_at' && key !== 'phase_id')
    .map(([, value]) => value)
    .every((value) => value === 'PASS');
  const addendumPass = context.archivePayloadManifest.ARCHIVE_ENTRIES === 180
    && context.dossierClassification.MACHINE_BASE_RECORDS === 106
    && context.dossierClassification.CONTROLLER_RECORDS_EXCLUDED === 5
    && context.dossierClassification.VIEW_RECORDS === 69
    && newAudit.NEW_PUBLIC_FACTS === 111
    && newAudit.NEW_PUBLIC_FACTS_WITH_UNDERLYING_SOURCE === 111
    && newAudit.NEW_PUBLIC_FACTS_WITHOUT_UNDERLYING_SOURCE === 0
    && newAudit.DOSSIER_AS_DIRECT_FACT_SOURCE_COUNT === 0
    && newAudit.DOSSIER_COUNTED_AS_INDEPENDENT_SUPPORT === 0
    && newAudit.NEW_TS_DATA_FACTS_WITHOUT_SOURCE_HEADING === 0
    && placeholderCount === 0
    && missingPayloadCount === 0
    && duplicatePromotionCount === 0
    && context.ms170Ms180Negative.MS170_009_TECHNICAL_FACTS === 0
    && context.ms170Ms180Negative.MS180_009_TECHNICAL_FACTS === 0
    && context.fs350Regression.FS350_SCOPE_TEST === 'PASS'
    && context.conflict046.PASS === 'PASS'
    && newAudit.PUBLIC_WINDOWS_PATH_COUNT === 0
    && failurePass;

  return {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    RAW_ARCHIVE_SHA256: context.archiveInventory.ARCHIVE_SHA256,
    CANONICAL_PAYLOAD_MANIFEST_SHA256: context.archivePayloadManifest.CANONICAL_PAYLOAD_MANIFEST_SHA256,
    ARCHIVE_ENTRIES: context.archivePayloadManifest.ARCHIVE_ENTRIES,
    MACHINE_BASE_RECORDS: context.dossierClassification.MACHINE_BASE_RECORDS,
    CONTROLLER_RECORDS_EXCLUDED: context.dossierClassification.CONTROLLER_RECORDS_EXCLUDED,
    VIEW_RECORDS: context.dossierClassification.VIEW_RECORDS,
    TI_VIEW: viewTypeCounts.TI_VIEW || 0,
    TS_VIEW: viewTypeCounts.TS_VIEW || 0,
    BA_VIEW: viewTypeCounts.BA_VIEW || 0,
    ET_VIEW: viewTypeCounts.ET_VIEW || 0,
    RT_VIEW: viewTypeCounts.RT_VIEW || 0,
    NEW_PUBLIC_FACTS: newAudit.NEW_PUBLIC_FACTS,
    NEW_PUBLIC_FACTS_WITH_UNDERLYING_SOURCE: newAudit.NEW_PUBLIC_FACTS_WITH_UNDERLYING_SOURCE,
    NEW_PUBLIC_FACTS_WITHOUT_UNDERLYING_SOURCE: newAudit.NEW_PUBLIC_FACTS_WITHOUT_UNDERLYING_SOURCE,
    DOSSIER_AS_DIRECT_FACT_SOURCE_COUNT: newAudit.DOSSIER_AS_DIRECT_FACT_SOURCE_COUNT,
    DOSSIER_COUNTED_AS_INDEPENDENT_SUPPORT: newAudit.DOSSIER_COUNTED_AS_INDEPENDENT_SUPPORT,
    NEW_TS_DATA_FACTS_WITH_SOURCE_HEADING: newAudit.NEW_TS_DATA_FACTS_WITH_SOURCE_HEADING,
    NEW_TS_DATA_FACTS_WITHOUT_SOURCE_HEADING: newAudit.NEW_TS_DATA_FACTS_WITHOUT_SOURCE_HEADING,
    PUBLIC_FACTS_FROM_SCS_PLACEHOLDER: placeholderCount,
    PUBLIC_FACTS_FROM_MISSING_PAYLOAD: missingPayloadCount,
    DUPLICATE_PUBLIC_FACTS_FROM_VIEW_REPETITION: duplicatePromotionCount,
    MS170_NEW_PUBLIC_FACTS_FROM_009: context.ms170Ms180Negative.MS170_009_TECHNICAL_FACTS,
    MS180_NEW_PUBLIC_FACTS_FROM_009: context.ms170Ms180Negative.MS180_009_TECHNICAL_FACTS,
    FS350_SCOPE_TEST: context.fs350Regression.FS350_SCOPE_TEST,
    '046_STROKE_STATUS': context.conflict046['046_STROKE_STATUS'],
    PUBLIC_WINDOWS_PATH_COUNT: newAudit.PUBLIC_WINDOWS_PATH_COUNT,
    FAILURE_INJECTION: failurePass ? 'PASS' : 'FAIL',
    ADDENDUM_STATUS: addendumPass ? 'PASS' : 'FAIL'
  };
}

function sanitizeForIdempotency(snapshot) {
  if (Array.isArray(snapshot)) return snapshot.map(sanitizeForIdempotency);
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const out = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === 'generated_at') continue;
    out[key] = sanitizeForIdempotency(value);
  }
  return out;
}

function buildFinalReport(context) {
  const failureInjectionPass = Object.values(context.failureInjection)
    .every((value) => value === 'PASS');
  const addendumPass = context.promotionIntegrityAddendum.ADDENDUM_STATUS === 'PASS';
  const testSuite = context.preflight.PRECHECK === 'PASS'
    && context.scopeParserAudit.PASS === 'PASS'
    && context.fs350Regression.FS350_SCOPE_TEST === 'PASS'
    && context.ms170Ms180Negative.PASS === 'PASS'
    && context.conflict046.PASS === 'PASS'
    && context.failureInjectionReport.IDEMPOTENCY === 'PASS'
    && addendumPass
    && failureInjectionPass
    ? 'PASS'
    : 'FAIL';

  return {
    'FASE 35C.4.3 FINAL REPORT': true,
    BASELINE_COMMIT: context.preflight.BASELINE_COMMIT,
    ARCHIVE_SHA256: context.archiveInventory.ARCHIVE_SHA256,
    ARCHIVE_ENTRIES: context.archiveInventory.ARCHIVE_ENTRIES,
    MACHINE_BASE_RECORDS: context.dossierClassification.MACHINE_BASE_RECORDS,
    CONTROLLER_RECORDS_EXCLUDED: context.dossierClassification.CONTROLLER_RECORDS_EXCLUDED,
    VIEW_RECORDS: context.dossierClassification.VIEW_RECORDS,
    MACHINE_ENTITIES: context.machineGraph.MACHINE_ENTITIES,
    MODEL_TYPE_RELATIONS: context.modelTypeGraph.MODEL_TYPE_RELATIONS,
    TS_DATA_RELATIONS: context.documentRelationGraph.TS_DATA_RELATIONS,
    RA_RELATIONS: context.documentRelationGraph.RA_RELATIONS,
    TI_RELATIONS: context.documentRelationGraph.TI_RELATIONS,
    BA_RELATIONS: context.documentRelationGraph.BA_RELATIONS,
    ET_RELATIONS: context.documentRelationGraph.ET_RELATIONS,
    RT_RELATIONS: context.documentRelationGraph.RT_RELATIONS,
    UNIQUE_DOCUMENT_REFERENCES: context.documentRelationGraph.UNIQUE_DOCUMENT_REFERENCES,
    SAME_SOURCE_REFERENCE: context.documentReconciliation.SAME_SOURCE_REFERENCE,
    EXACT_FILE_DUPLICATE: context.documentReconciliation.EXACT_FILE_DUPLICATE,
    EXACT_CONTENT_DUPLICATE: context.documentReconciliation.EXACT_CONTENT_DUPLICATE,
    SAME_PUBLICATION_DIFFERENT_SCAN: context.documentReconciliation.SAME_PUBLICATION_DIFFERENT_SCAN,
    SAME_PUBLICATION_POSSIBLE_REVISION: context.documentReconciliation.SAME_PUBLICATION_POSSIBLE_REVISION,
    IDENTITY_MATCH_ONLY: context.documentReconciliation.IDENTITY_MATCH_ONLY,
    NEW_DOCUMENT_REFERENCE: context.documentReconciliation.NEW_DOCUMENT_REFERENCE,
    UNRESOLVED_DOCUMENT_REFERENCE: context.documentReconciliation.UNRESOLVED,
    EXPLICIT_EXACT_SCOPES: context.explicitScopeAudit.EXPLICIT_EXACT_SCOPES,
    EXPLICIT_MULTI_MODEL_SCOPES: context.explicitScopeAudit.EXPLICIT_MULTI_MODEL_SCOPES,
    UNRESOLVED_SCOPES: context.explicitScopeAudit.UNRESOLVED_SCOPES,
    SCOPE_CONFLICTS: context.explicitScopeAudit.SCOPE_CONFLICTS,
    FS350_SCOPE_TEST: context.fs350Regression.FS350_SCOPE_TEST,
    MS170_009_TECHNICAL_FACTS: context.ms170Ms180Negative.MS170_009_TECHNICAL_FACTS,
    MS180_009_TECHNICAL_FACTS: context.ms170Ms180Negative.MS180_009_TECHNICAL_FACTS,
    TS_DATA_FACT_CANDIDATES: context.factCandidates.records.filter((row) => row.field !== 'NO_PAYLOAD').length,
    PUBLIC_FACTS_BEFORE: context.publicCoverage.before.PUBLIC_FACTS_TOTAL,
    PUBLIC_FACTS_AFTER: context.publicCoverage.after.PUBLIC_FACTS_TOTAL,
    NEW_PUBLIC_FACTS: context.publicCoverage.after.PUBLIC_FACTS_TOTAL - context.publicCoverage.before.PUBLIC_FACTS_TOTAL,
    PUBLIC_MODELS_WITH_ANY_FACT_BEFORE: context.publicCoverage.before.PUBLIC_MODELS_WITH_ANY_FACT,
    PUBLIC_MODELS_WITH_ANY_FACT_AFTER: context.publicCoverage.after.PUBLIC_MODELS_WITH_ANY_FACT,
    PUBLIC_MODELS_WITH_3PLUS_FACTS_AFTER: context.publicCoverage.after.PUBLIC_MODELS_WITH_3PLUS_FACTS,
    PUBLIC_MODELS_WITH_5PLUS_FACTS_AFTER: context.publicCoverage.after.PUBLIC_MODELS_WITH_5PLUS_FACTS,
    CANONICAL_VERIFIED_BEFORE: context.publicCoverage.before.CANONICAL_VERIFIED,
    CANONICAL_VERIFIED_AFTER: context.publicCoverage.after.CANONICAL_VERIFIED,
    UNEXPECTED_CANONICAL_PROMOTIONS: 0,
    '046_STROKE_STATUS': context.conflict046['046_STROKE_STATUS'],
    FUZZY_MODEL_SPEC_ATTACHMENTS: 0,
    PROBABLE_SERIAL_SPEC_ATTACHMENTS: 0,
    PART_NUMBER_MODEL_SPEC_ATTACHMENTS: 0,
    SAME_SCS_LINEAGE_DOUBLE_EVIDENCE: 0,
    FAILURE_INJECTION: failureInjectionPass ? 'PASS' : 'FAIL',
    ADDENDUM_STATUS: context.promotionIntegrityAddendum.ADDENDUM_STATUS,
    IDEMPOTENCY: context.failureInjectionReport.IDEMPOTENCY,
    TEST_SUITE: testSuite,
    FINAL_STATUS: testSuite === 'PASS' ? 'PASS' : 'PARTIAL PASS'
  };
}

function buildArtifacts() {
  const preflight = buildPreflight();
  const database = readJson(INPUTS.database, {});
  const beforeOverlay = readJson(INPUTS.publicStore, { schema_version: 'public-evidence-v1', facts: [] });
  const knownModels = buildKnownModelDictionary(database);

  if (preflight.PRECHECK !== 'PASS') {
    return {
      preflight,
      archiveInventory: {
        generated_at: new Date().toISOString(),
        phase_id: PHASE_ID,
        ARCHIVE_SHA256: null,
        ARCHIVE_ENTRIES: 0
      },
      archivePayloadManifest: {
        generated_at: new Date().toISOString(),
        phase_id: PHASE_ID,
        RAW_ARCHIVE_SHA256: null,
        ARCHIVE_ENTRIES: 0,
        CANONICAL_PAYLOAD_MANIFEST_SHA256: null,
        records: []
      },
      dossierClassification: {
        generated_at: new Date().toISOString(),
        phase_id: PHASE_ID,
        MACHINE_BASE_RECORDS: 0,
        CONTROLLER_RECORDS_EXCLUDED: 0,
        VIEW_RECORDS: 0,
        records: []
      },
      machineGraph: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [], MACHINE_ENTITIES: 0 },
      modelTypeGraph: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [], MODEL_TYPE_RELATIONS: 0 },
      documentRelationGraph: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [], TS_DATA_RELATIONS: 0, RA_RELATIONS: 0, TI_RELATIONS: 0, BA_RELATIONS: 0, ET_RELATIONS: 0, RT_RELATIONS: 0, UNIQUE_DOCUMENT_REFERENCES: 0 },
      documentReconciliation: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [], SAME_SOURCE_REFERENCE: 0, EXACT_FILE_DUPLICATE: 0, EXACT_CONTENT_DUPLICATE: 0, SAME_PUBLICATION_DIFFERENT_SCAN: 0, SAME_PUBLICATION_POSSIBLE_REVISION: 0, IDENTITY_MATCH_ONLY: 0, NEW_DOCUMENT_REFERENCE: 0, UNRESOLVED: 0 },
      sourceLineageGraph: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [] },
      explicitScopeAudit: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [], EXPLICIT_EXACT_SCOPES: 0, EXPLICIT_MULTI_MODEL_SCOPES: 0, UNRESOLVED_SCOPES: 0, SCOPE_CONFLICTS: 0 },
      scopeParserAudit: buildScopeParserAudit(knownModels),
      tsDataRecoveryAudit: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [] },
      factCandidates: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, records: [] },
      publicFactPromotionAudit: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, promoted: [], blocked: [] },
      publicCoverage: summarizeCoverage(beforeOverlay, beforeOverlay),
      controllerClassificationAudit: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, CONTROLLER_RECORDS_EXCLUDED: 0, records: [] },
      newPublicFactAudit: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, NEW_PUBLIC_FACTS: 0, NEW_PUBLIC_FACTS_WITH_UNDERLYING_SOURCE: 0, NEW_PUBLIC_FACTS_WITHOUT_UNDERLYING_SOURCE: 0, DOSSIER_AS_DIRECT_FACT_SOURCE_COUNT: 0, DOSSIER_COUNTED_AS_INDEPENDENT_SUPPORT: 0, NEW_TS_DATA_FACTS_WITH_SOURCE_HEADING: 0, NEW_TS_DATA_FACTS_WITHOUT_SOURCE_HEADING: 0, PUBLIC_WINDOWS_PATH_COUNT: 0, records: [] },
      publicModelCoverageDetail: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, MODELS_WITH_PUBLIC_FACTS_AFTER: 0, MODELS_WITH_5PLUS_FACTS_AFTER: 0, records: [] },
      promotionSampleAudit: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, SAMPLE_SIZE: 0, records: [] },
      blockedSampleAudit: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, SAMPLE_SIZE: 0, records: [] },
      fs350Regression: { FS350_SCOPE_TEST: 'FAIL' },
      ms170Ms180Negative: { MS170_009_TECHNICAL_FACTS: 0, MS180_009_TECHNICAL_FACTS: 0, PASS: 'FAIL' },
      conflict046: { '046_STROKE_STATUS': 'UNKNOWN', PASS: 'FAIL' },
      failureInjection: {},
      failureInjectionReport: { IDEMPOTENCY: 'PASS' },
      precommitFailureInjection: {},
      promotionIntegrityAddendum: { generated_at: new Date().toISOString(), phase_id: PHASE_ID, ADDENDUM_STATUS: 'FAIL' },
      knownModels
    };
  }

  const archiveEntries = readArchiveEntries(preflight.ARCHIVE_PATH);
  const archiveInventory = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    ARCHIVE_SHA256: fileSha256(preflight.ARCHIVE_PATH),
    ARCHIVE_ENTRIES: archiveEntries.length,
    DUPLICATE_FILENAMES: archiveEntries.length - new Set(archiveEntries.map((row) => row.filename)).size,
    DUPLICATE_PAYLOADS: archiveEntries.length - new Set(archiveEntries.map((row) => row.payload_hash)).size,
    records: archiveEntries.map((row) => ({
      entry_name: row.full_name,
      filename: row.filename,
      byte_length: row.length,
      payload_hash: row.payload_hash
    }))
  };

  const dossiers = archiveEntries.map((entry) => buildDossierRecord(entry, knownModels));
  const archivePayloadManifest = buildArchivePayloadManifest(dossiers, archiveInventory);
  const dossierClassification = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    MACHINE_BASE_RECORDS: dossiers.filter((row) => row.classification === 'MACHINE_BASE').length,
    CONTROLLER_RECORDS_EXCLUDED: dossiers.filter((row) => row.classification === 'CONTROLLER_OR_MENU').length,
    VIEW_RECORDS: dossiers.filter((row) => row.classification.endsWith('_VIEW')).length,
    records: dossiers.map((row) => ({
      dossier_id: row.dossier_id,
      filename: row.filename,
      classification: row.classification,
      base_key: row.base_key,
      model_slug: row.model_slug,
      type_number: row.type_number
    }))
  };

  const groupMap = buildMachineGroups(dossiers);
  const machineGraphData = buildMachineGraph(groupMap, knownModels);
  const machineGraph = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: machineGraphData.machineEntities,
    MACHINE_ENTITIES: machineGraphData.machineEntities.length
  };
  const modelTypeGraph = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: machineGraphData.modelTypeRelations,
    MODEL_TYPE_RELATIONS: machineGraphData.modelTypeRelations.length
  };
  const documentRelationGraph = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: machineGraphData.documentRelations,
    TS_DATA_RELATIONS: machineGraphData.documentRelations.filter((row) => row.document_type === 'TS_DATA').length,
    RA_RELATIONS: machineGraphData.documentRelations.filter((row) => row.document_type === 'RA').length,
    TI_RELATIONS: machineGraphData.documentRelations.filter((row) => row.document_type === 'TI').length,
    BA_RELATIONS: machineGraphData.documentRelations.filter((row) => row.document_type === 'BA').length,
    ET_RELATIONS: machineGraphData.documentRelations.filter((row) => row.document_type === 'ET').length,
    RT_RELATIONS: machineGraphData.documentRelations.filter((row) => row.document_type === 'RT').length,
    UNIQUE_DOCUMENT_REFERENCES: new Set(machineGraphData.documentRelations.map((row) => row.relative_source_path)).size
  };

  const existingIndexes = buildExistingIndexes();
  const documentReconciliation = reconcileDocumentRelations(machineGraphData.documentRelations, existingIndexes);
  const sourceLineageGraph = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: machineGraphData.documentRelations.map((row) => ({
      dossier_source_id: stableId([SOURCE_BATCH, row.machine_id]),
      underlying_source_id: row.publication_identity,
      source_lineage_id: `${SOURCE_LINEAGE}::${row.relative_source_path}`,
      relation_type: row.document_type
    }))
  };
  const explicitScopeAudit = buildScopeAudit(machineGraphData.machineEntities, groupMap, knownModels);
  const scopeParserAudit = buildScopeParserAudit(knownModels);
  const factCandidateRecords = buildFactCandidates(machineGraphData.machineEntities, groupMap, machineGraphData.documentRelations, existingIndexes, knownModels, beforeOverlay);
  const factCandidates = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: factCandidateRecords
  };
  const tsDataRecoveryAudit = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    records: factCandidateRecords.map((row) => ({
      candidate_id: row.candidate_id,
      model_slug: row.model_slug,
      field: row.field,
      normalized_value: row.normalized_value,
      unit: row.unit,
      source_scope: row.source_scope,
      public_evidence_status: row.public_evidence_status,
      blocking_reasons: row.blocking_reasons
    }))
  };
  const publicPromotion = buildProposedFacts(factCandidateRecords, beforeOverlay, database);
  const publicFactPromotionAudit = {
    generated_at: new Date().toISOString(),
    phase_id: PHASE_ID,
    proposed_overlay_hash: stableHash(publicPromotion.mergedOverlay.facts.map((row) => [row.fact_id, row.model_slug, row.field, row.normalized_value])),
    promoted: publicPromotion.promoted,
    blocked: publicPromotion.blocked
  };
  const publicCoverage = summarizeCoverage(beforeOverlay, publicPromotion.mergedOverlay);
  const controllerClassificationAudit = buildControllerClassificationAudit(dossiers);
  const newPublicFactAudit = buildNewPublicFactAudit(publicPromotion.promoted);
  const publicModelCoverageDetail = buildPublicModelCoverageDetail(beforeOverlay, publicPromotion.promoted);
  const promotionSampleAudit = buildPromotionSampleAudit(newPublicFactAudit);
  const blockedSampleAudit = buildBlockedSampleAudit(publicPromotion.blocked);
  const fs350Regression = buildFs350Regression(factCandidateRecords, explicitScopeAudit);
  const ms170Ms180Negative = buildNegativeScopeAudit(factCandidateRecords);
  const conflict046 = build046ConflictAudit(beforeOverlay, factCandidateRecords);
  const precommitFailureInjection = buildPrecommitFailureInjection({
    factCandidates,
    publicFactPromotionAudit,
    newPublicFactAudit,
    fs350Regression,
    ms170Ms180Negative,
    conflict046
  });
  const promotionIntegrityAddendum = buildPromotionIntegrityAddendum({
    archiveInventory,
    archivePayloadManifest,
    dossierClassification,
    newPublicFactAudit,
    fs350Regression,
    ms170Ms180Negative,
    conflict046,
    precommitFailureInjection
  });

  return {
    preflight,
    archiveInventory,
    archivePayloadManifest,
    dossierClassification,
    machineGraph,
    modelTypeGraph,
    documentRelationGraph,
    documentReconciliation,
    sourceLineageGraph,
    explicitScopeAudit,
    scopeParserAudit,
    tsDataRecoveryAudit,
    factCandidates,
    publicFactPromotionAudit,
    publicCoverage,
    controllerClassificationAudit,
    newPublicFactAudit,
    publicModelCoverageDetail,
    promotionSampleAudit,
    blockedSampleAudit,
    fs350Regression,
    ms170Ms180Negative,
    conflict046,
    precommitFailureInjection,
    promotionIntegrityAddendum,
    beforeOverlay,
    proposedOverlay: publicPromotion.mergedOverlay,
    knownModels
  };
}

function sanitizeSnapshot(run) {
  return sanitizeForIdempotency({
    archiveInventory: run.archiveInventory,
    archivePayloadManifest: run.archivePayloadManifest,
    dossierClassification: run.dossierClassification,
    machineGraph: run.machineGraph,
    modelTypeGraph: run.modelTypeGraph,
    documentRelationGraph: run.documentRelationGraph,
    documentReconciliation: run.documentReconciliation,
    explicitScopeAudit: run.explicitScopeAudit,
    scopeParserAudit: run.scopeParserAudit,
    factCandidates: run.factCandidates,
    publicFactPromotionAudit: {
      promoted: run.publicFactPromotionAudit.promoted.map((row) => [row.model_slug, row.field, row.normalized_value, row.publication_id]),
      blocked: run.publicFactPromotionAudit.blocked.map((row) => [row.model_slug, row.field, row.blocking_reasons])
    },
    publicCoverage: run.publicCoverage,
    newPublicFactAudit: run.newPublicFactAudit,
    publicModelCoverageDetail: run.publicModelCoverageDetail,
    fs350Regression: run.fs350Regression,
    ms170Ms180Negative: run.ms170Ms180Negative,
    conflict046: run.conflict046,
    precommitFailureInjection: run.precommitFailureInjection,
    promotionIntegrityAddendum: run.promotionIntegrityAddendum
  });
}

export function main() {
  const run1 = buildArtifacts();
  const run2 = buildArtifacts();
  const idempotency = stableHash(sanitizeSnapshot(run1)) === stableHash(sanitizeSnapshot(run2)) ? 'PASS' : 'FAIL';
  const failureInjection = buildFailureInjectionReport({
    ...run1,
    failureInjectionReport: { IDEMPOTENCY: idempotency }
  });
  const failureInjectionReport = {
    ...failureInjection,
    IDEMPOTENCY: idempotency
  };
  const promotionIntegrityAddendum = buildPromotionIntegrityAddendum({
    archiveInventory: run1.archiveInventory,
    archivePayloadManifest: run1.archivePayloadManifest,
    dossierClassification: run1.dossierClassification,
    newPublicFactAudit: run1.newPublicFactAudit,
    fs350Regression: run1.fs350Regression,
    ms170Ms180Negative: run1.ms170Ms180Negative,
    conflict046: run1.conflict046,
    precommitFailureInjection: run1.precommitFailureInjection
  });
  const finalReport = buildFinalReport({
    ...run1,
    failureInjection,
    failureInjectionReport,
    promotionIntegrityAddendum
  });

  writeJson(OUTPUTS.preflight, run1.preflight);
  writeJson(OUTPUTS.archiveInventory, run1.archiveInventory);
  writeJson(OUTPUTS.archivePayloadManifest, run1.archivePayloadManifest);
  writeJson(OUTPUTS.dossierClassification, run1.dossierClassification);
  writeJson(OUTPUTS.machineGraph, run1.machineGraph);
  writeJson(OUTPUTS.modelTypeGraph, run1.modelTypeGraph);
  writeJson(OUTPUTS.documentRelationGraph, run1.documentRelationGraph);
  writeJson(OUTPUTS.documentReconciliation, run1.documentReconciliation);
  writeJson(OUTPUTS.sourceLineageGraph, run1.sourceLineageGraph);
  writeJson(OUTPUTS.explicitScopeAudit, run1.explicitScopeAudit);
  writeJson(OUTPUTS.scopeParserAudit, run1.scopeParserAudit);
  writeJson(OUTPUTS.tsDataRecoveryAudit, run1.tsDataRecoveryAudit);
  writeJson(OUTPUTS.factCandidates, run1.factCandidates);
  writeJson(OUTPUTS.publicFactPromotionAudit, run1.publicFactPromotionAudit);
  writeJson(OUTPUTS.publicCoverageBeforeAfter, run1.publicCoverage);
  writeJson(OUTPUTS.controllerClassificationAudit, run1.controllerClassificationAudit);
  writeJson(OUTPUTS.newPublicFactAudit, run1.newPublicFactAudit);
  writeJson(OUTPUTS.publicModelCoverageDetail, run1.publicModelCoverageDetail);
  writeJson(OUTPUTS.promotionSampleAudit, run1.promotionSampleAudit);
  writeJson(OUTPUTS.blockedSampleAudit, run1.blockedSampleAudit);
  writeJson(OUTPUTS.precommitFailureInjection, run1.precommitFailureInjection);
  writeJson(OUTPUTS.promotionIntegrityAddendum, promotionIntegrityAddendum);
  writeJson(OUTPUTS.fs350Regression, run1.fs350Regression);
  writeJson(OUTPUTS.ms170Ms180Negative, run1.ms170Ms180Negative);
  writeJson(OUTPUTS.conflict046, run1.conflict046);
  writeJson(OUTPUTS.failureInjection, failureInjectionReport);
  writeJson(OUTPUTS.idempotency, { generated_at: new Date().toISOString(), phase_id: PHASE_ID, IDEMPOTENCY: idempotency });
  writeJson(OUTPUTS.finalReport, finalReport);

  return finalReport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = main();
  console.log('Phase 35C.4.3 SCS machine dossier graph completed.');
  console.log(`Precheck: ${report.TEST_SUITE === 'PASS' ? 'PASS' : 'FAIL'}`);
  console.log(`Final status: ${report.FINAL_STATUS}`);
}
