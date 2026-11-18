#!/usr/bin/env node
/**
 * scripts/phase93_reconcile_ebay_store.mjs
 *
 * Phase 93 — Safe, idempotent eBay store reconciliation & diagnostics.
 *
 * Why did the local store contain 0 offers while production had 1,773?
 * - In Phase 80 (AffiliateStoragePaths.js), production resolves `/var/data/affiliate/ebay_offers.json`
 *   on Render's persistent disk, whereas local/non-persistent runs resolve `data/affiliate/ebay_offers.json`.
 * - Phases 81-86 persisted adjudicated eBay payloads in `output/phase81..86/ebay_offers_phase*.json`
 *   (2,516 total records -> 1,773 unique canonical offers across 220 parts), while the git-tracked
 *   local `data/affiliate/ebay_offers.json` remained initialized with `offers: []` and
 *   `seed_phase86_ebay_store.mjs` omitted `ebay_offers_phase86.json` (136 unique offers).
 *
 * This script:
 * 1. Backs up current target store state before modifying anything.
 * 2. Re-validates every payload offer with `toCanonicalEbayOffer` (campaign 5339245312),
 *    deduplicates by `(part_number, marketplace, item_id)` without duplicate registrations.
 * 3. Writes idempotently via `saveEbayOfferStore` (preserving any other untouched ACTIVE offers).
 * 4. Audits credential/access availability without logging secret values.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEbayOfferStore, saveEbayOfferStore, toCanonicalEbayOffer } from '../src/affiliate/EbayOfferStore.js';
import { getEbayOfferStorePath, isPersistentStorageConfigured } from '../src/affiliate/AffiliateStoragePaths.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT93 = path.join(ROOT, 'output', 'phase93');
fs.mkdirSync(OUT93, { recursive: true });

const CAMPAIGN_ID = '5339245312';
const args = process.argv.slice(2);
const storeArg = args.indexOf('--store') >= 0 ? args[args.indexOf('--store') + 1] : null;
const dryRun = args.includes('--dry-run');

const PAYLOADS = [
  'output/phase80/ebay_offers_phase80.json',
  'output/phase81/ebay_offers_phase81.json',
  'output/phase82/ebay_offers_phase82.json',
  'output/phase83/ebay_offers_phase83.json',
  'output/phase84/ebay_offers_phase84.json',
  'output/phase85/ebay_offers_phase85.json',
  'output/phase86/ebay_offers_phase86.json'
];

const storePath = storeArg ? path.resolve(storeArg) : getEbayOfferStorePath();
const beforeDoc = loadEbayOfferStore(storePath);

// Safe local pre-write backup
const backupPath = path.join(OUT93, 'ebay_offers.before_phase93.backup.json');
if (!dryRun && !fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, JSON.stringify(beforeDoc, null, 2) + '\n', 'utf8');
}

const seen = new Map();
const perPayload = {};
let totalConsidered = 0;
let invalidSkipped = 0;

for (const rel of PAYLOADS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
  const offers = Array.isArray(doc.offers) ? doc.offers : [];
  perPayload[rel] = offers.length;
  for (const raw of offers) {
    totalConsidered++;
    const normalized = { ...raw, marketplaceId: raw.marketplaceId || raw.marketplace };
    const canonical = toCanonicalEbayOffer(normalized, { campaignId: CAMPAIGN_ID });
    if (!canonical) {
      invalidSkipped++;
      continue;
    }
    const key = `${canonical.part_number}:${canonical.marketplace}:${canonical.item_id}`;
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
}

const uniqueOffers = [...seen.values()];
const uniqueParts = new Set(uniqueOffers.map(o => PartNormalizer.normalizePartNumber(o.part_number)).filter(Boolean));
const byMarketplace = {
  EBAY_NL: uniqueOffers.filter(o => (o.marketplaceId || o.marketplace) === 'EBAY_NL').length,
  EBAY_DE: uniqueOffers.filter(o => (o.marketplaceId || o.marketplace) === 'EBAY_DE').length
};

const result = dryRun
  ? { dry_run: true, would_write: uniqueOffers.length }
  : saveEbayOfferStore(storePath, uniqueOffers, { campaignId: CAMPAIGN_ID });

const afterDoc = dryRun ? beforeDoc : loadEbayOfferStore(storePath);
const needsGroups = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/phase86/PHASE86_NEEDS_EVIDENCE_GROUPS.json'), 'utf8'));

const credentialAudit = {
  EBAY_ENABLED: process.env.EBAY_ENABLED === 'true',
  EBAY_CLIENT_ID_present: Boolean(process.env.EBAY_CLIENT_ID?.trim()),
  EBAY_CLIENT_SECRET_present: Boolean(process.env.EBAY_CLIENT_SECRET?.trim()),
  EBAY_EPN_CAMPAIGN_ID_present: Boolean(process.env.EBAY_EPN_CAMPAIGN_ID?.trim()),
  persistent_disk_configured: isPersistentStorageConfigured(),
  resolved_store_path: path.relative(ROOT, storePath).replace(/\\/g, '/')
};

const report = {
  phase: '93',
  generated_at: new Date().toISOString(),
  root_cause: 'Local data/affiliate/ebay_offers.json was empty (0 offers from Phase 80 init) because production stores its live 1,773 offers on Render /var/data/affiliate/ebay_offers.json, while git archived adjudicated batches in output/phase81..86/ebay_offers_phase8*.json (and scripts/seed_phase86_ebay_store.mjs omitted phase86).',
  store_before_count: beforeDoc.offers.length,
  store_after_count: afterDoc.offers.length,
  per_payload_counts: perPayload,
  total_payload_records_considered: totalConsidered,
  invalid_skipped: invalidSkipped,
  reconciled_unique_offers: uniqueOffers.length,
  reconciled_unique_parts: uniqueParts.size,
  by_marketplace: byMarketplace,
  save_result: {
    written: result.written ?? 0,
    added: result.added ?? 0,
    updated: result.updated ?? 0,
    preserved: result.preserved ?? 0,
    rejected: result.rejected ?? 0,
    conflicts: result.conflicts ?? 0
  },
  remaining_ebay_recovery_backlog: needsGroups.needs_evidence_groups || {},
  credential_audit: credentialAudit
};

fs.writeFileSync(path.join(OUT93, 'PHASE93_EBAY_RECOVERY.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
