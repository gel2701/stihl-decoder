#!/usr/bin/env node
/**
 * scripts/phase95_build_queue.mjs
 *
 * Phase 95 — Targeted Activation & Coverage Growth Queue Builder
 *
 * Builds a high-precision, zero-waste work queue covering:
 *  1. Priority 1: Remaining uncovered fitment models (non-GHS & GHS) + parts of
 *     GSC-prioritized thin models (1-5 ACTIVE parts).
 *  2. Priority 2: All 572 open recoverable NEEDS_EVIDENCE slots (output/phase93/needs_evidence_pool.json)
 *     plus Phase 94 batch_0..19 NOT_LISTED_HTTP_200 / OOS / UNCACHED exact-MPN pairs.
 *  3. Deduplicates across all Phase 87..94 caches so nothing redundant is re-scraped.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { BAD_BRAND_RE, STRONG_MULTIPACK_RE } from './phase95_screener.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT95 = path.join(ROOT, 'output', 'phase95');
fs.mkdirSync(OUT95, { recursive: true });

const readOpt = (rel, fb = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fb; }
};
const norm = p => PartNormalizer.normalizePartNumber(p);
const digits = s => String(s || '').replace(/[^0-9]/g, '');
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

const reg = readOpt('data/affiliate/verified_amazon_registry.json', { offers: [] });
const activeOffers = reg.offers.filter(o => o.status === 'ACTIVE');
const activeParts = new Set(activeOffers.map(o => o.part_number));
const activeBySlot = new Set(activeOffers.map(o => `${o.part_number}|${o.marketplace || 'amazon.nl'}`));
const activeByAsinMkt = new Map(activeOffers.map(o => [`${o.marketplace || 'amazon.nl'}|${o.asin}`, o.part_number]));

const catalogDoc = readOpt('data/parts_catalog.json', { parts: [] });
const catalogList = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const catalogParts = new Set();
const catalogNames = new Map();
for (const p of catalogList) {
  const pn = norm(p.part_number);
  if (!pn) continue;
  catalogParts.add(pn);
  catalogNames.set(pn, p.part_name || '');
}

const stihlDb = readOpt('data/stihl_database.json', { models: [] });
const db = new Database(path.join(ROOT, 'data/stihl_database.db'), { readonly: true });
const fitRows = db.prepare('SELECT DISTINCT canonical_model_id, part_number, source_id FROM model_part_fitments').all();
db.close();

const modelPartsAll = new Map();
const modelPartsNonGhs = new Map();
const partModels = new Map();
for (const r of fitRows) {
  const pn = norm(r.part_number);
  if (!pn || !catalogParts.has(pn)) continue;
  if (!modelPartsAll.has(r.canonical_model_id)) modelPartsAll.set(r.canonical_model_id, new Set());
  modelPartsAll.get(r.canonical_model_id).add(pn);
  if (r.source_id !== 'ghs') {
    if (!modelPartsNonGhs.has(r.canonical_model_id)) modelPartsNonGhs.set(r.canonical_model_id, new Set());
    modelPartsNonGhs.get(r.canonical_model_id).add(pn);
  }
  if (!partModels.has(pn)) partModels.set(pn, new Set());
  partModels.get(pn).add(r.canonical_model_id);
}

// Identify uncovered models & thin models (1-5 parts) + GSC priorities
const p81 = readOpt('output/phase81/PHASE81_PRIORITY_MODELS.json', {});
const gscScoreByModel = new Map();
for (const item of (p81.models || p81.priority_models || [])) {
  if (item?.canonical_model_id || item?.id) {
    const k = String(item.canonical_model_id || item.id).toLowerCase().replace(/^stihl_/, '');
    gscScoreByModel.set(k, Number(item.clicks || item.impressions || item.priority_score || 50));
  }
}

const uncoveredFitModels = new Set();
const thinModels = new Set();
const partPriorityMeta = new Map();

for (const m of (stihlDb.models || [])) {
  const c = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const alt = m.id.toLowerCase();
  const sAlt = alt.replace(/^stihl_/, '');
  const sAll = modelPartsAll.get(c) || modelPartsAll.get(alt) || modelPartsAll.get(sAlt) || new Set();
  const covCount = [...sAll].filter(p => activeParts.has(p)).length;
  const gsc = gscScoreByModel.get(sAlt) || gscScoreByModel.get(c) || 0;
  if (sAll.size > 0 && covCount === 0) uncoveredFitModels.add(sAlt);
  else if (covCount >= 1 && covCount <= 5) thinModels.add(sAlt);

  for (const pn of sAll) {
    if (!partPriorityMeta.has(pn)) partPriorityMeta.set(pn, { uncov: [], thin: [], gsc: 0, models: 0 });
    const meta = partPriorityMeta.get(pn);
    meta.models++;
    meta.gsc = Math.max(meta.gsc, gsc);
    if (sAll.size > 0 && covCount === 0) meta.uncov.push(m.id);
    else if (covCount >= 1 && covCount <= 5) meta.thin.push(m.id);
  }
}

// Load Phase 87..94 caches read-only
const shAllNl = {}, shAllDe = {}, ckAllNl = {}, ckAllDe = {};
const PHASES = ['phase87', 'phase87_1', 'phase87_2', 'phase87_3', 'phase88', 'phase89', 'phase90', 'phase92', 'phase93', 'phase94'];
for (const ph of PHASES) {
  Object.assign(shAllNl, readOpt(`output/${ph}/search_hits_amazon_nl.json`, {}));
  Object.assign(shAllDe, readOpt(`output/${ph}/search_hits_amazon_de.json`, {}));
  Object.assign(ckAllNl, readOpt(`output/${ph}/product_checks_amazon_nl.json`, {}));
  Object.assign(ckAllDe, readOpt(`output/${ph}/product_checks_amazon_de.json`, {}));
}

// 1. Collect /dp/ checks needed on NL and DE:
//    - Exact 11-digit MPN search hits on 0-ACTIVE parts (or open 572 slots) that are UNCACHED or NOT_LISTED_200 or OOS
//    - Also all Phase 94 NOT_LISTED_HTTP_200 on 0-ACTIVE parts or open 572 slots
const dpQueueNl = new Map();
const dpQueueDe = new Map();

function addDpTarget(mkt, asin, pn, reasonTag, priorityScore) {
  if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) return;
  if (activeByAsinMkt.has(`${mkt}|${asin}`)) return;
  const map = mkt === 'amazon.de' ? dpQueueDe : dpQueueNl;
  const prev = map.get(asin);
  if (!prev || priorityScore > prev.priorityScore) {
    map.set(asin, { asin, mkt, part_number: pn, reasonTag, priorityScore });
  }
}

for (const [mkt, shMap, ckMap] of [['amazon.nl', shAllNl, ckAllNl], ['amazon.de', shAllDe, ckAllDe]]) {
  for (const [pn, rec] of Object.entries(shMap)) {
    if (activeParts.has(pn)) continue;
    const meta = partPriorityMeta.get(pn) || { uncov: [], thin: [], gsc: 0, models: 0 };
    const prio = (meta.uncov.length ? 1000 : 0) + (meta.thin.length ? 200 : 0) + meta.models * 2 + Math.min(meta.gsc, 100);
    for (const h of (rec.hits || [])) {
      if (h.sponsored || !h.asin || !/^B[0-9A-Z]{9}$/.test(h.asin)) continue;
      if (!digits(h.title).includes(pn)) continue;
      const ck = ckMap[h.asin];
      if (!ck) addDpTarget(mkt, h.asin, pn, 'EXACT_HIT_UNCACHED', prio + 50);
      else if (!ck.listed && !ck.isDead && ck.http_status === 200) addDpTarget(mkt, h.asin, pn, 'NOT_LISTED_HTTP_200', prio + 40);
      else if (ck.listed && !ck.hasAddCart) addDpTarget(mkt, h.asin, pn, 'EXACT_HIT_OOS_RECHECK', prio + 10);
      else if (ck.listed && !ck.techSpecs) addDpTarget(mkt, h.asin, pn, 'MISSING_TECH_SPECS', prio + 20);
    }
  }
}

// Add 572 recoverable pool ASINs where NOT_LISTED_200, OOS, or missing techSpecs
const nePool = readOpt('output/phase93/needs_evidence_pool.json', { items: [] }).items || [];
const open572Slots = new Set();
for (const it of nePool) {
  const pn = norm(it.part_number);
  const mkt = it.mkt || 'amazon.nl';
  if (!pn || activeBySlot.has(`${pn}|${mkt}`)) continue;
  open572Slots.add(`${pn}|${mkt}`);
  const ck = (mkt === 'amazon.de' ? ckAllDe : ckAllNl)[it.asin];
  const isZero = !activeParts.has(pn);
  const prio = (isZero ? 500 : 100) + (partPriorityMeta.get(pn)?.models || 0);
  if (!ck) addDpTarget(mkt, it.asin, pn, 'POOL572_UNCACHED', prio);
  else if (!ck.listed && !ck.isDead && ck.http_status === 200) addDpTarget(mkt, it.asin, pn, 'POOL572_NOT_LISTED_200', prio);
  else if (ck.listed && !ck.hasAddCart) addDpTarget(mkt, it.asin, pn, 'POOL572_OOS_RECHECK', prio - 20);
  else if (ck.listed && !ck.techSpecs) addDpTarget(mkt, it.asin, pn, 'POOL572_NO_TECH_SPECS', prio);
}

// Also re-check Phase 94 NOT_LISTED_200 ASINs mapped to 0-ACTIVE parts from batch_0..19
const p94Nl = readOpt('output/phase94/product_checks_amazon_nl.json', {});
const p94De = readOpt('output/phase94/product_checks_amazon_de.json', {});
for (const bf of fs.readdirSync(path.join(ROOT, 'output/phase94/batches')).filter(f => f.endsWith('.json'))) {
  const b = readOpt(`output/phase94/batches/${bf}`, {});
  for (const it of (b.needs_evidence || [])) {
    if (activeParts.has(it.part_number)) continue;
    if (it.reason === 'NOT_LISTED_HTTP_200') {
      const mkt = it.mkt || 'amazon.nl';
      const meta = partPriorityMeta.get(it.part_number) || { uncov: [], thin: [], models: 0 };
      const prio = (meta.uncov.length ? 900 : 300) + meta.models;
      addDpTarget(mkt, it.asin, it.part_number, 'P94_BATCH_NOT_LISTED_200', prio);
    }
  }
}

// 2. Targeted search retries ONLY for:
//    (a) 0-ACTIVE parts on the 36 uncovered fitment models whose existing search had 0 non-exact hits or never tried unprefixed formatted MPN
//    (b) Top 572-pool 0-ACTIVE parts on thin/GSC models where original ASIN failed (no exact ASIN found yet)
const searchQueue = [];
const addedSearch = new Set();
const p94AltDone = new Set(
  (readOpt('output/phase94/batches/batch_alt_recovery.json', {}).needs_evidence || []).map(x => x.part_number)
);

for (const [pn, meta] of partPriorityMeta.entries()) {
  if (activeParts.has(pn) || addedSearch.has(pn)) continue;
  const isUncov = meta.uncov.length > 0;
  const inNe572 = open572Slots.has(`${pn}|amazon.nl`) || open572Slots.has(`${pn}|amazon.de`);
  if (!isUncov && !inNe572) continue;

  const nlHits = (shAllNl[pn]?.hits || []).filter(h => !h.sponsored && digits(h.title).includes(pn));
  const deHits = (shAllDe[pn]?.hits || []).filter(h => !h.sponsored && digits(h.title).includes(pn));
  if (nlHits.length > 0 && deHits.length > 0) continue; // Already has exact hits on both marketplaces!

  const partName = catalogNames.get(pn) || '';
  if (/^(?:screw|nut|bolt|washer|circlip|e-clip|pin|rivet|sleeve|spacer|shim|stud)\b/i.test(partName) && !isUncov) continue;

  const formatted = formatPart(pn);
  const queries = [formatted, `STIHL ${formatted}`];
  searchQueue.push({
    part_number: pn,
    part_name: partName,
    priority: isUncov ? 'P1_UNCOVERED_MODEL' : 'P2_NE572_RECOVERY',
    uncovered_models: meta.uncov,
    thin_models_count: meta.thin.length,
    models_count: meta.models,
    need_nl: nlHits.length === 0,
    need_de: deHits.length === 0,
    queries
  });
  addedSearch.add(pn);
}

searchQueue.sort((a, b) => {
  if (a.priority !== b.priority) return a.priority === 'P1_UNCOVERED_MODEL' ? -1 : 1;
  return b.models_count - a.models_count;
});

const dpListNl = [...dpQueueNl.values()].sort((a, b) => b.priorityScore - a.priorityScore);
const dpListDe = [...dpQueueDe.values()].sort((a, b) => b.priorityScore - a.priorityScore);

const queueDoc = {
  phase: '95',
  generated_at: new Date().toISOString(),
  summary: {
    uncovered_fitment_models_remaining: uncoveredFitModels.size,
    thin_models_1_to_5: thinModels.size,
    open_572_slots: open572Slots.size,
    dp_recheck_nl: dpListNl.length,
    dp_recheck_de: dpListDe.length,
    targeted_search_parts: searchQueue.length,
    targeted_search_p1_uncovered: searchQueue.filter(x => x.priority === 'P1_UNCOVERED_MODEL').length,
    targeted_search_p2_ne572: searchQueue.filter(x => x.priority === 'P2_NE572_RECOVERY').length
  },
  dp_nl: dpListNl,
  dp_de: dpListDe,
  search_parts: searchQueue
};

fs.writeFileSync(path.join(OUT95, 'queue.json'), JSON.stringify(queueDoc, null, 2) + '\n', 'utf8');
console.log('Phase 95 Queue Summary:', queueDoc.summary);
