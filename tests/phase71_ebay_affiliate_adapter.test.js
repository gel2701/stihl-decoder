/**
 * tests/phase71_ebay_affiliate_adapter.test.js
 *
 * Phase 71B — eBay Browse API, EPN Affiliate Adapter, Shipping Validation & Strict Matching Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EbayBrowseApiClient,
  DEFAULT_EPN_CAMPAIGN_ID,
  EPN_MARKETPLACE_CONFIG,
  ALLOWED_EBAY_DOMAINS
} from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayAffiliateProvider } from '../src/affiliate/EbayAffiliateProvider.js';
import { EbaySyncEngine, REJECTION_REASONS } from '../src/affiliate/EbaySyncEngine.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ============================================================================
// TEST 1: Exact part number with wrong technical specifications MUST REJECT
// ============================================================================
test('Phase 71B: 1. Exact part number with conflicting technical specifications is rejected', () => {
  const engine = new EbaySyncEngine({ apiClient: new EbayBrowseApiClient() });

  const cylinderPart = {
    part_number: '1121 020 1200',
    part_name: 'Zylinder mit Kolben 44mm',
    models: ['MS 260'],
    technical_specs: { bore_mm: 44.0 }
  };

  // Even though it contains the exact 1121 020 1200 part number, the bore in title is 44.7mm (wrong spec)
  const itemConflictingBore = {
    title: 'Sägenspezi Zylinder passend für Stihl 1121 020 1200 MS 260 44.7 mm',
    item_url: 'https://www.ebay.de/itm/1121-wrong-bore'
  };

  const res = engine.evaluateItemCompatibility(itemConflictingBore, cylinderPart);
  assert.equal(res.compatible, false, 'Exact part number with conflicting bore must NOT be approved');
  assert.equal(res.rejection_reason, REJECTION_REASONS.TECHNICAL_SPEC_CONFLICT_BORE);

  // Exact chain part number with conflicting chain pitch
  const chainPart = {
    part_number: '3639 000 0067',
    part_name: 'Sägekette .325" 1.6mm 67TG',
    models: ['MS 260'],
    technical_specs: { chain_pitch: '.325', drive_link_thickness_mm: 1.6, drive_links_count: 67 }
  };

  const itemConflictingPitch = {
    title: 'Sägekette 3/8" 1.6mm 67TG - Referenz STIHL 3639 000 0067',
    item_url: 'https://www.ebay.de/itm/chain-wrong-pitch'
  };

  const resPitch = engine.evaluateItemCompatibility(itemConflictingPitch, chainPart);
  assert.equal(resPitch.compatible, false, 'Exact part number with conflicting pitch must NOT be approved');
  assert.equal(resPitch.rejection_reason, REJECTION_REASONS.TECHNICAL_SPEC_CONFLICT_PITCH);
});

// ============================================================================
// TEST 2: Wrong component category / part type MUST REJECT
// ============================================================================
test('Phase 71B: 2. Wrong component category is rejected even if part number is present', () => {
  const engine = new EbaySyncEngine({ apiClient: new EbayBrowseApiClient() });

  const cylinderPart = {
    part_number: '1121 020 1200',
    part_name: 'Zylinder mit Kolben',
    models: ['MS 260'],
    technical_specs: { bore_mm: 44.0 }
  };

  // Listing says Zündkerze (Spark plug) while target is Cylinder
  const itemSparkPlug = {
    title: 'Zündkerze passend für Stihl MS 260 OE 1121 020 1200',
    item_url: 'https://www.ebay.de/itm/spark-plug-wrong-type'
  };

  const res = engine.evaluateItemCompatibility(itemSparkPlug, cylinderPart);
  assert.equal(res.compatible, false, 'Spark plug listing for cylinder target must be rejected');
  assert.equal(res.rejection_reason, REJECTION_REASONS.COMPONENT_TYPE_MISMATCH);
});

// ============================================================================
// TEST 3: Model match only without sufficient technical information MUST REJECT
// ============================================================================
test('Phase 71B: 3. Model match alone without sufficient technical specifications is rejected', () => {
  const engine = new EbaySyncEngine({ apiClient: new EbayBrowseApiClient() });

  const genericTarget = {
    part_number: '1121 007 1062',
    part_name: 'Dichtsatz Kurbelgehäuse',
    models: ['MS 260'],
    technical_specs: {} // No technical anchor
  };

  // Only mentions MS 260 without part number or verified technical anchor
  const itemModelOnly = {
    title: 'Ersatzteil passend für Stihl MS 260 Säge',
    item_url: 'https://www.ebay.de/itm/generic-model-only'
  };

  const res = engine.evaluateItemCompatibility(itemModelOnly, genericTarget);
  assert.equal(res.compatible, false, 'Generic model match without technical anchor must be rejected');
  assert.equal(res.rejection_reason, REJECTION_REASONS.INSUFFICIENT_TECHNICAL_EVIDENCE);
});

// ============================================================================
// TEST 4: Different or unknown seller username MUST REJECT
// ============================================================================
test('Phase 71B: 4. Mismatched or unknown seller is rejected and never labeled Sägenspezi', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      total: 2,
      itemSummaries: [
        {
          itemId: 'item-foreign-seller',
          title: 'Zylinder passend für Stihl 1121 020 1200 44mm',
          price: { value: '35.00', currency: 'EUR' },
          seller: { username: 'unauthorized_seller_99' },
          shippingOptions: [{ shippingCost: { value: '8.90', currency: 'EUR' }, shipToLocations: ['NL'] }]
        },
        {
          itemId: 'item-missing-seller',
          title: 'Zylinder passend für Stihl 1121 020 1200 44mm',
          price: { value: '35.00', currency: 'EUR' },
          seller: null,
          shippingOptions: [{ shippingCost: { value: '8.90', currency: 'EUR' }, shipToLocations: ['NL'] }]
        }
      ]
    })
  });

  const client = new EbayBrowseApiClient({
    clientId: 'MOCK_ID',
    clientSecret: 'MOCK_SECRET',
    mockToken: 'MOCK_TOKEN',
    fetchFn: mockFetch
  });

  const engine = new EbaySyncEngine({ apiClient: client, batchDelayMs: 0 });
  const result = await engine.syncBatch(
    [{ part_number: '1121 020 1200', part_name: 'Zylinder 44mm', technical_specs: { bore_mm: 44.0 } }],
    { requireSeller: 'saegenspezi_de' }
  );

  assert.equal(result.active_offers.length, 0, 'No offers from unauthorized or missing sellers may be activated');
  assert.equal(result.rejected_candidates.length, 2);
  assert.equal(result.rejection_breakdown[REJECTION_REASONS.SELLER_MISMATCH], 1);
  assert.equal(result.rejection_breakdown[REJECTION_REASONS.SELLER_UNKNOWN], 1);
});

// ============================================================================
// TEST 5: Shipping unknown (no explicit NL in shipToLocations) MUST YIELD SHIPPING_UNKNOWN
// ============================================================================
test('Phase 71B: 5. Shipping is unknown when shipToLocations lacks explicit NL/Europe coverage', () => {
  const client = new EbayBrowseApiClient();

  // Has carrier code and cost, but shipToLocations does NOT list NL or Europe (only US, CA)
  const itemNoNlLocation = {
    itemId: 'item-us-only',
    title: 'Zylinder Stihl',
    shippingOptions: [
      {
        shippingCost: { value: '15.00', currency: 'EUR' },
        shipToLocations: ['US', 'CA'],
        shippingCarrierCode: 'USPS',
        shippingServiceCode: 'PriorityMail'
      }
    ]
  };

  const [parsed] = client.parseItemSummaries([itemNoNlLocation]);
  assert.equal(parsed.shipping_status, 'SHIPPING_UNKNOWN');
  assert.equal(parsed.ships_to_nl, false);
  assert.equal(parsed.shipping_cost_nl, null);
});

// ============================================================================
// TEST 6: Shipping excluded (excludedShipToLocations contains NL) MUST YIELD DOES_NOT_SHIP_TO_NL
// ============================================================================
test('Phase 71B: 6. Shipping is DOES_NOT_SHIP_TO_NL when NL is in excludedShipToLocations', () => {
  const client = new EbayBrowseApiClient();

  const itemExcludedNl = {
    itemId: 'item-excluded',
    title: 'Zylinder Stihl',
    excludedShipToLocations: ['NL', 'BE'],
    shippingOptions: [
      { shippingCost: { value: '8.90', currency: 'EUR' }, shipToLocations: ['WORLDWIDE'] }
    ]
  };

  const [parsed] = client.parseItemSummaries([itemExcludedNl]);
  assert.equal(parsed.shipping_status, 'DOES_NOT_SHIP_TO_NL');
  assert.equal(parsed.ships_to_nl, false);
  assert.equal(parsed.shipping_cost_nl, null);
});

// ============================================================================
// TEST 7: Correct Dutch delivery (explicit NL + EUR cost) MUST YIELD SHIPS_TO_NL_CONFIRMED
// ============================================================================
test('Phase 71B: 7. Correct Dutch delivery yields SHIPS_TO_NL_CONFIRMED', () => {
  const client = new EbayBrowseApiClient();

  const itemConfirmedNl = {
    itemId: 'item-nl-confirmed',
    title: 'Sägenspezi Zylinder für Stihl 1121 020 1200',
    shippingOptions: [
      {
        shippingCost: { value: '8.90', currency: 'EUR' },
        shipToLocations: ['NL', 'DE', 'AT'],
        shippingServiceCode: 'Standard'
      }
    ]
  };

  const [parsed] = client.parseItemSummaries([itemConfirmedNl], '11210201200');
  assert.equal(parsed.shipping_status, 'SHIPS_TO_NL_CONFIRMED');
  assert.equal(parsed.ships_to_nl, true);
  assert.equal(parsed.shipping_cost_nl, 8.90);
});

// ============================================================================
// TEST 8: Correct EPN affiliate tracking URL formatting
// ============================================================================
test('Phase 71B: 8. Correct EPN affiliate tracking parameters for eBay.nl and eBay.de', () => {
  const client = new EbayBrowseApiClient({ epnCampaignId: '5339244329' });

  // eBay.nl link verification
  const nlLink = client.buildAffiliateUrl('https://www.ebay.nl/itm/321937308130', '11210201200');
  const nlParams = new URL(nlLink).searchParams;
  assert.equal(nlParams.get('campid'), '5339244329');
  assert.equal(nlParams.get('siteid'), '146');
  assert.equal(nlParams.get('mkrid'), '1346-53482-19255-0');
  assert.equal(nlParams.get('mkcid'), '1');
  assert.equal(nlParams.get('toolid'), '10001');
  assert.equal(nlParams.get('mkevt'), '1');
  assert.equal(nlParams.get('customid'), '11210201200');

  // eBay.de link verification
  const deLink = client.buildAffiliateUrl('https://www.ebay.de/itm/382910482019', '11210201200');
  const deParams = new URL(deLink).searchParams;
  assert.equal(deParams.get('campid'), '5339244329');
  assert.equal(deParams.get('siteid'), '77');
  assert.equal(deParams.get('mkrid'), '707-53477-19255-0');
  assert.equal(deParams.get('customid'), '11210201200');
});

// ============================================================================
// TEST 9: Preservation of existing 20 Amazon offers
// ============================================================================
test('Phase 71B: 9. Existing 18 Amazon.nl and 2 Amazon.de verified offers remain 100% active and preserved', () => {
  const registryDocPath = path.join(rootDir, 'data', 'affiliate', 'verified_amazon_registry.json');
  assert.ok(fs.existsSync(registryDocPath), 'Registry file must exist');

  const registry = new VerifiedOfferRegistry({ productionActivationAllowed: true });
  const doc = JSON.parse(fs.readFileSync(registryDocPath, 'utf8'));
  registry.importRegistry(doc);

  const activeNl = registry.listOffers({ status: 'ACTIVE', marketplace: 'amazon.nl' });
  assert.equal(activeNl.length, 18, 'Must maintain exactly 18 active Amazon.nl offers');

  const activeDe = registry.listOffers({ status: 'ACTIVE', marketplace: 'amazon.de' });
  assert.equal(activeDe.length, 2, 'Must maintain exactly 2 active Amazon.de offers with confirmed NL shipping');

  const inactiveDe = registry.listOffers({ status: 'VERIFIED', marketplace: 'amazon.de' });
  assert.equal(inactiveDe.length, 12, 'Must preserve all 12 inactive German candidates safely');

  for (const de of activeDe) {
    assert.equal(de.shipping_to_nl_status, 'SHIPS_TO_NL_CONFIRMED');
    assert.equal(de.shipping_cost_nl, 10.00);
  }

  for (const inact of inactiveDe) {
    assert.equal(inact.status, 'VERIFIED');
    assert.notEqual(inact.status, 'ACTIVE');
    assert.equal(inact.shipping_to_nl_status, 'SHIPPING_UNKNOWN');
  }
});
