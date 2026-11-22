#!/usr/bin/env node
/**
 * scripts/finalize_phase99_ebay.mjs
 *
 * Aggregates the Phase 99 checkpoints into output/phase99/PHASE99_EBAY_ACTIVATION.json.
 *
 * Uses exactly the keys of PHASE99_BASELINE.json for the before/after coverage,
 * so a resumed batch is never counted twice: a new part is a part present in
 * the live store but absent from the baseline part set. Reads the Amazon
 * registry fresh (after) and compares it with the baseline (before); the Amazon
 * side is only used to prioritise and to measure. Never writes offers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT98 = path.join(ROOT, 'output', 'phase99');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const normalize = part => PartNormalizer.normalizePartNumber(part);

const baseline = readJson('output/phase99/PHASE99_BASELINE.json');
const queueDoc = readJson('output/phase99/queue.json');
const queueParts = new Set(queueDoc.queue.map(entry => normalize(entry.part_number)));

const store = loadEbayOfferStore(path.join(ROOT, 'data', 'affiliate', 'ebay_offers.json'));
const activeOffers = store.offers.filter(offer => offer.status === 'ACTIVE');
const storeParts = new Set(activeOffers.map(offer => normalize(offer.part_number)).filter(Boolean));
const storeMarketplaces = {};
for (const offer of activeOffers) {
  storeMarketplaces[offer.marketplace] = (storeMarketplaces[offer.marketplace] || 0) + 1;
}

const amazon = readJson('data/affiliate/verified_amazon_registry.json');
const amazonParts = new Set(
  (amazon.offers || [])
    .filter(offer => offer.status === 'ACTIVE')
    .map(offer => normalize(offer.part_number))
    .filter(Boolean)
);

const baselineEbayParts = new Set(baseline.coverage.parts_ebay);
const baselineAmazonParts = new Set(baseline.coverage.parts_amazon);
const baselineCombined = new Set(baseline.coverage.parts_combined);

// --- checkpoints -------------------------------------------------------------
const dir = path.join(OUT98, 'batches');
const progressFiles = fs.readdirSync(dir).filter(file => file.endsWith('_progress.json')).sort();
const progress = progressFiles.map(file => readJson(`output/phase99/batches/${file}`));
const results = progress.map(item => ({
  batch_id: item.batch_id,
  input: item.batch_id.startsWith('retry') ? 'retry_00.json' : `${item.batch_id}.json`,
  complete: item.complete === true,
  rate_limited: item.rate_limited === true,
  accepted_offers: item.accepted_offers || [],
  needs_evidence_offers: item.needs_evidence_offers || [],
  rejected_offers: item.rejected_offers || [],
  per_part: item.per_part || []
}));

const presentKeys = new Set(activeOffers.map(offer => `${offer.part_number}:${offer.marketplace}:${offer.item_id}`));
const acceptedRaw = results.flatMap(result =>
  (result.accepted_offers || []).map(offer => ({ ...offer, batch: result.batch_id }))
);
const acceptedPresent = acceptedRaw.filter(offer => presentKeys.has(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`));
const droppedRecords = acceptedRaw.length - acceptedPresent.length;

const acceptedByKey = new Map();
for (const offer of acceptedPresent) {
  acceptedByKey.set(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`, offer);
}
const acceptedOffers = [...acceptedByKey.values()];
const acceptedParts = [...new Set(acceptedOffers.map(offer => normalize(offer.part_number)))].sort();

const perPartAll = results.flatMap(result => (result.per_part || []).map(entry => ({ ...entry, batch: result.batch_id })));
const perPartByPart = new Map();
for (const entry of perPartAll) {
  const part = normalize(entry.part_number);
  if (!part) continue;
  const previous = perPartByPart.get(part);
  // A part searched in the retry pass keeps both records; the first pass is the
  // exact-number result and stays the reference.
  if (!previous || previous.batch.startsWith('retry')) perPartByPart.set(part, entry);
}

const finishedEntries = perPartAll.filter(entry => !entry.skipped && !entry.error && !entry.unfinished);
const unfinishedEntries = perPartAll.filter(entry => entry.unfinished);
const newParts = acceptedParts.filter(part => !baselineEbayParts.has(part));
const partsWithFirstBuyLinkAnywhere = newParts.filter(part => !baselineCombined.has(part));
const partsWithAmazonLinkBefore = newParts.filter(part => baselineAmazonParts.has(part));
const partsWithoutAmazonLinkBefore = newParts.filter(part => !baselineAmazonParts.has(part));

// --- needs evidence / rejected (deduplicated per part + listing) -------------
const dedupe = (offers, keyFn) => {
  const map = new Map();
  for (const offer of offers) if (!map.has(keyFn(offer))) map.set(keyFn(offer), offer);
  return [...map.values()];
};
const needsRaw = results.flatMap(result => (result.needs_evidence_offers || []).map(offer => ({ ...offer, batch: result.batch_id })));
const rejectedRaw = results.flatMap(result => (result.rejected_offers || []).map(offer => ({ ...offer, batch: result.batch_id })));
const listingKey = offer => `${offer.part_number}:${offer.marketplace}:${offer.item_id}`;
const needs = dedupe(needsRaw, listingKey);
const rejected = dedupe(rejectedRaw, listingKey);

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
const partsNeedingEvidence = new Set(needs.map(offer => normalize(offer.part_number)));
const partsRejected = new Set(rejected.map(offer => normalize(offer.part_number)));

// --- marketplace split and shipping evidence ---------------------------------
const acceptedMarketplaces = {};
const shippingStatuses = {};
let shippingConfirmed = 0;
for (const offer of acceptedOffers) {
  acceptedMarketplaces[offer.marketplace] = (acceptedMarketplaces[offer.marketplace] || 0) + 1;
  const status = offer.shipping_status || (offer.ships_to_nl ? 'SHIPS_TO_NL_CONFIRMED' : 'UNKNOWN');
  shippingStatuses[status] = (shippingStatuses[status] || 0) + 1;
  if (offer.ships_to_nl === true) shippingConfirmed += 1;
}

// --- GSC model coverage: before (baseline sets) vs after (live store) --------
const db = new Database(path.join(ROOT, 'data', 'stihl_database.db'), { readonly: true });
const fitments = db.prepare('SELECT DISTINCT canonical_model_id, part_number FROM model_part_fitments').all();
db.close();
const partsByModel = new Map();
for (const row of fitments) {
  const part = normalize(row.part_number);
  if (!part || !row.canonical_model_id) continue;
  if (!partsByModel.has(row.canonical_model_id)) partsByModel.set(row.canonical_model_id, new Set());
  partsByModel.get(row.canonical_model_id).add(part);
}
const priorityDoc = readJson('output/phase81/PHASE81_PRIORITY_MODELS.json');
const gscModels = new Map();
for (const item of (priorityDoc.models || priorityDoc.priority_models || [])) {
  const key = String(item.canonical_model_id || item.id || '').toLowerCase().replace(/^stihl_/, '');
  if (key) gscModels.set(key, Number(item.clicks || item.impressions || 0));
}

const afterCombined = new Set([...storeParts, ...amazonParts]);
const gscCoverage = [...gscModels.keys()].sort((a, b) => (gscModels.get(b) || 0) - (gscModels.get(a) || 0) || a.localeCompare(b)).map(model => {
  const parts = partsByModel.get(model) || new Set();
  const before = [...parts].filter(part => baselineCombined.has(part)).length;
  const after = [...parts].filter(part => afterCombined.has(part)).length;
  const newPartsForModel = newParts.filter(part => parts.has(part));
  return {
    model,
    clicks: gscModels.get(model) || 0,
    parts: parts.size,
    parts_covered_before: before,
    parts_covered_after: after,
    new_parts: newPartsForModel.length,
    new_parts_list: newPartsForModel,
    ebay_parts_before: [...parts].filter(part => baselineEbayParts.has(part)).length,
    ebay_parts_after: [...parts].filter(part => storeParts.has(part)).length,
    remaining_without_any_direct_link: parts.size - after
  };
}).filter(entry => entry.new_parts > 0 || entry.remaining_without_any_direct_link > 0);

// --- LISTING_MPN backlog of Phase 97, measured again --------------------------
const mpnDoc = readJson('output/phase99/listing_mpn_groups.json');
const mpnAfter = mpnDoc.groups.map(group => ({
  part_number: group.part_number,
  has_active_ebay_offer_now: storeParts.has(group.part_number)
}));

const batchIds = results.map(result => result.batch_id);
const summary = {
  phase: '99',
  generated_at: new Date().toISOString(),
  queue: {
    size: queueDoc.queue.length,
    batch_ids: queueDoc.summary.batch_ids,
    all_without_any_direct_buy_link: queueDoc.summary.queue_composition.without_any_direct_buy_link,
    all_on_gsc_priority_models: queueDoc.summary.queue_composition.on_gsc_priority_models
  },
  coverage: {
    before: {
      ebay_active_offers: baseline.coverage.ebay_active_offers,
      ebay_parts: baseline.coverage.ebay_parts,
      ebay_marketplaces: baseline.coverage.ebay_marketplaces,
      amazon_parts: baseline.coverage.amazon_parts,
      combined_parts: baseline.coverage.combined_parts
    },
    after: {
      ebay_active_offers: activeOffers.length,
      ebay_parts: storeParts.size,
      ebay_marketplaces: storeMarketplaces,
      ebay_active_items: new Set(activeOffers.map(offer => offer.item_id)).size,
      amazon_parts: amazonParts.size,
      combined_parts: afterCombined.size,
      measured_at: new Date().toISOString()
    }
  },
  batches: {
    ids: batchIds,
    complete: results.filter(result => result.complete).map(result => result.batch_id),
    incomplete: results.filter(result => !result.complete).map(result => result.batch_id),
    rate_limited: results.filter(result => result.rate_limited).map(result => result.batch_id),
    checkpoints: progress.map(item => ({
      batch_id: item.batch_id,
      resolved: (item.processed_parts || []).length,
      complete: item.complete === true,
      rate_limited: item.rate_limited === true,
      updated_at: item.updated_at || null
    }))
  },
  result: {
    new_active_offers: acceptedOffers.length,
    new_active_parts: newParts.length,
    new_parts_with_first_ebay_link: newParts.length,
    new_parts_with_first_buy_link_anywhere: partsWithFirstBuyLinkAnywhere.length,
    new_parts_without_amazon_link_before: partsWithoutAmazonLinkBefore.length,
    new_parts_with_amazon_link_before: partsWithAmazonLinkBefore.length,
    new_parts_on_gsc_priority_models: newParts.filter(part => perPartByPart.get(part)?.gsc_priority_model).length,
    // Yield, expressed the way the brief asks: first buy links per 100 finished
    // unique parts (a part re-searched with alternative terms is counted once).
    unique_parts_finished: new Set(finishedEntries.map(entry => normalize(entry.part_number))).size,
    first_buy_links_per_100_finished_parts: (() => {
      const finished = new Set(finishedEntries.map(entry => normalize(entry.part_number))).size;
      return finished === 0 ? 0 : Number(((partsWithFirstBuyLinkAnywhere.length / finished) * 100).toFixed(2));
    })(),
    first_ebay_links_per_100_finished_parts: (() => {
      const finished = new Set(finishedEntries.map(entry => normalize(entry.part_number))).size;
      return finished === 0 ? 0 : Number(((newParts.length / finished) * 100).toFixed(2));
    })(),
    // What the alternative (model + part type) search terms added on their own.
    alternative_pass_new_parts: new Set(
      acceptedOffers
        .filter(offer => String(offer.batch || '').startsWith('retry'))
        .map(offer => normalize(offer.part_number))
    ).size,
    alternative_pass_new_offers: acceptedOffers.filter(offer => String(offer.batch || '').startsWith('retry')).length,
    parts_searched: finishCount(perPartAll),
    parts_searched_exact_pass: finishCount(perPartAll.filter(entry => !entry.batch.startsWith('retry'))),
    parts_searched_alternative_pass: finishCount(perPartAll.filter(entry => entry.batch.startsWith('retry'))),
    parts_unfinished: unfinishedEntries.length,
    unfinished_parts: unfinishedEntries.map(entry => ({ part_number: entry.part_number, batch: entry.batch, api_errors: entry.api_errors })),
    parts_already_active: perPartAll.filter(entry => entry.skipped === 'ALREADY_ACTIVE').length,
    parts_errors: perPartAll.filter(entry => entry.error).length,
    error_parts: perPartAll.filter(entry => entry.error).map(entry => ({ part_number: entry.part_number, error: entry.error })),
    parts_without_any_listing: finishedEntries.filter(entry => entry.decision === 'NO_LISTING_FOUND' && !entry.batch.startsWith('retry')).length,
    // Unique parts of this batch that still have no eBay link after both passes.
    parts_without_ebay_link_after_both_passes: new Set(
      finishedEntries
        .map(entry => normalize(entry.part_number))
        .filter(part => part && !storeParts.has(part))
    ).size,
    needs_evidence_candidates: needs.length,
    needs_evidence_candidates_raw: needsRaw.length,
    parts_with_needs_evidence: partsNeedingEvidence.size,
    rejected_candidates: rejected.length,
    parts_with_rejected_candidates: partsRejected.size,
    evidence_enriched_parts: perPartAll.filter(entry => (entry.evidence_enriched || 0) > 0).length,
    evidence_reused_parts: perPartAll.filter(entry => (entry.evidence_reused || 0) > 0).length,
    dropped_records: droppedRecords,
    duplicate_accepted_records: acceptedRaw.length - acceptedByKey.size,
    parts_outside_this_queue_with_new_offers: newParts.filter(part => !queueParts.has(part)).length
  },
  accepted_marketplaces: acceptedMarketplaces,
  shipping_evidence: {
    offers_with_nl_shipping: shippingConfirmed,
    statuses: shippingStatuses
  },
  accepted_parts: newParts,
  first_buy_link_anywhere_parts: partsWithFirstBuyLinkAnywhere,
  gsc_model_coverage: gscCoverage,
  listing_mpn_phase98: {
    unique_parts: mpnDoc.summary.unique_parts,
    parts_with_ebay_link_before_phase99: mpnDoc.summary.parts_with_active_ebay_offer,
    parts_with_ebay_link_after_phase99: mpnAfter.filter(entry => entry.has_active_ebay_offer_now).length,
    parts_still_without_link: mpnAfter.filter(entry => !entry.has_active_ebay_offer_now).map(entry => entry.part_number)
  },
  needs_evidence_by_reason: needsByReason,
  rejected_by_reason: rejectedByReason,
  campaign: {
    store_campaign_ids: [...new Set(activeOffers.map(offer => offer.campaign_id).filter(Boolean))],
    environment_matches_store: [...new Set(activeOffers.map(offer => offer.campaign_id).filter(Boolean))]
      .every(id => id === process.env.EBAY_EPN_CAMPAIGN_ID),
    environment_campaign_id_configured: /^\d+$/.test(process.env.EBAY_EPN_CAMPAIGN_ID || ''),
    // The runner's offer records carry the affiliate URL; the store record adds
    // the campaign id. Count both, on the store records of the new parts.
    new_offers_with_campaign_id: activeOffers
      .filter(offer => newParts.includes(normalize(offer.part_number)))
      .filter(offer => String(offer.campaign_id) === String(process.env.EBAY_EPN_CAMPAIGN_ID || '')).length,
    new_offers_with_campid_in_url: acceptedOffers
      .filter(offer => (offer.affiliate_url || '').includes(`campid=${process.env.EBAY_EPN_CAMPAIGN_ID || 'x'}`)).length
  },
  accepted_offers: acceptedOffers,
  needs_evidence_offers: needs,
  rejected_offers: rejected,
  per_part: perPartAll
};

function finishCount(entries) {
  return entries.filter(entry => !entry.skipped && !entry.error && !entry.unfinished).length;
}

fs.writeFileSync(
  path.join(OUT98, 'PHASE99_EBAY_ACTIVATION.json'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify({
  coverage: summary.coverage,
  batches: summary.batches,
  result: summary.result,
  accepted_marketplaces: acceptedMarketplaces,
  shipping_evidence: summary.shipping_evidence,
  listing_mpn_phase98: summary.listing_mpn_phase98,
  needs_evidence_by_reason: needsByReason,
  rejected_by_reason: rejectedByReason,
  campaign: summary.campaign
}, null, 2));
