#!/usr/bin/env node
/**
 * scripts/phase94_build_queue.mjs
 *
 * Phase 94 — Evidence Recovery & Model Coverage Queue Builder
 *
 * Strictly focuses on ZERO-ACTIVE parts so well-covered parts never crowd out
 * new purchasable parts or uncovered/thin models:
 *   - batch_0: Pre-screened unowned /dp/ cache wins (104 pairs across 61 zero-active parts)
 *              + open NEEDS_EVIDENCE HTTP 200 / OOS / BAD_BRAND re-checks
 *   - Tier 1 (P1): Remaining parts of the 36 uncovered fitment models (6 non-GHS + 30 GHS-only)
 *   - Tier 2 (P2): Thinly covered models (1-5 ACTIVE parts, 113 models) prioritized by GSC traffic
 *   - Tier 3 (P3): Remaining 60 PHASE86_EBAY_QUEUE parts + 208 unsearched NEEDS_EVIDENCE parts
 *   - Tier 4 (P4): Top never-searched multi-model wear parts (descending model fitment breadth)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { BAD_BRAND_RE, STRONG_MULTIPACK_RE, resolveCleanBrand, evaluateTechnicalFit } from './phase88_screener.mjs';
import { checkHistoricalMismatch } from '../src/affiliate/HistoricalMismatches.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT94 = path.join(ROOT, 'output', 'phase94');
fs.mkdirSync(OUT94, { recursive: true });

const readOpt = (rel, fb = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fb; }
};
const norm = p => PartNormalizer.normalizePartNumber(p);
const digits = s => String(s || '').replace(/[^0-9]/g, '');
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

const cleanBrand94 = check => {
  let b = resolveCleanBrand(check) || '';
  b = b
    .replace(/^De\s+(.+?)\s+Store\s+openen$/i, '$1')
    .replace(/^Visit\s+the\s+(.+?)\s+Store$/i, '$1')
    .replace(/^Bezoek\s+de\s+store\s+van\s+(.+)$/i, '$1')
    .replace(/^Marke:\s*/i, '')
    .trim();
  if (!b && check.byline) {
    const m = String(check.byline).trim().match(/^(?:De|The|Den)\s+(.+?)\s+(?:Store|Shop)\b/i);
    if (m) b = m[1].trim();
  }
  return b;
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
    [/mowing head|maaikop|autocut|spool/, 'Mähkopf'],
    [/blade|mes/, 'Messer'],
    [/chain|ketting/, 'Sägekette'],
    [/guide bar|zaagblad|bar/, 'Führungsschiene'],
    [/spring|veer/, 'Feder'],
    [/nozzle|lance/, 'Düse'],
    [/buffer|rubber|trillingsdemper/, 'Puffer'],
    [/bearing|lager/, 'Lager']
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
const ownedAsinMkt = new Set(activeOffers.map(o => `${o.marketplace || 'amazon.nl'}|${o.asin}`));

const catDoc = readOpt('data/parts_catalog.json', []);
const catalog = Array.isArray(catDoc) ? catDoc : (catDoc.parts || []);
const catSet = new Set(catalog.map(p => norm(p.part_number)));
const partNameMap = new Map(catalog.map(p => [norm(p.part_number), p.part_name || '']));

const stihlDb = readOpt('data/stihl_database.json', { models: [] });
const sqlDb = new Database(path.join(ROOT, 'data/stihl_database.db'), { readonly: true });
const fitAll = sqlDb.prepare('SELECT DISTINCT canonical_model_id, part_number, source_id FROM model_part_fitments').all();
sqlDb.close();

const modelPartsAll = new Map();
const partFitModels = new Map();
for (const r of fitAll) {
  const pn = norm(r.part_number);
  if (!pn) continue;
  if (!modelPartsAll.has(r.canonical_model_id)) modelPartsAll.set(r.canonical_model_id, new Set());
  modelPartsAll.get(r.canonical_model_id).add(pn);
  if (!partFitModels.has(pn)) partFitModels.set(pn, new Set());
  partFitModels.get(pn).add(r.canonical_model_id);
}

const priorityModels = readOpt('output/phase81/PHASE81_PRIORITY_MODELS.json', { models: [] }).models || [];
const gscByFid = new Map();
for (const m of priorityModels) {
  const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
  if (fid) gscByFid.set(fid, { impressions: m.gsc_impressions || 0, clicks: m.gsc_clicks || 0 });
}

const modelNameByFid = new Map();
const uncoveredModelFids = new Set();
const thinModelFids = new Set();
const modelCoverageCount = new Map();

for (const m of (stihlDb.models || [])) {
  const c = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const alt = m.id.toLowerCase();
  const sAlt = alt.replace(/^stihl_/, '');
  const fid = modelPartsAll.has(c) ? c : (modelPartsAll.has(alt) ? alt : (modelPartsAll.has(sAlt) ? sAlt : c));
  modelNameByFid.set(fid, m.model_name);
  const fSet = modelPartsAll.get(fid) || new Set();
  if (fSet.size === 0) continue;
  const activeCount = [...fSet].filter(p => activeParts.has(p)).length;
  modelCoverageCount.set(fid, activeCount);
  if (activeCount === 0) uncoveredModelFids.add(fid);
  else if (activeCount <= 5) thinModelFids.add(fid);
}

// Merge caches (Phase 87..93)
const mergeCaches = (prefix, deSkip87_1 = false) => {
  const nl = {}, de = {};
  for (const dir of ['phase87_1', 'phase87_2', 'phase87_3', 'phase88', 'phase89', 'phase90', 'phase92', 'phase93']) {
    if (prefix === 'search_hits' && dir === 'phase87_3') continue;
    Object.assign(nl, readOpt(`output/${dir}/${prefix}_amazon_nl.json`, {}));
    if (!(deSkip87_1 && dir === 'phase87_1')) {
      Object.assign(de, readOpt(`output/${dir}/${prefix}_amazon_de.json`, {}));
    }
  }
  return { nl, de };
};
const searchMerged = mergeCaches('search_hits', true);
const checksMerged = mergeCaches('product_checks', true);

const nePool = readOpt('output/phase93/needs_evidence_pool.json', { items: [] }).items || [];
const ebayQueue86 = readOpt('output/phase86/PHASE86_EBAY_QUEUE.json', { queue: [] }).queue || [];
const enrichmentDoc = readOpt('output/phase94/evidence_enrichment.json', { dossiers: {} });

// =========================================================================
// 1. BATCH_0: Pre-screened unowned /dp/ cache wins + live retry NEEDS_EVIDENCE
// =========================================================================
const b0Pairs = { nl: [], de: [] };
const seenB0 = new Set();
const addB0 = (pn, mkt, asin, reason, forceRecheck = false) => {
  if (!pn || !asin || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`) || PROTECTED_RECORD_ASINS.has(asin)) return;
  if (activeSlots.has(`${pn}|${mkt}`) || ownedAsinMkt.has(`${mkt}|${asin}`)) return;
  const key = `${pn}|${mkt}|${asin}`;
  if (seenB0.has(key)) return;
  seenB0.add(key);
  b0Pairs[mkt === 'amazon.de' ? 'de' : 'nl'].push({ part_number: pn, mkt, asin, reason, force_recheck: forceRecheck });
};

// 1a. Pre-screened unowned live /dp/ cache matches for ZERO-ACTIVE parts
for (const mkt of ['amazon.nl', 'amazon.de']) {
  const ch = mkt === 'amazon.de' ? checksMerged.de : checksMerged.nl;
  for (const [asin, rec] of Object.entries(ch)) {
    if (ownedAsinMkt.has(`${mkt}|${asin}`) || !rec?.listed || rec.isDead || !rec.hasAddCart || rec.cannotShipNl) continue;
    const t11 = [...new Set(((rec.title || '').match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
    const fullTxt = `${rec.title || ''} ${(rec.bullets || []).join(' ')} ${rec.techSpecs || ''} ${rec.description || ''}`;
    const b11 = [...new Set((fullTxt.match(/\b\d{4}[\s.-]?\d{3}[\s.-]?\d{4}\b/g) || []).map(digits))];
    const candParts = t11.length > 0 ? t11 : (b11.length <= 5 ? b11 : []);
    for (const p of candParts) {
      if (!catSet.has(p) || activeParts.has(p) || activeSlots.has(`${p}|${mkt}`)) continue;
      if (checkHistoricalMismatch(p, asin, rec.title || '').isMismatch) continue;
      const brand = cleanBrand94(rec);
      if (!brand || BAD_BRAND_RE.test(brand)) continue;
      // Extra PKS multipack check before selecting
      if (/\b\d+\s*pks\b/i.test(rec.title || '')) continue;
      const checkWithSpecs = { ...rec, description: [rec.techSpecs || '', rec.description || ''].filter(Boolean).join(' ') };
      if (!evaluateTechnicalFit(p, partNameMap.get(p) || '', checkWithSpecs, brand).ok) continue;
      if (mkt === 'amazon.de') {
        const deliv = `${rec.glowLoc || ''} ${rec.deliveryBlock || ''} ${(rec.delivery || []).join(' ')} ${rec.avail || ''}`;
        if (!/nederland|netherlands|nl|bezorging|lieferung|zustellung|delivery/i.test(deliv)) continue;
      }
      addB0(p, mkt, asin, 'CACHED_UNOWNED_MPN_RECOVERY', true);
      break;
    }
  }
}

// 1b. Open NEEDS_EVIDENCE items: unchecked in P93 OR recoverable transient HTTP 200 / OOS / BAD_BRAND
const c93Nl = readOpt('output/phase93/product_checks_amazon_nl.json', {});
const c93De = readOpt('output/phase93/product_checks_amazon_de.json', {});
for (const item of nePool) {
  if (activeSlots.has(`${item.part_number}|${item.mkt}`)) continue;
  const checked93 = (item.mkt === 'amazon.de' ? c93De : c93Nl)[item.asin];
  const recoverableReason = item.reason === 'NOT_LISTED_HTTP_200'
    || item.reason === 'OUT_OF_STOCK_OR_NO_BUYBOX'
    || String(item.reason || '').startsWith('BAD_OR_MISSING_BRAND:');
  if (!checked93 || recoverableReason) {
    addB0(item.part_number, item.mkt, item.asin, `NE_RETRY:${item.reason}`, true);
  }
}

// =========================================================================
// 2. LIVE SEARCH QUEUE (STRICTLY ZERO-ACTIVE PARTS!)
// =========================================================================
const selectedMap = new Map();
const pushPart = (pn, tier, rankBias = 0, modelHint = '') => {
  if (!pn || pn.length !== 11 || selectedMap.has(pn) || activeParts.has(pn) || !partNameMap.has(pn)) return;
  const pName = partNameMap.get(pn) || '';
  const fids = partFitModels.get(pn) || new Set();
  const isWear = WEAR_RE.test(pName) && !TINY_HARDWARE_RE.test(pName);
  let gscScore = 0;
  let minModelCov = 999;
  for (const fid of fids) {
    const g = gscByFid.get(fid);
    if (g) gscScore = Math.max(gscScore, g.impressions + g.clicks * 25);
    const cov = modelCoverageCount.get(fid);
    if (cov !== undefined) minModelCov = Math.min(minModelCov, cov);
  }
  const kw = keywordFromPartName(pName);
  const formatted = formatPart(pn);
  const queries = [
    `STIHL ${formatted}`,
    kw ? `${formatted} ${kw}` : (modelHint ? `STIHL ${modelHint} ${formatted}` : pn)
  ];
  selectedMap.set(pn, {
    part_number: pn,
    part_name: pName,
    tier,
    model_count: fids.size,
    min_model_cov: minModelCov === 999 ? null : minModelCov,
    gsc_score: gscScore,
    is_wear: isWear,
    rank: rankBias + (isWear ? 20000 : 0) + fids.size * 1500 + gscScore,
    queries
  });
};

// P1: Uncovered fitment models (36 models -> 0 ACTIVE parts)
for (const fid of uncoveredModelFids) {
  const mName = modelNameByFid.get(fid) || '';
  for (const pn of (modelPartsAll.get(fid) || new Set())) {
    if (!activeParts.has(pn)) pushPart(pn, 'P1_UNCOVERED_MODELS', 1000000, mName);
  }
}

// P2: Thinly covered models (1-5 ACTIVE parts, 113 models) — max 10 unsearched/best parts per model
const thinList = [...thinModelFids].sort((a, b) => {
  const covDiff = (modelCoverageCount.get(a) || 0) - (modelCoverageCount.get(b) || 0);
  if (covDiff !== 0) return covDiff;
  return (gscByFid.get(b)?.impressions || 0) - (gscByFid.get(a)?.impressions || 0);
});
for (const fid of thinList) {
  const mName = modelNameByFid.get(fid) || '';
  const open = [...(modelPartsAll.get(fid) || new Set())]
    .filter(pn => !activeParts.has(pn) && !selectedMap.has(pn))
    .sort((a, b) => {
      const aUnsearched = (!searchMerged.nl[a] || !searchMerged.de[a]) ? 1 : 0;
      const bUnsearched = (!searchMerged.nl[b] || !searchMerged.de[b]) ? 1 : 0;
      const aWear = WEAR_RE.test(partNameMap.get(a) || '') && !TINY_HARDWARE_RE.test(partNameMap.get(a) || '') ? 1 : 0;
      const bWear = WEAR_RE.test(partNameMap.get(b) || '') && !TINY_HARDWARE_RE.test(partNameMap.get(b) || '') ? 1 : 0;
      return (bUnsearched - aUnsearched) || (bWear - aWear);
    });
  for (const pn of open.slice(0, 10)) {
    pushPart(pn, 'P2_THIN_MODELS_1_TO_5', 750000, mName);
  }
}

// P3: Remaining open 60 PHASE86_EBAY_QUEUE parts + unsearched open NEEDS_EVIDENCE parts
for (const q of ebayQueue86) {
  const pn = norm(q.part_number);
  if (pn && !activeParts.has(pn)) pushPart(pn, 'P3_EBAY_QUEUE_NO_AMAZON', 550000);
}
for (const item of nePool) {
  const pn = norm(item.part_number);
  if (pn && !activeParts.has(pn) && (!searchMerged.nl[pn] || !searchMerged.de[pn])) {
    pushPart(pn, 'P3_NEEDS_EVIDENCE_UNSEARCHED', 500000);
  }
}

// P4: Never-searched multi-model wear parts with 0 ACTIVE offers (highest model-fitment leverage!)
const neverSearchedWear = [];
for (const [pn, fids] of partFitModels.entries()) {
  if (activeParts.has(pn) || selectedMap.has(pn)) continue;
  if (searchMerged.nl[pn] && searchMerged.de[pn]) continue; // strictly prioritize never-searched parts!
  const pName = partNameMap.get(pn) || '';
  if (!WEAR_RE.test(pName) || TINY_HARDWARE_RE.test(pName)) continue;
  if (/NO LONGER AVAILABLE/i.test(pName)) continue;
  let gscSum = 0;
  for (const fid of fids) gscSum += (gscByFid.get(fid)?.impressions || 0);
  neverSearchedWear.push({ pn, score: fids.size * 1000 + gscSum });
}
neverSearchedWear.sort((a, b) => b.score - a.score);
for (const c of neverSearchedWear.slice(0, 1100)) {
  pushPart(c.pn, 'P4_NEVER_SEARCHED_MULTI_MODEL_WEAR', 300000);
}

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
  phase: '94',
  baseline: {
    active_offers: activeOffers.length,
    active_unique_parts: activeParts.size,
    uncovered_fitment_models: uncoveredModelFids.size,
    thin_models_1_to_5: thinModelFids.size,
    never_searched_wear_pool_available: neverSearchedWear.length,
    open_needs_evidence_enriched: Object.keys(enrichmentDoc.dossiers || {}).length
  },
  batch_0: {
    nl_count: b0Pairs.nl.length,
    de_count: b0Pairs.de.length,
    nl_pairs: b0Pairs.nl,
    de_pairs: b0Pairs.de
  },
  search_queue_total: allSelected.length,
  tier_breakdown: tierCounts,
  batch_size: BATCH_SIZE,
  batch_count: batches.length,
  batches
};

fs.writeFileSync(path.join(OUT94, 'queue.json'), JSON.stringify(queueDoc, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  baseline: queueDoc.baseline,
  batch_0_counts: { nl: b0Pairs.nl.length, de: b0Pairs.de.length },
  search_queue_total: queueDoc.search_queue_total,
  tier_breakdown: queueDoc.tier_breakdown,
  batch_count: queueDoc.batch_count
}, null, 2));
