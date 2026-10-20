/**
 * Phase 55D: Genuine Serial Delta Reconciliation & Controlled Import Pipeline
 * Authoritative Batch Processing for manual MY STIHL lookup delta (2026-10-20)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  parseCSV,
  mapCategory,
  mapDriveType,
  mapCanonicalModelId,
  extractPositiveIdentity
} from './generate_phase55a_batch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const EXPECTED_SOURCE_SHA256 = 'af1f7638d5161e02f586293ae4050c49e7b916119b3a8b2030996c9825192e29';
export const EXPECTED_SOURCE_BYTES = 2036808;

export const FROZEN_SOURCE_EXTERNAL = 'C:/Users/GelliusSnippe/.agents/stihl_snapshot_phase55d.csv';
export const BATCH_NAME = 'serials_2026-10-20_manual_delta_55d';
export const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', BATCH_NAME);
export const BATCH_DATA_DIR = path.join(BATCH_DIR, 'data');
export const BATCH_SOURCE_DIR = path.join(BATCH_DIR, 'source');
export const BATCH_SOURCE_COPY = path.join(BATCH_SOURCE_DIR, 'stihl_resultaten_snapshot.csv');

export function getSourceBuffer() {
  if (fs.existsSync(BATCH_SOURCE_COPY)) {
    return fs.readFileSync(BATCH_SOURCE_COPY);
  }
  if (fs.existsSync(FROZEN_SOURCE_EXTERNAL)) {
    return fs.readFileSync(FROZEN_SOURCE_EXTERNAL);
  }
  throw new Error(`Neither batch source copy (${BATCH_SOURCE_COPY}) nor external snapshot (${FROZEN_SOURCE_EXTERNAL}) exists.`);
}

function safeToCsv(rows, headers) {
  if (!rows || rows.length === 0) {
    return headers.join(';') + '\n';
  }
  const lines = [headers.join(';')];
  for (const row of rows) {
    const fields = headers.map(h => {
      const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
      if (val.includes(';') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(fields.join(';'));
  }
  return lines.join('\n') + '\n';
}

export function runPhase55DReconciliation(options = {}) {
  const writeChanges = options.write === true;
  console.log('===============================================================');
  console.log(`🛠️ RUNNING PHASE 55D GENUINE DELTA RECONCILIATION (${writeChanges ? 'WRITE MODE' : 'DRY-RUN MODE'})`);
  console.log('===============================================================\n');

  // 1. Load source buffer and verify integrity
  const sourceRaw = getSourceBuffer();
  const sourceBytes = sourceRaw.length;
  const sourceSha256 = crypto.createHash('sha256').update(sourceRaw).digest('hex');

  if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`Source SHA256 mismatch: expected ${EXPECTED_SOURCE_SHA256}, got ${sourceSha256}`);
  }
  if (sourceBytes !== EXPECTED_SOURCE_BYTES) {
    throw new Error(`Source byte size mismatch: expected ${EXPECTED_SOURCE_BYTES}, got ${sourceBytes}`);
  }
  console.log(`✓ Source SHA256 verified: ${sourceSha256} (${sourceBytes} bytes)`);

  // 2. Load canonical anchors & aliases
  const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
  const anchorsDoc = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
  const canonicalAnchorsList = Array.isArray(anchorsDoc.anchors) ? anchorsDoc.anchors : [];
  const canonicalAnchorMap = new Map();
  for (const a of canonicalAnchorsList) {
    canonicalAnchorMap.set(a.serial_number, a);
  }

  const aliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');
  const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  const canonicalAliasesList = Array.isArray(aliasesDoc.aliases) ? aliasesDoc.aliases : [];
  const canonicalAliasMap = new Map();
  for (const a of canonicalAliasesList) {
    canonicalAliasMap.set(a.input_serial, a);
  }

  console.log(`✓ Canonical Anchors Before: ${canonicalAnchorsList.length}`);
  console.log(`✓ Canonical Aliases Before: ${canonicalAliasesList.length}`);

  // 3. Load historical observations from prior batches
  const batchesDir = path.join(rootDir, 'data', 'import_batches');
  const batchDirs = fs.readdirSync(batchesDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== BATCH_NAME)
    .map(d => d.name);

  const historicalObservations = new Map();
  for (const b of batchDirs) {
    const dataDir = path.join(batchesDir, b, 'data');
    if (fs.existsSync(dataDir)) {
      const obsFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('serial_lookup_observations_') && f.endsWith('.json'));
      for (const ofile of obsFiles) {
        const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, ofile), 'utf8'));
        const items = Array.isArray(parsed) ? parsed : (parsed.observations || []);
        for (const item of items) {
          historicalObservations.set(item.input_serial || item.serial_number, item);
        }
      }
    }
  }
  console.log(`✓ Historical Observations Loaded: ${historicalObservations.size}`);

  // 4. Parse snapshot
  const sourceText = sourceRaw.toString('utf8');
  const allRows = parseCSV(sourceText);
  const header = allRows[0];
  const dataRows = allRows.slice(1);
  const populatedRows = dataRows.filter(r => r.some(f => f && f.trim().length > 0));
  const emptyRowsCount = dataRows.length - populatedRows.length;

  console.log(`✓ Parsed Source: ${dataRows.length} total rows (${emptyRowsCount} empty placeholders, ${populatedRows.length} populated rows)`);

  // 5. Accounting collections
  const classifications = {
    ALREADY_PROCESSED_IDENTICAL: 0,
    ALREADY_PROCESSED_EQUIVALENT: 0,
    PREVIOUSLY_POSITIVE_RECONFIRMED: 0,
    PREVIOUSLY_UNRESOLVED_STILL_NONPOSITIVE: 0,
    PREVIOUSLY_UNRESOLVED_NOW_POSITIVE: 0,
    NEW_POSITIVE_OBSERVATION: 0,
    NEW_NO_MATCH_OBSERVATION: 0,
    NEW_FOUND_WITHOUT_USABLE_IDENTITY: 0,
    NEW_TECHNICAL_ERROR: 0,
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
  const historicalOverlap = [];
  const newNoMatch = [];
  const newOfficialAnchorsOnly = [];
  const allObservations = [];

  const seenSerials = new Set();
  const serialRowNumbers = new Map();

  for (let idx = 0; idx < populatedRows.length; idx++) {
    const r = populatedRows[idx];
    const sourceRowNumber = idx + 2 + emptyRowsCount;
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
    if (!/^\d{9}$/.test(serial)) {
      classifications.INVALID_INPUT_SERIAL++;
      continue;
    }

    const histObs = historicalObservations.get(serial);
    const existingAnchor = canonicalAnchorMap.get(serial);

    // 3. TECHNICAL ERROR
    if (status === 'fout') {
      classifications.NEW_TECHNICAL_ERROR++;
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
        source_file: 'stihl_resultaten_snapshot.csv'
      });
      continue;
    }

    // 4. POSITIVE OFFICIAL MATCH
    if (status === 'gevonden') {
      const parsed = extractPositiveIdentity(melding);
      if (!parsed || !parsed.productName) {
        classifications.NEW_FOUND_WITHOUT_USABLE_IDENTITY++;
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
          source_file: 'stihl_resultaten_snapshot.csv'
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
        source_file: 'stihl_resultaten_snapshot.csv'
      });

      // Check against existing canonical anchors
      if (existingAnchor) {
        if (existingAnchor.model_name !== parsed.productName) {
          classifications.IDENTITY_CONFLICT++;
          identityConflicts.push({
            serial,
            sourceRowNumber,
            batch_model_name: parsed.productName,
            canonical_model_name: existingAnchor.model_name,
            batch_identity: parsed.fullIdentity,
            canonical_identity: `${existingAnchor.category} / ${existingAnchor.drive_type} ${existingAnchor.model_name}`
          });
          continue;
        }

        classifications.PREVIOUSLY_POSITIVE_RECONFIRMED++;
        reconfirmedAnchors.push({
          serial_number: serial,
          batch_model_name: parsed.productName,
          existing_model_name: existingAnchor.model_name,
          batch_category: category,
          existing_category: existingAnchor.category,
          batch_drive_type: driveType,
          existing_drive_type: existingAnchor.drive_type,
          source_row_number: sourceRowNumber,
          verification_date: date
        });
        historicalOverlap.push({
          serial,
          sourceRowNumber,
          overlap_type: 'PREVIOUSLY_POSITIVE_RECONFIRMED',
          model_name: parsed.productName,
          verification_date: date
        });
        continue;
      }

      // Check if previously unresolved in prior batch
      if (histObs && histObs.lookup_outcome !== 'POSITIVE_MATCH' && histObs.lookup_outcome !== 'OFFICIAL_EXACT_FOUND') {
        classifications.PREVIOUSLY_UNRESOLVED_NOW_POSITIVE++;
        previouslyUnresolvedNowPositive.push({
          serial_number: serial,
          model_name: parsed.productName,
          prior_outcome: histObs.lookup_outcome,
          current_outcome: 'OFFICIAL_EXACT_FOUND',
          source_row_number: sourceRowNumber,
          verification_date: date
        });
        newOfficialAnchorsOnly.push(anchorRecord);
      } else {
        classifications.NEW_POSITIVE_OBSERVATION++;
        newOfficialAnchorsOnly.push(anchorRecord);
      }
      continue;
    }

    // 5. TIMEOUT / NO MATCH
    if (status === 'time-out' || status === 'onbekend') {
      if (histObs && (histObs.lookup_outcome === 'TIMEOUT_NO_MATCH' || histObs.lookup_outcome === 'NO_MATCH')) {
        classifications.PREVIOUSLY_UNRESOLVED_STILL_NONPOSITIVE++;
        historicalOverlap.push({
          serial,
          sourceRowNumber,
          overlap_type: 'PREVIOUSLY_UNRESOLVED_STILL_NONPOSITIVE',
          model_name: null,
          verification_date: date
        });
      } else {
        classifications.NEW_NO_MATCH_OBSERVATION++;
        newNoMatch.push({
          serial,
          sourceRowNumber,
          status,
          verification_date: date
        });
      }

      allObservations.push({
        input_serial: serial,
        official_serial_number: null,
        lookup_date: date,
        lookup_date_basis: 'per-row controle_datum from MY STIHL lookup',
        lookup_outcome: 'TIMEOUT_NO_MATCH',
        raw_statuses: [status],
        official_identity: null,
        category_raw: null,
        drive_type_raw: null,
        official_product_name: null,
        source: 'MY_STIHL',
        source_url: url,
        verification_method: 'authenticated MY STIHL UI lookup',
        evidence_type: 'OFFICIAL_WEB_LOOKUP',
        verification_status: 'UNRESOLVED_NON_RUNTIME',
        eligible_for_official_anchor: false,
        negative_identity_evidence: false,
        recheck_required: false,
        input_alias_proven: false,
        duplicate_input_rows: 1,
        source_row_numbers: [sourceRowNumber],
        source_file: 'stihl_resultaten_snapshot.csv'
      });
      continue;
    }
  }

  // Verification equations
  const totalClassified = Object.values(classifications).reduce((a, b) => a + b, 0);
  console.log('Accounting summary:');
  console.table(classifications);
  console.log(`TOTAL_CLASSIFIED = ${totalClassified} (EXPECTED: ${populatedRows.length})`);

  if (totalClassified !== populatedRows.length) {
    throw new Error(`Accounting mismatch: classified ${totalClassified} vs populated ${populatedRows.length}`);
  }
  console.log(`✓ All ${populatedRows.length} populated rows accounted (0 unaccounted)`);

  if (classifications.IDENTITY_CONFLICT > 0) {
    console.error('❌ IDENTITY CONFLICTS ENCOUNTERED:', identityConflicts);
    throw new Error(`HARD_STOP: ${classifications.IDENTITY_CONFLICT} identity conflict(s) encountered.`);
  }

  const historicalOverlapCount =
    classifications.PREVIOUSLY_POSITIVE_RECONFIRMED +
    classifications.PREVIOUSLY_UNRESOLVED_STILL_NONPOSITIVE +
    classifications.ALREADY_PROCESSED_IDENTICAL +
    classifications.ALREADY_PROCESSED_EQUIVALENT;

  const trueDeltaRows = populatedRows.length - historicalOverlapCount - classifications.DUPLICATE_SOURCE_ROW;
  console.log(`✓ True delta rows: ${trueDeltaRows}`);

  // DRY-RUN GUARD
  if (!writeChanges) {
    console.log('\n[DRY RUN COMPLETE] Zero repository files modified.');
    return {
      success: true,
      mode: 'DRY_RUN',
      classifications,
      newOfficialAnchorsOnly,
      allObservations,
      trueDeltaRows
    };
  }

  // 6. WRITE BATCH ARTIFACTS
  console.log('\n▶ Writing Phase 55D batch artifacts to disk...');
  fs.mkdirSync(BATCH_DATA_DIR, { recursive: true });
  fs.mkdirSync(BATCH_SOURCE_DIR, { recursive: true });

  // Copy snapshot to batch source directory if not already there
  if (!fs.existsSync(BATCH_SOURCE_COPY)) {
    fs.copyFileSync(FROZEN_SOURCE_EXTERNAL, BATCH_SOURCE_COPY);
  }

  // Observations JSON & CSV
  const obsHeaders = [
    'input_serial', 'official_serial_number', 'lookup_date', 'lookup_date_basis',
    'lookup_outcome', 'raw_statuses', 'official_identity', 'category_raw',
    'drive_type_raw', 'official_product_name', 'source', 'source_url',
    'verification_method', 'evidence_type', 'verification_status',
    'eligible_for_official_anchor', 'negative_identity_evidence',
    'recheck_required', 'input_alias_proven', 'duplicate_input_rows',
    'source_row_numbers', 'source_file'
  ];
  const obsJsonPath = path.join(BATCH_DATA_DIR, 'serial_lookup_observations_2026-10-20.json');
  fs.writeFileSync(obsJsonPath, JSON.stringify({
    schema_version: 'serial-lookup-observations-v1',
    observations: allObservations
  }, null, 2), 'utf8');

  const obsCsvPath = path.join(BATCH_DATA_DIR, 'serial_lookup_observations_2026-10-20.csv');
  fs.writeFileSync(obsCsvPath, safeToCsv(allObservations, obsHeaders), 'utf8');

  // New official anchors JSON & CSV
  const anchorHeaders = [
    'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
    'source', 'source_url', 'verification_date', 'verification_method',
    'evidence_type', 'verification_status'
  ];
  const newAnchorsJsonPath = path.join(BATCH_DATA_DIR, 'new_official_serial_anchors_only_2026-10-20.json');
  fs.writeFileSync(newAnchorsJsonPath, JSON.stringify({
    schema_version: 'official-serial-anchors-v1',
    anchors: newOfficialAnchorsOnly
  }, null, 2), 'utf8');

  const newAnchorsCsvPath = path.join(BATCH_DATA_DIR, 'new_official_serial_anchors_only_2026-10-20.csv');
  fs.writeFileSync(newAnchorsCsvPath, safeToCsv(newOfficialAnchorsOnly, anchorHeaders), 'utf8');

  // Reconfirmed existing anchors CSV
  const reconfirmedHeaders = [
    'serial_number', 'batch_model_name', 'existing_model_name', 'batch_category',
    'existing_category', 'batch_drive_type', 'existing_drive_type',
    'source_row_number', 'verification_date'
  ];
  const reconfirmedCsvPath = path.join(BATCH_DATA_DIR, 'reconfirmed_existing_anchors_2026-10-20.csv');
  fs.writeFileSync(reconfirmedCsvPath, safeToCsv(reconfirmedAnchors, reconfirmedHeaders), 'utf8');

  // Previously unresolved now positive CSV
  const prevUnresolvedHeaders = [
    'serial_number', 'model_name', 'prior_outcome', 'current_outcome',
    'source_row_number', 'verification_date'
  ];
  const prevUnresolvedCsvPath = path.join(BATCH_DATA_DIR, 'previously_unresolved_now_positive_2026-10-20.csv');
  fs.writeFileSync(prevUnresolvedCsvPath, safeToCsv(previouslyUnresolvedNowPositive, prevUnresolvedHeaders), 'utf8');

  // Historical overlap CSV
  const overlapHeaders = ['serial', 'sourceRowNumber', 'overlap_type', 'model_name', 'verification_date'];
  const overlapCsvPath = path.join(BATCH_DATA_DIR, 'historical_overlap_2026-10-20.csv');
  fs.writeFileSync(overlapCsvPath, safeToCsv(historicalOverlap, overlapHeaders), 'utf8');

  // New no-match CSV
  const noMatchHeaders = ['serial', 'sourceRowNumber', 'status', 'verification_date'];
  const noMatchCsvPath = path.join(BATCH_DATA_DIR, 'new_no_match_2026-10-20.csv');
  fs.writeFileSync(noMatchCsvPath, safeToCsv(newNoMatch, noMatchHeaders), 'utf8');

  // Found without usable identity CSV
  const foundWithoutUsableHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'productCol', 'meldingPreview'];
  const foundWithoutUsableCsvPath = path.join(BATCH_DATA_DIR, 'found_without_usable_identity_2026-10-20.csv');
  fs.writeFileSync(foundWithoutUsableCsvPath, safeToCsv(foundWithoutUsableIdentity, foundWithoutUsableHeaders), 'utf8');

  // Technical errors CSV
  const technicalErrorsHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'meldingPreview'];
  const technicalErrorsCsvPath = path.join(BATCH_DATA_DIR, 'technical_errors_2026-10-20.csv');
  fs.writeFileSync(technicalErrorsCsvPath, safeToCsv(technicalErrors, technicalErrorsHeaders), 'utf8');

  // Duplicate source rows CSV
  const duplicateRowsHeaders = ['serial', 'sourceRowNumber', 'controle_datum', 'controle_tijd', 'status', 'productCol', 'meldingPreview'];
  const duplicateRowsCsvPath = path.join(BATCH_DATA_DIR, 'duplicate_source_rows_2026-10-20.csv');
  fs.writeFileSync(duplicateRowsCsvPath, safeToCsv(duplicateSourceRows, duplicateRowsHeaders), 'utf8');

  // Identity conflicts CSV
  const identityConflictsHeaders = ['serial', 'sourceRowNumber', 'batch_model_name', 'canonical_model_name', 'batch_identity', 'canonical_identity'];
  const identityConflictsCsvPath = path.join(BATCH_DATA_DIR, 'identity_conflicts_2026-10-20.csv');
  fs.writeFileSync(identityConflictsCsvPath, safeToCsv(identityConflicts, identityConflictsHeaders), 'utf8');

  // Generate batch manifest
  const artifactFiles = [
    'source/stihl_resultaten_snapshot.csv',
    'data/serial_lookup_observations_2026-10-20.json',
    'data/serial_lookup_observations_2026-10-20.csv',
    'data/new_official_serial_anchors_only_2026-10-20.json',
    'data/new_official_serial_anchors_only_2026-10-20.csv',
    'data/reconfirmed_existing_anchors_2026-10-20.csv',
    'data/previously_unresolved_now_positive_2026-10-20.csv',
    'data/historical_overlap_2026-10-20.csv',
    'data/new_no_match_2026-10-20.csv',
    'data/found_without_usable_identity_2026-10-20.csv',
    'data/technical_errors_2026-10-20.csv',
    'data/duplicate_source_rows_2026-10-20.csv',
    'data/identity_conflicts_2026-10-20.csv'
  ];

  const manifestArtifacts = {};
  for (const rel of artifactFiles) {
    const full = path.join(BATCH_DIR, rel);
    const buf = fs.readFileSync(full);
    manifestArtifacts[rel] = {
      bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex')
    };
  }

  const manifest = {
    batch_name: BATCH_NAME,
    batch_date: '2026-10-20',
    batch_purpose: 'Controlled reconciliation and promotion of genuine manual MY STIHL serial delta (Phase 55D)',
    source_identity: {
      filename: 'stihl_resultaten_snapshot.csv',
      bytes: EXPECTED_SOURCE_BYTES,
      sha256: EXPECTED_SOURCE_SHA256,
      total_rows: dataRows.length,
      empty_rows: emptyRowsCount,
      populated_rows: populatedRows.length,
      unique_serials: seenSerials.size
    },
    accounting: classifications,
    metrics: {
      canonical_anchors_before: canonicalAnchorsList.length,
      new_official_anchors_added: newOfficialAnchorsOnly.length,
      canonical_anchors_after: canonicalAnchorsList.length + newOfficialAnchorsOnly.length,
      canonical_aliases_before: canonicalAliasesList.length,
      new_aliases_added: 0,
      canonical_aliases_after: canonicalAliasesList.length,
      ranges_created: 0,
      generic_prefix_rules_created: 0,
      negative_runtime_evidence_created: 0
    },
    artifacts: manifestArtifacts
  };

  fs.writeFileSync(path.join(BATCH_DIR, 'batch_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // README.md
  const readmeContent = `# Phase 55D: Genuine Manual Serial Delta Batch (2026-10-20)

## Batch Overview
- **Batch Name**: \`${BATCH_NAME}\`
- **Date**: 2026-10-20
- **Source**: \`source/stihl_resultaten_snapshot.csv\`
- **SHA256**: \`${EXPECTED_SOURCE_SHA256}\`
- **Total Rows**: ${dataRows.length} (${emptyRowsCount} empty placeholders, ${populatedRows.length} populated)
- **Unique Serials**: ${seenSerials.size}
- **New Official Anchors**: ${newOfficialAnchorsOnly.length}
- **Reconfirmed Anchors**: ${classifications.PREVIOUSLY_POSITIVE_RECONFIRMED}
- **New Nonpositive Observations**: ${classifications.NEW_NO_MATCH_OBSERVATION}
- **Identity Conflicts**: 0
- **Ranges Inferred**: 0
- **Generic Prefix Rules**: 0
- **Negative Runtime Evidence**: 0
`;
  fs.writeFileSync(path.join(BATCH_DIR, 'README.md'), readmeContent, 'utf8');

  // 7. UPDATE CANONICAL REGISTRIES
  console.log('\n▶ Updating canonical official_serial_anchors.json & stihl_database.json...');
  const updatedAnchors = [...canonicalAnchorsList, ...newOfficialAnchorsOnly];
  updatedAnchors.sort((a, b) => a.serial_number.localeCompare(b.serial_number));

  fs.writeFileSync(anchorsPath, JSON.stringify({
    schema_version: 'official-serial-anchors-v1',
    anchors: updatedAnchors
  }, null, 2), 'utf8');

  const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
  const dbJson = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  dbJson.official_serial_anchors = updatedAnchors;
  fs.writeFileSync(dbPath, JSON.stringify(dbJson, null, 2), 'utf8');

  // 8. WRITE ROOT RECONCILIATION SUMMARY
  const reconSummary = {
    phase: 'Phase 55D',
    start_baseline: '5482c4b23e0c74089f0488db87bc626c4b736ea1',
    source_identity: {
      bytes: EXPECTED_SOURCE_BYTES,
      sha256: EXPECTED_SOURCE_SHA256,
      total_rows: dataRows.length,
      empty_rows: emptyRowsCount,
      populated_rows: populatedRows.length,
      unique_serials: seenSerials.size,
      date_min: '2026-10-20',
      date_max: '2026-10-20'
    },
    accounting: classifications,
    delta: {
      true_delta_rows: trueDeltaRows,
      historical_overlap_rows: historicalOverlapCount,
      new_official_anchors: newOfficialAnchorsOnly.length,
      reconfirmed_anchors: classifications.PREVIOUSLY_POSITIVE_RECONFIRMED,
      identity_conflicts: 0
    },
    canonical: {
      anchors_before: canonicalAnchorsList.length,
      new_anchors: newOfficialAnchorsOnly.length,
      anchors_after: updatedAnchors.length,
      aliases_before: canonicalAliasesList.length,
      new_aliases: 0,
      aliases_after: canonicalAliasesList.length
    },
    safety_invariants: {
      ranges_created: 0,
      generic_prefix_rules_created: 0,
      negative_runtime_evidence_created: 0,
      phase53a_historical_mutations: 0,
      phase55a_protected_mutations: 0,
      phase55b_protected_mutations: 0,
      phase55c_protected_mutations: 0,
      historical_batches_mutations: 0
    }
  };

  fs.writeFileSync(
    path.join(rootDir, 'data', 'serial_phase55d_reconciliation.json'),
    JSON.stringify(reconSummary, null, 2),
    'utf8'
  );

  console.log(`✓ Updated canonical anchors: ${canonicalAnchorsList.length} -> ${updatedAnchors.length}`);
  console.log(`✓ Phase 55D reconciliation artifacts successfully written!`);

  return {
    success: true,
    mode: 'WRITE',
    classifications,
    newOfficialAnchorsOnly,
    updatedAnchorsCount: updatedAnchors.length
  };
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('process_phase55d_serial_delta.mjs')) {
  const writeMode = process.argv.includes('--write');
  runPhase55DReconciliation({ write: writeMode });
}
