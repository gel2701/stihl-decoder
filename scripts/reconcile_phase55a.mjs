import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const FROZEN_SOURCE_PATH = 'C:\\Users\\GelliusSnippe\\.agents\\stihl_resultaten_17_10.csv';
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
  // Patterns observed in MY STIHL result texts:
  // 1. Standard pattern: "Bosmaaier / Benzine FR 460 TC-E Motorsense rückentragbar Serienummer 188000000"
  // 2. Pattern with prefix: "AANBEVOLEN VOOR JE PRODUCT ƒ Bekijk de productinformatie en voeg de nodige details en instellingen toe. Motorzaag / Benzine MS 261 C-M Serienummer 123456789"
  const m = melding.match(/(?:toe\.\s*)?([A-Za-zÀ-ÿ0-9\-_ ]+?)\s*\/\s*([A-Za-zÀ-ÿ0-9\-_ ]+?)\s+([\s\S]+?)\s+Serienummer\s+(\d+)/i);
  if (m) {
    let categoryRaw = m[1].trim();
    if (categoryRaw.includes('toe.')) categoryRaw = categoryRaw.split('toe.').pop().trim();
    // Sometimes category starts after some intro text, let's clean if needed
    const lastWordCat = categoryRaw.split(/\s+/).pop();
    // Check known categories
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

export function runReconciliation() {
  // 1. Verify frozen source file exists and matches hash
  if (!fs.existsSync(FROZEN_SOURCE_PATH)) {
    throw new Error(`Frozen source file not found at: ${FROZEN_SOURCE_PATH}`);
  }
  const sourceBytes = fs.readFileSync(FROZEN_SOURCE_PATH);
  const sourceHash = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  if (sourceHash !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`Source hash mismatch! Expected ${EXPECTED_SOURCE_SHA256}, got ${sourceHash}`);
  }
  if (sourceBytes.length !== EXPECTED_SOURCE_BYTES) {
    throw new Error(`Source byte size mismatch! Expected ${EXPECTED_SOURCE_BYTES}, got ${sourceBytes.length}`);
  }

  // 2. Load historical batches
  // Batch 2026-09-26
  const b1ObsPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-09-26', 'serial_lookup_observations_2026-09-26.json');
  const b1Obs = JSON.parse(fs.readFileSync(b1ObsPath, 'utf8'));

  // Batch 2026-10-06
  const b2ObsPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-06', 'data', 'serial_lookup_observations_2026-10-06.json');
  const b2Obs = JSON.parse(fs.readFileSync(b2ObsPath, 'utf8'));

  // Batch 2026-10-09
  const b3ObsPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'data', 'serial_lookup_observations_2026-10-09.json');
  const b3Obs = JSON.parse(fs.readFileSync(b3ObsPath, 'utf8'));

  // Load canonical anchors
  const canonicalAnchorsDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_anchors.json'), 'utf8'));
  const canonicalAnchors = canonicalAnchorsDoc.anchors; // object keyed by serial

  // Load canonical aliases
  const canonicalAliasesDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'official_serial_input_aliases.json'), 'utf8'));
  const canonicalAliases = canonicalAliasesDoc.aliases; // object keyed by alias

  console.log(`Loaded historical observations:`);
  console.log(`  Batch 2026-09-26: ${b1Obs.length || Object.keys(b1Obs).length}`);
  console.log(`  Batch 2026-10-06: ${b2Obs.length || Object.keys(b2Obs).length}`);
  console.log(`  Batch 2026-10-09: ${b3Obs.observations?.length || b3Obs.length || Object.keys(b3Obs).length}`);
  console.log(`Loaded canonical anchors: ${Object.keys(canonicalAnchors).length}`);
  console.log(`Loaded canonical aliases: ${Object.keys(canonicalAliases).length}`);

  // Build index of historical observations by serial
  // An observation has input_serial, lookup_outcome (or status), official_identity / product
  const historicalBySerial = new Map();

  function indexObs(obsList, batchName) {
    const list = Array.isArray(obsList) ? obsList : (obsList.observations || Object.values(obsList));
    for (const obs of list) {
      const serial = String(obs.input_serial || obs.serial_number || obs.serial || '').trim();
      if (!serial) continue;
      if (!historicalBySerial.has(serial)) {
        historicalBySerial.set(serial, []);
      }
      historicalBySerial.get(serial).push({
        batch: batchName,
        obs
      });
    }
  }

  indexObs(b1Obs, '2026-09-26');
  indexObs(b2Obs, '2026-10-06');
  indexObs(b3Obs, '2026-10-09');

  console.log(`Unique historical input serials indexed: ${historicalBySerial.size}`);

  // 3. Parse frozen source CSV
  const rawText = sourceBytes.toString('utf8');
  const allRows = parseCSV(rawText);
  const header = allRows[0];
  const dataRows = allRows.slice(1).filter(r => r.some(f => f && f.trim().length > 0));

  console.log(`Header: ${header.join(';')}`);
  console.log(`Populated data rows: ${dataRows.length}`);

  return {
    sourceBytes,
    sourceHash,
    dataRows,
    canonicalAnchors,
    canonicalAliases,
    historicalBySerial
  };
}

if (process.argv[1] && process.argv[1].endsWith('reconcile_phase55a.mjs')) {
  runReconciliation();
}
