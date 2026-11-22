#!/usr/bin/env node
/**
 * scripts/phase99_listing_mpn_groups.mjs
 *
 * Groups the Phase 98 NEEDS_EVIDENCE candidates that are blocked on the listing
 * MPN (`LISTING_MPN`) per part, so Phase 99 can measure whether they gained a
 * valid eBay link. Derived from the Phase 98 checkpoints; writes only
 * output/phase99/listing_mpn_groups.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'phase99');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const dir = path.join(ROOT, 'output', 'phase98', 'batches');
const files = fs.readdirSync(dir).filter(file => file.endsWith('_progress.json')).sort();
const groups = new Map();
let candidates = 0;
for (const file of files) {
  const progress = readJson(`output/phase98/batches/${file}`);
  for (const offer of progress.needs_evidence_offers || []) {
    const gaps = offer.evidence_gaps || offer.reason_codes || [];
    if (!gaps.some(gap => String(gap).includes('LISTING_MPN'))) continue;
    const part = PartNormalizer.normalizePartNumber(offer.part_number);
    if (!part) continue;
    candidates += 1;
    if (!groups.has(part)) groups.set(part, { part_number: part, batch: progress.batch_id, listings: [] });
    groups.get(part).listings.push({
      item_id: offer.item_id,
      marketplace: offer.marketplace,
      title: offer.title,
      evidence_gaps: gaps
    });
  }
}

const store = loadEbayOfferStore(path.join(ROOT, 'data', 'affiliate', 'ebay_offers.json'));
const activeParts = new Set(
  store.offers.filter(offer => offer.status === 'ACTIVE').map(offer => offer.part_number)
);
const list = [...groups.values()].sort((a, b) => a.part_number.localeCompare(b.part_number));
const summary = {
  phase: '98',
  generated_at: new Date().toISOString(),
  candidates,
  unique_parts: list.length,
  parts_with_active_ebay_offer: list.filter(group => activeParts.has(group.part_number)).length,
  source: 'output/phase98/batches/*_progress.json → needs_evidence_offers with LISTING_MPN'
};

fs.writeFileSync(
  path.join(OUT, 'listing_mpn_groups.json'),
  JSON.stringify({ summary, groups: list }, null, 2) + '\n',
  'utf8'
);
console.log(JSON.stringify(summary, null, 2));
