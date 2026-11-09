/**
 * src/affiliate/EbayBrowseApiClient.js
 *
 * Phase 71 Preparation — Official eBay Browse API Client Adapter
 *
 * Implements integration with eBay REST API (Browse API v1) for
 * retrieving live product offers, pricing, availability, and NL shipping eligibility.
 *
 * Requirements & Constraints:
 * - Fails closed if credentials (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET) are missing.
 * - Does NOT use fabricated EPN Campaign IDs in production.
 * - Adheres strictly to eBay Developer Terms & EPN Policies.
 * - Supports injectable mock transport for offline and deterministic CI tests.
 */

export class EbayBrowseApiClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.clientId]
   * @param {string} [options.clientSecret]
   * @param {string} [options.epnCampaignId]
   * @param {string} [options.marketplaceId] - Default 'EBAY_DE' or 'EBAY_NL'
   * @param {string} [options.defaultSeller] - Default 'saegenspezi_de'
   * @param {Function} [options.fetchFn] - Custom fetch function for tests/mocks
   * @param {string} [options.mockToken] - Static mock access token for unit tests
   */
  constructor(options = {}) {
    this.clientId = options.clientId || process.env.EBAY_CLIENT_ID || null;
    this.clientSecret = options.clientSecret || process.env.EBAY_CLIENT_SECRET || null;
    this.epnCampaignId = options.epnCampaignId || process.env.EBAY_EPN_CAMPAIGN_ID || null;
    this.marketplaceId = options.marketplaceId || process.env.EBAY_MARKETPLACE_ID || 'EBAY_DE';
    this.defaultSeller = options.defaultSeller || 'saegenspezi_de';
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    this.mockToken = options.mockToken || null;

    this.tokenEndpoint = 'https://api.ebay.com/identity/v1/oauth2/token';
    this.browseApiEndpoint = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
    this.cachedAccessToken = this.mockToken;
    this.tokenExpiry = this.mockToken ? Date.now() + 86400000 : 0;
  }

  /**
   * Checks whether the required client credentials are configured.
   * Fails closed if missing.
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.mockToken || (this.clientId && this.clientSecret));
  }

  /**
   * Checks whether EPN affiliate campaign ID is configured.
   * Fails closed if missing.
   * @returns {boolean}
   */
  hasAffiliateConfig() {
    return Boolean(this.epnCampaignId);
  }

  /**
   * Generates a compliant eBay Partner Network (EPN) affiliate URL.
   *
   * Format adheres to eBay Partner Network Rover / Smart Link specifications:
   * https://www.ebay.com/itm/{itemId}?mkcid=1&mkrid=...&campid={epnCampaignId}&toolid=10001&customid={customId}
   *
   * @param {string} itemWebUrl - Canonical eBay product URL
   * @param {string} [customId] - Tracking reference (e.g. STIHL canonical part number)
   * @returns {string} EPN-tagged URL or original itemWebUrl if no campaign ID configured
   */
  buildAffiliateUrl(itemWebUrl, customId = '') {
    if (!itemWebUrl) return '';
    if (!this.hasAffiliateConfig()) {
      return itemWebUrl; // Clean URL fallback if affiliate campaign not yet active
    }

    try {
      const parsed = new URL(itemWebUrl);
      parsed.searchParams.set('mkcid', '1');
      parsed.searchParams.set('campid', this.epnCampaignId);
      parsed.searchParams.set('toolid', '10001');
      if (customId) {
        parsed.searchParams.set('customid', customId);
      }
      return parsed.toString();
    } catch {
      return itemWebUrl;
    }
  }

  /**
   * Obtains an OAuth 2.0 Application access token using client_credentials grant.
   * @returns {Promise<string|null>}
   */
  async getAccessToken() {
    if (!this.isConfigured()) {
      return null;
    }

    const now = Date.now();
    if (this.cachedAccessToken && now < this.tokenExpiry - 60000) {
      return this.cachedAccessToken;
    }

    const authHeader = 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope'
    });

    try {
      const response = await this.fetchFn(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': authHeader
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error(`OAuth request failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.access_token) {
        throw new Error('OAuth response missing access_token');
      }

      this.cachedAccessToken = data.access_token;
      this.tokenExpiry = now + (data.expires_in ? data.expires_in * 1000 : 7200000);
      return this.cachedAccessToken;
    } catch (err) {
      console.warn(`[EbayBrowseApiClient] Error obtaining OAuth token: ${err.message}`);
      return null;
    }
  }

  /**
   * Searches items by STIHL canonical part number or query string,
   * scoped to a specific seller (e.g. saegenspezi_de) and filtered for delivery to the Netherlands.
   *
   * @param {Object} searchParams
   * @param {string} searchParams.partNumber - Canonical 11-digit STIHL part number
   * @param {string} [searchParams.query] - Optional title/keyword query
   * @param {string} [searchParams.seller] - Target seller username (defaults to saegenspezi_de)
   * @param {number} [searchParams.limit=10]
   * @returns {Promise<{ success: boolean, items: Array<Object>, total: number, errors: string[] }>}
   */
  async searchItems(searchParams = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        items: [],
        total: 0,
        errors: ['eBay Browse API credentials not configured (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing).']
      };
    }

    const token = await this.getAccessToken();
    if (!token) {
      return {
        success: false,
        items: [],
        total: 0,
        errors: ['Unable to acquire OAuth token for eBay Browse API.']
      };
    }

    const seller = searchParams.seller || this.defaultSeller;
    const query = searchParams.query || searchParams.partNumber;
    if (!query) {
      return { success: false, items: [], total: 0, errors: ['Query or partNumber required.'] };
    }

    const filterParts = [`deliveryCountry:NL`];
    if (seller) {
      filterParts.push(`sellers:{${seller}}`);
    }

    const url = new URL(this.browseApiEndpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('filter', filterParts.join(','));
    url.searchParams.set('limit', String(searchParams.limit || 10));

    try {
      const response = await this.fetchFn(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token || 'MOCK_TOKEN'}`,
          'X-EBAY-C-MARKETPLACE-ID': this.marketplaceId,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          items: [],
          total: 0,
          errors: [`eBay Browse API returned HTTP ${response.status}`]
        };
      }

      const body = await response.json();
      const rawSummaries = Array.isArray(body.itemSummaries) ? body.itemSummaries : [];
      const parsedItems = this.parseItemSummaries(rawSummaries, searchParams.partNumber);

      return {
        success: true,
        items: parsedItems,
        total: body.total != null ? body.total : parsedItems.length,
        errors: []
      };
    } catch (err) {
      return {
        success: false,
        items: [],
        total: 0,
        errors: [`Request failed: ${err.message}`]
      };
    }
  }

  /**
   * Parses raw eBay item summaries into standardized STIHLDecoder offer candidate objects.
   *
   * @param {Array<Object>} itemSummaries
   * @param {string} [targetPartNumber]
   * @returns {Array<Object>}
   */
  parseItemSummaries(itemSummaries, targetPartNumber = '') {
    const results = [];

    for (const item of itemSummaries) {
      if (!item || !item.itemId) continue;

      // Availability check: omit items that are explicitly OUT_OF_STOCK
      if (item.estimatedAvailabilities) {
        const outOfStock = item.estimatedAvailabilities.some(
          a => a.estimatedAvailabilityStatus === 'OUT_OF_STOCK'
        );
        if (outOfStock) continue;
      }

      // Shipping to NL check
      const shippingOption = Array.isArray(item.shippingOptions) ? item.shippingOptions[0] : null;
      let shippingCostNl = null;
      let shipsToNl = false;

      if (shippingOption) {
        shipsToNl = true;
        if (shippingOption.shippingCost) {
          const val = parseFloat(shippingOption.shippingCost.value);
          if (!isNaN(val)) {
            shippingCostNl = val;
          }
        }
      }

      // Price extraction
      let itemPrice = null;
      let currency = 'EUR';
      if (item.price) {
        const val = parseFloat(item.price.value);
        if (!isNaN(val)) {
          itemPrice = val;
          currency = item.price.currency || 'EUR';
        }
      }

      const affiliateUrl = this.buildAffiliateUrl(item.itemWebUrl, targetPartNumber);

      results.push({
        item_id: item.itemId,
        title: item.title || '',
        seller_name: item.seller?.username || this.defaultSeller,
        item_price: itemPrice,
        currency,
        shipping_cost_nl: shippingCostNl,
        ships_to_nl: shipsToNl,
        item_url: item.itemWebUrl,
        affiliate_url: affiliateUrl,
        image_url: item.image?.imageUrl || null,
        condition: item.condition || 'NEW'
      });
    }

    return results;
  }
}
