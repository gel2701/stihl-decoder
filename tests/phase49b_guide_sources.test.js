import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { getStructuredGuide } from '../src/content/guides/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49B GUIDE SOURCES & TECHNICAL ATTRIBUTION SUITE');
console.log('===============================================================\n');

// 1. Published Guide Sources Section
console.log('▶ Test 1: Published guide sources section & provenance cards...');
const startGuide = database.guides.find(g => g.slug === 'stihl-kettingzaag-start-niet');
const guideHtml = renderGuidePageHtml(startGuide, database, baseUrl);

assert.strictEqual(guideHtml.includes('Bronnen en Beperkingen'), true, 'Must render Bronnen en Beperkingen section');
assert.strictEqual(guideHtml.includes('0458-133-3021'), true, 'Must cite STIHL 026/MS 260 publication ID');
assert.strictEqual(guideHtml.includes('0458-017-0121'), true, 'Must cite MS 170/180 publication ID');
assert.strictEqual(guideHtml.includes('0458-545-0121'), true, 'Must cite MS 261 C-M publication ID');

// No leak of local file paths or internal corpora
assert.strictEqual(guideHtml.includes('C:\\'), false, 'Must not expose local Windows paths');
assert.strictEqual(guideHtml.includes('GelliusSnippe'), false, 'Must not expose local usernames');
assert.strictEqual(guideHtml.includes('corpus'), false, 'Must not expose internal corpus terminology');
console.log('  ✅ Test 1 Passed: Official publications and publication IDs cleanly rendered without path leakage.');

// 2. M-Tronic Generation & Source Requirement
console.log('\n▶ Test 2: M-Tronic generation dependence & source requirement...');
const mtronicGuide = getStructuredGuide('stihl-m-tronic-resetten');
assert.ok(mtronicGuide, 'M-Tronic guide structured data must exist');
assert.strictEqual(
  mtronicGuide.directAnswer.content.includes('De reset- en kalibratieprocedure is generatieafhankelijk') ||
  mtronicGuide.directAnswer.content.includes('generatieafhankelijk'),
  true,
  'M-Tronic direct answer must state generation dependence'
);

assert.ok(Array.isArray(mtronicGuide.generationModelData), 'Must have generationModelData table');
assert.ok(mtronicGuide.generationModelData.length >= 3, 'Must define at least Gen 1, Gen 2/2.1, and Gen 3');

for (const gen of mtronicGuide.generationModelData) {
  assert.ok(gen.generation, 'Must specify generation');
  assert.ok(gen.models && gen.models.length > 0, 'Must specify affected models');
  assert.ok(gen.sourceDocument, 'Must specify source document');
  assert.ok(gen.procedureOverview, 'Must specify procedure overview');
  assert.strictEqual(gen.publicationEligibility, 'DOCUMENTED_REFERENCE');
}
console.log('  ✅ Test 2 Passed: M-Tronic procedures are strictly partitioned by generation with explicit sources.');

// 3. Gietklok: Part Casting Date vs Machine Assembly Year
console.log('\n▶ Test 3: Gietklok distinction: part casting date vs machine build year...');
const gietklokGuide = getStructuredGuide('stihl-gietklok-aflezen');
assert.ok(gietklokGuide, 'Gietklok guide structured data must exist');

const gietklokAnswer = gietklokGuide.directAnswer.content;
assert.strictEqual(gietklokAnswer.includes('DAT SPECIFIEKE ONDERDEEL') || gietklokAnswer.includes('specifieke onderdeel'), true);
assert.strictEqual(gietklokAnswer.includes('Bewijst NIET') || gietklokAnswer.includes('bewijst NIET'), true);

const points = gietklokGuide.distinctionFramework.partCastDateVsMachineAssembly.points;
assert.ok(points.some(p => p.label.includes('Gietdatum') && p.description.includes('onderdeel')), 'Must define part cast date');
assert.ok(points.some(p => p.label.includes('Assemblagejaar') && p.description.includes('machine')), 'Must define machine assembly year');
console.log('  ✅ Test 3 Passed: Part casting date is strictly distinguished from complete machine build year.');

// 4. Counterfeit Guide: Non-Binary Result Categories
console.log('\n▶ Test 4: Counterfeit guide non-binary result categories & StopHeling truthfulness...');
const fakeGuide = getStructuredGuide('namaak-stihl-herkennen');
assert.ok(fakeGuide, 'Counterfeit guide structured data must exist');

const categories = fakeGuide.resultCategories.map(c => c.category);
assert.deepStrictEqual(categories, ['NO_OBVIOUS_ISSUE', 'INCONSISTENCY_FOUND', 'MANUAL_REVIEW_RECOMMENDED']);
assert.strictEqual(categories.includes('AUTHENTIC'), false, 'Must not claim binary AUTHENTIC');
assert.strictEqual(categories.includes('FAKE'), false, 'Must not claim binary FAKE');

// StopHeling truthfulness
const warningTexts = fakeGuide.warnings.map(w => `${w.title} ${w.text}`).join(' ') + ' ' + fakeGuide.directAnswer.content;
assert.strictEqual(warningTexts.includes('StopHeling'), true, 'Must mention StopHeling');
assert.strictEqual(
  warningTexts.includes('authenticiteitscontrole') || warningTexts.includes('bewijs van authenticiteit'),
  true,
  'Must clarify StopHeling is theft check only'
);
console.log('  ✅ Test 4 Passed: Counterfeit guide strictly adheres to evidence-based categories and StopHeling truthfulness.');

console.log('\n🎉 ALL PHASE 49B GUIDE SOURCES & ATTRIBUTION TESTS PASSED 100% CLEANLY!');
