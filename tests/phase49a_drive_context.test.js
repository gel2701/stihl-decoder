import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { getRelatedModels } from '../src/components/RelatedModels.js';
import { getFuelTypeCode } from '../src/publicationRules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49A DRIVE CONTEXT & PARTS SAFETY TEST SUITE');
console.log('===============================================================\n');

// 1. getFuelTypeCode classification accuracy
console.log('▶ Test 1: getFuelTypeCode classification...');
const fsa45 = database.models.find(m => m.slug === 'fsa-45' || m.model_name === 'FSA 45');
const msa60 = database.models.find(m => m.slug === 'msa-60-c-b' || m.model_name === 'MSA 60 C-B');
const ms261 = database.models.find(m => m.slug === 'ms-261' || m.model_name === 'MS 261 C-M');

assert.ok(fsa45, 'FSA 45 must exist in database');
assert.ok(msa60, 'MSA 60 C-B must exist in database');
assert.ok(ms261, 'MS 261 C-M must exist in database');

assert.strictEqual(getFuelTypeCode(fsa45), 'BATTERY', 'FSA 45 must be classified as BATTERY');
assert.strictEqual(getFuelTypeCode(msa60), 'BATTERY', 'MSA 60 C-B must be classified as BATTERY');
assert.strictEqual(getFuelTypeCode(ms261), 'PETROL_2STROKE', 'MS 261 C-M must be classified as PETROL_2STROKE');
console.log('  ✅ Test 1 Passed: Drive type classifications accurately identified.');

// 2. Battery trimmer parts safety (FSA 45)
console.log('\n▶ Test 2: FSA 45 (Battery Trimmer) parts context safety...');
const fsa45PartsHtml = renderModelPartsPageHtml(fsa45, database, baseUrl);
const forbiddenPetrolTerms = ['Bougie', 'Carburateur', 'Membraan', 'Brandstoffilter', '2-takt', 'M-Tronic'];
for (const term of forbiddenPetrolTerms) {
  assert.strictEqual(fsa45PartsHtml.includes(term), false, `FSA 45 parts page must not contain petrol term "${term}"`);
}
assert.strictEqual(fsa45PartsHtml.includes('Zaagketting'), false, 'FSA 45 trimmer must not list chainsaw chain');
assert.strictEqual(fsa45PartsHtml.includes('Zaagblad'), false, 'FSA 45 trimmer must not list guide bar');
assert.strictEqual(fsa45PartsHtml.includes('Maaidraad') || fsa45PartsHtml.includes('Trimmerkop') || fsa45PartsHtml.includes('PolyCut'), true, 'FSA 45 must list grass trimmer cutting attachments');
assert.strictEqual(fsa45PartsHtml.includes('Geïntegreerde Li-Ion') || fsa45PartsHtml.includes('Accu') || fsa45PartsHtml.includes('18V'), true, 'FSA 45 must display battery specifications');
console.log('  ✅ Test 2 Passed: FSA 45 parts page is 100% drive-context safe.');

// 3. Battery chainsaw parts safety (MSA 60 C-B)
console.log('\n▶ Test 3: MSA 60 C-B (Battery Chainsaw) parts context safety...');
const msa60PartsHtml = renderModelPartsPageHtml(msa60, database, baseUrl);
for (const term of forbiddenPetrolTerms) {
  assert.strictEqual(msa60PartsHtml.includes(term), false, `MSA 60 C-B parts page must not contain petrol term "${term}"`);
}
assert.strictEqual(msa60PartsHtml.includes('Zaagketting'), true, 'MSA 60 C-B chainsaw must list chainsaw chain');
assert.strictEqual(msa60PartsHtml.includes('Geleideblad') || msa60PartsHtml.includes('Zaagblad'), true, 'MSA 60 C-B chainsaw must list guide bar');
assert.strictEqual(/kettingolie/i.test(msa60PartsHtml), true, 'MSA 60 C-B must list chain lubrication oil');
assert.strictEqual(msa60PartsHtml.includes('AK-Systeem') || msa60PartsHtml.includes('36V') || msa60PartsHtml.includes('Accu'), true, 'MSA 60 C-B must display battery system info');
console.log('  ✅ Test 3 Passed: MSA 60 C-B correctly combines chainsaw cutting gear with battery powertrain.');

// 4. Petrol chainsaw parts safety (MS 261 C-M)
console.log('\n▶ Test 4: MS 261 C-M (Petrol Chainsaw) parts completeness...');
const ms261PartsHtml = renderModelPartsPageHtml(ms261, database, baseUrl);
assert.strictEqual(ms261PartsHtml.includes('Bougie'), true, 'MS 261 C-M must list spark plug');
assert.strictEqual(ms261PartsHtml.includes('Luchtfilter'), true, 'MS 261 C-M must list air filter');
assert.strictEqual(ms261PartsHtml.includes('Zaagketting'), true, 'MS 261 C-M must list saw chain');
assert.strictEqual(ms261PartsHtml.includes('Brandstof'), true, 'MS 261 C-M must include fuel guidance');
assert.strictEqual(ms261PartsHtml.includes('Accusysteem'), false, 'MS 261 C-M must not list battery system specs');
console.log('  ✅ Test 4 Passed: MS 261 C-M lists appropriate 2-stroke chainsaw parts.');

// 5. Related models drive affinity
console.log('\n▶ Test 5: Related models drive affinity and cross-pollution prevention...');
const msa60Related = getRelatedModels(msa60, database, 4);
for (const rel of msa60Related) {
  const relFuel = getFuelTypeCode(rel);
  assert.strictEqual(relFuel, 'BATTERY', `Related model ${rel.model_name} for MSA 60 C-B must be BATTERY, was ${relFuel}`);
}

const ms261Related = getRelatedModels(ms261, database, 4);
for (const rel of ms261Related) {
  const relFuel = getFuelTypeCode(rel);
  assert.notStrictEqual(relFuel, 'BATTERY', `Related model ${rel.model_name} for MS 261 C-M should not be BATTERY`);
}
console.log('  ✅ Test 5 Passed: Related models strictly enforce drive-type affinity.');

console.log('\n🎉 ALL DRIVE CONTEXT & PARTS SAFETY TESTS PASSED 100% CLEANLY!');
