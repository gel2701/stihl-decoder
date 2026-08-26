import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderIntentPageHtml } from '../src/components/IntentPageTemplate.js';
import { generateSitemapXml, generateRobotsTxt } from '../src/components/SitemapGenerator.js';
import { generateSeoAuditReport } from '../src/components/SeoAuditEngine.js';
import { getRelatedModels } from '../src/components/RelatedModels.js';
import { buildStructuredData } from '../src/components/StructuredData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL SEO Engine & Pilot Pages Validation Tests...\n');

// Test 1: Pilot Model Page 1 - MS 261 (/kettingzagen/ms-261/)
const ms261 = database.models.find(m => m.slug === 'ms-261' || m.id === 'stihl_ms_261_cm');
assert.ok(ms261);
const html261 = renderModelPageHtml(ms261, database);
assert.ok(html261.includes('STIHL MS 261 C-M Serienummer Decoder &amp; Modelinformatie') || html261.includes('STIHL MS 261 C-M Serienummer Decoder & Modelinformatie'));
assert.ok(html261.includes('50.2 cc'));
assert.ok(html261.includes('NGK CMR6H'));
assert.ok(html261.includes('Geschatte productieperiode'));
console.log('✅ Test 1 Passed: Pilot Model Page 1 (MS 261) SSR HTML rendered correctly.');

// Test 2: Pilot Model Page 2 - MS 260 (/kettingzagen/ms-260/)
const ms260 = database.models.find(m => m.slug === 'ms-260' || m.id === 'stihl_ms_260');
assert.ok(ms260);
const html260 = renderModelPageHtml(ms260, database);
assert.ok(html260.includes('MS 260'));
assert.ok(html260.includes('3.5 pk'));
console.log('✅ Test 2 Passed: Pilot Model Page 2 (MS 260) SSR HTML rendered correctly.');

// Test 3: Pilot Model Page 3 - FS 350 (/bosmaaiers/fs-350/)
const fs350 = database.models.find(m => m.slug === 'fs-350' || m.id === 'stihl_fs_350');
assert.ok(fs350);
const html350 = renderModelPageHtml(fs350, database);
assert.ok(html350.includes('FS 350'));
assert.ok(html350.includes('Bosmaaier'));
console.log('✅ Test 3 Passed: Pilot Model Page 3 (FS 350) SSR HTML rendered correctly.');

// Test 4: Database-driven Related Models
const related = getRelatedModels(ms261, database);
assert.ok(related.length > 0);
assert.ok(related.some(m => m.slug === 'ms-260'));
console.log('✅ Test 4 Passed: Database-driven related models resolved MS 260 for MS 261.');

// Test 5: Centralized Structured Data Builder
const jsonLd = buildStructuredData({
  pageType: 'model',
  model: ms261,
  breadcrumbs: [{ name: 'Home', url: '/' }, { name: 'Kettingzagen', url: '/kettingzagen/' }],
  url: 'https://stihldecoder.nl/kettingzagen/ms-261/'
});
assert.strictEqual(jsonLd['@context'], 'https://schema.org');
assert.ok(jsonLd['@graph'].some(g => g['@type'] === 'BreadcrumbList'));
assert.ok(jsonLd['@graph'].some(g => g['@type'] === 'TechArticle'));
assert.ok(jsonLd['@graph'].some(g => g['@type'] === 'FAQPage'));
console.log('✅ Test 5 Passed: Centralized StructuredData builder generated valid Schema.org graph.');

// Test 6: SEO Audit & Quality Score Engine
const audit = generateSeoAuditReport(database);
assert.ok(audit.totalIndexablePages > 0);
assert.ok(audit.averageQualityScore >= 80);
console.log(`✅ Test 6 Passed: Internal SEO Audit generated (Average Quality Score: ${audit.averageQualityScore}/100).`);

console.log('\n🎉 ALL SEO ENGINE & PILOT PAGES VALIDATION TESTS PASSED 100% CLEANLY!');
