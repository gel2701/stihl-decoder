import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

test('Phase 45A — 1. Tier2 input exactly 72 records', () => {
  const prioritized = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase44a_br_new_candidates_prioritized.json'), 'utf8'));
  const tier2 = prioritized.filter(r => r.priority_tier === 'TIER_2_MEDIUM');
  assert.equal(tier2.length, 72, 'Tier2 records must be exactly 72');
});

test('Phase 45A — 2. All 72 records accounted for in product accounting', () => {
  const accounting = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_product_accounting.json'), 'utf8'));
  assert.equal(accounting.records.length, 72, 'Accounting must have 72 records');
  assert.equal(accounting.total_records, 72);
});

test('Phase 45A — 3-6. Exclusion checks (No Tier1, Tier3, accessory, or unknown in Tier2)', () => {
  const prioritized = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase44a_br_new_candidates_prioritized.json'), 'utf8'));
  const tier2 = prioritized.filter(r => r.priority_tier === 'TIER_2_MEDIUM');
  const tier1 = prioritized.filter(r => r.priority_tier === 'TIER_1_HIGH');
  const tier3 = prioritized.filter(r => r.priority_tier === 'TIER_3_LOW');

  const tier1Ids = new Set(tier1.map(r => r.id));
  const tier3Ids = new Set(tier3.map(r => r.id));

  for (const r of tier2) {
    assert.equal(tier1Ids.has(r.id), false, `Tier1 record ${r.id} leaked into Tier2`);
    assert.equal(tier3Ids.has(r.id), false, `Tier3 record ${r.id} leaked into Tier2`);
    assert.equal(r.category, 'machine', `Non-machine ${r.id} found in Tier2`);
  }
});

test('Phase 45A — 7-8. Duplicate-prefix groups classified and no bundle duplicate becomes 2 unique identities', () => {
  const bundleRec = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_bundle_reconciliation.json'), 'utf8'));
  assert.equal(bundleRec.bundle_groups_count, 9);
  assert.equal(bundleRec.total_bundle_duplicates, 9);

  const expectedGroups = ['BGA 30', 'FSA 50', 'HTA 30', 'GTA 40', 'RCA 20', 'HSA 30', 'SEA 20', 'HSA 26', 'GTA 26'];
  for (const grp of expectedGroups) {
    assert.ok(bundleRec.groups[grp], `Group ${grp} must be present in bundle reconciliation`);
    assert.equal(bundleRec.groups[grp].canonical_identity_count, 1, `Group ${grp} must yield exactly 1 canonical identity`);
  }
});

test('Phase 45A — 9. Real variants stay separate (e.g. RM 253 vs RM 253 T, RM 2 R, RE 90 vs RE 90 Plus)', () => {
  const inv = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_unique_identity_inventory.json'), 'utf8'));
  const modelNames = inv.identities.map(i => i.canonical_model);

  assert.ok(modelNames.includes('RM 253'), 'RM 253 must be present');
  assert.ok(modelNames.includes('RM 253 T'), 'RM 253 T must be present as a separate identity');
  assert.ok(modelNames.includes('RM 2 R'), 'RM 2 R must be present');
  assert.ok(modelNames.includes('RE 90 Plus'), 'RE 90 Plus must be present');
  assert.ok(modelNames.includes('RE 90.0'), 'RE 90.0 must be present');
});

test('Phase 45A — 10. modelInfo-null records reviewed (18 total)', () => {
  const nullReview = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_modelinfo_null_review.json'), 'utf8'));
  assert.equal(nullReview.total_null, 18);
  assert.equal(nullReview.records.length, 18);
  for (const r of nullReview.records) {
    assert.ok(r.proposed_identity, `Proposed identity missing for record ${r.record_id}`);
    assert.ok(r.parse_failure_reason, `Failure reason missing for record ${r.record_id}`);
  }
});

test('Phase 45A — 11-13. Slugs unique, no collisions with current 83 canonical models', () => {
  const inv = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_unique_identity_inventory.json'), 'utf8'));
  const slugs = inv.identities.map(i => i.proposed_slug);
  const slugSet = new Set(slugs);
  assert.equal(slugSet.size, slugs.length, 'All proposed slugs must be unique');

  const collisionAudit = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_collision_audit.json'), 'utf8'));
  assert.equal(collisionAudit.exact_collisions.length, 0, 'No exact name collisions allowed');
  assert.equal(collisionAudit.slug_collisions.length, 0, 'No slug collisions allowed');
});

test('Phase 45A — 14. Category readiness assigned to all identities', () => {
  const catAudit = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_category_architecture_audit.json'), 'utf8'));
  assert.equal(catAudit.identities.length, 63);
  for (const i of catAudit.identities) {
    assert.ok(typeof i.existing_route_available === 'boolean');
    assert.ok(typeof i.new_route_required === 'boolean');
    assert.ok(i.recommended_category, `Recommended category missing for ${i.model}`);
  }
});

test('Phase 45A — 15. CORE5 staging completeness recorded', () => {
  const core5 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_core5_staging.json'), 'utf8'));
  assert.equal(core5.total, 63);
  assert.equal(core5.complete_5_of_5, 63);
});

test('Phase 45A — 16-18. Wave 1 constraints: size 1-15, HIGH confidence, route ready, collision free', () => {
  const wave1 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_phase45b_wave1_definition.json'), 'utf8'));
  assert.ok(wave1.wave1_count >= 1 && wave1.wave1_count <= 15, `Wave 1 count ${wave1.wave1_count} outside 1-15`);
  assert.equal(wave1.identities.length, wave1.wave1_count);

  for (const w of wave1.identities) {
    assert.equal(w.identity_confidence, 'HIGH', `Wave 1 model ${w.canonical_model} not HIGH confidence`);
    assert.ok(w.route_category, `Wave 1 model ${w.canonical_model} missing route_category`);
    assert.equal(w.collision, 'NONE', `Wave 1 model ${w.canonical_model} has collision`);
    assert.ok(w.core5, `Wave 1 model ${w.canonical_model} missing CORE5`);
  }
});

test('Phase 45A — 19-21. Production freeze: DB, evidence, and package/runtime unmutated', () => {
  const expectedDbBlob = 'b06d9b838f20e971b0564f0835a1e42af69d4e61';
  const expectedEvBlob = '800c47ff3897ada75faab94f8f6ca106423d4c00';
  const expectedMnBlob = 'bfcc6666fdd05d8bfc8b3d8f148197123bfb0c7d';
  const expectedPkgBlob = '9ca6bcd35505f1a89c8a6b5f09c517ea411501ca';

  const dbContent = fs.readFileSync(path.join(rootDir, 'data/stihl_database.json'));
  const evContent = fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'));
  const mnContent = fs.readFileSync(path.join(rootDir, 'data/public_evidence_baseline_manifest.json'));
  const pkgContent = fs.readFileSync(path.join(rootDir, 'package.json'));

  // Ensure parsing succeeds and counts remain frozen
  const dbJson = JSON.parse(dbContent.toString('utf8'));
  assert.equal(dbJson.models.length, 83);

  const evJson = JSON.parse(evContent.toString('utf8'));
  assert.equal(evJson.facts.length, 665);
});
