#!/usr/bin/env node
/**
 * scripts/phase97_build_ebay_queue.mjs
 *
 * Phase 97 — eBay activation queue, continued after the 400 parts Phase 96
 * researched, plus the grouped LISTING_MPN backlog.
 *
 * Same inputs and the same ranking as Phase 96 (no new source of truth):
 *  - data/parts_catalog.json, model_part_fitments, GSC priority models,
 *    the eBay store and the Amazon registry.
 *
 * What is new:
 *  - Parts that Phase 96 already searched are excluded, so the queue resumes
 *    exactly after the previous 400 instead of re-spending API calls on them.
 *  - The 846 LISTING_MPN candidates of Phase 96 are grouped per unique part
 *    (146 parts) with their item IDs and the parts that still have no eBay
 *    link, which become a small retry batch with alternative search hints.
 *
 * Output:
 *  - output/phase97/queue.json
 *  - output/phase97/batches/queue_10.json ... (40 parts each, numbering
 *    continues after Phase 96's queue_09)
 *  - output/phase97/listing_mpn_groups.json
 *  - output/phase97/batches/mpn_retry_00.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IN96 = path.join(ROOT, 'output', 'phase96');
const OUT97 = path.join(ROOT, 'output', 'phase97');
fs.mkdirSync(path.join(OUT97, 'batches'), { recursive: true });

const args = process.argv.slice(2);
const readArg = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BATCH_SIZE = Number(readArg('--batch-size', 40));
const QUEUE_LIMIT = Number(readArg('--limit', 400));
const START_NUMBER = Number(readArg('--start-number', 10));

const readOpt = (rel, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
};
const normalize = part => PartNormalizer.normalizePartNumber(part);

// --- what is already covered ------------------------------------------------
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

// --- parts Phase 96 already researched --------------------------------------
const phase96Results = fs.existsSync(path.join(IN96, 'batches'))
  ? fs.readdirSync(path.join(IN96, 'batches')).filter(f => f.endsWith('_result.json'))
  : [];
const researchedParts = new Set();
for (const file of phase96Results) {
  const result = JSON.parse(fs.readFileSync(path.join(IN96, 'batches', file), 'utf8'));
  for (const entry of result.per_part || []) {
    const part = normalize(entry.part_number);
    if (part) researchedParts.add(part);
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

// --- fitments ---------------------------------------------------------------
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

// --- ranking (identical weights to Phase 96) --------------------------------
const MAINTENANCE_RE = /\b(ketting|sägekette|saegekette|zaagketting|zwaard|schwert|guide\s*bar|luftfilter|luchtfilter|air\s*filter|bougie|zündkerze|zuendkerze|spark\s*plug|filter|vergaser|carburetor|carburateur|starter|startkoord|ölpumpe|oliepomp|oil\s*pump|koppeling|clutch|kettingwiel|rim|sprocket|membraan|membrane|dichtung|gasket|schakelaar|switch|deksel|cover|kap|haube)\b/i;
const HARDWARE_RE = /^(?:screw|nut|bolt|washer|circlip|e-clip|pin|rivet|sleeve|spacer|shim|stud|schraube|mutter|scheibe|splint|federring|passfeder)\b/i;

const candidates = [];
for (const [part, name] of catalogName) {
  if (ebayActiveParts.has(part)) continue;
  if (researchedParts.has(part)) continue;
  const models = [...(modelsByPart.get(part) || [])];
  const gscScore = models.reduce((max, model) => Math.max(max, gscScoreByModel.get(model) || 0), 0);
  const hasDirectBuyOption = amazonActiveParts.has(part);
  const category = catalogCategory.get(part) || '';
  const hay = `${name} ${category}`;
  const maintenance = MAINTENANCE_RE.test(hay);
  const hardware = HARDWARE_RE.test(String(name));

  let score = 0;
  if (!hasDirectBuyOption) score += 1000;
  if (gscScore > 0) score += 50;
  score += Math.min(gscScore, 100);
  score += Math.min(models.length, 20) * 3;
  if (maintenance) score += 25;
  if (hardware) score -= 250;

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
  const id = `queue_${String(START_NUMBER + index).padStart(2, '0')}`;
  fs.writeFileSync(
    path.join(OUT97, 'batches', `${id}.json`),
    JSON.stringify({ batch_id: id, parts: entries }, null, 2) + '\n',
    'utf8'
  );
});

// --- Phase 96 LISTING_MPN backlog, grouped per part -------------------------
const mpnGroups = new Map();
let mpnCandidates = 0;
for (const file of phase96Results) {
  const result = JSON.parse(fs.readFileSync(path.join(IN96, 'batches', file), 'utf8'));
  for (const offer of result.needs_evidence_offers || []) {
    const gap = (offer.evidence_gaps || [])[0] || offer.first_blocking_step || 'UNKNOWN';
    if (gap !== 'LISTING_MPN') continue;
    mpnCandidates += 1;
    const part = normalize(offer.part_number);
    if (!part) continue;
    if (!mpnGroups.has(part)) {
      mpnGroups.set(part, { part_number: part, item_ids: new Set(), marketplaces: new Set(), titles: [] });
    }
    const group = mpnGroups.get(part);
    group.item_ids.add(offer.item_id);
    group.marketplaces.add(offer.marketplace);
    if (group.titles.length < 2) group.titles.push(offer.title || '');
  }
}

const mpnGroupList = [...mpnGroups.values()].map(group => {
  const entry = candidates.find(c => c.part_number === group.part_number)
    || queue.find(c => c.part_number === group.part_number);
  const models = [...(modelsByPart.get(group.part_number) || [])];
  const name = catalogName.get(group.part_number) || '';
  const hasEbayLink = ebayActiveParts.has(group.part_number);
  const hints = [];
  if (name) {
    hints.push(`STIHL ${group.part_number} ${name}`.trim().slice(0, 120));
    hints.push(`${group.part_number} ${name}`.trim().slice(0, 120));
  }
  if (models[0] && name) hints.push(`STIHL ${models[0]} ${name}`.trim().slice(0, 120));
  return {
    part_number: group.part_number,
    part_name: name,
    models: models.slice(0, 6),
    gsc_priority_model: models.some(model => gscScoreByModel.has(model)),
    has_amazon_direct_link: amazonActiveParts.has(group.part_number),
    has_active_ebay_offer: hasEbayLink,
    priority_score: entry?.priority_score ?? null,
    candidates: group.item_ids.size,
    marketplaces: [...group.marketplaces],
    titles: group.titles,
    alternative_search_hints: hints
  };
}).sort((a, b) => {
  if (a.has_active_ebay_offer !== b.has_active_ebay_offer) return a.has_active_ebay_offer ? 1 : -1;
  return (b.priority_score ?? -1) - (a.priority_score ?? -1) || a.part_number.localeCompare(b.part_number);
});

const mpnRetry = mpnGroupList
  .filter(group => !group.has_active_ebay_offer)
  .map(group => ({
    part_number: group.part_number,
    part_name: group.part_name,
    models: group.models,
    gsc_priority_model: group.gsc_priority_model,
    has_amazon_direct_link: group.has_amazon_direct_link,
    priority_score: group.priority_score,
    alternative_search_hints: group.alternative_search_hints,
    prior_candidates: group.candidates
  }));

fs.writeFileSync(
  path.join(OUT97, 'listing_mpn_groups.json'),
  JSON.stringify({
    phase: '97',
    generated_at: new Date().toISOString(),
    summary: {
      candidates: mpnCandidates,
      unique_parts: mpnGroupList.length,
      parts_with_active_ebay_offer: mpnGroupList.filter(g => g.has_active_ebay_offer).length,
      parts_without_active_ebay_offer: mpnRetry.length
    },
    groups: mpnGroupList
  }, null, 2) + '\n',
  'utf8'
);

fs.writeFileSync(
  path.join(OUT97, 'batches', 'mpn_retry_00.json'),
  JSON.stringify({ batch_id: 'mpn_retry_00', parts: mpnRetry }, null, 2) + '\n',
  'utf8'
);

const summary = {
  catalog_parts: catalogName.size,
  ebay_active_parts_baseline: ebayActiveParts.size,
  amazon_active_parts_baseline: amazonActiveParts.size,
  researched_in_phase96: researchedParts.size,
  candidates_after_phase96: candidates.length,
  candidates_without_any_direct_buy_option: candidates.filter(c => !c.has_amazon_direct_link).length,
  candidates_on_gsc_priority_models: candidates.filter(c => c.gsc_priority_model).length,
  queue_size: queue.length,
  batch_size: BATCH_SIZE,
  batches: batches.length,
  batch_ids: batches.map((_, index) => `queue_${String(START_NUMBER + index).padStart(2, '0')}`),
  listing_mpn: {
    candidates: mpnCandidates,
    unique_parts: mpnGroupList.length,
    parts_with_active_ebay_offer: mpnGroupList.filter(g => g.has_active_ebay_offer).length,
    parts_without_active_ebay_offer: mpnRetry.length
  }
};

fs.writeFileSync(
  path.join(OUT97, 'queue.json'),
  JSON.stringify({ phase: '97', generated_at: new Date().toISOString(), summary, queue }, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify(summary, null, 2));
console.log('first 10:', queue.slice(0, 10).map(p => `${p.part_number}(${p.priority_score})`).join(' '));
