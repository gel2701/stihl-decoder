import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseOfficialProductHtml, compareCandidateToDatabase, discoverProductUrls } from '../src/officialProductHarvester.js';

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'STIHLDecoderOfficialProductHarvester/1.0 (+https://www.stihldecoder.nl)',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
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

if (catalogUrl) {
  const catalogHtml = await fetchText(catalogUrl);
  urls.push(...discoverProductUrls(catalogHtml, catalogUrl));
}
urls = [...new Set(urls)];
if (maxProducts > 0) urls = urls.slice(0, maxProducts);

const runAt = new Date().toISOString();
const results = [];
const errors = [];

for (const url of urls) {
  try {
    const html = await fetchText(url);
    const candidate = parseOfficialProductHtml(html, { url, market, retrievedAt: runAt });
    const comparison = compareCandidateToDatabase(candidate, database);
    results.push({ candidate, comparison });
    console.log(`[OK] ${candidate.model_name} ${candidate.product_reference || ''} -> ${comparison.model_match ? 'matched' : 'new model'}`);
  } catch (error) {
    errors.push({ url, error: error.message });
    console.error(`[ERROR] ${url}: ${error.message}`);
  }
}

const report = {
  schema_version: 1,
  run_at: runAt,
  source_class: 'OFFICIAL_MANUFACTURER_PRODUCT_PAGE',
  market,
  automatic_promotion_allowed: false,
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
