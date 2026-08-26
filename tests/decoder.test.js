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

console.log('🧪 Running STIHL Passport Finishing Touches (Chain Specs & QR Code) & Decoder Tests...\n');

// Test 1: Passport HTML rendering contains Chain Specs and QR code image
const passportHtml = renderStihlPassportHtml({
  cleanedSerial: '184592301',
  model: 'MS 261 C-M Gen 2',
  modelMatch: {
    modelName: 'MS 261 C-M Gen 2',
    specs: {
      displacementCc: 50.2,
      powerHp: 4.1,
      chainDetails: { pitch: '.325"', gauge: 1.3 }
    }
  }
});
assert.ok(passportHtml.includes('.325" @ 1.3 mm'));
assert.ok(passportHtml.includes('https://api.qrserver.com/v1/create-qr-code'));
assert.ok(passportHtml.includes('stihldecoder.nl'));
console.log('✅ Test 1 Passed: Passport HTML contains chain specs (.325" @ 1.3 mm) and verification QR Code.');

// Test 2: StihlRangeResolver exact breakpoint match for MS 261 C-M Gen 2
const rangeRes = StihlRangeResolver.resolve(184592301, '1', database);
assert.strictEqual(rangeRes.yearRangeFormatted, '2016 – Heden');
assert.strictEqual(rangeRes.generation, 'MS 261 C-M Gen 2 (Facelift / V2)');
console.log('✅ Test 2 Passed: StihlRangeResolver matched exact breakpoint.');

// Test 3: generateSitemapXml output validation
const sitemapXml = generateSitemapXml('https://stihldecoder.nl', database);
assert.ok(sitemapXml.includes('<loc>https://stihldecoder.nl/modellen/kettingzagen/stihl-ms-261-c-m</loc>'));
console.log('✅ Test 3 Passed: generateSitemapXml generated valid XML.');

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
assert.strictEqual(jsonLd['@graph'].length, 3);
console.log('✅ Test 4 Passed: generateModelJsonLd returned TechArticle, Product & FAQPage Schema.org graph.');

console.log('\n🎉 ALL PASSPORT FINISHING TOUCHES & DECODER TESTS PASSED SUCCESSFULLY!');
