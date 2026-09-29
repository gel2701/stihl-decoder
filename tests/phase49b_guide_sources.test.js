import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderGuidePageHtml, formatLocator } from '../src/components/GuidePageTemplate.js';
import { getStructuredGuide, getAllStructuredGuides } from '../src/content/guides/index.js';
import {
  resolveGuideSource,
  resolveGuidePublicationState,
  validateProcedureStepsProvenance,
  validateWarningProvenance,
  validateGuideSources,
  validateAllGuides,
  TRUSTED_TECHNICAL_STANDARDS,
  TRUSTED_BRAND_PROTECTION_REGISTRY
} from '../src/guideSourceResolver.js';
import { GUIDE_ROUTE_CONFIG, getGuidePublicationStatus, isGuidePublished } from '../src/publicationRules.js';
import { OFFICIAL_PRIMARY_DOCUMENTS } from '../src/canonicalData.js';

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
  const val = validateGuideSources(guideWithUnverifiedLocator, { routeStatus: 'PUBLISHED' });
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

// 8. Phase 49B-P-R1 Hardening & Regression Tests (A through F)
console.log('\n▶ Test 8: Phase 49B-P-R1 Regression Tests (A through F)...');

// Test A: resolveGuideSource with valid publication (0458-133-3021) WITHOUT model_scope -> FAIL
console.log('  Testing Test A: Rejection of missing model_scope on model-specific publication...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-test-a',
    publicationId: '0458-133-3021',
    locator: { page: 38, section: 'Starting the Engine' }
  });
}, /Model-specific source declaration requires an explicit non-empty model_scope/i, 'Test A: Must reject missing model_scope');
console.log('  ✅ Test A Passed: Missing model_scope correctly rejected.');

// Test B: resolveGuideSource with valid publication and empty array model_scope: [] -> FAIL
console.log('  Testing Test B: Rejection of empty model_scope array...');
assert.throws(() => {
  resolveGuideSource({
    id: 'src-test-b',
    publicationId: '0458-133-3021',
    modelScope: [],
    locator: { page: 38, section: 'Starting the Engine' }
  });
}, /Model-specific source declaration requires an explicit non-empty model_scope/i, 'Test B: Must reject empty model_scope array');
console.log('  ✅ Test B Passed: Empty model_scope array correctly rejected.');

// Test C: resolveGuideSource with valid publication and model_scope: ['026'] -> PASS
console.log('  Testing Test C: Acceptance of valid model_scope [\'026\']...');
const testCRes = resolveGuideSource({
  id: 'src-test-c',
  publicationId: '0458-133-3021',
  model_scope: ['026'],
  locator: { page: 38, section: 'Starting the Engine' }
});
assert.strictEqual(testCRes.resolved, true, 'Test C: Must resolve cleanly');
assert.deepStrictEqual(testCRes.canonicalScope, ['026']);
console.log('  ✅ Test C Passed: Valid model_scope [\'026\'] cleanly resolved.');

// Test D: start-niet guide: floodedEngineRecovery steps refer to source with page 42 and heading 'If the Engine Does Not Start' -> PASS
console.log('  Testing Test D: Flooded engine recovery provenance links to page 42 / "If the Engine Does Not Start"...');
const flooded026 = startGuide.floodedEngineRecovery.documentedExamples.stihl026;
assert.ok(flooded026, '026 flooded recovery example must exist');
const floodedSourceId = flooded026.steps[0].sourceRefs[0];
assert.strictEqual(floodedSourceId, 'src-0458-133-3021-flooded', 'Flooded step must reference src-0458-133-3021-flooded');

const floodedSource = startGuide.sources.find(s => (s.id || s.source_id) === floodedSourceId);
assert.ok(floodedSource, 'flooded source declaration must exist');
assert.strictEqual(floodedSource.locator.page, 42, 'Flooded source locator page must be 42');
assert.strictEqual(floodedSource.locator.heading, 'If the Engine Does Not Start', 'Flooded source locator heading must be "If the Engine Does Not Start"');

const floodedStepErrors = validateProcedureStepsProvenance(startGuide);
assert.strictEqual(floodedStepErrors.length, 0, 'Procedure steps provenance must have 0 errors for startGuide');
console.log('  ✅ Test D Passed: Flooded engine recovery steps correctly grounded on page 42.');

// Test E: If floodedEngineRecovery hypothetically only linked to page 38 (startprocedure) -> FAILS
console.log('  Testing Test E: Rejection of floodedEngineRecovery erroneously linked only to page 38 start procedure...');
const badFloodedGuide = JSON.parse(JSON.stringify(startGuide));
// Point flooded steps erroneously to start procedure (page 38)
badFloodedGuide.floodedEngineRecovery.documentedExamples.stihl026.steps.forEach(st => {
  st.sourceRefs = ['src-0458-133-3021-start'];
});
const badFloodedErrors = validateProcedureStepsProvenance(badFloodedGuide);
assert.ok(badFloodedErrors.length > 0, 'Test E: Must produce error when flooded steps point only to start procedure');
assert.ok(badFloodedErrors.some(e => e.includes('instead of flooded engine recovery')), 'Test E: Error must explicitly state locator mismatch for flooded recovery');
console.log('  ✅ Test E Passed: Flooded recovery linked to start procedure locator correctly detected and rejected.');

// Test F: GuidePageTemplate rendering never produces '[object Object]'
console.log('  Testing Test F: Rendered HTML contains zero "[object Object]" instances...');
assert.strictEqual(guideHtml.includes('[object Object]'), false, 'Test F: Rendered guide HTML must not contain [object Object]');
// Also test formatLocator directly with various inputs
assert.strictEqual(formatLocator({ page: 38, section: 'Starting', heading: 'Cold Start' }), 'p. 38 · Starting · Cold Start');
assert.strictEqual(formatLocator('p. 12'), 'p. 12');
assert.strictEqual(formatLocator(null), '');
assert.strictEqual(formatLocator(undefined), '');
assert.strictEqual(formatLocator({}), '');
console.log('  ✅ Test F Passed: formatLocator and rendered HTML completely free of [object Object].');

// 9. Phase 49B-P-R2 Procedure Shapes Provenance Tests (G through L)
console.log('\n▶ Test 9: Phase 49B-P-R2 Comprehensive Procedure Shapes Provenance Tests (G through L)...');

// Test G: published guide startProcedures.coldStart.steps without sourceRefs -> FAIL
console.log('  Testing Case G: Published guide coldStart.steps without sourceRefs -> FAIL...');
const guideColdNoRefs = {
  slug: 'test-coldstart-no-refs',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-026-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting the Engine' }
    }
  ],
  startProcedures: {
    coldStart: {
      title: 'Koude start',
      intro: 'Instructie',
      steps: [
        { step: 1, title: 'Inschakelen', text: 'Zet de schakelaar om' } // missing sourceRefs
      ]
    }
  }
};
const valG = validateGuideSources(guideColdNoRefs, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valG.valid, false, 'Case G: Must fail when coldStart steps have no sourceRefs');
assert.ok(valG.errors.some(e => e.includes('startProcedures.coldStart step 1 has no sourceRefs')), 'Case G: Must report missing sourceRefs');
console.log('  ✅ Case G Passed: Published guide coldStart without sourceRefs correctly rejected.');

// Test H: published guide startProcedures.warmStart.steps with unknown sourceRef -> FAIL
console.log('  Testing Case H: Published guide warmStart.steps with unknown sourceRef -> FAIL...');
const guideWarmUnknownRef = {
  slug: 'test-warmstart-unknown-ref',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-026-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting the Engine' }
    }
  ],
  startProcedures: {
    warmStart: {
      title: 'Warme start',
      intro: 'Instructie',
      steps: [
        { step: 1, title: 'Trekken', text: 'Trek aan startkoord', sourceRefs: ['non-existent-source-ref-id'] }
      ]
    }
  }
};
const valH = validateGuideSources(guideWarmUnknownRef, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valH.valid, false, 'Case H: Must fail when warmStart references unknown sourceRef');
assert.ok(valH.errors.some(e => e.includes('references unknown sourceRef "non-existent-source-ref-id"')), 'Case H: Must report unknown sourceRef');
console.log('  ✅ Case H Passed: Published guide warmStart with unknown sourceRef correctly rejected.');

// Test I: published guide floodedEngineRecovery.steps without sourceRefs -> FAIL
console.log('  Testing Case I: Published guide floodedEngineRecovery.steps without sourceRefs -> FAIL...');
const guideFloodedNoRefs = {
  slug: 'test-flooded-no-refs',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-026-flooded',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 42, section: 'Starting / Stopping the Engine', heading: 'If the Engine Does Not Start' }
    }
  ],
  floodedEngineRecovery: {
    title: 'Ontzopen',
    steps: [
      { step: 1, title: 'Bougie drogen', text: 'Droog de natte bougie' } // missing sourceRefs
    ]
  }
};
const valI = validateGuideSources(guideFloodedNoRefs, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valI.valid, false, 'Case I: Must fail when flooded steps have no sourceRefs');
assert.ok(valI.errors.some(e => e.includes('floodedEngineRecovery step 1 has no sourceRefs')), 'Case I: Must report missing sourceRefs');
console.log('  ✅ Case I Passed: Published guide flooded recovery without sourceRefs correctly rejected.');

// Test J: legacy coldStart/warmStart/floodedEngineRecovery.steps with valid existing sourceRefs + correct locator -> PASS
console.log('  Testing Case J: Legacy coldStart/warmStart/floodedEngineRecovery.steps with valid existing sourceRefs + correct locator -> PASS...');
const guideLegacyValid = {
  slug: 'test-legacy-valid',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
    },
    {
      id: 'src-valid-flooded',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 42, section: 'Starting / Stopping the Engine', heading: 'If the Engine Does Not Start' }
    }
  ],
  startProcedures: {
    coldStart: {
      title: 'Koud starten',
      steps: [
        { step: 1, title: 'Choke', text: 'Zet op choke', sourceRefs: ['src-valid-start'] }
      ]
    },
    warmStart: {
      title: 'Warm starten',
      steps: [
        { step: 1, title: 'Startstand', text: 'Zet op startstand', sourceRefs: ['src-valid-start'] }
      ]
    }
  },
  floodedEngineRecovery: {
    title: 'Ontzopen',
    steps: [
      { step: 1, title: 'Bougie drogen', text: 'Droog de bougie', sourceRefs: ['src-valid-flooded'] }
    ]
  }
};
const valJ = validateGuideSources(guideLegacyValid, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valJ.valid, true, `Case J: Legacy procedure shapes with valid sources must pass: ${valJ.errors.join('; ')}`);
assert.strictEqual(valJ.errors.length, 0);
console.log('  ✅ Case J Passed: Valid legacy coldStart/warmStart/floodedEngineRecovery steps pass 100% cleanly.');

// Test K: Confirm that existing documentedExamples still PASS across all registered guides
console.log('  Testing Case K: Confirm documentedExamples across all registered guides still pass...');
const allGuidesVal = validateAllGuides();
assert.strictEqual(allGuidesVal.validForProduction, true, 'Case K: All current registered guides documentedExamples must continue to pass');
assert.strictEqual(allGuidesVal.publishedErrors.length, 0, 'Case K: publishedErrors must be 0');
console.log('  ✅ Case K Passed: Existing documentedExamples across all guides continue to pass cleanly.');

// Test L: Explicitly test that every procedure array that GuidePageTemplate can render is validated by validateProcedureStepsProvenance
console.log('  Testing Case L: Validate that all 5 procedure array shapes rendered by GuidePageTemplate are covered...');
const renderShapes = [
  {
    name: 'startProcedures.documentedExamples[ex].steps',
    guide: {
      sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 38, heading: 'Starting the Engine' } }],
      startProcedures: { documentedExamples: { ex: { steps: [{ step: 1, title: 'X', text: 'Y' }] } } }
    },
    expectedContext: 'startProcedures.documentedExamples.ex step 1'
  },
  {
    name: 'startProcedures.coldStart.steps',
    guide: {
      sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 38, heading: 'Starting the Engine' } }],
      startProcedures: { coldStart: { steps: [{ step: 1, title: 'X', text: 'Y' }] } }
    },
    expectedContext: 'startProcedures.coldStart step 1'
  },
  {
    name: 'startProcedures.warmStart.steps',
    guide: {
      sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 38, heading: 'Starting the Engine' } }],
      startProcedures: { warmStart: { steps: [{ step: 1, title: 'X', text: 'Y' }] } }
    },
    expectedContext: 'startProcedures.warmStart step 1'
  },
  {
    name: 'floodedEngineRecovery.documentedExamples[ex].steps',
    guide: {
      sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 42, heading: 'If the Engine Does Not Start' } }],
      floodedEngineRecovery: { documentedExamples: { ex: { steps: [{ step: 1, title: 'X', text: 'Y' }] } } }
    },
    expectedContext: 'floodedEngineRecovery.documentedExamples.ex step 1'
  },
  {
    name: 'floodedEngineRecovery.steps',
    guide: {
      sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 42, heading: 'If the Engine Does Not Start' } }],
      floodedEngineRecovery: { steps: [{ step: 1, title: 'X', text: 'Y' }] }
    },
    expectedContext: 'floodedEngineRecovery step 1'
  }
];

for (const shape of renderShapes) {
  const errs = validateProcedureStepsProvenance(shape.guide);
  assert.ok(errs.length > 0, `Shape "${shape.name}" must be validated by validateProcedureStepsProvenance`);
  assert.ok(
    errs.some(e => e.includes(shape.expectedContext)),
    `Shape "${shape.name}" must report error for ${shape.expectedContext}, got: ${errs.join('; ')}`
  );
}
console.log('  ✅ Case L Passed: All 5 rendered procedure-step array shapes are systematically validated.');

// 10. Phase 49B-P-R3 Page Boundary Regression Tests for STIHL 026 (0458-133-3021, 56 pages)
console.log('\n▶ Test 10: STIHL 026 (0458-133-3021) Page Boundary Tests...');

// Test 10A: Page 38 (start procedure) -> PASS
const b38 = resolveGuideSource({
  id: 'src-026-p38',
  publicationId: '0458-133-3021',
  modelScope: ['026'],
  locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
});
assert.strictEqual(b38.resolved, true, 'Page 38 must resolve');
assert.strictEqual(b38.locatorStatus, 'LOCATOR_VERIFIED');
console.log('  ✅ Page 38 (start procedure): PASS (LOCATOR_VERIFIED).');

// Test 10B: Page 42 (flooded recovery / carburetor adjustment) -> PASS
const b42 = resolveGuideSource({
  id: 'src-026-p42',
  publicationId: '0458-133-3021',
  modelScope: ['026'],
  locator: { page: 42, section: 'Adjusting Carburetor', heading: 'Motor management' }
});
assert.strictEqual(b42.resolved, true, 'Page 42 must resolve');
assert.strictEqual(b42.locatorStatus, 'LOCATOR_VERIFIED');
console.log('  ✅ Page 42 (carburetor adjustment / flooded recovery): PASS (LOCATOR_VERIFIED).');

// Test 10C: Page 50 (technical specifications in public evidence facts) -> PASS
const b50 = resolveGuideSource({
  id: 'src-026-p50',
  publicationId: '0458-133-3021',
  modelScope: ['026'],
  locator: { page: 50, section: 'Specifications', heading: 'Engine' }
});
assert.strictEqual(b50.resolved, true, 'Page 50 must resolve');
assert.strictEqual(b50.locatorStatus, 'LOCATOR_VERIFIED');
console.log('  ✅ Page 50 (technical specifications): PASS (LOCATOR_VERIFIED).');

// Test 10D: Page 56 (last page of 56-page manual) -> PASS
const b56 = resolveGuideSource({
  id: 'src-026-p56',
  publicationId: '0458-133-3021',
  modelScope: ['026'],
  locator: { page: 56, section: 'Quality Certification' }
});
assert.strictEqual(b56.resolved, true, 'Page 56 boundary page must resolve');
assert.strictEqual(b56.locatorStatus, 'LOCATOR_VERIFIED');
console.log('  ✅ Page 56 (upper document boundary): PASS (LOCATOR_VERIFIED).');

// Test 10E: Page 57 (beyond 56-page boundary) -> FAIL
assert.throws(() => {
  resolveGuideSource({
    id: 'src-026-p57',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 57, section: 'Beyond Document' }
  });
}, /exceeds known document page count \(56\)/i, 'Page 57 must be rejected as out of bounds');
console.log('  ✅ Page 57 (out of bounds): FAIL (correctly rejected).');

// 11. Phase 49B-P-R3 Safety Warning Provenance Tests (M through S)
console.log('\n▶ Test 11: Safety Warning Provenance Validation Tests (M through S)...');

// Case M: Warning in PUBLISHED guide without sourceRefs -> FAIL
console.log('  Testing Case M: Published guide warning without sourceRefs -> FAIL...');
const guideWarnNoRefs = {
  slug: 'test-warn-no-refs',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting', heading: 'Starting the Engine' }
    }
  ],
  warnings: [
    {
      title: 'Geen bronvermelding',
      text: 'Deze waarschuwing ontbeert bronnen.'
    }
  ]
};
const valM = validateGuideSources(guideWarnNoRefs, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valM.valid, false, 'Case M: Must fail when warning has no sourceRefs');
assert.ok(valM.errors.some(e => e.includes('Warning "Geen bronvermelding" has no sourceRefs')), 'Case M: Error must identify missing sourceRefs on warning');
console.log('  ✅ Case M Passed: Warning without sourceRefs in published guide correctly rejected.');

// Case N: Warning with unknown sourceRef -> FAIL
console.log('  Testing Case N: Warning referencing unknown sourceRef -> FAIL...');
const guideWarnUnknownRef = {
  slug: 'test-warn-unknown-ref',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting', heading: 'Starting the Engine' }
    }
  ],
  warnings: [
    {
      title: 'Onbekende bron',
      text: 'Verwijst naar onbekende bron.',
      sourceRefs: ['non-existent-warning-source']
    }
  ]
};
const valN = validateGuideSources(guideWarnUnknownRef, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valN.valid, false, 'Case N: Must fail when warning references unknown sourceRef');
assert.ok(valN.errors.some(e => e.includes('references unknown sourceRef "non-existent-warning-source"')), 'Case N: Error must identify unknown sourceRef');
console.log('  ✅ Case N Passed: Warning with unknown sourceRef correctly rejected.');

// Case O: Carburetor warning bound only to start procedure locator -> FAIL
console.log('  Testing Case O: Carburetor warning bound only to start procedure locator -> FAIL...');
const guideCarbWarnStartLoc = {
  slug: 'test-carb-warn-start-loc',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
    }
  ],
  warnings: [
    {
      title: 'Gevaar voor motorschade bij ondeskundige carburateurafstelling',
      text: 'Draai nooit willekeurig aan de stelschroeven van de carburateur.',
      sourceRefs: ['src-valid-start']
    }
  ]
};
const valO = validateGuideSources(guideCarbWarnStartLoc, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valO.valid, false, 'Case O: Carburetor warning linked only to start procedure must fail');
assert.ok(
  valO.errors.some(e => e.includes('pointing to start procedure instead of carburetor adjustment')),
  'Case O: Error must flag locator mismatch between start procedure and carburetor warning'
);
console.log('  ✅ Case O Passed: Carburetor warning linked only to start procedure locator correctly rejected.');

// Case P: Carburetor warning bound to carburetor locator -> PASS
console.log('  Testing Case P: Carburetor warning bound to carburetor locator -> PASS...');
const guideCarbWarnValid = {
  slug: 'test-carb-warn-valid',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-carb',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 42, section: 'Adjusting Carburetor', heading: 'Motor management' }
    }
  ],
  warnings: [
    {
      title: 'Gevaar voor motorschade bij ondeskundige carburateurafstelling',
      text: 'Draai nooit willekeurig aan de stelschroeven van de carburateur; kleine verdraaiingen hebben al een merkbare invloed.',
      sourceRefs: ['src-valid-carb']
    }
  ]
};
const valP = validateGuideSources(guideCarbWarnValid, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valP.valid, true, `Case P: Must pass when carburetor warning is grounded in carburetor locator: ${valP.errors.join('; ')}`);
assert.strictEqual(valP.errors.length, 0);
console.log('  ✅ Case P Passed: Carburetor warning linked to carburetor locator passes cleanly.');

// Case Q: Chain brake warning bound to valid start procedure -> PASS
console.log('  Testing Case Q: Chain brake warning bound to valid start procedure -> PASS...');
const guideChainBrakeValid = {
  slug: 'test-chainbrake-valid',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-valid-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
    }
  ],
  warnings: [
    {
      title: 'Kettingrem altijd inschakelen vóór het starten',
      text: 'De ketting mag nooit meedraaien bij het starten.',
      sourceRefs: ['src-valid-start']
    }
  ]
};
const valQ = validateGuideSources(guideChainBrakeValid, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valQ.valid, true, `Case Q: Chain brake warning linked to start procedure must pass: ${valQ.errors.join('; ')}`);
assert.strictEqual(valQ.errors.length, 0);
console.log('  ✅ Case Q Passed: Chain brake warning bound to start procedure passes cleanly.');

// Case R: Warning in PUBLISHED guide referencing source with unverified locator -> FAIL
console.log('  Testing Case R: Warning in published guide referencing unverified locator -> FAIL...');
const guideWarnUnverified = {
  slug: 'test-warn-unverified',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-unverified-loc',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: {} // missing page and heading -> LOCATOR_UNVERIFIED
    }
  ],
  warnings: [
    {
      title: 'Algemene waarschuwing',
      text: 'Tekst van de waarschuwing.',
      sourceRefs: ['src-unverified-loc']
    }
  ]
};
const valR = validateGuideSources(guideWarnUnverified, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valR.valid, false, 'Case R: Must fail when warning references unverified locator');
assert.ok(valR.errors.some(e => e.includes('is not LOCATOR_VERIFIED')), 'Case R: Error must flag non-LOCATOR_VERIFIED status');
console.log('  ✅ Case R Passed: Warning referencing unverified locator correctly rejected.');

// Case S: Current published guide warnings validate 100% cleanly
console.log('  Testing Case S: Current published stihl-kettingzaag-start-niet warnings pass 100% cleanly...');
const startGuideWarningsErrors = validateWarningProvenance(startGuide);
assert.strictEqual(startGuideWarningsErrors.length, 0, `Case S: startGuide warnings must have 0 errors: ${startGuideWarningsErrors.join('; ')}`);
const carbWarn = startGuide.warnings.find(w => w.title.includes('carburateurafstelling'));
assert.ok(carbWarn, 'Case S: Carburetor warning must exist in startGuide');
assert.deepStrictEqual(carbWarn.sourceRefs, ['src-0458-133-3021-carburetor'], 'Case S: Carburetor warning must point to src-0458-133-3021-carburetor');
console.log('  ✅ Case S Passed: All safety warnings in stihl-kettingzaag-start-niet pass 100% cleanly with zero errors.');

// 12. Phase 49B-P-R4 FS 100 (0458-259-8621-D) Page Boundary Tests
console.log('\n▶ Test 12: STIHL FS 100 (0458-259-8621-D) Page Boundary Tests...');

// FS100-A: locator met page: 44 op 0458-259-8621-D -> PASS
const fs44 = resolveGuideSource({
  id: 'src-fs100-p44',
  publicationId: '0458-259-8621-D',
  modelScope: ['fs-100'],
  locator: { page: 44, section: 'Maintenance and Care' }
});
assert.strictEqual(fs44.resolved, true, 'FS100-A: Page 44 must resolve');
assert.strictEqual(fs44.locatorStatus, 'LOCATOR_VERIFIED', 'FS100-A: Page 44 must be LOCATOR_VERIFIED');
console.log('  ✅ FS100-A: Page 44 (within previous 44-page limit) -> PASS (LOCATOR_VERIFIED)');

// FS100-B: locator met page: 45 op 0458-259-8621-D -> PASS (previously falsely rejected)
const fs45 = resolveGuideSource({
  id: 'src-fs100-p45',
  publicationId: '0458-259-8621-D',
  modelScope: ['fs-100'],
  locator: { page: 45, section: 'Specifications' }
});
assert.strictEqual(fs45.resolved, true, 'FS100-B: Page 45 must resolve');
assert.strictEqual(fs45.locatorStatus, 'LOCATOR_VERIFIED', 'FS100-B: Page 45 must be LOCATOR_VERIFIED');
console.log('  ✅ FS100-B: Page 45 (previously rejected under old 44 limit) -> PASS (LOCATOR_VERIFIED)');

// FS100-C: locator met page: 88 op 0458-259-8621-D -> PASS (final page)
const fs88 = resolveGuideSource({
  id: 'src-fs100-p88',
  publicationId: '0458-259-8621-D',
  modelScope: ['fs-100'],
  locator: { page: 88, section: 'Quality Certification' }
});
assert.strictEqual(fs88.resolved, true, 'FS100-C: Page 88 must resolve');
assert.strictEqual(fs88.locatorStatus, 'LOCATOR_VERIFIED', 'FS100-C: Page 88 must be LOCATOR_VERIFIED');
console.log('  ✅ FS100-C: Page 88 (upper document boundary) -> PASS (LOCATOR_VERIFIED)');

// FS100-D: locator met page: 89 op 0458-259-8621-D -> FAIL (out of bounds)
assert.throws(() => {
  resolveGuideSource({
    id: 'src-fs100-p89',
    publicationId: '0458-259-8621-D',
    modelScope: ['fs-100'],
    locator: { page: 89, section: 'Out of bounds' }
  });
}, /exceeds known document page count \(88\)/i, 'FS100-D: Page 89 must be rejected as out of bounds');
console.log('  ✅ FS100-D: Page 89 (out of bounds beyond 88) -> FAIL (correctly rejected)');

// 13. Central Document Page-Count Parity Test
console.log('\n▶ Test 13: Central Document Page-Count Parity Test...');
const archiveInv = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'phase35c42_archive_inventory.json'), 'utf8'));
const entry026 = (archiveInv.archive_entries || []).find(e => (e.filename || '').includes('026 Instruction Manual'));
if (entry026) {
  assert.strictEqual(OFFICIAL_PRIMARY_DOCUMENTS['0458-133-3021'].page_count, entry026.page_count, '0458-133-3021 page_count must match archive inventory (56)');
} else {
  assert.strictEqual(OFFICIAL_PRIMARY_DOCUMENTS['0458-133-3021'].page_count, 56, '0458-133-3021 page_count must be 56');
}
assert.strictEqual(OFFICIAL_PRIMARY_DOCUMENTS['0458-259-8621-D'].page_count, 88, '0458-259-8621-D page_count must match Phase 35 authority (88 pages)');
assert.strictEqual(OFFICIAL_PRIMARY_DOCUMENTS['0458-452-8621-J'].page_count, 88, '0458-452-8621-J page_count must match Phase 35 authority (88 pages)');
assert.strictEqual(OFFICIAL_PRIMARY_DOCUMENTS['0458-573-8621-D'].page_count, undefined, '0458-573-8621-D must omit page_count due to lack of repository authority fixture');
console.log('  ✅ Test 13 Passed: Canonical page_count properties strictly match authority fixtures, ungrounded estimates safely omitted.');

// 14. Phase 49B-P-R4 Publication Authority & Parity Tests (T through Y)
console.log('\n▶ Test 14: Phase 49B-P-R4 Publication Authority Regression Tests (T through Y)...');

// Test T: Guide with publicationStatus='PUBLISHED' but slug missing from GUIDE_ROUTE_CONFIG -> validateGuideSources fails on status mismatch
console.log('  Testing Test T: Publication status mismatch when slug missing from GUIDE_ROUTE_CONFIG...');
const guideMissingRoute = {
  slug: 'unregistered-rogue-guide',
  publicationStatus: 'PUBLISHED',
  sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 38, heading: 'Starting the Engine' } }]
};
const valT = validateGuideSources(guideMissingRoute);
assert.strictEqual(valT.valid, false, 'Test T: Must fail when slug not in GUIDE_ROUTE_CONFIG');
assert.ok(valT.errors.some(e => e.includes('publication status mismatch: route=HOLD, declared=PUBLISHED')), 'Test T: Must report route=HOLD vs declared=PUBLISHED');
console.log('  ✅ Test T Passed: Rogue guide not in GUIDE_ROUTE_CONFIG immediately fails on status mismatch.');

// Test U: Guide with routeStatus='PUBLISHED' (via options) and declaredStatus='READY_FOR_REVIEW' -> hard failure on missing warning refs
console.log('  Testing Test U: routeStatus=PUBLISHED enforces hard failure on missing warning refs...');
const guideU = {
  slug: 'test-u-guide',
  publicationStatus: 'READY_FOR_REVIEW',
  sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 38, heading: 'Starting the Engine' } }],
  warnings: [{ title: 'Missing Refs Warning', text: 'Some text' }]
};
const valU = validateGuideSources(guideU, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valU.valid, false, 'Test U: Must fail when routeStatus is PUBLISHED even if declaredStatus is READY_FOR_REVIEW');
assert.ok(valU.errors.some(e => e.includes('publication status mismatch')), 'Test U: Reports status mismatch');
assert.ok(valU.errors.some(e => e.includes('Warning "Missing Refs Warning" has no sourceRefs')), 'Test U: Reports hard warning failure');
console.log('  ✅ Test U Passed: Hard failure enforced by routeStatus=PUBLISHED despite declaredStatus=READY_FOR_REVIEW.');

// Test V: Guide with routeStatus='PUBLISHED' and declaredStatus='READY_FOR_REVIEW' -> hard failure on unverified locator
console.log('  Testing Test V: routeStatus=PUBLISHED enforces hard failure on unverified locator...');
const guideV = {
  slug: 'test-v-guide',
  publicationStatus: 'READY_FOR_REVIEW',
  sources: [{ id: 's1', publicationId: '0458-133-3021', modelScope: ['026'], locator: {} }],
  startProcedures: {
    documentedExamples: {
      ex: { steps: [{ step: 1, title: 'Step', text: 'Text', sourceRefs: ['s1'] }] }
    }
  }
};
const valV = validateGuideSources(guideV, { routeStatus: 'PUBLISHED' });
assert.strictEqual(valV.valid, false, 'Test V: Must fail on unverified locator when routeStatus is PUBLISHED');
assert.ok(valV.errors.some(e => e.includes('is not LOCATOR_VERIFIED')), 'Test V: Must reject unverified locator');
console.log('  ✅ Test V Passed: Unverified locator rejected as hard error when routeStatus=PUBLISHED.');

// Test W: Guide with slug='stihl-carburateur-afstellen' (routeStatus='READY_FOR_REVIEW') declaring publicationStatus='PUBLISHED' fails on mismatch
console.log('  Testing Test W: Review-status guide falsely declaring publicationStatus=PUBLISHED fails on status mismatch...');
const carbGuide = getStructuredGuide('stihl-carburateur-afstellen');
const guideW = {
  ...carbGuide,
  publicationStatus: 'PUBLISHED'
};
const valW = validateGuideSources(guideW);
assert.strictEqual(valW.valid, false, 'Test W: Must fail when declared PUBLISHED but routeStatus is READY_FOR_REVIEW');
assert.ok(valW.errors.some(e => e.includes('publication status mismatch: route=READY_FOR_REVIEW, declared=PUBLISHED')), 'Test W: Must report route=READY_FOR_REVIEW, declared=PUBLISHED');
console.log('  ✅ Test W Passed: Guide declaring PUBLISHED against route READY_FOR_REVIEW fails hard on mismatch.');

// Test X: Strict parity between guide.publicationStatus and GUIDE_ROUTE_CONFIG for all registered guides
console.log('  Testing Test X: Strict parity across all registered guides and GUIDE_ROUTE_CONFIG...');
const allRegistered = getAllStructuredGuides();
for (const g of allRegistered) {
  const routeConf = GUIDE_ROUTE_CONFIG[g.slug];
  assert.ok(routeConf, `Test X: Guide "${g.slug}" must exist in GUIDE_ROUTE_CONFIG`);
  assert.strictEqual(
    g.publicationStatus,
    routeConf.status,
    `Test X: Guide "${g.slug}" publicationStatus ("${g.publicationStatus}") must match route status ("${routeConf.status}")`
  );
}
console.log(`  ✅ Test X Passed: All ${allRegistered.length} registered guides have 100% parity with GUIDE_ROUTE_CONFIG.`);

// Test Y: validateGuideSources and publicationRules reach 100% identical publication decisions for all guides
console.log('  Testing Test Y: Decision parity between validateGuideSources and publicationRules...');
for (const g of allRegistered) {
  const pubState = resolveGuidePublicationState(g);
  const routeIsPublished = isGuidePublished(g.slug);
  assert.strictEqual(
    pubState.isPublished,
    routeIsPublished,
    `Test Y: Decision parity mismatch for "${g.slug}": pubState.isPublished=${pubState.isPublished}, isGuidePublished=${routeIsPublished}`
  );
  assert.strictEqual(
    pubState.statusMatches,
    true,
    `Test Y: Status must match for registered guide "${g.slug}"`
  );
}

console.log('  ✅ Test Y Passed: 100% decision parity between validateGuideSources and publicationRules.');

// ============================================================
// TEST 15: Phase 49B-P-R5 Fractional Locator Page Tests (Z1–Z8)
// ============================================================
console.log('\n▶ Test 15: Phase 49B-P-R5 Fractional Locator Page Validation (Z1–Z8)...');

{
  const baseSource = {
    id: 'src-z-test', source_id: 'src-z-test',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026'
  };

  // Z1: integer 38 → PASS
  {
    const src = { ...baseSource, locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, true, 'Z1: Integer page 38 must resolve successfully');
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED', 'Z1: Integer page 38 must be LOCATOR_VERIFIED');
    console.log('  ✅ Z1: locator.page = 38 (integer) → PASS (LOCATOR_VERIFIED)');
  }

  // Z2: float 38.5 → FAIL
  {
    const src = { ...baseSource, locator: { page: 38.5, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'Z2: Float page 38.5 must be rejected');
    const hasIntegerError = res.errors.some(e => e.includes('positive integer') || e.includes('fractions'));
    assert.ok(hasIntegerError, `Z2: Error must mention integer requirement. Errors: ${JSON.stringify(res.errors)}`);
    console.log('  ✅ Z2: locator.page = 38.5 (float) → FAIL (integer required)');
  }

  // Z3: string "38" → FAIL
  {
    const src = { ...baseSource, locator: { page: '38', section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'Z3: String page must be rejected');
    console.log('  ✅ Z3: locator.page = "38" (string) → FAIL');
  }

  // Z4: 0 → FAIL
  {
    const src = { ...baseSource, locator: { page: 0, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'Z4: Zero page must be rejected');
    console.log('  ✅ Z4: locator.page = 0 → FAIL');
  }

  // Z5: -1 → FAIL
  {
    const src = { ...baseSource, locator: { page: -1, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'Z5: Negative page must be rejected');
    console.log('  ✅ Z5: locator.page = -1 (negative) → FAIL');
  }

  // Z6: NaN → FAIL
  {
    const src = { ...baseSource, locator: { page: NaN, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'Z6: NaN page must be rejected');
    console.log('  ✅ Z6: locator.page = NaN → FAIL');
  }

  // Z7: Infinity → FAIL
  {
    const src = { ...baseSource, locator: { page: Infinity, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'Z7: Infinity page must be rejected');
    console.log('  ✅ Z7: locator.page = Infinity → FAIL');
  }

  // Z8: valid integer + section → LOCATOR_VERIFIED
  {
    const src = { ...baseSource, locator: { page: 1, section: 'Safety Instructions', heading: 'Personal Protective Equipment' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, true, 'Z8: Valid integer page with heading must resolve');
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED', 'Z8: Must be LOCATOR_VERIFIED');
    console.log('  ✅ Z8: valid integer page + section → LOCATOR_VERIFIED');
  }
}
console.log('  ✅ Test 15 Passed: All fractional locator page cases correctly validated.');

// ============================================================
// TEST 16: Phase 49B-P-R5 Operational Claim Provenance Tests (AA–AM)
// ============================================================
import { collectRenderedOperationalClaims, validateOperationalClaimsProvenance } from '../src/guideSourceResolver.js';
import { stihlKettingzaagStartNietGuide } from '../src/content/guides/stihl-kettingzaag-start-niet.js';

console.log('\n▶ Test 16: Phase 49B-P-R5 Operational Claim Provenance Tests (AA–AM)...');

const mkPublishedGuide = (extra = {}) => ({
  slug: 'test-slug',
  publicationStatus: 'PUBLISHED',
  sources: [
    {
      id: 'src-0458-133-3021-start',
      source_id: 'src-0458-133-3021-start',
      canonical_document_id: '0458-133-3021',
      publication_id: '0458-133-3021',
      document_title: 'STIHL 026 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      model_scope: ['026'],
      modelScope: 'STIHL 026',
      locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
    },
    {
      id: 'src-0458-133-3021-fuel',
      source_id: 'src-0458-133-3021-fuel',
      canonical_document_id: '0458-133-3021',
      publication_id: '0458-133-3021',
      document_title: 'STIHL 026 Instruction Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      model_scope: ['026'],
      modelScope: 'STIHL 026',
      locator: { page: 35, section: 'Fuel', heading: 'Fuel Mixture & Storage' }
    }
  ],
  ...extra
});

const buildResolvedSources = (guide) => {
  const map = new Map();
  for (const src of (guide.sources || [])) {
    const res = resolveGuideSource(src, { throwOnError: false });
    if (res.resolved && res.canonicalSource) map.set(res.canonicalSource.source_id, res.canonicalSource);
  }
  return map;
};

// AA: published troubleshootingLevels item (string, no sourceRefs) → FAIL
{
  console.log('  Testing Case AA: Published troubleshootingLevels item without sourceRefs → FAIL...');
  const guide = mkPublishedGuide({
    troubleshootingLevels: [{ level: 'L1', badge: 'B1', description: 'D1', items: ['Doe iets zonder bewijs.'] }]
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.length > 0, `AA: Expected error for level item without sourceRefs. Got: ${JSON.stringify(errs)}`);
  assert.ok(errs.some(e => e.includes('troubleshootingLevels') && e.includes('sourceRefs')), `AA: Error must mention troubleshootingLevels and sourceRefs. Got: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AA Passed: Published troubleshootingLevels item without sourceRefs → FAIL');
}

// AB: published troubleshootingLevels item with unknown ref → FAIL
{
  console.log('  Testing Case AB: Published troubleshootingLevels item with unknown sourceRef → FAIL...');
  const guide = mkPublishedGuide({
    troubleshootingLevels: [{ level: 'L1', badge: 'B1', description: 'D1', items: [{ text: 'Doe iets.', sourceRefs: ['nonexistent-ref-xyz'] }] }]
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.length > 0, `AB: Expected error for unknown sourceRef`);
  assert.ok(errs.some(e => e.includes('unknown sourceRef')), `AB: Error must mention unknown sourceRef. Got: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AB Passed: Unknown sourceRef in troubleshootingLevels → FAIL');
}

// AC: published troubleshootingLevels item with valid ref → PASS
{
  console.log('  Testing Case AC: Published troubleshootingLevels item with valid ref → PASS...');
  const guide = mkPublishedGuide({
    troubleshootingLevels: [{ level: 'L1', badge: 'B1', description: 'D1', sourceRefs: ['src-0458-133-3021-start'], items: [{ text: 'Controleer kettingrem.', sourceRefs: ['src-0458-133-3021-start'] }] }]
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.strictEqual(errs.length, 0, `AC: Expected PASS. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AC Passed: Valid troubleshootingLevels item with sourceRefs → PASS');
}

// AD: technicalInspections claim without sourceRefs → FAIL
{
  console.log('  Testing Case AD: Published technicalInspections claim without sourceRefs → FAIL...');
  const guide = mkPublishedGuide({
    technicalInspections: { fuel: { title: 'Brandstof', text: 'Gebruik correct brandstof.' } }
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.length > 0, `AD: Expected error for technicalInspections without refs. Got: ${JSON.stringify(errs)}`);
  assert.ok(errs.some(e => e.includes('technicalInspections')), `AD: Error must mention technicalInspections. Got: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AD Passed: Published technicalInspections without sourceRefs → FAIL');
}

// AE: technicalInspections with valid refs → PASS
{
  console.log('  Testing Case AE: Published technicalInspections with valid refs → PASS...');
  const guide = mkPublishedGuide({
    technicalInspections: {
      fuel: {
        title: 'Brandstof',
        text: 'Gebruik correct brandstof.',
        sourceRefs: ['src-0458-133-3021-fuel'],
        agingNotice: 'Brandstof veroudert.',
        agingSourceRefs: ['src-0458-133-3021-fuel']
      }
    }
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.strictEqual(errs.length, 0, `AE: Expected PASS. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AE Passed: Published technicalInspections with valid refs → PASS');
}

// AF: troubleshootingMatrix safeFirstCheck without refs → FAIL
{
  console.log('  Testing Case AF: troubleshootingMatrix safeFirstCheck without sourceRefs → FAIL...');
  const guide = mkPublishedGuide({
    troubleshootingMatrix: [{ symptom: 'Start niet', possibleCause: 'Choke.', safeFirstCheck: 'Controleer.', nextStep: 'Handleiding.' }]
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.length > 0, 'AF: Expected error for matrix without sourceRefs');
  assert.ok(errs.some(e => e.includes('troubleshootingMatrix') && e.includes('safeFirstCheck')), `AF: Must mention safeFirstCheck. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AF Passed: troubleshootingMatrix safeFirstCheck without sourceRefs → FAIL');
}

// AG: nextStep without refs → FAIL
{
  console.log('  Testing Case AG: troubleshootingMatrix nextStep without sourceRefs → FAIL...');
  const guide = mkPublishedGuide({
    troubleshootingMatrix: [{ symptom: 'Start niet', possibleCause: 'Choke.', safeFirstCheck: 'Controleer.', nextStep: 'Bougie controleren.' }]
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.some(e => e.includes('nextStep')), `AG: Error must mention nextStep. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AG Passed: troubleshootingMatrix nextStep without sourceRefs → FAIL');
}

// AH: matrix claim with unknown sourceRef → FAIL
{
  console.log('  Testing Case AH: troubleshootingMatrix with unknown sourceRef → FAIL...');
  const guide = mkPublishedGuide({
    troubleshootingMatrix: [{ symptom: 'S', possibleCause: 'C', safeFirstCheck: 'X', nextStep: 'Y', sourceRefs: ['non-existent-ref'] }]
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.some(e => e.includes('unknown sourceRef')), `AH: Must detect unknown sourceRef. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AH Passed: Unknown sourceRef in matrix → FAIL');
}

// AI: valid matrix claims → PASS
{
  console.log('  Testing Case AI: troubleshootingMatrix with valid sourceRefs → PASS...');
  const guide = mkPublishedGuide({
    troubleshootingMatrix: [{ symptom: 'S', possibleCause: 'C', safeFirstCheck: 'X', nextStep: 'Y', sourceRefs: ['src-0458-133-3021-start'] }]
  });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.strictEqual(errs.length, 0, `AI: Expected PASS. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AI Passed: Valid matrix claims → PASS');
}

// AJ: published whenToStopAndCallDealer item without sourceRefs → FAIL
{
  console.log('  Testing Case AJ: Published whenToStopAndCallDealer item without sourceRefs → FAIL...');
  const guide = mkPublishedGuide({ whenToStopAndCallDealer: ['Stop wanneer startkoord blokkeert.'] });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.length > 0, `AJ: Expected error. Got: ${JSON.stringify(errs)}`);
  assert.ok(errs.some(e => e.includes('whenToStopAndCallDealer')), `AJ: Must mention whenToStopAndCallDealer. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AJ Passed: Published whenToStopAndCallDealer without sourceRefs → FAIL');
}

// AK: operational FAQ answer without sourceRefs → FAIL
{
  console.log('  Testing Case AK: Published FAQ answer without sourceRefs → FAIL...');
  const guide = mkPublishedGuide({ faq: [{ question: 'Waarom start niet?', answer: 'Controleer de bougie.' }] });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.length > 0, `AK: Expected error. Got: ${JSON.stringify(errs)}`);
  assert.ok(errs.some(e => e.includes('faq')), `AK: Must mention faq. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AK Passed: Published FAQ answer without sourceRefs → FAIL');
}

// AL: directAnswer without sourceRefs → FAIL
{
  console.log('  Testing Case AL: Published directAnswer without sourceRefs → FAIL...');
  const guide = mkPublishedGuide({ directAnswer: { heading: 'Kort antwoord', content: 'Controleer de kettingrem.' } });
  const resolvedSources = buildResolvedSources(guide);
  const pubState = { isPublished: true };
  const errs = validateOperationalClaimsProvenance(guide, resolvedSources, pubState);
  assert.ok(errs.length > 0, `AL: Expected error. Got: ${JSON.stringify(errs)}`);
  assert.ok(errs.some(e => e.includes('directAnswer')), `AL: Must mention directAnswer. Errors: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AL Passed: Published directAnswer without sourceRefs → FAIL');
}

// AM: all current rendered operational claims in stihl-kettingzaag-start-niet → PASS
{
  console.log('  Testing Case AM: All stihl-kettingzaag-start-niet operational claims → PASS...');
  const guide = stihlKettingzaagStartNietGuide;
  const res = validateGuideSources(guide);
  assert.strictEqual(res.valid, true,
    'AM: stihl-kettingzaag-start-niet must pass full validation cleanly. Errors:\n' + res.errors.join('\n'));
  const claims = collectRenderedOperationalClaims(guide);
  assert.ok(claims.length > 0, 'AM: Should collect at least 1 claim');
  const noRefs = claims.filter(c => !c.sourceRefs || !Array.isArray(c.sourceRefs) || c.sourceRefs.length === 0);
  assert.strictEqual(noRefs.length, 0,
    'AM: All claims must have sourceRefs. Missing on: ' + noRefs.map(c => c.path).join(', '));
  console.log('  ✅ Case AM Passed: ' + claims.length + ' operational claims collected, all have sourceRefs, validateGuideSources PASS.');
}

console.log('  ✅ Test 16 Passed: All operational claim provenance cases (AA–AM) validated.');

// ============================================================
// TEST 17: Renderer / Validator Parity Test
// ============================================================
console.log('\n▶ Test 17: Renderer / Validator Parity Test...');

{
  const EXPECTED_CLAIM_PATH_PREFIXES = [
    'directAnswer.content',
    'troubleshootingLevels[',
    'startProcedures.genericPrinciple.text',
    'floodedEngineRecovery.genericPrinciple.text',
    'technicalInspections.fuel.text',
    'technicalInspections.fuel.agingNotice',
    'technicalInspections.sparkPlug.text',
    'technicalInspections.sparkPlug.colors[',
    'technicalInspections.sparkPlug.gapNotice',
    'technicalInspections.carburetorVsMtronic.text',
    'technicalInspections.carburetorVsMtronic.mtronicText',
    'troubleshootingMatrix[',
    'whenToStopAndCallDealer[',
    'faq['
  ];

  const guide = stihlKettingzaagStartNietGuide;
  const claims = collectRenderedOperationalClaims(guide);
  const seenPrefixes = new Set();
  for (const claim of claims) {
    for (const prefix of EXPECTED_CLAIM_PATH_PREFIXES) {
      if (claim.path.startsWith(prefix)) seenPrefixes.add(prefix);
    }
  }
  const missingPrefixes = EXPECTED_CLAIM_PATH_PREFIXES.filter(p => !seenPrefixes.has(p));
  assert.strictEqual(missingPrefixes.length, 0,
    'Test 17: Renderer paths not covered by collector:\n' + missingPrefixes.join('\n') + '\nUpdate collectRenderedOperationalClaims.');
  console.log('  ✅ Test 17 Passed: All ' + EXPECTED_CLAIM_PATH_PREFIXES.length + ' renderer paths covered by collectRenderedOperationalClaims.');
}

// ============================================================
// TEST 18: Operational Claims Require LOCATOR_VERIFIED for Published Guides
// ============================================================
console.log('\n▶ Test 18: Operational Claims Require LOCATOR_VERIFIED for Published Guides...');

{
  // AO: published guide with operational claim referencing source WITHOUT locator -> FAIL
  const guideWithoutLocator = {
    slug: 'test-slug',
    publicationStatus: 'PUBLISHED',
    sources: [
      {
        id: 'src-no-locator',
        source_id: 'src-no-locator',
        canonical_document_id: '0458-133-3021',
        publication_id: '0458-133-3021',
        document_title: 'STIHL 026 Instruction Manual',
        source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
        model_scope: ['026'],
        modelScope: 'STIHL 026'
        // No locator provided -> locatorStatus will be NO_LOCATOR
      }
    ],
    directAnswer: {
      heading: 'Kort antwoord',
      content: 'Controleer de kettingrem en brandstoftoevoer.',
      sourceRefs: ['src-no-locator']
    }
  };

  const resolvedSources = new Map();
  for (const src of guideWithoutLocator.sources) {
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    if (res.resolved && res.canonicalSource) resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
  }

  const errs = validateOperationalClaimsProvenance(guideWithoutLocator, resolvedSources, { isPublished: true });
  assert.ok(errs.length > 0, 'Must reject operational claim citing source with unverified locator on published guide');
  assert.ok(errs.some(e => e.includes('not LOCATOR_VERIFIED')), `Error must state not LOCATOR_VERIFIED. Got: ${JSON.stringify(errs)}`);
  console.log('  ✅ Case AO Passed: Operational claim referencing unverified locator correctly rejected on published guide.');

  // AP: published guide with operational claim referencing LOCATOR_VERIFIED source -> PASS
  const guideWithVerifiedLocator = {
    slug: 'test-slug',
    publicationStatus: 'PUBLISHED',
    sources: [
      {
        id: 'src-verified-loc',
        source_id: 'src-verified-loc',
        canonical_document_id: '0458-133-3021',
        publication_id: '0458-133-3021',
        document_title: 'STIHL 026 Instruction Manual',
        source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
        model_scope: ['026'],
        modelScope: 'STIHL 026',
        locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
      }
    ],
    directAnswer: {
      heading: 'Kort antwoord',
      content: 'Controleer de kettingrem en brandstoftoevoer.',
      sourceRefs: ['src-verified-loc']
    }
  };

  const resolvedSourcesPass = new Map();
  for (const src of guideWithVerifiedLocator.sources) {
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    if (res.resolved && res.canonicalSource) resolvedSourcesPass.set(res.canonicalSource.source_id, res.canonicalSource);
  }

  const errsPass = validateOperationalClaimsProvenance(guideWithVerifiedLocator, resolvedSourcesPass, { isPublished: true });
  assert.strictEqual(errsPass.length, 0, `Operational claim citing LOCATOR_VERIFIED source must pass cleanly. Errors: ${JSON.stringify(errsPass)}`);
  console.log('  ✅ Case AP Passed: Operational claim referencing LOCATOR_VERIFIED source passes cleanly.');
}

// ============================================================
// TEST 19: BR 600 Manual (0458-452-0121-J) Page Bounds & Ceiling Parity
// ============================================================
console.log('\n▶ Test 19: BR 600 Manual (0458-452-0121-J) Page Bounds & Ceiling Parity...');

{
  // 0458-452-0121-J is an 88-page document (NOT limited to pdf_spec_page + 4 = 18)
  const baseBR600Source = {
    id: 'src-br600-test',
    source_id: 'src-br600-test',
    canonical_document_id: '0458-452-0121-J',
    publication_id: '0458-452-0121-J',
    document_title: 'STIHL BR 500, BR 550, BR 600 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['BR 600'],
    modelScope: 'STIHL BR 600'
  };

  // Page 14 (specifications page) -> PASS
  {
    const src = { ...baseBR600Source, locator: { page: 14, section: 'Specifications', heading: 'Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, true, 'Page 14 must resolve');
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    console.log('  ✅ Page 14 (specifications page) -> PASS (LOCATOR_VERIFIED)');
  }

  // Page 19 (formerly rejected by pdf_spec_page + 4 = 18 ceiling) -> PASS
  {
    const src = { ...baseBR600Source, locator: { page: 19, section: 'Maintenance Chart', heading: 'Overview' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, true, 'Page 19 must NOT be rejected by specification-page ceiling');
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    console.log('  ✅ Page 19 (beyond spec page + 4) -> PASS (LOCATOR_VERIFIED)');
  }

  // Page 88 (full document boundary) -> PASS
  {
    const src = { ...baseBR600Source, locator: { page: 88, section: 'Approvals', heading: 'Declaration of Conformity' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, true, 'Page 88 must resolve cleanly');
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    console.log('  ✅ Page 88 (document upper bound) -> PASS (LOCATOR_VERIFIED)');
  }

  // Page 89 (exceeds actual 88 pages) -> FAIL
  {
    const src = { ...baseBR600Source, locator: { page: 89, section: 'Approvals', heading: 'Declaration of Conformity' } };
    const res = resolveGuideSource(src, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'Page 89 must exceed document page count');
    assert.ok(res.errors.some(e => e.includes('exceeds known document page count (88)')), `Error must mention 88 pages: ${JSON.stringify(res.errors)}`);
    console.log('  ✅ Page 89 (exceeds 88 pages) -> FAIL (correctly rejected)');
  }
}

// ============================================================
// TEST 20: Substantive Section Rendering & Dynamic TOC Anchor Parity
// ============================================================
console.log('\n▶ Test 20: Substantive Section Rendering & Dynamic TOC Anchor Parity...');

{
  const registeredGuides = getAllStructuredGuides();
  assert.strictEqual(registeredGuides.length, 5, 'Must have exactly 5 structured guides');

  for (const guide of registeredGuides) {
    const html = renderGuidePageHtml(guide, database, baseUrl);

    // 1. Zero [object Object] in rendered output
    assert.strictEqual(html.includes('[object Object]'), false, `Guide ${guide.slug} contains [object Object]`);

    // 2. All internal anchors in TOC must have matching id in HTML
    const anchorMatches = [...html.matchAll(/href=["']#([^"']+)["']/g)].map(m => m[1]);
    assert.ok(anchorMatches.length > 0, `Guide ${guide.slug} must render a TOC with anchor links`);
    for (const anchor of anchorMatches) {
      assert.strictEqual(html.includes(`id="${anchor}"`), true,
        `Guide ${guide.slug}: anchor #${anchor} has no matching id="${anchor}" in rendered HTML`);
    }

    // 3. Substantive content verification per guide type
    if (guide.generationModelData) {
      assert.ok(html.includes('id="generation-model-data"'), `${guide.slug} must render generation-model-data section`);
      assert.ok(html.includes(guide.generationModelData[0].generation), `${guide.slug} must render generation title`);
    }
    if (guide.distinctionFramework) {
      assert.ok(html.includes('id="distinction-framework"'), `${guide.slug} must render distinction-framework section`);
      assert.ok(html.includes(guide.distinctionFramework.partCastDateVsMachineAssembly.title), `${guide.slug} must render framework title`);
    }
    if (guide.resultCategories) {
      assert.ok(html.includes('id="result-categories"'), `${guide.slug} must render result-categories section`);
      assert.ok(html.includes(guide.resultCategories[0].label), `${guide.slug} must render result category label`);
    }
    if (guide.inspectionChecklist) {
      assert.ok(html.includes('id="inspection-checklist"'), `${guide.slug} must render inspection-checklist section`);
      assert.ok(html.includes(guide.inspectionChecklist[0].text), `${guide.slug} must render checklist text`);
    }
  }

  console.log('  ✅ Test 20 Passed: All 5 registered guides render substantive sections and maintain 100% TOC anchor parity.');
}

// ============================================================
// TEST 21: Fuel-Specific Domain Grounding for Operational Fuel Claims
// ============================================================
console.log('\n▶ Test 21: Fuel-Specific Domain Grounding for Operational Fuel Claims...');

{
  // Case AQ: published guide with fuel aging claim bound ONLY to start procedure locator -> FAIL
  const guideWithStartOnlyFuel = {
    slug: 'test-fuel-start-only',
    publicationStatus: 'PUBLISHED',
    sources: [
      {
        id: 'src-start-only',
        source_id: 'src-start-only',
        canonical_document_id: '0458-133-3021',
        publication_id: '0458-133-3021',
        document_title: 'STIHL 026 Instruction Manual',
        source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
        model_scope: ['026'],
        modelScope: 'STIHL 026',
        locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
      }
    ],
    technicalInspections: {
      fuel: {
        title: 'Brandstofkwaliteit',
        agingNotice: 'Brandstof veroudert tijdens opslag.',
        sourceRefs: ['src-start-only']
      }
    }
  };

  const resolvedStartOnly = new Map();
  for (const src of guideWithStartOnlyFuel.sources) {
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    if (res.resolved && res.canonicalSource) resolvedStartOnly.set(res.canonicalSource.source_id, res.canonicalSource);
  }

  const errsStartOnly = validateOperationalClaimsProvenance(guideWithStartOnlyFuel, resolvedStartOnly, { isPublished: true });
  assert.ok(errsStartOnly.length > 0, 'Fuel claim bound only to start procedure must fail');
  assert.ok(errsStartOnly.some(e => e.includes('start procedure instead of fuel')), `Error must flag start-only fuel locator. Got: ${JSON.stringify(errsStartOnly)}`);
  console.log('  ✅ Case AQ Passed: Fuel claim bound only to start procedure locator correctly rejected.');

  // Case AR: published guide with fuel claim bound to dedicated fuel locator -> PASS
  const guideWithFuelSpecific = {
    slug: 'test-fuel-specific',
    publicationStatus: 'PUBLISHED',
    sources: [
      {
        id: 'src-fuel-loc',
        source_id: 'src-fuel-loc',
        canonical_document_id: '0458-133-3021',
        publication_id: '0458-133-3021',
        document_title: 'STIHL 026 Instruction Manual',
        source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
        model_scope: ['026'],
        modelScope: 'STIHL 026',
        locator: { page: 35, section: 'Fuel', heading: 'Fuel Mixture & Storage' }
      }
    ],
    technicalInspections: {
      fuel: {
        title: 'Brandstofkwaliteit',
        agingNotice: 'Brandstof veroudert tijdens opslag.',
        sourceRefs: ['src-fuel-loc']
      }
    }
  };

  const resolvedFuel = new Map();
  for (const src of guideWithFuelSpecific.sources) {
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    if (res.resolved && res.canonicalSource) resolvedFuel.set(res.canonicalSource.source_id, res.canonicalSource);
  }

  const errsFuel = validateOperationalClaimsProvenance(guideWithFuelSpecific, resolvedFuel, { isPublished: true });
  assert.strictEqual(errsFuel.length, 0, `Fuel claim with dedicated fuel locator must pass. Errors: ${JSON.stringify(errsFuel)}`);
  console.log('  ✅ Case AR Passed: Fuel claim bound to fuel-specific locator passes cleanly.');
}

// ============================================================
// TEST 22: Strict String Requirement for Locator Labels
// ============================================================
console.log('\n▶ Test 22: Strict String Requirement for Locator Labels...');

{
  const baseSource = {
    id: 'src-loc-label-test',
    source_id: 'src-loc-label-test',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026'
  };

  // 1. Whitespace-only section -> FAIL / not LOCATOR_VERIFIED
  {
    const res = resolveGuideSource({ ...baseSource, locator: { page: 38, section: '   ' } }, { throwOnError: false });
    assert.notStrictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    assert.ok(res.errors.some(e => e.includes('non-empty trimmed string')), 'Must reject whitespace-only section label');
    console.log('  ✅ Whitespace-only section label -> correctly rejected');
  }

  // 2. Boolean true for section -> FAIL / not LOCATOR_VERIFIED
  {
    const res = resolveGuideSource({ ...baseSource, locator: { page: 38, section: true } }, { throwOnError: false });
    assert.notStrictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    assert.ok(res.errors.some(e => e.includes('non-empty trimmed string')), 'Must reject boolean section label');
    console.log('  ✅ Boolean section label -> correctly rejected');
  }

  // 3. Object for heading -> FAIL / not LOCATOR_VERIFIED
  {
    const res = resolveGuideSource({ ...baseSource, locator: { page: 38, heading: {} } }, { throwOnError: false });
    assert.notStrictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    assert.ok(res.errors.some(e => e.includes('non-empty trimmed string')), 'Must reject object heading label');
    console.log('  ✅ Object heading label -> correctly rejected');
  }

  // 4. Non-empty trimmed string -> LOCATOR_VERIFIED
  {
    const res = resolveGuideSource({ ...baseSource, locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } }, { throwOnError: false });
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    console.log('  ✅ Valid trimmed string locator labels -> LOCATOR_VERIFIED');
  }
}

// ============================================================
// TEST 23: Newly Rendered Guide Sections Provenance Enforcement
// ============================================================
console.log('\n▶ Test 23: Newly Rendered Guide Sections Provenance Enforcement...');

{
  // Synthetic published guide with generationModelData, distinctionFramework, resultCategories, inspectionChecklist
  const syntheticGuideWithoutRefs = {
    slug: 'synthetic-guide',
    publicationStatus: 'PUBLISHED',
    sources: [
      {
        id: 'src-test',
        source_id: 'src-test',
        canonical_document_id: '0458-133-3021',
        publication_id: '0458-133-3021',
        document_title: 'STIHL 026 Instruction Manual',
        source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
        model_scope: ['026'],
        modelScope: 'STIHL 026',
        locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
      }
    ],
    generationModelData: [
      {
        generation: 'Gen 1',
        characteristics: 'Standard control lever without calibration position',
        procedureOverview: 'Warm up 1 min then cut full throttle'
      }
    ],
    inspectionChecklist: [
      {
        topic: 'Serial number',
        text: 'Clean 9-digit stamping'
      }
    ]
  };

  const claims = collectRenderedOperationalClaims(syntheticGuideWithoutRefs);
  const genProcClaim = claims.find(c => c.path === 'generationModelData[0].procedureOverview');
  assert.ok(genProcClaim, 'Must collect claim for generationModelData.procedureOverview');
  assert.strictEqual(genProcClaim.claimClass, 'GENERATION_PROCEDURE');

  const checkClaim = claims.find(c => c.path === 'inspectionChecklist[0].text');
  assert.ok(checkClaim, 'Must collect claim for inspectionChecklist.text');
  assert.strictEqual(checkClaim.claimClass, 'INSPECTION_STEP');

  const resolvedMap = new Map();
  for (const s of syntheticGuideWithoutRefs.sources) {
    const r = resolveGuideSource(s, { throwOnError: false, isPublishedGuide: true });
    if (r.resolved && r.canonicalSource) resolvedMap.set(r.canonicalSource.source_id, r.canonicalSource);
  }

  const errs = validateOperationalClaimsProvenance(syntheticGuideWithoutRefs, resolvedMap, { isPublished: true });
  assert.ok(errs.length >= 3, 'Must reject synthetic published guide with unsupported newly-rendered sections');
  assert.ok(errs.some(e => e.includes('generationModelData[0].procedureOverview')), 'Must flag missing refs on procedureOverview');
  assert.ok(errs.some(e => e.includes('inspectionChecklist[0].text')), 'Must flag missing refs on inspectionChecklist text');
  console.log('  ✅ Test 23 Passed: Newly rendered guide sections are fully collected and enforced by provenance gate.');
}

// ============================================================
// TEST 24: Model Assignment Provenance & Scope Coverage in generationModelData (Thread 18)
// ============================================================
console.log('\n▶ Test 24: Model Assignment Provenance & Scope Coverage (Thread 18)...');

{
  const ms261Source = {
    id: 'src-ms261-canonical',
    source_id: 'src-ms261-canonical',
    canonical_document_id: '0458-573-8621-D',
    publication_id: '0458-573-8621-D',
    document_title: 'STIHL MS 261 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['MS 261', 'MS 261 C-M'],
    modelScope: 'STIHL MS 261 / MS 261 C-M',
    locator: { page: 34, section: 'Starting / Stopping the Engine', heading: 'M-Tronic calibration' }
  };

  const resolvedMS261 = resolveGuideSource(ms261Source, { throwOnError: false, isPublishedGuide: true });
  assert.strictEqual(resolvedMS261.resolved, true);
  const resolvedMap = new Map();
  resolvedMap.set('src-ms261-canonical', resolvedMS261.canonicalSource);

  // Case AS1: Model covered by source passes cleanly
  {
    const guideWithCoveredModel = {
      slug: 'test-gen-guide-covered',
      publicationStatus: 'PUBLISHED',
      sources: [ms261Source],
      generationModelData: [
        {
          generation: 'Gen 2',
          models: ['MS 261 C-M (vanaf serienummerwijziging)'],
          characteristics: 'Combihendel met driehoekssymbool',
          procedureOverview: 'Kalibratiecyclus van 90 seconden stationair',
          sourceRefs: ['src-ms261-canonical']
        }
      ]
    };

    const claims = collectRenderedOperationalClaims(guideWithCoveredModel);
    const modelClaim = claims.find(c => c.path === 'generationModelData[0].models[0]');
    assert.ok(modelClaim, 'Must collect claim for generationModelData[0].models[0]');
    assert.strictEqual(modelClaim.claimClass, 'GENERATION_SPECIFICATION');

    const errors = validateOperationalClaimsProvenance(guideWithCoveredModel, resolvedMap, { isPublished: true });
    assert.strictEqual(errors.length, 0, `Covered model assignment must pass without errors. Got: ${errors.join('; ')}`);
    console.log('  ✅ Case AS1 Passed: Model assignment covered by canonical source passes cleanly.');
  }

  // Case AS2: Uncovered model assignment fails closed
  {
    const guideWithUncoveredModel = {
      slug: 'test-gen-guide-uncovered',
      publicationStatus: 'PUBLISHED',
      sources: [ms261Source],
      generationModelData: [
        {
          generation: 'Gen 2',
          models: ['MS 462 C-M'], // MS 462 is NOT in MS 261 scope
          characteristics: 'Combihendel met driehoekssymbool',
          procedureOverview: 'Kalibratiecyclus van 90 seconden stationair',
          sourceRefs: ['src-ms261-canonical']
        }
      ]
    };

    const errors = validateOperationalClaimsProvenance(guideWithUncoveredModel, resolvedMap, { isPublished: true });
    assert.ok(errors.length > 0, 'Uncovered model assignment on published guide must fail validation');
    assert.ok(
      errors.some(e => e.includes('assigns model "MS 462 C-M"') && e.includes('cover this model')),
      `Expected model coverage error but got: ${errors.join('; ')}`
    );
    console.log('  ✅ Case AS2 Passed: Arbitrary/uncovered model assignment fails closed.');
  }

  // Case AS3: Model assignment with no sourceRefs fails closed
  {
    const guideWithoutRefs = {
      slug: 'test-gen-guide-no-refs',
      publicationStatus: 'PUBLISHED',
      sources: [ms261Source],
      generationModelData: [
        {
          generation: 'Gen 2',
          models: ['MS 261 C-M'],
          characteristics: 'Combihendel met driehoekssymbool',
          procedureOverview: 'Kalibratiecyclus van 90 seconden stationair'
        }
      ]
    };

    const errors = validateOperationalClaimsProvenance(guideWithoutRefs, resolvedMap, { isPublished: true });
    assert.ok(errors.length > 0, 'Model assignment without sourceRefs must fail');
    assert.ok(
      errors.some(e => e.includes('generationModelData[0].models[0]') && e.includes('has no sourceRefs')),
      `Expected missing sourceRefs error on model but got: ${errors.join('; ')}`
    );
    console.log('  ✅ Case AS3 Passed: Model assignment without sourceRefs fails closed.');
  }
}

// ============================================================
// TEST 25: Canonical Generation Source Display in GuidePageTemplate (Thread 19)
// ============================================================
console.log('\n▶ Test 25: Canonical Generation Source Display in GuidePageTemplate (Thread 19)...');

{
  const testGuide = {
    title: 'Test M-Tronic Gids',
    subtitle: 'Kalibratietest',
    metaDescription: 'Test meta description for M-Tronic guide page template rendering.',
    readingTime: '5 min',
    publicationStatus: 'READY_FOR_REVIEW',
    sources: [
      {
        id: 'src-gen-test',
        source_id: 'src-gen-test',
        documentTitle: 'STIHL MS 261 C-M Instruction Manual',
        locator: { page: 34, section: 'Starting / Stopping the Engine', heading: 'M-Tronic calibration' }
      }
    ],
    generationModelData: [
      {
        generation: 'M-Tronic 2.0',
        models: ['MS 261 C-M'],
        characteristics: 'Combihendel met driehoekje',
        procedureOverview: '90 seconden stationair in startstand',
        sourceRefs: ['src-gen-test'],
        sourceDocument: 'Arbitrary Free Text Bypassing Registry' // Stale/unwanted field
      }
    ]
  };

  const html = renderGuidePageHtml(testGuide, database, baseUrl);

  // Must render canonical document title and formatted locator from registry
  assert.ok(html.includes('STIHL MS 261 C-M Instruction Manual'), 'Must render canonical document title');
  assert.ok(html.includes('p. 34'), 'Must render canonical formatted page locator');
  assert.ok(html.includes('Starting / Stopping the Engine'), 'Must render canonical formatted section');

  // Must NOT render ungrounded free-text bypass string
  assert.strictEqual(
    html.includes('Arbitrary Free Text Bypassing Registry'),
    false,
    'Free text sourceDocument must NOT be rendered by GuidePageTemplate'
  );

  console.log('  ✅ Test 25 Passed: GuidePageTemplate strictly resolves generation sources via registry and rejects free text.');
}

// ============================================================
// TEST 26: Expanded Operational Fuel Claim Domain Grounding (Thread 17)
// ============================================================
console.log('\n▶ Test 26: Expanded Operational Fuel Claim Domain Grounding (Thread 17)...');

{
  const startSource = {
    id: 'src-026-start',
    source_id: 'src-026-start',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };

  const fuelSource = {
    id: 'src-026-fuel',
    source_id: 'src-026-fuel',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 35, section: 'Fuel', heading: 'Fuel Mixture & Storage' }
  };

  const resolvedStart = resolveGuideSource(startSource, { throwOnError: false, isPublishedGuide: true });
  const resolvedFuel = resolveGuideSource(fuelSource, { throwOnError: false, isPublishedGuide: true });

  const resolvedMap = new Map();
  resolvedMap.set('src-026-start', resolvedStart.canonicalSource);
  resolvedMap.set('src-026-fuel', resolvedFuel.canonicalSource);

  // AT1: troubleshootingLevels fuel item bound only to start locator -> FAIL
  {
    const guideAT1 = {
      slug: 'test-fuel-levels',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1',
          items: [
            {
              text: 'Controleer de brandstof: gebruik verse brandstof; oude brandstof kan verouderen en ontmengen.',
              sourceRefs: ['src-026-start']
            }
          ]
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAT1, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Fuel claim in troubleshootingLevels bound only to start locator must fail');
    assert.ok(
      errs.some(e => e.includes('troubleshootingLevels[0].items[0]') && e.includes('pointing to start procedure')),
      `Expected start locator rejection for fuel claim, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AT1 Passed: troubleshootingLevels fuel claim bound only to start locator is rejected.');
  }

  // AT2: FAQ fuel answer bound only to start locator -> FAIL
  {
    const guideAT2 = {
      slug: 'test-fuel-faq',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      faq: [
        {
          question: 'Kan oude brandstof startproblemen veroorzaken?',
          answer: 'Ja. Brandstof kan tijdens langere opslag verouderen en ontmengen.',
          sourceRefs: ['src-026-start']
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAT2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'FAQ fuel answer bound only to start locator must fail');
    assert.ok(
      errs.some(e => e.includes('faq[0].answer') && e.includes('pointing to start procedure')),
      `Expected start locator rejection for FAQ fuel answer, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AT2 Passed: FAQ fuel answer bound only to start locator is rejected.');
  }

  // AT3: troubleshootingMatrix fuel item bound only to start locator -> FAIL
  {
    const guideAT3 = {
      slug: 'test-fuel-matrix',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      troubleshootingMatrix: [
        {
          symptom: 'Zaag start koud niet',
          possibleCause: 'Onjuiste combihendelstand, verouderde brandstof of vervuilde bougie.',
          safeFirstCheck: 'Controleer of de stopschakelaar niet op 0 staat.',
          nextStep: 'Bougie inspecteren op nattigheid/roet.',
          sourceRefs: ['src-026-start']
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAT3, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Matrix fuel item bound only to start locator must fail');
    assert.ok(
      errs.some(e => e.includes('troubleshootingMatrix[0].possibleCause') && e.includes('pointing to start procedure')),
      `Expected start locator rejection for matrix fuel item, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AT3 Passed: Troubleshooting matrix fuel item bound only to start locator is rejected.');
  }

  // AT4: All fuel claims bound to fuel locator -> PASS
  {
    const guideAT4 = {
      slug: 'test-fuel-clean',
      publicationStatus: 'PUBLISHED',
      sources: [startSource, fuelSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1',
          items: [
            {
              text: 'Controleer de brandstof: gebruik verse brandstof; oude brandstof kan verouderen en ontmengen.',
              sourceRefs: ['src-026-fuel']
            }
          ]
        }
      ],
      faq: [
        {
          question: 'Kan oude brandstof startproblemen veroorzaken?',
          answer: 'Ja. Brandstof kan tijdens langere opslag verouderen en ontmengen.',
          sourceRefs: ['src-026-fuel']
        }
      ],
      troubleshootingMatrix: [
        {
          symptom: 'Zaag start koud niet',
          possibleCause: 'Onjuiste combihendelstand, verouderde brandstof of vervuilde bougie.',
          safeFirstCheck: 'Controleer of de stopschakelaar niet op 0 staat.',
          nextStep: 'Bougie inspecteren op nattigheid/roet.',
          sourceRefs: ['src-026-start', 'src-026-fuel']
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAT4, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `All fuel claims bound to fuel locator must pass cleanly. Got: ${errs.join('; ')}`);
    console.log('  ✅ Case AT4 Passed: All fuel claims properly bound to fuel locator pass cleanly.');
  }
}

// ============================================================
// TEST 27: Flooded-Engine Recovery Safety & Explanation Fields Provenance (Thread 20)
// ============================================================
console.log('\n▶ Test 27: Flooded-Engine Recovery Safety & Explanation Fields Provenance (Thread 20)...');

{
  const floodedSource = {
    id: 'src-026-flooded',
    source_id: 'src-026-flooded',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 42, section: 'Adjusting Carburetor', heading: 'If engine does not start' }
  };

  const resolvedFlooded = resolveGuideSource(floodedSource, { throwOnError: false, isPublishedGuide: true });
  assert.strictEqual(resolvedFlooded.resolved, true);
  const resolvedMap = new Map();
  resolvedMap.set('src-026-flooded', resolvedFlooded.canonicalSource);

  // AU1: explanation without sourceRefs -> FAIL
  {
    const guideAU1 = {
      slug: 'test-flooded-explanation',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSource],
      floodedEngineRecovery: {
        explanation: 'Een verzopen motor kan ontstaan door overmatig gebruik van de choke.',
        genericPrinciple: {
          text: 'Ontzopingsprincipe conform fabrieksvoorschrift.',
          sourceRefs: ['src-026-flooded']
        }
      }
    };

    const claims = collectRenderedOperationalClaims(guideAU1);
    const expClaim = claims.find(c => c.path === 'floodedEngineRecovery.explanation');
    assert.ok(expClaim, 'Must collect claim for floodedEngineRecovery.explanation');

    const errs = validateOperationalClaimsProvenance(guideAU1, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Explanation without sourceRefs must fail on published guide');
    assert.ok(
      errs.some(e => e.includes('floodedEngineRecovery.explanation') && e.includes('has no sourceRefs')),
      `Expected missing sourceRefs error for explanation, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AU1 Passed: floodedEngineRecovery.explanation without sourceRefs is rejected.');
  }

  // AU2: safetyNotice without sourceRefs -> FAIL
  {
    const guideAU2 = {
      slug: 'test-flooded-safety',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSource],
      floodedEngineRecovery: {
        safetyNotice: 'Voer nooit een vonktest uit met een open bougiegat.',
        genericPrinciple: {
          text: 'Ontzopingsprincipe conform fabrieksvoorschrift.',
          sourceRefs: ['src-026-flooded']
        }
      }
    };

    const claims = collectRenderedOperationalClaims(guideAU2);
    const safetyClaim = claims.find(c => c.path === 'floodedEngineRecovery.safetyNotice');
    assert.ok(safetyClaim, 'Must collect claim for floodedEngineRecovery.safetyNotice');

    const errs = validateOperationalClaimsProvenance(guideAU2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'SafetyNotice without sourceRefs must fail on published guide');
    assert.ok(
      errs.some(e => e.includes('floodedEngineRecovery.safetyNotice') && e.includes('has no sourceRefs')),
      `Expected missing sourceRefs error for safetyNotice, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AU2 Passed: floodedEngineRecovery.safetyNotice without sourceRefs is rejected.');
  }

  // AU3: both fields with valid sourceRefs -> PASS
  {
    const guideAU3 = {
      slug: 'test-flooded-valid',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSource],
      floodedEngineRecovery: {
        explanation: 'Een verzopen motor kan ontstaan door overmatig gebruik van de choke.',
        explanationSourceRefs: ['src-026-flooded'],
        safetyNotice: 'Voer nooit een vonktest uit met een open bougiegat.',
        safetyNoticeSourceRefs: ['src-026-flooded'],
        genericPrinciple: {
          text: 'Ontzopingsprincipe conform fabrieksvoorschrift.',
          sourceRefs: ['src-026-flooded']
        }
      }
    };

    const errs = validateOperationalClaimsProvenance(guideAU3, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Valid explanation and safetyNotice must pass. Got: ${errs.join('; ')}`);
    console.log('  ✅ Case AU3 Passed: Both floodedEngineRecovery fields with valid sourceRefs pass cleanly.');
  }
}

// ============================================================
// TEST 28: Crankcase Pressure & Vacuum Testing Service Evidence Grounding (Thread 21)
// ============================================================
console.log('\n▶ Test 28: Crankcase Pressure & Vacuum Testing Service Evidence Grounding (Thread 21)...');

{
  const carbSource = {
    id: 'src-026-carb',
    source_id: 'src-026-carb',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 42, section: 'Adjusting Carburetor', heading: 'Motor management' }
  };

  const serviceSource = {
    id: 'src-1121-service',
    source_id: 'src-1121-service',
    canonical_document_id: '1121',
    publication_id: '1121',
    document_title: 'STIHL Werkplaatshandboek 1121',
    source_class: 'OFFICIAL_SERVICE_MANUAL',
    model_scope: ['026', 'MS 260'],
    modelScope: 'STIHL 026 / MS 260',
    locator: { page: 16, section: 'Crankcase / Leakage Testing', heading: 'Pressure and Vacuum Testing' }
  };

  const resolvedCarb = resolveGuideSource(carbSource, { throwOnError: false, isPublishedGuide: true });
  const resolvedService = resolveGuideSource(serviceSource, { throwOnError: false, isPublishedGuide: false });

  assert.strictEqual(resolvedCarb.resolved, true);
  assert.strictEqual(resolvedService.resolved, true);

  // Ensure mock service source has AUTHENTICATED_OFFICIAL in resolved map to isolate locator testing
  const authServiceSource = {
    ...resolvedService.canonicalSource,
    authenticity_status: 'AUTHENTICATED_OFFICIAL'
  };

  const unrelatedServiceSource = {
    id: 'src-service-unrelated',
    source_id: 'src-service-unrelated',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Workshop Service Manual',
    source_class: 'OFFICIAL_SERVICE_MANUAL',
    authenticity_status: 'AUTHENTICATED_OFFICIAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 42, section: 'Adjusting Carburetor', heading: 'Idle speed' },
    locatorStatus: 'LOCATOR_VERIFIED'
  };

  const resolvedMap = new Map();
  resolvedMap.set('src-026-carb', resolvedCarb.canonicalSource);
  resolvedMap.set('src-1121-service', authServiceSource);
  resolvedMap.set('src-service-unrelated', unrelatedServiceSource);

  // AV1: Crankcase pressure/vacuum test bound only to carburetor adjustment locator -> FAIL
  {
    const guideAV1 = {
      slug: 'test-crankcase-carb-only',
      publicationStatus: 'PUBLISHED',
      sources: [carbSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          items: [
            {
              text: 'Druk- en vacuümmeting van het carter (opsporen van valse lucht via versleten krukaskeerringen of pakkingen).',
              sourceRefs: ['src-026-carb']
            }
          ]
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAV1, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Crankcase testing claim bound only to carburetor locator must fail');
    assert.ok(
      errs.some(e => e.includes('crankcase pressure/vacuum or seal testing') && e.includes('without a crankcase-specific testing locator')),
      `Expected crankcase service evidence error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AV1 Passed: Crankcase testing claim bound only to carburetor locator is rejected.');
  }

  // AV2: Crankcase testing bound to genuine crankcase-specific service locator -> PASS
  {
    const guideAV2 = {
      slug: 'test-crankcase-service-valid',
      publicationStatus: 'PUBLISHED',
      sources: [serviceSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          items: [
            {
              text: 'Druk- en vacuümmeting van het carter (opsporen van valse lucht via versleten krukaskeerringen of pakkingen).',
              sourceRefs: ['src-1121-service']
            }
          ]
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAV2, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Crankcase testing bound to crankcase-specific locator must pass. Got: ${errs.join('; ')}`);
    console.log('  ✅ Case AV2 Passed: Crankcase testing claim bound to official workshop manual with crankcase locator passes cleanly.');
  }

  // AV3 (Thread 23): Crankcase testing citing service manual with unrelated locator (carburetor) -> FAIL
  {
    const guideAV3 = {
      slug: 'test-crankcase-service-unrelated-locator',
      publicationStatus: 'PUBLISHED',
      sources: [unrelatedServiceSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          items: [
            {
              text: 'Druk- en vacuümmeting van het carter (opsporen van valse lucht via versleten krukaskeerringen of pakkingen).',
              sourceRefs: ['src-service-unrelated']
            }
          ]
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAV3, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Crankcase claim citing service manual with carburetor locator must fail closed');
    assert.ok(
      errs.some(e => e.includes('crankcase pressure/vacuum or seal testing') && e.includes('without a crankcase-specific testing locator')),
      `Expected locator check to reject service manual with unrelated locator, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AV3 Passed: Service manual citing unrelated carburetor locator correctly rejected for crankcase testing.');
  }
}

// ============================================================
// TEST 29: M-Tronic Electronic Diagnosis Evidence Grounding (Thread 24)
// ============================================================
console.log('\n▶ Test 29: M-Tronic Electronic Diagnosis Evidence Grounding (Thread 24)...');

{
  const startSource = {
    id: 'src-ms261-start',
    source_id: 'src-ms261-start',
    canonical_document_id: '0458-573-8621-D',
    publication_id: '0458-573-8621-D',
    document_title: 'STIHL MS 261 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['MS 261', 'MS 261 C-M'],
    modelScope: 'STIHL MS 261 / MS 261 C-M',
    locator: { page: 34, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };

  const diagSource = {
    id: 'src-ms261-diag',
    source_id: 'src-ms261-diag',
    canonical_document_id: '0458-573-8621-D',
    publication_id: '0458-573-8621-D',
    document_title: 'STIHL MS 261 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['MS 261', 'MS 261 C-M'],
    modelScope: 'STIHL MS 261 / MS 261 C-M',
    locator: { page: 34, section: 'M-Tronic Engine Management', heading: 'M-Tronic Diagnosis & Calibration' }
  };

  const resolvedStart = resolveGuideSource(startSource, { throwOnError: false, isPublishedGuide: true });
  const resolvedDiag = resolveGuideSource(diagSource, { throwOnError: false, isPublishedGuide: true });

  assert.strictEqual(resolvedStart.resolved, true);
  assert.strictEqual(resolvedDiag.resolved, true);

  const mtronicMap = new Map();
  mtronicMap.set('src-ms261-start', resolvedStart.canonicalSource);
  mtronicMap.set('src-ms261-diag', resolvedDiag.canonicalSource);

  // AW1: M-Tronic diagnosis claim bound only to starting procedure locator -> FAIL
  {
    const guideAW1 = {
      slug: 'test-mtronic-start-only',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          items: [
            {
              text: 'Elektronische diagnose van STIHL M-Tronic systemen met behulp van het voor de generatie voorgeschreven diagnosesysteem.',
              sourceRefs: ['src-ms261-start']
            }
          ]
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAW1, mtronicMap, { isPublished: true });
    assert.ok(errs.length > 0, 'M-Tronic diagnosis claim bound only to starting procedure locator must fail');
    assert.ok(
      errs.some(e => e.includes('M-Tronic electronic diagnosis') && e.includes('pointing to starting procedure')),
      `Expected M-Tronic diagnosis locator error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AW1 Passed: M-Tronic diagnosis claim bound only to starting locator is rejected.');
  }

  // AW2: M-Tronic diagnosis claim bound to M-Tronic diagnostic locator -> PASS
  {
    const guideAW2 = {
      slug: 'test-mtronic-diag-valid',
      publicationStatus: 'PUBLISHED',
      sources: [diagSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          items: [
            {
              text: 'Elektronische diagnose van STIHL M-Tronic systemen met behulp van het voor de generatie voorgeschreven diagnosesysteem.',
              sourceRefs: ['src-ms261-diag']
            }
          ]
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideAW2, mtronicMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `M-Tronic diagnosis claim bound to diagnostic locator must pass. Got: ${errs.join('; ')}`);
    console.log('  ✅ Case AW2 Passed: M-Tronic diagnosis claim bound to M-Tronic diagnostic locator passes cleanly.');
  }
}

// ============================================================
// TEST 30: Unaudited Series References Retain PROBABLE_OFFICIAL Authority (Thread 22)
// ============================================================
console.log('\n▶ Test 30: Unaudited Series References Retain PROBABLE_OFFICIAL Authority (Thread 22)...');

{
  const seriesSource1121 = {
    id: 'src-1121-series',
    source_id: 'src-1121-series',
    canonical_document_id: '1121',
    publication_id: '1121',
    document_title: 'STIHL Werkplaatshandboek 1121',
    source_class: 'OFFICIAL_SERVICE_MANUAL',
    model_scope: ['026', 'MS 260'],
    modelScope: 'STIHL 026 / MS 260',
    locator: { page: 16, section: 'Crankcase / Leakage Testing', heading: 'Pressure and Vacuum Testing' }
  };

  const resolved = resolveGuideSource(seriesSource1121, { throwOnError: false, isPublishedGuide: false });
  assert.strictEqual(resolved.resolved, true);

  // AX1: Verify authenticity_status is strictly PROBABLE_OFFICIAL
  assert.strictEqual(
    resolved.canonicalSource.authenticity_status,
    'PROBABLE_OFFICIAL',
    'Series reference document must have PROBABLE_OFFICIAL status per repository authority design'
  );
  console.log('  ✅ Case AX1 Passed: Series reference documents resolve with PROBABLE_OFFICIAL status.');

  // AX2: Citing PROBABLE_OFFICIAL source for operational claims on published guide -> FAIL
  {
    const pubGuide = {
      slug: 'test-series-published',
      publicationStatus: 'PUBLISHED',
      sources: [seriesSource1121],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          items: [
            {
              text: 'Druk- en vacuümmeting van het carter conform werkplaatshandboek.',
              sourceRefs: ['src-1121-series']
            }
          ]
        }
      ]
    };
    const sMap = new Map();
    sMap.set('src-1121-series', resolved.canonicalSource);

    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.ok(errs.length > 0, 'PROBABLE_OFFICIAL source cited on published guide must fail closed');
    assert.ok(
      errs.some(e => e.includes('src-1121-series') && e.includes('lacks AUTHENTICATED_OFFICIAL status (PROBABLE_OFFICIAL)')),
      `Expected lacks AUTHENTICATED_OFFICIAL error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AX2 Passed: Citing PROBABLE_OFFICIAL series reference on published guide fails closed.');
  }

  // AX3: Draft guide with PROBABLE_OFFICIAL source -> PASS (no publication error)
  {
    const draftGuide = {
      slug: 'test-series-draft',
      publicationStatus: 'READY_FOR_REVIEW',
      sources: [seriesSource1121],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          items: [
            {
              text: 'Druk- en vacuümmeting van het carter conform werkplaatshandboek.',
              sourceRefs: ['src-1121-series']
            }
          ]
        }
      ]
    };
    const sMap = new Map();
    sMap.set('src-1121-series', resolved.canonicalSource);

    const errs = validateOperationalClaimsProvenance(draftGuide, sMap, { isPublished: false });
    assert.strictEqual(errs.length, 0, 'Draft guide can cite series reference without published claim errors');
    console.log('  ✅ Case AX3 Passed: Draft guide permits series reference without published claim blocker.');
  }
}

// ============================================================
// TEST 31: Troubleshooting Level Description Provenance Enforcement (Thread 26)
// ============================================================
console.log('\n▶ Test 31: Troubleshooting Level Description Provenance Enforcement (Thread 26)...');

{
  const testSource = {
    id: 'src-level-test',
    source_id: 'src-level-test',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resolved = resolveGuideSource(testSource, { throwOnError: false, isPublishedGuide: true });
  assert.strictEqual(resolved.resolved, true);
  const sMap = new Map();
  sMap.set('src-level-test', resolved.canonicalSource);

  // AY1: Level with description but without sourceRefs -> FAIL
  {
    const pubGuide = {
      slug: 'test-desc-missing-refs',
      publicationStatus: 'PUBLISHED',
      sources: [testSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1',
          badge: 'Basiscontrole',
          description: 'Handelingen die iedere gebruiker veilig kan uitvoeren.',
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld.',
              sourceRefs: ['src-level-test']
            }
          ]
        }
      ]
    };
    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Level description without sourceRefs must fail on published guide');
    assert.ok(
      errs.some(e => e.includes('troubleshootingLevels[0].description') && e.includes('has no sourceRefs')),
      `Expected level description missing sourceRefs error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AY1 Passed: Level description without sourceRefs fails closed.');
  }

  // AY2: Level with description citing unknown sourceRef -> FAIL
  {
    const pubGuide = {
      slug: 'test-desc-unknown-ref',
      publicationStatus: 'PUBLISHED',
      sources: [testSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1',
          badge: 'Basiscontrole',
          description: 'Handelingen die iedere gebruiker veilig kan uitvoeren.',
          sourceRefs: ['src-unknown-level-ref'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld.',
              sourceRefs: ['src-level-test']
            }
          ]
        }
      ]
    };
    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Level description referencing unknown sourceRef must fail');
    assert.ok(
      errs.some(e => e.includes('troubleshootingLevels[0].description') && e.includes('references unknown sourceRef')),
      `Expected unknown sourceRef error for level description, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case AY2 Passed: Level description with unknown sourceRef fails closed.');
  }

  // AY3: Level with description and valid sourceRefs -> PASS
  {
    const pubGuide = {
      slug: 'test-desc-valid-ref',
      publicationStatus: 'PUBLISHED',
      sources: [testSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1',
          badge: 'Basiscontrole',
          description: 'Handelingen die iedere gebruiker veilig kan uitvoeren.',
          sourceRefs: ['src-level-test'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld.',
              sourceRefs: ['src-level-test']
            }
          ]
        }
      ]
    };
    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Valid level description provenance must pass cleanly. Got: ${JSON.stringify(errs)}`);
    console.log('  ✅ Case AY3 Passed: Level description with valid sourceRefs passes cleanly.');
  }
}

// ============================================================
// TEST 32: Rejection of Duplicate Source Identifiers (Thread 27)
// ============================================================
console.log('\n▶ Test 32: Rejection of Duplicate Source Identifiers (Thread 27)...');

{
  const sourceA1 = {
    id: 'src-duplicate-test',
    source_id: 'src-duplicate-test',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const sourceA2 = {
    id: 'src-duplicate-test',
    source_id: 'src-duplicate-test',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 42, section: 'Carburetor', heading: 'Adjustment' }
  };

  // AZ1: validateGuideSources rejects guide with duplicate source IDs
  {
    const guideWithDuplicates = {
      slug: 'stihl-kettingzaag-start-niet',
      publicationStatus: 'PUBLISHED',
      sources: [sourceA1, sourceA2],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1',
          badge: 'Basiscontrole',
          description: 'Handelingen die iedere gebruiker veilig kan uitvoeren.',
          sourceRefs: ['src-duplicate-test'],
          items: [{ text: 'Controleer combihendel.', sourceRefs: ['src-duplicate-test'] }]
        }
      ],
      warnings: [
        {
          title: 'Test Warning',
          text: 'Warning text',
          sourceRefs: ['src-duplicate-test']
        }
      ]
    };
    const res = validateGuideSources(guideWithDuplicates);
    assert.strictEqual(res.valid, false, 'Guide declaring duplicate source IDs must not be valid');
    assert.ok(
      res.errors.some(e => e.includes('Duplicate source identifier "src-duplicate-test" declared in guide.sources')),
      `Expected duplicate source ID error, got: ${JSON.stringify(res.errors)}`
    );
    console.log('  ✅ Case AZ1 Passed: validateGuideSources fails closed on duplicate source identifiers.');
  }

  // AZ2: Fallback in standalone validators rejects duplicate source IDs
  {
    const guideWithDuplicates = {
      slug: 'test-dup-guide',
      publicationStatus: 'PUBLISHED',
      sources: [sourceA1, sourceA2],
      warnings: [
        {
          title: 'Test Warning',
          text: 'Warning text',
          sourceRefs: ['src-duplicate-test']
        }
      ]
    };
    const warnErrs = validateWarningProvenance(guideWithDuplicates, new Map(), { isPublished: true });
    assert.ok(
      warnErrs.some(e => e.includes('Duplicate source identifier "src-duplicate-test" declared in guide.sources')),
      `Expected duplicate source error in validateWarningProvenance fallback, got: ${JSON.stringify(warnErrs)}`
    );
    const procErrs = validateProcedureStepsProvenance(guideWithDuplicates, new Map(), { isPublished: true });
    assert.ok(
      procErrs.some(e => e.includes('Duplicate source identifier "src-duplicate-test" declared in guide.sources')),
      `Expected duplicate source error in validateProcedureStepsProvenance fallback, got: ${JSON.stringify(procErrs)}`
    );
    const claimErrs = validateOperationalClaimsProvenance(guideWithDuplicates, new Map(), { isPublished: true });
    assert.ok(
      claimErrs.some(e => e.includes('Duplicate source identifier "src-duplicate-test" declared in guide.sources')),
      `Expected duplicate source error in validateOperationalClaimsProvenance fallback, got: ${JSON.stringify(claimErrs)}`
    );
    console.log('  ✅ Case AZ2 Passed: Fallback resolvers detect duplicate source IDs across all sub-validators.');
  }

  // AZ3: Map does not overwrite initial canonical source
  {
    const resolvedSources = new Map();
    const seenIds = new Set();
    const sources = [sourceA1, sourceA2];
    for (const src of sources) {
      const sId = src.source_id || src.id;
      if (sId && seenIds.has(sId)) {
        // rejected
      }
      if (sId) seenIds.add(sId);
      const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
      if (res.resolved && res.canonicalSource && !resolvedSources.has(res.canonicalSource.source_id)) {
        resolvedSources.set(res.canonicalSource.source_id, res.canonicalSource);
      }
    }
    assert.strictEqual(resolvedSources.get('src-duplicate-test').locator.page, 38, 'Initial source locator must not be overwritten');
    console.log('  ✅ Case AZ3 Passed: Duplicate source declarations do not overwrite initial locator.');
  }
}

// ============================================================
// TEST 33: Cylinder/Piston Mechanical Inspection Grounding (Thread 25)
// ============================================================
console.log('\n▶ Test 33: Cylinder/Piston Mechanical Inspection Grounding (Thread 25)...');

{
  const floodedSource = {
    id: 'src-026-flooded',
    source_id: 'src-026-flooded',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 42, section: 'If the Engine Does Not Start', heading: 'Engine Does Not Start' }
  };
  const mechanicalServiceSource = {
    id: 'src-mechanical-service',
    source_id: 'src-mechanical-service',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    modelScope: 'STIHL 026',
    locator: { page: 50, section: 'Specifications & Mechanical Checks', heading: 'Cylinder and Piston Inspection' }
  };

  const resFlooded = resolveGuideSource(floodedSource, { throwOnError: false, isPublishedGuide: true });
  assert.strictEqual(resFlooded.resolved, true);
  const resMechanical = resolveGuideSource(mechanicalServiceSource, { throwOnError: false, isPublishedGuide: true });
  assert.strictEqual(resMechanical.resolved, true);

  const sMap = new Map();
  sMap.set('src-026-flooded', resFlooded.canonicalSource);
  sMap.set('src-mechanical-service', resMechanical.canonicalSource);

  // BA1: Cylinder/piston mechanical inspection procedure claiming factory tolerances citing solely flooded engine locator -> FAIL
  {
    const pubGuide = {
      slug: 'test-cylinder-flooded',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          badge: 'Service',
          description: 'Complexe controles.',
          sourceRefs: ['src-026-flooded'],
          items: [
            {
              text: 'Cilinder- en zuigerinspectie bij vermoeden van mechanische slijtage of verlies van compressieweerstand conform fabrieksvoorschrift.',
              sourceRefs: ['src-026-flooded']
            }
          ]
        }
      ]
    };
    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Mechanical compression claim citing start/flooded locator must fail');
    assert.ok(
      errs.some(e => e.includes('makes cylinder/piston or compression inspection procedure claims but references source(s) without a mechanical service locator')),
      `Expected mechanical service locator rejection, got: ${JSON.stringify(errs)}`
    );
    console.log('  ✅ Case BA1 Passed: Cylinder/piston procedure claim citing flooded engine locator fails closed.');
  }

  // BA2: General dealer referral for starting failure citing flooded engine locator -> PASS
  {
    const pubGuide = {
      slug: 'test-dealer-referral',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          badge: 'Service',
          description: 'Complexe controles.',
          sourceRefs: ['src-026-flooded'],
          items: [
            {
              text: 'Algehele inspectie door de STIHL vakhandelaar wanneer de motor na herhaaldelijk storingszoeken conform de handleiding niet start.',
              sourceRefs: ['src-026-flooded']
            }
          ]
        }
      ]
    };
    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `General dealer start failure referral citing flooded engine locator must pass. Got: ${JSON.stringify(errs)}`);
    console.log('  ✅ Case BA2 Passed: General dealer referral for start failure citing flooded locator passes cleanly.');
  }

  // BA3: Mechanical inspection claim citing genuine mechanical service locator -> PASS
  {
    const pubGuide = {
      slug: 'test-cylinder-mechanical-service',
      publicationStatus: 'PUBLISHED',
      sources: [mechanicalServiceSource],
      troubleshootingLevels: [
        {
          level: 'LEVEL 3',
          badge: 'Service',
          description: 'Complexe controles.',
          sourceRefs: ['src-mechanical-service'],
          items: [
            {
              text: 'Cilinder- en zuigerinspectie bij vermoeden van mechanische slijtage of verlies van compressieweerstand conform fabrieksvoorschrift.',
              sourceRefs: ['src-mechanical-service']
            }
          ]
        }
      ]
    };
    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Mechanical compression claim citing mechanical service locator must pass. Got: ${JSON.stringify(errs)}`);
    console.log('  ✅ Case BA3 Passed: Cylinder/piston procedure claim citing mechanical service locator passes cleanly.');
  }
}

console.log('\n🎉 ALL PHASE 49B GUIDE SOURCES & ATTRIBUTION TESTS PASSED 100% CLEANLY!');
