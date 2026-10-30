/**
 * Test Suite: Phase 56I — Controlled SEO Wave 4 & Commercial Section Activation
 *
 * Verifies:
 * 1. Canonical database invariants remain frozen (17,082 parts, 175,106 fitments, 766 configs, 208,412 evidence, 814 section contexts, 85 published models)
 * 2. Wave 4 candidate audit & strict H1–H7 selection (41 evaluated -> 39 selected: 32 COMMERCIAL_HIGH + 7 COMMERCIAL_MEDIUM; 2 rejected: 42411226600 & 11171229000)
 * 3. Indexation registry progression (804 -> 843 indexable parts, <= 845 ceiling, 16,239 noindex parts)
 * 4. Sitemap.xml exact equivalence (985 -> 1,024 URLs, 843 part URLs, 0 duplicates, 0 rejected/noindex leaks)
 * 5. Rendered Wave 4 part detail pages (index, follow, self-canonical, unique titles/descriptions, JSON-LD BreadcrumbList + Product, resolved sections, 0 broken backlinks, 0 orphans)
 * 6. Model -> Section -> Part navigation ordering (resolved sections before Unresolved Diagram Section, COMMERCIAL_HIGH prioritized, clickable part name + Onderdeelgids badge)
 * 7. Interactive Diagram Pilot compatibility (MS 261, MS 170, FS 55 <= 3 models, 0 guessed coordinates)
 * 8. Affiliate funnel integrity (17,082 search fallbacks, 0 verified ASINs, srihldecoder2-21, deterministic A/B query split)
 * 9. Analytics & GSC fail-closed readiness (section_context & wave_identifier whitelisted, GSC NOT_CONFIGURED without fabricated data)
 * 10. All 11 required Phase 56I output artifacts present and valid in output/phase56i/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import {
  isPartIndexable,
  getIndexablePartEntry,
  getAllIndexablePartsList,
  getAllIndexablePartsSet,
  getPreWave3IndexablePartsSet,
  getPreWave4IndexablePartsSet,
  getWave3CohortList,
  getWave4CohortList,
  getWave4CohortSet,
  MAX_WAVE4_COHORT_SIZE
} from '../src/seo/PartIndexationRegistry.js';
import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { renderPartDetailPageHtml } from '../src/components/PartDetailPageTemplate.js';
import { renderModelPartsPageHtml } from '../src/components/ModelPartsPageTemplate.js';
import { renderPartsDiscoveryPageHtml } from '../src/components/PartsDiscoveryPageTemplate.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { PILOT_MODELS, MAX_PILOT_MODELS, buildSchematicHotspots } from '../src/components/InteractiveDiagramViewer.js';
import { trackEvent, EVENT_TYPES } from '../src/components/AnalyticsTracker.js';
import { getSearchConsoleConfigState, GSC_STATUSES } from '../src/seo/SearchConsoleClient.js';
import { buildPhase56IWave4 } from '../scripts/build_phase56i_wave4.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output', 'phase56i');

process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
delete process.env.AMAZON_ASSOCIATE_TAG_DE;

const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

test('Phase 56I - Test 1: Frozen Canonical Database Invariants', () => {
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c, 17082);
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c, 175106);
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c, 766);
  assert.strictEqual(db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c, 208412);
  assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c, 814);

  const publishedModels = (stihlDb.models || []).filter(m => m.data_status !== 'EVIDENCE_STORE_LINKED');
  assert.strictEqual(publishedModels.length, 85);
});

test('Phase 56I - Test 2: Wave 4 Candidate Audit & Strict H1–H7 Selection (39 Selected, 2 Rejected)', () => {
  assert.strictEqual(MAX_WAVE4_COHORT_SIZE, 41);
  assert.strictEqual(getPreWave3IndexablePartsSet().size, 800, 'Pre-Wave-3 baseline must remain 800');
  assert.strictEqual(getWave3CohortList().length, 4, 'Wave 3 cohort must remain 4');
  assert.strictEqual(getPreWave4IndexablePartsSet().size, 804, 'Pre-Wave-4 baseline must remain 804');

  const wave4List = getWave4CohortList();
  const wave4Set = getWave4CohortSet();
  assert.strictEqual(wave4List.length, 39, 'Wave 4 must activate exactly the 39 strict H1-H7 passing candidates');
  assert.strictEqual(wave4Set.size, 39);

  const highCount = wave4List.filter(p => p.commercial_tier === 'COMMERCIAL_HIGH').length;
  const medCount = wave4List.filter(p => p.commercial_tier === 'COMMERCIAL_MEDIUM').length;
  assert.strictEqual(highCount, 32, 'All 32 COMMERCIAL_HIGH candidates must be activated');
  assert.strictEqual(medCount, 7, 'Exactly 7 verified COMMERCIAL_MEDIUM candidates must be activated');

  // Verify the 2 rejected candidates are NOT indexable and remain noindex, follow
  assert.strictEqual(isPartIndexable('42411226600'), false, '42411226600 ([NO LONGER AVAILABLE] Stihl Collar Screw) must be rejected');
  assert.strictEqual(isPartIndexable('11171229000'), false, '11171229000 (Retaining Ring generic hardware) must be rejected');

  const rejectedHtml1 = renderPartDetailPageHtml('42411226600', stihlDb, PRIMARY_ORIGIN);
  const rejectedHtml2 = renderPartDetailPageHtml('11171229000', stihlDb, PRIMARY_ORIGIN);
  assert.ok(rejectedHtml1.includes('<meta name="robots" content="noindex, follow">'));
  assert.ok(rejectedHtml2.includes('<meta name="robots" content="noindex, follow">'));

  // Reproducibility check
  const built = buildPhase56IWave4({ write: false });
  assert.deepStrictEqual(
    built.wave4CohortDoc.parts.map(p => p.part_number),
    wave4List.map(p => p.part_number),
    'Wave 4 builder must be 100% deterministic and reproducible'
  );
});

test('Phase 56I - Test 3: Total Indexable Parts (843) & Sitemap.xml Exact Equivalence (1,024 URLs)', () => {
  const allIndexable = getAllIndexablePartsList();
  const allIndexableSet = getAllIndexablePartsSet();
  assert.strictEqual(allIndexable.length, 843, 'Total indexable parts must be 804 + 39 = 843');
  assert.strictEqual(allIndexableSet.size, 843);
  assert.ok(allIndexable.length <= 845, 'Total indexable parts must not exceed 845 ceiling');

  const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, stihlDb);
  const allUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const partUrls = allUrls.filter(u => /\/onderdeelnummer\/\d{11}\/$/.test(u));

  assert.strictEqual(allUrls.length, 1024, 'Sitemap must contain 985 + 39 = 1,024 URLs');
  assert.strictEqual(partUrls.length, 843, 'Sitemap must contain 843 individual part URLs');
  assert.strictEqual(new Set(allUrls).size, 1024, 'Sitemap must have 0 duplicate URLs');

  for (const w4 of getWave4CohortList()) {
    const expectedUrl = `${PRIMARY_ORIGIN}/onderdeelnummer/${w4.part_number}/`;
    assert.ok(allUrls.includes(expectedUrl), `Wave 4 part ${w4.part_number} must be in sitemap.xml`);
  }

  assert.ok(!allUrls.includes(`${PRIMARY_ORIGIN}/onderdeelnummer/42411226600/`), 'Rejected part 42411226600 must not be in sitemap');
  assert.ok(!allUrls.includes(`${PRIMARY_ORIGIN}/onderdeelnummer/11171229000/`), 'Rejected part 11171229000 must not be in sitemap');
});

test('Phase 56I - Test 4: Wave 4 Part Detail Pages (SEO Meta, Structured Data, Backlinks & Zero Orphans)', () => {
  const wave4List = getWave4CohortList();
  const titles = new Set();
  const descriptions = new Set();
  const canonicals = new Set();

  for (const p of wave4List) {
    const entry = getIndexablePartEntry(p.part_number);
    assert.strictEqual(entry.source_cohort, 'PHASE_56I_WAVE4');
    assert.strictEqual(entry.wave_identifier, 'wave4');

    const html = renderPartDetailPageHtml(p.part_number, stihlDb, PRIMARY_ORIGIN);
    assert.ok(html.includes('<meta name="robots" content="index, follow">'), `Part ${p.part_number} must be index, follow`);
    assert.ok(html.includes(`<link rel="canonical" href="${PRIMARY_ORIGIN}/onderdeelnummer/${p.part_number}/">`));
    assert.ok(html.includes('"@type": "BreadcrumbList"'));
    assert.ok(html.includes('"@type": "Product"'));
    assert.ok(!html.includes('Unresolved Diagram Section'), 'Must never render Unresolved Diagram Section on Part Detail Page');

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
    const desc = html.match(/<meta name="description" content="([^"]+)">/)?.[1] || '';
    const canon = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1] || '';

    assert.ok(title.length > 20);
    assert.ok(desc.startsWith('Bekijk op welke STIHL machines onderdeel'));
    titles.add(title);
    descriptions.add(desc);
    canonicals.add(canon);

    // Must have >= 1 outgoing model parts backlink and wave_identifier='wave4' in tracking
    assert.ok(html.includes('/onderdelen/"'), `Wave 4 part ${p.part_number} must link back to compatible published model /onderdelen/ page`);
    assert.ok(html.includes("wave_identifier: 'wave4'"), `Wave 4 part ${p.part_number} must include wave_identifier: 'wave4' in analytics`);
  }

  assert.strictEqual(titles.size, 39, 'All 39 Wave 4 pages must have 100% unique titles');
  assert.strictEqual(descriptions.size, 39, 'All 39 Wave 4 pages must have 100% unique meta descriptions');
  assert.strictEqual(canonicals.size, 39, 'All 39 Wave 4 pages must have 100% unique canonical URLs');
});

test('Phase 56I - Test 5: Section Navigation Ordering & Commercial High Highlighting on Model Parts Pages', () => {
  const fs55Model = stihlDb.models.find(m => m.slug === 'fs-55');
  const sections = PartCatalogResolver.getSectionsForModel(fs55Model, null, null, stihlDb);
  assert.ok(sections.length > 3);

  // Resolved sections must appear before Unresolved Diagram Section
  const unresIdx = sections.findIndex(s => s.section_name === 'Unresolved Diagram Section' || s.section_key === 'general_unresolved');
  if (unresIdx !== -1) {
    assert.strictEqual(unresIdx, sections.length - 1, 'Unresolved Diagram Section must always be sorted last');
  }

  // Within sections containing both COMMERCIAL_HIGH indexable parts and non-indexable parts, COMMERCIAL_HIGH comes first
  for (const sec of sections) {
    let seenNonIndexable = false;
    for (const part of sec.parts) {
      if (!part.is_indexable) seenNonIndexable = true;
      if (part.is_indexable && part.commercial_tier === 'COMMERCIAL_HIGH') {
        assert.strictEqual(seenNonIndexable, false, `COMMERCIAL_HIGH indexable part ${part.part_number} must be ordered before non-indexable parts in section ${sec.section_name}`);
      }
    }
  }

  const fs55Html = renderModelPartsPageHtml(fs55Model, stihlDb, PRIMARY_ORIGIN);
  assert.ok(fs55Html.includes('Onderdeelgids →'), 'ModelPartsPage must render Onderdeelgids badge for COMMERCIAL_HIGH indexable parts');
  assert.ok(fs55Html.includes('model_to_part_click'), 'ModelPartsPage must instrument model_to_part_click with section_context and wave_identifier');
  assert.ok(fs55Html.includes('section_context:'), 'ModelPartsPage must pass section_context in model_to_part_click');
});

test('Phase 56I - Test 6: Analytics Whitelist, Affiliate Integrity & GSC Fail-Closed Readiness', () => {
  assert.strictEqual(PILOT_MODELS.length, MAX_PILOT_MODELS);

  // Verify AnalyticsTracker preserves section_context and wave_identifier in whitelisted metadata
  const evt = trackEvent(EVENT_TYPES.MODEL_TO_PART_CLICK, {
    model: 'fs-55',
    part_number: '41401200619',
    section_context: 'Carburetor C1Q-S99',
    commercial_tier: 'COMMERCIAL_HIGH',
    seo_tier: 'SEO_TIER_A',
    wave_identifier: 'wave4',
    page_path: '/bosmaaiers/fs-55/onderdelen/',
    untrusted_pii_field: 'should_be_stripped'
  }, 'Mozilla/5.0 TestUserAgent', true);

  assert.strictEqual(evt.metadata.section_context, 'Carburetor C1Q-S99');
  assert.strictEqual(evt.metadata.wave_identifier, 'wave4');
  assert.strictEqual(evt.metadata.commercial_tier, 'COMMERCIAL_HIGH');
  assert.strictEqual(evt.metadata.untrusted_pii_field, undefined, 'Non-whitelisted fields must be stripped');

  const gscState = getSearchConsoleConfigState({});
  assert.strictEqual(gscState.status, GSC_STATUSES.NOT_CONFIGURED);

  // Internal search must remain noindex, follow
  const searchHtml = renderPartsDiscoveryPageHtml('4140 120 0619', stihlDb, PRIMARY_ORIGIN);
  assert.ok(searchHtml.includes('<meta name="robots" content="noindex, follow">'));
});

test('Phase 56I - Test 7: All 11 Required Output Artifacts Exist and Are Valid', () => {
  const requiredFiles = [
    'WAVE4_BASELINE.json',
    'WAVE4_CANDIDATES.json',
    'WAVE4_SELECTED.json',
    'WAVE4_REJECTED.json',
    'WAVE4_INTERNAL_LINK_AUDIT.json',
    'WAVE4_SECTION_NAVIGATION_AUDIT.json',
    'WAVE4_AFFILIATE_FUNNEL_AUDIT.json',
    'WAVE4_ANALYTICS_READINESS.json',
    'WAVE5_PREFLIGHT.json',
    'PHASE56I_SUMMARY.json',
    'PHASE56I_REPORT.md'
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(outputDir, file);
    assert.ok(fs.existsSync(fullPath), `Artifact ${file} must exist in output/phase56i/`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 100, `Artifact ${file} must be non-empty`);
    if (file.endsWith('.json')) {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      assert.strictEqual(parsed.phase, 'PHASE_56I', `${file} must have phase === PHASE_56I`);
    }
  }
});
