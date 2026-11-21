/**
 * src/affiliate/EbayStoreBootstrap.js
 *
 * Phase 96 — Publish committed eBay offers into the persistent store.
 *
 * Why this exists: the eBay offer store the site reads lives on the persistent
 * disk (`/var/data/affiliate/ebay_offers.json` on Render). A batch that proves
 * new offers writes them into the repository copy
 * (`data/affiliate/ebay_offers.json`), and a deploy never touched the disk copy,
 * so proven offers stayed invisible on the product pages.
 *
 * This bootstrap only ever ADDS. Every record it copies is already an
 * adjudicated `decision: ACCEPT` / `status: ACTIVE` offer from the committed
 * archive, and it is written through the existing `saveEbayOfferStore` route,
 * which re-validates each record (campaign id, affiliate URL, match type, NL
 * delivery) and preserves everything already stored.
 *
 * It runs at startup only when the site uses a store outside the repository, so
 * local runs and tests keep reading the file they just wrote.
 */

import fs from 'fs';
import path from 'path';

import { loadEbayOfferStore, saveEbayOfferStore, ebayOfferKey } from './EbayOfferStore.js';

/**
 * @param {Object} [options]
 * @param {string} options.archivePath committed store (repository copy)
 * @param {string} options.storePath store the site reads
 * @param {string} [options.campaignId]
 * @returns {{ applied: boolean, reason?: string, archive_offers?: number, already_present?: number, added?: number, rejected?: number }}
 */
export function reconcileEbayStoreFromArchive(options = {}) {
  const archivePath = options.archivePath;
  const storePath = options.storePath;
  if (!archivePath || !storePath) return { applied: false, reason: 'PATHS_MISSING' };
  if (path.resolve(archivePath) === path.resolve(storePath)) {
    return { applied: false, reason: 'SAME_STORE' };
  }
  if (!fs.existsSync(archivePath)) return { applied: false, reason: 'NO_ARCHIVE' };

  const archive = loadEbayOfferStore(archivePath);
  const active = archive.offers.filter(offer =>
    offer
    && offer.decision === 'ACCEPT'
    && offer.status === 'ACTIVE'
    && offer.affiliate_url);
  if (active.length === 0) return { applied: false, reason: 'ARCHIVE_EMPTY' };

  const current = loadEbayOfferStore(storePath);
  const present = new Set(current.offers.map(offer => ebayOfferKey(offer.item_id, offer.marketplace, offer.part_number)));
  const missing = active.filter(offer => !present.has(ebayOfferKey(offer.item_id, offer.marketplace, offer.part_number)));

  if (missing.length === 0) {
    return { applied: false, reason: 'ALREADY_IN_SYNC', archive_offers: active.length, already_present: active.length };
  }

  const result = saveEbayOfferStore(storePath, missing, { campaignId: options.campaignId });
  return {
    applied: true,
    archive_offers: active.length,
    already_present: active.length - missing.length,
    added: result.added,
    rejected: result.rejected,
    conflicts: result.conflicts
  };
}
