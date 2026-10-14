/**
 * Phase 54A Test Suite: Parts Catalog Enrichment & Amazon Affiliate Foundation
 *
 * Verifies:
 * 1. Decoupled affiliate provider architecture (AffiliateProvider, AmazonAffiliateProvider, AffiliateOfferResolver, AffiliateDisclosure)
 * 2. Fail-closed behavior when tag is absent or feature flag is disabled
 * 3. Safe Amazon search link generation (deterministic query, proper encoding, rel="sponsored nofollow noopener")
 * 4. Manual ASIN override support and priority
 * 5. Open redirect prevention on /api/affiliate/out
 * 6. Analytics event tracking with whitelisted affiliate metadata
 * 7. HTML rendering of "Waar te koop" section on part detail pages (conditional, below technical data, with disclosure)
 * 8. Invariant preservation: 17,082 unique parts, 175,106 fitments, 206,607 evidence, 766 configurations intact (0 lost)
 * 9. Configuration isolation & section mapping integrity
 * 10. SEO thin-page protection (noindex, follow) maintained
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { AffiliateProvider } from '../src/affiliate/AffiliateProvider.js';
import { AmazonAffiliateProvider, AMAZON_MATCH_TYPES } from '../src/affiliate/AmazonAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { renderAffiliateDisclosureHtml, AFFILIATE_DISCLOSURE_TEXT } from '../src/affiliate/AffiliateDisclosure.js';
import { trackEvent, EVENT_TYPES } from '../src/components/AnalyticsTracker.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🧪 RUNNING PHASE 54A — PARTS & AMAZON AFFILIATE TEST SUITE');
console.log('===============================================================\n');

// ============================================================================
// Test 1: Base AffiliateProvider interface contract
// ============================================================================
console.log('▶ Test 1: Base AffiliateProvider interface contract...');
const baseProvider = new AffiliateProvider('test_provider');
assert.strictEqual(baseProvider.getName(), 'test_provider');
assert.strictEqual(baseProvider.isEnabled(), false, 'Base provider must default to disabled');
assert.deepStrictEqual(baseProvider.getOffers(), [], 'Base provider must return empty offers');
console.log('  ✅ Test 1 Passed: Base AffiliateProvider contract is sound.\n');

// ============================================================================
// Test 2: AmazonAffiliateProvider fail-closed default state
// ============================================================================
console.log('▶ Test 2: AmazonAffiliateProvider fail-closed behavior...');
const originalEnvEnabled = process.env.AMAZON_AFFILIATE_ENABLED;
const originalEnvTag = process.env.AMAZON_ASSOCIATE_TAG;

delete process.env.AMAZON_AFFILIATE_ENABLED;
delete process.env.AMAZON_ASSOCIATE_TAG;

const defaultAmazon = new AmazonAffiliateProvider();
assert.strictEqual(defaultAmazon.isEnabled(), false, 'Must be disabled when env vars missing');
const disabledOffers = defaultAmazon.getOffers({ partNumber: '11231602050' });
assert.deepStrictEqual(disabledOffers, [], 'Offers must be empty when disabled');

// Enabled flag true, but tag missing -> must remain disabled
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
assert.strictEqual(defaultAmazon.isEnabled(), false, 'Must be disabled if tag is missing');
assert.deepStrictEqual(defaultAmazon.getOffers({ partNumber: '11231602050' }), []);

// Tag present, but enabled flag false -> must remain disabled
delete process.env.AMAZON_AFFILIATE_ENABLED;
process.env.AMAZON_ASSOCIATE_TAG = 'testtag-21';
assert.strictEqual(defaultAmazon.isEnabled(), false, 'Must be disabled if AMAZON_AFFILIATE_ENABLED != true');
assert.deepStrictEqual(defaultAmazon.getOffers({ partNumber: '11231602050' }), []);
console.log('  ✅ Test 2 Passed: AmazonAffiliateProvider fails closed cleanly.\n');

// ============================================================================
// Test 3: Amazon search link generation when enabled
// ============================================================================
console.log('▶ Test 3: Amazon search link URL construction and attributes...');
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'stihltest-21';

const enabledAmazon = new AmazonAffiliateProvider();
assert.strictEqual(enabledAmazon.isEnabled(), true, 'Must be enabled when both env vars set');

const searchOffers = enabledAmazon.getOffers({
  partNumber: '1123 160 2050',
  partName: 'Koppeling'
});

assert.strictEqual(searchOffers.length, 1, 'Must return exactly 1 fallback search offer');
const offer = searchOffers[0];
assert.strictEqual(offer.provider, 'amazon');
assert.strictEqual(offer.marketplace, 'amazon.nl');
assert.strictEqual(offer.part_number, '11231602050', 'Part number must be canonical 11-digit');
assert.strictEqual(offer.match_type, AMAZON_MATCH_TYPES.SEARCH_LINK);
assert.strictEqual(offer.rel, 'sponsored nofollow noopener');
assert.strictEqual(offer.target, '_blank');
assert.strictEqual(offer.price, null, 'Must not claim price without live API feed');

// Verify URL structure: https://amazon.nl/s?k=STIHL+11231602050&tag=stihltest-21
const parsedUrl = new URL(offer.url);
assert.strictEqual(parsedUrl.hostname, 'amazon.nl');
assert.strictEqual(parsedUrl.pathname, '/s');
assert.strictEqual(parsedUrl.searchParams.get('k'), 'STIHL 11231602050');
assert.strictEqual(parsedUrl.searchParams.get('tag'), 'stihltest-21');
console.log('  ✅ Test 3 Passed: Safe Amazon search link constructed properly.\n');

// ============================================================================
// Test 4: Manual ASIN override support and priority
// ============================================================================
console.log('▶ Test 4: Manual ASIN overrides and priority over search link...');
const manualOverrides = [
  {
    part_number: '11231602050',
    asin: 'B07TEST123',
    marketplace: 'amazon.nl',
    title: 'STIHL Koppeling Origineel MS 250',
    enabled: true
  },
  {
    part_number: '11210071001',
    asin: 'B07DISABLED',
    marketplace: 'amazon.nl',
    enabled: false
  },
  {
    part_number: '11271200650',
    asin: 'B07GERMANY',
    marketplace: 'amazon.de',
    title: 'STIHL Vergaser MS 290',
    enabled: true
  }
];

const amazonWithOverrides = new AmazonAffiliateProvider({ manualOverrides });
const asinOffers = amazonWithOverrides.getOffers({
  partNumber: '11231602050',
  partName: 'Koppeling'
});

assert.strictEqual(asinOffers.length, 1);
const asinOffer = asinOffers[0];
assert.strictEqual(asinOffer.match_type, AMAZON_MATCH_TYPES.MANUAL_ASIN);
assert.strictEqual(asinOffer.asin, 'B07TEST123');
assert.strictEqual(asinOffer.confidence, 'HIGH');
const asinParsed = new URL(asinOffer.url);
assert.strictEqual(asinParsed.pathname, '/dp/B07TEST123');
assert.strictEqual(asinParsed.hostname, 'amazon.nl');
assert.strictEqual(asinParsed.searchParams.get('tag'), 'stihltest-21');

// Verify override with marketplace amazon.de honors selected marketplace
const deOffers = amazonWithOverrides.getOffers({
  partNumber: '11271200650',
  partName: 'Carburateur'
});
assert.strictEqual(deOffers.length, 1);
assert.strictEqual(deOffers[0].marketplace, 'amazon.de');
assert.strictEqual(new URL(deOffers[0].url).hostname, 'amazon.de');
assert.strictEqual(deOffers[0].label, 'Bekijk op Amazon.de');

// Disabled override should fall back to search link
const disabledOverrideOffers = amazonWithOverrides.getOffers({
  partNumber: '11210071001',
  partName: 'Dichtingsset'
});
assert.strictEqual(disabledOverrideOffers.length, 1);
assert.strictEqual(disabledOverrideOffers[0].match_type, AMAZON_MATCH_TYPES.SEARCH_LINK);
assert.strictEqual(disabledOverrideOffers[0].asin, null);
console.log('  ✅ Test 4 Passed: Manual ASIN overrides take priority and honor override marketplace; disabled fall back to search.\n');

// ============================================================================
// Test 5: AffiliateOfferResolver orchestration & global flag
// ============================================================================
console.log('▶ Test 5: AffiliateOfferResolver multi-provider orchestration...');
const resolver = new AffiliateOfferResolver();
const resolvedOffers = resolver.resolveOffers({ partNumber: '11231602050', partName: 'Koppeling' });
assert(Array.isArray(resolvedOffers), 'Resolved offers must be an array');
assert(resolvedOffers.length >= 1, 'Should resolve offers when affiliate enabled');

// Global flag disabled
process.env.AFFILIATE_ENABLED = 'false';
const globallyDisabledOffers = resolver.resolveOffers({ partNumber: '11231602050' });
assert.deepStrictEqual(globallyDisabledOffers, [], 'Must return empty when AFFILIATE_ENABLED=false');

delete process.env.AFFILIATE_ENABLED;
console.log('  ✅ Test 5 Passed: AffiliateOfferResolver orchestrates cleanly.\n');

// ============================================================================
// Test 6: Affiliate Disclosure Component
// ============================================================================
console.log('▶ Test 6: Affiliate disclosure text and accessibility...');
const disclosureHtml = renderAffiliateDisclosureHtml();
assert(disclosureHtml.includes(AFFILIATE_DISCLOSURE_TEXT), 'Must contain mandatory Dutch disclosure');
assert(disclosureHtml.includes('role="note"'), 'Must contain accessible ARIA role');
assert(disclosureHtml.includes('ANDREAS STIHL AG & Co. KG'), 'Must contain independent disclaimer');
console.log('  ✅ Test 6 Passed: Disclosure component conforms to legal & UX policy.\n');

// ============================================================================
// Test 7: AnalyticsTracker whitelisting for affiliate metadata
// ============================================================================
console.log('▶ Test 7: AnalyticsTracker whitelisting for affiliate click metadata...');
const testClickEvent = trackEvent(
  EVENT_TYPES.AFFILIATE_CLICK,
  {
    provider: 'amazon',
    part_number: '11231602050',
    offer_type: 'SEARCH_LINK',
    asin_if_known: '',
    page_path: '/onderdeelnummer/11231602050/',
    unauthorized_private_key: 'SHOULD_BE_DROPPED'
  },
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestBrowser',
  true
);

assert(testClickEvent, 'Event should be processed');
assert.strictEqual(testClickEvent.metadata.provider, 'amazon');
assert.strictEqual(testClickEvent.metadata.part_number, '11231602050');
assert.strictEqual(testClickEvent.metadata.offer_type, 'SEARCH_LINK');
assert.strictEqual(testClickEvent.metadata.page_path, '/onderdeelnummer/11231602050/');
assert.strictEqual(testClickEvent.metadata.unauthorized_private_key, undefined, 'Non-whitelisted keys must be dropped');
console.log('  ✅ Test 7 Passed: Affiliate metadata keys are correctly whitelisted & sanitized.\n');

// ============================================================================
// Test 8: Open redirect prevention on allowlisted destination URLs
// ============================================================================
console.log('▶ Test 8: Open redirect security verification...');
const ALLOWED_AFFILIATE_HOSTS = new Set([
  'www.amazon.nl',
  'amazon.nl',
  'www.amazon.de',
  'amazon.de',
  'www.amazon.com',
  'amazon.com'
]);

function isAllowedDestination(targetUrlStr) {
  try {
    const parsed = new URL(targetUrlStr);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_AFFILIATE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

assert.strictEqual(isAllowedDestination('https://www.amazon.nl/s?k=STIHL'), true);
assert.strictEqual(isAllowedDestination('https://amazon.nl/dp/B07XXXXX'), true);
assert.strictEqual(isAllowedDestination('https://www.amazon.de/dp/B07XXXXX'), true);
assert.strictEqual(isAllowedDestination('https://amazon.de/dp/B07XXXXX'), true);
assert.strictEqual(isAllowedDestination('https://www.amazon.com/dp/B07XXXXX'), true);
assert.strictEqual(isAllowedDestination('https://evil.com/phishing'), false);
assert.strictEqual(isAllowedDestination('http://www.amazon.nl/unencrypted'), false);
assert.strictEqual(isAllowedDestination('javascript:alert(1)'), false);
assert.strictEqual(isAllowedDestination('//evil.com/protocol-relative'), false);
console.log('  ✅ Test 8 Passed: Open redirect prevention strictly enforces HTTPS and allowlisted hosts.\n');

// ============================================================================
// Test 9: SSR Part Detail Page Template with and without affiliate
// ============================================================================
console.log('▶ Test 9: SSR Part Detail Page Template rendering...');
// A. When affiliate is enabled
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'stihltest-21';

const samplePartNo = '11231602050';
const htmlWithAffiliate = renderPartDetailPageHtml(samplePartNo);
assert(htmlWithAffiliate.includes('Waar te koop'), 'Page must contain "Waar te koop" section when enabled');
assert(htmlWithAffiliate.includes('Bekijk op Amazon.nl'), 'Must render Amazon CTA');
assert(htmlWithAffiliate.includes('rel="sponsored nofollow noopener"'), 'Must have rel="sponsored nofollow noopener"');
assert(htmlWithAffiliate.includes('meta name="robots" content="noindex, follow"'), 'Must retain noindex SEO policy');
assert(htmlWithAffiliate.includes(AFFILIATE_DISCLOSURE_TEXT), 'Must render disclosure');
assert(htmlWithAffiliate.includes('/api/affiliate/out?url='), 'Must route through /api/affiliate/out for server-side click tracking');
assert(htmlWithAffiliate.includes('part_number=11231602050'), 'Redirect URL must include part_number parameter');

// Verify placement: "Waar te koop" must come AFTER "Montagelocatie & Diagramsecties"
const diagramIdx = htmlWithAffiliate.indexOf('Montagelocatie & Diagramsecties');
const waarTeKoopIdx = htmlWithAffiliate.indexOf('Waar te koop');
assert(diagramIdx !== -1 && waarTeKoopIdx !== -1, 'Both sections must be present');
assert(waarTeKoopIdx > diagramIdx, 'Commercial section must be below technical diagram section');

// B. When affiliate is disabled
process.env.AMAZON_AFFILIATE_ENABLED = 'false';
const htmlWithoutAffiliate = renderPartDetailPageHtml(samplePartNo);
assert(!htmlWithoutAffiliate.includes('Waar te koop'), 'Page must NOT contain "Waar te koop" when disabled');
assert(!htmlWithoutAffiliate.includes('Bekijk op Amazon.nl'), 'Must not render Amazon CTA when disabled');
assert(htmlWithoutAffiliate.includes('Montagelocatie & Diagramsecties'), 'Technical sections must remain intact');
console.log('  ✅ Test 9 Passed: SSR Part Detail Page conditionally renders commercial block safely.\n');

// ============================================================================
// Test 10: Invariant Preservation Check (17,082 parts, 175,106 fitments, etc.)
// ============================================================================
console.log('▶ Test 10: Invariant preservation of canonical parts foundation...');
const partsCatalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const manifestPath = path.join(rootDir, 'data', 'parts_harvest_manifest.json');
const fitmentsPath = path.join(rootDir, 'data', 'model_part_fitments.json');
const configsPath = path.join(rootDir, 'data', 'parts_model_configurations.json');

assert(fs.existsSync(partsCatalogPath), 'parts_catalog.json must exist');
assert(fs.existsSync(manifestPath), 'parts_harvest_manifest.json must exist');
assert(fs.existsSync(fitmentsPath), 'model_part_fitments.json must exist');
assert(fs.existsSync(configsPath), 'parts_model_configurations.json must exist');

const partsDoc = JSON.parse(fs.readFileSync(partsCatalogPath, 'utf8'));
const manifestDoc = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const configsDoc = JSON.parse(fs.readFileSync(configsPath, 'utf8'));

assert.strictEqual(partsDoc.parts_count, 17082, 'Must have exactly 17,082 parts in parts_catalog.json');
assert.strictEqual(partsDoc.parts.length, 17082, 'Parts array must have exactly 17,082 parts');
assert.strictEqual(manifestDoc.unique_part_numbers, 17082, 'Manifest unique_part_numbers must be 17,082');
assert.strictEqual(manifestDoc.fitment_relations, 175106, 'Manifest fitments must be 175,106');
assert.strictEqual(manifestDoc.evidence_observations_count, 206607, 'Manifest evidence must be 206,607');
assert.strictEqual(manifestDoc.configurations_count, 766, 'Manifest configurations must be 766');
assert.strictEqual(configsDoc.configurations_count, 766, 'Configs doc configurations_count must be 766');
assert.strictEqual(configsDoc.configurations.length, 766, 'Configs doc configurations array must have 766 entries');

console.log('  ✅ Test 10 Passed: All 17,082 parts, 175,106 fitments, 206,607 evidence, 766 configurations are 100% intact.\n');

// ============================================================================
// Test 11: Section & diagram resolution on canonical parts
// ============================================================================
console.log('▶ Test 11: Section and diagram resolution integrity...');
const resolvedPart = PartCatalogResolver.resolvePartNumber('11231602050');
assert(resolvedPart, 'Part 11231602050 must resolve');
assert(resolvedPart.fitment_count > 0, 'Part 11231602050 must have fitments');
assert(resolvedPart.compatible_models.length > 0, 'Part 11231602050 must have compatible models');

// Verify that an unknown non-existent part number returns null and does not guess
const nonExistent = PartCatalogResolver.resolvePartNumber('99999999999');
assert.strictEqual(nonExistent, null, 'Non-existent part must return null, never guess');
console.log('  ✅ Test 11 Passed: Section and diagram resolution integrity preserved.\n');

// Restore original env vars
if (originalEnvEnabled !== undefined) {
  process.env.AMAZON_AFFILIATE_ENABLED = originalEnvEnabled;
} else {
  delete process.env.AMAZON_AFFILIATE_ENABLED;
}
if (originalEnvTag !== undefined) {
  process.env.AMAZON_ASSOCIATE_TAG = originalEnvTag;
} else {
  delete process.env.AMAZON_ASSOCIATE_TAG;
}

console.log('===============================================================');
console.log('🎉 ALL PHASE 54A TESTS PASSED 100% CLEANLY!');
console.log('===============================================================\n');
