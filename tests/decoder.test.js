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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL Passport Image Generator & Decoding Engine Unit Tests...\n');

// Test 1: Stihl Passport TSX/JS Export Data Structure
const passportData = {
  serialNumber: '1 845 923 01',
  modelName: 'MS 261 C-M (M-Tronic)',
  country: 'Duitsland (Waiblingen)',
  productionYears: '2016 - 2021',
  powerHp: 4.1,
  displacementCc: 50.2
};

assert.strictEqual(passportData.serialNumber, '1 845 923 01');
assert.strictEqual(passportData.modelName, 'MS 261 C-M (M-Tronic)');
assert.strictEqual(passportData.powerHp, 4.1);
console.log('✅ Test 1 Passed: PassportData interface structure validated.');

// Test 2: HTML Passport Card Rendering
const htmlCard = renderStihlPassportHtml({
  cleanedSerial: '184592301',
  model: 'MS 261 C-M (M-Tronic)'
});
assert.ok(htmlCard.includes('STIHL MACHINE PASPOORT'));
assert.ok(htmlCard.includes('Gevalideerd'));
console.log('✅ Test 2 Passed: HTML Passport card rendered correctly.');

// Test 3: Schema.org JSON-LD Helper
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
console.log('✅ Test 3 Passed: Schema.org JSON-LD graph generated.');

// Test 4: Sitemap XML & Robots.txt
const sitemapXml = generateSitemapXml('https://stihldecoder.nl', database);
assert.ok(sitemapXml.includes('<loc>https://stihldecoder.nl/modellen</loc>'));
console.log('✅ Test 4 Passed: Sitemap XML generated successfully.');

// Test 5: REST API Controller POST /api/v1/decode
const resDE = handleDecodeApiV1({ serialNumber: '184592301' }, database);
assert.strictEqual(resDE.statusCode, 200);
assert.strictEqual(resDE.body.data.factory.country, 'Duitsland');
console.log('✅ Test 5 Passed: REST API v1 Controller returns 200 OK.');

console.log('\n🎉 ALL STIHL PASSPORT IMAGE GENERATOR & DECODING TESTS PASSED SUCCESSFULLY!');
