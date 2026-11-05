/**
 * Phase 64 — Universal STIHL Model Recognition & Legacy Coverage Regression
 *
 * Guards the Phase 64 recognition contract:
 *  1. Verified legacy / auxiliary models (025, HS 81, HS 81 R, HS 81 T) stay
 *     findable through the decode + search route with the correct machine
 *     category and drive type.
 *  2. Variant identity stays isolated (HS 81 vs HS 81 R vs HS 81 T).
 *  3. Legacy numeric designations with a leading zero are preserved as model
 *     identities and never rewritten.
 *  4. Model numbers stay separated from serial numbers and part numbers.
 *  5. Unknown designations fail closed (no invented models or specs).
 *  6. The frozen canonical invariants remain untouched: 110 canonical models
 *     and 761 public evidence facts.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { searchIntelligentModels } from '../src/search/IntelligentSearchEngine.js';
import { normalizeModelQuery } from '../src/modelNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const publicEvidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
if (fs.existsSync(publicEvidencePath)) {
  database.public_evidence = JSON.parse(fs.readFileSync(publicEvidencePath, 'utf8'));
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${error.message}`);
  }
}

console.log('\nPhase 64 Model Recognition Regression Suite\n');

// 1. Required recognitions (user route input variants)
const REQUIRED_RECOGNITIONS = [
  { query: '025', model: '025', category: 'Kettingzaag' },
  { query: 'STIHL 025', model: '025', category: 'Kettingzaag' },
  { query: 'HS 81', model: 'HS 81', category: 'Heggenschaar' },
  { query: 'HS81', model: 'HS 81', category: 'Heggenschaar' },
  { query: 'HS 81 R', model: 'HS 81 R', category: 'Heggenschaar' },
  { query: 'HS 81 T', model: 'HS 81 T', category: 'Heggenschaar' },
  { query: '026', model: 'STIHL 026', category: 'Kettingzaag' },
  { query: 'MS 260', model: 'MS 260', category: 'Kettingzaag' }
];

for (const { query, model, category } of REQUIRED_RECOGNITIONS) {
  const bareModel = String(model).replace(/^STIHL\s+/, '');
  test(`decode "${query}" resolves to ${model}`, () => {
    const result = decodeStihlCode(query, database);
    assert.strictEqual(result.success, true, `"${query}" must be recognized`);
    const normalizedResult = String(result.model).replace(/^STIHL\s+/, '');
    assert.strictEqual(normalizedResult, bareModel, `model identity mismatch for "${query}"`);
  });

  test(`decode "${query}" keeps machine category ${category}`, () => {
    const result = decodeStihlCode(query, database);
    assert.strictEqual(result.category, category, `category mismatch for "${query}"`);
  });
}

// 2. Proven drive type for Phase 64 petrol models
const PETROL_2STROKE_QUERIES = ['025', 'HS 81', 'HS 81 R', 'HS 81 T'];
for (const query of PETROL_2STROKE_QUERIES) {
  test(`decode "${query}" reports proven benzine 2-takt drive`, () => {
    const result = decodeStihlCode(query, database);
    assert.strictEqual(result.success, true, `"${query}" must be recognized`);
    assert.strictEqual(result.driveClassification.drive_type, 'PETROL_2STROKE', `drive mismatch for "${query}"`);
    assert.ok(
      /Benzine/.test(result.driveClassification.display_label || ''),
      `drive label must mention benzine for "${query}"`
    );
  });
}

// 3. Family-level recognition (Level 2) without spec invention
const FAMILY_RECOGNITIONS = [
  { query: 'MSA 60', driveType: 'BATTERY_ELECTRIC' },
  { query: 'MSE 141', driveType: 'CORDED_ELECTRIC' }
];
for (const { query, driveType } of FAMILY_RECOGNITIONS) {
  test(`decode "${query}" resolves via verified family with ${driveType}`, () => {
    const result = decodeStihlCode(query, database);
    assert.strictEqual(result.success, true, `"${query}" must be recognized`);
    assert.strictEqual(result.category, 'Kettingzaag', `category mismatch for "${query}"`);
    assert.strictEqual(result.driveClassification.drive_type, driveType, `drive mismatch for "${query}"`);
  });
}

// 4. Variant identity isolation
test('HS 81, HS 81 R and HS 81 T stay distinct identities', () => {
  const base = decodeStihlCode('HS 81', database);
  const right = decodeStihlCode('HS 81 R', database);
  const telescopic = decodeStihlCode('HS 81 T', database);
  assert.strictEqual(base.model, 'HS 81');
  assert.strictEqual(right.model, 'HS 81 R');
  assert.strictEqual(telescopic.model, 'HS 81 T');
  const identities = new Set([base.model, right.model, telescopic.model]);
  assert.strictEqual(identities.size, 3, 'variant identities must not collapse');
});

// 5. Legacy numeric designations with leading zero are preserved
test('legacy 0xx designations are never rewritten', () => {
  for (const designation of ['025', '026', '034', '046']) {
    const normalized = normalizeModelQuery(designation);
    assert.strictEqual(normalized.canonicalQuery, designation, `designation ${designation} was rewritten`);
    assert.strictEqual(normalized.isLegacyNumeric, true, `designation ${designation} lost legacy flag`);
  }
});

// 6. Strict separation: serial numbers and part numbers are never models
test('9-digit serial number is never treated as a model', () => {
  const result = decodeStihlCode('184592301', database);
  assert.notStrictEqual(result.type, 'MODEL_DECODE', 'serial input must not decode as model');
});

test('11-digit part number is never treated as a model', () => {
  const result = decodeStihlCode('00004007025', database);
  assert.notStrictEqual(result.type, 'MODEL_DECODE', 'part number must not decode as model');
});

// 7. Unknown designations fail closed (no invented models or specs)
test('unknown model designation fails closed', () => {
  const result = decodeStihlCode('ZZZ 999', database);
  assert.strictEqual(result.success, false, 'unknown designation must not be recognized');
});

test('unknown legacy numeric designation fails closed', () => {
  const result = decodeStihlCode('099', database);
  assert.strictEqual(result.success, false, 'unknown legacy designation must not be recognized');
});

// 8. Search route keeps verified models findable
test('search route finds 025 as exact identity', () => {
  const result = searchIntelligentModels('025', database);
  assert.ok(result.exactMatch, 'search must return an exact match for 025');
  assert.strictEqual(result.exactMatch.model_name, '025');
});

test('search route finds HS 81 variants as exact identities', () => {
  for (const [query, expected] of [['HS 81', 'HS 81'], ['HS 81 R', 'HS 81 R'], ['HS 81 T', 'HS 81 T']]) {
    const result = searchIntelligentModels(query, database);
    assert.ok(result.exactMatch, `search must return an exact match for "${query}"`);
    assert.strictEqual(result.exactMatch.model_name, expected, `search identity mismatch for "${query}"`);
  }
});

// 9. Frozen canonical invariants (Phase 64 must not add fictional models/specs)
test('canonical model table remains exactly 110 models', () => {
  assert.strictEqual(database.models.length, 110, 'canonical model count must stay 110');
});

test('public evidence store remains exactly 761 facts', () => {
  assert.ok(database.public_evidence, 'public evidence store must be loaded');
  assert.strictEqual(database.public_evidence.facts.length, 761, 'public fact count must stay 761');
});

console.log('\n---------------------------------------------------------------');
console.log(`Phase 64 Model Recognition: ${passed} passed, ${failed} failed`);
console.log('---------------------------------------------------------------\n');

if (failed > 0) {
  process.exit(1);
}
