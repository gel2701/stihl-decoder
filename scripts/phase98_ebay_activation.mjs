#!/usr/bin/env node
/**
 * scripts/phase98_ebay_activation.mjs
 *
 * Phase 98 — live eBay activation over the existing engine, resumable within one
 * batch so a restart never loses proven offers.
 *
 * Same building blocks as Phase 96/97 (no new matching, shipping or affiliate
 * logic): EbayBrowseApiClient, EbayHighVolumeEngine.evaluateOffer(),
 * EbayEvidenceRegistry and the EbayOfferStore write route. Nothing but ACCEPT
 * becomes ACTIVE and existing ACTIVE offers are never removed.
 *
 * New in Phase 98:
 *  - `--out-dir` keeps the Phase 98 checkpoints apart from Phase 97;
 *  - a part whose planned searches did not all complete (a marketplace answered
 *    with an error) is stored as `unfinished: true` and counted as unfinished
 *    instead of being reported as "no listing";
 *  - the same 429 handling: a rate-limited part stays unprocessed and the run
 *    stops cleanly, leaving every earlier acceptance on disk.
 *
 * Usage:
 *   EBAY_ENABLED=true node scripts/phase98_ebay_activation.mjs \
 *     --input output/phase98/batches/queue_20.json --batch-id queue_20 --live
 *   ...same command again to continue the batch...
 *   EBAY_ENABLED=true node scripts/phase98_ebay_activation.mjs \
 *     --input output/phase98/batches/retry_00.json --batch-id retry_00 --hints --live
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import { saveEbayOfferStore, loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { getEbayOfferStorePath, getEbayEvidenceRegistryPath } from '../src/affiliate/AffiliateStoragePaths.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const readArg = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const INPUT = readArg('--input');
if (!INPUT) {
  console.error('ABORT: --input <batch file> is required');
  process.exit(1);
}
const OUT_DIR = path.resolve(ROOT, readArg('--out-dir', 'output/phase98'));
fs.mkdirSync(path.join(OUT_DIR, 'batches'), { recursive: true });
const BATCH_ID = readArg('--batch-id', path.basename(INPUT, '.json'));
const MAX_PARTS = Number(readArg('--max-parts', 40));
const TIME_BUDGET_MS = Number(readArg('--time-budget-ms', 280000));
const REQUIRE_LIVE = args.includes('--live');
const DRY_RUN = args.includes('--dry-run');
const USE_HINTS = args.includes('--hints');
const RESET = args.includes('--reset');

process.env.EBAY_ENABLED = 'true';

const CAMPAIGN = process.env.EBAY_EPN_CAMPAIGN_ID || '';
const STORE = getEbayOfferStorePath();
const EVIDENCE = getEbayEvidenceRegistryPath();
const PROGRESS_FILE = path.join(OUT_DIR, 'batches', `${BATCH_ID}_progress.json`);
const RESULT_FILE = path.join(OUT_DIR, 'batches', `${BATCH_ID}_result.json`);

const apiClient = new EbayBrowseApiClient({});
const preflight = apiClient.preflight();
if (REQUIRE_LIVE && !preflight.ready) {
  console.error(JSON.stringify({ activation_blocker: 'EBAY_BROWSE_API_NOT_READY', preflight }, null, 2));
  process.exit(2);
}

const evidenceRegistry = new EbayEvidenceRegistry({ path: EVIDENCE });
const engine = new EbayHighVolumeEngine({
  apiClient,
  marketplaces: ['EBAY_DE', 'EBAY_NL'],
  vendors: ['ALL'],
  batchDelayMs: 120,
  backoffBaseMs: 2000,
  enrich: true,
  maxEnrichments: 8,
  evidenceRegistry
});

const batch = JSON.parse(fs.readFileSync(path.resolve(ROOT, INPUT), 'utf8'));
const batchParts = Array.isArray(batch) ? batch : batch.parts || [];
const parts = batchParts.slice(0, MAX_PARTS);
// Completeness always refers to the whole batch file, not to the slice a
// bounded invocation processed, so a `--max-parts` smoke run can never mark the
// remaining parts of a batch as done.
const BATCH_TOTAL = batchParts.length;

const progress = (() => {
  if (!RESET && fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch {
      // A corrupt checkpoint restarts the batch; the store keeps every offer
      // already written and those parts are skipped as ALREADY_ACTIVE.
    }
  }
  return {
    batch_id: BATCH_ID,
    started_at: new Date().toISOString(),
    processed_parts: [],
    accepted_offers: [],
    needs_evidence_offers: [],
    rejected_offers: [],
    per_part: [],
    complete: false
  };
})();

const processed = new Set(progress.processed_parts);
const storeBefore = loadEbayOfferStore(STORE);
const activeBefore = new Set(
  storeBefore.offers.filter(offer => offer.status === 'ACTIVE').map(offer => offer.part_number)
);

const startedAt = Date.now();
let stoppedByBudget = false;
let activationError = null;
let processedThisRun = 0;

const persistProgress = () => {
  progress.updated_at = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n', 'utf8');
};

const writeResult = (complete) => {
  const storeAfter = loadEbayOfferStore(STORE);
  const present = new Set(storeAfter.offers.map(offer =>
    `${offer.part_number}:${offer.marketplace}:${offer.item_id}`
  ));
  const accepted = progress.accepted_offers.filter(offer =>
    present.has(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`)
  );
  const acceptedParts = [...new Set(accepted.map(offer => offer.part_number))];
  const perPart = progress.per_part;

  const resolverMisses = [];
  let resolverResolved = 0;
  if (acceptedParts.length > 0) {
    const resolver = new AffiliateOfferResolver({ ebayStorePath: STORE });
    for (const part of acceptedParts) {
      const offers = resolver.resolveOffers({ partNumber: part, partName: '' });
      const ebay = offers.filter(offer => offer.provider === 'ebay' && offer.link_type === 'DIRECT_EBAY_ITEM');
      if (ebay.length > 0) resolverResolved += 1;
      else resolverMisses.push(part);
    }
  }

  const finished = perPart.filter(entry => !entry.skipped && !entry.error && !entry.unfinished);
  const report = {
    phase: '98',
    batch_id: BATCH_ID,
    generated_at: new Date().toISOString(),
    complete,
    live_api: preflight.ready,
    dry_run: DRY_RUN,
    used_query_hints: USE_HINTS,
    campaign_id_configured: /^\d+$/.test(CAMPAIGN),
    activation_blocker: preflight.ready ? activationError : 'EBAY_BROWSE_API_NOT_READY',
    preflight,
    store: {
      path: path.relative(ROOT, STORE).replace(/\\/g, '/'),
      offers_before: storeBefore.offers.length,
      offers_after: storeAfter.offers.length
    },
    metrics: {
      parts_in_batch: BATCH_TOTAL,
      parts_in_this_invocation: parts.length,
      parts_resolved: processed.size,
      parts_processed: finished.length,
      parts_unfinished: perPart.filter(entry => entry.unfinished).length,
      parts_already_active: perPart.filter(entry => entry.skipped === 'ALREADY_ACTIVE').length,
      parts_errors: perPart.filter(entry => entry.error).length,
      new_active_offers: accepted.length,
      new_active_parts: acceptedParts.length,
      needs_evidence_candidates: progress.needs_evidence_offers.length,
      rejected_candidates: progress.rejected_offers.length,
      parts_with_no_listing: finished.filter(entry => entry.decision === 'NO_LISTING_FOUND').length,
      resolver_resolved_new_parts: resolverResolved,
      resolver_misses: resolverMisses,
      remaining_parts: BATCH_TOTAL - processed.size,
      duration_ms: Date.now() - startedAt
    },
    accepted_offers: accepted.map(offer => ({
      part_number: offer.part_number,
      item_id: offer.item_id,
      marketplace: offer.marketplace,
      match_type: offer.match_type,
      title: offer.title,
      seller_name: offer.seller_name,
      item_price: offer.item_price,
      shipping_cost_nl: offer.shipping_cost_nl,
      currency: offer.currency,
      ships_to_nl: offer.ships_to_nl,
      shipping_status: offer.shipping_status,
      affiliate_url: offer.affiliate_url
    })),
    needs_evidence_offers: progress.needs_evidence_offers.map(offer => ({
      part_number: offer.part_number,
      item_id: offer.item_id,
      marketplace: offer.marketplace,
      title: offer.title,
      decision: offer.decision,
      reason_codes: offer.reason_codes,
      first_blocking_step: offer.first_blocking_step,
      evidence_gaps: offer.evidence_gaps
    })),
    rejected_offers: progress.rejected_offers.map(offer => ({
      part_number: offer.part_number,
      item_id: offer.item_id,
      marketplace: offer.marketplace,
      title: offer.title,
      primary_reason: offer.primary_reason,
      reason_codes: offer.reason_codes
    })),
    per_part: perPart,
    evidence_registry: evidenceRegistry.summary()
  };

  fs.writeFileSync(RESULT_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
};

for (const entry of parts) {
  if (processed.size >= MAX_PARTS) break;
  const part = PartNormalizer.normalizePartNumber(entry.part_number);
  if (!part) continue;
  if (processed.has(part)) continue;
  if (Date.now() - startedAt > TIME_BUDGET_MS) {
    stoppedByBudget = true;
    break;
  }
  if (activeBefore.has(part)) {
    processed.add(part);
    progress.processed_parts = [...processed];
    progress.per_part.push({ part_number: part, skipped: 'ALREADY_ACTIVE' });
    persistProgress();
    continue;
  }

  let result;
  try {
    result = await engine.processBatch([part], {
      maxItems: 1,
      knownParts: [{
        part_number: part,
        description: entry.part_name || '',
        category: entry.category || '',
        models: Array.isArray(entry.models) ? entry.models : []
      }],
      evidenceRegistry,
      enrich: true,
      queryHintsByPart: USE_HINTS ? { [part]: entry.alternative_search_hints || [] } : null
    });
  } catch (error) {
    activationError = error.message;
    processed.add(part);
    progress.processed_parts = [...processed];
    progress.per_part.push({ part_number: part, error: error.message });
    persistProgress();
    continue;
  }

  // A rate-limited part was not researched: an all-429 answer would otherwise be
  // stored as NO_LISTING_FOUND and never retried. Stop cleanly and leave the
  // part unprocessed so the next run starts on it.
  const apiErrors = result.summary.errors || [];
  const rateLimited = apiErrors.some(error => /429|Too many requests/i.test(String(error)));
  if (rateLimited || (apiErrors.length > 0 && (result.summary.api_calls || 0) === 0)) {
    progress.rate_limited = true;
    progress.rate_limited_at = new Date().toISOString();
    progress.rate_limited_part = part;
    progress.last_api_errors = apiErrors.slice(0, 3);
    persistProgress();
    writeResult(false);
    console.log(JSON.stringify({ batch_id: BATCH_ID, stopped: 'EBAY_RATE_LIMITED', part, api_errors: apiErrors.slice(0, 3) }, null, 2));
    process.exit(3);
  }

  const acceptedOffers = result.active_offers;
  const reviewOffers = result.review_offers;
  const rejectedOffers = result.rejected_offers;
  progress.accepted_offers.push(...acceptedOffers);
  progress.needs_evidence_offers.push(...reviewOffers);
  progress.rejected_offers.push(...rejectedOffers);

  const blocking = {};
  for (const offer of reviewOffers) {
    const step = offer.first_blocking_step || (offer.reason_codes || [])[0] || 'UNKNOWN';
    blocking[step] = (blocking[step] || 0) + 1;
  }
  for (const offer of rejectedOffers) {
    const step = offer.primary_reason || 'UNKNOWN';
    blocking[step] = (blocking[step] || 0) + 1;
  }

  // A part only counts as researched when both marketplaces answered. A part
  // that had one marketplace error is kept as unfinished so the checkpoint does
  // not present a broken search as "no listing found".
  const unfinished = apiErrors.length > 0;

  progress.per_part.push({
    part_number: part,
    part_name: entry.part_name || '',
    models: entry.models || [],
    gsc_priority_model: Boolean(entry.gsc_priority_model),
    has_amazon_direct_link: entry.has_amazon_direct_link ?? null,
    has_no_direct_link_anywhere: entry.has_no_direct_link_anywhere ?? (entry.has_amazon_direct_link === false),
    alternative_search_hints: USE_HINTS ? (entry.alternative_search_hints || []) : [],
    searched_marketplaces: ['EBAY_DE', 'EBAY_NL'],
    raw_results: result.summary.raw_results,
    client_passed: result.summary.client_passed,
    client_rejected: result.summary.client_rejected,
    active: acceptedOffers.length,
    needs_evidence: reviewOffers.length,
    rejected: rejectedOffers.length,
    evidence_enriched: result.summary.evidence_enriched,
    evidence_reused: result.summary.evidence_reused,
    api_errors: apiErrors.slice(0, 3),
    unfinished,
    blocking_steps: blocking,
    decision: acceptedOffers.length > 0 ? 'ACCEPT' : (reviewOffers.length > 0 ? 'REVIEW' : (rejectedOffers.length > 0 ? 'REJECT' : 'NO_LISTING_FOUND')),
    reason_codes: [...new Set([
      ...reviewOffers.flatMap(offer => offer.reason_codes || []),
      ...rejectedOffers.flatMap(offer => offer.reason_codes || [])
    ])],
    first_blocking_step: Object.keys(blocking)[0] || null
  });
  processed.add(part);
  progress.processed_parts = [...processed];
  processedThisRun += 1;
  persistProgress();

  if (acceptedOffers.length > 0 && !DRY_RUN) {
    const saved = saveEbayOfferStore(STORE, acceptedOffers, { campaignId: CAMPAIGN });
    if (saved.rejected > 0) activationError = `store_rejected_${saved.rejected}`;
  }

  writeResult(false);
  const last = progress.per_part[progress.per_part.length - 1];
  process.stdout.write(`  ${part}: ${last.decision}${unfinished ? ' (ONAFGEROND)' : ''} (active=${acceptedOffers.length}, review=${reviewOffers.length}, reject=${rejectedOffers.length})\n`);
}

if (!DRY_RUN && progress.accepted_offers.length > 0) {
  saveEbayOfferStore(STORE, progress.accepted_offers, { campaignId: CAMPAIGN });
}
evidenceRegistry.save(EVIDENCE);

progress.complete = processed.size >= BATCH_TOTAL && !stoppedByBudget;
persistProgress();
const report = writeResult(progress.complete);
console.log(JSON.stringify({
  batch_id: BATCH_ID,
  complete: report.complete,
  processed_this_run: processedThisRun,
  metrics: report.metrics,
  activation_blocker: report.activation_blocker
}, null, 2));
