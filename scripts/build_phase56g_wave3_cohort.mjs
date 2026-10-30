/**
 * Phase 56G — Controlled SEO Wave 3 Cohort Builder
 *
 * Evaluates every currently non-indexable canonical part against strict, reproducible
 * Wave 3 quality criteria and writes:
 *   - data/seo/part_indexation_wave3_56g.json   (explicit allowlist, deterministic, no timestamps)
 *   - output/phase56g/SEO_WAVE3_ELIGIBILITY.json (full per-part score breakdown + rejection reasons)
 *
 * Hard criteria (ALL must hold to publish):
 *   H1. Part is not already indexable (pilot / 56A / 56D cohorts untouched).
 *   H2. Fits at least one PUBLISHED model (data_status !== 'EVIDENCE_STORE_LINKED') with a public parts page.
 *   H3. At least two independent, normalized, resolved diagram sections on published models.
 *   H4. At least one meaningful (non-placeholder) diagram position on a published model.
 *   H5. Clean technical name (no encoding failure, no missing name, no anonymous fallback).
 *   H6. Not generic fastening hardware (screws, nuts, washers, rivets, pins, circlips) -> prevents thin/identical pages.
 *   H7. Unique display title among the whole indexable set (no identical-content pages).
 *
 * Ranking score (0-100, reproducible, no traffic or revenue assumptions):
 *   evidence (0-35)  : sections (≥2 => 20, +5 per extra up to +10) + meaningful positions (5)
 *   relevance (0-20) : published model breadth (2 pts per published model, max 20)
 *   intent (0-15)    : maintenance / wear component designation
 *   content (0-10)   : fitment rows on published models (1 pt per 3 rows, max 10)
 *   links (0-10)     : number of published model parts pages linking to the part (2 pts each, max 10)
 *   affiliate (0-10) : wear component (6) + clean commercial name (4); NO revenue estimates
 *
 * Fabricates nothing: no new parts, no inferred fitments, no ASINs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

import { PartNormalizer } from '../src/parts/PartNormalizer.js';
import { PartNameNormalizer } from '../src/parts/PartNameNormalizer.js';
import { SectionNormalizer } from '../src/parts/SectionNormalizer.js';
import { getSafeModelPartsPath } from '../src/publicationRules.js';
import { getPreWave3IndexablePartsSet, getAllIndexablePartsList, MAX_WAVE3_COHORT_SIZE } from '../src/seo/PartIndexationRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output', 'phase56g');
fs.mkdirSync(outputDir, { recursive: true });

export const WAVE3_MIN_SECTIONS = 2;
export const WAVE3_MIN_SCORE = 50;

const WEAR_REGEX = /carburet|carburateur|spark plug|bougie|air filter|filter|chain sprocket|sprocket|rim sprocket|clutch|koppeling|rewind starter|starter rope|starter grip|rewind spring|ignition|coil|cylinder|piston|zuiger|muffler|oil pump|oliepomp|fuel hose|fuel line|pickup|guide bar|saw chain|anti-vibration|annular buffer|av spring|gasket|seal|oil seal|diaphragm|primer|choke|throttle|brake band|chain catcher|chain tensioner|bearing|crankshaft|flywheel|fan housing|gear head|mowing head|trimmer head|blade|deflector/i;
// Generic / ambiguous head nouns (optionally preceded by up to 3 adjectives) -> standard hardware / thin content
const GENERIC_HARDWARE_REGEX = /^(?:[a-z\-]+\s+){0,3}(?:screws?|bolts?|nuts?|washers?|rivets?|pins?|circlips?|e-clips?|snap rings?|o-rings?|grommets?|caps?|sleeves?|balls?|ropes?|keys?|plugs?|springs?|clips?|clamps?|spacers?|bushings?|screw assembly)\b|^kraagschroef$/i;
// Technically specific designations that contain a generic noun but describe a functional component
const SPECIFIC_COMPONENT_WHITELIST = /high speed screw|low speed screw|idle speed screw|adjusting screw kit|spur gear|spark plug|rewind spring|starter rope|starter grip|bearing|oil seal|piston pin/i;
// Retailer-style scraped names that the display normalizer does not fully clean -> fail closed (H5)
const RETAILER_STYLE_REGEX = /\||chainsaw parts|trimmer parts|brushcutter parts|\bfits\b|\bfor stihl\b/i;
const MODEL_TOKEN_REGEX = /\b(?:MS|FS|BG|BR|HS|HL|KM|TS|MSA|FSA|BGA|HSA)\s?-?\d{2,3}/gi;
const UNRESOLVED_SECTIONS = new Set(['Unresolved Diagram Section', 'Algemene sectie']);
const NAME_REJECT_STATUSES = new Set(['MISSING', 'ENCODING_UNRESOLVED', 'RETAILER_STYLE_UNRESOLVED']);

export function buildWave3Cohort({ write = true } = {}) {
  const db = new Database(path.join(rootDir, 'data', 'stihl_database.db'), { readonly: true });
  const stihlDb = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'stihl_database.json'), 'utf8'));

  // Published models with a public parts path
  const publishedModels = (stihlDb.models || []).filter(m => m.data_status !== 'EVIDENCE_STORE_LINKED');
  const canonicalToModel = new Map();
  for (const m of publishedModels) {
    const canonId = (m.slug || m.id).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    canonicalToModel.set(canonId, { model: m, partsPath: getSafeModelPartsPath(m) });
  }

  const existingIndexable = getPreWave3IndexablePartsSet();
  const existingTitles = new Set(getAllIndexablePartsList().filter(p => existingIndexable.has(p.part_number)).map(p => (p.clean_name || '').toLowerCase() + '|' + p.part_number));

  const parts = db.prepare("SELECT part_number, part_name FROM parts WHERE sources != '[\"ghs\"]' ORDER BY part_number").all();
  const fitStmt = db.prepare("SELECT canonical_model_id, section_name, diagram_position FROM model_part_fitments WHERE part_number = ? AND source_id != 'ghs'");

  const evaluated = [];
  const rejectionCounts = {};
  const reject = (reason) => { rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1; };

  for (const p of parts) {
    const pn = PartNormalizer.normalizePartNumber(p.part_number);
    if (!pn) { reject('H0_INVALID_PART_NUMBER'); continue; }
    if (existingIndexable.has(pn)) { reject('H1_ALREADY_INDEXABLE'); continue; }

    const fits = fitStmt.all(p.part_number).filter(f => canonicalToModel.has(f.canonical_model_id));
    const linkingModels = new Set(fits.filter(f => canonicalToModel.get(f.canonical_model_id).partsPath).map(f => f.canonical_model_id));
    if (fits.length === 0 || linkingModels.size === 0) { reject('H2_NO_PUBLISHED_MODEL_WITH_PARTS_PAGE'); continue; }

    const sections = new Set();
    for (const f of fits) {
      const s = SectionNormalizer.normalizeSectionName(f.section_name);
      if (s && !UNRESOLVED_SECTIONS.has(s)) sections.add(s);
    }
    const hasMeaningfulPosition = fits.some(f => PartNormalizer.isMeaningfulDiagramPosition(f.diagram_position));
    const nameStatus = PartNameNormalizer.assessQuality(p.part_name, pn);
    const cleanName = PartNameNormalizer.normalizeDisplayName(p.part_name, pn);
    const isWear = WEAR_REGEX.test(p.part_name || '') || WEAR_REGEX.test(cleanName || '');
    const rawCore = String(p.part_name || '').replace(/^(?:genuine\s+)?stihl\s+(?:\d[\d\s]*\s+)?/i, '').trim();
    const isWhitelisted = SPECIFIC_COMPONENT_WHITELIST.test(cleanName || '');
    const isHardware = !isWhitelisted && (GENERIC_HARDWARE_REGEX.test((cleanName || '').trim()) || GENERIC_HARDWARE_REGEX.test(rawCore));
    const isRetailerStyle = RETAILER_STYLE_REGEX.test(cleanName || '') || ((cleanName || '').match(MODEL_TOKEN_REGEX) || []).length >= 1;

    const failures = [];
    if (sections.size < WAVE3_MIN_SECTIONS) failures.push('H3_FEWER_THAN_2_INDEPENDENT_SECTIONS');
    if (!hasMeaningfulPosition) failures.push('H4_NO_MEANINGFUL_DIAGRAM_POSITION');
    if (NAME_REJECT_STATUSES.has(nameStatus) || isRetailerStyle || !cleanName || cleanName.length < 3 || /^Onderdeel \d/.test(cleanName) || cleanName === 'STIHL onderdeel') {
      failures.push('H5_UNCLEAN_NAME');
    }
    if (isHardware) failures.push('H6_GENERIC_HARDWARE_THIN_CONTENT');

    // Only keep full breakdown for parts that passed H1/H2 (published-model relevant population)
    const sectionList = Array.from(sections).sort();
    const modelIds = Array.from(new Set(fits.map(f => f.canonical_model_id))).sort();
    const modelNames = modelIds.map(id => canonicalToModel.get(id).model.model_name);

    const evidence = (sections.size >= 2 ? 20 + Math.min((sections.size - 2) * 5, 10) : sections.size * 5) + (hasMeaningfulPosition ? 5 : 0);
    const relevance = Math.min(modelIds.length * 2, 20);
    const intent = isWear ? 15 : 0;
    const content = Math.min(Math.floor(fits.length / 3), 10);
    const links = Math.min(linkingModels.size * 2, 10);
    const affiliate = (isWear ? 6 : 0) + (nameStatus === 'CLEAN' || nameStatus === 'EXPLICIT_OVERRIDE' || nameStatus === 'NORMALIZED_SAFE' ? 4 : 0);
    const score = evidence + relevance + intent + content + links + affiliate;
    if (score < WAVE3_MIN_SCORE) failures.push('S1_SCORE_BELOW_THRESHOLD');

    evaluated.push({
      part_number: pn,
      part_number_display: PartNormalizer.formatPartNumber(pn),
      clean_name: cleanName,
      name_quality: nameStatus,
      score,
      score_breakdown: { evidence, relevance, intent, content, links, affiliate },
      section_count: sections.size,
      sections: sectionList,
      has_meaningful_diagram_position: hasMeaningfulPosition,
      published_model_count: modelIds.length,
      linking_parts_pages: linkingModels.size,
      published_fitment_rows: fits.length,
      sample_models: modelNames.slice(0, 5),
      is_wear_component: isWear,
      hard_criteria_failures: failures,
      eligible: failures.length === 0
    });
    if (failures.length) failures.forEach(reject);
  }

  evaluated.sort((a, b) => b.score - a.score || b.published_model_count - a.published_model_count || a.part_number.localeCompare(b.part_number));

  // H7: unique display title (name + number) — and also unique clean_name within cohort to avoid identical content
  const seenNames = new Map();
  const selected = [];
  for (const c of evaluated) {
    if (!c.eligible) continue;
    const key = c.clean_name.toLowerCase();
    if (existingTitles.has(key + '|' + c.part_number)) { c.eligible = false; c.hard_criteria_failures.push('H7_DUPLICATE_TITLE'); reject('H7_DUPLICATE_TITLE'); continue; }
    seenNames.set(key, (seenNames.get(key) || 0) + 1);
    if (selected.length >= MAX_WAVE3_COHORT_SIZE) { c.eligible = false; c.hard_criteria_failures.push('C1_COHORT_CAP_REACHED'); reject('C1_COHORT_CAP_REACHED'); continue; }
    selected.push(c);
  }

  const cohort = {
    schema_version: '1.0.0',
    phase: 'Phase 56G',
    policy: 'EXPLICIT_ALLOWLIST_ONLY',
    selection_policy: 'WAVE3_STRICT_H1_H7_MIN_2_INDEPENDENT_SECTIONS',
    cohort_size: selected.length,
    parts: selected.map(c => ({
      part_number: c.part_number,
      part_number_display: c.part_number_display,
      clean_name: c.clean_name,
      category: 'overige',
      enabled: true,
      source_cohort: 'PHASE_56G_WAVE3',
      seo_tier: 'SEO_TIER_A',
      commercial_tier: c.is_wear_component ? 'COMMERCIAL_HIGH' : 'COMMERCIAL_MEDIUM',
      seo_score: c.score,
      model_count: c.published_model_count,
      fitment_count: c.published_fitment_rows,
      section_count: c.section_count,
      sample_models: c.sample_models,
      primary_section: c.sections[0] || null,
      reason: `Wave 3 strict candidate (${c.score} pts): ${c.section_count} independent sections (${c.sections.slice(0, 3).join(', ')}), ${c.published_model_count} published models`
    }))
  };

  const eligible = evaluated.filter(c => c.hard_criteria_failures.length === 0 || c.eligible);
  const nearMiss = evaluated
    .filter(c => !c.eligible && c.hard_criteria_failures.length === 1 && c.hard_criteria_failures[0] === 'H3_FEWER_THAN_2_INDEPENDENT_SECTIONS' && c.section_count === 1)
    .slice(0, 50);

  const eligibilityDoc = {
    phase: 'PHASE_56G',
    artifact: 'SEO_WAVE3_ELIGIBILITY',
    reproducible: true,
    generator: 'scripts/build_phase56g_wave3_cohort.mjs',
    criteria: {
      hard: ['H1_NOT_ALREADY_INDEXABLE', 'H2_PUBLISHED_MODEL_WITH_PARTS_PAGE', 'H3_MIN_2_INDEPENDENT_SECTIONS', 'H4_MEANINGFUL_DIAGRAM_POSITION', 'H5_CLEAN_NAME', 'H6_NOT_GENERIC_HARDWARE', 'H7_UNIQUE_TITLE'],
      min_score: WAVE3_MIN_SCORE,
      max_cohort: MAX_WAVE3_COHORT_SIZE,
      score_components: {
        evidence: '0-35: ≥2 sections => 20 (+5 per extra, max +10); meaningful position +5',
        relevance: '0-20: 2 pts per published model',
        intent: '0-15: maintenance/wear component',
        content: '0-10: 1 pt per 3 published fitment rows',
        links: '0-10: 2 pts per linking published parts page',
        affiliate: '0-10: wear (6) + clean commercial name (4); no revenue estimates'
      }
    },
    population: {
      canonical_parts: parts.length,
      already_indexable: existingIndexable.size,
      evaluated_on_published_models: evaluated.length,
      eligible_and_selected: selected.length
    },
    rejection_counts: rejectionCounts,
    selected: selected,
    near_miss_single_section_top50: nearMiss.map(c => ({ part_number: c.part_number, clean_name: c.clean_name, score: c.score, sections: c.sections, published_model_count: c.published_model_count }))
  };

  if (write) {
    fs.writeFileSync(path.join(rootDir, 'data', 'seo', 'part_indexation_wave3_56g.json'), JSON.stringify(cohort, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'SEO_WAVE3_ELIGIBILITY.json'), JSON.stringify(eligibilityDoc, null, 2) + '\n', 'utf8');
  }
  db.close();
  return { cohort, eligibilityDoc, eligibleCount: eligible.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const { cohort, eligibilityDoc } = buildWave3Cohort({ write: true });
  console.log(`Evaluated on published models: ${eligibilityDoc.population.evaluated_on_published_models}`);
  console.log(`Selected Wave 3 cohort: ${cohort.cohort_size}`);
  console.log('Rejections:', eligibilityDoc.rejection_counts);
  console.log('Top 10:', cohort.parts.slice(0, 10).map(p => `${p.part_number} ${p.clean_name} (${p.seo_score}) [${p.section_count} secs]`));
}
