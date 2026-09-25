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
console.log('  ✅ Test 1 Passed: Serial location guide is substantive, practical, and comprehensive.');

// 2. Publication Gates & Sitemap Filtration
console.log('\n▶ Test 2: Publication rules & Sitemap filtration...');
assert.strictEqual(isGuidePublished('serienummer-locaties'), true);
assert.strictEqual(isGuidePublished('stihl-mengsmering'), false);
assert.strictEqual(isGuidePublished('stihl-bougies'), false);
assert.strictEqual(isIntentPublished('stihl-paspoort'), true);
assert.strictEqual(isIntentPublished('stihl-bouwjaar-controleren'), false);

const sitemapXml = generateSitemapXml(baseUrl, database);
assert.strictEqual(sitemapXml.includes('/gidsen/serienummer-locaties/'), true, 'Sitemap must contain published guide');
assert.strictEqual(sitemapXml.includes('/gidsen/stihl-mengsmering/'), false, 'Sitemap must NOT contain HOLD guide');
assert.strictEqual(sitemapXml.includes('/gidsen/stihl-bougies/'), false, 'Sitemap must NOT contain HOLD guide');
assert.strictEqual(sitemapXml.includes('/stihl-paspoort/'), true, 'Sitemap must contain published intent');
assert.strictEqual(sitemapXml.includes('/stihl-bouwjaar-controleren/'), false, 'Sitemap must NOT contain HOLD intent');
console.log('  ✅ Test 2 Passed: Sitemap strictly excludes HOLD guides and intent pages.');

// 3. Server HTTP 404 on HOLD routes
console.log('\n▶ Test 3: Server HTTP 404 behavior for HOLD pages...');
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

const holdGuideRes = await fetchStatus('/gidsen/stihl-mengsmering/');
assert.strictEqual(holdGuideRes.statusCode, 404, '/gidsen/stihl-mengsmering/ must return 404');
assert.strictEqual(holdGuideRes.body.includes('Pagina niet gevonden'), true, 'Must render branded 404 page');

const publishedGuideRes = await fetchStatus('/gidsen/serienummer-locaties/');
assert.strictEqual(publishedGuideRes.statusCode, 200, '/gidsen/serienummer-locaties/ must return 200');

const holdIntentRes = await fetchStatus('/stihl-bouwjaar-controleren/');
assert.strictEqual(holdIntentRes.statusCode, 404, '/stihl-bouwjaar-controleren/ must return 404');

const publishedIntentRes = await fetchStatus('/stihl-paspoort/');
assert.strictEqual(publishedIntentRes.statusCode, 200, '/stihl-paspoort/ must return 200');
console.log('  ✅ Test 3 Passed: Server cleanly serves 200 for PUBLISHED and 404 for HOLD pages.');

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
