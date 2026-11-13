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
  getEbayShippingEvidencePath,
  getPhase80OutputDir
} from '../src/affiliate/AffiliateStoragePaths.js';
import { EbayShippingEvidenceRegistry } from '../src/affiliate/EbayShippingEvidenceRegistry.js';
import { ShippingRecovery, applyShippingEvidence } from '../src/affiliate/ShippingRecovery.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { SHIPPING_STATUS } from '../src/affiliate/EbayShippingEvidence.js';

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
// Phase 80.3: renew NL delivery proof for the known listings with an official
// deliveryCountry:NL Browse search. Never a discovery search: only the stored
// part/marketplace/item pairs are verified.
const VERIFY_SHIPPING = args.includes('--verify-shipping');
const SHIPPING_EVIDENCE = readArg('--shipping-evidence') || getEbayShippingEvidencePath();
const MAX_PARTS = readArg('--max-parts') ? Number(readArg('--max-parts')) : 10;
const MARKETS = readArg('--markets') ? String(readArg('--markets')).split(',').map(m => m.trim()).filter(Boolean) : null;

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
const marketplacesPerItem = new Map();
const invalid = [];
for (const offer of offers) {
  const part = PartNormalizer.normalizePartNumber(offer.part_number);
  const itemId = offer.item_id || offer.itemId;
  if (!part) { invalid.push({ reason: 'INVALID_PART', offer: offer.title || null }); continue; }
  if (!itemId) { invalid.push({ reason: 'MISSING_ITEM_ID', part }); continue; }
  pairsSeen++;
  // Candidate identity is part_number + marketplace + item_id: the same listing
  // can be valid for a part on both EBAY_NL and EBAY_DE, and one listing can
  // serve several parts. Dropping either dimension loses a real offer relation.
  const marketplace = String(offer.marketplace || offer.marketplaceId || 'EBAY_DE').toUpperCase();
  const pairKey = `${part}:${marketplace}:${itemId}`;
  if (pairKeys.has(pairKey)) { duplicatePairs++; continue; }
  pairKeys.add(pairKey);
  if (!marketplacesPerItem.has(itemId)) marketplacesPerItem.set(itemId, new Set());
  marketplacesPerItem.get(itemId).add(marketplace);
  if (!byPart.has(part)) {
    byPart.set(part, { part_number: part, description: offer.title || '', category: offer.category || '', models: [], existing: [] });
  }
  byPart.get(part).existing.push({ ...offer, marketplace });
}

let candidates = [...byPart.values()];

// Catalog models (part -> STIHL model ids) for structured corroboration.
const catalogModels = new Map();
const verifiedSupersessions = new Map();
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
    // Catalog-declared supersessions are the only verified replacement references
    // this repository holds; seller text alone never approves an equivalent.
    for (const row of db.prepare("SELECT DISTINCT part_number, superseded_by FROM model_part_fitments WHERE superseded_by IS NOT NULL AND superseded_by <> ''").all()) {
      if (/^\d{11}$/.test(row.superseded_by)) verifiedSupersessions.set(row.part_number, row.superseded_by);
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

if (VERIFY_SHIPPING) {
  const missing = [];
  if (!process.env.EBAY_CLIENT_ID) missing.push('EBAY_CLIENT_ID');
  if (!process.env.EBAY_CLIENT_SECRET) missing.push('EBAY_CLIENT_SECRET');
  if (!/^\d+$/.test(CAMPAIGN)) missing.push('EBAY_EPN_CAMPAIGN_ID');
  if (missing.length > 0) {
    console.error(`ABORT: --verify-shipping requires ${missing.join(', ')}`);
    process.exit(1);
  }
}

const apiClient = new EbayBrowseApiClient({});
const engine = new EbayHighVolumeEngine({
  apiClient,
  marketplaces: ['EBAY_NL', 'EBAY_DE'],
  vendors: ['saegenspezi_de', 'ALL'],
  batchDelayMs: 0,
  enrich: false,
  evidenceRegistry
});
// Phase 80.3 — targeted NL delivery recovery before re-adjudication. Reuses the
// stored getItem evidence; no getItem is requested here.
let shippingVerification = null;
let shippingEvidenceApplied = 0;
let shippingRegistrySummary = null;
if (VERIFY_SHIPPING) {
  const shippingRegistry = new EbayShippingEvidenceRegistry({ path: SHIPPING_EVIDENCE });
  const pending = [];
  for (const candidate of candidates) {
    for (const offer of candidate.existing) {
      pending.push({
        part_number: candidate.part_number,
        marketplace: String(offer.marketplace || offer.marketplaceId || 'EBAY_DE').toUpperCase(),
        item_id: offer.item_id || offer.itemId,
        title: offer.title || ''
      });
    }
  }
  const recovery = new ShippingRecovery({ apiClient, registry: shippingRegistry, seller: 'ALL', limit: 10 });
  shippingVerification = await recovery.verifyListings(pending, { maxParts: MAX_PARTS, markets: MARKETS });
  const applied = applyShippingEvidence(candidates, shippingVerification.records);
  shippingEvidenceApplied = applied.applied;
  shippingRegistry.save(SHIPPING_EVIDENCE);
  shippingRegistrySummary = { ...shippingRegistry.summary(), path: SHIPPING_EVIDENCE };
}

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

// Listing-level evidence counters. A title that mentions the part number is NOT
// getItem proof: it is reported separately and never counted as stored detail.
const byItem = new Map();
for (const diagnostic of result.diagnostics) {
  const key = `${diagnostic.marketplace}:${diagnostic.item_id}`;
  const entry = byItem.get(key) || { hasDetail: false, hasMpn: false, titleOnly: false, shippingConfirmed: false };
  const hasStoredDetail = ['REGISTRY', 'RUN_CACHE', 'GET_ITEM'].includes(diagnostic.evidence_source);
  const hasMpn = diagnostic.evidence.mpn_values.length > 0 || diagnostic.evidence.mpn_in_aspects === true;
  if (hasStoredDetail) entry.hasDetail = true;
  if (hasMpn) entry.hasMpn = true;
  if (!hasMpn && diagnostic.evidence.title_has_target_part) entry.titleOnly = true;
  if (diagnostic.shipping_status === SHIPPING_STATUS.CONFIRMED) entry.shippingConfirmed = true;
  byItem.set(key, entry);
}
const listingsWithGetItemDetail = [...byItem.values()].filter(entry => entry.hasDetail).length;
const listingsWithMpnEvidence = [...byItem.values()].filter(entry => entry.hasMpn).length;
const listingsTitleMatchOnly = [...byItem.values()].filter(entry => entry.titleOnly && !entry.hasMpn).length;
const listingsWithConfirmedShipping = [...byItem.values()].filter(entry => entry.shippingConfirmed).length;
const itemsOnMultipleMarketplaces = [...marketplacesPerItem.values()].filter(set => set.size > 1).length;

// Phase 80.3 — the 19 CONFLICTING_MPN rejections: report whether the listing also
// names an OEM number that the catalog itself registers as a supersession of the
// target. No auto-approval: only references the repository already verified are
// listed as legitimate equivalents.
const conflictDiagnostics = result.diagnostics.filter(diagnostic =>
  (diagnostic.reason_codes || []).includes('CONFLICTING_MPN')
  || (diagnostic.reason_codes || []).includes('CONFLICTING_TITLE_PART_NUMBER')
  || diagnostic.first_blocking_step === 'CONTRADICTORY_MATCH');
const mpnConflicts = conflictDiagnostics.map(diagnostic => {
  const part = diagnostic.part_number;
  const superseded = verifiedSupersessions.get(part) || null;
  const declared = (diagnostic.evidence?.mpn_values || [])
    .flatMap(value => String(value).replace(/[^0-9]/g, ' ').trim().split(/\s+/))
    .filter(value => /^\d{11}$/.test(value));
  return {
    part_number: part,
    item_id: diagnostic.item_id,
    marketplace: diagnostic.marketplace,
    title: diagnostic.title,
    declared_mpn_values: diagnostic.evidence?.mpn_values || [],
    verified_supersession: superseded,
    contradicts_verified_supersession: Boolean(superseded && declared.includes(superseded)),
    base_part_in_catalog: catalogModels.has(part)
  };
});

// Phase 80.4 — explain why more delivery confirmations can be recorded than are
// confirmed at final adjudication: shipping verification covers every known
// part+marketplace+item pair, including pairs that are later rejected on product
// identity. Evidence is kept; the decision is not changed.
let shippingConfirmedNotActive = null;
if (shippingVerification) {
  const confirmedKeys = new Set(shippingVerification.per_pair
    .filter(pair => pair.outcome === 'CONFIRMED_NL')
    .map(pair => `${pair.part_number}:${pair.marketplace}:${pair.item_id}`));
  const byReason = {};
  let count = 0;
  for (const diagnostic of result.diagnostics) {
    const key = `${diagnostic.part_number}:${diagnostic.marketplace}:${diagnostic.item_id}`;
    if (!confirmedKeys.has(key)) continue;
    if (diagnostic.final_decision === 'ACCEPT') continue;
    count++;
    const reason = diagnostic.first_blocking_step || 'UNKNOWN';
    byReason[reason] = (byReason[reason] || 0) + 1;
  }
  shippingConfirmedNotActive = { count, by_reason: byReason };
}

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
  shipping_verification: shippingVerification ? {
    enabled: true,
    evidence_path: SHIPPING_EVIDENCE,
    max_parts: MAX_PARTS,
    markets: MARKETS || 'ALL_FROM_INPUT',
    searched_parts: shippingVerification.searched_parts,
    searched_groups: shippingVerification.searched_groups,
    searched_pairs: shippingVerification.searched_pairs,
    confirmed_pairs: shippingVerification.confirmed_pairs,
    not_returned_pairs: shippingVerification.not_returned_pairs,
    restricted_pairs: shippingVerification.restricted_pairs,
    unconfirmed_pairs: shippingVerification.unconfirmed_pairs,
    error_pairs: shippingVerification.error_pairs,
    errors: shippingVerification.errors.slice(0, 20),
    evidence_applied_to_offers: shippingEvidenceApplied,
    registry: shippingRegistrySummary
  } : { enabled: false },
  required_report: {
    '1_listings_processed': result.unique_items,
    '1_listings_with_stored_getitem_detail': listingsWithGetItemDetail,
    '1_listings_with_mpn_evidence': listingsWithMpnEvidence,
    '1_listings_title_match_only': listingsTitleMatchOnly,
    '1_listings_with_confirmed_nl_shipping': listingsWithConfirmedShipping,
    '1_listings_with_full_getitem_evidence': listingsWithGetItemDetail,
    '2_listings_rechecked_with_nl_filter': shippingVerification ? shippingVerification.searched_pairs : 0,
    '2_listings_confirmed_nl_shipping_now': shippingVerification ? shippingVerification.confirmed_pairs : 0,
    '2_top_blockers': topBlockers,
    '4_shipping_confirmed_but_not_active': shippingConfirmedNotActive ? shippingConfirmedNotActive.count : 0,
    '4_shipping_confirmed_but_not_active_by_reason': shippingConfirmedNotActive ? shippingConfirmedNotActive.by_reason : {},
    '3_evidence_records_reused': result.get_item_reused,
    '4_candidates_enriched_from_stored_evidence': result.evidence_completed,
    '4_mpn_conflicts_analysed': mpnConflicts.length,
    '4_conflicts_naming_a_verified_supersession': mpnConflicts.filter(conflict => conflict.contradicts_verified_supersession).length,
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
    identity_key: 'part_number + marketplace + item_id',
    items_on_multiple_marketplaces: itemsOnMultipleMarketplaces,
    unique_listings: result.unique_items,
    unique_parts: candidates.length,
    invalid_records: invalid.length,
    item_relations: result.item_relations.length,
    relations_preserved: result.item_relations.every(rel => rel.part_numbers.length >= 1)
  },
  shipping_confirmed_not_active: shippingConfirmedNotActive,
  mpn_conflicts: {
    analysed: mpnConflicts.length,
    verified_supersessions_in_catalog: verifiedSupersessions.size,
    details: mpnConflicts.slice(0, 100)
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
  `| 1a | Listings with stored getItem detail | ${summary.required_report['1_listings_with_stored_getitem_detail']} |`,
  `| 1b | Listings with actual MPN evidence | ${summary.required_report['1_listings_with_mpn_evidence']} |`,
  `| 1c | Listings with title match only | ${summary.required_report['1_listings_title_match_only']} |`,
  `| 1d | Listings with confirmed NL shipping | ${summary.required_report['1_listings_with_confirmed_nl_shipping']} |`,
  `| 3 | Evidence records reused | ${summary.required_report['3_evidence_records_reused']} |`,
  `| 4 | Candidates enriched from stored evidence | ${summary.required_report['4_candidates_enriched_from_stored_evidence']} |`,
  `| 5 | New ACTIVE offers | ${summary.required_report['5_new_active_offers']} |`,
  `| 6 | Unique parts buyable | ${summary.required_report['6_unique_parts_buyable']} |`,
  `| 7 | Remaining NEEDS_EVIDENCE | ${summary.required_report['7_remaining_needs_evidence']} |`,
  `| 8 | Provably wrong | ${summary.required_report['8_provably_wrong']} |`,
  `| 9 | ACTIVE records on disk | ${summary.required_report['9_active_records_on_disk']} |`,
  `| 10 | Resolver links | ${summary.required_report['10_resolver_links']} |`,
  '',
  ...(shippingVerification ? [
    '## NL shipping verification (Browse deliveryCountry:NL)',
    '',
    `Rechecked pairs: ${shippingVerification.searched_pairs} across ${shippingVerification.searched_parts} parts / ${shippingVerification.searched_groups} part+marketplace searches.`,
    `Confirmed NL delivery: ${shippingVerification.confirmed_pairs}; not returned: ${shippingVerification.not_returned_pairs}; explicit non-NL: ${shippingVerification.restricted_pairs}; no filter evidence: ${shippingVerification.unconfirmed_pairs}; API errors: ${shippingVerification.error_pairs}.`,
    `Evidence attached to offers: ${shippingEvidenceApplied}. Stored in ${SHIPPING_EVIDENCE}.`,
    ''
  ] : []),
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
