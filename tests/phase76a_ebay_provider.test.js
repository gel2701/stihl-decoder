import test from 'node:test';
import assert from 'node:assert/strict';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';

const VALID_CAMPAIGN = '5339245312';
const VALID_PART = '11210201200';
const REPLACEMENT_PART = '11210201201';

const setupEnv = (overrides = {}) => {
  const env = {
    EBAY_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: VALID_CAMPAIGN,
    EBAY_CLIENT_ID: 'test_client_id',
    EBAY_CLIENT_SECRET: 'test_client_secret',
    ...overrides
  };
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }
  return () => {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
};

const makeCachedItem = (overrides = {}) => ({
  item_id: 'v1|1234567890|0',
  title: 'Zylinder passend für STIHL 1121 020 1200 MS 260 Sägenspezi',
  marketplace: 'EBAY_DE',
  part_number: VALID_PART,
  seller_name: 'saegenspezi_de',
  brand: 'Sägenspezi',
  item_price: 49.99,
  shipping_cost_nl: 8.90,
  currency: 'EUR',
  ships_to_nl: true,
  itemAffiliateWebUrl: `https://www.ebay.de/itm/1234567890?campid=${VALID_CAMPAIGN}`,
  affiliate_url: `https://www.ebay.de/itm/1234567890?campid=${VALID_CAMPAIGN}`,
  ...overrides
});

test('missing env blocks provider enablement and resolver registration', () => {
  const restore1 = setupEnv({ EBAY_ENABLED: undefined });
  try {
    delete process.env.EBAY_ENABLED;
    const provider = new EbayAffiliateProvider();
    assert.equal(provider.isEnabled(), false);
    const resolver = new AffiliateOfferResolver();
    assert.equal(resolver.providers.has('ebay'), false);
  } finally {
    restore1();
  }

  const restore2 = setupEnv({ EBAY_EPN_CAMPAIGN_ID: '9999999999' });
  try {
    const provider = new EbayAffiliateProvider();
    assert.equal(provider.isEnabled(), false);
    const resolver = new AffiliateOfferResolver();
    assert.equal(resolver.providers.has('ebay'), false);
  } finally {
    restore2();
  }

  const restore3 = setupEnv({ EBAY_CLIENT_ID: '   ' });
  try {
    const provider = new EbayAffiliateProvider();
    assert.equal(provider.isEnabled(), false);
  } finally {
    restore3();
  }

  const restore4 = setupEnv({ EBAY_CLIENT_SECRET: '' });
  try {
    const provider = new EbayAffiliateProvider();
    assert.equal(provider.isEnabled(), false);
  } finally {
    restore4();
  }

  const restore5 = setupEnv({ EBAY_ENABLED: 'false', EBAY_AFFILIATE_ENABLED: 'true' });
  try {
    const provider = new EbayAffiliateProvider();
    assert.equal(provider.isEnabled(), false);
    const resolver = new AffiliateOfferResolver();
    assert.equal(resolver.providers.has('ebay'), false);
  } finally {
    restore5();
  }

  const restore6 = setupEnv({ EBAY_AFFILIATE_ENABLED: 'false' });
  try {
    const provider = new EbayAffiliateProvider();
    assert.equal(provider.isEnabled(), false);
    const resolver = new AffiliateOfferResolver();
    assert.equal(resolver.providers.has('ebay'), false);
  } finally {
    restore6();
  }
});

test('kill switch EBAY_ENABLED=false stops offers immediately', () => {
  const restore = setupEnv({ EBAY_ENABLED: 'false' });
  try {
    const map = new Map([[VALID_PART, makeCachedItem()]]);
    const provider = new EbayAffiliateProvider({ cachedOffers: map });
    assert.equal(provider.isEnabled(), false);
    assert.deepEqual(provider.getOffers({ partNumber: VALID_PART }), []);

    const resolver = new AffiliateOfferResolver();
    assert.equal(resolver.providers.has('ebay'), false);
    const offers = resolver.resolveOffers({ partNumber: VALID_PART });
    assert.equal(offers.some(o => o.provider === 'ebay'), false);
  } finally {
    restore();
  }
});

test('active Amazon offers remain offered and unmutated when eBay is enabled', () => {
  const restore = setupEnv({ AMAZON_AFFILIATE_ENABLED: 'true', AMAZON_ASSOCIATE_TAG_NL: 'test-21' });
  try {
    const map = new Map([[VALID_PART, makeCachedItem()]]);
    const resolver = new AffiliateOfferResolver({ ebayCachedOffers: map });
    assert.equal(resolver.providers.has('ebay'), true);

    const amazonItem = {
      asin: 'B00EXAMPLE',
      part_number: VALID_PART,
      price: 29.99,
      currency: 'EUR',
      title: 'Original Part'
    };
    resolver.ensureLoaded();
    resolver.amazonProvider.manualOverrides.set(VALID_PART, amazonItem);
    const originalAmazonSnapshot = JSON.stringify(amazonItem);

    const offers = resolver.resolveOffers({ partNumber: VALID_PART });
    const amazonOffers = offers.filter(o => o.provider === 'amazon');
    const ebayOffers = offers.filter(o => o.provider === 'ebay');

    assert.ok(amazonOffers.length >= 1);
    assert.equal(ebayOffers.length, 1);
    assert.equal(JSON.stringify(amazonItem), originalAmazonSnapshot);
    assert.equal(amazonOffers[0].provider, 'amazon');
    assert.equal(amazonOffers[0].part_number, VALID_PART);
    assert.equal(ebayOffers[0].provider, 'ebay');
    assert.equal(ebayOffers[0].marketplace, 'ebay.de');
  } finally {
    restore();
  }
});

test('filters cached offers with missing or invalid affiliate URLs', () => {
  const restore = setupEnv();
  try {
    const invalidUrls = [
      undefined,
      null,
      '',
      'https://evil.com/itm/123',
      'http://www.ebay.de/itm/123',
      `https://www.ebay.de/itm/123?campid=9999999999`,
      'not a url'
    ];
    for (const badUrl of invalidUrls) {
      const map = new Map([[VALID_PART, makeCachedItem({ itemAffiliateWebUrl: badUrl })]]);
      const provider = new EbayAffiliateProvider({ cachedOffers: map });
      assert.deepEqual(provider.getOffers({ partNumber: VALID_PART }), []);
    }
  } finally {
    restore();
  }
});

test('filters cached offers when shipping to NL is unconfirmed or falsy', () => {
  const restore = setupEnv();
  try {
    for (const badShip of [false, null, undefined, 0, 'false']) {
      const map = new Map([[VALID_PART, makeCachedItem({ ships_to_nl: badShip })]]);
      const provider = new EbayAffiliateProvider({ cachedOffers: map });
      assert.deepEqual(provider.getOffers({ partNumber: VALID_PART }), []);
    }
  } finally {
    restore();
  }
});

test('filters mismatched part numbers, invalid titles, and unrelated parts', () => {
  const restore = setupEnv();
  try {
    const wrongPartMap = new Map([[VALID_PART, makeCachedItem({ part_number: '11230302003' })]]);
    const p1 = new EbayAffiliateProvider({ cachedOffers: wrongPartMap });
    assert.deepEqual(p1.getOffers({ partNumber: VALID_PART }), []);

    const titleMissingPartMap = new Map([[VALID_PART, makeCachedItem({
      title: 'Universal Chainsaw Chain Sägenspezi'
    })]]);
    const p2 = new EbayAffiliateProvider({ cachedOffers: titleMissingPartMap });
    assert.deepEqual(p2.getOffers({ partNumber: VALID_PART }), []);

    const unrelatedNameMap = new Map([[VALID_PART, makeCachedItem()]]);
    const p3 = new EbayAffiliateProvider({ cachedOffers: unrelatedNameMap });
    assert.deepEqual(p3.getOffers({ partNumber: VALID_PART, partName: 'Carburetor Membrane Kit' }), []);
  } finally {
    restore();
  }
});

test('handles verified replacement parts and rejects unverified replacements', () => {
  const restore = setupEnv();
  try {
    const validReplacement = makeCachedItem({
      part_number: REPLACEMENT_PART,
      title: `Zylinder passend für STIHL ${REPLACEMENT_PART} Sägenspezi`,
      itemAffiliateWebUrl: `https://www.ebay.de/itm/1234567890?campid=${VALID_CAMPAIGN}`,
      verified_replacements: [{
        part_number: VALID_PART,
        replacement_part_number: REPLACEMENT_PART,
        verified: true
      }]
    });
    const map1 = new Map([[VALID_PART, validReplacement]]);
    const p1 = new EbayAffiliateProvider({ cachedOffers: map1 });
    const offers1 = p1.getOffers({ partNumber: VALID_PART });
    assert.equal(offers1.length, 1);
    assert.equal(offers1[0].item_id, 'v1|1234567890|0');

    const unverifiedReplacement = makeCachedItem({
      part_number: REPLACEMENT_PART,
      title: `Zylinder passend für STIHL ${REPLACEMENT_PART} Sägenspezi`,
      itemAffiliateWebUrl: `https://www.ebay.de/itm/1234567890?campid=${VALID_CAMPAIGN}`,
      verified_replacements: [{
        part_number: VALID_PART,
        replacement_part_number: REPLACEMENT_PART,
        verified: false
      }]
    });
    const map2 = new Map([[VALID_PART, unverifiedReplacement]]);
    const p2 = new EbayAffiliateProvider({ cachedOffers: map2 });
    assert.deepEqual(p2.getOffers({ partNumber: VALID_PART }), []);
  } finally {
    restore();
  }
});

test('restricts to EBAY_NL and EBAY_DE marketplaces, deduplicates duplicate items, and never infers OEM', () => {
  const restore = setupEnv();
  try {
    const usMarketplace = makeCachedItem({ marketplace: 'EBAY_US' });
    const p1 = new EbayAffiliateProvider({ cachedOffers: new Map([[VALID_PART, usMarketplace]]) });
    assert.deepEqual(p1.getOffers({ partNumber: VALID_PART }), []);

    const nlMarketplace = makeCachedItem({
      marketplace: 'EBAY_NL',
      itemAffiliateWebUrl: `https://www.ebay.nl/itm/1234567890?campid=${VALID_CAMPAIGN}`,
      affiliate_url: `https://www.ebay.nl/itm/1234567890?campid=${VALID_CAMPAIGN}`
    });
    const p2 = new EbayAffiliateProvider({ cachedOffers: new Map([[VALID_PART, nlMarketplace]]) });
    const nlOffers = p2.getOffers({ partNumber: VALID_PART });
    assert.equal(nlOffers.length, 1);
    assert.equal(nlOffers[0].marketplace, 'ebay.nl');

    const duplicates = [
      makeCachedItem({ item_id: 'v1|100|0' }),
      makeCachedItem({ item_id: 'v1|100|0' }),
      makeCachedItem({ item_id: 'v1|200|0' })
    ];
    const p3 = new EbayAffiliateProvider({ cachedOffers: new Map([[VALID_PART, duplicates]]) });
    const dedupedOffers = p3.getOffers({ partNumber: VALID_PART });
    assert.equal(dedupedOffers.length, 2);

    for (const offer of dedupedOffers) {
      assert.notEqual(offer.brand.toLowerCase(), 'stihl');
      assert.notEqual(offer.brand.toLowerCase(), 'oem');
      assert.equal(offer.brand, 'Sägenspezi');
    }
  } finally {
    restore();
  }
});
