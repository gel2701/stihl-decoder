/**
 * Phase 38F.1: MS 251 C Identity Remediation Tests
 * Tests the canonical identity registration for MS 251 C
 * and variant isolation guarantees.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import assert from 'assert';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const { buildSearchableIdentities, searchGlobalModels, findRegisteredModel } = require('../src/globalModelSearch.js');
const { decodeStihlCode } = require('../src/decoder.js');

const database = JSON.parse(readFileSync(join(rootDir, 'data/stihl_database.json'), 'utf8'));
database.public_evidence = JSON.parse(readFileSync(join(rootDir, 'data/public_evidence_facts.json'), 'utf8'));

console.log('=== Phase 38F.1: MS 251 C Identity Remediation Tests ===');

// Test 1: MS 251 C canonical identity exists
console.log('Test 1: MS 251 C canonical identity exists in stihl_database.json');
const ms251cModel = database.models.find(m => m.slug === 'ms-251-c');
assert.ok(ms251cModel, 'MS 251 C must be a registered model');
assert.strictEqual(ms251cModel.model_name, 'MS 251 C');
assert.strictEqual(ms251cModel.id, 'stihl_ms_251_c');
console.log('✓ Test 1 passed: MS 251 C registered as canonical identity');

// Test 2: MS 251 C is searchable via globalModelSearch
console.log('Test 2: MS 251 C search normalization');
const identities = buildSearchableIdentities(database);
const ms251cIdentity = identities.find(i => i.slug === 'ms-251-c');
assert.ok(ms251cIdentity, 'MS 251 C must appear in searchable identities');
assert.strictEqual(ms251cIdentity.model_name, 'MS 251 C');
assert.strictEqual(ms251cIdentity.is_canonical, true);
console.log('✓ Test 2 passed: MS 251 C is canonical and searchable');

// Test 3: Search normalization variants
console.log('Test 3: Search normalization for MS 251 C variants');
const searchTests = [
  { query: 'MS 251 C', expectedSlug: 'ms-251-c' },
  { query: 'MS251C', expectedSlug: 'ms-251-c' },
  { query: 'MS 251/C', expectedSlug: 'ms-251-c' },
  { query: 'MS251/C', expectedSlug: 'ms-251-c' },
  { query: 'MS 251', expectedSlug: 'ms-251' }
];

for (const { query, expectedSlug } of searchTests) {
  const found = findRegisteredModel(query, identities);
  assert.ok(found, `${query} must resolve to a registered model`);
  assert.strictEqual(found.slug, expectedSlug, `${query} must resolve to ${expectedSlug}`);
}
console.log('✓ Test 3 passed: All MS 251 C search variants resolve correctly');

// Test 4: Variant isolation - C-BE and C-BEQ must not alias to ms-251-c
console.log('Test 4: Variant isolation for C-BE and C-BEQ');
const falseAliasTests = [
  { query: 'MS 251 C-BE', expectedSlug: null },
  { query: 'MS 251 C-BEQ', expectedSlug: null },
  { query: 'MS251C-BE', expectedSlug: null },
  { query: 'MS251C-BEQ', expectedSlug: null }
];

for (const { query, expectedSlug } of falseAliasTests) {
  const found = findRegisteredModel(query, identities);
  const actualSlug = found ? found.slug : null;
  assert.strictEqual(actualSlug, expectedSlug, `${query} must NOT alias to ms-251-c`);
}
console.log('✓ Test 4 passed: C-BE and C-BEQ do not false-alias to ms-251-c');

// Test 5: MS 251 is isolated from MS 251 C
console.log('Test 5: MS 251 isolation');
const ms251Found = findRegisteredModel('MS 251', identities);
assert.ok(ms251Found, 'MS 251 must be registered');
assert.strictEqual(ms251Found.slug, 'ms-251', 'MS 251 must resolve to ms-251, not ms-251-c');
console.log('✓ Test 5 passed: MS 251 isolated from MS 251 C');

// Test 6: MS 9999 TURBO remains unverified
console.log('Test 6: Unknown model (MS 9999 TURBO) remains unverified');
const unknownFound = findRegisteredModel('MS 9999 TURBO', identities);
assert.strictEqual(unknownFound, null, 'MS 9999 TURBO must NOT be in registered safe identities');
const unknownDecode = decodeStihlCode('MS 9999 TURBO', database);
assert.strictEqual(unknownDecode.success, false, 'Unknown model must not succeed');
assert.strictEqual(unknownDecode.status, 'NOT_FOUND', 'Unknown model status must be NOT_FOUND');
console.log('✓ Test 6 passed: MS 9999 TURBO remains unverified with NOT_FOUND status');

// Test 7: MS 251 C decode with serial
console.log('Test 7: MS 251 C decode with serial 185000000');
const ms251cDecode = decodeStihlCode('185000000', database, { confirmedModel: 'MS 251 C' });
assert.strictEqual(ms251cDecode.model, 'MS 251 C');
assert.strictEqual(ms251cDecode.confirmedModel, 'MS 251 C');
assert.strictEqual(ms251cDecode.exactModel, null, 'exactModel must NOT be spoofed');
assert.strictEqual(ms251cDecode.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
// MS 251 C has no public evidence yet (Phase 38F.1 is identity-only, not evidence activation)
console.log('✓ Test 7 passed: MS 251 C decode works with USER_CONFIRMED_MODEL status');

// Test 8: Public evidence not incorrectly shared
console.log('Test 8: Public evidence not shared with MS 251 C');
const evidenceModelIndex = database.public_evidence.model_index;
assert.ok(!evidenceModelIndex['ms-251-c'], 'ms-251-c must NOT be in public evidence model_index');
assert.ok(evidenceModelIndex['ms-251'], 'ms-251 must be in public evidence model_index');
console.log('✓ Test 8 passed: MS 251 C has no public evidence (correctly separated)');

console.log('');
console.log('=== All Phase 38F.1 Tests PASSED ===');
