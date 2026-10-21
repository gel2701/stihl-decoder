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
export const MAX_EXPANSION_COHORT_SIZE = 500;
export const MAX_TOTAL_INDEXABLE_PARTS = PHASE54D_PILOT_SIZE + MAX_EXPANSION_COHORT_SIZE;

let cachedPilotList = null;
let cachedPilotMap = null;

let cachedExpansionList = null;
let cachedExpansionMap = null;

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

function ensureCombinedRegistry() {
  if (cachedCombinedMap) {
    return { list: cachedCombinedList, map: cachedCombinedMap };
  }

  const pilot = loadPilotConfig();
  const expansion = loadExpansionConfig();

  const combinedMap = new Map();
  const combinedList = [];

  // Add 50 pilot parts first (immutable priority)
  for (const entry of pilot.list) {
    combinedMap.set(entry.part_number, entry);
    combinedList.push(entry);
  }

  // Add expansion parts
  for (const entry of expansion.list) {
    if (!combinedMap.has(entry.part_number)) {
      if (combinedList.length >= MAX_TOTAL_INDEXABLE_PARTS) {
        console.error(`[PartIndexationRegistry] Hard stop: Total indexable parts exceeds ${MAX_TOTAL_INDEXABLE_PARTS}`);
        break;
      }
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
 * Resets all caches (for testing and hot-reloading).
 */
export function resetRegistryCache() {
  cachedPilotList = null;
  cachedPilotMap = null;
  cachedExpansionList = null;
  cachedExpansionMap = null;
  cachedCombinedList = null;
  cachedCombinedMap = null;
}
