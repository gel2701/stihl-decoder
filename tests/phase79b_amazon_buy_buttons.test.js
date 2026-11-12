/**
 * Phase 79B — Amazon buy buttons hotfix contracts.
 *
 * Covers:
 *  - Root cause: the legacy 3-part active whitelist no longer pins production activation.
 *  - All 99 ACTIVE offers (53 Amazon.nl / 46 Amazon.de) resolve to direct product links.
 *  - Correct affiliate tag per marketplace (never mixed).
 *  - Part page order: part name -> buy buttons -> compatibility warning -> specs ->
 *    diagram positions -> full compatible-model list.
 *  - Mobile-first buy button markup.
 *  - Service Kit 6 variant warning.
 *  - Evidence/compatibility data and the evidence database stay untouched.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { resolvePurchaseOffer, AMAZON_MARKETPLACE_TAGS } from '../src/search/IntelligentPartsSearchEngine.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { defaultVerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const registryDoc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json'), 'utf8'));

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
delete process.env.AMAZON_ASSOCIATE_TAG_DE;
delete process.env.AMAZON_PILOT_ACTIVE_PARTS;

const NL_TAG = 'srihldecoder2-21';
const DE_TAG = 'srihldecode00-21';

const activeOffers = registryDoc.offers.filter(o => o.status === 'ACTIVE');
const inactiveOffers = registryDoc.offers.filter(o => o.status !== 'ACTIVE');
const marketplaceKey = (offer) => String(offer.marketplace || 'amazon.nl').toLowerCase();
const offerHref = (marketplace, asin, tag) => `href="https://${marketplace}/dp/${asin}?tag=${tag}"`;
const tagOf = (offer) => {
  const match = /[?&]tag=([^&]+)/.exec(String(offer.url || ''));
  return match ? decodeURIComponent(match[1]) : null;
};

function activateAll() {
  defaultVerifiedOfferRegistry.productionActivationAllowed = true;
  defaultVerifiedOfferRegistry.activeWhitelist = null;
  defaultVerifiedOfferRegistry.loadFromFile();
}

function resolveAll(partNumber) {
  const resolver = new AffiliateOfferResolver({ verifiedRegistry: defaultVerifiedOfferRegistry });
  return resolver.resolveOffers({ partNumber, partName: 'test' });
}

test('Phase 79B - Test 1: production activation is no longer pinned to the 3-part pilot whitelist', () => {
  const serverSource = fs.readFileSync(path.join(rootDir, 'server.js'), 'utf8');

  assert.ok(
    !serverSource.includes("new Set(['11104007005', '00004007000', '00004007011'])"),
    'The hardcoded 3-part fallback whitelist must be removed from server.js'
  );
  assert.match(
    serverSource,
    /activeWhitelist = process\.env\.AMAZON_PILOT_ACTIVE_PARTS[\s\S]{0,400}?: null;/,
    'Without an operator override the active whitelist must be null (registry ACTIVE status is authoritative)'
  );

  // Behavioural proof: every ACTIVE part now resolves to a direct offer.
  activateAll();
  const activeParts = [...new Set(activeOffers.map(o => String(o.part_number)))];
  let directParts = 0;
  let directOffers = 0;
  let fallbackParts = 0;
  for (const partNumber of activeParts) {
    const offers = resolveAll(partNumber);
    const direct = offers.filter(o => o.match_type === 'MANUAL_ASIN');
    if (direct.length > 0) {
      directParts += 1;
      directOffers += direct.length;
    } else {
      fallbackParts += 1;
    }
  }

  assert.strictEqual(activeParts.length, 86, 'Registry must contain offers for 86 unique ACTIVE parts');
  assert.strictEqual(directParts, 86, 'Every ACTIVE part must expose at least one direct Amazon offer');
  assert.strictEqual(directOffers, 99, 'All 99 ACTIVE offers must be rendered');
  assert.strictEqual(fallbackParts, 0, 'No ACTIVE part may fall back to a search link');
});

test('Phase 79B - Test 2: evidence database and offer counts are untouched (99 ACTIVE: 53 NL / 46 DE)', () => {
  assert.strictEqual(registryDoc.offers.length, 157, 'Registry offer total must stay unchanged');
  assert.strictEqual(activeOffers.length, 99, 'Active offer total must stay at 99');
  assert.strictEqual(activeOffers.filter(o => marketplaceKey(o) === 'amazon.nl').length, 53, 'Amazon.nl active offers must stay 53');
  assert.strictEqual(activeOffers.filter(o => marketplaceKey(o) === 'amazon.de').length, 46, 'Amazon.de active offers must stay 46');
  assert.strictEqual(registryDoc.policy.max_active_offers_per_marketplace['amazon.nl'], 100);
  assert.strictEqual(registryDoc.policy.max_active_offers_per_marketplace['amazon.de'], 50);
  assert.ok(activeOffers.every(o => typeof o.asin === 'string' && o.asin.length > 0), 'Every ACTIVE offer keeps its ASIN');
});

test('Phase 79B - Test 3: every ACTIVE offer resolves with the correct marketplace tag', () => {
  activateAll();
  for (const offer of activeOffers) {
    const marketplace = marketplaceKey(offer);
    const expectedTag = marketplace === 'amazon.de' ? DE_TAG : NL_TAG;
    const resolved = resolveAll(String(offer.part_number)).filter(o => o.match_type === 'MANUAL_ASIN');
    const match = resolved.find(o => String(o.asin) === String(offer.asin) && marketplaceKey(o) === marketplace);

    assert.ok(match, `ACTIVE offer ${offer.asin} (${marketplace}) for ${offer.part_number} must resolve directly`);
    assert.strictEqual(tagOf(match), expectedTag, `Offer ${offer.asin} must carry the ${marketplace} tag`);
    assert.ok(
      match.url.includes(`https://${marketplace}/dp/${offer.asin}`),
      `Offer ${offer.asin} must link to the direct product page on ${marketplace}`
    );
    assert.ok(match.url.includes(`tag=${expectedTag}`), `Offer ${offer.asin} URL must contain its marketplace tag`);
    assert.ok(!(marketplace === 'amazon.de' && match.url.includes(`tag=${NL_TAG}`)), 'Amazon.de links must never carry the NL tag');
  }
});

test('Phase 79B - Test 4: mandatory parts resolve to the exact ASIN, marketplace and tracking tag', () => {
  activateAll();
  const expected = {
    // Bosch WSR6F — Amazon.nl only
    '11104007005': [{ asin: 'B0068M5NAG', marketplace: 'amazon.nl', tag: NL_TAG }],
    // NGK BPMR7A — Amazon.nl only
    '00004007000': [{ asin: 'B001RM8J76', marketplace: 'amazon.nl', tag: NL_TAG }],
    // Luchtfilter — both marketplaces, Amazon.nl first
    '11301240800': [
      { asin: 'B07KJYFPLM', marketplace: 'amazon.nl', tag: NL_TAG },
      { asin: 'B00LAHKLBU', marketplace: 'amazon.de', tag: DE_TAG }
    ],
    // Service Kit 6 — Amazon.de only
    '11300074100': [{ asin: 'B094WCY9ZY', marketplace: 'amazon.de', tag: DE_TAG }],
    // Zaagblad — Amazon.de only
    '30050003905': [{ asin: 'B001FUATK0', marketplace: 'amazon.de', tag: DE_TAG }],
    // Ontstekingsmodule — Amazon.de only
    '11304001302': [{ asin: 'B00LAHQD8A', marketplace: 'amazon.de', tag: DE_TAG }],
    // Kettingwiel — two Amazon.de offers
    '11236402003': [
      { asin: 'B006WVO0QQ', marketplace: 'amazon.de', tag: DE_TAG },
      { asin: 'B00LAHPOEO', marketplace: 'amazon.de', tag: DE_TAG }
    ]
  };

  for (const [partNumber, offers] of Object.entries(expected)) {
    const resolved = resolveAll(partNumber).filter(o => o.match_type === 'MANUAL_ASIN');
    assert.strictEqual(resolved.length, offers.length, `${partNumber} must resolve ${offers.length} direct offer(s)`);
    offers.forEach((want, index) => {
      const got = resolved[index];
      assert.strictEqual(String(got.asin), want.asin, `${partNumber} offer ${index + 1} ASIN mismatch`);
      assert.strictEqual(marketplaceKey(got), want.marketplace, `${partNumber} offer ${index + 1} marketplace mismatch`);
      assert.strictEqual(tagOf(got), want.tag, `${partNumber} offer ${index + 1} tracking tag mismatch`);
      assert.ok(got.url.includes(`tag=${want.tag}`), `${partNumber} offer ${index + 1} URL must contain its tag`);
    });
  }
});

test('Phase 79B - Test 5: search engine exposes multi-marketplace purchase offers', () => {
  activateAll();

  // Both marketplaces
  const both = resolvePurchaseOffer('11301240800', 'Air filter fleece');
  assert.strictEqual(both.type, 'DIRECT_ASIN');
  assert.strictEqual(both.marketplace, 'amazon.nl', 'Amazon.nl has priority');
  assert.strictEqual(both.offers.length, 2, 'Both marketplaces must be offered');
  assert.deepStrictEqual(both.offers.map(o => o.marketplace), ['amazon.nl', 'amazon.de']);
  assert.deepStrictEqual(both.offers.map(o => o.tag), [NL_TAG, DE_TAG]);

  // Amazon.de only — no search fallback
  const deOnly = resolvePurchaseOffer('30050003905', 'Zaagblad');
  assert.strictEqual(deOnly.type, 'DIRECT_ASIN', 'An active Amazon.de offer must not degrade to a search fallback');
  assert.strictEqual(deOnly.marketplace, 'amazon.de');
  assert.strictEqual(deOnly.asin, 'B001FUATK0');
  assert.ok(deOnly.url.includes('tag=srihldecode00-21'));
  assert.ok(!deOnly.url.includes('amazon.nl/s?k='), 'Must link to the product page, not a search page');

  // Amazon.nl only
  const nlOnly = resolvePurchaseOffer('11104007005', 'Bosch WSR6F');
  assert.strictEqual(nlOnly.marketplace, 'amazon.nl');
  assert.strictEqual(nlOnly.asin, 'B0068M5NAG');
  assert.ok(nlOnly.url.includes('tag=srihldecoder2-21'));

  // No direct offer at all -> compliant search fallback
  const fallback = resolvePurchaseOffer('11231602050', 'Stihl Clutch');
  assert.strictEqual(fallback.type, 'SEARCH_FALLBACK');
  assert.strictEqual(fallback.is_direct, false);
  assert.ok(fallback.url.includes('amazon.nl/s?k='));
  assert.ok(fallback.url.includes('tag=srihldecoder2-21'));
});

test('Phase 79B - Test 6: inactive offers never become direct buy buttons', () => {
  activateAll();
  assert.ok(inactiveOffers.length > 0, 'Registry must still contain non-ACTIVE offers');

  for (const offer of inactiveOffers) {
    const resolved = resolveAll(String(offer.part_number)).filter(o => o.match_type === 'MANUAL_ASIN');
    assert.ok(
      !resolved.some(o => String(o.asin) === String(offer.asin)),
      `Non-ACTIVE offer ${offer.asin} must not be rendered as a direct offer`
    );
  }
});

test('Phase 79B - Test 7: part page order puts buy buttons directly under the part header', () => {
  activateAll();
  const html = renderPartDetailPageHtml('11104007005', database, 'https://www.stihldecoder.nl');

  const headerIdx = html.indexOf('<h1');
  const buyIdx = html.indexOf(offerHref('amazon.nl', 'B0068M5NAG', NL_TAG));
  const offersHeadingIdx = html.indexOf('Waar te koop — Beschikbare Aanbiedingen');
  const compatIdx = html.indexOf('Controleer compatibiliteit vóór aankoop');
  const specsIdx = html.indexOf('Technische specificaties');
  const modelsIdx = html.indexOf('Geschikte STIHL Modellen');

  assert.ok(headerIdx > -1 && buyIdx > -1 && modelsIdx > -1, 'Header, buy button and model list must all render');
  assert.ok(buyIdx < compatIdx, 'Buy button must come before the compatibility warning');
  assert.ok(compatIdx < specsIdx, 'Compatibility warning must come before the technical specifications');
  assert.ok(specsIdx < modelsIdx, 'The full compatible-model list must be the last content section');
  assert.ok(offersHeadingIdx < modelsIdx, 'The commercial section must precede the full model list');

  const beforeBuy = html.slice(0, buyIdx);
  assert.strictEqual(
    (beforeBuy.match(/href="\/kettingzagen\//g) || []).length,
    0,
    'No compatible-model links may appear above the buy button'
  );
  assert.ok(buyIdx - headerIdx < 6000, 'Buy button must stay close to the part name (no 179-model wall in between)');
});

test('Phase 79B - Test 8: buy buttons are mobile-first (full-width, 44px touch target, visible early)', () => {
  activateAll();
  const html = renderPartDetailPageHtml('11104007005', database, 'https://www.stihldecoder.nl');

  assert.match(html, /<meta\s+name="viewport"/, 'Page must declare a mobile viewport');
  const buyHref = offerHref('amazon.nl', 'B0068M5NAG', NL_TAG);
  const buyIdx = html.indexOf(buyHref);
  assert.ok(buyIdx > -1, 'Direct buy anchor must exist');
  const anchorSlice = html.slice(buyIdx, buyIdx + 1600);
  assert.ok(anchorSlice.includes('w-full'), 'Buy button must be full width on mobile');
  assert.ok(anchorSlice.includes('min-h-[44px]'), 'Buy button must meet the 44px touch target');
  assert.ok(anchorSlice.includes('target="_blank"'), 'Buy button must open the product page in a new tab');
  assert.ok(anchorSlice.includes('rel="sponsored nofollow noopener"'), 'Sponsored link attributes must stay intact');

  // The commercial section itself must be reachable without any model cards in between.
  const commercialIdx = html.indexOf('Waar te koop — Beschikbare Aanbiedingen');
  assert.ok(commercialIdx > -1 && commercialIdx < html.indexOf('Geschikte STIHL Modellen'));
});

test('Phase 79B - Test 9: Service Kit 6 is not presented as universally fitting', () => {
  activateAll();
  const html = renderPartDetailPageHtml('11300074100', database, 'https://www.stihldecoder.nl');

  const buyIdx = html.indexOf(offerHref('amazon.de', 'B094WCY9ZY', DE_TAG));
  const kitIdx = html.indexOf('Servicekit:');
  const modelsIdx = html.indexOf('Geschikte STIHL Modellen');

  assert.ok(buyIdx > -1, 'Service Kit 6 must show its direct Amazon.de offer');
  assert.ok(kitIdx > -1, 'Service Kit 6 must render an explicit variant warning');
  assert.ok(kitIdx > buyIdx, 'The variant warning belongs with the compatibility warning');
  assert.ok(kitIdx < modelsIdx, 'The variant warning must be visible before the model list');
  assert.match(html, /niet automatisch universeel passend/i, 'Warning must state the kit is not automatically universal');
  assert.match(html, /Controleer de variant/i, 'Warning must instruct a variant check');
});

test('Phase 79B - Test 10: rendered HTML keeps exact ASINs, marketplaces and tags for all mandatory parts', () => {
  activateAll();
  const pages = {
    '11104007005': [{ asin: 'B0068M5NAG', marketplace: 'amazon.nl', tag: NL_TAG }],
    '00004007000': [{ asin: 'B001RM8J76', marketplace: 'amazon.nl', tag: NL_TAG }],
    '11301240800': [
      { asin: 'B07KJYFPLM', marketplace: 'amazon.nl', tag: NL_TAG },
      { asin: 'B00LAHKLBU', marketplace: 'amazon.de', tag: DE_TAG }
    ],
    '11300074100': [{ asin: 'B094WCY9ZY', marketplace: 'amazon.de', tag: DE_TAG }],
    '30050003905': [{ asin: 'B001FUATK0', marketplace: 'amazon.de', tag: DE_TAG }],
    '11304001302': [{ asin: 'B00LAHQD8A', marketplace: 'amazon.de', tag: DE_TAG }],
    '11236402003': [
      { asin: 'B006WVO0QQ', marketplace: 'amazon.de', tag: DE_TAG },
      { asin: 'B00LAHPOEO', marketplace: 'amazon.de', tag: DE_TAG }
    ]
  };

  for (const [partNumber, offers] of Object.entries(pages)) {
    const html = renderPartDetailPageHtml(partNumber, database, 'https://www.stihldecoder.nl');
    for (const offer of offers) {
      const href = offerHref(offer.marketplace, offer.asin, offer.tag);
      assert.ok(html.includes(href), `${partNumber} must render direct link ${href}`);
    }
    assert.ok(
      !/https:\/\/amazon\.de\/dp\/[^"]+tag=srihldecoder2-21/.test(html),
      `${partNumber} must never put the Amazon.nl tag on an Amazon.de link`
    );
    assert.ok(html.includes('Geschikte STIHL Modellen'), `${partNumber} must still list compatible models`);
    assert.ok(html.includes('Controleer compatibiliteit vóór aankoop'), `${partNumber} must warn about compatibility`);
  }
});

test('Phase 79B - Test 11: part without direct offer keeps a compliant search fallback page', () => {
  activateAll();
  const html = renderPartDetailPageHtml('11231602050', database, 'https://www.stihldecoder.nl');

  assert.ok(html.indexOf('Zoek dit onderdeel online') > -1, 'Fallback page must keep the search section');
  assert.ok(html.includes('amazon.nl/s?k='), 'Fallback must link to a targeted Amazon search');
  assert.ok(!html.includes('data-offer-type="MANUAL_ASIN"'), 'No direct offer may be claimed without an active ASIN');
  assert.ok(html.includes('tag=srihldecoder2-21'), 'Fallback search must carry the NL tag');
  assert.ok(html.indexOf('Zoek dit onderdeel online') < html.indexOf('Geschikte STIHL Modellen'));
});

test('Phase 79B - Test 12: consistent behaviour across representative models (MS 170, MS 180, MS 250, MS 440, FS 460)', () => {
  activateAll();
  const modelNames = ['MS 170', 'MS 180', 'MS 250', 'MS 440', 'FS 460'];

  const activeParts = [...new Set(activeOffers.map(o => String(o.part_number)))];

  for (const modelName of modelNames) {
    const model = (database.models || []).find(
      m => m.model_name === modelName || String(m.model_name || '').startsWith(`${modelName} `) || m.name === modelName
    );
    assert.ok(model, `Model ${modelName} must exist in the canonical database`);

    const modelPartNumbers = activeParts.filter((partNumber) => {
      const resolved = PartCatalogResolver.resolvePartNumber(partNumber, database);
      const models = (resolved?.compatible_models || []).map(m => m.model_name || m.name);
      return models.some(name => name === modelName || String(name).startsWith(`${modelName} `));
    });
    assert.ok(modelPartNumbers.length > 0, `Model ${modelName} must reach at least one direct Amazon offer`);

    for (const partNumber of modelPartNumbers.slice(0, 5)) {
      const html = renderPartDetailPageHtml(partNumber, database, 'https://www.stihldecoder.nl');
      assert.ok(
        html.indexOf('href="https://amazon.') > -1 &&
          html.indexOf('href="https://amazon.') < html.indexOf('Geschikte STIHL Modellen'),
        `Model ${modelName} part ${partNumber} must show its buy button before the full model list`
      );
    }
  }
});

test('Phase 79B - Test 13: marketplace tag defaults are documented and stable', () => {
  assert.deepStrictEqual(AMAZON_MARKETPLACE_TAGS, {
    'amazon.nl': 'srihldecoder2-21',
    'amazon.de': 'srihldecode00-21'
  });
  assert.strictEqual(registryDoc.policy.affiliate_tags['amazon.nl'], 'srihldecoder2-21');
  assert.strictEqual(registryDoc.policy.affiliate_tags['amazon.de'], 'srihldecode00-21');
});
