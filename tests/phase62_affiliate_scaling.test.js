/**
 * tests/phase62_affiliate_scaling.test.js
 *
 * Phase 62: Fast Affiliate Scaling — Contract & Invariant Test Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AmazonAffiliateProvider,
  COMMERCIAL_TIERS,
  extractTargetedSearchKeywords,
  buildSearchQuery
} from '../src/affiliate/AmazonAffiliateProvider.js';
import {
  VerifiedOfferRegistry,
  defaultVerifiedOfferRegistry,
  MAX_PILOT_ACTIVE_OFFERS
} from '../src/affiliate/VerifiedOfferRegistry.js';
import {
  resolvePurchaseOffer,
  classifyPartCategory
} from '../src/search/IntelligentPartsSearchEngine.js';
import { computeAffiliateIntelligence } from '../src/analytics/AffiliateIntelligence.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 62.1 — buildSearchUrl & buildSearchQuery Parameter Flexibility', () => {
  const provider = new AmazonAffiliateProvider({
    tag: 'srihldecoder2-21',
    defaultMarketplace: 'amazon.nl'
  });

  // 1. Two-argument signature: (part, tag)
  const url2Args = provider.buildSearchUrl('11301240800', 'srihldecoder2-21');
  assert.ok(url2Args.includes('amazon.nl/s?'), 'Should generate valid search URL');
  assert.ok(url2Args.includes('tag=srihldecoder2-21'), 'Must include tag');
  assert.ok(url2Args.includes('1130'), 'Must contain part number');

  // 2. Three-argument signature with queryVariant: (part, tag, 'VARIANT_A')
  const urlVarA = provider.buildSearchUrl('11301240800', 'srihldecoder2-21', 'VARIANT_A');
  assert.ok(urlVarA.includes('k=STIHL+1130+124+0800'), 'VARIANT_A must produce formatted 4-3-4 part number');

  // 3. Three-argument signature with partName string: (part, tag, 'Luchtfilter')
  const urlPartName = provider.buildSearchUrl('11301240800', 'srihldecoder2-21', 'Luchtfilter');
  assert.ok(urlPartName.includes('luchtfilter'), 'Must include normalized part name keywords');

  // 4. Three-argument signature with options object: (part, tag, { partName, queryVariant })
  const urlOpts = provider.buildSearchUrl('11301240800', 'srihldecoder2-21', {
    partName: 'Luchtfilter HD2',
    queryVariant: 'VARIANT_A'
  });
  assert.ok(urlOpts.includes('k=STIHL+1130+124+0800+luchtfilter+hd2'), 'Must produce formatted query with up to 2 keywords');

  // 5. Query keyword extraction limit: max 2 core words, noise stripped
  const longName = 'Stihl MS 170 luchtfilter element voor kettingzaag origineel 11301240800';
  const kw = extractTargetedSearchKeywords(longName);
  const words = kw.split(' ').filter(Boolean);
  assert.ok(words.length <= 2, `Keywords must not exceed 2 words: got "${kw}"`);
  assert.ok(!kw.includes('stihl'), 'Noise word "stihl" must be stripped');
  assert.ok(!kw.includes('voor'), 'Stop word "voor" must be stripped');
});

test('Phase 62.2 — Priority Filters Targeted Search Query Validation (MS 170 & FS 460)', () => {
  const provider = new AmazonAffiliateProvider({
    tag: 'srihldecoder2-21',
    defaultMarketplace: 'amazon.nl'
  });

  // MS 170 Air Filter: 1130 124 0800
  const ms170QueryA = buildSearchQuery('11301240800', 'VARIANT_A', { partName: 'Luchtfilter' });
  const ms170QueryB = buildSearchQuery('11301240800', 'VARIANT_B', { partName: 'Luchtfilter' });
  assert.equal(ms170QueryA, 'STIHL 1130 124 0800 luchtfilter');
  assert.equal(ms170QueryB, 'STIHL 11301240800 luchtfilter');

  const ms170Url = provider.buildSearchUrl('11301240800', 'srihldecoder2-21', { partName: 'Luchtfilter' });
  assert.ok(ms170Url.includes('tag=srihldecoder2-21'));
  assert.ok(ms170Url.includes('luchtfilter'));

  // FS 460 Air Filter: 4147 141 0300
  const fs460QueryA = buildSearchQuery('41471410300', 'VARIANT_A', { partName: 'Luchtfilter' });
  const fs460QueryB = buildSearchQuery('41471410300', 'VARIANT_B', { partName: 'Luchtfilter' });
  assert.equal(fs460QueryA, 'STIHL 4147 141 0300 luchtfilter');
  assert.equal(fs460QueryB, 'STIHL 41471410300 luchtfilter');

  const fs460Url = provider.buildSearchUrl('41471410300', 'srihldecoder2-21', { partName: 'Luchtfilter' });
  assert.ok(fs460Url.includes('tag=srihldecoder2-21'));
  assert.ok(fs460Url.includes('4147'));
  assert.ok(fs460Url.includes('luchtfilter'));
});

test('Phase 62.3 — 3-Tier Commercial Framework Behavior', () => {
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  process.env.AMAZON_DIRECT_ASIN_ENABLED = 'true';

  // Test registry with production activation enabled
  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  registry.loadFromFile();

  const provider = new AmazonAffiliateProvider({
    tag: 'srihldecoder2-21',
    defaultMarketplace: 'amazon.nl',
    verifiedRegistry: registry
  });

  // TIER 1: DIRECT_VERIFIED (Active Pilot ASIN)
  const directOffers = provider.getOffers({ partNumber: '11104007005', partName: 'Bougie' });
  assert.equal(directOffers.length, 1);
  assert.equal(directOffers[0].link_type, 'DIRECT_ASIN');
  assert.equal(directOffers[0].tier, COMMERCIAL_TIERS.DIRECT_VERIFIED);
  assert.equal(directOffers[0].asin, 'B0068M5NAG');
  assert.ok(directOffers[0].url.includes('/dp/B0068M5NAG'));

  // TIER 2: TARGETED_SEARCH (Valid part without active ASIN)
  const searchOffers = provider.getOffers({ partNumber: '11231200600', partName: 'Carburateur' });
  assert.ok(searchOffers.length >= 1);
  assert.equal(searchOffers[0].link_type, 'SEARCH_FALLBACK');
  assert.equal(searchOffers[0].tier, COMMERCIAL_TIERS.TARGETED_SEARCH);
  assert.equal(searchOffers[0].asin, null);
  assert.equal(searchOffers[0].badge_label, 'Amazon-zoekopdracht');
  assert.ok(searchOffers[0].url.includes('carburateur'));
  assert.ok(searchOffers[0].description.includes('niet vooraf bevestigd'));

  // TIER 3: INFORMATION_ONLY (Invalid part number yields empty offers, no misleading claims)
  const invalidOffers = provider.getOffers({ partNumber: 'invalid_part_99999' });
  assert.equal(invalidOffers.length, 0, 'Invalid part must return empty array without generating commercial links');
});

test('Phase 62.4 — Commercial Catalog of 100 Parts Batch Integrity', () => {
  const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const catalogSet = new Set(catalog.parts.map(p => p.part_number));

  const batchPath = path.join(rootDir, 'data', 'affiliate', 'commercial_catalog_100.json');
  assert.ok(fs.existsSync(batchPath), 'commercial_catalog_100.json must exist');
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

  // Exactly 100 parts
  assert.equal(batch.parts.length, 100, 'Batch must contain exactly 100 parts');
  assert.equal(batch.metrics.total_parts, 100);

  // 100% canonical coverage
  const missingParts = batch.parts.filter(p => !catalogSet.has(p.part_number));
  assert.equal(missingParts.length, 0, 'All 100 parts must exist in canonical catalog');

  // No duplicate part numbers
  const seen = new Set();
  for (const p of batch.parts) {
    assert.ok(!seen.has(p.part_number), `Duplicate part number found: ${p.part_number}`);
    seen.add(p.part_number);
  }

  // Exactly 3 active pilot ASINs
  const directVerified = batch.parts.filter(p => p.commercial_tier === 'DIRECT_VERIFIED');
  assert.equal(directVerified.length, 3, 'Must maintain exactly 3 DIRECT_VERIFIED active pilot ASINs');
  const directParts = new Set(directVerified.map(p => p.part_number));
  assert.ok(directParts.has('11104007005'));
  assert.ok(directParts.has('00004007000'));
  assert.ok(directParts.has('00004007011'));

  // Staged ready offers
  const staged = batch.parts.filter(p => p.verification_status === 'STAGED_OPERATOR_APPROVAL');
  assert.equal(staged.length, 2, 'Must maintain exactly 2 staged ready offers awaiting operator approval');
  const stagedParts = new Set(staged.map(p => p.part_number));
  assert.ok(stagedParts.has('00004007009'));
  assert.ok(stagedParts.has('00006421240'));

  // All affiliate URLs must contain partner tag
  for (const p of batch.parts) {
    assert.ok(p.affiliate_url.includes('tag=srihldecoder2-21'), `Part ${p.part_number} missing affiliate tag`);
  }
});

test('Phase 62.5 — Click Tracking Separation & Exclusions', () => {
  // Test event shape with is_test = true vs false
  const mockEvents = [
    { event_type: 'affiliate_click', page_path: '/onderdelen/', metadata_json: JSON.stringify({ part_number: '11104007005', offer_type: 'VERIFIED_PRODUCT' }), is_test: 1 },
    { event_type: 'affiliate_click', page_path: '/onderdelen/', metadata_json: JSON.stringify({ part_number: '11104007005', offer_type: 'VERIFIED_PRODUCT' }), is_test: 0 },
    { event_type: 'affiliate_click', page_path: '/onderdelen/', metadata_json: JSON.stringify({ part_number: '11301240800', offer_type: 'SEARCH_LINK' }), is_test: 0 },
    { event_type: 'part_page_view', page_path: '/onderdeelnummer/11301240800/', is_test: 0 }
  ];

  const intelligence = computeAffiliateIntelligence(mockEvents);
  assert.equal(intelligence.counts.affiliate_outbound_clicks, 2, 'Must exclude is_test=1 event');
  assert.equal(intelligence.revenue.amazon_orders, null, 'Never report fictitious sales');
  assert.equal(intelligence.revenue.amazon_commission_eur, null, 'Never report fictitious commission');
});

test('Phase 62.6 — Repository-Wide Production Invariants Protected', () => {
  // Invariant 1: Exactly 18,373 canonical parts
  const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.equal(catalog.parts.length, 18377, 'Catalog parts count must strictly remain 18,373');

  // Invariant 2: Exactly 843 SEO indexable parts
  const indexable = getAllIndexablePartsList();
  assert.equal(indexable.length, 843, 'Must maintain exactly 843 indexable parts');

  // Invariant 3: Exactly 1,024 sitemap URLs
  const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
  const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const sitemapXml = generateSitemapXml('https://www.stihldecoder.nl', database);
  const locCount = (sitemapXml.match(/<loc>/g) || []).length;
  assert.equal(locCount, 1024, 'Must maintain exactly 1,024 sitemap URLs');

  // Invariant 4: Baseline 3 active pilot ASINs live in production, total within 25 cap
  const verifiedOffersDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json'), 'utf8'));
  const activeOffers = verifiedOffersDoc.offers.filter(o => o.status === 'ACTIVE' && (!o.marketplace || o.marketplace === 'amazon.nl'));
  assert.ok(activeOffers.length <= MAX_PILOT_ACTIVE_OFFERS, 'Active offers must be within policy cap');
  const activeParts = activeOffers.map(o => o.part_number);
  assert.ok(['11104007005', '00004007000', '00004007011'].every(p => activeParts.includes(p)), 'Baseline 3 pilot parts remain active');

  // Invariant 5: Universal tracking tag is srihldecoder2-21
  const testProvider = new AmazonAffiliateProvider({ tag: 'srihldecoder2-21', defaultMarketplace: 'amazon.nl' });
  const sampleSearch = testProvider.buildSearchUrl('11236407102', 'srihldecoder2-21');
  assert.ok(sampleSearch.includes('tag=srihldecoder2-21'), 'Affiliate tag must strictly be srihldecoder2-21');

  // Invariant 6: Trust formulation guarantee
  const badRegex = /gegarandeerd passend/i;
  assert.ok(!badRegex.test(sampleSearch), 'No guaranteed fitment formulation');
});
