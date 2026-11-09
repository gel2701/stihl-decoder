import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeStihlCode } from '../src/decoder.js';
import {
  sanitizeSearchQuery,
  correctQueryTypos,
  detectSearchIntent,
  searchIntelligentModels,
  getAutocompleteSuggestions,
  levenshteinDistance,
  SEARCH_INTENTS,
  MATCH_TYPES
} from '../src/search/IntelligentSearchEngine.js';
import { defaultVerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const indexPath = path.join(rootDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf-8'));
database.public_evidence = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf-8'));

test('Phase 4 - Unit: Levenshtein distance & Typo correction', () => {
  assert.equal(levenshteinDistance('MS 260', 'MS 260'), 0);
  assert.equal(levenshteinDistance('MS 260', 'MS 261'), 1);
  assert.equal(levenshteinDistance('MS 250', 'MS 2500'), 1);

  // Character swaps (O -> 0)
  const typoO1 = correctQueryTypos('MS 26O');
  assert.equal(typoO1.corrected, 'MS 260');
  assert.equal(typoO1.hasTypo, true);
  assert.equal(typoO1.typoType, 'ZERO_O_SUBSTITUTION');

  const typoO2 = correctQueryTypos('FS 45O');
  assert.equal(typoO2.corrected, 'FS 450');
  assert.equal(typoO2.hasTypo, true);

  const typoSuffix = correctQueryTypos('MS 261C M');
  assert.equal(typoSuffix.corrected, 'MS 261 C-M');
  assert.equal(typoSuffix.hasTypo, true);

  const clean = correctQueryTypos('ms-260');
  assert.equal(clean.corrected, 'ms-260');
  assert.equal(clean.hasTypo, false);
});

test('Phase 4 - Intent Detection: Strict guards for parts, serials, models, and ambiguous inputs', () => {
  // Part numbers: 11 digits (with or without spaces/dashes)
  assert.equal(detectSearchIntent('1121 021 0800'), SEARCH_INTENTS.PART_NUMBER);
  assert.equal(detectSearchIntent('1121-021-0800'), SEARCH_INTENTS.PART_NUMBER);
  assert.equal(detectSearchIntent('99999999999'), SEARCH_INTENTS.PART_NUMBER);

  // Serial numbers: exactly 9 digits
  assert.equal(detectSearchIntent('163118080'), SEARCH_INTENTS.SERIAL_NUMBER);
  assert.equal(detectSearchIntent('199999999'), SEARCH_INTENTS.SERIAL_NUMBER);

  // Ambiguous queries: short numbers or incomplete series
  assert.equal(detectSearchIntent('MS 26'), SEARCH_INTENTS.AMBIGUOUS_PREFIX);
  assert.equal(detectSearchIntent('260'), SEARCH_INTENTS.AMBIGUOUS_NUMERIC);
  assert.equal(detectSearchIntent('261'), SEARCH_INTENTS.AMBIGUOUS_NUMERIC);

  // Model names: direct, prefix, or normalized
  assert.equal(detectSearchIntent('MS 260'), SEARCH_INTENTS.MODEL);
  assert.equal(detectSearchIntent('FS 450'), SEARCH_INTENTS.MODEL);
  assert.equal(detectSearchIntent('026'), SEARCH_INTENTS.MODEL);
});

test('Phase 4 - Model Recognition: Exact queries (MS 260, MS 261, FS 450, 026)', async () => {
  // MS 260
  const res260 = await decodeStihlCode('MS 260', database);
  assert.equal(res260.type, 'MODEL_DECODE');
  assert.equal(res260.normalized_model, 'MS 260');
  assert.ok(res260.directParts, 'MS 260 must have direct parts');
  assert.equal(res260.directParts.available, true);

  // MS 261
  const res261 = await decodeStihlCode('MS 261', database);
  assert.equal(res261.type, 'MODEL_DECODE');
  assert.equal(res261.normalized_model, 'MS 261');
  assert.ok(res261.directParts.available, true);

  // FS 450 (Auxiliary verified model)
  const res450 = await decodeStihlCode('FS 450', database);
  assert.equal(res450.type, 'MODEL_DECODE');
  assert.equal(res450.normalized_model, 'FS 450');
  assert.equal(res450.directParts.available, true);
  assert.ok(res450.directParts.parts.length >= 4);

  // 026 (Classic predecessor model)
  const res026 = await decodeStihlCode('026', database);
  assert.equal(res026.type, 'MODEL_DECODE');
  assert.equal(res026.normalized_model, 'STIHL 026');
  assert.ok(res026.relationship);
  assert.equal(res026.relationship.relatedModel, 'MS 260');
});

test('Phase 4 - Model Recognition: Alternative formats and casing (MS260, Stihl MS-260, FS450, MS261CM, MS 261 VW)', async () => {
  // MS260
  const resA = await decodeStihlCode('MS260', database);
  assert.equal(resA.type, 'MODEL_DECODE');
  assert.equal(resA.normalized_model, 'MS 260');

  // Stihl MS-260
  const resB = await decodeStihlCode('Stihl MS-260', database);
  assert.equal(resB.type, 'MODEL_DECODE');
  assert.equal(resB.normalized_model, 'MS 260');

  // FS450
  const resC = await decodeStihlCode('FS450', database);
  assert.equal(resC.type, 'MODEL_DECODE');
  assert.equal(resC.normalized_model, 'FS 450');

  // MS261CM
  const resD = await decodeStihlCode('MS261CM', database);
  assert.equal(resD.type, 'MODEL_DECODE');
  assert.equal(resD.normalized_model, 'MS 261 C-M');

  // MS 261 VW
  const resE = await decodeStihlCode('MS 261 VW', database);
  assert.equal(resE.type, 'MODEL_DECODE');
  assert.equal(resE.normalized_model, 'MS 261 VW');
});

test('Phase 4 - Typo Recovery: Digit-letter swap and spacing (MS 26O, FS45O, MS 261C M)', async () => {
  // MS 26O -> MS 260
  const resTypo1 = await decodeStihlCode('MS 26O', database);
  assert.equal(resTypo1.type, 'MODEL_DECODE');
  assert.equal(resTypo1.normalized_model, 'MS 260');
  assert.ok(resTypo1.typoNotice, 'Must include typo notice');
  assert.ok(resTypo1.typoNotice.includes('MS 260'));

  // FS45O -> FS 450
  const resTypo2 = await decodeStihlCode('FS45O', database);
  assert.equal(resTypo2.type, 'MODEL_DECODE');
  assert.equal(resTypo2.normalized_model, 'FS 450');
  assert.ok(resTypo2.typoNotice);
  assert.ok(resTypo2.typoNotice.includes('FS 450'));

  // MS 261C M -> MS 261 C-M
  const resTypo3 = await decodeStihlCode('MS 261C M', database);
  assert.equal(resTypo3.type, 'MODEL_DECODE');
  assert.equal(resTypo3.normalized_model, 'MS 261 C-M');
  assert.ok(resTypo3.typoNotice);
});

test('Phase 4 - Suggestion Engine: Bounded distance suggests without fabricating (MS 2500 -> MS 250)', async () => {
  const res = await decodeStihlCode('MS 2500', database);
  assert.equal(res.success, false);
  assert.ok(Array.isArray(res.suggestions), 'Must return suggestions array');
  assert.ok(res.suggestions.includes('MS 250'), 'Must suggest existing model MS 250');
});

test('Phase 4 - Disambiguation: Ambiguous queries return MODEL_DISAMBIGUATION (MS 26, 260, 261)', async () => {
  // MS 26
  const resMS26 = await decodeStihlCode('MS 26', database);
  assert.equal(resMS26.type, 'MODEL_DISAMBIGUATION');
  assert.ok(resMS26.candidates.length >= 2);
  const names26 = resMS26.candidates.map(c => c.model_name);
  assert.ok(names26.includes('MS 260'));
  assert.ok(names26.includes('MS 261'));

  // 260
  const res260 = await decodeStihlCode('260', database);
  assert.equal(res260.type, 'MODEL_DISAMBIGUATION');
  const names260 = res260.candidates.map(c => c.model_name);
  assert.ok(names260.includes('MS 260'));

  // 261
  const res261 = await decodeStihlCode('261', database);
  assert.equal(res261.type, 'MODEL_DISAMBIGUATION');
  const names261 = res261.candidates.map(c => c.model_name);
  assert.ok(names261.includes('MS 261'));
});

test('Phase 4 - Strict Guards: Part numbers and Serial numbers are never fuzzy matched as models', async () => {
  // 11-digit part number
  const partRes1 = await decodeStihlCode('1121 021 0800', database);
  assert.equal(partRes1.type, 'PART_NUMBER');

  const partRes2 = await decodeStihlCode('99999999999', database);
  assert.equal(partRes2.type, 'PART_NUMBER');

  // 9-digit serial numbers
  const serialRes1 = await decodeStihlCode('163118080', database);
  assert.equal(serialRes1.type, 'SERIAL_NUMBER');

  const serialRes2 = await decodeStihlCode('199999999', database);
  assert.equal(serialRes2.type, 'SERIAL_NUMBER');
});

test('Phase 4 - Autocomplete: Fast suggestions during typing', () => {
  const suggestions = getAutocompleteSuggestions('MS 26', database);
  assert.ok(Array.isArray(suggestions));
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.length <= 8);

  const modelNames = suggestions.map(s => s.model_name);
  assert.ok(modelNames.includes('MS 260'));
  assert.ok(modelNames.includes('MS 261'));
  assert.ok(suggestions.every(s => s.category && s.badge));
});

test('Phase 4 - UI Elements & Invariants: index.html markup and trust assertions', () => {
  // Autocomplete container
  assert.ok(indexHtml.includes('id="search-suggestions-dropdown"'), 'Must have autocomplete dropdown container');
  assert.ok(indexHtml.includes('aria-autocomplete="list"'), 'Must have aria-autocomplete');

  // Disambiguation card
  assert.ok(indexHtml.includes('id="model-disambiguation-card"'), 'Must have model disambiguation card');
  assert.ok(indexHtml.includes('id="disambiguation-candidates-grid"'), 'Must have disambiguation candidates grid');

  // Typo notice banner
  assert.ok(indexHtml.includes('id="model-typo-notice"'), 'Must have typo notice banner');

  // Empty state suggestions
  assert.ok(indexHtml.includes('id="empty-state-suggestions-container"'), 'Must have empty state suggestions container');
  assert.ok(indexHtml.includes('id="empty-state-suggestions-pills"'), 'Must have empty state suggestions pills');

  // Non-negotiable phrasing: 'Bevestigde compatibiliteit' and NO 'Gegarandeerd passend'
  assert.ok(indexHtml.includes('Bevestigde compatibiliteit'), 'Must use Bevestigde compatibiliteit');
  assert.ok(!indexHtml.includes('Gegarandeerd passend op'), 'Must NEVER include Gegarandeerd passend op');

  // Non-negotiable affiliate tracking
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  const provider = new AmazonAffiliateProvider();
  assert.equal(provider.getAssociateTag('amazon.nl'), 'srihldecoder2-21');
  assert.ok(defaultVerifiedOfferRegistry.maxActiveOffersAllowed <= 25);
});
