#!/usr/bin/env node
/**
 * scripts/phase98_baseline.mjs
 *
 * Phase 98 — coverage baseline with exactly the keys the end measurement uses,
 * so a resumed batch can never be counted twice.
 *
 * Reads:
 *  - data/affiliate/ebay_offers.json (ACTIVE offers)
 *  - data/affiliate/verified_amazon_registry.json (ACTIVE Amazon offers, only
 *    used to prioritise and to measure combined coverage)
 *  - the Phase 96 result files and the Phase 97 progress checkpoints (parts
 *    already researched; never researched again)
 *  - GSC priority models + model/part fitments
 *
 * Writes output/phase98/PHASE98_BASELINE.json. Nothing is modified.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT98 = path.join(ROOT, 'output', 'phase98');
fs.mkdirSync(OUT98, { recursive: true });

const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
// The baseline is the committed production state (main), not the working tree: a
// batch already writes offers while it runs, and those must count as new.
const readHead = rel => JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024
}));
const normalize = part => PartNormalizer.normalizePartNumber(part);
const stat = rel => {
  try {
    const s = fs.statSync(path.join(ROOT, rel));
    return { path: rel, bytes: s.size, modified_at: s.mtime.toISOString() };
  } catch {
    return { path: rel, missing: true };
  }
};

const store = readHead('data/affiliate/ebay_offers.json');
const activeOffers = (store.offers || []).filter(offer => offer.status === 'ACTIVE');
const ebayParts = new Set(activeOffers.map(offer => normalize(offer.part_number)).filter(Boolean));
const ebayMarketplaces = {};
for (const offer of activeOffers) {
  ebayMarketplaces[offer.marketplace] = (ebayMarketplaces[offer.marketplace] || 0) + 1;
}

const amazon = readHead('data/affiliate/verified_amazon_registry.json');
const amazonActive = (amazon.offers || []).filter(offer => offer.status === 'ACTIVE');
const amazonParts = new Set(amazonActive.map(offer => normalize(offer.part_number)).filter(Boolean));

// --- parts already researched in Phase 96 and Phase 97 ----------------------
const researched = new Map();
for (const phase of ['phase96', 'phase97']) {
  const dir = path.join(ROOT, 'output', phase, 'batches');
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(file =>
    phase === 'phase96' ? file.endsWith('_result.json') : file.endsWith('_progress.json')
  );
  for (const file of files) {
    const doc = readJson(`output/${phase}/batches/${file}`);
    for (const entry of doc.per_part || []) {
      const part = normalize(entry.part_number);
      if (!part) continue;
      if (!researched.has(part)) researched.set(part, new Set());
      researched.get(part).add(phase);
    }
  }
}
const researchedByPhase = { phase96: 0, phase97: 0, both: 0 };
for (const phases of researched.values()) {
  if (phases.size === 2) researchedByPhase.both += 1;
  else if (phases.has('phase96')) researchedByPhase.phase96 += 1;
  else researchedByPhase.phase97 += 1;
}

// --- GSC priority models ----------------------------------------------------
const priorityDoc = readJson('output/phase81/PHASE81_PRIORITY_MODELS.json');
const gscModels = new Map();
for (const item of (priorityDoc.models || priorityDoc.priority_models || [])) {
  const key = String(item.canonical_model_id || item.id || '')
    .toLowerCase()
    .replace(/^stihl_/, '');
  if (!key) continue;
  gscModels.set(key, {
    clicks: Number(item.clicks || 0),
    impressions: Number(item.impressions || 0)
  });
}

const db = new Database(path.join(ROOT, 'data', 'stihl_database.db'), { readonly: true });
const fitments = db
  .prepare('SELECT DISTINCT canonical_model_id, part_number FROM model_part_fitments')
  .all();
db.close();

const modelsByPart = new Map();
const partsByModel = new Map();
for (const row of fitments) {
  const part = normalize(row.part_number);
  const model = row.canonical_model_id;
  if (!part || !model) continue;
  if (!modelsByPart.has(part)) modelsByPart.set(part, new Set());
  modelsByPart.get(part).add(model);
  if (!partsByModel.has(model)) partsByModel.set(model, new Set());
  partsByModel.get(model).add(part);
}

const covered = new Set([...ebayParts, ...amazonParts]);
const gscModelCoverage = [...gscModels.entries()]
  .map(([model, metrics]) => {
    const parts = partsByModel.get(model) || new Set();
    const withEbay = [...parts].filter(part => ebayParts.has(part)).length;
    const withAmazon = [...parts].filter(part => amazonParts.has(part)).length;
    const withAny = [...parts].filter(part => covered.has(part)).length;
    return {
      model,
      clicks: metrics.clicks,
      impressions: metrics.impressions,
      parts: parts.size,
      parts_with_ebay: withEbay,
      parts_with_amazon: withAmazon,
      parts_with_any_direct_link: withAny,
      parts_without_any_direct_link: parts.size - withAny
    };
  })
  .sort((a, b) => b.clicks - a.clicks || a.model.localeCompare(b.model));

const baseline = {
  phase: '98',
  generated_at: new Date().toISOString(),
  production: {
    branch: 'main',
    commit: process.env.PHASE98_BASE_COMMIT || null,
    note: 'Phase 97 merged as 75210f2; Phase 98 works from that main.'
  },
  inputs: [
    stat('data/affiliate/ebay_offers.json'),
    stat('data/affiliate/verified_amazon_registry.json'),
    stat('data/parts_catalog.json'),
    stat('output/phase81/PHASE81_PRIORITY_MODELS.json')
  ],
  coverage: {
    ebay_active_offers: activeOffers.length,
    ebay_parts: ebayParts.size,
    ebay_marketplaces: ebayMarketplaces,
    ebay_active_items: new Set(activeOffers.map(offer => offer.item_id)).size,
    amazon_active_offers: amazonActive.length,
    amazon_parts: amazonParts.size,
    combined_parts: covered.size,
    overlap_ebay_amazon: [...ebayParts].filter(part => amazonParts.has(part)).length,
    // Part sets, so the end measurement diffs against exactly these keys.
    parts_ebay: [...ebayParts].sort(),
    parts_amazon: [...amazonParts].sort(),
    parts_combined: [...covered].sort()
  },
  researched_before_phase98: {
    unique_parts: researched.size,
    ...researchedByPhase,
    sources: ['output/phase96/batches/*_result.json', 'output/phase97/batches/*_progress.json']
  },
  gsc_priority_models: {
    models: gscModels.size,
    parts_with_any_direct_link: gscModelCoverage.reduce((sum, item) => sum + item.parts_with_any_direct_link, 0),
    parts_without_any_direct_link: gscModelCoverage.reduce((sum, item) => sum + item.parts_without_any_direct_link, 0)
  },
  campaign: {
    store_campaign_ids: [...new Set(activeOffers.map(offer => offer.campaign_id).filter(Boolean))],
    environment_campaign_id_matches_store:
      [...new Set(activeOffers.map(offer => offer.campaign_id).filter(Boolean))]
        .every(id => id === process.env.EBAY_EPN_CAMPAIGN_ID),
    environment_campaign_id_configured: /^\d+$/.test(process.env.EBAY_EPN_CAMPAIGN_ID || ''),
    production_bootstrap_source:
      'EbayStoreBootstrap: options.campaignId || archive.campaign_id || first offer campaign_id || EBAY_EPN_CAMPAIGN_ID'
  },
  gsc_model_coverage: gscModelCoverage
};

fs.writeFileSync(path.join(OUT98, 'PHASE98_BASELINE.json'), JSON.stringify(baseline, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  coverage: baseline.coverage,
  researched: baseline.researched_before_phase98,
  gsc: baseline.gsc_priority_models,
  campaign: baseline.campaign,
  top_gsc_models: gscModelCoverage.slice(0, 8)
}, null, 2));
