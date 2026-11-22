#!/usr/bin/env node
/**
 * scripts/phase98_build_retry.mjs
 *
 * Phase 98 — alternative-search pass for the parts of this batch that the exact
 * number ladder did not match.
 *
 * The exact STIHL part number is always searched first (the engine's query
 * ladder). Only parts that finished their exact search on both marketplaces
 * without an ACCEPT are queued here again, with targeted terms (model + part
 * type). No part that was already researched before Phase 98 is re-opened, and
 * no part that already has an ACTIVE offer is touched.
 *
 * Output: output/phase98/batches/retry_00.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT98 = path.join(ROOT, 'output', 'phase98');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const queue = readJson('output/phase98/queue.json').queue;
const queueByPart = new Map(queue.map(entry => [PartNormalizer.normalizePartNumber(entry.part_number), entry]));

const store = loadEbayOfferStore(path.join(ROOT, 'data', 'affiliate', 'ebay_offers.json'));
const activeParts = new Set(
  store.offers.filter(offer => offer.status === 'ACTIVE').map(offer => offer.part_number)
);

const dir = path.join(OUT98, 'batches');
const progressFiles = fs.readdirSync(dir).filter(file =>
  file.endsWith('_progress.json') && file.startsWith('queue_')
);

const reasons = {};
const skippedNoSource = [];
const retry = [];
for (const file of progressFiles.sort()) {
  const progress = readJson(`output/phase98/batches/${file}`);
  for (const entry of progress.per_part || []) {
    if (entry.skipped || entry.error || entry.unfinished) continue;
    const part = PartNormalizer.normalizePartNumber(entry.part_number);
    if (!part || activeParts.has(part)) continue;
    const queueEntry = queueByPart.get(part);
    if (!queueEntry) continue;
    // An alternative query can only add something when the exact-number search
    // returned at least one listing; with zero results there is nothing for the
    // engine to prove identity against, so that part is reported as blocked
    // instead of spending another API call.
    if ((entry.raw_results || 0) === 0) {
      skippedNoSource.push(part);
      reasons.NO_RESULTS_ON_EXACT_NUMBER = (reasons.NO_RESULTS_ON_EXACT_NUMBER || 0) + 1;
      continue;
    }
    const reason = entry.decision === 'NO_LISTING_FOUND'
      ? 'NO_ACCEPTING_LISTING'
      : (entry.first_blocking_step || (entry.reason_codes || [])[0] || 'NO_ACCEPT');
    reasons[reason] = (reasons[reason] || 0) + 1;
    retry.push({
      part_number: part,
      part_name: queueEntry.part_name,
      category: queueEntry.category,
      models: queueEntry.models,
      gsc_priority_model: queueEntry.gsc_priority_model,
      has_amazon_direct_link: queueEntry.has_amazon_direct_link,
      has_no_direct_link_anywhere: queueEntry.has_no_direct_link_anywhere,
      alternative_search_hints: queueEntry.alternative_search_hints,
      prior_decision: entry.decision,
      prior_first_blocking_step: entry.first_blocking_step || null,
      prior_batch: progress.batch_id
    });
  }
}

// One entry per part, even when a part appears in more than one checkpoint.
const unique = new Map();
for (const entry of retry) if (!unique.has(entry.part_number)) unique.set(entry.part_number, entry);
const parts = [...unique.values()].sort((a, b) => {
  if (a.gsc_priority_model !== b.gsc_priority_model) return a.gsc_priority_model ? -1 : 1;
  return a.part_number.localeCompare(b.part_number);
});

// Split into batches of 40 so every checkpoint stays as small as the exact pass.
const CHUNK = 40;
const chunkIds = [];
for (let i = 0; i < parts.length; i += CHUNK) {
  const id = `retry_${String(i / CHUNK).padStart(2, '0')}`;
  chunkIds.push(id);
  fs.writeFileSync(
    path.join(OUT98, 'batches', `${id}.json`),
    JSON.stringify({ batch_id: id, hint_mode: 'ALTERNATIVE_SEARCH_TERMS', parts: parts.slice(i, i + CHUNK) }, null, 2) + '\n',
    'utf8'
  );
}

console.log(JSON.stringify({
  retry_parts: parts.length,
  retry_batches: chunkIds,
  skipped_without_any_result: skippedNoSource.length,
  gsc_priority: parts.filter(entry => entry.gsc_priority_model).length,
  without_any_direct_link: parts.filter(entry => entry.has_no_direct_link_anywhere).length,
  reasons,
  sample: parts.slice(0, 5).map(entry => `${entry.part_number} (${entry.alternative_search_hints[0] || '-'})`)
}, null, 2));
