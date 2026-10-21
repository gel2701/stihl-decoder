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

export const MATCH_CLASSIFICATIONS = {
  OEM_STIHL_EXACT: 'OEM_STIHL_EXACT',
  AFTERMARKET_EXACT_REFERENCE: 'AFTERMARKET_EXACT_REFERENCE',
  AMBIGUOUS: 'AMBIGUOUS',
  REJECTED: 'REJECTED',
  NOT_FOUND: 'NOT_FOUND'
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

    // 2. Classification Validation
    const classification = candidate.classification || candidate.match_type;
    if (!classification || !Object.values(MATCH_CLASSIFICATIONS).includes(classification)) {
      errors.push(`Invalid or missing match classification: ${classification}`);
    }

    // 3. For NOT_FOUND or REJECTED, candidate does not require ASIN
    if (classification === MATCH_CLASSIFICATIONS.NOT_FOUND) {
      return {
        valid: errors.length === 0,
        errors,
        classification: MATCH_CLASSIFICATIONS.NOT_FOUND
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

    // 4. For Verified ASIN Candidates (OEM_STIHL_EXACT or AFTERMARKET_EXACT_REFERENCE):
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
    if (!candidate.evidence_source || typeof candidate.evidence_source !== 'string' || candidate.evidence_source.trim().length < 5) {
      errors.push(`Explicit evidence source or provenance document is required`);
    }

    // Verification Method
    if (!candidate.verification_method || !Object.values(VERIFICATION_METHODS).includes(candidate.verification_method)) {
      errors.push(`Valid verification method is required (got ${candidate.verification_method})`);
    }

    // Product Type Classification
    if (classification === MATCH_CLASSIFICATIONS.OEM_STIHL_EXACT) {
      if (candidate.product_type && candidate.product_type !== PRODUCT_TYPES.OEM) {
        errors.push(`OEM_STIHL_EXACT cannot have product_type "${candidate.product_type}"`);
      }
    } else if (classification === MATCH_CLASSIFICATIONS.AFTERMARKET_EXACT_REFERENCE) {
      if (candidate.product_type && candidate.product_type !== PRODUCT_TYPES.AFTERMARKET) {
        errors.push(`AFTERMARKET_EXACT_REFERENCE must specify product_type AFTERMARKET`);
      }
      if (!candidate.aftermarket_brand || candidate.aftermarket_brand.toLowerCase().includes('stihl')) {
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
      search_url: `https://www.amazon.nl/s?k=STIHL+${PartNormalizer.formatPartNumber(normPart)}&tag=stihldecoder-21`
    };
  }
}
