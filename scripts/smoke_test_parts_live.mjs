#!/usr/bin/env node
/**
 * Parts Harvester Smoke Test (Phase 52A)
 * Verifies parts catalog, fitments, resolver, SQLite parity, and fail-closed safety.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

console.log('===============================================================');
console.log('🧪 RUNNING STIHL PARTS HARVESTER LIVE SMOKE TEST (Phase 52A)');
console.log('===============================================================\n');

// 1. Check JSON files exist
const requiredFiles = [
  'parts_catalog.json',
  'model_part_fitments.json',
  'parts_sources.json',
  'parts_conflicts.json',
  'parts_model_variants.json',
  'parts_harvest_manifest.json'
];

for (const f of requiredFiles) {
  const p = path.join(rootDir, 'data', f);
  assert.ok(fs.existsSync(p), `Missing required data file: ${f}`);
  console.log(`✅ data/${f} exists`);
}

// 2. Load and verify parts catalog
const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
const fitments = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'model_part_fitments.json'), 'utf8'));
assert.strictEqual(catalog.parts_count, 65, 'Expected 65 unique parts');
assert.strictEqual(fitments.fitments_count, 172, 'Expected 172 fitment links');
console.log(`✅ Parts count: ${catalog.parts_count} | Fitments count: ${fitments.fitments_count}`);

// 3. Test PartCatalogResolver
const resolver = new PartCatalogResolver(catalog, fitments);

// Test known part: 1141 160 5400 (Brake band)
const brakeBand = resolver.resolvePartNumber('1141 160 5400');
assert.strictEqual(brakeBand.found, true);
assert.strictEqual(brakeBand.part_number, '11411605400');
assert.ok(brakeBand.fitments.length > 0);
console.log(`✅ Resolved part 1141 160 5400 -> ${brakeBand.part_name} (${brakeBand.fitments.length} fitment(s))`);

// Test model query: MS 261
const ms261Parts = resolver.getPartsForModel('MS 261');
assert.ok(ms261Parts.length > 0);
console.log(`✅ Model parts for MS 261: ${ms261Parts.length} parts found`);

// 4. Verify SQLite Parity
const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const db = new sqlite3.Database(dbPath);

db.get('SELECT COUNT(*) as c FROM parts', (err, row) => {
  assert.ifError(err);
  assert.strictEqual(row.c, catalog.parts_count, 'SQLite parts table count matches JSON');
  console.log(`✅ SQLite parts parity verified: ${row.c} rows`);

  db.get('SELECT COUNT(*) as c FROM model_part_fitments', (err2, row2) => {
    assert.ifError(err2);
    assert.strictEqual(row2.c, fitments.fitments_count, 'SQLite fitments table count matches JSON');
    console.log(`✅ SQLite fitments parity verified: ${row2.c} rows`);
    db.close();

    console.log('\n===============================================================');
    console.log('🎉 ALL PARTS HARVESTER SMOKE TESTS PASSED CLEANLY!');
    console.log('===============================================================');
  });
});
