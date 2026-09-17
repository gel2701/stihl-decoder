import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseSitemapLocs,
  isProductUrl,
  normalizeProductUrl,
  extractProductLinksFromHtml,
  buildDiscoveryReport,
  discoverBrCatalog,
  BR_CATALOG_URL,
} from '../lib/officialHarvester/discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const fx = (n) => fs.readFileSync(path.join(rootDir, 'tests', 'fixtures', 'official_harvester', n), 'utf8');

// parseSitemapLocs
const locs = parseSitemapLocs(fx('sitemap-product.xml'));
assert.strictEqual(locs.length, 5, 'fixture sitemap should yield 5 locs');

// isProductUrl: keep real products, drop category + busca
assert.ok(isProductUrl('https://loja.stihl.com.br/motosserra-ms-162/p'));
assert.ok(!isProductUrl('https://loja.stihl.com.br/serrar-e-cortar'));
assert.ok(!isProductUrl('https://loja.stihl.com.br/busca/bla/p'));
assert.ok(!isProductUrl('https://loja.stihl.com.br/promocoes'));

// normalize: host canonicalization + strip query
assert.strictEqual(
  normalizeProductUrl('https://www.loja.stihl.com.br/motosserra-ms-162/p?x=1#y'),
  'https://loja.stihl.com.br/motosserra-ms-162/p'
);

// dedupe + report shape
const report = buildDiscoveryReport({
  catalogUrl: BR_CATALOG_URL,
  discoveryMethod: 'sitemap:product-0.xml',
  discoveredUrls: locs.length,
  productUrls: locs.filter(isProductUrl),
});
assert.strictEqual(report.unique_product_urls, 2);
assert.strictEqual(report.discovered_urls, 5);
assert.ok(report.product_urls.includes('https://loja.stihl.com.br/podador-hsa-30/p'));
assert.strictEqual(report.catalog_url, BR_CATALOG_URL);
assert.ok(report.discovery_method.length > 0);

// extractProductLinksFromHtml fallback
const htmlLinks = extractProductLinksFromHtml(fx('ms162.html'));
assert.ok(Array.isArray(htmlLinks));

// discoverBrCatalog with stub fetch: sitemap path
const stubFetch = async (url) => {
  if (url.endsWith('product-0.xml')) return fx('sitemap-product.xml');
  throw new Error('should not be called: ' + url);
};
const disc = await discoverBrCatalog({ fetchImpl: stubFetch });
assert.strictEqual(disc.discovery_method, 'sitemap:product-0.xml');
assert.strictEqual(disc.unique_product_urls, 2);

// discoverBrCatalog fallback to HTML when sitemaps fail
const htmlOnly = await discoverBrCatalog({
  fetchImpl: async (url) => {
    if (url === BR_CATALOG_URL) return '<a href="/motosserra-ms-162/p">x</a><a href="/serrar-e-cortar">y</a>';
    throw new Error('sitemap down');
  },
});
assert.match(htmlOnly.discovery_method, /html-fallback/);
assert.strictEqual(htmlOnly.unique_product_urls, 1);

console.log('✔ official harvester discovery checks passed.');
