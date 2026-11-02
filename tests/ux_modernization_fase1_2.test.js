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
database.public_evidence = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf-8'));

test('UX Modernisering Fase 1: Homepage hero visual hierarchy & prominent search', () => {
  // Title & Subtitle
  assert.ok(indexHtml.includes('STIHL Decoder'), 'Must contain modernized title "STIHL Decoder"');
  assert.ok(
    indexHtml.includes('Vind jouw STIHL-machine, onderdelen en technische informatie.'),
    'Must contain subtitle "Vind jouw STIHL-machine, onderdelen en technische informatie."'
  );

  // Search input & placeholder
  assert.ok(
    indexHtml.includes('placeholder="Zoek model, onderdeelnummer of serienummer..."'),
    'Placeholder must be "Zoek model, onderdeelnummer of serienummer..."'
  );

  // Single prominent search input and button with touch targets >= 44px
  assert.ok(indexHtml.includes('id="code-input"'), 'Must have code-input element');
  assert.ok(indexHtml.includes('id="search-btn"'), 'Must have search-btn element');
  assert.ok(indexHtml.includes('min-h-[44px]'), 'Search button and controls must meet mobile touch target guidelines (>= 44px)');

  // Clickable example queries
  assert.ok(indexHtml.includes('data-code="MS 260"'), 'Must include clickable example MS 260');
  assert.ok(indexHtml.includes('data-code="FS 450"'), 'Must include clickable example FS 450');
  assert.ok(indexHtml.includes('data-code="1121 021 0800"'), 'Must include clickable example 1121 021 0800');
});

test('UX Modernisering Fase 1: Three core feature navigation cards', () => {
  assert.ok(indexHtml.includes('id="tab-intent-parts"'), 'Must include Onderdelen zoeken card');
  assert.ok(indexHtml.includes('id="tab-intent-serial"'), 'Must include Machine identificeren card');
  assert.ok(indexHtml.includes('id="tab-intent-partno"'), 'Must include Technische informatie card');
  assert.ok(indexHtml.includes('Onderdelen zoeken'), 'Must have clear label "Onderdelen zoeken"');
  assert.ok(indexHtml.includes('Machine identificeren'), 'Must have clear label "Machine identificeren"');
  assert.ok(indexHtml.includes('Technische informatie'), 'Must have clear label "Technische informatie"');
});

test('UX Modernisering Fase 1: Popular models section with canonical routes', () => {
  assert.ok(indexHtml.includes('Populaire modellen'), 'Must include Populaire modellen section');
  assert.ok(indexHtml.includes('/kettingzagen/ms-260/'), 'Must link to /kettingzagen/ms-260/');
  assert.ok(indexHtml.includes('/kettingzagen/ms-261/'), 'Must link to /kettingzagen/ms-261/');
  assert.ok(indexHtml.includes('/bosmaaiers/fs-350/'), 'Must link to /bosmaaiers/fs-350/');
  assert.ok(indexHtml.includes('/bladblazers/br-600/'), 'Must link to /bladblazers/br-600/');
  assert.ok(indexHtml.includes('FS 450'), 'Must include FS 450 query example');
});

test('UX Modernisering Fase 2: 3-level information hierarchy on search result cards', () => {
  // Serial Result Card
  assert.ok(indexHtml.includes('id="result-card"'), 'Result card must exist');
  assert.ok(indexHtml.includes('id="res-model"'), 'Level 1: res-model must exist');
  assert.ok(indexHtml.includes('id="res-confidence-badge"'), 'Level 1: res-confidence-badge must exist');
  assert.ok(indexHtml.includes('id="res-model-parts-cta"'), 'Level 1: direct parts CTA must exist');
  assert.ok(indexHtml.includes('id="res-save-dossier-btn"'), 'Level 1: save dossier CTA must exist');
  assert.ok(indexHtml.includes('id="res-specs-count-badge"'), 'Level 2: specs count badge must exist');
  assert.ok(indexHtml.includes('id="model-assist-container"'), 'Level 2: model disambiguation container must exist');
  assert.ok(indexHtml.includes('id="btn-model-not-listed"'), 'Level 2: Weet ik niet — toon alle geschikte modellen must exist');
  assert.ok(indexHtml.includes('id="res-tech-details"'), 'Level 3: collapsible tech details must exist');

  // Model Result Card
  assert.ok(indexHtml.includes('id="model-card"'), 'Model card must exist');
  assert.ok(indexHtml.includes('id="model-title-display"'), 'Level 1: model-title-display must exist');
  assert.ok(indexHtml.includes('id="model-card-parts-btn"'), 'Level 1: primary parts CTA must exist');
  assert.ok(indexHtml.includes('id="model-card-passport-btn"'), 'Level 1: secondary passport CTA must exist');
  assert.ok(indexHtml.includes('id="model-card-save-btn"'), 'Level 1: tertiary save CTA must exist');
  assert.ok(indexHtml.includes('id="model-specs-count-badge"'), 'Level 2: model specs count badge must exist');

  // Part Number Result Card (Warning Card)
  assert.ok(indexHtml.includes('id="warning-card"'), 'Warning card must exist');
  assert.ok(indexHtml.includes('id="warn-part-no"'), 'Level 1: warn-part-no must exist');
  assert.ok(indexHtml.includes('id="warn-models-list"'), 'Level 2: confirmed compatible models list must exist');
  assert.ok(indexHtml.includes('id="warn-model-group"'), 'Level 2: indicative model family group must exist');
  assert.ok(indexHtml.includes('id="warn-part-detail-cta"'), 'Level 1: direct part detail link must exist');
});

test('UX Modernisering Fase 2: Standardized trust statuses (Text + Color, never color alone)', () => {
  // Trust badges must use both text and color class combinations
  assert.ok(indexHtml.includes('✓ Geverifieerd'), 'Must define ✓ Geverifieerd status text');
  assert.ok(indexHtml.includes('✓ Door gebruiker bevestigd'), 'Must define ✓ Door gebruiker bevestigd status text');
  assert.ok(indexHtml.includes('≈ Waarschijnlijk'), 'Must define ≈ Waarschijnlijk status text');
  assert.ok(indexHtml.includes('? Onbekend'), 'Must define ? Onbekend status text');

  // Unknown serial numbers must never be labeled counterfeit
  assert.ok(!indexHtml.includes('Onbekend = Namaak'), 'Unknown must never equate to counterfeit');
  assert.ok(indexHtml.includes('counterfeit-card'), 'Counterfeit card is strictly reserved for known fake serial numbers');
});

test('UX Modernisering Fase 2: Cleaner specs display & count badge logic', () => {
  // Verify decoder produces specs for confirmed serial
  const confirmedRes = decodeStihlCode('184592301', database, { confirmedModel: 'MS 261 C-M' });
  assert.equal(confirmedRes.success, true);
  assert.ok(confirmedRes.technicalSpecs, 'Technical specs must be present for confirmed MS 261 C-M');
  assert.ok(Number(confirmedRes.technicalSpecs.displacement_cc) > 0, 'Displacement cc must be populated');

  // Verify specs count badge text pattern exists in client script
  assert.ok(indexHtml.includes('specificaties beschikbaar'), 'Must format specs badge as "X van Y specificaties beschikbaar"');
});

test('UX Modernisering Fase 2: Disambiguation flow ("Weet ik niet — toon alle geschikte modellen")', () => {
  assert.ok(
    indexHtml.includes('Weet ik niet — toon alle geschikte modellen'),
    'Disambiguation helper button text must be exact'
  );
  assert.ok(
    indexHtml.includes('btnModelNotListed.onclick'),
    'Disambiguation button click listener must be bound'
  );
});

test('UX Modernisering Fase 2: Invariants preserved (Affiliate, SEO, Privacy)', async () => {
  // Affiliate disclosure invariant in HTML
  assert.ok(indexHtml.includes('Amazon Partnerverklaring'), 'Affiliate declaration must be preserved');
  assert.ok(indexHtml.includes('As an Amazon Associate I earn from qualifying purchases'), 'Amazon Associate clause must be preserved');

  // Tracking tag architecture invariant (strictly from environment, never leaked into index.html)
  const prevTag = process.env.AMAZON_ASSOCIATE_TAG;
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  const { AmazonAffiliateProvider } = await import('../src/affiliate/AmazonAffiliateProvider.js');
  const provider = new AmazonAffiliateProvider();
  assert.equal(provider.getAssociateTag('amazon.nl'), 'srihldecoder2-21', 'Provider must read configured tracking tag from environment');
  if (prevTag) process.env.AMAZON_ASSOCIATE_TAG = prevTag; else delete process.env.AMAZON_ASSOCIATE_TAG;

  // StopHeling invariant
  assert.ok(indexHtml.includes('StopHeling'), 'StopHeling guidance and links must be preserved');

  // Cookie consent invariant
  assert.ok(indexHtml.includes('cookie-consent-banner'), 'Cookie consent banner must be preserved');
});
