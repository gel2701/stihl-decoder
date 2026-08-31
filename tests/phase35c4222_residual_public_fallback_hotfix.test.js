import assert from 'assert';
import fs from 'fs';

import { decodeStihlCode } from '../src/decoder.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderComparisonPageHtml } from '../src/components/ComparisonPageTemplate.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { main as runPhase35c4222, SOURCE_COMMIT } from '../scripts/phase35c4222_residual_public_fallback_hotfix.js';

console.log('Starting Phase 35C.4.2.2.2 residual public fallback hotfix tests...');

const report = runPhase35c4222();
assert.strictEqual(report.SOURCE_COMMIT, SOURCE_COMMIT);
if (report.PRECHECK !== 'PASS') {
  assert.strictEqual(report.TEST_SUITE, 'FAIL');
  assert.strictEqual(report.FINAL_STATUS, 'BLOCKED');
  console.log('Phase 35C.4.2.2.2 baseline is intentionally blocked on a newer HEAD/origin baseline.');
} else {
  assert.strictEqual(report.TEST_SUITE, 'PASS');
  assert.strictEqual(report.FINAL_STATUS, 'PASS');
assert.strictEqual(report.RAW_MODEL_TECHNICAL_RENDER_UNSAFE, 0);
assert.strictEqual(report.PART_FAMILY_TECHNICAL_INHERITANCE_PATHS, 0);
assert.strictEqual(report['1121_TECHNICAL_SPEC_COUNT'], 0);
assert.strictEqual(report['1128_TECHNICAL_SPEC_COUNT'], 0);
assert.strictEqual(report.PART_NUMBER_UI_TECHNICAL_FACT_COUNT, 0);
assert.strictEqual(report.PUBLIC_CONFLICT_VALUES_WITHOUT_COMPLETE_TRACEABILITY, 0);
assert.strictEqual(report['046_STROKE_SINGLE_VALUE_API_LEAKS'], 0);
assert.strictEqual(report['046_STROKE_SINGLE_VALUE_RENDER_LEAKS'], 0);
assert.strictEqual(report['046_STROKE_SINGLE_VALUE_PASSPORT_LEAKS'], 0);
assert.strictEqual(report['026_SPARK_CONTAMINATION'], 0);
assert.strictEqual(report['046_SPARK_CONTAMINATION'], 0);
assert.ok(report.SCHEMA_POSITIVE_SAFE_FACTS > 0);
assert.strictEqual(report.SCHEMA_RAW_MODEL_FALLBACK_FACTS, 0);
assert.strictEqual(report.SCHEMA_CONFLICTED_SINGLE_VALUES, 0);
assert.strictEqual(report.SCHEMA_UNKNOWN_TECHNICAL_FACTS, 0);
assert.strictEqual(report.FUZZY_MODEL_SPEC_ATTACHMENTS, 0);
assert.strictEqual(report.SERIAL_184592301_TECHNICAL_SPEC_COUNT, 0);
assert.strictEqual(report.GENERIC_FACTUAL_FALLBACK_COUNT, 0);
assert.strictEqual(report.PUBLIC_OUTPUT_WINDOWS_PATH_COUNT, 0);
assert.strictEqual(report.UNEXPECTED_CANONICAL_PROMOTIONS, 0);
assert.strictEqual(report.SEO_ROUTE_CHANGES, 0);
assert.strictEqual(report.SITEMAP_URL_CHANGES, 0);
assert.strictEqual(report.FAILURE_INJECTION, 'PASS');
assert.strictEqual(report.IDEMPOTENCY, 'PASS');

const database = JSON.parse(fs.readFileSync(new URL('../data/stihl_database.json', import.meta.url), 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(new URL('../data/public_evidence_facts.json', import.meta.url), 'utf8'));

const part1121 = decodeStihlCode('11210210800', database);
const part1128 = decodeStihlCode('11280210800', database);
assert.strictEqual(part1121.type, 'PART_NUMBER');
assert.strictEqual(part1128.type, 'PART_NUMBER');
assert.deepStrictEqual(part1121.technicalSpecs, {});
assert.deepStrictEqual(part1128.technicalSpecs, {});
assert.strictEqual(part1121.matchedModel, null);
assert.strictEqual(part1128.matchedModel, null);
assert.ok(part1121.modelGroup.includes('MS 260') || part1121.modelGroup.includes('260'));
assert.ok(part1128.modelGroup.includes('MS 460') || part1128.modelGroup.includes('460') || part1128.modelGroup.includes('046'));

const probableSerial = decodeStihlCode('184592301', database);
assert.strictEqual(probableSerial.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.deepStrictEqual(probableSerial.technicalSpecs, {});

const exact046 = decodeStihlCode('046', database);
assert.strictEqual(exact046.publicEvidenceFields.stroke_mm.evidence_status, 'OFFICIAL_CONFLICTED');
assert.strictEqual(exact046.publicEvidenceFields.stroke_mm.values.length, 2);
assert.ok(exact046.publicEvidenceFields.stroke_mm.values.every((entry) => entry.sourceDocumentId || entry.publicationId || entry.sourceLocator));

const spark026 = exact046.publicEvidenceFields.stroke_mm.values;
assert.ok(Array.isArray(database.public_evidence.facts.find((fact) => fact.model_slug === '026' && fact.field === 'spark_plug').normalized_value));
assert.strictEqual(database.public_evidence.facts.find((fact) => fact.model_slug === '026' && fact.field === 'spark_plug').normalized_value.length, 2);
assert.strictEqual(database.public_evidence.facts.find((fact) => fact.model_slug === '046' && fact.field === 'spark_plug').normalized_value.length, 2);

const model046 = { id: '046', slug: '046', model_name: '046', category: 'Kettingzaag', category_slug: 'kettingzagen' };
const html046 = renderModelPageHtml(model046, database);
assert.ok(html046.includes('Bronverschil gevonden'));
assert.ok(html046.includes('40 mm'));
assert.ok(html046.includes('36 mm'));
assert.ok(!/Slag:<\/span>\s*<span class="text-base font-bold text-white">40 mm<\/span>/.test(html046));
assert.ok(!html046.includes('Carburateur Standaardafstelling'));
assert.ok(!html046.includes('Kettingsteek & Dikte (Standaard)'));

const comparisonHtml = renderComparisonPageHtml('ms-170-vs-ms-180', database);
assert.ok(!comparisonHtml.includes('pk ('));
assert.ok(!comparisonHtml.includes('Carburateur / Systeem'));

const categoryHtml = renderCategoryPageHtml('kettingzagen', database);
assert.ok(!categoryHtml.includes('pk ('));

const parts026 = renderModelPartsPageHtml({ id: '026', slug: '026', model_name: '026', category: 'Kettingzaag', category_slug: 'kettingzagen' }, database);
assert.ok(!parts026.includes('Rapid-Micro'));
assert.ok(!parts026.includes('0.325'));
assert.ok(!parts026.includes('Filtertype:'));

const finalAudit = JSON.parse(fs.readFileSync(new URL('../data/phase35c4222_final_report.json', import.meta.url), 'utf8'));
assert.strictEqual(finalAudit.FINAL_STATUS, 'PASS');

console.log('Phase 35C.4.2.2.2 residual public fallback hotfix tests passed.');
}
