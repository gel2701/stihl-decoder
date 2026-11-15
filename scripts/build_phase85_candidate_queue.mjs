#!/usr/bin/env node
/**
 * scripts/build_phase85_candidate_queue.mjs
 *
 * Phase 85 — Walbro/STIHL cross-reference intake.
 *
 * Parses the Walbro/STIHL cross-reference chart from the exported Scribd
 * corpus, repairs the provable OCR spacing damage ("W T 194" -> "WT 194",
 * "C hain Saw" -> "Chain Saw"), and classifies every candidate number:
 *
 *   VERIFIED   the row is internally consistent and structurally plausible:
 *              STIHL group code 120 (carburettor), one carburettor code anchored
 *              at the end of the same row, that code repeating identically for
 *              every occurrence, and a neighbour in the same series sequence.
 *   NEEDS_EVIDENCE  the row lost its carburettor code, the code is truncated, or
 *              two codes claim the same number.
 *   REJECTED   the STIHL group code is not 120, so the "number" is not a
 *              carburettor at all (column shift / OCR damage).
 *
 * The queue never writes to the catalog: activation is a separate, audited step
 * (scripts/apply_phase85_catalog.mjs).
 *
 * Usage:
 *   PHASE85_SCRIBD_DIR=/tmp/gd/scribd node scripts/build_phase85_candidate_queue.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const scribdDir = process.env.PHASE85_SCRIBD_DIR || '';
const outPath = path.join(rootDir, 'output', 'phase85', 'PHASE85_CARB_CANDIDATES.json');

const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
const catalogNumbers = new Set(catalog.parts.map((p) => String(p.part_number)));

const CARB_RE = /(W[ATJGY]|C1[QS]|C3A|HU|HD|HS|HK|WJ|WG|WY)[\s-]?([A-Z0-9]{1,4})/;
const NUMBER_RE = /(\d{4})\s*-?\s*(\d{3})\s*-?\s*(\d{3})\s*-?\s*(\d)(?!\d)/g;
const DISCONTINUED_RE = /no\s*longer\s*avai\s*lable/i;

/** Repairs only spacing damage: single letters that OCR split from their word. */
function repairSpacing(value) {
  let text = String(value).replace(/\s+/g, ' ');
  for (let pass = 0; pass < 4; pass += 1) {
    text = text.replace(/(^|\s)([A-Za-z])\s+(?=[A-Za-z])/g, '$1$2');
  }
  return text;
}

function findCrossReferenceDocument(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!/walbro/i.test(text)) continue;
    if (!/cross\s*reference/i.test(text)) continue;
    return {
      file,
      title: (text.match(/\*\*Document Title\*\*: (.*)/) || [])[1]?.trim() || file,
      documentId: (text.match(/\*\*Scribd Document ID\*\*: (\d+)/) || [])[1] || null,
      url: (text.match(/\*\*Original Scribd Document URL\*\*: \[([^\]]+)\]/) || [])[1] || null,
      pages: [...text.matchAll(/### Page (\d+)\s*```text\s*([\s\S]*?)```/g)]
        .map((m) => ({ page: Number(m[1]), body: m[2] }))
        .filter((p) => p.body.length > 800)
    };
  }
  return null;
}

const doc = findCrossReferenceDocument(scribdDir);
if (!doc) {
  console.error(`Walbro cross-reference document not found in ${scribdDir || '(PHASE85_SCRIBD_DIR not set)'}`);
  process.exit(1);
}

const rows = [];
const repairs = [];
for (const page of doc.pages) {
  const flat = page.body.replace(/\s+/g, ' ');
  NUMBER_RE.lastIndex = 0;
  let match;
  let cursor = 0;
  while ((match = NUMBER_RE.exec(flat))) {
    const partNumber = match[1] + match[2] + match[3] + match[4];
    const rawSegment = flat.slice(cursor, match.index).trim();
    cursor = NUMBER_RE.lastIndex;
    if (rawSegment.length < 8) continue;

    const repaired = repairSpacing(rawSegment).replace(/no\s*longer\s*avai\s*lable/gi, '').trim();
    if (repaired !== rawSegment.replace(/\s+/g, ' ').replace(/no\s*longer\s*avai\s*lable/gi, '').trim()) {
      repairs.push({ part_number: partNumber, page: page.page, before: rawSegment.slice(-60), after: repaired.slice(-60) });
    }

    const tail = repaired.slice(-26);
    const carbMatch = tail.match(CARB_RE);
    const anchored = Boolean(carbMatch && /\d/.test(carbMatch[2] || ''));
    const modelMatch = repaired.match(
      /(?:^|\s)(MS\s?\d{3}[A-Z]*|\d{3}[A-Z]*|[A-Z]{2}\s?\d{2,3}(?:\s?[A-Z])?)(?=\s+(?:chain\s*saw|string\s*trimmer|brush\s*cutter|cut-?\s*off|hedge|blower|trimmer|pole))/i
    );

    rows.push({
      page: page.page,
      part_number: partNumber,
      carburetor: carbMatch ? carbMatch[0].trim() : null,
      carburetor_anchored: anchored,
      model_text: modelMatch ? modelMatch[0].trim() : null,
      discontinued_in_source: DISCONTINUED_RE.test(rawSegment),
      source_text: rawSegment.slice(-120),
      repaired_text: repaired.slice(-120)
    });
  }
}

const missing = rows.filter((row) => !catalogNumbers.has(row.part_number));
const byNumber = new Map();
for (const row of missing) {
  if (!byNumber.has(row.part_number)) byNumber.set(row.part_number, []);
  byNumber.get(row.part_number).push(row);
}

// Sequence neighbourhood is measured over every number the chart shows, so a
// number whose neighbours are already in the catalog still counts as supported.
const seriesSequences = new Map();
for (const row of rows) {
  const series = row.part_number.slice(0, 4);
  if (!seriesSequences.has(series)) seriesSequences.set(series, new Set());
  seriesSequences.get(series).add(Number(row.part_number.slice(7)));
}
const hasNeighbour = (partNumber) => {
  const series = partNumber.slice(0, 4);
  const seq = Number(partNumber.slice(7));
  const seen = seriesSequences.get(series) || new Set();
  return [...seen].some((other) => other !== seq && Math.abs(other - seq) <= 10);
};

const verified = [];
const needsEvidence = [];
const rejected = [];
for (const [partNumber, occurrences] of byNumber) {
  const carburetors = [...new Set(occurrences.map((o) => o.carburetor).filter(Boolean))];
  const models = [...new Set(occurrences.map((o) => o.model_text).filter(Boolean))];
  const group = partNumber.slice(4, 7);
  const base = {
    part_number: partNumber,
    occurrences: occurrences.length,
    pages: [...new Set(occurrences.map((o) => o.page))],
    carburetors,
    model_texts: models,
    discontinued_in_source: occurrences.some((o) => o.discontinued_in_source),
    source_text: occurrences[0].source_text,
    repaired_text: occurrences[0].repaired_text
  };

  if (group !== '120') {
    rejected.push({ ...base, reason: 'STIHL group code is not 120, so the number is not a carburettor' });
    continue;
  }
  if (carburetors.length === 0) {
    needsEvidence.push({ ...base, reason: 'No carburettor code survived in the row' });
    continue;
  }
  if (carburetors.length > 1) {
    needsEvidence.push({ ...base, reason: 'Two different carburettor codes claim this number' });
    continue;
  }
  if (!occurrences.every((o) => o.carburetor_anchored)) {
    needsEvidence.push({ ...base, reason: 'Carburettor code is not anchored to this row (column shift)' });
    continue;
  }
  if (!hasNeighbour(partNumber)) {
    needsEvidence.push({ ...base, reason: 'No neighbouring number in the same series sequence to confirm the digits' });
    continue;
  }
  verified.push({ ...base, carburetor: carburetors[0] });
}

const artifact = {
  schema_version: '1.0.0',
  phase: 85,
  generated_at: new Date().toISOString(),
  source: {
    document_title: doc.title,
    document_id: doc.documentId,
    url: doc.url,
    pages_with_table_text: doc.pages.length
  },
  parsing: {
    rows_extracted: rows.length,
    distinct_numbers_in_table: new Set(rows.map((r) => r.part_number)).size,
    distinct_missing_from_catalog: byNumber.size,
    ocr_spacing_repairs: repairs.length,
    ocr_repair_samples: repairs.slice(0, 10)
  },
  classification: {
    VERIFIED: verified.length,
    NEEDS_EVIDENCE: needsEvidence.length,
    REJECTED: rejected.length,
    verified_with_model_text: verified.filter((v) => v.model_texts.length).length,
    needs_evidence_by_reason: needsEvidence.reduce((acc, entry) => {
      acc[entry.reason] = (acc[entry.reason] || 0) + 1;
      return acc;
    }, {})
  },
  verified,
  needs_evidence: needsEvidence,
  rejected,
  catalog_untouched: { parts_in_catalog: catalog.parts.length, written_records: 0 }
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(artifact.classification, null, 2));
console.log(JSON.stringify(artifact.parsing, null, 2).slice(0, 400));
