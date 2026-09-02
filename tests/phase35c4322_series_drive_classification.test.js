import assert from 'assert';
import fs from 'fs';
import { decodeStihlCode } from '../src/decoder.js';
import { resolveMachineClassification } from '../src/driveClassification.js';
import { buildPassportViewModel } from '../src/components/StihlPassportGenerator.js';
import { main as runPhase } from '../scripts/phase35c4322_series_drive_classification.js';

const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
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

const report = await runPhase();
assert.strictEqual(report.FINAL_STATUS, 'PASS');
assert.strictEqual(report.PUBLIC_EVIDENCE_STORE_CHANGED, 'NO');
assert.strictEqual(report.PUBLIC_STORE_CANONICAL_SHA256, 'ebbde40f2f206be69b1de6d987135ade3e254baa7e70205018d14d086c7fa676');
console.log('Phase 35C.4.3.2.2 series drive classification tests passed.');
