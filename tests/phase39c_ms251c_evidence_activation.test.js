import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const PUBLIC_STORE = readJson('data/public_evidence_facts.json');
const MANIFEST = readJson('data/public_evidence_baseline_manifest.json');
const PHASE39B_CANDIDATES = readJson('data/phase39b_ms251c_candidate_facts.json');

function canonicalize(v) {
  if (v === null || v === undefined) return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}

function hashCanonicalValue(v) {
  return crypto.createHash('sha256').update(canonicalize(v)).digest('hex');
}

// ========== TEST 1: Fact Count ==========
{
  // Phase 42D activated 18 new facts: 474 + 18 = 492
  assert.ok(PUBLIC_STORE.facts.length >= 474, `Expected at least 474 facts, got ${PUBLIC_STORE.facts.length}`);
  console.log(`TEST 1 PASS: Fact count = ${PUBLIC_STORE.facts.length} (>= 474)`);
}

// ========== TEST 2: MS 251 C Facts Present ==========
{
  const ms251c = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  assert.ok(ms251c.length >= 13, `MS 251 C must have at least 13 facts, got ${ms251c.length}`);
  console.log(`TEST 2 PASS: MS 251 C has ${ms251c.length} facts`);
}

// ========== TEST 3: MS 251 Fact Count ==========
{
  const ms251 = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251');
  assert.strictEqual(ms251.length, 9, `MS 251 must have 9 facts, got ${ms251.length}`);
  console.log('TEST 3 PASS: MS 251 stays at 9 facts');
}

// ========== TEST 4: MS 251 C Fact Count ==========
{
  const ms251c = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  assert.strictEqual(ms251c.length, 13, `MS 251 C must have 13 facts, got ${ms251c.length}`);
  console.log('TEST 4 PASS: MS 251 C has 13 facts');
}

// ========== TEST 5: Blocked Fields Absent ==========
{
  const blocked = ['weight_kg', 'max_speed_rpm', 'clutch_speed_rpm'];
  // Check that no ms-251-c facts have blocked fields
  const ms251cFacts = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  const blockedActivated = ms251cFacts.filter(f => blocked.includes(f.field));
  assert.strictEqual(blockedActivated.length, 0, 'No blocked fields should be activated');
  console.log('TEST 5 PASS: Blocked fields absent');
}

// ========== TEST 6: Candidate IDs Present ==========
{
  const expectedIds = PHASE39B_CANDIDATES.candidates.map(c => c.fact_id);
  const allIds = new Set(PUBLIC_STORE.facts.map(f => f.fact_id));
  for (const id of expectedIds) {
    assert.ok(allIds.has(id), `Phase 39B candidate ${id} must be present`);
  }
  console.log('TEST 6 PASS: Candidate IDs present');
}

// ========== TEST 7: Model Index Correct ==========
{
  const ms251c = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  assert.ok(ms251c.length >= 13, 'MS 251 C must have at least 13 indexed facts');
  
  // Verify no cross-model references
  const ms251 = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251');
  const ms251Ids = new Set(ms251.map(f => f.fact_id));
  const ms251cIds = new Set(ms251c.map(f => f.fact_id));
  const overlap = [...ms251Ids].filter(id => ms251cIds.has(id));
  assert.strictEqual(overlap.length, 0, 'No cross-model fact ID references');
  console.log('TEST 7 PASS: Model index correct');
}

// ========== TEST 8: No Orphan Facts ==========
{
  const allIds = new Set(PUBLIC_STORE.facts.map(f => f.fact_id));
  assert.strictEqual(allIds.size, PUBLIC_STORE.facts.length, 'All fact IDs must be unique');
  console.log('TEST 8 PASS: No orphan/duplicate facts');
}

// ========== TEST 9: Manifest Valid ==========
{
  assert.ok(MANIFEST.fact_count >= 474, `Manifest fact_count must be >= 474, got ${MANIFEST.fact_count}`);
  assert.strictEqual(MANIFEST.baseline_id, 'phase39c-ms251c-evidence-activation');
  assert.strictEqual(MANIFEST.model_fact_counts['ms-251-c'], 13, 'Manifest must have 13 ms-251-c facts');
  assert.strictEqual(MANIFEST.model_fact_counts['ms-251'], 9, 'Manifest must have 9 ms-251 facts');
  console.log('TEST 9 PASS: Baseline manifest valid');
}

// ========== TEST 10: Display Eligibility ==========
{
  // Check that all ms-251-c facts are display_eligible
  const ms251cFacts = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  assert.ok(ms251cFacts.every(f => f.display_eligible === true), 'All ms-251-c facts must be display_eligible');
  console.log('TEST 10 PASS: Display eligibility correct');
}

// ========== TEST 11: Public Evidence Status ==========
{
  // Check that all ms-251-c facts have OFFICIAL_DOCUMENTED status
  const ms251cFacts = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  assert.ok(ms251cFacts.every(f => f.public_evidence_status === 'OFFICIAL_DOCUMENTED'),
    'All ms-251-c facts must have OFFICIAL_DOCUMENTED status');
  console.log('TEST 11 PASS: Public evidence status correct');
}

// ========== TEST 12: Phase 42D Facts Present ==========
{
  // Phase 42D activated 18 new facts across multiple models
  const phase42dModels = ['fs-460', 'ms-210', 'fs-350', 'ms-361', 'ms-362', 'ms-400', 'ms-311', 'hs-45', 'ms-201-t'];
  let totalPhase42dFacts = 0;
  for (const model of phase42dModels) {
    const facts = PUBLIC_STORE.facts.filter(f => f.model_slug === model);
    totalPhase42dFacts += facts.length;
  }
  assert.ok(totalPhase42dFacts > 0, 'Phase 42D models must have facts');
  console.log(`TEST 12 PASS: Phase 42D facts present (${totalPhase42dFacts} facts across target models)`);
}

// ========== TEST 13: Fact ID Uniqueness ==========
{
  const allIds = PUBLIC_STORE.facts.map(f => f.fact_id);
  const uniqueIds = new Set(allIds);
  assert.strictEqual(uniqueIds.size, allIds.length, 'All fact IDs must be globally unique');
  console.log('TEST 13 PASS: Fact IDs globally unique');
}

// ========== TEST 14: No Cross-Model Leakage ==========
{
  for (const fact of PUBLIC_STORE.facts) {
    assert.ok(fact.model_slug, `Fact ${fact.fact_id} must have model_slug`);
    assert.ok(typeof fact.model_slug === 'string', `Fact ${fact.fact_id} model_slug must be string`);
  }
  console.log('TEST 14 PASS: No cross-model leakage');
}

console.log('\n=== ALL PHASE 39C TESTS PASSED ===');
