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
  getDeterministicQueryVariant,
  QUERY_VARIANTS
} from './AmazonAffiliateProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidateRegistryPaths = [
  path.resolve(__dirname, '..', '..', 'PHASE59E_ACTIVATION_CANDIDATES.json'),
  path.resolve(__dirname, '..', '..', 'data', 'affiliate', 'verified_amazon_registry.json'),
  path.resolve(__dirname, '..', '..', 'PHASE59D_VERIFIED_OFFERS.json')
];
const defaultRegistryPath = candidateRegistryPaths.find(p => fs.existsSync(p)) || candidateRegistryPaths[0];

export const MAX_PILOT_ACTIVE_OFFERS = 3;

export class VerifiedOfferRegistry {
  /**
   * @param {Object} [options]
   * @param {string} [options.registryPath]
   * @param {boolean} [options.productionActivationAllowed=false]
   * @param {string} [options.defaultMarketplace='amazon.nl']
   * @param {Array<string>|Set<string>} [options.activeWhitelist]
   */
  constructor(options = {}) {
    this.registryPath = options.registryPath || defaultRegistryPath;
    this.productionActivationAllowed = options.productionActivationAllowed ?? false;
    this.defaultMarketplace = options.defaultMarketplace || 'amazon.nl';
    this.activeWhitelist = options.activeWhitelist
      ? new Set(Array.from(options.activeWhitelist).map(p => PartNormalizer.normalizePartNumber(p)).filter(Boolean))
      : (process.env.AMAZON_PILOT_ACTIVE_PARTS
          ? new Set(process.env.AMAZON_PILOT_ACTIVE_PARTS.split(',').map(s => PartNormalizer.normalizePartNumber(s.trim())).filter(Boolean))
          : null);
    this.offers = new Map(); // key: canonical partNumber (11-digit)
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

    // Two-Gate Guard: An offer cannot be VERIFIED or ACTIVE if it fails Two-Gate Verification
    if ((requestedStatus === 'VERIFIED' || requestedStatus === 'ACTIVE') && !verification.passed) {
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

    const record = {
      part_number: normPart,
      asin: offer.asin.trim().toUpperCase(),
      marketplace: (offer.marketplace || this.defaultMarketplace).trim().toLowerCase(),
      affiliate_tag: offer.affiliate_tag || process.env.AMAZON_ASSOCIATE_TAG || '',
      manufacturer: offer.manufacturer,
      manufacturer_part_number: offer.manufacturer_part_number || offer.mpn,
      brand: offer.brand,
      product_title: offer.product_title || offer.matched_title || '',
      oem_brand_classification: offer.oem_brand_classification,
      verifiable_evidence_sources: offer.verifiable_evidence_sources || [
        {
          type: 'EXTERNAL_CATALOG',
          url: offer.independent_evidence_url,
          title: offer.manufacturer,
          claim: offer.confirmed_product_identity || 'Verified physical match',
          retrieved_at: offer.verification_date || new Date().toISOString()
        }
      ],
      compatibility_proof: offer.compatibility_proof || offer.confirmed_stihl_compatibility || '',
      asin_product_identity_proof: offer.asin_product_identity_proof || offer.confirmed_product_identity || '',
      independent_evidence_url: offer.independent_evidence_url || null,
      verification_date: offer.verification_date || new Date().toISOString().split('T')[0],
      status: finalStatus,
      status_reason: statusReason || (finalStatus === 'ACTIVE' ? 'Active and approved for production' : 'Staged/verified in registry; direct link not active'),
      gate_1_technical: verification.gate1,
      gate_2_product: verification.gate2,
      updated_at: new Date().toISOString()
    };

    this.offers.set(normPart, record);
    return { success: true, offer: record, errors: [] };
  }

  /**
   * Updates status of an individual offer with isolated per-offer control.
   *
   * @param {string} partNumber
   * @param {'STAGED'|'VERIFIED'|'ACTIVE'|'SUSPENDED'} newStatus
   * @param {string} reason
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  setOfferStatus(partNumber, newStatus, reason = '') {
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart || !this.offers.has(normPart)) {
      return { success: false, errors: [`Offer for part "${partNumber}" not found in registry.`] };
    }

    if (!VALID_OFFER_STATUSES.has(newStatus)) {
      return { success: false, errors: [`Invalid status "${newStatus}". Must be STAGED, VERIFIED, ACTIVE, or SUSPENDED.`] };
    }

    const offer = this.offers.get(normPart);

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
      const otherActive = this.listOffers({ status: 'ACTIVE' }).filter(o => o.part_number !== normPart);
      if (otherActive.length >= MAX_PILOT_ACTIVE_OFFERS) {
        return {
          success: false,
          errors: [`Cannot activate offer: Pilot limit of ${MAX_PILOT_ACTIVE_OFFERS} active offers reached.`]
        };
      }
    }

    offer.status = newStatus;
    offer.status_reason = reason || `Status set to ${newStatus}`;
    offer.updated_at = new Date().toISOString();

    return { success: true, offer, errors: [] };
  }

  /**
   * Immediately deactivates an active offer back to VERIFIED state (Rollback / Toggle).
   *
   * @param {string} partNumber
   * @param {string} [reason]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  deactivateOffer(partNumber, reason = 'Deactivated by operator') {
    return this.setOfferStatus(partNumber, 'VERIFIED', reason);
  }

  /**
   * Immediately suspends an offer with explicit failure or quality reason.
   *
   * @param {string} partNumber
   * @param {string} [reason]
   * @returns {{ success: boolean, offer?: Object, errors: string[] }}
   */
  suspendOffer(partNumber, reason = 'Suspended by operator') {
    return this.setOfferStatus(partNumber, 'SUSPENDED', reason);
  }

  /**
   * Checks if an offer is currently active and eligible for direct linking.
   *
   * @param {string} partNumber
   * @returns {boolean}
   */
  isOfferActive(partNumber) {
    return this.getActiveOffer(partNumber) !== null;
  }

  /**
   * Retrieves an offer from registry.
   *
   * @param {string} partNumber
   * @returns {Object|null}
   */
  getOffer(partNumber) {
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) return null;
    return this.offers.get(normPart) || null;
  }

  /**
   * Retrieves an ACTIVE offer eligible for direct product linking.
   * Returns null if productionActivationAllowed is false, offer does not exist,
   * status is not ACTIVE, part is not in activeWhitelist (if set),
   * active count exceeds pilot limit, or offer fails Two-Gate verification.
   *
   * @param {string} partNumber
   * @returns {Object|null}
   */
  getActiveOffer(partNumber) {
    if (!this.productionActivationAllowed) {
      return null;
    }
    const normPart = PartNormalizer.normalizePartNumber(partNumber);
    if (!normPart) return null;

    // Granular Per-Offer Whitelist check (Phase 59E)
    if (this.activeWhitelist && !this.activeWhitelist.has(normPart)) {
      return null;
    }

    const offer = this.getOffer(normPart);
    if (!offer) return null;
    if (offer.status !== 'ACTIVE') return null;

    // Safety guard: Limit maximum active offers in pilot to MAX_PILOT_ACTIVE_OFFERS (3)
    const activeOffersCount = this.listOffers({ status: 'ACTIVE' }).length;
    if (activeOffersCount > MAX_PILOT_ACTIVE_OFFERS) {
      console.warn(`[VerifiedOfferRegistry] Safety guard: ${activeOffersCount} active offers exceed pilot limit of ${MAX_PILOT_ACTIVE_OFFERS}. Failing closed to search fallback.`);
      return null;
    }

    // Runtime Safety Guard: Re-evaluate Two-Gate verification on resolution.
    // Incomplete, malformed, or stale records (>180d) fail closed and cannot be served.
    const verification = TwoGateVerifier.verifyOffer(offer);
    if (!verification.passed) {
      return null;
    }
    return offer;
  }

  /**
   * Generates display badges and labels according to OEM Brand Taxonomy.
   *
   * @param {Object} offer
   * @returns {{ badge_label: string, label: string, description: string }}
   */
  static getTaxonomyDisplayMeta(offer) {
    const classification = offer.oem_brand_classification;
    const formattedPart = PartNormalizer.formatPartNumber(offer.part_number);
    const marketplace = offer.marketplace || 'amazon.nl';
    const displayMarketplace = marketplace.charAt(0).toUpperCase() + marketplace.slice(1);

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
   * @returns {Object} Commercial offer descriptor
   */
  resolveCommercialOffer(params = {}) {
    const canonicalPart = PartNormalizer.normalizePartNumber(params.partNumber);
    const formattedPart = PartNormalizer.formatPartNumber(canonicalPart);
    const marketplace = params.marketplace || this.defaultMarketplace;
    const activeOffer = this.getActiveOffer(canonicalPart);
    const tag = params.tag || (activeOffer && activeOffer.affiliate_tag) || process.env.AMAZON_ASSOCIATE_TAG || '';
    const displayMarketplace = marketplace.charAt(0).toUpperCase() + marketplace.slice(1);

    if (activeOffer) {
      const directUrl = `https://${activeOffer.marketplace}/dp/${activeOffer.asin}?tag=${encodeURIComponent(tag)}`;
      const taxonomy = VerifiedOfferRegistry.getTaxonomyDisplayMeta(activeOffer);

      return {
        provider: 'amazon',
        marketplace: activeOffer.marketplace,
        part_number: canonicalPart,
        asin: activeOffer.asin,
        tag,
        url: directUrl,
        affiliate_url: directUrl,
        link_type: 'DIRECT_ASIN',
        offer_type: 'MANUAL_ASIN',
        match_type: AMAZON_MATCH_TYPES.MANUAL_ASIN,
        is_verified: true,
        verification_status: 'VERIFIED_EXACT_MATCH',
        oem_brand_classification: activeOffer.oem_brand_classification,
        manufacturer: activeOffer.manufacturer,
        brand: activeOffer.brand,
        mpn: activeOffer.manufacturer_part_number,
        title: activeOffer.product_title || `STIHL ${formattedPart}`,
        price: null,
        currency: 'EUR',
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
    const query = (queryVariant === QUERY_VARIANTS.VARIANT_A)
      ? `STIHL ${formattedPart}`
      : `STIHL ${canonicalPart}`;
    const searchParams = new URLSearchParams();
    searchParams.set('k', query);
    searchParams.set('tag', tag);
    const searchUrl = `https://${marketplace}/s?${searchParams.toString()}`;

    const stagedOffer = this.getOffer(canonicalPart);
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
      currency: 'EUR',
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
    return result;
  }

  /**
   * Exports registry to structured object.
   * @returns {Object}
   */
  exportRegistry() {
    const list = Array.from(this.offers.values());
    return {
      schema_version: '1.0.0',
      phase: '59D',
      exported_at: new Date().toISOString(),
      production_activation_allowed: this.productionActivationAllowed,
      metrics: {
        total_registered: list.length,
        staged: list.filter(o => o.status === 'STAGED').length,
        verified: list.filter(o => o.status === 'VERIFIED').length,
        active: list.filter(o => o.status === 'ACTIVE').length,
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
