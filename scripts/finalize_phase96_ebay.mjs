#!/usr/bin/env node
/**
 * scripts/finalize_phase96_ebay.mjs
 *
 * Aggregates the Phase 96 batch results into one activation report and writes
 * the human-readable summary. Reads only files the runner produced; the store
 * itself is not modified here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT96 = path.join(ROOT, 'output', 'phase96');

const BASELINE_STORE_OFFERS = 1773;
const BASELINE_STORE_PARTS = 220;

const files = fs.existsSync(path.join(OUT96, 'batches'))
  ? fs.readdirSync(path.join(OUT96, 'batches')).filter(f => f.endsWith('_result.json')).sort()
  : [];
const results = files.map(f => JSON.parse(fs.readFileSync(path.join(OUT96, 'batches', f), 'utf8')));
const store = loadEbayOfferStore(path.join(ROOT, 'data', 'affiliate', 'ebay_offers.json'));

const accepted = results.flatMap(r => r.accepted_offers || []);
const needs = results.flatMap(r => (r.needs_evidence_offers || []).map(o => ({ ...o, batch: r.batch_id })));
const rejected = results.flatMap(r => (r.rejected_offers || []).map(o => ({ ...o, batch: r.batch_id })));
const perPart = results.flatMap(r => (r.per_part || []).map(p => ({ ...p, batch: r.batch_id })));

const acceptedParts = [...new Set(accepted.map(o => o.part_number))].sort();
const acceptedMarketplaces = accepted.reduce((acc, offer) => {
  acc[offer.marketplace] = (acc[offer.marketplace] || 0) + 1;
  return acc;
}, {});

const needsByReason = {};
for (const offer of needs) {
  // The engine records what is missing as evidence_gaps on a REVIEW offer;
  // that is the actionable reason (e.g. SHIPPING_TO_NL, LISTING_MPN).
  const reason = (offer.evidence_gaps || [])[0] || offer.first_blocking_step || (offer.reason_codes || [])[0] || 'UNKNOWN';
  needsByReason[reason] = (needsByReason[reason] || 0) + 1;
}
const rejectedByReason = {};
for (const offer of rejected) {
  const reason = offer.primary_reason || (offer.reason_codes || [])[0] || 'UNKNOWN';
  rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1;
}

const partsWithoutListing = perPart.filter(p => p.decision === 'NO_LISTING_FOUND').length;
const gscParts = perPart.filter(p => p.gsc_priority_model);
const gscActiveParts = acceptedParts.filter(part => gscParts.some(p => p.part_number === part));

const modelCoverage = new Map();
for (const part of acceptedParts) {
  const entry = perPart.find(p => p.part_number === part);
  for (const model of (entry?.models || [])) {
    if (!modelCoverage.has(model)) modelCoverage.set(model, new Set());
    modelCoverage.get(model).add(part);
  }
}

const storeParts = new Set(store.offers.map(o => o.part_number));

const summary = {
  phase: '96',
  generated_at: new Date().toISOString(),
  batches_completed: results.map(r => r.batch_id),
  baseline: {
    ebay_active_offers: BASELINE_STORE_OFFERS,
    ebay_unique_parts: BASELINE_STORE_PARTS
  },
  result: {
    ebay_active_offers_after: store.offers.filter(o => o.status === 'ACTIVE').length,
    ebay_unique_parts_after: storeParts.size,
    new_active_offers: accepted.length,
    new_active_parts: acceptedParts.length,
    new_parts_without_amazon_link: perPart.filter(p => acceptedParts.includes(p.part_number) && p.has_amazon_direct_link === false).length,
    new_parts_on_gsc_priority_models: gscActiveParts.length,
    parts_searched: perPart.filter(p => !p.skipped).length,
    parts_without_any_listing: partsWithoutListing,
    needs_evidence_candidates: needs.length,
    rejected_candidates: rejected.length,
    evidence_enriched_parts: perPart.filter(p => (p.evidence_enriched || 0) > 0).length,
    evidence_reused_parts: perPart.filter(p => (p.evidence_reused || 0) > 0).length
  },
  accepted_marketplaces: acceptedMarketplaces,
  accepted_parts: acceptedParts,
  models_covered: [...modelCoverage.entries()]
    .map(([model, parts]) => ({ model, parts: [...parts] }))
    .sort((a, b) => b.parts.length - a.parts.length),
  needs_evidence_by_reason: needsByReason,
  rejected_by_reason: rejectedByReason,
  accepted_offers: accepted,
  needs_evidence_offers: needs.map(o => ({
    part_number: o.part_number,
    item_id: o.item_id,
    marketplace: o.marketplace,
    title: o.title,
    decision: o.decision,
    reason_codes: o.reason_codes,
    first_blocking_step: o.first_blocking_step,
    evidence_gaps: o.evidence_gaps
  })),
  rejected_offers: rejected,
  per_part: perPart
};

fs.writeFileSync(
  path.join(OUT96, 'PHASE96_EBAY_ACTIVATION.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify({
  batches: summary.batches_completed.length,
  baseline: summary.baseline,
  result: summary.result,
  accepted_marketplaces: acceptedMarketplaces,
  needs_evidence_by_reason: needsByReason,
  rejected_by_reason: rejectedByReason
}, null, 2));
