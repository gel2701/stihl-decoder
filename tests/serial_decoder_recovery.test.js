import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const sqlitePath = path.join(rootDir, 'data', 'stihl_database.db');
const distributionPath = path.join(rootDir, 'data', 'serial_recovery_distribution_audit.json');

const canonicalDatabase = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const publicEvidenceFacts = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
canonicalDatabase.public_evidence = publicEvidenceFacts;

console.log('▶ Running STIHL Serial Decoder Recovery Acceptance Suite (25+ Gates)...');

// Gate 1: Current 98 models remain intact
assert.strictEqual(canonicalDatabase.models.length, 98, 'Gate 1: Canonical models count must remain exactly 98');
const core5Count = canonicalDatabase.models.filter(m => m.basic_classification?.core5_completeness === 5).length;
assert.strictEqual(core5Count, 98, 'Gate 1b: All 98 models must have CORE5 completeness of 5/5');

// Gate 2: Current 721 public facts unchanged
const factCount = publicEvidenceFacts.facts ? publicEvidenceFacts.facts.length : (Array.isArray(publicEvidenceFacts) ? publicEvidenceFacts.length : 0);
assert.strictEqual(factCount, 721, 'Gate 2: Public evidence facts must remain exactly 721');

// Gate 3: Valid serial format detection
const validRes = decodeStihlCode('160500000', canonicalDatabase);
assert.strictEqual(validRes.success, true, 'Gate 3: Valid 9-digit serial must succeed');
assert.strictEqual(validRes.type, 'SERIAL_NUMBER', 'Gate 3: Valid 9-digit serial must be SERIAL_NUMBER');
const invalidRes = decodeStihlCode('999999999', canonicalDatabase);
assert.strictEqual(invalidRes.isCounterfeit, true, 'Gate 3b: Known fake prefix must be flagged as counterfeit');

// Gate 4: Plant code resolution
const plantTests = [
  { serial: '160500000', code: '1', country: 'Duitsland' },
  { serial: '250000000', code: '2', country: 'Verenigde Staten' },
  { serial: '335000000', code: '3', country: 'Brazilië' },
  { serial: '412345678', code: '4', country: 'Zwitserland' },
  { serial: '512345678', code: '5', country: 'Verenigde Staten' },
  { serial: '824061159', code: '8', country: null }, // Plant 8 fail-closed per Phase 36 contract
  { serial: '912345678', code: '9', country: 'Speciaal / Internationale Assemblage' }
];
for (const pt of plantTests) {
  const r = decodeStihlCode(pt.serial, canonicalDatabase);
  assert.strictEqual(r.factory.code, pt.code, `Gate 4: Serial ${pt.serial} must resolve plant code ${pt.code}`);
  assert.strictEqual(r.factory.country, pt.country, `Gate 4: Serial ${pt.serial} must resolve country ${pt.country}`);
}

// Gate 5: Historical MS 260 case
const ms260Res = decodeStihlCode('160500000', canonicalDatabase);
assert.ok(ms260Res.exactModel?.includes('MS 260') || ms260Res.probableModelSeries?.includes('MS 260'), 'Gate 5: Serial 160500000 must resolve to MS 260');
assert.strictEqual(ms260Res.serialResolution?.matchReason, 'Serienummer valt binnen een unieke historische fabrieksreeks.', 'Gate 5b: Match reason must reflect unique historical factory range');

// Gate 6: Historical MS 261 case
const ms261Gen1 = decodeStihlCode('175000000', canonicalDatabase);
assert.ok(ms261Gen1.exactModel?.includes('MS 261') || ms261Gen1.probableModelSeries?.includes('MS 261'), 'Gate 6: Serial 175000000 must resolve to MS 261');
const ms261Gen2 = decodeStihlCode('185000000', canonicalDatabase);
assert.ok(ms261Gen2.exactModel?.includes('MS 261') || ms261Gen2.probableModelSeries?.includes('MS 261'), 'Gate 6b: Serial 185000000 must resolve to MS 261 C-M');

// Gate 7: BR 600 historical case
const br600Res = decodeStihlCode('275000000', canonicalDatabase);
assert.ok(br600Res.exactModel?.includes('BR 600') || br600Res.probableModelSeries?.includes('BR 600'), 'Gate 7: Serial 275000000 must resolve to BR 600');
assert.strictEqual(br600Res.category, 'Bladblazer', 'Gate 7b: BR 600 must resolve to Bladblazer category');

// Gate 8: MS 170 / 180 Plant 8 China handling
const chinaRes = decodeStihlCode('824061159', canonicalDatabase);
assert.strictEqual(chinaRes.modelIdentityStatus, 'MODEL_NOT_IDENTIFIED', 'Gate 8: Plant 8 unassisted serial must not be forced to a model');
assert.strictEqual(chinaRes.exactModel, null, 'Gate 8b: Plant 8 unassisted serial must have exactModel null');
assert.notStrictEqual(chinaRes.model, 'MS 260', 'Gate 8c: Plant 8 serial must NEVER fall back to MS 260');

// Gate 9: No generic MS 260 fallback
const falseRangesPlant1 = ['111222333', '140500000', '170000001', '100000000'];
for (const s of falseRangesPlant1) {
  const r = decodeStihlCode(s, canonicalDatabase);
  assert.strictEqual(r.exactModel, null, `Gate 9: Serial ${s} must not have exactModel MS 260`);
  assert.notStrictEqual(r.model, 'MS 260', `Gate 9: Serial ${s} must not fallback to MS 260`);
}

// Gate 10: No generic MS 261 fallback
const falseMs261 = ['170500000', '170999999', '200000001'];
for (const s of falseMs261) {
  const r = decodeStihlCode(s, canonicalDatabase);
  assert.strictEqual(r.exactModel, null, `Gate 10: Serial ${s} outside 171M-199M must not resolve exact MS 261`);
}

// Gate 11: Plant 2 not mapped to MS 260 by default
const plant2Serials = ['200000001', '210000000', '295000000'];
for (const s of plant2Serials) {
  const r = decodeStihlCode(s, canonicalDatabase);
  assert.notStrictEqual(r.model, 'MS 260', `Gate 11: Plant 2 serial ${s} must not map to MS 260`);
  assert.notStrictEqual(r.probableModelSeries, 'MS 260', `Gate 11: Plant 2 serial ${s} must not have probable series MS 260`);
}

// Gate 12: Plant 8 not mapped to MS 260 by default
const plant8Serials = ['810000000', '850000000', '888000000'];
for (const s of plant8Serials) {
  const r = decodeStihlCode(s, canonicalDatabase);
  assert.notStrictEqual(r.model, 'MS 260', `Gate 12: Plant 8 serial ${s} must not map to MS 260`);
}

// Gate 13: Range boundaries
const boundaryTests = [
  { serial: '144999999', inRange: false },
  { serial: '145000000', inRange: true, expectedModel: 'BR 420' },
  { serial: '159999999', inRange: true, expectedModel: 'BR 420' },
  { serial: '160000000', inRange: true, expectedModel: 'MS 260' },
  { serial: '169999999', inRange: true, expectedModel: 'MS 260' },
  { serial: '170000000', inRange: false },
  { serial: '170999999', inRange: false },
  { serial: '171000000', inRange: true, expectedModel: 'MS 261' },
  { serial: '179999999', inRange: true, expectedModel: 'MS 261' },
  { serial: '180000000', inRange: true, expectedModel: 'MS 261' },
  { serial: '199999999', inRange: true, expectedModel: 'MS 261' },
  { serial: '200000000', inRange: false },
  { serial: '239999999', inRange: false },
  { serial: '240000000', inRange: true, expectedModel: 'MS 290' },
  { serial: '269999999', inRange: true, expectedModel: 'MS 290' },
  { serial: '270000000', inRange: true, expectedModel: 'BR 600' },
  { serial: '289999999', inRange: true, expectedModel: 'BR 600' },
  { serial: '290000000', inRange: false },
  { serial: '329999999', inRange: false },
  { serial: '330000000', inRange: true, expectedModel: 'FS 120' },
  { serial: '350000000', inRange: true, expectedModel: 'FS 120' },
  { serial: '350000001', inRange: false }
];
for (const bt of boundaryTests) {
  const r = decodeStihlCode(bt.serial, canonicalDatabase);
  if (bt.inRange) {
    const matched = (r.exactModel && r.exactModel.includes(bt.expectedModel)) ||
                    (r.probableModelSeries && r.probableModelSeries.includes(bt.expectedModel));
    assert.ok(matched, `Gate 13: Boundary serial ${bt.serial} should match ${bt.expectedModel}`);
  } else {
    assert.strictEqual(r.serialResolution?.rangeId, null, `Gate 13: Out-of-bounds serial ${bt.serial} must not match range`);
  }
}

// Gate 14: Overlaps handling
const br420OverlapTest = decodeStihlCode('148000000', canonicalDatabase);
assert.strictEqual(br420OverlapTest.serialResolution?.matchType, 'UNIQUE_RANGE_MATCH', 'Gate 14: Isolated range must classify as UNIQUE_RANGE_MATCH');

// Gate 15: Exact vs Probable distinction
const exactVsProbableRes = decodeStihlCode('160500000', canonicalDatabase);
assert.strictEqual(exactVsProbableRes.modelIdentityStatus, 'PROBABLE_MODEL_SERIES', 'Gate 15: Range match without user confirmation is PROBABLE_MODEL_SERIES');

// Gate 16: Chronology-only result
const unmappedSerial = decodeStihlCode('412345678', canonicalDatabase);
assert.strictEqual(unmappedSerial.modelIdentityStatus, 'MODEL_NOT_IDENTIFIED', 'Gate 16: Unmapped serial must have MODEL_NOT_IDENTIFIED');
assert.strictEqual(unmappedSerial.serialResolution?.level, 'FORMAT_ONLY', 'Gate 16b: Unmapped serial must have FORMAT_ONLY level');

// Gate 17: Model-family result
const familyRes = decodeStihlCode('125000000', canonicalDatabase);
assert.ok(familyRes.probableModelSeries?.includes('026') || familyRes.probableModelSeries?.includes('260'), 'Gate 17: Serial 125000000 must resolve 026 / MS 260 series');

// Gate 18: Unknown only when no better signal exists
assert.strictEqual(unmappedSerial.model, 'Nog niet definitief bevestigd', 'Gate 18: Unmapped serial returns honest unconfirmed message');

// Gate 19: Probable model does not inherit exact specs
assert.deepStrictEqual(exactVsProbableRes.technicalSpecs, {}, 'Gate 19: Probable model series must NOT populate technicalSpecs');
assert.strictEqual(exactVsProbableRes.safeTechnicalPreview?.available, true, 'Gate 19b: Probable model must use safeTechnicalPreview');

// Gate 20: User-confirmed model still works
const confirmedRes = decodeStihlCode('160500000', canonicalDatabase, { confirmedModel: 'MS 260' });
assert.strictEqual(confirmedRes.modelIdentityStatus, 'USER_CONFIRMED_MODEL', 'Gate 20: Confirmed model must update status');
assert.strictEqual(confirmedRes.confirmedModel, 'MS 260', 'Gate 20b: Confirmed model name must match');
assert.ok(Object.keys(confirmedRes.technicalSpecs).length > 0, 'Gate 20c: Confirmed model must load technicalSpecs');

// Gate 21: Part-number decoder unchanged
const partRes = decodeStihlCode('1123 020 1200', canonicalDatabase);
assert.strictEqual(partRes.type, 'PART_NUMBER', 'Gate 21: Part number must decode as PART_NUMBER');
assert.strictEqual(partRes.familyCode, '1123', 'Gate 21b: Family code must be 1123');

// Gate 22: Model search unchanged
const searchRes = decodeStihlCode('MS 261 C-M', canonicalDatabase);
assert.strictEqual(searchRes.type, 'MODEL_DECODE', 'Gate 22: Model search must return MODEL_DECODE');
assert.strictEqual(searchRes.success, true, 'Gate 22b: Model search must succeed');

// Gate 23: StopHeling integration unchanged
assert.ok(validRes.stopHelingUrl?.includes('stopheling.nl'), 'Gate 23: Serial decode must include StopHeling URL');

// Gate 24: Deterministic replay
const replayA = JSON.stringify(decodeStihlCode('160500000', canonicalDatabase));
const replayB = JSON.stringify(decodeStihlCode('160500000', canonicalDatabase));
assert.strictEqual(replayA, replayB, 'Gate 24: Multiple runs of decodeStihlCode must produce deterministic identical output');

// Gate 25: 10k-distribution invariants
assert.ok(fs.existsSync(distributionPath), 'Gate 25: 10k distribution audit artifact must exist');
const distData = JSON.parse(fs.readFileSync(distributionPath, 'utf8'));
assert.strictEqual(distData.total_tested, 10000, 'Gate 25b: Distribution audit must test exactly 10,000 serials');
assert.ok(distData.concentrations.ms260_percentage < 25.0, `Gate 25c: MS 260 concentration must be < 25% (was ${distData.concentrations.ms260_percentage}%)`);
assert.ok(distData.concentrations.ms261_percentage < 25.0, `Gate 25d: MS 261 concentration must be < 25% (was ${distData.concentrations.ms261_percentage}%)`);
assert.strictEqual(distData.concentrations.is_critical_mass_fallback, false, 'Gate 25e: Must not have critical mass fallback');

// Gate 26: Source-of-Truth & Database Drift (Section 69)
assert.ok(fs.existsSync(sqlitePath), 'Gate 26: SQLite database file must exist');
const sqlite = new Database(sqlitePath, { readonly: true });
const sqliteRanges = sqlite.prepare('SELECT model_id, plant_code, serial_start, serial_end, year_start, year_end, generation_name FROM model_serial_ranges ORDER BY serial_start').all();
sqlite.close();

const jsonRanges = (canonicalDatabase.model_serial_ranges || []).map(r => ({
  model_id: r.model_id,
  plant_code: String(r.plant_code),
  serial_start: r.serial_start,
  serial_end: r.serial_end,
  year_start: r.year_start,
  year_end: r.year_end,
  generation_name: r.generation_name
})).sort((a, b) => a.serial_start - b.serial_start);

assert.strictEqual(sqliteRanges.length, jsonRanges.length, 'Gate 26b: SQLite and JSON serial range counts must be identical');
for (let i = 0; i < jsonRanges.length; i++) {
  assert.strictEqual(sqliteRanges[i].model_id, jsonRanges[i].model_id, `Gate 26c: Model ID mismatch at index ${i}`);
  assert.strictEqual(sqliteRanges[i].plant_code, jsonRanges[i].plant_code, `Gate 26d: Plant code mismatch at index ${i}`);
  assert.strictEqual(sqliteRanges[i].serial_start, jsonRanges[i].serial_start, `Gate 26e: Range start mismatch at index ${i}`);
  assert.strictEqual(sqliteRanges[i].serial_end, jsonRanges[i].serial_end, `Gate 26f: Range end mismatch at index ${i}`);
  assert.strictEqual(sqliteRanges[i].generation_name, jsonRanges[i].generation_name, `Gate 26g: Generation mismatch at index ${i}`);
}

console.log('✅ ALL 25+ SERIAL DECODER RECOVERY GATES PASSED (100% SUCCESS)');
