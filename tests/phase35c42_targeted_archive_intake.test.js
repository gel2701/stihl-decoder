import assert from 'assert';

import {
  extractTs410420FieldMap,
  parseDualUnitValue,
  parseRpmValue,
  parseSparkPlugAlternatives,
  reclassifyTsSparkGap,
  simulateMultiModelColumnSwap
} from '../scripts/phase35c42_targeted_archive_intake.js';

console.log('Starting Phase 35C.4.2 targeted archive intake tests...');

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

const gap = reclassifyTsSparkGap('0.5 0.02');
assert.strictEqual(gap.field_name, 'electrode_gap_mm');
assert.strictEqual(gap.normalized_value, 0.5);
assert.strictEqual(gap.unit, 'mm');

const tsMap = extractTs410420FieldMap('Displacement: 4.07 cu. in. (66.7 cm 3) Cylinder bore: 1.97 in. (50 mm) Piston stroke: 1.34 in. (34 mm) Engine power accord - ing to ISO 7293: 4.3 hp (3.2 kW) at 9000 rpm Idling speed: 2500 rpm Maximum spindle speed: 5350 rpm');
assert.strictEqual(tsMap.Displacement, '4.07 cu. in. (66.7 cm 3)');
assert.strictEqual(tsMap['Cylinder bore'], '1.97 in. (50 mm)');
assert.strictEqual(tsMap['Piston stroke'], '1.34 in. (34 mm)');

assert.strictEqual(simulateMultiModelColumnSwap(), 'FAIL');

console.log('Phase 35C.4.2 targeted archive intake tests passed.');
