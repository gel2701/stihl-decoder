/**
 * Phase 56K — Targeted External Evidence Acquisition Pilot Test Suite
 *
 * Verifies:
 *   1. Source contract (provenance required, URL/document locator required, valid source type, lineage classification, mirror detection)
 *   2. Evidence evaluation contract (exact part, exact model, exact scope, same-section rejected, alias duplicate rejected, cross-scope rejected, mirror-only rejected, actual second section accepted, ambiguity quarantined)
 *   3. Pilot cohort & artifact determinism (40 targets from 110, all 14 artifacts in output/phase56k/)
 *   4. Historical protection (344 Phase 56H resolutions intact, 110 Phase 56J classifications intact, 814 contexts intact, 0 evidence loss)
 *   5. SEO freeze (indexable = 843, sitemap = 1,024, no Wave 5 promotion)
 *   6. Catalog invariants (parts = 17,082, fitments = 175,106, configurations = 766)
 *   7. Affiliate invariants (fallbacks = 17,082, production tag = srihldecoder2-21, deterministic A/B split)
 */

import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import {
  SectionResolutionRegistry,
  resetSectionResolutionCache
} from '../src/parts/SectionResolutionRegistry.js';
import {
  resetRegistryCache,
  getAllIndexablePartsList
} from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import {
  MAX_PILOT_TARGETS,
  AUDITED_EXTERNAL_DOMAINS,
  evaluateExternalObservation,
  areSectionsSemanticallyEquivalentOrCombinedAlias,
  buildPhase56KExternalEvidencePilot
} from '../scripts/build_phase56k_external_evidence_pilot.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output', 'phase56k');

console.log('🧪 Running Phase 56K Targeted External Evidence Acquisition Pilot Tests...');

// 1. Verify all 14 required Phase 56K artifacts exist on disk
const requiredArtifacts = [
  'EXTERNAL_EVIDENCE_PILOT_INPUT.json',
  'SOURCE_DISCOVERY_RESULTS.json',
  'SOURCE_QUALITY_AUDIT.json',
  'EXTERNAL_EVIDENCE_LEDGER.json',
  'EXTERNAL_SECOND_SECTION_CANDIDATES.json',
  'EXTERNAL_EVIDENCE_PROMOTIONS.json',
  'EXTERNAL_EVIDENCE_REJECTIONS.json',
  'SOURCE_YIELD_ANALYSIS.json',
  'WAVE5_UNLOCK_PREVIEW.json',
  'CATALOG_INTEGRITY.json',
  'AMAZON_STATUS.json',
  'GSC_STATUS.json',
  'PHASE56K_SUMMARY.json',
  'PHASE56K_REPORT.md'
];

for (const filename of requiredArtifacts) {
  const fullPath = path.join(outputDir, filename);
  assert.ok(fs.existsSync(fullPath), `Missing required Phase 56K artifact: ${filename}`);
}
console.log('  ✅ All 14 required Phase 56K artifacts exist in output/phase56k/');

// 2. Verify cold read-only dry run determinism
const dryRun = buildPhase56KExternalEvidencePilot({ write: false });
const savedSummary = JSON.parse(fs.readFileSync(path.join(outputDir, 'PHASE56K_SUMMARY.json'), 'utf8'));
assert.deepEqual(dryRun.artifact13Summary, savedSummary, 'Cold run summary must match saved PHASE56K_SUMMARY.json');
assert.equal(dryRun.artifact1PilotInput.selected_pilot_count, MAX_PILOT_TARGETS);
assert.equal(dryRun.artifact1PilotInput.pilot_composition_summary.all_from_existing_110_cohort, true);
assert.equal(dryRun.artifact1PilotInput.pilot_composition_summary.all_commercial_high, true);
console.log('  ✅ Cold read-only dry run and 40-target pilot selection are 100% deterministic');

// 3. Source Contract & Evidence Evaluation Contract Unit Tests
const fixtureTarget = {
  part_number: '96400031600',
  current_resolved_section: 'Crankcase',
  published_models: ['ms_260', 'ms_261', 'ms_361']
};

const baseValidObs = {
  part_number: '9640 003 1600',
  model: 'ms_261',
  raw_section: 'Oil Pump, Clutch',
  source_url: 'https://www.ersatzteil-service.de/stihl-ersatzteile/ms-261/',
  source_title: 'STIHL MS 261 IPL',
  source_type: 'INDEPENDENT_PARTS_CATALOG',
  source_lineage: 'INDEPENDENT_SOURCE',
  retrieved_at: '2026-10-23T18:50:00.000Z',
  evidence_locator: 'Illustration C - Oil Pump, Clutch, Pos. 12',
  exact_scope_match: true
};

// 3a. Actual second section accepted when all contracts pass
const resAccepted = evaluateExternalObservation(baseValidObs, fixtureTarget);
assert.equal(resAccepted.eligible_for_resolution, true);
assert.equal(resAccepted.classification, 'EXTERNAL_SECOND_SECTION_SAFE');
assert.equal(resAccepted.quarantine, false);

// 3b. Provenance & URL/document locator required
const resNoUrl = evaluateExternalObservation({ ...baseValidObs, source_url: '' }, fixtureTarget);
assert.equal(resNoUrl.eligible_for_resolution, false);
assert.equal(resNoUrl.rejection_reason, 'MISSING_REQUIRED_PROVENANCE_OR_LOCATOR');
assert.equal(resNoUrl.quarantine, true);

const resNoLocator = evaluateExternalObservation({ ...baseValidObs, evidence_locator: '' }, fixtureTarget);
assert.equal(resNoLocator.eligible_for_resolution, false);
assert.equal(resNoLocator.rejection_reason, 'MISSING_REQUIRED_PROVENANCE_OR_LOCATOR');

// 3c. Weak / unusable source type rejected
const resWeakSource = evaluateExternalObservation({ ...baseValidObs, source_type: 'SECONDARY_WEAK_SOURCE' }, fixtureTarget);
assert.equal(resWeakSource.eligible_for_resolution, false);
assert.ok(resWeakSource.rejection_reason.startsWith('UNUSABLE_OR_WEAK_SOURCE_TYPE'));

// 3d. Mirror lineage detected & rejected
const resMirror = evaluateExternalObservation({ ...baseValidObs, source_lineage: 'LIKELY_MIRROR' }, fixtureTarget);
assert.equal(resMirror.eligible_for_resolution, false);
assert.equal(resMirror.classification, 'MIRROR_ONLY');

// 3e. Exact part required (MODEL_ONLY when part missing/mismatched)
const resWrongPart = evaluateExternalObservation({ ...baseValidObs, part_number: '11112223333' }, fixtureTarget);
assert.equal(resWrongPart.eligible_for_resolution, false);
assert.equal(resWrongPart.classification, 'MODEL_ONLY');

// 3f. Exact model required & section required (PART_NUMBER_ONLY when model missing/unpublished or section missing)
const resUnpubModel = evaluateExternalObservation({ ...baseValidObs, model: 'fs_400' }, fixtureTarget);
assert.equal(resUnpubModel.eligible_for_resolution, false);
assert.equal(resUnpubModel.classification, 'PART_NUMBER_ONLY');

const resNoSection = evaluateExternalObservation({ ...baseValidObs, raw_section: '' }, fixtureTarget);
assert.equal(resNoSection.eligible_for_resolution, false);
assert.equal(resNoSection.classification, 'PART_NUMBER_ONLY');

// 3g. Exact scope required (CROSS_SCOPE rejected)
const resCrossScope = evaluateExternalObservation({ ...baseValidObs, exact_scope_match: false }, fixtureTarget);
assert.equal(resCrossScope.eligible_for_resolution, false);
assert.equal(resCrossScope.classification, 'CROSS_SCOPE');

// 3h. Same-section & semantic alias duplicate rejected
const resSameSection = evaluateExternalObservation({ ...baseValidObs, raw_section: 'Crankcase' }, fixtureTarget);
assert.equal(resSameSection.eligible_for_resolution, false);
assert.equal(resSameSection.classification, 'SAME_SECTION_ONLY');

assert.equal(areSectionsSemanticallyEquivalentOrCombinedAlias('Ignition', 'Ignition System'), true);
assert.equal(areSectionsSemanticallyEquivalentOrCombinedAlias('Air Filter a', 'Air Filter'), true);
assert.equal(areSectionsSemanticallyEquivalentOrCombinedAlias('A-Crankcase, Cylinder', 'Crankcase, Cylinder'), true);
assert.equal(areSectionsSemanticallyEquivalentOrCombinedAlias('J-Gear Head, Drive Tube FS 80', 'Gear Head - Deflector'), true);
assert.equal(areSectionsSemanticallyEquivalentOrCombinedAlias('Crankcase', 'Muffler'), false);

// 3i. Ambiguous combined-sheet header quarantined
const resCombinedAmbiguous = evaluateExternalObservation(
  { ...baseValidObs, raw_section: 'Crankcase / Cylinder' },
  { ...fixtureTarget, current_resolved_section: 'Cylinder' }
);
assert.equal(resCombinedAmbiguous.eligible_for_resolution, false);
assert.equal(resCombinedAmbiguous.classification, 'AMBIGUOUS');
assert.equal(resCombinedAmbiguous.quarantine, true);
console.log('  ✅ Source contract & evidence evaluation unit tests passed (all positive & negative branches verified)');

// 4. Verify Pilot Classification & Ledger Totals
const candDoc = dryRun.artifact5Candidates;
assert.equal(candDoc.total_pilot_targets_evaluated, 40);
assert.equal(candDoc.classification_summary.EXTERNAL_SECOND_SECTION_SAFE, 0);
assert.equal(candDoc.classification_summary.PART_NUMBER_ONLY, 3);
assert.equal(candDoc.classification_summary.NOT_FOUND, 37);
assert.equal(candDoc.classification_summary.SAME_SECTION_ONLY, 0);
assert.equal(candDoc.classification_summary.CROSS_SCOPE, 0);
assert.equal(candDoc.classification_summary.AMBIGUOUS, 0);
assert.equal(candDoc.classification_summary.MIRROR_ONLY, 0);
assert.equal(candDoc.classification_summary.MODEL_ONLY, 0);
assert.equal(
  Object.values(candDoc.classification_summary).reduce((a, b) => a + b, 0),
  40,
  'Pilot candidate classifications must sum to 40'
);
assert.equal(dryRun.artifact6Promotions.outcome_code, 'ZERO_SAFE_EXTERNAL_SECOND_SECTIONS');
assert.equal(dryRun.artifact6Promotions.promoted_targets_count, 0);
assert.equal(dryRun.artifact7Rejections.quarantined_ambiguous_observations_count, 0);
assert.equal(dryRun.artifact7Rejections.rejected_targets_count, 40);
assert.equal(AUDITED_EXTERNAL_DOMAINS.length, 12);
console.log('  ✅ Pilot classification & ledger totals verified (40 targets: 3 PART_NUMBER_ONLY, 37 NOT_FOUND, 0 safe second sections)');

// 5. Historical Protection Tests (Phase 56H & Phase 56J)
resetSectionResolutionCache();
const regStats = SectionResolutionRegistry.getRegistryStats();
assert.equal(regStats.rule_a_resolutions_count, 10, 'Phase 56H 10 Rule A resolutions must remain intact');
assert.equal(regStats.total_context_rows, 814, 'Canonical 814 multi-section contexts must remain intact');
assert.equal(dryRun.artifact10CatalogIntegrity.historical_protection.phase56h_resolutions_intact_count, 344);
assert.equal(dryRun.artifact10CatalogIntegrity.historical_protection.phase56j_classifications_intact_count, 110);
assert.equal(dryRun.artifact10CatalogIntegrity.historical_protection.evidence_loss, 0);
console.log('  ✅ Historical protection verified (344 Phase 56H resolutions, 110 Phase 56J classifications, 814 contexts intact)');

// 6. SEO Freeze & Sitemap Invariants
resetRegistryCache();
const allIndexable = getAllIndexablePartsList();
assert.equal(allIndexable.length, 843, 'Indexable part pages must remain frozen at 843');
const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, stihlDb);
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
assert.equal(sitemapUrls.length, 1024, 'Sitemap URLs must remain frozen at 1,024');
assert.equal(dryRun.artifact9Wave5Preview.wave5_activated_in_56k, false);
console.log('  ✅ SEO freeze verified (843 indexable part pages, 1,024 sitemap URLs, no Wave 5 activation)');

// 7. Catalog & Affiliate Invariants
const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
assert.equal(db.prepare('SELECT COUNT(*) as c FROM parts').get().c, 17082);
assert.equal(db.prepare('SELECT COUNT(*) as c FROM model_part_fitments').get().c, 175106);
assert.equal(db.prepare('SELECT COUNT(*) as c FROM parts_model_configurations').get().c, 766);
assert.equal(db.prepare('SELECT COUNT(*) as c FROM part_fitment_evidence').get().c, 208412);
assert.equal(db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c, 814);
db.close();

assert.equal(dryRun.artifact11AmazonStatus.production_tag, 'srihldecoder2-21');
assert.equal(dryRun.artifact11AmazonStatus.search_fallbacks_count, 17082);
assert.equal(dryRun.artifact11AmazonStatus.verified_asin_count, 0);
assert.equal(dryRun.artifact11AmazonStatus.ab_query_experiment.all_17082_variant_a, 8518);
assert.equal(dryRun.artifact11AmazonStatus.ab_query_experiment.all_17082_variant_b, 8564);
assert.equal(dryRun.artifact12GscStatus.gsc_status, 'NOT_CONFIGURED');
console.log('  ✅ Catalog, Amazon affiliate, and GSC invariants verified');

console.log('🎉 ALL PHASE 56K TESTS PASSED!');
