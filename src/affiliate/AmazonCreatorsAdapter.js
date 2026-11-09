/**
 * src/affiliate/AmazonCreatorsAdapter.js
 *
 * Phase 72: Amazon Creators API Integration & Readiness Adapter
 *
 * Provides a secure, discrete adapter for Amazon's Creators & Product APIs:
 * - Documents official eligibility prerequisites: at least 3 qualifying sales
 *   within 180 days and account approval by Amazon PartnerNet.
 * - Fails closed: if API keys or credentials are missing, cleanly disables API mode
 *   without crashing and relies on verified registry data.
 * - Provides mock transport for continuous testing without external network calls.
 * - Prevents public display of stale or static prices/stock.
 */

import { isValidAsin, ALLOWED_AMAZON_MARKETPLACES } from './AmazonAffiliateProvider.js';

export const CREATORS_API_MIN_QUALIFYING_SALES = 3;

export const ADAPTER_MODES = Object.freeze({
  PRODUCTION: 'PRODUCTION',
  MOCK: 'MOCK',
  DISABLED: 'DISABLED'
});

export const CREDENTIAL_STATUS = Object.freeze({
  READY: 'READY',
  MISSING: 'MISSING',
  INVALID: 'INVALID'
});

export class AmazonCreatorsAdapter {
  /**
   * @param {Object} [options]
   * @param {string} [options.mode]
   * @param {string} [options.apiKey]
   * @param {string} [options.apiSecret]
   * @param {string} [options.associateTag]
   * @param {string} [options.marketplace]
   * @param {Function} [options.customTransport]
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.AMAZON_CREATORS_API_KEY || null;
    this.apiSecret = options.apiSecret || process.env.AMAZON_CREATORS_API_SECRET || null;
    this.associateTag = options.associateTag || process.env.AMAZON_ASSOCIATE_TAG || 'srihldecoder2-21';
    this.defaultMarketplace = options.marketplace || 'amazon.nl';
    this.customTransport = options.customTransport || null;

    if (options.mode) {
      this.mode = options.mode;
    } else if (this.customTransport) {
      this.mode = ADAPTER_MODES.MOCK;
    } else if (this.apiKey && this.apiSecret) {
      this.mode = ADAPTER_MODES.PRODUCTION;
    } else {
      this.mode = ADAPTER_MODES.DISABLED;
    }
  }

  /**
   * Checks credential status.
   * @returns {'READY'|'MISSING'|'INVALID'}
   */
  getCredentialStatus() {
    if (this.mode === ADAPTER_MODES.MOCK) {
      return CREDENTIAL_STATUS.READY;
    }
    if (!this.apiKey || !this.apiSecret) {
      return CREDENTIAL_STATUS.MISSING;
    }
    if (this.apiKey.length < 8 || this.apiSecret.length < 16) {
      return CREDENTIAL_STATUS.INVALID;
    }
    return CREDENTIAL_STATUS.READY;
  }

  /**
   * Checks official eligibility for Amazon Creators API based on qualifying sales count.
   *
   * @param {Object} [metrics]
   * @param {number} [metrics.qualifyingSalesCount=0]
   * @param {boolean} [metrics.accountInGoodStanding=true]
   * @returns {{ eligible: boolean, salesCount: number, salesRequired: number, salesRemaining: number, reason: string }}
   */
  checkEligibility(metrics = {}) {
    const salesCount = typeof metrics.qualifyingSalesCount === 'number' ? metrics.qualifyingSalesCount : 0;
    const accountOk = metrics.accountInGoodStanding !== false;

    if (!accountOk) {
      return {
        eligible: false,
        salesCount,
        salesRequired: CREATORS_API_MIN_QUALIFYING_SALES,
        salesRemaining: Math.max(0, CREATORS_API_MIN_QUALIFYING_SALES - salesCount),
        reason: 'Amazon Associates account is not in good standing or has been suspended.'
      };
    }

    if (salesCount < CREATORS_API_MIN_QUALIFYING_SALES) {
      const remaining = CREATORS_API_MIN_QUALIFYING_SALES - salesCount;
      return {
        eligible: false,
        salesCount,
        salesRequired: CREATORS_API_MIN_QUALIFYING_SALES,
        salesRemaining: remaining,
        reason: `Requires at least ${CREATORS_API_MIN_QUALIFYING_SALES} qualifying sales within 180 days to qualify for Creators API review. Current sales: ${salesCount} (${remaining} remaining).`
      };
    }

    return {
      eligible: true,
      salesCount,
      salesRequired: CREATORS_API_MIN_QUALIFYING_SALES,
      salesRemaining: 0,
      reason: 'Account meets the minimum 3 qualifying sales threshold for Amazon Creators API review.'
    };
  }

  /**
   * Checks whether the adapter is ready to make live API calls.
   * @returns {boolean}
   */
  isApiReady() {
    return (this.mode === ADAPTER_MODES.PRODUCTION || this.mode === ADAPTER_MODES.MOCK) &&
      this.getCredentialStatus() === CREDENTIAL_STATUS.READY;
  }

  /**
   * Fetches product details for an ASIN.
   * Fails closed if credentials are missing or API mode is disabled.
   *
   * @param {string} asin
   * @param {Object} [options]
   * @param {string} [options.marketplace]
   * @returns {Promise<{ success: boolean, product?: Object, error?: string, source: string }>}
   */
  async fetchProductDetails(asin, options = {}) {
    const cleanAsin = (asin || '').trim().toUpperCase();
    if (!isValidAsin(cleanAsin)) {
      return {
        success: false,
        error: `Invalid ASIN format: "${asin}"`,
        source: 'VALIDATION_GUARD'
      };
    }

    const marketplace = (options.marketplace || this.defaultMarketplace).toLowerCase();
    if (!ALLOWED_AMAZON_MARKETPLACES.has(marketplace)) {
      return {
        success: false,
        error: `Unsupported marketplace: "${marketplace}"`,
        source: 'VALIDATION_GUARD'
      };
    }

    if (this.mode === ADAPTER_MODES.DISABLED) {
      return {
        success: false,
        error: 'Creators API is disabled: missing credentials or unfulfilled sales threshold.',
        source: 'FAIL_CLOSED_GUARD'
      };
    }

    if (this.mode === ADAPTER_MODES.MOCK) {
      if (this.customTransport) {
        return this.customTransport(cleanAsin, marketplace);
      }
      return {
        success: true,
        source: 'MOCK_TRANSPORT',
        product: {
          asin: cleanAsin,
          marketplace,
          title: `STIHL Compatible Product for ${cleanAsin}`,
          url: `https://${marketplace}/dp/${cleanAsin}?tag=${this.associateTag}`,
          in_stock: true,
          verified_at: new Date().toISOString()
        }
      };
    }

    // Production mode without custom transport: fail closed unless real HTTP client is connected
    return {
      success: false,
      error: 'Production endpoint execution requires live signed AWS v4 transport.',
      source: 'PRODUCTION_TRANSPORT_UNINITIALIZED'
    };
  }

  /**
   * Batch fetches product details for multiple ASINs.
   *
   * @param {Array<string>} asins
   * @param {Object} [options]
   * @returns {Promise<{ total: number, succeeded: number, results: Array<Object>, errors: Array<string> }>}
   */
  async batchFetchProductDetails(asins, options = {}) {
    if (!Array.isArray(asins)) {
      return { total: 0, succeeded: 0, results: [], errors: ['asins must be an array'] };
    }

    const results = [];
    const errors = [];

    for (const asin of asins) {
      const res = await this.fetchProductDetails(asin, options);
      if (res.success) {
        results.push(res.product);
      } else {
        errors.push(`${asin}: ${res.error}`);
      }
    }

    return {
      total: asins.length,
      succeeded: results.length,
      results,
      errors
    };
  }

  /**
   * Returns adapter status descriptor.
   * @returns {Object}
   */
  getAdapterStatus() {
    return {
      adapter_name: 'AmazonCreatorsAdapter',
      version: '1.0.0',
      mode: this.mode,
      credential_status: this.getCredentialStatus(),
      marketplace: this.defaultMarketplace,
      associate_tag: this.associateTag,
      api_ready: this.isApiReady(),
      min_qualifying_sales: CREATORS_API_MIN_QUALIFYING_SALES
    };
  }
}

export const defaultAmazonCreatorsAdapter = new AmazonCreatorsAdapter();
