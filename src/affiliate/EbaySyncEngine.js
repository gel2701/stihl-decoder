/**
 * src/affiliate/EbaySyncEngine.js
 *
 * Phase 71 Preparation — Scalable eBay Batch Synchronization Engine
 *
 * Phase 80: the sync engine no longer implies that every NL-shipping search
 * result is a publishable offer. Each candidate carries the canonical decision
 * from OfferEvidenceMatcher/EbayShippingEvidence:
 *   decision ACCEPT        → status ACTIVE   (publishable)
 *   decision REVIEW        → status NEEDS_EVIDENCE
 *   decision REJECT        → excluded
 * `active_offers` keeps its historical name for consumers, but every entry now
 * states its own status so a REVIEW item can never be stored as ACCEPT.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { classifyOffer, MATCH_TYPES, OFFER_STATUSES } from './OfferEvidenceMatcher.js';
import { SHIPPING_STATUS } from './EbayShippingEvidence.js';

const STATUS_BY_DECISION = Object.freeze({
  ACCEPT: OFFER_STATUSES.ACTIVE,
  REVIEW: OFFER_STATUSES.NEEDS_EVIDENCE,
  REJECT: OFFER_STATUSES.REJECTED
});

export class EbaySyncEngine {
  /**
   * @param {Object} [options]
   * @param {import('./EbayBrowseApiClient.js').EbayBrowseApiClient} options.apiClient
   * @param {number} [options.batchDelayMs=100] - Rate limiting delay between API calls
   */
  constructor(options = {}) {
    if (!options.apiClient) {
      throw new Error('[EbaySyncEngine] apiClient is required');
    }
    this.apiClient = options.apiClient;
    this.batchDelayMs = options.batchDelayMs ?? 100;
  }

  /**
   * Executes batch synchronization across an array of canonical part numbers.
   *
   * @param {Array<string>} partNumbers
   * @param {Object} [options]
   * @param {number} [options.maxItems=1000] - Scalable capacity cap
   * @returns {Promise<Object>}
   */
  async syncBatch(partNumbers = [], options = {}) {
    const maxItems = options.maxItems || 1000;
    const targetParts = partNumbers.slice(0, maxItems);

    const offers = [];
    const reviewOffers = [];
    let matchedCount = 0;
    let validNlShippingCount = 0;
    let deactivatedCount = 0;

    for (const rawPart of targetParts) {
      const normPart = PartNormalizer.normalizePartNumber(rawPart);
      if (!normPart) continue;

      const res = await this.apiClient.searchItems({
        partNumber: normPart,
        seller: 'saegenspezi_de'
      });

      if (!res.success || !res.items || res.items.length === 0) {
        continue;
      }

      matchedCount += res.items.length;

      const validCandidates = res.items.filter(item => item.ships_to_nl);
      if (validCandidates.length === 0) {
        deactivatedCount++;
        continue;
      }
      validNlShippingCount += validCandidates.length;

      for (const candidate of validCandidates) {
        const identity = classifyOffer({
          targetPart: normPart,
          title: candidate.title,
          mpn: candidate.mpn,
          gtin: candidate.gtin,
          aspects: candidate.aspects,
          brand: candidate.brand,
          manufacturer: candidate.manufacturer
        });
        const decision = identity.decision;
        if (decision === 'REJECT') continue;
        const marketplaceId = String(candidate.marketplace || candidate.marketplaceId || 'EBAY_DE').toUpperCase();
        const entry = {
          part_number: normPart,
          marketplace: marketplaceId,
          marketplace_id: marketplaceId,
          item_id: candidate.item_id,
          title: candidate.title,
          seller_name: candidate.seller_name,
          item_price: candidate.item_price,
          currency: candidate.currency,
          shipping_cost_nl: candidate.shipping_cost_nl,
          ships_to_nl: true,
          shipping_status: SHIPPING_STATUS.CONFIRMED,
          shipping_evidence: candidate.shipping_evidence || null,
          affiliate_url: candidate.affiliate_url,
          itemAffiliateWebUrl: candidate.affiliate_url,
          item_url: candidate.affiliate_url,
          match_type: identity.match_type,
          match_basis: identity.match_basis,
          decision,
          status: STATUS_BY_DECISION[decision],
          evidence_gaps: identity.evidence_gaps,
          condition: candidate.condition,
          synced_at: new Date().toISOString()
        };
        if (decision === 'ACCEPT') offers.push(entry);
        else reviewOffers.push(entry);
      }
    }

    return {
      scanned_count: targetParts.length,
      matched_count: matchedCount,
      valid_nl_shipping_count: validNlShippingCount,
      deactivated_count: deactivatedCount,
      accepted_count: offers.length,
      needs_evidence_count: reviewOffers.length,
      active_offers: [...offers, ...reviewOffers],
      needs_evidence_offers: reviewOffers,
      timestamp: new Date().toISOString()
    };
  }
}
