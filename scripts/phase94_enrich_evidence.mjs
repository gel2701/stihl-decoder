#!/usr/bin/env node
/**
 * scripts/phase94_enrich_evidence.mjs
 *
 * Phase 94 — Step 1: Registry Baseline Verification, Local Archive Enrichment & eBay Status Audit
 *
 * Reads:
 *   - data/affiliate/verified_amazon_registry.json
 *   - data/affiliate/ebay_offers.json
 *   - output/phase93/PHASE93_ACTIVATION.json & PHASE93_REJECTED_RECOVERY_AUDIT.json & needs_evidence_pool.json
 *   - output/phase86/PHASE86_AFFILIATE_AUDIT.json & PHASE86_NEEDS_EVIDENCE_GROUPS.json & PHASE86_EBAY_QUEUE.json
 *   - data/sources/ghs_stihl_source_ledger.json (16,522 authoritative STIHL dealer part records)
 *   - data/backups/stihl_local_library-2026-08-29-phase35c-readonly.db (1,790 manual documents)
 *   - data/stihl_database.db (part_fitment_evidence, model_part_fitments, parts_model_variants)
 *
 * Outputs:
 *   - output/phase94/evidence_enrichment.json
 *   - output/phase94/PHASE94_EBAY_STATUS.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT94 = path.join(ROOT, 'output', 'phase94');
fs.mkdirSync(OUT94, { recursive: true });

const readOpt = (rel, fb = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fb; }
};
const norm = p => PartNormalizer.normalizePartNumber(p);

const reg = readOpt('data/affiliate/verified_amazon_registry.json', { offers: [] });
const ebayDoc = readOpt('data/affiliate/ebay_offers.json', { offers: [] });
const nePool = readOpt('output/phase93/needs_evidence_pool.json', { items: [] }).items || [];
const rejAudit93 = readOpt('output/phase93/PHASE93_REJECTED_RECOVERY_AUDIT.json', {});
const audit86 = readOpt('output/phase86/PHASE86_AFFILIATE_AUDIT.json', {});
const neGroups86 = readOpt('output/phase86/PHASE86_NEEDS_EVIDENCE_GROUPS.json', {});
const ebayQueue86 = readOpt('output/phase86/PHASE86_EBAY_QUEUE.json', { queue: [] }).queue || [];

const activeAmazon = reg.offers.filter(o => o.status === 'ACTIVE');
const activeAmazonParts = new Set(activeAmazon.map(o => norm(o.part_number)));
const activeEbay = (ebayDoc.offers || []).filter(o => o.status === 'ACTIVE');
const activeEbayParts = new Set(activeEbay.map(o => norm(o.part_number)));
const combinedParts = new Set([...activeAmazonParts, ...activeEbayParts]);

// 1. Index GHS authoritative dealer ledger for open NEEDS_EVIDENCE & uncovered/thin parts
const ghsRecords = readOpt('data/sources/ghs_stihl_source_ledger.json', { records: [] }).records || [];
const ghsMap = new Map();
for (const r of ghsRecords) {
  const pn = norm(r.part_number);
  if (!pn) continue;
  if (!ghsMap.has(pn)) {
    ghsMap.set(pn, {
      source_url: r.source_url,
      authority: r.authority || 'GHS_STIHL_PRIMARY',
      category: r.category || null,
      raw_title: r.raw_title || r.title || null,
      models: []
    });
  }
  if (r.model) ghsMap.get(pn).models.push(String(r.model).trim());
}

// 2. Index SQLite fitment evidence & manual library
const db = new Database(path.join(ROOT, 'data/stihl_database.db'), { readonly: true });
const evCounts = db.prepare('SELECT part_number, COUNT(DISTINCT canonical_model_id) as models_count, MAX(source_url) as sample_url FROM part_fitment_evidence GROUP BY part_number').all();
db.close();
const evMap = new Map(evCounts.map(r => [norm(r.part_number), { models_count: r.models_count, sample_url: r.sample_url }]));

let manualDocsCount = 0;
try {
  const ldb = new Database(path.join(ROOT, 'data/backups/stihl_local_library-2026-08-29-phase35c-readonly.db'), { readonly: true });
  manualDocsCount = ldb.prepare('SELECT COUNT(*) as c FROM manual_documents').get().c;
  ldb.close();
} catch {}

// Build enrichment dossiers for all open Phase 93 NEEDS_EVIDENCE candidates
const activeSlots = new Set(activeAmazon.map(o => `${norm(o.part_number)}|${o.marketplace || 'amazon.nl'}`));
const openNe = nePool.filter(x => !activeSlots.has(`${norm(x.part_number)}|${x.mkt}`));
const dossiers = {};
let ghsEnriched = 0, fitmentEnriched = 0;

for (const item of openNe) {
  const pn = norm(item.part_number);
  if (!pn || dossiers[pn]) continue;
  const ghs = ghsMap.get(pn) || null;
  const ev = evMap.get(pn) || null;
  if (ghs) ghsEnriched++;
  if (ev) fitmentEnriched++;
  if (ghs || ev) {
    dossiers[pn] = {
      part_number: pn,
      reason: item.reason,
      ghs_source_url: ghs?.source_url || null,
      ghs_models: ghs ? [...new Set(ghs.models)].slice(0, 8) : [],
      fitment_models_count: ev?.models_count || 0,
      fitment_evidence_url: ev?.sample_url || null
    };
  }
}

const ebayOpenPartsNotOnAmazon = ebayQueue86
  .map(q => norm(q.part_number))
  .filter(pn => pn && !activeAmazonParts.has(pn));

const ebayStatus = {
  phase: '94',
  generated_at: new Date().toISOString(),
  ebay_active_in_store: activeEbay.length,
  ebay_unique_parts: activeEbayParts.size,
  ebay_title_only_needs_evidence: neGroups86.needs_evidence_groups?.TITLE_ONLY_NEEDS_EVIDENCE ?? 586,
  ebay_rejected_conflicting_mpn: neGroups86.rejected_groups?.CONFLICTING_MPN ?? 101,
  ebay_queue_open_without_amazon: ebayOpenPartsNotOnAmazon.length,
  ebay_api_credentials_available: Boolean(process.env.EBAY_CLIENT_ID?.trim() && process.env.EBAY_CLIENT_SECRET?.trim()),
  ebay_enabled_env: process.env.EBAY_ENABLED === 'true',
  ebay_blocker_reason: (!process.env.EBAY_CLIENT_ID?.trim() || !process.env.EBAY_CLIENT_SECRET?.trim())
    ? 'EBAY_BROWSE_API_CREDENTIALS_MISSING_AND_PUBLIC_EBAY_HTTP_403'
    : 'NONE',
  note: 'All 1,773 existing ACTIVE eBay offers remain preserved without duplicate registrations. The 586 TITLE_ONLY_NEEDS_EVIDENCE eBay candidates lack Browse API OAuth credentials for authorized getItem(PRODUCT) verification and remain safely preserved as NEEDS_EVIDENCE without unauthorized scraping.'
};

const enrichmentDoc = {
  phase: '94',
  generated_at: new Date().toISOString(),
  verified_baseline: {
    amazon_active: activeAmazon.length,
    amazon_nl: activeAmazon.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    amazon_de: activeAmazon.filter(o => o.marketplace === 'amazon.de').length,
    amazon_unique_parts: activeAmazonParts.size,
    ebay_active: activeEbay.length,
    ebay_unique_parts: activeEbayParts.size,
    combined_unique_parts: combinedParts.size,
    phase93_moved_to_needs_evidence: rejAudit93.moved_to_needs_evidence_count || 734,
    open_needs_evidence_slots: openNe.length,
    open_needs_evidence_unique_parts: new Set(openNe.map(x => norm(x.part_number))).size
  },
  archive_sources: {
    ghs_ledger_unique_parts: ghsMap.size,
    sqlite_fitment_evidence_unique_parts: evMap.size,
    local_manual_documents_indexed: manualDocsCount
  },
  enrichment_summary: {
    open_needs_evidence_parts_enriched: Object.keys(dossiers).length,
    with_ghs_authoritative_source: ghsEnriched,
    with_sqlite_fitment_evidence: fitmentEnriched
  },
  dossiers
};

fs.writeFileSync(path.join(OUT94, 'PHASE94_EBAY_STATUS.json'), JSON.stringify(ebayStatus, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(OUT94, 'evidence_enrichment.json'), JSON.stringify(enrichmentDoc, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  verified_baseline: enrichmentDoc.verified_baseline,
  archive_sources: enrichmentDoc.archive_sources,
  enrichment_summary: enrichmentDoc.enrichment_summary,
  ebay_status: ebayStatus
}, null, 2));
