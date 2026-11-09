import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TwoGateVerifier, VALID_OFFER_STATUSES, EVIDENCE_CLASSIFICATIONS } from '../src/affiliate/TwoGateVerifier.js';
import { VerifiedOfferRegistry, MAX_PILOT_ACTIVE_OFFERS } from '../src/affiliate/VerifiedOfferRegistry.js';
import { validateAmazonLink } from '../src/affiliate/AmazonLinkValidator.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const batch = read('reports/phase69_expansion_batch.json');
const catalog = read('data/parts_catalog.json');
const registry = read('data/affiliate/verified_amazon_registry.json');
const catalogPartMap = new Set(catalog.parts.map(p => p.part_number));

test('Phase 69C: 1. AMAZON_LISTING_COMPATIBLE classification and taxonomy', () => {
  assert.ok(VALID_OFFER_STATUSES.has('AMAZON_LISTING_COMPATIBLE'));
  assert.equal(EVIDENCE_CLASSIFICATIONS.AMAZON_LISTING_COMPATIBLE, 'AMAZON_LISTING_COMPATIBLE');

  // Verify display meta for AMAZON_LISTING_COMPATIBLE
  const sampleOffer = {
    part_number: '00004007009',
    asin: 'B09QH68W83',
    marketplace: 'amazon.nl',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    model_compatibility: 'BG 86, FS 56',
    brand: 'Bosch'
  };
  const meta = VerifiedOfferRegistry.getTaxonomyDisplayMeta(sampleOffer);
  assert.equal(meta.badge_label, 'OEM-kwaliteit (Bosch)');
  assert.ok(meta.description.includes('Geschikt voor STIHL BG 86, FS 56 (volgens Amazon-productvermelding).'));
  assert.ok(meta.description.includes('Controleer vóór aankoop altijd machine-uitvoering en bouwjaar.'));
});

test('Phase 69C: 2. Acceptance of verified Amazon product listings under TwoGateVerifier', () => {
  const activeNewOffers = registry.offers.filter(o => o.evidence_classification === 'AMAZON_LISTING_COMPATIBLE');
  assert.equal(activeNewOffers.length, 1, 'Must have exactly 1 confirmed live AMAZON_LISTING_COMPATIBLE offer in active registry');

  for (const offer of activeNewOffers) {
    const v = TwoGateVerifier.verifyOffer(offer, {
      catalogPartMap,
      expectedTag: registry.policy.affiliate_tag
    });
    assert.equal(v.gate1.status, 'PASS', `Gate 1 must pass for ${offer.part_number}`);
    assert.equal(v.gate2.status, 'PASS', `Gate 2 must pass for ${offer.part_number}`);
    assert.equal(v.overall_status, 'PASS', `Overall verification must pass for ${offer.part_number}`);
    assert.equal(v.errors.length, 0);

    // Verify affiliate URL validity
    const linkValidation = validateAmazonLink(offer.direct_affiliate_url, {
      marketplace: offer.marketplace,
      asin: offer.asin,
      tag: offer.affiliate_tag
    });
    assert.equal(linkValidation.valid, true, `Amazon link must be valid for ${offer.asin}`);
  }
});

test('Phase 69C: 3. Rejection of invalid listings, wrong models, and technical conflicts', () => {
  // Case A: Technical pitch conflict (0000 642 1240 - 3/8 Picco vs standard 3/8 7T)
  const conflictCandidate = batch.candidates.find(c => c.part_number === '00006421240');
  assert.ok(conflictCandidate, 'Conflict candidate must be present in batch report');
  assert.equal(conflictCandidate.status, 'BLOCKED_CONFLICT');
  assert.equal(conflictCandidate.blocker, 'BLOCKED_CONFLICT');
  assert.ok(conflictCandidate.conflict_reason.includes('3/8 Picco'));

  const conflictVerification = TwoGateVerifier.verifyOffer({
    part_number: '00006421240',
    asin: 'B000IBWVWG',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Oregon Tool, Inc.',
    manufacturer_part_number: '18720',
    brand: 'Oregon',
    product_title: 'Oregon 18720 Rim Sprocket 3/8 7T',
    oem_brand_classification: 'MANUFACTURER_AFTERMARKET',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    blocker: 'BLOCKED_CONFLICT',
    blocker_reason: '3/8 standard vs 3/8 Picco conflict',
    compatibility_proof: 'Oregon 18720',
    asin_product_identity_proof: 'Oregon 18720 listing',
    verifiable_evidence_sources: [{ type: 'AMAZON_LISTING', url: 'https://www.amazon.nl/dp/B000IBWVWG', claim: 'Oregon 18720' }],
    verification_date: '2026-11-09'
  }, { catalogPartMap });
  assert.equal(conflictVerification.passed, false);
  assert.ok(conflictVerification.errors.some(e => e.includes('BLOCKED_CONFLICT')));

  // Case B: Missing model mention in compatibility proof
  const noModelCandidate = {
    part_number: '00004007009',
    asin: 'B09QH68W83',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Bosch',
    manufacturer_part_number: 'USR7AC',
    brand: 'Bosch',
    product_title: 'Bosch Spark Plug',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    compatibility_proof: 'Universele bougie zonder vermelding van model of onderdeelnummer',
    asin_product_identity_proof: 'Amazon listing',
    verifiable_evidence_sources: [{ type: 'AMAZON_LISTING', url: 'https://www.amazon.nl/dp/B09QH68W83', claim: 'Bougie' }],
    verification_date: '2026-11-09'
  };
  const noModelRes = TwoGateVerifier.verifyOffer(noModelCandidate, { catalogPartMap });
  assert.equal(noModelRes.passed, false);
  assert.ok(noModelRes.errors.some(e => e.includes('AMAZON_LISTING_INCOMPATIBLE')));

  // Case C: Missing Amazon evidence URL
  const noUrlCandidate = {
    part_number: '00004007009',
    asin: 'B09QH68W83',
    marketplace: 'amazon.nl',
    affiliate_tag: 'srihldecoder2-21',
    manufacturer: 'Bosch',
    manufacturer_part_number: 'USR7AC',
    brand: 'Bosch',
    product_title: 'Bosch Spark Plug',
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    evidence_classification: 'AMAZON_LISTING_COMPATIBLE',
    compatibility_proof: 'Geschikt voor STIHL BG 86',
    asin_product_identity_proof: 'Geen URL verstrekt',
    verifiable_evidence_sources: [],
    verification_date: '2026-11-09'
  };
  const noUrlRes = TwoGateVerifier.verifyOffer(noUrlCandidate, { catalogPartMap });
  assert.equal(noUrlRes.passed, false);

  // Case D: Historical mismatch check triggers
  const mismatchRes = checkHistoricalMismatch('00006421223', 'B000IBWVWG');
  assert.equal(mismatchRes.isMismatch, true);
});

test('Phase 69C: 4. Production capacity limit raised to 25 and verified active offers maintained', () => {
  assert.equal(MAX_PILOT_ACTIVE_OFFERS, 25);
  assert.equal(registry.policy.max_active_offers_allowed, 25);
  assert.equal(registry.metrics.active_in_production, 4);
  assert.equal(registry.offers.filter(o => o.status === 'ACTIVE').length, 4);
  assert.equal(registry.policy.pilot_activated_parts.length, 4);

  // Verify baseline 3 offers remain completely intact and active
  const baselineParts = ['11104007005', '00004007000', '00004007011'];
  for (const part of baselineParts) {
    const offer = registry.offers.find(o => o.part_number === part);
    assert.ok(offer, `Baseline part ${part} must exist in registry`);
    assert.equal(offer.status, 'ACTIVE');
    assert.equal(offer.pilot_active, true);
  }

  // Verify verified Bosch USR7AC spark plug is active
  const usr7acOffer = registry.offers.find(o => o.part_number === '00004007009');
  assert.ok(usr7acOffer, 'Bosch USR7AC (0000 400 7009) must be active');
  assert.equal(usr7acOffer.asin, 'B09QH68W83');
  assert.equal(usr7acOffer.status, 'ACTIVE');
  assert.equal(usr7acOffer.pilot_active, true);

  // Verify unverified candidates (404 on Amazon) are STAGED and not in active registry
  const unverifiedParts = [
    '41470074102', '41471410300', '41471404400', '00003503521',
    '07811201109', '07811201110', '41471900600', '41197106000', '11301240800'
  ];
  for (const pn of unverifiedParts) {
    const candidate = batch.candidates.find(c => c.part_number === pn);
    assert.ok(candidate, `Candidate ${pn} must exist in batch report`);
    assert.equal(candidate.status, 'STAGED');
    assert.equal(candidate.live_check.listing_found, false);
    assert.equal(candidate.live_check.http_status_nl, 404);
    assert.equal(registry.offers.some(o => o.part_number === pn), false, `${pn} must not be in active registry`);
  }
});

test('Phase 69C: 5. Deterministic search fallback maintained for non-activated catalog', () => {
  const reg = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  reg.importRegistry(registry);

  // Active verified part resolves to direct ASIN
  const activeCommercial = reg.resolveCommercialOffer({ partNumber: '00004007009' });
  assert.equal(activeCommercial.link_type, 'DIRECT_ASIN');
  assert.equal(activeCommercial.asin, 'B09QH68W83');
  assert.equal(activeCommercial.is_verified, true);
  assert.ok(activeCommercial.description.includes('Amazon-productvermelding'));

  // Staged unverified part resolves strictly to deterministic SEARCH_FALLBACK
  const stagedCommercial = reg.resolveCommercialOffer({ partNumber: '11301240800' });
  assert.equal(stagedCommercial.link_type, 'SEARCH_FALLBACK');
  assert.equal(stagedCommercial.asin, null);
  assert.equal(stagedCommercial.is_verified, false);
  assert.ok(stagedCommercial.url.includes('/s?k='));

  // Non-activated catalog part resolves strictly to deterministic SEARCH_FALLBACK
  const unactivatedCommercial = reg.resolveCommercialOffer({ partNumber: '11231200605' });
  assert.equal(unactivatedCommercial.link_type, 'SEARCH_FALLBACK');
  assert.equal(unactivatedCommercial.asin, null);
  assert.equal(unactivatedCommercial.is_verified, false);
  assert.ok(unactivatedCommercial.url.includes('/s?k='));

  // Blocked conflict part resolves strictly to SEARCH_FALLBACK
  const conflictCommercial = reg.resolveCommercialOffer({ partNumber: '00006421240' });
  assert.equal(conflictCommercial.link_type, 'SEARCH_FALLBACK');
  assert.equal(conflictCommercial.asin, null);
});

test('Phase 69C: 6. Reversibility & Rollback Support', () => {
  const reg = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  reg.importRegistry(registry);

  const testPart = '00004007009';
  assert.equal(reg.isOfferActive(testPart), true);

  // Deactivate offer (Rollback)
  const deactRes = reg.deactivateOffer(testPart, 'Rollback test: operator demotion');
  assert.equal(deactRes.success, true);
  assert.equal(deactRes.offer.status, 'VERIFIED');
  assert.equal(reg.isOfferActive(testPart), false);

  // Resolution now immediately falls back to search
  const fallbackCommercial = reg.resolveCommercialOffer({ partNumber: testPart });
  assert.equal(fallbackCommercial.link_type, 'SEARCH_FALLBACK');

  // Reactivate offer
  const reactRes = reg.activateOffer(testPart, 'Re-activation test');
  assert.equal(reactRes.success, true);
  assert.equal(reactRes.offer.status, 'ACTIVE');
  assert.equal(reg.isOfferActive(testPart), true);

  // Suspend offer with reason
  const suspRes = reg.suspendOffer(testPart, 'Quality hold');
  assert.equal(suspRes.success, true);
  assert.equal(suspRes.offer.status, 'SUSPENDED');
  assert.equal(reg.isOfferActive(testPart), false);
});
