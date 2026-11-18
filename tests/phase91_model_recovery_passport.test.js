import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

import { normalizeModelQuery, findModelInDatabase } from '../src/modelNormalizer.js';
import { searchIntelligentModels, getAutocompleteSuggestions } from '../src/search/IntelligentSearchEngine.js';
import { decodeStihlCode } from '../src/decoder.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import {
  IDENTITY_STATUSES,
  SERIAL_VERIFICATION_STATUSES,
  DOSSIER_SAVEABLE_IDENTITY_STATUSES,
  createDossierObject,
  validateDossierSchema
} from '../src/components/MachineDossierManager.js';
import {
  buildPassportViewModel,
  buildPassportExportModel,
  resolvePassportEvidenceState,
  PASSPORT_EVIDENCE_STATES,
  MASKED_SERIAL_TEXT
} from '../src/components/StihlPassportGenerator.js';
import { generateQrMatrix, renderQrSvg } from '../src/utils/qrCode.js';
import { sanitizePassportForShare, maskSerialForPublicDisplay } from '../src/components/PublicPassportTemplate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
database.public_evidence = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf8'));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
  }
}

console.log('🧪 PHASE 91 MODEL RECOVERY, VARIANT RECOGNITION & MACHINE PASSPORT MATRIX');

// 1. Concrete baseline failures from Phase 91 Section 1
check('023 resolves as MODEL_CONFIRMED kettingzaag with TS_Data specs', () => {
  const res = decodeStihlCode('023', database);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.type, 'MODEL_DECODE');
  assert.strictEqual(res.model, '023');
  assert.strictEqual(res.identityStatus, 'MODEL_CONFIRMED');
  assert.strictEqual(res.technicalSpecs.displacement_cc, 40.2);
  assert.strictEqual(res.technicalSpecs.power_kw, 1.9);
  assert.strictEqual(res.canonicalModelPath, '/kettingzagen/023/');
  assert.strictEqual(res.canonicalPartsPath, '/kettingzagen/023/onderdelen/');
});

check('Stihl 023 resolves identically to 023', () => {
  const res = decodeStihlCode('Stihl 023', database);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.type, 'MODEL_DECODE');
  assert.strictEqual(res.model, '023');
  assert.strictEqual(res.technicalSpecs.displacement_cc, 40.2);
});

check('025 resolves cleanly with verified 45.4 cc specs', () => {
  const res = decodeStihlCode('025', database);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.model, '025');
  assert.strictEqual(res.technicalSpecs.displacement_cc, 45.4);
  assert.strictEqual(res.canonicalModelPath, '/kettingzagen/025/');
});

for (const q025c of ['025C', '025 C', 'STIHL 025 C', '025-c']) {
  check(`Variant suffix query "${q025c}" resolves usable 025 base with VARIANT_UNCONFIRMED and never equates with MS 250 C`, () => {
    const res = decodeStihlCode(q025c, database);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.type, 'MODEL_DECODE');
    assert.strictEqual(res.model, '025');
    assert.notStrictEqual(res.model, 'MS 250');
    assert.strictEqual(res.identityStatus, 'VARIANT_UNCONFIRMED');
    assert.strictEqual(res.variantUnconfirmed, true);
    assert.strictEqual(res.enteredVariant, '025 C');
    assert.strictEqual(res.passportEligible, true);
  });
}

check('MS 250 C and MS 250 C-BE do NOT fall into alphanumeric SERIAL_NUMBER decode', () => {
  for (const q of ['MS 250 C', 'MS 250 C-BE', 'ms250cbe', 'STIHL MS 250 C-BE']) {
    const res = decodeStihlCode(q, database);
    assert.strictEqual(res.success, true, `${q} must succeed`);
    assert.strictEqual(res.type, 'MODEL_DECODE', `${q} must be MODEL_DECODE`);
    assert.strictEqual(res.model, 'MS 250', `${q} must resolve MS 250`);
    assert.strictEqual(res.variantUnconfirmed, false, `${q} documented variant must be confirmed`);
  }
});

// 2. Dynamically generated matrix over ALL recovered/existing models in stihl_database.json
const models = database.models || [];
check(`Catalog contains >= 450 verified models & >= 40 legacy 0xx saws (actual: ${models.length})`, () => {
  assert.ok(models.length >= 450, `Expected >= 450 models, got ${models.length}`);
  const legacyCount = models.filter(m => /^0\d{2}$/.test(m.model_name)).length;
  assert.ok(legacyCount >= 40, `Expected >= 40 legacy 0xx chainsaws, got ${legacyCount}`);
});

for (const m of models) {
  const cname = m.model_name;
  check(`Canonical decode exact match: ${cname}`, () => {
    const res = decodeStihlCode(cname, database);
    assert.strictEqual(res.success, true, `Failed decode for ${cname}: ${res.error}`);
    assert.strictEqual(res.type, 'MODEL_DECODE', `Wrong decode type for ${cname}: ${res.type}`);
    assert.ok(res.canonicalModelPath, `Missing canonicalModelPath for ${cname}`);
  });
}

// Branded & compact variations on stratified subset (all 0xx + every 4th model)
const stratified = [
  ...models.filter(m => /^0\d{2}$/.test(m.model_name)),
  ...models.filter((_, i) => i % 4 === 0)
];
for (const m of stratified) {
  const branded = `STIHL ${m.model_name}`;
  const compact = m.model_name.replace(/\s+/g, '').toLowerCase();
  check(`Branded/compact variations work for ${m.model_name}`, () => {
    const r1 = decodeStihlCode(branded, database);
    assert.strictEqual(r1.success, true, `Branded failed for ${branded}`);
    assert.strictEqual(r1.type, 'MODEL_DECODE');

    const r2 = decodeStihlCode(compact, database);
    assert.strictEqual(r2.success, true, `Compact failed for ${compact}`);
    assert.strictEqual(r2.type, 'MODEL_DECODE');
  });
}

// Strict guards preserved for serials, parts & bogus numbers
check('Nonexistent model MS 2500 stays NOT_FOUND with suggestions', () => {
  const res = decodeStihlCode('MS 2500', database);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.status, 'NOT_FOUND');
  assert.ok(Array.isArray(res.suggestions) && res.suggestions.includes('MS 250'));
});

check('11-digit part number 1121 021 0800 still decodes as PART_NUMBER', () => {
  const res = decodeStihlCode('1121 021 0800', database);
  assert.strictEqual(res.type, 'PART_NUMBER');
});

check('9-digit serial still decodes as SERIAL_NUMBER', () => {
  const res = decodeStihlCode('184592301', database);
  assert.strictEqual(res.type, 'SERIAL_NUMBER');
});

// 3. Part catalog resolution for recovered legacy chainsaws
for (const legModel of ['021', '023', '024', '025', '028', '034', '038', '066', '090']) {
  check(`Parts fitment resolver recognizes recovered model ${legModel}`, () => {
    const m = models.find(x => x.model_name === legModel);
    assert.ok(m, `Missing model ${legModel} in database`);
    assert.strictEqual(PartCatalogResolver.hasPartsForModel(m, database), true, `Expected parts for ${legModel}`);
  });
}

// 4. Machine Passport without serial, with unconfirmed variant, privacy masking & offline QR
check('Create & validate dossier for 025 C without serial (VARIANT_UNCONFIRMED + SERIAL_UNVERIFIED)', () => {
  const d = createDossierObject({
    modelSlug: '025',
    modelName: '025',
    variant: '025 C',
    variantUnconfirmed: true,
    category: 'Kettingzaag',
    seriesCode: '1123',
    identityStatus: IDENTITY_STATUSES.VARIANT_UNCONFIRMED,
    identitySource: 'MODEL_PAGE_SELECTION',
    condition: 'Goed',
    ownerDeclaredYear: 1998,
    serialNumber: null
  });
  assert.strictEqual(validateDossierSchema(d), true);
  assert.strictEqual(DOSSIER_SAVEABLE_IDENTITY_STATUSES.includes(d.identity.identity_status), true);
  assert.strictEqual(d.identity.variant, '025 C');
  assert.strictEqual(d.machine.serial_status, SERIAL_VERIFICATION_STATUSES.SERIAL_UNVERIFIED);

  const exportModel = buildPassportExportModel(d);
  assert.strictEqual(exportModel.evidenceState, PASSPORT_EVIDENCE_STATES.VARIANT_UNCONFIRMED);
  assert.ok(exportModel.qrUrl.includes('stihldecoder.nl'));
  assert.strictEqual(exportModel.qrUrl.includes('184592301'), false);
});

check('Public export masks serial by default & PII stripper removes owner fields', () => {
  const exp = buildPassportExportModel({
    modelName: '023',
    modelSlug: '023',
    serialNumber: '184592301',
    identityStatus: 'USER_CONFIRMED_MODEL'
  });
  assert.strictEqual(exp.serialText, MASKED_SERIAL_TEXT);

  const sanitized = sanitizePassportForShare({
    model_name: '023',
    model_slug: '023',
    serial_number: '184592301',
    email: 'owner@test.nl',
    phone: '0612345678',
    owner_name: 'Jan'
  }, database);
  assert.strictEqual(sanitized.serial_masked, '••••••301');
  assert.strictEqual('email' in sanitized, false);
  assert.strictEqual('phone' in sanitized, false);
  assert.strictEqual('owner_name' in sanitized, false);
});

check('Pure-JS QR generator produces valid matrix & SVG for share URL', () => {
  const matrix = generateQrMatrix('https://www.stihldecoder.nl/paspoort/p1234abcd/');
  assert.ok(matrix.length >= 29 && matrix.length % 4 === 1);
  // Check top-left 7x7 finder outer border dark
  for (let i = 0; i < 7; i++) {
    assert.strictEqual(matrix[0][i], 1);
    assert.strictEqual(matrix[i][0], 1);
  }
  const svg = renderQrSvg('https://www.stihldecoder.nl/paspoort/p1234abcd/');
  assert.ok(svg.startsWith('<svg') && svg.includes('<path d="M'));
});

// 5. Live HTTP Server & SQLite Public Share Route Verification
const { server } = await import('../server.js');
await new Promise(resolve => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
});
const port = server.address().port;

function requestHttp(method, urlPath, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

await checkAsync('HTTP GET /api/decode & /api/search-suggest for 023 and 025 C', async () => {
  const r023 = await requestHttp('GET', '/api/decode?code=023');
  assert.strictEqual(r023.status, 200);
  const j023 = JSON.parse(r023.body);
  assert.strictEqual(j023.success, true);
  assert.strictEqual(j023.model, '023');

  const r025c = await requestHttp('GET', '/api/decode?code=025%20C');
  assert.strictEqual(r025c.status, 200);
  const j025c = JSON.parse(r025c.body);
  assert.strictEqual(j025c.success, true);
  assert.strictEqual(j025c.model, '025');
  assert.strictEqual(j025c.identityStatus, 'VARIANT_UNCONFIRMED');

  const s023 = await requestHttp('GET', '/api/search-suggest?q=023');
  assert.strictEqual(s023.status, 200);
  const sj = JSON.parse(s023.body);
  assert.ok(Array.isArray(sj.suggestions) && sj.suggestions.some(x => x.model_name === '023'));
});

await checkAsync('HTTP GET recovered model, parts & passport pages return 200', async () => {
  for (const p of ['/kettingzagen/023/', '/kettingzagen/023/onderdelen/', '/kettingzagen/025/', '/kettingzagen/025/onderdelen/', '/stihl-paspoort/']) {
    const res = await requestHttp('GET', p);
    assert.strictEqual(res.status, 200, `Expected 200 on ${p}, got ${res.status}`);
  }
});

await checkAsync('HTTP POST/GET/PUT /api/passports & public /paspoort/:shareId/ end-to-end', async () => {
  const postRes = await requestHttp('POST', '/api/passports', {
    model_name: '025',
    model_slug: '025',
    variant: '025 C',
    variant_unconfirmed: true,
    identity_status: 'VARIANT_UNCONFIRMED',
    serial_number: '184592301',
    serial_status: 'SERIAL_UNVERIFIED',
    condition: 'Goed',
    owner_declared_year: 1998,
    email: 'private@example.com',
    events: [{ date: '2026-05-01', label: 'Bougie WSR 6 F vervangen', category: 'SPARK_PLUG' }]
  });
  assert.strictEqual(postRes.status, 201);
  const created = JSON.parse(postRes.body);
  assert.strictEqual(created.success, true);
  assert.ok(created.shareId && created.editToken);
  assert.strictEqual(created.passport.serial_masked, '••••••301');

  const pageRes = await requestHttp('GET', created.shareUrl);
  assert.strictEqual(pageRes.status, 200);
  assert.ok(pageRes.body.includes('STIHL 025 (025 C)'));
  assert.ok(pageRes.body.includes('VARIANT_UNCONFIRMED'));
  assert.ok(pageRes.body.includes('SERIAL_UNVERIFIED'));
  assert.ok(pageRes.body.includes('••••••301'));
  assert.strictEqual(pageRes.body.includes('184592301'), false, 'Public page must never expose unmasked serial');
  assert.strictEqual(pageRes.body.includes('private@example.com'), false, 'Public page must never expose email');
  assert.ok(pageRes.body.includes('<svg'), 'Public page must embed QR code SVG');
  assert.ok(pageRes.body.includes('Bougie WSR 6 F vervangen'));

  const badPut = await requestHttp('PUT', `/api/passports/${created.shareId}`, {
    editToken: 'wrongtoken',
    model_name: '025',
    model_slug: '025'
  });
  assert.strictEqual(badPut.status, 403);

  const goodPut = await requestHttp('PUT', `/api/passports/${created.shareId}`, {
    editToken: created.editToken,
    model_name: '025',
    model_slug: '025',
    variant: '025 C',
    variant_unconfirmed: true,
    condition: 'Nieuwstaat',
    events: [{ date: '2026-06-01', label: 'Carburateur gereviseerd', category: 'CARBURETOR' }]
  });
  assert.strictEqual(goodPut.status, 200);
  const pageAfter = await requestHttp('GET', created.shareUrl);
  assert.ok(pageAfter.body.includes('Nieuwstaat'));
  assert.ok(pageAfter.body.includes('Carburateur gereviseerd'));
});

check('Phase 91B: confirmed variant models set variantConfirmed=true & never emit 404 canonical paths', () => {
  for (const q of ['HS 81 T', 'HS 81 R', 'MS 261 VW', 'FS 460 C-EM', 'MS 250 C-BE']) {
    const res = decodeStihlCode(q, database);
    assert.strictEqual(res.success, true, `${q} must decode cleanly`);
    assert.strictEqual(res.identityStatus, 'MODEL_CONFIRMED', `${q} must be MODEL_CONFIRMED`);
    assert.strictEqual(res.variantConfirmed, true, `${q} must report variantConfirmed=true`);
    assert.strictEqual(res.variantUnconfirmed, false);
  }
  const slugs = new Set((database.models || []).map((m) => (m.slug || m.id.replace(/_/g, '-')).toLowerCase()));
  for (const q of ['HS 81 T', 'HS 81 R', '023', 'Stihl 023', '025', '025 C', '026', 'MS 260', '028 AV', 'FS 460 C-EM']) {
    const res = decodeStihlCode(q, database);
    const mSlug = res.canonicalModelPath?.match(/^\/[^/]+\/([^/]+)\/$/)?.[1];
    assert.ok(mSlug && slugs.has(mSlug), `${q} canonicalModelPath ${res.canonicalModelPath} must map to an existing model route`);
    const pSlug = res.canonicalPartsPath?.match(/^\/[^/]+\/([^/]+)\/onderdelen\/$/)?.[1];
    if (res.canonicalPartsPath) {
      assert.ok(pSlug && slugs.has(pSlug), `${q} canonicalPartsPath ${res.canonicalPartsPath} must map to an existing parts route`);
    }
  }
});

await checkAsync('Phase 91B HTTP: HS 81 T canonicalModelPath & canonicalPartsPath return HTTP 200', async () => {
  const dec = decodeStihlCode('HS 81 T', database);
  const rModel = await requestHttp('GET', dec.canonicalModelPath);
  assert.strictEqual(rModel.status, 200, `${dec.canonicalModelPath} must return 200`);
  const rParts = await requestHttp('GET', dec.canonicalPartsPath);
  assert.strictEqual(rParts.status, 200, `${dec.canonicalPartsPath} must return 200`);
});

await new Promise(resolve => server.close(resolve));

console.log(`\n---------------------------------------------------------------`);
console.log(`Phase 91 Regression Suite: ${passed} passed, ${failed} failed`);
console.log(`---------------------------------------------------------------\n`);

if (failed > 0) {
  process.exit(1);
}
process.exit(0);
