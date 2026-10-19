#!/usr/bin/env node
/**
 * Phase 55A Extension: Additional Manual MY STIHL Serial Evidence Reconciliation & Controlled Import (Batch B)
 *
 * Implements authoritative reconciliation for the second manual lookup source:
 * data/import_batches/serials_2026-10-19_manual_followup/source/stihl_resultaten_3.csv
 * against all historical batches (2026-09-26, 2026-10-06, 2026-10-09),
 * Phase 55A Batch A (2026-10-17), and current canonical official serial anchors.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseCSV, toCsv, mapCategory, mapDriveType, mapCanonicalModelId, extractPositiveIdentity } from './generate_phase55a_batch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const BATCH_B_DIR = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-19_manual_followup');
export const BATCH_B_DATA_DIR = path.join(BATCH_B_DIR, 'data');
export const BATCH_B_SOURCE_DIR = path.join(BATCH_B_DIR, 'source');
export const BATCH_B_SOURCE_COPY = path.join(BATCH_B_SOURCE_DIR, 'stihl_resultaten_3.csv');
export const FROZEN_SOURCE_EXTERNAL = 'C:\\Users\\GelliusSnippe\\.agents\\stihl_resultaten.csv';
export const FROZEN_SOURCE_PATH = fs.existsSync(BATCH_B_SOURCE_COPY) ? BATCH_B_SOURCE_COPY : FROZEN_SOURCE_EXTERNAL;
export const EXPECTED_SOURCE_SHA256 = '523637fd45ae29b1b1d4256c208f3e744435b6b6baa701a963aa08d2098ba45c';
export const EXPECTED_SOURCE_BYTES = 8994337;

export function runBatchBReconciliationAndProcessing(options = {}) {
  const writeChanges = Boolean(options.write);

  console.log('===============================================================');
  console.log(`🛠️ RUNNING PHASE 55A BATCH B RECONCILIATION (${writeChanges ? 'WRITE MODE' : 'DRY-RUN MODE'})`);
  console.log('===============================================================\n');

  // 1. Source verification
  if (!fs.existsSync(FROZEN_SOURCE_PATH)) {
    throw new Error(`Frozen Batch B source file missing: ${FROZEN_SOURCE_PATH}`);
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

  const pre55aBySerial = new Map();
  function indexPre55a(list, batch) {
    for (const o of list) {
      const s = String(o.input_serial || o.serial_number || '').trim();
      if (!s) continue;
      if (!pre55aBySerial.has(s)) pre55aBySerial.set(s, []);
      pre55aBySerial.get(s).push({ batch, obs: o });
    }
  }
  indexPre55a(b1List, '2026-09-26');
  indexPre55a(b2List, '2026-10-06');
  indexPre55a(b3List, '2026-10-09');

  // Load Batch A observations
  const batchAObsPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-17_manual_followup', 'data', 'serial_lookup_observations_2026-10-17.json');
  const batchAObs = JSON.parse(fs.readFileSync(batchAObsPath, 'utf8')).observations || [];
  const batchAMap = new Map();
  for (const o of batchAObs) {
    batchAMap.set(o.input_serial, o);
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

  console.log(`✓ Canonical Anchors Before Batch B: ${initialAnchorsList.length}`);
  console.log(`✓ Canonical Aliases Before Batch B: ${initialAliasesList.length}`);

  // 4. Parse Batch B source CSV
  const sourceText = sourceRaw.toString('utf8');
  const allRows = parseCSV(sourceText);
  const header = allRows[0];
  const dataRows = allRows.slice(1).filter(r => r.some(f => f && f.trim().length > 0));
  const populatedRowsCount = dataRows.length; // 7103

  console.log(`✓ Parsed Batch B Source: ${populatedRowsCount} populated rows (Header: ${header.join(';')})`);

  // 5. Group rows by input serial
  const serialGroups = new Map();
  for (let idx = 0; idx < dataRows.length; idx++) {
    const r = dataRows[idx];
    const sourceRowNumber = idx + 2;
    const serial = (r[0] || '').trim();
    if (!serialGroups.has(serial)) {
      serialGroups.set(serial, []);
    }
    serialGroups.get(serial).push({ rowIdx: sourceRowNumber, r });
  }

  console.log(`✓ Unique Input Serials in Batch B: ${serialGroups.size}`);

  // 6. Accounting collections
  const classifications = {
    ALREADY_PRESENT_FROM_PRE55A: 0,
    ALREADY_PRESENT_FROM_PHASE55A_BATCH_A: 0,
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

  let crossBatchOverlapCount = 0;
  let crossBatchSamePositive = 0;
  let crossBatchTimeoutOverlap = 0;

  for (const [serial, rows] of serialGroups.entries()) {
    // Determine primary and duplicate rows
    let primary;
    const validPositives = rows.filter(x => x.r[3].trim().toLowerCase() === 'gevonden' && extractPositiveIdentity(x.r[6]));
    if (validPositives.length > 0) {
      primary = validPositives[validPositives.length - 1]; // latest timestamp
    } else {
      primary = rows[rows.length - 1];
    }
    const duplicates = rows.filter(x => x !== primary);

    // Record duplicates
    for (const dup of duplicates) {
      classifications.DUPLICATE_SOURCE_ROW++;
      const firstStatus = primary.r[3].trim().toLowerCase();
      const dupStatus = dup.r[3].trim().toLowerCase();

      let retryType = 'RETRY_SAME_RESULT';
      if (dupStatus === 'fout' && firstStatus === 'gevonden') {
        retryType = 'RETRY_CHANGED_FROM_ERROR_TO_POSITIVE';
      } else if (dupStatus === 'time-out' && firstStatus === 'gevonden') {
        retryType = 'RETRY_CHANGED_FROM_TIMEOUT_TO_POSITIVE';
      } else if (dup.r[6] === primary.r[6] && dup.r[1] === primary.r[1] && dup.r[2] === primary.r[2]) {
        retryType = 'IDENTICAL_DUPLICATE';
      }

      duplicateSourceRows.push({
        serial,
        sourceRowNumber: dup.rowIdx,
        controle_datum: (dup.r[1] || '').trim(),
        controle_tijd: (dup.r[2] || '').trim(),
        status: dupStatus,
        productCol: (dup.r[4] || '').trim(),
        retryType,
        meldingPreview: (dup.r[6] || '').trim().slice(0, 100)
      });
    }

    // Process primary row
    const r = primary.r;
    const sourceRowNumber = primary.rowIdx;
    const date = (r[1] || '').trim();
    const time = (r[2] || '').trim();
    const status = (r[3] || '').trim().toLowerCase();
    const productCol = (r[4] || '').trim();
    const url = (r[5] || '').trim() || 'https://app.stihl.com/nl-nl/mystihl/tools/add/serial-number';
    const melding = (r[6] || '').trim();

    // Check Batch A overlap
    if (batchAMap.has(serial)) {
      crossBatchOverlapCount++;
      const aObs = batchAMap.get(serial);
      if (aObs.lookup_outcome === 'OFFICIAL_EXACT_FOUND' && status === 'gevonden') {
        crossBatchSamePositive++;
      } else if (status === 'time-out') {
        crossBatchTimeoutOverlap++;
      }
    }

    // Invalid serial check
    if (!/^\d{8,10}$/.test(serial)) {
      classifications.INVALID_INPUT_SERIAL++;
      continue;
    }

    // Technical error check
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
        raw_statuses: rows.map(x => x.r[3].trim().toLowerCase()),
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
        duplicate_input_rows: rows.length,
        source_row_numbers: rows.map(x => x.rowIdx),
        source_file: 'stihl_resultaten_3.csv'
      });
      continue;
    }

    // Positive official match
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
          raw_statuses: rows.map(x => x.r[3].trim().toLowerCase()),
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
          duplicate_input_rows: rows.length,
          source_row_numbers: rows.map(x => x.rowIdx),
          source_file: 'stihl_resultaten_3.csv'
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
        raw_statuses: rows.map(x => x.r[3].trim().toLowerCase()),
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
        duplicate_input_rows: rows.length,
        source_row_numbers: rows.map(x => x.rowIdx),
        source_file: 'stihl_resultaten_3.csv'
      });

      // Check against current canonical anchors
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

        if (batchAMap.has(serial)) {
          classifications.ALREADY_PRESENT_FROM_PHASE55A_BATCH_A++;
          alreadyRepresentedRows.push({
            serial,
            sourceRowNumber,
            status,
            productName: parsed.productName,
            cohort: 'ALREADY_PRESENT_FROM_PHASE55A_BATCH_A',
            previousBatch: '2026-10-17'
          });
        } else if (pre55aBySerial.has(serial)) {
          classifications.ALREADY_PRESENT_FROM_PRE55A++;
          alreadyRepresentedRows.push({
            serial,
            sourceRowNumber,
            status,
            productName: parsed.productName,
            cohort: 'ALREADY_PRESENT_FROM_PRE55A',
            previousBatch: pre55aBySerial.get(serial)[0].batch
          });
        } else {
          classifications.ALREADY_OBSERVED_SAME_RESULT++;
          alreadyRepresentedRows.push({
            serial,
            sourceRowNumber,
            status,
            productName: parsed.productName,
            cohort: 'ALREADY_OBSERVED_SAME_RESULT',
            previousBatch: 'CANONICAL_ANCHORS'
          });
        }
        continue;
      }

      // Not in canonical: check if was unresolved in Batch A or pre-55A
      const histList = pre55aBySerial.get(serial);
      const inBatchA = batchAMap.get(serial);
      const wasUnresolved = (inBatchA && inBatchA.lookup_outcome !== 'OFFICIAL_EXACT_FOUND') ||
                            (histList && histList.length > 0 && histList[histList.length - 1].obs.lookup_outcome !== 'OFFICIAL_EXACT_FOUND');

      if (wasUnresolved) {
        classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE++;
        previouslyUnresolvedNowPositive.push({
          serial,
          sourceRowNumber,
          previous_outcome: inBatchA ? inBatchA.lookup_outcome : histList[histList.length - 1].obs.lookup_outcome,
          previous_batch: inBatchA ? '2026-10-17' : histList[histList.length - 1].batch,
          new_model_name: parsed.productName,
          new_category: category,
          new_drive_type: driveType,
          verification_date: date
        });
        newOfficialAnchorsOnly.push(anchorRecord);
        continue;
      }

      // Completely new positive observation
      classifications.NEW_POSITIVE_OBSERVATION++;
      newOfficialAnchorsOnly.push(anchorRecord);
      continue;
    }

    // No match / time-out / onbekend
    allObservations.push({
      input_serial: serial,
      official_serial_number: null,
      lookup_date: date,
      lookup_date_basis: 'per-row controle_datum from MY STIHL lookup',
      lookup_outcome: 'TECHNICAL_TIMEOUT',
      raw_statuses: rows.map(x => x.r[3].trim().toLowerCase()),
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
      duplicate_input_rows: rows.length,
      source_row_numbers: rows.map(x => x.rowIdx),
      source_file: 'stihl_resultaten_3.csv'
    });

    const histList = pre55aBySerial.get(serial);
    const inBatchA = batchAMap.get(serial);
    const wasUnresolved = (inBatchA && inBatchA.lookup_outcome !== 'OFFICIAL_EXACT_FOUND') ||
                          (histList && histList.length > 0 && histList[histList.length - 1].obs.lookup_outcome !== 'OFFICIAL_EXACT_FOUND');

    if (wasUnresolved) {
      classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH++;
      serialNoMatches.push({
        serial,
        sourceRowNumber,
        raw_status: status,
        controle_datum: date,
        controle_tijd: time,
        cohort: 'PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH',
        previous_outcome: inBatchA ? inBatchA.lookup_outcome : histList[histList.length - 1].obs.lookup_outcome
      });
      continue;
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

  // 7. Validation of accounting invariant
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

  // 8. Dry-Run or Write
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
      serialNoMatches,
      crossBatchOverlapCount,
      crossBatchSamePositive,
      crossBatchTimeoutOverlap
    };
  }

  // WRITE PIPELINE
  console.log('\nWriting Phase 55A Batch B artifacts and canonical updates...');

  // 1. Create directories
  fs.mkdirSync(BATCH_B_SOURCE_DIR, { recursive: true });
  fs.mkdirSync(BATCH_B_DATA_DIR, { recursive: true });

  // 2. Copy immutable source
  const sourceDest = path.join(BATCH_B_SOURCE_DIR, 'stihl_resultaten_3.csv');
  fs.writeFileSync(sourceDest, sourceRaw);
  const copiedHash = crypto.createHash('sha256').update(fs.readFileSync(sourceDest)).digest('hex');
  if (copiedHash !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`Copied Batch B source hash mismatch: ${copiedHash}`);
  }
  console.log(`✓ Immutable source copied: ${sourceDest}`);

  // 3. Write Data Artifacts
  const obsJsonPath = path.join(BATCH_B_DATA_DIR, 'serial_lookup_observations_2026-10-19.json');
  fs.writeFileSync(obsJsonPath, JSON.stringify({ schema_version: 'serial-lookup-observations-v1', observations: allObservations }, null, 2));

  const obsCsvHeaders = [
    'input_serial', 'official_serial_number', 'lookup_date', 'lookup_date_basis',
    'lookup_outcome', 'official_identity', 'category_raw', 'drive_type_raw',
    'official_product_name', 'source', 'verification_status', 'eligible_for_official_anchor',
    'negative_identity_evidence', 'recheck_required', 'duplicate_input_rows', 'source_file'
  ];
  const obsCsvPath = path.join(BATCH_B_DATA_DIR, 'serial_lookup_observations_2026-10-19.csv');
  fs.writeFileSync(obsCsvPath, toCsv(allObservations, obsCsvHeaders));

  const newAnchorsJsonPath = path.join(BATCH_B_DATA_DIR, 'new_official_serial_anchors_only_2026-10-19.json');
  fs.writeFileSync(newAnchorsJsonPath, JSON.stringify({ schema_version: 'official-serial-anchors-v1', anchors: newOfficialAnchorsOnly }, null, 2));

  const anchorCsvHeaders = [
    'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
    'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
  ];
  const newAnchorsCsvPath = path.join(BATCH_B_DATA_DIR, 'new_official_serial_anchors_only_2026-10-19.csv');
  fs.writeFileSync(newAnchorsCsvPath, toCsv(newOfficialAnchorsOnly, anchorCsvHeaders));

  const reconfirmedCsvHeaders = [
    'serial_number', 'batch_model_name', 'existing_model_name', 'batch_category',
    'existing_category', 'batch_drive_type', 'existing_drive_type', 'source_row_number', 'verification_date'
  ];
  const reconfirmedCsvPath = path.join(BATCH_B_DATA_DIR, 'reconfirmed_existing_anchors_2026-10-19.csv');
  fs.writeFileSync(reconfirmedCsvPath, toCsv(reconfirmedAnchors, reconfirmedCsvHeaders));

  const prevUnresolvedCsvHeaders = [
    'serial', 'sourceRowNumber', 'previous_outcome', 'previous_batch', 'new_model_name',
    'new_category', 'new_drive_type', 'verification_date'
  ];
  const prevUnresolvedCsvPath = path.join(BATCH_B_DATA_DIR, 'previously_unresolved_now_positive_2026-10-19.csv');
  fs.writeFileSync(prevUnresolvedCsvPath, toCsv(previouslyUnresolvedNowPositive, prevUnresolvedCsvHeaders));

  const alreadyRepCsvHeaders = ['serial', 'sourceRowNumber', 'status', 'productName', 'cohort', 'previousBatch'];
  const alreadyRepCsvPath = path.join(BATCH_B_DATA_DIR, 'already_represented_rows_2026-10-19.csv');
  fs.writeFileSync(alreadyRepCsvPath, toCsv(alreadyRepresentedRows, alreadyRepCsvHeaders));

  const noMatchCsvHeaders = ['serial', 'sourceRowNumber', 'raw_status', 'controle_datum', 'controle_tijd', 'cohort', 'previous_outcome'];
  const noMatchCsvPath = path.join(BATCH_B_DATA_DIR, 'serial_no_match_2026-10-19.csv');
  fs.writeFileSync(noMatchCsvPath, toCsv(serialNoMatches, noMatchCsvHeaders));

  const unusableCsvHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'productCol', 'meldingPreview'];
  const unusableCsvPath = path.join(BATCH_B_DATA_DIR, 'found_without_usable_identity_2026-10-19.csv');
  fs.writeFileSync(unusableCsvPath, toCsv(foundWithoutUsableIdentity, unusableCsvHeaders));

  const techErrorsCsvHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'meldingPreview'];
  const techErrorsCsvPath = path.join(BATCH_B_DATA_DIR, 'technical_errors_2026-10-19.csv');
  fs.writeFileSync(techErrorsCsvPath, toCsv(technicalErrors, techErrorsCsvHeaders));

  const dupsCsvHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'productCol', 'retryType', 'meldingPreview'];
  const dupsCsvPath = path.join(BATCH_B_DATA_DIR, 'duplicate_source_rows_2026-10-19.csv');
  fs.writeFileSync(dupsCsvPath, toCsv(duplicateSourceRows, dupsCsvHeaders));

  const conflictsCsvHeaders = ['serial', 'sourceRowNumber', 'batch_model_name', 'canonical_model_name', 'batch_identity', 'canonical_identity'];
  const conflictsCsvPath = path.join(BATCH_B_DATA_DIR, 'identity_conflicts_2026-10-19.csv');
  fs.writeFileSync(conflictsCsvPath, toCsv(identityConflicts, conflictsCsvHeaders));

  console.log('✓ All 10 Batch B data artifacts written successfully.');

  // 4. Compute artifact hashes for manifest
  const artifactFiles = [
    'source/stihl_resultaten_3.csv',
    'data/serial_lookup_observations_2026-10-19.json',
    'data/serial_lookup_observations_2026-10-19.csv',
    'data/new_official_serial_anchors_only_2026-10-19.json',
    'data/new_official_serial_anchors_only_2026-10-19.csv',
    'data/reconfirmed_existing_anchors_2026-10-19.csv',
    'data/previously_unresolved_now_positive_2026-10-19.csv',
    'data/already_represented_rows_2026-10-19.csv',
    'data/serial_no_match_2026-10-19.csv',
    'data/found_without_usable_identity_2026-10-19.csv',
    'data/technical_errors_2026-10-19.csv',
    'data/duplicate_source_rows_2026-10-19.csv',
    'data/identity_conflicts_2026-10-19.csv'
  ];

  const filesManifest = artifactFiles.map(rel => {
    const full = path.join(BATCH_B_DIR, rel);
    const content = fs.readFileSync(full);
    return {
      path: rel,
      bytes: content.length,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    };
  });

  // 5. Write README.md and batch_manifest.json
  const manifest = {
    batch_id: 'MY_STIHL_2026-10-19_MANUAL_FOLLOWUP',
    batch_import_date: '2026-10-19',
    verification_date_min: '2026-10-17',
    verification_date_max: '2026-10-19',
    date_basis: 'per-row controle_datum from authenticated MY STIHL lookup',
    source_file: 'source/stihl_resultaten_3.csv',
    source_sha256: EXPECTED_SOURCE_SHA256,
    source_bytes: EXPECTED_SOURCE_BYTES,
    source_rows: populatedRowsCount,
    source_unique_serials: serialGroups.size,
    raw_status_counts: {
      gevonden: 6501,
      fout: 479,
      'time-out': 122,
      onbekend: 1
    },
    historical_overlap: {
      already_present_from_pre55a: classifications.ALREADY_PRESENT_FROM_PRE55A,
      already_present_from_batch_a: classifications.ALREADY_PRESENT_FROM_PHASE55A_BATCH_A,
      cross_batch_overlap_serials: crossBatchOverlapCount,
      cross_batch_same_positive: crossBatchSamePositive,
      cross_batch_timeout_overlap: crossBatchTimeoutOverlap
    },
    previously_unresolved_now_positive: classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE,
    previously_unresolved_still_no_match: classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH,
    new_positive_observations: classifications.NEW_POSITIVE_OBSERVATION,
    new_no_match_observations: classifications.NEW_NO_MATCH_OBSERVATION,
    new_official_anchors: newOfficialAnchorsOnly.length,
    reconfirmed_existing_anchors: reconfirmedAnchors.length,
    no_match_total: classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH + classifications.NEW_NO_MATCH_OBSERVATION,
    timeouts_total: 122,
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

  const manifestPath = path.join(BATCH_B_DIR, 'batch_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const readmeContent = `# STIHL Serial Evidence Import Batch — 2026-10-19 Manual Follow-Up (Batch B)

## Batch Identity
- **Batch ID**: \`MY_STIHL_2026-10-19_MANUAL_FOLLOWUP\`
- **Import Execution Date**: 2026-10-19
- **Verification Date Range**: 2026-10-17 to 2026-10-19 (\`per-row controle_datum\`)
- **Source File**: \`source/stihl_resultaten_3.csv\`
- **Source SHA256**: \`${EXPECTED_SOURCE_SHA256}\`
- **Source Size**: ${EXPECTED_SOURCE_BYTES} bytes
- **Populated Source Rows**: ${populatedRowsCount}
- **Unique Input Serials**: ${serialGroups.size}

## Accounting & Disposition
- **New Official Anchors Added**: ${newOfficialAnchorsOnly.length}
- **Reconfirmed Existing Anchors**: ${reconfirmedAnchors.length} (Pre-55A: ${classifications.ALREADY_PRESENT_FROM_PRE55A}, Batch A: ${classifications.ALREADY_PRESENT_FROM_PHASE55A_BATCH_A})
- **Previously Unresolved -> Now Positive**: ${classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE}
- **No-Match / Timeouts**: ${classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH + classifications.NEW_NO_MATCH_OBSERVATION} (121 timeouts + 1 onbekend)
- **Found Without Usable Identity**: ${classifications.FOUND_WITHOUT_USABLE_IDENTITY}
- **Technical Errors (Unresolved)**: ${classifications.TECHNICAL_ERROR} (479 raw fout rows retried and resolved in duplicate rows)
- **Duplicate Source Rows**: ${classifications.DUPLICATE_SOURCE_ROW} (478 error->positive retries, 1 timeout->positive retry, 5 same-result retries, 1 extra retry in 3-row group)
- **Identity Conflicts**: 0
- **Invalid Serials**: 0

## Cross-Batch Overlap (Batch A ∩ Batch B)
- **Overlapping Serials**: ${crossBatchOverlapCount}
- **Identical Positive Observations**: ${crossBatchSamePositive}
- **Timeout in B for Pre-existing Anchor**: ${crossBatchTimeoutOverlap} (timeouts do not mutate pre-existing canonical anchors)
- **Conflicting Positives**: 0

## Integrity Guarantees
- Zero inferred ranges created (\`RANGES_CREATED = 0\`).
- Zero generic 8-to-9 prefix rules created (\`GENERIC_PREFIX_RULES_CREATED = 0\`).
- Zero negative runtime evidence introduced. Timeouts and no-matches remain strictly audit/provenance evidence.
- Canonical production anchors increased from ${initialAnchorsList.length} to ${initialAnchorsList.length + newOfficialAnchorsOnly.length}.
`;
  fs.writeFileSync(path.join(BATCH_B_DIR, 'README.md'), readmeContent);
  console.log('✓ batch_manifest.json and README.md written for Batch B.');

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

  // 7. Update Machine-Readable Reconciliation File with Batch A, Batch B, and Cumulative Section
  const reconJsonPath = path.join(rootDir, 'data', 'serial_phase55a_reconciliation.json');
  let existingRecon = {};
  if (fs.existsSync(reconJsonPath)) {
    existingRecon = JSON.parse(fs.readFileSync(reconJsonPath, 'utf8'));
  }

  // Preserve existing Batch A accounting exactly
  const batchAAccounting = existingRecon.batch_a || {
    source_identity: existingRecon.source_identity || 'C:\\Users\\GelliusSnippe\\.agents\\stihl_resultaten_17_10.csv',
    source_hash: existingRecon.source_hash || 'c7e682f06fe67881f9c66243b645cbd5f1c272323cd51f9451ec2b66684b7680',
    source_bytes: existingRecon.source_bytes || 4564382,
    source_row_accounting: existingRecon.source_row_accounting || {
      total_populated_rows: 7303,
      unique_input_serials: 7202,
      duplicate_source_rows: 101
    },
    historical_overlap: existingRecon.historical_overlap || {
      already_imported_identical: 202,
      already_observed_same_result: 402,
      previously_unresolved_now_positive: 13,
      previously_unresolved_still_no_match: 65,
      new_positive_observations: 1530,
      new_no_match_observations: 4985,
      found_without_usable_identity: 4,
      technical_errors: 1,
      identity_conflicts: 0,
      invalid_input_serials: 0
    },
    positive_anchor_accounting: existingRecon.positive_anchor_accounting || {
      anchors_before: 8874,
      new_official_anchors: 1543,
      reconfirmed_existing_anchors: 604,
      anchors_after: 10417
    }
  };

  const batchBAccounting = {
    source_identity: 'data/import_batches/serials_2026-10-19_manual_followup/source/stihl_resultaten_3.csv',
    source_hash: EXPECTED_SOURCE_SHA256,
    source_bytes: EXPECTED_SOURCE_BYTES,
    source_row_accounting: {
      total_populated_rows: populatedRowsCount,
      unique_input_serials: serialGroups.size,
      duplicate_source_rows: classifications.DUPLICATE_SOURCE_ROW
    },
    classification_accounting: {
      already_present_from_pre55a: classifications.ALREADY_PRESENT_FROM_PRE55A,
      already_present_from_batch_a: classifications.ALREADY_PRESENT_FROM_PHASE55A_BATCH_A,
      already_observed_same_result: classifications.ALREADY_OBSERVED_SAME_RESULT,
      previously_unresolved_now_positive: classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE,
      previously_unresolved_still_no_match: classifications.PREVIOUSLY_UNRESOLVED_STILL_NO_MATCH,
      new_positive_observations: classifications.NEW_POSITIVE_OBSERVATION,
      new_no_match_observations: classifications.NEW_NO_MATCH_OBSERVATION,
      found_without_usable_identity: classifications.FOUND_WITHOUT_USABLE_IDENTITY,
      technical_errors: classifications.TECHNICAL_ERROR,
      duplicate_source_rows: classifications.DUPLICATE_SOURCE_ROW,
      identity_conflicts: classifications.IDENTITY_CONFLICT,
      invalid_input_serials: classifications.INVALID_INPUT_SERIAL
    },
    positive_anchor_accounting: {
      anchors_before: initialAnchorsList.length,
      new_official_anchors: newOfficialAnchorsOnly.length,
      reconfirmed_existing_anchors: reconfirmedAnchors.length,
      anchors_after: finalAnchorsList.length
    }
  };

  const setA = new Set(batchAObs.map(o => o.input_serial));
  const setB = new Set(serialGroups.keys());
  const unionSet = new Set([...setA, ...setB]);
  const intersectionSet = new Set();
  for (const s of setA) {
    if (setB.has(s)) intersectionSet.add(s);
  }

  const cumulativePhase55a = {
    total_source_rows: 7303 + populatedRowsCount,
    total_unique_serials_across_sources: unionSet.size,
    cross_batch_overlap_serials: intersectionSet.size,
    cross_batch_same_positive_serials: crossBatchSamePositive,
    cross_batch_timeout_overlap_serials: crossBatchTimeoutOverlap,
    cross_batch_identity_conflicts: 0,
    anchors_before_phase55a: 8874,
    new_anchors_batch_a: 1543,
    new_anchors_batch_b: newOfficialAnchorsOnly.length,
    cumulative_new_anchors: 1543 + newOfficialAnchorsOnly.length,
    reconfirmed_batch_a: 604,
    reconfirmed_batch_b: reconfirmedAnchors.length,
    anchors_after_batch_a: 10417,
    anchors_after_phase55a: finalAnchorsList.length,
    aliases_before_phase55a: 171,
    new_explicit_aliases: 0,
    aliases_after_phase55a: initialAliasesList.length,
    protection_checks: {
      ranges_created: 0,
      generic_prefix_rules_created: 0,
      negative_runtime_evidence_created: 0,
      historical_batches_immutable: true,
      phase54f_protected: true
    }
  };

  const updatedReconciliation = {
    baseline_sha: '1dcc18d04495feba2099607a1208681ddab7fd56',
    batch_a: batchAAccounting,
    batch_b: batchBAccounting,
    cumulative_phase55a: cumulativePhase55a
  };

  fs.writeFileSync(reconJsonPath, JSON.stringify(updatedReconciliation, null, 2) + '\n');
  console.log('✓ Written data/serial_phase55a_reconciliation.json with batch_a, batch_b, and cumulative_phase55a.');

  return {
    success: true,
    classifications,
    newOfficialAnchorsOnly,
    reconfirmedAnchors,
    manifest,
    finalAnchorsCount: finalAnchorsList.length,
    cumulativePhase55a
  };
}

if (process.argv[1] && process.argv[1].endsWith('generate_phase55a_batch_b.mjs')) {
  const isWrite = process.argv.includes('--write');
  runBatchBReconciliationAndProcessing({ write: isWrite });
}
