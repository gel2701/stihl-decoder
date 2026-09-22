import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { decodeStihlCode } from '../src/decoder.js';
import * as runtime from '../src/publicEvidence.js';

const rootDir = process.cwd();
const PARENT_COMMIT = 'b1af87bffe196290098aa079804f2e5b9c0a5509';
const PARENT_TREE = 'abc4717d6ed1385e2939a2040a9267f6d0ce476f';
const BASELINE_FACTS_HASH = 'c50e3d6dda8b44d10617a2e6b52f46b2a62dd1e66d53878fe2ddfcaf4db6d3f1';

// 1. Load canonical DB
const db = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/stihl_database.json'), 'utf8'));

// 2. Load public evidence store & manifest
const store = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_facts.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/public_evidence_baseline_manifest.json'), 'utf8'));

// 3. Load canonical delta & summaries
const delta = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_canonical_delta.json'), 'utf8')).writes;
const dispositionSummary = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_field_disposition_summary.json'), 'utf8'));
const modelSummary = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_model_technical_summary.json'), 'utf8')).summary;

// 4. Load Wave 2 definition
const wave2Identities = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46a_phase46b_wave2_definition.json'), 'utf8')).selected_identities;
const wave2Slugs = new Set(wave2Identities.map(w => w.proposed_slug));

// 5. Load Ledgers & Source Manifest
const rawLedger = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_raw_extraction_ledger.json'), 'utf8'));
const semanticLedger = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_semantic_reconciliation_ledger.json'), 'utf8'));
const sourceManifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/phase46c_source_manifest.json'), 'utf8'));

// ---------------------------------------------------------------------------
// SECTION 19: EXACT PARENT GATE
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 19: Exact parent commit and tree verification', () => {
  const actualTree = execSync(`git rev-parse "${PARENT_COMMIT}^{tree}"`, { encoding: 'utf8' }).trim();
  assert.equal(actualTree, PARENT_TREE, `Parent tree mismatch: expected ${PARENT_TREE}, got ${actualTree}`);
});

// ---------------------------------------------------------------------------
// SECTION 20: SOURCE MANIFEST TESTS
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 20: Source manifest captures & 13/13 actual file SHA-256 matches', () => {
  assert.equal(sourceManifest.total_models, 12);
  assert.equal(sourceManifest.successful_captures, 13);
  assert.equal(sourceManifest.standalone_groups, 11);
  assert.equal(sourceManifest.standalone_and_kit_groups, 1);

  const captures = [];
  for (const s of sourceManifest.sources) {
    if (s.primary_machine_source) captures.push(s.primary_machine_source);
    if (s.secondary_bundle_sources) captures.push(...s.secondary_bundle_sources);
  }
  assert.equal(captures.length, 13);

  for (const c of captures) {
    assert.ok(c.sha256, `Missing sha256 in manifest for ${c.captured_file}`);
    assert.equal(c.retrieval_status, 'HTTP_200_OK');
    const fullPath = path.join(rootDir, c.captured_file);
    assert.ok(fs.existsSync(fullPath), `Source file does not exist: ${c.captured_file}`);
    const content = fs.readFileSync(fullPath);
    const actualHash = crypto.createHash('sha256').update(content).digest('hex');
    assert.equal(actualHash, c.sha256, `SHA-256 mismatch for ${c.captured_file}`);
  }
});

// ---------------------------------------------------------------------------
// SECTION 21: HSA 26 PRECEDENCE TEST
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 21: HSA 26 precedence and zero technical writes', () => {
  const hsa26Entry = sourceManifest.sources.find(s => s.slug === 'hsa-26');
  assert.ok(hsa26Entry);
  assert.equal(hsa26Entry.primary_record_id, '27');
  assert.equal(hsa26Entry.primary_reference, 'HA03-011-3503');
  assert.equal(hsa26Entry.primary_machine_source.source_type, 'STANDALONE_MACHINE_PAGE');

  assert.ok(hsa26Entry.secondary_bundle_sources);
  assert.equal(hsa26Entry.secondary_bundle_sources.length, 1);
  assert.equal(hsa26Entry.secondary_bundle_sources[0].source_record_id, '28');
  assert.equal(hsa26Entry.secondary_bundle_sources[0].reference, 'HA03-011-26SET');
  assert.equal(hsa26Entry.secondary_bundle_sources[0].source_type, 'BUNDLE_KIT_PAGE');

  const hsa26Writes = delta.filter(w => w.slug === 'hsa-26');
  assert.equal(hsa26Writes.length, 0, 'HSA 26 must have exactly 0 technical writes');
});

// ---------------------------------------------------------------------------
// SECTION 22: RAW EXTRACTION LEDGER TEST
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 22: Raw extraction ledger contains exactly 146 unique rows with valid schema', () => {
  assert.equal(rawLedger.total_raw_rows, 146);
  assert.equal(rawLedger.ledger.length, 146);

  const seenIds = new Set();
  for (const r of rawLedger.ledger) {
    assert.ok(r.raw_id, 'raw_id is required');
    assert.ok(!seenIds.has(r.raw_id), `Duplicate raw_id: ${r.raw_id}`);
    seenIds.add(r.raw_id);
    assert.ok(r.model, 'model is required');
    assert.ok(r.slug, 'slug is required');
    assert.ok(r.source_id, 'source_id is required');
    assert.ok(r.source_url, 'source_url is required');
    assert.ok(r.raw_label, 'raw_label is required');
    assert.ok(r.raw_value, 'raw_value is required');
  }
});

// ---------------------------------------------------------------------------
// SECTION 23: SEMANTIC RECONCILIATION LEDGER TEST
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 23: Semantic reconciliation ledger has 156 rows (10 expansions) with valid dispositions', () => {
  assert.equal(semanticLedger.total_semantic_rows, 156);
  assert.equal(semanticLedger.ledger.length, 156);
  const expansions = semanticLedger.ledger.length - rawLedger.ledger.length;
  assert.equal(expansions, 10, 'Expected exactly 10 expansion rows');

  const validDispositions = new Set([
    'SAFE_SINGLE_VALUE',
    'SAFE_DUAL_UNIT_NORMALIZATION',
    'SAFE_COMPOUND_COMPONENT',
    'EVIDENCE_ONLY_SCOPED',
    'CONFIGURATION_MULTI_VALUE_BLOCKED',
    'CONFIGURATION_DEPENDENT_BLOCKED',
    'BATTERY_CONFIGURATION_BLOCKED',
    'CHARGER_SPEC_BLOCKED',
    'FIELD_SEMANTIC_AMBIGUOUS_BLOCKED',
    'UNIT_SEMANTIC_AMBIGUOUS_BLOCKED',
    'VARIANT_AMBIGUOUS_BLOCKED',
    'NOT_CANONICAL_FIELD',
    'DUPLICATE_EQUIVALENT',
    'SOURCE_CONFLICT_BLOCKED',
    'UNSUPPORTED_SOURCE_BLOCKED'
  ]);

  for (const r of semanticLedger.ledger) {
    assert.ok(r.semantic_id, 'semantic_id is required');
    assert.ok(r.raw_id, 'raw_id is required');
    assert.ok(r.disposition, 'disposition is required');
    assert.ok(validDispositions.has(r.disposition), `Unknown disposition: ${r.disposition}`);
  }
});

// ---------------------------------------------------------------------------
// SECTION 24: EXACT ACCOUNTING TEST DERIVED FROM LEDGER
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 24: Exact disposition accounting derived programmatically from semantic ledger', () => {
  const counts = {};
  for (const r of semanticLedger.ledger) {
    counts[r.disposition] = (counts[r.disposition] || 0) + 1;
  }

  const safeSingle = counts['SAFE_SINGLE_VALUE'] || 0;
  const safeDual = counts['SAFE_DUAL_UNIT_NORMALIZATION'] || 0;
  const safeCompound = counts['SAFE_COMPOUND_COMPONENT'] || 0;
  const safeTotal = safeSingle + safeDual + safeCompound;

  const evidenceOnly = counts['EVIDENCE_ONLY_SCOPED'] || 0;

  const blockedCounts = Object.entries(counts)
    .filter(([k]) => !k.startsWith('SAFE_') && k !== 'EVIDENCE_ONLY_SCOPED')
    .reduce((sum, [, v]) => sum + v, 0);

  assert.equal(safeSingle, 19);
  assert.equal(safeDual, 1);
  assert.equal(safeCompound, 20);
  assert.equal(safeTotal, 40);

  assert.equal(evidenceOnly, 9);

  assert.equal(counts['CONFIGURATION_MULTI_VALUE_BLOCKED'] || 0, 6);
  assert.equal(counts['CONFIGURATION_DEPENDENT_BLOCKED'] || 0, 40);
  assert.equal(counts['BATTERY_CONFIGURATION_BLOCKED'] || 0, 10);
  assert.equal(counts['CHARGER_SPEC_BLOCKED'] || 0, 6);
  assert.equal(counts['FIELD_SEMANTIC_AMBIGUOUS_BLOCKED'] || 0, 30);
  assert.equal(counts['NOT_CANONICAL_FIELD'] || 0, 15);
  assert.equal(blockedCounts, 107);

  const grandTotal = safeTotal + evidenceOnly + blockedCounts;
  assert.equal(grandTotal, 156);
  assert.equal(safeTotal + evidenceOnly + blockedCounts, 156);

  // Cross-check with disposition summary artifact
  assert.equal(dispositionSummary.safe_canonical_writes, 40);
  assert.equal(dispositionSummary.blocked_rows, 107);
  assert.equal(dispositionSummary.evidence_only_rows, 9);
  assert.equal(dispositionSummary.total_semantic_rows, 156);
  assert.equal(dispositionSummary.accounting_balanced, true);
});

// ---------------------------------------------------------------------------
// SECTION 25 & 26: SAFE DISPOSITION WRITES & BLOCKED NEGATIVE TESTS
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 25: Every canonical delta row corresponds to a SAFE_* disposition', () => {
  assert.equal(delta.length, 40);
  for (const w of delta) {
    const matchingLedgerRow = semanticLedger.ledger.find(
      r => r.slug === w.slug && r.field === w.field && r.safe === true
    );
    assert.ok(matchingLedgerRow, `No safe ledger row found for delta write: ${w.slug}.${w.field}`);
    assert.ok(matchingLedgerRow.disposition.startsWith('SAFE_'), `Disposition for ${w.slug}.${w.field} is not SAFE_*: ${matchingLedgerRow.disposition}`);
  }
});

test('Phase 46C — Gate 26: Blocked and evidence-only rows produce zero canonical writes', () => {
  const nonSafeRows = semanticLedger.ledger.filter(r => !r.disposition.startsWith('SAFE_'));
  for (const r of nonSafeRows) {
    if (!r.field) continue;
    const write = delta.find(w => w.slug === r.slug && w.field === r.field);
    assert.equal(write, undefined, `Non-safe row created a canonical write: ${r.slug}.${r.field} (disposition: ${r.disposition})`);
  }
});

// ---------------------------------------------------------------------------
// SECTION 27 & 28: EXACT 721 BASELINE FACT IMMUTABILITY & CANONICAL HASH
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 27: Exact 721/721 baseline public facts match Phase 46B parent byte-for-byte', () => {
  const parentStore = JSON.parse(execSync(`git show ${PARENT_COMMIT}:data/public_evidence_facts.json`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  assert.equal(parentStore.facts.length, 721);
  const baselineFacts = store.facts.slice(0, 721);
  assert.equal(baselineFacts.length, 721);

  for (let i = 0; i < 721; i++) {
    assert.deepEqual(baselineFacts[i], parentStore.facts[i], `Baseline fact drift at index ${i} (ID: ${baselineFacts[i].fact_id})`);
  }
});

test('Phase 46C — Gate 28: Deterministic canonical hash reproduces exactly for baseline 721 facts', () => {
  const baselineFacts = store.facts.slice(0, 721);
  const hash = crypto.createHash('sha256').update(JSON.stringify(baselineFacts)).digest('hex');
  assert.equal(hash, BASELINE_FACTS_HASH, `Baseline facts hash mismatch: expected ${BASELINE_FACTS_HASH}, got ${hash}`);
});

// ---------------------------------------------------------------------------
// SECTION 29 & 30: NEW FACT TESTS & BASELINE DEBT
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 29: 40 new facts indexed 40/40 in model_index and field_index with valid source hash chain', () => {
  const newFacts = store.facts.slice(721);
  assert.equal(newFacts.length, 40);

  const factIds = new Set();
  for (const f of newFacts) {
    assert.ok(!factIds.has(f.fact_id), `Duplicate fact ID: ${f.fact_id}`);
    factIds.add(f.fact_id);

    // model_index check
    const modelEntry = store.model_index[f.model_slug];
    assert.ok(modelEntry, `Model index missing for ${f.model_slug}`);
    assert.ok(modelEntry.fact_ids.includes(f.fact_id), `Fact ID ${f.fact_id} missing from model_index[${f.model_slug}]`);

    // field_index check
    const fieldEntry = store.field_index[f.model_slug];
    assert.ok(fieldEntry, `Field index missing for ${f.model_slug}`);
    assert.equal(fieldEntry[f.field], f.fact_id, `Field index mismatch for ${f.model_slug}.${f.field}`);

    // Source hash chain check
    assert.ok(f.evidence_hash, `Evidence hash missing on fact ${f.fact_id}`);
    const source = sourceManifest.sources.find(s => s.slug === f.model_slug);
    assert.ok(source, `Source entry missing in manifest for ${f.model_slug}`);
    assert.equal(f.evidence_hash, source.primary_machine_source.sha256, `Fact evidence_hash mismatch for ${f.fact_id}`);

    // Crosswalk check against canonical delta
    const deltaWrite = delta.find(w => w.slug === f.model_slug && w.field === f.field);
    assert.ok(deltaWrite, `No canonical delta write matching fact ${f.fact_id} (${f.model_slug}.${f.field})`);
    assert.equal(deltaWrite.source_hash, f.evidence_hash);
  }
});

test('Phase 46C — Gate 30: Baseline unindexed debt frozen at 38 and new unindexed facts count is 0', () => {
  const indexedIds = new Set(Object.values(store.model_index).flatMap(e => e.fact_ids));

  const baselineFacts = store.facts.slice(0, 721);
  const baselineUnindexed = baselineFacts.filter(f => !indexedIds.has(f.fact_id)).length;
  assert.equal(baselineUnindexed, 38, 'Baseline unindexed debt must be strictly 38');

  const newFacts = store.facts.slice(721);
  const newUnindexed = newFacts.filter(f => !indexedIds.has(f.fact_id)).length;
  assert.equal(newUnindexed, 0, 'New Phase 46C unindexed facts must be strictly 0');
});

// ---------------------------------------------------------------------------
// SECTION 31 & 32: PRE-WAVE 2 & PHASE 46B MODEL IMMUTABILITY
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 31: Pre-Wave 2 98 models remain 98/98 byte/semantic identical to parent commit', () => {
  const parentDb = JSON.parse(execSync(`git show ${PARENT_COMMIT}:data/stihl_database.json`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  assert.equal(parentDb.models.length, 110);

  for (const p of parentDb.models) {
    if (!wave2Slugs.has(p.slug)) {
      const cur = db.models.find(m => m.slug === p.slug);
      assert.deepEqual(cur, p, `Pre-Wave 2 model changed: ${p.slug}`);
    }
  }
});

test('Phase 46C — Gate 32: 110/110 models identity and CORE5 remain 100% identical to parent commit', () => {
  const parentDb = JSON.parse(execSync(`git show ${PARENT_COMMIT}:data/stihl_database.json`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  const identityFields = [
    'id', 'slug', 'model_name', 'category', 'category_slug',
    'basic_classification', 'brand', 'trade_name', 'power_source',
    'commercial_status', 'model_family'
  ];

  for (const p of parentDb.models) {
    const cur = db.models.find(m => m.slug === p.slug);
    assert.ok(cur, `Model missing in current DB: ${p.slug}`);
    for (const f of identityFields) {
      assert.deepEqual(cur[f], p[f], `Identity/CORE5 drift on ${p.slug}.${f}`);
    }
  }
});

// ---------------------------------------------------------------------------
// SECTION 33: TECHNICAL DELTA EXACTNESS
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 33: Exactly 40 scalar differences exist between parent and current canonical DB', () => {
  const parentDb = JSON.parse(execSync(`git show ${PARENT_COMMIT}:data/stihl_database.json`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));

  let diffCount = 0;
  for (const p of parentDb.models) {
    const cur = db.models.find(m => m.slug === p.slug);
    const allKeys = new Set([...Object.keys(p), ...Object.keys(cur)]);
    for (const k of allKeys) {
      if (JSON.stringify(cur[k]) !== JSON.stringify(p[k])) {
        diffCount++;
        assert.ok(wave2Slugs.has(p.slug), `Unexpected scalar difference on non-Wave 2 model: ${p.slug}.${k}`);
      }
    }
  }
  assert.equal(diffCount, 40, `Expected exactly 40 scalar differences, found ${diffCount}`);
});

// ---------------------------------------------------------------------------
// SECTION 34: PUBLIC FACT TOTAL
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 34: Public evidence facts count is exactly 761 (721 baseline + 40 new)', () => {
  assert.equal(store.facts.length, 761);
  assert.equal(store.facts.length, 721 + 40);
});

// ---------------------------------------------------------------------------
// SECTION 35: SERIAL DECODER EXACT IMMUTABILITY
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 35: Serial decoder ranges 8/8 identical to parent and candidate resolution verified', () => {
  const parentDb = JSON.parse(execSync(`git show ${PARENT_COMMIT}:data/stihl_database.json`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  assert.deepEqual(db.model_serial_ranges, parentDb.model_serial_ranges, 'model_serial_ranges drifted from parent');

  // Verify confidence breakdown
  const ranges = db.model_serial_ranges;
  assert.equal(ranges.length, 8);
  assert.equal(ranges.filter(r => r.confidence_level === 'HIGH').length, 0);
  assert.equal(ranges.filter(r => r.confidence_level === 'MEDIUM').length, 8);
  assert.equal(ranges.filter(r => r.confidence_level === 'LOW').length, 0);

  // BR 600
  const rBr600 = decodeStihlCode('275000000', db);
  assert.ok(rBr600.success);
  assert.equal(rBr600.modelAssist?.series, 'BR 600 Reeks');
  assert.deepEqual(rBr600.modelAssist?.candidates.map(c => c.slug), ['br-600']);

  // FS 120 / FS 250 -> FS 120 candidate only
  const rFs120 = decodeStihlCode('335000000', db);
  assert.ok(rFs120.success);
  assert.equal(rFs120.modelAssist?.series, 'FS 120 / FS 250');
  assert.deepEqual(rFs120.modelAssist?.candidates.map(c => c.slug), ['fs-120']);

  // BR 340 / BR 420 -> BR 420 candidate only
  const rBr420 = decodeStihlCode('150123456', db);
  assert.ok(rBr420.success);
  assert.equal(rBr420.modelAssist?.series, 'BR 340 / BR 420');
  assert.deepEqual(rBr420.modelAssist?.candidates.map(c => c.slug), ['br-420']);
});

// ---------------------------------------------------------------------------
// SECTION 36: RUNTIME / PACKAGE FREEZE
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 36: Zero drift on 11 runtime and package files against parent commit', () => {
  const files = [
    'server.js',
    'src/decoder.js',
    'src/StihlRangeResolver.js',
    'src/SerialChronologyResolver.js',
    'src/globalModelSearch.js',
    'src/publicationRules.js',
    'package.json',
    'package-lock.json',
    'src/officialProductHarvester.js',
    'scripts/harvest_stihl_official_products.js',
    '.github/workflows/official-product-harvester-check.yml'
  ];

  for (const f of files) {
    const curContent = fs.readFileSync(path.join(rootDir, f), 'utf8').replace(/\r\n/g, '\n');
    const parentContent = execSync(`git show ${PARENT_COMMIT}:${f}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).replace(/\r\n/g, '\n');
    assert.equal(curContent, parentContent, `Runtime file drift detected in ${f}`);
  }
});

// ---------------------------------------------------------------------------
// SECTION 37: IDEMPOTENCE AUDIT ARTIFACT VERIFICATION
// ---------------------------------------------------------------------------
test('Phase 46C — Gate 37: Idempotence audit artifact exists and verifies PASS_ZERO_DIFF', () => {
  const auditPath = path.join(rootDir, 'data/phase46c_r1_idempotence_audit.json');
  assert.ok(fs.existsSync(auditPath), 'Idempotence audit artifact missing');
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  assert.equal(audit.second_run_idempotence.status, 'PASS_ZERO_DIFF');
  assert.equal(audit.dry_run.additional_canonical_writes, 0);
  assert.equal(audit.dry_run.additional_facts, 0);
  assert.equal(audit.second_run_idempotence.canonical_db_diff, 0);
  assert.equal(audit.second_run_idempotence.public_facts_diff, 0);
  assert.equal(audit.second_run_idempotence.manifest_diff, 0);
});

// ---------------------------------------------------------------------------
// CANONICAL MODEL TECHNICAL SPECIFICATIONS VERIFICATION
// ---------------------------------------------------------------------------
test('Phase 46C — Target 12 Wave 2 models loaded from canonical database', () => {
  assert.equal(wave2Identities.length, 12);
  for (const w of wave2Identities) {
    const m = db.models.find(mod => mod.slug === w.proposed_slug);
    assert.ok(m, `Model ${w.proposed_slug} must exist in canonical DB`);
  }
});

test('Phase 46C — Canonical models count remains exactly 110', () => {
  assert.equal(db.models.length, 110);
});

test('Phase 46C — HS 82 R has exactly 7 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hs-82-r');
  assert.ok(m);
  assert.equal(m.displacement_cc, 22.7);
  assert.equal(m.power_kw, 0.7);
  assert.equal(m.power_hp, 1.0);
  assert.equal(m.sound_pressure_db, 94);
  assert.equal(m.sound_power_db, 107);
  assert.equal(m.vibration_left_ms2, 2.7);
  assert.equal(m.vibration_right_ms2, 3.1);
});

test('Phase 46C — MSE 170 C-BQ has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'mse-170-c-bq');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 92);
  assert.equal(m.sound_power_db, 103);
  assert.equal(m.vibration_left_ms2, 2.9);
  assert.equal(m.vibration_right_ms2, 3.4);
});

test('Phase 46C — MSE 141 C-Q has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'mse-141-c-q');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 90);
  assert.equal(m.sound_power_db, 101);
  assert.equal(m.vibration_left_ms2, 3.3);
  assert.equal(m.vibration_right_ms2, 4.2);
});

test('Phase 46C — HLA 66 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hla-66');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 80);
  assert.equal(m.sound_power_db, 94);
  assert.equal(m.vibration_left_ms2, 3.5);
  assert.equal(m.vibration_right_ms2, 3.5);
});

test('Phase 46C — MSA 190 T has exactly 2 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'msa-190-t');
  assert.ok(m);
  assert.equal(m.vibration_left_ms2, 3.9);
  assert.equal(m.vibration_right_ms2, 3.8);
});

test('Phase 46C — TSA 230 has exactly 2 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'tsa-230');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 104);
  assert.equal(m.sound_power_db, 115);
});

test('Phase 46C — HLA 56 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hla-56');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 77);
  assert.equal(m.sound_power_db, 88);
  assert.equal(m.vibration_left_ms2, 1.5);
  assert.equal(m.vibration_right_ms2, 1.5);
});

test('Phase 46C — BGE 71 has exactly 3 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'bge-71');
  assert.ok(m);
  assert.equal(m.air_volume_m3h, 670);
  assert.equal(m.air_velocity_ms, 66);
  assert.equal(m.sound_power_db, 101);
});

test('Phase 46C — FSE 41 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'fse-41');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 87);
  assert.equal(m.sound_power_db, 96);
  assert.equal(m.vibration_left_ms2, 2.2);
  assert.equal(m.vibration_right_ms2, 1.3);
});

test('Phase 46C — HSE 52 has exactly 4 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'hse-52');
  assert.ok(m);
  assert.equal(m.sound_pressure_db, 84);
  assert.equal(m.sound_power_db, 95);
  assert.equal(m.vibration_left_ms2, 3.1);
  assert.equal(m.vibration_right_ms2, 1.5);
});

test('Phase 46C — FSE 60 has exactly 2 safe fields', () => {
  const m = db.models.find(mod => mod.slug === 'fse-60');
  assert.ok(m);
  assert.equal(m.vibration_left_ms2, 3.9);
  assert.equal(m.vibration_right_ms2, 3.6);
});

test('Phase 46C — Weight is null across all 12 models (weight_kg == null)', () => {
  for (const slug of wave2Slugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.weight_kg, null, `weight_kg must be null for ${slug}`);
  }
});

test('Phase 46C — Multi-voltage (127V / 220V) mains-electric safety: zero voltage_v writes', () => {
  const electricSlugs = ['mse-170-c-bq', 'mse-141-c-q', 'bge-71', 'fse-41', 'hse-52', 'fse-60'];
  for (const slug of electricSlugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.voltage_v, null, `voltage_v must be null for ${slug}`);
  }
  const voltageWrites = delta.filter(w => w.field === 'voltage_v');
  assert.equal(voltageWrites.length, 0);
});

test('Phase 46C — Battery system is null across all 12 models (battery_system == null)', () => {
  for (const slug of wave2Slugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.battery_system, null, `battery_system must be null for ${slug}`);
  }
  const batteryWrites = delta.filter(w => w.field === 'battery_system');
  assert.equal(batteryWrites.length, 0);
});

test('Phase 46C — Spark plug and carburetor settings remain null across all 12 models', () => {
  for (const slug of wave2Slugs) {
    const m = db.models.find(mod => mod.slug === slug);
    assert.equal(m.spark_plug, null);
    assert.equal(m.electrode_gap_mm, null);
    assert.equal(m.carb_h_setting, null);
    assert.equal(m.carb_l_setting, null);
    assert.equal(m.carb_la_setting, null);
  }
});

test('Phase 46C — Sound ranges blocked for MSA 190 T', () => {
  const m = db.models.find(mod => mod.slug === 'msa-190-t');
  assert.equal(m.sound_pressure_db, null);
  assert.equal(m.sound_power_db, null);
});

test('Phase 46C — Dual sound blocked for FSE 60', () => {
  const m = db.models.find(mod => mod.slug === 'fse-60');
  assert.equal(m.sound_pressure_db, null);
  assert.equal(m.sound_power_db, null);
});

test('Phase 46C — Vibration inequality (< 4,3) blocked for TSA 230', () => {
  const m = db.models.find(mod => mod.slug === 'tsa-230');
  assert.equal(m.vibration_left_ms2, null);
  assert.equal(m.vibration_right_ms2, null);
});

// ---------------------------------------------------------------------------
// RUNTIME & MANIFEST RESOLUTION
// ---------------------------------------------------------------------------
test('Phase 46C — Runtime resolution returns all 40 new facts for corresponding models', () => {
  const attached = { ...db, public_evidence: store };
  for (const w of delta) {
    const facts = runtime.getPublicEvidenceFactsForModel(w.slug, attached);
    const fact = facts.find(f => f.field === w.field);
    assert.ok(fact, `Runtime resolution failed for ${w.slug}.${w.field}`);
    assert.equal(fact.normalized_value, w.new_value);
  }
});

test('Phase 46C — Public evidence baseline manifest updated with phase 46C and fact_count 761', () => {
  assert.equal(manifest.phase, '46C');
  assert.equal(manifest.public_fact_count, 761);
  assert.equal(manifest.canonical_model_count, 110);
});

test('Phase 46C — Production confidence remains UNKNOWN and specs_verified is false across all 110 models', () => {
  for (const m of db.models) {
    assert.equal(m.production_confidence, 'UNKNOWN');
    assert.notEqual(m.specs_verified, true, `specs_verified must not be true for ${m.model_name}`);
  }
});

// ---------------------------------------------------------------------------
// SQLITE DATABASE PARITY
// ---------------------------------------------------------------------------
test('Phase 46C — SQLite database parity: 110 models, HS 82 R technical specs populated', () => {
  const sqliteDb = new Database(path.join(rootDir, 'data/stihl_database.db'));
  const countRow = sqliteDb.prepare('SELECT COUNT(*) as cnt FROM models').get();
  assert.equal(countRow.cnt, 110);

  const hs82r = sqliteDb.prepare('SELECT displacement_cc, power_kw, power_hp FROM models WHERE slug = ?').get('hs-82-r');
  assert.equal(hs82r.displacement_cc, 22.7);
  assert.equal(hs82r.power_kw, 0.7);
  assert.equal(hs82r.power_hp, 1.0);

  sqliteDb.close();
});
