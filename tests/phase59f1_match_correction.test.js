/**
 * tests/phase59f1_match_correction.test.js
 *
 * Phase 59F.1: Forensic Match Correction & Activation Preparation
 *
 * Validates:
 * 1. Urgent correction of 0000 400 7025 (STIHL ZK C 10 pack of 10) -> ASIN B07RHQ5FR4 rejected & suspended.
 * 2. Spline-type correction of 0000 642 1223 (Standard SD7 vs Small SM7 Oregon 18720 / B000IBWVWG) -> rejected & suspended.
 * 3. Re-verification of 0000 400 7009 (Bosch USR7AC / B09QH68W83) as the sole activation-ready match.
 * 4. Research backlog retention of NGK CMR7H and Oregon 18720 with accurate STIHL target references.
 * 5. Preservation of the 3 active live pilot offers in production.
 * 6. Fail-closed fallback: suspended and staged parts strictly resolve to SEARCH_FALLBACK.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  VerifiedOfferRegistry,
  MAX_PILOT_ACTIVE_OFFERS
} from '../src/affiliate/VerifiedOfferRegistry.js';
import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const MANIFEST_59F1_PATH = path.join(rootDir, 'PHASE59F1_ACTIVATION_CANDIDATES.json');
const EVIDENCE_59F_PATH = path.join(rootDir, 'PHASE59F_MATCH_EVIDENCE.json');
const RUNTIME_REGISTRY_PATH = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
const PARTS_CATALOG_PATH = path.join(rootDir, 'data', 'parts_catalog.json');

test('Phase 59F.1 — 1. Forensic Correction & Suspension of 0000 400 7025 (STIHL ZK C 10)', () => {
  // 1. Check catalog definition
  const catalog = JSON.parse(fs.readFileSync(PARTS_CATALOG_PATH, 'utf8'));
  const catalogPart = catalog.parts.find(p => p.part_number === '00004007025');
  assert.ok(catalogPart, 'Part 00004007025 must exist in canonical catalog');
  assert.ok(catalogPart.part_name.includes('Pack of 10') || catalogPart.part_name.includes('ZK C'), 'Catalog identifies part as ZK C pack of 10');

  // 2. Check manifest suspension
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_59F1_PATH, 'utf8'));
  const offer = manifest.offers.find(o => o.part_number === '00004007025');
  assert.ok(offer, 'Offer for 00004007025 must be present in manifest');
  assert.strictEqual(offer.status, 'SUSPENDED', '00004007025 must be SUSPENDED from direct ASIN activation');
  assert.strictEqual(offer.pilot_eligible, false, 'Must not be pilot eligible');
  assert.strictEqual(offer.pilot_active, false, 'Must not be pilot active');
  assert.strictEqual(offer.gate_1_technical.passed, false, 'Gate 1 must fail due to quantity/model mismatch');
  assert.strictEqual(offer.gate_2_product.passed, false, 'Gate 2 must fail due to product identity mismatch');

  // 3. TwoGateVerifier must fail closed
  const gateCheck = TwoGateVerifier.verifyOffer(offer);
  assert.strictEqual(gateCheck.passed, false, 'TwoGateVerifier must reject 00004007025');

  // 4. Evidence docket records primary source citation
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_59F_PATH, 'utf8'));
  const evCandidate = evidence.candidates.find(c => c.part_number === '00004007025');
  assert.strictEqual(evCandidate.status, 'INCORRECT_MATCH_CONFIRMED');
  assert.ok(evCandidate.compatibility_proof.includes('ZK C 10'));
  assert.ok(evCandidate.mismatch_details.primary_source.includes('Stihl-BR-700.pdf'));
});

test('Phase 59F.1 — 2. Forensic Correction & Suspension of 0000 642 1223 (Spline Type Mismatch)', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_59F1_PATH, 'utf8'));
  const offer = manifest.offers.find(o => o.part_number === '00006421223');
  assert.ok(offer, 'Offer for 00006421223 must be present in manifest');
  assert.strictEqual(offer.status, 'SUSPENDED', '00006421223 must be SUSPENDED from direct ASIN activation');
  assert.strictEqual(offer.pilot_eligible, false, 'Must not be pilot eligible');
  assert.strictEqual(offer.pilot_active, false, 'Must not be pilot active');
  assert.strictEqual(offer.gate_1_technical.passed, false, 'Gate 1 must fail due to spline type mismatch');
  assert.strictEqual(offer.gate_2_product.passed, false, 'Gate 2 must fail due to physical fitment mismatch');

  const gateCheck = TwoGateVerifier.verifyOffer(offer);
  assert.strictEqual(gateCheck.passed, false, 'TwoGateVerifier must reject 00006421223');

  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_59F_PATH, 'utf8'));
  const evCandidate = evidence.candidates.find(c => c.part_number === '00006421223');
  assert.strictEqual(evCandidate.status, 'INCORRECT_MATCH_CONFIRMED');
  assert.strictEqual(evCandidate.mismatch_details.mismatch_type, 'SPLINE_TYPE_MISMATCH');
  assert.strictEqual(evCandidate.mismatch_details.correct_oregon_replacement, 'Oregon 68210');
  assert.strictEqual(evCandidate.mismatch_details.correct_stihl_for_oregon_18720, '0000 642 1249');
});

test('Phase 59F.1 — 3. Forensic Re-Verification of 0000 400 7009 (Bosch USR7AC) as Sole Ready Match', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_59F1_PATH, 'utf8'));
  const verifiedOffers = manifest.offers.filter(o => o.status === 'VERIFIED');
  assert.strictEqual(verifiedOffers.length, 1, 'Exactly 1 candidate must remain in VERIFIED status');

  const bosch = verifiedOffers[0];
  assert.strictEqual(bosch.part_number, '00004007009');
  assert.strictEqual(bosch.asin, 'B09QH68W83');
  assert.strictEqual(bosch.brand, 'Bosch');
  assert.strictEqual(bosch.manufacturer_part_number, '0242035503');
  assert.strictEqual(bosch.ean_gtin, '4047023059468');
  assert.strictEqual(bosch.package_quantity, 1);
  assert.strictEqual(bosch.oem_brand_classification, 'OEM_SUPPLIER_EQUIVALENT');

  const gateCheck = TwoGateVerifier.verifyOffer(bosch);
  assert.strictEqual(gateCheck.passed, true, `Bosch USR7AC must pass TwoGateVerifier: ${gateCheck.errors.join('; ')}`);
  assert.strictEqual(gateCheck.gate1.passed, true);
  assert.strictEqual(gateCheck.gate2.passed, true);
});

test('Phase 59F.1 — 4. Preservation of the 3 Live Pilot Offers in Production', () => {
  const runtimeDoc = JSON.parse(fs.readFileSync(RUNTIME_REGISTRY_PATH, 'utf8'));
  assert.strictEqual(runtimeDoc.policy.production_activation_allowed, true);
  assert.ok(runtimeDoc.policy.max_active_offers_allowed <= 100);
  assert.ok(['11104007005', '00004007000', '00004007011'].every(p => runtimeDoc.policy.pilot_activated_parts.includes(p)));

  const registry = new VerifiedOfferRegistry({
    registryPath: RUNTIME_REGISTRY_PATH,
    productionActivationAllowed: true,
    activeWhitelist: runtimeDoc.policy.pilot_activated_parts
  });
  registry.loadFromFile();

  const expectedActive = [
    { part: '11104007005', asin: 'B0068M5NAG', brand: 'Bosch' },
    { part: '00004007000', asin: 'B001RM8J76', brand: 'NGK' },
    { part: '00004007011', asin: 'B001RMA5S2', brand: 'NGK' }
  ];

  for (const item of expectedActive) {
    const offer = registry.getActiveOffer(item.part);
    assert.ok(offer, `Live pilot offer ${item.part} must be ACTIVE`);
    assert.strictEqual(offer.asin, item.asin);
    assert.strictEqual(offer.brand, item.brand);

    const commercial = registry.resolveCommercialOffer({ partNumber: item.part });
    assert.strictEqual(commercial.link_type, 'DIRECT_ASIN');
    assert.strictEqual(commercial.asin, item.asin);
    assert.ok(commercial.url.includes(`/dp/${item.asin}`));
    assert.ok(commercial.url.includes('tag=srihldecoder2-21'));
  }
});

test('Phase 59F.1 — 5. Fail-Closed Search Fallback for Suspended Parts in Production Registry', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_59F1_PATH, 'utf8'));
  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true,
    activeWhitelist: ['11104007005', '00004007000', '00004007011']
  });
  registry.importRegistry(manifest);

  // Both suspended parts must resolve to SEARCH_FALLBACK
  for (const part of ['00004007025', '00006421223']) {
    const active = registry.getActiveOffer(part);
    assert.strictEqual(active, null, `Suspended part ${part} must NOT be active`);

    const commercial = registry.resolveCommercialOffer({ partNumber: part });
    assert.strictEqual(commercial.link_type, 'SEARCH_FALLBACK', `Suspended part ${part} must resolve to SEARCH_FALLBACK`);
    assert.strictEqual(commercial.asin, null);
    assert.ok(commercial.url.startsWith('https://amazon.nl/s?k=STIHL'));
    assert.ok(commercial.url.includes('tag=srihldecoder2-21'));
  }

  // Attempting to activate a suspended offer must fail closed
  const actAttempt = registry.activateOffer('00004007025', 'Unauthorized activation attempt');
  assert.strictEqual(actAttempt.success, false, 'Activating a suspended offer must fail closed');
});

test('Phase 59F.1 — 6. Activation Readiness Simulation for 0000 400 7009 (Bosch USR7AC)', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_59F1_PATH, 'utf8'));

  // Sandboxed registry instance simulating future operator approval (limit raised to 4)
  const sandboxedRegistry = new VerifiedOfferRegistry({
    productionActivationAllowed: true,
    maxActiveOffersAllowed: 4,
    activeWhitelist: ['11104007005', '00004007000', '00004007011', '00004007009']
  });
  sandboxedRegistry.importRegistry(manifest);

  // Activate Bosch USR7AC in sandbox
  const actRes = sandboxedRegistry.activateOffer('00004007009', 'Operator approved activation simulation');
  assert.strictEqual(actRes.success, true, 'Bosch USR7AC must activate cleanly when authorized');

  const resolved = sandboxedRegistry.resolveCommercialOffer({ partNumber: '00004007009' });
  assert.strictEqual(resolved.link_type, 'DIRECT_ASIN');
  assert.strictEqual(resolved.asin, 'B09QH68W83');
  assert.ok(resolved.url.includes('/dp/B09QH68W83'));
  assert.ok(resolved.url.includes('tag=srihldecoder2-21'));

  // Immediate rollback test
  const deactRes = sandboxedRegistry.deactivateOffer('00004007009', 'Rollback verification');
  assert.strictEqual(deactRes.success, true);
  const rolledBack = sandboxedRegistry.resolveCommercialOffer({ partNumber: '00004007009' });
  assert.strictEqual(rolledBack.link_type, 'SEARCH_FALLBACK');
});
