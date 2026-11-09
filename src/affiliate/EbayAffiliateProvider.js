/**
 * src/affiliate/EbayAffiliateProvider.js
 *
 * Phase 71 Preparation — Official eBay Partner Network (EPN) Affiliate Provider
 *
 * Implements the AffiliateProvider interface for eBay:
 * - Specializes in aftermarket inventory (e.g. Sägenspezi shop on eBay).
 * - Queries and validates items via EbayBrowseApiClient.
 * - Decoupled from core STIHL machine / serial identity.
 * - Fails closed if environment or API configuration is inactive.
 */

import { AffiliateProvider } from './AffiliateProvider.js';
import { EbayBrowseApiClient } from './EbayBrowseApiClient.js';
import { PartNormalizer } from '../parts/PartNormalizer.js';

export class EbayAffiliateProvider extends AffiliateProvider {
  /**
   * @param {Object} [options]
   * @param {EbayBrowseApiClient} [options.apiClient]
   * @param {Map<string, Object>} [options.cachedOffers] - Pre-synced verified catalog offers
   */
  constructor(options = {}) {
    super('ebay');
    this.apiClient = options.apiClient || new EbayBrowseApiClient();
    this.cachedOffers = options.cachedOffers || new Map();
  }

  /**
   * Checks whether eBay affiliate integration is enabled.
   * Fails closed by default unless EBAY_AFFILIATE_ENABLED is explicitly 'true'.
   * @returns {boolean}
   */
  isEnabled() {
    return process.env.EBAY_AFFILIATE_ENABLED === 'true';
  }

  /**
   * Sets pre-synced verified offers for synchronous page rendering.
   * @param {Map<string, Object>} map
   */
  setCachedOffers(map) {
    if (map instanceof Map) {
      this.cachedOffers = map;
    }
  }

  /**
   * Synchronous commercial offer resolution adhering to AffiliateProvider contract.
   * Resolves from verified cached inventory.
   *
   * @param {Object} params
   * @param {string} params.partNumber
   * @param {string} [params.canonicalPartNumber]
   * @returns {Array<Object>}
   */
  getOffers(params = {}) {
    if (!this.isEnabled()) {
      return [];
    }

    const normPart = PartNormalizer.normalizePartNumber(params.canonicalPartNumber || params.partNumber);
    if (!normPart) {
      return [];
    }

    const cached = this.cachedOffers.get(normPart);
    if (!cached || !cached.ships_to_nl) {
      return [];
    }

    return [
      {
        provider: 'ebay',
        marketplace: 'ebay.de',
        seller_name: cached.seller_name || 'Sägenspezi (eBay)',
        brand: cached.brand || 'Sägenspezi',
        item_id: cached.item_id,
        part_number: normPart,
        item_price: cached.item_price,
        shipping_cost_nl: cached.shipping_cost_nl,
        currency: cached.currency || 'EUR',
        ships_to_nl: true,
        shipping_status: 'SHIPS_TO_NL_CONFIRMED',
        url: cached.affiliate_url || cached.item_url,
        link_type: 'DIRECT_EBAY_ITEM',
        product_verified: true,
        placement: 'verified_product_card_ebay'
      }
    ];
  }

  /**
   * Asynchronous live search against eBay Browse API.
   * Used by daily sync batch jobs and inventory auditors.
   *
   * @param {Object} params
   * @param {string} params.partNumber
   * @returns {Promise<Array<Object>>}
   */
  async searchLiveOffers(params = {}) {
    const normPart = PartNormalizer.normalizePartNumber(params.partNumber);
    if (!normPart) return [];

    const res = await this.apiClient.searchItems({ partNumber: normPart });
    if (!res.success || !Array.isArray(res.items)) {
      return [];
    }

    return res.items.filter(i => i.ships_to_nl);
  }
}
