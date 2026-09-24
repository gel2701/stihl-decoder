import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const sqlitePath = path.join(rootDir, 'data', 'stihl_database.db');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const anchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');

const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

test('Recovery Contract 1: Canonical Database Integrity and Range Bounds', () => {
  assert.ok(database.models.length >= 110, `Database must contain active production models (>=110, got ${database.models.length})`);
  assert.strictEqual(database.model_serial_ranges.length, 8, 'Must have exactly 8 active serial ranges');

  const expectedBounds = [
    { range_id: 'range_1121_026_early', plant_code: '1', start: 120000000, end: 139999999, level: 'MODEL_FAMILY_RANGE' },
    { range_id: 'range_4224_br420', plant_code: '1', start: 145000000, end: 159999999, level: 'MODEL_FAMILY_RANGE' },
    { range_id: 'range_1121_ms260_late', plant_code: '1', start: 160000000, end: 169999999, level: 'HISTORICAL_PRODUCTION_RANGE' },
    { range_id: 'range_1141_ms261_gen1', plant_code: '1', start: 171000000, end: 179999999, level: 'PROBABLE_MODEL_SERIES_RANGE' },
    { range_id: 'range_1141_ms261_gen2', plant_code: '1', start: 180000000, end: 199999999, level: 'PROBABLE_MODEL_SERIES_RANGE' },
    { range_id: 'range_1127_ms290_family', plant_code: '2', start: 240000000, end: 269999999, level: 'MODEL_FAMILY_RANGE' },
    { range_id: 'range_4282_br600', plant_code: '2', start: 270000000, end: 289999999, level: 'PROBABLE_MODEL_SERIES_RANGE' },
    { range_id: 'range_4134_fs120_family', plant_code: '3', start: 330000000, end: 350000000, level: 'MODEL_FAMILY_RANGE' }
  ];

  for (const eb of expectedBounds) {
    const r = database.model_serial_ranges.find(x => x.range_id === eb.range_id);
    assert.ok(r, `Range ${eb.range_id} must exist in canonical database`);
    assert.strictEqual(r.plant_code, eb.plant_code);
    assert.strictEqual(r.serial_start, eb.start);
    assert.strictEqual(r.serial_end, eb.end);
    assert.strictEqual(r.range_semantic_level, eb.level);
  }
});

test('Recovery Contract 2: Range 160000000–169999999 Strict Historical Safety', () => {
  const r160 = database.model_serial_ranges.find(x => x.range_id === 'range_1121_ms260_late');
  assert.strictEqual(r160.model_id, null, 'model_id must be null');
  assert.strictEqual(r160.range_semantic_level, 'HISTORICAL_PRODUCTION_RANGE');
  assert.deepStrictEqual(r160.candidate_model_ids, [], 'candidate_model_ids must be empty');

  // Decode unanchored serial
  const resUnanchored = decodeStihlCode('160500000', database);
  assert.strictEqual(resUnanchored.exactModel, null);
  assert.strictEqual(resUnanchored.probableModelSeries, null);
  assert.strictEqual(resUnanchored.identityStatus, 'MODEL_NOT_IDENTIFIED');
  assert.strictEqual(resUnanchored.modelIdentityStatus, 'MODEL_NOT_IDENTIFIED');
  assert.strictEqual(resUnanchored.identitySource, 'SERIAL_RANGE');
  assert.deepStrictEqual(resUnanchored.candidateModelIds, []);
  assert.deepStrictEqual(resUnanchored.modelAssist.candidates, []);
  assert.strictEqual(resUnanchored.modelAssist.available, false);
});

test('Recovery Contract 3: Official Serial Anchor 163118080 Priority 1 Precedence', () => {
  const res = decodeStihlCode('163118080', database);
  assert.strictEqual(res.exactModel, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
  assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.modelIdentityStatus, 'EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(res.modelIdentitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.probableModelSeries, null);
  assert.strictEqual(res.modelAssistAvailable, false);
  assert.deepStrictEqual(res.modelAssist.candidates, []);
});

test('Recovery Contract 4: Decoder Resolution across All 8 Production Ranges', () => {
  const testSerials = [
    { serial: '125000000', plant: '1', level: 'MODEL_FAMILY_RANGE' },
    { serial: '145500000', plant: '1', level: 'MODEL_FAMILY_RANGE' },
    { serial: '160500000', plant: '1', level: 'HISTORICAL_PRODUCTION_RANGE' },
    { serial: '175000000', plant: '1', level: 'PROBABLE_MODEL_SERIES_RANGE' },
    { serial: '185000000', plant: '1', level: 'PROBABLE_MODEL_SERIES_RANGE' },
    { serial: '250000000', plant: '2', level: 'MODEL_FAMILY_RANGE' },
    { serial: '275000000', plant: '2', level: 'PROBABLE_MODEL_SERIES_RANGE' },
    { serial: '340000000', plant: '3', level: 'MODEL_FAMILY_RANGE' }
  ];

  for (const ts of testSerials) {
    const res = decodeStihlCode(ts.serial, database);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.factory.code, ts.plant);
    assert.strictEqual(res.serialResolution.rangeSemanticLevel, ts.level);
  }
});

test('Recovery Contract 5: Full Source of Truth Parity (Anchors, JSON, SQLite)', () => {
  const canonicalAnchorsData = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
  const canonicalAnchors = canonicalAnchorsData.anchors;

  // JSON parity
  assert.deepStrictEqual(database.official_serial_anchors, canonicalAnchors);

  // SQLite parity
  const sqliteDb = new Database(sqlitePath, { readonly: true });
  for (const anchor of canonicalAnchors) {
    const row = sqliteDb.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get(anchor.serial_number);
    assert.ok(row, `Row must exist in SQLite for ${anchor.serial_number}`);
    assert.strictEqual(row.model_name, anchor.model_name);
    assert.strictEqual(row.canonical_model_id, anchor.canonical_model_id);
    assert.strictEqual(row.verification_status, anchor.verification_status);
  }
  sqliteDb.close();
});
