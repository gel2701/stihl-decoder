import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  IDENTITY_STATUSES,
  IDENTITY_SOURCES,
  createDossierObject,
  loadDossiers,
  saveDossier,
  addDossierNote,
  addMaintenanceEvent,
  addReminder,
  enrichDossierWithSerial,
  resolveDossierConflict
} from '../src/components/MachineDossierManager.js';
import {
  buildPassportViewModel,
  renderStihlPassportHtml
} from '../src/components/StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

console.log('===============================================================');
console.log('🧪 RUNNING STIHL PASSPORT SERIAL ENRICHMENT SUITE');
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
// Test H: Official Anchor Enrichment on Matching Model (MS 440 + 163118080)
// ============================================================================
console.log('▶ Test H: Enriching model-only MS 440 dossier with official anchor 163118080...');
const ms440Dossier = createDossierObject({
  modelSlug: 'ms-440',
  modelName: 'MS 440',
  category: 'Kettingzaag',
  seriesCode: '1128',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(ms440Dossier, mockStorage);

const enrichRes = enrichDossierWithSerial(ms440Dossier.dossier_id, '163118080', database, {}, mockStorage);
assert.strictEqual(enrichRes.success, true, 'Enrichment must succeed');
assert.strictEqual(enrichRes.status, 'ENRICHED_OFFICIAL', 'Status must be ENRICHED_OFFICIAL');

const enrichedDossier = loadDossiers(mockStorage).find(d => d.dossier_id === ms440Dossier.dossier_id);
assert.strictEqual(enrichedDossier.machine.serial_number, '163118080');
assert.strictEqual(enrichedDossier.identity.identity_status, IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED);
assert.strictEqual(enrichedDossier.identity.identity_source, 'OFFICIAL_STIHL_LOOKUP');
assert.strictEqual(enrichedDossier.identity.official_product_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
assert.strictEqual(enrichedDossier.identity.verified_at, '2026-09-22');
assert.strictEqual(enrichedDossier.identity.canonical_model_id, 'stihl_ms_440');
assert.strictEqual(enrichedDossier.identity.conflict, null, 'Must have zero conflict');

// Check Passport rendering of enriched official machine
const vm = buildPassportViewModel(enrichedDossier, database);
assert.strictEqual(vm.passportMode, 'OFFICIAL_SERIAL_VERIFIED');
assert.strictEqual(vm.hasSerial, true);
assert.strictEqual(vm.officialProductName, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
assert.strictEqual(vm.formattedSerial, '1 631 180 80');
assert(vm.country.includes('Duitsland'), 'Waiblingen / Duitsland factory code 1');

const html = renderStihlPassportHtml(enrichedDossier, database);
assert(html.includes('MS 440-Z 3/8&quot; RIM Magnum Motorsäge') || html.includes('MS 440-Z 3/8" RIM Magnum Motorsäge'));
assert(html.includes('1 631 180 80'));
assert(!html.includes('MS 260'), 'Must have zero MS 260 contamination');
console.log('  ✅ Test H Passed: Official anchor 163118080 enriches MS 440 with official variant and verified date.\n');

// ============================================================================
// Test I: Official Anchor Conflict Detection (Stored MS 260 + 163118080)
// ============================================================================
console.log('▶ Test I: Official Anchor Conflict Detection (MS 260 + 163118080)...');
const ms260Dossier = createDossierObject({
  modelSlug: 'ms-260',
  modelName: 'MS 260',
  category: 'Kettingzaag',
  seriesCode: '1121',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(ms260Dossier, mockStorage);

const conflictRes = enrichDossierWithSerial(ms260Dossier.dossier_id, '163118080', database, {}, mockStorage);
assert.strictEqual(conflictRes.success, false, 'Conflict must return success: false');
assert.strictEqual(conflictRes.status, 'IDENTITY_CONFLICT', 'Status must be IDENTITY_CONFLICT');
assert.strictEqual(conflictRes.storedModel, 'MS 260');
assert.strictEqual(conflictRes.officialModel, 'MS 440-Z 3/8" RIM Magnum Motorsäge');

// Verify stored dossier was NOT silently overwritten!
const storedAfterConflict = loadDossiers(mockStorage).find(d => d.dossier_id === ms260Dossier.dossier_id);
assert.strictEqual(storedAfterConflict.identity.model_slug, 'ms-260', 'Model slug MUST remain ms-260');
assert.strictEqual(storedAfterConflict.identity.model_name, 'MS 260', 'Model name MUST remain MS 260');
assert.strictEqual(storedAfterConflict.identity.conflict.has_conflict, true);
assert.strictEqual(storedAfterConflict.identity.conflict.official_model_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
assert.strictEqual(storedAfterConflict.identity.conflict.official_canonical_id, 'stihl_ms_440');
console.log('  ✅ Test I Passed: Conflict detected; zero silent overwrite on stored MS 260.\n');

// ============================================================================
// Test J: Resolving Conflict with KEEP_STORED
// ============================================================================
console.log('▶ Test J: Resolving conflict with KEEP_STORED...');
const keepRes = resolveDossierConflict(ms260Dossier.dossier_id, 'KEEP_STORED', mockStorage);
assert.strictEqual(keepRes.success, true);

const keptDossier = loadDossiers(mockStorage).find(d => d.dossier_id === ms260Dossier.dossier_id);
assert.strictEqual(keptDossier.identity.model_name, 'MS 260');
assert.strictEqual(keptDossier.identity.conflict, null, 'Conflict should be cleared');
assert.strictEqual(keptDossier.machine.serial_number, null, 'Conflicting serial should not be attached');
console.log('  ✅ Test J Passed: KEEP_STORED preserves user model and drops conflicting serial.\n');

// ============================================================================
// Test K: Resolving Conflict with SWITCH_TO_OFFICIAL
// ============================================================================
console.log('▶ Test K: Resolving conflict with SWITCH_TO_OFFICIAL...');
// Re-trigger conflict on a new dossier
const ms260Dossier2 = createDossierObject({
  modelSlug: 'ms-260',
  modelName: 'MS 260',
  category: 'Kettingzaag',
  seriesCode: '1121',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(ms260Dossier2, mockStorage);
enrichDossierWithSerial(ms260Dossier2.dossier_id, '163118080', database, {}, mockStorage);

const switchRes = resolveDossierConflict(ms260Dossier2.dossier_id, 'SWITCH_TO_OFFICIAL', mockStorage);
assert.strictEqual(switchRes.success, true);

const switchedDossier = loadDossiers(mockStorage).find(d => d.dossier_id === ms260Dossier2.dossier_id);
assert.strictEqual(switchedDossier.identity.model_slug, 'ms-440');
assert.strictEqual(switchedDossier.identity.model_name, 'MS 440', 'model_name must remain canonical model name');
assert.strictEqual(switchedDossier.identity.canonical_model_id, 'stihl_ms_440');
assert.strictEqual(switchedDossier.identity.official_product_name, 'MS 440-Z 3/8" RIM Magnum Motorsäge');
assert.strictEqual(switchedDossier.identity.verified_at, '2026-09-22');
assert.strictEqual(switchedDossier.machine.serial_number, '163118080');
assert.strictEqual(switchedDossier.identity.conflict, null);
console.log('  ✅ Test K Passed: SWITCH_TO_OFFICIAL cleanly upgrades to official MS 440 identity.\n');

// ============================================================================
// Test L: Unknown serial in historical range (160500000) does NOT overwrite model
// ============================================================================
console.log('▶ Test L: Historical range serial 160500000 does NOT overwrite stored model...');
const ms361Dossier = createDossierObject({
  modelSlug: 'ms-361',
  modelName: 'MS 361',
  category: 'Kettingzaag',
  seriesCode: '1135',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(ms361Dossier, mockStorage);

const rangeEnrichRes = enrichDossierWithSerial(ms361Dossier.dossier_id, '160500000', database, {}, mockStorage);
assert.strictEqual(rangeEnrichRes.success, true);
assert.strictEqual(rangeEnrichRes.status, 'ENRICHED_SERIAL');

const rangeDossier = loadDossiers(mockStorage).find(d => d.dossier_id === ms361Dossier.dossier_id);
assert.strictEqual(rangeDossier.identity.model_slug, 'ms-361', 'Model must remain MS 361');
assert.strictEqual(rangeDossier.identity.model_name, 'MS 361', 'Model name must remain MS 361');
assert.strictEqual(rangeDossier.machine.serial_number, '160500000');
assert.strictEqual(rangeDossier.machine.factory_country, 'Duitsland');
assert.strictEqual(rangeDossier.identity.conflict, null);
console.log('  ✅ Test L Passed: Historical range adds factory provenance without changing model.\n');

// ============================================================================
// Test M: Non-destructive: Notes, Events & Reminders Preserved Through Enrichment
// ============================================================================
console.log('▶ Test M: Non-destructive enrichment preserves maintenance history and notes...');
const testDossier = createDossierObject({
  modelSlug: 'ms-440',
  modelName: 'MS 440',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(testDossier, mockStorage);

addDossierNote(testDossier.dossier_id, 'Zaagblad 50cm gemonteerd', '2026-01-10', mockStorage);
addMaintenanceEvent(testDossier.dossier_id, {
  date: '2026-02-01',
  type: 'SPARK_PLUG',
  label: 'Nieuwe bougie gemonteerd',
  note: 'Bosch WSR6F'
}, mockStorage);
addReminder(testDossier.dossier_id, {
  dueDate: '2026-10-01',
  type: 'AIR_FILTER',
  label: 'Luchtfilter reinigen'
}, mockStorage);

enrichDossierWithSerial(testDossier.dossier_id, '163118080', database, {}, mockStorage);

const enrichedWithHistory = loadDossiers(mockStorage).find(d => d.dossier_id === testDossier.dossier_id);
assert.strictEqual(enrichedWithHistory.maintenance.notes.length, 1);
assert.strictEqual(enrichedWithHistory.maintenance.notes[0].text, 'Zaagblad 50cm gemonteerd');
assert.strictEqual(enrichedWithHistory.maintenance.events.length, 1);
assert.strictEqual(enrichedWithHistory.maintenance.events[0].label, 'Nieuwe bougie gemonteerd');
assert.strictEqual(enrichedWithHistory.maintenance.reminders.length, 1);
assert.strictEqual(enrichedWithHistory.maintenance.reminders[0].label, 'Luchtfilter reinigen');
console.log('  ✅ Test M Passed: All notes, events, and reminders safely preserved.\n');

console.log('🎉 ALL PASSPORT SERIAL ENRICHMENT TESTS PASSED 100% CLEANLY!');
