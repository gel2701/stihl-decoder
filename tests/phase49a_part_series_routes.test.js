import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = 3100;
process.env.PORT = String(PORT);
const { server } = await import('../server.js');

// Wait 400ms for server startup
await new Promise(r => setTimeout(r, 400));

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49A PART NUMBER SERIES ROUTES TEST SUITE');
console.log('===============================================================\n');

const fetchPage = (reqPath) => new Promise((resolve, reject) => {
  const req = http.get({
    hostname: 'localhost',
    port: PORT,
    path: reqPath
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => resolve({ statusCode: res.statusCode, body }));
  });
  req.on('error', reject);
});

// 1. Series 1121 (MS 260 / 026 family)
console.log('▶ Test 1: Series 1121 dynamic models rendering...');
const res1121 = await fetchPage('/onderdeelnummer/stihl-1121/');
assert.strictEqual(res1121.statusCode, 200, 'Series 1121 route must return 200 OK');
// Should NOT contain the old hardcoded string
assert.strictEqual(res1121.body.includes('MS 261 C-M, MS 260, MS 271, MS 291'), false, 'Must not contain old hardcoded models string');

const models1121 = (database.models || []).filter(m => m.series_code === '1121');
for (const m of models1121) {
  assert.strictEqual(res1121.body.includes(m.model_name), true, `Series 1121 page must include ${m.model_name}`);
}
assert.strictEqual(res1121.body.includes('MS 170'), false, 'Series 1121 must NOT include MS 170');
console.log('  ✅ Test 1 Passed: Series 1121 accurately lists only series 1121 models.');

// 2. Series 1130 (MS 170 / MS 180 family)
console.log('\n▶ Test 2: Series 1130 dynamic models rendering...');
const res1130 = await fetchPage('/onderdeelnummer/stihl-1130/');
assert.strictEqual(res1130.statusCode, 200, 'Series 1130 route must return 200 OK');
const models1130 = (database.models || []).filter(m => m.series_code === '1130');
for (const m of models1130) {
  assert.strictEqual(res1130.body.includes(m.model_name), true, `Series 1130 page must include ${m.model_name}`);
}
assert.strictEqual(res1130.body.includes('MS 261'), false, 'Series 1130 must NOT include MS 261');
console.log('  ✅ Test 2 Passed: Series 1130 accurately lists only series 1130 models.');

// 3. Series 1141 (MS 261 family)
console.log('\n▶ Test 3: Series 1141 dynamic models rendering...');
const res1141 = await fetchPage('/onderdeelnummer/stihl-1141/');
assert.strictEqual(res1141.statusCode, 200, 'Series 1141 route must return 200 OK');
const models1141 = (database.models || []).filter(m => m.series_code === '1141');
for (const m of models1141) {
  assert.strictEqual(res1141.body.includes(m.model_name), true, `Series 1141 page must include ${m.model_name}`);
}
assert.strictEqual(res1141.body.includes('MS 170'), false, 'Series 1141 must NOT include MS 170');
console.log('  ✅ Test 3 Passed: Series 1141 accurately lists only series 1141 models.');

// 4. Unknown prefix returns 404
console.log('\n▶ Test 4: Unknown series prefix handling...');
const resUnknown = await fetchPage('/onderdeelnummer/stihl-99999/');
assert.strictEqual(resUnknown.statusCode, 404, 'Unknown series prefix must return 404');
assert.strictEqual(resUnknown.body.includes('Pagina niet gevonden'), true, 'Must render branded 404 page');
console.log('  ✅ Test 4 Passed: Unknown series prefixes return 404 Not Found.');

server.close(() => {
  console.log('\n🎉 ALL PART NUMBER SERIES ROUTES TESTS PASSED 100% CLEANLY!');
  process.exit(0);
});
