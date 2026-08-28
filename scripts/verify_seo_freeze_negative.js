import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASELINE_PATH = path.join(process.cwd(), 'data', 'seo_baseline.json');

function hashEntry(entry) {
  return crypto.createHash('sha256').update(JSON.stringify({
    title: entry.title || '',
    description: entry.description || '',
    h1: entry.h1 || '',
    canonical: entry.canonical || '',
    robots: entry.robots || '',
    jsonLdTypes: entry.json_ld_types || []
  })).digest('hex');
}

if (!fs.existsSync(BASELINE_PATH)) {
  throw new Error(`Missing baseline file: ${BASELINE_PATH}`);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
if (!baseline.entries || baseline.entries.length === 0) {
  throw new Error('Baseline has no entries to test.');
}

const probe = structuredClone(baseline.entries[0]);
probe.title = `${probe.title} [NEGATIVE TEST]`;
const probeHash = hashEntry(probe);

if (probeHash === baseline.entries[0].seo_hash) {
  console.error('❌ Freeze negative test failed: mutated title did not change the SEO hash.');
  process.exit(1);
}

console.log('✅ Freeze negative test passed: a temporary title mutation changes the SEO hash as expected.');
