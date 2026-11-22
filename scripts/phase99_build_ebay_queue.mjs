#!/usr/bin/env node
/**
 * scripts/phase99_build_ebay_queue.mjs
 *
 * Phase 99 — the next 400 priority parts after Phase 98's queue_29.
 *
 * Identical sources and weights to Phase 96/97/98 (no new source of truth):
 * data/parts_catalog.json, model_part_fitments, GSC priority models, the eBay
 * store and the Amazon registry (read fresh, used only to prioritise and to
 * measure). Every part researched in Phase 96, 97 or 98 (both the exact and the
 * alternative checkpoint) is excluded, so the queue resumes exactly after
 * queue_29 and no API budget is spent twice.
 *
 * Output:
 *  - output/phase99/queue.json
 *  - output/phase99/batches/queue_30.json ... queue_39.json (40 parts each)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'phase99');
fs.mkdirSync(path.join(OUT, 'batches'), { recursive: true });

const args = process.argv.slice(2);
const readArg = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BATCH_SIZE = Number(readArg('--batch-size', 40));
const QUEUE_LIMIT = Number(readArg('--limit', 400));
const START_NUMBER = Number(readArg('--start-number', 30));

const readOpt = (rel, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
};
const normalize = part => PartNormalizer.normalizePartNumber(part);

// --- coverage now (fresh read, recorded so the measurement is reproducible) --
const ebayStore = readOpt('data/affiliate/ebay_offers.json', { offers: [] });
const ebayActiveParts = new Set(
  (ebayStore.offers || [])
    .filter(offer => offer.status === 'ACTIVE')
    .map(offer => normalize(offer.part_number))
    .filter(Boolean)
);
const amazonRegistry = readOpt('data/affiliate/verified_amazon_registry.json', { offers: [] });
const amazonActiveParts = new Set(
  (amazonRegistry.offers || [])
    .filter(offer => offer.status === 'ACTIVE')
    .map(offer => normalize(offer.part_number))
    .filter(Boolean)
);

// --- parts already researched (Phase 96 results, Phase 97 + 98 checkpoints) --
const researchedParts = new Set();
const researchedBySource = {};
for (const [phase, suffix] of [['phase96', '_result.json'], ['phase97', '_progress.json'], ['phase98', '_progress.json']]) {
  const dir = path.join(ROOT, 'output', phase, 'batches');
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(suffix)).sort()) {
    const doc = readOpt(`output/${phase}/batches/${file}`, { per_part: [] });
    let count = 0;
    for (const entry of doc.per_part || []) {
      const part = normalize(entry.part_number);
      if (!part) continue;
      researchedParts.add(part);
      count += 1;
    }
    researchedBySource[`${phase}/${file.replace(suffix, '')}`] = count;
  }
}

// --- catalog ----------------------------------------------------------------
const catalogDoc = readOpt('data/parts_catalog.json', { parts: [] });
const catalogList = Array.isArray(catalogDoc) ? catalogDoc : (catalogDoc.parts || []);
const catalogName = new Map();
const catalogCategory = new Map();
for (const entry of catalogList) {
  const part = normalize(entry.part_number);
  if (!part) continue;
  catalogName.set(part, entry.part_name || entry.name || entry.description || '');
  catalogCategory.set(part, entry.category || '');
}

// --- GSC priority models ----------------------------------------------------
const priorityDoc = readOpt('output/phase81/PHASE81_PRIORITY_MODELS.json', {});
const gscScoreByModel = new Map();
for (const item of (priorityDoc.models || priorityDoc.priority_models || [])) {
  const key = String(item.canonical_model_id || item.id || '')
    .toLowerCase()
    .replace(/^stihl_/, '');
  if (!key) continue;
  const score = Number(item.clicks || item.impressions || item.priority_score || 0);
  gscScoreByModel.set(key, Number.isFinite(score) ? score : 0);
}

// --- fitments ----------------------------------------------------------------
const db = new Database(path.join(ROOT, 'data', 'stihl_database.db'), { readonly: true });
const fitments = db
  .prepare('SELECT DISTINCT canonical_model_id, part_number FROM model_part_fitments')
  .all();
db.close();

const modelsByPart = new Map();
for (const row of fitments) {
  const part = normalize(row.part_number);
  if (!part) continue;
  if (!modelsByPart.has(part)) modelsByPart.set(part, new Set());
  modelsByPart.get(part).add(row.canonical_model_id);
}

// --- ranking (identical weights to Phase 96/97/98) ---------------------------
const MAINTENANCE_RE = /\b(ketting|sägekette|saegekette|zaagketting|zwaard|schwert|guide\s*bar|luftfilter|luchtfilter|air\s*filter|bougie|zündkerze|zuendkerze|spark\s*plug|filter|vergaser|carburetor|carburateur|starter|startkoord|ölpumpe|oliepomp|oil\s*pump|koppeling|clutch|kettingwiel|rim|sprocket|membraan|membrane|dichtung|gasket|schakelaar|switch|deksel|cover|kap|haube)\b/i;

const buildHints = (part, name, models) => {
  const hints = [];
  if (name) {
    hints.push(`STIHL ${part} ${name}`.trim().slice(0, 120));
    hints.push(`${part} ${name}`.trim().slice(0, 120));
  }
  if (models[0] && name) hints.push(`STIHL ${models[0].replace(/_/g, ' ')} ${name}`.trim().slice(0, 120));
  return [...new Set(hints)].slice(0, 3);
};

const candidates = [];
for (const [part, name] of catalogName) {
  if (ebayActiveParts.has(part)) continue;
  if (researchedParts.has(part)) continue;
  const models = [...(modelsByPart.get(part) || [])];
  const gscScore = models.reduce((max, model) => Math.max(max, gscScoreByModel.get(model) || 0), 0);
  const gscPriorityModels = models.filter(model => gscScoreByModel.has(model));
  const hasAmazonDirectLink = amazonActiveParts.has(part);
  const category = catalogCategory.get(part) || '';
  const hay = `${name} ${category}`;
  const maintenance = MAINTENANCE_RE.test(hay);

  let score = 0;
  if (!hasAmazonDirectLink) score += 1000;
  if (gscScore > 0) score += 50;
  score += Math.min(gscScore, 100);
  score += Math.min(models.length, 20) * 3;
  if (maintenance) score += 25;

  candidates.push({
    part_number: part,
    part_name: name,
    category,
    models,
    model_count: models.length,
    gsc_model_score: gscScore,
    gsc_priority_model: gscScore > 0,
    gsc_priority_models: gscPriorityModels,
    has_ebay_direct_link: false,
    has_amazon_direct_link: hasAmazonDirectLink,
    has_no_direct_link_anywhere: !hasAmazonDirectLink,
    maintenance_part: maintenance,
    alternative_search_hints: buildHints(part, name, models),
    priority_score: score
  });
}

candidates.sort((a, b) => b.priority_score - a.priority_score || a.part_number.localeCompare(b.part_number));
const queue = candidates.slice(0, QUEUE_LIMIT);

const batches = [];
for (let i = 0; i < queue.length; i += BATCH_SIZE) batches.push(queue.slice(i, i + BATCH_SIZE));
batches.forEach((entries, index) => {
  const id = `queue_${String(START_NUMBER + index).padStart(2, '0')}`;
  fs.writeFileSync(
    path.join(OUT, 'batches', `${id}.json`),
    JSON.stringify({ batch_id: id, parts: entries }, null, 2) + '\n',
    'utf8'
  );
});

const summary = {
  phase: '99',
  generated_at: new Date().toISOString(),
  catalog_parts: catalogName.size,
  measured_coverage_at_queue_build: {
    ebay_active_parts: ebayActiveParts.size,
    amazon_active_parts: amazonActiveParts.size,
    combined_unique_parts: new Set([...ebayActiveParts, ...amazonActiveParts]).size
  },
  researched_before_phase99: {
    unique_parts: researchedParts.size,
    per_batch: researchedBySource
  },
  candidates_after_phase98: candidates.length,
  candidates_without_any_direct_buy_link: candidates.filter(c => !c.has_amazon_direct_link).length,
  candidates_on_gsc_priority_models: candidates.filter(c => c.gsc_priority_model).length,
  queue_size: queue.length,
  queue_composition: {
    without_any_direct_buy_link: queue.filter(c => !c.has_amazon_direct_link).length,
    with_amazon_link_only: queue.filter(c => c.has_amazon_direct_link).length,
    on_gsc_priority_models: queue.filter(c => c.gsc_priority_model).length,
    distinct_gsc_models: new Set(queue.flatMap(c => c.gsc_priority_models)).size,
    parts_serving_multiple_gsc_models: queue.filter(c => c.gsc_priority_models.length > 1).length
  },
  remaining_after_queue: {
    candidates: candidates.length - queue.length,
    without_any_direct_buy_link: candidates.filter(c => !c.has_amazon_direct_link).length
      - queue.filter(c => !c.has_amazon_direct_link).length,
    on_gsc_priority_models: candidates.filter(c => c.gsc_priority_model).length
      - queue.filter(c => c.gsc_priority_model).length
  },
  batch_size: BATCH_SIZE,
  batches: batches.length,
  batch_ids: batches.map((_, index) => `queue_${String(START_NUMBER + index).padStart(2, '0')}`)
};

fs.writeFileSync(
  path.join(OUT, 'queue.json'),
  JSON.stringify({ phase: '99', generated_at: new Date().toISOString(), summary, queue }, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify(summary, null, 2));
console.log('first 10:', queue.slice(0, 10).map(p => `${p.part_number}(${p.priority_score}${p.gsc_priority_model ? ',gsc' : ''})`).join(' '));
