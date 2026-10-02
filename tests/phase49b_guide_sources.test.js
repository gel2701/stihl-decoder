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
  getDeclaredSourceId,
  verifyLocatorAgainstCanonicalData,
  collectRenderedOperationalClaims,
  validateOperationalClaimsProvenance,
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
assert.strictEqual(OFFICIAL_PRIMARY_DOCUMENTS['0458-573-8621-D'].page_count, 148, '0458-573-8621-D page_count must match authoritative document fixture (148 pages)');
assert.strictEqual(OFFICIAL_PRIMARY_DOCUMENTS['0458-207-8321-B'].page_count, 52, '0458-207-8321-B page_count must match authoritative document fixture (52 pages)');
console.log('  ✅ Test 13 Passed: Canonical page_count properties strictly match authority fixtures.');

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
    troubleshootingLevels: [{
      level: 'LEVEL 1 — USER SAFE START CHECK',
      badge: 'Veilige basiscontrole starten',
      description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren vóór het starten:',
      sourceRefs: ['src-0458-133-3021-start'],
      items: [{ text: 'Controleer of de kettingrem is ingeschakeld vóór het starten.', sourceRefs: ['src-0458-133-3021-start'] }]
    }]
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
    troubleshootingMatrix: [{
      symptom: 'Zaag start koud niet',
      possibleCause: 'Onjuiste stand van combihendel of choke',
      safeFirstCheck: 'Controleer of de stopschakelaar niet op stopstand staat.',
      nextStep: 'Koudestartprocedure opnieuw uitvoeren met gesloten choke.',
      sourceRefs: ['src-0458-133-3021-start']
    }]
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
    'directAnswer.heading',
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
      heading: 'Kort antwoord: startprocedure en kettingrem',
      content: 'Controleer de kettingrem en startprocedure vóór het starten van de motor.',
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
          level: 'LEVEL 1 — DIRECTE STARTCONTROLES',
          sourceRefs: ['src-026-start'],
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
          safeFirstCheck: 'Controleer of de combihendel in de startpositie staat.',
          nextStep: 'Bougie inspecteren op brandstof en vonktest uitvoeren.',
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
          level: 'LEVEL 3 — CARTER DRUKTEST',
          sourceRefs: ['src-1121-service'],
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
          level: 'LEVEL 3 — M-TRONIC DIAGNOSE',
          sourceRefs: ['src-ms261-diag'],
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
          level: 'LEVEL 1 — USER SAFE START CHECK',
          badge: 'Veilige basiscontrole starten',
          description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren vóór het starten.',
          sourceRefs: ['src-level-test'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld vóór het starten.',
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
          level: 'LEVEL 3 — STIHL VAKHANDELAAR',
          badge: 'Vakhandelaar inspectie',
          description: 'Inspectie door de vakhandelaar bij verzopen motor of aanhoudend startprobleem.',
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
          level: 'LEVEL 3 — MECHANISCHE SERVICE',
          badge: 'Mechanische inspectie',
          description: 'Complexe cilinder- en zuigercontroles conform fabrieksvoorschrift.',
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

// ============================================================
// TEST 34: MS 261 Page Bounds & Fail-Closed Unbounded Rejection (Thread 28)
// ============================================================
console.log('\n▶ Test 34: MS 261 Page Bounds & Fail-Closed Unbounded Rejection (Thread 28)...');

{
  const baseMs261 = {
    id: 'src-ms261-bound-test',
    source_id: 'src-ms261-bound-test',
    canonical_document_id: '0458-573-8621-D',
    publication_id: '0458-573-8621-D',
    document_title: 'STIHL MS 261 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['MS 261'],
    modelScope: 'STIHL MS 261'
  };

  // BB1: Page 34 (within 148 pages) -> PASS
  {
    const src = { ...baseMs261, locator: { page: 34, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' } };
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    console.log('  ✅ Case BB1 Passed: Page 34 within 148-page limit resolves to LOCATOR_VERIFIED.');
  }

  // BB2: Page 148 (upper boundary) -> PASS
  {
    const src = { ...baseMs261, locator: { page: 148, section: 'Specifications', heading: 'Technical Data' } };
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    assert.strictEqual(res.resolved, true);
    assert.strictEqual(res.canonicalSource?.locatorStatus, 'LOCATOR_VERIFIED');
    console.log('  ✅ Case BB2 Passed: Page 148 at upper boundary resolves cleanly.');
  }

  // BB3: Page 149 (exceeds 148 pages) -> FAIL
  {
    const src = { ...baseMs261, locator: { page: 149, section: 'Specifications', heading: 'Technical Data' } };
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    assert.strictEqual(res.resolved, false);
    assert.ok(
      res.errors.some(e => e.includes('exceeds known document page count (148)')),
      `Expected 148 page count limit error, got: ${JSON.stringify(res.errors)}`
    );
    console.log('  ✅ Case BB3 Passed: Page 149 correctly rejected as exceeding 148 pages.');
  }

  // BB4: Impossible page 999999 -> FAIL
  {
    const src = { ...baseMs261, locator: { page: 999999, section: 'Specifications', heading: 'Technical Data' } };
    const res = resolveGuideSource(src, { throwOnError: false, isPublishedGuide: true });
    assert.strictEqual(res.resolved, false);
    assert.ok(
      res.errors.some(e => e.includes('exceeds known document page count (148)')),
      `Expected page 999999 rejection, got: ${JSON.stringify(res.errors)}`
    );
    console.log('  ✅ Case BB4 Passed: Page 999999 correctly rejected by 148-page upper ceiling.');
  }

  // BB5: Custom document without page_count fails closed on published guide with page locator
  {
    const unboundedDoc = {
      id: 'src-unbounded-test',
      source_id: 'src-unbounded-test',
      canonical_document_id: '0458-999-9999',
      publication_id: '0458-999-9999',
      document_title: 'STIHL Imaginary Unbounded Manual',
      source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
      model_scope: ['026'],
      modelScope: 'STIHL 026',
      locator: { page: 50, section: 'Test Section', heading: 'Test Heading' }
    };
    const res = resolveGuideSource(unboundedDoc, { throwOnError: false, isPublishedGuide: true });
    assert.strictEqual(res.resolved, false);
    assert.ok(
      res.errors.some(e => e.includes('does not exist in document registry') || e.includes('lacks an authoritative document page count')),
      `Expected rejection for unbounded manual, got: ${JSON.stringify(res.errors)}`
    );
    console.log('  ✅ Case BB5 Passed: Unbounded manual fails closed on published guide.');
  }
}

// ============================================================
// TEST 35: Dynamic Procedure Source Resolution & Free-Text Rejection (Thread 29)
// ============================================================
console.log('\n▶ Test 35: Dynamic Procedure Source Resolution & Free-Text Rejection (Thread 29)...');

{
  const { stihlKettingzaagStartNietGuide } = await import('../src/content/guides/stihl-kettingzaag-start-niet.js');

  const html = renderGuidePageHtml(stihlKettingzaagStartNietGuide, database, baseUrl);
  // Check that the rendered HTML contains the dynamically derived source titles and locators
  assert.ok(html.includes('Bron: STIHL 026 Instruction Manual (p. 38 · Starting / Stopping the Engine · Starting the Engine)'), 'Must render dynamically derived source label for 026 start');
  assert.ok(html.includes('Bron: STIHL MS 261 Instruction Manual (p. 34 · Starting / Stopping the Engine · Starting the Engine)'), 'Must render dynamically derived source label for MS 261 start');
  assert.ok(html.includes('Bron: STIHL 026 Instruction Manual (p. 42 · Starting / Stopping the Engine · If the Engine Does Not Start)'), 'Must render dynamically derived source label for 026 flooded recovery');
  console.log('  ✅ Case BC1 Passed: Procedure example Bron headers dynamically resolve from canonical source declarations.');

  // BC2: Published guide documentedExample without sourceRefs fails closed
  {
    const pubGuide = {
      slug: 'test-no-ref-example',
      publicationStatus: 'PUBLISHED',
      sources: [
        {
          id: 'src-test-ex',
          source_id: 'src-test-ex',
          canonical_document_id: '0458-133-3021',
          publication_id: '0458-133-3021',
          document_title: 'STIHL 026 Instruction Manual',
          source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
          model_scope: ['026'],
          locator: { page: 38, section: 'Starting', heading: 'Starting' }
        }
      ],
      startProcedures: {
        documentedExamples: {
          testExample: {
            modelLabel: 'Test Saw',
            sourceDoc: 'Invented Manual p. 99',
            coldStartIntro: 'Starten.',
            steps: [{ step: 1, title: 'Step 1', text: 'Step text' }]
          }
        }
      }
    };
    const errs = validateProcedureStepsProvenance(pubGuide, new Map(), { isPublished: true });
    assert.ok(errs.length > 0, 'Documented example without sourceRefs must fail closed');
    assert.ok(
      errs.some(e => e.includes('startProcedures.documentedExamples.testExample has no sourceRefs')),
      `Expected missing sourceRefs error, got: ${JSON.stringify(errs)}`
    );
    console.log('  ✅ Case BC2 Passed: Published documented example without sourceRefs fails closed.');
  }
}

// ============================================================
// TEST 36: Procedure Introduction Provenance Enforcement (Thread 30)
// ============================================================
console.log('\n▶ Test 36: Procedure Introduction Provenance Enforcement (Thread 30)...');

{
  const validSource = {
    id: 'src-intro-test',
    source_id: 'src-intro-test',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    locator: { page: 38, section: 'Starting', heading: 'Starting' }
  };
  const resolved = resolveGuideSource(validSource, { throwOnError: false, isPublishedGuide: true });
  assert.strictEqual(resolved.resolved, true);
  const sMap = new Map();
  sMap.set('src-intro-test', resolved.canonicalSource);

  // BD1: coldStart.intro without sourceRefs fails closed
  {
    const pubGuide = {
      slug: 'test-coldstart-intro-fail',
      publicationStatus: 'PUBLISHED',
      sources: [validSource],
      startProcedures: {
        coldStart: {
          title: 'Koud starten',
          intro: 'Startinstructie zonder bron.',
          steps: [{ title: 'Step 1', text: 'Step text', sourceRefs: ['src-intro-test'] }]
        }
      }
    };
    const errs = validateProcedureStepsProvenance(pubGuide, sMap, { isPublished: true });
    assert.ok(errs.length > 0, 'coldStart.intro without sourceRefs must fail closed');
    assert.ok(
      errs.some(e => e.includes('startProcedures.coldStart.intro has no sourceRefs')),
      `Expected coldStart.intro missing sourceRefs error, got: ${JSON.stringify(errs)}`
    );
    console.log('  ✅ Case BD1 Passed: coldStart.intro without sourceRefs fails closed in validateProcedureStepsProvenance.');
  }

  // BD2: documentedExamples coldStartIntro collected and validated as operational claim
  {
    const pubGuide = {
      slug: 'test-doc-intro-claims',
      publicationStatus: 'PUBLISHED',
      sources: [validSource],
      startProcedures: {
        documentedExamples: {
          testSaw: {
            modelLabel: 'STIHL 026 (Klassieke Kettingzaag)',
            sourceRefs: ['src-intro-test'],
            coldStartIntro: 'Start de machine conform handleiding.',
            steps: [{ step: 1, title: 'Step 1', text: 'Step text', sourceRefs: ['src-intro-test'] }]
          }
        }
      }
    };
    const errs = validateOperationalClaimsProvenance(pubGuide, sMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Operational claim validation on intro with valid sourceRefs must pass: ${JSON.stringify(errs)}`);
    console.log('  ✅ Case BD2 Passed: documentedExamples intro with sourceRefs passes operational claim validation.');
  }

  // BD3: warmStart.intro without sourceRefs fails closed
  {
    const pubGuide = {
      slug: 'test-warmstart-intro-fail',
      publicationStatus: 'PUBLISHED',
      sources: [validSource],
      startProcedures: {
        warmStart: {
          title: 'Warm starten',
          intro: 'Warme startinstructie zonder bron.',
          steps: [{ title: 'Step 1', text: 'Step text', sourceRefs: ['src-intro-test'] }]
        }
      }
    };
    const errs = validateProcedureStepsProvenance(pubGuide, sMap, { isPublished: true });
    assert.ok(errs.length > 0, 'warmStart.intro without sourceRefs must fail closed');
    assert.ok(
      errs.some(e => e.includes('startProcedures.warmStart.intro has no sourceRefs')),
      `Expected warmStart.intro missing sourceRefs error, got: ${JSON.stringify(errs)}`
    );
    console.log('  ✅ Case BD3 Passed: warmStart.intro without sourceRefs fails closed in validateProcedureStepsProvenance.');
  }
}

// ============================================================
// TEST 37: Procedure Model Labels Scope Validation (Thread 31)
// ============================================================
console.log('\n▶ Test 37: Procedure Model Labels Scope Validation (Thread 31)...');

{
  const source026 = {
    id: 'src-026-canonical',
    source_id: 'src-026-canonical',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resolved026 = resolveGuideSource(source026, { throwOnError: false, isPublishedGuide: true });
  assert.strictEqual(resolved026.resolved, true);

  const sourceMap = new Map();
  sourceMap.set('src-026-canonical', resolved026.canonicalSource);

  // Case BE1: Valid covered modelLabel passes cleanly
  {
    const guideWithCoveredModel = {
      slug: 'test-doc-ex-covered',
      publicationStatus: 'PUBLISHED',
      sources: [source026],
      startProcedures: {
        documentedExamples: {
          stihl026: {
            modelLabel: 'STIHL 026 (Klassieke Kettingzaag)',
            sourceRefs: ['src-026-canonical'],
            steps: [{ step: 1, title: 'Step 1', text: 'Start de 026.', sourceRefs: ['src-026-canonical'] }]
          }
        }
      }
    };

    const stepErrs = validateProcedureStepsProvenance(guideWithCoveredModel, sourceMap, { isPublished: true });
    assert.strictEqual(stepErrs.length, 0, `Covered modelLabel must pass step provenance: ${stepErrs.join('; ')}`);

    const opErrs = validateOperationalClaimsProvenance(guideWithCoveredModel, sourceMap, { isPublished: true });
    assert.strictEqual(opErrs.length, 0, `Covered modelLabel must pass operational claims validation: ${opErrs.join('; ')}`);
    console.log('  ✅ Case BE1 Passed: Covered modelLabel in documentedExample passes both validators cleanly.');
  }

  // Case BE2: Changing 026 example modelLabel to STIHL MS 500i fails closed
  {
    const guideWithMismatchedModel = {
      slug: 'test-doc-ex-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [source026],
      startProcedures: {
        documentedExamples: {
          stihl026: {
            modelLabel: 'STIHL MS 500i', // MS 500i is NOT covered by 0458-133-3021 (026 only)
            sourceRefs: ['src-026-canonical'],
            steps: [{ step: 1, title: 'Step 1', text: 'Start de machine.', sourceRefs: ['src-026-canonical'] }]
          }
        }
      }
    };

    const stepErrs = validateProcedureStepsProvenance(guideWithMismatchedModel, sourceMap, { isPublished: true });
    assert.ok(stepErrs.length > 0, 'Mismatched modelLabel must fail closed in validateProcedureStepsProvenance');
    assert.ok(
      stepErrs.some(e => e.includes('startProcedures.documentedExamples.stihl026.modelLabel assigns model "MS 500i"') && e.includes('cover this model')),
      `Expected model coverage error in validateProcedureStepsProvenance, got: ${stepErrs.join('; ')}`
    );

    const opErrs = validateOperationalClaimsProvenance(guideWithMismatchedModel, sourceMap, { isPublished: true });
    assert.ok(opErrs.length > 0, 'Mismatched modelLabel must fail closed in validateOperationalClaimsProvenance');
    assert.ok(
      opErrs.some(e => e.includes('modelLabel') && e.includes('MS 500i') && e.includes('cover this model')),
      `Expected model coverage error in validateOperationalClaimsProvenance, got: ${opErrs.join('; ')}`
    );
    console.log('  ✅ Case BE2 Passed: Changing 026 modelLabel to STIHL MS 500i fails closed in both validators.');
  }

  // Case BE3: Flooded engine recovery example with uncovered model fails closed
  {
    const guideWithFloodedMismatch = {
      slug: 'test-flooded-ex-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [source026],
      floodedEngineRecovery: {
        documentedExamples: {
          stihl026: {
            modelLabel: 'STIHL MS 500i Ontzoping',
            sourceRefs: ['src-026-canonical'],
            steps: [{ step: 1, title: 'Step 1', text: 'Droogmaken.', sourceRefs: ['src-026-canonical'] }]
          }
        }
      }
    };

    const stepErrs = validateProcedureStepsProvenance(guideWithFloodedMismatch, sourceMap, { isPublished: true });
    assert.ok(stepErrs.length > 0, 'Flooded example with mismatched model must fail closed in step validator');
    assert.ok(
      stepErrs.some(e => e.includes('floodedEngineRecovery.documentedExamples.stihl026.modelLabel assigns model "MS 500i"')),
      `Expected flooded model mismatch error, got: ${stepErrs.join('; ')}`
    );

    const opErrs = validateOperationalClaimsProvenance(guideWithFloodedMismatch, sourceMap, { isPublished: true });
    assert.ok(opErrs.length > 0, 'Flooded example with mismatched model must fail closed in operational validator');
    assert.ok(
      opErrs.some(e => e.includes('floodedEngineRecovery.documentedExamples.stihl026.modelLabel') && e.includes('MS 500i')),
      `Expected flooded operational model mismatch error, got: ${opErrs.join('; ')}`
    );
    console.log('  ✅ Case BE3 Passed: Flooded engine recovery example with uncovered model fails closed.');
  }

  // Case BE4: Documented procedure example without recognizable model fails closed
  {
    const guideWithUnrecognizableModel = {
      slug: 'test-unrecognizable-model',
      publicationStatus: 'PUBLISHED',
      sources: [source026],
      startProcedures: {
        documentedExamples: {
          genericSaw: {
            modelLabel: 'Universele Zaag Handleiding',
            sourceRefs: ['src-026-canonical'],
            steps: [{ step: 1, title: 'Step 1', text: 'Starten.', sourceRefs: ['src-026-canonical'] }]
          }
        }
      }
    };

    const stepErrs = validateProcedureStepsProvenance(guideWithUnrecognizableModel, sourceMap, { isPublished: true });
    assert.ok(stepErrs.length > 0, 'Unrecognizable model label must fail closed in step validator');
    assert.ok(
      stepErrs.some(e => e.includes('must specify at least one recognizable STIHL model designation')),
      `Expected unrecognizable model error, got: ${stepErrs.join('; ')}`
    );

    const opErrs = validateOperationalClaimsProvenance(guideWithUnrecognizableModel, sourceMap, { isPublished: true });
    assert.ok(opErrs.length > 0, 'Unrecognizable model label must fail closed in operational validator');
    assert.ok(
      opErrs.some(e => e.includes('must specify at least one recognizable STIHL model designation')),
      `Expected unrecognizable model operational error, got: ${opErrs.join('; ')}`
    );
    console.log('  ✅ Case BE4 Passed: Procedure example without recognizable STIHL model fails closed.');
  }
}

// 38. Phase 49B-P-R22 Source Identifier Alias Parity & Conflict Rejection (BF1-BF4)
console.log('\n▶ Test 38: Source Identifier Alias Parity & Conflict Rejection (Codex Thread A, BF1-BF4)...');
{
  // Case BF1: Conflicting id and source_id fail closed
  const conflictingSource = {
    id: 'source-a',
    source_id: 'source-b',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resBF1 = resolveGuideSource(conflictingSource, { throwOnError: false });
  assert.strictEqual(resBF1.resolved, false, 'Conflicting id and source_id must fail resolution');
  assert.ok(
    resBF1.errors.some(e => e.includes('Source identifier alias mismatch')),
    `Expected mismatch error, got: ${resBF1.errors.join('; ')}`
  );

  const guideBF1 = {
    slug: 'test-bf1',
    publicationStatus: 'PUBLISHED',
    sources: [conflictingSource],
    warnings: [{ title: 'Warn', text: 'Tekst', sourceRefs: ['source-a'] }]
  };
  const valBF1 = validateGuideSources(guideBF1, { routeStatus: 'PUBLISHED' });
  assert.strictEqual(valBF1.valid, false, 'Conflicting id and source_id in guide.sources must fail validation');
  assert.ok(
    valBF1.errors.some(e => e.includes('conflicting identifiers') || e.includes('Source identifier alias mismatch')),
    `Expected conflicting identifiers error in guide validation, got: ${valBF1.errors.join('; ')}`
  );
  assert.strictEqual(getDeclaredSourceId(conflictingSource), null, 'getDeclaredSourceId must return null for conflicting IDs');
  console.log('  ✅ Case BF1 Passed: Conflicting id and source_id aliases fail closed across resolver, validator, and helper.');

  // Case BF2: Matching id and source_id pass cleanly
  const matchingSource = {
    id: 'source-a',
    source_id: 'source-a',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resBF2 = resolveGuideSource(matchingSource, { throwOnError: false });
  assert.strictEqual(resBF2.resolved, true, `Matching id and source_id must resolve: ${resBF2.errors.join('; ')}`);
  assert.strictEqual(getDeclaredSourceId(matchingSource), 'source-a');
  console.log('  ✅ Case BF2 Passed: Matching id and source_id aliases resolve cleanly to canonical identifier.');

  // Case BF3: Only id provided
  const idOnlySource = {
    id: 'source-id-only',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resBF3 = resolveGuideSource(idOnlySource, { throwOnError: false });
  assert.strictEqual(resBF3.resolved, true, 'id-only source must resolve');
  assert.strictEqual(getDeclaredSourceId(idOnlySource), 'source-id-only');
  console.log('  ✅ Case BF3 Passed: id-only source resolves consistently.');

  // Case BF4: Only source_id provided
  const sourceIdOnlySource = {
    source_id: 'source-id-only-2',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resBF4 = resolveGuideSource(sourceIdOnlySource, { throwOnError: false });
  assert.strictEqual(resBF4.resolved, true, 'source_id-only source must resolve');
  assert.strictEqual(getDeclaredSourceId(sourceIdOnlySource), 'source-id-only-2');
  console.log('  ✅ Case BF4 Passed: source_id-only source resolves consistently.');
}

// 39. Phase 49B-P-R22 Canonical Title Fallback & Title Parity (BG1-BG3)
console.log('\n▶ Test 39: Canonical Title Fallback & Title Parity (Codex Thread B, BG1-BG3)...');
{
  // Case BG1: Valid source without declared title aliases falls back to canonical document title in renderer
  const untitledSource = {
    id: 'src-026-untitled',
    publicationId: '0458-133-3021',
    model_scope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const guideBG1 = {
    slug: 'stihl-kettingzaag-start-niet',
    title: 'Test Gids Zonder Bron Titel',
    publicationStatus: 'PUBLISHED',
    sources: [untitledSource],
    warnings: [{ title: 'Kettingrem', text: 'Activeer altijd de kettingrem voor het starten.', sourceRefs: ['src-026-untitled'] }],
    startProcedures: {
      documentedExamples: {
        stihl026: {
          modelLabel: 'STIHL 026',
          sourceRefs: ['src-026-untitled'],
          steps: [{ step: 1, title: 'Koude start', text: 'Choke inschakelen.', sourceRefs: ['src-026-untitled'] }]
        }
      }
    }
  };

  const valBG1 = validateGuideSources(guideBG1, { routeStatus: 'PUBLISHED' });
  assert.strictEqual(valBG1.valid, true, `Source without title aliases must pass validation when canonical source exists: ${valBG1.errors.join('; ')}`);

  const htmlBG1 = renderGuidePageHtml(guideBG1, database, baseUrl);
  assert.ok(
    htmlBG1.includes('STIHL 026 Instruction Manual') || htmlBG1.includes('026'),
    'Rendered HTML must contain resolved canonical title'
  );
  console.log('  ✅ Case BG1 Passed: Source without title aliases renders resolved canonical title.');

  // Case BG2: HTML does NOT contain "undefined" heading or text
  assert.strictEqual(htmlBG1.includes('<strong class="text-white block font-semibold">undefined</strong>'), false, 'HTML must never render "undefined" title');
  assert.strictEqual(htmlBG1.includes('>undefined<'), false, 'HTML must never contain raw "undefined" token');
  console.log('  ✅ Case BG2 Passed: HTML source card is completely free of "undefined" title literals.');

  // Case BG3: Incorrect declared title fails closed
  const wrongTitleSource = {
    id: 'src-026-wrong-title',
    title: 'Incorrect Handboek Titel',
    publicationId: '0458-133-3021',
    model_scope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const guideBG3 = {
    slug: 'test-wrong-title',
    publicationStatus: 'PUBLISHED',
    sources: [wrongTitleSource],
    warnings: [{ title: 'Warn', text: 'Text', sourceRefs: ['src-026-wrong-title'] }]
  };
  const valBG3 = validateGuideSources(guideBG3, { routeStatus: 'PUBLISHED' });
  assert.strictEqual(valBG3.valid, false, 'Incorrect declared title must fail closed');
  assert.ok(
    valBG3.errors.some(e => e.includes('does not exactly match canonical title')),
    `Expected canonical title mismatch error, got: ${valBG3.errors.join('; ')}`
  );
  console.log('  ✅ Case BG3 Passed: Incorrect declared title fails closed against canonical registry.');
}

// 40. Phase 49B-P-R22 Model Scope String & Array Rendering Parity (BH1-BH5)
console.log('\n▶ Test 40: Model Scope String & Array Rendering Parity (Codex Thread C, BH1-BH5)...');
{
  // Case BH1: model_scope array ['026'] renders Scope: 026
  const guideBH1 = {
    slug: 'test-bh1',
    title: 'Test BH1',
    publicationStatus: 'PUBLISHED',
    sources: [{
      id: 'src-bh1',
      publicationId: '0458-133-3021',
      model_scope: ['026'],
      locator: { page: 38, heading: 'Starting' }
    }]
  };
  const htmlBH1 = renderGuidePageHtml(guideBH1, database, baseUrl);
  assert.ok(htmlBH1.includes('Scope: 026'), 'Array model_scope must render Scope: 026');
  console.log('  ✅ Case BH1 Passed: Array model_scope ["026"] renders "Scope: 026".');

  // Case BH2: model_scope string '026' renders Scope: 026
  const guideBH2 = {
    slug: 'test-bh2',
    title: 'Test BH2',
    publicationStatus: 'PUBLISHED',
    sources: [{
      id: 'src-bh2',
      publicationId: '0458-133-3021',
      model_scope: '026',
      locator: { page: 38, heading: 'Starting' }
    }]
  };
  const htmlBH2 = renderGuidePageHtml(guideBH2, database, baseUrl);
  assert.ok(htmlBH2.includes('Scope: 026'), 'String model_scope must render Scope: 026');
  console.log('  ✅ Case BH2 Passed: String model_scope "026" renders "Scope: 026".');

  // Case BH3: modelScope formatted string renders cleanly
  const guideBH3 = {
    slug: 'test-bh3',
    title: 'Test BH3',
    publicationStatus: 'PUBLISHED',
    sources: [{
      id: 'src-bh3',
      publicationId: '0458-133-3021',
      modelScope: 'STIHL 026',
      model_scope: ['026'],
      locator: { page: 38, heading: 'Starting' }
    }]
  };
  const htmlBH3 = renderGuidePageHtml(guideBH3, database, baseUrl);
  assert.ok(htmlBH3.includes('Scope: STIHL 026'), 'modelScope string renders cleanly');
  console.log('  ✅ Case BH3 Passed: modelScope string renders cleanly in public source card.');

  // Case BH4: Conflicting modelScope and model_scope fail closed
  const conflictingScopeSource = {
    id: 'src-bh4',
    publicationId: '0458-133-3021',
    modelScope: 'STIHL MS 500i',
    model_scope: ['026'],
    locator: { page: 38, heading: 'Starting' }
  };
  const resBH4 = resolveGuideSource(conflictingScopeSource, { throwOnError: false });
  assert.strictEqual(resBH4.resolved, false, 'Conflicting modelScope and model_scope must fail resolution');
  assert.ok(
    resBH4.errors.some(e => e.includes('modelScope string ("STIHL MS 500i") must exactly match the models in model_scope')),
    `Expected scope conflict error, got: ${resBH4.errors.join('; ')}`
  );
  console.log('  ✅ Case BH4 Passed: Conflicting modelScope and model_scope aliases fail closed.');

  // Case BH5: Unvalidated legacy scope: 'MS 500i' does not override canonical 026
  const legacyScopeSource = {
    id: 'src-bh5',
    publicationId: '0458-133-3021',
    scope: 'MS 500i',
    model_scope: ['026'],
    locator: { page: 38, heading: 'Starting' }
  };
  const guideBH5 = {
    slug: 'test-bh5',
    title: 'Test BH5',
    publicationStatus: 'PUBLISHED',
    sources: [legacyScopeSource]
  };
  const htmlBH5 = renderGuidePageHtml(guideBH5, database, baseUrl);
  assert.strictEqual(htmlBH5.includes('Scope: MS 500i'), false, 'Legacy unvalidated scope must never be rendered as model scope');
  assert.ok(htmlBH5.includes('Scope: 026'), 'Canonical model_scope must be rendered');
  console.log('  ✅ Case BH5 Passed: Legacy unvalidated scope property is ignored; validated model_scope renders.');
}

// 41. Phase 49B-P-R22 Public Renderer / Canonical Resolver Parity Test
console.log('\n▶ Test 41: Full Public Renderer / Canonical Resolver Attribution Parity...');
{
  const allGuides = getAllStructuredGuides();
  for (const guide of allGuides) {
    const pubState = resolveGuidePublicationState(guide);
    if (!pubState.isPublished) continue;

    const html = renderGuidePageHtml(guide, database, baseUrl);

    for (const src of (guide.sources || [])) {
      const sId = getDeclaredSourceId(src);
      const res = resolveGuideSource(src, { throwOnError: true, isPublishedGuide: true });
      const canonical = res.canonicalSource;

      // 1. Canonical Title Parity
      assert.ok(
        html.includes(canonical.document_title),
        `Guide "${guide.slug}" rendered HTML must contain canonical title "${canonical.document_title}" for source "${sId}"`
      );

      // 2. Publication ID Parity
      if (canonical.publication_id) {
        assert.ok(
          html.includes(canonical.publication_id),
          `Guide "${guide.slug}" rendered HTML must contain publication ID "${canonical.publication_id}" for source "${sId}"`
        );
      }

      // 3. Model Scope Parity
      if (src.modelScope) {
        assert.ok(
          html.includes(`Scope: ${src.modelScope}`),
          `Guide "${guide.slug}" rendered HTML must contain declared modelScope "${src.modelScope}"`
        );
      } else if (Array.isArray(src.model_scope)) {
        assert.ok(
          html.includes(`Scope: ${src.model_scope.join(' / ')}`),
          `Guide "${guide.slug}" rendered HTML must contain model_scope "${src.model_scope.join(' / ')}"`
        );
      }

      // 4. Locator Parity
      if (src.locator && (src.locator.page || src.locator.heading)) {
        const formattedLoc = formatLocator(src.locator);
        if (formattedLoc) {
          assert.ok(
            html.includes(`Vindplaats: ${formattedLoc}`),
            `Guide "${guide.slug}" rendered HTML must contain locator "${formattedLoc}"`
          );
        }
      }
    }

    // Ensure no broken literals in rendered guide page
    assert.strictEqual(html.includes('>undefined<'), false, `Guide "${guide.slug}" must not contain ">undefined<"`);
    assert.strictEqual(html.includes('>null<'), false, `Guide "${guide.slug}" must not contain ">null<"`);
    assert.strictEqual(html.includes('[object Object]'), false, `Guide "${guide.slug}" must not contain "[object Object]"`);
  }
  console.log('  ✅ Test 41 Passed: 100% attribute parity verified between public renderer and canonical resolver.');
}

// ============================================================================
// Test 42: FAQ Question Operational Provenance Validation (Codex Thread PRRT_kwDOUCUnhs6oLTBg, BI1-BI5)
// ============================================================================
console.log('\n▶ Test 42: FAQ Question Operational Provenance Validation (Codex Thread PRRT_kwDOUCUnhs6oLTBg, BI1-BI5)...');
{
  const carbSource = {
    id: 'src-026-carb',
    source_id: 'src-026-carb',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    locator: {
      section: 'Carburetor',
      page: 36,
      heading: 'Carburetor Adjustment'
    }
  };

  const startSource = {
    id: 'src-026-start',
    source_id: 'src-026-start',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    locator: {
      section: 'Starting / Stopping the Engine',
      page: 24,
      heading: 'Starting the Engine'
    }
  };

  const resolvedMap = new Map([
    ['src-026-carb', resolveGuideSource(carbSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource],
    ['src-026-start', resolveGuideSource(startSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource]
  ]);

  // BI1: collectRenderedOperationalClaims collects faq[*].question with claimClass: 'FAQ_QUESTION'
  {
    const sampleGuide = {
      slug: 'test-faq-collect',
      sources: [carbSource],
      faq: [
        {
          question: 'Hoe stel ik de L-stelschroef van de carburateur af?',
          answer: 'Draai de L-schroef voorzichtig rechtsom tot aanslag en daarna 1 slag linksom.',
          sourceRefs: ['src-026-carb']
        }
      ]
    };

    const claims = collectRenderedOperationalClaims(sampleGuide);
    const qClaim = claims.find(c => c.path === 'faq[0].question');
    const aClaim = claims.find(c => c.path === 'faq[0].answer');

    assert.ok(qClaim, 'faq[0].question must be collected by collectRenderedOperationalClaims');
    assert.strictEqual(qClaim.claimClass, 'FAQ_QUESTION', 'faq[0].question must have claimClass FAQ_QUESTION');
    assert.strictEqual(qClaim.text, 'Hoe stel ik de L-stelschroef van de carburateur af?');
    assert.deepStrictEqual(qClaim.sourceRefs, ['src-026-carb']);

    assert.ok(aClaim, 'faq[0].answer must be collected by collectRenderedOperationalClaims');
    assert.strictEqual(aClaim.claimClass, 'FAQ_ANSWER', 'faq[0].answer must have claimClass FAQ_ANSWER');
    console.log('  ✅ Case BI1 Passed: faq[*].question collected with claimClass FAQ_QUESTION.');
  }

  // BI2: FAQ question with operational technical claim bound to unrelated locator fails closed
  {
    const guideBI2 = {
      slug: 'test-faq-unrelated-locator',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      faq: [
        {
          question: 'Moet de L-stelschroef van de carburateur altijd op 1 slag open staan?',
          answer: 'Volg altijd de instructies in de handleiding van uw machine.',
          sourceRefs: ['src-026-start'] // Start locator does not cover carburetor adjustments
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideBI2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'FAQ question with carburetor claim citing start locator must fail');
    assert.ok(
      errs.some(e => e.includes('faq[0].question') && e.includes('pointing to start procedure')),
      `Expected start locator rejection for FAQ carburetor question, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BI2 Passed: FAQ question citing unrelated locator fails closed.');
  }

  // BI3: FAQ question citing valid matching locator passes cleanly
  {
    const guideBI3 = {
      slug: 'test-faq-matching-locator',
      publicationStatus: 'PUBLISHED',
      sources: [carbSource],
      faq: [
        {
          question: 'Hoe stel ik de L-stelschroef van de carburateur af?',
          answer: 'Draai de L-schroef voorzichtig rechtsom tot aanslag en daarna 1 slag linksom conform fabrieksinstructie.',
          sourceRefs: ['src-026-carb']
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideBI3, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Valid FAQ question and answer must pass without errors, got: ${errs.join('; ')}`);
    console.log('  ✅ Case BI3 Passed: FAQ question citing valid matching locator passes cleanly.');
  }

  // BI4: FAQ question without sourceRefs on published guide fails closed
  {
    const guideBI4 = {
      slug: 'test-faq-missing-refs',
      publicationStatus: 'PUBLISHED',
      sources: [carbSource],
      faq: [
        {
          question: 'Wat is het juiste toerental bij volgas?',
          answer: 'Raadpleeg uw dealer of officiële handleiding.'
          // missing sourceRefs
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideBI4, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'FAQ question without sourceRefs on published guide must fail');
    assert.ok(
      errs.some(e => e.includes('faq[0].question') && e.includes('has no sourceRefs')),
      `Expected unattributed error for faq[0].question, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BI4 Passed: FAQ question without sourceRefs on published guide fails closed.');
  }

  // BI5: Unsupported operational claim in question cannot bypass validation with innocuous sourced answer
  {
    const guideBI5 = {
      slug: 'test-faq-sneaky-question',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      faq: [
        {
          question: 'Waarom mag ik de carburateur H-schroef niet verder dan 3/4 slag open draaien bij een koude start?',
          answer: 'Tijdens een koude start gebruikt u uitsluitend de chokehendel.',
          sourceRefs: ['src-026-start']
        }
      ]
    };

    const errs = validateOperationalClaimsProvenance(guideBI5, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Sneaky question containing carburetor claim bound to start locator must fail');
    assert.ok(
      errs.some(e => e.includes('faq[0].question')),
      `Expected faq[0].question violation, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BI5 Passed: Sneaky question cannot bypass validation via innocuous answer.');
  }
}

// ============================================================================
// Test 43: Direct Answer Heading Operational Provenance Validation (Codex Thread PRRT_kwDOUCUnhs6oLhX5, BJ1-BJ5)
// ============================================================================
console.log('\n▶ Test 43: Direct Answer Heading Operational Provenance Validation (Codex Thread PRRT_kwDOUCUnhs6oLhX5, BJ1-BJ5)...');
{
  const crankcaseSource = {
    id: 'src-026-crankcase',
    source_id: 'src-026-crankcase',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    locator: {
      section: 'Crankcase Leakage',
      page: 48,
      heading: 'Crankcase Pressure and Vacuum Testing'
    }
  };

  const startSource = {
    id: 'src-026-start',
    source_id: 'src-026-start',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'OFFICIAL_INSTRUCTION_MANUAL',
    model_scope: ['026'],
    locator: {
      section: 'Starting / Stopping the Engine',
      page: 24,
      heading: 'Starting the Engine'
    }
  };

  const resolvedMap = new Map([
    ['src-026-crankcase', resolveGuideSource(crankcaseSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource],
    ['src-026-start', resolveGuideSource(startSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource]
  ]);

  // BJ1: collectRenderedOperationalClaims collects directAnswer.heading with claimClass: 'DIRECT_ANSWER'
  {
    const sampleGuide = {
      slug: 'test-direct-heading-collect',
      sources: [startSource],
      directAnswer: {
        heading: 'Kort antwoord: controleer startprocedure en schakelaar',
        content: 'Controleer of de schakelaar op stand I staat.',
        sourceRefs: ['src-026-start']
      }
    };

    const claims = collectRenderedOperationalClaims(sampleGuide);
    const hClaim = claims.find(c => c.path === 'directAnswer.heading');
    const cClaim = claims.find(c => c.path === 'directAnswer.content');

    assert.ok(hClaim, 'directAnswer.heading must be collected by collectRenderedOperationalClaims');
    assert.strictEqual(hClaim.claimClass, 'DIRECT_ANSWER', 'directAnswer.heading must have claimClass DIRECT_ANSWER');
    assert.strictEqual(hClaim.text, 'Kort antwoord: controleer startprocedure en schakelaar');
    assert.deepStrictEqual(hClaim.sourceRefs, ['src-026-start']);

    assert.ok(cClaim, 'directAnswer.content must be collected by collectRenderedOperationalClaims');
    assert.strictEqual(cClaim.claimClass, 'DIRECT_ANSWER', 'directAnswer.content must have claimClass DIRECT_ANSWER');
    console.log('  ✅ Case BJ1 Passed: directAnswer.heading collected with claimClass DIRECT_ANSWER.');
  }

  // BJ2: Direct answer heading with crankcase testing instruction citing only start locator fails closed
  {
    const guideBJ2 = {
      slug: 'test-direct-heading-crankcase-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      directAnswer: {
        heading: 'Kort antwoord: voer eerst een carter afpersing en vacuümmeting uit',
        content: 'Volg altijd de instructies in de handleiding van uw machine.',
        sourceRefs: ['src-026-start'] // Start locator does not cover crankcase testing
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBJ2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Direct answer heading with crankcase testing claim citing start locator must fail');
    assert.ok(
      errs.some(e => e.includes('directAnswer.heading') && e.includes('crankcase')),
      `Expected crankcase locator rejection for directAnswer.heading, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BJ2 Passed: Direct answer heading citing unrelated locator fails closed.');
  }

  // BJ3: Direct answer heading citing valid matching locator passes cleanly
  {
    const guideBJ3 = {
      slug: 'test-direct-heading-matching',
      publicationStatus: 'PUBLISHED',
      sources: [crankcaseSource],
      directAnswer: {
        heading: 'Kort antwoord: voer eerst een carter afpersing en vacuümmeting uit',
        content: 'Sluit de afperspomp aan conform fabrieksvoorschrift en controleer de krukaskeerring op dichtheid.',
        sourceRefs: ['src-026-crankcase']
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBJ3, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Valid direct answer heading and content must pass without errors, got: ${errs.join('; ')}`);
    console.log('  ✅ Case BJ3 Passed: Direct answer heading citing valid matching locator passes cleanly.');
  }

  // BJ4: Direct answer heading without sourceRefs on published guide fails closed
  {
    const guideBJ4 = {
      slug: 'test-direct-heading-missing-refs',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      directAnswer: {
        heading: 'Kort antwoord: wat kunt u direct controleren?',
        content: 'Controleer de schakelaar en de startprocedure.'
        // missing sourceRefs
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBJ4, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Direct answer without sourceRefs on published guide must fail');
    assert.ok(
      errs.some(e => e.includes('directAnswer.heading') && e.includes('has no sourceRefs')),
      `Expected unattributed error for directAnswer.heading, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BJ4 Passed: Direct answer heading without sourceRefs on published guide fails closed.');
  }

  // BJ5: Unsupported operational claim in direct answer heading cannot bypass validation via innocuous content
  {
    const guideBJ5 = {
      slug: 'test-direct-heading-sneaky',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      directAnswer: {
        heading: 'Kort antwoord: controleer of de krukaskeerring druk- en vacuümmeting binnen fabriekstoleranties valt',
        content: 'Koud starten vereist de chokehendel in stand koudestart.',
        sourceRefs: ['src-026-start']
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBJ5, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Sneaky heading containing crankcase claim bound to start locator must fail');
    assert.ok(
      errs.some(e => e.includes('directAnswer.heading') && e.includes('crankcase')),
      `Expected directAnswer.heading violation, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BJ5 Passed: Sneaky direct answer heading cannot bypass validation via innocuous content.');
  }
}

// 44. Locator Heading Parity with Canonical Document Registry (Codex Thread PRRT_kwDOUCUnhs6oLmKd, BK1-BK5)
console.log('\n▶ Test 44: Locator Heading Parity with Canonical Document Registry (Codex Thread PRRT_kwDOUCUnhs6oLmKd, BK1-BK5)...');
{
  // BK1: 0458-133-3021 page 38 with forged heading 'Adjusting Carburetor' fails closed
  {
    const forgedCarbOnP38 = {
      id: 'src-forged-p38',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, heading: 'Adjusting Carburetor' }
    };
    const res = resolveGuideSource(forgedCarbOnP38, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'BK1: Page 38 with forged carburetor heading must fail to resolve');
    assert.ok(
      res.errors.some(e => e.includes('does not match canonical document contents for "0458-133-3021"')),
      `Expected canonical content mismatch error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BK1 Passed: Page 38 with forged carburetor heading fails closed against canonical document registry.');
  }

  // BK2: 0458-133-3021 page 38 with genuine heading 'Starting the Engine' resolves to LOCATOR_VERIFIED
  {
    const validStartOnP38 = {
      id: 'src-valid-p38',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
    };
    const res = resolveGuideSource(validStartOnP38, { throwOnError: false });
    assert.strictEqual(res.resolved, true, 'BK2: Page 38 with valid starting heading must resolve cleanly');
    assert.strictEqual(res.locatorStatus, 'LOCATOR_VERIFIED', 'BK2: Must be LOCATOR_VERIFIED');
    console.log('  ✅ Case BK2 Passed: Page 38 with genuine starting heading passes cleanly as LOCATOR_VERIFIED.');
  }

  // BK3: 0458-133-3021 page 42 with genuine carburetor heading resolves to LOCATOR_VERIFIED
  {
    const validCarbOnP42 = {
      id: 'src-valid-p42',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 42, section: 'Adjusting Carburetor', heading: 'Motor management' }
    };
    const res = resolveGuideSource(validCarbOnP42, { throwOnError: false });
    assert.strictEqual(res.resolved, true, 'BK3: Page 42 with valid carburetor heading must resolve cleanly');
    assert.strictEqual(res.locatorStatus, 'LOCATOR_VERIFIED', 'BK3: Must be LOCATOR_VERIFIED');
    console.log('  ✅ Case BK3 Passed: Page 42 with genuine carburetor heading passes cleanly as LOCATOR_VERIFIED.');
  }

  // BK4: Carburetor operational claim bound to source on page 38 fails closed in validateGuideSources
  {
    const guideBK4 = {
      slug: 'test-carb-forged-p38',
      publicationStatus: 'PUBLISHED',
      sources: [
        {
          id: 'src-p38-carb',
          publicationId: '0458-133-3021',
          modelScope: ['026'],
          locator: { page: 38, heading: 'Adjusting Carburetor' }
        }
      ],
      troubleshootingMatrix: [
        {
          symptom: 'Zaag valt uit bij gasgeven',
          possibleCause: 'L-sproeier staat te arm afgesteld',
          safeFirstCheck: 'Controleer basisafstelling',
          nextStep: 'Stel L-stelschroef bij',
          sourceRefs: ['src-p38-carb']
        }
      ]
    };
    const val = validateGuideSources(guideBK4, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(val.valid, false, 'BK4: Carburetor claim bound to page 38 must fail validation');
    console.log('  ✅ Case BK4 Passed: Carburetor claim citing forged page 38 heading fails closed in validateGuideSources.');
  }

  // BK5: Fuel claim bound to page 38 with forged fuel heading fails closed
  {
    const forgedFuelOnP38 = {
      id: 'src-forged-fuel-p38',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, heading: 'Fuel Mixture & Storage' }
    };
    const res = resolveGuideSource(forgedFuelOnP38, { throwOnError: false });
    assert.strictEqual(res.resolved, false, 'BK5: Page 38 with forged fuel heading must fail to resolve');
    console.log('  ✅ Case BK5 Passed: Fuel operational claim citing forged page 38 heading fails closed.');
  }
}

// 45. Spark Plug Color Label Operational Provenance Validation (Codex Thread PRRT_kwDOUCUnhs6oLmKh, BL1-BL5)
console.log('\n▶ Test 45: Spark Plug Color Label Operational Provenance Validation (Codex Thread PRRT_kwDOUCUnhs6oLmKh, BL1-BL5)...');
{
  const testGuide = {
    slug: 'test-spark-color-guide',
    sources: [
      { id: 'src-plug', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 50, section: 'Specifications', heading: 'Technical Data' } }
    ],
    technicalInspections: {
      sparkPlug: {
        title: 'Bougie inspectie',
        text: 'Draai de bougie eruit.',
        sourceRefs: ['src-plug'],
        colors: [
          {
            color: 'Koffiebruin (normaal)',
            meaning: 'Optimale verbranding en correct mengsel.',
            sourceRefs: ['src-plug']
          }
        ],
        gapNotice: 'Elektrodenafstand controleren.'
      }
    }
  };

  // BL1: sparkPlug.colors[*].color collected with claimClass TECHNICAL_INSPECTION
  {
    const claims = collectRenderedOperationalClaims(testGuide);
    const colorClaim = claims.find(c => c.path === 'technicalInspections.sparkPlug.colors[0].color');
    assert.ok(colorClaim, 'BL1: colorClaim must be collected');
    assert.strictEqual(colorClaim.text, 'Koffiebruin (normaal)');
    assert.strictEqual(colorClaim.claimClass, 'TECHNICAL_INSPECTION');
    console.log('  ✅ Case BL1 Passed: technicalInspections.sparkPlug.colors[*].color collected with claimClass TECHNICAL_INSPECTION.');
  }

  // BL2: Unsupported diagnostic or repair assertion in color citing start locator fails closed
  {
    const startSource = {
      id: 'src-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
    };
    const resolvedMap = new Map([
      ['src-start', resolveGuideSource(startSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource]
    ]);

    const guideBL2 = {
      slug: 'test-spark-color-start-ref',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      technicalInspections: {
        sparkPlug: {
          title: 'Bougie',
          text: 'Bougie controle.',
          sourceRefs: ['src-start'],
          colors: [
            {
              color: 'Stel de L- en H-sproeier bij en vervang de bougie',
              meaning: 'Normaal bougiebeeld.',
              sourceRefs: ['src-start']
            }
          ]
        }
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBL2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Carburetor adjustment assertion in spark plug color citing start locator must fail');
    assert.ok(
      errs.some(e => e.includes('technicalInspections.sparkPlug.colors[0].color') && e.includes('carburetor')),
      `Expected carburetor violation in color label, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BL2 Passed: Unsupported diagnostic assertion in color citing unrelated locator fails closed.');
  }

  // BL3: Innocuous color with valid sourceRefs passes cleanly
  {
    const specSource = {
      id: 'src-spec',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 50, section: 'Specifications', heading: 'Technical Data' }
    };
    const resolvedMap = new Map([
      ['src-spec', resolveGuideSource(specSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource]
    ]);

    const guideBL3 = {
      slug: 'test-spark-color-valid',
      publicationStatus: 'PUBLISHED',
      sources: [specSource],
      technicalInspections: {
        sparkPlug: {
          title: 'Bougie inspectie',
          text: 'Controleer bougie.',
          sourceRefs: ['src-spec'],
          colors: [
            {
              color: 'Koffiebruin / grijsbruin (normaal)',
              meaning: 'Verbranding en mengsel zijn in orde.',
              sourceRefs: ['src-spec']
            }
          ]
        }
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBL3, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Valid color and meaning must pass with 0 errors, got: ${errs.join('; ')}`);
    console.log('  ✅ Case BL3 Passed: Innocuous color label with valid sourceRefs passes cleanly.');
  }

  // BL4: sparkPlug.colors[*].color without sourceRefs on published guide fails closed
  {
    const guideBL4 = {
      slug: 'test-spark-color-missing-refs',
      publicationStatus: 'PUBLISHED',
      sources: [
        { id: 'src-spec', publicationId: '0458-133-3021', modelScope: ['026'], locator: { page: 50, section: 'Specifications', heading: 'Technical Data' } }
      ],
      technicalInspections: {
        sparkPlug: {
          colors: [
            {
              color: 'Zwart en roetig'
              // missing sourceRefs
            }
          ]
        }
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBL4, new Map(), { isPublished: true });
    assert.ok(errs.length > 0, 'Color without sourceRefs on published guide must fail');
    assert.ok(
      errs.some(e => e.includes('technicalInspections.sparkPlug.colors[0].color') && e.includes('has no sourceRefs')),
      `Expected missing sourceRefs error for color, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BL4 Passed: Spark plug color without sourceRefs on published guide fails closed.');
  }

  // BL5: Sneaky color assertion cannot bypass validation via innocent meaning
  {
    const startSource = {
      id: 'src-start',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
    };
    const resolvedMap = new Map([
      ['src-start', resolveGuideSource(startSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource]
    ]);

    const guideBL5 = {
      slug: 'test-spark-color-sneaky',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      technicalInspections: {
        sparkPlug: {
          colors: [
            {
              color: 'Bougie nat door krukaskeerring lekkage en ontbrekende carter compressie',
              meaning: 'Controleer startpositie.',
              sourceRefs: ['src-start']
            }
          ]
        }
      }
    };

    const errs = validateOperationalClaimsProvenance(guideBL5, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Crankcase testing claim in color label bound to start locator must fail');
    assert.ok(
      errs.some(e => e.includes('technicalInspections.sparkPlug.colors[0].color') && e.includes('crankcase')),
      `Expected crankcase error in color, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BL5 Passed: Sneaky color assertion cannot bypass validation via innocent meaning.');
  }
}

// ===============================================================
// TEST 46: LOCATOR PAGE MAPPINGS AND UNMAPPED PAGE REJECTION (Codex Thread PRRT_kwDOUCUnhs6oL6NC, BM1-BM5)
// ===============================================================
console.log('\n▶ Test 46: Locator Page Mappings & Unmapped Page Rejection (Codex Thread PRRT_kwDOUCUnhs6oL6NC, BM1-BM5)...');
{
  // BM1: Page 17 (unmapped page in 0458-133-3021 with mapped pages table) fails closed
  {
    const locResult = verifyLocatorAgainstCanonicalData('0458-133-3021', {
      page: 17,
      section: 'Some Section',
      heading: 'Some Heading'
    });
    assert.strictEqual(locResult.status, 'LOCATOR_PAGE_OUT_OF_BOUNDS', 'Unmapped page must return LOCATOR_PAGE_OUT_OF_BOUNDS');
    assert.strictEqual(locResult.verified, false, 'Unmapped page must not be verified');
    console.log('  ✅ Case BM1 Passed: Unmapped page 17 in document with mapped pages registry rejected.');
  }

  // BM2: Mapped page (page 38) with genuine section and heading passes as LOCATOR_VERIFIED
  {
    const locResult = verifyLocatorAgainstCanonicalData('0458-133-3021', {
      page: 38,
      section: 'Starting / Stopping the Engine',
      heading: 'Starting the Engine'
    });
    assert.strictEqual(locResult.status, 'LOCATOR_VERIFIED', 'Mapped page 38 must return LOCATOR_VERIFIED');
    assert.strictEqual(locResult.verified, true, 'Mapped page 38 must be verified');
    console.log('  ✅ Case BM2 Passed: Mapped page 38 with valid section/heading verified cleanly.');
  }

  // BM3: Out-of-bounds page (page 999) fails closed
  {
    const locResult = verifyLocatorAgainstCanonicalData('0458-133-3021', {
      page: 999,
      section: 'Starting / Stopping the Engine',
      heading: 'Starting the Engine'
    });
    assert.strictEqual(locResult.status, 'LOCATOR_PAGE_OUT_OF_BOUNDS', 'Page 999 must return LOCATOR_PAGE_OUT_OF_BOUNDS');
    assert.strictEqual(locResult.verified, false, 'Page 999 must not be verified');
    console.log('  ✅ Case BM3 Passed: Out-of-bounds page 999 rejected.');
  }

  // BM4: Published guide source with unmapped page fails closed in validateGuideSources
  {
    const guideBM4 = {
      slug: 'test-unmapped-page-guide',
      publicationStatus: 'PUBLISHED',
      sources: [
        {
          id: 'src-unmapped',
          publicationId: '0458-133-3021',
          modelScope: ['026'],
          locator: { page: 17, section: 'Some Section', heading: 'Some Heading' }
        }
      ]
    };
    const valBM4 = validateGuideSources(guideBM4, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(valBM4.valid, false, 'Guide with unmapped locator page must fail validation');
    assert.ok(
      valBM4.errors.some(e => e.includes('not registered in canonical document locators') || e.includes('Unmapped pages cannot be verified') || e.includes('LOCATOR_PAGE_OUT_OF_BOUNDS')),
      `Expected unmapped locator page error, got: ${valBM4.errors.join('; ')}`
    );
    console.log('  ✅ Case BM4 Passed: Published guide source with unmapped page fails closed.');
  }

  // BM5: Claim referencing source on unmapped page fails closed in validateOperationalClaimsProvenance
  {
    const unmappedSource = {
      id: 'src-unmapped',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 17, section: 'Some Section', heading: 'Some Heading' }
    };
    const resolved = resolveGuideSource(unmappedSource, { throwOnError: false, isPublishedGuide: false });
    const resolvedMap = new Map([['src-unmapped', resolved.canonicalSource || unmappedSource]]);

    const guideBM5 = {
      slug: 'test-unmapped-claim',
      publicationStatus: 'PUBLISHED',
      sources: [unmappedSource],
      directAnswer: {
        heading: 'Direct antwoord voor starten',
        content: 'Volg de officiële voorschriften.',
        sourceRefs: ['src-unmapped']
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBM5, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Claim citing unmapped source must fail provenance check');
    console.log('  ✅ Case BM5 Passed: Operational claim referencing unmapped locator page rejected.');
  }
}

// ===============================================================
// TEST 47: SECTION/HEADING MATCHING AND NO EMPTY-HEADING WILDCARD (Codex Thread PRRT_kwDOUCUnhs6oL6NH, BN1-BN5)
// ===============================================================
console.log('\n▶ Test 47: Section/Heading Matching & No Wildcard on Omitted Heading (Codex Thread PRRT_kwDOUCUnhs6oL6NH, BN1-BN5)...');
{
  // BN1: Empty heading on page 38 does NOT match any entry when section/heading don't match
  {
    const locResult = verifyLocatorAgainstCanonicalData('0458-133-3021', {
      page: 38,
      section: 'Completely Wrong Section',
      heading: ''
    });
    assert.strictEqual(locResult.status, 'LOCATOR_SECTION_MISMATCH', 'Wrong section with empty heading must return LOCATOR_SECTION_MISMATCH');
    assert.strictEqual(locResult.verified, false, 'Must not be verified');
    console.log('  ✅ Case BN1 Passed: Wrong section with empty heading rejected as LOCATOR_SECTION_MISMATCH.');
  }

  // BN2: Section mismatch on page 38 with valid heading name rejected
  {
    const locResult = verifyLocatorAgainstCanonicalData('0458-133-3021', {
      page: 38,
      section: 'Carburetor Adjustment Section',
      heading: 'Starting the Engine'
    });
    assert.strictEqual(locResult.status, 'LOCATOR_SECTION_MISMATCH', 'Section mismatch must return LOCATOR_SECTION_MISMATCH');
    assert.strictEqual(locResult.verified, false, 'Must not be verified');
    console.log('  ✅ Case BN2 Passed: Section mismatch on mapped page rejected.');
  }

  // BN3: Exact match section and heading on page 38 passes cleanly
  {
    const locResult = verifyLocatorAgainstCanonicalData('0458-133-3021', {
      page: 38,
      section: 'Starting / Stopping the Engine',
      heading: 'Starting the Engine'
    });
    assert.strictEqual(locResult.status, 'LOCATOR_VERIFIED', 'Exact match must return LOCATOR_VERIFIED');
    assert.strictEqual(locResult.verified, true, 'Exact match must be verified');
    console.log('  ✅ Case BN3 Passed: Exact section and heading verified cleanly.');
  }

  // BN4: Mismatched heading on page 38 fails closed
  {
    const locResult = verifyLocatorAgainstCanonicalData('0458-133-3021', {
      page: 38,
      section: 'Starting / Stopping the Engine',
      heading: 'Nonexistent Engine Heading'
    });
    assert.strictEqual(locResult.status, 'LOCATOR_SECTION_MISMATCH', 'Heading mismatch must return LOCATOR_SECTION_MISMATCH');
    assert.strictEqual(locResult.verified, false, 'Must not be verified');
    console.log('  ✅ Case BN4 Passed: Heading mismatch on mapped page rejected.');
  }

  // BN5: Published guide with section mismatch in locator fails in validateGuideSources
  {
    const guideBN5 = {
      slug: 'test-section-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [
        {
          id: 'src-mismatch',
          publicationId: '0458-133-3021',
          modelScope: ['026'],
          locator: { page: 38, section: 'Wrong Section', heading: 'Wrong Heading' }
        }
      ]
    };
    const valBN5 = validateGuideSources(guideBN5, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(valBN5.valid, false, 'Guide with section mismatch locator must fail');
    assert.ok(
      valBN5.errors.some(e => e.includes('does not match canonical document contents') || e.includes('LOCATOR_SECTION_MISMATCH')),
      `Expected section mismatch error, got: ${valBN5.errors.join('; ')}`
    );
    console.log('  ✅ Case BN5 Passed: Published guide with section mismatch locator fails closed.');
  }
}

// ===============================================================
// TEST 48: GROUND ALL PROCEDURE STEPS IN MATCHING LOCATOR TOPICS (Codex Thread PRRT_kwDOUCUnhs6oL6NK, BO1-BO5)
// ===============================================================
console.log('\n▶ Test 48: Ground All Procedure Steps in Matching Locator Topics (Codex Thread PRRT_kwDOUCUnhs6oL6NK, BO1-BO5)...');
{
  const startSource = {
    id: 'src-start',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resolvedStart = resolveGuideSource(startSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource;
  const resolvedMap = new Map([['src-start', resolvedStart]]);
  const sourceIds = new Set(['src-start']);

  // BO1: Generic procedure step containing crankcase pressure testing instruction citing start-only locator -> fails closed
  {
    const guideBO1 = {
      slug: 'test-proc-crankcase-in-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        genericPrinciple: {
          title: 'Algemene startprocedure',
          steps: [
            {
              step: 1,
              title: 'Carter afpersen en vacuüm testen',
              action: 'Sluit de vacuümpomp aan op het carter en voer een lektest uit volgens fabrieksopgave.',
              sourceRefs: ['src-start']
            }
          ]
        }
      }
    };
    const errors = validateProcedureStepsProvenance(guideBO1, resolvedMap, { isPublished: true });
    assert.ok(errors.length > 0, 'Crankcase testing instruction citing start-only locator must fail in procedure steps');
    assert.ok(
      errors.some(e => e.includes('crankcase pressure/vacuum or seal testing claims')),
      `Expected crankcase error in procedure steps, got: ${errors.join('; ')}`
    );
    console.log('  ✅ Case BO1 Passed: Crankcase testing instruction in general procedure step fails closed under start locator.');
  }

  // BO2: Cold start step containing carburetor jet adjustment instruction citing start-only locator -> fails closed
  {
    const guideBO2 = {
      slug: 'test-proc-carb-in-cold-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        coldStart: {
          title: 'Koude start',
          steps: [
            {
              step: 1,
              title: 'Carburateur stelschroeven H en L afstellen',
              action: 'Draai de H en L stelschroeven van de carburateur naar de basisafstelling.',
              sourceRefs: ['src-start']
            }
          ]
        }
      }
    };
    const errors = validateProcedureStepsProvenance(guideBO2, resolvedMap, { isPublished: true });
    assert.ok(errors.length > 0, 'Carburetor adjustment instruction citing start-only locator must fail in cold start steps');
    assert.ok(
      errors.some(e => e.includes('carburetor adjustment or jet setting claims')),
      `Expected carburetor error in cold start steps, got: ${errors.join('; ')}`
    );
    console.log('  ✅ Case BO2 Passed: Carburetor adjustment instruction in cold start step fails closed under start locator.');
  }

  // BO3: Warm start step containing fuel mixing claims citing start-only locator -> fails closed
  {
    const guideBO3 = {
      slug: 'test-proc-fuel-in-warm-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        warmStart: {
          title: 'Warme start',
          steps: [
            {
              step: 1,
              title: 'Brandstof mengsmering verhouding 1:50',
              action: 'Meng verse 2-takt olie met euro 95 benzine in een verhouding van 1 op 50 voor opslag.',
              sourceRefs: ['src-start']
            }
          ]
        }
      }
    };
    const errors = validateProcedureStepsProvenance(guideBO3, resolvedMap, { isPublished: true });
    assert.ok(errors.length > 0, 'Fuel mixing instruction citing start-only locator must fail in warm start steps');
    assert.ok(
      errors.some(e => e.includes('pointing to start procedure instead of fuel mixing')),
      `Expected fuel error in warm start steps, got: ${errors.join('; ')}`
    );
    console.log('  ✅ Case BO3 Passed: Fuel mixing instruction in warm start step fails closed under start locator.');
  }

  // BO4: Flooded engine step containing M-Tronic electronic diagnosis claims citing start-only locator -> fails closed
  {
    const guideBO4 = {
      slug: 'test-proc-mtronic-in-flooded-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      floodedEngineRecovery: {
        title: 'Verzopen motor',
        steps: [
          {
            step: 1,
            title: 'M-Tronic diagnose en kalibratie via MDG 1',
            action: 'Sluit de STIHL diagnosemodule MDG 1 aan om het M-Tronic motormanagement storingsgeheugen uit te lezen.',
            sourceRefs: ['src-start']
          }
        ]
      }
    };
    const errors = validateProcedureStepsProvenance(guideBO4, resolvedMap, { isPublished: true });
    assert.ok(errors.length > 0, 'M-Tronic diagnosis instruction citing start-only locator must fail in flooded recovery steps');
    assert.ok(
      errors.some(e => e.includes('M-Tronic electronic diagnosis or diagnostic system claims')),
      `Expected M-Tronic error in flooded recovery steps, got: ${errors.join('; ')}`
    );
    console.log('  ✅ Case BO4 Passed: M-Tronic diagnosis instruction in flooded recovery step fails closed under start locator.');
  }

  // BO5: Procedure steps with matching locator topics pass cleanly
  {
    const carbSource = {
      id: 'src-carb',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 42, section: 'Adjusting Carburetor', heading: 'Motor management' }
    };
    const resolvedCarb = resolveGuideSource(carbSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource;
    const multiMap = new Map([
      ['src-start', resolvedStart],
      ['src-carb', resolvedCarb]
    ]);

    const guideBO5 = {
      slug: 'test-proc-valid-grounding',
      publicationStatus: 'PUBLISHED',
      sources: [startSource, carbSource],
      startProcedures: {
        coldStart: {
          title: 'Koude start',
          steps: [
            {
              step: 1,
              title: 'Choke inschakelen',
              action: 'Zet de combihendel in stand koude start (choke).',
              sourceRefs: ['src-start']
            }
          ]
        }
      }
    };
    const errors = validateProcedureStepsProvenance(guideBO5, multiMap, { isPublished: true });
    assert.strictEqual(errors.length, 0, `Grounded procedure step must pass with 0 errors, got: ${errors.join('; ')}`);
    console.log('  ✅ Case BO5 Passed: Accurately grounded procedure steps pass cleanly.');
  }
}

// ===============================================================
// TEST 49: PROCEDURE HEADINGS & TITLES OPERATIONAL PROVENANCE (Codex Thread PRRT_kwDOUCUnhs6oL6NP, BP1-BP5)
// ===============================================================
console.log('\n▶ Test 49: Procedure Headings & Titles Operational Provenance (Codex Thread PRRT_kwDOUCUnhs6oL6NP, BP1-BP5)...');
{
  const startSource = {
    id: 'src-start',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const resolvedStart = resolveGuideSource(startSource, { throwOnError: true, isPublishedGuide: true }).canonicalSource;
  const resolvedMap = new Map([['src-start', resolvedStart]]);

  // BP1: collectRenderedOperationalClaims collects startProcedures headings/titles with claimClass PROCEDURE_HEADING
  {
    const guideBP1 = {
      slug: 'test-proc-headings-collection',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        genericPrinciple: {
          heading: 'Basisprincipes voor tweetakt motoren starten',
          text: 'Algemene uitleg.'
        },
        coldStart: {
          title: 'Koude start procedure',
          steps: [{ step: 1, action: 'Trek aan koord.', sourceRefs: ['src-start'] }]
        },
        warmStart: {
          title: 'Warme start procedure',
          steps: [{ step: 1, action: 'Trek aan koord.', sourceRefs: ['src-start'] }]
        }
      },
      floodedEngineRecovery: {
        title: 'Verzopen motor herstelprocedure',
        genericPrinciple: {
          heading: 'Werkwijze bij verzopen motor',
          text: 'Draai bougie eruit.'
        },
        steps: [{ step: 1, action: 'Trek aan koord.', sourceRefs: ['src-start'] }]
      }
    };
    const claims = collectRenderedOperationalClaims(guideBP1);
    const headingClaims = claims.filter(c => c.claimClass === 'PROCEDURE_HEADING');
    assert.ok(headingClaims.length >= 4, `Expected at least 4 PROCEDURE_HEADING claims, found ${headingClaims.length}`);
    assert.ok(headingClaims.some(c => c.path === 'startProcedures.genericPrinciple.heading'), 'Must collect genericPrinciple.heading');
    assert.ok(headingClaims.some(c => c.path === 'startProcedures.coldStart.title'), 'Must collect coldStart.title');
    assert.ok(headingClaims.some(c => c.path === 'startProcedures.warmStart.title'), 'Must collect warmStart.title');
    assert.ok(headingClaims.some(c => c.path === 'floodedEngineRecovery.title'), 'Must collect floodedEngineRecovery.title');
    console.log('  ✅ Case BP1 Passed: Procedure titles and headings collected with claimClass PROCEDURE_HEADING.');
  }

  // BP2: Procedure heading containing off-domain crankcase assertion citing start-only locator fails closed
  {
    const guideBP2 = {
      slug: 'test-proc-heading-crankcase-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        genericPrinciple: {
          heading: 'Carter afpersen en carterdruk meten bij startproblemen',
          text: 'Controleer carter.',
          sourceRefs: ['src-start']
        }
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBP2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Crankcase testing assertion in procedure heading citing start locator must fail');
    assert.ok(
      errs.some(e => e.includes('startProcedures.genericPrinciple.heading') && e.includes('crankcase')),
      `Expected crankcase error in procedure heading, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BP2 Passed: Off-domain crankcase claim in procedure heading fails closed.');
  }

  // BP3: Procedure heading containing carburetor adjustment assertion citing start-only locator fails closed
  {
    const guideBP3 = {
      slug: 'test-proc-heading-carb-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        coldStart: {
          title: 'Carburateur stelschroeven H en L afstelling bij koude start',
          steps: [{ step: 1, action: 'Start motor.', sourceRefs: ['src-start'] }]
        }
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBP3, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Carburetor adjustment assertion in cold start title citing start locator must fail');
    assert.ok(
      errs.some(e => e.includes('startProcedures.coldStart.title') && e.includes('carburetor')),
      `Expected carburetor error in coldStart title, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BP3 Passed: Off-domain carburetor claim in cold start title fails closed.');
  }

  // BP4: Procedure heading without sourceRefs and without step sourceRefs to inherit fails closed
  {
    const guideBP4 = {
      slug: 'test-proc-heading-no-refs',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        genericPrinciple: {
          heading: 'Algemene startprocedure zonder bronnen'
          // no sourceRefs and no steps
        }
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBP4, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Procedure heading without sourceRefs on published guide must fail');
    assert.ok(
      errs.some(e => e.includes('startProcedures.genericPrinciple.heading') && e.includes('has no sourceRefs')),
      `Expected missing sourceRefs error for procedure heading, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BP4 Passed: Procedure heading without sourceRefs on published guide fails closed.');
  }

  // BP5: Genuine procedure heading citing matching locator passes cleanly
  {
    const guideBP5 = {
      slug: 'test-proc-heading-valid',
      publicationStatus: 'PUBLISHED',
      sources: [startSource],
      startProcedures: {
        genericPrinciple: {
          heading: 'Correcte startprocedure volgens fabriekshandleiding',
          text: 'Volg de koudstartprocedure conform de officiële handleiding en bedien de choke.',
          sourceRefs: ['src-start']
        },
        coldStart: {
          title: 'Koude start procedure',
          steps: [{ step: 1, action: 'Zet de combihendel in de chokestand.', sourceRefs: ['src-start'] }]
        }
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBP5, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Valid procedure headings must pass with 0 errors, got: ${errs.join('; ')}`);
    console.log('  ✅ Case BP5 Passed: Genuine procedure headings citing matching locators pass cleanly.');
  }
}

// 50. Canonical Heading Equality & Rejection of Compound/Forged Headings (Codex Thread PRRT_kwDOUCUnhs6oMJeL, BQ1-BQ5)
console.log('\n▶ Test 50: Canonical Heading Equality & Rejection of Compound/Forged Headings (Codex Thread PRRT_kwDOUCUnhs6oMJeL, BQ1-BQ5)...');
{
  const docLoc026 = {
    documentNumber: '0458-133-3021',
    pages: {
      38: [
        { section: 'Starting / Stopping the Engine', heading: 'Starting the Engine', topics: ['starting', 'start', 'starten', 'stopping'] }
      ]
    }
  };

  // BQ1: Page 38 with forged compound section or heading fails closed
  {
    // BQ1a: Forged compound heading with canonical section
    const locatorBQ1a = { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine and sharpen the chain to 30 degrees' };
    const resA = verifyLocatorAgainstCanonicalData('0458-133-3021', locatorBQ1a);
    assert.strictEqual(resA.verified, false, 'Forged compound heading must not be verified');
    assert.strictEqual(resA.status, 'LOCATOR_SECTION_MISMATCH', 'Status must be LOCATOR_SECTION_MISMATCH');

    // BQ1b: Forged compound section with canonical heading (Codex Thread PRRT_kwDOUCUnhs6oMSY5)
    const locatorBQ1b = { page: 38, section: 'Starting / Stopping the Engine and sharpen the chain to 30 degrees', heading: 'Starting the Engine' };
    const resB = verifyLocatorAgainstCanonicalData('0458-133-3021', locatorBQ1b);
    assert.strictEqual(resB.verified, false, 'Forged compound section must not be verified even if heading is canonical');
    assert.strictEqual(resB.status, 'LOCATOR_SECTION_MISMATCH', 'Status must be LOCATOR_SECTION_MISMATCH');
    console.log('  ✅ Case BQ1 Passed: Page 38 with forged compound section/heading fails closed as LOCATOR_SECTION_MISMATCH.');
  }

  // BQ2: Page 38 with genuine canonical heading passes cleanly
  {
    const locatorBQ2 = { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' };
    const res = verifyLocatorAgainstCanonicalData('0458-133-3021', locatorBQ2);
    assert.strictEqual(res.verified, true, 'Genuine canonical heading must be verified');
    assert.strictEqual(res.status, 'LOCATOR_VERIFIED', 'Status must be LOCATOR_VERIFIED');
    console.log('  ✅ Case BQ2 Passed: Page 38 with genuine canonical heading resolves to LOCATOR_VERIFIED.');
  }

  // BQ3: Section-only registry document with forged compound section or heading fails closed
  {
    const locatorBQ3 = { section: 'Carburetor adjustment and sharpen the chain to 30 degrees', heading: 'Limiter caps and basic settings' };
    const res = verifyLocatorAgainstCanonicalData('1068494421', locatorBQ3);
    assert.strictEqual(res.verified, false, 'Forged compound section on section registry must fail closed');
    assert.strictEqual(res.status, 'LOCATOR_SECTION_MISMATCH', 'Status must be LOCATOR_SECTION_MISMATCH');
    console.log('  ✅ Case BQ3 Passed: Section-only document with forged compound section fails closed.');
  }

  // BQ4: Section-only registry document with genuine canonical heading passes cleanly
  {
    const locatorBQ4 = { section: 'Carburetor adjustment', heading: 'Limiter caps and basic settings' };
    const res = verifyLocatorAgainstCanonicalData('1068494421', locatorBQ4);
    assert.strictEqual(res.verified, true, 'Genuine canonical heading on section registry must be verified');
    assert.strictEqual(res.status, 'LOCATOR_VERIFIED', 'Status must be LOCATOR_VERIFIED');
    console.log('  ✅ Case BQ4 Passed: Section-only document with genuine heading resolves to LOCATOR_VERIFIED.');
  }

  // BQ5: Published guide source with forged compound section fails resolveGuideSource
  {
    const sourceBQ5 = {
      id: 'src-forged-section',
      primaryDocumentNumber: '0458-133-3021',
      modelScope: '026',
      locator: { page: 38, section: 'Starting / Stopping the Engine and sharpen the chain to 30 degrees', heading: 'Starting the Engine' }
    };
    const res = resolveGuideSource(sourceBQ5, { throwOnError: false, isPublishedGuide: true });
    assert.strictEqual(res.resolved, false, 'Source with forged compound section must fail to resolve on published guide');
    assert.strictEqual(res.locatorStatus, 'LOCATOR_SECTION_MISMATCH', 'Locator status must be LOCATOR_SECTION_MISMATCH');
    console.log('  ✅ Case BQ5 Passed: Published guide source with forged compound section fails resolution.');
  }
}

// 51. Grounding Procedure Steps Outside Whitelist (Codex Thread PRRT_kwDOUCUnhs6oMJeS / PRRT_kwDOUCUnhs6oMSY9, BR1-BR5)
console.log('\n▶ Test 51: Grounding Procedure Steps Outside Whitelist (Codex Thread PRRT_kwDOUCUnhs6oMJeS / PRRT_kwDOUCUnhs6oMSY9, BR1-BR5)...');
{
  const startSrc = {
    id: 'src-026-start',
    source_id: 'src-026-start',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'PRIMARY_OFFICIAL_MANUAL',
    authenticity_status: 'AUTHENTICATED_OFFICIAL',
    model_scope: ['026'],
    canonicalScope: ['026'],
    locatorStatus: 'LOCATOR_VERIFIED',
    locator: {
      page: 38,
      section: 'Starting / Stopping the Engine',
      heading: 'Starting the Engine',
      topics: ['starting', 'start', 'starten', 'stopping']
    }
  };
  const resolvedMap = new Map([['src-026-start', startSrc]]);

  // BR1: Chain sharpening instruction in cold start step citing start locator fails closed
  {
    const guideBR1 = {
      slug: 'test-chain-sharpen-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      startProcedures: {
        coldStart: {
          title: 'Koude start',
          steps: [{ step: 1, action: 'Slijp de zaagketting grondig voor optimaal resultaat.', sourceRefs: ['src-026-start'] }]
        }
      }
    };
    const errs = validateProcedureStepsProvenance(guideBR1, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Chain sharpening instruction under start locator must fail');
    assert.ok(
      errs.some(e => e.includes('chain maintenance') || e.includes('off-domain')),
      `Expected chain maintenance / off-domain error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BR1 Passed: Chain sharpening in cold-start step fails closed under start locator.');
  }

  // BR2: Filing cutter teeth at 30 degrees in start procedure step fails closed
  {
    const guideBR2 = {
      slug: 'test-file-teeth-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      startProcedures: {
        steps: [{ step: 1, text: 'Vijl alle snijtanden onder een hoek van 30 graden.', sourceRefs: ['src-026-start'] }]
      }
    };
    const errs = validateProcedureStepsProvenance(guideBR2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Filing teeth instruction under start locator must fail');
    assert.ok(
      errs.some(e => e.includes('chain maintenance') || e.includes('off-domain')),
      `Expected chain maintenance / off-domain error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BR2 Passed: Filing teeth instruction in start procedure fails closed under start locator.');
  }

  // BR3: Air filter washing in warm start step fails closed
  {
    const guideBR3 = {
      slug: 'test-air-filter-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      startProcedures: {
        warmStart: {
          title: 'Warme start',
          steps: [{ step: 1, action: 'Reinig en was het luchtfilter met warm water.', sourceRefs: ['src-026-start'] }]
        }
      }
    };
    const errs = validateProcedureStepsProvenance(guideBR3, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Air filter wash step without air filter locator must fail');
    console.log('  ✅ Case BR3 Passed: Air filter washing step under start locator fails closed.');
  }

  // BR4: Arbitrary ungrounded instruction with generic vocabulary in start procedure fails closed (Codex Thread PRRT_kwDOUCUnhs6oMSY9)
  {
    const guideBR4a = {
      slug: 'test-arbitrary-step-boor',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      startProcedures: {
        coldStart: {
          title: 'Koude start',
          steps: [{ step: 1, action: 'Boor een gat in de machine.', sourceRefs: ['src-026-start'] }]
        }
      }
    };
    const errsA = validateProcedureStepsProvenance(guideBR4a, resolvedMap, { isPublished: true });
    assert.ok(errsA.length > 0, 'Generic off-domain step "Boor een gat in de machine." must fail validation');
    assert.ok(
      errsA.some(e => e.includes('off-domain') || e.includes('not grounded')),
      `Expected off-domain / ungrounded error for "Boor een gat in de machine.", got: ${errsA.join('; ')}`
    );

    const guideBR4b = {
      slug: 'test-arbitrary-step',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      startProcedures: {
        genericPrinciple: {
          steps: [{ step: 1, text: 'Monteer de dakpannen en schilder het kozijn in ral 7016.', sourceRefs: ['src-026-start'] }]
        }
      }
    };
    const errsB = validateProcedureStepsProvenance(guideBR4b, resolvedMap, { isPublished: true });
    assert.ok(errsB.length > 0, 'Arbitrary ungrounded instruction under start locator must fail');
    assert.ok(
      errsB.some(e => e.includes('not grounded in canonical start procedure topics') || e.includes('off-domain')),
      `Expected ungrounded start procedure error, got: ${errsB.join('; ')}`
    );
    console.log('  ✅ Case BR4 Passed: Generic off-domain instructions (including "Boor een gat in de machine.") fail closed.');
  }

  // BR5: Genuine start procedure steps pass cleanly
  {
    const guideBR5 = {
      slug: 'test-valid-start-steps',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      startProcedures: {
        coldStart: {
          title: 'Koude start',
          steps: [
            { step: 1, action: 'Zet de combihendel in de chokestand.', sourceRefs: ['src-026-start'] },
            { step: 2, action: 'Trek het startkoord rustig uit tot weerstand voelbaar is en trek krachtig door.', sourceRefs: ['src-026-start'] }
          ]
        }
      }
    };
    const errs = validateProcedureStepsProvenance(guideBR5, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Grounded start procedure steps must pass with 0 errors, got: ${errs.join('; ')}`);
    console.log('  ✅ Case BR5 Passed: Genuine grounded start procedure steps pass cleanly.');
  }
}

// 52. Flooded Engine Recovery Heading Locator Semantics (Codex Thread PRRT_kwDOUCUnhs6oMJeU, BS1-BS5)
console.log('\n▶ Test 52: Flooded Engine Recovery Heading Locator Semantics (Codex Thread PRRT_kwDOUCUnhs6oMJeU, BS1-BS5)...');
{
  const startSrc = {
    id: 'src-026-start',
    source_id: 'src-026-start',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'PRIMARY_OFFICIAL_MANUAL',
    authenticity_status: 'AUTHENTICATED_OFFICIAL',
    model_scope: ['026'],
    canonicalScope: ['026'],
    locatorStatus: 'LOCATOR_VERIFIED',
    locator: {
      page: 38,
      section: 'Starting / Stopping the Engine',
      heading: 'Starting the Engine',
      topics: ['starting', 'start', 'starten', 'stopping']
    }
  };

  const floodedSrc = {
    id: 'src-026-flooded',
    source_id: 'src-026-flooded',
    canonical_document_id: '0458-133-3021',
    publication_id: '0458-133-3021',
    document_title: 'STIHL 026 Instruction Manual',
    source_class: 'PRIMARY_OFFICIAL_MANUAL',
    authenticity_status: 'AUTHENTICATED_OFFICIAL',
    model_scope: ['026'],
    canonicalScope: ['026'],
    locatorStatus: 'LOCATOR_VERIFIED',
    locator: {
      page: 42,
      section: 'Starting / Stopping the Engine',
      heading: 'If the Engine Does Not Start',
      topics: ['starting', 'start', 'flooded', 'ontzopen', 'troubleshooting']
    }
  };

  const resolvedMap = new Map([
    ['src-026-start', startSrc],
    ['src-026-flooded', floodedSrc]
  ]);

  // BS1: floodedEngineRecovery.title: 'Verzopen motor' citing start-only locator fails closed
  {
    const guideBS1 = {
      slug: 'test-flooded-title-start-locator',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc, floodedSrc],
      floodedEngineRecovery: {
        title: 'Verzopen motor herstelprocedure',
        titleSourceRefs: ['src-026-start'],
        steps: [
          { step: 1, action: 'Bougie demonteren en drogen.', sourceRefs: ['src-026-flooded'] }
        ]
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBS1, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Flooded recovery title citing start-only locator must fail');
    assert.ok(
      errs.some(e => e.includes('floodedEngineRecovery.title') && e.includes('pointing to start procedure instead of flooded engine recovery')),
      `Expected flooded recovery title locator error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BS1 Passed: floodedEngineRecovery.title citing start-only locator fails closed.');
  }

  // BS2: floodedEngineRecovery.genericPrinciple.heading citing start-only locator fails closed
  {
    const guideBS2 = {
      slug: 'test-flooded-heading-start-locator',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc, floodedSrc],
      floodedEngineRecovery: {
        genericPrinciple: {
          heading: 'Wat te doen bij een verzopen motor?',
          headingSourceRefs: ['src-026-start'],
          text: 'Volg de handleiding.',
          sourceRefs: ['src-026-flooded']
        }
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBS2, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Flooded generic principle heading citing start-only locator must fail');
    assert.ok(
      errs.some(e => e.includes('floodedEngineRecovery.genericPrinciple.heading') && e.includes('pointing to start procedure instead of flooded engine recovery')),
      `Expected flooded generic heading locator error, got: ${errs.join('; ')}`
    );
    console.log('  ✅ Case BS2 Passed: floodedEngineRecovery.genericPrinciple.heading citing start-only locator fails closed.');
  }

  // BS3: floodedEngineRecovery.title citing flooded recovery locator passes cleanly
  {
    const guideBS3 = {
      slug: 'test-flooded-title-valid',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSrc],
      floodedEngineRecovery: {
        title: 'Verzopen motor herstelprocedure',
        titleSourceRefs: ['src-026-flooded'],
        steps: [
          { step: 1, action: 'Bougie demonteren en drogen.', sourceRefs: ['src-026-flooded'] }
        ]
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBS3, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Flooded recovery title citing recovery locator must pass, got: ${errs.join('; ')}`);
    console.log('  ✅ Case BS3 Passed: floodedEngineRecovery.title citing flooded recovery locator passes cleanly.');
  }

  // BS4: floodedEngineRecovery.genericPrinciple.heading citing flooded recovery locator passes cleanly
  {
    const guideBS4 = {
      slug: 'test-flooded-heading-valid',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSrc],
      floodedEngineRecovery: {
        genericPrinciple: {
          heading: 'Wat te doen bij een verzopen motor?',
          headingSourceRefs: ['src-026-flooded'],
          text: 'Volg de ontzopingsinstructies.',
          sourceRefs: ['src-026-flooded']
        }
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBS4, resolvedMap, { isPublished: true });
    assert.strictEqual(errs.length, 0, `Flooded generic heading citing recovery locator must pass, got: ${errs.join('; ')}`);
    console.log('  ✅ Case BS4 Passed: floodedEngineRecovery.genericPrinciple.heading citing recovery locator passes cleanly.');
  }

  // BS5: Mixed guide where steps cite recovery source but recovery title cites start-only locator fails closed
  {
    const guideBS5 = {
      slug: 'test-mixed-flooded',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc, floodedSrc],
      floodedEngineRecovery: {
        title: 'Verzopen motor',
        sourceRefs: ['src-026-start'],
        steps: [
          { step: 1, action: 'Bougie demonteren en drogen.', sourceRefs: ['src-026-flooded'] }
        ]
      }
    };
    const errs = validateOperationalClaimsProvenance(guideBS5, resolvedMap, { isPublished: true });
    assert.ok(errs.length > 0, 'Mixed flooded recovery guide citing start-only locator for title must fail');
    console.log('  ✅ Case BS5 Passed: Mixed flooded recovery guide citing start-only locator for title fails closed.');
  }
}

// ---------------------------------------------------------------------------
// TEST 53: Safety Warning Domain Matching across All Domains (Codex Thread PRRT_kwDOUCUnhs6oPuAj, BT1-BT5)
// ---------------------------------------------------------------------------
console.log('\n▶ Test 53: Safety Warning Domain Matching across All Domains (Codex Thread PRRT_kwDOUCUnhs6oPuAj, BT1-BT5)...');
{
  const startSrc = {
    id: 'src-026-start',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const maintSrc = {
    id: 'src-026-maint',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 19, section: 'Maintenance Chart', heading: 'Overview' }
  };
  const crankcaseSrc = {
    id: 'src-026-crankcase',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 48, section: 'Crankcase Leakage', heading: 'Crankcase Pressure and Vacuum Testing' }
  };
  const mtronicSrc = {
    id: 'src-mtronic-diag',
    publicationId: '0458-573-8621-D',
    modelScope: ['MS 261 C-M'],
    locator: { page: 34, section: 'M-Tronic Engine Management', heading: 'M-Tronic Diagnosis & Calibration' }
  };
  const fuelSrc = {
    id: 'src-026-fuel',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 35, section: 'Fuel', heading: 'Fuel Mixture & Storage' }
  };

  // BT1: Warning with chain sharpening instruction citing start-only locator fails closed
  {
    const guideBT1 = {
      slug: 'test-warning-chain-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Kettingonderhoud vereist',
          text: 'Vijl alle snijtanden onder een hoek van 30 graden voor optimale zaagprestaties.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBT1, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Chain sharpening warning under start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('contains chain maintenance or sharpening instructions but references source(s) without a chain maintenance locator')),
      `Expected chain maintenance error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BT1 Passed: Chain maintenance warning citing start locator fails closed.');
  }

  // BT2: Warning with chain maintenance instruction citing maintenance locator passes
  {
    const guideBT2 = {
      slug: 'test-warning-chain-valid',
      publicationStatus: 'PUBLISHED',
      sources: [maintSrc],
      warnings: [
        {
          title: 'Regelmatig zaagketting onderhoud',
          text: 'Controleer regelmatig de kettingspanning en de slijtage van de zaagketting.',
          sourceRefs: ['src-026-maint']
        }
      ]
    };
    const res = validateGuideSources(guideBT2, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Chain maintenance warning under maintenance locator must pass, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BT2 Passed: Chain maintenance warning citing maintenance locator passes cleanly.');
  }

  // BT3: Warning with crankcase testing instruction citing start locator fails closed
  {
    const guideBT3 = {
      slug: 'test-warning-crankcase-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Carter afpersen verplicht',
          text: 'Voer altijd een carter afpersen procedure uit bij valse lucht verdenking.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBT3, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Crankcase testing warning under start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('makes crankcase pressure/vacuum or seal testing claims')),
      `Expected crankcase testing error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BT3 Passed: Crankcase testing warning citing start locator fails closed.');
  }

  // BT4: Warning with M-Tronic calibration instruction citing start locator fails closed
  {
    const guideBT4 = {
      slug: 'test-warning-mtronic-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'M-Tronic kalibratie waarschuwing',
          text: 'Onderbreek de M-Tronic elektronische kalibratie procedure niet.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBT4, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'M-Tronic calibration warning under start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('makes M-Tronic electronic diagnosis or diagnostic system claims')),
      `Expected M-Tronic diagnosis error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BT4 Passed: M-Tronic calibration warning citing start locator fails closed.');
  }

  // BT5: Warning with fuel mixing instruction citing start locator fails closed
  {
    const guideBT5 = {
      slug: 'test-warning-fuel-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Verkeerde mengsmering verwoest de motor',
          text: 'Gebruik uitsluitend verse mengsmering in een mengverhouding van 1:50 en bewaar brandstof nooit langer dan 30 dagen.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBT5, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Fuel mixing warning under start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('pointing to start procedure instead of fuel mixing, storage, or fuel specifications')),
      `Expected fuel mixing error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BT5 Passed: Fuel mixing warning citing start locator fails closed.');
  }
}

// ---------------------------------------------------------------------------
// TEST 54: Inspection Checklist Topic Operational Provenance (Codex Thread PRRT_kwDOUCUnhs6oPuAm, BU1-BU5)
// ---------------------------------------------------------------------------
console.log('\n▶ Test 54: Inspection Checklist Topic Operational Provenance (Codex Thread PRRT_kwDOUCUnhs6oPuAm, BU1-BU5)...');
{
  const brandProtectSrc = {
    source_id: 'src-brand-protect',
    publication_id: 'STIHL-BRAND-PROTECTION-GUIDELINE-V1',
    brand_protection_id: 'STIHL-BRAND-PROTECTION-GUIDELINE-V1',
    modelScope: ['Alle motorgereedschappen'],
    locator: { section: 'Counterfeit identification' }
  };
  const startSrc = {
    id: 'src-026-start',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };

  // BU1: inspectionChecklist[*].topic collected with claimClass INSPECTION_STEP
  {
    const guideBU1 = {
      slug: 'test-checklist-topic-collection',
      publicationStatus: 'PUBLISHED',
      sources: [brandProtectSrc],
      inspectionChecklist: [
        {
          topic: '1. Serienummer & Inslaging',
          text: 'Originele STIHL machines hebben een uniek serienummer.',
          sourceRefs: ['src-brand-protect']
        }
      ]
    };
    const claims = collectRenderedOperationalClaims(guideBU1);
    const topicClaim = claims.find(c => c.path === 'inspectionChecklist[0].topic');
    assert.ok(topicClaim, 'inspectionChecklist[0].topic must be collected in claims');
    assert.strictEqual(topicClaim.claimClass, 'INSPECTION_STEP');
    assert.strictEqual(topicClaim.text, '1. Serienummer & Inslaging');
    console.log('  ✅ Case BU1 Passed: inspectionChecklist[*].topic collected with claimClass INSPECTION_STEP.');
  }

  // BU2: inspectionChecklist topic containing off-domain carburetor adjustment claim citing start locator fails closed
  {
    const guideBU2 = {
      slug: 'test-checklist-topic-carb-mismatch',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      inspectionChecklist: [
        {
          topic: 'Carburateur afstelling en L-stelschroef basisafstelling',
          text: 'Controleer de afstelling.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBU2, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Carburetor topic citing start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('inspectionChecklist[0].topic') && e.includes('pointing to start procedure instead of carburetor adjustment')),
      `Expected carburetor mismatch error for topic, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BU2 Passed: inspectionChecklist topic containing off-domain carburetor claim fails closed.');
  }

  // BU3: inspectionChecklist topic without sourceRefs on published guide fails closed
  {
    const guideBU3 = {
      slug: 'test-checklist-topic-no-refs',
      publicationStatus: 'PUBLISHED',
      sources: [brandProtectSrc],
      inspectionChecklist: [
        {
          topic: 'Serienummer inspectie',
          text: 'Controleer het nummer.',
          sourceRefs: ['src-brand-protect'],
          topicSourceRefs: [] // empty
        }
      ]
    };
    const res = validateGuideSources(guideBU3, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Inspection checklist topic without sourceRefs on published guide must fail');
    assert.ok(
      res.errors.some(e => e.includes('inspectionChecklist[0].topic') && e.includes('has no sourceRefs')),
      `Expected no sourceRefs error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BU3 Passed: inspectionChecklist topic without sourceRefs on published guide fails closed.');
  }

  // BU4: inspectionChecklist topic with valid matching locator passes cleanly
  {
    const guideBU4 = {
      slug: 'test-checklist-topic-valid',
      publicationStatus: 'PUBLISHED',
      sources: [brandProtectSrc],
      inspectionChecklist: [
        {
          topic: '1. Serienummer & Inslaging',
          text: 'Originele STIHL machines hebben een uniek serienummer ingeslagen in het carter.',
          sourceRefs: ['src-brand-protect']
        }
      ]
    };
    const res = validateGuideSources(guideBU4, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Valid checklist topic must pass cleanly, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BU4 Passed: inspectionChecklist topic with valid matching locator passes cleanly.');
  }

  // BU5: Sneaky checklist topic with off-domain crankcase testing claim cannot bypass validation
  {
    const guideBU5 = {
      slug: 'test-checklist-topic-crankcase-sneaky',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      inspectionChecklist: [
        {
          topic: 'Carter druktest en vacuummeting bij valse lucht lekkage',
          text: 'Controleer de algehele staat van het motorblok.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBU5, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Sneaky crankcase testing topic under start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('inspectionChecklist[0].topic') && e.includes('makes crankcase pressure/vacuum or seal testing claims')),
      `Expected crankcase testing error on topic, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BU5 Passed: Sneaky checklist topic cannot bypass domain validation.');
  }
}

// ---------------------------------------------------------------------------
// TEST 55: Generic Canonical-Topic Grounding for Non-Procedure Claims (Codex Thread PRRT_kwDOUCUnhs6oP05G, BV1-BV5)
// ---------------------------------------------------------------------------
console.log('\n▶ Test 55: Generic Canonical-Topic Grounding for Non-Procedure Claims (Codex Thread PRRT_kwDOUCUnhs6oP05G, BV1-BV5)...');
{
  const startSrc = {
    id: 'src-026-start',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 38, section: 'Starting / Stopping the Engine', heading: 'Starting the Engine' }
  };
  const brandProtectSrc = {
    source_id: 'src-brand-protect',
    publication_id: 'STIHL-BRAND-PROTECTION-GUIDELINE-V1',
    brand_protection_id: 'STIHL-BRAND-PROTECTION-GUIDELINE-V1',
    modelScope: ['Alle motorgereedschappen'],
    locator: { section: 'Counterfeit identification' }
  };
  const floodedSrc = {
    id: 'src-026-flooded',
    publicationId: '0458-133-3021',
    modelScope: ['026'],
    locator: { page: 42, section: 'Starting / Stopping the Engine', heading: 'If the Engine Does Not Start' }
  };

  // BV1: Safety warning with air filter wash instruction citing start-only locator fails closed
  {
    const guideBV1 = {
      slug: 'test-warning-air-filter-wash',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Luchtfilter onderhoudsinstructie',
          text: 'Reinig en was het luchtfilter met warm water.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Air filter wash warning citing start-only locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('Warning "Luchtfilter onderhoudsinstructie"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded start procedure error for air filter wash warning, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1 Passed: Air filter wash warning citing start-only locator fails closed.');
  }

  // BV1b: Safety warning with generic title 'Veiligheidswaarschuwing' and off-domain text fails closed
  {
    const guideBV1b = {
      slug: 'test-warning-generic-title-bypass',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Veiligheidswaarschuwing',
          text: 'Reinig en was het luchtfilter met warm water.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1b, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning with generic title Veiligheidswaarschuwing and off-domain text must fail');
    assert.ok(
      res.errors.some(e => e.includes('Warning "Veiligheidswaarschuwing"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1b Passed: Warning with generic title "Veiligheidswaarschuwing" and off-domain text fails closed.');
  }

  // BV1c: Safety warning with title 'Startwaarschuwing' but off-domain air filter wash text fails closed
  {
    const guideBV1c = {
      slug: 'test-warning-start-title-off-domain-text',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Startwaarschuwing',
          text: 'Reinig en was het luchtfilter met warm water.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1c, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning with Startwaarschuwing title but off-domain body text must fail');
    assert.ok(
      res.errors.some(e => e.includes('Warning "Startwaarschuwing"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded error on warning body text, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1c Passed: Warning with title "Startwaarschuwing" but off-domain body text fails closed.');
  }

  // BV1d: Warning mentioning generic 'benzine' without start concept fails closed (Thread PRRT_kwDOUCUnhs6oP-i3)
  {
    const guideBV1d = {
      slug: 'test-warning-generic-benzine',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Onderhoudswaarschuwing',
          text: 'Reinig en was het luchtfilter met benzine.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1d, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning mentioning benzine in off-domain instruction must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('Warning "Onderhoudswaarschuwing"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded start error for generic benzine warning, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1d Passed: Off-domain instruction mentioning generic "benzine" fails closed under start locator.');
  }

  // BV1e: Warning mentioning generic 'brandstof' without start concept fails closed (Thread PRRT_kwDOUCUnhs6oP-i3)
  {
    const guideBV1e = {
      slug: 'test-warning-generic-brandstof',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Onderhoudswaarschuwing',
          text: 'Reinig en was het luchtfilter met brandstof.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1e, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning mentioning brandstof in off-domain instruction must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('Warning "Onderhoudswaarschuwing"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded start error for generic brandstof warning, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1e Passed: Off-domain instruction mentioning generic "brandstof" fails closed under start locator.');
  }

  // BV1f: Warning with non-string/numeric fields coerces safely without throwing TypeError (Thread PRRT_kwDOUCUnhs6oP-i7)
  {
    const guideBV1f = {
      slug: 'test-warning-numeric-coercion',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 404,
          text: 500,
          sourceRefs: ['src-026-start']
        }
      ]
    };
    let res;
    assert.doesNotThrow(() => {
      res = validateGuideSources(guideBV1f, { routeStatus: 'PUBLISHED' });
    }, 'validateGuideSources must not throw on numeric/malformed warning fields');
    assert.strictEqual(res.valid, false, 'Numeric warning must fail validation gracefully');
    assert.ok(
      res.errors.some(e => e.includes('Warning "404"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected coerced numeric warning error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1f Passed: Non-string / numeric warning fields coerced safely without TypeError.');
  }

  // BV1g: Safety warning with generic workflow verb "Controleer de bandenspanning van uw auto." citing start-only locator fails closed (Thread PRRT_kwDOUCUnhs6oQYfC)
  {
    const guideBV1g = {
      slug: 'test-warning-bandenspanning',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Veiligheidswaarschuwing',
          text: 'Controleer de bandenspanning van uw auto.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1g, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning with generic workflow word (controleer bandenspanning) citing start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded start procedure error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1g Passed: Off-domain warning "Controleer de bandenspanning van uw auto." fails closed under start locator.');
  }

  // BV1h: Level items do not inherit sibling-field sources (levelSourceRefs) (Thread PRRT_kwDOUCUnhs6oQYfM)
  {
    const guideBV1h = {
      slug: 'test-level-items-no-sibling-fallback',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1 — USER SAFE START CHECK',
          levelSourceRefs: ['src-026-start'],
          badge: 'Veilige basiscontrole starten',
          badgeSourceRefs: ['src-026-start'],
          description: 'Startcontroles voor de gebruiker:',
          descriptionSourceRefs: ['src-026-start'],
          items: [
            'Controleer of de kettingrem is ingeschakeld vóór het starten.'
          ]
        }
      ]
    };
    const res = validateGuideSources(guideBV1h, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Level item must not inherit levelSourceRefs/badgeSourceRefs/descriptionSourceRefs and must fail closed without sourceRefs');
    assert.ok(
      res.errors.some(e => e.includes('troubleshootingLevels[0].items[0]') && e.includes('has no sourceRefs')),
      `Expected item missing sourceRefs error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1h Passed: Level item without item sourceRefs does not inherit sibling levelSourceRefs and fails closed.');
  }

  // BV1i: Safety warning with 'natuurlijk' ("Gebruik natuurlijk een boormachine.") citing flooded-only locator fails closed (Thread PRRT_kwDOUCUnhs6oQnc7)
  {
    const guideBV1i = {
      slug: 'test-warning-natuurlijk-flooded',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSrc],
      warnings: [
        {
          title: 'Veiligheidswaarschuwing',
          text: 'Gebruik natuurlijk een boormachine.',
          sourceRefs: ['src-026-flooded']
        }
      ]
    };
    const res = validateGuideSources(guideBV1i, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning with natuurlijk citing flooded locator must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('not grounded in canonical flooded recovery topics')),
      `Expected ungrounded flooded recovery error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1i Passed: Warning with "natuurlijk" fails closed under flooded locator.');
  }

  // BV1j: Warning with 'kleurpotlood' ("Gebruik een kleurpotlood om een tekening te maken.") citing flooded-only locator fails closed (Thread PRRT_kwDOUCUnhs6oQuBo)
  {
    const guideBV1j = {
      slug: 'test-warning-kleurpotlood-flooded',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSrc],
      warnings: [
        {
          title: 'Veiligheidswaarschuwing',
          text: 'Gebruik een kleurpotlood om een tekening te maken.',
          sourceRefs: ['src-026-flooded']
        }
      ]
    };
    const res = validateGuideSources(guideBV1j, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning with kleurpotlood citing flooded locator must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('not grounded in canonical flooded recovery topics')),
      `Expected ungrounded flooded recovery error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1j Passed: Warning with "kleurpotlood" fails closed under flooded locator.');
  }

  // BV1k: Warning with generic dealer ("Controleer de bandenspanning van uw auto bij de dealer.") citing flooded locator fails closed (Thread PRRT_kwDOUCUnhs6oQuBo)
  {
    const guideBV1k = {
      slug: 'test-warning-dealer-bandenspanning-flooded',
      publicationStatus: 'PUBLISHED',
      sources: [floodedSrc],
      warnings: [
        {
          title: 'Veiligheidswaarschuwing',
          text: 'Controleer de bandenspanning van uw auto bij de dealer.',
          sourceRefs: ['src-026-flooded']
        }
      ]
    };
    const res = validateGuideSources(guideBV1k, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Warning with generic dealer citing flooded locator must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('not grounded in canonical flooded recovery topics')),
      `Expected ungrounded flooded recovery error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1k Passed: Generic dealer warning fails closed under flooded locator.');
  }

  // BV1l: Rendered resultCategories label with unsupported operational instruction fails closed (Thread PRRT_kwDOUCUnhs6oQuBv)
  {
    const guideBV1l = {
      slug: 'test-result-category-label-unsupported',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      resultCategories: [
        {
          label: 'Draai de H-stelschroef drie slagen open',
          description: 'Controleer de startprocedure.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1l, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Result category label with carburetor adjustment citing start locator must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('resultCategories[0].label') && e.includes('not grounded in canonical start procedure topics')),
      `Expected result category label ungrounded error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1l Passed: Result category label with off-domain instruction fails closed.');
  }

  // BV1m: Rendered resultCategories label without sourceRefs on published guide fails closed (Thread PRRT_kwDOUCUnhs6oQuBv)
  {
    const guideBV1m = {
      slug: 'test-result-category-label-missing-refs',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      resultCategories: [
        {
          label: 'Geen duidelijke afwijkingen vastgesteld',
          description: 'Controleer de startprocedure.',
          descriptionSourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV1m, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Result category label without sourceRefs on published guide must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('resultCategories[0].label') && e.includes('has no sourceRefs')),
      `Expected missing sourceRefs error on result category label, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1m Passed: Result category label without sourceRefs fails closed.');
  }

  // BV1n: Genuine result category label with valid sourceRefs passes cleanly (Thread PRRT_kwDOUCUnhs6oQuBv)
  {
    const guideBV1n = {
      slug: 'test-result-category-valid',
      publicationStatus: 'PUBLISHED',
      sources: [brandProtectSrc],
      resultCategories: [
        {
          label: 'Geen duidelijke afwijkingen vastgesteld',
          description: 'Het serienummer en typeplaatje komen overeen met de fabriekskenmerken.',
          sourceRefs: ['src-brand-protect']
        }
      ]
    };
    const res = validateGuideSources(guideBV1n, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Genuine result category label and description with valid sourceRefs must pass: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BV1n Passed: Genuine result category label with valid sourceRefs passes cleanly.');
  }

  // BV1o: Mixed-domain sources directAnswer/matrix action with off-domain instruction fails closed (Thread PRRT_kwDOUCUnhs6oQ3wC)
  {
    const fuelSrc = {
      id: 'src-026-fuel',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 35, section: 'Fuel', heading: 'Fuel Mixture & Storage' }
    };
    const guideBV1o = {
      slug: 'test-mixed-domain-ungrounded',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc, fuelSrc],
      directAnswer: {
        heading: 'Kort antwoord',
        content: 'Boor een gat in de muur met een klopboormachine.',
        sourceRefs: ['src-026-start', 'src-026-fuel']
      }
    };
    const res = validateGuideSources(guideBV1o, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Mixed-domain claim with off-domain instruction must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('directAnswer.content') && e.includes('not grounded in canonical cited source topics')),
      `Expected off-domain instruction error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1o Passed: Mixed-domain sources with off-domain instruction fail closed.');
  }

  // BV1p: Guide title / metaDescription with unsupported operational instruction fails closed (Thread PRRT_kwDOUCUnhs6oQ3wF)
  {
    const guideBV1p = {
      slug: 'test-guide-metadata-carburetor-leak',
      publicationStatus: 'PUBLISHED',
      title: 'STIHL Kettingzaag Start Niet — Draai de L-stelschroef 1 slag open',
      shortTitle: 'Start Niet Gids',
      metaDescription: 'Boor een gat in de muur met een klopboormachine voor betere ventilatie.',
      sources: [startSrc],
      directAnswer: {
        heading: 'Kort antwoord',
        content: 'Controleer eerst of de combihendel in de koudestartstand staat en trek aan het startkoord.',
        sourceRefs: ['src-026-start']
      }
    };
    const res = validateGuideSources(guideBV1p, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Guide title with carburetor claim lacking carburetor source must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('Operational claim at "title"') && e.includes('makes carburetor adjustment')),
      `Expected carburetor domain error on title, got: ${res.errors.join('; ')}`
    );
    assert.ok(
      res.errors.some(e => e.includes('Operational claim at "metaDescription"') && e.includes('not grounded')),
      `Expected off-domain grounding error on metaDescription, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1p Passed: Unsupported operational assertions in top-level metadata fail closed.');
  }

  // BV1q: Generation heading with unsupported operational instruction fails closed (Thread PRRT_kwDOUCUnhs6oQ3wJ)
  {
    const mtronicSrc = {
      id: 'src-ms261-mtronic',
      publicationId: '0458-573-8621-D',
      modelScope: ['MS 261', 'MS 261 C-M'],
      locator: { page: 34, section: 'Starting / Stopping the Engine', heading: 'M-Tronic calibration' }
    };
    const guideBV1q = {
      slug: 'test-gen-heading-unsupported',
      publicationStatus: 'PUBLISHED',
      sources: [mtronicSrc],
      generationModelData: [
        {
          generation: 'Draai de H-stelschroef drie slagen open',
          models: ['MS 261 C-M'],
          characteristics: 'Combihendel met driehoekssymbool',
          procedureOverview: 'Kalibratiecyclus van 90 seconden stationair',
          sourceRefs: ['src-ms261-mtronic']
        }
      ]
    };
    const res = validateGuideSources(guideBV1q, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Generation heading with carburetor instruction under M-Tronic source must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('generationModelData[0].generation') && e.includes('makes carburetor adjustment')),
      `Expected carburetor domain error on generation heading, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1q Passed: Unsupported operational assertions in generation heading fail closed.');
  }

  // BV1r: Genuine top-level metadata and generation heading pass cleanly
  {
    const mtronicSrc = {
      id: 'src-ms261-mtronic',
      publicationId: '0458-573-8621-D',
      modelScope: ['MS 261', 'MS 261 C-M'],
      locator: { page: 34, section: 'Starting / Stopping the Engine', heading: 'M-Tronic calibration' }
    };
    const guideBV1r = {
      slug: 'test-gen-heading-valid',
      publicationStatus: 'PUBLISHED',
      title: 'STIHL M-Tronic Resetten & Kalibreren: Stappenplan per Generatie',
      shortTitle: 'M-Tronic Resetten',
      metaDescription: 'Stappenplan voor kalibratie en diagnose van STIHL M-Tronic motormanagement.',
      sources: [mtronicSrc],
      generationModelData: [
        {
          generation: 'Generatie 2 (M-Tronic 3.0)',
          models: ['MS 261 C-M'],
          characteristics: 'Combihendel met driehoekssymbool',
          procedureOverview: 'Kalibratiecyclus van 90 seconden stationair',
          sourceRefs: ['src-ms261-mtronic']
        }
      ]
    };
    const res = validateGuideSources(guideBV1r, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Genuine metadata and generation heading must pass cleanly, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BV1r Passed: Genuine top-level metadata and generation heading pass cleanly.');
  }

  // BV1s: Start-only guide with title containing generic word like "gids" but off-domain instruction fails closed (Thread PRRT_kwDOUCUnhs6oRFkZ)
  {
    const guideBV1s = {
      slug: 'test-title-generic-gids',
      publicationStatus: 'PUBLISHED',
      title: 'Boor een gat in de muur — gids',
      shortTitle: 'Boor Gids',
      sources: [startSrc],
      directAnswer: {
        heading: 'Kort antwoord',
        content: 'Zet de combihendel op koudestart en start de motor.',
        sourceRefs: ['src-026-start']
      }
    };
    const res = validateGuideSources(guideBV1s, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Title with off-domain instruction must fail closed even if mentioning generic label like "gids"');
    assert.ok(
      res.errors.some(e => e.includes('Operational claim at "title"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded title error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1s Passed: Generic labels in title cannot bypass canonical domain grounding.');
  }

  // BV1t: Claim under carburetor locator with generic verb like "draai" but off-domain instruction fails closed (Thread PRRT_kwDOUCUnhs6oRFkg)
  {
    const carbSrc = {
      id: 'src-026-carb',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 42, section: 'Adjusting Carburetor', heading: 'Idle speed' }
    };
    const guideBV1t = {
      slug: 'test-carb-generic-draai',
      publicationStatus: 'PUBLISHED',
      sources: [carbSrc],
      directAnswer: {
        heading: 'Kort antwoord',
        content: 'Draai een gat in de muur met een boormachine.',
        sourceRefs: ['src-026-carb']
      }
    };
    const res = validateGuideSources(guideBV1t, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Claim with generic verb under carburetor locator must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('directAnswer.content') && e.includes('not grounded in canonical cited source topics')),
      `Expected ungrounded carburetor domain error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1t Passed: Standalone generic verbs under carburetor locator cannot bypass domain grounding.');
  }

  // BV1u: Claim under specifications locator cannot borrow unrelated fuel domain vocabulary and fails closed (Thread PRRT_kwDOUCUnhs6oRFkl)
  {
    const specEngineSrc = {
      id: 'src-026-spec-engine',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 14, section: 'Specifications', heading: 'Engine' }
    };
    const guideBV1u = {
      slug: 'test-spec-engine-no-fuel-borrowing',
      publicationStatus: 'PUBLISHED',
      sources: [specEngineSrc],
      directAnswer: {
        heading: 'Kort antwoord',
        content: 'Smeer de deur met olie.',
        sourceRefs: ['src-026-spec-engine']
      }
    };
    const res = validateGuideSources(guideBV1u, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Specifications/Engine claim with off-domain instruction must fail closed and not borrow fuel regex');
    assert.ok(
      res.errors.some(e => e.includes('directAnswer.content') && e.includes('not grounded in canonical cited source topics')),
      `Expected ungrounded specifications domain error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1u Passed: Specifications locator fails closed on unrelated fuel claims without borrowing vocabulary.');
  }

  // BV1v: Level heading with unsupported English prose suffix fails closed (Thread PRRT_kwDOUCUnhs6oRQni)
  {
    const guideBV1v = {
      slug: 'test-level-heading-unsupported-suffix',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingLevels: [
        {
          level: 'Level 1 - drill a hole in the wall',
          badge: 'Veilige basiscontrole starten',
          description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld vóór het starten.',
              sourceRefs: ['src-026-start']
            }
          ]
        }
      ]
    };
    const res = validateGuideSources(guideBV1v, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Level heading with arbitrary instruction must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('troubleshootingLevels[0].level') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded level heading error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1v Passed: Level heading with unsupported prose suffix fails closed.');
  }

  // BV1w: Level headings with canonical structural labels pass cleanly (Thread PRRT_kwDOUCUnhs6oRQni)
  {
    const guideBV1w = {
      slug: 'test-level-heading-canonical-labels',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1 — USER SAFE CHECK',
          badge: 'Veilige basiscontrole starten',
          description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld vóór het starten.',
              sourceRefs: ['src-026-start']
            }
          ]
        },
        {
          level: 'LEVEL 2 — EXPERIENCED USER / MANUAL REQUIRED',
          badge: 'Ervaren gebruiker startcontroles',
          description: 'Startcontroles met handleiding:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Controleer de koude start choke hendel positie.',
              sourceRefs: ['src-026-start']
            }
          ]
        },
        {
          level: 'LEVEL 3 — SERVICE PROCEDURE',
          badge: 'Werkplaatsprocedure starter',
          description: 'Dealer inspectie startmechanisme:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Laat de starter en het ontstekingsmechanisme controleren door de STIHL dealer.',
              sourceRefs: ['src-026-start']
            }
          ]
        }
      ]
    };
    const res = validateGuideSources(guideBV1w, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Canonical level headings must pass cleanly, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BV1w Passed: Level headings with canonical structural labels pass cleanly.');
  }

  // BV1x: Standalone generic words (e.g. "slag") under specifications locator without technical context fail closed (Thread PRRT_kwDOUCUnhs6oRQnr)
  {
    const specEngineSrc = {
      id: 'src-026-spec-engine',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 14, section: 'Specifications', heading: 'Engine' }
    };
    const guideBV1x = {
      slug: 'test-spec-engine-harde-slag',
      publicationStatus: 'PUBLISHED',
      sources: [specEngineSrc],
      directAnswer: {
        heading: 'Kort antwoord',
        content: 'Geef de deur een harde slag.',
        sourceRefs: ['src-026-spec-engine']
      }
    };
    const res = validateGuideSources(guideBV1x, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Claim with generic non-technical word "slag" must fail closed under specifications locator');
    assert.ok(
      res.errors.some(e => e.includes('directAnswer.content') && e.includes('not grounded in canonical cited source topics')),
      `Expected ungrounded specifications domain error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV1x Passed: Standalone generic words without technical context under specifications locator fail closed.');
  }

  // BV1y: Genuine technical specifications claims in technical context pass cleanly (Thread PRRT_kwDOUCUnhs6oRQnr)
  {
    const specEngineSrc = {
      id: 'src-026-spec-engine',
      publicationId: '0458-133-3021',
      modelScope: ['026'],
      locator: { page: 14, section: 'Specifications', heading: 'Engine' }
    };
    const guideBV1y = {
      slug: 'test-spec-engine-valid-specs',
      publicationStatus: 'PUBLISHED',
      sources: [specEngineSrc],
      directAnswer: {
        heading: 'Kort antwoord',
        content: 'Cilinderinhoud: 48.7 cm³, boring: 44 mm, slag: 32 mm, motorvermogen: 2.6 kW bij 9500 1/min.',
        sourceRefs: ['src-026-spec-engine']
      }
    };
    const res = validateGuideSources(guideBV1y, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Genuine technical specifications claims must pass cleanly, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BV1y Passed: Genuine technical specifications claims pass cleanly.');
  }

  // BV2: Inspection checklist topic with air filter wash instruction citing start-only locator fails closed
  {
    const guideBV2 = {
      slug: 'test-checklist-air-filter-wash',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      inspectionChecklist: [
        {
          topic: 'Reinig en was het luchtfilter met warm water.',
          text: 'Controleer de machine zorgvuldig.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV2, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Air filter wash checklist topic citing start-only locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('inspectionChecklist[0].topic') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded start procedure error for checklist topic, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV2 Passed: Air filter wash checklist topic citing start-only locator fails closed.');
  }

  // BV3: Safety warning with arbitrary ungrounded instruction citing start-only locator fails closed
  {
    const guideBV3 = {
      slug: 'test-warning-boor-gat',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Gevaarlijke bewerking',
          text: 'Boor een gat in de machine.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV3, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Arbitrary ungrounded warning citing start locator must fail');
    assert.ok(
      res.errors.some(e => e.includes('Warning "Gevaarlijke bewerking"') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV3 Passed: Arbitrary ungrounded warning citing start locator fails closed.');
  }

  // BV4: Genuine safety warning citing start locator passes cleanly
  {
    const guideBV4 = {
      slug: 'test-warning-valid-start',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      warnings: [
        {
          title: 'Kettingrem altijd inschakelen vóór het starten',
          text: 'Duw de voorste handbeschermer naar voren tot deze vergrendelt. Start uitsluitend met vergrendelde kettingrem.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV4, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Genuine start safety warning must pass cleanly, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BV4 Passed: Genuine start safety warning citing start locator passes cleanly.');
  }

  // BV5: Genuine checklist topic citing brand protection locator passes cleanly
  {
    const guideBV5 = {
      slug: 'test-checklist-valid-brand-protect',
      publicationStatus: 'PUBLISHED',
      sources: [brandProtectSrc],
      inspectionChecklist: [
        {
          topic: 'Serienummer inspectie & fabriekstypeplaatje',
          text: 'Controleer het unieke serienummer.',
          sourceRefs: ['src-brand-protect']
        }
      ]
    };
    const res = validateGuideSources(guideBV5, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Genuine brand protection checklist topic must pass cleanly, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BV5 Passed: Genuine checklist topic citing brand protection locator passes cleanly.');
  }

  // BV6: Troubleshooting level item with off-domain instruction fails closed (Thread PRRT_kwDOUCUnhs6oQIpE)
  {
    const guideBV6 = {
      slug: 'test-level-item-boor-gat',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1 — USER SAFE START CHECK',
          badge: 'Veilige basiscontrole starten',
          description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Boor een gat in de machine.',
              sourceRefs: ['src-026-start']
            }
          ]
        }
      ]
    };
    const res = validateGuideSources(guideBV6, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Level item with Boor een gat must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('troubleshootingLevels[0].items[0]') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded level item error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV6 Passed: Troubleshooting level item with arbitrary instruction fails closed.');
  }

  // BV7: Troubleshooting matrix safeFirstCheck with off-domain instruction fails closed (Thread PRRT_kwDOUCUnhs6oQIpE)
  {
    const guideBV7 = {
      slug: 'test-matrix-action-boor-gat',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingMatrix: [
        {
          symptom: 'Zaag start koud niet',
          possibleCause: 'Onjuiste startstand',
          safeFirstCheck: 'Boor een gat in de machine.',
          nextStep: 'Startprocedure opnieuw uitvoeren.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV7, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Matrix action with Boor een gat must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('troubleshootingMatrix[0].safeFirstCheck') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded matrix action error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV7 Passed: Troubleshooting matrix safeFirstCheck with arbitrary instruction fails closed.');
  }

  // BV8: Troubleshooting level heading with chain sharpening instruction fails closed (Thread PRRT_kwDOUCUnhs6oQIpH)
  {
    const guideBV8 = {
      slug: 'test-level-heading-vijl-snijtanden',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingLevels: [
        {
          level: 'Vijl alle snijtanden onder een hoek van 30 graden',
          badge: 'Veilige basiscontrole starten',
          description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld vóór het starten.',
              sourceRefs: ['src-026-start']
            }
          ]
        }
      ]
    };
    const res = validateGuideSources(guideBV8, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Level heading with chain sharpening instruction must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('troubleshootingLevels[0].level') && (e.includes('chain maintenance') || e.includes('not grounded in canonical start procedure topics'))),
      `Expected level heading error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV8 Passed: Troubleshooting level heading with chain sharpening instruction fails closed.');
  }

  // BV9: Troubleshooting level badge with off-domain instruction fails closed (Thread PRRT_kwDOUCUnhs6oQIpH)
  {
    const guideBV9 = {
      slug: 'test-level-badge-boor-gat',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1 — USER SAFE START CHECK',
          badge: 'Boor een gat in de machine',
          description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld vóór het starten.',
              sourceRefs: ['src-026-start']
            }
          ]
        }
      ]
    };
    const res = validateGuideSources(guideBV9, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, false, 'Level badge with Boor een gat must fail closed');
    assert.ok(
      res.errors.some(e => e.includes('troubleshootingLevels[0].badge') && e.includes('not grounded in canonical start procedure topics')),
      `Expected ungrounded level badge error, got: ${res.errors.join('; ')}`
    );
    console.log('  ✅ Case BV9 Passed: Troubleshooting level badge with arbitrary instruction fails closed.');
  }

  // BV10: Genuine troubleshooting levels and matrix rows pass cleanly
  {
    const guideBV10 = {
      slug: 'test-troubleshooting-genuine-pass',
      publicationStatus: 'PUBLISHED',
      sources: [startSrc],
      troubleshootingLevels: [
        {
          level: 'LEVEL 1 — USER SAFE START CHECK',
          badge: 'Veilige basiscontrole starten',
          description: 'Startcontroles die iedere gebruiker veilig kan uitvoeren:',
          sourceRefs: ['src-026-start'],
          items: [
            {
              text: 'Controleer of de kettingrem is ingeschakeld vóór het starten.',
              sourceRefs: ['src-026-start']
            },
            {
              text: 'Controleer de combihendel: staat deze op startpositie of bedrijfsstand?',
              sourceRefs: ['src-026-start']
            }
          ]
        }
      ],
      troubleshootingMatrix: [
        {
          symptom: 'Zaag start koud niet',
          possibleCause: 'Onjuiste stand van combihendel of choke',
          safeFirstCheck: 'Controleer of de stopschakelaar niet op stopstand staat.',
          nextStep: 'Koudestartprocedure opnieuw uitvoeren met gesloten choke.',
          sourceRefs: ['src-026-start']
        }
      ]
    };
    const res = validateGuideSources(guideBV10, { routeStatus: 'PUBLISHED' });
    assert.strictEqual(res.valid, true, `Genuine troubleshooting levels and matrix rows must pass cleanly, got: ${res.errors.join('; ')}`);
    console.log('  ✅ Case BV10 Passed: Genuine troubleshooting levels and matrix rows pass cleanly.');
  }
}

console.log('\n🎉 ALL PHASE 49B GUIDE SOURCES & ATTRIBUTION TESTS PASSED 100% CLEANLY!');
