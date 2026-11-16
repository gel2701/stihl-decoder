/**
 * scripts/phase88_build_queue.mjs
 *
 * Phase 88: Builds two structured, resumable work queues:
 *   1. batch0_existing_pool: All remaining unchecked ASINs / alternative hits from Phase 87.1–87.3
 *      plus the 26 remaining NEEDS_EVIDENCE candidates (23 RESEARCH_REQUIRED + 3 VERIFIED DE).
 *   2. queue_1000 (Batches 1..9, 125 parts per batch = 1,125+ parts):
 *      Uncovered catalog parts never yet fully searched across NL & DE, prioritized by:
 *        - GSC priority models & models with low direct buy-link coverage
 *        - High-intent wear/service categories
 *        - Proven eBay EXACT_MPN matches
 *        - Canonical STIHL supersession mappings (`superseded_by`)
 *
 * Output: output/phase88/queue.json
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'output', 'phase88');
fs.mkdirSync(OUT, { recursive: true });

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const readOpt = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fb; } };

const registry = read('data/affiliate/verified_amazon_registry.json');
const catalogDoc = read('data/parts_catalog.json');
const catalog = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const priorityModels = read('output/phase81/PHASE81_PRIORITY_MODELS.json').models || [];
const ebayOffers = readOpt('output/phase86/ebay_offers_phase86.json', { offers: [] }).offers || [];
const fitmentIndex = read('data/model_part_fitments.json');

const hitsNlPrev = {
  ...readOpt('output/phase87_1/search_hits_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/search_hits_amazon_nl.json', {})
};
const hitsDePrev = readOpt('output/phase87_2/search_hits_amazon_de.json', {});
const checksNlPrev = {
  ...readOpt('output/phase87_1/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_2/product_checks_amazon_nl.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_nl.json', {})
};
const checksDePrev = {
  ...readOpt('output/phase87_2/product_checks_amazon_de.json', {}),
  ...readOpt('output/phase87_3/product_checks_amazon_de.json', {})
};
const unchecked873 = readOpt('output/phase87_3/unchecked_queue.json', { nl: [], de: [] });

const norm = p => PartNormalizer.normalizePartNumber(p);
const formatPart = p => {
  const m = String(p).match(/^(\d{4})(\d{3})(\d{4})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : String(p);
};

const activeOffers = registry.offers.filter(o => o.status === 'ACTIVE');
const activeParts = new Set(activeOffers.map(o => norm(o.part_number)));
const activeByPartMkt = new Set(activeOffers.map(o => `${norm(o.part_number)}:${(o.marketplace || 'amazon.nl').toLowerCase()}`));
const suspendedParts = new Set(registry.offers.filter(o => o.status === 'SUSPENDED').map(o => norm(o.part_number)));
const needsEvidenceRecords = registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED' || o.status === 'VERIFIED');
const needsEvidenceParts = new Set(needsEvidenceRecords.map(o => norm(o.part_number)));

const modelMetaByFid = new Map();
for (const m of priorityModels) {
  const fid = m.fitment_id || (m.canonical_model_id ? m.canonical_model_id.replace(/^stihl_/, '') : null);
  if (fid) modelMetaByFid.set(fid, m);
}

// Compute current direct coverage per GSC model & part fitments + supersessions
const partsByModelFid = new Map();
const modelsByPart = new Map();
const supersessionsByPart = new Map();

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
    if (modelMetaByFid.has(fid)) {
      if (!partsByModelFid.has(fid)) partsByModelFid.set(fid, new Set());
      partsByModelFid.get(fid).add(pn);
      if (!modelsByPart.has(pn)) modelsByPart.set(pn, new Set());
      modelsByPart.get(pn).add(fid);
    }
  }
}

const modelCoverageRatio = new Map();
for (const [fid, partSet] of partsByModelFid.entries()) {
  let covered = 0;
  for (const pn of partSet) {
    if (activeParts.has(pn)) covered++;
  }
  modelCoverageRatio.set(fid, partSet.size > 0 ? covered / partSet.size : 1);
}

const ebayExactParts = new Set();
for (const e of ebayOffers) {
  if (e.status === 'ACTIVE' || e.match_type === 'EXACT_MPN') {
    const pn = norm(e.part_number);
    if (pn) ebayExactParts.add(pn);
  }
}

// High-intent maintenance/wear category scoring (explicitly exclude generic bolts/nuts/washers unless high GSC/assembly)
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

// 1. Batch 0: Remaining existing unchecked ASINs + all 26 NEEDS_EVIDENCE parts
const batch0PartsSet = new Set();
for (const r of needsEvidenceRecords) batch0PartsSet.add(norm(r.part_number));
for (const r of (unchecked873.nl || [])) batch0PartsSet.add(norm(r.part_number));
for (const r of (unchecked873.de || [])) batch0PartsSet.add(norm(r.part_number));

// 2. Score uncovered catalog parts for New Search Queue (>= 1,150 parts)
const scoredParts = [];
for (const p of catalog) {
  const pn = norm(p.part_number);
  if (!pn || pn.length !== 11) continue;
  const alreadySearchedNl = Boolean(hitsNlPrev[pn]);
  const alreadySearchedDe = Boolean(hitsDePrev[pn]);
  // Skip parts that ALREADY have BOTH NL and DE active offers
  if (activeByPartMkt.has(`${pn}:amazon.nl`) && activeByPartMkt.has(`${pn}:amazon.de`)) continue;
  // For the new search round, exclude parts already searched in BOTH NL and DE (unless unresolved NEEDS_EVIDENCE)
  if (alreadySearchedNl && alreadySearchedDe && !needsEvidenceParts.has(pn)) continue;

  const fids = Array.from(modelsByPart.get(pn) || []);
  const supList = Array.from(supersessionsByPart.get(pn) || []);
  const name = p.part_name || '';

  let score = 0;
  // GSC impressions + low-coverage model boost
  let gscScore = 0;
  const modelNames = [];
  for (const fid of fids) {
    const meta = modelMetaByFid.get(fid);
    if (!meta) continue;
    modelNames.push({ name: meta.model_name, imp: Number(meta.gsc_impressions) || 0 });
    const covRatio = modelCoverageRatio.get(fid) ?? 0.5;
    const lowCovBoost = Math.max(0, (0.25 - covRatio) * 120);
    gscScore += Math.min(80, Math.sqrt(Number(meta.gsc_impressions) || 4) * 3.5) + lowCovBoost * 0.25;
  }
  modelNames.sort((a, b) => b.imp - a.imp);
  score += Math.min(220, gscScore);

  if (!activeParts.has(pn)) score += 60; // Strongly prefer parts with ZERO active Amazon offer yet
  if (needsEvidenceParts.has(pn)) score += 90;
  if (suspendedParts.has(pn) && !activeParts.has(pn)) score += 75;
  if (ebayExactParts.has(pn)) score += 55;
  if (supList.length > 0) score += 25;

  if (HIGH_INTENT_RE.test(name)) score += 70;
  else if (MED_INTENT_RE.test(name)) score += 35;
  else if (LOW_HARDWARE_RE.test(name)) score -= 45;

  // Prefer multi-model popular fitment
  score += Math.min(30, fids.length * 4);
  if ((p.source_count || 0) >= 2) score += 10;

  if (score <= 5 && fids.length === 0) continue; // Skip obscure zero-fitment hardware bolts unless high value

  scoredParts.push({
    part_number: pn,
    part_display: formatPart(pn),
    part_name: name,
    score: Math.round(score * 10) / 10,
    has_active_any: activeParts.has(pn),
    has_active_nl: activeByPartMkt.has(`${pn}:amazon.nl`),
    has_active_de: activeByPartMkt.has(`${pn}:amazon.de`),
    already_searched_nl: alreadySearchedNl,
    already_searched_de: alreadySearchedDe,
    needs_evidence: needsEvidenceParts.has(pn),
    ebay_exact: ebayExactParts.has(pn),
    top_models: modelNames.slice(0, 5).map(m => m.name),
    supersessions: supList,
    queries: buildVariants(pn, name, modelNames.map(m => m.name), supList)
  });
}

scoredParts.sort((a, b) => b.score - a.score);

// Target >= 1,125 parts split into 9 batches of 125 (100-150 range per prompt)
const newSearchQueue = scoredParts.filter(r => !r.already_searched_nl || !r.already_searched_de).slice(0, 1125);
const BATCH_SIZE = 125;
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
  existing_pool_unchecked: {
    nl_count: (unchecked873.nl || []).length,
    de_count: (unchecked873.de || []).length,
    needs_evidence_parts: Array.from(needsEvidenceParts)
  },
  new_search_total: newSearchQueue.length,
  batch_size: BATCH_SIZE,
  batch_count: batches.length,
  batches
};

fs.writeFileSync(path.join(OUT, 'queue.json'), JSON.stringify(outDoc, null, 1) + '\n', 'utf8');
console.log({
  candidate_pool_scored: scoredParts.length,
  new_search_queued: newSearchQueue.length,
  never_searched_nl: newSearchQueue.filter(x => !x.already_searched_nl).length,
  never_searched_de: newSearchQueue.filter(x => !x.already_searched_de).length,
  completely_new_parts: newSearchQueue.filter(x => !x.has_active_any).length,
  batches: batches.map(b => `${b.batch_id}:${b.count}`),
  top10: newSearchQueue.slice(0, 10).map(x => `${x.part_number}(${x.score}|${x.part_name.slice(0,30)}|${x.top_models.slice(0,2).join(',')})`)
});
