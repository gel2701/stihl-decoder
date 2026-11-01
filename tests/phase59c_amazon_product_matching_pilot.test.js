/**
 * tests/phase59c_amazon_product_matching_pilot.test.js
 *
 * Phase 59C.1: Active Evidence Recovery & Amazon Product Match Verification
 * Validates:
 * 1. Pilot Cohort Selection: exactly 200 parts prioritized by wear categories and model demand.
 * 2. Active Evidence Recovery Schema: validates distinct investigation statuses:
 *    VERIFIED_COMPLETE, PART_COMPATIBILITY_VERIFIED, INCORRECT_MATCH_CONFIRMED, etc.
 * 3. Specific Correction Assertions:
 *    - 1110 400 7005 -> Bosch WSR6F (ASIN B0068M5NAG)
 *    - 0000 400 7000 -> NGK BPMR7A (ASIN B001RM8J76)
 *    - 0000 400 7011 -> NGK CMR6H (ASIN B001RMA5S2)
 *    - 0000 350 3518, 1123 640 2074, 4238 140 1800 confirmed as INCORRECT_MATCH_CONFIRMED.
 * 4. OEM Brand Distinction: Bosch/NGK classified as OEM_SUPPLIER_EQUIVALENT, not GENUINE_STIHL.
 * 5. Production Read-Only Protection: zero ASINs published to runtime `amazon_part_offers.json`.
 * 6. Preserved Invariants: 18,373 parts, 843 indexable, 1,024 sitemap URLs, tag srihldecoder2-21.
 * 7. Search Fallback Protection: 100% of pilot parts have valid search fallback URLs.
 * 8. Creators API Documentation: PA-API deprecation (May 15, 2026) and Creators API OAuth2 documented.
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

const VALID_INVESTIGATION_STATUSES = new Set([
  'VERIFIED_COMPLETE',
  'PART_COMPATIBILITY_VERIFIED',
  'AMAZON_IDENTITY_VERIFIED',
  'EVIDENCE_RECOVERY_IN_PROGRESS',
  'INCORRECT_MATCH_CONFIRMED',
  'NOT_AVAILABLE'
]);

const VALID_OEM_BRANDS = new Set([
  'GENUINE_STIHL',
  'OEM_SUPPLIER_EQUIVALENT',
  'MANUFACTURER_AFTERMARKET',
  'UNVERIFIED_AFTERMARKET'
]);

const REQUIRED_EVIDENCE_FIELDS = [
  'source_name',
  'source_url_or_doc',
  'manufacturer_mpn_evidence',
  'compatibility_evidence',
  'asin_identity_evidence',
  'verification_date',
  'evidence_limitations',
  'final_classification'
];

test('Phase 59C.1 — 1. Pilot Cohort Selection & Catalog Grounding', () => {
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

test('Phase 59C.1 — 2. Active Evidence Recovery Schema & Multi-Round Investigation Assertions', () => {
  const matchesPath = path.join(ROOT_DIR, 'PHASE59C_VERIFIED_MATCHES.json');
  assert.ok(fs.existsSync(matchesPath), 'PHASE59C_VERIFIED_MATCHES.json must exist');

  const matchesDoc = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
  const matches = matchesDoc.matches;
  const metrics = matchesDoc.metrics;

  assert.equal(matches.length, 200, 'Matches document must audit exactly 200 parts');

  // Metric validations from active evidence recovery
  assert.equal(metrics.original_matches_investigated, 19, 'Must investigate all 19 original candidates');
  assert.equal(metrics.verified_complete, 3, 'Must have exactly 3 VERIFIED_COMPLETE matches');
  assert.equal(metrics.part_compatibility_verified, 13, 'Must have exactly 13 PART_COMPATIBILITY_VERIFIED matches');
  assert.equal(metrics.incorrect_match_confirmed, 3, 'Must have exactly 3 INCORRECT_MATCH_CONFIRMED matches');
  assert.equal(metrics.correct_replacement_found, 4, 'Must have found 4 verified replacements (3 ASINs + 1 MPN)');

  const matchMap = new Map(matches.map(m => [m.part_number, m]));

  // 1. Check 1110 400 7005 -> Bosch WSR6F
  const bosch = matchMap.get('11104007005');
  assert.ok(bosch, '1110 400 7005 must be audited');
  assert.equal(bosch.investigation_status, 'VERIFIED_COMPLETE');
  assert.equal(bosch.oem_brand_classification, 'OEM_SUPPLIER_EQUIVALENT');
  assert.equal(bosch.verified_replacement_asin, 'B0068M5NAG');
  assert.ok(bosch.evidence.manufacturer_mpn_evidence.includes('0242240506'));
  assert.equal(bosch.evidence.independent_evidence_url, 'https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck');
  assert.ok(bosch.evidence.confirmed_product_identity.includes('0242240506'));
  assert.ok(bosch.evidence.confirmed_stihl_compatibility.includes('1110 400 7005'));
  assert.ok(bosch.evidence.confirmed_marketplace_availability.includes('amazon.nl'));

  // 2. Check 0000 400 7000 -> NGK BPMR7A (Corrected from earlier CMR6H hallucination)
  const bpmr7a = matchMap.get('00004007000');
  assert.ok(bpmr7a, '0000 400 7000 must be audited');
  assert.equal(bpmr7a.investigation_status, 'VERIFIED_COMPLETE');
  assert.equal(bpmr7a.oem_brand_classification, 'OEM_SUPPLIER_EQUIVALENT');
  assert.equal(bpmr7a.verified_replacement_asin, 'B001RM8J76');
  assert.ok(bpmr7a.evidence.manufacturer_mpn_evidence.includes('BPMR7A') || bpmr7a.evidence.manufacturer_mpn_evidence.includes('6703'));
  assert.equal(bpmr7a.evidence.independent_evidence_url, 'https://amzchart.com/product-research/spark-plugs-15716421');
  assert.ok(bpmr7a.evidence.confirmed_product_identity.includes('B001RM8J76'));
  assert.ok(bpmr7a.evidence.confirmed_stihl_compatibility.includes('0000 400 7000'));
  assert.ok(bpmr7a.evidence.confirmed_marketplace_availability.includes('amazon.nl'));

  // 3. Check 0000 400 7011 -> NGK CMR6H
  const cmr6h = matchMap.get('00004007011');
  assert.ok(cmr6h, '0000 400 7011 must be audited');
  assert.equal(cmr6h.investigation_status, 'VERIFIED_COMPLETE');
  assert.equal(cmr6h.oem_brand_classification, 'OEM_SUPPLIER_EQUIVALENT');
  assert.equal(cmr6h.verified_replacement_asin, 'B001RMA5S2');
  assert.equal(cmr6h.evidence.independent_evidence_url, 'https://www.motointegrator.de/artikel/842061-zuendkerze-ngk-cmr6h-3365-1-stueck');
  assert.ok(cmr6h.evidence.confirmed_product_identity.includes('3365'));
  assert.ok(cmr6h.evidence.confirmed_stihl_compatibility.includes('0000 400 7011'));
  assert.ok(cmr6h.evidence.confirmed_marketplace_availability.includes('amazon.nl'));

  // 4. Check incorrect pairings identified and rejected
  const fuelFilter = matchMap.get('00003503518');
  assert.equal(fuelFilter.investigation_status, 'INCORRECT_MATCH_CONFIRMED');
  assert.ok(fuelFilter.discrepancy_found.includes('Kohler'));

  const sprocket = matchMap.get('11236402074');
  assert.equal(sprocket.investigation_status, 'INCORRECT_MATCH_CONFIRMED');
  assert.ok(sprocket.discrepancy_found.includes('Husqvarna') || sprocket.discrepancy_found.includes('Poulan'));

  const airFilter = matchMap.get('42381401800');
  assert.equal(airFilter.investigation_status, 'INCORRECT_MATCH_CONFIRMED');
  assert.ok(airFilter.discrepancy_found.includes('1121 120 1618') || airFilter.discrepancy_found.includes('MS 260'));

  // Mandatory fields & safety on all 200 parts
  for (const m of matches) {
    assert.ok(VALID_CLASSIFICATIONS.has(m.final_classification));
    assert.ok(VALID_INVESTIGATION_STATUSES.has(m.investigation_status));
    assert.ok(VALID_OEM_BRANDS.has(m.oem_brand_classification));

    for (const field of REQUIRED_EVIDENCE_FIELDS) {
      assert.ok(
        typeof m.evidence[field] === 'string' && m.evidence[field].length > 0,
        `Part ${m.part_number} missing evidence field: ${field}`
      );
    }

    // Production safety rule: runtime direct affiliate linking disabled until Phase 59D
    assert.equal(m.can_use_direct_affiliate_link, false);
    assert.equal(m.direct_amazon_url, null);

    // Search fallback URL must be present for ALL parts
    assert.ok(m.search_fallback_url && m.search_fallback_url.startsWith('https://www.amazon.nl/s?k='));
    assert.ok(m.search_fallback_url.includes('tag=srihldecoder2-21'));
  }
});

test('Phase 59C.1 — 3. Production Read-Only Isolation & Invariant Protection', () => {
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

test('Phase 59C.1 — 4. Amazon Creators API Feasibility & Deliverables Integrity', () => {
  const feasibilityPath = path.join(ROOT_DIR, 'PHASE59C_AMAZON_API_FEASIBILITY.md');
  const commercialPath = path.join(ROOT_DIR, 'PHASE59C_COMMERCIAL_OPPORTUNITIES.md');
  const planPath = path.join(ROOT_DIR, 'PHASE59C_IMPLEMENTATION_PLAN.md');
  const auditPath = path.join(ROOT_DIR, 'PHASE59C_PRODUCT_MATCHING_AUDIT.md');

  assert.ok(fs.existsSync(feasibilityPath), 'PHASE59C_AMAZON_API_FEASIBILITY.md must exist');
  assert.ok(fs.existsSync(commercialPath), 'PHASE59C_COMMERCIAL_OPPORTUNITIES.md must exist');
  assert.ok(fs.existsSync(planPath), 'PHASE59C_IMPLEMENTATION_PLAN.md must exist');
  assert.ok(fs.existsSync(auditPath), 'PHASE59C_PRODUCT_MATCHING_AUDIT.md must exist');

  const feasibilityContent = fs.readFileSync(feasibilityPath, 'utf8');
  assert.ok(feasibilityContent.includes('May 15, 2026'), 'Must document PA-API 5.0 deprecation date May 15, 2026');
  assert.ok(feasibilityContent.includes('Creators API'), 'Must document Amazon Creators API');
  assert.ok(feasibilityContent.includes('OAuth 2.0'), 'Must document OAuth 2.0 authentication');
  assert.ok(feasibilityContent.includes('https://creatorsapi.amazon/catalog/v1/'), 'Must document Creators API endpoint');
  assert.ok(feasibilityContent.includes('3 Qualifying Sales in 180 Days'), 'Must document initial 3 sales rule');
  assert.ok(feasibilityContent.includes('srihldecoder2-21'), 'Must evaluate tag srihldecoder2-21');

  const auditContent = fs.readFileSync(auditPath, 'utf8');
  assert.ok(auditContent.includes('VERIFIED_COMPLETE'), 'Must document VERIFIED_COMPLETE status');
  assert.ok(auditContent.includes('PART_COMPATIBILITY_VERIFIED'), 'Must document PART_COMPATIBILITY_VERIFIED status');
  assert.ok(auditContent.includes('INCORRECT_MATCH_CONFIRMED'), 'Must document INCORRECT_MATCH_CONFIRMED status');
  assert.ok(auditContent.includes('B0068M5NAG'), 'Must document verified replacement ASIN B0068M5NAG');
  assert.ok(auditContent.includes('B001RM8J76'), 'Must document verified replacement ASIN B001RM8J76');
  assert.ok(auditContent.includes('B001RMA5S2'), 'Must document verified replacement ASIN B001RMA5S2');
  assert.ok(auditContent.includes('https://www.motointegrator.de/artikel/468993-zuendkerze-bosch-0-242-240-506-1-stueck'), 'Must document Bosch independent URL');
  assert.ok(auditContent.includes('https://amzchart.com/product-research/spark-plugs-15716421'), 'Must document NGK BPMR7A independent URL');
  assert.ok(auditContent.includes('https://www.motointegrator.de/artikel/842061-zuendkerze-ngk-cmr6h-3365-1-stueck'), 'Must document NGK CMR6H independent URL');

  const planContent = fs.readFileSync(planPath, 'utf8');
  assert.ok(/two-gate/i.test(planContent), 'Must document Two-Gate verification');
  assert.ok(planContent.includes('Creators API'));
});
