#!/usr/bin/env node
/**
 * scripts/phase96_build_ebay_queue.mjs
 *
 * Phase 96 — eBay activation queue builder.
 *
 * Builds the work list for the eBay batch from data that already exists in the
 * repository; nothing is scraped and no new source of truth is introduced:
 *
 *  - `data/parts_catalog.json`   canonical parts (18,480) + display names
 *  - `data/stihl_database.db`    model fitments (which machine uses a part)
 *  - `output/phase81/PHASE81_PRIORITY_MODELS.json`  GSC priority models
 *  - `data/affiliate/ebay_offers.json`  the eBay store (already ACTIVE offers)
 *  - `data/affiliate/verified_amazon_registry.json`  Amazon direct links
 *
 * A part is a candidate when it is in the catalog and has no ACTIVE eBay offer.
 * Ranking puts parts with no direct buy option at all first, then GSC priority
 * models, then parts shared by many machines, then maintenance-type parts.
 *
 * Output: output/phase96/queue.json (ranked list + summary) and one
 * output/phase96/batches/queue_XX.json file per batch of --batch-size parts,
 * so a run can be executed batch by batch without re-reading the whole queue.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT96 = path.join(ROOT, 'output', 'phase96');
fs.mkdirSync(path.join(OUT96, 'batches'), { recursive: true });

const args = process.argv.slice(2);
const readArg = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BATCH_SIZE = Number(readArg('--batch-size', 40));
const QUEUE_LIMIT = Number(readArg('--limit', 800));

const readOpt = (rel, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
};
const normalize = part => PartNormalizer.normalizePartNumber(part);

// --- fingerprints of what is already covered -------------------------------
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

// --- catalog ---------------------------------------------------------------
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

// --- GSC priority models ---------------------------------------------------
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

// --- fitments --------------------------------------------------------------
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

// --- ranking ---------------------------------------------------------------
const MAINTENANCE_RE = /\b(ketting|sägekette|saegekette|zaagketting|zwaard|schwert|guide\s*bar|luftfilter|luchtfilter|air\s*filter|bougie|zündkerze|zuendkerze|spark\s*plug|filter|vergaser|carburetor|carburateur|starter|startkoord|ölpumpe|oliepomp|oil\s*pump|koppeling|clutch|kettingwiel|rim|sprocket|membraan|membrane|dichtung|gasket|schakelaar|switch|deksel|cover|kap|haube)\b/i;
const HARDWARE_RE = /^(?:screw|nut|bolt|washer|circlip|e-clip|pin|rivet|sleeve|spacer|shim|stud|schraube|mutter|scheibe|splint|federring|passfeder)\b/i;

const candidates = [];
for (const [part, name] of catalogName) {
  if (ebayActiveParts.has(part)) continue;
  const models = [...(modelsByPart.get(part) || [])];
  const gscScore = models.reduce((max, model) => Math.max(max, gscScoreByModel.get(model) || 0), 0);
  const hasDirectBuyOption = amazonActiveParts.has(part);
  const category = catalogCategory.get(part) || '';
  const hay = `${name} ${category}`;
  const maintenance = MAINTENANCE_RE.test(hay);
  const hardware = HARDWARE_RE.test(String(name));

  let score = 0;
  if (!hasDirectBuyOption) score += 1000;        // nothing to buy at all: highest value
  if (gscScore > 0) score += 50;                 // GSC priority model
  score += Math.min(gscScore, 100);              // measured demand
  score += Math.min(models.length, 20) * 3;      // shared across machines
  if (maintenance) score += 25;
  if (hardware) score -= 250;                    // tiny hardware: low commercial value

  candidates.push({
    part_number: part,
    part_name: name,
    category,
    models,
    model_count: models.length,
    gsc_model_score: gscScore,
    gsc_priority_model: gscScore > 0,
    has_amazon_direct_link: hasDirectBuyOption,
    maintenance_part: maintenance,
    priority_score: score
  });
}

candidates.sort((a, b) => b.priority_score - a.priority_score || a.part_number.localeCompare(b.part_number));
const queue = candidates.slice(0, QUEUE_LIMIT);

const batches = [];
for (let i = 0; i < queue.length; i += BATCH_SIZE) {
  batches.push(queue.slice(i, i + BATCH_SIZE));
}
batches.forEach((entries, index) => {
  const id = `queue_${String(index).padStart(2, '0')}`;
  fs.writeFileSync(
    path.join(OUT96, 'batches', `${id}.json`),
    JSON.stringify({ batch_id: id, parts: entries }, null, 2) + '\n',
    'utf8'
  );
});

const summary = {
  catalog_parts: catalogName.size,
  ebay_active_parts_baseline: ebayActiveParts.size,
  amazon_active_parts_baseline: amazonActiveParts.size,
  candidates_without_ebay_offer: candidates.length,
  candidates_without_any_direct_buy_option: candidates.filter(c => !c.has_amazon_direct_link).length,
  candidates_on_gsc_priority_models: candidates.filter(c => c.gsc_priority_model).length,
  queue_size: queue.length,
  batch_size: BATCH_SIZE,
  batches: batches.length
};

fs.writeFileSync(
  path.join(OUT96, 'queue.json'),
  JSON.stringify({ phase: '96', generated_at: new Date().toISOString(), summary, queue }, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify(summary, null, 2));
console.log('first 10:', queue.slice(0, 10).map(p => `${p.part_number}(${p.priority_score})`).join(' '));
