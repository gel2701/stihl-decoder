#!/usr/bin/env node
/**
 * scripts/phase96_ebay_activation.mjs
 *
 * Phase 96 — Live eBay activation batch over the existing engine.
 *
 * This script adds no matching, shipping or affiliate logic of its own:
 *   - `EbayBrowseApiClient`   OAuth, Browse search with deliveryCountry:NL,
 *                             getItem enrichment, affiliate URL/campaign guard
 *   - `EbayHighVolumeEngine`  evaluateOffer(): the canonical ACCEPT/REVIEW/REJECT
 *                             decision, reason_codes and first_blocking_step
 *   - `EbayOfferStore`        the write route: only ACCEPT becomes ACTIVE and
 *                             existing ACTIVE offers are never deleted
 *
 * It runs one batch file produced by phase96_build_ebay_queue.mjs, searches
 * eBay.de first and then eBay.nl across all sellers, enriches candidates that
 * still miss identity or NL-delivery evidence, activates every ACCEPT and keeps
 * the rest as NEEDS_EVIDENCE/REJECTED with the engine's own reason codes.
 *
 * Usage:
 *   EBAY_ENABLED=true node scripts/phase96_ebay_activation.mjs \
 *     --input output/phase96/batches/queue_00.json \
 *     --batch-id queue_00 [--live] [--max-parts 40] [--dry-run]
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
const OUT96 = path.join(ROOT, 'output', 'phase96');
fs.mkdirSync(path.join(OUT96, 'batches'), { recursive: true });

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
const BATCH_ID = readArg('--batch-id', path.basename(INPUT, '.json'));
const MAX_PARTS = Number(readArg('--max-parts', 40));
const REQUIRE_LIVE = args.includes('--live');
const DRY_RUN = args.includes('--dry-run');

// The deployed site keeps EBAY_ENABLED=false; this process needs the API only
// while it runs, so the flag is set in-process (same approach as Phase 80/94).
process.env.EBAY_ENABLED = 'true';

const CAMPAIGN = process.env.EBAY_EPN_CAMPAIGN_ID || '';
const STORE = getEbayOfferStorePath();
const EVIDENCE = getEbayEvidenceRegistryPath();

const apiClient = new EbayBrowseApiClient({});
const preflight = apiClient.preflight();
if (REQUIRE_LIVE && !preflight.ready) {
  console.error(JSON.stringify({ activation_blocker: 'EBAY_BROWSE_API_NOT_READY', preflight }, null, 2));
  process.exit(2);
}

const evidenceRegistry = new EbayEvidenceRegistry({ path: EVIDENCE });
const engine = new EbayHighVolumeEngine({
  apiClient,
  // eBay.de first: the German marketplace carries the aftermarket STIHL stock.
  marketplaces: ['EBAY_DE', 'EBAY_NL'],
  // All sellers: the vendor-filtered searches are a subset of this one.
  vendors: ['ALL'],
  batchDelayMs: 120,
  backoffBaseMs: 2000,
  enrich: true,
  maxEnrichments: 8,
  evidenceRegistry
});

const batch = JSON.parse(fs.readFileSync(path.resolve(ROOT, INPUT), 'utf8'));
const parts = (Array.isArray(batch) ? batch : batch.parts || []).slice(0, MAX_PARTS);
const storeBefore = loadEbayOfferStore(STORE);
const activeBefore = new Set(
  storeBefore.offers.filter(o => o.status === 'ACTIVE').map(o => o.part_number)
);

const startedAt = Date.now();
const accepted = [];
const needsEvidence = [];
const rejected = [];
const perPart = [];
let activationError = null;

for (const entry of parts) {
  const part = PartNormalizer.normalizePartNumber(entry.part_number);
  if (!part) continue;
  if (activeBefore.has(part)) {
    perPart.push({ part_number: part, skipped: 'ALREADY_ACTIVE' });
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
      enrich: true
    });
  } catch (error) {
    activationError = error.message;
    perPart.push({ part_number: part, error: error.message });
    continue;
  }

  const acceptedOffers = result.active_offers;
  const reviewOffers = result.review_offers;
  const rejectedOffers = result.rejected_offers;
  accepted.push(...acceptedOffers);
  needsEvidence.push(...reviewOffers);
  rejected.push(...rejectedOffers);

  const blocking = {};
  for (const offer of reviewOffers) {
    const step = offer.first_blocking_step || (offer.reason_codes || [])[0] || 'UNKNOWN';
    blocking[step] = (blocking[step] || 0) + 1;
  }
  for (const offer of rejectedOffers) {
    const step = offer.primary_reason || 'UNKNOWN';
    blocking[step] = (blocking[step] || 0) + 1;
  }

  perPart.push({
    part_number: part,
    part_name: entry.part_name || '',
    models: entry.models || [],
    has_amazon_direct_link: entry.has_amazon_direct_link ?? null,
    gsc_priority_model: Boolean(entry.gsc_priority_model),
    searched_marketplaces: ['EBAY_DE', 'EBAY_NL'],
    raw_results: result.summary.raw_results,
    client_passed: result.summary.client_passed,
    client_rejected: result.summary.client_rejected,
    client_rejection_reasons: result.summary.client_rejection_reasons,
    active: acceptedOffers.length,
    needs_evidence: reviewOffers.length,
    rejected: rejectedOffers.length,
    evidence_enriched: result.summary.evidence_enriched,
    evidence_reused: result.summary.evidence_reused,
    blocking_steps: blocking,
    decision: acceptedOffers.length > 0 ? 'ACCEPT' : (reviewOffers.length > 0 ? 'REVIEW' : (rejectedOffers.length > 0 ? 'REJECT' : 'NO_LISTING_FOUND')),
    reason_codes: [...new Set([
      ...reviewOffers.flatMap(o => o.reason_codes || []),
      ...rejectedOffers.flatMap(o => o.reason_codes || [])
    ])],
    first_blocking_step: Object.keys(blocking)[0] || null
  });

  // Persist after every accepted part so a restart never loses proven offers.
  if (acceptedOffers.length > 0 && !DRY_RUN) {
    const saved = saveEbayOfferStore(STORE, acceptedOffers, { campaignId: CAMPAIGN });
    if (saved.rejected > 0) {
      activationError = `store_rejected_${saved.rejected}`;
    }
  }
  process.stdout.write(`  ${part}: ${perPart[perPart.length - 1].decision} (active=${acceptedOffers.length}, review=${reviewOffers.length}, reject=${rejectedOffers.length})\n`);
}

if (!DRY_RUN && accepted.length > 0) {
  saveEbayOfferStore(STORE, accepted, { campaignId: CAMPAIGN });
}
evidenceRegistry.save(EVIDENCE);

const storeAfter = loadEbayOfferStore(STORE);
const newKeys = new Set(accepted.map(offer => `${offer.part_number}:${offer.marketplace}:${offer.item_id}`));
const newActiveInStore = storeAfter.offers.filter(offer => newKeys.has(`${offer.part_number}:${offer.marketplace}:${offer.item_id}`));

// Chain check on the persisted store: the public resolver must turn each new
// record into an eBay offer descriptor for that part.
let resolverResolved = 0;
const resolverMisses = [];
if (newActiveInStore.length > 0) {
  const resolver = new AffiliateOfferResolver({ ebayStorePath: STORE });
  for (const part of new Set(newActiveInStore.map(o => o.part_number))) {
    const offers = resolver.resolveOffers({ partNumber: part, partName: '' });
    const ebay = offers.filter(offer => offer.provider === 'ebay' && offer.link_type === 'DIRECT_EBAY_ITEM');
    if (ebay.length > 0) resolverResolved += 1;
    else resolverMisses.push(part);
  }
}

const report = {
  phase: '96',
  batch_id: BATCH_ID,
  generated_at: new Date().toISOString(),
  live_api: preflight.ready,
  dry_run: DRY_RUN,
  campaign_id_configured: /^\d+$/.test(CAMPAIGN),
  activation_blocker: preflight.ready ? activationError : 'EBAY_BROWSE_API_NOT_READY',
  preflight,
  store: {
    path: path.relative(ROOT, STORE).replace(/\\/g, '/'),
    offers_before: storeBefore.offers.length,
    offers_after: storeAfter.offers.length
  },
  metrics: {
    parts_in_batch: parts.length,
    parts_processed: perPart.filter(p => !p.skipped).length,
    parts_already_active: perPart.filter(p => p.skipped === 'ALREADY_ACTIVE').length,
    new_active_offers: newActiveInStore.length,
    new_active_parts: new Set(newActiveInStore.map(o => o.part_number)).size,
    new_active_parts_without_amazon_link: new Set(
      newActiveInStore
        .filter(o => perPart.find(p => p.part_number === o.part_number && p.has_amazon_direct_link === false))
        .map(o => o.part_number)
    ).size,
    needs_evidence_candidates: needsEvidence.length,
    rejected_candidates: rejected.length,
    parts_with_no_listing: perPart.filter(p => p.decision === 'NO_LISTING_FOUND').length,
    resolver_resolved_new_parts: resolverResolved,
    resolver_misses: resolverMisses,
    duration_ms: Date.now() - startedAt
  },
  accepted_offers: newActiveInStore.map(offer => ({
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
  needs_evidence_offers: needsEvidence.map(offer => ({
    part_number: offer.part_number,
    item_id: offer.item_id,
    marketplace: offer.marketplace,
    title: offer.title,
    decision: offer.decision,
    reason_codes: offer.reason_codes,
    first_blocking_step: offer.first_blocking_step,
    evidence_gaps: offer.evidence_gaps
  })),
  rejected_offers: rejected.map(offer => ({
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

fs.writeFileSync(
  path.join(OUT96, 'batches', `${BATCH_ID}_result.json`),
  JSON.stringify(report, null, 2) + '\n',
  'utf8'
);
console.log(JSON.stringify({ batch_id: BATCH_ID, metrics: report.metrics, activation_blocker: report.activation_blocker }, null, 2));
