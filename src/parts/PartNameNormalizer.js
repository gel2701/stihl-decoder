/**
 * Part Name Normalizer for STIHL Parts Catalog
 * Phase 54E — Technical Data Integrity & Enrichment Foundation
 *
 * Provides safe, deterministic normalization of part names into clean technical display names.
 * Priority:
 *   1. Approved explicit override (data/parts_name_overrides.json)
 *   2. HTML & character encoding normalization (clean broken entities, replacement characters)
 *   3. Safe technical core extraction (stripping vendor prefixes, part number duplication, and trailing retailer lists)
 *   4. Deterministic Dutch technical dictionary translation
 *   5. Clean canonical fallback
 *
 * Strict constraint: Preserves part_name_raw for full provenance and traceability.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const overridesPath = path.join(rootDir, 'data', 'parts_name_overrides.json');

let overridesMap = new Map();
try {
  if (fs.existsSync(overridesPath)) {
    const doc = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    if (Array.isArray(doc.overrides)) {
      for (const o of doc.overrides) {
        if (o.part_number && o.display_name_nl) {
          overridesMap.set(o.part_number, o.display_name_nl);
        }
      }
    }
  }
} catch (e) {
  overridesMap = new Map();
}

/**
 * Deterministic Dutch technical dictionary for exact technical components.
 * Matches full component designation to avoid partial / ambiguous mistranslations.
 */
const DUTCH_DICTIONARY = [
  [/^clutch$/i, 'Koppeling'],
  [/^oil pump$/i, 'Oliepomp'],
  [/^air filter$/i, 'Luchtfilter'],
  [/^air filter, fleece$/i, 'Luchtfilter (vlies)'],
  [/^spark plug$/i, 'Bougie'],
  [/^starter rope$/i, 'Startkoord'],
  [/^carburetor$/i, 'Carburateur'],
  [/^chain sprocket$/i, 'Kettingwiel'],
  [/^rewind starter$/i, 'Handstarter'],
  [/^crankshaft$/i, 'Krukas'],
  [/^cylinder$/i, 'Cilinder'],
  [/^piston$/i, 'Zuiger'],
  [/^muffler$/i, 'Uitlaat'],
  [/^gasket$/i, 'Pakking'],
  [/^flywheel$/i, 'Vliegwiel'],
  [/^guide bar$/i, 'Zaagblad'],
  [/^saw chain$/i, 'Zaagketting'],
  [/^ignition module$/i, 'Ontstekingsmodule'],
  [/^ignition coil$/i, 'Ontstekingsspoel'],
  [/^fuel tank$/i, 'Brandstoftank'],
  [/^fuel pickup body$/i, 'Brandstoffilter / zuigkop'],
  [/^pickup body$/i, 'Brandstoffilter / zuigkop'],
  [/^chain sprocket cover$/i, 'Kettingwieldeksel'],
  [/^tank housing$/i, 'Tankbehuizing'],
  [/^handlebar$/i, 'Beugelhandgreep'],
  [/^contact spring$/i, 'Contactveer'],
  [/^hand guard$/i, 'Handbeschermer'],
  [/^collar screw$/i, 'Kraagschroef'],
  [/^spiked bumper$/i, 'Getande aanslag'],
  [/^chain tensioner$/i, 'Kettingspanner'],
  [/^clutch drum$/i, 'Koppelingstrommel']
];

export class PartNameNormalizer {
  /**
   * Normalizes a raw part name into a safe, clean technical display name.
   *
   * @param {string} rawName - original harvested part name
   * @param {string} [partNumber] - canonical 11-digit part number for prefix stripping
   * @returns {string} clean display name
   */
  static normalizeDisplayName(rawName, partNumber = '') {
    return PartNameNormalizer.normalizePartName(rawName, partNumber);
  }

  /**
   * Normalizes a raw part name into a safe, clean technical display name.
   *
   * @param {string} rawName - original harvested part name
   * @param {string} [partNumber] - canonical 11-digit part number for prefix stripping
   * @returns {string} clean display name
   */
  static normalizePartName(rawName, partNumber = '') {
    if (!rawName || typeof rawName !== 'string') return '';

    // 1. Check approved explicit override
    if (partNumber && overridesMap.has(partNumber)) {
      return overridesMap.get(partNumber);
    }

    // 2. Normalize HTML entities and common character encoding artifacts
    let clean = rawName
      .replace(/&#8203;/g, '')
      .replace(/&#8209;/g, '-')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/\uFFFD\s*F\b|\uFFFD\s*uF\b/g, 'µF')
      .replace(/\uFFFD/g, 'Ø')
      .replace(/Ã¸|Âø/g, 'ø')
      .replace(/Ã¤|Âä/g, 'ä')
      .replace(/Ã¼|Âü/g, 'ü')
      .replace(/Ã¶|Âö/g, 'ö');

    // 3. Strip vendor / retailer prefix and duplicate part numbers iteratively
    let changed = true;
    while (changed) {
      const prev = clean;
      clean = clean.replace(/^(?:genuine\s+)?stihl\s+/i, '');
      clean = clean.replace(/^genuine\s+/i, '');
      if (partNumber) {
        const formattedPart = partNumber.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
        clean = clean.replace(new RegExp(`^${partNumber}\\s*`, 'i'), '');
        clean = clean.replace(new RegExp(`^${formattedPart}\\s*`, 'i'), '');
      }
      clean = clean.replace(/^\d{4}[\s\-]?\d{3}[\s\-]?\d{4}\s*/i, '');
      clean = clean.replace(/^\d{11}\s*/i, '');
      changed = (clean !== prev);
    }

    // 5. Strip trailing retailer / compatibility model lists
    // e.g. " for MS 171 MS 181...", " Fits HL 91 KC...", " - OEM No. 0000 792 9600"
    clean = clean.replace(/\s+(?:for|fits)\s+(?:the\s+)?[A-Z0-9]{1,4}\s*\d*[a-z0-9\s\/\.,\-_]*$/i, '');
    clean = clean.replace(/\s+-\s*OEM\s*No\.?\s*[\d\s\-]+$/i, '');
    clean = clean.replace(/\s*\(\s*pack\s+of\s+\d+\s*\)/gi, '');
    clean = clean.replace(/\s*,\s*pack of \d+.*$/gi, '');
    clean = clean.replace(/\s+pack of \d+.*$/gi, '');
    clean = clean.replace(/[\.\s]+$/, '').trim();

    // 6. Check deterministic Dutch technical dictionary
    for (const [regex, dutchTranslation] of DUTCH_DICTIONARY) {
      if (regex.test(clean)) {
        return dutchTranslation;
      }
    }

    return clean || rawName;
  }
}
