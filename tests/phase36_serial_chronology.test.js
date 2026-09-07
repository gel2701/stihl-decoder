import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SerialChronologyResolver } from '../src/SerialChronologyResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('▶ Running Phase 36 Serial Chronology Tests...');

// 1. Production Dataset Integrity: Zero Synthetic Anchors in Production
const prodAnchorsFile = path.join(rootDir, 'data', 'serial_chronology_anchors.json');
assert.ok(fs.existsSync(prodAnchorsFile), 'Production anchors file must exist');
const prodDataset = JSON.parse(fs.readFileSync(prodAnchorsFile, 'utf8'));
assert.strictEqual(prodDataset.schema_version || prodDataset.schemaVersion, 'serial-chronology-v1');
assert.ok(Array.isArray(prodDataset.anchors));
assert.strictEqual(prodDataset.anchors.length, 0, 'Production anchors dataset must not contain synthetic anchors');

// 2. Production fail-closed behavior when no anchors exist
const unanchored = SerialChronologyResolver.resolve('824061159', { anchors: prodDataset.anchors, plantCode: '8' });
assert.strictEqual(unanchored.status, 'UNKNOWN');
assert.strictEqual(unanchored.estimatedYear, null);
assert.strictEqual(unanchored.estimatedStart, null);

// 3. Synthetic Fixture for Mathematical Interpolation & Distance Testing
const syntheticAnchors = [
  {
    serial: '170000000',
    serial_numeric: 170000000,
    plant_code: '1',
    production_year: 2012,
    confidence: 'HIGH',
    sourceRef: 'DOC-170-TEST'
  },
  {
    serial: '190000000',
    serial_numeric: 190000000,
    plant_code: '1',
    production_year: 2018,
    confidence: 'HIGH',
    sourceRef: 'DOC-190-TEST'
  },
  {
    serial: '810000000',
    serial_numeric: 810000000,
    plant_code: '8',
    production_year: 2011,
    confidence: 'HIGH',
    sourceRef: 'DOC-810-TEST'
  }
];

// Exact match resolution
const exact = SerialChronologyResolver.resolve('170000000', { anchors: syntheticAnchors, plantCode: '1' });
assert.ok(exact.status === 'EXACT' || exact.status === 'EXACT_DOCUMENTED_YEAR');
assert.strictEqual(exact.estimatedStart, 2012);
assert.strictEqual(exact.confidence, 'HIGH');
assert.strictEqual(exact.method, 'EXACT_ANCHOR_MATCH');

// Linear / bounded interpolation between two anchors at plant 1
const interpolated = SerialChronologyResolver.resolve('180000000', { anchors: syntheticAnchors, plantCode: '1' });
assert.ok(interpolated.status === 'ESTIMATED' || interpolated.status === 'CHRONOLOGY_ESTIMATE');
assert.ok(interpolated.estimatedYear >= 2012 && interpolated.estimatedYear <= 2018);
assert.ok(interpolated.method === 'LINEAR_INTERPOLATION' || interpolated.method === 'BOUNDED_INTERPOLATION');
assert.ok(['MEDIUM', 'HIGH'].includes(interpolated.confidence));

// Plant isolation: Serial starting with 8 must only match plant 8 anchors
const plant8Exact = SerialChronologyResolver.resolve('810000000', { anchors: syntheticAnchors, plantCode: '8' });
assert.ok(plant8Exact.status === 'EXACT' || plant8Exact.status === 'EXACT_DOCUMENTED_YEAR');
assert.strictEqual(plant8Exact.estimatedStart, 2011);

// Plant 8 unknown serial with single anchor falls to insufficient anchors or extrapolation blocked
const plant8Other = SerialChronologyResolver.resolve('890000000', { anchors: syntheticAnchors, plantCode: '8' });
assert.ok(['INSUFFICIENT_ANCHORS', 'EXTRAPOLATION_BLOCKED', 'UNKNOWN'].includes(plant8Other.status));

console.log('✅ Phase 36 Serial Chronology Tests Passed 100%.');
