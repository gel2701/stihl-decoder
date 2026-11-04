import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { decodeStihlCode } from '../src/decoder.js';
import { buildPassportViewModel, renderStihlPassportHtml } from '../src/components/StihlPassportGenerator.js';
import {
  checkSalesPhotosReachability,
  generateSalesAdvertText,
  renderUniversalPassportPageHtml,
  renderSalesPassportPageHtml
} from '../src/components/UniversalPassportPageTemplate.js';
import {
  createDossierObject,
  updateDossierSales,
  IDENTITY_STATUSES,
  IDENTITY_SOURCES
} from '../src/components/MachineDossierManager.js';
import { server } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const officialAnchorsPath = path.join(rootDir, 'data', 'official_serial_anchors.json');
const dbJsonPath = path.join(rootDir, 'data', 'stihl_database.json');
const sqlitePath = path.join(rootDir, 'data', 'stihl_database.db');
const salesMachinesPath = path.join(rootDir, 'data', 'verified_sales_machines.json');

const TARGET_SERIAL = '161441572';

test('1. Triple-Store Parity & Official Serial Anchor 161441572 Verification', () => {
  const anchorsDoc = JSON.parse(fs.readFileSync(officialAnchorsPath, 'utf8'));
  const dbDoc = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });

  const anchorInDoc = anchorsDoc.anchors.find(a => a.serial_number === TARGET_SERIAL);
  const anchorInDbJson = dbDoc.official_serial_anchors.find(a => a.serial_number === TARGET_SERIAL);
  const anchorInSqlite = sqlite.prepare('SELECT * FROM official_serial_anchors WHERE serial_number = ?').get(TARGET_SERIAL);
  const sqliteCount = sqlite.prepare('SELECT COUNT(*) as c FROM official_serial_anchors').get().c;

  assert.ok(anchorInDoc, `Serial ${TARGET_SERIAL} must exist in official_serial_anchors.json`);
  assert.ok(anchorInDbJson, `Serial ${TARGET_SERIAL} must exist in stihl_database.json`);
  assert.ok(anchorInSqlite, `Serial ${TARGET_SERIAL} must exist in SQLite database`);

  // Parity checks
  assert.strictEqual(anchorsDoc.anchors.length, dbDoc.official_serial_anchors.length, 'JSON stores count parity');
  assert.strictEqual(anchorsDoc.anchors.length, sqliteCount, 'SQLite store count parity');
  assert.strictEqual(sqliteCount, 16879, 'Total anchor count must be exactly 16,879');

  // Exact attributes
  assert.strictEqual(anchorInDoc.model_name, 'MS 260 C-B .325" P Motorsäge');
  assert.strictEqual(anchorInDoc.canonical_model_id, 'stihl_ms_260');
  assert.strictEqual(anchorInDoc.category, 'Kettingzaag');
  assert.strictEqual(anchorInDoc.drive_type, 'Benzine');
  assert.strictEqual(anchorInDoc.source, 'MY_STIHL');
  assert.strictEqual(anchorInDoc.verification_status, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(anchorInDoc.evidence_type, 'OFFICIAL_WEB_LOOKUP');
  assert.strictEqual(anchorInDoc.verification_method, 'handmatig gecontroleerd MY STIHL-account, screenshot van 3 november 2026');
});

test('2. Invariant Safety: Zero Inferred Ranges & Historical Range Protection', () => {
  const dbDoc = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));

  // Exactly 8 ranges
  assert.strictEqual(dbDoc.model_serial_ranges.length, 8, 'Must maintain exactly 8 serial ranges');

  // Cohort 160000000–169999999 remains strictly HISTORICAL_PRODUCTION_RANGE without model_id
  const r160 = dbDoc.model_serial_ranges.find(x => x.range_id === 'range_1121_ms260_late');
  assert.ok(r160, 'Range 160000000–169999999 must exist');
  assert.strictEqual(r160.model_id, null, 'model_id must remain null in historical cohort');
  assert.strictEqual(r160.range_semantic_level, 'HISTORICAL_PRODUCTION_RANGE');
  assert.deepStrictEqual(r160.candidate_model_ids, [], 'candidate_model_ids must remain empty');

  // General model database untouched
  const ms260 = dbDoc.models.find(m => m.id === 'stihl_ms_260');
  assert.ok(ms260, 'MS 260 model must exist');
  assert.strictEqual(ms260.displacement_cc, 50.2);
  assert.strictEqual(ms260.power_kw, 2.6);
});

test('3. Decoder Priority 1 Official Anchor Resolution for 161441572', async () => {
  const dbDoc = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
  const res = await decodeStihlCode(TARGET_SERIAL, dbDoc);

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.serialResolution.matchType, 'OFFICIAL_ANCHOR_MATCH');
  assert.strictEqual(res.sourceStatus, 'OFFICIAL_STIHL_LOOKUP');
  assert.strictEqual(res.model, 'MS 260 C-B .325" P Motorsäge');
  assert.strictEqual(res.exactModel, 'MS 260 C-B .325" P Motorsäge');
  assert.strictEqual(res.canonicalModelPath, '/kettingzagen/ms-260/');
  assert.strictEqual(res.factory.code, '1');
  assert.strictEqual(res.factory.country, 'Duitsland');
  assert.strictEqual(res.factory.location, 'Waiblingen');
  assert.strictEqual(res.counterfeitCheck.isCounterfeit, false);
});

test('4. Machine Passport ViewModel & Sales Listing Integration', () => {
  const dbDoc = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
  const salesMachines = JSON.parse(fs.readFileSync(salesMachinesPath, 'utf8'));
  const machine = salesMachines.find(m => m.serial_number === TARGET_SERIAL);

  assert.ok(machine, 'Sales machine record must exist in verified_sales_machines.json');
  assert.strictEqual(machine.asking_price_formatted, '€ 385,-');
  assert.strictEqual(machine.condition, 'volledig werkend, volgens verkoper');
  assert.strictEqual(machine.location, 'Coevorden');

  const passportUrl = `https://www.stihldecoder.nl/paspoort/${TARGET_SERIAL}/`;
  const vm = buildPassportViewModel({
    serialNumber: TARGET_SERIAL,
    model: machine.official_product_name,
    canonicalModelId: machine.canonical_model_id,
    identitySource: 'OFFICIAL_STIHL_LOOKUP',
    category: machine.category,
    publicPassportUrl: passportUrl,
    salesListing: {
      askingPrice: machine.asking_price_formatted,
      condition: machine.condition,
      location: machine.location,
      sellerRole: machine.seller_role,
      verificationBadge: '✓ MY STIHL Modelkoppeling'
    }
  }, dbDoc);

  assert.strictEqual(vm.passportMode, 'OFFICIAL_SERIAL_VERIFIED');
  assert.strictEqual(vm.hasSerial, true);
  assert.strictEqual(vm.formattedSerial, '1 614 415 72');
  assert.strictEqual(vm.model, 'MS 260 C-B .325" P Motorsäge');
  assert.strictEqual(vm.canonicalModelName, 'MS 260');
  assert.strictEqual(vm.modelSlug, 'ms-260');
  assert.strictEqual(vm.publicUrl, passportUrl);
  assert.ok(vm.qrUrl.includes(encodeURIComponent(passportUrl)), 'QR code must encode the passport URL');

  const html = renderStihlPassportHtml(vm, dbDoc);
  assert.ok(html.includes('✓ MY STIHL Modelkoppeling'), 'Must render MY STIHL modelkoppeling badge');
  assert.ok(!html.includes('✓ Officieel STIHL'), 'Must NOT claim official STIHL certification organ');
  assert.ok(html.includes('1 614 415 72'), 'Must render formatted serial');
  assert.ok(html.includes('€ 385,-'), 'Must render asking price');
  assert.ok(html.includes('Coevorden'), 'Must render location');
  assert.ok(html.includes('volledig werkend, volgens verkoper'), 'Must render condition');
});

test('5. Photo Physical Presence & Reachability on Disk', () => {
  const salesMachines = JSON.parse(fs.readFileSync(salesMachinesPath, 'utf8'));
  const machine = salesMachines.find(m => m.serial_number === TARGET_SERIAL);

  const photoDir = path.join(rootDir, 'public', 'sales', TARGET_SERIAL);
  assert.ok(fs.existsSync(photoDir), 'Directory public/sales/161441572 must exist');

  // Verify all 4 expected photos exist with non-zero bytes
  const expectedPhotos = [
    'IMG_20261103_234758_505.jpg',
    'IMG_20261103_234821_680.jpg',
    'IMG_20261103_234839_810.jpg',
    'IMG_20261103_234923_509.jpg'
  ];

  for (const filename of expectedPhotos) {
    const filePath = path.join(photoDir, filename);
    assert.ok(fs.existsSync(filePath), `Photo ${filename} must physically exist`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 100000, `Photo ${filename} must be valid size (>100KB)`);
  }

  const status = checkSalesPhotosReachability(TARGET_SERIAL, machine.photos);
  assert.strictEqual(status.totalCount, 4);
  assert.strictEqual(status.reachableCount, 4);
  assert.strictEqual(status.allReachable, true, 'All 4 photos must be reported reachable');

  const pageHtml = renderUniversalPassportPageHtml({
    idOrSerial: TARGET_SERIAL,
    machine,
    database: {},
    baseUrl: 'https://www.stihldecoder.nl'
  });

  assert.ok(pageHtml.includes('✓ 4 foto&#39;s online') || pageHtml.includes("✓ 4 foto's online"), 'Must report 4 photos online');
  assert.ok(pageHtml.includes('IMG_20261103_234758_505.jpg'));
  assert.ok(pageHtml.includes('IMG_20261103_234821_680.jpg'));
  assert.ok(pageHtml.includes('IMG_20261103_234839_810.jpg'));
  assert.ok(pageHtml.includes('IMG_20261103_234923_509.jpg'));
});

test('6. Complete Sales Advertisement Generation (Marktplaats / 2dehands)', () => {
  const salesMachines = JSON.parse(fs.readFileSync(salesMachinesPath, 'utf8'));
  const machine = salesMachines.find(m => m.serial_number === TARGET_SERIAL);

  const advert = generateSalesAdvertText(machine, 'https://www.stihldecoder.nl');

  assert.ok(advert.includes('STIHL MS 260 C-B'));
  assert.ok(advert.includes('€ 385,-'));
  assert.ok(advert.includes('Coevorden'));
  assert.ok(advert.includes('161441572'));
  assert.ok(advert.includes('50,2 cc'));
  assert.ok(advert.includes('2,6 kW / 3,5 pk'));
  assert.ok(advert.includes('.325" P'));
  assert.ok(advert.includes('https://www.stihldecoder.nl/paspoort/161441572/'));
  assert.ok(advert.includes('StopHeling.nl'));
  assert.ok(advert.includes('geen officieel certificeringsorgaan van Andreas Stihl AG & Co. KG'));

  // ZERO unproven theft claims
  assert.ok(!advert.includes('Geen geregistreerde diefstal bekend'), 'Must NOT claim unproven theft-free guarantee');
  // ZERO PII check
  assert.ok(!advert.includes('screenshot'), 'Must NOT mention private screenshot file');
  assert.ok(!advert.includes('@'), 'Must NOT contain seller email');
  assert.ok(!advert.includes('password'), 'Must NOT contain account credentials');
});

test('7. HTTP Server Routes: /paspoort/161441572/ & Static Photo Delivery', async () => {
  const fetchLocal = async (pathname) => {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:3000${pathname}`, (res) => {
        const chunks = [];
        res.on('data', chunk => { chunks.push(chunk); });
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: buffer.toString('utf8'),
            byteLength: buffer.length
          });
        });
      });
      req.on('error', reject);
    });
  };

  // 1. Passport page HTML
  const resPassport = await fetchLocal('/paspoort/161441572/');
  assert.strictEqual(resPassport.statusCode, 200);
  assert.ok(resPassport.headers['content-type'].includes('text/html'));
  assert.ok(resPassport.body.includes('STIHL MS 260 C-B'));
  assert.ok(resPassport.body.includes('161441572'));
  assert.ok(resPassport.body.includes('€ 385,-'));
  assert.ok(resPassport.body.includes('Coevorden'));
  assert.ok(resPassport.body.includes('/sales/161441572/IMG_20261103_234758_505.jpg'));
  assert.ok(resPassport.body.includes('/sales/161441572/IMG_20261103_234821_680.jpg'));
  assert.ok(resPassport.body.includes('/sales/161441572/IMG_20261103_234839_810.jpg'));
  assert.ok(resPassport.body.includes('/sales/161441572/IMG_20261103_234923_509.jpg'));

  // 2. Static JPG Photo delivery via HTTP
  const resPhoto1 = await fetchLocal('/sales/161441572/IMG_20261103_234758_505.jpg');
  assert.strictEqual(resPhoto1.statusCode, 200);
  assert.strictEqual(resPhoto1.headers['content-type'], 'image/jpeg');
  assert.strictEqual(resPhoto1.byteLength, 2275207, 'Photo 1 must match exact byte size');

  const resPhoto4 = await fetchLocal('/sales/161441572/IMG_20261103_234923_509.jpg');
  assert.strictEqual(resPhoto4.statusCode, 200);
  assert.strictEqual(resPhoto4.headers['content-type'], 'image/jpeg');
  assert.strictEqual(resPhoto4.byteLength, 2119219, 'Photo 4 must match exact byte size');

  // 3. Verkoop alias
  const resVerkoop = await fetchLocal('/verkoop/161441572/');
  assert.strictEqual(resVerkoop.statusCode, 200);
  assert.ok(resVerkoop.body.includes('STIHL MS 260 C-B'));

  // 4. Non-trailing slash redirect check
  const resRedirect = await fetchLocal('/paspoort/161441572');
  assert.strictEqual(resRedirect.statusCode, 301);
  assert.ok(resRedirect.headers.location.endsWith('/paspoort/161441572/'));
});

test('8. Uniform Passport Architecture: Standard vs Sales Extension Parity', () => {
  // A: Normal user passport without sales
  const normalMachine = {
    serial_number: '123456789',
    normalized_model: 'MS 261 C-M',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    canonical_model_id: 'stihl_ms_261',
    sales: { is_for_sale: false }
  };
  const normalHtml = renderUniversalPassportPageHtml({
    idOrSerial: '123456789',
    machine: normalMachine,
    database: {},
    baseUrl: 'https://www.stihldecoder.nl'
  });

  // Must contain core passport components
  assert.ok(normalHtml.includes('STIHL MS 261 C-M'), 'Renders model name');
  assert.ok(normalHtml.includes('Digitaal Machinepaspoort'), 'Renders passport card');
  assert.ok(normalHtml.includes('Deelbaar Machinepaspoort &amp; QR-Code') || normalHtml.includes('Deelbaar Machinepaspoort & QR-Code'), 'Renders QR code section');
  assert.ok(normalHtml.includes('/paspoort/123456789/'), 'Renders canonical passport URL');
  
  // Must NOT contain sales offering block
  assert.ok(!normalHtml.includes('🏷️ Te koop aangeboden'), 'No sales badge on standard passport');
  assert.ok(!normalHtml.includes('Verkoopadvertentie Genereren'), 'No advert tool on standard passport');

  // B: Machine with sales listing enabled
  const salesMachine = {
    serial_number: '123456789',
    normalized_model: 'MS 261 C-M',
    category: 'Kettingzaag',
    category_slug: 'kettingzagen',
    canonical_model_id: 'stihl_ms_261',
    sales: {
      is_for_sale: true,
      asking_price: '€ 450,-',
      condition: 'Zo goed als nieuw',
      location: 'Utrecht',
      description: 'Zelden gebruikt',
      photos: []
    }
  };
  const salesHtml = renderUniversalPassportPageHtml({
    idOrSerial: '123456789',
    machine: salesMachine,
    database: {},
    baseUrl: 'https://www.stihldecoder.nl'
  });

  // Must contain both core passport AND sales section
  assert.ok(salesHtml.includes('STIHL MS 261 C-M'), 'Renders model name');
  assert.ok(salesHtml.includes('Digitaal Machinepaspoort'), 'Renders passport card');
  assert.ok(salesHtml.includes('🏷️ Te koop aangeboden'), 'Renders sales badge');
  assert.ok(salesHtml.includes('€ 450,-'), 'Renders asking price');
  assert.ok(salesHtml.includes('Zo goed als nieuw'), 'Renders condition');
  assert.ok(salesHtml.includes('Utrecht'), 'Renders location');
  assert.ok(salesHtml.includes('Verkoopadvertentie Genereren'), 'Renders sales advert generator');

  // C: SalesPassportPageTemplate.js re-exports UniversalPassportPageTemplate.js
  const reExportHtml = renderSalesPassportPageHtml({
    idOrSerial: '123456789',
    machine: salesMachine,
    database: {},
    baseUrl: 'https://www.stihldecoder.nl'
  });
  assert.strictEqual(reExportHtml, salesHtml, 'SalesPassportPageTemplate and UniversalPassportPageTemplate must produce 100% identical output');
});

test('9. User Isolation & Local Storage Sales Lifecycle in MachineDossierManager', () => {
  const memoryStore = {};
  const mockStorage = {
    getItem: (key) => memoryStore[key] || null,
    setItem: (key, val) => { memoryStore[key] = String(val); },
    removeItem: (key) => { delete memoryStore[key]; }
  };

  // User 1 creates normal passport
  const dossier1 = createDossierObject({
    modelSlug: 'ms-260',
    modelName: 'MS 260',
    category: 'Kettingzaag',
    identityStatus: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
    identitySource: IDENTITY_SOURCES.EXACT_CANONICAL_DECODE,
    serialNumber: '111111111'
  });

  // User 2 creates passport
  const dossier2 = createDossierObject({
    modelSlug: 'ms-261',
    modelName: 'MS 261',
    category: 'Kettingzaag',
    identityStatus: IDENTITY_STATUSES.EXACT_MODEL_IDENTIFIED,
    identitySource: IDENTITY_SOURCES.EXACT_CANONICAL_DECODE,
    serialNumber: '222222222'
  });

  // Save both
  const rawList = [dossier1, dossier2];
  mockStorage.setItem('stihl_machine_dossiers_v2', JSON.stringify(rawList));

  // User 1 enables sales offering on dossier 1
  const updateRes1 = updateDossierSales(dossier1.dossier_id, {
    is_for_sale: true,
    asking_price: '€ 350,-',
    condition: 'Goed onderhouden',
    location: 'Groningen'
  }, mockStorage);

  assert.strictEqual(updateRes1.success, true);
  assert.strictEqual(updateRes1.dossier.sales.is_for_sale, true);
  assert.strictEqual(updateRes1.dossier.sales.asking_price, '€ 350,-');

  // Verify User 2's dossier is untouched (User isolation)
  const savedDossiers = JSON.parse(mockStorage.getItem('stihl_machine_dossiers_v2'));
  const user2Saved = savedDossiers.find(d => d.dossier_id === dossier2.dossier_id);
  assert.strictEqual(user2Saved.sales.is_for_sale, false, 'User 2 sales status remains untouched');
  assert.strictEqual(user2Saved.sales.asking_price, null, 'User 2 price remains null');

  // User 1 toggles sales offering off
  const updateResToggleOff = updateDossierSales(dossier1.dossier_id, {
    is_for_sale: false
  }, mockStorage);
  assert.strictEqual(updateResToggleOff.success, true);
  assert.strictEqual(updateResToggleOff.dossier.sales.is_for_sale, false);

  // Close server cleanly at end of test run
  server.close();
});
