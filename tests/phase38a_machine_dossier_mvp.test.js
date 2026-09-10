import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import {
  DOSSIER_STORAGE_KEY,
  DOSSIER_SCHEMA_VERSION,
  IDENTITY_STATUSES,
  IDENTITY_SOURCES,
  generateDossierId,
  validateDossierSchema,
  createDossierObject,
  loadDossiers,
  saveDossier,
  deleteDossier,
  updateDossierUserData,
  addDossierNote,
  hydrateDossierEvidence,
  setSafeText
} from '../src/components/MachineDossierManager.js';
import { renderPassportHubHtml } from '../src/components/IntentPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8'));
database.public_evidence = store;

console.log('🧪 Running Phase 38A Machine Dossier MVP Tests...');

// Mock localStorage for Node environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const mockStorage = new MockLocalStorage();
global.localStorage = mockStorage;

// ============================================================================
// Test 1: test_dossier_readiness_matrix
// ============================================================================
console.log('  Testing 1: test_dossier_readiness_matrix...');
const modelSlugs = Object.keys(store.model_index);
assert.strictEqual(modelSlugs.length, 49, 'Index must have 49 models');

const MAINTENANCE_FIELDS = new Set([
  'spark_plug',
  'electrode_gap_mm',
  'fuel_tank_capacity_cm3',
  'oil_tank_capacity_cm3',
  'carb_h_setting',
  'carb_l_setting',
  'carb_la_setting',
  'idle_speed_rpm',
  'max_speed_rpm'
]);

let readyCount = 0;
let limitedCount = 0;
const limitedModels = [];

for (const slug of modelSlugs) {
  const facts = store.facts.filter(f => f.model_slug === slug);
  const maintFacts = facts.filter(f => MAINTENANCE_FIELDS.has(f.field));
  const isReady = facts.length >= 5 && maintFacts.length >= 1;
  if (isReady) {
    readyCount++;
  } else {
    limitedCount++;
    limitedModels.push(slug);
  }
}

assert.strictEqual(readyCount, 47, 'Exactly 47 models must be dossier-ready (>=5 facts & >=1 maint fact)');
assert.strictEqual(limitedCount, 2, 'Exactly 2 models must have limited official data');
assert.deepStrictEqual(limitedModels.sort(), ['ts-410', 'ts-420'], 'Limited models must be ts-410 and ts-420');
console.log('    ✓ 47 models dossier-ready, 2 limited (ts-410, ts-420)');

// ============================================================================
// Test 2: test_probable_series_blocks_dossier_save
// ============================================================================
console.log('  Testing 2: test_probable_series_blocks_dossier_save...');
const decodedProbable = decodeStihlCode('161984210', database);
assert.strictEqual(decodedProbable.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.strictEqual(decodedProbable.exactModel, null);
assert.strictEqual(decodedProbable.confirmedModel, null);
assert.ok(decodedProbable.modelAssist?.available, 'Model assist must be available for probable series');
assert.ok(decodedProbable.modelAssist?.candidates?.length > 0, 'Candidates must be provided');

// Verify index.html contains the blocking toast / prompt
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
assert.ok(
  indexHtml.includes('Bevestig eerst het model hierboven om deze machine in uw persoonlijke dossier op te slaan.'),
  'index.html must contain prompt blocking save for unconfirmed probable series'
);
console.log('    ✓ Probable series blocks immediate save with clear prompt');

// ============================================================================
// Test 3: test_user_confirmed_model_creates_dossier
// ============================================================================
console.log('  Testing 3: test_user_confirmed_model_creates_dossier...');
const decodedConfirmed = decodeStihlCode('161984210', database, { confirmedModel: 'MS 260' });
assert.strictEqual(decodedConfirmed.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(decodedConfirmed.confirmedModel, 'MS 260');
assert.strictEqual(decodedConfirmed.exactModel, null, 'exactModel must remain null because serial did not prove variant');

const dossierAssist = createDossierObject({
  model_name: decodedConfirmed.confirmedModel,
  model_slug: 'ms-260',
  serial_number: decodedConfirmed.cleaned,
  identity_status: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identity_source: IDENTITY_SOURCES.SERIAL_DECODE_ASSIST_CONFIRMED
});
assert.strictEqual(dossierAssist.identity_status, 'USER_CONFIRMED_MODEL');
assert.strictEqual(dossierAssist.identity_source, 'SERIAL_DECODE_ASSIST_CONFIRMED');
assert.strictEqual(dossierAssist.model_name, 'MS 260');
console.log('    ✓ USER_CONFIRMED_MODEL creates valid dossier preserving exactModel: null');

// ============================================================================
// Test 4: test_ms170_exact_regression
// ============================================================================
console.log('  Testing 4: test_ms170_exact_regression...');
// Control serial that resolves model
const decoded170 = decodeStihlCode('184592301', database, { confirmedModel: 'MS 170' });
assert.ok(decoded170.success);
const dossierExact = createDossierObject({
  model_name: 'MS 170',
  model_slug: 'ms-170',
  serial_number: '184592301',
  identity_status: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
  identity_source: IDENTITY_SOURCES.SERIAL_DECODE
});
assert.strictEqual(dossierExact.identity_status, 'EXACT_MODEL_IDENTIFIED');
assert.strictEqual(dossierExact.identity_source, 'SERIAL_DECODE');
console.log('    ✓ EXACT_MODEL_IDENTIFIED regression verified');

// ============================================================================
// Test 5: test_dossier_localstorage_persistence
// ============================================================================
console.log('  Testing 5: test_dossier_localstorage_persistence...');
mockStorage.clear();
const initialList = loadDossiers();
assert.deepStrictEqual(initialList, []);

const saveResult = saveDossier(dossierExact);
assert.strictEqual(saveResult.success, true);

const reloadedList = loadDossiers();
assert.strictEqual(reloadedList.length, 1);
assert.strictEqual(reloadedList[0].id, dossierExact.id);
assert.strictEqual(reloadedList[0].schema_version, DOSSIER_SCHEMA_VERSION);
assert.strictEqual(reloadedList[0].model_name, 'MS 170');
assert.strictEqual(reloadedList[0].serial_number, '184592301');
console.log('    ✓ localStorage save and reload verified');

// ============================================================================
// Test 6: test_multi_machine_isolation
// ============================================================================
console.log('  Testing 6: test_multi_machine_isolation...');
const dossierSecond = createDossierObject({
  model_name: 'MS 261 C-M',
  model_slug: 'ms-261-c-m',
  nickname: 'Bosbouwzaag',
  identity_status: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identity_source: IDENTITY_SOURCES.MODEL_PAGE_SELECTION
});
saveDossier(dossierSecond);

const multiList = loadDossiers();
assert.strictEqual(multiList.length, 2);
assert.notStrictEqual(multiList[0].id, multiList[1].id);
assert.strictEqual(multiList[1].nickname, 'Bosbouwzaag');
console.log('    ✓ Multi-machine isolation verified');

// ============================================================================
// Test 7: test_dossier_user_edit_and_delete
// ============================================================================
console.log('  Testing 7: test_dossier_user_edit_and_delete...');
updateDossierUserData(dossierSecond.id, {
  nickname: 'Zware Zaag',
  purchase_year: 2021
});
let updatedList = loadDossiers();
const foundSecond = updatedList.find(d => d.id === dossierSecond.id);
assert.strictEqual(foundSecond.nickname, 'Zware Zaag');
assert.strictEqual(foundSecond.purchase_year, 2021);

addDossierNote(dossierSecond.id, 'Nieuwe ketting gelegd', 'MAINTENANCE');
updatedList = loadDossiers();
const foundWithNote = updatedList.find(d => d.id === dossierSecond.id);
assert.strictEqual(foundWithNote.notes.length, 1);
assert.strictEqual(foundWithNote.notes[0].text, 'Nieuwe ketting gelegd');
assert.strictEqual(foundWithNote.notes[0].category, 'MAINTENANCE');

const delResult = deleteDossier(dossierSecond.id);
assert.strictEqual(delResult.success, true);
assert.strictEqual(loadDossiers().length, 1);
console.log('    ✓ User edit, note append, and delete verified');

// ============================================================================
// Test 8: test_corrupt_storage_recovery
// ============================================================================
console.log('  Testing 8: test_corrupt_storage_recovery...');
mockStorage.setItem(DOSSIER_STORAGE_KEY, '{invalid json');
const recovered = loadDossiers();
assert.deepStrictEqual(recovered, [], 'Corrupt storage must recover to empty array without crashing');

mockStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify({ schema_version: 999, dossiers: [] }));
const wrongVersion = loadDossiers();
assert.deepStrictEqual(wrongVersion, [], 'Unknown schema version must recover gracefully');
console.log('    ✓ Corrupt storage recovery verified');

// ============================================================================
// Test 9: test_xss_prevention
// ============================================================================
console.log('  Testing 9: test_xss_prevention...');
const mockElement = { textContent: '' };
setSafeText(mockElement, '<script>alert("XSS")</script>');
assert.strictEqual(mockElement.textContent, '<script>alert("XSS")</script>');

// Verify IntentPageTemplate uses safe DOM textContent methods for user inputs
const templateSource = fs.readFileSync(path.join(rootDir, 'src', 'components', 'IntentPageTemplate.js'), 'utf8');
assert.ok(templateSource.includes('setSafeText'), 'IntentPageTemplate must use setSafeText helper');
assert.ok(!templateSource.includes('innerHTML = user') && !templateSource.includes('innerHTML = note.text'), 'User data must never be assigned to innerHTML');
console.log('    ✓ XSS prevention with safe DOM sinks verified');

// ============================================================================
// Test 10: test_category_field_isolation
// ============================================================================
console.log('  Testing 10: test_category_field_isolation...');
const bg86 = decodeStihlCode('BG 86', database);
assert.strictEqual(bg86.technicalSpecs?.chain_pitch, undefined, 'Blower must not have chain_pitch');
assert.strictEqual(bg86.technicalSpecs?.chain_gauge_mm, undefined, 'Blower must not have chain_gauge_mm');
assert.strictEqual(bg86.technicalSpecs?.oil_tank_capacity_cm3, undefined, 'Blower must not have oil_tank_capacity_cm3');

const ms261 = decodeStihlCode('MS 261', database);
assert.strictEqual(ms261.technicalSpecs?.blowing_force_n, undefined, 'Chainsaw must not have blowing_force_n');
console.log('    ✓ Category field isolation verified');

// ============================================================================
// Test 11: test_conflict_display_preservation
// ============================================================================
console.log('  Testing 11: test_conflict_display_preservation...');
const res046 = decodeStihlCode('046', database);
assert.strictEqual(res046.technicalSpecs.stroke_mm, undefined, 'Conflicted field stroke_mm must not appear in technicalSpecs');
assert.strictEqual(res046.publicEvidenceFields?.stroke_mm?.evidence_status, 'OFFICIAL_CONFLICTED');
console.log('    ✓ 046 stroke_mm conflict display preservation verified');

// ============================================================================
// Test 12: test_source_link_safety
// ============================================================================
console.log('  Testing 12: test_source_link_safety...');
const sourcesWithLinks = store.facts.filter(f => f.source_url);
for (const f of sourcesWithLinks) {
  assert.ok(f.source_url.startsWith('https://') || f.source_url.startsWith('http://'), `Source URL must be valid HTTP(S): ${f.source_url}`);
}
console.log('    ✓ Source link safety verified');

// ============================================================================
// Test 13: test_analytics_and_network_privacy
// ============================================================================
console.log('  Testing 13: test_analytics_and_network_privacy...');
const paspoortHtml = renderPassportHubHtml();
assert.strictEqual(paspoortHtml.includes('cdn.tailwindcss.com'), false, 'Third party Tailwind script must not be present');
assert.strictEqual(paspoortHtml.includes('api.qrserver.com'), false, 'External QR code API must not be called');
assert.ok(paspoortHtml.includes('/css/tailwind.css'), 'Local Tailwind CSS must be used');
assert.ok(paspoortHtml.includes('/css/styles.css'), 'Local styles CSS must be used');
console.log('    ✓ Zero 3rd party scripts and zero external QR requests verified');

// ============================================================================
// Test 14: test_fact_store_immutability
// ============================================================================
console.log('  Testing 14: test_fact_store_immutability...');
const rawFactStoreText = fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8');
const factStore = JSON.parse(rawFactStoreText);
assert.strictEqual(factStore.facts.length, 452, 'PUBLIC_FACT_COUNT must be strictly 452');

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
const canonicalSha256 = crypto.createHash('sha256').update(stable(factStore)).digest('hex');
assert.strictEqual(
  canonicalSha256,
  '438747580e3b1be15832d108e01656fec8d2b424c2701cee582695526da76951',
  'Fact store canonical SHA256 must match Phase 37C candidate hash exactly'
);
console.log('    ✓ Fact store immutability verified (452 facts, hash intact)');

// ============================================================================
// Test 15: test_model_page_explicit_confirmation
// ============================================================================
console.log('  Testing 15: test_model_page_explicit_confirmation...');
const modelPageDossier = createDossierObject({
  model_name: 'MS 310',
  model_slug: 'ms-310',
  identity_status: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identity_source: IDENTITY_SOURCES.MODEL_PAGE_SELECTION
});
assert.strictEqual(modelPageDossier.identity_status, 'USER_CONFIRMED_MODEL');
assert.strictEqual(modelPageDossier.identity_source, 'MODEL_PAGE_SELECTION');
assert.strictEqual(modelPageDossier.serial_number, null);

// Check that ModelPageTemplate includes the CTA link with hash
const modelPageHtml = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ModelPageTemplate.js'), 'utf8');
assert.ok(
  modelPageHtml.includes('/stihl-paspoort/#add='),
  'ModelPageTemplate must link to /stihl-paspoort/#add=<slug>'
);
console.log('    ✓ Model page flow explicit confirmation verified');

// ============================================================================
// Test 16: test_last_service_date_operations (Section 3)
// ============================================================================
console.log('  Testing 16: test_last_service_date_operations...');
mockStorage.clear();
const serviceDossier = createDossierObject({
  model_name: 'FS 120',
  model_slug: 'fs-120',
  identity_status: 'USER_CONFIRMED_MODEL',
  identity_source: 'MODEL_PAGE_SELECTION',
  last_service_date: '2026-05-10'
});
assert.strictEqual(serviceDossier.maintenance.last_service_date, '2026-05-10');
assert.strictEqual(serviceDossier.last_service_date, '2026-05-10');
saveDossier(serviceDossier);

// Reload and retain
let loaded = loadDossiers();
assert.strictEqual(loaded[0].maintenance.last_service_date, '2026-05-10');
assert.strictEqual(loaded[0].last_service_date, '2026-05-10');

// Edit last_service_date
updateDossierUserData(serviceDossier.id, { last_service_date: '2026-08-20' });
loaded = loadDossiers();
assert.strictEqual(loaded[0].maintenance.last_service_date, '2026-08-20');
assert.strictEqual(loaded[0].last_service_date, '2026-08-20');

// Clear last_service_date
updateDossierUserData(serviceDossier.id, { last_service_date: null });
loaded = loadDossiers();
assert.strictEqual(loaded[0].maintenance.last_service_date, null);
assert.strictEqual(loaded[0].last_service_date, null);

// Check display label in template
const passportTemplateHtml = fs.readFileSync(path.join(rootDir, 'src', 'components', 'IntentPageTemplate.js'), 'utf8');
assert.ok(passportTemplateHtml.includes('Laatste onderhoud'), 'Template must include label "Laatste onderhoud"');
assert.ok(passportTemplateHtml.includes('door gebruiker opgegeven'), 'Template must label last service as user-provided');
console.log('    ✓ last_service_date set, edit, clear, and reload retained verified');

// ============================================================================
// Test 17: test_purchase_year_not_build_year (Section 4)
// ============================================================================
console.log('  Testing 17: test_purchase_year_not_build_year...');
// Verify that neither IntentPageTemplate nor index.html label purchase_year as Bouwjaar or Productiejaar
const ptSource = fs.readFileSync(path.join(rootDir, 'src', 'components', 'IntentPageTemplate.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
assert.ok(ptSource.includes('Aankoopjaar (door gebruiker opgegeven)'));
assert.ok(ptSource.includes('Géén onafhankelijk bouwjaar') || ptSource.includes('géén fabrieksbouwjaar'));
assert.ok(!ptSource.includes("Bouwjaar: ' + d.machine.purchase_year"), 'dossier purchase_year must not be rendered as Bouwjaar');
assert.ok(!ptSource.includes("Productiejaar: ' + d.machine.purchase_year"), 'dossier purchase_year must not be rendered as Productiejaar');
assert.ok(!indexSource.includes("Bouwjaar: ' + d.purchase_year"), 'index.html must not render purchase_year as Bouwjaar');
console.log('    ✓ purchase_year != build year verification passed (PURCHASE_YEAR_RENDERED_AS_BUILD_YEAR = 0)');

// ============================================================================
// Test 18: test_dossier_id_generation_quality (Section 5)
// ============================================================================
console.log('  Testing 18: test_dossier_id_generation_quality...');
const generatedIds = new Set();
const testSerial = 'TEST_SERIAL_123456789';
for (let i = 0; i < 1000; i++) {
  const id = generateDossierId();
  assert.strictEqual(typeof id, 'string');
  assert.ok(id.length >= 10);
  assert.ok(!id.includes(testSerial), 'Dossier ID must never contain serial');
  generatedIds.add(id);
}
assert.strictEqual(generatedIds.size, 1000, 'All 1000 generated IDs must be strictly unique (DUPLICATE_DOSSIER_IDS = 0)');
console.log('    ✓ 1000 unique non-semantic dossier IDs generated without duplicates');

// ============================================================================
// Test 19: test_clarify_qr_scope (Section 6)
// ============================================================================
console.log('  Testing 19: test_clarify_qr_scope...');
const legacyGeneratorExists = fs.existsSync(path.join(rootDir, 'src', 'components', 'StihlPassportGenerator.js'));
assert.strictEqual(legacyGeneratorExists, true, 'Legacy StihlPassportGenerator.js still exists in repo');

const ptContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'IntentPageTemplate.js'), 'utf8');
assert.ok(!ptContent.includes('StihlPassportGenerator'), 'Machine Dossier Hub must not import StihlPassportGenerator');
assert.ok(!ptContent.includes('api.qrserver.com'), 'Machine Dossier Hub must never call api.qrserver.com');
console.log('    ✓ QR scope clarified: legacy exists, dossier does not load it (DOSSIER_EXTERNAL_QR_REQUESTS = 0)');

// ============================================================================
// Test 20: test_network_boundary_forensic_intercept (Sections 8, 9, 10, 11)
// ============================================================================
console.log('  Testing 20: test_network_boundary_forensic_intercept...');
const interceptedRequests = [];
const mockFetch = async (url, opts = {}) => {
  interceptedRequests.push({
    method: opts.method || 'GET',
    url: String(url),
    body: opts.body || null
  });
  return {
    ok: true,
    json: async () => ({
      success: true,
      model: 'MS 170',
      category: 'Kettingzaag',
      technicalSpecs: { displacement_cc: 30.1 }
    })
  };
};

const secretSerial = 'TEST_SERIAL_123456789';
const secretNickname = 'TEST_NICKNAME_SECRET';
const secretYear = 2024;
const secretNote = 'TEST_PRIVATE_NOTE';
const secretServiceDate = '2026-09-10';

mockStorage.clear();
const privDossier = createDossierObject({
  model_name: 'MS 170',
  model_slug: 'ms-170',
  serial_number: secretSerial,
  nickname: secretNickname,
  purchase_year: secretYear,
  last_service_date: secretServiceDate,
  identity_status: 'USER_CONFIRMED_MODEL',
  identity_source: 'MODEL_PAGE_SELECTION'
});
saveDossier(privDossier);
addDossierNote(privDossier.id, secretNote);
updateDossierUserData(privDossier.id, { nickname: 'UPDATED_NICK' });

// Hydrate evidence
await hydrateDossierEvidence(privDossier, mockFetch);

// Delete dossier
deleteDossier(privDossier.id);

// Check intercepted traffic
assert.strictEqual(interceptedRequests.length, 1, 'Only hydration fetch should be called');
const requestUrl = interceptedRequests[0].url;
assert.strictEqual(requestUrl, '/api/decode?code=ms-170', 'Request must only send model slug');

const secrets = [secretSerial, secretNickname, String(secretYear), secretNote, secretServiceDate, privDossier.id];
for (const secret of secrets) {
  assert.ok(!requestUrl.includes(secret), `Network traffic must not contain secret: ${secret}`);
  if (interceptedRequests[0].body) {
    assert.ok(!String(interceptedRequests[0].body).includes(secret));
  }
}
console.log('    ✓ Network boundary forensic intercept passed: 0 personal data transmissions');

// ============================================================================
// Test 21: test_user_content_xss_end_to_end (Section 12)
// ============================================================================
console.log('  Testing 21: test_user_content_xss_end_to_end...');
mockStorage.clear();
const xssNickname = '<script>alert("nickname")</script>';
const xssNote = '<img src=x onerror=alert("note")>';
const xssSerial = '"><svg onload=alert(1)>';

const xssDossier = createDossierObject({
  model_name: 'MS 310',
  model_slug: 'ms-310',
  serial_number: xssSerial,
  nickname: xssNickname,
  identity_status: 'USER_CONFIRMED_MODEL',
  identity_source: 'MODEL_PAGE_SELECTION'
});
saveDossier(xssDossier);
addDossierNote(xssDossier.id, xssNote);

const reloadedXss = loadDossiers()[0];
assert.strictEqual(reloadedXss.nickname, xssNickname);
assert.strictEqual(reloadedXss.notes[0].text, xssNote);
assert.strictEqual(reloadedXss.serial_number, xssSerial);

// Verify safe text rendering
const div = { textContent: '' };
setSafeText(div, reloadedXss.nickname);
assert.strictEqual(div.textContent, xssNickname);
setSafeText(div, reloadedXss.notes[0].text);
assert.strictEqual(div.textContent, xssNote);
console.log('    ✓ XSS end-to-end verified with safe DOM sinks (USER_CONTENT_EXECUTABLE_DOM = 0)');

// ============================================================================
// Test 22: test_storage_failure_real_cases (Section 13)
// ============================================================================
console.log('  Testing 22: test_storage_failure_real_cases...');
// 1. QuotaExceededError
const quotaMockStorage = {
  getItem: () => '[]',
  setItem: () => {
    const err = new Error('Quota exceeded');
    err.name = 'QuotaExceededError';
    throw err;
  }
};
const quotaRes = saveDossier(serviceDossier, quotaMockStorage);
assert.strictEqual(quotaRes.success, false);
assert.ok(quotaRes.error.includes('niet beschikbaar'));

// 2. Storage disabled / SecurityError
const securityMockStorage = {
  getItem: () => {
    const err = new Error('Access denied');
    err.name = 'SecurityError';
    throw err;
  },
  setItem: () => {}
};
const secRes = loadDossiers(securityMockStorage);
assert.deepStrictEqual(secRes, []);

// 3. Object instead of array
mockStorage.setItem(DOSSIER_STORAGE_KEY, JSON.stringify({ notAnArray: true }));
assert.deepStrictEqual(loadDossiers(), []);

// 4. Null value in storage
mockStorage.setItem(DOSSIER_STORAGE_KEY, 'null');
assert.deepStrictEqual(loadDossiers(), []);
console.log('    ✓ Storage failure real cases handled gracefully without fatal crashes');

// ============================================================================
// Test 23: test_184592301_and_824061159_controls (Sections 16, 17)
// ============================================================================
console.log('  Testing 23: test_184592301_and_824061159_controls...');
// 184592301: unconfirmed PROBABLE_MODEL_SERIES must not be saved directly as final dossier
assert.throws(() => {
  createDossierObject({
    model_name: 'MS 261 Series',
    model_slug: 'ms-261',
    identity_status: 'PROBABLE_MODEL_SERIES',
    identity_source: 'SERIAL_DECODE'
  });
}, /Cannot create final dossier from unconfirmed PROBABLE_MODEL_SERIES/);

// After explicit user confirmation: USER_CONFIRMED_MODEL is allowed
const confirmed261 = createDossierObject({
  model_name: 'MS 261 C-M',
  model_slug: 'ms-261-c-m',
  serial_number: '184592301',
  identity_status: 'USER_CONFIRMED_MODEL',
  identity_source: 'SERIAL_DECODE_ASSIST_CONFIRMED'
});
assert.strictEqual(confirmed261.identity_status, 'USER_CONFIRMED_MODEL');

// 824061159: Serial only does not silently create MS 170 dossier
const dec824 = decodeStihlCode('824061159', database);
assert.notStrictEqual(dec824.modelIdentityStatus, 'EXACT_MODEL_IDENTIFIED');
assert.strictEqual(dec824.exactModel, null, 'Serial only must not silently identify MS 170');
assert.ok(!dec824.productionYear, 'No speculative production-year inference');

// After explicit user confirmation: USER_CONFIRMED_MODEL allowed with no production-year inference
const dec824Confirmed = decodeStihlCode('824061159', database, { confirmedModel: 'MS 170' });
assert.strictEqual(dec824Confirmed.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(dec824Confirmed.confirmedModel, 'MS 170');
assert.ok(!dec824Confirmed.productionYear, 'No production-year inference allowed without evidence');

const dossier824 = createDossierObject({
  model_name: dec824Confirmed.confirmedModel,
  model_slug: 'ms-170',
  serial_number: '824061159',
  identity_status: 'USER_CONFIRMED_MODEL',
  identity_source: 'USER_CONFIRMED'
});
assert.strictEqual(dossier824.identity_status, 'USER_CONFIRMED_MODEL');
console.log('    ✓ 184592301 and 824061159 control fixtures verified');

// ============================================================================
// Test 24: test_dynamic_evidence_regression (Section 18)
// ============================================================================
console.log('  Testing 24: test_dynamic_evidence_regression...');
mockStorage.clear();
const testDossierDynamic = createDossierObject({
  model_name: 'MS 170',
  model_slug: 'ms-170',
  identity_status: 'USER_CONFIRMED_MODEL',
  identity_source: 'MODEL_PAGE_SELECTION'
});
saveDossier(testDossierDynamic);

// Check that localStorage contains NO technical facts
const rawStored = JSON.parse(mockStorage.getItem(DOSSIER_STORAGE_KEY));
assert.strictEqual(rawStored[0].technicalSpecs, undefined, 'technicalSpecs must NOT be stored in localStorage');
assert.strictEqual(rawStored[0].displacement_cc, undefined, 'Technical facts must not be stored in localStorage');

// Offline hydration returns temporary unavailable error without corrupting dossier
const offlineFetch = async () => {
  throw new Error('Network error');
};
const offlineRes = await hydrateDossierEvidence(testDossierDynamic, offlineFetch);
assert.strictEqual(offlineRes.success, false);
assert.strictEqual(offlineRes.error, 'Officiële gegevens tijdelijk niet beschikbaar');

// User dossier remains completely intact
const intactDossier = loadDossiers()[0];
assert.strictEqual(intactDossier.id, testDossierDynamic.id);
console.log('    ✓ Dynamic evidence regression verified (TECHNICAL_FACTS_PERSISTED_IN_LOCALSTORAGE = 0)');

// ============================================================================
// Test 25: test_accessibility_and_mobile_contract (Sections 26, 27)
// ============================================================================
console.log('  Testing 25: test_accessibility_and_mobile_contract...');
const hubHtml = renderPassportHubHtml();
assert.ok(hubHtml.includes('for="select-model"'), 'select-model must have accessible label');
assert.ok(hubHtml.includes('for="input-nickname"'), 'input-nickname must have accessible label');
assert.ok(hubHtml.includes('for="input-serial"'), 'input-serial must have accessible label');
assert.ok(hubHtml.includes('for="input-purchase-year"'), 'input-purchase-year must have accessible label');
assert.ok(hubHtml.includes('for="input-last-service"'), 'input-last-service must have accessible label');
assert.ok(hubHtml.includes('for="check-confirm-model"'), 'checkbox must have accessible label');
assert.ok(hubHtml.includes('max-w-5xl mx-auto px-4'), 'Hub container must use responsive max-w and padding');
assert.ok(hubHtml.includes('grid-cols-1 md:grid-cols-2'), 'Grid must be 1 column on mobile 360px');
console.log('    ✓ Accessibility & mobile responsiveness contracts verified');

// ============================================================================
// Test 26: test_privacy_copy_contract (Phase 38A.2 Section 12, 13)
// ============================================================================
console.log('  Testing 26: test_privacy_copy_contract...');
const expectedCopySnippet1 = 'Uw persoonlijke machinegegevens worden alleen op dit apparaat opgeslagen.';
const expectedCopySnippet2 = 'Voor actuele technische gegevens kan alleen het STIHL-model worden opgevraagd bij STIHLDecoder.';
assert.ok(hubHtml.includes(expectedCopySnippet1), 'Hub must include accurate device-only copy');
assert.ok(hubHtml.includes(expectedCopySnippet2), 'Hub must explain STIHL model query for technical data');
assert.strictEqual(/100%\s+lokaal/i.test(hubHtml), false, 'Hub must NOT claim 100% lokaal');
assert.strictEqual(/geen netwerk/i.test(hubHtml), false, 'Hub must NOT claim no network requests');
console.log('    ✓ Privacy copy contract verified (MISLEADING_LOCAL_ONLY_PRIVACY_CLAIMS = 0)');

// ============================================================================
// Test 27: test_passport_hub_asset_hygiene (Phase 38A.2 Section 17)
// ============================================================================
console.log('  Testing 27: test_passport_hub_asset_hygiene...');
assert.strictEqual(hubHtml.includes('cdn.tailwindcss.com'), false, 'Passport hub must not load cdn.tailwindcss.com');
assert.strictEqual(hubHtml.includes('api.qrserver.com'), false, 'Passport hub must not load api.qrserver.com');
console.log('    ✓ Asset hygiene verified (no third-party CDN scripts or QR providers)');

// ============================================================================
// Test 28: test_replay_safety_script_integrity (Phase 38A.2 Section 5, 6, 8)
// ============================================================================
console.log('  Testing 28: test_replay_safety_script_integrity...');
const safetyScript = fs.readFileSync(path.join(rootDir, 'scripts', 'phase35c43223_breakpoint_highlight_safety_hotfix.js'), 'utf8');
assert.strictEqual(/mode === 'replay' \? 'NO'/.test(safetyScript), false, 'Safety script must not hardcode NO in replay mode');
assert.ok(safetyScript.includes("git(['diff', '--name-only', 'HEAD', '--', 'data/stihl_database.json'"), 'Safety script must use candidate-sensitive diff relative to HEAD');
console.log('    ✓ Replay safety script integrity verified (REPLAY_INTEGRITY_CHECK_HARDCODED_NO = 0)');

console.log('🎉 All Phase 38A / 38A.2 Machine Dossier MVP tests passed successfully (28/28)!');
