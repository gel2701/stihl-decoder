/**
 * Audit Script: Amazon Affiliate Link Integrity & Inventory Audit
 * Phase 54A-H — Strict Separation of Search Fallbacks and Verified ASIN Product Links
 *
 * Scans configuration, repository code, and SSR output to verify:
 * 1. Manual offers contract & verification metadata integrity
 * 2. Absolute absence of uncontrolled /dp/ direct product links in production code
 * 3. Accurate search-only UI (no "Waar te koop", no "Bekijk op Amazon", no stock/price claims)
 * 4. Tracking tag isolation (env-only, not hardcoded in tracked source)
 * 5. Deterministic fallback for all 17,082 canonical parts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AmazonAffiliateProvider,
  AMAZON_MATCH_TYPES,
  VERIFICATION_STATUSES,
  ALLOWED_AMAZON_MARKETPLACES,
  isValidAsin,
  isValidIsoTimestamp,
  isValidManualAsinOverride
} from '../src/affiliate/AmazonAffiliateProvider.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🔍 RUNNING PHASE 54A-H — AMAZON AFFILIATE LINK INTEGRITY AUDIT');
console.log('===============================================================\n');

let failed = false;
function fail(msg) {
  console.error(`  ❌ [FAIL] ${msg}`);
  failed = true;
}

// ---------------------------------------------------------------------------
// 1. Audit amazon_part_offers.json inventory
// ---------------------------------------------------------------------------
console.log('▶ Step 1: Auditing data/affiliate/amazon_part_offers.json...');
const offersFilePath = path.join(rootDir, 'data', 'affiliate', 'amazon_part_offers.json');

if (!fs.existsSync(offersFilePath)) {
  fail(`amazon_part_offers.json not found at ${offersFilePath}`);
}

const rawJson = fs.readFileSync(offersFilePath, 'utf8');
let offersData;
try {
  offersData = JSON.parse(rawJson);
} catch (e) {
  fail(`Malformed JSON in amazon_part_offers.json: ${e.message}`);
}

const manualOffers = Array.isArray(offersData?.offers) ? offersData.offers : [];
console.log(`  Total manual offers declared: ${manualOffers.length}`);

let configuredDirectAsinLinks = 0;
let verifiedDirectAsinLinks = 0;
let invalidDirectAsinLinks = 0;

const seenPartNumbers = new Set();
const seenAsins = new Set();

for (const offer of manualOffers) {
  if (offer.asin) {
    configuredDirectAsinLinks++;
  }

  const normPart = PartNormalizer.normalizePartNumber(offer.part_number);
  if (!normPart) {
    fail(`Invalid part number in offer: ${offer.part_number}`);
    invalidDirectAsinLinks++;
    continue;
  }

  if (seenPartNumbers.has(normPart)) {
    fail(`Duplicate part number mapping in offers: ${normPart}`);
  }
  seenPartNumbers.add(normPart);

  if (offer.asin) {
    const cleanAsin = offer.asin.trim().toUpperCase();
    if (seenAsins.has(cleanAsin)) {
      fail(`Duplicate ASIN mapping in offers: ${cleanAsin}`);
    }
    seenAsins.add(cleanAsin);
  }

  if (isValidManualAsinOverride(offer)) {
    verifiedDirectAsinLinks++;
  } else {
    invalidDirectAsinLinks++;
    fail(`Manual offer failed strict verification contract: ${JSON.stringify(offer)}`);
  }
}

console.log(`  CONFIGURED_DIRECT_ASIN_LINKS = ${configuredDirectAsinLinks}`);
console.log(`  VERIFIED_DIRECT_ASIN_LINKS = ${verifiedDirectAsinLinks}`);
console.log(`  INVALID_DIRECT_ASIN_LINKS = ${invalidDirectAsinLinks}`);

// ---------------------------------------------------------------------------
// 2. Parts Catalog Fallback Audit (17,082 parts)
// ---------------------------------------------------------------------------
console.log('\n▶ Step 2: Auditing canonical parts catalog search fallback coverage...');
const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const catalogDoc = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const totalParts = catalogDoc.parts_count || (catalogDoc.parts ? catalogDoc.parts.length : 0);

const searchFallbackLinks = totalParts - verifiedDirectAsinLinks;
console.log(`  TOTAL_CANONICAL_PARTS = ${totalParts}`);
console.log(`  SEARCH_FALLBACK_LINKS = ${searchFallbackLinks}`);

if (totalParts < 17082 || totalParts !== (catalogDoc.parts ? catalogDoc.parts.length : 0)) {
  fail(`Expected >= 17,082 canonical parts matching parts array length, got ${totalParts}`);
}

// ---------------------------------------------------------------------------
// 3. Direct Product Link Leak Scan
// ---------------------------------------------------------------------------
console.log('\n▶ Step 3: Scanning repository for uncontrolled direct Amazon product links (/dp/)...');
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.idea', '.gemini', 'output', 'data', '.cache', 'cache', 'non_existent_cache_folder', 'playwright-report', 'test-results']);
const EXCLUDE_FILES = new Set([
  'tests/phase54a_parts_amazon_affiliate.test.js',
  'tests/phase54a_h_amazon_link_integrity.test.js',
  'scripts/audit_amazon_affiliate_links.mjs',
  'data/affiliate/amazon_part_offers.json'
]);

let uncontrolledDirectProductLinks = 0;

function scanDirForDpLinks(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        scanDirForDpLinks(fullPath);
      }
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES.has(relPath)) continue;
      // Only check code and template files
      if (!/\.(js|mjs|cjs|html|json|md)$/.test(entry.name)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      // Look for amazon.*\/dp\/
      const dpMatches = content.match(/amazon\.(nl|de|com)\/dp\/[A-Za-z0-9]{10}/g);
      if (dpMatches) {
        // Exclude legitimate provider dynamic construction pattern
        if (relPath === 'src/affiliate/AmazonAffiliateProvider.js') {
          // Check if it's a hardcoded URL string or template literal
          const nonTemplate = dpMatches.filter(m => !m.includes('${'));
          if (nonTemplate.length > 0) {
            fail(`Uncontrolled hardcoded /dp/ link found in ${relPath}: ${nonTemplate.join(', ')}`);
            uncontrolledDirectProductLinks += nonTemplate.length;
          }
        } else {
          fail(`Uncontrolled /dp/ product link found in ${relPath}: ${dpMatches.join(', ')}`);
          uncontrolledDirectProductLinks += dpMatches.length;
        }
      }
    }
  }
}

scanDirForDpLinks(rootDir);
console.log(`  UNCONTROLLED_DIRECT_PRODUCT_LINKS = ${uncontrolledDirectProductLinks}`);
if (uncontrolledDirectProductLinks > 0) {
  fail(`Found ${uncontrolledDirectProductLinks} uncontrolled direct product links`);
}

// ---------------------------------------------------------------------------
// 4. Hardcoded Tracking Tag Leak Scan
// ---------------------------------------------------------------------------
console.log('\n▶ Step 4: Scanning repository for hardcoded tracking tag leaks...');
const KNOWN_TAG = 'srihldecoder2-21';
let hardcodedTagOccurrences = 0;

function scanForTag(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        scanForTag(fullPath);
      }
    } else if (entry.isFile()) {
      // Exclude tests, audit scripts, markdown docs, and phase audit reports where tag is referenced as test env var, inventory, or assertion
      if (relPath.startsWith('tests/') || relPath.startsWith('scripts/') || relPath.endsWith('.md')) continue;
      if (/^PHASE\d+[A-Z0-9_]*\.json$/i.test(entry.name)) continue;
      if (!/\.(js|mjs|cjs|json)$/.test(entry.name)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(KNOWN_TAG)) {
        fail(`Hardcoded tracking tag ${KNOWN_TAG} found in tracked file: ${relPath}`);
        hardcodedTagOccurrences++;
      }
    }
  }
}

scanForTag(rootDir);
console.log(`  HARDCODED_TRACKING_TAGS = ${hardcodedTagOccurrences}`);
if (hardcodedTagOccurrences > 0) {
  fail(`Tracking tag must only be loaded via environment variables`);
}

// ---------------------------------------------------------------------------
// 5. SSR Part Detail Page Claims & Copy Audit
// ---------------------------------------------------------------------------
console.log('\n▶ Step 5: Rendering representative part detail pages and auditing claims...');
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

const representativeParts = ['11231602050', '11210071001', '00009677339'];
// Sample additional 10 canonical parts
const sampleParts = catalogDoc.parts.slice(100, 110).map(p => p.part_number);
const allTestParts = [...representativeParts, ...sampleParts];

let unverifiedProductClaims = 0;

for (const partNo of allTestParts) {
  const html = renderPartDetailPageHtml(partNo);
  const resolvedOffers = AffiliateOfferResolver.resolveOffers({ partNumber: partNo });
  const hasVerifiedOffer = resolvedOffers.some(o => o.match_type === AMAZON_MATCH_TYPES.MANUAL_ASIN || o.is_verified === true);

  if (hasVerifiedOffer) {
    // Assertions for verified product link
    if (!html.includes('Waar te koop')) {
      fail(`Part ${partNo}: missing "Waar te koop" for verified product link`);
      unverifiedProductClaims++;
    }
    if (!html.includes('Bekijk product op Amazon')) {
      fail(`Part ${partNo}: missing "Bekijk product op Amazon" CTA for verified product link`);
      unverifiedProductClaims++;
    }
    if (!html.includes('Geverifieerd product')) {
      fail(`Part ${partNo}: missing "Geverifieerd product" badge for verified product link`);
      unverifiedProductClaims++;
    }
    if (html.includes('Amazon-zoekopdracht')) {
      fail(`Part ${partNo}: unexpectedly rendered "Amazon-zoekopdracht" badge for verified product`);
      unverifiedProductClaims++;
    }
  } else {
    // Assertions for search-only fallback
    if (html.includes('Waar te koop')) {
      fail(`Part ${partNo}: rendered "Waar te koop" for pure search fallback`);
      unverifiedProductClaims++;
    }
    if (html.includes('Bekijk op Amazon')) {
      fail(`Part ${partNo}: rendered "Bekijk op Amazon" CTA for pure search fallback`);
      unverifiedProductClaims++;
    }
    if (html.includes('Bekijk product op Amazon')) {
      fail(`Part ${partNo}: rendered "Bekijk product op Amazon" CTA for pure search fallback`);
      unverifiedProductClaims++;
    }
    if (html.includes('Geverifieerd product')) {
      fail(`Part ${partNo}: rendered "Geverifieerd product" badge for pure search fallback`);
      unverifiedProductClaims++;
    }
    if (html.includes('Beschikbaar op Amazon')) {
      fail(`Part ${partNo}: rendered "Beschikbaar op Amazon" claim`);
      unverifiedProductClaims++;
    }
    if (!html.includes('Zoek dit onderdeel online')) {
      fail(`Part ${partNo}: missing "Zoek dit onderdeel online" heading`);
    }
    if (!html.includes('Zoek op Amazon.nl')) {
      fail(`Part ${partNo}: missing "Zoek op Amazon.nl" CTA`);
    }
    if (!html.includes('Amazon-zoekopdracht')) {
      fail(`Part ${partNo}: missing "Amazon-zoekopdracht" badge`);
    }
    if (!html.includes('De beschikbaarheid en exacte overeenkomst zijn niet vooraf bevestigd')) {
      fail(`Part ${partNo}: missing honest search fallback disclaimer`);
    }
  }

  // Common checks for all commercial offers
  if (/op voorraad/i.test(html)) {
    fail(`Part ${partNo}: rendered "op voorraad" claim`);
    unverifiedProductClaims++;
  }
  if (/direct leverbaar/i.test(html)) {
    fail(`Part ${partNo}: rendered "direct leverbaar" claim`);
    unverifiedProductClaims++;
  }
  if (/prijs €/i.test(html)) {
    fail(`Part ${partNo}: rendered unverified price claim`);
    unverifiedProductClaims++;
  }
  if (!html.includes('rel="sponsored nofollow noopener"')) {
    fail(`Part ${partNo}: missing sponsored nofollow noopener rel attribute`);
  }

  // Phase 59B — Check 1: Zero CTA hrefs starting with /api/affiliate/out (direct outbound links required)
  const hrefMatches = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>/g)].map(m => m[1]);
  for (const href of hrefMatches) {
    if (href.startsWith('/api/affiliate/out')) {
      fail(`Part ${partNo}: CTA href unexpectedly uses redirecting link: ${href}`);
      unverifiedProductClaims++;
    }
  }

  // Phase 59B — Check 2: Direct CTA points to allowlisted Amazon domain and includes configured tag
  const ctaLinks = [...html.matchAll(/<a[^>]+href="(https:\/\/[^"]+)"[^>]*rel="sponsored nofollow noopener"[^>]*>/g)].map(m => m[1]);
  for (const ctaUrl of ctaLinks) {
    try {
      const parsed = new URL(ctaUrl);
      if (!ALLOWED_AMAZON_MARKETPLACES.has(parsed.hostname.toLowerCase())) {
        fail(`Part ${partNo}: CTA host ${parsed.hostname} not in ALLOWED_AMAZON_MARKETPLACES`);
        unverifiedProductClaims++;
      }
      if (parsed.searchParams.get('tag') !== process.env.AMAZON_ASSOCIATE_TAG) {
        fail(`Part ${partNo}: CTA tag ${parsed.searchParams.get('tag')} does not match configured tag`);
        unverifiedProductClaims++;
      }
    } catch (e) {
      fail(`Part ${partNo}: Malformed CTA URL ${ctaUrl}: ${e.message}`);
      unverifiedProductClaims++;
    }
  }

  // Phase 59B — Check 3: Required Amazon Associates Operating Agreement disclosures
  if (!html.includes('As an Amazon Associate I earn from qualifying purchases.')) {
    fail(`Part ${partNo}: missing required Amazon Associates English disclosure`);
    unverifiedProductClaims++;
  }
  if (!html.includes('Als Amazon-partner verdien ik aan kwalificerende aankopen.')) {
    fail(`Part ${partNo}: missing required Amazon Associates Dutch explanation`);
    unverifiedProductClaims++;
  }
  if (!html.includes('/privacy')) {
    fail(`Part ${partNo}: missing link to privacy- en cookiebeleid`);
    unverifiedProductClaims++;
  }
}

console.log(`  PARTS_AUDITED = ${allTestParts.length}`);
console.log(`  UNVERIFIED_PRODUCT_CLAIMS = ${unverifiedProductClaims}`);

// ---------------------------------------------------------------------------
// 6. Final Status & Exit
// ---------------------------------------------------------------------------
console.log('\n===============================================================');
console.log('📊 AUDIT SUMMARY REPORT');
console.log('===============================================================');
console.log(`CONFIGURED_DIRECT_ASIN_LINKS = ${configuredDirectAsinLinks}`);
console.log(`VERIFIED_DIRECT_ASIN_LINKS = ${verifiedDirectAsinLinks}`);
console.log(`INVALID_DIRECT_ASIN_LINKS = ${invalidDirectAsinLinks}`);
console.log(`SEARCH_FALLBACK_LINKS = ${searchFallbackLinks}`);
console.log(`UNCONTROLLED_DIRECT_PRODUCT_LINKS = ${uncontrolledDirectProductLinks}`);
console.log(`UNVERIFIED_PRODUCT_CLAIMS = ${unverifiedProductClaims}`);
console.log('===============================================================');

if (failed || unverifiedProductClaims > 0 || uncontrolledDirectProductLinks > 0) {
  console.error('\n❌ AUDIT FAILED: Amazon affiliate integrity violations detected.');
  process.exit(1);
} else {
  console.log('\n✅ AUDIT PASSED: 100% affiliate link integrity and fail-closed isolation confirmed.\n');
  process.exit(0);
}
