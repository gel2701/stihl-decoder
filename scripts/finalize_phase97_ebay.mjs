#!/usr/bin/env node
/**
 * scripts/finalize_phase97_ebay.mjs
 *
 * Aggregates the Phase 97 batch results into output/phase97/PHASE97_EBAY_ACTIVATION.json.
 * Reads the runner's artefacts and the store; it never writes offers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT97 = path.join(ROOT, 'output', 'phase97');

const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const store = loadEbayOfferStore(path.join(ROOT, 'data', 'affiliate', 'ebay_offers.json'));
const activeOffers = store.offers.filter(offer => offer.status === 'ACTIVE');
const storeParts = new Set(activeOffers.map(offer => offer.part_number));
const presentKeys = new Set(activeOffers.map(offer => `${offer.part_number}:${offer.marketplace}:${offer.item_id}`));

const amazon = readJson('data/affiliate/verified_amazon_registry.json');
const amazonParts = new Set((amazon.offers || [])
  .filter(offer => offer.status === 'ACTIVE')
  .map(offer => offer.part_number)
  .filter(Boolean));

const progressFiles = fs.existsSync(path.join(OUT97, 'batches'))
  ? fs.readdirSync(path.join(OUT97, 'batches')).filter(file => file.endsWith('_progress.json')).sort()
  : [];
const progress = progressFiles.map(file => readJson(path.join('output', 'phase97', 'batches', file)));
// The progress file is the checkpoint the runner updates after every part, so it
// is the authoritative record; a result file written before a rate-limit reset
// may still list parts that were put back into the queue.
const results = progress.map(item => ({
  batch_id: item.batch_id,
  complete: item.complete === true,
  rate_limited: item.rate_limited === true,
  accepted_offers: item.accepted_offers || [],
  needs_evidence_offers: item.needs_evidence_offers || [],
  rejected_offers: item.rejected_offers || [],
  per_part: item.per_part || []
}));
const completed = results.filter(result => result.complete);

// Every accepted record the runner wrote must still be ACTIVE in the store.
const acceptedRaw = results.flatMap(result => (result.accepted_offers || []).map(offer => ({ ...offer, batch: result.batch_id })));
const accepted = acceptedRaw.filter(offer => presentKeys.has(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`));
const dropped = acceptedRaw.length - accepted.length;
const acceptedByKey = new Map();
for (const offer of accepted) acceptedByKey.set(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`, offer);
const acceptedUnique = [...acceptedByKey.values()];
const acceptedParts = [...new Set(acceptedUnique.map(offer => offer.part_number))].sort();

const needs = results.flatMap(result => (result.needs_evidence_offers || []).map(offer => ({ ...offer, batch: result.batch_id })));
const rejected = results.flatMap(result => (result.rejected_offers || []).map(offer => ({ ...offer, batch: result.batch_id })));
const perPart = results.flatMap(result => (result.per_part || []).map(entry => ({ ...entry, batch: result.batch_id })));

const needsByReason = {};
for (const offer of needs) {
  const reason = (offer.evidence_gaps || [])[0] || offer.first_blocking_step || (offer.reason_codes || [])[0] || 'UNKNOWN';
  needsByReason[reason] = (needsByReason[reason] || 0) + 1;
}
const rejectedByReason = {};
for (const offer of rejected) {
  const reason = offer.primary_reason || (offer.reason_codes || [])[0] || 'UNKNOWN';
  rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1;
}

const acceptedMarketplaces = {};
for (const offer of acceptedUnique) {
  acceptedMarketplaces[offer.marketplace] = (acceptedMarketplaces[offer.marketplace] || 0) + 1;
}

// Model coverage added by the newly covered parts.
const modelCoverage = new Map();
for (const part of acceptedParts) {
  const entry = perPart.find(item => item.part_number === part);
  for (const model of (entry?.models || [])) {
    if (!modelCoverage.has(model)) modelCoverage.set(model, new Set());
    modelCoverage.get(model).add(part);
  }
}

// LISTING_MPN backlog: how many of those parts have a link now.
const mpnDoc = readJson('output/phase97/listing_mpn_groups.json');
const mpnGroups = mpnDoc.groups.map(group => ({
  ...group,
  has_active_ebay_offer: storeParts.has(group.part_number)
}));
const mpnRetryParts = mpnGroups.filter(group => !group.has_active_ebay_offer).map(group => group.part_number);
const mpnBefore = mpnDoc.summary.parts_with_active_ebay_offer;
const mpnAfter = mpnGroups.filter(group => group.has_active_ebay_offer).length;
const mpnBeforeSet = new Set(mpnDoc.groups
  .filter(group => group.has_active_ebay_offer)
  .map(group => group.part_number));
const mpnGroupParts = new Set(mpnDoc.groups.map(group => group.part_number));
const mpnGained = acceptedParts.filter(part => mpnGroupParts.has(part) && !mpnBeforeSet.has(part));

const baseline = readJson('output/phase97/PHASE97_BASELINE.json');
const campaigns = new Set(activeOffers.map(offer => offer.campaign_id).filter(Boolean));

const summary = {
  phase: '97',
  generated_at: new Date().toISOString(),
  baseline: {
    ebay_active_offers: baseline.store_after_phase96.active_offers,
    ebay_unique_parts: baseline.store_after_phase96.unique_parts,
    amazon_active_parts: amazonParts.size,
    combined_unique_parts: new Set([...storeParts, ...amazonParts]).size
  },
  batches: {
    ids: completed.map(result => result.batch_id),
    complete: completed.length,
    incomplete: results.filter(result => !result.complete).map(result => result.batch_id),
    rate_limited: results.filter(result => result.rate_limited).map(result => result.batch_id),
    progress_files: progress.map(item => ({
      batch_id: item.batch_id,
      resolved: (item.processed_parts || []).length,
      complete: item.complete === true,
      rate_limited: item.rate_limited === true
    }))
  },
  result: {
    ebay_active_offers_after: activeOffers.length,
    ebay_unique_parts_after: storeParts.size,
    new_active_offers: acceptedUnique.length,
    new_active_parts: acceptedParts.length,
    new_parts_without_amazon_link: perPart.filter(entry => acceptedParts.includes(entry.part_number) && entry.has_amazon_direct_link === false).length,
    new_parts_on_gsc_priority_models: acceptedParts.filter(part => perPart.some(entry => entry.part_number === part && entry.gsc_priority_model)).length,
    combined_unique_parts_after: new Set([...storeParts, ...amazonParts]).size,
    parts_searched: perPart.filter(entry => !entry.skipped && !entry.error).length,
    parts_already_active: perPart.filter(entry => entry.skipped === 'ALREADY_ACTIVE').length,
    parts_without_any_listing: perPart.filter(entry => entry.decision === 'NO_LISTING_FOUND').length,
    needs_evidence_candidates: needs.length,
    rejected_candidates: rejected.length,
    evidence_enriched_parts: perPart.filter(entry => (entry.evidence_enriched || 0) > 0).length,
    evidence_reused_parts: perPart.filter(entry => (entry.evidence_reused || 0) > 0).length,
    dropped_records: dropped
  },
  accepted_marketplaces: acceptedMarketplaces,
  accepted_parts: acceptedParts,
  models_covered: [...modelCoverage.entries()]
    .map(([model, parts]) => ({ model, parts: [...parts] }))
    .sort((a, b) => b.parts.length - a.parts.length || a.model.localeCompare(b.model)),
  listing_mpn: {
    candidates: mpnDoc.summary.candidates,
    unique_parts: mpnDoc.summary.unique_parts,
    parts_with_active_ebay_offer_before: mpnBefore,
    parts_with_active_ebay_offer_after: mpnAfter,
    parts_gained_link: mpnGained,
    parts_still_without_link: mpnRetryParts
  },
  needs_evidence_by_reason: needsByReason,
  rejected_by_reason: rejectedByReason,
  campaign: {
    store_campaign_ids: [...campaigns],
    environment_matches_store: [...campaigns].every(id => id === process.env.EBAY_EPN_CAMPAIGN_ID)
  },
  accepted_offers: acceptedUnique,
  needs_evidence_offers: needs,
  rejected_offers: rejected,
  per_part: perPart
};

fs.writeFileSync(
  path.join(OUT97, 'PHASE97_EBAY_ACTIVATION.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify({
  batches: summary.batches,
  result: summary.result,
  accepted_marketplaces: acceptedMarketplaces,
  listing_mpn: {
    before: mpnBefore,
    after: mpnAfter,
    gained: mpnGained.length,
    still_without: mpnRetryParts.length
  },
  needs_evidence_by_reason: needsByReason,
  rejected_by_reason: rejectedByReason,
  campaign: summary.campaign
}, null, 2));
