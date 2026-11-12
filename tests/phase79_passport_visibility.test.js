import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  createDossierObject,
  saveDossier,
  loadDossiers,
  IDENTITY_STATUSES,
  IDENTITY_SOURCES
} from '../src/components/MachineDossierManager.js';
import {
  buildPassportExportModel,
  PASSPORT_EVIDENCE_STATES,
  PASSPORT_EVIDENCE_LABELS,
  MASKED_SERIAL_TEXT,
  PASSPORT_EXPORT_BRAND
} from '../src/components/StihlPassportGenerator.js';
import { renderPassportHubHtml } from '../src/components/IntentPageTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const hubHtml = renderPassportHubHtml({
  intent: { slug: 'stihl-paspoort', title: 'STIHL Digitaal Machine Paspoort Maken', description: 'Beheer uw STIHL-machinegegevens lokaal.' },
  database,
  baseUrl: 'https://www.stihldecoder.nl',
  seoMetaHtml: '',
  breadcrumbsHtml: ''
});
const analyticsSource = fs.readFileSync(path.join(rootDir, 'src', 'components', 'SiteAnalytics.js'), 'utf8');

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
}

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 79 MACHINEPASPOORT VISIBILITY SUITE');
console.log('===============================================================\n');

// ============================================================================
// A. Homepage: Machinepaspoort is a first-class, directly visible function
// ============================================================================
console.log('▶ A. Homepage visibility, order and CTA destination...');
const partsIndex = indexHtml.indexOf('Onderdelen zoeken');
const serialIndex = indexHtml.indexOf('Machine identificeren');
const passportIndex = indexHtml.indexOf('Gratis STIHL Machinepaspoort');
assert(partsIndex > -1 && serialIndex > -1 && passportIndex > -1, 'All three homepage functions must be present');
assert(partsIndex < serialIndex && serialIndex < passportIndex, 'Order must be: Onderdelen zoeken, Machine identificeren, Machinepaspoort maken');

assert(
  indexHtml.includes('href="/stihl-paspoort/#nieuw"'),
  'Passport card must link directly to the existing passport function'
);
assert(indexHtml.includes('Maak gratis Machinepaspoort'), 'CTA label must be present');
assert(indexHtml.includes('Ook zonder serienummer'), 'Card must state that no serial number is required');
assert(
  indexHtml.includes('Handig voor onderhoud, eigen administratie en verkoop via Marktplaats of Facebook Marketplace.'),
  'Card description must mention maintenance, administration and resale'
);
assert(indexHtml.includes('id="tab-intent-passport"'), 'Passport card must have a stable id');

// Visible without searching, on desktop and mobile (single column grid, no hidden state)
const gridMatch = indexHtml.match(/<div class="grid grid-cols-1 sm:grid-cols-3 gap-3\.5 mt-8[^"]*"[^>]*role="group"/);
assert(gridMatch, 'Homepage function grid must remain a single column on mobile and three columns on desktop');
const passportCardMatch = indexHtml.match(/<a href="\/stihl-paspoort\/#nieuw"[^>]*>/);
assert(passportCardMatch, 'Passport card markup must be an anchor to the passport hub');
assert(!/\bhidden\b/.test(passportCardMatch[0]), 'Passport card must not be hidden');

// Technische informatie remains reachable through a clearly visible secondary link
assert(indexHtml.includes('id="tab-intent-partno"'), 'Technische informatie link must remain available');
assert(indexHtml.includes('href="/gidsen/serienummer-locaties/"'), 'Technische informatie must keep its canonical destination');
assert(indexHtml.includes('Technische informatie — afstelwaarden, specificaties'), 'Technische informatie must keep a visible label');
console.log('  ✅ A Passed.\n');

// ============================================================================
// B. Passport hub landing page
// ============================================================================
console.log('▶ B. /stihl-paspoort/ landing page makes creating a passport obvious...');
assert(hubHtml.includes('id="nieuw"'), 'Hub must expose the #nieuw anchor used by the homepage CTA');
assert(hubHtml.includes('id="btn-open-create-modal"'), 'Hub must have a prominent create CTA');
assert(hubHtml.includes('Nieuw Machinepaspoort maken'), 'Create CTA must be labelled Nieuw Machinepaspoort maken');
assert(hubHtml.includes('STIHL Machinepaspoort maken'), 'Hub must have a clear H1 for creating a passport');
assert(hubHtml.includes('Ook zonder serienummer'), 'Hub must state no serial number is required');
assert(hubHtml.includes('zonder account of registratie'), 'Hub must state no account is required');
assert(hubHtml.includes('PNG downloaden voor je verkoopadvertentie'), 'Hub must mention the PNG download');
assert(hubHtml.includes('blijven op dit apparaat'), 'Hub must explain local storage');
assert(hubHtml.includes('geen eigendomsbewijs'), 'Hub must state a passport is not proof of ownership');

// Existing dossier, maintenance, reminder and backup functionality stays intact
for (const id of ['dossier-grid', 'btn-export-backup', 'input-import-backup-file', 'btn-open-add', 'btn-empty-add', 'filter-btn-all', 'filter-btn-soon', 'filter-btn-overdue', 'modal-passport', 'modal-detail', 'modal-complete-rem']) {
  assert(hubHtml.includes(`id="${id}"`), `Existing hub control ${id} must be preserved`);
}
assert(hubHtml.includes('Nieuw Machinepaspoort maken'), 'Empty state must offer a direct start');
assert((hubHtml.match(/Privacy-first opslag:/g) || []).length === 1, 'Single privacy card must remain');
console.log('  ✅ B Passed.\n');

// ============================================================================
// C. Creating passports with and without a serial number
// ============================================================================
console.log('▶ C. Model-only and serial passports can be created and reopened...');
const storage = new MockLocalStorage();
const modelOnlyDossier = createDossierObject({
  modelSlug: 'ms-440',
  modelName: 'MS 440',
  category: 'Kettingzaag',
  seriesCode: '1128',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: null
});
assert.strictEqual(modelOnlyDossier.machine.serial_number, null, 'Serial must stay null when not entered');
assert.strictEqual(saveDossier(modelOnlyDossier, storage).success, true, 'Model-only passport must save');
assert.strictEqual(loadDossiers(storage).length, 1, 'Model-only passport must be reopenable from local storage');

const serialDossier = createDossierObject({
  modelSlug: 'ms-440',
  modelName: 'MS 440',
  category: 'Kettingzaag',
  seriesCode: '1128',
  identityStatus: IDENTITY_STATUSES.USER_CONFIRMED_MODEL,
  identitySource: IDENTITY_SOURCES.MODEL_PAGE_SELECTION,
  serialNumber: '184592301'
});
assert.strictEqual(saveDossier(serialDossier, storage).success, true, 'Serial passport must save');
assert.strictEqual(loadDossiers(storage).length, 2, 'Both passports must be reopenable');
assert.strictEqual(loadDossiers(storage)[1].machine.serial_number, '184592301', 'Stored serial must be preserved');
console.log('  ✅ C Passed.\n');

// ============================================================================
// D. PNG export for marketplaces: privacy by default, public QR, brand line
// ============================================================================
console.log('▶ D. Shareable PNG export model...');
const maskedExport = buildPassportExportModel(serialDossier);
assert.strictEqual(maskedExport.showSerial, false, 'Serial must be hidden by default');
assert.strictEqual(maskedExport.serialMasked, true, 'Export must mark the serial as masked');
assert.strictEqual(maskedExport.serialText, MASKED_SERIAL_TEXT, 'Masked serial placeholder must be used');
assert(!maskedExport.serialText.includes('184592301'), 'Serial digits must never appear in the masked export');
assert.strictEqual(maskedExport.originText, 'Afgeschermd op deze afbeelding', 'Masked export must not imply a factory link');
assert(!maskedExport.filename.includes('184592301'), 'Filename must not contain the serial number');
assert(maskedExport.filename.startsWith('STIHL_Machinepaspoort_ms-440'), 'Filename must name the model');

const shownExport = buildPassportExportModel(serialDossier, { showSerial: true });
assert.strictEqual(shownExport.showSerial, true, 'Explicit choice must show the serial');
assert.strictEqual(shownExport.serialText, '1 845 923 01', 'Shown serial must be the formatted serial');
assert.strictEqual(serialDossier.machine.serial_number, '184592301', 'Original machine data must never change');

const modelOnlyExport = buildPassportExportModel(modelOnlyDossier);
assert.strictEqual(modelOnlyExport.hasSerial, false);
assert.strictEqual(modelOnlyExport.serialText, 'Nog niet toegevoegd', 'Passport without serial must export normally');
assert.strictEqual(modelOnlyExport.evidenceState, PASSPORT_EVIDENCE_STATES.USER_CONFIRMED_MODEL);

for (const exportModel of [maskedExport, shownExport, modelOnlyExport]) {
  assert.strictEqual(exportModel.brandLine, PASSPORT_EXPORT_BRAND, 'Brand line must be Gemaakt met STIHLDecoder.nl');
  assert(exportModel.brandLine === 'Gemaakt met STIHLDecoder.nl', 'Exact brand mention required');
  assert(exportModel.disclaimer.toLowerCase().includes('geen eigendomsbewijs'), 'Export must state it is not proof of ownership');
  assert(exportModel.specLines.length <= 4, 'Export must keep technical data within the image');
  assert(exportModel.publicUrl.startsWith('https://www.stihldecoder.nl/'), 'Export must reference the public site');
  assert.deepStrictEqual(maskedExport.publicUrl, exportModel.publicUrl, 'Public URL must stay stable');
}

// QR must point to the public model page, never to a private dossier
for (const exportModel of [maskedExport, shownExport, modelOnlyExport]) {
  const publicUrl = 'https://www.stihldecoder.nl/kettingzagen/ms-440/';
  assert(exportModel.qrUrl.includes(encodeURIComponent(publicUrl)), 'QR must encode the public model page');
  assert(!exportModel.qrUrl.includes('184592301'), 'QR must never contain a serial number');
  assert(!exportModel.qrUrl.includes('passport='), 'QR must never point to a private dossier');
  assert(!exportModel.qrUrl.includes('localStorage'), 'QR must never reference local storage');
}
console.log('  ✅ D Passed.\n');

// ============================================================================
// E. Evidence status never overstates the stored data
// ============================================================================
console.log('▶ E. Evidence statuses...');
const onlyModelKnown = buildPassportExportModel({
  model: 'MS 440', modelSlug: 'ms-440', category: 'Kettingzaag', exactModel: 'MS 440'
}, {});
assert.strictEqual(onlyModelKnown.evidenceState, PASSPORT_EVIDENCE_STATES.MODEL_ONLY);
assert.strictEqual(onlyModelKnown.evidenceLabel, PASSPORT_EVIDENCE_LABELS.MODEL_ONLY);
assert.strictEqual(onlyModelKnown.evidenceBadge, 'ALLEEN MODEL BEKEND');

const userReported = buildPassportExportModel({
  model: 'MS 440', modelSlug: 'ms-440', category: 'Kettingzaag', identityStatus: 'USER_CONFIRMED_MODEL'
}, {});
assert.strictEqual(userReported.evidenceState, PASSPORT_EVIDENCE_STATES.USER_CONFIRMED_MODEL);
assert.strictEqual(userReported.evidenceBadge, 'MODEL DOOR GEBRUIKER');

const unverifiedSerial = buildPassportExportModel({
  model: 'MS 440', modelSlug: 'ms-440', category: 'Kettingzaag', serialNumber: '184592301'
}, {});
assert.strictEqual(unverifiedSerial.evidenceState, PASSPORT_EVIDENCE_STATES.SERIAL_UNVERIFIED);
assert.strictEqual(unverifiedSerial.evidenceLabel, 'Serienummer aanwezig, niet officieel bevestigd');

const officialSerial = buildPassportExportModel({
  model: 'MS 440',
  modelSlug: 'ms-440',
  category: 'Kettingzaag',
  serialNumber: '163118080',
  officialAnchor: {
    officialProductName: 'MS 440-Z 3/8" RIM Magnum Motorsäge',
    canonicalModelId: 'stihl_ms_440',
    verifiedAt: '2026-09-22',
    source: 'MY_STIHL'
  }
}, {});
assert.strictEqual(officialSerial.evidenceState, PASSPORT_EVIDENCE_STATES.SERIAL_OFFICIAL);
assert.strictEqual(officialSerial.evidenceBadge, 'OFFICIEEL GEVERIFIEERD');

for (const exportModel of [onlyModelKnown, userReported, unverifiedSerial, officialSerial]) {
  assert(!/gegarandeerd|officieel erkend|certificaat/i.test(exportModel.evidenceLabel), 'Evidence labels must not overclaim');
  assert(!/eigendom/i.test(exportModel.evidenceBadge), 'Evidence badges must not suggest proof of ownership');
  assert(!exportModel.yearsText.includes('Productieperiode'), 'Export must not invent a production period');
}
console.log('  ✅ E Passed.\n');

// ============================================================================
// F. Consent-gated analytics without personal data
// ============================================================================
console.log('▶ F. Analytics contract...');
assert(analyticsSource.includes('getConsent() === \'granted\''), 'Blueprint events must stay consent-gated');
assert(analyticsSource.includes('__stihlTestMode'), 'Automated tests must stay excluded from analytics');

for (const eventName of ['passport_cta_click', 'passport_started', 'passport_created', 'passport_download']) {
  assert(hubHtml.includes(`'${eventName}'`), `Hub must emit ${eventName}`);
}
assert(indexHtml.includes("'passport_cta_click'"), 'Homepage must measure the passport CTA click');
assert(indexHtml.includes("'passport_download'"), 'Homepage must measure the passport download');

const passportAnalyticsCalls = [...(indexHtml + hubHtml).matchAll(/trackStihlEvent\(\s*'passport_[^)]*\)/g)].map((m) => m[0]);
assert(passportAnalyticsCalls.length > 0, 'Passport analytics calls must exist');
for (const call of passportAnalyticsCalls) {
  assert(!/serialNumber|serial_number|nickname|owner|eigenaar|machine\.serial/i.test(call), `Analytics call must not carry personal data: ${call}`);
}
assert(hubHtml.includes('serial_present: Boolean(serial)'), 'Only a boolean serial presence flag may be sent');
assert(hubHtml.includes('serial_masked: !showSerial'), 'Only a boolean masking flag may be sent');
console.log('  ✅ F Passed.\n');

// ============================================================================
// G. Regression: existing homepage and paspoort features stay intact
// ============================================================================
console.log('▶ G. Regression checks...');
for (const marker of [
  'id="code-input"',
  'id="search-btn"',
  'id="model-card-passport-btn"',
  'id="download-passport-btn"',
  'id="cookie-consent-banner"',
  'id="cookie-accept-btn"',
  'id="cookie-reject-btn"',
  'As an Amazon Associate I earn from qualifying purchases',
  'id="tab-intent-parts"',
  'id="tab-intent-serial"'
]) {
  assert(indexHtml.includes(marker), `Homepage regression marker missing: ${marker}`);
}
assert(hubHtml.includes('id="check-show-serial-export"'), 'Serial visibility choice must exist in the passport modal');
assert(!/id="check-show-serial-export"[^>]*checked/.test(indexHtml), 'Serial visibility must be off by default on the homepage');
assert(!/id="check-show-serial-export"[^>]*checked/.test(hubHtml), 'Serial visibility must be off by default in the hub');
assert(indexHtml.includes("downloadStihlPassportImage({") && indexHtml.includes('{ showSerial: showSerialOnImage }'), 'Homepage must pass the privacy choice to the export');
assert(hubHtml.includes('downloadStihlPassportImage(activePassportDossier, { showSerial })'), 'Hub must pass the privacy choice to the export');
console.log('  ✅ G Passed.\n');

// ============================================================================
// H. Performance: no new external resources or frameworks
// ============================================================================
console.log('▶ H. Performance constraints...');
assert(!indexHtml.includes('cdn.tailwindcss.com'), 'Homepage must not load Tailwind from a CDN');
assert.strictEqual((indexHtml.match(/<script[^>]+src="https?:\/\//g) || []).length, 0, 'Homepage must not add external scripts');
assert(!/<script/.test(passportCardMatch[0]), 'Passport card must be plain markup, not a new script');
assert(!/style="/.test(passportCardMatch[0]), 'Passport card must reuse existing CSS classes');
console.log('  ✅ H Passed.\n');

console.log('🎉 ALL PHASE 79 MACHINEPASPOORT VISIBILITY TESTS PASSED 100% CLEANLY!');
