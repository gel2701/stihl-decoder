/**
 * Section Normalizer for STIHL Parts Catalog
 * Phase 54E — Technical Data Integrity & Enrichment Foundation
 *
 * Provides deterministic normalization for diagram section names and keys.
 * Preserves raw section identity alongside canonical normalized values.
 * Strictly prevents AI-guessing or collapsing distinct technical assemblies.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const aliasesPath = path.join(rootDir, 'data', 'parts_section_aliases.json');

// Build alias lookup map from data/parts_section_aliases.json
let aliasMap = new Map();
try {
  if (fs.existsSync(aliasesPath)) {
    const doc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
    if (Array.isArray(doc.aliases)) {
      for (const a of doc.aliases) {
        if (a.raw && a.canonical) {
          aliasMap.set(a.raw.trim().toLowerCase(), a.canonical.trim());
        }
      }
    }
  }
} catch (e) {
  // Graceful fallback if file loading fails
  aliasMap = new Map();
}

const UNRESOLVED_SECTION_MARKERS = new Set([
  'unresolved diagram section',
  'unresolved',
  'general_unresolved',
  'general',
  'algemene sectie',
  'unknown',
  'n/a',
  'null',
  'undefined'
]);

export class SectionNormalizer {
  /**
   * Checks whether a section name represents a meaningful, resolved diagram section.
   *
   * @param {string} rawName
   * @returns {boolean} true if meaningful and resolved, false if placeholder/unresolved
   */
  static isMeaningfulSection(rawName) {
    if (!rawName || typeof rawName !== 'string') return false;
    const trimmed = rawName.trim();
    if (!trimmed) return false;
    if (UNRESOLVED_SECTION_MARKERS.has(trimmed.toLowerCase())) return false;
    return true;
  }

  /**
   * Deterministically normalizes a diagram section display name.
   * Preserves specific technical model designations and assemblies.
   *
   * @param {string} rawName
   * @returns {string|null} canonical display name, or null if empty/unresolved
   */
  static normalizeSectionName(rawName) {
    if (!rawName || typeof rawName !== 'string') return null;
    const trimmed = rawName.trim().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
    if (!trimmed) return null;

    if (!SectionNormalizer.isMeaningfulSection(trimmed)) {
      return null;
    }

    // 1. Check explicit alias table
    const lower = trimmed.toLowerCase();
    if (aliasMap.has(lower)) {
      return aliasMap.get(lower);
    }

    // 2. Deterministic Title Case normalization
    const lowerWords = new Set(['with', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'a', 'an', 'the']);
    return trimmed
      .split(/\s+/)
      .map((word, idx) => {
        if (word.includes('-')) {
          return word.split('-').map(part => {
            if (part.length <= 1) return part.toUpperCase();
            if (/^[A-Z0-9]+$/.test(part)) return part;
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
          }).join('-');
        }
        const wLower = word.toLowerCase();
        if (idx > 0 && lowerWords.has(wLower)) {
          return wLower;
        }
        if (/^[A-Z]{1,3}\d+$/i.test(word) || /^[A-Z]{1,2}$/i.test(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Normalizes exploded diagram section keys:
   * Strips non-alphanumeric chars and produces clean lowercase snake_case identifier.
   *
   * @param {string} rawKey
   * @returns {string} normalized snake_case section key
   */
  static normalizeSectionKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return 'general_unresolved';
    const cleaned = rawKey
      .toLowerCase()
      .replace(/^[\s\-_.\/]+|[\s\-_.\/]+$/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!cleaned || cleaned === 'general' || cleaned === 'unresolved_diagram_section') {
      return 'general_unresolved';
    }
    return cleaned;
  }
}
