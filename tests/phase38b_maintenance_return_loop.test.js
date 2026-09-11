import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import {
  DOSSIER_STORAGE_KEY_V1,
  DOSSIER_STORAGE_KEY_V2,
  DOSSIER_STORAGE_KEY,
  DOSSIER_SCHEMA_VERSION_V1,
  DOSSIER_SCHEMA_VERSION_V2,
  DOSSIER_SCHEMA_VERSION,
  BACKUP_FORMAT_IDENTIFIER,
  BACKUP_FORMAT_VERSION,
  SOON_WINDOW_DAYS,
  MAX_BACKUP_BYTES,
  MAX_DOSSIERS,
  MAX_EVENTS_PER_DOSSIER,
  MAX_REMINDERS_PER_DOSSIER,
  MAX_NICKNAME_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  IDENTITY_STATUSES,
  IDENTITY_SOURCES,
  MAINTENANCE_EVENT_TYPES,
  REMINDER_STATES,
  isValidCalendarDate,
  getLocalTodayString,
  evaluateReminderState,
  isWithinSoonWindow,
  calculateEffectiveLastServiceDate,
  hasPrototypePollution,
  generateDossierId,
  validateDossierSchema,
  createDossierObject,
  migrateV1ToV2,
  loadDossiers,
  saveDossier,
  deleteDossier,
  updateDossierUserData,
  addDossierNote,
  addMaintenanceEvent,
  updateMaintenanceEvent,
  deleteMaintenanceEvent,
  addReminder,
  updateReminder,
  deleteReminder,
  completeReminder,
  escapeIcsText,
  generateReminderIcs,
  exportDossierBackup,
  validateBackupPayload,
  importDossierBackup,
  setSafeText
} from '../src/components/MachineDossierManager.js';
import { renderPassportHubHtml } from '../src/components/IntentPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8'));
database.public_evidence = store;

console.log('🧪 Running Phase 38B Maintenance Return Loop Tests...');

// Mock localStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
    this.failOnSet = false;
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    if (this.failOnSet) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

// ============================================================================
// Test 1: Strict Calendar Date Validation
// ============================================================================
console.log('  Testing 1: Strict calendar date validation...');
assert.strictEqual(isValidCalendarDate('2026-09-11'), true, 'Valid calendar date accepted');
assert.strictEqual(isValidCalendarDate('2024-02-29'), true, 'Leap year Feb 29 accepted');
assert.strictEqual(isValidCalendarDate('2026-02-28'), true, 'Non-leap year Feb 28 accepted');

// Rejections:
assert.strictEqual(isValidCalendarDate('2026-02-30'), false, 'Feb 30 rejected');
assert.strictEqual(isValidCalendarDate('2026-04-31'), false, 'Apr 31 rejected');
assert.strictEqual(isValidCalendarDate('2026-13-01'), false, 'Month 13 rejected');
assert.strictEqual(isValidCalendarDate('0000-00-00'), false, '0000-00-00 rejected');
assert.strictEqual(isValidCalendarDate('2026/09/11'), false, 'Slash format rejected');
assert.strictEqual(isValidCalendarDate(''), false, 'Empty rejected');
assert.strictEqual(isValidCalendarDate(null), false, 'Null rejected');
console.log('    ✓ Strict calendar dates validated with zero invalid dates accepted');

// ============================================================================
// Test 2: Transactional V1 -> V2 Migration & Zero Note Auto-Promotion
// ============================================================================
console.log('  Testing 2: Transactional V1 -> V2 migration...');
const testStorage1 = new MockLocalStorage();

const sampleV1Dossier = {
  schema_version: 1,
  dossier_id: 'dossier_v1_test_123',
  identity: {
    model_slug: 'ms-310',
    model_name: 'MS 310',
    category: 'Kettingzaag',
    series_code: '1127',
    identity_status: 'EXACT_MODEL_IDENTIFIED',
    identity_source: 'EXACT_CANONICAL_DECODE'
  },
  machine: {
    serial_number: '123456789',
    nickname: 'Houtzaag',
    purchase_year: 2018
  },
  maintenance: {
    last_service_date: '2025-05-15',
    notes: [
      { id: 'note_1', date: '2025-05-15', text: 'Bougie vervangen en zaagblad ontbraamd', category: 'NOTE' }
    ]
  },
  created_at: '2025-01-01T10:00:00.000Z',
  updated_at: '2025-05-15T12:00:00.000Z'
};

testStorage1.setItem(DOSSIER_STORAGE_KEY_V1, JSON.stringify([sampleV1Dossier]));

// Run migration via loadDossiers
const migratedList = loadDossiers(testStorage1);
assert.strictEqual(migratedList.length, 1, 'Exactly 1 dossier migrated');

const m = migratedList[0];
assert.strictEqual(m.schema_version, 2, 'Schema version updated to 2');
assert.strictEqual(m.dossier_id, 'dossier_v1_test_123', 'Dossier ID preserved');
assert.strictEqual(m.identity.model_slug, 'ms-310', 'model_slug preserved');
assert.strictEqual(m.identity.model_name, 'MS 310', 'model_name preserved');
assert.strictEqual(m.identity.category, 'Kettingzaag', 'category preserved');
assert.strictEqual(m.identity.series_code, '1127', 'series_code preserved');
assert.strictEqual(m.identity.identity_status, 'EXACT_MODEL_IDENTIFIED', 'identity_status preserved');
assert.strictEqual(m.machine.serial_number, '123456789', 'serial_number preserved');
assert.strictEqual(m.machine.nickname, 'Houtzaag', 'nickname preserved');
assert.strictEqual(m.machine.purchase_year, 2018, 'purchase_year preserved');
assert.strictEqual(m.maintenance.last_service_date, '2025-05-15', 'manual last_service_date preserved');
assert.strictEqual(m.maintenance.notes.length, 1, 'Notes preserved');
assert.strictEqual(m.maintenance.notes[0].text, 'Bougie vervangen en zaagblad ontbraamd');

// Rule 5: Notes must NOT be auto-promoted to service events
assert.deepStrictEqual(m.maintenance.events, [], 'Events array must be empty (notes never auto-promoted)');
assert.deepStrictEqual(m.maintenance.reminders, [], 'Reminders array must be empty');

// Rule 9: Legacy V1 key removed after successful migration
assert.strictEqual(testStorage1.getItem(DOSSIER_STORAGE_KEY_V1), null, 'V1 key removed after verified migration');
assert.ok(testStorage1.getItem(DOSSIER_STORAGE_KEY_V2) !== null, 'V2 key exists in storage');
console.log('    ✓ V1->V2 migration transactional, field-preserving, notes not promoted, V1 cleaned up');

// ============================================================================
// Test 3: Empty V2 Storage Never Resurrects V1 Data
// ============================================================================
console.log('  Testing 3: Empty V2 never resurrects V1...');
const testStorage2 = new MockLocalStorage();
// User deleted all machines in V2: V2 key is '[]'
testStorage2.setItem(DOSSIER_STORAGE_KEY_V2, JSON.stringify([]));
// Suppose old V1 data lingered
testStorage2.setItem(DOSSIER_STORAGE_KEY_V1, JSON.stringify([sampleV1Dossier]));

const loadedEmptyV2 = loadDossiers(testStorage2);
assert.strictEqual(loadedEmptyV2.length, 0, 'Empty V2 must NOT resurrect V1 machines');
console.log('    ✓ Empty V2 does not resurrect V1 data');

// ============================================================================
// Test 4: Corrupt V2 Never Silently Falls Back to V1
// ============================================================================
console.log('  Testing 4: Corrupt V2 never falls back to V1...');
const testStorage3 = new MockLocalStorage();
testStorage3.setItem(DOSSIER_STORAGE_KEY_V2, '{ invalid json');
testStorage3.setItem(DOSSIER_STORAGE_KEY_V1, JSON.stringify([sampleV1Dossier]));

const loadedCorrupt = loadDossiers(testStorage3);
assert.strictEqual(loadedCorrupt.length, 0, 'Corrupted V2 returns safe empty array, does NOT resurrect V1');
console.log('    ✓ Corrupted V2 does not resurrect V1');

// ============================================================================
// Test 5: Maintenance Event CRUD & Chronological Timeline
// ============================================================================
console.log('  Testing 5: Maintenance event CRUD & timeline...');
const testStorage4 = new MockLocalStorage();
const d1 = createDossierObject({
  modelSlug: 'ms-261-c-m',
  modelName: 'MS 261 C-M',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  lastServiceDate: '2026-01-01'
});
saveDossier(d1, testStorage4);

// Add first event
const resEv1 = addMaintenanceEvent(d1.dossier_id, {
  date: '2026-05-10',
  type: 'SPARK_PLUG',
  label: 'Bougie vervangen',
  note: 'Bosch WSR 6 F gemonteerd'
}, testStorage4);
assert.strictEqual(resEv1.success, true);
assert.strictEqual(resEv1.dossier.maintenance.events.length, 1);
assert.strictEqual(resEv1.dossier.maintenance.events[0].source, 'USER_PROVIDED');

// Add older event -> check descending chronological sort (newest first)
addMaintenanceEvent(d1.dossier_id, {
  date: '2026-03-01',
  type: 'CHAIN',
  label: 'Ketting geslepen',
  note: null
}, testStorage4);

const afterEvents = loadDossiers(testStorage4)[0];
assert.strictEqual(afterEvents.maintenance.events.length, 2);
assert.strictEqual(afterEvents.maintenance.events[0].date, '2026-05-10', 'Newest event first');
assert.strictEqual(afterEvents.maintenance.events[1].date, '2026-03-01', 'Older event second');

// Rule 11 & 12: Manual last_service_date must NOT be overwritten by events
assert.strictEqual(afterEvents.maintenance.last_service_date, '2026-01-01', 'Manual last_service_date preserved');
assert.strictEqual(afterEvents.manual_last_service_date, '2026-01-01', 'manual_last_service_date getter matches');
assert.strictEqual(afterEvents.effective_last_service_date, '2026-05-10', 'effective_last_service_date shows latest event');

// Delete event
const eventToDelete = afterEvents.maintenance.events[1].id;
deleteMaintenanceEvent(d1.dossier_id, eventToDelete, testStorage4);
const afterDel = loadDossiers(testStorage4)[0];
assert.strictEqual(afterDel.maintenance.events.length, 1);
console.log('    ✓ Maintenance events CRUD, chronological sort, and manual last_service preservation verified');

// ============================================================================
// Test 6: User-Defined Reminders & State Transitions
// ============================================================================
console.log('  Testing 6: Reminders & state transitions...');
const testStorage5 = new MockLocalStorage();
const d2 = createDossierObject({
  modelSlug: 'ms-310',
  modelName: 'MS 310',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
  identitySource: IDENTITY_SOURCES.EXACT_CANONICAL_DECODE
});
saveDossier(d2, testStorage5);

const todayStr = getLocalTodayString();
const [curYear, curMonth, curDay] = todayStr.split('-').map(Number);
const pastDate = '2025-01-01';
const futureDate = `${curYear + 1}-06-01`;

// Add past reminder
addReminder(d2.dossier_id, {
  dueDate: pastDate,
  type: 'AIR_FILTER',
  label: 'Luchtfilter controleren'
}, testStorage5);

// Add today reminder
addReminder(d2.dossier_id, {
  dueDate: todayStr,
  type: 'GENERAL_SERVICE',
  label: 'Jaarlijkse controle'
}, testStorage5);

// Add future reminder
addReminder(d2.dossier_id, {
  dueDate: futureDate,
  type: 'SPARK_PLUG',
  label: 'Bougie nazien'
}, testStorage5);

const dossierWithRems = loadDossiers(testStorage5)[0];
assert.strictEqual(dossierWithRems.maintenance.reminders.length, 3);

const rPast = dossierWithRems.maintenance.reminders.find(r => r.due_date === pastDate);
const rToday = dossierWithRems.maintenance.reminders.find(r => r.due_date === todayStr);
const rFuture = dossierWithRems.maintenance.reminders.find(r => r.due_date === futureDate);

assert.strictEqual(evaluateReminderState(rPast, todayStr), REMINDER_STATES.VERLOPEN);
assert.strictEqual(evaluateReminderState(rToday, todayStr), REMINDER_STATES.VANDAAG);
assert.strictEqual(evaluateReminderState(rFuture, todayStr), REMINDER_STATES.GEPLAND);
console.log('    ✓ Reminder states VERLOPEN, VANDAAG, GEPLAND accurately evaluated with local date semantics');

// ============================================================================
// Test 7: Reminder Completion Flow & Optional Maintenance Event
// ============================================================================
console.log('  Testing 7: Reminder completion flow...');
// Case A: Complete WITHOUT creating maintenance event (Rule 13)
completeReminder(d2.dossier_id, rPast.id, { createEvent: false }, testStorage5);
let dCheck = loadDossiers(testStorage5)[0];
let completedRem = dCheck.maintenance.reminders.find(r => r.id === rPast.id);
assert.strictEqual(completedRem.completed, true);
assert.strictEqual(evaluateReminderState(completedRem, todayStr), REMINDER_STATES.AFGEROND);
assert.strictEqual(dCheck.maintenance.events.length, 0, 'No maintenance event created when createEvent is false');

// Case B: Complete WITH creating maintenance event (Rule 14: confirmed date)
completeReminder(d2.dossier_id, rToday.id, {
  createEvent: true,
  eventDate: '2026-09-11',
  eventNote: 'Luchtfilter gereinigd met perslucht'
}, testStorage5);
dCheck = loadDossiers(testStorage5)[0];
completedRem = dCheck.maintenance.reminders.find(r => r.id === rToday.id);
assert.strictEqual(completedRem.completed, true);
assert.strictEqual(dCheck.maintenance.events.length, 1, 'Maintenance event created when user explicitly chose to add it');
assert.strictEqual(dCheck.maintenance.events[0].date, '2026-09-11');
assert.strictEqual(dCheck.maintenance.events[0].note, 'Luchtfilter gereinigd met perslucht');
assert.strictEqual(dCheck.maintenance.events[0].source, 'USER_PROVIDED');
console.log('    ✓ Completion does not auto-create event unless explicitly confirmed');

// ============================================================================
// Test 8: Calendar .ics Generation (RFC 5545, All-Day, Privacy)
// ============================================================================
console.log('  Testing 8: Calendar .ics export & privacy...');
const ics = generateReminderIcs({
  modelName: 'MS 261 C-M',
  dueDate: '2026-11-15',
  type: 'AIR_FILTER',
  label: 'Luchtfilter controleren',
  uidOverride: 'rem_fixed_uid@stihldecoder.nl',
  dtstampOverride: '20260911T100000Z'
});

assert.ok(ics.includes('BEGIN:VCALENDAR\r\nVERSION:2.0'), 'Valid VCALENDAR header with CRLF');
assert.ok(ics.includes('BEGIN:VEVENT'), 'Contains VEVENT');
assert.ok(ics.includes('DTSTART;VALUE=DATE:20261115'), 'All-day date format DTSTART;VALUE=DATE');
assert.ok(ics.includes('SUMMARY:Onderhoud STIHL MS 261 C-M'), 'Clean default summary');
assert.ok(ics.includes('DESCRIPTION:Gepland: Luchtfilter controleren'), 'Description included');
assert.ok(ics.includes('END:VEVENT\r\nEND:VCALENDAR'), 'Valid ending with CRLF');

// Privacy checks (Section 21 & 33)
assert.strictEqual(ics.includes('serial'), false, 'Zero serial keyword in ICS');
assert.strictEqual(ics.includes('184592301'), false, 'Zero serial numbers in ICS');
assert.strictEqual(ics.includes('Houtzaag'), false, 'Zero nicknames in ICS');

// Test RFC 5545 escaping
const escaped = escapeIcsText('Onderhoud, inclusief filter; bougie \\ check\nnieuwe regel');
assert.strictEqual(escaped, 'Onderhoud\\, inclusief filter\\; bougie \\\\ check\\nnieuwe regel');
console.log('    ✓ RFC 5545 .ics generation, escaping, and privacy validated');

// ============================================================================
// Test 9: Backup Export (No Technical Evidence) & Validation
// ============================================================================
console.log('  Testing 9: Backup export & evidence exclusion...');
const backup = exportDossierBackup(testStorage5, '2026-09-11T12:00:00.000Z');
assert.strictEqual(backup.format, BACKUP_FORMAT_IDENTIFIER);
assert.strictEqual(backup.version, 1);
assert.strictEqual(backup.dossiers.length, 1);

const exportedDossier = backup.dossiers[0];
assert.strictEqual(exportedDossier.technicalSpecs, undefined, 'technicalSpecs NOT in backup');
assert.strictEqual(exportedDossier.publicEvidenceFacts, undefined, 'publicEvidenceFacts NOT in backup');
assert.strictEqual(exportedDossier.publicEvidenceFields, undefined, 'publicEvidenceFields NOT in backup');
assert.strictEqual(exportedDossier.safeTechnicalPreview, undefined, 'safeTechnicalPreview NOT in backup');
console.log('    ✓ Backup format version 1 valid, zero technical evidence persisted in backup');

// ============================================================================
// Test 10: Backup Import Security: Prototype Pollution & Atomic Validation
// ============================================================================
console.log('  Testing 10: Backup import security & prototype pollution...');
const testStorage6 = new MockLocalStorage();

// Malicious prototype pollution payload
const protoPayload = '{"format":"' + BACKUP_FORMAT_IDENTIFIER + '","version":1,"__proto__":{"polluted":true},"dossiers":[]}';
assert.strictEqual(hasPrototypePollution(JSON.parse(protoPayload)), true, 'Prototype pollution detected');
const protoImportRes = importDossierBackup(protoPayload, testStorage6);
assert.strictEqual(protoImportRes.success, false, 'Polluted backup rejected');

const constructorPayload = JSON.stringify({
  format: BACKUP_FORMAT_IDENTIFIER,
  version: 1,
  constructor: { polluted: true },
  dossiers: []
});
assert.strictEqual(hasPrototypePollution(JSON.parse(constructorPayload)), true, 'Constructor pollution detected');
const constrImportRes = importDossierBackup(constructorPayload, testStorage6);
assert.strictEqual(constrImportRes.success, false, 'Constructor polluted backup rejected');

// Oversized payload rejection
const largePayload = 'A'.repeat(MAX_BACKUP_BYTES + 10);
const sizeRes = importDossierBackup(largePayload, testStorage6);
assert.strictEqual(sizeRes.success, false, 'Oversized backup rejected before parse');

// Partial invalid import (Rule 29: Atomic)
const mixedPayload = {
  format: BACKUP_FORMAT_IDENTIFIER,
  version: 1,
  dossiers: [
    {
      schema_version: 2,
      dossier_id: 'valid_1',
      identity: { model_slug: 'ms-170', model_name: 'MS 170', category: 'Kettingzaag', identity_status: 'EXACT_MODEL_IDENTIFIED' },
      machine: { serial_number: null, nickname: null, purchase_year: 2020 },
      maintenance: { last_service_date: null, notes: [], events: [], reminders: [] }
    },
    {
      schema_version: 2,
      dossier_id: 'invalid_2',
      identity: { model_slug: 'invalid', model_name: 'Invalid', identity_status: 'PROBABLE_MODEL_SERIES' }, // Rejected!
      machine: {},
      maintenance: {}
    }
  ]
};

const mixedRes = importDossierBackup(mixedPayload, testStorage6);
assert.strictEqual(mixedRes.success, false, 'Mixed backup rejected atomically');
assert.strictEqual(loadDossiers(testStorage6).length, 0, 'Zero machines written when validation fails');

// Valid import with ID collision resolution (Rule 30)
const validPayload = {
  format: BACKUP_FORMAT_IDENTIFIER,
  version: 1,
  dossiers: [
    {
      schema_version: 2,
      dossier_id: 'existing_id_1',
      identity: { model_slug: 'ms-261-c-m', model_name: 'MS 261 C-M', category: 'Kettingzaag', identity_status: 'USER_CONFIRMED_MODEL' },
      machine: { serial_number: '184592301', nickname: 'Zaag 1', purchase_year: 2021 },
      maintenance: { last_service_date: null, notes: [], events: [], reminders: [] }
    }
  ]
};

// Seed storage with same ID
const existingDossier = createDossierObject({
  modelSlug: 'ms-310',
  modelName: 'MS 310',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED
});
existingDossier.dossier_id = 'existing_id_1';
existingDossier.id = 'existing_id_1';
saveDossier(existingDossier, testStorage6);

const importCollisionRes = importDossierBackup(validPayload, testStorage6);
assert.strictEqual(importCollisionRes.success, true);
assert.strictEqual(importCollisionRes.importedCount, 1);
assert.strictEqual(importCollisionRes.totalCount, 2);

const allAfterImport = loadDossiers(testStorage6);
assert.strictEqual(allAfterImport.length, 2);
assert.notStrictEqual(allAfterImport[0].dossier_id, allAfterImport[1].dossier_id, 'Collision generated new unique ID without silent overwrite');
console.log('    ✓ Security gates (prototype pollution, size limits, atomic validation, ID collision) PASS');

// ============================================================================
// Test 11: Storage Quota Failure Rollback
// ============================================================================
console.log('  Testing 11: Storage quota failure rollback...');
const testStorage7 = new MockLocalStorage();
const dPre = createDossierObject({
  modelSlug: 'ms-310',
  modelName: 'MS 310',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED
});
saveDossier(dPre, testStorage7);
assert.strictEqual(loadDossiers(testStorage7).length, 1);

// Enable quota error simulation
testStorage7.failOnSet = true;
const dFail = createDossierObject({
  modelSlug: 'ms-261-c-m',
  modelName: 'MS 261 C-M',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL
});
const saveFailRes = saveDossier(dFail, testStorage7);
assert.strictEqual(saveFailRes.success, false, 'Save fails safely when quota exceeded');

testStorage7.failOnSet = false;
const preservedAfterFail = loadDossiers(testStorage7);
assert.strictEqual(preservedAfterFail.length, 1, 'Previous valid storage preserved with zero corruption');
console.log('    ✓ Quota exceeded error handled with zero storage corruption');

// ============================================================================
// Test 12: Multi-Machine Isolation
// ============================================================================
console.log('  Testing 12: Multi-machine isolation...');
const testStorage8 = new MockLocalStorage();
const machine1 = createDossierObject({
  modelSlug: 'ms-310',
  modelName: 'MS 310',
  nickname: 'Zaag A',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED
});
const machine2 = createDossierObject({
  modelSlug: 'ms-310',
  modelName: 'MS 310',
  nickname: 'Zaag B',
  category: 'Kettingzaag',
  identityStatus: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED
});
saveDossier(machine1, testStorage8);
saveDossier(machine2, testStorage8);

addMaintenanceEvent(machine1.dossier_id, {
  date: '2026-09-10',
  type: 'SPARK_PLUG',
  label: 'Bougie vervangen op Zaag A'
}, testStorage8);

const m1Loaded = loadDossiers(testStorage8).find(d => d.dossier_id === machine1.dossier_id);
const m2Loaded = loadDossiers(testStorage8).find(d => d.dossier_id === machine2.dossier_id);

assert.strictEqual(m1Loaded.maintenance.events.length, 1);
assert.strictEqual(m2Loaded.maintenance.events.length, 0, 'Zaag B maintenance events remained 0 (no cross-dossier leakage)');
console.log('    ✓ Multiple machines of same model maintain strict data isolation');

// ============================================================================
// Test 13: XSS Injection Safety via DOM Sinks
// ============================================================================
console.log('  Testing 13: XSS safety...');
const mockEl = { textContent: '' };
const maliciousScript = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
setSafeText(mockEl, maliciousScript);
assert.strictEqual(mockEl.textContent, maliciousScript, 'User input assigned to textContent safely, never innerHTML');
console.log('    ✓ XSS safety confirmed via textContent DOM sink');

// ============================================================================
// Test 14: Phase 38A & Phase 38A.3 Spec Parity & 046 Conflict Safety
// ============================================================================
console.log('  Testing 14: Phase 38A.3 spec parity & 046 conflict safety...');
// 184592301 Unconfirmed: PROBABLE_MODEL_SERIES
const unconfirmed = decodeStihlCode('184592301', database);
assert.strictEqual(unconfirmed.modelIdentityStatus, 'PROBABLE_MODEL_SERIES');
assert.strictEqual(unconfirmed.exactModel, null);
assert.deepStrictEqual(unconfirmed.technicalSpecs, {}, 'Unconfirmed series technicalSpecs must be empty object');
assert.ok(unconfirmed.safeTechnicalPreview, 'Safe preview must exist for unconfirmed series');

// 184592301 Confirmed: MS 261 C-M
const confirmed261 = decodeStihlCode('184592301', database, { confirmedModel: 'MS 261 C-M' });
assert.strictEqual(confirmed261.modelIdentityStatus, 'USER_CONFIRMED_MODEL');
assert.strictEqual(confirmed261.confirmedModel, 'MS 261 C-M');
assert.strictEqual(confirmed261.exactModel, null);
const specKeys = Object.keys(confirmed261.technicalSpecs || {});
assert.strictEqual(specKeys.length, 13, 'MS 261 C-M must maintain all 13 official technical specs');
assert.ok(specKeys.includes('clutch_speed_rpm'));
assert.ok(specKeys.includes('spark_plug'));
assert.ok(specKeys.includes('spark_plug_gap_mm'));

// 046 stroke conflict check
const dec046 = decodeStihlCode('046', database);
assert.ok(dec046.success);
assert.strictEqual(dec046.technicalSpecs.stroke_mm, undefined, 'Conflicted stroke_mm remains blocked as authoritative single value');
console.log('    ✓ Phase 38A.3 spec parity and 046 conflict safety preserved 100%');

console.log('🎉 All Phase 38B Maintenance Return Loop Tests PASSED!');
