/**
 * src/affiliate/EbayBrowseApiClient.js
 *
 * Phase 70D / 71A — Official eBay Browse API Client Adapter
 *
 * Implements integration with eBay REST API (Browse API v1) for
 * retrieving live product offers, pricing, availability, and confirmed NL shipping eligibility.
 *
 * Requirements & Constraints:
 * - Real EPN Campaign ID: 5339244329 (default configured).
 * - Marketplace-correct EPN parameters (ebay.nl: siteid=146, mkrid=1346-53482-19255-0; ebay.de: siteid=77, mkrid=707-53477-19255-0).
 * - Allowed domains: only official eBay domains (ebay.nl, ebay.de, ebay.com, ebay.co.uk).
 * - Fails closed if credentials (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET) are missing.
 * - Does NOT place Client Secrets or invented API keys in repo.
 * - Conclusive NL shipping validation with contextualLocation=country=NL and exclusion checks.
 * - Never treats a raw empty or present shippingOptions array as proof on its own.
 */

export const DEFAULT_EPN_CAMPAIGN_ID = '5339244329';

export const ALLOWED_EBAY_DOMAINS = [
  'ebay.nl',
  'www.ebay.nl',
  'ebay.de',
  'www.ebay.de',
  'ebay.com',
  'www.ebay.com',
  'ebay.co.uk',
  'www.ebay.co.uk',
  'rover.ebay.com'
];

export const EPN_MARKETPLACE_CONFIG = {
  'ebay.nl': {
    siteid: '146',
    mkrid: '1346-53482-19255-0'
  },
  'ebay.de': {
    siteid: '77',
    mkrid: '707-53477-19255-0'
  },
  'ebay.com': {
    siteid: '0',
    mkrid: '711-53200-19255-0'
  },
  'ebay.co.uk': {
    siteid: '3',
    mkrid: '710-53481-19255-0'
  }
};

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
    this.epnCampaignId = options.epnCampaignId || process.env.EBAY_EPN_CAMPAIGN_ID || DEFAULT_EPN_CAMPAIGN_ID;
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
   * @returns {boolean}
   */
  hasAffiliateConfig() {
    return Boolean(this.epnCampaignId);
  }

  /**
   * Validates if a URL points to an authorized eBay domain.
   * @param {string} urlString
   * @returns {boolean}
   */
  isAllowedEbayUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') return false;
    try {
      const parsed = new URL(urlString);
      const host = parsed.hostname.toLowerCase();
      return ALLOWED_EBAY_DOMAINS.includes(host) ||
        ALLOWED_EBAY_DOMAINS.some(d => host.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  /**
   * Generates a compliant eBay Partner Network (EPN) affiliate URL.
   *
   * Formats correctly for eBay.nl and eBay.de with specific siteid and mkrid.
   *
   * @param {string} itemWebUrl - Canonical eBay product URL
   * @param {string} [customId] - Tracking reference (e.g. STIHL canonical part number)
   * @returns {string} EPN-tagged URL or original itemWebUrl
   */
  buildAffiliateUrl(itemWebUrl, customId = '') {
    if (!itemWebUrl || !this.isAllowedEbayUrl(itemWebUrl)) {
      return '';
    }
    if (!this.hasAffiliateConfig()) {
      return itemWebUrl;
    }

    try {
      const parsed = new URL(itemWebUrl);
      const host = parsed.hostname.toLowerCase();

      // Determine marketplace config
      let cfg = EPN_MARKETPLACE_CONFIG['ebay.de']; // default
      if (host.includes('ebay.nl')) {
        cfg = EPN_MARKETPLACE_CONFIG['ebay.nl'];
      } else if (host.includes('ebay.co.uk')) {
        cfg = EPN_MARKETPLACE_CONFIG['ebay.co.uk'];
      } else if (host.includes('ebay.com')) {
        cfg = EPN_MARKETPLACE_CONFIG['ebay.com'];
      }

      parsed.searchParams.set('campid', this.epnCampaignId);
      parsed.searchParams.set('mkcid', '1');
      parsed.searchParams.set('mkrid', cfg.mkrid);
      parsed.searchParams.set('siteid', cfg.siteid);
      parsed.searchParams.set('toolid', '10001');
      parsed.searchParams.set('mkevt', '1');
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
   * Searches items by query or part number, scoped to a specific seller (defaults to saegenspezi_de),
   * applying the Dutch delivery context (contextualLocation=country=NL).
   *
   * @param {Object} searchParams
   * @param {string} searchParams.partNumber - Canonical 11-digit STIHL part number
   * @param {string} [searchParams.query] - Title/keyword query
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
          'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=NL',
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
   * Performs conclusive shipping to NL verification:
   * - Inspects excludedShipToLocations for NL/Europe exclusions.
   * - Validates explicit shipping cost, destination locations, and service options.
   * - Emits SHIPS_TO_NL_CONFIRMED only upon conclusive proof.
   * - Emits DOES_NOT_SHIP_TO_NL if explicitly excluded.
   * - Emits SHIPPING_UNKNOWN if ambiguous or unverified.
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

      // Check shipping exclusions
      const excludedLocations = Array.isArray(item.excludedShipToLocations)
        ? item.excludedShipToLocations.map(l => (typeof l === 'string' ? l : l.location || l.region || '').toUpperCase())
        : [];

      const isNlExcluded = excludedLocations.some(loc =>
        loc === 'NL' || loc === 'NLD' || loc === 'NETHERLANDS' || loc === 'THE NETHERLANDS'
      );

      let shippingStatus = 'SHIPPING_UNKNOWN';
      let shippingCostNl = null;
      let shipsToNl = false;

      if (isNlExcluded) {
        shippingStatus = 'DOES_NOT_SHIP_TO_NL';
        shipsToNl = false;
      } else {
        // Conclusive Shipping Verification:
        // Must have at least one explicit shipping option that verifies delivery to NL
        const shippingOptions = Array.isArray(item.shippingOptions) ? item.shippingOptions : [];

        for (const opt of shippingOptions) {
          if (!opt) continue;

          // Check shipToLocations in option if present
          const locations = Array.isArray(opt.shipToLocations)
            ? opt.shipToLocations.map(l => (typeof l === 'string' ? l : l.location || '').toUpperCase())
            : [];

          const explicitlyListsNl = locations.length > 0 && locations.some(l =>
            l === 'NL' || l === 'NLD' || l === 'NETHERLANDS' || l === 'EUROPE' || l === 'WORLDWIDE'
          );

          // Check cost
          let parsedCost = null;
          if (opt.shippingCost && typeof opt.shippingCost.value === 'string') {
            const val = parseFloat(opt.shippingCost.value);
            if (!isNaN(val) && val >= 0) {
              parsedCost = val;
            }
          }

          // Conclusive condition:
          // Either the option explicitly lists NL in shipToLocations with valid cost,
          // OR contextual delivery to NL returned a concrete shipping cost with delivery estimates
          if (parsedCost != null && (explicitlyListsNl || opt.shippingCarrierCode || opt.shippingServiceCode)) {
            shippingStatus = 'SHIPS_TO_NL_CONFIRMED';
            shippingCostNl = parsedCost;
            shipsToNl = true;
            break;
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
        shipping_status: shippingStatus,
        ships_to_nl: shipsToNl,
        item_url: item.itemWebUrl,
        affiliate_url: affiliateUrl,
        image_url: item.image?.imageUrl || null,
        condition: item.condition || 'NEW',
        item_specifics: item.itemSpecifics || null
      });
    }

    return results;
  }
}
