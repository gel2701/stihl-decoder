import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  buildPassportViewModel,
  renderStihlPassportHtml
} from '../src/components/StihlPassportGenerator.js';

import {
  createDossierObject,
  saveDossier,
  loadDossiers,
  enrichDossierWithSerial,
  resolveDossierConflict,
  IDENTITY_STATUSES,
  IDENTITY_SOURCES
} from '../src/components/MachineDossierManager.js';

import {
  buildModelRecommendations,
  COMPATIBILITY_STATUSES,
  RECOMMENDATION_TYPES
} from '../src/modelRecommendations.js';

import {
  logStihlEvent,
  EVENT_TYPES
} from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// In-memory mock storage for testing
function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 47A PRE-PROMOTION HARDENING TEST SUITE');
console.log('===============================================================\n');

// ============================================================================
// Gate 1: QR Privacy — Zero Serial Numbers in External QR Requests
// ============================================================================
console.log('▶ Gate 1: QR Privacy verification across all passport modes...');

// 1.1 Model-Only Mode
const vmModelOnly = buildPassportViewModel({
  model: 'MS 440',
  model_slug: 'ms-440',
  category: 'Kettingzaag',
  serialNumber: null
}, database);
assert.strictEqual(vmModelOnly.passportMode, 'MODEL_ONLY');
assert.strictEqual(vmModelOnly.hasSerial, false);
assert(!vmModelOnly.qrUrl.includes('?s='), 'Model-only QR URL must not include ?s=');
assert(!vmModelOnly.qrUrl.includes('null'), 'Model-only QR URL must not include "null"');
assert(vmModelOnly.qrUrl.includes(encodeURIComponent('https://www.stihldecoder.nl/kettingzagen/ms-440/')));

// 1.2 Model-With-Serial Mode
const vmWithSerial = buildPassportViewModel({
  model: 'MS 440',
  model_slug: 'ms-440',
  category: 'Kettingzaag',
  serialNumber: '160500000'
}, database);
assert.strictEqual(vmWithSerial.passportMode, 'MODEL_WITH_SERIAL');
assert.strictEqual(vmWithSerial.hasSerial, true);
assert(!vmWithSerial.qrUrl.includes('160500000'), 'QR URL must NEVER include serial number!');
assert(!vmWithSerial.qrUrl.includes('?s='), 'QR URL must not include serial query');
assert(vmWithSerial.qrUrl.includes(encodeURIComponent('https://www.stihldecoder.nl/kettingzagen/ms-440/')));

// 1.3 Official-Verified Mode (163118080)
const vmOfficial = buildPassportViewModel({
  model: 'MS 440',
  model_slug: 'ms-440',
  category: 'Kettingzaag',
  serialNumber: '163118080',
  officialAnchor: {
    officialProductName: 'MS 440-Z 3/8" RIM Magnum Motorsäge',
    canonicalModelId: 'stihl_ms_440',
    verifiedAt: '2026-09-22',
    source: 'MY_STIHL'
  }
}, database);
assert.strictEqual(vmOfficial.passportMode, 'OFFICIAL_SERIAL_VERIFIED');
assert.strictEqual(vmOfficial.hasSerial, true);
assert(!vmOfficial.qrUrl.includes('163118080'), 'QR URL must NEVER include official serial number 163118080!');
assert(!vmOfficial.qrUrl.includes('?s='), 'QR URL must not include serial query');
assert(vmOfficial.qrUrl.includes(encodeURIComponent('https://www.stihldecoder.nl/kettingzagen/ms-440/')));

// 1.4 HTML Output Verification
const htmlOfficial = renderStihlPassportHtml(vmOfficial);
// Find img src matching qrserver
const qrMatch = htmlOfficial.match(/https:\/\/api\.qrserver\.com\/[^\s"']+/);
assert.ok(qrMatch, 'Must contain api.qrserver.com link');
assert(!qrMatch[0].includes('163118080'), 'External QR service request must NEVER receive serial 163118080!');
console.log('  ✅ Gate 1 Passed: Zero serial data sent to external QR service in all modes.\n');

// ============================================================================
// Gate 2: JS / TSX Parity & Zero Fake Demonstration Data
// ============================================================================
console.log('▶ Gate 2: JS / TSX Parity and clean demonstration values...');
const tsxPath = path.join(rootDir, 'src', 'components', 'StihlPassportGenerator.tsx');
const tsxContent = fs.readFileSync(tsxPath, 'utf8');

// Verify removal of hardcoded '26-08-2026'
assert(!tsxContent.includes('26-08-2026'), 'Hardcoded fake date 26-08-2026 must be removed from TSX component');

// Verify MODEL_ONLY semantics in TSX
assert(tsxContent.includes('Nog niet toegevoegd'), 'TSX must show "Nog niet toegevoegd" when serial is missing');
assert(tsxContent.includes('Nog niet gekoppeld (geen serienummer)'), 'TSX must not claim factory when serial missing');
assert(tsxContent.includes('Niet opgegeven'), 'TSX must not show serial-derived year when serial missing');
assert(tsxContent.includes('MODELPASPOORT'), 'TSX must support MODELPASPOORT badge');
assert(tsxContent.includes('OFFICIAL_SERIAL_VERIFIED'), 'TSX must support OFFICIAL_SERIAL_VERIFIED mode');
assert(tsxContent.includes('passportMode !== \'MODEL_ONLY\''), 'TSX must suppress StopHeling box for MODEL_ONLY');

// Verify JS implementation
assert.strictEqual(vmModelOnly.formattedSerial, 'Nog niet toegevoegd');
assert.strictEqual(vmModelOnly.country, 'Nog niet gekoppeld (geen serienummer)');
assert.strictEqual(vmModelOnly.years, 'Niet opgegeven');
console.log('  ✅ Gate 2 Passed: Semantic parity verified between JS and TSX; zero fake dates.\n');

// ============================================================================
// Gate 3: Canonical Model vs Official Product Identity Separation
// ============================================================================
console.log('▶ Gate 3: Canonical model vs Official product variant separation...');
const mockStorage = createMockStorage();

const initialDossier = createDossierObject({
  modelSlug: 'ms-260',
  modelName: 'MS 260',
  category: 'Kettingzaag',
  seriesCode: '1121',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
saveDossier(initialDossier, mockStorage);

// Trigger conflict with 163118080 (MS 440-Z)
const conflictRes = enrichDossierWithSerial(initialDossier.dossier_id, '163118080', database, {}, mockStorage);
assert.strictEqual(conflictRes.success, false);
assert.strictEqual(conflictRes.status, 'IDENTITY_CONFLICT');

// Execute SWITCH_TO_OFFICIAL
const switchRes = resolveDossierConflict(initialDossier.dossier_id, 'SWITCH_TO_OFFICIAL', mockStorage, database);
assert.strictEqual(switchRes.success, true);

const resolvedDossier = loadDossiers(mockStorage).find(d => d.dossier_id === initialDossier.dossier_id);
// STRICT GATE ASSERTIONS:
assert.strictEqual(resolvedDossier.identity.model_slug, 'ms-440', 'model_slug must be ms-440');
assert.strictEqual(resolvedDossier.identity.model_name, 'MS 440', 'model_name MUST remain canonical model name (MS 440)');
assert.strictEqual(resolvedDossier.identity.canonical_model_id, 'stihl_ms_440', 'canonical_model_id must be stihl_ms_440');
assert.strictEqual(
  resolvedDossier.identity.official_product_name,
  'MS 440-Z 3/8" RIM Magnum Motorsäge',
  'official_product_name must preserve full official variant'
);
assert.notStrictEqual(
  resolvedDossier.identity.model_name,
  resolvedDossier.identity.official_product_name,
  'model_name and official_product_name must NOT be collapsed into each other'
);
assert.strictEqual(resolvedDossier.identity.verified_at, '2026-09-22');
assert.strictEqual(resolvedDossier.machine.serial_number, '163118080');
console.log('  ✅ Gate 3 Passed: Canonical model (MS 440) and official variant remain cleanly decoupled.\n');

// ============================================================================
// Gate 4: Compatibility Evidence Gates & Generic Claims
// ============================================================================
console.log('▶ Gate 4: Compatibility evidence gates and claim sanitization...');
// Generic claim check
const chainsawRecs = buildModelRecommendations(
  { model_slug: 'ms-440', model_name: 'MS 440', category: 'Kettingzaag' },
  { displacement_cc: '70.7' }
);
const chainOilRec = chainsawRecs.recommendations.find(r => r.recommendation_type === RECOMMENDATION_TYPES.CHAIN_OIL);
assert.strictEqual(chainOilRec.technical_compatibility.display_claim, 'Kettingolie voor kettingzaagtoepassingen');
assert(!chainOilRec.technical_compatibility.display_claim.includes('alle STIHL'), 'Must not claim "alle STIHL"');

const twoStrokeRec = chainsawRecs.recommendations.find(r => r.recommendation_type === RECOMMENDATION_TYPES.TWO_STROKE_OIL);
assert.strictEqual(twoStrokeRec.technical_compatibility.display_claim, 'Controleer de voorgeschreven brandstof/mengverhouding voor jouw model.');
assert(!twoStrokeRec.technical_compatibility.display_claim.includes('Aanbevolen mengverhouding 1:50'), 'Must not make unqualified universal 1:50 claim');
console.log('  ✅ Gate 4 Passed: Generic claims sanitized according to evidence policy.\n');

// ============================================================================
// Gate 5: Privacy Guarantees Verification
// ============================================================================
console.log('▶ Gate 5: Privacy and PII stripping verification...');
const piiEvent = logStihlEvent(EVENT_TYPES.MACHINE_ADDED, {
  model_slug: 'ms-440',
  model_name: 'MS 440',
  serial_number: '163118080',
  nickname: 'Boszaag Jan',
  notes: 'Gekocht van buurman voor 250 euro',
  custom_pin: '1234'
}, 'TestAgent/1.0');

assert.strictEqual(piiEvent.metadata.serial_number, undefined, 'Serial must be stripped');
assert.strictEqual(piiEvent.metadata.nickname, undefined, 'Nickname must be stripped');
assert.strictEqual(piiEvent.metadata.notes, undefined, 'Notes must be stripped');
assert.strictEqual(piiEvent.metadata.custom_pin, undefined, 'Custom PIN must be stripped');

const serializedEvent = JSON.stringify(piiEvent);
assert(!serializedEvent.includes('163118080'), 'Serial must never exist in analytics event');
assert(!serializedEvent.includes('Boszaag Jan'), 'Nickname must never exist in analytics event');
assert(!serializedEvent.includes('buurman'), 'Notes must never exist in analytics event');
console.log('  ✅ Gate 5 Passed: Zero serial, nickname, or private notes in analytics telemetry.\n');

console.log('🎉 ALL PHASE 47A HARDENING GATES PASSED 100% CLEANLY!');
