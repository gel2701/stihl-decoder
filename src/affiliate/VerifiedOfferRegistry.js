/**
 * src/affiliate/VerifiedOfferRegistry.js
 *
 * Phase 59D: Verified Amazon Offer Registry & Granular Lifecycle Management
 *
 * Central registry for managing verified Amazon product offers:
 * - Granular lifecycle states: STAGED, VERIFIED, ACTIVE, SUSPENDED.
 * - Per-offer toggle and suspension with zero cross-catalog side effects.
 * - Enforces Two-Gate Verification before promotion.
 * - Fails closed to deterministic search fallback for unverified, staged, or suspended parts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { TwoGateVerifier, VALID_OFFER_STATUSES } from './TwoGateVerifier.js';
import {
  AMAZON_MATCH_TYPES,
  COMMERCIAL_TIERS,
  buildSearchQuery,
  getDeterministicQueryVariant,
  QUERY_VARIANTS
} from './AmazonAffiliateProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidateRegistryPaths = [
  path.resolve(__dirname, '..', '..', 'data', 'affiliate', 'verified_amazon_registry.json'),
  path.resolve(__dirname, '..', '..', 'PHASE59F1_ACTIVATION_CANDIDATES.json'),
  path.resolve(__dirname, '..', '..', 'PHASE59F_ACTIVATION_CANDIDATES.json'),
  path.resolve(__dirname, '..', '..', 'PHASE59E_ACTIVATION_CANDIDATES.json'),
  path.resolve(__dirname, '..', '..', 'PHASE59D_VERIFIED_OFFERS.json')
];
const defaultRegistryPath = candidateRegistryPaths.find(p => fs.existsSync(p)) || candidateRegistryPaths[0];

export const MAX_PILOT_ACTIVE_OFFERS = 60;

export const COMMERCIAL_MILESTONES = Object.freeze({
  MILESTONE_50: 50,
  MILESTONE_100: 100,
  MILESTONE_250: 250
});

/**
 * OfferMap: Subclass of Map providing transparent lookup by compositeKey
 * while preserving backwards compatibility for direct map.get(normPart) and map.has(normPart).
 */
class OfferMap extends Map {
  get(key) {
    if (super.has(key)) return super.get(key);
    const norm = PartNormalizer.normalizePartNumber(key);
    if (norm) {
      for (const val of this.values()) {
        if (val.part_number === norm) return val;
      }
    }
    return undefined;
  }

  has(key) {
    if (super.has(key)) return true;
    const norm = PartNormalizer.normalizePartNumber(key);
    if (norm) {
      for (const val of this.values()) {
        if (val.part_number === norm) return true;
      }
    }
    return false;
  }
}

export class VerifiedOfferRegistry {
  /**
   * @param {Object} [options]
   * @param {string} [options.registryPath]
   * @param {boolean} [options.productionActivationAllowed=false]
   * @param {string} [options.defaultMarketplace='amazon.nl']
   * @param {number} [options.maxActiveOffersAllowed=25]
   * @param {Object} [options.maxActiveOffersPerMarketplace]
   * @param {Array<string>|Set<string>} [options.activeWhitelist]
   */
  constructor(options = {}) {
    this.registryPath = options.registryPath || defaultRegistryPath;
    this.productionActivationAllowed = options.productionActivationAllowed ?? false;
    this.defaultMarketplace = options.defaultMarketplace || 'amazon.nl';
    this.maxActiveOffersAllowed = options.maxActiveOffersAllowed ?? (
      process.env.AFFILIATE_MAX_ACTIVE_OFFERS ? parseInt(process.env.AFFILIATE_MAX_ACTIVE_OFFERS, 10) : MAX_PILOT_ACTIVE_OFFERS
    );
    this.maxActiveOffersPerMarketplace = {
      'amazon.nl': options.maxActiveOffersPerMarketplace?.['amazon.nl'] ?? (
        process.env.AFFILIATE_MAX_ACTIVE_OFFERS_NL ? parseInt(process.env.AFFILIATE_MAX_ACTIVE_OFFERS_NL, 10) : this.maxActiveOffersAllowed
      ),
      'amazon.de': options.maxActiveOffersPerMarketplace?.['amazon.de'] ?? (
        process.env.AFFILIATE_MAX_ACTIVE_OFFERS_DE ? parseInt(process.env.AFFILIATE_MAX_ACTIVE_OFFERS_DE, 10) : this.maxActiveOffersAllowed
      ),
      ...(options.maxActiveOffersPerMarketplace || {})
    };
    this.activeWhitelist = options.activeWhitelist
      ? new Set(Array.from(options.activeWhitelist).map(p => PartNormalizer.normalizePartNumber(p)).filter(Boolean))
      : (process.env.AMAZON_PILOT_ACTIVE_PARTS
          ? new Set(process.env.AMAZON_PILOT_ACTIVE_PARTS.split(',').map(s => PartNormalizer.normalizePartNumber(s.trim())).filter(Boolean))
          : null);
    this.offers = new OfferMap(); // compositeKey -> record (with normPart fallback lookup)
    this.partIndex = new Map(); // normPart -> Array<record>
  }

  /**
   * Returns maximum active offers allowed for a specific marketplace.
   *
   * @param {string} [marketplace]
   * @returns {number}
   */
  getMaxActiveOffersAllowed(marketplace = this.defaultMarketplace) {
    const m = (marketplace || this.defaultMarketplace).toLowerCase();
    if (this.maxActiveOffersPerMarketplace && this.maxActiveOffersPerMarketplace[m] != null) {
      return this.maxActiveOffersPerMarketplace[m];
    }
    return this.maxActiveOffersAllowed;
  }

  /**
   * Registers or updates an offer in the registry.
   *
   * @param {Object} offer
   * @param {Object} [options]
   * @param {boolean} [options.bypassTwoGate=false]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  registerOffer(offer, options = {}) {
    if (!offer || typeof offer !== 'object') {
      return { success: false, errors: ['Offer is null or non-object'] };
    }

    const normPart = PartNormalizer.normalizePartNumber(offer.part_number);
    if (!normPart || normPart.length !== 11) {
      return { success: false, errors: [`Invalid canonical part number: "${offer.part_number}"`] };
    }

    const verification = TwoGateVerifier.verifyOffer(offer);
    const requestedStatus = offer.status || 'STAGED';

    if (!VALID_OFFER_STATUSES.has(requestedStatus)) {
      return { success: false, errors: [`Invalid offer status: "${requestedStatus}". Must be STAGED, VERIFIED, ACTIVE, or SUSPENDED.`] };
    }

    const mkt = (offer.marketplace || this.defaultMarketplace).trim().toLowerCase();
    const cleanAsin = (offer.asin || '').trim().toUpperCase();
    const compositeKey = `${normPart}:${mkt}:${cleanAsin}`;

    // Shipping verification validation for German offers:
    let shippingStatus = offer.shipping_to_nl_status;
    if (mkt === 'amazon.nl') {
      shippingStatus = shippingStatus || 'SHIPS_TO_NL_CONFIRMED';
    } else if (mkt === 'amazon.de') {
      if (shippingStatus === 'SHIPS_TO_NL_CONFIRMED') {
        const hasEvidence = offer.shipping_evidence_description &&
                            offer.shipping_evidence_url &&
                            offer.shipping_checked_at;
        if (!hasEvidence) {
          return {
            success: false,
            errors: ['Cannot register German offer as SHIPS_TO_NL_CONFIRMED without verifiable shipping evidence (shipping_evidence_url, shipping_evidence_description, and shipping_checked_at are required).']
          };
        }
      } else if (!shippingStatus) {
        shippingStatus = 'SHIPPING_UNKNOWN';
      }
    }

    // Invariant: German offer cannot be registered as ACTIVE if shipping_to_nl_status !== 'SHIPS_TO_NL_CONFIRMED'
    if (mkt === 'amazon.de' && requestedStatus === 'ACTIVE' && shippingStatus !== 'SHIPS_TO_NL_CONFIRMED') {
      return {
        success: false,
        errors: [`Cannot register German offer as ACTIVE: shipping_to_nl_status is "${shippingStatus}", but must be "SHIPS_TO_NL_CONFIRMED".`]
      };
    }

    // Two-Gate Guard: An offer cannot be VERIFIED or ACTIVE if it fails Two-Gate Verification
    const requiresVerification = requestedStatus === 'VERIFIED' ||
      requestedStatus === 'ACTIVE' ||
      requestedStatus === 'VERIFIED_WITH_INDEPENDENT_ASIN_EVIDENCE' ||
      requestedStatus === 'AMAZON_LISTING_COMPATIBLE';

    if (requiresVerification && !verification.passed) {
      return {
        success: false,
        errors: [`Cannot set status to ${requestedStatus} because Two-Gate verification failed: ${verification.errors.join('; ')}`]
      };
    }

    // Production Safety Guard: ACTIVE status requires explicit productionActivationAllowed flag
    let finalStatus = requestedStatus;
    let statusReason = offer.status_reason || '';

    if (requestedStatus === 'ACTIVE' && !this.productionActivationAllowed) {
      finalStatus = 'VERIFIED';
      statusReason = statusReason
        ? `${statusReason} (Demoted from ACTIVE to VERIFIED: production activation disabled by policy)`
        : 'Demoted from ACTIVE to VERIFIED: production activation disabled by policy';
    }

    const defaultTag = mkt === 'amazon.de'
      ? (process.env.AMAZON_ASSOCIATE_TAG_DE || 'srihldecode00-21')
      : (process.env.AMAZON_ASSOCIATE_TAG_NL || process.env.AMAZON_ASSOCIATE_TAG || 'srihldecoder2-21');

    const record = {
      part_number: normPart,
      asin: cleanAsin,
      marketplace: mkt,
      affiliate_tag: offer.affiliate_tag || defaultTag,
      manufacturer: offer.manufacturer || offer.brand || offer.seller_name || null,
      manufacturer_part_number: offer.manufacturer_part_number || offer.mpn,
      brand: offer.brand || offer.seller_name || null,
      product_title: offer.product_title || offer.matched_title || '',
      ean_gtin: offer.ean_gtin || offer.gtin || offer.ean || null,
      package_quantity: offer.package_quantity || 1,
      oem_brand_classification: offer.oem_brand_classification,
      evidence_classification: offer.evidence_classification || (offer.status === 'AMAZON_LISTING_COMPATIBLE' ? 'AMAZON_LISTING_COMPATIBLE' : null),
      model_compatibility: offer.model_compatibility || null,
      seller_name: offer.seller_name || (mkt === 'amazon.de' && /sägenspezi/i.test(offer.product_title || '') ? 'Sägenspezi' : null),
      seller_id: offer.seller_id || (offer.seller_name === 'Sägenspezi' || /sägenspezi/i.test(offer.product_title || '') ? 'A1GMRJIURBAM28' : null),
      kill_switch_id: offer.kill_switch_id || `KILL_${mkt.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${normPart}`,
      kill_switch_active: offer.kill_switch_active || false,
      focus_model: offer.focus_model || null,
      shipping_to_nl_status: shippingStatus || (mkt === 'amazon.nl' ? 'SHIPS_TO_NL_CONFIRMED' : null),
      shipping_destination_country: offer.shipping_destination_country || 'NL',
      shipping_checked_at: offer.shipping_checked_at || (shippingStatus === 'SHIPS_TO_NL_CONFIRMED' ? (offer.verification_date || new Date().toISOString().split('T')[0]) : null),
      shipping_evidence_url: offer.shipping_evidence_url || null,
      shipping_evidence_description: offer.shipping_evidence_description || null,
      fulfillment_context: offer.fulfillment_context || null,
      shipping_cost_nl: (typeof offer.shipping_cost_nl === 'number') ? offer.shipping_cost_nl : null,
      item_price: (typeof offer.item_price === 'number') ? offer.item_price : (typeof offer.price === 'number' ? offer.price : null),
      currency: offer.currency || 'EUR',
      verifiable_evidence_sources: offer.verifiable_evidence_sources || [
        {
          type: 'EXTERNAL_CATALOG',
          url: offer.independent_evidence_url || `https://${mkt}/dp/${cleanAsin}`,
          title: offer.manufacturer || offer.brand || 'Product Listing',
          claim: offer.confirmed_product_identity || 'Verified physical match',
          retrieved_at: offer.verification_date || new Date().toISOString()
        }
      ],
      compatibility_proof: offer.compatibility_proof || offer.confirmed_stihl_compatibility || '',
      asin_product_identity_proof: offer.asin_product_identity_proof || offer.confirmed_product_identity || '',
      independent_evidence_url: offer.independent_evidence_url || null,
      direct_affiliate_url: offer.direct_affiliate_url || (cleanAsin ? `https://${mkt}/dp/${cleanAsin}?tag=${offer.affiliate_tag || defaultTag}` : null),
      search_fallback_url: offer.search_fallback_url || `https://${mkt}/s?k=STIHL+${normPart}&tag=${offer.affiliate_tag || defaultTag}`,
      verification_date: offer.verification_date || new Date().toISOString().split('T')[0],
      status: finalStatus,
      status_reason: statusReason || (finalStatus === 'ACTIVE' ? 'Active and approved for production' : 'Staged/verified in registry; direct link not active'),
      gate_1_technical: verification.gate1,
      gate_2_product: verification.gate2,
      updated_at: new Date().toISOString()
    };

    this.offers.set(compositeKey, record);

    // Maintain multi-offer part index (1:N support)
    if (!this.partIndex.has(normPart)) {
      this.partIndex.set(normPart, []);
    }
    const partList = this.partIndex.get(normPart);
    const existingIdx = partList.findIndex(o => o.marketplace === mkt && o.asin === cleanAsin);
    if (existingIdx >= 0) {
      partList[existingIdx] = record;
    } else {
      partList.push(record);
    }

    return { success: true, offer: record, errors: [] };
  }

  /**
   * Updates status of an individual offer with isolated per-offer control.
   *
   * @param {string} partNumber
   * @param {'STAGED'|'VERIFIED'|'ACTIVE'|'SUSPENDED'} newStatus
   * @param {string} [reason='']
   * @param {Object} [options={}]
   * @param {string} [options.marketplace]
   * @param {string} [options.asin]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  setOfferStatus(partNumber, newStatus, reason = '', options = {}) {
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) {
      return { success: false, errors: [`Invalid canonical part number: "${partNumber}".`] };
    }

    const marketplace = options.marketplace ? options.marketplace.toLowerCase() : null;
    const asin = options.asin ? options.asin.toUpperCase() : null;

    let offer = null;
    if (marketplace && asin) {
      offer = this.offers.get(`${normPart}:${marketplace}:${asin}`);
    } else if (marketplace) {
      offer = this.getOffer(normPart, marketplace);
    } else {
      offer = this.getOffer(normPart);
    }

    if (!offer) {
      return { success: false, errors: [`Offer for part "${partNumber}" not found in registry.`] };
    }

    if (!VALID_OFFER_STATUSES.has(newStatus)) {
      return { success: false, errors: [`Invalid status "${newStatus}". Must be STAGED, VERIFIED, ACTIVE, or SUSPENDED.`] };
    }

    if (newStatus === 'ACTIVE') {
      const verification = TwoGateVerifier.verifyOffer(offer);
      if (!verification.passed) {
        return { success: false, errors: [`Cannot activate offer: Two-Gate verification failed (${verification.errors.join('; ')})`] };
      }
      if (!this.productionActivationAllowed) {
        return {
          success: false,
          errors: ['Cannot activate offer in production: productionActivationAllowed is FALSE. Individual explicit authorization required.']
        };
      }

      const targetMarketplace = offer.marketplace || this.defaultMarketplace;
      const maxAllowed = this.getMaxActiveOffersAllowed(targetMarketplace);
      const otherActive = this.listOffers({ status: 'ACTIVE', marketplace: targetMarketplace }).filter(o => o.asin !== offer.asin || o.part_number !== normPart);
      if (otherActive.length >= maxAllowed) {
        return {
          success: false,
          errors: [`Cannot activate offer: Limit of ${maxAllowed} active offers reached on ${targetMarketplace}.`]
        };
      }

      // Hard requirement: Shipping to NL confirmed for German marketplace
      if (targetMarketplace === 'amazon.de' && offer.shipping_to_nl_status !== 'SHIPS_TO_NL_CONFIRMED') {
        return {
          success: false,
          errors: [`Cannot activate German offer: shipping_to_nl_status is "${offer.shipping_to_nl_status || 'UNKNOWN'}", but must be "SHIPS_TO_NL_CONFIRMED".`]
        };
      }
    }

    offer.status = newStatus;
    offer.status_reason = reason || `Status set to ${newStatus}`;
    offer.updated_at = new Date().toISOString();

    return { success: true, offer, errors: [] };
  }

  /**
   * Activates an eligible offer to ACTIVE state (subject to Two-Gate verification and limits).
   *
   * @param {string} partNumber
   * @param {string} [reason]
   * @param {Object} [options]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  activateOffer(partNumber, reason = 'Activated by operator', options = {}) {
    return this.setOfferStatus(partNumber, 'ACTIVE', reason, options);
  }

  /**
   * Immediately deactivates an active offer back to VERIFIED state (Rollback / Toggle).
   *
   * @param {string} partNumber
   * @param {string} [reason]
   * @param {Object} [options]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  deactivateOffer(partNumber, reason = 'Deactivated by operator', options = {}) {
    return this.setOfferStatus(partNumber, 'VERIFIED', reason, options);
  }

  /**
   * Activates a batch of candidate offers with atomic safety, deduplication, batch limits,
   * individual kill switch generation, and expiry date management (Phase 72).
   *
   * @param {Array<Object>} offers
   * @param {Object} [options]
   * @param {number} [options.batchLimit=50]
   * @param {string} [options.reason='Phase 72 batch activation']
   * @param {number} [options.evidenceExpiryDays=180]
   * @returns {{ success: boolean, activatedCount: number, errors: string[], offers: Array<Object> }}
   */
  activateBatch(offers, options = {}) {
    if (!Array.isArray(offers)) {
      return { success: false, activatedCount: 0, errors: ['Offers must be an array'], offers: [] };
    }
    const batchLimit = options.batchLimit || 50;
    if (offers.length > batchLimit) {
      return {
        success: false,
        activatedCount: 0,
        errors: [`Batch size (${offers.length}) exceeds maximum allowed batch limit of ${batchLimit}`],
        offers: []
      };
    }

    const activated = [];
    const errors = [];
    const rollbackState = [];

    for (const rawOffer of offers) {
      const normPart = PartNormalizer.normalizePartNumber(rawOffer.part_number);
      if (!normPart || normPart.length !== 11) {
        errors.push(`Invalid canonical part number: "${rawOffer?.part_number}"`);
        break;
      }
      const mkt = (rawOffer.marketplace || this.defaultMarketplace).toLowerCase();
      const asin = (rawOffer.asin || '').trim().toUpperCase();
      const compositeKey = `${normPart}:${mkt}:${asin}`;

      // Snapshot existing offer for rollback if present
      const existing = this.offers.get(compositeKey);
      if (existing) {
        rollbackState.push({ key: compositeKey, previous: JSON.parse(JSON.stringify(existing)), isNew: false, normPart });
      } else {
        rollbackState.push({ key: compositeKey, isNew: true, normPart, asin });
      }

      // Generate individual kill switch ID if not present
      const mktPrefix = mkt === 'amazon.de' ? 'DE' : 'NL';
      const killSwitchId = rawOffer.kill_switch_id || `KILL_AMAZON_${mktPrefix}_${normPart}`;

      // Set expiry review date (max 180 days per Two-Gate freshness rules)
      const expiryDays = options.evidenceExpiryDays || 180;
      const reviewByDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const preparedOffer = {
        ...rawOffer,
        kill_switch_id: killSwitchId,
        review_by_date: rawOffer.review_by_date || reviewByDate,
        status: 'ACTIVE',
        status_reason: rawOffer.status_reason || options.reason || 'Phase 72 batch activation'
      };

      const regResult = this.registerOffer(preparedOffer);
      if (!regResult.success) {
        errors.push(`Failed to register offer for ${normPart} (${asin}): ${regResult.errors.join('; ')}`);
        break;
      }

      activated.push(regResult.offer);
    }

    if (errors.length > 0) {
      // Atomic rollback of entire batch
      for (const item of rollbackState) {
        if (item.isNew) {
          this.offers.delete(item.key);
          const list = this.partIndex.get(item.normPart) || [];
          this.partIndex.set(item.normPart, list.filter(o => o.asin !== item.asin));
        } else {
          this.offers.set(item.key, item.previous);
        }
      }
      return { success: false, activatedCount: 0, errors, offers: [] };
    }

    return { success: true, activatedCount: activated.length, errors: [], offers: activated };
  }

  /**
   * Independently sets or updates the shipping-to-NL status and evidence for an offer.
   *
   * @param {string} partNumber
   * @param {string} marketplace
   * @param {string} asin
   * @param {'SHIPS_TO_NL_CONFIRMED'|'SHIPPING_UNKNOWN'|'DOES_NOT_SHIP_TO_NL'} shippingStatus
   * @param {Object} [evidence={}]
   * @param {string} [evidence.shipping_checked_at]
   * @param {string} [evidence.shipping_evidence_url]
   * @param {string} [evidence.shipping_evidence_description]
   * @param {number|null} [evidence.shipping_cost_nl]
   * @param {string} [evidence.fulfillment_context]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  setShippingStatus(partNumber, marketplace, asin, shippingStatus, evidence = {}) {
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) return { success: false, errors: [`Invalid part number: "${partNumber}".`] };

    const mkt = (marketplace || this.defaultMarketplace).toLowerCase();
    const cleanAsin = (asin || '').toUpperCase();
    const offer = this.offers.get(`${normPart}:${mkt}:${cleanAsin}`);
    if (!offer) {
      return { success: false, errors: [`Offer ${normPart} (${mkt} / ${cleanAsin}) not found in registry.`] };
    }

    const validStatuses = new Set(['SHIPS_TO_NL_CONFIRMED', 'SHIPPING_UNKNOWN', 'DOES_NOT_SHIP_TO_NL']);
    if (!validStatuses.has(shippingStatus)) {
      return { success: false, errors: [`Invalid shipping status "${shippingStatus}". Must be SHIPS_TO_NL_CONFIRMED, SHIPPING_UNKNOWN, or DOES_NOT_SHIP_TO_NL.`] };
    }

    if (mkt === 'amazon.de' && shippingStatus === 'SHIPS_TO_NL_CONFIRMED') {
      const desc = evidence.shipping_evidence_description || offer.shipping_evidence_description;
      const url = evidence.shipping_evidence_url || offer.shipping_evidence_url;
      const date = evidence.shipping_checked_at || offer.shipping_checked_at;
      if (!desc || !url || !date) {
        return {
          success: false,
          errors: ['Cannot set German offer to SHIPS_TO_NL_CONFIRMED without verifiable shipping evidence (url, description, checked_at).']
        };
      }
    }

    offer.shipping_to_nl_status = shippingStatus;
    if (evidence.shipping_checked_at !== undefined) offer.shipping_checked_at = evidence.shipping_checked_at;
    if (evidence.shipping_evidence_url !== undefined) offer.shipping_evidence_url = evidence.shipping_evidence_url;
    if (evidence.shipping_evidence_description !== undefined) offer.shipping_evidence_description = evidence.shipping_evidence_description;
    if (evidence.shipping_cost_nl !== undefined) offer.shipping_cost_nl = evidence.shipping_cost_nl;
    if (evidence.fulfillment_context !== undefined) offer.fulfillment_context = evidence.fulfillment_context;

    // Failsafe: if German offer is currently ACTIVE and shipping status is not confirmed, automatically demote to VERIFIED
    if (mkt === 'amazon.de' && shippingStatus !== 'SHIPS_TO_NL_CONFIRMED' && offer.status === 'ACTIVE') {
      offer.status = 'VERIFIED';
      offer.status_reason = `Demoted to VERIFIED: shipping_to_nl_status changed to "${shippingStatus}".`;
    }

    offer.updated_at = new Date().toISOString();
    return { success: true, offer, errors: [] };
  }

  /**
   * Immediately suspends an offer with explicit failure or quality reason.
   *
   * @param {string} partNumber
   * @param {string} [reason]
   * @param {Object} [options]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  suspendOffer(partNumber, reason = 'Suspended by operator', options = {}) {
    return this.setOfferStatus(partNumber, 'SUSPENDED', reason, options);
  }

  /**
   * Checks if an offer is currently active and eligible for direct linking.
   *
   * @param {string} partNumber
   * @param {string} [marketplace]
   * @returns {boolean}
   */
  isOfferActive(partNumber, marketplace) {
    return this.getActiveOffer(partNumber, marketplace) !== null;
  }

  /**
   * Retrieves an offer from registry.
   * If marketplace is omitted, returns the primary/default offer for partNumber.
   *
   * @param {string} partNumber
   * @param {string} [marketplace]
   * @returns {Object|null}
   */
  getOffer(partNumber, marketplace = null) {
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) return null;
    const list = this.partIndex.get(normPart);
    if (!list || list.length === 0) return null;
    if (marketplace) {
      const mkt = marketplace.toLowerCase();
      return list.find(o => o.marketplace === mkt) || null;
    }
    // Default to primary/defaultMarketplace or first offer
    return list.find(o => o.marketplace === this.defaultMarketplace) || list[0] || null;
  }

  /**
   * Retrieves all offers registered for a part number across all marketplaces.
   *
   * @param {string} partNumber
   * @returns {Array<Object>}
   */
  getOffers(partNumber) {
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) return [];
    return this.partIndex.get(normPart) || [];
  }

  /**
   * Retrieves an ACTIVE offer eligible for direct product linking on a specific marketplace.
   * Defaults to defaultMarketplace ('amazon.nl').
   *
   * @param {string} partNumber
   * @param {string} [marketplace]
   * @returns {Object|null}
   */
  getActiveOffer(partNumber, marketplace = this.defaultMarketplace) {
    if (!this.productionActivationAllowed) {
      return null;
    }
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) return null;

    // Granular Per-Offer Whitelist check (Phase 59E)
    if (this.activeWhitelist && !this.activeWhitelist.has(normPart)) {
      return null;
    }

    const offer = this.getOffer(normPart, marketplace);
    if (!offer) return null;
    if (offer.status !== 'ACTIVE') return null;

    const targetMarketplace = offer.marketplace || marketplace || this.defaultMarketplace;
    const maxAllowed = this.getMaxActiveOffersAllowed(targetMarketplace);

    // Safety guard: Limit maximum active offers per marketplace
    const activeOffersCount = this.listOffers({ status: 'ACTIVE', marketplace: targetMarketplace }).length;
    if (activeOffersCount > maxAllowed) {
      console.warn(`[VerifiedOfferRegistry] Safety guard: ${activeOffersCount} active offers on ${targetMarketplace} exceed limit of ${maxAllowed}. Failing closed to search fallback.`);
      return null;
    }

    // Hard requirement: Shipping to NL confirmed for German marketplace
    if (targetMarketplace === 'amazon.de') {
      if (offer.shipping_to_nl_status !== 'SHIPS_TO_NL_CONFIRMED') {
        return null;
      }
    }

    // Runtime Safety Guard: Re-evaluate Two-Gate verification on resolution.
    const verification = TwoGateVerifier.verifyOffer(offer);
    if (!verification.passed) {
      return null;
    }
    return offer;
  }

  /**
   * Retrieves all ACTIVE offers eligible for direct product linking across all marketplaces (1:N multi-offer).
   *
   * @param {string} partNumber
   * @returns {Array<Object>}
   */
  getActiveOffers(partNumber) {
    if (!this.productionActivationAllowed) {
      return [];
    }
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) return [];

    if (this.activeWhitelist && !this.activeWhitelist.has(normPart)) {
      return [];
    }

    const candidateOffers = this.getOffers(normPart);
    const activeOffers = [];

    for (const offer of candidateOffers) {
      if (offer.status !== 'ACTIVE') continue;

      const targetMarketplace = offer.marketplace || this.defaultMarketplace;
      const maxAllowed = this.getMaxActiveOffersAllowed(targetMarketplace);
      const countActive = this.listOffers({ status: 'ACTIVE', marketplace: targetMarketplace }).length;
      if (countActive > maxAllowed) continue;

      if (targetMarketplace === 'amazon.de' && offer.shipping_to_nl_status !== 'SHIPS_TO_NL_CONFIRMED') {
        continue;
      }

      const verification = TwoGateVerifier.verifyOffer(offer);
      if (!verification.passed) continue;

      activeOffers.push(offer);
    }

    return activeOffers;
  }

  /**
   * Generates display badges and labels according to OEM Brand Taxonomy and marketplace.
   *
   * @param {Object} offer
   * @returns {{ badge_label: string, label: string, description: string }}
   */
  static getTaxonomyDisplayMeta(offer) {
    const classification = offer.oem_brand_classification;
    const formattedPart = PartNormalizer.formatPartNumber(offer.part_number);
    const marketplace = offer.marketplace || 'amazon.nl';
    const displayMarketplace = marketplace === 'amazon.de' ? 'Amazon.de' : 'Amazon.nl';
    const isAmazonListingCompatible = offer.evidence_classification === 'AMAZON_LISTING_COMPATIBLE' ||
      offer.verification_status === 'AMAZON_LISTING_COMPATIBLE' ||
      offer.status === 'AMAZON_LISTING_COMPATIBLE';

    if (marketplace === 'amazon.de' && (offer.seller_name === 'Sägenspezi' || /sägenspezi/i.test(offer.product_title || ''))) {
      const model = offer.model_compatibility || (offer.compatibility_proof ? offer.compatibility_proof.match(/(?:voor|for)\s+([A-Za-z0-9\s,-]+)/i)?.[1]?.trim() : '') || 'STIHL machines';
      return {
        badge_label: '🇩🇪 Sägenspezi · Amazon.de',
        label: 'Bekijk bij Sägenspezi op Amazon.de',
        description: `Geverifieerd kwaliteitsonderdeel van Sägenspezi (Duitsland), passend voor STIHL ${model} (volgens Amazon.de productvermelding). Verzending naar Nederland bevestigd.`
      };
    }

    if (isAmazonListingCompatible) {
      const model = offer.model_compatibility || (offer.compatibility_proof ? offer.compatibility_proof.match(/(?:voor|for)\s+([A-Za-z0-9\s,-]+)/i)?.[1]?.trim() : '') || 'STIHL machines';
      if (classification === 'GENUINE_STIHL') {
        return {
          badge_label: 'Origineel STIHL',
          label: `Bekijk origineel product op ${displayMarketplace}`,
          description: `Geschikt voor STIHL ${model} (volgens Amazon-productvermelding). Controleer vóór aankoop altijd machine-uitvoering en bouwjaar.`
        };
      }
      if (classification === 'OEM_SUPPLIER_EQUIVALENT') {
        const brand = offer.brand || offer.manufacturer || 'OEM-leverancier';
        return {
          badge_label: `OEM-kwaliteit (${brand})`,
          label: `Bekijk ${brand} product op ${displayMarketplace}`,
          description: `Geschikt voor STIHL ${model} (volgens Amazon-productvermelding). Controleer vóór aankoop altijd machine-uitvoering en bouwjaar.`
        };
      }
      if (classification === 'MANUFACTURER_AFTERMARKET') {
        const brand = offer.brand || 'Aftermarket';
        return {
          badge_label: `Kwaliteitsvervanger (${brand})`,
          label: `Bekijk ${brand} vervanger op ${displayMarketplace}`,
          description: `Geschikt voor STIHL ${model} (volgens Amazon-productvermelding). Controleer vóór aankoop altijd machine-uitvoering en bouwjaar.`
        };
      }
      return {
        badge_label: 'Compatibel product',
        label: `Bekijk product op ${displayMarketplace}`,
        description: `Geschikt voor STIHL ${model} (volgens Amazon-productvermelding). Controleer vóór aankoop altijd machine-uitvoering en bouwjaar.`
      };
    }

    if (classification === 'GENUINE_STIHL') {
      return {
        badge_label: 'Origineel STIHL',
        label: `Bekijk origineel product op ${displayMarketplace}`,
        description: `Voor dit onderdeel is een specifiek origineel STIHL-product gecontroleerd (${formattedPart}). Controleer vóór bestelling altijd machine-uitvoering en bouwjaar.`
      };
    }

    if (classification === 'OEM_SUPPLIER_EQUIVALENT') {
      const brand = offer.brand || offer.manufacturer || 'OEM-leverancier';
      return {
        badge_label: `OEM-kwaliteit (${brand})`,
        label: `Bekijk ${brand} product op ${displayMarketplace}`,
        description: `Gefabriceerd door officiële STIHL eerste montage-toeleverancier (${brand}, MPN: ${offer.manufacturer_part_number || 'standaard'}). Geleverd in eigen merkverpakking met identieke technische specificaties.`
      };
    }

    if (classification === 'MANUFACTURER_AFTERMARKET') {
      const brand = offer.brand || 'Aftermarket';
      return {
        badge_label: `Kwaliteitsvervanger (${brand})`,
        label: `Bekijk ${brand} vervanger op ${displayMarketplace}`,
        description: `Geteste kwaliteitsvervanger van ${brand} (MPN: ${offer.manufacturer_part_number || formattedPart}). Voldoet aan fabrieksspecificaties voor compatibele modellen.`
      };
    }

    return {
      badge_label: 'Geverifieerd product',
      label: `Bekijk product op ${displayMarketplace}`,
      description: `Voor dit onderdeel is een specifieke Amazon-productpagina gecontroleerd. Controleer vóór aankoop altijd onderdeelnummer en machine-uitvoering.`
    };
  }

  /**
   * Resolves commercial offer representation for a given part number.
   * If an offer is ACTIVE, returns direct ASIN offer.
   * If an offer is STAGED, VERIFIED, SUSPENDED, or missing, returns 100% compliant search fallback.
   *
   * @param {Object} params
   * @param {string} params.partNumber
   * @param {string} [params.partName]
   * @param {string} [params.tag]
   * @param {string} [params.marketplace]
   * @param {Object} [params.activeOffer]
   * @returns {Object} Commercial offer descriptor
   */
  resolveCommercialOffer(params = {}) {
    const canonicalPart = PartNormalizer.normalizePartNumber(params.partNumber);
    const formattedPart = PartNormalizer.formatPartNumber(canonicalPart);
    const marketplace = (params.marketplace || this.defaultMarketplace).trim().toLowerCase();
    const activeOffer = params.activeOffer || this.getActiveOffer(canonicalPart, marketplace);
    const targetMarketplace = activeOffer ? activeOffer.marketplace : marketplace;
    const defaultTag = targetMarketplace === 'amazon.de'
      ? (process.env.AMAZON_ASSOCIATE_TAG_DE || 'srihldecode00-21')
      : (process.env.AMAZON_ASSOCIATE_TAG_NL || process.env.AMAZON_ASSOCIATE_TAG || 'srihldecoder2-21');
    const tag = params.tag || (activeOffer && activeOffer.affiliate_tag) || defaultTag;
    const displayMarketplace = targetMarketplace === 'amazon.de' ? 'Amazon.de' : 'Amazon.nl';

    if (activeOffer) {
      const directUrl = `https://${activeOffer.marketplace}/dp/${activeOffer.asin}?tag=${encodeURIComponent(tag)}`;
      const taxonomy = VerifiedOfferRegistry.getTaxonomyDisplayMeta(activeOffer);
      const isAmazonListingCompatible = activeOffer.evidence_classification === 'AMAZON_LISTING_COMPATIBLE';

      const itemPrice = (typeof activeOffer.item_price === 'number')
        ? activeOffer.item_price
        : ((typeof activeOffer.price === 'number') ? activeOffer.price : null);
      const shippingCost = (typeof activeOffer.shipping_cost_nl === 'number')
        ? activeOffer.shipping_cost_nl
        : null;
      let totalPrice = null;
      if (itemPrice !== null && shippingCost !== null) {
        totalPrice = Number((itemPrice + shippingCost).toFixed(2));
      }

      return {
        provider: 'amazon',
        marketplace: activeOffer.marketplace,
        part_number: canonicalPart,
        asin: activeOffer.asin,
        tag,
        url: directUrl,
        affiliate_url: directUrl,
        link_type: 'DIRECT_ASIN',
        tier: COMMERCIAL_TIERS.DIRECT_VERIFIED,
        offer_type: 'MANUAL_ASIN',
        match_type: AMAZON_MATCH_TYPES.MANUAL_ASIN,
        is_verified: true,
        verification_status: isAmazonListingCompatible ? 'AMAZON_LISTING_COMPATIBLE' : 'VERIFIED_EXACT_MATCH',
        evidence_classification: activeOffer.evidence_classification || null,
        oem_brand_classification: activeOffer.oem_brand_classification,
        manufacturer: activeOffer.manufacturer,
        brand: activeOffer.brand,
        mpn: activeOffer.manufacturer_part_number,
        title: activeOffer.product_title || `STIHL ${formattedPart}`,
        price: itemPrice,
        item_price: itemPrice,
        shipping_cost_nl: shippingCost,
        total_price: totalPrice,
        currency: activeOffer.currency || 'EUR',
        seller_name: activeOffer.seller_name || null,
        seller_id: activeOffer.seller_id || null,
        shipping_to_nl_status: activeOffer.shipping_to_nl_status || 'SHIPS_TO_NL_CONFIRMED',
        in_stock: null,
        image_url: null,
        confidence: 'HIGH',
        label: taxonomy.label,
        badge_label: taxonomy.badge_label,
        cta_aria_label: `Bekijk geverifieerd product voor STIHL onderdeel ${formattedPart} op ${displayMarketplace}`,
        description: taxonomy.description,
        rel: 'sponsored nofollow noopener',
        target: '_blank'
      };
    }

    // Deterministic Search Fallback
    const queryVariant = getDeterministicQueryVariant(canonicalPart);
    const query = buildSearchQuery(canonicalPart, { queryVariant, partName: params.partName });
    const searchParams = new URLSearchParams();
    searchParams.set('k', query);
    searchParams.set('tag', tag);
    const searchUrl = `https://${marketplace}/s?${searchParams.toString()}`;

    const stagedOffer = this.getOffer(canonicalPart, marketplace);
    let fallbackDescription = `Zoek op Amazon naar STIHL onderdeel ${formattedPart}. De beschikbaarheid en exacte overeenkomst zijn niet vooraf bevestigd.`;
    if (stagedOffer && stagedOffer.status === 'SUSPENDED') {
      fallbackDescription = `De directe productlink voor dit onderdeel is tijdelijk opgeschort wegens kwaliteitscontrole (${stagedOffer.status_reason}). Zoekresultaten blijven beschikbaar.`;
    }

    return {
      provider: 'amazon',
      marketplace,
      part_number: canonicalPart,
      asin: null,
      tag,
      url: searchUrl,
      affiliate_url: searchUrl,
      link_type: 'SEARCH_FALLBACK',
      tier: COMMERCIAL_TIERS.TARGETED_SEARCH,
      offer_type: 'SEARCH_LINK',
      match_type: AMAZON_MATCH_TYPES.SEARCH_LINK,
      is_verified: false,
      verification_status: null,
      oem_brand_classification: stagedOffer ? stagedOffer.oem_brand_classification : null,
      query_variant: queryVariant,
      title: params.partName
        ? `Zoek ${params.partName} (STIHL ${formattedPart}) op ${displayMarketplace}`
        : `Zoek STIHL ${formattedPart} op ${displayMarketplace}`,
      price: null,
      item_price: null,
      shipping_cost_nl: null,
      total_price: null,
      currency: 'EUR',
      seller_name: null,
      seller_id: null,
      shipping_to_nl_status: null,
      in_stock: null,
      image_url: null,
      confidence: 'SEARCH_FALLBACK',
      label: `Zoek op ${displayMarketplace}`,
      badge_label: 'Amazon-zoekopdracht',
      cta_aria_label: `Zoek STIHL onderdeel ${formattedPart} op ${displayMarketplace}`,
      description: fallbackDescription,
      rel: 'sponsored nofollow noopener',
      target: '_blank'
    };
  }

  /**
   * Returns list of all registered offers.
   * @param {Object} [filter]
   * @returns {Array<Object>}
   */
  listOffers(filter = {}) {
    let result = Array.from(this.offers.values());
    if (filter.status) {
      result = result.filter(o => o.status === filter.status);
    }
    if (filter.classification) {
      result = result.filter(o => o.oem_brand_classification === filter.classification);
    }
    if (filter.marketplace) {
      const mkt = filter.marketplace.toLowerCase();
      result = result.filter(o => (o.marketplace || 'amazon.nl').toLowerCase() === mkt);
    }
    if (filter.part_number) {
      const norm = PartNormalizer.normalizePartNumber(filter.part_number);
      result = result.filter(o => o.part_number === norm);
    }
    return result;
  }

  /**
   * Exports registry to structured object.
   * @returns {Object}
   */
  exportRegistry() {
    const list = Array.from(this.offers.values());
    const nlActive = list.filter(o => o.status === 'ACTIVE' && (o.marketplace === 'amazon.nl' || !o.marketplace));
    const deActive = list.filter(o => o.status === 'ACTIVE' && o.marketplace === 'amazon.de');

    return {
      schema_version: '1.0.0',
      phase: '70',
      exported_at: new Date().toISOString(),
      production_activation_allowed: this.productionActivationAllowed,
      policy: {
        max_active_offers_allowed: this.maxActiveOffersAllowed,
        max_active_offers_per_marketplace: {
          'amazon.nl': this.getMaxActiveOffersAllowed('amazon.nl'),
          'amazon.de': this.getMaxActiveOffersAllowed('amazon.de')
        },
        default_marketplace: this.defaultMarketplace,
        affiliate_tags: {
          'amazon.nl': 'srihldecoder2-21',
          'amazon.de': 'srihldecode00-21'
        }
      },
      metrics: {
        total_registered: list.length,
        staged: list.filter(o => o.status === 'STAGED').length,
        verified: list.filter(o => o.status === 'VERIFIED').length,
        active: list.filter(o => o.status === 'ACTIVE').length,
        active_nl: nlActive.length,
        active_de: deActive.length,
        suspended: list.filter(o => o.status === 'SUSPENDED').length
      },
      offers: list
    };
  }

  /**
   * Imports registry from structured object.
   * @param {Object} doc
   */
  importRegistry(doc) {
    if (!doc || !Array.isArray(doc.offers)) return;
    for (const item of doc.offers) {
      this.registerOffer(item);
    }
  }

  /**
   * Loads registry from file.
   */
  loadFromFile(filePath = this.registryPath) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const doc = JSON.parse(raw);
        this.importRegistry(doc);
      }
    } catch (err) {
      console.warn(`[VerifiedOfferRegistry] Warning loading registry from ${filePath}: ${err.message}`);
    }
  }

  /**
   * Saves registry to file.
   */
  saveToFile(filePath = this.registryPath) {
    const doc = this.exportRegistry();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  }
}

export const defaultVerifiedOfferRegistry = new VerifiedOfferRegistry({
  productionActivationAllowed: process.env.AMAZON_DIRECT_ASIN_ENABLED === 'true'
});
