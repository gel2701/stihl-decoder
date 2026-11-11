import { AffiliateProvider } from './AffiliateProvider.js';
import { EbayBrowseApiClient } from './EbayBrowseApiClient.js';
import { PartNormalizer } from '../parts/PartNormalizer.js';

const partInTitle = (title, part) => new RegExp(`(^|\\D)${part.slice(0, 4)}[\\s-]*${part.slice(4, 7)}[\\s-]*${part.slice(7)}(?!\\d)`).test(title);

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

  getOffers(params = {}) {
    if (!this.isEnabled()) return [];
    const part = PartNormalizer.normalizePartNumber(params.canonicalPartNumber || params.partNumber);
    if (!part) return [];
    const entries = this.cachedOffers.get(part);
    const seen = new Set();
    const offers = [];
    for (const item of (Array.isArray(entries) ? entries : [entries])) {
      if (!item || item.ships_to_nl !== true || typeof item.item_id !== 'string' || !item.item_id || typeof item.title !== 'string') continue;
      const marketplace = item.marketplaceId || item.marketplace_id || item.marketplace;
      if (!['EBAY_NL', 'EBAY_DE'].includes(marketplace)) continue;
      const url = this.apiClient.buildAffiliateUrl(item.itemAffiliateWebUrl);
      if (!url || (item.affiliate_url && item.affiliate_url !== url)) continue;
      const itemPart = PartNormalizer.normalizePartNumber(item.part_number);
      const replacements = Array.isArray(item.verified_replacements) ? item.verified_replacements : [];
      if (itemPart !== part && !replacements.some(replacement => replacement?.verified === true && PartNormalizer.normalizePartNumber(replacement.part_number) === part && itemPart === PartNormalizer.normalizePartNumber(replacement.replacement_part_number))) continue;
      if (!itemPart || !partInTitle(item.title, itemPart)) continue;
      const nameTokens = String(params.partName || '').toLowerCase().match(/[a-z]{4,}/g) || [];
      if (nameTokens.length && !nameTokens.some(token => item.title.toLowerCase().includes(token))) continue;
      const key = `${marketplace}:${item.item_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offers.push({
        provider: 'ebay',
        marketplace: marketplace === 'EBAY_NL' ? 'ebay.nl' : 'ebay.de',
        seller_name: item.seller_name || '',
        brand: /^(?:stihl|oem)$/i.test(item.brand || '') ? '' : (item.brand || ''),
        item_id: item.item_id,
        part_number: part,
        item_price: item.item_price,
        shipping_cost_nl: item.shipping_cost_nl,
        currency: item.currency || 'EUR',
        ships_to_nl: true,
        shipping_status: 'SHIPS_TO_NL_CONFIRMED',
        url,
        link_type: 'DIRECT_EBAY_ITEM',
        product_verified: true,
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
