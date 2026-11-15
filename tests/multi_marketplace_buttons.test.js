import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getPartAffiliateOffers,
  getPartAffiliateOffer,
  resolvePurchaseOffer
} from '../src/search/IntelligentPartsSearchEngine.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { validateEbayAffiliateUrl } from '../src/affiliate/EbayOfferStore.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { renderMultiMarketplaceButtonsHtml } from '../src/components/MarketplaceButtons.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { getDirectPartsForModel } from '../src/parts/DirectPartsEngine.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf-8'));

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined || v === null) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

function makeAmazonRecord(partNumber, asin, marketplace, status = 'ACTIVE', shippingStatus = 'SHIPS_TO_NL_CONFIRMED') {
  const tag = marketplace === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
  return {
    part_number: partNumber,
    part_number_formatted: `${partNumber.slice(0, 4)} ${partNumber.slice(4, 7)} ${partNumber.slice(7)}`,
    asin,
    marketplace,
    affiliate_tag: tag,
    manufacturer: marketplace === 'amazon.de' ? 'Sägenspezi' : 'Bosch Automotive Aftermarket',
    manufacturer_part_number: 'MPN-TEST-001',
    brand: marketplace === 'amazon.de' ? 'Sägenspezi' : 'Bosch',
    product_title: `Test onderdeel voor STIHL ${partNumber}`,
    package_quantity: 1,
    oem_brand_classification: 'OEM_SUPPLIER_EQUIVALENT',
    status,
    shipping_to_nl_status: shippingStatus,
    kill_switch_id: `KILL_PILOT_${partNumber}`,
    kill_switch_active: false,
    verifiable_evidence_sources: [
      {
        type: 'EXTERNAL_CATALOG',
        url: `https://www.motointegrator.de/artikel/test-${asin.toLowerCase()}`,
        title: 'External Catalog',
        claim: `Bevestigt 1-op-1 ASIN ${asin} voor STIHL ${partNumber}`,
        retrieved_at: '2026-11-01'
      }
    ],
    compatibility_proof: `Direct equivalent for STIHL ${partNumber}, compatible with MS 260.`,
    asin_product_identity_proof: `Bevestigt 1-op-1 ASIN ${asin} als authentieke eenheid voor ${partNumber}.`,
    independent_evidence_url: `https://www.motointegrator.de/artikel/test-${asin.toLowerCase()}`,
    direct_affiliate_url: `https://${marketplace}/dp/${asin}?tag=${tag}`,
    search_fallback_url: `https://${marketplace}/s?k=STIHL+${partNumber}&tag=${tag}`,
    verification_date: '2026-11-01',
    gate_1_technical: { status: 'PASS', passed: true, errors: [] },
    gate_2_product: { status: 'PASS', passed: true, errors: [] },
    updated_at: '2026-11-11T21:40:49.529Z'
  };
}

function makeRegistry(records) {
  const reg = new VerifiedOfferRegistry();
  reg.productionActivationAllowed = true;
  reg.loadFromFile = () => {};
  reg.offers.clear();
  reg.partIndex.clear();
  for (const rec of records) {
    const norm = rec.part_number;
    const key = `${norm}::${rec.marketplace}::${rec.asin}`;
    reg.offers.set(key, rec);
    if (!reg.partIndex.has(norm)) reg.partIndex.set(norm, []);
    reg.partIndex.get(norm).push(rec);
  }
  return reg;
}

function makeMockEbayProvider(offersByPart = {}, enabled = true) {
  const provider = new EbayAffiliateProvider();
  provider.isEnabled = () => enabled;
  provider.getOffers = ({ canonicalPartNumber }) => {
    if (!enabled) return [];
    return offersByPart[canonicalPartNumber] || [];
  };
  return provider;
}

function makeEbayOffer(partNumber, itemId = 'v1|123456789012|0', marketplace = 'ebay.nl') {
  return {
    provider: 'ebay',
    marketplace,
    item_id: itemId,
    url: `https://www.ebay.nl/itm/123456789012?mkcid=1&mkrid=1346-53482-19255-0&campid=5339245312`,
    affiliate_url: `https://www.ebay.nl/itm/123456789012?mkcid=1&mkrid=1346-53482-19255-0&campid=5339245312`,
    seller_name: 'chainsaw_direct',
    item_price: 19.95,
    currency: 'EUR',
    is_direct: true
  };
}

test('1. Multi-marketplace: alleen Amazon.nl ACTIVE', () => {
  const part = '11231602050';
  const registry = makeRegistry([makeAmazonRecord(part, 'B001234567', 'amazon.nl')]);
  const ebay = makeMockEbayProvider({}, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    AMAZON_ASSOCIATE_TAG_DE: 'srihldecode00-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_offers.length, 1);
    assert.equal(res.direct_offers[0].marketplace, 'amazon.nl');
    assert.equal(res.direct_offers[0].label, 'Koop bij Amazon.nl');
    assert.deepEqual(res.search_offers.map(o => o.label), ['Zoek op Amazon.de', 'Zoek op eBay.nl']);
  });
});

test('2. Multi-marketplace: alleen Amazon.de ACTIVE', () => {
  const part = '11231602050';
  const registry = makeRegistry([makeAmazonRecord(part, 'B00DE12345', 'amazon.de')]);
  const ebay = makeMockEbayProvider({}, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    AMAZON_ASSOCIATE_TAG_DE: null,
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_offers.length, 1);
    assert.equal(res.direct_offers[0].marketplace, 'amazon.de');
    assert.equal(res.direct_offers[0].label, 'Koop bij Amazon.de');
    assert.deepEqual(res.search_offers.map(o => o.label), ['Zoek op Amazon.nl', 'Zoek op eBay.nl']);
  });
});

test('3. Multi-marketplace: alleen eBay.nl ACTIVE', () => {
  const part = '00006421223';
  const registry = makeRegistry([]);
  const ebay = makeMockEbayProvider({ [part]: [makeEbayOffer(part)] }, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    AMAZON_ASSOCIATE_TAG_DE: null,
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Kettingwiel', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_offers.length, 1);
    assert.equal(res.direct_offers[0].marketplace, 'ebay.nl');
    assert.equal(res.direct_offers[0].label, 'Koop bij eBay.nl');
    assert.deepEqual(res.search_offers.map(o => o.label), ['Zoek op Amazon.nl']);
  });
});

test('4. Multi-marketplace: Amazon.nl + Amazon.de ACTIVE', () => {
  const part = '11231602050';
  const registry = makeRegistry([
    makeAmazonRecord(part, 'B00DE12345', 'amazon.de'),
    makeAmazonRecord(part, 'B00NL12345', 'amazon.nl')
  ]);
  const ebay = makeMockEbayProvider({}, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.deepEqual(res.direct_offers.map(o => o.label), ['Koop bij Amazon.nl', 'Koop bij Amazon.de']);
    assert.deepEqual(res.search_offers.map(o => o.label), ['Zoek op eBay.nl']);
  });
});

test('5. Multi-marketplace: Amazon.nl + eBay.nl ACTIVE', () => {
  const part = '00006421223';
  const registry = makeRegistry([makeAmazonRecord(part, 'B00NL12345', 'amazon.nl')]);
  const ebay = makeMockEbayProvider({ [part]: [makeEbayOffer(part)] }, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    AMAZON_ASSOCIATE_TAG_DE: 'srihldecode00-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Kettingwiel', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.deepEqual(res.direct_offers.map(o => o.label), ['Koop bij Amazon.nl', 'Koop bij eBay.nl']);
    assert.deepEqual(res.search_offers.map(o => o.label), ['Zoek op Amazon.de']);
  });
});

test('6. Multi-marketplace: alle 3 ACTIVE (Amazon.nl + Amazon.de + eBay.nl)', () => {
  const part = '00006421223';
  const registry = makeRegistry([
    makeAmazonRecord(part, 'B00DE12345', 'amazon.de'),
    makeAmazonRecord(part, 'B00NL12345', 'amazon.nl')
  ]);
  const ebay = makeMockEbayProvider({
    [part]: [
      makeEbayOffer(part, 'v1|111|0', 'ebay.nl'),
      makeEbayOffer(part, 'v1|111|0', 'ebay.nl') // duplicate item_id must be deduplicated
    ]
  }, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    AMAZON_ASSOCIATE_TAG_DE: 'srihldecode00-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Kettingwiel', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_marketplace_count, 3);
    assert.deepEqual(res.direct_offers.map(o => o.label), [
      'Koop bij Amazon.nl',
      'Koop bij Amazon.de',
      'Koop bij eBay.nl'
    ]);
    assert.equal(res.search_offers.length, 0);
  });
});

test('7. Multi-marketplace: geen directe aanbieding, alleen geldige zoekfallbacks', () => {
  const part = '11231602050';
  const registry = makeRegistry([]);
  const ebay = makeMockEbayProvider({}, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    AMAZON_ASSOCIATE_TAG_DE: 'srihldecode00-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_offers.length, 0);
    assert.equal(res.has_direct_offers, false);
    assert.deepEqual(res.search_offers.map(o => o.label), [
      'Zoek op Amazon.nl',
      'Zoek op Amazon.de',
      'Zoek op eBay.nl'
    ]);
    const ebaySearch = res.search_offers.find(o => o.marketplace === 'ebay.nl');
    assert.ok(ebaySearch.url.includes('https://www.ebay.nl/sch/i.html'));
    assert.ok(ebaySearch.url.includes('campid=5339245312'));
    assert.ok(ebaySearch.url.includes('1123+160+2050') || ebaySearch.url.includes('1123%20160%202050'));
    assert.equal(ebaySearch.is_direct, false);

    const html = renderMultiMarketplaceButtonsHtml(res, { partNumber: part });
    assert.ok(!html.includes('data-offer-group="direct"'));
    assert.ok(html.includes('data-offer-group="search"'));
    assert.ok(!html.includes('Directe Koop'));
  });
});

test('8. Amazon.de zonder bevestigde NL-verzending wordt geblokkeerd', () => {
  const part = '11231602050';
  const registry = makeRegistry([
    makeAmazonRecord(part, 'B00DE99999', 'amazon.de', 'ACTIVE', 'SHIPPING_UNKNOWN'),
    makeAmazonRecord(part, 'B00DE88888', 'amazon.de', 'ACTIVE', 'DOES_NOT_SHIP_TO_NL')
  ]);
  const ebay = makeMockEbayProvider({}, false);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'false'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_offers.length, 0);
    assert.ok(!res.direct_offers.some(o => o.marketplace === 'amazon.de'));
  });
});

test('9. Inactieve of afgekeurde aanbieding verschijnt nooit als directe koop', () => {
  const part = '11231602050';
  const registry = makeRegistry([
    makeAmazonRecord(part, 'B00NL11111', 'amazon.nl', 'ASIN_IDENTITY_UNVERIFIED'),
    makeAmazonRecord(part, 'B00NL22222', 'amazon.nl', 'INCORRECT_MATCH_CONFIRMED'),
    makeAmazonRecord(part, 'B00NL33333', 'amazon.nl', 'PART_COMPATIBILITY_ONLY')
  ]);
  const ebay = makeMockEbayProvider({}, false);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'false'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_offers.length, 0);
  });
});

test('10. Ontbrekende EPN-configuratie geeft geen affiliate eBay-zoekfallback', () => {
  const part = '11231602050';
  const registry = makeRegistry([]);
  const ebay = new EbayAffiliateProvider();

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: undefined
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.ok(!res.search_offers.some(o => o.provider === 'ebay'));
  });

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'false',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.ok(!res.search_offers.some(o => o.provider === 'ebay'));
  });
});

test('11. Kill-switches blokkeren aanbiedingen per provider, globaal en per onderdeel', () => {
  const part = '11231602050';
  const registry = makeRegistry([makeAmazonRecord(part, 'B00NL12345', 'amazon.nl')]);
  const ebay = makeMockEbayProvider({ [part]: [makeEbayOffer(part)] }, true);

  withEnv({ AFFILIATE_ENABLED: 'false' }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.equal(res.direct_offers.length, 0);
    assert.equal(res.search_offers.length, 0);
  });

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'false',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.deepEqual(res.direct_offers.map(o => o.provider), ['ebay']);
    assert.ok(!res.search_offers.some(o => o.provider === 'amazon'));
  });

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'false',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: makeMockEbayProvider({ [part]: [makeEbayOffer(part)] }, false) });
    assert.ok(!res.direct_offers.some(o => o.provider === 'ebay'));
    assert.ok(!res.search_offers.some(o => o.provider === 'ebay'));
  });

  registry.deactivateOffer(part, 'Kill switch test');
  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    assert.ok(!res.direct_offers.some(o => o.provider === 'amazon'));
  });
});

test('12. Affiliate clicktracking en responsieve kaartmarkup in templates', () => {
  const part = '00006421223';
  const registry = makeRegistry([
    makeAmazonRecord(part, 'B00NL12345', 'amazon.nl'),
    makeAmazonRecord(part, 'B00DE12345', 'amazon.de')
  ]);
  const ebay = makeMockEbayProvider({ [part]: [makeEbayOffer(part)] }, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Kettingwiel', { verifiedRegistry: registry, ebayProvider: ebay });
    const cardHtml = renderMultiMarketplaceButtonsHtml(res, {
      partNumber: part,
      trackingMode: 'handleAffiliateClick',
      compact: false
    });
    assert.ok(cardHtml.includes('data-part-number="00006421223"'));
    assert.ok(cardHtml.includes('data-provider="amazon"'));
    assert.ok(cardHtml.includes('data-provider="ebay"'));
    assert.ok(cardHtml.includes('data-marketplace="amazon.nl"'));
    assert.ok(cardHtml.includes('data-marketplace="amazon.de"'));
    assert.ok(cardHtml.includes('data-marketplace="ebay.nl"'));
    assert.ok(cardHtml.includes('handleAffiliateClick'));
    assert.ok(cardHtml.includes('flex-wrap'));
    assert.ok(cardHtml.includes('min-h-[44px]'));
    assert.ok(cardHtml.includes('Koop bij Amazon.nl'));
    assert.ok(cardHtml.includes('Koop bij Amazon.de'));
    assert.ok(cardHtml.includes('Koop bij eBay.nl'));

    // Also test visual separation when both direct and search offers exist
    const mixed = {
      direct_offers: [res.direct_offers[0]],
      search_offers: [{
        type: 'SEARCH_FALLBACK',
        provider: 'ebay',
        marketplace: 'ebay.nl',
        display_marketplace: 'eBay.nl',
        url: 'https://www.ebay.nl/sch/i.html?_nkw=STIHL+0000+642+1223&mkevt=1&mkcid=1&mkrid=1346-53482-19255-0&campid=5339245312&toolid=10049',
        label: 'Zoek op eBay.nl',
        is_direct: false,
        offer_type: 'SEARCH_LINK'
      }]
    };
    const mixedHtml = renderMultiMarketplaceButtonsHtml(mixed, { partNumber: part });
    assert.ok(mixedHtml.includes('data-offer-group="direct"'));
    assert.ok(mixedHtml.includes('data-offer-group="search"'));
    assert.ok(mixedHtml.includes('border-t border-gray-800/60'));
  });
});

test('13. Regressie: ModelPartsPageTemplate, PartsDiscoveryPageTemplate en DirectPartsEngine gebruiken multi-marketplace knoppen', () => {
  const model = database.models.find(m => m.slug === 'ms-260' || m.model_name === 'MS 260');
  assert.ok(model, 'MS 260 model must exist');

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const modelHtml = renderModelPartsPageHtml(model, database, PRIMARY_ORIGIN);
    assert.ok(modelHtml.includes('data-multi-marketplace-buttons="true"'));
    assert.ok(modelHtml.includes('Zoek op eBay.nl'));
    assert.ok(modelHtml.includes('Zoek op Amazon.nl'));

    const discoveryHtml = renderPartsDiscoveryPageHtml('11231602050', database, PRIMARY_ORIGIN);
    assert.ok(discoveryHtml.includes('data-multi-marketplace-buttons="true"'));
    assert.ok(discoveryHtml.includes('Zoek op eBay.nl'));

    const directResult = getDirectPartsForModel(model, database);
    assert.ok(directResult.parts.length > 0);
    assert.ok(directResult.parts[0].purchase_offers);
    assert.ok(Array.isArray(directResult.parts[0].purchase_offers.direct_offers));
    assert.ok(Array.isArray(directResult.parts[0].purchase_offers.search_offers));
  });
});

test('14. eBay.de aanbieding wordt gelabeld als Koop bij eBay.de en nooit als eBay.nl', () => {
  const part = '11231602050';
  const registry = makeRegistry([]);
  const ebay = makeMockEbayProvider({
    [part]: [makeEbayOffer(part, 'v1|999888777666|0', 'ebay.de')]
  }, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    const ebayDe = res.direct_offers.find(o => o.provider === 'ebay');
    assert.ok(ebayDe, 'eBay.de offer must be present');
    assert.equal(ebayDe.marketplace, 'ebay.de');
    assert.equal(ebayDe.display_marketplace, 'eBay.de');
    assert.equal(ebayDe.label, 'Koop bij eBay.de');
    assert.ok(!res.direct_offers.some(o => o.label === 'Koop bij eBay.nl'));
    assert.ok(res.search_offers.some(o => o.label === 'Zoek op eBay.nl'));
  });
});

test('15. eBay-zoekaffiliate-URL voldoet aan EPN-spec en validateEbayAffiliateUrl', () => {
  const ebay = new EbayAffiliateProvider();
  withEnv({
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const offer = ebay.buildSearchOffer({ canonicalPartNumber: '11231602050', partName: 'Koppelingsveer' });
    assert.ok(offer, 'buildSearchOffer must return offer when EPN is configured');
    const check = validateEbayAffiliateUrl(offer.url, '5339245312');
    assert.equal(check.valid, true, `URL must pass validateEbayAffiliateUrl: ${check.reason || ''}`);
    const parsed = new URL(offer.url);
    assert.equal(parsed.hostname, 'www.ebay.nl');
    assert.equal(parsed.pathname, '/sch/i.html');
    assert.equal(parsed.searchParams.get('mkevt'), '1');
    assert.equal(parsed.searchParams.get('mkcid'), '1');
    assert.equal(parsed.searchParams.get('mkrid'), '1346-53482-19255-0');
    assert.equal(parsed.searchParams.get('campid'), '5339245312');
    assert.equal(parsed.searchParams.get('toolid'), '10049');
  });
});

test('16. Backward compatibility: getPartAffiliateOffer behoudt oorspronkelijke contract', () => {
  assert.equal(getPartAffiliateOffer, resolvePurchaseOffer);
  const offer = getPartAffiliateOffer('11231602050', 'Koppelingsveer');
  assert.ok(offer);
  assert.equal(typeof offer.url, 'string');
  assert.equal(typeof offer.type, 'string');
  assert.equal(typeof offer.is_direct, 'boolean');
  assert.ok(Array.isArray(offer.offers));
});

test('17. UI-hiërarchie: elke geverifieerde koopknop zichtbaar, alleen zoekopties inklapbaar en geen Unresolved Diagram Section', () => {
  const mkAmzUrl = (asin) => ['https://www.amazon.nl', 'dp', asin].join('/');
  const oneDirect = renderMultiMarketplaceButtonsHtml({
    direct_offers: [{ provider: 'amazon', marketplace: 'amazon.nl', display_marketplace: 'Amazon.nl', url: mkAmzUrl('B00NL12345'), is_direct: true }],
    search_offers: []
  }, { partNumber: '00006421223' });
  assert.ok(oneDirect.includes('bg-orange-600'));
  assert.ok(!oneDirect.includes('<details'), 'Single direct offer must not render a collapsible <details> block');

  const multiDirect = renderMultiMarketplaceButtonsHtml({
    direct_offers: [
      { provider: 'amazon', marketplace: 'amazon.nl', display_marketplace: 'Amazon.nl', url: mkAmzUrl('B00NL12345'), is_direct: true },
      { provider: 'ebay', marketplace: 'ebay.nl', display_marketplace: 'eBay.nl', url: 'https://www.ebay.nl/itm/123456', is_direct: true }
    ],
    search_offers: [
      { provider: 'amazon', marketplace: 'amazon.de', display_marketplace: 'Amazon.de', url: 'https://www.amazon.de/s?k=00006421223', is_direct: false }
    ]
  }, { partNumber: '00006421223' });
  // Both verified marketplaces stay visible; only the Amazon.de search fallback
  // is allowed to sit behind the collapse.
  assert.ok(multiDirect.includes('<details'));
  assert.ok(multiDirect.includes('Meer zoekopties (+1)'));
  const multiDirectVisiblePart = multiDirect.split('<details')[0];
  assert.ok(multiDirectVisiblePart.includes('Koop bij Amazon.nl'), 'Amazon direct button must stay visible');
  assert.ok(multiDirectVisiblePart.includes('Koop bij eBay.nl'), 'eBay direct button must stay visible next to Amazon');
  assert.ok(!multiDirect.includes('Meer koopopties'), 'A verified direct offer must never be collapsed');
  assert.equal((multiDirectVisiblePart.match(/data-offer-group="direct"/g) || []).length, 1);
  assert.equal((multiDirectVisiblePart.match(/data-provider="(?:amazon|ebay)"/g) || []).length, 2);

  const searchOnly = renderMultiMarketplaceButtonsHtml({
    direct_offers: [],
    search_offers: [
      { provider: 'amazon', marketplace: 'amazon.nl', display_marketplace: 'Amazon.nl', url: 'https://www.amazon.nl/s?k=00006421223', is_direct: false },
      { provider: 'ebay', marketplace: 'ebay.nl', display_marketplace: 'eBay.nl', url: 'https://www.ebay.nl/sch/i.html?_nkw=00006421223', is_direct: false }
    ]
  }, { partNumber: '00006421223' });
  assert.ok(!searchOnly.includes('bg-orange-600'), 'Search-only fallback must not use primary orange buy button styling');
  assert.ok(searchOnly.includes('Meer zoekopties (+1)'));

  const ms260 = database.models.find(m => m.slug === 'ms-260' || m.model_name === 'MS 260');
  const modelHtml = renderModelPartsPageHtml(ms260, database, PRIMARY_ORIGIN);
  assert.ok(!modelHtml.includes('Unresolved Diagram Section'), 'ModelPartsPageTemplate must never leak Unresolved Diagram Section');

  const discoveryHtml = renderPartsDiscoveryPageHtml('kettingwiel', database, PRIMARY_ORIGIN);
  assert.ok(!discoveryHtml.includes('Unresolved Diagram Section'), 'PartsDiscoveryPageTemplate must never leak Unresolved Diagram Section');
});

test('18. Beide marketplaces met een ACTIVE direct aanbod zijn direct zichtbaar naast elkaar', () => {
  const part = '11231602050';
  const registry = makeRegistry([makeAmazonRecord(part, 'B00NL12345', 'amazon.nl')]);
  const ebay = makeMockEbayProvider({ [part]: [makeEbayOffer(part)] }, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    AMAZON_ASSOCIATE_TAG_DE: 'srihldecode00-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    const cardHtml = renderMultiMarketplaceButtonsHtml(res, { partNumber: part });
    const visible = cardHtml.split('<details')[0];

    assert.ok(visible.includes('Koop bij Amazon.nl'));
    assert.ok(visible.includes('Koop bij eBay.nl'));
    assert.equal((visible.match(/data-provider="(?:amazon|ebay)"/g) || []).length, 2);

    // Both direct buttons keep the full 44px mobile tap target.
    assert.equal((visible.match(/min-h-\[44px\]/g) || []).length, 2);

    // Tracking still resolves the real marketplace/provider per button.
    assert.ok(visible.includes('data-provider="amazon"'));
    assert.ok(visible.includes('data-provider="ebay"'));
    assert.ok(visible.includes('data-marketplace="ebay.nl"'));
    assert.ok(visible.includes('handleAffiliateClick'));

    // Amazon.nl keeps its NL tag, eBay keeps EPN campaign 5339245312.
    assert.ok(visible.includes('tag=srihldecoder2-21'));
    assert.ok(visible.includes('campid=5339245312'));
  });
});

test('19. Alleen eBay direct: eBay zichtbaar, Amazon alleen als duidelijke zoekopdracht', () => {
  const part = '11231602050';
  const registry = makeRegistry([]);
  const ebay = makeMockEbayProvider({ [part]: [makeEbayOffer(part)] }, true);

  withEnv({
    AFFILIATE_ENABLED: 'true',
    AMAZON_AFFILIATE_ENABLED: 'true',
    AMAZON_ASSOCIATE_TAG: 'srihldecoder2-21',
    EBAY_ENABLED: 'true',
    EBAY_AFFILIATE_ENABLED: 'true',
    EBAY_EPN_CAMPAIGN_ID: '5339245312'
  }, () => {
    const res = getPartAffiliateOffers(part, 'Koppelingsveer', { verifiedRegistry: registry, ebayProvider: ebay });
    const cardHtml = renderMultiMarketplaceButtonsHtml(res, { partNumber: part });
    const visible = cardHtml.split('<details')[0];

    assert.ok(visible.includes('Koop bij eBay.nl'));
    assert.ok(!visible.includes('Koop bij Amazon.nl'));
    assert.ok(cardHtml.includes('Meer zoekopties'));
    assert.ok(cardHtml.includes('Zoek op Amazon.nl'));
    assert.ok(cardHtml.includes('data-offer-type="SEARCH_LINK"'), 'Search fallbacks must stay labelled as search links');
  });
});
