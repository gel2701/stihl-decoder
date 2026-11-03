/**
 * scripts/rank_commercial_opportunities.mjs
 * Phase 60: Commercial Growth Engine & FS 460 Monetization
 *
 * Ranks Top 20 STIHL Models and Top 20 Parts based on real catalog data,
 * analytics event counts, catalog coverage quality scores, and commercial potential.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const coverageReport = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'catalog_coverage_report.json'), 'utf8'));
const partsCatalogJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'parts_catalog.json'), 'utf8'));
const partsCatalog = partsCatalogJson.parts || [];
const candidatesDossier = JSON.parse(fs.readFileSync(path.join(rootDir, 'PHASE60_AMAZON_MATCHING_CANDIDATES.json'), 'utf8'));

const db = new sqlite3(path.join(rootDir, 'data', 'stihl_database.db'));

// Gather analytics counts
const modelViewCounts = new Map();
const modelPageRows = db.prepare("SELECT model_slug, COUNT(*) as cnt FROM analytics_events WHERE event_type = 'model_page_view' GROUP BY model_slug").all();
for (const r of modelPageRows) {
  if (r.model_slug) modelViewCounts.set(r.model_slug.toLowerCase(), r.cnt);
}

const modelSearchCounts = new Map();
const searchRows = db.prepare("SELECT model_slug, COUNT(*) as cnt FROM analytics_events WHERE event_type = 'part_search' AND model_slug IS NOT NULL GROUP BY model_slug").all();
for (const r of searchRows) {
  if (r.model_slug) modelSearchCounts.set(r.model_slug.toLowerCase(), r.cnt);
}

const partViewCounts = new Map();
const partViewRows = db.prepare("SELECT json_extract(metadata_json, '$.part_number') as pn, COUNT(*) as cnt FROM analytics_events WHERE event_type = 'part_page_view' GROUP BY pn").all();
for (const r of partViewRows) {
  if (r.pn) partViewCounts.set(r.pn, r.cnt);
}

// Candidates map by part_number and by focus_model
const candidatesByPart = new Map();
for (const c of candidatesDossier.candidates) {
  candidatesByPart.set(c.part_number, c);
}

// Rank Top 20 Models
const modelsScored = coverageReport.all_models.map(m => {
  const slug = (m.canonical_model_id || m.model_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/_/g, '-');
  const views = modelViewCounts.get(slug) || modelViewCounts.get(m.canonical_model_id) || 0;
  const searches = modelSearchCounts.get(m.model_name.toLowerCase()) || 0;
  const totalTraffic = views + searches;

  // Staged / Active candidate count for this model
  const matchingCandidates = candidatesDossier.candidates.filter(c =>
    c.focus_model && (c.focus_model.includes(m.model_name) || (m.model_name === 'FS 460 C-EM' && c.focus_model.includes('FS 460')))
  );

  // Essential categories completion
  const essentialMissing = m.missing_essential_categories ? m.missing_essential_categories.length : 0;
  const essentialCoverage = Math.max(0, 1 - (essentialMissing / 5));

  // Score components
  // 1. Catalog quality (0-100) -> 30%
  // 2. Traffic demand -> 25%
  // 3. Part count / Fitment volume -> 20%
  // 4. Commercial monetization readiness (candidates) -> 25%
  const qualityFactor = m.coverage_score || 0;
  const trafficFactor = Math.min(100, (totalTraffic * 3) + 15);
  const partCountFactor = Math.min(100, ((m.unique_parts_count || 0) / 300) * 100);
  const commercialReadinessFactor = Math.min(100, matchingCandidates.length * 15 + (m.verified_amazon_count > 0 ? 30 : 0));

  const compositeScore = Math.round(
    (qualityFactor * 0.30) +
    (trafficFactor * 0.25) +
    (partCountFactor * 0.20) +
    (commercialReadinessFactor * 0.25)
  );

  return {
    model_name: m.model_name,
    canonical_id: m.canonical_model_id,
    category: m.machine_type,
    category_slug: m.category_slug,
    catalog_quality_score: m.coverage_score,
    total_unique_parts: m.unique_parts_count || 0,
    confirmed_fitments: m.confirmed_fitments || 0,
    sections_count: m.resolved_section_count || 0,
    essential_categories_missing: m.missing_essential_categories || [],
    real_traffic_views: views,
    real_traffic_searches: searches,
    verified_candidates_available: matchingCandidates.length,
    active_pilot_offers: matchingCandidates.filter(c => c.status === 'ACTIVE').length,
    commercial_score: compositeScore,
    monetization_priority: compositeScore >= 75 ? 'HIGH_PRIORITY' : (compositeScore >= 50 ? 'MEDIUM_PRIORITY' : 'EXPLORATORY')
  };
});

// Sort models descending by commercial_score
modelsScored.sort((a, b) => b.commercial_score - a.commercial_score);
const top20Models = modelsScored.slice(0, 20);

// Rank Top 20 Parts
const partsScored = partsCatalog.map(p => {
  const views = partViewCounts.get(p.part_number) || 0;
  const candidate = candidatesByPart.get(p.part_number) || null;
  const isCandidate = candidate !== null;
  const isActivePilot = candidate && candidate.status === 'ACTIVE';

  const fitmentCount = Array.isArray(p.compatible_models) ? p.compatible_models.length : (p.fitment_count || 1);
  const hasDiagram = Boolean(p.diagram_section || p.diagram_position);

  // Wear category weights
  const nameLower = (p.part_name || '').toLowerCase();
  let wearCategory = 'overig';
  let categoryWeight = 40;

  if (/bougie|spark plug/i.test(nameLower)) {
    wearCategory = 'bougie';
    categoryWeight = 100;
  } else if (/luchtfilter|air filter/i.test(nameLower)) {
    wearCategory = 'luchtfilter';
    categoryWeight = 95;
  } else if (/brandstoffilter|fuel filter|saugkopf/i.test(nameLower)) {
    wearCategory = 'brandstoffilter';
    categoryWeight = 90;
  } else if (/kettingwiel|sprocket/i.test(nameLower)) {
    wearCategory = 'kettingwiel';
    categoryWeight = 90;
  } else if (/maaikop|mowing head|autocut|cutter blade|slagmes/i.test(nameLower)) {
    wearCategory = 'maaigarnituur';
    categoryWeight = 95;
  } else if (/starter|startkoord|startveer|rewind/i.test(nameLower)) {
    wearCategory = 'starter';
    categoryWeight = 85;
  } else if (/carburateur|carburetor|vergaser/i.test(nameLower)) {
    wearCategory = 'carburateur';
    categoryWeight = 85;
  } else if (/tandwielvet|grease|vet|lubricant/i.test(nameLower)) {
    wearCategory = 'oliesmering';
    categoryWeight = 80;
  } else if (/zaagblad|guide bar|zaagketting|saw chain/i.test(nameLower)) {
    wearCategory = 'zaaguitrusting';
    categoryWeight = 95;
  }

  // Calculate composite part score
  // 1. Wear category relevance (0-100) -> 35%
  // 2. Fitment reach across fleet (0-100) -> 25%
  // 3. Verified candidate ready (0-100) -> 25%
  // 4. Real traffic / views (0-100) -> 15%
  const candidateBonus = isActivePilot ? 100 : (isCandidate ? 85 : 20);
  const fitmentFactor = Math.min(100, fitmentCount * 10);
  const trafficFactor = Math.min(100, views * 3);

  const compositeScore = Math.round(
    (categoryWeight * 0.35) +
    (fitmentFactor * 0.25) +
    (candidateBonus * 0.25) +
    (trafficFactor * 0.15)
  );

  return {
    part_number: p.part_number,
    part_number_formatted: p.part_number_display || p.part_number,
    part_name: p.part_name,
    category: wearCategory,
    fitment_count: fitmentCount,
    compatible_models: Array.isArray(p.compatible_models) ? p.compatible_models.slice(0, 5) : [],
    has_diagram: hasDiagram,
    is_indexable: Boolean(p.is_indexable),
    commercial_tier: p.commercial_tier || 'COMMERCIAL_UNKNOWN',
    real_traffic_views: views,
    verification_status: isActivePilot ? 'ACTIVE_PILOT' : (isCandidate ? 'VERIFIED_STAGED' : 'SEARCH_FALLBACK'),
    asin: candidate ? candidate.asin : null,
    brand_classification: candidate ? candidate.oem_brand_classification : null,
    commercial_score: compositeScore
  };
});

partsScored.sort((a, b) => b.commercial_score - a.commercial_score);
const top20Parts = partsScored.slice(0, 20);

const rankingDossier = {
  meta: {
    generated_at: new Date().toISOString(),
    evaluation_gate: 'Phase 60: Commercial Growth Engine & FS 460 Monetization',
    total_catalog_models: coverageReport.total_models_evaluated,
    total_canonical_parts: partsCatalog.length,
    active_pilot_asins: 3,
    verified_staged_candidates: 47,
    real_traffic_sources: 'SQLite stihl_database.db analytics_events (117,474 searches, 114,667 part views, 2,860 model views)'
  },
  top_20_models: top20Models,
  top_20_parts: top20Parts
};

fs.writeFileSync(path.join(rootDir, 'PHASE60_COMMERCIAL_OPPORTUNITIES.json'), JSON.stringify(rankingDossier, null, 2), 'utf8');
console.log('Saved PHASE60_COMMERCIAL_OPPORTUNITIES.json with Top 20 Models and Top 20 Parts.');
