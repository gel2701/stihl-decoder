/**
 * scripts/phase90_build_queue.mjs
 *
 * Phase 90: Amazon Growth & Conversion Optimization
 * Uses real measured GSC data (PHASE81_PRIORITY_MODELS.json addendum 2026-10-13..2026-11-09
 * & PHASE77D_GSC_INVENTORY.json baseline 2026-08-01..2026-10-31) without fabricating figures.
 *
 * Builds output/phase90/queue.json:
 *   1. existing_pool_recovery:
 *      - All 22 non-ACTIVE registry items (19 RESEARCH_REQUIRED + 3 VERIFIED)
 *      - All 65 logged NEEDS_EVIDENCE items from Phase 89 batches
 *      - Remaining unchecked ASINs (#4..#10 cards & retries) from Phase 87..89 search caches
 *   2. priority_queue (15 batches x 140 = 2,100 catalog parts >= 2,000 requirement):
 *      Strict P1 (high GSC impressions, 0 direct offers) ->
 *             P2 (high GSC clicks/traffic, 1 direct offer) ->
 *             P3 (maintenance & repair categories) ->
 *             P4 (existing eBay/dealer/supersession/NEEDS_EVIDENCE proof) ->
 *             P5 (remaining multi-model catalog parts).
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase90');
fs.mkdirSync(OUT, { recursive: true });

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };

const norm = p => PartNormalizer.normalizePartNumber(p);
const digits = s => String(s || '').replace(/[^0-9]/g, '');
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

const PROTECTED_PINNED_SLOTS = new Set([
  '11104007005|amazon.de',
  '00004007000|amazon.de',
  '00004007011|amazon.de',
  '11231201613|amazon.de',
  '11300074100|amazon.nl',
  '30050003905|amazon.nl',
  '11304001302|amazon.nl',
  '11236402003|amazon.nl'
]);

const FOCUS_MODEL_SET = new Set([
  'ms_170', 'ms_180', 'ms_250', 'ms_260', 'ms_361',
  'ms_440', 'ms_461', 'fs_55', 'fs_85', 'bg_86', 'br_600', 'hs_45'
]);

const registry = read('data/affiliate/verified_amazon_registry.json');
const catalogDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const priorityModels = read('output/phase81/PHASE81_PRIORITY_MODELS.json').models || [];
const gscInv = readOpt('output/phase77d/PHASE77D_GSC_INVENTORY.json', { stored_historical_gsc_baseline: { rows: [] } });
const ebayOffers = readOpt('output/phase86/ebay_offers_phase86.json', { offers: [] }).offers || [];
const supersessionsDoc = readOpt('data/parts_supersessions.json', { relations: [] });
const fitmentIndex = read('data/model_part_fitments.json');

const hitsNl = {
  ...readOpt('output/phase87_1/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase88/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase89/search_hits_amazon_nl.json', {})
};
const hitsDe = {
  ...readOpt('output/phase87_2/search_hits_amazon_de.json', {}),
  ...readOpt('output/phase88/search_hits_amazon_de.json', {}),
  ...readOpt('output/phase89/search_hits_amazon_de.json', {})
};
const dpNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase88/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase89/product_checks_amazon_nl.json', {})
};
const dpDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase88/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase89/product_checks_amazon_de.json', {})
};
const dealerPrev = {
  ...readOpt('output/phase87_1/dealer_corroboration.json', {}),
  ...readOpt('output/phase87_2/dealer_corroboration.json', {}),
  ...readOpt('output/phase87_3/dealer_corroboration.json', {}),
  ...readOpt('output/phase88/dealer_corroboration.json', {}),
  ...readOpt('output/phase89/dealer_corroboration.json', {})
};

const activeOffers = registry.offers.filter(o => o.status === 'ACTIVE');
const activeCountByPart = new Map();
const activeByPartMkt = new Set();
for (const o of activeOffers) {
  const pn = norm(o.part_number);
  const mkt = (o.marketplace || 'amazon.nl').toLowerCase();
  activeByPartMkt.add(`${pn}|${mkt}`);
  activeCountByPart.set(pn, (activeCountByPart.get(pn) || 0) + 1);
}
const suspendedParts = new Set(registry.offers.filter(o => o.status === 'SUSPENDED').map(o => norm(o.part_number)));
const needsEvidenceRecords = registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED' || o.status === 'VERIFIED');
const needsEvidenceParts = new Set(needsEvidenceRecords.map(o => norm(o.part_number)));

// Collect 65 NEEDS_EVIDENCE items from Phase 89 batches
const p89NeedsList = [];
const p89NeedsParts = new Set();
for (let i = 0; i <= 12; i++) {
  const b = readOpt(`output/phase89/batches/batch_${i}.json`, null);
  if (!b || !Array.isArray(b.needs_evidence)) continue;
  for (const x of b.needs_evidence) {
    p89NeedsList.push(x);
    if (x.part_number) p89NeedsParts.add(norm(x.part_number));
  }
}

const modelMetaByFid = new Map();
for (const m of priorityModels) {
  const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
  if (fid) modelMetaByFid.set(fid, m);
}

const partsByModelFid = new Map();
const gscModelsByPart = new Map();
const allModelsByPart = new Map();
const supersessionsByPart = new Map();

for (const rel of (supersessionsDoc.relations || [])) {
  const from = norm(rel.from_part);
  const to = norm(rel.to_part);
  if (from && to && rel.public_active !== false) {
    if (!supersessionsByPart.has(from)) supersessionsByPart.set(from, new Set());
    supersessionsByPart.get(from).add(to);
  }
}

for (const shard of (fitmentIndex.shard_files || [])) {
  const stream = fs.createReadStream(path.join(ROOT, 'data', shard)).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const pn = norm(rec.part_number);
    if (!pn) continue;
    if (rec.superseded_by) {
      const sup = norm(rec.superseded_by);
      if (sup) {
        if (!supersessionsByPart.has(pn)) supersessionsByPart.set(pn, new Set());
        supersessionsByPart.get(pn).add(sup);
      }
    }
    const fid = rec.canonical_model_id;
    if (!fid) continue;
    if (!allModelsByPart.has(pn)) allModelsByPart.set(pn, new Set());
    allModelsByPart.get(pn).add(fid);
    if (!partsByModelFid.has(fid)) partsByModelFid.set(fid, new Set());
    partsByModelFid.get(fid).add(pn);
    if (modelMetaByFid.has(fid)) {
      if (!gscModelsByPart.has(pn)) gscModelsByPart.set(pn, new Set());
      gscModelsByPart.get(pn).add(fid);
    }
  }
}

const modelGapScore = new Map();
for (const [fid, partSet] of partsByModelFid.entries()) {
  let covered = 0;
  for (const pn of partSet) {
    if ((activeCountByPart.get(pn) || 0) > 0) covered++;
  }
  const ratio = partSet.size > 0 ? covered / partSet.size : 1;
  modelGapScore.set(fid, (1 - ratio) * Math.log2(partSet.size + 1));
}

const ebayExactParts = new Set();
for (const e of ebayOffers) {
  if (e.status === 'ACTIVE' || e.match_type === 'EXACT_MPN') {
    const pn = norm(e.part_number);
    if (pn) ebayExactParts.add(pn);
  }
}
const dealerFoundParts = new Set(Object.values(dealerPrev).filter(d => d && d.found).map(d => norm(d.part)));

const HIGH_INTENT_RE = /\b(carburett?or|air filter|fuel filter|oil filter|spark plug|ignition|starter|rewind|sprocket|rim|clutch|oil pump|cylinder|piston|muffler|crankshaft|flywheel|guide bar|saw chain|autocut|polycut|durocut|mowing head|trimmer head|blade|intake|manifold|brake|handlebar|fan housing|service kit)\b/i;
const MED_INTENT_RE = /\b(filter|gasket|seal|diaphragm|membrane|valve|throttle|switch|deflector|catcher|bumper|spike|gear|drum|tank cap|fuel cap|oil cap|hose|line|spring|pawl|pulley|coil|module|handle|cover|shroud|hood|bearing)\b/i;
const LOW_HARDWARE_RE = /\b(hexagonal|spline screw|pan head screw|tapping screw|lock washer|flat washer|washer\b|circlip|snap ring|e-clip|rivet|dowel|dowel pin|sleeve|spacer|collar screw|blind rivet)\b/i;

function buildVariants(pn, partName, topModelNames, supList) {
  const disp = formatPart(pn);
  const shortKw = String(partName || '')
    .replace(/^Stihl\s+/i, '')
    .replace(/^\d{11}\s+/, '')
    .replace(/[^a-zA-Z0-9\s."/-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
  const variants = [`STIHL ${disp}`, pn];
  if (shortKw && shortKw.length >= 4) variants.push(`${disp} ${shortKw}`);
  if (supList.length > 0) variants.push(`STIHL ${formatPart(supList[0])}`);
  if (topModelNames.length > 0) variants.push(`STIHL ${topModelNames[0]} ${disp}`);
  return [...new Set(variants)];
}

// 1. Recovery pool from Phase 87..89 caches (cards #4..#10, incomplete /dp/, 65 NEEDS_EVIDENCE retries)
const recoveryPartsSet = new Set([...needsEvidenceParts, ...p89NeedsParts]);
const recoveryPairsNl = [];
const recoveryPairsDe = [];
const seenNl = new Set();
const seenDe = new Set();

function scanSearchCacheForRecovery(searchMap, dpMap, mkt, outList, seenSet) {
  for (const [pn, rec] of Object.entries(searchMap)) {
    const slotKey = `${pn}|${mkt}`;
    if (activeByPartMkt.has(slotKey) || PROTECTED_PINNED_SLOTS.has(slotKey)) continue;
    let added = 0;
    for (const h of (rec.hits || [])) {
      if (!h.asin || !/^B[0-9A-Z]{9}$/i.test(h.asin)) continue;
      const exactTitle = digits(h.title).includes(pn);
      const isIncomplete = !dpMap[h.asin] || Boolean(dpMap[h.asin].error) || (dpMap[h.asin].http_status === 200 && !dpMap[h.asin].listed && !dpMap[h.asin].isDead);
      const isP89NeedsRetry = p89NeedsList.some(x => x.part_number === pn && x.mkt === mkt && x.asin === h.asin);

      // Reclaim exact-title unchecked ASINs (#4..#10 cards), incomplete /dp/, or Phase 89 NEEDS_EVIDENCE retries
      if ((exactTitle && !dpMap[h.asin]) || (exactTitle && isIncomplete) || isP89NeedsRetry) {
        const pk = `${pn}|${h.asin}`;
        if (!seenSet.has(pk)) {
          seenSet.add(pk);
          outList.push({
            part_number: pn,
            asin: h.asin,
            reason: isP89NeedsRetry ? 'P89_NEEDS_EVIDENCE_RETRY' : (isIncomplete && dpMap[h.asin] ? 'INCOMPLETE_DP_RETRY' : 'UNCHECKED_EXACT_HIT'),
            exact_title: exactTitle
          });
          recoveryPartsSet.add(pn);
          added++;
          if (added >= 4) break;
        }
      }
    }
  }
}

scanSearchCacheForRecovery(hitsNl, dpNl, 'amazon.nl', recoveryPairsNl, seenNl);
scanSearchCacheForRecovery(hitsDe, dpDe, 'amazon.de', recoveryPairsDe, seenDe);

// 2. Score >= 2,000 uncovered catalog parts (15 batches x 140 = 2,100) using actual GSC metrics
const scoredParts = [];
for (const p of catalog) {
  const pn = norm(p.part_number);
  if (!pn || pn.length !== 11) continue;

  const needNl = !activeByPartMkt.has(`${pn}|amazon.nl`) && !PROTECTED_PINNED_SLOTS.has(`${pn}|amazon.nl`);
  const needDe = !activeByPartMkt.has(`${pn}|amazon.de`) && !PROTECTED_PINNED_SLOTS.has(`${pn}|amazon.de`);
  if (!needNl && !needDe) continue;

  const searchedNl = Boolean(hitsNl[pn] && !hitsNl[pn].error);
  const searchedDe = Boolean(hitsDe[pn] && !hitsDe[pn].error);
  if ((!needNl || searchedNl) && (!needDe || searchedDe) && !needsEvidenceParts.has(pn)) continue;

  const gscFids = Array.from(gscModelsByPart.get(pn) || []);
  const allFids = Array.from(allModelsByPart.get(pn) || []);
  const supList = Array.from(supersessionsByPart.get(pn) || []);
  const name = p.part_name || '';
  const activeCount = activeCountByPart.get(pn) || 0;

  let maxImpressions = 0;
  let maxClicks = 0;
  let focusBoost = 0;
  const modelNames = [];
  for (const fid of gscFids) {
    const meta = modelMetaByFid.get(fid);
    if (!meta) continue;
    const imp = Number(meta.gsc_impressions) || 0;
    const clk = Number(meta.gsc_clicks) || 0;
    if (imp > maxImpressions) maxImpressions = imp;
    if (clk > maxClicks) maxClicks = clk;
    if (FOCUS_MODEL_SET.has(fid)) focusBoost = Math.max(focusBoost, 28);
    modelNames.push({ name: meta.model_name, imp, clk });
  }
  modelNames.sort((a, b) => (b.imp - a.imp) || (b.clk - a.clk));

  let gapMax = 0;
  for (const fid of allFids) {
    gapMax = Math.max(gapMax, modelGapScore.get(fid) || 0);
  }

  let repairScore = 10;
  if (HIGH_INTENT_RE.test(name)) repairScore = 95;
  else if (MED_INTENT_RE.test(name)) repairScore = 45;
  else if (LOW_HARDWARE_RE.test(name)) repairScore = -60;

  const gscScore = Math.min(200, Math.sqrt(maxImpressions) * 7 + maxClicks * 9 + focusBoost);
  const evidenceScore = (ebayExactParts.has(pn) ? 70 : 0) + (dealerFoundParts.has(pn) ? 60 : 0) + (supList.length > 0 ? 35 : 0) + (suspendedParts.has(pn) && activeCount === 0 ? 65 : 0);

  let priorityTier;
  let tierBase;
  if (activeCount === 0 && (maxImpressions >= 15 || focusBoost > 0) && repairScore >= 45) {
    priorityTier = 'P1_GSC_ZERO_DIRECT';
    tierBase = 500;
  } else if (activeCount === 1 && (maxClicks >= 1 || maxImpressions >= 25 || focusBoost > 0)) {
    priorityTier = 'P2_GSC_SINGLE_OFFER';
    tierBase = 380;
  } else if (activeCount === 0 && repairScore >= 45) {
    priorityTier = 'P3_REPAIR_PARTS';
    tierBase = 260;
  } else if (evidenceScore > 0 || needsEvidenceParts.has(pn) || p89NeedsParts.has(pn)) {
    priorityTier = 'P4_EVIDENCE_PROOF';
    tierBase = 170;
  } else {
    priorityTier = 'P5_CATALOG_OPPORTUNITIES';
    tierBase = 40;
  }

  const totalScore = Math.round((tierBase + gscScore + Math.min(110, gapMax * 16) + repairScore + evidenceScore + (activeCount === 0 ? 55 : 0) + Math.min(30, allFids.length * 3) + ((p.source_count || 0) >= 2 ? 10 : 0)) * 10) / 10;

  if (allFids.length === 0 && totalScore < 120) continue;

  scoredParts.push({
    part_number: pn,
    part_display: formatPart(pn),
    part_name: name,
    priority_tier: priorityTier,
    score: totalScore,
    active_count: activeCount,
    max_gsc_impressions: maxImpressions,
    max_gsc_clicks: maxClicks,
    need_nl: needNl && !searchedNl,
    need_de: needDe && !searchedDe,
    ebay_exact: ebayExactParts.has(pn),
    dealer_found: dealerFoundParts.has(pn),
    top_models: modelNames.slice(0, 5).map(m => m.name),
    supersessions: supList,
    queries: buildVariants(pn, name, modelNames.map(m => m.name), supList)
  });
}

scoredParts.sort((a, b) => b.score - a.score);

const BATCH_SIZE = 140;
const TARGET_QUEUE = 2100; // 15 batches x 140 = 2,100 parts (>= 2,000 requirement)
const newSearchQueue = scoredParts.slice(0, TARGET_QUEUE);
const batches = [];
for (let i = 0; i < newSearchQueue.length; i += BATCH_SIZE) {
  batches.push({
    batch_id: `batch_${batches.length + 1}`,
    count: Math.min(BATCH_SIZE, newSearchQueue.length - i),
    parts: newSearchQueue.slice(i, i + BATCH_SIZE)
  });
}

const gscSummaryModels = priorityModels
  .filter(m => Number(m.gsc_impressions) > 0 || FOCUS_MODEL_SET.has(m.fitment_id))
  .map(m => {
    const fSet = partsByModelFid.get(m.fitment_id) || new Set();
    let covered = 0;
    for (const pn of fSet) {
      if ((activeCountByPart.get(pn) || 0) > 0) covered++;
    }
    return {
      model_name: m.model_name,
      fitment_id: m.fitment_id,
      gsc_impressions: m.gsc_impressions || 0,
      gsc_clicks: m.gsc_clicks || 0,
      gsc_ctr_pct: m.gsc_ctr_pct || 0,
      gsc_position: m.gsc_position || null,
      catalog_parts: fSet.size,
      covered_parts_baseline: covered,
      missing_parts_baseline: Math.max(0, fSet.size - covered)
    };
  });

const outDoc = {
  generated_at: new Date().toISOString(),
  gsc_source: {
    addendum_period: '2026-10-13..2026-11-09 (PHASE81_PRIORITY_MODELS.json / PHASE77D_LIVE_GSC_ADDENDUM.md)',
    baseline_period: '2026-08-01..2026-10-31 (PHASE77D_GSC_INVENTORY.json)',
    historical_queries: (gscInv.stored_historical_gsc_baseline?.rows || []).map(r => r.subject),
    focus_models: gscSummaryModels
  },
  baseline: {
    active_total: activeOffers.length,
    active_nl: activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length,
    active_de: activeOffers.filter(o => o.marketplace === 'amazon.de').length,
    unique_parts: activeCountByPart.size,
    needs_evidence_registry: needsEvidenceRecords.length,
    needs_evidence_phase89_logged: p89NeedsList.length
  },
  existing_pool_recovery: {
    needs_evidence_parts: Array.from(needsEvidenceParts),
    p89_needs_evidence_parts: Array.from(p89NeedsParts),
    recovery_part_count: recoveryPartsSet.size,
    nl_pair_count: recoveryPairsNl.length,
    de_pair_count: recoveryPairsDe.length,
    nl_pairs: recoveryPairsNl,
    de_pairs: recoveryPairsDe
  },
  new_search_total: newSearchQueue.length,
  batch_size: BATCH_SIZE,
  batch_count: batches.length,
  tier_breakdown: Object.fromEntries(
    ['P1_GSC_ZERO_DIRECT', 'P2_GSC_SINGLE_OFFER', 'P3_REPAIR_PARTS', 'P4_EVIDENCE_PROOF', 'P5_CATALOG_OPPORTUNITIES']
      .map(t => [t, newSearchQueue.filter(x => x.priority_tier === t).length])
  ),
  batches
};

fs.writeFileSync(path.join(OUT, 'queue.json'), JSON.stringify(outDoc, null, 1).replace(/\r\n/g, '\n') + '\n', 'utf8');

console.log({
  candidate_pool_scored: scoredParts.length,
  new_search_queued: newSearchQueue.length,
  tier_breakdown: outDoc.tier_breakdown,
  zero_direct_offer_parts: newSearchQueue.filter(x => x.active_count === 0).length,
  single_offer_parts: newSearchQueue.filter(x => x.active_count === 1).length,
  existing_recovery_parts: recoveryPartsSet.size,
  recovery_nl_pairs: recoveryPairsNl.length,
  recovery_de_pairs: recoveryPairsDe.length,
  batches: batches.map(b => `${b.batch_id}:${b.count}`)
});
