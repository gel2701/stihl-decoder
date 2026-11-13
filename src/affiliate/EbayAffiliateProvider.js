/**
 * src/affiliate/EbayAffiliateProvider.js
 *
 * Phase 80 — Public eBay provider.
 *
 * Reads canonical, already-adjudicated offers (decision ACCEPT / status ACTIVE,
 * product identity via OfferEvidenceMatcher, NL shipping via EbayShippingEvidence).
 * It never re-runs a weaker match against stored ACTIVE evidence: a record that
 * passed the full pipeline is publishable as-is.
 *
 * Legacy cached records without a stored decision keep the historical strict
 * checks (exact part number in title + NL shipping + campaign-bound URL).
 */

import { AffiliateProvider } from './AffiliateProvider.js';
import { EbayBrowseApiClient } from './EbayBrowseApiClient.js';
import { PartNormalizer } from '../parts/PartNormalizer.js';
import { MATCH_TYPES } from './OfferEvidenceMatcher.js';
import { SHIPPING_STATUS } from './EbayShippingEvidence.js';
import { loadEbayCachedOffers } from './EbayOfferStore.js';
import { getEbayOfferStorePath } from './AffiliateStoragePaths.js';

const partInTitle = (title, part) => new RegExp(`(^|\\D)${part.slice(0, 4)}[\\s-]*${part.slice(4, 7)}[\\s-]*${part.slice(7)}(?!\\d)`).test(title);

const PUBLISHABLE_MATCH_TYPES = new Set([
  MATCH_TYPES.EXACT_MPN,
  MATCH_TYPES.EXACT_PART_NUMBER_WITH_CORROBORATION,
  MATCH_TYPES.VERIFIED_REPLACEMENT
]);

export class EbayAffiliateProvider extends AffiliateProvider {
  constructor(options = {}) {
    super('ebay');
    this.apiClient = options.apiClient || new EbayBrowseApiClient();
    this.cachedOffers = options.cachedOffers || new Map();
  }

  isEnabled() {
    return process.env.EBAY_ENABLED === 'true' &&
      process.env.EBAY_AFFILIATE_ENABLED !== 'false' &&
      process.env.EBAY_EPN_CAMPAIGN_ID === '5339245312' &&
      Boolean(process.env.EBAY_CLIENT_ID?.trim() && process.env.EBAY_CLIENT_SECRET?.trim());
  }

  setCachedOffers(map) {
    if (map instanceof Map) this.cachedOffers = map;
  }

  /**
   * Loads the canonical offer store written by the activation pipeline.
   * @param {string} [filePath]
   * @returns {Map<string, Array<Object>>}
   */
  loadFromStore(filePath = getEbayOfferStorePath()) {
    const map = loadEbayCachedOffers(filePath);
    this.cachedOffers = map;
    return map;
  }

  getOffers(params = {}) {
    if (!this.isEnabled()) return [];
    const part = PartNormalizer.normalizePartNumber(params.canonicalPartNumber || params.partNumber);
    if (!part) return [];
    const entries = this.cachedOffers.get(part);
    const seen = new Set();
    const offers = [];
    for (const item of (Array.isArray(entries) ? entries : [entries])) {
      if (!item || typeof item.item_id !== 'string' || !item.item_id) continue;
      if (typeof item.title !== 'string' || !item.title) continue;
      const marketplaceId = String(item.marketplaceId || item.marketplace_id || item.marketplace || '').toUpperCase();
      if (!['EBAY_NL', 'EBAY_DE'].includes(marketplaceId)) continue;

      // Shipping: stored confirmation, never inferred here.
      const shippingStatus = item.shipping_status || (item.ships_to_nl === true ? SHIPPING_STATUS.CONFIRMED : null);
      if (shippingStatus !== SHIPPING_STATUS.CONFIRMED) continue;

      // A stored REVIEW / NEEDS_EVIDENCE record must never be published.
      if (item.decision && item.decision !== 'ACCEPT') continue;
      if (item.status && item.status !== 'ACTIVE') continue;
      if (item.match_type && !PUBLISHABLE_MATCH_TYPES.has(item.match_type)) continue;

      // Canonical records carry the affiliate URL in both fields; a record with
      // a missing, unsafe or mis-campaigned itemAffiliateWebUrl fails closed.
      const url = this.apiClient.buildAffiliateUrl(item.itemAffiliateWebUrl);
      if (!url || (item.affiliate_url && item.affiliate_url !== url)) continue;

      const itemPart = PartNormalizer.normalizePartNumber(item.part_number);
      const replacements = Array.isArray(item.verified_replacements) ? item.verified_replacements : [];
      const replacementMatch = replacements.some(replacement => replacement?.verified === true
        && PartNormalizer.normalizePartNumber(replacement.part_number) === part
        && itemPart === PartNormalizer.normalizePartNumber(replacement.replacement_part_number));
      if (itemPart !== part && !replacementMatch) continue;

      const adjudicated = Boolean(item.decision || item.match_type);
      if (!adjudicated) {
        // Legacy record: repeat the historical title/name checks.
        if (!itemPart || !partInTitle(item.title, itemPart)) continue;
        const nameTokens = String(params.partName || '').toLowerCase().match(/[a-z]{4,}/g) || [];
        if (nameTokens.length && !nameTokens.some(token => item.title.toLowerCase().includes(token))) continue;
      }

      const key = `${marketplaceId}:${item.item_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const displayMarketplace = marketplaceId === 'EBAY_NL' ? 'ebay.nl' : 'ebay.de';
      offers.push({
        provider: 'ebay',
        marketplace: displayMarketplace,
        marketplace_id: marketplaceId,
        seller_name: item.seller_name || '',
        brand: /^(?:stihl|oem)$/i.test(item.brand || '') ? '' : (item.brand || ''),
        item_id: item.item_id,
        part_number: part,
        title: item.title,
        mpn: item.mpn || '',
        gtin: item.gtin || null,
        item_price: item.item_price ?? item.price ?? null,
        price: item.item_price ?? item.price ?? null,
        shipping_cost_nl: item.shipping_cost_nl ?? null,
        currency: item.currency || 'EUR',
        ships_to_nl: true,
        shipping_status: SHIPPING_STATUS.CONFIRMED,
        shipping_evidence: item.shipping_evidence || null,
        url,
        item_url: url,
        affiliate_url: url,
        link_type: 'DIRECT_EBAY_ITEM',
        tier: 'DIRECT_VERIFIED',
        match_type: item.match_type || null,
        match_basis: item.match_basis || null,
        decision: 'ACCEPT',
        offer_status: 'ACTIVE',
        product_verified: true,
        is_verified: true,
        confidence: 'HIGH',
        checked_at: item.checked_at || item.updated_at || null,
        label: `Bekijk op ${displayMarketplace}`,
        badge_label: 'Geverifieerd eBay-aanbod',
        cta_aria_label: `Bekijk geverifieerd eBay-aanbod voor STIHL onderdeel ${PartNormalizer.formatPartNumber(part)}`,
        description: 'Directe link naar de eBay-aanbieding. Verzending naar Nederland is bevestigd; controleer onderdeelnummer en machine-uitvoering vóór aankoop.',
        rel: 'sponsored nofollow noopener',
        target: '_blank',
        placement: 'verified_product_card_ebay'
      });
    }
    return offers;
  }

  async searchLiveOffers(params = {}) {
    if (!this.isEnabled()) return [];
    const part = PartNormalizer.normalizePartNumber(params.partNumber);
    if (!part) return [];
    const result = await this.apiClient.searchItems({ partNumber: part });
    return result.success && Array.isArray(result.items) ? result.items.filter(item => item.ships_to_nl === true) : [];
  }
}
