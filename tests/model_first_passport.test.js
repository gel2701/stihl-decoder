import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DOSSIER_STORAGE_KEY_V2,
  DOSSIER_SCHEMA_VERSION_V2,
  IDENTITY_STATUSES,
  IDENTITY_SOURCES,
  createDossierObject,
  loadDossiers,
  saveDossier,
  validateDossierSchema,
  migrateV1ToV2
} from '../src/components/MachineDossierManager.js';
import {
  buildPassportViewModel,
  renderStihlPassportHtml
} from '../src/components/StihlPassportGenerator.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

console.log('===============================================================');
console.log('🧪 RUNNING MODEL-FIRST STIHL PASSPORT SUITE');
console.log('===============================================================\n');

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

// ============================================================================
// Test A: Storing MS 440 without serial number works (serial_number === null)
// ============================================================================
console.log('▶ Test A: Creating and saving MS 440 without serial number...');
const ms440Dossier = createDossierObject({
  modelSlug: 'ms-440',
  modelName: 'MS 440',
  category: 'Kettingzaag',
  seriesCode: '1128',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null,
  nickname: 'Zware velzaag',
  purchaseYear: 2005
});

assert.strictEqual(ms440Dossier.machine.serial_number, null, 'serial_number must be null');
assert.strictEqual(ms440Dossier.serial_number, null, 'convenience alias serial_number must be null');
assert.strictEqual(ms440Dossier.identity.identity_status, IDENTITY_STATUSES.USER_CONFIRMED_MODEL);

const saveRes = saveDossier(ms440Dossier, mockStorage);
assert.strictEqual(saveRes.success, true, 'saveDossier must succeed');
const loaded = loadDossiers(mockStorage);
assert.strictEqual(loaded.length, 1);
assert.strictEqual(loaded[0].machine.serial_number, null);
console.log('  ✅ Test A Passed: Storing without serial number saved cleanly.\n');

// ============================================================================
// Test B: Schema validation accepts null serial number
// ============================================================================
console.log('▶ Test B: validateDossierSchema accepts null serial_number...');
assert.strictEqual(validateDossierSchema(ms440Dossier, DOSSIER_SCHEMA_VERSION_V2), true);

const invalidDossier = { ...ms440Dossier, machine: { ...ms440Dossier.machine, serial_number: 123456789 } }; // number instead of string/null
assert.strictEqual(validateDossierSchema(invalidDossier, DOSSIER_SCHEMA_VERSION_V2), false, 'Number serial should be rejected');
console.log('  ✅ Test B Passed: Schema validator allows null and rejects malformed values.\n');

// ============================================================================
// Test C: Passport ViewModel and HTML for model-only dossier
// ============================================================================
console.log('▶ Test C: Passport ViewModel & HTML for MODEL_ONLY mode...');
const viewModel = buildPassportViewModel(ms440Dossier, database);

assert.strictEqual(viewModel.hasSerial, false, 'hasSerial must be false');
assert.strictEqual(viewModel.passportMode, 'MODEL_ONLY', 'passportMode must be MODEL_ONLY');
assert.strictEqual(viewModel.formattedSerial, 'Nog niet toegevoegd', 'formattedSerial should be user-friendly placeholder');
assert.strictEqual(viewModel.country, 'Nog niet gekoppeld (geen serienummer)', 'Country must indicate no serial');
assert(viewModel.years.includes('2005') && viewModel.years.includes('Door gebruiker opgegeven'), 'Years must indicate user purchase year');
assert(!viewModel.years.includes('Productieperiode'), 'Years must NOT derive production range from serial');

const noYearDossier = { ...ms440Dossier, purchase_year: null, machine: { ...ms440Dossier.machine, purchase_year: null } };
const noYearVm = buildPassportViewModel(noYearDossier, database);
assert.strictEqual(noYearVm.years, 'Niet opgegeven', 'When purchase year is absent, years must be Niet opgegeven');
assert.strictEqual(viewModel.theftCheck.status, 'INACTIVE', 'StopHeling must be inactive');
assert.strictEqual(viewModel.qrUrl.includes('?s='), false, 'QR URL must NOT include ?s=');
assert.strictEqual(viewModel.qrUrl.includes('null'), false, 'QR URL must NOT include null');
assert.strictEqual(viewModel.publicUrl, 'https://www.stihldecoder.nl/kettingzagen/ms-440/');

const passportHtml = renderStihlPassportHtml(ms440Dossier, database);
assert(passportHtml.includes('STIHL Machinepaspoort'), 'Title must be STIHL Machinepaspoort');
assert(passportHtml.includes('MS 440'), 'Must contain MS 440');
assert(passportHtml.includes('Nog niet toegevoegd'), 'Must display Nog niet toegevoegd');
assert(!passportHtml.includes('Stop Heling Status'), 'Must NOT render Stop Heling block when serial is absent');
assert(!passportHtml.includes('?s='), 'Passport HTML must not contain ?s=');
console.log('  ✅ Test C Passed: Passport correctly adapts to MODEL_ONLY mode.\n');

// ============================================================================
// Test D: Migration V1 to V2 preserves existing dossiers
// ============================================================================
console.log('▶ Test D: V1 to V2 transactional migration...');
const v1Storage = new MockLocalStorage();
const legacyV1List = [
  {
    schema_version: 1,
    dossier_id: 'dossier_v1_001',
    identity: {
      model_slug: 'ms-260',
      model_name: 'MS 260',
      category: 'Kettingzaag',
      identity_status: 'EXACT_MODEL_IDENTIFIED',
      identity_source: 'CANONICAL_DATABASE'
    },
    machine: {
      serial_number: '163000000',
      nickname: 'Old Saw'
    },
    maintenance: {
      notes: []
    },
    created_at: '2025-01-01T00:00:00.000Z'
  }
];
v1Storage.setItem('stihl_machine_dossiers_v1', JSON.stringify(legacyV1List));

const migRes = migrateV1ToV2(v1Storage);
assert.strictEqual(migRes.success, true);
assert.strictEqual(migRes.migrated, true);

const migratedList = loadDossiers(v1Storage);
assert.strictEqual(migratedList.length, 1);
assert.strictEqual(migratedList[0].dossier_id, 'dossier_v1_001');
assert.strictEqual(migratedList[0].schema_version, DOSSIER_SCHEMA_VERSION_V2);
assert.strictEqual(migratedList[0].machine.serial_number, '163000000');
console.log('  ✅ Test D Passed: V1->V2 migration is safe and lossless.\n');

// ============================================================================
// Test E: Model Page CTA references /stihl-paspoort/#add=${slug}
// ============================================================================
console.log('▶ Test E: ModelPageTemplate CTA verification...');
const ms440ModelObj = database.models.find(m => m.slug === 'ms-440' || m.id === 'stihl_ms_440');
assert(ms440ModelObj, 'MS 440 model must exist in database');

const pageHtml = renderModelPageHtml(ms440ModelObj, database, 'https://stihldecoder.nl');
assert(pageHtml.includes('Heb je deze machine? Voeg hem toe aan Mijn STIHL'), 'Must contain new CTA headline');
assert(pageHtml.includes('Bewaar je machinegegevens, onderhoud en serienummer in je eigen STIHL Machinepaspoort.'), 'Must contain new CTA text');
assert(pageHtml.includes('/stihl-paspoort/#add=ms-440'), 'CTA must link to /stihl-paspoort/#add=ms-440');
console.log('  ✅ Test E Passed: ModelPageTemplate CTA is model-first and links correctly.\n');

console.log('🎉 ALL MODEL-FIRST STIHL PASSPORT TESTS PASSED 100% CLEANLY!');
