import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { buildStructuredData } from '../src/components/StructuredData.js';
import { getStructuredGuide } from '../src/content/guides/index.js';
import { isGuidePublished } from '../src/publicationRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49B GUIDE CONTENT SUITE');
console.log('===============================================================\n');

// 1. Direct Answer Card
console.log('▶ Test 1: Published guide direct answer card verification...');
const startGuideData = database.guides.find(g => g.slug === 'stihl-kettingzaag-start-niet');
assert.ok(startGuideData, 'stihl-kettingzaag-start-niet must exist in database');
assert.strictEqual(isGuidePublished('stihl-kettingzaag-start-niet'), true, 'Guide must be published');

const guideHtml = renderGuidePageHtml(startGuideData, database, baseUrl);
assert.strictEqual(guideHtml.includes('Kort antwoord: wat kunt u veilig direct controleren?'), true, 'Must render direct answer heading');
assert.strictEqual(guideHtml.includes('Controleer eerst de juiste startprocedure'), true, 'Direct answer must answer immediately');
assert.strictEqual(guideHtml.includes('id="kort-antwoord"'), true, 'Must have #kort-antwoord section ID');
console.log('  ✅ Test 1 Passed: Published guide renders a substantive direct answer card.');

// 2. Substantive Body & Sections
console.log('\n▶ Test 2: Substantive sections and diagnostic tree verification...');
assert.strictEqual(guideHtml.includes('id="inhoud"'), true, 'Must have table of contents');
assert.strictEqual(guideHtml.includes('Koude Motor Startprocedure (Choke)'), true, 'Must have cold start procedure');
assert.strictEqual(guideHtml.includes('Warme Motor Startprocedure (Zonder Choke)'), true, 'Must have warm start procedure');
assert.strictEqual(guideHtml.includes('Verzopen Motor Herstellen (Officiële Procedure)'), true, 'Must have flooded engine recovery');
assert.strictEqual(guideHtml.includes('Probleem- en Oorzaakmatrix'), true, 'Must have troubleshooting matrix');
assert.strictEqual(guideHtml.includes('<table'), true, 'Must render responsive HTML table for matrix');
assert.strictEqual(guideHtml.includes('id="wanneer-dealer"'), true, 'Must have when to stop/call dealer section');
console.log('  ✅ Test 2 Passed: Substantive structure, start tree, and troubleshooting matrix verified.');

// 3. Structured Data Schema Alignment (FAQPage & HowTo)
console.log('\n▶ Test 3: Schema.org structured data alignment (FAQPage & HowTo)...');
const structuredGuide = getStructuredGuide('stihl-kettingzaag-start-niet');
assert.ok(structuredGuide, 'Structured guide definition must exist');

const schema = buildStructuredData({
  pageType: 'guide',
  guide: structuredGuide,
  url: `${baseUrl}/gidsen/stihl-kettingzaag-start-niet/`
});

const graph = schema['@graph'];
assert.ok(graph, '@graph must exist in structured data');

const techArticle = graph.find(item => item['@type'] === 'TechArticle');
assert.ok(techArticle, 'TechArticle schema must exist');
assert.strictEqual(techArticle.headline, structuredGuide.title);

const faqPage = graph.find(item => item['@type'] === 'FAQPage');
assert.ok(faqPage, 'FAQPage schema must exist for guide with FAQs');
assert.strictEqual(faqPage.mainEntity.length, structuredGuide.faq.length, 'FAQ schema count must match visible FAQ count');

// Check that visible HTML matches FAQ schema questions
for (const faqItem of structuredGuide.faq) {
  assert.strictEqual(guideHtml.includes(faqItem.question), true, `Visible HTML must include FAQ question: ${faqItem.question}`);
  assert.ok(faqPage.mainEntity.some(e => e.name === faqItem.question), `Schema must include question: ${faqItem.question}`);
}

const howTo = graph.find(item => item['@type'] === 'HowTo');
assert.ok(howTo, 'HowTo schema must exist for published start-niet guide');
assert.strictEqual(howTo.step.length, structuredGuide.floodedEngineRecovery.steps.length, 'HowTo steps must match recovery steps');
console.log('  ✅ Test 3 Passed: TechArticle, FAQPage, and HowTo schemas match visible content 1:1.');

// 4. Gated HowTo Policy (No HowTo on M-Tronic reset)
console.log('\n▶ Test 4: HowTo schema restriction for non-eligible guides...');
const mtronicGuide = getStructuredGuide('stihl-m-tronic-resetten');
const mtronicSchema = buildStructuredData({
  pageType: 'guide',
  guide: mtronicGuide,
  url: `${baseUrl}/gidsen/stihl-m-tronic-resetten/`
});
const mtronicGraph = mtronicSchema['@graph'] || [];
const mtronicHowTo = mtronicGraph.find(item => item['@type'] === 'HowTo');
assert.strictEqual(mtronicHowTo, undefined, 'M-Tronic reset must NOT have HowTo schema as procedures vary by generation');
console.log('  ✅ Test 4 Passed: HowTo schema strictly prohibited on variable/non-standardized guides.');

// 5. Word Count and Substantive Body Metric
console.log('\n▶ Test 5: Substantive depth and word count metric...');
const plainText = guideHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = plainText.split(' ').length;
console.log(`  ℹ️ Rendered guide plain text word count: ${wordCount} words`);
assert.ok(wordCount >= 1000, `Guide must be substantive (expected >= 1000 words, got ${wordCount})`);
console.log('  ✅ Test 5 Passed: Guide is comprehensive, deeply informative, and substantive.');

console.log('\n🎉 ALL PHASE 49B GUIDE CONTENT TESTS PASSED 100% CLEANLY!');
