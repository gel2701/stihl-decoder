#!/usr/bin/env node
/**
 * scripts/build_phase86_ebay_queue.mjs
 *
 * Phase 86 — eBay work queue.
 *
 * The Phase 82 remaining queue holds 109 parts that were never queried against
 * the eBay Browse API. Phase 84 queried five of them before the API returned
 * HTTP 429, so 104 parts are still open. This script rebuilds that open queue
 * from the stored artifacts instead of retyping it, annotates every part with
 * its GSC priority, its existing Amazon availability and its models, and writes
 * output/phase86/PHASE86_EBAY_QUEUE.json.
 *
 * It never writes to the catalog, the offer store or the evidence registry.
 *
 * Usage:
 *   node scripts/build_phase86_ebay_queue.mjs [--limit N]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(rootDir, rel), 'utf8'));

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit') >= 0 ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const phase82Queue = readJson('output/phase82/PHASE82_REMAINING_QUEUE.json');
const phase84Audit = readJson('output/phase84/PHASE84_AFFILIATE_AUDIT.json');
const amazonRegistry = readJson('data/affiliate/verified_amazon_registry.json');
const priorityModels = readJson('output/phase81/PHASE81_PRIORITY_MODELS.json');

/** Parts that were really queried after the Phase 82 queue was frozen. */
const queriedAfterPhase82 = new Set(
  (phase84Audit.offer_parts || []).map((p) => String(p).replace(/\D/g, ''))
);

/** GSC priority ranking (1 = highest measured demand). */
const priorityRank = new Map();
const priorities = Array.isArray(priorityModels)
  ? priorityModels
  : (priorityModels.models || priorityModels.priority_models || []);
priorities.forEach((entry, index) => {
  const ids = typeof entry === 'string'
    ? [entry]
    : [entry.fitment_id, entry.model_id, entry.canonical_model_id, entry.model_name, entry.model].filter(Boolean);
  for (const id of ids) priorityRank.set(String(id).toLowerCase(), Number(entry.rank || index + 1));
});

/** Parts that already carry an ACTIVE Amazon offer. */
const amazonActiveParts = new Set(
  amazonRegistry.offers.filter((o) => o.status === 'ACTIVE').map((o) => o.part_number)
);

const open = [];
const alreadyQueried = [];
for (const entry of phase82Queue.queue) {
  const part = String(entry.part_number).replace(/\D/g, '');
  if (queriedAfterPhase82.has(part)) {
    alreadyQueried.push(part);
    continue;
  }
  const models = Array.isArray(entry.models) ? entry.models.map((m) => String(m).toLowerCase()) : [];
  const ranks = models.map((m) => priorityRank.get(m)).filter((r) => Number.isFinite(r));
  const bestRank = ranks.length ? Math.min(...ranks) : null;
  open.push({
    part_number: part,
    part_number_display: entry.part_number_display || part,
    description: entry.description || entry.part_name || '',
    category: entry.category || '',
    commercial_tier: entry.commercial_tier || '',
    indexable: entry.indexable !== false,
    models: entry.models || [],
    model_names: entry.model_names || [],
    gsc_priority_rank: bestRank,
    has_active_amazon_offer: amazonActiveParts.has(part)
  });
}

/* Priority: GSC-ranked parts first, then parts without any Amazon offer,
   then the stored queue order (already ordered by commercial value). */
open.sort((a, b) => {
  const ra = a.gsc_priority_rank ?? 999;
  const rb = b.gsc_priority_rank ?? 999;
  if (ra !== rb) return ra - rb;
  if (a.has_active_amazon_offer !== b.has_active_amazon_offer) return a.has_active_amazon_offer ? 1 : -1;
  return 0;
});

const queue = open.slice(0, limitArg);

const out = {
  schema_version: '1.0.0',
  phase: '86',
  generated_at: new Date().toISOString(),
  source: 'output/phase82/PHASE82_REMAINING_QUEUE.json',
  excluded_already_queried: alreadyQueried,
  queue_size: queue.length,
  open_parts_before_limit: open.length,
  gsc_prioritised_parts: open.filter((p) => p.gsc_priority_rank !== null).length,
  parts_without_amazon_offer: open.filter((p) => !p.has_active_amazon_offer).length,
  queue
};

fs.mkdirSync(path.join(rootDir, 'output', 'phase86'), { recursive: true });
fs.writeFileSync(path.join(rootDir, 'output', 'phase86', 'PHASE86_EBAY_QUEUE.json'), JSON.stringify(out, null, 2));

console.log(JSON.stringify({
  already_queried_after_phase82: alreadyQueried.length,
  open_parts: open.length,
  written: queue.length,
  gsc_prioritised: out.gsc_prioritised_parts,
  without_amazon: out.parts_without_amazon_offer
}, null, 2));
