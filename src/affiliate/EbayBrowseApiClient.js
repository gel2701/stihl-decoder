/**
 * src/affiliate/EbayBrowseApiClient.js
 *
 * Phase 80 — eBay Browse API client with canonical evidence pass-through.
 *
 * Responsibilities (single layer, no duplicated decisions):
 *  - OAuth + rate-limited Browse searches per marketplace.
 *  - `filter=deliveryCountry:NL` on every search, with the successful filter
 *    result recorded as explicit shipping evidence (see EbayShippingEvidence).
 *  - getItem enrichment for candidates that still need product identity or
 *    shipping evidence, cached per item so the same listing is never verified
 *    twice.
 *  - Fail-closed transport: affiliate URL, campaign id, out-of-stock and
 *    explicit non-NL destinations.
 *
 * Product matching itself is delegated to OfferEvidenceMatcher so client,
 * engine, provider and store all apply exactly the same taxonomy.
 */

import { classifyOffer, MATCH_TYPES, isBundleTitle } from './OfferEvidenceMatcher.js';
import {
  BROWSE_DELIVERY_FILTER,
  buildBrowseDeliveryEvidence,
  collectShippingDestinations,
  evaluateShippingEvidence,
  SHIPPING_STATUS
} from './EbayShippingEvidence.js';

export class EbayBrowseApiClient {
  constructor(options = {}) {
    this.clientId = options.clientId ?? process.env.EBAY_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? process.env.EBAY_CLIENT_SECRET;
    this.epnCampaignId = options.epnCampaignId ?? process.env.EBAY_EPN_CAMPAIGN_ID;
    this.marketplaceId = options.marketplaceId ?? process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_DE';
    this.defaultSeller = options.defaultSeller ?? 'saegenspezi_de';
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.mockToken = options.mockToken ?? null;
    this.sleepFn = options.sleepFn ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.deliveryCountry = options.deliveryCountry ?? 'NL';
    this.contextualZip = options.contextualZip ?? process.env.EBAY_CONTEXTUAL_ZIP ?? null;
    this.tokenEndpoint = 'https://api.ebay.com/identity/v1/oauth2/token';
    this.browseApiEndpoint = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    this.itemDetailEndpoint = 'https://api.ebay.com/buy/browse/v1/item';
    this.cachedAccessToken = this.mockToken;
    this.tokenExpiry = this.mockToken ? Infinity : 0;
    this.lastQueryAt = 0;
    this.partCache = new Map();
    this.itemDetailCache = new Map();
    this.lastAuthError = null;
  }

  isConfigured() {
    return process.env.EBAY_ENABLED === 'true' && Boolean(this.fetchFn && (this.mockToken || (this.clientId && this.clientSecret)));
  }

  hasAffiliateConfig() {
    return /^\d+$/.test(String(this.epnCampaignId ?? ''));
  }

  preflight() {
    const missing = [];
    if (!this.mockToken && !this.clientId) missing.push('EBAY_CLIENT_ID');
    if (!this.mockToken && !this.clientSecret) missing.push('EBAY_CLIENT_SECRET');
    if (!this.hasAffiliateConfig()) missing.push('EBAY_EPN_CAMPAIGN_ID');
    if (!this.fetchFn) missing.push('fetch');
    return { enabled: process.env.EBAY_ENABLED === 'true', ready: this.isConfigured() && this.hasAffiliateConfig(), missing };
  }

  buildAffiliateUrl(itemAffiliateWebUrl) {
    if (!this.hasAffiliateConfig() || typeof itemAffiliateWebUrl !== 'string') return '';
    try {
      const url = new URL(itemAffiliateWebUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^(?:[a-z0-9-]+\.)*ebay\.(?:de|nl|com)$/i.test(url.hostname)) return '';
      const ids = [...url.searchParams.getAll('campid'), ...url.searchParams.getAll('affiliateCampaignId')];
      if (ids.length !== 1 || ids[0] !== String(this.epnCampaignId)) return '';
      return url.toString();
    } catch {
      return '';
    }
  }

  /**
   * Builds X-EBAY-C-ENDUSERCTX.
   *
   * Per the official Browse API documentation the contextualLocation value must
   * contain the delivery country and, when zip codes are used in that country,
   * the postal code. The Netherlands uses postal codes, so a configured
   * EBAY_CONTEXTUAL_ZIP makes shipping options (and therefore per-item shipping
   * proof) actually returnable. Without it eBay may omit the shippingOption
   * container entirely, which used to be indistinguishable from "does not ship".
   *
   * @returns {string}
   */
  buildEndUserContext() {
    const location = this.contextualZip
      ? `country%3D${this.deliveryCountry}%2Czip%3D${encodeURIComponent(String(this.contextualZip).replace(/\s+/g, '').toUpperCase())}`
      : `country%3D${this.deliveryCountry}`;
    return `affiliateCampaignId=${this.epnCampaignId},contextualLocation=${location}`;
  }

  async getAccessToken() {
    if (!this.isConfigured() || !this.hasAffiliateConfig()) return null;
    this.lastAuthError = null;
    if (this.cachedAccessToken && Date.now() < this.tokenExpiry - 60000) return this.cachedAccessToken;
    try {
      const response = await this.fetchFn(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }).toString()
      });
      if (!response.ok) {
        this.lastAuthError = `OAuth HTTP ${response.status}`;
        return null;
      }
      const data = await response.json();
      if (!data.access_token) {
        this.lastAuthError = 'OAuth response missing access_token';
        return null;
      }
      this.cachedAccessToken = data.access_token;
      this.tokenExpiry = Date.now() + (Number(data.expires_in) || 7200) * 1000;
      return this.cachedAccessToken;
    } catch {
      this.lastAuthError = 'OAuth request failed';
      return null;
    }
  }

  async searchItems(searchParams = {}) {
    const fail = error => ({ success: false, items: [], total: 0, errors: [error] });
    if (process.env.EBAY_ENABLED !== 'true') return fail('eBay disabled.');
    if (!this.isConfigured() || !this.hasAffiliateConfig()) return fail('eBay Browse API not configured.');
    // Phase 76D: per-call marketplace override (engine searches NL and DE with one client)
    const marketplaceId = ['EBAY_DE', 'EBAY_NL'].includes(searchParams.marketplace) ? searchParams.marketplace : this.marketplaceId;
    if (!['EBAY_DE', 'EBAY_NL'].includes(marketplaceId)) return fail('Unsupported eBay marketplace.');
    const part = String(searchParams.partNumber ?? '').trim();
    const compact = part.replace(/[\s-]/g, '');
    if (!/^\d{11}$/.test(compact)) return fail('Valid partNumber required.');
    const substitutes = Array.isArray(searchParams.verifiedSubstitutes) ? searchParams.verifiedSubstitutes : [];
    // Phase 76C: seller filter optional — null/''/'ALL' searches all suitable sellers
    const seller = Object.prototype.hasOwnProperty.call(searchParams, 'seller') ? searchParams.seller : this.defaultSeller;
    const key = `${marketplaceId}:${seller ?? 'ALL'}:${compact}:${substitutes.join(',')}`;
    if (this.partCache.has(key)) return this.partCache.get(key);
    const token = await this.getAccessToken();
    if (!token) return fail(this.lastAuthError || 'Unable to acquire OAuth token for eBay Browse API.');
    const formatted = `${compact.slice(0, 4)} ${compact.slice(4, 7)} ${compact.slice(7)}`;
    let queries = [formatted, compact, `STIHL ${compact}`];
    for (const substitute of (Array.isArray(searchParams.verifiedSubstitutes) ? searchParams.verifiedSubstitutes : []).slice(0, 2)) {
      if (/^\d{11}$/.test(String(substitute))) queries.push(`STIHL ${substitute}`);
    }
    // Phase 76D: maxQueries bounds fan-out for large batches (default full ladder)
    queries = queries.slice(0, Math.max(1, Math.min(queries.length, Number(searchParams.maxQueries) || queries.length)));
    const items = new Map();
    // Phase 76G: funnel instrumentation — raw API results vs client-passed results
    const rawSummaries = [];
    const rawUnique = new Set();
    const sellerFilter = seller && seller !== 'ALL' ? `,sellers:{${seller}}` : '';
    const filter = `${BROWSE_DELIVERY_FILTER}${sellerFilter}`;
    const endUserContext = this.buildEndUserContext();
    const answeredQueries = [];
    for (const query of queries) {
      try {
        const wait = 1000 - (Date.now() - this.lastQueryAt);
        if (this.lastQueryAt && wait > 0) await this.sleepFn(wait);
        const url = new URL(this.browseApiEndpoint);
        url.searchParams.set('q', query);
        // Phase 80: deliveryCountry:NL restricts results to items that can be
        // delivered to NL; the successful response is recorded as evidence.
        url.searchParams.set('filter', filter);
        url.searchParams.set('limit', String(Math.max(1, Math.min(10, Number(searchParams.limit) || 10))));
        this.lastQueryAt = Date.now();
        const response = await this.fetchFn(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
            'X-EBAY-C-ENDUSERCTX': endUserContext
          }
        });
        if (!response.ok) return fail(`eBay Browse API returned HTTP ${response.status}`);
        const body = await response.json();
        answeredQueries.push(query);
        for (const raw of (Array.isArray(body.itemSummaries) ? body.itemSummaries : [])) {
          rawSummaries.push(raw);
          if (raw?.itemId) rawUnique.add(raw.itemId);
        }
      } catch {
        return fail('eBay Browse API request failed.');
      }
    }
    // Verified substitutes declared by the caller are the only alternative part
    // numbers a title match may reference without becoming a contradiction.
    const verifiedReplacements = [
      ...(Array.isArray(searchParams.verifiedReplacements) ? searchParams.verifiedReplacements : []),
      ...substitutes
        .filter(substitute => /^\d{11}$/.test(String(substitute)))
        .map(substitute => ({ part_number: compact, replacement_part_number: String(substitute), verified: true }))
    ];
    const deliveryEvidence = buildBrowseDeliveryEvidence({
      marketplaceId,
      filter,
      httpStatus: 200,
      applied: answeredQueries.length > 0,
      itemCount: rawUnique.size,
      queries: answeredQueries,
      endUserContext
    });
    const parse = this.parseItemSummariesDetailed(rawSummaries, compact, searchParams.verifiedSubstitutes, {
      marketplace: marketplaceId,
      deliveryEvidence,
      catalogModels: searchParams.catalogModels,
      verifiedReplacements
    });
    for (const item of parse.items) {
      if (!items.has(item.item_id)) items.set(item.item_id, item);
    }
    const stats = {
      raw_count: rawSummaries.length,
      raw_unique_count: rawUnique.size,
      client_passed_count: items.size,
      client_rejected_count: parse.rejected_count,
      client_rejection_reasons: parse.rejection_reasons,
      query_count: queries.length
    };
    const result = {
      success: true,
      items: [...items.values()],
      total: items.size,
      errors: [],
      stats,
      delivery_evidence: deliveryEvidence
    };
    this.partCache.set(key, result);
    return result;
  }

  /**
   * Fetches full item detail (getItem) and normalizes the fields that matter for
   * activation: MPN, GTIN, brand, product aspects, shipping, quantity, affiliate URL.
   *
   * @param {string} itemId
   * @param {Object} [options]
   * @param {string} [options.marketplace] EBAY_NL | EBAY_DE
   * @param {boolean} [options.fieldgroupsProduct] request the PRODUCT field group
   * @param {boolean} [options.force] bypass the in-memory cache
   * @returns {Promise<{ success: boolean, item: Object|null, cached: boolean, errors: string[] }>}
   */
  async getItem(itemId, options = {}) {
    const fail = error => ({ success: false, item: null, cached: false, errors: [error] });
    if (typeof itemId !== 'string' || !itemId) return fail('itemId required.');
    if (process.env.EBAY_ENABLED !== 'true') return fail('eBay disabled.');
    if (!this.isConfigured() || !this.hasAffiliateConfig()) return fail('eBay Browse API not configured.');
    const marketplaceId = ['EBAY_DE', 'EBAY_NL'].includes(options.marketplace) ? options.marketplace : this.marketplaceId;
    const cacheKey = `${marketplaceId}:${itemId}`;
    if (!options.force && this.itemDetailCache.has(cacheKey)) {
      return { success: true, item: this.itemDetailCache.get(cacheKey), cached: true, errors: [] };
    }
    const token = await this.getAccessToken();
    if (!token) return fail(this.lastAuthError || 'Unable to acquire OAuth token for eBay Browse API.');
    try {
      const url = new URL(`${this.itemDetailEndpoint}/${encodeURIComponent(itemId)}`);
      if (options.fieldgroupsProduct === true) url.searchParams.set('fieldgroups', 'PRODUCT');
      const response = await this.fetchFn(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
          'X-EBAY-C-ENDUSERCTX': this.buildEndUserContext()
        }
      });
      if (!response.ok) return fail(`eBay getItem returned HTTP ${response.status}`);
      const body = await response.json();
      if (!body || body.errors || !body.itemId) return fail('eBay getItem returned no item.');
      const detail = this.parseItemDetail(body, marketplaceId);
      if (!detail) return fail('eBay getItem response could not be parsed.');
      this.itemDetailCache.set(cacheKey, detail);
      return { success: true, item: detail, cached: false, errors: [] };
    } catch {
      return fail('eBay getItem request failed.');
    }
  }

  /**
   * Normalizes a getItem (or item summary) payload to the shared evidence shape.
   *
   * @param {Object} raw
   * @param {string} [marketplaceId]
   * @returns {Object|null}
   */
  parseItemDetail(raw, marketplaceId = null) {
    if (!raw || typeof raw !== 'object' || !raw.itemId) return null;
    const aspects = Array.isArray(raw.localizedAspects)
      ? raw.localizedAspects.map(a => ({ name: a?.name || a?.localizedName || '', value: a?.value || '' })).filter(a => a.name && a.value)
      : [];
    const shippingOptions = Array.isArray(raw.shippingOptions) ? raw.shippingOptions : [];
    const destinations = collectShippingDestinations(shippingOptions);
    return {
      item_id: raw.itemId,
      marketplace: marketplaceId,
      title: typeof raw.title === 'string' ? raw.title : '',
      mpn: typeof raw.mpn === 'string' ? raw.mpn : '',
      gtin: typeof raw.gtin === 'string' ? raw.gtin : null,
      brand: typeof raw.brand === 'string' ? raw.brand : '',
      manufacturer: typeof raw.manufacturer === 'string' ? raw.manufacturer : '',
      aspects,
      shipping_options: shippingOptions,
      shipping_destinations: destinations.destinations,
      shipping_cost_nl: destinations.costs.NL ?? null,
      affiliate_url: this.buildAffiliateUrl(raw.itemAffiliateWebUrl),
      item_url: typeof raw.itemWebUrl === 'string' ? raw.itemWebUrl : null,
      quantity: Number.isFinite(Number(raw.quantity)) ? Number(raw.quantity) : null,
      condition: raw.condition ?? null,
      seller_name: raw.seller?.username ?? '',
      price: raw.price?.value != null ? Number(raw.price.value) : null,
      currency: raw.price?.currency ?? null,
      availability: Array.isArray(raw.estimatedAvailabilities)
        ? raw.estimatedAvailabilities.map(a => a?.estimatedAvailabilityStatus).filter(Boolean)
        : [],
      fetched_at: new Date().toISOString()
    };
  }

  parseItemSummaries(itemSummaries, targetPartNumber = '', verifiedSubstitutes = [], options = {}) {
    return this.parseItemSummariesDetailed(itemSummaries, targetPartNumber, verifiedSubstitutes, options).items;
  }

  /**
   * Parses raw Browse item summaries.
   *
   * Phase 76G instrumentation (rejection reasons, funnel counts) is preserved.
   * Phase 80: product identity is decided by OfferEvidenceMatcher and shipping by
   * EbayShippingEvidence, so every layer applies the same rules.
   *
   * @returns {{items: Array<Object>, rejected_count: number, rejection_reasons: Object<string, number>}}
   */
  parseItemSummariesDetailed(itemSummaries, targetPartNumber = '', verifiedSubstitutes = [], options = {}) {
    const results = [];
    const seen = new Set();
    const rejection_reasons = {};
    let rejected_count = 0;
    const reject = reason => {
      rejected_count++;
      rejection_reasons[reason] = (rejection_reasons[reason] || 0) + 1;
    };
    const compact = String(targetPartNumber || '').replace(/[\s-]/g, '');
    if (!/^\d{11}$/.test(compact)) return { items: results, rejected_count, rejection_reasons };
    const deliveryEvidence = options.deliveryEvidence || null;
    const marketplace = options.marketplace || options.marketplaceId || null;
    for (const item of (Array.isArray(itemSummaries) ? itemSummaries : [])) {
      if (!item?.itemId) { reject('MISSING_REQUIRED_DATA'); continue; }
      if (seen.has(item.itemId)) { reject('DUPLICATE_ITEM'); continue; }
      const affiliateUrl = this.buildAffiliateUrl(item.itemAffiliateWebUrl);
      if (!affiliateUrl) {
        reject(typeof item.itemAffiliateWebUrl === 'string' && item.itemAffiliateWebUrl.includes('campid=') ? 'CAMPAIGN_ID_MISMATCH' : 'AFFILIATE_URL_INVALID');
        continue;
      }
      const title = String(item.title || '');
      const identity = classifyOffer({
        targetPart: compact,
        title,
        mpn: item.mpn,
        gtin: item.gtin,
        aspects: item.localizedAspects,
        brand: item.brand,
        manufacturer: item.manufacturer,
        catalogModels: options.catalogModels,
        verifiedReplacements: options.verifiedReplacements
      });
      if (identity.status === 'REJECTED') {
        reject(identity.reason_codes[0] || 'PART_NUMBER_MISMATCH');
        continue;
      }
      // Bundle/kit titles with a title-only match fail closed here; bundle titles
      // with an exact MPN reach the engine, which records BUNDLE_OR_KIT itself.
      if (identity.match_type === MATCH_TYPES.TITLE_ONLY_NEEDS_EVIDENCE && isBundleTitle(title)) {
        reject('BUNDLE_OR_KIT');
        continue;
      }
      if (item.estimatedAvailabilities?.some(a => a.estimatedAvailabilityStatus === 'OUT_OF_STOCK')) { reject('OUT_OF_STOCK'); continue; }
      const shipping = evaluateShippingEvidence({
        shippingOptions: item.shippingOptions,
        browseDeliveryEvidence: deliveryEvidence
      });
      if (shipping.status === SHIPPING_STATUS.DOES_NOT_SHIP) {
        reject('SHIPPING_NOT_CONFIRMED');
        continue;
      }
      seen.add(item.itemId);
      const logistics = collectShippingDestinations(item.shippingOptions);
      results.push({
        item_id: item.itemId,
        title,
        mpn: item.mpn ?? '',
        brand: item.brand ?? '',
        manufacturer: item.manufacturer ?? '',
        gtin: item.gtin ?? null,
        aspects: Array.isArray(item.localizedAspects) ? item.localizedAspects : [],
        seller_name: item.seller?.username ?? '',
        item_price: this.parseAmount(item.price?.value),
        currency: item.price?.currency ?? null,
        shipping_cost_nl: shipping.shipping_cost_nl,
        ships_to_nl: shipping.confirmed_to_nl,
        shipping_status: shipping.status,
        shipping_known: logistics.destinations.length > 0,
        shipping_destinations: logistics.destinations,
        shipping_evidence: { browse_delivery: deliveryEvidence },
        evidence: { shipping: shipping.evidence },
        item_url: affiliateUrl,
        affiliate_url: affiliateUrl,
        itemAffiliateWebUrl: affiliateUrl,
        image_url: item.image?.imageUrl ?? null,
        condition: item.condition ?? null,
        quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
        marketplace,
        marketplaceId: marketplace,
        match_type: identity.match_type,
        match_basis: identity.match_basis,
        corroboration: identity.corroboration,
        verified_replacements: (Array.isArray(options.verifiedReplacements) ? options.verifiedReplacements : [])
          .filter(replacement => identity.match_type !== MATCH_TYPES.VERIFIED_REPLACEMENT
            || (identity.corroboration || []).some(c => c.matched?.includes(replacement.replacement_part_number)))
      });
    }
    return { items: results, rejected_count, rejection_reasons };
  }

  /**
   * @private
   * @param {*} value
   * @returns {number|null}
   */
  parseAmount(value) {
    return value != null && /^\d+(?:\.\d+)?$/.test(String(value)) ? Number(value) : null;
  }
}
