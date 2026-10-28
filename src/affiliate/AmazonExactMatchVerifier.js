/**
 * Amazon Exact Match Verifier for STIHLDecoder.nl
 * Phase 56B — Amazon Exact Match Pilot
 *
 * Strict, deterministic, fail-closed verification contract for pairing
 * Amazon ASINs with canonical STIHL part numbers.
 *
 * PRINCIPLES:
 * 1. Zero ASIN guessing or inference.
 * 2. Zero title-only matching without part number proof.
 * 3. Exact canonical 11-digit STIHL part number is primary evidence.
 * 4. Distinct classification: OEM_STIHL_EXACT vs AFTERMARKET_EXACT_REFERENCE vs AMBIGUOUS vs REJECTED vs NOT_FOUND.
 * 5. Provenance, timestamp, marketplace, and verification method are mandatory.
 * 6. Disallow storing volatile prices or stock as static catalog facts.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';
import {
  isValidAsin,
  isValidIsoTimestamp,
  ALLOWED_AMAZON_MARKETPLACES,
  VERIFICATION_STATUSES
} from './AmazonAffiliateProvider.js';
import {
  PRODUCTION_VERIFIED_CLASSIFICATIONS,
  NON_PRODUCTION_CLASSIFICATIONS,
  isValidEvidenceSource,
  isValidStructuredProof,
  isKnownPartNumberMismatch,
  isProductionVerifiedClassification,
  isProductionVerifiedAmazonOffer
} from './AmazonProductionOfferContract.js';

export {
  PRODUCTION_VERIFIED_CLASSIFICATIONS,
  NON_PRODUCTION_CLASSIFICATIONS,
  isValidEvidenceSource,
  isValidStructuredProof,
  isKnownPartNumberMismatch,
  isProductionVerifiedClassification,
  isProductionVerifiedAmazonOffer
};

export const MATCH_CLASSIFICATIONS = {
  OEM_STIHL_EXACT: 'OEM_STIHL_EXACT',
  VERIFIED_OEM_EXACT: 'VERIFIED_OEM_EXACT',
  AFTERMARKET_EXACT_REFERENCE: 'AFTERMARKET_EXACT_REFERENCE',
  VERIFIED_AFTERMARKET_EXACT: 'VERIFIED_AFTERMARKET_EXACT',
  DISCOVERED_UNVERIFIED: 'DISCOVERED_UNVERIFIED',
  AMBIGUOUS: 'AMBIGUOUS',
  REJECTED: 'REJECTED',
  NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH: 'NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH',
  NOT_FOUND: 'NOT_FOUND', // Backwards-compatible alias
  UNAUDITED: 'UNAUDITED',
  UNAUDITED_LEGACY_PHASE57A1: 'UNAUDITED_LEGACY_PHASE57A1'
};

export const VERIFICATION_METHODS = {
  OFFICIAL_PAAPI: 'OFFICIAL_PAAPI',
  MANUAL_CATALOG_AUDIT: 'MANUAL_CATALOG_AUDIT',
  USER_VERIFIED_LEDGER: 'USER_VERIFIED_LEDGER',
  MANUFACTURER_PACKAGING_PROOF: 'MANUFACTURER_PACKAGING_PROOF'
};

export const PRODUCT_TYPES = {
  OEM: 'OEM',
  AFTERMARKET: 'AFTERMARKET'
};

export class AmazonExactMatchVerifier {
  /**
   * Validates a candidate match record against the strict Phase 56B contract.
   * Fails closed: any ambiguity, missing provenance, or invalid format returns { valid: false, errors }.
   *
   * @param {Object} candidate
   * @returns {{ valid: boolean, errors: string[], classification: string }}
   */
  static validateCandidate(candidate) {
    const errors = [];

    if (!candidate || typeof candidate !== 'object') {
      return { valid: false, errors: ['Candidate record is null or non-object'], classification: MATCH_CLASSIFICATIONS.REJECTED };
    }

    // 1. Part Number Validation
    const normPart = PartNormalizer.normalizePartNumber(candidate.part_number);
    if (!normPart || normPart.length !== 11) {
      errors.push(`Invalid canonical 11-digit STIHL part number: ${candidate.part_number}`);
    }

    // 1b. Known Part Number Identity Mismatch Check (e.g. 0000 400 7000 + B001RMA5S2)
    if (isKnownPartNumberMismatch(candidate.part_number, candidate.asin, candidate.product || candidate.title || candidate.candidate_product)) {
      errors.push('PART_NUMBER_PRODUCT_IDENTITY_MISMATCH: Candidate part number and product identity mismatch (known cross-number error)');
    }

    // 2. Classification Validation
    const classification = candidate.classification || candidate.match_type;
    if (!classification || !Object.values(MATCH_CLASSIFICATIONS).includes(classification)) {
      errors.push(`Invalid or missing match classification: ${classification}`);
    }

    // Unaudited statuses
    if (classification === MATCH_CLASSIFICATIONS.UNAUDITED || classification === MATCH_CLASSIFICATIONS.UNAUDITED_LEGACY_PHASE57A1) {
      return {
        valid: errors.length === 0,
        errors,
        classification
      };
    }

    // 3. For NOT_FOUND or NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH or REJECTED:
    if (classification === MATCH_CLASSIFICATIONS.NOT_FOUND || classification === MATCH_CLASSIFICATIONS.NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH) {
      if (candidate.candidate_count > 0 || candidate.results_found_count > 0 || candidate.candidate_asin || candidate.candidate_product || (Array.isArray(candidate.candidate_urls) && candidate.candidate_urls.length > 0)) {
        errors.push('NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH is forbidden when candidate products, ASINs, or sources are found');
      }
      if (classification === MATCH_CLASSIFICATIONS.NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH) {
        if (!Array.isArray(candidate.queries_run) || candidate.queries_run.length === 0) {
          errors.push('NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH requires executed queries_run audit');
        }
        if (!Array.isArray(candidate.sources_checked) || candidate.sources_checked.length === 0) {
          errors.push('NOT_FOUND_AFTER_EXHAUSTIVE_SEARCH requires sources_checked audit');
        }
      }
      return {
        valid: errors.length === 0,
        errors,
        classification: classification
      };
    }

    if (classification === MATCH_CLASSIFICATIONS.DISCOVERED_UNVERIFIED) {
      if (!candidate.candidate_asin && !candidate.asin && !candidate.candidate_product && !candidate.replaces_reference && (!Array.isArray(candidate.candidate_urls) || candidate.candidate_urls.length === 0)) {
        errors.push('DISCOVERED_UNVERIFIED requires candidate ASIN, product identity, or candidate reference URLs');
      }
      if (!candidate.reason && !candidate.classification_reason) {
        errors.push('DISCOVERED_UNVERIFIED must document classification reason');
      }
      return {
        valid: errors.length === 0,
        errors,
        classification: MATCH_CLASSIFICATIONS.DISCOVERED_UNVERIFIED
      };
    }

    if (classification === MATCH_CLASSIFICATIONS.AMBIGUOUS || classification === MATCH_CLASSIFICATIONS.REJECTED) {
      if (!candidate.rejection_reason && !candidate.reason) {
        errors.push(`Ambiguous/Rejected candidates must document explicit reason`);
      }
      return {
        valid: errors.length === 0,
        errors,
        classification: classification
      };
    }

    // 4. For Verified ASIN Candidates (OEM_STIHL_EXACT, VERIFIED_OEM_EXACT, AFTERMARKET_EXACT_REFERENCE, VERIFIED_AFTERMARKET_EXACT):
    const isVerifiedOem = classification === MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT || classification === MATCH_CLASSIFICATIONS.VERIFIED_OEM_EXACT;
    const isVerifiedAftermarket = classification === MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE || classification === MATCH_CLASSIFICATIONS.VERIFIED_AFTERMARKET_EXACT;

    // ASIN Validation
    if (!isValidAsin(candidate.asin)) {
      errors.push(`Invalid Amazon ASIN: ${candidate.asin}`);
    }

    // Marketplace Validation
    const marketplace = (candidate.marketplace || '').trim().toLowerCase();
    if (!ALLOWED_AMAZON_MARKETPLACES.has(marketplace)) {
      errors.push(`Marketplace "${candidate.marketplace}" is not in allowed set (${Array.from(ALLOWED_AMAZON_MARKETPLACES).join(', ')})`);
    }

    // Verification Status
    if (candidate.verification_status !== VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH) {
      errors.push(`Verification status must be VERIFIED_EXACT_MATCH (got ${candidate.verification_status})`);
    }

    // Verification Timestamp
    if (!isValidIsoTimestamp(candidate.verified_at)) {
      errors.push(`Invalid or missing ISO verification timestamp: ${candidate.verified_at}`);
    }

    // Provenance / Evidence Source
    if (Array.isArray(candidate.evidence_sources)) {
      if (candidate.evidence_sources.length === 0) {
        errors.push('Explicit evidence source or provenance document is required');
      } else {
        const invalidSources = candidate.evidence_sources.filter(s => !isValidEvidenceSource(s));
        if (invalidSources.length > 0) {
          errors.push('All evidence sources must be valid structured objects with type, url, title, claim, and retrieved_at');
        }
      }
    } else if (typeof candidate.evidence_source === 'string' && candidate.evidence_source.trim().length >= 5) {
      // Single string provenance allowed for legacy compatibility if non-empty
    } else {
      errors.push('Explicit evidence source or provenance document is required');
    }

    // Reject title-only matching without part number proof (Section 10, 31, 32)
    if (candidate.title_only === true || (typeof candidate.evidence_source === 'string' && candidate.evidence_source.toLowerCase().includes('title-only matching without part number'))) {
      errors.push('Title-only matching without explicit part number proof is strictly rejected');
    }

    // Verification Method
    if (!candidate.verification_method || !Object.values(VERIFICATION_METHODS).includes(candidate.verification_method)) {
      errors.push(`Valid verification method is required (got ${candidate.verification_method})`);
    }

    // Structured proof validation (Section 22, 31-33)
    if (candidate.proof !== undefined && candidate.proof !== null) {
      if (typeof candidate.proof !== 'object' || Array.isArray(candidate.proof)) {
        errors.push('Structured proof object is required for verified candidates');
      } else {
        if (candidate.proof.exact_part_number_found !== true) {
          errors.push('Exact STIHL part number proof not found in listing context');
        }
        if (candidate.proof.asin_identity_verified !== true) {
          errors.push('ASIN identity unverified');
        }
        if (candidate.proof.marketplace_verified !== true) {
          errors.push('Marketplace availability unverified');
        }
      }
    } else if (classification === MATCH_CLASSIFICATIONS.VERIFIED_OEM_EXACT || classification === MATCH_CLASSIFICATIONS.VERIFIED_AFTERMARKET_EXACT) {
      errors.push('Structured proof object is required for verified candidates');
    }

    // Product Type Classification
    if (isVerifiedOem) {
      if (candidate.product_type && candidate.product_type !== PRODUCT_TYPES.OEM) {
        errors.push(`OEM_STIHL_EXACT cannot have product_type "${candidate.product_type}"`);
      }
    } else if (isVerifiedAftermarket) {
      if (candidate.product_type && candidate.product_type !== PRODUCT_TYPES.AFTERMARKET) {
        errors.push(`AFTERMARKET_EXACT_REFERENCE must specify product_type AFTERMARKET`);
      }
      const brand = candidate.aftermarket_brand || candidate.brand;
      if (!brand || brand.toLowerCase().includes('stihl')) {
        errors.push(`Aftermarket replacements must identify third-party brand and never claim to be STIHL OEM`);
      }
    }

    // Strict Disallowance of Static Price / Stock Claims
    if (candidate.price !== null && candidate.price !== undefined) {
      errors.push(`Prices must not be stored as static catalog facts (price must be null)`);
    }
    if (candidate.in_stock !== null && candidate.in_stock !== undefined) {
      errors.push(`Stock availability must not be stored as static catalog facts (in_stock must be null)`);
    }

    return {
      valid: errors.length === 0,
      errors,
      classification: errors.length === 0 ? classification : MATCH_CLASSIFICATIONS.REJECTED
    };
  }

  /**
   * Evaluates an unverified queue item.
   * When no external verified proof exists, safely returns NOT_FOUND status.
   *
   * @param {Object} queueItem
   * @param {Map<string, Object>} [knownOverrides]
   * @returns {Object} Evaluation report
   */
  static evaluateQueueItem(queueItem, knownOverrides = new Map()) {
    const normPart = PartNormalizer.normalizePartNumber(queueItem.part_number);
    if (!normPart) {
      return {
        part_number: queueItem.part_number,
        part_number_display: queueItem.part_number_display || queueItem.part_number,
        display_name: queueItem.display_name || 'Onbekend onderdeel',
        classification: MATCH_CLASSIFICATIONS.REJECTED,
        reason: 'Ongeldig 11-cijferig onderdeelnummer',
        verified_asin: null,
        affiliate_action: 'SEARCH_FALLBACK_ONLY'
      };
    }

    const override = knownOverrides.get(normPart);
    if (override) {
      const check = this.validateCandidate(override);
      if (check.valid) {
        return {
          part_number: normPart,
          part_number_display: queueItem.part_number_display || PartNormalizer.formatPartNumber(normPart),
          display_name: queueItem.display_name,
          classification: check.classification,
          verified_asin: override.asin,
          marketplace: override.marketplace,
          product_type: override.product_type || (check.classification === MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT ? PRODUCT_TYPES.OEM : PRODUCT_TYPES.AFTERMARKET),
          evidence_source: override.evidence_source,
          verification_method: override.verification_method,
          verified_at: override.verified_at,
          affiliate_action: 'DIRECT_ASIN_LINK'
        };
      }
    }

    // Default Fail-Closed: Zero guessing
    const defaultTag = process.env.AMAZON_ASSOCIATE_TAG || null;
    const tagParam = defaultTag ? `&tag=${encodeURIComponent(defaultTag)}` : '';
    return {
      part_number: normPart,
      part_number_display: queueItem.part_number_display || PartNormalizer.formatPartNumber(normPart),
      display_name: queueItem.display_name,
      category: queueItem.category || 'overige',
      model_count: queueItem.model_count || (Array.isArray(queueItem.models) ? queueItem.models.length : 0),
      classification: MATCH_CLASSIFICATIONS.NOT_FOUND,
      reason: 'Geen officiële Amazon API of geverifieerde ASIN-bron met 100% bewezen STIHL-onderdeelnummerkoppeling beschikbaar in deze omgeving.',
      verified_asin: null,
      affiliate_action: 'SEARCH_FALLBACK_ONLY',
      search_url: `https://www.amazon.nl/s?k=STIHL+${PartNormalizer.formatPartNumber(normPart)}${tagParam}`
    };
  }
}
