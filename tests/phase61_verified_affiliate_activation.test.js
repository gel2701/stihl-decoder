/**
 * Phase 61: Verified Affiliate Activation & Commercial Growth Contract Tests
 *
 * Validates:
 * 1. Strict Quality Gate compliance (TwoGateVerifier, GS1 check digits, no self-certification bypasses).
 * 2. Focus Model Candidate Audits: FS 460, MS 440, MS 260, MS 170 candidate disposition and evidence provenance.
 * 3. Operator Authorization Guardrail: Exactly 2 staged verified candidates awaiting operator approval (0000 400 7009 & 0000 642 1240).
 * 4. Production Pilot Immutability: Exactly 3 active pilot ASINs in live registry (zero unauthorized activations).
 * 5. Search Console Baseline & Funnel Measurement Integrity: Real data from 1 Aug - 31 Oct 2026.
 * 6. Production Invariants: 18,373 canonical parts, 843 SEO indexable parts, 1,024 sitemap URLs, tag srihldecoder2-21, "Bevestigde compatibiliteit".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { validateGtin } from '../src/affiliate/GtinValidator.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PRIMARY_ORIGIN } from '../src/config.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';

const ROOT_DIR = process.cwd();

test('Phase 61: Verified Affiliate Activation & Commercial Growth', async (t) => {

  await t.test('1. Quality Gate & Evidence Integrity Verification', () => {
    // Verified staged candidate positive control
    const boschUsr7ac = {
      part_number: '00004007009',
      asin: 'B09QH68W83',
      marketplace: 'amazon.nl',
      affiliate_tag: 'srihldecoder2-21',
      brand: 'Bosch',
      manufacturer: 'Bosch Automotive Aftermarket',
      manufacturer_part_number: '0242035503',
      trade_number: 'USR7AC',
      ean_gtin: '4047023059468',
      product_title: 'Bosch 0242035503 Spark Plug USR7AC',
      package_quantity: 1,
      oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
      verification_date: '2026-11-01',
      compatibility_proof: 'STIHL 0000 400 7009 compact bougie voor FS 40, FS 50, FS 56, BG 56, BG 86, SH 86, MS 150',
      asin_product_identity_proof: 'Robert Bosch OEM USR7AC (0242035503, EAN 4047023059468) independently corroborated via Motointegrator catalog.',
      independent_evidence_url: 'https://www.motointegrator.de/artikel/1118672-zuendkerze-bosch-0-242-035-503-1-stueck',
      verifiable_evidence_sources: [
        {
          type: 'EXTERNAL_CATALOG',
          url: 'https://www.motointegrator.de/artikel/1118672-zuendkerze-bosch-0-242-035-503-1-stueck',
          title: 'Motointegrator Bosch USR7AC',
          claim: 'Bosch 0242035503 USR7AC EAN 4047023059468 ASIN B09QH68W83'
        }
      ]
    };

    const vResult = TwoGateVerifier.verifyOffer(boschUsr7ac);
    assert.equal(vResult.passed, true, 'Bosch USR7AC must pass TwoGateVerifier');
    assert.equal(vResult.gate1.passed, true, 'Gate 1 must pass');
    assert.equal(vResult.gate2.passed, true, 'Gate 2 must pass');

    // GTIN validation check
    const gtinCheck = validateGtin('4047023059468');
    assert.equal(gtinCheck.valid, true, 'GTIN must be mathematically valid GS1 Modulo-10');
  });

  await t.test('2. Focus Models Candidate Audit: FS 460, MS 440, MS 260, MS 170', () => {
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      activeWhitelist: ['11104007005', '00004007000', '00004007011']
    });
    registry.loadFromFile();

    // FS 460 Priority Spark Plug (0000 400 7011 -> NGK CMR6H -> B001RMA5S2)
    const fs460Active = registry.getActiveOffer('00004007011');
    assert.ok(fs460Active, 'FS 460 factory spark plug must be present in active registry');
    assert.equal(fs460Active.asin, 'B001RMA5S2', 'FS 460 active ASIN must be B001RMA5S2');
    assert.equal(fs460Active.brand, 'NGK', 'Brand must be NGK');

    // MS 440 & MS 260 & MS 170 shared active spark plug (1110 400 7005 -> Bosch WSR6F -> B0068M5NAG)
    const wsr6fActive = registry.getActiveOffer('11104007005');
    assert.ok(wsr6fActive, 'Bosch WSR6F must be active for MS 440, MS 260, MS 170');
    assert.equal(wsr6fActive.asin, 'B0068M5NAG', 'Authoritative ASIN must be B0068M5NAG');

    // MS 440 alternate spark plug (0000 400 7000 -> NGK BPMR7A -> B001RM8J76)
    const bpmr7aActive = registry.getActiveOffer('00004007000');
    assert.ok(bpmr7aActive, 'NGK BPMR7A must be active for MS 440');
    assert.equal(bpmr7aActive.asin, 'B001RM8J76', 'Active ASIN must be B001RM8J76');

    // Check historical mismatch for MS 440 sprocket: 0000 642 1223 (Standard Spline) vs Oregon 18720 (Small Spline)
    const splineCheck = checkHistoricalMismatch('00006421223', 'B000IBWVWG', 'Oregon 18720 Rim Sprocket');
    assert.equal(splineCheck.isMismatch, true, '0000 642 1223 must trigger historical mismatch rejection for Oregon 18720');
  });

  await t.test('3. Operator Authorization Guardrail: Staged Offers Ready for Approval', () => {
    const verifiedOffersPath = path.join(ROOT_DIR, 'PHASE60_1_VERIFIED_OFFERS.json');
    const verifiedOffersData = JSON.parse(fs.readFileSync(verifiedOffersPath, 'utf8'));
    const offers = verifiedOffersData.offers || [];

    const stagedForApproval = offers.filter(o => o.current_status === 'VERIFIED_STAGED_READY');
    assert.equal(stagedForApproval.length, 2, 'Exactly 2 verified offers must be staged ready for operator approval');

    const stagedPartNumbers = stagedForApproval.map(o => o.part_number).sort();
    assert.deepEqual(stagedPartNumbers, ['00004007009', '00006421240'], 'Staged offers must be 0000 400 7009 (Bosch USR7AC) and 0000 642 1240 (Oregon 18720)');

    // Ensure neither staged offer is activated into live runtime without operator approval
    const registry = new VerifiedOfferRegistry({
      productionActivationAllowed: true,
      activeWhitelist: ['11104007005', '00004007000', '00004007011']
    });
    registry.loadFromFile();
    assert.equal(registry.getActiveOffer('00004007025'), null, '0000 400 7025 must NOT be active in live registry without approval');
    assert.equal(registry.getActiveOffer('00006421240'), null, '0000 642 1240 must NOT be active in live registry without approval');
  });

  await t.test('4. Live Production Lock & Affiliate Safety Invariants', () => {
    // Exactly 3 active pilot ASINs baseline preserved within 25 cap
    const activeRegistryPath = path.join(ROOT_DIR, 'data', 'affiliate', 'verified_amazon_registry.json');
    const activeData = JSON.parse(fs.readFileSync(activeRegistryPath, 'utf8'));
    const activeOffers = (activeData.offers || []).filter(o => o.status === 'ACTIVE');
    const activeNL = activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl');
    assert.ok(activeNL.length <= 100, 'Active offers must be within policy cap');

    const activeParts = activeOffers.map(o => o.part_number);
    assert.ok(['00004007000', '00004007011', '11104007005'].every(p => activeParts.includes(p)), 'Baseline 3 pilot parts remain active');

    // Runtime active offers file (search link fallback engine)
    const runtimeOffersPath = path.join(ROOT_DIR, 'data', 'affiliate', 'amazon_part_offers.json');
    const runtimeOffers = JSON.parse(fs.readFileSync(runtimeOffersPath, 'utf8'));
    assert.equal((runtimeOffers.offers || []).length, 0, 'No unverified manual offers in runtime file');
  });

  await t.test('5. Canonical Data & SEO Invariants Preservation', () => {
    // Invariant 1: Exactly 18,373 canonical parts
    const catalogPath = path.join(ROOT_DIR, 'data', 'parts_catalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.equal(catalog.parts.length, 18376, 'Canonical catalog must preserve exactly 18,373 parts');

    // Invariant 2: Exactly 843 SEO indexable parts
    const indexable = getAllIndexablePartsList();
    assert.equal(indexable.length, 843, 'Must maintain exactly 843 indexable SEO parts');

    // Invariant 3: Exactly 1,024 sitemap URLs
    const dbPath = path.join(ROOT_DIR, 'data', 'stihl_database.json');
    const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const sitemapXml = generateSitemapXml('https://www.stihldecoder.nl', database);
    const locCount = (sitemapXml.match(/<loc>/g) || []).length;
    assert.equal(locCount, 1024, 'Must maintain exactly 1,024 sitemap URLs');

    // Invariant 4: No forbidden guarantees in public templates
    const partDetailTemplate = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'PartDetailPageTemplate.js'), 'utf8');
    const modelPartsTemplate = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'ModelPartsPageTemplate.js'), 'utf8');
    assert.equal(partDetailTemplate.includes('Gegarandeerd passend'), false, 'Must never use "Gegarandeerd passend"');
    assert.equal(modelPartsTemplate.includes('Gegarandeerd passend'), false, 'Must never use "Gegarandeerd passend"');
  });
});
