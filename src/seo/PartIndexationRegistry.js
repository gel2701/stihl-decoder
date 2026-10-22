/**
 * Centralized Part Indexation Registry for STIHLDecoder.nl
 * Phase 56A — Parts Commercial Growth Foundation
 *
 * Unifies the Phase 54D Pilot allowlist (50 parts) and the Phase 56A SEO Expansion Cohort
 * into a single fail-closed, deterministic indexation gateway.
 *
 * INVARIANTS:
 * 1. The original 50 Phase 54D pilot parts remain 100% protected and enabled.
 * 2. The Phase 56A expansion cohort adds high-quality, evidence-rich, commercial parts.
 * 3. All non-approved parts remain strictly 'noindex, follow'.
 * 4. Zero runtime classifier heuristics for indexation — explicit registry membership only.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

export const PHASE54D_PILOT_SIZE = 50;
export const MAX_EXPANSION_COHORT_SIZE = 350;
export const MAX_WAVE2_COHORT_SIZE = 400;
// Phase 56G — Controlled SEO Wave 3 (strict H1-H7 criteria, max +400 => hard ceiling 1,200)
export const MAX_WAVE3_COHORT_SIZE = 400;
// Phase 56I — Controlled SEO Wave 4 (strict H1-H7 post-section-resolution, max +41 => <= 845 active)
export const MAX_WAVE4_COHORT_SIZE = 41;
export const MAX_TOTAL_INDEXABLE_PARTS = PHASE54D_PILOT_SIZE + MAX_EXPANSION_COHORT_SIZE + MAX_WAVE2_COHORT_SIZE + MAX_WAVE3_COHORT_SIZE;

let cachedPilotList = null;
let cachedPilotMap = null;

let cachedExpansionList = null;
let cachedExpansionMap = null;

let cachedWave2List = null;
let cachedWave2Map = null;

let cachedWave3List = null;
let cachedWave3Map = null;

let cachedWave4List = null;
let cachedWave4Map = null;

let cachedCombinedList = null;
let cachedCombinedMap = null;

function loadPilotConfig() {
  if (cachedPilotMap) {
    return { list: cachedPilotList, map: cachedPilotMap };
  }

  const pilotPath = path.join(rootDir, 'data', 'seo', 'part_indexation_pilot.json');
  const map = new Map();
  const list = [];

  if (fs.existsSync(pilotPath)) {
    try {
      const raw = fs.readFileSync(pilotPath, 'utf8');
      const parsed = JSON.parse(raw);
      const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];

      for (const p of parts) {
        if (!p || typeof p !== 'object') continue;
        const normPart = PartNormalizer.normalizePartNumber(p.part_number);
        if (!normPart) continue;

        if (p.enabled === true) {
          if (list.length >= PHASE54D_PILOT_SIZE) {
            console.error(`[PartIndexationRegistry] Hard stop: Pilot size exceeds ${PHASE54D_PILOT_SIZE}`);
            break;
          }
          const entry = {
            part_number: normPart,
            part_number_display: p.part_number_display || PartNormalizer.formatPartNumber(normPart),
            clean_name: p.clean_name || null,
            category: p.category || 'overige',
            enabled: true,
            source_cohort: 'PHASE_54D_PILOT',
            seo_tier: p.seo_tier || 'SEO_TIER_A',
            commercial_tier: p.commercial_tier || 'COMMERCIAL_HIGH',
            model_count: p.model_count || 1,
            reason: p.reason || ''
          };
          map.set(normPart, entry);
          list.push(entry);
        }
      }
    } catch (err) {
      console.error(`[PartIndexationRegistry] Error loading pilot: ${err.message}`);
    }
  }

  cachedPilotList = list;
  cachedPilotMap = map;
  return { list: cachedPilotList, map: cachedPilotMap };
}

function loadExpansionConfig() {
  if (cachedExpansionMap) {
    return { list: cachedExpansionList, map: cachedExpansionMap };
  }

  const expansionPath = path.join(rootDir, 'data', 'seo', 'part_indexation_expansion_56a.json');
  const map = new Map();
  const list = [];

  if (fs.existsSync(expansionPath)) {
    try {
      const raw = fs.readFileSync(expansionPath, 'utf8');
      const parsed = JSON.parse(raw);
      const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];

      for (const p of parts) {
        if (!p || typeof p !== 'object') continue;
        const normPart = PartNormalizer.normalizePartNumber(p.part_number);
        if (!normPart) continue;

        if (p.enabled === true) {
          if (list.length >= MAX_EXPANSION_COHORT_SIZE) {
            console.error(`[PartIndexationRegistry] Hard stop: Expansion size exceeds ${MAX_EXPANSION_COHORT_SIZE}`);
            break;
          }
          const entry = {
            part_number: normPart,
            part_number_display: p.part_number_display || PartNormalizer.formatPartNumber(normPart),
            clean_name: p.clean_name || null,
            category: p.category || 'overige',
            enabled: true,
            source_cohort: 'PHASE_56A_EXPANSION',
            seo_tier: p.seo_tier || 'SEO_TIER_A',
            commercial_tier: p.commercial_tier || 'COMMERCIAL_HIGH',
            seo_score: p.seo_score,
            model_count: p.model_count || 0,
            fitment_count: p.fitment_count || 0,
            sample_models: p.sample_models || [],
            primary_section: p.primary_section || null,
            reason: p.reason || ''
          };
          map.set(normPart, entry);
          list.push(entry);
        }
      }
    } catch (err) {
      console.error(`[PartIndexationRegistry] Error loading expansion cohort: ${err.message}`);
    }
  }

  cachedExpansionList = list;
  cachedExpansionMap = map;
  return { list: cachedExpansionList, map: cachedExpansionMap };
}

function loadWave2Config() {
  if (cachedWave2Map) {
    return { list: cachedWave2List, map: cachedWave2Map };
  }

  const wave2Path = path.join(rootDir, 'data', 'seo', 'part_indexation_wave2_56d.json');
  const map = new Map();
  const list = [];

  if (fs.existsSync(wave2Path)) {
    try {
      const raw = fs.readFileSync(wave2Path, 'utf8');
      const parsed = JSON.parse(raw);
      const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];

      for (const p of parts) {
        if (!p || typeof p !== 'object') continue;
        const normPart = PartNormalizer.normalizePartNumber(p.part_number);
        if (!normPart) continue;

        if (p.enabled === true) {
          if (list.length >= MAX_WAVE2_COHORT_SIZE) {
            console.error(`[PartIndexationRegistry] Hard stop: Wave 2 size exceeds ${MAX_WAVE2_COHORT_SIZE}`);
            break;
          }
          const entry = {
            part_number: normPart,
            part_number_display: p.part_number_display || PartNormalizer.formatPartNumber(normPart),
            clean_name: p.clean_name || null,
            category: p.category || 'overige',
            enabled: true,
            source_cohort: 'PHASE_56D_WAVE2',
            seo_tier: p.seo_tier || 'SEO_TIER_A',
            commercial_tier: p.commercial_tier || 'COMMERCIAL_MEDIUM',
            seo_score: p.seo_score,
            model_count: p.model_count || 0,
            fitment_count: p.fitment_count || 0,
            sample_models: p.sample_models || [],
            primary_section: p.primary_section || null,
            reason: p.reason || ''
          };
          map.set(normPart, entry);
          list.push(entry);
        }
      }
    } catch (err) {
      console.error(`[PartIndexationRegistry] Error loading Wave 2 cohort: ${err.message}`);
    }
  }

  cachedWave2List = list;
  cachedWave2Map = map;
  return { list: cachedWave2List, map: cachedWave2Map };
}

function loadWave3Config() {
  if (cachedWave3Map) {
    return { list: cachedWave3List, map: cachedWave3Map };
  }

  const wave3Path = path.join(rootDir, 'data', 'seo', 'part_indexation_wave3_56g.json');
  const map = new Map();
  const list = [];

  if (fs.existsSync(wave3Path)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(wave3Path, 'utf8'));
      const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];

      for (const p of parts) {
        if (!p || typeof p !== 'object') continue;
        const normPart = PartNormalizer.normalizePartNumber(p.part_number);
        if (!normPart) continue;
        // Fail-closed: Wave 3 entries require explicit enablement AND >= 2 independent sections
        if (p.enabled !== true) continue;
        if (!(Number(p.section_count) >= 2)) continue;
        if (list.length >= MAX_WAVE3_COHORT_SIZE) {
          console.error(`[PartIndexationRegistry] Hard stop: Wave 3 size exceeds ${MAX_WAVE3_COHORT_SIZE}`);
          break;
        }
        const entry = {
          part_number: normPart,
          part_number_display: p.part_number_display || PartNormalizer.formatPartNumber(normPart),
          clean_name: p.clean_name || null,
          category: p.category || 'overige',
          enabled: true,
          source_cohort: 'PHASE_56G_WAVE3',
          seo_tier: p.seo_tier || 'SEO_TIER_A',
          commercial_tier: p.commercial_tier || 'COMMERCIAL_MEDIUM',
          seo_score: p.seo_score,
          model_count: p.model_count || 0,
          fitment_count: p.fitment_count || 0,
          section_count: p.section_count,
          sample_models: p.sample_models || [],
          primary_section: p.primary_section || null,
          reason: p.reason || ''
        };
        map.set(normPart, entry);
        list.push(entry);
      }
    } catch (err) {
      console.error(`[PartIndexationRegistry] Error loading Wave 3 cohort: ${err.message}`);
    }
  }

  cachedWave3List = list;
  cachedWave3Map = map;
  return { list: cachedWave3List, map: cachedWave3Map };
}

function loadWave4Config() {
  if (cachedWave4Map) {
    return { list: cachedWave4List, map: cachedWave4Map };
  }

  const wave4Path = path.join(rootDir, 'data', 'seo', 'part_indexation_wave4_56i.json');
  const map = new Map();
  const list = [];

  if (fs.existsSync(wave4Path)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(wave4Path, 'utf8'));
      const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];

      for (const p of parts) {
        if (!p || typeof p !== 'object') continue;
        const normPart = PartNormalizer.normalizePartNumber(p.part_number);
        if (!normPart) continue;
        // Fail-closed: Wave 4 entries require explicit enablement AND >= 2 independent resolved sections
        if (p.enabled !== true) continue;
        if (!(Number(p.section_count) >= 2)) continue;
        if (list.length >= MAX_WAVE4_COHORT_SIZE) {
          console.error(`[PartIndexationRegistry] Hard stop: Wave 4 size exceeds ${MAX_WAVE4_COHORT_SIZE}`);
          break;
        }
        const entry = {
          part_number: normPart,
          part_number_display: p.part_number_display || PartNormalizer.formatPartNumber(normPart),
          clean_name: p.clean_name || null,
          category: p.category || 'overige',
          enabled: true,
          source_cohort: 'PHASE_56I_WAVE4',
          wave_identifier: 'wave4',
          seo_tier: p.seo_tier || 'SEO_TIER_A',
          commercial_tier: p.commercial_tier || 'COMMERCIAL_MEDIUM',
          seo_score: p.seo_score,
          model_count: p.model_count || 0,
          fitment_count: p.fitment_count || 0,
          section_count: p.section_count,
          sections: p.sections || [],
          sample_models: p.sample_models || [],
          primary_section: p.primary_section || null,
          reason: p.reason || ''
        };
        map.set(normPart, entry);
        list.push(entry);
      }
    } catch (err) {
      console.error(`[PartIndexationRegistry] Error loading Wave 4 cohort: ${err.message}`);
    }
  }

  cachedWave4List = list;
  cachedWave4Map = map;
  return { list: cachedWave4List, map: cachedWave4Map };
}

function ensureCombinedRegistry() {
  if (cachedCombinedMap) {
    return { list: cachedCombinedList, map: cachedCombinedMap };
  }

  const pilot = loadPilotConfig();
  const expansion = loadExpansionConfig();
  const wave2 = loadWave2Config();
  const wave3 = loadWave3Config();
  const wave4 = loadWave4Config();

  const combinedMap = new Map();
  const combinedList = [];

  // Add 50 pilot parts first (immutable priority)
  for (const entry of pilot.list) {
    entry.wave_identifier = entry.wave_identifier || 'pilot';
    combinedMap.set(entry.part_number, entry);
    combinedList.push(entry);
  }

  // Add Phase 56A expansion parts
  for (const entry of expansion.list) {
    if (!combinedMap.has(entry.part_number)) {
      if (combinedList.length >= MAX_TOTAL_INDEXABLE_PARTS) {
        console.error(`[PartIndexationRegistry] Hard stop: Total indexable parts exceeds ${MAX_TOTAL_INDEXABLE_PARTS}`);
        break;
      }
      entry.wave_identifier = entry.wave_identifier || 'wave1';
      combinedMap.set(entry.part_number, entry);
      combinedList.push(entry);
    }
  }

  // Add Phase 56D Wave 2 parts
  for (const entry of wave2.list) {
    if (!combinedMap.has(entry.part_number)) {
      if (combinedList.length >= MAX_TOTAL_INDEXABLE_PARTS) {
        console.error(`[PartIndexationRegistry] Hard stop: Total indexable parts exceeds ${MAX_TOTAL_INDEXABLE_PARTS}`);
        break;
      }
      entry.wave_identifier = entry.wave_identifier || 'wave2';
      combinedMap.set(entry.part_number, entry);
      combinedList.push(entry);
    }
  }

  // Add Phase 56G Wave 3 parts
  for (const entry of wave3.list) {
    if (!combinedMap.has(entry.part_number)) {
      if (combinedList.length >= MAX_TOTAL_INDEXABLE_PARTS) {
        console.error(`[PartIndexationRegistry] Hard stop: Total indexable parts exceeds ${MAX_TOTAL_INDEXABLE_PARTS}`);
        break;
      }
      entry.wave_identifier = entry.wave_identifier || 'wave3';
      combinedMap.set(entry.part_number, entry);
      combinedList.push(entry);
    }
  }

  // Add Phase 56I Wave 4 parts
  for (const entry of wave4.list) {
    if (!combinedMap.has(entry.part_number)) {
      if (combinedList.length >= MAX_TOTAL_INDEXABLE_PARTS) {
        console.error(`[PartIndexationRegistry] Hard stop: Total indexable parts exceeds ${MAX_TOTAL_INDEXABLE_PARTS}`);
        break;
      }
      entry.wave_identifier = 'wave4';
      combinedMap.set(entry.part_number, entry);
      combinedList.push(entry);
    }
  }

  cachedCombinedList = combinedList;
  cachedCombinedMap = combinedMap;
  return { list: cachedCombinedList, map: cachedCombinedMap };
}

/**
 * Returns whether a part is authorized for search engine indexation.
 * Fails closed to false if part is not in the explicit allowlists.
 *
 * @param {string} rawPartNumber
 * @returns {boolean}
 */
export function isPartIndexable(rawPartNumber) {
  if (!rawPartNumber) return false;
  const norm = PartNormalizer.normalizePartNumber(rawPartNumber);
  if (!norm) return false;

  const { map } = ensureCombinedRegistry();
  const entry = map.get(norm);
  return Boolean(entry && entry.enabled === true);
}

/**
 * Retrieves indexable metadata entry for an authorized part.
 *
 * @param {string} rawPartNumber
 * @returns {Object|null}
 */
export function getIndexablePartEntry(rawPartNumber) {
  if (!rawPartNumber) return null;
  const norm = PartNormalizer.normalizePartNumber(rawPartNumber);
  if (!norm) return null;

  const { map } = ensureCombinedRegistry();
  return map.get(norm) || null;
}

/**
 * Returns full list of all indexable parts (Pilot + Expansion).
 * @returns {Array<Object>}
 */
export function getAllIndexablePartsList() {
  const { list } = ensureCombinedRegistry();
  return list;
}

/**
 * Returns Set of all indexable part numbers (Pilot + Expansion).
 * @returns {Set<string>}
 */
export function getAllIndexablePartsSet() {
  const { map } = ensureCombinedRegistry();
  return new Set(map.keys());
}

/**
 * Returns Phase 54D Pilot list only (exactly 50 parts).
 * @returns {Array<Object>}
 */
export function getPilotPartsList() {
  const { list } = loadPilotConfig();
  return list;
}

/**
 * Returns Phase 54D Pilot set only (exactly 50 parts).
 * @returns {Set<string>}
 */
export function getPilotPartsSet() {
  const { map } = loadPilotConfig();
  return new Set(map.keys());
}

/**
 * Returns Phase 56A Expansion cohort list only.
 * @returns {Array<Object>}
 */
export function getExpansionCohortList() {
  const { list } = loadExpansionConfig();
  return list;
}

/**
 * Returns Phase 56D Wave 2 cohort list only.
 * @returns {Array<Object>}
 */
export function getWave2CohortList() {
  const { list } = loadWave2Config();
  return list;
}

/**
 * Returns Phase 56D Wave 2 cohort set only.
 * @returns {Set<string>}
 */
export function getWave2CohortSet() {
  const { map } = loadWave2Config();
  return new Set(map.keys());
}

/**
 * Returns Phase 56G Wave 3 cohort list only.
 * @returns {Array<Object>}
 */
export function getWave3CohortList() {
  const { list } = loadWave3Config();
  return list;
}

/**
 * Returns Phase 56G Wave 3 cohort set only.
 * @returns {Set<string>}
 */
export function getWave3CohortSet() {
  const { map } = loadWave3Config();
  return new Set(map.keys());
}

/**
 * Returns the indexable set as it existed before Wave 3 (pilot + 56A + 56D).
 * Used by the reproducible Wave 3 builder so re-runs are idempotent.
 * @returns {Set<string>}
 */
export function getPreWave3IndexablePartsSet() {
  const set = new Set();
  for (const e of loadPilotConfig().list) set.add(e.part_number);
  for (const e of loadExpansionConfig().list) set.add(e.part_number);
  for (const e of loadWave2Config().list) set.add(e.part_number);
  return set;
}

/**
 * Returns Phase 56I Wave 4 cohort list only.
 * @returns {Array<Object>}
 */
export function getWave4CohortList() {
  const { list } = loadWave4Config();
  return list;
}

/**
 * Returns Phase 56I Wave 4 cohort set only.
 * @returns {Set<string>}
 */
export function getWave4CohortSet() {
  const { map } = loadWave4Config();
  return new Set(map.keys());
}

/**
 * Returns the indexable set as it existed before Wave 4 (pilot + 56A + 56D + 56G = 804).
 * Used by the reproducible Wave 4 builder and historical phase parity tests.
 * @returns {Set<string>}
 */
export function getPreWave4IndexablePartsSet() {
  const set = getPreWave3IndexablePartsSet();
  for (const e of loadWave3Config().list) set.add(e.part_number);
  return set;
}

/**
 * Resets all caches (for testing and hot-reloading).
 */
export function resetRegistryCache() {
  cachedPilotList = null;
  cachedPilotMap = null;
  cachedExpansionList = null;
  cachedExpansionMap = null;
  cachedWave2List = null;
  cachedWave2Map = null;
  cachedWave3List = null;
  cachedWave3Map = null;
  cachedWave4List = null;
  cachedWave4Map = null;
  cachedCombinedList = null;
  cachedCombinedMap = null;
}
