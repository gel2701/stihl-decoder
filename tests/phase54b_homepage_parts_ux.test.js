import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeStihlCode } from '../src/decoder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const indexPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf-8'));

test('Phase 54B: Homepage Hero headline and subtext communicating 3 intents', () => {
  assert.ok(
    indexHtml.includes('Zoek op serienummer, onderdeelnummer of model'),
    'Hero headline must clearly state: Zoek op serienummer, onderdeelnummer of model'
  );
  assert.ok(
    indexHtml.includes('Controleer een STIHL machine op serienummer, zoek een onderdeelnummer op of voer een model zoals MS 200 of FS 55 in om passende onderdelen te vinden.'),
    'Hero subtext must explicitly mention model -> parts discovery'
  );
});

test('Phase 54B: Search placeholder and helper text', () => {
  assert.ok(
    indexHtml.includes('placeholder="Bijv. MS 200, FS 55, 1123 020 1200 of 163130555"'),
    'Placeholder must contain model, part number, and serial number examples'
  );
  assert.ok(
    indexHtml.includes('id="search-helper-text"'),
    'Helper text container must exist'
  );
  assert.ok(
    indexHtml.includes('Typ een model voor onderdelen, een onderdeelnummer voor pasvorm, of een serienummer voor machine-identificatie.'),
    'Helper text must explain the 3 search intents clearly'
  );
});

test('Phase 54B: Search intent quick-action buttons control', () => {
  assert.ok(indexHtml.includes('id="tab-intent-parts"'), 'Onderdelen zoeken button must exist');
  assert.ok(indexHtml.includes('id="tab-intent-serial"'), 'Serienummer controleren button must exist');
  assert.ok(indexHtml.includes('id="tab-intent-partno"'), 'Onderdeelnummer opzoeken button must exist');
  assert.ok(indexHtml.includes('role="group"'), 'Group role must exist for accessibility');
  assert.ok(indexHtml.includes('aria-label="Snelle zoekintenties"'), 'Accessible label must exist');
});

test('Phase 54B: Dynamic button text container and example buttons', () => {
  assert.ok(indexHtml.includes('id="search-btn-text"'), 'Search button text container must exist');
  assert.ok(indexHtml.includes('data-code="MS 200"'), 'Example button for MS 200 must exist');
  assert.ok(indexHtml.includes('data-code="1121 021 0800"'), 'Example button for 1121 021 0800 must exist');
  assert.ok(indexHtml.includes('data-code="163130555"'), 'Example button for 163130555 must exist');
});

test('Phase 54B: Dynamic CTA intent detection logic', () => {
  // Replicating the client-side intent detection function for contract testing
  function detectSearchIntent(raw) {
    if (!raw || !raw.trim()) return 'empty';
    const val = raw.trim().replace(/^STIHL[\s_\-]+/i, '').trim();
    const digitsOnly = val.replace(/[^0-9]/g, '');

    if (digitsOnly.length === 11) return 'part';
    if (digitsOnly.length === 9 && !/[a-zA-Z]/.test(val)) return 'serial';
    if (/^0[0-9]{2}(\s*[a-zA-Z]+)?$/i.test(val)) return 'model';
    if (/^(ms|fs|bg|br|ts|bt|ht|hs|hl|fc|km|mm|rt|se|sh|sg|re|fse|mse|bga|fsa|msa|hla|hsa|kma|tsa|rma|gta)\s*[-]?\s*\d+/i.test(val)) return 'model';
    if (/^[a-zA-Z]{1,4}\s*[-]?\s*\d+/i.test(val)) return 'model';
    if (/^[A-Za-z0-9]{8,10}$/.test(val) && /[a-zA-Z]/.test(val) && /\d/.test(val) && digitsOnly.length >= 7) return 'serial';
    if (/^\d{4}[\s.-]?\d{3}[\s.-]?\d{4}$/.test(val)) return 'part';
    if (/[a-zA-Z]/.test(val)) return 'model';
    if (digitsOnly.length >= 8 && digitsOnly.length <= 10) return 'serial';
    return 'unknown';
  }

  function getButtonLabel(intent) {
    if (intent === 'model') return 'Zoek onderdelen';
    if (intent === 'part') return 'Zoek onderdeel';
    if (intent === 'serial') return 'Controleer serienummer';
    return 'Zoeken';
  }

  // Model queries
  assert.equal(getButtonLabel(detectSearchIntent('MS200')), 'Zoek onderdelen');
  assert.equal(getButtonLabel(detectSearchIntent('MS 200')), 'Zoek onderdelen');
  assert.equal(getButtonLabel(detectSearchIntent('FS 55')), 'Zoek onderdelen');
  assert.equal(getButtonLabel(detectSearchIntent('026')), 'Zoek onderdelen');
  assert.equal(getButtonLabel(detectSearchIntent('BR 600')), 'Zoek onderdelen');

  // Part numbers
  assert.equal(getButtonLabel(detectSearchIntent('1123 020 1200')), 'Zoek onderdeel');
  assert.equal(getButtonLabel(detectSearchIntent('11231602050')), 'Zoek onderdeel');
  assert.equal(getButtonLabel(detectSearchIntent('1121 021 0800')), 'Zoek onderdeel');

  // Serials
  assert.equal(getButtonLabel(detectSearchIntent('163130555')), 'Controleer serienummer');
  assert.equal(getButtonLabel(detectSearchIntent('184592301')), 'Controleer serienummer');

  // Empty
  assert.equal(getButtonLabel(detectSearchIntent('')), 'Zoeken');
  assert.equal(getButtonLabel(detectSearchIntent('   ')), 'Zoeken');
});

test('Phase 54B: Decoder resolution attaches canonical model and parts path for model queries', () => {
  const resMS200 = decodeStihlCode('MS 200', database);
  assert.equal(resMS200.success, true);
  assert.equal(resMS200.type, 'MODEL_DECODE');
  assert.equal(resMS200.canonicalPartsPath, '/kettingzagen/ms-200/onderdelen/');
  assert.equal(resMS200.canonicalModelPath, '/kettingzagen/ms-200/');

  const resMS261 = decodeStihlCode('MS 261', database);
  assert.equal(resMS261.success, true);
  assert.equal(resMS261.type, 'MODEL_DECODE');
  assert.equal(resMS261.canonicalPartsPath, '/kettingzagen/ms-261/onderdelen/');

  const resFS55 = decodeStihlCode('FS 55', database);
  assert.equal(resFS55.success, true);
  assert.equal(resFS55.type, 'MODEL_DECODE');
  assert.equal(resFS55.canonicalPartsPath, '/bosmaaiers/fs-55/onderdelen/');

  const resBR600 = decodeStihlCode('BR 600', database);
  assert.equal(resBR600.success, true);
  assert.equal(resBR600.type, 'MODEL_DECODE');
  assert.equal(resBR600.canonicalPartsPath, '/bladblazers/br-600/onderdelen/');
});

test('Phase 54B: Model card contains primary parts CTA, secondary passport CTA, tertiary save CTA, and bottom banner', () => {
  assert.ok(indexHtml.includes('id="model-card-parts-btn"'), 'Primary parts CTA must exist in model-card');
  assert.ok(indexHtml.includes('id="model-card-parts-btn-context"'), 'Parts button context must exist');
  assert.ok(indexHtml.includes('id="model-card-passport-btn"'), 'Secondary passport CTA must exist');
  assert.ok(indexHtml.includes('id="model-card-save-btn"'), 'Tertiary save CTA must exist');
  assert.ok(indexHtml.includes('id="model-card-intent-notice"'), 'Model intent notice must exist');
  assert.ok(
    indexHtml.includes('Model gevonden: Bekijk passende onderdelen, technische gegevens en machine-informatie.'),
    'Model intent notice must state: Model gevonden: Bekijk passende onderdelen, technische gegevens en machine-informatie.'
  );
  assert.ok(indexHtml.includes('id="model-card-parts-banner"'), 'Bottom parts banner must exist in model card');
  assert.ok(indexHtml.includes('id="model-card-bottom-parts-btn"'), 'Bottom parts button must exist');
});

test('Phase 54B: Serial result card includes parts link when model is identified', () => {
  assert.ok(indexHtml.includes('id="res-model-parts-cta"'), 'Serial result parts CTA container must exist');
  assert.ok(indexHtml.includes('id="res-model-parts-link"'), 'Serial result parts link must exist');

  // Verify decoder attaches canonicalPartsPath for serial with confirmed model
  const serialRes = decodeStihlCode('184592301', database, { confirmedModel: 'MS 261 C-M' });
  assert.equal(serialRes.success, true);
  assert.equal(serialRes.canonicalPartsPath, '/kettingzagen/ms-261-c-m/onderdelen/');
});

test('Phase 54B: Catalog alias resolution for composite model names (MS 200, MS 290, MS 360, MS 460, FS 460)', async () => {
  const { PartCatalogResolver } = await import('../src/parts/PartCatalogResolver.js');
  const { renderModelPartsPageHtml } = await import('../src/components/ModelPartsPageTemplate.js');

  // MS 200 / 020 T composite resolution
  const m200 = database.models.find(m => m.slug === 'ms-200');
  assert.ok(m200, 'ms-200 must exist in database');
  assert.equal(m200.model_name, 'MS 200 / 020 T');

  assert.equal(PartCatalogResolver.hasPartsForModel(m200, database), true);
  assert.equal(PartCatalogResolver.hasPartsForModel('MS 200 / 020 T', database), true);
  assert.equal(PartCatalogResolver.hasPartsForModel('MS 200', database), true);

  const sectionsComposite = PartCatalogResolver.getSectionsForModel('MS 200 / 020 T', null, null, database);
  assert.equal(sectionsComposite.length, 2);
  const totalParts = sectionsComposite.reduce((acc, s) => acc + s.parts.length, 0);
  assert.equal(totalParts, 201);

  // Rendered HTML contains catalog table
  const html200 = renderModelPartsPageHtml(m200, database);
  assert.ok(html200.includes('Canonieke Onderdelencatalogus'), 'Must render catalog section for MS 200');
  assert.ok(html200.includes('201 onderdelen'), 'Must show 201 onderdelen count');

  // Stale parts links for manual model overrides in index.html
  assert.ok(
    indexHtml.includes("if (resPartsCta) resPartsCta.classList.add('hidden');"),
    'res-model-parts-cta must be explicitly hidden on manual model override and reset'
  );
});
