#!/usr/bin/env node
/**
 * scripts/build_phase86_affiliate_artifacts.mjs
 *
 * Phase 86 — eBay result reconciliation.
 *
 * Reads the eleven Phase 86 Browse batches, separates genuinely new listings
 * from re-imports of already published ones, and writes the artefacts a later
 * publication step needs:
 *
 *   output/phase86/ebay_offers_phase86.json      accepted offers (full evidence)
 *   output/phase86/PHASE86_AFFILIATE_AUDIT.json  counts, reasons, per model
 *   output/phase86/PHASE86_NEEDS_EVIDENCE_GROUPS.json
 *
 * It never writes to the store: the batches already did that through the
 * repaired merge, and this script only reports what happened.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));

const PRIOR_PAYLOADS = [
  'output/phase81/ebay_offers_phase81.json',
  'output/phase82/ebay_offers_phase82.json',
  'output/phase83/ebay_offers_phase83.json',
  'output/phase84/ebay_offers_phase84.json',
  'output/phase85/ebay_offers_phase85.json'
];

const SEARCH_BATCH_DIR = 'output/phase86/phase80';
const ENRICHMENT_BATCH_DIR = 'output/phase86/phase80_needs';

const queue = readJson('output/phase86/PHASE86_EBAY_QUEUE.json');
const catalog = readJson('data/parts_catalog.json');
const modelFitmentIndex = readJson('data/model_part_fitments.json');
const amazonRegistry = readJson('data/affiliate/verified_amazon_registry.json');

/* ---- prior knowledge ---------------------------------------------------- */

const priorKeys = new Set();
const priorParts = new Set();
for (const rel of PRIOR_PAYLOADS) {
  const file = path.join(rootDir, rel);
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const offer of (doc.offers || [])) {
    priorKeys.add(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`);
    priorParts.add(offer.part_number);
  }
}
const amazonActiveParts = new Set(
  amazonRegistry.offers.filter((o) => o.status === 'ACTIVE').map((o) => o.part_number)
);

/* ---- batch results ------------------------------------------------------ */

/** Every Phase 86 batch: 11 Browse searches + 6 evidence-enrichment runs. */
const listBatches = (dir) => (fs.existsSync(path.join(rootDir, dir))
  ? fs.readdirSync(path.join(rootDir, dir)).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f))
  : []);
const batchFiles = [...listBatches(SEARCH_BATCH_DIR), ...listBatches(ENRICHMENT_BATCH_DIR)].sort();
if (batchFiles.length === 0) {
  console.error('No Phase 86 batch reports found; nothing to reconcile.');
  process.exit(1);
}
const accepted = [];
const needsEqual = [];
const rejected = [];
const queriedParts = new Set();
const batchReports = [];

for (const file of batchFiles) {
  const doc = JSON.parse(fs.readFileSync(path.join(rootDir, file), 'utf8'));
  const inputPath = doc.input ? path.join(rootDir, doc.input) : null;
  if (inputPath && fs.existsSync(inputPath)) {
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const rows = Array.isArray(input) ? input : (input.queue || input.review_offers || input.offers || input.parts || []);
    for (const row of rows) {
      const part = String(row.part_number || '').replace(/\D/g, '');
      if (part) queriedParts.add(part);
    }
  }
  batchReports.push({
    file,
    generated_at: doc.generated_at,
    input: doc.input,
    metrics: doc.metrics,
    exchange: doc.exchange
  });
  for (const offer of (doc.accepted_offers || [])) accepted.push({ ...offer, batch: file });
  for (const offer of (doc.needs_evidence_offers || [])) needsEqual.push({ ...offer, batch: file });
  for (const offer of (doc.rejected_offers || [])) rejected.push({ ...offer, batch: file });
}

/** One row per unique (part, marketplace, item id). */
const uniqueAccepted = new Map();
for (const offer of accepted) {
  uniqueAccepted.set(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`, offer);
}
const offers = [...uniqueAccepted.values()];
const freshOffers = offers.filter((o) => !priorKeys.has(`${o.part_number}:${o.marketplace}:${o.item_id}`));
const reimportedOffers = offers.length - freshOffers.length;

const splitByMarketplace = (list) => list.reduce((acc, o) => {
  acc[o.marketplace] = (acc[o.marketplace] || 0) + 1;
  return acc;
}, {});

const freshParts = new Set(freshOffers.map((o) => o.part_number));
const newDirectParts = [...freshParts].filter((p) => !priorParts.has(p));
const partsWithOffers = new Set(offers.map((o) => o.part_number));

const distinctNeeds = new Map();
for (const offer of needsEqual) {
  distinctNeeds.set(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`, offer);
}
const needsGroups = {};
for (const offer of distinctNeeds.values()) {
  const key = offer.match_type || offer.status || 'UNKNOWN';
  needsGroups[key] = (needsGroups[key] || 0) + 1;
}

/* Enrichment runs: how many title-only candidates gained an MPN and became ACTIVE. */
const enrichmentReports = batchReports.filter((b) => b.file.includes('phase80_needs'));
const enrichment = {
  candidates_processed: enrichmentReports.reduce((sum, b) => sum + (b.metrics?.review_candidates_processed || 0), 0),
  get_item_requests: enrichmentReports.reduce((sum, b) => sum + (b.metrics?.get_item_requests || 0), 0),
  evidence_completed: enrichmentReports.reduce((sum, b) => sum + (b.metrics?.candidates_evidence_completed || 0), 0),
  activated: enrichmentReports.reduce((sum, b) => sum + (b.metrics?.new_active || 0), 0),
  still_needs_evidence: enrichmentReports.reduce((sum, b) => sum + (b.metrics?.remaining_needs_evidence || 0), 0),
  method: 'getItem PRODUCT field group (seller-declared MPN / Herstellernummer aspect) for listings whose stored Browse detail declared no MPN'
};
const rejectedGroups = {};
for (const offer of rejected) {
  const key = offer.primary_reason || (Array.isArray(offer.reason_codes) ? offer.reason_codes.join('+') : offer.reason) || 'UNKNOWN';
  rejectedGroups[key] = (rejectedGroups[key] || 0) + 1;
}

const store = loadEbayOfferStore();
const storeParts = new Set(store.offers.map((o) => o.part_number));
const storeSplit = splitByMarketplace(store.offers);

const catalogParts = new Set((catalog.parts || catalog).map((p) => p.part_number));

const payload = {
  schema_version: '1.0.0',
  phase: '86',
  generated_at: new Date().toISOString(),
  campaign_id: store.offers[0]?.campaign_id || null,
  source: `${SEARCH_BATCH_DIR} (11 live Browse searches) + ${ENRICHMENT_BATCH_DIR} (6 evidence-enrichment runs)`,
  offers
};

const audit = {
  schema_version: '1.0.0',
  phase: '86',
  generated_at: new Date().toISOString(),
  input: {
    queue: 'output/phase86/PHASE86_EBAY_QUEUE.json',
    parts_in_queue: queue.queue_size,
    parts_queried: queriedParts.size,
    batches: batchFiles.length,
    search_batches: 11,
    enrichment_batches: 6,
    marketplace_scope: ['EBAY_NL', 'EBAY_DE'],
    delivery_country: 'NL'
  },
  offers: {
    accepted_relations: accepted.length,
    unique_accepted_listings: offers.length,
    new_listings: freshOffers.length,
    reimported_listings: reimportedOffers,
    new_listings_by_marketplace: splitByMarketplace(freshOffers),
    parts_with_accepted_offers: partsWithOffers.size,
    parts_receiving_new_listings: freshParts.size,
    new_parts_with_direct_purchase: newDirectParts.length,
    new_parts: newDirectParts
  },
  evidence_quality: {
    match_types: offers.reduce((acc, o) => { acc[o.match_type] = (acc[o.match_type] || 0) + 1; return acc; }, {}),
    shipping_confirmed: offers.filter((o) => o.shipping_status === 'SHIPS_TO_NL_CONFIRMED').length,
    offers_with_shipping_evidence: offers.filter((o) => o.shipping_evidence && Object.keys(o.shipping_evidence).length > 0).length,
    offers_with_mpn: offers.filter((o) => typeof o.mpn === 'string' && o.mpn.trim().length > 0).length
  },
  needs_evidence: {
    offers: needsEqual.length,
    distinct_listings: distinctNeeds.size,
    groups: needsGroups
  },
  evidence_enrichment: enrichment,
  rejected: {
    offers: rejected.length,
    distinct_listings: new Set(rejected.map((o) => `${o.part_number}:${o.marketplace}:${o.item_id}`)).size,
    groups: rejectedGroups
  },
  store: {
    path: 'data/affiliate/ebay_offers.json (local measurement copy of the published payloads)',
    offers_after: store.offers.length,
    active_after: store.offers.filter((o) => o.status === 'ACTIVE').length,
    parts_after: storeParts.size,
    marketplace_split: storeSplit,
    note: 'Production keeps its own store on the Render persistent disk. The local store was seeded from the Phase 81-85 payloads, so "new" above is measured against what was already published, not against an empty store.'
  },
  cross_marketplace: {
    parts_with_active_amazon_offer_among_new_ebay_parts: newDirectParts.filter((p) => amazonActiveParts.has(p)).length,
    parts_now_with_both_marketplaces: [...freshParts].filter((p) => amazonActiveParts.has(p)).length
  },
  catalog: {
    canonical_parts: catalogParts.size,
    fitment_relations: modelFitmentIndex.fitments_count,
    fitment_scope_note: 'No fitment was written in Phase 86: the Walbro cross-reference and the dealer catalogues available here do not identify an exact variant/configuration for the 79 new carburettors.'
  },
  batches: batchReports
};

fs.writeFileSync(path.join(rootDir, 'output/phase86/ebay_offers_phase86.json'), JSON.stringify(payload, null, 1) + '\n');
fs.writeFileSync(path.join(rootDir, 'output/phase86/PHASE86_AFFILIATE_AUDIT.json'), JSON.stringify(audit, null, 2) + '\n');
fs.writeFileSync(path.join(rootDir, 'output/phase86/PHASE86_NEEDS_EVIDENCE_GROUPS.json'), JSON.stringify({
  phase: '86',
  generated_at: audit.generated_at,
  needs_evidence_groups: needsGroups,
  rejected_groups: rejectedGroups,
  note: 'Title-only matches stay NEEDS_EVIDENCE: the listing does not state an MPN that can be tied to the STIHL part number.'
}, null, 2) + '\n');

console.log(JSON.stringify({
  parts_queried: queriedParts.size,
  accepted_relations: accepted.length,
  unique_listings: offers.length,
  new_listings: freshOffers.length,
  reimported: reimportedOffers,
  new_by_marketplace: audit.offers.new_listings_by_marketplace,
  new_parts_with_direct_purchase: newDirectParts.length,
  parts_with_new_listings: freshParts.size,
  needs_evidence: needsEqual.length,
  rejected: rejected.length,
  store_after: { offers: store.offers.length, parts: storeParts.size, split: storeSplit }
}, null, 2));
