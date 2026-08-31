import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  buildArchivePreflight,
  buildMissingArchivePrecheck,
  buildWrongArchiveHashFailure,
  classifyArchiveTsDataIndependence35c42,
  detectExplicitTs410420DocumentScope,
  evaluateArchiveOfficialAuthenticity,
  extractSparkPlugRaw,
  extractPayloadModelMatches35c42,
  extractTs410420FieldMap,
  parseDualUnitValue,
  parseRpmValue,
  parseSparkPlugAlternatives,
  reclassifyTsSparkGap,
  simulateMultiModelColumnSwap
} from '../scripts/phase35c421_failure_injection_integrity_hotfix.js';
import { evaluateVerifiedCandidate } from '../scripts/phase35c4_verified_fact_recovery.js';
import { buildKnownModelDictionary } from '../src/documentAuthority.js';

console.log('Starting Phase 35C.4.2.1 integrity hotfix tests...');

const knownModels = buildKnownModelDictionary(JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8')));

const displacement = parseDualUnitValue('48.7 2.96', 'displacement_cc');
assert.strictEqual(displacement.primary_metric_value, 48.7);
assert.strictEqual(displacement.secondary_imperial_value, 2.96);

assert.strictEqual(parseRpmValue('2,800'), 2800);
assert.strictEqual(parseRpmValue('9,500'), 9500);

const sparkAlternatives = parseSparkPlugAlternatives('Bosch WSR 6 F or NGK BPMR 7 A');
assert.deepStrictEqual(sparkAlternatives, [
  { manufacturer: 'BOSCH', model: 'WSR 6 F' },
  { manufacturer: 'NGK', model: 'BPMR 7 A' }
]);
assert.strictEqual(
  extractSparkPlugRaw(
    ['Spark plug (suppressed):', 'Bosch WSR 6 F', 'or NGK BPMR 7 A', 'Electrode gap 0.5 mm (0.02 in)'],
    'Spark plug (suppressed): Bosch WSR 6 F or NGK BPMR 7 A Electrode gap 0.5 mm (0.02 in)'
  ),
  'Bosch WSR 6 F or NGK BPMR 7 A'
);

assert.deepStrictEqual(
  extractPayloadModelMatches35c42('Fuel capacity: 0.46 l Chain Saw: 026', knownModels).map((entry) => entry.model_name),
  ['026']
);
assert.deepStrictEqual(extractPayloadModelMatches35c42('Fuel tank capacity: 0.46 l', knownModels), []);
assert.deepStrictEqual(extractPayloadModelMatches35c42('Electrode gap 0.26 mm', knownModels), []);
assert.deepStrictEqual(extractPayloadModelMatches35c42('Copyright 2015', knownModels), []);
assert.deepStrictEqual(extractPayloadModelMatches35c42('STIHL 009 chain saw', knownModels).map((entry) => entry.model_name), ['009']);
assert.deepStrictEqual(detectExplicitTs410420DocumentScope('TS 410, TS 420 Owners Instruction Manual').sort(), ['ts-410', 'ts-420']);

const gap = reclassifyTsSparkGap('0.5 0.02');
assert.strictEqual(gap.field_name, 'electrode_gap_mm');
assert.strictEqual(gap.normalized_value, 0.5);

const tsMap = extractTs410420FieldMap('Displacement: 4.07 cu. in. (66.7 cm 3) Cylinder bore: 1.97 in. (50 mm) Piston stroke: 1.34 in. (34 mm) Engine power accord - ing to ISO 7293: 4.3 hp (3.2 kW) at 9000 rpm Idling speed: 2500 rpm Maximum spindle speed: 5350 rpm');
assert.strictEqual(tsMap.Displacement, '4.07 cu. in. (66.7 cm 3)');
assert.strictEqual(simulateMultiModelColumnSwap(), 'FAIL');

const auth = evaluateArchiveOfficialAuthenticity({
  sampleText: 'STIHL Owners Instruction Manual 0458-145-3021-A Andreas Stihl Specifications',
  publicationIds: ['0458-145-3021-A'],
  documentType: 'OWNERS_INSTRUCTION_MANUAL',
  filename: 'STIHL 046.pdf',
  pageCount: 55
});
assert.strictEqual(auth.authenticity_status, 'AUTHENTICATED_OFFICIAL');
assert.ok(auth.payload_authentication_signal_count >= 2);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase35c421-test-'));
const fakeArchive = path.join(tempDir, 'archive.zip');
fs.writeFileSync(fakeArchive, Buffer.from('fake archive bytes'));

const wrongHash = await buildWrongArchiveHashFailure({
  HEAD: '78c324e9f1392aab2774a6fdda485b2cca602f68',
  ORIGIN_MAIN: 'ec6a56d6a9c35c2f9b71d3c36bfee1531c39550f',
  ARCHIVE_PATH: fakeArchive
});
assert.strictEqual(wrongHash.PRECHECK, 'FAIL');
assert.ok(wrongHash.PRECHECK_FAILURES.includes('WRONG_ARCHIVE_HASH'));
assert.strictEqual(wrongHash.ARCHIVE_INTAKE_NOT_STARTED, 'YES');

const missingArchive = await buildMissingArchivePrecheck({
  HEAD: '78c324e9f1392aab2774a6fdda485b2cca602f68',
  ORIGIN_MAIN: 'ec6a56d6a9c35c2f9b71d3c36bfee1531c39550f'
});
assert.strictEqual(missingArchive.PRECHECK, 'FAIL');
assert.ok(missingArchive.PRECHECK_FAILURES.includes('ARCHIVE_PATH_NOT_FOUND'));

const preflightOk = await buildArchivePreflight({
  archivePath: fakeArchive,
  expectedArchiveHash: '0f37c5e9570c0b489978699d2951c06b1c9f51f4f4a4644b6f928e6dca3fd8d5',
  head: '78c324e9f1392aab2774a6fdda485b2cca602f68',
  originMain: 'ec6a56d6a9c35c2f9b71d3c36bfee1531c39550f'
});
assert.strictEqual(preflightOk.PRECHECK, 'FAIL');
assert.ok(preflightOk.PRECHECK_FAILURES.includes('WRONG_ARCHIVE_HASH'));

const unresolvedIndependence = classifyArchiveTsDataIndependence35c42(
  { source_label: 'manual', file_hash: 'hash-a', payload_hash: 'payload-a', publication_id: '0458-133-3021', canonical_document_id: '0458-133-3021' },
  { source_label: 'ts', file_hash: null, payload_hash: null, publication_id: null, canonical_document_id: null }
);
assert.strictEqual(unresolvedIndependence.independence_status, 'INDEPENDENCE_UNRESOLVED');

const sameSource = classifyArchiveTsDataIndependence35c42(
  { source_label: 'a', file_hash: 'same', payload_hash: 'same', publication_id: '0458-145-3021', canonical_document_id: 'canon-a' },
  { source_label: 'b', file_hash: 'same', payload_hash: 'same', publication_id: '0458-145-3021', canonical_document_id: 'canon-a' }
);
assert.strictEqual(sameSource.independence_status, 'SAME_SOURCE_PROVEN');

const independent = classifyArchiveTsDataIndependence35c42(
  { source_label: 'a', file_hash: 'hash-a', payload_hash: 'payload-a', publication_id: '0458-145-3021', canonical_document_id: 'canon-a' },
  { source_label: 'b', file_hash: 'hash-b', payload_hash: 'payload-b', publication_id: '0458-133-3021', canonical_document_id: 'canon-b' }
);
assert.strictEqual(independent.independence_status, 'INDEPENDENT_PROVEN');

const sharedValueScope = evaluateVerifiedCandidate({
  source_authenticated: true,
  page_locator_exists: true,
  document_model_valid: true,
  field_context_valid: true,
  effective_scope: 'MULTI_MODEL_EXPLICIT_SHARED_VALUE',
  value_valid: true,
  unit_valid: true,
  measurement_definition_known: true,
  semantic_valid: true,
  semantic_failures: [],
  sanity_pass: true,
  independent_support_exists: true,
  precision_gate_passed: true,
  conflict_status: 'CLEAR'
});
assert.strictEqual(sharedValueScope.verified, true);

fs.rmSync(tempDir, { recursive: true, force: true });

console.log('Phase 35C.4.2.1 integrity hotfix tests passed.');
