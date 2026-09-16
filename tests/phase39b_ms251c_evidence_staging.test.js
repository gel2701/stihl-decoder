import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const PHASE39A_FIELD_MATRIX = readJson('data/phase39a_ms251c_field_matrix.json');
const PHASE39B_CANDIDATES = readJson('data/phase39b_ms251c_candidate_facts.json');
const PHASE39B_SOURCE_BINDING = readJson('data/phase39b_ms251c_source_binding_audit.json');
const PUBLIC_STORE = readJson('data/public_evidence_facts.json');

function stableId(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

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

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeValueForEquality(field, value) {
  if (field === 'spark_plug' && Array.isArray(value)) {
    return value.map((entry) => ({
      manufacturer: entry.manufacturer.toUpperCase(),
      model: entry.model.replace(/\s+/g, ' ')
    }));
  }
  return value;
}

// ========== TEST 1: Candidate Count ==========
{
  const phase39aPromotable = PHASE39A_FIELD_MATRIX.field_matrix.filter(
    (f) => f.safe_for_ms251c === 'YES'
  ).length;
  const stagedCount = PHASE39B_CANDIDATES.candidates.length;

  assert.strictEqual(phase39aPromotable, 13, `Phase 39A promotable count: expected 13, got ${phase39aPromotable}`);
  assert.strictEqual(stagedCount, 13, `Staged candidate count: expected 13, got ${stagedCount}`);
  assert.strictEqual(phase39aPromotable, stagedCount, 'Phase 39A promotable count must match staged count');
  console.log('TEST 1 PASS: Candidate count = 13');
}

// ========== TEST 2: Blocked Fields ==========
{
  const blocked = PHASE39B_CANDIDATES.blocked_fields;
  const blockedFields = blocked.map((b) => b.field);

  assert.ok(blockedFields.includes('weight_kg'), 'weight_kg must be blocked');
  assert.ok(blockedFields.includes('max_speed_rpm'), 'max_speed_rpm must be blocked');
  assert.ok(blockedFields.includes('clutch_speed_rpm'), 'clutch_speed_rpm must be blocked');

  const promotableFields = PHASE39B_CANDIDATES.candidates.map((c) => c.field);
  assert.ok(!promotableFields.includes('weight_kg'), 'weight_kg must NOT be in promotable candidates');
  assert.ok(!promotableFields.includes('max_speed_rpm'), 'max_speed_rpm must NOT be in promotable candidates');
  assert.ok(!promotableFields.includes('clutch_speed_rpm'), 'clutch_speed_rpm must NOT be in promotable candidates');

  console.log('TEST 2 PASS: Blocked fields correct');
}

// ========== TEST 3: Fact-ID Determinism ==========
{
  const SOURCE_PATH = 'data/source_b_0458-737-5521-C.pdf';
  const MODEL_SLUG = 'ms-251-c';
  const PHASE_ID = 'phase39b';

  for (const candidate of PHASE39B_CANDIDATES.candidates) {
    const expectedId = stableId([
      PHASE_ID,
      MODEL_SLUG,
      candidate.field,
      SOURCE_PATH,
      normalizeValueForEquality(candidate.field, candidate.normalized_value)
    ]);
    assert.strictEqual(candidate.fact_id, expectedId,
      `Fact-ID mismatch for ${candidate.field}: expected ${expectedId}, got ${candidate.fact_id}`);
  }
  console.log('TEST 3 PASS: Fact-ID determinism verified');
}

// ========== TEST 4: Duplicate Fact IDs ==========
{
  const ids = PHASE39B_CANDIDATES.candidates.map((c) => c.fact_id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(ids.length, 13, 'Expected 13 fact IDs');
  assert.strictEqual(uniqueIds.size, 13, 'All fact IDs must be unique');
  console.log('TEST 4 PASS: No duplicate fact IDs');
}

// ========== TEST 5: No MS 251 Fact ID Reuse ==========
{
  const ms251Ids = new Set(PUBLIC_STORE.facts.filter((f) => f.model_slug === 'ms-251').map((f) => f.fact_id));
  for (const candidate of PHASE39B_CANDIDATES.candidates) {
    assert.ok(!ms251Ids.has(candidate.fact_id),
      `MS 251 C fact_id ${candidate.fact_id} must not collide with MS 251`);
  }
  console.log('TEST 5 PASS: No MS 251 fact ID reuse');
}

// ========== TEST 6: Source Assertion Uniqueness ==========
{
  const assertions = PHASE39B_SOURCE_BINDING.source_bindings.map((b) =>
    `${b.document_id}|${b.page}|${b.field}|${JSON.stringify(b.normalized_value)}`
  );
  const uniqueAssertions = new Set(assertions);
  assert.strictEqual(assertions.length, 13, 'Expected 13 source assertions');
  assert.strictEqual(uniqueAssertions.size, 13, 'All source assertions must be unique');
  console.log('TEST 6 PASS: Source assertion uniqueness verified');
}

// ========== TEST 7: Schema Validity ==========
{
  const requiredFields = [
    'fact_id', 'model_slug', 'field', 'normalized_value', 'raw_value', 'unit',
    'display_eligible', 'public_evidence_status', 'source_class', 'source_document_id',
    'pdf_page', 'source_locator', 'model_scope', 'field_semantic_status', 'conflict_status'
  ];

  for (const candidate of PHASE39B_CANDIDATES.candidates) {
    for (const field of requiredFields) {
      assert.ok(candidate[field] !== undefined,
        `Candidate ${candidate.field} missing required field: ${field}`);
    }
    assert.strictEqual(candidate.model_slug, 'ms-251-c', 'model_slug must be ms-251-c');
    assert.strictEqual(candidate.display_eligible, true, 'display_eligible must be true');
    assert.strictEqual(candidate.conflict_status, 'CLEAR', 'conflict_status must be CLEAR');
  }
  console.log('TEST 7 PASS: Schema validity verified');
}

// ========== TEST 8: Public Store Immutability ==========
{
  const facts = PUBLIC_STORE.facts;
  assert.strictEqual(facts.length, 461, 'Public store must have 461 facts');

  const expectedFactArrayHash = 'b167075a9ca7e04ce521210824c41bc76082bd3154ac9bcb8a6b97b712a58b7f';
  const computedHash = hashCanonicalValue(facts);
  assert.strictEqual(computedHash, expectedFactArrayHash, 'Public store fact array hash must match baseline');
  console.log('TEST 8 PASS: Public store immutability verified');
}

// ========== TEST 9: Synthetic Append Validation ==========
{
  const existingIds = new Set(PUBLIC_STORE.facts.map((f) => f.fact_id));
  let newIds = 0;
  let duplicateIds = 0;

  for (const candidate of PHASE39B_CANDIDATES.candidates) {
    if (existingIds.has(candidate.fact_id)) {
      duplicateIds++;
    } else {
      newIds++;
    }
  }

  assert.strictEqual(newIds, 13, 'Expected 13 new unique fact IDs');
  assert.strictEqual(duplicateIds, 0, 'No duplicate IDs with existing store');
  console.log('TEST 9 PASS: Synthetic append validation passed');
}

// ========== TEST 10: Candidate Array Canonical Hash ==========
{
  const factIds = PHASE39B_CANDIDATES.candidates.map((c) => c.fact_id);
  const canonicalHash = crypto.createHash('sha256').update(JSON.stringify(factIds)).digest('hex');
  assert.strictEqual(canonicalHash, PHASE39B_CANDIDATES.candidate_fact_array_canonical_sha256,
    'Candidate array canonical hash must match');
  console.log('TEST 10 PASS: Candidate array canonical hash verified');
}

console.log('\n=== ALL PHASE 39B TESTS PASSED ===');
