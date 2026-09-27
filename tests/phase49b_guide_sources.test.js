import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { getStructuredGuide, getAllStructuredGuides } from '../src/content/guides/index.js';
import {
  resolveGuideSource,
  validateProcedureStepsProvenance,
  validateGuideSources,
  validateAllGuides,
  TRUSTED_TECHNICAL_STANDARDS,
  TRUSTED_BRAND_PROTECTION_REGISTRY
} from '../src/guideSourceResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const baseUrl = 'https://www.stihldecoder.nl';

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 49B GUIDE SOURCES & TECHNICAL ATTRIBUTION SUITE');
console.log('===============================================================\n');

// 1. Validate All Guides via Canonical Guide Source Resolver
console.log('▶ Test 1: Canonical source resolution for all guide source declarations...');
const validation = validateAllGuides();
assert.strictEqual(validation.validForProduction, true, `All published guides must pass canonical source resolution: ${validation.publishedErrors.join('; ')}`);
console.log(`  ✅ Test 1 Passed: All declared sources resolve to canonical primary documents (${validation.totalSources} sources validated).`);

// 2. Model Scope Verification (Strictly Scoped Primary Sources)
console.log('\n▶ Test 2: Strict model scope verification...');
const startGuide = getStructuredGuide('stihl-kettingzaag-start-niet');
assert.ok(startGuide, 'start-niet guide must exist');

const src026 = startGuide.sources.find(s => (s.publicationId || s.publication_id) === '0458-133-3021');
assert.ok(src026, '0458-133-3021 must be declared');
assert.strictEqual(src026.modelScope, 'STIHL 026', '0458-133-3021 must be strictly scoped to 026 only');
assert.strictEqual(src026.modelScope.includes('MS 260'), false, '0458-133-3021 must NOT be widened to MS 260');

const resolved026 = resolveGuideSource(src026);
assert.ok(resolved026, 'Must resolve 0458-133-3021');
assert.deepStrictEqual(resolved026.canonicalScope, ['026'], 'Canonical scope must be strictly 026');
console.log('  ✅ Test 2 Passed: Model scopes verified against primary sources; 0458-133-3021 strictly scoped to 026.');

// 3. Rejection of 5 Defective Sources from 49B
console.log('\n▶ Test 3: Prohibition of 5 rejected non-canonical sources from 49B...');
const allGuides = getAllStructuredGuides();
const allContentStr = JSON.stringify(allGuides);

// Defective publication IDs
assert.strictEqual(allContentStr.includes('0458-017-0121'), false, 'Rejected non-canonical ID 0458-017-0121 must NOT appear');
assert.strictEqual(allContentStr.includes('0458-545-0121'), false, 'Rejected non-canonical ID 0458-545-0121 must NOT appear');
// Free text publication IDs
assert.strictEqual(allContentStr.includes('"publicationId":"STIHL Veiligheidsrichtlijn"'), false, 'Free text "STIHL Veiligheidsrichtlijn" as publicationId is strictly forbidden');
assert.strictEqual(allContentStr.includes('"publicationId":"TI Brandstofvoorschriften"'), false, 'Free text "TI Brandstofvoorschriften" as publicationId is strictly forbidden');
// Scope widening
assert.strictEqual(allContentStr.includes('0458-133-3021') && allContentStr.includes('MS 260 / 026'), false, 'Widening 0458-133-3021 to MS 260 is strictly forbidden');

console.log('  ✅ Test 3 Passed: All 5 rejected non-canonical sources and free-text IDs are completely absent.');

// 4. Claim-Level Provenance & Procedural Step SourceRefs
console.log('\n▶ Test 4: Procedure steps claim-level provenance verification...');
const stepErrors = validateProcedureStepsProvenance(startGuide);
assert.strictEqual(stepErrors.length, 0, `All procedural steps must have valid sourceRefs: ${stepErrors.join('; ')}`);

// Verify documented examples have sourceDoc badges and locators
for (const [key, example] of Object.entries(startGuide.startProcedures.documentedExamples)) {
  assert.ok(example.sourceDoc, `Start procedure example ${key} must declare sourceDoc`);
  assert.ok(example.steps.length > 0, `Start procedure example ${key} must have steps`);
  for (const st of example.steps) {
    assert.ok(Array.isArray(st.sourceRefs) && st.sourceRefs.length > 0, `Step ${st.step} in ${key} must have sourceRefs`);
  }
}
for (const [key, example] of Object.entries(startGuide.floodedEngineRecovery.documentedExamples)) {
  assert.ok(example.sourceDoc, `Flooded recovery example ${key} must declare sourceDoc`);
  assert.ok(example.steps.length > 0, `Flooded recovery example ${key} must have steps`);
  for (const st of example.steps) {
    assert.ok(Array.isArray(st.sourceRefs) && st.sourceRefs.length > 0, `Step ${st.step} in ${key} must have sourceRefs`);
  }
}
console.log('  ✅ Test 4 Passed: All start & flooded recovery steps possess valid canonical sourceRefs.');

// 5. Phase 49B-R2 Enforced Test Cases A Through L
console.log('\n▶ Test 5: Phase 49B-R2 Specific Test Cases (A through L)...');

// Case A: Rejection of unregistered document ID
console.log('  Testing Case A: Rejection of unregistered document ID...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-a',
    documentTitle: 'Unregistered Manual',
    publicationId: '9999-999-9999',
    modelScope: 'MS 260'
  });
}, /does not exist in document registry or canonical primary documents/i, 'Case A: Must reject unregistered document ID');
console.log('  ✅ Case A Passed: Unregistered document ID rejected.');

// Case B: Rejection of free-text label as publicationId
console.log('  Testing Case B: Rejection of free-text label as publicationId...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-b',
    documentTitle: 'STIHL Veiligheidsrichtlijn',
    publicationId: 'STIHL Veiligheidsrichtlijn',
    modelScope: 'Universeel'
  });
}, /appears to be free-text description/i, 'Case B: Must reject free text as publicationId');
console.log('  ✅ Case B Passed: Free-text label rejected as publicationId.');

// Case C: Rejection of document with INSUFFICIENT_EXTRACTED_TEXT for operational/published claims
console.log('  Testing Case C: Rejection of INSUFFICIENT_EXTRACTED_TEXT for published operational procedures...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-c',
    canonical_document_id: '1068494421',
    modelScope: ['026'],
    locator: { page: 12, section: 'Settings' }
  }, { isPublishedGuide: true, isOperationalProcedure: true });
}, /INSUFFICIENT_EXTRACTED_TEXT/i, 'Case C: Must reject INSUFFICIENT_EXTRACTED_TEXT in published operational context');
console.log('  ✅ Case C Passed: INSUFFICIENT_EXTRACTED_TEXT rejected for published claims.');

// Case D: Rejection of TECHNICAL_STANDARD with free-text label (must match trusted registry)
console.log('  Testing Case D: Technical standard registry match enforcement...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-d-invalid',
    sourceLabel: 'DIN EN ISO Matrijsdatumconventies',
    sourceClass: 'TECHNICAL_STANDARD',
    modelScope: ['Gegoten onderdelen en behuizingscomponenten'],
    locator: { section: 'Mould dating' }
  });
}, /not registered in trusted technical standards registry/i, 'Case D: Must reject unanchored standard label');

const validStandardRes = resolveGuideSource({
  id: 'src-case-d-valid',
  standard_id: 'ISO 11469',
  sourceClass: 'TECHNICAL_STANDARD',
  modelScope: ['Gegoten onderdelen en behuizingscomponenten'],
  locator: { section: 'Mould dating conventions' }
});
assert.strictEqual(validStandardRes.resolved, true, 'Case D: ISO 11469 must resolve cleanly');
assert.strictEqual(validStandardRes.canonicalSource.authenticity_status, 'AUTHENTICATED_STANDARD');
console.log('  ✅ Case D Passed: Technical standard registry lookup enforced.');

// Case E: Rejection of OFFICIAL_BRAND_PROTECTION with free-text label (must match canonical brand protection record)
console.log('  Testing Case E: Brand protection canonical record match enforcement...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-e-invalid',
    sourceLabel: 'STIHL Brand Protection Richtlijnen',
    sourceClass: 'OFFICIAL_BRAND_PROTECTION',
    modelScope: ['alle-motorgereedschappen'],
    locator: { section: 'Counterfeits' }
  });
}, /not registered in trusted brand protection registry/i, 'Case E: Must reject unanchored brand protection label');

const validBpRes = resolveGuideSource({
  id: 'src-case-e-valid',
  brand_protection_id: 'STIHL-BRAND-PROTECTION-GUIDELINE-V1',
  sourceClass: 'OFFICIAL_BRAND_PROTECTION',
  modelScope: ['alle-motorgereedschappen'],
  locator: { section: 'Counterfeit identification' }
});
assert.strictEqual(validBpRes.resolved, true, 'Case E: STIHL-BRAND-PROTECTION-GUIDELINE-V1 must resolve');
assert.strictEqual(validBpRes.canonicalSource.authenticity_status, 'AUTHENTICATED_OFFICIAL');
console.log('  ✅ Case E Passed: Brand protection canonical record enforced.');

// Case F: Rejection of generic scope bypass on model-specific source
console.log('  Testing Case F: Rejection of generic scope bypass on model-specific source...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-f-1',
    canonical_document_id: '1008738745',
    modelScope: ['universeel'],
    locator: { page: 10, section: 'Settings' }
  });
}, /generic scope "universeel" is not allowed for model-specific source/i, 'Case F: Must reject universeel on model-specific doc');

assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-f-2',
    canonical_document_id: '1008738745',
    modelScope: ['Carburateurmodellen algemeen'],
    locator: { page: 10, section: 'Settings' }
  });
}, /generic scope "Carburateurmodellen algemeen" is not allowed for model-specific source/i, 'Case F: Must reject generic carb scope on model-specific doc');
console.log('  ✅ Case F Passed: Generic scope bypass prohibited.');

// Case G: Rejection of substring model scope match
console.log('  Testing Case G: Rejection of substring model scope matching...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-g-1',
    publication_id: '0458-133-3021', // covers 026
    modelScope: ['MS 260'],
    locator: { page: 38, section: 'Starting' }
  });
}, /Scope mismatch/i, 'Case G: MS 260 must not match 026');

assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-g-2',
    publication_id: '0458-573-8621-D', // covers MS 261, MS 261 C-M
    modelScope: ['MS 26'],
    locator: { page: 34, section: 'Starting' }
  });
}, /Scope mismatch/i, 'Case G: MS 26 must not match MS 261');
console.log('  ✅ Case G Passed: Substring scope matching strictly forbidden.');

// Case H: Rejection of locator with page out of bounds
console.log('  Testing Case H: Locator page bounds validation (out-of-bounds rejection)...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-case-h',
    publication_id: '0458-133-3021', // 48 pages
    modelScope: ['026'],
    locator: { page: 9999, section: 'Starting the Engine' }
  });
}, /exceeds known document page count/i, 'Case H: Must reject page 9999 for 48-page manual');
console.log('  ✅ Case H Passed: Out-of-bounds locator page rejected.');

// Case I: Acceptance of verified locator within bounds
console.log('  Testing Case I: Acceptance of verified locator within bounds...');
const validLocRes = resolveGuideSource({
  id: 'src-case-i',
  publication_id: '0458-133-3021',
  modelScope: ['026'],
  locator: { page: 38, section: 'Starting the Engine' }
});
assert.strictEqual(validLocRes.resolved, true);
assert.strictEqual(validLocRes.locatorStatus, 'LOCATOR_VERIFIED', 'Case I: In-bounds page with section must be LOCATOR_VERIFIED');
console.log('  ✅ Case I Passed: In-bounds locator correctly evaluated as LOCATOR_VERIFIED.');

// Case J: Operational procedure without LOCATOR_VERIFIED fails validation for PUBLISHED guide
console.log('  Testing Case J: Operational procedure without LOCATOR_VERIFIED fails in published guide...');
assert.throws(() => {
  const guideWithUnverifiedLocator = {
    slug: 'test-unverified-locator',
    publicationStatus: 'PUBLISHED',
    sources: [
      {
        id: 'src-no-loc',
        publicationId: '0458-133-3021',
        modelScope: ['026'],
        locator: {}
      }
    ],
    startProcedures: {
      documentedExamples: {
        ex: {
          steps: [{ step: 1, title: 'Step', text: 'Text', sourceRefs: ['src-no-loc'] }]
        }
      }
    }
  };
  const val = validateGuideSources(guideWithUnverifiedLocator);
  if (!val.valid) throw new Error(val.errors.join('; '));
}, /LOCATOR_VERIFIED/i, 'Case J: Must reject unverified locator in published operational step');
console.log('  ✅ Case J Passed: Operational procedure requires LOCATOR_VERIFIED in published guides.');

// Case K: READY_FOR_REVIEW guide with issues reports reviewBlockers without failing validForProduction
console.log('  Testing Case K: Publication-aware validation and reviewBlockers reporting...');
const allValidation = validateAllGuides();
assert.strictEqual(allValidation.validForProduction, true, 'Case K: validForProduction must be true');
assert.strictEqual(allValidation.publishedErrors.length, 0, 'Case K: publishedErrors must be empty');
assert.ok(allValidation.reviewBlockers.length > 0, 'Case K: reviewBlockers must be logged for draft guides');
const carbBlockers = allValidation.reviewBlockers.filter(b => b.slug === 'stihl-carburateur-afstellen');
assert.ok(carbBlockers.length > 0, 'Case K: Carburateur guide must have review blockers');
console.log(`  ✅ Case K Passed: Review blockers cleanly reported (${allValidation.reviewBlockers.length} blockers logged) without blocking production.`);

// Case L: Neutralized top-handle saw starting text in stihl-kettingzaag-start-niet.js
console.log('  Testing Case L: Neutralized top-handle saw starting position in start guide...');
const warning2 = startGuide.warnings.find(w => w.title.includes('Stabiele startpositie'));
assert.ok(warning2, 'Case L: Stable start warning must exist');
assert.ok(warning2.text.includes('tophandle'), 'Case L: Warning must explicitly distinguish tophandle saws');
assert.ok(warning2.text.includes('toegestane stabiele startmethode'), 'Case L: Warning must frame procedure around authorized stable methods');
console.log('  ✅ Case L Passed: Top-handle saw starting instructions properly neutralized.');

// 6. Rendered Guide HTML Provenance & Section Display
console.log('\n▶ Test 6: Rendered guide HTML provenance section & no path leakage...');
const guideHtml = renderGuidePageHtml(startGuide, database, baseUrl);

assert.strictEqual(guideHtml.includes('Bronnen en Beperkingen'), true, 'Must render Bronnen en Beperkingen section');
assert.strictEqual(guideHtml.includes('0458-133-3021'), true, 'Must render canonical 0458-133-3021');
assert.strictEqual(guideHtml.includes('0458-573-8621-D'), true, 'Must render canonical 0458-573-8621-D');
assert.strictEqual(guideHtml.includes('0458-207-8321-B'), true, 'Must render canonical 0458-207-8321-B');

// No leak of local file paths or internal corpora
assert.strictEqual(guideHtml.includes('C:\\'), false, 'Must not expose local Windows paths');
assert.strictEqual(guideHtml.includes('GelliusSnippe'), false, 'Must not expose local usernames');
assert.strictEqual(guideHtml.includes('corpus'), false, 'Must not expose internal corpus terminology');
console.log('  ✅ Test 6 Passed: Official publications and publication IDs cleanly rendered without path leakage.');

// 7. Counterfeit Guide: Non-Binary Result Categories & StopHeling
console.log('\n▶ Test 7: Counterfeit guide non-binary result categories & StopHeling truthfulness...');
const fakeGuide = getStructuredGuide('namaak-stihl-herkennen');
assert.ok(fakeGuide, 'Counterfeit guide structured data must exist');

const categories = fakeGuide.resultCategories.map(c => c.category);
assert.deepStrictEqual(categories, ['NO_OBVIOUS_ISSUE', 'INCONSISTENCY_FOUND', 'MANUAL_REVIEW_RECOMMENDED']);
assert.strictEqual(categories.includes('AUTHENTIC'), false, 'Must not claim binary AUTHENTIC');
assert.strictEqual(categories.includes('FAKE'), false, 'Must not claim binary FAKE');

const warningTexts = fakeGuide.warnings.map(w => `${w.title} ${w.text}`).join(' ') + ' ' + fakeGuide.directAnswer.content;
assert.strictEqual(warningTexts.includes('StopHeling'), true, 'Must mention StopHeling');
assert.strictEqual(
  warningTexts.includes('authenticiteitscontrole') || warningTexts.includes('bewijs van authenticiteit'),
  true,
  'Must clarify StopHeling is theft check only'
);
console.log('  ✅ Test 7 Passed: Counterfeit guide strictly adheres to evidence-based categories and StopHeling truthfulness.');

console.log('\n🎉 ALL PHASE 49B GUIDE SOURCES & ATTRIBUTION TESTS PASSED 100% CLEANLY!');
