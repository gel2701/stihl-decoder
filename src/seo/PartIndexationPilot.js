/**
 * Part Indexation Pilot Controller for STIHLDecoder.nl
 * Phase 54D — Controlled Individual Part Indexation Pilot
 *
 * Implements strict, fail-closed allowlist policy for selective indexation
 * of individual part detail pages. Maximum 50 parts.
 *
 * ZERO RUNTIME CLASSIFIER DEPENDENCY:
 * Only explicit entries in data/seo/part_indexation_pilot.json with enabled === true
 * are granted 'index, follow' and sitemap inclusion.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PartNormalizer } from '../parts/PartNormalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

export const MAX_PILOT_SIZE = 50;

let cachedPilotData = null;
let cachedPilotMap = null;

function loadPilotConfig() {
  if (cachedPilotMap) {
    return { list: cachedPilotData, map: cachedPilotMap };
  }

  const pilotPath = path.join(rootDir, 'data', 'seo', 'part_indexation_pilot.json');
  if (!fs.existsSync(pilotPath)) {
    console.warn(`[PartIndexationPilot] Pilot configuration not found at ${pilotPath}`);
    cachedPilotData = [];
    cachedPilotMap = new Map();
    return { list: cachedPilotData, map: cachedPilotMap };
  }

  try {
    const raw = fs.readFileSync(pilotPath, 'utf8');
    const parsed = JSON.parse(raw);
    const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];

    const map = new Map();
    const list = [];

    for (const p of parts) {
      if (!p || typeof p !== 'object') continue;
      const normPart = PartNormalizer.normalizePartNumber(p.part_number);
      if (!normPart) continue;

      if (p.enabled === true) {
        if (list.length >= MAX_PILOT_SIZE) {
          console.error(`[PartIndexationPilot] HARD STOP: Pilot size exceeds MAX_PILOT_SIZE (${MAX_PILOT_SIZE})! Ignoring excess part ${normPart}`);
          break;
        }
        const entry = {
          part_number: normPart,
          part_number_display: p.part_number_display || PartNormalizer.formatPartNumber(normPart),
          clean_name: p.clean_name || null,
          category: p.category || 'overige',
          enabled: true,
          reason: p.reason || ''
        };
        map.set(normPart, entry);
        list.push(entry);
      }
    }

    cachedPilotData = list;
    cachedPilotMap = map;
    return { list: cachedPilotData, map: cachedPilotMap };
  } catch (err) {
    console.error(`[PartIndexationPilot] Error loading pilot configuration: ${err.message}`);
    cachedPilotData = [];
    cachedPilotMap = new Map();
    return { list: cachedPilotData, map: cachedPilotMap };
  }
}

/**
 * Checks whether an individual part number is an authorized member of the indexation pilot.
 * Fails closed to false if part is not in allowlist or not enabled.
 *
 * @param {string} rawPartNumber
 * @returns {boolean}
 */
export function isPartIndexationPilotEnabled(rawPartNumber) {
  if (!rawPartNumber) return false;
  const norm = PartNormalizer.normalizePartNumber(rawPartNumber);
  if (!norm) return false;

  const { map } = loadPilotConfig();
  const entry = map.get(norm);
  return Boolean(entry && entry.enabled === true);
}

/**
 * Retrieves the pilot metadata entry for an enabled pilot part.
 *
 * @param {string} rawPartNumber
 * @returns {Object|null}
 */
export function getPartIndexationPilotEntry(rawPartNumber) {
  if (!rawPartNumber) return null;
  const norm = PartNormalizer.normalizePartNumber(rawPartNumber);
  if (!norm) return null;

  const { map } = loadPilotConfig();
  return map.get(norm) || null;
}

/**
 * Returns list of all active pilot parts.
 *
 * @returns {Array<Object>}
 */
export function getPartIndexationPilotList() {
  const { list } = loadPilotConfig();
  return list;
}

/**
 * Returns Set of all active pilot part numbers.
 *
 * @returns {Set<string>}
 */
export function getPartIndexationPilotSet() {
  const { map } = loadPilotConfig();
  return new Set(map.keys());
}

/**
 * Clears cache (useful for testing and hot-reloading).
 */
export function resetPilotCache() {
  cachedPilotData = null;
  cachedPilotMap = null;
}
