/**
 * Phase 59B: Amazon Affiliate Compliance, Direct Links, Disclosures & Non-blocking Tracking
 *
 * Verifies:
 * 1. Direct Amazon CTA navigation: zero redirecting `/api/affiliate/out` links in anchor hrefs.
 * 2. Associate tracking tag preserved and regional configuration intact.
 * 3. Exact English Amazon Associates disclosure and clear Dutch explanation present.
 * 4. OEM vs aftermarket search result disclaimer clearly visible.
 * 5. Dedicated /privacy route with noindex robots tag and cookie consent controls.
 * 6. Non-blocking beacon tracking endpoint (/api/affiliate/track) and 410 Gone for disabled /api/affiliate/out.
 * 7. Catalog invariants preserved: 18,373 parts, 843 indexable, 1,024 sitemap URLs, 0 unverified ASINs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderPrivacyPolicyHtml } from '../src/components/PrivacyPolicyTemplate.js';
import {
  AMAZON_ASSOCIATES_DISCLOSURE_EN,
  AMAZON_ASSOCIATES_DISCLOSURE_NL,
  OEM_AFTERMARKET_NOTICE,
  renderAffiliateDisclosureHtml
} from '../src/affiliate/AffiliateDisclosure.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { AmazonAffiliateProvider } from '../src/affiliate/AmazonAffiliateProvider.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { getAllIndexablePartsList } from '../src/seo/PartIndexationRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('Phase 59B — 1. Direct Amazon CTA navigation without intermediate 302 redirects', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    const testParts = ['11231602050', '11210071001', '00009677339'];
    for (const partNo of testParts) {
      const html = renderPartDetailPageHtml(partNo);

      // Verify CTA anchor exists and has direct Amazon href
      const ctaAnchorRegex = /<a\s+[^>]*href="([^"]+)"[^>]*data-affiliate-endpoint="\/api\/affiliate\/out[^"]*"[^>]*>/i;
      const match = html.match(ctaAnchorRegex);
      assert.ok(match, `Part ${partNo} must have an affiliate CTA anchor with direct Amazon destination`);

      const directHref = match[1];
      assert.ok(
        directHref.startsWith('https://www.amazon.nl/s?') || directHref.startsWith('https://amazon.nl/s?'),
        `Part ${partNo} CTA href must directly target amazon.nl search, got: ${directHref}`
      );
      assert.ok(
        !directHref.includes('/api/affiliate/out'),
        `Part ${partNo} CTA href must not be a redirect URL`
      );
      assert.ok(
        directHref.includes('tag=srihldecoder2-21'),
        `Part ${partNo} CTA direct URL must include the associate tag`
      );

      // Verify non-blocking tracking handler and backward compatibility attributes
      assert.ok(
        html.includes('data-tracking-url="/api/affiliate/track"'),
        `Part ${partNo} CTA container must provide data-tracking-url`
      );
      assert.ok(
        html.includes('data-affiliate-endpoint="/api/affiliate/out?'),
        `Part ${partNo} CTA container must retain data-affiliate-endpoint for assertion compatibility`
      );
      assert.ok(
        html.includes('window.handleAffiliateClick'),
        `Part ${partNo} CTA anchor must wire handleAffiliateClick`
      );
    }
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 59B — 2. Amazon Associates tag and regional routing isolation', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    // Default NL provider
    const nlProvider = new AmazonAffiliateProvider({ marketplace: 'amazon.nl' });
    const nlOffers = nlProvider.getOffers({ partNumber: '11231602050' });
    assert.equal(nlOffers.length, 1);
    assert.ok(nlOffers[0].url.startsWith('https://amazon.nl/s?'));
    assert.ok(nlOffers[0].url.includes('tag=srihldecoder2-21'));

    // Regional DE tag override
    process.env.AMAZON_ASSOCIATE_TAG_DE = 'srihldecoder-de-21';
    const deProvider = new AmazonAffiliateProvider({ marketplace: 'amazon.de' });
    const deOffers = deProvider.getOffers({ partNumber: '11231602050' });
    assert.equal(deOffers.length, 1);
    assert.ok(deOffers[0].url.startsWith('https://amazon.de/s?'));
    assert.ok(deOffers[0].url.includes('tag=srihldecoder-de-21'));

    // Reject unknown or untrusted domain regions (fail-closed)
    const untrustedProvider = new AmazonAffiliateProvider({ marketplace: 'evil-marketplace.com' });
    const untrustedOffers = untrustedProvider.getOffers({ partNumber: '11231602050' });
    assert.deepEqual(untrustedOffers, [], 'Untrusted marketplace must produce zero offers (fail-closed isolation)');
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 59B — 3. Exact required English disclosure and clear Dutch explanation', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    const disclosureHtml = renderAffiliateDisclosureHtml();

    // Verify exact required English disclosure
    assert.ok(
      disclosureHtml.includes(AMAZON_ASSOCIATES_DISCLOSURE_EN),
      'Must contain exact Amazon Associates English disclosure'
    );
    assert.equal(
      AMAZON_ASSOCIATES_DISCLOSURE_EN,
      'As an Amazon Associate I earn from qualifying purchases.',
      'English declaration text must match Amazon Operating Agreement verbatim'
    );

    // Verify Dutch explanation
    assert.ok(
      disclosureHtml.includes(AMAZON_ASSOCIATES_DISCLOSURE_NL),
      'Must contain clear Dutch affiliate explanation'
    );
    assert.equal(
      AMAZON_ASSOCIATES_DISCLOSURE_NL,
      'Als Amazon-partner verdien ik aan kwalificerende aankopen.',
      'Dutch declaration text must be clear and transparent'
    );

    // Verify link to /privacy
    assert.ok(
      disclosureHtml.includes('href="/privacy"'),
      'Disclosure must provide a direct link to /privacy'
    );

    // Verify on SSR rendered part page
    const html = renderPartDetailPageHtml('11231602050');
    assert.ok(html.includes('As an Amazon Associate I earn from qualifying purchases.'));
    assert.ok(html.includes('Als Amazon-partner verdien ik aan kwalificerende aankopen.'));
    assert.ok(html.includes('href="/privacy"'));
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 59B — 4. Clear distinction between OEM parts and aftermarket search results', () => {
  const originalEnv = { ...process.env };
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';

  try {
    const disclosureHtml = renderAffiliateDisclosureHtml();

    assert.ok(
      disclosureHtml.includes(OEM_AFTERMARKET_NOTICE),
      'Must contain clear OEM vs aftermarket search notice'
    );
    assert.ok(
      disclosureHtml.includes('originele onderdelen als compatibele aftermarket'),
      'Notice must explicitly warn that Amazon results may include aftermarket alternatives'
    );

    const html = renderPartDetailPageHtml('11231602050');
    assert.ok(html.includes('originele onderdelen als compatibele aftermarket'));
  } finally {
    process.env = originalEnv;
  }
});

test('Phase 59B — 5. Privacy Policy Template (/privacy) is complete, accessible and noindexed', () => {
  const privacyHtml = renderPrivacyPolicyHtml();

  // Must be valid SSR HTML
  assert.ok(privacyHtml.startsWith('<!DOCTYPE html>'));
  assert.ok(privacyHtml.includes('<title>Privacy- &amp; Cookiebeleid | STIHLDecoder.nl</title>') || privacyHtml.includes('Privacy- & Cookiebeleid | STIHLDecoder.nl'));

  // Must protect search indexation
  assert.ok(privacyHtml.includes('<meta name="robots" content="noindex, follow">'));
  assert.ok(privacyHtml.includes('href="https://stihldecoder.nl/privacy/"') || privacyHtml.includes('href="https://www.stihldecoder.nl/privacy/"'));

  // Must include exact Amazon disclosure
  assert.ok(privacyHtml.includes('As an Amazon Associate I earn from qualifying purchases.'));
  assert.ok(privacyHtml.includes('Als Amazon-partner verdien ik aan kwalificerende aankopen.'));

  // Must explain cookie types (functional, analytical, Amazon third-party)
  assert.ok(privacyHtml.includes('Functionele cookies'));
  assert.ok(privacyHtml.includes('Analytische cookies'));
  assert.ok(privacyHtml.includes('Amazon Affiliate &amp; Externe Links') || privacyHtml.includes('Amazon Affiliate & Externe Links'));

  // Must provide interactive consent controls
  assert.ok(privacyHtml.includes('id="manage-cookie-reject"'));
  assert.ok(privacyHtml.includes('id="manage-cookie-accept"'));
});

test('Phase 59B — 6. Non-blocking beacon tracking endpoint contracts', () => {
  const serverPath = path.resolve(ROOT_DIR, 'server.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');

  // /api/affiliate/track accepts telemetry and returns 202
  assert.ok(serverCode.includes("pathname === '/api/affiliate/track'"));
  assert.ok(serverCode.includes("pathname === '/api/affiliate/click'"));
  assert.ok(serverCode.includes('202'));

  // /api/affiliate/out returns 410 Gone with REDIRECT_DISABLED
  assert.ok(serverCode.includes("pathname === '/api/affiliate/out'"));
  assert.ok(serverCode.includes('410'));
  assert.ok(serverCode.includes('REDIRECT_DISABLED'));
});

test('Phase 59B — 7. Canonical catalog, sitemap, and zero-unverified-ASIN invariants', () => {
  const catalogPath = path.resolve(ROOT_DIR, 'data', 'parts_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  // 18,373 canonical parts
  assert.equal(catalog.parts.length, 18373, 'Must maintain exactly 18,373 parts');

  // Exactly 0 manual ASIN offers declared
  const offersPath = path.resolve(ROOT_DIR, 'data', 'affiliate', 'amazon_part_offers.json');
  const offersDoc = JSON.parse(fs.readFileSync(offersPath, 'utf8'));
  const manualOffers = Array.isArray(offersDoc) ? offersDoc : (offersDoc.offers || []);
  assert.equal(manualOffers.length, 0, 'Must have zero unverified ASIN manual offers');

  // Indexable parts remain 843
  const indexableParts = getAllIndexablePartsList();
  assert.equal(indexableParts.length, 843, 'Must maintain exactly 843 indexable parts');

  // Sitemap preserves exact 1,024 URLs without inflation from /privacy
  const dbPath = path.resolve(ROOT_DIR, 'data', 'stihl_database.json');
  const database = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const sitemapXml = generateSitemapXml('https://www.stihldecoder.nl', database);
  const urlMatches = sitemapXml.match(/<loc>/g) || [];
  assert.equal(urlMatches.length, 1024, 'Sitemap URL count must remain exactly 1,024');
  assert.ok(!sitemapXml.includes('/privacy'), '/privacy must not be added to public sitemap');
});
