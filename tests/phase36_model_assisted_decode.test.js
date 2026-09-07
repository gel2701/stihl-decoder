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

console.log('▶ Running Phase 36 Model-Assisted Decode Tests...');

// 1. Normalization: 'MS170' -> 'MS 170'
const norm1 = decodeStihlCode('824061159', database, { confirmedModel: 'MS170' });
assert.strictEqual(norm1.success, true);
assert.strictEqual(norm1.exactModel, null);
assert.strictEqual(norm1.model, 'MS 170');
assert.strictEqual(norm1.modelIdentityStatus, 'USER_CONFIRMED_MODEL');

// Case insensitivity and whitespace normalization: ' ms 170 '
const norm2 = decodeStihlCode('824061159', database, { confirmedModel: '  ms 170  ' });
assert.strictEqual(norm2.success, true);
assert.strictEqual(norm2.exactModel, null);
assert.strictEqual(norm2.model, 'MS 170');

// 2. Unknown confirmed models fail closed
const unknownModel = decodeStihlCode('824061159', database, { confirmedModel: 'MS 9999 NONEXISTENT' });
assert.strictEqual(unknownModel.success, false);
assert.strictEqual(unknownModel.status, 'MODEL_CONFIRMATION_REQUIRED');

// 3. Separation of serial evidence vs model evidence
const assisted = decodeStihlCode('824061159', database, { confirmedModel: 'MS 170' });
// Serial evidence
assert.strictEqual(assisted.factory.code, '8');
assert.strictEqual(assisted.factory.country, null);
assert.strictEqual(assisted.serialResolution.level, 'USER_CONFIRMED_MODEL');
assert.strictEqual(assisted.production.status, 'UNKNOWN', 'Serial alone carries no production year');
// Model evidence
assert.strictEqual(assisted.exactModel, null);
assert.strictEqual(assisted.model, 'MS 170');
assert.strictEqual(assisted.modelIdentitySource, 'USER_INPUT');
assert.strictEqual(assisted.technicalSpecs.displacement_cc, 30.1);
assert.strictEqual(assisted.technicalSpecs.power_kw, 1.3);

console.log('✅ Phase 36 Model-Assisted Decode Tests Passed 100%.');
