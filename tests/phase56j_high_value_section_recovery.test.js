/**
 * Phase 56J — High-Value Single-Section Evidence Recovery Test Suite
 *
 * Verifies:
 *   1. Targetset determinism (exact 110 COMMERCIAL_HIGH single-section targets reconstructed)
 *   2. Evidence classification contracts (S1–S4, source independence, cross-scope rejection, same-section duplicate rejection)
 *   3. Resolution & Phase 56H preservation (344 resolutions intact, 814 multi-section contexts intact, deterministic cold reload)
 *   4. SEO freeze (no Wave 5 activation, indexable parts = 843, sitemap URLs = 1,024)
 *   5. Catalog invariants (parts = 17,082, fitments = 175,106, configurations = 766, 0 leakage)
 *   6. Affiliate invariants (17,082 tagged search fallbacks, tag = srihldecoder2-21, A/B query split intact)
 */

import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PRIMARY_ORIGIN } from '../src/config.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import {
  SectionResolutionRegistry,
  resetSectionResolutionCache
} from '../src/parts/SectionResolutionRegistry.js';
import {
  resetRegistryCache,
  getAllIndexablePartsList,
  getPilotPartsList,
  getExpansionCohortList,
  getWave2CohortList,
  getWave3CohortList,
  getWave4CohortList
} from '../src/seo/PartIndexationRegistry.js';
import { generateSitemapXml } from '../src/components/SitemapGenerator.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { getDeterministicQueryVariant, QUERY_VARIANTS } from '../src/affiliate/AmazonAffiliateProvider.js';
import { buildPhase56JEvidenceRecovery } from '../scripts/build_phase56j_evidence_recovery.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output', 'phase56j');

console.log('🧪 Running Phase 56J High-Value Single-Section Evidence Recovery Tests...');

// 1. Verify all 14 required Phase 56J artifacts exist on disk
const requiredArtifacts = [
  'HIGH_VALUE_SINGLE_SECTION_BASELINE.json',
  'TARGET_SOURCE_INVENTORY.json',
  'SECOND_SECTION_EVIDENCE_CLASSIFICATION.json',
  'SECOND_SECTION_CANDIDATES.json',
  'SECOND_SECTION_PROMOTIONS.json',
  'SECOND_SECTION_BLOCKED.json',
  'SECOND_SECTION_CONFLICTS.json',
  'WAVE5_UNLOCK_AFTER_EVIDENCE_RECOVERY.json',
  'HIGH_VALUE_MODEL_IMPACT.json',
  'HIGH_VALUE_CATEGORY_IMPACT.json',
  'GSC_STATUS.json',
  'AMAZON_STATUS.json',
  'PHASE56J_SUMMARY.json',
  'PHASE56J_REPORT.md'
];

for (const filename of requiredArtifacts) {
  const fullPath = path.join(outputDir, filename);
  assert.ok(fs.existsSync(fullPath), `Missing required Phase 56J artifact: ${filename}`);
}
console.log('  ✅ All 14 required Phase 56J artifacts exist in output/phase56j/');

// 2. Run read-only builder and verify deterministic parity with saved artifacts
const dryRun = buildPhase56JEvidenceRecovery({ write: false });
const savedSummary = JSON.parse(fs.readFileSync(path.join(outputDir, 'PHASE56J_SUMMARY.json'), 'utf8'));
assert.deepEqual(dryRun.artifact13Summary, savedSummary, 'Cold run summary must match saved PHASE56J_SUMMARY.json');
console.log('  ✅ Cold read-only dry run is 100% deterministic');

// 3. Targetset Tests (110 high-value single-section parts)
const baselineDoc = dryRun.artifact1Baseline;
assert.equal(baselineDoc.target_cohort_summary.total_targets, 110, 'Target cohort must contain exactly 110 parts');
assert.equal(baselineDoc.targets.length, 110);
assert.equal(baselineDoc.phase56i_wave5_preflight_alignment.exact_match_with_56i_sample_25, true, 'First 25 targets must match Phase 56I WAVE5_PREFLIGHT sample verbatim');
assert.equal(baselineDoc.target_cohort_summary.all_commercial_high, true, 'All 110 targets must be COMMERCIAL_HIGH');
assert.equal(baselineDoc.target_cohort_summary.all_have_1_resolved_section, true, 'All 110 targets must have exactly 1 resolved section');
assert.equal(baselineDoc.target_cohort_summary.all_have_meaningful_position, true, 'All 110 targets must have a meaningful diagram position');
assert.equal(baselineDoc.target_cohort_summary.all_have_clean_name, true, 'All 110 targets must have a clean technical name');
assert.equal(baselineDoc.target_cohort_summary.zero_generic_hardware, true, 'Zero generic fastening hardware allowed in 110 targets');
for (const t of baselineDoc.targets) {
  assert.equal(t.current_h1_to_h7_status.sole_blocker, 'H3_ONLY_1_RESOLVED_SECTION');
}
console.log('  ✅ Targetset tests passed (110 COMMERCIAL_HIGH single-section wear parts verified)');

// 4. Evidence Classification Tests (Rules S1–S4)
const classDoc = dryRun.artifact3Classification;
assert.equal(classDoc.total_classified, 110);
assert.equal(classDoc.classification_summary.SECOND_SECTION_SAFE, 0);
assert.equal(classDoc.classification_summary.MULTI_SECTION_SAFE, 0);
assert.equal(classDoc.classification_summary.CROSS_SCOPE_BLOCKED, 57);
assert.equal(classDoc.classification_summary.ONLY_SAME_SECTION_DUPLICATES, 42);
assert.equal(classDoc.classification_summary.CONFLICTING_EVIDENCE, 0);
assert.equal(classDoc.classification_summary.INSUFFICIENT_EVIDENCE, 11);
assert.equal(
  classDoc.classification_summary.SECOND_SECTION_SAFE +
  classDoc.classification_summary.MULTI_SECTION_SAFE +
  classDoc.classification_summary.CROSS_SCOPE_BLOCKED +
  classDoc.classification_summary.ONLY_SAME_SECTION_DUPLICATES +
  classDoc.classification_summary.CONFLICTING_EVIDENCE +
  classDoc.classification_summary.INSUFFICIENT_EVIDENCE,
  110,
  'Classification counts must sum to 110'
);

// Verify deep-dive blocked candidates 95030030242 and 96400031195
const rec9503 = classDoc.classifications.find(c => c.part_number === '95030030242');
const rec9640 = classDoc.classifications.find(c => c.part_number === '96400031195');
assert.ok(rec9503 && rec9503.classification === 'CROSS_SCOPE_BLOCKED', '95030030242 must be CROSS_SCOPE_BLOCKED');
assert.ok(rec9640 && rec9640.classification === 'CROSS_SCOPE_BLOCKED', '96400031195 must be CROSS_SCOPE_BLOCKED');
assert.equal(rec9503.candidate_second_sections_evaluated.length, 2);
assert.equal(rec9640.candidate_second_sections_evaluated.length, 2);
console.log('  ✅ Evidence classification tests passed (0 safe 2nd sections, 57 cross-scope blocked, 42 same-section duplicates, 11 insufficient evidence)');

// 5. Resolution & Phase 56H Preservation Tests
resetSectionResolutionCache();
const regStats = SectionResolutionRegistry.getRegistryStats();
assert.equal(regStats.rule_a_resolutions_count, 10, 'Phase 56H 10 Rule A explicit resolutions must remain intact');
assert.equal(regStats.total_context_rows, 814, 'Canonical 814 multi-section contexts must remain intact');
assert.equal(regStats.context_fitments_count, 338, 'Canonical 338 multi-section fitments must remain intact');
assert.equal(dryRun.artifact5Promotions.phase56h_resolutions_preserved_count, 344, 'All 344 Phase 56H resolved fitments must remain preserved');
assert.equal(dryRun.artifact5Promotions.promoted_parts_count, 0);
assert.equal(dryRun.artifact5Promotions.zero_guessed_sections, true);
assert.equal(dryRun.artifact5Promotions.zero_variant_leakage, true);
assert.equal(dryRun.artifact5Promotions.zero_configuration_leakage, true);
console.log('  ✅ Resolution & Phase 56H preservation tests passed (344 resolutions & 814 contexts 100% intact)');

// 6. SEO Freeze Tests (No Wave 5 activation in Phase 56J)
resetRegistryCache();
const allIndexable = getAllIndexablePartsList();
assert.equal(allIndexable.length, 843, 'Indexable part pages must remain frozen at 843');
assert.equal(getPilotPartsList().length, 50);
assert.equal(getExpansionCohortList().length, 350);
assert.equal(getWave2CohortList().length, 400);
assert.equal(getWave3CohortList().length, 4);
assert.equal(getWave4CohortList().length, 39);

const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, stihlDb);
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
assert.equal(sitemapUrls.length, 1024, 'Sitemap URL count must remain frozen at 1,024');
assert.equal(dryRun.artifact8Wave5Unlock.seo_freeze_verified.wave5_activated_in_56j, false);
console.log('  ✅ SEO freeze tests passed (843 indexable parts, 1,024 sitemap URLs, Wave 5 not activated)');

// 7. Catalog Invariant Tests
const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
assert.equal(db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c, 17082);
assert.equal(db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c, 175106);
assert.equal(db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c, 766);
assert.equal(db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c, 208412);
assert.equal(db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c, 814);
db.close();
console.log('  ✅ Canonical SQLite database invariants verified (17,082 parts / 175,106 fitments / 766 configs / 208,412 evidence / 814 contexts)');

// 8. Affiliate Invariant Tests
process.env.AMAZON_AFFILIATE_ENABLED = 'true';
process.env.AMAZON_ASSOCIATE_TAG = 'srihldecoder2-21';
delete process.env.AMAZON_ASSOCIATE_TAG_DE;

assert.equal(dryRun.artifact12AmazonStatus.production_tag, 'srihldecoder2-21');
assert.equal(dryRun.artifact12AmazonStatus.amazon_search_fallbacks_count, 17082);
assert.equal(dryRun.artifact12AmazonStatus.verified_asin_mappings_count, 0);
assert.equal(dryRun.artifact12AmazonStatus.ab_query_variant_experiment.all_110_targets_have_valid_tagged_fallback, true);
assert.equal(
  dryRun.artifact12AmazonStatus.ab_query_variant_experiment.target_110_variant_a_count +
  dryRun.artifact12AmazonStatus.ab_query_variant_experiment.target_110_variant_b_count,
  110
);

for (const sampleTarget of baselineDoc.targets.slice(0, 10)) {
  const offers = AffiliateOfferResolver.resolveOffers({
    partNumber: sampleTarget.part_number,
    partName: sampleTarget.clean_name,
    model: sampleTarget.published_models[0]
  });
  assert.ok(offers.length > 0);
  assert.ok(offers[0].url.includes('tag=srihldecoder2-21'));
  assert.equal(offers[0].is_verified, false);
  assert.equal(offers[0].match_type, 'SEARCH_LINK');
  const qv = getDeterministicQueryVariant(PartNormalizer.normalizePartNumber(sampleTarget.part_number));
  assert.ok(qv === QUERY_VARIANTS.VARIANT_A || qv === QUERY_VARIANTS.VARIANT_B);
}
console.log('  ✅ Affiliate invariant tests passed (17,082 tagged search fallbacks, tag srihldecoder2-21, 0 unverified ASINs)');

console.log('🎉 ALL PHASE 56J TESTS PASSED!');
