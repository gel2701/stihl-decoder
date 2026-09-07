import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeStihlCode } from '../src/decoder.js';
import { renderStihlPassportHtml, buildPassportViewModel } from '../src/components/StihlPassportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const evidencePath = path.join(rootDir, 'data', 'public_evidence_facts.json');
const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

console.log('▶ Running Phase 36C UI/DOM User-Value Acceptance Tests...');

const serial = '824061159';

// ==========================================
// STEP 1-3: Serial-Only Query & Passport DOM
// ==========================================
const decodeA = decodeStihlCode(serial, database);
const passportA = renderStihlPassportHtml({
  cleanedSerial: decodeA.cleaned,
  formatted: decodeA.cleaned,
  model: decodeA.model,
  exactModel: decodeA.exactModel,
  modelIdentityStatus: decodeA.modelIdentityStatus,
  factory: decodeA.factory,
  production: decodeA.production,
  estimatedYears: decodeA.estimatedYears,
  technicalSpecs: decodeA.technicalSpecs,
  driveClassification: decodeA.driveClassification
});

// A1: Visible elements
assert.ok(passportA.includes(serial), 'Serial number must be visible');
assert.ok(passportA.includes('Nog niet definitief bevestigd') || passportA.includes('Niet vastgesteld'), 'Model unconfirmed state must be clear');
assert.ok(passportA.includes('Fabriekscode 8 — locatie nog niet bevestigd'), 'Factory code unverified label must be visible');
assert.ok(!passportA.includes('China'), 'Factory country China must not be displayed for unverified code 8');
assert.ok(passportA.includes('Stop Heling') || passportA.includes('stopheling'), 'StopHeling action must be present');

// A2: MUST NOT BE VISIBLE in serial-only
assert.ok(!passportA.includes('vanaf circa 2010'), 'No fake 2010 year in DOM');
assert.ok(!passportA.includes('vanaf circa 2016'), 'No fake 2016 year in DOM');
assert.ok(!passportA.includes('MS 170'), 'MS 170 must not be falsely claimed in serial-only DOM');
assert.ok(!passportA.includes('Taicang'), 'Taicang must not be claimed without evidence');
assert.ok(!passportA.includes('Qingdao'), 'Qingdao must not be claimed without serial code evidence');

// ==========================================
// STEP 4-5: Model-Assisted (MS 170) Passport DOM
// ==========================================
const decodeB = decodeStihlCode(serial, database, { confirmedModel: 'MS 170' });
const vmB = buildPassportViewModel({
  cleanedSerial: decodeB.cleaned,
  formatted: decodeB.cleaned,
  model: decodeB.model,
  resolvedModel: decodeB.resolvedModel,
  confirmedModel: decodeB.confirmedModel,
  exactModel: decodeB.exactModel,
  modelIdentityStatus: decodeB.modelIdentityStatus,
  factory: decodeB.factory,
  production: decodeB.production,
  estimatedYears: decodeB.estimatedYears,
  technicalSpecs: decodeB.technicalSpecs,
  driveClassification: decodeB.driveClassification,
  publicEvidenceFacts: decodeB.publicEvidenceFacts
});
const passportB = renderStihlPassportHtml({
  ...decodeB,
  cleanedSerial: decodeB.cleaned,
  formatted: decodeB.cleaned
});

// B1: Visible elements
assert.ok(passportB.includes('MS 170'), 'Model MS 170 must be displayed');
assert.ok(passportB.includes('Model door gebruiker opgegeven') || passportB.includes('Model bevestigd door gebruiker'), 'User confirmed attribution label must be shown');
assert.ok(passportB.includes('30.1 cc'), 'Displacement 30.1 cc must be displayed');
assert.ok(passportB.includes('1.3 kW'), 'Power 1.3 kW must be displayed');
assert.ok(passportB.includes('0458-207-8321-B'), 'Official document ID must be displayed');
assert.ok(passportB.includes('VA2.J20'), 'Official edition VA2.J20 must be displayed');
assert.ok(passportB.includes('p. 43'), 'Official printed page 43 must be displayed');

// B2: Exact model serial-derived claim MUST NOT BE SHOWN
assert.ok(!passportB.includes('Serienummer bevestigd als MS 170'), 'Must not claim serial confirms MS 170');
assert.ok(!passportB.includes('Exact model uit serienummer'), 'Must not claim exact model from serial');

// ==========================================
// STEP 6: User Provided Year 2021 Passport DOM
// ==========================================
const decodeC = decodeStihlCode(serial, database, { confirmedModel: 'MS 170', userProvidedYear: 2021 });
const passportC = renderStihlPassportHtml({
  ...decodeC,
  cleanedSerial: decodeC.cleaned,
  formatted: decodeC.cleaned
});

assert.ok(passportC.includes('2021'), 'User provided year 2021 must be visible');
assert.ok(passportC.includes('Door gebruiker opgegeven') || passportC.includes('door gebruiker opgegeven'), 'Attribution as user provided must be visible');
assert.ok(passportC.includes('niet onafhankelijk uit serienummer bevestigd') || passportC.includes('Niet onafhankelijk uit serienummer bevestigd'), 'Caveat must be visible');
assert.ok(!passportC.includes('Bouwjaar: 2021 — officieel bevestigd'), 'Must not claim 2021 is officially confirmed');

console.log('✅ Phase 36C UI/DOM User-Value Acceptance Tests Passed 100%.');
