import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderGietklokHelperHtml } from '../components/tools/GietklokHelper.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Gietklok Helper & Assembly Estimator Unit Tests...\n');

// Test 1: Gietklok HTML Rendering (Dots & Arrow styles)
const dotsHtml = renderGietklokHelperHtml(21, 5, 'dots');
assert.ok(dotsHtml.includes('STIHL Gietklok / Datumstempel Hulp'));
assert.ok(dotsHtml.includes('Mei 2021 (Machine assemblage ca. Juli 2021)'));

const arrowHtml = renderGietklokHelperHtml(18, 11, 'arrow');
assert.ok(arrowHtml.includes('November 2018 (Machine assemblage ca. Januari 2019)'));
console.log('✅ Test 1 Passed: Gietklok SVG visualizer rendered dots and arrow dial styles with assembly estimation.');

// Test 2: Gietklok Location Tips Verification
assert.ok(dotsHtml.includes('1. Startkap'));
assert.ok(dotsHtml.includes('2. Bovenkap'));
assert.ok(dotsHtml.includes('3. Carterhelft'));
console.log('✅ Test 2 Passed: Gietklok location tips (Startkap, Bovenkap, Carterhelft) verified.');

// Test 3: REST API Controller POST /api/v1/decode
const resDE = handleDecodeApiV1({ serialNumber: '184592301' }, database);
assert.strictEqual(resDE.statusCode, 200);
assert.strictEqual(resDE.body.data.factory.country, 'Duitsland');
console.log('✅ Test 3 Passed: REST API v1 Controller returns 200 OK.');

console.log('\n🎉 ALL GIETKLOK VISUALIZER & ESTIMATOR TESTS PASSED SUCCESSFULLY!');
