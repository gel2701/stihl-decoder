import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import {
  isGuidePublished,
  isIntentPublished,
  GUIDE_PUBLICATION_STATUS,
  INTENT_PUBLICATION_STATUS
} from '../src/publicationRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = 3099;
process.env.PORT = String(PORT);
const { server } = await import('../server.js');

// Wait 400ms for server startup
await new Promise(r => setTimeout(r, 400));

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49A CONTENT QUALITY & PUBLICATION GATE SUITE');
console.log('===============================================================\n');

// 1. Substantive Serial Location Guide Verification
console.log('▶ Test 1: Substantive serial location guide rendering...');
const serialGuide = database.guides.find(g => g.slug === 'serienummer-locaties');
assert.ok(serialGuide, 'serienummer-locaties guide must exist in database');
const guideHtml = renderGuidePageHtml(serialGuide, database, baseUrl);

// Check 6 machine categories
assert.strictEqual(guideHtml.includes('Kettingzagen (MS / MSA / MSE)'), true, 'Guide must cover chainsaws');
assert.strictEqual(guideHtml.includes('Bosmaaiers & Trimmers (FS / FSA / FSE)'), true, 'Guide must cover trimmers');
assert.strictEqual(guideHtml.includes('Bladblazers (BG / BGA / BR)'), true, 'Guide must cover blowers');
assert.strictEqual(guideHtml.includes('Heggenscharen (HS / HSA / HLA)'), true, 'Guide must cover hedge trimmers');
assert.strictEqual(guideHtml.includes('Doorslijpers (TS / TSA)'), true, 'Guide must cover cut-off machines');
assert.strictEqual(guideHtml.includes('Accu-machines (AK, AP, AS Systemen)'), true, 'Guide must cover battery tools');

// Practical inspection steps
assert.strictEqual(guideHtml.includes('Veiligheidsmaatregelen'), true, 'Must include safety preparation');
assert.strictEqual(guideHtml.includes('ontvetter') || guideHtml.includes('remmenreiniger'), true, 'Must recommend degreaser/cleaning');
assert.strictEqual(guideHtml.includes('Ingeslagen Nummer versus Typeplaatjessticker'), true, 'Must distinguish stamped vs sticker');
assert.strictEqual(guideHtml.includes('11-cijferig'), true, 'Must warn against 11-digit part number');
assert.strictEqual(guideHtml.includes('9-cijferig'), true, 'Must specify 9-digit serial number');
assert.strictEqual(guideHtml.includes('/#decoder'), true, 'Must link to /#decoder');

// Regression checks on branding and universal 9-digit claims
assert.strictEqual(guideHtml.includes('Geverifieerde STIHL Machinegidsen'), false, 'Must not claim "Geverifieerde STIHL Machinegidsen" branding');
assert.strictEqual(guideHtml.includes('Een officieel STIHL serienummer bestaat uit exact 9 cijfers'), false, 'Must not make universal 9-digit serial claim');
assert.strictEqual(guideHtml.includes('STIHLDecoder Kennisbank'), true, 'Must use updated "STIHLDecoder Kennisbank" branding');
console.log('  ✅ Test 1 Passed: Serial location guide is substantive, practical, and comprehensive.');

// 2. Publication Gates & Sitemap Filtration
console.log('\n▶ Test 2: Publication rules & Sitemap filtration for all HOLD resources...');
assert.strictEqual(isGuidePublished('serienummer-locaties'), true);
assert.strictEqual(isIntentPublished('stihl-paspoort'), true);

const sitemapXml = generateSitemapXml(baseUrl, database);
assert.strictEqual(sitemapXml.includes('/gidsen/serienummer-locaties/'), true, 'Sitemap must contain published guide');
assert.strictEqual(sitemapXml.includes('/stihl-paspoort/'), true, 'Sitemap must contain published intent');

const holdGuideSlugs = Object.entries(GUIDE_PUBLICATION_STATUS)
  .filter(([_, status]) => status === 'HOLD')
  .map(([slug]) => slug);
assert.strictEqual(holdGuideSlugs.length, 5, 'Must have exactly 5 HOLD guides');

for (const slug of holdGuideSlugs) {
  assert.strictEqual(isGuidePublished(slug), false, `Guide ${slug} must be on HOLD`);
  assert.strictEqual(sitemapXml.includes(`/gidsen/${slug}/`), false, `Sitemap must NOT contain HOLD guide /gidsen/${slug}/`);
}

const holdIntentSlugs = Object.entries(INTENT_PUBLICATION_STATUS)
  .filter(([_, status]) => status === 'HOLD')
  .map(([slug]) => slug);
assert.strictEqual(holdIntentSlugs.length, 13, 'Must have exactly 13 HOLD intents');

for (const slug of holdIntentSlugs) {
  assert.strictEqual(isIntentPublished(slug), false, `Intent ${slug} must be on HOLD`);
  assert.strictEqual(sitemapXml.includes(`/${slug}/`), false, `Sitemap must NOT contain HOLD intent /${slug}/`);
}
console.log('  ✅ Test 2 Passed: Sitemap strictly excludes all 5 HOLD guides and all 13 HOLD intent pages.');

// 3. Server HTTP 404 on HOLD routes
console.log('\n▶ Test 3: Server HTTP 404 behavior for all HOLD pages...');
const fetchStatus = (reqPath) => new Promise((resolve, reject) => {
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

const publishedGuideRes = await fetchStatus('/gidsen/serienummer-locaties/');
assert.strictEqual(publishedGuideRes.statusCode, 200, '/gidsen/serienummer-locaties/ must return 200');

const publishedIntentRes = await fetchStatus('/stihl-paspoort/');
assert.strictEqual(publishedIntentRes.statusCode, 200, '/stihl-paspoort/ must return 200');

for (const slug of holdGuideSlugs) {
  const res = await fetchStatus(`/gidsen/${slug}/`);
  assert.strictEqual(res.statusCode, 404, `/gidsen/${slug}/ must return 404`);
  assert.strictEqual(res.body.includes('Pagina niet gevonden'), true, `Must render branded 404 page for /gidsen/${slug}/`);
}

for (const slug of holdIntentSlugs) {
  const res = await fetchStatus(`/${slug}/`);
  assert.strictEqual(res.statusCode, 404, `/${slug}/ must return 404`);
  assert.strictEqual(res.body.includes('Pagina niet gevonden'), true, `Must render branded 404 page for /${slug}/`);
}
console.log('  ✅ Test 3 Passed: Server cleanly serves 200 for PUBLISHED and 404 for all HOLD pages.');

// 4. FAQ Quality Gate in ModelPageTemplate & StructuredData
console.log('\n▶ Test 4: FAQ Quality Gate for knownPeriod...');
const ms261 = database.models.find(m => m.slug === 'ms-261' || m.model_name === 'MS 261 C-M');
const ms261Html = renderModelPageHtml(ms261, database, baseUrl);
const ms261JsonLd = buildStructuredData({ pageType: 'model', model: ms261, url: `${baseUrl}/kettingzagen/ms-261/`, database });

// Model WITH confirmed production period
const modelWithPeriod = {
  ...ms261,
  production_start_year: 2010,
  production_end_year: 2020
};
const withPeriodHtml = renderModelPageHtml(modelWithPeriod, database, baseUrl);
const withPeriodJsonLd = buildStructuredData({ pageType: 'model', model: modelWithPeriod, url: `${baseUrl}/kettingzagen/ms-261/`, database });

// Negative case: ms261 without period must NOT render "Hoe oud" FAQ
assert.strictEqual(ms261Html.includes(`Hoe oud is mijn STIHL ${ms261.model_name}?`), false, 'Model without period must NOT have age FAQ');

// Positive case: modelWithPeriod must render "Hoe oud" FAQ
assert.strictEqual(withPeriodHtml.includes(`Hoe oud is mijn STIHL ${modelWithPeriod.model_name}?`), true, 'Model with period must have age FAQ');

// Check schema.org FAQPage entities
const withPeriodFaq = withPeriodJsonLd['@graph'].find(e => e['@type'] === 'FAQPage');
assert.ok(withPeriodFaq, 'withPeriod must have FAQPage in structured data');
const hasAgeInWithPeriod = withPeriodFaq.mainEntity.some(q => q.name.includes('Hoe oud'));
assert.strictEqual(hasAgeInWithPeriod, true, 'FAQPage schema must have age question when period known');

const ms261Faq = ms261JsonLd['@graph'].find(e => e['@type'] === 'FAQPage');
if (ms261Faq) {
  const hasAgeInMs261 = ms261Faq.mainEntity.some(q => q.name.includes('Hoe oud'));
  assert.strictEqual(hasAgeInMs261, false, 'FAQPage schema must NOT have age question when period unknown');
}
console.log('  ✅ Test 4 Passed: FAQ quality gate correctly conditions age FAQs on known period.');

server.close(() => {
  console.log('\n🎉 ALL CONTENT QUALITY & PUBLICATION GATE TESTS PASSED 100% CLEANLY!');
  process.exit(0);
});
