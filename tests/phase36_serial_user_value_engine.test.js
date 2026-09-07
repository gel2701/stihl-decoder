import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode, analyzeSerialNumber } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

console.log('▶ Running Phase 36 Serial User-Value Engine Tests...');

// 1. Serial Format & Digit Length Handling
const res9 = decodeStihlCode('824061159', database);
assert.strictEqual(res9.success, true);
assert.strictEqual(res9.factory.code, '8');
assert.strictEqual(res9.factory.country, null);
assert.strictEqual(res9.factory.location, null);
assert.strictEqual(res9.factory.details, null);

// Direct analyzeSerialNumber supports 8, 9, 10 digits
const res8 = analyzeSerialNumber('12345678', database, null);
assert.strictEqual(res8.success, true);
assert.strictEqual(res8.factory.code, '1');

const res10 = analyzeSerialNumber('1234567890', database, null);
assert.strictEqual(res10.success, true);
assert.strictEqual(res10.factory.code, '1');

// 2. Serial-alone Never Fakes Exact Model for Unanchored Serials
assert.strictEqual(res9.exactModel, null, 'Serial alone must not claim exactModel');
assert.notStrictEqual(res9.modelIdentityStatus, 'EXACT_MODEL_IDENTIFIED', 'Serial alone must not claim EXACT_MODEL_IDENTIFIED');
assert.strictEqual(Object.keys(res9.technicalSpecs).length, 0, 'Serial alone must not attach unverified technical specs');

// 3. No Fake 2010 or 2016 Production Year Fallback
assert.strictEqual(res9.production.status, 'UNKNOWN');
assert.strictEqual(res9.production.year, null);
assert.notStrictEqual(res9.production.year, 2010);
assert.notStrictEqual(res9.production.year, 2016);
assert.notStrictEqual(res9.estimatedYears, 'vanaf circa 2010');
assert.notStrictEqual(res9.estimatedYears, 'vanaf circa 2016');

// 4. Model-Assisted Decoding (MS 170)
const resAssisted = decodeStihlCode('824061159', database, { confirmedModel: 'MS 170' });
assert.strictEqual(resAssisted.success, true);
assert.strictEqual(resAssisted.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(resAssisted.exactModel, null, 'exactModel must be null for USER_CONFIRMED_MODEL');
assert.strictEqual(resAssisted.confirmedModel, 'MS 170');
assert.strictEqual(resAssisted.resolvedModel, 'MS 170');
assert.strictEqual(resAssisted.modelIdentitySource, 'USER_INPUT');
assert.strictEqual(resAssisted.model, 'MS 170');

// 5. Technical Specs Attached via Public Evidence Gate
assert.strictEqual(resAssisted.technicalSpecs.displacement_cc, 30.1);
assert.strictEqual(resAssisted.technicalSpecs.power_kw, 1.3);
assert.strictEqual(resAssisted.technicalSpecs.idle_speed_rpm, 2800);
assert.strictEqual(resAssisted.technicalSpecs.electrode_gap_mm, 0.5);
assert.strictEqual(resAssisted.technicalSpecs.fuel_tank_l, 0.25);
assert.strictEqual(resAssisted.technicalSpecs.oil_tank_l, 0.145);
assert.strictEqual(resAssisted.technicalSpecs.weight_kg, 3.9);
assert.ok(resAssisted.technicalSpecs.spark_plug.includes('BOSCH') || resAssisted.technicalSpecs.spark_plug.includes('NGK'));

// 6. User-Provided Production Year
const resWithYear = decodeStihlCode('824061159', database, { confirmedModel: 'MS 170', userProvidedYear: 2021 });
assert.strictEqual(resWithYear.userProvidedYear, 2021);
assert.strictEqual(resWithYear.userProvidedYearStatus, 'USER_PROVIDED_YEAR');
assert.strictEqual(resWithYear.production.status, 'UNKNOWN', 'userProvidedYear must not overwrite production.status');

// 7. StopHeling Tip Guidance Present
assert.ok(res9.stopHelingUrl.includes('824061159'));
assert.ok(res9.stopHelingTip.includes('gestolen'));

// 8. Model Assist Availability Indicator
assert.strictEqual(res9.modelAssistAvailable, true, 'modelAssistAvailable should be true when model is not confirmed');
assert.strictEqual(resAssisted.modelAssistAvailable, false, 'modelAssistAvailable should be false when model is confirmed');

// 9. Alphanumeric Serial Contract Regression Check
const resAlpha = decodeStihlCode('12345678A', database);
assert.strictEqual(resAlpha.success, true);
assert.strictEqual(resAlpha.status, 'FORMAT_VALIDATED');
assert.strictEqual(resAlpha.serialResolution?.serialFormat?.status, 'FORMAT_ONLY');
assert.strictEqual(resAlpha.serialResolution?.serialFormat?.chronologyCompatible, 'NO');
assert.strictEqual(resAlpha.counterfeit, undefined);

console.log('✅ Phase 36 Serial User-Value Engine Tests Passed 100%.');
