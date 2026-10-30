/**
 * Phase 56G — Controlled SEO Wave 3, Affiliate Intelligence & Interactive Parts Pilot Test Suite
 */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import {
  isPartIndexable,
  getAllIndexablePartsList,
  getAllIndexablePartsSet,
  getPilotPartsList,
  getExpansionCohortList,
  getWave2CohortList,
  getWave3CohortList,
  getWave3CohortSet,
  getWave4CohortList,
  getPreWave3IndexablePartsSet,
  getPreWave4IndexablePartsSet,
  MAX_WAVE3_COHORT_SIZE,
  MAX_TOTAL_INDEXABLE_PARTS
} from '../src/seo/PartIndexationRegistry.js';
import { buildWave3Cohort } from '../scripts/build_phase56g_wave3_cohort.mjs';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import {
  GSC_STATUSES,
  GSC_PROVENANCE_LIVE,
  getSearchConsoleConfigState,
  buildSearchAnalyticsRequest,
  fetchSearchAnalytics,
  fetchSitemaps,
  findLowCtrOpportunities
} from '../src/seo/SearchConsoleClient.js';
import { computeAffiliateIntelligence } from '../src/analytics/AffiliateIntelligence.js';
import { EVENT_TYPES } from '../src/components/AnalyticsTracker.js';
import {
  PILOT_MODELS,
  MAX_PILOT_MODELS,
  isPilotModel,
  buildSchematicHotspots,
  renderInteractiveDiagramPilotHtml
} from '../src/components/InteractiveDiagramViewer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
delete process.env.AMAZON_ASSOCIATE_TAG_DE;

const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
const database = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

test('Phase 56G - Test 1: Canonical Database & Catalog Invariants Frozen', () => {
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c, 17082);
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c, 175106);
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c, 766);
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c, 208412);
  assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c, 814);

  const publishedModels = (database.models || []).filter(m => m.data_status !== 'EVIDENCE_STORE_LINKED');
  assert.strictEqual(publishedModels.length, 85, 'Published STIHL models must remain 85');
});

test('Phase 56G - Test 2: Controlled SEO Wave 3 Cohort & Strict H1-H7 Quality Enforcement', () => {
  assert.strictEqual(MAX_WAVE3_COHORT_SIZE, 400);
  assert.strictEqual(MAX_TOTAL_INDEXABLE_PARTS, 1200);

  assert.strictEqual(getPilotPartsList().length, 50);
  assert.strictEqual(getExpansionCohortList().length, 350);
  assert.strictEqual(getWave2CohortList().length, 400);
  assert.strictEqual(getPreWave3IndexablePartsSet().size, 800, 'Pre-Wave-3 baseline must remain 800');

  const wave3List = getWave3CohortList();
  const wave3Set = getWave3CohortSet();
  assert.strictEqual(wave3List.length, 4, 'Strict H1-H7 Wave 3 cohort must promote exactly the 4 fully qualified parts');
  assert.strictEqual(wave3Set.size, 4);

  for (const p of wave3List) {
    assert.strictEqual(p.source_cohort, 'PHASE_56G_WAVE3');
    assert.ok(p.section_count >= 2, `Wave 3 part ${p.part_number} must have >= 2 independent sections`);
    assert.ok(p.model_count >= 1, `Wave 3 part ${p.part_number} must fit >= 1 published model`);
    assert.strictEqual(isPartIndexable(p.part_number), true);
  }

  // Reproducibility check: re-running builder in memory yields identical part numbers
  const built = buildWave3Cohort({ write: false });
  assert.deepStrictEqual(
    built.cohort.parts.map(p => p.part_number),
    wave3List.map(p => p.part_number),
    'Wave 3 cohort builder must be 100% deterministic and reproducible'
  );
});

test('Phase 56G - Test 3: Sitemap.xml, Canonicals, Unique Titles & Internal Search Noindex', () => {
  const wave4Count = getWave4CohortList().length;
  const allIndexable = getAllIndexablePartsList();
  assert.strictEqual(getPreWave4IndexablePartsSet().size, 804);
  assert.strictEqual(allIndexable.length, 804 + wave4Count);
  assert.strictEqual(getAllIndexablePartsSet().size, 804 + wave4Count);

  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, database);
  const allUrls = sitemapXml.match(/<loc>[^<]+<\/loc>/g) || [];
  const partUrls = sitemapXml.match(/<loc>https:\/\/www\.stihldecoder\.nl\/onderdeelnummer\/\d{11}\/<\/loc>/g) || [];

  assert.strictEqual(allUrls.length, 985 + wave4Count, 'Sitemap must contain 985 + Wave 4 URLs');
  assert.strictEqual(partUrls.length, 804 + wave4Count, 'Sitemap must contain 804 + Wave 4 part detail URLs');
  assert.strictEqual(new Set(allUrls).size, 985 + wave4Count, 'Zero duplicate URLs in sitemap');

  // Verify every Wave 3 part page renders index, follow, self-canonical, BreadcrumbList & Product JSON-LD
  for (const p of getWave3CohortList()) {
    const html = renderPartDetailPageHtml(p.part_number, database, PRIMARY_ORIGIN);
    assert.ok(html.includes('<meta name="robots" content="index, follow">'));
    assert.ok(html.includes(`<link rel="canonical" href="${PRIMARY_ORIGIN}/onderdeelnummer/${p.part_number}/">`));
    assert.ok(html.includes('"@type": "BreadcrumbList"'));
    assert.ok(html.includes('"@type": "Product"'));
  }

  // Internal search results must remain noindex, follow
  const searchHtml = renderPartsDiscoveryPageHtml('MS 261 carburateur', database, PRIMARY_ORIGIN);
  assert.ok(searchHtml.includes('<meta name="robots" content="noindex, follow">'));
});

test('Phase 56G - Test 4: Google Search Console Reusable Integration Layer (Fail-Closed)', async () => {
  // 1. Unconfigured environment -> fail-closed NOT_CONFIGURED, zero fabricated rows
  const unconf = getSearchConsoleConfigState({});
  assert.strictEqual(unconf.status, GSC_STATUSES.NOT_CONFIGURED);
  assert.deepStrictEqual(unconf.missing, ['GSC_ACCESS_TOKEN', 'GSC_SITE_URL']);

  const emptyProbe = await fetchSearchAnalytics({ startDate: '2026-09-01', endDate: '2026-10-01' }, { env: {} });
  assert.strictEqual(emptyProbe.status, GSC_STATUSES.NOT_CONFIGURED);
  assert.deepStrictEqual(emptyProbe.rows, []);

  // 2. Request validation
  assert.strictEqual(buildSearchAnalyticsRequest({ startDate: 'bad', endDate: '2026-10-01' }).ok, false);
  assert.strictEqual(buildSearchAnalyticsRequest({ startDate: '2026-10-05', endDate: '2026-10-01' }).ok, false);
  assert.strictEqual(buildSearchAnalyticsRequest({ startDate: '2026-09-01', endDate: '2026-10-01', dimensions: ['invalid'] }).ok, false);

  // 3. Configured mock API response -> tagged with GSC_LIVE_API provenance
  const mockEnv = { GSC_ACCESS_TOKEN: 'test-token', GSC_SITE_URL: 'sc-domain:stihldecoder.nl' };
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      rows: [
        { keys: ['stihl ms 261 onderdelen', 'https://www.stihldecoder.nl/kettingzagen/ms-261/onderdelen/'], clicks: 12, impressions: 400, ctr: 0.03, position: 6.4 },
        { keys: ['stihl 1141 120 0640', 'https://www.stihldecoder.nl/onderdeelnummer/11411200640/'], clicks: 1, impressions: 250, ctr: 0.004, position: 4.1 }
      ]
    })
  });

  const liveRes = await fetchSearchAnalytics(
    { startDate: '2026-09-01', endDate: '2026-10-01', dimensions: ['query', 'page'] },
    { env: mockEnv, fetchImpl: mockFetch }
  );
  assert.strictEqual(liveRes.status, GSC_STATUSES.OK);
  assert.strictEqual(liveRes.provenance, GSC_PROVENANCE_LIVE);
  assert.strictEqual(liveRes.rows.length, 2);
  assert.strictEqual(liveRes.rows[0].provenance, GSC_PROVENANCE_LIVE);

  const lowCtr = findLowCtrOpportunities(liveRes.rows, { minImpressions: 100, maxCtr: 0.01 });
  assert.strictEqual(lowCtr.length, 1);
  assert.strictEqual(lowCtr[0].query, 'stihl 1141 120 0640');

  // Offline rows must never be accepted by findLowCtrOpportunities
  assert.deepStrictEqual(findLowCtrOpportunities([{ provenance: 'OFFLINE_ANALYSIS', impressions: 500, ctr: 0.001 }]), []);

  // 4. Unauthorized 401 handling
  const unauthRes = await fetchSitemaps({
    env: mockEnv,
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  assert.strictEqual(unauthRes.status, GSC_STATUSES.UNAUTHORIZED);
  assert.deepStrictEqual(unauthRes.sitemaps, []);
});

test('Phase 56G - Test 5: Affiliate Intelligence Aggregator & Instrumentation', () => {
  assert.strictEqual(EVENT_TYPES.MODEL_PAGE_VIEW, 'model_page_view');

  // 1. Empty events -> null ratios, no fabricated conversions or revenue
  const emptyReport = computeAffiliateIntelligence([]);
  assert.strictEqual(emptyReport.data_status, 'NO_PRODUCTION_EVENTS_AVAILABLE');
  assert.strictEqual(emptyReport.ratios.model_to_part_click_rate.value, null);
  assert.strictEqual(emptyReport.ratios.part_view_to_affiliate_click_rate.value, null);
  assert.strictEqual(emptyReport.revenue.amazon_orders, null);
  assert.strictEqual(emptyReport.revenue.amazon_commission_eur, null);

  // 2. Real non-test events -> accurate ratios, test events excluded
  const sampleEvents = [
    { event_type: 'model_page_view', page_path: '/kettingzagen/ms-261/', is_test: 0 },
    { event_type: 'model_page_view', page_path: '/kettingzagen/ms-170/', is_test: 0 },
    { event_type: 'model_to_part_click', page_path: '/kettingzagen/ms-261/', is_test: 0 },
    { event_type: 'part_page_view', page_path: '/onderdeelnummer/11411200640/', is_test: 0 },
    { event_type: 'part_page_view', page_path: '/onderdeelnummer/00004007000/', is_test: 0 },
    {
      event_type: 'affiliate_click',
      page_path: '/onderdeelnummer/11411200640/',
      metadata_json: JSON.stringify({ part_number: '11411200640', query_variant: 'VARIANT_A', offer_type: 'SEARCH_LINK' }),
      is_test: 0
    },
    {
      event_type: 'affiliate_click',
      page_path: '/onderdelen/',
      metadata_json: JSON.stringify({ part_number: '00004007000', query_variant: 'VARIANT_B', offer_type: 'SEARCH_LINK', search_query_normalized: 'ms 261 bougie' }),
      is_test: 1 // must be ignored!
    }
  ];

  const report = computeAffiliateIntelligence(sampleEvents);
  assert.strictEqual(report.data_status, 'REAL_FIRST_PARTY_EVENTS');
  assert.strictEqual(report.counts.model_page_views, 2);
  assert.strictEqual(report.counts.model_to_part_clicks, 1);
  assert.strictEqual(report.counts.part_page_views, 2);
  assert.strictEqual(report.counts.affiliate_outbound_clicks, 1, 'Test events (is_test=1) must be excluded');
  assert.strictEqual(report.ratios.model_to_part_click_rate.value, 0.5);
  assert.strictEqual(report.ratios.part_view_to_affiliate_click_rate.value, 0.5);
  assert.strictEqual(report.top_clicked_parts[0].key, '11411200640');
  assert.strictEqual(report.query_variant_comparison.variants[0].variant, 'VARIANT_A');
  assert.strictEqual(report.revenue.amazon_commission_eur, null);

  // Verify PartDetailPageTemplate includes query_variant in client onclick tracking
  const partHtml = renderPartDetailPageHtml('11411200640', database, PRIMARY_ORIGIN);
  assert.ok(partHtml.includes('query_variant:'), 'PartDetailPageTemplate must track query_variant on affiliate_click');
  assert.ok(partHtml.includes('rel="sponsored nofollow noopener"'));
});

test('Phase 56G - Test 6: Interactive Exploded View Pilot (3 Models, Zero Guessing, No-JS Fallback)', () => {
  assert.strictEqual(PILOT_MODELS.length, MAX_PILOT_MODELS);
  assert.strictEqual(isPilotModel('ms_261'), true);
  assert.strictEqual(isPilotModel('ms_170'), true);
  assert.strictEqual(isPilotModel('fs_55'), true);
  assert.strictEqual(isPilotModel('ms_881'), false);

  const ms261StarterRows = db.prepare(`
    SELECT f.diagram_position, f.part_number, f.quantity, p.part_name
    FROM model_part_fitments f
    JOIN parts p ON p.part_number = f.part_number
    WHERE f.canonical_model_id = 'ms_261' AND f.section_name = 'Rewind Starter'
  `).all();

  const { positionedHotspots, unpositionedParts } = buildSchematicHotspots(ms261StarterRows);
  assert.strictEqual(positionedHotspots.length, 18, 'MS 261 Rewind Starter must have 18 verified positioned hotspots');
  assert.strictEqual(unpositionedParts.length, 1, 'MS 261 Rewind Starter kit with -1 position must stay unpositioned (never guessed)');
  assert.strictEqual(unpositionedParts[0].diagram_position, null);
  assert.strictEqual(unpositionedParts[0].cx, undefined, 'Unpositioned parts must never receive guessed coordinates');

  for (const h of positionedHotspots) {
    assert.ok(Number.isFinite(h.cx) && Number.isFinite(h.cy));
    assert.strictEqual(h.hit_radius, 22, 'Touch target radius must be 22px (44px diameter)');
  }

  const html = renderInteractiveDiagramPilotHtml({
    modelName: 'MS 261',
    sectionName: 'Rewind Starter',
    parts: ms261StarterRows
  });

  assert.ok(html.includes('<svg viewBox="0 0 720 360"'));
  assert.ok(html.includes('<noscript>'), 'Must provide non-JS <noscript> fallback notice');
  assert.ok(html.includes('<table'), 'Must provide complete accessible HTML fallback table');
  assert.ok(html.includes('/onderdeelnummer/11410801806/'), 'Must preserve original 11-digit part links');
  assert.ok(html.includes('1141 080 1806'), 'Must preserve formatted STIHL part number display');
});

test('Phase 56G - Test 7: Required Phase 56G Artifacts Complete & Valid', () => {
  const outDir = path.join(rootDir, 'output', 'phase56g');
  const required = [
    'PHASE56G_REPORT.md',
    'SEO_WAVE3_ELIGIBILITY.json',
    'SEO_WAVE3_SUMMARY.json',
    'GSC_INTEGRATION_AUDIT.json',
    'AFFILIATE_INTELLIGENCE_DASHBOARD.json',
    'INTERACTIVE_DIAGRAM_PILOT_REPORT.md'
  ];

  for (const file of required) {
    const full = path.join(outDir, file);
    assert.ok(fs.existsSync(full), `Missing Phase 56G artifact: ${file}`);
    const content = fs.readFileSync(full, 'utf8');
    assert.ok(content.length > 200, `Artifact ${file} must be non-empty`);
    if (file.endsWith('.json')) {
      assert.doesNotThrow(() => JSON.parse(content), `Artifact ${file} must be valid JSON`);
    }
  }
});
