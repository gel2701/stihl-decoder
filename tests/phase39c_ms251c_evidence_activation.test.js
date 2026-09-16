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
  assert.strictEqual(PUBLIC_STORE.facts.length, 474, `Expected 474 facts, got ${PUBLIC_STORE.facts.length}`);
  console.log('TEST 1 PASS: Fact count = 474');
}

// ========== TEST 2: Existing 461 Facts Unchanged ==========
{
  const expectedPrefixHash = 'b167075a9ca7e04ce521210824c41bc76082bd3154ac9bcb8a6b97b712a58b7f';
  const actualPrefixHash = hashCanonicalValue(PUBLIC_STORE.facts.slice(0, 461));
  assert.strictEqual(actualPrefixHash, expectedPrefixHash, 'First 461 facts must be byte-identical to baseline');
  console.log('TEST 2 PASS: Immutable prefix unchanged');
}

// ========== TEST 3: 13 New MS 251 C Facts ==========
{
  const newFacts = PUBLIC_STORE.facts.slice(461);
  assert.strictEqual(newFacts.length, 13, 'Expected 13 new facts');
  assert.ok(newFacts.every(f => f.model_slug === 'ms-251-c'), 'All new facts must be ms-251-c');
  console.log('TEST 3 PASS: 13 new ms-251-c facts');
}

// ========== TEST 4: MS 251 Fact Count ==========
{
  const ms251 = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251');
  assert.strictEqual(ms251.length, 9, `MS 251 must have 9 facts, got ${ms251.length}`);
  console.log('TEST 4 PASS: MS 251 stays at 9 facts');
}

// ========== TEST 5: MS 251 C Fact Count ==========
{
  const ms251c = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  assert.strictEqual(ms251c.length, 13, `MS 251 C must have 13 facts, got ${ms251c.length}`);
  console.log('TEST 5 PASS: MS 251 C has 13 facts');
}

// ========== TEST 6: Blocked Fields Absent ==========
{
  const blocked = ['weight_kg', 'max_speed_rpm', 'clutch_speed_rpm'];
  const newFacts = PUBLIC_STORE.facts.slice(461);
  const blockedActivated = newFacts.filter(f => blocked.includes(f.field));
  assert.strictEqual(blockedActivated.length, 0, 'No blocked fields should be activated');
  console.log('TEST 6 PASS: Blocked fields absent');
}

// ========== TEST 7: Candidate IDs Exact Match ==========
{
  const expectedIds = PHASE39B_CANDIDATES.candidates.map(c => c.fact_id);
  const newFacts = PUBLIC_STORE.facts.slice(461);
  const actualIds = newFacts.map(f => f.fact_id);
  assert.deepStrictEqual(actualIds, expectedIds, 'Fact IDs must exactly match Phase 39B staging');
  console.log('TEST 7 PASS: Candidate IDs exact');
}

// ========== TEST 8: Candidate Provenance Exact ==========
{
  const newFacts = PUBLIC_STORE.facts.slice(461);
  const requiredFields = [
    'source_document_id', 'source_class', 'pdf_page', 'source_locator',
    'source_heading', 'raw_value', 'normalized_value', 'unit',
    'model_scope', 'field_semantic_status', 'conflict_status'
  ];

  for (const fact of newFacts) {
    for (const field of requiredFields) {
      assert.ok(fact[field] !== undefined, `Fact ${fact.field} missing provenance: ${field}`);
    }
    assert.strictEqual(fact.source_document_id, '0458-737-5521-C');
    assert.strictEqual(fact.model_scope, 'SHARED_TABLE_EXPLICIT_MODELS');
    assert.strictEqual(fact.conflict_status, 'CLEAR');
  }
  console.log('TEST 8 PASS: Provenance exact');
}

// ========== TEST 9: Model Index Correct ==========
{
  const ms251c = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251-c');
  assert.strictEqual(ms251c.length, 13, 'MS 251 C must have 13 indexed facts');
  
  // Verify no cross-model references
  const ms251 = PUBLIC_STORE.facts.filter(f => f.model_slug === 'ms-251');
  const ms251Ids = new Set(ms251.map(f => f.fact_id));
  const ms251cIds = new Set(ms251c.map(f => f.fact_id));
  const overlap = [...ms251Ids].filter(id => ms251cIds.has(id));
  assert.strictEqual(overlap.length, 0, 'No cross-model fact ID references');
  console.log('TEST 9 PASS: Model index correct');
}

// ========== TEST 10: No Orphan Facts ==========
{
  const allIds = new Set(PUBLIC_STORE.facts.map(f => f.fact_id));
  assert.strictEqual(allIds.size, PUBLIC_STORE.facts.length, 'All fact IDs must be unique');
  console.log('TEST 10 PASS: No orphan/duplicate facts');
}

// ========== TEST 11: New Fact Array Hash ==========
{
  const expectedHash = '2ef63726618b269ed2c4aaf88a98dc43bd87a6b113a1c4b98fb1a7878a3c53bc';
  const actualHash = hashCanonicalValue(PUBLIC_STORE.facts);
  assert.strictEqual(actualHash, expectedHash, 'Fact array hash must match expected');
  console.log('TEST 11 PASS: New fact array hash verified');
}

// ========== TEST 12: Manifest Valid ==========
{
  assert.strictEqual(MANIFEST.fact_count, 474, 'Manifest fact_count must be 474');
  assert.strictEqual(MANIFEST.baseline_id, 'phase39c-ms251c-evidence-activation');
  assert.strictEqual(MANIFEST.model_fact_counts['ms-251-c'], 13, 'Manifest must have 13 ms-251-c facts');
  assert.strictEqual(MANIFEST.model_fact_counts['ms-251'], 9, 'Manifest must have 9 ms-251 facts');
  console.log('TEST 12 PASS: Baseline manifest valid');
}

// ========== TEST 13: Display Eligibility ==========
{
  const newFacts = PUBLIC_STORE.facts.slice(461);
  assert.ok(newFacts.every(f => f.display_eligible === true), 'All new facts must be display_eligible');
  console.log('TEST 13 PASS: Display eligibility correct');
}

// ========== TEST 14: Public Evidence Status ==========
{
  const newFacts = PUBLIC_STORE.facts.slice(461);
  assert.ok(newFacts.every(f => f.public_evidence_status === 'OFFICIAL_DOCUMENTED'),
    'All new facts must have OFFICIAL_DOCUMENTED status');
  console.log('TEST 14 PASS: Public evidence status correct');
}

console.log('\n=== ALL PHASE 39C TESTS PASSED ===');
