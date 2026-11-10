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
import { validateGtin } from './GtinValidator.js';
import { checkHistoricalMismatch } from './HistoricalMismatches.js';

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
  'SUSPENDED',
  'RESEARCH_REQUIRED',
  'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE',
  'PART_COMPATIBILITY_ONLY',
  'ASIN_IDENTITY_UNVERIFIED',
  'CONFLICTING_EVIDENCE',
  'INCORRECT_MATCH_CONFIRMED',
  'AMAZON_LISTING_COMPATIBLE'
]);

export const EVIDENCE_CLASSIFICATIONS = Object.freeze({
  AMAZON_LISTING_COMPATIBLE: 'AMAZON_LISTING_COMPATIBLE',
  INDEPENDENT_MANUFACTURER_VERIFIED: 'INDEPENDENT_MANUFACTURER_VERIFIED'
});

export const UNVERIFIED_ASIN_STATUSES = new Set([
  'ASIN_IDENTITY_UNVERIFIED',
  'PART_COMPATIBILITY_ONLY',
  'CONFLICTING_EVIDENCE',
  'INCORRECT_MATCH_CONFIRMED',
  'UNVERIFIED'
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

    const isAmazonListingCompatible = candidate.evidence_classification === 'AMAZON_LISTING_COMPATIBLE' ||
      candidate.status === 'AMAZON_LISTING_COMPATIBLE' ||
      candidate.verification_status === 'AMAZON_LISTING_COMPATIBLE' ||
      candidate.evidence_type === 'AMAZON_LISTING_COMPATIBLE';

    // 6. Mandatory Provenance Fields & Freshness (max 180 days)
    const requiredFields = isAmazonListingCompatible
      ? ['brand', 'oem_brand_classification', 'verification_date']
      : ['manufacturer', 'brand', 'oem_brand_classification', 'verification_date'];
    const missingFields = requiredFields.filter(f => !candidate[f] || typeof candidate[f] !== 'string');
    if (missingFields.length > 0) {
      errors.push(`Missing mandatory provenance fields: ${missingFields.join(', ')}.`);
    } else {
      const vDate = new Date(candidate.verification_date);
      if (isNaN(vDate.getTime())) {
        errors.push(`Invalid verification_date format: "${candidate.verification_date}". Must be a valid ISO date.`);
      } else {
        const maxAgeDays = context.maxEvidenceAgeDays || 180;
        const ageMs = Date.now() - vDate.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays > maxAgeDays) {
          errors.push(`Stale evidence record: verification_date "${candidate.verification_date}" is older than ${maxAgeDays} days.`);
        } else {
          checks.provenance_fields_present = true;
        }
      }
    }

    // 7. EAN/GTIN Validation (when present)
    const rawGtin = candidate.ean_gtin || candidate.gtin || candidate.ean;
    if (rawGtin !== undefined && rawGtin !== null && rawGtin !== '') {
      const gtinValidation = validateGtin(rawGtin);
      if (!gtinValidation.valid) {
        errors.push(`INVALID_GTIN: ${gtinValidation.error}`);
      } else {
        // Detect suspicious synthetic sequential counter patterns (e.g. 1041..1082 series)
        if (typeof rawGtin === 'string' && /210[45678]\d{3}$/.test(rawGtin)) {
          errors.push(`SUSPICIOUS_SEQUENTIAL_GTIN: GTIN "${rawGtin}" matches an uncorroborated sequential generator pattern.`);
        } else {
          checks.gtin_valid = true;
        }
      }
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

    const isAmazonListingCompatible = candidate.evidence_classification === 'AMAZON_LISTING_COMPATIBLE' ||
      candidate.status === 'AMAZON_LISTING_COMPATIBLE' ||
      candidate.verification_status === 'AMAZON_LISTING_COMPATIBLE' ||
      candidate.evidence_type === 'AMAZON_LISTING_COMPATIBLE';

    // 0. Technical Conflict & Unproven Guard
    if (candidate.blocker === 'BLOCKED_CONFLICT' || candidate.status === 'BLOCKED_CONFLICT' || candidate.has_technical_conflict === true) {
      errors.push(`BLOCKED_CONFLICT: ${candidate.blocker_reason || candidate.conflict_reason || 'Conflicting technical specifications detected (e.g. pitch, spline or dimension mismatch).'}`);
    }

    if (candidate.status === 'RESEARCH_REQUIRED' || candidate.evidence_audit_category === 'RESEARCH_REQUIRED') {
      if (candidate.pilot_active === true || candidate.is_active === true) {
        errors.push('UNPROVEN_ACTIVE_PROHIBITED: Candidate categorized as RESEARCH_REQUIRED cannot have pilot_active === true.');
      }
    }

    // 1. OEM Brand Taxonomy Classification
    if (VALID_OEM_BRAND_CLASSIFICATIONS.has(candidate.oem_brand_classification)) {
      if (candidate.oem_brand_classification === 'GENUINE_STIHL' && candidate.brand && candidate.brand.toUpperCase() !== 'STIHL') {
        errors.push(`OEM_CLASSIFICATION_CONTRADICTION: Brand "${candidate.brand}" contradicts GENUINE_STIHL classification.`);
      } else {
        checks.oem_taxonomy_valid = true;
      }
    } else {
      errors.push(`Invalid OEM brand classification: "${candidate.oem_brand_classification}". Must be one of: ${Array.from(VALID_OEM_BRAND_CLASSIFICATIONS).join(', ')}`);
    }

    // 2. Manufacturer MPN Proof
    const mpn = candidate.manufacturer_part_number || candidate.mpn || (candidate.oem_brand_classification === 'GENUINE_STIHL' ? candidate.part_number : null);
    if (typeof mpn === 'string' && mpn.trim().length > 0) {
      checks.manufacturer_mpn_proof = true;
    } else {
      errors.push('Missing manufacturer MPN / stock number proof.');
    }

    // 3. Compatibility Proof
    const compProof = candidate.compatibility_proof || candidate.compatibility_evidence || candidate.confirmed_stihl_compatibility;
    if (typeof compProof === 'string' && compProof.trim().length > 0) {
      if (isAmazonListingCompatible) {
        const normPart = PartNormalizer.normalizePartNumber(candidate.part_number);
        const compClean = compProof.replace(/[\s.-]/g, '');
        const mentionsModelOrPart = /\b(?:MS|FS|BR|BG|SH|TS|HT|BT|HL|KM|017|018|021|023|025|026|028|029|034|036|038|039|044|046|064|066)\b/i.test(compProof) ||
          (normPart && compClean.includes(normPart)) ||
          /\bSTIHL\b/i.test(compProof);
        if (!mentionsModelOrPart) {
          errors.push('AMAZON_LISTING_INCOMPATIBLE: Amazon listing compatibility proof must explicitly name the STIHL model or part number.');
        } else {
          checks.compatibility_proof = true;
        }
      } else {
        checks.compatibility_proof = true;
      }
    } else {
      errors.push('Missing technical STIHL compatibility evidence.');
    }

    // 4. Amazon ASIN Product Identity Proof & Attributable Corroboration
    const candidateStatus = typeof candidate.status === 'string' ? candidate.status.trim().toUpperCase() : '';
    const isExplicitlyUnverified = UNVERIFIED_ASIN_STATUSES.has(candidateStatus) ||
      candidate.asin_identity_verified === false ||
      candidate.asin_identity_unverified === true;

    const asinProof = candidate.asin_product_identity_proof || candidate.asin_identity_evidence || candidate.confirmed_product_identity;
    const sources = Array.isArray(candidate.verifiable_evidence_sources)
      ? candidate.verifiable_evidence_sources
      : (Array.isArray(candidate.evidence_sources) ? candidate.evidence_sources : []);

    const allUrls = [];
    if (sources.length > 0) {
      for (const s of sources) {
        if (s && typeof s.url === 'string' && s.url.trim()) allUrls.push(s.url.trim());
      }
    }
    if (typeof candidate.independent_evidence_url === 'string' && candidate.independent_evidence_url.trim()) {
      allUrls.push(candidate.independent_evidence_url.trim());
    }

    if (isExplicitlyUnverified) {
      errors.push(`ASIN_IDENTITY_UNVERIFIED: ASIN ${candidate.asin} lacks external machine-verifiable proof linking it to physical product.`);
    } else if (typeof asinProof !== 'string' || asinProof.trim().length === 0) {
      errors.push('Missing independent Amazon ASIN product identity proof.');
    } else if (isAmazonListingCompatible) {
      // Under Amazon Compatibility First (Phase 69C / 73A):
      // A verified Amazon product listing URL constitutes sufficient ASIN identity proof ONLY if genuine and corroborated.
      const selfCertifiedPatterns = /^(agent\s+verified|matched\s+by\s+title|confirmed\s+match\s+by\s+agent|self-certified|100%\s+genuine\s+match\s+verified|title\s+match)/i;
      if (selfCertifiedPatterns.test(asinProof.trim())) {
        errors.push(`SELF_CERTIFIED_PROOF_REJECTED: Agent-generated statement "${asinProof.trim()}" cannot satisfy ASIN product identity.`);
      }

      if (allUrls.length === 0) {
        errors.push('Missing verifiable Amazon product listing URL.');
      } else {
        const untrustedPatterns = /(?:random-blog|forum\.|reddit\.com|fake-proof|generic-store\.example)/i;
        if (allUrls.some(u => untrustedPatterns.test(u))) {
          errors.push('UNTRUSTED_EVIDENCE_SOURCE: Source URL is not an authoritative Amazon listing or product catalog.');
        } else if (allUrls.some(u => u.toLowerCase().endsWith('.pdf') || u.toLowerCase().includes('sandbysmeden'))) {
          errors.push('INVALID_AMAZON_EVIDENCE_URL: PDF manual or IPL document cannot serve as Amazon product page evidence.');
        } else {
          // Check typed sources
          for (const src of sources) {
            if (src && src.type === 'AMAZON_PRODUCT_PAGE' && typeof src.url === 'string') {
              if (!src.url.includes('amazon.nl') && !src.url.includes('amazon.de')) {
                errors.push(`INVALID_AMAZON_EVIDENCE_URL: Source typed AMAZON_PRODUCT_PAGE must point to amazon.nl or amazon.de, found: "${src.url}"`);
              }
            }
          }

          // Check for contradictory ASIN claims
          for (const src of sources) {
            if (src && typeof src.claim === 'string') {
              const foundAsins = src.claim.match(/\bB[0-9A-Z]{9}\b/g) || [];
              for (const foundAsin of foundAsins) {
                if (foundAsin !== candidate.asin) {
                  errors.push(`ASIN_MISMATCH: Evidence source claims ASIN ${foundAsin}, which contradicts candidate ASIN ${candidate.asin}.`);
                }
              }
            }
          }
          if (errors.length === 0) {
            checks.asin_product_identity_proof = true;
            checks.independent_sources_corroborated = true;
          }
        }
      }
    } else {
      // 4a. Reject self-certified agent statements
      const selfCertifiedPatterns = /^(agent\s+verified|matched\s+by\s+title|confirmed\s+match\s+by\s+agent|self-certified|100%\s+genuine\s+match\s+verified|title\s+match)/i;
      if (selfCertifiedPatterns.test(asinProof.trim())) {
        errors.push(`SELF_CERTIFIED_PROOF_REJECTED: Agent-generated statement "${asinProof.trim()}" cannot satisfy ASIN product identity.`);
      }

      // 4b. Validate Evidence URLs
      if (allUrls.length === 0) {
        errors.push('Missing verifiable external evidence source URL.');
      } else {
        // Check for generic roots / homepages
        const isGenericRootUrl = (urlStr) => {
          try {
            const u = new URL(urlStr);
            return (!u.pathname || u.pathname === '/' || u.pathname === '') && !u.search;
          } catch {
            return true;
          }
        };

        const hasGenericOnly = allUrls.every(isGenericRootUrl);
        if (hasGenericOnly) {
          errors.push(`GENERIC_EVIDENCE_URL_REJECTED: Generic URL "${allUrls[0]}" does not provide attributable product evidence.`);
        }

        // Check for untrusted blogs / forum patterns
        const untrustedPatterns = /(?:random-blog|forum\.|reddit\.com|fake-proof|generic-store\.example)/i;
        if (allUrls.some(u => untrustedPatterns.test(u))) {
          errors.push('UNTRUSTED_EVIDENCE_SOURCE: Source URL is not an authoritative manufacturer, distributor, or audited product catalog.');
        }

        // Check for IPL / manual PDFs (which prove model fitment, but not Amazon ASIN)
        const isIplUrl = (u) => u.toLowerCase().endsWith('.pdf') || u.toLowerCase().includes('sandbysmeden');
        const allIpl = allUrls.length > 0 && allUrls.every(isIplUrl);
        if (allIpl) {
          errors.push(`ASIN_IDENTITY_UNVERIFIED: Manufacturer manual/IPL (${allUrls[0]}) proves model fitment (Gate 1), but cannot prove Amazon ASIN identity.`);
        }

        // Check for manufacturer pages without ASIN corroboration
        const isManufacturerSite = (u) => /https?:\/\/(?:www\.)?(?:ngkntk\.com|oregonproducts\.com|stihl\.[a-z]+|stihlusa\.com|bosch-automotive\.com|bosch\.com)/i.test(u);
        if (allUrls.length > 0 && allUrls.every(isManufacturerSite)) {
          const hasExplicitAsinCorroboration = sources.some(s => s && typeof s.claim === 'string' && s.claim.includes(candidate.asin));
          if (!hasExplicitAsinCorroboration) {
            errors.push(`ASIN_IDENTITY_UNVERIFIED: Manufacturer page (${allUrls[0]}) proves technical specifications/fitment, but contains no attributable corroboration for Amazon ASIN ${candidate.asin}.`);
          }
        }
      }

      // 4c. Cross-check attributable evidence sources for contradictory ASIN or GTIN
      if (sources.length > 0) {
        const candidateGtinClean = String(candidate.ean_gtin || candidate.gtin || candidate.ean || '').replace(/[\s-]/g, '');
        for (const src of sources) {
          if (src && typeof src.claim === 'string') {
            const foundAsins = src.claim.match(/\bB[0-9A-Z]{9}\b/g) || [];
            for (const foundAsin of foundAsins) {
              if (foundAsin !== candidate.asin) {
                errors.push(`ASIN_MISMATCH: Evidence source claims ASIN ${foundAsin}, which contradicts candidate ASIN ${candidate.asin}.`);
              }
            }
            const foundGtins = src.claim.match(/\b\d{13,14}\b/g) || [];
            for (const g of foundGtins) {
              if (candidateGtinClean && g !== candidateGtinClean) {
                errors.push(`GTIN_MISMATCH: Evidence source specifies GTIN ${g}, which contradicts candidate GTIN ${candidateGtinClean}.`);
              }
            }
          }
        }
      }

      if (errors.length === 0) {
        checks.asin_product_identity_proof = true;
      }
    }

    // 5. Known Part Number Identity Mismatch Check
    const normPart = PartNormalizer.normalizePartNumber(candidate.part_number);
    const mismatchCheck = checkHistoricalMismatch(
      normPart,
      candidate.asin,
      candidate.product_title || candidate.matched_title || candidate.product || candidate.title || '',
      candidate.ean_gtin || candidate.gtin || candidate.ean || ''
    );
    if (mismatchCheck.isMismatch) {
      errors.push(`KNOWN_PART_NUMBER_MISMATCH: ${mismatchCheck.record.reason}`);
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

    // 7. Packaging & Quantity Verification
    const titleText = (candidate.product_title || candidate.matched_title || candidate.title || candidate.product || '').toLowerCase();
    const proofText = (asinProof || '').toLowerCase();
    const combinedText = `${titleText} ${proofText}`;
    const qty = candidate.package_quantity !== undefined && candidate.package_quantity !== null
      ? Number(candidate.package_quantity)
      : null;

    if (qty !== null) {
      if (!Number.isInteger(qty) || qty < 1) {
        errors.push(`Invalid package_quantity: "${candidate.package_quantity}". Must be a positive integer.`);
      } else {
        checks.packaging_valid = true;
      }
    }

    const indicatesMultiPack = /\b(?:pack\s+of\s+\d+|10[- ]?pack|10\s*st[uü]ck|10\s*stuks|box\s+of\s+10|zk\s*c\s*10|\d+\s*pk)\b/i.test(combinedText);
    const indicatesSingle = /\b(?:single\s+piece|single\s+plug|1[- ]?pack|1\s*st[uü]ck|enkelstuks)\b/i.test(combinedText);

    if (indicatesMultiPack && qty === 1) {
      errors.push(`PACKAGE_QUANTITY_MISMATCH: Product description indicates a multi-pack, but candidate package_quantity is 1.`);
    }
    if (indicatesSingle && qty && qty > 1) {
      errors.push(`PACKAGE_QUANTITY_MISMATCH: Product description indicates a single piece, but candidate package_quantity is ${qty}.`);
    }

    // 8. Independent External Sources Corroborated
    if (isAmazonListingCompatible) {
      if (checks.asin_product_identity_proof) {
        checks.independent_sources_corroborated = true;
      } else {
        errors.push('Missing verifiable Amazon product listing URL or proof.');
      }
    } else if (sources.length > 0) {
      const validSources = sources.every(s => s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url) && s.claim);
      if (validSources && !allUrls.some(u => /(?:random-blog|forum\.|fake-proof)/i.test(u))) {
        checks.independent_sources_corroborated = true;
      } else {
        errors.push('One or more evidence sources lack a valid HTTPS URL, claim description, or use an untrusted domain.');
      }
    } else if (typeof candidate.independent_evidence_url === 'string' && /^https?:\/\//i.test(candidate.independent_evidence_url)) {
      if (!allUrls.some(u => /(?:random-blog|forum\.|fake-proof)/i.test(u))) {
        checks.independent_sources_corroborated = true;
      } else {
        errors.push('Evidence source URL points to an untrusted domain.');
      }
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
