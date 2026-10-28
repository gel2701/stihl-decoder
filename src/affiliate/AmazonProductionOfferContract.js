/**
 * Amazon Production Offer Contract for STIHLDecoder.nl
 * Phase 57A.2 — Central Production Offer Contract & Security Predicates
 *
 * Provides shared, fail-closed validation predicates across:
 * - AmazonExactMatchVerifier
 * - AmazonAffiliateProvider
 * - import_verified_amazon_offers
 *
 * Guarantees zero classification drift and strict provenance verification.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';

export const PRODUCTION_VERIFIED_CLASSIFICATIONS = new Set([
  'VERIFIED_OEM_EXACT',
  'VERIFIED_AFTERMARKET_EXACT',
  'OEM_STIHL_EXACT',
  'AFTERMARKET_EXACT_REFERENCE'
]);

export const NON_PRODUCTION_CLASSIFICATIONS = new Set([
  'DISCOVERED_UNVERIFIED',
  'AMBIGUOUS',
  'REJECTED',
  'NOT_FOUND',
  'NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH',
  'UNAUDITED',
  'UNAUDITED_LEGACY_PHASE57A1'
]);

export const ALLOWED_AMAZON_MARKETPLACES = new Set([
  'amazon.nl',
  'amazon.de',
  'amazon.com'
]);

export const ASIN_REGEX = /^[A-Z0-9]{10}$/;
export const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function isValidAsin(rawAsin) {
  if (typeof rawAsin !== 'string') return false;
  return ASIN_REGEX.test(rawAsin.trim().toUpperCase());
}

export function isValidIsoTimestamp(str) {
  if (typeof str !== 'string') return false;
  if (!ISO_TIMESTAMP_REGEX.test(str.trim())) return false;
  const parsed = Date.parse(str.trim());
  return !Number.isNaN(parsed);
}

export function isProductionVerifiedClassification(classification) {
  if (typeof classification !== 'string') return false;
  return PRODUCTION_VERIFIED_CLASSIFICATIONS.has(classification.trim());
}

/**
 * Validates an individual evidence source object.
 * Rejects empty objects [{}] and entries with missing/invalid fields.
 *
 * @param {Object} src
 * @returns {boolean}
 */
export function isValidEvidenceSource(src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return false;
  if (typeof src.type !== 'string' || !src.type.trim()) return false;
  if (typeof src.url !== 'string' || !/^https?:\/\/.+/i.test(src.url.trim())) return false;
  if (typeof src.title !== 'string' || !src.title.trim()) return false;
  if (typeof src.claim !== 'string' || !src.claim.trim()) return false;
  if (!isValidIsoTimestamp(src.retrieved_at)) return false;
  return true;
}

/**
 * Validates structured proof object.
 *
 * @param {Object} proof
 * @param {boolean} [isAftermarket=false]
 * @returns {boolean}
 */
export function isValidStructuredProof(proof, isAftermarket = false) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) return false;
  if (proof.exact_part_number_found !== true) return false;
  if (proof.asin_identity_verified !== true) return false;
  if (proof.marketplace_verified !== true) return false;
  if (isAftermarket && proof.replacement_reference_verified === false) {
    return false;
  }
  return true;
}

/**
 * Checks for known part number identity mismatches.
 * E.g. STIHL 0000 400 7000 (NGK BPMR7A) mapped to CMR6H / ASIN B001RMA5S2.
 *
 * @param {string} partNumber
 * @param {string} [asin]
 * @param {string} [productOrTitle]
 * @returns {boolean} True if a known mismatch is detected
 */
export function isKnownPartNumberMismatch(partNumber, asin, productOrTitle = '') {
  const norm = PartNormalizer.normalizePartNumber(partNumber);
  const cleanAsin = (asin || '').trim().toUpperCase();
  const title = (productOrTitle || '').toLowerCase();

  // Mismatch: 0000 400 7000 is BPMR7A; CMR6H is 0000 400 7011
  if (norm === '00004007000') {
    if (cleanAsin === 'B001RMA5S2') return true;
    if (title.includes('cmr6h') || title.includes('3365')) return true;
  }
  return false;
}

/**
 * Central production verification predicate.
 * Enforces all fail-closed criteria for an offer record to be production-eligible.
 *
 * @param {Object} candidate
 * @returns {boolean}
 */
export function isProductionVerifiedAmazonOffer(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;

  // 1. Part Number
  const normPart = PartNormalizer.normalizePartNumber(candidate.part_number);
  if (!normPart || normPart.length !== 11) return false;

  // 2. Classification
  const classification = candidate.classification || candidate.match_type;
  if (!isProductionVerifiedClassification(classification)) return false;

  // 3. Known Mismatch Check
  if (isKnownPartNumberMismatch(normPart, candidate.asin, candidate.product || candidate.title || candidate.candidate_product)) {
    return false;
  }

  // 4. ASIN
  if (!isValidAsin(candidate.asin)) return false;

  // 5. Marketplace
  const marketplace = (candidate.marketplace || '').trim().toLowerCase();
  if (!ALLOWED_AMAZON_MARKETPLACES.has(marketplace)) return false;

  // 6. Verification Status & Timestamp & Method
  if (candidate.verification_status !== 'VERIFIED_EXACT_MATCH') return false;
  if (!isValidIsoTimestamp(candidate.verified_at)) return false;
  if (!candidate.verification_method || typeof candidate.verification_method !== 'string') return false;

  // 7. Structured Proof
  const isAftermarket = classification === 'VERIFIED_AFTERMARKET_EXACT' || classification === 'AFTERMARKET_EXACT_REFERENCE';
  if (!isValidStructuredProof(candidate.proof, isAftermarket)) return false;

  // 8. Evidence Sources
  if (!Array.isArray(candidate.evidence_sources) || candidate.evidence_sources.length === 0) {
    return false;
  }
  const hasInvalidSource = candidate.evidence_sources.some(src => !isValidEvidenceSource(src));
  if (hasInvalidSource) return false;

  // 9. Aftermarket Brand Constraint
  if (isAftermarket) {
    const brand = candidate.aftermarket_brand || candidate.brand;
    if (!brand || typeof brand !== 'string' || brand.toLowerCase().includes('stihl')) {
      return false;
    }
  }

  // 10. Volatile Facts Disallowance
  if (candidate.price !== null && candidate.price !== undefined) return false;
  if (candidate.in_stock !== null && candidate.in_stock !== undefined) return false;

  return true;
}
