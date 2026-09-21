/**
 * tests/phase46a_remaining_route_ready_audit.test.js
 * Verification suite for Phase 46A:
 * BR Tier 2 Remaining Existing-Route Identity Review & Wave 2 Definition
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import crypto from 'crypto';

// Baseline Hashes computed at start of Phase 46A
const EXPECTED_HASHES = {
  db: '1cc7bad5a5409f0d476af1953b98c607d7e752e78eef03670b506ae8f1ea79f9',
  facts: '0d8efa841591b2fd27869e27d989620f8b2159f53f1b82cfe7dea9db67094d80',
  manifest: '0e43116248bf4e83fc0cfdc0f9b32895b86622a6e8328029ff09ef3145769f8e',
  packageJson: 'b0687192491c19faefc0983acaf3ba83e965803c76bed52fefcd149cf10af83b',
  packageLock: '2f81fa86661e7c2d84a18c7ad297c83800e89ee0c7a97b88f3c67d20e7c34307',
  server: '5d5033942720a16213cca7bf62e9b9f939f5f876bcdb1441baeb78a809177f3d'
};

function hashFile(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

test('Phase 46A — 1. Exactly 12 Phase46A inputs accounted', () => {
  const prioritization = JSON.parse(fs.readFileSync('./data/phase45a_tier2_prioritization.json', 'utf-8'));
  const w1Models = [
    'FSA 45', 'BGA 30', 'FSA 50', 'HLA 40', 'HSA 40',
    'SHA 56', 'HSA 30', 'HSA 100', 'FSA 30', 'MSA 60 C-B',
    'MSA 160 C-B', 'FSA 135', 'MSA 220 C-B', 'MSA 200 C-B', 'MSA 70 C-B'
  ];
  const existingRouteRemaining = prioritization.identities.filter(
    i => i.route_readiness === 'ROUTE_READY_EXISTING_CATEGORY' && !w1Models.includes(i.model)
  );
  assert.strictEqual(existingRouteRemaining.length, 12, 'Must have exactly 12 remaining existing-route identities');
});

test('Phase 46A — 2. 8 original HIGH confidence candidates found', () => {
  const highReval = JSON.parse(fs.readFileSync('./data/phase46a_high_confidence_revalidation.json', 'utf-8'));
  assert.strictEqual(highReval.candidates.length, 8, 'Must have exactly 8 HIGH candidates');
  const expectedHigh = ['MSE 170 C-BQ', 'MSE 141 C-Q', 'HSA 26', 'HLA 66', 'HS 82 R', 'MSA 190 T', 'TSA 230', 'HLA 56'];
  const actualHigh = highReval.candidates.map(c => c.model);
  assert.deepStrictEqual(actualHigh.sort(), expectedHigh.sort());
});

test('Phase 46A — 3. 4 original MEDIUM confidence candidates found', () => {
  const medReview = JSON.parse(fs.readFileSync('./data/phase46a_medium_confidence_review.json', 'utf-8'));
  assert.strictEqual(medReview.candidates.length, 4, 'Must have exactly 4 MEDIUM candidates');
  const expectedMed = ['BGE 71', 'FSE 41', 'HSE 52', 'FSE 60'];
  const actualMed = medReview.candidates.map(c => c.model);
  assert.deepStrictEqual(actualMed.sort(), expectedMed.sort());
});

test('Phase 46A — 4. All 12 candidates accounted across audit artifacts', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const collisionAudit = JSON.parse(fs.readFileSync('./data/phase46a_current_98_collision_audit.json', 'utf-8'));
  const core5Staging = JSON.parse(fs.readFileSync('./data/phase46a_core5_staging.json', 'utf-8'));
  const routeReadiness = JSON.parse(fs.readFileSync('./data/phase46a_route_readiness.json', 'utf-8'));

  assert.strictEqual(wave2Def.selected_identities.length, 12);
  assert.strictEqual(collisionAudit.candidates.length, 12);
  assert.strictEqual(core5Staging.candidates.length, 12);
  assert.strictEqual(routeReadiness.candidates.length, 12);
});

test('Phase 46A — 5. None of the 12 already activated in 98 canonical models', () => {
  const db = JSON.parse(fs.readFileSync('./data/stihl_database.json', 'utf-8'));
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const dbSlugs = new Set(db.models.map(m => m.slug));
  const dbNames = new Set(db.models.map(m => m.model_name.toUpperCase()));

  wave2Def.selected_identities.forEach(c => {
    assert.strictEqual(dbSlugs.has(c.proposed_slug), false, `Slug ${c.proposed_slug} must not exist in canonical models`);
    assert.strictEqual(dbNames.has(c.model.toUpperCase()), false, `Model name ${c.model} must not exist in canonical models`);
  });
});

test('Phase 46A — 6. No slug collisions (with 98 models or intra-12)', () => {
  const db = JSON.parse(fs.readFileSync('./data/stihl_database.json', 'utf-8'));
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const dbSlugs = new Set(db.models.map(m => m.slug));
  const candidateSlugs = new Set();

  wave2Def.selected_identities.forEach(c => {
    assert.strictEqual(dbSlugs.has(c.proposed_slug), false, `Collision with canonical db slug: ${c.proposed_slug}`);
    assert.strictEqual(candidateSlugs.has(c.proposed_slug), false, `Duplicate slug within candidate set: ${c.proposed_slug}`);
    candidateSlugs.add(c.proposed_slug);
  });
  assert.strictEqual(candidateSlugs.size, 12);
});

test('Phase 46A — 7. No alias collisions', () => {
  const db = JSON.parse(fs.readFileSync('./data/stihl_database.json', 'utf-8'));
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const aliases = db.aliases || {};
  const candidateSlugs = new Set(wave2Def.selected_identities.map(c => c.proposed_slug));

  Object.entries(aliases).forEach(([alias, target]) => {
    const targetSlug = typeof target === 'string' ? target : (target?.slug || target?.model_name || '');
    assert.strictEqual(candidateSlugs.has(targetSlug), false, `Existing alias points to unactivated candidate: ${alias} -> ${targetSlug}`);
  });
});

test('Phase 46A — 8. Suffixes preserved across all candidates', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const byModel = new Map(wave2Def.selected_identities.map(c => [c.model, c]));

  assert.strictEqual(byModel.get('MSE 170 C-BQ').suffix, 'C-BQ');
  assert.strictEqual(byModel.get('MSE 141 C-Q').suffix, 'C-Q');
  assert.strictEqual(byModel.get('HS 82 R').suffix, 'R');
  assert.strictEqual(byModel.get('MSA 190 T').suffix, 'T');
});

test('Phase 46A — 9. MSE C-BQ / C-Q suffix safety', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const byModel = new Map(wave2Def.selected_identities.map(c => [c.model, c]));

  assert.strictEqual(byModel.get('MSE 170 C-BQ').proposed_slug, 'mse-170-c-bq');
  assert.strictEqual(byModel.get('MSE 141 C-Q').proposed_slug, 'mse-141-c-q');
  assert.notStrictEqual(byModel.get('MSE 170 C-BQ').proposed_slug, 'mse-170');
  assert.notStrictEqual(byModel.get('MSE 141 C-Q').proposed_slug, 'mse-141');
});

test('Phase 46A — 10. HS 82 R suffix safety', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const byModel = new Map(wave2Def.selected_identities.map(c => [c.model, c]));

  assert.strictEqual(byModel.get('HS 82 R').proposed_slug, 'hs-82-r');
  assert.notStrictEqual(byModel.get('HS 82 R').proposed_slug, 'hs-82');
  assert.notStrictEqual(byModel.get('HS 82 R').proposed_slug, 'hs-82-t');
});

test('Phase 46A — 11. MSA 190 T suffix safety', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const byModel = new Map(wave2Def.selected_identities.map(c => [c.model, c]));

  assert.strictEqual(byModel.get('MSA 190 T').proposed_slug, 'msa-190-t');
  assert.notStrictEqual(byModel.get('MSA 190 T').proposed_slug, 'msa-190');
});

test('Phase 46A — 12. HSA 26 bundle reconciled to single identity with standalone provenance', () => {
  const bundleAudit = JSON.parse(fs.readFileSync('./data/phase46a_bundle_audit.json', 'utf-8'));
  const hsa26 = bundleAudit.bundle_candidates.find(b => b.canonical_model === 'HSA 26');

  assert.ok(hsa26);
  assert.strictEqual(hsa26.canonical_identity_count, 1);
  assert.strictEqual(hsa26.bundle_status, 'STANDALONE_AND_KIT');
  assert.strictEqual(hsa26.primary_identity_provenance, 'HA03-011-3503');
  assert.strictEqual(hsa26.standalone_record.reference, 'HA03-011-3503');
  assert.strictEqual(hsa26.kit_record.reference, 'HA03-011-26SET');
});

test('Phase 46A — 13. MEDIUM parser-failure candidates reviewed and justified for upgrade', () => {
  const medReview = JSON.parse(fs.readFileSync('./data/phase46a_medium_confidence_review.json', 'utf-8'));
  assert.strictEqual(medReview.candidates.length, 4);
  medReview.candidates.forEach(c => {
    assert.strictEqual(c.upgrade_justified, true);
    assert.strictEqual(c.final_confidence, 'HIGH');
    assert.strictEqual(c.final_disposition, 'WAVE2_READY_UPGRADED_FROM_MEDIUM');
    assert.ok(c.upgrade_justification.length > 20);
  });
});

test('Phase 46A — 14-17. Electric power source safety (ELECTRIC, not BATTERY)', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const byModel = new Map(wave2Def.selected_identities.map(c => [c.model, c]));

  const electricModels = ['MSE 170 C-BQ', 'MSE 141 C-Q', 'BGE 71', 'FSE 41', 'HSE 52', 'FSE 60'];
  electricModels.forEach(m => {
    const candidate = byModel.get(m);
    assert.ok(candidate, `Candidate ${m} must exist`);
    assert.strictEqual(candidate.canonical_core5_staging.power_source, 'ELECTRIC', `${m} must have power_source ELECTRIC`);
    assert.notStrictEqual(candidate.canonical_core5_staging.power_source, 'BATTERY', `${m} must not be BATTERY`);
  });
});

test('Phase 46A — 18-20. TSA 230 cut_off_machine classification, doorslijpers route, 0 lawnmower leakage', () => {
  const tsaAudit = JSON.parse(fs.readFileSync('./data/phase46a_tsa230_classification_audit.json', 'utf-8'));

  assert.strictEqual(tsaAudit.model, 'TSA 230');
  assert.strictEqual(tsaAudit.phase44a_raw_type, 'LAWNMOWER');
  assert.strictEqual(tsaAudit.phase45a_corrected_semantic_type, 'cut_off_machine');
  assert.strictEqual(tsaAudit.proposed_canonical_category, 'Doorslijper');
  assert.strictEqual(tsaAudit.category_slug, 'doorslijpers');
  assert.strictEqual(tsaAudit.core5_staging.product_category, 'Doorslijper');
  assert.strictEqual(tsaAudit.core5_staging.product_type, 'Doorslijper');
  assert.strictEqual(tsaAudit.core5_staging.power_source, 'BATTERY');
  assert.strictEqual(tsaAudit.core5_staging.primary_function, 'CUT_OFF');
  assert.strictEqual(tsaAudit.old_lawnmower_leakage_checks.lawnmower_references_count, 0);
  assert.strictEqual(tsaAudit.old_lawnmower_leakage_checks.lawnmower_category_leakage, false);
  assert.strictEqual(tsaAudit.result, 'PASS_CUT_OFF_MACHINE_VALIDATED');
});

test('Phase 46A — 21. All selected Wave2 models CORE5 5/5 staged', () => {
  const core5Staging = JSON.parse(fs.readFileSync('./data/phase46a_core5_staging.json', 'utf-8'));
  assert.strictEqual(core5Staging.candidates.length, 12);
  core5Staging.candidates.forEach(c => {
    assert.strictEqual(c.completeness, '5/5');
    assert.ok(c.core5.product_category);
    assert.ok(c.core5.product_type);
    assert.ok(c.core5.machine_form);
    assert.ok(c.core5.power_source);
    assert.ok(c.core5.primary_function);
    assert.ok(c.canonical_vocabulary_mapping_rationale);
  });
});

test('Phase 46A — 22-23. All selected routes exist & zero runtime code changes required', () => {
  const routeReadiness = JSON.parse(fs.readFileSync('./data/phase46a_route_readiness.json', 'utf-8'));
  const allowedCategories = ['kettingzagen', 'bosmaaiers', 'bladblazers', 'heggenscharen', 'doorslijpers'];

  assert.strictEqual(routeReadiness.candidates.length, 12);
  routeReadiness.candidates.forEach(c => {
    assert.ok(allowedCategories.includes(c.category_slug), `Category slug ${c.category_slug} must be an existing public category`);
    assert.strictEqual(c.route_exists, true);
    assert.strictEqual(c.server_support, true);
    assert.strictEqual(c.category_template_support, true);
    assert.strictEqual(c.sitemap_support, true);
    assert.strictEqual(c.search_support, true);
    assert.strictEqual(c.code_change_required, false);
    assert.strictEqual(c.result, 'ROUTE_READY');
  });
  assert.strictEqual(routeReadiness.code_changes_required_count, 0);
});

test('Phase 46A — 24. Production DB unchanged (models=98, CORE5=98/98, byte-identical)', () => {
  const db = JSON.parse(fs.readFileSync('./data/stihl_database.json', 'utf-8'));
  assert.strictEqual(db.models.length, 98, 'Database must retain exactly 98 canonical models');
  const core5Count = db.models.filter(m => m.basic_classification?.core5_completeness === 5).length;
  assert.strictEqual(core5Count, 98, 'All 98 models must retain complete CORE5');
  assert.strictEqual(hashFile('./data/stihl_database.json'), EXPECTED_HASHES.db, 'Database hash must be identical');
});

test('Phase 46A — 25. Public facts unchanged (facts=721, byte-identical)', () => {
  const facts = JSON.parse(fs.readFileSync('./data/public_evidence_facts.json', 'utf-8'));
  const list = facts.facts || facts;
  assert.strictEqual(list.length, 721, 'Public facts must retain exactly 721 facts');
  assert.strictEqual(hashFile('./data/public_evidence_facts.json'), EXPECTED_HASHES.facts, 'Facts file hash must be identical');
});

test('Phase 46A — 26. Evidence manifest unchanged', () => {
  assert.strictEqual(hashFile('./data/public_evidence_baseline_manifest.json'), EXPECTED_HASHES.manifest, 'Manifest hash must be identical');
});

test('Phase 46A — 27. Runtime code unchanged (server.js byte-identical)', () => {
  assert.strictEqual(hashFile('./server.js'), EXPECTED_HASHES.server, 'server.js hash must be identical');
});

test('Phase 46A — 28. Package files unchanged', () => {
  assert.strictEqual(hashFile('./package.json'), EXPECTED_HASHES.packageJson, 'package.json hash must be identical');
  assert.strictEqual(hashFile('./package-lock.json'), EXPECTED_HASHES.packageLock, 'package-lock.json hash must be identical');
});
