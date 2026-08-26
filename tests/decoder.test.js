import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StopHelingService } from '../src/StopHelingService.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import { StihlDecoderService } from '../src/StihlDecoderService.js';
import { StihlRangeResolver } from '../src/StihlRangeResolver.js';
import { generateModelJsonLd } from '../src/components/ModelJsonLd.js';
import { generateSitemapXml, generateRobotsTxt } from '../src/components/SitemapGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Programmatic SEO & Breakpoints Engine Tests...\n');

// Test 1: StihlRangeResolver exact breakpoint match for MS 261 C-M Gen 2
const rangeRes = StihlRangeResolver.resolve(184592301, '1', database);
assert.strictEqual(rangeRes.yearRangeFormatted, '2016 – Heden');
assert.strictEqual(rangeRes.generation, 'MS 261 C-M Gen 2 (Facelift / V2)');
console.log('✅ Test 1 Passed: StihlRangeResolver matched exact breakpoint.');

// Test 2: generateSitemapXml output validation
const sitemapXml = generateSitemapXml('https://stihldecoder.nl', database);
assert.ok(sitemapXml.includes('<loc>https://stihldecoder.nl/modellen/kettingzagen/stihl-ms-261-c-m</loc>'));
assert.ok(sitemapXml.includes('<loc>https://stihldecoder.nl/gidsen/stihl-gietklok-aflezen</loc>'));
console.log('✅ Test 2 Passed: generateSitemapXml generated valid XML with dynamic model & guide URLs.');

// Test 3: generateRobotsTxt output validation
const robotsTxt = generateRobotsTxt('https://stihldecoder.nl');
assert.ok(robotsTxt.includes('Sitemap: https://stihldecoder.nl/sitemap.xml'));
console.log('✅ Test 3 Passed: generateRobotsTxt generated valid robots.txt.');

// Test 4: generateModelJsonLd Schema.org validation
const jsonLd = generateModelJsonLd({
  modelName: 'MS 261 C-M',
  category: 'Kettingzaag',
  displacementCc: 50.2,
  powerHp: 4.1,
  sparkPlug: 'NGK CMR6H',
  carbSettings: { H: 'M-Tronic', L: 'M-Tronic', LA: 'M-Tronic' },
  url: 'https://stihldecoder.nl/modellen/kettingzagen/stihl-ms-261-c-m'
});
assert.strictEqual(jsonLd['@context'], 'https://schema.org');
assert.strictEqual(jsonLd['@graph'].length, 3);
assert.strictEqual(jsonLd['@graph'][0]['@type'], 'TechArticle');
assert.strictEqual(jsonLd['@graph'][1]['@type'], 'Product');
assert.strictEqual(jsonLd['@graph'][2]['@type'], 'FAQPage');
console.log('✅ Test 4 Passed: generateModelJsonLd returned TechArticle, Product & FAQPage Schema.org graph.');

console.log('\n🎉 ALL PROGRAMMATIC SEO & BREAKPOINTS ENGINE TESTS PASSED SUCCESSFULLY!');
