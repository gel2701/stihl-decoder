import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isExecute = process.argv.includes('--execute');
const dbJsonPath = path.join(rootDir, 'data', 'stihl_database.json');
const coveragePath = path.join(rootDir, 'data', 'serial_recovery_coverage_comparison.json');

console.log(`▶ Rebuild Serial Decoder Ranges — Mode: ${isExecute ? 'EXECUTE (APPLY CHANGES)' : 'DRY RUN'}`);

if (!fs.existsSync(coveragePath)) {
  console.error(`❌ Recovery artifact not found: ${coveragePath}`);
  process.exit(1);
}

const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
const currentDb = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));

const canonicalModelIds = new Set((currentDb.models || []).map(m => m.id));

const newRanges = coverageData.ranges.map(r => {
  const modelIdValid = r.model_id && canonicalModelIds.has(r.model_id);
  return {
    range_id: r.range_id,
    model_id: modelIdValid ? r.model_id : null,
    model_name: r.model_name,
    plant_code: String(r.plant_code),
    serial_start: Number(r.serial_start),
    serial_end: Number(r.serial_end),
    year_start: r.year_start,
    year_end: r.year_end || null,
    generation_name: r.generation,
    technical_changes: r.technical_changes || null,
    range_evidence_class: r.range_evidence_class || 'HISTORICAL_REPOSITORY_EVIDENCE',
    range_semantic_level: r.range_semantic_level || 'PROBABLE_MODEL_SERIES_RANGE',
    source_status: r.source_status || 'HISTORICAL_REPOSITORY_VERIFIED',
    source_refs: r.source_refs || [],
    historical_source_commits: r.historical_source_commits || [],
    confidence_level: r.confidence || 'MEDIUM',
    confidence_reason: r.confidence_reason || null
  };
});

console.log(`Loaded ${newRanges.length} recovered serial ranges for integration:`);
newRanges.forEach((r, idx) => {
  console.log(`  [${idx + 1}] Plant ${r.plant_code}: ${r.serial_start} – ${r.serial_end} -> ${r.model_name} (${r.model_id || 'HISTORICAL_SERIES'})`);
});

// Sanity validations:
// 1. Boundary order
for (const r of newRanges) {
  if (r.serial_start >= r.serial_end) {
    console.error(`❌ Invalid range boundaries: ${r.serial_start} >= ${r.serial_end}`);
    process.exit(1);
  }
}

// 2. Canonical model invariants
if (currentDb.models.length !== 98) {
  console.error(`❌ Canonical models count must be 98, got ${currentDb.models.length}`);
  process.exit(1);
}

if (!isExecute) {
  console.log('\nDRY RUN completed successfully. Re-run with --execute to write changes.');
  process.exit(0);
}

// Apply changes
currentDb.model_serial_ranges = newRanges;
fs.writeFileSync(dbJsonPath, JSON.stringify(currentDb, null, 2) + '\n', 'utf8');
console.log(`\n✅ Updated data/stihl_database.json with ${newRanges.length} model_serial_ranges.`);

// Rebuild SQLite via active seed script
try {
  console.log('▶ Re-seeding SQLite via data/seed.cjs...');
  execSync('node data/seed.cjs', { cwd: rootDir, stdio: 'inherit' });
  console.log('✅ SQLite database successfully synchronized.');
} catch (err) {
  console.error('⚠️ Could not run seed.cjs:', err.message);
}

console.log('🎉 Rebuild complete.');
