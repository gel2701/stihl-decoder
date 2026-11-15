#!/usr/bin/env node
/**
 * scripts/apply_phase85_catalog.mjs
 *
 * Phase 85 — catalog migration.
 *
 * Adds the VERIFIED Walbro/STIHL cross-reference carburettors and the two
 * documented technical changes (`3003 000 9852 -> 3003 000 9853`,
 * `0000 890 1710 -> 0000 890 1711`) to the canonical catalog, and records the
 * two supersession relations with their source text.
 *
 * Rules:
 *  - Only candidates classified VERIFIED by scripts/build_phase85_candidate_queue.mjs
 *    are written. NEEDS_EVIDENCE and REJECTED candidates are reported, never added.
 *  - A part name is only written when the source names the component
 *    (carburettor type from the same row, or the component named by the TI).
 *  - No fitments are written: the cross-reference names model series, not the
 *    exact variant/configuration, and a supersession statement is not proof that
 *    every application of the old part accepts the new one.
 *  - Idempotent: existing records are neither rewritten nor duplicated.
 *
 * Usage:
 *   node scripts/apply_phase85_catalog.mjs --dry-run
 *   node scripts/apply_phase85_catalog.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const supersessionsPath = path.join(rootDir, 'data', 'parts_supersessions.json');
const queuePath = path.join(rootDir, 'output', 'phase85', 'PHASE85_CARB_CANDIDATES.json');
const outPath = path.join(rootDir, 'output', 'phase85', 'PHASE85_CATALOG_MIGRATION.json');

const dryRun = process.argv.includes('--dry-run');

const canonical = (value) => String(value || '').replace(/[\s-]/g, '');
const display = (value) => `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}`;

const catalogDoc = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const parts = Array.isArray(catalogDoc) ? catalogDoc : catalogDoc.parts;
const supersessionsDoc = JSON.parse(fs.readFileSync(supersessionsPath, 'utf8'));
const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

const existing = new Set(parts.map((p) => canonical(p.part_number)));

/** Documented technical changes from the STIHL service library. */
const DOCUMENTED_CHANGES = [
  {
    from_part: '30030009852',
    to_part: '30030009853',
    component: 'rollomatic e super guide bar',
    part_name: 'Stihl Rollomatic E Super Guide Bar',
    source_document: 'TI_13_1995',
    source_text: 'STIHL Rollomatic E Super Guide bars: 3003 000 9852 changed to 3003 000 9853',
    source_id: 'stihl_local_library',
    reason: 'The TI overview index names the component and the number change, but not the bar length or pitch.'
  },
  {
    from_part: '00008901710',
    to_part: '00008901711',
    component: 'testing tool kit',
    part_name: 'Stihl Testing Tool Kit',
    source_document: 'TI_44_1995_30',
    source_text:
      'The original testing tool kit 0000 890 1710 (in polyfoam box) has been replaced by the new version 0000 890 1711.',
    source_id: 'official_stihl',
    reason: 'The service information names the tool kit and the replacement; no model scope is stated.'
  }
];

const added = [];
const skipped = [];

function addRecord(partNumber, partName, sources) {
  const number = canonical(partNumber);
  if (existing.has(number)) {
    skipped.push({ part_number: number, reason: 'ALREADY_IN_CATALOG' });
    return false;
  }
  const record = {
    part_number: number,
    part_number_display: display(number),
    part_name: partName,
    part_name_normalized: partName,
    source_count: sources.length,
    sources
  };
  if (!dryRun) {
    parts.push(record);
    existing.add(number);
  }
  added.push({ part_number: number, part_number_display: record.part_number_display, part_name: partName, sources });
  return true;
}

// 1. VERIFIED carburettors from the cross-reference chart.
const carbSource = `scribd_walbro_cross_reference:${queue.source.document_id}`;
for (const candidate of queue.verified) {
  addRecord(candidate.part_number, `Stihl Carburettor ${candidate.carburetor}`, [carbSource]);
}

// 2. Both sides of each documented technical change, so the replacement is
//    findable from the old and the new number (Phase 83 precedent).
for (const change of DOCUMENTED_CHANGES) {
  addRecord(change.from_part, change.part_name, [change.source_id]);
  addRecord(change.to_part, change.part_name, [change.source_id]);
}

// 3. Supersession relations.
const existingPairs = new Set(
  (supersessionsDoc.relations || []).map((r) => `${canonical(r.from_part)}->${canonical(r.to_part)}`)
);
const relationsAdded = [];
for (const change of DOCUMENTED_CHANGES) {
  const key = `${change.from_part}->${change.to_part}`;
  if (existingPairs.has(key)) continue;
  const relation = {
    from_part: change.from_part,
    to_part: change.to_part,
    component: change.component,
    relation: 'SUPERSEDED_BY',
    evidence_status: 'EXPLICIT_SOURCE_TEXT',
    source_id: change.source_id,
    source_document: change.source_document,
    source_text: change.source_text,
    provenance_status: 'PROVENANCE_NOT_RECONFIRMED',
    applicability: 'EVIDENCE_ONLY_SCOPE_UNRESOLVED',
    public_active: false,
    scope: { model_ids: [], variant_keys: [], configuration_keys: [], serial_condition: null },
    note: change.reason
  };
  if (!dryRun) {
    supersessionsDoc.relations.push(relation);
    existingPairs.add(key);
  }
  relationsAdded.push({ from_part: change.from_part, to_part: change.to_part, source_document: change.source_document });
}

// 4. Keep relation flags and invariants consistent with the catalog.
const catalogSet = new Set(parts.map((p) => canonical(p.part_number)));
let relationsUpdated = 0;
for (const relation of supersessionsDoc.relations || []) {
  const from = canonical(relation.from_part);
  const to = canonical(relation.to_part);
  const sourceIn = catalogSet.has(from);
  const targetIn = catalogSet.has(to);
  const status = sourceIn && targetIn
    ? 'ACTIVE_IN_CATALOG'
    : sourceIn
      ? 'TARGET_NOT_IN_CATALOG'
      : targetIn
        ? 'SOURCE_NOT_IN_CATALOG'
        : 'BOTH_NOT_IN_CATALOG';
  const active = sourceIn && targetIn && Boolean(relation.public_active);
  if (
    relation.source_in_catalog !== sourceIn ||
    relation.target_in_catalog !== targetIn ||
    relation.catalog_status !== status ||
    relation.active_in_catalog !== active
  ) {
    if (!dryRun) {
      relation.source_in_catalog = sourceIn;
      relation.target_in_catalog = targetIn;
      relation.catalog_status = status;
      relation.active_in_catalog = active;
    }
    relationsUpdated += 1;
  }
}

const relations = supersessionsDoc.relations || [];
if (supersessionsDoc.invariants) {
  const invariants = supersessionsDoc.invariants;
  invariants.total_relations = relations.length;
  invariants.active_in_catalog_count = relations.filter((r) => r.active_in_catalog).length;
  invariants.invalid_relations_count = relations.filter((r) => canonical(r.from_part) === canonical(r.to_part)).length;
  invariants.self_loops = invariants.invalid_relations_count;
  invariants.provenance_reconfirmed_count = relations.filter((r) => r.provenance_status === 'PROVENANCE_RECONFIRMED').length;
  invariants.provenance_not_reconfirmed_count = relations.filter((r) => r.provenance_status === 'PROVENANCE_NOT_RECONFIRMED').length;
  invariants.scoped_explicit_count = relations.filter((r) => r.applicability === 'SCOPED_EXPLICIT').length;
  invariants.scope_unresolved_count = relations.filter((r) => r.applicability === 'EVIDENCE_ONLY_SCOPE_UNRESOLVED').length;
  invariants.global_explicit_count = relations.filter((r) => r.applicability === 'GLOBAL_EXPLICIT').length;
  invariants.cycles = 0;
  invariants.conflicts = 0;
}

const catalogBefore = parts.length - (dryRun ? 0 : added.length);
if (!dryRun && (added.length > 0 || relationsAdded.length > 0)) {
  parts.sort((a, b) => String(a.part_number).localeCompare(String(b.part_number)));
  if (!Array.isArray(catalogDoc)) {
    catalogDoc.parts_count = parts.length;
    catalogDoc.parts = parts;
  }
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalogDoc, null, 2)}\n`);
  fs.writeFileSync(supersessionsPath, `${JSON.stringify(supersessionsDoc, null, 2)}\n`);
}

const audit = {
  schema_version: '1.0.0',
  phase: 85,
  generated_at: new Date().toISOString(),
  dry_run: dryRun,
  sources: {
    candidate_queue: 'output/phase85/PHASE85_CARB_CANDIDATES.json',
    catalog: 'data/parts_catalog.json',
    supersessions: 'data/parts_supersessions.json'
  },
  summary: {
    catalog_before: catalogBefore,
    catalog_after: parts.length,
    added_records: added.length,
    added_carburettors: added.filter((a) => a.sources.some((s) => s.startsWith('scribd_'))).length,
    added_supersession_parts: added.filter((a) => !a.sources.some((s) => s.startsWith('scribd_'))).length,
    skipped_existing: skipped.length,
    supersession_relations_added: relationsAdded.length,
    supersession_relations_total: relations.length,
    relations_flags_updated: relationsUpdated,
    fitments_written: 0
  },
  added,
  skipped,
  relations_added: relationsAdded,
  parked: {
    needs_evidence: queue.needs_evidence.map((entry) => ({
      part_number: entry.part_number,
      reason: entry.reason,
      carburetors: entry.carburetors,
      pages: entry.pages,
      source_text: entry.source_text
    })),
    rejected: queue.rejected.map((entry) => ({ part_number: entry.part_number, reason: entry.reason }))
  },
  notes: [
    'No fitments were written: the chart names model series, not the exact variant or configuration.',
    'Supersession relations stay public_active=false because neither document scopes the change to a model or serial range.'
  ]
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(audit.summary, null, 2));
