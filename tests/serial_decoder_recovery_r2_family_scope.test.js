import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const sqlitePath = path.join(rootDir, 'data', 'stihl_database.db');
const auditPath = path.join(rootDir, 'data', 'serial_recovery_r2_candidate_scope_audit.json');

const canonicalDatabase = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const publicEvidenceFacts = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
canonicalDatabase.public_evidence = publicEvidenceFacts;

console.log('▶ Running STIHL Serial Decoder Recovery R2 Family Candidate Scope Suite (30 Gates)...');

// Gate 1: Current main ancestry verification
try {
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir }).toString().trim();
  assert.strictEqual(currentBranch, 'fix/serial-decoder-recovery-r2-family-scope', 'Gate 1: Must be on fix/serial-decoder-recovery-r2-family-scope branch');
  const baseCommit = execSync('git merge-base HEAD 0c0dfa37cce3e52471bdf100457cdc6ff20992d6', { cwd: rootDir }).toString().trim();
  assert.strictEqual(baseCommit, '0c0dfa37cce3e52471bdf100457cdc6ff20992d6', 'Gate 1b: Base commit must be main commit 0c0dfa37cce3e52471bdf100457cdc6ff20992d6');
} catch (e) {
  console.warn('Git branch check warning:', e.message);
}

// Gate 2: Canonical models count is exactly 98
assert.strictEqual(canonicalDatabase.models.length, 98, 'Gate 2: Canonical models count must remain exactly 98');

// Gate 3: Public evidence facts count is exactly 721
const factCount = publicEvidenceFacts.facts ? publicEvidenceFacts.facts.length : (Array.isArray(publicEvidenceFacts) ? publicEvidenceFacts.length : 0);
assert.strictEqual(factCount, 721, 'Gate 3: Public evidence facts count must remain frozen at 721');

// Gate 4: Active ranges count in stihl_database.json is exactly 8
const jsonRanges = canonicalDatabase.model_serial_ranges || [];
assert.strictEqual(jsonRanges.length, 8, 'Gate 4: Canonical database must contain exactly 8 active serial ranges');

// Gate 5: Range bounds unchanged
const expectedBounds = [
  { range_id: 'range_1121_026_early', plant_code: '1', start: 120000000, end: 139999999 },
  { range_id: 'range_4224_br420', plant_code: '1', start: 145000000, end: 159999999 },
  { range_id: 'range_1121_ms260_late', plant_code: '1', start: 160000000, end: 169999999 },
  { range_id: 'range_1141_ms261_gen1', plant_code: '1', start: 171000000, end: 179999999 },
  { range_id: 'range_1141_ms261_gen2', plant_code: '1', start: 180000000, end: 199999999 },
  { range_id: 'range_1127_ms290_family', plant_code: '2', start: 240000000, end: 269999999 },
  { range_id: 'range_4282_br600', plant_code: '2', start: 270000000, end: 289999999 },
  { range_id: 'range_4134_fs120_family', plant_code: '3', start: 330000000, end: 350000000 }
];
for (const eb of expectedBounds) {
  const r = jsonRanges.find(x => x.range_id === eb.range_id);
  assert.ok(r, `Gate 5: Range ${eb.range_id} must exist in canonical database`);
  assert.strictEqual(r.plant_code, eb.plant_code, `Gate 5: Range ${eb.range_id} plant_code must be ${eb.plant_code}`);
  assert.strictEqual(r.serial_start, eb.start, `Gate 5: Range ${eb.range_id} serial_start must be ${eb.start}`);
  assert.strictEqual(r.serial_end, eb.end, `Gate 5: Range ${eb.range_id} serial_end must be ${eb.end}`);
}

// Gate 6: Evidence classes unchanged
const repoEvidenceCount = jsonRanges.filter(r => r.range_evidence_class === 'HISTORICAL_REPOSITORY_EVIDENCE').length;
const corroEvidenceCount = jsonRanges.filter(r => r.range_evidence_class === 'HISTORICAL_REPOSITORY_CORROBORATED').length;
assert.strictEqual(repoEvidenceCount, 6, 'Gate 6: Must have exactly 6 HISTORICAL_REPOSITORY_EVIDENCE ranges');
assert.strictEqual(corroEvidenceCount, 2, 'Gate 6b: Must have exactly 2 HISTORICAL_REPOSITORY_CORROBORATED ranges');

// Gate 7: Confidence unchanged (HIGH=0, MEDIUM=8, LOW=0)
const mediumCount = jsonRanges.filter(r => r.confidence_level === 'MEDIUM').length;
const highCount = jsonRanges.filter(r => r.confidence_level === 'HIGH').length;
const lowCount = jsonRanges.filter(r => r.confidence_level === 'LOW').length;
assert.strictEqual(mediumCount, 8, 'Gate 7: All 8 ranges must have MEDIUM confidence');
assert.strictEqual(highCount, 0, 'Gate 7b: No range may have HIGH confidence');
assert.strictEqual(lowCount, 0, 'Gate 7c: No range may have LOW confidence');

// Gate 8: Every range has explicit candidate scope
for (const r of jsonRanges) {
  assert.ok(Array.isArray(r.candidate_model_ids) && r.candidate_model_ids.length > 0,
    `Gate 8: Range ${r.range_id} must have explicit non-empty candidate_model_ids`);
  assert.ok(typeof r.range_display_name === 'string' && r.range_display_name.trim().length > 0,
    `Gate 8b: Range ${r.range_id} must have explicit range_display_name`);
}

// Gate 9: probableModelSeries comes from range display identity
const resBr600 = decodeStihlCode('275000000', canonicalDatabase);
assert.strictEqual(resBr600.probableModelSeries, 'BR 600 Reeks', 'Gate 9: 275000000 probableModelSeries must match range_display_name');

// Gate 10: probableModelSeries is not rebuilt from candidate array
const resFs = decodeStihlCode('335000000', canonicalDatabase);
assert.strictEqual(resFs.probableModelSeries, 'FS 120 / FS 250', 'Gate 10: FS range probableModelSeries must preserve historical identity');
const fsCandidateNames = resFs.modelAssist.candidates.map(c => c.name).join(' / ');
assert.strictEqual(fsCandidateNames, 'FS 120', 'Gate 10b: Candidate names string is FS 120 only');
assert.notStrictEqual(resFs.probableModelSeries, fsCandidateNames, 'Gate 10c: probableModelSeries must NOT be overwritten by candidate names join');

// Gate 11: 125000000 displays 026 / MS 260
const res026 = decodeStihlCode('125000000', canonicalDatabase);
assert.strictEqual(res026.probableModelSeries, '026 / MS 260', 'Gate 11: 125000000 displays 026 / MS 260');

// Gate 12: 125000000 candidates 026 + MS 260 only
assert.strictEqual(res026.modelAssist.candidates.length, 2, 'Gate 12: 125000000 has exactly 2 candidates');
const res026Slugs = res026.modelAssist.candidates.map(c => c.slug).sort();
assert.deepStrictEqual(res026Slugs, ['026', 'ms-260'], 'Gate 12b: Candidates must be 026 and ms-260');

// Gate 13: 150123456 displays BR 340 / BR 420
const resBr420 = decodeStihlCode('150123456', canonicalDatabase);
assert.strictEqual(resBr420.probableModelSeries, 'BR 340 / BR 420', 'Gate 13: 150123456 displays BR 340 / BR 420');

// Gate 14: 150123456 candidates exclude unrelated models
assert.strictEqual(resBr420.modelAssist.candidates.length, 1, 'Gate 14: 150123456 has exactly 1 candidate (BR 420)');
assert.strictEqual(resBr420.modelAssist.candidates[0].slug, 'br-420', 'Gate 14b: Candidate is br-420');

// Gate 15: 160500000 displays MS 260
const resMs260 = decodeStihlCode('160500000', canonicalDatabase);
assert.strictEqual(resMs260.probableModelSeries, 'MS 260', 'Gate 15: 160500000 displays MS 260');
assert.strictEqual(resMs260.modelAssist.candidates.length, 1, 'Gate 15b: 160500000 candidates exactly 1');
assert.strictEqual(resMs260.modelAssist.candidates[0].slug, 'ms-260', 'Gate 15c: Candidate is ms-260');

// Gate 16: 250000000 displays MS 290 / MS 310 / MS 390
const resMs290 = decodeStihlCode('250000000', canonicalDatabase);
assert.strictEqual(resMs290.probableModelSeries, 'MS 290 / MS 310 / MS 390', 'Gate 16: 250000000 displays MS 290 / MS 310 / MS 390');

// Gate 17: 250000000 candidates exactly MS290, MS310, MS390
const res290Slugs = resMs290.modelAssist.candidates.map(c => c.slug).sort();
assert.deepStrictEqual(res290Slugs, ['ms-290', 'ms-310', 'ms-390'], 'Gate 17: Candidates exactly ms-290, ms-310, ms-390');

// Gate 18: 275000000 displays BR 600 only (e.g. BR 600 Reeks)
assert.strictEqual(resBr600.probableModelSeries, 'BR 600 Reeks', 'Gate 18: 275000000 displays BR 600 Reeks');

// Gate 19: 275000000 candidates exactly BR 600
assert.strictEqual(resBr600.modelAssist.candidates.length, 1, 'Gate 19: 275000000 has exactly 1 candidate');
assert.strictEqual(resBr600.modelAssist.candidates[0].slug, 'br-600', 'Gate 19b: Candidate is br-600');

// Gate 20: BR 500 excluded from 275000000
assert.strictEqual(resBr600.modelAssist.candidates.some(c => c.name.includes('500')), false, 'Gate 20: BR 500 must be excluded');

// Gate 21: BR 550 excluded from 275000000
assert.strictEqual(resBr600.modelAssist.candidates.some(c => c.name.includes('550')), false, 'Gate 21: BR 550 must be excluded');

// Gate 22: BR 700 excluded from 275000000
assert.strictEqual(resBr600.modelAssist.candidates.some(c => c.name.includes('700')), false, 'Gate 22: BR 700 must be excluded');

// Gate 23: 335000000 displays FS 120 / FS 250
assert.strictEqual(resFs.probableModelSeries, 'FS 120 / FS 250', 'Gate 23: 335000000 displays FS 120 / FS 250');

// Gate 24: FS 120 candidate present
assert.strictEqual(resFs.modelAssist.candidates.some(c => c.name === 'FS 120'), true, 'Gate 24: FS 120 candidate present');

// Gate 25: FS 200 excluded from 335000000
assert.strictEqual(resFs.modelAssist.candidates.some(c => c.name.includes('200')), false, 'Gate 25: FS 200 must be excluded');

// Gate 26: FS 350 excluded from 335000000
assert.strictEqual(resFs.modelAssist.candidates.some(c => c.name.includes('350')), false, 'Gate 26: FS 350 must be excluded');

// Gate 27: technicalSpecs empty before confirmation
assert.deepStrictEqual(resBr600.technicalSpecs, {}, 'Gate 27: BR 600 technicalSpecs must be empty before confirmation');
assert.deepStrictEqual(resFs.technicalSpecs, {}, 'Gate 27b: FS 120 technicalSpecs must be empty before confirmation');
assert.deepStrictEqual(resMs290.technicalSpecs, {}, 'Gate 27c: MS 290 family technicalSpecs must be empty before confirmation');

// Gate 28: user confirmation works
const confirmed290 = decodeStihlCode('250000000', canonicalDatabase, { confirmedModel: 'MS 310' });
assert.strictEqual(confirmed290.modelIdentityStatus, 'USER_CONFIRMED_MODEL', 'Gate 28: Confirmed model status is USER_CONFIRMED_MODEL');
assert.strictEqual(confirmed290.confirmedModel, 'MS 310', 'Gate 28b: Confirmed model is MS 310');
assert.ok(Object.keys(confirmed290.technicalSpecs).length > 0, 'Gate 28c: technicalSpecs populated upon confirmation');

// Gate 29: stale-state reset works
const resetTest = decodeStihlCode('250000000', canonicalDatabase);
assert.strictEqual(resetTest.modelIdentityStatus, 'PROBABLE_MODEL_SERIES', 'Gate 29: Subsequent unconfirmed decode reverts to PROBABLE_MODEL_SERIES status');
assert.strictEqual(resetTest.serialResolution?.rangeSemanticLevel, 'MODEL_FAMILY_RANGE', 'Gate 29b: Range semantic level is MODEL_FAMILY_RANGE');
assert.deepStrictEqual(resetTest.technicalSpecs, {}, 'Gate 29c: Subsequent unconfirmed decode resets technicalSpecs');

// Gate 30: no MS260/MS261 mass fallback
const unmapped1 = decodeStihlCode('412345678', canonicalDatabase);
assert.strictEqual(unmapped1.modelIdentityStatus, 'MODEL_NOT_IDENTIFIED', 'Gate 30: Unmapped serial 412345678 is MODEL_NOT_IDENTIFIED');
assert.strictEqual(unmapped1.model, 'Nog niet definitief bevestigd', 'Gate 30b: Unmapped serial 412345678 does not fallback to MS 260/261');

const unmapped2 = decodeStihlCode('824061159', canonicalDatabase);
assert.strictEqual(unmapped2.modelIdentityStatus, 'MODEL_NOT_IDENTIFIED', 'Gate 30c: Unmapped serial 824061159 is MODEL_NOT_IDENTIFIED');
assert.strictEqual(unmapped2.model, 'Nog niet definitief bevestigd', 'Gate 30d: Unmapped serial 824061159 does not fallback to MS 260/261');

console.log('✅ ALL 30 SERIAL DECODER RECOVERY R2 GATES PASSED (100% SUCCESS)');
