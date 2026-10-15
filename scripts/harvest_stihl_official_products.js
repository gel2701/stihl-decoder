import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseOfficialProductHtml,
  compareCandidateToDatabase,
  discoverProductUrls,
  productUrlFromVtexRecord
} from '../src/officialProductHarvester.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function argValues(name) {
  const values = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1]) values.push(process.argv[i + 1]);
  }
  return values;
}

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function hasFlag(name) { return process.argv.includes(name); }

const BASE_HEADERS = {
  'user-agent': 'STIHLDecoderOfficialProductHarvester/2.0 (+https://www.stihldecoder.nl)'
};

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { ...BASE_HEADERS, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { ...BASE_HEADERS, accept: 'application/json' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function discoverVtexProductUrls(catalogUrl) {
  const origin = new URL(catalogUrl).origin;
  const urls = new Set();
  const pageSize = 50;
  let pages = 0;

  for (let from = 0; from < 5000; from += pageSize) {
    const endpoint = new URL('/api/catalog_system/pub/products/search', origin);
    endpoint.searchParams.set('_from', String(from));
    endpoint.searchParams.set('_to', String(from + pageSize - 1));
    const batch = await fetchJson(endpoint.href);
    pages += 1;
    if (!Array.isArray(batch) || batch.length === 0) break;

    const sizeBefore = urls.size;
    for (const product of batch) {
      const url = productUrlFromVtexRecord(product, origin);
      if (url && new URL(url).hostname === new URL(origin).hostname) urls.add(url);
    }

    console.log(`[DISCOVERY] VTEX page ${pages}: ${batch.length} records, ${urls.size} unique product URLs total`);
    if (batch.length < pageSize || urls.size === sizeBefore) break;
  }

  return { urls: [...urls].sort(), pages };
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

const market = argValue('--market', 'BR').toUpperCase();
const outDir = path.resolve(ROOT, argValue('--out', 'data/candidate_evidence/official_products'));
const explicitUrls = argValues('--url');
const catalogUrl = argValue('--catalog-url');
const maxProducts = Number(argValue('--max', '0')) || 0;
const dryRun = hasFlag('--dry-run');

if (!explicitUrls.length && !catalogUrl) {
  console.error('Usage: node scripts/harvest_stihl_official_products.js --url <product-url> [--url <url> ...] [--market BR] [--dry-run]');
  console.error('   or: node scripts/harvest_stihl_official_products.js --catalog-url https://loja.stihl.com.br/todos-os-produtos [--max 10]');
  process.exit(2);
}

const dbPath = path.join(ROOT, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
let urls = [...explicitUrls];
let discovery = { method: explicitUrls.length ? 'EXPLICIT_URLS' : null, static_urls: 0, vtex_api_urls: 0, vtex_pages: 0 };

if (catalogUrl) {
  const catalogHtml = await fetchText(catalogUrl);
  const staticUrls = discoverProductUrls(catalogHtml, catalogUrl);
  discovery.static_urls = staticUrls.length;
  urls.push(...staticUrls);

  try {
    const vtex = await discoverVtexProductUrls(catalogUrl);
    discovery.vtex_api_urls = vtex.urls.length;
    discovery.vtex_pages = vtex.pages;
    if (vtex.urls.length > 0) {
      urls.push(...vtex.urls);
      discovery.method = 'VTEX_SEARCH_API_PLUS_STATIC_FALLBACK';
    } else {
      discovery.method = 'STATIC_HTML_ONLY';
    }
  } catch (error) {
    discovery.method = 'STATIC_HTML_FALLBACK_AFTER_VTEX_ERROR';
    discovery.vtex_error = error.message;
    console.warn(`[DISCOVERY] VTEX API failed, using static catalog links: ${error.message}`);
  }
}

urls = [...new Set(urls.map((url) => url.split('?')[0]))].sort();
if (maxProducts > 0) urls = urls.slice(0, maxProducts);
console.log(`[DISCOVERY] Selected ${urls.length} unique product URLs (${discovery.method || 'EXPLICIT_URLS'})`);

const runAt = new Date().toISOString();
const results = [];
const errors = [];

for (let index = 0; index < urls.length; index += 1) {
  const url = urls[index];
  try {
    const html = await fetchText(url);
    const candidate = parseOfficialProductHtml(html, { url, market, retrievedAt: runAt });
    const comparison = compareCandidateToDatabase(candidate, database);
    results.push({ candidate, comparison });
    const label = candidate.model_name || candidate.product_name || 'unclassified product';
    console.log(`[OK ${index + 1}/${urls.length}] ${label} ${candidate.product_reference || ''} -> ${candidate.record_type}${comparison.model_match ? ' / matched' : ''}`);
  } catch (error) {
    errors.push({ url, error: error.message });
    console.error(`[ERROR ${index + 1}/${urls.length}] ${url}: ${error.message}`);
  }
}

const report = {
  schema_version: 2,
  run_at: runAt,
  source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
  market,
  automatic_promotion_allowed: false,
  catalog_discovery: discovery,
  requested_urls: urls.length,
  harvested: results.length,
  failed: errors.length,
  results,
  errors
};

if (!dryRun) {
  ensureDir(outDir);
  const stamp = runAt.replace(/[:.]/g, '-');
  const file = path.join(outDir, `harvest_${market}_${stamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Candidate evidence written to ${path.relative(ROOT, file)}`);
} else {
  console.log(JSON.stringify(report, null, 2));
}

if (errors.length && !results.length) process.exitCode = 1;
