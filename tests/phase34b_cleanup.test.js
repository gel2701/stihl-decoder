import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { renderAffiliateLink } from '../src/components/AffiliateLink.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import {
  INDEXABLE_COMPARISONS,
  getFuelDriveLabel,
  getRegisteredComparisonForModel,
  getSafeModelPath,
  resolveComparisonRoute
} from '../src/publicationRules.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const indexPath = path.join(__dirname, '..', 'index.html');

const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const indexHtml = fs.readFileSync(indexPath, 'utf8');

console.log('🧪 Starting Phase 34B cleanup assertions...');

const ms261 = database.models.find((model) => model.slug === 'ms-261');
const fs100 = database.models.find((model) => model.slug === 'fs-100');
const br600 = database.models.find((model) => model.slug === 'br-600');

assert.ok(ms261 && fs100 && br600, 'Validation models must exist.');

const syntheticPattern = /\b\d{4}-(CHAIN|CARB|AIRFILTER|SPARK)\b/;

const internalSearchLink = renderAffiliateLink({
  partName: 'Bougie voor STIHL MS 261',
  searchQuery: 'bougie STIHL MS 261',
  category: 'spark_plug'
});
assert.ok(internalSearchLink.includes('href="/onderdeelnummer/"'), 'Internal parts CTA must point to the internal WWW-safe route.');
assert.ok(internalSearchLink.includes('data-search-query="bougie STIHL MS 261"'), 'Search CTA should retain free-text search intent.');
assert.strictEqual(internalSearchLink.includes('data-part-number='), false, 'Search CTA must not fabricate a part number.');
assert.strictEqual(internalSearchLink.includes('sponsored'), false, 'Internal search CTA must not be marked sponsored.');
assert.strictEqual(internalSearchLink.includes('https://stihldecoder.nl'), false, 'Internal search CTA must not point to apex URLs.');

const verifiedPartLink = renderAffiliateLink({
  partName: 'Officiële bougie',
  partNumber: '0000-TEST',
  searchQuery: 'bougie STIHL MS 261',
  category: 'spark_plug'
});
assert.ok(verifiedPartLink.includes('data-part-number="0000-TEST"'), 'Verified part-number CTA may expose a real part number payload.');

const ms261PartsHtml = renderModelPartsPageHtml(ms261, database, PRIMARY_ORIGIN);
const fs100PartsHtml = renderModelPartsPageHtml(fs100, database, PRIMARY_ORIGIN);
const br600PartsHtml = renderModelPartsPageHtml(br600, database, PRIMARY_ORIGIN);

assert.strictEqual(syntheticPattern.test(ms261PartsHtml), false, 'MS261 parts page must not expose synthetic part codes.');
assert.strictEqual(syntheticPattern.test(fs100PartsHtml), false, 'FS100 parts page must not expose synthetic part codes.');
assert.strictEqual(syntheticPattern.test(br600PartsHtml), false, 'BR600 parts page must not expose synthetic part codes.');
assert.strictEqual(fs100PartsHtml.includes('Zaagketting & Geleideblad'), false, 'FS100 parts page must not show chainsaw-only parts blocks.');
assert.strictEqual(br600PartsHtml.includes('Zaagketting & Geleideblad'), false, 'BR600 parts page must not show chainsaw-only parts blocks.');

assert.strictEqual(getFuelDriveLabel({ fuel_type: 'ELECTRIC', fuel_type_label: null }), 'Elektrische aandrijving', 'Electric models must map to an explicit electric label.');
assert.strictEqual(getFuelDriveLabel({ fuel_type: null, fuel_type_label: null }), 'Niet vastgesteld', 'Unknown fuel type must not fall back to petrol.');

assert.deepStrictEqual(INDEXABLE_COMPARISONS, [
  'ms-170-vs-ms-180',
  'ms-260-vs-ms-261',
  'ms-361-vs-ms-362'
], 'Registered comparisons must remain explicit and finite.');

const canonicalComparison = resolveComparisonRoute('ms-170-vs-ms-180', database);
assert.strictEqual(canonicalComparison.status, 'CANONICAL', 'Registered canonical comparison must stay indexable.');
assert.strictEqual(canonicalComparison.canonicalSlug, 'ms-170-vs-ms-180');

const reverseComparison = resolveComparisonRoute('ms-180-vs-ms-170', database);
assert.strictEqual(reverseComparison.status, 'REDIRECT', 'Reverse duplicate comparison must resolve as redirect-only.');
assert.strictEqual(reverseComparison.canonicalSlug, 'ms-170-vs-ms-180');

const unregisteredComparison = resolveComparisonRoute('ms-210-vs-ms-170', database);
assert.strictEqual(unregisteredComparison.status, 'UNREGISTERED', 'Unregistered comparison routes must not be indexable.');

const ms261Comparison = getRegisteredComparisonForModel(ms261, database);
const fs100Comparison = getRegisteredComparisonForModel(fs100, database);
assert.strictEqual(ms261Comparison?.comparisonSlug, 'ms-260-vs-ms-261', 'MS261 should only expose its registered comparison.');
assert.strictEqual(fs100Comparison, null, 'FS100 must not auto-generate a comparison partner.');

assert.strictEqual(indexHtml.includes('Voer het 9-cijferige serienummer in'), false, 'Homepage must not force a universal 9-digit serial wording.');
assert.strictEqual(indexHtml.includes('Hoe vindt u het echte 9-cijferige serienummer?'), false, 'Homepage warning copy must use generic serial wording.');
assert.strictEqual(indexHtml.includes('🔥 Benzine-aandrijving'), false, 'Homepage renderer must not fall back to a generic petrol label.');
assert.strictEqual(indexHtml.includes('https://stihldecoder.nl'), false, 'Homepage must not embed apex-origin internal URLs.');

console.log(`✅ Phase 34B cleanup assertions passed for ${INDEXABLE_COMPARISONS.length} registered comparisons and safe parts/fuel handling.`);
