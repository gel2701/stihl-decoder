#!/usr/bin/env node
/**
 * scripts/phase80_evidence_batch.mjs
 *
 * Phase 80 — Evidence-completing affiliate activation batch.
 *
 * Runs against existing candidates (Phase 76G REVIEW offers, saved checkpoints,
 * a GSC priority queue or a plain part list) and completes missing evidence
 * instead of discarding candidates:
 *
 *   search/:  filter=deliveryCountry:NL  -> NL shipping evidence
 *   getItem:  MPN / GTIN / aspects / model compatibility / shipping
 *
 * Only ACCEPT is written to the canonical offer store. Everything else is
 * reported as NEEDS_EVIDENCE or REJECTED with the concrete missing evidence.
 *
 * Modes:
 *   (default)   live when EBAY_* credentials are present, otherwise offline
 *   --offline   never calls eBay; re-adjudicates stored evidence only
 *   --live      require credentials (abort when missing)
 *
 * The process sets EBAY_ENABLED=true in-process only, exactly like the Phase 76
 * pilot: the deployed environment keeps EBAY_ENABLED=false for visitors.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

import { EbayBrowseApiClient } from '../src/affiliate/EbayBrowseApiClient.js';
import { EbayHighVolumeEngine } from '../src/affiliate/EbayHighVolumeEngine.js';
import { EbayEvidenceRegistry } from '../src/affiliate/EbayEvidenceRegistry.js';
import { saveEbayOfferStore, loadEbayOfferStore, defaultEbayOfferStorePath } from '../src/affiliate/EbayOfferStore.js';
import { MATCH_TYPES, OFFER_STATUSES } from '../src/affiliate/OfferEvidenceMatcher.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const readArg = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const OFFLINE = args.includes('--offline');
const REQUIRE_LIVE = args.includes('--live');
const LIMIT = readArg('--limit') !== null ? Number(readArg('--limit')) : 100;
const INPUT = readArg('--input');
const STORE = readArg('--store') || defaultEbayOfferStorePath;
const EVIDENCE = readArg('--evidence') || path.resolve(rootDir, 'data', 'affiliate', 'ebay_evidence_registry.json');
const GSC = readArg('--gsc');
const OUT_DIR = readArg('--out-dir') || path.resolve(rootDir, 'output', 'phase80');
const CAMPAIGN = process.env.EBAY_EPN_CAMPAIGN_ID || '';

if (!Number.isFinite(LIMIT) || LIMIT < 1) {
  console.error('ABORT: --limit must be a positive integer');
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
if (LIVE) process.env.EBAY_ENABLED = 'true';

/**
 * Loads catalog model relations (part -> models) from the seeded SQLite
 * database. Optional: without it, corroboration falls back to models supplied
 * by the input queue.
 */
function loadCatalogModels() {
  const models = new Map();
  const dbPath = path.join(rootDir, 'data', 'stihl_database.db');
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
        description: entry.display_name || entry.description || '',
        category: entry.category || '',
        models: Array.isArray(entry.models) ? entry.models : [],
        queue_rank: entry.queue_rank ?? null,
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

const accepted = [];
const needsEvidence = [];
const rejected = [];
const perPart = [];
const startedAt = Date.now();

for (const candidate of candidates) {
  const part = candidate.part_number;
  const models = candidate.models.length > 0 ? candidate.models : (catalogModels.get(part) || []);
  const knownParts = [{ part_number: part, description: candidate.description, category: candidate.category, models }];
  const classification = engine.classifyPart(part, knownParts);

  if (LIVE) {
    const res = await engine.processBatch([part], {
      maxItems: 1,
      knownParts,
      evidenceRegistry,
      enrich: true
    });
    accepted.push(...res.active_offers.map(offer => ({ ...offer, catalog_models: models })));
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
    continue;
  }

  // Offline: re-adjudicate stored candidates only. A previously stored getItem
  // evidence record may already close the gap; nothing is fetched.
  let active = 0;
  let needs = 0;
  let rejectedCount = 0;
  let completed = 0;
  for (const existing of candidate.existing) {
    const detail = evidenceRegistry.get(existing.item_id);
    const item = detail ? { ...existing, item_detail: detail } : existing;
    const verdict = engine.evaluateOffer(item, part, classification);
    if (verdict.decision === 'ACCEPT') {
      active++;
      if (detail) completed++;
      accepted.push({ part_number: part, marketplace: item.marketplace || 'EBAY_DE', ...verdict.offer });
    } else if (verdict.decision === 'REVIEW') {
      needs++;
      needsEvidence.push({ part_number: part, ...verdict.offer, reason_codes: verdict.reason_codes, enrichment: { attempted: false } });
    } else {
      rejectedCount++;
      rejected.push({
        part_number: part,
        item_id: existing.item_id ?? existing.itemId,
        primary_reason: verdict.first_blocking_step,
        reason_codes: verdict.reason_codes,
        status: OFFER_STATUSES.REJECTED
      });
    }
  }
  perPart.push({
    part_number: part,
    gsc_priority: gscPriority.has(part),
    active,
    needs_evidence: needs,
    rejected: rejectedCount,
    evidence_enriched: completed,
    evidence_reused: candidate.existing.filter(existing => Boolean(evidenceRegistry.get(existing.item_id))).length
  });
}

const storeResult = saveEbayOfferStore(STORE, accepted, { campaignId: CAMPAIGN });
const storeDoc = loadEbayOfferStore(STORE);
evidenceRegistry.save(EVIDENCE);

const uniqueActiveParts = new Set(accepted.map(offer => offer.part_number));
const gscCovered = [...uniqueActiveParts].filter(part => gscPriority.has(part));
const reusedEvidence = perPart.reduce((sum, entry) => sum + (entry.evidence_reused || 0), 0);
const completedEvidence = perPart.reduce((sum, entry) => sum + (entry.evidence_enriched || 0), 0);

const report = {
  schema_version: '1.0.0',
  phase: '80',
  generated_at: new Date().toISOString(),
  live_api: LIVE,
  campaign_id_configured: /^\d+$/.test(CAMPAIGN),
  activation_blocker: LIVE ? null : (hasCredentials ? 'OFFLINE_REQUESTED' : 'EBAY_CREDENTIALS_MISSING'),
  input: INPUT ? path.relative(rootDir, INPUT) : null,
  limit: LIMIT,
  scanned_parts: candidates.length,
  metrics: {
    new_active_affiliate_links: accepted.length,
    new_unique_parts_with_direct_offer: uniqueActiveParts.size,
    gsc_priority_parts_covered: gscCovered.length,
    candidates_evidence_completed: completedEvidence,
    reused_evidence_records: reusedEvidence,
    remaining_needs_evidence: needsEvidence.length,
    rejected_candidates: rejected.length,
    active_preserved_in_store: storeResult.preserved
  },
  store: {
    path: path.relative(rootDir, STORE),
    written: storeResult.written,
    rejected_by_store_guard: storeResult.rejected,
    preserved: storeResult.preserved,
    total_offers: storeDoc.offers.length
  },
  evidence_registry: evidenceRegistry.summary(),
  duration_ms: Date.now() - startedAt,
  per_part: perPart.slice(0, 200),
  accepted_offers: accepted.slice(0, 200),
  needs_evidence_offers: needsEvidence.slice(0, 200),
  rejected_offers: rejected.slice(0, 200)
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.join(OUT_DIR, `phase80_batch_${LIVE ? 'live' : 'offline'}_${stamp}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  live_api: report.live_api,
  activation_blocker: report.activation_blocker,
  scanned_parts: report.scanned_parts,
  metrics: report.metrics,
  store: report.store,
  report: path.relative(rootDir, reportPath)
}, null, 2));

if (!LIVE && !hasCredentials) {
  console.log('\nNOTE: no eBay production credentials in this environment. No live activation was performed; only stored evidence was re-adjudicated.');
}

process.exit(0);
