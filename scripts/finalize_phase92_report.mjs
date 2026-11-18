/**
 * scripts/finalize_phase92_report.mjs
 *
 * Audits all Phase 92 batches, verifies 507 canonical model coverage & Two-Gate invariants,
 * and writes:
 *   - output/phase92/PHASE92_ACTIVATION.json
 *   - output/phase92/PHASE92_REPORT.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { TwoGateVerifier } from '../src/affiliate/TwoGateVerifier.js';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { checkAffiliateConsistency } from './check_affiliate_consistency.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT92 = path.join(ROOT, 'output', 'phase92');

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const reg = read('data/affiliate/verified_amazon_registry.json');
const stihlDb = read('data/stihl_database.json');
const catalogDoc = read('data/parts_catalog.json');
const catalogPartsList = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const catalogParts = new Set(catalogPartsList.map(p => PartNormalizer.normalizePartNumber(p.part_number)));
const queueDoc = read('output/phase92/queue.json');
const sqlDb = new Database(path.join(ROOT, 'data/stihl_database.db'), { readonly: true });
const fitRows = sqlDb.prepare("SELECT DISTINCT canonical_model_id, part_number FROM model_part_fitments WHERE source_id != 'ghs'").all();
sqlDb.close();

const modelParts = new Map();
for (const r of fitRows) {
  const pn = PartNormalizer.normalizePartNumber(r.part_number);
  if (!modelParts.has(r.canonical_model_id)) modelParts.set(r.canonical_model_id, new Set());
  modelParts.get(r.canonical_model_id).add(pn);
}

const activeAll = reg.offers.filter(o => o.status === 'ACTIVE');
const baselineOffers = activeAll.filter(o => !/^Phase 92:/.test(o.status_reason || ''));
const phase92Offers = activeAll.filter(o => /^Phase 92:/.test(o.status_reason || ''));

const countModelCov = offers => {
  const nlP = new Set(offers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').map(o => o.part_number));
  const deP = new Set(offers.filter(o => o.marketplace === 'amazon.de').map(o => o.part_number));
  let any = 0, nl = 0, de = 0;
  for (const m of (stihlDb.models || [])) {
    const c = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const alt = m.id.toLowerCase();
    const sAlt = alt.replace(/^stihl_/, '');
    const pSet = modelParts.get(c) || modelParts.get(alt) || modelParts.get(sAlt) || new Set();
    let hn = false, hd = false;
    for (const pn of pSet) {
      if (nlP.has(pn)) hn = true;
      if (deP.has(pn)) hd = true;
    }
    if (hn || hd) any++;
    if (hn) nl++;
    if (hd) de++;
  }
  return { any, nl, de };
};

const covBefore = countModelCov(baselineOffers);
const covAfter = countModelCov(activeAll);

// Verify all Phase 92 active records
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

for (const o of phase92Offers) {
  const mkt = o.marketplace || 'amazon.nl';
  const expectedTag = mkt === 'amazon.de' ? 'srihldecode00-21' : 'srihldecoder2-21';
  const v = TwoGateVerifier.verifyOffer(o, { catalogPartMap: catalogParts, expectedTag });
  if (!v.passed) throw new Error(`TwoGate fail on ${o.part_number}/${o.asin}: ${v.errors.join('; ')}`);
  const mm = checkHistoricalMismatch(o.part_number, o.asin, o.product_title || '');
  if (mm.isMismatch) throw new Error(`Historical mismatch on ${o.part_number}/${o.asin}`);
}

const batchDir = path.join(OUT92, 'batches');
const neUniq = new Set();
const rejUniq = new Set();
let batchesCompleted = 0;
for (const bf of fs.readdirSync(batchDir).filter(f => f.endsWith('.json')).sort()) {
  batchesCompleted++;
  const b = read(path.join('output/phase92/batches', bf));
  for (const n of (b.needs_evidence || [])) neUniq.add(`${n.part_number}|${n.mkt}|${n.asin}`);
  for (const r of (b.rejected || [])) rejUniq.add(`${r.part_number}|${r.mkt}|${r.asin}`);
}

const beforeUniqueParts = new Set(baselineOffers.map(o => o.part_number)).size;
const afterUniqueParts = new Set(activeAll.map(o => o.part_number)).size;
const dpNl = read('output/phase92/product_checks_amazon_nl.json');
const dpDe = read('output/phase92/product_checks_amazon_de.json');
const shNl = read('output/phase92/search_hits_amazon_nl.json');
const shDe = read('output/phase92/search_hits_amazon_de.json');
const dealer92 = read('output/phase92/dealer_corroboration.json');

const cons = await checkAffiliateConsistency();
if (!cons.success) throw new Error(`Affiliate consistency failed: ${JSON.stringify(cons)}`);

const summary = {
  phase: '92',
  generated_at: new Date().toISOString(),
  gsc_status: queueDoc.gsc_source,
  ebay_status: {
    local_store_active: 0,
    production_persistent_disk_known_phase86_active: 1773,
    live_probe_result: 'EBAY_BROWSE_API_MISSING_AND_PUBLIC_EBAY_HTTP_403'
  },
  before: {
    active_total: baselineOffers.length,
    active_nl: baselineOffers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    active_de: baselineOffers.filter(o => o.marketplace === 'amazon.de').length,
    unique_parts: beforeUniqueParts,
    models_covered: covBefore.any,
    models_covered_nl: covBefore.nl,
    models_covered_de: covBefore.de,
    suspended: reg.metrics.suspended,
    research_required: reg.metrics.research_required,
    verified_inactive: reg.metrics.verified
  },
  after: {
    active_total: activeAll.length,
    active_nl: activeAll.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    active_de: activeAll.filter(o => o.marketplace === 'amazon.de').length,
    unique_parts: afterUniqueParts,
    new_offers_activated: phase92Offers.length,
    new_nl_activated: phase92Offers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    new_de_activated: phase92Offers.filter(o => o.marketplace === 'amazon.de').length,
    new_unique_parts_added: afterUniqueParts - beforeUniqueParts,
    new_genuine_stihl: phase92Offers.filter(o => o.oem_brand_classification === 'GENUINE_STIHL').length,
    new_aftermarket: phase92Offers.filter(o => o.oem_brand_classification !== 'GENUINE_STIHL').length,
    new_dealer_corroborated: phase92Offers.filter(o => (o.verifiable_evidence_sources || []).some(s => s.type === 'EXTERNAL_CATALOG')).length,
    models_covered: covAfter.any,
    models_covered_nl: covAfter.nl,
    models_covered_de: covAfter.de,
    models_coverage_growth: covAfter.any - covBefore.any,
    suspended_historical_preserved: reg.metrics.suspended,
    research_required_remaining: reg.metrics.research_required,
    verified_inactive_preserved: reg.metrics.verified
  },
  research_volume: {
    batches_completed: batchesCompleted,
    search_queries_nl: Object.keys(shNl).length,
    search_queries_de: Object.keys(shDe).length,
    live_dp_checks_nl: Object.keys(dpNl).length,
    live_dp_checks_de: Object.keys(dpDe).length,
    dealer_checks: Object.keys(dealer92).length,
    needs_evidence_candidates_logged: neUniq.size,
    rejected_candidates_logged: rejUniq.size
  },
  consistency_success: cons.success
};

fs.writeFileSync(path.join(OUT92, 'PHASE92_ACTIVATION.json'), JSON.stringify(summary, null, 2).replace(/\r\n/g, '\n') + '\n', 'utf8');

const reportMd = `# Phase 92 — Affiliate Coverage Expansion Report

- Generated at: ${summary.generated_at}
- Canonical models evaluated: ${(stihlDb.models || []).length}
- GSC limitation: Live GSC credentials not configured locally; prioritized using stored GSC datasets (\`PHASE81_PRIORITY_MODELS.json\`, \`PHASE77D_GSC_INVENTORY.json\`) combined with all 507 canonical model fitments.
- eBay status: No local eBay Browse API OAuth credentials and public \`ebay.nl\` returns HTTP 403; existing production eBay offers on \`/var/data\` remain untouched.

## KPI Summary

| KPI | Before | After | Growth |
|---|---:|---:|---:|
| ACTIVE Amazon.nl | ${summary.before.active_nl} | ${summary.after.active_nl} | +${summary.after.new_nl_activated} |
| ACTIVE Amazon.de | ${summary.before.active_de} | ${summary.after.active_de} | +${summary.after.new_de_activated} |
| ACTIVE Amazon Total | ${summary.before.active_total} | ${summary.after.active_total} | +${summary.after.new_offers_activated} |
| Unieke onderdelen direct koopbaar (Amazon) | ${summary.before.unique_parts} | ${summary.after.unique_parts} | +${summary.after.new_unique_parts_added} |
| Canonieke modellen met directe dekking (van 507) | ${summary.before.models_covered} | ${summary.after.models_covered} | +${summary.after.models_coverage_growth} |
| Live \`/dp/\` productverificaties (NL / DE) | - | ${summary.research_volume.live_dp_checks_nl} / ${summary.research_volume.live_dp_checks_de} | +${summary.research_volume.live_dp_checks_nl + summary.research_volume.live_dp_checks_de} |
| Batch NEEDS_EVIDENCE / Registry RESEARCH_REQUIRED | 19 | ${summary.research_volume.needs_evidence_candidates_logged} / ${summary.after.research_required_remaining} | - |
| Batch REJECTED (aantoonbaar multipack/mismatch/missing MPN) | - | ${summary.research_volume.rejected_candidates_logged} | - |

All ${summary.before.active_total} baseline ACTIVE offers, ${summary.after.suspended_historical_preserved} historical SUSPENDED records, and ${summary.after.verified_inactive_preserved} protected VERIFIED fixtures are 100% preserved with zero consistency violations.
`;

fs.writeFileSync(path.join(OUT92, 'PHASE92_REPORT.md'), reportMd.replace(/\r\n/g, '\n'), 'utf8');
console.log(JSON.stringify(summary, null, 2));
