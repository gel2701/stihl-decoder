import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeStihlCode } from '../src/decoder.js';
import { getDirectPartsForModel, COMPATIBILITY_TIERS, MACHINE_CATEGORIES } from '../src/parts/DirectPartsEngine.js';
import { defaultVerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const indexPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf-8'));
database.public_evidence = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf-8'));

test('Phase 3 - Model Direct Parts: MS 260 chainsaw maintenance parts & category isolation', () => {
  const modelObj = database.models.find(m => m.model_name === 'MS 260');
  assert.ok(modelObj, 'MS 260 model must exist in database');

  const res = getDirectPartsForModel(modelObj, {}, database);
  assert.equal(res.available, true, 'MS 260 direct parts must be available');
  assert.equal(res.machine_category, MACHINE_CATEGORIES.CHAINSAW, 'MS 260 must be classified as CHAINSAW');
  assert.ok(res.parts.length >= 4, 'Must return at least 4 maintenance parts');

  const partNames = res.parts.map(p => p.part_name.toLowerCase());
  const categories = res.parts.map(p => p.category_label.toLowerCase());

  // Must contain chainsaw wear & maintenance items
  assert.ok(partNames.some(n => n.includes('spark') || n.includes('bougie') || categories.includes('ontsteking')), 'Must include spark plug');
  assert.ok(partNames.some(n => n.includes('filter') || categories.includes('filters')), 'Must include air/fuel filter');
  assert.ok(partNames.some(n => n.includes('guide bar') || n.includes('bar') || n.includes('ketting') || categories.includes('zaaguitrusting')), 'Must include cutting gear');

  // Strict negative isolation: NO brushcutter or blower parts
  assert.ok(!partNames.some(n => n.includes('mowing head') || n.includes('maaikop')), 'Chainsaw must NEVER have mowing head');
  assert.ok(!partNames.some(n => n.includes('strimmer') || n.includes('maaidraad')), 'Chainsaw must NEVER have trimmer line');
  assert.ok(!partNames.some(n => n.includes('blower tube') || n.includes('blaasbuis')), 'Chainsaw must NEVER have blower tube');
});

test('Phase 3 - Model Direct Parts: FS 350 / FS 450 brushcutter maintenance parts & category isolation', () => {
  const modelObj = database.models.find(m => m.model_name === 'FS 350' || m.model_name.startsWith('FS 350')) || 'FS 350';
  const res = getDirectPartsForModel(modelObj, {}, database);

  assert.equal(res.available, true, 'FS 350 direct parts must be available');
  assert.equal(res.machine_category, MACHINE_CATEGORIES.BRUSHCUTTER, 'FS 350 must be classified as BRUSHCUTTER');
  assert.ok(res.parts.length >= 4, 'Must return at least 4 maintenance parts');

  const partNames = res.parts.map(p => p.part_name.toLowerCase());

  // Must contain brushcutter items
  assert.ok(partNames.some(n => n.includes('mowing head') || n.includes('autocut') || n.includes('maaikop') || n.includes('guard')), 'Must include mowing head or guard');

  // Strict negative isolation: NO chainsaw cutting equipment
  assert.ok(!partNames.some(n => n.includes('guide bar') || n.includes('zaagblad')), 'Brushcutter must NEVER have guide bar');
  assert.ok(!partNames.some(n => n.includes('saw chain') || n.includes('zaagketting')), 'Brushcutter must NEVER have saw chain');
  assert.ok(!partNames.some(n => n.includes('chain sprocket') || n.includes('kettingwiel')), 'Brushcutter must NEVER have chain sprocket');
  assert.ok(!partNames.some(n => n.includes('chain brake') || n.includes('kettingrem')), 'Brushcutter must NEVER have chain brake');
});

test('Phase 3 - Model Direct Parts: BR 600 blower maintenance parts & category isolation', () => {
  const modelObj = database.models.find(m => m.model_name === 'BR 600') || 'BR 600';
  const res = getDirectPartsForModel(modelObj, {}, database);

  assert.equal(res.available, true, 'BR 600 direct parts must be available');
  assert.equal(res.machine_category, MACHINE_CATEGORIES.BLOWER, 'BR 600 must be classified as BLOWER');

  const partNames = res.parts.map(p => p.part_name.toLowerCase());

  // Strict negative isolation: NO chainsaw or brushcutter equipment
  assert.ok(!partNames.some(n => n.includes('guide bar') || n.includes('zaagblad')), 'Blower must NEVER have guide bar');
  assert.ok(!partNames.some(n => n.includes('saw chain') || n.includes('zaagketting')), 'Blower must NEVER have saw chain');
  assert.ok(!partNames.some(n => n.includes('mowing head') || n.includes('maaikop')), 'Blower must NEVER have mowing head');
});

test('Phase 3 - Model Direct Parts: FSA 45 cordless machine has zero petrol parts', () => {
  const modelObj = database.models.find(m => m.model_name === 'FSA 45') || 'FSA 45';
  const res = getDirectPartsForModel(modelObj, {}, database);

  assert.equal(res.available, true, 'FSA 45 direct parts must be available');
  const partNames = res.parts.map(p => p.part_name.toLowerCase());

  // Strict drive isolation: ZERO petrol combustion parts
  assert.ok(!partNames.some(n => n.includes('spark') || n.includes('bougie')), 'Battery machine must NEVER have spark plug');
  assert.ok(!partNames.some(n => n.includes('carburetor') || n.includes('carburateur')), 'Battery machine must NEVER have carburetor');
  assert.ok(!partNames.some(n => n.includes('fuel filter') || n.includes('brandstoffilter')), 'Battery machine must NEVER have petrol fuel filter');
});

test('Phase 3 - Compatibility Tiers & Absolute Fitment Wording Protection', () => {
  const modelObj = database.models.find(m => m.model_name === 'MS 261') || 'MS 261';
  const res = getDirectPartsForModel(modelObj, {}, database);

  for (const part of res.parts) {
    // Only CONFIRMED or INDICATIVE tiers are permitted in primary selection
    assert.ok(
      part.compatibility_tier === COMPATIBILITY_TIERS.CONFIRMED || part.compatibility_tier === COMPATIBILITY_TIERS.INDICATIVE,
      `Part ${part.part_number} must have CONFIRMED or INDICATIVE compatibility tier`
    );

    // Absolute phrasing prohibition
    assert.ok(!part.compatibility_badge_text.includes('Gegarandeerd passend'), 'Must not claim absolute guaranteed fitment');
    assert.ok(!part.compatibility_badge_text.includes('Gegarandeerde compatibiliteit'), 'Must not claim guaranteed compatibility');
    assert.ok(
      part.compatibility_badge_text.includes('Bevestigde compatibiliteit') || part.compatibility_badge_text.includes('Indicatieve compatibiliteit'),
      'Must use Bevestigde or Indicatieve compatibiliteit'
    );
  }
});

test('Phase 3 - Exploded Diagram Links Integration', () => {
  const modelObj = database.models.find(m => m.model_name === 'MS 261') || 'MS 261';
  const res = getDirectPartsForModel(modelObj, {}, database);

  // At least one part with a meaningful diagram section must have an exploded view link
  const partsWithDiagram = res.parts.filter(p => p.diagram_url !== null);
  assert.ok(partsWithDiagram.length > 0, 'MS 261 must have parts with diagram links');

  for (const p of partsWithDiagram) {
    assert.ok(p.diagram_url.includes('#section-'), 'Diagram URL must target #section anchor');
    assert.ok(p.diagram_section_name, 'Part with diagram URL must specify diagram section name');
  }

  // Parts without specific diagram section must have null diagram_url (no phantom links)
  const partsWithoutDiagram = res.parts.filter(p => p.diagram_url === null);
  for (const p of partsWithoutDiagram) {
    assert.equal(p.diagram_section_name, null, 'Part without diagram link must have null section name');
  }
});

test('Phase 3 - Amazon Affiliate Link Integrity & Tracking Tag srihldecoder2-21', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  const modelObj = database.models.find(m => m.model_name === 'MS 260') || 'MS 260';
  const res = getDirectPartsForModel(modelObj, {}, database);

  for (const part of res.parts) {
    if (part.purchase_url) {
      assert.ok(part.purchase_url.includes('tag=srihldecoder2-21'), 'Purchase URL must use configured tag srihldecoder2-21');
      assert.ok(part.purchase_url.startsWith('https://amazon.nl/'), 'Purchase URL must be amazon.nl');
      assert.ok(
        part.purchase_label === 'Bekijk product op Amazon' || part.purchase_label === 'Zoek op Amazon',
        'Purchase label must be clear commercial disclosure'
      );
    }
  }
});

test('Phase 3 - Decoder Integration: decodeStihlCode returns directParts for models and anchored serials', () => {
  // 1. Model Query
  const modelRes = decodeStihlCode('MS 260', database);
  assert.equal(modelRes.success, true);
  assert.equal(modelRes.type, 'MODEL_DECODE');
  assert.ok(modelRes.directParts, 'MODEL_DECODE must attach directParts');
  assert.equal(modelRes.directParts.available, true);
  assert.ok(modelRes.directParts.parts.length >= 4);

  // 2. Anchored Serial Query (163118080 = MS 440 Magnum)
  const serialRes = decodeStihlCode('163118080', database);
  assert.equal(serialRes.success, true);
  assert.equal(serialRes.type, 'SERIAL_NUMBER');
  assert.ok(serialRes.directParts, 'Anchored serial must attach directParts for identified model');
  assert.equal(serialRes.directParts.available, true);

  // 3. Ambiguous unanchored serial without confirmed model
  const unanchoredRes = decodeStihlCode('160500000', database);
  assert.equal(unanchoredRes.success, true);
  assert.equal(unanchoredRes.directParts, null, 'Unconfirmed ambiguous serial must not attach unevidenced directParts');
});

test('Phase 3 - UI Template Invariants: Direct Parts Sections & All-Parts CTAs in index.html', () => {
  // Elements in index.html
  assert.ok(indexHtml.includes('id="model-direct-parts-section"'), 'Must have model-direct-parts-section container');
  assert.ok(indexHtml.includes('id="model-direct-parts-title-model"'), 'Must have model-direct-parts-title-model element');
  assert.ok(indexHtml.includes('id="model-direct-parts-grid"'), 'Must have model-direct-parts-grid element');
  assert.ok(indexHtml.includes('id="model-direct-parts-all-btn"'), 'Must have model-direct-parts-all-btn CTA element');

  assert.ok(indexHtml.includes('id="res-direct-parts-section"'), 'Must have res-direct-parts-section container');
  assert.ok(indexHtml.includes('id="res-direct-parts-title-model"'), 'Must have res-direct-parts-title-model element');
  assert.ok(indexHtml.includes('id="res-direct-parts-grid"'), 'Must have res-direct-parts-grid element');
  assert.ok(indexHtml.includes('id="res-direct-parts-all-btn"'), 'Must have res-direct-parts-all-btn CTA element');

  // Wording invariants
  assert.ok(indexHtml.includes('Onderdelen voor jouw STIHL'), 'Must contain section title "Onderdelen voor jouw STIHL"');
  assert.ok(indexHtml.includes('Bekijk alle onderdelen voor'), 'Must contain CTA "Bekijk alle onderdelen voor"');
  assert.ok(indexHtml.includes('Bekijk in explosietekening'), 'Must contain exploded diagram action "Bekijk in explosietekening"');

  // Regression safety: absolute phrasing prohibition
  assert.ok(!indexHtml.includes('Gegarandeerd passend'), 'Must not contain "Gegarandeerd passend"');
  assert.ok(!indexHtml.includes('Gegarandeerde compatibiliteit'), 'Must not contain "Gegarandeerde compatibiliteit"');
  assert.ok(indexHtml.includes('Bevestigde compatibiliteit'), 'Must use "Bevestigde compatibiliteit"');
});
