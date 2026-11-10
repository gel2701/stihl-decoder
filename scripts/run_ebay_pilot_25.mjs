/**
 * scripts/run_ebay_pilot_25.mjs
 *
 * Phase 71B — Executable eBay 25-Part Pilot Engine
 *
 * Scans top 25 high-priority STIHL parts against Sägenspezi inventory on eBay.
 *
 * Guardrails:
 * - Fails closed if EBAY_CLIENT_ID or EBAY_CLIENT_SECRET is missing.
 * - Does NOT fabricate live API data or activate unverified products.
 * - Supports --mock flag for offline, reproducible integration testing.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbaySyncEngine } from '../src/affiliate/EbaySyncEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const commercialCatalogPath = path.join(rootDir, 'data', 'affiliate', 'commercial_catalog_100.json');
const reportOutputPath = path.join(rootDir, 'reports', 'ebay_pilot_25_audit.json');

async function main() {
  const isMock = process.argv.includes('--mock');
  console.log('===============================================================');
  console.log('🚀 STIHLDECODER — PHASE 71B: EBAY SÄGENSPEZI 25-PART PILOT');
  console.log('===============================================================');

  // Load candidate parts from commercial catalog
  if (!fs.existsSync(commercialCatalogPath)) {
    console.error(`❌ Commercial catalog not found at: ${commercialCatalogPath}`);
    process.exit(1);
  }

  const catalogDoc = JSON.parse(fs.readFileSync(commercialCatalogPath, 'utf8'));
  const candidateParts = (catalogDoc.parts || []).slice(0, 25).map(p => ({
    part_number: p.part_number,
    part_name: p.part_name,
    models: p.target_models || [],
    category_id: p.category_id,
    technical_specs: {}
  }));

  console.log(`📦 Loaded ${candidateParts.length} target STIHL candidate parts for pilot inspection.`);

  const hasCredentials = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

  if (!hasCredentials && !isMock) {
    console.log('\n⚠️  EBAY DEVELOPER CREDENTIALS NOT CONFIGURED');
    console.log('   The live pilot requires the following environment variables:');
    console.log('   - EBAY_CLIENT_ID     : eBay Developer App ID (Client ID)');
    console.log('   - EBAY_CLIENT_SECRET : eBay Developer Cert ID (Client Secret)');
    console.log('   - EBAY_EPN_CAMPAIGN_ID: 5339244329 (already default configured)');
    console.log('\n🔒 FAIL-CLOSED INVARIANT ENFORCED:');
    console.log('   - Zero fake API responses generated.');
    console.log('   - Zero unverified products activated.');
    console.log('   - Existing 18 Amazon.nl and 2 Amazon.de offers remain 100% active.');
    console.log('\n💡 To run a reproducible verification run with mock data, execute:');
    console.log('   node scripts/run_ebay_pilot_25.mjs --mock\n');
    process.exit(0);
  }

  let client;
  if (isMock) {
    console.log('🧪 Running pilot in SIMULATED MOCK MODE (--mock flag detected)...');
    const mockFetch = async (url) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          itemSummaries: [
            {
              itemId: 'v1|382910482019|0',
              title: 'Sägenspezi Zylinder für Stihl MS 260 1110 400 7005',
              price: { value: '44.90', currency: 'EUR' },
              seller: { username: 'saegenspezi_de' },
              shippingOptions: [
                {
                  shippingCost: { value: '8.90', currency: 'EUR' },
                  shipToLocations: ['NL', 'DE']
                }
              ],
              itemWebUrl: 'https://www.ebay.de/itm/382910482019',
              condition: 'NEW'
            }
          ]
        })
      };
    };

    client = new EbayBrowseApiClient({
      clientId: 'MOCK_CLIENT_ID',
      clientSecret: 'MOCK_CLIENT_SECRET',
      epnCampaignId: '5339244329',
      mockToken: 'MOCK_TOKEN',
      fetchFn: mockFetch
    });
  } else {
    console.log('🌐 Connecting to live eBay Browse API with configured developer credentials...');
    client = new EbayBrowseApiClient({
      clientId: process.env.EBAY_CLIENT_ID,
      clientSecret: process.env.EBAY_CLIENT_SECRET,
      epnCampaignId: process.env.EBAY_EPN_CAMPAIGN_ID || '5339244329'
    });
  }

  const engine = new EbaySyncEngine({ apiClient: client, batchDelayMs: isMock ? 0 : 250 });
  const result = await engine.syncBatch(candidateParts, {
    maxItems: 25,
    requireSeller: 'saegenspezi_de',
    deduplicate: true
  });

  console.log('\n===============================================================');
  console.log('📊 EBAY 25-PART PILOT EXECUTION SUMMARY');
  console.log('===============================================================');
  console.log(`TOTAL_SCANNED              : ${result.scanned_count}`);
  console.log(`MATCHED_COUNT              : ${result.matched_count}`);
  console.log(`VALID_NL_SHIPPING_COUNT    : ${result.valid_nl_shipping_count}`);
  console.log(`ACTIVE_OFFERS_GENERATED    : ${result.active_offers.length}`);
  console.log(`REJECTED_CANDIDATES_COUNT  : ${result.rejected_count}`);
  console.log(`REJECTION_BREAKDOWN        : ${JSON.stringify(result.rejection_breakdown, null, 2)}`);
  console.log('===============================================================');

  // Save report
  fs.mkdirSync(path.dirname(reportOutputPath), { recursive: true });
  fs.writeFileSync(reportOutputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`📄 Detailed audit report written to: ${reportOutputPath}\n`);
}

main().catch(err => {
  console.error(`❌ Pilot execution error: ${err.message}`);
  process.exit(1);
});
