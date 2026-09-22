import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

console.log('▶ Starting 10,000 Serial Number Deterministic Distribution Audit...');

// Simple pseudo-random generator with fixed seed for determinism
function pseudoRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rng = pseudoRandom(42821141);
const VALID_PLANTS = ['1', '2', '3', '4', '5', '8', '9'];
const SAMPLE_COUNT = 10000;

const distribution = {
  audit_version: 'distribution_10k_v1',
  generated_at: new Date().toISOString(),
  total_tested: SAMPLE_COUNT,
  plants_tested: VALID_PLANTS,
  model_counts: {},
  category_counts: {},
  status_counts: {},
  plant_breakdown: {},
  concentrations: {}
};

for (const p of VALID_PLANTS) {
  distribution.plant_breakdown[p] = {
    total: 0,
    models: {},
    statuses: {}
  };
}

let ms260Count = 0;
let ms261Count = 0;
let unknownCount = 0;
let otherCount = 0;
let highProbableCount = 0;
let mediumProbableCount = 0;
let lowProbableCount = 0;

for (let i = 0; i < SAMPLE_COUNT; i++) {
  // Distribute evenly across valid plants
  const plant = VALID_PLANTS[i % VALID_PLANTS.length];
  // 8 trailing random digits
  const suffix = Math.floor(rng() * 100000000).toString().padStart(8, '0');
  const serial = plant + suffix;

  const res = decodeStihlCode(serial, database);

  const modelKey = res.exactModel || res.probableModelSeries || (res.modelIdentityStatus === 'MODEL_NOT_IDENTIFIED' ? 'UNKNOWN' : (res.model || 'UNKNOWN'));
  const catKey = res.category || 'Onbekend';
  const statusKey = res.modelIdentityStatus || 'UNKNOWN';

  distribution.model_counts[modelKey] = (distribution.model_counts[modelKey] || 0) + 1;
  distribution.category_counts[catKey] = (distribution.category_counts[catKey] || 0) + 1;
  distribution.status_counts[statusKey] = (distribution.status_counts[statusKey] || 0) + 1;

  distribution.plant_breakdown[plant].total++;
  distribution.plant_breakdown[plant].models[modelKey] = (distribution.plant_breakdown[plant].models[modelKey] || 0) + 1;
  distribution.plant_breakdown[plant].statuses[statusKey] = (distribution.plant_breakdown[plant].statuses[statusKey] || 0) + 1;

  const isProbable = (res.modelIdentityStatus === 'PROBABLE_MODEL_SERIES');
  if (isProbable) {
    const conf = res.serialResolution?.confidence || 'LOW';
    if (conf === 'HIGH') highProbableCount++;
    else if (conf === 'MEDIUM') mediumProbableCount++;
    else lowProbableCount++;
  }

  if (modelKey.includes('260') || (res.probableModelSeries && res.probableModelSeries.includes('260'))) {
    ms260Count++;
  } else if (modelKey.includes('261') || (res.probableModelSeries && res.probableModelSeries.includes('261'))) {
    ms261Count++;
  } else if (statusKey === 'MODEL_NOT_IDENTIFIED' || modelKey === 'UNKNOWN' || modelKey === 'Nog niet definitief bevestigd') {
    unknownCount++;
  } else {
    otherCount++;
  }
}

distribution.concentrations = {
  ms260_count: ms260Count,
  ms260_percentage: Number(((ms260Count / SAMPLE_COUNT) * 100).toFixed(2)),
  ms261_count: ms261Count,
  ms261_percentage: Number(((ms261Count / SAMPLE_COUNT) * 100).toFixed(2)),
  other_count: otherCount,
  other_percentage: Number(((otherCount / SAMPLE_COUNT) * 100).toFixed(2)),
  unknown_count: unknownCount,
  unknown_percentage: Number(((unknownCount / SAMPLE_COUNT) * 100).toFixed(2)),
  high_probable_count: highProbableCount,
  medium_probable_count: mediumProbableCount,
  low_probable_count: lowProbableCount,
  is_ms260_concentration_alert: ((ms260Count / SAMPLE_COUNT) > 0.25),
  is_ms261_concentration_alert: ((ms261Count / SAMPLE_COUNT) > 0.25),
  is_critical_mass_fallback: ((ms260Count / SAMPLE_COUNT) > 0.50 || (ms261Count / SAMPLE_COUNT) > 0.50)
};

console.log('Results summary:');
console.log(`  Total serials tested: ${SAMPLE_COUNT}`);
console.log(`  MS 260 count: ${ms260Count} (${distribution.concentrations.ms260_percentage}%)`);
console.log(`  MS 261 count: ${ms261Count} (${distribution.concentrations.ms261_percentage}%)`);
console.log(`  Other models/families: ${otherCount} (${distribution.concentrations.other_percentage}%)`);
console.log(`  Unknown / Not Identified: ${unknownCount} (${distribution.concentrations.unknown_percentage}%)`);
console.log(`  HIGH-confidence probable results: ${highProbableCount}`);
console.log(`  MEDIUM-confidence probable results: ${mediumProbableCount}`);
console.log(`  LOW-confidence probable results: ${lowProbableCount}`);
console.log(`  MS260 Concentration Alert (>25%): ${distribution.concentrations.is_ms260_concentration_alert ? 'YES ⚠️' : 'NO ✅'}`);
console.log(`  Critical Mass Fallback (>50%): ${distribution.concentrations.is_critical_mass_fallback ? 'YES ❌' : 'NO ✅'}`);

const outputPath = path.join(rootDir, 'data', 'serial_recovery_distribution_audit.json');
fs.writeFileSync(outputPath, JSON.stringify(distribution, null, 2), 'utf8');
console.log(`✅ 10,000 serial distribution audit written to ${outputPath}`);
