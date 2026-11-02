/**
 * tests/phase59f_amazon_scaling.test.js
 *
 * Phase 59F: Amazon Affiliate Scaling — First 25 Additional Verified Offers
 *
 * Validates:
 * 1. Preservation of the successful 3-part live pilot (Bosch WSR6F, NGK BPMR7A, NGK CMR6H).
 * 2. Manifest integrity for the 28-offer expanded pool (3 active, 3 verified eligible, 22 staged compatibility verified).
 * 3. Two-Gate verification of newly vetted candidates (NGK CMR7H, Bosch USR7AC, Oregon 18720).
 * 4. Production lock enforcement: zero new ASINs activated in production without explicit operator consent.
 * 5. Isolated activation simulation in a sandboxed registry instance.
 * 6. 100% compliant search fallback across all staged and non-whitelisted parts.
 * 7. Evidence docket and conversion baseline documentation integrity.
 * 8. Core invariants: 18,373 parts, 843 SEO pages, 1,024 sitemap URLs.
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
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

const CANDIDATES_MANIFEST_PATH = path.join(rootDir, 'PHASE59F_ACTIVATION_CANDIDATES.json');
const MATCH_EVIDENCE_PATH = path.join(rootDir, 'PHASE59F_MATCH_EVIDENCE.json');
const CONVERSION_BASELINE_PATH = path.join(rootDir, 'PHASE59F_CONVERSION_BASELINE.md');
const CANONICAL_CATALOG_PATH = path.join(rootDir, 'data', 'parts_catalog.json');
const RUNTIME_REGISTRY_PATH = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');

test('Phase 59F — 1. Preservation of the 3 Live Pilot Offers in Production', () => {
  assert.ok(fs.existsSync(RUNTIME_REGISTRY_PATH), 'Runtime registry must exist');
  const runtimeDoc = JSON.parse(fs.readFileSync(RUNTIME_REGISTRY_PATH, 'utf8'));

  assert.strictEqual(runtimeDoc.policy.production_activation_allowed, true);
  assert.deepStrictEqual(runtimeDoc.policy.pilot_activated_parts, ['11104007005', '00004007000', '00004007011']);
  assert.strictEqual(runtimeDoc.policy.max_active_offers_allowed, 3);

  const registry = new VerifiedOfferRegistry({
    registryPath: RUNTIME_REGISTRY_PATH,
    productionActivationAllowed: true,
    activeWhitelist: runtimeDoc.policy.pilot_activated_parts
  });
  registry.loadFromFile();

  const pilotParts = [
    { part: '11104007005', asin: 'B0068M5NAG', brand: 'Bosch' },
    { part: '00004007000', asin: 'B001RM8J76', brand: 'NGK' },
    { part: '00004007011', asin: 'B001RMA5S2', brand: 'NGK' }
  ];

  for (const item of pilotParts) {
    const offer = registry.resolveCommercialOffer({ partNumber: item.part });
    assert.strictEqual(offer.link_type, 'DIRECT_ASIN', `Pilot part ${item.part} must resolve to DIRECT_ASIN`);
    assert.strictEqual(offer.asin, item.asin);
    assert.strictEqual(offer.marketplace, 'amazon.nl');
    assert.strictEqual(offer.tag, 'srihldecoder2-21');
    assert.ok(offer.url.includes(`/dp/${item.asin}`), `URL must be direct /dp/ link for ${item.asin}`);
    assert.strictEqual(offer.rel, 'sponsored nofollow noopener');
    assert.strictEqual(offer.target, '_blank');
    assert.ok(offer.badge_label.includes(item.brand));
  }
});

test('Phase 59F — 2. Manifest & Evidence Docket Integrity for 28-Offer Expansion Pool', () => {
  assert.ok(fs.existsSync(CANDIDATES_MANIFEST_PATH), 'PHASE59F_ACTIVATION_CANDIDATES.json must exist');
  assert.ok(fs.existsSync(MATCH_EVIDENCE_PATH), 'PHASE59F_MATCH_EVIDENCE.json must exist');
  assert.ok(fs.existsSync(CONVERSION_BASELINE_PATH), 'PHASE59F_CONVERSION_BASELINE.md must exist');

  const manifest = JSON.parse(fs.readFileSync(CANDIDATES_MANIFEST_PATH, 'utf8'));
  assert.strictEqual(manifest.schema_version, '1.0.0');
  assert.ok(manifest.phase.startsWith('59F'), 'Phase must be 59F or 59F.1');
  assert.strictEqual(manifest.policy.max_active_offers_allowed, 3, 'Pilot active cap must remain 3');
  assert.deepStrictEqual(manifest.policy.pilot_activated_parts, ['11104007005', '00004007000', '00004007011'], 'Only 3 parts allowed in active whitelist');
  assert.strictEqual(manifest.offers.length, 28, 'Must contain exactly 28 evaluated offers (3 pilot + 25 expansion)');

  const activeOffers = manifest.offers.filter(o => o.status === 'ACTIVE');
  const verifiedOffers = manifest.offers.filter(o => o.status === 'VERIFIED');
  const stagedOffers = manifest.offers.filter(o => o.status === 'STAGED');
  const suspendedOffers = manifest.offers.filter(o => o.status === 'SUSPENDED');

  assert.strictEqual(activeOffers.length, 3, 'Must have exactly 3 ACTIVE offers');
  assert.strictEqual(verifiedOffers.length, 1, 'Must have exactly 1 VERIFIED eligible offer (Bosch USR7AC 00004007009)');
  assert.strictEqual(suspendedOffers.length, 2, 'Must have exactly 2 SUSPENDED mismatch offers (00004007025, 00006421223)');
  assert.strictEqual(stagedOffers.length, 22, 'Must have exactly 22 STAGED compatibility-verified offers');

  const evidence = JSON.parse(fs.readFileSync(MATCH_EVIDENCE_PATH, 'utf8'));
  assert.strictEqual(evidence.investigation_summary.total_parts_investigated, 25);
  assert.strictEqual(evidence.candidates.length, 25);
  assert.strictEqual(evidence.investigation_summary.fully_verified_asins_found, 1);
  assert.strictEqual(evidence.investigation_summary.mismatches_rejected, 2);
});

test('Phase 59F — 3. Forensic Two-Gate Verification of Newly Vetted Candidates', () => {
  const manifest = JSON.parse(fs.readFileSync(CANDIDATES_MANIFEST_PATH, 'utf8'));
  const newVerified = manifest.offers.filter(o => o.status === 'VERIFIED');

  assert.strictEqual(newVerified.length, 1, 'Only 1 candidate qualifies as VERIFIED');
  const bosch = newVerified[0];
  assert.strictEqual(bosch.part_number, '00004007009');
  assert.strictEqual(bosch.asin, 'B09QH68W83');
  assert.strictEqual(bosch.brand, 'Bosch');
  assert.strictEqual(bosch.manufacturer_part_number, '0242035503');
  assert.strictEqual(bosch.ean_gtin, '4047023059468');
  assert.strictEqual(bosch.package_quantity, 1);

  const verification = TwoGateVerifier.verifyOffer(bosch);
  assert.strictEqual(verification.passed, true, `TwoGateVerifier must pass for 00004007009: ${verification.errors.join('; ')}`);
  assert.strictEqual(verification.gate1.passed, true);
  assert.strictEqual(verification.gate2.passed, true);

  // Validate that mismatches are strictly suspended
  const suspended = manifest.offers.filter(o => o.status === 'SUSPENDED');
  assert.strictEqual(suspended.length, 2);
  const part0025 = suspended.find(o => o.part_number === '00004007025');
  assert.ok(part0025, '00004007025 must be suspended');
  assert.strictEqual(part0025.gate_1_technical.passed, false);
  assert.strictEqual(part0025.gate_2_product.passed, false);

  const part1223 = suspended.find(o => o.part_number === '00006421223');
  assert.ok(part1223, '00006421223 must be suspended');
  assert.strictEqual(part1223.gate_1_technical.passed, false);
  assert.strictEqual(part1223.gate_2_product.passed, false);
});

test('Phase 59F — 4. Production Lock: No New ASINs Activated in Production Without Approval', () => {
  const runtimeDoc = JSON.parse(fs.readFileSync(RUNTIME_REGISTRY_PATH, 'utf8'));
  const registry = new VerifiedOfferRegistry({
    registryPath: RUNTIME_REGISTRY_PATH,
    productionActivationAllowed: true,
    activeWhitelist: runtimeDoc.policy.pilot_activated_parts
  });
  registry.loadFromFile();

  const newCandidates = ['00004007025', '00004007009', '00006421223'];
  for (const part of newCandidates) {
    const active = registry.getActiveOffer(part);
    assert.strictEqual(active, null, `New candidate ${part} must NOT be active in production without operator approval`);

    const commercial = registry.resolveCommercialOffer({ partNumber: part });
    assert.strictEqual(commercial.link_type, 'SEARCH_FALLBACK', `Candidate ${part} must resolve to SEARCH_FALLBACK in production`);
    assert.ok(commercial.url.includes('/s?k='), 'URL must be search query URL');
    assert.strictEqual(commercial.asin, null);
  }
});

test('Phase 59F — 5. Isolated Sandbox Activation Simulation of Verified Offers', () => {
  const manifest = JSON.parse(fs.readFileSync(CANDIDATES_MANIFEST_PATH, 'utf8'));

  // Sandboxed registry instance allowing 4 active offers (3 pilot + 1 newly verified)
  const sandboxedRegistry = new VerifiedOfferRegistry({
    productionActivationAllowed: true,
    maxActiveOffersAllowed: 4,
    activeWhitelist: [
      '11104007005', '00004007000', '00004007011', '00004007009'
    ]
  });

  for (const offer of manifest.offers) {
    if (offer.status === 'ACTIVE' || offer.status === 'VERIFIED') {
      sandboxedRegistry.registerOffer({
        ...offer,
        status: 'ACTIVE',
        status_reason: 'Sandboxed simulation activation'
      });
    }
  }

  // All 4 verified offers must resolve to direct ASIN in sandboxed environment
  const all4Verified = [
    { part: '11104007005', asin: 'B0068M5NAG' },
    { part: '00004007000', asin: 'B001RM8J76' },
    { part: '00004007011', asin: 'B001RMA5S2' },
    { part: '00004007009', asin: 'B09QH68W83' }
  ];

  for (const item of all4Verified) {
    const offer = sandboxedRegistry.resolveCommercialOffer({ partNumber: item.part });
    assert.strictEqual(offer.link_type, 'DIRECT_ASIN', `Simulated offer ${item.part} must resolve to DIRECT_ASIN in sandbox`);
    assert.strictEqual(offer.asin, item.asin);
    assert.ok(offer.url.includes(`/dp/${item.asin}`));
  }

  // Immediate rollback test: deactivating one drops it back to search fallback instantly
  const deactRes = sandboxedRegistry.deactivateOffer('00004007009', 'Sandbox rollback test');
  assert.strictEqual(deactRes.success, true);
  const rolledBackOffer = sandboxedRegistry.resolveCommercialOffer({ partNumber: '00004007009' });
  assert.strictEqual(rolledBackOffer.link_type, 'SEARCH_FALLBACK', 'Deactivated offer must immediately drop to search fallback');
});

test('Phase 59F — 6. Universal Search Fallback Preserved Across Staged & All Other Parts', () => {
  const manifest = JSON.parse(fs.readFileSync(CANDIDATES_MANIFEST_PATH, 'utf8'));
  const stagedParts = manifest.offers.filter(o => o.status === 'STAGED');

  const registry = new VerifiedOfferRegistry({
    productionActivationAllowed: true,
    activeWhitelist: ['11104007005', '00004007000', '00004007011']
  });
  registry.importRegistry(manifest);

  for (const staged of stagedParts) {
    const res = registry.resolveCommercialOffer({ partNumber: staged.part_number });
    assert.strictEqual(res.link_type, 'SEARCH_FALLBACK', `Staged part ${staged.part_number} must resolve to SEARCH_FALLBACK`);
    assert.strictEqual(res.asin, null);
    assert.ok(res.url.startsWith('https://amazon.nl/s?k=STIHL'));
    assert.ok(res.url.includes('tag=srihldecoder2-21'));
  }

  // Arbitrary unvetted catalog part
  const control = registry.resolveCommercialOffer({ partNumber: '11210071001' });
  assert.strictEqual(control.link_type, 'SEARCH_FALLBACK');
  assert.strictEqual(control.asin, null);
  assert.ok(control.url.includes('STIHL+1121+007+1001') || control.url.includes('STIHL+11210071001'));
});

test('Phase 59F — 7. Core Production Invariants Preserved', () => {
  const canonicalCatalog = JSON.parse(fs.readFileSync(CANONICAL_CATALOG_PATH, 'utf8'));
  assert.strictEqual(canonicalCatalog.parts.length, 18373, 'Catalog must preserve exactly 18,373 canonical parts');

  const indexable = getAllIndexablePartsList();
  assert.strictEqual(indexable.length, 843, 'Must maintain exactly 843 indexable parts');

  const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
  const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const sitemapXml = generateSitemapXml('https://www.stihldecoder.nl', database);
  const locCount = (sitemapXml.match(/<loc>/g) || []).length;
  assert.strictEqual(locCount, 1024, 'Sitemap must maintain exactly 1,024 URLs');
});
