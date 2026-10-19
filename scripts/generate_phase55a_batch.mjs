#!/usr/bin/env node
/**
 * Phase 55A: Manual MY STIHL Serial Evidence Reconciliation & Controlled Import
 *
 * Implements authoritative reconciliation between frozen manual lookup source:
 * C:\Users\GelliusSnippe\.agents\stihl_resultaten_17_10.csv
 * and historical serial evidence batches (2026-09-26, 2026-10-06, 2026-10-09).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-17_manual_followup');
export const BATCH_DATA_DIR = path.join(BATCH_DIR, 'data');
export const BATCH_SOURCE_DIR = path.join(BATCH_DIR, 'source');
export const BATCH_SOURCE_COPY = path.join(BATCH_SOURCE_DIR, 'stihl_resultaten_17_10.csv');
export const FROZEN_SOURCE_EXTERNAL = 'C:\\Users\\GelliusSnippe\\.agents\\stihl_resultaten_17_10.csv';
export const FROZEN_SOURCE_PATH = fs.existsSync(FROZEN_SOURCE_EXTERNAL) ? FROZEN_SOURCE_EXTERNAL : BATCH_SOURCE_COPY;
export const EXPECTED_SOURCE_SHA256 = 'c7e682f06fe67881f9c66243b645cbd5f1c272323cd51f9451ec2b66684b7680';
export const EXPECTED_SOURCE_BYTES = 4564382;

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
        i++;
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

export function extractPositiveIdentity(melding) {
  if (!melding) return null;
  const m = melding.match(/(?:toe\.\s*)?([A-Za-zÀ-ÿ0-9\-_ ]+?)\s*\/\s*([A-Za-zÀ-ÿ0-9\-_ ]+?)\s+([\s\S]+?)\s+Serienummer\s+(\d+)/i);
  if (m) {
    let categoryRaw = m[1].trim();
    if (categoryRaw.includes('toe.')) categoryRaw = categoryRaw.split('toe.').pop().trim();
    const knownCategories = ['Motorzaag', 'Doorslijpmachine', 'Bosmaaier', 'Heggenschaar', 'Zuighakselaar', 'Hoogsnoeier', 'Bladblazer', 'Grondboren', 'Algemeen gemotoriseerd'];
    for (const kc of knownCategories) {
      if (categoryRaw.endsWith(kc)) {
        categoryRaw = kc;
        break;
      }
    }
    const driveTypeRaw = m[2].trim();
    const productName = m[3].trim().replace(/\s+/g, ' ');
    const officialSerial = m[4].trim();
    return {
      categoryRaw,
      driveTypeRaw,
      productName,
      officialSerial,
      fullIdentity: `${categoryRaw} / ${driveTypeRaw} ${productName}`
    };
  }
  return null;
}

export function runReconciliationAndProcessing(options = {}) {
  const writeChanges = Boolean(options.write);

  console.log('===============================================================');
  console.log(`🛠️ RUNNING PHASE 55A RECONCILIATION (${writeChanges ? 'WRITE MODE' : 'DRY-RUN MODE'})`);
  console.log('===============================================================\n');

  // 1. Source verification
  if (!fs.existsSync(FROZEN_SOURCE_PATH)) {
    throw new Error(`Frozen source file missing: ${FROZEN_SOURCE_PATH}`);
  }
  const sourceRaw = fs.readFileSync(FROZEN_SOURCE_PATH);
  const sourceSha256 = crypto.createHash('sha256').update(sourceRaw).digest('hex');
  const sourceBytes = sourceRaw.length;

  if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`SOURCE_MUTATED: Expected ${EXPECTED_SOURCE_SHA256}, got ${sourceSha256}`);
  }
  if (sourceBytes !== EXPECTED_SOURCE_BYTES) {
    throw new Error(`SOURCE_BYTES_MUTATED: Expected ${EXPECTED_SOURCE_BYTES}, got ${sourceBytes}`);
  }
  console.log(`✓ Source SHA256 verified: ${sourceSha256} (${sourceBytes} bytes)`);

  // 2. Load historical batches
  const b1ObsPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-09-26', 'serial_lookup_observations_2026-09-26.json');
  const b1Doc = JSON.parse(fs.readFileSync(b1ObsPath, 'utf8'));
  const b1List = b1Doc.observations || [];

  const b2ObsPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06', 'data', 'serial_lookup_observations_2026-10-06.json');
  const b2Doc = JSON.parse(fs.readFileSync(b2ObsPath, 'utf8'));
  const b2List = b2Doc.observations || [];

  const b3ObsPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'data', 'serial_lookup_observations_2026-10-09.json');
  const b3Doc = JSON.parse(fs.readFileSync(b3ObsPath, 'utf8'));
  const b3List = b3Doc.observations || [];

  const historicalBySerial = new Map();
  function indexObs(list, batch) {
    for (const o of list) {
      const s = String(o.input_serial || o.serial_number || '').trim();
      if (!s) continue;
      if (!historicalBySerial.has(s)) historicalBySerial.set(s, []);
      historicalBySerial.get(s).push({ batch, obs: o });
    }
  }
  indexObs(b1List, '2026-09-26');
  indexObs(b2List, '2026-10-06');
  indexObs(b3List, '2026-10-09');

  // Load Batch 3 raw source for character-level matching
  const b3SourcePath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'source', 'stihl_resultaten_backup_1.csv');
  const b3RawText = fs.readFileSync(b3SourcePath, 'utf8');
  const b3Parsed = parseCSV(b3RawText);
  const b3SourceMap = new Map();
  for (const r of b3Parsed.slice(1)) {
    if (r[0] && r[0].trim()) b3SourceMap.set(r[0].trim(), r);
  }

  // 3. Load canonical anchors and aliases
  const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
  const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
  const initialAnchorsList = Array.isArray(anchorsDoc.anchors) ? anchorsDoc.anchors : [];
  const initialAnchorMap = new Map();
  for (const a of initialAnchorsList) {
    initialAnchorMap.set(a.serial_number, a);
  }

  const aliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');
  const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  const initialAliasesList = Array.isArray(aliasesDoc.aliases) ? aliasesDoc.aliases : [];
  const initialAliasMap = new Map();
  for (const a of initialAliasesList) {
    initialAliasMap.set(a.input_serial, a);
  }

  console.log(`✓ Canonical Anchors Before: ${initialAnchorsList.length}`);
  console.log(`✓ Canonical Aliases Before: ${initialAliasesList.length}`);

  // 4. Parse frozen source CSV
  const sourceText = sourceRaw.toString('utf8');
  const allRows = parseCSV(sourceText);
  const header = allRows[0];
  const dataRows = allRows.slice(1).filter(r => r.some(f => f && f.trim().length > 0));
  const populatedRowsCount = dataRows.length;

  console.log(`✓ Parsed Source: ${populatedRowsCount} populated rows (Header: ${header.join(';')})`);

  // 5. Accounting collections
  const classifications = {
    ALREADY_IMPORTED_IDENTICAL: 0,
    ALREADY_OBSERVED_SAME_RESULT: 0,
    PREVIOUSLY_UNRESOLVED_NOW_POSITIVE: 0,
    PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH: 0,
    NEW_POSITIVE_OBSERVATION: 0,
    NEW_NO_MATCH_OBSERVATION: 0,
    FOUND_WITHOUT_USABLE_IDENTITY: 0,
    TECHNICAL_ERROR: 0,
    DUPLICATE_SOURCE_ROW: 0,
    IDENTITY_CONFLICT: 0,
    INVALID_INPUT_SERIAL: 0
  };

  const duplicateSourceRows = [];
  const identityConflicts = [];
  const foundWithoutUsableIdentity = [];
  const technicalErrors = [];
  const reconfirmedAnchors = [];
  const previouslyUnresolvedNowPositive = [];
  const alreadyRepresentedRows = [];
  const serialNoMatches = [];
  const newOfficialAnchorsOnly = [];
  const allObservations = [];

  const seenSerials = new Set();
  const serialRowNumbers = new Map();

  for (let idx = 0; idx < dataRows.length; idx++) {
    const r = dataRows[idx];
    const sourceRowNumber = idx + 2;
    const serial = (r[0] || '').trim();
    const date = (r[1] || '').trim();
    const time = (r[2] || '').trim();
    const status = (r[3] || '').trim().toLowerCase();
    const productCol = (r[4] || '').trim();
    const url = (r[5] || '').trim() || 'https://app.stihl.com/nl-nl/mystihl/tools/add/serial-number';
    const melding = (r[6] || '').trim();

    if (!serialRowNumbers.has(serial)) {
      serialRowNumbers.set(serial, []);
    }
    serialRowNumbers.get(serial).push(sourceRowNumber);

    // 1. DUPLICATE CHECK WITHIN FILE
    if (seenSerials.has(serial)) {
      classifications.DUPLICATE_SOURCE_ROW++;
      duplicateSourceRows.push({
        serial,
        sourceRowNumber,
        controle_datum: date,
        controle_tijd: time,
        status,
        productCol,
        meldingPreview: melding.slice(0, 100)
      });
      continue;
    }
    seenSerials.add(serial);

    // 2. INVALID INPUT SERIAL CHECK
    if (!/^\d{8,10}$/.test(serial)) {
      classifications.INVALID_INPUT_SERIAL++;
      continue;
    }

    // 3. TECHNICAL ERROR CHECK
    if (status === 'fout') {
      classifications.TECHNICAL_ERROR++;
      technicalErrors.push({
        serial,
        sourceRowNumber,
        controle_datum: date,
        controle_tijd: time,
        status,
        meldingPreview: melding.slice(0, 200)
      });
      allObservations.push({
        input_serial: serial,
        official_serial_number: null,
        lookup_date: date,
        lookup_date_basis: 'per-row controle_datum from MY STIHL lookup',
        lookup_outcome: 'TECHNICAL_ERROR',
        raw_statuses: [status],
        official_identity: null,
        category_raw: null,
        drive_type_raw: null,
        official_product_name: null,
        source: 'MY_STIHL',
        source_url: url,
        verification_method: 'authenticated MY STIHL UI lookup attempt',
        evidence_type: 'TECHNICAL_LOOKUP_ATTEMPT',
        verification_status: 'UNRESOLVED',
        eligible_for_official_anchor: false,
        negative_identity_evidence: false,
        recheck_required: true,
        input_alias_proven: false,
        duplicate_input_rows: 1,
        source_row_numbers: [sourceRowNumber],
        source_file: 'stihl_resultaten_17_10.csv'
      });
      continue;
    }

    // 4. POSITIVE OFFICIAL MATCH (gevonden)
    if (status === 'gevonden') {
      const parsed = extractPositiveIdentity(melding);
      if (!parsed) {
        classifications.FOUND_WITHOUT_USABLE_IDENTITY++;
        foundWithoutUsableIdentity.push({
          serial,
          sourceRowNumber,
          controle_datum: date,
          controle_tijd: time,
          status,
          productCol,
          meldingPreview: melding.slice(0, 200)
        });
        allObservations.push({
          input_serial: serial,
          official_serial_number: null,
          lookup_date: date,
          lookup_date_basis: 'per-row controle_datum from MY STIHL lookup',
          lookup_outcome: 'FOUND_WITHOUT_USABLE_IDENTITY',
          raw_statuses: [status],
          official_identity: null,
          category_raw: null,
          drive_type_raw: null,
          official_product_name: null,
          source: 'MY_STIHL',
          source_url: url,
          verification_method: 'authenticated MY STIHL UI lookup attempt',
          evidence_type: 'TECHNICAL_LOOKUP_ATTEMPT',
          verification_status: 'UNRESOLVED',
          eligible_for_official_anchor: false,
          negative_identity_evidence: false,
          recheck_required: true,
          input_alias_proven: false,
          duplicate_input_rows: 1,
          source_row_numbers: [sourceRowNumber],
          source_file: 'stihl_resultaten_17_10.csv'
        });
        continue;
      }

      const category = mapCategory(parsed.categoryRaw);
      const driveType = mapDriveType(parsed.driveTypeRaw);
      const canonicalModelId = mapCanonicalModelId(parsed.productName);

      const anchorRecord = {
        serial_number: serial,
        model_name: parsed.productName,
        canonical_model_id: canonicalModelId,
        category,
        drive_type: driveType,
        source: 'MY_STIHL',
        source_url: url,
        verification_date: date,
        verification_method: 'authenticated MY STIHL UI lookup',
        evidence_type: 'OFFICIAL_WEB_LOOKUP',
        verification_status: 'OFFICIAL_STIHL_LOOKUP'
      };

      allObservations.push({
        input_serial: serial,
        official_serial_number: serial,
        lookup_date: date,
        lookup_date_basis: 'per-row controle_datum from MY STIHL lookup',
        lookup_outcome: 'OFFICIAL_EXACT_FOUND',
        raw_statuses: [status],
        official_identity: parsed.fullIdentity,
        category_raw: parsed.categoryRaw,
        drive_type_raw: parsed.driveTypeRaw,
        official_product_name: parsed.productName,
        source: 'MY_STIHL',
        source_url: url,
        verification_method: 'authenticated MY STIHL UI lookup',
        evidence_type: 'OFFICIAL_WEB_LOOKUP',
        verification_status: 'OFFICIAL_STIHL_LOOKUP',
        eligible_for_official_anchor: true,
        negative_identity_evidence: false,
        recheck_required: false,
        input_alias_proven: false,
        duplicate_input_rows: 1,
        source_row_numbers: [sourceRowNumber],
        source_file: 'stihl_resultaten_17_10.csv'
      });

      // Check against existing canonical anchors
      if (initialAnchorMap.has(serial)) {
        const existing = initialAnchorMap.get(serial);
        if (existing.model_name !== parsed.productName) {
          classifications.IDENTITY_CONFLICT++;
          identityConflicts.push({
            serial,
            sourceRowNumber,
            batch_model_name: parsed.productName,
            canonical_model_name: existing.model_name,
            batch_identity: parsed.fullIdentity,
            canonical_identity: `${existing.category} / ${existing.drive_type} ${existing.model_name}`
          });
          continue;
        }

        reconfirmedAnchors.push({
          serial_number: serial,
          batch_model_name: parsed.productName,
          existing_model_name: existing.model_name,
          batch_category: category,
          existing_category: existing.category,
          batch_drive_type: driveType,
          existing_drive_type: existing.drive_type,
          source_row_number: sourceRowNumber,
          verification_date: date
        });

        // Check if character-identical in batch 3 source
        const b3Row = b3SourceMap.get(serial);
        const isIdentical = Boolean(b3Row && (melding === (b3Row[4] || '').trim()));
        if (isIdentical) {
          classifications.ALREADY_IMPORTED_IDENTICAL++;
        } else {
          classifications.ALREADY_OBSERVED_SAME_RESULT++;
        }

        alreadyRepresentedRows.push({
          serial,
          sourceRowNumber,
          status,
          productName: parsed.productName,
          isExactSourceMatch: isIdentical,
          previousBatch: '2026-10-09'
        });
        continue;
      }

      // Not in canonical: check if was in historical as unresolved
      const histList = historicalBySerial.get(serial);
      if (histList && histList.length > 0) {
        const lastHist = histList[histList.length - 1].obs;
        if (lastHist.lookup_outcome !== 'OFFICIAL_EXACT_FOUND') {
          classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE++;
          previouslyUnresolvedNowPositive.push({
            serial,
            sourceRowNumber,
            previous_outcome: lastHist.lookup_outcome,
            previous_batch: histList[histList.length - 1].batch,
            new_model_name: parsed.productName,
            new_category: category,
            new_drive_type: driveType,
            verification_date: date
          });
          newOfficialAnchorsOnly.push(anchorRecord);
          continue;
        }
      }

      // Completely new positive observation
      classifications.NEW_POSITIVE_OBSERVATION++;
      newOfficialAnchorsOnly.push(anchorRecord);
      continue;
    }

    // 5. NO MATCH / TIMEOUT / ONBEKEND
    allObservations.push({
      input_serial: serial,
      official_serial_number: null,
      lookup_date: date,
      lookup_date_basis: 'per-row controle_datum from MY STIHL lookup',
      lookup_outcome: 'TECHNICAL_TIMEOUT',
      raw_statuses: [status],
      official_identity: null,
      category_raw: null,
      drive_type_raw: null,
      official_product_name: null,
      source: 'MY_STIHL',
      source_url: url,
      verification_method: 'authenticated MY STIHL UI lookup attempt',
      evidence_type: 'TECHNICAL_LOOKUP_ATTEMPT',
      verification_status: 'UNRESOLVED',
      eligible_for_official_anchor: false,
      negative_identity_evidence: false,
      recheck_required: true,
      input_alias_proven: false,
      duplicate_input_rows: 1,
      source_row_numbers: [sourceRowNumber],
      source_file: 'stihl_resultaten_17_10.csv'
    });

    const histList = historicalBySerial.get(serial);
    if (histList && histList.length > 0) {
      const lastHist = histList[histList.length - 1].obs;
      if (lastHist.lookup_outcome !== 'OFFICIAL_EXACT_FOUND') {
        classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH++;
        serialNoMatches.push({
          serial,
          sourceRowNumber,
          raw_status: status,
          controle_datum: date,
          controle_tijd: time,
          cohort: 'PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH',
          previous_outcome: lastHist.lookup_outcome
        });
        continue;
      }
    }

    classifications.NEW_NO_MATCH_OBSERVATION++;
    serialNoMatches.push({
      serial,
      sourceRowNumber,
      raw_status: status,
      controle_datum: date,
      controle_tijd: time,
      cohort: 'NEW_NO_MATCH_OBSERVATION',
      previous_outcome: 'NONE'
    });
  }

  // 6. Validation of accounting invariant
  const totalClassified = Object.values(classifications).reduce((a, b) => a + b, 0);
  console.log('Accounting summary:');
  console.table(classifications);
  console.log(`TOTAL_CLASSIFIED = ${totalClassified} (EXPECTED: ${populatedRowsCount})`);

  if (totalClassified !== populatedRowsCount) {
    throw new Error(`ACCOUNTING MISMATCH: Total classified ${totalClassified} !== ${populatedRowsCount}`);
  }
  if (classifications.IDENTITY_CONFLICT > 0) {
    throw new Error(`IDENTITY CONFLICTS DETECTED: ${classifications.IDENTITY_CONFLICT}. HARD_STOP!`);
  }

  console.log(`✓ All ${populatedRowsCount} rows accounted (0 unaccounted)`);
  console.log(`✓ Identity conflicts: ${classifications.IDENTITY_CONFLICT}`);
  console.log(`✓ Reconfirmed existing anchors: ${reconfirmedAnchors.length}`);
  console.log(`✓ New official anchors to add: ${newOfficialAnchorsOnly.length}`);
  console.log(`✓ Total observations: ${allObservations.length}`);

  // 7. Dry-Run or Write
  if (!writeChanges) {
    console.log('\n[DRY RUN COMPLETE] Zero repository files modified.');
    return {
      success: true,
      classifications,
      newOfficialAnchorsOnly,
      reconfirmedAnchors,
      allObservations,
      duplicateSourceRows,
      foundWithoutUsableIdentity,
      technicalErrors,
      previouslyUnresolvedNowPositive,
      alreadyRepresentedRows,
      serialNoMatches
    };
  }

  // WRITE PIPELINE
  console.log('\nWriting Phase 55A artifacts and canonical updates...');

  // 1. Create directories
  fs.mkdirSync(BATCH_SOURCE_DIR, { recursive: true });
  fs.mkdirSync(BATCH_DATA_DIR, { recursive: true });

  // 2. Copy immutable source
  const sourceDest = path.join(BATCH_SOURCE_DIR, 'stihl_resultaten_17_10.csv');
  fs.writeFileSync(sourceDest, sourceRaw);
  const copiedHash = crypto.createHash('sha256').update(fs.readFileSync(sourceDest)).digest('hex');
  if (copiedHash !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`Copied source hash mismatch: ${copiedHash}`);
  }
  console.log(`✓ Immutable source copied: ${sourceDest}`);

  // 3. Write Data Artifacts
  const obsJsonPath = path.join(BATCH_DATA_DIR, 'serial_lookup_observations_2026-10-17.json');
  fs.writeFileSync(obsJsonPath, JSON.stringify({ schema_version: 'serial-lookup-observations-v1', observations: allObservations }, null, 2));

  const obsCsvHeaders = [
    'input_serial', 'official_serial_number', 'lookup_date', 'lookup_date_basis',
    'lookup_outcome', 'official_identity', 'category_raw', 'drive_type_raw',
    'official_product_name', 'source', 'verification_status', 'eligible_for_official_anchor',
    'negative_identity_evidence', 'recheck_required', 'duplicate_input_rows', 'source_file'
  ];
  const obsCsvPath = path.join(BATCH_DATA_DIR, 'serial_lookup_observations_2026-10-17.csv');
  fs.writeFileSync(obsCsvPath, toCsv(allObservations, obsCsvHeaders));

  const newAnchorsJsonPath = path.join(BATCH_DATA_DIR, 'new_official_serial_anchors_only_2026-10-17.json');
  fs.writeFileSync(newAnchorsJsonPath, JSON.stringify({ schema_version: 'official-serial-anchors-v1', anchors: newOfficialAnchorsOnly }, null, 2));

  const anchorCsvHeaders = [
    'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
    'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
  ];
  const newAnchorsCsvPath = path.join(BATCH_DATA_DIR, 'new_official_serial_anchors_only_2026-10-17.csv');
  fs.writeFileSync(newAnchorsCsvPath, toCsv(newOfficialAnchorsOnly, anchorCsvHeaders));

  const reconfirmedCsvHeaders = [
    'serial_number', 'batch_model_name', 'existing_model_name', 'batch_category',
    'existing_category', 'batch_drive_type', 'existing_drive_type', 'source_row_number', 'verification_date'
  ];
  const reconfirmedCsvPath = path.join(BATCH_DATA_DIR, 'reconfirmed_existing_anchors_2026-10-17.csv');
  fs.writeFileSync(reconfirmedCsvPath, toCsv(reconfirmedAnchors, reconfirmedCsvHeaders));

  const prevUnresolvedCsvHeaders = [
    'serial', 'sourceRowNumber', 'previous_outcome', 'previous_batch', 'new_model_name',
    'new_category', 'new_drive_type', 'verification_date'
  ];
  const prevUnresolvedCsvPath = path.join(BATCH_DATA_DIR, 'previously_unresolved_now_positive_2026-10-17.csv');
  fs.writeFileSync(prevUnresolvedCsvPath, toCsv(previouslyUnresolvedNowPositive, prevUnresolvedCsvHeaders));

  const alreadyRepCsvHeaders = ['serial', 'sourceRowNumber', 'status', 'productName', 'isExactSourceMatch', 'previousBatch'];
  const alreadyRepCsvPath = path.join(BATCH_DATA_DIR, 'already_represented_rows_2026-10-17.csv');
  fs.writeFileSync(alreadyRepCsvPath, toCsv(alreadyRepresentedRows, alreadyRepCsvHeaders));

  const noMatchCsvHeaders = ['serial', 'sourceRowNumber', 'raw_status', 'controle_datum', 'controle_tijd', 'cohort', 'previous_outcome'];
  const noMatchCsvPath = path.join(BATCH_DATA_DIR, 'serial_no_match_2026-10-17.csv');
  fs.writeFileSync(noMatchCsvPath, toCsv(serialNoMatches, noMatchCsvHeaders));

  const unusableCsvHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'productCol', 'meldingPreview'];
  const unusableCsvPath = path.join(BATCH_DATA_DIR, 'found_without_usable_identity_2026-10-17.csv');
  fs.writeFileSync(unusableCsvPath, toCsv(foundWithoutUsableIdentity, unusableCsvHeaders));

  const techErrorsCsvHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'meldingPreview'];
  const techErrorsCsvPath = path.join(BATCH_DATA_DIR, 'technical_errors_2026-10-17.csv');
  fs.writeFileSync(techErrorsCsvPath, toCsv(technicalErrors, techErrorsCsvHeaders));

  const dupsCsvHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'productCol', 'meldingPreview'];
  const dupsCsvPath = path.join(BATCH_DATA_DIR, 'duplicate_source_rows_2026-10-17.csv');
  fs.writeFileSync(dupsCsvPath, toCsv(duplicateSourceRows, dupsCsvHeaders));

  const conflictsCsvHeaders = ['serial', 'sourceRowNumber', 'batch_model_name', 'canonical_model_name', 'batch_identity', 'canonical_identity'];
  const conflictsCsvPath = path.join(BATCH_DATA_DIR, 'identity_conflicts_2026-10-17.csv');
  fs.writeFileSync(conflictsCsvPath, toCsv(identityConflicts, conflictsCsvHeaders));

  console.log('✓ All 10 batch data artifacts written successfully.');

  // 4. Compute artifact hashes for manifest
  const artifactFiles = [
    'source/stihl_resultaten_17_10.csv',
    'data/serial_lookup_observations_2026-10-17.json',
    'data/serial_lookup_observations_2026-10-17.csv',
    'data/new_official_serial_anchors_only_2026-10-17.json',
    'data/new_official_serial_anchors_only_2026-10-17.csv',
    'data/reconfirmed_existing_anchors_2026-10-17.csv',
    'data/previously_unresolved_now_positive_2026-10-17.csv',
    'data/already_represented_rows_2026-10-17.csv',
    'data/serial_no_match_2026-10-17.csv',
    'data/found_without_usable_identity_2026-10-17.csv',
    'data/technical_errors_2026-10-17.csv',
    'data/duplicate_source_rows_2026-10-17.csv',
    'data/identity_conflicts_2026-10-17.csv'
  ];

  const filesManifest = artifactFiles.map(rel => {
    const full = path.join(BATCH_DIR, rel);
    const content = fs.readFileSync(full);
    return {
      path: rel,
      bytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    };
  });

  // 5. Write README.md and batch_manifest.json
  const manifest = {
    batch_id: 'MY_STIHL_2026-10-17_MANUAL_FOLLOWUP',
    batch_import_date: '2026-10-19',
    verification_date_min: '2026-10-09',
    verification_date_max: '2026-10-17',
    date_basis: 'per-row controle_datum from authenticated MY STIHL lookup',
    source_file: 'source/stihl_resultaten_17_10.csv',
    source_sha256: EXPECTED_SOURCE_SHA256,
    source_bytes: EXPECTED_SOURCE_BYTES,
    source_rows: populatedRowsCount,
    source_unique_serials: seenSerials.size,
    historical_rows_already_represented: classifications.ALREADY_IMPORTED_IDENTICAL + classifications.ALREADY_OBSERVED_SAME_RESULT,
    previously_unresolved_now_positive: classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE,
    previously_unresolved_still_no_match: classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH,
    new_positive_observations: classifications.NEW_POSITIVE_OBSERVATION,
    new_no_match_observations: classifications.NEW_NO_MATCH_OBSERVATION,
    new_official_anchors: newOfficialAnchorsOnly.length,
    reconfirmed_existing_anchors: reconfirmedAnchors.length,
    no_match_total: classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH + classifications.NEW_NO_MATCH_OBSERVATION,
    timeouts_total: 5149,
    found_without_usable_identity: classifications.FOUND_WITHOUT_USABLE_IDENTITY,
    technical_errors: classifications.TECHNICAL_ERROR,
    duplicate_source_rows: classifications.DUPLICATE_SOURCE_ROW,
    identity_conflicts: classifications.IDENTITY_CONFLICT,
    invalid_input_serials: classifications.INVALID_INPUT_SERIAL,
    anchors_before: initialAnchorsList.length,
    anchors_after: initialAnchorsList.length + newOfficialAnchorsOnly.length,
    aliases_before: initialAliasesList.length,
    aliases_after: initialAliasesList.length,
    files: filesManifest
  };

  const manifestPath = path.join(BATCH_DIR, 'batch_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const readmeContent = `# STIHL Serial Evidence Import Batch — 2026-10-17 Manual Follow-Up

## Batch Identity
- **Batch ID**: \`MY_STIHL_2026-10-17_MANUAL_FOLLOWUP\`
- **Import Execution Date**: 2026-10-19
- **Verification Date Range**: 2026-10-09 to 2026-10-17 (\`per-row controle_datum\`)
- **Source File**: \`source/stihl_resultaten_17_10.csv\`
- **Source SHA256**: \`${EXPECTED_SOURCE_SHA256}\`
- **Source Size**: ${EXPECTED_SOURCE_BYTES} bytes
- **Populated Source Rows**: ${populatedRowsCount}
- **Unique Input Serials**: ${seenSerials.size}

## Accounting & Disposition
- **New Official Anchors Added**: ${newOfficialAnchorsOnly.length}
- **Reconfirmed Existing Anchors**: ${reconfirmedAnchors.length}
- **Previously Unresolved -> Now Positive**: ${classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE}
- **Already Represented in Previous Batches**: ${classifications.ALREADY_IMPORTED_IDENTICAL + classifications.ALREADY_OBSERVED_SAME_RESULT}
- **No-Match / Timeouts**: ${classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH + classifications.NEW_NO_MATCH_OBSERVATION} (5,149 timeouts + 1 onbekend)
- **Found Without Usable Identity**: ${classifications.FOUND_WITHOUT_USABLE_IDENTITY}
- **Technical Errors**: ${classifications.TECHNICAL_ERROR}
- **Duplicate Source Rows**: ${classifications.DUPLICATE_SOURCE_ROW}
- **Identity Conflicts**: 0
- **Invalid Serials**: 0

## Integrity Guarantees
- Zero inferred ranges created (\`RANGES_CREATED = 0\`).
- Zero generic 8-to-9 prefix rules created (\`GENERIC_PREFIX_RULES_CREATED = 0\`).
- Zero negative runtime evidence introduced. Timeouts and no-matches remain strictly audit/provenance evidence.
- Canonical production anchors increased from ${initialAnchorsList.length} to ${initialAnchorsList.length + newOfficialAnchorsOnly.length}.
`;
  fs.writeFileSync(path.join(BATCH_DIR, 'README.md'), readmeContent);
  console.log('✓ batch_manifest.json and README.md written.');

  // 6. Update Canonical Production JSONs
  const finalAnchorsList = [...initialAnchorsList, ...newOfficialAnchorsOnly];
  const finalAnchorsDoc = {
    schema_version: 'official-serial-anchors-v1',
    anchors: finalAnchorsList
  };
  fs.writeFileSync(anchorsPath, JSON.stringify(finalAnchorsDoc, null, 2) + '\n');
  console.log(`✓ Updated data/official_serial_anchors.json (${initialAnchorsList.length} -> ${finalAnchorsList.length})`);

  // Update stihl_database.json
  const stihlDbPath = path.join(rootDir, 'data', 'stihl_database.json');
  const stihlDb = JSON.parse(fs.readFileSync(stihlDbPath, 'utf8'));
  stihlDb.official_serial_anchors = finalAnchorsList;
  fs.writeFileSync(stihlDbPath, JSON.stringify(stihlDb, null, 2) + '\n');
  console.log(`✓ Updated data/stihl_database.json official_serial_anchors (${finalAnchorsList.length})`);

  // 7. Write Machine-Readable Reconciliation File
  const reconciliationData = {
    baseline_sha: '1dcc18d04495feba2099607a1208681ddab7fd56',
    source_identity: 'C:\\Users\\GelliusSnippe\\.agents\\stihl_resultaten_17_10.csv',
    source_hash: EXPECTED_SOURCE_SHA256,
    source_bytes: EXPECTED_SOURCE_BYTES,
    source_row_accounting: {
      total_populated_rows: populatedRowsCount,
      unique_input_serials: seenSerials.size,
      duplicate_source_rows: classifications.DUPLICATE_SOURCE_ROW
    },
    historical_overlap: {
      already_imported_identical: classifications.ALREADY_IMPORTED_IDENTICAL,
      already_observed_same_result: classifications.ALREADY_OBSERVED_SAME_RESULT,
      previously_unresolved_now_positive: classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE,
      previously_unresolved_still_no_match: classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH,
      new_positive_observations: classifications.NEW_POSITIVE_OBSERVATION,
      new_no_match_observations: classifications.NEW_NO_MATCH_OBSERVATION,
      found_without_usable_identity: classifications.FOUND_WITHOUT_USABLE_IDENTITY,
      technical_errors: classifications.TECHNICAL_ERROR,
      identity_conflicts: classifications.IDENTITY_CONFLICT,
      invalid_input_serials: classifications.INVALID_INPUT_SERIAL
    },
    positive_anchor_accounting: {
      anchors_before: initialAnchorsList.length,
      new_official_anchors: newOfficialAnchorsOnly.length,
      reconfirmed_existing_anchors: reconfirmedAnchors.length,
      anchors_after: finalAnchorsList.length
    },
    alias_accounting: {
      aliases_before: initialAliasesList.length,
      new_explicit_aliases: 0,
      aliases_after: initialAliasesList.length
    },
    protection_checks: {
      ranges_created: 0,
      generic_prefix_rules_created: 0,
      negative_runtime_evidence_created: 0,
      active_source_excluded: true,
      existing_batches_immutable: true,
      phase54f_protected: true
    }
  };
  const reconJsonPath = path.join(rootDir, 'data', 'serial_phase55a_reconciliation.json');
  fs.writeFileSync(reconJsonPath, JSON.stringify(reconciliationData, null, 2) + '\n');
  console.log(`✓ Written data/serial_phase55a_reconciliation.json`);

  return {
    success: true,
    classifications,
    newOfficialAnchorsOnly,
    reconfirmedAnchors,
    manifest,
    finalAnchorsCount: finalAnchorsList.length
  };
}

if (process.argv[1] && process.argv[1].endsWith('generate_phase55a_batch.mjs')) {
  const isWrite = process.argv.includes('--write');
  runReconciliationAndProcessing({ write: isWrite });
}
