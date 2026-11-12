#!/usr/bin/env node
/**
 * Phase 76E — 100-part eBay bulk pilot (diagnostic, server-side only).
 *
 * Runs against the REAL eBay Browse API using credentials from the Render
 * environment (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_EPN_CAMPAIGN_ID).
 * EBAY_ENABLED is flipped to 'true' only inside this process — the Render
 * environment variable stays untouched, so public visitors keep seeing
 * EBAY_ENABLED=false. Nothing is published; results go to output/phase76e/.
 *
 * Modes:
 *   (default)              Full 100-part pilot run, checkpoint/resume enabled
 *   --preflight            Diagnostic API test: OAuth + 1 Browse search, then exit
 *   --reset                Ignore existing checkpoint and start from part 0
 *
 * Usage (Render Shell):
 *   node scripts/ebay_bulk_pilot_100.mjs --preflight
 *   node scripts/ebay_bulk_pilot_100.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const PREFLIGHT = args.includes('--preflight');
const SELECT_ONLY = args.includes('--select-only');
const RESET = args.includes('--reset');

// Phase 76E: --limit N and --run-id X
function readArg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const LIMIT = readArg('--limit') !== null ? Number(readArg('--limit')) : null;
const RUN_ID = readArg('--run-id');
if (LIMIT !== null && (!Number.isInteger(LIMIT) || LIMIT < 1)) {
  console.error(`ABORT: --limit must be a positive integer, got "${LIMIT}"`);
  process.exit(1);
}
if (RUN_ID && !/^[A-Za-z0-9._-]+$/.test(RUN_ID)) {
  console.error(`ABORT: --run-id must be alphanumeric with ._- only, got "${RUN_ID}"`);
  process.exit(1);
}

const CAMPAIGN = process.env.EBAY_EPN_CAMPAIGN_ID || '';
const EXPECTED_CAMPAIGN = '5339245312';
if (!SELECT_ONLY && CAMPAIGN !== EXPECTED_CAMPAIGN) {
  console.error(`ABORT: EBAY_EPN_CAMPAIGN_ID must be ${EXPECTED_CAMPAIGN}, got "${CAMPAIGN}"`);
  process.exit(1);
}
if (!SELECT_ONLY && (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET)) {
  console.error('ABORT: EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing from environment');
  process.exit(1);
}

// In-process only: Render env stays EBAY_ENABLED=false for public visitors
process.env.EBAY_ENABLED = 'true';

const apiClient = new EbayBrowseApiClient({});
const preflight = apiClient.preflight();
if (!SELECT_ONLY && !preflight.ready) {
  console.error('ABORT: preflight not ready', JSON.stringify(preflight));
  process.exit(1);
}

// Balanced selection from the ranked commercial queue: 100 parts across categories
const QUOTA = {
  starter: 21, kettingwiel: 15, koppeling: 12, luchtfilter: 10, carburateurdelen: 8,
  carburateur: 7, bougie: 8, oliepomp: 6, antivibratie: 6, brandstoffilter: 4,
  brandstofslang: 1, pakkingen: 2
};

function selectParts() {
  const queuePath = path.join(rootDir, 'output', 'phase56a', 'AMAZON_VERIFICATION_QUEUE.json');
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')).queue;
  const byCategory = new Map();
  for (const item of queue) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  const selected = [];
  for (const [category, quota] of Object.entries(QUOTA)) {
    const items = (byCategory.get(category) || []).sort((a, b) => a.queue_rank - b.queue_rank);
    selected.push(...items.slice(0, quota));
  }

  // Phase 76G: spread 10-onderdelenpilot over meerdere categorieën (runden)
  function selectSpread(limit) {
    const lists = Object.keys(QUOTA).map(cat => ({ cat, items: (byCategory.get(cat) || []).slice().sort((a, b) => a.queue_rank - b.queue_rank) }));
    const out = []; const seen = new Set(); let idx = 0;
    while (out.length < limit && idx < lists.length * limit) {
      const list = lists[idx % lists.length];
      if (list.items.length) {
        const item = list.items.shift();
        if (!seen.has(item.part_number)) {
          seen.add(item.part_number); out.push(item);
        }
      }
      idx++;
    }
    return out;
  }

  const expected = LIMIT ?? 100;
  const unique = [...new Map(selected.map(p => [p.part_number, p])).values()];
  const limited = LIMIT !== null ? selectSpread(LIMIT) : unique;
  if (limited.length !== expected) {
    console.error(`ABORT: expected ${expected} selected parts, got ${limited.length}`);
    process.exit(1);
  }
  return limited.map(p => ({
    part_number: p.part_number,
    display: p.part_number_display || p.part_number,
    description: p.display_name || p.category || '',
    category: p.category,
    queue_rank: p.queue_rank
  }));
}

if (SELECT_ONLY) {
  const parts = selectParts();
  console.log(JSON.stringify({ pilot_size: parts.length, parts }, null, 2));
  process.exit(0);
}

if (PREFLIGHT) {
  const smokePart = '11210201200';
  const token = await apiClient.getAccessToken();
  console.log('OAuth token acquired:', token ? 'YES' : 'NO', apiClient.lastAuthError || '');
  if (!token) process.exit(1);
  const res = await apiClient.searchItems({ partNumber: smokePart, marketplace: 'EBAY_NL' });
  console.log('Browse search:', JSON.stringify({ success: res.success, total: res.total, errors: res.errors }));
  console.log('Campaign:', CAMPAIGN, '| Marketplace header test OK');
  process.exit(res.success ? 0 : 1);
}

const parts = selectParts();
console.log(`Pilot selection: ${parts.length} parts across ${Object.keys(QUOTA).length} categories${LIMIT !== null ? ` (limit=${LIMIT})` : ''}${RUN_ID ? ` run_id=${RUN_ID}` : ''}`);

const engine = new EbayHighVolumeEngine({
  apiClient,
  vendors: ['saegenspezi_de', 'ALL'], // Sägenspezi + all suitable sellers
  marketplaces: ['EBAY_NL', 'EBAY_DE'],
  batchDelayMs: 150,
  backoffBaseMs: 2000,
  checkpointIntervalMs: 10000
});

// Phase 76E/76G: knownParts enables classifyPart product-type control (category + description)
const knownParts = parts.map(p => ({ part_number: p.part_number, description: p.description, category: p.category }));

// Phase 76E: persist checkpoints/results on the Render persistent disk when available
const persistentRoot = process.env.RENDER_DISK_PATH || (fs.existsSync('/var/data') ? '/var/data' : null);
const outDir = persistentRoot ? path.join(persistentRoot, 'phase76e') : path.join(rootDir, 'output', 'phase76e');
fs.mkdirSync(outDir, { recursive: true });
console.log(`Output directory: ${outDir}`);
const statePath = path.join(outDir, `pilot_100_state${RUN_ID ? `_${RUN_ID}` : ''}.json`);
const CHUNK = 10;

// Resume from checkpoint unless --reset
let offset = 0;
if (!RESET) {
  const prior = EbayHighVolumeEngine.loadState(statePath);
  if (prior && prior.next_part_index > 0 && prior.next_part_index < parts.length) {
    offset = prior.next_part_index;
    console.log(`Resuming from part ${offset} (state saved ${prior.saved_at})`);
  }
}

const seenOffers = new Set();
const seenReviews = new Set();
const allOffers = [];
const allReviews = [];
const allRejections = [];
const totals = { api_calls: 0, raw_results: 0, client_passed: 0, client_rejected: 0, offers_found: 0, offers_validated: 0, offers_reviewed: 0, offers_rejected: 0, backoff_delays: 0, errors: [] };
const clientRejectionReasons = {};
const rejectionsByReason = {};
const firstBlockingSteps = {};
const startedAt = Date.now();
let lastSavedIndex = offset;

try {
for (let cursor = offset; cursor < parts.length; cursor += CHUNK) {
  const chunk = parts.slice(cursor, cursor + CHUNK).map(p => p.part_number);
  const res = await engine.processBatch(chunk, { maxItems: CHUNK, knownParts });
  for (const offer of res.active_offers) {
    const key = `${offer.marketplace}:${offer.item_id}`;
    if (!seenOffers.has(key)) { seenOffers.add(key); allOffers.push(offer); }
  }
  for (const offer of res.review_offers || []) {
    const key = `${offer.marketplace}:${offer.item_id}`;
    if (!seenReviews.has(key)) { seenReviews.add(key); allReviews.push(offer); }
  }
  allRejections.push(...res.rejected_offers);
  totals.api_calls += res.summary.api_calls;
  totals.raw_results += res.summary.raw_results || 0;
  totals.client_passed += res.summary.client_passed || 0;
  totals.client_rejected += res.summary.client_rejected || 0;
  totals.offers_found += res.summary.offers_found;
  totals.offers_validated += res.summary.offers_validated;
  totals.offers_reviewed += res.summary.offers_reviewed || 0;
  totals.offers_rejected += res.summary.offers_rejected;
  for (const [code, n] of Object.entries(res.summary.client_rejection_reasons || {})) {
    clientRejectionReasons[code] = (clientRejectionReasons[code] || 0) + n;
  }
  for (const [code, n] of Object.entries(res.summary.rejections_by_reason || {})) {
    rejectionsByReason[code] = (rejectionsByReason[code] || 0) + n;
  }
  for (const [code, n] of Object.entries(res.summary.first_blocking_steps || {})) {
    firstBlockingSteps[code] = (firstBlockingSteps[code] || 0) + n;
  }
  totals.backoff_delays += res.summary.backoff_delays;
  totals.errors.push(...res.metrics.errors);
  const next = Math.min(cursor + CHUNK, parts.length);
  lastSavedIndex = next;
  engine.saveState(statePath, {
    next_part_index: next,
    summary: { ...totals, processed_parts: next, duration_ms: Date.now() - startedAt },
    active_offers: allOffers,
    review_offers: allReviews,
    rejected_offers: allRejections,
    checkpoints: engine.checkpoints
  });
  console.log(`  [${next}/${parts.length}] parts done | offers ${allOffers.length} | api_calls ${totals.api_calls}`);
}
} catch (err) {
  console.error(`ERROR (sanitized, no secrets): ${err.message}`);
  console.error('Partial state preserved; rerun the same command to resume from the last checkpoint.');
  // Attempt to save whatever partial state we have before exiting
  try {
    engine.saveState(statePath, {
      next_part_index: lastSavedIndex,
      summary: { ...totals, processed_parts: lastSavedIndex, duration_ms: Date.now() - startedAt },
      active_offers: allOffers,
      review_offers: allReviews,
      rejected_offers: allRejections,
      checkpoints: engine.checkpoints
    });
  } catch { /* best‑effort */ }
  process.exit(1);
}

// Classification: ACCEPT = exact MPN match (only these may enter active_offers),
// REVIEW = title-only match (kept out of active_offers), REJECT = validation failed
const autoAccept = allOffers.filter(o => o.decision === 'ACCEPT');
const review = allReviews;
const reject = allRejections.filter(r => r.reason === 'validation_failed');
const partsWithAccepted = new Set(allOffers.map(o => o.part_number));
const validAffiliateLinks = allOffers.filter(o => o.affiliate_url && o.affiliate_url.includes(`campid=${CAMPAIGN}`));
const durationMs = Date.now() - startedAt;
const processedParts = parts.length - offset;

const summary = {
  schema_version: '1.1.0',
  phase: '76G',
  generated_at: new Date().toISOString(),
  run_id: RUN_ID || null,
  limit: LIMIT,
  campaign_id: CAMPAIGN,
  pilot_size: parts.length,
  selected_categories: [...new Set(parts.map(p => p.category))],
  parts_processed_this_run: processedParts,
  parts_total_in_selection: parts.length,
  api_calls: totals.api_calls,
  funnel: {
    raw_results: totals.raw_results,
    client_passed: totals.client_passed,
    client_rejected: totals.client_rejected,
    client_rejection_reasons: clientRejectionReasons,
    after_engine_validation: totals.offers_found,
    engine_rejections: totals.offers_rejected
  },
  offers_found: totals.offers_found,
  offers_validated: totals.offers_validated,
  offers_reviewed: totals.offers_reviewed,
  offers_rejected: totals.offers_rejected,
  rejections_by_reason: rejectionsByReason,
  first_blocking_steps: firstBlockingSteps,
  classification: {
    ACCEPT: autoAccept.length,
    REVIEW: review.length,
    REJECT: reject.length
  },
  unique_parts_with_accepted_offer: partsWithAccepted.size,
  valid_affiliate_links: validAffiliateLinks.length,
  avg_processing_ms_per_part: processedParts > 0 ? Math.round(durationMs / processedParts) : null,
  total_batch_duration_ms: durationMs,
  backoff_delays: totals.backoff_delays,
  errors: totals.errors,
  output_files: {
    results: null, // filled below
    checkpoint: path.relative(rootDir, statePath)
  }
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsPath = path.join(outDir, `pilot_100_results${RUN_ID ? `_${RUN_ID}` : ''}_${stamp}.json`);
summary.output_files.results = path.relative(rootDir, resultsPath);

fs.writeFileSync(resultsPath, JSON.stringify({
  summary,
  parts,
  accepted_offers: allOffers,
  review_offers: allReviews,
  rejected_offers: allRejections
}, null, 2), 'utf8');

console.log('\n=== PILOT SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));
console.log(`\nResults written to ${resultsPath}`);
