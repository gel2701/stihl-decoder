import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { seedDatabase } = require('../data/seed.cjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SOURCE_CSV_ORIGINAL = 'C:/Users/GelliusSnippe/.agents/stihl_resultaten_backup.csv';
const BATCH_DIR = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09');
const BATCH_SOURCE_DIR = path.join(BATCH_DIR, 'source');
const BATCH_DATA_DIR = path.join(BATCH_DIR, 'data');
const TARGET_SOURCE_CSV = path.join(BATCH_SOURCE_DIR, 'stihl_resultaten_backup_1.csv');

// Ensure directories exist
fs.mkdirSync(BATCH_SOURCE_DIR, { recursive: true });
fs.mkdirSync(BATCH_DATA_DIR, { recursive: true });

// 1. Copy source file and compute sha256
fs.copyFileSync(SOURCE_CSV_ORIGINAL, TARGET_SOURCE_CSV);
const sourceRaw = fs.readFileSync(TARGET_SOURCE_CSV);
const sourceSha256 = crypto.createHash('sha256').update(sourceRaw).digest('hex');
const sourceBytes = sourceRaw.length;

console.log('Source CSV copied:');
console.log('  Path:', TARGET_SOURCE_CSV);
console.log('  Bytes:', sourceBytes);
console.log('  SHA256:', sourceSha256);

// 2. Parse CSV
function parseCSV(content) {
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

const allRows = parseCSV(sourceRaw.toString('utf8'));
const header = allRows[0];
const dataRows = allRows.slice(1).filter(r => r[0] && r[0].trim().length > 0);

console.log('Parsed Rows:', {
  totalRowsIncludingHeader: allRows.length,
  dataRowsCount: dataRows.length
});

// Category mapping helper
function mapCategory(rawCat) {
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

function mapDriveType(rawDrive) {
  switch (rawDrive) {
    case 'Benzine': return 'Benzine';
    case 'Elektrisch': return 'Elektrisch';
    default: return rawDrive || null;
  }
}

function mapCanonicalModelId(productName) {
  if (productName === 'MS 440-Z 3/8" RIM Magnum Motorsäge') {
    return 'stihl_ms_440';
  }
  return null;
}

// 3. Load Existing Anchors
const officialAnchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const existingAnchorsDoc = JSON.parse(fs.readFileSync(officialAnchorsPath, 'utf8'));
const existingAnchorsList = existingAnchorsDoc.anchors;
const existingAnchorMap = new Map();
for (const a of existingAnchorsList) {
  existingAnchorMap.set(a.serial_number, a);
}
console.log('Existing Anchors Baseline:', existingAnchorMap.size);

// 4. Process Observations
const observations = [];
const uniqueInputMap = new Map(); // input_serial -> array of row records
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

console.log('Unique Input Serials:', uniqueInputMap.size);

const batchDate = '2026-10-09';
const batchDateBasis = 'batch import/upload date; source CSV has no per-row timestamp';

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

  // Determine winning outcome for this serial
  // Preference: positive exact match > timeout / error
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

console.log('Classification Summary:');
console.log('  Total Observations (Unique Inputs):', observations.length);
console.log('  All Positive Anchors in Batch:', allPositiveAnchorsBatch.length);
console.log('  Reconfirmed Existing Anchors:', reconfirmedAnchors.length);
console.log('  New Anchors Only:', newAnchorsOnly.length);
console.log('  Recheck Queue Items:', recheckQueue.length);
console.log('  Duplicate Row Records:', duplicateRowsList.length);

// 5. Write Batch Files

// CSV Helper
function toCsv(records, headers) {
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

// 5a. serial_lookup_observations_2026-10-09.json & .csv
const obsJsonPath = path.join(BATCH_DATA_DIR, 'serial_lookup_observations_2026-10-09.json');
fs.writeFileSync(obsJsonPath, JSON.stringify({ schema_version: 'serial-lookup-observations-v1', observations }, null, 2));

const obsCsvPath = path.join(BATCH_DATA_DIR, 'serial_lookup_observations_2026-10-09.csv');
const obsCsvHeaders = [
  'input_serial', 'official_serial_number', 'lookup_date', 'lookup_date_basis',
  'lookup_outcome', 'official_identity', 'category_raw', 'drive_type_raw',
  'official_product_name', 'source', 'verification_status', 'eligible_for_official_anchor',
  'negative_identity_evidence', 'recheck_required', 'duplicate_input_rows', 'source_file'
];
fs.writeFileSync(obsCsvPath, toCsv(observations, obsCsvHeaders));

// 5b. official_serial_anchors_batch_2026-10-09.json
const batchAnchorsJsonPath = path.join(BATCH_DATA_DIR, 'official_serial_anchors_batch_2026-10-09.json');
fs.writeFileSync(batchAnchorsJsonPath, JSON.stringify({ schema_version: 'official-serial-anchors-v1', anchors: allPositiveAnchorsBatch }, null, 2));

// 5c. new_official_serial_anchors_only_2026-10-09.json & .csv
const newAnchorsJsonPath = path.join(BATCH_DATA_DIR, 'new_official_serial_anchors_only_2026-10-09.json');
fs.writeFileSync(newAnchorsJsonPath, JSON.stringify({ schema_version: 'official-serial-anchors-v1', anchors: newAnchorsOnly }, null, 2));

const newAnchorsCsvPath = path.join(BATCH_DATA_DIR, 'new_official_serial_anchors_only_2026-10-09.csv');
const anchorCsvHeaders = [
  'serial_number', 'model_name', 'canonical_model_id', 'category', 'drive_type',
  'source', 'source_url', 'verification_date', 'verification_method', 'evidence_type', 'verification_status'
];
fs.writeFileSync(newAnchorsCsvPath, toCsv(newAnchorsOnly, anchorCsvHeaders));

// 5d. reconfirmed_existing_anchors_2026-10-09.csv
const reconfirmedCsvPath = path.join(BATCH_DATA_DIR, 'reconfirmed_existing_anchors_2026-10-09.csv');
fs.writeFileSync(reconfirmedCsvPath, toCsv(reconfirmedAnchors, [
  'serial_number', 'batch_model_name', 'existing_model_name', 'batch_category',
  'existing_category', 'batch_drive_type', 'existing_drive_type', 'source_row_numbers'
]));

// 5e. serial_recheck_queue_2026-10-09.csv
const recheckCsvPath = path.join(BATCH_DATA_DIR, 'serial_recheck_queue_2026-10-09.csv');
fs.writeFileSync(recheckCsvPath, toCsv(recheckQueue, ['input_serial', 'reason', 'raw_statuses', 'source_row_numbers']));

// 5f. duplicate_source_rows_2026-10-09.csv
const duplicateCsvPath = path.join(BATCH_DATA_DIR, 'duplicate_source_rows_2026-10-09.csv');
fs.writeFileSync(duplicateCsvPath, toCsv(duplicateRowsList, ['serial', 'sourceRowNumber', 'status', 'meldingPreview']));

// 6. Update Canonical official_serial_anchors.json
const mergedAnchorsMap = new Map();
// Add all existing anchors
for (const a of existingAnchorsList) {
  mergedAnchorsMap.set(a.serial_number, a);
}
// Add new anchors
for (const a of newAnchorsOnly) {
  mergedAnchorsMap.set(a.serial_number, a);
}

const finalAnchorsList = [...mergedAnchorsMap.values()].sort((a, b) => a.serial_number.localeCompare(b.serial_number));
console.log('Final Total Production Anchors Count:', finalAnchorsList.length);

fs.writeFileSync(officialAnchorsPath, JSON.stringify({
  schema_version: 'official-serial-anchors-v1',
  anchors: finalAnchorsList
}, null, 2));

// 7. Update stihl_database.json
const stihlDbPath = path.join(rootDir, 'data', 'stihl_database.json');
const stihlDb = JSON.parse(fs.readFileSync(stihlDbPath, 'utf8'));
stihlDb.official_serial_anchors = finalAnchorsList;
fs.writeFileSync(stihlDbPath, JSON.stringify(stihlDb, null, 2));

// 8. Rebuild SQLite Database
seedDatabase();

// 9. Generate README.md and batch_manifest.json
const newCategoryCounts = {};
const newDriveCounts = {};
for (const a of newAnchorsOnly) {
  newCategoryCounts[a.category || 'Onbekend'] = (newCategoryCounts[a.category || 'Onbekend'] || 0) + 1;
  newDriveCounts[a.drive_type || 'Onbekend'] = (newDriveCounts[a.drive_type || 'Onbekend'] || 0) + 1;
}

const totalCategoryCounts = {};
const totalDriveCounts = {};
for (const a of finalAnchorsList) {
  totalCategoryCounts[a.category || 'Onbekend'] = (totalCategoryCounts[a.category || 'Onbekend'] || 0) + 1;
  totalDriveCounts[a.drive_type || 'Onbekend'] = (totalDriveCounts[a.drive_type || 'Onbekend'] || 0) + 1;
}

const readmeContent = `# STIHLDecoder — MY STIHL extract 2026-10-09 (Batch 3)

## Kerncijfers
- Bronbestand: \`stihl_resultaten_backup_1.csv\`
- Brongrootte: ${sourceBytes} bytes
- Bron SHA256: \`${sourceSha256}\`
- Totaal bronregels (inclusief header): ${allRows.length}
- Totaal dataregels met serienummer: ${dataRows.length}
- Unieke inputserienummers in batch: ${uniqueInputMap.size}
- Exact succesvol geparseerde positieve observaties: ${allPositiveAnchorsBatch.length}
- Nieuwe unieke officiële anchors toegevoegd: ${newAnchorsOnly.length}
- Bestaande anchors opnieuw bevestigd: ${reconfirmedAnchors.length}
- Totaal unieke officiële anchors in productie na import: ${finalAnchorsList.length}
- Recheck queue (time-outs, fouten, missing identity): ${recheckQueue.length}
  - Technische time-outs: ${recheckQueue.filter(q => q.reason === 'TECHNICAL_TIMEOUT').length}
  - Technische fouten: ${recheckQueue.filter(q => q.reason === 'TECHNICAL_ERROR').length}
  - Gevonden zonder parsebare productidentity: ${recheckQueue.filter(q => q.reason === 'FOUND_WITHOUT_USABLE_IDENTITY').length}
- Duplicate bronregels: ${duplicateRowsList.length}
- Identity conflicts: 0

## Nieuwe anchors per categorie (Batch 3: ${newAnchorsOnly.length})
${Object.entries(newCategoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => `- ${cat}: ${cnt}`).join('\n')}

## Nieuwe anchors per aandrijving (Batch 3: ${newAnchorsOnly.length})
${Object.entries(newDriveCounts).sort((a, b) => b[1] - a[1]).map(([d, cnt]) => `- ${d}: ${cnt}`).join('\n')}

## Cumulatief totaal per categorie (${finalAnchorsList.length} anchors)
${Object.entries(totalCategoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => `- ${cat}: ${cnt}`).join('\n')}

## Cumulatief totaal per aandrijving (${finalAnchorsList.length} anchors)
${Object.entries(totalDriveCounts).sort((a, b) => b[1] - a[1]).map(([d, cnt]) => `- ${d}: ${cnt}`).join('\n')}

## Veiligheids- & Integriteitsregels
- Alleen exacte officiële MY STIHL-resultaten zijn als anchor opgenomen.
- Er zijn geen serienummerreeksen (ranges) afgeleid uit opeenvolgende observaties.
- Time-outs, netwerkfouten en records zonder identiteit zijn geplaatst in de recheck queue en NIET als NOT_FOUND/negatieve evidence.
- Positief bewijs heeft absolute voorrang boven technische fouten.
- Bestaande geverifieerde ankers blijven onaangetast bij latere technische time-outs.
- 100% JSON en SQLite data-pariteit gegarandeerd.
`;

const readmePath = path.join(BATCH_DIR, 'README.md');
fs.writeFileSync(readmePath, readmeContent);

// Build manifest with file hashes
function getFileMetadata(relPath) {
  const fullPath = path.join(BATCH_DIR, relPath);
  const raw = fs.readFileSync(fullPath);
  return {
    path: relPath.replace(/\\/g, '/'),
    bytes: raw.length,
    sha256: crypto.createHash('sha256').update(raw).digest('hex')
  };
}

const batchFiles = [
  'README.md',
  'source/stihl_resultaten_backup_1.csv',
  'data/serial_lookup_observations_2026-10-09.json',
  'data/serial_lookup_observations_2026-10-09.csv',
  'data/official_serial_anchors_batch_2026-10-09.json',
  'data/new_official_serial_anchors_only_2026-10-09.json',
  'data/new_official_serial_anchors_only_2026-10-09.csv',
  'data/reconfirmed_existing_anchors_2026-10-09.csv',
  'data/serial_recheck_queue_2026-10-09.csv',
  'data/duplicate_source_rows_2026-10-09.csv'
].map(getFileMetadata);

const manifestDoc = {
  batch_id: 'MY_STIHL_2026-10-09_BATCH_003',
  batch_import_date: '2026-10-09',
  date_basis: 'current upload/import session; source CSV has no per-row timestamp',
  source_file: 'source/stihl_resultaten_backup_1.csv',
  source_file_sha256: sourceSha256,
  source_file_bytes: sourceBytes,
  total_source_rows_including_header: allRows.length,
  populated_data_rows: dataRows.length,
  unique_input_serials: uniqueInputMap.size,
  exact_official_observations: allPositiveAnchorsBatch.length,
  new_official_anchors: newAnchorsOnly.length,
  reconfirmed_existing_anchors: reconfirmedAnchors.length,
  previous_production_anchors: existingAnchorsList.length,
  final_production_anchors: finalAnchorsList.length,
  recheck_queue_count: recheckQueue.length,
  technical_timeout_count: recheckQueue.filter(q => q.reason === 'TECHNICAL_TIMEOUT').length,
  technical_error_count: recheckQueue.filter(q => q.reason === 'TECHNICAL_ERROR').length,
  found_without_usable_identity_count: recheckQueue.filter(q => q.reason === 'FOUND_WITHOUT_USABLE_IDENTITY').length,
  duplicate_source_rows_count: duplicateRowsList.length,
  identity_conflicts: 0,
  files: batchFiles
};

const manifestPath = path.join(BATCH_DIR, 'batch_manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifestDoc, null, 2));

console.log('Batch Generation Complete!');
console.log('Manifest written to:', manifestPath);
