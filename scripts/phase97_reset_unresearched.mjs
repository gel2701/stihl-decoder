#!/usr/bin/env node
/**
 * scripts/phase97_reset_unresearched.mjs
 *
 * Removes the parts from a Phase 97 progress file that produced no API result at
 * all (raw_results 0 with no decision). Those are the parts an HTTP 429 left
 * behind as NO_LISTING_FOUND; they were never researched, so they go back into
 * the queue instead of being reported as having no listing.
 *
 * Usage: node scripts/phase97_reset_unresearched.mjs queue_11 queue_12
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BATCHES_DIR = path.join(ROOT, 'output', 'phase97', 'batches');

const batchIds = process.argv.slice(2);
if (batchIds.length === 0) {
  console.error('ABORT: pass one or more batch ids (e.g. queue_11 queue_12)');
  process.exit(1);
}

const untouched = (entry) => {
  if (entry.skipped || entry.error) return false;
  return (entry.raw_results || 0) === 0
    && (entry.active || 0) === 0
    && (entry.needs_evidence || 0) === 0
    && (entry.rejected || 0) === 0;
};

for (const batchId of batchIds) {
  const file = path.join(BATCHES_DIR, `${batchId}_progress.json`);
  if (!fs.existsSync(file)) {
    console.log(batchId, 'no progress file');
    continue;
  }
  const progress = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dropped = (progress.per_part || []).filter(untouched).map(entry => entry.part_number);
  if (dropped.length === 0) {
    console.log(batchId, 'nothing to reset');
    continue;
  }
  const droppedSet = new Set(dropped);
  progress.per_part = progress.per_part.filter(entry => !droppedSet.has(entry.part_number));
  progress.processed_parts = (progress.processed_parts || []).filter(part => !droppedSet.has(part));
  progress.accepted_offers = (progress.accepted_offers || []).filter(offer => !droppedSet.has(offer.part_number));
  progress.needs_evidence_offers = (progress.needs_evidence_offers || []).filter(offer => !droppedSet.has(offer.part_number));
  progress.rejected_offers = (progress.rejected_offers || []).filter(offer => !droppedSet.has(offer.part_number));
  progress.complete = false;
  progress.updated_at = new Date().toISOString();
  delete progress.rate_limited;
  delete progress.rate_limited_at;
  delete progress.rate_limited_part;
  fs.writeFileSync(file, JSON.stringify(progress, null, 2) + '\n', 'utf8');
  console.log(batchId, 'reset', dropped.length, 'parts back into the queue');
}
