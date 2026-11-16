/**
 * Phase 87.2 — Builds the resumable Phase 87.2 work queues:
 *   1. existing_research: the 34 RESEARCH_REQUIRED records + 3 VERIFIED (amazon.de) records
 *   2. phase87_1_remaining: parts from Phase 87.1 that already found candidate ASINs on Amazon.nl
 *      (not yet activated or rejected)
 *   3. next_unhandled_500: the next 500+ prioritized catalog parts not yet searched in Phase 87.1
 *      and without an ACTIVE Amazon offer, ranked by GSC priority models, eBay EXACT_MPN,
 *      SUSPENDED recovery, maintenance keywords, and known supersessions.
 *
 * Output: output/phase87_2/queue.json
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > 0 ? Number(process.argv[i + 1]) : 500;
})();

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const write = (p, v) => {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 1) + '\n');
};

const catalog = read('data/parts_catalog.json').parts;
const registry = read('data/affiliate/verified_amazon_registry.json');
const ebay = read('output/phase86/ebay_offers_phase86.json').offers;
const priorityModels = read('output/phase81/PHASE81_PRIORITY_MODELS.json').models;
const search871 = read('output/phase87_1/search_hits_amazon_nl.json');
const sel871 = read('output/phase87_1/selection_plan.json');
const act871 = read('output/phase87_1/PHASE87_1_ACTIVATION.json');

const norm = p => PartNormalizer.normalizePartNumber(p);
const nameOf = Object.fromEntries(catalog.map(p => [norm(p.part_number), p.part_name]));
const displayOf = Object.fromEntries(catalog.map(p => [norm(p.part_number), p.part_number_display]));

const activeAmazonParts = new Set(
  registry.offers.filter(o => o.status === 'ACTIVE').map(o => norm(o.part_number))
);
const searched871Parts = new Set(Object.keys(search871).map(norm));

const CORE_WEAR_WORDS = [
  'air filter', 'fuel filter', 'oil filter', 'spark plug', 'carburetor', 'carburettor',
  'chain', 'guide bar', 'bar ', 'cylinder', 'piston', 'ignition', 'coil', 'clutch',
  'sprocket', 'rim', 'starter', 'rewind', 'oil pump', 'muffler', 'autocut', 'polycut',
  'durocut', 'mowing head', 'blade', 'flywheel', 'crankshaft', 'service kit'
];
const MAINTENANCE_WORDS = [
  'filter', 'spark plug', 'plug', 'chain', 'bar', 'starter', 'rewind', 'carburetor', 'carburettor',
  'sprocket', 'clutch', 'piston', 'cylinder', 'gasket', 'oil pump', 'ignition', 'coil', 'seal',
  'bearing', 'rope', 'fuel line', 'muffler', 'cap', 'valve', 'membrane', 'diaphragm', 'needle',
  'air filter', 'fuel filter', 'rim', 'guide', 'screw', 'spring', 'handle', 'throttle', 'switch',
  'mower', 'blade', 'spool', 'head', 'autocut', 'polycut', 'durocut', 'line', 'hose', 'intake'
];

const fitmentIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model_part_fitments.json'), 'utf8'));
const modelIdOfName = Object.fromEntries(
  priorityModels.filter(m => m.canonical_model_id).map(m => [m.model_name.toLowerCase(), m.canonical_model_id])
);
const PRIORITY_MODEL_IDS = Object.fromEntries(
  ['ms_170', 'ms_180', 'ms_250', 'ms_260', 'ms_261', 'ms_361', 'ms_440', 'ms_461', 'ms_661',
    'fs_55', 'fs_85', 'fs_350', 'fs_460', 'br_600', 'bg_86', 'hs_45', 'ts_420',
    ...Object.values(modelIdOfName)].map(id => [id, true])
);
const impressionsByModelId = {};
for (const m of priorityModels) {
  if (m.canonical_model_id && Number(m.gsc_impressions)) {
    impressionsByModelId[m.canonical_model_id] = Math.max(
      impressionsByModelId[m.canonical_model_id] || 0, Number(m.gsc_impressions));
  }
}

async function scanFitments() {
  const partsByModel = {};
  const priorityHits = [];
  const supersessions = new Map();
  for (const shard of fitmentIndex.shard_files) {
    const stream = fs.createReadStream(path.join(ROOT, 'data', shard)).pipe(zlib.createGunzip());
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.superseded_by) {
        const key = norm(rec.part_number);
        if (!supersessions.has(key)) supersessions.set(key, new Set());
        supersessions.get(key).add(norm(rec.superseded_by));
      }
      if (!rec.canonical_model_id || !PRIORITY_MODEL_IDS[rec.canonical_model_id]) continue;
      const part = norm(rec.part_number);
      (partsByModel[part] ||= new Set()).add(rec.canonical_model_id);
    }
  }
  for (const [part, models] of Object.entries(partsByModel)) {
    const weight = [...models].reduce((sum, id) => sum + (impressionsByModelId[id] || 5), 0);
    priorityHits.push({ part, models: [...models], weight });
  }
  return { priorityHits, supersessions };
}

const ebayByPart = {};
for (const offer of ebay) {
  if (offer.status !== 'ACTIVE') continue;
  const part = norm(offer.part_number);
  (ebayByPart[part] ||= []).push({
    item_id: offer.item_id,
    match_type: offer.match_type,
    title: offer.title,
    mpn: offer.mpn,
    brand: offer.brand,
    vendor: offer.vendor,
    url: offer.item_url
  });
}

const suspendedParts = new Set(registry.offers.filter(o => o.status === 'SUSPENDED').map(o => norm(o.part_number)));
const researchParts = new Set(registry.offers.filter(o => o.status === 'RESEARCH_REQUIRED').map(o => norm(o.part_number)));

const { priorityHits, supersessions } = await scanFitments();

const rows = new Map();
const touch = part => {
  if (!rows.has(part)) {
    rows.set(part, {
      part_number: part,
      part_display: displayOf[part] || part,
      part_name: nameOf[part] || null,
      score: 0,
      reasons: [],
      priority_models: [],
      ebay: ebayByPart[part] || null,
      superseded_by: supersessions.has(part) ? [...supersessions.get(part)] : null
    });
  }
  return rows.get(part);
};

for (const part of Object.keys(ebayByPart)) {
  const exact = ebayByPart[part].some(o => o.match_type === 'EXACT_MPN');
  if (exact) {
    const r = touch(part);
    r.score += 100;
    r.reasons.push('EBAY_EXACT_MPN');
  }
}
for (const part of researchParts) {
  const r = touch(part);
  r.score += 60;
  r.reasons.push('REGISTRY_RESEARCH_REQUIRED');
}
for (const part of suspendedParts) {
  const r = touch(part);
  r.score += 55;
  r.reasons.push('REGISTRY_SUSPENDED');
}
for (const hit of priorityHits) {
  const r = touch(hit.part);
  r.score += Math.min(40, 10 + Math.round(hit.weight / 50));
  r.priority_models = hit.models;
  r.reasons.push('GSC_PRIORITY_MODEL');
}
for (const p of catalog) {
  const part = norm(p.part_number);
  const name = (p.part_name || '').toLowerCase();
  const isCore = CORE_WEAR_WORDS.some(w => name.includes(w));
  const isMaint = MAINTENANCE_WORDS.some(w => name.includes(w));
  if (isCore) {
    const r = touch(part);
    r.score += 18;
    r.reasons.push('CORE_WEAR_PART');
    r.reasons.push('MAINTENANCE_PART');
  } else if (isMaint) {
    const r = touch(part);
    r.score += 8;
    r.reasons.push('MAINTENANCE_PART');
  }
}
for (const [part, row] of rows) {
  if (row.superseded_by) {
    row.score += 6;
    row.reasons.push('HAS_SUPERSESSION');
  }
  if (!row.part_name) {
    row.score -= 20;
    row.reasons.push('NO_CATALOG_NAME');
  }
}

const nextUnhandled500 = [...rows.values()]
  .filter(r => !activeAmazonParts.has(r.part_number) && !searched871Parts.has(r.part_number))
  .sort((a, b) => b.score - a.score || a.part_number.localeCompare(b.part_number))
  .slice(0, LIMIT)
  .map((r, i) => ({ rank: i + 1, ...r }));

const existingResearch = registry.offers
  .filter(o => o.status === 'RESEARCH_REQUIRED' || o.status === 'VERIFIED')
  .map(o => ({
    part_number: norm(o.part_number),
    part_display: o.part_number_formatted || displayOf[norm(o.part_number)] || o.part_number,
    part_name: nameOf[norm(o.part_number)] || null,
    asin: o.asin,
    marketplace: o.marketplace || 'amazon.nl',
    status: o.status,
    already_has_active: activeAmazonParts.has(norm(o.part_number)),
    product_title: o.product_title,
    shipping_to_nl_status: o.shipping_to_nl_status || null
  }));

const rejected871Set = new Set(act871.not_activated.map(x => `${x.part}:${x.asin}`));
const phase871Remaining = sel871.plan
  .filter(r => r.candidates?.length > 0 && !activeAmazonParts.has(r.part_number))
  .map(r => ({
    part_number: r.part_number,
    part_display: r.part_display,
    part_name: r.part_name,
    priority_models: r.priority_models,
    candidates: r.candidates.map(c => ({
      ...c,
      documented_87_1_reject: rejected871Set.has(`${r.part_number}:${c.asin}`)
    }))
  }));

const counts = {
  existing_research_and_verified: existingResearch.length,
  phase87_1_remaining_parts: phase871Remaining.length,
  total_unhandled_pool: [...rows.values()].filter(r => !activeAmazonParts.has(r.part_number) && !searched871Parts.has(r.part_number)).length,
  next_500_queue: nextUnhandled500.length,
  next_500_with_priority_model: nextUnhandled500.filter(r => r.priority_models.length > 0).length,
  next_500_maintenance: nextUnhandled500.filter(r => r.reasons.includes('MAINTENANCE_PART')).length
};

write('output/phase87_2/queue.json', {
  schema_version: '1.0.0',
  phase: '87.2',
  generated_at: new Date().toISOString(),
  counts,
  existing_research: existingResearch,
  phase87_1_remaining: phase871Remaining,
  next_500: nextUnhandled500
});

console.log(JSON.stringify(counts, null, 1));
console.log('Top 15 of next_500:');
for (const row of nextUnhandled500.slice(0, 15)) {
  console.log(`${row.rank}. ${row.part_display} score=${row.score} [${row.priority_models.join(',')}] ${row.reasons.join(',')} | ${(row.part_name || '').slice(0, 55)}`);
}
