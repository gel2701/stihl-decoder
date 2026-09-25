/**
 * tests/phase48_ui_analytics.test.js
 * Comprehensive test suite for UI rendering, Affiliate Disclosure rules,
 * Security/Domain gates, Stale Price Suppression, and HTML Injection Escaping.
 * Phase 48 / 48A Commercial Pilot & Compatibility Section.
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
console.log('🧪 RUNNING PHASE 48A UI & ANALYTICS PRIVACY TEST SUITE');
console.log('===============================================================\n');

const dbPath = path.join(rootDir, 'data', 'stihl_database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const ms170Model = db.models.find((m) => m.slug === 'ms-170');

const activeBolMerchant = {
  merchant_id: 'bol',
  name: 'Bol.com',
  allowed_domains: ['bol.com', 'www.bol.com'],
  affiliate_active: true
};

const inactiveBolMerchant = {
  merchant_id: 'bol',
  name: 'Bol.com',
  allowed_domains: ['bol.com', 'www.bol.com'],
  affiliate_active: false
};

// ▶ Test 1: Pilot model UI rendering in unmonetized baseline
console.log('▶ Test 1: Validating unmonetized baseline UI rendering for MS 170...');
const sectionHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170');
assert.ok(sectionHtml.includes('Onderdelen & onderhoud voor jouw STIHL MS 170'), 'Must contain header');
assert.ok(sectionHtml.includes('Technische compatibiliteitsinformatie en onderhoudsadvies'), 'Must contain neutral subtitle');
assert.ok(sectionHtml.includes('Bewezen compatibel'), 'Must display verified badge for spark plug');
assert.ok(sectionHtml.includes('Specificatiematch'), 'Must display specification match badge for chain/bar');
assert.ok(sectionHtml.includes('Bekijk technische informatie'), 'Must display unmonetized CTA');
assert.ok(sectionHtml.includes('3610 000 0044'), 'Must display OEM part number');
assert.ok(!sectionHtml.includes(AFFILIATE_DISCLOSURE_NOTICE), 'Must NOT show affiliate disclosure when unmonetized');
assert.ok(!sectionHtml.includes('rel="sponsored'), 'Must NOT have sponsored links in unmonetized baseline');
console.log('  ✅ Test 1 Passed: Unmonetized baseline renders verified specs with ZERO disclosure or sponsored links.');

// ▶ Test 2: Active affiliate state rendering with disclosure & attributes
console.log('▶ Test 2: Validating active affiliate state UI rendering...');
const nowIso = new Date().toISOString();
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
                  observed_at: nowIso,
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
const activeHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockActiveCompatData,
  registeredMerchants: [activeBolMerchant]
});
assert.ok(activeHtml.includes(AFFILIATE_DISCLOSURE_NOTICE), 'Must render disclosure when active affiliate offer exists');
assert.ok(activeHtml.includes('rel="sponsored noopener noreferrer"'), 'Must have rel="sponsored noopener noreferrer"');
assert.ok(activeHtml.includes('target="_blank"'), 'Must open in new tab');
assert.ok(activeHtml.includes('data-recommendation-id="rec_ms170_plug_test"'), 'Must include recommendation-id');
assert.ok(activeHtml.includes('data-merchant-id="bol"'), 'Must include merchant-id');
assert.ok(activeHtml.includes('data-offer-id="off_active_1"'), 'Must include offer-id');
assert.ok(activeHtml.includes('data-placement="model_page_parts_grid"'), 'Must include placement');
assert.ok(activeHtml.includes('€4.95'), 'Must render fresh price');
console.log('  ✅ Test 2 Passed: Active affiliate offers render disclosure notice and sponsored link tags.');

// ▶ Test 3: Inactive merchant must NOT render affiliate CTA (Requirement 19 D)
console.log('▶ Test 3: Validating inactive merchant rejection in UI...');
const inactiveHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockActiveCompatData,
  registeredMerchants: [inactiveBolMerchant] // affiliate_active is false!
});
assert.ok(!inactiveHtml.includes('rel="sponsored'), 'Inactive merchant must NOT render sponsored link');
assert.ok(!inactiveHtml.includes(AFFILIATE_DISCLOSURE_NOTICE), 'Inactive merchant must NOT trigger affiliate disclosure');
assert.ok(inactiveHtml.includes('Bekijk technische informatie'), 'Must fallback to technical info CTA');
console.log('  ✅ Test 3 Passed: Inactive merchant cleanly prevented from rendering affiliate CTA.');

// ▶ Test 4: Unknown merchant must NOT render affiliate CTA (Requirement 19 E)
console.log('▶ Test 4: Validating unknown merchant rejection in UI...');
const mockUnknownMerchantData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec_unknown_m',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: 'Bosch WSR 6 F',
            commercial_offers: {
              offers_active: true,
              offers: [
                {
                  offer_id: 'off_unk',
                  merchant_id: 'rogue_merchant_xyz',
                  product_url: 'https://rogue.com/item',
                  affiliate_url: 'https://rogue.com/item?aff=1',
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
const unknownMerchantHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockUnknownMerchantData,
  registeredMerchants: [activeBolMerchant]
});
assert.ok(!unknownMerchantHtml.includes('rel="sponsored'), 'Unknown merchant must NOT render sponsored link');
assert.ok(!unknownMerchantHtml.includes(AFFILIATE_DISCLOSURE_NOTICE), 'Unknown merchant must NOT trigger disclosure');
console.log('  ✅ Test 4 Passed: Unknown merchant rejected from UI rendering.');

// ▶ Test 5: Bad domain must NOT render affiliate CTA (Requirement 19 F)
console.log('▶ Test 5: Validating bad domain rejection in UI...');
const mockBadDomainData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec_bad_dom',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: 'Bosch WSR 6 F',
            commercial_offers: {
              offers_active: true,
              offers: [
                {
                  offer_id: 'off_bad_dom',
                  merchant_id: 'bol',
                  product_url: 'https://www.bol.com/item',
                  affiliate_url: 'https://malicious-domain.com/tracker',
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
const badDomainHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockBadDomainData,
  registeredMerchants: [activeBolMerchant]
});
assert.ok(!badDomainHtml.includes('rel="sponsored'), 'Bad domain must NOT render sponsored link');
assert.ok(!badDomainHtml.includes('malicious-domain.com'), 'Malicious domain must never appear in markup');
console.log('  ✅ Test 5 Passed: Unlisted domain strictly rejected in UI rendering.');

// ▶ Test 6: Dangerous JavaScript URL must NOT render affiliate CTA (Requirement 19 G)
console.log('▶ Test 6: Validating javascript: URL rejection in UI...');
const mockJsUrlData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec_js',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: 'Bosch WSR 6 F',
            commercial_offers: {
              offers_active: true,
              offers: [
                {
                  offer_id: 'off_js',
                  merchant_id: 'bol',
                  product_url: 'https://www.bol.com/p',
                  affiliate_url: 'javascript:alert(1)',
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
const jsUrlHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockJsUrlData,
  registeredMerchants: [activeBolMerchant]
});
assert.ok(!jsUrlHtml.includes('javascript:'), 'javascript: scheme must NEVER be rendered');
assert.ok(!jsUrlHtml.includes('rel="sponsored'), 'Dangerous scheme must not render CTA');
console.log('  ✅ Test 6 Passed: Dangerous URI schemes completely rejected.');

// ▶ Test 7: Stale price must NOT be displayed (Requirement 19 H)
console.log('▶ Test 7: Validating stale price suppression...');
const tenDaysAgoIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
const mockStalePriceData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec_stale',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: 'Bosch WSR 6 F',
            commercial_offers: {
              offers_active: true,
              offers: [
                {
                  offer_id: 'off_stale_1',
                  merchant_id: 'bol',
                  title: 'Bougie',
                  product_url: 'https://www.bol.com/p',
                  affiliate_url: 'https://www.bol.com/p?aff=1',
                  price: 4.95,
                  observed_at: tenDaysAgoIso,
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
const stalePriceHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockStalePriceData,
  registeredMerchants: [activeBolMerchant]
});
assert.ok(stalePriceHtml.includes('Bekijk aanbod'), 'CTA link still rendered if offer valid');
assert.ok(!stalePriceHtml.includes('€4.95'), 'Stale price must NOT be displayed');
console.log('  ✅ Test 7 Passed: Stale price (> 7 days) suppressed while keeping safe CTA.');

// ▶ Test 8: Missing observed_at must NOT display price (Requirement 19 I)
console.log('▶ Test 8: Validating missing observed_at price suppression...');
const mockMissingDateData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec_nodate',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: 'Bosch WSR 6 F',
            commercial_offers: {
              offers_active: true,
              offers: [
                {
                  offer_id: 'off_nodate_1',
                  merchant_id: 'bol',
                  title: 'Bougie',
                  product_url: 'https://www.bol.com/p',
                  affiliate_url: 'https://www.bol.com/p?aff=1',
                  price: 4.95,
                  observed_at: null, // missing!
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
const missingDateHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockMissingDateData,
  registeredMerchants: [activeBolMerchant]
});
assert.ok(missingDateHtml.includes('Bekijk aanbod'), 'CTA link still rendered');
assert.ok(!missingDateHtml.includes('€4.95'), 'Price without observed_at must NOT be displayed');
console.log('  ✅ Test 8 Passed: Missing observed_at correctly causes price suppression.');

// ▶ Test 9: HTML injection in title and guidance must be escaped (Requirement 19 K)
console.log('▶ Test 9: Validating HTML injection escaping in content...');
const mockXssData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec_xss',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: '"><script>alert("xss")</script>',
            display_guidance: '<img src=x onerror=alert(1)>',
            commercial_offers: {
              offers_active: false,
              offers: []
            }
          }
        ]
      }
    }
  }
};
const xssHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', { compatData: mockXssData });
assert.ok(!xssHtml.includes('<script>'), '<script> tag must not exist unescaped');
assert.ok(!xssHtml.includes('<img src=x'), '<img tag must not exist unescaped');
assert.ok(xssHtml.includes('&lt;script&gt;'), '<script> must be escaped to &lt;script&gt;');
assert.ok(xssHtml.includes('&lt;img'), '<img> must be escaped to &lt;img');
console.log('  ✅ Test 9 Passed: HTML injection in claims and guidance safely escaped.');

// ▶ Test 10: HTML injection in attributes must be escaped / rejected (Requirement 19 L)
console.log('▶ Test 10: Validating attribute injection escaping...');
const mockAttrXssData = {
  models: {
    'ms-170': {
      machine_identity: { model_slug: 'ms-170', model_name: 'MS 170' },
      categories: {
        spark_plug: [
          {
            recommendation_id: 'rec" onmouseover="alert(1)',
            recommendation_type: 'spark_plug',
            compatibility_status: COMPATIBILITY_STATUSES.VERIFIED_MODEL_COMPATIBILITY,
            display_claim: 'Plug',
            commercial_offers: {
              offers_active: true,
              offers: [
                {
                  offer_id: 'off" onclick="alert(2)',
                  merchant_id: 'bol',
                  title: 'Test Offer',
                  product_url: 'https://www.bol.com/p',
                  affiliate_url: 'https://www.bol.com/p?aff=test&foo="><script>alert(3)</script>',
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
const attrXssHtml = renderModelProductCompatibilitySection('ms-170', 'MS 170', {
  compatData: mockAttrXssData,
  registeredMerchants: [activeBolMerchant]
});
assert.ok(!attrXssHtml.includes('onmouseover="alert'), 'Attribute breakout must be impossible');
assert.ok(!attrXssHtml.includes('onclick="alert'), 'Attribute breakout must be impossible');
assert.ok(attrXssHtml.includes('&quot;'), 'Quotes must be escaped to &quot;');
console.log('  ✅ Test 10 Passed: Attribute injection attempts safely escaped.');

// ▶ Test 11: Non-pilot model graceful fallback (no empty sections)
console.log('▶ Test 11: Validating non-pilot model handling...');
const unknownModelHtml = renderModelProductCompatibilitySection('non-existent-model-xyz', 'Unknown Model');
assert.strictEqual(unknownModelHtml, '', 'Non-existent model must return empty string');
console.log('  ✅ Test 11 Passed: Non-pilot models cleanly return empty markup without errors.');

// ▶ Test 12: ModelPageTemplate integration
console.log('▶ Test 12: Validating ModelPageTemplate full SSR rendering...');
const fullPageHtml = renderModelPageHtml(ms170Model, {
  modelEvidenceFacts: [],
  comparisonPartner: null,
  registeredComparisonLinks: []
});
assert.ok(fullPageHtml.includes('Onderdelen & onderhoud voor jouw STIHL MS 170'), 'Full SSR page must include compatibility section');
console.log('  ✅ Test 12 Passed: ModelPageTemplate integrates compatibility section seamlessly.');

// ▶ Test 13: Analytics Tracker metadata whitelisting and PII stripping
console.log('▶ Test 13: Validating AnalyticsTracker metadata whitelisting...');
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
console.log('  ✅ Test 13 Passed: Whitelisted metadata preserved, all PII and serial data stripped.');

console.log('\n🎉 ALL PHASE 48A UI & ANALYTICS PRIVACY TESTS PASSED 100% CLEANLY!\n');
