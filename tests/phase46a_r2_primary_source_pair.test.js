/**
 * tests/phase46a_r2_primary_source_pair.test.js
 * Verification suite for Phase 46A-R2:
 * Primary Record / Reference Pair Integrity Remediation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { resolvePrimarySourcePair } from '../scripts/phase46a_build_audit_artifacts.mjs';

const EXPECTED_MAIN_BASE = 'fb7cfa0c814b1be8decb349b6d1e4244989c646c';

const EXPECTED_HASHES = {
  db: '80e40066a55135fb7c390bc1f84ddd4c70d20de36922eda71bd9a61757c072af',
  facts: '0d8efa841591b2fd27869e27d989620f8b2159f53f1b82cfe7dea9db67094d80',
  manifest: '0e43116248bf4e83fc0cfdc0f9b32895b86622a6e8328029ff09ef3145769f8e',
  packageJson: 'b0687192491c19faefc0983acaf3ba83e965803c76bed52fefcd149cf10af83b',
  packageLock: '2f81fa86661e7c2d84a18c7ad297c83800e89ee0c7a97b88f3c67d20e7c34307',
  server: '5d5033942720a16213cca7bf62e9b9f939f5f876bcdb1441baeb78a809177f3d',
  decoder: '753a8725caa7af05e2d4e5986150ac3b0fe192c261755cba12d7481f3280f6bd'
};

function hashFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// 1. Latest production base incorporated
test('Phase 46A-R2 — 1. Latest production base incorporated', () => {
  const isAncestor = execSync(`git merge-base --is-ancestor ${EXPECTED_MAIN_BASE} HEAD && echo OK || echo FAIL`, { encoding: 'utf-8' }).trim();
  assert.strictEqual(isAncestor, 'OK', `Branch must contain latest main base ${EXPECTED_MAIN_BASE}`);
});

// 2. Phase46A replay complete
test('Phase 46A-R2 — 2. Phase46A replay complete', () => {
  const log = execSync('git log --grep="Phase 46A: audit remaining BR Tier 2" --format=%H', { encoding: 'utf-8' }).trim();
  assert.ok(log.length > 0, 'Phase 46A commit must be replayed');
});

// 3. Phase46A-R1 replay complete
test('Phase 46A-R2 — 3. Phase46A-R1 replay complete', () => {
  const log = execSync('git log --grep="Phase 46A-R1: correct Wave 2 source lineage" --format=%H', { encoding: 'utf-8' }).trim();
  assert.ok(log.length > 0, 'Phase 46A-R1 commit must be replayed');
});

// 4. 12 candidates
test('Phase 46A-R2 — 4. 12 candidates in Wave 2 definition', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  assert.strictEqual(wave2Def.selected_identities.length, 12, 'Wave 2 must contain exactly 12 candidates');
});

// 5. Every candidate has primary_record_id
test('Phase 46A-R2 — 5. Every candidate has primary_record_id', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  wave2Def.selected_identities.forEach(c => {
    assert.ok(typeof c.primary_record_id === 'string' && c.primary_record_id.length > 0,
      `Candidate ${c.model} must have non-empty primary_record_id`);
  });
});

// 6. Primary record exists
test('Phase 46A-R2 — 6. Primary record exists in catalog and inventory', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const inventory = JSON.parse(fs.readFileSync('./data/phase45a_tier2_unique_identity_inventory.json', 'utf-8'));
  const fullCatalog = JSON.parse(fs.readFileSync('./data/phase44a_vtex_full_catalog.json', 'utf-8'));
  const products = fullCatalog.products || fullCatalog;

  wave2Def.selected_identities.forEach(c => {
    const inv = inventory.identities.find(i => i.canonical_model === c.model);
    assert.ok(inv, `Inventory entry for ${c.model} must exist`);
    const rec = inv.product_records.find(r => String(r.id) === c.primary_record_id);
    assert.ok(rec, `Primary record ${c.primary_record_id} for ${c.model} must exist in inventory`);
    const cat = products.find(p => String(p.id || p.productId) === c.primary_record_id);
    assert.ok(cat, `Primary record ${c.primary_record_id} for ${c.model} must exist in VTEX catalog`);
  });
});

// 7. Primary record reference equals official reference
test('Phase 46A-R2 — 7. Primary record reference equals official reference', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const inventory = JSON.parse(fs.readFileSync('./data/phase45a_tier2_unique_identity_inventory.json', 'utf-8'));

  wave2Def.selected_identities.forEach(c => {
    const inv = inventory.identities.find(i => i.canonical_model === c.model);
    const rec = inv.product_records.find(r => String(r.id) === c.primary_record_id);
    assert.strictEqual(rec.ref, c.official_reference,
      `Primary record ref ${rec.ref} must equal official_reference ${c.official_reference} for ${c.model}`);
  });
});

// 8. Catalog record matches primary record
test('Phase 46A-R2 — 8. Catalog record matches primary record', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const fullCatalog = JSON.parse(fs.readFileSync('./data/phase44a_vtex_full_catalog.json', 'utf-8'));
  const products = fullCatalog.products || fullCatalog;

  wave2Def.selected_identities.forEach(c => {
    const cat = products.find(p => String(p.id || p.productId) === c.primary_record_id);
    assert.ok(cat, `Catalog entry must exist for record ${c.primary_record_id}`);
    assert.strictEqual(cat.reference, c.official_reference,
      `Catalog reference ${cat.reference} must equal official reference ${c.official_reference} for ${c.model}`);
  });
});

// 9. Standalone primary is non-kit
test('Phase 46A-R2 — 9. Standalone primary is non-kit', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const inventory = JSON.parse(fs.readFileSync('./data/phase45a_tier2_unique_identity_inventory.json', 'utf-8'));

  wave2Def.selected_identities.forEach(c => {
    const inv = inventory.identities.find(i => i.canonical_model === c.model);
    const rec = inv.product_records.find(r => String(r.id) === c.primary_record_id);
    assert.strictEqual(rec.kit, false, `Primary record for ${c.model} must have kit=false`);
  });
});

// 10. HSA26 primary record = 27
test('Phase 46A-R2 — 10. HSA 26 primary record = 27', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const hsa26 = wave2Def.selected_identities.find(c => c.model === 'HSA 26');
  assert.strictEqual(hsa26.primary_record_id, '27');
});

// 11. HSA26 primary reference = HA03-011-3503
test('Phase 46A-R2 — 11. HSA 26 primary reference = HA03-011-3503', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const hsa26 = wave2Def.selected_identities.find(c => c.model === 'HSA 26');
  assert.strictEqual(hsa26.official_reference, 'HA03-011-3503');
});

// 12. HSA26 secondary record = 28
test('Phase 46A-R2 — 12. HSA 26 secondary record = 28', () => {
  const pairAudit = JSON.parse(fs.readFileSync('./data/phase46a_r2_primary_source_pair_audit.json', 'utf-8'));
  const hsa26 = pairAudit.pairs.find(p => p.model === 'HSA 26');
  assert.strictEqual(hsa26.secondary_records.length, 1);
  assert.strictEqual(hsa26.secondary_records[0].id, '28');
  assert.strictEqual(hsa26.secondary_records[0].kit, true);
});

// 13. HSA26 secondary reference = HA03-011-26SET
test('Phase 46A-R2 — 13. HSA 26 secondary reference = HA03-011-26SET', () => {
  const pairAudit = JSON.parse(fs.readFileSync('./data/phase46a_r2_primary_source_pair_audit.json', 'utf-8'));
  const hsa26 = pairAudit.pairs.find(p => p.model === 'HSA 26');
  assert.strictEqual(hsa26.secondary_records[0].ref, 'HA03-011-26SET');
});

// 14. HSA26 source order = 27,28
test('Phase 46A-R2 — 14. HSA 26 source order = [27, 28]', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const hsa26 = wave2Def.selected_identities.find(c => c.model === 'HSA 26');
  assert.deepStrictEqual(hsa26.source_record_ids, ['27', '28']);
});

// 15. HSA26 high-confidence artifact uses record 27
test('Phase 46A-R2 — 15. HSA 26 high-confidence artifact uses record 27', () => {
  const highConf = JSON.parse(fs.readFileSync('./data/phase46a_high_confidence_revalidation.json', 'utf-8'));
  const hsa26 = highConf.candidates.find(c => c.model === 'HSA 26');
  assert.strictEqual(hsa26.record_id, '27');
  assert.strictEqual(hsa26.reference, 'HA03-011-3503');
  assert.strictEqual(hsa26.current_evidence, 'Accepted official STIHL Brazil catalog record #27');
});

// 16. Order reversal does not change HSA26 primary
test('Phase 46A-R2 — 16. Order reversal does not change HSA 26 primary', () => {
  const inventory = JSON.parse(fs.readFileSync('./data/phase45a_tier2_unique_identity_inventory.json', 'utf-8'));
  const fullCatalog = JSON.parse(fs.readFileSync('./data/phase44a_vtex_full_catalog.json', 'utf-8'));
  const catalogProducts = fullCatalog.products || fullCatalog;

  const hsa26Orig = inventory.identities.find(i => i.canonical_model === 'HSA 26');
  const hsa26Reversed = JSON.parse(JSON.stringify(hsa26Orig));
  hsa26Reversed.references.reverse();
  hsa26Reversed.product_records.reverse();

  const resolved = resolvePrimarySourcePair(hsa26Reversed, catalogProducts);
  assert.strictEqual(resolved.primary_record_id, '27', 'Primary record must remain 27 upon array reversal');
  assert.strictEqual(resolved.primary_ref, 'HA03-011-3503', 'Primary reference must remain HA03-011-3503 upon array reversal');
  assert.strictEqual(resolved.primary_record.kit, false, 'Primary record kit flag must be false');
});

// 17. MSE170 record = 62
test('Phase 46A-R2 — 17. MSE 170 C-BQ record = 62', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const mse170 = wave2Def.selected_identities.find(c => c.model === 'MSE 170 C-BQ');
  assert.strictEqual(mse170.primary_record_id, '62');
});

// 18. MSE170 reference = 1209-011-M170
test('Phase 46A-R2 — 18. MSE 170 C-BQ reference = 1209-011-M170', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const mse170 = wave2Def.selected_identities.find(c => c.model === 'MSE 170 C-BQ');
  assert.strictEqual(mse170.official_reference, '1209-011-M170');
});

// 19. No old MSE170 bad reference
test('Phase 46A-R2 — 19. No old MSE 170 C-BQ bad reference (1208-200-0320 or record 60)', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const mse170 = wave2Def.selected_identities.find(c => c.model === 'MSE 170 C-BQ');
  assert.notStrictEqual(mse170.official_reference, '1208-200-0320');
  assert.notStrictEqual(mse170.primary_record_id, '60');
  assert.ok(!mse170.source_record_ids.includes('60'));
});

// 20. MSE141 pair correct
test('Phase 46A-R2 — 20. MSE 141 C-Q pair correct (record 61, ref 1208-200-0308/09)', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const mse141 = wave2Def.selected_identities.find(c => c.model === 'MSE 141 C-Q');
  assert.strictEqual(mse141.primary_record_id, '61');
  assert.strictEqual(mse141.official_reference, '1208-200-0308/09');
});

// 21. TSA230 pair correct
test('Phase 46A-R2 — 21. TSA 230 pair correct (record 181, ref 4864-011-6620, route doorslijpers, 0 lawnmower leakage)', () => {
  const wave2Def = JSON.parse(fs.readFileSync('./data/phase46a_phase46b_wave2_definition.json', 'utf-8'));
  const tsa230 = wave2Def.selected_identities.find(c => c.model === 'TSA 230');
  assert.strictEqual(tsa230.primary_record_id, '181');
  assert.strictEqual(tsa230.official_reference, '4864-011-6620');
  assert.strictEqual(tsa230.route_category, 'doorslijpers');

  const tsaAudit = JSON.parse(fs.readFileSync('./data/phase46a_tsa230_classification_audit.json', 'utf-8'));
  assert.strictEqual(tsaAudit.old_lawnmower_leakage_checks.lawnmower_references_count, 0);
  assert.strictEqual(tsaAudit.old_lawnmower_leakage_checks.lawnmower_category_leakage, false);
});

// 22. 12/12 pair integrity
test('Phase 46A-R2 — 22. 12/12 pair integrity in primary source pair audit', () => {
  const pairAudit = JSON.parse(fs.readFileSync('./data/phase46a_r2_primary_source_pair_audit.json', 'utf-8'));
  assert.strictEqual(pairAudit.pairs.length, 12);
  assert.strictEqual(pairAudit.all_pairs_valid, true);
  pairAudit.pairs.forEach(p => {
    assert.strictEqual(p.record_reference_match, true, `${p.model} record_reference_match`);
    assert.strictEqual(p.catalog_reference_match, true, `${p.model} catalog_reference_match`);
    assert.strictEqual(p.standalone_requirement_match, true, `${p.model} standalone_requirement_match`);
    assert.strictEqual(p.result, 'PASS', `${p.model} result`);
  });
});

// 23. 12/12 CORE5 staged
test('Phase 46A-R2 — 23. 12/12 CORE5 staged 5/5', () => {
  const core5Staging = JSON.parse(fs.readFileSync('./data/phase46a_core5_staging.json', 'utf-8'));
  assert.strictEqual(core5Staging.candidates.length, 12);
  core5Staging.candidates.forEach(c => {
    assert.strictEqual(c.completeness, '5/5');
    const core5 = c.core5;
    assert.ok(core5.product_category && core5.product_type && core5.machine_form && core5.power_source && core5.primary_function);
  });
});

// 24. 12/12 route ready
test('Phase 46A-R2 — 24. 12/12 route ready', () => {
  const routeReadiness = JSON.parse(fs.readFileSync('./data/phase46a_route_readiness.json', 'utf-8'));
  assert.strictEqual(routeReadiness.candidates.length, 12);
  assert.strictEqual(routeReadiness.all_routes_supported, true);
  assert.strictEqual(routeReadiness.code_changes_required_count, 0);
});

// 25. Current serial decoder application state unchanged
test('Phase 46A-R2 — 25. Current serial decoder application state unchanged', () => {
  assert.strictEqual(hashFile('./server.js'), EXPECTED_HASHES.server, 'server.js hash must match baseline');
  assert.strictEqual(hashFile('./src/decoder.js'), EXPECTED_HASHES.decoder, 'src/decoder.js hash must match baseline');
});

// 26. 98 models unchanged
test('Phase 46A-R2 — 26. 98 models unchanged with 98/98 CORE5', () => {
  const db = JSON.parse(fs.readFileSync('./data/stihl_database.json', 'utf-8'));
  assert.strictEqual(db.models.length, 98, 'Database must retain exactly 98 canonical models');
  const core5Count = db.models.filter(m => m.basic_classification?.core5_completeness === 5).length;
  assert.strictEqual(core5Count, 98, 'All 98 models must retain complete CORE5');
  assert.strictEqual(hashFile('./data/stihl_database.json'), EXPECTED_HASHES.db, 'Database hash must match baseline');
});

// 27. 721 facts unchanged
test('Phase 46A-R2 — 27. 721 public facts unchanged', () => {
  const facts = JSON.parse(fs.readFileSync('./data/public_evidence_facts.json', 'utf-8'));
  const list = facts.facts || facts;
  assert.strictEqual(list.length, 721, 'Must retain exactly 721 public facts');
  assert.strictEqual(hashFile('./data/public_evidence_facts.json'), EXPECTED_HASHES.facts, 'Facts file hash must match baseline');
});

// 28. Package files unchanged
test('Phase 46A-R2 — 28. Package files unchanged', () => {
  assert.strictEqual(hashFile('./package.json'), EXPECTED_HASHES.packageJson, 'package.json hash must match baseline');
  assert.strictEqual(hashFile('./package-lock.json'), EXPECTED_HASHES.packageLock, 'package-lock.json hash must match baseline');
});
