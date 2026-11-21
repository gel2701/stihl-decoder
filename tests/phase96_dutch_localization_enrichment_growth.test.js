/**
 * tests/phase96_dutch_localization_enrichment_growth.test.js
 *
 * Phase 96 — Dutch Parts Localization, Catalog Enrichment & Affiliate Growth
 *
 * Verifies:
 *  1. Central Dutch technical glossary (data/parts_glossary_nl.json) & PartNameNormalizer:
 *     - Key EN/DE -> NL mappings, 18,480-catalog idempotence (0 failures), raw preserved,
 *       fail-closed U+FFFD handling, 0 broken encodings/retailer spam.
 *  2. Multilingual NL/EN/DE search parity across PartCatalogResolver & IntelligentPartsSearchEngine.
 *  3. SEO indexation cohorts, PartDetailPage, ModelPartsPage, PartsDiscoveryPage, StructuredData,
 *     Sitemap, and Passport Dutch consistency without broken canonicals or duplicate issues.
 *  4. 41-model catalog enrichment & strict provenance classification (OFFICIAL_DOCUMENTED,
 *     SECONDARY_EVIDENCED, NEEDS_EVIDENCE) with 0 inferred fitments.
 *  5. Phase 96 affiliate growth: all baseline 3,056 Amazon + 1,773 eBay ACTIVE offers preserved,
 *     new Phase 96 offers pass TwoGateVerifier, multipack (incl. Teile/los), mismatch, NL shipping,
 *     and zero PII/postal leaks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';

import { PartNameNormalizer } from '../src/parts/PartNameNormalizer.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { searchIntelligentParts, getPartAffiliateOffers } from '../src/search/IntelligentPartsSearchEngine.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { PRIMARY_ORIGIN } from '../src/config.js';
import { evaluateTechnicalFit95 } from '../scripts/phase95_screener.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const readJson = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecode00-21';

const catalogDoc = readJson('data/parts_catalog.json');
const catalog = catalogDoc.parts;
const stihlDb = readJson('data/stihl_database.json');
const registryDoc = readJson('data/affiliate/verified_amazon_registry.json');
const ebayStore = loadEbayOfferStore(path.join(ROOT, 'data/affiliate/ebay_offers.json'));
const glossaryDoc = readJson('data/parts_glossary_nl.json');
const locReport = readJson('output/phase96/PHASE96_LOCALIZATION.json');
const enrReport = readJson('output/phase96/PHASE96_CATALOG_ENRICHMENT.json');
const actReport = readJson('output/phase96/PHASE96_ACTIVATION.json');
const ebayReport = readJson('output/phase96/PHASE96_EBAY_STATUS.json');

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const phase96Offers = activeOffers.filter(o => (o.status_reason || '').startsWith('Phase 96:'));
const prePhase96Active = activeOffers.filter(o => !(o.status_reason || '').startsWith('Phase 96:'));

test('Phase 96 — 1. Central Dutch technical glossary & PartNameNormalizer quality and idempotency', () => {
  assert.ok(Array.isArray(glossaryDoc.canonical_terms) && glossaryDoc.canonical_terms.length >= 50);
  assert.ok(Object.keys(glossaryDoc.phrase_map).length >= 300);

  const pairs = [
    ['Carburetor', 'Carburateur'],
    ['Carburettor', 'Carburateur'],
    ['Vergaser', 'Carburateur'],
    ['Ignition coil', 'Ontstekingsspoel'],
    ['Zündspule', 'Ontstekingsspoel'],
    ['Recoil starter', 'Trekstarter'],
    ['Clutch drum', 'Koppelingstrommel'],
    ['Crankshaft', 'Krukas'],
    ['Oil pump', 'Oliepomp'],
    ['Fuel filter', 'Brandstoffilter'],
    ['Piston kit', 'Zuigerset'],
    ['Air filter', 'Luchtfilter'],
    ['Flywheel', 'Vliegwiel'],
    ['Worm gear', 'Wormwiel'],
    ['Intake manifold', 'Inlaatspruitstuk'],
    ['Spark plug', 'Bougie'],
    ['Starter pawl', 'Starterklink'],
    ['Chain tensioner', 'Kettingspanner'],
    ['Stihl 90223710710 Spline Screw Is-M4X20 MS200 / MS200T', 'Torxschroef IS-M4x20'],
    ['(NO LONGER AVAILABLE) Stihl Air Filter', 'Luchtfilter']
  ];
  for (const [raw, expected] of pairs) {
    assert.strictEqual(PartNameNormalizer.normalizePartName(raw), expected, `Expected "${raw}" -> "${expected}"`);
  }

  let nonIdempotent = 0;
  let brokenEncoding = 0;
  for (const p of catalog) {
    const n1 = PartNameNormalizer.normalizeDisplayName(p.part_name, p.part_number);
    const n2 = PartNameNormalizer.normalizeDisplayName(n1, p.part_number);
    if (n1 !== n2) nonIdempotent++;
    if (n1.includes('\uFFFD') || n1.includes('&#')) brokenEncoding++;
    assert.ok(typeof p.part_name === 'string' && p.part_name.length > 0, 'Raw part_name must stay populated');
  }
  assert.strictEqual(nonIdempotent, 0);
  assert.strictEqual(brokenEncoding, 0);
  assert.strictEqual(locReport.non_idempotent_count, 0);
  assert.strictEqual(locReport.raw_part_names_untouched, true);
  assert.ok(locReport.dutch_normalized_count >= 17500);
});

test('Phase 96 — 2. Multilingual NL / EN / DE search parity returns identical matches & rankings', () => {
  const triplets = [
    ['carburateur', 'carburetor', 'vergaser'],
    ['ontstekingsspoel', 'ignition coil', 'zündspule'],
    ['trekstarter', 'recoil starter', 'anwerfer'],
    ['koppelingstrommel', 'clutch drum', 'kupplungstrommel'],
    ['krukas', 'crankshaft', 'kurbelwelle'],
    ['oliepomp', 'oil pump', 'ölpumpe'],
    ['brandstoffilter', 'fuel filter', 'kraftstofffilter'],
    ['zuigerset', 'piston kit', 'kolbensatz'],
    ['luchtfilter', 'air filter', 'luftfilter'],
    ['vliegwiel', 'flywheel', 'polrad'],
    ['wormwiel', 'worm gear', 'schnecke'],
    ['inlaatspruitstuk', 'intake manifold', 'ansaugstutzen'],
    ['bougie', 'spark plug', 'zündkerze'],
    ['starterklink', 'starter pawl', 'sperrklinke'],
    ['kettingspanner', 'chain tensioner', 'kettenspanner']
  ];

  for (const [nl, en, de] of triplets) {
    const rNl = PartCatalogResolver.searchParts(nl, 10).map(p => p.part_number);
    const rEn = PartCatalogResolver.searchParts(en, 10).map(p => p.part_number);
    const rDe = PartCatalogResolver.searchParts(de, 10).map(p => p.part_number);
    assert.ok(rNl.length > 0, `Query "${nl}" must yield results`);
    assert.deepStrictEqual(rNl, rEn, `NL "${nl}" and EN "${en}" must return identical results`);
    assert.deepStrictEqual(rNl, rDe, `NL "${nl}" and DE "${de}" must return identical results`);
  }

  const enriched = searchIntelligentParts('ontstekingsspoel', {}, { database: stihlDb, limit: 10 });
  assert.ok(enriched.total_matches > 0);
  assert.ok(enriched.results.some(r => /ontsteking/i.test(r.part_name)), 'Search UI result name must be localized Dutch');
});

test('Phase 96 — 3. Dutch UI consistency, SEO cohorts, canonicals & discovery pages', () => {
  const discoveryHtml = renderPartsDiscoveryPageHtml('', stihlDb, PRIMARY_ORIGIN);
  assert.ok(!discoveryHtml.includes('anwerfseil'), 'Discovery category copy must be Dutch without German anwerfseil');

  const indexable = getAllIndexablePartsList();
  assert.strictEqual(indexable.length, 843);
  const sampleWave2 = indexable.find(p => p.source_cohort === 'PHASE_56D_WAVE2');
  assert.ok(sampleWave2 && sampleWave2.clean_name);
  assert.ok(!/\b(?:for TS\d+|OEM No\.)/i.test(sampleWave2.clean_name), 'SEO clean_name must not carry English retailer clutter');

  const detailHtml = renderPartDetailPageHtml(sampleWave2.part_number, stihlDb, PRIMARY_ORIGIN);
  assert.ok(detailHtml.includes(`<link rel="canonical" href="${PRIMARY_ORIGIN}/onderdeelnummer/${sampleWave2.part_number}/">`));
  assert.ok(detailHtml.includes('<html lang="nl"'));
  assert.ok(detailHtml.includes('"category": "Tuin- en bosbouwmachine onderdelen"'));
  assert.ok(detailHtml.includes(sampleWave2.clean_name));

  const ms261Model = stihlDb.models.find(m => m.slug === 'ms-261');
  const modelPartsHtml = renderModelPartsPageHtml(ms261Model, stihlDb, PRIMARY_ORIGIN);
  assert.ok(modelPartsHtml.includes('Carburateur') && modelPartsHtml.includes('Oliepomp'));
});

test('Phase 96 — 4. 41-model catalog enrichment & strict non-inference provenance taxonomy', () => {
  assert.strictEqual(enrReport.baseline_empty_models, 41);
  assert.strictEqual(
    enrReport.classification_counts.OFFICIAL_DOCUMENTED +
    enrReport.classification_counts.SECONDARY_EVIDENCED +
    enrReport.classification_counts.NEEDS_EVIDENCE,
    41
  );
  assert.strictEqual(enrReport.newly_enriched_empty_models, 22);
  assert.ok(enrReport.total_phase96_additive_fitments >= 2000);
  assert.ok(enrReport.thin_models_enriched.length >= 20);

  // Verify newly enriched models render parts cleanly and enter sitemap
  for (const modelName of ['MS 201 TC-M', 'BGA 30', 'HSA 100', 'FSA 30', 'MSA 60 C-B', 'FSA 50', 'BGE 60', '050']) {
    const modelObj = stihlDb.models.find(m => m.model_name === modelName);
    assert.ok(modelObj, `${modelName} must exist in stihl_database`);
    assert.strictEqual(PartCatalogResolver.hasPartsForModel(modelObj, stihlDb), true, `${modelName} must have renderable parts`);
    const parts = PartCatalogResolver.getPartsForModel(modelObj, null, null, stihlDb);
    assert.ok(parts.length > 0, `${modelName} must return verified parts`);
  }

  // Strictly verify NEEDS_EVIDENCE models keep 0 guessed parts
  for (const modelName of ['FS 161', 'FS 221', 'MS 363', 'HLA 40', 'FC 56']) {
    const modelObj = stihlDb.models.find(m => m.model_name === modelName);
    const auditEntry = enrReport.empty_models_audit.find(e => e.model_name === modelName);
    assert.strictEqual(auditEntry?.classification, 'NEEDS_EVIDENCE');
    assert.strictEqual(auditEntry?.added_fitments, 0);
    assert.strictEqual(PartCatalogResolver.getPartsForModel(modelObj, null, null, stihlDb).length, 0);
  }

  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, stihlDb);
  assert.ok(sitemapXml.includes('/onderdelen/</loc>'));
  assert.ok(sitemapXml.includes('/bga-30/onderdelen/</loc>'));
});

test('Phase 96 — 5. Affiliate growth, baseline preservation, multipack & Two-Gate integrity', () => {
  assert.strictEqual(prePhase96Active.length, 3056, 'All 3,056 baseline Amazon ACTIVE offers must remain preserved');
  assert.ok(phase96Offers.length >= 8, `Expected >= 8 new verified Phase 96 ACTIVE offers, got ${phase96Offers.length}`);
  assert.strictEqual(ebayStore.offers.length, 1773, 'All 1,773 eBay ACTIVE offers must remain preserved');
  assert.strictEqual(ebayReport.ebay_active_offers, 1773);

  const catalogSet = new Set(catalog.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
  const seenAsinMkt = new Set();
  for (const o of activeOffers) {
    const k = `${o.marketplace || 'amazon.nl'}|${o.asin}`;
    assert.ok(!seenAsinMkt.has(k), `ASIN collision detected on ${k}`);
    seenAsinMkt.add(k);
  }

  const liveRegistry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  liveRegistry.loadFromFile();

  for (const offer of phase96Offers) {
    const verif = TwoGateVerifier.verifyOffer(offer, {
      catalogPartMap: catalogSet,
      expectedTag: offer.marketplace === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21'
    });
    assert.strictEqual(verif.passed, true, `TwoGate failed for ${offer.part_number}: ${verif.errors.join('; ')}`);
    assert.strictEqual(checkHistoricalMismatch(offer.part_number, offer.asin, offer.product_title).isMismatch, false);
    assert.strictEqual(offer.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.strictEqual(offer.package_quantity, 1);
    assert.strictEqual(offer.is_multipack, false);
    assert.ok(!/\b5\s*teile\s*\/\s*los\b/i.test(offer.product_title), 'Multipack Teile/los must never be ACTIVE');

    const resolved = getPartAffiliateOffers(offer.part_number, offer.part_name, { verifiedRegistry: liveRegistry });
    assert.ok(resolved.direct_offers.some(d => d.marketplace === offer.marketplace && d.is_verified === true && d.asin === offer.asin));
  }

  assert.strictEqual(actReport.consistency_success, true);
  assert.ok(actReport.after.modelsAllFitmentsCombinedCovered >= 459 || actReport.after.allFitmentsCombinedCovered >= 459);

  const rawText = JSON.stringify({ actReport, enrReport, ebayReport });
  assert.ok(!/\b\d{4}\s*[A-Z]{2}\b/.test(rawText.replace(/NL-POSTAL/g, '')), 'No Dutch postal codes in reports');
});
