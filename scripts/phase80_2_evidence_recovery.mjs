#!/usr/bin/env node
/**
 * scripts/phase80_2_evidence_recovery.mjs
 *
 * Phase 80.2 — recover activatable offers from the evidence a previous live
 * batch ALREADY fetched. This script never calls eBay: no OAuth, no Browse
 * search, no getItem. It only reads
 *
 *   --report    /var/data/phase80/phase80_batch_live_*.json   (batch output)
 *   --input     /var/data/phase76e/pilot_100_results_*.json   (original offers)
 *   --evidence  /var/data/affiliate/ebay_evidence_registry.json (getItem cache)
 *
 * re-adjudicates every (part, listing) pair with the canonical matcher, writes
 * only proven ACCEPT offers to the persistent store and verifies that the
 * AffiliateOfferResolver returns them.
 *
 * It also explains, per candidate, exactly which evidence is present and which
 * single rule blocks activation (identity vs shipping), so a zero-activation
 * result is never just a number again.
 */

import fs from 'fs';
import path from 'path';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import { ReviewEvidenceBatch } from '../src/affiliate/ReviewEvidenceBatch.js';
import { saveEbayOfferStore, loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import {
  getEbayOfferStorePath,
  getEbayEvidenceRegistryPath,
  getPhase80OutputDir
} from '../src/affiliate/AffiliateStoragePaths.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const args = process.argv.slice(2);
const readArg = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const REPORT_PATH = readArg('--report');
const INPUT_PATHS = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input' && args[i + 1]) INPUT_PATHS.push(args[i + 1]);
}
const EVIDENCE = readArg('--evidence') || getEbayEvidenceRegistryPath();
const STORE = readArg('--store') || getEbayOfferStorePath();
const OUT_DIR = readArg('--out-dir') || getPhase80OutputDir();
const LIMIT = readArg('--limit') ? Number(readArg('--limit')) : 0;
const CAMPAIGN = process.env.EBAY_EPN_CAMPAIGN_ID || '';

if (!REPORT_PATH && INPUT_PATHS.length === 0) {
  console.error('ABORT: pass --report <batch json> and/or --input <offers json>');
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`ABORT: cannot read ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

function collectOffers() {
  const offers = [];
  for (const inputPath of INPUT_PATHS) {
    const doc = readJson(inputPath);
    const list = Array.isArray(doc) ? doc
      : (Array.isArray(doc.review_offers) ? doc.review_offers
        : (Array.isArray(doc.offers) ? doc.offers : []));
    for (const offer of list) offers.push({ ...offer, __source: 'INPUT' });
  }
  if (REPORT_PATH) {
    const report = readJson(REPORT_PATH);
    for (const key of ['needs_evidence_offers', 'rejected_offers', 'accepted_offers']) {
      for (const offer of (Array.isArray(report[key]) ? report[key] : [])) {
        offers.push({ ...offer, __source: `REPORT:${key}` });
      }
    }
    return { offers, report };
  }
  return { offers, report: null };
}

const { offers, report } = collectOffers();
const evidenceRegistry = new EbayEvidenceRegistry({ path: EVIDENCE });

const byPart = new Map();
let pairsSeen = 0;
let duplicatePairs = 0;
const pairKeys = new Set();
const invalid = [];
for (const offer of offers) {
  const part = PartNormalizer.normalizePartNumber(offer.part_number);
  const itemId = offer.item_id || offer.itemId;
  if (!part) { invalid.push({ reason: 'INVALID_PART', offer: offer.title || null }); continue; }
  if (!itemId) { invalid.push({ reason: 'MISSING_ITEM_ID', part }); continue; }
  pairsSeen++;
  const pairKey = `${part}:${itemId}`;
  if (pairKeys.has(pairKey)) { duplicatePairs++; continue; }
  pairKeys.add(pairKey);
  if (!byPart.has(part)) {
    byPart.set(part, { part_number: part, description: offer.title || '', category: offer.category || '', models: [], existing: [] });
  }
  byPart.get(part).existing.push(offer);
}

let candidates = [...byPart.values()];

// Catalog models (part -> STIHL model ids) for structured corroboration.
const catalogModels = new Map();
try {
  const dbPath = path.resolve(process.cwd(), 'data', 'stihl_database.db');
  if (fs.existsSync(dbPath)) {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    for (const row of db.prepare('SELECT part_number, canonical_model_id FROM model_part_fitments').all()) {
      if (!catalogModels.has(row.part_number)) catalogModels.set(row.part_number, new Set());
      catalogModels.get(row.part_number).add(row.canonical_model_id);
    }
    db.close();
  }
} catch {
  // Corroboration falls back to whatever the input records carry.
}
for (const candidate of candidates) {
  const models = catalogModels.get(candidate.part_number);
  if (models) candidate.models = [...models];
}
if (LIMIT > 0) candidates = candidates.slice(0, LIMIT);

if (CAMPAIGN) process.env.EBAY_ENABLED = 'true';

const apiClient = new EbayBrowseApiClient({});
const engine = new EbayHighVolumeEngine({
  apiClient,
  marketplaces: ['EBAY_NL', 'EBAY_DE'],
  vendors: ['saegenspezi_de', 'ALL'],
  batchDelayMs: 0,
  enrich: false,
  evidenceRegistry
});
const batch = new ReviewEvidenceBatch({ engine, evidenceRegistry, batchDelayMs: 0 });
const result = await batch.run(candidates, { live: false, allowSearchFallback: false });

const storeResult = saveEbayOfferStore(STORE, result.accepted, { campaignId: CAMPAIGN });
const storeDoc = loadEbayOfferStore(STORE);

const uniqueActiveParts = new Set(result.accepted.map(offer => offer.part_number));
let resolverLinks = 0;
let resolverStatus = 'SKIPPED_NO_ACCEPTED_OFFERS';
if (uniqueActiveParts.size > 0) {
  const resolver = new AffiliateOfferResolver({
    ebayStorePath: STORE,
    verifiedRegistry: new VerifiedOfferRegistry({ productionActivationAllowed: false })
  });
  resolverStatus = resolver.providers.has('ebay') ? 'VERIFIED' : 'PROVIDER_DISABLED';
  for (const part of uniqueActiveParts) {
    resolverLinks += resolver.resolveOffers({ partNumber: part, partName: '' })
      .filter(offer => offer.provider === 'ebay').length;
  }
}

const topBlockers = Object.entries(result.blocker_counts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([step, count]) => ({ step, count, kind: (result.shipping_blockers[step] ? 'SHIPPING' : 'IDENTITY') }));

const listingsWithEvidence = result.diagnostics.filter(d => d.evidence_source && d.evidence.aspects_count >= 0 && d.evidence.mpn_values.length > 0 || d.evidence.title_has_target_part).length;

const provablyWrong = result.rejected.filter(item => (item.reason_codes || []).some(code =>
  ['CONTRADICTORY_MATCH', 'CONFLICTING_MPN', 'CONFLICTING_TITLE_PART_NUMBER', 'PART_NUMBER_MISMATCH', 'PRODUCT_TYPE_CONFLICT', 'BUNDLE_OR_KIT', 'AFFILIATE_URL_INVALID', 'CAMPAIGN_ID_MISMATCH'].includes(code)
));

const summary = {
  schema_version: '1.0.0',
  phase: '80.2',
  generated_at: new Date().toISOString(),
  mode: 'OFFLINE_EVIDENCE_REUSE',
  network_calls: 0,
  campaign_id_configured: /^\d+$/.test(CAMPAIGN),
  activation_blocker: /^\d+$/.test(CAMPAIGN) ? null : 'EBAY_EPN_CAMPAIGN_ID_MISSING',
  sources: { report: REPORT_PATH, inputs: INPUT_PATHS, evidence: EVIDENCE, store: STORE },
  required_report: {
    '1_listings_with_full_getitem_evidence': listingsWithEvidence,
    '1_listings_processed': result.unique_items,
    '2_top_blockers': topBlockers,
    '3_evidence_records_reused': result.get_item_reused,
    '4_candidates_enriched_from_stored_evidence': result.evidence_completed,
    '5_new_active_offers': result.accepted.length,
    '6_unique_parts_buyable': uniqueActiveParts.size,
    '7_remaining_needs_evidence': result.needs_evidence.length,
    '8_provably_wrong': provablyWrong.length,
    '9_active_records_on_disk': storeDoc.offers.filter(offer => offer.status === 'ACTIVE').length,
    '10_resolver_links': resolverLinks
  },
  coverage: {
    candidate_pairs_from_sources: pairsSeen,
    duplicate_part_item_pairs_dropped: duplicatePairs,
    unique_listings: result.unique_items,
    unique_parts: candidates.length,
    invalid_records: invalid.length,
    item_relations: result.item_relations.length,
    relations_preserved: result.item_relations.every(rel => rel.part_numbers.length >= 1)
  },
  blockers: {
    by_first_step: result.blocker_counts,
    by_reason_code: result.reason_counts,
    identity: result.identity_blockers,
    shipping: result.shipping_blockers,
    evidence_only_rejects: result.rejected_with_missing_evidence_only
  },
  chain: {
    store_written: storeResult.written,
    store_preserved: storeResult.preserved,
    store_rejected_by_guard: storeResult.rejected,
    resolver_status: resolverStatus,
    resolver_links: resolverLinks
  },
  diagnostics: result.diagnostics.slice(0, 500),
  now_active: result.accepted.map(offer => ({
    part_number: offer.part_number,
    item_id: offer.item_id,
    title: offer.title,
    match_type: offer.match_type,
    affiliate_url: offer.affiliate_url
  })),
  still_needs_evidence: result.needs_evidence.slice(0, 500).map(item => ({
    part_number: item.part_number,
    item_id: item.item_id,
    first_blocking_step: item.evidence_gaps?.[0] || null,
    reason_codes: item.reason_codes,
    evidence_gaps: item.evidence_gaps
  }))
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonPath = path.join(OUT_DIR, `phase80_2_recovery_${stamp}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

const md = [
  '# Phase 80.2 — Evidence Recovery',
  '',
  `Generated: ${summary.generated_at}`,
  `Mode: ${summary.mode} (0 network calls)`,
  '',
  '## Required numbers',
  '',
  '| # | Metric | Value |',
  '|---|---|---|',
  `| 1 | Listings processed | ${summary.required_report['1_listings_processed']} |`,
  `| 1 | Listings with complete getItem evidence | ${summary.required_report['1_listings_with_full_getitem_evidence']} |`,
  `| 3 | Evidence records reused | ${summary.required_report['3_evidence_records_reused']} |`,
  `| 4 | Candidates enriched from stored evidence | ${summary.required_report['4_candidates_enriched_from_stored_evidence']} |`,
  `| 5 | New ACTIVE offers | ${summary.required_report['5_new_active_offers']} |`,
  `| 6 | Unique parts buyable | ${summary.required_report['6_unique_parts_buyable']} |`,
  `| 7 | Remaining NEEDS_EVIDENCE | ${summary.required_report['7_remaining_needs_evidence']} |`,
  `| 8 | Provably wrong | ${summary.required_report['8_provably_wrong']} |`,
  `| 9 | ACTIVE records on disk | ${summary.required_report['9_active_records_on_disk']} |`,
  `| 10 | Resolver links | ${summary.required_report['10_resolver_links']} |`,
  '',
  '## Top blockers',
  '',
  '| Rule | Kind | Count |',
  '|---|---|---|',
  ...topBlockers.map(b => `| ${b.step} | ${b.kind} | ${b.count} |`),
  '',
  `Evidence-only rejects (no contradiction, missing evidence only): ${result.rejected_with_missing_evidence_only}`,
  '',
  `Relations: ${summary.coverage.candidate_pairs_from_sources} part↔listing pairs, ` +
    `${summary.coverage.duplicate_part_item_pairs_dropped} duplicates dropped, ` +
    `${summary.coverage.unique_listings} unique listings, ${summary.coverage.item_relations} item relations preserved.`,
  '',
  `Store: written ${storeResult.written}, preserved ${storeResult.preserved}, rejected by guard ${storeResult.rejected}.`,
  `Resolver: ${resolverStatus}, ${resolverLinks} links.`,
  ''
].join('\n');
const mdPath = path.join(OUT_DIR, `phase80_2_recovery_${stamp}.md`);
fs.writeFileSync(mdPath, md, 'utf8');

console.log(JSON.stringify({
  mode: summary.mode,
  activation_blocker: summary.activation_blocker,
  required_report: summary.required_report,
  coverage: summary.coverage,
  chain: summary.chain,
  json: path.relative(process.cwd(), jsonPath),
  markdown: path.relative(process.cwd(), mdPath)
}, null, 2));
process.exit(0);
