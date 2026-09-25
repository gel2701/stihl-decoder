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
console.log('🧪 RUNNING PHASE 49B GUIDE SAFETY & CLAIM INTEGRITY SUITE');
console.log('===============================================================\n');

const startGuide = database.guides.find(g => g.slug === 'stihl-kettingzaag-start-niet');
const guideHtml = renderGuidePageHtml(startGuide, database, baseUrl);

// 1. Safe Troubleshooting Levels
console.log('▶ Test 1: Safe troubleshooting levels (Level 1, Level 2, Level 3)...');
assert.strictEqual(guideHtml.includes('LEVEL 1 — USER SAFE CHECK'), true, 'Must define Level 1');
assert.strictEqual(guideHtml.includes('LEVEL 2 — EXPERIENCED USER / MANUAL REQUIRED'), true, 'Must define Level 2');
assert.strictEqual(guideHtml.includes('LEVEL 3 — SERVICE PROCEDURE'), true, 'Must define Level 3');

// Level 3 must not provide DIY improvisation
assert.strictEqual(guideHtml.includes('Vakhandelaar / Officiële service'), true);
assert.strictEqual(guideHtml.includes('uitsluitend door een erkende dealer of getrainde technicus'), true);
console.log('  ✅ Test 1 Passed: Troubleshooting levels strictly enforce user safety boundaries.');

// 2. No Universal Carburetor Setting Claims
console.log('\n▶ Test 2: Prohibition of universal H/L carburetor baseline claims...');
assert.strictEqual(guideHtml.includes('H 1 slag open'), false, 'Must not claim H 1 slag open');
assert.strictEqual(guideHtml.includes('L 1 slag open'), false, 'Must not claim L 1 slag open');
assert.strictEqual(guideHtml.includes('standaard 1 slag'), false, 'Must not claim standard 1 turn');
assert.strictEqual(guideHtml.includes('Draai nooit zonder toerenteller'), true, 'Must warn against adjusting without tachometer');
assert.strictEqual(guideHtml.includes('zuigervreter'), true, 'Must warn about lean seizure risk');
console.log('  ✅ Test 2 Passed: Universal carburetor claims strictly absent; lean seizure risks explicitly stated.');

// 3. No Universal Spark Plug Claim
console.log('\n▶ Test 3: Prohibition of universal spark plug claims...');
assert.strictEqual(guideHtml.includes('Er bestaat geen universele bougie die in iedere STIHL kettingzaag past'), true, 'Must explicitly state no universal spark plug');
assert.strictEqual(guideHtml.includes('deze bougie past op alle STIHL'), false, 'Must not claim universal fit');
assert.strictEqual(guideHtml.includes('Bosch WSR6F past op elke'), false, 'Must not claim universal Bosch plug');
console.log('  ✅ Test 3 Passed: Universal spark plug claim strictly absent; model manual consult required.');

// 4. No Universal Fuel Ratio Claim Without Scope
console.log('\n▶ Test 4: Fuel mix scope-safe claim verification...');
assert.strictEqual(guideHtml.includes('Gebruik altijd 1:50'), false, 'Must not make un-scoped 1:50 claim');
assert.strictEqual(guideHtml.includes('Gebruik altijd de brandstof en de exacte mengverhouding die in de handleiding van uw specifieke model wordt voorgeschreven'), true, 'Must require model manual specification');
assert.strictEqual(guideHtml.includes('fase-scheiding') || guideHtml.includes('ontmengen'), true, 'Must explain ethanol phase separation and fuel aging');
console.log('  ✅ Test 4 Passed: Fuel mix claim is strictly scope-safe; fuel aging risks documented.');

// 5. No Repair Liability Overclaims
console.log('\n▶ Test 5: Repair liability wording verification...');
assert.strictEqual(guideHtml.includes('dit lost uw probleem op'), false, 'Must not overclaim "dit lost uw probleem op"');
assert.strictEqual(guideHtml.includes('gegarandeerde oplossing'), false, 'Must not claim guaranteed fix');
assert.strictEqual(guideHtml.includes('Mogelijke oorzaak'), true, 'Must use cautious "Mogelijke oorzaak"');
assert.strictEqual(guideHtml.includes('kan wijzen op') || guideHtml.includes('mogelijke oorzaak'), true, 'Must use prudent diagnostic terminology');
console.log('  ✅ Test 5 Passed: Honest, non-committal diagnostic language used throughout.');

// 6. Mandatory Safety Warnings
console.log('\n▶ Test 6: Mandatory safety warnings verification...');
assert.strictEqual(guideHtml.includes('Kettingrem altijd inschakelen vóór het starten'), true, 'Must require chain brake');
assert.strictEqual(guideHtml.includes('Stabiele startpositie verplicht'), true, 'Must require stable ground position');
assert.strictEqual(guideHtml.includes('NOOIT \'uit de hand\''), true, 'Must forbid flying start');
assert.strictEqual(guideHtml.includes('Brand- en ontploffingsgevaar'), true, 'Must warn about fire/explosion risks');
console.log('  ✅ Test 6 Passed: All mandatory safety precautions verified in rendered HTML.');

console.log('\n🎉 ALL PHASE 49B GUIDE SAFETY TESTS PASSED 100% CLEANLY!');
