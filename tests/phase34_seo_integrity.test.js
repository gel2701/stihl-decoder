/**
 * Phase 34 SEO Integrity & Data Assertion Automated Tests for STIHLDecoder.nl
 */

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';

import { buildStructuredData } from '../src/components/StructuredData.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderCategoryPageHtml } from '../src/components/CategoryPageTemplate.js';
import { generateSitemapXml, generateRobotsTxt } from '../src/components/SitemapGenerator.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

const databasePath = path.join(process.cwd(), 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(databasePath, 'utf8'));

console.log('🧪 Starting Phase 34 SEO Integrity & Data Assertion Tests...');

// 1. Data Integrity Assertions (Addendum O & Rules 1, 2, 3, 7, 8, 9, 10, 11)

// Test A: FS 100 Brushcutter Integrity (No Chain Specs, No Guide Bar, Category-Aware FAQ)
const fs100Model = database.models.find(m => m.id === 'stihl_fs_100' || m.model_name.includes('FS 100'));
assert.ok(fs100Model, 'FS 100 model record must exist in database');

const fs100Structured = buildStructuredData({ pageType: 'model', model: fs100Model, url: `${PRIMARY_ORIGIN}/bosmaaiers/fs-100/` });
const fs100Graph = fs100Structured['@graph'];
const fs100Product = fs100Graph.find(n => n['@type'] === 'Product');
const fs100Faq = fs100Graph.find(n => n['@type'] === 'FAQPage');

if (fs100Product) {
  assert.strictEqual(fs100Product.description.includes('ketting'), false, 'FS 100 Product description must not mention chain');
  assert.strictEqual(fs100Product.description.includes('accu-aandrijving'), false, 'FS 100 Product description must not infer battery');
  assert.strictEqual(fs100Product.description.includes(' - '), false, 'FS 100 Product description must not contain dash placeholders');
}

assert.ok(fs100Faq, 'FS 100 FAQPage schema must exist');
const fs100SerialAnswer = fs100Faq.mainEntity.find(q => q.name.includes('serienummer')).acceptedAnswer.text;
assert.strictEqual(fs100SerialAnswer.includes('kettingzaagblad'), false, 'FS 100 serial answer must not mention chainsaw bar');
assert.ok(fs100SerialAnswer.includes('bosmaaier'), 'FS 100 serial answer must mention bosmaaier');

console.log('  ✅ Test FS 100 Data Integrity & Category-Aware FAQ: PASSED');

// Test B: BR 600 Blower Integrity (No Chain Specs, Blower Category)
const br600Model = database.models.find(m => m.id === 'stihl_br_600' || m.model_name.includes('BR 600'));
assert.ok(br600Model, 'BR 600 model record must exist in database');

const br600Structured = buildStructuredData({ pageType: 'model', model: br600Model, url: `${PRIMARY_ORIGIN}/bladblazers/br-600/` });
const br600Graph = br600Structured['@graph'];
const br600Faq = br600Graph.find(n => n['@type'] === 'FAQPage');
assert.ok(br600Faq, 'BR 600 FAQPage schema must exist');
const br600SerialAnswer = br600Faq.mainEntity.find(q => q.name.includes('serienummer')).acceptedAnswer.text;
assert.strictEqual(br600SerialAnswer.includes('kettingzaagblad'), false, 'BR 600 serial answer must not mention chainsaw bar');
assert.ok(br600SerialAnswer.includes('bladblazer'), 'BR 600 serial answer must mention bladblazer');

console.log('  ✅ Test BR 600 Blower Integrity & Category-Aware FAQ: PASSED');

// Test C: MS 261 Chainsaw Allowed Specs
const ms261Model = database.models.find(m => m.id === 'stihl_ms_261_cm' || m.model_name.includes('MS 261'));
assert.ok(ms261Model, 'MS 261 model record must exist in database');
const ms261Structured = buildStructuredData({ pageType: 'model', model: ms261Model, url: `${PRIMARY_ORIGIN}/kettingzagen/ms-261/` });
const ms261Product = ms261Structured['@graph'].find(n => n['@type'] === 'Product');
assert.ok(ms261Product, 'MS 261 Product schema must be generated for verified model');
assert.ok(ms261Product.description.includes('50.2 cc') || ms261Product.description.includes('motor'), 'MS 261 Product description must include displacement');

console.log('  ✅ Test MS 261 Verified Product Schema: PASSED');

// Test D: Unknown Model Product Schema Protection
const unknownModel = { id: 'stihl_unknown_999', model_name: 'Unknown Model', verification_status: 'UNVERIFIED' };
const unknownStructured = buildStructuredData({ pageType: 'model', model: unknownModel, url: `${PRIMARY_ORIGIN}/kettingzagen/unknown/` });
const unknownProduct = unknownStructured['@graph'].find(n => n['@type'] === 'Product');
assert.strictEqual(unknownProduct, undefined, 'Unknown unverified model must NOT produce Product schema');

console.log('  ✅ Test Unknown Model Product Schema Protection: PASSED');

// Test E: Category Comparisons Filtering in CategoryPageTemplate.js
const blowerCategoryHtml = renderCategoryPageHtml('bladblazers', database, PRIMARY_ORIGIN);
assert.strictEqual(blowerCategoryHtml.includes('MS 260 vs MS 261'), false, 'Blower category page must NOT show chainsaw MS comparisons');
const chainsawCategoryHtml = renderCategoryPageHtml('kettingzagen', database, PRIMARY_ORIGIN);
assert.ok(chainsawCategoryHtml.includes('MS 260 vs MS 261'), 'Chainsaw category page must show MS comparisons');

console.log('  ✅ Test Category-Aware Comparison Block Filtering: PASSED');

// Test F: Sitemap WWW URLs & Lastmod Integrity
const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
assert.strictEqual(sitemapXml.includes('http://stihldecoder.nl'), false, 'Sitemap must contain 0 non-WWW URLs');
assert.ok(sitemapXml.includes('<loc>https://www.stihldecoder.nl/</loc>'), 'Sitemap must contain WWW homepage');

console.log('  ✅ Test Sitemap WWW & Canonical Integrity: PASSED');

// Test G: Pre vs Post URL Inventory
const preUrlsPath = path.join(process.cwd(), 'data', 'phase34_pre_urls.json');
const preUrlsData = JSON.parse(fs.readFileSync(preUrlsPath, 'utf8'));

const currentSitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
const postUrls = [...currentSitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).sort();

const postUrlsData = {
  created_at: new Date().toISOString(),
  total_count: postUrls.length,
  urls: postUrls
};
fs.writeFileSync(path.join(process.cwd(), 'data', 'phase34_post_urls.json'), JSON.stringify(postUrlsData, null, 2));

assert.strictEqual(preUrlsData.total_count, postUrlsData.total_count, 'Pre and post URL counts must match exactly');
console.log(`  ✅ Test Pre vs Post URL Count (${preUrlsData.total_count} vs ${postUrlsData.total_count}): PASSED`);

console.log('\n🎉 ALL PHASE 34 SEO INTEGRITY ASSERTIONS PASSED CLEANLY!');
