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
    this.tokenEndpoint = 'https://api.ebay.com/identity/v1/oauth2/token';
    this.browseApiEndpoint = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    this.cachedAccessToken = this.mockToken;
    this.tokenExpiry = this.mockToken ? Infinity : 0;
    this.lastQueryAt = 0;
    this.partCache = new Map();
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
    for (const query of queries) {
      try {
        const wait = 1000 - (Date.now() - this.lastQueryAt);
        if (this.lastQueryAt && wait > 0) await this.sleepFn(wait);
        const url = new URL(this.browseApiEndpoint);
        url.searchParams.set('q', query);
        // Phase 76E: per-call seller — 'ALL'/null searches every suitable seller
        const sellerFilter = seller && seller !== 'ALL' ? `,sellers:{${seller}}` : '';
        url.searchParams.set('filter', `deliveryCountry:NL${sellerFilter}`);
        url.searchParams.set('limit', String(Math.max(1, Math.min(10, Number(searchParams.limit) || 10))));
        this.lastQueryAt = Date.now();
        const response = await this.fetchFn(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
            'X-EBAY-C-ENDUSERCTX': `affiliateCampaignId=${this.epnCampaignId}`
          }
        });
        if (!response.ok) return fail(`eBay Browse API returned HTTP ${response.status}`);
        const body = await response.json();
        for (const item of this.parseItemSummaries(body.itemSummaries, compact, searchParams.verifiedSubstitutes)) {
          if (!items.has(item.item_id)) items.set(item.item_id, item);
        }
      } catch {
        return fail('eBay Browse API request failed.');
      }
    }
    const result = { success: true, items: [...items.values()], total: items.size, errors: [] };
    this.partCache.set(key, result);
    return result;
  }

   parseItemSummaries(itemSummaries, targetPartNumber = '', verifiedSubstitutes = []) {
    const results = [];
    const seen = new Set();
    const codes = [targetPartNumber, ...(Array.isArray(verifiedSubstitutes) ? verifiedSubstitutes.slice(0, 2) : [])].map(code => String(code).replace(/[\s-]/g, '')).filter(code => /^\d{11}$/.test(code));
    const targetCompact = targetPartNumber.replace(/[\s-]/g, '');
    for (const item of (Array.isArray(itemSummaries) ? itemSummaries : [])) {
      if (!item?.itemId || seen.has(item.itemId)) continue;
      const affiliateUrl = this.buildAffiliateUrl(item.itemAffiliateWebUrl);
      if (!affiliateUrl) continue;
      // Fail-closed: MPN must be exactly the target part number, OR title must contain ONLY part number as standalone (not bundle/set/kit)
      const title = String(item.title || '').toLowerCase();
      const mpn = String(item.mpn || '').toLowerCase();
      const compactMpn = mpn.replace(/[\s-]/g, '');
      const hasExactMpn = codes.some(code => code === compactMpn);
      const hasStandalonePartNumber = codes.some(code => {
        const formatted = code.slice(0, 4) + ' ' + code.slice(4, 7) + ' ' + code.slice(7);
        // Title must contain the part number
        if (!new RegExp(`(^|\\D)${formatted.replace(/\s/g, '[\\s-]*')}(\\D|$)`).test(title)) return false;
        // But reject if it's part of a kit/bundle
        if (/\bkit\b|\bset\b|\bbundle\b|\bpack\b|\bcombi\b/.test(title)) return false;
        return true;
      });
      if (!hasExactMpn && !hasStandalonePartNumber) continue;
      // Reject if title mentions conflicting type (carburetor in spark plug query)
      if (/vergaser|carburetor|carb/.test(title) && codes.some(c => c === targetCompact)) continue;
      if (item.estimatedAvailabilities?.some(a => a.estimatedAvailabilityStatus === 'OUT_OF_STOCK')) continue;
      const options = Array.isArray(item.shippingOptions) ? item.shippingOptions : [];
      const shipping = options.find(option => {
        const locations = option.shipToLocations;
        return (Array.isArray(locations) && locations.some(loc => loc === 'NL' || loc?.country === 'NL')) || locations?.country === 'NL' || option.shippingDestination?.country === 'NL';
      });
      // Explicit non-NL destinations fail closed; unknown destinations are kept but flagged unconfirmed
      const destinations = options.flatMap(option => {
        const locations = option.shipToLocations;
        if (Array.isArray(locations)) return locations.map(loc => (typeof loc === 'string' ? loc : loc?.country));
        if (locations?.country) return [locations.country];
        return option.shippingDestination?.country ? [option.shippingDestination.country] : [];
      }).filter(Boolean);
      if (destinations.length > 0 && destinations.every(country => country !== 'NL')) continue;
      const amount = value => value != null && /^\d+(?:\.\d+)?$/.test(String(value)) ? Number(value) : null;
      seen.add(item.itemId);
      results.push({
        item_id: item.itemId,
        title: item.title ?? '',
        mpn: item.mpn ?? '',
        seller_name: item.seller?.username ?? '',
        item_price: amount(item.price?.value),
        currency: item.price?.currency ?? null,
        shipping_cost_nl: shipping ? amount(shipping.shippingCost?.value) : null,
        ships_to_nl: Boolean(shipping),
        item_url: affiliateUrl,
        affiliate_url: affiliateUrl,
        image_url: item.image?.imageUrl ?? null,
        condition: item.condition ?? null
      });
    }
    return results;
  }
}
