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
  renderSalesPassportPageHtml
} from '../src/components/SalesPassportPageTemplate.js';
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
      verificationBadge: '✓ MY STIHL Officieel Geverifieerd'
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
  assert.ok(html.includes('✓ Officieel STIHL'), 'Must render official STIHL badge');
  assert.ok(html.includes('1 614 415 72'), 'Must render formatted serial');
  assert.ok(html.includes('€ 385,-'), 'Must render asking price');
  assert.ok(html.includes('Coevorden'), 'Must render location');
  assert.ok(html.includes('volledig werkend, volgens verkoper'), 'Must render condition');
});

test('5. Photo Reachability & Publication Status Reporting', () => {
  const salesMachines = JSON.parse(fs.readFileSync(salesMachinesPath, 'utf8'));
  const machine = salesMachines.find(m => m.serial_number === TARGET_SERIAL);

  const status = checkSalesPhotosReachability(TARGET_SERIAL, machine.photos);
  assert.strictEqual(status.totalCount, 4);
  assert.strictEqual(Array.isArray(status.photos), true);
  assert.strictEqual(status.photos.length, 4);

  // Since physical photos are pending seller file transfer, allReachable must be false and reported cleanly
  assert.strictEqual(status.allReachable, false, 'Photos are pending file transfer to public/sales/161441572/');
  assert.strictEqual(status.reachableCount, 0);

  const pageHtml = renderSalesPassportPageHtml({
    serial: TARGET_SERIAL,
    machine,
    database: {},
    baseUrl: 'https://www.stihldecoder.nl'
  });

  assert.ok(pageHtml.includes('Publicatiestatus Beeldbestanden: Fysieke Overdracht Vereist'), 'Must clearly report pending photo transfer');
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

  // ZERO PII check
  assert.ok(!advert.includes('screenshot'), 'Must NOT mention private screenshot file');
  assert.ok(!advert.includes('@'), 'Must NOT contain seller email');
  assert.ok(!advert.includes('password'), 'Must NOT contain account credentials');
});

test('7. HTTP Server Routes: /paspoort/161441572/ & /verkoop/161441572/', async () => {
  const fetchLocal = async (pathname) => {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:3000${pathname}`, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', reject);
    });
  };

  const resPassport = await fetchLocal('/paspoort/161441572/');
  assert.strictEqual(resPassport.statusCode, 200);
  assert.ok(resPassport.headers['content-type'].includes('text/html'));
  assert.ok(resPassport.body.includes('STIHL MS 260 C-B'));
  assert.ok(resPassport.body.includes('161441572'));
  assert.ok(resPassport.body.includes('€ 385,-'));
  assert.ok(resPassport.body.includes('Coevorden'));

  const resVerkoop = await fetchLocal('/verkoop/161441572/');
  assert.strictEqual(resVerkoop.statusCode, 200);
  assert.ok(resVerkoop.body.includes('STIHL MS 260 C-B'));

  // Non-trailing slash redirect check
  const resRedirect = await fetchLocal('/paspoort/161441572');
  assert.strictEqual(resRedirect.statusCode, 301);
  assert.ok(resRedirect.headers.location.endsWith('/paspoort/161441572/'));

  await new Promise((resolve) => server.close(resolve));
});
