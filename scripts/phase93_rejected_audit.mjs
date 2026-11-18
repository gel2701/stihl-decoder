#!/usr/bin/env node
/**
 * scripts/phase93_rejected_audit.mjs
 *
 * Phase 93 — Exhaustive REJECTED Recovery Audit across all 2,689 Phase 92 rejected
 * candidates (+ full Phase 92 batch NEEDS_EVIDENCE & Phase 90-92 check caches).
 *
 * Classifies every REJECTED candidate into:
 *   1. WRONG_PRODUCT_MATCH (blijft REJECTED)
 *   2. CONFLICTING_PART_OR_TYPE (blijft REJECTED)
 *   3. INVALID_BUNDLE_OR_UNIT (blijft REJECTED als bundel; onderdeel blijft in zoekwachtrij voor 1-stuks ASIN)
 *   4. MARKETPLACE_OR_SHIPPING_RESTRICTION (-> NEEDS_EVIDENCE)
 *   5. MISSING_INDEPENDENT_EVIDENCE (-> NEEDS_EVIDENCE)
 *   6. TEMPORARY_API_OR_NETWORK_ERROR (-> NEEDS_EVIDENCE)
 *   7. OTHER_RECOVERABLE_BLOCKER (-> NEEDS_EVIDENCE)
 *
 * Outputs:
 *   - output/phase93/PHASE93_REJECTED_RECOVERY_AUDIT.json
 *   - output/phase93/needs_evidence_pool.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT93 = path.join(ROOT, 'output', 'phase93');
fs.mkdirSync(OUT93, { recursive: true });

const readOpt = (rel, fb = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fb; }
};
const digits = s => String(s || '').replace(/[^0-9]/g, '');

const registry = readOpt('data/affiliate/verified_amazon_registry.json', { offers: [] });
const activeSlots = new Set(
  registry.offers.filter(o => o.status === 'ACTIVE').map(o => `${PartNormalizer.normalizePartNumber(o.part_number)}|${o.marketplace || 'amazon.nl'}`)
);

const checksNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json'),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json'),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json'),
  ...readOpt('output/phase88/product_checks_amazon_nl.json'),
  ...readOpt('output/phase89/product_checks_amazon_nl.json'),
  ...readOpt('output/phase90/product_checks_amazon_nl.json'),
  ...readOpt('output/phase92/product_checks_amazon_nl.json'),
};
const checksDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json'),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json'),
  ...readOpt('output/phase88/product_checks_amazon_de.json'),
  ...readOpt('output/phase89/product_checks_amazon_de.json'),
  ...readOpt('output/phase90/product_checks_amazon_de.json'),
  ...readOpt('output/phase92/product_checks_amazon_de.json'),
};

const NON_STIHL_PRODUCT_RE = /\b(?:bosch\s+siemens|miele|bauknecht|whirlpool|aeg|electrolux|makita|dewalt|milwaukee|karcher|kärcher|gardena|ryobi|einhell|black\s*\+?\s*decker|worx)\b/i;
const COMPLETE_MACHINE_RE = /\b(?:accu[- ]?kettingzaag|akku[- ]?kettensäge|accu[- ]?bosmaaier|benzine[- ]?bosmaaier|benzine[- ]?kettingzaag|benzin[- ]?kettensäge|zonder accu en oplader|ohne akku|motorsäge|laubbläser|heckenschere|freischneider|rasenmäher)\b/i;

const batchDir = path.join(ROOT, 'output/phase92/batches');
const uniqRej = new Map();
const uniqNeFromBatches = new Map();

for (const bf of fs.readdirSync(batchDir).filter(f => f.endsWith('.json')).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(batchDir, bf), 'utf8'));
  for (const r of (doc.rejected || [])) {
    const k = `${r.part_number}|${r.mkt}|${r.asin}`;
    if (!uniqRej.has(k)) uniqRej.set(k, r);
  }
  for (const n of (doc.needs_evidence || [])) {
    const k = `${n.part_number}|${n.mkt}|${n.asin}`;
    if (!uniqNeFromBatches.has(k)) uniqNeFromBatches.set(k, n);
  }
}

const classified = {
  WRONG_PRODUCT_MATCH: [],
  CONFLICTING_PART_OR_TYPE: [],
  INVALID_BUNDLE_OR_UNIT: [],
  MARKETPLACE_OR_SHIPPING_RESTRICTION: [],
  MISSING_INDEPENDENT_EVIDENCE: [],
  TEMPORARY_API_OR_NETWORK_ERROR: [],
  OTHER_RECOVERABLE_BLOCKER: [],
};

for (const r of uniqRej.values()) {
  const reason = r.reason || 'UNKNOWN';
  const chk = (r.mkt === 'amazon.nl' ? checksNl : checksDe)[r.asin] || null;
  const title = chk?.title || '';
  const fullText = chk ? `${title} ${(chk.bullets || []).join(' ')} ${chk.description || ''}` : '';

  if (reason.startsWith('HISTORICAL_MISMATCH') || reason === 'NOT_LISTED_HTTP_404' || reason === 'NOT_LISTED_HTTP_DEAD') {
    classified.WRONG_PRODUCT_MATCH.push({ ...r, category_detail: reason });
    continue;
  }
  if (reason.startsWith('COMPONENT_TYPE_MISMATCH')) {
    classified.CONFLICTING_PART_OR_TYPE.push({ ...r, category_detail: reason });
    continue;
  }
  if (reason.startsWith('MULTIPACK_TITLE')) {
    classified.INVALID_BUNDLE_OR_UNIT.push({ ...r, category_detail: reason });
    continue;
  }
  if (reason.startsWith('ASIN_ALREADY_OWNED_BY_')) {
    classified.MARKETPLACE_OR_SHIPPING_RESTRICTION.push({ ...r, category_detail: reason });
    continue;
  }
  if (reason === 'NOT_LISTED_HTTP_200' || reason.startsWith('NOT_LISTED_HTTP_5') || reason.startsWith('NOT_LISTED_HTTP_429') || reason === 'NOT_LISTED_HTTP_403') {
    classified.TEMPORARY_API_OR_NETWORK_ERROR.push({ ...r, category_detail: reason });
    continue;
  }
  if (reason.startsWith('BAD_OR_MISSING_BRAND:')) {
    classified.MISSING_INDEPENDENT_EVIDENCE.push({ ...r, category_detail: reason });
    continue;
  }
  if (reason === 'MPN_MISSING_ON_DP') {
    // Check if page mentions an explicit DIFFERENT 11-digit STIHL number
    const found11 = [...new Set((fullText.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
    if (found11.some(d => d.length === 11 && d !== r.part_number)) {
      classified.CONFLICTING_PART_OR_TYPE.push({ ...r, category_detail: `CONFLICTING_MPN:${found11.find(d => d !== r.part_number)}` });
    } else if (NON_STIHL_PRODUCT_RE.test(fullText) && !/stihl/i.test(fullText)) {
      classified.WRONG_PRODUCT_MATCH.push({ ...r, category_detail: 'NON_STIHL_PRODUCT_MATCH' });
    } else if (COMPLETE_MACHINE_RE.test(title) && /\b(?:body|accu|cc|cm)\b/i.test(title)) {
      classified.WRONG_PRODUCT_MATCH.push({ ...r, category_detail: 'COMPLETE_MACHINE_NOT_PART' });
    } else {
      classified.MISSING_INDEPENDENT_EVIDENCE.push({
        ...r,
        category_detail: 'MPN_NOT_EXPLICIT_IN_TOP_TEXT',
        has_buybox: Boolean(chk?.hasAddCart),
        listed: Boolean(chk?.listed)
      });
    }
    continue;
  }
  classified.OTHER_RECOVERABLE_BLOCKER.push({ ...r, category_detail: reason });
}

const stayedRejected = [
  ...classified.WRONG_PRODUCT_MATCH,
  ...classified.CONFLICTING_PART_OR_TYPE,
  ...classified.INVALID_BUNDLE_OR_UNIT,
];
const movedToNeedsEvidence = [
  ...classified.MARKETPLACE_OR_SHIPPING_RESTRICTION,
  ...classified.MISSING_INDEPENDENT_EVIDENCE,
  ...classified.TEMPORARY_API_OR_NETWORK_ERROR,
  ...classified.OTHER_RECOVERABLE_BLOCKER,
];

// Combine existing Phase 92 NEEDS_EVIDENCE + moved-from-REJECTED + transient check errors into actionable NEEDS_EVIDENCE pool
const poolMap = new Map();
for (const n of uniqNeFromBatches.values()) {
  if (activeSlots.has(`${n.part_number}|${n.mkt}`)) continue;
  poolMap.set(`${n.part_number}|${n.mkt}|${n.asin}`, {
    part_number: n.part_number,
    mkt: n.mkt,
    asin: n.asin,
    source: 'PHASE92_NEEDS_EVIDENCE',
    reason: n.reason || 'NEEDS_EVIDENCE'
  });
}
for (const m of movedToNeedsEvidence) {
  if (activeSlots.has(`${m.part_number}|${m.mkt}`)) continue;
  poolMap.set(`${m.part_number}|${m.mkt}|${m.asin}`, {
    part_number: m.part_number,
    mkt: m.mkt,
    asin: m.asin,
    source: 'RECOVERED_FROM_REJECTED',
    reason: m.category_detail || m.reason,
    has_buybox: Boolean(m.has_buybox)
  });
}

const counts = Object.fromEntries(Object.entries(classified).map(([k, v]) => [k, v.length]));
const report = {
  phase: '93',
  generated_at: new Date().toISOString(),
  audited_rejected_candidates: uniqRej.size,
  phase92_needs_evidence_baseline: uniqNeFromBatches.size,
  classification_counts: counts,
  stayed_rejected_count: stayedRejected.length,
  moved_to_needs_evidence_count: movedToNeedsEvidence.length,
  combined_needs_evidence_pool_after_audit: poolMap.size,
  combined_unique_parts_in_needs_evidence_pool: new Set([...poolMap.values()].map(x => x.part_number)).size,
  recoverable_parts_from_rejected_including_alt_search: new Set(
    [...movedToNeedsEvidence, ...classified.INVALID_BUNDLE_OR_UNIT].map(x => x.part_number)
  ).size,
};

fs.writeFileSync(path.join(OUT93, 'PHASE93_REJECTED_RECOVERY_AUDIT.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(OUT93, 'needs_evidence_pool.json'), JSON.stringify({
  generated_at: report.generated_at,
  count: poolMap.size,
  items: [...poolMap.values()]
}, null, 2) + '\n', 'utf8');

console.log(JSON.stringify(report, null, 2));
