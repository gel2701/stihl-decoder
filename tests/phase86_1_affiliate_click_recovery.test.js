import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderMultiMarketplaceButtonsHtml } from '../src/components/MarketplaceButtons.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { validateEbayAffiliateUrl } from '../src/affiliate/EbayOfferStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readText = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');
const readJson = (relPath) => JSON.parse(readText(relPath));

const EXPECTED_AMAZON_TAGS = {
  'amazon.nl': 'srihldecoder2-21',
  'amazon.de': 'srihldecode00-21'
};

test('Phase 86.1 — 1. Amazon.nl en Amazon.de gebruiken elk hun eigen PartnerNet-tag', () => {
  const registry = readJson('data/affiliate/verified_amazon_registry.json');
  const directOffers = registry.offers.filter((offer) => typeof offer.direct_affiliate_url === 'string');
  assert.ok(directOffers.length > 0, 'registry must contain direct affiliate URLs');

  for (const offer of directOffers) {
    const marketplace = String(offer.marketplace || '').toLowerCase();
    const expectedTag = EXPECTED_AMAZON_TAGS[marketplace];
    assert.ok(expectedTag, `unexpected marketplace ${marketplace} for part ${offer.part_number}`);
    const url = new URL(offer.direct_affiliate_url);
    assert.equal(url.searchParams.get('tag'), expectedTag, `part ${offer.part_number} must use ${marketplace} tag ${expectedTag}`);
    assert.equal(offer.affiliate_tag, expectedTag, `stored affiliate_tag must match the marketplace for ${offer.part_number}`);
    assert.ok(!url.searchParams.get('tag').startsWith('srihldecoder2') || marketplace === 'amazon.nl', 'NL tag may never leak to amazon.de');
  }
});

test('Phase 86.1 — 2. eBay behoudt campagne 5339245312 in elk gepubliceerd aanbod', () => {
  const payload = readJson('output/phase86/ebay_offers_phase86.json');
  const offers = Array.isArray(payload.offers) ? payload.offers : [];
  assert.ok(offers.length > 0, 'phase 86 eBay payload must contain offers');

  for (const offer of offers) {
    const url = offer.affiliate_url || offer.url;
    assert.ok(typeof url === 'string' && url.length > 0, 'every eBay offer must keep its affiliate URL');
    const validation = validateEbayAffiliateUrl(url, '5339245312');
    assert.equal(validation.valid, true, `invalid EPN URL for ${offer.part_number}: ${validation.reason || ''}`);
    assert.equal(new URL(url).searchParams.get('campid'), '5339245312');
  }
});

test('Phase 86.1 — 3. Gesuspendeerde Amazon-aanbiedingen worden nooit ongeverifieerd gepubliceerd', () => {
  const registryDoc = readJson('data/affiliate/verified_amazon_registry.json');
  const suspended = registryDoc.offers.filter((offer) => offer.status === 'SUSPENDED');
  assert.ok(suspended.length > 0, 'Phase 86 must have suspended delisted listings');

  const registry = new VerifiedOfferRegistry();
  registry.loadFromFile();
  registry.productionActivationAllowed = true;

  const audit = registryDoc.availability_audit || {};
  assert.equal(audit.method, 'LIVE_BROWSER_GET');
  assert.ok(audit.controls?.live_asin_control?.http_status === 200);
  assert.ok(audit.controls?.missing_asin_control?.http_status === 404);

  for (const offer of suspended) {
    assert.equal(offer.previous_status, 'ACTIVE', 'suspension must record the previous lifecycle status');
    assert.ok(offer.status_reason && offer.status_reason.length > 0, 'suspension must keep its written reason');
    assert.ok(Array.isArray(offer.verifiable_evidence_sources) && offer.verifiable_evidence_sources.length > 0, 'original evidence must be preserved');

    const publicOffers = registry.getActiveOffers(offer.part_number) || [];
    assert.ok(
      !publicOffers.some((active) => String(active.asin).toUpperCase() === String(offer.asin).toUpperCase()
        && String(active.marketplace).toLowerCase() === String(offer.marketplace).toLowerCase()),
      `suspended ASIN ${offer.asin} must never be served as a direct buy link`
    );
  }
});

test('Phase 86.1 — 4. Beide geverifieerde marketplaces zijn direct zichtbaar, zoekopties niet', () => {
  const multiOffer = {
    direct_offers: [
      {
        provider: 'amazon',
        marketplace: 'amazon.nl',
        display_marketplace: 'Amazon.nl',
        asin: 'B00NL12345',
        url: 'https://www.amazon.nl/dp/B00NL12345?tag=srihldecoder2-21',
        label: 'Koop bij Amazon.nl',
        is_direct: true,
        offer_type: 'DIRECT_ASIN'
      },
      {
        provider: 'ebay',
        marketplace: 'ebay.nl',
        display_marketplace: 'eBay.nl',
        item_id: 'v1|123456789012|0',
        url: 'https://www.ebay.nl/itm/123456789012?campid=5339245312',
        label: 'Koop bij eBay.nl',
        is_direct: true,
        offer_type: 'DIRECT_EBAY_ITEM'
      }
    ],
    search_offers: [
      {
        provider: 'amazon',
        marketplace: 'amazon.de',
        display_marketplace: 'Amazon.de',
        url: 'https://www.amazon.de/s?k=11231602050&tag=srihldecode00-21',
        label: 'Zoek op Amazon.de',
        is_direct: false,
        offer_type: 'SEARCH_LINK'
      }
    ]
  };

  const html = renderMultiMarketplaceButtonsHtml(multiOffer, { partNumber: '11231602050' });
  const visible = html.split('<details')[0];

  assert.ok(visible.includes('Koop bij Amazon.nl'));
  assert.ok(visible.includes('Koop bij eBay.nl'));
  assert.equal((visible.match(/min-h-\[44px\]/g) || []).length, 2, 'both direct buttons keep a 44px mobile tap target');

  const hidden = html.slice(html.indexOf('<details'));
  assert.ok(hidden.includes('Zoek op Amazon.de'));
  assert.ok(hidden.includes('data-offer-type="SEARCH_LINK"'));
  assert.ok(!hidden.includes('Koop bij'), 'no verified buy button may be collapsed');
  assert.ok(!visible.includes('Zoek op'), 'no search fallback may be presented as a verified offer');
});

test('Phase 86.1 — 5. Geautomatiseerde tests volgen nooit een echte affiliate-bestemming', () => {
  const gates = readText('tests/e2e/e2e-gates.js');
  assert.match(gates, /amazon\\\.\(\?:nl\|de\|com\)/, 'e2e gates must block Amazon hosts');
  assert.match(gates, /ebay\\\.\(\?:nl\|de\|com\|co\\\.uk\)/, 'e2e gates must block eBay hosts');
  assert.ok(gates.includes('a[href*="amazon."]'), 'e2e gates must cancel Amazon anchor clicks');
  assert.ok(gates.includes('a[href*="ebay."]'), 'e2e gates must cancel eBay anchor clicks');

  const e2eDir = path.join(rootDir, 'tests', 'e2e');
  for (const file of fs.readdirSync(e2eDir).filter((name) => name.endsWith('.spec.js'))) {
    const source = fs.readFileSync(path.join(e2eDir, file), 'utf8');
    assert.ok(
      !/\.goto\(\s*['"`]https?:\/\/(?:[^/]*\.)?(?:amazon|ebay)\./i.test(source),
      `${file} must not navigate to a real marketplace page`
    );
    assert.ok(
      !/\.newPage\(/.test(source) || source.includes('attachIntegrityGates'),
      `${file} must install the affiliate network gates`
    );
  }
});

test('Phase 86.1 — 6. Click-tracking onderscheidt eBay van Amazon', () => {
  const server = readText('server.js');
  assert.ok(server.includes("'www.ebay.nl'") && server.includes("'www.ebay.de'"), 'eBay hosts must be accepted as a tracked destination');
  assert.ok(server.includes('EVENT_TYPES.EBAY_VERIFIED_PRODUCT_CLICK'), 'eBay direct clicks get their own event type');
  assert.ok(server.includes('EVENT_TYPES.EBAY_SEARCH_FALLBACK_CLICK'), 'eBay search clicks get their own event type');
  assert.ok(server.includes('REDIRECT_DISABLED'), 'no intermediate affiliate redirect may be reintroduced');
});
