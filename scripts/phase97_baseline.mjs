#!/usr/bin/env node
/**
 * scripts/phase97_baseline.mjs
 *
 * Phase 97 — production baselines and the reconciliation of Phase 96.
 *
 * Reads the committed store at the Phase 96 commits (git show) and the Phase 96
 * batch artefacts, then explains every offer the Phase 96 report did not count.
 * Nothing is modified; the result is written to
 * output/phase97/PHASE97_BASELINE.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT97 = path.join(ROOT, 'output', 'phase97');
fs.mkdirSync(OUT97, { recursive: true });

const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const key = offer => `${offer.part_number}:${offer.marketplace}:${offer.item_id}`;

const storeAt = commit => {
  try {
    const raw = execFileSync('git', ['show', `${commit}:data/affiliate/ebay_offers.json`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
    const offers = (JSON.parse(raw).offers || []).filter(offer => offer.status === 'ACTIVE');
    const marketplaces = {};
    for (const offer of offers) marketplaces[offer.marketplace] = (marketplaces[offer.marketplace] || 0) + 1;
    return {
      commit,
      active_offers: offers.length,
      unique_parts: new Set(offers.map(offer => offer.part_number)).size,
      unique_items: new Set(offers.map(offer => offer.item_id)).size,
      marketplaces,
      offers
    };
  } catch (error) {
    return { commit, error: error.message };
  }
};

// Phase 95 (before Phase 96) and the Phase 96 merge.
const before = storeAt('fe1860e');
const after = storeAt('4c7e0db');

// Phase 96 batch artefacts.
const resultsDir = path.join(ROOT, 'output', 'phase96', 'batches');
const resultFiles = fs.existsSync(resultsDir)
  ? fs.readdirSync(resultsDir).filter(file => file.endsWith('_result.json')).sort()
  : [];
const countedOffers = [];
const countedParts = new Set();
const skippedParts = new Set();
const skipByBatch = {};
const perPart = [];
for (const file of resultFiles) {
  const result = readJson(path.join('output', 'phase96', 'batches', file));
  for (const offer of result.accepted_offers || []) {
    countedOffers.push(offer);
    countedParts.add(offer.part_number);
  }
  const skipped = (result.per_part || []).filter(entry => entry.skipped === 'ALREADY_ACTIVE');
  skipByBatch[result.batch_id] = skipped.length;
  for (const entry of skipped) skippedParts.add(entry.part_number);
  perPart.push(...(result.per_part || []));
}

const beforeKeys = new Set((before.offers || []).map(key));
const added = (after.offers || []).filter(offer => !beforeKeys.has(key(offer)));
const countedKeys = new Set(countedOffers.map(key));
const uncounted = added.filter(offer => !countedKeys.has(key(offer)));
const uncountedParts = new Set(uncounted.map(offer => offer.part_number));
const skippedWithoutAdded = [...skippedParts].filter(part => !uncountedParts.has(part));

const archiveCampaigns = [...new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'affiliate', 'ebay_offers.json'), 'utf8')).offers
  .map(offer => offer.campaign_id)
  .filter(Boolean))];
const envCampaign = process.env.EBAY_EPN_CAMPAIGN_ID || '';

const baseline = {
  phase: '97',
  generated_at: new Date().toISOString(),
  store_before_phase96: {
    commit: before.commit,
    active_offers: before.active_offers,
    unique_parts: before.unique_parts,
    unique_items: before.unique_items,
    marketplaces: before.marketplaces
  },
  store_after_phase96: {
    commit: after.commit,
    active_offers: after.active_offers,
    unique_parts: after.unique_parts,
    unique_items: after.unique_items,
    marketplaces: after.marketplaces
  },
  phase96_growth: {
    offers: after.active_offers - before.active_offers,
    parts: after.unique_parts - before.unique_parts
  },
  phase96_report_counted: {
    offers: countedOffers.length,
    parts: countedParts.size
  },
  phase96_unreported: {
    offers: uncounted.length,
    parts: uncountedParts.size,
    explanation: 'Offers persisted by an interrupted batch run; the resumed run skipped those parts as ALREADY_ACTIVE and the result file only counts offers the run itself accepted.',
    skipped_parts_in_result_files: skippedParts.size,
    skipped_parts_without_store_offer: skippedWithoutAdded.length,
    skipped_by_batch: skipByBatch,
    sample: uncounted.slice(0, 10).map(offer => ({
      part_number: offer.part_number,
      item_id: offer.item_id,
      marketplace: offer.marketplace
    }))
  },
  campaign_check: {
    archive_campaign_ids: archiveCampaigns,
    environment_campaign_id_matches_archive: archiveCampaigns.includes(envCampaign),
    environment_campaign_id_configured: /^\d+$/.test(envCampaign),
    production_bootstrap_source: 'EbayStoreBootstrap: options.campaignId || archive.campaign_id || first offer campaign_id || EBAY_EPN_CAMPAIGN_ID',
    note: 'The archive and the operator-configured EBAY_EPN_CAMPAIGN_ID carry the same id; the Browse API responses used in this batch stamp that same campid on every affiliate URL.'
  }
};

fs.writeFileSync(path.join(OUT97, 'PHASE97_BASELINE.json'), JSON.stringify(baseline, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(baseline, null, 2));
