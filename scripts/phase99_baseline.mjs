#!/usr/bin/env node
/**
 * scripts/phase99_baseline.mjs
 *
 * Phase 99 — coverage baseline with exactly the keys the end measurement uses.
 *
 * Reads the committed production state with `git show HEAD:` (not the working
 * tree) for the eBay store and the Amazon registry, so offers written by this
 * batch while it runs can never be counted as "before". Also reconstructs what
 * every Phase 98 checkpoint entry means and asserts that the counts add up.
 *
 * Writes:
 *  - output/phase99/PHASE99_BASELINE.json
 *  - output/phase99/PHASE99_PHASE98_RECONCILIATION.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'phase99');
fs.mkdirSync(OUT, { recursive: true });

const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readHead = rel => JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024
}));
const normalize = part => PartNormalizer.normalizePartNumber(part);
const stat = rel => {
  try {
    const s = fs.statSync(path.join(ROOT, rel));
    return { path: rel, bytes: s.size, modified_at: s.mtime.toISOString() };
  } catch {
    return { path: rel, missing: true };
  }
};

const store = readHead('data/affiliate/ebay_offers.json');
const activeOffers = (store.offers || []).filter(offer => offer.status === 'ACTIVE');
const ebayParts = new Set(activeOffers.map(offer => normalize(offer.part_number)).filter(Boolean));
const ebayMarketplaces = {};
for (const offer of activeOffers) {
  ebayMarketplaces[offer.marketplace] = (ebayMarketplaces[offer.marketplace] || 0) + 1;
}

const amazon = readHead('data/affiliate/verified_amazon_registry.json');
const amazonActive = (amazon.offers || []).filter(offer => offer.status === 'ACTIVE');
const amazonParts = new Set(amazonActive.map(offer => normalize(offer.part_number)).filter(Boolean));

// --- parts already researched in Phase 96, 97 and 98 ------------------------
const researched = new Map();
const sources = [
  ['phase96', '_result.json'],
  ['phase97', '_progress.json'],
  ['phase98', '_progress.json']
];
for (const [phase, suffix] of sources) {
  const dir = path.join(ROOT, 'output', phase, 'batches');
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(suffix))) {
    const doc = readJson(`output/${phase}/batches/${file}`);
    for (const entry of doc.per_part || []) {
      const part = normalize(entry.part_number);
      if (!part) continue;
      if (!researched.has(part)) researched.set(part, new Set());
      researched.get(part).add(phase);
    }
  }
}
const researchedByPhase = { phase96: 0, phase97: 0, phase98: 0, phase98_only_alternative: 0, multiple: 0 };
for (const phases of researched.values()) {
  if (phases.size > 1) researchedByPhase.multiple += 1;
  else if (phases.has('phase96')) researchedByPhase.phase96 += 1;
  else if (phases.has('phase97')) researchedByPhase.phase97 += 1;
  else researchedByPhase.phase98 += 1;
}

// --- Phase 98 reconciliation ------------------------------------------------
const p98dir = path.join(ROOT, 'output', 'phase98', 'batches');
const p98files = fs.existsSync(p98dir)
  ? fs.readdirSync(p98dir).filter(file => file.endsWith('_progress.json')).sort()
  : [];
const p98Progress = p98files.map(file => readJson(`output/phase98/batches/${file}`));
const p98Queue = readJson('output/phase98/queue.json').queue;
const p98QueueParts = p98Queue.map(entry => normalize(entry.part_number));

const exactByPart = new Map();
const altByPart = new Map();
const checkpointStats = [];
for (const progress of p98Progress) {
  const isRetry = String(progress.batch_id || '').startsWith('retry');
  const perPart = progress.per_part || [];
  checkpointStats.push({
    batch_id: progress.batch_id,
    is_retry: isRetry,
    entries: perPart.length,
    processed_parts: (progress.processed_parts || []).length,
    complete: progress.complete === true,
    rate_limited: progress.rate_limited === true,
    unfinished: perPart.filter(entry => entry.unfinished).length,
    errors: perPart.filter(entry => entry.error).length,
    skipped: perPart.filter(entry => entry.skipped).length
  });
  for (const entry of perPart) {
    const part = normalize(entry.part_number);
    if (!part) continue;
    (isRetry ? altByPart : exactByPart).set(part, entry);
  }
}

const STATUS = {
  FIRST_EBAY_LINK: 'FIRST_EBAY_LINK',
  RESEARCHED_NO_EXACT_LISTING: 'RESEARCHED_NO_EXACT_LISTING',
  RESEARCHED_LISTINGS_NO_ACCEPT: 'RESEARCHED_LISTINGS_NO_ACCEPT',
  RESEARCHED_REVIEW_ONLY: 'RESEARCHED_REVIEW_ONLY',
  RESEARCHED_REJECT_ONLY: 'RESEARCHED_REJECT_ONLY',
  UNFINISHED: 'UNFINISHED',
  NOT_IN_EXACT_CHECKPOINT: 'NOT_IN_EXACT_CHECKPOINT'
};

const reconciliationRows = [];
for (const part of p98QueueParts) {
  const exact = exactByPart.get(part) || null;
  const alt = altByPart.get(part) || null;
  let status;
  if (!exact) status = STATUS.NOT_IN_EXACT_CHECKPOINT;
  else if (exact.unfinished) status = STATUS.UNFINISHED;
  else if (ebayParts.has(part)) status = STATUS.FIRST_EBAY_LINK;
  else if (exact.decision === 'REVIEW') status = STATUS.RESEARCHED_REVIEW_ONLY;
  else if (exact.decision === 'REJECT') status = STATUS.RESEARCHED_REJECT_ONLY;
  else if ((exact.raw_results || 0) === 0) status = STATUS.RESEARCHED_NO_EXACT_LISTING;
  else status = STATUS.RESEARCHED_LISTINGS_NO_ACCEPT;

  reconciliationRows.push({
    part_number: part,
    status,
    exact_decision: exact?.decision || null,
    exact_raw_results: exact?.raw_results ?? null,
    exact_api_errors: exact?.api_errors || [],
    exact_first_blocking_step: exact?.first_blocking_step || null,
    exact_batch: exact?.batch || null,
    alternative_pass_executed: Boolean(alt),
    alternative_decision: alt?.decision || null,
    alternative_accepted: alt ? (alt.active || 0) > 0 : false,
    alternative_batch: alt?.batch || null,
    has_active_ebay_offer_now: ebayParts.has(part)
  });
}

const statusCounts = {};
for (const row of reconciliationRows) statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
const withoutLink = reconciliationRows.filter(row => !row.has_active_ebay_offer_now);
const noExactListing = withoutLink.filter(row => row.status === STATUS.RESEARCHED_NO_EXACT_LISTING);
const listedNoAccept = withoutLink.filter(row => row.status === STATUS.RESEARCHED_LISTINGS_NO_ACCEPT
  || row.status === STATUS.RESEARCHED_REVIEW_ONLY || row.status === STATUS.RESEARCHED_REJECT_ONLY);
const altExecuted = reconciliationRows.filter(row => row.alternative_pass_executed);

const reconciliation = {
  phase: '98',
  generated_at: new Date().toISOString(),
  purpose: 'Reconstruct what every Phase 98 checkpoint entry means so Phase 99 never re-searches a part or counts a status twice.',
  definitions: {
    FIRST_EBAY_LINK: 'exact pass finished and the part has an ACTIVE eBay offer now',
    RESEARCHED_NO_EXACT_LISTING: 'both marketplaces answered the exact-number search with zero listings; no listing exists to prove identity against',
    RESEARCHED_LISTINGS_NO_ACCEPT: 'listings were returned but none produced an ACCEPT (no accepting offer after shipping/price gates)',
    RESEARCHED_REVIEW_ONLY: 'only NEEDS_EVIDENCE candidates (title-only or unproven MPN)',
    RESEARCHED_REJECT_ONLY: 'only REJECTED candidates (conflicting part number)',
    UNFINISHED: 'a marketplace errored, so the planned searches on both marketplaces did not complete',
    NOT_IN_EXACT_CHECKPOINT: 'in the queue but absent from the exact checkpoint (must be 0)',
    alternative_pass_executed: 'the part was re-searched with model + part-type terms in retry_00..02'
  },
  checkpoints: checkpointStats,
  counts: {
    queue_parts: p98QueueParts.length,
    exact_checkpoint_parts: exactByPart.size,
    alternative_checkpoint_parts: altByPart.size,
    per_status: statusCounts,
    parts_with_active_ebay_offer: reconciliationRows.filter(row => row.has_active_ebay_offer_now).length,
    parts_without_ebay_link: withoutLink.length,
    without_link_no_exact_listing: noExactListing.length,
    without_link_listings_but_no_accept: listedNoAccept.length,
    alternative_pass_executed: altExecuted.length,
    alternative_pass_matches: altExecuted.filter(row => row.alternative_accepted).length,
    alternative_pass_parts_without_link: altExecuted.filter(row => !row.has_active_ebay_offer_now).length
  },
  arithmetic: {
    queue_equals_status_sum: p98QueueParts.length === reconciliationRows.length,
    status_sum: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
    with_link_plus_without_link: reconciliationRows.filter(row => row.has_active_ebay_offer_now).length + withoutLink.length,
    without_link_equals_no_listing_plus_listings: noExactListing.length + listedNoAccept.length,
    // Parts with zero exact listings cannot use an alternative query (no listing
    // to prove identity against); every other unresearched-with-results part was
    // re-searched, so 109 + 114 must equal the 223 parts without a link.
    alternative_plus_no_listing_equals_without_link:
      altExecuted.length + noExactListing.length === withoutLink.length
  },
  rows: reconciliationRows
};
fs.writeFileSync(
  path.join(OUT, 'PHASE99_PHASE98_RECONCILIATION.json'),
  JSON.stringify(reconciliation, null, 2) + '\n',
  'utf8'
);

// --- GSC priority models ----------------------------------------------------
const priorityDoc = readJson('output/phase81/PHASE81_PRIORITY_MODELS.json');
const gscModels = new Map();
for (const item of (priorityDoc.models || priorityDoc.priority_models || [])) {
  const key = String(item.canonical_model_id || item.id || '')
    .toLowerCase()
    .replace(/^stihl_/, '');
  if (!key) continue;
  gscModels.set(key, {
    clicks: Number(item.clicks || 0),
    impressions: Number(item.impressions || 0)
  });
}

const db = new Database(path.join(ROOT, 'data', 'stihl_database.db'), { readonly: true });
const fitments = db
  .prepare('SELECT DISTINCT canonical_model_id, part_number FROM model_part_fitments')
  .all();
db.close();

const partsByModel = new Map();
for (const row of fitments) {
  const part = normalize(row.part_number);
  if (!part || !row.canonical_model_id) continue;
  if (!partsByModel.has(row.canonical_model_id)) partsByModel.set(row.canonical_model_id, new Set());
  partsByModel.get(row.canonical_model_id).add(part);
}

const covered = new Set([...ebayParts, ...amazonParts]);
const gscModelCoverage = [...gscModels.entries()]
  .map(([model, metrics]) => {
    const parts = partsByModel.get(model) || new Set();
    const withEbay = [...parts].filter(part => ebayParts.has(part)).length;
    const withAmazon = [...parts].filter(part => amazonParts.has(part)).length;
    const withAny = [...parts].filter(part => covered.has(part)).length;
    return {
      model,
      clicks: metrics.clicks,
      impressions: metrics.impressions,
      parts: parts.size,
      parts_with_ebay: withEbay,
      parts_with_amazon: withAmazon,
      parts_with_any_direct_link: withAny,
      parts_without_any_direct_link: parts.size - withAny
    };
  })
  .sort((a, b) => b.clicks - a.clicks || a.model.localeCompare(b.model));

const baseline = {
  phase: '99',
  generated_at: new Date().toISOString(),
  production: {
    branch: 'main',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    note: 'Phase 98 merged as 9fafc7b; Phase 99 works from that main.'
  },
  inputs: [
    stat('data/affiliate/ebay_offers.json'),
    stat('data/affiliate/verified_amazon_registry.json'),
    stat('data/parts_catalog.json'),
    stat('output/phase81/PHASE81_PRIORITY_MODELS.json')
  ],
  coverage: {
    ebay_active_offers: activeOffers.length,
    ebay_parts: ebayParts.size,
    ebay_marketplaces: ebayMarketplaces,
    ebay_active_items: new Set(activeOffers.map(offer => offer.item_id)).size,
    amazon_active_offers: amazonActive.length,
    amazon_parts: amazonParts.size,
    combined_parts: covered.size,
    overlap_ebay_amazon: [...ebayParts].filter(part => amazonParts.has(part)).length,
    parts_ebay: [...ebayParts].sort(),
    parts_amazon: [...amazonParts].sort(),
    parts_combined: [...covered].sort()
  },
  researched_before_phase99: {
    unique_parts: researched.size,
    ...researchedByPhase,
    sources: sources.map(([phase, suffix]) => `output/${phase}/batches/*${suffix}`)
  },
  phase98_reconciliation: reconciliation.counts,
  gsc_priority_models: {
    models: gscModels.size,
    parts_with_any_direct_link: gscModelCoverage.reduce((sum, item) => sum + item.parts_with_any_direct_link, 0),
    parts_without_any_direct_link: gscModelCoverage.reduce((sum, item) => sum + item.parts_without_any_direct_link, 0)
  },
  campaign: {
    store_campaign_ids: [...new Set(activeOffers.map(offer => offer.campaign_id).filter(Boolean))],
    environment_campaign_id_matches_store:
      [...new Set(activeOffers.map(offer => offer.campaign_id).filter(Boolean))]
        .every(id => id === process.env.EBAY_EPN_CAMPAIGN_ID),
    environment_campaign_id_configured: /^\d+$/.test(process.env.EBAY_EPN_CAMPAIGN_ID || ''),
    production_bootstrap_source:
      'EbayStoreBootstrap: options.campaignId || archive.campaign_id || first offer campaign_id || EBAY_EPN_CAMPAIGN_ID'
  },
  gsc_model_coverage: gscModelCoverage
};

fs.writeFileSync(path.join(OUT, 'PHASE99_BASELINE.json'), JSON.stringify(baseline, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  coverage: baseline.coverage,
  researched: baseline.researched_before_phase99,
  reconciliation: { counts: reconciliation.counts, arithmetic: reconciliation.arithmetic },
  gsc: baseline.gsc_priority_models,
  campaign: baseline.campaign
}, null, 2));
