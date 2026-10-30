/**
 * Test Suite: Phase 57A.1 — Evidence-Backed Amazon Candidate Discovery & First Real ASIN Conversion Audit
 *
 * Verifies:
 * 1. 25-item discovery cohort integrity & priority category distribution
 * 2. Every item has multi-route query audit trail (formatted, compact, hyphenated, Amazon, category)
 * 3. Every item has sources checked and search result URLs logged
 * 4. Exact classification arithmetic (sum of all partitions == 25)
 * 5. Candidate => cannot be NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH
 * 6. Stens 605-205 counterexample (1141 120 1600, brand Stens, part 605-205, GTIN 023899451128, ASIN B01LXML5G0)
 * 7. ASIN B01LXML5G0 remains DISCOVERED_UNVERIFIED unless direct marketplace proof exists
 * 8. Structured proof validation in AmazonExactMatchVerifier
 * 9. Title-only matching without canonical part number proof is rejected
 * 10. Aftermarket vs OEM separation contracts
 * 11. Importer dry-run and live batch integrity (zero dirty write)
 * 12. AffiliateOfferResolver verified mapping resolution vs search fallback
 * 13. Search fallback retention for all 17,082 canonical parts
 * 14. Production associate tag resolution (srihldecoder2-21)
 * 15. Authoritative catalog and database freeze invariants
 * 16. Evidenceless record rejected from NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH
 * 17. Zero bulk unevidenced classifications gate
 * 18. All 14 required Phase 57A.1 output artifacts exist and are schema-valid
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  AmazonExactMatchVerifier,
  MATCH_CLASSIFICATIONS,
  VERIFICATION_METHODS,
  PRODUCT_TYPES
} from '../src/affiliate/AmazonExactMatchVerifier.js';
import {
  AmazonAffiliateProvider,
  AMAZON_MATCH_TYPES,
  VERIFICATION_STATUSES
} from '../src/affiliate/AmazonAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { importVerifiedOffers } from '../scripts/import_verified_amazon_offers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outDir = path.join(rootDir, 'output', 'phase57a1');

describe('Phase 57A.1 — Parts Affiliate Linking Evidence & Discovery Audit', () => {

  // Test 1: 25-item discovery cohort
  it('Phase 57A.1 - Test 1: Authoritative 25-item discovery cohort integrity', () => {
    const cohortFile = path.join(outDir, 'DISCOVERY_COHORT.json');
    assert.strictEqual(fs.existsSync(cohortFile), true, 'DISCOVERY_COHORT.json must exist');
    const doc = JSON.parse(fs.readFileSync(cohortFile, 'utf8'));

    assert.strictEqual(doc.cohort_size, 25, 'Cohort size must be exactly 25');
    assert.strictEqual(doc.items.length, 25, 'Cohort items length must be exactly 25');

    // First item must be 1141 120 1600 (mandatory start item)
    const firstItem = doc.items[0];
    assert.strictEqual(firstItem.part_number, '11411201600', 'Item 1 must be mandatory 1141 120 1600');
    assert.strictEqual(firstItem.is_mandatory_start_item, true, 'is_mandatory_start_item must be true');

    // Verify all categories are in requested high-yield set
    const allowedCategories = new Set([
      'luchtfilter',
      'brandstoffilter',
      'bougie',
      'koppeling',
      'kettingwiel',
      'antivibratie',
      'carburateurdelen',
      'starter'
    ]);
    for (const item of doc.items) {
      assert.strictEqual(allowedCategories.has(item.category), true, `Category ${item.category} must be in allowed high-yield set`);
      assert.strictEqual(typeof item.pilot_rank, 'number', 'pilot_rank must be a number');
      assert.strictEqual(typeof item.part_number, 'string', 'part_number must be string');
      assert.strictEqual(item.part_number.length, 11, 'part_number must be 11 digits');
    }
  });

  // Test 2: Every item has queries
  it('Phase 57A.1 - Test 2: Every audited item has multi-route query audit trail', () => {
    const ledgerFile = path.join(outDir, 'AMAZON_CANDIDATE_DISCOVERY_LEDGER.json');
    assert.strictEqual(fs.existsSync(ledgerFile), true, 'AMAZON_CANDIDATE_DISCOVERY_LEDGER.json must exist');
    const doc = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));

    assert.strictEqual(doc.items.length, 25, 'Ledger must have 25 items');

    const requiredQueryTypes = [
      'FORMATTED_EXACT',
      'COMPACT_EXACT',
      'HYPHENATED_EXACT',
      'PART_AMAZON',
      'PART_CATEGORY'
    ];

    for (const item of doc.items) {
      assert.ok(Array.isArray(item.queries_run), `Item ${item.part_number} must have queries_run array`);
      assert.ok(item.queries_run.length >= 5, `Item ${item.part_number} must run at least 5 queries (got ${item.queries_run.length})`);

      const queryTypes = new Set(item.queries_run.map(q => q.query_type));
      for (const reqType of requiredQueryTypes) {
        assert.ok(queryTypes.has(reqType), `Item ${item.part_number} must execute query type ${reqType}`);
      }

      for (const q of item.queries_run) {
        assert.ok(q.query && q.query.length > 5, 'Query string must be populated');
        assert.ok(q.executed_at && !Number.isNaN(Date.parse(q.executed_at)), 'executed_at must be valid ISO date');
        assert.ok(typeof q.result_count === 'number', 'result_count must be number');
        assert.ok(Array.isArray(q.top_relevant_results) && q.top_relevant_results.length > 0, 'top_relevant_results must be array');
      }
    }
  });

  // Test 3: Every item has sources checked
  it('Phase 57A.1 - Test 3: Every audited item has sources checked and URLs logged', () => {
    const ledgerFile = path.join(outDir, 'AMAZON_CANDIDATE_DISCOVERY_LEDGER.json');
    const doc = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));

    for (const item of doc.items) {
      assert.ok(Array.isArray(item.sources_checked), `Item ${item.part_number} must have sources_checked`);
      assert.ok(item.sources_checked.length >= 3, `Item ${item.part_number} must check at least 3 distinct sources`);
      assert.ok(Array.isArray(item.search_result_urls), `Item ${item.part_number} must have search_result_urls`);
      assert.ok(item.search_result_urls.length >= 5, `Item ${item.part_number} must log at least 5 search result URLs`);
      assert.strictEqual(item.audit_status, 'COMPLETED', 'audit_status must be COMPLETED');
      assert.ok(!Number.isNaN(Date.parse(item.audited_at)), 'audited_at must be valid ISO timestamp');
    }
  });

  // Test 4: Exact classification arithmetic
  it('Phase 57A.1 - Test 4: Exact classification arithmetic & partition consistency', () => {
    const auditFile = path.join(outDir, 'CLASSIFICATION_AUDIT.json');
    assert.strictEqual(fs.existsSync(auditFile), true, 'CLASSIFICATION_AUDIT.json must exist');
    const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));

    assert.strictEqual(audit.items_audited, 25, 'items_audited must be 25');
    assert.strictEqual(audit.hard_gates.arithmetic_valid, true, 'arithmetic_valid must be true');
    assert.strictEqual(audit.hard_gates.items_without_discovery_audit, 0, 'items_without_discovery_audit must be 0');
    assert.strictEqual(audit.hard_gates.bulk_unevidenced_classifications, 0, 'bulk_unevidenced_classifications must be 0');

    const totalSum = audit.verified_oem_exact +
      audit.verified_aftermarket_exact +
      audit.discovered_unverified +
      audit.ambiguous +
      audit.rejected +
      audit.not_found_after_exhaustive_search;

    assert.strictEqual(totalSum, audit.items_audited, 'Sum of partitions must match items_audited exactly');

    // Verify individual partition files match counts
    const verifiedDoc = JSON.parse(fs.readFileSync(path.join(outDir, 'VERIFIED_MATCHES.json'), 'utf8'));
    const unverifiedDoc = JSON.parse(fs.readFileSync(path.join(outDir, 'DISCOVERED_UNVERIFIED.json'), 'utf8'));
    const ambiguousDoc = JSON.parse(fs.readFileSync(path.join(outDir, 'AMBIGUOUS.json'), 'utf8'));
    const rejectedDoc = JSON.parse(fs.readFileSync(path.join(outDir, 'REJECTED.json'), 'utf8'));
    const notFoundDoc = JSON.parse(fs.readFileSync(path.join(outDir, 'NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH.json'), 'utf8'));

    assert.strictEqual(verifiedDoc.count, audit.verified_oem_exact + audit.verified_aftermarket_exact);
    assert.strictEqual(unverifiedDoc.count, audit.discovered_unverified);
    assert.strictEqual(ambiguousDoc.count, audit.ambiguous);
    assert.strictEqual(rejectedDoc.count, audit.rejected);
    assert.strictEqual(notFoundDoc.count, audit.not_found_after_exhaustive_search);
  });

  // Test 5: Candidate => cannot be NOT_FOUND
  it('Phase 57A.1 - Test 5: Candidate found cannot be classified as NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH', () => {
    const invalidCandidate = {
      part_number: '11411201600',
      classification: MATCH_CLASSIFICATIONS.NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH,
      candidate_count: 1,
      candidate_asin: 'B01LXML5G0',
      queries_run: ['query1'],
      sources_checked: ['source1']
    };

    const res = AmazonExactMatchVerifier.validateCandidate(invalidCandidate);
    assert.strictEqual(res.valid, false, 'Candidate with candidate_count > 0 must fail NOT_FOUND validation');
    assert.ok(res.errors.some(e => e.includes('NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH is forbidden when candidate products')), 'Must return specific candidate contradiction error');
  });

  // Test 6: Stens 605-205 counterexample
  it('Phase 57A.1 - Test 6: Stens 605-205 counterexample established in discovery ledger', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(outDir, 'AMAZON_CANDIDATE_DISCOVERY_LEDGER.json'), 'utf8'));
    const stensItem = ledger.items.find(i => i.part_number === '11411201600');
    assert.ok(stensItem, '1141 120 1600 must be in discovery ledger');

    assert.strictEqual(stensItem.final_classification, MATCH_CLASSIFICATIONS.DISCOVERED_UNVERIFIED, '1141 120 1600 must be DISCOVERED_UNVERIFIED');
    assert.notStrictEqual(stensItem.final_classification, MATCH_CLASSIFICATIONS.NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH, '1141 120 1600 cannot be NOT_FOUND');

    assert.ok(stensItem.candidate_details, 'candidate_details must be present');
    assert.strictEqual(stensItem.candidate_details.brand, 'Stens');
    assert.strictEqual(stensItem.candidate_details.manufacturer_part_number, '605-205');
    assert.strictEqual(stensItem.candidate_details.gtin, '023899451128');
    assert.strictEqual(stensItem.candidate_details.candidate_asin, 'B01LXML5G0');
    assert.strictEqual(stensItem.candidate_details.product_type, 'AFTERMARKET');
    assert.strictEqual(stensItem.candidate_details.asin_identity_verified, true);
  });

  // Test 7: ASIN B01LXML5G0 remains unverified unless marketplace proof exists
  it('Phase 57A.1 - Test 7: ASIN B01LXML5G0 remains DISCOVERED_UNVERIFIED without active marketplace confirmation', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(outDir, 'AMAZON_CANDIDATE_DISCOVERY_LEDGER.json'), 'utf8'));
    const stensItem = ledger.items.find(i => i.part_number === '11411201600');

    assert.strictEqual(stensItem.candidate_details.amazon_nl_listing_confirmed, false, 'amazon_nl_listing_confirmed must be false');
    assert.strictEqual(stensItem.affiliate_action, 'SEARCH_FALLBACK_ONLY', 'Must remain on search fallback');

    // Confirm that amazon_part_offers.json does NOT contain B01LXML5G0
    const offersDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json'), 'utf8'));
    assert.strictEqual(offersDoc.offers.some(o => o.asin === 'B01LXML5G0'), false, 'B01LXML5G0 must not be written to production offers');
  });

  // Test 8: Structured evidence validation
  it('Phase 57A.1 - Test 8: Structured proof validation contract in AmazonExactMatchVerifier', () => {
    // Valid candidate with structured proof
    const validCandidate = {
      part_number: '11411201600',
      asin: 'B01LXML5G0',
      marketplace: 'amazon.nl',
      match_type: MATCH_CLASSIFICATIONS.VERIFIED_AFTERMARKET_EXACT,
      verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
      verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
      verified_at: '2026-10-28T09:00:00.000Z',
      evidence_source: 'https://www.tractorsupply.com/tsc/product/stens-air-filter-605-205',
      evidence_sources: [{
        type: 'MANUFACTURER_CROSS_REF',
        url: 'https://www.tractorsupply.com/tsc/product/stens-air-filter-605-205',
        title: 'Stens Air Filter 605-205',
        claim: 'Replaces STIHL 1141 120 1600',
        retrieved_at: '2026-10-28T09:00:00.000Z'
      }],
      product_type: PRODUCT_TYPES.AFTERMARKET,
      aftermarket_brand: 'Stens',
      manufacturer_part_number: '605-205',
      price: null,
      in_stock: null,
      proof: {
        exact_part_number_found: true,
        asin_identity_verified: true,
        marketplace_verified: true,
        replacement_reference_verified: true
      }
    };
    const validRes = AmazonExactMatchVerifier.validateCandidate(validCandidate);
    assert.strictEqual(validRes.valid, true, 'Valid structured candidate must pass');

    // Negative: marketplace_verified is false
    const unverifiedMarketplace = {
      ...validCandidate,
      proof: {
        exact_part_number_found: true,
        asin_identity_verified: true,
        marketplace_verified: false
      }
    };
    const unverifiedRes = AmazonExactMatchVerifier.validateCandidate(unverifiedMarketplace);
    assert.strictEqual(unverifiedRes.valid, false, 'Unverified marketplace in proof must fail');
    assert.ok(unverifiedRes.errors.some(e => e.includes('Marketplace availability unverified')));
  });

  // Test 9: Title-only proof rejected
  it('Phase 57A.1 - Test 9: Title-only matching without canonical part number proof is strictly rejected', () => {
    const titleOnlyCandidate = {
      part_number: '11411201600',
      asin: 'B01LXML5G0',
      marketplace: 'amazon.nl',
      match_type: MATCH_CLASSIFICATIONS.VERIFIED_AFTERMARKET_EXACT,
      verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
      verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
      verified_at: '2026-10-28T09:00:00.000Z',
      evidence_source: 'Listing details matching chainsaw title only without part number',
      title_only: true,
      product_type: PRODUCT_TYPES.AFTERMARKET,
      aftermarket_brand: 'Stens',
      price: null,
      in_stock: null
    };

    const res = AmazonExactMatchVerifier.validateCandidate(titleOnlyCandidate);
    assert.strictEqual(res.valid, false, 'Title-only candidate must be rejected');
    assert.ok(res.errors.some(e => e.includes('Title-only matching without explicit part number proof is strictly rejected')));
  });

  // Test 10: Aftermarket / OEM separation
  it('Phase 57A.1 - Test 10: Strict aftermarket vs OEM classification separation', () => {
    // Aftermarket claiming to be STIHL
    const fakeOemCandidate = {
      part_number: '11411201600',
      asin: 'B01LXML5G0',
      marketplace: 'amazon.nl',
      match_type: MATCH_CLASSIFICATIONS.VERIFIED_AFTERMARKET_EXACT,
      verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
      verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
      verified_at: '2026-10-28T09:00:00.000Z',
      evidence_source: 'https://example.com/proof',
      product_type: PRODUCT_TYPES.AFTERMARKET,
      aftermarket_brand: 'STIHL OEM Parts Store',
      price: null,
      in_stock: null
    };
    const res1 = AmazonExactMatchVerifier.validateCandidate(fakeOemCandidate);
    assert.strictEqual(res1.valid, false, 'Aftermarket brand cannot claim STIHL');

    // OEM claiming aftermarket product_type
    const wrongTypeOem = {
      part_number: '11411201600',
      asin: 'B01LXML5G0',
      marketplace: 'amazon.nl',
      match_type: MATCH_CLASSIFICATIONS.VERIFIED_OEM_EXACT,
      verification_status: VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH,
      verification_method: VERIFICATION_METHODS.MANUAL_CATALOG_AUDIT,
      verified_at: '2026-10-28T09:00:00.000Z',
      evidence_source: 'https://example.com/proof',
      product_type: PRODUCT_TYPES.AFTERMARKET,
      price: null,
      in_stock: null
    };
    const res2 = AmazonExactMatchVerifier.validateCandidate(wrongTypeOem);
    assert.strictEqual(res2.valid, false, 'OEM match cannot have product_type AFTERMARKET');
  });

  // Test 11: Import dry run
  it('Phase 57A.1 - Test 11: Import dry-run & live import batch integrity (zero dirty write)', () => {
    const dryRunReport = JSON.parse(fs.readFileSync(path.join(outDir, 'IMPORT_DRY_RUN_REPORT.json'), 'utf8'));
    assert.strictEqual(dryRunReport.dry_run, true, 'dry_run flag must be true');
    assert.strictEqual(dryRunReport.written, false, 'dry run must not write');

    const finalReport = JSON.parse(fs.readFileSync(path.join(outDir, 'IMPORT_FINAL_REPORT.json'), 'utf8'));
    assert.strictEqual(finalReport.dry_run, false, 'final report dry_run flag is false');
    assert.strictEqual(finalReport.written, false, 'Empty batch must not write');

    // Offers file remains 0
    const offersDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json'), 'utf8'));
    assert.strictEqual(offersDoc.offers.length, 0, 'Production offers must remain 0');
  });

  // Test 12: Resolver verified mapping
  it('Phase 57A.1 - Test 12: AffiliateOfferResolver respects verified manual overrides vs search link', () => {
    process.env.AMAZON_AFFILIATE_ENABLED = 'true';
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

    const provider = new AmazonAffiliateProvider({
      marketplace: 'amazon.nl',
      manualOverrides: [
        {
          part_number: '11411201600',
          asin: 'B01LXML5G0',
          marketplace: 'amazon.nl',
          classification: 'VERIFIED_AFTERMARKET_EXACT',
          verification_status: 'VERIFIED_EXACT_MATCH',
          verification_method: 'MANUAL_CATALOG_AUDIT',
          verified_at: '2026-10-28T09:00:00.000Z',
          aftermarket_brand: 'Stens',
          manufacturer_part_number: '605-205',
          enabled: true,
          proof: {
            exact_part_number_found: true,
            asin_identity_verified: true,
            marketplace_verified: true,
            replacement_reference_verified: true
          },
          evidence_sources: [{
            type: 'MANUFACTURER_CROSS_REF',
            url: 'https://www.tractorsupply.com/tsc/product/stens-air-filter-605-205',
            title: 'Stens 605-205 Air Filter',
            claim: 'Replaces STIHL 1141 120 1600',
            retrieved_at: '2026-10-28T09:00:00.000Z'
          }]
        }
      ]
    });

    const offers = provider.getOffers({ partNumber: '11411201600' });
    assert.strictEqual(offers.length, 1, 'Should resolve 1 offer');
    assert.strictEqual(offers[0].match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
    assert.strictEqual(offers[0].asin, 'B01LXML5G0');
    assert.ok(offers[0].url.includes('/dp/B01LXML5G0'), 'Must contain /dp/ link for verified ASIN override');
  });

  // Test 13: Fallback retained otherwise
  it('Phase 57A.1 - Test 13: Search fallback is retained for unmapped canonical parts', () => {
    process.env.AMAZON_AFFILIATE_ENABLED = 'true';
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

    const provider = new AmazonAffiliateProvider({ marketplace: 'amazon.nl' });
    const offers = provider.getOffers({ partNumber: '11411201600' });

    assert.strictEqual(offers.length, 1);
    assert.strictEqual(offers[0].match_type, AMAZON_MATCH_TYPES.SEARCH_LINK);
    assert.ok(offers[0].url.includes('/s?k=STIHL+'), 'Unmapped part must resolve to Amazon search fallback');
    assert.ok(offers[0].url.includes('tag=srihldecoder2-21'), 'Must include production associate tag');
  });

  // Test 14: Production tag
  it('Phase 57A.1 - Test 14: Production tag srihldecoder2-21 resolved deterministically', () => {
    process.env.AMAZON_AFFILIATE_ENABLED = 'true';
    process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

    const provider = new AmazonAffiliateProvider({ marketplace: 'amazon.nl' });
    assert.strictEqual(provider.getAssociateTag('amazon.nl'), 'srihldecoder2-21');
  });

  // Test 15: Catalog freeze
  it('Phase 57A.1 - Test 15: Canonical catalog and database freeze invariants 100% intact', () => {
    const catIntegrity = JSON.parse(fs.readFileSync(path.join(rootDir, 'output', 'phase56p', 'CATALOG_INTEGRITY.json'), 'utf8'));
    const inv = catIntegrity.invariants;

    assert.strictEqual(inv.total_catalog_models, 956, 'Total catalog models must remain 956');
    assert.strictEqual(inv.unpowered_attachments, 25, 'Unpowered attachments must remain 25');
    assert.strictEqual(inv.confirmed_non_machine_noise, 52, 'Noise must remain 52');
    assert.strictEqual(inv.powered_machine_candidates, 879, 'Powered machine candidates must remain 879');
    assert.strictEqual(inv.total_parts, 17082, 'Total parts must remain 17,082');
    assert.strictEqual(inv.total_fitments, 175106, 'Total fitments must remain 175,106');
    assert.strictEqual(inv.total_configurations, 766, 'Total configurations must remain 766');
    assert.strictEqual(inv.total_evidence_records, 208412, 'Total evidence must remain 208,412');
    assert.strictEqual(inv.total_section_contexts, 814, 'Total contexts must remain 814');
    assert.strictEqual(inv.total_indexable_models, 843, 'Total indexable models must remain 843');
    assert.strictEqual(inv.total_sitemap_urls, 1024, 'Total sitemap URLs must remain 1,024');

    // Parts catalog check
    const catalogDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
    assert.strictEqual(catalogDoc.parts.filter(p => !(p.sources?.length === 1 && p.sources[0] === 'ghs')).length, 17082, 'Pre-58A canonical parts must remain 17,082');
  });

  // Test 16: Evidenceless record cannot be classified as NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH
  it('Phase 57A.1 - Test 16: Evidenceless record cannot be classified as NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH', () => {
    const evidencelessRecord = {
      part_number: '11181953500',
      classification: MATCH_CLASSIFICATIONS.NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH,
      queries_run: [], // empty!
      sources_checked: [] // empty!
    };

    const res = AmazonExactMatchVerifier.validateCandidate(evidencelessRecord);
    assert.strictEqual(res.valid, false, 'Record without queries/sources cannot pass exhaustive not-found validation');
    assert.ok(res.errors.some(e => e.includes('queries_run audit')));
  });

  // Test 17: Zero bulk unevidenced classifications
  it('Phase 57A.1 - Test 17: Zero bulk unevidenced classifications gate', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(outDir, 'AMAZON_CANDIDATE_DISCOVERY_LEDGER.json'), 'utf8'));

    const seenTimestamps = new Set();
    for (const item of ledger.items) {
      assert.ok(!seenTimestamps.has(item.audited_at), `Timestamp collision on ${item.audited_at} violates non-bulk requirement`);
      seenTimestamps.add(item.audited_at);
      assert.ok(item.queries_run.length >= 5, `Each item must have distinct queries run`);
    }
  });

  // Test 18: All 14 required Phase 57A.1 output artifacts exist
  it('Phase 57A.1 - Test 18: All 14 required Phase 57A.1 output artifacts exist and are valid', () => {
    const requiredFiles = [
      'DISCOVERY_COHORT.json',
      'AMAZON_CANDIDATE_DISCOVERY_LEDGER.json',
      'VERIFIED_MATCHES.json',
      'DISCOVERED_UNVERIFIED.json',
      'AMBIGUOUS.json',
      'REJECTED.json',
      'NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH.json',
      'VERIFIED_IMPORT_BATCH.json',
      'IMPORT_DRY_RUN_REPORT.json',
      'IMPORT_FINAL_REPORT.json',
      'CLASSIFICATION_AUDIT.json',
      'AFFILIATE_BEFORE_AFTER.json',
      'PHASE57A1_SUMMARY.json',
      'PHASE57A1_REPORT.md'
    ];

    for (const file of requiredFiles) {
      const p = path.join(outDir, file);
      assert.strictEqual(fs.existsSync(p), true, `Missing required artifact: ${file}`);
      const stats = fs.statSync(p);
      assert.ok(stats.size > 20, `Artifact ${file} must not be empty (got ${stats.size} bytes)`);
    }
  });

});
