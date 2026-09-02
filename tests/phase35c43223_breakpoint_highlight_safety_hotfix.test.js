import assert from 'assert';
import fs from 'fs';
import { decodeStihlCode } from '../src/decoder.js';
import { auditBreakpointPublicExposure, main } from '../scripts/phase35c43223_breakpoint_highlight_safety_hotfix.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';

const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
const serial = decodeStihlCode('184592301', database);
assert.strictEqual(serial.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.strictEqual(serial.exactModel, null);
assert.deepStrictEqual(serial.technicalSpecs, {});
assert.strictEqual(serial.driveClassification.power_source, 'PETROL');
assert.strictEqual(serial.driveClassification.drive_type, 'PETROL_2STROKE');
assert.strictEqual(serial.driveClassification.evidence, 'SERIES_DERIVED');
assert.strictEqual(serial.driveClassification.engine_technology, 'M_TRONIC');
assert.strictEqual(serial.productionPeriod.technicalHighlights, undefined);
assert.ok(serial.productionPeriod.seriesSummary.includes('exacte technische uitvoering'));
assert.deepStrictEqual(auditBreakpointPublicExposure(serial).violations, []);
assert.strictEqual(/M-Tronic V2\.1|M-Tronic V3\.0|300g|vliegwiel|afgeschuinde cilinderkap/i.test(JSON.stringify(serial)), false);
assert.strictEqual(/M-Tronic V2\.1|M-Tronic V3\.0|300g|vliegwiel|afgeschuinde cilinderkap/i.test(renderStihlPassportHtml(serial)), false);

const injected = structuredClone(serial);
injected.productionPeriod.technicalHighlights = 'M-Tronic V2.1 / V3.0';
assert.strictEqual(auditBreakpointPublicExposure(injected).BREAKPOINT_PUBLIC_EXPOSURE_AUDIT, 'FAIL');

const report = await main({ writeArtifacts: false, mode: 'replay' });
assert.strictEqual(report.FINAL_STATUS, 'PASS');
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.API_FORBIDDEN_BREAKPOINT_TOKENS, 0);
assert.strictEqual(report.POST_COMMIT_TEST_HEAD_EQUALITY_DEPENDENCIES, 0);
assert.strictEqual(report.HEAD_EQUALITY_REQUIRED_FOR_43223_REPLAY, 'NO');
console.log('Phase 35C.4.3.2.2.3 breakpoint highlight safety hotfix tests passed.');
