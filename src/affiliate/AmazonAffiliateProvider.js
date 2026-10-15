/**
 * Amazon Affiliate Provider for STIHLDecoder.nl
 * Phase 54A — Deterministic Amazon Search Links & Verified ASIN Overrides
 */

import { AffiliateProvider } from './AffiliateProvider.js';
import { PartNormalizer } from '../parts/PartNormalizer.js';

export const AMAZON_MATCH_TYPES = {
  SEARCH_LINK: 'SEARCH_LINK',
  MANUAL_ASIN: 'MANUAL_ASIN',
  API_EXACT: 'API_EXACT',
  API_HIGH_CONFIDENCE: 'API_HIGH_CONFIDENCE'
};

export const VERIFICATION_STATUSES = {
  VERIFIED_EXACT_MATCH: 'VERIFIED_EXACT_MATCH'
};

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
  if (!isValidAsin(override.asin)) return false;
  if (override.verification_status !== VERIFICATION_STATUSES.VERIFIED_EXACT_MATCH) return false;
  if (!isValidIsoTimestamp(override.verified_at)) return false;
  if (override.marketplace && !ALLOWED_AMAZON_MARKETPLACES.has(override.marketplace.trim().toLowerCase())) return false;
  return true;
}

export class AmazonAffiliateProvider extends AffiliateProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.marketplace='amazon.nl']
   * @param {Map<string, Object>|Array<Object>} [options.manualOverrides]
   */
  constructor(options = {}) {
    super('amazon');
    this.marketplace = options.marketplace || 'amazon.nl';
    this.manualOverrides = new Map();
    if (options.manualOverrides) {
      this.setManualOverrides(options.manualOverrides);
    }
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
   * Builds safe, encoded Amazon search URL.
   * @param {string} canonicalPartNumber
   * @param {string} tag
   * @returns {string}
   */
  buildSearchUrl(canonicalPartNumber, tag) {
    const query = `STIHL ${canonicalPartNumber}`;
    const params = new URLSearchParams();
    params.set('k', query);
    params.set('tag', tag);
    return `https://${this.marketplace}/s?${params.toString()}`;
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
          title: manualOverride.title || (params.partName ? `STIHL ${params.partName} (${formattedPartNumber})` : `STIHL ${formattedPartNumber}`),
          price: null,
          currency: 'EUR',
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
    const searchUrl = this.buildSearchUrl(canonicalPartNumber, defaultTag);
    const displayMarketplace = this.marketplace.charAt(0).toUpperCase() + this.marketplace.slice(1);
    return [{
      provider: 'amazon',
      marketplace: this.marketplace,
      part_number: canonicalPartNumber,
      asin: null,
      tag: defaultTag,
      url: searchUrl,
      affiliate_url: searchUrl,
      title: params.partName
        ? `Zoek ${params.partName} (STIHL ${formattedPartNumber}) op ${displayMarketplace}`
        : `Zoek STIHL ${formattedPartNumber} op ${displayMarketplace}`,
      price: null,
      currency: 'EUR',
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
  }
}
