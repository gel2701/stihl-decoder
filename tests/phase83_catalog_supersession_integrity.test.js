import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PartCatalogResolver } from '../src/parts/PartCatalogResolver.js';
import { checkPartSupersession } from '../src/search/IntelligentPartsSearchEngine.js';

/**
 * Phase 83 — Catalog expansion, supersession migration and shrink protection.
 *
 * 83.1 The catalog count is explained and locked (18,397 = 18,373 GHS baseline
 *      + 4 documented chain parts from Phase 75b/e/f + 20 supersession numbers
 *      from Phase 83), with no duplicates or malformed numbers.
 * 83.2 No canonical part number may silently disappear: every number in the
 *      Phase 83 baseline snapshot must still exist.
 * 83.3 The supersession graph is internally consistent (no self-loops, no
 *      cycles, no duplicate pairs) and its catalog flags match the catalog.
 * 83.4 The documented supersession numbers are either in the catalog or
 *      explicitly parked as NEEDS_EVIDENCE in the migration audit.
 * 83.5 The relation is searchable from both part numbers.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const baselinePath = path.join(rootDir, 'data', 'parts_catalog_baseline_phase83.json');
const supersessionsPath = path.join(rootDir, 'data', 'parts_supersessions.json');
const migrationAuditPath = path.join(rootDir, 'output', 'phase83', 'PHASE83_SUPERSESSION_MIGRATION.json');

const EXPECTED_CATALOG_COUNT = 18397;

const canonical = (value) => String(value || '').replace(/[\s-]/g, '');

const catalogDoc = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const catalogParts = Array.isArray(catalogDoc) ? catalogDoc : catalogDoc.parts;
const baselineDoc = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const supersessionsDoc = JSON.parse(fs.readFileSync(supersessionsPath, 'utf8'));
const migrationAudit = JSON.parse(fs.readFileSync(migrationAuditPath, 'utf8'));
const relations = supersessionsDoc.relations || [];

test('83.1 Catalog count is exactly 18,397 with no duplicates and only canonical 11-digit numbers', () => {
  assert.strictEqual(catalogParts.length, EXPECTED_CATALOG_COUNT, `Catalog must contain exactly ${EXPECTED_CATALOG_COUNT} parts`);
  if (!Array.isArray(catalogDoc)) {
    assert.strictEqual(catalogDoc.parts_count, EXPECTED_CATALOG_COUNT, 'parts_count must match the parts array');
  }

  const seen = new Set();
  const duplicates = [];
  const malformed = [];
  for (const part of catalogParts) {
    const number = canonical(part.part_number);
    if (!/^\d{11}$/.test(number)) malformed.push(part.part_number);
    if (seen.has(number)) duplicates.push(number);
    seen.add(number);
  }

  assert.deepStrictEqual(duplicates, [], 'Duplicate canonical part numbers are not allowed');
  assert.deepStrictEqual(malformed, [], 'Every catalog record must use an 11-digit canonical part number');
});

test('83.2 No canonical part number disappears from the catalog', () => {
  const current = new Set(catalogParts.map((p) => canonical(p.part_number)));
  const missing = baselineDoc.part_numbers.filter((number) => !current.has(number));
  assert.deepStrictEqual(missing, [], `Catalog shrank: ${missing.length} baseline part numbers are missing`);

  assert.ok(
    catalogParts.length >= baselineDoc.parts_count,
    'Catalog may grow but must never shrink below the Phase 83 baseline'
  );
});

test('83.3 Supersession graph is consistent and its catalog flags match the catalog', () => {
  const numbers = new Set(catalogParts.map((p) => canonical(p.part_number)));
  const pairs = new Set();
  const edges = new Map();

  for (const relation of relations) {
    const from = canonical(relation.from_part);
    const to = canonical(relation.to_part);

    assert.match(from, /^\d{11}$/, `Invalid supersession source ${relation.from_part}`);
    assert.match(to, /^\d{11}$/, `Invalid supersession target ${relation.to_part}`);
    assert.notStrictEqual(from, to, 'Self-referencing supersession is not allowed');

    const key = `${from}->${to}`;
    assert.ok(!pairs.has(key), `Duplicate supersession pair ${key}`);
    pairs.add(key);

    if (!edges.has(from)) edges.set(from, []);
    edges.get(from).push(to);

    assert.strictEqual(relation.source_in_catalog, numbers.has(from), `source_in_catalog mismatch for ${key}`);
    assert.strictEqual(relation.target_in_catalog, numbers.has(to), `target_in_catalog mismatch for ${key}`);

    const expectedStatus = relation.source_in_catalog && relation.target_in_catalog
      ? 'ACTIVE_IN_CATALOG'
      : relation.source_in_catalog
        ? 'TARGET_NOT_IN_CATALOG'
        : relation.target_in_catalog
          ? 'SOURCE_NOT_IN_CATALOG'
          : 'BOTH_NOT_IN_CATALOG';
    assert.strictEqual(relation.catalog_status, expectedStatus, `catalog_status mismatch for ${key}`);

    assert.strictEqual(
      relation.active_in_catalog,
      relation.source_in_catalog && relation.target_in_catalog && Boolean(relation.public_active),
      `active_in_catalog mismatch for ${key}`
    );
  }

  // Cycle detection over the SUPERSEDED_BY graph.
  const state = new Map();
  const visit = (node) => {
    if (state.get(node) === 'VISITING') return true;
    if (state.get(node) === 'DONE') return false;
    state.set(node, 'VISITING');
    for (const next of edges.get(node) || []) {
      if (visit(next)) return true;
    }
    state.set(node, 'DONE');
    return false;
  };
  for (const node of edges.keys()) {
    assert.strictEqual(visit(node), false, `Circular supersession detected at ${node}`);
  }
});

test('83.4 Every documented supersession number is in the catalog or parked as NEEDS_EVIDENCE', () => {
  assert.strictEqual(migrationAudit.summary.removed_records, 0, 'Migration must never remove records');
  assert.ok(migrationAudit.summary.added_records > 0, 'Migration must add the documented records');

  const numbers = new Set(catalogParts.map((p) => canonical(p.part_number)));
  for (const added of migrationAudit.added) {
    assert.ok(numbers.has(added.part_number), `Added supersession part ${added.part_number} must exist in the catalog`);
  }

  const parked = new Set(migrationAudit.needs_evidence.map((entry) => entry.part_number));
  for (const relation of relations) {
    const from = canonical(relation.from_part);
    const to = canonical(relation.to_part);
    for (const number of [from, to]) {
      assert.ok(
        numbers.has(number) || parked.has(number),
        `Supersession number ${number} must be catalogued or parked as NEEDS_EVIDENCE`
      );
    }
  }
});

test('83.5 The replacement is findable from both part numbers', () => {
  const activated = relations.find((r) => r.active_in_catalog && r.source_in_catalog && r.target_in_catalog);
  assert.ok(activated, 'At least one supersession must be active in the catalog');

  const fromProfile = PartCatalogResolver.resolvePartNumber(activated.from_part);
  assert.ok(fromProfile?.technical_profile?.supersession, 'Superseded part must expose a supersession profile');
  assert.strictEqual(fromProfile.technical_profile.supersession.replaced_by, activated.to_part);
  assert.strictEqual(fromProfile.technical_profile.supersession.target_in_catalog, true);

  const notice = checkPartSupersession(activated.from_part);
  assert.ok(notice, 'Search must surface the supersession notice for the old number');
  assert.strictEqual(notice.type, 'SUPERSEDED_BY');
  assert.strictEqual(notice.target_part, activated.to_part);

  const targetProfile = PartCatalogResolver.resolvePartNumber(activated.to_part);
  assert.ok(targetProfile?.part_number, 'Replacement part must resolve in the catalog');
  assert.strictEqual(canonical(targetProfile.part_number), activated.to_part);
});
