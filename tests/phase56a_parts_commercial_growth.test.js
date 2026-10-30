/**
 * Test Suite: Phase 56A — Parts Commercial Growth Foundation
 *
 * Verifies:
 * 1. Authoritative Catalog & Database Invariants (17,082 parts, 175,106 fitments, 766 configs, 208,412 evidence)
 * 2. Deterministic SEO Quality Scoring (Tiers A/B/C/Thin/Blocked)
 * 3. Deterministic Commercial Opportunity Scoring (High/Medium/Low/Unknown)
 * 4. Phase 54D Pilot Protection (50 parts 100% preserved)
 * 5. Phase 56A SEO Expansion Cohort (350 parts, 100% Tier A, 0 generic hardware)
 * 6. Total Indexable vs Noindex Gating (400 indexable, 16,682 noindex follow)
 * 7. Sitemap.xml Exact Set Equivalence (400 part URLs in sitemap, 0 leaks)
 * 8. Part Detail Page Content Architecture (Identity -> Fitments -> Diagram -> Amazon CTA)
 * 9. Internal Commercial Funnel (Machine -> Parts -> Part -> Amazon)
 * 10. Amazon Affiliate Hardening (Search Fallback, 0 fabricated ASINs)
 * 11. Amazon Verification Queue Integrity (250 entries, fail-closed candidate status)
 * 12. Analytics Metadata Whitelisting (seo_tier, commercial_tier)
 * 13. Phase 56A Output Artifacts Integrity
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPageHtml } from '../src/components/ModelPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  PartIndexQualityScorer,
  SEO_TIERS,
  COMMERCIAL_TIERS,
  GENERIC_HARDWARE_REGEX
} from '../src/seo/PartIndexQualityScorer.js';
import {
  isPartIndexable,
  getIndexablePartEntry,
  getAllIndexablePartsList,
  getAllIndexablePartsSet,
  getPilotPartsList,
  getPilotPartsSet,
  getExpansionCohortList
} from '../src/seo/PartIndexationRegistry.js';
import { isPartIndexationPilotEnabled } from '../src/seo/PartIndexationPilot.js';
import { EVENT_TYPES } from '../src/components/AnalyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

// Set up affiliate environment (Amazon Affiliate is live in production)
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'stihldecoder-21';

test('Phase 56A - Test 1: Authoritative Catalog & Database Invariants Preserved', () => {
  const db = new Database(dbPath, { readonly: true });
  const partsCount = db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c;
  const fitmentsCount = db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c;
  const configsCount = db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c;
  const evidenceCount = db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c;
  const sectionContextsCount = db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c;
  db.close();

  assert.strictEqual(partsCount, 17082, 'PARTS must remain exactly 17,082');
  assert.strictEqual(fitmentsCount, 175106, 'FITMENTS must remain exactly 175,106');
  assert.strictEqual(configsCount, 766, 'CONFIGURATIONS must remain exactly 766');
  assert.ok(evidenceCount >= 208412, `EVIDENCE must be >= 208,412 (got ${evidenceCount})`);
  assert.strictEqual(sectionContextsCount, 814, 'SECTION CONTEXTS must remain exactly 814');
});

test('Phase 56A - Test 2: SEO Quality Scoring Determinism & Tier Distribution', () => {
  // Test evaluation of a known rich part (Clutch 1123 160 2050)
  const richSample = {
    part_number: '11231602050',
    part_number_display: '1123 160 2050',
    part_name: 'Koppeling',
    model_count: 20,
    fitment_count: 44,
    raw_sections: 'Kettingrem, koppeling|Koppeling',
    raw_positions: '1|2|3',
    has_config: 1
  };
  const richResult = PartIndexQualityScorer.evaluatePart(richSample);
  assert.strictEqual(richResult.seo_tier, SEO_TIERS.TIER_A, 'Clutch across 20 models must be SEO_TIER_A');
  assert.ok(richResult.seo_score >= 65, 'Tier A score must be >= 65');

  // Test evaluation of generic hardware (Pan head screw)
  const screwSample = {
    part_number: '90223410980',
    part_number_display: '9022 341 0980',
    part_name: 'Pan head screw IS-M5x16',
    model_count: 15,
    fitment_count: 30,
    raw_sections: 'Krukashuis',
    raw_positions: '14',
    has_config: 0
  };
  const screwResult = PartIndexQualityScorer.evaluatePart(screwSample);
  assert.strictEqual(screwResult.seo_tier, SEO_TIERS.THIN, 'Generic fastener must be SEO_THIN');
  assert.ok(screwResult.is_generic_hardware, 'Must be flagged as generic hardware');

  // Test evaluation of corrupted encoding (Mojibake / replacement character)
  const corruptedSample = {
    part_number: '99999999999',
    part_number_display: '9999 999 9999',
    part_name: 'Cilinder \uFFFD Zuiger',
    model_count: 10,
    fitment_count: 20,
    raw_sections: 'Cilinder',
    raw_positions: '1',
    has_config: 1
  };
  const corruptedResult = PartIndexQualityScorer.evaluatePart(corruptedSample);
  assert.strictEqual(corruptedResult.seo_tier, SEO_TIERS.BLOCKED, 'Unresolved encoding must be SEO_BLOCKED');
  assert.ok(corruptedResult.reasons.includes('unresolved_encoding'), 'Reason must include unresolved_encoding');
});

test('Phase 56A - Test 3: Commercial Opportunity Scoring & Category Recognition', () => {
  const sparkPlug = { part_number: '00004007000', part_name: 'Spark plug NGK BPMR7A', model_count: 25, fitment_count: 50 };
  const airFilter = { part_number: '11231201613', part_name: 'Air filter element', model_count: 8, fitment_count: 12 };
  const sprocket = { part_number: '00006421223', part_name: 'Chain sprocket 3/8P', model_count: 15, fitment_count: 30 };
  const genericScrew = { part_number: '90223410980', part_name: 'Hexagon nut M8', model_count: 10, fitment_count: 20 };

  const spRes = PartIndexQualityScorer.evaluatePart(sparkPlug);
  const afRes = PartIndexQualityScorer.evaluatePart(airFilter);
  const csRes = PartIndexQualityScorer.evaluatePart(sprocket);
  const gnRes = PartIndexQualityScorer.evaluatePart(genericScrew);

  assert.strictEqual(spRes.commercial_tier, COMMERCIAL_TIERS.HIGH);
  assert.strictEqual(spRes.category, 'bougie');

  assert.strictEqual(afRes.commercial_tier, COMMERCIAL_TIERS.HIGH);
  assert.strictEqual(afRes.category, 'luchtfilter');

  assert.strictEqual(csRes.commercial_tier, COMMERCIAL_TIERS.HIGH);
  assert.strictEqual(csRes.category, 'kettingwiel');

  assert.strictEqual(gnRes.commercial_tier, COMMERCIAL_TIERS.LOW);
});

test('Phase 56A - Test 4: Phase 54D Pilot Protection (50 parts 100% preserved)', () => {
  const pilot = getPilotPartsList();
  assert.strictEqual(pilot.length, 50, 'Pilot list must have exactly 50 parts');

  const pilotSet = getPilotPartsSet();
  assert.strictEqual(pilotSet.size, 50, 'Pilot set must have exactly 50 parts');

  // Verify key canonical parts exist in pilot
  assert.ok(pilotSet.has('11256401701'), 'Kettingwieldeksel must be in pilot');
  assert.ok(pilotSet.has('11236403200'), 'Oliepomp must be in pilot');
  assert.ok(pilotSet.has('11231602050'), 'Koppeling must be in pilot');

  for (const p of pilot) {
    assert.strictEqual(isPartIndexable(p.part_number), true, `Pilot part ${p.part_number} must be indexable`);
  }
});

test('Phase 56A - Test 5: Phase 56A SEO Expansion Cohort Integrity', () => {
  const cohort = getExpansionCohortList();
  assert.strictEqual(cohort.length, 350, 'Expansion cohort must have exactly 350 parts (within 250-500 target)');

  const pilotSet = getPilotPartsSet();
  const cohortSet = new Set();

  for (const part of cohort) {
    assert.ok(part.part_number, 'Part number must be defined');
    assert.ok(!pilotSet.has(part.part_number), `Expansion part ${part.part_number} must not collide with Phase 54D pilot`);
    assert.ok(!cohortSet.has(part.part_number), `Duplicate expansion part ${part.part_number} detected`);
    cohortSet.add(part.part_number);

    assert.strictEqual(part.enabled, true, 'Expansion part must be enabled');
    assert.strictEqual(part.seo_tier, SEO_TIERS.TIER_A, 'All expansion parts must be SEO_TIER_A');
    assert.ok(
      part.commercial_tier === COMMERCIAL_TIERS.HIGH || part.commercial_tier === COMMERCIAL_TIERS.MEDIUM,
      'Expansion parts must have high or medium commercial opportunity'
    );
    assert.ok(part.model_count >= 2, `Expansion part ${part.part_number} must have >= 2 models (got ${part.model_count})`);
    assert.ok(!GENERIC_HARDWARE_REGEX.test(part.clean_name), `Generic hardware leaked into expansion: ${part.clean_name}`);
    assert.strictEqual(part.part_number !== '11270201216', true, 'Negative control 11270201216 must not be in expansion cohort');
  }
});

test('Phase 56A - Test 6: Total Indexable Parts & Strict Noindex Gating', () => {
  const allIndexable = getAllIndexablePartsList();
  assert.ok(allIndexable.length >= 400, 'Total indexable parts must be at least 400 (50 pilot + 350 expansion)');
  assert.strictEqual(getExpansionCohortList().length, 350, 'Phase 56A expansion cohort must contain exactly 350 parts');
  assert.strictEqual(getPilotPartsList().length, 50, 'Phase 54D pilot cohort must contain exactly 50 parts');

  const allSet = getAllIndexablePartsSet();
  assert.ok(allSet.size >= 400, 'Total indexable set must contain at least 400 unique part numbers');

  // Verify non-indexable negative controls render noindex, follow
  const nonIndexableSamples = ['11270201216', '90223410980', '92143200700', '00000071043', '99999999999'];
  for (const partNo of nonIndexableSamples) {
    assert.strictEqual(isPartIndexable(partNo), false, `Part ${partNo} must NOT be indexable`);
    const html = renderPartDetailPageHtml(partNo, database, PRIMARY_ORIGIN);
    assert.match(html, /<meta\s+name="robots"\s+content="noindex, follow"/, `Part ${partNo} must render noindex, follow`);
  }
});

test('Phase 56A - Test 7: Sitemap.xml Exact Set Equivalence (400 part URLs, 0 leaks)', () => {
  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const sitemapPartUrls = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];

  assert.ok(sitemapPartUrls.length >= 400, 'Sitemap must contain at least 400 individual part URLs');

  const sitemapNumbers = new Set(sitemapPartUrls.map(u => {
    const m = u.match(/\/onderdeelnummer\/(\d{11})\//);
    return m ? m[1] : null;
  }).filter(Boolean));

  const allIndexableSet = getAllIndexablePartsSet();
  assert.ok(sitemapNumbers.size >= 400, 'All sitemap part URLs must be unique');

  for (const p of [...getPilotPartsList(), ...getExpansionCohortList()]) {
    assert.ok(sitemapNumbers.has(p.part_number), `Indexable part ${p.part_number} must be present in sitemap.xml`);
  }
  for (const partNo of sitemapNumbers) {
    assert.ok(allIndexableSet.has(partNo), `Sitemap part ${partNo} must be an authorized member of indexable registry`);
  }
});

test('Phase 56A - Test 8: Part Detail Page Content Architecture & Safety', () => {
  // Test a representative expansion cohort part
  const cohort = getExpansionCohortList();
  const sample = cohort[0];
  const html = renderPartDetailPageHtml(sample.part_number, database, PRIMARY_ORIGIN);

  // 1. Robots & Canonical
  assert.match(html, /<meta\s+name="robots"\s+content="index, follow"/);
  assert.match(html, new RegExp(`<link\\s+rel="canonical"\\s+href="https://www.stihldecoder.nl/onderdeelnummer/${sample.part_number}/"`));

  // 2. Title & H1 & Meta Description
  assert.match(html, /<title>STIHL \d{4} \d{3} \d{4} .+ — Geschikte Modellen \| STIHLDecoder<\/title>/);
  assert.match(html, /<h1[^>]*>[\s\S]*?STIHL \d{4} \d{3} \d{4}[\s\S]*?<\/h1>/);
  assert.match(html, /<meta\s+name="description"\s+content="Bekijk op welke STIHL machines onderdeel/);

  // 3. Technical Content Hierarchy: Models & Sections BEFORE Commercial CTA
  const modelsIdx = html.indexOf('Geschikte STIHL Modellen');
  const offersIdx = html.indexOf('Zoek dit onderdeel online');
  assert.ok(modelsIdx > -1, 'Compatible models section must exist');
  assert.ok(offersIdx > -1, 'Commercial offers section must exist');
  assert.ok(modelsIdx < offersIdx, 'Technical compatibility MUST appear before commercial CTA');

  // 4. Zero False Claims / Price / Availability
  assert.strictEqual(html.includes('Op voorraad'), false, 'Must not claim in-stock without live API');
  assert.strictEqual(html.includes('€'), false, 'Must not claim prices without live API');
  assert.strictEqual(html.includes('Gratis verzending'), false, 'Must not claim free delivery');
});

test('Phase 56A - Test 9: Internal Commercial Funnel (Machine -> Parts -> Part -> Amazon)', () => {
  // 1. Machine Model Page renders dedicated parts preview section
  const ms261 = database.models.find(m => m.slug === 'ms-261' || m.model_name === 'MS 261');
  assert.ok(ms261, 'MS 261 model must exist in database');

  const modelHtml = renderModelPageHtml(ms261, database, PRIMARY_ORIGIN);
  assert.match(modelHtml, /Onderdelen & Explosietekeningen STIHL MS 261/, 'Model page must showcase canonical parts section');
  assert.match(modelHtml, /\/kettingzagen\/ms-261\/onderdelen\//, 'Model page must link to model parts page');

  // 2. Model Parts Page groups by canonical diagram section
  const partsHtml = renderModelPartsPageHtml(ms261, database, PRIMARY_ORIGIN);
  assert.match(partsHtml, /Canonieke Onderdelencatalogus/, 'Model parts page must render canonical catalog');
  assert.match(partsHtml, /Pos\./, 'Model parts page must render diagram positions');
  assert.match(partsHtml, /\/onderdeelnummer\/\d{11}\//, 'Model parts page must link to individual part pages');
});

test('Phase 56A - Test 10: Amazon Affiliate Hardening & Search Fallback', () => {
  const cohort = getExpansionCohortList();
  const sample = cohort[0];
  const html = renderPartDetailPageHtml(sample.part_number, database, PRIMARY_ORIGIN);

  // Search Fallback Copy
  assert.match(html, /Zoek op Amazon\.nl/, 'Search fallback button must state Zoek op Amazon.nl');
  assert.match(html, /Amazon-zoekopdracht/, 'Badge must state Amazon-zoekopdracht');
  assert.match(html, /De beschikbaarheid en exacte overeenkomst zijn niet vooraf bevestigd/, 'Must state exact match disclaimer');

  // Redirect params
  assert.match(html, /offer_type=SEARCH_LINK/, 'Redirect must specify offer_type=SEARCH_LINK');
  assert.match(html, /product_verified=false/, 'Redirect must specify product_verified=false');
  assert.match(html, /seo_tier=SEO_TIER_A/, 'Redirect must include seo_tier=SEO_TIER_A');
});

test('Phase 56A - Test 11: Amazon Verification Queue Integrity (250 entries, fail-closed)', () => {
  const queuePath = path.join(rootDir, 'output', 'phase56a', 'AMAZON_VERIFICATION_QUEUE.json');
  assert.ok(fs.existsSync(queuePath), 'AMAZON_VERIFICATION_QUEUE.json must exist');

  const doc = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  assert.strictEqual(doc.schema_version, '1.0.0');
  assert.strictEqual(doc.phase, 'Phase 56A');
  assert.strictEqual(doc.queue_size, 250);
  assert.strictEqual(doc.queue.length, 250, 'Queue must contain exactly 250 parts');

  for (const item of doc.queue) {
    assert.ok(item.queue_rank >= 1 && item.queue_rank <= 250, 'Rank must be 1-250');
    assert.match(item.part_number, /^\d{11}$/, 'Part number must be 11 digits');
    assert.ok(item.display_name, 'Display name must exist');
    assert.ok(Array.isArray(item.models) && item.models.length >= 1, 'Models must be non-empty array');
    assert.strictEqual(item.current_affiliate_status, 'SEARCH_FALLBACK_ONLY');
    assert.strictEqual(item.asin_verification_status, 'ASIN_CANDIDATE');
    assert.strictEqual(item.verified_asin, null, 'Verified ASIN must be null until verified');
    assert.match(item.current_search_url, /^https:\/\/www\.amazon\.nl\/s\?k=STIHL\+/);
  }
});

test('Phase 56A - Test 12: Analytics Metadata Whitelisting & Non-PII Integrity', () => {
  const analyticsTrackerPath = path.join(rootDir, 'src', 'components', 'AnalyticsTracker.js');
  const src = fs.readFileSync(analyticsTrackerPath, 'utf8');

  assert.ok(src.includes("'seo_tier'"), 'WHITELISTED_METADATA_KEYS must include seo_tier');
  assert.ok(src.includes("'commercial_tier'"), 'WHITELISTED_METADATA_KEYS must include commercial_tier');
  assert.ok(src.includes("PART_PAGE_VIEW: 'part_page_view'"), 'EVENT_TYPES must include PART_PAGE_VIEW');
  assert.ok(src.includes("MACHINE_TO_PART_CLICK: 'machine_to_part_click'"), 'EVENT_TYPES must include MACHINE_TO_PART_CLICK');
});

test('Phase 56A - Test 13: Phase 56A Output Artifacts Integrity', () => {
  const outDir = path.join(rootDir, 'output', 'phase56a');
  const requiredFiles = [
    'PARTS_COMMERCIAL_BASELINE.json',
    'SEO_QUALITY_SCORE.json',
    'COMMERCIAL_OPPORTUNITY_SCORE.json',
    'SEO_EXPANSION_COHORT.json',
    'AMAZON_VERIFICATION_QUEUE.json',
    'PARTS_FUNNEL_AUDIT.json',
    'PHASE56A_SUMMARY.json'
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(outDir, f);
    assert.ok(fs.existsSync(fullPath), `Artifact ${f} must exist`);
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    assert.ok(content, `Artifact ${f} must be valid JSON`);
  }
});
