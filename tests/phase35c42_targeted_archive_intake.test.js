import assert from 'assert';
import fs from 'fs';

import {
  buildMissingArchivePrecheck,
  buildWrongArchiveHashFailure,
  classifyArchiveTsDataIndependence35c42,
  detectExplicitTs410420DocumentScope,
  extractSparkPlugRaw,
  extractLexicalModelMatches,
  extractPayloadModelMatches35c42,
  extractTs410420FieldMap,
  parseDualUnitValue,
  parseRpmValue,
  parseSparkPlugAlternatives,
  reclassifyTsSparkGap,
  simulateMultiModelColumnSwap
} from '../scripts/phase35c42_targeted_archive_intake.js';
import { buildKnownModelDictionary } from '../src/documentAuthority.js';

console.log('Starting Phase 35C.4.2 targeted archive intake tests...');

const knownModels = buildKnownModelDictionary(JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8')));

const displacement = parseDualUnitValue('48.7 2.96', 'displacement_cc');
assert.strictEqual(displacement.primary_metric_value, 48.7);
assert.strictEqual(displacement.secondary_imperial_value, 2.96);
assert.strictEqual(displacement.normalization_method, 'DUAL_UNIT_PRIMARY_FIRST');

const bore = parseDualUnitValue('44 1.73', 'bore_mm');
assert.strictEqual(bore.primary_metric_value, 44);
assert.strictEqual(bore.secondary_imperial_value, 1.73);

const stroke = parseDualUnitValue('32 1.26', 'stroke_mm');
assert.strictEqual(stroke.primary_metric_value, 32);
assert.strictEqual(stroke.secondary_imperial_value, 1.26);

assert.strictEqual(parseRpmValue('2,800'), 2800);
assert.strictEqual(parseRpmValue('9,500'), 9500);

const sparkAlternatives = parseSparkPlugAlternatives('Bosch WSR 6 F or NGK BPMR 7 A');
assert.deepStrictEqual(sparkAlternatives, [
  { manufacturer: 'BOSCH', model: 'WSR 6 F' },
  { manufacturer: 'NGK', model: 'BPMR 7 A' }
]);
assert.strictEqual(
  extractSparkPlugRaw([], 'Spark plug (with green label): performance requirements of § 5.12 Bosch WSR 6 F or NGK BPMR 7 A do not use replacement saw chain'),
  'Bosch WSR 6 F or NGK BPMR 7 A'
);

const payloadModelMatches = extractPayloadModelMatches35c42('Fuel capacity: 0.46 l Chain Saw: 026', knownModels).map((entry) => entry.model_name);
assert.deepStrictEqual(payloadModelMatches, ['026']);
assert.deepStrictEqual(extractPayloadModelMatches35c42('Fuel capacity: 0.46 l only', knownModels), []);
assert.deepStrictEqual(detectExplicitTs410420DocumentScope('TS 410, TS 420 Owners Instruction Manual').sort(), ['ts-410', 'ts-420']);

const gap = reclassifyTsSparkGap('0.5 0.02');
assert.strictEqual(gap.field_name, 'electrode_gap_mm');
assert.strictEqual(gap.normalized_value, 0.5);
assert.strictEqual(gap.unit, 'mm');

const tsMap = extractTs410420FieldMap('Displacement: 4.07 cu. in. (66.7 cm 3) Cylinder bore: 1.97 in. (50 mm) Piston stroke: 1.34 in. (34 mm) Engine power accord - ing to ISO 7293: 4.3 hp (3.2 kW) at 9000 rpm Idling speed: 2500 rpm Maximum spindle speed: 5350 rpm');
assert.strictEqual(tsMap.Displacement, '4.07 cu. in. (66.7 cm 3)');
assert.strictEqual(tsMap['Cylinder bore'], '1.97 in. (50 mm)');
assert.strictEqual(tsMap['Piston stroke'], '1.34 in. (34 mm)');

assert.strictEqual(simulateMultiModelColumnSwap(), 'FAIL');

const wrongHash = buildWrongArchiveHashFailure({ ORIGIN_MAIN: 'f0d9076', ARCHIVE_PATH: 'archive.zip' });
assert.strictEqual(wrongHash.PRECHECK, 'FAIL');
assert.ok(wrongHash.PRECHECK_FAILURES.includes('WRONG_ARCHIVE_HASH'));

const missingArchive = buildMissingArchivePrecheck({ ORIGIN_MAIN: 'f0d9076' });
assert.strictEqual(missingArchive.PRECHECK, 'FAIL');
assert.ok(missingArchive.PRECHECK_FAILURES.includes('ARCHIVE_PATH_NOT_FOUND'));

const unresolvedIndependence = classifyArchiveTsDataIndependence35c42(
  { source_label: 'manual', file_hash: 'hash-a', payload_hash: 'payload-a', publication_id: '0458-133-3021', canonical_document_id: '0458-133-3021' },
  { source_label: 'ts', file_hash: null, payload_hash: null, publication_id: 'TS_DATA_026', canonical_document_id: 'TS_DATA:026' }
);
assert.strictEqual(unresolvedIndependence.independence_status, 'INDEPENDENCE_UNRESOLVED');

console.log('Phase 35C.4.2 targeted archive intake tests passed.');
