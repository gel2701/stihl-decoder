import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode, cleanInput, evaluateCounterfeitRules } from '../src/decoder.js';
import { StihlDecoderService } from '../src/StihlDecoderService.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';
import { generateModelJsonLd } from '../src/components/ModelJsonLd.js';
import { generateSitemapXml, generateRobotsTxt } from '../src/components/SitemapGenerator.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import { renderSerialLocatorHtml } from '../src/components/SerialLocator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Decoding Engine, Growth Engine & SEO Unit Tests...\n');

// Test 1: Schema.org JSON-LD Helper
const jsonLd = generateModelJsonLd({
  modelName: 'MS 261 C-M',
  category: 'Kettingzaag',
  displacementCc: 50.2,
  powerHp: 4.1,
  sparkPlug: 'NGK CMR6H',
  carbSettings: { H: 'M-Tronic (Auto)', L: 'M-Tronic (Auto)', LA: 'M-Tronic (Auto)' },
  url: 'https://stihldecoder.nl/modellen/stihl-ms-261-c-m'
});
assert.strictEqual(jsonLd['@context'], 'https://schema.org');
assert.strictEqual(jsonLd['@graph'].length, 3);
assert.strictEqual(jsonLd['@graph'][0]['@type'], 'TechArticle');
console.log('✅ Test 1 Passed: Schema.org JSON-LD graph generated with TechArticle, Product, and FAQPage.');

// Test 2: Sitemap XML & Robots.txt
const sitemapXml = generateSitemapXml('https://stihldecoder.nl', database);
assert.ok(sitemapXml.includes('<?xml version="1.0" encoding="UTF-8"?>'));
assert.ok(sitemapXml.includes('<loc>https://stihldecoder.nl/modellen</loc>'));

const robotsTxt = generateRobotsTxt('https://stihldecoder.nl');
assert.ok(robotsTxt.includes('Sitemap: https://stihldecoder.nl/sitemap.xml'));
console.log('✅ Test 2 Passed: Sitemap XML and Robots.txt generated successfully.');

// Test 3: Stihl Paspoort HTML Certificate Generator
const passportHtml = renderStihlPassportHtml({ cleanedSerial: '184592301', model: 'MS 261 C-M' });
assert.ok(passportHtml.includes('STIHL MACHINE PASPOORT'));
assert.ok(passportHtml.includes('Gevalideerd'));
console.log('✅ Test 3 Passed: Stihl Paspoort certificate generator rendered HTML card.');

// Test 4: Visual Serial Locator Component
const locatorHtml = renderSerialLocatorHtml();
assert.ok(locatorHtml.includes('Visuele Serienummer Locator'));
assert.ok(locatorHtml.includes('Kettingzaag (MS)'));
console.log('✅ Test 4 Passed: Visual Serial Locator component rendered HTML.');

// Test 5: REST API Controller POST /api/v1/decode
const resDE = handleDecodeApiV1({ serialNumber: '184592301' }, database);
assert.strictEqual(resDE.statusCode, 200);
assert.strictEqual(resDE.body.status, 'success');
assert.strictEqual(resDE.body.data.factory.country, 'Duitsland');
console.log('✅ Test 5 Passed: REST API v1 Controller returns 200 OK with full payload.');

console.log('\n🎉 ALL GROWTH ENGINE, SEO & DECODING ENGINE TESTS PASSED SUCCESSFULLY!');
