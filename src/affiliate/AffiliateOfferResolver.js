/**
 * Affiliate Offer Resolver for STIHLDecoder.nl
 * Phase 54A — Multi-Provider Orchestration & Decoupled Commercial Offers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { AmazonAffiliateProvider, AMAZON_MATCH_TYPES } from './AmazonAffiliateProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultOverridesPath = path.resolve(__dirname, '..', '..', 'data', 'affiliate', 'amazon_part_offers.json');

export class AffiliateOfferResolver {
  /**
   * @param {Object} [options]
   * @param {string} [options.overridesPath]
   */
  constructor(options = {}) {
    this.overridesPath = options.overridesPath || defaultOverridesPath;
    this.providers = new Map();
    this.manualOverridesMap = new Map();
    this.loaded = false;

    // Initialize default Amazon provider
    this.amazonProvider = new AmazonAffiliateProvider();
    this.registerProvider(this.amazonProvider);
  }

  /**
   * Registers a provider.
   * @param {import('./AffiliateProvider.js').AffiliateProvider} provider
   */
  registerProvider(provider) {
    if (provider && typeof provider.getName === 'function') {
      this.providers.set(provider.getName(), provider);
    }
  }

  /**
   * Loads manual ASIN overrides from JSON.
   */
  loadManualOverrides() {
    this.manualOverridesMap.clear();
    try {
      if (fs.existsSync(this.overridesPath)) {
        const raw = fs.readFileSync(this.overridesPath, 'utf8');
        const doc = JSON.parse(raw);
        if (Array.isArray(doc.offers)) {
          for (const item of doc.offers) {
            if (item && item.part_number) {
              const normKey = PartNormalizer.normalizePartNumber(item.part_number);
              if (normKey) {
                this.manualOverridesMap.set(normKey, item);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[AffiliateOfferResolver] Warning loading manual overrides: ${err.message}`);
    }

    if (this.amazonProvider) {
      this.amazonProvider.setManualOverrides(this.manualOverridesMap);
    }
    this.loaded = true;
  }

  /**
   * Ensures manual overrides are loaded.
   */
  ensureLoaded() {
    if (!this.loaded) {
      this.loadManualOverrides();
    }
  }

  /**
   * Reloads overrides (useful for testing or cache refresh).
   */
  reloadManualOverrides() {
    this.loaded = false;
    this.loadManualOverrides();
  }

  /**
   * Checks if global affiliate flag allows offers.
   * @returns {boolean}
   */
  isGlobalAffiliateEnabled() {
    if (process.env.AFFILIATE_ENABLED === 'false' || process.env.AFFILIATE_ENABLED === '0') {
      return false;
    }
    return true;
  }

  /**
   * Resolves commercial offers for a specific part number across all enabled providers.
   * Decoupled from canonical part database.
   *
   * @param {Object} params
   * @param {string} params.partNumber
   * @param {string} [params.partName]
   * @param {string} [params.model]
   * @param {string} [params.configuration]
   * @returns {Array<Object>} Prioritized commercial offers
   */
  resolveOffers(params = {}) {
    if (!this.isGlobalAffiliateEnabled()) {
      return [];
    }

    const rawPartNumber = params.partNumber;
    const canonicalPartNumber = PartNormalizer.normalizePartNumber(rawPartNumber);
    if (!canonicalPartNumber) {
      return [];
    }

    this.ensureLoaded();

    const resolvedParams = {
      ...params,
      canonicalPartNumber
    };

    const allOffers = [];

    for (const provider of this.providers.values()) {
      try {
        if (provider.isEnabled()) {
          const offers = provider.getOffers(resolvedParams);
          if (Array.isArray(offers)) {
            allOffers.push(...offers);
          } else if (offers && typeof offers.then === 'function') {
            console.warn(`[AffiliateOfferResolver] Provider "${provider.getName()}" returned a Promise to synchronous resolveOffers; use resolveOffersAsync for asynchronous providers.`);
          }
        }
      } catch (err) {
        console.warn(`[AffiliateOfferResolver] Error resolving offers from ${provider.getName()}: ${err.message}`);
      }
    }

    this.sortOffers(allOffers);
    return allOffers;
  }

  /**
   * Asynchronously resolves commercial offers across all enabled providers,
   * awaiting any provider that returns a Promise as well as synchronous providers.
   *
   * @param {Object} params
   * @param {string} params.partNumber
   * @param {string} [params.partName]
   * @param {string} [params.model]
   * @param {string} [params.configuration]
   * @returns {Promise<Array<Object>>} Prioritized commercial offers
   */
  async resolveOffersAsync(params = {}) {
    if (!this.isGlobalAffiliateEnabled()) {
      return [];
    }

    const rawPartNumber = params.partNumber;
    const canonicalPartNumber = PartNormalizer.normalizePartNumber(rawPartNumber);
    if (!canonicalPartNumber) {
      return [];
    }

    this.ensureLoaded();

    const resolvedParams = {
      ...params,
      canonicalPartNumber
    };

    const allOffers = [];

    for (const provider of this.providers.values()) {
      try {
        if (provider.isEnabled()) {
          const rawOffers = provider.getOffers(resolvedParams);
          const offers = (rawOffers && typeof rawOffers.then === 'function')
            ? await rawOffers
            : rawOffers;
          if (Array.isArray(offers)) {
            allOffers.push(...offers);
          }
        }
      } catch (err) {
        console.warn(`[AffiliateOfferResolver] Error resolving async offers from ${provider.getName()}: ${err.message}`);
      }
    }

    this.sortOffers(allOffers);
    return allOffers;
  }

  /**
   * Sorts offers with highest confidence / verified exact matches first.
   * @param {Array<Object>} offers
   */
  sortOffers(offers) {
    offers.sort((a, b) => {
      const priority = (offer) => {
        if (offer.match_type === AMAZON_MATCH_TYPES.MANUAL_ASIN || offer.confidence === 'HIGH') return 1;
        if (offer.match_type === AMAZON_MATCH_TYPES.SEARCH_LINK) return 2;
        return 3;
      };
      return priority(a) - priority(b);
    });
  }

  /**
   * Static helper for single-call resolution.
   */
  static resolveOffers(params = {}) {
    return defaultResolverInstance.resolveOffers(params);
  }

  /**
   * Static helper for single-call async resolution.
   */
  static async resolveOffersAsync(params = {}) {
    return defaultResolverInstance.resolveOffersAsync(params);
  }
}

export const defaultResolverInstance = new AffiliateOfferResolver();
