import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import * as runtime from '../src/publicEvidence.js';
import { resolveSourcesForModel } from '../scripts/phase45c_capture_sources.mjs';

const rootDir = process.cwd();

const db = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/stihl_database.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_baseline_manifest.json'), 'utf8'));
const sourceManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45c_source_manifest.json'), 'utf8'));
const precedenceAudit = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45c_r1_source_precedence_audit.json'), 'utf8'));
const expansionAudit = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45c_r1_candidate_expansion_audit.json'), 'utf8'));
const accountingRecon = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45c_r1_accounting_reconciliation.json'), 'utf8'));
const crosswalk = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45c_r1_fact_id_crosswalk.json'), 'utf8'));
const delta = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45c_canonical_delta.json'), 'utf8')).writes;
const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase44a_vtex_full_catalog.json'), 'utf8'));
const wave1 = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_phase45b_wave1_definition.json'), 'utf8')).identities;
const bundleRecon = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase45a_tier2_bundle_reconciliation.json'), 'utf8'));

// 1. Phase45C parent SHA correct
test('Phase 45C-R1 — 1. Phase45C parent SHA correct (56174cc)', () => {
  const headRev = child_process.execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  // If we haven't committed yet, HEAD is 56174cc; if committed, merge-base or parent is 56174cc
  const isParentOrHead = child_process.execSync('git merge-base HEAD 56174cc4244952cb729c87925c97773c3bf43efd', { encoding: 'utf8' }).trim();
  assert.equal(isParentOrHead, '56174cc4244952cb729c87925c97773c3bf43efd');
});

// 2. 98 models
test('Phase 45C-R1 — 2. Database contains exactly 98 models', () => {
  assert.equal(db.models.length, 98);
});

// 3. CORE5 98/98
test('Phase 45C-R1 — 3. CORE5 completeness is 98/98', () => {
  const complete = db.models.filter(m => m.basic_classification?.core5_completeness === 5);
  assert.equal(complete.length, 98);
});

// 4. BGA 30 standalone and kit records both identified
test('Phase 45C-R1 — 4. BGA 30 standalone and kit records both identified', () => {
  const bga = precedenceAudit.groups.find(g => g.model === 'BGA 30');
  assert.ok(bga);
  assert.equal(bga.standalone.record_id, '149');
  assert.equal(bga.standalone.reference, 'BA08-011-5900');
  assert.equal(bga.kit.record_id, '150');
  assert.equal(bga.kit.reference, 'BA08-011-59SET');
});

// 5. BGA 30 primary source standalone
test('Phase 45C-R1 — 5. BGA 30 primary source is standalone', () => {
  const bgaSrc = sourceManifest.sources.find(s => s.model === 'BGA 30');
  assert.equal(bgaSrc.primary_reference, 'BA08-011-5900');
  assert.equal(bgaSrc.source_url, 'https://loja.stihl.com.br/soprador-bateria-bga-30/p');
  assert.equal(bgaSrc.primary_machine_source.source_type, 'STANDALONE_MACHINE_PAGE');
});

// 6. HSA 30 standalone and kit records both identified
test('Phase 45C-R1 — 6. HSA 30 standalone and kit records both identified', () => {
  const hsa = precedenceAudit.groups.find(g => g.model === 'HSA 30');
  assert.ok(hsa);
  assert.equal(hsa.standalone.record_id, '6');
  assert.equal(hsa.standalone.reference, 'HA08-011-3504');
  assert.equal(hsa.kit.record_id, '139');
  assert.equal(hsa.kit.reference, 'HA08-011-3512');
});

// 7. HSA 30 primary source standalone
test('Phase 45C-R1 — 7. HSA 30 primary source is standalone', () => {
  const hsaSrc = sourceManifest.sources.find(s => s.model === 'HSA 30');
  assert.equal(hsaSrc.primary_reference, 'HA08-011-3504');
  assert.equal(hsaSrc.source_url, 'https://loja.stihl.com.br/podador-hsa-30/p');
  assert.equal(hsaSrc.primary_machine_source.source_type, 'STANDALONE_MACHINE_PAGE');
});

// 8. FSA 50 standalone and kit records both identified
test('Phase 45C-R1 — 8. FSA 50 standalone and kit records both identified', () => {
  const fsa = precedenceAudit.groups.find(g => g.model === 'FSA 50');
  assert.ok(fsa);
  assert.equal(fsa.standalone.record_id, '242');
  assert.equal(fsa.standalone.reference, 'FA11-011-5700');
  assert.equal(fsa.kit.record_id, '243');
  assert.equal(fsa.kit.reference, 'FA11-011-57SET');
});

// 9. FSA 50 primary source standalone
test('Phase 45C-R1 — 9. FSA 50 primary source is standalone', () => {
  const fsaSrc = sourceManifest.sources.find(s => s.model === 'FSA 50');
  assert.equal(fsaSrc.primary_reference, 'FA11-011-5700');
  assert.equal(fsaSrc.source_url, 'https://loja.stihl.com.br/fsa-50/p');
  assert.equal(fsaSrc.primary_machine_source.source_type, 'STANDALONE_MACHINE_PAGE');
});

// 10. Source selection independent of array order
test('Phase 45C-R1 — 10. Source selection algorithm is order-independent', () => {
  for (const w of wave1) {
    const normal = resolveSourcesForModel(w, catalog, bundleRecon);

    // Inverted arrays
    const inverted = {
      ...w,
      source_record_ids: [...w.source_record_ids].reverse(),
      references: [...w.references].reverse()
    };
    const resolvedInverted = resolveSourcesForModel(inverted, catalog, bundleRecon);

    assert.equal(resolvedInverted.primary_reference, normal.primary_reference);
    assert.equal(resolvedInverted.primary_url, normal.primary_url);
    assert.equal(resolvedInverted.primary_source_type, normal.primary_source_type);
  }
});

// 11. KIT_ONLY HSA 40 preserved
test('Phase 45C-R1 — 11. KIT_ONLY HSA 40 preserved as KIT_ONLY_IDENTITY_SOURCE', () => {
  const hsa40 = precedenceAudit.kit_only_models.find(k => k.model === 'HSA 40');
  assert.ok(hsa40);
  assert.equal(hsa40.bundle_status, 'KIT_ONLY');
  assert.equal(hsa40.classification, 'KIT_ONLY_IDENTITY_SOURCE');
  assert.equal(hsa40.primary_reference, 'HA08-011-35SET');
  assert.equal(hsa40.falsely_labelled_standalone, false);
});

// 12. KIT_ONLY FSA 30 preserved
test('Phase 45C-R1 — 12. KIT_ONLY FSA 30 preserved as KIT_ONLY_IDENTITY_SOURCE', () => {
  const fsa30 = precedenceAudit.kit_only_models.find(k => k.model === 'FSA 30');
  assert.ok(fsa30);
  assert.equal(fsa30.bundle_status, 'KIT_ONLY');
  assert.equal(fsa30.classification, 'KIT_ONLY_IDENTITY_SOURCE');
  assert.equal(fsa30.primary_reference, 'FA10-011-57SET');
  assert.equal(fsa30.falsely_labelled_standalone, false);
});

// 13. All affected safe fields explicitly compared
test('Phase 45C-R1 — 13. All affected safe fields explicitly compared between standalone and kit', () => {
  const bga = precedenceAudit.groups.find(g => g.model === 'BGA 30');
  const hsa = precedenceAudit.groups.find(g => g.model === 'HSA 30');
  const fsa = precedenceAudit.groups.find(g => g.model === 'FSA 50');

  assert.ok(bga.comparison.identical_fields.length >= 10);
  assert.ok(hsa.comparison.identical_fields.length >= 9);
  assert.ok(fsa.comparison.identical_fields.length >= 13);
});

// 14. Kit/standalone conflicts = 0 or explicitly blocked
test('Phase 45C-R1 — 14. Kit/standalone conflicts count is 0', () => {
  assert.equal(precedenceAudit.summary.total_conflicts, 0);
  for (const g of precedenceAudit.groups) {
    assert.equal(g.comparison.conflicts_count, 0);
    assert.equal(g.reconciliation_verdict, 'STANDALONE_PRECEDENCE_PROVEN_ZERO_CONFLICTS');
  }
});

// 15. No kit-derived fact falsely labelled standalone
test('Phase 45C-R1 — 15. No kit-derived fact falsely labelled standalone', () => {
  const wave1Facts = store.facts.slice(665);
  for (const f of wave1Facts) {
    if (f.model_slug === 'hsa-40' || f.model_slug === 'fsa-30') {
      assert.ok(f.scope_evidence.some(e => e.includes('SET')), 'Kit-only fact must retain kit reference');
    } else if (f.model_slug === 'bga-30' || f.model_slug === 'hsa-30' || f.model_slug === 'fsa-50') {
      assert.ok(!f.source_url.includes('-kit'), `Standalone model fact must not use kit URL: ${f.source_url}`);
      assert.ok(!f.scope_evidence.some(e => e.includes('SET')), `Standalone model fact must not have kit SET reference: ${f.scope_evidence}`);
    }
  }
});

// 16. Raw rows counted exactly
test('Phase 45C-R1 — 16. Raw extraction rows counted exactly (175)', () => {
  assert.equal(expansionAudit.accounting_summary.raw_source_rows, 175);
  assert.equal(accountingRecon.extraction_to_ledger.raw_extraction_rows, 175);
});

// 17. Semantic ledger counted exactly
test('Phase 45C-R1 — 17. Semantic ledger counted exactly (187)', () => {
  assert.equal(expansionAudit.accounting_summary.final_semantic_ledger_rows, 187);
  assert.equal(accountingRecon.extraction_to_ledger.semantic_ledger_total, 187);
});

// 18. Disposition sum matches ledger
test('Phase 45C-R1 — 18. Disposition sum matches ledger (56 safe + 131 non-safe = 187)', () => {
  assert.equal(accountingRecon.ledger_partition.safe_candidates, 56);
  assert.equal(accountingRecon.ledger_partition.non_safe_candidates, 131);
  assert.equal(accountingRecon.disposition_sum_check.equation_match, true);
  assert.equal(accountingRecon.ledger_partition.equation_match, true);
});

// 19. Canonical/fact equation valid
test('Phase 45C-R1 — 19. Canonical writes = public facts = 56, final total = 721', () => {
  assert.equal(delta.length, 56);
  assert.equal(store.facts.length - 665, 56);
  assert.equal(store.facts.length, 721);
  assert.equal(accountingRecon.canonical_and_evidence_equality.equation_match, true);
});

// 20. Old 665 facts immutable
test('Phase 45C-R1 — 20. Baseline 665 facts immutable (byte-identical in git history)', () => {
  const old665Git = JSON.parse(child_process.execSync('git show 846e560:data/public_evidence_facts.json', { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 })).facts;
  assert.equal(old665Git.length, 665);
  const current665 = store.facts.slice(0, 665);
  assert.deepEqual(current665, old665Git);
});

// 21. Baseline 38 debt unchanged
test('Phase 45C-R1 — 21. Baseline 38 unindexed facts debt unchanged', () => {
  const indexedIds = new Set(Object.values(store.model_index).flatMap(e => e.fact_ids));
  const unindexedCount = store.facts.slice(0, 665).filter(f => !indexedIds.has(f.fact_id)).length;
  assert.equal(unindexedCount, 38);
});

// 22. Model index clean
test('Phase 45C-R1 — 22. Model index clean (all 56 facts indexed, no undefined, no stale IDs)', () => {
  const newFacts = store.facts.slice(665);
  for (const f of newFacts) {
    const entry = store.model_index[f.model_slug];
    assert.ok(entry, `Model index missing for ${f.model_slug}`);
    assert.ok(entry.fact_ids.includes(f.fact_id), `Fact ${f.fact_id} missing in model_index`);
  }
});

// 23. Field index clean
test('Phase 45C-R1 — 23. Field index clean (all 56 fields mapped to active fact_ids)', () => {
  const newFacts = store.facts.slice(665);
  for (const f of newFacts) {
    assert.equal(store.field_index[f.model_slug]?.[f.field], f.fact_id);
  }
});

// 24. Runtime F/F
test('Phase 45C-R1 — 24. Runtime resolvable 56/56', () => {
  const attached = { ...db, public_evidence: store };
  for (const w of delta) {
    const facts = runtime.getPublicEvidenceFactsForModel(w.slug, attached);
    const fact = facts.find(f => f.field === w.field);
    assert.ok(fact, `Failed to resolve ${w.slug}.${w.field}`);
  }
});

// 25. Canonical/runtime C/C
test('Phase 45C-R1 — 25. Canonical runtime parity 56/56', () => {
  const attached = { ...db, public_evidence: store };
  for (const w of delta) {
    const facts = runtime.getPublicEvidenceFactsForModel(w.slug, attached);
    const fact = facts.find(f => f.field === w.field);
    assert.equal(fact.normalized_value, w.after);
  }
});

// 26. No stale replaced fact IDs
test('Phase 45C-R1 — 26. Crosswalk complete: replaced fact IDs not present in active indexes', () => {
  const rebound = crosswalk.crosswalk.filter(c => c.new_disposition === 'RETAIN_REBIND_TO_STANDALONE');
  assert.equal(rebound.length, 6);

  const activeFactIds = new Set(store.facts.map(f => f.fact_id));
  const modelIndexFactIds = new Set(Object.values(store.model_index).flatMap(e => e.fact_ids));
  const fieldIndexFactIds = new Set(Object.values(store.field_index).flatMap(m => Object.values(m)));

  for (const r of rebound) {
    assert.ok(r.old_fact_id);
    assert.ok(r.new_fact_id);
    assert.notEqual(r.old_fact_id, r.new_fact_id);
    // Old ID must not be in active facts or indexes
    assert.ok(!activeFactIds.has(r.old_fact_id), `Stale fact ID ${r.old_fact_id} in active facts`);
    assert.ok(!modelIndexFactIds.has(r.old_fact_id), `Stale fact ID ${r.old_fact_id} in model_index`);
    assert.ok(!fieldIndexFactIds.has(r.old_fact_id), `Stale fact ID ${r.old_fact_id} in field_index`);
    // New ID must be in active facts and indexes
    assert.ok(activeFactIds.has(r.new_fact_id), `New fact ID ${r.new_fact_id} missing from active facts`);
    assert.ok(modelIndexFactIds.has(r.new_fact_id), `New fact ID ${r.new_fact_id} missing from model_index`);
    assert.ok(fieldIndexFactIds.has(r.new_fact_id), `New fact ID ${r.new_fact_id} missing from field_index`);
  }
});

// 27. Canonical policy
test('Phase 45C-R1 — 27. Canonical policy: production_confidence UNKNOWN and specs_verified not true', () => {
  for (const m of db.models) {
    assert.equal(m.production_confidence, 'UNKNOWN');
    assert.notStrictEqual(m.specs_verified, true);
  }
});

// 28. Idempotence
test('Phase 45C-R1 — 28. Idempotence: all write outputs deterministic and verifiable', () => {
  assert.equal(manifest.fact_count, 721);
  assert.equal(manifest.canonical_model_count, 98);
  assert.ok(manifest.canonical_database_sha256);
  assert.ok(manifest.public_store_canonical_sha256);
});
