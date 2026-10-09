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
    const cleaned = rawPartNo.replace(/[\s\-_.\/]/g, '').trim();
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
}
