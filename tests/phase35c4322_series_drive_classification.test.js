import assert from 'assert';
import fs from 'fs';
import { decodeStihlCode } from '../src/decoder.js';
import { resolveMachineClassification } from '../src/driveClassification.js';
import { buildPassportViewModel } from '../src/components/StihlPassportGenerator.js';
import { execFileSync } from 'child_process';

const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
const RESULT_COMMIT = '16eb5dfb519605c7c4b40ff2e99afe9ba567dfc5';
const historicalReport = JSON.parse(execFileSync('git', ['show', `${RESULT_COMMIT}:data/phase35c4322_final_report.json`], { encoding: 'utf8' }));
assert.strictEqual(historicalReport.FINAL_STATUS, 'PASS');
assert.strictEqual(historicalReport.SERIAL_184592301_IDENTITY_STATUS, 'PROBABLE_MODEL_SERIES');
assert.strictEqual(historicalReport.SERIAL_184592301_TECHNICAL_SPEC_COUNT, 0);
const serial = decodeStihlCode('184592301', database);
assert.strictEqual(serial.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.strictEqual(serial.exactModel, null);
assert.deepStrictEqual(serial.technicalSpecs, {});
assert.deepStrictEqual(serial.driveClassification.power_source, 'PETROL');
assert.deepStrictEqual(serial.driveClassification.drive_type, 'PETROL_2STROKE');
assert.deepStrictEqual(serial.driveClassification.evidence, 'SERIES_DERIVED');
assert.deepStrictEqual(serial.driveClassification.confidence, 'SUPPORTED_ESTIMATE');
assert.deepStrictEqual(serial.driveClassification.engine_technology, 'M_TRONIC');

for (const [series, power, drive] of [['MSA 220', 'BATTERY', 'BATTERY_ELECTRIC'], ['MSE 210', 'ELECTRIC_CORDED', 'CORDED_ELECTRIC'], ['BGA 86', 'BATTERY', 'BATTERY_ELECTRIC'], ['TSA 230', 'BATTERY', 'BATTERY_ELECTRIC'], ['FSA 130 R', 'BATTERY', 'BATTERY_ELECTRIC']]) {
  const classification = resolveMachineClassification({ identityStatus: 'PROBABLE_MODEL_SERIES', probableModelSeries: series });
  assert.strictEqual(classification.power_source, power);
  assert.strictEqual(classification.drive_type, drive);
}
const conflict = resolveMachineClassification({ identityStatus: 'PROBABLE_MODEL_SERIES', probableModelSeries: 'MS 261', seriesClassification: { power_source: 'BATTERY', drive_type: 'BATTERY_ELECTRIC' } });
assert.strictEqual(conflict.conflict_status, 'CONFLICTED');
assert.strictEqual(conflict.power_source, 'UNKNOWN');
assert.strictEqual(decodeStihlCode('11210210800', database).driveClassification, undefined);
assert.strictEqual(decodeStihlCode('MS999', database).driveClassification, undefined);
const passport = buildPassportViewModel(serial);
assert.strictEqual(passport.driveClassification.display_label, 'Benzine (2-takt)');
assert.strictEqual(passport.driveContextLabel, '≈ Afgeleid van waarschijnlijke modelreeks');

console.log('Phase 35C.4.3.2.2 immutable replay and runtime classification tests passed.');
