import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const officialAnchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const aliasesPath = path.join(rootDir, 'data', 'official_serial_input_aliases.json');
const stihlDbJsonPath = path.join(rootDir, 'data', 'stihl_database.json');
const stihlDbSqlitePath = path.join(rootDir, 'data', 'stihl_database.db');
const batch3ManifestPath = path.join(rootDir, 'data', 'import_batches', 'serials_2026-10-09', 'batch_manifest.json');

const anchorsDoc = JSON.parse(fs.readFileSync(officialAnchorsPath, 'utf8'));
const aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
const stihlDbJson = JSON.parse(fs.readFileSync(stihlDbJsonPath, 'utf8'));
const batch3Manifest = JSON.parse(fs.readFileSync(batch3ManifestPath, 'utf8'));

const db = new Database(stihlDbSqlitePath);

console.log('=== PHASE 53A COMPREHENSIVE INTEGRITY AUDIT ===\n');

// 1. Anchor Counts
const jsonAnchorCount = anchorsDoc.anchors.length;
const dbJsonAnchorCount = stihlDbJson.official_serial_anchors.length;
const sqliteAnchorCount = db.prepare('SELECT COUNT(*) as cnt FROM official_serial_anchors').get().cnt;

console.log('Official Anchors Counts:');
console.log('  official_serial_anchors.json:', jsonAnchorCount);
console.log('  stihl_database.json:', dbJsonAnchorCount);
console.log('  stihl_database.db (SQLite):', sqliteAnchorCount);

if (jsonAnchorCount !== 8874 || dbJsonAnchorCount !== 8874 || sqliteAnchorCount !== 8874) {
  console.error('ERROR: Anchor count mismatch! Expected 8874.');
  process.exit(1);
}

// 2. Alias Counts
const jsonAliasCount = aliasesDoc.aliases.length;
const dbJsonAliasCount = stihlDbJson.official_serial_input_aliases.length;
const sqliteAliasCount = db.prepare('SELECT COUNT(*) as cnt FROM official_serial_input_aliases').get().cnt;

console.log('\nOfficial Serial Input Aliases Counts:');
console.log('  official_serial_input_aliases.json:', jsonAliasCount);
console.log('  stihl_database.json:', dbJsonAliasCount);
console.log('  stihl_database.db (SQLite):', sqliteAliasCount);

if (jsonAliasCount !== 171 || dbJsonAliasCount !== 171 || sqliteAliasCount !== 171) {
  console.error('ERROR: Alias count mismatch! Expected 171.');
  process.exit(1);
}

// 3. Parts Foundation
const partsCount = db.prepare('SELECT COUNT(*) as cnt FROM parts').get().cnt;
const fitmentsCount = db.prepare('SELECT COUNT(*) as cnt FROM model_part_fitments').get().cnt;
const evidenceCount = db.prepare('SELECT COUNT(*) as cnt FROM part_fitment_evidence').get().cnt;
const configsCount = db.prepare('SELECT COUNT(*) as cnt FROM parts_model_configurations').get().cnt;

console.log('\nParts Foundation Counts:');
console.log('  Parts:', partsCount, '(expected 17082)');
console.log('  Canonical Fitments:', fitmentsCount, '(expected 175106)');
console.log('  Evidence Observations:', evidenceCount, '(expected 206607)');
console.log('  Configurations:', configsCount, '(expected 766)');

if (partsCount !== 17082 || fitmentsCount !== 175106 || evidenceCount !== 206607 || configsCount !== 766) {
  console.error('ERROR: Parts foundation mismatch!');
  process.exit(1);
}

// 4. Anchor 163148080 (Positive evidence preservation)
const anchor163148080_json = anchorsDoc.anchors.find(a => a.serial_number === '163148080');
const anchor163148080_sqlite = db.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get('163148080');

console.log('\nAnchor 163148080 Preservation:');
console.log('  JSON Model:', anchor163148080_json?.model_name);
console.log('  SQLite Model:', anchor163148080_sqlite?.model_name);

if (!anchor163148080_json || !anchor163148080_json.model_name.includes('MS 260-W')) {
  console.error('ERROR: 163148080 not preserved as MS 260-W in JSON!');
  process.exit(1);
}

// 5. Reconfirmed Anchors
const anchor163130555 = db.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get('163130555');
const anchor163158080 = db.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get('163158080');
console.log('\nReconfirmed Anchors:');
console.log('  163130555:', anchor163130555?.model_name);
console.log('  163158080:', anchor163158080?.model_name);

// 6. Duplicate Resolution: 163150525
const anchor163150525 = db.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get('163150525');
console.log('\nDuplicate Resolution (163150525 with 1 error & 1 positive):');
console.log('  163150525 Model:', anchor163150525?.model_name, '(expected FS 450 Freischneider)');

if (anchor163150525?.model_name !== 'FS 450 Freischneider') {
  console.error('ERROR: 163150525 positive resolution failed!');
  process.exit(1);
}

// 7. Full SQLite vs JSON 100% Parity
const allSqliteAnchors = db.prepare('SELECT * FROM official_serial_anchors ORDER BY serial_number').all();
if (allSqliteAnchors.length !== anchorsDoc.anchors.length) {
  console.error('ERROR: Anchors length mismatch between SQLite and JSON!');
  process.exit(1);
}

for (let i = 0; i < allSqliteAnchors.length; i++) {
  const sq = allSqliteAnchors[i];
  const js = anchorsDoc.anchors[i];
  if (sq.serial_number !== js.serial_number || sq.model_name !== js.model_name || sq.category !== js.category || sq.drive_type !== js.drive_type) {
    console.error(`ERROR: Parity mismatch at index ${i}:`, sq, js);
    process.exit(1);
  }
}
console.log('\nSQLite / JSON Parity: 100% (8874 / 8874 exact matches)');

// 8. Categories & Drive Types
const catCounts = {};
const driveCounts = {};
for (const a of anchorsDoc.anchors) {
  catCounts[a.category || 'Onbekend'] = (catCounts[a.category || 'Onbekend'] || 0) + 1;
  driveCounts[a.drive_type || 'Onbekend'] = (driveCounts[a.drive_type || 'Onbekend'] || 0) + 1;
}

console.log('\nCumulative Category Breakdown (8874 Anchors):');
console.table(Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => ({ Categorie: cat, Aantal: cnt })));

console.log('Cumulative Drive Type Breakdown (8874 Anchors):');
console.table(Object.entries(driveCounts).sort((a, b) => b[1] - a[1]).map(([drive, cnt]) => ({ Aandrijving: drive, Aantal: cnt })));

db.close();
console.log('\nAUDIT COMPLETE — ALL CHECKS PASSED.');
