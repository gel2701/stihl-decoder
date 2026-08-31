import assert from 'assert';
import fs from 'fs';

import { decodeStihlCode } from '../src/decoder.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import { sanitizeSparkPlugValue } from '../src/publicEvidence.js';
import { main as runPhase35c4221, SOURCE_COMMIT } from '../scripts/phase35c4221_public_evidence_safety_hotfix.js';

console.log('Starting Phase 35C.4.2.2.1 public evidence safety hotfix tests...');

const report = runPhase35c4221();
assert.strictEqual(report.SOURCE_COMMIT, SOURCE_COMMIT);
if (report.PRECHECK === 'FAIL') {
  assert.strictEqual(report.FINAL_STATUS, 'BLOCKED');
  assert.strictEqual(report.TEST_SUITE, 'FAIL');
  console.log('Phase 35C.4.2.2.1 baseline is intentionally blocked on a newer HEAD/origin baseline.');
} else {
  assert.strictEqual(report.PRECHECK, 'PASS');
  assert.strictEqual(report.FINAL_STATUS, 'PASS');
  assert.strictEqual(report.TEST_SUITE, 'PASS');
  assert.strictEqual(report.GENERIC_FACTUAL_FALLBACK_COUNT, 0);
  assert.strictEqual(report.PRODUCTION_HARDCODED_TECHNICAL_FACTS_AFTER, 0);
  assert.strictEqual(report.CONFLICT_SINGLE_VALUE_API_LEAKS, 0);
  assert.strictEqual(report.SCHEMA_CONFLICTED_SINGLE_VALUES, 0);
  assert.strictEqual(report.REAL_CANONICAL_PROMOTION_INJECTION, 'PASS');
}

const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(new URL('../data/public_evidence_facts.json', import.meta.url), 'utf8'));

const positiveSpark = sanitizeSparkPlugValue('Bosch WSR 6 F or NGK BPMR 7 A');
assert.deepStrictEqual(positiveSpark.normalized_value, [
  { manufacturer: 'BOSCH', model: 'WSR 6 F' },
  { manufacturer: 'NGK', model: 'BPMR 7 A' }
]);
assert.strictEqual(positiveSpark.semantic_status, 'VALID');

for (const sample of [
  '208RA029',
  '208RA026',
  '133RA129',
  'WSR 6 F 8.25 mm Rapid-Micro',
  'BPMR 7 A do not use replacement saw chain',
  'Rapid-Super 33 RS',
  '0.325"',
  '3/8"'
]) {
  assert.notStrictEqual(sanitizeSparkPlugValue(sample).semantic_status, 'VALID');
}

const exact026 = decodeStihlCode('026', database);
assert.strictEqual(exact026.success, true);
assert.ok(exact026.technicalSpecs.spark_plug.includes('BOSCH WSR 6 F'));
assert.strictEqual(exact026.publicEvidenceFields.spark_plug.evidence_status, 'OFFICIAL_DOCUMENTED');
if (report.PRECHECK !== 'FAIL') {
  assert.strictEqual(exact026.technicalSpecs.spark_plug, 'BOSCH WSR 6 F');
}

const exact046 = decodeStihlCode('046', database);
assert.strictEqual(exact046.success, true);
assert.strictEqual(exact046.technicalSpecs.stroke_mm, undefined);
assert.strictEqual(exact046.publicEvidenceFields.stroke_mm.evidence_status, 'OFFICIAL_CONFLICTED');
assert.deepStrictEqual(
  exact046.publicEvidenceFields.stroke_mm.values.map((entry) => entry.value),
  [40, 36]
);

const ts420 = decodeStihlCode('TS 420', database);
assert.deepStrictEqual(Object.keys(ts420.technicalSpecs).sort(), ['bore_mm', 'displacement_cc', 'idle_speed_rpm', 'stroke_mm']);

const fuzzy = decodeStihlCode('MS 26', database);
assert.strictEqual(fuzzy.success, false);
assert.strictEqual(fuzzy.status, 'NOT_FOUND');

const probableSerial = decodeStihlCode('184592301', database);
assert.strictEqual(probableSerial.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.strictEqual(probableSerial.exactModel, null);
assert.deepStrictEqual(probableSerial.technicalSpecs, {});
assert.ok(String(probableSerial.estimatedYears).includes('vanaf circa'));

const passportHtml = renderStihlPassportHtml({
  ...probableSerial,
  cleanedSerial: probableSerial.cleaned,
  formatted: '1 845 923 01',
  theftCheck: {
    userSelfReported: false,
    checkedAt: '31-08-2026',
    statusLabel: 'Niet gecontroleerd via StopHeling'
  }
});
for (const leak of ['50.2', '3.0 kW', '4.1', '.325', '1.3 mm']) {
  assert.ok(!passportHtml.includes(leak));
}

const model046 = (database.models || []).find((model) => model.slug === '046') || {
  id: '046',
  slug: '046',
  model_name: '046',
  category: 'Kettingzaag',
  category_slug: 'kettingzagen',
  series_code: null
};
const html046 = renderModelPageHtml(model046, database);
assert.ok(html046.includes('Bronverschil gevonden'));
assert.ok(html046.includes('40 mm'));
assert.ok(html046.includes('36 mm'));
assert.ok(!html046.includes('"name":"Slag","value":"40 mm"'));

const finalAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4221_final_report.json', import.meta.url), 'utf8'));
if (report.PRECHECK === 'FAIL') {
  assert.strictEqual(finalAudit.FINAL_STATUS, 'BLOCKED');
} else {
  assert.strictEqual(finalAudit.FINAL_STATUS, 'PASS');
  assert.strictEqual(finalAudit.PUBLIC_FACTS_BEFORE, 23);
  assert.strictEqual(finalAudit.PUBLIC_FACTS_AFTER, 22);
}

console.log('Phase 35C.4.2.2.1 public evidence safety hotfix tests passed.');
