/**
 * Phase 87.1 — prioritised Amazon expansion queue.
 *
 * Builds a resumable work queue of catalog parts that have no direct Amazon offer
 * yet, ranked by the evidence we already hold and by measured demand:
 *
 *   P1  parts with an ACTIVE eBay offer whose match type is EXACT_MPN (proven identity)
 *   P2  parts that are SUSPENDED in the Amazon registry (their ASIN died, the part may live on)
 *   P3  parts of the GSC priority models, weighted by measured impressions
 *   P4  common maintenance parts (filters, plugs, chains, bars, starters, ...)
 *
 * No new architecture: this only orders the existing catalog. Usage:
 *   node scripts/phase87_1_build_queue.mjs [--limit 250]
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > 0 ? Number(process.argv[i + 1]) : 250;
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

const norm = p => PartNormalizer.normalizePartNumber(p);
const nameOf = Object.fromEntries(catalog.map(p => [norm(p.part_number), p.part_name]));
const displayOf = Object.fromEntries(catalog.map(p => [norm(p.part_number), p.part_number_display]));

const activeAmazonParts = new Set(
  registry.offers.filter(o => o.status === 'ACTIVE').map(o => norm(o.part_number))
);

const MAINTENANCE_WORDS = [
  'filter', 'spark plug', 'plug', 'chain', 'bar', 'starter', 'rewind', 'carburetor', 'carburettor',
  'sprocket', 'clutch', 'piston', 'cylinder', 'gasket', 'oil pump', 'ignition', 'coil', 'seal',
  'bearing', 'rope', 'fuel line', 'muffler', 'cap', 'valve', 'membrane', 'diaphragm', 'needle',
  'air filter', 'fuel filter', 'rim', 'guide', 'screw', 'spring', 'handle', 'throttle', 'switch'
];

/* ---------------------------------------------------------------- fitments */

const fitmentIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/model_part_fitments.json'), 'utf8'));
const modelIdOfName = Object.fromEntries(
  priorityModels.filter(m => m.canonical_model_id).map(m => [m.model_name.toLowerCase(), m.canonical_model_id])
);
const PRIORITY_MODEL_IDS = Object.fromEntries(
  ['ms_170', 'ms_180', 'ms_250', 'ms_260', 'ms_261', 'ms_361', 'ms_440', 'ms_461', 'ms_661',
    'fs_55', 'fs_85', 'fs_350', 'br_600', 'bg_86', 'hs_45', 'ts_420',
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

/* ------------------------------------------------------------------- queue */

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
for (const [part, row] of rows) {
  const name = (row.part_name || '').toLowerCase();
  if (MAINTENANCE_WORDS.some(w => name.includes(w))) {
    row.score += 8;
    row.reasons.push('MAINTENANCE_PART');
  }
  if (row.superseded_by) {
    row.score += 6;
    row.reasons.push('HAS_SUPERSESSION');
  }
  if (!row.part_name) {
    row.score -= 20;
    row.reasons.push('NO_CATALOG_NAME');
  }
  if (activeAmazonParts.has(part)) {
    row.excluded = 'ALREADY_ACTIVE_AMAZON';
    row.score = -1;
  }
}

const queue = [...rows.values()]
  .filter(r => !r.excluded)
  .sort((a, b) => b.score - a.score || a.part_number.localeCompare(b.part_number))
  .slice(0, LIMIT)
  .map((r, i) => ({ rank: i + 1, ...r }));

const counts = {
  total_candidates: [...rows.values()].filter(r => !r.excluded).length,
  in_queue: queue.length,
  with_ebay_exact_mpn: queue.filter(r => r.reasons.includes('EBAY_EXACT_MPN')).length,
  with_priority_model: queue.filter(r => r.priority_models.length > 0).length,
  maintenance: queue.filter(r => r.reasons.includes('MAINTENANCE_PART')).length,
  research_required: queue.filter(r => r.reasons.includes('REGISTRY_RESEARCH_REQUIRED')).length,
  suspended: queue.filter(r => r.reasons.includes('REGISTRY_SUSPENDED')).length
};

write('output/phase87_1/queue.json', {
  schema_version: '1.0.0',
  phase: '87.1',
  generated_at: new Date().toISOString(),
  limit: LIMIT,
  counts,
  queue
});

console.log(JSON.stringify(counts, null, 1));
console.log('top 15:');
for (const row of queue.slice(0, 15)) {
  console.log(`${row.rank}. ${row.part_display} ${String(row.score).padStart(4)} ${row.reasons.join(',')} | ${(row.part_name || '').slice(0, 60)}`);
}
