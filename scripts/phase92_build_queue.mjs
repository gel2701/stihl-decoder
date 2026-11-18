/**
 * scripts/phase92_build_queue.mjs
 *
 * Phase 92: Affiliate Coverage Expansion
 * Prioritizes all 507 canonical STIHL models using saved GSC metrics (PHASE81_PRIORITY_MODELS.json
 * & PHASE77D_GSC_INVENTORY.json — live GSC API not configured locally), closes the 17 uncovered
 * fitment models, and recovers existing Phase 87-90 search/NEEDS_EVIDENCE/RESEARCH_REQUIRED pools.
 *
 * Output: output/phase92/queue.json
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT92 = path.join(ROOT, 'output', 'phase92');
fs.mkdirSync(OUT92, { recursive: true });

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

const PROTECTED_RECORD_ASINS = new Set([
  'B00IKF8TH8',
  'B013KONKZY',
  'B00SVDWDRG',
  'B00LAHKSDQ'
]);

const WEAR_RE = /carburet|carburateur|spark plug|bougie|air filter|filter|chain sprocket|sprocket|clutch|koppeling|rewind starter|starter|ignition|coil|cylinder|piston|zuiger|muffler|uitlaat|oil pump|oliepomp|fuel hose|fuel line|fuel|tank|cap|av|buffer|gasket|seal|diaphragm|primer|choke|throttle|brake|tensioner|bearing|crankshaft|flywheel|fan|gear|head|blade|deflector|nozzle|handle|switch|valve|pawl|spring|ring|bar|guide|chain/i;
const GENERIC_TINY_HARDWARE_RE = /^(?:screw|nut|bolt|washer|circlip|e-clip|pin|rivet|sleeve|spacer|shim|stud|plug)\b/i;

const registry = read('data/affiliate/verified_amazon_registry.json');
const stihlDb = read('data/stihl_database.json');
const catalogDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const priorityModels = read('output/phase81/PHASE81_PRIORITY_MODELS.json').models || [];
const ebay86Offers = readOpt('output/phase86/ebay_offers_phase86.json', { offers: [] }).offers || [];

const searchNl = {
  ...readOpt('output/phase87_1/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase88/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase89/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase90/search_hits_amazon_nl.json', {})
};
const searchDe = {
  ...readOpt('output/phase87_2/search_hits_amazon_de.json', {}),
  ...readOpt('output/phase88/search_hits_amazon_de.json', {}),
  ...readOpt('output/phase89/search_hits_amazon_de.json', {}),
  ...readOpt('output/phase90/search_hits_amazon_de.json', {})
};
const checksNl = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase88/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase89/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase90/product_checks_amazon_nl.json', {})
};
const checksDe = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase88/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase89/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase90/product_checks_amazon_de.json', {})
};

const activeOffers = registry.offers.filter(o => o.status === 'ACTIVE');
const activeByPartMkt = new Set();
const activeCountByPart = new Map();
const activeParts = new Set();
for (const o of activeOffers) {
  const pn = norm(o.part_number);
  const mkt = (o.marketplace || 'amazon.nl').toLowerCase();
  activeByPartMkt.add(`${pn}|${mkt}`);
  activeCountByPart.set(pn, (activeCountByPart.get(pn) || 0) + 1);
  activeParts.add(pn);
}

// SQLite fitments + 507 canonical models coverage
const sqlDb = new Database(path.join(ROOT, 'data/stihl_database.db'), { readonly: true });
const fitRows = sqlDb.prepare("SELECT DISTINCT canonical_model_id, part_number FROM model_part_fitments WHERE source_id != 'ghs'").all();
sqlDb.close();

const modelParts = new Map();
const partFitModels = new Map();
for (const r of fitRows) {
  const pn = norm(r.part_number);
  if (!modelParts.has(r.canonical_model_id)) modelParts.set(r.canonical_model_id, new Set());
  modelParts.get(r.canonical_model_id).add(pn);
  if (!partFitModels.has(pn)) partFitModels.set(pn, new Set());
  partFitModels.get(pn).add(r.canonical_model_id);
}

const uncoveredCanonicalModelFids = new Set();
const uncoveredModelNames = [];
const allDbModelFids = new Set();
for (const m of (stihlDb.models || [])) {
  const c = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const alt = m.id.toLowerCase();
  const shortAlt = alt.replace(/^stihl_/, '');
  const fid = modelParts.has(c) ? c : (modelParts.has(alt) ? alt : (modelParts.has(shortAlt) ? shortAlt : c));
  allDbModelFids.add(fid);
  const pSet = modelParts.get(fid) || new Set();
  if (pSet.size > 0) {
    let covered = 0;
    for (const pn of pSet) if (activeParts.has(pn)) covered++;
    if (covered === 0) {
      uncoveredCanonicalModelFids.add(fid);
      uncoveredModelNames.push(m.model_name);
    }
  }
}

const gscByFid = new Map();
for (const m of priorityModels) {
  const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
  if (fid) gscByFid.set(fid, { impressions: m.gsc_impressions || 0, clicks: m.gsc_clicks || 0, model_name: m.model_name });
}

const ebayKnownParts = new Set(ebay86Offers.map(o => norm(o.part_number)));

// 1. Existing pool & NEEDS_EVIDENCE / RESEARCH_REQUIRED / unchecked search-hit recovery (batch_0)
const nlRecoveryPairs = [];
const deRecoveryPairs = [];
const seenRec = new Set();
const pushRec = (list, pn, mkt, asin, reason) => {
  if (!pn || !asin || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`) || PROTECTED_RECORD_ASINS.has(asin)) return;
  if (activeByPartMkt.has(`${pn}|${mkt}`)) return;
  const k = `${pn}|${mkt}|${asin}`;
  if (seenRec.has(k)) return;
  seenRec.add(k);
  list.push({ part_number: pn, mkt, asin, reason });
};

// 1a. Phase 90 logged OUT_OF_STOCK_OR_NO_BUYBOX NEEDS_EVIDENCE
const p90BatchDir = path.join(ROOT, 'output/phase90/batches');
for (const bf of fs.readdirSync(p90BatchDir).filter(f => f.endsWith('.json'))) {
  const b = readOpt(path.join('output/phase90/batches', bf), null);
  for (const x of (b?.needs_evidence || [])) {
    if (x.part_number && x.asin) {
      pushRec(x.mkt === 'amazon.de' ? deRecoveryPairs : nlRecoveryPairs, norm(x.part_number), x.mkt, x.asin, 'P90_NEEDS_EVIDENCE_RETRY');
    }
  }
}

// 1b. Registry RESEARCH_REQUIRED
for (const o of registry.offers) {
  if (o.status === 'RESEARCH_REQUIRED' && o.asin) {
    const mkt = o.marketplace || 'amazon.nl';
    pushRec(mkt === 'amazon.de' ? deRecoveryPairs : nlRecoveryPairs, norm(o.part_number), mkt, o.asin, 'REGISTRY_RESEARCH_REQUIRED_RETRY');
  }
}

// 1c. Unchecked ASINs in Phase 87..90 search hits (prioritize MPN-in-title first, then good brand hits)
for (const [mkt, hitsMap, dpMap, outList] of [
  ['amazon.nl', searchNl, checksNl, nlRecoveryPairs],
  ['amazon.de', searchDe, checksDe, deRecoveryPairs]
]) {
  for (const [k, rec] of Object.entries(hitsMap)) {
    const pn = norm(k.split('|')[0]);
    if (!pn || activeByPartMkt.has(`${pn}|${mkt}`) || PROTECTED_PINNED_SLOTS.has(`${pn}|${mkt}`)) continue;
    const fmt1 = formatPart(pn);
    for (const h of (rec.hits || [])) {
      const asin = h.asin;
      if (!asin || !/^B[0-9A-Z]{9}$/i.test(asin)) continue;
      if (dpMap[asin]) continue; // Already checked
      const t = h.title || '';
      const hasMpn = digits(t).includes(pn);
      const hasBrand = /stihl|s[äa]genspezi|oregon|walbro|zama|ngk|bosch|vhbw|hippotech|cancanle|mchnic|adefol|huyur|c\.?t\.?s|propart|ototec|jardiaffaires|perfektgarten|qhalen/i.test(t);
      if (hasMpn || hasBrand) {
        pushRec(outList, pn, mkt, asin, hasMpn ? 'CACHED_SEARCH_MPN_UNCHECKED' : 'CACHED_SEARCH_BRAND_UNCHECKED');
      }
    }
  }
}

// 2. Build prioritized new discovery batches across all 507 canonical models & catalog wear parts
const catalogByPn = new Map();
for (const c of catalog) {
  const pn = norm(c.part_number);
  if (pn && pn.length === 11) catalogByPn.set(pn, c);
}

const candidates = [];
for (const [pn, c] of catalogByPn.entries()) {
  const hasNl = activeByPartMkt.has(`${pn}|amazon.nl`) || PROTECTED_PINNED_SLOTS.has(`${pn}|amazon.nl`);
  const hasDe = activeByPartMkt.has(`${pn}|amazon.de`) || PROTECTED_PINNED_SLOTS.has(`${pn}|amazon.de`);
  if (hasNl && hasDe) continue;

  const fids = partFitModels.get(pn) || new Set();
  const fitsUncoveredModel = Array.from(fids).some(fid => uncoveredCanonicalModelFids.has(fid));
  let gscImp = 0;
  let gscClicks = 0;
  let gscModelsCount = 0;
  for (const fid of fids) {
    const g = gscByFid.get(fid);
    if (g) {
      gscImp += g.impressions || 0;
      gscClicks += g.clicks || 0;
      gscModelsCount++;
    }
  }
  const activeCount = activeCountByPart.get(pn) || 0;
  const partName = c.part_name || '';
  const isWear = WEAR_RE.test(partName);
  const isTinyHw = GENERIC_TINY_HARDWARE_RE.test(partName.trim());
  const fitsLegacy0xx = Array.from(fids).some(fid => /^0\d\d/.test(fid));
  const nlCached = !!searchNl[pn];
  const deCached = !!searchDe[pn];

  let tier = 'P4_OTHER_CATALOG';
  if (fitsUncoveredModel) tier = 'P1_UNCOVERED_MODELS';
  else if (activeCount === 0 && (gscImp > 0 || gscModelsCount > 0 || fitsLegacy0xx)) tier = 'P2_GSC_OR_0XX_ZERO_OFFER';
  else if (activeCount === 1) tier = 'P3_SINGLE_MARKETPLACE_EXPAND';
  else if (activeCount === 0 && isWear && !isTinyHw) tier = 'P4_WEAR_REPAIR_ZERO_OFFER';
  else if (!isTinyHw && fids.size >= 2) tier = 'P5_MULTI_MODEL_CATALOG';
  else continue;

  const score =
    (fitsUncoveredModel ? 50000 : 0) +
    (activeCount === 0 ? 10000 : 2000) +
    (gscImp * 10) +
    (gscClicks * 120) +
    (fitsLegacy0xx ? 2500 : 0) +
    (isWear ? 1500 : 0) +
    (isTinyHw ? -2000 : 0) +
    (ebayKnownParts.has(pn) ? 600 : 0) +
    (fids.size * 180) +
    ((!hasNl && !nlCached) || (!hasDe && !deCached) ? 300 : 0);

  const fmt = formatPart(pn);
  const word = (partName.split(/[\s,/()-]+/).find(w => w.length >= 4 && !/^\d+$/.test(w)) || '').trim();
  candidates.push({
    part_number: pn,
    part_name: partName,
    tier,
    score,
    active_count: activeCount,
    needs_nl: !hasNl,
    needs_de: !hasDe,
    fits_uncovered_model: fitsUncoveredModel,
    fits_legacy_0xx: fitsLegacy0xx,
    gsc_impressions: gscImp,
    gsc_clicks: gscClicks,
    model_count: fids.size,
    queries: [
      `STIHL ${fmt}`,
      pn,
      word ? `${fmt} ${word}` : fmt
    ]
  });
}

candidates.sort((a, b) => b.score - a.score || a.part_number.localeCompare(b.part_number));

// Build batch_0 recovery + priority discovery batches (batch_1..batch_15 x 120 parts = 1,800 prioritized parts)
const BATCH_SIZE = 120;
const MAX_BATCHES = 15;
const selected = candidates.slice(0, BATCH_SIZE * MAX_BATCHES);
const batches = [];
for (let i = 0; i < MAX_BATCHES; i++) {
  const slice = selected.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
  if (slice.length === 0) break;
  batches.push({ batch_id: `batch_${i + 1}`, parts: slice });
}

const tierBreakdown = {};
for (const c of selected) tierBreakdown[c.tier] = (tierBreakdown[c.tier] || 0) + 1;

const queueDoc = {
  generated_at: new Date().toISOString(),
  phase: '92',
  gsc_source: {
    live_gsc_configured: false,
    limitation_note: 'Google Search Console API credentials are not configured locally; prioritized using stored PHASE81_PRIORITY_MODELS.json & PHASE77D_GSC_INVENTORY.json + all 507 canonical model fitments.'
  },
  baseline: {
    canonical_models: (stihlDb.models || []).length,
    uncovered_fitment_models_count: uncoveredCanonicalModelFids.size,
    uncovered_fitment_models: uncoveredModelNames,
    active_total: activeOffers.length,
    active_nl: activeOffers.filter(o => (o.marketplace || 'amazon.nl') === 'amazon.nl').length,
    active_de: activeOffers.filter(o => o.marketplace === 'amazon.de').length,
    unique_parts: activeParts.size
  },
  existing_pool_recovery: {
    nl_pairs_count: nlRecoveryPairs.length,
    de_pairs_count: deRecoveryPairs.length,
    nl_pairs: nlRecoveryPairs,
    de_pairs: deRecoveryPairs
  },
  selected_total: selected.length,
  tier_breakdown: tierBreakdown,
  batch_size: BATCH_SIZE,
  batch_count: batches.length,
  batches
};

fs.writeFileSync(path.join(OUT92, 'queue.json'), JSON.stringify(queueDoc, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  baseline: queueDoc.baseline,
  existing_pool_recovery: {
    nl_pairs_count: nlRecoveryPairs.length,
    de_pairs_count: deRecoveryPairs.length
  },
  selected_total: selected.length,
  tier_breakdown: tierBreakdown,
  batch_count: batches.length
}, null, 2));
