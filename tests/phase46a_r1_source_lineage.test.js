/**
 * tests/phase46a_r1_source_lineage.test.js
 * Verification suite for Phase 46A-R1:
 * Wave 2 Source Lineage Remediation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';

const EXPECTED_PARENT_SHA = '7a793cf9a601ac77e91463dc77350a21b03f8349';

const EXPECTED_HASHES = {
  db: '80e40066a55135fb7c390bc1f84ddd4c70d20de36922eda71bd9a61757c072af',
  facts: '0d8efa841591b2fd27869e27d989620f8b2159f53f1b82cfe7dea9db67094d80',
  manifest: '0e43116248bf4e83fc0cfdc0f9b32895b86622a6e8328029ff09ef3145769f8e',
  packageJson: 'b0687192491c19faefc0983acaf3ba83e965803c76bed52fefcd149cf10af83b',
  packageLock: '2f81fa86661e7c2d84a18c7ad297c83800e89ee0c7a97b88f3c67d20e7c34307',
  server: '5d5033942720a16213cca7bf62e9b9f939f5f876bcdb1441baeb78a809177f3d'
};

function hashFile(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

test('Phase 46A-R1 — 1. Phase46A parent commit SHA is correct', () => {
  let parentCommit;
  try {
    parentCommit = execSync('git rev-parse HEAD~1', { encoding: 'utf-8' }).trim();
  } catch {
    parentCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  }
  const headSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const replayedSha = execSync('git log --grep="Phase 46A: audit remaining BR Tier 2" -1 --format=%H', { encoding: 'utf-8' }).trim();
  const validShas = [EXPECTED_PARENT_SHA, replayedSha].filter(Boolean);

  assert.ok(validShas.includes(headSha) || validShas.includes(parentCommit),
    `Parent or current HEAD must match Phase 46A commit ${EXPECTED_PARENT_SHA} or replayed commit ${replayedSha}`);
});

test('Phase 46A-R1 — 2. 12 candidates in Wave 2 definition', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  assert.strictEqual(wave2Def.selected_identities.length, 12, 'Must have exactly 12 candidates in Wave 2');
});

test('Phase 46A-R1 — 3. Every Wave2 record ID equals Phase45A identity inventory', () => {
  const inventory = JSON.parse(fs.readFileSync('./data/phase45a_tier2_unique_identity_inventory.json', 'utf-8'));
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));

  wave2Def.selected_identities.forEach(w => {
    const inv = inventory.identities.find(i => i.canonical_model === w.model);
    assert.ok(inv, `Model ${w.model} must exist in Phase 45A inventory`);
    const invRecIds = inv.product_records.map(r => String(r.id)).sort();
    const wRecIds = w.source_record_ids.map(r => String(r)).sort();
    assert.deepStrictEqual(wRecIds, invRecIds, `Record IDs for ${w.model} must exactly match inventory`);
  });
});

test('Phase 46A-R1 — 4. Every primary reference belongs to accepted Phase45A references', () => {
  const inventory = JSON.parse(fs.readFileSync('./data/phase45a_tier2_unique_identity_inventory.json', 'utf-8'));
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));

  wave2Def.selected_identities.forEach(w => {
    const inv = inventory.identities.find(i => i.canonical_model === w.model);
    assert.ok(inv.references.includes(w.official_reference),
      `Primary reference ${w.official_reference} for ${w.model} must be in accepted Phase 45A references`);
  });
});

test('Phase 46A-R1 — 5. MSE 170 C-BQ record ID is 62', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const mse170 = wave2Def.selected_identities.find(w => w.model === 'MSE 170 C-BQ');
  assert.ok(mse170);
  assert.deepStrictEqual(mse170.source_record_ids, ['62']);
});

test('Phase 46A-R1 — 6. MSE 170 C-BQ reference is 1209-011-M170', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const mse170 = wave2Def.selected_identities.find(w => w.model === 'MSE 170 C-BQ');
  assert.strictEqual(mse170.official_reference, '1209-011-M170');
});

test('Phase 46A-R1 — 7. No 1208-200-0320 remains for MSE 170 C-BQ in Wave 2, high confidence, or collision audit', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const highReval = JSON.parse(fs.readFileSync('./data/phase46a_high_confidence_revalidation.json', 'utf-8'));
  const collisionAudit = JSON.parse(fs.readFileSync('./data/phase46a_current_98_collision_audit.json', 'utf-8'));

  const mseWave2 = wave2Def.selected_identities.find(w => w.model === 'MSE 170 C-BQ');
  assert.notStrictEqual(mseWave2.official_reference, '1208-200-0320');

  const mseHigh = highReval.candidates.find(w => w.model === 'MSE 170 C-BQ');
  assert.notStrictEqual(mseHigh.reference, '1208-200-0320');

  const mseColl = collisionAudit.candidates.find(w => w.model === 'MSE 170 C-BQ');
  assert.notStrictEqual(mseColl.reference, '1208-200-0320');
});

test('Phase 46A-R1 — 8. MSE 170 SKU refs remain item-level electrical variants', () => {
  const fullCatalog = JSON.parse(fs.readFileSync('./data/phase44a_vtex_full_catalog.json', 'utf-8'));
  const p62 = (fullCatalog.products || fullCatalog).find(p => String(p.id || p.productId) === '62');
  assert.ok(p62);
  const skuRefs = p62.items.map(i => i.reference);
  assert.ok(skuRefs.includes('1209-011-4008'), 'SKU 127V ref must exist');
  assert.ok(skuRefs.includes('1209-011-4009'), 'SKU 220V ref must exist');
  assert.strictEqual(p62.reference, '1209-011-M170', 'Product-level reference must be 1209-011-M170');
});

test('Phase 46A-R1 — 9. MSE 141 C-Q lineage unchanged', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const mse141 = wave2Def.selected_identities.find(w => w.model === 'MSE 141 C-Q');
  assert.deepStrictEqual(mse141.source_record_ids, ['61']);
  assert.strictEqual(mse141.official_reference, '1208-200-0308/09');
});

test('Phase 46A-R1 — 10. HSA 26 bundle lineage correct (standalone prioritized)', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const hsa26 = wave2Def.selected_identities.find(w => w.model === 'HSA 26');
  assert.strictEqual(hsa26.official_reference, 'HA03-011-3503');
  assert.strictEqual(hsa26.bundle_status, 'STANDALONE_AND_KIT');
  assert.strictEqual(hsa26.source_record_ids.length, 2);
  assert.ok(hsa26.source_record_ids.includes('27'));
  assert.ok(hsa26.source_record_ids.includes('28'));
});

test('Phase 46A-R1 — 11. TSA 230 cut-off machine lineage correct', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const tsa230 = wave2Def.selected_identities.find(w => w.model === 'TSA 230');
  assert.deepStrictEqual(tsa230.source_record_ids, ['181']);
  assert.strictEqual(tsa230.official_reference, '4864-011-6620');
  assert.strictEqual(tsa230.route_category, 'doorslijpers');
  assert.strictEqual(tsa230.canonical_core5_staging.product_category, 'Doorslijper');
  assert.strictEqual(tsa230.canonical_core5_staging.primary_function, 'CUT_OFF');
});

test('Phase 46A-R1 — 12. All 12 candidates collision-free with 98 canonical models', () => {
  const collisionAudit = JSON.parse(fs.readFileSync('./data/phase46a_current_98_collision_audit.json', 'utf-8'));
  assert.strictEqual(collisionAudit.candidates.length, 12);
  collisionAudit.candidates.forEach(c => {
    assert.strictEqual(c.exact_name_collision, false);
    assert.strictEqual(c.slug_collision, false);
    assert.strictEqual(c.alias_collision, false);
    assert.strictEqual(c.search_normalization_collision, null);
    assert.strictEqual(c.result, 'PASS_NO_COLLISION');
  });
});

test('Phase 46A-R1 — 13. All 12 candidates CORE5 staged 5/5 with canonical vocabulary', () => {
  const core5Staging = JSON.parse(fs.readFileSync('./data/phase46a_core5_staging.json', 'utf-8'));
  assert.strictEqual(core5Staging.candidates.length, 12);
  core5Staging.candidates.forEach(c => {
    assert.strictEqual(c.completeness, '5/5');
    assert.ok(c.core5.product_category);
    assert.ok(c.core5.product_type);
    assert.ok(c.core5.machine_form);
    assert.ok(c.core5.power_source);
    assert.ok(c.core5.primary_function);
  });
});

test('Phase 46A-R1 — 14. All 12 candidates existing-route ready', () => {
  const routeReadiness = JSON.parse(fs.readFileSync('./data/phase46a_route_readiness.json', 'utf-8'));
  assert.strictEqual(routeReadiness.candidates.length, 12);
  assert.strictEqual(routeReadiness.code_changes_required_count, 0);
  routeReadiness.candidates.forEach(c => {
    assert.strictEqual(c.route_exists, true);
    assert.strictEqual(c.code_change_required, false);
    assert.strictEqual(c.result, 'ROUTE_READY');
  });
});

test('Phase 46A-R1 — 15. Source lineage audit passes 12/12', () => {
  const lineageAudit = JSON.parse(fs.readFileSync('./data/phase46a_r1_source_lineage_audit.json', 'utf-8'));
  assert.strictEqual(lineageAudit.identities.length, 12);
  assert.strictEqual(lineageAudit.all_record_ids_match, true);
  assert.strictEqual(lineageAudit.all_references_valid, true);
  lineageAudit.identities.forEach(i => {
    assert.strictEqual(i.record_ids_match, true);
    assert.strictEqual(i.primary_reference_valid, true);
    assert.strictEqual(i.result, 'PASS');
  });
});

test('Phase 46A-R1 — 16. Production DB unchanged (models=98, CORE5=98/98, byte-identical)', () => {
  const db = JSON.parse(fs.readFileSync('./data/stihl_database.json', 'utf-8'));
  assert.strictEqual(db.models.length, 98);
  assert.strictEqual(hashFile('./data/stihl_database.json'), EXPECTED_HASHES.db);
});

test('Phase 46A-R1 — 17. Public evidence facts unchanged (facts=721, byte-identical)', () => {
  const facts = JSON.parse(fs.readFileSync('./data/public_evidence_facts.json', 'utf-8'));
  const list = facts.facts || facts;
  assert.strictEqual(list.length, 721);
  assert.strictEqual(hashFile('./data/public_evidence_facts.json'), EXPECTED_HASHES.facts);
});

test('Phase 46A-R1 — 18. Evidence manifest, runtime code, package files unchanged', () => {
  assert.strictEqual(hashFile('./data/public_evidence_baseline_manifest.json'), EXPECTED_HASHES.manifest);
  assert.strictEqual(hashFile('./server.js'), EXPECTED_HASHES.server);
  assert.strictEqual(hashFile('./package.json'), EXPECTED_HASHES.packageJson);
  assert.strictEqual(hashFile('./package-lock.json'), EXPECTED_HASHES.packageLock);
});
