/**
 * tests/phase48_ui_analytics.test.js
 * Test suite for UI rendering, Affiliate Disclosure rules, and Analytics Whitelisting.
 * Phase 48 Commercial Pilot & Compatibility Section.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderModelProductCompatibilitySection } from '../src/components/ModelProductCompatibilitySection.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import {
  EVENT_TYPES,
  WHITELISTED_METADATA_KEYS,
  trackEvent
} from '../src/components/AnalyticsTracker.js';
import { AFFILIATE_DISCLOSURE_NOTICE, COMPATIBILITY_STATUSES } from '../src/modelRecommendations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\n===============================================================');
console.log('🧪 RUNNING PHASE 48 UI & ANALYTICS PRIVACY TEST SUITE');
console.log('===============================================================\n');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const ms170Model = db.models.find((m) => m.slug === 'ms-170');

// ▶ Test 1: Pilot model UI rendering in unmonetized baseline
console.log('▶ Test 1: Validating unmonetized baseline UI rendering for MS 170...');
const sectionHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170');
assert.ok(sectionHtml.includes('Onderdelen & onderhoud voor jouw STIHL MS 170'), 'Must contain header');
assert.ok(sectionHtml.includes('Bewezen compatibel'), 'Must display verified badge');
assert.ok(sectionHtml.includes('Bekijk technische informatie'), 'Must display unmonetized CTA');
assert.ok(sectionHtml.includes('3610 000 0044'), 'Must display OEM part number');
assert.ok(!sectionHtml.includes(AFFILIATE_DISCLOSURE_NOTICE), 'Must NOT show affiliate disclosure when unmonetized');
assert.ok(!sectionHtml.includes('rel="sponsored'), 'Must NOT have sponsored links in unmonetized baseline');
console.log('  ✅ Test 1 Passed: Unmonetized baseline renders verified specs with ZERO disclosure or sponsored links.');

// ▶ Test 2: Active affiliate state rendering with disclosure & attributes
console.log('▶ Test 2: Validating active affiliate state UI rendering...');
const mockActiveCompatData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec_ms170_plug_test',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: 'Bosch WSR 6 F',
            display_guidance: 'Fabrieksspecificatie',
            commercial_offers: {
              offers_active: true,
              offers: [
                {
                  offer_id: 'off_active_1',
                  merchant_id: 'bol',
                  title: 'Bosch Bougie WSR 6 F',
                  product_url: 'https://www.bol.com/nl/p/1',
                  affiliate_url: 'https://www.bol.com/nl/p/1?aff=test',
                  price: 4.95,
                  status: 'ACTIVE_AFFILIATE'
                }
              ]
            }
          }
        ]
      }
    }
  }
};
const activeHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', { compatData: mockActiveCompatData });
assert.ok(activeHtml.includes(AFFILIATE_DISCLOSURE_NOTICE), 'Must render disclosure when active affiliate offer exists');
assert.ok(activeHtml.includes('rel="sponsored noopener noreferrer"'), 'Must have rel="sponsored noopener noreferrer"');
assert.ok(activeHtml.includes('target="_blank"'), 'Must open in new tab');
assert.ok(activeHtml.includes('data-recommendation-id="rec_ms170_plug_test"'), 'Must include recommendation-id');
assert.ok(activeHtml.includes('data-merchant-id="bol"'), 'Must include merchant-id');
assert.ok(activeHtml.includes('data-offer-id="off_active_1"'), 'Must include offer-id');
assert.ok(activeHtml.includes('data-placement="model_page_parts_grid"'), 'Must include placement');
console.log('  ✅ Test 2 Passed: Active affiliate offers render disclosure notice and sponsored link tags.');

// ▶ Test 3: Non-pilot model graceful fallback (no empty sections)
console.log('▶ Test 3: Validating non-pilot model handling...');
const unknownModelHtml = renderModelProductCompatibilitySection('non-existent-model-xyz', 'Unknown Model');
assert.strictEqual(unknownModelHtml, '', 'Non-existent model must return empty string');
console.log('  ✅ Test 3 Passed: Non-pilot models cleanly return empty markup without errors.');

// ▶ Test 4: ModelPageTemplate integration
console.log('▶ Test 4: Validating ModelPageTemplate full SSR rendering...');
const fullPageHtml = renderModelPageHtml(ms170Model, {
  modelEvidenceFacts: [],
  comparisonPartner: null,
  registeredComparisonLinks: []
});
assert.ok(fullPageHtml.includes('Onderdelen & onderhoud voor jouw STIHL MS 170'), 'Full SSR page must include compatibility section');
console.log('  ✅ Test 4 Passed: ModelPageTemplate integrates compatibility section seamlessly.');

// ▶ Test 5: Analytics Tracker metadata whitelisting and PII stripping
console.log('▶ Test 5: Validating AnalyticsTracker metadata whitelisting...');
assert.ok(WHITELISTED_METADATA_KEYS.includes('recommendation_id'));
assert.ok(WHITELISTED_METADATA_KEYS.includes('merchant_id'));
assert.ok(WHITELISTED_METADATA_KEYS.includes('offer_id'));
assert.ok(WHITELISTED_METADATA_KEYS.includes('placement'));

// Test trackEvent with whitelisted + sensitive keys
const tracked = trackEvent(
  EVENT_TYPES.AFFILIATE_OFFER_CLICK,
  {
    model_slug: 'ms-170',
    recommendation_id: 'rec_test_1',
    merchant_id: 'bol',
    offer_id: 'off_test_1',
    placement: 'model_page_parts_grid',
    // Sensitive keys that must be stripped:
    serial_number: '163118080',
    user_email: 'customer@example.com',
    ip_address: '192.168.1.1',
    notes: 'Private note'
  },
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  true
);

assert.ok(tracked.metadata);
assert.strictEqual(tracked.metadata.model_slug, 'ms-170');
assert.strictEqual(tracked.metadata.recommendation_id, 'rec_test_1');
assert.strictEqual(tracked.metadata.merchant_id, 'bol');
assert.strictEqual(tracked.metadata.offer_id, 'off_test_1');
assert.strictEqual(tracked.metadata.placement, 'model_page_parts_grid');
assert.strictEqual(tracked.metadata.serial_number, undefined, 'serial_number must be stripped');
assert.strictEqual(tracked.metadata.user_email, undefined, 'user_email must be stripped');
assert.strictEqual(tracked.metadata.ip_address, undefined, 'ip_address must be stripped');
assert.strictEqual(tracked.metadata.notes, undefined, 'notes must be stripped');
console.log('  ✅ Test 5 Passed: Whitelisted metadata preserved, all PII and serial data stripped.');

console.log('\n🎉 ALL PHASE 48 UI & ANALYTICS PRIVACY TESTS PASSED 100% CLEANLY!\n');
