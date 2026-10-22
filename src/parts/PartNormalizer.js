import { normalizeModelQuery } from '../modelNormalizer.js';
import { StihlModelIdentityParser } from './StihlModelIdentityParser.js';

export const FITMENT_SCOPES = {
  EXACT_CONFIGURATION: 'EXACT_CONFIGURATION',
  EXACT_VARIANT: 'EXACT_VARIANT',
  BASE_MODEL_CONFIRMED: 'BASE_MODEL_CONFIRMED',
  MULTI_VARIANT_EXPLICIT: 'MULTI_VARIANT_EXPLICIT',
  MODEL_FAMILY_ONLY: 'MODEL_FAMILY_ONLY',
  UNRESOLVED: 'UNRESOLVED'
};

export class PartNormalizer {
  /**
   * Normalizes a raw STIHL part number string to exact 11-digit canonical form.
   * Accepts formats like: "1141 160 5400", "1141-160-5400", "1141.160.5400", "11411605400"
   * Rejects any format that does not resolve to strictly 11 numeric digits.
   */
  static normalizePartNumber(rawPartNo) {
    if (!rawPartNo || typeof rawPartNo !== 'string') return null;
    let str = rawPartNo.trim();
    // Strip common leading brand or keyword prefixes (e.g. "STIHL", "Stihl", "Teilenummer", "Onderdeel", "Art.", "Part", etc.)
    str = str.replace(/^(?:stihl|teilenummer|onderdeelnummer|onderdeel|artikelnummer|artikel|art\.?|part(?:\s*(?:no|nr)\.?)?)\s+/i, '');
    const cleaned = str.replace(/[\s\-_.\/]/g, '').trim();
    if (!/^\d{11}$/.test(cleaned)) {
      return null;
    }
    return cleaned;
  }

  /**
   * Validates if a part number string resolves to a valid 11-digit STIHL part number
   */
  static isValidPartNumber(rawPartNo) {
    return this.normalizePartNumber(rawPartNo) !== null;
  }

  /**
   * Formats an 11-digit canonical part number into standard STIHL 4-3-4 display format: "1141 160 5400"
   */
  static formatPartNumber(canonicalPartNo) {
    if (!canonicalPartNo || typeof canonicalPartNo !== 'string') return null;
    const cleaned = canonicalPartNo.replace(/\D/g, '');
    if (cleaned.length !== 11) return canonicalPartNo;
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 11)}`;
  }

  /**
   * Cleans and normalizes a part name while strictly preserving technical designations.
   */
  static normalizePartName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    return rawName
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Evaluates whether a diagram position value represents a genuine diagram position
   * rather than a placeholder, missing value, or misplaced section string.
   *
   * Rejects: null, '', '-', '—', 'N/A', 'UNKNOWN', 'UNSPECIFIED', 'POS_UNSPECIFIED',
   * 'OFFICIAL_REF', '-1', '0', and multi-token section strings like "C - Chassis".
   *
   * Accepts: alphanumeric positions like "1", "2A", "10b", "0.1", "100".
   *
   * @param {*} value
   * @returns {boolean} true if meaningful position, false if placeholder/invalid
   */
  static isMeaningfulDiagramPosition(value) {
    if (value === null || value === undefined) return false;
    const str = String(value).trim();
    if (!str) return false;
    const upper = str.toUpperCase();
    if (['POS_UNSPECIFIED', 'OFFICIAL_REF', 'UNKNOWN', 'UNSPECIFIED', 'N/A', 'NA', '-', '—', '-1', '0'].includes(upper)) {
      return false;
    }
    if (str.includes(' - ') || str.includes(' – ') || str.includes(',')) {
      return false;
    }
    return /^[0-9]+(\.[0-9]+)?[a-zA-Z]?$/i.test(str);
  }

  /**
   * Normalizes a diagram position into standard string representation,
   * or returns null if the position is a placeholder or not meaningful.
   *
   * @param {*} value
   * @returns {string|null} normalized position string or null
   */
  static normalizeDiagramPosition(value) {
    if (!PartNormalizer.isMeaningfulDiagramPosition(value)) return null;
    return String(value).trim();
  }

  /**
   * Normalizes exploded diagram section keys:
   * Strips leading/trailing slashes, lowercases, and replaces non-alphanumeric chars with underscores.
   */
  static normalizeSectionKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return 'general';
    return rawKey
      .toLowerCase()
      .replace(/^[\s\-_.\/]+|[\s\-_.\/]+$/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'general';
  }

  /**
   * Compares two part descriptions deterministically:
   * - NORMALIZED_EQUIVALENT: Identical words in different order (e.g. "HD2 Air filter" vs "Air Filter HD2")
   * - DESCRIPTION_ENRICHMENT: One description is a detailed superset of the other (e.g. "Service Kit 7" vs "Service Kit 7 (Air Filter, Spark Plug)")
   * - TRUE_CONFLICT: Substantively different part descriptions
   */
  static comparePartNames(nameA, nameB) {
    const cleanA = this.normalizePartName(nameA).toLowerCase();
    const cleanB = this.normalizePartName(nameB).toLowerCase();

    if (cleanA === cleanB) return { isConflict: false, classification: 'EXACT_MATCH' };

    // Tokenize into alphanumeric words
    const tokensA = cleanA.match(/[a-z0-9]+/g) || [];
    const tokensB = cleanB.match(/[a-z0-9]+/g) || [];

    const sortedA = [...tokensA].sort().join(' ');
    const sortedB = [...tokensB].sort().join(' ');

    if (sortedA === sortedB) {
      return { isConflict: false, classification: 'NORMALIZED_EQUIVALENT' };
    }

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);

    const isSubsetA = tokensA.length > 0 && tokensA.every(t => setB.has(t));
    const isSubsetB = tokensB.length > 0 && tokensB.every(t => setA.has(t));

    if (isSubsetA || isSubsetB) {
      return { isConflict: false, classification: 'DESCRIPTION_ENRICHMENT' };
    }

    return { isConflict: true, classification: 'TRUE_CONFLICT' };
  }

  /**
   * Maps a model string into canonical model ID, base model name, variant key, variant name,
   * configuration, and entity classification using StihlModelIdentityParser.
   */
  static normalizeModelVariant(sourceModelName, sourceVariantName = null) {
    const modelStr = (sourceModelName || '').trim();
    const variantStr = (sourceVariantName || '').trim();
    const fullRaw = (variantStr || modelStr).trim();

    const parsed = StihlModelIdentityParser.parseModelIdentity(fullRaw);

    return {
      canonical_model: parsed.canonical_model,
      canonical_model_id: parsed.canonical_model_id,
      base_model_name: parsed.base_model_name,
      variant_key: parsed.variant_key,
      variant_name: parsed.variant_name,
      configuration_key: parsed.configuration_key,
      configuration_name: parsed.configuration_name,
      entity_type: parsed.entity_type,
      source_model_name: modelStr
    };
  }

  /**
   * Evaluates whether a diagram position value is populated as a raw string
   * (non-null, non-empty after trimming). Intentionally includes placeholders
   * such as -1, 0, POS_UNSPECIFIED, OFFICIAL_REF.
   */
  static isRawDiagramPosition(value) {
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
  }

  /**
   * Normalizes a part number from evidence text for comparison purposes only.
   * Accepts "4203 400 1301", "4203-400-1301", "42034001301" and returns 11-digit canonical form.
   */
  static normalizeEvidencePartNumber(str) {
    if (!str || typeof str !== 'string') return null;
    const cleaned = str.replace(/[\s\-_.\/]/g, '').trim();
    if (/^\d{11}$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  }

  /**
   * Deterministically verifies exact from_part and to_part presence, replacement semantics,
   * and directional safety in an authenticated evidence snippet.
   *
   * @param {string} snippet
   * @param {string} fromPart - 11-digit canonical
   * @param {string} toPart - 11-digit canonical
   * @returns {{hasFrom: boolean, hasTo: boolean, hasSemantics: boolean, directionConfirmed: boolean, valid: boolean}}
   */
  static verifyExactPairInEvidence(snippet, fromPart, toPart) {
    if (!snippet || typeof snippet !== 'string') {
      return {
        hasFrom: false,
        hasTo: false,
        hasSemantics: false,
        directionConfirmed: false,
        valid: false
      };
    }

    function makePartRegex(partNo) {
      if (/^\d{11}$/.test(partNo)) {
        const p1 = partNo.slice(0, 4);
        const p2 = partNo.slice(4, 7);
        const p3 = partNo.slice(7, 11);
        return new RegExp(`${p1}[\\s\\-\\.]*${p2}[\\s\\-\\.]*${p3}`, 'i');
      }
      return new RegExp(partNo.replace(/(.)/g, '$1[\\s\\-\\.]*'), 'i');
    }

    const fromRegex = makePartRegex(fromPart);
    const toRegex = makePartRegex(toPart);

    const fromMatch = fromRegex.exec(snippet);
    const toMatch = toRegex.exec(snippet);

    const hasFrom = Boolean(fromMatch);
    const hasTo = Boolean(toMatch);
    const hasSemantics = /replaced|superseded|replaces/i.test(snippet);

    let directionConfirmed = false;
    if (hasFrom && hasTo && hasSemantics) {
      const fromIdx = fromMatch.index;
      const toIdx = toMatch.index;

      if (fromIdx < toIdx) {
        // Pattern A: from_part ... [will be / is] replaced / superseded by ... to_part
        const between = snippet.slice(fromIdx, toIdx);
        if (/replaced|superseded/i.test(between) && /by/i.test(between)) {
          directionConfirmed = true;
        }
      } else {
        // Pattern B: to_part ... replaces ... from_part
        const between = snippet.slice(toIdx, fromIdx);
        if (/replaces/i.test(between)) {
          directionConfirmed = true;
        }
      }
    }

    return {
      hasFrom,
      hasTo,
      hasSemantics,
      directionConfirmed,
      valid: hasFrom && hasTo && hasSemantics && directionConfirmed
    };
  }
}

export const isMeaningfulDiagramPosition = PartNormalizer.isMeaningfulDiagramPosition;
export const isRawDiagramPosition = PartNormalizer.isRawDiagramPosition;
export const normalizeDiagramPosition = PartNormalizer.normalizeDiagramPosition;
export const normalizeEvidencePartNumber = PartNormalizer.normalizeEvidencePartNumber;
export const verifyExactPairInEvidence = PartNormalizer.verifyExactPairInEvidence;
