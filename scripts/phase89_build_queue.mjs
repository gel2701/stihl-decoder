/**
 * scripts/phase89_build_queue.mjs
 *
 * Phase 89: Amazon Affiliate Expansion 1500+
 * Builds:
 *   1. existing_pool_recovery:
 *      - All 22 remaining non-ACTIVE candidates (19 RESEARCH_REQUIRED + 3 VERIFIED)
 *      - Every previously found search-hit ASIN (^B[0-9A-Z]{9}) on uncovered (part, marketplace)
 *        whose /dp/ page has not yet been cleanly checked (or timed out / had empty #productTitle /
 *        was previously listed with !hasAddCart on stock-checkable listings)
 *      - Proven eBay / dealer parts that still lack an active Amazon offer
 *   2. priority_queue (12 batches x 135 = 1,620 catalog parts >= 1,500 target):
 *      Ordered strictly by P1 (GSC impressions) -> P2 (commercial coverage gap) ->
 *      P3 (maintenance & repair categories) -> P4 (existing eBay/dealer/supersession identity) ->
 *      P5 (remaining multi-model catalog parts).
 *      Avoids duplicate search rounds for parts already completely searched across NL & DE.
 *
 * Output: output/phase89/queue.json
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase89');
fs.mkdirSync(OUT, { recursive: true });

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };

const norm = p => PartNormalizer.normalizePartNumber(p);
const digits = s => String(s || '').replace(/[^0-9]/g, '');
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

// Single-marketplace pinned test fixtures from legacy Phase 62/65/70/75/79B suites
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

const registry = read('data/affiliate/verified_amazon_registry.json');
const catalogDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const priorityModels = read('output/phase81/PHASE81_PRIORITY_MODELS.json').models || [];
const ebayOffers = readOpt('output/phase86/ebay_offers_phase86.json', { offers: [] }).offers || [];
const supersessionsDoc = readOpt('data/parts_supersessions.json', { relations: [] });
const fitmentIndex = read('data/model_part_fitments.json');

const hitsNl = {
  ...readOpt('output/phase87_1/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase88/search_hits_amazon_nl.json', {})
};
const hitsDe = {
  ...readOpt('output/phase87_2/search_hits_amazon_de.json', {}),
  ...readOpt('output/phase88/search_hits_amazon_de.json', {})
};
const dpNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase88/product_checks_amazon_nl.json', {})
};
const dpDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase88/product_checks_amazon_de.json', {})
};
const dealerPrev = {
  ...readOpt('output/phase87_1/dealer_corroboration.json', {}),
  ...readOpt('output/phase87_2/dealer_corroboration.json', {}),
  ...readOpt('output/phase87_3/dealer_corroboration.json', {}),
  ...readOpt('output/phase88/dealer_corroboration.json', {})
};

const activeOffers = registry.offers.filter(o => o.status === 'ACTIVE');
const activeParts = new Set(activeOffers.map(o => norm(o.part_number)));
const activeByPartMkt = new Set(activeOffers.map(o => `${norm(o.part_number)}|${(o.marketplace || 'amazon.nl').toLowerCase()}`));
const suspendedParts = new Set(registry.offers.filter(o => o.status === 'SUSPENDED').map(o => norm(o.part_number)));
const needsEvidenceRecords = registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED' || o.status === 'VERIFIED');
const needsEvidenceParts = new Set(needsEvidenceRecords.map(o => norm(o.part_number)));

const modelMetaByFid = new Map();
for (const m of priorityModels) {
  const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
  if (fid) modelMetaByFid.set(fid, m);
}

const partsByModelFid = new Map();
const modelsByPart = new Map();
const totalModelsByPart = new Map();
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
    if (!totalModelsByPart.has(pn)) totalModelsByPart.set(pn, new Set());
    totalModelsByPart.get(pn).add(fid);
    if (!partsByModelFid.has(fid)) partsByModelFid.set(fid, new Set());
    partsByModelFid.get(fid).add(pn);
    if (modelMetaByFid.has(fid)) {
      if (!modelsByPart.has(pn)) modelsByPart.set(pn, new Set());
      modelsByPart.get(pn).add(fid);
    }
  }
}

// Compute coverage ratio across ALL models (P2)
const modelGapScore = new Map();
for (const [fid, partSet] of partsByModelFid.entries()) {
  let covered = 0;
  for (const pn of partSet) {
    if (activeParts.has(pn)) covered++;
  }
  const ratio = partSet.size > 0 ? covered / partSet.size : 1;
  // High catalog count + low active ratio = bigger commercial gap
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

// 1. Inventory existing pool recovery (Section 2: cards #3..#10, incomplete/errored /dp/, in-stock retries, 22 non-ACTIVE)
const existingRecoveryParts = new Set(needsEvidenceParts);
const recoveryPairsNl = [];
const recoveryPairsDe = [];
const seenNlPair = new Set();
const seenDePair = new Set();

function scanSearchCacheForRecovery(searchMap, dpMap, mkt, outList, seenSet) {
  for (const [pn, rec] of Object.entries(searchMap)) {
    const slotKey = `${pn}|${mkt}`;
    if (activeByPartMkt.has(slotKey) || PROTECTED_PINNED_SLOTS.has(slotKey)) continue;
    let addedForPart = 0;
    for (const h of (rec.hits || [])) {
      if (!h.asin || !/^B[0-9A-Z]{9}$/i.test(h.asin)) continue;
      const exactTitle = digits(h.title).includes(pn);
      const stihlClue = /stihl|s[äa]genspezi|oregon|walbro|zama|ngk|bosch|vhbw|hippotech|cancanle|mchnic/i.test(h.title || '');
      if (!exactTitle && !stihlClue) continue;

      const dp = dpMap[h.asin];
      const isIncomplete = !dp || Boolean(dp.error) || (dp.http_status === 200 && !dp.listed && !dp.isDead);
      const isStockRetry = Boolean(dp && dp.listed && !dp.hasAddCart && !dp.cannotShipNl && dp.hasPrice);
      const isFreshUnchecked = !dp;

      if (isFreshUnchecked || isIncomplete || isStockRetry) {
        const pk = `${pn}|${h.asin}`;
        if (!seenSet.has(pk)) {
          seenSet.add(pk);
          outList.push({
            part_number: pn,
            asin: h.asin,
            reason: isStockRetry ? 'STOCK_BUYBOX_RETRY' : (isIncomplete ? 'INCOMPLETE_DP_RETRY' : 'UNCHECKED_CARD_ALT'),
            exact_title: exactTitle
          });
          existingRecoveryParts.add(pn);
          addedForPart++;
          if (addedForPart >= 4) break;
        }
      }
    }
  }
}

scanSearchCacheForRecovery(hitsNl, dpNl, 'amazon.nl', recoveryPairsNl, seenNlPair);
scanSearchCacheForRecovery(hitsDe, dpDe, 'amazon.de', recoveryPairsDe, seenDePair);

// Sort exact-title pairs first
recoveryPairsNl.sort((a, b) => (b.exact_title ? 1 : 0) - (a.exact_title ? 1 : 0));
recoveryPairsDe.sort((a, b) => (b.exact_title ? 1 : 0) - (a.exact_title ? 1 : 0));

// 2. Score uncovered catalog parts for P1..P5 Priority Queue (>= 1,500 parts -> 1,620 = 12 * 135)
const scoredParts = [];
for (const p of catalog) {
  const pn = norm(p.part_number);
  if (!pn || pn.length !== 11) continue;

  const needNl = !activeByPartMkt.has(`${pn}|amazon.nl`) && !PROTECTED_PINNED_SLOTS.has(`${pn}|amazon.nl`);
  const needDe = !activeByPartMkt.has(`${pn}|amazon.de`) && !PROTECTED_PINNED_SLOTS.has(`${pn}|amazon.de`);
  if (!needNl && !needDe) continue;

  const searchedNl = Boolean(hitsNl[pn] && !hitsNl[pn].error);
  const searchedDe = Boolean(hitsDe[pn] && !hitsDe[pn].error);
  // Avoid redundant searches if EVERY needed marketplace was already searched completely
  if ((!needNl || searchedNl) && (!needDe || searchedDe) && !needsEvidenceParts.has(pn)) continue;

  const gscFids = Array.from(modelsByPart.get(pn) || []);
  const allFids = Array.from(totalModelsByPart.get(pn) || []);
  const supList = Array.from(supersessionsByPart.get(pn) || []);
  const name = p.part_name || '';

  // P1: GSC impressions
  let p1 = 0;
  const modelNames = [];
  for (const fid of gscFids) {
    const meta = modelMetaByFid.get(fid);
    if (!meta) continue;
    modelNames.push({ name: meta.model_name, imp: Number(meta.gsc_impressions) || 0 });
    p1 += Math.min(90, Math.sqrt(Number(meta.gsc_impressions) || 4) * 4);
  }
  p1 = Math.min(240, p1);
  modelNames.sort((a, b) => b.imp - a.imp);

  // P2: Commercial model coverage gaps across all fitments
  let p2 = 0;
  for (const fid of allFids) {
    p2 = Math.max(p2, (modelGapScore.get(fid) || 0) * 18);
  }
  p2 = Math.min(120, p2);

  // P3: Maintenance & repair part types
  let p3 = 0;
  if (HIGH_INTENT_RE.test(name)) p3 = 90;
  else if (MED_INTENT_RE.test(name)) p3 = 45;
  else if (LOW_HARDWARE_RE.test(name)) p3 = -55;
  else p3 = 15;

  // P4: External identity proof (eBay, dealer, supersession, suspended recovery)
  let p4 = 0;
  if (ebayExactParts.has(pn)) p4 += 75;
  if (dealerFoundParts.has(pn)) p4 += 65;
  if (supList.length > 0) p4 += 35;
  if (suspendedParts.has(pn) && !activeParts.has(pn)) p4 += 70;
  if (needsEvidenceParts.has(pn)) p4 += 95;

  // P5: Zero active offers bonus + catalog breadth
  let p5 = (!activeParts.has(pn) ? 65 : 0) + Math.min(40, allFids.length * 4) + ((p.source_count || 0) >= 2 ? 12 : 0);

  const totalScore = Math.round((p1 + p2 + p3 + p4 + p5) * 10) / 10;
  const priorityTier = p1 > 20 ? 'P1_GSC' : (p2 >= 50 ? 'P2_GAP' : (p3 >= 45 ? 'P3_REPAIR' : (p4 > 0 ? 'P4_EVIDENCE' : 'P5_CATALOG')));

  if (totalScore <= 0 && allFids.length === 0) continue;

  scoredParts.push({
    part_number: pn,
    part_display: formatPart(pn),
    part_name: name,
    priority_tier: priorityTier,
    score: totalScore,
    has_active_any: activeParts.has(pn),
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

// Build 12 batches of 135 parts = 1,620 parts (>= 1,500 requirement, batch size 125-150)
const BATCH_SIZE = 135;
const TARGET_QUEUE = 1620;
const newSearchQueue = scoredParts.slice(0, TARGET_QUEUE);
const batches = [];
for (let i = 0; i < newSearchQueue.length; i += BATCH_SIZE) {
  batches.push({
    batch_id: `batch_${batches.length + 1}`,
    count: Math.min(BATCH_SIZE, newSearchQueue.length - i),
    parts: newSearchQueue.slice(i, i + BATCH_SIZE)
  });
}

const outDoc = {
  generated_at: new Date().toISOString(),
  baseline: {
    active_total: activeOffers.length,
    active_nl: activeOffers.filter(o => !o.marketplace || o.marketplace === 'amazon.nl').length,
    active_de: activeOffers.filter(o => o.marketplace === 'amazon.de').length,
    unique_parts: activeParts.size,
    needs_evidence_count: needsEvidenceRecords.length
  },
  existing_pool_recovery: {
    needs_evidence_parts: Array.from(needsEvidenceParts),
    recovery_part_count: existingRecoveryParts.size,
    nl_pair_count: recoveryPairsNl.length,
    de_pair_count: recoveryPairsDe.length,
    nl_pairs: recoveryPairsNl,
    de_pairs: recoveryPairsDe
  },
  new_search_total: newSearchQueue.length,
  batch_size: BATCH_SIZE,
  batch_count: batches.length,
  tier_breakdown: Object.fromEntries(['P1_GSC', 'P2_GAP', 'P3_REPAIR', 'P4_EVIDENCE', 'P5_CATALOG'].map(t => [t, newSearchQueue.filter(x => x.priority_tier === t).length])),
  batches
};

fs.writeFileSync(path.join(OUT, 'queue.json'), JSON.stringify(outDoc, null, 1).replace(/\r\n/g, '\n') + '\n', 'utf8');

console.log({
  candidate_pool_scored: scoredParts.length,
  new_search_queued: newSearchQueue.length,
  tier_breakdown: outDoc.tier_breakdown,
  completely_new_parts: newSearchQueue.filter(x => !x.has_active_any).length,
  existing_recovery_parts: existingRecoveryParts.size,
  recovery_nl_pairs: recoveryPairsNl.length,
  recovery_de_pairs: recoveryPairsDe.length,
  batches: batches.map(b => `${b.batch_id}:${b.count}`)
});
