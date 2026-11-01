/**
 * tests/phase59c_amazon_product_matching_pilot.test.js
 *
 * Phase 59C: Amazon Product Matching & Revenue Opportunity Pilot
 * Validates:
 * 1. Pilot Cohort Selection: exactly 200 parts prioritized by wear categories and model demand.
 * 2. Classification Schema: strict 6-tier classification (OEM, Aftermarket, Candidate, Search, Unavailable, Blocked).
 * 3. Evidence Quality: verified tiers require exact packaging/catalog proof; title matching alone is rejected.
 * 4. Production Read-Only Protection: zero ASINs published to runtime `amazon_part_offers.json`.
 * 5. Preserved Invariants: 18,373 parts, 843 indexable, 1,024 sitemap URLs, tag srihldecoder2-21.
 * 6. Search Fallback Protection: 100% of pilot parts have valid search fallback URLs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { renderAffiliateDisclosureHtml } from '../src/affiliate/AffiliateDisclosure.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const VALID_CLASSIFICATIONS = new Set([
  'VERIFIED_OEM_EXACT',
  'VERIFIED_AFTERMARKET_COMPATIBLE',
  'CANDIDATE_UNVERIFIED',
  'SEARCH_ONLY',
  'UNAVAILABLE',
  'ACCESS_BLOCKED'
]);

test('Phase 59C — 1. Pilot Cohort Selection & Catalog Grounding', () => {
  const pilotPath = path.join(ROOT_DIR, 'PHASE59C_PILOT_PARTS.json');
  assert.ok(fs.existsSync(pilotPath), 'PHASE59C_PILOT_PARTS.json must exist');

  const pilotDoc = JSON.parse(fs.readFileSync(pilotPath, 'utf8'));
  const pilotParts = pilotDoc.pilot_parts;

  // Exactly 200 pilot parts
  assert.equal(pilotParts.length, 200, 'Pilot cohort must contain exactly 200 parts');

  // Verify all 200 exist in canonical catalog
  const catalogPath = path.join(ROOT_DIR, 'data', 'parts_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const catalogMap = new Map(catalog.parts.map(p => [p.part_number, p]));

  for (const p of pilotParts) {
    assert.ok(catalogMap.has(p.part_number), `Part ${p.part_number} must exist in canonical catalog`);
    assert.ok(p.category, `Part ${p.part_number} must have a categorized wear profile`);
    assert.ok(typeof p.priority_score === 'number', `Part ${p.part_number} must have a priority score`);
    assert.ok(p.fitment_count >= 0, `Part ${p.part_number} must have a non-negative fitment count`);
  }

  // Verify high-priority wear categories are well represented
  const wearCategories = new Set(['SPARK_PLUG', 'AIR_FILTER', 'FUEL_FILTER', 'SPROCKET_CLUTCH_DRUM', 'STARTER_COMPONENTS', 'TRIMMER_HEAD', 'OIL_PUMP', 'CARBURETOR_PARTS', 'SAW_CHAIN', 'GUIDE_BAR']);
  const wearCount = pilotParts.filter(p => wearCategories.has(p.category)).length;
  assert.ok(wearCount >= 100, `At least 100 of the 200 parts must be high-wear maintenance parts, found ${wearCount}`);
});

test('Phase 59C — 2. Classification Schema & Evidence Demarcation', () => {
  const matchesPath = path.join(ROOT_DIR, 'PHASE59C_VERIFIED_MATCHES.json');
  assert.ok(fs.existsSync(matchesPath), 'PHASE59C_VERIFIED_MATCHES.json must exist');

  const matchesDoc = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
  const matches = matchesDoc.matches;

  assert.equal(matches.length, 200, 'Matches document must audit exactly 200 parts');

  const counts = {};
  for (const m of matches) {
    assert.ok(VALID_CLASSIFICATIONS.has(m.classification), `Invalid classification: ${m.classification}`);
    counts[m.classification] = (counts[m.classification] || 0) + 1;

    // Search fallback URL must be present for ALL parts
    assert.ok(
      m.search_fallback_url && m.search_fallback_url.startsWith('https://www.amazon.nl/s?k='),
      `Part ${m.part_number} must have a valid Amazon.nl search fallback URL`
    );
    assert.ok(
      m.search_fallback_url.includes('tag=srihldecoder2-21'),
      `Part ${m.part_number} search fallback URL must retain affiliate tag`
    );

    // Rule: Title match alone is insufficient for VERIFIED
    if (m.classification === 'VERIFIED_OEM_EXACT') {
      assert.ok(m.asin, `VERIFIED_OEM_EXACT part ${m.part_number} must have a verified ASIN`);
      assert.ok(m.evidence.mpn_confirmed === true, `VERIFIED_OEM_EXACT part ${m.part_number} must confirm MPN`);
      assert.ok(m.can_use_direct_affiliate_link === true);
    } else if (m.classification === 'VERIFIED_AFTERMARKET_COMPATIBLE') {
      assert.ok(m.asin, `VERIFIED_AFTERMARKET_COMPATIBLE part ${m.part_number} must have a verified ASIN`);
      assert.ok(m.evidence.mpn_confirmed === true, `VERIFIED_AFTERMARKET_COMPATIBLE part ${m.part_number} must confirm MPN`);
      assert.ok(m.can_use_direct_affiliate_link === true);
    } else if (m.classification === 'CANDIDATE_UNVERIFIED') {
      // Must NOT be eligible for direct link publication
      assert.equal(m.can_use_direct_affiliate_link, false, `CANDIDATE_UNVERIFIED ${m.part_number} must not be direct link eligible`);
      assert.equal(m.evidence.mpn_confirmed, false, `CANDIDATE_UNVERIFIED must have unconfirmed MPN`);
    } else {
      assert.equal(m.can_use_direct_affiliate_link, false);
      assert.equal(m.direct_amazon_url, null);
    }
  }

  // Verify all 6 tiers exist in the audit
  assert.ok(counts['VERIFIED_OEM_EXACT'] > 0, 'Must have VERIFIED_OEM_EXACT records');
  assert.ok(counts['VERIFIED_AFTERMARKET_COMPATIBLE'] > 0, 'Must have VERIFIED_AFTERMARKET_COMPATIBLE records');
  assert.ok(counts['CANDIDATE_UNVERIFIED'] > 0, 'Must have CANDIDATE_UNVERIFIED records');
  assert.ok(counts['SEARCH_ONLY'] > 0, 'Must have SEARCH_ONLY records');
  assert.ok(counts['UNAVAILABLE'] > 0, 'Must have UNAVAILABLE records');
  assert.ok(counts['ACCESS_BLOCKED'] > 0, 'Must have ACCESS_BLOCKED records');
});

test('Phase 59C — 3. Production Read-Only Isolation & Invariant Protection', () => {
  // 1. Catalog parts must remain 18,373
  const catalogPath = path.join(ROOT_DIR, 'data', 'parts_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.equal(catalog.parts.length, 18373, 'Catalog parts must remain exactly 18,373');

  // 2. Production manual ASIN offers file must remain EMPTY (0 published offers)
  const offersPath = path.join(ROOT_DIR, 'data', 'affiliate', 'amazon_part_offers.json');
  const offersDoc = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
  const activeOffers = Array.isArray(offersDoc) ? offersDoc : (offersDoc.offers || []);
  assert.equal(activeOffers.length, 0, 'Production runtime offers must remain 0 (no automatic ASIN promotion)');

  // 3. Indexable SEO parts remain 843
  const indexable = getAllIndexablePartsList();
  assert.equal(indexable.length, 843, 'Indexable parts must remain exactly 843');

  // 4. Sitemap URL count remains 1,024
  const dbPath = path.join(ROOT_DIR, 'data', 'stihl_database.json');
  const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const sitemapXml = generateSitemapXml('https://www.stihldecoder.nl', database);
  const locCount = (sitemapXml.match(/<loc>/g) || []).length;
  assert.equal(locCount, 1024, 'Sitemap URLs must remain exactly 1,024');

  // 5. Phase 59B disclosures and compliance intact
  const disclosureHtml = renderAffiliateDisclosureHtml();
  assert.ok(disclosureHtml.includes('As an Amazon Associate I earn from qualifying purchases.'));
  assert.ok(disclosureHtml.includes('Als Amazon-partner verdien ik aan kwalificerende aankopen.'));
  assert.ok(disclosureHtml.includes('href="/privacy"'));
});

test('Phase 59C — 4. Feasibility & Implementation Deliverables Integrity', () => {
  const feasibilityPath = path.join(ROOT_DIR, 'PHASE59C_AMAZON_API_FEASIBILITY.md');
  const commercialPath = path.join(ROOT_DIR, 'PHASE59C_COMMERCIAL_OPPORTUNITIES.md');
  const planPath = path.join(ROOT_DIR, 'PHASE59C_IMPLEMENTATION_PLAN.md');
  const auditPath = path.join(ROOT_DIR, 'PHASE59C_PRODUCT_MATCHING_AUDIT.md');

  assert.ok(fs.existsSync(feasibilityPath), 'PHASE59C_AMAZON_API_FEASIBILITY.md must exist');
  assert.ok(fs.existsSync(commercialPath), 'PHASE59C_COMMERCIAL_OPPORTUNITIES.md must exist');
  assert.ok(fs.existsSync(planPath), 'PHASE59C_IMPLEMENTATION_PLAN.md must exist');
  assert.ok(fs.existsSync(auditPath), 'PHASE59C_PRODUCT_MATCHING_AUDIT.md must exist');

  const feasibilityContent = fs.readFileSync(feasibilityPath, 'utf8');
  assert.ok(feasibilityContent.includes('PA-API 5.0'));
  assert.ok(feasibilityContent.includes('3 qualifying referred sales'));
  assert.ok(feasibilityContent.includes('24 hours') || feasibilityContent.includes('24-hour'));

  const commercialContent = fs.readFileSync(commercialPath, 'utf8');
  assert.ok(commercialContent.includes('Proven Data'));
  assert.ok(commercialContent.includes('Technical Estimates'));
  assert.ok(commercialContent.includes('Unknown Data'));

  const planContent = fs.readFileSync(planPath, 'utf8');
  assert.ok(planContent.includes('Two-Gate Verification'));
  assert.ok(planContent.includes('Phase 59D'));
});
