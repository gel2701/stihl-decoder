import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  decodeHtmlEntities,
  parseJsonLdProduct,
  parseSpecPairs,
  parseProductReference,
  parseTitle,
  extractModelName,
  isProductImageUrl,
  normalizeImageUrl,
  parseImages,
  parseManuals,
  parseProductPage,
} from '../lib/officialHarvester/productPage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const fx = (n) => fs.readFileSync(path.join(rootDir, 'tests', 'fixtures', 'official_harvester', n), 'utf8');
const ms162 = fx('ms162.html');
const hsa30 = fx('hsa30.html');

// entities
assert.strictEqual(decodeHtmlEntities('a&amp;b'), 'a&b');

// JSON-LD
const ld = parseJsonLdProduct(ms162);
assert.strictEqual(ld.name, 'Motosserra a combustão MS 162');
assert.strictEqual(ld.mpn, '1148-200-0249');

// specs incl. decimal comma + unicode label
const specs = parseSpecPairs(ms162);
assert.strictEqual(specs['Cilindrada (cm³)'], '30,1');
assert.strictEqual(specs['Potência (kW/cv)'], '1,3');
assert.strictEqual(specs['Peso (kg)'], '4,5 - sem conjunto de corte');

// reference prefers mpn
assert.strictEqual(parseProductReference(ms162, ld), '1148-200-0249');

// title + model extraction
assert.strictEqual(parseTitle(ms162, ld), 'Motosserra a combustão MS 162');
assert.strictEqual(extractModelName('Motosserra a combustão MS 162'), 'MS 162');
assert.strictEqual(extractModelName('Podador a Bateria HSA 30'), 'HSA 30');
assert.strictEqual(extractModelName('Lavadora de Alta Pressão RE 100'), 'RE 100');
assert.strictEqual(extractModelName('no model here'), null);

// image filtering: svg/login/file-manager excluded, &amp; normalized, deduped
const images = parseImages(ms162, ld);
assert.ok(images.length >= 2, `expected product images, got ${images.length}`);
assert.ok(images.every((u) => !u.includes('&amp;')), 'entities must be normalized');
assert.ok(images.every((u) => !u.endsWith('.svg')), 'svg excluded');
assert.ok(images.every((u) => !/login-icon|file-manager/.test(u)), 'ui assets excluded');
assert.strictEqual(new Set(images).size, images.length, 'deduped');
const norm = normalizeImageUrl('https://stihlferramentas.vtexassets.com/arquivos/ids/157058-800-1067?v=639174915863300000&amp;width=800&amp;height=1067&amp;aspect=true');
assert.strictEqual(norm, 'https://stihlferramentas.vtexassets.com/arquivos/ids/157058?v=639174915863300000');
assert.ok(!isProductImageUrl('https://example.com/logo.svg'));

// manuals: array, official host, pdf
const manuals = parseManuals(ms162, 'https://loja.stihl.com.br/motosserra-ms-162/p');
assert.strictEqual(manuals.length, 1);
assert.ok(manuals[0].url.endsWith('.pdf'));
assert.strictEqual(manuals[0].source, 'STIHL_OFFICIAL');
assert.strictEqual(manuals[0].market, 'BR');
const manuals2 = parseManuals(hsa30, 'https://loja.stihl.com.br/podador-hsa-30/p');
assert.strictEqual(manuals2.length, 2, 'multiple documents kept as array');

// full page parse
const parsed = parseProductPage(ms162, 'https://loja.stihl.com.br/motosserra-ms-162/p');
assert.strictEqual(parsed.model_name, 'MS 162');
assert.strictEqual(parsed.product_reference, '1148-200-0249');
assert.ok(parsed.manuals.length === 1 && parsed.images.length >= 2);
assert.ok(Object.keys(parsed.raw_specs).length === 6);

console.log('✔ official harvester parsing checks passed.');
