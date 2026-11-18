#!/usr/bin/env node
/**
 * scripts/phase93_build_queue.mjs
 *
 * Phase 93 — Affiliate Recovery & Expansion Queue Builder
 *
 * Builds:
 *   1. `batch_0`: Cached exact-MPN unchecked ASINs + RECOVERED_FROM_REJECTED & NEEDS_EVIDENCE
 *      candidates eligible for TechDetails DOM re-check + top unchecked zero-offer search hits.
 *   2. `batches` (1..N): Strictly prioritizes ZERO-ACTIVE parts first:
 *      - P1: Uncovered canonical models (6 non-GHS + 38 GHS-only models with known OEM parts)
 *      - P2: Existing eBay-only parts without any Amazon ACTIVE offer (142 parts)
 *      - P3: Zero-offer recoverable parts from Phase 92/93 NEEDS_EVIDENCE & multipack/type alternatives
 *      - P4: High-GSC priority model wear/maintenance parts with 0 ACTIVE offers
 *      - P5: High-traffic single-marketplace parts (only after zero-offer tiers)
 *
 * Output: output/phase93/queue.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { STRONG_MULTIPACK_RE } from './phase88_screener.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT93 = path.join(ROOT, 'output', 'phase93');
fs.mkdirSync(OUT93, { recursive: true });

const readOpt = (rel, fb = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fb; }
};
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
const PROTECTED_RECORD_ASINS = new Set(['B00IKF8TH8', 'B013KONKZY', 'B00SVDWDRG', 'B00LAHKSDQ']);

const WEAR_RE = /carburet|carburateur|spark plug|bougie|air filter|filter|chain sprocket|sprocket|clutch|koppeling|rewind starter|starter|ignition|coil|cylinder|piston|zuiger|muffler|uitlaat|oil pump|oliepomp|fuel hose|fuel line|fuel|tank|cap|av|buffer|gasket|seal|diaphragm|primer|choke|throttle|brake|tensioner|bearing|crankshaft|flywheel|fan|gear|head|blade|deflector|nozzle|handle|switch|valve|pawl|spring|ring|bar|guide|chain/i;
const TINY_HARDWARE_RE = /^(?:screw|nut|bolt|washer|circlip|e-clip|pin|rivet|sleeve|spacer|shim|stud|plug)\b/i;

function keywordFromPartName(name = '') {
  const n = String(name || '').toLowerCase();
  const pairs = [
    [/spark plug|bougie/, 'Zündkerze'],
    [/air filter|luchtfilter/, 'Luftfilter'],
    [/fuel filter|brandstoffilter/, 'Kraftstofffilter'],
    [/oil filter|oliefilter/, 'Ölfilter'],
    [/carburet|carburateur/, 'Vergaser'],
    [/cylinder|cilinder/, 'Zylinder'],
    [/piston|zuiger/, 'Kolben'],
    [/clutch|koppeling/, 'Kupplung'],
    [/sprocket|kettingwiel/, 'Kettenrad'],
    [/rewind starter|starter/, 'Starter'],
    [/ignition|coil|ontsteking/, 'Zündspule'],
    [/muffler|uitlaat/, 'Auspuff'],
    [/gasket|seal|pakking|keerring/, 'Dichtung'],
    [/diaphragm|membraan/, 'Membran'],
    [/primer|opvoerpomp/, 'Kraftstoffpumpe'],
    [/oil pump|oliepomp/, 'Ölpumpe'],
    [/fuel hose|fuel line|slang/, 'Kraftstoffschlauch'],
    [/tank cap|cap|dop/, 'Tankdeckel'],
    [/mowing head|maaikop/, 'Mähkopf'],
    [/blade|mes/, 'Messer'],
    [/chain|ketting/, 'Sägekette'],
    [/guide bar|zaagblad|bar/, 'Führungsschiene'],
    [/spring|veer/, 'Feder'],
    [/buffer|rubber|trillingsdemper/, 'Puffer'],
    [/bearing|lager/, 'Lager'],
  ];
  for (const [re, kw] of pairs) {
    if (re.test(n)) return kw;
  }
  return '';
}

const registry = readOpt('data/affiliate/verified_amazon_registry.json', { offers: [] });
const activeOffers = registry.offers.filter(o => o.status === 'ACTIVE');
const activeSlots = new Set(activeOffers.map(o => `${norm(o.part_number)}|${o.marketplace || 'amazon.nl'}`));
const activeParts = new Set(activeOffers.map(o => norm(o.part_number)));

const stihlDb = readOpt('data/stihl_database.json', { models: [] });
const catDoc = readOpt('data/parts_catalog.json', []);
const catalog = Array.isArray(catDoc) ? catDoc : (catDoc.parts || []);
const partNameMap = new Map(catalog.map(p => [norm(p.part_number), p.part_name || '']));

const sqlDb = new Database(path.join(ROOT, 'data/stihl_database.db'), { readonly: true });
const fitAll = sqlDb.prepare('SELECT DISTINCT canonical_model_id, part_number, source_id FROM model_part_fitments').all();
sqlDb.close();

const modelPartsNonGhs = new Map();
const modelPartsAll = new Map();
const partFitModels = new Map();
for (const r of fitAll) {
  const pn = norm(r.part_number);
  if (!pn) continue;
  if (!modelPartsAll.has(r.canonical_model_id)) modelPartsAll.set(r.canonical_model_id, new Set());
  modelPartsAll.get(r.canonical_model_id).add(pn);
  if (r.source_id !== 'ghs') {
    if (!modelPartsNonGhs.has(r.canonical_model_id)) modelPartsNonGhs.set(r.canonical_model_id, new Set());
    modelPartsNonGhs.get(r.canonical_model_id).add(pn);
  }
  if (!partFitModels.has(pn)) partFitModels.set(pn, new Set());
  partFitModels.get(pn).add(r.canonical_model_id);
}

const uncoveredNonGhsFids = new Set();
const uncoveredGhsOnlyFids = new Set();
const uncoveredPartsPriority = new Set();

for (const m of (stihlDb.models || [])) {
  const c = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const alt = m.id.toLowerCase();
  const sAlt = alt.replace(/^stihl_/, '');
  const fidNon = modelPartsNonGhs.has(c) ? c : (modelPartsNonGhs.has(alt) ? alt : (modelPartsNonGhs.has(sAlt) ? sAlt : c));
  const fidAll = modelPartsAll.has(c) ? c : (modelPartsAll.has(alt) ? alt : (modelPartsAll.has(sAlt) ? sAlt : c));
  const nonSet = modelPartsNonGhs.get(fidNon) || new Set();
  const allSet = modelPartsAll.get(fidAll) || new Set();
  if (nonSet.size > 0) {
    if (![...nonSet].some(p => activeParts.has(p))) {
      uncoveredNonGhsFids.add(fidNon);
      for (const p of nonSet) uncoveredPartsPriority.add(p);
    }
  } else if (allSet.size > 0) {
    if (![...allSet].some(p => activeParts.has(p))) {
      uncoveredGhsOnlyFids.add(fidAll);
      for (const p of allSet) uncoveredPartsPriority.add(p);
    }
  }
}

const priorityModels = readOpt('output/phase81/PHASE81_PRIORITY_MODELS.json', { models: [] }).models || [];
const gscByFid = new Map();
for (const m of priorityModels) {
  const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
  if (fid) gscByFid.set(fid, { impressions: m.gsc_impressions || 0, clicks: m.gsc_clicks || 0 });
}

const ebayStore = readOpt('data/affiliate/ebay_offers.json', { offers: [] });
const ebayParts = new Set((ebayStore.offers || []).map(o => norm(o.part_number)).filter(Boolean));
const ebayZeroAmazonParts = new Set([...ebayParts].filter(p => !activeParts.has(p)));

const nePoolDoc = readOpt('output/phase93/needs_evidence_pool.json', { items: [] });
const nePoolItems = nePoolDoc.items || [];
const auditDoc = readOpt('output/phase93/PHASE93_REJECTED_RECOVERY_AUDIT.json', {});

// Merge caches (read-only) across phase87_1..92
const searchNl = {
  ...readOpt('output/phase87_1/search_hits_amazon_nl.json'),
  ...readOpt('output/phase87_2/search_hits_amazon_nl.json'),
  ...readOpt('output/phase88/search_hits_amazon_nl.json'),
  ...readOpt('output/phase89/search_hits_amazon_nl.json'),
  ...readOpt('output/phase90/search_hits_amazon_nl.json'),
  ...readOpt('output/phase92/search_hits_amazon_nl.json'),
};
const searchDe = {
  ...readOpt('output/phase87_2/search_hits_amazon_de.json'),
  ...readOpt('output/phase88/search_hits_amazon_de.json'),
  ...readOpt('output/phase89/search_hits_amazon_de.json'),
  ...readOpt('output/phase90/search_hits_amazon_de.json'),
  ...readOpt('output/phase92/search_hits_amazon_de.json'),
};
const checksNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json'),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json'),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json'),
  ...readOpt('output/phase88/product_checks_amazon_nl.json'),
  ...readOpt('output/phase89/product_checks_amazon_nl.json'),
  ...readOpt('output/phase90/product_checks_amazon_nl.json'),
  ...readOpt('output/phase92/product_checks_amazon_nl.json'),
};
const checksDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json'),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json'),
  ...readOpt('output/phase88/product_checks_amazon_de.json'),
  ...readOpt('output/phase89/product_checks_amazon_de.json'),
  ...readOpt('output/phase90/product_checks_amazon_de.json'),
  ...readOpt('output/phase92/product_checks_amazon_de.json'),
};

function scorePart(pn) {
  let gscScore = 0;
  let uncovModelCount = 0;
  const fids = partFitModels.get(pn) || new Set();
  for (const fid of fids) {
    const g = gscByFid.get(fid);
    if (g) gscScore = Math.max(gscScore, g.impressions + g.clicks * 25);
    if (uncoveredNonGhsFids.has(fid)) uncovModelCount += 2;
    else if (uncoveredGhsOnlyFids.has(fid)) uncovModelCount += 1;
  }
  const pName = partNameMap.get(pn) || '';
  const isWear = WEAR_RE.test(pName) && !TINY_HARDWARE_RE.test(pName);
  return {
    gscScore,
    uncovModelCount,
    fitModelCount: fids.size,
    isWear,
    isZeroActive: !activeParts.has(pn),
    isUncovModelPart: uncoveredPartsPriority.has(pn),
    isEbayOnly: ebayZeroAmazonParts.has(pn),
    partName: pName
  };
}

// 1. Build batch_0 recovery pairs (NO search queries needed: unchecked exact hits + NEEDS_EVIDENCE rechecks + top cached unchecked hits for ZERO-ACTIVE parts!)
function cardPassesSearchPrefilter(pn, partName, card) {
  if (!card?.asin || card.sponsored) return false;
  if (PROTECTED_RECORD_ASINS.has(card.asin)) return false;
  const title = String(card.title || '');
  const isKit = /\b(kit|set|pack|pair|satz)\b/i.test(partName);
  if (!isKit && STRONG_MULTIPACK_RE.test(title)) {
    const m = title.match(STRONG_MULTIPACK_RE);
    if (m && !/^1\s*(?:x|pc|stuk|stück)/i.test(m[0])) return false;
  }
  // Skip search card if it clearly specifies ANOTHER 11-digit MPN
  const found11 = [...new Set((title.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
  if (found11.some(d => d.length === 11 && d !== pn)) return false;
  return true;
}

const batch0Pairs = { nl: [], de: [] };
const seenB0 = new Set();
const addB0 = (pn, mkt, asin, reason, forceRecheck = false) => {
  if (!pn || !asin || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`) || PROTECTED_RECORD_ASINS.has(asin)) return;
  if (activeSlots.has(`${pn}|${mkt}`)) return;
  const key = `${pn}|${mkt}|${asin}`;
  if (seenB0.has(key)) return;
  seenB0.add(key);
  const sc = scorePart(pn);
  const weight = (sc.isZeroActive ? 10000 : 0) + (sc.isUncovModelPart ? 5000 : 0) + (sc.isWear ? 1500 : 0) + Math.min(2000, Math.round(sc.gscScore / 100));
  batch0Pairs[mkt === 'amazon.de' ? 'de' : 'nl'].push({
    part_number: pn,
    mkt,
    asin,
    reason,
    force_recheck: forceRecheck,
    priority: weight
  });
};

// 1a. Exact 11-digit MPN in unchecked search hit title (highest conversion!)
for (const [mkt, sh, ch] of [['amazon.nl', searchNl, checksNl], ['amazon.de', searchDe, checksDe]]) {
  for (const [pn, rec] of Object.entries(sh)) {
    if (activeSlots.has(`${pn}|${mkt}`)) continue;
    const pName = partNameMap.get(pn) || '';
    for (const h of (rec?.hits || [])) {
      if (!h?.asin || ch[h.asin]) continue;
      if (!cardPassesSearchPrefilter(pn, pName, h)) continue;
      if (digits(h.title).includes(pn)) {
        addB0(pn, mkt, h.asin, 'EXACT_TITLE_SEARCH_UNCHECKED', false);
      }
    }
  }
}

// 1b. Recoverable NEEDS_EVIDENCE & recovered-from-REJECTED (eligible for TechDetails DOM re-check + OOS/transient retry)
for (const item of nePoolItems) {
  if (activeSlots.has(`${item.part_number}|${item.mkt}`)) continue;
  const force = item.source === 'RECOVERED_FROM_REJECTED' || item.source === 'PHASE92_NEEDS_EVIDENCE';
  addB0(item.part_number, item.mkt, item.asin, `NEEDS_EVIDENCE:${item.reason}`, force);
}

// 1c. Top cached non-sponsored unchecked search hits for ZERO-ACTIVE parts (max 2 ASINs per part|mkt)
for (const [mkt, sh, ch] of [['amazon.nl', searchNl, checksNl], ['amazon.de', searchDe, checksDe]]) {
  const parts = Object.keys(sh)
    .filter(pn => !activeParts.has(pn) && partNameMap.has(pn))
    .sort((a, b) => {
      const sa = scorePart(a), sb = scorePart(b);
      return ((sb.isUncovModelPart ? 1 : 0) - (sa.isUncovModelPart ? 1 : 0))
        || ((sb.isEbayOnly ? 1 : 0) - (sa.isEbayOnly ? 1 : 0))
        || ((sb.isWear ? 1 : 0) - (sa.isWear ? 1 : 0))
        || (sb.gscScore - sa.gscScore);
    });
  for (const pn of parts) {
    const rec = sh[pn];
    const pName = partNameMap.get(pn) || '';
    let added = 0;
    for (const h of (rec?.hits || [])) {
      if (!h?.asin || ch[h.asin]) continue;
      if (!cardPassesSearchPrefilter(pn, pName, h)) continue;
      if (!/stihl|oregon|ngk|bosch|sägenspezi|haishine|ratioparts|mchnic|perfektgarten|vhbw/i.test(h.title || '') && !h.has_price) continue;
      addB0(pn, mkt, h.asin, 'CACHED_ZERO_OFFER_PREFILTERED', false);
      added++;
      if (added >= 2) break;
    }
  }
}

// Sort batch_0 pools by highest expected new-part & uncovered-model yield
const reasonBoost = r => {
  if (r === 'EXACT_TITLE_SEARCH_UNCHECKED') return 50000;
  if (r.includes('NOT_LISTED_HTTP_200') || r.includes('OUT_OF_STOCK') || r.includes('MPN_NOT_EXPLICIT')) return 20000;
  return 0;
};
batch0Pairs.nl.sort((a, b) => (b.priority + reasonBoost(b.reason)) - (a.priority + reasonBoost(a.reason)));
batch0Pairs.de.sort((a, b) => (b.priority + reasonBoost(b.reason)) - (a.priority + reasonBoost(a.reason)));

// 2. Build live search batches (P1..P4 strictly ZERO-ACTIVE parts first, then P5 single-mkt)
const selectedMap = new Map();
const pushPart = (pn, tier, rankBias = 0) => {
  if (!pn || pn.length !== 11 || selectedMap.has(pn)) return;
  if (!partNameMap.has(pn)) return;
  const sc = scorePart(pn);
  const kw = keywordFromPartName(sc.partName);
  const formatted = formatPart(pn);
  const queries = [
    `STIHL ${formatted}`,
    kw ? `STIHL ${formatted} ${kw}` : `STIHL ${pn}`,
    pn
  ];
  selectedMap.set(pn, {
    part_number: pn,
    part_name: sc.partName,
    tier,
    is_zero_active: sc.isZeroActive,
    uncovered_models: sc.uncovModelCount,
    gsc_score: sc.gscScore,
    is_wear: sc.isWear,
    rank: rankBias + (sc.isZeroActive ? 1000000 : 0) + sc.uncovModelCount * 50000 + (sc.isWear ? 10000 : 0) + sc.gscScore,
    queries
  });
};

// P1: Uncovered canonical models (6 non-GHS + 38 GHS-only) parts without ACTIVE Amazon
for (const pn of uncoveredPartsPriority) {
  if (!activeParts.has(pn)) pushPart(pn, 'P1_UNCOVERED_MODEL_PARTS', 900000);
}

// P2: 142 eBay-only parts without ANY Amazon ACTIVE offer
for (const pn of ebayZeroAmazonParts) {
  pushPart(pn, 'P2_EBAY_ONLY_ZERO_AMAZON', 700000);
}

// P3: Zero-offer recoverable parts from REJECTED audit & NEEDS_EVIDENCE & RESEARCH_REQUIRED & SUSPENDED
const zeroOfferRecoverableParts = new Set([
  ...nePoolItems.map(x => x.part_number),
  ...registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED' || o.status === 'SUSPENDED').map(o => norm(o.part_number))
].filter(pn => pn && !activeParts.has(pn)));
for (const pn of zeroOfferRecoverableParts) {
  pushPart(pn, 'P3_RECOVERABLE_ZERO_OFFER', 500000);
}

// P4: Remaining ZERO-ACTIVE wear & high-GSC fitment parts in catalog
const candidateZeroParts = [];
for (const [pn, pName] of partNameMap.entries()) {
  if (activeParts.has(pn) || selectedMap.has(pn)) continue;
  const fids = partFitModels.get(pn);
  if (!fids || fids.size === 0) continue;
  const sc = scorePart(pn);
  if (!sc.isWear && sc.gscScore === 0) continue;
  candidateZeroParts.push({ pn, score: (sc.isWear ? 5000 : 0) + sc.gscScore + sc.fitModelCount * 100 });
}
candidateZeroParts.sort((a, b) => b.score - a.score);
for (const c of candidateZeroParts.slice(0, 900)) {
  pushPart(c.pn, 'P4_HIGH_GSC_WEAR_ZERO_OFFER', 300000);
}

// Sort zero-offer tiers first; keep queue focused on ZERO-ACTIVE parts!
const allSelected = [...selectedMap.values()].sort((a, b) => b.rank - a.rank);

const BATCH_SIZE = 100;
const batches = [];
for (let i = 0; i < allSelected.length; i += BATCH_SIZE) {
  batches.push({
    batch_id: `batch_${Math.floor(i / BATCH_SIZE) + 1}`,
    tier_mix: [...new Set(allSelected.slice(i, i + BATCH_SIZE).map(x => x.tier))],
    parts: allSelected.slice(i, i + BATCH_SIZE)
  });
}

const tierCounts = {};
for (const x of allSelected) tierCounts[x.tier] = (tierCounts[x.tier] || 0) + 1;

const queueDoc = {
  generated_at: new Date().toISOString(),
  phase: '93',
  baseline: {
    active_offers: activeOffers.length,
    active_unique_parts: activeParts.size,
    uncovered_non_ghs_models: uncoveredNonGhsFids.size,
    uncovered_ghs_only_models: uncoveredGhsOnlyFids.size,
    ebay_only_zero_amazon_parts: ebayZeroAmazonParts.size,
    rejected_audited: auditDoc.audited_rejected_candidates || 0,
    moved_to_needs_evidence: auditDoc.moved_to_needs_evidence_count || 0
  },
  batch_0: {
    nl_count: batch0Pairs.nl.length,
    de_count: batch0Pairs.de.length,
    exact_title_unchecked_nl: batch0Pairs.nl.filter(x => x.reason === 'EXACT_TITLE_SEARCH_UNCHECKED').length,
    exact_title_unchecked_de: batch0Pairs.de.filter(x => x.reason === 'EXACT_TITLE_SEARCH_UNCHECKED').length,
    nl_pairs: batch0Pairs.nl,
    de_pairs: batch0Pairs.de
  },
  search_queue_total: allSelected.length,
  tier_breakdown: tierCounts,
  batch_size: BATCH_SIZE,
  batch_count: batches.length,
  batches
};

fs.writeFileSync(path.join(OUT93, 'queue.json'), JSON.stringify(queueDoc, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  baseline: queueDoc.baseline,
  batch_0_counts: {
    nl_total: queueDoc.batch_0.nl_count,
    de_total: queueDoc.batch_0.de_count,
    exact_title_nl: queueDoc.batch_0.exact_title_unchecked_nl,
    exact_title_de: queueDoc.batch_0.exact_title_unchecked_de
  },
  search_queue_total: queueDoc.search_queue_total,
  tier_breakdown: queueDoc.tier_breakdown,
  batch_count: queueDoc.batch_count
}, null, 2));
