import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartNameNormalizer } from '../src/parts/PartNameNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const readJson = (rel, fb = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return fb; }
};

const stihlDb = readJson('data/stihl_database.json', { models: [] });
const amzReg = readJson('data/affiliate/verified_amazon_registry.json', { offers: [] });
const ebayReg = readJson('data/affiliate/ebay_offers.json', { offers: [] });
const catalog = readJson('data/parts_catalog.json', { parts: [] }).parts || [];
const p96Fits = readJson('data/parts_fitments_phase96.json', { fitments: [] }).fitments || [];
const gscDoc = readJson('output/phase81/PHASE81_PRIORITY_MODELS.json', null);

const activeAmzParts = new Set(amzReg.offers.filter(o => o.status === 'ACTIVE').map(o => PartNormalizer.normalizePartNumber(o.part_number)));
const activeEbayParts = new Set((ebayReg.offers || []).filter(o => o.status === 'ACTIVE').map(o => PartNormalizer.normalizePartNumber(o.part_number)));
const activeAll = new Set([...activeAmzParts, ...activeEbayParts]);

const normId = s => String(s || '').replace(/^stihl_/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const models = stihlDb.models || [];
const modelSet = new Set(models.map(m => normId(m.slug || m.id)));

// Load base fitments + Phase 96 fitments per canonical model
const modelPartsAll = new Map();
const partModelsCount = new Map();

const fitIndex = readJson('data/model_part_fitments.json', { shard_files: [] });
for (const shard of fitIndex.shard_files || []) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(root, 'data', shard)).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const pn = PartNormalizer.normalizePartNumber(r.part_number);
    const mId = r.canonical_model_id;
    if (!pn || !mId) continue;
    if (!modelPartsAll.has(mId)) modelPartsAll.set(mId, new Set());
    modelPartsAll.get(mId).add(pn);
    partModelsCount.set(pn, (partModelsCount.get(pn) || 0) + 1);
  }
}
for (const r of p96Fits) {
  const pn = PartNormalizer.normalizePartNumber(r.part_number);
  const mId = r.canonical_model_id;
  if (!pn || !mId) continue;
  if (!modelPartsAll.has(mId)) modelPartsAll.set(mId, new Set());
  modelPartsAll.get(mId).add(pn);
}

let coveredAll = 0;
let newlyCoveredP96 = [];
let uncoveredWithParts = [];

for (const m of models) {
  const mId = normId(m.slug || m.id);
  const parts = modelPartsAll.get(mId) || new Set();
  const activeCount = [...parts].filter(pn => activeAll.has(pn)).length;
  if (activeCount > 0) coveredAll++;
  else if (parts.size > 0) uncoveredWithParts.push({ model_id: mId, model_name: m.model_name, total_parts: parts.size, parts: [...parts] });
}

// Check which newly enriched models from PHASE96_CATALOG_ENRICHMENT gained ACTIVE buy coverage!
const p96Enr = readJson('output/phase96/PHASE96_CATALOG_ENRICHMENT.json', { empty_models_audit: [] });
for (const e of p96Enr.empty_models_audit || []) {
  if (e.added_fitments > 0) {
    const parts = modelPartsAll.get(e.canonical_model_id) || new Set();
    const activeCount = [...parts].filter(pn => activeAmzParts.has(pn)).length;
    const combCount = [...parts].filter(pn => activeAll.has(pn)).length;
    newlyCoveredP96.push({
      model: e.model_name,
      id: e.canonical_model_id,
      class: e.classification,
      parts_total: parts.size,
      active_amz_parts: activeCount,
      active_all_parts: combCount
    });
  }
}

console.log('Amazon ACTIVE:', amzReg.offers.filter(o => o.status === 'ACTIVE').length, 'Unique parts:', activeAmzParts.size);
console.log('Combined unique parts:', activeAll.size);
console.log('Models with ACTIVE coverage (incl. Phase 96 fitments):', coveredAll, '/', models.length, '(was 440 in Phase 95)');
console.log('\nNewly enriched 22 models buy coverage:');
console.table(newlyCoveredP96);
console.log('Uncovered models WITH fitments (0 ACTIVE offers):', uncoveredWithParts.length);
console.log(uncoveredWithParts.map(x => `${x.model_name}(${x.total_parts})`).join(', '));

// Check P95 queue & open 502 recoverable slots & parts on uncoveredWithParts
const q95 = readJson('output/phase95/queue.json', { search_parts: [], dp_nl: [], dp_de: [] });
const catByPn = new Map(catalog.map(p => [p.part_number, p]));
const uncoveredParts = [];
const seenPn = new Set();
for (const um of uncoveredWithParts) {
  for (const pn of um.parts) {
    if (seenPn.has(pn)) continue;
    const rawName = catByPn.get(pn)?.part_name || '';
    if (!/\b(?:screw|nut|washer|bolt|rivet|pin|circlip|plug|sticker|label|plate)\b/i.test(rawName)) {
      seenPn.add(pn);
      uncoveredParts.push({ part_number: pn, model: um.model_name, raw: rawName, nl: PartNameNormalizer.normalizeDisplayName(rawName, pn) });
    }
  }
}
console.log('\nHigh-value non-hardware parts on 0-offer models:', uncoveredParts.length);
console.log(uncoveredParts.slice(0, 20));
console.log('\nPhase 95 search_parts left:', q95.search_parts.filter(x => !activeAmzParts.has(x.part_number)).length);
console.log('eBay env vars present:', !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET));
