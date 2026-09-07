import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

console.log('▶ Running Phase 36 MS 170 Real-World Acceptance Tests...');

// Real-world serial from acceptance prompt: 824061159
const serial = '824061159';

// ==========================================
// CASE A: Serial-Only Decode Step
// ==========================================
const resA = decodeStihlCode(serial, database);
assert.strictEqual(resA.success, true);
assert.strictEqual(resA.factory.code, '8');
assert.strictEqual(resA.factory.country, null, 'Code 8 country must be null without evidence');
assert.strictEqual(resA.factory.location, null, 'Code 8 location must be null without evidence');
assert.strictEqual(resA.factory.details, null, 'Code 8 details must be null without evidence');
assert.strictEqual(resA.exactModel, null, 'exactModel must be null');
assert.strictEqual(resA.modelIdentityStatus, 'MODEL_NOT_IDENTIFIED');
assert.strictEqual(resA.production.status, 'UNKNOWN');
assert.strictEqual(resA.production.year, null);
assert.deepStrictEqual(resA.technicalSpecs, {});
assert.strictEqual(resA.modelAssistAvailable, true);
assert.ok(resA.stopHelingUrl.includes(serial));
assert.ok(resA.stopHelingTip.includes('gestolen'));

// User value check: Serial-only yields at least 4 and max 6 value elements
let serialOnlyValueCount = 0;
if (resA.serialResolution?.serialFormat?.status === 'SERIAL_FORMAT_RECOGNIZED') serialOnlyValueCount++; // 1. format
if (resA.factory.code === '8' && resA.factory.country === null) serialOnlyValueCount++; // 2. factory context (evidence-safe)
if (resA.production.status === 'UNKNOWN') serialOnlyValueCount++; // 3. honest production status
if (resA.modelIdentityStatus === 'MODEL_NOT_IDENTIFIED') serialOnlyValueCount++; // 4. honest model resolution
if (resA.modelAssistAvailable === true) serialOnlyValueCount++; // 5. model-assist CTA
if (resA.stopHelingUrl && resA.stopHelingTip) serialOnlyValueCount++; // 6. verification/theft action
assert.ok(serialOnlyValueCount >= 4, 'Serial-only must yield >= 4 user-value elements');
assert.ok(serialOnlyValueCount <= 6, 'Serial-only must yield <= 6 user-value elements (max 6)');

// ==========================================
// CASE B: User Model-Assisted Step (MS 170)
// ==========================================
const resB = decodeStihlCode(serial, database, { confirmedModel: 'MS 170' });
assert.strictEqual(resB.success, true);
assert.strictEqual(resB.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(resB.modelIdentitySource, 'USER_INPUT');
assert.strictEqual(resB.exactModel, null, 'exactModel must be null for USER_CONFIRMED_MODEL');
assert.strictEqual(resB.model, 'MS 170');
assert.strictEqual(resB.resolvedModel, 'MS 170');
assert.strictEqual(resB.confirmedModel, 'MS 170');
assert.ok(['Kettingzaag', 'Kettingzagen'].includes(resB.category));
assert.ok(resB.fuel_type === 'petrol_2stroke' || resB.fuel_type === 'PETROL_2STROKE');
assert.strictEqual(resB.production.status, 'UNKNOWN');

// Verify all 10 Official Technical Facts for MS 170
const specs = resB.technicalSpecs;
assert.strictEqual(specs.displacement_cc, 30.1, 'Official displacement must be 30.1 cc');
assert.strictEqual(specs.bore_mm, 37, 'Official bore must be 37 mm');
assert.strictEqual(specs.stroke_mm, 28, 'Official stroke must be 28 mm');
assert.strictEqual(specs.power_kw, 1.3, 'Official power must be 1.3 kW');
assert.strictEqual(specs.idle_speed_rpm, 2800, 'Official idle speed must be 2800 rpm');
assert.strictEqual(specs.electrode_gap_mm, 0.5, 'Official electrode gap must be 0.5 mm');
assert.strictEqual(specs.fuel_tank_l, 0.25, 'Official fuel tank must be 0.25 l');
assert.strictEqual(specs.oil_tank_l, 0.145, 'Official oil tank must be 0.145 l');
assert.strictEqual(specs.weight_kg, 3.9, 'Official weight must be 3.9 kg');
assert.ok(specs.spark_plug.includes('BOSCH WSR 6 F') && specs.spark_plug.includes('NGK BPMR 7 A'), 'Official spark plugs must be BOSCH WSR 6 F / NGK BPMR 7 A');

// ==========================================
// CASE C: Assisted with User Provided Year 2021
// ==========================================
const resC = decodeStihlCode(serial, database, { confirmedModel: 'MS 170', userProvidedYear: 2021 });
assert.strictEqual(resC.userProvidedYear, 2021, 'User provided year must be exactly 2021');
assert.strictEqual(resC.userProvidedYearStatus, 'USER_PROVIDED_YEAR');
assert.strictEqual(resC.production.status, 'UNKNOWN', 'production.status must remain UNKNOWN');
assert.strictEqual(resC.exactModel, null, 'exactModel must remain null');
assert.strictEqual(resC.modelIdentityStatus, 'USER_CONFIRMED_MODEL');

// User-Assisted Value Score Check (Must yield >= 7 and <= 8 value elements)
let assistedValueCount = 0;
if (resB.model === 'MS 170') assistedValueCount++; // 1. model
if (['Kettingzaag', 'Kettingzagen'].includes(resB.category)) assistedValueCount++; // 2. category
if (resB.fuel_type === 'petrol_2stroke' || resB.fuel_type === 'PETROL_2STROKE') assistedValueCount++; // 3. drive
if (resB.modelIdentityStatus === 'USER_CONFIRMED_MODEL') assistedValueCount++; // 4. family/type resolution
if (Object.keys(specs).length >= 8) assistedValueCount++; // 5. technical facts
if (resB.publicEvidenceFacts?.length > 0) assistedValueCount++; // 6. source transparency
if (resB.production.status === 'UNKNOWN') assistedValueCount++; // 7. production status
if (resB.stopHelingUrl && resB.serialResolution?.nextActions) assistedValueCount++; // 8. next verification/action
assert.ok(assistedValueCount >= 7, 'Assisted decode must yield >= 7 user-value elements');
assert.ok(assistedValueCount <= 8, 'Assisted decode must yield <= 8 user-value elements (max 8)');

console.log('✅ Phase 36 MS 170 Real-World Acceptance Tests Passed 100%.');
