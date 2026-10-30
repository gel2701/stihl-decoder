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

// 1. Verify all 16 required Phase 56K artifacts exist on disk
const requiredArtifacts = [
  'EXTERNAL_EVIDENCE_PILOT_INPUT.json',
  'SOURCE_DISCOVERY_RESULTS.json',
  'DISCOVERY_LEADS.json',
  'SOURCE_QUALITY_AUDIT.json',
  'EXTERNAL_EVIDENCE_LEDGER.json',
  'EXTERNAL_SECOND_SECTION_CANDIDATES.json',
  'EXTERNAL_EVIDENCE_PROMOTIONS.json',
  'EXTERNAL_EVIDENCE_REJECTIONS.json',
  'SOURCE_YIELD_ANALYSIS.json',
  'WAVE5_UNLOCK_PREVIEW.json',
  'PROVENANCE_INTEGRITY_AUDIT.json',
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
console.log('  ✅ All 16 required Phase 56K artifacts exist in output/phase56k/');

// 2. Verify cold read-only dry run determinism & saved artifact deep equality
const dryRun = buildPhase56KExternalEvidencePilot({ write: false });

// 2a. Saved Ledger Validation
const savedLedger = JSON.parse(fs.readFileSync(path.join(outputDir, 'EXTERNAL_EVIDENCE_LEDGER.json'), 'utf8'));
assert.deepEqual(
  savedLedger,
  dryRun.artifact5Ledger,
  'Saved EXTERNAL_EVIDENCE_LEDGER.json must exactly match regenerated canonical ledger'
);

// 2b. Saved Provenance Audit Validation
const savedProvenanceAudit = JSON.parse(fs.readFileSync(path.join(outputDir, 'PROVENANCE_INTEGRITY_AUDIT.json'), 'utf8'));
assert.deepEqual(
  savedProvenanceAudit,
  dryRun.artifact11ProvenanceIntegrity,
  'Saved PROVENANCE_INTEGRITY_AUDIT.json must exactly match regenerated canonical provenance audit'
);

// 2c. Protected Saved Artifacts Deep Equality
const savedDiscoveryLeads = JSON.parse(fs.readFileSync(path.join(outputDir, 'DISCOVERY_LEADS.json'), 'utf8'));
assert.deepEqual(savedDiscoveryLeads, dryRun.artifact3DiscoveryLeads, 'Saved DISCOVERY_LEADS.json must match regenerated');

const savedCandidates = JSON.parse(fs.readFileSync(path.join(outputDir, 'EXTERNAL_SECOND_SECTION_CANDIDATES.json'), 'utf8'));
assert.deepEqual(savedCandidates, dryRun.artifact6Candidates, 'Saved EXTERNAL_SECOND_SECTION_CANDIDATES.json must match regenerated');

const savedPromotions = JSON.parse(fs.readFileSync(path.join(outputDir, 'EXTERNAL_EVIDENCE_PROMOTIONS.json'), 'utf8'));
assert.deepEqual(savedPromotions, dryRun.artifact7Promotions, 'Saved EXTERNAL_EVIDENCE_PROMOTIONS.json must match regenerated');

const savedRejections = JSON.parse(fs.readFileSync(path.join(outputDir, 'EXTERNAL_EVIDENCE_REJECTIONS.json'), 'utf8'));
assert.deepEqual(savedRejections, dryRun.artifact8Rejections, 'Saved EXTERNAL_EVIDENCE_REJECTIONS.json must match regenerated');

const savedCatalogIntegrity = JSON.parse(fs.readFileSync(path.join(outputDir, 'CATALOG_INTEGRITY.json'), 'utf8'));
assert.deepEqual(savedCatalogIntegrity, dryRun.artifact12CatalogIntegrity, 'Saved CATALOG_INTEGRITY.json must match regenerated');

const savedSummary = JSON.parse(fs.readFileSync(path.join(outputDir, 'PHASE56K_SUMMARY.json'), 'utf8'));
assert.deepEqual(savedSummary, dryRun.artifact15Summary, 'Cold run summary must match saved PHASE56K_SUMMARY.json');

const savedPilotInput = JSON.parse(fs.readFileSync(path.join(outputDir, 'EXTERNAL_EVIDENCE_PILOT_INPUT.json'), 'utf8'));
assert.deepEqual(savedPilotInput, dryRun.artifact1PilotInput, 'Saved EXTERNAL_EVIDENCE_PILOT_INPUT.json must match regenerated');

const savedDiscoveryResults = JSON.parse(fs.readFileSync(path.join(outputDir, 'SOURCE_DISCOVERY_RESULTS.json'), 'utf8'));
assert.deepEqual(savedDiscoveryResults, dryRun.artifact2DiscoveryResults, 'Saved SOURCE_DISCOVERY_RESULTS.json must match regenerated');

const savedQualityAudit = JSON.parse(fs.readFileSync(path.join(outputDir, 'SOURCE_QUALITY_AUDIT.json'), 'utf8'));
assert.deepEqual(savedQualityAudit, dryRun.artifact4SourceQuality, 'Saved SOURCE_QUALITY_AUDIT.json must match regenerated');

const savedYieldAnalysis = JSON.parse(fs.readFileSync(path.join(outputDir, 'SOURCE_YIELD_ANALYSIS.json'), 'utf8'));
assert.deepEqual(savedYieldAnalysis, dryRun.artifact9SourceYield, 'Saved SOURCE_YIELD_ANALYSIS.json must match regenerated');

const savedWave5Preview = JSON.parse(fs.readFileSync(path.join(outputDir, 'WAVE5_UNLOCK_PREVIEW.json'), 'utf8'));
assert.deepEqual(savedWave5Preview, dryRun.artifact10Wave5Preview, 'Saved WAVE5_UNLOCK_PREVIEW.json must match regenerated');

const savedAmazonStatus = JSON.parse(fs.readFileSync(path.join(outputDir, 'AMAZON_STATUS.json'), 'utf8'));
assert.deepEqual(savedAmazonStatus, dryRun.artifact13AmazonStatus, 'Saved AMAZON_STATUS.json must match regenerated');

const savedGscStatus = JSON.parse(fs.readFileSync(path.join(outputDir, 'GSC_STATUS.json'), 'utf8'));
assert.deepEqual(savedGscStatus, dryRun.artifact14GscStatus, 'Saved GSC_STATUS.json must match regenerated');

const savedReportMd = fs.readFileSync(path.join(outputDir, 'PHASE56K_REPORT.md'), 'utf8');
assert.equal(savedReportMd, dryRun.artifact16Report, 'Saved PHASE56K_REPORT.md must match regenerated report markdown');

assert.equal(dryRun.artifact1PilotInput.selected_pilot_count, MAX_PILOT_TARGETS);
assert.equal(dryRun.artifact1PilotInput.pilot_composition_summary.all_from_existing_110_cohort, true);
assert.equal(dryRun.artifact1PilotInput.pilot_composition_summary.all_commercial_high, true);
console.log('  ✅ Saved artifacts vs regenerated canonical outputs are 100% equivalent across all 16 artifacts');

// 2d. Negative Drift Detection Unit Tests
{
  const clonedLedger = JSON.parse(JSON.stringify(dryRun.artifact5Ledger));

  // Drift in source_url
  clonedLedger.observations[0].source_url = 'https://tampered-url.com/stihl';
  assert.throws(() => {
    assert.deepEqual(clonedLedger, dryRun.artifact5Ledger);
  }, /AssertionError/, 'Drift in source_url must fail deep equality');

  // Drift in retrieved_at
  const clonedLedger2 = JSON.parse(JSON.stringify(dryRun.artifact5Ledger));
  clonedLedger2.observations[0].retrieved_at = '1970-01-01T00:00:00.000Z';
  assert.throws(() => {
    assert.deepEqual(clonedLedger2, dryRun.artifact5Ledger);
  }, /AssertionError/, 'Drift in retrieved_at must fail deep equality');

  // Drift in source_body_sha256
  const clonedLedger3 = JSON.parse(JSON.stringify(dryRun.artifact5Ledger));
  clonedLedger3.observations[0].source_body_sha256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  assert.throws(() => {
    assert.deepEqual(clonedLedger3, dryRun.artifact5Ledger);
  }, /AssertionError/, 'Drift in source_body_sha256 must fail deep equality');

  // Drift in evidence_locator
  const clonedLedger4 = JSON.parse(JSON.stringify(dryRun.artifact5Ledger));
  clonedLedger4.observations[0].evidence_locator = 'Tampered locator string';
  assert.throws(() => {
    assert.deepEqual(clonedLedger4, dryRun.artifact5Ledger);
  }, /AssertionError/, 'Drift in evidence_locator must fail deep equality');

  // Drift in SAVED_ARTIFACTS_MATCH_REGENERATED
  const clonedAudit = JSON.parse(JSON.stringify(dryRun.artifact11ProvenanceIntegrity));
  clonedAudit.SAVED_ARTIFACTS_MATCH_REGENERATED = false;
  assert.throws(() => {
    assert.deepEqual(clonedAudit, dryRun.artifact11ProvenanceIntegrity);
  }, /AssertionError/, 'Drift in SAVED_ARTIFACTS_MATCH_REGENERATED must fail deep equality');

  console.log('  ✅ Negative drift detection unit tests passed (URL, timestamp, SHA hash, locator, and gate drift detected)');
}

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
const candDoc = dryRun.artifact6Candidates;
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
assert.equal(dryRun.artifact7Promotions.outcome_code, 'ZERO_SAFE_EXTERNAL_SECOND_SECTIONS');
assert.equal(dryRun.artifact7Promotions.promoted_targets_count, 0);
assert.equal(dryRun.artifact8Rejections.quarantined_ambiguous_observations_count, 0);
assert.equal(dryRun.artifact8Rejections.rejected_targets_count, 40);
assert.equal(AUDITED_EXTERNAL_DOMAINS.length, 12);
console.log('  ✅ Pilot classification & ledger totals verified (40 targets: 3 PART_NUMBER_ONLY, 37 NOT_FOUND, 0 safe second sections)');

// 5. Provenance Integrity & Audit Hardening (Phase 56K.1 / Phase 56K.2 Gates)
const provAudit = dryRun.artifact11ProvenanceIntegrity;
assert.equal(provAudit.status, 'PASS', 'Provenance integrity status must be PASS');
assert.equal(provAudit.FABRICATED_PROVENANCE_RECORDS, 0, 'FABRICATED_PROVENANCE_RECORDS must be strictly 0');
assert.equal(provAudit.SAVED_ARTIFACTS_MATCH_REGENERATED, true, 'SAVED_ARTIFACTS_MATCH_REGENERATED must be true');
assert.equal(savedProvenanceAudit.FABRICATED_PROVENANCE_RECORDS, 0, 'Saved audit FABRICATED_PROVENANCE_RECORDS must be 0');
assert.equal(savedProvenanceAudit.SAVED_ARTIFACTS_MATCH_REGENERATED, true, 'Saved audit SAVED_ARTIFACTS_MATCH_REGENERATED must be true');
assert.equal(dryRun.artifact15Summary.provenance_integrity.SAVED_ARTIFACTS_MATCH_REGENERATED, true, 'Summary SAVED_ARTIFACTS_MATCH_REGENERATED must be true');
assert.equal(savedSummary.provenance_integrity.SAVED_ARTIFACTS_MATCH_REGENERATED, true, 'Saved summary SAVED_ARTIFACTS_MATCH_REGENERATED must be true');
assert.equal(provAudit.synthetic_observations_detected, 0, 'No synthetic observations allowed');
assert.equal(provAudit.unverifiable_records, 0, 'No unverifiable records allowed');
assert.equal(provAudit.technical_evidence_records_checked, 6, 'All 6 observations must be checked');
assert.equal(provAudit.verified_source_urls, 6);
assert.equal(provAudit.verified_titles, 6);
assert.equal(provAudit.verified_locators, 6);
assert.equal(provAudit.verified_body_hashes, 6);
assert.equal(provAudit.verified_retrieval_timestamps, 6);

// 5a. Fetch ledger linkage and per-page timestamps
const rawFetchLedger = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'harvest', 'phase56k', 'fetch_ledger.json'), 'utf8'));
assert.ok(rawFetchLedger.started_at, 'Fetch ledger started_at must be present');
const allFetchedPages = (rawFetchLedger.targets || []).flatMap(t => t.pages || []);

for (const obs of dryRun.artifact5Ledger.observations) {
  assert.ok(obs.retrieved_at, 'Observation must have retrieved_at');
  assert.notEqual(
    obs.retrieved_at,
    rawFetchLedger.started_at,
    `Observation retrieved_at (${obs.retrieved_at}) must be per-request timestamp, not fetchLedger.started_at`
  );
  assert.ok(!isNaN(Date.parse(obs.retrieved_at)), 'retrieved_at must be valid ISO timestamp');

  const matchingPage = allFetchedPages.find(p => p.requested_url === obs.source_url || p.final_url === obs.source_url);
  assert.ok(matchingPage, `Observation source_url ${obs.source_url} must exist in fetch_ledger.json`);
  assert.equal(matchingPage.fetch_outcome, 'FETCHED', 'Matching page must have fetch_outcome FETCHED');
  assert.equal(obs.source_body_sha256, matchingPage.body_sha256, 'Observation body sha256 must match fetch_ledger body sha256');
  assert.equal(obs.retrieved_at, matchingPage.retrieved_at, 'Observation retrieved_at must match fetch_ledger page retrieved_at');
  assert.ok(obs.evidence_locator.includes(matchingPage.body_sha256.substring(0, 8)), 'Evidence locator must reference body SHA prefix');
}

// 5b. Discovery Leads isolation
assert.equal(dryRun.artifact3DiscoveryLeads.all_eligible_for_resolution_false, true, 'All discovery leads must have eligible_for_resolution === false');
for (const lead of dryRun.artifact3DiscoveryLeads.leads) {
  assert.equal(lead.eligible_for_resolution, false, 'Discovery lead must not be eligible for resolution');
}
console.log('  ✅ Provenance integrity & audit hardening verified (0 fabricated records, per-page timestamps, full ledger linkage, discovery isolation)');

// 6. Historical Protection Tests (Phase 56H & Phase 56J)
resetSectionResolutionCache();
const regStats = SectionResolutionRegistry.getRegistryStats();
assert.equal(regStats.rule_a_resolutions_count, 10, 'Phase 56H 10 Rule A resolutions must remain intact');
assert.equal(regStats.total_context_rows, 814, 'Canonical 814 multi-section contexts must remain intact');
assert.equal(dryRun.artifact12CatalogIntegrity.historical_protection.phase56h_resolutions_intact_count, 344);
assert.equal(dryRun.artifact12CatalogIntegrity.historical_protection.phase56j_classifications_intact_count, 110);
assert.equal(dryRun.artifact12CatalogIntegrity.historical_protection.evidence_loss, 0);
console.log('  ✅ Historical protection verified (344 Phase 56H resolutions, 110 Phase 56J classifications, 814 contexts intact)');

// 7. SEO Freeze & Sitemap Invariants
resetRegistryCache();
const allIndexable = getAllIndexablePartsList();
assert.equal(allIndexable.length, 843, 'Indexable part pages must remain frozen at 843');
const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));
const sitemapXml = generateSitemapXml(PRIMARY_ORIGIN, stihlDb);
const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
assert.equal(sitemapUrls.length, 1024, 'Sitemap URLs must remain frozen at 1,024');
assert.equal(dryRun.artifact10Wave5Preview.wave5_activated_in_56k, false);
console.log('  ✅ SEO freeze verified (843 indexable part pages, 1,024 sitemap URLs, no Wave 5 activation)');

// 8. Catalog & Affiliate Invariants
const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
assert.equal(db.prepare("SELECT COUNT(*) as c FROM parts WHERE sources != '[\"ghs\"]'").get().c, 17082);
assert.equal(db.prepare("SELECT COUNT(*) as c FROM model_part_fitments WHERE source_id != 'ghs'").get().c, 175106);
assert.equal(db.prepare("SELECT COUNT(*) as c FROM parts_model_configurations WHERE source_url NOT LIKE '%gardenhirespares.co.uk%'").get().c, 766);
assert.equal(db.prepare("SELECT COUNT(*) as c FROM part_fitment_evidence WHERE source_id != 'ghs'").get().c, 208412);
assert.equal(db.prepare('SELECT COUNT(*) as c FROM model_part_fitment_section_contexts').get().c, 814);
db.close();

assert.equal(dryRun.artifact13AmazonStatus.production_tag, 'srihldecoder2-21');
assert.equal(dryRun.artifact13AmazonStatus.search_fallbacks_count, 17082);
assert.equal(dryRun.artifact13AmazonStatus.verified_asin_count, 0);
assert.equal(dryRun.artifact13AmazonStatus.ab_query_experiment.all_17082_variant_a, 8518);
assert.equal(dryRun.artifact13AmazonStatus.ab_query_experiment.all_17082_variant_b, 8564);
assert.equal(dryRun.artifact14GscStatus.gsc_status, 'NOT_CONFIGURED');
console.log('  ✅ Catalog, Amazon affiliate, and GSC invariants verified');

console.log('🎉 ALL PHASE 56K TESTS PASSED!');
