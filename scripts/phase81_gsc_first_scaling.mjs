#!/usr/bin/env node
/**
 * scripts/phase81_gsc_first_scaling.mjs
 *
 * Phase 81 — GSC-first affiliate scaling.
 *
 * Pure orchestration on top of the existing evidence pipeline: it selects the
 * priority models from Search Console evidence, inventories their catalog
 * parts, reuses every existing ACTIVE offer/evidence record, and queues only
 * the parts that still have no direct buy link. In live mode it hands that
 * queue to the proven Phase 80.1/80.3 batch runner (Browse search with
 * deliveryCountry:NL, getItem enrichment, canonical adjudication, persistent
 * store); it never re-implements matching, shipping or activation.
 *
 * Inputs (defaults are the repository artifacts):
 *   --gsc-addendum   output/phase77d/PHASE77D_LIVE_GSC_ADDENDUM.md
 *   --phase60        PHASE60_COMMERCIAL_OPPORTUNITIES.json
 *   --amazon-registry data/affiliate/verified_amazon_registry.json
 *   --store          persistent eBay offer store (AffiliateStoragePaths)
 *   --ebay-parts     extra ACTIVE eBay part numbers (comma list or JSON file)
 *   --db             data/stihl_database.db
 *   --out-dir        output/phase81
 *   --queue-size     maximum parts in the queue (default 120)
 *
 * Modes:
 *   (default)  analysis only: writes the model/part/reuse/queue artifacts
 *   --live     requires eBay production credentials and runs the batch runner
 *   --require-live  abort when credentials are missing
 *
 * Usage:
 *   node scripts/phase81_gsc_first_scaling.mjs
 *   node scripts/phase81_gsc_first_scaling.mjs --ebay-parts 11236403200,00006421223
 *   node scripts/phase81_gsc_first_scaling.mjs --live          # on Render
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

import { getEbayOfferStorePath, getPhase80OutputDir, resolveStorageRoot } from '../src/affiliate/AffiliateStoragePaths.js';
import { loadEbayOfferStore } from '../src/affiliate/EbayOfferStore.js';
import { isPartIndexable } from '../src/seo/PartIndexationRegistry.js';
import {
  COMMERCIAL_CATEGORY_RULES,
  COMMERCIAL_TIERS,
  GENERIC_HARDWARE_REGEX
} from '../src/seo/PartIndexQualityScorer.js';
import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const readArg = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const LIVE = args.includes('--live');
const REQUIRE_LIVE = args.includes('--require-live');
const LIMIT = 25;
const QUEUE_SIZE = Number(readArg('--queue-size') || 120);
const QUEUE_START = Number(readArg('--queue-start') || 0);
const QUEUE_FILE = readArg('--queue-file');
const GSC_ADDENDUM = readArg('--gsc-addendum') || path.join(root, 'output', 'phase77d', 'PHASE77D_LIVE_GSC_ADDENDUM.md');
const PHASE60 = readArg('--phase60') || path.join(root, 'PHASE60_COMMERCIAL_OPPORTUNITIES.json');
const AMAZON_REGISTRY = readArg('--amazon-registry') || path.join(root, 'data', 'affiliate', 'verified_amazon_registry.json');
const DB_PATH = readArg('--db') || path.join(root, 'data', 'stihl_database.db');
const OUT_DIR = readArg('--out-dir') || path.join(root, 'output', 'phase81');
const STORE = readArg('--store') || getEbayOfferStorePath();
const EBAY_PARTS_ARG = readArg('--ebay-parts');

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Parses the model-page table of the live GSC addendum.
 *
 * @param {string} markdown
 * @returns {Array<{ path: string, category_slug: string, slug: string, clicks: number, impressions: number, ctr_pct: number, position: number }>}
 */
export function parseGscModelRows(markdown) {
  const rows = [];
  const regex = /^\|\s*\/([a-z0-9-]+)\/([a-z0-9-]+)\/onderdelen\/\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d.,]+)%\s*\|\s*([\d.,]+)\s*\|/gm;
  for (const match of String(markdown || '').matchAll(regex)) {
    rows.push({
      path: `/${match[1]}/${match[2]}/onderdelen/`,
      category_slug: match[1],
      slug: match[2],
      clicks: Number(match[3]),
      impressions: Number(match[4]),
      ctr_pct: Number(match[5].replace(',', '.')),
      position: Number(match[6].replace(',', '.'))
    });
  }
  return rows;
}

/**
 * Explicit, reproducible priority formula (0-100):
 *   55% Search Console impressions (measured demand)
 *   25% Phase 60 commercial score (catalog + traffic history)
 *   20% buy-coverage gap (share of the model's parts without a direct link)
 *
 * @param {Object} input
 * @returns {number}
 */
export function computePriorityScore(input = {}) {
  const impressions = Number(input.impressions || 0);
  const maxImpressions = Number(input.maxImpressions || 0);
  const phase60 = Number(input.phase60_score || 0);
  const maxPhase60 = Number(input.maxPhase60 || 0);
  const gap = Math.max(0, Math.min(100, Number(input.coverage_gap_pct || 0)));
  const demand = maxImpressions > 0 ? (impressions / maxImpressions) * 55 : 0;
  const commercial = maxPhase60 > 0 ? (phase60 / maxPhase60) * 25 : 0;
  const coverage = (gap / 100) * 20;
  return Number((demand + commercial + coverage).toFixed(1));
}

/**
 * Commercial tier for a part name, using the existing Phase 56A rules.
 *
 * @param {string} partName
 * @returns {{ category: string|null, tier: string, hardware: boolean }}
 */
export function classifyPartCommercial(partName) {
  const name = String(partName || '');
  if (GENERIC_HARDWARE_REGEX.test(name)) {
    return { category: 'bevestiging', tier: COMMERCIAL_TIERS.LOW, hardware: true };
  }
  for (const rule of COMMERCIAL_CATEGORY_RULES) {
    if (rule.regex.test(name)) return { category: rule.category, tier: rule.tier, hardware: false };
  }
  return { category: null, tier: COMMERCIAL_TIERS.UNKNOWN, hardware: false };
}

/**
 * Builds the missing-offer queue: only service parts without a direct buy link,
 * ordered by model priority and commercial tier. Hardware is never queued.
 *
 * @param {Object} input
 * @param {Array<Object>} input.models ranked models with `parts`
 * @param {Set<string>} input.directParts
 * @param {number} [input.limit]
 * @returns {Array<Object>}
 */
export function buildMissingQueue(input = {}) {
  const { models = [], directParts = new Set(), limit = 120 } = input;
  const byPart = new Map();
  for (const model of models) {
    for (const part of (model.parts || [])) {
      const partNumber = PartNormalizer.normalizePartNumber(part.part_number);
      if (!partNumber) continue;
      if (directParts.has(partNumber)) continue;
      const commercial = classifyPartCommercial(part.part_name);
      if (commercial.hardware) continue;
      const existing = byPart.get(partNumber);
      if (existing) {
        if (!existing.model_names.includes(model.model_name)) existing.model_names.push(model.model_name);
        if (model.fitment_id && !existing.models.includes(model.fitment_id)) existing.models.push(model.fitment_id);
        continue;
      }
      byPart.set(partNumber, {
        // `description` and `models` (canonical fitment ids) are the fields the
        // Phase 80.1 batch runner reads for corroboration.
        description: part.part_name || '',
        part_number: partNumber,
        part_number_display: part.part_number_display || PartNormalizer.formatPartNumber(partNumber),
        part_name: part.part_name || '',
        category: commercial.category,
        commercial_tier: commercial.tier,
        indexable: Boolean(part.indexable),
        models: model.fitment_id ? [model.fitment_id] : [],
        model_names: [model.model_name],
        priority_model: model.model_name,
        priority_rank: model.rank,
        priority_score: model.priority_score
      });
    }
  }
  const tierWeight = {
    [COMMERCIAL_TIERS.HIGH]: 2,
    [COMMERCIAL_TIERS.MEDIUM]: 1,
    [COMMERCIAL_TIERS.LOW]: 0
  };
  const ranked = [...byPart.values()]
    .sort((a, b) => b.priority_score - a.priority_score
      || a.priority_rank - b.priority_rank
      || (tierWeight[b.commercial_tier] ?? 0) - (tierWeight[a.commercial_tier] ?? 0)
      || Number(b.indexable) - Number(a.indexable)
      || a.part_number.localeCompare(b.part_number));

  // Round-robin over the ranked models so new direct links are spread across the
  // priority models instead of exhausting the first model's catalog.
  const perModel = new Map();
  for (const model of [...models].sort((a, b) => a.rank - b.rank)) {
    perModel.set(model.model_name, ranked.filter(entry => entry.priority_model === model.model_name));
  }
  const picked = [];
  const seen = new Set();
  let added = true;
  while (picked.length < limit && added) {
    added = false;
    for (const entries of perModel.values()) {
      if (picked.length >= limit) break;
      const next = entries.shift();
      if (!next || seen.has(next.part_number)) continue;
      seen.add(next.part_number);
      picked.push(next);
      added = true;
    }
  }
  return picked;
}

/**
 * Resolves extra ACTIVE eBay parts from a comma list or a JSON file.
 *
 * @param {string|null} value
 * @param {string} [baseDir]
 * @returns {string[]}
 */
export function parseEbayPartsArg(value, baseDir = root) {
  if (!value) return [];
  const filePath = path.isAbsolute(value) ? value : path.resolve(baseDir, value);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    try {
      const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const list = Array.isArray(doc) ? doc : (doc.parts || doc.offers || []);
      return list
        .map(entry => PartNormalizer.normalizePartNumber(typeof entry === 'string' ? entry : entry?.part_number))
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  return String(value)
    .split(',')
    .map(part => PartNormalizer.normalizePartNumber(part))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Repository inputs
// ---------------------------------------------------------------------------

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDatabase() {
  if (!fs.existsSync(DB_PATH)) return null;
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  return new Database(DB_PATH, { readonly: true });
}

function loadCatalog() {
  const db = loadDatabase();
  if (!db) return { models: [], partsByModel: new Map(), partNames: new Map() };
  const models = db.prepare('SELECT id, slug, model_name, category_slug FROM models').all();
  const partNames = new Map();
  for (const row of db.prepare('SELECT part_number, part_number_display, part_name FROM parts').all()) {
    partNames.set(row.part_number, row);
  }
  const partsByModel = new Map();
  for (const row of db.prepare(`
    SELECT canonical_model_id, part_number
    FROM model_part_fitments
  `).all()) {
    if (!partsByModel.has(row.canonical_model_id)) partsByModel.set(row.canonical_model_id, new Set());
    partsByModel.get(row.canonical_model_id).add(row.part_number);
  }
  db.close();
  return { models, partsByModel, partNames };
}

function activeAmazonParts() {
  const registry = readJson(AMAZON_REGISTRY, { offers: [] });
  return new Set((registry.offers || [])
    .filter(offer => offer.status === 'ACTIVE')
    .map(offer => PartNormalizer.normalizePartNumber(offer.part_number))
    .filter(Boolean));
}

function activeEbayPartsFromStore() {
  const store = loadEbayOfferStore(STORE);
  return new Set((store.offers || [])
    .filter(offer => offer.status === 'ACTIVE' && offer.decision === 'ACCEPT')
    .map(offer => PartNormalizer.normalizePartNumber(offer.part_number))
    .filter(Boolean));
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

/**
 * Ranks the model universe and keeps the 25 with the largest remaining buy gap.
 *
 * @param {Object} input
 * @returns {Array<Object>}
 */
export function rankPriorityModels(input = {}) {
  const {
    models = [],
    partsByModel = new Map(),
    partNames = new Map(),
    gscRows = [],
    phase60Models = [],
    directParts = new Set(),
    limit = 25
  } = input;

  const gscBySlug = new Map(gscRows.map(row => [row.slug, row]));
  const phase60ById = new Map(phase60Models.map(model => [String(model.canonical_id || ''), model]));

  const universe = new Map();
  const addModel = (model, source) => {
    if (!model) return;
    const fitmentId = String(model.id || '').replace(/^stihl_/, '') || model.fitment_id;
    if (!fitmentId) return;
    const key = fitmentId;
    if (!universe.has(key)) {
      universe.set(key, {
        canonical_model_id: model.id || `stihl_${fitmentId}`,
        fitment_id: fitmentId,
        model_name: model.model_name || phase60ById.get(fitmentId)?.model_name || fitmentId,
        slug: model.slug || fitmentId.replace(/_/g, '-'),
        category_slug: model.category_slug || null,
        sources: []
      });
    }
    if (!universe.get(key).sources.includes(source)) universe.get(key).sources.push(source);
  };

  for (const row of gscRows) {
    const model = models.find(candidate => candidate.slug === row.slug);
    addModel(model, 'GSC_LIVE_ADDENDUM');
    if (model) universe.get(String(model.id).replace(/^stihl_/, '')).gsc = row;
  }
  for (const model of models) addModel(model, 'CATALOG');
  for (const phase60Model of phase60Models) {
    const fitmentId = String(phase60Model.canonical_id || '');
    const model = models.find(candidate => candidate.slug === fitmentId.replace(/_/g, '-'))
      || models.find(candidate => String(candidate.id).replace(/^stihl_/, '') === fitmentId);
    addModel(model || { id: `stihl_${fitmentId}`, model_name: phase60Model.model_name, slug: fitmentId.replace(/_/g, '-') }, 'PHASE60');
    const entry = universe.get(fitmentId);
    if (entry) entry.phase60 = phase60Model;
  }

  const maxImpressions = Math.max(1, ...gscRows.map(row => row.impressions), 0);
  const maxPhase60 = Math.max(1, ...phase60Models.map(model => model.commercial_score || 0), 0);

  const ranked = [];
  for (const entry of universe.values()) {
    const partSet = partsByModel.get(entry.fitment_id) || new Set();
    if (partSet.size === 0) continue;
    const direct = [...partSet].filter(part => directParts.has(part));
    const gapPct = partSet.size > 0 ? ((partSet.size - direct.length) / partSet.size) * 100 : 0;
    const priorityScore = computePriorityScore({
      impressions: entry.gsc?.impressions || 0,
      maxImpressions,
      phase60_score: entry.phase60?.commercial_score || 0,
      maxPhase60,
      coverage_gap_pct: gapPct
    });
    ranked.push({
      rank: 0,
      model_name: entry.model_name,
      canonical_model_id: entry.canonical_model_id,
      fitment_id: entry.fitment_id,
      slug: entry.slug,
      category_slug: entry.category_slug,
      sources: entry.sources,
      evidence_tier: entry.gsc ? 'GSC_MEASURED'
        : (entry.phase60 ? 'COMMERCIAL_RANKED' : 'CATALOG_ONLY'),
      gsc: entry.gsc ? {
        path: entry.gsc.path,
        clicks: entry.gsc.clicks,
        impressions: entry.gsc.impressions,
        ctr_pct: entry.gsc.ctr_pct,
        position: entry.gsc.position
      } : null,
      phase60_commercial_score: entry.phase60?.commercial_score ?? null,
      catalog_parts: partSet.size,
      parts_with_direct_link: direct.length,
      buy_coverage_pct: Number((100 - gapPct).toFixed(2)),
      buy_gap_pct: Number(gapPct.toFixed(2)),
      priority_score: priorityScore,
      parts: [...partSet].map(part_number => {
        const part = partNames.get(part_number) || {};
        return {
          part_number,
          part_number_display: part.part_number_display || PartNormalizer.formatPartNumber(part_number),
          part_name: part.part_name || '',
          indexable: isPartIndexable(part_number)
        };
      })
    });
  }

  const evidenceRank = model => (model.evidence_tier === 'GSC_MEASURED' ? 0
    : model.evidence_tier === 'COMMERCIAL_RANKED' ? 1 : 2);
  const missing = model => model.catalog_parts - model.parts_with_direct_link;

  return ranked
    .sort((a, b) => evidenceRank(a) - evidenceRank(b)
      // Within the catalog-only fill group, volume of missing parts wins: a
      // 5-part model at 0% is not a bigger opportunity than a 184-part model.
      || (evidenceRank(a) === 2
        ? missing(b) - missing(a)
        : b.priority_score - a.priority_score)
      || missing(b) - missing(a)
      || b.catalog_parts - a.catalog_parts
      || a.model_name.localeCompare(b.model_name))
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function writeJson(name, payload) {
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function run() {
  const generatedAt = new Date().toISOString();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const storage = resolveStorageRoot();
  const catalog = loadCatalog();
  const gscMarkdown = fs.existsSync(GSC_ADDENDUM) ? fs.readFileSync(GSC_ADDENDUM, 'utf8') : '';
  const gscRows = parseGscModelRows(gscMarkdown);
  const phase60 = readJson(PHASE60, { top_20_models: [] });
  const amazonParts = activeAmazonParts();
  const storeParts = activeEbayPartsFromStore();
  const extraEbayParts = parseEbayPartsArg(EBAY_PARTS_ARG);
  const directParts = new Set([...amazonParts, ...storeParts, ...extraEbayParts]);

  const ranked = rankPriorityModels({
    models: catalog.models,
    partsByModel: catalog.partsByModel,
    partNames: catalog.partNames,
    gscRows,
    phase60Models: phase60.top_20_models || [],
    directParts,
    limit: LIMIT
  });

  // A frozen queue (--queue-file) keeps chunked runs on exactly the same part
  // list: after the first chunk those parts are no longer "missing", so
  // rebuilding would shift every offset.
  const frozenQueue = QUEUE_FILE && fs.existsSync(path.isAbsolute(QUEUE_FILE) ? QUEUE_FILE : path.resolve(root, QUEUE_FILE))
    ? (readJson(path.isAbsolute(QUEUE_FILE) ? QUEUE_FILE : path.resolve(root, QUEUE_FILE), { queue: [] }).queue || [])
    : null;
  const fullQueue = frozenQueue || buildMissingQueue({ models: ranked, directParts, limit: QUEUE_SIZE });
  const queue = frozenQueue
    ? fullQueue.slice(QUEUE_START, QUEUE_START + QUEUE_SIZE)
    : fullQueue;

  const modelRows = ranked.map(model => ({
    rank: model.rank,
    model_name: model.model_name,
    canonical_model_id: model.canonical_model_id,
    fitment_id: model.fitment_id,
    slug: model.slug,
    sources: model.sources,
    evidence_tier: model.evidence_tier,
    gsc_impressions: model.gsc?.impressions ?? null,
    gsc_clicks: model.gsc?.clicks ?? null,
    gsc_ctr_pct: model.gsc?.ctr_pct ?? null,
    gsc_position: model.gsc?.position ?? null,
    phase60_commercial_score: model.phase60_commercial_score,
    catalog_parts: model.catalog_parts,
    parts_with_direct_link: model.parts_with_direct_link,
    buy_coverage_pct: model.buy_coverage_pct,
    buy_gap_pct: model.buy_gap_pct,
    parts_missing_direct_link: model.catalog_parts - model.parts_with_direct_link,
    priority_score: model.priority_score
  }));

  const totalParts = new Set(ranked.flatMap(model => model.parts.map(part => part.part_number))).size;
  const totalDirect = [...new Set(ranked.flatMap(model => model.parts.map(part => part.part_number)))]
    .filter(part => directParts.has(part)).length;

  const reuse = {
    amazon_active_offers: readJson(AMAZON_REGISTRY, { offers: [] }).offers?.filter(offer => offer.status === 'ACTIVE').length ?? 0,
    amazon_active_parts: amazonParts.size,
    amazon_verified_staged: readJson(AMAZON_REGISTRY, { offers: [] }).offers?.filter(offer => offer.status === 'VERIFIED').length ?? 0,
    amazon_research_required: readJson(AMAZON_REGISTRY, { offers: [] }).offers?.filter(offer => offer.status === 'RESEARCH_REQUIRED').length ?? 0,
    ebay_active_offers_store: loadEbayOfferStore(STORE).offers.filter(offer => offer.status === 'ACTIVE').length,
    ebay_active_parts_store: storeParts.size,
    ebay_active_parts_live_hint: extraEbayParts.length,
    ebay_parts_used_total: new Set([...storeParts, ...extraEbayParts]).size,
    union_direct_parts: directParts.size
  };

  const hasCredentials = Boolean(
    process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && /^\d+$/.test(process.env.EBAY_EPN_CAMPAIGN_ID || '')
  );
  const liveRequested = LIVE || REQUIRE_LIVE;
  if (liveRequested && !hasCredentials) {
    console.error('ABORT: --live/--require-live needs EBAY_CLIENT_ID, EBAY_CLIENT_SECRET and EBAY_EPN_CAMPAIGN_ID');
    process.exitCode = 1;
  }

  const summary = {
    schema_version: '1.0.0',
    phase: '81',
    generated_at: generatedAt,
    mode: liveRequested ? (hasCredentials ? 'LIVE' : 'BLOCKED_MISSING_EBAY_CREDENTIALS') : 'ANALYSIS',
    storage: { persistent: storage.persistent, source: storage.source, offer_store: STORE },
    inputs: {
      gsc_addendum: path.relative(root, GSC_ADDENDUM),
      gsc_rows: gscRows.length,
      phase60_models: phase60.top_20_models?.length ?? 0,
      catalog_models: catalog.models.length
    },
    reuse,
    priority_models: modelRows.length,
    priority_models_by_evidence: modelRows.reduce((acc, model) => {
      acc[model.evidence_tier] = (acc[model.evidence_tier] || 0) + 1;
      return acc;
    }, {}),
    priority_union_parts: totalParts,
    priority_union_parts_with_direct_link: totalDirect,
    queue_size: queue.length,
    queue_start: frozenQueue ? QUEUE_START : 0,
    queue_frozen: Boolean(frozenQueue),
    queue_by_tier: queue.reduce((acc, entry) => {
      acc[entry.commercial_tier] = (acc[entry.commercial_tier] || 0) + 1;
      return acc;
    }, {}),
    queue_indexable: queue.filter(entry => entry.indexable).length,
    activation_blocker: hasCredentials ? null : 'EBAY_CREDENTIALS_MISSING'
  };

  writeJson('PHASE81_PRIORITY_MODELS.json', {
    schema_version: '1.0.0',
    generated_at: generatedAt,
    scoring: {
      total: 100,
      formula: '55 × (GSC-vertoningen / max) + 25 × (Phase 60-score / max) + 20 × (koopgat %)',
      note: 'Alleen gemeten GSC-vertoningen (addendum 13 okt–9 nov 2026) en bestaande catalogus-/trafficscores; geen verzonnen vraagcijfers.'
    },
    models: modelRows
  });
  writeJson('PHASE81_MODEL_COVERAGE.json', {
    schema_version: '1.0.0',
    generated_at: generatedAt,
    direct_parts_source: {
      amazon_active: amazonParts.size,
      ebay_store_active: storeParts.size,
      ebay_live_hint: extraEbayParts.length,
      union: directParts.size
    },
    models: ranked.map(model => ({
      rank: model.rank,
      model_name: model.model_name,
      fitment_id: model.fitment_id,
      catalog_parts: model.catalog_parts,
      parts_with_direct_link: model.parts_with_direct_link,
      buy_coverage_pct: model.buy_coverage_pct,
      direct_parts: model.parts.filter(part => directParts.has(part.part_number)).map(part => part.part_number),
      missing_parts: model.parts.filter(part => !directParts.has(part.part_number)).length
    }))
  });
  // Never overwrite a frozen queue with a chunk slice: later chunks address it
  // by offset.
  writeJson('PHASE81_MISSING_QUEUE.json', {
    schema_version: '1.0.0',
    generated_at: generatedAt,
    note: 'Alleen onderdelen zonder directe kooplink; bevestigingsmateriaal uitgesloten. Input voor scripts/phase80_evidence_batch.mjs.',
    queue_size: (frozenQueue ? fullQueue : queue).length,
    queue: frozenQueue ? fullQueue : queue
  });
  writeJson('PHASE81_SUMMARY.json', summary);

  const table = rows => ['| # | Model | Bewijsniveau | GSC-vertoningen | Catalogusonderdelen | Directe link | Dekking | Score |',
    '|---|---|---|---:|---:|---:|---:|---:|',
    ...rows.map(model => `| ${model.rank} | ${model.model_name} | ${model.evidence_tier} | ${model.gsc_impressions ?? '—'} | ${model.catalog_parts} | ${model.parts_with_direct_link} | ${model.buy_coverage_pct}% | ${model.priority_score} |`)].join('\n');

  const report = `# Phase 81 — GSC-first affiliate scaling

Datum: ${generatedAt}
Modus: **${summary.mode}**

## Uitgangspunten

- GSC-bron: \`${path.relative(root, GSC_ADDENDUM)}\` (${gscRows.length} gemeten modelpagina's, definitieve data 13 okt–9 nov 2026).
- Commerciële catalogus: \`PHASE60_COMMERCIAL_OPPORTUNITIES.json\` (${phase60.top_20_models?.length ?? 0} modellen).
- Hergebruik: ${reuse.amazon_active_offers} ACTIVE Amazon-aanbiedingen op ${amazonParts.size} onderdelen, ${reuse.ebay_active_offers_store} ACTIVE eBay-records in de store${extraEbayParts.length ? `, ${extraEbayParts.length} publiek bevestigde eBay-onderdelen` : ''}; geen enkel bestaand bewijs is opnieuw bevraagd.

## Prioriteitsmodellen (${modelRows.length})

${table(modelRows)}

Bewijsniveau: ${Object.entries(summary.priority_models_by_evidence).map(([tier, count]) => `${tier} ${count}`).join(', ')}. Alleen \`GSC_MEASURED\` modellen hebben gemeten Search Console-vertoningen; \`COMMERCIAL_RANKED\` komt uit de Phase 60-commerciële rangorde en \`CATALOG_ONLY\` is een catalogusaanvulling zonder vraagbewijs.

## Queue

- ${queue.length} ontbrekende serviceonderdelen (${summary.queue_indexable} indexeerbaar), klaar voor de Phase 80.1/80.3-batch.
- Verdeling naar commerciële tier: ${Object.entries(summary.queue_by_tier).map(([tier, count]) => `${tier} ${count}`).join(', ')}.
- Bevestigingsmateriaal (bouten, moeren, ringen) is niet in de queue opgenomen.

## Live-activering

${summary.activation_blocker === 'EBAY_CREDENTIALS_MISSING'
  ? 'Geblokkeerd in deze omgeving: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` en `EBAY_EPN_CAMPAIGN_ID` zijn hier niet gezet. Er is daarom **geen** live zoekopdracht, verzendbevestiging of activering uitgevoerd en er worden geen gegroeide aantallen geclaimd.'
  : 'Credentials aanwezig; live batches zijn uitgevoerd via `scripts/phase80_evidence_batch.mjs` (resultaten: `PHASE81_LIVE_RESULTS.json` en het Phase 81-rapport in de repositoryroot).'}

Uitvoeren op Render (aanbevolen, gebruikt de bewezen Phase 80.1/80.3-keten):

\`\`\`bash
cd /opt/render/project/src
node scripts/phase81_gsc_first_scaling.mjs --live --queue-size ${queue.length}
\`\`\`

Het script zoekt uitsluitend de onderdelen uit de queue (Browse met \`deliveryCountry:NL\`), verrijkt ontbrekend bewijs via \`getItem\`, adjudiceert met de bestaande matcher, schrijft alleen \`ACCEPT\` naar \`/var/data/affiliate/ebay_offers.json\` en laat NEEDS_EVIDENCE staan.
`;
  fs.writeFileSync(path.join(OUT_DIR, 'PHASE81_REPORT.md'), report, 'utf8');

  console.log(JSON.stringify({
    mode: summary.mode,
    activation_blocker: summary.activation_blocker,
    priority_models: modelRows.length,
    priority_union_parts: totalParts,
    union_parts_with_direct_link: totalDirect,
    queue_size: queue.length,
    reuse,
    artifacts: OUT_DIR,
    top_models: modelRows.slice(0, 8).map(model => ({ rank: model.rank, model: model.model_name, parts: model.catalog_parts, direct: model.parts_with_direct_link, score: model.priority_score }))
  }, null, 2));

  if (!liveRequested) {
    console.log('\nNOTE: analysis only. Pass --live on Render to run the eBay batch for this queue.');
    return summary;
  }
  if (!hasCredentials) return summary;

  // Live: hand the queue to the existing batch runner. No matching logic here.
  const queuePath = frozenQueue
    ? (() => {
      const slicePath = path.join(OUT_DIR, `PHASE81_ACTIVE_QUEUE_${QUEUE_START}_${queue.length}.json`);
      fs.writeFileSync(slicePath, `${JSON.stringify({ schema_version: '1.0.0', generated_at: generatedAt, queue_size: queue.length, queue }, null, 2)}\n`, 'utf8');
      return slicePath;
    })()
    : path.join(OUT_DIR, 'PHASE81_MISSING_QUEUE.json');
  const batchArgs = [
    path.join(root, 'scripts', 'phase80_evidence_batch.mjs'),
    '--live',
    '--input', queuePath,
    '--limit', String(queue.length),
    '--max-get-items', String(Math.max(queue.length, 250))
  ];
  const child = spawnSync(process.execPath, batchArgs, { cwd: root, stdio: 'inherit', env: process.env });
  const batchExit = child.status;
  const batchDir = getPhase80OutputDir();
  let latestReport = null;
  try {
    const files = fs.readdirSync(batchDir)
      .filter(file => file.startsWith('phase80_batch_live_') && file.endsWith('.json'))
      .sort();
    if (files.length > 0) latestReport = readJson(path.join(batchDir, files[files.length - 1]), null);
  } catch {
    latestReport = null;
  }
  writeJson('PHASE81_ACTIVATION_SUMMARY.json', {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    batch_exit_code: batchExit,
    batch_report: latestReport ? latestReport.generated_at : null,
    before: { priority_union_parts: totalParts, direct_parts: directParts.size, queue_size: queue.length },
    batch_metrics: latestReport?.metrics || null,
    batch_chain: latestReport?.chain || null
  });
  process.exitCode = batchExit === 0 ? 0 : 1;
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
