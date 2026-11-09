/**
 * tests/phase71_ebay_affiliate_adapter.test.js
 *
 * Phase 70D / 71A — eBay Browse API, EPN Affiliate Adapter, Shipping Validation & Strict Matching Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EbayBrowseApiClient,
  DEFAULT_EPN_CAMPAIGN_ID,
  EPN_MARKETPLACE_CONFIG,
  ALLOWED_EBAY_DOMAINS
} from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { EbaySyncEngine, REJECTION_REASONS } from '../src/affiliate/EbaySyncEngine.js';

test('Phase 71A: 1. Default EPN Campaign ID is verified as 5339244329', () => {
  assert.equal(DEFAULT_EPN_CAMPAIGN_ID, '5339244329');
  const client = new EbayBrowseApiClient();
  assert.equal(client.epnCampaignId, '5339244329');
  assert.equal(client.hasAffiliateConfig(), true);
});

test('Phase 71A: 2. Marketplace-correct EPN tracking URL formatting (ebay.nl vs ebay.de)', () => {
  const client = new EbayBrowseApiClient({
    epnCampaignId: '5339244329'
  });

  // Test Dutch listing
  const nlUrl = 'https://www.ebay.nl/itm/321937308130';
  const taggedNl = client.buildAffiliateUrl(nlUrl, '11210201200');
  const parsedNl = new URL(taggedNl);
  assert.equal(parsedNl.searchParams.get('campid'), '5339244329');
  assert.equal(parsedNl.searchParams.get('mkcid'), '1');
  assert.equal(parsedNl.searchParams.get('mkrid'), '1346-53482-19255-0');
  assert.equal(parsedNl.searchParams.get('siteid'), '146');
  assert.equal(parsedNl.searchParams.get('toolid'), '10001');
  assert.equal(parsedNl.searchParams.get('mkevt'), '1');
  assert.equal(parsedNl.searchParams.get('customid'), '11210201200');

  // Test German listing
  const deUrl = 'https://www.ebay.de/itm/382910482019';
  const taggedDe = client.buildAffiliateUrl(deUrl, '11210201200');
  const parsedDe = new URL(taggedDe);
  assert.equal(parsedDe.searchParams.get('campid'), '5339244329');
  assert.equal(parsedDe.searchParams.get('mkcid'), '1');
  assert.equal(parsedDe.searchParams.get('mkrid'), '707-53477-19255-0');
  assert.equal(parsedDe.searchParams.get('siteid'), '77');
  assert.equal(parsedDe.searchParams.get('toolid'), '10001');
  assert.equal(parsedDe.searchParams.get('mkevt'), '1');
  assert.equal(parsedDe.searchParams.get('customid'), '11210201200');
});

test('Phase 71A: 3. Domain validation blocks external URLs and unauthorized redirects', () => {
  const client = new EbayBrowseApiClient();
  assert.equal(client.isAllowedEbayUrl('https://www.ebay.nl/itm/123'), true);
  assert.equal(client.isAllowedEbayUrl('https://www.ebay.de/itm/456'), true);
  assert.equal(client.isAllowedEbayUrl('https://ebay.com/itm/789'), true);
  assert.equal(client.isAllowedEbayUrl('https://evil-site.com/redirect?url=ebay.nl'), false);
  assert.equal(client.isAllowedEbayUrl('javascript:alert(1)'), false);

  const blocked = client.buildAffiliateUrl('https://malicious-external-domain.com/itm/123');
  assert.equal(blocked, '', 'Must reject non-eBay domains completely');
});

test('Phase 71A: 4. Conclusive Shipping to NL validation logic', () => {
  const client = new EbayBrowseApiClient();

  // Case A: Conclusively ships to NL with explicit cost
  const validItem = {
    itemId: 'item-1',
    title: 'Sägenspezi Zylinder für Stihl MS 260 1121 020 1200',
    shippingOptions: [
      {
        shippingCost: { value: '8.90', currency: 'EUR' },
        shipToLocations: ['NL', 'DE'],
        shippingServiceCode: 'StandardShipping'
      }
    ]
  };
  const [parsedValid] = client.parseItemSummaries([validItem], '11210201200');
  assert.equal(parsedValid.shipping_status, 'SHIPS_TO_NL_CONFIRMED');
  assert.equal(parsedValid.ships_to_nl, true);
  assert.equal(parsedValid.shipping_cost_nl, 8.90);

  // Case B: Explicitly excludes the Netherlands
  const excludedItem = {
    itemId: 'item-2',
    title: 'Zylinder Stihl',
    excludedShipToLocations: ['NL', 'BE'],
    shippingOptions: [
      { shippingCost: { value: '5.00', currency: 'EUR' } }
    ]
  };
  const [parsedExcluded] = client.parseItemSummaries([excludedItem], '11210201200');
  assert.equal(parsedExcluded.shipping_status, 'DOES_NOT_SHIP_TO_NL');
  assert.equal(parsedExcluded.ships_to_nl, false);
  assert.equal(parsedExcluded.shipping_cost_nl, null);

  // Case C: Empty or ambiguous shippingOptions -> SHIPPING_UNKNOWN
  const unknownItem = {
    itemId: 'item-3',
    title: 'Zylinder Stihl',
    shippingOptions: []
  };
  const [parsedUnknown] = client.parseItemSummaries([unknownItem], '11210201200');
  assert.equal(parsedUnknown.shipping_status, 'SHIPPING_UNKNOWN');
  assert.equal(parsedUnknown.ships_to_nl, false);
  assert.equal(parsedUnknown.shipping_cost_nl, null);

  // Case D: Out of stock item is completely omitted
  const oosItem = {
    itemId: 'item-4',
    title: 'Zylinder',
    estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'OUT_OF_STOCK' }]
  };
  const parsedOos = client.parseItemSummaries([oosItem]);
  assert.equal(parsedOos.length, 0);
});

test('Phase 71A: 5. Strict Part Matching in EbaySyncEngine', () => {
  const engine = new EbaySyncEngine({
    apiClient: new EbayBrowseApiClient()
  });

  const canonicalPart = {
    part_number: '1121 020 1200',
    part_name: 'Zylinder mit Kolben 44mm',
    models: ['MS 260', '026'],
    supersessions: ['1121 020 1201'],
    technical_specs: { bore_mm: 44.0 }
  };

  // 1. Exact Part Number Match
  const itemExact = {
    title: 'Sägenspezi Zylindersatz passend für Stihl 026 MS 260 44mm - ersetzt 1121 020 1200',
    item_url: 'https://www.ebay.de/itm/111'
  };
  const resExact = engine.evaluateItemCompatibility(itemExact, canonicalPart);
  assert.equal(resExact.compatible, true);
  assert.equal(resExact.evidence_type, 'EXACT_PART_NUMBER_MATCH');

  // 2. Superseding Part Number Match
  const itemSuperseded = {
    title: 'Sägenspezi Zylinder passend für Stihl MS260 MPN 1121-020-1201',
    item_url: 'https://www.ebay.de/itm/222'
  };
  const resSup = engine.evaluateItemCompatibility(itemSuperseded, canonicalPart);
  assert.equal(resSup.compatible, true);
  assert.equal(resSup.evidence_type, 'SUPERSEDING_PART_NUMBER_MATCH');

  // 3. Technical Spec Conflict: Bore Mismatch (44.7mm instead of 44mm)
  const itemWrongBore = {
    title: 'Sägenspezi Big Bore Zylinder passend für Stihl MS 260 44.7mm',
    item_url: 'https://www.ebay.de/itm/333'
  };
  const resBore = engine.evaluateItemCompatibility(itemWrongBore, canonicalPart);
  assert.equal(resBore.compatible, false);
  assert.equal(resBore.rejection_reason, REJECTION_REASONS.TECHNICAL_SPEC_CONFLICT_BORE);

  // 4. Component Type Mismatch: Spark Plug instead of Cylinder
  const itemWrongType = {
    title: 'Zündkerze passend für Stihl MS 260',
    item_url: 'https://www.ebay.de/itm/444'
  };
  const resType = engine.evaluateItemCompatibility(itemWrongType, canonicalPart);
  assert.equal(resType.compatible, false);
  assert.equal(resType.rejection_reason, REJECTION_REASONS.COMPONENT_TYPE_MISMATCH);

  // 5. Chain Pitch Conflict
  const chainPart = {
    part_number: '3639 000 0067',
    part_name: 'Sägekette .325" 1.6mm 67TG',
    models: ['MS 260'],
    technical_specs: { chain_pitch: '.325', drive_link_thickness_mm: 1.6, drive_links_count: 67 }
  };

  const itemWrongPitch = {
    title: 'Sägekette passend für Stihl MS 260 3/8" 1.6mm 67TG',
    item_url: 'https://www.ebay.de/itm/555'
  };
  const resPitch = engine.evaluateItemCompatibility(itemWrongPitch, chainPart);
  assert.equal(resPitch.compatible, false);
  assert.equal(resPitch.rejection_reason, REJECTION_REASONS.TECHNICAL_SPEC_CONFLICT_PITCH);

  // 6. Superficial Keyword Match Only
  const itemSuperficial = {
    title: 'Aufkleber / Sticker passend für Stihl MS 260',
    item_url: 'https://www.ebay.de/itm/666'
  };
  const resSuperficial = engine.evaluateItemCompatibility(itemSuperficial, canonicalPart);
  assert.equal(resSuperficial.compatible, false);
});

test('Phase 71A: 6. EbaySyncEngine batch processing with rejected candidates recording', async () => {
  const mockItems = [
    {
      itemId: 'v1|1001|0',
      title: 'Sägenspezi Zylinder für Stihl MS 260 1121 020 1200',
      price: { value: '49.90', currency: 'EUR' },
      seller: { username: 'saegenspezi_de' },
      shippingOptions: [
        { shippingCost: { value: '8.90', currency: 'EUR' }, shipToLocations: ['NL'] }
      ],
      itemWebUrl: 'https://www.ebay.de/itm/1001',
      condition: 'NEW'
    },
    {
      itemId: 'v1|1002|0',
      title: 'Zylinder für Stihl MS 260 ohne Versand nach NL',
      price: { value: '39.90', currency: 'EUR' },
      seller: { username: 'saegenspezi_de' },
      excludedShipToLocations: ['NL'],
      shippingOptions: [
        { shippingCost: { value: '5.00', currency: 'EUR' } }
      ],
      itemWebUrl: 'https://www.ebay.de/itm/1002',
      condition: 'NEW'
    }
  ];

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      total: 2,
      itemSummaries: mockItems
    })
  });

  const client = new EbayBrowseApiClient({
    clientId: 'MOCK_ID',
    clientSecret: 'MOCK_SECRET',
    epnCampaignId: '5339244329',
    mockToken: 'MOCK_TOKEN',
    fetchFn: mockFetch
  });

  const engine = new EbaySyncEngine({ apiClient: client, batchDelayMs: 0 });

  const targetParts = [
    {
      part_number: '1121 020 1200',
      part_name: 'Zylinder mit Kolben',
      models: ['MS 260']
    }
  ];

  const report = await engine.syncBatch(targetParts, { maxItems: 1000 });

  assert.equal(report.scanned_count, 1);
  assert.equal(report.matched_count, 1);
  assert.equal(report.valid_nl_shipping_count, 1);
  assert.equal(report.active_offers.length, 1);
  assert.equal(report.active_offers[0].part_number, '11210201200');
  assert.equal(report.active_offers[0].shipping_status, 'SHIPS_TO_NL_CONFIRMED');
  assert.ok(report.active_offers[0].affiliate_url.includes('campid=5339244329'));

  // Verify rejected candidate
  assert.equal(report.rejected_count, 1);
  assert.equal(report.rejected_candidates[0].rejection_reason, REJECTION_REASONS.DOES_NOT_SHIP_TO_NL);
  assert.equal(report.rejection_breakdown[REJECTION_REASONS.DOES_NOT_SHIP_TO_NL], 1);
});
