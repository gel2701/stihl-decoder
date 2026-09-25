import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import {
  isGuidePublished,
  GUIDE_ROUTE_CONFIG,
  getRelevantPublicLinks
} from '../src/publicationRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = 3108;
process.env.PORT = String(PORT);
const { server } = await import('../server.js');

// Allow 400ms for server to boot
await new Promise(r => setTimeout(r, 400));

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49B GUIDE LINKS, ROUTING & MACHINE CONTEXT SUITE');
console.log('===============================================================\n');

// 1. All Internal & Anchor Links on Published Guide Resolve
console.log('▶ Test 1: Guide link resolution and internal anchor targets...');
const startGuide = database.guides.find(g => g.slug === 'stihl-kettingzaag-start-niet');
const guideHtml = renderGuidePageHtml(startGuide, database, baseUrl);

// Check all anchor links (#...) have matching id="..." in the HTML
const anchorMatches = [...guideHtml.matchAll(/href=["']#([^"']+)["']/g)].map(m => m[1]);
assert.ok(anchorMatches.length > 0, 'Must have anchor links');
for (const anchor of anchorMatches) {
  const hasTarget = guideHtml.includes(`id="${anchor}"`);
  assert.strictEqual(hasTarget, true, `Anchor #${anchor} must have matching id="${anchor}" in HTML`);
}

// Check all relative links resolve
const fetchStatus = (reqPath) => new Promise((resolve, reject) => {
  const req = http.get({
    hostname: 'localhost',
    port: PORT,
    path: reqPath
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject);
});

const relativeMatches = [...guideHtml.matchAll(/href=["'](\/[^"'#]*)["']/g)].map(m => m[1]);
const uniquePaths = Array.from(new Set(relativeMatches));
for (const p of uniquePaths) {
  if (p === '/') continue;
  const res = await fetchStatus(p);
  assert.ok(
    res.statusCode === 200 || res.statusCode === 301,
    `Path ${p} linked from guide must return 200 or 301 (got ${res.statusCode})`
  );
}
console.log(`  ✅ Test 1 Passed: All ${anchorMatches.length} anchors and ${uniquePaths.length} relative paths resolve cleanly.`);

// 2. Machine Context Relevance for Guide Links
console.log('\n▶ Test 2: Machine context relevance on model pages...');
// MS 261 C-M (Petrol Chainsaw) -> SHOULD link to kettingzaag-start-niet
const ms261 = database.models.find(m => m.model_name === 'MS 261 C-M' || m.slug === 'ms-261-c-m' || m.slug === 'ms-261');
assert.ok(ms261, 'MS 261 must exist');
const ms261Links = getRelevantPublicLinks(ms261, database);
assert.ok(
  ms261Links.some(l => l.href === '/gidsen/stihl-kettingzaag-start-niet/'),
  'Petrol chainsaw must link to stihl-kettingzaag-start-niet'
);

// MSA 60 C-B (Battery Chainsaw) -> MUST NOT link to petrol start guide
const msa60 = database.models.find(m => m.slug === 'msa-60-c-b' || m.model_name === 'MSA 60 C-B');
if (msa60) {
  const msa60Links = getRelevantPublicLinks(msa60, database);
  assert.strictEqual(
    msa60Links.some(l => l.href === '/gidsen/stihl-kettingzaag-start-niet/'),
    false,
    'Battery chainsaw must NOT link to petrol start guide'
  );
}

// FS 350 (Petrol Trimmer) -> MUST NOT link to chainsaw start guide
const fs350 = database.models.find(m => m.slug === 'fs-350');
if (fs350) {
  const fs350Links = getRelevantPublicLinks(fs350, database);
  assert.strictEqual(
    fs350Links.some(l => l.href === '/gidsen/stihl-kettingzaag-start-niet/'),
    false,
    'Trimmer must NOT link to chainsaw start guide'
  );
}
console.log('  ✅ Test 2 Passed: Guide links strictly respect machine drive context and equipment category.');

// 3. Server HTTP Status: 200 for PUBLISHED, 404 for READY_FOR_REVIEW and HOLD
console.log('\n▶ Test 3: HTTP status verification for publication gates...');
const pubStatusRes = await fetchStatus('/gidsen/stihl-kettingzaag-start-niet/');
assert.strictEqual(pubStatusRes.statusCode, 200, 'Published start guide must return HTTP 200');

const reviewSlugs = ['stihl-carburateur-afstellen', 'stihl-m-tronic-resetten', 'stihl-gietklok-aflezen', 'namaak-stihl-herkennen'];
for (const slug of reviewSlugs) {
  const res = await fetchStatus(`/gidsen/${slug}/`);
  assert.strictEqual(res.statusCode, 404, `Gated guide /gidsen/${slug}/ must return HTTP 404`);
}
console.log('  ✅ Test 3 Passed: Published guide serves 200; gated READY_FOR_REVIEW guides return 404.');

// 4. Sitemap Filtration: Only Published Guides Included
console.log('\n▶ Test 4: Dynamic sitemap.xml filtration...');
const sitemapXml = generateSitemapXml(baseUrl, database);
assert.strictEqual(sitemapXml.includes('/gidsen/stihl-kettingzaag-start-niet/'), true, 'Sitemap must contain stihl-kettingzaag-start-niet');
assert.strictEqual(sitemapXml.includes('/gidsen/serienummer-locaties/'), true, 'Sitemap must contain serienummer-locaties');

for (const slug of reviewSlugs) {
  assert.strictEqual(sitemapXml.includes(`/gidsen/${slug}/`), false, `Sitemap must NOT contain /gidsen/${slug}/`);
}

const sitemapGuideMatches = [...sitemapXml.matchAll(/\/gidsen\/[^<]+/g)];
console.log(`  ℹ️ Total guides in sitemap.xml: ${sitemapGuideMatches.length}`);
assert.strictEqual(sitemapGuideMatches.length, 2, 'Sitemap must contain exactly 2 published guides');
console.log('  ✅ Test 4 Passed: Sitemap dynamically includes exactly the 2 published guides.');

// Close server
await new Promise(resolve => server.close(resolve));
console.log('\n🎉 ALL PHASE 49B GUIDE LINKS & ROUTING TESTS PASSED 100% CLEANLY!');
