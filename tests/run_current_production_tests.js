/**
 * Canonical Current Production Test Runner for STIHL Decoder
 *
 * Executes all active production contracts, baseline suites, canonical policies,
 * serial recovery validations, and official anchor resolution suites.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Ensure SQLite database is initialized
const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
if (!fs.existsSync(dbPath)) {
  console.log('📦 Seeding SQLite database from canonical JSON before running tests...');
  spawnSync(process.execPath, ['data/seed.cjs'], { cwd: rootDir, stdio: 'inherit' });
}

export const currentProductionSuites = [
  'tests/official_serial_anchor_and_range_semantics.test.js',
  'tests/serial_decoder_recovery_current.test.js',
  'tests/baseline.test.js',
  'tests/canonical_policy.test.js',
  'tests/phase36_serial_user_value_engine.test.js',
  'tests/render_www_alignment.test.js',
  'tests/production_validation.test.js',
  'tests/decoder.test.js',
  'tests/model_first_passport.test.js',
  'tests/passport_serial_enrichment.test.js',
  'tests/affiliate_foundation.test.js',
  'tests/passport_hardening.test.js',
  'tests/evidence_integrity_hardening.test.js',
  'tests/phase49a_user_trust.test.js',
  'tests/phase49a_drive_context.test.js',
  'tests/phase49a_content_quality.test.js',
  'tests/phase49a_part_series_routes.test.js',
  'tests/homepage_browser_module_graph.test.js',
  'tests/sitewide_google_analytics.test.js',
  'tests/critical_api_contracts.test.js',
  'tests/phase49b_guide_content.test.js',
  'tests/phase49b_guide_safety.test.js',
  'tests/phase49b_guide_sources.test.js',
  'tests/phase49b_guide_links.test.js',
  'tests/phase51_official_serial_evidence.test.js',
  'tests/phase51b_official_serial_aliases.test.js',
  'tests/phase52a_parts_harvester.test.js',
  'tests/phase52b_full_parts_catalog.test.js',
  'tests/phase52c_parts_production_integration.test.js',
  'tests/phase53a_serial_evidence_import.test.js',
  'tests/phase53a_reproducibility.test.js',
  'tests/phase54a_parts_amazon_affiliate.test.js',
  'tests/phase54a_h_amazon_link_integrity.test.js',
  'tests/phase54b_homepage_parts_ux.test.js',
  'tests/phase54c_parts_seo.test.js',
  'tests/phase54d_part_indexation_pilot.test.js',
  'tests/phase54e_parts_technical_enrichment.test.js',
  'tests/phase54f_controlled_reharvest.test.js',
  'tests/phase54f_b_staging_adjudication.test.js',
  'tests/phase54f_b_r1_promotion_eligibility.test.js',
  'tests/phase54f_c_evidence_escalation.test.js',
  'tests/phase54f_d_multisection_resolution.test.js',
  'tests/phase54f_e_scope_resolution.test.js',
  'tests/phase54f_f_unmasked_evidence.test.js',
  'tests/phase54f_g_duplicate_conflict_resolution.test.js',
  'tests/phase54f_h_backlog_finalization.test.js',
  'tests/phase55a_manual_serial_import.test.js',
  'tests/phase55b_serial_delta.test.js',
  'tests/phase55c_serial_delta.test.js',
  'tests/phase55d_serial_delta.test.js',
  'tests/phase55e_serial_delta.test.js',
  'tests/phase56a_parts_commercial_growth.test.js',
  'tests/phase56b_amazon_exact_match_pilot.test.js',
  'tests/phase56c_affiliate_production_readiness.test.js',
  'tests/phase56d_parts_discovery_seo_wave2.test.js',
  'tests/phase56e_parts_discovery_quality_growth.test.js',
  'tests/phase56f_growth_search_conversion.test.js',
  'tests/phase56g_seo_affiliate_diagrams.test.js',
  'tests/phase56h_section_resolution.test.js',
  'tests/phase56i_wave4_activation.test.js',
  'tests/phase56j_high_value_section_recovery.test.js',
  'tests/phase56k_external_evidence_pilot.test.js',
  'tests/phase56l_drive_type_family_resolution.test.js',
  'tests/phase56m_drive_coverage_triage.test.js',
  'tests/phase56n_machine_eligibility_boundary.test.js',
  'tests/phase56o_re_rm_rma_drive_expansion.test.js',
  'tests/phase56p_mb_drive_expansion.test.js',
  'tests/phase57a_parts_affiliate_linking.test.js'
];

console.log('===============================================================');
console.log('🚀 RUNNING STIHL DECODER CANONICAL CURRENT PRODUCTION SUITE');
console.log('===============================================================\n');

let totalFailures = 0;
const results = [];

for (const suite of currentProductionSuites) {
  console.log(`▶ Executing ${suite}...`);
  const start = Date.now();
  const res = spawnSync(process.execPath, [suite], {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit'
  });
  const duration = Date.now() - start;

  if (res.status === 0) {
    console.log(`✅ ${suite} PASSED (${duration}ms)\n`);
    results.push({ suite, status: 'PASS', duration });
  } else {
    console.error(`❌ ${suite} FAILED with exit code ${res.status} (${duration}ms)\n`);
    results.push({ suite, status: 'FAIL', duration, exitCode: res.status });
    totalFailures++;
  }
}

console.log('===============================================================');
console.log('📊 PRODUCTION SUITE SUMMARY');
console.log('===============================================================');
for (const r of results) {
  console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.suite} [${r.status}] (${r.duration}ms)`);
}
console.log('---------------------------------------------------------------');
console.log(`Total Suites: ${results.length} | Passed: ${results.length - totalFailures} | Failed: ${totalFailures}`);
console.log('===============================================================\n');

if (totalFailures > 0) {
  console.error(`🚨 PRODUCTION SUITE FAILURE: ${totalFailures} suite(s) failed.`);
  process.exit(1);
} else {
  console.log('🎉 ALL CURRENT PRODUCTION SUITES PASSED 100% CLEANLY!');
  process.exit(0);
}
