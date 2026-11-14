#!/usr/bin/env node
/**
 * scripts/apply_phase83_supersession_catalog.mjs
 *
 * Phase 83 — Supersession catalog migration.
 *
 * Adds catalog records for supersession *target* part numbers that are named
 * explicitly in an official STIHL technical information document
 * (data/parts_supersessions.json, evidence_status EXPLICIT_SOURCE_TEXT) but
 * are missing from data/parts_catalog.json.
 *
 * Rules (deliberate and conservative):
 *  - Only numbers whose identity is stated in the official document are added.
 *  - Both sides of a relation are considered, so the replacement is findable
 *    from the old and the new part number.
 *  - A record is only created when the document also names the component, so a
 *    defensible part name exists. Relations whose source text only calls a
 *    number "the version" stay NEEDS_EVIDENCE and are reported as such.
 *  - No compatibility/fitment relation is written: a supersession statement is
 *    not proof that every application of the old part accepts the new one.
 *    Where the document itself scopes the models, the scope stays in
 *    parts_supersessions.json (public_active only when provenance reconfirmed).
 *  - Idempotent: existing records are never rewritten or duplicated, and
 *    nothing is ever removed.
 *
 * Usage:
 *   node scripts/apply_phase83_supersession_catalog.mjs --dry-run
 *   node scripts/apply_phase83_supersession_catalog.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const catalogPath = path.join(rootDir, 'data', 'parts_catalog.json');
const supersessionsPath = path.join(rootDir, 'data', 'parts_supersessions.json');
const outDir = path.join(rootDir, 'output', 'phase83');
const auditPath = path.join(outDir, 'PHASE83_SUPERSESSION_MIGRATION.json');

const dryRun = process.argv.includes('--dry-run');

const catalogDoc = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const parts = Array.isArray(catalogDoc) ? catalogDoc : catalogDoc.parts;
const supersessionsDoc = JSON.parse(fs.readFileSync(supersessionsPath, 'utf8'));

const canonical = (value) => String(value || '').replace(/[\s-]/g, '');
const display = (value) => `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}`;

function componentName(relation) {
  const component = String(relation.component || '').trim();
  if (!component || /^version$/i.test(component)) return null;
  const cleaned = component.replace(/\s+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const existing = new Set(parts.map((p) => canonical(p.part_number)));

// Collect every number named by a supersession relation, with the role it plays.
const candidates = new Map();
for (const relation of supersessionsDoc.relations || []) {
  const from = canonical(relation.from_part);
  const to = canonical(relation.to_part);
  if (!/^\d{11}$/.test(to)) continue;
  const entry = candidates.get(to) || { part_number: to, role: 'SUPERSESSION_TARGET', relations: [] };
  entry.relations.push(relation);
  candidates.set(to, entry);
  if (/^\d{11}$/.test(from) && !candidates.has(from)) {
    candidates.set(from, { part_number: from, role: 'SUPERSEDED_SOURCE', relations: [] });
  }
  const sourceEntry = candidates.get(from);
  if (sourceEntry) sourceEntry.relations.push(relation);
}

const added = [];
const skippedExisting = [];
const needsEvidence = [];

for (const [partNumber, entry] of candidates) {
  if (existing.has(partNumber)) {
    skippedExisting.push({ part_number: partNumber, role: entry.role, reason: 'ALREADY_IN_CATALOG' });
    continue;
  }

  const named = entry.relations.find((r) => componentName(r));
  if (!named) {
    needsEvidence.push({
      part_number: partNumber,
      part_number_display: display(partNumber),
      role: entry.role,
      reason: 'COMPONENT_NAME_NOT_STATED_IN_OFFICIAL_SOURCE',
      source_documents: [...new Set(entry.relations.map((r) => r.source_document))],
      source_text: entry.relations.map((r) => r.source_text)
    });
    continue;
  }

  const partName = componentName(named);
  const record = {
    part_number: partNumber,
    part_number_display: display(partNumber),
    part_name: partName,
    part_name_normalized: partName,
    source_count: 1,
    sources: [`official_stihl_ti:${named.source_document}`]
  };

  if (!dryRun) {
    parts.push(record);
    existing.add(partNumber);
  }

  const related = entry.relations[0];
  added.push({
    part_number: partNumber,
    part_number_display: record.part_number_display,
    part_name: partName,
    role: entry.role,
    replaces: entry.role === 'SUPERSESSION_TARGET' ? canonical(related.from_part) : null,
    replaced_by: entry.role === 'SUPERSEDED_SOURCE' ? canonical(related.to_part) : null,
    component: named.component,
    relation: named.relation,
    evidence_status: named.evidence_status,
    provenance_status: named.provenance_status,
    applicability: named.applicability,
    public_active: Boolean(named.public_active),
    documented_model_scope: Array.isArray(named.scope?.model_ids) ? named.scope.model_ids : [],
    serial_condition: named.scope?.serial_condition?.raw_text || null,
    source_id: named.source_id,
    source_document: named.source_document,
    source_text: named.source_text,
    fitments_written: 0,
    compatibility_note:
      'Geen fitment-relatie geschreven: een supersession-verklaring bewijst niet dat elke toepassing van het oude onderdeel het nieuwe accepteert. Alleen de in het TI-document genoemde modelscope is vastgelegd.'
  });
}

// Keep the supersession document consistent with the catalog it describes.
const catalogSet = new Set(parts.map((p) => canonical(p.part_number)));
let relationsUpdated = 0;
for (const relation of supersessionsDoc.relations || []) {
  const from = canonical(relation.from_part);
  const to = canonical(relation.to_part);
  const sourceIn = catalogSet.has(from);
  const targetIn = catalogSet.has(to);
  const status = sourceIn && targetIn ? 'ACTIVE_IN_CATALOG' : sourceIn ? 'TARGET_NOT_IN_CATALOG' : targetIn ? 'SOURCE_NOT_IN_CATALOG' : 'BOTH_NOT_IN_CATALOG';
  const active = sourceIn && targetIn && Boolean(relation.public_active);
  if (relation.source_in_catalog !== sourceIn || relation.target_in_catalog !== targetIn || relation.catalog_status !== status || relation.active_in_catalog !== active) {
    relation.source_in_catalog = sourceIn;
    relation.target_in_catalog = targetIn;
    relation.catalog_status = status;
    relation.active_in_catalog = active;
    relationsUpdated += 1;
  }
}

const relations = supersessionsDoc.relations || [];
if (supersessionsDoc.invariants) {
  supersessionsDoc.invariants.active_in_catalog_count = relations.filter((r) => r.active_in_catalog).length;
  supersessionsDoc.invariants.invalid_relations_count = relations.filter((r) => canonical(r.from_part) === canonical(r.to_part)).length;
  supersessionsDoc.invariants.self_loops = relations.filter((r) => canonical(r.from_part) === canonical(r.to_part)).length;
  supersessionsDoc.invariants.total_relations = relations.length;
}

if (!dryRun && (added.length > 0 || relationsUpdated > 0)) {
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
  phase: '83',
  generated_at: new Date().toISOString(),
  dry_run: dryRun,
  source: {
    catalog: 'data/parts_catalog.json',
    supersessions: 'data/parts_supersessions.json'
  },
  summary: {
    catalog_before: parts.length - (dryRun ? 0 : added.length),
    catalog_after: parts.length,
    relations_total: (supersessionsDoc.relations || []).length,
    supersession_numbers_total: candidates.size,
    added_records: added.length,
    added_supersession_targets: added.filter((a) => a.role === 'SUPERSESSION_TARGET').length,
    added_superseded_sources: added.filter((a) => a.role === 'SUPERSEDED_SOURCE').length,
    already_in_catalog: skippedExisting.length,
    needs_evidence: needsEvidence.length,
    relations_flag_updates: relationsUpdated,
    active_in_catalog_relations: relations.filter((r) => r.active_in_catalog).length,
    removed_records: 0,
    fitments_written: 0
  },
  added,
  already_in_catalog: skippedExisting,
  needs_evidence: needsEvidence
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);

console.log(JSON.stringify(audit.summary, null, 2));
console.log(`Audit: ${path.relative(rootDir, auditPath)}`);
