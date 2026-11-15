/**
 * Phase 85 — Walbro/STIHL catalog expansion integrity.
 *
 * Guards the evidence interface of the expansion: only VERIFIED candidates may
 * enter the catalog, every added record must keep its source context, parked
 * candidates must survive in the audit, and the two documented technical changes
 * must exist on both sides with an evidence-only supersession relation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));
const normalize = (value) => String(value || '').replace(/[\s-]/g, '');

const catalog = readJson('data/parts_catalog.json');
const queue = readJson('output/phase85/PHASE85_CARB_CANDIDATES.json');
const migration = readJson('output/phase85/PHASE85_CATALOG_MIGRATION.json');
const supersessions = readJson('data/parts_supersessions.json');

const catalogByNumber = new Map(catalog.parts.map((part) => [normalize(part.part_number), part]));

test('Phase 85: every added carburettor is a VERIFIED candidate with a named carburettor type', () => {
  const verified = new Map(queue.verified.map((entry) => [normalize(entry.part_number), entry]));
  assert.ok(verified.size > 0, 'the queue must contain verified candidates');

  for (const added of migration.added) {
    const record = catalogByNumber.get(normalize(added.part_number));
    assert.ok(record, `${added.part_number} must exist in the canonical catalog`);
    if (!added.sources.some((source) => source.startsWith('scribd_'))) continue;
    const candidate = verified.get(normalize(added.part_number));
    assert.ok(candidate, `${added.part_number} may only be added from the VERIFIED bucket`);
    assert.ok(candidate.carburetor, 'a verified candidate always carries a carburettor type');
    assert.match(record.part_name, new RegExp(`Carburettor\\s+${candidate.carburetor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('Phase 85: no parked candidate was imported', () => {
  for (const entry of queue.needs_evidence) {
    if (catalogByNumber.has(normalize(entry.part_number))) {
      const record = catalogByNumber.get(normalize(entry.part_number));
      const fromPhase85 = (record.sources || []).some((source) => String(source).startsWith('scribd_walbro_cross_reference'));
      assert.ok(!fromPhase85, `${entry.part_number} is NEEDS_EVIDENCE and must not be imported from this source`);
    }
  }
  for (const entry of queue.rejected) {
    const record = catalogByNumber.get(normalize(entry.part_number));
    const fromPhase85 = record && (record.sources || []).some((source) => String(source).startsWith('scribd_walbro_cross_reference'));
    assert.ok(!fromPhase85, `${entry.part_number} was rejected and must never be imported`);
  }
});

test('Phase 85: candidate classification is exhaustive and reproducible', () => {
  const total = queue.verified.length + queue.needs_evidence.length + queue.rejected.length;
  assert.strictEqual(total, queue.parsing.distinct_missing_from_catalog, 'each missing candidate is classified exactly once');
  assert.strictEqual(queue.classification.VERIFIED, queue.verified.length);
  assert.strictEqual(queue.classification.NEEDS_EVIDENCE, queue.needs_evidence.length);
  assert.strictEqual(queue.classification.REJECTED, queue.rejected.length);
  assert.strictEqual(queue.parsing.rows_extracted, 623, 'the extracted row count is reproducible');
  for (const entry of queue.verified) {
    assert.ok(entry.carburetor, `${entry.part_number} needs an anchored carburettor code`);
    assert.ok(entry.source_text, 'verified candidates keep their source row text');
    assert.ok(Array.isArray(entry.pages) && entry.pages.length > 0, 'verified candidates keep their page numbers');
  }
  for (const entry of queue.needs_evidence) {
    assert.ok(entry.reason, `${entry.part_number} must state why evidence is missing`);
  }
  assert.ok(queue.parsing.ocr_spacing_repairs > 0, 'OCR spacing repairs are recorded');
  assert.ok(Array.isArray(queue.parsing.ocr_repair_samples) && queue.parsing.ocr_repair_samples.length > 0);
  for (const repair of queue.parsing.ocr_repair_samples) {
    assert.strictEqual(
      normalize(repair.after).length > 0,
      true,
      'a repair sample always keeps readable text'
    );
  }
});

test('Phase 85: the documented technical changes exist on both sides with an evidence-only relation', () => {
  for (const pair of [
    ['30030009852', '30030009853'],
    ['00008901710', '00008901711']
  ]) {
    const [from, to] = pair.map(normalize);
    assert.ok(catalogByNumber.has(from), `${from} must exist in the catalog`);
    assert.ok(catalogByNumber.has(to), `${to} must exist in the catalog`);
    const relation = supersessions.relations.find(
      (r) => normalize(r.from_part) === from && normalize(r.to_part) === to
    );
    assert.ok(relation, `${from} -> ${to} must be recorded`);
    assert.strictEqual(relation.relation, 'SUPERSEDED_BY');
    assert.strictEqual(relation.evidence_status, 'EXPLICIT_SOURCE_TEXT');
    assert.ok(relation.source_text, 'the source sentence is kept verbatim');
    assert.strictEqual(relation.public_active, false, 'no model scope is proven, so the relation stays inactive');
    assert.strictEqual(relation.applicability, 'EVIDENCE_ONLY_SCOPE_UNRESOLVED');
  }
});

test('Phase 85: catalog counts, supersession invariants and fitments stay consistent', () => {
  assert.strictEqual(catalog.parts_count, catalog.parts.length, 'parts_count matches the array');
  assert.strictEqual(new Set(catalog.parts.map((p) => normalize(p.part_number))).size, catalog.parts.length, 'no duplicate part numbers');
  assert.strictEqual(migration.summary.catalog_after, catalog.parts.length);
  assert.strictEqual(
    migration.summary.catalog_before + migration.summary.added_records,
    migration.summary.catalog_after,
    'the audit accounts for every added record'
  );
  assert.strictEqual(migration.summary.fitments_written, 0, 'no fitment was written without an exact application');

  const invariants = supersessions.invariants;
  assert.strictEqual(invariants.total_relations, supersessions.relations.length);
  assert.strictEqual(invariants.self_loops, 0);
  assert.strictEqual(invariants.cycles, 0);
  assert.strictEqual(invariants.invalid_relations_count, 0);
  assert.strictEqual(
    invariants.active_in_catalog_count,
    supersessions.relations.filter((r) => r.active_in_catalog).length
  );
  for (const relation of supersessions.relations) {
    const expectedValue = relation.public_active === true && relation.catalog_status === 'ACTIVE_IN_CATALOG';
    assert.strictEqual(relation.active_in_catalog, expectedValue, `${relation.from_part}->${relation.to_part} flag mismatch`);
  }
});

test('Phase 85: the eBay store merge keeps evidence instead of replacing records', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src/affiliate/EbayOfferStore.js'), 'utf8');
  assert.ok(source.includes('export function mergeEbayOfferRecord'), 'a field-level merge must exist');
  assert.ok(!/merged\.set\(key, canonical\);/.test(source), 'the store may not overwrite a whole record with the incoming one');
  assert.ok(source.includes('first_seen_at'), 'lifecycle timestamps are preserved');
  assert.ok(source.includes('evidence_conflicts'), 'contradictory evidence is recorded, not merged');
});
