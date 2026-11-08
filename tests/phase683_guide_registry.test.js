import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGuidePageHtml } from '../src/components/GuidePageTemplate.js';
import { getStructuredGuide } from '../src/content/guides/index.js';
import { defaultResolverInstance } from '../src/affiliate/AffiliateOfferResolver.js';

const guide = getStructuredGuide('stihl-bougie-vervangen');
const registry = defaultResolverInstance.verifiedRegistry;

function renderWith(offers, active = null) {
  const resolve = defaultResolverInstance.resolveOffers;
  const getActive = registry.getActiveOffer;
  const getTag = defaultResolverInstance.amazonProvider.getAssociateTag;
  try {
    defaultResolverInstance.amazonProvider.getAssociateTag = () => 'test-21';
    defaultResolverInstance.resolveOffers = () => offers;
    registry.getActiveOffer = () => active;
    return renderGuidePageHtml(guide, {});
  } finally {
    defaultResolverInstance.resolveOffers = resolve;
    registry.getActiveOffer = getActive;
    defaultResolverInstance.amazonProvider.getAssociateTag = getTag;
  }
}

const direct = {
  provider: 'amazon', part_number: '11104007005', marketplace: 'amazon.nl',
  url: `https://amazon.nl/dp/${'B0068M5NAG'}?tag=test-21`, asin: 'B0068M5NAG',
  link_type: 'DIRECT_ASIN', is_verified: true, title: 'Verified title',
  label: 'Bekijk product', badge_label: 'Geverifieerd', description: 'Getest'
};
const fallback = {
  provider: 'amazon', part_number: '11104007005', marketplace: 'amazon.nl',
  url: 'https://amazon.nl/s?k=STIHL+11104007005&tag=test-21', asin: null,
  link_type: 'SEARCH_FALLBACK', is_verified: false, title: 'Zoek onderdeel',
  label: 'Zoek op Amazon.nl', badge_label: 'Amazon-zoekopdracht', description: 'Niet gecontroleerd'
};

test('active direct offer uses descriptor only', () => {
  const html = renderWith([direct], { asin: direct.asin, marketplace: direct.marketplace });
  assert.match(html, /Geverifieerde Vervangingsonderdelen & Directe Links/);
  assert.match(html, /Verified title/);
  assert.ok(html.includes(`href="https://amazon.nl/dp/${direct.asin}?tag=test-21"`));
  assert.doesNotMatch(html, /onclick=/);
});

test('staged, rejected, unknown and no provider never render direct link', () => {
  for (const offers of [[direct, fallback], [fallback], [], [{ ...direct, part_number: 'unknown' }]]) {
    const html = renderWith(offers);
    assert.doesNotMatch(html, /href="[^"]*\/dp\//);
    assert.match(html, /Vervangingsonderdelen & Zoekmogelijkheden/);
    assert.doesNotMatch(html, /100% Geverifieerde Producten/);
  }
});

test('only safe provider search fallback renders link', () => {
  const html = renderWith([fallback]);
  assert.match(html, /href="https:\/\/amazon.nl\/s\?k=STIHL\+11104007005&amp;tag=test-21"/);
  assert.match(html, /Zoek op Amazon.nl/);
  for (const offer of [{ ...fallback, url: 'javascript:alert(1)' }, { ...fallback, url: 'https://evil.example/s?k=x&tag=y' }, { ...fallback, link_type: 'DIRECT_ASIN' }]) {
    assert.doesNotMatch(renderWith([offer]), /href="[^"]*(?:evil\.example|javascript:|amazon.nl\/s)/);
  }
});

test('offer text and attributes are escaped', () => {
  const html = renderWith([{ ...fallback, title: '<script>alert(1)</script>', label: '" onmouseover="alert(1)', description: '<img src=x onerror=alert(1)>' }]);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot; onmouseover=&quot;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
