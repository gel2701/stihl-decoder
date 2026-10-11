#!/usr/bin/env node
/**
 * Phase 53A MY STIHL Serial Evidence Batch Generator & Reproducibility Verifier
 *
 * Modes:
 * - Default / --verify: Verifies exact reproducibility from immutable source & pre-import baseline
 *   without mutating any repository files or databases.
 * - --rebuild: Explicit maintenance rebuild of batch artifacts and canonical files.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const KNOWN_SOURCE_SHA256 = '0987022cf96f48d392c348dcef5c5682a0177db69055ba3e4b7552d07bf3579b';
export const KNOWN_SOURCE_BYTES = 8377145;
export const KNOWN_PRE_IMPORT_BASELINE_SHA256 = '8c1a7684e5f6ef69452afc7b86c4c3c94a0e4a799f0f30092cfd6aa7cfb98d4b';
export const KNOWN_PRE_IMPORT_BASELINE_ANCHORS = 2845;

export const DEFAULT_SOURCE_CSV = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'source', 'stihl_resultaten_backup_1.csv');
export const DEFAULT_BASELINE_JSON = path.join(rootDir, 'data', 'reproducibility', 'phase53a', 'official_serial_anchors_pre_phase53a.json');
export const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09');
export const BATCH_DATA_DIR = path.join(BATCH_DIR, 'data');

export function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  
  return rows;
}

export function mapCategory(rawCat) {
  switch (rawCat) {
    case 'Motorzaag': return 'Kettingzaag';
    case 'Doorslijpmachine': return 'Doorslijper';
    case 'Bosmaaier': return 'Bosmaaier';
    case 'Heggenschaar': return 'Heggenschaar';
    case 'Zuighakselaar': return 'Zuighakselaar';
    case 'Hoogsnoeier': return 'Hoogsnoeier';
    case 'Bladblazer': return 'Bladblazer';
    case 'Grondboren': return 'Grondboren';
    case 'Algemeen gemotoriseerd': return 'Algemeen gemotoriseerd';
    default: return rawCat || null;
  }
}

export function mapDriveType(rawDrive) {
  switch (rawDrive) {
    case 'Benzine': return 'Benzine';
    case 'Elektrisch': return 'Elektrisch';
    default: return rawDrive || null;
  }
}

export function mapCanonicalModelId(productName) {
  if (productName === 'MS 440-Z 3/8" RIM Magnum Motorsäge') {
    return 'stihl_ms_440';
  }
  return null;
}

export function toCsv(records, headers) {
  const lines = [headers.join(',')];
  for (const r of records) {
    const line = headers.map(h => {
      const val = r[h] !== undefined && r[h] !== null ? String(r[h]) : '';
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes(';')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',');
    lines.push(line);
  }
  return lines.join('\n') + '\n';
}

export function runBatchProcessing(options = {}) {
  const sourcePath = options.sourcePath || DEFAULT_SOURCE_CSV;
  const baselinePath = options.baselinePath || DEFAULT_BASELINE_JSON;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source CSV not found at: ${sourcePath}`);
  }
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Pre-import baseline JSON not found at: ${baselinePath}`);
  }

  // 1. Validate Source
  const sourceRaw = fs.readFileSync(sourcePath);
  const sourceSha256 = crypto.createHash('sha256').update(sourceRaw).digest('hex');
  const sourceBytes = sourceRaw.length;

  if (sourceSha256 !== KNOWN_SOURCE_SHA256) {
    throw new Error(`Source SHA256 mismatch! Expected ${KNOWN_SOURCE_SHA256}, got ${sourceSha256}`);
  }
  if (sourceBytes !== KNOWN_SOURCE_BYTES) {
    throw new Error(`Source byte size mismatch! Expected ${KNOWN_SOURCE_BYTES}, got ${sourceBytes}`);
  }

  // 2. Validate Baseline
  const baselineRaw = fs.readFileSync(baselinePath);
  const baselineSha256 = crypto.createHash('sha256').update(baselineRaw).digest('hex');
  const baselineDoc = JSON.parse(baselineRaw.toString('utf8'));
  const baselineAnchors = baselineDoc.anchors;

  if (baselineSha256 !== KNOWN_PRE_IMPORT_BASELINE_SHA256) {
    throw new Error(`Pre-import baseline SHA256 mismatch! Expected ${KNOWN_PRE_IMPORT_BASELINE_SHA256}, got ${baselineSha256}`);
  }
  if (baselineAnchors.length !== KNOWN_PRE_IMPORT_BASELINE_ANCHORS) {
    throw new Error(`Pre-import baseline anchors count mismatch! Expected ${KNOWN_PRE_IMPORT_BASELINE_ANCHORS}, got ${baselineAnchors.length}`);
  }

  const existingAnchorMap = new Map();
  for (const a of baselineAnchors) {
    existingAnchorMap.set(a.serial_number, a);
  }

  // 3. Parse CSV Rows
  const allRows = parseCSV(sourceRaw.toString('utf8'));
  const header = allRows[0];
  const dataRows = allRows.slice(1).filter(r => r[0] && r[0].trim().length > 0);

  // 4. Group rows by unique input serial
  const uniqueInputMap = new Map();
  const duplicateRowsList = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const r = dataRows[idx];
    const sourceRowNumber = idx + 2;
    const serial = r[0].trim();
    const rawStatus = (r[1] || '').trim();
    const productField = (r[2] || '').trim();
    const url = (r[3] || '').trim() || 'https://app.stihl.com/nl-nl/mystihl/tools/add/serial-number';
    const melding = (r[4] || '').trim();

    const record = {
      sourceRowNumber,
      serial,
      rawStatus,
      productField,
      url,
      melding
    };

    if (!uniqueInputMap.has(serial)) {
      uniqueInputMap.set(serial, []);
    }
    uniqueInputMap.get(serial).push(record);
  }

  const batchDate = '2026-10-09';
  const batchDateBasis = 'batch import/upload date; source CSV has no per-row timestamp';

  const observations = [];
  const allPositiveAnchorsBatch = [];
  const newAnchorsOnly = [];
  const reconfirmedAnchors = [];
  const recheckQueue = [];

  for (const [serial, rows] of uniqueInputMap.entries()) {
    const isDuplicate = rows.length > 1;
    if (isDuplicate) {
      for (const dRow of rows) {
        duplicateRowsList.push({
          serial,
          sourceRowNumber: dRow.sourceRowNumber,
          status: dRow.rawStatus,
          meldingPreview: dRow.melding.slice(0, 100)
        });
      }
    }

    let positiveRow = null;
    let timeoutRow = null;
    let errorRow = null;
    let emptyIdentityRow = null;

    for (const row of rows) {
      const statusLower = row.rawStatus.toLowerCase();
      if (statusLower === 'gevonden') {
        const match = row.melding.match(/(?:toe\.\s*)?([A-Za-zÀ-ÿ0-9\-_ ]+?)\s*\/\s*([A-Za-zÀ-ÿ0-9\-_ ]+?)\s+([\s\S]+?)\s+Serienummer\s+(\d+)/i);
        if (match) {
          let categoryRaw = match[1].trim();
          if (categoryRaw.includes('toe.')) categoryRaw = categoryRaw.split('toe.').pop().trim();
          const driveTypeRaw = match[2].trim();
          const productName = match[3].trim().replace(/\s+/g, ' ');
          positiveRow = {
            ...row,
            categoryRaw,
            driveTypeRaw,
            productName,
            fullIdentity: `${categoryRaw} / ${driveTypeRaw} ${productName}`
          };
        } else {
          emptyIdentityRow = row;
        }
      } else if (statusLower === 'time-out') {
        timeoutRow = row;
      } else if (statusLower === 'fout') {
        errorRow = row;
      }
    }

    if (positiveRow) {
      const category = mapCategory(positiveRow.categoryRaw);
      const driveType = mapDriveType(positiveRow.driveTypeRaw);
      const canonicalModelId = mapCanonicalModelId(positiveRow.productName);

      const anchorRecord = {
        serial_number: serial,
        model_name: positiveRow.productName,
        canonical_model_id: canonicalModelId,
        category,
        drive_type: driveType,
        source: 'MY_STIHL',
        source_url: positiveRow.url,
        verification_date: batchDate,
        verification_method: 'authenticated MY STIHL UI lookup',
        evidence_type: 'OFFICIAL_WEB_LOOKUP',
        verification_status: 'OFFICIAL_STIHL_LOOKUP'
      };

      allPositiveAnchorsBatch.push(anchorRecord);

      if (existingAnchorMap.has(serial)) {
        const existing = existingAnchorMap.get(serial);
        reconfirmedAnchors.push({
          serial_number: serial,
          batch_model_name: positiveRow.productName,
          existing_model_name: existing.model_name,
          batch_category: category,
          existing_category: existing.category,
          batch_drive_type: driveType,
          existing_drive_type: existing.drive_type,
          source_row_numbers: rows.map(r => r.sourceRowNumber).join(';')
        });
      } else {
        newAnchorsOnly.push(anchorRecord);
      }

      observations.push({
        input_serial: serial,
        official_serial_number: serial,
        lookup_date: batchDate,
        lookup_date_basis: batchDateBasis,
        lookup_outcome: 'OFFICIAL_EXACT_FOUND',
        raw_statuses: rows.map(r => r.rawStatus),
        official_identity: positiveRow.fullIdentity,
        category_raw: positiveRow.categoryRaw,
        drive_type_raw: positiveRow.driveTypeRaw,
        official_product_name: positiveRow.productName,
        source: 'MY_STIHL',
        source_url: positiveRow.url,
        verification_method: 'authenticated MY STIHL UI lookup',
        evidence_type: 'OFFICIAL_WEB_LOOKUP',
        verification_status: 'OFFICIAL_STIHL_LOOKUP',
        eligible_for_official_anchor: true,
        negative_identity_evidence: false,
        recheck_required: false,
        input_alias_proven: false,
        duplicate_input_rows: rows.length,
        source_row_numbers: rows.map(r => r.sourceRowNumber),
        source_file: 'stihl_resultaten_backup_1.csv'
      });
    } else if (emptyIdentityRow) {
      recheckQueue.push({
        input_serial: serial,
        reason: 'FOUND_WITHOUT_USABLE_IDENTITY',
        raw_statuses: rows.map(r => r.rawStatus).join(';'),
        source_row_numbers: rows.map(r => r.sourceRowNumber).join(';')
      });
      observations.push({
        input_serial: serial,
        official_serial_number: null,
        lookup_date: batchDate,
        lookup_date_basis: batchDateBasis,
        lookup_outcome: 'FOUND_WITHOUT_USABLE_IDENTITY',
        raw_statuses: rows.map(r => r.rawStatus),
        official_identity: null,
        category_raw: null,
        drive_type_raw: null,
        official_product_name: null,
        source: 'MY_STIHL',
        source_url: emptyIdentityRow.url,
        verification_method: 'authenticated MY STIHL UI lookup attempt',
        evidence_type: 'TECHNICAL_LOOKUP_ATTEMPT',
        verification_status: 'UNRESOLVED',
        eligible_for_official_anchor: false,
        negative_identity_evidence: false,
        recheck_required: true,
        input_alias_proven: false,
        duplicate_input_rows: rows.length,
        source_row_numbers: rows.map(r => r.sourceRowNumber),
        source_file: 'stihl_resultaten_backup_1.csv'
      });
    } else if (timeoutRow) {
      recheckQueue.push({
        input_serial: serial,
        reason: 'TECHNICAL_TIMEOUT',
        raw_statuses: rows.map(r => r.rawStatus).join(';'),
        source_row_numbers: rows.map(r => r.sourceRowNumber).join(';')
      });
      observations.push({
        input_serial: serial,
        official_serial_number: null,
        lookup_date: batchDate,
        lookup_date_basis: batchDateBasis,
        lookup_outcome: 'TECHNICAL_TIMEOUT',
        raw_statuses: rows.map(r => r.rawStatus),
        official_identity: null,
        category_raw: null,
        drive_type_raw: null,
        official_product_name: null,
        source: 'MY_STIHL',
        source_url: timeoutRow.url,
        verification_method: 'authenticated MY STIHL UI lookup attempt',
        evidence_type: 'TECHNICAL_LOOKUP_ATTEMPT',
        verification_status: 'UNRESOLVED',
        eligible_for_official_anchor: false,
        negative_identity_evidence: false,
        recheck_required: true,
        input_alias_proven: false,
        duplicate_input_rows: rows.length,
        source_row_numbers: rows.map(r => r.sourceRowNumber),
        source_file: 'stihl_resultaten_backup_1.csv'
      });
    } else if (errorRow) {
      recheckQueue.push({
        input_serial: serial,
        reason: 'TECHNICAL_ERROR',
        raw_statuses: rows.map(r => r.rawStatus).join(';'),
        source_row_numbers: rows.map(r => r.sourceRowNumber).join(';')
      });
      observations.push({
        input_serial: serial,
        official_serial_number: null,
        lookup_date: batchDate,
        lookup_date_basis: batchDateBasis,
        lookup_outcome: 'TECHNICAL_ERROR',
        raw_statuses: rows.map(r => r.rawStatus),
        official_identity: null,
        category_raw: null,
        drive_type_raw: null,
        official_product_name: null,
        source: 'MY_STIHL',
        source_url: errorRow.url,
        verification_method: 'authenticated MY STIHL UI lookup attempt',
        evidence_type: 'TECHNICAL_LOOKUP_ATTEMPT',
        verification_status: 'UNRESOLVED',
        eligible_for_official_anchor: false,
        negative_identity_evidence: false,
        recheck_required: true,
        input_alias_proven: false,
        duplicate_input_rows: rows.length,
        source_row_numbers: rows.map(r => r.sourceRowNumber),
        source_file: 'stihl_resultaten_backup_1.csv'
      });
    }
  }

  // Merged anchors with baseline
  const mergedAnchorsMap = new Map();
  for (const a of baselineAnchors) {
    mergedAnchorsMap.set(a.serial_number, a);
  }
  for (const a of newAnchorsOnly) {
    mergedAnchorsMap.set(a.serial_number, a);
  }
  const finalAnchorsList = [...mergedAnchorsMap.values()].sort((a, b) => a.serial_number.localeCompare(b.serial_number));

  return {
    sourceBytes,
    sourceSha256,
    baselineAnchorsCount: baselineAnchors.length,
    totalSourceRows: allRows.length,
    populatedDataRows: dataRows.length,
    uniqueInputSerialsCount: uniqueInputMap.size,
    allPositiveAnchorsBatch,
    newAnchorsOnly,
    reconfirmedAnchors,
    recheckQueue,
    duplicateRowsList,
    observations,
    finalAnchorsList
  };
}

export const OBS_CSV_HEADERS = [
  'input_serial', 'official_serial_number', 'lookup_date', 'lookup_date_basis',
  'lookup_outcome', 'official_identity', 'category_raw', 'drive_type_raw',
  'official_product_name', 'source', 'verification_status', 'eligible_for_official_anchor',
  'negative_identity_evidence', 'recheck_required', 'duplicate_input_rows', 'source_file'
];

export const NEW_ANCHORS_CSV_HEADERS = [
  'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
  'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
];

export const RECONFIRMED_CSV_HEADERS = [
  'serial_number', 'batch_model_name', 'existing_model_name', 'batch_category',
  'existing_category', 'batch_drive_type', 'existing_drive_type', 'source_row_numbers'
];

export const RECHECK_CSV_HEADERS = [
  'input_serial', 'reason', 'raw_statuses', 'source_row_numbers'
];

export const DUPLICATE_CSV_HEADERS = [
  'serial', 'sourceRowNumber', 'status', 'meldingPreview'
];

export const REBUILD_CANONICAL_WRITES = 0;
export const SQLITE_RESEED_FROM_PHASE53A_REBUILD = 'NO';

function valuesEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function validateBatchManifest(batchDir = BATCH_DIR) {
  const manifestPath = path.join(batchDir, 'batch_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return {
      success: false,
      mismatches: [`Manifest missing: ${manifestPath}`],
      fileCount: 0
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const mismatches = [];

  for (const f of manifest.files || []) {
    const fullPath = path.join(batchDir, f.path);
    if (!fs.existsSync(fullPath)) {
      mismatches.push(`Manifest file missing: ${f.path}`);
      continue;
    }
    const buf = fs.readFileSync(fullPath);
    if (buf.length !== f.bytes) {
      mismatches.push(`Manifest byte size mismatch for ${f.path}: disk has ${buf.length} vs manifest ${f.bytes}`);
    }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== f.sha256) {
      mismatches.push(`Manifest SHA256 mismatch for ${f.path}: disk has ${sha} vs manifest ${f.sha256}`);
    }
  }

  return {
    success: mismatches.length === 0,
    mismatches,
    fileCount: manifest.files ? manifest.files.length : 0
  };
}

export function verifyReproducibility(options = {}) {
  const sourcePath = options.sourcePath || DEFAULT_SOURCE_CSV;
  const baselinePath = options.baselinePath || DEFAULT_BASELINE_JSON;
  const batchDir = options.batchDir || BATCH_DIR;
  const batchDataDir = options.batchDataDir || BATCH_DATA_DIR;
  const throwOnError = Boolean(options.throwOnError);
  const isCli = process.argv[1] && process.argv[1].endsWith('generate_phase53a_batch.mjs');

  console.log('===============================================================');
  console.log('🔍 PHASE 53A REPRODUCIBILITY VERIFICATION (IDEMPOTENT / VERIFY MODE)');
  console.log('===============================================================\n');

  console.log(`Loading immutable source: ${sourcePath}`);
  console.log(`Loading immutable baseline: ${baselinePath}`);

  const errors = [];

  // 1. Validate batch_manifest.json hashes and byte sizes
  console.log('\n--- 1. Validating batch_manifest.json File Integrity ---');
  const manifestResult = validateBatchManifest(batchDir);
  if (!manifestResult.success) {
    for (const m of manifestResult.mismatches) {
      console.error(`❌ ${m}`);
      errors.push(m);
    }
  } else {
    console.log(`  ✓ All ${manifestResult.fileCount} manifest files verified with exact byte sizes and SHA256 hashes.`);
  }

  // 2. In-memory batch reconstruction from immutable source and pre-import baseline
  console.log('\n--- 2. In-Memory Batch Reconstruction ---');
  const computed = runBatchProcessing({
    sourcePath,
    baselinePath
  });

  console.log('  Source Data Rows:              ', computed.populatedDataRows);
  console.log('  Unique Input Serials:          ', computed.uniqueInputSerialsCount);
  console.log('  Safe Official Exact (Batch):   ', computed.allPositiveAnchorsBatch.length);
  console.log('  Reconfirmed Existing:          ', computed.reconfirmedAnchors.length);
  console.log('  New Official Anchors Added:    ', computed.newAnchorsOnly.length);
  console.log('  Recheck Queue Total:           ', computed.recheckQueue.length);
  console.log('    - Technical Timeout:         ', computed.recheckQueue.filter(q => q.reason === 'TECHNICAL_TIMEOUT').length);
  console.log('    - Technical Error:           ', computed.recheckQueue.filter(q => q.reason === 'TECHNICAL_ERROR').length);
  console.log('    - Found w/o Usable Identity: ', computed.recheckQueue.filter(q => q.reason === 'FOUND_WITHOUT_USABLE_IDENTITY').length);
  console.log('  Duplicate Row Records:         ', computed.duplicateRowsList.length);
  console.log('  Final Cumulative Anchors:      ', computed.finalAnchorsList.length);

  // Assertion Checks
  const checks = [
    { label: 'Source rows === 6822', pass: computed.populatedDataRows === 6822 },
    { label: 'Unique inputs === 6820', pass: computed.uniqueInputSerialsCount === 6820 },
    { label: 'Safe official exact === 6031', pass: computed.allPositiveAnchorsBatch.length === 6031 },
    { label: 'Reconfirmed existing === 2', pass: computed.reconfirmedAnchors.length === 2 },
    { label: 'New official anchors === 6029', pass: computed.newAnchorsOnly.length === 6029 },
    { label: 'Recheck queue total === 789', pass: computed.recheckQueue.length === 789 },
    { label: 'Technical timeout === 736', pass: computed.recheckQueue.filter(q => q.reason === 'TECHNICAL_TIMEOUT').length === 736 },
    { label: 'Technical error === 34', pass: computed.recheckQueue.filter(q => q.reason === 'TECHNICAL_ERROR').length === 34 },
    { label: 'Found w/o identity === 19', pass: computed.recheckQueue.filter(q => q.reason === 'FOUND_WITHOUT_USABLE_IDENTITY').length === 19 },
    { label: 'Final cumulative anchors === 8874', pass: computed.finalAnchorsList.length === 8874 }
  ];

  for (const c of checks) {
    if (!c.pass) {
      const err = `Check failed: ${c.label}`;
      console.error(`❌ ${err}`);
      errors.push(err);
    } else {
      console.log(`  ✓ ${c.label}`);
    }
  }

  // 3. Exact Full Content Comparison for All Phase 53A Artifacts
  console.log('\n--- 3. Full Content & Exact Serialization Verification for Committed Artifacts ---');

  function verifyJsonArtifact(name, fileName, expectedDoc, arrayKey) {
    const filePath = path.join(batchDataDir, fileName);
    if (!fs.existsSync(filePath)) {
      const err = `Committed JSON artifact missing: ${fileName}`;
      console.error(`❌ ${err}`);
      errors.push(err);
      return;
    }
    const committedRaw = fs.readFileSync(filePath, 'utf8');
    let committedDoc;
    try {
      committedDoc = JSON.parse(committedRaw);
    } catch (e) {
      const err = `Artifact ${fileName} is invalid JSON: ${e.message}`;
      console.error(`❌ ${err}`);
      errors.push(err);
      return;
    }

    if (committedDoc.schema_version !== expectedDoc.schema_version) {
      const err = `Artifact ${fileName} schema_version mismatch: expected "${expectedDoc.schema_version}" vs committed "${committedDoc.schema_version}"`;
      console.error(`❌ ${err}`);
      errors.push(err);
    }

    const expArr = expectedDoc[arrayKey];
    const comArr = committedDoc[arrayKey];
    if (!Array.isArray(comArr)) {
      const err = `Artifact ${fileName} missing array property "${arrayKey}"`;
      console.error(`❌ ${err}`);
      errors.push(err);
      return;
    }

    if (expArr.length !== comArr.length) {
      const err = `Artifact ${fileName} array length mismatch: expected ${expArr.length} vs committed ${comArr.length}`;
      console.error(`❌ ${err}`);
      errors.push(err);
      return;
    }

    let itemMismatches = 0;
    for (let i = 0; i < expArr.length; i++) {
      const e = expArr[i];
      const c = comArr[i];
      for (const k of Object.keys(e)) {
        if (!valuesEqual(e[k], c[k])) {
          itemMismatches++;
          const err = `Artifact ${fileName} record ${i} property "${k}" mismatch: expected "${JSON.stringify(e[k])}" vs committed "${JSON.stringify(c[k])}"`;
          console.error(`❌ ${err}`);
          errors.push(err);
          if (itemMismatches >= 5) break;
        }
      }
      if (itemMismatches >= 5) break;
    }

    const expStr = JSON.stringify(expectedDoc, null, 2);
    if (expStr.replace(/\r\n/g, '\n') !== committedRaw.replace(/\r\n/g, '\n')) {
      const err = `Artifact ${fileName} serialization output mismatch`;
      console.error(`❌ ${err}`);
      errors.push(err);
    } else {
      console.log(`  ✓ Artifact ${fileName} full content & serialization match (${expArr.length} records).`);
    }
  }

  function verifyCsvArtifact(name, fileName, records, headers) {
    const filePath = path.join(batchDataDir, fileName);
    if (!fs.existsSync(filePath)) {
      const err = `Committed CSV artifact missing: ${fileName}`;
      console.error(`❌ ${err}`);
      errors.push(err);
      return;
    }
    const committedRaw = fs.readFileSync(filePath, 'utf8');
    const committedRows = parseCSV(committedRaw);
    const expStr = toCsv(records, headers);
    const expRows = parseCSV(expStr);

    if (committedRows.length !== expRows.length) {
      const err = `Artifact ${fileName} CSV row count mismatch: expected ${expRows.length} vs committed ${committedRows.length}`;
      console.error(`❌ ${err}`);
      errors.push(err);
      return;
    }

    let cellMismatches = 0;
    for (let r = 0; r < expRows.length; r++) {
      const er = expRows[r];
      const cr = committedRows[r];
      if (er.length !== cr.length) {
        const err = `Artifact ${fileName} CSV row ${r} column count mismatch: expected ${er.length} vs committed ${cr.length}`;
        console.error(`❌ ${err}`);
        errors.push(err);
        break;
      }
      for (let c = 0; c < er.length; c++) {
        if (er[c] !== cr[c]) {
          cellMismatches++;
          const colName = headers[c] || `col_${c}`;
          const err = `Artifact ${fileName} row ${r} (${colName}) mismatch: expected "${er[c]}" vs committed "${cr[c]}"`;
          console.error(`❌ ${err}`);
          errors.push(err);
          if (cellMismatches >= 5) break;
        }
      }
      if (cellMismatches >= 5) break;
    }

    if (expStr.replace(/\r\n/g, '\n') !== committedRaw.replace(/\r\n/g, '\n')) {
      const err = `Artifact ${fileName} CSV serialization output mismatch`;
      console.error(`❌ ${err}`);
      errors.push(err);
    } else {
      console.log(`  ✓ Artifact ${fileName} full CSV content & serialization match (${expRows.length} rows).`);
    }
  }

  // 1. official_serial_anchors_batch_2026-10-09.json
  verifyJsonArtifact(
    'Batch positive anchors JSON',
    'official_serial_anchors_batch_2026-10-09.json',
    { schema_version: 'official-serial-anchors-v1', anchors: computed.allPositiveAnchorsBatch },
    'anchors'
  );

  // 2. new_official_serial_anchors_only_2026-10-09.json
  verifyJsonArtifact(
    'New official anchors only JSON',
    'new_official_serial_anchors_only_2026-10-09.json',
    { schema_version: 'official-serial-anchors-v1', anchors: computed.newAnchorsOnly },
    'anchors'
  );

  // 3. serial_lookup_observations_2026-10-09.json
  verifyJsonArtifact(
    'Serial lookup observations JSON',
    'serial_lookup_observations_2026-10-09.json',
    { schema_version: 'serial-lookup-observations-v1', observations: computed.observations },
    'observations'
  );

  // 4. new_official_serial_anchors_only_2026-10-09.csv
  verifyCsvArtifact(
    'New official anchors only CSV',
    'new_official_serial_anchors_only_2026-10-09.csv',
    computed.newAnchorsOnly,
    NEW_ANCHORS_CSV_HEADERS
  );

  // 5. serial_lookup_observations_2026-10-09.csv
  verifyCsvArtifact(
    'Serial lookup observations CSV',
    'serial_lookup_observations_2026-10-09.csv',
    computed.observations,
    OBS_CSV_HEADERS
  );

  // 6. reconfirmed_existing_anchors_2026-10-09.csv
  verifyCsvArtifact(
    'Reconfirmed existing anchors CSV',
    'reconfirmed_existing_anchors_2026-10-09.csv',
    computed.reconfirmedAnchors,
    RECONFIRMED_CSV_HEADERS
  );

  // 7. serial_recheck_queue_2026-10-09.csv
  verifyCsvArtifact(
    'Serial recheck queue CSV',
    'serial_recheck_queue_2026-10-09.csv',
    computed.recheckQueue,
    RECHECK_CSV_HEADERS
  );

  // 8. duplicate_source_rows_2026-10-09.csv
  verifyCsvArtifact(
    'Duplicate source rows CSV',
    'duplicate_source_rows_2026-10-09.csv',
    computed.duplicateRowsList,
    DUPLICATE_CSV_HEADERS
  );

  if (errors.length > 0) {
    console.error(`\n❌ VERIFICATION FAILED with ${errors.length} mismatch(es).`);
    if (throwOnError) {
      throw new Error(`Verification failed with ${errors.length} mismatch(es):\n${errors.slice(0, 5).join('\n')}`);
    }
    if (isCli) {
      process.exit(1);
    }
    return { success: false, errors, computed, failedChecks: errors.length };
  }

  console.log('\n🎉 ALL REPRODUCIBILITY CHECKS PASSED PERFECTLY!');
  console.log('Zero repository files modified (Verify mode).');
  return { success: true, errors: [], computed, failedChecks: 0 };
}

export function rebuildBatchArtifacts(options = {}) {
  const batchDataDir = options.batchDataDir || BATCH_DATA_DIR;
  const sourcePath = options.sourcePath || DEFAULT_SOURCE_CSV;
  const baselinePath = options.baselinePath || DEFAULT_BASELINE_JSON;

  console.log('===============================================================');
  console.log('🛠️ REBUILDING PHASE 53A BATCH ARTIFACTS ONLY (ZERO CANONICAL WRITES)');
  console.log('===============================================================\n');

  // NOTE: Rebuild reconstructs historical Phase 53A batch artifacts ONLY.
  // It MUST NOT write to production canonical serial registries (data/official_serial_anchors.json,
  // data/stihl_database.json) or touch SQLite database (data/stihl_database.db).
  // Future post-Phase 53A anchors remain 100% untouched.

  const computed = runBatchProcessing({
    sourcePath,
    baselinePath
  });

  const obsJsonPath = path.join(batchDataDir, 'serial_lookup_observations_2026-10-09.json');
  fs.writeFileSync(obsJsonPath, JSON.stringify({ schema_version: 'serial-lookup-observations-v1', observations: computed.observations }, null, 2));

  const obsCsvPath = path.join(batchDataDir, 'serial_lookup_observations_2026-10-09.csv');
  fs.writeFileSync(obsCsvPath, toCsv(computed.observations, OBS_CSV_HEADERS));

  const batchAnchorsJsonPath = path.join(batchDataDir, 'official_serial_anchors_batch_2026-10-09.json');
  fs.writeFileSync(batchAnchorsJsonPath, JSON.stringify({ schema_version: 'official-serial-anchors-v1', anchors: computed.allPositiveAnchorsBatch }, null, 2));

  const newAnchorsJsonPath = path.join(batchDataDir, 'new_official_serial_anchors_only_2026-10-09.json');
  fs.writeFileSync(newAnchorsJsonPath, JSON.stringify({ schema_version: 'official-serial-anchors-v1', anchors: computed.newAnchorsOnly }, null, 2));

  const newAnchorsCsvPath = path.join(batchDataDir, 'new_official_serial_anchors_only_2026-10-09.csv');
  fs.writeFileSync(newAnchorsCsvPath, toCsv(computed.newAnchorsOnly, NEW_ANCHORS_CSV_HEADERS));

  const reconfirmedCsvPath = path.join(batchDataDir, 'reconfirmed_existing_anchors_2026-10-09.csv');
  fs.writeFileSync(reconfirmedCsvPath, toCsv(computed.reconfirmedAnchors, RECONFIRMED_CSV_HEADERS));

  const recheckCsvPath = path.join(batchDataDir, 'serial_recheck_queue_2026-10-09.csv');
  fs.writeFileSync(recheckCsvPath, toCsv(computed.recheckQueue, RECHECK_CSV_HEADERS));

  const duplicateCsvPath = path.join(batchDataDir, 'duplicate_source_rows_2026-10-09.csv');
  fs.writeFileSync(duplicateCsvPath, toCsv(computed.duplicateRowsList, DUPLICATE_CSV_HEADERS));

  console.log('✅ Batch Artifacts Rebuild Complete.');
  console.log(`   Target Directory: ${batchDataDir}`);
  console.log(`   Canonical Registry Writes: ${REBUILD_CANONICAL_WRITES}`);
  console.log(`   SQLite Reseed: ${SQLITE_RESEED_FROM_PHASE53A_REBUILD}`);

  return computed;
}

if (process.argv[1] && process.argv[1].endsWith('generate_phase53a_batch.mjs')) {
  const isRebuild = process.argv.includes('--rebuild');
  if (isRebuild) {
    rebuildBatchArtifacts();
  } else {
    verifyReproducibility();
  }
}
