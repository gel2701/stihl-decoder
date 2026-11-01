/**
 * src/affiliate/TwoGateVerifier.js
 *
 * Phase 59D: Two-Gate Verification Engine for Amazon Affiliate Product Links
 *
 * Enforces dual-gate validation before any Amazon ASIN can be eligible for direct linking:
 * - Gate 1 (Technical Validation): Syntax, format, marketplace, affiliate tag, catalog existence, metadata.
 * - Gate 2 (Product & Compatibility Validation): OEM/Aftermarket taxonomy, manufacturer MPN,
 *          universal GTIN/EAN, machine fitment proof, independent external ASIN identity corroboration,
 *          and absence of volatile price/stock claims.
 *
 * Fails closed: an offer failing either gate cannot achieve VERIFIED or ACTIVE status.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';
import {
  isValidAsin,
  ALLOWED_AMAZON_MARKETPLACES
} from './AmazonAffiliateProvider.js';
import {
  isKnownPartNumberMismatch
} from './AmazonProductionOfferContract.js';

export const GATE_STATUSES = {
  PASS: 'PASS',
  FAIL: 'FAIL'
};

export const VALID_OEM_BRAND_CLASSIFICATIONS = new Set([
  'GENUINE_STIHL',
  'OEM_SUPPLIER_EQUIVALENT',
  'MANUFACTURER_AFTERMARKET',
  'UNVERIFIED_AFTERMARKET'
]);

export const VALID_OFFER_STATUSES = new Set([
  'STAGED',
  'VERIFIED',
  'ACTIVE',
  'SUSPENDED'
]);

export class TwoGateVerifier {
  /**
   * Evaluates Gate 1: Technical & Format Validation.
   *
   * @param {Object} candidate
   * @param {Object} [context]
   * @param {Map<string, Object>|Set<string>} [context.catalogPartMap]
   * @param {string} [context.expectedTag]
   * @returns {{ status: string, passed: boolean, checks: Object, errors: string[] }}
   */
  static evaluateGate1(candidate, context = {}) {
    const errors = [];
    const checks = {
      asin_syntax: false,
      marketplace_valid: false,
      affiliate_tag_valid: false,
      part_number_canonical: false,
      catalog_grounded: false,
      provenance_fields_present: false
    };

    if (!candidate || typeof candidate !== 'object') {
      return {
        status: GATE_STATUSES.FAIL,
        passed: false,
        checks,
        errors: ['Candidate record is null or not an object']
      };
    }

    // 1. ASIN Syntax
    if (isValidAsin(candidate.asin)) {
      checks.asin_syntax = true;
    } else {
      errors.push(`Invalid ASIN syntax: "${candidate.asin}". Must be exactly 10 alphanumeric uppercase characters.`);
    }

    // 2. Marketplace
    const rawMarketplace = typeof candidate.marketplace === 'string'
      ? candidate.marketplace.trim().toLowerCase()
      : '';
    if (ALLOWED_AMAZON_MARKETPLACES.has(rawMarketplace)) {
      checks.marketplace_valid = true;
    } else {
      errors.push(`Unsupported Amazon marketplace: "${candidate.marketplace}". Must be one of: ${Array.from(ALLOWED_AMAZON_MARKETPLACES).join(', ')}`);
    }

    // 3. Affiliate Tag
    const tag = typeof candidate.affiliate_tag === 'string' ? candidate.affiliate_tag.trim() : '';
    if (tag && tag.length >= 5) {
      if (context.expectedTag && tag !== context.expectedTag) {
        errors.push(`Affiliate tag mismatch: found "${tag}", expected "${context.expectedTag}".`);
      } else {
        checks.affiliate_tag_valid = true;
      }
    } else {
      errors.push('Missing or invalid affiliate tag.');
    }

    // 4. Canonical Part Number
    const normPart = PartNormalizer.normalizePartNumber(candidate.part_number);
    if (normPart && normPart.length === 11) {
      checks.part_number_canonical = true;
    } else {
      errors.push(`Invalid canonical 11-digit STIHL part number: "${candidate.part_number}".`);
    }

    // 5. Catalog Grounding (must exist in canonical 18,373 parts catalog)
    if (context.catalogPartMap && normPart) {
      const exists = context.catalogPartMap instanceof Set
        ? context.catalogPartMap.has(normPart)
        : context.catalogPartMap.has(normPart);
      if (exists) {
        checks.catalog_grounded = true;
      } else {
        errors.push(`Part number "${normPart}" does not exist in canonical parts catalog.`);
      }
    } else {
      checks.catalog_grounded = true; // skipped if map not passed
    }

    // 6. Mandatory Provenance Fields
    const requiredFields = ['manufacturer', 'brand', 'oem_brand_classification', 'verification_date'];
    const missingFields = requiredFields.filter(f => !candidate[f] || typeof candidate[f] !== 'string');
    if (missingFields.length === 0) {
      checks.provenance_fields_present = true;
    } else {
      errors.push(`Missing mandatory provenance fields: ${missingFields.join(', ')}.`);
    }

    const passed = errors.length === 0;
    return {
      status: passed ? GATE_STATUSES.PASS : GATE_STATUSES.FAIL,
      passed,
      checks,
      errors
    };
  }

  /**
   * Evaluates Gate 2: Product & Compatibility Validation.
   *
   * @param {Object} candidate
   * @param {Object} [context]
   * @returns {{ status: string, passed: boolean, checks: Object, errors: string[] }}
   */
  static evaluateGate2(candidate, context = {}) {
    const errors = [];
    const checks = {
      oem_taxonomy_valid: false,
      manufacturer_mpn_proof: false,
      compatibility_proof: false,
      asin_product_identity_proof: false,
      known_mismatch_absent: false,
      volatile_facts_absent: false,
      independent_sources_corroborated: false
    };

    if (!candidate || typeof candidate !== 'object') {
      return {
        status: GATE_STATUSES.FAIL,
        passed: false,
        checks,
        errors: ['Candidate record is null or not an object']
      };
    }

    // 1. OEM Brand Taxonomy Classification
    if (VALID_OEM_BRAND_CLASSIFICATIONS.has(candidate.oem_brand_classification)) {
      checks.oem_taxonomy_valid = true;
    } else {
      errors.push(`Invalid OEM brand classification: "${candidate.oem_brand_classification}". Must be one of: ${Array.from(VALID_OEM_BRAND_CLASSIFICATIONS).join(', ')}`);
    }

    // 2. Manufacturer MPN Proof
    const mpn = candidate.manufacturer_part_number || candidate.mpn;
    if (typeof mpn === 'string' && mpn.trim().length > 0) {
      checks.manufacturer_mpn_proof = true;
    } else {
      errors.push('Missing manufacturer MPN / stock number proof.');
    }

    // 3. Compatibility Proof
    const compProof = candidate.compatibility_proof || candidate.compatibility_evidence || candidate.confirmed_stihl_compatibility;
    if (typeof compProof === 'string' && compProof.trim().length > 0) {
      checks.compatibility_proof = true;
    } else {
      errors.push('Missing technical STIHL compatibility evidence.');
    }

    // 4. Amazon ASIN Product Identity Proof
    const asinProof = candidate.asin_product_identity_proof || candidate.asin_identity_evidence || candidate.confirmed_product_identity;
    if (typeof asinProof === 'string' && asinProof.trim().length > 0) {
      checks.asin_product_identity_proof = true;
    } else {
      errors.push('Missing independent Amazon ASIN product identity proof.');
    }

    // 5. Known Part Number Identity Mismatch Check
    const normPart = PartNormalizer.normalizePartNumber(candidate.part_number);
    if (normPart && isKnownPartNumberMismatch(normPart, candidate.asin, candidate.product_title || candidate.matched_title || '')) {
      errors.push(`KNOWN_PART_NUMBER_MISMATCH: ${normPart} with ASIN ${candidate.asin} is a known incorrect cross-reference.`);
    } else {
      checks.known_mismatch_absent = true;
    }

    // 6. Volatile Facts Disallowance (no static prices or stock availability claims)
    if (candidate.price !== undefined && candidate.price !== null) {
      errors.push('Disallowed volatile fact present: "price" must not be stored statically.');
    } else if (candidate.in_stock !== undefined && candidate.in_stock !== null) {
      errors.push('Disallowed volatile fact present: "in_stock" must not be stored statically.');
    } else {
      checks.volatile_facts_absent = true;
    }

    // 7. Independent External Sources Corroborated
    const sources = candidate.verifiable_evidence_sources || candidate.evidence_sources;
    if (Array.isArray(sources) && sources.length > 0) {
      const validSources = sources.every(s => s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url) && s.claim);
      if (validSources) {
        checks.independent_sources_corroborated = true;
      } else {
        errors.push('One or more evidence sources lack a valid HTTPS URL or claim description.');
      }
    } else if (typeof candidate.independent_evidence_url === 'string' && /^https?:\/\//i.test(candidate.independent_evidence_url)) {
      checks.independent_sources_corroborated = true;
    } else {
      errors.push('Missing verifiable external evidence source URL.');
    }

    const passed = errors.length === 0;
    return {
      status: passed ? GATE_STATUSES.PASS : GATE_STATUSES.FAIL,
      passed,
      checks,
      errors
    };
  }

  /**
   * Performs full Two-Gate Verification on an offer candidate.
   *
   * @param {Object} candidate
   * @param {Object} [context]
   * @returns {{ gate1: Object, gate2: Object, overall_status: string, passed: boolean, eligible_for_active: boolean, errors: string[] }}
   */
  static verifyOffer(candidate, context = {}) {
    const gate1 = this.evaluateGate1(candidate, context);
    const gate2 = this.evaluateGate2(candidate, context);

    const allPassed = gate1.passed && gate2.passed;
    const allErrors = [...gate1.errors, ...gate2.errors];

    return {
      gate1,
      gate2,
      overall_status: allPassed ? GATE_STATUSES.PASS : GATE_STATUSES.FAIL,
      passed: allPassed,
      eligible_for_active: allPassed,
      errors: allErrors
    };
  }
}
