import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  canonicalize,
  hashCanonicalValue,
  validateManifestStructure,
  validatePublicEvidenceBaseline
} from '../src/utils/evidenceBaselineValidator.js';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const manifest = readJson('data/public_evidence_baseline_manifest.json');
const store = readJson('data/public_evidence_facts.json');
const database = readJson('data/stihl_database.json');
const productionInputSnapshot = canonicalize({ manifest, store, database });

function hasCode(result, code) {
  return result.errors.some((entry) => entry.code === code);
}

function testManifestFor(facts, fixtureDatabase = { models: [] }) {
  const modelFactCounts = facts.reduce((counts, fact) => {
    counts[fact.model_slug] = (counts[fact.model_slug] || 0) + 1;
    return counts;
  }, {});
  const fixtureStore = { schema_version: 'public-evidence-v1', facts };
  return {
    schema_version: 'public-evidence-baseline-v1',
    baseline_id: 'fixture', approved_phase: 'fixture', created_from_commit: 'fixture', baseline_commit_timestamp: '2026-09-14T00:00:00Z',
    fact_count: facts.length, distinct_model_count: Object.keys(modelFactCounts).length,
    fact_array_canonical_sha256: hashCanonicalValue(facts),
    public_store_canonical_sha256: hashCanonicalValue(fixtureStore),
    canonical_database_sha256: hashCanonicalValue(fixtureDatabase),
    immutable_prefix_count: facts.length, immutable_prefix_canonical_sha256: hashCanonicalValue(facts),
    model_fact_counts: modelFactCounts, historical_prefixes: [], hash_algorithm: 'SHA-256', canonicalization_algorithm: 'fixture', manifest_status: 'APPROVED_READ_ONLY_BASELINE'
  };
}

function fixtureFact(overrides = {}) {
  return {
    fact_id: 'fact-a', model_slug: 'fixture-model', field: 'power_kw', normalized_value: 2.2,
    raw_value: '2.2 kW', unit: 'kW', display_eligible: true,
    public_evidence_status: 'OFFICIAL_DOCUMENTED', source_class: 'OFFICIAL_SERVICE_MANUAL',
    source_document_id: 'fixture-doc-a', pdf_page: 6, source_locator: 'fixture-doc-a#page=6',
    model_scope: 'EXACT_MODEL', field_semantic_status: 'VALID', conflict_status: 'CLEAR', conflicting_values: [],
    ...overrides
  };
}

function validateFixture(facts, options = {}) {
  const fixtureDatabase = options.database || { models: [] };
  const fixtureStore = { schema_version: 'public-evidence-v1', facts };
  return validatePublicEvidenceBaseline({
    manifest: options.manifest || testManifestFor(options.baselineFacts || facts, fixtureDatabase),
    publicEvidenceStore: fixtureStore,
    database: fixtureDatabase,
    baselineFacts: options.baselineFacts || facts,
    approvedAdditionFactIds: options.approvedAdditionFactIds || [],
    manifestWriteAttempted: options.manifestWriteAttempted,
    expectedHistoricalBaselineId: options.expectedHistoricalBaselineId
  });
}

assert.strictEqual(validateManifestStructure(manifest).valid, true, 'production manifest must be structurally valid');
const productionFirst = validatePublicEvidenceBaseline({ manifest, publicEvidenceStore: store, database, baselineFacts: store.facts });
const productionSecond = validatePublicEvidenceBaseline({ manifest, publicEvidenceStore: store, database, baselineFacts: store.facts });
assert.strictEqual(productionFirst.valid, true, JSON.stringify(productionFirst.errors));
assert.deepStrictEqual(productionFirst, productionSecond, 'two validation runs must be identical');
assert.strictEqual(store.facts.filter((fact) => fact.model_slug === 'ms-251').length, 9, 'MS 251 must retain nine approved facts');
assert.strictEqual(canonicalize({ manifest, store, database }), productionInputSnapshot, 'validator may not mutate production inputs');
assert.strictEqual(fs.readFileSync(path.join(rootDir, 'src/utils/evidenceBaselineValidator.js'), 'utf8').includes('writeFile'), false, 'validator must not contain a file-write path');

const rehearsalStore = clone(store);
const rehearsalFact = fixtureFact({
  fact_id: 'phase38e-synthetic-append-only-fixture', model_slug: 'phase38e-synthetic-model',
  source_document_id: 'synthetic-fixture-doc', source_locator: 'synthetic-fixture-doc#page=1'
});
rehearsalStore.facts.push(rehearsalFact);
assert.strictEqual(validatePublicEvidenceBaseline({ manifest, publicEvidenceStore: rehearsalStore, database, baselineFacts: store.facts }).valid, false, 'append without manifest approval must fail');
const rehearsalManifest = clone(manifest);
rehearsalManifest.baseline_id = 'phase38e-rehearsal-475';
rehearsalManifest.fact_count = 475;
rehearsalManifest.distinct_model_count = 51;
rehearsalManifest.fact_array_canonical_sha256 = hashCanonicalValue(rehearsalStore.facts);
rehearsalManifest.public_store_canonical_sha256 = hashCanonicalValue(rehearsalStore);
rehearsalManifest.immutable_prefix_count = 475;
rehearsalManifest.immutable_prefix_canonical_sha256 = hashCanonicalValue(rehearsalStore.facts);
rehearsalManifest.model_fact_counts = rehearsalStore.facts.reduce((counts, fact) => {
  counts[fact.model_slug] = (counts[fact.model_slug] || 0) + 1;
  return counts;
}, {});
assert.strictEqual(validatePublicEvidenceBaseline({ manifest: rehearsalManifest, publicEvidenceStore: rehearsalStore, database, baselineFacts: rehearsalStore.facts }).valid, true, 'explicit append-only manifest update must pass');
const rehearsalMutation = clone(rehearsalStore); rehearsalMutation.facts[0].normalized_value = 999;
assert(hasCode(validatePublicEvidenceBaseline({ manifest: rehearsalManifest, publicEvidenceStore: rehearsalMutation, database, baselineFacts: rehearsalStore.facts }), 'ERR_EXISTING_FACT_MUTATED'));
const rehearsalRemoval = clone(rehearsalStore); rehearsalRemoval.facts.pop();
assert(hasCode(validatePublicEvidenceBaseline({ manifest: rehearsalManifest, publicEvidenceStore: rehearsalRemoval, database, baselineFacts: rehearsalStore.facts }), 'ERR_EXISTING_FACT_REMOVED'));

const baseline = [fixtureFact()];
const baselineSnapshot = clone(baseline);

let candidate = clone(baseline); candidate[0].normalized_value = 2.3;
assert(hasCode(validateFixture(candidate, { baselineFacts: baseline }), 'ERR_EXISTING_FACT_MUTATED'));
assert(hasCode(validateFixture([], { baselineFacts: baseline }), 'ERR_EXISTING_FACT_REMOVED'));
candidate = [...clone(baseline), fixtureFact({ fact_id: 'fact-extra', source_document_id: 'doc-extra', source_locator: 'doc-extra#page=6' })];
assert(hasCode(validateFixture(candidate, { baselineFacts: baseline }), 'ERR_UNAUTHORIZED_FACT_ADDITION'));

candidate = clone(baseline); const countManifest = testManifestFor(baseline); countManifest.fact_count = 2;
assert(hasCode(validateFixture(candidate, { baselineFacts: baseline, manifest: countManifest }), 'ERR_FACT_COUNT_MISMATCH'));
const hashManifest = testManifestFor(baseline); hashManifest.fact_array_canonical_sha256 = '0'.repeat(64);
assert(hasCode(validateFixture(candidate, { baselineFacts: baseline, manifest: hashManifest }), 'ERR_FACT_ARRAY_HASH_MISMATCH'));

candidate = [fixtureFact(), fixtureFact({ fact_id: 'fact-a' })];
assert(hasCode(validateFixture(candidate), 'ERR_DUPLICATE_FACT_ID'));
candidate = [fixtureFact(), fixtureFact({ fact_id: 'fact-b' })];
assert(hasCode(validateFixture(candidate), 'ERR_BYTE_IDENTICAL_DUPLICATE_FACT'));
candidate = [fixtureFact(), fixtureFact({ fact_id: 'fact-b', source_heading: 'same assertion, extra metadata' })];
assert(hasCode(validateFixture(candidate), 'ERR_DUPLICATE_SOURCE_ASSERTION'));
candidate = [fixtureFact({ public_evidence_status: 'CANONICAL_VERIFIED' }), fixtureFact({ fact_id: 'fact-b', public_evidence_status: 'CANONICAL_VERIFIED', source_document_id: 'fixture-doc-b', source_locator: 'fixture-doc-b#page=6' })];
assert(hasCode(validateFixture(candidate), 'ERR_MULTIPLE_ACTIVE_CANONICAL_PROMOTIONS'));

candidate = [fixtureFact(), fixtureFact({ fact_id: 'fact-b', source_document_id: 'fixture-doc-b', source_locator: 'fixture-doc-b#page=6' })];
assert.strictEqual(validateFixture(candidate).valid, true, 'independent corroboration must remain allowed');
candidate = [fixtureFact(), fixtureFact({ fact_id: 'fact-b', normalized_value: 2.5, source_document_id: 'fixture-doc-b', source_locator: 'fixture-doc-b#page=6' })];
assert(hasCode(validateFixture(candidate), 'ERR_UNRESOLVED_CONFLICT_PROMOTION'));
candidate = [fixtureFact({ public_evidence_status: 'OFFICIAL_CONFLICTED', conflict_status: 'UNRESOLVED_OFFICIAL_CONFLICT', conflict_group_id: 'conflict-a', conflicting_values: [{ normalized_value: 2.5 }] })];
assert.strictEqual(validateFixture(candidate).valid, true, 'properly represented unresolved conflict is allowed without a single-value promotion');

candidate = [fixtureFact({ fact_id: 'fact-b' }), fixtureFact({ fact_id: 'fact-a', source_document_id: 'fixture-doc-b', source_locator: 'fixture-doc-b#page=6' })];
assert(hasCode(validateFixture(candidate, { baselineFacts: baseline }), 'ERR_IMMUTABLE_PREFIX_MISMATCH'));
const databaseManifest = testManifestFor(baseline, { models: [] });
assert(hasCode(validateFixture(clone(baseline), { baselineFacts: baseline, database: { models: ['mutated'] }, manifest: databaseManifest }), 'ERR_CANONICAL_DATABASE_HASH_MISMATCH'));
assert(hasCode(validateFixture(clone(baseline), { baselineFacts: baseline, manifestWriteAttempted: true }), 'ERR_MANIFEST_WRITE_FORBIDDEN'));
assert(hasCode(validateFixture(clone(baseline), { baselineFacts: baseline, expectedHistoricalBaselineId: 'phase35c432-public-activation' }), 'ERR_HISTORICAL_REPLAY_BASELINE_MISMATCH'));
const historicalManifest = testManifestFor(baseline);
historicalManifest.historical_prefixes = [{ baseline_id: 'old-phase', historical_public_store_canonical_sha256: 'f'.repeat(64) }];
assert(hasCode(validatePublicEvidenceBaseline({ manifest: historicalManifest, publicEvidenceStore: { schema_version: 'public-evidence-v1', facts: baseline }, database: { models: [] }, baselineFacts: baseline, historicalStoresByBaselineId: { 'old-phase': { facts: baseline } } }), 'ERR_HISTORICAL_PREFIX_MISMATCH'));

assert.deepStrictEqual(baseline, baselineSnapshot, 'validator may not mutate fixture inputs');
assert.strictEqual(canonicalize({ b: 2, a: [1, 'x'] }), '{"a":[1,"x"],"b":2}');
console.log('Phase 38E baseline architecture tests passed.');
