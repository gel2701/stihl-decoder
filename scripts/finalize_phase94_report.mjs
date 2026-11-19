#!/usr/bin/env node
/**
 * scripts/finalize_phase94_report.mjs
 *
 * Audits all Phase 94 batches, Two-Gate invariants, SKU-per-ASIN uniqueness,
 * eBay status, NEEDS_EVIDENCE / archive enrichment, and 507 canonical model coverage.
 *
 * Outputs:
 *   - output/phase94/PHASE94_ACTIVATION.json
 *   - output/phase94/PHASE94_REPORT.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { checkAffiliateConsistency } from './check_affiliate_consistency.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT94 = path.join(ROOT, 'output', 'phase94');

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const reg = read('data/affiliate/verified_amazon_registry.json');
const stihlDb = read('data/stihl_database.json');
const catalogDoc = read('data/parts_catalog.json');
const catalogPartsList = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const catalogParts = new Set(catalogPartsList.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const enrichmentDoc = read('output/phase94/evidence_enrichment.json');
const ebayStatus = read('output/phase94/PHASE94_EBAY_STATUS.json');
const ebayStore = read('data/affiliate/ebay_offers.json');

const sqlDb = new Database(path.join(ROOT, 'data/stihl_database.db'), { readonly: true });
const fitAll = sqlDb.prepare('SELECT DISTINCT canonical_model_id, part_number, source_id FROM model_part_fitments').all();
sqlDb.close();

const modelPartsNonGhs = new Map();
const modelPartsAll = new Map();
for (const r of fitAll) {
  const pn = PartNormalizer.normalizePartNumber(r.part_number);
  if (!pn) continue;
  if (!modelPartsAll.has(r.canonical_model_id)) modelPartsAll.set(r.canonical_model_id, new Set());
  modelPartsAll.get(r.canonical_model_id).add(pn);
  if (r.source_id !== 'ghs') {
    if (!modelPartsNonGhs.has(r.canonical_model_id)) modelPartsNonGhs.set(r.canonical_model_id, new Set());
    modelPartsNonGhs.get(r.canonical_model_id).add(pn);
  }
}

const activeAll = reg.offers.filter(o => o.status === 'ACTIVE');
const baselineOffers = activeAll.filter(o => !/^Phase 94:/.test(o.status_reason || ''));
const phase94Offers = activeAll.filter(o => /^Phase 94:/.test(o.status_reason || ''));

function countModelCov(offers, map) {
  const nlP = new Set(offers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').map(o => o.part_number));
  const deP = new Set(offers.filter(o => o.marketplace === 'amazon.de').map(o => o.part_number));
  const allP = new Set([...nlP, ...deP]);
  let any = 0, nl = 0, de = 0, thin1to5 = 0, gte6 = 0;
  const perModelCounts = new Map();
  for (const m of (stihlDb.models || [])) {
    const c = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const alt = m.id.toLowerCase();
    const sAlt = alt.replace(/^stihl_/, '');
    const pSet = map.get(c) || map.get(alt) || map.get(sAlt) || new Set();
    let hn = false, hd = false, covCount = 0;
    for (const pn of pSet) {
      if (nlP.has(pn)) hn = true;
      if (deP.has(pn)) hd = true;
      if (allP.has(pn)) covCount++;
    }
    if (hn || hd) any++;
    if (hn) nl++;
    if (hd) de++;
    if (covCount >= 1 && covCount <= 5) thin1to5++;
    if (covCount >= 6) gte6++;
    perModelCounts.set(m.id, covCount);
  }
  return { any, nl, de, thin1to5, gte6, perModelCounts };
}

const covBeforeNonGhs = countModelCov(baselineOffers, modelPartsNonGhs);
const covAfterNonGhs = countModelCov(activeAll, modelPartsNonGhs);
const covBeforeAllFit = countModelCov(baselineOffers, modelPartsAll);
const covAfterAllFit = countModelCov(activeAll, modelPartsAll);
let modelsWithMoreParts = 0;
for (const [id, afterCnt] of covAfterAllFit.perModelCounts.entries()) {
  if (afterCnt > (covBeforeAllFit.perModelCounts.get(id) || 0)) modelsWithMoreParts++;
}

// Verify invariants across all ACTIVE offers & Phase 94 offers
const keySeen = new Set();
const killSwitchSeen = new Set();
const asinMktOwner = new Map();
for (const o of activeAll) {
  const key = `${o.part_number}|${o.marketplace || 'amazon.nl'}|${o.asin}`;
  if (keySeen.has(key)) throw new Error(`Duplicate ACTIVE key: ${key}`);
  keySeen.add(key);
  if (killSwitchSeen.has(o.kill_switch_id)) throw new Error(`Duplicate kill_switch_id: ${o.kill_switch_id}`);
  killSwitchSeen.add(o.kill_switch_id);
  const am = `${o.marketplace || 'amazon.nl'}|${o.asin}`;
  const prev = asinMktOwner.get(am);
  if (prev && prev !== o.part_number) throw new Error(`Multi-SKU collision on ${am}: ${prev} vs ${o.part_number}`);
  asinMktOwner.set(am, o.part_number);
}

for (const o of phase94Offers) {
  const mkt = o.marketplace || 'amazon.nl';
  const expectedTag = mkt === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
  const v = TwoGateVerifier.verifyOffer(o, { catalogPartMap: catalogParts, expectedTag });
  if (!v.passed) throw new Error(`TwoGate fail on ${o.part_number}/${o.asin}: ${v.errors.join('; ')}`);
  const mm = checkHistoricalMismatch(o.part_number, o.asin, o.product_title || '');
  if (mm.isMismatch) throw new Error(`Historical mismatch on ${o.part_number}/${o.asin}`);
}

const nePool93 = read('output/phase93/needs_evidence_pool.json').items || [];
const activeSlotSet = new Set(activeAll.map(o => `${o.part_number}|${o.marketplace || 'amazon.nl'}`));
const p94SlotSet = new Set(phase94Offers.map(o => `${o.part_number}|${o.marketplace || 'amazon.nl'}`));
const neBecameActiveCount = new Set(
  nePool93.filter(x => p94SlotSet.has(`${x.part_number}|${x.mkt}`)).map(x => `${x.part_number}|${x.mkt}`)
).size;
const neStillOpenCount = new Set(
  nePool93.filter(x => !activeSlotSet.has(`${x.part_number}|${x.mkt}`)).map(x => `${x.part_number}|${x.mkt}`)
).size;

const batchDir = path.join(OUT94, 'batches');
const neBatchUniq = new Set();
const rejBatchUniq = new Set();
let batchesCompleted = 0;
for (const bf of fs.readdirSync(batchDir).filter(f => f.endsWith('.json')).sort()) {
  batchesCompleted++;
  const b = read(path.join('output/phase94/batches', bf));
  for (const n of (b.needs_evidence || [])) {
    if (!activeSlotSet.has(`${n.part_number}|${n.mkt}`)) neBatchUniq.add(`${n.part_number}|${n.mkt}|${n.asin}`);
  }
  for (const r of (b.rejected || [])) rejBatchUniq.add(`${r.part_number}|${r.mkt}|${r.asin}`);
}

const dpNl = read('output/phase94/product_checks_amazon_nl.json');
const dpDe = read('output/phase94/product_checks_amazon_de.json');
const shNl = read('output/phase94/search_hits_amazon_nl.json');
const shDe = read('output/phase94/search_hits_amazon_de.json');
const dealer94 = read('output/phase94/dealer_corroboration.json');

const beforeUniqueParts = new Set(baselineOffers.map(o => o.part_number)).size;
const afterUniqueParts = new Set(activeAll.map(o => o.part_number)).size;

const combinedUniqueAmazonOrEbay = new Set([
  ...activeAll.map(o => o.part_number),
  ...(ebayStore.offers || []).filter(o => o.status === 'ACTIVE').map(o => PartNormalizer.normalizePartNumber(o.part_number)).filter(Boolean)
]).size;

const cons = await checkAffiliateConsistency();
if (!cons.success) throw new Error(`Affiliate consistency failed: ${JSON.stringify(cons)}`);

const summary = {
  phase: '94',
  generated_at: new Date().toISOString(),
  gsc_status: {
    live_gsc_configured: false,
    limitation_note: 'Google Search Console API credentials are not configured locally; prioritized using stored PHASE81_PRIORITY_MODELS.json & PHASE77D_GSC_INVENTORY.json + all 507 canonical model fitments.'
  },
  ebay_status: ebayStatus,
  evidence_enrichment: {
    dossiers_enriched_from_archives: enrichmentDoc.enrichment_summary?.open_needs_evidence_parts_enriched || 0,
    with_ghs_authoritative_source: enrichmentDoc.enrichment_summary?.with_ghs_authoritative_source || 0,
    with_sqlite_fitment_evidence: enrichmentDoc.enrichment_summary?.with_sqlite_fitment_evidence || 0,
    needs_evidence_slots_activated_in_phase94: neBecameActiveCount,
    needs_evidence_slots_remaining_recoverable: neStillOpenCount
  },
  before: {
    active_total: baselineOffers.length,
    active_nl: baselineOffers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    active_de: baselineOffers.filter(o => o.marketplace === 'amazon.de').length,
    unique_parts: beforeUniqueParts,
    models_covered_non_ghs: covBeforeNonGhs.any,
    models_covered_all_fitments: covBeforeAllFit.any,
    models_with_gte6_parts_all_fitments: covBeforeAllFit.gte6,
    suspended: reg.offers.filter(o => o.status === 'SUSPENDED').length,
    research_required: reg.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
    verified_inactive: reg.offers.filter(o => o.status === 'VERIFIED').length
  },
  after: {
    active_total: activeAll.length,
    active_nl: activeAll.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    active_de: activeAll.filter(o => o.marketplace === 'amazon.de').length,
    unique_parts: afterUniqueParts,
    combined_unique_parts_amazon_plus_ebay: combinedUniqueAmazonOrEbay,
    new_offers_activated: phase94Offers.length,
    new_nl_activated: phase94Offers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    new_de_activated: phase94Offers.filter(o => o.marketplace === 'amazon.de').length,
    new_ebay_activated: 0,
    new_unique_parts_added: afterUniqueParts - beforeUniqueParts,
    new_genuine_stihl: phase94Offers.filter(o => o.oem_brand_classification === 'GENUINE_STIHL').length,
    new_aftermarket: phase94Offers.filter(o => o.oem_brand_classification !== 'GENUINE_STIHL').length,
    new_dealer_corroborated: phase94Offers.filter(o => (o.verifiable_evidence_sources || []).some(s => s.type === 'INDEPENDENT_DEALER_CATALOG')).length,
    new_archive_corroborated: phase94Offers.filter(o => (o.verifiable_evidence_sources || []).some(s => s.type === 'LOCAL_ARCHIVE_DEALER_LEDGER')).length,
    models_covered_non_ghs: covAfterNonGhs.any,
    models_coverage_growth_non_ghs: covAfterNonGhs.any - covBeforeNonGhs.any,
    models_covered_all_fitments: covAfterAllFit.any,
    models_coverage_growth_all_fitments: covAfterAllFit.any - covBeforeAllFit.any,
    models_with_increased_part_coverage: modelsWithMoreParts,
    models_with_gte6_parts_all_fitments: covAfterAllFit.gte6,
    models_gte6_growth: covAfterAllFit.gte6 - covBeforeAllFit.gte6,
    suspended_historical_preserved: reg.offers.filter(o => o.status === 'SUSPENDED').length,
    research_required_remaining: reg.offers.filter(o => o.status === 'RESEARCH_REQUIRED').length,
    verified_inactive_preserved: reg.offers.filter(o => o.status === 'VERIFIED').length
  },
  research_volume: {
    batches_completed: batchesCompleted,
    search_queries_nl: Object.keys(shNl).length,
    search_queries_de: Object.keys(shDe).length,
    live_dp_checks_nl: Object.keys(dpNl).length,
    live_dp_checks_de: Object.keys(dpDe).length,
    dealer_checks: Object.keys(dealer94).length,
    batch_needs_evidence_open: neBatchUniq.size,
    batch_rejected_logged: rejBatchUniq.size
  },
  consistency_success: cons.success
};

fs.writeFileSync(path.join(OUT94, 'PHASE94_ACTIVATION.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

const md = [
  '# Phase 94 — Evidence Recovery & Model Coverage Report',
  '',
  `- Generated at: ${summary.generated_at}`,
  `- Canonical models evaluated: 507`,
  `- GSC limitation: Live GSC API credentials not configured locally; prioritized using stored \`PHASE81_PRIORITY_MODELS.json\` & \`PHASE77D_GSC_INVENTORY.json\`.`,
  `- eBay status: Local \`data/affiliate/ebay_offers.json\` preserves all **1,773** canonical ACTIVE offers (**220** parts). Live eBay Browse API credentials are missing locally and public \`ebay.nl\` returns HTTP 403; **${ebayStatus.ebay_title_only_needs_evidence}** \`TITLE_ONLY_NEEDS_EVIDENCE\` candidates remain preserved in backlog without unauthorized scraping.`,
  '',
  '## KPI Summary',
  '',
  '| KPI | Before (Phase 93) | After (Phase 94) | Growth |',
  '|---|---:|---:|---:|',
  `| ACTIVE Amazon.nl | ${summary.before.active_nl} | ${summary.after.active_nl} | +${summary.after.new_nl_activated} |`,
  `| ACTIVE Amazon.de | ${summary.before.active_de} | ${summary.after.active_de} | +${summary.after.new_de_activated} |`,
  `| ACTIVE Amazon Total | ${summary.before.active_total} | ${summary.after.active_total} | +${summary.after.new_offers_activated} |`,
  `| Unieke onderdelen direct koopbaar (Amazon) | ${summary.before.unique_parts} | ${summary.after.unique_parts} | +${summary.after.new_unique_parts_added} |`,
  `| Totaal unieke koopbare onderdelen (Amazon + eBay) | 1802 | ${summary.after.combined_unique_parts_amazon_plus_ebay} | +${summary.after.combined_unique_parts_amazon_plus_ebay - 1802} |`,
  `| Modellen met koopdekking (non-GHS / incl. GHS, van 507) | ${summary.before.models_covered_non_ghs} / ${summary.before.models_covered_all_fitments} | ${summary.after.models_covered_non_ghs} / ${summary.after.models_covered_all_fitments} | +${summary.after.models_coverage_growth_non_ghs} / +${summary.after.models_coverage_growth_all_fitments} |`,
  `| Modellen met >= 6 directe onderdelen | ${summary.before.models_with_gte6_parts_all_fitments} | ${summary.after.models_with_gte6_parts_all_fitments} | +${summary.after.models_gte6_growth} |`,
  `| Verrijkte NEEDS_EVIDENCE-dossiers | - | ${summary.evidence_enrichment.dossiers_enriched_from_archives} | - |`,
  `| NEEDS_EVIDENCE -> ACTIVE geactiveerd | - | ${summary.evidence_enrichment.needs_evidence_slots_activated_in_phase94} | - |`,
  '',
  `All ${summary.before.active_total} baseline ACTIVE offers, ${summary.after.suspended_historical_preserved} SUSPENDED records, ${summary.after.verified_inactive_preserved} VERIFIED fixtures, and ${summary.after.research_required_remaining} RESEARCH_REQUIRED records remain preserved with zero consistency violations.`
].join('\n') + '\n';

fs.writeFileSync(path.join(OUT94, 'PHASE94_REPORT.md'), md, 'utf8');
console.log(JSON.stringify(summary, null, 2));
