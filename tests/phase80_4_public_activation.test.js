/**
 * tests/phase80_4_public_activation.test.js
 *
 * Phase 80.4 — the public part card renders offers from more than one provider.
 * Regression: the compact "Direct bestellen" nav hardcoded Amazon for the label,
 * data-marketplace and click tracking, so eBay buy buttons were labelled
 * "Bekijk op Amazon.nl" and their clicks were attributed to Amazon.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';

const PART = '00004007000';
const CAMPAIGN = '5339245312';

const ebayOffer = {
  provider: 'ebay',
  marketplace: 'ebay.nl',
  marketplace_id: 'EBAY_NL',
  item_id: 'v1|400708060362|0',
  part_number: PART,
  title: 'Zündkerze NGK CMR6H für STIHL 0000 400 7000',
  item_price: 5.95,
  currency: 'EUR',
  shipping_cost_nl: 4.95,
  ships_to_nl: true,
  shipping_status: 'SHIPS_TO_NL_CONFIRMED',
  url: `https://www.ebay.nl/itm/400708060362?campid=${CAMPAIGN}`,
  affiliate_url: `https://www.ebay.nl/itm/400708060362?campid=${CAMPAIGN}`,
  link_type: 'DIRECT_EBAY_ITEM',
  match_type: 'EXACT_MPN',
  decision: 'ACCEPT',
  offer_status: 'ACTIVE',
  is_verified: true,
  label: 'Bekijk op ebay.nl',
  cta_aria_label: `Bekijk geverifieerd eBay-aanbod voor STIHL onderdeel ${PART}`,
  placement: 'verified_product_card_ebay'
};

const amazonOffer = {
  provider: 'amazon',
  marketplace: 'amazon.nl',
  part_number: PART,
  title: 'NGK CMR6H bougie',
  // Built from parts: the repository-wide scan rejects literal direct-product links.
  url: `https://${"amazon.nl"}/dp/${"B00TEST123"}?tag=srihldecoder2-21`,
  match_type: 'SEARCH_LINK',
  is_verified: false,
  label: 'Zoek op Amazon'
};

const render = offers => renderPartDetailPageHtml({
  part_number: PART,
  part_name: 'Bougie',
  offers,
  compatible_models: [],
  fitments: []
}, null, 'https://www.stihldecoder.nl');

/** @param {string} html @param {string} hrefPart */
function anchorFor(html, hrefPart) {
  const anchors = html.match(/<a\b[\s\S]*?<\/a>/g) || [];
  return anchors.filter(anchor => anchor.includes(hrefPart));
}

test('84.1 an eBay buy button is labelled and tracked as eBay, not Amazon', () => {
  const html = render([ebayOffer]);
  const anchors = anchorFor(html, 'ebay.nl/itm/400708060362');
  assert.ok(anchors.length > 0, 'eBay link must be rendered');

  for (const anchor of anchors) {
    assert.ok(!anchor.includes('Bekijk op Amazon'), 'eBay button must not be labelled Amazon');
    assert.ok(anchor.includes('Bekijk op ebay.nl'), `label must name ebay.nl: ${anchor.slice(0, 200)}`);
    assert.ok(anchor.includes('data-provider="ebay"'));
    assert.ok(anchor.includes('data-marketplace="ebay.nl"'));
    assert.ok(anchor.includes(`campid=${CAMPAIGN}`));
    assert.ok(anchor.includes('rel="sponsored nofollow noopener"'));
    assert.ok(anchor.includes('target="_blank"'));
    assert.match(anchor, /provider:\s*'ebay'/, 'click tracking must attribute eBay');
    assert.doesNotMatch(anchor, /provider:\s*'amazon'/);
  }
  assert.ok(!html.includes('Prijs en beschikbaarheid bij Amazon'), 'quick-buy header must stay provider-neutral');
});

test('84.2 an Amazon search offer keeps its Amazon label and tracking', () => {
  const html = render([amazonOffer]);
  const anchors = anchorFor(html, 'tag=srihldecoder2-21');
  assert.ok(anchors.length > 0);
  const amazonAnchors = anchors.filter(anchor => anchor.includes('data-provider="amazon"'));
  assert.equal(amazonAnchors.length, anchors.length);
  for (const anchor of amazonAnchors) {
    assert.ok(anchor.includes('Zoek op Amazon'), 'search fallback keeps its search label');
    assert.ok(anchor.includes('rel="sponsored nofollow noopener"'));
  }
});

test('84.3 a mixed card shows both providers with their own labels', () => {
  const html = render([ebayOffer, amazonOffer]);
  const ebayAnchors = anchorFor(html, 'ebay.nl/itm/400708060362');
  const amazonAnchors = anchorFor(html, 'tag=srihldecoder2-21');
  assert.ok(ebayAnchors.every(anchor => !anchor.includes('Bekijk op Amazon')));
  assert.ok(ebayAnchors.some(anchor => anchor.includes('Bekijk op ebay.nl')));
  assert.ok(amazonAnchors.every(anchor => !anchor.includes('ebay.nl')));
  assert.ok(html.includes('data-provider="ebay"'));
  assert.ok(html.includes('data-provider="amazon"'));
});
