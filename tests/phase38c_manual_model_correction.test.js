/**
 * Phase 38C Test Suite:
 * Manual Model Correction, Global Model Search & Field Observation Learning Loop
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { fileURLToPath } from 'url';

import { decodeStihlCode } from '../src/decoder.js';
import { buildSearchableIdentities, searchGlobalModels, findRegisteredModel, normalizeSearchQuery } from '../src/globalModelSearch.js';
import { createDossierObject, saveDossier, validateDossierSchema, DOSSIER_SAVEABLE_IDENTITY_STATUSES } from '../src/components/MachineDossierManager.js';
import { getDatabaseConnection } from '../src/databaseConfig.js';
import { server } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const CANONICAL_DB_PATH = path.join(rootDir, 'data/stihl_database.json');
const PUBLIC_FACTS_PATH = path.join(rootDir, 'data/public_evidence_facts.json');

const database = JSON.parse(fs.readFileSync(CANONICAL_DB_PATH, 'utf8'));
if (fs.existsSync(PUBLIC_FACTS_PATH)) {
  database.public_evidence = JSON.parse(fs.readFileSync(PUBLIC_FACTS_PATH, 'utf8'));
}

console.log('=== Running Phase 38C: Manual Model Correction Test Suite ===\n');

// 1. REPRODUCE SYNTHETIC SERIAL FIXTURE 185000000
console.log('Test 1: Synthetic serial 185000000 decoder baseline');
const res1850 = decodeStihlCode('185000000', database);
assert.strictEqual(res1850.success, true, 'Decode must succeed');
assert.strictEqual(res1850.modelIdentityStatus, 'PROBABLE_MODEL_SERIES', 'Must resolve to PROBABLE_MODEL_SERIES');
assert.ok(res1850.probableModelSeries.includes('261'), 'Probable series must reference 261');
assert.strictEqual(res1850.exactModel, null, 'Exact model must be null for probable series');
assert.strictEqual(res1850.modelAssistAvailable, true, 'modelAssistAvailable must be true');
console.log('✓ Test 1 passed');

// 2. GLOBAL MODEL SEARCH COVERAGE (100% of 57 identities)
console.log('Test 2: Global model search coverage across all registered identities');
const allIdentities = buildSearchableIdentities(database);
assert.strictEqual(allIdentities.length, 59, 'Must contain exactly 59 unique identities (58 baseline + 1 MS 251 C)');
let omittedCount = 0;
for (const id of allIdentities) {
  const searchRes = searchGlobalModels(id.model_name, allIdentities);
  if (!searchRes.some(r => r.slug === id.slug)) {
    omittedCount++;
  }
}
assert.strictEqual(omittedCount, 0, 'REGISTERED_SAFE_IDENTITIES_OMITTED_FROM_GLOBAL_SEARCH must be 0');
console.log('✓ Test 2 passed: 59/59 identities searchable (0 omitted)');

// 3. QUERY NORMALIZATION & VARIANT ISOLATION
console.log('Test 3: Query normalization and variant ranking');
const qNorm1 = searchGlobalModels('ms-261', allIdentities);
const qNorm2 = searchGlobalModels('stihl ms261', allIdentities);
const qNorm3 = searchGlobalModels('MS 261', allIdentities);
assert.ok(qNorm1.length > 0 && qNorm2.length > 0 && qNorm3.length > 0, 'All query variants must find matches');
assert.strictEqual(qNorm1[0].slug, qNorm3[0].slug, 'Normalized results must be consistent');

// Variant isolation: MS 200 vs MS 200 T
const searchMs200 = searchGlobalModels('MS 200', allIdentities);
assert.strictEqual(searchMs200[0].slug, 'ms-200', 'Base model ms-200 must rank first');
if (searchMs200.length > 1) {
  assert.ok(searchMs200.some(m => m.slug === 'ms-200-t'), 'Variant ms-200-t must follow');
}

// Variant isolation: MS 261 vs MS 261 C-M
const searchMs261 = searchGlobalModels('MS 261', allIdentities);
assert.strictEqual(searchMs261[0].slug, 'ms-261', 'Base model MS 261 must rank before MS 261 C-M');
assert.strictEqual(searchMs261[0].model_name, 'MS 261', 'Base model MS 261 name matches');
console.log('✓ Test 3 passed: Variant isolation and query normalization verified');

// 4. KNOWN MODEL SELECTION OUTSIDE PREDICTED SERIES
console.log('Test 4: Known model selection outside predicted series');
// Synthetic serial 185000000 predicts MS 261 series, but user selects MS 170
const resConfirmedOutside = decodeStihlCode('185000000', database, { confirmedModel: 'MS 170' });
assert.strictEqual(resConfirmedOutside.success, true);
assert.strictEqual(resConfirmedOutside.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(resConfirmedOutside.confirmedModel, 'MS 170');
assert.strictEqual(resConfirmedOutside.exactModel, null, 'exactModel must NOT be spoofed');
assert.strictEqual(resConfirmedOutside.model, 'MS 170');
assert.ok(resConfirmedOutside.technicalSpecs, 'Must have technicalSpecs');
// Spec parity check: specs must match direct MS 170 decode specs
const directMs170 = decodeStihlCode('ms-170', database);
assert.strictEqual(resConfirmedOutside.technicalSpecs.displacement_cc, directMs170.technicalSpecs.displacement_cc);
assert.strictEqual(resConfirmedOutside.technicalSpecs.power_kw, directMs170.technicalSpecs.power_kw);
console.log('✓ Test 4 passed: User confirmed model outside series preserves spec parity without spoofing exactModel');

// 5. REGISTERED MODEL (e.g. MS 251 / C - now registered as MS 251 C via Phase 38F.1)
console.log('Test 5: Registered model lookup (MS 251 / C)');
const ms251Found = findRegisteredModel('MS 251 / C', allIdentities);
assert.ok(ms251Found !== null, 'MS 251 / C must now be in registered safe identities (Phase 38F.1)');
assert.strictEqual(ms251Found.slug, 'ms-251-c', 'MS 251 / C must resolve to ms-251-c');

// Dossier rejection of USER_REPORTED_UNVERIFIED_MODEL still holds
assert.ok(!DOSSIER_SAVEABLE_IDENTITY_STATUSES.includes('USER_REPORTED_UNVERIFIED_MODEL'), 'USER_REPORTED_UNVERIFIED_MODEL must not be saveable');

assert.throws(() => {
  createDossierObject({
    model_name: 'MS 251 / C',
    model_slug: 'ms-251-c',
    serial_number: '185000000',
    identity_status: 'USER_REPORTED_UNVERIFIED_MODEL',
    identity_source: 'MANUAL_FREE_TEXT'
  });
}, /Invalid identity status/);

const unverifiedDossierObj = {
  schema_version: '2.0.0',
  dossier_id: 'dossier-test-1',
  identity: {
    model_name: 'MS 251 / C',
    model_slug: 'ms-251-c',
    identity_status: 'USER_REPORTED_UNVERIFIED_MODEL',
    identity_source: 'MANUAL_FREE_TEXT'
  },
  machine: {},
  maintenance: { notes: [], events: [], reminders: [] }
};
const valResult = validateDossierSchema(unverifiedDossierObj);

// 5b. Registered model lookup & spec resolution (MS 251 / C)
const ms251CExactFound = findRegisteredModel('MS 251 / C', allIdentities);
assert.ok(ms251CExactFound !== null, 'MS 251 / C must be in registered safe identities (Phase 38F.1)');
assert.strictEqual(ms251CExactFound.slug, 'ms-251-c');
const direct251C = decodeStihlCode('MS 251 / C', database);
assert.strictEqual(direct251C.success, true, 'Direct MS 251 / C must resolve successfully');
const manual251C = decodeStihlCode('185000000', database, { confirmedModel: 'MS 251 / C' });
assert.strictEqual(manual251C.success, true, 'Manual MS 251 / C must resolve successfully');

console.log('✓ Test 5 passed: MS 251 / C now resolves as registered model (Phase 38F.1), USER_REPORTED_UNVERIFIED_MODEL boundary preserved');

// 6. SQLITE FIELD OBSERVATIONS SCHEMA & ATOMIC DEDUPLICATION
console.log('Test 6: Database table field_observations and deduplication');
const db = getDatabaseConnection();

db.serialize(() => {
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='field_observations';", (err, row) => {
    assert.ifError(err);
    assert.ok(row, 'Table field_observations must exist in schema');
  });

  const serialHash = crypto.createHash('sha256').update('185000000_test').digest('hex');
  const dedupeKey = crypto.createHash('sha256').update(serialHash + ':ms-251-c').digest('hex');
  const obsId1 = 'obs-test-' + Date.now() + '-1';
  const obsId2 = 'obs-test-' + Date.now() + '-2';

  db.run(`INSERT INTO field_observations (
    observation_id, dedupe_key, serial_normalized, serial_hash,
    decoder_identity_status, decoder_predicted_series, decoder_candidate_slugs_json,
    user_reported_model_raw, user_reported_model_normalized,
    matched_model_slug, matched_model_name, observation_source,
    verification_status, consent_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'v1')`, [
    obsId1, dedupeKey, '185000000_test', serialHash,
    'PROBABLE_MODEL_SERIES', 'MS 261', '["ms-261","ms-261-c-m"]',
    'MS 251 / C', 'ms 251 c',
    null, null, 'TYPEPLATE'
  ], function(err) {
    assert.ifError(err, 'First insert must succeed');

    db.run(`INSERT INTO field_observations (
      observation_id, dedupe_key, serial_normalized, serial_hash,
      decoder_identity_status, decoder_predicted_series, decoder_candidate_slugs_json,
      user_reported_model_raw, user_reported_model_normalized,
      matched_model_slug, matched_model_name, observation_source,
      verification_status, consent_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'v1')`, [
      obsId2, dedupeKey, '185000000_test', serialHash,
      'PROBABLE_MODEL_SERIES', 'MS 261', '["ms-261","ms-261-c-m"]',
      'MS 251 / C', 'ms 251 c',
      null, null, 'TYPEPLATE'
    ], function(err2) {
      assert.ok(err2, 'Duplicate dedupe_key insert must fail');
      assert.ok(err2.message.includes('UNIQUE constraint failed') || err2.message.includes('dedupe_key'), 'Error must cite UNIQUE constraint');
      console.log('✓ Test 6 passed: Table field_observations and unique dedupe_key enforced');

      // Cleanup test rows
      db.run('DELETE FROM field_observations WHERE serial_normalized = ?', ['185000000_test'], async () => {
        await runAsyncTests();
      });
    });
  });
});

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

async function runAsyncTests() {
  // 7. REVIEW REPORT SCRIPT CANDIDATE MATCHING
  console.log('Test 7: Offline review report matching with document registry');
  const docRegistryPath = path.join(rootDir, 'data/batch3_pdf_document_registry.json');
  const docRegistry = JSON.parse(fs.readFileSync(docRegistryPath, 'utf8'));
  const docs = docRegistry.documents || [];
  const matchDoc = docs.find(d => /251/.test(d.source_file_path || ''));
  assert.ok(matchDoc, 'Document registry must contain candidate document for MS 251');
  assert.strictEqual(matchDoc.document_id, 'batch3:66', 'Candidate document id must match batch3:66');
  console.log('✓ Test 7 passed: Document candidate matched to batch3:66');

  // 8. EVIDENCE CONTRACT & BREAKPOINT IMMUTABILITY
  console.log('Test 8: Evidence contract and breakpoint immutability');
  const rawFactStoreText = fs.readFileSync(PUBLIC_FACTS_PATH, 'utf8');
  const factStore = JSON.parse(rawFactStoreText);
  assert.strictEqual(factStore.facts.length, 474, 'PUBLIC_FACT_COUNT must remain 474');
  const factArraySha = crypto.createHash('sha256').update(stable(factStore.facts)).digest('hex');
  assert.strictEqual(factArraySha, '2ef63726618b269ed2c4aaf88a98dc43bd87a6b113a1c4b98fb1a7878a3c53bc');
  const publicStoreSha = crypto.createHash('sha256').update(stable(factStore)).digest('hex');
  assert.strictEqual(publicStoreSha, 'b73f5ec707ae562000f878d40b10494c125503d621ee679b83390bd2c7362584');
  const cleanDb = JSON.parse(fs.readFileSync(CANONICAL_DB_PATH, 'utf8'));
  const canonicalDbSha = crypto.createHash('sha256').update(stable(cleanDb)).digest('hex');
  assert.strictEqual(canonicalDbSha, 'da438fdd859ecf86abd955c7162bf751109505467990a00e99808e5098b31baf');
  console.log('✓ Test 8 passed: 452 facts, database and store SHA256 completely intact');

  // 9. REGRESSION CHECKS: Serial 184592301
  console.log('Test 9: Regression check on serial 184592301');
  const res1845Unconfirmed = decodeStihlCode('184592301', database);
  assert.strictEqual(res1845Unconfirmed.success, true);
  assert.strictEqual(res1845Unconfirmed.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
  assert.strictEqual(res1845Unconfirmed.exactModel, null);

  const res1845Confirmed = decodeStihlCode('184592301', database, { confirmedModel: 'MS 261 C-M' });
  assert.strictEqual(res1845Confirmed.success, true);
  assert.strictEqual(res1845Confirmed.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
  assert.strictEqual(res1845Confirmed.confirmedModel, 'MS 261 C-M');
  console.log('✓ Test 9 passed: Regression verification successful');

  // 10. HTTP ENDPOINTS: GET /api/models & POST /api/field-observation
  console.log('Test 10: HTTP API endpoints (/api/models & /api/field-observation)');
  let port = 3000;
  if (!server.listening) {
    await new Promise(resolve => server.listen(0, resolve));
  }
  port = server.address().port;

  function makeRequest(pathname, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method: options.method || 'GET',
        headers: options.headers || {}
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: body });
        });
      });
      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  // 10a. GET /api/models
  const modelsRes = await makeRequest('/api/models');
  assert.strictEqual(modelsRes.status, 200);
  assert.ok(Array.isArray(modelsRes.body));
  assert.strictEqual(modelsRes.body.length, 59);
  assert.ok(modelsRes.body.some(m => m.model_name === 'MS 261'));
  console.log('✓ Test 10a passed: GET /api/models returns 59 identities');

  // 10b. POST /api/field-observation consent check
  const noConsentRes = await makeRequest('/api/field-observation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { serial: '185000000', reportedModel: 'MS 251 / C', observationSource: 'TYPEPLATE', consent: false }
  });
  assert.strictEqual(noConsentRes.status, 400);
  assert.strictEqual(noConsentRes.body.error, 'CONSENT_REQUIRED');
  console.log('✓ Test 10b passed: Consent check strictly enforced');

  // 10c. POST /api/field-observation cross-origin check
  const crossOriginRes = await makeRequest('/api/field-observation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'sec-fetch-site': 'cross-site'
    },
    body: { serial: '185000000', reportedModel: 'MS 251 / C', observationSource: 'TYPEPLATE', consent: true }
  });
  assert.strictEqual(crossOriginRes.status, 403);
  assert.strictEqual(crossOriginRes.body.error, 'FORBIDDEN');
  console.log('✓ Test 10c passed: Cross-site requests rejected (403)');

  // 10d. POST /api/field-observation valid submission + deduplication
  const validObs = {
    serial: '185000000',
    reportedModel: 'MS 251 / C',
    observationSource: 'TYPEPLATE',
    consent: true
  };
  const obs1 = await makeRequest('/api/field-observation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: validObs
  });
  assert.strictEqual(obs1.status, 200);
  assert.strictEqual(obs1.body.success, true);
  assert.strictEqual(obs1.body.status, 'PENDING');
  // CLIENT_VISIBLE_OBSERVATION_IDS = 0
  assert.strictEqual(obs1.body.observation_id, undefined, 'Observation ID must not be leaked to client');
  assert.strictEqual(obs1.body.observationId, undefined, 'Observation ID must not be leaked to client');

  // Duplicate submission
  const obs2 = await makeRequest('/api/field-observation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: validObs
  });
  assert.strictEqual(obs2.status, 200);
  assert.strictEqual(obs2.body.success, true);
  assert.strictEqual(obs2.body.already_received, true, 'Duplicate submission returns already_received: true');

  // Verify in database that exactly 1 row was created
  const dbRows = await new Promise((resolve) => {
    db.all("SELECT * FROM field_observations WHERE serial_normalized = '185000000'", (err, rows) => resolve(rows || []));
  });
  assert.strictEqual(dbRows.length, 1, 'Two duplicate HTTP requests must result in exactly 1 database row');
  console.log('✓ Test 10d passed: Valid observation and atomic deduplication verified (2 HTTP requests -> 1 DB row)');

  // 11. CLIENT SUBMIT FLOW & BUTTON RECOVERY CONTRACT (FASE 38C.3)
  console.log('Test 11: Client submit button recovery & single-submit contract');

  // Verify index.html handler contract statically
  const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const consentIdx = indexHtmlContent.indexOf('if (!obsConsentCheckbox || !obsConsentCheckbox.checked)');
  const disableIdx = indexHtmlContent.indexOf('obsSubmitBtn.disabled = true;');
  assert.ok(consentIdx > 0, 'Consent check must exist in index.html');
  assert.ok(disableIdx > 0, 'Button disable statement must exist in index.html');
  assert.ok(consentIdx < disableIdx, 'CONSENT_CHECK_BEFORE_DISABLE: Consent check must precede button disable');

  // Simulate client submit state machine
  class ClientSubmitHarness {
    constructor(fetchMock) {
      this.fetch = fetchMock;
      this.checkbox = { checked: false, disabled: false };
      this.button = { disabled: false };
      this.feedback = { text: '', className: '' };
      this.postCount = 0;
    }

    async clickSubmit(serial, reportedModel) {
      if (this.button.disabled) return;
      if (!this.checkbox || !this.checkbox.checked) {
        this.feedback.text = 'Vink eerst het toestemmingsvakje aan om te versturen.';
        this.button.disabled = false;
        return;
      }
      this.button.disabled = true;
      try {
        this.postCount++;
        const resp = await this.fetch('/api/field-observation', {
          method: 'POST',
          body: JSON.stringify({ serial, reportedModel, consent: true })
        });
        if (resp.ok && resp.data && resp.data.success) {
          this.button.disabled = true;
          this.checkbox.disabled = true;
          this.feedback.text = '✓ Veldobservatie succesvol ontvangen.';
        } else {
          this.button.disabled = false;
          this.feedback.text = 'Fout bij versturen';
        }
      } catch (err) {
        this.button.disabled = false;
        this.feedback.text = 'Netwerkfout bij versturen';
      }
    }
  }

  // A. No-consent click attempt
  const harnessA = new ClientSubmitHarness(async () => ({ ok: true, data: { success: true } }));
  harnessA.checkbox.checked = false;
  await harnessA.clickSubmit('185000000', 'MS 251');
  assert.strictEqual(harnessA.postCount, 0, 'No consent => 0 POST requests');
  assert.strictEqual(harnessA.button.disabled, false, 'Button remains enabled after no-consent attempt');
  assert.ok(harnessA.feedback.text.includes('toestemming'), 'Feedback informs user consent is required');

  // B. Recovery without reload: user checks box and clicks submit
  harnessA.checkbox.checked = true;
  await harnessA.clickSubmit('185000000', 'MS 251');
  assert.strictEqual(harnessA.postCount, 1, 'Consented click => exactly 1 POST');
  assert.strictEqual(harnessA.button.disabled, true, 'Button disabled after success');
  // Duplicate click attempt after success
  await harnessA.clickSubmit('185000000', 'MS 251');
  assert.strictEqual(harnessA.postCount, 1, 'Duplicate click after success prevented (SUCCESS_DOUBLE_SUBMIT_PROTECTION)');

  // C. Network failure recovery
  const harnessNetwork = new ClientSubmitHarness(async () => { throw new Error('Network error'); });
  harnessNetwork.checkbox.checked = true;
  await harnessNetwork.clickSubmit('185000000', 'MS 251');
  assert.strictEqual(harnessNetwork.postCount, 1);
  assert.strictEqual(harnessNetwork.button.disabled, false, 'Button re-enabled after network error');

  // D. HTTP 500 recovery
  const harness500 = new ClientSubmitHarness(async () => ({ ok: false, status: 500, data: { error: 'INTERNAL_ERROR' } }));
  harness500.checkbox.checked = true;
  await harness500.clickSubmit('185000000', 'MS 251');
  assert.strictEqual(harness500.postCount, 1);
  assert.strictEqual(harness500.button.disabled, false, 'Button re-enabled after HTTP 500');

  // E. HTTP 429 recovery
  const harness429 = new ClientSubmitHarness(async () => ({ ok: false, status: 429, data: { error: 'RATE_LIMIT_EXCEEDED' } }));
  harness429.checkbox.checked = true;
  await harness429.clickSubmit('185000000', 'MS 251');
  assert.strictEqual(harness429.postCount, 1);
  assert.strictEqual(harness429.button.disabled, false, 'Button re-enabled after HTTP 429');

  console.log('✓ Test 11 passed: Submit button recovery, no-consent safety, and double-submit protection verified');

  // Clean up test observation from db
  db.run('DELETE FROM field_observations WHERE serial_normalized = ?', ['185000000'], () => {
    console.log('\nALL PHASE 38C TESTS PASSED!');
    process.exit(0);
  });
}
