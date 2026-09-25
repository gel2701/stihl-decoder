import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { renderComparisonPageHtml } from '../src/components/ComparisonPageTemplate.js';
import { renderIntentPageHtml } from '../src/components/IntentPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = 3098;
process.env.PORT = String(PORT);
const { server } = await import('../server.js');

// Wait 400ms for server startup
await new Promise(r => setTimeout(r, 400));

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49A USER TRUST & FUNCTIONAL INTEGRITY TEST SUITE');
console.log('===============================================================\n');

// 1. Pro Report MVP unmounted
console.log('▶ Test 1: Pro Report unmounted from ModelPageTemplate...');
const ms261 = database.models.find(m => m.slug === 'ms-261' || m.model_name === 'MS 261 C-M');
const ms261Html = renderModelPageHtml(ms261, database, baseUrl);
assert.strictEqual(ms261Html.includes('€4.99'), false, 'Model page must not display €4.99 price claim');
assert.strictEqual(ms261Html.includes('€4,99'), false, 'Model page must not display €4,99 price claim');
assert.strictEqual(ms261Html.includes('Directe download'), false, 'Model page must not promise Directe download');
assert.strictEqual(ms261Html.includes('passport-pro-mvp'), false, 'Model page must not mount passport-pro-mvp');
assert.strictEqual(ms261Html.includes('lead-mvp'), false, 'Model page must not mount lead-mvp');
console.log('  ✅ Test 1 Passed: Pro report MVP and lead forms unmounted.');

// 2. Zero broken search forms
console.log('\n▶ Test 2: Zero broken search forms across templates...');
const catHtml = renderCategoryPageHtml('kettingzagen', database, baseUrl);
const compHtml = renderComparisonPageHtml('ms-170-vs-ms-180', database, baseUrl);
const intentPassport = database.intent_pages.find(i => i.slug === 'stihl-paspoort');
const intentHtml = renderIntentPageHtml(intentPassport, database, baseUrl);

const templates = [
  { name: 'ModelPage', html: ms261Html },
  { name: 'CategoryPage', html: catHtml },
  { name: 'ComparisonPage', html: compHtml },
  { name: 'IntentPage', html: intentHtml }
];

for (const t of templates) {
  assert.strictEqual(t.html.includes('action="/" method="GET"'), false, `${t.name} must not contain broken action="/" form`);
  assert.strictEqual(t.html.includes('name="q"'), false, `${t.name} must not contain broken name="q" input`);
  assert.strictEqual(t.html.includes('/#decoder'), true, `${t.name} must link directly to /#decoder`);
}
console.log('  ✅ Test 2 Passed: All search forms replaced with working /#decoder CTAs.');

// 3. StopHeling & Valuation honesty
console.log('\n▶ Test 3: StopHeling & Valuation claim integrity...');
assert.strictEqual(ms261Html.includes('politiecertificering'), false, 'Must not claim police certification');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
assert.strictEqual(indexHtml.includes('politiecertificering'), false, 'index.html must not claim police certification');
assert.strictEqual(indexHtml.includes('id="decoder"'), true, 'index.html must have id="decoder" on search section');

// Regression checks on StopHeling copy
assert.strictEqual(indexHtml.includes('StopHeling-controlestatus en een downloadbaar onafhankelijk rapport'), false, 'Must not claim automatic StopHeling-controlestatus');
assert.strictEqual(indexHtml.includes('hulpmiddel voor controle via StopHeling'), true, 'Must describe StopHeling as assistance tool');

// Regression checks on universal 9-digit and branding
assert.strictEqual(indexHtml.includes('officieel serienummer bestaat uit exact 9 cijfers'), false, 'Must not contain universal 9-digit claim');
assert.strictEqual(indexHtml.includes('Geverifieerde STIHL Machinegidsen'), false, 'Must not contain unverified branding');

// Zero HOLD link leaks
const holdLeaksRegex = /href=["'](\/stihl-(?:bouwjaar|modellen|serienummer-decoder|diefstalcheck|waarde|serienummer|serienummer-bouwjaar|productiedatum|model-herkennen|typeplaatje|serienummer-ongeldig|tweedehands-checklist)|\/waar-staat-serienummer-stihl|\/gidsen\/(?:stihl-gietklok-aflezen|namaak-stihl-herkennen|stihl-kettingzaag-start-niet|stihl-carburateur-afstellen|stihl-m-tronic-resetten))\/?["']/i;
assert.strictEqual(holdLeaksRegex.test(indexHtml), false, 'index.html must have 0 HOLD link leaks');
assert.strictEqual(holdLeaksRegex.test(catHtml), false, 'CategoryPage must have 0 HOLD link leaks');
console.log('  ✅ Test 3 Passed: Claims verified honest with proper disclaimers and 0 HOLD leaks.');

// 4. Lead endpoints return 410 Gone
console.log('\n▶ Test 4: Lead API endpoints return 410 Gone...');
const postLead = (reqPath) => new Promise((resolve, reject) => {
  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: reqPath,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
  });
  req.on('error', reject);
  req.write(JSON.stringify({ name: 'Test', email: 'test@example.com' }));
  req.end();
});

const repairRes = await postLead('/api/v1/leads/repair');
assert.strictEqual(repairRes.statusCode, 410, '/api/v1/leads/repair must return 410 Gone');
assert.strictEqual(repairRes.body.success, false);
assert.strictEqual(repairRes.body.error, 'SERVICE_NOT_AVAILABLE');

const sellRes = await postLead('/api/v1/leads/sell');
assert.strictEqual(sellRes.statusCode, 410, '/api/v1/leads/sell must return 410 Gone');
assert.strictEqual(sellRes.body.success, false);
assert.strictEqual(sellRes.body.error, 'SERVICE_NOT_AVAILABLE');

console.log('  ✅ Test 4 Passed: Lead endpoints cleanly return 410 Gone.');

server.close(() => {
  console.log('\n🎉 ALL USER TRUST & FUNCTIONAL INTEGRITY TESTS PASSED 100% CLEANLY!');
  process.exit(0);
});
