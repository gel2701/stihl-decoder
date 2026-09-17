/**
 * Safety: the harvester must NEVER write canonical data.
 * - Asserts harvester modules/source contain no canonical write paths.
 * - Asserts canonical files are byte-identical before/after a (stubbed) harvest run.
 */
import assert from 'assert';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { harvest } from '../scripts/harvest_stihl_official_products.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const factsPath = path.join(rootDir, 'data', 'public_evidence_facts.json');

// 1. Static guard: harvester code must never WRITE canonical stores.
// Reading them (for comparison + hash verification) is intended; writing is forbidden.
const sources = [
  'lib/officialHarvester/discovery.js',
  'lib/officialHarvester/productPage.js',
  'lib/officialHarvester/normalize.js',
  'lib/officialHarvester/evidence.js',
  'lib/officialHarvester/matching.js',
  'scripts/harvest_stihl_official_products.js',
].map((f) => ({ file: f, src: fs.readFileSync(path.join(rootDir, f), 'utf8') }));
for (const { file, src } of sources) {
  assert.doesNotMatch(src, /writeFileSync\([^)]*stihl_database/);
  assert.doesNotMatch(src, /writeFileSync\([^)]*public_evidence_facts/);
  assert.doesNotMatch(src, /writeFile\([^)]*stihl_database/);
  assert.doesNotMatch(src, /writeFile\([^)]*public_evidence_facts/);
  assert.doesNotMatch(src, /automatic_promotion_allowed\s*=\s*true/);
  assert.doesNotMatch(src, /promotion_status\s*=\s*["']PROMOTED["']/);
}
const runnerSrc = sources[5].src;
assert.match(runnerSrc, /automatic_promotion_allowed/);
assert.match(runnerSrc, /canonical_unchanged/);

// 2. Dynamic guard: stubbed harvest (no network) leaves canonical files byte-identical.
const beforeDb = sha256(dbPath);
const beforeFacts = sha256(factsPath);
const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'stihl-harvest-safety-'));
const fxHtml = fs.readFileSync(path.join(rootDir, 'tests', 'fixtures', 'official_harvester', 'ms162.html'), 'utf8');
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).endsWith('.pdf')) return new Response('', { status: 200 });
  if ((opts && opts.method === 'HEAD') || (opts && opts.headers && opts.headers.Range)) return new Response('', { status: 200 });
  return new Response(fxHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
};
try {
  const summary = await harvest({
    limit: 0,
    concurrency: 2,
    market: 'BR',
    outDir: tmpOut,
    urls: ['https://loja.stihl.com.br/motosserra-ms-162/p'],
    skipManualCheck: false,
    timeoutMs: 10000,
  });
  assert.strictEqual(summary.safety.canonical_unchanged, true);
  assert.ok(fs.existsSync(path.join(tmpOut, 'latest_summary.json')));
} finally {
  globalThis.fetch = realFetch;
  fs.rmSync(tmpOut, { recursive: true, force: true });
}
assert.strictEqual(sha256(dbPath), beforeDb, 'stihl_database.json must stay byte-identical');
assert.strictEqual(sha256(factsPath), beforeFacts, 'public_evidence_facts.json must stay byte-identical');

console.log('✔ official harvester safety checks passed.');
