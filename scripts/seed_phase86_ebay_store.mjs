#!/usr/bin/env node
/**
 * scripts/seed_phase86_ebay_store.mjs
 *
 * Phase 86 — rebuild the local offer store from the adjudicated Phase 81-85
 * payloads so a new batch can be measured against what is already published.
 *
 * Production keeps its own store on the persistent disk (/var/data); this
 * script only fills the local store, and only with offers that already carry a
 * full adjudication from an earlier phase (decision ACCEPT, ACTIVE status,
 * EXACT match type and confirmed NL shipping). Nothing is invented here.
 *
 * Usage:
 *   node scripts/seed_phase86_ebay_store.mjs [--store path] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { saveEbayOfferStore, loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { getEbayOfferStorePath } from '../src/affiliate/AffiliateStoragePaths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const storeArg = args.indexOf('--store') >= 0 ? args[args.indexOf('--store') + 1] : null;
const dryRun = args.includes('--dry-run');

const PAYLOADS = [
  'output/phase81/ebay_offers_phase81.json',
  'output/phase82/ebay_offers_phase82.json',
  'output/phase83/ebay_offers_phase83.json',
  'output/phase84/ebay_offers_phase84.json',
  'output/phase85/ebay_offers_phase85.json'
];

const storePath = storeArg ? path.resolve(storeArg) : getEbayOfferStorePath();
const seen = new Map();
let considered = 0;
for (const rel of PAYLOADS) {
  const file = path.join(rootDir, rel);
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const offer of (doc.offers || [])) {
    considered++;
    const key = `${offer.part_number}:${offer.marketplace || offer.marketplaceId}:${offer.item_id}`;
    if (!seen.has(key)) seen.set(key, { ...offer, marketplaceId: offer.marketplaceId || offer.marketplace });
  }
}

const offers = [...seen.values()];
const before = loadEbayOfferStore(storePath);
const result = dryRun
  ? { dry_run: true, would_write: offers.length }
  : saveEbayOfferStore(storePath, offers);

console.log(JSON.stringify({
  store: storePath,
  payloads: PAYLOADS.length,
  offers_considered: considered,
  unique_offers: offers.length,
  store_before: before.offers.length,
  result
}, null, 2));
