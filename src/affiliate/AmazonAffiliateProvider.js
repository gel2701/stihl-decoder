/**
 * Amazon Affiliate Provider for STIHLDecoder.nl
 * Phase 54A — Deterministic Amazon Search Links & Verified ASIN Overrides
 */

import { AffiliateProvider } from './AffiliateProvider.js';
import { PartNormalizer } from '../parts/PartNormalizer.js';
import {
  PRODUCTION_VERIFIED_CLASSIFICATIONS,
  isProductionVerifiedClassification,
  isKnownPartNumberMismatch,
  isProductionVerifiedAmazonOffer
} from './AmazonProductionOfferContract.js';

export const AMAZON_MATCH_TYPES = {
  SEARCH_LINK: 'SEARCH_LINK',
  MANUAL_ASIN: 'MANUAL_ASIN',
  API_EXACT: 'API_EXACT',
  API_HIGH_CONFIDENCE: 'API_HIGH_CONFIDENCE'
};

export const COMMERCIAL_TIERS = {
  DIRECT_VERIFIED: 'DIRECT_VERIFIED',
  TARGETED_SEARCH: 'TARGETED_SEARCH',
  INFORMATION_ONLY: 'INFORMATION_ONLY'
};

export const VERIFICATION_STATUSES = {
  VERIFIED_EXACT_MATCH: 'VERIFIED_EXACT_MATCH'
};

export const QUERY_VARIANTS = {
  VARIANT_A: 'VARIANT_A', // STIHL <formatted part number>, e.g. "STIHL 1123 160 2050"
  VARIANT_B: 'VARIANT_B'  // STIHL <compact part number>, e.g. "STIHL 11231602050"
};

/**
 * Deterministically computes query variant for a given canonical part number.
 * Yields exactly ~50/50 distribution across canonical parts.
 *
 * @param {string} partNumber
 * @returns {string} 'VARIANT_A' | 'VARIANT_B'
 */
export function getDeterministicQueryVariant(partNumber) {
  const norm = PartNormalizer.normalizePartNumber(partNumber);
  if (!norm) return QUERY_VARIANTS.VARIANT_A;
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  }
  return (hash % 2 === 0) ? QUERY_VARIANTS.VARIANT_B : QUERY_VARIANTS.VARIANT_A;
}

export const ALLOWED_AMAZON_MARKETPLACES = new Set([
  'amazon.nl',
  'amazon.de',
  'amazon.com'
]);

export const ASIN_REGEX = /^[A-Z0-9]{10}$/;

export function isValidAsin(rawAsin) {
  if (typeof rawAsin !== 'string') return false;
  return ASIN_REGEX.test(rawAsin.trim().toUpperCase());
}

export const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function isValidIsoTimestamp(str) {
  if (typeof str !== 'string') return false;
  if (!ISO_TIMESTAMP_REGEX.test(str.trim())) return false;
  const parsed = Date.parse(str.trim());
  return !Number.isNaN(parsed);
}

export function isValidManualAsinOverride(override) {
  if (!override || typeof override !== 'object') return false;
  if (override.enabled !== true) return false;
  return isProductionVerifiedAmazonOffer(override);
}

/**
 * Extracts at most 2 core keywords from a part name for targeted search.
 * Filters out brand names, stop words, and noise.
 * @param {string} rawPartName
 * @returns {string}
 */
export function extractTargetedSearchKeywords(rawPartName) {
  if (!rawPartName || typeof rawPartName !== 'string') return '';
  let clean = rawPartName.toLowerCase().replace(/[\r\n\t]+/g, ' ');
  clean = clean.replace(/\b(?:stihl|oem|no\.|nr\.|art\.|artikel|onderdeel|part|piece|st[uü]ck)\b/gi, ' ');
  clean = clean.replace(/\b(?:ms|fs|bg|br|ts|fc|hl|hs|ht|km|bt)\s*\d+[a-z0-9\-\/]*\b/gi, ' ');
  clean = clean.replace(/[^a-z0-9äöüëï\s]/g, ' ');
  const stopWords = new Set([
    'voor', 'van', 'de', 'het', 'een', 'der', 'die', 'das', 'den', 'dem', 'und', 'en', 'met',
    'mit', 'für', 'fur', 'for', 'the', 'and', 'with', 'original', 'origineel', 'passend',
    'geschikt', 'set', 'compleet', 'complete', 'standard', 'standaard'
  ]);
  const tokens = clean.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t) && !/^\d{11}$/.test(t));
  return tokens.slice(0, 2).join(' ');
}

/**
 * Builds safe Amazon search query for targeted search.
 * @param {string} canonicalPartNumber
 * @param {string|Object} [variantOrOptions]
 * @param {Object} [extraOptions]
 * @returns {string}
 */
export function buildSearchQuery(canonicalPartNumber, variantOrOptions = null, extraOptions = {}) {
  let queryVariant = null;
  let partName = null;
  let mpn = null;

  if (typeof variantOrOptions === 'string') {
    if (variantOrOptions === QUERY_VARIANTS.VARIANT_A || variantOrOptions === QUERY_VARIANTS.VARIANT_B) {
      queryVariant = variantOrOptions;
      if (typeof extraOptions === 'string') {
        partName = extraOptions;
      } else if (extraOptions && typeof extraOptions === 'object') {
        partName = extraOptions.partName || null;
        mpn = extraOptions.mpn || null;
      }
    } else {
      partName = variantOrOptions;
      if (extraOptions && typeof extraOptions === 'object') {
        queryVariant = extraOptions.queryVariant || null;
        mpn = extraOptions.mpn || null;
      }
    }
  } else if (variantOrOptions && typeof variantOrOptions === 'object') {
    queryVariant = variantOrOptions.queryVariant || null;
    partName = variantOrOptions.partName || null;
    mpn = variantOrOptions.mpn || null;
  }

  const variant = queryVariant || getDeterministicQueryVariant(canonicalPartNumber);
  const formattedPartNumber = PartNormalizer.formatPartNumber(canonicalPartNumber);
  const partNoToken = (variant === QUERY_VARIANTS.VARIANT_A)
    ? formattedPartNumber
    : canonicalPartNumber;

  let query = `STIHL ${partNoToken}`;
  const keywords = extractTargetedSearchKeywords(partName);
  if (keywords) {
    query += ` ${keywords}`;
  }

  if (mpn && typeof mpn === 'string') {
    const cleanMpn = mpn.trim().replace(/[^a-zA-Z0-9\-\/]/g, '');
    if (cleanMpn && !query.toLowerCase().includes(cleanMpn.toLowerCase())) {
      query += ` ${cleanMpn}`;
    }
  }

  return query;
}

export class AmazonAffiliateProvider extends AffiliateProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.marketplace='amazon.nl']
   * @param {Map<string, Object>|Array<Object>} [options.manualOverrides]
   * @param {Object} [options.verifiedRegistry]
   */
  constructor(options = {}) {
    super('amazon');
    this.marketplace = options.marketplace || 'amazon.nl';
    this.verifiedRegistry = options.verifiedRegistry || null;
    this.manualOverrides = new Map();
    if (options.manualOverrides) {
      this.setManualOverrides(options.manualOverrides);
    }
  }

  /**
   * Attaches a VerifiedOfferRegistry instance (Phase 59D).
   * @param {Object} registry
   */
  setVerifiedRegistry(registry) {
    this.verifiedRegistry = registry || null;
  }

  /**
   * Returns whether Amazon affiliate integration is active.
   * Fails closed if feature flag is false or tag for default marketplace is missing.
   * @returns {boolean}
   */
  isEnabled() {
    const enabledFlag = process.env.AMAZON_AFFILIATE_ENABLED;
    const isFlagTrue = enabledFlag === 'true' || enabledFlag === '1';
    const tag = this.getAssociateTag(this.marketplace);
    return isFlagTrue && Boolean(tag);
  }

  /**
   * Reads associate tag for the given marketplace from environment variables.
   * Supports regional tags (e.g. AMAZON_ASSOCIATE_TAG_DE, AMAZON_ASSOCIATE_TAG_COM)
   * with fallback to AMAZON_ASSOCIATE_TAG strictly for amazon.nl.
   * Never hardcoded, never logged.
   * @param {string} [marketplace]
   * @returns {string|null}
   */
  getAssociateTag(marketplace = this.marketplace) {
    const targetMarketplace = (typeof marketplace === 'string' && marketplace.trim())
      ? marketplace.trim().toLowerCase()
      : this.marketplace;

    // 1. Check explicit regional env var (e.g., AMAZON_ASSOCIATE_TAG_DE, AMAZON_ASSOCIATE_TAG_COM, AMAZON_ASSOCIATE_TAG_NL)
    const suffix = targetMarketplace.split('.').pop()?.toUpperCase();
    if (suffix) {
      const regionalVar = `AMAZON_ASSOCIATE_TAG_${suffix}`;
      const regionalTag = process.env[regionalVar];
      if (typeof regionalTag === 'string' && regionalTag.trim()) {
        return regionalTag.trim();
      }
    }

    // 2. Primary generic tag strictly applies to amazon.nl only
    if (targetMarketplace === 'amazon.nl') {
      const rawTag = process.env.AMAZON_ASSOCIATE_TAG;
      if (typeof rawTag === 'string' && rawTag.trim()) {
        return rawTag.trim();
      }
    }

    return null;
  }

  /**
   * Sets or updates manual overrides map.
   * @param {Map<string, Object>|Array<Object>} overrides
   */
  setManualOverrides(overrides) {
    this.manualOverrides.clear();
    if (overrides instanceof Map) {
      for (const [key, val] of overrides.entries()) {
        const normKey = PartNormalizer.normalizePartNumber(key);
        if (normKey) this.manualOverrides.set(normKey, val);
      }
    } else if (Array.isArray(overrides)) {
      for (const item of overrides) {
        if (item && item.part_number) {
          const normKey = PartNormalizer.normalizePartNumber(item.part_number);
          if (normKey) this.manualOverrides.set(normKey, item);
        }
      }
    }
  }

  /**
   * Builds safe, encoded Amazon search URL with deterministic A/B query variant
   * and optional targeted keywords (part name, MPN).
   * @param {string} canonicalPartNumber
   * @param {string} tag
   * @param {string|Object} [variantOrOptions]
   * @param {Object} [extraOptions]
   * @param {string} [marketplace]
   * @returns {string}
   */
  buildSearchUrl(canonicalPartNumber, tag, variantOrOptions = null, extraOptions = {}, marketplace = this.marketplace) {
    const query = buildSearchQuery(canonicalPartNumber, variantOrOptions, extraOptions);
    const targetMarketplace = ALLOWED_AMAZON_MARKETPLACES.has(marketplace)
      ? marketplace
      : this.marketplace;
    const params = new URLSearchParams();
    params.set('k', query);
    params.set('tag', tag);
    return `https://${targetMarketplace}/s?${params.toString()}`;
  }

  /**
   * Builds safe Amazon product URL for verified ASIN.
   * @param {string} asin
   * @param {string} tag
   * @param {string} [marketplace]
   * @returns {string}
   */
  buildAsinUrl(asin, tag, marketplace = this.marketplace) {
    const rawMarketplace = (typeof marketplace === 'string' && marketplace.trim())
      ? marketplace.trim().toLowerCase()
      : this.marketplace;
    const targetMarketplace = ALLOWED_AMAZON_MARKETPLACES.has(rawMarketplace)
      ? rawMarketplace
      : this.marketplace;
    const safeAsin = encodeURIComponent(asin.trim());
    const params = new URLSearchParams();
    params.set('tag', tag);
    return `https://${targetMarketplace}/dp/${safeAsin}?${params.toString()}`;
  }

  /**
   * Resolves commercial offers for a given part number.
   *
   * @param {Object} params
   * @param {string} params.partNumber
   * @param {string} [params.canonicalPartNumber]
   * @param {string} [params.partName]
   * @param {string} [params.model]
   * @param {string} [params.configuration]
   * @returns {Array<Object>}
   */
  getOffers(params = {}) {
    if (!this.isEnabled()) {
      return [];
    }

    const defaultTag = this.getAssociateTag(this.marketplace);
    if (!defaultTag) {
      return [];
    }

    const canonicalPartNumber = params.canonicalPartNumber || PartNormalizer.normalizePartNumber(params.partNumber);
    if (!canonicalPartNumber) {
      return [];
    }

    const formattedPartNumber = PartNormalizer.formatPartNumber(canonicalPartNumber);

    // 0. Check VerifiedOfferRegistry first (Phase 59D Controlled Activation)
    if (this.verifiedRegistry && typeof this.verifiedRegistry.getActiveOffer === 'function') {
      const activeOffer = this.verifiedRegistry.getActiveOffer(canonicalPartNumber);
      if (activeOffer) {
        const targetMarketplace = activeOffer.marketplace || this.marketplace;
        const targetTag = this.getAssociateTag(targetMarketplace);
        if (targetTag) {
          const commercialOffer = this.verifiedRegistry.resolveCommercialOffer({
            partNumber: canonicalPartNumber,
            partName: params.partName,
            tag: targetTag,
            marketplace: targetMarketplace
          });
          if (commercialOffer) {
            return [commercialOffer];
          }
        }
      }
    }

    // 1. Check for verified manual ASIN override
    const manualOverride = this.manualOverrides.get(canonicalPartNumber);
    if (manualOverride && isValidManualAsinOverride(manualOverride)) {
      const cleanAsin = manualOverride.asin.trim().toUpperCase();
      const rawMarketplace = (typeof manualOverride.marketplace === 'string' && manualOverride.marketplace.trim())
        ? manualOverride.marketplace.trim().toLowerCase()
        : this.marketplace;
      const targetMarketplace = ALLOWED_AMAZON_MARKETPLACES.has(rawMarketplace)
        ? rawMarketplace
        : this.marketplace;

      const overrideTag = (typeof manualOverride.tag === 'string' && manualOverride.tag.trim())
        ? manualOverride.tag.trim()
        : this.getAssociateTag(targetMarketplace);

      // Only produce override offer if a valid tag exists for the target marketplace;
      // non-NL overrides without matching regional tag are rejected and fall through to default search.
      if (overrideTag) {
        const asinUrl = this.buildAsinUrl(cleanAsin, overrideTag, targetMarketplace);
        const displayMarketplace = targetMarketplace.charAt(0).toUpperCase() + targetMarketplace.slice(1);
        return [{
          provider: 'amazon',
          marketplace: targetMarketplace,
          part_number: canonicalPartNumber,
          asin: cleanAsin,
          tag: overrideTag,
          url: asinUrl,
          affiliate_url: asinUrl,
          link_type: 'DIRECT_ASIN',
          tier: COMMERCIAL_TIERS.DIRECT_VERIFIED,
          title: manualOverride.title || (params.partName ? `STIHL ${params.partName} (${formattedPartNumber})` : `STIHL ${formattedPartNumber}`),
          price: null,
          currency: 'EUR',
          in_stock: null,
          image_url: manualOverride.image_url || null,
          match_type: AMAZON_MATCH_TYPES.MANUAL_ASIN,
          is_verified: true,
          verification_status: manualOverride.verification_status,
          verified_at: manualOverride.verified_at,
          confidence: 'HIGH',
          label: `Bekijk product op ${displayMarketplace}`,
          badge_label: 'Geverifieerd product',
          cta_aria_label: `Bekijk geverifieerd Amazon-product voor STIHL onderdeel ${formattedPartNumber}`,
          description: 'Voor dit onderdeel is een specifieke Amazon-productpagina gecontroleerd. Controleer vóór aankoop altijd onderdeelnummer en machine-uitvoering.',
          rel: 'sponsored nofollow noopener',
          target: '_blank'
        }];
      }
    }

    // 2. Safe deterministic Amazon search link fallback
    const queryVariant = params.queryVariant || getDeterministicQueryVariant(canonicalPartNumber);
    const searchUrl = this.buildSearchUrl(canonicalPartNumber, defaultTag, {
      queryVariant,
      partName: params.partName,
      mpn: params.mpn,
      replacedBy: params.replacedBy
    });
    const displayMarketplace = this.marketplace.charAt(0).toUpperCase() + this.marketplace.slice(1);
    const offers = [{
      provider: 'amazon',
      marketplace: this.marketplace,
      part_number: canonicalPartNumber,
      asin: null,
      tag: defaultTag,
      url: searchUrl,
      affiliate_url: searchUrl,
      link_type: 'SEARCH_FALLBACK',
      tier: COMMERCIAL_TIERS.TARGETED_SEARCH,
      query_variant: queryVariant,
      title: params.partName
        ? `Zoek ${params.partName} (STIHL ${formattedPartNumber}) op ${displayMarketplace}`
        : `Zoek STIHL ${formattedPartNumber} op ${displayMarketplace}`,
      price: null,
      currency: 'EUR',
      in_stock: null,
      image_url: null,
      match_type: AMAZON_MATCH_TYPES.SEARCH_LINK,
      is_verified: false,
      verification_status: null,
      verified_at: null,
      confidence: 'SEARCH_FALLBACK',
      label: `Zoek op ${displayMarketplace}`,
      badge_label: 'Amazon-zoekopdracht',
      cta_aria_label: `Zoek STIHL onderdeel ${formattedPartNumber} op ${displayMarketplace}`,
      description: `Zoek op Amazon naar STIHL onderdeel ${formattedPartNumber}. De beschikbaarheid en exacte overeenkomst zijn niet vooraf bevestigd.`,
      rel: 'sponsored nofollow noopener',
      target: '_blank'
    }];

    // 3. Optional secondary Amazon.de search offer (ONLY if explicit regional AMAZON_ASSOCIATE_TAG_DE is set)
    const deTag = this.getAssociateTag('amazon.de');
    if (deTag && this.marketplace !== 'amazon.de') {
      const deSearchUrl = this.buildSearchUrl(canonicalPartNumber, deTag, {
        queryVariant,
        partName: params.partName,
        mpn: params.mpn,
        replacedBy: params.replacedBy
      }, {}, 'amazon.de');
      offers.push({
        provider: 'amazon',
        marketplace: 'amazon.de',
        part_number: canonicalPartNumber,
        asin: null,
        tag: deTag,
        url: deSearchUrl,
        affiliate_url: deSearchUrl,
        link_type: 'SEARCH_FALLBACK',
        tier: COMMERCIAL_TIERS.TARGETED_SEARCH,
        query_variant: queryVariant,
        title: params.partName
          ? `Zoek ${params.partName} (STIHL ${formattedPartNumber}) op Amazon.de`
          : `Zoek STIHL ${formattedPartNumber} op Amazon.de`,
        price: null,
        currency: 'EUR',
        in_stock: null,
        image_url: null,
        match_type: AMAZON_MATCH_TYPES.SEARCH_LINK,
        is_verified: false,
        verification_status: null,
        verified_at: null,
        confidence: 'SEARCH_FALLBACK',
        label: 'Zoek op Amazon.de',
        badge_label: 'Amazon.de zoekopdracht',
        cta_aria_label: `Zoek STIHL onderdeel ${formattedPartNumber} op Amazon.de`,
        description: `Zoek op Amazon.de naar STIHL onderdeel ${formattedPartNumber}. De beschikbaarheid en exacte overeenkomst zijn niet vooraf bevestigd.`,
        rel: 'sponsored nofollow noopener',
        target: '_blank'
      });
    }

    return offers;
  }
}
