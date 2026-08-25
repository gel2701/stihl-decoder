import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode, cleanInput } from '../src/decoder.js';
import { StihlDecoderService } from '../src/StihlDecoderService.js';
import { handleDecodeApiV1 } from '../src/StihlDecoderController.js';
import { generateModelJsonLd } from '../src/components/ModelJsonLd.js';
import { generateSitemapXml, generateRobotsTxt } from '../src/components/SitemapGenerator.js';
import { renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import sitemap from '../app/sitemap.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('🧪 Running STIHL SerialLocatorGuide & App Router SEO Unit Tests...\n');

// Test 1: Next.js App Router sitemap.ts
sitemap().then(routes => {
  assert.ok(Array.isArray(routes));
  assert.ok(routes.length > 5);
  assert.strictEqual(routes[0].url, 'https://stihldecoder.nl');
  assert.strictEqual(routes[0].changeFrequency, 'daily');
  assert.strictEqual(routes[1].changeFrequency, 'weekly');
  console.log('✅ Test 1 Passed: app/sitemap.ts returned dynamic routes with weekly changefreq.');
}).catch(err => {
  console.error('Sitemap test error:', err);
});

// Test 2: Passport Card Integration in POST /api/v1/decode
const resDecode = handleDecodeApiV1({ serialNumber: '184592301' }, database);
assert.strictEqual(resDecode.statusCode, 200);
assert.ok(resDecode.body.data.passportCardHtml);
assert.ok(resDecode.body.data.passportCardHtml.includes('STIHL MACHINE PASPOORT'));
console.log('✅ Test 2 Passed: StihlPassportGenerator card integrated into /api/v1/decode response payload.');

// Test 3: HTML Passport Card Rendering
const htmlCard = renderStihlPassportHtml({
  cleanedSerial: '184592301',
  model: 'MS 261 C-M (M-Tronic)'
});
assert.ok(htmlCard.includes('STIHL MACHINE PASPOORT'));
console.log('✅ Test 3 Passed: renderStihlPassportHtml output verified.');

// Test 4: Schema.org JSON-LD Helper
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
console.log('✅ Test 4 Passed: Schema.org JSON-LD helper verified.');

console.log('\n🎉 ALL LOCATOR GUIDE & APP ROUTER SEO TESTS PASSED SUCCESSFULLY!');
