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

export const ALLOWED_AMAZON_MARKETPLACES = new Set([
  'amazon.nl',
  'amazon.de',
  'amazon.com'
]);

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
   * Fails closed if feature flag is false or tag is missing.
   * @returns {boolean}
   */
  isEnabled() {
    const enabledFlag = process.env.AMAZON_AFFILIATE_ENABLED;
    const isFlagTrue = enabledFlag === 'true' || enabledFlag === '1';
    const tag = this.getAssociateTag();
    return isFlagTrue && Boolean(tag);
  }

  /**
   * Reads associate tag strictly from environment variable.
   * Never hardcoded, never logged.
   * @returns {string|null}
   */
  getAssociateTag() {
    const rawTag = process.env.AMAZON_ASSOCIATE_TAG;
    if (typeof rawTag === 'string' && rawTag.trim()) {
      return rawTag.trim();
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

    const tag = this.getAssociateTag();
    if (!tag) {
      return [];
    }

    const canonicalPartNumber = params.canonicalPartNumber || PartNormalizer.normalizePartNumber(params.partNumber);
    if (!canonicalPartNumber) {
      return [];
    }

    const formattedPartNumber = PartNormalizer.formatPartNumber(canonicalPartNumber);

    // 1. Check for verified manual ASIN override
    const manualOverride = this.manualOverrides.get(canonicalPartNumber);
    if (manualOverride && manualOverride.enabled !== false && manualOverride.asin) {
      const rawMarketplace = (typeof manualOverride.marketplace === 'string' && manualOverride.marketplace.trim())
        ? manualOverride.marketplace.trim().toLowerCase()
        : this.marketplace;
      const targetMarketplace = ALLOWED_AMAZON_MARKETPLACES.has(rawMarketplace)
        ? rawMarketplace
        : this.marketplace;
      const asinUrl = this.buildAsinUrl(manualOverride.asin, tag, targetMarketplace);
      const displayMarketplace = targetMarketplace.charAt(0).toUpperCase() + targetMarketplace.slice(1);
      return [{
        provider: 'amazon',
        marketplace: targetMarketplace,
        part_number: canonicalPartNumber,
        asin: manualOverride.asin,
        url: asinUrl,
        affiliate_url: asinUrl,
        title: manualOverride.title || (params.partName ? `STIHL ${params.partName} (${formattedPartNumber})` : `STIHL ${formattedPartNumber}`),
        price: null,
        currency: 'EUR',
        image_url: manualOverride.image_url || null,
        match_type: AMAZON_MATCH_TYPES.MANUAL_ASIN,
        confidence: 'HIGH',
        label: `Bekijk op ${displayMarketplace}`,
        rel: 'sponsored nofollow noopener',
      }];
    }

    // 2. Safe deterministic Amazon search link fallback
    const searchUrl = this.buildSearchUrl(canonicalPartNumber, tag);
    return [{
      provider: 'amazon',
      marketplace: this.marketplace,
      part_number: canonicalPartNumber,
      asin: null,
      url: searchUrl,
      affiliate_url: searchUrl,
      title: params.partName
        ? `Zoek ${params.partName} (STIHL ${formattedPartNumber}) op Amazon.nl`
        : `Zoek STIHL ${formattedPartNumber} op Amazon.nl`,
      price: null,
      currency: 'EUR',
      image_url: null,
      match_type: AMAZON_MATCH_TYPES.SEARCH_LINK,
      confidence: 'SEARCH_FALLBACK',
      label: 'Bekijk op Amazon.nl',
      rel: 'sponsored nofollow noopener',
      target: '_blank'
    }];
  }
}
