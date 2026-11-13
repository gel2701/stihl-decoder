#!/usr/bin/env node
/**
 * scripts/phase80_evidence_batch.mjs
 *
 * Phase 80.1 — Evidence-completing activation batch.
 *
 * Two distinct input shapes, two distinct strategies:
 *
 *  A. Input with EXISTING review offers (Phase 76G state/results):
 *     reuse the stored item ids and shipping data, call getItem only for the
 *     candidates that lack product/shipping evidence, one call per unique
 *     listing (shared across all part relations). A Browse search happens only
 *     when the stored listing no longer exists (getItem 404/no item).
 *
 *  B. Input with part numbers only (GSC priority queue / part list):
 *     search Browse for those parts (deliveryCountry:NL) and enrich as needed.
 *
 * Only `decision: ACCEPT` is written to the canonical store. Everything else is
 * reported as NEEDS_EVIDENCE or REJECTED with the concrete missing evidence.
 *
 * Storage (see AffiliateStoragePaths):
 *   Render:  /var/data/affiliate/ebay_offers.json
 *            /var/data/affiliate/ebay_evidence_registry.json
 *            /var/data/phase80/
 *   Local:   data/affiliate/... and output/phase80/
 *
 * Modes:
 *   (default)   live when EBAY_* credentials are present, otherwise offline
 *   --offline   never calls eBay; re-adjudicates stored evidence only
 *   --live      require credentials (abort when missing)
 *
 * The process sets EBAY_ENABLED=true in-process only; the deployed environment
 * keeps EBAY_ENABLED=false for public visitors.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import { ReviewEvidenceBatch } from '../src/affiliate/ReviewEvidenceBatch.js';
import { saveEbayOfferStore, loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import {
  getEbayOfferStorePath,
  getEbayEvidenceRegistryPath,
  getPhase80OutputDir,
  resolveStorageRoot
} from '../src/affiliate/AffiliateStoragePaths.js';
import { AffiliateOfferResolver } from '../src/affiliate/AffiliateOfferResolver.js';
import { VerifiedOfferRegistry } from '../src/affiliate/VerifiedOfferRegistry.js';
import { OFFER_STATUSES } from '../src/affiliate/OfferEvidenceMatcher.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const args = process.argv.slice(2);
const readArg = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const OFFLINE = args.includes('--offline');
const REQUIRE_LIVE = args.includes('--live');
const LIMIT = readArg('--limit') !== null ? Number(readArg('--limit')) : 184;
const MAX_GET_ITEMS = readArg('--max-get-items') !== null ? Number(readArg('--max-get-items')) : 250;
const INPUT = readArg('--input');
const STORE = readArg('--store') || getEbayOfferStorePath();
const EVIDENCE = readArg('--evidence') || getEbayEvidenceRegistryPath();
const GSC = readArg('--gsc');
const OUT_DIR = readArg('--out-dir') || getPhase80OutputDir();
const CAMPAIGN = process.env.EBAY_EPN_CAMPAIGN_ID || '';
const storage = resolveStorageRoot();

if (!Number.isFinite(LIMIT) || LIMIT < 1) {
  console.error('ABORT: --limit must be a positive integer');
  process.exit(1);
}
if (!Number.isFinite(MAX_GET_ITEMS) || MAX_GET_ITEMS < 1) {
  console.error('ABORT: --max-get-items must be a positive integer');
  process.exit(1);
}

const hasCredentials = Boolean(
  process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET &&
  /^\d+$/.test(CAMPAIGN)
);
if (REQUIRE_LIVE && !hasCredentials) {
  console.error('ABORT: --live requires EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_EPN_CAMPAIGN_ID');
  process.exit(1);
}
const LIVE = !OFFLINE && hasCredentials;
// In-process only: live runs need the API, offline runs only need the resolver to
// be able to read the store so the chain (store -> resolver -> link) is verified.
if (LIVE || /^\d+$/.test(CAMPAIGN)) process.env.EBAY_ENABLED = 'true';

/**
 * Catalog model relations (part -> models) from the seeded SQLite database.
 * Optional: without it, corroboration falls back to models from the input queue.
 */
function loadCatalogModels() {
  const models = new Map();
  const dbPath = path.resolve(process.cwd(), 'data', 'stihl_database.db');
  if (!fs.existsSync(dbPath)) return models;
  try {
    const require = createRequire(import.meta.url);
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT part_number, canonical_model_id FROM model_part_fitments').all();
    for (const row of rows) {
      if (!models.has(row.part_number)) models.set(row.part_number, new Set());
      models.get(row.part_number).add(row.canonical_model_id);
    }
    db.close();
  } catch {
    return models;
  }
  const plain = new Map();
  for (const [part, set] of models) plain.set(part, [...set]);
  return plain;
}

function loadCandidates(inputPath) {
  if (!inputPath) return [];
  const doc = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const raw = Array.isArray(doc)
    ? doc
    : (Array.isArray(doc.review_offers) ? doc.review_offers
      : (Array.isArray(doc.queue) ? doc.queue
        : (Array.isArray(doc.parts) ? doc.parts : [])));
  const byPart = new Map();
  for (const entry of raw) {
    const part = PartNormalizer.normalizePartNumber(entry.part_number ?? entry);
    if (!part) continue;
    if (!byPart.has(part)) {
      byPart.set(part, {
        part_number: part,
        description: entry.display_name || entry.description || entry.title || '',
        category: entry.category || '',
        models: Array.isArray(entry.models) ? entry.models : [],
        existing: []
      });
    }
    if (entry.item_id || entry.itemId) byPart.get(part).existing.push(entry);
  }
  return [...byPart.values()].slice(0, LIMIT);
}

function loadGscPriorityParts() {
  if (!GSC) return new Set();
  try {
    const doc = JSON.parse(fs.readFileSync(GSC, 'utf8'));
    const items = Array.isArray(doc) ? doc : (doc.items || doc.parts || []);
    const set = new Set();
    for (const item of items) {
      const part = PartNormalizer.normalizePartNumber(item.part_number ?? item);
      if (part) set.add(part);
    }
    return set;
  } catch {
    return new Set();
  }
}

const catalogModels = loadCatalogModels();
const candidates = loadCandidates(INPUT);
const gscPriority = loadGscPriorityParts();
const evidenceRegistry = new EbayEvidenceRegistry({ path: EVIDENCE });
const apiClient = new EbayBrowseApiClient({});
const engine = new EbayHighVolumeEngine({
  apiClient,
  marketplaces: ['EBAY_NL', 'EBAY_DE'],
  vendors: ['saegenspezi_de', 'ALL'],
  batchDelayMs: LIVE ? 150 : 0,
  backoffBaseMs: LIVE ? 2000 : 0,
  enrich: LIVE,
  evidenceRegistry
});

for (const candidate of candidates) {
  if (candidate.models.length === 0) candidate.models = catalogModels.get(candidate.part_number) || [];
}

const existingCandidates = candidates.filter(candidate => candidate.existing.length > 0);
const partOnlyCandidates = candidates.filter(candidate => candidate.existing.length === 0);

const startedAt = Date.now();
const accepted = [];
const needsEvidence = [];
const rejected = [];
const perPart = [];
let batchStats = {
  processed_candidates: 0,
  unique_items: 0,
  invalid_candidates: 0,
  get_item_requests: 0,
  get_item_network_calls: 0,
  get_item_reused: 0,
  deferred_get_items: 0,
  evidence_completed: 0,
  item_unavailable: 0,
  search_fallbacks: 0,
  item_relations: []
};

// A. Existing review offers: no new Browse search, getItem only.
if (existingCandidates.length > 0) {
  const batch = new ReviewEvidenceBatch({
    engine,
    evidenceRegistry,
    batchDelayMs: LIVE ? 120 : 0
  });
  const result = await batch.run(existingCandidates, {
    live: LIVE,
    allowSearchFallback: LIVE,
    maxGetItems: MAX_GET_ITEMS
  });
  accepted.push(...result.accepted);
  needsEvidence.push(...result.needs_evidence);
  rejected.push(...result.rejected);
  perPart.push(...result.per_part);
  const { accepted: _a, needs_evidence: _n, rejected: _r, per_part: _p, item_relations, ...counters } = result;
  batchStats = { ...batchStats, ...counters, item_relations };
}

// B. Parts without stored offers: Browse search (bounded by --limit).
if (LIVE && partOnlyCandidates.length > 0) {
  for (const candidate of partOnlyCandidates) {
    const part = candidate.part_number;
    const res = await engine.processBatch([part], {
      maxItems: 1,
      knownParts: [{
        part_number: part,
        description: candidate.description,
        category: candidate.category,
        models: candidate.models
      }],
      evidenceRegistry,
      enrich: true
    });
    accepted.push(...res.active_offers);
    needsEvidence.push(...res.review_offers);
    rejected.push(...res.rejected_offers);
    perPart.push({
      part_number: part,
      gsc_priority: gscPriority.has(part),
      active: res.active_offers.length,
      needs_evidence: res.review_offers.length,
      rejected: res.rejected_offers.length,
      evidence_enriched: res.summary.evidence_enriched,
      evidence_reused: res.summary.evidence_reused
    });
  }
}

const storeResult = saveEbayOfferStore(STORE, accepted, { campaignId: CAMPAIGN });
const storeDoc = loadEbayOfferStore(STORE);
evidenceRegistry.save(EVIDENCE);

const uniqueActiveParts = new Set(accepted.map(offer => offer.part_number));

// Chain verification: a fresh resolver must read the persisted ACTIVE offers and
// resolve them into product-card offer descriptors.
let resolverResolvedOffers = 0;
let resolverStatus = 'SKIPPED_NO_ACCEPTED_OFFERS';
if (uniqueActiveParts.size > 0) {
  const resolver = new AffiliateOfferResolver({
    ebayStorePath: STORE,
    verifiedRegistry: new VerifiedOfferRegistry({ productionActivationAllowed: false })
  });
  resolverStatus = resolver.providers.has('ebay') ? 'VERIFIED' : 'PROVIDER_DISABLED';
  for (const part of uniqueActiveParts) {
    const offers = resolver.resolveOffers({ partNumber: part, partName: '' });
    resolverResolvedOffers += offers.filter(offer => offer.provider === 'ebay').length;
  }
}

const report = {
  schema_version: '1.1.0',
  phase: '80.1',
  generated_at: new Date().toISOString(),
  live_api: LIVE,
  campaign_id_configured: /^\d+$/.test(CAMPAIGN),
  activation_blocker: LIVE ? null : (!hasCredentials ? 'EBAY_CREDENTIALS_MISSING' : 'OFFLINE_REQUESTED'),
  input: INPUT ? path.relative(process.cwd(), INPUT) : null,
  limit: LIMIT,
  storage: {
    persistent: storage.persistent,
    root: path.relative(process.cwd(), storage.root) || storage.root,
    source: storage.source,
    offer_store: STORE,
    evidence_registry: EVIDENCE,
    output_dir: OUT_DIR
  },
  exchange: {
    input_selection: existingCandidates.length > 0 ? 'EXISTING_REVIEW_OFFERS' : 'PART_LIST',
    parts_in_batch: candidates.length,
    parts_with_existing_offers: existingCandidates.length,
    parts_without_existing_offers: partOnlyCandidates.length
  },
  metrics: {
    review_candidates_processed: batchStats.processed_candidates,
    unique_listings: batchStats.unique_items,
    get_item_requests: batchStats.get_item_requests,
    get_item_network_calls: batchStats.get_item_network_calls,
    evidence_reused: batchStats.get_item_reused,
    candidates_evidence_completed: batchStats.evidence_completed,
    new_active: accepted.length,
    new_unique_parts_with_direct_offer: uniqueActiveParts.size,
    gsc_priority_parts_covered: [...uniqueActiveParts].filter(part => gscPriority.has(part)).length,
    remaining_needs_evidence: needsEvidence.length,
    rejected_candidates: rejected.length,
    item_unavailable: batchStats.item_unavailable,
    search_fallbacks_for_unavailable_listings: batchStats.search_fallbacks,
    deferred_get_items: batchStats.deferred_get_items,
    offers_on_persistent_disk: storeDoc.offers.length,
    resolver_resolved_offers: resolverResolvedOffers,
    active_preserved_in_store: storeResult.preserved
  },
  chain: {
    resolver_status: resolverStatus,
    store_written: storeResult.written,
    store_rejected_by_guard: storeResult.rejected
  },
  evidence_registry: evidenceRegistry.summary(),
  item_relations: batchStats.item_relations.slice(0, 300),
  per_part: perPart.slice(0, 300),
  accepted_offers: accepted.slice(0, 300),
  needs_evidence_offers: needsEvidence.slice(0, 300),
  rejected_offers: rejected.slice(0, 300),
  duration_ms: Date.now() - startedAt
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.join(OUT_DIR, `phase80_batch_${LIVE ? 'live' : 'offline'}_${stamp}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  live_api: report.live_api,
  activation_blocker: report.activation_blocker,
  storage: report.storage,
  exchange: report.exchange,
  metrics: report.metrics,
  chain: report.chain,
  report: path.relative(process.cwd(), reportPath)
}, null, 2));

if (!LIVE && !hasCredentials) {
  console.log('\nNOTE: no eBay production credentials in this environment. No live activation was performed; only stored evidence was re-adjudicated.');
}

process.exit(0);
