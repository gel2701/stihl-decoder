/**
 * Base Affiliate Provider Interface for STIHLDecoder.nl
 * Phase 54A — Commercial UX & Multi-Provider Architecture Foundation
 */

export class AffiliateProvider {
  /**
   * @param {string} name - Identifier for the provider (e.g. 'amazon', 'bol', 'ebay')
   */
  constructor(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('[AffiliateProvider] Provider name must be a non-empty string');
    }
    this.name = name.toLowerCase().trim();
  }

  /**
   * Returns provider identifier.
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Checks whether this affiliate provider is active and enabled via environment/configuration.
   * Must fail closed if configuration is missing.
   * @returns {boolean}
   */
  isEnabled() {
    return false;
  }

  /**
   * Resolves commercial offers for a given part number and contextual information.
   * Decoupled from canonical part data: does not modify or corrupt part identity.
   * Synchronous contract: providers must return a synchronous array of offers.
   *
   * @param {Object} params
   * @param {string} params.partNumber - Raw or canonical part number
   * @param {string} [params.canonicalPartNumber] - 11-digit canonical part number
   * @param {string} [params.partName] - Human-readable part description
   * @param {string} [params.model] - Associated machine model identifier
   * @param {string} [params.configuration] - Specific machine configuration
   * @returns {Array<Object>} Synchronous list of standardized commercial offers
   */
  getOffers(params = {}) {
    return [];
  }
}
