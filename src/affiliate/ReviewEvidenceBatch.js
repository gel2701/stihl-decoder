/**
 * src/affiliate/ReviewEvidenceBatch.js
 *
 * Phase 80.1 — Re-adjudicate EXISTING eBay review candidates.
 *
 * The Phase 76G REVIEW offers already contain the item id, title, affiliate
 * URL and the shipping evidence that was known at the time. Re-running Browse
 * searches for them is wasteful and can even return a different listing, so this
 * batch:
 *
 *  - works from the stored item ids only;
 *  - asks eBay `getItem` only for candidates whose blocker is missing evidence;
 *  - reuses the persistent evidence registry and a per-run cache, so an item
 *    shared by several part numbers is fetched exactly once;
 *  - keeps every part↔item relation;
 *  - falls back to a Browse search only when the stored listing no longer
 *    exists (getItem 404 / no item), never for candidates that merely need
 *    more detail;
 *  - never turns REVIEW into ACTIVE without a completed, positive decision.
 */

import { PartNormalizer } from '../parts/PartNormalizer.js';
import { OFFER_STATUSES } from './OfferEvidenceMatcher.js';

const UNAVAILABLE_PATTERN = /HTTP 404|no item|not found/i;

export class ReviewEvidenceBatch {
  /**
   * @param {Object} options
   * @param {import('./EbayHighVolumeEngine.js').EbayHighVolumeEngine} options.engine
   * @param {import('./EbayEvidenceRegistry.js').EbayEvidenceRegistry} [options.evidenceRegistry]
   * @param {(ms:number)=>Promise<void>} [options.sleepFn]
   * @param {number} [options.batchDelayMs=120]
   */
  constructor(options = {}) {
    if (!options.engine) throw new Error('[ReviewEvidenceBatch] engine is required');
    this.engine = options.engine;
    this.apiClient = options.engine.apiClient || null;
    this.evidenceRegistry = options.evidenceRegistry || options.engine.evidenceRegistry || null;
    this.sleepFn = options.sleepFn || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.batchDelayMs = options.batchDelayMs ?? 120;
  }

  /**
   * @param {Array<{part_number:string, description?:string, category?:string, models?:string[], existing:Array<Object>}>} candidates
   * @param {Object} [options]
   * @param {boolean} [options.live=false] allow getItem/search network calls
   * @param {boolean} [options.allowSearchFallback=false] Browse search only for unavailable listings
   * @param {number} [options.maxGetItems=250]
   * @returns {Promise<Object>}
   */
  async run(candidates = [], options = {}) {
    const live = options.live === true;
    const allowSearchFallback = options.allowSearchFallback === true;
    const maxGetItems = options.maxGetItems ?? 250;

    const accepted = [];
    const needsEvidence = [];
    const rejected = [];
    const perPart = new Map();
    const relations = new Map(); // itemId -> { marketplace, part_numbers:Set }
    const runCache = new Map();
    const stats = {
      processed_candidates: 0,
      unique_items: 0,
      invalid_candidates: 0,
      get_item_requests: 0,
      get_item_network_calls: 0,
      get_item_reused: 0,
      deferred_get_items: 0,
      evidence_completed: 0,
      item_unavailable: 0,
      search_fallbacks: 0
    };

    const ensurePart = part => {
      if (!perPart.has(part)) perPart.set(part, { part_number: part, active: 0, needs_evidence: 0, rejected: 0, related_items: 0 });
      return perPart.get(part);
    };

    // 1. Collect unique listings and their part relations.
    const byItem = new Map();
    for (const candidate of candidates) {
      const part = PartNormalizer.normalizePartNumber(candidate.part_number);
      if (!part) continue;
      for (const offer of (Array.isArray(candidate.existing) ? candidate.existing : [])) {
        const itemId = offer?.item_id || offer?.itemId;
        if (typeof itemId !== 'string' || !itemId) {
          stats.invalid_candidates++;
          continue;
        }
        stats.processed_candidates++;
        const marketplace = String(offer.marketplace || offer.marketplaceId || 'EBAY_DE').toUpperCase();
        if (!byItem.has(itemId)) {
          byItem.set(itemId, {
            item_id: itemId,
            marketplace,
            offers: [],
            parts: new Map()
          });
        }
        const entry = byItem.get(itemId);
        if (!entry.parts.has(part)) {
          entry.parts.set(part, { candidate, offer });
        } else {
          // Same listing for the same part: keep the first, remember the duplicate.
          entry.offers.push(offer);
        }
        if (!relations.has(itemId)) relations.set(itemId, { item_id: itemId, marketplace, part_numbers: new Set() });
        relations.get(itemId).part_numbers.add(part);
        ensurePart(part).related_items++;
      }
    }
    stats.unique_items = byItem.size;

    const classificationFor = candidate => this.engine.classifyPart(candidate.part_number, [{
      part_number: candidate.part_number,
      description: candidate.description,
      category: candidate.category,
      models: candidate.models
    }]);

    // 2. One evidence resolution per unique listing.
    for (const entry of byItem.values()) {
      const relatedParts = [...entry.parts.keys()];
      let detail = this.evidenceRegistry ? this.evidenceRegistry.get(entry.item_id) : null;
      let evidenceSource = detail ? 'REGISTRY' : null;
      if (detail) stats.get_item_reused++;
      if (!detail && runCache.has(entry.item_id)) {
        detail = runCache.get(entry.item_id);
        evidenceSource = 'RUN_CACHE';
        stats.get_item_reused++;
      }
      let unavailable = false;
      if (!detail && live && this.apiClient && typeof this.apiClient.getItem === 'function') {
        if (stats.get_item_requests >= maxGetItems) {
          stats.deferred_get_items++;
        } else {
          stats.get_item_requests++;
          if (this.batchDelayMs > 0) await this.sleepFn(this.batchDelayMs);
          const res = await this.apiClient.getItem(entry.item_id, { marketplace: entry.marketplace });
          if (res && res.success && res.item) {
            stats.get_item_network_calls++;
            detail = res.item;
            evidenceSource = 'GET_ITEM';
            runCache.set(entry.item_id, detail);
            if (this.evidenceRegistry) this.evidenceRegistry.record(entry.item_id, detail);
          } else {
            const error = res?.errors?.[0] || 'GET_ITEM_FAILED';
            if (UNAVAILABLE_PATTERN.test(error)) {
              unavailable = true;
              stats.item_unavailable++;
            }
          }
        }
      }

      if (unavailable && live && allowSearchFallback) {
        for (const part of relatedParts) {
          stats.search_fallbacks++;
          const candidate = entry.parts.get(part).candidate;
          const res = await this.engine.processBatch([part], {
            maxItems: 1,
            knownParts: [{ part_number: part, description: candidate.description, category: candidate.category, models: candidate.models }],
            evidenceRegistry: this.evidenceRegistry,
            enrich: true
          });
          accepted.push(...res.active_offers);
          needsEvidence.push(...res.review_offers);
          rejected.push(...res.rejected_offers);
          const bucket = ensurePart(part);
          bucket.active += res.active_offers.length;
          bucket.needs_evidence += res.review_offers.length;
          bucket.rejected += res.rejected_offers.length;
        }
        continue;
      }

      for (const part of relatedParts) {
        const { candidate, offer } = entry.parts.get(part);
        const classification = classificationFor(candidate);
        const baseItem = {
          ...offer,
          marketplace: entry.marketplace,
          related_part_numbers: relatedParts
        };
        const baseline = this.engine.evaluateOffer(baseItem, part, classification);
        const finalItem = detail ? { ...baseItem, item_detail: detail } : baseItem;
        const verdict = detail ? this.engine.evaluateOffer(finalItem, part, classification) : baseline;

        if (verdict.decision === 'ACCEPT') {
          const offerOut = {
            part_number: part,
            related_part_numbers: relatedParts,
            marketplace: entry.marketplace,
            marketplaceId: entry.marketplace,
            ...verdict.offer
          };
          accepted.push(offerOut);
          ensurePart(part).active++;
          if (detail && baseline.decision !== 'ACCEPT') stats.evidence_completed++;
        } else if (verdict.decision === 'REVIEW') {
          needsEvidence.push({
            part_number: part,
            related_part_numbers: relatedParts,
            marketplace: entry.marketplace,
            item_id: entry.item_id,
            ...verdict.offer,
            reason_codes: verdict.reason_codes,
            status: OFFER_STATUSES.NEEDS_EVIDENCE,
            enrichment: {
              attempted: Boolean(detail),
              source: evidenceSource,
              evidence_reused: evidenceSource === 'REGISTRY' || evidenceSource === 'RUN_CACHE'
            }
          });
          ensurePart(part).needs_evidence++;
        } else {
          rejected.push({
            part_number: part,
            item_id: entry.item_id,
            marketplace: entry.marketplace,
            primary_reason: verdict.first_blocking_step,
            reason_codes: verdict.reason_codes,
            status: OFFER_STATUSES.REJECTED
          });
          ensurePart(part).rejected++;
        }
      }
    }

    return {
      ...stats,
      accepted,
      needs_evidence: needsEvidence,
      rejected,
      per_part: [...perPart.values()],
      item_relations: [...relations.values()].map(rel => ({ ...rel, part_numbers: [...rel.part_numbers] }))
    };
  }
}
