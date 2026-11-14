import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AffiliateOfferResolver, defaultResolverInstance } from '../src/affiliate/AffiliateOfferResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf-8'));
database.public_evidence = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'public_evidence_facts.json'), 'utf-8'));
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { getDirectPartsForModel } from '../src/parts/DirectPartsEngine.js';
import { resolvePurchaseOffer } from '../src/search/IntelligentPartsSearchEngine.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { PRIMARY_ORIGIN } from '../src/config.js';

function withEbayOffers(offersByPart, fn) {
  const prevEnv = {
    EBAY_ENABLED: process.env.EBAY_ENABLED,
    EBAY_AFFILIATE_ENABLED: process.env.EBAY_AFFILIATE_ENABLED,
    EBAY_EPN_CAMPAIGN_ID: process.env.EBAY_EPN_CAMPAIGN_ID,
    EBAY_CLIENT_ID: process.env.EBAY_CLIENT_ID,
    EBAY_CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET,
    AMAZON_AFFILIATE_ENABLED: process.env.AMAZON_AFFILIATE_ENABLED,
    AMAZON_ASSOCIATE_TAG: process.env.AMAZON_ASSOCIATE_TAG
  };
  const prevProvider = defaultResolverInstance.ebayProvider;
  const hadProviderInMap = defaultResolverInstance.providers.has('ebay');
  const prevMapProvider = defaultResolverInstance.providers.get('ebay');
  const prevAmazonTag = defaultResolverInstance.amazonProvider?.partnerTag;

  process.env.EBAY_ENABLED = 'true';
  process.env.EBAY_AFFILIATE_ENABLED = 'true';
  process.env.EBAY_EPN_CAMPAIGN_ID = '5339245312';
  process.env.EBAY_CLIENT_ID = 'test-client-id';
  process.env.EBAY_CLIENT_SECRET = 'test-client-secret';
  process.env.AMAZON_AFFILIATE_ENABLED = 'true';
  process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
  if (defaultResolverInstance.amazonProvider) {
    defaultResolverInstance.amazonProvider.partnerTag = 'srihldecoder2-21';
  }

  const cachedMap = new Map(Object.entries(offersByPart));
  const ebayProvider = new EbayAffiliateProvider({ cachedOffers: cachedMap });
  defaultResolverInstance.ebayProvider = ebayProvider;
  defaultResolverInstance.registerProvider(ebayProvider);

  try {
    return fn(ebayProvider);
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (defaultResolverInstance.amazonProvider) {
      defaultResolverInstance.amazonProvider.partnerTag = prevAmazonTag;
    }
    defaultResolverInstance.ebayProvider = prevProvider;
    if (hadProviderInMap) {
      defaultResolverInstance.providers.set('ebay', prevMapProvider);
    } else {
      defaultResolverInstance.providers.delete('ebay');
    }
  }
}

function makeEbayRecord(partNumber, itemId, marketplace = 'EBAY_NL', seller = 'stihl_parts_nl') {
  const host = marketplace === 'EBAY_DE' ? 'www.ebay.de' : 'www.ebay.nl';
  const url = `https://${host}/itm/${itemId.split('|')[1] || itemId}?mkcid=1&mkrid=1346-53482-19255-0&campid=5339245312`;
  return {
    part_number: partNumber,
    item_id: itemId,
    marketplace,
    marketplace_id: marketplace,
    status: 'ACTIVE',
    decision: 'ACCEPT',
    match_type: 'EXACT_MPN',
    match_basis: 'MPN_EXACT',
    title: `STIHL ${partNumber} Original Part`,
    mpn: partNumber,
    brand: 'STIHL',
    seller_name: seller,
    item_price: 19.95,
    shipping_cost_nl: 4.95,
    currency: 'EUR',
    ships_to_nl: true,
    shipping_status: 'SHIPS_TO_NL_CONFIRMED',
    affiliate_url: url,
    item_url: url,
    itemAffiliateWebUrl: url
  };
}

test('81.1 PartDetailPageTemplate renders eBay offers before Amazon search with accurate eBay metadata', () => {
  const partNumber = '00006421223';
  const ebayOffers = [
    makeEbayRecord(partNumber, 'v1|111222333444|0', 'EBAY_NL', 'nl_saw_shop'),
    makeEbayRecord(partNumber, 'v1|555666777888|0', 'EBAY_DE', 'de_saw_shop')
  ];

  withEbayOffers({ [partNumber]: ebayOffers }, () => {
    const resolved = PartCatalogResolver.resolvePartNumber(partNumber, database);
    assert.ok(resolved, 'Part 00006421223 must resolve in catalog');

    const resolverOffers = defaultResolverInstance.resolveOffers({
      partNumber,
      partName: resolved.part_name
    });
    assert.ok(resolverOffers.some(o => o.provider === 'ebay'), 'Resolver must return eBay offers');
    assert.ok(resolverOffers.some(o => o.provider === 'amazon' && o.is_verified === false), 'Resolver must return Amazon search fallback');

    const html = renderPartDetailPageHtml({ ...resolved, offers: resolverOffers }, database, PRIMARY_ORIGIN);

    const ebayPos = html.indexOf('Bekijk op ebay.nl');
    const amazonSearchPos = html.indexOf('Zoek op Amazon.nl');
    assert.ok(ebayPos !== -1, 'eBay.nl buy button must be rendered');
    assert.ok(amazonSearchPos !== -1, 'Amazon search fallback must be rendered');
    assert.ok(ebayPos < amazonSearchPos, 'Proven eBay offer must appear before Amazon search fallback');

    assert.ok(html.includes('eBay Item: v1|111222333444|0 · eBay.nl'), 'eBay card must show eBay Item ID, not ASIN');
    assert.ok(html.includes('Verkoper: nl_saw_shop'), 'eBay card must show seller name');
    assert.ok(html.includes('data-provider="ebay"'), 'eBay button must carry data-provider="ebay"');
    assert.ok(html.includes('data-offer-type="EXACT_MPN"'), 'eBay card must not hardcode MANUAL_ASIN');
    assert.ok(!html.includes('ASIN: — · Amazon.nl'), 'eBay card must not show fake Amazon ASIN metadata');
    assert.ok(html.includes('Amazon-zoekopdracht (Niet vooraf gecontroleerd)'), 'Search fallback must clearly state it is a search');
  });
});

test('81.1 ModelPartsPageTemplate shows proven eBay direct offers instead of falling back to Zoek op Amazon', () => {
  const partNumber = '11181953500';
  const resolved = PartCatalogResolver.resolvePartNumber(partNumber, database);
  assert.ok(resolved && resolved.compatible_models?.length > 0, 'Part 11181953500 must have compatible models');

  const targetModelId = resolved.compatible_models[0].model_id;
  const targetModel = database.models.find(m => m.id === targetModelId || m.slug === targetModelId.replace(/_/g, '-'));
  assert.ok(targetModel, 'Compatible model must exist in database');

  const ebayOffers = [
    makeEbayRecord(partNumber, 'v1|999888777666|0', 'EBAY_NL', 'parts_specialist_nl')
  ];

  withEbayOffers({ [partNumber]: ebayOffers }, () => {
    const offer = resolvePurchaseOffer(partNumber, resolved.part_name);
    assert.equal(offer.is_direct, true, 'resolvePurchaseOffer must return is_direct: true for ACTIVE eBay offer');
    assert.equal(offer.provider, 'ebay', 'resolvePurchaseOffer must return provider: ebay');
    assert.equal(offer.type, 'DIRECT_EBAY_ITEM', 'resolvePurchaseOffer must return type: DIRECT_EBAY_ITEM');

    const html = renderModelPartsPageHtml(targetModel, database, PRIMARY_ORIGIN);
    assert.ok(html.includes('🛒 Koop bij eBay.nl'), 'Model parts page must render direct eBay buy button');
    assert.ok(html.includes('data-provider="ebay"'), 'Model parts page must attribute eBay button to ebay');
    assert.ok(html.includes('zoekopdracht'), 'Parts without proven direct offer must indicate search is a zoekopdracht');
  });
});

test('81.1 PartsDiscoveryPageTemplate renders eBay direct offers and marks search fallbacks as zoekopdracht', () => {
  const partNumber = '00006421223';
  const ebayOffers = [
    makeEbayRecord(partNumber, 'v1|222333444555|0', 'EBAY_NL', 'chainsaw_direct')
  ];

  withEbayOffers({ [partNumber]: ebayOffers }, () => {
    const html = renderPartsDiscoveryPageHtml(partNumber, database, PRIMARY_ORIGIN);
    assert.ok(html.includes('Koop bij eBay.nl'), 'Discovery page exact match must show eBay direct CTA');
    assert.ok(html.includes('data-provider="ebay"'), 'Discovery page must tag eBay CTA with data-provider="ebay"');
    assert.ok(!html.includes('<span>🛒 Amazon</span>'), 'Discovery page must not mislabel search fallback as 🛒 Amazon');
  });

  const fallbackHtml = renderPartsDiscoveryPageHtml('11231602050', database, PRIMARY_ORIGIN);
  assert.ok(fallbackHtml.includes('Zoek op Amazon.nl') && fallbackHtml.includes('zoekopdracht'), 'Discovery page must label search fallback as Zoek op Amazon.nl (zoekopdracht)');
});

test('81.1 DirectPartsEngine preserves eBay direct offer label instead of overwriting with Zoek op Amazon', () => {
  const partNumber = '11181953500';
  const resolved = PartCatalogResolver.resolvePartNumber(partNumber, database);
  const targetModelId = resolved.compatible_models[0].model_id;
  const targetModel = database.models.find(m => m.id === targetModelId || m.slug === targetModelId.replace(/_/g, '-'));

  const mockResolver = {
    resolveOffers: ({ partNumber: pNo }) => {
      if (pNo === partNumber) {
        return [{
          provider: 'ebay',
          marketplace: 'ebay.nl',
          link_type: 'DIRECT_EBAY_ITEM',
          is_verified: true,
          url: 'https://www.ebay.nl/itm/999888777666?campid=5339245312',
          label: 'Bekijk op ebay.nl',
          confidence: 'HIGH'
        }];
      }
      return [{
        provider: 'amazon',
        marketplace: 'amazon.nl',
        link_type: 'SEARCH_LINK',
        is_verified: false,
        url: `https://amazon.nl/s?k=${pNo}&tag=srihldecoder2-21`,
        label: 'Zoek op Amazon.nl'
      }];
    }
  };

  const result = getDirectPartsForModel(targetModel, { limit: 12, affiliateResolver: mockResolver }, database);
  const matched = result.parts.find(p => p.part_number === partNumber);
  if (matched) {
    assert.equal(matched.is_direct_offer, true);
    assert.equal(matched.purchase_provider, 'ebay');
    assert.equal(matched.purchase_label, 'Bekijk op ebay.nl');
  }
});
