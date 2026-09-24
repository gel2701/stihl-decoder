import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { decodeStihlCode, analyzePartNumber } from '../src/decoder.js';
import { OfficialSerialAnchorResolver } from '../src/OfficialSerialAnchorResolver.js';
import { StihlRangeResolver } from '../src/StihlRangeResolver.js';
import { searchGlobalModels, buildSearchableIdentities } from '../src/globalModelSearch.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const jsonDbPath = path.join(rootDir, 'data', 'stihl_database.json');
const sqliteDbPath = path.join(rootDir, 'data', 'stihl_database.db');
const publicFactsPath = path.join(rootDir, 'data', 'public_evidence_facts.json');

const database = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));

test('Test A: Official Serial Anchor Resolution for 163118080 (MS 440 Magnum)', (t) => {
  const serial = '163118080';

  // 1. Direct OfficialSerialAnchorResolver verification
  const anchor = OfficialSerialAnchorResolver.resolve(serial, database);
  assert.ok(anchor, 'Anchor must be found for 163118080');
  assert.strictEqual(anchor.serial_number, '163118080');
  assert.strictEqual(anchor.model_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
  assert.strictEqual(anchor.canonical_model_id, 'stihl_ms_440');
  assert.strictEqual(anchor.verification_status, 'OFFICIAL_STIHL_LOOKUP');

  // 2. Decoder execution
  const res = decodeStihlCode(serial, database);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'FORMAT_VALIDATED');
  assert.strictEqual(res.type, 'SERIAL_NUMBER');

  // 3. Exact Model Identification Assertions
  assert.strictEqual(res.model, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
  assert.strictEqual(res.exactModel, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
  assert.strictEqual(res.resolvedModel, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
  assert.strictEqual(res.identityStatus, 'EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(res.identitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.modelIdentityStatus, 'EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(res.modelIdentitySource, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.identityLabel, 'Door STIHL geïdentificeerd model');

  // 4. Hard Gate: Under NO code path should MS 260 / 026 be returned
  assert.strictEqual(res.probableModelSeries, null, 'probableModelSeries must be null, never MS 260');
  assert.strictEqual(res.modelAssistAvailable, false, 'modelAssistAvailable must be false');
  assert.deepStrictEqual(res.modelAssist.candidates, [], 'modelAssist candidates must be empty');

  // Deep inspection: verify MS 260 or 026 does not leak into any identity/model fields
  const serializedOutput = JSON.stringify({
    model: res.model,
    exactModel: res.exactModel,
    resolvedModel: res.resolvedModel,
    probableModelSeries: res.probableModelSeries,
    identityLabel: res.identityLabel,
    notes: res.notes,
    candidateModelIds: res.serialResolution?.candidateModelIds
  });
  assert.ok(!serializedOutput.includes('MS 260'), 'Result must never contain "MS 260"');
  assert.ok(!serializedOutput.includes('026'), 'Result must never contain "026"');
  assert.ok(!serializedOutput.includes('stihl_ms_260'), 'Result must never contain "stihl_ms_260"');

  // 5. Category and Drive classification
  assert.strictEqual(res.category, 'Kettingzaag');
  assert.ok(res.fuel_type_label?.includes('Benzine'), 'Fuel type label must indicate Benzine');

  // 6. Passport HTML generator verification
  const passportHtml = renderStihlPassportHtml(res);
  assert.ok(passportHtml.includes('MS 440'), 'Passport HTML must contain MS 440');
  assert.ok(!passportHtml.includes('MS 260'), 'Passport HTML must NOT contain MS 260');
});

test('Test B: Historical Range Resolution for Unanchored Serial 160500000', (t) => {
  const serial = '160500000';

  // 1. Decoder execution without user confirmation
  const res = decodeStihlCode(serial, database);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.exactModel, null, 'Serial without official anchor must NOT claim exactModel');
  assert.strictEqual(res.probableModelSeries, null, 'Serial in HISTORICAL_PRODUCTION_RANGE must NOT claim probableModelSeries');
  assert.strictEqual(res.identityStatus, 'MODEL_NOT_IDENTIFIED', 'identityStatus must be MODEL_NOT_IDENTIFIED');
  assert.strictEqual(res.identitySource, 'SERIAL_RANGE', 'identitySource must remain SERIAL_RANGE');
  assert.strictEqual(res.modelIdentityStatus, 'MODEL_NOT_IDENTIFIED', 'modelIdentityStatus must be MODEL_NOT_IDENTIFIED');
  assert.strictEqual(res.modelIdentitySource, 'SERIAL_RANGE', 'modelIdentitySource must remain SERIAL_RANGE');
  assert.strictEqual(res.identityLabel, 'Historische serienummerreeks');

  // Hard Gate: No MS 260 or MS 440 claim
  const serialized = JSON.stringify({
    model: res.model,
    exactModel: res.exactModel,
    resolvedModel: res.resolvedModel,
    probableModelSeries: res.probableModelSeries,
    candidateModelIds: res.candidateModelIds
  });
  assert.ok(!serialized.includes('MS 260'), 'Result must not contain MS 260');
  assert.ok(!serialized.includes('MS 440'), 'Result must not contain MS 440');
  assert.ok(!serialized.includes('stihl_ms_260'), 'Result must not contain stihl_ms_260');
  assert.ok(!serialized.includes('stihl_ms_440'), 'Result must not contain stihl_ms_440');

  // 2. Production period is preserved
  assert.strictEqual(res.productionPeriod?.yearStart, 2002);
  assert.strictEqual(res.productionPeriod?.yearEnd, 2011);
  assert.strictEqual(res.estimatedYears, '2002 – 2011');
  assert.strictEqual(res.serialResolution?.rangeSemanticLevel, 'HISTORICAL_PRODUCTION_RANGE');

  // 3. Strict Safety: No unproven candidate models may be suggested
  assert.deepStrictEqual(res.candidateModelIds, [], 'candidateModelIds must be strictly empty');
  assert.deepStrictEqual(res.serialResolution?.candidateModelIds, [], 'serialResolution candidateModelIds must be strictly empty');
  assert.deepStrictEqual(res.modelAssist?.candidates, [], 'modelAssist candidates must be strictly empty');
  assert.strictEqual(res.modelAssist?.available, false, 'modelAssist available must be false');
});

test('Test C: Plant and Chronology Resolution', (t) => {
  const serial = '163118080';
  const res = decodeStihlCode(serial, database);

  assert.strictEqual(res.factory?.code, '1');
  assert.strictEqual(res.factory?.country, 'Duitsland');
  assert.strictEqual(res.factory?.location, 'Waiblingen');
  assert.strictEqual(res.serialResolution?.serialFormat?.status, 'SERIAL_FORMAT_RECOGNIZED');
  assert.strictEqual(res.serialResolution?.serialFormat?.chronologyCompatible, 'YES');
});

test('Test D: Part Number Decoder Stability', (t) => {
  const partNo = '11210210800';
  const res = analyzePartNumber(partNo, database);

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.type, 'PART_NUMBER');
  assert.strictEqual(res.familyCode, '1121');
  assert.strictEqual(res.isWarning, true);
  assert.ok(res.warning.includes('11-cijferig STIHL onderdeelnummer'));
});

test('Test E: Global Model Search Coverage', (t) => {
  const identities = buildSearchableIdentities(database);

  const search440 = searchGlobalModels('MS 440', identities);
  assert.ok(search440.length > 0, 'MS 440 must be found in global search');
  assert.strictEqual(search440[0].model_name, 'MS 440');

  const search260 = searchGlobalModels('MS 260', identities);
  assert.ok(search260.length > 0, 'MS 260 must be found in global search');
  assert.strictEqual(search260[0].model_name, 'MS 260');
});

test('Test F: StopHeling Integration', (t) => {
  const serial = '163118080';
  const res = decodeStihlCode(serial, database);

  assert.ok(res.stopHelingUrl.includes('163118080'), 'stopHelingUrl must include serial number');
  assert.ok(res.stopHelingUrl.startsWith('https://www.stopheling.nl/nl/zoeken?q='), 'stopHelingUrl format is valid');
});

test('Test G: Canonical Source of Truth & SQLite/JSON Parity', (t) => {
  const anchorsFile = path.join(rootDir, 'data', 'official_serial_anchors.json');
  assert.ok(fs.existsSync(anchorsFile), 'official_serial_anchors.json must exist as canonical source of truth');
  const canonicalAnchorsData = JSON.parse(fs.readFileSync(anchorsFile, 'utf8'));
  const canonicalAnchor = canonicalAnchorsData.anchors.find(a => a.serial_number === '163118080');
  assert.ok(canonicalAnchor, 'Canonical source must contain anchor for 163118080');

  // Provenance attributes validation
  assert.strictEqual(canonicalAnchor.source, 'MY_STIHL');
  assert.strictEqual(canonicalAnchor.source_url, 'https://app.stihl.com/nl-nl/mystihl/tools/add');
  assert.strictEqual(canonicalAnchor.verification_date, '2026-09-22');
  assert.strictEqual(canonicalAnchor.verification_method, 'authenticated MY STIHL serial lookup');
  assert.strictEqual(canonicalAnchor.evidence_type, 'OFFICIAL_WEB_LOOKUP');
  assert.strictEqual(canonicalAnchor.verification_status, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(canonicalAnchor.model_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');

  // JSON database parity
  const jsonAnchor = database.official_serial_anchors.find(a => a.serial_number === '163118080');
  assert.ok(jsonAnchor, 'stihl_database.json must contain anchor for 163118080');
  assert.deepStrictEqual(jsonAnchor, canonicalAnchor, 'stihl_database.json anchor must match canonical source 100%');

  // SQLite database parity
  const sqliteDb = new Database(sqliteDbPath, { readonly: true });
  const anchorRow = sqliteDb.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get('163118080');
  assert.ok(anchorRow, 'SQLite must have official_serial_anchors row for 163118080');
  assert.strictEqual(anchorRow.model_name, canonicalAnchor.model_name);
  assert.strictEqual(anchorRow.canonical_model_id, canonicalAnchor.canonical_model_id);
  assert.strictEqual(anchorRow.source, canonicalAnchor.source);
  assert.strictEqual(anchorRow.source_url, canonicalAnchor.source_url);
  assert.strictEqual(anchorRow.verification_date, canonicalAnchor.verification_date);
  assert.strictEqual(anchorRow.verification_method, canonicalAnchor.verification_method);
  assert.strictEqual(anchorRow.evidence_type, canonicalAnchor.evidence_type);
  assert.strictEqual(anchorRow.verification_status, canonicalAnchor.verification_status);

  // model_serial_ranges parity
  const rangeRow = sqliteDb.prepare('SELECT * FROM model_serial_ranges WHERE serial_start = 160000000').get();
  assert.ok(rangeRow, 'SQLite must have range row for 160000000');
  assert.strictEqual(rangeRow.model_id, null, 'model_id must be null in SQLite');
  assert.strictEqual(rangeRow.range_semantic_level, 'HISTORICAL_PRODUCTION_RANGE');
  assert.strictEqual(rangeRow.range_display_name, 'Historische serienummerreeks');
  assert.strictEqual(rangeRow.candidate_model_ids, '[]', 'candidate_model_ids must be empty array string in SQLite');

  sqliteDb.close();
});

test('Test H: Public Evidence Facts Integrity', (t) => {
  assert.ok(fs.existsSync(publicFactsPath), 'public_evidence_facts.json must exist');
  const factsData = JSON.parse(fs.readFileSync(publicFactsPath, 'utf8'));
  assert.ok(Array.isArray(factsData.facts), 'facts must be an array');
  assert.strictEqual(factsData.facts.length, 761, 'Fact count must remain exactly 761');
});

test('Test I: Canonical Model Isolation (Official Variant Name Invariant)', (t) => {
  const serial = '163118080';
  const res = decodeStihlCode(serial, database);

  // 1. Verify stihl_ms_440 exists in the canonical model catalog
  const canonicalModel = database.models.find(m => m.id === 'stihl_ms_440');
  assert.ok(canonicalModel, 'Canonical model stihl_ms_440 must exist in canonical catalog');
  assert.strictEqual(canonicalModel.model_name, 'MS 440');

  // 2. The canonical model name ('MS 440') must NEVER overwrite the official variant name
  const officialVariantName = 'MS 440-Z 3/8" RIM Magnum Motorsäge';
  assert.strictEqual(res.model, officialVariantName, 'res.model must be official variant name');
  assert.strictEqual(res.exactModel, officialVariantName, 'res.exactModel must be official variant name');
  assert.strictEqual(res.resolvedModel, officialVariantName, 'res.resolvedModel must be official variant name');
  assert.notStrictEqual(res.exactModel, canonicalModel.model_name, 'Canonical base name must not replace official variant name');

  // 3. Simulated edge case: if canonical model is missing, official variant name is still preserved
  const dbWithoutMs440 = {
    ...database,
    models: database.models.filter(m => m.id !== 'stihl_ms_440')
  };
  const resIsolated = decodeStihlCode(serial, dbWithoutMs440);
  assert.strictEqual(resIsolated.exactModel, officialVariantName, 'Official variant name preserved even without canonical model match');
  assert.strictEqual(resIsolated.identityStatus, 'EXACT_MODEL_IDENTIFIED');
  assert.strictEqual(resIsolated.identitySource, 'OFFICIAL_STIHL_LOOKUP');
});
