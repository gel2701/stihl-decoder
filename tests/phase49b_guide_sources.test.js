import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { getStructuredGuide, getAllStructuredGuides } from '../src/content/guides/index.js';
import {
  resolveGuideSource,
  validateProcedureStepsProvenance,
  validateAllGuides
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
assert.strictEqual(validation.valid, true, `All guides must pass canonical source resolution: ${validation.errors.join('; ')}`);
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

// 5. Negative Cases (Strict Validation Enforcements)
console.log('\n▶ Test 5: Negative cases: rejecting invalid, fabricated, or overly broad sources...');

// Negative Case A: Fabricated publication ID
assert.throws(() => {
  resolveGuideSource({
    id: 'src-fake-123',
    documentTitle: 'Fake Manual',
    publicationId: '9999-999-9999',
    modelScope: 'MS 260'
  });
}, /does not exist in document registry or canonical primary documents/i, 'Must reject fabricated publication ID');

// Negative Case B: Scope widening beyond canonical document
assert.throws(() => {
  resolveGuideSource({
    id: 'src-widened',
    documentTitle: 'STIHL 026 Manual',
    publicationId: '0458-133-3021',
    modelScope: 'STIHL 026 / MS 260 / MS 261' // widened scope
  });
}, /exceeds canonical scope/i, 'Must reject scope widening');

// Negative Case C: Free-text used as publicationId
assert.throws(() => {
  resolveGuideSource({
    id: 'src-free-text',
    documentTitle: 'STIHL Veiligheidsrichtlijn',
    publicationId: 'STIHL Veiligheidsrichtlijn',
    modelScope: 'Universeel'
  });
}, /appears to be free-text description/i, 'Must reject free text as publicationId');

// Negative Case D: Procedure step without sourceRefs
assert.throws(() => {
  const guideWithUnsourcedStep = {
    sources: [{ id: 'src-valid', publicationId: '0458-133-3021', modelScope: '026' }],
    startProcedures: {
      documentedExamples: {
        ex1: {
          steps: [{ step: 1, title: 'Test Step', text: 'No source' }]
        }
      }
    }
  };
  const errors = validateProcedureStepsProvenance(guideWithUnsourcedStep);
  if (errors.length > 0) throw new Error(errors[0]);
}, /has no sourceRefs/i, 'Must reject procedure step without sourceRefs');

// Negative Case E: Step with unknown sourceRef
assert.throws(() => {
  const guideWithUnknownRef = {
    sources: [{ id: 'src-valid', publicationId: '0458-133-3021', modelScope: '026' }],
    startProcedures: {
      documentedExamples: {
        ex1: {
          steps: [{ step: 1, title: 'Test Step', text: 'Step text', sourceRefs: ['src-nonexistent'] }]
        }
      }
    }
  };
  const errors = validateProcedureStepsProvenance(guideWithUnknownRef);
  if (errors.length > 0) throw new Error(errors[0]);
}, /references unknown sourceRef "src-nonexistent"/i, 'Must reject unknown sourceRef');

console.log('  ✅ Test 5 Passed: All 5 negative cases successfully rejected by resolver.');

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
